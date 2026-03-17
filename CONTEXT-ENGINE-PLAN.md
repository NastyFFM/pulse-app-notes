# PulseOS Context Engine — Architekturplan

> **Status:** Phase 1-7 ✅, Phase 8 🔧 in Arbeit. dataRef API + Frontend rendering done.
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
> **Status:** ✅ Abgeschlossen (2026-03-17)

**Auto-Sync:**
- [x] Bei jedem Context-Save: L0/L1/L2 berechnen (deterministisch, kein LLM)
- [x] L0 = `{icon} {name} | {widgetCount} Widgets: widget-badges`
- [x] L1 = Markdown: ID, Parent, Updated, Widget-Details, letzte Changelog-Einträge
- [x] L2 = Voller Context-JSON
- [x] Nach Viking schreiben: `viking://resources/contexts/{contextId}`
- [x] Debounced (2s) — kein Spam bei schnellen Edits

**Semantische Suche:**
- [x] `POST /api/context-search` — Viking semantische Suche + lokaler Fallback
- [x] Sidebar: Suchfeld mit Debounce (300ms) und Dropdown-Ergebnissen
- [x] Ergebnisse als L0-Karten mit Icon, Name, Badge → Klick navigiert
- [x] AI nutzt Viking-Suche im Prompt: "Ähnliche Contexts als Referenz"

**Pattern-Speicher:**
- [ ] Bewährte Widget-Kombinationen als Pattern speichern (Phase 6)
- [ ] `viking://patterns/{patternId}` mit L0/L1/L2 (Phase 6)

**Akzeptanzkriterien:**
- ✅ Jeder Context-Save triggert Viking L0/L1/L2 Sync
- ✅ Suche findet Contexts (Viking oder lokaler Fallback)
- ✅ AI bekommt ähnliche Contexts als Referenz im Prompt

---

### Phase 6: Bugfixes & UX-Polish
> **Status:** ✅ Abgeschlossen (2026-03-17)

- [x] Zoom-Toggle vereinfacht: L1 ↔ L0 statt verwirrendem 3-Stufen-Zyklus
- [x] Virtuelle Context-Widgets (Unterprojekte) sind jetzt zoombar
- [x] Sidebar re-rendert korrekt bei Projekt-Wechsel (Hierarchie-Bug)
- [x] Zoom-Button bleibt in L0-Modus sichtbar (CSS-Fix)

---

### Phase 7: L0 Quick-Actions (Interaktives Minimieren)
> **Status:** ✅ Abgeschlossen (2026-03-17)
>
> **Ziel:** L0 ist nicht nur "minimiert", sondern eine interaktive Kompaktansicht.
> Jeder Widget-Typ zeigt in L0 einen Badge UND erlaubt 1-Klick-Aktionen.

**Todo-Widget L0:**
- [x] Checkbox-Toggles direkt in der Pill-Zeile (Mini-Checkboxen neben Badge)
- [x] "+" Button zum schnellen Hinzufügen eines Items
- [x] Badge zeigt `3/7 ✓` (done/total)

**KPI-Widget L0:**
- [x] Wert inline editierbar (klick auf Zahl → Input)
- [x] Trend-Pfeil (↑/↓/→) basierend auf vorherigem Wert
- [x] Badge zeigt aktuellen Wert + Einheit

**Notes-Widget L0:**
- [x] Erste Zeile als Preview-Text in der Pill
- [x] Klick auf Text → expand zu L1
- [x] Badge zeigt Zeichenanzahl

**Table-Widget L0:**
- [x] Zeilenanzahl als Badge
- [x] Letzte Zeile als Mini-Preview
- [x] "+" Button für neue Zeile

**Kanban-Widget L0:**
- [x] Spalten-Counts als farbige Mini-Badges (`3 | 2 | 5`)
- [x] Klick auf Spalten-Badge → expand zu L1

**Context-Widget L0:**
- [x] Icon + Name + Widget-Count Badge (bereits implementiert)
- [x] Status-Indicator: letztes Update-Datum als relative Zeit

**Timeline-Widget L0:**
- [x] Nächstes/aktuelles Event als Badge
- [x] Countdown oder relative Zeit

**Progress-Widget L0:**
- [x] Mini-Fortschrittsbalken + Prozent-Anzeige

**CSS/UX für L0 Quick-Actions:**
- [x] L0-Pill flexible Höhe (auto statt fixed 44px) für Klick-Targets
- [x] Quick-Action Buttons: 22x22px, transparent, hover-Effekt
- [x] Inline-Inputs: transparent bg, Fokus-Ring

**Akzeptanzkriterien:**
- ✅ Jeder Widget-Typ hat mindestens eine L0-Aktion (nicht nur Badge)
- ✅ Quick-Actions speichern sofort (kein extra Save nötig)
- ✅ L0-Pill bleibt kompakt (flexible Höhe, 1-2 Zeilen)
- ✅ Tastatur: Enter bestätigt, Escape bricht ab (KPI-Input)

---

### Phase 8: dataRef — Live-Datenreferenzen
> **Status:** 🔧 In Arbeit (2026-03-17)
>
> **Ziel:** Ein Widget zeigt Daten aus einem anderen Context.
> Änderungen propagieren live über SSE.

**Server-API (server.js):**
- [x] `GET /api/context/:id/data/:dataKey` — einzelnen Datensatz lesen
- [x] `PUT /api/context/:id/data/:dataKey` — einzelnen Datensatz schreiben
- [x] SSE: Bei Daten-Änderung → broadcast an alle Contexts die via dataRef referenzieren (`notifyDataRefSubscribers`)
- [x] `GET /api/context/:id/refs` — alle eingehenden dataRefs auf diesen Context

**dataRef-Registry (server.js):**
- [x] Bei PUT auf dataKey: alle Contexts scannen → betroffene via SSE benachrichtigen (live scan statt Index-Datei)
- [ ] Beim Context-Save: dataRefs extrahieren und in Index speichern (`data/dataref-index.json`) — Optional, Performance-Optimierung
- [ ] Index-Struktur: `{ "ctx-source:dataKey": ["ctx-ref1:widgetId", "ctx-ref2:widgetId"] }` — Optional

**Frontend (apps/projects/index.html):**
- [x] Widget erkennt `dataRef` → lädt Daten von `GET /api/context/:id/data/:dataKey`
- [x] SSE-Listener für `dataref-update` Event → Canvas neu rendern
- [x] `saveDataRef()` Hilfsfunktion zum Schreiben an Remote-Context
- [x] Visueller Hinweis: "📌 Daten aus [Context-Name]" Badge im Widget-Header + Body
- [ ] Bearbeitung eines dataRef-Widgets → `PUT` an den Source-Context (nicht lokal speichern)
- [ ] dataRef-Erstellung: Widget-Edit-Panel → "Daten verlinken" Button → Context+DataKey Picker

**homeContext-Routing (AI-seitig):**
- [ ] AI im `/api/context-chat` Prompt: wenn Daten thematisch "nach oben" gehören → `write-data` Action mit `targetContextId` statt lokalem Speichern
- [ ] AI erstellt automatisch ein dataRef-Widget im aktuellen Context das auf die Quelle zeigt
- [ ] Prompt-Regeln: "Gewicht → Root", "Budget → nächster Parent mit Budget-Widget"

**Akzeptanzkriterien:**
- 🔲 Widget mit `dataRef` zeigt Live-Daten aus anderem Context
- 🔲 Bearbeitung in Ref-Widget schreibt in Source-Context
- 🔲 SSE propagiert Änderungen an alle Referenzen
- 🔲 AI nutzt homeContext-Routing für neue Daten

---

### Phase 9: Geerbte Widget-Edits + Schema-Validierung
> **Status:** 🔲 Wartend auf Phase 8
>
> **Ziel:** Geerbte Widgets editierbar machen + Datenintegrität sichern.

**Geerbte Widget-Edits:**
- [ ] Edit eines inherited Widgets → `PUT /api/context/:parentId` (nicht lokaler Context)
- [ ] UI: Edit-Modus zeigt "Änderung wird in [Parent-Name] gespeichert" Hinweis
- [ ] SSE: Parent-Save triggert Re-Render in allen Kind-Contexts
- [ ] Scope-Override: Kind kann inherited Widget lokal überschreiben (lokale Kopie, bricht Vererbung)

**Schema-Validierung (server.js):**
- [ ] Funktion `validateAgainstSchema(data, schemaId)` implementieren
- [ ] Bei `PUT /api/context/:id` → alle Widgets mit `schema` Feld validieren
- [ ] Validierungsfehler: 400 Response mit Details, Frontend zeigt Fehler-Toast
- [ ] AI-Prompt: Schemas als Constraint "Daten MÜSSEN diesem Schema entsprechen"

**Akzeptanzkriterien:**
- 🔲 Geerbtes Widget editiert → Parent wird aktualisiert
- 🔲 Alle Kind-Contexts sehen die Änderung live
- 🔲 Schema-Validierung verhindert invalide Daten
- 🔲 AI hält sich an Schemas

---

### Phase 10: Widget-Templates & Pattern-Speicher
> **Status:** 🔲 Wartend auf Phase 9
>
> **Ziel:** Bewährte Widget-Kombinationen speichern und wiederverwenden.

**Widget-Templates:**
- [ ] "Als Template speichern" Button im Widget-Header (Speichert Widget + Datenstruktur)
- [ ] `data/templates/` Verzeichnis mit Template-JSON-Dateien
- [ ] Template-Picker in der Chat-Sidebar: "Template einfügen" → Liste → Klick → Widget erstellt
- [ ] Template enthält: Widget-Config + leere Datenstruktur + Schema-Referenz

**Context-Templates:**
- [ ] Ganzen Context als Template speichern (alle Widgets + Struktur, ohne Daten)
- [ ] "Neues Projekt aus Template" Option bei Context-Erstellung
- [ ] Vordefinierte Templates: "Budget-Dashboard", "Projekt-Tracker", "Tagebuch"

**Viking Pattern-Speicher:**
- [ ] Bewährte Widget-Kombinationen in `viking://patterns/` speichern
- [ ] AI fragt Viking: "Gibt es ein Pattern für X?" → schlägt Template vor
- [ ] Pattern-Learning: häufig genutzte Widget-Kombis automatisch als Pattern erkennen

**Akzeptanzkriterien:**
- 🔲 Widget als Template speicherbar und wieder einfügbar
- 🔲 Context-Templates für häufige Projekt-Typen
- 🔲 AI nutzt Viking-Patterns für Vorschläge

---

### Phase 11: Dashboard & System-Integration
> **Status:** 🔲 Wartend auf Phase 10
>
> **Ziel:** PulseOS Desktop wird zum Context-Browser.

**Dashboard-Integration:**
- [ ] `dashboard.html`: Context-Launcher neben App-Launcher
- [ ] Root-Context als "Desktop" — Widgets auf dem Desktop = Root-Widgets in L0
- [ ] Dock zeigt favorisierte Contexts als Icons
- [ ] Klick auf Context-Icon → öffnet Projects-App mit diesem Context

**Proaktive System-Agents:**
- [ ] Timer-Agent: Cron-basiert, prüft Events/Deadlines, erstellt Reminder-Widgets
- [ ] Sync-Agent: Externe APIs (Wetter, Kalender) → Viking importieren
- [ ] Watcher-Agent: Schwellwerte überwachen (Budget < 100€ → Alert-Widget)

**Cleanup:**
- [ ] 13 idle Context-Agents aus `data/agents.json` entfernen
- [ ] Alte `apps/projects/data/projects.json` archivieren/entfernen
- [ ] LiveOS-Canvas Konzepte in Context-UI evaluieren

**Performance:**
- [ ] Lazy-Loading: Context-Baum nur 2 Ebenen tief laden, Rest on-demand
- [ ] Zirkuläre Referenzen: Visited-Set bei Scope-Chain + dataRef Traversierung
- [ ] Context-Cache: L0-Daten im Memory cachen (Invalidierung via SSE)

**Akzeptanzkriterien:**
- 🔲 Dashboard zeigt Context-Baum neben Apps
- 🔲 Proaktive Agents laufen und erstellen Widgets
- 🔲 Performance bleibt gut bei 50+ Contexts

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
                             ├──→ Phase 3 (UI) ──→ Phase 6 (Bugfixes)
                             │
                             └──→ Phase 5 (Viking)
                                        │
Phase 7 (L0 Quick-Actions) ←───────────┘  ← NÄCHSTE PHASE
        │
        ▼
Phase 8 (dataRef Live-Sync)
        │
        ▼
Phase 9 (Inherited Edits + Validierung)
        │
        ▼
Phase 10 (Templates + Patterns)
        │
        ▼
Phase 11 (Dashboard + System)
```

Phase 1-6 ✅ abgeschlossen.
Phase 7 braucht Phase 3 + 6 (Zoom muss funktionieren).
Phase 8 braucht Phase 7 (L0 muss Quick-Actions können für Ref-Widgets).
Phase 9 braucht Phase 8 (dataRef muss existieren für inherited Edits).
Phase 10 braucht Phase 9 (Schemas validiert → Templates sicher).
Phase 11 braucht Phase 10 (Templates für Dashboard-Presets).

---

## Aktuelle Dateien (Referenz)

**Server:** `server.js` (~3800+ Zeilen)
**Projects App:** `apps/projects/index.html` (~2800+ Zeilen)
**Context View Widget:** `widgets/context-view.js` (~623 Zeilen)
**Viking Bridge:** `viking-bridge.py` (~340 Zeilen)
**Supervisor:** `supervisor.js`
**Schemas:** `data/schemas/` (8 Dateien: task, note, event, metric, measurement, link, record, progress)
**Contexts:** `data/contexts/` (ctx-*.json Dateien, jeweils mit eigenem Unterverzeichnis)
**Agents Registry:** `data/agents.json`
**Root Context:** `data/root-context.json`

**Wichtige Code-Stellen in server.js:**
- Context CRUD API: ~Zeile 1567-1750
- Viking Sync: ~Zeile 498-580
- Context Search: ~Zeile 2749
- Context Chat: ~Zeile 2841
- Context Plan: ~Zeile 3447

**Wichtige Code-Stellen in apps/projects/index.html:**
- State-Objekt: `state = { contexts, activeContextId, activeContext, inheritedWidgets, ... }`
- Zoom CSS: ~Zeile 578
- createWidgetFrame(): ~Zeile 1666
- cycleZoom(): ~Zeile 2728
- renderCanvas(): ~Zeile 1520
- renderProjectList(): ~Zeile 1445
- selectProject(): ~Zeile 1369
- createProject(): ~Zeile 1274
- Chat sendMessage(): ~Zeile 2412

---

## Session-Start Checkliste

Wenn du eine neue Session startest:

1. **Lies dieses Dokument** (`CONTEXT-ENGINE-PLAN.md`)
2. **Prüfe Phase-Status**: Welche Phasen sind ✅? Welche ist 🔧 (in Arbeit) oder 🔲 (nächste)?
3. **Lies die nächste 🔲 Phase** und ihre Checkboxen — hier weitermachen
4. **Schnellcheck** (nur wenn unsicher):
   - `data/schemas/` → 8 JSON-Dateien? ✅
   - `data/contexts/` → Context-Dateien vorhanden? ✅
   - `server.js` → `/api/contexts`, `/api/context-chat`, `/api/context-search` existieren? ✅
   - `apps/projects/index.html` → lädt von `/api/contexts`, Zoom = L0↔L1 Toggle? ✅
5. **Frage den User** was er als nächstes möchte, falls die nächste Phase nicht klar ist
6. **Nach jeder Teilaufgabe**: Checkbox in diesem Dokument updaten (🔲 → ✅)
7. **Nach jedem Commit**: Kurz den Phase-Status oben im Dokument aktualisieren

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
| 2026-03-17 | Zoom = L0↔L1 Toggle, kein 3-Stufen-Zyklus | 3 Stufen verwirrend: L2→L1 nicht sichtbar, 2x klicken zum Schrumpfen. Resize-Button (↔) für Größe. |
| 2026-03-17 | L0 muss interaktiv sein, nicht nur minimiert | Reine Pill ohne Aktionen ist nutzlos. Quick-Actions (Toggle, Edit, +) machen L0 zur Power-Ansicht. |
| 2026-03-17 | dataRef vor Templates | Datenfluss ist architektonisch wichtiger als Templates. Templates brauchen stabile Datenstruktur. |
| 2026-03-17 | Phasen 7-11 statt eine "Phase 6 Polish" | Jede Phase hat klare Akzeptanzkriterien und Abhängigkeiten. Besser planbar, Session-übergreifend trackbar. |
