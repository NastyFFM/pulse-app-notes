const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;

// --- Agent Context Cache ---
const agentContextCache = { data: null, time: 0 };
function invalidateAgentContextCache() { agentContextCache.data = null; agentContextCache.time = 0; }

// --- Data file initialization ---
const MODIFY_QUEUE_FILE = path.join(ROOT, 'data', 'modify-queue.json');
let terminalSessionActive = false;
const AGENTS_FILE = path.join(ROOT, 'data', 'agents.json');
if (!fs.existsSync(path.join(ROOT, 'data'))) fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
if (!fs.existsSync(MODIFY_QUEUE_FILE)) fs.writeFileSync(MODIFY_QUEUE_FILE, JSON.stringify({ pending: [] }, null, 2));
if (!fs.existsSync(AGENTS_FILE)) fs.writeFileSync(AGENTS_FILE, JSON.stringify({ agents: [] }, null, 2));

// --- Helpers ---
function jsonRes(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); }
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
    // PulseOS Bridge: allows apps to report status and log interactions back to their context
    window.PulseOS = {
      _appId: '${appId}',
      reportStatus: function(status) {
        try { window.parent.postMessage({ type: 'app-status', appId: '${appId}', status: String(status).slice(0, 200) }, '*'); } catch(e) {}
      },
      logInteraction: function(action, detail) {
        try { window.parent.postMessage({ type: 'app-interaction', appId: '${appId}', action: String(action).slice(0, 50), detail: typeof detail === 'string' ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 200), time: new Date().toISOString() }, '*'); } catch(e) {}
      },
      emit: function(outputName, data) {
        try { window.parent.postMessage({ type: 'graph-output', appId: '${appId}', outputName: outputName, data: data }, '*'); } catch(e) {}
      },
      onInput: function(inputName, callback) {
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'app-input' && e.data.inputName === inputName) callback(e.data.data);
        });
      },
      onPulse: function(callback) {
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'pulse') callback(e.data);
        });
      },
      onDataChanged: function(callback) {
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'data-changed' && e.data.appId === '${appId}') callback(e.data);
        });
      },
      alert: function(msg) {
        try { window.parent.postMessage({ type: 'app-alert', appId: '${appId}', message: String(msg).slice(0, 300) }, '*'); } catch(e) {}
      },
      saveState: function(data) {
        return fetch('/app/${appId}/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(function(r) { return r.json(); });
      },
      loadState: function() {
        return fetch('/app/${appId}/api/state').then(function(r) { return r.json(); });
      },
      ai: function(task, data) {
        return fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: '${appId}', task: task, data: data }) }).then(function(r) { return r.json(); });
      }
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

// --- Viking auto-sync: import app data into Viking after changes ---
const vikingImportTimers = new Map();
function vikingImportApp(appId) {
  if (!appId) return;
  // Debounce: wait 2s after last change before importing (avoids rapid successive imports)
  if (vikingImportTimers.has(appId)) clearTimeout(vikingImportTimers.get(appId));
  vikingImportTimers.set(appId, setTimeout(() => {
    vikingImportTimers.delete(appId);
    const req = http.request({ hostname: 'localhost', port: 1934, path: '/api/viking/import-app', method: 'POST', headers: { 'Content-Type': 'application/json' } }, () => {});
    req.on('error', () => {}); // Ignore if Viking not running
    req.write(JSON.stringify({ appId }));
    req.end();
    console.log(`[viking] Auto-sync: importing ${appId}`);
  }, 2000));
}

// --- Viking context sync: write L0/L1/L2 summaries to Viking ---
const vikingSyncTimers = {};

function vikingWrite(uri, content) {
  const postData = JSON.stringify({ uri, content });
  const options = {
    hostname: 'localhost',
    port: 1934,
    path: '/api/viking/write',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    timeout: 5000
  };
  const req = http.request(options);
  req.on('error', () => {}); // silent fail if Viking not running
  req.write(postData);
  req.end();
}

function vikingSyncContext(contextId) {
  try {
    const ctxFile = path.join(ROOT, 'data', 'contexts', contextId + '.json');
    if (!fs.existsSync(ctxFile)) return;
    const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));

    // L0: Abstract (~100 tokens) - deterministic, no LLM needed
    const widgetSummaries = (ctx.widgets || []).map(w => {
      const data = ctx.data?.[w.dataKey];
      let badge = '';
      if (w.type === 'todo' && Array.isArray(data)) {
        const done = data.filter(i => i.done).length;
        badge = ` (${done}/${data.length})`;
      } else if (w.type === 'kpi' && data) {
        badge = ` = ${data.value || '?'}`;
      } else if (w.type === 'table' && Array.isArray(data)) {
        badge = ` (${data.length} Zeilen)`;
      }
      return `${w.title}${badge}`;
    }).join(', ');

    const l0 = `${ctx.icon || ''} ${ctx.name} | ${(ctx.widgets||[]).length} Widgets: ${widgetSummaries}`;

    // L1: Overview (~1-2k tokens) - deterministic
    let l1 = `# ${ctx.icon || ''} ${ctx.name}\n\n`;
    l1 += `**ID:** ${ctx.id}\n`;
    l1 += `**Parent:** ${ctx.parentId || 'Root'}\n`;
    l1 += `**Updated:** ${ctx.updated || 'unbekannt'}\n\n`;
    l1 += `## Widgets (${(ctx.widgets||[]).length})\n\n`;
    for (const w of (ctx.widgets || [])) {
      const data = ctx.data?.[w.dataKey];
      const dataPreview = data ? JSON.stringify(data).slice(0, 300) : 'keine Daten';
      l1 += `### ${w.type}: "${w.title}" (${w.size || 'md'})\n`;
      l1 += `Daten: ${dataPreview}\n\n`;
    }
    if (ctx.changelog && ctx.changelog.length > 0) {
      l1 += `## Letzte Aenderungen\n`;
      for (const c of ctx.changelog.slice(-5)) {
        l1 += `- [${c.time}] ${c.summary}\n`;
      }
    }

    // L2: Full content - just the JSON
    const l2 = JSON.stringify(ctx, null, 2);

    // Write to Viking via bridge (fire and forget, don't block)
    const uri = `viking://resources/contexts/${contextId}`;
    vikingWrite(uri + '.abstract', l0);
    vikingWrite(uri + '.overview', l1);
    vikingWrite(uri, l2);

    console.log(`[viking] Context sync: ${contextId}`);
  } catch(e) {
    console.error('[viking-sync] Error syncing context:', contextId, e.message);
  }
}

function vikingSyncContextDebounced(contextId) {
  if (vikingSyncTimers[contextId]) clearTimeout(vikingSyncTimers[contextId]);
  vikingSyncTimers[contextId] = setTimeout(() => {
    delete vikingSyncTimers[contextId];
    vikingSyncContext(contextId);
  }, 2000);
}

// --- Process Manager (Phase 13b/c) ---
const runningProcesses = new Map(); // appId → { process, port, pid, startedAt }
const vanillaStates = new Map();    // appId → { data, lastUpdated }

function loadManifest(appId) {
  // Try local apps/ first, then ~/pulse-workspace/
  const localPath = path.join(ROOT, 'apps', appId, 'manifest.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  const wsPath = path.join(require('os').homedir(), 'pulse-workspace', appId, 'manifest.json');
  if (fs.existsSync(wsPath)) {
    return JSON.parse(fs.readFileSync(wsPath, 'utf8'));
  }
  return null;
}

function updateRegistryStatus(appId, status, pid) {
  const regFile = path.join(ROOT, 'data', 'app-registry.json');
  try {
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const entry = reg.apps.find(a => a.id === appId);
    if (entry) {
      entry.status = status;
      entry.pid = pid || null;
      reg.updatedAt = new Date().toISOString();
      fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));
    }
  } catch {}
}

function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/state', method: 'GET', timeout: 1000 }, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}

function startNodeApp(appId) {
  return new Promise(async (resolve, reject) => {
    if (runningProcesses.has(appId)) return resolve(runningProcesses.get(appId));

    const manifest = loadManifest(appId);
    if (!manifest || manifest.type !== 'node') return reject(new Error(`${appId} is not a node app`));

    const appDir = manifest.workspacePath
      ? manifest.workspacePath.replace(/^~/, require('os').homedir())
      : path.join(ROOT, 'apps', appId);

    if (!fs.existsSync(appDir)) return reject(new Error(`App directory not found: ${appDir}`));

    const startCmd = manifest.start || 'node src/server.js';
    const parts = startCmd.split(' ');
    const port = manifest.port || 3050;

    const env = { ...process.env, PORT: String(port), APP_ID: appId, PULSE_URL: `http://localhost:${PORT}`, ...(manifest.env || {}) };

    console.log(`[PM] Starting ${appId} on port ${port}: ${startCmd}`);
    updateRegistryStatus(appId, 'starting', null);

    const child = spawn(parts[0], parts.slice(1), { cwd: appDir, env, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.on('data', d => console.log(`[${appId}] ${d.toString().trim()}`));
    child.stderr.on('data', d => console.error(`[${appId}] ${d.toString().trim()}`));

    child.on('exit', (code) => {
      console.log(`[PM] ${appId} exited with code ${code}`);
      runningProcesses.delete(appId);
      updateRegistryStatus(appId, 'stopped', null);
    });

    const info = { process: child, port, pid: child.pid, startedAt: Date.now() };
    runningProcesses.set(appId, info);

    try {
      await waitForPort(port);
      updateRegistryStatus(appId, 'running', child.pid);
      console.log(`[PM] ${appId} ready on port ${port} (pid ${child.pid})`);
      resolve(info);
    } catch (err) {
      child.kill('SIGTERM');
      runningProcesses.delete(appId);
      updateRegistryStatus(appId, 'stopped', null);
      reject(err);
    }
  });
}

function stopNodeApp(appId) {
  const info = runningProcesses.get(appId);
  if (!info) return false;
  console.log(`[PM] Stopping ${appId} (pid ${info.pid})`);
  info.process.kill('SIGTERM');
  runningProcesses.delete(appId);
  updateRegistryStatus(appId, 'stopped', null);
  return true;
}

function proxyToNodeApp(appId, method, proxyPath, body) {
  return new Promise((resolve, reject) => {
    const info = runningProcesses.get(appId);
    if (!info) return reject(new Error(`${appId} not running`));

    const options = {
      hostname: '127.0.0.1',
      port: info.port,
      path: proxyPath,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    };

    const req = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// Vanilla app state (in-memory + file persistence)
function getVanillaState(appId) {
  if (vanillaStates.has(appId)) return vanillaStates.get(appId);
  const stateFile = path.join(ROOT, 'apps', appId, 'state.json');
  try {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    vanillaStates.set(appId, data);
    return data;
  } catch {
    const empty = { id: appId, status: 'active', data: {}, lastOutput: null };
    vanillaStates.set(appId, empty);
    return empty;
  }
}

function setVanillaState(appId, updates) {
  const current = getVanillaState(appId);
  Object.assign(current.data, updates);
  current.lastUpdated = Date.now();
  vanillaStates.set(appId, current);
  const stateFile = path.join(ROOT, 'apps', appId, 'state.json');
  try { fs.writeFileSync(stateFile, JSON.stringify(current, null, 2)); } catch {}
  broadcast(appId, { type: 'state-update', state: current, time: Date.now() });
}

// --- Graph Router (Phase 13d) ---
const GRAPHS_DIR = path.join(ROOT, 'data', 'graphs');
if (!fs.existsSync(GRAPHS_DIR)) fs.mkdirSync(GRAPHS_DIR, { recursive: true });

function loadGraph(projectId) {
  const gPath = path.join(GRAPHS_DIR, `graph-${projectId}.json`);
  if (!fs.existsSync(gPath)) return null;
  try { return JSON.parse(fs.readFileSync(gPath, 'utf8')); } catch { return null; }
}

function saveGraph(projectId, graph) {
  graph.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(GRAPHS_DIR, `graph-${projectId}.json`), JSON.stringify(graph, null, 2));
}

async function routeOutput(projectId, fromAppId, outputName, data) {
  const graph = loadGraph(projectId);
  if (!graph) return;

  const targets = graph.edges
    .filter(e => e.from.appId === fromAppId && e.from.output === outputName)
    .map(e => ({ appId: e.to.appId, input: e.to.input }));

  for (const target of targets) {
    try {
      await sendInputToApp(target.appId, target.input, data);
      console.log(`[graph] ${fromAppId}.${outputName} → ${target.appId}.${target.input}`);
      broadcast(projectId, { type: 'graph-data-flow', fromAppId, outputName, toAppId: target.appId, toInput: target.input, time: Date.now() });
    } catch (err) {
      console.error(`[graph] routing error: ${fromAppId} → ${target.appId}: ${err.message}`);
      broadcast(projectId, { type: 'graph-routing-error', fromAppId, toAppId: target.appId, error: err.message, time: Date.now() });
    }
  }
}

async function sendInputToApp(appId, inputName, data) {
  const manifest = loadManifest(appId);
  const action = { type: 'graph-input', inputName, data };

  if (manifest && manifest.type === 'node' && runningProcesses.has(appId)) {
    await proxyToNodeApp(appId, 'POST', '/api/action', action);
  } else {
    broadcast(appId, { type: 'app-input', appId, inputName, data });
  }
}

function findGraphsForApp(appId) {
  const results = [];
  try {
    const files = fs.readdirSync(GRAPHS_DIR).filter(f => f.startsWith('graph-') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const graph = JSON.parse(fs.readFileSync(path.join(GRAPHS_DIR, file), 'utf8'));
        if (graph.nodes && graph.nodes.some(n => n.appId === appId)) results.push(graph);
      } catch {}
    }
  } catch {}
  return results;
}

// --- Pulse Engine (Phase 13e) ---
const pulseIntervals = new Map(); // subscriptionKey → intervalId/timeoutId

function parseClockSchedule(sub) {
  if (sub.includes('daily@')) {
    const timePart = sub.split('@')[1];
    const [h, m] = timePart.split(':').map(Number);
    const now = new Date();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return { type: 'daily', msUntilFirst: next - now, interval: 86400000 };
  }
  const match = sub.match(/clock:(\d+)(s|m|h)/);
  if (!match) return { type: 'interval', interval: 3600000 };
  const [, n, unit] = match;
  const multiplier = { s: 1000, m: 60000, h: 3600000 };
  return { type: 'interval', interval: parseInt(n) * multiplier[unit] };
}

function registerPulseSubscription(appId, subscription) {
  if (!subscription.startsWith('clock:')) return;
  const key = `${appId}:${subscription}`;
  if (pulseIntervals.has(key)) {
    clearInterval(pulseIntervals.get(key));
    clearTimeout(pulseIntervals.get(key));
  }

  const schedule = parseClockSchedule(subscription);
  const fire = () => fireAppPulse(appId, { type: subscription, timestamp: Date.now() }).catch(e => console.error(`[pulse] Error firing ${appId}:`, e.message));

  if (schedule.type === 'daily') {
    const t = setTimeout(() => {
      fire();
      pulseIntervals.set(key, setInterval(fire, schedule.interval));
    }, schedule.msUntilFirst);
    pulseIntervals.set(key, t);
    console.log(`[pulse] ${appId}: daily@${new Date(Date.now() + schedule.msUntilFirst).toLocaleTimeString()}`);
  } else {
    pulseIntervals.set(key, setInterval(fire, schedule.interval));
    console.log(`[pulse] ${appId}: every ${schedule.interval / 1000}s`);
  }
}

async function fireAppPulse(appId, pulseData) {
  console.log(`[pulse] → ${appId}: ${pulseData.type}`);
  const manifest = loadManifest(appId);
  if (!manifest) return;

  if (manifest.type === 'node' && runningProcesses.has(appId)) {
    await proxyToNodeApp(appId, 'POST', '/api/action', { type: 'pulse', data: pulseData });
  } else {
    // Broadcast to any open iframe
    broadcast(appId, { type: 'pulse', appId, data: pulseData });

    // For vanilla producer apps: also auto-route outputs through graphs
    // (because vanilla apps only run when open in an iframe)
    if (manifest.nodeType === 'producer' && manifest.outputs && manifest.outputs.length > 0) {
      const graphs = findGraphsForApp(appId);
      if (graphs.length > 0) {
        // Check if app has a pulse handler that produces state
        const statePath = path.join(ROOT, 'data', 'app-state', appId + '.json');
        let appState = null;
        try { appState = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}

        // Route current state as output through all graphs
        for (const graph of graphs) {
          for (const output of manifest.outputs) {
            const data = appState || { pulsedAt: new Date().toISOString(), type: pulseData.type, appId };
            routeOutput(graph.projectId, appId, output.name, data)
              .then(() => console.log(`[pulse] auto-routed ${appId}.${output.name} → graph ${graph.projectId}`))
              .catch(e => console.error(`[pulse] auto-route error:`, e.message));
          }
        }
      }
    }
  }
}

function startPulseEngine() {
  let count = 0;
  const regFile = path.join(ROOT, 'data', 'app-registry.json');
  if (!fs.existsSync(regFile)) return;
  try {
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    for (const entry of reg.apps) {
      const manifest = loadManifest(entry.id);
      if (!manifest || !manifest.pulseSubscriptions) continue;
      for (const sub of manifest.pulseSubscriptions) {
        if (sub.startsWith('clock:')) {
          registerPulseSubscription(entry.id, sub);
          count++;
        }
      }
    }
  } catch {}
  if (count > 0) console.log(`[pulse] Engine started with ${count} subscriptions`);
}

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

// =============================================================================
// --- PulseOS Event Bus + Action Chain Engine ---
// =============================================================================
// Events flow through the bus. Action chains listen for events and trigger
// sequences of agent actions. Apps are gates — both in and out.

const ROOT_CONTEXT_FILE = path.join(ROOT, 'data', 'root-context.json');
const ACTION_CHAINS_FILE = path.join(ROOT, 'data', 'action-chains.json');
const EVENT_LOG_FILE = path.join(ROOT, 'data', 'event-log.json');

// Initialize action chains file
if (!fs.existsSync(ACTION_CHAINS_FILE)) {
  fs.writeFileSync(ACTION_CHAINS_FILE, JSON.stringify({
    chains: [
      {
        id: 'chat-intent-router',
        name: 'Chat Intent Router',
        description: 'Analysiert Chat-Nachrichten und leitet Intents an zustaendige Agenten weiter',
        enabled: true,
        trigger: { type: 'chat:message' },
        steps: [
          { id: 'parse', agent: 'system', action: 'parse-intent', description: 'Intent aus Nachricht erkennen' },
          { id: 'route', agent: 'system', action: 'route-to-agent', description: 'Intent an zustaendigen Agent weiterleiten' }
        ]
      },
      {
        id: 'data-sync-chain',
        name: 'Data Sync Chain',
        description: 'Synchronisiert Datenaenderungen mit Viking und benachrichtigt betroffene Agenten',
        enabled: true,
        trigger: { type: 'data:changed' },
        steps: [
          { id: 'viking-sync', agent: 'system', action: 'viking-import', description: 'Daten in Viking importieren' },
          { id: 'notify-agents', agent: 'system', action: 'notify-related-agents', description: 'Betroffene Agenten informieren' }
        ]
      },
      {
        id: 'startup-chain',
        name: 'System Startup',
        description: 'Initialisierung beim Start von PulseOS',
        enabled: true,
        trigger: { type: 'system:startup' },
        steps: [
          { id: 'load-context', agent: 'system', action: 'load-root-context', description: 'Root-Context laden' },
          { id: 'health-check', agent: 'system', action: 'health-check', description: 'System-Health pruefen' }
        ]
      }
    ]
  }, null, 2));
}

// Event log (ring buffer, max 500 entries)
function logEvent(event) {
  try {
    const log = JSON.parse(safeReadJSON(EVENT_LOG_FILE, { events: [] }));
    log.events.push({ ...event, timestamp: new Date().toISOString() });
    if (log.events.length > 500) log.events = log.events.slice(-500);
    fs.writeFileSync(EVENT_LOG_FILE, JSON.stringify(log, null, 2));
  } catch {}
}

// ── Event Bus ──
const eventListeners = new Map(); // type → Set of callbacks

function onEvent(type, callback) {
  if (!eventListeners.has(type)) eventListeners.set(type, new Set());
  eventListeners.get(type).add(callback);
}

function emitEvent(event) {
  const { type, source, data } = event;
  console.log(`[event-bus] ${type} from ${source || 'system'}${data?.appId ? ' (' + data.appId + ')' : ''}`);
  logEvent(event);

  // Notify direct listeners
  const listeners = eventListeners.get(type);
  if (listeners) {
    for (const cb of listeners) {
      try { cb(event); } catch (e) { console.error(`[event-bus] listener error:`, e.message); }
    }
  }

  // Broadcast to SSE (all clients on 'pulse' channel get all events)
  broadcast('pulse', { type: 'event', event });

  // Match against action chains
  runActionChains(event);
}

// ── Action Chain Runner ──
function getActionChains() {
  try { return JSON.parse(fs.readFileSync(ACTION_CHAINS_FILE, 'utf8')).chains || []; }
  catch { return []; }
}

async function runActionChains(event) {
  const chains = getActionChains();
  for (const chain of chains) {
    if (!chain.enabled) continue;
    if (chain.trigger.type !== event.type) continue;

    // Optional: match pattern on event data
    if (chain.trigger.pattern) {
      const regex = new RegExp(chain.trigger.pattern, 'i');
      const testStr = JSON.stringify(event.data || '');
      if (!regex.test(testStr)) continue;
    }

    console.log(`[action-chain] Triggered: ${chain.name} (${chain.id})`);

    // Execute steps sequentially
    let context = { event, results: {} };
    for (const step of chain.steps) {
      try {
        const result = await executeChainStep(step, context);
        context.results[step.id] = result;
        console.log(`[action-chain]   Step ${step.id}: ${result?.ok !== false ? 'OK' : 'FAIL'}`);

        // Check if step wants to stop the chain
        if (result?.stopChain) break;

        // Emit sub-events if step produced them
        if (result?.emitEvents) {
          for (const subEvent of result.emitEvents) {
            emitEvent({ ...subEvent, source: `chain:${chain.id}:${step.id}` });
          }
        }
      } catch (e) {
        console.error(`[action-chain]   Step ${step.id} error:`, e.message);
        if (!step.continueOnError) break;
      }
    }
  }
}

async function executeChainStep(step, context) {
  const { agent, action } = step;
  const event = context.event;

  // Built-in system actions
  if (agent === 'system') {
    switch (action) {
      case 'parse-intent':
        // Simple intent parsing from chat messages
        return parseIntent(event.data?.text || '');

      case 'route-to-agent':
        // Route parsed intent to the right agent
        const intent = context.results?.parse;
        if (intent?.agents) {
          return { ok: true, routed: intent.agents, emitEvents: intent.agents.map(a => ({
            type: 'chat:intent',
            data: { ...event.data, intent: intent.intent, targetAgent: a }
          })) };
        }
        return { ok: true, routed: [] };

      case 'viking-import':
        if (event.data?.appId) vikingImportApp(event.data.appId);
        return { ok: true };

      case 'notify-related-agents':
        // Broadcast data change to all agent contexts
        return { ok: true };

      case 'load-root-context':
        try {
          const ctx = JSON.parse(fs.readFileSync(ROOT_CONTEXT_FILE, 'utf8'));
          return { ok: true, context: ctx.identity?.name };
        } catch { return { ok: false }; }

      case 'health-check':
        const agents = readAgents();
        const alive = agents.agents.filter(a => a.status === 'running').length;
        return { ok: true, agents: agents.agents.length, alive };

      default:
        return { ok: false, error: `Unknown system action: ${action}` };
    }
  }

  // Agent-based actions: spawn claude -p with the agent's skill
  if (agent && action) {
    const skillPath = path.join(ROOT, '.claude', 'skills', agent, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      // Queue the task for the agent (don't block the chain)
      return { ok: true, queued: true, agent, action };
    }
    return { ok: false, error: `No skill found for agent: ${agent}` };
  }

  return { ok: false, error: 'Invalid step configuration' };
}

// ── Intent Parser ──
// Simple keyword-based intent detection — routes to the right agents
function parseIntent(text) {
  const lower = text.toLowerCase();
  const intents = [];

  // Calendar intents
  if (/termin|meeting|event|kalender|morgen|uebermorgen|um \d{1,2}(:\d{2})?\s*(uhr)?/i.test(lower)) {
    intents.push({ intent: 'calendar-event', agents: ['calendar-agent', 'calendar'] });
  }
  // Todo/Task intents
  if (/todo|aufgabe|task|erledigen|machen|ticket/i.test(lower)) {
    intents.push({ intent: 'create-task', agents: ['tickets', 'kanban'] });
  }
  // Budget intents
  if (/budget|ausgabe|einnahme|kosten|bezahlt|euro|€|\d+\s*(euro|eur)/i.test(lower)) {
    intents.push({ intent: 'budget-entry', agents: ['budget-agent', 'budget'] });
  }
  // Note intents
  if (/notiz|note|merken|aufschreiben|idee/i.test(lower)) {
    intents.push({ intent: 'create-note', agents: ['notes-agent', 'notes'] });
  }
  // Reminder intents
  if (/erinner|remind|wecker|alarm/i.test(lower)) {
    intents.push({ intent: 'reminder', agents: ['alarm', 'calendar-agent'] });
  }
  // Travel intents
  if (/reise|flug|hotel|urlaub|trip/i.test(lower)) {
    intents.push({ intent: 'travel', agents: ['travel-planner'] });
  }
  // Recipe intents
  if (/rezept|kochen|essen|gericht/i.test(lower)) {
    intents.push({ intent: 'recipe', agents: ['recipes'] });
  }

  if (intents.length === 0) {
    return { ok: true, intent: 'general', agents: ['chat'], intents: [] };
  }

  // Flatten all target agents (deduplicate)
  const allAgents = [...new Set(intents.flatMap(i => i.agents))];
  return { ok: true, intent: intents[0].intent, agents: allAgents, intents };
}

// ── Scheduler (Cron-like) ──
const SCHEDULER_FILE = path.join(ROOT, 'data', 'scheduled-tasks.json');
if (!fs.existsSync(SCHEDULER_FILE)) {
  fs.writeFileSync(SCHEDULER_FILE, JSON.stringify({
    tasks: [
      {
        id: 'health-check',
        name: 'System Health Check',
        cron: '*/5 * * * *',
        enabled: true,
        event: { type: 'system:health', source: 'scheduler' },
        lastRun: null
      },
      {
        id: 'daily-summary',
        name: 'Tages-Zusammenfassung',
        cron: '0 8 * * *',
        enabled: false,
        event: { type: 'cron:trigger', source: 'scheduler', data: { task: 'daily-summary' } },
        lastRun: null
      }
    ]
  }, null, 2));
}

// Simple 5-field cron matcher (minute hour day month weekday)
function matchesCron(cron, date) {
  if (!cron) return false;
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, day, month, weekday] = parts;
  const checks = [
    [min, date.getMinutes()],
    [hour, date.getHours()],
    [day, date.getDate()],
    [month, date.getMonth() + 1],
    [weekday, date.getDay()]
  ];
  return checks.every(([pattern, value]) => {
    if (pattern === '*') return true;
    // Handle */N
    if (pattern.startsWith('*/')) {
      const interval = parseInt(pattern.slice(2));
      return value % interval === 0;
    }
    // Handle ranges: 1-5
    if (pattern.includes('-')) {
      const [a, b] = pattern.split('-').map(Number);
      return value >= a && value <= b;
    }
    // Handle lists: 1,3,5
    if (pattern.includes(',')) {
      return pattern.split(',').map(Number).includes(value);
    }
    return parseInt(pattern) === value;
  });
}

// Check scheduled tasks every 60s
setInterval(() => {
  try {
    const data = JSON.parse(fs.readFileSync(SCHEDULER_FILE, 'utf8'));
    const now = new Date();
    let changed = false;
    for (const task of data.tasks) {
      if (!task.enabled || !task.cron) continue;
      if (matchesCron(task.cron, now)) {
        // Don't re-run within the same minute
        if (task.lastRun) {
          const lastRun = new Date(task.lastRun);
          if (lastRun.getMinutes() === now.getMinutes() &&
              lastRun.getHours() === now.getHours() &&
              lastRun.getDate() === now.getDate()) continue;
        }
        task.lastRun = now.toISOString();
        changed = true;
        console.log(`[scheduler] Running: ${task.name} (${task.id})`);
        emitEvent({ ...task.event, data: { ...(task.event.data || {}), taskId: task.id, taskName: task.name } });
      }
    }
    if (changed) fs.writeFileSync(SCHEDULER_FILE, JSON.stringify(data, null, 2));
  } catch {}
}, 60000);

// ── Wire existing systems into Event Bus ──

// When broadcast() is called for data changes, also emit event
const _originalBroadcast = broadcast;
// Monkey-patch not needed — we'll emit events at the API level instead

// Emit startup event
setTimeout(() => {
  emitEvent({ type: 'system:startup', source: 'server', data: { port: PORT, time: new Date().toISOString() } });
}, 2000);

// =============================================================================

// --- Server ---
const server = http.createServer(async (req, res) => {
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
  // Serve widget assets (JS/CSS)
  const widgetAssetMatch = url.match(/^\/widgets\/([a-z0-9_-]+\.(js|css))$/);
  if (req.method === 'GET' && widgetAssetMatch) {
    const assetFile = path.join(ROOT, 'widgets', widgetAssetMatch[1]);
    const types = { js: 'application/javascript', css: 'text/css' };
    if (fs.existsSync(assetFile)) {
      res.writeHead(200, { 'Content-Type': types[widgetAssetMatch[2]], 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(assetFile));
    }
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
    if (req.method === 'GET') {
      const data = JSON.parse(safeReadJSON(file, '{"meta":{},"apps":[]}'));
      // Enrich apps with visibility from manifests
      (data.apps || []).forEach(a => {
        try {
          const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', a.id, 'manifest.json'), 'utf8'));
          a.visibility = m.visibility || 'private';
          a.allowedUsers = m.allowedUsers || [];
        } catch { a.visibility = a.visibility || 'private'; a.allowedUsers = a.allowedUsers || []; }
      });
      return jsonRes(res, data);
    }
    if (req.method === 'PUT') return readBody(req, b => {
      fs.writeFileSync(file, JSON.stringify(JSON.parse(b), null, 2));
      broadcast('dashboard', { type: 'change', file: 'apps.json', time: Date.now() });
      jsonRes(res, { ok: true });
    });
  }

  // ── Smart Chat Handler (built-in proactive agent) ──
  function handleSmartChat(message) {
    const msg = message.toLowerCase().trim();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // ── Create Note ──
    const noteMatch = message.match(/(?:notiz|note|schreib auf|merk dir|merke)[:\s]+(.+)/i);
    if (noteMatch) {
      const title = noteMatch[1].trim();
      const notesFile = path.join(ROOT, 'apps', 'notes', 'data', 'notes.json');
      const data = JSON.parse(safeReadJSON(notesFile, '{"notes":[]}'));
      if (!data.notes) data.notes = [];
      data.notes.unshift({ id: 'note-' + Date.now(), title, content: '', created: now.toISOString(), updated: now.toISOString() });
      fs.writeFileSync(notesFile, JSON.stringify(data, null, 2));
      broadcast('notes', { type: 'change', file: 'notes.json', time: Date.now() });
      return 'Notiz erstellt: "' + title + '". Du kannst sie in der Notes-App sehen.';
    }

    // ── Create Task ──
    const taskMatch = message.match(/(?:task|aufgabe|todo|erledige|mach)[:\s]+(.+)/i);
    if (taskMatch) {
      const title = taskMatch[1].trim();
      const tasksFile = path.join(ROOT, 'apps', 'tasks', 'data', 'tasks.json');
      const data = JSON.parse(safeReadJSON(tasksFile, '{"tasks":[]}'));
      if (!data.tasks) data.tasks = [];
      data.tasks.unshift({ id: 'task-' + Date.now(), title, status: 'open', priority: 'normal', created: now.toISOString() });
      fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2));
      broadcast('tasks', { type: 'change', file: 'tasks.json', time: Date.now() });
      return 'Task angelegt: "' + title + '". Oeffne die Tasks-App um ihn zu sehen.';
    }

    // ── Create Calendar Event ──
    const calMatch = message.match(/(?:termin|event|kalender|meeting)[:\s]+(.+)/i);
    if (calMatch) {
      const title = calMatch[1].trim();
      const timeMatch = title.match(/(?:um|at)\s+(\d{1,2}[:.]\d{2})/i);
      const dateMatch = title.match(/(?:am|on)\s+(\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?)/i);
      let eventDate = today;
      let eventTime = '';
      if (dateMatch) {
        const parts = dateMatch[1].replace(/\.$/, '').split('.');
        eventDate = (parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : now.getFullYear()) + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
      }
      if (timeMatch) eventTime = timeMatch[1].replace('.', ':');
      const cleanTitle = title.replace(/\s*(?:um|at)\s+\d{1,2}[:.]\d{2}/i, '').replace(/\s*(?:am|on)\s+\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?/i, '').trim();
      const calFile = path.join(ROOT, 'apps', 'calendar', 'data', 'calendar.json');
      const data = JSON.parse(safeReadJSON(calFile, '{"events":[]}'));
      if (!data.events) data.events = [];
      data.events.push({ id: 'ev-' + Date.now(), date: eventDate, title: cleanTitle || title, time: eventTime, created: now.toISOString() });
      fs.writeFileSync(calFile, JSON.stringify(data, null, 2));
      broadcast('calendar', { type: 'change', file: 'calendar.json', time: Date.now() });
      return 'Termin erstellt: "' + (cleanTitle || title) + '" am ' + eventDate + (eventTime ? ' um ' + eventTime : '') + '.';
    }

    // ── Briefing / What's going on ──
    if (msg.match(/(?:was steht an|briefing|uebersicht|status|was gibt.*heute|was.*los)/)) {
      const parts = [];
      try {
        const notes = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'notes', 'data', 'notes.json'), '{"notes":[]}'));
        if (notes.notes && notes.notes.length > 0) parts.push(notes.notes.length + ' Notizen');
      } catch {}
      try {
        const tasks = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'tasks', 'data', 'tasks.json'), '{"tasks":[]}'));
        const open = (tasks.tasks || []).filter(t => t.status !== 'done');
        if (open.length > 0) parts.push(open.length + ' offene Tasks');
      } catch {}
      try {
        const cal = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'calendar', 'data', 'calendar.json'), '{"events":[]}'));
        const todayEvents = (cal.events || []).filter(e => e.date === today);
        if (todayEvents.length > 0) parts.push(todayEvents.length + ' Termine heute: ' + todayEvents.map(e => e.title + (e.time ? ' (' + e.time + ')' : '')).join(', '));
        else parts.push('Keine Termine heute');
      } catch {}
      try {
        const weather = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'weather', 'data', 'weather.json'), '{}'));
        if (weather.current) parts.push('Wetter: ' + (weather.current.temp || '?') + '°C, ' + (weather.current.condition || '?'));
      } catch {}
      return parts.length > 0 ? 'Dein Briefing:\n' + parts.map(p => '• ' + p).join('\n') : 'Alles ruhig — keine offenen Eintraege.';
    }

    // ── List notes ──
    if (msg.match(/(?:zeig.*notiz|meine notiz|alle notiz|notes)/)) {
      try {
        const notes = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'notes', 'data', 'notes.json'), '{"notes":[]}'));
        if (!notes.notes || notes.notes.length === 0) return 'Keine Notizen vorhanden.';
        return 'Deine Notizen:\n' + notes.notes.slice(0, 5).map(n => '• ' + n.title).join('\n');
      } catch { return 'Fehler beim Lesen der Notizen.'; }
    }

    // ── List tasks ──
    if (msg.match(/(?:zeig.*task|meine task|offene task|todos|aufgaben)/)) {
      try {
        const tasks = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'tasks', 'data', 'tasks.json'), '{"tasks":[]}'));
        const open = (tasks.tasks || []).filter(t => t.status !== 'done');
        if (open.length === 0) return 'Keine offenen Tasks!';
        return 'Offene Tasks:\n' + open.slice(0, 5).map(t => '• ' + t.title + (t.priority === 'high' ? ' [!]' : '')).join('\n');
      } catch { return 'Fehler beim Lesen der Tasks.'; }
    }

    // ── Weather ──
    if (msg.match(/(?:wetter|weather|temperatur|regen|sonne)/)) {
      try {
        const weather = JSON.parse(safeReadJSON(path.join(ROOT, 'apps', 'weather', 'data', 'weather.json'), '{}'));
        if (weather.current) return 'Aktuelles Wetter: ' + (weather.current.temp || '?') + '°C, ' + (weather.current.condition || '?') + (weather.current.humidity ? ', Feuchtigkeit: ' + weather.current.humidity + '%' : '');
        return 'Keine Wetterdaten vorhanden. Oeffne die Weather-App fuer aktuelle Daten.';
      } catch { return 'Keine Wetterdaten verfuegbar.'; }
    }

    // ── Help ──
    if (msg.match(/(?:hilfe|help|was kannst|commands|befehle)/)) {
      return 'Ich kann:\n• "Notiz: ..." — Notiz erstellen\n• "Task: ..." — Aufgabe anlegen\n• "Termin: ..." — Kalender-Event\n• "Was steht an?" — Briefing\n• "Zeig meine Notizen/Tasks"\n• "Wetter" — Aktuelle Wetterdaten\n\nBeispiel: "Task: Praesentation vorbereiten"';
    }

    // ── Greeting ──
    if (msg.match(/^(hi|hallo|hey|moin|guten|servus|yo)/)) {
      const greetings = ['Hey! Was kann ich fuer dich tun?', 'Hallo! Ich bin bereit — sag mir was du brauchst.', 'Moin! Sag "hilfe" um zu sehen was ich kann.'];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }

    // ── Fallback ──
    return 'Ich verstehe dich noch nicht ganz. Versuch:\n• "Notiz: Einkaufsliste"\n• "Task: Bug fixen"\n• "Termin: Meeting am 21.03. um 14:00"\n• "Was steht an?"';
  }

  // ── Dashboard Chat Endpoint ──
  if (url === '/api/chat' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { message, source } = JSON.parse(b);
        // Check if external chat agent is alive
        const agents = JSON.parse(safeReadJSON(path.join(ROOT, 'data', 'agents.json'), { agents: [] }));
        const chatAgent = (agents.agents || []).find(a => a.type === 'chat' && a.status === 'alive');
        if (chatAgent) {
          // Queue for external agent
          const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
          const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
          if (!queue.pending) queue.pending = [];
          const msg = { id: 'chat-' + Date.now(), message, source: source || 'dashboard', status: 'queued', created: new Date().toISOString() };
          queue.pending.push(msg);
          fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
          jsonRes(res, { ok: true, id: msg.id, queued: true });
        } else {
          // Built-in smart handler — proactive agent demo
          const reply = handleSmartChat(message);
          jsonRes(res, { ok: true, reply: reply });
        }
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  if (url.startsWith('/api/chat/reply/') && req.method === 'GET') {
    const msgId = url.split('/').pop();
    const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
    const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
    const msg = (queue.pending || []).find(m => m.id === msgId);
    if (msg && msg.reply) {
      jsonRes(res, { reply: msg.reply });
    } else {
      jsonRes(res, { pending: true });
    }
    return;
  }

  // ── Chat Mirror (ClaudeOS → PulseOS) ──
  if (url === '/api/chat-mirror' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { from, text, source, time } = JSON.parse(b);
        if (!text) { res.writeHead(400); return res.end(JSON.stringify({ error: 'text required' })); }
        const histFile = path.join(ROOT, 'data', 'chat-history.json');
        const hist = JSON.parse(safeReadJSON(histFile, '{"messages":[]}'));
        if (!hist.messages) hist.messages = [];
        const msg = { id: 'm-' + Date.now(), from: from || 'agent', text, source: source || 'telegram', time: time || new Date().toISOString() };
        hist.messages.push(msg);
        // Ring-buffer: max 200
        if (hist.messages.length > 200) hist.messages = hist.messages.slice(-200);
        fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
        // Broadcast via SSE to dashboard
        broadcast('dashboard', { type: 'chat-message', message: msg });
        jsonRes(res, { ok: true, id: msg.id });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  if (url === '/api/chat-history' && req.method === 'GET') {
    const histFile = path.join(ROOT, 'data', 'chat-history.json');
    const hist = JSON.parse(safeReadJSON(histFile, '{"messages":[]}'));
    const messages = (hist.messages || []).slice(-50);
    return jsonRes(res, { messages });
  }

  // ── App Install ──
  if (url === '/api/apps/install' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { url: repoUrl, id } = JSON.parse(b);
        if (!repoUrl) { res.writeHead(400); return res.end(JSON.stringify({ error: 'url required' })); }

        // Derive app ID from repo URL or explicit id
        const appId = id || repoUrl.split('/').pop().replace(/\.git$/, '').replace(/^pulse-app-/, '').toLowerCase();
        const appDir = path.join(ROOT, 'apps', appId);

        if (fs.existsSync(appDir)) {
          return jsonRes(res, { ok: false, error: 'App already exists: ' + appId });
        }

        // Clone repo
        const gitUrl = repoUrl.startsWith('http') ? repoUrl : `https://github.com/${repoUrl}`;
        const { execSync } = require('child_process');
        try {
          execSync(`git clone --depth 1 ${gitUrl} ${appDir}`, { timeout: 30000 });
        } catch (e) {
          return jsonRes(res, { ok: false, error: 'Git clone failed: ' + (e.message || '').substring(0, 100) });
        }

        // Remove .git dir (we don't need git history)
        try { execSync(`rm -rf ${path.join(appDir, '.git')}`); } catch {}

        // Read manifest if exists
        let manifest = { name: appId, icon: appId[0].toUpperCase(), color: '#333', description: '' };
        const manifestFile = path.join(appDir, 'manifest.json');
        if (fs.existsSync(manifestFile)) {
          try { manifest = { ...manifest, ...JSON.parse(fs.readFileSync(manifestFile, 'utf8')) }; } catch {}
        }

        // Check for index.html
        if (!fs.existsSync(path.join(appDir, 'index.html'))) {
          execSync(`rm -rf ${appDir}`);
          return jsonRes(res, { ok: false, error: 'No index.html found in repo' });
        }

        // Register in apps.json
        const appsFile = path.join(ROOT, 'data', 'apps.json');
        const appsData = JSON.parse(safeReadJSON(appsFile, '{"apps":[]}'));
        const apps = appsData.apps || appsData || [];
        apps.push({
          id: appId,
          name: manifest.name || appId,
          icon: manifest.icon || appId[0].toUpperCase(),
          color: manifest.color || '#333',
          description: manifest.description || '',
          installed: true,
          source: gitUrl,
          installedAt: new Date().toISOString(),
          position: apps.length
        });
        if (appsData.apps) appsData.apps = apps;
        fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));

        // Invalidate agent-context cache
        invalidateAgentContextCache();

        broadcast('dashboard', { type: 'app-installed', appId, name: manifest.name });
        jsonRes(res, { ok: true, appId, name: manifest.name, message: 'App installed successfully' });
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  // Create new app from template
  if (url === '/api/apps/create' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { name, description, icon, color } = JSON.parse(b);
        if (!name) { res.writeHead(400); return res.end(JSON.stringify({ error: 'name required' })); }
        const appId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const appDir = path.join(ROOT, 'apps', appId);
        if (fs.existsSync(appDir)) return jsonRes(res, { ok: false, error: 'App exists: ' + appId });

        fs.mkdirSync(appDir, { recursive: true });
        fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });

        // Generate template HTML
        const appColor = color || '#1a2a3a';
        const appIcon = icon || name[0].toUpperCase();
        const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#0d0d14; color:#e0e0e0; padding:20px; min-height:100vh; }
h1 { font-size:20px; margin-bottom:8px; }
p { color:#888; font-size:13px; margin-bottom:20px; }
.card { background:#1a1a2e; border-radius:8px; padding:16px; margin-bottom:12px; border:1px solid #2a2a3e; }
button { background:#4ecdc4; color:#0d0d14; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; }
button:hover { opacity:0.9; }
input, textarea { width:100%; padding:8px; background:#13131f; border:1px solid #2a2a3e; border-radius:6px; color:#e0e0e0; font-size:13px; margin-bottom:8px; }
</style>
</head>
<body>
<h1>${name}</h1>
<p>${description || 'Eine neue PulseOS App'}</p>
<div class="card">
  <p>Diese App wurde mit dem PulseOS App-Builder erstellt.</p>
  <p style="margin-top:8px;">Bearbeite <code>apps/${appId}/index.html</code> um sie anzupassen.</p>
</div>
<script>
// PulseOS SDK ist automatisch verfuegbar:
// PulseOS.alert('Nachricht') - Zeige Alert in Agent-Bar
// PulseOS.saveState(data) - Zustand speichern
// PulseOS.loadState() - Zustand laden
// PulseOS.onDataChanged(cb) - Reagiere auf Datenänderungen
</script>
</body>
</html>`;

        fs.writeFileSync(path.join(appDir, 'index.html'), html);
        fs.writeFileSync(path.join(appDir, 'manifest.json'), JSON.stringify({
          name, icon: appIcon, color: appColor, description: description || '',
          nodeType: null, inputs: [], outputs: [], pulseSubscriptions: []
        }, null, 2));
        fs.writeFileSync(path.join(appDir, 'data', 'state.json'), '{}');

        // Register
        const appsFile = path.join(ROOT, 'data', 'apps.json');
        const appsData = JSON.parse(safeReadJSON(appsFile, '{"apps":[]}'));
        const apps = appsData.apps || [];
        apps.push({ id: appId, name, icon: appIcon, color: appColor, description: description || '', installed: true, created: true, position: apps.length });
        if (appsData.apps) appsData.apps = apps;
        fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));
        invalidateAgentContextCache();
        broadcast('dashboard', { type: 'app-installed', appId, name });
        jsonRes(res, { ok: true, appId, name });
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  // Uninstall app
  if (url.startsWith('/api/apps/') && url.endsWith('/uninstall') && req.method === 'POST') {
    const appId = url.split('/')[3];
    const appDir = path.join(ROOT, 'apps', appId);
    if (!fs.existsSync(appDir)) {
      return jsonRes(res, { ok: false, error: 'App not found' });
    }
    // Only allow uninstalling apps that have a source (installed from GitHub)
    const appsFile = path.join(ROOT, 'data', 'apps.json');
    const appsData = JSON.parse(safeReadJSON(appsFile, '{"apps":[]}'));
    const apps = appsData.apps || [];
    const app = apps.find(a => a.id === appId);
    if (!app?.source) {
      return jsonRes(res, { ok: false, error: 'Cannot uninstall built-in app' });
    }
    // Remove directory and registry entry
    const { execSync } = require('child_process');
    try { execSync(`rm -rf ${appDir}`); } catch {}
    appsData.apps = apps.filter(a => a.id !== appId);
    fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));
    broadcast('dashboard', { type: 'app-uninstalled', appId });
    return jsonRes(res, { ok: true, message: 'App uninstalled' });
  }

  // ── App Visibility ──
  if (url.match(/^\/api\/apps\/[^/]+\/visibility$/) && req.method === 'PUT') {
    const appId = url.split('/')[3];
    return readBody(req, b => {
      try {
        const { visibility, allowedUsers } = JSON.parse(b);
        if (!['private','unlisted','public','invite'].includes(visibility)) {
          res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid visibility. Use: private, unlisted, public, invite' }));
        }
        // Update manifest.json
        const manifestPath = path.join(ROOT, 'apps', appId, 'manifest.json');
        let manifest = {};
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
        manifest.visibility = visibility;
        manifest.allowedUsers = allowedUsers || [];
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        // Update apps.json registry
        const appsFile = path.join(ROOT, 'data', 'apps.json');
        const appsData = JSON.parse(safeReadJSON(appsFile, '{"apps":[]}'));
        const app = (appsData.apps || []).find(a => a.id === appId);
        if (app) {
          app.visibility = visibility;
          app.allowedUsers = allowedUsers || [];
          fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));
        }
        broadcast('dashboard', { type: 'app-visibility-changed', appId, visibility });
        jsonRes(res, { ok: true, appId, visibility, allowedUsers: allowedUsers || [] });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  // ── Agent Memory ──
  if (url === '/api/agent-memory' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const memories = JSON.parse(b);
        const memFile = path.join(ROOT, 'data', 'agent-memory.json');
        fs.writeFileSync(memFile, JSON.stringify(memories, null, 2));
        broadcast('dashboard', { type: 'memory-update', memories });
        jsonRes(res, { ok: true });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }
  if (url === '/api/agent-memory' && req.method === 'GET') {
    const memFile = path.join(ROOT, 'data', 'agent-memory.json');
    const mem = JSON.parse(safeReadJSON(memFile, '{"facts":[],"goals":[]}'));
    return jsonRes(res, mem);
  }

  // ── Activity Summary ──
  if (url === '/api/activity-summary' && req.method === 'GET') {
    const daysParam = parseInt(new URL(req.url, 'http://localhost').searchParams.get('days') || '7');
    const days = Math.min(daysParam, 30);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const appsFile = path.join(ROOT, 'data', 'apps.json');
    const appList = JSON.parse(safeReadJSON(appsFile, '{"apps":[]}'));
    const apps = appList.apps || appList || [];
    const activity = [];
    for (const a of apps) {
      const dataDir = path.join(ROOT, 'apps', a.id || a, 'data');
      try {
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        let lastModified = 0;
        let modifiedFiles = [];
        files.forEach(f => {
          try {
            const stat = fs.statSync(path.join(dataDir, f));
            if (stat.mtimeMs > cutoff) {
              modifiedFiles.push({ file: f, modified: new Date(stat.mtimeMs).toISOString() });
            }
            if (stat.mtimeMs > lastModified) lastModified = stat.mtimeMs;
          } catch {}
        });
        if (lastModified > 0) {
          activity.push({
            appId: a.id || a,
            name: a.name || a.id || a,
            lastModified: new Date(lastModified).toISOString(),
            daysAgo: Math.round((Date.now() - lastModified) / 86400000),
            recentFiles: modifiedFiles,
            stale: (Date.now() - lastModified) > 3 * 24 * 60 * 60 * 1000
          });
        }
      } catch {}
    }
    activity.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    return jsonRes(res, { days, activity, staleApps: activity.filter(a => a.stale).map(a => a.name) });
  }

  // ── Agent Alerts ──
  if (url === '/api/agent-alert' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { text, type, source } = JSON.parse(b);
        if (!text) { res.writeHead(400); return res.end(JSON.stringify({ error: 'text required' })); }
        const alert = { id: 'a-' + Date.now(), text, type: type || 'info', source: source || 'system', time: new Date().toISOString() };
        broadcast('dashboard', { type: 'agent-alert', alert });
        jsonRes(res, { ok: true, id: alert.id });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  if (url === '/api/chat-outbox' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { message, source } = JSON.parse(b);
        if (!message) { res.writeHead(400); return res.end(JSON.stringify({ error: 'message required' })); }
        const outFile = path.join(ROOT, 'data', 'chat-outbox.json');
        const out = JSON.parse(safeReadJSON(outFile, '{"messages":[]}'));
        if (!out.messages) out.messages = [];
        const msg = { id: 'out-' + Date.now(), message, source: source || 'dashboard', time: new Date().toISOString() };
        out.messages.push(msg);
        fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
        // Also mirror to history so user sees their own message
        const histFile = path.join(ROOT, 'data', 'chat-history.json');
        const hist = JSON.parse(safeReadJSON(histFile, '{"messages":[]}'));
        if (!hist.messages) hist.messages = [];
        const histMsg = { id: 'm-' + Date.now(), from: 'user', text: message, source: 'dashboard', time: msg.time };
        hist.messages.push(histMsg);
        if (hist.messages.length > 200) hist.messages = hist.messages.slice(-200);
        fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
        broadcast('dashboard', { type: 'chat-message', message: histMsg });
        jsonRes(res, { ok: true, id: msg.id });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  if (url === '/api/chat-outbox' && req.method === 'GET') {
    const outFile = path.join(ROOT, 'data', 'chat-outbox.json');
    const out = JSON.parse(safeReadJSON(outFile, '{"messages":[]}'));
    const messages = out.messages || [];
    // Clear after pickup
    if (messages.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify({ messages: [] }, null, 2));
    }
    return jsonRes(res, { messages });
  }

  // ── PulseOS Agent Chat (local Claude Code agent) ──
  if (url === '/api/pulseos-chat' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { message, source, skipMirror } = JSON.parse(b);
        if (!message) { res.writeHead(400); return res.end(JSON.stringify({ error: 'message required' })); }
        const qFile = path.join(ROOT, 'data', 'pulseos-queue.json');
        const q = JSON.parse(safeReadJSON(qFile, { messages: [] }));
        if (!q.messages) q.messages = [];
        const msg = { id: 'pq-' + Date.now(), message, source: source || 'dashboard', time: new Date().toISOString() };
        q.messages.push(msg);
        fs.writeFileSync(qFile, JSON.stringify(q, null, 2));
        // Mirror to chat history (skip in group mode — outbox already mirrors)
        if (!skipMirror) {
          const histFile = path.join(ROOT, 'data', 'chat-history.json');
          const hist = JSON.parse(safeReadJSON(histFile, '{"messages":[]}'));
          if (!hist.messages) hist.messages = [];
          const histMsg = { id: 'm-' + Date.now(), from: 'user', text: message, source: 'dashboard', time: msg.time };
          hist.messages.push(histMsg);
          if (hist.messages.length > 200) hist.messages = hist.messages.slice(-200);
          fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
          broadcast('dashboard', { type: 'chat-message', message: histMsg });
        }
        jsonRes(res, { ok: true, id: msg.id });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  if (url === '/api/pulseos-respond' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { text } = JSON.parse(b);
        if (!text) { res.writeHead(400); return res.end(JSON.stringify({ error: 'text required' })); }
        const histFile = path.join(ROOT, 'data', 'chat-history.json');
        const hist = JSON.parse(safeReadJSON(histFile, '{"messages":[]}'));
        if (!hist.messages) hist.messages = [];
        const msg = { id: 'm-' + Date.now(), from: 'agent', text, source: 'pulseos', time: new Date().toISOString() };
        hist.messages.push(msg);
        if (hist.messages.length > 200) hist.messages = hist.messages.slice(-200);
        fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
        broadcast('dashboard', { type: 'chat-message', message: msg });
        jsonRes(res, { ok: true, id: msg.id });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  if (url === '/api/pulseos-chat' && req.method === 'GET') {
    const qFile = path.join(ROOT, 'data', 'pulseos-queue.json');
    const q = JSON.parse(safeReadJSON(qFile, { messages: [] }));
    const messages = q.messages || [];
    if (messages.length > 0) {
      fs.writeFileSync(qFile, JSON.stringify({ messages: [] }, null, 2));
    }
    return jsonRes(res, { messages });
  }

  // ── Agent Context (dynamische API-Doku für ClaudeOS) ──
  if (url === '/api/agent-context' && req.method === 'GET') {
    // Cache: Antwort wird im Speicher gehalten und nur bei Änderungen invalidiert
    if (agentContextCache.data && (Date.now() - agentContextCache.time < 60000)) {
      return jsonRes(res, agentContextCache.data);
    }
    // Dynamisch generiert — ClaudeOS holt sich das beim Start & alle 5 Min
    const apps = JSON.parse(safeReadJSON(path.join(ROOT, 'data', 'apps.json'), { apps: [] }));
    const appList = (apps.apps || apps || []);
    const appTable = appList.map(a => `| ${a.name || a.id} | ${a.id} | /app/${a.id}/api/ |`).join('\n');

    // Scan welche data-files jede App hat
    const appDataInfo = [];
    for (const a of appList) {
      const dataDir = path.join(ROOT, 'apps', a.id, 'data');
      try {
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        if (files.length > 0) {
          appDataInfo.push(`### ${a.name || a.id} (${a.id})\n` + files.map(f => {
            const name = f.replace('.json', '');
            return `- GET \`/app/${a.id}/api/${name}\` → lesen\n- PUT \`/app/${a.id}/api/${name}\` → schreiben`;
          }).join('\n'));
        }
      } catch {}
    }

    const graphFiles = [];
    try {
      const gDir = path.join(ROOT, 'data', 'graphs');
      fs.readdirSync(gDir).filter(f => f.endsWith('.json')).forEach(f => {
        try {
          const g = JSON.parse(fs.readFileSync(path.join(gDir, f), 'utf8'));
          graphFiles.push(`- **${g.name || g.projectId || f}**: ${(g.nodes||[]).length} Nodes, ${(g.edges||[]).length} Edges`);
        } catch {}
      });
    } catch {}

    // Letzte Änderungen scannen (mtime der App-Daten, letzte 60 Min)
    const recentChanges = [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const a of appList) {
      const dataDir = path.join(ROOT, 'apps', a.id, 'data');
      try {
        fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).forEach(f => {
          try {
            const stat = fs.statSync(path.join(dataDir, f));
            if (stat.mtimeMs > oneHourAgo) {
              const ago = Math.round((Date.now() - stat.mtimeMs) / 60000);
              recentChanges.push({ app: a.name || a.id, file: f, ago });
            }
          } catch {}
        });
      } catch {}
    }
    recentChanges.sort((a, b) => a.ago - b.ago);
    const recentText = recentChanges.length > 0
      ? recentChanges.map(c => `- **${c.app}** ${c.file} (vor ${c.ago} Min)`).join('\n')
      : 'Keine Änderungen in der letzten Stunde';

    const context = `# PulseOS Agent-Kontext

Du bist mit PulseOS verbunden (http://localhost:3000). Du kannst Apps steuern und Daten lesen/schreiben.

## Installierte Apps

| Name | ID | API-Basis |
|------|-----|-----------|
${appTable}

## App-Daten APIs

Muster: \`GET /app/{id}/api/{name}\` lesen, \`PUT /app/{id}/api/{name}\` schreiben (JSON body).
Nach dem Schreiben: \`POST /api/notify-change\` mit \`{"appId":"...","file":"...json"}\` damit die App live aktualisiert.

${appDataInfo.join('\n\n')}

## System-APIs

- \`GET /api/apps\` — App-Liste
- \`GET /api/app-registry\` — Apps mit Manifests
- \`GET /api/graphs\` — Aktive Graphen
- \`POST /api/chat-mirror\` — Nachricht ans Dashboard senden: \`{"from":"agent","text":"...","source":"telegram"}\`
- \`POST /api/notify-change\` — SSE-Event an App: \`{"appId":"...","file":"...json"}\`
- \`GET /api/chat-history\` — Chat-Verlauf
- \`GET /api/activity-summary?days=7\` — Aktivität pro App (letzte N Tage), inkl. stale-Apps
- \`GET /api/pulseos-chat\` — PulseOS-Agent Chat-Queue abholen (pickup & clear)
- \`POST /api/pulseos-respond\` — PulseOS-Agent Antwort senden: \`{"text":"..."}\`

## Aktive Graphen

${graphFiles.length > 0 ? graphFiles.join('\n') : 'Keine aktiven Graphen'}

## Letzte Aktivität (User-Änderungen in Apps)

${recentText}

Wenn der User fragt "was habe ich gerade gemacht?" — lies die oben genannten Dateien via GET API um Details zu sehen.

## Beispiel: Notiz erstellen

\`\`\`bash
# 1. Aktuelle Notizen lesen
curl http://localhost:3000/app/notes/api/notes
# 2. Neue Notiz hinzufügen (vorhandene + neue)
curl -X PUT http://localhost:3000/app/notes/api/notes -H 'Content-Type: application/json' -d '{"notes":[...]}'
# 3. App benachrichtigen
curl -X POST http://localhost:3000/api/notify-change -H 'Content-Type: application/json' -d '{"appId":"notes","file":"notes.json"}'
\`\`\`

## Share / Tunnel

PulseOS hat einen eingebauten Cloudflare Tunnel. Der User kann darüber sein Dashboard öffentlich teilen.

\`\`\`bash
# Tunnel-Status prüfen (gibt URL zurück wenn aktiv)
curl http://localhost:3000/api/tunnel

# Tunnel starten
curl -X POST http://localhost:3000/api/tunnel -H 'Content-Type: application/json' -d '{"action":"start"}'

# Tunnel stoppen
curl -X POST http://localhost:3000/api/tunnel -H 'Content-Type: application/json' -d '{"action":"stop"}'
\`\`\`

Wenn der User nach dem "Share Link" fragt, prüfe \`GET /api/tunnel\` — wenn \`url\` vorhanden ist, gib die URL zurück. Wenn nicht aktiv, starte den Tunnel.

## Regeln
1. Kurz antworten — Telegram-Format
2. Lies immer erst Daten bevor du schreibst
3. Nach PUT immer notify-change senden
4. Memory-Tags nutzen: [REMEMBER: ...], [GOAL: ... | DEADLINE: ...], [DONE: ...]
`;
    const responseData = { context, generated: new Date().toISOString() };
    agentContextCache.data = responseData;
    agentContextCache.time = Date.now();
    return jsonRes(res, responseData);
  }

  // ── AI Endpoint (SDK) ──
  if (url === '/api/ai' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { appId, task, data } = JSON.parse(b);
        // Queue for chat agent if available
        const queueFile = path.join(ROOT, 'data', 'chat-queue.json');
        const queue = JSON.parse(safeReadJSON(queueFile, { pending: [] }));
        if (!queue.pending) queue.pending = [];
        const msg = { id: 'ai-' + Date.now(), appId, task, data, status: 'queued', created: new Date().toISOString() };
        queue.pending.push(msg);
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
        jsonRes(res, { ok: true, id: msg.id, status: 'queued' });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  }

  // ── APP REGISTRY (Phase 13a) ──────────────────────────────
  if (url === '/api/app-registry' && req.method === 'GET') {
    const regFile = path.join(ROOT, 'data', 'app-registry.json');
    if (!fs.existsSync(regFile)) return jsonRes(res, { version: '1.0.0', apps: [] });
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    // Enrich with manifest data
    reg.apps = reg.apps.map(entry => {
      try {
        const mPath = path.join(ROOT, entry.path, 'manifest.json');
        if (fs.existsSync(mPath)) entry.manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      } catch {}
      return entry;
    });
    return jsonRes(res, reg);
  }

  const appRegMatch = url.match(/^\/api\/app-registry\/([a-z0-9_-]+)$/);
  if (appRegMatch && req.method === 'GET') {
    const appId = appRegMatch[1];
    const regFile = path.join(ROOT, 'data', 'app-registry.json');
    if (!fs.existsSync(regFile)) return jsonRes(res, { error: 'Registry not found' }, 404);
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const entry = reg.apps.find(a => a.id === appId);
    if (!entry) return jsonRes(res, { error: 'App not found' }, 404);
    try {
      const mPath = path.join(ROOT, entry.path, 'manifest.json');
      if (fs.existsSync(mPath)) entry.manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    } catch {}
    return jsonRes(res, entry);
  }

  if (url === '/api/app-registry' && req.method === 'POST') {
    return readBody(req, b => {
      const newApp = JSON.parse(b);
      if (!newApp.id) return jsonRes(res, { error: 'id required' }, 400);
      const regFile = path.join(ROOT, 'data', 'app-registry.json');
      const reg = fs.existsSync(regFile) ? JSON.parse(fs.readFileSync(regFile, 'utf8')) : { version: '1.0.0', apps: [] };
      // Upsert
      const idx = reg.apps.findIndex(a => a.id === newApp.id);
      const entry = {
        id: newApp.id,
        type: newApp.type || 'vanilla',
        path: newApp.path || `./apps/${newApp.id}`,
        status: newApp.status || 'active',
        pid: null,
        port: newApp.port || null,
        repo: newApp.repo || null
      };
      if (idx >= 0) reg.apps[idx] = entry; else reg.apps.push(entry);
      reg.updatedAt = new Date().toISOString();
      fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));
      broadcast('dashboard', { type: 'change', file: 'app-registry.json', time: Date.now() });
      jsonRes(res, { ok: true, app: entry });
    });
  }

  if (appRegMatch && req.method === 'DELETE') {
    const appId = appRegMatch[1];
    const regFile = path.join(ROOT, 'data', 'app-registry.json');
    if (!fs.existsSync(regFile)) return jsonRes(res, { error: 'Registry not found' }, 404);
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const before = reg.apps.length;
    reg.apps = reg.apps.filter(a => a.id !== appId);
    if (reg.apps.length === before) return jsonRes(res, { error: 'App not found' }, 404);
    reg.updatedAt = new Date().toISOString();
    fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));
    broadcast('dashboard', { type: 'change', file: 'app-registry.json', time: Date.now() });
    return jsonRes(res, { ok: true, removed: appId });
  }

  // --- App Process & State Endpoints (Phase 13b/c) ---
  const appActionMatch = url.match(/^\/api\/apps\/([a-z0-9_-]+)\/(start|stop|state|action|status)$/);
  if (appActionMatch) {
    const appId = appActionMatch[1];
    const endpoint = appActionMatch[2];

    // POST /api/apps/:id/start
    if (endpoint === 'start' && req.method === 'POST') {
      try {
        const info = await startNodeApp(appId);
        return jsonRes(res, { ok: true, appId, pid: info.pid, port: info.port });
      } catch (err) {
        return jsonRes(res, { error: err.message }, 500);
      }
    }

    // POST /api/apps/:id/stop
    if (endpoint === 'stop' && req.method === 'POST') {
      const stopped = stopNodeApp(appId);
      return jsonRes(res, { ok: stopped, appId });
    }

    // GET /api/apps/:id/state
    if (endpoint === 'state' && req.method === 'GET') {
      const manifest = loadManifest(appId);
      if (manifest && manifest.type === 'node' && runningProcesses.has(appId)) {
        try {
          const state = await proxyToNodeApp(appId, 'GET', '/api/state', null);
          return jsonRes(res, state);
        } catch (err) {
          return jsonRes(res, { error: err.message }, 502);
        }
      }
      // Vanilla or not running → return local state
      return jsonRes(res, getVanillaState(appId));
    }

    // POST /api/apps/:id/action
    if (endpoint === 'action' && req.method === 'POST') {
      return readBody(req, async (b) => {
        const body = JSON.parse(b);
        const manifest = loadManifest(appId);
        if (manifest && manifest.type === 'node' && runningProcesses.has(appId)) {
          try {
            const result = await proxyToNodeApp(appId, 'POST', '/api/action', body);
            return jsonRes(res, result);
          } catch (err) {
            return jsonRes(res, { error: err.message }, 502);
          }
        }
        // Vanilla: handle locally
        if (body.type === 'set-state') {
          setVanillaState(appId, body.data || {});
          return jsonRes(res, { ok: true });
        }
        if (body.type === 'graph-input') {
          broadcast(appId, { type: 'app-input', inputName: body.inputName, data: body.data });
          return jsonRes(res, { ok: true });
        }
        if (body.type === 'pulse') {
          broadcast(appId, { type: 'pulse', data: body.data || {} });
          return jsonRes(res, { ok: true });
        }
        return jsonRes(res, { ok: true, unhandled: body.type });
      });
    }

    // POST /api/apps/:id/status
    if (endpoint === 'status' && req.method === 'POST') {
      return readBody(req, (b) => {
        const { text } = JSON.parse(b);
        broadcast(appId, { type: 'status-update', status: text, time: Date.now() });
        return jsonRes(res, { ok: true });
      });
    }
  }

  // --- Graph API (Phase 13d) ---
  // GET /api/graphs — list all graphs
  if (url === '/api/graphs' && req.method === 'GET') {
    try {
      const files = fs.readdirSync(GRAPHS_DIR).filter(f => f.startsWith('graph-') && f.endsWith('.json'));
      const graphs = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(GRAPHS_DIR, f), 'utf8')); } catch { return null; }
      }).filter(Boolean);
      return jsonRes(res, { graphs });
    } catch { return jsonRes(res, { graphs: [] }); }
  }

  const graphMatch = url.match(/^\/api\/graphs\/([a-zA-Z0-9_-]+)$/);
  const graphConnectMatch = url.match(/^\/api\/graphs\/([a-zA-Z0-9_-]+)\/connect$/);
  const graphRunMatch = url.match(/^\/api\/graphs\/([a-zA-Z0-9_-]+)\/run$/);

  // GET /api/graphs/:projectId
  if (graphMatch && !graphConnectMatch && !graphRunMatch && req.method === 'GET') {
    const projectId = graphMatch[1];
    const graph = loadGraph(projectId);
    if (!graph) return jsonRes(res, { projectId, nodes: [], edges: [] });
    return jsonRes(res, graph);
  }

  // POST /api/graphs/:projectId — save full graph
  if (graphMatch && !graphConnectMatch && !graphRunMatch && req.method === 'POST') {
    const projectId = graphMatch[1];
    return readBody(req, (b) => {
      const graph = JSON.parse(b);
      graph.projectId = projectId;
      saveGraph(projectId, graph);
      broadcast(projectId, { type: 'graph-updated', projectId, time: Date.now() });
      return jsonRes(res, { ok: true, projectId });
    });
  }

  // POST /api/graphs/:projectId/connect — add edge
  if (graphConnectMatch && req.method === 'POST') {
    const projectId = graphConnectMatch[1];
    return readBody(req, (b) => {
      const { fromApp, fromOutput, toApp, toInput } = JSON.parse(b);
      if (!fromApp || !fromOutput || !toApp || !toInput) return jsonRes(res, { error: 'Missing fields' }, 400);
      const graph = loadGraph(projectId) || { projectId, nodes: [], edges: [] };
      // Auto-add nodes if not present
      if (!graph.nodes.find(n => n.appId === fromApp)) {
        const m = loadManifest(fromApp);
        const lastX = graph.nodes.reduce((max, n) => Math.max(max, n.x || 0), 0);
        graph.nodes.push({ appId: fromApp, nodeType: m?.nodeType || 'producer', x: lastX + 260, y: 120 });
      }
      if (!graph.nodes.find(n => n.appId === toApp)) {
        const m = loadManifest(toApp);
        const lastX = graph.nodes.reduce((max, n) => Math.max(max, n.x || 0), 0);
        graph.nodes.push({ appId: toApp, nodeType: m?.nodeType || 'consumer', x: lastX + 260, y: 120 });
      }
      // Check for duplicate edge
      const exists = graph.edges.some(e => e.from.appId === fromApp && e.from.output === fromOutput && e.to.appId === toApp && e.to.input === toInput);
      if (!exists) {
        graph.edges.push({ from: { appId: fromApp, output: fromOutput }, to: { appId: toApp, input: toInput } });
      }
      saveGraph(projectId, graph);
      broadcast(projectId, { type: 'graph-updated', projectId, time: Date.now() });
      return jsonRes(res, { ok: true, edgeCount: graph.edges.length });
    });
  }

  // DELETE /api/graphs/:projectId/connect — remove edge
  if (graphConnectMatch && req.method === 'DELETE') {
    const projectId = graphConnectMatch[1];
    return readBody(req, (b) => {
      const { fromApp, fromOutput, toApp, toInput } = JSON.parse(b);
      const graph = loadGraph(projectId);
      if (!graph) return jsonRes(res, { error: 'Graph not found' }, 404);
      const before = graph.edges.length;
      graph.edges = graph.edges.filter(e => {
        if (fromOutput && toInput) {
          return !(e.from.appId === fromApp && e.from.output === fromOutput && e.to.appId === toApp && e.to.input === toInput);
        }
        return !(e.from.appId === fromApp && e.to.appId === toApp);
      });
      saveGraph(projectId, graph);
      broadcast(projectId, { type: 'graph-updated', projectId, time: Date.now() });
      return jsonRes(res, { ok: true, removed: before - graph.edges.length });
    });
  }

  // POST /api/graphs/:projectId/run — trigger all producers
  if (graphRunMatch && req.method === 'POST') {
    const projectId = graphRunMatch[1];
    const graph = loadGraph(projectId);
    if (!graph) return jsonRes(res, { error: 'Graph not found' }, 404);
    const producers = graph.nodes.filter(n => n.nodeType === 'producer');
    const results = [];
    for (const p of producers) {
      try {
        await sendInputToApp(p.appId, '__pulse', { type: 'manual', projectId, timestamp: Date.now() });
        results.push({ appId: p.appId, status: 'pulsed' });
      } catch (err) {
        results.push({ appId: p.appId, status: 'error', error: err.message });
      }
    }
    return jsonRes(res, { ok: true, projectId, triggered: results });
  }

  // POST /api/graphs/:projectId/output — app reports output for routing
  const graphOutputMatch = url.match(/^\/api\/graphs\/([a-zA-Z0-9_-]+)\/output$/);
  if (graphOutputMatch && req.method === 'POST') {
    const projectId = graphOutputMatch[1];
    return readBody(req, async (b) => {
      const { appId, outputName, data } = JSON.parse(b);
      await routeOutput(projectId, appId, outputName, data);
      return jsonRes(res, { ok: true, routed: true });
    });
  }

  // --- Pulse API (Phase 13e) ---
  const pulseFireMatch = url.match(/^\/api\/pulse\/fire\/([a-z0-9_-]+)$/);
  if (pulseFireMatch && req.method === 'POST') {
    const appId = pulseFireMatch[1];
    try {
      await fireAppPulse(appId, { type: 'manual', timestamp: Date.now() });
      return jsonRes(res, { ok: true, appId, pulsed: true });
    } catch (err) {
      return jsonRes(res, { error: err.message }, 500);
    }
  }

  const pulseWebhookMatch = url.match(/^\/api\/pulse\/webhook\/([a-zA-Z0-9_-]+)$/);
  if (pulseWebhookMatch && req.method === 'POST') {
    const token = pulseWebhookMatch[1];
    // Find apps subscribed to this webhook token
    const regFile = path.join(ROOT, 'data', 'app-registry.json');
    if (!fs.existsSync(regFile)) return jsonRes(res, { error: 'No registry' }, 404);
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const fired = [];
    for (const entry of reg.apps) {
      const manifest = loadManifest(entry.id);
      if (manifest && manifest.pulseSubscriptions && manifest.pulseSubscriptions.includes(`webhook:${token}`)) {
        await fireAppPulse(entry.id, { type: `webhook:${token}`, timestamp: Date.now() }).catch(() => {});
        fired.push(entry.id);
      }
    }
    return jsonRes(res, { ok: true, token, fired });
  }

  // App status — returns summary info from app's data directory
  const appStatusMatch = url.match(/^\/api\/app-status\/([a-z0-9-]+)$/);
  if (appStatusMatch && req.method === 'GET') {
    const appId = appStatusMatch[1];
    const appDir = path.join(ROOT, 'apps', appId);
    const dataDir = path.join(appDir, 'data');
    const appsFile = path.join(ROOT, 'data', 'apps.json');
    const appsData = safeReadJSON(appsFile, { apps: [] });
    const appEntry = (typeof appsData === 'string' ? JSON.parse(appsData) : appsData).apps?.find(a => a.id === appId);
    const result = { appId, name: appEntry?.name || appId, icon: appEntry?.icon || '📱', color: appEntry?.color || '#8B5CF6', description: appEntry?.description || '', status: '', hasData: false };
    try {
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        result.hasData = files.length > 0;
        // Try to extract a one-line status from the first data file
        if (files.length > 0) {
          const firstData = safeReadJSON(path.join(dataDir, files[0]), {});
          const parsed = typeof firstData === 'string' ? JSON.parse(firstData) : firstData;
          if (Array.isArray(parsed)) result.status = `${parsed.length} Einträge`;
          else if (parsed.items && Array.isArray(parsed.items)) result.status = `${parsed.items.length} Items`;
          else if (parsed.entries && Array.isArray(parsed.entries)) result.status = `${parsed.entries.length} Einträge`;
          else result.status = `${files.length} Datendatei${files.length > 1 ? 'en' : ''}`;
        }
      }
    } catch {}
    return jsonRes(res, result);
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
      emitEvent({ type: 'chat:message', source: 'user', data: { chatId: ready.chatId, msgId: ready.msgId, text: ready.text, user: ready.user } });
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
          emitEvent({ type: 'chat:message', source: 'user', data: { chatId: nextReady.chatId, msgId: nextReady.msgId, text: nextReady.text, user: nextReady.user } });
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
        emitEvent({ type: 'chat:message', source: 'agent:chat-orchestrator', data: { chatId, msgId, text, role: 'claude' } });
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
        emitEvent({ type: 'data:changed', source: 'modifier', data: { appId, request: request.slice(0, 100), model: selectedModel } });
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
          vikingImportApp(appId);
        }
        emitEvent({ type: 'agent:completed', source: `agent:${agentId || 'modifier'}`, data: { requestId, appId, status, summary: (summary || '').slice(0, 100) } });
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
  const CTX_DIR = path.join(ROOT, 'data', 'contexts');

  // Helper: validate context ID (no path traversal)
  function isValidCtxId(id) { return /^[a-z0-9][a-z0-9_-]*$/.test(id); }

  // Helper: read all context files (full or L0)
  function readAllContexts(l0Only) {
    try {
      const files = fs.readdirSync(CTX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
      return files.map(f => {
        try {
          const ctx = JSON.parse(fs.readFileSync(path.join(CTX_DIR, f), 'utf8'));
          if (l0Only) {
            return { id: ctx.id, name: ctx.name, icon: ctx.icon, color: ctx.color, parentId: ctx.parentId || null, widgetCount: (ctx.widgets || []).length, updated: ctx.updated || ctx.created || null, widgets: (ctx.widgets || []).slice(0, 6).map(w => ({ type: w.type })) };
          }
          return ctx;
        } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }

  // ── Broadcast to child contexts (for inherited widget updates) ──
  function broadcastToChildren(parentCtxId) {
    try {
      const allCtxs = readAllContexts(false);
      for (const ctx of allCtxs) {
        if (ctx.parentId === parentCtxId) {
          broadcast('liveos', { type: 'context-change', contextId: ctx.id, time: Date.now() });
        }
      }
    } catch (e) {
      console.error('broadcastToChildren error:', e.message);
    }
  }

  // ── Schema Validation ──
  function validateAgainstSchema(data, schemaId) {
    const schemasDir = path.join(__dirname, 'data', 'schemas');
    const fp = path.join(schemasDir, schemaId + '.json');
    try {
      if (!fs.existsSync(fp)) return { valid: true }; // No schema = no validation
      const schema = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const errors = [];
      const fields = schema.fields || {};

      // For array-based data (todo items, timeline items, etc.), validate each item
      const items = Array.isArray(data) ? data : (data.items || data.rows || [data]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== 'object') continue;
        for (const [fieldName, fieldDef] of Object.entries(fields)) {
          if (fieldDef.auto) continue; // Skip auto-generated fields
          const value = item[fieldName];
          // Required check
          if (fieldDef.required && (value === undefined || value === null || value === '')) {
            errors.push({ item: i, field: fieldName, error: `"${fieldDef.label || fieldName}" ist erforderlich` });
          }
          if (value === undefined || value === null) continue;
          // Type checks
          if (fieldDef.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
            errors.push({ item: i, field: fieldName, error: `"${fieldDef.label || fieldName}" muss eine Zahl sein` });
          }
          if (fieldDef.type === 'boolean' && typeof value !== 'boolean') {
            errors.push({ item: i, field: fieldName, error: `"${fieldDef.label || fieldName}" muss true/false sein` });
          }
          if (fieldDef.type === 'enum' && fieldDef.options && !fieldDef.options.includes(value)) {
            errors.push({ item: i, field: fieldName, error: `"${fieldDef.label || fieldName}" muss einer von [${fieldDef.options.join(', ')}] sein` });
          }
        }
      }
      return errors.length > 0 ? { valid: false, errors } : { valid: true };
    } catch (e) {
      console.error('Schema validation error:', e.message);
      return { valid: true }; // Don't block on validation errors
    }
  }

  // GET /api/schemas — List all schemas
  // GET /api/schemas/:id — Get specific schema
  if (url === '/api/schemas' && req.method === 'GET') {
    const schemasDir = path.join(__dirname, 'data', 'schemas');
    try {
      const files = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json'));
      const schemas = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(schemasDir, f), 'utf8')); }
        catch { return null; }
      }).filter(Boolean);
      return jsonRes(res, { schemas });
    } catch { return jsonRes(res, { schemas: [] }); }
  }
  if (url.startsWith('/api/schemas/') && req.method === 'GET') {
    const schemaId = url.split('/api/schemas/')[1];
    if (!schemaId || schemaId.includes('..') || schemaId.includes('/')) return jsonRes(res, { error: 'Invalid schema ID' }, 400);
    const fp = path.join(__dirname, 'data', 'schemas', schemaId + '.json');
    try {
      const schema = JSON.parse(fs.readFileSync(fp, 'utf8'));
      return jsonRes(res, schema);
    } catch { return jsonRes(res, { error: 'Schema not found' }, 404); }
  }

  // GET /api/dashboard-stats — Aggregated stats + suggestions
  let dashStatsCache = null, dashStatsCacheTime = 0;
  if (url === '/api/dashboard-stats' && req.method === 'GET') {
    const now = Date.now();
    if (dashStatsCache && now - dashStatsCacheTime < 30000) return jsonRes(res, dashStatsCache);

    const allCtxs = readAllContexts(false);
    const userCtxs = allCtxs.filter(c => !c.id?.startsWith('ctx-app-') && !c.system);
    let totalTodos = 0, openTodos = 0, highPriTodos = 0;
    const urgentTodos = [];
    const suggestions = [];
    const threeDaysAgo = now - 3 * 86400000;

    for (const ctx of userCtxs) {
      const widgets = ctx.widgets || [];
      const data = ctx.data || {};

      // Scan todos
      for (const w of widgets) {
        if (w.type === 'todo') {
          const items = (data[w.dataKey]?.items || w.data?.items || []);
          totalTodos += items.length;
          const open = items.filter(i => !i.done);
          openTodos += open.length;
          const urgent = open.filter(i => i.priority === 'high');
          highPriTodos += urgent.length;
          for (const t of urgent.slice(0, 3)) {
            urgentTodos.push({ text: t.text, priority: 'high', contextName: ctx.name, contextId: ctx.id });
          }
        }
      }

      // Suggestions: stale contexts
      const updatedMs = ctx.updated ? new Date(ctx.updated).getTime() : 0;
      if (updatedMs && updatedMs < threeDaysAgo && widgets.length > 0) {
        const days = Math.floor((now - updatedMs) / 86400000);
        suggestions.push({ type: 'stale', icon: '\u23F0', text: '"' + (ctx.name || ctx.id) + '" seit ' + days + ' Tagen nicht bearbeitet', contextId: ctx.id });
      }

      // Suggestions: empty contexts
      if (widgets.length === 0 && ctx.name) {
        suggestions.push({ type: 'empty', icon: '\uD83D\uDCED', text: '"' + (ctx.name || ctx.id) + '" ist leer \u2014 leg los!', contextId: ctx.id });
      }
    }

    // Suggestions: urgent todos
    if (highPriTodos > 0) {
      const ctxWithUrgent = [...new Set(urgentTodos.map(t => t.contextId))];
      for (const cid of ctxWithUrgent.slice(0, 2)) {
        const count = urgentTodos.filter(t => t.contextId === cid).length;
        const name = urgentTodos.find(t => t.contextId === cid)?.contextName || cid;
        suggestions.unshift({ type: 'urgent', icon: '\uD83D\uDD34', text: count + ' dringende Todos in "' + name + '"', contextId: cid });
      }
    }

    const graphFiles = (() => { try { return fs.readdirSync(GRAPHS_DIR).filter(f => f.endsWith('.json')).length; } catch { return 0; } })();

    dashStatsCache = {
      stats: { totalTodos, openTodos, highPriorityTodos: highPriTodos, totalContexts: userCtxs.length, activeContexts: userCtxs.filter(c => c.updated && new Date(c.updated).getTime() > threeDaysAgo).length, staleContexts: suggestions.filter(s => s.type === 'stale').length, totalGraphs: graphFiles },
      urgentTodos: urgentTodos.slice(0, 5),
      suggestions: suggestions.slice(0, 5)
    };
    dashStatsCacheTime = now;
    return jsonRes(res, dashStatsCache);
  }

  // GET /api/contexts — List all contexts (L0: id, name, icon, color, parentId, widgetCount)
  // POST /api/contexts — Create new context
  if (url === '/api/contexts') {
    if (req.method === 'GET') {
      return jsonRes(res, { contexts: readAllContexts(true) });
    }
    if (req.method === 'POST') {
      return readBody(req, b => {
        try {
          const ctx = JSON.parse(b);
          if (!ctx.id) ctx.id = 'ctx-' + Date.now();
          if (!isValidCtxId(ctx.id)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid context ID' })); }
          ctx.created = ctx.created || new Date().toISOString();
          ctx.updated = new Date().toISOString();
          ctx.widgets = ctx.widgets || [];
          ctx.connections = ctx.connections || [];
          ctx.skills = ctx.skills || [];
          ctx.chat = ctx.chat || [];
          ctx.data = ctx.data || {};
          const ctxFile = path.join(CTX_DIR, ctx.id + '.json');
          const ctxDataDir = path.join(CTX_DIR, ctx.id);
          if (!fs.existsSync(ctxDataDir)) fs.mkdirSync(ctxDataDir, { recursive: true });
          fs.writeFileSync(path.join(ctxDataDir, '_changelog.json'), JSON.stringify({ entries: [] }, null, 2));
          fs.writeFileSync(ctxFile, JSON.stringify(ctx, null, 2));
          broadcast('liveos', { type: 'context-change', contextId: ctx.id, time: Date.now() });
          jsonRes(res, { ok: true, id: ctx.id });
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
  }

  // GET /api/context-tree — Nested tree of all contexts (L0 data only)
  if (url === '/api/context-tree' && req.method === 'GET') {
    const all = readAllContexts(true);
    const byId = {};
    all.forEach(c => { byId[c.id] = { ...c, children: [] }; });
    const roots = [];
    all.forEach(c => {
      if (c.parentId && byId[c.parentId]) {
        byId[c.parentId].children.push(byId[c.id]);
      } else {
        roots.push(byId[c.id]);
      }
    });
    return jsonRes(res, { tree: roots });
  }

  // Context sub-routes (must check before the base /api/context/:id route)
  const ctxSummaryMatch = url.match(/^\/api\/context\/([a-z0-9_-]+)\/summary$/);
  if (ctxSummaryMatch && req.method === 'GET') {
    const ctxId = ctxSummaryMatch[1];
    if (!isValidCtxId(ctxId)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid context ID' })); }
    const ctxFile = path.join(CTX_DIR, ctxId + '.json');
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
      const widgets = ctx.widgets || [];
      const widgetSummary = widgets.map(w => ({ id: w.instanceId || w.id, type: w.typeId || w.type, label: w.label || w.title, scope: w.scope || 'local' }));
      const dataKeys = Object.keys(ctx.data || {});
      const chatCount = (ctx.chat || []).length;
      const changelogCount = (ctx.changelog || []).length;
      return jsonRes(res, {
        id: ctx.id,
        name: ctx.name,
        icon: ctx.icon,
        color: ctx.color,
        parentId: ctx.parentId || null,
        widgetCount: widgets.length,
        widgets: widgetSummary,
        dataKeys,
        chatCount,
        changelogCount,
        created: ctx.created,
        updated: ctx.updated,
        skills: ctx.skills || []
      });
    } catch {
      res.writeHead(404); return res.end(JSON.stringify({ error: 'Context not found' }));
    }
  }

  // GET /api/context/:id/scope-chain — Inherited widgets + data from parent chain
  const ctxScopeMatch = url.match(/^\/api\/context\/([a-z0-9_-]+)\/scope-chain$/);
  if (ctxScopeMatch && req.method === 'GET') {
    const ctxId = ctxScopeMatch[1];
    if (!isValidCtxId(ctxId)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid context ID' })); }
    const chain = [];
    const inheritedWidgets = [];
    const inheritedData = {};
    let currentId = ctxId;
    const visited = new Set();
    // First, read the requested context itself
    try {
      const selfCtx = JSON.parse(fs.readFileSync(path.join(CTX_DIR, currentId + '.json'), 'utf8'));
      chain.push({ id: selfCtx.id, name: selfCtx.name, icon: selfCtx.icon });
      currentId = selfCtx.parentId || null;
    } catch {
      res.writeHead(404); return res.end(JSON.stringify({ error: 'Context not found' }));
    }
    // Traverse parent chain
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      try {
        const parentCtx = JSON.parse(fs.readFileSync(path.join(CTX_DIR, currentId + '.json'), 'utf8'));
        chain.push({ id: parentCtx.id, name: parentCtx.name, icon: parentCtx.icon });
        // Collect widgets with scope "inherited" or "global"
        const parentWidgets = (parentCtx.widgets || []).filter(w => w.scope === 'inherited' || w.scope === 'global');
        parentWidgets.forEach(w => inheritedWidgets.push({ ...w, fromContext: parentCtx.id }));
        // Merge parent data (don't overwrite already-set keys from closer ancestors)
        if (parentCtx.data) {
          for (const [k, v] of Object.entries(parentCtx.data)) {
            if (!(k in inheritedData)) inheritedData[k] = { value: v, fromContext: parentCtx.id };
          }
        }
        currentId = parentCtx.parentId || null;
      } catch { break; }
    }
    return jsonRes(res, { chain, inheritedWidgets, inheritedData });
  }

  const ctxChangelogMatch = url.match(/^\/api\/context\/([a-z0-9_-]+)\/changelog$/);
  if (ctxChangelogMatch && req.method === 'GET') {
    const logFile = path.join(CTX_DIR, ctxChangelogMatch[1], '_changelog.json');
    return jsonRes(res, safeReadJSON(logFile, { entries: [] }));
  }

  // GET /api/context/:id — Full context JSON
  // PUT /api/context/:id — Save context (triggers SSE)
  // DELETE /api/context/:id — Delete context
  const ctxMatch = url.match(/^\/api\/context\/([a-z0-9_-]+)$/);
  if (ctxMatch) {
    const ctxId = ctxMatch[1];
    if (!isValidCtxId(ctxId)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid context ID' })); }
    const ctxFile = path.join(CTX_DIR, ctxId + '.json');
    if (req.method === 'GET') {
      if (!fs.existsSync(ctxFile)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Context not found' })); }
      return jsonRes(res, safeReadJSON(ctxFile, { id: ctxId, widgets: [], connections: [] }));
    }
    if (req.method === 'PUT') return readBody(req, b => {
      try {
        const ctx = JSON.parse(b);
        // Validate widgets that have a schema field
        const validationErrors = [];
        for (const w of (ctx.widgets || [])) {
          if (w.schema && ctx.data && ctx.data[w.dataKey]) {
            const result = validateAgainstSchema(ctx.data[w.dataKey], w.schema);
            if (!result.valid) {
              validationErrors.push({ widget: w.title || w.dataKey, schema: w.schema, errors: result.errors });
            }
          }
        }
        if (validationErrors.length > 0) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Schema-Validierung fehlgeschlagen', validationErrors }));
        }
        ctx.updated = new Date().toISOString();
        fs.writeFileSync(ctxFile, JSON.stringify(ctx, null, 2));
        broadcast('liveos', { type: 'context-change', contextId: ctxId, time: Date.now() });
        // Notify child contexts that may have inherited widgets from this context
        broadcastToChildren(ctxId);
        vikingSyncContextDebounced(ctxId);
        jsonRes(res, { ok: true });
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    if (req.method === 'DELETE') {
      try {
        if (fs.existsSync(ctxFile)) fs.unlinkSync(ctxFile);
        // Also remove data directory if it exists
        const ctxDataDir = path.join(CTX_DIR, ctxId);
        if (fs.existsSync(ctxDataDir)) {
          const files = fs.readdirSync(ctxDataDir);
          files.forEach(f => { try { fs.unlinkSync(path.join(ctxDataDir, f)); } catch {} });
          try { fs.rmdirSync(ctxDataDir); } catch {}
        }
        broadcast('liveos', { type: 'context-deleted', contextId: ctxId, time: Date.now() });
        return jsonRes(res, { ok: true });
      } catch (e) {
        res.writeHead(500); return res.end(JSON.stringify({ error: e.message }));
      }
    }
  }

  // ── Custom Widget HTML serving ──
  // GET /api/custom-widget/:contextId/:widgetFileId — serve custom widget HTML
  const cwMatch = url.match(/^\/api\/custom-widget\/([a-z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
  if (cwMatch && req.method === 'GET') {
    const cwCtxId = cwMatch[1];
    const cwFileId = cwMatch[2].replace(/[^a-zA-Z0-9_-]/g, '');
    const cwDir = path.join(CTX_DIR, cwCtxId);
    const cwFile = path.join(cwDir, cwFileId + '.html');
    if (fs.existsSync(cwFile)) {
      const html = fs.readFileSync(cwFile, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    res.writeHead(404);
    return res.end('<html><body style="background:#0f172a;color:#f87171;font-family:system-ui;padding:20px;">Custom Widget nicht gefunden</body></html>');
  }

  // ── dataRef API: Read/Write individual data keys from a context ──
  // GET /api/context/:id/data/:dataKey — read single data entry
  // PUT /api/context/:id/data/:dataKey — write single data entry (triggers SSE to all refs)
  const dataRefMatch = url.match(/^\/api\/context\/([a-z0-9_-]+)\/data\/([a-zA-Z0-9_-]+)$/);
  if (dataRefMatch) {
    const srcCtxId = dataRefMatch[1];
    const dataKey = dataRefMatch[2];
    if (!isValidCtxId(srcCtxId)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid context ID' })); }
    const srcCtxFile = path.join(CTX_DIR, srcCtxId + '.json');
    if (!fs.existsSync(srcCtxFile)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Context not found' })); }

    if (req.method === 'GET') {
      const ctx = JSON.parse(fs.readFileSync(srcCtxFile, 'utf8'));
      return jsonRes(res, { dataKey, value: ctx.data?.[dataKey] ?? null, contextId: srcCtxId, contextName: ctx.name });
    }

    if (req.method === 'PUT') return readBody(req, b => {
      try {
        const { value } = JSON.parse(b);
        const ctx = JSON.parse(fs.readFileSync(srcCtxFile, 'utf8'));
        if (!ctx.data) ctx.data = {};
        ctx.data[dataKey] = value;
        ctx.updated = new Date().toISOString();
        fs.writeFileSync(srcCtxFile, JSON.stringify(ctx, null, 2));
        // Broadcast change to source context
        broadcast('liveos', { type: 'context-change', contextId: srcCtxId, time: Date.now() });
        // Broadcast to all contexts that reference this data via dataRef
        notifyDataRefSubscribers(srcCtxId, dataKey);
        vikingSyncContextDebounced(srcCtxId);
        jsonRes(res, { ok: true });
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
  }

  // GET /api/context/:id/refs — list all incoming dataRefs pointing to this context
  const refsMatch = url.match(/^\/api\/context\/([a-z0-9_-]+)\/refs$/);
  if (refsMatch && req.method === 'GET') {
    const targetCtxId = refsMatch[1];
    const allCtxs = readAllContexts(false);
    const refs = [];
    for (const ctx of allCtxs) {
      for (const w of (ctx.widgets || [])) {
        if (w.dataRef && w.dataRef.contextId === targetCtxId) {
          refs.push({ fromContextId: ctx.id, fromContextName: ctx.name, widgetId: w.id, widgetTitle: w.title, dataKey: w.dataRef.dataKey });
        }
      }
    }
    return jsonRes(res, { refs });
  }

  // ── dataRef notification helper ──
  function notifyDataRefSubscribers(srcCtxId, dataKey) {
    try {
      const allCtxs = readAllContexts(false);
      for (const ctx of allCtxs) {
        for (const w of (ctx.widgets || [])) {
          if (w.dataRef && w.dataRef.contextId === srcCtxId && w.dataRef.dataKey === dataKey) {
            broadcast(ctx.id, { type: 'dataref-update', sourceContextId: srcCtxId, dataKey, time: Date.now() });
            break; // One notification per context is enough
          }
        }
      }
    } catch (e) {
      console.error('notifyDataRefSubscribers error:', e.message);
    }
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

  // --- Event Bus API ---

  // Emit an event into the bus (from any source: app, external, etc.)
  if (url === '/api/event' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const event = JSON.parse(b);
        if (!event.type) return jsonRes(res, { ok: false, error: 'Event type required' });
        emitEvent({ type: event.type, source: event.source || 'api', data: event.data || {} });
        jsonRes(res, { ok: true, type: event.type });
      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Get event log
  if (url === '/api/events' && req.method === 'GET') {
    return jsonRes(res, safeReadJSON(EVENT_LOG_FILE, { events: [] }));
  }

  // Get/update action chains
  if (url === '/api/action-chains') {
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(ACTION_CHAINS_FILE, { chains: [] }));
    if (req.method === 'PUT') return readBody(req, b => {
      fs.writeFileSync(ACTION_CHAINS_FILE, JSON.stringify(JSON.parse(b), null, 2));
      jsonRes(res, { ok: true });
    });
    if (req.method === 'POST') return readBody(req, b => {
      const newChain = JSON.parse(b);
      if (!newChain.id) newChain.id = 'chain-' + Date.now();
      newChain.enabled = newChain.enabled !== false;
      const data = JSON.parse(safeReadJSON(ACTION_CHAINS_FILE, { chains: [] }));
      data.chains.push(newChain);
      fs.writeFileSync(ACTION_CHAINS_FILE, JSON.stringify(data, null, 2));
      jsonRes(res, { ok: true, id: newChain.id });
    });
  }

  // Get/update scheduled tasks
  if (url === '/api/scheduled-tasks') {
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(SCHEDULER_FILE, { tasks: [] }));
    if (req.method === 'POST') return readBody(req, b => {
      const task = JSON.parse(b);
      if (!task.id) task.id = 'task-' + Date.now();
      task.enabled = task.enabled !== false;
      task.lastRun = null;
      const data = JSON.parse(fs.readFileSync(SCHEDULER_FILE, 'utf8'));
      data.tasks.push(task);
      fs.writeFileSync(SCHEDULER_FILE, JSON.stringify(data, null, 2));
      jsonRes(res, { ok: true, id: task.id });
    });
  }

  // Root context
  if (url === '/api/root-context') {
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(ROOT_CONTEXT_FILE, {}));
    if (req.method === 'PUT') return readBody(req, b => {
      fs.writeFileSync(ROOT_CONTEXT_FILE, JSON.stringify(JSON.parse(b), null, 2));
      emitEvent({ type: 'system:context-updated', source: 'api', data: {} });
      jsonRes(res, { ok: true });
    });
  }

  // --- Agent Context Creator ---
  // Creates a full agent context: app + data + schema + viking context + skill
  if (url === '/api/agent-context' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const spec = JSON.parse(b);
        const agentId = spec.id || spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const agentName = spec.name || agentId;
        const description = spec.description || `${agentName} Agent`;
        const icon = spec.icon || '🤖';
        const color = spec.color || '#0ea5e9';
        const fields = spec.fields || {}; // { fieldName: { type, label, ... } }
        const initialData = spec.data || {};
        const instructions = spec.instructions || '';

        const appDir = path.join(ROOT, 'apps', agentId);
        const dataDir = path.join(appDir, 'data');

        // 1. Create app directory + data dir
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        // 2. Create app.json
        fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
          name: agentName,
          icon: icon,
          color: color,
          description: description,
          agentManaged: true
        }, null, 2));

        // 3. Create schema.json from fields spec
        const schema = { _title: agentName, _icon: icon, _layout: 'auto' };
        if (fields && Object.keys(fields).length > 0) {
          Object.entries(fields).forEach(([key, fieldSpec]) => {
            schema[key] = typeof fieldSpec === 'string' ? { type: fieldSpec } : fieldSpec;
          });
          // Detect list field
          if (initialData) {
            for (const [key, val] of Object.entries(initialData)) {
              if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                schema._listField = key;
                schema._layout = 'table';
                break;
              }
            }
          }
        }
        fs.writeFileSync(path.join(dataDir, 'schema.json'), JSON.stringify(schema, null, 2));

        // 4. Create initial data file (context.json)
        const contextData = Object.keys(initialData).length > 0 ? initialData : {
          title: agentName,
          status: 'active',
          lastUpdate: new Date().toISOString()
        };
        fs.writeFileSync(path.join(dataDir, 'context.json'), JSON.stringify(contextData, null, 2));

        // 5. Create index.html using Context View widget
        const indexHtml = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agentName}</title>
  <link rel="stylesheet" href="/widgets/context-view.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; background: #0a0e17; }
  </style>
</head>
<body>
  <div id="context-root"></div>
  <script src="/widgets/context-view.js"></script>
  <script>
    ContextView.init({
      el: '#context-root',
      appId: '${agentId}',
      dataFile: 'context'
    });
  </script>
</body>
</html>`;
        fs.writeFileSync(path.join(appDir, 'index.html'), indexHtml);

        // 6. Create agent skill file
        const skillDir = path.join(ROOT, '.claude', 'skills', agentId);
        if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
        const skillMd = `---
name: ${agentId}
description: ${description} - manages ${agentId} data and responds to user queries
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# ${agentName} Agent

Du bist der ${agentName}-Agent fuer PulseOS (localhost:3000).
Dein Datenverzeichnis: apps/${agentId}/data/

## Deine Aufgaben
${instructions || `- Verwalte die ${agentName}-Daten in apps/${agentId}/data/context.json
- Beantworte Fragen zum Thema ${agentName}
- Aktualisiere Daten wenn der User es wuenscht`}

## Daten lesen/schreiben

Lesen:
\`\`\`bash
curl -s http://localhost:3000/app/${agentId}/api/context
\`\`\`

Schreiben (triggert automatisch SSE → UI aktualisiert sich):
\`\`\`bash
curl -s -X PUT http://localhost:3000/app/${agentId}/api/context \\
  -H "Content-Type: application/json" \\
  -d '<neues JSON>'
\`\`\`

## Viking Context
Dein Viking-Kontext: viking://agent/${agentId}/
Nutze Viking fuer Langzeit-Erinnerungen und Wissensaufbau.

## Regeln
- Antworte auf Deutsch
- Halte Daten konsistent — die UI zeigt alles live an
- Nach Aenderungen immer die API nutzen (nicht direkt Dateien schreiben), damit SSE funktioniert
`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);

        // 7. Register in apps.json
        try {
          const appsFile = path.join(ROOT, 'data', 'apps.json');
          const appsData = JSON.parse(safeReadJSON(appsFile, { meta: {}, apps: [] }));
          if (!appsData.apps.find(a => a.id === agentId)) {
            appsData.apps.push({
              id: agentId,
              name: agentName,
              icon: icon,
              color: color,
              description: description,
              installed: true,
              position: appsData.apps.length + 1
            });
            fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));
          }
        } catch (e) {
          console.error('[agent-context] apps.json error:', e.message);
        }

        // 8. Register agent in agents.json
        updateAgent('agent-' + agentId, {
          type: 'context',
          model: 'sonnet',
          status: 'idle',
          contextApp: agentId,
          lastActivity: new Date().toISOString()
        });

        // 9. Try to register in Viking (async, don't wait)
        const vikingReq = http.request({
          hostname: 'localhost', port: 1934,
          path: '/api/viking/import-app',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        });
        vikingReq.on('error', () => {}); // Ignore if Viking not running
        vikingReq.write(JSON.stringify({ appId: agentId }));
        vikingReq.end();

        broadcast('dashboard', { type: 'change', file: 'apps.json', time: Date.now() });

        console.log(`[agent-context] Created: ${agentId} (${agentName} ${icon})`);
        jsonRes(res, {
          ok: true,
          agentId: agentId,
          appUrl: `/app/${agentId}/`,
          paths: {
            app: `apps/${agentId}/`,
            data: `apps/${agentId}/data/context.json`,
            schema: `apps/${agentId}/data/schema.json`,
            skill: `.claude/skills/${agentId}/SKILL.md`,
            viking: `viking://agent/${agentId}/`
          }
        });
      } catch (e) {
        console.error('[agent-context] Error:', e);
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // List all agent contexts
  if (url === '/api/agent-contexts' && req.method === 'GET') {
    try {
      const appsFile = path.join(ROOT, 'data', 'apps.json');
      const appsData = JSON.parse(safeReadJSON(appsFile, { meta: {}, apps: [] }));
      const agentsData = readAgents();

      const contexts = appsData.apps.map(app => {
        const appJsonPath = path.join(ROOT, 'apps', app.id, 'app.json');
        let appMeta = {};
        try { appMeta = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')); } catch {}
        const agent = agentsData.agents.find(a => a.id === 'agent-' + app.id || a.contextApp === app.id);
        return {
          id: app.id,
          name: app.name,
          icon: app.icon,
          description: app.description,
          agentManaged: appMeta.agentManaged || false,
          hasData: fs.existsSync(path.join(ROOT, 'apps', app.id, 'data')),
          hasSkill: fs.existsSync(path.join(ROOT, '.claude', 'skills', app.id, 'SKILL.md')),
          hasSchema: fs.existsSync(path.join(ROOT, 'apps', app.id, 'data', 'schema.json')),
          agentStatus: agent ? agent.status : null,
          appUrl: `/app/${app.id}/`
        };
      });
      return jsonRes(res, { ok: true, contexts });
    } catch (e) {
      return jsonRes(res, { ok: false, error: e.message });
    }
  }

  // Upgrade existing app to agent context (add schema + skill + viking)
  if (url === '/api/agent-context/upgrade' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { appId, fields, instructions } = JSON.parse(b);
        const appDir = path.join(ROOT, 'apps', appId);
        if (!fs.existsSync(appDir)) return jsonRes(res, { ok: false, error: 'App not found' });

        // Read app.json for metadata
        let appMeta = {};
        try { appMeta = JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8')); } catch {}
        const agentName = appMeta.name || appId;
        const icon = appMeta.icon || '🤖';

        // Create schema if not exists
        const schemaPath = path.join(appDir, 'data', 'schema.json');
        if (!fs.existsSync(schemaPath) && fields) {
          const schema = { _title: agentName, _icon: icon, _layout: 'auto', ...fields };
          fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
        }

        // Create skill if not exists
        const skillDir = path.join(ROOT, '.claude', 'skills', appId);
        if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
          if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
          // Find data files
          const dataFiles = fs.existsSync(path.join(appDir, 'data'))
            ? fs.readdirSync(path.join(appDir, 'data')).filter(f => f.endsWith('.json') && !f.startsWith('_'))
            : [];
          const primaryData = dataFiles[0] || 'context.json';
          const dataFileName = primaryData.replace('.json', '');

          const skillMd = `---
name: ${appId}
description: ${appMeta.description || agentName + ' Agent'}
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# ${agentName} Agent

Du bist der ${agentName}-Agent fuer PulseOS.
Dein Datenverzeichnis: apps/${appId}/data/

${instructions || `## Aufgaben
- Verwalte die ${agentName}-Daten
- Beantworte Fragen zum Thema ${agentName}`}

## Daten
${dataFiles.map(f => `- apps/${appId}/data/${f}`).join('\n')}

## API
Lesen: \`GET /app/${appId}/api/${dataFileName}\`
Schreiben: \`PUT /app/${appId}/api/${dataFileName}\` (triggert SSE)
`;
          fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
        }

        // Mark as agent-managed
        appMeta.agentManaged = true;
        fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify(appMeta, null, 2));

        // Register agent
        updateAgent('agent-' + appId, {
          type: 'context',
          model: 'sonnet',
          status: 'idle',
          contextApp: appId,
          lastActivity: new Date().toISOString()
        });

        // Import to Viking
        const vikingReq = http.request({
          hostname: 'localhost', port: 1934,
          path: '/api/viking/import-app',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        });
        vikingReq.on('error', () => {});
        vikingReq.write(JSON.stringify({ appId }));
        vikingReq.end();

        console.log(`[agent-context] Upgraded: ${appId}`);
        jsonRes(res, { ok: true, appId, upgraded: true });
      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // --- Viking Bridge Proxy ---
  // Proxies /api/viking/* requests to the Viking bridge server on port 1934
  const VIKING_BRIDGE_PORT = 1934;
  if (url.startsWith('/api/viking/')) {
    const vikingPath = url.replace('/api/viking', '/api/viking');
    const qsParsedV = new URL(req.url, 'http://localhost');

    if (req.method === 'GET') {
      const vikingUrl = `http://localhost:${VIKING_BRIDGE_PORT}${vikingPath}${qsParsedV.search || ''}`;
      http.get(vikingUrl, { timeout: 15000 }, proxyRes => {
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(body);
        });
      }).on('error', e => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Viking Bridge nicht erreichbar. Starte: python3 viking-bridge.py', detail: e.message }));
      }).on('timeout', function() { this.destroy(); });
      return;
    }

    if (req.method === 'POST') {
      return readBody(req, b => {
        const options = {
          hostname: 'localhost',
          port: VIKING_BRIDGE_PORT,
          path: vikingPath + (qsParsedV.search || ''),
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
          timeout: 30000
        };
        const proxyReq = http.request(options, proxyRes => {
          let body = '';
          proxyRes.on('data', c => body += c);
          proxyRes.on('end', () => {
            res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(body);
          });
        });
        proxyReq.on('error', e => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Viking Bridge nicht erreichbar. Starte: python3 viking-bridge.py', detail: e.message }));
        });
        proxyReq.on('timeout', () => { proxyReq.destroy(); });
        proxyReq.write(b);
        proxyReq.end();
      });
    }
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
        broadcast('dashboard', { type: 'app-data-changed', appId: appId, file: apiMatch[1] + '.json', time: Date.now() });
        invalidateAgentContextCache();
        vikingImportApp(appId);
        emitEvent({ type: 'data:changed', source: `app:${appId}`, data: { appId, file: apiMatch[1] + '.json' } });
        jsonRes(res, { ok: true });
      });
    }
  }

  // --- Project Templates API ---
  // ── Context Templates API ──
  const CTX_TPL_FILE = path.join(ROOT, 'data', 'templates', 'context-templates.json');
  const WIDGET_TPL_FILE = path.join(ROOT, 'data', 'templates', 'widget-templates.json');

  // Ensure templates directory exists
  try { fs.mkdirSync(path.join(ROOT, 'data', 'templates'), { recursive: true }); } catch {}

  // POST /api/app-contexts/generate — create context wrappers for existing apps
  if (url === '/api/app-contexts/generate' && req.method === 'POST') {
    const appsFile = path.join(ROOT, 'data', 'apps.json');
    const appsData = JSON.parse(fs.readFileSync(appsFile, 'utf8'));
    const contextDir = path.join(ROOT, 'data', 'contexts');
    const existingContextFiles = fs.readdirSync(contextDir).filter(f => f.startsWith('ctx-') && f.endsWith('.json'));

    // Find which apps already have context wrappers
    const existingAppIds = new Set();
    for (const file of existingContextFiles) {
      try {
        const ctx = JSON.parse(fs.readFileSync(path.join(contextDir, file), 'utf8'));
        for (const w of (ctx.widgets || [])) {
          if (w.type === 'app') {
            const appId = ctx.data?.[w.dataKey]?.appId || w.data?.appId;
            if (appId) existingAppIds.add(appId);
          }
        }
      } catch {}
    }

    let generated = 0, skipped = 0;
    const now = new Date().toISOString();

    // Category groups for optional grouping
    const queryStr = req.url.includes('?') ? req.url.split('?')[1] : '';
    const urlParams = new URLSearchParams(queryStr);
    const doGroup = urlParams.get('group') === 'true';
    const categories = {
      'Spiele': ['tetris', 'flappy', 'doom', 'drumcomputer'],
      'Medien': ['youtube', 'podcast', 'radio', 'camera', 'picviewer', 'imagegen'],
      'Produktivität': ['kanban', 'notes', 'budget', 'calendar', 'tickets', 'diary', 'recipes', 'travel-planner', 'calendar-view'],
      'Tools': ['terminal', 'filebrowser', 'pipette', 'weather', 'whiteboard', 'mindmap', 'alarm', 'eggtimer'],
      'Social': ['chat', 'social-trends', 'news-channels']
    };

    // Create group parent contexts if grouping
    const groupContextIds = {};
    if (doGroup) {
      for (const [catName, _] of Object.entries(categories)) {
        const catId = 'ctx-cat-' + catName.toLowerCase().replace(/[^a-z]/g, '');
        if (!fs.existsSync(path.join(contextDir, catId + '.json'))) {
          const catCtx = {
            id: catId, name: catName, icon: catName === 'Spiele' ? '🎮' : catName === 'Medien' ? '🎬' : catName === 'Produktivität' ? '📋' : catName === 'Tools' ? '🔧' : '🌐',
            color: '#8B5CF6', parentId: null, created: now, updated: now,
            widgets: [], data: {}, chat: [], changelog: [], plan: null, template: null, closedWidgets: [], skills: [], connections: [], system: true
          };
          fs.writeFileSync(path.join(contextDir, catId + '.json'), JSON.stringify(catCtx, null, 2));
        }
        groupContextIds[catName] = 'ctx-cat-' + catName.toLowerCase().replace(/[^a-z]/g, '');
      }
    }

    for (const app of appsData.apps) {
      if (existingAppIds.has(app.id) || app.id === 'projects' || app.id === 'orchestrator') { skipped++; continue; }

      const ctxId = 'ctx-app-' + app.id;
      if (fs.existsSync(path.join(contextDir, ctxId + '.json'))) { skipped++; continue; }

      // Find parent category
      let parentId = null;
      if (doGroup) {
        for (const [catName, ids] of Object.entries(categories)) {
          if (ids.includes(app.id)) { parentId = groupContextIds[catName]; break; }
        }
      }

      const dataKey = 'app-' + app.id;
      const newCtx = {
        id: ctxId, name: app.name || app.id, icon: app.icon || '📱', color: app.color || '#8B5CF6',
        parentId, created: now, updated: now,
        widgets: [{
          id: 'w-app-' + app.id, type: 'app', title: app.name || app.id, size: 'md',
          dataKey, color: app.color || '#8B5CF6', config: {}, data: {},
          zoomLevel: 'L1'
        }],
        data: { [dataKey]: { appId: app.id, status: app.description || '', name: app.name || app.id, icon: app.icon || '📱', description: app.description || '' } },
        chat: [], changelog: [], plan: null, template: null, closedWidgets: [], skills: [], connections: [], system: true
      };
      fs.writeFileSync(path.join(contextDir, ctxId + '.json'), JSON.stringify(newCtx, null, 2));

      // Add contextId to apps.json entry
      app.contextId = ctxId;
      generated++;
    }

    // Save updated apps.json with contextId fields
    fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));
    broadcast('liveos', { type: 'context-change', contextId: 'all', time: Date.now() });

    return jsonRes(res, { ok: true, generated, skipped, total: appsData.apps.length });
  }

  // GET /api/context-templates — list all context templates
  // POST /api/context-templates — create/save a context template
  if (url === '/api/context-templates') {
    if (req.method === 'GET') {
      const data = safeReadJSON(CTX_TPL_FILE, null);
      let templates;
      try { templates = JSON.parse(data); } catch { templates = { templates: getBuiltinContextTemplates() }; }
      if (!templates || !templates.templates) templates = { templates: getBuiltinContextTemplates() };
      return jsonRes(res, templates);
    }
    if (req.method === 'POST') return readBody(req, b => {
      try {
        const { contextId } = JSON.parse(b);
        if (!contextId) return jsonRes(res, { ok: false, error: 'contextId required' });
        const ctxFile = path.join(CTX_DIR, contextId + '.json');
        if (!fs.existsSync(ctxFile)) return jsonRes(res, { ok: false, error: 'Context not found' });
        const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));

        const widgets = (ctx.widgets || []).map(w => ({
          type: w.type, title: w.title, size: w.size || 'md',
          config: w.config || {}, schema: w.schema || null, scope: w.scope || 'local',
          defaultData: ctx.data && ctx.data[w.dataKey] ? JSON.parse(JSON.stringify(ctx.data[w.dataKey])) : {}
        }));

        const tpl = {
          id: 'ctpl-' + Date.now(), name: ctx.name, icon: ctx.icon || '📁', color: ctx.color || '#8B5CF6',
          description: `Template aus Context "${ctx.name}"`, tags: [],
          created: new Date().toISOString(), usageCount: 0, widgets,
          source: 'user'
        };

        let data;
        try { data = JSON.parse(safeReadJSON(CTX_TPL_FILE, '{"templates":[]}')); }
        catch { data = { templates: [] }; }
        data.templates.push(tpl);
        fs.writeFileSync(CTX_TPL_FILE, JSON.stringify(data, null, 2));
        jsonRes(res, { ok: true, id: tpl.id, name: tpl.name });
      } catch (e) { jsonRes(res, { ok: false, error: e.message }); }
    });
  }

  // POST /api/context-from-template — create new context from template
  if (url === '/api/context-from-template' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { templateId, parentId } = JSON.parse(b);
        // Load templates (user + builtin)
        let data;
        try { data = JSON.parse(safeReadJSON(CTX_TPL_FILE, '{"templates":[]}')); }
        catch { data = { templates: [] }; }
        const allTemplates = [...(data.templates || []), ...getBuiltinContextTemplates()];
        const tpl = allTemplates.find(t => t.id === templateId);
        if (!tpl) return jsonRes(res, { ok: false, error: 'Template not found' });

        const ctxId = 'ctx-' + Date.now();
        const ctx = {
          id: ctxId, name: tpl.name, icon: tpl.icon, color: tpl.color,
          parentId: parentId || undefined,
          created: new Date().toISOString(), updated: new Date().toISOString(),
          widgets: [], data: {},
          chat: [{ id: 'msg-sys-' + Date.now(), role: 'system',
            text: `Projekt aus Template "${tpl.name}" erstellt! ${tpl.widgets.length} Widgets sind bereit.`,
            time: new Date().toISOString() }],
          changelog: [], plan: null, template: tpl.id,
          closedWidgets: [], skills: [], connections: []
        };

        for (const tw of tpl.widgets) {
          const wId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          const dataKey = tw.type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
          ctx.widgets.push({
            id: wId, type: tw.type, title: tw.title, size: tw.size || 'md',
            dataKey, color: tpl.color, config: tw.config || {},
            schema: tw.schema || undefined, scope: tw.scope || 'local',
            zoomLevel: 'L1'
          });
          ctx.data[dataKey] = JSON.parse(JSON.stringify(tw.defaultData || {}));
        }

        fs.writeFileSync(path.join(CTX_DIR, ctxId + '.json'), JSON.stringify(ctx, null, 2));
        broadcast('liveos', { type: 'context-change', contextId: ctxId, time: Date.now() });

        // Update usage count
        const userTpl = (data.templates || []).find(t => t.id === templateId);
        if (userTpl) {
          userTpl.usageCount = (userTpl.usageCount || 0) + 1;
          fs.writeFileSync(CTX_TPL_FILE, JSON.stringify(data, null, 2));
        }

        jsonRes(res, { ok: true, contextId: ctxId, name: ctx.name, widgets: ctx.widgets.length });
      } catch (e) { jsonRes(res, { ok: false, error: e.message }); }
    });
  }

  // ── Widget Templates API ──
  // GET /api/widget-templates — list all widget templates
  // POST /api/widget-templates — save a widget as template
  if (url === '/api/widget-templates') {
    if (req.method === 'GET') {
      let data;
      try { data = JSON.parse(safeReadJSON(WIDGET_TPL_FILE, '{"templates":[]}')); }
      catch { data = { templates: [] }; }
      return jsonRes(res, data);
    }
    if (req.method === 'POST') return readBody(req, b => {
      try {
        const { contextId, widgetId } = JSON.parse(b);
        if (!contextId || !widgetId) return jsonRes(res, { ok: false, error: 'contextId and widgetId required' });
        const ctxFile = path.join(CTX_DIR, contextId + '.json');
        if (!fs.existsSync(ctxFile)) return jsonRes(res, { ok: false, error: 'Context not found' });
        const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
        const widget = (ctx.widgets || []).find(w => w.id === widgetId);
        if (!widget) return jsonRes(res, { ok: false, error: 'Widget not found' });

        const tpl = {
          id: 'wtpl-' + Date.now(),
          type: widget.type, title: widget.title, size: widget.size || 'md',
          config: widget.config || {}, schema: widget.schema || null,
          defaultData: ctx.data && ctx.data[widget.dataKey] ? JSON.parse(JSON.stringify(ctx.data[widget.dataKey])) : {},
          created: new Date().toISOString(), usageCount: 0,
          sourceContext: ctx.name
        };

        let data;
        try { data = JSON.parse(safeReadJSON(WIDGET_TPL_FILE, '{"templates":[]}')); }
        catch { data = { templates: [] }; }
        data.templates.push(tpl);
        fs.writeFileSync(WIDGET_TPL_FILE, JSON.stringify(data, null, 2));
        jsonRes(res, { ok: true, id: tpl.id, name: tpl.title });
      } catch (e) { jsonRes(res, { ok: false, error: e.message }); }
    });
  }

  // POST /api/widget-from-template — insert widget template into context
  if (url === '/api/widget-from-template' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { templateId, contextId } = JSON.parse(b);
        let data;
        try { data = JSON.parse(safeReadJSON(WIDGET_TPL_FILE, '{"templates":[]}')); }
        catch { data = { templates: [] }; }
        const tpl = (data.templates || []).find(t => t.id === templateId);
        if (!tpl) return jsonRes(res, { ok: false, error: 'Widget template not found' });

        const ctxFile = path.join(CTX_DIR, contextId + '.json');
        if (!fs.existsSync(ctxFile)) return jsonRes(res, { ok: false, error: 'Context not found' });
        const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));

        const wId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const dataKey = tpl.type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
        if (!ctx.widgets) ctx.widgets = [];
        if (!ctx.data) ctx.data = {};
        ctx.widgets.push({
          id: wId, type: tpl.type, title: tpl.title, size: tpl.size || 'md',
          dataKey, color: ctx.color, config: tpl.config || {},
          schema: tpl.schema || undefined, zoomLevel: 'L1'
        });
        ctx.data[dataKey] = JSON.parse(JSON.stringify(tpl.defaultData || {}));
        ctx.updated = new Date().toISOString();
        fs.writeFileSync(ctxFile, JSON.stringify(ctx, null, 2));
        broadcast('liveos', { type: 'context-change', contextId, time: Date.now() });

        tpl.usageCount = (tpl.usageCount || 0) + 1;
        fs.writeFileSync(WIDGET_TPL_FILE, JSON.stringify(data, null, 2));
        jsonRes(res, { ok: true, widgetId: wId });
      } catch (e) { jsonRes(res, { ok: false, error: e.message }); }
    });
  }

  // Builtin context templates
  function getBuiltinContextTemplates() {
    return [
      {
        id: 'builtin-budget', name: 'Budget-Dashboard', icon: '💰', color: '#22c55e',
        description: 'Einnahmen, Ausgaben und Budget-Ziele tracken',
        tags: ['finanzen', 'tracking'], source: 'builtin', usageCount: 0,
        widgets: [
          { type: 'kpi', title: 'Kontostand', size: 'sm', config: {}, schema: 'metric', defaultData: { value: '0', label: 'Kontostand', unit: '€' } },
          { type: 'kpi', title: 'Monatsbudget', size: 'sm', config: {}, schema: 'metric', defaultData: { value: '2000', label: 'Budget', unit: '€' } },
          { type: 'table', title: 'Ausgaben', size: 'lg', config: { columns: ['Datum', 'Beschreibung', 'Kategorie', 'Betrag'] }, defaultData: { rows: [] } },
          { type: 'progress', title: 'Budget verbraucht', size: 'sm', config: {}, defaultData: { percent: 0, label: 'Budget' } }
        ]
      },
      {
        id: 'builtin-tracker', name: 'Projekt-Tracker', icon: '🎯', color: '#3B82F6',
        description: 'Aufgaben, Meilensteine und Fortschritt verwalten',
        tags: ['projekt', 'tracking'], source: 'builtin', usageCount: 0,
        widgets: [
          { type: 'kanban', title: 'Board', size: 'full', config: {}, defaultData: { columns: [{ id: 'todo', name: 'To Do', items: [] }, { id: 'doing', name: 'In Arbeit', items: [] }, { id: 'done', name: 'Fertig', items: [] }] } },
          { type: 'timeline', title: 'Meilensteine', size: 'lg', config: {}, schema: 'event', defaultData: { items: [] } },
          { type: 'progress', title: 'Gesamtfortschritt', size: 'sm', config: {}, defaultData: { percent: 0, label: 'Projekt' } },
          { type: 'notes', title: 'Notizen', size: 'md', config: {}, defaultData: { text: '' } }
        ]
      },
      {
        id: 'builtin-journal', name: 'Tagebuch', icon: '📔', color: '#ec4899',
        description: 'Tägliche Einträge mit Stimmung und Reflexion',
        tags: ['tagebuch', 'reflexion'], source: 'builtin', usageCount: 0,
        widgets: [
          { type: 'notes', title: 'Heutiger Eintrag', size: 'lg', config: {}, defaultData: { text: '' } },
          { type: 'kpi', title: 'Stimmung', size: 'sm', config: {}, defaultData: { value: '7', label: 'Stimmung', unit: '/10' } },
          { type: 'todo', title: 'Dankbarkeit', size: 'md', config: {}, defaultData: { items: [] } },
          { type: 'timeline', title: 'Highlights', size: 'md', config: {}, schema: 'event', defaultData: { items: [] } }
        ]
      }
    ];
  }

  // Legacy project templates (backwards compatibility)
  if (url === '/api/project-templates') {
    const tplFile = path.join(ROOT, 'apps', 'projects', 'data', 'templates.json');
    if (req.method === 'GET') return jsonRes(res, safeReadJSON(tplFile, { templates: [] }));
  }
  if (url === '/api/project-save-as-template' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { projectId } = JSON.parse(b);
        // Redirect to context template save
        const ctxFile = path.join(CTX_DIR, projectId + '.json');
        if (fs.existsSync(ctxFile)) {
          // Forward to context template system
          const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
          const widgets = (ctx.widgets || []).map(w => ({
            type: w.type, title: w.title, size: w.size || 'md',
            config: w.config || {}, schema: w.schema || null,
            defaultData: ctx.data && ctx.data[w.dataKey] ? JSON.parse(JSON.stringify(ctx.data[w.dataKey])) : {}
          }));
          const tpl = {
            id: 'ctpl-' + Date.now(), name: ctx.name, icon: ctx.icon || '📁', color: ctx.color || '#8B5CF6',
            description: `Template aus Context "${ctx.name}"`, tags: [],
            created: new Date().toISOString(), usageCount: 0, widgets, source: 'user'
          };
          let data;
          try { data = JSON.parse(safeReadJSON(CTX_TPL_FILE, '{"templates":[]}')); }
          catch { data = { templates: [] }; }
          data.templates.push(tpl);
          fs.writeFileSync(CTX_TPL_FILE, JSON.stringify(data, null, 2));
          return jsonRes(res, { ok: true, id: tpl.id, name: tpl.name });
        }
        jsonRes(res, { ok: false, error: 'Context not found' });
      } catch (e) { jsonRes(res, { ok: false, error: e.message }); }
    });
  }
  if (url === '/api/project-from-template' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { templateId } = JSON.parse(b);
        // Forward to context template system
        let data;
        try { data = JSON.parse(safeReadJSON(CTX_TPL_FILE, '{"templates":[]}')); }
        catch { data = { templates: [] }; }
        const allTemplates = [...(data.templates || []), ...getBuiltinContextTemplates()];
        // Also check legacy templates
        const legacyFile = path.join(ROOT, 'apps', 'projects', 'data', 'templates.json');
        let legacyData;
        try { legacyData = JSON.parse(safeReadJSON(legacyFile, '{"templates":[]}')); } catch { legacyData = { templates: [] }; }
        const combined = [...allTemplates, ...(legacyData.templates || [])];
        const tpl = combined.find(t => t.id === templateId);
        if (!tpl) return jsonRes(res, { ok: false, error: 'Template not found' });

        const ctxId = 'ctx-' + Date.now();
        const ctx = {
          id: ctxId, name: tpl.name, icon: tpl.icon, color: tpl.color,
          created: new Date().toISOString(), updated: new Date().toISOString(),
          widgets: [], data: {},
          chat: [{ id: 'msg-sys-' + Date.now(), role: 'system',
            text: `Projekt aus Template "${tpl.name}" erstellt!`,
            time: new Date().toISOString() }],
          changelog: [], plan: null, template: tpl.id,
          closedWidgets: [], skills: [], connections: []
        };
        for (const tw of tpl.widgets) {
          const wId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          const dataKey = tw.type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
          ctx.widgets.push({ id: wId, type: tw.type, title: tw.title, size: tw.size || 'md', dataKey, color: tpl.color, config: tw.config || {}, zoomLevel: 'L1' });
          ctx.data[dataKey] = JSON.parse(JSON.stringify(tw.defaultData || {}));
        }
        fs.writeFileSync(path.join(CTX_DIR, ctxId + '.json'), JSON.stringify(ctx, null, 2));
        broadcast('liveos', { type: 'context-change', contextId: ctxId, time: Date.now() });
        jsonRes(res, { ok: true, projectId: ctxId, name: ctx.name, widgets: ctx.widgets.length });
      } catch (e) { jsonRes(res, { ok: false, error: e.message }); }
    });
  }

  // --- Project Chat AI: spawns claude -p with project context for intelligent widget management ---
  if (url === '/api/project-chat' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { projectId, text } = JSON.parse(b);
        if (!projectId || !text) return jsonRes(res, { ok: false, error: 'projectId and text required' });

        // Read current project state
        const projFile = path.join(ROOT, 'apps', 'projects', 'data', 'projects.json');
        const projData = JSON.parse(safeReadJSON(projFile, { projects: [] }));
        const project = projData.projects.find(p => p.id === projectId);
        if (!project) return jsonRes(res, { ok: false, error: 'Project not found' });

        // Build context for Claude — include actual widget data so agent sees user changes
        const widgetTypes = ['todo', 'notes', 'table', 'timeline', 'kanban', 'kpi', 'links', 'progress'];
        const existingWidgets = project.canvas.widgets.map(w => {
          // project.data[dataKey] has user edits, w.data is initial state — prefer project.data
          const data = project.data[w.dataKey] || w.data || {};
          const dataStr = JSON.stringify(data).slice(0, 800);
          const configStr = w.config ? ` config: ${JSON.stringify(w.config)}` : '';
          return `${w.type}: "${w.title}" (dataKey: ${w.dataKey}, size: ${w.size || 'md'}${configStr})\n    Aktueller Inhalt: ${dataStr}`;
        }).join('\n  ');
        const recentChat = project.chat.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');

        // Include changelog so agent sees what user changed
        const changelog = (project.changelog || []).slice(-15).map(c => `[${c.time}] ${c.summary}`).join('\n');

        // Build cross-project widget library so AI knows all widgets across all projects
        const otherProjects = projData.projects.filter(p => p.id !== projectId);
        let widgetLibrary = '';
        if (otherProjects.length > 0) {
          const libraryEntries = [];
          for (const op of otherProjects) {
            if (!op.canvas || !op.canvas.widgets || op.canvas.widgets.length === 0) continue;
            const widgets = op.canvas.widgets.map(w => {
              const data = op.data[w.dataKey] || w.data || {};
              const dataStr = JSON.stringify(data).slice(0, 400);
              const configStr = w.config ? ` config: ${JSON.stringify(w.config)}` : '';
              return `    - ${w.type}: "${w.title}" (size: ${w.size || 'md'}${configStr}) → ${dataStr}`;
            }).join('\n');
            libraryEntries.push(`  Projekt "${op.name}":\n${widgets}`);
          }
          if (libraryEntries.length > 0) {
            widgetLibrary = libraryEntries.join('\n');
          }
        }

        const prompt = `Du bist der Projekt-Agent fuer PulseOS. Der User arbeitet am Projekt "${project.name}".

WICHTIG: Antworte NUR mit einem JSON-Objekt, kein anderer Text davor oder danach. Das JSON muss diese Struktur haben:
{
  "text": "Deine Antwort an den User (deutsch, freundlich, kompakt)",
  "widgets": [
    {
      "action": "create",
      "type": "todo|notes|table|timeline|kanban|kpi|links|progress|app",
      "title": "Widget-Titel",
      "size": "sm|md|lg|full",
      "data": { ... passende Daten fuer den Widget-Typ ... },
      "detail": "Kurze Beschreibung was erstellt wurde und warum"
    }
  ],
  "updates": [
    {
      "action": "update",
      "dataKey": "existierender-dataKey",
      "data": { ... aktualisierte Daten ... },
      "title": "optional: neuer Titel",
      "size": "optional: sm|md|lg|full",
      "type": "optional: neuer Widget-Typ",
      "config": { "optional": "neue Config z.B. columns" },
      "color": "optional: neue Farbe",
      "detail": "Kurze Beschreibung was geaendert wurde (z.B. '3 neue Zeilen hinzugefuegt', 'Typ von Kanban zu Tabelle geaendert')"
    }
  ]
}

Widget-Datenformate:
- todo: { "items": [{ "id": "t-1", "text": "Aufgabe", "done": false, "priority": "high|medium|low" }] }
- notes: { "text": "Notiz-Inhalt" }
- table: { "rows": [{ "spalte1": "wert1", "spalte2": "wert2" }] }, config: { "columns": ["spalte1", "spalte2"] }
- timeline: { "items": [{ "title": "Event", "description": "...", "time": "...", "color": "#hex" }] }
- kanban: { "columns": [{ "id": "col1", "name": "Name", "items": [{ "text": "Task" }] }] }
- kpi: { "value": "42", "label": "Metrik-Name", "change": 5.2 }
- links: { "links": [{ "title": "Name", "url": "https://...", "icon": "emoji" }] }
- progress: { "percent": 75, "label": "Fortschritt-Name" }
- app: { "appId": "app-id", "status": "Status-Text", "name": "App Name", "icon": "emoji" }

Bestehendes Projekt:
  Name: ${project.name}

  Aktuelle Widgets mit ihrem AKTUELLEN Inhalt (vom User bearbeitet):
  ${existingWidgets || 'keine'}

${widgetLibrary ? `Widget-Bibliothek aus anderen Projekten (kannst du als Vorlage/Inspiration verwenden oder Varianten davon erstellen):
${widgetLibrary}` : ''}

${changelog ? `Aenderungs-Log (was der User zuletzt an den Widgets geaendert hat):
${changelog}` : ''}

Letzte Chat-Nachrichten:
${recentChat}

Neue Nachricht vom User: ${text}

Regeln:
- WICHTIG: Du SIEHST den aktuellen Widget-Inhalt oben! Wenn der User fragt "was habe ich geaendert", schau ins Aenderungs-Log und in die aktuellen Widget-Daten!
- Beziehe dich IMMER auf die tatsaechlichen Daten in den Widgets wenn der User danach fragt
- ERSTELLE neue Widgets NUR wenn der User etwas NEUES braucht das noch nicht existiert
- KRITISCH: Wenn ein Widget mit aehnlichem Thema BEREITS EXISTIERT, erstelle KEIN neues! Nutze stattdessen "updates" mit dem bestehenden dataKey um es zu aktualisieren!
- Befuelle Widgets mit sinnvollen Daten basierend auf dem Kontext
- Wenn der User etwas beschreibt (z.B. eine Reise), erstelle passende Widgets MIT Inhalten
- Du kannst mehrere Widgets gleichzeitig erstellen wenn ALLE neu sind
- Aktualisiere bestehende Widgets ueber "updates" wenn der User Aenderungen will. Du kannst dabei ALLES aendern: data, title, size, type, config, color
- KRITISCH: Wenn der User sagt "aendere X", "mache es Y", "ersetze Z", "nur vegetarisch", "entferne A" oder aehnliches, MUSST du IMMER ein update-Objekt mit den KOMPLETT NEUEN DATEN senden! Sage NIEMALS nur im Text dass etwas geaendert wurde ohne die Daten tatsaechlich im updates-Array zu aendern! Der User sieht die Widget-Daten in der UI, nicht deinen Text!
- WICHTIG bei Typ-Wechsel: Wenn du den Widget-Typ aenderst (z.B. kanban→table), MUSST du im update-Objekt IMMER "type", "config" UND "data" mitschicken! Beispiel: {"dataKey":"x","type":"table","config":{"columns":["A","B"]},"data":{"rows":[{"A":"1","B":"2"}]}}
- Bei Widget-Bearbeitungsbefehlen (markiert mit [Widget-Bearbeitung:]): aendere das spezifische Widget ueber updates mit dem angegebenen dataKey
- Du kennst ALLE Widgets aus ALLEN Projekten (siehe Widget-Bibliothek oben). Wenn der User nach vorhandenen Widgets fragt oder aehnliche Widgets will, nutze diese als Vorlage. Du kannst Varianten erstellen (z.B. kompakter, als Kanban statt Tabelle, etc.)
- Antworte immer auf Deutsch
- Antworte NUR mit dem JSON, nichts anderes`;

        // Spawn claude -p
        const proc = spawn('claude', ['-p', '--output-format', 'json'], {
          cwd: ROOT,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        proc.stdin.write(prompt);
        proc.stdin.end();

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
        proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

        // Timeout after 60s
        const timeout = setTimeout(() => {
          proc.kill('SIGTERM');
        }, 60000);

        proc.on('close', (code) => {
          clearTimeout(timeout);

          if (code !== 0 || !stdout.trim()) {
            console.error('[project-chat] claude -p failed. code:', code, 'stderr:', stderr.slice(0, 500), 'stdout:', stdout.slice(0, 200));
            return jsonRes(res, {
              ok: true,
              text: stderr ? `Agent-Fehler: ${stderr.slice(0, 200)}` : 'Der Agent konnte nicht gestartet werden. Ist claude CLI installiert?',
              widgetActions: [], widgetsCreated: 0, widgetsUpdated: 0
            });
          }

          try {
            // Parse claude response — extract JSON from the output
            let parsed;
            try {
              // --output-format json wraps in { result: "..." }
              const envelope = JSON.parse(stdout);
              const resultText = envelope.result || envelope.content || stdout;
              // Find the outermost JSON object in the result
              // Use bracket counting for reliable extraction
              let depth = 0, start = -1, end = -1;
              for (let i = 0; i < resultText.length; i++) {
                if (resultText[i] === '{') { if (depth === 0) start = i; depth++; }
                else if (resultText[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
              }
              if (start >= 0 && end > start) {
                parsed = JSON.parse(resultText.slice(start, end));
              } else {
                parsed = { text: resultText, widgets: [], updates: [] };
              }
            } catch (innerErr) {
              console.error('[project-chat] Inner parse error:', innerErr.message);
              // Try direct parse from raw stdout
              let depth = 0, start = -1, end = -1;
              for (let i = 0; i < stdout.length; i++) {
                if (stdout[i] === '{') { if (depth === 0) start = i; depth++; }
                else if (stdout[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
              }
              if (start >= 0 && end > start) {
                parsed = JSON.parse(stdout.slice(start, end));
              } else {
                parsed = { text: stdout.trim() || 'Ich konnte die Anfrage nicht verarbeiten.', widgets: [], updates: [] };
              }
            }

            // Apply widget creates
            const widgetActions = [];
            if (parsed.widgets && Array.isArray(parsed.widgets)) {
              for (const w of parsed.widgets) {
                if (w.action === 'create' && w.type) {
                  const widgetId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                  const dataKey = w.type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
                  const widget = {
                    id: widgetId,
                    type: w.type,
                    title: w.title || w.type,
                    size: w.size || 'md',
                    dataKey,
                    color: w.color || project.color,
                    config: w.config || {},
                    data: w.data || {}
                  };
                  project.canvas.widgets.push(widget);
                  // Store data in project.data
                  if (w.data) {
                    project.data[dataKey] = w.data.items || w.data.columns || w.data.rows || w.data.links || w.data;
                  }
                  const icons = { todo: '✅', notes: '📝', table: '📊', timeline: '⏱️', kpi: '📈', kanban: '📋', links: '🔗', progress: '📉' };
                  widgetActions.push({ icon: icons[w.type] || '🧩', label: `${w.title || w.type} erstellt`, widgetId, dataKey, action: 'create', detail: w.detail || `Neues ${w.type}-Widget "${w.title}" erstellt` });
                }
              }
            }

            // Apply widget updates (data AND widget properties)
            if (parsed.updates && Array.isArray(parsed.updates)) {
              for (const u of parsed.updates) {
                if (u.dataKey) {
                  // Update data if provided
                  if (u.data) {
                    project.data[u.dataKey] = u.data.items || u.data.columns || u.data.rows || u.data.links || u.data;
                  }
                  // Update widget properties if provided
                  const widget = project.canvas.widgets.find(w => w.dataKey === u.dataKey);
                  if (widget) {
                    if (u.title) widget.title = u.title;
                    if (u.size) widget.size = u.size;
                    if (u.type) widget.type = u.type;
                    if (u.config) widget.config = u.config;
                    if (u.color) widget.color = u.color;
                  }
                  const changes = [];
                  if (u.title) changes.push(`Titel → "${u.title}"`);
                  if (u.type) changes.push(`Typ → ${u.type}`);
                  if (u.size) changes.push(`Groesse → ${u.size}`);
                  if (u.config) changes.push('Config aktualisiert');
                  if (u.data) changes.push('Daten aktualisiert');
                  if (u.color) changes.push(`Farbe → ${u.color}`);
                  widgetActions.push({ icon: '✏️', label: `${widget?.title || 'Widget'} aktualisiert`, widgetId: widget?.id, dataKey: u.dataKey, action: 'update', detail: u.detail || changes.join(', ') || 'Widget aktualisiert' });
                }
              }
            }

            // Save updated project
            project.updated = new Date().toISOString();
            fs.writeFileSync(projFile, JSON.stringify(projData, null, 2));
            broadcast('projects', { type: 'change', file: 'projects.json', time: Date.now() });

            emitEvent({ type: 'chat:message', source: 'project-agent', data: { projectId, text: parsed.text?.slice(0, 100) } });

            jsonRes(res, {
              ok: true,
              text: parsed.text || 'Fertig!',
              widgetActions,
              widgetsCreated: (parsed.widgets || []).length,
              widgetsUpdated: (parsed.updates || []).length
            });

          } catch (e) {
            console.error('[project-chat] Parse error:', e.message, 'stdout:', stdout.slice(0, 200));
            jsonRes(res, {
              ok: true,
              text: 'Ich habe die Anfrage bearbeitet, konnte aber die Antwort nicht strukturiert parsen. Versuch es nochmal!',
              widgetActions: [],
              widgetsCreated: 0,
              widgetsUpdated: 0
            });
          }
        });

        proc.on('error', (e) => {
          clearTimeout(timeout);
          jsonRes(res, { ok: false, error: 'Agent error: ' + e.message });
        });

      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // ── Context Search (Phase 5 — search across contexts via Viking) ──
  if (url === '/api/context-search' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { query, limit } = JSON.parse(b);
        if (!query) return jsonRes(res, { ok: false, error: 'query required' });

        // Try Viking search first
        const searchData = JSON.stringify({ query, target_uri: 'viking://resources/contexts/', limit: limit || 10 });
        const vikingReq = http.request({
          hostname: 'localhost', port: 1934, path: '/api/viking/search',
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(searchData) },
          timeout: 3000
        }, vikingRes => {
          let body = '';
          vikingRes.on('data', c => { body += c; });
          vikingRes.on('end', () => {
            try {
              const vikingResult = JSON.parse(body);
              if (vikingResult.ok && vikingResult.results && vikingResult.results.length > 0) {
                // Enrich results with context metadata
                const enriched = vikingResult.results.map(r => {
                  const uriMatch = (r.uri || '').match(/contexts\/([a-z0-9_-]+)/);
                  const ctxId = uriMatch ? uriMatch[1] : null;
                  let ctx = null;
                  if (ctxId) {
                    const ctxFile = path.join(ROOT, 'data', 'contexts', ctxId + '.json');
                    if (fs.existsSync(ctxFile)) {
                      try {
                        const full = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
                        ctx = { id: full.id, name: full.name, icon: full.icon, color: full.color, widgetCount: (full.widgets || []).length };
                      } catch {}
                    }
                  }
                  return { ...r, context: ctx };
                }).filter(r => r.context);
                return jsonRes(res, { ok: true, source: 'viking', results: enriched });
              }
              // Viking returned no results, fall through to local search
              localContextSearch(query, limit || 10, res);
            } catch {
              localContextSearch(query, limit || 10, res);
            }
          });
        });
        vikingReq.on('error', () => { localContextSearch(query, limit || 10, res); });
        vikingReq.on('timeout', () => { vikingReq.destroy(); localContextSearch(query, limit || 10, res); });
        vikingReq.write(searchData);
        vikingReq.end();

      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // Local fallback search across context files
  function localContextSearch(query, limit, res) {
    try {
      const contextDir = path.join(ROOT, 'data', 'contexts');
      if (!fs.existsSync(contextDir)) return jsonRes(res, { ok: true, source: 'local', results: [] });
      const files = fs.readdirSync(contextDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
      const queryLower = query.toLowerCase();
      const results = [];
      for (const f of files) {
        try {
          const ctx = JSON.parse(fs.readFileSync(path.join(contextDir, f), 'utf8'));
          // Search in name, widget titles, and data
          const searchable = [
            ctx.name || '',
            ...(ctx.widgets || []).map(w => w.title || ''),
            ...(ctx.changelog || []).map(c => c.summary || ''),
            JSON.stringify(ctx.data || {}).slice(0, 2000)
          ].join(' ').toLowerCase();
          if (searchable.includes(queryLower)) {
            const widgetSummaries = (ctx.widgets || []).map(w => w.title).join(', ');
            results.push({
              uri: `viking://resources/contexts/${ctx.id}`,
              name: ctx.name,
              abstract: `${ctx.icon || ''} ${ctx.name} | ${(ctx.widgets||[]).length} Widgets: ${widgetSummaries}`,
              score: searchable.split(queryLower).length - 1,
              context: { id: ctx.id, name: ctx.name, icon: ctx.icon, color: ctx.color, widgetCount: (ctx.widgets || []).length }
            });
          }
        } catch {}
      }
      results.sort((a, b) => b.score - a.score);
      jsonRes(res, { ok: true, source: 'local', results: results.slice(0, limit) });
    } catch (e) {
      jsonRes(res, { ok: false, error: e.message, results: [] });
    }
  }

  // ── Context Chat (Phase 4 — works with context files instead of projects.json) ──
  if (url === '/api/context-chat' && req.method === 'POST') {
    return readBody(req, async b => {
      try {
        const { contextId, text } = JSON.parse(b);
        if (!contextId || !text) return jsonRes(res, { ok: false, error: 'contextId and text required' });

        // Read current context
        const ctxFile = path.join(ROOT, 'data', 'contexts', contextId + '.json');
        if (!fs.existsSync(ctxFile)) return jsonRes(res, { ok: false, error: 'Context not found' });
        const context = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));

        // Build context for Claude — include actual widget data
        const existingWidgets = (context.widgets || []).map(w => {
          const data = (context.data && context.data[w.dataKey]) || w.data || {};
          const dataStr = JSON.stringify(data).slice(0, 800);
          const configStr = w.config ? ` config: ${JSON.stringify(w.config)}` : '';
          const scopeStr = w.scope ? ` scope: ${w.scope}` : '';
          // For app widgets, include recent interactions
          let interactionHint = '';
          if (w.type === 'app' && data.interactions && Array.isArray(data.interactions)) {
            const recent = data.interactions.slice(-5);
            if (recent.length > 0) {
              interactionHint = `\n    Letzte Interaktionen: ${recent.map(i => `[${i.time}] ${i.action}: ${i.detail || ''}`).join(', ')}`;
            }
          }
          return `${w.type}: "${w.title}" (dataKey: ${w.dataKey}, size: ${w.size || 'md'}${configStr}${scopeStr})\n    Aktueller Inhalt: ${dataStr}${interactionHint}`;
        }).join('\n  ');
        const recentChat = (context.chat || []).slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
        const changelog = (context.changelog || []).slice(-15).map(c => `[${c.time}] ${c.summary}`).join('\n');

        // Build cross-context widget library from ALL context files
        const contextDir = path.join(ROOT, 'data', 'contexts');
        let allContexts = [];
        try {
          allContexts = fs.readdirSync(contextDir)
            .filter(f => f.endsWith('.json'))
            .map(f => { try { return JSON.parse(fs.readFileSync(path.join(contextDir, f), 'utf8')); } catch { return null; } })
            .filter(Boolean);
        } catch {}

        const otherContexts = allContexts.filter(c => c.id !== contextId && !c.system);
        let widgetLibrary = '';
        if (otherContexts.length > 0) {
          const libraryEntries = [];
          for (const oc of otherContexts.slice(0, 8)) { // Limit to 8 contexts to keep prompt manageable
            if (!oc.widgets || oc.widgets.length === 0) continue;
            const widgets = oc.widgets.slice(0, 5).map(w => {
              const configStr = w.config ? ` config: ${JSON.stringify(w.config).slice(0, 80)}` : '';
              return `    - ${w.type}: "${w.title}" (size: ${w.size || 'md'}${configStr})`;
            }).join('\n');
            libraryEntries.push(`  Context "${oc.name}":\n${widgets}`);
          }
          if (libraryEntries.length > 0) widgetLibrary = libraryEntries.join('\n');
        }

        // Build context tree text
        function buildTreeText(contexts, parentId, indent) {
          indent = indent || '';
          return contexts
            .filter(c => (c.parentId || null) === parentId)
            .map(c => {
              const marker = c.id === contextId ? ' ← DU BIST HIER' : '';
              const widgets = (c.widgets || []).map(w => w.title).join(', ');
              return `${indent}${c.icon || '📁'} ${c.name} (${c.id})${marker}\n${indent}  Widgets: ${widgets || 'keine'}\n${buildTreeText(contexts, c.id, indent + '  ')}`;
            }).join('');
        }
        const nonSystemContexts = allContexts.filter(c => !c.system);
        const contextTreeText = buildTreeText(nonSystemContexts, null, '  ');

        // Find root context and parent context for homeContext routing
        let rootContextId = contextId;
        let parentContextId = context.parentId || contextId;
        const findRoot = (id) => {
          const c = allContexts.find(x => x.id === id);
          if (c && c.parentId) return findRoot(c.parentId);
          return id;
        };
        rootContextId = findRoot(contextId);

        // Build inherited widgets text (from parent contexts via scope chain)
        let inheritedWidgetsText = 'keine';
        const parentChain = [];
        let walkId = context.parentId;
        while (walkId) {
          const parent = allContexts.find(c => c.id === walkId);
          if (!parent) break;
          parentChain.push(parent);
          walkId = parent.parentId;
        }
        if (parentChain.length > 0) {
          const inherited = [];
          for (const p of parentChain) {
            const pWidgets = (p.widgets || []).filter(w => w.scope !== 'local');
            if (pWidgets.length > 0) {
              inherited.push(...pWidgets.map(w => `${w.type}: "${w.title}" (von ${p.name}, dataKey: ${w.dataKey})`));
            }
          }
          if (inherited.length > 0) inheritedWidgetsText = inherited.join('\n  ');
        }

        // Read schemas
        let schemasText = 'keine';
        try {
          const schemasDir = path.join(ROOT, 'data', 'schemas');
          const schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json'));
          const schemas = schemaFiles.map(f => {
            const s = JSON.parse(fs.readFileSync(path.join(schemasDir, f), 'utf8'));
            return `${s.id}: ${s.label} — Felder: ${Object.keys(s.fields).join(', ')} — Renders: ${s.renders.join(', ')}`;
          }).join('\n  ');
          if (schemas) schemasText = schemas;
        } catch {}

        // Viking search for similar contexts (async, inject into prompt if available)
        let vikingSearchText = '';
        const vikingSearchPromise = new Promise(resolve => {
          try {
            const searchData = JSON.stringify({ query: text, target_uri: 'viking://resources/contexts/', limit: 3 });
            const vReq = http.request({
              hostname: 'localhost', port: 1934, path: '/api/viking/search',
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(searchData) },
              timeout: 1000
            }, vRes => {
              let body = '';
              vRes.on('data', c => { body += c; });
              vRes.on('end', () => {
                try {
                  const r = JSON.parse(body);
                  if (r.ok && r.results && r.results.length > 0) {
                    const relevant = r.results.filter(item => {
                      const uriMatch = (item.uri || '').match(/contexts\/([a-z0-9_-]+)/);
                      return !uriMatch || uriMatch[1] !== contextId;
                    });
                    if (relevant.length > 0) {
                      vikingSearchText = relevant.map(item => `  - ${item.name || item.uri}: ${item.abstract || ''}`).join('\n');
                    }
                  }
                } catch {}
                resolve();
              });
            });
            vReq.on('error', () => resolve());
            vReq.on('timeout', () => { vReq.destroy(); resolve(); });
            vReq.write(searchData);
            vReq.end();
          } catch { resolve(); }
        });

        // Wait briefly for Viking, then build prompt
        const vikingTimeout = new Promise(resolve => setTimeout(resolve, 1200));
        await Promise.race([vikingSearchPromise, vikingTimeout]);

        const prompt = `Du bist der Context-Agent fuer PulseOS. Der User arbeitet im Context "${context.name}" (${contextId}).

WICHTIG: Antworte NUR mit einem JSON-Objekt, kein anderer Text davor oder danach. Das JSON muss diese Struktur haben:
{
  "text": "Deine Antwort an den User (deutsch, freundlich, kompakt)",
  "widgets": [
    {
      "action": "create",
      "type": "todo|notes|table|timeline|kanban|kpi|links|progress|app",
      "title": "Widget-Titel",
      "size": "sm|md|lg|full",
      "data": { ... passende Daten fuer den Widget-Typ ... },
      "detail": "Kurze Beschreibung was erstellt wurde und warum"
    }
  ],
  "updates": [
    {
      "action": "update",
      "dataKey": "existierender-dataKey",
      "data": { ... aktualisierte Daten ... },
      "title": "optional: neuer Titel",
      "size": "optional: sm|md|lg|full",
      "type": "optional: neuer Widget-Typ",
      "config": { "optional": "neue Config z.B. columns" },
      "color": "optional: neue Farbe",
      "detail": "Kurze Beschreibung was geaendert wurde"
    }
  ],
  "actions": [
    {
      "type": "create-subcontext",
      "name": "Unterprojekt-Name",
      "icon": "emoji",
      "color": "#hex"
    },
    {
      "type": "write-data",
      "homeContext": "context-id-wo-daten-hin-sollen",
      "dataKey": "schluessel-name",
      "data": { ... },
      "widgetConfig": { "type": "kpi", "title": "Widget-Titel" }
    },
    {
      "type": "create-app",
      "appId": "kebab-case-name",
      "name": "App-Anzeigename",
      "icon": "emoji",
      "color": "#hex",
      "description": "Was die App tut",
      "html": "<!DOCTYPE html>... vollstaendiger HTML-Code der App ..."
    },
    {
      "type": "create-widget",
      "widgetFileId": "kebab-case-name",
      "name": "Widget-Anzeigename",
      "icon": "emoji",
      "size": "md|lg|full",
      "description": "Was das Widget zeigt",
      "html": "<!DOCTYPE html>... vollstaendiger HTML-Code des Custom Widgets ..."
    },
    {
      "type": "graph-add-node",
      "appId": "app-id-aus-registry",
      "nodeType": "producer|transformer|consumer"
    },
    {
      "type": "graph-connect",
      "fromApp": "producer-app-id",
      "fromOutput": "output-name",
      "toApp": "consumer-app-id",
      "toInput": "input-name"
    },
    {
      "type": "graph-disconnect",
      "fromApp": "app-id",
      "fromOutput": "output-name",
      "toApp": "app-id",
      "toInput": "input-name"
    },
    {
      "type": "graph-run"
    }
  ]
}

Widget-Datenformate:
- todo: { "items": [{ "id": "t-1", "text": "Aufgabe", "done": false, "priority": "high|medium|low" }] }
- notes: { "text": "Notiz-Inhalt" }
- table: { "rows": [{ "spalte1": "wert1", "spalte2": "wert2" }] }, config: { "columns": ["spalte1", "spalte2"] }
- timeline: { "items": [{ "title": "Event", "description": "...", "time": "...", "color": "#hex" }] }
- kanban: { "columns": [{ "id": "col1", "name": "Name", "items": [{ "text": "Task" }] }] }
- kpi: { "value": "42", "label": "Metrik-Name", "change": 5.2 }
- links: { "links": [{ "title": "Name", "url": "https://...", "icon": "emoji" }] }
- progress: { "percent": 75, "label": "Fortschritt-Name" }
- app: { "appId": "app-id", "status": "Live-Status-Text", "name": "App Name", "icon": "emoji" }

${/app|anwendung|programm|spiel|game|tool|baue?\s+(mir|ein|eine)/i.test(text) ? `CREATE-APP Regeln:
Wenn der User eine App erstellen will, nutze die "create-app" Action. Die App MUSS:
- Ein selbststaendiges HTML-File sein (vanilla JS, kein Framework, kein npm)
- Dark-Theme nutzen: bg=#0f172a, text=#f1f5f9, accent=Context-Farbe
- system-ui Font, responsive, <meta charset="UTF-8"> + viewport meta
- Fuer Datenpersistenz: fetch('/app/APP_ID/api/DATANAME') GET/PUT
- PulseOS.reportStatus('status-text') aufrufen fuer Live-Status im Widget
- Unter 500 Zeilen, saubere Struktur, gut kommentiert
- appId: nur [a-z0-9-], max 30 Zeichen, kebab-case
` : ''}
${/chart|graph|kurve|diagramm|visuali|anzeig.*als|zeig.*als|widget.*erstell|custom.*widget|eigenes.*widget/i.test(text) ? `CREATE-WIDGET Regeln:
Wenn der User ein visuelles Widget braucht das ueber die Standard-Typen hinausgeht (Chart, Graph, Kurve, Diagramm, Custom-Visualisierung), nutze die "create-widget" Action. Das Widget MUSS:
- Ein selbststaendiges HTML-File sein (vanilla JS, Canvas/SVG, kein Framework)
- Dark-Theme: bg=#0f172a, text=#f1f5f9, accent=Context-Farbe
- system-ui Font, <meta charset="UTF-8"> + viewport meta
- Responsive: width/height 100% des Containers, kein Scrolling
- Unter 200 Zeilen, fokussiert auf eine Visualisierung
- widgetFileId: nur [a-z0-9-], max 40 Zeichen, kebab-case
- Daten direkt im HTML einbetten (kein API-Call noetig)
- Beispiel: Gewichtskurve, Budget-Chart, Fortschritts-Ring, Kalender-Heatmap, etc.
- BEVORZUGE create-widget gegenueber Standard-Widgets wenn der User explizit Charts/Grafiken/Visualisierungen will
` : ''}
Context-Baum (Hierarchie):
${contextTreeText || '  (nur dieser Context)'}

Geerbte Widgets (von uebergeordneten Contexts, scope: inherited):
  ${inheritedWidgetsText}

Verfuegbare Schemas (nutze diese fuer korrekte Datenformate):
  ${schemasText}

SCHEMA-VALIDIERUNG: Wenn ein Widget das Feld "schema" hat, MUESSEN die Daten exakt dem Schema entsprechen.
- Pflichtfelder (required: true) duerfen nicht leer sein
- Enum-Felder muessen einen der erlaubten Werte haben
- Zahlenfelder muessen Zahlen sein, Boolean-Felder true/false
- Bei neuen Widgets: Setze "schema": "schemaId" wenn ein passendes Schema existiert (task, event, metric, etc.)

Regeln fuer homeContext-Routing (nutze "actions" mit type "write-data"):
- Wenn der User ein persoenliches Attribut eingibt (Gewicht, Alter, Name, Groesse):
  → "write-data" Action mit "homeContext": "${rootContextId}" (Root-Context)
  → Das Widget wird automatisch im Root erstellt UND ein dataRef-Widget im aktuellen Context
- Wenn Daten projekt-uebergreifend relevant sind (Budget, KPIs, Metriken):
  → "write-data" Action mit "homeContext": "${parentContextId}" (naechster Parent)
  → Beispiel: Budget-Widget gehoert zum naechsten Parent der ein Budget-Widget hat
- Wenn Daten nur lokal relevant sind:
  → Erstelle im aktuellen Context (normales "create" Widget, kein write-data noetig)
- WICHTIG: Bei "write-data" wird automatisch ein Referenz-Widget im aktuellen Context erstellt das auf die Quelle zeigt. Du musst KEIN separates Widget erstellen!

App-Graph fuer diesen Context:
${(() => {
  const graph = loadGraph(contextId);
  if (!graph || !graph.nodes || graph.nodes.length === 0) return '  Kein Graph vorhanden. Du kannst einen erstellen mit graph-add-node und graph-connect Actions.';
  const nodes = graph.nodes.map(n => {
    const m = loadManifest(n.appId);
    return '  - ' + (m?.icon || '📦') + ' ' + (m?.name || n.appId) + ' (' + n.nodeType + ') outputs: ' + (m?.outputs || []).map(o => o.name).join(', ') + ' inputs: ' + (m?.inputs || []).map(i => i.name).join(', ');
  }).join('\n');
  const edges = graph.edges.map(e => '  - ' + e.from.appId + '.' + e.from.output + ' → ' + e.to.appId + '.' + e.to.input).join('\n');
  return '  Nodes:\n' + nodes + '\n  Edges:\n' + (edges || '  keine');
})()}

Verfuegbare Apps fuer den Graph (aus App-Registry):
${(() => {
  try {
    const regPath = path.join(ROOT, 'data', 'app-registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    return (reg.apps || []).slice(0, 15).map(a => {
      const m = a.manifest || {};
      return '  - ' + (m.icon || '📦') + ' ' + a.id + ' (' + (m.nodeType || 'app') + ') out: ' + (m.outputs || []).map(o => o.name).join(',') + ' in: ' + (m.inputs || []).map(i => i.name).join(',');
    }).join('\n');
  } catch { return '  (Registry nicht lesbar)'; }
})()}

GRAPH-REGELN:
- Wenn der User "verbinde X mit Y" oder "leite Daten von A nach B" sagt → graph-connect Action
- Wenn der User "fuege X zum Graph hinzu" sagt → graph-add-node Action
- Wenn der User "starte den Graph" oder "fuehre den Graph aus" sagt → graph-run Action
- Wenn der User "trenne X von Y" sagt → graph-disconnect Action
- Du kannst mehrere Graph-Actions in einem Response kombinieren (z.B. add + connect)
- WICHTIG: Nodes muessen erst hinzugefuegt werden BEVOR sie verbunden werden koennen!

Bestehender Context:
  Name: ${context.name}
  ID: ${contextId}
  Parent: ${context.parentId || 'keiner (Root)'}

  Aktuelle Widgets mit ihrem AKTUELLEN Inhalt (vom User bearbeitet):
  ${existingWidgets || 'keine'}

${widgetLibrary ? `Widget-Bibliothek aus anderen Contexts (kannst du als Vorlage/Inspiration verwenden):
${widgetLibrary}` : ''}

${changelog ? `Aenderungs-Log (was der User zuletzt an den Widgets geaendert hat):
${changelog}` : ''}

${vikingSearchText ? `Aehnliche Contexts (aus Viking-Suche, als Referenz/Inspiration):
${vikingSearchText}` : ''}

Letzte Chat-Nachrichten:
${recentChat}

Neue Nachricht vom User: ${text}

Regeln:
- WICHTIG: Du SIEHST den aktuellen Widget-Inhalt oben! Wenn der User fragt "was habe ich geaendert", schau ins Aenderungs-Log und in die aktuellen Widget-Daten!
- Beziehe dich IMMER auf die tatsaechlichen Daten in den Widgets wenn der User danach fragt
- ERSTELLE neue Widgets NUR wenn der User etwas NEUES braucht das noch nicht existiert
- KRITISCH: Wenn ein Widget mit aehnlichem Thema BEREITS EXISTIERT, erstelle KEIN neues! Nutze stattdessen "updates" mit dem bestehenden dataKey um es zu aktualisieren! Beispiel: User hat ein Ernaehrungsplan-Widget und sagt "mache es vegetarisch" → UPDATE das bestehende Widget, erstelle KEIN zweites!
- Befuelle Widgets mit sinnvollen Daten basierend auf dem Kontext
- Wenn der User etwas beschreibt (z.B. eine Reise), erstelle passende Widgets MIT Inhalten
- Du kannst mehrere Widgets gleichzeitig erstellen wenn ALLE neu sind
- Aktualisiere bestehende Widgets ueber "updates" wenn der User Aenderungen will
- KRITISCH: Wenn der User sagt "aendere X", "mache es Y", "ersetze Z", "nur vegetarisch", "entferne A" oder aehnliches, MUSST du IMMER ein update-Objekt mit den KOMPLETT NEUEN DATEN senden! Sage NIEMALS nur im Text dass es geaendert wurde ohne die Daten tatsaechlich zu aendern! Der User sieht die Widget-Daten, nicht deinen Text!
- WICHTIG bei Typ-Wechsel: Wenn du den Widget-Typ aenderst (z.B. kanban→table), MUSST du im update-Objekt IMMER "type", "config" UND "data" mitschicken!
- Bei Widget-Bearbeitungsbefehlen: aendere das spezifische Widget ueber updates mit dem angegebenen dataKey
- Du kennst ALLE Widgets aus ALLEN Contexts (siehe Widget-Bibliothek). Nutze diese als Vorlage wenn passend
- Nutze "actions" fuer context-uebergreifende Operationen (Subcontext erstellen, Daten in anderen Context schreiben)
- Nutze die homeContext-Routing-Regeln um Daten am richtigen Ort zu speichern
- Antworte immer auf Deutsch
- Antworte NUR mit dem JSON, nichts anderes`;

        // Spawn claude -p with haiku for speed
        console.log(`[context-chat] Prompt length: ${prompt.length} chars`);
        const proc = spawn('claude', ['-p', '--output-format', 'json', '--model', 'haiku'], {
          cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe']
        });
        proc.stdin.write(prompt);
        proc.stdin.end();

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
        proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

        const timeout = setTimeout(() => { proc.kill('SIGTERM'); }, 120000);

        proc.on('close', (code) => {
          clearTimeout(timeout);

          if (code !== 0 || !stdout.trim()) {
            console.error('[context-chat] claude -p failed. code:', code, 'stderr:', stderr.slice(0, 500), 'prompt-len:', prompt.length);
            return jsonRes(res, {
              ok: true,
              text: stderr ? `Agent-Fehler: ${stderr.slice(0, 200)}` : 'Der Agent konnte nicht gestartet werden.',
              widgetActions: [], widgetsCreated: 0, widgetsUpdated: 0, actionsExecuted: 0
            });
          }

          try {
            // Parse claude response
            let parsed;
            try {
              const envelope = JSON.parse(stdout);
              const resultText = envelope.result || envelope.content || stdout;
              let depth = 0, start = -1, end = -1;
              for (let i = 0; i < resultText.length; i++) {
                if (resultText[i] === '{') { if (depth === 0) start = i; depth++; }
                else if (resultText[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
              }
              if (start >= 0 && end > start) {
                parsed = JSON.parse(resultText.slice(start, end));
              } else {
                parsed = { text: resultText, widgets: [], updates: [], actions: [] };
              }
            } catch (innerErr) {
              console.error('[context-chat] Inner parse error:', innerErr.message);
              let depth = 0, start = -1, end = -1;
              for (let i = 0; i < stdout.length; i++) {
                if (stdout[i] === '{') { if (depth === 0) start = i; depth++; }
                else if (stdout[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
              }
              if (start >= 0 && end > start) {
                parsed = JSON.parse(stdout.slice(start, end));
              } else {
                parsed = { text: stdout.trim() || 'Ich konnte die Anfrage nicht verarbeiten.', widgets: [], updates: [], actions: [] };
              }
            }

            // Re-read context (may have changed)
            const freshContext = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));

            // Apply widget creates
            const widgetActions = [];
            if (parsed.widgets && Array.isArray(parsed.widgets)) {
              for (const w of parsed.widgets) {
                if (w.action === 'create' && w.type) {
                  const widgetId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                  const dataKey = w.type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
                  const widget = {
                    id: widgetId, type: w.type, title: w.title || w.type,
                    size: w.size || 'md', dataKey, color: w.color || freshContext.color,
                    config: w.config || {}, data: w.data || {},
                    scope: 'local', zoomLevel: 'L1'
                  };
                  if (!freshContext.widgets) freshContext.widgets = [];
                  freshContext.widgets.push(widget);
                  if (!freshContext.data) freshContext.data = {};
                  if (w.data) {
                    freshContext.data[dataKey] = w.data.items || w.data.columns || w.data.rows || w.data.links || w.data;
                  }
                  const icons = { todo: '✅', notes: '📝', table: '📊', timeline: '⏱️', kpi: '📈', kanban: '📋', links: '🔗', progress: '📉' };
                  widgetActions.push({ icon: icons[w.type] || '🧩', label: `${w.title || w.type} erstellt`, widgetId, dataKey, action: 'create', detail: w.detail || `Neues ${w.type}-Widget "${w.title}" erstellt` });
                }
              }
            }

            // Apply widget updates
            if (parsed.updates && Array.isArray(parsed.updates)) {
              for (const u of parsed.updates) {
                if (u.dataKey) {
                  if (!freshContext.data) freshContext.data = {};
                  if (u.data) {
                    freshContext.data[u.dataKey] = u.data.items || u.data.columns || u.data.rows || u.data.links || u.data;
                  }
                  const widget = (freshContext.widgets || []).find(w => w.dataKey === u.dataKey);
                  if (widget) {
                    if (u.title) widget.title = u.title;
                    if (u.size) widget.size = u.size;
                    if (u.type) widget.type = u.type;
                    if (u.config) widget.config = u.config;
                    if (u.color) widget.color = u.color;
                  }
                  const changes = [];
                  if (u.title) changes.push(`Titel → "${u.title}"`);
                  if (u.type) changes.push(`Typ → ${u.type}`);
                  if (u.size) changes.push(`Groesse → ${u.size}`);
                  if (u.config) changes.push('Config aktualisiert');
                  if (u.data) changes.push('Daten aktualisiert');
                  if (u.color) changes.push(`Farbe → ${u.color}`);
                  widgetActions.push({ icon: '✏️', label: `${widget?.title || 'Widget'} aktualisiert`, widgetId: widget?.id, dataKey: u.dataKey, action: 'update', detail: u.detail || changes.join(', ') || 'Widget aktualisiert' });
                }
              }
            }

            // Handle actions (create-subcontext, write-data)
            let actionsExecuted = 0;
            if (parsed.actions && Array.isArray(parsed.actions)) {
              for (const action of parsed.actions) {
                try {
                  if (action.type === 'create-subcontext' && action.name) {
                    const newId = 'ctx-' + Date.now() + Math.random().toString(36).slice(2, 4);
                    const newCtx = {
                      id: newId,
                      name: action.name,
                      icon: action.icon || '📁',
                      color: action.color || freshContext.color,
                      parentId: contextId,
                      created: new Date().toISOString(),
                      updated: new Date().toISOString(),
                      widgets: [],
                      data: {},
                      chat: [{ id: 'msg-1', role: 'system', text: 'Willkommen! Beschreibe was du bauen oder planen willst.', time: new Date().toISOString() }],
                      changelog: [],
                      plan: null, template: null, closedWidgets: [], skills: [], connections: []
                    };
                    fs.writeFileSync(path.join(contextDir, newId + '.json'), JSON.stringify(newCtx, null, 2));
                    widgetActions.push({ icon: '📂', label: `Subcontext "${action.name}" erstellt`, action: 'create-subcontext', contextId: newId });
                    actionsExecuted++;
                  }

                  if (action.type === 'write-data' && action.homeContext && action.dataKey) {
                    const homeFile = path.join(contextDir, action.homeContext + '.json');
                    if (fs.existsSync(homeFile)) {
                      const homeCtx = JSON.parse(fs.readFileSync(homeFile, 'utf8'));
                      if (!homeCtx.data) homeCtx.data = {};
                      homeCtx.data[action.dataKey] = action.data;

                      // Create widget in homeContext if widgetConfig provided
                      if (action.widgetConfig) {
                        if (!homeCtx.widgets) homeCtx.widgets = [];
                        const existsInHome = homeCtx.widgets.some(w => w.dataKey === action.dataKey);
                        if (!existsInHome) {
                          homeCtx.widgets.push({
                            id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                            type: action.widgetConfig.type || 'kpi',
                            title: action.widgetConfig.title || action.dataKey,
                            size: action.widgetConfig.size || 'sm',
                            dataKey: action.dataKey,
                            color: homeCtx.color,
                            config: action.widgetConfig.config || {},
                            data: action.data,
                            scope: 'inherited',
                            zoomLevel: 'L1'
                          });
                        }
                      }

                      homeCtx.updated = new Date().toISOString();
                      fs.writeFileSync(homeFile, JSON.stringify(homeCtx, null, 2));
                      broadcast('liveos', { type: 'context-change', contextId: action.homeContext, time: Date.now() });

                      // Create a dataRef widget in current context pointing to homeContext
                      if (!freshContext.widgets) freshContext.widgets = [];
                      const refWidgetId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                      freshContext.widgets.push({
                        id: refWidgetId,
                        type: action.widgetConfig?.type || 'kpi',
                        title: action.widgetConfig?.title || action.dataKey,
                        size: action.widgetConfig?.size || 'sm',
                        dataKey: action.dataKey,
                        color: freshContext.color,
                        config: action.widgetConfig?.config || {},
                        data: {},
                        dataRef: { contextId: action.homeContext, dataKey: action.dataKey },
                        zoomLevel: 'L1'
                      });

                      // Notify dataRef subscribers about the new data
                      notifyDataRefSubscribers(action.homeContext, action.dataKey);

                      widgetActions.push({ icon: '🏠', label: `Daten in ${action.homeContext} gespeichert`, action: 'write-data', dataKey: action.dataKey, homeContext: action.homeContext });
                      actionsExecuted++;
                    }
                  }

                  // CREATE-APP: AI creates a new PulseOS app
                  if (action.type === 'create-app' && action.appId && action.html) {
                    const appId = action.appId.replace(/[^a-z0-9-]/g, '').slice(0, 30);
                    const appsFile = path.join(ROOT, 'data', 'apps.json');
                    const appsData = JSON.parse(fs.readFileSync(appsFile, 'utf8'));
                    const exists = appsData.apps.some(a => a.id === appId) || fs.existsSync(path.join(ROOT, 'apps', appId));

                    if (!exists && action.html.length < 102400) {
                      // 1. Create app directory + HTML
                      const appDir = path.join(ROOT, 'apps', appId);
                      fs.mkdirSync(appDir, { recursive: true });
                      fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });
                      fs.writeFileSync(path.join(appDir, 'index.html'), action.html);

                      // 2. Write app.json metadata
                      fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
                        name: action.name || appId,
                        icon: action.icon || '📱',
                        color: action.color || freshContext.color,
                        description: action.description || '',
                        agentManaged: false
                      }, null, 2));

                      // 3. Register in apps.json
                      appsData.apps.push({
                        id: appId,
                        name: action.name || appId,
                        icon: action.icon || '📱',
                        color: action.color || freshContext.color,
                        description: action.description || '',
                        installed: true,
                        position: appsData.apps.length + 1
                      });
                      fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2));

                      // 4. Create app widget in current context
                      const appWidgetId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                      const appDataKey = 'app-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
                      freshContext.widgets.push({
                        id: appWidgetId,
                        type: 'app',
                        title: action.name || appId,
                        size: 'md',
                        dataKey: appDataKey,
                        color: action.color || freshContext.color,
                        config: {},
                        data: { appId, status: 'Neu erstellt', name: action.name || appId, icon: action.icon || '📱', description: action.description || '' },
                        zoomLevel: 'L1'
                      });
                      freshContext.data[appDataKey] = { appId, status: 'Neu erstellt', name: action.name || appId, icon: action.icon || '📱', description: action.description || '' };

                      // 5. Broadcast to dashboard
                      broadcast('dashboard', { type: 'change', file: 'apps.json', time: Date.now() });

                      widgetActions.push({ icon: '📱', label: `App "${action.name || appId}" erstellt`, action: 'create-app', appId });
                      actionsExecuted++;
                    } else {
                      widgetActions.push({ icon: '⚠️', label: `App "${appId}" existiert bereits oder ist zu gross`, action: 'create-app-error' });
                    }
                  }

                  // GRAPH-ADD-NODE: Add app to this context's graph
                  if (action.type === 'graph-add-node' && action.appId) {
                    let graph = loadGraph(contextId) || { projectId: contextId, nodes: [], edges: [] };
                    if (!graph.nodes.some(n => n.appId === action.appId)) {
                      const cols = 3, gapX = 220, gapY = 160;
                      const idx = graph.nodes.length;
                      graph.nodes.push({
                        appId: action.appId,
                        nodeType: action.nodeType || 'consumer',
                        x: 60 + (idx % cols) * gapX,
                        y: 60 + Math.floor(idx / cols) * gapY
                      });
                      saveGraph(contextId, graph);
                      broadcast(contextId, { type: 'graph-updated', time: Date.now() });
                      widgetActions.push({ icon: '🔗', label: `${action.appId} zum Graph hinzugefuegt`, action: 'graph-add-node' });
                      actionsExecuted++;
                    }
                  }

                  // GRAPH-CONNECT: Connect two apps in the graph
                  if (action.type === 'graph-connect' && action.fromApp && action.toApp) {
                    let graph = loadGraph(contextId) || { projectId: contextId, nodes: [], edges: [] };
                    const edge = {
                      from: { appId: action.fromApp, output: action.fromOutput || 'output' },
                      to: { appId: action.toApp, input: action.toInput || 'data' }
                    };
                    const exists = graph.edges.some(e =>
                      e.from.appId === edge.from.appId && e.from.output === edge.from.output &&
                      e.to.appId === edge.to.appId && e.to.input === edge.to.input
                    );
                    if (!exists) {
                      graph.edges.push(edge);
                      saveGraph(contextId, graph);
                      broadcast(contextId, { type: 'graph-updated', time: Date.now() });
                      widgetActions.push({ icon: '🔗', label: `${action.fromApp} → ${action.toApp} verbunden`, action: 'graph-connect' });
                      actionsExecuted++;
                    }
                  }

                  // GRAPH-DISCONNECT: Remove edge between apps
                  if (action.type === 'graph-disconnect' && action.fromApp && action.toApp) {
                    let graph = loadGraph(contextId);
                    if (graph) {
                      graph.edges = graph.edges.filter(e =>
                        !(e.from.appId === action.fromApp && e.to.appId === action.toApp &&
                          (!action.fromOutput || e.from.output === action.fromOutput) &&
                          (!action.toInput || e.to.input === action.toInput))
                      );
                      saveGraph(contextId, graph);
                      broadcast(contextId, { type: 'graph-updated', time: Date.now() });
                      widgetActions.push({ icon: '✂️', label: `${action.fromApp} ↛ ${action.toApp} getrennt`, action: 'graph-disconnect' });
                      actionsExecuted++;
                    }
                  }

                  // GRAPH-RUN: Trigger all producers in this context's graph
                  if (action.type === 'graph-run') {
                    const graph = loadGraph(contextId);
                    if (graph && graph.nodes) {
                      const producers = graph.nodes.filter(n => n.nodeType === 'producer');
                      for (const p of producers) {
                        sendInputToApp(p.appId, '__pulse', { type: 'manual', projectId: contextId, timestamp: Date.now() })
                          .catch(err => console.error('[graph-run] pulse error:', p.appId, err.message));
                      }
                      broadcast(contextId, { type: 'graph-run', time: Date.now() });
                      widgetActions.push({ icon: '▶️', label: `Graph gestartet (${producers.length} Producer)`, action: 'graph-run' });
                      actionsExecuted++;
                    }
                  }

                  // CREATE-WIDGET: AI creates a custom HTML widget
                  if (action.type === 'create-widget' && action.widgetFileId && action.html) {
                    const wfId = action.widgetFileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
                    if (action.html.length < 51200) {
                      // 1. Save HTML file in context directory
                      const ctxDir = path.join(CTX_DIR, contextId);
                      if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });
                      fs.writeFileSync(path.join(ctxDir, wfId + '.html'), action.html);

                      // 2. Create custom widget in context
                      const cwId = 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                      const cwDataKey = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
                      const cwData = {
                        widgetFileId: wfId,
                        name: action.name || wfId,
                        icon: action.icon || '🧩',
                        description: action.description || ''
                      };
                      freshContext.widgets.push({
                        id: cwId, type: 'custom', title: action.name || wfId,
                        size: action.size || 'lg', dataKey: cwDataKey,
                        color: action.color || freshContext.color,
                        config: {}, data: cwData, scope: 'local', zoomLevel: 'L1'
                      });
                      if (!freshContext.data) freshContext.data = {};
                      freshContext.data[cwDataKey] = cwData;

                      widgetActions.push({ icon: '🧩', label: `Custom Widget "${action.name || wfId}" erstellt`, action: 'create-widget', widgetFileId: wfId });
                      actionsExecuted++;
                    } else {
                      widgetActions.push({ icon: '⚠️', label: `Widget "${wfId}" zu gross (max 50KB)`, action: 'create-widget-error' });
                    }
                  }
                } catch (actionErr) {
                  console.error('[context-chat] Action error:', actionErr.message);
                }
              }
            }

            // Save updated context
            freshContext.updated = new Date().toISOString();
            fs.writeFileSync(ctxFile, JSON.stringify(freshContext, null, 2));
            broadcast('liveos', { type: 'context-change', contextId, time: Date.now() });
            vikingSyncContextDebounced(contextId);

            emitEvent({ type: 'chat:message', source: 'context-agent', data: { contextId, text: parsed.text?.slice(0, 100) } });

            jsonRes(res, {
              ok: true,
              text: parsed.text || 'Fertig!',
              widgetActions,
              widgetsCreated: (parsed.widgets || []).length,
              widgetsUpdated: (parsed.updates || []).length,
              actionsExecuted
            });

          } catch (e) {
            console.error('[context-chat] Parse error:', e.message, 'stdout:', stdout.slice(0, 200));
            jsonRes(res, {
              ok: true,
              text: 'Ich habe die Anfrage bearbeitet, konnte aber die Antwort nicht strukturiert parsen. Versuch es nochmal!',
              widgetActions: [], widgetsCreated: 0, widgetsUpdated: 0, actionsExecuted: 0
            });
          }
        });

        proc.on('error', (e) => {
          clearTimeout(timeout);
          jsonRes(res, { ok: false, error: 'Agent error: ' + e.message });
        });

      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // ── Project Plan Generator ──
  if (url === '/api/project-plan' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { projectId } = JSON.parse(b);
        if (!projectId) return jsonRes(res, { ok: false, error: 'projectId required' });

        const projFile = path.join(ROOT, 'apps', 'projects', 'data', 'projects.json');
        const projData = JSON.parse(safeReadJSON(projFile, { projects: [] }));
        const project = projData.projects.find(p => p.id === projectId);
        if (!project) return jsonRes(res, { ok: false, error: 'Project not found' });

        // Build context
        const widgets = (project.canvas?.widgets || []).map(w => {
          const data = project.data[w.dataKey] || w.data || {};
          const configStr = w.config ? ` config: ${JSON.stringify(w.config)}` : '';
          return `${w.type}: "${w.title}" (size: ${w.size || 'md'}${configStr})\n  Daten: ${JSON.stringify(data).slice(0, 400)}`;
        }).join('\n');

        const changelog = (project.changelog || []).slice(-10).map(c => `[${c.time}] ${c.summary}`).join('\n');
        const recentChat = project.chat.slice(-5).map(m => `${m.role}: ${m.text.slice(0, 150)}`).join('\n');

        // Subprojects
        const children = projData.projects.filter(p => p.parentId === projectId);
        let subInfo = '';
        if (children.length > 0) {
          subInfo = '\n\nUnterprojekte:\n' + children.map(c => {
            const cWidgets = (c.canvas?.widgets || []).map(w => `${w.type}: "${w.title}"`).join(', ');
            const cPlan = c.plan;
            return `- "${c.name}": ${cWidgets || 'keine Widgets'}${cPlan ? ', Status: ' + cPlan.status : ''}`;
          }).join('\n');
        }

        const prompt = `Analysiere dieses Projekt und erstelle einen Implementierungsplan. Antworte NUR mit einem JSON-Objekt, kein anderer Text:

{
  "status": "Kurzer Status-Text (z.B. 'Phase 2/4', '70% fertig', 'Planung')",
  "phases": [
    {
      "title": "Phasenname",
      "state": "done|active|pending",
      "items": [{ "text": "Aufgabe/Schritt", "done": true }]
    }
  ],
  "summary": "1-2 Saetze Zusammenfassung des aktuellen Stands"
}

Projekt: "${project.name}"

Widgets:
${widgets || 'keine'}

${changelog ? 'Changelog:\n' + changelog : ''}

Chat-Verlauf:
${recentChat}
${subInfo}

Regeln:
- Leite die Phasen aus dem Projektinhalt ab (Widgets, Chat, Daten)
- Markiere erledigte Aufgaben basierend auf vorhandenen Daten und Changelog
- Wenn Widgets bereits Daten enthalten (nicht nur Platzhalter), gelten zugehoerige Aufgaben als erledigt
- Phasen sollen das Projekt logisch strukturieren
- Maximal 5 Phasen mit je 2-5 Items
- Beziehe Unterprojekte in die Bewertung ein
- Antworte NUR mit dem JSON-Objekt`;

        const proc = spawn('claude', ['-p', '--output-format', 'json'], {
          cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe']
        });
        proc.stdin.write(prompt);
        proc.stdin.end();

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
        proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

        proc.on('close', code => {
          if (code !== 0) {
            console.error('[project-plan] claude failed:', stderr.slice(0, 300));
            return jsonRes(res, { ok: false, error: 'AI error' });
          }

          try {
            // Parse claude JSON output
            let aiText = stdout;
            try {
              const outerJson = JSON.parse(stdout);
              aiText = outerJson.result || outerJson.text || outerJson.content || stdout;
            } catch (e) {}

            // Extract JSON object from response
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              return jsonRes(res, { ok: false, error: 'No JSON in response', raw: aiText.slice(0, 300) });
            }

            const plan = JSON.parse(jsonMatch[0]);
            plan.updatedAt = new Date().toISOString();

            // Save plan to project
            project.plan = plan;
            fs.writeFileSync(projFile, JSON.stringify(projData, null, 2));

            jsonRes(res, { ok: true, plan });
          } catch (e) {
            console.error('[project-plan] Parse error:', e.message, 'stdout:', stdout.slice(0, 300));
            jsonRes(res, { ok: false, error: 'Parse error', raw: stdout.slice(0, 300) });
          }
        });
      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
  }

  // ── Context Plan Generator (Phase 4 — works with context files) ──
  if (url === '/api/context-plan' && req.method === 'POST') {
    return readBody(req, b => {
      try {
        const { contextId } = JSON.parse(b);
        if (!contextId) return jsonRes(res, { ok: false, error: 'contextId required' });

        const ctxFile = path.join(ROOT, 'data', 'contexts', contextId + '.json');
        if (!fs.existsSync(ctxFile)) return jsonRes(res, { ok: false, error: 'Context not found' });
        const context = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));

        // Build context
        const widgets = (context.widgets || []).map(w => {
          const data = (context.data && context.data[w.dataKey]) || w.data || {};
          const configStr = w.config ? ` config: ${JSON.stringify(w.config)}` : '';
          return `${w.type}: "${w.title}" (size: ${w.size || 'md'}${configStr})\n  Daten: ${JSON.stringify(data).slice(0, 400)}`;
        }).join('\n');

        const changelog = (context.changelog || []).slice(-10).map(c => `[${c.time}] ${c.summary}`).join('\n');
        const recentChat = (context.chat || []).slice(-5).map(m => `${m.role}: ${m.text.slice(0, 150)}`).join('\n');

        // Subcontexts
        const contextDir = path.join(ROOT, 'data', 'contexts');
        let allContexts = [];
        try {
          allContexts = fs.readdirSync(contextDir)
            .filter(f => f.endsWith('.json'))
            .map(f => { try { return JSON.parse(fs.readFileSync(path.join(contextDir, f), 'utf8')); } catch { return null; } })
            .filter(Boolean);
        } catch {}

        const children = allContexts.filter(c => c.parentId === contextId);
        let subInfo = '';
        if (children.length > 0) {
          subInfo = '\n\nUnter-Contexts:\n' + children.map(c => {
            const cWidgets = (c.widgets || []).map(w => `${w.type}: "${w.title}"`).join(', ');
            const cPlan = c.plan;
            return `- "${c.name}" (${c.id}): ${cWidgets || 'keine Widgets'}${cPlan ? ', Status: ' + cPlan.status : ''}`;
          }).join('\n');
        }

        // Build context tree
        function buildTreeText(contexts, parentId, indent) {
          indent = indent || '';
          return contexts
            .filter(c => (c.parentId || null) === parentId)
            .map(c => {
              const marker = c.id === contextId ? ' ← AKTUELL' : '';
              return `${indent}${c.icon || '📁'} ${c.name} (${c.id})${marker}\n${buildTreeText(contexts, c.id, indent + '  ')}`;
            }).join('');
        }
        const contextTreeText = buildTreeText(allContexts, null, '  ');

        // Read schemas
        let schemasText = '';
        try {
          const schemasDir = path.join(ROOT, 'data', 'schemas');
          const schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json'));
          schemasText = schemaFiles.map(f => {
            const s = JSON.parse(fs.readFileSync(path.join(schemasDir, f), 'utf8'));
            return `${s.id}: ${s.label} — Felder: ${Object.keys(s.fields).join(', ')}`;
          }).join('\n  ');
        } catch {}

        const prompt = `Analysiere diesen Context und erstelle einen Implementierungsplan. Antworte NUR mit einem JSON-Objekt, kein anderer Text:

{
  "status": "Kurzer Status-Text (z.B. 'Phase 2/4', '70% fertig', 'Planung')",
  "phases": [
    {
      "title": "Phasenname",
      "state": "done|active|pending",
      "items": [{ "text": "Aufgabe/Schritt", "done": true }]
    }
  ],
  "summary": "1-2 Saetze Zusammenfassung des aktuellen Stands"
}

Context: "${context.name}" (${contextId})

Context-Baum:
${contextTreeText || '  (nur dieser Context)'}

${schemasText ? 'Verfuegbare Schemas:\n  ' + schemasText : ''}

Widgets:
${widgets || 'keine'}

${changelog ? 'Changelog:\n' + changelog : ''}

Chat-Verlauf:
${recentChat}
${subInfo}

Regeln:
- Leite die Phasen aus dem Context-Inhalt ab (Widgets, Chat, Daten)
- Markiere erledigte Aufgaben basierend auf vorhandenen Daten und Changelog
- Wenn Widgets bereits Daten enthalten (nicht nur Platzhalter), gelten zugehoerige Aufgaben als erledigt
- Phasen sollen das Projekt logisch strukturieren
- Maximal 5 Phasen mit je 2-5 Items
- Beziehe Unter-Contexts in die Bewertung ein
- Antworte NUR mit dem JSON-Objekt`;

        const proc = spawn('claude', ['-p', '--output-format', 'json'], {
          cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe']
        });
        proc.stdin.write(prompt);
        proc.stdin.end();

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
        proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

        proc.on('close', code => {
          if (code !== 0) {
            console.error('[context-plan] claude failed:', stderr.slice(0, 300));
            return jsonRes(res, { ok: false, error: 'AI error' });
          }

          try {
            let aiText = stdout;
            try {
              const outerJson = JSON.parse(stdout);
              aiText = outerJson.result || outerJson.text || outerJson.content || stdout;
            } catch (e) {}

            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              return jsonRes(res, { ok: false, error: 'No JSON in response', raw: aiText.slice(0, 300) });
            }

            const plan = JSON.parse(jsonMatch[0]);
            plan.updatedAt = new Date().toISOString();

            // Save plan to context
            const freshCtx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
            freshCtx.plan = plan;
            fs.writeFileSync(ctxFile, JSON.stringify(freshCtx, null, 2));
            broadcast('liveos', { type: 'context-change', contextId, time: Date.now() });

            jsonRes(res, { ok: true, plan });
          } catch (e) {
            console.error('[context-plan] Parse error:', e.message, 'stdout:', stdout.slice(0, 300));
            jsonRes(res, { ok: false, error: 'Parse error', raw: stdout.slice(0, 300) });
          }
        });
      } catch (e) {
        jsonRes(res, { ok: false, error: e.message });
      }
    });
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

        emitEvent({ type: 'terminal:command', source: 'user', data: { text: text.slice(0, 200) } });
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
        invalidateAgentContextCache();
        vikingImportApp(appId);
        emitEvent({ type: 'data:changed', source: `notify:${appId}`, data: { appId, file: filename } });
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

  // --- Profile & Contacts ---
  if (url === '/api/profile') {
    const profilePath = path.join(__dirname, 'data', 'profile.json');
    if (req.method === 'GET') {
      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        return jsonRes(res, profile);
      } catch (e) {
        return jsonRes(res, { name: '', handle: '', avatar: '🧑‍💻', bio: '', githubPages: '', links: [], roomId: '', createdAt: null, updatedAt: null });
      }
    }
    if (req.method === 'PUT') {
      return readBody(req, b => {
        try {
          const update = JSON.parse(b);
          let profile = {};
          try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch (e) {}
          const merged = { ...profile, ...update, updatedAt: new Date().toISOString() };
          if (!merged.createdAt) merged.createdAt = merged.updatedAt;
          if (!merged.roomId) merged.roomId = 'pulse-' + crypto.randomBytes(4).toString('hex');
          fs.writeFileSync(profilePath, JSON.stringify(merged, null, 2));
          broadcast('dashboard', { type: 'profile-updated', profile: merged, time: Date.now() });
          return jsonRes(res, { ok: true, profile: merged });
        } catch (e) {
          return jsonRes(res, { error: e.message }, 400);
        }
      });
      return;
    }
  }

  if (url === '/api/contacts') {
    const contactsPath = path.join(__dirname, 'data', 'contacts.json');
    if (req.method === 'GET') {
      try {
        const data = JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
        return jsonRes(res, data);
      } catch (e) {
        return jsonRes(res, { version: 1, contacts: [], updatedAt: null });
      }
    }
    if (req.method === 'POST') {
      return readBody(req, b => {
        try {
          const contact = JSON.parse(b);
          let data = { version: 1, contacts: [], updatedAt: null };
          try { data = JSON.parse(fs.readFileSync(contactsPath, 'utf8')); } catch (e) {}
          const idx = data.contacts.findIndex(c => c.handle === contact.handle || c.roomId === contact.roomId);
          if (idx >= 0) {
            data.contacts[idx] = { ...data.contacts[idx], ...contact, lastSeen: new Date().toISOString() };
          } else {
            data.contacts.push({ ...contact, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() });
          }
          data.updatedAt = new Date().toISOString();
          fs.writeFileSync(contactsPath, JSON.stringify(data, null, 2));
          broadcast('dashboard', { type: 'contacts-updated', time: Date.now() });
          return jsonRes(res, { ok: true, contact: data.contacts[idx >= 0 ? idx : data.contacts.length - 1] });
        } catch (e) {
          return jsonRes(res, { error: e.message }, 400);
        }
      });
      return;
    }
  }

  // Profile export for GitHub Pages
  if (url === '/api/profile/export' && req.method === 'GET') {
    const profilePath = path.join(__dirname, 'data', 'profile.json');
    try {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      const appsFile = path.join(ROOT, 'data', 'apps.json');
      const appsData = JSON.parse(safeReadJSON(appsFile, '{"apps":[]}'));
      // Read visibility from each manifest
      const enrichedApps = (appsData.apps || []).map(a => {
        let vis = 'private', allowed = [];
        try {
          const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', a.id, 'manifest.json'), 'utf8'));
          vis = m.visibility || 'private';
          allowed = m.allowedUsers || [];
        } catch {}
        return { id: a.id, name: a.name, icon: a.icon, color: a.color, description: a.description, visibility: vis, allowedUsers: allowed };
      });
      const publicApps = enrichedApps.filter(a => a.visibility === 'public');
      const unlistedApps = enrichedApps.filter(a => a.visibility === 'unlisted');
      const inviteApps = enrichedApps.filter(a => a.visibility === 'invite');

      // pulse-profile.json (machine-readable)
      const pulseProfile = {
        schema: 'pulse-profile/1.1',
        name: profile.name,
        handle: profile.handle,
        avatar: profile.avatar,
        bio: profile.bio,
        links: profile.links || [],
        apps: enrichedApps.length,
        publicApps: publicApps.map(a => ({ id: a.id, name: a.name, icon: a.icon, description: a.description })),
        unlistedApps: unlistedApps.map(a => ({ id: a.id, name: a.name })),
        inviteApps: inviteApps.map(a => ({ id: a.id, name: a.name, allowedUsers: a.allowedUsers })),
        roomId: profile.roomId,
        updated: new Date().toISOString()
      };

      // Static HTML profile page — shows only public apps
      const appCards = publicApps.map(a => {
        const icon = a.icon || a.name[0];
        const color = a.color || '#1a1a2e';
        return `<div class="app-card"><div class="app-icon" style="background:${color}">${icon}</div><div class="app-info"><div class="app-name">${a.name}</div><div class="app-desc">${a.description || ''}</div></div></div>`;
      }).join('');
      const socialLinks = (profile.links || []).map(l => `<a class="social-link" href="${l.url}" target="_blank">${l.label || l.url}</a>`).join('');
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${profile.name || 'PulseOS'} — PulseOS Profile</title>
<meta property="og:title" content="${profile.name || 'PulseOS User'}" />
<meta property="og:description" content="${profile.bio || 'PulseOS Profile'}" />
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0d14;color:#e0e0e0;min-height:100vh;padding:20px;display:flex;justify-content:center}
.profile{max-width:500px;width:100%;padding-top:40px}
.header{text-align:center;margin-bottom:24px}
.avatar{font-size:56px;margin-bottom:8px}
h1{font-size:22px;margin-bottom:2px}
.handle{color:#4ecdc4;font-size:13px;margin-bottom:8px}
.bio{color:#888;font-size:13px;line-height:1.5;margin-bottom:16px}
.social-links{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:24px}
.social-link{color:#4ecdc4;font-size:12px;text-decoration:none;background:#1a1a2e;padding:4px 12px;border-radius:12px;border:1px solid #2a2a3e}
.social-link:hover{border-color:#4ecdc4}
.section-title{font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:12px;font-weight:600}
.app-grid{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.app-card{display:flex;align-items:center;gap:12px;background:#13131f;border:1px solid #2a2a3e;border-radius:10px;padding:12px}
.app-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:#fff;flex-shrink:0}
.app-info{overflow:hidden}
.app-name{font-size:13px;font-weight:600;margin-bottom:2px}
.app-desc{font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.footer{text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #1a1a2e}
.footer a{color:#4ecdc4;text-decoration:none;font-size:12px;font-weight:600}
.stats{display:flex;gap:16px;justify-content:center;margin-bottom:24px}
.stat{text-align:center}
.stat-val{font-size:18px;font-weight:700;color:#4ecdc4}
.stat-label{font-size:10px;color:#666;text-transform:uppercase}
</style></head><body>
<div class="profile">
<div class="header">
<div class="avatar">${profile.avatar || '>'}</div>
<h1>${profile.name || 'Anonymous'}</h1>
<div class="handle">@${profile.handle || 'pulse-user'}</div>
<div class="bio">${profile.bio || ''}</div>
</div>
${socialLinks ? `<div class="social-links">${socialLinks}</div>` : ''}
<div class="stats">
<div class="stat"><div class="stat-val">${publicApps.length}</div><div class="stat-label">Public Apps</div></div>
<div class="stat"><div class="stat-val">${enrichedApps.length}</div><div class="stat-label">Total Apps</div></div>
</div>
${publicApps.length > 0 ? `<div class="section-title">Public Apps</div><div class="app-grid">${appCards}</div>` : '<div style="text-align:center;color:#555;font-size:13px;margin:20px 0;">No public apps yet</div>'}
<div class="footer"><a href="https://github.com/NastyFFM/PulseOS">Powered by PulseOS</a></div>
</div>
</body></html>`;

      return jsonRes(res, { profile: pulseProfile, html, files: { 'pulse-profile.json': JSON.stringify(pulseProfile, null, 2), 'index.html': html } });
    } catch (e) {
      return jsonRes(res, { error: e.message });
    }
  }

  // ── Profile Publish (push to GitHub Pages) ──
  if (url === '/api/profile/publish' && req.method === 'POST') {
    const profilePath = path.join(__dirname, 'data', 'profile.json');
    try {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      if (!profile.githubToken) {
        return jsonRes(res, { ok: false, error: 'Kein GitHub Token. Bitte in Settings hinterlegen.' }, 400);
      }
      const handle = profile.handle || 'pulse-user';
      const repoName = handle + '.github.io';
      const token = profile.githubToken;
      const headers = { 'Authorization': 'token ' + token, 'User-Agent': 'PulseOS/1.0', 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };

      // Generate export data
      const exportRes = await new Promise((resolve, reject) => {
        const r = require('http').get('http://localhost:' + PORT + '/api/profile/export', resp => {
          let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(JSON.parse(d)));
        });
        r.on('error', reject);
      });
      if (!exportRes.files) return jsonRes(res, { ok: false, error: 'Export failed' }, 500);

      // Check if repo exists, create if not
      const ghApi = (path, method, body) => new Promise((resolve, reject) => {
        const opts = { hostname: 'api.github.com', path, method: method || 'GET', headers };
        const req2 = require('https').request(opts, resp => {
          let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve({ status: resp.statusCode, data: d ? JSON.parse(d) : {} }));
        });
        req2.on('error', reject);
        if (body) req2.write(JSON.stringify(body));
        req2.end();
      });

      // Get authenticated user
      const userResp = await ghApi('/user');
      const ghUser = userResp.data.login;
      if (!ghUser) return jsonRes(res, { ok: false, error: 'GitHub Token ungültig' }, 401);

      // Check/create repo
      const repoResp = await ghApi('/repos/' + ghUser + '/' + repoName);
      if (repoResp.status === 404) {
        await ghApi('/user/repos', 'POST', { name: repoName, description: 'PulseOS Profile — ' + (profile.name || handle), homepage: 'https://' + ghUser + '.github.io', auto_init: true, private: false });
        // Wait for repo creation
        await new Promise(r => setTimeout(r, 2000));
      }

      // Push files using Contents API
      const pushFile = async (filePath, content) => {
        const encoded = Buffer.from(content).toString('base64');
        // Check if file exists to get sha
        const existing = await ghApi('/repos/' + ghUser + '/' + repoName + '/contents/' + filePath);
        const body = { message: 'Update PulseOS profile', content: encoded, branch: 'main' };
        if (existing.status === 200 && existing.data.sha) body.sha = existing.data.sha;
        return ghApi('/repos/' + ghUser + '/' + repoName + '/contents/' + filePath, 'PUT', body);
      };

      const r1 = await pushFile('index.html', exportRes.files['index.html']);
      const r2 = await pushFile('pulse-profile.json', exportRes.files['pulse-profile.json']);

      const pagesUrl = 'https://' + ghUser + '.github.io';
      // Save last publish time
      profile.lastPublished = new Date().toISOString();
      profile.pagesUrl = pagesUrl;
      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

      broadcast('dashboard', { type: 'profile-published', url: pagesUrl });
      return jsonRes(res, { ok: true, url: pagesUrl, repo: ghUser + '/' + repoName, files: ['index.html', 'pulse-profile.json'] });
    } catch (e) {
      return jsonRes(res, { ok: false, error: e.message }, 500);
    }
  }

  // PulseOS Search — find other PulseOS users via GitHub
  if (url === '/api/pulse-search' && req.method === 'GET') {
    const query = new URL(req.url, 'http://localhost').searchParams.get('q') || 'pulse-profile.json';
    try {
      const https = require('https');
      const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(query + ' filename:pulse-profile.json')}&per_page=10`;
      const ghReq = https.get(searchUrl, { headers: { 'User-Agent': 'PulseOS/1.0', Accept: 'application/vnd.github.v3+json' } }, (ghRes) => {
        let body = '';
        ghRes.on('data', c => body += c);
        ghRes.on('end', () => {
          try {
            const data = JSON.parse(body);
            const results = (data.items || []).map(item => ({
              repo: item.repository?.full_name,
              owner: item.repository?.owner?.login,
              url: item.html_url,
              pagesUrl: item.repository?.owner?.login ? `https://${item.repository.owner.login}.github.io` : null
            }));
            jsonRes(res, { results, total: data.total_count || 0 });
          } catch { jsonRes(res, { results: [], error: 'Parse error' }); }
        });
      });
      ghReq.on('error', () => jsonRes(res, { results: [], error: 'GitHub API error' }));
    } catch (e) { jsonRes(res, { results: [], error: e.message }); }
    return;
  }

  if (url === '/api/profile/onboarding') {
    if (req.method === 'GET') {
      const profilePath = path.join(__dirname, 'data', 'profile.json');
      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        return jsonRes(res, { needed: !profile.name });
      } catch (e) {
        return jsonRes(res, { needed: true });
      }
    }
  }

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

  // ── Podcast RSS proxy ──
  if (url === '/api/podcast/rss' && req.method === 'GET') {
    const feedUrl = new URLSearchParams(req.url.split('?')[1] || '').get('url') || '';
    if (!feedUrl) return jsonRes(res, { error: 'no url' });
    const mod = feedUrl.startsWith('https') ? require('https') : require('http');
    mod.get(feedUrl, { headers: { 'User-Agent': 'PulseOS/1.0 Podcast App' } }, r => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => {
        try {
          const items = [];
          const itemMatches = body.matchAll(/<item>([\s\S]*?)<\/item>/g);
          for (const m of itemMatches) {
            const block = m[1];
            const getTag = (tag) => { const rx = block.match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>|<' + tag + '[^>]*>([^<]*)</' + tag + '>')); return rx ? (rx[1] || rx[2] || '').trim() : ''; };
            const enclosure = block.match(/<enclosure[^>]+url="([^"]+)"/);
            const duration = block.match(/<itunes:duration>([^<]+)<\/itunes:duration>/);
            const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/);
            if (enclosure) items.push({
              title: getTag('title'),
              description: getTag('description').replace(/<[^>]+>/g, '').slice(0, 200),
              audio: enclosure[1],
              duration: duration ? duration[1] : '',
              date: pubDate ? pubDate[1].slice(0, 16) : ''
            });
            if (items.length >= 30) break;
          }
          jsonRes(res, { items });
        } catch(e) { jsonRes(res, { items: [], error: e.message }); }
      });
    }).on('error', e => jsonRes(res, { items: [], error: e.message }));
    return;
  }

  // ── YouTube search proxy ──
  if (url === '/api/youtube/search' && req.method === 'GET') {
    const q = new URLSearchParams(req.url.split('?')[1] || '').get('q') || '';
    if (!q) return jsonRes(res, { error: 'no query' });
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%3D%3D`;
    const https = require('https');
    const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'de,en;q=0.9' } };
    https.get(ytUrl, options, r => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => {
        try {
          const match = body.match(/var ytInitialData = ({.+?});<\/script>/s);
          if (!match) return jsonRes(res, { results: [] });
          const data = JSON.parse(match[1]);
          const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
          const results = contents
            .filter(c => c.videoRenderer)
            .map(c => {
              const v = c.videoRenderer;
              const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
              const duration = v.lengthText?.simpleText || '';
              const channel = v.ownerText?.runs?.[0]?.text || '';
              return { videoId: v.videoId, title: v.title?.runs?.[0]?.text || '', thumbnail: thumb, duration, channel };
            })
            .filter(v => v.videoId)
            .slice(0, 20);
          jsonRes(res, { results });
        } catch(e) { jsonRes(res, { results: [], error: e.message }); }
      });
    }).on('error', e => jsonRes(res, { results: [], error: e.message }));
    return;
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
      emitEvent({ type: 'webrtc:message', source: 'tunnel', data: { action: 'connected', url: tunnelUrl } });
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
  // Start pulse engine
  startPulseEngine();
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

  // Auto-start Viking bridge if viking-bridge.py exists
  const vikingBridgePath = path.join(ROOT, 'viking-bridge.py');
  if (fs.existsSync(vikingBridgePath)) {
    // Check if already running on port 1934
    const checkReq = http.get('http://localhost:1934/api/viking/status', { timeout: 2000 }, (r) => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => {
        try {
          const d = JSON.parse(body);
          if (d.ok) { console.log(`[viking] Bridge already running (v${d.version})`); return; }
        } catch {}
        startVikingBridge();
      });
    });
    checkReq.on('error', () => startVikingBridge());
    checkReq.on('timeout', () => { checkReq.destroy(); startVikingBridge(); });

    function startVikingBridge() {
      const vb = spawn('python3', [vikingBridgePath], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
      vb.stdout.on('data', c => process.stdout.write('[viking] ' + c));
      vb.stderr.on('data', c => process.stderr.write('[viking] ' + c));
      vb.on('error', e => console.error('[viking] failed to start:', e.message));
      vb.on('close', code => console.log(`[viking] Bridge exited (code=${code})`));
      console.log('[viking] Bridge starting on port 1934');
    }
  }
});
