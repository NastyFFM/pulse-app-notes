// =============================================================================
// PulseOS App Actions — Shared module for Store + Editor
// Usage: <script src="/app-actions.js"></script>
// All functions return Promises. UI feedback (toasts, buttons) is handled by callbacks.
// =============================================================================

const AppActions = {

  // Publish app to GitHub via gh CLI
  async publish(appId, opts = {}) {
    const r = await fetch('/api/apps/' + appId + '/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: opts.visibility || 'private' })
    });
    return r.json();
  },

  // Push update to existing GitHub repo
  async pushUpdate(appId) {
    return this.publish(appId); // Same endpoint, handles existing repos
  },

  // Deploy to Railway (auto-publishes to GitHub first if needed)
  async deploy(appId) {
    const r = await fetch('/api/apps/' + appId + '/deploy', { method: 'POST' });
    return r.json();
  },

  // Hide app (soft uninstall — remove from launcher, keep files)
  async hide(appId) {
    const r = await fetch('/api/apps/' + appId + '/hide', { method: 'POST' });
    return r.json();
  },

  // Unhide app (re-add to launcher)
  async unhide(appId) {
    const r = await fetch('/api/apps/' + appId + '/unhide', { method: 'POST' });
    return r.json();
  },

  // Delete app locally (files + registry)
  async deleteLocal(appId) {
    const r = await fetch('/api/apps/uninstall', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId })
    });
    return r.json();
  },

  // Delete GitHub repo
  async deleteRemote(appId) {
    const r = await fetch('/api/apps/' + appId + '/delete-remote', { method: 'POST' });
    return r.json();
  },

  // Install app from GitHub URL
  async install(sourceUrl) {
    const r = await fetch('/api/apps/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl })
    });
    return r.json();
  },

  // Get/Set environment variables
  async getEnv(appId) {
    const r = await fetch('/api/apps/' + appId + '/env');
    return r.json();
  },

  async setEnv(appId, vars) {
    const r = await fetch('/api/apps/' + appId + '/env', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vars)
    });
    return r.json();
  },

  // Get app status info
  getStatus(app) {
    const isPublished = !!app.source;
    const isHidden = app.installed === false;
    const isLocal = !app.source;
    let badge = isPublished ? 'Published' : 'Nur lokal';
    let badgeClass = isPublished ? 'badge-published' : 'badge-local';
    if (isHidden) badge += ' · Ausgeblendet';
    return { isPublished, isHidden, isLocal, badge, badgeClass };
  },

  // Render action buttons HTML for an app
  renderButtons(app, opts = {}) {
    const { isPublished, isHidden, isLocal } = this.getStatus(app);
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const id = esc(app.id);
    const name = esc(app.name || app.id);
    const prefix = opts.prefix || 'AppActions'; // Which object to call

    let html = '';

    // Open button
    if (app.installed !== false && opts.onOpen) {
      html += '<button class="action-btn" onclick="' + opts.onOpen + '(\'' + id + '\')">' + (opts.openLabel || 'Oeffnen') + '</button>';
    }

    // Publish / Update
    if (isLocal) {
      html += '<button class="install-btn" onclick="' + prefix + '._uiPublish(\'' + id + '\', this)">Publish on GitHub</button>';
    }
    if (isPublished) {
      html += '<button class="action-btn" onclick="' + prefix + '._uiPublish(\'' + id + '\', this)">Update pushen</button>';
    }

    // Deploy (Railway)
    if (opts.showDeploy) {
      html += '<button class="action-btn" onclick="' + prefix + '._uiDeploy(\'' + id + '\', this)">🚀 Deploy</button>';
    }

    // Hide / Unhide
    if (app.installed !== false) {
      html += '<button class="action-btn" onclick="' + prefix + '._uiHide(\'' + id + '\')">Ausblenden</button>';
    } else {
      html += '<button class="action-btn" onclick="' + prefix + '._uiUnhide(\'' + id + '\')">Wieder anzeigen</button>';
      if (isPublished) {
        html += '<button class="action-btn" onclick="' + prefix + '._uiInstall(\'' + esc(app.source) + '\', this)">Von GitHub installieren</button>';
      }
    }

    // Delete local
    if (app.installed !== false) {
      html += '<button class="action-btn danger" onclick="' + prefix + '._uiDelete(\'' + id + '\', \'' + name + '\', ' + isPublished + ')">Loeschen</button>';
    }

    // Delete remote
    if (isPublished) {
      html += '<button class="action-btn danger" onclick="' + prefix + '._uiDeleteRemote(\'' + id + '\', \'' + name + '\')">Von GitHub loeschen</button>';
    }

    return html;
  },

  // ── UI Wrappers (with confirmations + button feedback) ──

  _onUpdate: null, // Callback after any action: _onUpdate(appId, action)

  async _uiPublish(appId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    const d = await this.publish(appId);
    if (d.ok) {
      if (btn) btn.textContent = '✅';
      if (this._onUpdate) this._onUpdate(appId, 'published');
    } else {
      alert(d.error || 'Fehler beim Publishen');
      if (btn) { btn.textContent = 'Retry'; btn.disabled = false; }
    }
  },

  async _uiDeploy(appId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Deploying...'; }
    const d = await this.deploy(appId);
    if (d.ok) {
      if (btn) btn.textContent = '✅ ' + (d.url || 'Deployed');
      if (this._onUpdate) this._onUpdate(appId, 'deployed');
    } else {
      alert(d.error || 'Deploy fehlgeschlagen');
      if (btn) { btn.textContent = '🚀 Deploy'; btn.disabled = false; }
    }
  },

  async _uiHide(appId) {
    await this.hide(appId);
    if (this._onUpdate) this._onUpdate(appId, 'hidden');
  },

  async _uiUnhide(appId) {
    await this.unhide(appId);
    if (this._onUpdate) this._onUpdate(appId, 'unhidden');
  },

  async _uiDelete(appId, appName, isPublished) {
    const msg = isPublished
      ? 'App "' + appName + '" lokal loeschen? (Bleibt auf GitHub)'
      : 'App "' + appName + '" endgueltig loeschen?';
    if (!confirm(msg)) return;
    await this.deleteLocal(appId);
    if (this._onUpdate) this._onUpdate(appId, 'deleted');
  },

  async _uiDeleteRemote(appId, appName) {
    if (!confirm('GitHub Repo "pulse-app-' + appId + '" loeschen?')) return;
    const d = await this.deleteRemote(appId);
    if (d.ok) {
      if (this._onUpdate) this._onUpdate(appId, 'remote-deleted');
    } else {
      alert(d.error || 'Fehler');
    }
  },

  async _uiInstall(sourceUrl, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    const d = await this.install(sourceUrl);
    if (d.ok) {
      if (btn) btn.textContent = '✅';
      if (this._onUpdate) this._onUpdate(d.appId, 'installed');
    } else {
      if (btn) { btn.textContent = 'Fehler'; setTimeout(() => { btn.textContent = 'Installieren'; btn.disabled = false; }, 2000); }
    }
  }
};
