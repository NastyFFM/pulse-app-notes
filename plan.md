# Plan: Template System 2.0

## Aktueller Stand (2026-04-05)
- Branch: feature/app-maker-v2
- Phase 1-9 implementiert (inkl. Edit-Panel 2.0)
- Edit-Panel: 8 Tabs (Chat, Monitor, Graph, Kanban, Files, Git, Settings)
- PulseTV als Test-App gebaut mit agentischem Flow
- Alle gepusht auf origin/feature/app-maker-v2

## Ziel
Templates definieren nicht nur Deploy-Stack, sondern den gesamten Build-Prozess:
- Agent-System (welche Phasen, welche Agents)
- Datei-Scaffolding (was wird beim App-Create angelegt)
- Git-Strategie (Branches, Auto-Commit)
- Monitoring (welche Files, Task-Pattern)
- Environment Variables
- Template-Repos auf GitHub (teilbar, klonbar)

## Schritte (einer nach dem anderen, jeweils testen!)

### Schritt 1: Template-Datenmodell erweitern
- `data/templates.json` — neue Felder: agents, scaffold, envVars, git, monitoring
- `server.js` — POST/PUT /api/templates validiert neue Felder
- Abwärtskompatibel: alte Templates bekommen Defaults
- **Testen:** Template im Settings-Tab anschauen, API testen

### Schritt 2: PulseTV als Template exportieren
- GitHub-Repo `pulse-template-youtube-streaming` erstellen
- template.json + instructions.md + scaffold/ Dateien
- **Testen:** Repo auf GitHub prüfen, Template in PulseOS sichtbar

### Schritt 3: Template-Import von GitHub
- POST /api/templates/import — klont Repo, liest template.json, registriert
- **Testen:** Template importieren, im Settings-Tab sichtbar

### Schritt 4: Template-Maker Chat-Agent
- Neuer Skill: template-maker
- Chat-basiert: Stack, Agents, Dateien, Git, Env-Vars klären
- Generiert template.json + instructions.md + scaffold/
- Push auf GitHub
- **Testen:** Im Chat ein neues Template erstellen

### Schritt 5: "Aus Template erstellen" im Dashboard
- Launcher: "Neue App aus Template" → Template-Auswahl
- Klont scaffold/ → erstellt App
- **Testen:** App aus Template erstellen, prüfen ob Dateien stimmen

### Schritt 6: Build-App liest Template-Config
- .claude/commands/build-app.md liest Phasen/Agents aus Template
- Worker nutzt Template-Instruktionen
- **Testen:** App bauen mit Custom-Template, Edit-Panel zeigt richtige Phasen

## Relevante Dateien
- data/templates.json — Template-Registry
- data/templates/*.md — Builtin-Instruktionen
- data/tech-stacks.json — Deploy-Plattformen
- server.js — Template-API
- dashboard.html — Settings-Tab im Edit-Panel
- .claude/commands/build-app.md — Build-Flow
- .claude/agents/*.md — Agent-Definitionen (planner, code-generator, test-writer, code-reviewer, progress-tracker, deploy-configurator)
