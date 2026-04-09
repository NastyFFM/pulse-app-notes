const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // API routes
  if (url.startsWith('/app/notes/api/') || url.startsWith('/api/')) {
    const apiPath = url.includes('/app/notes/api/')
      ? url.split('/app/notes/api/')[1]
      : url.split('/api/')[1];
    const file = (apiPath || '').replace(/[^a-z0-9-]/g, '');
    const fp = path.join(__dirname, 'data', file + '.json');

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET') {
      try {
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync(fp));
      } catch {
        res.end('{}');
      }
      return;
    }

    if (req.method === 'PUT') {
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => {
        try { fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); } catch {}
        try { fs.writeFileSync(fp, b); } catch {}
        res.end('{"ok":true}');
      });
      return;
    }
  }

  // Static files
  const filePath = path.join(__dirname, url === '/' ? 'index.html' : url.replace(/^\//, ''));
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Notes app running on port ${PORT}`);
});
