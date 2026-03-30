// Standalone server for Railway deployment
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3100;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// In-memory habits store (falls back to data/habits.json)
const dataFile = path.join(ROOT, 'data', 'habits.json');

function readHabits() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return { habits: [] };
  }
}

function writeHabits(data) {
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// Minimal PulseOS SDK shim for standalone mode
const SDK_SHIM = `
<script>
window.PulseOS = {
  onInput: function() {},
  emit: function() {},
  onDataChanged: function() {},
  saveState: function() {},
  loadState: function() { return Promise.resolve(null); }
};
</script>
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API: GET habits
  if (url.pathname === '/app/habit-tracker/api/habits' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readHabits()));
    return;
  }

  // API: PUT habits
  if (url.pathname === '/app/habit-tracker/api/habits' && req.method === 'PUT') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        writeHabits(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // notify-change (no-op in standalone)
  if (url.pathname === '/api/notify-change') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  // sdk.js shim
  if (url.pathname === '/sdk.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end('window.PulseOS={onInput:function(){},emit:function(){},onDataChanged:function(){},saveState:function(){},loadState:function(){return Promise.resolve(null);}};');
    return;
  }

  // Serve index.html at root
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(ROOT, filePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not Found'); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Habit Tracker running on port ' + PORT);
});
