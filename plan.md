# Plan: Playwright MCP für Worker + Visual Verification Loop

## Schritte
1. Playwright MCP installieren + in .mcp.json konfigurieren
2. Worker allowedTools um mcp__playwright erweitern
3. Orchestrator-Prompt: nach Code-Änderung visuell prüfen via Playwright
4. Korrekturschleife: Ändern → Prüfen → Fixen (max 3 Runden)
5. Testen: Self-Improve Task über PulseOS UI
