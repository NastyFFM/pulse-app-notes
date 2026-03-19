# PulseOS — Implementierungsplan
> **Stand:** 2026-03-19
> **Branch:** feature/clean-agentic-os (Clean Slate)
> **Quellen:** MASTER.md, UX-PARADIGM.md
>
> Jede neue Session: Checkboxen pruefen, dort weitermachen wo `[ ]` anfaengt.

---

## 0. Clean Slate — Grundstruktur

- [x] Neuer Branch `feature/clean-agentic-os` von main
- [x] Dashboard komplett neu geschrieben (IBM Plex Mono, Semantic Colors)
- [x] Alle 51 alten Apps entfernt
- [x] app-registry.json zurueckgesetzt
- [x] Committed + gepusht

---

## 1. Dashboard OS-Shell

- [x] Topbar: Pulse-Dot (Amber, atmet), Brand, Mode-Buttons, Clock, Sync-Dot
- [x] Agent-Bar: Teal, immer sichtbar, zeigt Events via SSE
- [x] Home Screen: Greeting, Suggestions, App-Grid, Projekte, Graphen, Pulse-Feed
- [x] Drei Zonen: Briefing (oben), Apps (mitte), Graph-Aktivitaet (unten)
- [x] Drei Modi: Flow / Cockpit / Builder mit CSS-Klassen
- [x] Mode-Persistenz in localStorage
- [x] Keyboard Shortcuts: Cmd+Space/Tab/W/K/G
- [x] Window Manager: Drag, Resize, Minimize, Maximize, Close
- [x] Hover-Reveal Controls (Buttons nur bei Hover sichtbar)
- [x] App Launcher Overlay (Cmd+Space) mit Search
- [x] Pulse SSE Stream verbunden
- [x] WebRTC Bridge Host fuer P2P
- [x] Profil-System + Onboarding
- [x] System Chat Panel (WebRTC)
- [x] Kontakte-Liste
- [x] Tunnel/Share mit QR-Code
- [ ] Agent-Bar Klick oeffnet Chat (Cmd+K Verknuepfung)
- [ ] Shortcut-Overlay bei langem Cmd

---

## 2. Default Apps — Kern-Ausstattung

> Jede App: index.html + manifest.json, PulseOS Design Language, nutzt injiziertes SDK

### 2.1 System-Apps
- [x] **terminal** — System-Terminal (PTY via Server)
- [x] **files** — Datei-Browser (apps/ und data/ durchsuchen)
- [x] **settings** — OS-Einstellungen (Profil, Theme, Shortcuts, About)

### 2.2 Work-Apps
- [x] **notes** — Notizen erstellen/bearbeiten, Markdown, dark theme
- [x] **tasks** — Todo-Liste mit Prioritaeten und Status
- [x] **calendar** — Monats/Wochen-Ansicht, Events erstellen
- [x] **projects** — Projekt-Manager mit Chat + Widget-Canvas + Graph-Editor

### 2.3 Fun-Apps
- [x] **weather** — Wetter-Anzeige (API oder manuell)
- [x] **music** — Internet-Radio Player mit Sender-Liste

### 2.4 Registrierung
- [x] Alle Apps in app-registry.json registriert
- [x] Alle Apps haben manifest.json mit icon, name, description, color
- [x] Dashboard zeigt alle Default-Apps im Grid

---

## 3. App Design Standards

> Jede Default-App muss diese Standards erfuellen:

- [x] IBM Plex Mono Font (oder bewusste Abweichung dokumentiert)
- [x] Dark Theme: #0d0d14 bg, rgba(255,255,255,.85) text
- [x] Semantic Colors: Amber fuer Aktionen, Teal fuer KI/Agent, Lila fuer Daten
- [x] Keine Emojis im UI-Chrome (Text-Zeichen stattdessen)
- [x] Responsive: funktioniert in Fenster und Fullscreen
- [x] Konsistente Border-Radius (8px), Spacing, Hover-States
- [x] Daten in apps/<id>/data/ als JSON
- [x] Kein externer CDN-Abhaengigkeit (ausser Fonts)

---

## 4. PulseOS Client SDK (server-injiziert)

- [x] SDK wird in jede App injiziert via server.js
- [x] PulseOS.emit('output', data)
- [x] PulseOS.onInput('name', fn)
- [x] PulseOS.onPulse(fn)
- [x] PulseOS.reportStatus(status)
- [x] PulseOS.logInteraction(action, detail)
- [x] PulseOS.ai('task', data) — KI-Funktion aufrufen
- [x] PulseOS.saveState(data) / loadState() — persistente App-Daten
- [x] PulseOS.alert('msg') — Agent-Bar Benachrichtigung

---

## 5. Pulse-System & Graphen

- [x] SSE Stream /sse/pulse
- [x] Clock-Subscriptions
- [x] Manual Pulse API
- [x] Webhook-Pulse
- [x] Graph-Definitionen in data/graphs/
- [x] routeOutput() Datenfluss
- [x] Graph CRUD API
- [ ] Demo-Graph: z.B. Weather-Producer -> Display-Consumer
- [ ] Graph-UI in Projects-App (Nodes, Edges, Drag-Connect)

---

## 6. Agent-System

- [x] agent/ Verzeichnis (relay.ts, memory.ts, etc.)
- [x] agent/PULSEOS.md dynamisches Kontext-Dokument
- [x] Agent-Bar zeigt Insights
- [x] Agent-Chat im Browser (nicht nur Telegram)
- [x] Morgens-Briefing
- [x] Stale-Detection
- [ ] Memory-Tags unter Antworten

---

## 7. Onboarding & Tutorial

- [x] Profil-Onboarding (Name, Handle, Avatar)
- [x] Guided Tutorial nach erstem Login
- [x] Dashboard-Tour (Zonen erklaeren)
- [x] App oeffnen Demo
- [x] Shortcuts erklaeren
- [x] Skip-Option + Neustart ueber Settings

---

## 8. Spaetere Features (nach Default-Apps)

- [ ] KI-Ebene-2 Buttons in Apps (Zusammenfassen, Analysieren)
- [ ] L0 App-Chips (minimierte Apps als Pills)
- [ ] Progressive Offenbarung L0->L1->L2
- [ ] Cross-Instance Graphen (WebRTC)
- [ ] GitHub Pages Praesenz-Templates
- [ ] pulse CLI: app create, app update, app remove
- [ ] Builder-Modus: Split-Screen mit Agent

---

## Prioritaets-Reihenfolge

1. ~~**Default Apps erstellen** (Abschnitt 2)~~ DONE
2. ~~**App Design Standards** durchsetzen (Abschnitt 3)~~ DONE
3. **SDK vervollstaendigen** (Abschnitt 4)
4. **Onboarding/Tutorial** (Abschnitt 7)
5. **Agent-Chat Integration** (Abschnitt 6)
6. **Graph Demo-Pipeline** (Abschnitt 5)
7. **Spaetere Features** (Abschnitt 8)
