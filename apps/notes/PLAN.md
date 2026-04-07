# Plan: Notes App v2

created: 2026-04-07T08:15:00Z
status: active
app_id: notes
app_dir: /Users/chris.pohl/Documents/GitHub/PulseOS/apps/notes

## Ziel
Kompletter Neubau der Notes App von Grund auf. Voll funktionsfähige Notiz-App mit:
- Sidebar + Editor Layout
- Markdown Rendering (live preview toggle)
- Volltextsuche
- Tags/Kategorien
- Auto-Save
- PWA: installierbar, localStorage-Fallback, Backup/Restore
- PulseOS SDK (onInput, emit, onDataChanged, saveState/loadState)
- CSS-Variablen durchgehend

## Stack
- PulseOS Vanilla HTML/CSS/JS (Single-File App)
- PulseOS SDK (/sdk.js)
- CSS-Variablen (var(--bg), var(--text), var(--teal), etc.)
- localStorage für PWA-Modus
- marked.js CDN für Markdown

## Aufgaben

### Phase 1 — Planning
- [x] TASK-001: PLAN.md, PROGRESS.md, DECISIONS.md erstellen
      assigned_to: orchestrator

### Phase 2 — Data Scout
- [x] TASK-002: Externe Datenquellen prüfen (keine nötig für Notes)
      assigned_to: orchestrator

### Phase 3 — Coding
- [ ] TASK-003: index.html komplett neu (Layout + Features)
      assigned_to: code-generator
      files: [index.html]
      complexity: high
- [ ] TASK-004: manifest.json aktualisieren
      assigned_to: code-generator
      files: [manifest.json]
      complexity: low
- [ ] TASK-005: data/notes.json Format sicherstellen
      assigned_to: code-generator
      files: [data/notes.json]
      complexity: low

### Phase 4 — Testing
- [ ] TASK-006: Playwright Tests
      assigned_to: test-writer
      files: [tests/notes.spec.ts]
      complexity: medium

### Phase 5 — Review
- [ ] TASK-007: Code Review
      assigned_to: code-reviewer

### Phase 6 — Deploy
- [ ] TASK-008: GitHub Publish
      assigned_to: orchestrator

### Phase 7 — Git
- [ ] TASK-009: Commit
      assigned_to: orchestrator

## Features Liste
1. Notiz erstellen (Titel + Inhalt)
2. Notiz bearbeiten (Auto-save nach 1s Inaktivität)
3. Notiz löschen (mit Bestätigung)
4. Suche (Echtzeit, Titel + Inhalt)
5. Tags (kommagetrennt, Filter in Sidebar)
6. Markdown Preview (Toggle mit Cmd+P)
7. PWA: localStorage Fallback wenn nicht in PulseOS
8. Backup exportieren (JSON Download)
9. Backup importieren (JSON Upload)
10. Notizen-Zähler in Sidebar-Header
11. Sortierung: Letzte geändert / Alphabetisch
12. "Keine Notizen" Empty State
13. Keyboard Shortcuts (Cmd+N = Neue Notiz, Del = Löschen)
