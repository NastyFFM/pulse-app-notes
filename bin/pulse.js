#!/usr/bin/env node

// PulseOS CLI — pulse command
// Usage: node bin/pulse.js <command> [args]
// Or:    ln -sf $(pwd)/bin/pulse.js /usr/local/bin/pulse

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const PULSE_URL = process.env.PULSE_URL || 'http://localhost:3000';
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.join(os.homedir(), 'pulse-workspace');

// ── HTTP Helper ──────────────────────────────────────────
function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(PULSE_URL + apiPath);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { 'Content-Type': 'application/json' }, timeout: 10000 };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', e => reject(new Error(`PulseOS not reachable: ${e.message}`)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Commands ─────────────────────────────────────────────
const commands = {

  // pulse app list [--running]
  async 'app list'(args) {
    const data = await api('GET', '/api/app-registry');
    let apps = data.apps || [];
    if (args.includes('--running')) apps = apps.filter(a => a.status === 'running');
    if (args.includes('--node')) apps = apps.filter(a => a.type === 'node');
    if (args.includes('--vanilla')) apps = apps.filter(a => a.type === 'vanilla');

    if (apps.length === 0) return console.log('No apps found.');
    const maxId = Math.max(...apps.map(a => a.id.length), 2);
    console.log(`${'ID'.padEnd(maxId)}  ${'TYPE'.padEnd(7)}  ${'STATUS'.padEnd(8)}  PATH`);
    console.log('-'.repeat(maxId + 30));
    for (const a of apps) {
      console.log(`${a.id.padEnd(maxId)}  ${(a.type || 'vanilla').padEnd(7)}  ${(a.status || '-').padEnd(8)}  ${a.path || ''}`);
    }
    console.log(`\n${apps.length} app(s)`);
  },

  // pulse app start <id>
  async 'app start'(args) {
    const appId = args[0];
    if (!appId) return console.error('Usage: pulse app start <appId>');
    console.log(`Starting ${appId}...`);
    const result = await api('POST', `/api/apps/${appId}/start`);
    if (result.error) return console.error(`Error: ${result.error}`);
    console.log(`Started ${appId} (pid: ${result.pid}, port: ${result.port})`);
  },

  // pulse app stop <id>
  async 'app stop'(args) {
    const appId = args[0];
    if (!appId) return console.error('Usage: pulse app stop <appId>');
    const result = await api('POST', `/api/apps/${appId}/stop`);
    console.log(result.ok ? `Stopped ${appId}` : `${appId} was not running`);
  },

  // pulse app restart <id>
  async 'app restart'(args) {
    const appId = args[0];
    if (!appId) return console.error('Usage: pulse app restart <appId>');
    await api('POST', `/api/apps/${appId}/stop`);
    console.log(`Stopped ${appId}, restarting...`);
    const result = await api('POST', `/api/apps/${appId}/start`);
    if (result.error) return console.error(`Error: ${result.error}`);
    console.log(`Started ${appId} (pid: ${result.pid}, port: ${result.port})`);
  },

  // pulse app status <id>
  async 'app status'(args) {
    const appId = args[0];
    if (!appId) return console.error('Usage: pulse app status <appId>');
    const reg = await api('GET', `/api/app-registry/${appId}`);
    if (reg.error) return console.error(`Error: ${reg.error}`);
    const state = await api('GET', `/api/apps/${appId}/state`);
    console.log(`App:    ${appId}`);
    console.log(`Type:   ${reg.type || 'vanilla'}`);
    console.log(`Status: ${reg.status || 'active'}`);
    console.log(`Path:   ${reg.path || '-'}`);
    if (reg.pid) console.log(`PID:    ${reg.pid}`);
    if (reg.port) console.log(`Port:   ${reg.port}`);
    if (reg.manifest) {
      const m = reg.manifest;
      console.log(`Node:   ${m.nodeType || '-'}`);
      if (m.inputs?.length) console.log(`Inputs: ${m.inputs.map(i => i.name).join(', ')}`);
      if (m.outputs?.length) console.log(`Output: ${m.outputs.map(o => o.name).join(', ')}`);
      if (m.pulseSubscriptions?.length) console.log(`Pulse:  ${m.pulseSubscriptions.join(', ')}`);
    }
    if (state && state.data && Object.keys(state.data).length > 0) {
      console.log(`State:  ${JSON.stringify(state.data).slice(0, 100)}`);
    }
  },

  // pulse app call <id> state
  // pulse app call <id> action '{"type":"pulse"}'
  async 'app call'(args) {
    const [appId, endpoint, bodyStr] = args;
    if (!appId || !endpoint) return console.error('Usage: pulse app call <appId> state|action [jsonBody]');
    if (endpoint === 'state') {
      const result = await api('GET', `/api/apps/${appId}/state`);
      console.log(JSON.stringify(result, null, 2));
    } else if (endpoint === 'action') {
      const body = bodyStr ? JSON.parse(bodyStr) : { type: 'pulse', data: {} };
      const result = await api('POST', `/api/apps/${appId}/action`, body);
      console.log(JSON.stringify(result, null, 2));
    }
  },

  // pulse app create <id> --type vanilla|node
  async 'app create'(args) {
    const appId = args[0];
    if (!appId) return console.error('Usage: pulse app create <appId> [--type vanilla|node]');
    const typeIdx = args.indexOf('--type');
    const type = typeIdx >= 0 ? args[typeIdx + 1] : 'vanilla';

    const templateDir = path.join(ROOT, 'templates', `app-${type}`);
    if (!fs.existsSync(templateDir)) return console.error(`Template not found: ${templateDir}`);

    const destDir = type === 'vanilla'
      ? path.join(ROOT, 'apps', appId)
      : path.join(WORKSPACE, appId);

    if (fs.existsSync(destDir)) return console.error(`Directory already exists: ${destDir}`);

    // Copy template
    fs.cpSync(templateDir, destDir, { recursive: true });

    // Replace placeholders
    const name = appId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    for (const file of walkFiles(destDir)) {
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes('REPLACE_ID') || content.includes('REPLACE_NAME')) {
        content = content.replace(/REPLACE_ID/g, appId).replace(/REPLACE_NAME/g, name);
        fs.writeFileSync(file, content);
      }
    }

    // Register in app-registry
    await api('POST', '/api/app-registry', {
      id: appId,
      type,
      path: type === 'vanilla' ? `./apps/${appId}` : destDir,
      status: type === 'vanilla' ? 'active' : 'stopped'
    });

    console.log(`Created ${type} app: ${appId}`);
    console.log(`Location: ${destDir}`);
    if (type === 'node') console.log(`Run: cd ${destDir} && npm install && pulse app start ${appId}`);
  },

  // pulse graph show <projectId>
  async 'graph show'(args) {
    const projectId = args[0];
    if (!projectId) return console.error('Usage: pulse graph show <projectId>');
    const graph = await api('GET', `/api/graphs/${projectId}`);
    if (!graph.nodes || graph.nodes.length === 0) return console.log('Empty graph.');

    console.log(`Graph: ${projectId}\n`);
    console.log('Nodes:');
    for (const n of graph.nodes) {
      console.log(`  [${n.nodeType}] ${n.appId}`);
    }
    if (graph.edges?.length) {
      console.log('\nEdges:');
      for (const e of graph.edges) {
        console.log(`  ${e.from.appId}.${e.from.output} --> ${e.to.appId}.${e.to.input}`);
      }
    }
  },

  // pulse graph connect <fromApp> <fromOutput> <toApp> <toInput> --project <id>
  async 'graph connect'(args) {
    const projIdx = args.indexOf('--project');
    if (projIdx < 0 || args.length < 5) return console.error('Usage: pulse graph connect <fromApp> <fromOutput> <toApp> <toInput> --project <id>');
    const [fromApp, fromOutput, toApp, toInput] = args;
    const projectId = args[projIdx + 1];
    const result = await api('POST', `/api/graphs/${projectId}/connect`, { fromApp, fromOutput, toApp, toInput });
    console.log(result.ok ? `Connected: ${fromApp}.${fromOutput} --> ${toApp}.${toInput}` : JSON.stringify(result));
  },

  // pulse graph disconnect <fromApp> <toApp> --project <id>
  async 'graph disconnect'(args) {
    const projIdx = args.indexOf('--project');
    if (projIdx < 0 || args.length < 3) return console.error('Usage: pulse graph disconnect <fromApp> <toApp> --project <id>');
    const [fromApp, toApp] = args;
    const projectId = args[projIdx + 1];
    const result = await api('DELETE', `/api/graphs/${projectId}/connect`, { fromApp, toApp });
    console.log(result.ok ? `Disconnected ${result.removed} edge(s)` : JSON.stringify(result));
  },

  // pulse graph run <projectId>
  async 'graph run'(args) {
    const projectId = args[0];
    if (!projectId) return console.error('Usage: pulse graph run <projectId>');
    console.log(`Running graph ${projectId}...`);
    const result = await api('POST', `/api/graphs/${projectId}/run`);
    if (result.error) return console.error(`Error: ${result.error}`);
    for (const t of result.triggered || []) {
      console.log(`  ${t.status === 'pulsed' ? 'OK' : 'ERR'} ${t.appId}${t.error ? ': ' + t.error : ''}`);
    }
  },

  // pulse fire <appId>
  async 'fire'(args) {
    const target = args[0];
    if (!target) return console.error('Usage: pulse fire <appId|project:projectId>');
    if (target.startsWith('project:')) {
      const projectId = target.slice(8);
      return commands['graph run']([projectId]);
    }
    const result = await api('POST', `/api/pulse/fire/${target}`);
    console.log(result.ok ? `Pulsed ${target}` : JSON.stringify(result));
  },
};

// ── Helpers ──────────────────────────────────────────────
function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else results.push(full);
  }
  return results;
}

function showHelp() {
  console.log(`
PulseOS CLI

  pulse app list [--running|--node|--vanilla]
  pulse app start <id>
  pulse app stop <id>
  pulse app restart <id>
  pulse app status <id>
  pulse app call <id> state|action [json]
  pulse app create <id> [--type vanilla|node]

  pulse graph show <projectId>
  pulse graph connect <from> <output> <to> <input> --project <id>
  pulse graph disconnect <from> <to> --project <id>
  pulse graph run <projectId>

  pulse fire <appId|project:projectId>
`);
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') return showHelp();

  // Try 2-word command first (e.g. "app list"), then 1-word (e.g. "fire")
  const twoWord = `${args[0]} ${args[1]}`;
  if (commands[twoWord]) {
    return commands[twoWord](args.slice(2));
  }
  if (commands[args[0]]) {
    return commands[args[0]](args.slice(1));
  }

  console.error(`Unknown command: ${args.join(' ')}`);
  showHelp();
  process.exit(1);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
