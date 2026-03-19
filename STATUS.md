# PulseOS — Aktueller Stand
> **Letzte Aktualisierung:** 2026-03-19
> **Branch:** main
> **Session-Einstieg:** Lies dieses Dokument. Es zeigt was gebaut ist, was offen ist, und wo die nächste Session weitermacht.

---

## Projekt-Dokumente

| Datei | Zweck | Lesen? |
|-------|-------|--------|
| `STATUS.md` | **Dieses Dokument** — aktueller Implementierungsstand | ✅ Immer zuerst |
| `VISION.md` | V2 Vision — App-Graph, 3 Säulen, Killer-App-Argumente | Bei Konzeptfragen |
| `PHASE-13-IMPLEMENTATION.md` | Detailplan Phase 13a-h (technische Specs) | Bei Implementierungsfragen |
| `CONTEXT-ENGINE-PLAN.md` | Phase 1-12 (veraltet, nur Referenz) | Nur bei Legacy-Fragen |
| `CLAUDE.md` | Architektur-Überblick, API-Endpoints, Constraints | Bei Server/API-Fragen |

---

## Was ist PulseOS?

Browser-basiertes agentisches OS. Drei Säulen: **Work** (App-Graphen, KI-Workflows), **Fun** (Spiele, Medien, Kreativ-Apps), **Social** (WebRTC-Chat, Contacts). Läuft auf `localhost:3000`, kein npm, Vanilla JS, Single Node.js Server.

---

## Implementierungsstand

### ✅ Abgeschlossen

#### Phase 1-12: Context Engine (Legacy-Basis)
- Context-System, Widgets (todo, kpi, kanban, notes, table, timeline, progress)
- L0/L1/L2 Zoom, dataRef (cross-context references), Scope Chain
- Templates, Dashboard Integration, App-Context Unification
- **Status:** Vollständig, funktioniert, wird durch App-Graph-System ergänzt

#### Phase 13a: manifest.json ✅
- Jede App hat `manifest.json` mit nodeType, inputs, outputs, pulseSubscriptions
- `data/app-registry.json` als zentrale Registry
- API: `GET/POST /api/app-registry`, `GET/DELETE /api/app-registry/:id`
- Migration-Script: `scripts/migrate-to-manifest.js`
- **44 Apps** registriert

#### Phase 13b: React/Node-App-Support ✅
- 3 Pflicht-Endpoints: `/api/state`, `/api/action`, `/api/events`
- Proxy-Routing in server.js für externe Apps
- Vanilla-Apps funktionieren weiterhin unverändert

#### Phase 13c: Process Manager ✅
- `POST /api/apps/:id/start` — Node-Prozess starten
- `POST /api/apps/:id/stop` — Prozess stoppen
- `GET /api/apps/:id/status` — Prozess-Status
- Auto-Port-Zuweisung (4001+)
- Heartbeat + Crash-Detection (Basis)

#### Phase 13d: App-Graph ✅
- Graph-Definitionen in `data/graphs/graph-*.json`
- `routeOutput(appId, outputName, data)` — Datenfluss entlang der Kanten
- SSE `app-input` Events an Consumer-Apps
- Graph CRUD API: `GET/POST /api/graphs`, `GET/PUT/DELETE /api/graphs/:id`
- `POST /api/graphs/:id/edges` — Kanten hinzufügen/entfernen
- KI-Graph-Actions im Context-Chat: `create-graph`, `add-node`, `connect`, `disconnect`

#### Phase 13e: Pulse Engine ✅
- Clock-Subscriptions (`clock:1m`, `clock:30m`, etc.)
- Manual Pulse: `POST /api/pulse/fire/:appId`
- Auto-Routing: Pulse → Producer → routeOutput → Consumer
- Pulse-Status API: `GET /api/pulse/status`

#### Phase 13f: pulse CLI ✅
- `pulse app list/start/stop/status`
- `pulse graph list/show/connect/disconnect`
- `pulse fire <appId>` — Manual Pulse
- `pulse status` — System-Übersicht

#### Phase 13g: MCP Server ⏸️ Zurückgestellt
- Bewusst übersprungen — CLI + direkte API reichen
- Kann jederzeit als dünner Wrapper nachgebaut werden

#### Phase 13h: Graph-UI ✅
- Tab "Graph" in Projects-App
- Nodes als Karten mit Input/Output-Ports (farbcodiert)
- Edges als SVG-Linien (animated dash für aktive Flows)
- Add-Node Button mit App-Selector
- Drag-to-connect zwischen Ports
- Delete-Edge per Klick

#### UX-Refresh: Dashboard ✅
- Neue Home-Screen mit Greeting, Quick Actions, Recent Contexts, Active Graphs, System Pulse
- Responsive: Desktop (Grid) / Mobile (Stack)
- App-Fenster-System mit Minimize/Maximize/Close
- App-Switcher (offene Apps als Tabs in Topbar)
- Dock entfernt — Navigation über Home Screen + App-Switcher
- Sticky Topbar mit Clock, Share, Live-Status
- `overscroll-behavior:none` gegen Bounce-Effekt
- Scrollbares Dashboard

#### WebRTC & Social ✅
- Share-Button → Tunnel-URL (bore.pub/Railway) + QR-Code
- Reconnect-Bookmark für persistente Tunnel-URLs
- WebRTC DataChannel Chat (Peer-to-Peer)
- Profil-System: Name, Status, Avatar, GitHub Pages URL
- Kontakte: Automatischer Austausch bei Verbindung, persistiert in localStorage
- Kontakt-Anzeige in Topbar

#### Demo-Graphen ✅
- **Quote Pipeline:** quote-generator (clock:1m) → quote-display
- **News Pipeline:** news-fetcher (Hacker News API, real data) → news-display
- End-to-end verifiziert: Pulse → Producer → Graph-Router → Consumer

---

### 🔲 Offen / Nächste Schritte

#### Sofort machbar (Quick Wins)
- [ ] Dashboard Quick-Stats (offene Todos, dringende Items, Projekt-Zähler)
- [ ] AI-Suggestion-Cards auf Home Screen (stale Projekte, leere Contexts)
- [ ] Mobile UX polieren: App-Fenster als Fullscreen-Sheets
- [ ] `pulse app install <github-url>` — Apps von GitHub installieren

#### Mittelfristig
- [ ] Visueller Graph-Editor verbessern: Live-Datenfluss-Animation
- [ ] Proaktive KI: System erkennt Muster, schlägt Graph-Verbindungen vor
- [ ] News-Pipeline erweitern: Filter-Transformer dazwischen
- [ ] Webhook-Pulse: externe HTTP-Trigger lösen Graphen aus
- [ ] App-Erstellung per Chat end-to-end testen und polieren

#### Langfristig
- [ ] **Cross-Instance Graphen über WebRTC** — DAS Killer-Feature (siehe unten)
- [ ] Voice als Pulse (Sprachbefehl → Graph-Aktion)
- [ ] Plugin-Ökosystem (Drittanbieter-Apps als Knoten)
- [ ] Mobile-native L0-Kacheln
- [ ] Phase 13g (MCP Server) — nur wenn CLI nicht reicht

---

## Vision: Cross-Instance Graphen über WebRTC

**Die Idee:** App-Graphen enden nicht an der Grenze einer einzelnen PulseOS-Instanz. Über WebRTC DataChannels können Graphen sich über mehrere Maschinen spannen — Peer-to-Peer, kein zentraler Server.

```
┌─ User A (localhost:3000) ─────┐     WebRTC      ┌─ User B (localhost:3000) ─────┐
│                                │   DataChannel   │                                │
│  [News-Fetcher] ──► [Filter] ──┼────────────────►┼── [News-Display]              │
│   (Producer)      (Transformer)│                  │    (Consumer)                  │
└────────────────────────────────┘                  └────────────────────────────────┘
```

### Warum das revolutionär ist

1. **Kein Cloud-Server nötig.** Daten fließen direkt zwischen zwei Rechnern. Kein AWS, kein Firebase, keine monatliche Rechnung.

2. **Jeder User hat eigene KI-Kapazität.** User A hat seine Claude-Session, User B hat seine. Zusammen können sie Graphen bauen die mehr leisten als jeder einzeln könnte.

3. **Verteilte Intelligenz.** User A's PulseOS ist gut im Daten-Sammeln (Producer), User B's ist gut im Analysieren (Transformer). Sie spezialisieren sich und verbinden ihre Stärken.

4. **Die KI-Grenze verschwindet.** Ein einzelner Claude hat ein Context-Window. Aber wenn 5 User ihre PulseOS-Instanzen verbinden, hat das Netzwerk 5x die Kapazität — jeder Claude arbeitet an seinem Teil des Graphen.

5. **Social + Work verschmelzen.** Der WebRTC-Chat ist nicht nur zum Reden — er ist die Daten-Pipeline. Eine Nachricht von einem Freund kann ein Pulse-Signal sein das einen Workflow startet.

### Wie es technisch funktioniert

- WebRTC DataChannel existiert bereits (Phase B: WebRTC System-Bus)
- Graph-Router muss erweitert werden: wenn ein Edge zu einem Remote-Peer zeigt → Daten über DataChannel senden statt lokal routen
- Remote-Edges im Graph-JSON: `{ "to": { "peerId": "abc123", "appId": "news-display", "input": "articles" } }`
- Empfänger-Seite: DataChannel-Message → `routeInput(appId, inputName, data)` → App bekommt Daten wie von einem lokalen Producer

### Was noch gebaut werden muss

- [ ] Remote-Edges in Graph-Definition (peerId + appId + input/output)
- [ ] Graph-Router: Remote-Edge erkennen → DataChannel senden
- [ ] Empfänger: DataChannel-Message als Graph-Input behandeln
- [ ] UI: Remote-Nodes im Graph-Editor als "Ghost-Nodes" anzeigen
- [ ] Handshake: Beim Verbinden austauschen welche Apps/Outputs verfügbar sind
- [ ] Sicherheit: Nur explizit freigegebene Outputs werden geteilt

---

## Architektur-Überblick

```
server.js              – Single Node.js HTTP Server, Port 3000 (~4500 Zeilen)
dashboard.html         – Desktop-Shell: Home Screen, App-Switcher, WebRTC
apps/<name>/           – ~48 Apps, je mit index.html + manifest.json
  manifest.json        – nodeType, inputs, outputs, pulseSubscriptions
  index.html           – UI (Vanilla HTML/CSS/JS)
  data/                – App-eigene Daten (JSON)
data/graphs/           – Graph-Definitionen (JSON)
data/app-registry.json – Zentrale App-Registry
data/contexts/         – Context-Daten (ctx-*.json)
data/schemas/          – Validierungs-Schemas
scripts/               – CLI (pulse.js), Migration
supervisor.js          – Agent-Supervisor (Legacy)
```

### Kern-APIs

| Endpoint | Zweck |
|----------|-------|
| `GET /api/apps` | App-Liste |
| `GET/POST /api/app-registry` | Registry mit Manifests |
| `GET/POST /api/graphs` | Graph CRUD |
| `POST /api/graphs/:id/edges` | Kanten verwalten |
| `POST /api/pulse/fire/:appId` | Manual Pulse |
| `GET /api/pulse/status` | Pulse-Engine Status |
| `POST /api/apps/:id/start\|stop` | Process Manager |
| `GET /api/context/:id` | Context lesen |
| `POST /api/context-chat` | KI-Chat mit Actions |
| `GET /sse/:appId` | SSE Realtime-Stream |

---

## Session-Checkliste für neue Sessions

1. Lies `STATUS.md` (dieses Dokument)
2. Prüfe `git log --oneline -10` für letzte Änderungen
3. Starte Server: `node server.js`
4. Teste: `curl http://localhost:3000/api/pulse/status`
5. Lies `VISION.md` falls Konzeptfragen auftauchen
6. Mach da weiter wo 🔲 anfängt
