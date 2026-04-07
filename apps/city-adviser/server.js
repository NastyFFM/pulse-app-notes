const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check + serve frontend
  if (method === 'GET' && pathname === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // GET /api/cities — alle Städte (nur id, name, country, emoji, description, highlights)
  if (method === 'GET' && pathname === '/api/cities') {
    const data = readJSON('cities.json');
    if (!data) return json(res, { error: 'not found' }, 404);
    const list = data.cities.map(({ id, name, country, emoji, description, highlights }) =>
      ({ id, name, country, emoji, description, highlights })
    );
    return json(res, list);
  }

  // GET /api/cities/:id — eine Stadt mit allen Details
  if (method === 'GET' && pathname.startsWith('/api/cities/')) {
    const cityId = pathname.replace('/api/cities/', '');
    const data = readJSON('cities.json');
    if (!data) return json(res, { error: 'not found' }, 404);
    const city = data.cities.find(c => c.id === cityId);
    if (!city) return json(res, { error: 'city not found' }, 404);
    return json(res, city);
  }

  // GET /api/search?q=... — Suche nach Städten
  if (method === 'GET' && pathname === '/api/search') {
    const q = (parsed.query.q || '').toLowerCase();
    const data = readJSON('cities.json');
    if (!data) return json(res, []);
    const results = data.cities.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      (c.highlights || []).some(h => h.toLowerCase().includes(q))
    ).map(({ id, name, country, emoji, description, highlights }) =>
      ({ id, name, country, emoji, description, highlights })
    );
    return json(res, results);
  }

  // GET /api/state — App-State lesen
  if (method === 'GET' && pathname === '/api/state') {
    const state = readJSON('state.json') || { lastCity: null, favorites: [], recentSearches: [], activeTab: 'sights' };
    return json(res, state);
  }

  // PUT /api/state — App-State schreiben
  if (method === 'PUT' && pathname === '/api/state') {
    const body = await readBody(req);
    const current = readJSON('state.json') || {};
    const updated = { ...current, ...body };
    writeJSON('state.json', updated);
    return json(res, updated);
  }

  // POST /api/favorites — Favorit hinzufügen/entfernen
  if (method === 'POST' && pathname === '/api/favorites') {
    const body = await readBody(req);
    const state = readJSON('state.json') || { favorites: [] };
    const favs = state.favorites || [];
    const idx = favs.indexOf(body.cityId);
    if (idx === -1) {
      favs.push(body.cityId);
    } else {
      favs.splice(idx, 1);
    }
    state.favorites = favs;
    writeJSON('state.json', state);
    return json(res, { favorites: favs });
  }

  // 404
  json(res, { error: 'not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`City Adviser running on port ${PORT}`);
});
