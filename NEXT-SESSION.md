# Nächste Session — Agentic Chat + Graph Editor

## Prompt:

```
Wir arbeiten an PulseOS (feature/app-maker-v2 Branch).
Lies plan.md und progress.md für den aktuellen Stand.

Nächste Aufgabe: Den Chat im Edit-Panel agentisch machen mit einem Graph Editor.

Das Ziel: Der Chat wird von einem konfigurierbaren Agenten-Netzwerk gesteuert.
Ein visueller Graph Editor definiert welche Agenten es gibt, wie sie verbunden sind,
und wie der Chat Nachrichten routet. Templates liefern die Standard-Konfiguration,
User können sie anpassen.

Starte mit Schritt 1: Graph Editor im Graph-Tab (der existiert schon als Read-Only SVG).
Mach ihn interaktiv: Nodes draggbar, neue Nodes hinzufügen, Verbindungen ziehen.

Wichtig:
- Immer NUR einen Schritt, dann testen wir zusammen
- JEDER Schritt wird mit dem vollen agentischen Orchestrator-Flow umgesetzt:
  1. Worker registrieren → 2. planner → 3. code-generator → 4. progress-tracker
  5. test-writer → 6. code-reviewer → 7. Git commit
  Worker-Status bei jeder Phase updaten für Live-Monitoring im Edit-Panel.
- Server: node server.js (Port 3000)
- Dashboard: http://localhost:3000
```

## Was das Feature umfasst

### 1. Graph Editor (Graph-Tab wird interaktiv)
Der bestehende Read-Only SVG Graph im Graph-Tab wird zum Editor:
- **Drag & Drop Nodes** — Agenten-Nodes verschiebbar
- **Neue Nodes** — "+" Button → neuen Agent hinzufügen (aus bekannten oder custom)
- **Verbindungen** — Klick auf Node-Ausgang → Drag zu Node-Eingang = neue Verbindung
- **Node Config** — Klick auf Node → Sidebar/Popup: Agent-Name, Typ, Timeout, Skills
- **Speichern** — Graph-Config wird ins Template geschrieben (template.agents.graph)
- **Live-Modus** — Während ein Worker läuft, leuchten aktive Nodes (wie jetzt)

### 2. Agent-Typen die wir brauchen

| Agent | Rolle | Trigger |
|-------|-------|---------|
| **Router** | Eingehende Chat-Nachricht → welcher Agent? | Jede Nachricht |
| **Planner** | Aufgabe analysieren, PLAN.md erstellen | Neue Feature-Anfrage |
| **Coder** | Code schreiben (index.html, manifest.json etc.) | Tasks aus PLAN.md |
| **Tester** | Playwright E2E Tests schreiben + ausführen | Nach Code-Phase |
| **Reviewer** | Code-Review, XSS/Qualität, GO/NO-GO | Nach Test-Phase |
| **Deployer** | Deploy-Steps ausführen (GitHub, Railway, Vercel) | Nach Review GO |
| **Onboarder** | Service-Anmeldung begleiten (Links, Tokens) | Wenn Service fehlt |
| **Escalator** | Progressive Deploy: wann nächste Stufe? | Bei Bedarf |

### 3. Chat-Routing (wie der Chat agentisch wird)

```
User-Nachricht
    ↓
[Router Agent] — analysiert Intent
    ↓
┌─ "Baue Feature X" → [Planner] → [Coder] → [Tester] → [Reviewer] → [Git]
├─ "Deploy auf Railway" → [Deployer] → ggf. [Onboarder] wenn Token fehlt
├─ "Füge Supabase hinzu" → [Onboarder] (Link → Signup → Token) → [Coder] (Integration)
├─ "Fixe den Bug" → [Coder] (editMode) → [Tester] → [Reviewer]
└─ "Upgrade auf SaaS" → [Escalator] → [Onboarder] → [Deployer]
```

### 4. Onboarding-Flow im Chat
Wenn Template einen Service definiert den der User noch nicht hat:
1. Chat: "Du brauchst Supabase. Hier anmelden: [Link]"
2. Chat: "Token hier eingeben: [Link zur Token-Seite]"
3. User gibt Token ein → automatisch in Env Vars gespeichert
4. Chat: "✅ Supabase eingerichtet. Erstelle jetzt die DB-Tabellen..."

### 5. Graph → Template Mapping
Der Graph Editor speichert die Config ins Template:
```json
{
  "agents": {
    "graph": {
      "nodes": [
        { "id": "router", "type": "router", "x": 150, "y": 30 },
        { "id": "planner", "type": "planner", "x": 50, "y": 120, "agent": "planner" },
        { "id": "coder", "type": "code-generator", "x": 250, "y": 120, "agent": "code-generator" },
        ...
      ],
      "edges": [
        { "from": "router", "to": "planner", "condition": "intent=build" },
        { "from": "planner", "to": "coder", "condition": "plan-ready" },
        { "from": "coder", "to": "tester", "condition": "code-done" },
        ...
      ]
    },
    "phases": ["Plan", "Code", "Test", "Review", "Git"],
    "phaseConfig": { ... }
  }
}
```

### 6. Implementierungs-Reihenfolge (je 1 Schritt, dann testen)

| # | Schritt | Was |
|---|---------|-----|
| 1 | **Graph Editor Basics** | Nodes draggbar, SVG interaktiv, Positionen speichern |
| 2 | **Node hinzufügen/entfernen** | "+" Button, Node-Typen-Auswahl, Delete |
| 3 | **Verbindungen ziehen** | Edge-Drawing per Drag, Conditions definieren |
| 4 | **Node Config Panel** | Klick auf Node → Agent, Skills, Timeout konfigurieren |
| 5 | **Graph → Template speichern** | Graph-Config ins Template schreiben + laden |
| 6 | **Router Agent** | Neuer Agent der Chat-Nachrichten analysiert + routet |
| 7 | **Onboarder Agent** | Service-Anmeldung im Chat (Links, Token-Eingabe) |
| 8 | **Chat-Integration** | sendEdit() nutzt Graph-Config: Router → Agent-Kette |
| 9 | **Worktree/Git Integration** | Agents arbeiten in Feature-Branches, parallel wenn möglich |
| 10 | **E2E Test** | Komplett-Test: Template → Graph → Chat → Build → Deploy |

### 7. Was wir NICHT brauchen (nur Graph Editor reicht)
Der Graph Editor deckt alles ab:
- Agent-Orchestrierung (Nodes + Edges)
- Routing-Logik (Edge-Conditions)
- Monitoring (Live-Status auf Nodes)
- Template-Config (Graph = Template.agents.graph)
- Kein separates Tool nötig

## Relevante Dateien
- `dashboard.html` — Graph-Tab (epRenderDynamicGraph ~4168), Chat (sendEdit ~2600)
- `server.js` — /api/workers, /api/templates, Template-Maker
- `.claude/agents/*.md` — Agent-Definitionen
- `.claude/commands/build-app.md` — Build-Flow (wird Graph-basiert)
- `data/templates.json` — Template-Registry (agents.graph Feld)
