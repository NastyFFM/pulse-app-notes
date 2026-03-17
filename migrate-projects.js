/**
 * migrate-projects.js
 *
 * Migrates apps/projects/data/projects.json into individual context files
 * at data/contexts/<contextId>.json
 *
 * Usage: node migrate-projects.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PROJECTS_FILE = path.join(ROOT, 'apps', 'projects', 'data', 'projects.json');
const CONTEXTS_DIR = path.join(ROOT, 'data', 'contexts');

// Ensure contexts directory exists
if (!fs.existsSync(CONTEXTS_DIR)) {
  fs.mkdirSync(CONTEXTS_DIR, { recursive: true });
}

// Read projects
const projectsRaw = fs.readFileSync(PROJECTS_FILE, 'utf8');
const projectsData = JSON.parse(projectsRaw);
const projects = projectsData.projects || [];

if (projects.length === 0) {
  console.log('No projects found. Nothing to migrate.');
  process.exit(0);
}

// Create backup of projects.json
const backupFile = PROJECTS_FILE + '.backup-' + Date.now();
fs.writeFileSync(backupFile, projectsRaw);
console.log(`Backup created: ${backupFile}`);

// Helper: ensure ctx- prefix on an ID
function toCtxId(id) {
  if (!id) return null;
  if (id.startsWith('ctx-')) return id;
  // Replace proj- prefix with ctx-, or just prefix with ctx-
  if (id.startsWith('proj-')) return 'ctx-' + id.slice(5);
  return 'ctx-' + id;
}

let migrated = 0;
let skipped = 0;

for (const project of projects) {
  const ctxId = toCtxId(project.id);
  const ctxFile = path.join(CONTEXTS_DIR, ctxId + '.json');

  // Don't overwrite ctx-personal
  if (ctxId === 'ctx-personal' && fs.existsSync(ctxFile)) {
    console.log(`SKIP: ${ctxId} (ctx-personal already exists)`);
    skipped++;
    continue;
  }

  // Map widgets from canvas
  const widgets = (project.canvas && project.canvas.widgets) || [];
  const mappedWidgets = widgets.map(w => ({
    ...w,
    scope: 'local',
    zoomLevel: 'L1'
  }));

  const now = new Date().toISOString();

  const context = {
    id: ctxId,
    name: project.name,
    icon: project.icon || '📁',
    color: project.color || '#6366f1',
    parentId: toCtxId(project.parentId),
    created: project.created || now,
    updated: project.updated || now,
    widgets: mappedWidgets,
    data: project.data || {},
    chat: project.chat || [],
    changelog: project.changelog || [],
    plan: project.plan || null,
    template: project.template || null,
    closedWidgets: project.closedWidgets || [],
    skills: [],
    connections: []
  };

  // Write context file
  fs.writeFileSync(ctxFile, JSON.stringify(context, null, 2));
  console.log(`MIGRATED: ${project.id} -> ${ctxId} (${project.name}, ${mappedWidgets.length} widgets)`);

  // Create context data directory if it doesn't exist
  const ctxDataDir = path.join(CONTEXTS_DIR, ctxId);
  if (!fs.existsSync(ctxDataDir)) {
    fs.mkdirSync(ctxDataDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDataDir, '_changelog.json'), JSON.stringify({ entries: [] }, null, 2));
  }

  migrated++;
}

console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`);
console.log(`Context files are in: ${CONTEXTS_DIR}`);
