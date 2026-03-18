# PulseOS V3 — Agentic OS Konzept

> **Status:** Phase A 🔧 in Arbeit
> **Letzte Aktualisierung:** 2026-03-18
> **Session-Einstieg:** Lies dieses Dokument. Prüfe den Status jeder Phase. Mach da weiter wo ✅ aufhört und 🔧 anfängt.

---

## Was ist PulseOS?

Ein browser-basiertes Agentic OS mit ~44 Apps, App-Graph-System (Producer→Transformer→Consumer), Pulse-Engine (Triggers), WebRTC-Chat, und AI-Integration (Claude). Läuft auf `localhost:3000`, kein npm, kein Framework — vanilla HTML/CSS/JS + Node.js Server.

## Die 3 Säulen — zusammen gedacht

### 1. Identity & Profile (Grundlage für alles)

**Problem:** Aktuell ist PulseOS ein anonymer localhost. Kein Name, kein Profil, keine Möglichkeit sich anderen vorzustellen.

**Lösung: `data/profile.json`**
```json
{
  "name": "Chris",
  "handle": "nastycoder",
  "avatar": "🧑‍💻",
  "bio": "Building PulseOS",
  "githubPages": "https://nastycoder.github.io",
  "links": [
    { "label": "GitHub", "url": "https://github.com/NastyFFM" }
  ],
  "publicKey": "...",
  "roomId": "pulse-abc123"
}
```

- Wird beim ersten Start abgefragt (Onboarding)
- GitHub Pages URL = deine "Visitenkarte" wenn du offline bist
- `roomId` = dein permanenter WebRTC-Raum (statt zufälliger IDs)
- Bei jedem WebRTC-Connect: Profile austauschen → `data/contacts.json`

### 2. WebRTC als System-Bus (nicht nur Chat)

**Problem:** WebRTC-Chat ist eine isolierte App. Aber die Vision sagt: "WebRTC-Ereignisse sind Pulse-Signale."

**Lösung: WebRTC wird ein System-Service**

```
Dashboard (Bridge-Host)
    ↓ DataChannel
Alle verbundenen Peers
    ↓ Message Types
┌─────────────────────────────────────┐
│ profile-exchange  → Kontakt speichern│
│ chat-message      → Chat-Nachricht   │
│ app-share         → App/Link teilen  │
│ pulse-signal      → Remote Trigger   │
│ graph-sync        → Graph teilen     │
│ file-transfer     → Dateien senden   │
│ status-update     → Online-Status    │
│ claude-relay      → AI-Nachricht     │
└─────────────────────────────────────┘
```

- **Jede App** kann über `window.PulseOS.send(peerId, type, data)` Nachrichten senden
- **Jede App** kann über `window.PulseOS.onMessage(type, callback)` empfangen
- **Kontakte:** `data/contacts.json` — alle Peers die je verbunden waren, mit Profil + letztem Online-Zeitpunkt + GitHub Pages Link

### 3. Revolutionary UX — Agentic OS Dashboard

**Problem:** Aktuelles Dashboard = klassischer Desktop mit Dock. Nicht "agentic".

**Vision: 3-Layer Dashboard**

```
┌─────────────────────────────────────────────────┐
│                 LAYER 1: ORBIT                   │
│  Kreisförmiges Dock mit den wichtigsten Apps     │
│  Pulsiert bei Activity. Drag to connect.         │
│  Dein Avatar in der Mitte.                       │
│                                                   │
│           ┌──┐                                    │
│      ┌──┐ │AI│ ┌──┐                              │
│      │📅│ └──┘ │📝│                              │
│      └──┘  🧑‍💻  └──┘                              │
│      ┌──┐      ┌──┐                              │
│      │💬│      │📊│                              │
│      └──┘      └──┘                              │
│                                                   │
│  LAYER 2: STREAM (links)                         │
│  Live-Feed: Nachrichten, Notifications, AI-Output│
│  Chronologisch, wie ein Social Feed              │
│                                                   │
│  LAYER 3: WORKSPACE (rechts)                     │
│  Die aktive App / Graph-Ansicht / Canvas          │
│  Splitscreen möglich                              │
│                                                   │
│  BOTTOM BAR: Peers                                │
│  Verbundene Kontakte mit Status-Dots              │
│  Klick → Chat öffnen                              │
└─────────────────────────────────────────────────┘
```

**Key UX-Innovationen:**
- **Orbit Dock**: Apps kreisförmig um dein Profil-Avatar. Pulsieren = Activity. Größe = Nutzungshäufigkeit.
- **Stream**: Alles was passiert in einer Timeline — Chat-Nachrichten, AI-Outputs, Notifications, Graph-Events
- **Peer Bar**: Unten — alle verbundenen Kontakte, Online-Status, Quick-Chat
- **AI-Presence**: Claude ist nicht in einer App versteckt, sondern immer präsent (wie ein Assistent der neben dir steht)
- **Drag-to-Connect**: App aus dem Orbit auf eine andere ziehen → Graph-Edge erstellen

---

## Implementierungsplan

### Phase A: Profile & Contacts ✅/🔧
> Grundlage für alles Soziale

- [ ] `data/profile.json` Schema + Defaults
- [ ] `GET /api/profile` + `PUT /api/profile` Endpoints in `server.js`
- [ ] Onboarding-Screen beim ersten Start (Name, Avatar, GitHub Pages URL, Bio)
- [ ] `data/contacts.json` + `GET /api/contacts` + `POST /api/contacts`
- [ ] WebRTC Profile-Exchange: bei Connect → Profile senden → Contact speichern
- [ ] Dashboard zeigt aktuellen Profil-Avatar + Name

### Phase B: WebRTC System-Bus
> WebRTC von isolierter App zum System-Service

- [ ] `window.PulseOS.send(peerId, type, data)` Bridge-API im Dashboard
- [ ] `window.PulseOS.onMessage(type, callback)` Listener-System für Apps
- [ ] Message-Routing im Dashboard Bridge-Host (erweiterte DataChannel Message Types)
- [ ] Contact-Liste mit Online-Status (wer ist gerade verbunden)
- [ ] System-Chat Panel (überall verfügbar, nicht nur in WebRTC-App)
- [ ] Profile-Exchange automatisch bei neuer Peer-Verbindung

### Phase C: New Dashboard UX
> Revolutionäres Agentic OS Interface

- [ ] Orbit Dock (CSS + JS — kreisförmiges Layout um Avatar)
- [ ] Stream Panel (Live-Feed Timeline — Nachrichten, Notifications, AI-Output)
- [ ] Workspace Area (App-Rendering, ersetzt aktuelles Window-System)
- [ ] Peer Bar (Connected Contacts am unteren Rand)
- [ ] AI-Presence (Claude als System-Entity, immer sichtbar)
- [ ] Drag-to-Connect (App aus Orbit auf andere ziehen → Graph-Edge)

### Phase D: GitHub Pages Integration
> Offline-Visitenkarte + Static Hosting

- [ ] Profile enthält `githubPages` URL
- [ ] Bei WebRTC-Connect: URL wird im Contact gespeichert
- [ ] Contact-Card zeigt Link zur GitHub Pages Website
- [ ] Optional: `pulse app deploy` CLI-Command für GitHub Pages Deployment

---

## Aktueller Stand

| Phase | Status | Letzte Änderung |
|-------|--------|-----------------|
| Phase A: Profile & Contacts | 🔧 In Arbeit | 2026-03-18 |
| Phase B: WebRTC System-Bus | 🔲 Geplant | — |
| Phase C: New Dashboard UX | 🔲 Geplant | — |
| Phase D: GitHub Pages | 🔲 Geplant | — |

---

## Bestehende Infrastruktur (bereits implementiert)

| Was | Wo | Status |
|-----|-----|--------|
| WebRTC Chat App | `apps/webrtc-chat/index.html` | ✅ Funktioniert |
| Bridge Host (Dashboard) | `dashboard.html` (startBridgeHost) | ✅ Funktioniert |
| Signaling Server | `https://web-production-84380f.up.railway.app` | ✅ Extern |
| Room-System | `data/bridge-room.json` | ✅ Funktioniert |
| Tunnel-Management | `server.js` (/api/tunnel) | ✅ Funktioniert |
| App-Graph System | `server.js` + `apps/projects/index.html` | ✅ Phase 13 |
| Pulse Engine | `server.js` (clock/webhook triggers) | ✅ Phase 13e |
| CLI | `bin/pulse.js` | ✅ Phase 13f |
| Graph-UI Editor | `apps/projects/index.html` (Graph Tab) | ✅ Phase 13h |
| SSE Broadcast System | `server.js` (broadcast()) | ✅ Core |

## Dateien-Referenz

| Datei | Zeilen | Zweck |
|-------|--------|-------|
| `server.js` | ~5400 | HTTP Server, alle APIs, Process Manager, Graph Router, Pulse Engine |
| `dashboard.html` | ~5000 | Desktop Shell, Dock, Window Manager, WebRTC Bridge Host |
| `apps/projects/index.html` | ~4600 | Context Engine UI, Graph-UI Editor, Widget Canvas |
| `apps/webrtc-chat/index.html` | ~985 | WebRTC Chat (Room-basiert, P2P DataChannel) |
| `bin/pulse.js` | ~300 | CLI Tool (pulse app/graph/fire) |
| `VISION.md` | ~413 | Architektur-Vision V2 (App-Graph, Pulse, 3 Pillars) |
| `PHASE-13-IMPLEMENTATION.md` | ~2500 | Phase 13 Implementierungsplan (13a-h) |
