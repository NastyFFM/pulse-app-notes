# Full-Stack SaaS Template

Du erstellst oder erweiterst eine PulseOS App progressiv. Jeder Schritt baut auf dem vorherigen auf — loesche NIEMALS bestehenden Code, erweitere ihn nur.

## Stufen-Erkennung

Pruefe den aktuellen Stand der App BEVOR du anfaengst:

| Pruefung | Stufe |
|----------|-------|
| Nur index.html + manifest.json (kein package.json) | **Stufe 1: PulseOS Frontend** |
| Hat package.json + next.config.js | **Stufe 3: Deployed** |
| Hat supabase/ Verzeichnis ODER lib/supabase | **Stufe 4: With Users** |
| Hat stripe/ Verzeichnis ODER lib/stripe | **Stufe 5: SaaS** |

Fuehre NUR den Upgrade zur naechsten Stufe durch. Nicht mehrere auf einmal.

---

## Stufe 1 → 3: Next.js Umbau (Deploy-ready)

Konvertiere die Vanilla-App zu Next.js. Behalte die gesamte Logik und das Design.

### Neue Dateien erstellen
```
apps/<name>/
├── index.html         ← BEHALTEN: wird PulseOS-Wrapper (iframe auf localhost:3100)
├── manifest.json      ← BEHALTEN: type:"nextjs", port:3100 hinzufuegen
├── package.json       ← NEU
├── next.config.js     ← NEU
├── vercel.json        ← NEU (wenn Vercel Stack)
├── app/
│   ├── layout.tsx     ← NEU: Root Layout
│   ├── page.tsx       ← NEU: Hauptseite (Logik aus index.html portieren)
│   ├── globals.css    ← NEU: Styles aus index.html
│   └── api/
│       ├── [dataFile]/route.ts  ← NEU: Data-API (GET/PUT, liest/schreibt data/*.json)
│       └── graph-input/route.ts ← NEU: Graph-Input-Empfaenger
├── lib/
│   └── data.ts        ← NEU: Shared data access helpers
└── data/
    └── <name>.json    ← BEHALTEN
```

### index.html umbauen zum Wrapper
```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>APP_NAME</title>
<style>
  body { margin:0; background:var(--bg, #0d1117); }
  iframe { width:100%; height:100vh; border:none; }
  .loading { display:flex; align-items:center; justify-content:center; height:100vh; color:var(--text-dim, #888); font-family:system-ui; }
</style></head><body>
<div class="loading" id="loading">Starte...</div>
<iframe id="app" style="display:none;"></iframe>
<script src="/sdk.js"></script>
<script>
const port = 3100;
(async function() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch('http://localhost:' + port); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  document.getElementById('loading').style.display = 'none';
  const f = document.getElementById('app');
  f.src = 'http://localhost:' + port;
  f.style.display = 'block';
})();
PulseOS.onInput('data', function(d) {
  document.getElementById('app').contentWindow.postMessage({type:'graph-input',data:d},'*');
});
PulseOS.onDataChanged(function() {
  document.getElementById('app').contentWindow.postMessage({type:'data-changed'},'*');
});
</script></body></html>
```

### manifest.json erweitern
```json
{
  "type": "nextjs",
  "port": 3100,
  "inputs": [{"id": "data", "desc": "Daten empfangen"}],
  "outputs": [{"id": "result", "desc": "Ergebnis senden"}]
}
```

### API Route fuer Graph-Kompatibilitaet
```typescript
// app/api/graph-input/route.ts
import { NextResponse } from 'next/server';
export async function POST(req: Request) {
  const { inputName, data } = await req.json();
  // Verarbeite Graph-Input, speichere in DB oder State
  return NextResponse.json({ ok: true });
}
```

### vercel.json
```json
{ "buildCommand": "next build", "outputDirectory": ".next", "framework": "nextjs" }
```

### package.json
```json
{
  "name": "pulse-app-NAME",
  "private": true,
  "scripts": { "dev": "next dev -p 3100", "build": "next build", "start": "next start -p ${PORT:-3100}" },
  "dependencies": { "next": "^14", "react": "^18", "react-dom": "^18" }
}
```

---

## Stufe 3 → 4: Supabase Integration (User-Management)

### Neue Dependencies
```json
{ "@supabase/supabase-js": "^2", "@supabase/ssr": "^0.1" }
```

### Neue Dateien
```
├── lib/
│   └── supabase.ts     ← NEU: Supabase Client (browser + server)
├── app/
│   ├── login/page.tsx   ← NEU: Login/Register
│   ├── admin/
│   │   ├── layout.tsx   ← NEU: Admin Auth-Guard
│   │   ├── page.tsx     ← NEU: Dashboard (User-Liste, Stats)
│   │   └── analytics/page.tsx ← NEU: Analytics
│   └── middleware.ts    ← NEU: Auth-Middleware
├── supabase/
│   └── schema.sql       ← NEU: DB Schema + RLS Policies
```

### lib/supabase.ts
```typescript
import { createBrowserClient } from '@supabase/ssr';
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### Admin Dashboard PFLICHT-Features
- User-Liste mit Suche und Status
- Content-Management (CRUD fuer App-Daten)
- Analytics: Registrierungen/Tag, aktive User, Feature-Nutzung
- Settings: App-Konfiguration

### DB Schema Konvention
- Migriere bestehende data/*.json Strukturen zu Supabase Tables
- Row-Level Security: User sehen nur eigene Daten
- Admin-Rolle: Sieht alles
- Behalte die lokale data/ API als Fallback fuer PulseOS-Modus

### Env Vars (werden automatisch von PulseOS Onboarding gesetzt)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  (nur Server-seitig)
```

---

## Stufe 4 → 5: Stripe Integration (SaaS)

### Neue Dependencies
```json
{ "stripe": "^14", "@stripe/stripe-js": "^2" }
```

### Neue Dateien
```
├── lib/
│   └── stripe.ts        ← NEU: Stripe Client
├── app/
│   ├── pricing/page.tsx  ← NEU: Pricing-Seite mit Plaenen
│   ├── admin/
│   │   └── revenue/page.tsx ← NEU: Revenue Dashboard
│   └── api/
│       ├── checkout/route.ts    ← NEU: Stripe Checkout Session
│       ├── webhooks/stripe/route.ts ← NEU: Webhook Handler
│       └── billing/route.ts     ← NEU: Billing Portal
├── stripe/
│   └── config.ts         ← NEU: Pricing-Plaene Definition
```

### Pricing-Plaene Konvention
```typescript
export const PLANS = [
  { id: 'free', name: 'Free', price: 0, features: ['Basis-Features'] },
  { id: 'pro', name: 'Pro', price: 9.99, interval: 'month', features: ['Alle Features', 'Priority Support'] },
  { id: 'enterprise', name: 'Enterprise', price: 49.99, interval: 'month', features: ['Alles', 'API Access', 'Custom Branding'] }
];
```

### Revenue Dashboard
- MRR (Monthly Recurring Revenue)
- Aktive Subscriptions nach Plan
- Churn Rate
- Letzte Transaktionen

### Env Vars
```
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

---

## Graph-Kompatibilitaet (ALLE Stufen)

Jede Stufe MUSS sicherstellen:

1. **manifest.json** hat `inputs` und `outputs` Arrays
2. **PulseOS SDK** in index.html (Wrapper): `PulseOS.onInput()`, `PulseOS.emit()`
3. **API Routes** (ab Stufe 3):
   - `GET /api/<output-name>` — liefert Output-Daten fuer Graph
   - `POST /api/graph-input` — empfaengt Input-Daten vom Graph
4. **Daten-API** bleibt kompatibel: `GET/PUT /api/<dataFile>`

## CSS/Design

- Stufe 1: PulseOS CSS-Variablen (`var(--bg)`, `var(--text)`, etc.)
- Stufe 3+: Tailwind CSS erlaubt, aber Design muss zum PulseOS-Theme passen
- Responsive: Funktioniert als PulseOS-Fenster UND als standalone Web-App

## Regeln

- NIEMALS bestehenden Code loeschen — nur erweitern
- Jede Stufe einzeln und vollstaendig implementieren
- Nach jedem Upgrade muss die App SOFORT lauffaehig sein
- Lokaler PulseOS-Modus muss IMMER funktionieren (auch deployed Apps)
- manifest.json inputs/outputs IMMER aktuell halten
- Admin-Dashboard ist PFLICHT ab Stufe 4
