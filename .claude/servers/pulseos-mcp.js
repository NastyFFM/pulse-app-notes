#!/usr/bin/env node
// PulseOS MCP Server — Universal Meta-Tool
// Ein Tool für alle PulseOS-Aktionen. App-Liste dynamisch.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const http = require('http');
const { z } = require('zod');

const PULSEOS_URL = process.env.PULSEOS_URL || 'http://localhost:3000';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PULSEOS_URL);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { 'Content-Type': 'application/json' }, timeout: 5000 };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const ACTIONS = {
  list_apps: 'Alle installierten Apps auflisten',
  read: 'App-Daten lesen (braucht app + dataFile)',
  write: 'App-Daten schreiben + Live-Update (braucht app + dataFile + payload)',
  search: 'Apps nach Name suchen (braucht query)',
  run_graph: 'Graph-Workflow ausfuehren (braucht graphId)',
  list_graphs: 'Alle Graph-Workflows auflisten',
  get_context: 'PulseOS Kontext: Apps, APIs, aktuelle Aktivitaet',
  send_chat: 'Nachricht ans Dashboard senden (braucht message)',
  create_app: 'Neue App erstellen (braucht name)',
  get_tunnel: 'Aktuelle Tunnel/Share-URL abrufen (fuer externe Zugriffe)'
};

const server = new McpServer({ name: 'pulseos', version: '2.0.0' });

server.tool(
  'pulseos',
  'Universal PulseOS Tool — Zugriff auf alle Apps, Daten, Graphen und Chat. Actions: ' + Object.keys(ACTIONS).join(', '),
  {
    action: z.enum(Object.keys(ACTIONS)).describe('Aktion: ' + Object.entries(ACTIONS).map(([k,v]) => k + ' = ' + v).join('; ')),
    app: z.string().optional().describe('App-ID (z.B. "notes", "tasks", "calendar") — fuer read/write'),
    dataFile: z.string().optional().describe('Daten-Datei ohne .json (z.B. "notes", "tasks") — fuer read/write'),
    payload: z.any().optional().describe('JSON-Daten zum Schreiben — fuer write'),
    graphId: z.string().optional().describe('Graph-ID — fuer run_graph'),
    query: z.string().optional().describe('Suchbegriff — fuer search'),
    message: z.string().optional().describe('Nachricht — fuer send_chat'),
    name: z.string().optional().describe('App-Name — fuer create_app'),
    description: z.string().optional().describe('Beschreibung — fuer create_app'),
    icon: z.string().optional().describe('Icon — fuer create_app'),
    color: z.string().optional().describe('Farbe — fuer create_app')
  },
  async (params) => {
    try {
      let result;
      switch (params.action) {
        case 'list_apps': {
          const data = await api('GET', '/api/apps');
          result = (data.apps || []).map(a => ({ id: a.id, name: a.name, icon: a.icon, description: a.description, installed: a.installed !== false }));
          break;
        }
        case 'read': {
          if (!params.app || !params.dataFile) return { content: [{ type: 'text', text: 'Fehler: app und dataFile sind Pflicht fuer read' }] };
          result = await api('GET', `/app/${params.app}/api/${params.dataFile}`);
          break;
        }
        case 'write': {
          if (!params.app || !params.dataFile || !params.payload) return { content: [{ type: 'text', text: 'Fehler: app, dataFile und payload sind Pflicht fuer write' }] };
          await api('PUT', `/app/${params.app}/api/${params.dataFile}`, params.payload);
          await api('POST', '/api/notify-change', { appId: params.app, file: params.dataFile + '.json' });
          result = { ok: true, message: 'Geschrieben + Live-Update getriggert' };
          break;
        }
        case 'search': {
          const data = await api('GET', '/api/apps');
          const q = (params.query || '').toLowerCase();
          result = (data.apps || []).filter(a => a.name?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q))
            .map(a => ({ id: a.id, name: a.name, description: a.description }));
          break;
        }
        case 'run_graph': {
          if (!params.graphId) return { content: [{ type: 'text', text: 'Fehler: graphId ist Pflicht' }] };
          result = await api('POST', '/api/graph-run', { graphId: params.graphId });
          break;
        }
        case 'list_graphs': {
          result = await api('GET', '/api/graphs');
          break;
        }
        case 'get_context': {
          result = await api('GET', '/api/agent-context');
          break;
        }
        case 'send_chat': {
          if (!params.message) return { content: [{ type: 'text', text: 'Fehler: message ist Pflicht' }] };
          await api('POST', '/api/chat-mirror', { from: 'agent', text: params.message, source: 'mcp' });
          result = { ok: true };
          break;
        }
        case 'create_app': {
          if (!params.name) return { content: [{ type: 'text', text: 'Fehler: name ist Pflicht' }] };
          result = await api('POST', '/api/apps/create', { name: params.name, description: params.description || '', icon: params.icon || params.name[0], color: params.color || '#1a2a3a' });
          break;
        }
        case 'get_tunnel': {
          result = await api('GET', '/api/tunnel');
          break;
        }
        default:
          result = { error: 'Unbekannte Aktion: ' + params.action, verfuegbar: Object.keys(ACTIONS) };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'PulseOS Server nicht erreichbar: ' + e.message + '\nStelle sicher dass PulseOS laeuft (node server.js auf Port 3000)' }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
