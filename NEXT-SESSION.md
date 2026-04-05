# Nächste Session — Template System 2.0

## Prompt (kopieren und in neue Claude Code Session einfügen):

```
Wir arbeiten an PulseOS (feature/app-maker-v2 Branch).
Lies plan.md und progress.md für den aktuellen Stand.

Nächste Aufgabe: Template System 2.0 — Schritt für Schritt.

Kontext:
- Edit-Panel 2.0 ist fertig (8 Tabs: Chat, Monitor, Graph, Kanban, Files, Git, Settings)
- PulseTV wurde als Test-App mit dem agentischen Flow gebaut
- Templates definieren aktuell nur Stack + Instruktionen
- Wir erweitern Templates zur vollständigen Projekt-Blaupause

Starte mit Schritt 1: Template-Datenmodell erweitern
- data/templates.json — neue Felder: agents, scaffold, envVars, git, monitoring
- server.js — API-Validation anpassen
- Abwärtskompatibel (alte Templates bekommen Defaults)
- Danach zusammen testen!

Wichtig:
- Immer NUR einen Schritt, dann testen wir zusammen
- Nutze das agentische System: planner → code-generator → test-writer → code-reviewer
- Server: node server.js (Port 3000)
- Dashboard: http://localhost:3000
```

## Kontext für die nächste Session

### Was fertig ist
- Edit-Panel 2.0: dashboard.html (8 Tabs, Resize, Settings)
- Agentischer Build-Flow funktioniert end-to-end
- PulseTV gebaut + 6/6 Tests + XSS-Fix + committed
- server.js: /api/git/branches?appId= für app-spezifisches Repo

### Aktuelles Template-Datenmodell
```json
{ "id", "name", "description", "icon", "stacks", "instructions", "author", "builtin", "source" }
```

### Neues Template-Datenmodell (zu implementieren)
```json
{
  "id", "name", "description", "icon", "author", "stacks", "instructions", "source",
  "agents": { "phases": [...], "phaseConfig": {...}, "orchestrated": true },
  "scaffold": { "files": [...], "directories": [...] },
  "envVars": [{ "key", "label", "required" }],
  "git": { "strategy", "branchPattern", "autoCommit", "autoPR" },
  "monitoring": { "planFile", "progressFile", "decisionsFile", "taskPattern" }
}
```

### Template-Repo-Struktur (Ziel)
```
pulse-template-{id}/
├── template.json       ← Erweiterte Metadaten
├── instructions.md     ← Build-Instruktionen
├── scaffold/           ← Dateien für App-Create
│   ├── index.html
│   ├── manifest.json
│   └── data/state.json
└── agents/             ← (Optional) Custom Agents
```

### 6 Schritte (einer pro Runde)
1. Template-Datenmodell erweitern
2. PulseTV als Template exportieren
3. Template-Import von GitHub
4. Template-Maker Chat-Agent
5. "Aus Template erstellen" im Dashboard
6. Build-App liest Template-Config
