#!/usr/bin/env node
// =============================================================================
// PulseOS MCP Server — Exposes PulseOS apps and data as MCP tools
// Pure Node.js, no npm dependencies. Communicates via stdio (JSON-RPC 2.0).
// Uses PulseOS HTTP API (localhost:3000) for all operations.
// =============================================================================

const http = require('http');
const readline = require('readline');

const PULSEOS_URL = process.env.PULSEOS_URL || 'http://localhost:3000';

// ── HTTP Helper ──
function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PULSEOS_URL);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', e => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Tool Implementations ──
const toolHandlers = {
  async pulseos_list_apps() {
    const data = await apiCall('GET', '/api/apps');
    return { apps: (data.apps || []).map(a => ({ id: a.id, name: a.name, icon: a.icon, description: a.description, installed: a.installed })) };
  },

  async pulseos_read_data({ appId, dataFile }) {
    if (!appId || !dataFile) return { error: 'appId and dataFile required' };
    return apiCall('GET', `/app/${appId}/api/${dataFile}`);
  },

  async pulseos_write_data({ appId, dataFile, data }) {
    if (!appId || !dataFile || !data) return { error: 'appId, dataFile, and data required' };
    const result = await apiCall('PUT', `/app/${appId}/api/${dataFile}`, data);
    // Trigger SSE notification so apps update live
    await apiCall('POST', '/api/notify-change', { appId, file: dataFile + '.json' });
    return { ok: true, ...result };
  },

  async pulseos_run_graph({ graphId }) {
    if (!graphId) return { error: 'graphId required' };
    return apiCall('POST', `/api/graph-run`, { graphId });
  },

  async pulseos_open_app({ appId }) {
    if (!appId) return { error: 'appId required' };
    return { message: `Open http://localhost:3000/app/${appId}/ in browser`, url: `${PULSEOS_URL}/app/${appId}/`, appId };
  },

  async pulseos_search_apps({ query }) {
    const data = await apiCall('GET', '/api/apps');
    const q = (query || '').toLowerCase();
    const matches = (data.apps || []).filter(a =>
      a.name?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)
    );
    return { results: matches.map(a => ({ id: a.id, name: a.name, description: a.description })) };
  },

  async pulseos_list_graphs() {
    return apiCall('GET', '/api/graphs');
  },

  async pulseos_get_context() {
    return apiCall('GET', '/api/agent-context');
  },

  async pulseos_send_chat({ message }) {
    if (!message) return { error: 'message required' };
    return apiCall('POST', '/api/chat-mirror', { from: 'agent', text: message, source: 'mcp' });
  },

  async pulseos_create_app({ name, description, icon, color }) {
    if (!name) return { error: 'name required' };
    return apiCall('POST', '/api/apps/create', { name, description: description || '', icon: icon || name[0], color: color || '#1a2a3a' });
  }
};

// ── Tool Definitions ──
const TOOLS = [
  { name: 'pulseos_list_apps', description: 'List all installed PulseOS apps with their IDs, names, and descriptions', inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: 'pulseos_read_data', description: 'Read JSON data from a PulseOS app (e.g. notes, tasks, calendar events)', inputSchema: { type: 'object', properties: { appId: { type: 'string', description: 'App ID (e.g. "notes", "tasks", "calendar")' }, dataFile: { type: 'string', description: 'Data file name without .json (e.g. "notes", "tasks", "calendar")' } }, required: ['appId', 'dataFile'] } },
  { name: 'pulseos_write_data', description: 'Write JSON data to a PulseOS app. Triggers live update in the dashboard.', inputSchema: { type: 'object', properties: { appId: { type: 'string', description: 'App ID' }, dataFile: { type: 'string', description: 'Data file name without .json' }, data: { type: 'object', description: 'JSON data to write' } }, required: ['appId', 'dataFile', 'data'] } },
  { name: 'pulseos_run_graph', description: 'Execute a PulseOS graph workflow by ID', inputSchema: { type: 'object', properties: { graphId: { type: 'string', description: 'Graph ID (e.g. "morning-briefing")' } }, required: ['graphId'] } },
  { name: 'pulseos_open_app', description: 'Get URL to open a PulseOS app in the dashboard', inputSchema: { type: 'object', properties: { appId: { type: 'string', description: 'App ID' } }, required: ['appId'] } },
  { name: 'pulseos_search_apps', description: 'Search PulseOS apps by name or description', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] } },
  { name: 'pulseos_list_graphs', description: 'List all PulseOS graph workflows', inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: 'pulseos_get_context', description: 'Get full PulseOS context including apps, APIs, and recent activity', inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: 'pulseos_send_chat', description: 'Send a message to the PulseOS dashboard chat', inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Message text to send' } }, required: ['message'] } },
  { name: 'pulseos_create_app', description: 'Create a new PulseOS app with name, description, icon, and color', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'App name' }, description: { type: 'string', description: 'App description' }, icon: { type: 'string', description: 'Single character icon' }, color: { type: 'string', description: 'Hex color code' } }, required: ['name'] } }
];

// ── JSON-RPC 2.0 over stdio ──
const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', async line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }); }

  // Notifications (no id) — just acknowledge
  if (msg.method === 'notifications/initialized' || !msg.id) return;

  if (msg.method === 'initialize') {
    return send({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'pulseos', version: '1.0.0' }
    }});
  }

  if (msg.method === 'tools/list') {
    return send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
  }

  if (msg.method === 'tools/call') {
    const handler = toolHandlers[msg.params?.name];
    if (!handler) return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unknown tool: ' + msg.params?.name } });
    try {
      const result = await handler(msg.params?.arguments || {});
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true } });
    }
    return;
  }

  send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unknown method: ' + msg.method } });
});

rl.on('close', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.stderr.write('[pulseos-mcp] Server started\n');
