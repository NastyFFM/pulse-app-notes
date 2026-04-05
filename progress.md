# Progress: feature/app-maker-v2 — Gesamtübersicht

## Erledigte Phasen

| Phase | Was | Commits |
|-------|-----|---------|
| 1 | Agent-Infrastruktur (4 Agents, Skills, Commands) | ee07e61 |
| 2 | Orchestrator-Worker (4 Phasen, Agent-Defs laden) | 9947c09 |
| 3 | Self-Improvement (Skill, Auto-Detect, Playwright MCP) | dc7b89c, c73f057 |
| 4 | Git-Workflow (Feature-Branches, Auto-PR) | aef3c3d, 8ad305b |
| - | Agent Dashboard (Workers, Agents, Skills, MCP, Files) | e66ce1d |
| - | Smart Autodetect (orchestriert vs quick) | f3ce7a6 |
| 5 | Eigenständige Apps vs System-Apps | 905f0ce |
| 6 | /build-app Command Fix + Agent-Tool Integration | 199f49c, 63d0e4f |
| 7 | Plan-first Architektur (planner + progress-tracker) | 4f48c86 |
| 8 | App Editor Dashboard (Monitor, Graph, Kanban, Files, Git) | 82838d7, 0ade96c |
| **9** | **Edit-Panel 2.0 — 8 Tabs, Resize, Settings** | **04659a5** |

## Session 2026-04-05 — Edit-Panel 2.0

### Was gebaut wurde
- **Edit-Panel 2.0**: 8 Tabs (Chat, Monitor, Graph, Kanban, Files, Git, Settings)
- **Resizable Panel**: Drag-Handle zwischen Panel und App-Iframe
- **Settings-Tab**: Deploy, Publish, Template-Auswahl, Env Vars, App Info
- **Monitor-Tab**: Worker-Karten mit Phase-Bar + Log-Stream (3s Poll)
- **Graph-Tab**: SVG Agent-Graph, nutzt worker.phases[] statt Text-Heuristik
- **Kanban-Tab**: Tasks aus PLAN.md, auto-reload via SSE
- **Files-Tab**: PLAN.md/PROGRESS.md/DECISIONS.md mit XSS-safe Markdown-Renderer
- **Git-Tab**: App-spezifisches Repo via ?appId= Query-Param
- **PulseTV App**: Gebaut mit agentischem Flow (Plan→Code→Test→Review→Git), 6/6 Tests grün, XSS gefixt
- **server.js**: /api/git/branches akzeptiert ?appId= für App-spezifisches Repo

### Bugfixes während Session
- Graph: Nutzt jetzt worker.phases[] Array statt Log-Text-Heuristik
- Graph: Filtert auf App-spezifische Worker (nicht alle)
- Kanban: Reload bei jedem SSE-Event + Tab-Wechsel
- Files: Bessere Empty-States ("wird vom Worker erstellt")

### Architektur
- ~200 Zeilen ep-* CSS (scoped, kein Dashboard-Breakage)
- ~530 Zeilen JS (Tab-System, Polling-Lifecycle, alle Renderer)
- Per-Window State auf panel._epState
- data-agent Attribute statt IDs für SVG (Multi-Window safe)
- Polling: Monitor/Graph/Kanban teilen Worker-Poll (3s), Git eigener Poll (10s)

## Bekannte Issues
- Dashboard flackert bei Polling
- Self-Improve Playwright-Verifikation noch nicht zuverlässig
- Graph-Animationen könnten smoother sein (Übergang zwischen Phasen)

## Nächste Session: Template System 2.0

Templates werden zur vollständigen Projekt-Blaupause. Schrittweise:

1. **Template-Datenmodell erweitern** — agents, scaffold, envVars, git, monitoring Felder
2. **PulseTV als Template exportieren** — Proof of Concept
3. **Template-Import von GitHub** — Klonen + Registrieren
4. **Template-Maker Chat-Agent** — Chat-basierte Template-Erstellung
5. **"Aus Template erstellen"** — Im Dashboard
6. **Build-App liest Template-Config** — Dynamische Phasen/Agents

Immer erst testen nach jedem Schritt!
