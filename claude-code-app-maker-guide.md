# Claude Code — Kompletter Guide für deinen App Maker

> CLAUDE.md · Skills · Subagents · Worktrees · MCP · CI/CD

---

## Das mentale Modell

Claude Code ist kein Chatbot — es ist ein **Betriebssystem für KI-Agenten**. Du schreibst keine Prompts, du baust Pipelines.

```
┌──────────────────────────────────────────────────────┐
│                CLAUDE CODE SESSION                   │
│                                                      │
│  CLAUDE.md  ──► Dauerhaftes Gedächtnis / Regeln     │
│  Skills     ──► Wiederverwendbare Fähigkeiten        │
│  Subagents  ──► Parallele Claude-Instanzen           │
│  Worktrees  ──► Git-Isolation für parallele Agents   │
│  MCP        ──► Externe Tools & APIs                 │
│  Hooks      ──► Auto-Trigger bei Events              │
└──────────────────────────────────────────────────────┘
```

---

## Block 1 — CLAUDE.md + Skills

> 💡 **Goldene Regel:** Fix den Kontext, nicht den Prompt. Was du Claude mehr als einmal erklären musst, gehört in eine Datei.

### Projektstruktur anlegen

```bash
mkdir -p .claude/agents .claude/skills .claude/commands
touch .claude/CLAUDE.md
```

### CLAUDE.md — Beispiel für den App Maker

```markdown
# App Maker — Projektregeln

## Stack-Standard
- Frontend: Next.js 15 + Tailwind CSS + shadcn/ui
- Backend: tRPC oder REST, je nach Template
- DB: Prisma + PostgreSQL (default), Supabase optional
- Auth: NextAuth v5

## Git-Workflow
- Branches: main (prod-ready), develop (integration), feature/xxx
- NIEMALS direkt in main committen
- PRs brauchen grüne Tests + 1 Review
- Commit-Format: conventional commits (feat:, fix:, chore:)

## Testing
- Tests MÜSSEN grün sein vor jedem Commit
- Playwright für E2E, Vitest für Unit
- Bei roten Tests: stoppen, fixen, nie skippen

## Deployment-Targets
- Railway: Node/Next.js, PostgreSQL inklusive
- Vercel: Next.js, Edge Functions
- Render: Fullstack, Docker-Support
- Fly.io: Docker, global distribution

## Wichtige Regeln
- Keine hardcoded Secrets — immer .env
- Jede neue Feature → eigener Branch + eigener Worktree
- Nach jedem Edit: Tests laufen lassen
```

### Skills als Deployment-Templates

Jede Plattform bekommt einen eigenen Skill. Claude aktiviert ihn automatisch wenn es relevant ist.

```
# .claude/skills/railway-deploy/SKILL.md

## Wann dieser Skill aktiv wird
Wenn der User Railway als Deployment-Target wählt oder erwähnt.

## Pflicht-Dateien die du erstellen musst

### railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 300

## Lokales Setup
npm install -g @railway/cli
railway login
railway init
railway run npm run dev

## Deploy
railway up   # manuell
# oder: GitHub-Push → auto-deploy
```

Dasselbe machst du für Vercel, Render, Fly.io — jeder als eigener Skill-Ordner.

### Slash Command für schnellen Start

```markdown
# .claude/commands/new-app.md
---
description: Erstellt eine neue App mit gewähltem Stack und Deploy-Target
argument-hint: [app-name] [deploy-target]
---

Erstelle eine neue App namens "$1" für Deployment auf "$2".
1. Lies den passenden Deployment-Skill für "$2"
2. Klone das Template-Repo aus dem Skill
3. Passe package.json, .env.example und Configs an
4. Erstelle Branch develop und feature/initial-setup
5. Führe npm install aus
6. Zeige nächste Schritte
```

```bash
# Aufruf:
claude
/new-app meine-saas-app railway
```

### Ordnerstruktur nach Block 1

```
.claude/
├── CLAUDE.md                    ← Projektgedächtnis
├── skills/
│   ├── railway-deploy/SKILL.md
│   ├── vercel-deploy/SKILL.md
│   └── render-deploy/SKILL.md
└── commands/
    └── new-app.md               ← /new-app [name] [target]
```

### FAQ

**Wie triggern Skills automatisch?**
Der erste Abschnitt deiner SKILL.md ist die Aktivierungsbedingung. Claude liest beim Start alle SKILL.md-Dateien — aber nur Name und Description. Den vollen Inhalt lädt es erst wenn es denkt: „Das ist jetzt relevant." Schreib präzise was ein Kollege sagen würde damit du den Skill rauskramst.

**Kann CLAUDE.md Secrets / API Keys enthalten?**
Nein. CLAUDE.md kommt ins Git-Repo. Secrets gehören in `.env.local` (niemals committen). Schreib in CLAUDE.md nur Referenzen: „Secrets liegen in `.env.local`, Vorlage siehe `.env.example`."

**Wie teile ich Skills mit dem Team?**

| Ebene | Pfad | Sichtbarkeit |
|---|---|---|
| Projekt-Skills | `.claude/skills/` | Alle die das Repo klonen |
| Persönliche Skills | `~/.claude/skills/` | Nur du, alle deine Projekte |

Empfehlung: Alle App-Maker-Skills in `.claude/skills/` committen. Neuer Kollege klont Repo → alles funktioniert sofort.

---

## Block 2 — Subagents + Worktrees

> 💡 **Kernprinzip:** Subagents sind keine Assistenten — sie sind autonome Worker. Der Orchestrator koordiniert, die Subagents schuften.

### Das Orchestrator-Modell

```
Du (Mensch)
  └─► Orchestrator-Agent  (der "Manager")
        ├─► Subagent A: Code schreiben    [eigener Worktree]
        ├─► Subagent B: Tests schreiben   [eigener Worktree]
        └─► Subagent C: Deploy-Config     [eigener Worktree]

Alle drei laufen GLEICHZEITIG. Kein Warten. Kein Konflikt.
```

### Subagent-Definitionen

**`.claude/agents/code-generator.md`**
```yaml
---
name: code-generator
description: Generiert App-Code basierend auf Stack und Requirements.
             Wird aufgerufen wenn neue Features oder Apps erstellt werden sollen.
tools: Read, Write, Edit, Bash, Glob
isolation: worktree
model: sonnet
maxTurns: 30
---
Du bist ein Senior Full-Stack Developer.
Kein Placeholder-Code, kein "TODO here".
Immer TypeScript, immer typisiert.
Immer .env.example mitaktualisieren.
Nach dem Schreiben: npm run build ausführen und Fehler fixen.
Melde am Ende: Dateien erstellt/geändert, ob Build grün ist.
```

**`.claude/agents/test-writer.md`**
```yaml
---
name: test-writer
description: Schreibt Tests für neu generierten Code. Wird nach code-generator aufgerufen.
tools: Read, Write, Edit, Bash, Glob
isolation: worktree
model: sonnet
---
Du bist ein QA-Engineer spezialisiert auf automatisierte Tests.
Schreibe Unit Tests (Vitest) und E2E Tests (Playwright).
Tests müssen GRÜN sein bevor du fertig bist.
Niemals Tests auskommentieren oder skippen.
Melde: X Tests geschrieben, alle grün ✅ / X fehlgeschlagen ❌
```

**`.claude/agents/deploy-configurator.md`**
```yaml
---
name: deploy-configurator
description: Erstellt Deployment-Konfiguration für die gewählte Plattform.
tools: Read, Write, Edit, Bash
isolation: worktree
model: haiku
---
Du konfigurierst Deployment-Pipelines.
1. Lies den passenden Deployment-Skill
2. Erstelle alle Config-Dateien (railway.toml, vercel.json etc.)
3. Erstelle GitHub Actions Workflow für CI/CD
4. Prüfe dass .env.example vollständig ist
5. Melde: welche Dateien erstellt, welche Secrets der User noch setzen muss
```

**`.claude/agents/code-reviewer.md`**
```yaml
---
name: code-reviewer
description: Reviewt Code auf Qualität, Sicherheit, Performance.
             Wird vor jedem Merge in develop oder main aufgerufen.
tools: Read, Grep, Glob, Bash
model: sonnet
---
Output-Format:
🔴 BLOCKER: [muss gefixt werden vor Merge]
🟡 WARNING: [sollte gefixt werden]
🟢 OK: [sieht gut aus]

Wenn BLOCKER vorhanden: Merge NICHT empfehlen.
```

### Die Korrekturschleife

```
code-generator fertig
       ↓
test-writer läuft Tests
       ↓
   Tests rot? ──► code-generator fixt ──► Tests nochmal
       ↓ (grün)
code-reviewer checkt
       ↓
   BLOCKER? ──► code-generator fixt ──► Review nochmal
       ↓ (kein BLOCKER)
Merge in develop ✅  ← automatisch, ohne dein Zutun
```

### Worktrees: Git-Isolation

```
mein-projekt/           ← main worktree (du arbeitest hier)
../mein-projekt-feat-a/ ← Subagent A arbeitet hier
../mein-projekt-feat-b/ ← Subagent B arbeitet hier

# 3 Agenten, 3 Branches, 0 Konflikte.
```

Worktrees ohne Änderungen werden automatisch aufgeräumt. Steuern mit:

```json
// .claude/settings.json
{ "cleanupPeriodDays": 3 }
```

### FAQ

**Wie kommunizieren Subagents untereinander?**
Gar nicht — das ist Absicht. Subagents reden nur mit dem Orchestrator. Wenn B auf Ergebnisse von A angewiesen ist: A zuerst starten, Output von A in den Prompt von B einfügen. Der Orchestrator ist das Bindeglied.

**Was passiert wenn ein Subagent abstürzt?**

| Problem | Was passiert | Steuerung |
|---|---|---|
| Subagent meldet Fehler | Orchestrator bekommt ❌-Report | Retry-Logik im Orchestrator-Prompt |
| Subagent läuft endlos | Stopp nach X Turns | `maxTurns` im Frontmatter |
| Crash / Absturz | Worktree bleibt kurz übrig | `cleanupPeriodDays` in settings.json |
| B braucht Output von A | A läuft zuerst | Sequenziell im Orchestrator |

---

## Block 3 — MCP: Die Außenwelt anbinden

> 💡 **Ziel:** Claude verlässt das Terminal nie. PRs erstellen, Deploys triggern, Browser-Tests — alles aus der Session heraus.

### MCP installieren (einmalig)

```bash
# GitHub — PRs, Issues, Repos verwalten
claude mcp add github npx @modelcontextprotocol/server-github

# Playwright — Browser-Tests automatisch fahren
claude mcp add playwright npx @playwright/mcp@latest

# PostgreSQL — direkt in die DB schauen
claude mcp add postgres npx @modelcontextprotocol/server-postgres
```

### MCP pro Projekt konfigurieren

```json
// .claude/settings.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "postgres": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]
    }
  }
}
```

### Secrets sicher verwalten

```bash
# .env.local  ← NIEMALS committen
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://user:pass@host:5432/db

# Shell laden
export $(cat .env.local | xargs)
claude   # Claude hat jetzt Zugriff
```

Token-Rechte minimieren: Erstelle für jeden MCP-Use-Case einen eigenen Token mit minimalen Rechten (GitHub Fine-grained Tokens).

| MCP Server | Token braucht nur | Niemals |
|---|---|---|
| GitHub (lesen) | `repo:read`, `issues:read` | `delete_repo`, `admin` |
| GitHub (PRs) | `repo`, `pull_requests` | `org:admin` |
| Postgres | `SELECT`, `INSERT` | Superuser |

### Eigener MCP-Server: Template Registry

```javascript
// mcp-template-registry/server.js (Kernlogik)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const templates = [
  {
    id: "nextjs-railway",
    name: "Next.js + Railway",
    stack: ["nextjs", "tailwind", "prisma", "postgresql"],
    deployTarget: "railway",
    repoUrl: "https://github.com/dein-org/template-nextjs-railway",
  },
  {
    id: "nextjs-stripe-vercel",
    name: "Next.js + Stripe + Vercel",
    stack: ["nextjs", "tailwind", "stripe", "supabase"],
    deployTarget: "vercel",
    repoUrl: "https://github.com/dein-org/template-nextjs-stripe",
  }
];

// Tools: search_templates({ stack, deployTarget }) + get_template({ id })
// Claude ruft automatisch auf wenn User Stack + Target wählt
```

```bash
# Registrieren
claude mcp add template-registry node /pfad/zu/mcp-template-registry/server.js
```

### MCP-Architektur für den App Maker

```
Claude Code
│
├── GitHub MCP           (offiziell) → Repos, PRs, CI
├── Playwright MCP       (offiziell) → E2E Tests
├── Postgres MCP         (offiziell) → DB-Schema
└── Template Registry MCP (eigener) → deine Templates
    ├── search_templates()
    ├── get_template()
    └── register_template()
```

### MCP gezielt in Subagents einsetzen

Nicht jeder Subagent braucht alle MCPs (jeder kostet 10–20K Tokens Context):

```yaml
# deploy-configurator: braucht GitHub, nicht Playwright
tools: Read, Write, Edit, Bash, mcp__github

# test-writer: braucht Playwright, nicht GitHub
tools: Read, Write, Edit, Bash, mcp__playwright

# code-reviewer: braucht nur Lese-Tools
tools: Read, Grep, Glob
```

---

## Block 4 — Komplette App-Maker-Architektur

### Vollständige Ordnerstruktur

```
app-maker/
├── .claude/
│   ├── CLAUDE.md                      ← Projektgedächtnis
│   ├── settings.json                  ← MCP + Branch-Schutz
│   ├── agents/
│   │   ├── code-generator.md
│   │   ├── test-writer.md
│   │   ├── deploy-configurator.md
│   │   └── code-reviewer.md
│   ├── skills/
│   │   ├── railway-deploy/SKILL.md
│   │   ├── vercel-deploy/SKILL.md
│   │   └── render-deploy/SKILL.md
│   └── commands/
│       ├── new-app.md
│       ├── build-app.md               ← Haupt-Orchestrator
│       ├── deploy.md
│       └── review-pr.md
├── mcp-template-registry/
│   └── server.js
├── apps/                              ← generierte Apps landen hier
├── .env.example                       ← committen ✅
├── .env.local                         ← NIEMALS committen ❌
└── .gitignore
```

### Branch-Strategie

```
main          ← nur getesteter, reviewter, deployter Code
  │           ← geschützt: kein direkter Push, nur PR-Merge
  └─ develop  ← Integration aller fertigen Features
       │      ← CI läuft hier: Tests + Lint + Build
       ├─ feature/app-initial    ← Subagent-Worktree
       ├─ feature/app-auth       ← Subagent-Worktree
       └─ feature/app-billing    ← Subagent-Worktree
```

### Branch-Schutz in Claude Code

```json
// .claude/settings.json
{
  "protectedBranches": ["main", "develop"],
  "permissions": {
    "allow": ["Edit", "Write", "Bash(git commit:*)", "Bash(git push:*)"],
    "deny": [
      "Bash(git push origin main:*)",
      "Bash(git push origin develop:*)"
    ]
  }
}
```

Claude kann physisch nicht in `main` oder `develop` pushen — nur über PRs.
Zusätzlich im GitHub-Dashboard: Require PR + Status Checks + 1 Review.

### GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test           # Vitest Unit Tests
      - run: npm run test:e2e       # Playwright E2E
      - run: npm run build

  deploy-staging:                   # Push auf develop → Staging
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - run: railway up --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-production:                # Push auf main → Production
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: railway up --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### Der Master-Slash-Command

```markdown
# .claude/commands/build-app.md
---
description: Kompletter App-Maker-Flow von Anfang bis Deploy
argument-hint: [app-name] [stack] [deploy-target]
---

## Phase 0 — Vorbereitung
- Template Registry MCP: search_templates($2, $3)
- Branch feature/$1-initial von develop erstellen
- Ordner apps/$1/ erstellen

## Phase 1 — 3 Subagents GLEICHZEITIG starten
- code-generator: "Generiere $2 App '$1' in apps/$1/"
- test-writer: "Tests sobald code-generator fertig"
- deploy-configurator: "Konfiguriere $3 Deployment für apps/$1/"

## Phase 2 — Qualitätskontrolle
- code-reviewer ausführen
- Bei BLOCKER: code-generator fixt, max. 3 Runden
- Wenn nach 3 Runden noch BLOCKER: stoppe, frage User

## Phase 3 — Integration
- Alle Worktrees in feature/$1-initial mergen
- Finaler Test-Run: npm test && npm run build
- GitHub MCP: Push + PR nach develop erstellen

## Phase 4 — Report
✅ X Dateien generiert
✅ X/X Tests grün
✅ Deploy-Config bereit für $3
✅ PR erstellt: [Link]
📋 Noch zu tun: [Secrets setzen, PR mergen]
```

### Der komplette Flow mit allen Technologien

```
User: /build-app taskmaster "next.js+prisma+auth" railway
         ↓
Orchestrator liest CLAUDE.md + Railway-Skill
Template Registry MCP: findet passendes Repo
         ↓
3 Worktrees erstellt:
  ../taskmaster-codegen/
  ../taskmaster-tests/
  ../taskmaster-deploy/
         ↓
3 Subagents PARALLEL:
  [codegen]  pages/ components/ api/ schema.prisma...
  [tests]    Vitest + Playwright...
  [deploy]   railway.toml + GitHub Actions...
         ↓
code-reviewer: 🔴 BLOCKER: SQL nicht parametrisiert
code-generator fixt in 30 Sekunden
         ↓
Alle Tests grün ✅
GitHub MCP: PR #7 erstellt
         ↓
Du: PR approved → Railway Staging deployed automatisch
         ↓
Playwright MCP: prüft Live-URL
         ↓
"App läuft auf taskmaster.railway.app ✅"

Gesamtdauer: ~1 Minute
```

### Ein echter Arbeitstag

```
09:00  /build-app crm-tool "next.js+prisma+auth" railway
       → 3 Subagents starten parallel

09:01  Subagents arbeiten, du trinkst Kaffee ☕

09:03  code-reviewer: 🔴 BLOCKER: fehlende Input-Validierung
       → code-generator fixt automatisch in 30 Sekunden

09:04  Alle Tests grün ✅ | GitHub MCP: PR #7 erstellt

09:05  Du reviewst PR kurz, approved
       → develop bekommt Code → Railway Staging deployed

09:06  /build-app billing "next.js+stripe" vercel
       → nächste App startet parallel

14:00  /deploy develop
       → Tests ✅ → PR nach main → Production
       → Playwright: "App läuft auf crm-tool.railway.app ✅"
```

---

## Zusammenfassung

| Technologie | Zweck | In deinem App Maker |
|---|---|---|
| `CLAUDE.md` | Projektgedächtnis | Regeln, Stack, Workflow — einmal schreiben |
| Skills | Wiederverwendbare Fähigkeiten | Jede Plattform als Template |
| Subagents | Parallele Worker | Code, Tests, Deploy gleichzeitig |
| Worktrees | Git-Isolation | Kein Merge-Konflikt zwischen Agents |
| Hooks | Auto-Trigger | Tests nach jedem Edit automatisch |
| GitHub MCP | PR/Merge-Automation | Kein Browser öffnen nötig |
| Playwright MCP | Live-Tests | Nach Deploy automatisch prüfen |
| Template Registry MCP | Eigene Templates | Claude kennt deine Plattform-Vorlagen |
| Branch-Schutz | Sicherheit | Claude kann nicht in main pushen |
| GitHub Actions | CI/CD | Deploy bei jedem Push automatisch |

---

> Strukturierte KI-Entwicklung — mit MCP, Custom Subagents und projektbasierter Konfiguration — produziert messbar zuverlässigere Software als ad-hoc Vibe-Coding.

**Viel Erfolg mit deinem App Maker! 🚀**

*Erstellt mit Claude Sonnet 4.6 · docs.claude.com*
