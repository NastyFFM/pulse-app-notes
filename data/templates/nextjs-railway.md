# Next.js + Railway App Template

Du erstellst/modifizierst eine Next.js App die auf Railway deployed werden kann.
Die App muss AUCH lokal in PulseOS laufen und das PulseOS App-Paradigma erfuellen.

## Projektstruktur
```
apps/<name>/
├── manifest.json          ← PulseOS Metadaten + Graph-Ports
├── package.json           ← Next.js Dependencies
├── next.config.js         ← Next.js Config
├── app/
│   ├── layout.tsx         ← Root Layout
│   ├── page.tsx           ← Hauptseite
│   ├── globals.css        ← Styles
│   └── api/               ← API Routes
├── public/
│   └── ...
├── data/
│   └── <name>.json        ← App-Daten (PulseOS API)
└── index.html             ← PulseOS Wrapper (laedt Next.js App im iframe)
```

## manifest.json (PFLICHT)
```json
{
  "name": "App Name",
  "icon": "X",
  "color": "#hex",
  "description": "Was die App tut",
  "inputs": [{"id": "data", "desc": "Daten empfangen"}],
  "outputs": [{"id": "result", "desc": "Ergebnis senden"}],
  "dataFiles": ["state"],
  "pulseSubscriptions": [],
  "type": "nextjs",
  "port": 3100
}
```

## index.html (PulseOS Wrapper)
```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>App Name</title>
<style>
  body { margin:0; background:var(--bg, #0d1117); }
  iframe { width:100%; height:100vh; border:none; }
  .loading { display:flex; align-items:center; justify-content:center; height:100vh; color:var(--text-dim, #888); font-family:system-ui; }
</style></head><body>
<div class="loading" id="loading">Starte Next.js Server...</div>
<iframe id="app" style="display:none;" src=""></iframe>
<script src="/sdk.js"></script>
<script>
// PulseOS startet den Next.js Dev-Server automatisch
// Der iframe zeigt die Next.js App
const port = 3100; // Aus manifest.json
async function checkServer() {
  try {
    const r = await fetch('http://localhost:' + port);
    if (r.ok) {
      document.getElementById('loading').style.display = 'none';
      const iframe = document.getElementById('app');
      iframe.src = 'http://localhost:' + port;
      iframe.style.display = 'block';
      return;
    }
  } catch {}
  setTimeout(checkServer, 2000);
}
// Request server start
fetch('/api/apps/APP_ID/start', { method: 'POST' }).then(() => checkServer());
PulseOS.onInput('data', function(data) { });
PulseOS.onDataChanged(function() { });
</script></body></html>
```

## package.json
```json
{
  "name": "pulse-app-NAME",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100"
  },
  "dependencies": {
    "next": "^14",
    "react": "^18",
    "react-dom": "^18"
  }
}
```

## Railway Deploy
- App wird auf GitHub als `pulse-app-<name>` Repo gepusht
- Railway wird automatisch ans Repo connected
- Jeder Push deployed automatisch
- Environment Variables werden ueber den Env-Vars Editor gesetzt

## Regeln
- MUSS auch lokal laufen (via npm run dev)
- MUSS manifest.json haben mit inputs/outputs
- MUSS PulseOS Data-API nutzen fuer Persistenz
- TypeScript bevorzugt
- Tailwind CSS erlaubt
- Port aus manifest.json verwenden (default: 3100)
