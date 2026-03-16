const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;

// --- Data file initialization ---
const MODIFY_QUEUE_FILE = path.join(ROOT, 'data', 'modify-queue.json');
let terminalSessionActive = false;
const AGENTS_FILE = path.join(ROOT, 'data', 'agents.json');
if (!fs.existsSync(path.join(ROOT, 'data'))) fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
if (!fs.existsSync(MODIFY_QUEUE_FILE)) fs.writeFileSync(MODIFY_QUEUE_FILE, JSON.stringify({ pending: [] }, null, 2));
if (!fs.existsSync(AGENTS_FILE)) fs.writeFileSync(AGENTS_FILE, JSON.stringify({ agents: [] }, null, 2));

// --- Helpers ---
function jsonRes(res, data) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); }
function htmlRes(res, file) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' }); res.end(fs.readFileSync(file)); }
function readBody(req, cb) { let b = ''; req.on('data', c => b += c); req.on('end', () => cb(b)); }
function safeReadJSON(file, fallback) { try { return fs.readFileSync(file, 'utf8'); } catch { return JSON.stringify(fallback); } }

// --- App HTML with injected modifier overlay ---
function appHtmlRes(res, file, appId) {
  let html = fs.readFileSync(file, 'utf8');
  // Inject SSE blocker BEFORE any app scripts to prevent connection exhaustion
  // Apps in iframes don't need their own SSE — the dashboard handles updates
  // Exception: terminal app needs its SSE for PTY output
  const ssePatch = appId === 'terminal' ? '' : `<script>
(function(){
  if (window.parent !== window) {
    window.__OrigEventSource = window.EventSource;
    window.EventSource = function(url) {
      console.log('[sse-blocked] ' + url + ' (iframe mode)');
      this.close = function(){};
      this.addEventListener = function(){};
      this.removeEventListener = function(){};
      this.onmessage = null;
      this.onerror = null;
      this.onopen = null;
      this.readyState = 2;
      this.url = url;
    };
  }
})();
</script>`;
  html = html.replace('<head>', '<head>' + ssePatch);
  html = html.replace('</body>', getModifierOverlay(appId) + '\n</body>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  res.end(html);
}

function getModifierOverlay(appId) {
  return `<!-- App Modifier Overlay -->
<style>
#__mc-panel{position:fixed;right:10px;top:10px;width:310px;background:#0f0f1a;border-radius:14px;border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 40px rgba(0,0,0,.6);overflow:hidden;display:none;flex-direction:column;font-family:system-ui,sans-serif;z-index:99999}
#__mc-head{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between}
#__mc-head span{font-size:.8rem;color:rgba(255,255,255,.5);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
#__mc-model{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:rgba(255,255,255,.7);font-size:.7rem;padding:2px 6px;cursor:pointer;outline:none}
#__mc-model option{background:#1a1a2e;color:#fff}
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
      <select id="__mc-model"><option value="auto">auto</option><option value="haiku">haiku</option><option value="sonnet">sonnet</option><option value="opus">opus</option></select>
      <button id="__mc-close" onclick="document.getElementById('__mc-panel').style.display='none'">✕</button>
    </div>
    <div id="__mc-msgs">
      <div class="__mc-a">Wie soll ich die App aendern?</div>
    </div>
    <div id="__mc-row">
      <textarea id="__mc-input" rows="2" placeholder="z.B. Mach den Hintergrund dunkel"></textarea>
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
  let __mcSSE = null;
  let __mcRequestId = null;

  // SSE connection for completion detection
  function __mcListenSSE() {
    if (__mcSSE) return;
    __mcSSE = new EventSource('/sse/' + __APP_ID);
    __mcSSE.onmessage = function(e) {
      if (e.data === 'connected') return;
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'change' && d.file === 'index.html' && __mcRequestId) {
          __mcRequestId = null;
          document.getElementById('__mc-otext').textContent = '✓ Fertig! Seite laedt neu…';
          setTimeout(() => location.reload(), 900);
        }
      } catch {}
    };
  }

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

    const modelSel = document.getElementById('__mc-model').value;
    const body = { appId: __APP_ID, request: msg };
    if (modelSel !== 'auto') body.model = modelSel;

    document.getElementById('__mc-otext').textContent = 'Prüfe Agent-Status…';

    try {
      // Check if a modifier agent is alive before queuing
      const agentCheck = await fetch('/api/agents').then(r=>r.json()).catch(()=>({agents:[]}));
      const modAgent = (agentCheck.agents||[]).find(a => a.type === 'modifier' && a.status === 'running');
      if (!modAgent) {
        document.getElementById('__mc-overlay').style.display = 'none';
        document.getElementById('__mc-panel').style.display = 'flex';
        msgs.innerHTML += '<div class="__mc-a">💤 Kein Modifier-Agent verbunden. Starte /guitest-modifier in einer neuen Claude Code Session.</div>';
        document.getElementById('__mc-send').disabled = false;
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }

      // Start listening for SSE completion BEFORE sending request
      __mcListenSSE();

      const r = await fetch('/api/modify-queue', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if(d.ok) {
        __mcRequestId = d.requestId;
        const modelLabel = d.model || modelSel;
        document.getElementById('__mc-otext').textContent = 'Agent arbeitet (' + modelLabel + ')…';
        msgs.innerHTML += '<div class="__mc-a">📋 In Warteschlange (Model: ' + modelLabel + ')</div>';

        // Fallback timeout: if no SSE after 3 minutes, show error
        setTimeout(() => {
          if (__mcRequestId) {
            __mcRequestId = null;
            document.getElementById('__mc-overlay').style.display = 'none';
            document.getElementById('__mc-panel').style.display = 'flex';
            msgs.innerHTML += '<div class="__mc-a">⚠️ Timeout — kein Agent hat geantwortet.</div>';
            document.getElementById('__mc-send').disabled = false;
            msgs.scrollTop = msgs.scrollHeight;
          }
        }, 180000);
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

// --- Model Selection Heuristic ---
function selectModel(request) {
  const configFile = path.join(ROOT, 'apps', 'orchestrator', 'data', 'config.json');
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const text = request.toLowerCase();
    for (const rule of (config.modelRules || [])) {
      if (new RegExp(rule.match, 'i').test(text)) return rule.model;
    }
    return config.modelDefaults?.modifier || 'sonnet';
  } catch {
    return 'sonnet';
  }
}

// --- Agent Registry Helpers ---
function readAgents() {
  try { return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch { return { agents: [] }; }
}
function writeAgents(data) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
}
function updateAgent(agentId, updates) {
  const data = readAgents();
  let agent = data.agents.find(a => a.id === agentId);
  if (!agent) {
    agent = { id: agentId, type: updates.type || 'unknown', model: 'sonnet', status: 'running', lastHeartbeat: new Date().toISOString(), lastActivity: new Date().toISOString(), startedAt: new Date().toISOString(), currentTask: null, queueDepth: 0, errorCount: 0, tasksCompleted: 0 };
    data.agents.push(agent);
  }
  Object.assign(agent, updates);
  writeAgents(data);
  broadcast('orchestrator', { type: 'change', file: 'agents.json', time: Date.now() });
  return agent;
}
function readModifyQueue() {
  try { return JSON.parse(fs.readFileSync(MODIFY_QUEUE_FILE, 'utf8')); } catch { return { pending: [] }; }
}
function writeModifyQueue(data) {
  fs.writeFileSync(MODIFY_QUEUE_FILE, JSON.stringify(data, null, 2));
}

// --- Orchestrator Health Tracking ---
let orchestratorLastResponse = 0;  // timestamp of last successful chat-respond
let orchestratorLastPoll = 0;      // timestamp of last chat-wait poll
const ORCHESTRATOR_TIMEOUT_MS = 90000; // 90s — if no poll in this time, consider offline
const MESSAGE_TIMEOUT_MS = 300000;     // 5min — safety timeout for in_progress messages (agent died mid-task)
const NEW_MESSAGE_TIMEOUT_MS = 30000;  // 30s — timeout for new messages not yet picked up by agent
const FAST_OFFLINE_MS = 15000;         // 15s — trigger fallback when no agent is connected (must be > agent poll cycle)
let fallbackInProgress = new Set();    // track msgIds being answered by claude -p fallback

function isOrchestratorAlive() {
  if (orchestratorLastPoll === 0) return false;
  return (Date.now() - orchestratorLastPoll) < ORCHESTRATOR_TIMEOUT_MS;
}

// Watchdog: check for stale pending messages + agent health every 15s
const AGENT_TIMEOUT_MS = 90000;
const MODIFY_STALE_MS = 120000;

setInterval(() => {
  // --- Chat queue watchdog ---
  const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
  try {
    const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
    if (queue.pending.length > 0) {
      const now = Date.now();
      const alive = isOrchestratorAlive();
      const stale = [];
      for (const msg of queue.pending) {
        if (msg.status === 'in_progress') {
          // Agent picked this up — only timeout after 5min (agent probably died)
          const pickupAge = now - new Date(msg.pickedUpAt || msg.queuedAt).getTime();
          if (pickupAge > MESSAGE_TIMEOUT_MS) stale.push(msg);
        } else {
          // Not picked up yet — use fast timeout if no agent, normal if agent alive
          const age = now - new Date(msg.queuedAt).getTime();
          const timeoutMs = alive ? NEW_MESSAGE_TIMEOUT_MS : FAST_OFFLINE_MS;
          if (age > timeoutMs) stale.push(msg);
        }
      }
      if (stale.length > 0) {
        // Use claude -p fallback for ALL stale messages (whether agent alive or not)
        // If agent is alive but slow, fallback is still better than timeout
        for (const msg of stale) {
          if (fallbackInProgress.has(msg.msgId)) continue; // already being processed
          fallbackInProgress.add(msg.msgId);

          // Remove from queue immediately so agent doesn't also pick it up
          queue.pending = queue.pending.filter(p => p.msgId !== msg.msgId);
          fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

          console.log(`[fallback] Spawning claude -p for "${msg.text.slice(0, 60)}" (${msg.msgId})`);
          const prompt = `Du bist ein hilfreicher Chat-Assistent im GUITest Dashboard (localhost:3000). Das Projektverzeichnis ist ${ROOT}. Antworte auf Deutsch, kompakt (max 2-3 Absaetze). Die Frage: ${msg.text}`;
          const claudeProc = spawn('claude', ['-p'], {
            cwd: ROOT,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          claudeProc.stdin.write(prompt);
          claudeProc.stdin.end();
          let output = '';
          claudeProc.stdout.on('data', c => { output += c.toString(); });
          claudeProc.stderr.on('data', c => console.error('[fallback-stderr]', c.toString().trim()));
          // Kill after 2 minutes if still running
          const killTimer = setTimeout(() => {
            console.log(`[fallback] Killing claude -p after 120s timeout for ${msg.msgId}`);
            claudeProc.kill('SIGTERM');
          }, 120000);
          claudeProc.on('close', (code) => {
            clearTimeout(killTimer);
            fallbackInProgress.delete(msg.msgId);
            const responseText = output.trim() || '⚠️ Konnte keine Antwort generieren.';
            console.log(`[fallback] claude -p finished (code=${code}, ${output.length} bytes) for ${msg.msgId}: "${responseText.slice(0, 80)}"`);
            try {
              const chatFile = path.join(ROOT, 'apps', 'chat', 'data', 'chat.json');
              const data = JSON.parse(safeReadJSON(chatFile, { activeChat: 'chat-1', chats: [] }));
              const chat = data.chats.find(c => c.id === msg.chatId);
              if (chat) {
                const userMsg = chat.messages.find(m => m.id === msg.msgId);
                if (userMsg) userMsg.pending = false;
                chat.messages.push({
                  id: 'msg-' + Date.now() + '-fallback',
                  role: 'claude',
                  text: responseText,
                  time: new Date().toISOString()
                });
                fs.writeFileSync(chatFile, JSON.stringify(data, null, 2));
                broadcast('chat', { type: 'change', file: 'chat.json', time: Date.now() });
              }
            } catch (e) {
              console.error('[fallback] write error:', e.message);
            }
          });
          claudeProc.on('error', (e) => {
            clearTimeout(killTimer);
            fallbackInProgress.delete(msg.msgId);
            console.error('[fallback] spawn error:', e.message);
          });
        }
      }
    }
  } catch (e) {
    console.error('[watchdog] chat error:', e.message);
  }

  // --- Agent health watchdog ---
  try {
    const agentData = readAgents();
    let changed = false;
    const now = Date.now();
    for (const agent of agentData.agents) {
      if (agent.status === 'running' && agent.lastHeartbeat) {
        const age = now - new Date(agent.lastHeartbeat).getTime();
        if (age > AGENT_TIMEOUT_MS) {
          agent.status = 'dead';
          changed = true;
          console.log(`[watchdog] Agent ${agent.id} marked dead (no heartbeat for ${Math.round(age/1000)}s)`);
        }
      }
    }
    if (changed) {
      writeAgents(agentData);
    }
  } catch (e) {
    console.error('[watchdog] agent error:', e.message);
  }

  // --- Modify queue watchdog with claude -p fallback ---
  try {
    const mq = readModifyQueue();
    const now = Date.now();
    let changed = false;
    // Check if modifier agent is alive
    const agentsData = readAgents();
    const modAgent = agentsData.agents.find(a => a.type === 'modifier' && a.status === 'running');
    const modifierAlive = modAgent && (now - new Date(modAgent.lastHeartbeat).getTime()) < AGENT_TIMEOUT_MS;

    for (const item of mq.pending) {
      if (item.status !== 'pending') continue;
      const age = now - new Date(item.createdAt).getTime();

      if (!modifierAlive && age > 15000 && !fallbackInProgress.has(item.id)) {
        // No modifier agent — use claude -p fallback
        fallbackInProgress.add(item.id);
        item.status = 'in_progress';
        item.pickedUpBy = 'fallback';
        changed = true;

        const htmlFile = item.htmlFile || path.join(ROOT, 'apps', item.appId, 'index.html');
        let htmlContent = '';
        try { htmlContent = fs.readFileSync(htmlFile, 'utf8'); } catch {}

        const prompt = `Du bist ein Web-Entwickler. Aendere diese HTML-Datei gemaess der Anweisung.
App: ${item.appName || item.appId} — ${item.appDescription || ''}
Anweisung: ${item.request}

WICHTIG: Gib NUR den vollstaendigen neuen HTML-Code aus, OHNE Erklaerungen, OHNE Markdown-Codeblocks.
Die Datei ist eine Single-File HTML App (HTML+CSS+JS in einer Datei).

Aktuelle Datei:
${htmlContent}`;

        console.log(`[mod-fallback] Spawning claude -p for ${item.appId}: "${item.request.slice(0, 60)}"`);
        const claudeProc = spawn('claude', ['-p', prompt], {
          cwd: ROOT,
          env: process.env,
          timeout: 180000
        });
        let output = '';
        claudeProc.stdout.on('data', c => output += c);
        claudeProc.stderr.on('data', c => console.error('[mod-fallback-stderr]', c.toString().trim()));
        claudeProc.on('close', (code) => {
          fallbackInProgress.delete(item.id);
          console.log(`[mod-fallback] claude -p finished (code=${code}) for ${item.id}`);
          try {
            let newHtml = output.trim();
            // Strip markdown code fences if present
            if (newHtml.startsWith('```')) {
              newHtml = newHtml.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
            }
            if (newHtml && newHtml.includes('<') && newHtml.length > 100) {
              fs.writeFileSync(htmlFile, newHtml);
              console.log(`[mod-fallback] Wrote ${newHtml.length} bytes to ${htmlFile}`);
              broadcast(item.appId, { type: 'change', file: 'index.html', time: Date.now() });
            } else {
              console.error(`[mod-fallback] Output doesn't look like HTML (${newHtml.length} bytes), skipping write`);
            }
            // Remove from queue
            const q = readModifyQueue();
            q.pending = q.pending.filter(p => p.id !== item.id);
            writeModifyQueue(q);
          } catch (e) {
            console.error('[mod-fallback] write error:', e.message);
          }
        });
        claudeProc.on('error', (e) => {
          fallbackInProgress.delete(item.id);
          console.error('[mod-fallback] spawn error:', e.message);
        });
      } else if (modifierAlive && age > MODIFY_STALE_MS) {
        // Agent alive but request still pending after 2min — mark stale
        item.status = 'stale';
        changed = true;
        console.log(`[watchdog] Modify request ${item.id} marked stale (${Math.round(age/1000)}s)`);
      }
    }
    if (changed) writeModifyQueue(mq);
  } catch (e) {
    console.error('[watchdog] modify error:', e.message);
  }
}, 5000); // 5s interval — fast offline detection for chat messages

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
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = req.url.split('?')[0];

  // Debug: log app requests
  if (url.startsWith('/app/')) console.log('[req]', req.method, url);

  if (req.method === 'GET' && url === '/') return htmlRes(res, path.join(ROOT, 'dashboard.html'));
  if (req.method === 'GET' && url === '/liveos') return htmlRes(res, path.join(ROOT, 'liveos.html'));
  if (req.method === 'GET' && url === '/theme.css') {
    const css = path.join(ROOT, 'widgets', 'liveos-theme.css');
    if (fs.existsSync(css)) { res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(css)); }
    res.writeHead(404); return res.end('Not found');
  }

  // Terminal SSE — must be before generic app SSE handler
  if (url === '/sse/terminal' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: {"type":"connected"}\n\n');
    terminalSSEClient = res;
    startTerminalKeepAlive();
    console.log('[terminal] SSE client connected');
    if (!ptyProcess) startTerminalPty(120, 40);
    req.on('close', () => {
      console.log('[terminal] SSE client disconnected');
      if (terminalSSEClient === res) terminalSSEClient = null;
      stopTerminalKeepAlive();
    });
    return;
  }

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
      ageSec: orchestratorLastPoll ? Math.round((Date.now() - orchestratorLastPoll) / 1000) : -1,
      supervisor: typeof getSupervisorStatus === 'function' ? getSupervisorStatus() : null
    });
  }

  // Chat long-poll — blocks until a new message is queued (max 60s)
  if (url === '/api/chat-wait' && req.method === 'GET') {
    orchestratorLastPoll = Date.now();
    const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
    // Check if there's already something pending (not yet picked up)
    const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
    const ready = queue.pending.find(m => m.status !== 'in_progress');
    if (ready) {
      // Mark as in_progress so watchdog won't timeout on it
      ready.status = 'in_progress';
      ready.pickedUpAt = new Date().toISOString();
      fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
      return jsonRes(res, ready);
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
        const nextReady = q.pending && q.pending.find(m => m.status !== 'in_progress');
        if (nextReady) {
          responded = true;
          clearTimeout(timeout);
          try { watcher.close(); } catch {}
          // Mark as in_progress
          nextReady.status = 'in_progress';
          nextReady.pickedUpAt = new Date().toISOString();
          fs.writeFileSync(queueFile, JSON.stringify(q, null, 2));
          jsonRes(res, nextReady);
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

  // --- Modify Queue ---
  // GET: read queue status
  if (url === '/api/modify-queue' && req.method === 'GET') {
    return jsonRes(res, JSON.stringify(readModifyQueue()));
  }
  // POST: add new request to queue
  if (url === '/api/modify-queue' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { appId, request, model } = JSON.parse(b);
        if (!appId || !request) return jsonRes(res, { ok: false, error: 'appId und request erforderlich' });
        const htmlFile = path.join(ROOT, 'apps', appId, 'index.html');
        if (!fs.existsSync(htmlFile)) return jsonRes(res, { ok: false, error: `App "${appId}" nicht gefunden` });
        // Enrich with app context so the agent knows WHICH app
        let appName = appId, appDesc = '';
        try {
          const appsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'apps.json'), 'utf8'));
          const appInfo = appsData.apps.find(a => a.id === appId);
          if (appInfo) { appName = appInfo.name; appDesc = appInfo.description || ''; }
        } catch {}
        // Save version before queuing
        saveVersion(appId);
        const requestId = 'mod-' + Date.now();
        const selectedModel = model || selectModel(request);
        const queue = readModifyQueue();
        queue.pending.push({
          id: requestId, appId, request,
          appName, appDescription: appDesc,
          htmlFile: path.resolve(htmlFile),
          model: selectedModel,
          status: 'pending',
          createdAt: new Date().toISOString(),
          pickedUpAt: null, agentId: null
        });
        writeModifyQueue(queue);
        console.log(`[modify-queue] ${appId} (${appName}): "${request.slice(0, 60)}" model=${selectedModel}`);
        jsonRes(res, { ok: true, requestId, model: selectedModel });
      } catch(e) {
        console.error('[modify-queue] error:', e.message);
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Backward compat: old endpoint redirects to queue
  if (url === '/api/modify-app' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { appId, request } = JSON.parse(b);
        if (!appId || !request) return jsonRes(res, { ok: false, error: 'appId und request erforderlich' });
        const htmlFile = path.join(ROOT, 'apps', appId, 'index.html');
        if (!fs.existsSync(htmlFile)) return jsonRes(res, { ok: false, error: `App "${appId}" nicht gefunden` });
        let appName = appId, appDesc = '';
        try {
          const appsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'apps.json'), 'utf8'));
          const appInfo = appsData.apps.find(a => a.id === appId);
          if (appInfo) { appName = appInfo.name; appDesc = appInfo.description || ''; }
        } catch {}
        saveVersion(appId);
        const requestId = 'mod-' + Date.now();
        const selectedModel = selectModel(request);
        const queue = readModifyQueue();
        queue.pending.push({
          id: requestId, appId, request, appName, appDescription: appDesc,
          htmlFile: path.resolve(htmlFile), model: selectedModel, status: 'pending',
          createdAt: new Date().toISOString(), pickedUpAt: null, agentId: null
        });
        writeModifyQueue(queue);
        jsonRes(res, { ok: true, requestId, model: selectedModel, queued: true });
      } catch(e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Modify long-poll — modifier agent waits here for new tasks
  if (url === '/api/modify-wait' && req.method === 'GET') {
    const queue = readModifyQueue();
    const pending = queue.pending.find(p => p.status === 'pending' && !p.pickedUpAt);
    if (pending) {
      pending.pickedUpAt = new Date().toISOString();
      pending.status = 'processing';
      writeModifyQueue(queue);
      return jsonRes(res, pending);
    }
    // Long-poll: wait for new entry
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) { responded = true; try { watcher.close(); } catch {} jsonRes(res, { timeout: true }); }
    }, 55000);
    let watcher;
    try {
      watcher = fs.watch(MODIFY_QUEUE_FILE, () => {
        if (responded) return;
        try {
          const q = readModifyQueue();
          const next = q.pending.find(p => p.status === 'pending' && !p.pickedUpAt);
          if (next) {
            responded = true;
            clearTimeout(timeout);
            try { watcher.close(); } catch {}
            next.pickedUpAt = new Date().toISOString();
            next.status = 'processing';
            writeModifyQueue(q);
            jsonRes(res, next);
          }
        } catch {}
      });
    } catch {
      if (!responded) { responded = true; clearTimeout(timeout); jsonRes(res, { timeout: true }); }
    }
    res.on('close', () => { responded = true; clearTimeout(timeout); try { watcher.close(); } catch {} });
    return;
  }

  // Modify done — agent reports completion
  if (url === '/api/modify-done' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { requestId, appId, status, summary, agentId } = JSON.parse(b);
        if (!requestId) return jsonRes(res, { ok: false, error: 'requestId required' });
        const queue = readModifyQueue();
        queue.pending = queue.pending.filter(p => p.id !== requestId);
        writeModifyQueue(queue);
        // Update agent stats
        if (agentId) {
          const agentData = readAgents();
          const agent = agentData.agents.find(a => a.id === agentId);
          if (agent) {
            agent.lastActivity = new Date().toISOString();
            agent.currentTask = null;
            agent.tasksCompleted = (agent.tasksCompleted || 0) + 1;
            agent.queueDepth = queue.pending.length;
            writeAgents(agentData);
          }
        }
        // Broadcast to app scope so iframe reloads
        if (appId) {
          broadcast(appId, { type: 'change', file: 'index.html', time: Date.now() });
        }
        console.log(`[modify-done] ${requestId} status=${status || 'done'} summary=${(summary || '').slice(0, 80)}`);
        jsonRes(res, { ok: true });
      } catch(e) {
        console.error('[modify-done] error:', e.message);
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Agent registry — get all agents
  if (url === '/api/agents' && req.method === 'GET') {
    return jsonRes(res, JSON.stringify(readAgents()));
  }

  // Agent heartbeat — agents report they're alive
  if (url === '/api/agent-heartbeat' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { agentId, type, model, currentTask } = JSON.parse(b);
        if (!agentId) return jsonRes(res, { ok: false, error: 'agentId required' });
        const updates = { lastHeartbeat: new Date().toISOString(), status: 'running' };
        if (type) updates.type = type;
        if (model) updates.model = model;
        if (currentTask !== undefined) updates.currentTask = currentTask;
        updateAgent(agentId, updates);
        jsonRes(res, { ok: true });
      } catch(e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Modify queue status — check status of a request
  if (url.startsWith('/api/modify-status/') && req.method === 'GET') {
    const requestId = url.split('/').pop();
    const queue = readModifyQueue();
    const item = queue.pending.find(p => p.id === requestId);
    if (item) return jsonRes(res, item);
    return jsonRes(res, { id: requestId, status: 'completed' });
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

  // --- Live.OS Context API ---
  if (url === '/api/contexts') {
    const ctxDir = path.join(ROOT, 'data', 'contexts');
    if (req.method === 'GET') {
      try {
        const files = fs.readdirSync(ctxDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
        const contexts = files.map(f => { try { return JSON.parse(fs.readFileSync(path.join(ctxDir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
        return jsonRes(res, { contexts });
      } catch { return jsonRes(res, { contexts: [] }); }
    }
    if (req.method === 'POST') {
      return readBody(req, b => {
        const ctx = JSON.parse(b);
        if (!ctx.id) ctx.id = 'ctx-' + Date.now();
        ctx.created = ctx.created || new Date().toISOString();
        ctx.widgets = ctx.widgets || [];
        ctx.connections = ctx.connections || [];
        const ctxFile = path.join(ctxDir, ctx.id + '.json');
        const ctxDataDir = path.join(ctxDir, ctx.id);
        if (!fs.existsSync(ctxDataDir)) fs.mkdirSync(ctxDataDir, { recursive: true });
        fs.writeFileSync(path.join(ctxDataDir, '_changelog.json'), JSON.stringify({ entries: [] }, null, 2));
        fs.writeFileSync(ctxFile, JSON.stringify(ctx, null, 2));
        jsonRes(res, { ok: true, id: ctx.id });
      });
    }
  }

  const ctxMatch = url.match(/^\/api\/context\/([a-z0-9-]+)$/);
  if (ctxMatch) {
    const ctxId = ctxMatch[1];
    const ctxFile = path.join(ROOT, 'data', 'contexts', ctxId + '.json');
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(ctxFile, { id: ctxId, widgets: [], connections: [] }));
    if (req.method === 'PUT') return readBody(req, b => {
      fs.writeFileSync(ctxFile, JSON.stringify(JSON.parse(b), null, 2));
      broadcast('liveos', { type: 'context-change', contextId: ctxId, time: Date.now() });
      jsonRes(res, { ok: true });
    });
  }

  const ctxChangelogMatch = url.match(/^\/api\/context\/([a-z0-9-]+)\/changelog$/);
  if (ctxChangelogMatch && req.method === 'GET') {
    const logFile = path.join(ROOT, 'data', 'contexts', ctxChangelogMatch[1], '_changelog.json');
    return jsonRes(res, safeReadJSON(logFile, { entries: [] }));
  }

  // Widget data endpoint (generic, context-relative)
  const qsParsed = new URL(req.url, 'http://localhost');
  const widgetSource = qsParsed.searchParams.get('source');
  if (url === '/api/widget-data' && widgetSource) {
    const safePath = widgetSource.replace(/\.\./g, '');
    const dataFile = path.join(ROOT, 'data', safePath);
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(dataFile, {}));
    if (req.method === 'PUT') return readBody(req, b => {
      const newData = JSON.parse(b);
      // Changelog: detect context and write entry
      const ctxMatch2 = safePath.match(/^contexts\/([a-z0-9-]+)\//);
      if (ctxMatch2) {
        const logFile = path.join(ROOT, 'data', 'contexts', ctxMatch2[1], '_changelog.json');
        try {
          const log = JSON.parse(safeReadJSON(logFile, { entries: [] }));
          log.entries.push({
            ts: new Date().toISOString(),
            source: qsParsed.searchParams.get('agent') || 'user',
            dataFile: safePath,
            op: 'update',
            summary: qsParsed.searchParams.get('summary') || 'Data updated'
          });
          if (log.entries.length > 200) log.entries = log.entries.slice(-200);
          fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
        } catch {}
      }
      fs.writeFileSync(dataFile, JSON.stringify(newData, null, 2));
      broadcast('liveos', { type: 'widget-data-change', source: safePath, time: Date.now() });
      jsonRes(res, { ok: true });
    });
  }

  // Widget HTML serving (parameterized injection)
  const widgetMatch = url.match(/^\/widget\/([a-z0-9-]+)$/);
  if (widgetMatch && req.method === 'GET') {
    const typeId = widgetMatch[1];
    const widgetHtml = path.join(ROOT, 'widgets', typeId, 'widget.html');
    if (!fs.existsSync(widgetHtml)) { res.writeHead(404); return res.end('Widget not found'); }
    let html = fs.readFileSync(widgetHtml, 'utf8');
    const instanceId = qsParsed.searchParams.get('id') || '';
    const dataSource = qsParsed.searchParams.get('source') || '';
    const config = qsParsed.searchParams.get('config') || '{}';
    const injection = `<script>
window.__WIDGET_ID = '${instanceId}';
window.__DATA_SOURCE = '${dataSource}';
window.__CONFIG = ${config};
</script>
<link rel="stylesheet" href="/theme.css">`;
    html = html.replace('<head>', '<head>' + injection);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(html);
  }

  // Widget types registry
  if (url === '/api/widget-types' && req.method === 'GET') {
    return jsonRes(res, safeReadJSON(path.join(ROOT, 'data', 'widget-types.json'), { types: [] }));
  }

  // App routes
  const appMatch = url.match(/^\/app\/([a-z0-9-]+)(\/.*)?$/);
  if (appMatch) {
    const [, appId, rest] = appMatch;
    const appDir = path.join(ROOT, 'apps', appId);

    if (!rest) { res.writeHead(302, { Location: `/app/${appId}/` }); return res.end(); }
    if (req.method === 'GET' && rest === '/') return appHtmlRes(res, path.join(appDir, 'index.html'), appId);

    // FileBrowser: serve raw file (for media previews)
    const serveMatch = rest && rest.match(/^\/api\/serve\/(.+)$/);
    if (appId === 'filebrowser' && serveMatch && req.method === 'GET') {
      const filePath = decodeURIComponent(serveMatch[1]);
      const fullPath = path.join(ROOT, filePath);
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(ROOT)) {
        res.writeHead(403); return res.end('Access denied');
      }
      try {
        const stat = fs.statSync(resolved);
        const ext = path.extname(resolved).toLowerCase().slice(1);
        const mimeTypes = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
          svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
          mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
          mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
          pdf: 'application/pdf'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size });
        fs.createReadStream(resolved).pipe(res);
      } catch(e) {
        res.writeHead(404); res.end('File not found');
      }
      return;
    }

    // FileBrowser: read file content endpoint
    if (appId === 'filebrowser' && rest === '/api/read-file' && req.method === 'POST') {
      return readBody(req, b => {
        try {
          const { filePath } = JSON.parse(b);
          // Security: only allow reading within ROOT
          const fullPath = path.join(ROOT, ...filePath);
          const resolved = path.resolve(fullPath);
          if (!resolved.startsWith(ROOT)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Access denied' }));
          }
          const content = fs.readFileSync(resolved, 'utf-8');
          return jsonRes(res, { ok: true, content, path: filePath });
        } catch(e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: e.message }));
        }
      });
    }

    // FileBrowser: scan filesystem endpoint
    if (appId === 'filebrowser' && rest === '/api/scan' && req.method === 'POST') {
      function scanDir(dirPath, maxDepth = 4, depth = 0) {
        if (depth > maxDepth) return [];
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          return entries
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'backups')
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(e => {
              const fullPath = path.join(dirPath, e.name);
              if (e.isDirectory()) {
                return { name: e.name, type: 'dir', children: scanDir(fullPath, maxDepth, depth + 1) };
              } else {
                try {
                  const stat = fs.statSync(fullPath);
                  return { name: e.name, type: 'file', size: stat.size };
                } catch { return { name: e.name, type: 'file', size: 0 }; }
              }
            });
        } catch { return []; }
      }
      const tree = { name: 'GUITest', type: 'dir', children: scanDir(ROOT) };
      const filesJson = path.join(appDir, 'data', 'files.json');
      fs.writeFileSync(filesJson, JSON.stringify({ tree }, null, 2));
      broadcast('filebrowser', { type: 'change', file: 'files.json', time: Date.now() });
      return jsonRes(res, { ok: true, files: tree.children.length });
    }

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

  // --- Terminal API: Direct pipe to claude with real-time SSE streaming ---
  if (url === '/api/terminal-send' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { text } = JSON.parse(b);
        if (!text) return jsonRes(res, { ok: false, error: 'text required' });

        // Build claude args: stream-json + partial messages for real token streaming
        const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
        // Continue previous conversation if one exists
        if (terminalSessionActive) args.push('--continue');

        console.log(`[terminal] Spawning claude for: "${text.slice(0, 60)}"`);
        const proc = spawn('claude', args, {
          cwd: ROOT,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        proc.stdin.write(text);
        proc.stdin.end();
        terminalSessionActive = true;
        let sentDone = false;

        let buffer = '';
        proc.stdout.on('data', chunk => {
          buffer += chunk.toString();
          // Process complete JSON lines
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line in buffer
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              // Token streaming via stream_event content_block_delta
              if (evt.type === 'stream_event' && evt.event) {
                const e = evt.event;
                if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') {
                  broadcast('terminal', { type: 'token', text: e.delta.text });
                }
              }
              // Full assistant message (fallback if no streaming)
              else if (evt.type === 'assistant' && evt.message && evt.message.content) {
                for (const block of evt.message.content) {
                  if (block.type === 'text' && block.text) {
                    broadcast('terminal', { type: 'token', text: block.text });
                  }
                }
              }
              // Final result
              else if (evt.type === 'result') {
                if (!sentDone) {
                  sentDone = true;
                  broadcast('terminal', { type: 'done', sessionId: evt.session_id });
                }
                console.log(`[terminal] Done (${evt.duration_ms}ms, $${(evt.total_cost_usd || 0).toFixed(4)})`);
              }
            } catch {}
          }
        });

        proc.stderr.on('data', c => {
          const err = c.toString().trim();
          if (err) console.error('[terminal-stderr]', err);
        });

        proc.on('close', (code) => {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const evt = JSON.parse(buffer);
              if (evt.type === 'result' && !sentDone) {
                sentDone = true;
                broadcast('terminal', { type: 'done', sessionId: evt.session_id });
              }
            } catch {}
          }
          if (code !== 0 && code !== null) {
            broadcast('terminal', { type: 'error', text: `claude beendet (code ${code})` });
          }
          if (!sentDone) {
            sentDone = true;
            broadcast('terminal', { type: 'done' });
          }
        });

        proc.on('error', (e) => {
          console.error('[terminal] spawn error:', e.message);
          broadcast('terminal', { type: 'error', text: e.message });
        });

        // Kill after 5 minutes
        setTimeout(() => {
          try { proc.kill('SIGTERM'); } catch {}
        }, 300000);

        jsonRes(res, { ok: true });
      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // --- Notify Change API: agents call this after writing files to trigger SSE refresh ---
  if (url === '/api/notify-change' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { appId, file } = JSON.parse(b);
        if (!appId) return jsonRes(res, { ok: false, error: 'appId required' });
        const filename = file || 'data.json';
        broadcast(appId, { type: 'change', file: filename, time: Date.now() });
        console.log(`[notify] Broadcast change for ${appId}/${filename}`);
        jsonRes(res, { ok: true });
      } catch(e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // --- Terminal PTY endpoints (POST for input/resize/restart) ---
  if (url === '/api/terminal/input' && req.method === 'POST') {
    return readBody(req, body => {
      if (ptyProcess && ptyProcess.stdin.writable) {
        ptyProcess.stdin.write(body);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  }

  if (url === '/api/terminal/resize' && req.method === 'POST') {
    return readBody(req, body => {
      try {
        const { cols, rows } = JSON.parse(body);
        console.log(`[terminal] Resize: ${cols}x${rows}`);
        if (ptyProcess && ptyProcess.stdin.writable) {
          ptyProcess.stdin.write(`\x1b[R${cols};${rows}\n`);
        } else if (!ptyProcess) {
          startTerminalPty(cols, rows);
        }
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  }

  if (url === '/api/terminal/restart' && req.method === 'POST') {
    console.log('[terminal] Restart requested');
    if (ptyProcess) { try { ptyProcess.kill('SIGTERM'); } catch {} ptyProcess = null; }
    setTimeout(() => startTerminalPty(120, 40), 200);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }

  // WebSocket test page
  if (url === '/ws-test') return htmlRes(res, path.join(ROOT, 'ws-test.html'));

  // --- Port Forwarding / Tunnel ---
  // --- Bridge Room Management ---
  if (url === '/api/bridge-room') {
    if (req.method === 'GET') {
      return jsonRes(res, { roomId: getBridgeRoom(), bridgeUrl: getBridgeUrl() });
    }
    if (req.method === 'POST') {
      return readBody(req, b => {
        const { action } = JSON.parse(b);
        if (action === 'reset') {
          const newRoomId = resetBridgeRoom();
          console.log('[bridge] Room ID reset to:', newRoomId);
          broadcast('dashboard', { type: 'bridge-room-changed', roomId: newRoomId, bridgeUrl: getBridgeUrl() });
          return jsonRes(res, { ok: true, roomId: newRoomId, bridgeUrl: getBridgeUrl() });
        }
        return jsonRes(res, { ok: false, error: 'action must be reset' });
      });
      return;
    }
  }

  if (url === '/api/tunnel') {
    if (req.method === 'GET') {
      return jsonRes(res, { active: !!tunnelProcess, url: tunnelUrl, bridgeRoom: getBridgeRoom(), bridgeUrl: getBridgeUrl() });
    }
    if (req.method === 'POST') {
      return readBody(req, b => {
        const { action } = JSON.parse(b);
        if (action === 'start') {
          if (tunnelProcess) return jsonRes(res, { ok: true, url: tunnelUrl, bridgeRoom: getBridgeRoom(), bridgeUrl: getBridgeUrl(), message: 'already running' });
          tunnelStopped = false;
          tunnelRetries = 0;
          restartTunnel();
          // Wait up to 8s for URL to appear, then respond
          let waited = 0;
          const check = setInterval(() => {
            waited += 200;
            if (tunnelUrl || waited > 8000) {
              clearInterval(check);
              jsonRes(res, { ok: !!tunnelUrl, url: tunnelUrl, bridgeRoom: getBridgeRoom(), bridgeUrl: getBridgeUrl(), message: tunnelUrl ? 'tunnel active' : 'waiting for URL (check /api/tunnel later)' });
            }
          }, 200);
        } else if (action === 'stop') {
          tunnelStopped = true;
          if (tunnelProcess) {
            try { tunnelProcess.kill('SIGTERM'); } catch {}
            tunnelProcess = null;
            tunnelUrl = null;
          }
          stopTunnelHealthCheck();
          jsonRes(res, { ok: true, message: 'tunnel stopped' });
        } else {
          jsonRes(res, { ok: false, error: 'action must be start or stop' });
        }
      });
      return;
    }
  }

  res.writeHead(404).end('Not found');
});
// Minimal WebSocket implementation (no npm needed)
// --- Terminal PTY via SSE (no WebSocket needed) ---
let ptyProcess = null;
let terminalSSEClient = null;
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelHealthCheck = null;
let tunnelStopped = true;   // true = user explicitly stopped, no auto-restart
let tunnelRetries = 0;      // reset on successful connect

// --- Bridge Room ID (persistent for WebRTC reconnect) ---
const BRIDGE_ROOM_FILE = path.join(ROOT, 'data', 'bridge-room.json');
const BRIDGE_SIGNALING_URL = 'https://web-production-84380f.up.railway.app';
function getBridgeRoom() {
  try {
    const data = JSON.parse(fs.readFileSync(BRIDGE_ROOM_FILE, 'utf8'));
    return data.roomId;
  } catch {
    return resetBridgeRoom();
  }
}
function resetBridgeRoom() {
  const roomId = 'pulse-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(BRIDGE_ROOM_FILE, JSON.stringify({ roomId, created: new Date().toISOString() }, null, 2));
  return roomId;
}
function getBridgeUrl() {
  const roomId = getBridgeRoom();
  return `${BRIDGE_SIGNALING_URL}/bridge?room=${roomId}`;
}

// Tunnel auto-reconnect: check every 30s if tunnel is still alive
function startTunnelHealthCheck() {
  stopTunnelHealthCheck();
  tunnelHealthCheck = setInterval(async () => {
    if (!tunnelProcess || !tunnelUrl) return;
    try {
      const { request } = require('https');
      const ok = await new Promise((resolve) => {
        const r = request(tunnelUrl, { method: 'HEAD', timeout: 8000 }, res => resolve(res.statusCode < 500));
        r.on('error', () => resolve(false));
        r.on('timeout', () => { r.destroy(); resolve(false); });
        r.end();
      });
      if (!ok) {
        console.log('[tunnel] Health check failed — restarting tunnel...');
        restartTunnel();
      }
    } catch { /* ignore */ }
  }, 30000);
}

function stopTunnelHealthCheck() {
  if (tunnelHealthCheck) { clearInterval(tunnelHealthCheck); tunnelHealthCheck = null; }
}

function restartTunnel() {
  // Kill old process
  if (tunnelProcess) {
    try { tunnelProcess.kill('SIGTERM'); } catch {}
    tunnelProcess = null;
  }
  tunnelUrl = null;
  stopTunnelHealthCheck();

  // Start new tunnel
  const ssh = spawn('ssh', ['-R', '80:localhost:3000', 'nokey@localhost.run', '-T', '-o', 'StrictHostKeyChecking=no', '-o', 'ServerAliveInterval=30'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  tunnelProcess = ssh;
  let output = '';
  ssh.stdout.on('data', chunk => {
    output += chunk.toString();
    const urlMatch = output.match(/(https?:\/\/[a-z0-9-]+\.lhr\.life[^\s]*)/i);
    if (urlMatch && !tunnelUrl) {
      tunnelUrl = urlMatch[1];
      tunnelRetries = 0;
      console.log('[tunnel] Connected! URL:', tunnelUrl);
      broadcast('dashboard', { type: 'tunnel', url: tunnelUrl, active: true, bridgeRoom: getBridgeRoom(), bridgeUrl: getBridgeUrl() });
      startTunnelHealthCheck();
    }
  });
  ssh.stderr.on('data', chunk => {
    const msg = chunk.toString().trim();
    if (msg) console.log('[tunnel-stderr]', msg);
  });
  ssh.on('close', code => {
    console.log('[tunnel] SSH exited (code ' + code + ')');
    tunnelProcess = null;
    tunnelUrl = null;
    stopTunnelHealthCheck();
    if (!tunnelStopped) {
      const delay = Math.min(3000 * Math.pow(1.5, tunnelRetries), 30000);
      tunnelRetries++;
      console.log('[tunnel] Auto-restart in ' + Math.round(delay / 1000) + 's... (attempt ' + tunnelRetries + ')');
      broadcast('dashboard', { type: 'tunnel', url: null, active: true, reconnecting: true });
      setTimeout(() => { if (!tunnelStopped) restartTunnel(); }, delay);
    } else {
      broadcast('dashboard', { type: 'tunnel', url: null, active: false });
    }
  });
  ssh.on('error', e => {
    console.error('[tunnel] Error:', e.message);
    tunnelProcess = null;
    tunnelUrl = null;
    stopTunnelHealthCheck();
  });
}
let terminalKeepAlive = null;

// SSE keep-alive: send ping every 15s to prevent timeout
function startTerminalKeepAlive() {
  stopTerminalKeepAlive();
  terminalKeepAlive = setInterval(() => {
    if (terminalSSEClient && !terminalSSEClient.writableEnded) {
      terminalSSEClient.write(': ping\n\n');
    } else {
      stopTerminalKeepAlive();
    }
  }, 15000);
}
function stopTerminalKeepAlive() {
  if (terminalKeepAlive) { clearInterval(terminalKeepAlive); terminalKeepAlive = null; }
}

function startTerminalPty(cols, rows) {
  if (ptyProcess) { try { ptyProcess.kill('SIGTERM'); } catch {} ptyProcess = null; }

  const pty = spawn('python3', [path.join(ROOT, 'pty-bridge.py')], {
    cwd: ROOT,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', COLUMNS: String(cols || 120), LINES: String(rows || 40) },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  ptyProcess = pty;
  console.log('[terminal] PTY started (pid ' + pty.pid + ', ' + cols + 'x' + rows + ')');

  if (cols && rows) pty.stdin.write(`\x1b[R${cols};${rows}\n`);

  // PTY stdout → SSE (base64-encoded binary chunks)
  pty.stdout.on('data', chunk => {
    if (terminalSSEClient && !terminalSSEClient.writableEnded) {
      const b64 = chunk.toString('base64');
      terminalSSEClient.write('data: {"type":"output","data":"' + b64 + '"}\n\n');
    }
  });

  pty.stderr.on('data', chunk => {
    const msg = chunk.toString().trim();
    if (msg) console.error('[pty-stderr]', msg);
  });

  pty.on('close', (code) => {
    console.log('[terminal] PTY exited (code ' + code + ')');
    if (terminalSSEClient && !terminalSSEClient.writableEnded) {
      terminalSSEClient.write('data: {"type":"exit","code":' + code + '}\n\n');
    }
    if (ptyProcess === pty) ptyProcess = null;
  });

  pty.on('error', (e) => {
    console.error('[terminal] PTY error:', e.message);
  });
}

// =============================================================================
// Agent Supervisor — auto-restarts dead agents via claude -p
// =============================================================================
const SUPERVISOR_CHECK_MS = 15000;       // Check every 15s
const SUPERVISOR_DEAD_THRESHOLD_MS = 60000; // Restart after 60s dead
const SUPERVISOR_MAX_CYCLES = 40;        // Agent runs ~40 cycles then exits & gets respawned
const SUPERVISOR_MAX_RESTARTS_HOUR = 10; // Circuit breaker
const SUPERVISOR_COOLDOWN_MS = 60000;    // Min 60s between spawns for same agent
const SKILL_DIR = path.join(ROOT, '.claude', 'skills');

const supervisorManaged = {};   // agentId -> { proc, startedAt, pid }
const supervisorRestarts = {};  // agentId -> [timestamps]
const supervisorStartTime = Date.now();

function getSkillPrompt(agentType) {
  const name = agentType === 'chat' ? 'guitest-chat' : 'guitest-modifier';
  try {
    let content = fs.readFileSync(path.join(SKILL_DIR, name, 'SKILL.md'), 'utf8');
    return content.replace(/^---[\s\S]*?---\n*/, '');
  } catch { return null; }
}

function supervisorSpawn(agent) {
  if (supervisorManaged[agent.id]?.proc) return;
  // Circuit breaker
  if (!supervisorRestarts[agent.id]) supervisorRestarts[agent.id] = [];
  const hourAgo = Date.now() - 3600000;
  supervisorRestarts[agent.id] = supervisorRestarts[agent.id].filter(t => t > hourAgo);
  if (supervisorRestarts[agent.id].length >= SUPERVISOR_MAX_RESTARTS_HOUR) {
    console.log(`[supervisor] CIRCUIT BREAKER: ${agent.id} restarted ${SUPERVISOR_MAX_RESTARTS_HOUR}x/h — pausing`);
    return;
  }
  const prompt = getSkillPrompt(agent.type);
  if (!prompt) return;
  const model = agent.type === 'chat' ? 'sonnet' : (agent.model || 'sonnet');
  const fullPrompt = `${prompt}\n\nWICHTIG - SUPERVISOR MODUS:\n- Du wurdest automatisch vom Supervisor gestartet.\n- Fuehre genau ${SUPERVISOR_MAX_CYCLES} Loop-Iterationen aus.\n- Beginne SOFORT mit Schritt 1 (Heartbeat senden).\n- Nach ${SUPERVISOR_MAX_CYCLES} Iterationen beende dich sauber.\n- Bei Fehlern (z.B. Server nicht erreichbar): 10s warten, erneut versuchen.`;

  console.log(`[supervisor] Spawning ${agent.id} (model=${model})`);
  const proc = spawn('claude', ['-p', '--model', model, '--permission-mode', 'auto', '--allowedTools', 'Bash Read Write Edit Glob Grep'], {
    cwd: ROOT, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'supervisor' }, stdio: ['pipe', 'pipe', 'pipe']
  });
  proc.stdin.write(fullPrompt);
  proc.stdin.end();
  let stderr = '';
  proc.stdout.on('data', () => {}); // drain
  proc.stderr.on('data', c => { stderr += c.toString(); });
  proc.on('close', (code) => {
    console.log(`[supervisor] ${agent.id} exited (code=${code}${stderr.trim() ? ', err=' + stderr.trim().slice(0, 100) : ''})`);
    delete supervisorManaged[agent.id];
  });
  proc.on('error', (e) => {
    console.error(`[supervisor] ${agent.id} spawn error: ${e.message}`);
    delete supervisorManaged[agent.id];
  });
  supervisorManaged[agent.id] = { proc, startedAt: Date.now(), pid: proc.pid };
  supervisorRestarts[agent.id].push(Date.now());
  console.log(`[supervisor] ${agent.id} started (PID ${proc.pid})`);
}

function supervisorCheck() {
  const data = readAgents();
  const now = Date.now();
  for (const agent of data.agents) {
    if (supervisorManaged[agent.id]?.proc) continue;
    if (supervisorManaged[agent.id] && (now - supervisorManaged[agent.id].startedAt) < SUPERVISOR_COOLDOWN_MS) continue;
    if (agent.status === 'dead' && agent.lastHeartbeat) {
      const deadFor = now - new Date(agent.lastHeartbeat).getTime();
      if (deadFor > SUPERVISOR_DEAD_THRESHOLD_MS) {
        console.log(`[supervisor] ${agent.id} dead for ${Math.round(deadFor / 1000)}s — restarting`);
        supervisorSpawn(agent);
      }
    }
  }
}

function getSupervisorStatus() {
  return {
    running: true,
    startedAt: supervisorStartTime,
    uptimeSeconds: Math.round((Date.now() - supervisorStartTime) / 1000),
    managedAgents: Object.fromEntries(
      Object.entries(supervisorManaged).map(([id, m]) => [id, { pid: m.pid, runningSince: new Date(m.startedAt).toISOString(), runningFor: Math.round((Date.now() - m.startedAt) / 1000) + 's' }])
    ),
    restartCounts: Object.fromEntries(
      Object.entries(supervisorRestarts).map(([id, times]) => [id, { lastHour: times.filter(t => t > Date.now() - 3600000).length }])
    )
  };
}

// Write supervisor status file for external consumers
function writeSupervisorStatus() {
  try { fs.writeFileSync(path.join(ROOT, 'data', 'supervisor-status.json'), JSON.stringify(getSupervisorStatus(), null, 2)); } catch {}
}

setInterval(() => { supervisorCheck(); writeSupervisorStatus(); }, SUPERVISOR_CHECK_MS);

// Graceful shutdown: kill managed agents
process.on('SIGTERM', () => { Object.values(supervisorManaged).forEach(m => m.proc?.kill('SIGTERM')); setTimeout(() => process.exit(0), 2000); });
process.on('SIGINT', () => { Object.values(supervisorManaged).forEach(m => m.proc?.kill('SIGTERM')); setTimeout(() => process.exit(0), 2000); });

// =============================================================================

server.listen(PORT, () => {
  console.log(`Claude Desktop → http://localhost:${PORT}`);
  console.log(`[supervisor] Agent auto-restart active (check: ${SUPERVISOR_CHECK_MS/1000}s, threshold: ${SUPERVISOR_DEAD_THRESHOLD_MS/1000}s)`);
  // Initial supervisor check
  supervisorCheck();
  writeSupervisorStatus();
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
