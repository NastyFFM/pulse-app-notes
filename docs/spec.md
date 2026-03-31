# Spec: Unified Publishing Panel

## Ziel

Ein Modal-Panel `showPublishingPanel(appId)` das alle Publish/Deploy/Manage-Aktionen einer App in einem strukturierten Panel buendelt. Ersetzt die flache Button-Liste in `renderButtons()`.

---

## Dateien und Aenderungen

### 1. `app-actions.js` — Neue Funktion `showPublishingPanel(appId)`

**Zeile 449** (vor der schliessenden `};`): Neue Methode einfuegen.

```javascript
// Nach Zeile 448, vor der schliessenden };

async showPublishingPanel(appId) {
  // 1. Daten laden
  let app, templates, stackStatus;
  try {
    const [appsR, tplR, stackR] = await Promise.all([
      fetch('/api/apps').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
      fetch('/api/stacks/status').then(r => r.json())
    ]);
    app = (appsR.apps || []).find(a => a.id === appId);
    templates = tplR.templates || [];
    stackStatus = stackR.stacks || [];
  } catch { return; }
  if (!app) return;

  const status = this.getStatus(app);
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // 2. Modal erzeugen
  let overlay = document.getElementById('pub-panel-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'pub-panel-overlay';
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const currentTpl = templates.find(t => t.id === (app.template || 'frontend')) || templates[0];
  const requiredStacks = currentTpl?.stacks || [];

  // 3. HTML rendern
  overlay.innerHTML = '<div class="modal-box pub-panel" style="width:480px;">' +
    // Header
    '<div class="pub-header">' +
      '<div class="pub-app-icon" style="background:' + esc(app.color||'#333') + ';">' + esc(app.icon||'?') + '</div>' +
      '<div><h2>' + esc(app.name||app.id) + '</h2>' +
      '<div class="subtitle">' + esc(app.description||'') + '</div></div>' +
      '<button class="pub-close" onclick="document.getElementById(\'pub-panel-overlay\').remove()">✕</button>' +
    '</div>' +
    '<span class="status-badge ' + status.badgeClass + '">' + status.badge + '</span>' +

    // Sektion 1: GitHub
    '<div class="pub-section">' +
      '<div class="pub-section-title">GitHub</div>' +
      '<div class="pub-section-body" id="pub-github"></div>' +
    '</div>' +

    // Sektion 2: Template + Stacks
    '<div class="pub-section">' +
      '<div class="pub-section-title">Deployment</div>' +
      '<div class="pub-tpl-row">' +
        '<label style="margin:0;">Template</label>' +
        '<select id="pub-tpl-select" class="pub-select">' +
          templates.map(t => '<option value="'+t.id+'"'+(t.id===(app.template||'frontend')?' selected':'')+'>'+esc((t.icon||'')+' '+t.name)+'</option>').join('') +
        '</select>' +
      '</div>' +
      '<div id="pub-stacks"></div>' +
      '<div class="pub-section-body" id="pub-deploy"></div>' +
    '</div>' +

    // Sektion 3: Live
    '<div class="pub-section" id="pub-live-section" style="display:' + (status.isDeployed ? 'block' : 'none') + ';">' +
      '<div class="pub-section-title">Live</div>' +
      '<div class="pub-section-body" id="pub-live"></div>' +
    '</div>' +

    // Sektion 4: Verwalten
    '<div class="pub-section">' +
      '<div class="pub-section-title">Verwalten</div>' +
      '<div class="pub-section-body" id="pub-manage"></div>' +
    '</div>' +

  '</div>';

  document.body.appendChild(overlay);

  // 4. Sektionen befuellen
  this._renderPubGitHub(app, status);
  this._renderPubStacks(requiredStacks, stackStatus);
  this._renderPubDeploy(app, status);
  this._renderPubLive(app, status);
  this._renderPubManage(app, status);

  // 5. Template-Wechsel Handler
  document.getElementById('pub-tpl-select').onchange = async (e) => {
    const tplId = e.target.value;
    const tpl = templates.find(t => t.id === tplId);
    const stacks = tpl?.stacks || [];
    // Speichere Template-Wahl
    try {
      await fetch('/api/apps/' + appId + '/meta', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: tplId, stacks })
      });
    } catch {}
    // Stacks-Anzeige aktualisieren
    this._renderPubStacks(stacks, stackStatus);
  };
},

_renderPubGitHub(app, status) {
  const el = document.getElementById('pub-github');
  if (!el) return;
  const id = app.id;
  if (status.isPublished) {
    el.innerHTML =
      '<div class="pub-row">' +
        '<span class="pub-label">✅ Auf GitHub</span>' +
        '<a href="' + (app.source||'') + '" target="_blank" class="pub-link">Repo oeffnen</a>' +
      '</div>' +
      '<div class="pub-btn-row">' +
        '<button class="pub-btn" id="pub-push-btn" onclick="AppActions._uiPublish(\'' + id + '\', this)">Update pushen</button>' +
      '</div>';
  } else {
    el.innerHTML =
      '<div class="pub-row"><span class="pub-label">Noch nicht auf GitHub</span></div>' +
      '<div class="pub-btn-row">' +
        '<button class="pub-btn primary" id="pub-publish-btn" onclick="AppActions._uiPublish(\'' + id + '\', this)">Auf GitHub publishen</button>' +
      '</div>';
  }
},

_renderPubStacks(requiredStacks, allStackStatus) {
  const el = document.getElementById('pub-stacks');
  if (!el) return;
  if (!requiredStacks.length) {
    el.innerHTML = '<div class="pub-hint">Keine externen Services noetig (Frontend-only)</div>';
    return;
  }
  el.innerHTML = requiredStacks.map(sId => {
    const s = allStackStatus.find(x => x.id === sId);
    const ready = s?.ready;
    const icon = ready ? '✅' : '⚠️';
    const label = sId.charAt(0).toUpperCase() + sId.slice(1);
    const action = ready
      ? '<span class="pub-stack-ready">Bereit</span>'
      : '<button class="pub-btn small" onclick="AppActions.onboardStack(\'' + sId + '\', this)">Einrichten</button>';
    return '<div class="pub-stack-row">' + icon + ' <span>' + label + '</span>' + action + '</div>';
  }).join('');
},

_renderPubDeploy(app, status) {
  const el = document.getElementById('pub-deploy');
  if (!el) return;
  const id = app.id;
  if (status.isDeployed) {
    el.innerHTML = '<button class="pub-btn" onclick="AppActions._uiSmartDeploy(\'' + id + '\', this)">↻ Redeploy</button>';
  } else {
    el.innerHTML = '<button class="pub-btn primary" onclick="AppActions._uiSmartDeploy(\'' + id + '\', this)">🚀 Deploy</button>';
  }
},

_renderPubLive(app, status) {
  const el = document.getElementById('pub-live');
  if (!el) return;
  if (!status.isDeployed) return;
  const url = app.deployUrl || app.railwayUrl || app.vercelUrl || '';
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let html = '<div class="pub-row"><a href="' + esc(url) + '" target="_blank" class="pub-link">🟢 ' + esc(url) + '</a></div>';
  if (app.deployDashboardUrl) {
    html += '<div class="pub-row"><a href="' + esc(app.deployDashboardUrl) + '" target="_blank" class="pub-link">Provider Dashboard</a></div>';
  } else if (app.railwayProjectId) {
    html += '<div class="pub-row"><a href="https://railway.com/project/' + esc(app.railwayProjectId) + '" target="_blank" class="pub-link">🚂 Railway Dashboard</a></div>';
  }
  html += '<div class="pub-btn-row"><button class="pub-btn danger" onclick="AppActions._uiUndeploy(\'' + app.id + '\', \'' + esc(app.name||app.id) + '\', this)">Undeploy</button></div>';
  el.innerHTML = html;
},

_renderPubManage(app, status) {
  const el = document.getElementById('pub-manage');
  if (!el) return;
  const id = app.id;
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const name = esc(app.name || app.id);
  let html = '';
  if (app.installed !== false) {
    html += '<button class="pub-btn" onclick="AppActions._uiHide(\'' + id + '\')">Ausblenden</button>';
    html += '<button class="pub-btn danger" onclick="AppActions._uiDelete(\'' + id + '\', \'' + name + '\', ' + status.isPublished + ')">Loeschen</button>';
  } else {
    html += '<button class="pub-btn" onclick="AppActions._uiUnhide(\'' + id + '\')">Wieder anzeigen</button>';
  }
  if (status.isPublished) {
    html += '<button class="pub-btn danger" onclick="AppActions._uiDeleteRemote(\'' + id + '\', \'' + name + '\')">Von GitHub loeschen</button>';
  }
  el.innerHTML = '<div class="pub-btn-row">' + html + '</div>';
},
```

### 2. `dashboard.html` — CSS (nach Zeile 1244, vor `/* Responsive */`)

Einfuegen nach Zeile 1244 (`.modal-box .btn-secondary:hover`):

```css
/* ── Publishing Panel ── */
.pub-panel { padding: 0; }
.pub-header {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 24px 12px;
  position: relative;
}
.pub-header h2 { font-size: 15px; margin: 0; }
.pub-header .subtitle { margin: 2px 0 0; }
.pub-app-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 600; color: #fff; flex-shrink: 0;
}
.pub-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none; color: var(--text-dim);
  font-size: 16px; cursor: pointer; padding: 4px 8px;
  border-radius: 4px;
}
.pub-close:hover { background: var(--bg-card-hover); color: var(--text); }
.pub-panel .status-badge {
  margin: 0 24px 8px; display: inline-block;
  font-size: 9px; padding: 2px 8px; border-radius: 4px;
  background: var(--bg-card); color: var(--text-dim);
}
.pub-panel .status-badge.badge-deployed { color: var(--green); border: 1px solid rgba(34,197,94,0.3); }
.pub-panel .status-badge.badge-published { color: var(--teal); border: 1px solid rgba(78,205,196,0.3); }
.pub-panel .status-badge.badge-local { color: var(--amber); border: 1px solid rgba(245,166,35,0.3); }
.pub-section {
  border-top: 1px solid var(--border);
  padding: 14px 24px;
}
.pub-section-title {
  font-size: 10px; font-weight: 600; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.06em;
  margin-bottom: 10px;
}
.pub-section-body { display: flex; flex-direction: column; gap: 8px; }
.pub-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px;
}
.pub-label { color: var(--text-dim); font-size: 11px; }
.pub-link {
  color: var(--teal); text-decoration: none; font-size: 11px;
}
.pub-link:hover { text-decoration: underline; }
.pub-hint {
  font-size: 10px; color: var(--text-muted); padding: 4px 0;
}
.pub-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
.pub-btn {
  padding: 6px 14px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text); font: 11px var(--font);
  cursor: pointer; transition: all 0.15s;
}
.pub-btn:hover { border-color: var(--teal); }
.pub-btn:disabled { opacity: 0.5; cursor: default; }
.pub-btn.primary {
  background: var(--teal); color: var(--bg); border-color: var(--teal);
  font-weight: 600;
}
.pub-btn.primary:hover { opacity: 0.9; }
.pub-btn.danger { border-color: var(--red); color: var(--red); }
.pub-btn.danger:hover { background: var(--red); color: #fff; }
.pub-btn.small { padding: 3px 8px; font-size: 9px; }
.pub-tpl-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.pub-select {
  padding: 4px 8px; border-radius: 5px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text); font: 11px var(--font);
  cursor: pointer; max-width: 220px;
}
.pub-stack-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; padding: 4px 0;
}
.pub-stack-row span { flex: 1; }
.pub-stack-ready { color: var(--green); font-size: 10px; }
```

### 3. `dashboard.html` — Edit-Panel Publish-Button (Zeile 2013)

**Ersetze Zeile 2013:**
```
'<div class="edit-app-actions" id="edit-actions-' + winId + '"></div>' +
```
**Mit:**
```
'<div class="edit-app-actions" id="edit-actions-' + winId + '">' +
  '<button class="edit-action-btn" onclick="AppActions.showPublishingPanel(\'' + app.id + '\')">🚀 Publish / Deploy</button>' +
'</div>' +
```

Damit gibt es im Edit-Panel einen dedizierten Einstiegspunkt. Die alte `renderEditActions()` Funktion (Zeile 2129) befuellt den Container trotzdem weiterhin — der Button wird dabei ueberschrieben, was OK ist (renderEditActions laeuft async und setzt innerHTML). **Alternative:** `renderEditActions` so aendern, dass sie NUR den Publish-Button rendert statt der flachen Liste. Das ist sauberer:

### 3b. `dashboard.html` — `renderEditActions()` vereinfachen (Zeile 2129-2146)

**Ersetze Zeilen 2129-2146:**
```javascript
async function renderEditActions(winId, appId) {
  const el = document.getElementById('edit-actions-' + winId);
  if (!el) return;
  el.innerHTML = '<button class="edit-action-btn" onclick="AppActions.showPublishingPanel(\'' + appId + '\')">🚀 Publish / Deploy</button>';
}
```

Die alte Logik (AppActions.renderButtons flat list, checkDeployStatus, _onUpdate) wird komplett durch das Panel ersetzt.

### 4. `dashboard.html` — postMessage Handler (Zeile 3995-4026)

**Nach Zeile 4025** (vor der schliessenden `});`): Neuen Message-Typ hinzufuegen:

```javascript
if (e.data && e.data.type === 'show-publishing-panel' && e.data.appId) {
  if (window.AppActions) AppActions.showPublishingPanel(e.data.appId);
}
```

### 5. `apps/store/index.html` — Button in renderMyApps (Zeile 284)

**Ersetze Zeile 284:**
```javascript
actions = AppActions.renderButtons(a, { onOpen: 'openAppInPulse', showDeploy: true });
```
**Mit:**
```javascript
actions = '<button class="action-btn" onclick="openAppInPulse(\'' + esc(a.id) + '\')">Oeffnen</button>' +
  '<button class="action-btn" onclick="window.parent.postMessage({type:\'show-publishing-panel\',appId:\'' + esc(a.id) + '\'},\'*\')">🚀 Publish</button>';
```

---

## Ablauf Template-Wechsel aktualisiert Stacks

1. User waehlt neues Template im `#pub-tpl-select`
2. `onchange` Handler liest `tpl.stacks` aus der geladenen Template-Liste
3. Speichert via `PUT /api/apps/:id/meta` mit `{ template, stacks }`
4. Ruft `_renderPubStacks(newStacks, stackStatus)` auf
5. Stack-Anzeige zeigt sofort die neuen erforderlichen Stacks mit Status

## Ablauf Store oeffnet Panel im Dashboard

1. Store-Button sendet `postMessage({ type: 'show-publishing-panel', appId }, '*')`
2. Dashboard `window.addEventListener('message')` faengt es ab
3. Ruft `AppActions.showPublishingPanel(appId)` auf
4. Panel erscheint als Modal-Overlay

## Ablauf Edit-Panel oeffnet Publishing Panel

1. Edit-Panel zeigt einen einzigen "🚀 Publish / Deploy" Button
2. Klick ruft `AppActions.showPublishingPanel(appId)` direkt auf
3. Panel erscheint ueber dem Edit-Panel

---

## Implementierungs-Reihenfolge

1. **CSS** in `dashboard.html` einfuegen (Zeile 1244) — kein Risiko, rein additiv
2. **`showPublishingPanel()` + Render-Helfer** in `app-actions.js` (Zeile 448) — Kern-Feature
3. **Edit-Panel Button** in `dashboard.html` — `renderEditActions` vereinfachen (Zeile 2129)
4. **postMessage Handler** in `dashboard.html` (Zeile 4025) — Bridge fuer Store
5. **Store Button** in `apps/store/index.html` (Zeile 284) — Store-Integration

## Nicht aendern

- `server.js` — Keine Server-Aenderungen noetig
- `AppActions.renderButtons()` — Bleibt als Fallback fuer andere Kontexte
- `AppActions.onboardStack()` — Wird unveraendert vom Panel aufgerufen
- Bestehende API-Endpoints — Alles existiert bereits

## Refresh nach Aktionen

`AppActions._onUpdate` wird weiterhin genutzt. Im Publishing-Panel Context:
- Nach Publish/Deploy/Hide etc. soll das Panel sich selbst neu rendern
- Loesung: `_onUpdate` Callback setzt man vor dem Panel-Aufruf:

In `showPublishingPanel`, am Ende nach dem Rendern:
```javascript
this._onUpdate = (id, action) => {
  // Panel neu laden
  this.showPublishingPanel(appId);
};
```

Das schliesst das alte Panel und oeffnet ein neues mit aktuellen Daten.
