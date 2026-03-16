const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA = path.join(__dirname, 'data', 'board.json');
const HTML = path.join(__dirname, 'kanban.html');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(HTML));
  } else if (req.method === 'GET' && req.url === '/api/board') {
    console.log('[LOAD] board.json served');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(DATA, 'utf8'));
  } else if (req.method === 'PUT' && req.url === '/api/board') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      fs.writeFileSync(DATA, JSON.stringify(JSON.parse(body), null, 2));
      console.log('[SAVE] board.json updated');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  } else {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`Kanban server → http://localhost:${PORT}`));
