# Plan: Template System 2.0

## Aktueller Stand (2026-04-05)
- Branch: feature/app-maker-v2
- Phase 1-9 implementiert (inkl. Edit-Panel 2.0)
- **Schritt 1: Template-Datenmodell ✅**
- **Template Maker Agent ✅**
- **Template Edit mit AI-Chat ✅**
- **Deploy-Steps ✅**
- **App Links & Deployment UI ✅**
- **Template Lifecycle (Löschen/Publish/Reset) ✅**

## Erledigte Schritte

### Schritt 1: Template-Datenmodell erweitern ✅
- `applyTemplateDefaults()` in server.js — 6 neue Felder: agents, scaffold, envVars, git, monitoring, deploySteps
- 4 Builtin-Templates mit spezifischen Werten (progressive-default, frontend, full-stack, nextjs-railway)
- Abwärtskompatibel: alte Templates bekommen Defaults beim GET
- POST/PUT/generate Routes wenden Defaults an
- Template-Details im Settings-Tab (Badges, Gruppen)

### Template Maker Agent ✅
- `POST /api/template-maker/start` — Session erstellen (neu oder edit-mode mit templateId)
- `POST /api/template-maker/{id}/message` — Chat-Routing: AI-Agent wenn alive, State Machine als Fallback
- `GET /api/template-maker/{id}` — Session lesen
- Chat-Agent-Integration: Nachrichten gehen an echten guitest-chat Agent mit Template-Kontext
- `/api/chat-respond` erkennt `tms-*` chatIds und routet Antworten in TM-Sessions
- Dashboard: Template-Maker Chat-Modus im Edit-Panel (Banner, Polling, Quick-Reply Buttons)
- Scaffold-Generierung: Starter-Dateien basierend auf Stacks
- Publish auf GitHub: pulse-template-{id} Repo

### Deploy-Steps ✅
- Neues Template-Feld `deploySteps[]` — strukturierte Deployment-Anweisungen
- Bekannte Actions: github-publish, github-pages, railway-deploy, vercel-deploy, supabase-setup, stripe-setup
- Builtins: progressive/frontend → GitHub+Pages, full-stack → GitHub+Vercel+Supabase+Stripe, nextjs-railway → GitHub+Railway
- Edit-Formular: Deploy-Steps Liste mit Add/Remove Buttons
- Template-Details: Deploy-Steps Anzeige mit URL-Patterns

### App Links & Deployment UI ✅
- Neue "Links & Deployment" Sektion im Settings-Tab
- Zeigt alle erreichbaren URLs klickbar: PulseOS Lokal, GitHub Repo, GitHub Pages, Railway, Vercel, Dashboard
- Ausstehende Deploy-Steps werden als "Pending" angezeigt
- Dynamisch aus App-Metadaten + Template-DeploySteps generiert

### Template Lifecycle ✅
- Löschen-Menü für alle Templates (nicht nur User-Templates)
- User-Templates: Lokal löschen / Von GitHub entfernen / Überall löschen / Publishen
- Builtin-Templates: Auf Defaults zurücksetzen / Von GitHub entfernen / Publishen
- Accounts & Services Sektion: Token-Status, maskierte Werte, Entfernen-Button
- Environment Variables: Collapsed by default (Sicherheit)
- Neue App Dialog: Template-Dropdown mit Profile-Default

### Weitere UI-Verbesserungen ✅
- Template Edit-Formular: Name, Beschreibung, Icon, Stacks, Phasen, Scaffold, EnvVars, Git, Monitoring, Deploy-Steps
- Speichern fragt bei published Templates ob auch GitHub aktualisiert werden soll
- Quick-Create App hat jetzt Template-Dropdown
- Chat-Polling mit Hash-basiertem Vergleich (statt nur Message-Count)

## Nächste Schritte

### Schritt 2: PulseTV als Template exportieren
- GitHub-Repo `pulse-template-youtube-streaming` erstellen
- template.json + instructions.md + scaffold/ Dateien
- **Testen:** Repo auf GitHub prüfen, Template in PulseOS sichtbar

### Schritt 3: Template-Import von GitHub
- POST /api/templates/import — klont Repo, liest template.json, registriert
- **Testen:** Template importieren, im Settings-Tab sichtbar

### Schritt 4: Build-App liest Template-Config
- .claude/commands/build-app.md liest Phasen/Agents aus Template
- Worker nutzt Template-Instruktionen + deploySteps
- **Testen:** App bauen mit Custom-Template, Edit-Panel zeigt richtige Phasen

## Relevante Dateien
- data/templates.json — Template-Registry (mit Template 2.0 Feldern)
- data/templates/*.md — Builtin-Instruktionen
- data/template-maker-sessions/ — Chat-Sessions
- data/template-starters/ — Scaffold-Dateien
- data/tech-stacks.json — Deploy-Plattformen
- server.js — Template-API + Template-Maker + Deploy-Steps
- dashboard.html — Settings-Tab, Template Edit, App Links, Accounts
