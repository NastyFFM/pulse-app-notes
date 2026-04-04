---
name: vercel-deploy
description: Vercel Deployment fuer Next.js und statische Apps. Aktiviert wenn User Vercel erwaehnt oder eine Next.js App deployed werden soll.
---

# Vercel Deploy Skill

## Wann aktiv
Wenn der User Vercel als Deploy-Target waehlt, oder eine Next.js App deployed werden soll.

## Pflicht-Dateien

### vercel.json
```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next"
}
```

Fuer statische PulseOS Apps (nur HTML):
```json
{
  "buildCommand": "",
  "outputDirectory": ".",
  "cleanUrls": true
}
```

### next.config.js (fuer Next.js Apps)
```javascript
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
}
```

## Deploy-Optionen

### 1. Vercel CLI
```bash
npm i -g vercel
vercel login
vercel          # Preview Deploy
vercel --prod   # Production Deploy
```

### 2. GitHub Auto-Deploy
- Repo auf GitHub pushen
- vercel.com → Import Project → GitHub Repo waehlen
- Auto-Deploy bei jedem Push

## Env-Variablen
- Via Vercel Dashboard: Settings → Environment Variables
- Oder CLI: `vercel env add SECRET_NAME`
- NIEMALS Secrets in vercel.json oder Code

## Besonderheiten
- Vercel hat 100GB Bandwidth/Monat im Free Tier
- Edge Functions fuer API Routes (schnell, global)
- Serverless Functions max 10s Execution (Free), 60s (Pro)
- Static Assets werden automatisch via CDN verteilt
