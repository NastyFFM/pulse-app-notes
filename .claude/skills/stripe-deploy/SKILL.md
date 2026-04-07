---
name: stripe-deploy
description: Stripe Deployment fuer PulseOS Apps. Aktiviert wenn User Stripe als Deploy-Target waehlt.
---

# Stripe Deploy Skill

## Wann aktiv
Wenn der User Stripe als Deploy-Target waehlt oder das Template den Stack "stripe" enthaelt.

## Voraussetzungen
### Environment Variables
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`

## Deploy-Befehle
```bash
# Kein automatischer Deploy-Befehl definiert
```

## Onboarding
- **Stripe Account erstellen**: Erstelle einen Stripe Account oder logge dich ein.
- **Secret Key kopieren**: Kopiere den 'Secret key' (beginnt mit sk_).
- **Publishable Key kopieren**: Kopiere den 'Publishable key' (beginnt mit pk_).

## WICHTIG
- Secrets NIEMALS in Code committen
- Port aus process.env.PORT lesen (wenn Backend)
- Health-Check Endpoint empfohlen (/api/health)
