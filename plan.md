# Plan: Nächste Session — Edit-Panel 2.0

## Aktueller Stand (2026-04-05)
- Branch: feature/app-maker-v2
- Phase 1-8 implementiert und verifiziert
- Plan-first Flow funktioniert end-to-end
- App Editor Dashboard als standalone App gebaut
- 4 Apps gebaut mit dem neuen Flow (Pomo, Habit, Expense, Editor)

## Nächste Session: Edit-Panel Integration

### Ziel
Das Edit-Panel (Stift-Button) in dashboard.html wird zum vollwertigen App Editor:
- Tabs: Chat, Monitor, Graph, Kanban, Files, Git
- App-Kontext automatisch aus dem Fenster
- Deploy/Publish/Template bleiben im Chat-Tab

### Implementierung
1. Edit-Panel in dashboard.html (~Zeile 2110-2560) erweitern
2. Code aus pulse-app-app-editor/index.html portieren (Monitor, Graph, Kanban, Files, Git)
3. App-Dropdown entfernen (App-ID kommt aus panel.dataset.appid)
4. CSS inline im Panel (nicht global, um Dashboard nicht zu brechen)
5. Polling nur wenn Panel offen ist

### Noch offen (nicht Edit-Panel)
- Dashboard-Flackern fixen (Polling → SSE/DOM-Diff)
- Self-Improve mit Playwright verifizieren
- App Editor Worker-Monitor iframe-Bug fixen
