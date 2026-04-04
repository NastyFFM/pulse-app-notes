# Plan: Phase 3 — Self-Improvement

## Context
PulseOS soll sich selbst verbessern können. Der App-Maker kann nicht nur Apps in `apps/` bauen, sondern auch `dashboard.html`, `server.js` und andere System-Dateien editieren. Ein "Improve PulseOS" Skill gibt dem Worker die Erlaubnis und das Wissen dafür.

## Schritte

### 1. PulseOS-Improve Skill anlegen
- `.claude/skills/pulseos-improve/SKILL.md`
- Beschreibt: welche System-Dateien editiert werden dürfen
- Regeln: Tests müssen grün bleiben, Review-Loop pflicht
- Referenziert die Architektur aus CLAUDE.md

### 2. System-Dateien als editierbar markieren
- Worker-Prompt erweitern: wenn Task "PulseOS" oder "Dashboard" oder "Server" enthält → PulseOS-Improve Skill laden
- Erlaubte Dateien: dashboard.html, server.js, apps/*/index.html, .claude/*
- Verbotene Dateien: data/*.json (Runtime-State), node_modules

### 3. Safety: Review-Loop erzwingen
- Bei System-Dateien: code-reviewer Agent MUSS GO geben
- Playwright Tests MÜSSEN grün sein nach jeder Änderung
- Automatischer Rollback bei Test-Failure (git stash)

### 4. "PulseOS verbessern" als Template im Store
- Neues Template in data/templates.json
- Beschreibung: "Verbessere PulseOS selbst — Dashboard, Server, Apps"
- Im App-Editor wählbar wenn man PulseOS-System-Dateien ändern will

### 5. Playwright Test
- Test: Worker mit PulseOS-Improve Task → ändert eine System-Datei → Tests grün
