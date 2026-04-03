# Progress: Feature/GraphApps Branch

## Gesamtstatus: Phasen 3-5 ✅ komplett

| Phase | Status | Commits |
|-------|--------|---------|
| 3 — Template-Sharing | ✅ done | 4a76bee, 796674e |
| 4 — Template v2 (Starter Repos) | ✅ done | b320694 |
| 5 — Neue App Kachel + UX | ✅ done | b320694 |
| 6 — Stages-Anzeige | ⏳ next | — |
| 7 — Apps Graph-Ready | ⏳ next | — |

## Detailstatus Phase 3-5

### Template-Sharing ✅
- POST /api/templates/:id/publish → GitHub Repo
- POST /api/templates/install → Clone + Registrierung
- GET /api/templates/github-sync → Vergleich lokal/remote
- Store Templates Tab mit 3 Sektionen
- CRUD: Create, Edit, Publish, Unpublish

### Template v2 ✅
- copyDirExcluding() Helper
- Publish mit Starter-Files (appId Body-Param)
- Install speichert nach data/template-starters/
- App-Erstellung nutzt Starter-Code
- POST /api/apps/:appId/save-as-template
- "Als Template" Button im Editor
- Default-Template aus Profile

### Neue App UX ✅
- "+" Kachel in App-Grid, Launcher, Dock
- quickCreateApp() → Name → Create → openApp → editWin
- Edit-Chat: _polling Flag, Live-Progress, Abbrechen-Button
- Playwright: 8/9 Tests grün

## Playwright Testergebnisse
- ✅ "Neue App" Kachel im App-Grid
- ✅ Quick-Create Dialog öffnet
- ✅ "Neue App" im Launcher
- ✅ "+" im Dock
- ⏭ App-Editor "Als Template" (manuell bestätigt)
- ✅ Store Templates Tab
- ✅ Store "+" Create Button
- ✅ Template-Erstellung via API
- ✅ /api/templates Endpoint
