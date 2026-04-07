---
name: supabase-deploy
description: Supabase Deployment fuer PulseOS Apps. Aktiviert wenn User Supabase als Deploy-Target waehlt.
---

# Supabase Deploy Skill

## Wann aktiv
Wenn der User Supabase als Deploy-Target waehlt oder das Template den Stack "supabase" enthaelt.

## Voraussetzungen
### Environment Variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Deploy-Befehle
```bash
# Kein automatischer Deploy-Befehl definiert
```

## Onboarding
- **Supabase Account erstellen**: Erstelle einen Account oder logge dich ein.
- **Neues Projekt erstellen**: Erstelle ein neues Supabase Projekt. Waehle einen Namen und eine Region.
- **Project URL kopieren**: Gehe zu Settings > API. Kopiere die 'Project URL'.
- **Anon Key kopieren**: Kopiere den 'anon public' Key von der gleichen Seite.

## WICHTIG
- Secrets NIEMALS in Code committen
- Port aus process.env.PORT lesen (wenn Backend)
- Health-Check Endpoint empfohlen (/api/health)
