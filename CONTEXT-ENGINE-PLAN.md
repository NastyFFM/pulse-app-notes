# PulseOS Context Engine — Architekturplan

> **Status:** Phase 1-4 ✅ abgeschlossen. Phase 5 (Viking) als nächstes.
> **Letzte Aktualisierung:** 2026-03-17
> **Session-Einstieg:** Lies dieses Dokument. Prüfe den Status jeder Phase. Mach da weiter wo ✅ aufhört und 🔲 anfängt.

---

## Vision

Alles in PulseOS wird zu einem **Context**. Ein Context hat einen Chat und ein Widget-Canvas. Widgets können wiederverwendet werden. Sub-Contexts sind Widgets die man betreten kann. Jedes Widget hat 3 Zoom-Stufen (L0/L1/L2) die auf OpenViking's 3-Layer-Pyramide mappen. Daten fließen durch die Hierarchie — nach unten (Vererbung), nach oben (Propagation), und seitwärts (Referenzen).

```
Vorher:  App ≠ Projekt ≠ Context ≠ Agent (4 separate Systeme)
Nachher: Context = alles. Widgets + Chat + Skills + Datenfluss = ein System.
```

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────┐
│                    USER INTERFACE                     │
│  Context-Canvas + Chat (eine einzige UI)             │
│  Widgets mit L0/L1/L2 Zoom — alle editierbar        │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                  CONTEXT ENGINE                      │
│  Context laden → Scope Chain → Skills resolven →     │
│  Schemas laden → Viking fragen → claude -p →         │
│  Actions ausführen → SSE broadcast → Viking sync     │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   ▼          ▼          ▼          ▼
┌────────┐┌────────┐┌────────┐┌────────┐
│ Schema ││Context ││ Skill  ││ Viking │
│Registry││ Store  ││Registry││L0/L1/L2│
└────────┘└────────┘└────────┘└────────┘
```

---

## Kern-Konzepte

### 1. Context = Universelle Einheit

```json
{
  "id": "ctx-abc123",
  "name": "Wochenend-Trip",
  "icon": "🚀",
  "color": "#8B5CF6",
  "parentId": "ctx-leben",
  "created": "2026-03-17T02:00:00Z",
  "updated": "2026-03-17T03:12:16Z",

  "widgets": [
    {
      "id": "w-001",
      "type": "todo",
      "title": "Packliste",
      "size": "md",
      "zoomLevel": "L1",
      "dataKey": "packing-list",
      "scope": "local",
      "config": {}
    },
    {
      "id": "w-002",
      "type": "context",
      "title": "Hotel Research",
      "contextRef": "ctx-hotels",
      "size": "md",
      "zoomLevel": "L0"
    },
    {
      "id": "w-003",
      "type": "kpi",
      "title": "Budget",
      "dataRef": { "contextId": "ctx-leben", "dataKey": "budget" },
      "size": "sm",
      "zoomLevel": "L1"
    }
  ],

  "data": {
    "packing-list": [
      { "id": "t-1", "text": "Pass", "done": false }
    ]
  },

  "skills": ["data-writer", "widget-builder"],
  "chat": [],
  "changelog": []
}
```

### 2. Drei Zoom-Stufen (L0 / L1 / L2)

| Level | Ansicht | Editierbar | Viking Layer |
|-------|---------|------------|-------------|
| **L0** | Dock-Icon: Icon + Titel + Badge | Quick-Actions: Toggle, Zähler, Status | `abstract` (~100 tokens) |
| **L1** | Karte: aktuelle Widget-Ansicht | Inline: Zellen, Werte, Text, + hinzufügen | `overview` (~1-2k tokens) |
| **L2** | Vollansicht / Context betreten | Alles + ✏️ AI-Befehl + Struktur ändern | `read` (full content) |

**L0 Quick-Actions pro Widget-Typ:**
- `todo`: Checkbox togglen, neues Item per +
- `kpi`: Wert direkt editieren
- `table`: Zeilenanzahl als Badge, klick → L1
- `kanban`: Spalten-Counts als Badges
- `context`: Icon + Name + Widget-Count Badge
- `notes`: Erste Zeile als Preview

**L1 Perspektive wählbar:** Gleiche Daten, verschiedene Darstellung
- Tasks → als Todo-Liste ODER Kanban ODER Tabelle
- Umschalten per Button im Widget-Header

### 3. Datenfluss — Drei Richtungen

```
         ↑ PROPAGATION
         │ Daten steigen zum richtigen homeContext auf
         │ z.B. Gewicht → Root ("Ich")
    ┌────┴────┐
    │ Root Ctx│
    └────┬────┘
         │
         ↓ VERERBUNG (scope: "inherited")
         │ Daten fließen automatisch zu Kindern
         │ z.B. Kalender, Budget
    ┌────┴────┐
    │ Kind Ctx│
    └─────────┘
         │
         ↔ REFERENZ (dataRef)
           Gleiche Daten in mehreren Contexts
           z.B. Gewicht in "Abnehmen" = Gewicht in "Sport"
```

**Widget Scopes:**
- `local` — nur in diesem Context sichtbar (Default)
- `inherited` — sichtbar in allen Kind-Contexts
- `global` — überall sichtbar

**dataRef** — Widget zeigt auf Daten in anderem Context:
```json
{
  "type": "kpi",
  "title": "Gewicht",
  "dataRef": { "contextId": "ctx-ich", "dataKey": "gewicht" }
}
```

**homeContext Routing** — AI entscheidet wo Daten hingehören:
- Persönliches Attribut → Root
- Projekt-übergreifend → nächster gemeinsamer Parent
- Lokal → aktueller Context

### 4. Skills statt dauerlaufende Agents

**Alt:** 13 idle Context-Agents die nie starten
**Neu:** Wiederverwendbare Skill-Bausteine die on-demand in den Prompt kommen

| Skill | Zweck |
|-------|-------|
| `data-writer` | Daten lesen/schreiben in jedem Context |
| `data-router` | Entscheidet homeContext für neue Daten |
| `widget-builder` | Widgets erstellen, Typ wechseln, umbauen |
| `schema-resolver` | Schema finden oder erstellen |
| `context-navigator` | Sub-Context erstellen, verlinken |
| `plan-generator` | Implementierungsplan erstellen/updaten |
| `search` | Viking durchsuchen, Patterns finden |

**Ein Chat-Call = ein claude -p mit kombinierten Skills:**
```javascript
async function handleContextChat(contextId, userMessage) {
  const ctx = loadContext(contextId);
  const scopeChain = getScopeChain(contextId);
  const skills = resolveSkills(ctx, userMessage);
  const schemas = getSchemas();

  const prompt = buildPrompt({ ctx, scopeChain, skills, schemas, message: userMessage });
  const response = await spawnClaude(prompt);

  for (const action of response.actions) {
    executeAction(action); // write-data, create-widget, create-subcontext...
  }

  broadcastSSE(affectedContexts);
  syncViking(affectedContexts);
}
```

**Dauerlaufende Agents nur für proaktive Tasks:**
- Timer/Reminder-Agent (Cron)
- Sync-Agent (externe APIs)
- Watcher-Agent (Schwellwerte überwachen)

### 5. Schema-Registry

```json
// data/schemas/task.json
{
  "id": "task",
  "icon": "✓",
  "label": "Aufgabe",
  "fields": {
    "id": { "type": "string", "required": true, "auto": true },
    "text": { "type": "string", "required": true },
    "done": { "type": "boolean", "default": false },
    "priority": { "type": "enum", "options": ["high", "medium", "low"] },
    "dueDate": { "type": "date" }
  },
  "renders": ["todo", "kanban", "table"],
  "defaultRender": "todo"
}
```

**Kern-Schemas:**
- `task` → Todo, Kanban, Tabelle
- `note` → Notizen, Markdown
- `event` → Kalender, Timeline
- `metric` → KPI, Chart
- `link` → Link-Listen
- `record` → Generische Key-Value Datensätze
- `measurement` → Messwerte mit History (Gewicht, Temperatur...)

### 6. Viking-Integration (echte Nutzung)

```
viking://contexts/{contextId}/
  .abstract.md    → L0 (lokal berechnet, kein LLM)
  .overview.md    → L1 (lokal berechnet)
  .full.md        → L2 (voller JSON-Dump)

viking://schemas/{schemaId}    → Schema-Definitionen
viking://patterns/{patternId}  → Bewährte Widget-Kombinationen
```

**Nutzen:**
1. AI fragt Viking vor Widget-Erstellung: "Gibt es ein Pattern für Budget-Dashboard?"
2. Semantische Suche: "Wo hab ich Gewichtsdaten?" → findet über alle Contexts
3. Context-Summaries: Sidebar zeigt L0 aus Viking (schnell, gecacht)
4. Pattern-Speicher: Bewährte Widget-Kombinationen werden gespeichert

---

## Implementierungsplan

### Phase 1: Schema-Registry (Fundament)
> **Status:** ✅ Abgeschlossen (2026-03-17)

**Dateien:**
- [x] `data/schemas/` Verzeichnis erstellen
- [x] `data/schemas/task.json` — Aufgaben
- [x] `data/schemas/note.json` — Notizen
- [x] `data/schemas/event.json` — Events/Termine
- [x] `data/schemas/metric.json` — KPI/Messwerte
- [x] `data/schemas/measurement.json` — Messwerte mit History
- [x] `data/schemas/link.json` — Links
- [x] `data/schemas/record.json` — Generische Records
- [x] `data/schemas/progress.json` — Fortschritt/Phasen

**Server-API (server.js):**
- [x] `GET /api/schemas` — alle Schemas listen
- [x] `GET /api/schemas/:id` — einzelnes Schema
- [ ] `POST /api/schemas` — neues Schema registrieren (noch nicht nötig)
- [ ] Schema-Validierung: Funktion `validateAgainstSchema(data, schemaId)` (Phase 4)

**Akzeptanzkriterien:**
- ✅ 8 Schemas als JSON-Dateien in `data/schemas/`
- ✅ API-Endpoints funktionieren (`GET /api/schemas` + `GET /api/schemas/:id`)
- 🔲 Validierungsfunktion (verschoben nach Phase 4)

---

### Phase 2: Context-Store (Datenschicht)
> **Status:** ✅ Abgeschlossen (2026-03-17)

**Migration:**
- [x] `apps/projects/data/projects.json` → einzelne Context-Dateien in `data/contexts/`
- [x] Migrations-Script: `migrate-projects.js`
- [x] Bestehende Projekte behalten parentId-Beziehungen
- [x] Widget-Daten werden Teil des Context-JSON
- [x] 3 Projekte migriert: ctx-demo, ctx-1773717194327, ctx-1773722277608
- [x] ctx-personal.json beibehalten (nicht überschrieben)

**Server-API (server.js):**
- [x] `GET /api/contexts` — alle Contexts (nur L0: id, name, icon, color, parentId, widgetCount)
- [x] `GET /api/context/:id` — voller Context
- [x] `GET /api/context/:id/summary` — L1 Summary (berechnet)
- [x] `PUT /api/context/:id` — Context speichern
- [x] `POST /api/contexts` — neuen Context erstellen
- [x] `DELETE /api/context/:id` — Context löschen
- [x] `GET /api/context/:id/scope-chain` — geerbte Widgets + Daten
- [x] `GET /api/context-tree` — Baum aller Contexts (nur L0)

**Datenfluss:**
- [x] `getScopeChain(contextId)` — Parent-Kette traversieren (im scope-chain Endpoint)
- [ ] `getVisibleWidgets(contextId)` — eigene + geerbte + globale (Phase 3, Frontend-seitig)
- [ ] `resolveDataRef(dataRef)` — Daten aus referenziertem Context laden (Phase 3)
- [ ] SSE: Bei Änderung → broadcast an Context + alle Kinder die dataRef haben (Phase 3)

**Akzeptanzkriterien:**
- ✅ Jeder Context ist eine eigene JSON-Datei (4 Contexts in `data/contexts/`)
- ✅ Scope-Chain Endpoint traversiert parentId korrekt
- ✅ Alle API-Endpoints getestet und funktionieren
- ✅ Bestehende Projekte sind migriert
- 🔲 dataRef-Auflösung + SSE Cross-Context (Phase 3)

---

### Phase 3: Context-UI (Frontend)
> **Status:** ✅ Abgeschlossen (2026-03-17)

**Basis (apps/projects/index.html umbauen):**
- [x] Daten von `/api/contexts` statt `projects.json` laden
- [x] Sidebar: Context-Baum mit L0-Ansicht (Icon + Name + Badge)
- [x] Breadcrumb: Klickbare Pfad-Navigation
- [x] Canvas: Widgets rendern
- [x] Save → PUT `/api/context/:id`
- [x] Create → POST `/api/contexts`
- [x] Delete → DELETE `/api/context/:id`
- [x] SSE-Anbindung aktualisiert
- [x] Pending Changes pro Context (nicht global)

**Widget-Type "context":**
- [x] L0: Compact pill mit Badge (Widget-Count)
- [x] L1: Summary-Karte (Name, Widget-Count, Klick-Hinweis)
- [x] L2: Klick → navigiere in den Sub-Context
- [x] Auto-generierte virtuelle Context-Widgets für Kind-Contexts
- [x] Visueller Hinweis für geerbte Widgets ("↗ von Parent-Name")

**Zoom-System:**
- [x] Widget-Frame: Zoom-Button (L0 ↔ L1 ↔ L2)
- [x] L0-Rendering: Compact Pill mit L0-Badge pro Widget-Typ
- [x] L1-Rendering = aktuelle Ansicht (bereits implementiert)
- [x] L2-Rendering = erweiterte Vollansicht (grid-column: 1/-1)
- [ ] L0 Quick-Actions: Toggle, Zähler ändern, Status wechseln
- [x] L1 Inline-Edit: wie bisher (contenteditable, onblur)
- [x] L2 Full-Edit: wie bisher + ✏️ AI-Command

**Perspektive-Wechsel (L1):**
- [x] Button im Widget-Header: 👁 (Auge)
- [x] Tasks als Todo ↔ Kanban ↔ Tabelle (gleiche Daten, andere Ansicht)
- [x] Timeline/Links auch als Table darstellbar
- [x] Config `renderAs` im Widget speichern
- [x] Header zeigt "todo → kanban" Hinweis

**Geerbte Widgets im Canvas:**
- [x] Sektion "Von [Parent-Name]" mit visueller Trennung
- [x] Geerbte Widgets mit dashed Border + inherited Badge
- [ ] Geerbte Widget-Edits → Parent-Context speichern (Phase 4)

**Pending Changes Fix:**
- [x] `pendingChanges` pro Context-ID tracken (nicht global)
- [x] Beim Context-Wechsel: pending changes des alten Context behalten

**Akzeptanzkriterien:**
- ✅ Context-Navigation funktioniert (rein/raus/seitwärts)
- ✅ Alle 3 Zoom-Levels rendern (L0 pill, L1 card, L2 full-width)
- ✅ Geerbte Widgets erscheinen mit Herkunfts-Hinweis
- ✅ Perspektive-Wechsel: todo ↔ kanban ↔ table
- ✅ Pending Changes sind Context-gebunden

---

### Phase 4: Skill-System (AI-Integration)
> **Status:** ✅ Abgeschlossen (2026-03-17)

**Context Engine (server.js):**
- [x] `/api/context-chat` Endpoint (neben bestehendem `/api/project-chat`)
- [x] Prompt enthält: Context-Baum, Scope-Chain, Schemas, Cross-Context Widget-Bibliothek
- [x] homeContext-Routing Regeln im Prompt
- [x] Action-Ausführung: create-subcontext, write-data mit homeContext
- [x] `/api/context-plan` Endpoint für Plan-Generierung
- [x] Frontend nutzt `/api/context-chat` statt `/api/project-chat`

**Skill-Registry (vereinfacht — Skills als Prompt-Bausteine statt separate Dateien):**
- [x] Schemas im Prompt = impliziter schema-resolver Skill
- [x] Context-Baum im Prompt = impliziter context-navigator Skill
- [x] homeContext-Regeln im Prompt = impliziter data-router Skill
- [ ] `data/skills/` als separate Dateien (optional, spätere Erweiterung)

**Aufräumen:**
- [ ] 13 idle Context-Agents aus `agents.json` entfernen (späterer Cleanup)

**Akzeptanzkriterien:**
- ✅ Chat in jedem Context funktioniert über `/api/context-chat`
- ✅ AI kennt Context-Baum mit Hierarchie-Marker
- ✅ AI bekommt Schemas für korrekte Datenformate
- ✅ homeContext-Routing Regeln im Prompt
- ✅ create-subcontext und write-data Actions implementiert

---

### Phase 5: Viking-Integration (Context-Gedächtnis)
> **Status:** 🔲 Nicht begonnen

**Auto-Sync:**
- [ ] Bei jedem Context-Save: L0/L1/L2 berechnen
- [ ] L0 = `{icon} {name} | {widgetCount} widgets | {lastUpdate}` (deterministisch)
- [ ] L1 = Widget-Summaries + Key-Metriken + letzte Changelog-Einträge (deterministisch)
- [ ] L2 = Voller Context-JSON
- [ ] Nach Viking schreiben: `viking://contexts/{contextId}/`

**Semantische Suche:**
- [ ] Sidebar: Suchfeld das über alle Contexts sucht
- [ ] Ergebnisse als L0-Karten mit Klick → Navigation
- [ ] AI nutzt Viking-Suche: "Gibt es schon ein Widget für X?"

**Pattern-Speicher:**
- [ ] Bewährte Widget-Kombinationen als Pattern speichern
- [ ] `viking://patterns/{patternId}` mit L0/L1/L2
- [ ] AI fragt: "Gibt es ein Pattern für Budget-Dashboard?" → findet es
- [ ] Pattern als Template für neue Contexts nutzbar

**Akzeptanzkriterien:**
- Jeder Context hat aktuelle L0/L1/L2 Daten in Viking
- Suche findet Daten über alle Contexts hinweg
- AI nutzt Viking aktiv für Pattern-Matching

---

### Phase 6: Polish & Erweiterungen
> **Status:** 🔲 Nicht begonnen

- [ ] Performance: Lazy-Loading für tiefe Context-Bäume
- [ ] Zirkuläre Referenzen: Visited-Set bei Scope-Chain-Traversierung
- [ ] Widget-Templates: Save/Load für wiederverwendbare Widgets
- [ ] Linked Widgets: dataRef mit Live-Sync (SSE cross-context)
- [ ] ActionChains aktivieren: Event → Chain → Aktion
- [ ] Proaktive System-Agents: Timer, Sync, Watcher
- [ ] Dashboard-Integration: Context-Launcher statt App-Launcher
- [ ] LiveOS-Merge: Canvas-System von LiveOS in Context-UI integrieren

---

## Was wir STREICHEN

| Komponente | Warum |
|-----------|-------|
| 13 idle Context-Agents in `agents.json` | Werden zu on-demand Skills |
| `apps/projects/data/projects.json` (monolithisch) | Wird zu einzelnen Context-Dateien |
| Separate Agent-Skills in `.claude/skills/<agent>/` | Werden zur Skill-Registry in `data/skills/` |
| LiveOS als separates System | Wird in Context-UI integriert |
| Viking Fire-and-Forget Import | Wird zu echtem Sync mit L0/L1/L2 |

## Was wir BEHALTEN

| Komponente | Warum |
|-----------|-------|
| `claude -p` Spawning | Zuverlässig, on-demand |
| SSE + debounced PUT | Perfektes Sync-Pattern |
| Widget-Rendering (8 Typen) | Wird erweitert, nicht ersetzt |
| Chat + Canvas UI-Pattern | Funktioniert, intuitiv |
| Modifier + Chat System-Agents | Bleiben für HTML-Editing |
| Vanilla JS, kein Framework | Feature, kein Bug |
| `server.js` als Single-Server | Einfach, debuggbar |

---

## Abhängigkeiten

```
Phase 1 (Schemas) ──────────┐
                             ├──→ Phase 4 (Skills/AI)
Phase 2 (Context-Store) ────┤
                             ├──→ Phase 3 (UI)
                             │
                             └──→ Phase 5 (Viking)
                                        │
Phase 6 (Polish) ←──────────────────────┘
```

Phase 1 + 2 können parallel gebaut werden.
Phase 3 braucht Phase 2.
Phase 4 braucht Phase 1 + 2.
Phase 5 braucht Phase 2 + 4.

---

## Aktuelle Dateien (Referenz)

**Server:** `/Users/chris.pohl/Documents/GitHub/PulseOS/server.js` (~3144 Zeilen)
**Projects App:** `/Users/chris.pohl/Documents/GitHub/PulseOS/apps/projects/index.html` (~2535 Zeilen)
**Context View Widget:** `/Users/chris.pohl/Documents/GitHub/PulseOS/widgets/context-view.js` (~623 Zeilen)
**Viking Bridge:** `/Users/chris.pohl/Documents/GitHub/PulseOS/viking-bridge.py` (~340 Zeilen)
**Supervisor:** `/Users/chris.pohl/Documents/GitHub/PulseOS/supervisor.js`
**Agents Registry:** `/Users/chris.pohl/Documents/GitHub/PulseOS/data/agents.json`
**Action Chains:** `/Users/chris.pohl/Documents/GitHub/PulseOS/data/action-chains.json`
**Root Context:** `/Users/chris.pohl/Documents/GitHub/PulseOS/data/root-context.json`
**Bestehende Contexts:** `/Users/chris.pohl/Documents/GitHub/PulseOS/data/contexts/`
**Project Data:** `/Users/chris.pohl/Documents/GitHub/PulseOS/apps/projects/data/projects.json`

---

## Session-Start Checkliste

Wenn du eine neue Session startest:

1. **Lies dieses Dokument** (`CONTEXT-ENGINE-PLAN.md`)
2. **Prüfe Phase-Status**: Welche Checkboxen sind ✅?
3. **Lies die letzte Phase** die in Arbeit war (🔧)
4. **Prüfe `data/schemas/`** — existiert es? Wieviele Schemas?
5. **Prüfe `data/contexts/`** — gibt es migrierte Context-Dateien?
6. **Prüfe `server.js`** — gibt es `/api/contexts` und `/api/context-chat` Endpoints?
7. **Prüfe `apps/projects/index.html`** — lädt es von `/api/contexts`?
8. **Mach da weiter wo 🔲 anfängt**

---

## Entscheidungslog

| Datum | Entscheidung | Begründung |
|-------|-------------|-----------|
| 2026-03-17 | Skills statt dauerlaufende Agents | 13 idle Agents sind Verschwendung. On-demand ist effizienter. |
| 2026-03-17 | Schema trennt Daten von Darstellung | Gleiche Daten verschiedene Views. Weniger Token, bessere UX. |
| 2026-03-17 | homeContext-Routing durch AI | Daten gehören dorthin wo sie semantisch hinpassen, nicht wo sie eingegeben werden. |
| 2026-03-17 | L0/L1/L2 alle editierbar | Read-only Zoom-Stufen widersprechen dem "alles anpassbar" Prinzip. |
| 2026-03-17 | Scope-System (local/inherited/global) | Ermöglicht Datenvererbung ohne Duplikation. |
| 2026-03-17 | Viking als Pattern-Speicher | Gibt AI echtes Gedächtnis über bewährte Widget-Kombinationen. |
| 2026-03-17 | ContextView als Basis-Renderer | Existiert bereits (623 Zeilen), kann auto-detect, ist reaktiv. Nicht nochmal bauen. |
| 2026-03-17 | Pending Changes pro Context | Bug: User editiert in Context A, wechselt zu B, committed → falscher Context. |
