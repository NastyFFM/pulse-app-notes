# Plan: Agentic Chat + Graph Editor

## Aktueller Stand (2026-04-06)
- Branch: feature/app-maker-v2
- Phase 1-10 implementiert (Edit-Panel 2.0, Template System 2.0)
- Edit-Panel: 8 Tabs (Chat, Monitor, Graph, Kanban, Files, Git, Settings)
- Templates: Erweitertes Datenmodell, Template Maker, Deploy-Steps, App Links
- Graph-Tab: Dynamischer SVG Graph (Read-Only, zeigt aktive Agents)
- Settings: Collapsible Sections, Skill-Filter in Agent-Edit

## Ziel
Der Chat im Edit-Panel wird von einem konfigurierbaren Agenten-Netzwerk gesteuert.
Ein visueller Graph Editor definiert Agenten, Verbindungen und Routing.
Templates liefern Standard-Konfiguration, User können sie im Graph Editor anpassen.

## Schritte (einer nach dem anderen, jeweils testen!)

### Schritt 1: Graph Editor Basics
- Graph-Tab SVG wird interaktiv: Nodes draggbar (mousedown/move/up)
- Positionen werden auf panel._epState gespeichert
- Edit-Mode Toggle (View ↔ Edit)
- **Testen:** Nodes verschieben, Positionen bleiben beim Tab-Wechsel

### Schritt 2: Nodes hinzufügen/entfernen
- "+" Button über dem Graph → Agent-Typ-Auswahl (Dropdown der bekannten Agents)
- Delete: Rechtsklick oder X-Button auf Node
- Node-Typen: Router, Planner, Coder, Tester, Reviewer, Deployer, Onboarder, Custom
- **Testen:** Neuen Node hinzufügen, positionieren, löschen

### Schritt 3: Verbindungen (Edges)
- Drag von Node-Rand zu anderem Node = neue Edge
- Edge hat Label/Condition (z.B. "intent=build", "code-done", "review=GO")
- Edges löschen per Klick + Delete
- **Testen:** Zwei Nodes verbinden, Edge mit Condition versehen

### Schritt 4: Node Config Panel
- Klick auf Node → Config-Bereich unter dem Graph
- Felder: Agent-Name, zugewiesener .claude/agent, Skills (mit Filter!), Timeout
- Für Onboarder: Service-Links, Token-Felder
- **Testen:** Node konfigurieren, Werte bleiben erhalten

### Schritt 5: Graph ↔ Template Sync
- "Speichern" Button → schreibt Graph in template.agents.graph
- Beim Öffnen: lädt Graph aus aktuellem Template
- Template-Wechsel im Settings-Tab → Graph aktualisiert sich
- **Testen:** Graph editieren, Template wechseln, speichern, neu laden

### Schritt 6: Router Agent
- Neuer Agent: .claude/agents/router.md
- Analysiert Chat-Nachricht → bestimmt Intent → wählt nächsten Agent
- Intents: build, fix, deploy, onboard, escalate, question
- **Testen:** Nachricht im Chat → Router erkennt Intent korrekt

### Schritt 7: Onboarder Agent
- Neuer Agent: .claude/agents/onboarder.md
- Prüft welche Services im Template definiert sind
- Für fehlende Services: Link zur Anmeldeseite → Token-Seite → Auto-Speichern
- **Testen:** Template mit Supabase → User hat kein Token → Onboarding-Chat

### Schritt 8: Chat nutzt Graph-Config
- sendEdit() liest Graph aus Template
- Router bestimmt Agent-Kette
- Agents werden sequentiell/parallel ausgeführt (je nach Edges)
- Worker-Status zeigt Graph-Fortschritt
- **Testen:** "Baue Feature X" → Planner→Coder→Tester→Reviewer→Git im Graph sichtbar

### Schritt 9: Worktree/Git Integration
- Agents arbeiten in Feature-Branches (git worktree)
- Parallele Tasks in eigenen Worktrees
- Auto-Merge nach Review GO
- **Testen:** Parallele Tasks, Branches im Git-Tab sichtbar

### Schritt 10: E2E Integration Test
- Komplett-Flow: Template laden → Graph konfigurieren → Chat-Nachricht → Build → Deploy
- **Testen:** Neues Projekt von Template, alles durch den Graph gesteuert

## Relevante Dateien
- dashboard.html — Graph-Tab (epRenderDynamicGraph), Chat (sendEdit), Settings
- server.js — /api/workers, /api/templates, Template-Maker
- .claude/agents/*.md — Agent-Definitionen (6 existierende + 2 neue: router, onboarder)
- .claude/commands/build-app.md — Build-Flow (wird Graph-basiert)
- data/templates.json — Template-Registry (agents.graph Feld)
