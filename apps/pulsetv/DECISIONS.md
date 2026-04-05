# Decisions: PulseTV

## D-001: Invidious API statt YouTube Data API v3
date: 2026-04-05
context: YouTube Data API benötigt API-Key und hat Quotas. Invidious ist ein FOSS-Frontend das YouTube-Daten ohne Key liefert.
decision: Nutze Invidious Public Instances (z.B. inv.nadeko.net) als Proxy für YouTube-Suche.
alternatives: YouTube Data API v3 (braucht Key, zu komplex für Vanilla-App); PeerTube (keine YouTube-Inhalte)

## D-002: YouTube embed über youtube-nocookie.com
date: 2026-04-05
context: Videos direkt im iframe abspielen ohne externen Player-Service.
decision: Nutze `https://www.youtube-nocookie.com/embed/{videoId}` für Privacy-enhanced Embeds.
alternatives: Video.js mit direktem Stream (kein YouTube-Zugang); Invidious embed (weniger stabil)

## D-003: Debounced Live-Suche (400ms)
date: 2026-04-05
context: Echtzeit-Suche soll sofort reagieren aber API nicht überfluten.
decision: 400ms Debounce auf Input-Events, Suche startet ab 2 Zeichen.
alternatives: Submit-Button (schlechte UX); 0ms Debounce (zu viele API-Calls)

## D-004: State via PulseOS saveState + Cookie-Backup
date: 2026-04-05
context: App muss in PulseOS und als GitHub Pages PWA funktionieren.
decision: Primär PulseOS.saveState(), Fallback auf localStorage/Cookie. Download/Upload-Backup für PWA-Modus.
alternatives: Nur localStorage (kein PulseOS-Graph-Integration)

## D-005: Fallback zu mehreren Invidious Instanzen
date: 2026-04-05
context: Einzelne Invidious-Instanzen können offline/gedrosselt sein.
decision: Liste von 3-4 Public Instances, automatischer Fallback wenn eine fehlschlägt.
alternatives: Feste einzelne Instanz (zu fragil für Public App)
