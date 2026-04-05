# Nächste Session — Edit-Panel 2.0

## Prompt (kopieren und in neue Claude Code Session einfügen):

```
Wir arbeiten an PulseOS (feature/app-maker-v2 Branch).
Lies plan.md und progress.md für den aktuellen Stand.

Nächste Aufgabe: Edit-Panel 2.0 — den App Editor ins Edit-Panel integrieren.

Was zu tun ist:
- Das Edit-Panel (Stift-Button pro App-Fenster) in dashboard.html erweitern
- Aktuell: nur Chat + Deploy/Publish Buttons
- Neu: Tabs im Panel — Chat, Monitor, Graph, Kanban, Files, Git
- Code aus pulse-app-app-editor/index.html portieren
- App-ID kommt automatisch aus panel.dataset.appid (kein Dropdown nötig)
- Deploy/Publish/Template bleiben als Actions im Chat-Tab
- Polling nur wenn Panel offen ist
- Auch den Worker-Monitor Bug fixen (zeigt keine Worker im iframe)

Relevante Dateien:
- dashboard.html: Edit-Panel ab ~Zeile 2110 (editWin, sendEdit, loadEditChat)
- pulse-app-app-editor/index.html: Source für Monitor, Graph, Kanban, Files, Git Tabs
- server.js: APIs (/api/workers, /api/git/branches, /api/app-files/:appId/:filename)

Nutze das agentische System: code-generator → test-writer → code-reviewer.
Server starten: node server.js (Port 3000)
```

## Kontext für die nächste Session

### Was existiert
- Edit-Panel: dashboard.html Zeile 2110-2560
  - editWin(winId) — öffnet/schließt Panel
  - sendEdit(winId) — sendet Chat an Worker
  - loadEditChat(winId, appId) — lädt Chat-History
  - SSE-Listener für Live-Updates
  - Deploy/Publish/Template Buttons
- App Editor (standalone): pulse-app-app-editor/index.html (45KB)
  - 5 Tabs: Monitor, Graph, Kanban, Files, Git
  - pollWorkers() alle 3s, pollGit() alle 10s
  - renderMonitor(), renderGraph(), renderKanban(), renderGit()
  - Mini-Markdown-Renderer (renderMarkdownSafe)

### Was portiert werden muss
1. Tab-Leiste ins Edit-Panel (Chat als Default-Tab)
2. Monitor-Tab: Worker-Karten + Phasen (gefiltert auf aktuelle App)
3. Graph-Tab: SVG Agent-Graph mit Pulse-Animation
4. Kanban-Tab: Tasks aus PLAN.md der aktuellen App
5. Files-Tab: PLAN.md/PROGRESS.md/DECISIONS.md Viewer
6. Git-Tab: Branch-Visualisierung

### Herausforderungen
- Edit-Panel ist ein schmales Sidebar-Panel (~350px breit) — UI muss kompakter sein
- CSS darf Dashboard nicht brechen (scoped styles nötig)
- Polling nur wenn Panel offen ist (Performance)
- App-ID: panel.dataset.appid (automatisch gesetzt beim Öffnen)
