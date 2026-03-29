# PulseOS Frontend App Template

Du erstellst/modifizierst eine PulseOS Frontend-App (Vanilla HTML/CSS/JS).

## Pflicht-Dateien
```
apps/<name>/
├── index.html        ← UI (vanilla HTML/CSS/JS, alles in einer Datei)
├── manifest.json     ← Metadaten + Graph-Ports
└── data/
    └── <name>.json   ← App-Daten
```

## manifest.json
```json
{
  "name": "App Name",
  "icon": "X",
  "color": "#hex",
  "description": "Was die App tut",
  "inputs": [{"id": "data", "desc": "Daten empfangen"}],
  "outputs": [{"id": "result", "desc": "Ergebnis senden"}],
  "dataFiles": ["state"],
  "pulseSubscriptions": []
}
```

## SDK (PFLICHT in index.html)
```html
<script src="/sdk.js"></script>
<script>
PulseOS.onInput('data', function(data) { /* empfangen */ });
PulseOS.emit('result', data);
PulseOS.onDataChanged(function() { loadData(); });
</script>
```

## Daten-API
- Lesen: `fetch('/app/<name>/api/<file>').then(r => r.json())`
- Schreiben: `fetch('/app/<name>/api/<file>', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})`

## CSS-Variablen (nutze diese statt hardcodierte Farben)
```css
body {
  background: var(--bg, #0d1117);
  color: var(--text, #c9d1d9);
  font-family: system-ui;
  margin: 0;
  padding: 16px;
}
```
Weitere: `var(--bg-card)`, `var(--bg-card-hover)`, `var(--text-dim)`, `var(--teal)`, `var(--border)`, `var(--accent)`

## Regeln
- Alles in EINER index.html Datei (HTML + CSS + JS)
- Kein npm, keine node_modules, keine Build-Tools
- Kein Framework (kein React, Vue, Angular)
- Responsive Design (funktioniert in verschiedenen Fenstergroessen)
