---
description: Kompletter App-Maker-Flow — erstellt eine App mit Code, Tests und Deploy-Config
argument-hint: Beschreibe die App die du bauen willst
---

Baue eine neue PulseOS App. Der User beschreibt was er will:

"$1"

## Deine Aufgabe

Fuehre den kompletten 4-Phasen-Flow aus. Leite App-Name und App-ID aus der Beschreibung ab.

### Phase 0 — Vorbereitung
1. Leite aus der Beschreibung ab: App-Name, App-ID (lowercase, nur a-z0-9 und Bindestriche)
2. Frage den User ob die App eigenstaendig (Default) oder eine System-App sein soll — nutze AskUserQuestion
3. Erstelle die App via API:
   curl -s -X POST http://localhost:3000/api/apps/create -H 'Content-Type: application/json' -d '{"name":"<Name>","description":"<Beschreibung>","icon":"<passendes Emoji>","color":"<passende Hex-Farbe>","standalone":true}'
4. Lies CLAUDE.md fuer Projektregeln

### Phase 1 — Code generieren
Starte den `code-generator` Agent:
- Generiere die App im Verzeichnis das /api/apps/create zurueckgibt
- Fuer eigenstaendige Apps: ~/Documents/GitHub/pulse-app-<id>/
- Fuer System-Apps: apps/<id>/ bzw. userdata/apps/<id>/
- manifest.json mit inputs/outputs/dataFiles
- PulseOS SDK Integration (onInput, emit, onDataChanged, saveState, loadState)
- CSS-Variablen statt hardcodierte Farben

### Phase 2 — Tests schreiben
Starte den `test-writer` Agent:
- Playwright E2E Tests in tests/<app-id>.spec.ts
- App-URL: http://localhost:3000/app/<app-id>/
- API-Tests falls die App Endpoints hat
- Tests muessen GRUEN sein

### Phase 3 — Review
Starte den `code-reviewer` Agent:
- Pruefe PulseOS-Konventionen
- Pruefe Sicherheit
- Bei BLOCKER: zurueck zu Phase 1, max 3 Runden
- Bei GO: weiter zu Phase 4

### Phase 4 — Abschluss
- Fuer eigenstaendige Apps: git add + commit im App-Repo
- Fuer System-Apps: git add + commit im PulseOS-Repo
- Testdatei im PulseOS-Repo committen
- Report erstellen:
  ✅ X Dateien generiert
  ✅ X/X Tests gruen
  ✅ App registriert und lauffaehig unter http://localhost:3000/app/<app-id>/
  📋 Naechste Schritte: [Template waehlen, deployen, publishen]
