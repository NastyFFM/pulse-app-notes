---
name: railway-deploy
description: Railway Deployment fuer Node.js/Next.js Apps. Aktiviert wenn User Railway erwaehnt oder eine App mit Backend deployed werden soll.
---

# Railway Deploy Skill

## Wann aktiv
Wenn der User Railway als Deploy-Target waehlt, oder eine App ein Backend braucht (server.js, next.config.js, package.json).

## Pflicht-Dateien

### railway.json
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300
  }
}
```

### package.json (Minimum)
```json
{
  "name": "pulse-app-<name>",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  }
}
```

### server.js (Minimum fuer PulseOS Apps)
```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  // Serve index.html
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); return res.end('Error'); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('Running on port ' + PORT));
```

## Deploy-Optionen (Reihenfolge)

### 1. Railway MCP (bevorzugt)
PulseOS hat Railway MCP installiert. Nutze die MCP Tools:
- `mcp__railway__create_project` — Projekt erstellen
- `mcp__railway__create_service` — Service hinzufuegen
- `mcp__railway__deploy` — Deployen
- `mcp__railway__generate_domain` — Public URL generieren

### 2. Railway CLI
```bash
railway login
railway init
railway up
railway domain  # Public URL
```

### 3. GitHub Auto-Deploy
- Repo auf GitHub pushen
- In Railway: "Deploy from GitHub" waehlen
- Auto-Deploy bei jedem Push

## Env-Variablen
- `PORT` — wird von Railway automatisch gesetzt
- Weitere Vars via `mcp__railway__set_variables` oder Railway Dashboard
- NIEMALS Secrets in Code oder railway.json

## WICHTIG
- Railway braucht `package.json` mit `start` Script
- Port MUSS aus `process.env.PORT` gelesen werden
- Health-Check Endpoint empfohlen (`/api/health`)
- Kein `node_modules` committen — Railway installiert selbst
