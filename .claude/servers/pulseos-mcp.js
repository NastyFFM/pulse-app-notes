#!/usr/bin/env node
// PulseOS MCP Server — Official SDK Version
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const http = require('http');
const { z } = require('zod');

const PULSEOS_URL = process.env.PULSEOS_URL || 'http://localhost:3000';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PULSEOS_URL);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', e => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const server = new McpServer({ name: 'pulseos', version: '1.0.0' });

server.tool('pulseos_list_apps', 'List all installed PulseOS apps', {}, async () => {
  const data = await api('GET', '/api/apps');
  const apps = (data.apps || []).map(a => ({ id: a.id, name: a.name, icon: a.icon, description: a.description }));
  return { content: [{ type: 'text', text: JSON.stringify(apps, null, 2) }] };
});

server.tool('pulseos_read_data', 'Read app data JSON', { appId: z.string(), dataFile: z.string() }, async ({ appId, dataFile }) => {
  const data = await api('GET', `/app/${appId}/api/${dataFile}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('pulseos_write_data', 'Write app data + trigger live update', { appId: z.string(), dataFile: z.string(), data: z.any() }, async ({ appId, dataFile, data }) => {
  await api('PUT', `/app/${appId}/api/${dataFile}`, data);
  await api('POST', '/api/notify-change', { appId, file: dataFile + '.json' });
  return { content: [{ type: 'text', text: 'Written to ' + dataFile + '.json' }] };
});

server.tool('pulseos_run_graph', 'Execute a graph workflow', { graphId: z.string() }, async ({ graphId }) => {
  const result = await api('POST', '/api/graph-run', { graphId });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('pulseos_search_apps', 'Search apps by name', { query: z.string() }, async ({ query }) => {
  const data = await api('GET', '/api/apps');
  const q = query.toLowerCase();
  const matches = (data.apps || []).filter(a => a.name?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q));
  return { content: [{ type: 'text', text: JSON.stringify(matches.map(a => ({ id: a.id, name: a.name })), null, 2) }] };
});

server.tool('pulseos_list_graphs', 'List all graph workflows', {}, async () => {
  const data = await api('GET', '/api/graphs');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('pulseos_get_context', 'Get full PulseOS context', {}, async () => {
  const data = await api('GET', '/api/agent-context');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('pulseos_send_chat', 'Send message to dashboard chat', { message: z.string() }, async ({ message }) => {
  const result = await api('POST', '/api/chat-mirror', { from: 'agent', text: message, source: 'mcp' });
  return { content: [{ type: 'text', text: 'Message sent' }] };
});

server.tool('pulseos_create_app', 'Create new PulseOS app', { name: z.string(), description: z.string().optional(), icon: z.string().optional(), color: z.string().optional() }, async ({ name, description, icon, color }) => {
  const result = await api('POST', '/api/apps/create', { name, description: description || '', icon: icon || name[0], color: color || '#1a2a3a' });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
server.connect(transport);
