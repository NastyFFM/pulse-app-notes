# Progress: feature/app-maker-v2 — Gesamtübersicht

## Erledigte Phasen ✅

| Phase | Was | Commits |
|-------|-----|---------|
| 1 | Agent-Infrastruktur (4 Agents, Skills, Commands) | ee07e61 |
| 2 | Orchestrator-Worker (4 Phasen, Agent-Defs laden) | 9947c09 |
| 3 | Self-Improvement (Skill, Auto-Detect, Playwright MCP) | dc7b89c, c73f057 |
| 4 | Git-Workflow (Feature-Branches, Auto-PR) | aef3c3d, 8ad305b |
| - | Agent Dashboard (Workers, Agents, Skills, MCP, Files) | e66ce1d |
| - | Smart Autodetect (orchestriert vs quick) | f3ce7a6 |
| - | Launcher Shortcut Cmd+L | 91729ab |
| - | Orchestrator-Detection Fix (data-newapp) | b4df862 |
| 5 | Eigenständige Apps vs System-Apps | 905f0ce |
| 6 | /build-app Command Fix + Agent-Tool Integration | 199f49c, 63d0e4f |
| 7 | Plan-first Architektur (planner + progress-tracker) | 4f48c86 |
| 8 | App Editor Dashboard (Monitor, Graph, Kanban, Files, Git) | 82838d7, 0ade96c |

## Session 2026-04-05 — Was gebaut wurde

### Neue Features
- **Eigenständige Apps**: quickCreateApp() + showCreateDialog() mit Radio (Standalone/System)
- **Plan-first Flow**: planner + progress-tracker Agents, PLAN.md/PROGRESS.md/DECISIONS.md pro App
- **`/build-app` Command**: Nutzt Agent-Tool Subagents, Worker-API für Dashboard-Tracking, registerOnly
- **App Editor**: 5-Tab Dashboard (Build Monitor, Agent Graph, Kanban, Files, Git)
- **Git API**: GET /api/git/branches — Branches, Commits, Refs
- **App Files API**: GET /api/app-files/:appId/:filename — .md Dateien aus App-Root

### Apps gebaut (alle standalone, Plan-first)
- **Pomo Timer** (pulse-app-pomo-timer) — 7/7 Tests
- **Habit Tracker** (pulse-app-habit-tracker) — 5/5 Tests
- **Expense Splitter** (pulse-app-expense-splitter) — 5/5 Tests, 11 Tasks
- **App Editor** (pulse-app-app-editor) — 5/5 Tests, 9 Tasks

### Architektur-Änderungen
- 2 neue Agents: planner.md, progress-tracker.md
- Alle Worker-Agents schreiben PROGRESS.md Blöcke
- server.js: resolveAppDir() für standalone, registerOnly, app-files, git API
- Security Fixes: Command Injection, Path Validation, quoted rm -rf

## Bekannte Issues
- ~~Apps werden im PulseOS-Repo erstellt statt eigenständig~~ ✅
- Dashboard flackert bei Polling
- Self-Improve Playwright-Verifikation noch nicht zuverlässig
- App Editor: Worker-Monitor zeigt nicht korrekt in iframe (JS-Fehler?)
- App Editor: Toter Code (2x Markdown-Renderer)

## Nächste Session: Edit-Panel 2.0

Das Edit-Panel (Stift-Button pro App) wird zum integrierten Editor:
- Chat + Monitor + Graph + Kanban + Files + Git in einem Panel
- App-ID automatisch aus dem Fenster-Kontext
- Deploy/Publish/Template als Actions im Chat-Tab
- Hauptdatei: dashboard.html (Edit-Panel ~Zeile 2110-2560)

## Architektur-Stand
```
.claude/
├── agents/
│   ├── planner.md            ← NEU: Plant vor Code
│   ├── progress-tracker.md   ← NEU: Session-Kontinuität
│   ├── code-generator.md     (+ Plan-Integration)
│   ├── test-writer.md        (+ Plan-Integration)
│   ├── deploy-configurator.md
│   └── code-reviewer.md      (+ Plan-Integration)
├── skills/ (railway, vercel, pulseos-improve)
├── commands/
│   └── build-app.md          ← Plan-first Flow
└── servers/
    └── pulseos-mcp.js

Standalone Apps: ~/Documents/GitHub/pulse-app-<name>/
  ├── index.html, manifest.json, data/state.json
  ├── PLAN.md, PROGRESS.md, DECISIONS.md
  └── .git/ (eigenes Repo)

Worker-Flow (Plan-first):
  planner → PLAN.md →
  progress-tracker → NEXT_TASKS →
  code-generator (Tasks) → PROGRESS.md →
  test-writer → Tests grün →
  code-reviewer → GO/NO-GO →
  git commit
```
