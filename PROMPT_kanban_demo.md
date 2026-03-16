# Kanban Board: Local-First App mit Claude Code als Backend

## Konzept

Erstelle ein Kanban-Board bestehend aus 3 Dateien. Die HTML-Datei wird EINMAL erzeugt und NIEMALS neu generiert. Alle Zustandsänderungen passieren NUR über die JSON-Datendatei. Claude Code ist das Backend – es editiert die JSON, die GUI rendert sie.

## Dateistruktur

```
kanban/
├── server.js           # Micro-Server (Node.js built-in, kein npm)
├── kanban.html          # Die GUI (einmal erzeugt, nie wieder angefasst)
└── data/
    └── board.json       # DIE EINZIGE DATEI DIE SICH ÄNDERT
```

---

## 1. server.js – Micro-Server

NUR Node.js built-in Module (http, fs, path). Kein Express, kein npm install.

**Endpunkte:**
- `GET /` → Liefert kanban.html
- `GET /api/board` → Liest `data/board.json`, liefert JSON
- `PUT /api/board` → Empfängt JSON-Body, schreibt nach `data/board.json` (prettified, 2 spaces)

**Regeln:**
- Maximal 50 Zeilen
- Port 3000
- CORS erlauben
- Jede Aktion loggen: `[SAVE] board.json updated`, `[LOAD] board.json served`

---

## 2. data/board.json – Die Daten

```json
{
  "meta": {
    "title": "Mein Projekt",
    "lastModified": "2026-02-26T14:30:00Z"
  },
  "columns": [
    {
      "id": "col-1",
      "name": "Backlog",
      "color": "#6B7280",
      "tasks": [
        {
          "id": "task-1",
          "title": "Recherche",
          "desc": "Thema eingrenzen",
          "priority": "high",
          "created": "2026-02-26"
        }
      ]
    },
    {
      "id": "col-2",
      "name": "In Arbeit",
      "color": "#3B82F6",
      "tasks": []
    },
    {
      "id": "col-3",
      "name": "Fertig",
      "color": "#10B981",
      "tasks": []
    }
  ]
}
```

Erstelle Beispieldaten mit 5-6 Tasks verteilt über die Spalten.

---

## 3. kanban.html – Die GUI

### KERNPRINZIP: Dummer Renderer

Die HTML-Datei weiß NICHTS über den Inhalt. Alles kommt aus der JSON:
- Wie viele Spalten? → JSON
- Welche Tasks? → JSON
- Spaltenfarben? → JSON
- Board-Titel? → JSON

### Datenfluss

```
Beim Laden:
  fetch('/api/board') → JSON → renderBoard(data) → DOM

Bei jeder Änderung (drag, edit, add, delete):
  state mutieren → renderBoard(state) → fetch PUT '/api/board'

Alle 2 Sekunden (Polling):
  fetch('/api/board') → Hash vergleichen → bei Änderung: state = neu, re-render
  (Das ist der CLOU: Wenn Claude die JSON editiert, sieht der User es nach max 2s)
```

### Funktionen

**Rendern:**
- Liest `state.columns` und erzeugt dynamisch eine Spalte pro Eintrag
- Spaltenanzahl ist NICHT hardcoded
- Spaltenfarbe aus `column.color` als Header-Hintergrund

**Drag & Drop:**
- HTML5 native (dragstart, dragover, drop)
- Tasks zwischen Spalten verschiebbar
- Zielpalte visuell highlighten beim Dragover

**Task erstellen:**
- "+" Button pro Spalte
- Kleines Inline-Formular (Titel + Priorität reicht)
- ID generieren: `"task-" + Date.now()`

**Task editieren:**
- Klick auf Task → Karte wird zum Edit-Formular (inline)
- Titel und Beschreibung editierbar
- Speichern / Abbrechen Buttons

**Task löschen:**
- "×" Button auf Karte → Bestätigungsfrage → Löschen

**Status-Anzeige:**
- Oben rechts: "Gespeichert ✓" / "Speichert..." / "Fehler ✗"
- Kleiner Punkt der pulsiert wenn Polling aktiv ist (zeigt: Verbindung lebt)

### Design

- Hintergrund: `#F1F5F9`
- Spalten: Weiß, `border-radius: 12px`, dezenter `box-shadow`
- Spalten-Header: Farbe aus JSON, weiße Schrift, runde obere Ecken
- Task-Karten: Weiß, `border-radius: 8px`, `border: 1px solid #E2E8F0`
- Priorität: Kleiner Punkt (high=`#EF4444`, medium=`#F59E0B`, low=`#22C55E`)
- Font: `system-ui`
- Spalten per flexbox nebeneinander, wrappen auf kleinen Screens

### Technische Regeln

- ALLES in einer HTML-Datei (HTML + CSS + JS inline)
- KEINE externen Libraries
- Vanilla ES6+ JavaScript
- `renderBoard()` erzeugt den kompletten Board-DOM jedes Mal neu
- Maximal 400 Zeilen gesamt

---

## Workflow-Vertrag

Nach Erstellung dieser 3 Dateien gilt:

**Claude Code editiert NUR `data/board.json`, NIEMALS `kanban.html`.**

Beispiele:
- "Füge eine Spalte 'Blocked' hinzu" → Neues Objekt in `columns` Array der JSON
- "Verschiebe alle Tasks nach Done" → Tasks in JSON umhängen
- "Ändere die Farbe von 'In Arbeit' auf Lila" → `color` Wert in JSON ändern
- "Erstelle 5 Tasks für Sprint 4" → Task-Objekte zur JSON hinzufügen

Die GUI rendert jede Änderung automatisch (Polling alle 2 Sekunden).

---

## Starte den Server nach Erstellung und bestätige dass alles funktioniert.
