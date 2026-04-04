---
name: pulseos-improve
description: Verbessert PulseOS selbst — Dashboard, Server, System-Komponenten. Aktiviert wenn User PulseOS, Dashboard, Server oder System-Features aendern will.
---

# PulseOS Self-Improvement Skill

## Wann aktiv
Wenn der User PulseOS selbst verbessern will: Dashboard-UI, Server-Endpoints, System-Komponenten, Dock, Launcher, Chat, Window-Manager, etc.

## Architektur-Ueberblick

```
server.js          — HTTP Server, alle API-Endpoints, Worker-Spawn
dashboard.html     — Desktop Shell: Dock, Launcher, Window-Manager, Chat, App-Grid
liveos.html        — Canvas-Workspace mit Widget-Frames
apps/*/index.html  — Einzelne Apps (vanilla HTML/CSS/JS)
.claude/agents/    — Agent-Definitionen (code-generator, test-writer, etc.)
.claude/skills/    — Skills (Deploy, Improve, etc.)
data/              — Runtime JSON State (NICHT editieren!)
```

## Editierbare System-Dateien

### Erlaubt ✅
- `server.js` — API-Endpoints, Worker-Logik, SSE, Routing
- `dashboard.html` — Desktop UI, Dock, Launcher, Window-Manager, Chat
- `liveos.html` — Canvas-Workspace
- `apps/*/index.html` — Jede App
- `apps/*/manifest.json` — App-Metadaten
- `.claude/agents/*.md` — Agent-Definitionen
- `.claude/skills/*/SKILL.md` — Skill-Definitionen
- `.claude/commands/*.md` — Slash-Commands
- `playwright.config.ts` — Test-Config
- `tests/*.spec.ts` — Tests

### Verboten ❌
- `data/*.json` — Runtime State (apps.json, agents.json, chat-history.json)
- `data/workers/*.json` — Worker Logs
- `node_modules/` — Dependencies
- `.env*` — Secrets
- `.git/` — Git Internals

## Safety-Regeln (PFLICHT)

### 1. Vor jeder Aenderung
- Lies die aktuelle Datei komplett
- Verstehe was der Code tut
- Nutze Edit (nicht Write) fuer bestehende Dateien

### 2. Nach jeder Aenderung
- Syntax-Check: `node -c server.js` (fuer JS)
- Tests laufen lassen: `npx playwright test`
- Wenn Tests rot: SOFORT revertieren (`git checkout -- <datei>`)

### 3. Review-Loop
- Bei System-Dateien (server.js, dashboard.html): code-reviewer MUSS GO geben
- Bei BLOCKER: Fix oder Revert, NIEMALS mit kaputtem Code committen
- Max 3 Fix-Versuche, dann User fragen

### 4. Kein Breaking Change ohne Test
- Neue Endpoints: Test schreiben der den Endpoint prueft
- UI-Aenderungen: Playwright Screenshot oder Visibility-Test
- Bestehende Funktionalitaet darf nicht brechen

## Haeufige Verbesserungen

### Dashboard (dashboard.html)
- Neue Shortcuts hinzufuegen (keydown handler ~Z.2717)
- App-Grid Layout aendern (renderAppGrid ~Z.1781)
- Dock erweitern (renderDock ~Z.1945)
- Chat-Features (sendToAgent ~Z.3954)
- Window-Manager (openApp ~Z.2063)

### Server (server.js)
- Neue API-Endpoints (nach bestehenden Patterns)
- Worker-Logik erweitern (~Z.8630)
- SSE-Events hinzufuegen (broadcast Funktion)
- Template/Skill System erweitern

### Tests (tests/)
- Playwright E2E Tests in tests/*.spec.ts
- Server laeuft auf localhost:3000
- `npx playwright test` zum Ausfuehren

## Commit-Konvention
- feat: Neues Feature
- fix: Bug Fix
- refactor: Code-Verbesserung ohne Feature-Aenderung
- test: Tests hinzufuegen/aendern
- docs: Dokumentation
