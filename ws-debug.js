// Minimal standalone WebSocket test server on port 3001
const http = require('http');
const crypto = require('crypto');

function wsAccept(key) {
  return crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-5AB9ADF98307')
    .digest('base64');
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
<html><head><title>WS Debug</title></head>
<body style="background:#1a1b26;color:#a9b1d6;font-family:monospace;padding:20px">
<h2>WS Debug (Port 3001)</h2>
<div id="log"></div>
<script>
function log(msg) {
  document.getElementById('log').innerHTML += msg + '<br>';
  console.log(msg);
}
log('Creating WebSocket...');
try {
  const ws = new WebSocket('ws://localhost:3001/ws');
  log('WebSocket object created, readyState: ' + ws.readyState);
  ws.onopen = () => { log('✅ OPEN'); ws.send('hello'); };
  ws.onmessage = (e) => { log('📩 ' + e.data); };
  ws.onclose = (e) => { log('❌ CLOSED code=' + e.code + ' reason="' + e.reason + '" clean=' + e.wasClean); };
  ws.onerror = () => { log('⚠️ ERROR'); };
} catch(e) { log('EXCEPTION: ' + e.message); }
</script></body></html>`);
});

server.on('upgrade', (req, socket, head) => {
  console.log('[upgrade] URL:', req.url, 'Headers:', JSON.stringify(req.headers));

  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = wsAccept(key);
  console.log('[upgrade] Key:', key, 'Accept:', accept);

  const response =
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n' +
    '\r\n';

  console.log('[upgrade] Sending handshake response');
  socket.write(response);
  console.log('[upgrade] Handshake sent, socket destroyed?', socket.destroyed);

  // Send welcome text frame after 200ms
  setTimeout(() => {
    if (socket.destroyed) {
      console.log('[ws] Socket already destroyed!');
      return;
    }
    const text = 'hello from server!';
    const buf = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = buf.length;
    socket.write(Buffer.concat([header, buf]));
    console.log('[ws] Sent welcome frame (' + (2 + buf.length) + ' bytes)');
  }, 200);

  // Handle incoming data
  socket.on('data', raw => {
    console.log('[ws] Got data:', raw.length, 'bytes, hex:', raw.toString('hex').substring(0, 40));
    // Parse frame
    if (raw.length < 2) return;
    const opcode = raw[0] & 0x0f;
    const masked = (raw[1] & 0x80) !== 0;
    let payloadLen = raw[1] & 0x7f;
    let offset = 2;
    if (masked) {
      const mask = raw.slice(offset, offset + 4);
      offset += 4;
      const payload = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) payload[i] = raw[offset + i] ^ mask[i % 4];
      console.log('[ws] Received text:', payload.toString('utf8'));
      // Echo back
      const resp = Buffer.from('echo: ' + payload.toString('utf8'), 'utf8');
      const rh = Buffer.alloc(2);
      rh[0] = 0x81;
      rh[1] = resp.length;
      socket.write(Buffer.concat([rh, resp]));
      console.log('[ws] Sent echo');
    }
  });

  socket.on('close', () => console.log('[ws] Socket closed'));
  socket.on('error', e => console.log('[ws] Error:', e.message));
});

server.listen(3001, () => console.log('WS Debug server on http://localhost:3001'));
