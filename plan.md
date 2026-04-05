# Plan: Nächste Session — Eigenständige Apps + Deploy

## Aktueller Stand (2026-04-04)
- Branch: feature/app-maker-v2
- Phase 1-4 implementiert und verifiziert
- Agent-Infrastruktur: 4 Agents, 3 Deploy-Skills, /build-app Command
- Orchestrator: 4-Phasen-Flow (Code → Test → Review → Git+PR)
- Smart Autodetect: Keywords entscheiden ob orchestriert oder quick
- Agent Dashboard: Live-Monitoring aller Worker, Agents, Skills, MCP, Files
- Playwright MCP für visuelle Verifikation

## Nächste Schritte

### 1. ✅ Eigenständige Apps (Default) vs System-Apps
- quickCreateApp() + showCreateDialog(): Radio-Buttons "📦 Eigenständig" (default) / "🏠 System-App"
- /api/apps/create akzeptiert `standalone: true` → erstellt in ~/Documents/GitHub/pulse-app-<name>/
- Git-Repo wird automatisch initialisiert
- apps.json speichert `standalone: true` + `path` für externe Apps
- resolveAppDir() prüft standalone-Pfad zuerst
- Orchestrator-Prompt: Phase 1 + Phase 4 standalone-aware
- sendEdit() übergibt standalone-Flag an Worker

### 2. Self-Improve mit Playwright MCP verifizieren
- Worker ändert dashboard.html → Playwright prüft visuell → Fix-Loop
- Der Tooltip-Test der vorher fehlschlug nochmal versuchen

### 3. Dashboard-Flackern fixen
- Polling (5s) durch SSE ersetzen für Worker-Updates
- Oder: nur DOM-Diff statt innerHTML-Replace

### 4. /build-app Command testen
- Slash-Command in Claude Code Session testen
