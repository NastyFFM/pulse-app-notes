#!/usr/bin/env node
/**
 * Phase 13a Migration Script
 *
 * Reads data/apps.json → creates manifest.json in each app directory
 * + creates data/app-registry.json as the new central registry.
 *
 * Run once: node scripts/migrate-to-manifest.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPS_JSON = path.join(ROOT, 'data/apps.json');
const REGISTRY_OUT = path.join(ROOT, 'data/app-registry.json');
const APPS_DIR = path.join(ROOT, 'apps');

// Category mapping based on app characteristics
const CATEGORIES = {
  // Productivity
  pulse: 'productivity', chat: 'productivity', kanban: 'productivity', notes: 'productivity',
  'notes-agent': 'productivity', calendar: 'productivity', 'calendar-agent': 'productivity',
  budget: 'productivity', 'budget-agent': 'productivity', tickets: 'productivity',
  mindmap: 'productivity', whiteboard: 'productivity', 'travel-planner': 'productivity',
  diary: 'productivity', projects: 'productivity', orchestrator: 'productivity',
  // Media
  radio: 'media', youtube: 'media', podcast: 'media', mediaplayer: 'media',
  'youtube-search': 'media', 'podcast-search': 'media', internetradio: 'media',
  camera: 'media', picviewer: 'media', imagegen: 'media',
  // Games
  tetris: 'games', flappy: 'games', doom: 'games',
  // Tools
  terminal: 'tools', filebrowser: 'tools', alarm: 'tools', eggtimer: 'tools',
  pipette: 'tools', triangulation: 'tools', drumcomputer: 'tools',
  // Data
  weather: 'data', 'news-channels': 'data', 'social-trends': 'data', recipes: 'data',
  // System
  viking: 'system', 'context-demo': 'system', dashboard: 'system', liveos: 'system',
  // WebRTC
  'webrtc-chat': 'social'
};

function run() {
  // Read existing apps.json
  const appsData = JSON.parse(fs.readFileSync(APPS_JSON, 'utf8'));
  const apps = appsData.apps || [];

  // Also find app directories not in apps.json
  const appDirs = fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => fs.existsSync(path.join(APPS_DIR, name, 'index.html')));

  const registryEntries = [];
  let created = 0;
  let skipped = 0;

  for (const dirName of appDirs) {
    const appDir = path.join(APPS_DIR, dirName);
    const manifestPath = path.join(appDir, 'manifest.json');

    // Skip if manifest already exists
    if (fs.existsSync(manifestPath)) {
      console.log(`  SKIP  ${dirName} (manifest exists)`);
      skipped++;
      // Still add to registry
      const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      registryEntries.push({
        id: existing.id || dirName,
        type: existing.type || 'vanilla',
        path: `./apps/${dirName}`,
        status: 'active',
        pid: null,
        port: existing.port || null
      });
      continue;
    }

    // Find matching entry in apps.json
    const appEntry = apps.find(a => a.id === dirName);

    const manifest = {
      id: dirName,
      name: appEntry?.name || dirName,
      version: '1.0.0',
      type: 'vanilla',
      description: appEntry?.description || '',
      icon: appEntry?.icon || '📦',
      color: appEntry?.color || '#8B5CF6',
      category: CATEGORIES[dirName] || 'productivity',

      nodeType: 'consumer',  // Default: most existing apps are consumers (display things)
      inputs: [],
      outputs: [],
      pulseSubscriptions: [],

      repo: null,
      source: 'local'
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  CREATE  ${dirName}/manifest.json`);
    created++;

    registryEntries.push({
      id: dirName,
      type: 'vanilla',
      path: `./apps/${dirName}`,
      status: 'active',
      pid: null,
      port: null
    });
  }

  // Write app-registry.json
  const registry = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    apps: registryEntries.sort((a, b) => a.id.localeCompare(b.id))
  };

  fs.writeFileSync(REGISTRY_OUT, JSON.stringify(registry, null, 2));
  console.log(`\n  REGISTRY  data/app-registry.json (${registryEntries.length} apps)`);
  console.log(`\n  Done: ${created} created, ${skipped} skipped.`);
}

run();
