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
| **10** | **Template System 2.0 — Schritt 1 + Template Maker + Deploy-Steps** | *pending* |

## Session 2026-04-05 — Template System 2.0

### Was gebaut wurde

#### Template-Datenmodell 2.0
- `applyTemplateDefaults()` — 6 neue Felder: agents, scaffold, envVars, git, monitoring, deploySteps
- 4 Builtin-Templates mit spezifischen Werten
- Abwärtskompatibel: alte Templates bekommen Defaults beim GET
- POST/PUT/generate Routes wenden Defaults an

#### Template Maker Agent (Chat-geführt)
- `POST /api/template-maker/start` — neue Session oder Edit-Mode (templateId)
- `POST /api/template-maker/{id}/message` — AI-Agent Routing wenn alive, State Machine Fallback
- `GET /api/template-maker/{id}` — Session + Messages lesen
- `/api/chat-respond` erkennt `tms-*` chatIds → routet Antworten in TM-Sessions
- Chat-Agent bekommt vollen Template-Kontext (Stacks, Deploy-Steps, Scaffold, Env Vars)
- Dashboard: Template-Maker Chat-Modus mit Banner, Polling, Quick-Reply Buttons

#### Deploy-Steps (strukturierte Deployment-Anweisungen)
- `deploySteps[]` Array pro Template
- Actions: github-publish, github-pages, railway-deploy, vercel-deploy, supabase-setup, stripe-setup
- Jeder Step hat: name, action, command, description, urlPattern
- Edit-Formular: Deploy-Steps Liste mit Add/Remove + Preset-Buttons (GitHub Pages, Railway, Vercel)

#### App Links & Deployment UI
- "Links & Deployment" Sektion im Settings-Tab
- Klickbare URLs: PulseOS Lokal, GitHub Repo, GitHub Pages, Railway, Vercel, Dashboard
- Ausstehende Deploy-Steps als "Pending" angezeigt
- Dynamisch aus App-Metadaten + Template-DeploySteps

#### Template Lifecycle (Löschen/Publish/Reset)
- Dropdown-Menü für alle Templates (Builtin + User)
- User: Lokal löschen / GitHub entfernen / Überall löschen / Publishen
- Builtin: Defaults zurücksetzen / GitHub entfernen / Publishen
- Speichern fragt bei published Templates ob GitHub aktualisiert werden soll

#### Weitere UI-Verbesserungen
- Accounts & Services Sektion (Token-Status, maskiert, Entfernen-Button)
- Environment Variables collapsed by default (Sicherheit)
- Quick-Create App mit Template-Dropdown + Profile-Default
- Template Edit-Formular (alle 2.0 Felder editierbar)
- Chat-Polling Fix (Hash-basiert statt nur Message-Count)

### Architektur
- ~250 Zeilen `applyTemplateDefaults` + Template-Maker Endpoints in server.js
- ~200 Zeilen Template-Maker State Machine (Fallback wenn kein Agent)
- ~150 Zeilen Chat-Agent-Routing (chat-queue → TM-Session)
- ~300 Zeilen Dashboard UI (Template Edit, App Links, Accounts, Deploy-Steps)
- Chat-Agent Integration: Nachrichten → chat-queue.json → guitest-chat Agent → chat-respond → TM-Session

## Bekannte Issues
- Template-Name aus Voice-Input kann unbrauchbar sein (z.B. "ich-m-chte-dass-die")
- Template Maker State Machine versteht nur einfache Phrasen (Fallback — echter Agent funktioniert)
- Dashboard flackert bei Polling

## Nächste Session
- Schritt 2: PulseTV als Template exportieren
- Schritt 3: Template-Import von GitHub
- Schritt 4: Build-App liest Template-Config (Phasen/Agents dynamisch)
