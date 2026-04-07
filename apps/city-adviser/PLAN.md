# Plan: City Visit Adviser

created: 2026-04-07T16:31:00Z
status: active
app_id: city-adviser
app_dir: /Users/chris.pohl/Documents/GitHub/PulseOS/apps/city-adviser
standalone: false

## Ziel
Ein Stadtführer und Reiseberater der Tipps zu Sehenswürdigkeiten, Restaurants, Aktivitäten
und lokalen Geheimtipps für Städte gibt. Mit Node.js Backend (server.js), statischem Frontend
(index.html), und Deployment auf Railway + GitHub Pages. Template: railway-dynamic-template-demo.

## Stack
- Node.js Backend (server.js) mit HTTP-Modul (kein Express, PulseOS-Konvention)
- Vanilla HTML/CSS/JS Frontend (index.html)
- PulseOS SDK (saveState, loadState, onInput, emit, onDataChanged)
- CSS-Variablen (var(--bg), var(--text), var(--teal), etc.)
- Deployment: Railway (Backend), GitHub Pages (Frontend)
- Daten: cities.json + state.json in data/

## Aufgaben

### Phase 1 — Planung
- [x] TASK-001: PLAN.md + DECISIONS.md erstellen
      assigned_to: planner
      depends_on: -
      files: [PLAN.md, DECISIONS.md]
      complexity: low

### Phase 2 — Grundgerüst
- [ ] TASK-002: server.js erstellen (Node.js HTTP Server, REST API, CORS)
      assigned_to: code-generator
      depends_on: TASK-001
      files: [server.js]
      complexity: medium

- [ ] TASK-003: index.html erstellen (Frontend mit Suche, Karten, Tipps)
      assigned_to: code-generator
      depends_on: TASK-002
      files: [index.html]
      complexity: high

- [ ] TASK-004: manifest.json + data/cities.json + data/state.json erstellen
      assigned_to: code-generator
      depends_on: TASK-001
      files: [manifest.json, data/cities.json, data/state.json]
      complexity: low

- [ ] TASK-005: package.json + railway.json erstellen
      assigned_to: code-generator
      depends_on: TASK-001
      files: [package.json, railway.json]
      complexity: low

### Phase 3 — Qualität
- [ ] TASK-006: E2E Tests schreiben
      assigned_to: test-writer
      depends_on: TASK-003
      files: [tests/city-adviser.spec.ts]
      complexity: medium

- [ ] TASK-007: Code Review
      assigned_to: code-reviewer
      depends_on: TASK-006
      files: []
      complexity: low

### Phase 4 — Abschluss
- [ ] TASK-008: Git commit
      assigned_to: orchestrator
      depends_on: TASK-007
      files: []
      complexity: low

## Offene Fragen an User
Keine offenen Fragen — Plan ist bereit.
