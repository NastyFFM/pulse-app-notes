// =============================================================================
// PulseOS App Actions — Shared module for Store + Editor
// Usage: <script src="/app-actions.js"></script>
// All functions return Promises. UI feedback (toasts, buttons) is handled by callbacks.
// =============================================================================

const AppActions = {

  // Cached deploy status
  _deployStatus: null,
  async checkDeployStatus() {
    if (this._deployStatus) return this._deployStatus;
    try { const r = await fetch('/api/deploy-status'); this._deployStatus = await r.json(); }
    catch { this._deployStatus = { railway: false, gh: true }; }
    return this._deployStatus;
  },

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
      if (this._deployStatus?.railway && this._deployStatus?.railwayLoggedIn) {
        html += '<button class="action-btn" onclick="' + prefix + '._uiDeploy(\'' + id + '\', this)">🚀 Deploy</button>';
      } else {
        html += '<button class="action-btn" onclick="' + prefix + '._uiSetupRailway(this)">🚀 Deploy einrichten</button>';
      }
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
    // Check env vars first
    try {
      const env = await this.getEnv(appId);
      const hasEnv = Object.keys(env).length > 0;
      if (!hasEnv) {
        const setEnv = confirm('Keine Environment Variables gesetzt.\n\nMoechtest du welche hinzufuegen?\n(z.B. DATABASE_URL, API_KEY)\n\nKlicke OK um den Env-Editor zu oeffnen, oder Abbrechen um ohne zu deployen.');
        if (setEnv) {
          // Find and open the env editor in the edit panel
          const envPanel = document.querySelector('[id^="edit-env-"]');
          if (envPanel) { envPanel.style.display = 'block'; return; }
        }
      }
    } catch {}

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Deploying...'; }
    const d = await this.deploy(appId);
    if (d.ok) {
      const url = d.url || d.github || '';
      if (btn) {
        btn.textContent = '✅ Live';
        if (url) {
          btn.onclick = () => window.open(url, '_blank');
          btn.title = url;
          btn.style.cursor = 'pointer';
          btn.disabled = false;
        }
      }
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

  async _uiSetupRailway(btn) {
    const status = await this.checkDeployStatus();

    // Step 1: Install Railway CLI if not present
    if (!status.railway) {
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Railway CLI installieren...'; }
      try {
        const r = await fetch('/api/deploy-setup/install', { method: 'POST' });
        const d = await r.json();
        if (!d.ok) {
          alert('Installation fehlgeschlagen: ' + (d.error || 'Unbekannter Fehler'));
          if (btn) { btn.textContent = '🚀 Deploy einrichten'; btn.disabled = false; }
          return;
        }
        this._deployStatus = null; // Reset cache
        const newStatus = await this.checkDeployStatus();
        if (!newStatus.railway) {
          alert('Railway CLI konnte nicht installiert werden. Versuche manuell: npm i -g @railway/cli');
          if (btn) { btn.textContent = '🚀 Deploy einrichten'; btn.disabled = false; }
          return;
        }
      } catch (e) {
        alert('Fehler: ' + e.message);
        if (btn) { btn.textContent = '🚀 Deploy einrichten'; btn.disabled = false; }
        return;
      }
    }

    // Step 2: Login if not logged in
    this._deployStatus = null;
    const status2 = await this.checkDeployStatus();
    if (!status2.railwayLoggedIn) {
      if (btn) { btn.textContent = '⏳ Railway Login...'; }
      try {
        const r = await fetch('/api/deploy-setup/login', { method: 'POST' });
        const d = await r.json();
        if (d.loginUrl) {
          // Open login URL in new tab
          window.open(d.loginUrl, '_blank');
          if (btn) { btn.textContent = '🔐 Login im Browser bestaetigen...'; }
          // Poll until logged in (user completes auth in browser)
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            this._deployStatus = null;
            const s = await this.checkDeployStatus();
            if (s.railwayLoggedIn) break;
          }
        }
      } catch (e) {
        alert('Login Fehler: ' + e.message);
        if (btn) { btn.textContent = '🚀 Deploy einrichten'; btn.disabled = false; }
        return;
      }
    }

    // Step 3: Check final status
    this._deployStatus = null;
    const final = await this.checkDeployStatus();
    if (final.railway && final.railwayLoggedIn) {
      if (btn) { btn.textContent = '✅ Railway bereit!'; btn.disabled = false; }
      if (this._onUpdate) this._onUpdate(null, 'railway-setup');
    } else {
      if (btn) { btn.textContent = '🚀 Deploy einrichten'; btn.disabled = false; }
      alert('Railway Setup nicht abgeschlossen. Bitte Login im Browser bestaetigen.');
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
