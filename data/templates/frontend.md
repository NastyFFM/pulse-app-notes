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

## Deployment auf Railway

Vanilla-Apps brauchen einen minimalen Node.js Server fuer Railway.

### Zusaetzliche Dateien fuer Deploy
```
apps/<name>/
├── server.js       ← Minimaler HTTP Server (nur fuer Deploy)
├── package.json    ← Dependencies (nur node)
├── railway.json    ← Railway Deploy-Config
├── index.html      ← Die App (unveraendert)
└── data/
    └── <name>.json
```

### server.js (minimal)
```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3100;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.url.startsWith('/app/' + path.basename(__dirname) + '/api/')) {
    const file = req.url.split('/api/')[1].replace(/[^a-z0-9-]/g, '');
    const fp = path.join(__dirname, 'data', file + '.json');
    if (req.method === 'GET') { try { res.end(fs.readFileSync(fp)); } catch { res.end('{}'); } return; }
    if (req.method === 'PUT') { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ fs.writeFileSync(fp,b); res.end('{"ok":true}'); }); return; }
  }
  const fp = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  try { const d = fs.readFileSync(fp); res.writeHead(200, {'Content-Type': MIME[path.extname(fp)] || 'text/plain'}); res.end(d); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log('Listening on ' + PORT));
```

### railway.json
```json
{ "build": { "builder": "NIXPACKS" }, "deploy": { "startCommand": "node server.js", "healthcheckPath": "/", "restartPolicyType": "ON_FAILURE" } }
```

### Via Railway MCP (bevorzugt)
1. `create_project` → name: `pulse-app-<appId>`
2. `create_service` im Projekt
3. `deploy` → Code deployen
4. `generate_domain` → URL generieren

### Via Railway CLI
```bash
railway init -n pulse-app-<name> --json
railway up -p <projectId> --detach
railway domain --json
```

## Regeln
- Alles in EINER index.html Datei (HTML + CSS + JS)
- Kein npm, keine node_modules, keine Build-Tools
- Kein Framework (kein React, Vue, Angular)
- Responsive Design (funktioniert in verschiedenen Fenstergroessen)
