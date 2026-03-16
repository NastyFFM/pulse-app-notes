#!/usr/bin/env node
// =============================================================================
// GUITest Agent Supervisor
// Monitors agents.json and auto-restarts dead agents via claude -p
// Usage: node supervisor.js
// =============================================================================

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const AGENTS_FILE = path.join(ROOT, 'data', 'agents.json');
const SKILL_DIR = path.join(ROOT, '.claude', 'skills');

// --- Configuration ---
const CHECK_INTERVAL_MS = 30000;   // Check every 30s
const DEAD_THRESHOLD_MS = 120000;  // Restart after 2min dead
const MAX_LOOP_CYCLES = 40;        // Agent runs ~40 cycles (~40min) then exits & gets respawned
const MAX_RESTARTS_PER_HOUR = 10;  // Circuit breaker: max restarts per hour per agent
const AGENT_SPAWN_COOLDOWN_MS = 60000; // Min 60s between spawns for same agent

// --- State ---
const managed = {};      // agentId -> { proc, startedAt, pid }
const restartLog = {};   // agentId -> [timestamps]

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [supervisor] ${msg}`);
}

function readAgents() {
  try {
    return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
  } catch {
    return { agents: [] };
  }
}

function getSkillPrompt(agentType) {
  const skillName = agentType === 'chat' ? 'guitest-chat' : 'guitest-modifier';
  const skillFile = path.join(SKILL_DIR, skillName, 'SKILL.md');
  try {
    // Strip frontmatter (between --- markers)
    let content = fs.readFileSync(skillFile, 'utf8');
    content = content.replace(/^---[\s\S]*?---\n*/, '');
    return content;
  } catch (e) {
    log(`ERROR: Could not read skill file for ${agentType}: ${e.message}`);
    return null;
  }
}

function isCircuitBroken(agentId) {
  if (!restartLog[agentId]) restartLog[agentId] = [];
  const oneHourAgo = Date.now() - 3600000;
  restartLog[agentId] = restartLog[agentId].filter(t => t > oneHourAgo);
  return restartLog[agentId].length >= MAX_RESTARTS_PER_HOUR;
}

function isCoolingDown(agentId) {
  if (!managed[agentId]) return false;
  return (Date.now() - managed[agentId].startedAt) < AGENT_SPAWN_COOLDOWN_MS;
}

function spawnAgent(agent) {
  if (managed[agent.id]?.proc) return; // Already running
  if (isCircuitBroken(agent.id)) {
    log(`CIRCUIT BREAKER: ${agent.id} restarted ${MAX_RESTARTS_PER_HOUR}x in 1h — pausing`);
    return;
  }

  const skillPrompt = getSkillPrompt(agent.type);
  if (!skillPrompt) return;

  const model = agent.type === 'chat' ? 'sonnet' : (agent.model || 'sonnet');

  // Prompt: run the agent loop for MAX_LOOP_CYCLES iterations
  const prompt = `${skillPrompt}

WICHTIG - SUPERVISOR MODUS:
- Du wurdest automatisch vom Supervisor gestartet weil der vorherige Agent gestorben ist.
- Fuehre genau ${MAX_LOOP_CYCLES} Loop-Iterationen aus.
- Beginne SOFORT mit Schritt 1 (Heartbeat senden).
- Nach ${MAX_LOOP_CYCLES} Iterationen beende dich sauber — der Supervisor startet dich dann neu.
- Wenn ein Fehler auftritt (z.B. Server nicht erreichbar), warte 10 Sekunden und versuche es erneut.`;

  log(`Spawning ${agent.id} (model=${model}, cycles=${MAX_LOOP_CYCLES})`);

  const proc = spawn('claude', [
    '-p',
    '--model', model,
    '--permission-mode', 'auto',
    '--allowedTools', 'Bash Read Write Edit Glob Grep',
  ], {
    cwd: ROOT,
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'supervisor' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', c => {
    stdout += c.toString();
    // Log last line of output for visibility
    const lines = stdout.trim().split('\n');
    if (lines.length % 10 === 0) { // Log every ~10 lines
      log(`${agent.id} output: ${lines[lines.length - 1].slice(0, 100)}`);
    }
  });
  proc.stderr.on('data', c => {
    stderr += c.toString();
  });

  proc.on('close', (code) => {
    log(`${agent.id} exited (code=${code}, stdout=${stdout.length}b, stderr=${stderr.length}b)`);
    if (stderr.trim()) {
      log(`${agent.id} stderr: ${stderr.trim().slice(0, 200)}`);
    }
    delete managed[agent.id];
    // Next check cycle will respawn if still needed
  });

  proc.on('error', (e) => {
    log(`${agent.id} spawn error: ${e.message}`);
    delete managed[agent.id];
  });

  managed[agent.id] = { proc, startedAt: Date.now(), pid: proc.pid };
  if (!restartLog[agent.id]) restartLog[agent.id] = [];
  restartLog[agent.id].push(Date.now());

  log(`${agent.id} started (PID ${proc.pid})`);
}

function checkAndRestart() {
  const data = readAgents();
  const now = Date.now();

  for (const agent of data.agents) {
    // Skip if already managed and process is running
    if (managed[agent.id]?.proc) continue;

    // Skip if cooling down from recent spawn
    if (isCoolingDown(agent.id)) continue;

    // Check if agent is dead long enough
    if (agent.status === 'dead' && agent.lastHeartbeat) {
      const deadFor = now - new Date(agent.lastHeartbeat).getTime();
      if (deadFor > DEAD_THRESHOLD_MS) {
        log(`${agent.id} dead for ${Math.round(deadFor / 1000)}s — restarting`);
        spawnAgent(agent);
      }
    }
  }
}

// --- Graceful shutdown ---
function shutdown(signal) {
  log(`Received ${signal} — shutting down managed agents...`);
  for (const [id, m] of Object.entries(managed)) {
    if (m.proc) {
      log(`Killing ${id} (PID ${m.pid})`);
      m.proc.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(0), 2000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- Status endpoint (optional: writes supervisor status to data/) ---
function writeStatus() {
  const status = {
    running: true,
    startedAt: startTime,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    managedAgents: Object.fromEntries(
      Object.entries(managed).map(([id, m]) => [id, {
        pid: m.pid,
        runningSince: new Date(m.startedAt).toISOString(),
        runningFor: Math.round((Date.now() - m.startedAt) / 1000) + 's'
      }])
    ),
    restartCounts: Object.fromEntries(
      Object.entries(restartLog).map(([id, times]) => [id, {
        lastHour: times.filter(t => t > Date.now() - 3600000).length,
        circuitBroken: isCircuitBroken(id)
      }])
    )
  };
  try {
    fs.writeFileSync(path.join(ROOT, 'data', 'supervisor-status.json'), JSON.stringify(status, null, 2));
  } catch {}
}

// --- Main ---
const startTime = Date.now();
log('=== GUITest Agent Supervisor started ===');
log(`Check interval: ${CHECK_INTERVAL_MS / 1000}s | Dead threshold: ${DEAD_THRESHOLD_MS / 1000}s | Max cycles: ${MAX_LOOP_CYCLES}`);
log(`Max restarts/hour: ${MAX_RESTARTS_PER_HOUR} | Cooldown: ${AGENT_SPAWN_COOLDOWN_MS / 1000}s`);

// Initial check
checkAndRestart();

// Periodic check
setInterval(() => {
  checkAndRestart();
  writeStatus();
}, CHECK_INTERVAL_MS);

// Write initial status
writeStatus();
