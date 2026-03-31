# Review: Unified Publishing Panel

## Erfuellt die Spec? Ja

Alle 5 Aenderungen aus der Spec sind implementiert:
1. `showPublishingPanel(appId)` + 5 Render-Helfer in `app-actions.js:450-620` -- vorhanden
2. Publishing Panel CSS in `dashboard.html:1246-1293` -- vorhanden, exakt wie spezifiziert
3. `renderEditActions()` vereinfacht in `dashboard.html:2214-2218` -- ein Button statt flacher Liste
4. postMessage Handler in `dashboard.html:4098-4100` -- vorhanden
5. Store-Button mit `show-publishing-panel` postMessage in `apps/store/index.html:284-285` -- vorhanden
6. `_onUpdate` Refresh-Pattern in `app-actions.js:531-533` -- vorhanden

## Bugs

1. **XSS: `app.id` nicht escaped in onclick-Handlern** -- `_renderPubGitHub` (app-actions.js:547), `_renderPubDeploy` (app-actions.js:580,582), `_renderPubManage` (app-actions.js:608+). Ein `app.id` mit Apostroph bricht das onclick-Attribut. Fix: `esc()` auf `id` anwenden und Single-Quotes escapen.
2. **XSS: `app.source` nicht escaped** -- `_renderPubGitHub` (app-actions.js:544) setzt `app.source` direkt in `href`. Fix: `esc(app.source||'')`.
3. **XSS: `sId` nicht escaped** -- `_renderPubStacks` (app-actions.js:572) setzt Stack-IDs direkt in onclick. Fix: escapen.
4. **`esc()` in `showPublishingPanel` fehlt Single-Quote-Escaping** -- app-actions.js:465 escaped `"` aber nicht `'`. Die onclick-Handler nutzen Single-Quotes. Fix: `.replace(/'/g,'&#39;')` hinzufuegen (wie in `renderButtons` Zeile 101).

## Sicherheitsprobleme

- **postMessage ohne Origin-Check** -- dashboard.html:4098 prueft nicht `e.origin`. Jede Seite in einem iframe koennte `show-publishing-panel` triggern. Risiko gering (nur UI-Aktion), aber unsauber. Fix: `e.origin === location.origin` pruefen.

## Fix-Vorschlaege

| # | Datei:Zeile | Fix |
|---|------------|-----|
| 1 | app-actions.js:465 | `esc()` um `.replace(/'/g,'&#39;')` erweitern |
| 2 | app-actions.js:539 | `const id = esc(app.id);` statt `const id = app.id;` (nur mit erweitertem esc) |
| 3 | app-actions.js:544 | `href="' + esc(app.source||'') + '"` |
| 4 | app-actions.js:572 | `onclick="AppActions.onboardStack(\'' + esc(sId) + '\', this)"` (esc definieren oder inline) |
| 5 | dashboard.html:4098 | `if (e.origin !== location.origin) return;` vor der Pruefung |
