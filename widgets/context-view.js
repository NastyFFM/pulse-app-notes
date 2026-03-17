/**
 * PulseOS Context View — Universal Reactive Data UI
 *
 * Drop this into any app's index.html to get an auto-generated, editable UI
 * that stays in sync with the JSON data via SSE.
 *
 * Usage:
 *   <div id="context-root"></div>
 *   <script src="/widgets/context-view.js"></script>
 *   <script>
 *     ContextView.init({
 *       el: '#context-root',       // Mount point
 *       appId: 'my-app',           // App ID for API + SSE
 *       dataFile: 'context',       // JSON filename (without .json)
 *       schema: { ... },           // Optional: UI hints
 *       readOnly: false,           // Optional: disable editing
 *       onDataChange: (data) => {} // Optional: callback on any change
 *     });
 *   </script>
 *
 * Data flows:
 *   User edits field → PUT /app/<id>/api/<file> → SSE broadcasts → all clients update
 *   Agent writes JSON → SSE broadcasts → UI auto-updates
 *
 * Schema format (optional):
 *   {
 *     "_title": "Display Title",
 *     "_icon": "emoji",
 *     "_layout": "cards|table|form|auto",
 *     "_primaryKey": "id",
 *     "_listField": "items",       // Which array field is the main list
 *     "fieldName": {
 *       "label": "Display Label",
 *       "type": "text|number|date|datetime|color|select|textarea|boolean|badge|hidden",
 *       "options": ["a","b","c"],   // For select type
 *       "badgeColors": { "Open": "#22c55e", "Done": "#64748b" },
 *       "readOnly": true,
 *       "width": "200px"
 *     }
 *   }
 */

const ContextView = (() => {
  let config = {};
  let data = null;
  let schema = null;
  let sse = null;
  let saveTimer = null;
  let rootEl = null;

  // ── Init ──
  function init(opts) {
    config = {
      el: opts.el || '#context-root',
      appId: opts.appId,
      dataFile: opts.dataFile || 'context',
      schema: opts.schema || null,
      readOnly: opts.readOnly || false,
      onDataChange: opts.onDataChange || null,
      pollInterval: opts.pollInterval || 0, // 0 = SSE only, >0 = also poll
    };

    rootEl = document.querySelector(config.el);
    if (!rootEl) { console.error('[context-view] Mount element not found:', config.el); return; }

    // Load schema if exists (try fetching schema.json)
    if (!config.schema) {
      fetch(`/app/${config.appId}/api/schema`)
        .then(r => r.ok ? r.json() : null)
        .then(s => { if (s && Object.keys(s).length) schema = s; })
        .catch(() => {})
        .finally(() => loadData());
    } else {
      schema = config.schema;
      loadData();
    }

    // SSE for live sync
    connectSSE();

    // Optional polling fallback
    if (config.pollInterval > 0) {
      setInterval(loadData, config.pollInterval);
    }
  }

  // ── Data Loading ──
  async function loadData() {
    try {
      const r = await fetch(`/app/${config.appId}/api/${config.dataFile}`);
      const json = await r.json();
      // Only re-render if data actually changed
      const jsonStr = JSON.stringify(json);
      if (jsonStr !== JSON.stringify(data)) {
        data = json;
        render();
        if (config.onDataChange) config.onDataChange(data);
      }
    } catch (e) {
      console.error('[context-view] Failed to load data:', e);
      rootEl.innerHTML = `<div class="cv-error">Failed to load data</div>`;
    }
  }

  // ── Data Saving (debounced) ──
  function saveData() {
    if (config.readOnly) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await fetch(`/app/${config.appId}/api/${config.dataFile}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (e) {
        console.error('[context-view] Failed to save:', e);
      }
    }, 300); // 300ms debounce
  }

  // ── SSE ──
  function connectSSE() {
    // Don't connect in iframe (PulseOS blocks it)
    if (window.parent !== window && !window.__OrigEventSource) return;
    const ES = window.__OrigEventSource || window.EventSource;
    if (!ES) return;

    sse = new ES(`/sse/${config.appId}`);
    sse.onmessage = (e) => {
      if (e.data === 'connected') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'change' && msg.file === config.dataFile + '.json') {
          loadData(); // Reload on external change
        }
      } catch {}
    };
    sse.onerror = () => {
      setTimeout(() => { if (sse) { sse.close(); connectSSE(); } }, 5000);
    };
  }

  // ── Render ──
  function render() {
    if (!data || !rootEl) return;

    const layout = detectLayout();
    rootEl.className = 'cv-root';
    rootEl.innerHTML = '';

    // Header
    const title = schema?._title || config.dataFile;
    const icon = schema?._icon || '';
    const header = el('div', 'cv-header');
    header.innerHTML = `
      <div class="cv-title">${icon ? icon + ' ' : ''}${title}</div>
      <div class="cv-meta">${formatMeta()}</div>
    `;
    rootEl.appendChild(header);

    // Sync indicator
    const syncDot = el('div', 'cv-sync-dot');
    syncDot.id = 'cv-sync';
    syncDot.title = 'Live sync active';
    header.querySelector('.cv-title').prepend(syncDot);

    // Content
    switch (layout) {
      case 'table': renderTable(); break;
      case 'cards': renderCards(); break;
      case 'form': renderForm(); break;
      default: renderAuto(); break;
    }
  }

  function detectLayout() {
    if (schema?._layout) return schema._layout;
    // Auto-detect: if main data is array of objects → table
    const listField = findListField();
    if (listField && Array.isArray(data[listField]) && data[listField].length > 0) {
      const firstItem = data[listField][0];
      if (typeof firstItem === 'object' && !Array.isArray(firstItem)) {
        return Object.keys(firstItem).length > 5 ? 'table' : 'cards';
      }
    }
    return 'form'; // Default: key-value form
  }

  function findListField() {
    if (schema?._listField) return schema._listField;
    // Find the first array field that contains objects
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        return key;
      }
    }
    return null;
  }

  // ── Table View ──
  function renderTable() {
    const listField = findListField();
    const items = data[listField] || [];
    if (items.length === 0) {
      rootEl.appendChild(emptyState('No items yet'));
      return;
    }

    // Render non-list fields as summary bar
    renderSummaryBar(listField);

    const cols = Object.keys(items[0]).filter(k => !isHidden(k));
    const table = el('div', 'cv-table-wrap');
    const t = el('table', 'cv-table');

    // Header
    const thead = el('thead');
    const tr = el('tr');
    cols.forEach(col => {
      const th = el('th');
      th.textContent = getLabel(col);
      th.style.width = getWidth(col);
      tr.appendChild(th);
    });
    if (!config.readOnly) {
      const actionTh = el('th');
      actionTh.textContent = '';
      actionTh.style.width = '40px';
      tr.appendChild(actionTh);
    }
    thead.appendChild(tr);
    t.appendChild(thead);

    // Body
    const tbody = el('tbody');
    items.forEach((item, idx) => {
      const row = el('tr');
      row.dataset.idx = idx;
      cols.forEach(col => {
        const td = el('td');
        td.appendChild(renderField(col, item[col], (val) => {
          data[listField][idx][col] = val;
          saveData();
        }));
        row.appendChild(td);
      });
      if (!config.readOnly) {
        const actionTd = el('td');
        const delBtn = el('button', 'cv-btn-icon cv-btn-danger');
        delBtn.textContent = '×';
        delBtn.title = 'Delete';
        delBtn.onclick = () => {
          data[listField].splice(idx, 1);
          saveData();
          render();
        };
        actionTd.appendChild(delBtn);
        row.appendChild(actionTd);
      }
      tbody.appendChild(row);
    });
    t.appendChild(tbody);
    table.appendChild(t);
    rootEl.appendChild(table);

    // Add button
    if (!config.readOnly) {
      const addBar = el('div', 'cv-add-bar');
      const addBtn = el('button', 'cv-btn cv-btn-add');
      addBtn.textContent = '+ Add';
      addBtn.onclick = () => {
        const template = {};
        cols.forEach(col => {
          const sample = items[0]?.[col];
          if (typeof sample === 'number') template[col] = 0;
          else if (typeof sample === 'boolean') template[col] = false;
          else template[col] = '';
        });
        // Auto-increment ID
        const pk = schema?._primaryKey || 'id';
        if (pk in template) {
          const maxId = Math.max(0, ...items.map(i => typeof i[pk] === 'number' ? i[pk] : 0));
          template[pk] = maxId + 1;
        }
        data[listField].push(template);
        saveData();
        render();
      };
      addBar.appendChild(addBtn);
      rootEl.appendChild(addBar);
    }
  }

  // ── Cards View ──
  function renderCards() {
    const listField = findListField();
    const items = data[listField] || [];

    renderSummaryBar(listField);

    if (items.length === 0) {
      rootEl.appendChild(emptyState('No items yet'));
      if (!config.readOnly) rootEl.appendChild(addButton(listField, items));
      return;
    }

    const grid = el('div', 'cv-cards');
    items.forEach((item, idx) => {
      const card = el('div', 'cv-card');
      const keys = Object.keys(item).filter(k => !isHidden(k));

      keys.forEach(key => {
        const row = el('div', 'cv-card-row');
        const label = el('span', 'cv-card-label');
        label.textContent = getLabel(key);
        const value = el('span', 'cv-card-value');
        value.appendChild(renderField(key, item[key], (val) => {
          data[listField][idx][key] = val;
          saveData();
        }));
        row.appendChild(label);
        row.appendChild(value);
        card.appendChild(row);
      });

      if (!config.readOnly) {
        const actions = el('div', 'cv-card-actions');
        const delBtn = el('button', 'cv-btn-icon cv-btn-danger');
        delBtn.textContent = '× Delete';
        delBtn.onclick = () => { data[listField].splice(idx, 1); saveData(); render(); };
        actions.appendChild(delBtn);
        card.appendChild(actions);
      }

      grid.appendChild(card);
    });
    rootEl.appendChild(grid);

    if (!config.readOnly) rootEl.appendChild(addButton(listField, items));
  }

  // ── Form View ──
  function renderForm() {
    const form = el('div', 'cv-form');
    Object.entries(data).forEach(([key, val]) => {
      if (isHidden(key)) return;
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        // Nested array → mini table
        const section = el('div', 'cv-form-section');
        const sectionTitle = el('div', 'cv-form-section-title');
        sectionTitle.textContent = getLabel(key) + ` (${val.length})`;
        section.appendChild(sectionTitle);
        // Render as collapsed summary
        const preview = el('div', 'cv-form-preview');
        preview.textContent = val.slice(0, 3).map(i => i.title || i.name || i.id || JSON.stringify(i).substring(0, 40)).join(', ') + (val.length > 3 ? '...' : '');
        section.appendChild(preview);
        form.appendChild(section);
        return;
      }
      if (Array.isArray(val) && val.every(v => typeof v === 'string')) {
        // String array → tags
        const row = el('div', 'cv-form-row');
        const label = el('label', 'cv-form-label');
        label.textContent = getLabel(key);
        const tags = el('div', 'cv-tags');
        val.forEach((v, i) => {
          const tag = el('span', 'cv-tag');
          tag.textContent = v;
          if (!config.readOnly) {
            tag.style.cursor = 'pointer';
            tag.onclick = () => {
              const newVal = prompt(`Edit "${v}":`, v);
              if (newVal !== null) { data[key][i] = newVal; saveData(); render(); }
            };
          }
          tags.appendChild(tag);
        });
        row.appendChild(label);
        row.appendChild(tags);
        form.appendChild(row);
        return;
      }

      const row = el('div', 'cv-form-row');
      const label = el('label', 'cv-form-label');
      label.textContent = getLabel(key);
      const value = el('div', 'cv-form-value');
      value.appendChild(renderField(key, val, (newVal) => {
        data[key] = newVal;
        saveData();
      }));
      row.appendChild(label);
      row.appendChild(value);
      form.appendChild(row);
    });
    rootEl.appendChild(form);
  }

  // ── Auto View (mixed) ──
  function renderAuto() {
    renderForm(); // Form handles everything adaptively
  }

  // ── Field Renderers ──
  function renderField(key, value, onChange) {
    const fieldSchema = schema?.[key] || {};
    const type = fieldSchema.type || inferType(key, value);
    const readOnly = config.readOnly || fieldSchema.readOnly;

    if (type === 'hidden') return el('span');

    if (type === 'badge') {
      const badge = el('span', 'cv-badge');
      badge.textContent = value;
      const colors = fieldSchema.badgeColors || {};
      badge.style.background = colors[value] || '#334155';
      if (!readOnly && fieldSchema.options) {
        badge.style.cursor = 'pointer';
        badge.onclick = () => {
          const opts = fieldSchema.options;
          const next = opts[(opts.indexOf(value) + 1) % opts.length];
          onChange(next);
          badge.textContent = next;
          badge.style.background = colors[next] || '#334155';
          flashSync();
        };
      }
      return badge;
    }

    if (type === 'boolean') {
      const cb = el('input', 'cv-checkbox');
      cb.type = 'checkbox';
      cb.checked = !!value;
      cb.disabled = readOnly;
      cb.onchange = () => { onChange(cb.checked); flashSync(); };
      return cb;
    }

    if (type === 'select' && fieldSchema.options) {
      const sel = el('select', 'cv-select');
      sel.disabled = readOnly;
      fieldSchema.options.forEach(opt => {
        const o = el('option');
        o.value = opt;
        o.textContent = opt;
        o.selected = opt === value;
        sel.appendChild(o);
      });
      sel.onchange = () => { onChange(sel.value); flashSync(); };
      return sel;
    }

    if (type === 'color') {
      const wrap = el('span', 'cv-color-wrap');
      const swatch = el('input', 'cv-color');
      swatch.type = 'color';
      swatch.value = value || '#000000';
      swatch.disabled = readOnly;
      swatch.oninput = () => { onChange(swatch.value); flashSync(); };
      wrap.appendChild(swatch);
      const label = el('span', 'cv-color-label');
      label.textContent = value;
      wrap.appendChild(label);
      return wrap;
    }

    if (type === 'textarea') {
      const ta = el('textarea', 'cv-textarea');
      ta.value = value || '';
      ta.readOnly = readOnly;
      ta.oninput = () => { onChange(ta.value); flashSync(); };
      return ta;
    }

    if (type === 'number') {
      const inp = el('input', 'cv-input');
      inp.type = 'number';
      inp.value = value;
      inp.readOnly = readOnly;
      inp.oninput = () => { onChange(Number(inp.value)); flashSync(); };
      return inp;
    }

    if (type === 'date' || type === 'datetime') {
      const inp = el('input', 'cv-input');
      inp.type = type === 'datetime' ? 'datetime-local' : 'date';
      inp.value = value || '';
      inp.readOnly = readOnly;
      inp.oninput = () => { onChange(inp.value); flashSync(); };
      return inp;
    }

    // Default: text
    const inp = el('input', 'cv-input');
    inp.type = 'text';
    inp.value = value ?? '';
    inp.readOnly = readOnly;
    inp.oninput = () => { onChange(inp.value); flashSync(); };
    return inp;
  }

  function inferType(key, value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') {
      if (/^#[0-9a-f]{6}$/i.test(value)) return 'color';
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime';
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
      if (value.length > 100) return 'textarea';
    }
    return 'text';
  }

  // ── Helpers ──
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function getLabel(key) {
    if (schema?.[key]?.label) return schema[key].label;
    // Convert camelCase/snake_case to Title Case
    return key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
  }

  function getWidth(key) {
    return schema?.[key]?.width || 'auto';
  }

  function isHidden(key) {
    if (key.startsWith('_')) return true;
    return schema?.[key]?.type === 'hidden';
  }

  function formatMeta() {
    const listField = findListField();
    const parts = [];
    if (listField) parts.push(`${data[listField].length} items`);
    if (!config.readOnly) parts.push('editable');
    parts.push('live sync');
    return parts.join(' · ');
  }

  function flashSync() {
    const dot = document.getElementById('cv-sync');
    if (dot) {
      dot.classList.add('cv-saving');
      setTimeout(() => dot.classList.remove('cv-saving'), 600);
    }
  }

  function emptyState(text) {
    const div = el('div', 'cv-empty');
    div.textContent = text;
    return div;
  }

  function addButton(listField, items) {
    const bar = el('div', 'cv-add-bar');
    const btn = el('button', 'cv-btn cv-btn-add');
    btn.textContent = '+ Add';
    btn.onclick = () => {
      const template = {};
      if (items.length > 0) {
        Object.keys(items[0]).forEach(k => {
          const sample = items[0][k];
          if (typeof sample === 'number') template[k] = 0;
          else if (typeof sample === 'boolean') template[k] = false;
          else template[k] = '';
        });
        const pk = schema?._primaryKey || 'id';
        if (pk in template) {
          const maxId = Math.max(0, ...items.map(i => typeof i[pk] === 'number' ? i[pk] : 0));
          template[pk] = maxId + 1;
        }
      }
      data[listField].push(template);
      saveData();
      render();
    };
    bar.appendChild(btn);
    return bar;
  }

  function renderSummaryBar(excludeField) {
    const summaryFields = Object.entries(data).filter(([k, v]) => {
      if (k === excludeField) return false;
      if (k.startsWith('_')) return false;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return false;
      return true;
    });
    if (summaryFields.length === 0) return;

    const bar = el('div', 'cv-summary');
    summaryFields.forEach(([key, val]) => {
      const chip = el('div', 'cv-summary-item');
      const label = el('span', 'cv-summary-label');
      label.textContent = getLabel(key);
      const value = el('span', 'cv-summary-value');
      if (Array.isArray(val)) {
        value.textContent = val.join(', ');
      } else {
        value.textContent = String(val);
      }
      chip.appendChild(label);
      chip.appendChild(value);
      bar.appendChild(chip);
    });
    rootEl.appendChild(bar);
  }

  // ── Public API ──
  return {
    init,
    getData: () => data,
    setData: (d) => { data = d; saveData(); render(); },
    refresh: loadData,
    destroy: () => { if (sse) sse.close(); clearTimeout(saveTimer); }
  };
})();
