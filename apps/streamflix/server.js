const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  // Data API
  if (url.startsWith('/app/streamflix/api/')) {
    const file = url.split('/api/')[1].replace(/[^a-z0-9-]/g, '');
    const fp = path.join(__dirname, 'data', file + '.json');
    if (req.method === 'GET') { try { res.end(fs.readFileSync(fp)); } catch { res.end('{}'); } return; }
    if (req.method === 'PUT') { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});}catch{} fs.writeFileSync(fp,b); res.end('{"ok":true}'); }); return; }
  }
  // Static files
  let fp = path.join(__dirname, url === '/' ? 'index.html' : url.replace(/^\//, ''));
  try { const d = fs.readFileSync(fp); res.writeHead(200, {'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream'}); res.end(d); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log('Listening on ' + PORT));
