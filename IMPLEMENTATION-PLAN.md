# PulseOS — Implementierungsplan
> **Erstellt:** 2026-03-19
> **Branch:** feature/major-ux-overhaul
> **Quellen:** MASTER.md, UX-PARADIGM.md, STATUS.md
>
> Dieser Plan trackt den **vollständigen Implementierungsstand** aller Features aus MASTER.md und UX-PARADIGM.md.
> Jede neue Session: dieses Dokument lesen, Checkboxen prüfen, dort weitermachen wo `[ ]` anfängt.

---

## 1. Design Language & OS-Chrome

> UX-PARADIGM.md: "Drei semantische Farben. IBM Plex Mono. Monospace vermittelt: das hier ist ein System."

- [x] CSS Custom Properties (--bg, --amber, --teal, --lila, --text, --border)
- [x] IBM Plex Mono als OS-Chrome Font
- [x] Dunkelblau #0d0d14 Background
- [x] Semantische Farben: Amber (Pulse), Teal (Agent/KI), Lila (Transformer/Graph)
- [x] Pulse-Dot mit Breathing-Animation
- [x] Pulse-Dot Flash bei Events

---

## 2. Permanente UI-Elemente

> UX-PARADIGM.md: "In allen Modi und allen Situationen präsent"

### Topbar
- [x] Sticky Topbar (immer sichtbar)
- [x] Pulse-Dot links (atmet immer)
- [x] "PulseOS" Titel
- [x] Mode-Buttons: Flow / Cockpit / Builder
- [x] Clock (Echtzeit-Uhr)
- [x] Apps-Button (öffnet Launcher)
- [ ] Share-Status Indikator in Topbar (zeigt ob Tunnel aktiv)

### Agent-Bar
- [x] Unter Topbar, immer sichtbar
- [x] Pulsierender Dot
- [x] Zeigt letzten Agenten-Zustand / Event
- [x] Leuchtet auf bei Pulse-Events (SSE)
- [x] Proaktive Insights (Stale-Detection, Vorschläge)
- [x] Cycling Animation für mehrere Suggestions
- [ ] Klick auf Agent-Bar öffnet Agent-Chat (Cmd+K)
- [ ] Agent-Bar sichtbar auch in Fullscreen-Apps (z.B. als Overlay)

---

## 3. Dashboard — Drei Zonen

> UX-PARADIGM.md: "Wo du aufgehört hast + was derweil passiert ist."

### Zone 1 — Agent-Briefing
- [x] Agent-Briefing Section oben
- [x] Dismissable Items (verschwindet nach Lesen)
- [x] Pulse-Events anzeigen
- [ ] KPI-Alerts (Schwellenwert-Überschreitungen)
- [ ] Stale-Projekt-Hinweise ("Barcelona-Trip — 5 Tage keine Aktivität")
- [ ] Graph-Ergebnis-Zusammenfassungen

### Zone 2 — App-Launcher
- [x] App-Grid mit Icons
- [x] Gepinnte Apps
- [x] Zuletzt benutzte Apps
- [x] Cmd+Space öffnet Launcher/Suche
- [ ] Fuzzy-Search in App-Launcher (Tippen filtert sofort)
- [ ] App-Kategorien: Work / Fun / Social Tabs

### Zone 3 — Graph-Aktivität
- [x] Collapsible Section unten
- [x] Aktive Graphen anzeigen
- [ ] Letzter Output pro Graph anzeigen
- [ ] Nächster Pulse-Zeitpunkt pro Graph
- [ ] Live-Status: Running / Idle / Error

---

## 4. Drei Interface-Modi

> UX-PARADIGM.md: "Die Modi ändern die Priorität der Ansicht — nicht was verfügbar ist."

- [x] Mode-Buttons in Topbar (Flow / Cockpit / Builder)
- [x] Mode wechselt CSS-Klasse auf body
- [x] Flow: max-width 600px, Stats/Graph hidden
- [x] Cockpit: max-width 1100px, alles sichtbar
- [x] Builder: öffnet Orchestrator/Projects App
- [x] Hover-Reveal für Mode-Controls (zeigt Labels nur bei Hover)
- [ ] Flow-Modus: Agent-Chat prominent, Apps als L0-Chips
- [ ] Cockpit-Modus: Graph-Visualisierung live, L1-Karten aller Apps
- [ ] Builder-Modus: Split-Screen (Code links, Agent rechts)
- [ ] Mode-Persistenz (localStorage speichert gewählten Mode)

---

## 5. OS-Layer: Navigation & Window Management

> UX-PARADIGM.md: "PulseOS muss sich anfühlen wie macOS. Kein Kompromiss."

### Keyboard Shortcuts
- [x] Cmd+Space → App Launcher
- [x] Cmd+Tab → App Switcher (offene Apps)
- [x] Cmd+W → Aktives Fenster schließen
- [x] Cmd+K → Agent-Chat öffnen
- [x] Cmd+G → Graph-Editor öffnen
- [ ] Cmd+M → Minimieren
- [ ] Cmd+F → Fullscreen Toggle
- [ ] Shortcut-Overlay (zeigt alle Shortcuts bei langem Cmd-Drücken)

### Window Management
- [x] App-Fenster mit Minimize/Maximize/Close
- [x] App-Switcher Tabs in Topbar
- [ ] Resize per Drag (Ecken/Kanten)
- [ ] Side-by-Side Snap (Fenster an Bildschirmhälfte)
- [ ] Mehrere Instanzen derselben App
- [ ] Fullscreen ohne Chrome (kein Topbar)
- [ ] Z-Order Management (Klick bringt Fenster nach vorne)

---

## 6. KI: Drei Ebenen der Sichtbarkeit

> UX-PARADIGM.md: "Die Grenze zwischen App und KI ist fließend."

### Ebene 1 — KI unsichtbar (80%)
- [x] Konzept verstanden und dokumentiert
- [ ] Demo-App: Export-Button der im Hintergrund KI nutzt (Format-Optimierung)
- [ ] Graph-Router nutzt algorithmische Filter ohne KI-Hinweis

### Ebene 2 — KI als GUI-Element (15%)
- [x] Notes-App: "Zusammenfassen" Button (KI ohne Chat)
- [x] Notes-App: "Ideen generieren" Button
- [x] Notes-App: "Verbessern" Button
- [ ] Weitere Apps: KI-Buttons in Budget (Anomalien), Calendar (Vorschläge)
- [ ] Toggle "Auto-Analyse" in Daten-Apps
- [ ] Badge "N neue Insights" mit Card-Ausgabe

### Ebene 3 — Expliziter Chat (5%)
- [x] Cmd+K öffnet Agent-Chat
- [x] Modifier-Overlay (Pencil-Button) für App-Editing
- [ ] Agent-Chat Spotlight-Style (schwebend, nicht Sidebar)
- [ ] Memory-Tags unter Agent-Antworten ("↗ Gespeichert: ...")
- [ ] Chat-History persistent über Sessions

---

## 7. PulseOS Client SDK

> UX-PARADIGM.md: "Jede App bekommt automatisch PulseOS.emit(), .onInput(), .ai() ..."

- [x] SDK wird server-side in jede App injiziert (wie Modifier-Overlay)
- [x] `PulseOS.emit('output', data)` — Graph-Output senden
- [x] `PulseOS.onInput('name', fn)` — Graph-Input empfangen
- [x] `PulseOS.onPulse('clock:30m', fn)` — Pulse empfangen
- [x] `PulseOS.saveState(data)` / `PulseOS.loadState()`
- [x] `PulseOS.alert('msg')` — Agent-Bar Hinweis
- [ ] `PulseOS.ai('task', data)` — KI-Funktion aufrufen (Ebene 2)
- [ ] SDK-Dokumentation / Cheatsheet für App-Entwickler
- [ ] Template-App die alle SDK-Funktionen demonstriert

---

## 8. L0 App-Chips & Progressive Offenbarung

> UX-PARADIGM.md: "L0 → L1 → L2. User sieht was er braucht."

- [x] L0 App-Chips: Recently-used Apps als kompakte Teal-Pills
- [ ] L0-Chips zeigen Live-Status (letzte Aktivität, Pulse-Count)
- [ ] L1-Karten: Klick auf Chip expandiert zu Karte mit Key-Info
- [ ] L2-Vollansicht: Doppelklick öffnet App vollständig
- [ ] Smooth Animation L0 → L1 → L2 (Expand/Collapse)
- [ ] Chips im Flow-Modus prominent anzeigen

---

## 9. Pulse-System & Live-Heartbeat

> UX-PARADIGM.md: "Pulse als Herzschlag — kurzes Aufleuchten bei Events."

- [x] SSE Stream `/sse/pulse` broadcasts alle System-Events
- [x] Dashboard verbindet sich zu Pulse-SSE
- [x] Agent-Bar zeigt Live-Events ("⚡ fired · quote-generator")
- [x] Pulse-Dot Flash bei Events
- [x] System Pulse Feed am Dashboard-Ende
- [x] Clock-Subscriptions (clock:1m, clock:30m, etc.)
- [x] Manual Pulse: POST /api/pulse/fire/:appId
- [x] Webhook-Pulse: GET/POST /api/pulse/webhook/:token
- [ ] Pulse-History API (letzte N Events abrufbar)
- [ ] Pulse-Events in Graph-Aktivität Zone anzeigen

---

## 10. App-Graph System

> MASTER.md: "Producer → Transformer → Consumer. Datenfluss ist direkt."

### Graph Engine
- [x] Graph-Definitionen in data/graphs/
- [x] routeOutput() — Datenfluss entlang Kanten
- [x] SSE app-input Events an Consumer-Apps
- [x] Graph CRUD API
- [x] Pulse → Producer → Graph-Router → Consumer (end-to-end)
- [ ] Transformer-Nodes mit algorithmischer Logik (filter, sort, aggregate)
- [ ] KI-Transformer (ein Call pro Schritt, nie pro Datenpunkt)
- [ ] Error-Handling: fehlgeschlagene Nodes markieren

### Graph UI (Projects App)
- [x] Nodes als Karten mit farbcodierten Ports
- [x] Edges als SVG-Linien
- [x] Drag-to-connect zwischen Ports
- [x] Delete-Edge per Klick
- [x] Flow-Dot Animation (SVG dots along Bezier paths)
- [x] Node Emit/Receive Glow Effects
- [x] Live SSE für Datenfluss-Visualisierung
- [ ] Mini-Graph-Vorschau im Dashboard (Zone 3)
- [ ] Graph-Templates (vorgefertigte Pipelines)

---

## 11. Agent-System

> MASTER.md: "Ein dauerhaft laufender Claude Code Prozess. Nicht ein Chat-Widget."

### Agent-Merge (Telegram Relay)
- [x] agent/ Verzeichnis mit relay.ts, memory.ts, etc.
- [x] agent/PULSEOS.md — dynamisches Kontext-Dokument
- [x] relay.ts angepasst: fetcht PulseOS-Kontext beim Start
- [x] buildPrompt() injiziert PULSEOS.md + dynamischen Kontext

### Proaktiver Agent
- [x] Agent-Bar zeigt proaktive Insights
- [ ] Morgens-Briefing: Zusammenfassung aktiver Graphen
- [ ] Stale-Detection: Projekte ohne Aktivität erkennen
- [ ] KPI-Alerts: Schwellenwert-Monitoring
- [ ] Graph-Vorschläge: "Du fragst täglich X — soll ich automatisieren?"
- [ ] Memory-Tags sichtbar unter Agent-Antworten

### Agent-Chat Integration
- [ ] Browser-UI Chat verbindet sich mit demselben Claude-Prozess
- [ ] Chat-Transport: SSE oder WebSocket statt nur Telegram
- [ ] Agent kennt alle PulseOS App-APIs (dynamisch)
- [ ] Agent kann Apps starten/stoppen via API

---

## 12. Onboarding & Tutorial

> Guided tutorial system für neue User

- [x] Tutorial-System Grundstruktur (Spotlight-Onboarding)
- [ ] Schritt 1: Willkommen — Was ist PulseOS?
- [ ] Schritt 2: Dashboard-Tour (3 Zonen erklären)
- [ ] Schritt 3: App öffnen (Klick auf App-Icon)
- [ ] Schritt 4: Mode wechseln (Flow → Cockpit → Builder)
- [ ] Schritt 5: Agent-Bar verstehen (Pulse-Events)
- [ ] Schritt 6: Cmd+Space Launcher ausprobieren
- [ ] Schritt 7: Erste App modifizieren (Modifier-Overlay)
- [ ] Schritt 8: Graph-Editor entdecken
- [ ] Tutorial kann jederzeit neu gestartet werden (Settings/Help)
- [ ] Tutorial-Fortschritt in localStorage gespeichert
- [ ] "Skip Tutorial" Option

---

## 13. App-Entwicklung & Installation

> MASTER.md: "User baut Apps selbst. Drei Wege."

### App-Installation
- [x] `pulse app install <github-url>` — CLI Command
- [x] Clone + Register in app-registry.json
- [ ] Multi-App Repos korrekt erkennen
- [ ] App-Updates: `pulse app update <id>`
- [ ] App-Deinstallation: `pulse app remove <id>`

### App-Templates
- [ ] Template-Generator: `pulse app create <name>`
- [ ] Template enthält: manifest.json, index.html mit SDK, data/
- [ ] Template-Varianten: Simple, Graph-Node, KI-App
- [ ] src/ und data/ Trennung durchgesetzt

### Builder-Modus
- [ ] Split-Screen: Code-Editor links, Agent-Chat rechts
- [ ] Live-Preview beim Editieren
- [ ] Agent als Assistent: "Baue mir eine App die X macht"

---

## 14. GitHub Pages — Persönliche Präsenz

> MASTER.md: "Mehrere Kanäle pro User. GitHub Pages als Offline-Profil."

- [ ] pulse-profile.json Standard definieren
- [ ] Profil-Template (Website-Style)
- [ ] Feed-Template (Blog/Journal)
- [ ] Grid-Template (Instagram-Style)
- [ ] `pulse page publish` CLI Command
- [ ] Sichtbarkeits-Stufen (public/network/contacts/private)
- [ ] App-Store auf GitHub Pages (pulse-apps.json)

---

## 15. WebRTC & Social Layer

> MASTER.md: "WebRTC Peer-to-Peer. Dezentrales Netzwerk."

### Basis (implementiert)
- [x] Share-Button → Tunnel-URL + QR-Code
- [x] WebRTC DataChannel Chat
- [x] Profil-System (Name, Status, Avatar)
- [x] Kontakte automatisch bei Verbindung

### Cross-Instance Graphen
- [ ] Remote-Edges in Graph-Definition (peerId + appId)
- [ ] Graph-Router: Remote-Edge → DataChannel senden
- [ ] Empfänger: DataChannel-Message als Graph-Input
- [ ] Ghost-Nodes im Graph-Editor
- [ ] Handshake: App-Output-Discovery beim Verbinden
- [ ] Sicherheit: Nur freigegebene Outputs teilen

---

## 16. Interaktions-Prinzipien

> UX-PARADIGM.md: "Hover zeigt Kontrollen. Memory-Tags. Progressive Offenbarung."

- [x] Hover-Reveal Controls (Collapse/Resize/Close nur bei Hover)
- [ ] Smooth Transitions (alle State-Änderungen animiert)
- [ ] Micro-Interactions: Button-Press Feedback, Toggle-Animationen
- [ ] Consistent Loading States (Skeleton-Screens statt Spinner)
- [ ] Error-States mit Recovery-Aktionen
- [ ] Empty-States mit hilfreichen Hinweisen

---

## 17. Algorithmus vor KI

> UX-PARADIGM.md + MASTER.md: "80% aller Graph-Operationen laufen ohne KI-Call."

- [ ] Filter-Transformer: Algorithmisch (Kategorie, Datum, Schwellenwert)
- [ ] Sort-Transformer: Top-N, Relevanz
- [ ] Aggregation-Transformer: Summe, Durchschnitt, Maximum
- [ ] Format-Konvertierung ohne KI
- [ ] KI nur für: Zusammenfassung, Sentiment, Bild-Analyse, Übersetzung
- [ ] Kostenregel dokumentiert und in Templates enforced

---

## Legende

- `[x]` = Implementiert und committed
- `[ ]` = Noch offen
- Jede Session: Von oben nach unten durchgehen, offene Items priorisieren
- Neue Features hier eintragen bevor sie implementiert werden

---

## Prioritäts-Reihenfolge (empfohlen)

1. **Onboarding-Tutorial vervollständigen** (Abschnitt 12) — First-User-Experience
2. **Mode-Persistenz + Flow/Cockpit-Verfeinerung** (Abschnitt 4) — Kerninteraktion
3. **Agent-Chat Integration** (Abschnitt 11) — Agent erlebbar machen
4. **L0→L1→L2 Progressive Offenbarung** (Abschnitt 8) — UX-Kernprinzip
5. **KI-Ebene-2 in weiteren Apps** (Abschnitt 6) — "KI ist unsichtbar eingebettet"
6. **Algorithmische Transformer** (Abschnitt 17) — Graph-Power ohne KI-Kosten
7. **App-Templates & Builder** (Abschnitt 13) — User baut selbst
8. **Cross-Instance Graphen** (Abschnitt 15) — Das Killer-Feature
9. **GitHub Pages Präsenz** (Abschnitt 14) — Social Layer
