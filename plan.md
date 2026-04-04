# Plan: Phase 4 — Deploy-Pipeline + Git-Workflow

## Schritte

### 1. Worker erstellt Feature-Branch
- Orchestrator-Prompt erweitern: `git checkout -b feature/<appId>` vor Phase 1
- Nach Phase 4: `git add + commit` auf dem Feature-Branch
- Worker-JSON bekommt `branch` Feld für Tracking

### 2. Auto-PR nach Abschluss
- Nach erfolgreichem Build: `gh pr create` via Bash im Worker
- PR Title: "feat: <app-name> — <beschreibung>"
- PR Body: Phasen-Report (was gebaut, Tests, Review-Ergebnis)
- Link zur PR im Worker-Result + Edit-Chat

### 3. Edit-Chat zeigt PR-Link
- Nach Worker-Done: PR-URL als klickbarer Link im Chat
- User kann direkt zur PR navigieren

### 4. `/build-app` Slash-Command aktivieren
- Bereits in .claude/commands/build-app.md definiert
- Testen ob es funktioniert: `/build-app test-app "Eine Test-App"`

### 5. Branch-Schutz dokumentieren
- CLAUDE.md oder .claude/settings.json: main/develop geschützt
- Worker darf nicht direkt in main pushen

## Betroffene Dateien
- server.js — Orchestrator-Prompt (Git-Workflow Instruktionen)
- dashboard.html — PR-Link im Edit-Chat anzeigen
