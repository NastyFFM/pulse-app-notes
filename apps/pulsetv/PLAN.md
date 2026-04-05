# Plan: PulseTV

created: 2026-04-05T21:41:00Z
status: active
app_id: pulsetv
app_dir: /Users/chris.pohl/Documents/GitHub/PulseOS/apps/pulsetv
standalone: false

## Ziel
PulseTV ist eine Video-Discovery und Player App innerhalb PulseOS. Sie bietet Echtzeit-Suche nach Videos (via YouTube-kompatible Invidious Public API), Ergebnisliste mit Thumbnails/Titeln, und einen eingebetteten Video-Player. Als PWA-taugliche Vanilla JS App mit Cookie-basiertem State.

## Stack
- PulseOS Vanilla HTML/CSS/JS (Single-File App)
- PulseOS SDK (saveState, loadState, onInput, emit, onDataChanged)
- CSS-Variablen (var(--bg), var(--text), var(--teal), etc.)
- Invidious Public API (kein API-Key nötig) für YouTube-Suche
- Eingebetteter iframe-Player (YouTube embed via youtube-nocookie.com)

## Aufgaben

### Phase 1 — Grundgerüst
- [x] TASK-001: PLAN.md + DECISIONS.md + PROGRESS.md erstellen
      assigned_to: planner
      depends_on: -
      files: [PLAN.md, DECISIONS.md, PROGRESS.md]
      complexity: low

### Phase 2 — App-Dateien
- [ ] TASK-002: manifest.json + data/state.json anlegen
      assigned_to: code-generator
      depends_on: TASK-001
      files: [manifest.json, data/state.json]
      complexity: low

- [ ] TASK-003: index.html — Layout (Header, Suchleiste, Ergebnisliste, Player)
      assigned_to: code-generator
      depends_on: TASK-002
      files: [index.html]
      complexity: medium

- [ ] TASK-004: Echtzeit-Suche via Invidious API (Debounce 400ms, Live-Resultate)
      assigned_to: code-generator
      depends_on: TASK-003
      files: [index.html]
      complexity: medium

- [ ] TASK-005: Video-Player (YouTube embed, Playlist-Queue, Autoplay)
      assigned_to: code-generator
      depends_on: TASK-004
      files: [index.html]
      complexity: medium

- [ ] TASK-006: PWA-Features (Cookie-State, Backup-Download/Upload, Service Worker hint)
      assigned_to: code-generator
      depends_on: TASK-005
      files: [index.html]
      complexity: low

### Phase 3 — Qualität
- [ ] TASK-007: Code Review
      assigned_to: code-reviewer
      depends_on: TASK-006
      files: []
      complexity: low

### Phase 4 — Abschluss
- [ ] TASK-008: Git commit + Deploy
      assigned_to: orchestrator
      depends_on: TASK-007
      files: []
      complexity: low

## Offene Fragen an User
Keine offenen Fragen — Plan ist bereit.
