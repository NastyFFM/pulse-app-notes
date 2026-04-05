---
description: Kompletter App-Maker-Flow mit Plan-first Architektur
argument-hint: Beschreibe die App die du bauen willst
---

Baue eine neue PulseOS App. Der User beschreibt was er will:

"$1"

Du nutzt Claude Code's **Agent-Tool** mit den definierten Subagent-Typen.
**Wichtig:** Plan-first — zuerst planen, dann bauen.

## Phase 0 — Plan pruefen oder erstellen

### Neues Projekt (kein PLAN.md vorhanden):

1. Leite ab: **App-Name**, **App-ID** (lowercase, a-z0-9 und Bindestriche)
2. Frage User: Eigenstaendig (Default) oder System-App? → AskUserQuestion
3. Erstelle App via API:
   ```bash
   curl -s -X POST http://localhost:3000/api/apps/create -H 'Content-Type: application/json' \
     -d '{"name":"<Name>","description":"<Desc>","icon":"<Emoji>","color":"<Hex>","standalone":true}'
   ```
4. Registriere Worker (nur Tracking, kein Spawn):
   ```bash
   curl -s -X POST http://localhost:3000/api/workers -H 'Content-Type: application/json' \
     -d '{"task":"build-app: <Name>","model":"sonnet","appId":"<id>","registerOnly":true}'
   ```
   Merke dir `worker.id` fuer Status-Updates.

5. **Starte `planner` Agent** (subagent_type: "planner"):
   - Gib ihm: App-Name, App-ID, Beschreibung, Zielverzeichnis, standalone ja/nein
   - Er erstellt PLAN.md + DECISIONS.md im App-Verzeichnis
   - Er stellt offene Fragen falls noetig

6. **Status-Update:** `Phase 0: Plan erstellt`

7. Falls planner offene Fragen hat → zeige sie dem User, warte auf Antworten, aktualisiere PLAN.md

### Bestehendes Projekt (PLAN.md existiert):

1. **Starte `progress-tracker` Agent** (subagent_type: "progress-tracker"):
   - Gib ihm das App-Verzeichnis
   - Er liest PLAN.md + PROGRESS.md
   - Er gibt zurueck: NEXT_TASKS, IN_PROGRESS, BLOCKED, OPEN_QUESTIONS

2. Falls OPEN_QUESTIONS → zeige dem User, warte auf Antworten
3. Falls IN_PROGRESS → fortsetzen (siehe Phase 2)
4. Falls NEXT_TASKS → starten (siehe Phase 3)

## Phase 1 — Offene Fragen klaeren

Wenn der planner oder progress-tracker offene Fragen meldet:
- Zeige sie dem User via AskUserQuestion
- Aktualisiere PLAN.md mit den Antworten
- Setze PLAN.md status auf `active`

## Phase 2 — Unterbrochene Tasks fortsetzen

Fuer jeden Task mit status `interrupted` in PROGRESS.md:
- Starte den zustaendigen Agent mit Prompt:
  "Lies PLAN.md Task [TASK-ID]. Lies deinen Block in PROGRESS.md — du warst bei [restart_point]. Mach dort weiter."
- Nach Abschluss: Agent schreibt seinen Block in PROGRESS.md
- Status-Update ans Dashboard

## Phase 3 — Naechste Tasks ausfuehren

Fuer jeden Task in NEXT_TASKS aus dem Plan:

**Status-Update ans Dashboard bei jedem Task-Start:**
```bash
curl -s -X PUT http://localhost:3000/api/workers/<worker-id> -H 'Content-Type: application/json' \
  -d '{"progress":"<TASK-ID>: <Beschreibung>...","phases":[...]}'
```

**Tasks starten** mit dem zugewiesenen Agent (subagent_type aus assigned_to):
- `code-generator`: Code schreiben, PulseOS-Konventionen einhalten
- `test-writer`: Playwright E2E Tests, muessen gruen sein
- `code-reviewer`: Review, GO/NO-GO Verdict
- `deploy-configurator`: Deploy-Config erstellen

**Parallelisierung:**
- Tasks OHNE Dependencies → gleichzeitig starten (mehrere Agent-Aufrufe in einer Nachricht)
- Tasks MIT Dependencies → sequentiell nach Reihenfolge

**Nach jedem abgeschlossenen Task:**
1. Agent schreibt seinen Block in PROGRESS.md (status: done, files_created, notes)
2. Markiere Task als [x] in PLAN.md
3. Status-Update ans Dashboard

## Phase 4 — Review-Schleife

Wenn code-reviewer einen **BLOCKER** meldet:
1. Zustaendiger Agent fixt das Problem
2. code-reviewer prueft erneut
3. Max 3 Runden — danach User fragen

Wenn **GO**:
- Weiter zu Phase 5

## Phase 5 — Git + Abschluss

- Eigenstaendige Apps: `cd <app-dir> && git add -A && git commit -m "feat: <desc>"`
- System-Apps: Feature-Branch + Commit im PulseOS-Repo
- Testdatei committen

**PLAN.md status auf `done` setzen.**

**Worker als done markieren:**
```bash
curl -s -X PUT http://localhost:3000/api/workers/<worker-id> -H 'Content-Type: application/json' \
  -d '{"status":"done","progress":"Fertig!","result":"<Summary>"}'
```

**Report:**
```
PLAN.md: X/Y Tasks done
Sessions: N
Dateien: X generiert
Tests: X/X gruen
Review: GO/NO-GO
App: http://localhost:3000/app/<id>/
Naechste Schritte: Template waehlen, deployen, publishen
```
