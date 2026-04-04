# Plan: Phase 2 — Orchestrator-Worker

## Context
Der aktuelle Worker (`POST /api/workers`) spawnt einen einzigen `claude -p` Prozess mit monolithischem Prompt. Phase 2 baut das um zu einem Orchestrator der die 4 Agents aus Phase 1 sequentiell aufruft.

## Schritte

### 1. Orchestrator-Prompt bauen
- Neuer Prompt-Builder in server.js der statt eines monolithischen Prompts einen Orchestrator-Flow beschreibt
- Der Orchestrator liest die Agent-Definitionen aus `.claude/agents/`
- Flow: code-generator → test-writer → code-reviewer → Fix-Loop

### 2. Worker-Spawn anpassen
- `POST /api/workers` bekommt neuen `mode: "orchestrated"` Parameter
- Bei `orchestrated`: Orchestrator-Prompt statt monolithischer Prompt
- Bei `editMode: true` (bestehende Apps editieren): bleibt wie bisher (einzelner Worker)
- Progress-Updates pro Phase in worker.json

### 3. Multi-Step Progress im Edit-Chat
- Worker-JSON bekommt `phases` Array mit Status pro Phase
- Edit-Chat zeigt: "Phase 1/4: Code generieren..." → "Phase 2/4: Tests..." etc.
- Polling liest `w.phases` und zeigt aktuellen Schritt

### 4. Playwright Test
- Test: Worker mit orchestrated mode erstellen → Phasen durchlaufen → done

## Betroffene Dateien
- server.js — Worker-Spawn (~Z.8600), Orchestrator-Prompt
- dashboard.html — Edit-Chat Multi-Step Progress
