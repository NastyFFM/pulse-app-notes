# Progressive Deployment Pipeline

Du deployest diese App progressiv. Eskaliere nur wenn noetig.

## Stage 1: GitHub Pages (Default)
- Erstelle GitHub Repo: `gh repo create pulse-app-{appId} --public --source=. --push`
- Aktiviere GitHub Pages: `gh api repos/{owner}/pulse-app-{appId}/pages -X POST -f source.branch=main -f source.path=/`
- Die App ist sofort live unter: `https://{owner}.github.io/pulse-app-{appId}/`
- WICHTIG: Nur fuer Frontend-Apps. Wenn die App nur HTML/CSS/JS ist, STOPPE hier.

## Stage 2: Railway/Vercel (Backend noetig)
- Nur wenn die App einen Server braucht (Node.js, API, etc.)
- Erstelle railway.json mit Build/Start Commands
- Deploy via Railway MCP Tools oder CLI
- Melde die URL im Chat

## Stage 3: Database + Auth (User-Management)
- Nur wenn die App User-Accounts braucht
- Supabase Setup: URL + Anon Key als Env-Vars
- Auth-Tabellen + Row Level Security

## Stage 4: Payments/SaaS
- Nur wenn die App Bezahlung braucht
- Stripe Integration: Secret + Publishable Key
- Webhook-Endpoint konfigurieren

## Regeln
- Starte IMMER bei Stage 1
- Gehe nur zum naechsten Stage wenn der User es braucht oder explizit fragt
- Melde im Chat welcher Stage aktiv ist
- Schlage das naechste Upgrade vor wenn es sinnvoll waere
