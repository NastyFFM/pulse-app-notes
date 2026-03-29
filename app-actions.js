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

    // Deploy
    if (opts.showDeploy) {
      html += '<button class="action-btn" onclick="' + prefix + '._uiSmartDeploy(\'' + id + '\', this)">🚀 Deploy</button>';
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

  // Smart Deploy: checks stacks, runs onboarding if needed, then deploys
  async _uiSmartDeploy(appId, btn) {
    // 1. Check which stacks are ready
    let stackStatus;
    try { const r = await fetch('/api/stacks/status'); stackStatus = await r.json(); } catch { stackStatus = { stacks: [] }; }
    const railway = (stackStatus.stacks || []).find(s => s.id === 'railway');

    // 2. If Railway not ready → run onboarding
    if (!railway || !railway.ready) {
      await this.onboardStack('railway', btn);
      // Re-check
      try { const r = await fetch('/api/stacks/status'); stackStatus = await r.json(); } catch {}
      const railwayNow = (stackStatus.stacks || []).find(s => s.id === 'railway');
      if (!railwayNow?.ready) {
        if (btn) { btn.textContent = '🚀 Deploy'; btn.disabled = false; }
        return;
      }
    }

    // 3. Deploy
    await this._uiDeploy(appId, btn);
  },

  // Generic stack onboarding wizard — renders inline in a container element
  // container: DOM element to render wizard into (or null for modal)
  async onboardStack(stackId, btn, container) {
    let stacks;
    try { const r = await fetch('/api/stacks'); stacks = await r.json(); } catch { return; }
    const stack = (stacks.stacks || []).find(s => s.id === stackId);
    if (!stack) return;

    // Find or create wizard container
    if (!container) {
      container = document.getElementById('onboarding-wizard');
      if (!container) {
        container = document.createElement('div');
        container.id = 'onboarding-wizard';
        container.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100000;background:var(--bg-card,#151520);border:1px solid var(--border,#1e1e2e);border-radius:12px;padding:20px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui;color:var(--text,#e0e0e0);';
        document.body.appendChild(container);
      }
    }

    const steps = (stack.onboarding || []).filter(s => !s.auto); // non-auto steps for progress
    const totalSteps = steps.length;
    let currentStep = 0;

    for (const step of (stack.onboarding || [])) {
      // Auto CLI install — no UI needed
      if (step.auto && step.command) {
        if (btn) btn.textContent = '⏳ ' + step.title + '...';
        try {
          const r = await fetch('/api/stacks/install-cli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: step.command }) });
          const d = await r.json();
          if (!d.ok) { container.innerHTML = '<div style="color:#e74c3c;">' + step.title + ' fehlgeschlagen</div>'; return; }
        } catch { return; }
        continue;
      }

      currentStep++;

      // Check if key already exists
      if (step.envVar) {
        try {
          const env = await fetch('/api/env').then(r => r.json());
          if (env[step.envVar]) continue;
        } catch {}
      }

      // Render wizard step
      const result = await new Promise(resolve => {
        let html = '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">' + stack.icon + ' ' + stack.name + ' einrichten</div>';
        html += '<div style="font-size:10px;color:var(--text-dim,#888);margin-bottom:12px;">Schritt ' + currentStep + '/' + totalSteps + '</div>';
        html += '<div style="height:3px;background:var(--border,#1e1e2e);border-radius:2px;margin-bottom:16px;"><div style="height:100%;background:var(--teal,#4ecdc4);border-radius:2px;width:' + Math.round(currentStep / totalSteps * 100) + '%;"></div></div>';
        html += '<div style="font-size:13px;font-weight:500;margin-bottom:6px;">' + (step.title || '') + '</div>';
        html += '<div style="font-size:11px;color:var(--text-dim,#aaa);margin-bottom:12px;line-height:1.5;">' + (step.instruction || '') + '</div>';

        if (step.url) {
          html += '<a href="' + step.url + '" target="_blank" style="display:inline-block;margin-bottom:12px;padding:6px 12px;background:var(--teal,#4ecdc4);color:#000;border-radius:6px;text-decoration:none;font-size:11px;font-weight:600;">🔗 ' + (new URL(step.url).hostname) + ' oeffnen</a><br>';
        }

        if (step.step === 'paste-token') {
          html += '<input type="text" id="wizard-input" placeholder="' + (step.placeholder || 'Hier einfuegen...') + '" style="width:100%;padding:8px 10px;background:var(--bg,#0d0d14);border:1px solid var(--border,#1e1e2e);border-radius:6px;color:var(--text,#e0e0e0);font-size:12px;font-family:monospace;margin-bottom:12px;box-sizing:border-box;">';
          html += '<div style="display:flex;gap:8px;">';
          html += '<button id="wizard-next" style="flex:1;padding:8px;background:var(--teal,#4ecdc4);color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Weiter →</button>';
          html += '<button id="wizard-cancel" style="padding:8px 12px;background:none;border:1px solid var(--border,#1e1e2e);color:var(--text-dim,#888);border-radius:6px;font-size:11px;cursor:pointer;">Abbrechen</button>';
          html += '</div>';
        } else if (step.step === 'account') {
          html += '<div style="display:flex;gap:8px;">';
          html += '<button id="wizard-next" style="flex:1;padding:8px;background:var(--teal,#4ecdc4);color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Fertig, weiter →</button>';
          html += '<button id="wizard-cancel" style="padding:8px 12px;background:none;border:1px solid var(--border,#1e1e2e);color:var(--text-dim,#888);border-radius:6px;font-size:11px;cursor:pointer;">Abbrechen</button>';
          html += '</div>';
        } else if (step.step === 'cli-login') {
          html += '<div id="wizard-status" style="text-align:center;padding:12px;font-size:11px;">⏳ Warte auf Login im Browser...</div>';
          html += '<button id="wizard-cancel" style="width:100%;padding:8px;background:none;border:1px solid var(--border,#1e1e2e);color:var(--text-dim,#888);border-radius:6px;font-size:11px;cursor:pointer;">Abbrechen</button>';
        }

        container.innerHTML = html;
        container.style.display = 'block';

        // Open URL automatically for account steps
        if (step.step === 'account' && step.url) {
          window.open(step.url, '_blank');
        }

        // Handle paste-token step
        if (step.step === 'paste-token') {
          const nextBtn = container.querySelector('#wizard-next');
          const input = container.querySelector('#wizard-input');
          const cancelBtn = container.querySelector('#wizard-cancel');
          nextBtn.onclick = () => { const v = input.value.trim(); if (v) resolve(v); else input.style.borderColor = '#e74c3c'; };
          input.onkeydown = (e) => { if (e.key === 'Enter') nextBtn.click(); };
          cancelBtn.onclick = () => resolve(null);
          setTimeout(() => input.focus(), 100);
        }
        // Handle account step
        else if (step.step === 'account') {
          container.querySelector('#wizard-next').onclick = () => resolve('ok');
          container.querySelector('#wizard-cancel').onclick = () => resolve(null);
        }
        // Handle cli-login step — open Terminal app + send command
        else if (step.step === 'cli-login') {
          container.querySelector('#wizard-cancel').onclick = () => resolve(null);
          // Open Claude Terminal app in PulseOS
          window.parent?.postMessage({ type: 'open-app', appId: 'claude-terminal' }, '*');
          // Also try opening from top-level (if we're not in iframe)
          if (window.openApp && window.state) {
            const termApp = (state.apps || []).find(a => a.id === 'claude-terminal');
            if (termApp) openApp(termApp);
          }
          // Send login command to terminal
          setTimeout(() => {
            fetch('/api/terminal/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: step.command + '\n' }) }).catch(() => {});
          }, 1000);
          // Update wizard status
          const statusEl = container.querySelector('#wizard-status');
          if (statusEl) statusEl.innerHTML = '🖥 Terminal geoeffnet — bestatige den Login im Browser<br><br><span style="font-size:9px;color:var(--text-dim,#666);">Das Terminal fuehrt den Login automatisch aus. Bestaetige im Browser-Tab.</span>';
          // Poll until logged in
          const poll = setInterval(async () => {
            try {
              const sr = await fetch('/api/stacks/status');
              const ss = await sr.json();
              const s = (ss.stacks || []).find(x => x.id === stackId);
              if (s?.hasKeys || s?.ready) { clearInterval(poll); resolve('ok'); }
            } catch {}
          }, 3000);
          setTimeout(() => { clearInterval(poll); resolve(null); }, 120000);
        }
      });

      // User cancelled
      if (result === null) {
        container.style.display = 'none';
        if (btn) { btn.textContent = '🚀 Deploy'; btn.disabled = false; }
        return;
      }

      // Save key for paste-token steps
      if (step.step === 'paste-token' && step.envVar && result) {
        try {
          await fetch('/api/stacks/save-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envVar: step.envVar, value: result }) });
        } catch {}
      }
    }

    // Done!
    container.innerHTML = '<div style="text-align:center;padding:16px;"><div style="font-size:24px;margin-bottom:8px;">✅</div><div style="font-size:14px;font-weight:600;">' + stack.name + ' bereit!</div></div>';
    setTimeout(() => { container.style.display = 'none'; }, 2000);

    if (btn) { btn.textContent = '✅ ' + stack.name + ' bereit!'; btn.disabled = false; }
    this._deployStatus = null;
    if (this._onUpdate) this._onUpdate(null, 'stack-setup');
  },

  // Legacy — redirects to generic onboardStack
  async _uiSetupRailway(btn) { return this.onboardStack('railway', btn); },

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
