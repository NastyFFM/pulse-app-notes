// ══════════════════════════════════════════════════════════
//  PulseOS Node App Template
//  Alle Graph-Infrastruktur ist fertig verdrahtet.
//  Nur die Abschnitte mit markiert müssen angepasst werden.
// ══════════════════════════════════════════════════════════

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3050');
const PULSE_URL = process.env.PULSE_URL || 'http://localhost:3000';

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── App State ─────────────────────────────────────────────
let state = {
  id: process.env.APP_ID || 'REPLACE_ID',
  status: 'running',
  data: {},
  lastOutput: null
};

const sseClients = new Set();

// ══════════════════════════════════════════════════════════
//  PulseOS Pflicht-Endpoints (nicht aendern)
// ══════════════════════════════════════════════════════════

// GET /api/state — PulseOS liest L1-Snapshot
app.get('/api/state', (req, res) => res.json(state));

// POST /api/action — PulseOS sendet Graph-Inputs, Pulse, Konfiguration
app.post('/api/action', async (req, res) => {
  const { type, inputName, data } = req.body;

  switch (type) {
    case 'graph-input':
      await handleInput(inputName, data);
      break;
    case 'pulse':
      await onPulse(data);
      break;
    case 'set-state':
      Object.assign(state.data, data);
      broadcastSSE({ type: 'state-update', state });
      break;
    case 'configure':
      break;
  }

  res.json({ ok: true });
});

// GET /api/events — PulseOS subscribt fuer Live-Updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ type: 'connected', appId: state.id })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ══════════════════════════════════════════════════════════
//  Graph-Infrastruktur-Helpers (nicht aendern)
// ══════════════════════════════════════════════════════════

function emit(outputName, data) {
  state.lastOutput = { name: outputName, data, timestamp: Date.now() };
  broadcastSSE({ type: 'graph-output', name: outputName, data });
  console.log(`[emit] ${outputName}:`, JSON.stringify(data).slice(0, 80));
}

async function callApp(appId, actionType, data) {
  const res = await fetch(`${PULSE_URL}/api/apps/${appId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: actionType, data })
  });
  if (!res.ok) throw new Error(`callApp ${appId} failed: ${res.status}`);
  return res.json();
}

async function getAppState(appId) {
  const res = await fetch(`${PULSE_URL}/api/apps/${appId}/state`);
  return res.json();
}

async function reportStatus(text) {
  state.status = text;
  broadcastSSE({ type: 'state-update', state });
  await fetch(`${PULSE_URL}/api/apps/${state.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  }).catch(() => {});
}

function broadcastSSE(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(msg); } catch {}
  });
}

// ══════════════════════════════════════════════════════════
//  App-Logik — hier schreiben
// ══════════════════════════════════════════════════════════

async function handleInput(inputName, data) {
  console.log(`[input] ${inputName}:`, data);
  // Deine Input-Verarbeitung hier
}

async function onPulse(pulseData) {
  console.log('[pulse]', pulseData?.type || 'manual');
  await reportStatus('Laeuft...');

  try {
    const result = { example: 'data', timestamp: Date.now() };
    emit('output', result);
    await reportStatus('Fertig');
  } catch (err) {
    await reportStatus('Fehler: ' + err.message);
    console.error(err);
  }
}

// ── Start ─────────────────────────────────────────────────
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`[PulseOS App] ${state.id} running on port ${PORT}`);
});
