---
description: Kompletter App-Maker-Flow — erstellt eine App mit Code, Tests und Deploy-Config
argument-hint: [app-name] [beschreibung]
---

Baue eine PulseOS App namens "$1" mit folgender Beschreibung: $2

## Phase 0 — Vorbereitung
- Erstelle Branch `feature/$1` von aktuellem Branch
- Erstelle `apps/$1/` Verzeichnis
- Lies CLAUDE.md fuer Projektregeln

## Phase 1 — Code generieren
Starte den `code-generator` Agent (Worktree-isoliert):
- Generiere die App in `apps/$1/`
- manifest.json mit inputs/outputs
- PulseOS SDK Integration
- CSS-Variablen statt hardcodierte Farben

## Phase 2 — Tests schreiben
Starte den `test-writer` Agent:
- Playwright E2E Tests in `tests/$1.spec.ts`
- API-Tests falls die App Endpoints hat
- Tests muessen GRUEN sein

## Phase 3 — Review
Starte den `code-reviewer` Agent:
- Pruefe PulseOS-Konventionen
- Pruefe Sicherheit
- Bei BLOCKER: zurueck zu Phase 1, max 3 Runden
- Bei GO: weiter zu Phase 4

## Phase 4 — Abschluss
- App in `data/apps.json` registrieren (via POST /api/apps/create oder direkt)
- Alle Aenderungen committen
- Report erstellen:
  ✅ X Dateien generiert
  ✅ X/X Tests gruen
  ✅ App registriert und lauffaehig
  📋 Naechste Schritte: [Template waehlen, deployen, publishen]
