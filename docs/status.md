# Status: AppMaker / Unified Publishing Panel

Stand: 2026-03-31

## Existiert bereits

### App Actions (`app-actions.js`)
- `renderButtons(app, opts)` :107 — Flat-Liste aller Buttons (Publish, Deploy, Hide, Delete)
- `_uiPublish(appId, btn)` :181 — GitHub Publish via POST /api/apps/:id/publish
- `_uiDeploy(appId, btn)` :193 — Deploy via POST /api/apps/:id/deploy
- `_uiSmartDeploy(appId, btn)` :258 — Stack-Check → Onboarding → Deploy
- `onboardStack(stackId, btn, container)` :288 — Inline Onboarding-Wizard
- `getStatus(app)` :95 — Status-Berechnung (isPublished, isDeployed, etc.)

### Dashboard Edit-Panel (`dashboard.html`)
- Edit-Panel HTML :2006-2016 — Chat, Template-Dropdown, Env Vars, Action Buttons
- `editWin(winId)` :2051 — Toggle Edit-Panel
- `renderEditActions(winId, appId)` :2129 — Ruft `AppActions.renderButtons(app, {showDeploy:true})`
- `loadTemplateDropdown(winId)` :2065 — Fetcht /api/templates, populiert Select
- `saveTemplateChoice(winId, tplId)` :2097 — Speichert Template-Wahl

### Store (`apps/store/index.html`)
- `renderMyApps(el)` :211 — Rendert "Meine Apps" mit GitHub-Sync
- Nutzt `AppActions.renderButtons(a, {onOpen:'openAppInPulse', showDeploy:true})` :284
- `openAppInPulse(appId)` :378 — postMessage an Parent

### Server (`server.js`)
- Deploy-Endpoint POST /api/apps/:id/deploy :2636 — Generic, liest tech-stacks.json
- Template CRUD /api/templates :2387-2476
- Stack-Status GET /api/stacks/status
- Onboarding: /api/stacks/install-cli, /api/stacks/save-key, /api/stacks/cli-login

### Daten
- `data/templates.json` — 8 Templates (2 builtin + 6 user-created)
- `data/tech-stacks.json` — 6 Stacks (Railway, Supabase, Stripe, Vercel, Cloudflare, Netlify)
- `data/.env` — Globale Service-Keys

## Fehlt

- **`showPublishingPanel(appId)`** — Existiert nicht. Kein Modal/Drawer.
- **`renderPublishingPanel()`** — Existiert nicht. Kein gruppiertes Panel-Layout.
- **Sektions-Gruppierung** — Alle Buttons sind eine flache Liste ohne GitHub/Deploy/Manage Trennung
- **Stack-Status Anzeige im Panel** — Stacks werden nur beim Deploy-Klick geprüft, nicht vorher angezeigt
- **Template → Stack Mapping im UI** — Template-Wechsel aktualisiert nicht die Stack-Anzeige
- **Store → Dashboard Panel Bridge** — Store kann kein Publishing Panel im Dashboard öffnen
- **Edit-Panel "Publish" Button** — Kein dedizierter Einstiegspunkt im Editor

## Bekannte Issues
- Deploy-Flow bricht nach "Railway bereit!" manchmal ab
- Dashboard-Icons öffnen Apps nicht immer zuverlässig
- Launcher schließt nicht immer nach App-Öffnung
