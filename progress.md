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

## Bekannte Issues
- Apps werden im PulseOS-Repo erstellt statt eigenständig (nächste Session)
- Dashboard flackert bei Polling
- Self-Improve Playwright-Verifikation noch nicht zuverlässig
- Worker wechselt Branch im Hauptrepo (git checkout -b statt worktree)

## Architektur-Stand
```
.claude/
├── agents/
│   ├── code-generator.md     (worktree, sonnet, 30 turns)
│   ├── test-writer.md        (worktree, sonnet, 20 turns)
│   ├── deploy-configurator.md (worktree, haiku, 15 turns)
│   └── code-reviewer.md      (sonnet, 10 turns)
├── skills/
│   ├── railway-deploy/SKILL.md
│   ├── vercel-deploy/SKILL.md
│   └── pulseos-improve/SKILL.md
├── commands/
│   └── build-app.md
└── servers/
    └── pulseos-mcp.js

Worker-Flow: quickCreateApp → POST /api/workers (orchestrated) →
  Phase 1: Code (direkt in apps/) →
  Phase 2: Playwright + Tests →
  Phase 3: Review →
  Phase 4: Branch + Commit + PR
```
