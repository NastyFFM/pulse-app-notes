# Plan: Agent Dashboard — Transparenter Viewer für das Agent-System

## Context
Ein neues Dashboard das alle internen Prozesse des App-Makers sichtbar macht: laufende Worker, Agents, Skills, MCP Server, .md Files, Fortschritt — alles in Echtzeit.

## Schritte

### 1. Neue App: `apps/agent-dashboard/`
- PulseOS App (vanilla HTML/CSS/JS)
- Tabs: Workers | Agents | Skills | MCP | Files

### 2. Tab: Workers (Live)
- Polling `/api/workers` alle 3s
- Jeder Worker: Status, Progress, Task, Phasen-Icons, Log
- Laufende Worker mit Live-Progress
- Abgeschlossene Worker mit Ergebnis

### 3. Tab: Agents
- Liest `.claude/agents/*.md` via API
- Zeigt: Name, Description, Model, Tools, Isolation
- Frontmatter-Parsing im Browser

### 4. Tab: Skills
- Liest `.claude/skills/*/SKILL.md` via API
- Zeigt: Name, Description, Aktivierungsbedingung
- Status: aktiv/inaktiv

### 5. Tab: MCP
- Liest `.mcp.json` via API
- Zeigt registrierte MCP Server + Status
- Railway MCP, Playwright MCP, PulseOS MCP

### 6. Tab: Files
- Listet alle .md Files in `.claude/` Verzeichnis
- Inline-Viewer für jede Datei
- Zeigt Verknüpfungen (welcher Agent nutzt welchen Skill)

### 7. Server: API Endpoints für Agent-System Introspection
- `GET /api/agent-system/agents` — liest .claude/agents/*.md
- `GET /api/agent-system/skills` — liest .claude/skills/*/SKILL.md
- `GET /api/agent-system/mcp` — liest .mcp.json
- `GET /api/agent-system/files` — listet alle .md Files

## Betroffene Dateien
- `apps/agent-dashboard/index.html` — NEU
- `apps/agent-dashboard/manifest.json` — NEU
- `server.js` — 4 neue API Endpoints
- `data/apps.json` — App registrieren
