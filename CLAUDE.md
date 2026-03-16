# PulseOS – CLAUDE.md

## What This Is

PulseOS is a browser-based desktop OS built entirely with vanilla HTML/CSS/JS and a single Node.js server (no npm, no build tools). It runs at `http://localhost:3000` and lets users launch, use, and AI-modify ~30 apps in real time.

## Architecture

```
server.js          – Single Node.js HTTP server (no Express). Port 3000.
dashboard.html     – Main desktop shell (dock, app launcher, window manager)
liveos.html        – Canvas-based infinite workspace with draggable widget frames
supervisor.js      – Monitors agents.json, auto-respawns dead AI agents via `claude -p`
chat-worker.js     – Chat agent worker
apps/<name>/       – Each app: index.html + optional data/ dir
widgets/           – Shared widget components
data/              – Runtime JSON state (agents.json, modify-queue.json, etc.)
kanban/            – Standalone kanban demo
```

## The Modifier Overlay (AI GUI)

**This is the core AI feature.** Every app served via `/app/<name>` has a floating overlay injected by `getModifierOverlay()` in `server.js` (line 54). This overlay is **not** in the app's HTML file — it is injected server-side at request time.

### How it works:
1. User opens any app → server injects the overlay HTML/CSS/JS into `</body>`
2. User clicks the pencil button → chat panel appears (top-right corner)
3. User types a modification request → overlay checks `/api/agents` for a live modifier agent
4. If agent alive → posts to `/api/modify-queue` with `{ appId, request, model }`
5. Overlay listens on `/sse/<appId>` for a `change` event on `index.html`
6. When agent finishes editing the app's HTML → SSE fires → page auto-reloads
7. A fullscreen spinner overlay blocks the UI while the agent works

### Modifier overlay key IDs:
- `#__mc-panel` – the chat panel
- `#__mc-overlay` – the fullscreen spinner
- `#__mc-model` – model selector (auto/haiku/sonnet/opus)
- `window.__mcToggle()` – show/hide the panel
- `window.__mcSend()` – submit a modification request

### When NO modifier agent is running:
The overlay shows: "Kein Modifier-Agent verbunden. Starte /guitest-modifier in einer neuen Claude Code Session."

## Agent System

Two agent types managed by `supervisor.js`:

| Type | Skill | Purpose |
|------|-------|---------|
| `modifier` | `guitest-modifier` | Long-polls `/api/modify-wait`, edits app HTML files, reports via `/api/modify-done` |
| `chat` | `guitest-chat` | Long-polls `/api/chat-wait`, answers questions, can edit data files and trigger SSE |

Skills are in `.claude/skills/guitest-modifier/SKILL.md` and `.claude/skills/guitest-chat/SKILL.md`.

### Modifier Agent Loop
1. POST `/api/agent-heartbeat` (registers as alive)
2. GET `/api/modify-wait` — long-polls up to 55s for a task
3. Task contains: `id`, `appId`, `htmlFile`, `request`, `model`, `appName`, `appDescription`
4. Reads and rewrites the full `apps/<appId>/index.html`
5. POST `/api/modify-done` with status and summary
6. Repeat

### Chat Agent Loop
1. POST `/api/agent-heartbeat`
2. GET `/api/chat-wait` — long-polls for a chat message
3. Responds via POST `/api/chat-respond`
4. If data files changed → triggers SSE via POST `/api/notify-change`
5. Repeat

Agents register themselves in `data/agents.json`. Supervisor restarts dead agents after 2 min, max 10 restarts/hour.

> **Note:** The in-app modifier overlay (pencil button chat) requires a running modifier agent. In practice, apps are modified directly via Claude Code in the terminal — the overlay/agent system is aspirational infrastructure.

## Server API Endpoints

- `GET /` → dashboard.html
- `GET /liveos` → liveos.html
- `GET /app/<id>` → serves `apps/<id>/index.html` WITH modifier overlay injected
- `GET /api/agents` → reads data/agents.json
- `POST /api/modify-queue` → queues a modification request
- `GET /sse/<appId>` → SSE stream for file-change notifications
- `GET /api/versions/<appId>` → list saved versions
- `POST /api/restore/<appId>/<version>` → restore a previous version

## Key Constraints

- **No npm/node_modules.** Only Node.js built-ins (http, fs, path, crypto, child_process).
- **No frontend frameworks.** Vanilla ES6+ only.
- **Apps are single HTML files.** Each app lives in `apps/<name>/index.html`.
- **The modifier overlay is NOT part of app HTML files.** It is always injected by server.js. Never add overlay HTML to app files directly.
- **SSE in iframes is blocked.** server.js patches `window.EventSource` in iframes to prevent connection exhaustion. Exception: the terminal app.
- **Version history** is auto-saved before each modification in `apps/<name>/versions/`.

## Running the Project

```bash
node server.js          # Start the server on port 3000
node supervisor.js      # Start the agent supervisor (separate terminal)
```

Then open `http://localhost:3000`.

## Apps Available

alarm, budget, calendar, camera, chat, dashboard, diary, doom, drumcomputer, eggtimer, filebrowser, flappy, imagegen, kanban, mindmap, news-channels, notes, orchestrator, picviewer, pipette, podcast, pulse, radio, recipes, social-trends, terminal, tetris, tickets, travel-planner, weather, whiteboard, youtube, calendar-view

## Data Patterns

- App-specific data: `apps/<name>/data/`
- Global runtime state: `data/` (agents.json, modify-queue.json)
- Kanban-style boards use a JSON-only pattern: HTML is static renderer, all state lives in board.json, polling every 2s detects changes
