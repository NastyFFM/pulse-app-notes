# PulseOS — Phase 13: React-Apps & App-Graph
## Implementierungsdokument für den KI-Entwickler

> **Ausgangslage:** Phase 1–12 sind abgeschlossen. PulseOS hat einen funktionierenden Context-Engine mit Vanilla-Apps (einzelne HTML-Dateien in `apps/<name>/index.html`), einem `app`-Widget-Typ mit L0/L1/L2, und dem PulseOS-Bridge-Protokoll (postMessage). Es gibt noch **keine React/Node-Apps** und **kein Graph-System**. Beides wird in dieser Phase neu gebaut.
>
> **Technische Grundregeln (unverändert):** Kein npm im PulseOS-Hauptrepo. Kein Express. Vanilla JS im Frontend. `server.js` als Single Node.js HTTP Server. SSE für Realtime.

---

## Was neu gebaut wird

```
Phase 13a — manifest.json          Einheitlicher Vertrag für alle App-Typen
Phase 13b — React/Node-App-Support Externe Apps mit eigenem Prozess/Repo
Phase 13c — Process Manager        Node-Prozesse starten/stoppen in server.js
Phase 13d — App-Graph              Producer → Transformer → Consumer + Datenfluss
Phase 13e — Pulse-Engine           Auslöser-System (Timer, Events, Webhooks)
Phase 13f — pulse CLI              Kommandozeile für App- und Graph-Management
Phase 13g — MCP-Server             Claude Code spricht direkt mit dem Graph
Phase 13h — Graph-UI               Visueller Editor im Projects-Frontend
```

---

## Phase 13a — manifest.json

### Das Konzept

Heute kennt PulseOS seine Apps über `data/apps.json`. Jede App bekommt jetzt zusätzlich eine eigene `manifest.json` in ihrem Verzeichnis. Das Manifest ist der **einzige Vertrag** den PulseOS über eine App kennen muss — egal ob Vanilla oder React.

### Verzeichnisstruktur danach

```
~/pulse/                              ← PulseOS Hauptrepo (ein Git-Repo, kein npm)
│
├── apps/                             ← Nur Vanilla-Apps
│   ├── news-fetcher/
│   │   ├── index.html
│   │   └── manifest.json             ← NEU
│   ├── tetris/
│   │   ├── index.html
│   │   └── manifest.json             ← NEU
│   └── ...                           ← Alle bestehenden Apps bekommen manifest.json
│
├── data/
│   ├── app-registry.json             ← NEU: ersetzt/erweitert apps.json
│   ├── graphs/                       ← NEU: Graph-Definitionen pro Projekt
│   │   └── graph-<projectId>.json
│   └── ...
│
├── bin/
│   └── pulse.js                      ← NEU: CLI
│
├── mcp/
│   └── pulse-mcp-server.js           ← NEU: MCP-Server
│
└── server.js / dashboard.html / ...  ← unverändert (wird erweitert)

~/pulse-workspace/                    ← NEU: Externes Verzeichnis, NICHT im Repo
│
├── trading-dashboard/                ← Eigenes Git-Repo (React/Node)
│   ├── .git/
│   ├── package.json
│   ├── manifest.json                 ← Gleiches Format!
│   └── src/
│
└── community-analytics/              ← Von GitHub geklont
    ├── .git/
    ├── manifest.json
    └── src/
```

**Warum `~/pulse-workspace/` außerhalb des Repos?**
`node_modules/` würde das PulseOS-Repo vermüllen. React-Apps wollen eigene Git-Histories. Sie können unabhängig von PulseOS deployed werden.

### manifest.json Format — Vanilla App

```json
{
  "id": "news-fetcher",
  "name": "News Fetcher",
  "version": "1.0.0",
  "type": "vanilla",
  "description": "Holt aktuelle News von Google News",
  "icon": "📰",
  "category": "productivity",

  "nodeType": "producer",
  "inputs": [],
  "outputs": [
    { "name": "articles", "schema": "link" }
  ],
  "pulseSubscriptions": ["clock:30m"],

  "repo": null,
  "source": "local"
}
```

### manifest.json Format — React/Node App

```json
{
  "id": "trading-dashboard",
  "name": "Trading Dashboard",
  "version": "1.0.0",
  "type": "node",
  "description": "Echtzeit-Charts für Handelsdaten",
  "icon": "📈",
  "category": "finance",

  "start": "npm run dev",
  "build": "npm run build",
  "port": 3047,
  "env": { "PORT": "3047" },

  "nodeType": "consumer",
  "inputs": [
    { "name": "prices", "schema": "metric" }
  ],
  "outputs": [],
  "pulseSubscriptions": [],

  "repo": "https://github.com/username/trading-dashboard",
  "source": "external",
  "workspacePath": "~/pulse-workspace/trading-dashboard"
}
```

### Neue Felder im Überblick

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `type` | `"vanilla"` \| `"node"` | App-Typ |
| `nodeType` | `"producer"` \| `"transformer"` \| `"consumer"` | Rolle im Graph |
| `inputs` | Array | Welche Daten die App empfangen kann |
| `outputs` | Array | Welche Daten die App produziert |
| `pulseSubscriptions` | Array | Auf welche Pulse-Signale die App reagiert |
| `start` | String \| null | Start-Befehl (nur Node-Apps) |
| `port` | Number \| null | HTTP-Port (nur Node-Apps) |
| `workspacePath` | String \| null | Pfad auf der Platte (nur externe Apps) |
| `repo` | String \| null | Git-Repo-URL |

### Migration: apps.json → app-registry.json

Ein Migrationsskript (`scripts/migrate-to-manifest.js`) läuft einmalig:

1. Liest alle Einträge aus `data/apps.json`
2. Erstellt `manifest.json` in jedem App-Verzeichnis
3. Schreibt `data/app-registry.json` als neue zentrale Registry

`data/app-registry.json`:
```json
{
  "apps": [
    {
      "id": "news-fetcher",
      "type": "vanilla",
      "path": "./apps/news-fetcher",
      "status": "active",
      "pid": null,
      "port": null
    },
    {
      "id": "trading-dashboard",
      "type": "node",
      "path": "~/pulse-workspace/trading-dashboard",
      "status": "stopped",
      "pid": null,
      "port": 3047,
      "repo": "https://github.com/username/trading-dashboard"
    }
  ]
}
```

**Server-API (server.js erweitern):**
- `GET /api/app-registry` — alle Apps aus Registry
- `GET /api/app-registry/:id` — einzelne App inkl. Status
- `POST /api/app-registry` — neue App registrieren
- `DELETE /api/app-registry/:id` — App entfernen

---

## Phase 13b — React/Node App Support

### Was eine React/Node App implementieren MUSS

Damit PulseOS mit einer Node-App sprechen kann, muss sie genau **drei HTTP-Endpoints** bereitstellen. Das ist der minimale Pflicht-Contract — alles andere ist frei.

```javascript
// Pflicht-Endpoint 1: GET /api/state
// Gibt aktuellen App-Zustand zurück (L1-Daten für PulseOS)
app.get('/api/state', (req, res) => {
  res.json({
    id: 'my-app-id',
    status: 'running',
    data: { /* app-spezifische Daten */ },
    lastOutput: null   // letzter Graph-Output, falls Producer
  });
});

// Pflicht-Endpoint 2: POST /api/action
// Empfängt Aktionen von PulseOS (Graph-Input, Konfiguration, Pulse)
app.post('/api/action', express.json(), (req, res) => {
  const { type, data } = req.body;
  // type kann sein: 'graph-input' | 'pulse' | 'configure'
  switch (type) {
    case 'graph-input':
      handleInput(data);
      break;
    case 'pulse':
      triggerUpdate();
      break;
  }
  res.json({ ok: true });
});

// Pflicht-Endpoint 3: GET /api/events  (Server-Sent Events)
// PulseOS subscribt hier für Live-Updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Wenn App einen Output produziert:
  onOutput((outputData) => {
    sendEvent({ type: 'graph-output', name: 'articles', data: outputData });
  });

  req.on('close', () => cleanup());
});
```

---

## Phase 13b-Template — Vollständige Template-Apps

`pulse app create <id> --type vanilla` und `pulse app create <id> --type node` kopieren diese Templates. Sie sind keine Beschreibungen — sie sind **sofort lauffähige, vollständige Dateien** die alle Graph-Infrastruktur eingebaut haben.

### Template 1: Vanilla App

**`templates/app-vanilla/manifest.json`**
```json
{
  "id": "REPLACE_ID",
  "name": "REPLACE_NAME",
  "version": "1.0.0",
  "type": "vanilla",
  "description": "",
  "icon": "📦",
  "category": "productivity",

  "nodeType": "producer",
  "inputs": [],
  "outputs": [
    { "name": "output", "schema": "record" }
  ],
  "pulseSubscriptions": ["manual"],

  "repo": null,
  "source": "local"
}
```

**`templates/app-vanilla/index.html`** — vollständige, lauffähige Datei:
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Template</title>
  <style>
    /* ── Reset & Base ─────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #111110;
      --surface:  #1a1a17;
      --border:   rgba(255,255,255,0.08);
      --text:     #e8e6de;
      --muted:    #7a7870;
      --accent:   #e85d24;
      --success:  #1d9e75;
      --radius:   8px;
      --font:     system-ui, -apple-system, sans-serif;
      --mono:     'Menlo', 'Monaco', monospace;
    }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      line-height: 1.6;
      padding: 16px;
      min-height: 100vh;
    }

    /* ── L0 / L1 / L2 Views ──────────────────────── */
    /* PulseOS setzt data-zoom="L0"|"L1"|"L2" auf <body> */
    body[data-zoom="L0"] .l1-only,
    body[data-zoom="L0"] .l2-only { display: none; }

    body[data-zoom="L1"] .l0-only,
    body[data-zoom="L1"] .l2-only { display: none; }

    body[data-zoom="L2"] .l0-only,
    body[data-zoom="L2"] .l1-only { display: none; }

    /* ── Layout ───────────────────────────────────── */
    .app-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .app-title { font-weight: 600; font-size: 15px; }
    .app-status {
      margin-left: auto;
      font-size: 11px;
      font-family: var(--mono);
      color: var(--muted);
    }
    .app-status.active { color: var(--success); }

    .content { /* Dein Inhalt hier */ }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .btn:hover { border-color: rgba(255,255,255,0.2); }
    .btn.primary { background: var(--accent); border-color: var(--accent); }

    /* L0: kompakter Status-Chip */
    .l0-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .l0-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--muted);
    }
    .l0-dot.active { background: var(--success); }
  </style>
</head>
<body data-zoom="L1">

  <!-- ── L0 View: Kompakter Chip ─────────────────── -->
  <div class="l0-only">
    <div class="l0-status">
      <span class="l0-dot" id="l0-dot"></span>
      <span id="l0-label">Bereit</span>
    </div>
  </div>

  <!-- ── L1 / L2 View: Volle App ─────────────────── -->
  <div class="l1-only l2-only">
    <div class="app-header">
      <span>📦</span>
      <span class="app-title">Meine App</span>
      <span class="app-status" id="status-text">Bereit</span>
    </div>

    <div class="content">
      <!-- ✏️  DEIN INHALT HIER ✏️ -->
      <p style="color:var(--muted); margin-bottom:16px">
        App-Inhalt. Ersetze diesen Block mit deiner Logik.
      </p>

      <button class="btn primary" onclick="run()">▶ Ausführen</button>
    </div>

    <!-- L2: Konfiguration -->
    <div class="l2-only" style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border)">
      <div style="color:var(--muted); font-size:12px; margin-bottom:8px">Konfiguration</div>
      <!-- Optionale Einstellungen nur in L2 -->
    </div>
  </div>

  <script>
    // ══════════════════════════════════════════════
    //  PulseOS Graph-Infrastruktur
    //  Dieser Block nicht ändern — nur nutzen
    // ══════════════════════════════════════════════

    // Zoom-Level vom parent empfangen
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'set-zoom') {
        document.body.dataset.zoom = e.data.zoom; // 'L0' | 'L1' | 'L2'
      }

      // Graph-Input empfangen
      if (e.data?.type === 'app-input') {
        handleInput(e.data.inputName, e.data.data);
      }

      // Pulse-Signal empfangen
      if (e.data?.type === 'pulse') {
        onPulse(e.data.data);
      }
    });

    // Output an nächste App im Graph senden
    function emit(outputName, data) {
      parent.postMessage({ type: 'graph-output', outputName, data }, '*');
      setStatus(`Output gesendet: ${outputName}`);
    }

    // Status in L0-Badge + L1-Header setzen
    function setStatus(text, active = false) {
      const s = document.getElementById('status-text');
      const d = document.getElementById('l0-dot');
      const l = document.getElementById('l0-label');
      if (s) s.textContent = text;
      if (l) l.textContent = text;
      if (d) d.className = 'l0-dot' + (active ? ' active' : '');
      // Auch an PulseOS melden (für L1-Widget-Header)
      parent.postMessage({ type: 'status', text }, '*');
    }

    // State persistent speichern (server.js schreibt apps/<id>/state.json)
    async function saveState(data) {
      await fetch(`/api/apps/${getAppId()}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set-state', data })
      });
    }

    // State laden (von server.js)
    async function loadState() {
      const res = await fetch(`/api/apps/${getAppId()}/state`);
      const { data } = await res.json();
      return data;
    }

    function getAppId() {
      // PulseOS setzt data-app-id auf dem iframe oder als URL-Parameter
      return document.body.dataset.appId
        || new URLSearchParams(location.search).get('appId')
        || 'unknown';
    }

    // Andere App im Graph direkt ansprechen (via PulseOS server)
    async function callApp(appId, actionType, data) {
      const res = await fetch(`/api/apps/${appId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: actionType, data })
      });
      return res.json();
    }

    // State einer anderen App lesen
    async function getAppState(appId) {
      const res = await fetch(`/api/apps/${appId}/state`);
      return res.json();
    }

    // ══════════════════════════════════════════════
    //  App-Logik — hier schreiben
    // ══════════════════════════════════════════════

    // Wird aufgerufen wenn ein Graph-Input ankommt
    function handleInput(inputName, data) {
      console.log('Input empfangen:', inputName, data);
      // ✏️ Hier verarbeiten und ggf. emit() aufrufen
    }

    // Wird aufgerufen wenn ein Pulse-Signal ankommt
    function onPulse(pulseData) {
      console.log('Pulse:', pulseData.type);
      // ✏️ Hier auf Pulse reagieren (z.B. Daten holen, dann emit())
      run();
    }

    // Haupt-Funktion — von Button oder Pulse aufgerufen
    async function run() {
      setStatus('Läuft...', true);

      try {
        // ✏️ DEINE LOGIK HIER
        const result = { example: 'data', timestamp: Date.now() };

        // Ergebnis an nächste App im Graph senden
        emit('output', result);
        setStatus('Fertig ✓', false);

      } catch (err) {
        setStatus('Fehler: ' + err.message, false);
        console.error(err);
      }
    }

    // Init
    async function init() {
      const state = await loadState();
      // ✏️ State wiederherstellen falls nötig
      setStatus('Bereit');
    }

    init();
  </script>
</body>
</html>
```

---

### Template 2: Node/React App

**`templates/app-node/manifest.json`**
```json
{
  "id": "REPLACE_ID",
  "name": "REPLACE_NAME",
  "version": "1.0.0",
  "type": "node",
  "description": "",
  "icon": "📦",
  "category": "productivity",

  "start": "node src/server.js",
  "build": null,
  "port": 3050,
  "env": { "PORT": "3050" },

  "nodeType": "producer",
  "inputs": [],
  "outputs": [
    { "name": "output", "schema": "record" }
  ],
  "pulseSubscriptions": ["manual"],

  "repo": null,
  "source": "local"
}
```

**`templates/app-node/package.json`**
```json
{
  "name": "REPLACE_ID",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

**`templates/app-node/.gitignore`**
```
node_modules/
.env
dist/
*.log
```

**`templates/app-node/src/server.js`** — vollständige, lauffähige Datei:
```javascript
// ══════════════════════════════════════════════════════════
//  PulseOS Node App Template
//  Alle Graph-Infrastruktur ist fertig verdrahtet.
//  Nur die Abschnitte mit ✏️ müssen angepasst werden.
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
  data: {},           // ✏️ Deine App-Daten hier
  lastOutput: null
};

const sseClients = new Set();

// ══════════════════════════════════════════════════════════
//  PulseOS Pflicht-Endpoints (nicht ändern)
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
      // ✏️ Optionale Konfiguration hier verarbeiten
      break;
  }

  res.json({ ok: true });
});

// GET /api/events — PulseOS subscribt für Live-Updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ type: 'connected', appId: state.id })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ══════════════════════════════════════════════════════════
//  Graph-Infrastruktur-Helpers (nicht ändern)
// ══════════════════════════════════════════════════════════

// Output an nächste App im Graph senden
// PulseOS server.js empfängt das über /api/apps/:id/events und routet weiter
function emit(outputName, data) {
  state.lastOutput = { name: outputName, data, timestamp: Date.now() };
  broadcastSSE({ type: 'graph-output', name: outputName, data });
  console.log(`[emit] ${outputName}:`, JSON.stringify(data).slice(0, 80));
}

// Andere App im Graphen ansprechen (via PulseOS server)
async function callApp(appId, actionType, data) {
  const res = await fetch(`${PULSE_URL}/api/apps/${appId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: actionType, data })
  });
  if (!res.ok) throw new Error(`callApp ${appId} failed: ${res.status}`);
  return res.json();
}

// State einer anderen App lesen
async function getAppState(appId) {
  const res = await fetch(`${PULSE_URL}/api/apps/${appId}/state`);
  return res.json();
}

// Status an PulseOS melden (erscheint im L1-Widget-Header)
async function reportStatus(text) {
  state.status = text;
  broadcastSSE({ type: 'state-update', state });
  await fetch(`${PULSE_URL}/api/apps/${state.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  }).catch(() => {}); // ignorieren wenn PulseOS nicht läuft
}

function broadcastSSE(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(msg); } catch {}
  });
}

// ══════════════════════════════════════════════════════════
//  App-Logik — ✏️ hier schreiben
// ══════════════════════════════════════════════════════════

// Wird aufgerufen wenn ein Graph-Input ankommt
async function handleInput(inputName, data) {
  console.log(`[input] ${inputName}:`, data);

  // ✏️ Input verarbeiten
  // Beispiel: Daten transformieren und weitergeben
  // const result = transform(data);
  // emit('output', result);
}

// Wird aufgerufen wenn ein Pulse-Signal ankommt
async function onPulse(pulseData) {
  console.log('[pulse]', pulseData?.type || 'manual');
  await reportStatus('Läuft...');

  try {
    // ✏️ DEINE LOGIK HIER
    // Beispiel: Daten holen und als Output senden
    const result = { example: 'data', timestamp: Date.now() };
    emit('output', result);

    await reportStatus('Fertig ✓');
  } catch (err) {
    await reportStatus('Fehler: ' + err.message);
    console.error('[error]', err);
  }
}

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[${state.id}] running on port ${PORT}`);
});

// Graceful shutdown: PulseOS sendet SIGTERM beim Stop
process.on('SIGTERM', () => {
  console.log(`[${state.id}] shutting down`);
  sseClients.forEach(c => c.end());
  process.exit(0);
});
```

**`templates/app-node/public/index.html`** — optionales Frontend:
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>App</title>
  <style>
    body { font-family: system-ui; background: #111; color: #e8e6de;
           margin: 0; padding: 16px; font-size: 14px; }
    #status { color: #7a7870; font-size: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <h2>Node App</h2>
  <div id="output">Warte auf Daten...</div>
  <div id="status">Verbinde...</div>

  <script>
    // Verbindung zu eigenem SSE-Stream
    const es = new EventSource('/api/events');

    es.onopen = () => {
      document.getElementById('status').textContent = 'Verbunden';
    };

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === 'graph-output') {
        document.getElementById('output').textContent =
          JSON.stringify(event.data, null, 2);
      }

      if (event.type === 'state-update') {
        document.getElementById('status').textContent = event.state.status;
      }
    };
  </script>
</body>
</html>
```

---

## Phase 13b-CLI — CLI & MCP innerhalb von Apps nutzen

Apps können den `pulse` CLI und die PulseOS API direkt nutzen — nicht nur PulseOS steuert Apps, sondern Apps können auch untereinander kommunizieren.

### Vanilla App: Andere Apps ansprechen

Vanilla-Apps haben keinen direkten Netzwerkzugriff zu anderen Apps, aber sie sprechen über den PulseOS-Server als Proxy. Das ist bereits im Template eingebaut:

```javascript
// Im Vanilla-App-Script (template bereits fertig verdrahtet):

// Andere App ansprechen
await callApp('my-display-app', 'graph-input', { text: 'Hello' });

// State einer anderen App lesen
const state = await getAppState('news-fetcher');
console.log(state.lastOutput);
```

### Node App: CLI-Befehle ausführen

Eine Node-App kann den `pulse` CLI via `child_process` aufrufen — nützlich für Orchestrierung:

```javascript
// In einer Node-App die andere Apps verwalten muss:
import { execSync } from 'child_process';

// Andere App starten
execSync('pulse app start data-processor');

// Graph-Verbindung zur Laufzeit erstellen
execSync(`pulse graph connect ${appId} output display-app input --project ${projectId}`);

// Andere App direkt pulsieren
execSync(`pulse fire data-processor`);
```

### Node App: MCP-Client für KI-gesteuerte Orchestrierung

Eine Node-App kann einen MCP-Client einbinden und damit die KI zur Laufzeit Entscheidungen treffen lassen:

```javascript
// In einer Transformer-App die KI-Entscheidungen braucht:
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function askKIWhichAppToRoute(data) {
  const client = new Client({ name: 'my-app', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../../mcp/pulse-mcp-server.js']
  });
  await client.connect(transport);

  // Graph-Zustand abfragen
  const graph = await client.callTool('graph_show', { projectId: currentProjectId });

  // Auf Basis der Daten entscheiden wohin routen
  // (Oder: claude -p aufrufen für semantische Entscheidung)
  await client.close();
}
```

**Wann CLI, wann MCP, wann direkte API?**

| Situation | Empfehlung |
|-----------|-----------|
| App braucht State einer anderen App | Direkte API: `GET /api/apps/:id/state` |
| App sendet Output an nächsten Knoten | `emit()` / `broadcastSSE({ type: 'graph-output' })` |
| App muss andere App starten/stoppen | CLI: `execSync('pulse app start ...')` |
| App braucht KI-Entscheidung zur Laufzeit | MCP-Client oder `claude -p` spawn |
| App ändert Graph-Struktur zur Laufzeit | CLI oder MCP: `pulse graph connect ...` |

---

## Phase 13c — Process Manager (in server.js)

`server.js` bekommt einen **Process Manager** der Node-App-Prozesse verwaltet. Kein externes Tool, kein pm2 — Node.js `child_process` reicht.

### Neuer Code-Block in server.js

```javascript
// ── PROCESS MANAGER ──────────────────────────────────────

const runningProcesses = new Map(); // appId → { process, port, pid }

function resolveWorkspacePath(rawPath) {
  return rawPath.replace('~', process.env.HOME);
}

async function startNodeApp(appId) {
  const registry = loadAppRegistry();
  const entry = registry.apps.find(a => a.id === appId);
  if (!entry || entry.type !== 'node') throw new Error(`Not a node app: ${appId}`);

  const manifest = loadManifest(appId);
  const cwd = resolveWorkspacePath(entry.path);

  const env = { ...process.env, ...(manifest.env || {}), PORT: String(manifest.port) };
  const [cmd, ...args] = manifest.start.split(' ');

  const proc = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', d => console.log(`[${appId}] ${d}`));
  proc.stderr.on('data', d => console.error(`[${appId}] ${d}`));
  proc.on('exit', code => {
    console.log(`[${appId}] exited with code ${code}`);
    runningProcesses.delete(appId);
    updateRegistryStatus(appId, 'stopped');
  });

  runningProcesses.set(appId, { process: proc, port: manifest.port, pid: proc.pid });
  updateRegistryStatus(appId, 'starting', proc.pid);

  // Warten bis Port antwortet (max 30s)
  await waitForPort(manifest.port, 30000);
  updateRegistryStatus(appId, 'running');

  return { pid: proc.pid, port: manifest.port };
}

function stopNodeApp(appId) {
  const entry = runningProcesses.get(appId);
  if (!entry) return false;
  entry.process.kill('SIGTERM');
  runningProcesses.delete(appId);
  updateRegistryStatus(appId, 'stopped');
  return true;
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`http://localhost:${port}/api/state`);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error(`App on port ${port} did not start within ${timeoutMs}ms`);
}

// ── APP-API PROXY ─────────────────────────────────────────

// Für Node-Apps: Requests an die App weiterleiten
async function proxyToNodeApp(appId, method, path, body) {
  const manifest = loadManifest(appId);
  const url = `http://localhost:${manifest.port}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

// ── NEUE ENDPOINTS ────────────────────────────────────────

// POST /api/apps/:id/start
// POST /api/apps/:id/stop
// GET  /api/apps/:id/state  → proxy für node, direkt für vanilla
// POST /api/apps/:id/action → proxy für node, PulseOS-Runtime für vanilla
```

### Vanilla App Runtime

Vanilla-Apps haben keinen eigenen Prozess. Ihr State lebt in `server.js`:

```javascript
// Vanilla-App State: in Memory + persistiert in apps/<id>/state.json
const vanillaStates = new Map();

function getVanillaState(appId) {
  if (!vanillaStates.has(appId)) {
    const statePath = `apps/${appId}/state.json`;
    const state = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
      : { data: {}, lastOutput: null };
    vanillaStates.set(appId, state);
  }
  return vanillaStates.get(appId);
}

function setVanillaState(appId, updates) {
  const state = getVanillaState(appId);
  Object.assign(state, updates);
  fs.writeFileSync(`apps/${appId}/state.json`, JSON.stringify(state, null, 2));
  broadcastSSE({ type: 'app-state-update', appId, state });
}
```

---

## Phase 13d — App-Graph System

### Konzept

Ein Graph ist eine **Liste von Verbindungen** zwischen Apps in einem Projekt. Wenn App A einen Output produziert, empfängt App B ihn als Input — direkt, ohne KI-Zwischenschicht.

```
[Producer A] ──articles──► [Transformer B] ──summary──► [Consumer C]
```

### Graph-Datei

`data/graphs/graph-<projectId>.json`:
```json
{
  "projectId": "ctx-news-project",
  "nodes": [
    { "appId": "news-fetcher",    "nodeType": "producer" },
    { "appId": "ai-summarizer",   "nodeType": "transformer" },
    { "appId": "morning-display", "nodeType": "consumer" }
  ],
  "edges": [
    {
      "from":       { "appId": "news-fetcher",  "output": "articles" },
      "to":         { "appId": "ai-summarizer", "input": "articles" }
    },
    {
      "from":       { "appId": "ai-summarizer",  "output": "summary" },
      "to":         { "appId": "morning-display", "input": "content" }
    }
  ]
}
```

### Graph Router in server.js

```javascript
// ── GRAPH ROUTER ──────────────────────────────────────────

function loadGraph(projectId) {
  const path = `data/graphs/graph-${projectId}.json`;
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// Wenn App einen Output produziert: an alle verbundenen Apps weiterleiten
async function routeOutput(projectId, fromAppId, outputName, data) {
  const graph = loadGraph(projectId);
  if (!graph) return;

  const targets = graph.edges
    .filter(e => e.from.appId === fromAppId && e.from.output === outputName)
    .map(e => ({ appId: e.to.appId, input: e.to.input }));

  for (const target of targets) {
    await sendInputToApp(target.appId, target.input, data);
    console.log(`Graph: ${fromAppId}.${outputName} → ${target.appId}.${target.input}`);
  }
}

// Input an eine App senden (egal ob vanilla oder node)
async function sendInputToApp(appId, inputName, data) {
  const manifest = loadManifest(appId);
  const action = { type: 'graph-input', inputName, data };

  if (manifest.type === 'node') {
    // Node-App hat eigenen HTTP-Server
    await proxyToNodeApp(appId, 'POST', '/api/action', action);
  } else {
    // Vanilla-App: via SSE in den iframe
    broadcastSSE({ type: 'app-input', appId, inputName, data });
    // Der iframe-listener in PulseOS Bridge empfängt das und ruft PulseOS.onInput() callbacks
  }
}

// ── GRAPH-API ENDPOINTS ───────────────────────────────────

// GET  /api/graphs/:projectId          → Graph laden
// POST /api/graphs/:projectId          → Graph speichern
// POST /api/graphs/:projectId/connect  → Kante hinzufügen
// DELETE /api/graphs/:projectId/connect → Kante entfernen
// POST /api/graphs/:projectId/run      → Graph manuell triggern (alle Producer pulsieren)
```

### Vanilla-App Bridge erweitern (PulseOS Bridge)

Die bestehende Bridge aus Phase 12 bekommt drei neue Methoden:

```javascript
// Wird in jeden Vanilla-App-iframe injiziert (bestehend + neue Felder)
window.PulseOS = {
  // Bereits vorhanden (Phase 12):
  reportStatus: ...,
  logInteraction: ...,

  // NEU: Graph-Output senden
  emit: (outputName, data) => {
    parent.postMessage({ type: 'graph-output', outputName, data }, '*');
    // server.js empfängt das via Bridge-Message-Handler und ruft routeOutput()
  },

  // NEU: Graph-Input empfangen
  onInput: (inputName, callback) => {
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'app-input' && e.data.inputName === inputName) {
        callback(e.data.data);
      }
    });
  },

  // NEU: Auf Pulse reagieren
  onPulse: (callback) => {
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'pulse') callback(e.data);
    });
  }
};
```

---

## Phase 13e — Pulse-Engine

### Was ein Pulse ist

Ein Pulse ist ein **Auslösesignal** das Producer-Apps weckt. Die Pulse-Engine läuft in `server.js` als Hintergrund-System.

### Pulse-Typen

| Typ | Format | Beispiel |
|-----|--------|---------|
| Clock | `clock:30m` `clock:1h` `clock:daily@08:00` | Alle 30 Minuten |
| Manual | `manual` | User drückt Button |
| Webhook | `webhook:<token>` | Externer HTTP-Call |
| Graph-Event | automatisch | Output von App A triggert App B |

### Pulse-Engine in server.js

```javascript
// ── PULSE ENGINE ──────────────────────────────────────────

const pulseIntervals = new Map(); // subscriptionKey → intervalId

function startPulseEngine() {
  const registry = loadAppRegistry();

  for (const entry of registry.apps) {
    const manifest = loadManifest(entry.id);
    if (!manifest.pulseSubscriptions) continue;

    for (const sub of manifest.pulseSubscriptions) {
      registerPulseSubscription(entry.id, sub);
    }
  }

  console.log('Pulse engine started');
}

function parseClockSchedule(sub) {
  // 'clock:daily@08:00' → { type:'daily', msUntilFirst, interval:86400000 }
  if (sub.includes('daily@')) {
    const [h, m] = sub.split('@')[1].split(':').map(Number);
    const now = new Date();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return { type: 'daily', msUntilFirst: next - now, interval: 86400000 };
  }
  // 'clock:30m' | 'clock:1h' | 'clock:10s'
  const match = sub.match(/clock:(\d+)(m|h|s)/);
  if (!match) return { type: 'interval', interval: 3600000 };
  const [, n, unit] = match;
  return { type: 'interval', interval: parseInt(n) * { s: 1000, m: 60000, h: 3600000 }[unit] };
}

function registerPulseSubscription(appId, subscription) {
  if (!subscription.startsWith('clock:')) return;
  const key = `${appId}:${subscription}`;
  if (pulseIntervals.has(key)) clearInterval(pulseIntervals.get(key));

  const schedule = parseClockSchedule(subscription);
  const fire = () => fireAppPulse(appId, { type: subscription, timestamp: Date.now() });

  if (schedule.type === 'daily') {
    // Erstes Mal zum exakten Zeitpunkt, danach täglich
    const t = setTimeout(() => {
      fire();
      pulseIntervals.set(key, setInterval(fire, schedule.interval));
    }, schedule.msUntilFirst);
    pulseIntervals.set(key, t);
  } else {
    pulseIntervals.set(key, setInterval(fire, schedule.interval));
  }
}

async function fireAppPulse(appId, pulseData) {
  console.log(`Pulse → ${appId}:`, pulseData.type);
  const manifest = loadManifest(appId);

  if (manifest.type === 'node') {
    await proxyToNodeApp(appId, 'POST', '/api/action', { type: 'pulse', data: pulseData });
  } else {
    // Vanilla: SSE in iframe
    broadcastSSE({ type: 'pulse', appId, data: pulseData });
  }
}

// Webhook-Endpoint: POST /api/pulse/webhook/:token
// Manual-Endpoint:  POST /api/pulse/fire/:appId
```

---

## Phase 13f — `pulse` CLI

`bin/pulse.js` — ein einzelnes Node.js-Script, global verfügbar via `npm link` oder Symlink.

```bash
ln -sf ~/pulse/bin/pulse.js /usr/local/bin/pulse
chmod +x ~/pulse/bin/pulse.js
```

### Alle Befehle

```bash
# App-Lifecycle
pulse app start <id>              # Startet App (node: Prozess, vanilla: bereits aktiv)
pulse app stop <id>               # Stoppt Node-App-Prozess
pulse app restart <id>            # Stop + Start
pulse app status <id>             # Status, PID, Port, Uptime
pulse app list                    # Alle registrierten Apps
pulse app list --running          # Nur laufende

# App-Installation
pulse app install github.com/pulseos/apps/pomodoro     # Offiziell, eine App
pulse app install github.com/anna/pulse-apps           # Persönliches Repo, alle Apps
pulse app install github.com/anna/pulse-apps/tracker   # Persönliches Repo, eine App
pulse app install <localPath>     # Lokalen Pfad registrieren
pulse app uninstall <id>          # Aus Registry entfernen (Dateien bleiben)
pulse app update <id>             # git pull + npm install

# App erstellen
pulse app create <id> --type vanilla   # Scaffold in apps/<id>/
pulse app create <id> --type node      # Scaffold in ~/pulse-workspace/<id>/

# App-Interaktion (unified — egal ob vanilla oder node)
pulse app call <id> state              # State abrufen
pulse app call <id> action '{"type":"pulse"}'  # Aktion senden

# Graph-Management
pulse graph show <projectId>           # Graph anzeigen
pulse graph connect <fromApp> <fromOutput> <toApp> <toInput> --project <id>
pulse graph disconnect <fromApp> <toApp> --project <id>
pulse graph run <projectId>            # Alle Producer manuell pulsieren

# Pulse-System
pulse fire <appId>                     # App manuell einmal pulsieren
pulse fire project:<projectId>         # Alle Apps im Graphen pulsieren
```

### Distributions-Modell & Vertrauen

**Zwei Ebenen:**

`github.com/pulseos/apps` — offizielles Repo, vom Core-Team kuratiert und gereviewed. Vanilla- und Node-Apps. Das ist die vertrauenswürdige Quelle.

Jeder Entwickler hat sein **eigenes persönliches Repo** mit beliebig vielen Apps darin:

```
github.com/anna/pulse-apps/
├── README.md
├── news-fetcher/
│   ├── index.html
│   └── manifest.json
├── habit-tracker/
│   ├── index.html
│   └── manifest.json
└── trading-dashboard/      ← Node-App
    ├── package.json
    ├── manifest.json
    └── src/
```

Teilen funktioniert per Link — Anna schickt einem Freund:
```
github.com/anna/pulse-apps/news-fetcher
```
Der Freund installiert genau diese eine App. Vertrauen liegt beim User — aber der Code ist offen und lesbar.

**Install-Formate die `pulse app install` versteht:**
```bash
# Ganzes Repo (alle Apps darin installieren)
pulse app install github.com/anna/pulse-apps

# Einzelne App aus einem Repo (Sub-Pfad)
pulse app install github.com/anna/pulse-apps/news-fetcher

# Offizielles Repo
pulse app install github.com/pulseos/apps/pomodoro

# Lokaler Pfad
pulse app install ./my-local-app

# Git-URL direkt (eigenes Repo, eine App)
pulse app install https://github.com/anna/single-app.git
```

### Wie `pulse app install` funktioniert

```javascript
async function installApp(source) {
  const workspacePath = path.join(os.homedir(), 'pulse-workspace');

  // Quelle parsen: ist es ein Sub-Pfad (Repo/App-Name)?
  const parsed = parseInstallSource(source);
  // parsed = { repoUrl, subPath, appName }
  // z.B. "github.com/anna/pulse-apps/news-fetcher"
  //   → { repoUrl: "https://github.com/anna/pulse-apps", subPath: "news-fetcher", appName: "news-fetcher" }

  const repoDir = path.join(workspacePath, `repo-${parsed.repoName}`);

  if (!fs.existsSync(repoDir)) {
    // Repo noch nicht lokal — klonen
    execSync(`git clone ${parsed.repoUrl} ${repoDir}`);
  } else {
    // Repo existiert bereits — nur pullen
    execSync('git pull', { cwd: repoDir });
  }

  // App-Verzeichnis bestimmen
  const appDir = parsed.subPath
    ? path.join(repoDir, parsed.subPath)   // Sub-Pfad: nur diese App
    : repoDir;                             // Ganzes Repo: erstes manifest.json

  // Wenn kein Sub-Pfad: alle App-Verzeichnisse im Repo finden
  const appDirs = parsed.subPath
    ? [appDir]
    : findAppDirs(repoDir); // alle Unterverzeichnisse mit manifest.json

  const installed = [];

  for (const dir of appDirs) {
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Node-Apps: npm install
    if (manifest.type === 'node') {
      execSync('npm install', { cwd: dir });
    }

    // Vanilla-Apps: in apps/ kopieren (im PulseOS-Repo)
    if (manifest.type === 'vanilla') {
      const dest = path.join(__dirname, '..', 'apps', manifest.id);
      fs.cpSync(dir, dest, { recursive: true });
    }

    // In Registry eintragen
    await fetch('http://localhost:3000/api/app-registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: manifest.id,
        type: manifest.type,
        path: manifest.type === 'vanilla'
          ? `./apps/${manifest.id}`
          : dir,
        repo: parsed.repoUrl,
        source: source
      })
    });

    console.log(`✓ Installed: ${manifest.name} (${manifest.id})`);
    installed.push(manifest);
  }

  return installed;
}

function parseInstallSource(source) {
  // Normalisieren: github.com/... → https://github.com/...
  if (!source.startsWith('http') && !source.startsWith('/') && !source.startsWith('.')) {
    source = `https://${source}`;
  }

  // Lokaler Pfad
  if (source.startsWith('/') || source.startsWith('.')) {
    const name = path.basename(source);
    return { repoUrl: source, repoName: name, subPath: null, appName: name, isLocal: true };
  }

  // GitHub Sub-Pfad: https://github.com/anna/pulse-apps/news-fetcher
  const url = new URL(source);
  const parts = url.pathname.split('/').filter(Boolean); // ['anna', 'pulse-apps', 'news-fetcher']

  if (parts.length >= 3) {
    // Hat Sub-Pfad
    const repoPath = `/${parts[0]}/${parts[1]}`;
    const subPath = parts.slice(2).join('/');
    return {
      repoUrl: `${url.origin}${repoPath}`,
      repoName: `${parts[0]}-${parts[1]}`,
      subPath,
      appName: parts[parts.length - 1],
      isLocal: false
    };
  }

  // Ganzes Repo: https://github.com/anna/pulse-apps
  return {
    repoUrl: source.replace(/\.git$/, ''),
    repoName: `${parts[0]}-${parts[1]}`,
    subPath: null,
    appName: parts[1],
    isLocal: false
  };
}

function findAppDirs(repoDir) {
  // Alle direkten Unterverzeichnisse mit manifest.json
  return fs.readdirSync(repoDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(repoDir, d.name))
    .filter(d => fs.existsSync(path.join(d, 'manifest.json')));
}
```

---

## Phase 13g — MCP-Server

Claude Code kann über diesen MCP-Server direkt mit PulseOS sprechen — ohne manuelles CLI.

```javascript
// mcp/pulse-mcp-server.js
// Wird gestartet mit: node mcp/pulse-mcp-server.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PULSE_URL = 'http://localhost:3000';
const api = (path, opts) => fetch(`${PULSE_URL}${path}`, opts).then(r => r.json());

const server = new McpServer({ name: 'pulse', version: '1.0.0' });

// Tool 1: App-Liste
server.tool('app_list', {
  filter: z.enum(['all', 'running', 'vanilla', 'node']).default('all')
}, async ({ filter }) => {
  const data = await api('/api/app-registry');
  const apps = filter === 'all' ? data.apps : data.apps.filter(a => {
    if (filter === 'running') return a.status === 'running';
    return a.type === filter;
  });
  return { content: [{ type: 'text', text: JSON.stringify(apps, null, 2) }] };
});

// Tool 2: App starten
server.tool('app_start', {
  appId: z.string()
}, async ({ appId }) => {
  const result = await api(`/api/apps/${appId}/start`, { method: 'POST' });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

// Tool 3: App-State lesen
server.tool('app_get_state', {
  appId: z.string()
}, async ({ appId }) => {
  const state = await api(`/api/apps/${appId}/state`);
  return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
});

// Tool 4: Aktion senden
server.tool('app_send_action', {
  appId: z.string(),
  type: z.string(),
  data: z.record(z.unknown()).optional()
}, async ({ appId, type, data }) => {
  const result = await api(`/api/apps/${appId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data })
  });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

// Tool 5: App installieren
server.tool('app_install', {
  source: z.string().describe('Git-Repo URL oder lokaler Pfad')
}, async ({ source }) => {
  const result = await api('/api/apps/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source })
  });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

// Tool 6: Graph-Verbindung erstellen
server.tool('graph_connect', {
  projectId: z.string(),
  fromApp: z.string(),
  fromOutput: z.string(),
  toApp: z.string(),
  toInput: z.string()
}, async ({ projectId, fromApp, fromOutput, toApp, toInput }) => {
  const result = await api(`/api/graphs/${projectId}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromApp, fromOutput, toApp, toInput })
  });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

// Tool 7: Graph anzeigen
server.tool('graph_show', {
  projectId: z.string()
}, async ({ projectId }) => {
  const graph = await api(`/api/graphs/${projectId}`);
  return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
});

// Tool 8: Manuell pulsieren
server.tool('pulse_fire', {
  appId: z.string()
}, async ({ appId }) => {
  const result = await api(`/api/pulse/fire/${appId}`, { method: 'POST' });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

`.mcp.json` im PulseOS-Root:
```json
{
  "mcpServers": {
    "pulse": {
      "command": "node",
      "args": ["mcp/pulse-mcp-server.js"]
    }
  }
}
```

---

## Phase 13h — Graph-UI im Frontend

Im `apps/projects/index.html` (Context-UI) kommt ein **Graph-Tab** neben dem Canvas.

### UI-Konzept

```
[ Canvas ]  [ Graph ]  [ Chat ]         ← Tab-Leiste im Context

Graph-Tab-Layout:
┌──────────────────────────────────────────┐
│  + App hinzufügen    ▶ Graph ausführen   │
├──────────────────────────────────────────┤
│                                          │
│  [📰 News Fetcher]  ──────►  [📋 Display]│
│     Producer                  Consumer  │
│     Pulse: 30min                        │
│                                          │
│  Klick auf Verbindung → löschen         │
│  Klick auf App → L0/L1/L2 togglen      │
│                                          │
└──────────────────────────────────────────┘
```

### Minimal-Implementierung (Vanilla JS, kein Framework)

```javascript
// In apps/projects/index.html — neuer Tab: renderGraphTab()

function renderGraphTab(projectId) {
  const graph = await loadGraph(projectId); // GET /api/graphs/:projectId
  const apps  = await loadAppRegistry();    // GET /api/app-registry

  const html = `
    <div class="graph-toolbar">
      <button onclick="showAddAppToGraph('${projectId}')">+ App hinzufügen</button>
      <button onclick="runGraph('${projectId}')">▶ Ausführen</button>
    </div>
    <div class="graph-canvas" id="graph-canvas">
      ${renderGraphNodes(graph, apps)}
      ${renderGraphEdges(graph)}
    </div>
  `;

  document.getElementById('tab-graph').innerHTML = html;
  initGraphDragConnect(); // Drag-to-connect zwischen Nodes
}

function renderGraphNodes(graph, apps) {
  return graph.nodes.map(node => {
    const app = apps.find(a => a.id === node.appId);
    const manifest = app?.manifest || {};
    return `
      <div class="graph-node ${node.nodeType}"
           data-app-id="${node.appId}"
           style="left:${node.x||100}px; top:${node.y||100}px">
        <div class="node-icon">${manifest.icon || '📦'}</div>
        <div class="node-name">${manifest.name || node.appId}</div>
        <div class="node-type">${node.nodeType}</div>
        <div class="node-status" id="status-${node.appId}">●</div>
        ${manifest.outputs?.map(o =>
          `<div class="output-port" data-output="${o.name}">${o.name}</div>`
        ).join('') || ''}
        ${manifest.inputs?.map(i =>
          `<div class="input-port" data-input="${i.name}">${i.name}</div>`
        ).join('') || ''}
      </div>
    `;
  }).join('');
}

async function connectNodes(fromApp, fromOutput, toApp, toInput, projectId) {
  await fetch(`/api/graphs/${projectId}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromApp, fromOutput, toApp, toInput })
  });
  renderGraphTab(projectId); // neu rendern
}
```

### SSE-Updates im Graph-Tab

Live-Status der Nodes (läuft/gestoppt, letzter Output):

```javascript
// SSE-Listener in apps/projects/index.html erweitern
eventSource.addEventListener('app-state-update', (e) => {
  const { appId, state } = JSON.parse(e.data);
  const statusEl = document.getElementById(`status-${appId}`);
  if (statusEl) {
    statusEl.className = `node-status ${state.status}`;
    statusEl.title = state.status;
  }
});

eventSource.addEventListener('graph-output', (e) => {
  const { fromAppId, outputName, toAppId } = JSON.parse(e.data);
  // Kante kurz aufblinken lassen
  flashEdge(fromAppId, toAppId);
});
```

---

## Neue Dateien — Übersicht

```
NEUE DATEIEN:
bin/pulse.js                           CLI
mcp/pulse-mcp-server.js                MCP-Server
scripts/migrate-to-manifest.js         Einmalige Migration
data/app-registry.json                 Ersetzt/erweitert apps.json
data/graphs/                           Verzeichnis für Graph-Dateien
apps/<n>/manifest.json                 Für jede bestehende App (Migration)
apps/<n>/state.json                    Vanilla-App-State (auto-generiert)
templates/app-vanilla/index.html       Vollständiges Vanilla-Template
templates/app-vanilla/manifest.json
templates/app-node/src/server.js       Vollständiges Node-Template
templates/app-node/public/index.html
templates/app-node/manifest.json
templates/app-node/package.json
templates/app-node/.gitignore

GEÄNDERTE DATEIEN:
server.js                              +Process Manager, +Graph Router, +Pulse Engine,
                                       +Vanilla Runtime, +neue API-Endpoints,
                                       +graph Actions im Context-Chat
apps/projects/index.html               +Graph-Tab, +Bridge-Erweiterung
```

---

## Graph-Node-Positionen

Die (x, y) Koordinaten der Nodes im visuellen Graph-Editor werden in der Graph-Datei gespeichert — sonst springen Nodes beim Reload auf Startpositionen zurück.

```json
{
  "projectId": "ctx-news-project",
  "nodes": [
    { "appId": "news-fetcher",    "nodeType": "producer",    "x": 80,  "y": 120 },
    { "appId": "ai-summarizer",   "nodeType": "transformer", "x": 340, "y": 120 },
    { "appId": "morning-display", "nodeType": "consumer",    "x": 600, "y": 120 }
  ],
  "edges": [...]
}
```

Node-Drag im Graph-Tab speichert sofort via `PUT /api/graphs/:projectId` (debounced 500ms). Beim ersten Hinzufügen berechnet server.js eine Startposition (letzter Node + 260px rechts).

---

## Error-Handling: Node-App crasht mid-Graph

```javascript
// In server.js — Process Manager:
proc.on('exit', (code, signal) => {
  runningProcesses.delete(appId);
  updateRegistryStatus(appId, 'stopped');
  broadcastSSE({ type: 'app-crashed', appId, code, timestamp: Date.now() });

  // Auto-Restart falls manifest.autoRestart: true und kein sauberer Exit
  const manifest = loadManifest(appId);
  if (manifest.autoRestart && code !== 0) {
    setTimeout(() => startNodeApp(appId).catch(console.error), 5000);
  }
});

// Wenn routeOutput() eine App nicht erreicht:
async function sendInputToApp(appId, inputName, data) {
  try {
    // ... bestehende Logik
  } catch (err) {
    broadcastSSE({ type: 'graph-routing-error', toApp: appId, error: err.message });
    // Graph-Tab zeigt rote Kante + Fehler-Toast
  }
}
```

`manifest.json` optionales Feld: `"autoRestart": true`

---

## KI ↔ Graph-Integration

Die KI im Context-Chat baut und verändert Graphen über dieselben API-Endpoints die der User nutzt — kein Sonderweg.

### Neue Actions im Context-Chat (server.js erweitern)

```javascript
case 'create-graph-node': {
  const graph = loadGraph(action.projectId) || { projectId: action.projectId, nodes: [], edges: [] };
  const lastX = graph.nodes.reduce((max, n) => Math.max(max, n.x || 0), 0);
  graph.nodes.push({ appId: action.appId, nodeType: action.nodeType, x: lastX + 260, y: 120 });
  saveGraph(action.projectId, graph);
  broadcastSSE({ type: 'graph-updated', projectId: action.projectId });
  break;
}

case 'connect-graph-nodes': {
  const graph = loadGraph(action.projectId);
  graph.edges.push({
    from: { appId: action.fromApp, output: action.fromOutput },
    to:   { appId: action.toApp,   input:  action.toInput }
  });
  saveGraph(action.projectId, graph);
  broadcastSSE({ type: 'graph-updated', projectId: action.projectId });
  break;
}

case 'set-pulse': {
  const manifest = loadManifest(action.appId);
  manifest.pulseSubscriptions = action.subscriptions;
  saveManifest(action.appId, manifest);
  action.subscriptions.forEach(sub => registerPulseSubscription(action.appId, sub));
  break;
}

case 'install-app': {
  const installed = await installApp(action.source);
  broadcastSSE({ type: 'app-installed', apps: installed });
  break;
}
```

### KI-Prompt Ergänzungen (buildContextPrompt)

```
## App-Registry
${registryApps.map(a =>
  `- ${a.id} (${a.manifest.nodeType}): outputs=[${outputs}] inputs=[${inputs}]`
).join('\n')}

## Aktueller Graph
${JSON.stringify(currentGraph, null, 2)}

## Graph-Actions die du nutzen kannst
- create-graph-node:  { projectId, appId, nodeType }
- connect-graph-nodes: { projectId, fromApp, fromOutput, toApp, toInput }
- set-pulse:          { appId, subscriptions }  z.B. ["clock:30m"] oder ["clock:daily@08:00"]
- install-app:        { source }  z.B. "github.com/anna/pulse-apps/news-fetcher"

## Regeln
- Verbinde nur kompatible schemas (oder 'record' als universeller Typ)
- Producer brauchen pulseSubscriptions wenn sie periodisch laufen sollen
- 'manual' wenn der User manuell triggert
```

### Beispiel: User baut Graph per Chat

```
User: "Zeig mir jeden Morgen um 8 Uhr die aktuellen Tech-News zusammengefasst"

KI Actions (sequenziell):
1. create-graph-node  { appId: "news-fetcher",    nodeType: "producer"     }
2. set-pulse          { appId: "news-fetcher",    subscriptions: ["clock:daily@08:00"] }
3. create-graph-node  { appId: "ai-summarizer",   nodeType: "transformer"  }
4. create-graph-node  { appId: "morning-display", nodeType: "consumer"     }
5. connect-graph-nodes { fromApp: "news-fetcher",  fromOutput: "articles",
                         toApp:   "ai-summarizer", toInput:    "articles"   }
6. connect-graph-nodes { fromApp: "ai-summarizer",  fromOutput: "summary",
                         toApp:   "morning-display", toInput:   "content"   }

→ Graph läuft ab sofort autonom.
```

---
## Reihenfolge der Implementierung

```
13a Manifest + Migration       ← Fundament, erst das           ✅ FERTIG
        │
        ▼
13b Node-App Scaffold + Templates  ← App-Vorlagen erstellen    🔧 AKTUELL
        │
        ▼
13c Process Manager            ← Damit Node-Apps starten/stoppen  🔲
        │
        ▼
13d Graph Router               ← Datenfluss zwischen Apps      🔲
        │
        ├──► 13e Pulse Engine  ← Gleichzeitig mit Graph möglich 🔲
        │
        ▼
13f CLI                        ← Alles oben benutzbar machen   🔲
        │
        ▼
13g Graph-UI                   ← Visueller Editor              🔲
        │
        ▼
13h MCP-Server (optional)      ← Entscheidung ob nötig         🔲❓
```

---

## Implementierungs-Status

> **Aktueller Stand:** Phase 13a ✅ → Phase 13b 🔧
> **Letzte Aktualisierung:** 2026-03-18

### Phase 13a — manifest.json + Migration ✅
- [x] manifest.json Schema definiert (siehe oben)
- [x] Migrationsskript `scripts/migrate-to-manifest.js` erstellt
- [x] manifest.json für alle 44 bestehenden Apps generiert
- [x] `data/app-registry.json` erstellt (44 Apps)
- [x] Server-API: `GET /api/app-registry` (mit Manifest-Enrichment)
- [x] Server-API: `GET /api/app-registry/:id`
- [x] Server-API: `POST /api/app-registry` (Upsert)
- [x] Server-API: `DELETE /api/app-registry/:id`
- [x] `jsonRes()` erweitert mit optionalem Status-Code Parameter

### Phase 13b — Node-App Scaffold + Templates
- [ ] `templates/app-vanilla/` mit index.html + manifest.json
- [ ] `templates/app-node/` mit src/server.js + package.json + manifest.json + public/index.html
- [ ] Vanilla-Template: `PulseOS.emit()`, `PulseOS.onInput()`, `PulseOS.onPulse()`, `saveState()`, `loadState()`
- [ ] Node-Template: 3 Pflicht-Endpoints (`/api/state`, `/api/action`, `/api/events`)
- [ ] Node-Template: `emit()`, `callApp()`, `getAppState()`, `reportStatus()`

### Phase 13c — Process Manager
- [ ] `startNodeApp(appId)` in server.js (child_process.spawn)
- [ ] `stopNodeApp(appId)` mit SIGTERM
- [ ] `waitForPort()` — wartet max 30s bis App antwortet
- [ ] Registry-Status Updates (starting/running/stopped)
- [ ] Crash-Detection → `app-crashed` SSE
- [ ] `autoRestart` Support
- [ ] Vanilla-App State Runtime (in-memory + state.json)
- [ ] `POST /api/apps/:id/start` + `POST /api/apps/:id/stop`
- [ ] `GET /api/apps/:id/state` (unified vanilla + node)
- [ ] `POST /api/apps/:id/action` (proxy für node, runtime für vanilla)

### Phase 13d — Graph Router
- [ ] `data/graphs/` Verzeichnis
- [ ] Graph-Datei Format: nodes + edges + x/y-Positionen
- [ ] `loadGraph(projectId)` + `saveGraph()`
- [ ] `routeOutput(projectId, fromAppId, outputName, data)`
- [ ] `sendInputToApp(appId, inputName, data)` — unified vanilla + node
- [ ] PulseOS Bridge erweitern: `PulseOS.emit()`, `PulseOS.onInput()`, `PulseOS.onPulse()`
- [ ] Graph-API: `GET /api/graphs/:projectId`
- [ ] Graph-API: `POST /api/graphs/:projectId`
- [ ] Graph-API: `POST /api/graphs/:projectId/connect`
- [ ] Graph-API: `DELETE /api/graphs/:projectId/connect`
- [ ] Graph-API: `POST /api/graphs/:projectId/run`
- [ ] Graph-Routing-Fehler → SSE

### Phase 13e — Pulse Engine
- [ ] `parseClockSchedule()` — clock:30m, clock:1h, clock:daily@08:00
- [ ] `registerPulseSubscription(appId, subscription)`
- [ ] `fireAppPulse(appId, pulseData)` — unified vanilla + node
- [ ] `startPulseEngine()` beim Server-Start
- [ ] `POST /api/pulse/fire/:appId` — manueller Trigger
- [ ] `POST /api/pulse/webhook/:token` — externer Webhook

### Phase 13f — CLI (`bin/pulse.js`)
- [ ] `pulse app list` / `pulse app list --running`
- [ ] `pulse app start <id>` / `pulse app stop <id>`
- [ ] `pulse app create <id> --type vanilla|node`
- [ ] `pulse app install <source>` (GitHub + lokal)
- [ ] `pulse app call <id> state|action`
- [ ] `pulse graph show <projectId>`
- [ ] `pulse graph connect` / `pulse graph disconnect`
- [ ] `pulse graph run <projectId>`
- [ ] `pulse fire <appId>`

### Phase 13g — Graph-UI
- [ ] Graph-Tab in apps/projects/index.html
- [ ] `renderGraphNodes()` + `renderGraphEdges()`
- [ ] Drag-to-connect zwischen Nodes
- [ ] Node-Drag persistiert Position (debounced)
- [ ] SSE-Updates: Node-Status live, Edge-Flash bei Datenfluss
- [ ] "Add App" Dialog
- [ ] "Run Graph" Button
- [ ] KI-Graph-Actions im Context-Chat

### Phase 13h — MCP-Server (optional, Entscheidung später)
- [ ] ❓ Entscheiden ob MCP-Server nötig ist (CLI + API reichen evtl.)
- [ ] Falls ja: `mcp/pulse-mcp-server.js` mit Tools
- [ ] Falls ja: `.mcp.json` Konfiguration
