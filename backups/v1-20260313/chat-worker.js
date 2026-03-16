// Chat Queue Manager — no CLI spawning, just message queue management
// The actual AI responses come from the Claude Code orchestrator session
const fs = require('fs');
const path = require('path');

const CHAT_FILE = path.join(__dirname, 'apps', 'chat', 'data', 'chat.json');
const QUEUE_FILE = path.join(__dirname, 'data', 'chat-queue.json');
const DEBOUNCE_MS = 300;
let debounceTimer = null;

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function checkForPending() {
  const data = readJSON(CHAT_FILE, null);
  if (!data || !data.chats) return;

  const chat = data.chats.find(c => c.id === data.activeChat) || data.chats[0];
  if (!chat || !chat.messages || chat.messages.length === 0) return;

  const last = chat.messages[chat.messages.length - 1];
  if (last.role !== 'user' || last.pending === false) return;

  // Queue this message for the orchestrator
  const queue = readJSON(QUEUE_FILE, { pending: [] });
  const alreadyQueued = queue.pending.some(p => p.msgId === last.id);
  if (alreadyQueued) return;

  queue.pending.push({
    chatId: chat.id,
    msgId: last.id,
    text: last.text,
    time: last.time,
    queuedAt: new Date().toISOString()
  });
  writeJSON(QUEUE_FILE, queue);
  console.log(`[QUEUE] Queued message "${last.text.slice(0, 60)}" from chat ${chat.id}`);
}

// Watch for new messages
fs.watch(CHAT_FILE, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkForPending, DEBOUNCE_MS);
});

console.log('[QUEUE] Chat queue manager started, watching chat.json...');
checkForPending();
