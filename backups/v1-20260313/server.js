const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;

// --- Helpers ---
function jsonRes(res, data) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); }
function htmlRes(res, file) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(file)); }
function readBody(req, cb) { let b = ''; req.on('data', c => b += c); req.on('end', () => cb(b)); }
function safeReadJSON(file, fallback) { try { return fs.readFileSync(file, 'utf8'); } catch { return JSON.stringify(fallback); } }

// --- App HTML with injected modifier overlay ---
function appHtmlRes(res, file, appId) {
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace('</body>', getModifierOverlay(appId) + '\n</body>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function getModifierOverlay(appId) {
  return `<!-- App Modifier Overlay -->
<style>
#__mc-panel{position:fixed;right:10px;top:10px;width:310px;background:#0f0f1a;border-radius:14px;border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 40px rgba(0,0,0,.6);overflow:hidden;display:none;flex-direction:column;font-family:system-ui,sans-serif}
#__mc-head{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between}
#__mc-head span{font-size:.8rem;color:rgba(255,255,255,.5);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
#__mc-close{background:none;border:none;color:rgba(255,255,255,.4);font-size:1.1rem;cursor:pointer;padding:0 2px;line-height:1}
#__mc-close:hover{color:#fff}
#__mc-msgs{flex:1;padding:12px;max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}
.__mc-u{align-self:flex-end;background:#2563EB;color:#fff;padding:7px 11px;border-radius:12px 12px 2px 12px;font-size:.82rem;max-width:88%;line-height:1.35}
.__mc-a{align-self:flex-start;background:rgba(255,255,255,.08);color:#d1d5db;padding:7px 11px;border-radius:12px 12px 12px 2px;font-size:.82rem;max-width:88%;line-height:1.35}
#__mc-row{display:flex;gap:7px;padding:10px;border-top:1px solid rgba(255,255,255,.08)}
#__mc-input{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 10px;color:#fff;font-size:.82rem;outline:none;resize:none;font-family:inherit;line-height:1.4}
#__mc-input:focus{border-color:rgba(59,130,246,.6)}
#__mc-input::placeholder{color:rgba(255,255,255,.3)}
#__mc-send{padding:7px 12px;background:#2563EB;border:none;border-radius:8px;color:#fff;font-size:.82rem;cursor:pointer;font-weight:600;white-space:nowrap;align-self:flex-end}
#__mc-send:hover{background:#1d4ed8}
#__mc-send:disabled{background:#374151;cursor:default}
#__mc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);z-index:99998;display:none;align-items:center;justify-content:center;flex-direction:column;gap:18px}
#__mc-spinner{width:46px;height:46px;border:3px solid rgba(255,255,255,.15);border-top-color:#3B82F6;border-radius:50%;animation:__mcspin .75s linear infinite}
@keyframes __mcspin{to{transform:rotate(360deg)}}
#__mc-otext{color:rgba(255,255,255,.85);font-size:.95rem;font-family:system-ui,sans-serif}
</style>
<div id="__mc-panel">
    <div id="__mc-head">
      <span>App anpassen</span>
      <button id="__mc-close" onclick="document.getElementById('__mc-panel').style.display='none'">✕</button>
    </div>
    <div id="__mc-msgs">
      <div class="__mc-a">Wie soll ich die App ändern?</div>
    </div>
    <div id="__mc-row">
      <textarea id="__mc-input" rows="2" placeholder="z.B. „Mach den Hintergrund dunkel" oder „Füge einen Reset-Button hinzu""></textarea>
      <button id="__mc-send" onclick="__mcSend()">↑</button>
    </div>
</div>
<div id="__mc-overlay">
  <div id="__mc-spinner"></div>
  <div id="__mc-otext">App wird angepasst…</div>
</div>
<script>
(function(){
  const __APP_ID = '${appId}';
  window.__mcToggle = function(){
    const p = document.getElementById('__mc-panel');
    p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
    if(p.style.display === 'flex') document.getElementById('__mc-input').focus();
  };
  window.__mcSend = async function(){
    const inp = document.getElementById('__mc-input');
    const msg = inp.value.trim();
    if(!msg || document.getElementById('__mc-send').disabled) return;
    const msgs = document.getElementById('__mc-msgs');
    msgs.innerHTML += '<div class="__mc-u">'+msg.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</div>';
    inp.value = '';
    msgs.scrollTop = msgs.scrollHeight;
    document.getElementById('__mc-send').disabled = true;
    document.getElementById('__mc-panel').style.display = 'none';
    document.getElementById('__mc-overlay').style.display = 'flex';
    document.getElementById('__mc-otext').textContent = 'App wird angepasst…';
    try {
      const r = await fetch('/api/modify-app', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({appId:__APP_ID, request:msg})
      });
      const d = await r.json();
      if(d.ok){
        document.getElementById('__mc-otext').textContent = '✓ Fertig! Seite lädt neu…';
        setTimeout(()=>location.reload(), 900);
      } else {
        document.getElementById('__mc-overlay').style.display = 'none';
        document.getElementById('__mc-panel').style.display = 'flex';
        msgs.innerHTML += '<div class="__mc-a">⚠️ '+((d.error||'Fehler').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])))+'</div>';
        document.getElementById('__mc-send').disabled = false;
        msgs.scrollTop = msgs.scrollHeight;
      }
    } catch(e){
      document.getElementById('__mc-overlay').style.display = 'none';
      document.getElementById('__mc-panel').style.display = 'flex';
      msgs.innerHTML += '<div class="__mc-a">⚠️ Verbindungsfehler.</div>';
      document.getElementById('__mc-send').disabled = false;
      msgs.scrollTop = msgs.scrollHeight;
    }
  };
  document.getElementById('__mc-input').addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); __mcSend(); }
  });
})();
</script>`;
}

// --- Version History ---
function saveVersion(appId) {
  const htmlFile = path.join(ROOT, 'apps', appId, 'index.html');
  const versionsDir = path.join(ROOT, 'apps', appId, 'versions');
  if (!fs.existsSync(htmlFile)) return null;
  if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });
  const ts = Date.now();
  const versionFile = path.join(versionsDir, `v-${ts}.html`);
  fs.copyFileSync(htmlFile, versionFile);
  console.log(`[versions] Saved ${appId} v-${ts}`);
  return ts;
}

function listVersions(appId) {
  const versionsDir = path.join(ROOT, 'apps', appId, 'versions');
  if (!fs.existsSync(versionsDir)) return [];
  return fs.readdirSync(versionsDir)
    .filter(f => f.startsWith('v-') && f.endsWith('.html'))
    .map(f => {
      const ts = parseInt(f.replace('v-', '').replace('.html', ''));
      return { file: f, timestamp: ts, date: new Date(ts).toISOString() };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

// --- Clean env for spawning claude CLI ---
// Remove ALL Claude-related env vars so CLI uses its own stored auth
function cleanEnvForClaude() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_') || key === '__CFBundleIdentifier') delete env[key];
  }
  return env;
}

// --- Claude CLI for app modification ---
// Strategy: short -p prompt tells Claude to read/modify/write the file directly
// This avoids ARG_MAX limits (no HTML in CLI args)
function callClaude(appId, htmlFile, userRequest) {
  return new Promise((resolve, reject) => {
    const absPath = path.resolve(htmlFile);
    const beforeMtime = fs.statSync(absPath).mtimeMs;

    const prompt = `Lies die Datei "${absPath}" mit dem Read-Tool. Das ist eine HTML-App. Änderungswunsch: ${userRequest}

Wende die gewünschte Änderung an und schreibe den KOMPLETTEN modifizierten HTML-Code mit dem Write-Tool zurück in "${absPath}". Antworte danach nur mit: DONE`;

    const env = cleanEnvForClaude();

    const proc = spawn('claude', ['-p', prompt, '--output-format', 'text', '--allowedTools', 'Read,Write', '--dangerously-skip-permissions'], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', c => { stdout += c; });
    proc.stderr.on('data', c => { stderr += c; });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout: Claude hat nicht rechtzeitig geantwortet'));
    }, 120000);

    proc.on('close', code => {
      clearTimeout(timeout);
      console.log(`[modifier] ${appId}: claude exited code=${code} stdout=${stdout.slice(0,100)} stderr=${stderr.slice(0,100)}`);

      if (code !== 0) {
        return reject(new Error(stderr.slice(0, 300) || `Claude exit code ${code}`));
      }

      // Check if file was actually modified
      try {
        const afterMtime = fs.statSync(absPath).mtimeMs;
        if (afterMtime > beforeMtime) {
          console.log(`[modifier] ${appId}: File modified by Claude`);
          return resolve(fs.readFileSync(absPath, 'utf8'));
        }
      } catch {}

      // Fallback: if Claude returned HTML in stdout instead of writing to file
      let result = stdout.trim();
      result = result.replace(/^```html?\n?/i, '').replace(/\n?```\s*$/, '').trim();
      if (result.includes('<html') || result.includes('<!DOCTYPE') || result.includes('<body')) {
        fs.writeFileSync(absPath, result);
        console.log(`[modifier] ${appId}: Fallback — wrote stdout HTML (${result.length} bytes)`);
        return resolve(result);
      }

      reject(new Error('Claude hat die Datei nicht geändert'));
    });

    proc.on('error', err => {
      clearTimeout(timeout);
      reject(new Error('Spawn error: ' + err.message));
    });
  });
}

// --- Orchestrator Health Tracking ---
let orchestratorLastResponse = 0;  // timestamp of last successful chat-respond
let orchestratorLastPoll = 0;      // timestamp of last chat-wait poll
const ORCHESTRATOR_TIMEOUT_MS = 90000; // 90s — if no poll in this time, consider offline
const MESSAGE_TIMEOUT_MS = 60000;      // 60s — auto-reply "offline" after this

function isOrchestratorAlive() {
  if (orchestratorLastPoll === 0) return false;
  return (Date.now() - orchestratorLastPoll) < ORCHESTRATOR_TIMEOUT_MS;
}

// Watchdog: check for stale pending messages every 15s
setInterval(() => {
  const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
  try {
    const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
    if (queue.pending.length === 0) return;
    const now = Date.now();
    const stale = [];
    for (const msg of queue.pending) {
      const age = now - new Date(msg.queuedAt).getTime();
      if (age > MESSAGE_TIMEOUT_MS) stale.push(msg);
    }
    if (stale.length === 0) return;
    // Auto-reply to stale messages
    const chatFile = path.join(ROOT, 'apps', 'chat', 'data', 'chat.json');
    const data = JSON.parse(safeReadJSON(chatFile, { activeChat: 'chat-1', chats: [] }));
    for (const msg of stale) {
      const chat = data.chats.find(c => c.id === msg.chatId);
      if (!chat) continue;
      const userMsg = chat.messages.find(m => m.id === msg.msgId);
      if (userMsg) userMsg.pending = false;
      chat.messages.push({
        id: 'msg-' + Date.now() + '-timeout',
        role: 'claude',
        text: '⚠️ Der Chat-Assistent ist gerade offline. Bitte versuche es gleich nochmal — er wird automatisch neu gestartet.',
        time: new Date().toISOString()
      });
      console.log(`[watchdog] Auto-replied offline for stale msg ${msg.msgId}`);
    }
    fs.writeFileSync(chatFile, JSON.stringify(data, null, 2));
    broadcast('chat', { type: 'change', file: 'chat.json', time: Date.now() });
    // Remove stale from queue
    queue.pending = queue.pending.filter(p => !stale.find(s => s.msgId === p.msgId));
    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
  } catch (e) {
    console.error('[watchdog] error:', e.message);
  }
}, 15000);

// --- SSE ---
const sseClients = new Map();
const debounceTimers = new Map();

function sseConnect(scope, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('data: connected\n\n');
  if (!sseClients.has(scope)) sseClients.set(scope, new Set());
  sseClients.get(scope).add(res);
  req_cleanup(res, scope);
  ensureWatcher(scope);
}

function req_cleanup(res, scope) {
  res.on('close', () => {
    const set = sseClients.get(scope);
    if (set) { set.delete(res); if (set.size === 0) sseClients.delete(scope); }
  });
}

function broadcast(scope, data) {
  const set = sseClients.get(scope);
  if (!set) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(msg); } catch { set.delete(res); } }
}

const watchers = new Set();
function ensureWatcher(scope) {
  if (watchers.has(scope)) return;
  const watchPath = scope === 'dashboard'
    ? path.join(ROOT, 'data')
    : path.join(ROOT, 'apps', scope, 'data');
  try {
    if (!fs.existsSync(watchPath)) fs.mkdirSync(watchPath, { recursive: true });
    fs.watch(watchPath, { recursive: false }, (evt, filename) => {
      if (scope === 'dashboard' && filename !== 'apps.json') return;
      const key = `${scope}:${filename}`;
      if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
      debounceTimers.set(key, setTimeout(() => {
        debounceTimers.delete(key);
        broadcast(scope, { type: 'change', file: filename, time: Date.now() });
      }, 100));
    });
    watchers.add(scope);
  } catch {}
}

// --- Server ---
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/') return htmlRes(res, path.join(ROOT, 'dashboard.html'));

  const sseMatch = url.match(/^\/sse\/([a-z0-9-]+)$/);
  if (sseMatch && req.method === 'GET') return sseConnect(sseMatch[1], res);

  if (url === '/api/apps') {
    const file = path.join(ROOT, 'data', 'apps.json');
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(file, { meta: {}, apps: [] }));
    if (req.method === 'PUT') return readBody(req, b => {
      fs.writeFileSync(file, JSON.stringify(JSON.parse(b), null, 2));
      broadcast('dashboard', { type: 'change', file: 'apps.json', time: Date.now() });
      jsonRes(res, { ok: true });
    });
  }

  if (url === '/api/changelog') {
    const file = path.join(ROOT, 'data', 'changelog.json');
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(file, { entries: [] }));
    if (req.method === 'POST') return readBody(req, b => {
      const log = JSON.parse(safeReadJSON(file, { entries: [] }));
      const entries = JSON.parse(b);
      log.entries.push(...(Array.isArray(entries) ? entries : [entries]));
      if (log.entries.length > 200) log.entries = log.entries.slice(-200);
      fs.writeFileSync(file, JSON.stringify(log, null, 2));
      jsonRes(res, { ok: true, count: log.entries.length });
    });
  }

  if (url === '/api/state') {
    const file = path.join(ROOT, 'data', 'state.json');
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(file, {}));
    if (req.method === 'PUT') return readBody(req, b => {
      fs.writeFileSync(file, JSON.stringify(JSON.parse(b), null, 2));
      jsonRes(res, { ok: true });
    });
  }

  // Chat pending messages — orchestrator polls this
  if (url === '/api/chat-pending' && req.method === 'GET') {
    const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
    const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
    return jsonRes(res, queue);
  }

  // Orchestrator health endpoint
  if (url === '/api/orchestrator-health' && req.method === 'GET') {
    return jsonRes(res, {
      alive: isOrchestratorAlive(),
      lastPoll: orchestratorLastPoll,
      lastResponse: orchestratorLastResponse,
      ageSec: orchestratorLastPoll ? Math.round((Date.now() - orchestratorLastPoll) / 1000) : -1
    });
  }

  // Chat long-poll — blocks until a new message is queued (max 60s)
  if (url === '/api/chat-wait' && req.method === 'GET') {
    orchestratorLastPoll = Date.now();
    const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
    // Check if there's already something pending
    const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
    if (queue.pending.length > 0) {
      return jsonRes(res, queue.pending[0]);
    }
    // Otherwise wait for fs.watch event on queue file
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) { responded = true; try { watcher.close(); } catch {} jsonRes(res, { timeout: true }); }
    }, 55000);
    const watcher = fs.watch(queueFile, () => {
      if (responded) return;
      try {
        const q = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        if (q.pending && q.pending.length > 0) {
          responded = true;
          clearTimeout(timeout);
          try { watcher.close(); } catch {}
          jsonRes(res, q.pending[0]);
        }
      } catch {}
    });
    res.on('close', () => { responded = true; clearTimeout(timeout); try { watcher.close(); } catch {} });
    return;
  }

  // Chat respond — orchestrator writes Claude's response
  if (url === '/api/chat-respond' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { chatId, msgId, text } = JSON.parse(b);
        if (!chatId || !msgId || !text) return jsonRes(res, { ok: false, error: 'chatId, msgId, text required' });

        // Write response to chat.json
        const chatFile = path.join(ROOT, 'apps', 'chat', 'data', 'chat.json');
        const data = JSON.parse(safeReadJSON(chatFile, { activeChat: 'chat-1', chats: [] }));
        const chat = data.chats.find(c => c.id === chatId);
        if (!chat) return jsonRes(res, { ok: false, error: 'Chat not found' });

        // Mark original user message as processed
        const userMsg = chat.messages.find(m => m.id === msgId);
        if (userMsg) userMsg.pending = false;

        // Add Claude's response
        chat.messages.push({
          id: 'msg-' + Date.now(),
          role: 'claude',
          text: text,
          time: new Date().toISOString()
        });
        fs.writeFileSync(chatFile, JSON.stringify(data, null, 2));
        broadcast('chat', { type: 'change', file: 'chat.json', time: Date.now() });

        // Remove from queue
        const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
        const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
        queue.pending = queue.pending.filter(p => p.msgId !== msgId);
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

        orchestratorLastResponse = Date.now();
        console.log(`[chat] Response written for ${msgId} in ${chatId}`);
        jsonRes(res, { ok: true });
      } catch(e) {
        console.error('[chat-respond] error:', e.message);
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Image generator endpoint - queue-based (processed by Claude daemon via MCP)
  if (url === '/api/imagegen-generate' && req.method === 'POST') {
    return readBody(req, async b => {
      try {
        const { prompt, style } = JSON.parse(b);
        if (!prompt) return jsonRes(res, { ok: false, error: 'Prompt erforderlich' });

        const queueDir = path.join(ROOT, 'apps', 'imagegen', 'data', 'queue');
        if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });

        const ts = Date.now();
        const requestId = `req-${ts}`;
        const requestFile = path.join(queueDir, `${requestId}.json`);
        fs.writeFileSync(requestFile, JSON.stringify({ id: requestId, prompt, style: style || '', status: 'pending', created: ts }));

        console.log(`[imagegen] Queued request ${requestId}: "${prompt.slice(0, 60)}..."`);
        jsonRes(res, { ok: true, requestId, status: 'pending' });
      } catch(e) {
        console.error('[imagegen] error:', e.message);
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Image generator status check
  if (url.startsWith('/api/imagegen-status/') && req.method === 'GET') {
    const requestId = url.split('/').pop();
    const queueDir = path.join(ROOT, 'apps', 'imagegen', 'data', 'queue');
    const requestFile = path.join(queueDir, `${requestId}.json`);
    if (fs.existsSync(requestFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
        return jsonRes(res, data);
      } catch { return jsonRes(res, { status: 'error', error: 'Parse error' }); }
    }
    return jsonRes(res, { status: 'not_found' });
  }

  // Serve image files from app data directories
  const imgFileMatch = url.match(/^\/app\/([a-z0-9-]+)\/data\/(.+\.(png|jpg|jpeg|gif|webp))$/);
  if (imgFileMatch && req.method === 'GET') {
    const imgFile = path.join(ROOT, 'apps', imgFileMatch[1], 'data', imgFileMatch[2]);
    if (fs.existsSync(imgFile)) {
      const ext = imgFileMatch[3];
      const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(imgFile));
    }
  }

  // App modifier endpoint
  if (url === '/api/modify-app' && req.method === 'POST') {
    return readBody(req, async b => {
      try {
        const { appId, request } = JSON.parse(b);
        if (!appId || !request) return jsonRes(res, { ok: false, error: 'appId und request erforderlich' });
        const htmlFile = path.join(ROOT, 'apps', appId, 'index.html');
        if (!fs.existsSync(htmlFile)) return jsonRes(res, { ok: false, error: `App "${appId}" nicht gefunden` });
        console.log(`[modifier] ${appId}: "${request.slice(0, 60)}..."`);
        // Save version before modifying
        saveVersion(appId);
        await callClaude(appId, htmlFile, request);
        broadcast(appId, { type: 'change', file: 'index.html', time: Date.now() });
        jsonRes(res, { ok: true });
      } catch(e) {
        console.error('[modifier] error:', e.message);
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Version history API
  const versionsMatch = url.match(/^\/app\/([a-z0-9-]+)\/versions$/);
  if (versionsMatch && req.method === 'GET') {
    return jsonRes(res, JSON.stringify(listVersions(versionsMatch[1])));
  }

  // Restore version
  const restoreMatch = url.match(/^\/app\/([a-z0-9-]+)\/versions\/restore$/);
  if (restoreMatch && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { timestamp } = JSON.parse(b);
        const appId = restoreMatch[1];
        const versionFile = path.join(ROOT, 'apps', appId, 'versions', `v-${timestamp}.html`);
        const htmlFile = path.join(ROOT, 'apps', appId, 'index.html');
        if (!fs.existsSync(versionFile)) return jsonRes(res, { ok: false, error: 'Version nicht gefunden' });
        // Save current as version before restoring
        saveVersion(appId);
        fs.copyFileSync(versionFile, htmlFile);
        console.log(`[versions] ${appId}: Restored v-${timestamp}`);
        broadcast(appId, { type: 'change', file: 'index.html', time: Date.now() });
        jsonRes(res, { ok: true });
      } catch(e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // RSS Proxy for news-channels (avoids CORS issues with external proxies)
  if (url === '/api/rss-proxy' && req.method === 'GET') {
    const params = new URL('http://x' + req.url.slice(req.url.indexOf('?'))).searchParams;
    const rssUrl = params.get('url');
    if (!rssUrl) return jsonRes(res, { error: 'url param required' });
    const proto = rssUrl.startsWith('https') ? require('https') : require('http');
    proto.get(rssUrl, proxyRes => {
      let body = '';
      proxyRes.on('data', c => body += c);
      proxyRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(body);
      });
    }).on('error', e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // Article content proxy for news-channels
  if (url === '/api/article-proxy' && req.method === 'GET') {
    const params = new URL('http://x' + req.url.slice(req.url.indexOf('?'))).searchParams;
    const articleUrl = params.get('url');
    if (!articleUrl) return jsonRes(res, { error: 'url param required' });
    const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' }, timeout: 10000 };
    const doFetch = (fetchUrl, redir) => {
      if (redir > 5) { res.writeHead(502); return res.end(JSON.stringify({error:'Too many redirects'})); }
      const p = fetchUrl.startsWith('https') ? require('https') : require('http');
      p.get(fetchUrl, options, pr => {
        if (pr.statusCode >= 300 && pr.statusCode < 400 && pr.headers.location) {
          let loc = pr.headers.location;
          if (loc.startsWith('/')) { const u = new URL(fetchUrl); loc = u.protocol+'//'+u.host+loc; }
          pr.resume(); return doFetch(loc, redir+1);
        }
        const chunks = [];
        pr.on('data', c => chunks.push(c));
        pr.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let title='', siteName='';
          const tm = body.match(/<title[^>]*>([^<]+)</i); if(tm) title=tm[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
          const sm = body.match(/property="og:site_name"\s+content="([^"]+)"/i) || body.match(/content="([^"]+)"\s+property="og:site_name"/i); if(sm) siteName=sm[1];
          const am = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
          let ah = am ? am[1] : '';
          if(!ah){const mm=body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);if(mm)ah=mm[1];}
          if(!ah){const cm=body.match(/<div[^>]*class="[^"]*(?:article-body|article-content|story-body|entry-content|post-content|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);if(cm)ah=cm[1];}
          const paragraphs=[];
          const src = ah || body;
          const pms = src.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
          for(const p of pms){let t=p.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').trim();if(t.length>30)paragraphs.push(t);}
          res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
          res.end(JSON.stringify({title,siteName,paragraphs,url:fetchUrl}));
        });
      }).on('error',e=>{res.writeHead(502);res.end(JSON.stringify({error:e.message}));}).on('timeout',function(){this.destroy();});
    };
    doFetch(articleUrl, 0);
    return;
  }

  // Piped API proxy for YouTube app (avoids CORS)
  if (url === '/api/piped-proxy' && req.method === 'GET') {
    const fullUrl = req.url;
    const pathIdx = fullUrl.indexOf('path=');

    if (pathIdx < 0) return jsonRes(res, { error: 'path param required' });
    const pipedPath = decodeURIComponent(fullUrl.slice(pathIdx + 5));
    const instances = ['pipedapi.kavin.rocks','watchapi.whatever.social','pipedapi.leptons.xyz'];
    const https = require('https');
    let tried = 0;
    let done = false;
    function tryPipedInstance() {
      if (done) return;
      if (tried >= instances.length) {
        done = true;
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'All Piped instances failed' }));
      }
      const host = instances[tried++];
      console.log('[piped-proxy] Trying: ' + host);
      https.get('https://' + host + pipedPath, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, proxyRes => {
        if (done) { proxyRes.resume(); return; }
        if (proxyRes.statusCode !== 200) { proxyRes.resume(); return tryPipedInstance(); }
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          if (done) return;
          done = true;
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(body);
        });
      }).on('error', () => { if (!done) tryPipedInstance(); }).on('timeout', function() { this.destroy(); if (!done) tryPipedInstance(); });
    }
    tryPipedInstance();
    return;
  }

  // YouTube InnerTube API proxy (search + video details)
  if (url.startsWith('/api/yt-proxy') && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { action, query, videoId, gl, hl } = JSON.parse(b);
        const https = require('https');
        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const ctx = { context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', gl: gl || 'DE', hl: hl || 'de' } } };

        let apiPath, postData;
        if (action === 'search') {
          apiPath = '/youtubei/v1/search?key=' + INNERTUBE_KEY + '&prettyPrint=false';
          postData = JSON.stringify({ ...ctx, query: query || 'trending' });
        } else if (action === 'video') {
          apiPath = '/youtubei/v1/player?key=' + INNERTUBE_KEY + '&prettyPrint=false';
          postData = JSON.stringify({ ...ctx, videoId: videoId });
        } else {
          return jsonRes(res, { error: 'Unknown action' });
        }

        const options = {
          hostname: 'www.youtube.com', port: 443, path: apiPath, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000
        };
        const proxyReq = https.request(options, proxyRes => {
          let body = '';
          proxyRes.on('data', c => body += c);
          proxyRes.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(body);
          });
        });
        proxyReq.on('error', e => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        });
        proxyReq.on('timeout', () => { proxyReq.destroy(); });
        proxyReq.write(postData);
        proxyReq.end();
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }

  // App routes
  const appMatch = url.match(/^\/app\/([a-z0-9-]+)(\/.*)?$/);
  if (appMatch) {
    const [, appId, rest] = appMatch;
    const appDir = path.join(ROOT, 'apps', appId);

    if (!rest) { res.writeHead(302, { Location: `/app/${appId}/` }); return res.end(); }
    if (req.method === 'GET' && rest === '/') return appHtmlRes(res, path.join(appDir, 'index.html'), appId);

    const apiMatch = rest.match(/^\/api\/([a-z0-9-]+)$/);
    if (apiMatch) {
      const file = path.join(appDir, 'data', apiMatch[1] + '.json');
      if (req.method === 'GET') return jsonRes(res, safeReadJSON(file, {}));
      if (req.method === 'PUT') return readBody(req, b => {
        fs.writeFileSync(file, JSON.stringify(JSON.parse(b), null, 2));
        broadcast(appId, { type: 'change', file: apiMatch[1] + '.json', time: Date.now() });
        jsonRes(res, { ok: true });
      });
    }
  }

  res.writeHead(404).end('Not found');
}).listen(PORT, () => {
  console.log(`Claude Desktop → http://localhost:${PORT}`);
  // Auto-start chat worker
  const workerPath = path.join(ROOT, 'chat-worker.js');
  if (fs.existsSync(workerPath)) {
    const worker = spawn('node', [workerPath], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
    worker.stdout.on('data', c => process.stdout.write('[chat-worker] ' + c));
    worker.stderr.on('data', c => process.stderr.write('[chat-worker] ' + c));
    worker.on('error', e => console.error('[chat-worker] failed to start:', e.message));
    console.log('[chat-worker] Started');
  }
});
