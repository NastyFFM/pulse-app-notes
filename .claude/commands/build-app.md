---
description: Kompletter App-Maker-Flow — erstellt eine App mit Code, Tests und Deploy-Config
argument-hint: Beschreibe die App die du bauen willst
---

Baue eine neue PulseOS App. Der User beschreibt was er will:

"$1"

## Deine Aufgabe

Fuehre den kompletten 4-Phasen-Flow aus. Leite App-Name und App-ID aus der Beschreibung ab.
Du nutzt Claude Code's eingebautes **Agent-Tool** mit den definierten Subagent-Typen.

### Phase 0 — Vorbereitung

1. Leite aus der Beschreibung ab: **App-Name**, **App-ID** (lowercase, nur a-z0-9 und Bindestriche)
2. Frage den User ob die App eigenstaendig (Default) oder System-App sein soll — nutze AskUserQuestion
3. Erstelle die App via API:
   ```bash
   curl -s -X POST http://localhost:3000/api/apps/create -H 'Content-Type: application/json' \
     -d '{"name":"<Name>","description":"<Beschreibung>","icon":"<Emoji>","color":"<Hex>","standalone":true}'
   ```
4. **Registriere einen Worker** im Dashboard (nur registrieren, NICHT spawnen — wir steuern die Agents selbst):
   ```bash
   curl -s -X POST http://localhost:3000/api/workers -H 'Content-Type: application/json' \
     -d '{"task":"build-app: <App-Name>","model":"sonnet","appId":"<app-id>","registerOnly":true}'
   ```
   Merke dir die `worker.id` aus der Antwort fuer Status-Updates.

### Phase 1 — Code generieren

**Status-Update ans Dashboard:**
```bash
curl -s -X PUT http://localhost:3000/api/workers/<worker-id> -H 'Content-Type: application/json' \
  -d '{"progress":"Phase 1/4: Code generieren...","phases":[{"name":"Code","status":"running"}]}'
```

**Starte den Agent:** Nutze das Agent-Tool mit `subagent_type: "code-generator"`:
- Gib dem Agent eine klare Aufgabe: App-Beschreibung, Zielverzeichnis, PulseOS-Konventionen
- Fuer eigenstaendige Apps: ~/Documents/GitHub/pulse-app-<id>/
- Fuer System-Apps: apps/<id>/ oder userdata/apps/<id>/
- manifest.json mit inputs/outputs/dataFiles
- PulseOS SDK Integration (onInput, emit, onDataChanged, saveState, loadState)
- CSS-Variablen statt hardcodierte Farben

**Nach Abschluss Status updaten:**
```bash
curl -s -X PUT http://localhost:3000/api/workers/<worker-id> -H 'Content-Type: application/json' \
  -d '{"progress":"Phase 1/4 done: Code generiert","phases":[{"name":"Code","status":"done"}]}'
```

### Phase 2 — Tests schreiben

**Status-Update:** `Phase 2/4: Tests schreiben...`

**Starte den Agent:** Nutze das Agent-Tool mit `subagent_type: "test-writer"`:
- Playwright E2E Tests in tests/<app-id>.spec.ts
- App-URL: http://localhost:3000/app/<app-id>/
- Server laeuft bereits — NICHT neu starten
- Tests muessen GRUEN sein

**Nach Abschluss:** `Phase 2/4 done: Tests gruen`

### Phase 3 — Review

**Status-Update:** `Phase 3/4: Code Review...`

**Starte den Agent:** Nutze das Agent-Tool mit `subagent_type: "code-reviewer"`:
- Pruefe PulseOS-Konventionen, Sicherheit, Code-Qualitaet
- Ergebnis: GO oder NO-GO
- Bei NO-GO mit BLOCKER: gehe zurueck zu Phase 1 (max 3 Runden)

**Nach Abschluss:** `Phase 3/4 done: Review GO` (oder NO-GO)

### Phase 4 — Git + Abschluss

**Status-Update:** `Phase 4/4: Git commit...`

- Fuer eigenstaendige Apps: `cd ~/Documents/GitHub/pulse-app-<id> && git add -A && git commit -m "feat: <beschreibung>"`
- Fuer System-Apps: Feature-Branch + Commit im PulseOS-Repo
- Testdatei im PulseOS-Repo committen

**Worker als "done" markieren:**
```bash
curl -s -X PUT http://localhost:3000/api/workers/<worker-id> -H 'Content-Type: application/json' \
  -d '{"status":"done","progress":"Fertig!","phases":[{"name":"Code","status":"done"},{"name":"Tests","status":"done"},{"name":"Review","status":"done"},{"name":"Git","status":"done"}],"result":"App <name> gebaut. X Dateien, X Tests gruen, Review GO."}'
```

**Report ausgeben:**
```
✅ X Dateien generiert
✅ X/X Tests gruen
✅ Review: GO/NO-GO
✅ App lauffaehig: http://localhost:3000/app/<app-id>/
📋 Naechste Schritte: Template waehlen, deployen, publishen
```
