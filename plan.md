# Plan: Feature/GraphApps — Gesamtübersicht

## Erledigte Phasen

### Phase 3: Template-Sharing im Store ✅
- Template Publish/Install/Sync via GitHub (`pulse-template-*` Repos)
- Templates Tab im Store mit Publish/Unpublish/Update Buttons
- Kontakt-Templates im Katalog
- Template CRUD: Create (+), Edit (✏️), Unpublish (⬇) im Store

### Phase 4: Template v2 — Starter Repos + Save-from-Project ✅
- `copyDirExcluding()` Helper in server.js
- Publish erweitert: Starter-Files aus App-Verzeichnis ins GitHub Repo
- Install erweitert: Starter-Files nach `data/template-starters/<id>/`
- App-Erstellung mit Starter-Code statt Boilerplate
- `POST /api/apps/:appId/save-as-template` + KI-generierte Instruktionen
- "Als Template" Button im App-Editor
- Default-Template in Profile + Worker nutzt es

### Phase 5: "+" Neue App Kachel + UX ✅
- "+" Kachel als erstes Element in App-Grid, Launcher, Dock
- `quickCreateApp()`: Name → Create → openApp → editWin (auto)
- Template-Picker im Create-Dialog mit Profile-Default
- Edit-Chat Spinner Fix: `_polling` Flag vor PUT, Live-Progress-Anzeige
- Playwright Tests: 8/9 grün

## Offene nächste Schritte

### Phase 6: Stages-Anzeige im Editor (Polishing)
- Template-Eintrag bekommt `stages[]` Array
- App-Editor zeigt Progress-Bar der Deployment-Stufen
- Klick auf zukünftige Stage → "Upgrade?" → Worker starten

### Phase 7: Apps Graph-Ready machen
- Fehlende Manifests: budget, chat, pulse, todo
- Apps ohne I/O Ports: music, settings, projects, terminal, files
- Graph-App Manifests: generische Platzhalter durch echte typisierte Ports
- `nodeType` setzen (producer/transformer/consumer)

## Betroffene Dateien (Gesamtübersicht)
- `server.js` — Template v2 Endpoints, copyDirExcluding, save-as-template, unpublish
- `dashboard.html` — quickCreateApp, renderAppGrid/Launcher/Dock, Edit-Chat Polling Fix
- `apps/store/index.html` — Template CRUD UI
- `tests/template-v2-ui.spec.ts` — Playwright Tests
- `playwright.config.ts` — Test-Config
