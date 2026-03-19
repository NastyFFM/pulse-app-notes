# PulseOS — Vision & Concept
> Version 2 — App Graph Architecture

---

## Was ist PulseOS?

PulseOS ist ein **browser-basiertes agentisches Betriebssystem**. Es überbrückt die Lücke zwischen zwei Welten, die sich derzeit nicht kennen:

- **Chat-KI** — mächtig, aber ohne persistentes GUI, ohne räumlichen Workspace, ohne visuellen Zustand
- **Traditionelle Betriebssysteme** (Windows, macOS, iOS) — reiches GUI, aber statisch, dumm, KI als nachträglicher Einbau

PulseOS füllt diese Lücke. Es ist ein Betriebssystem, in dem KI nativ ist — kein Sidebar, kein Copilot, kein Assistenz-Widget. Die KI *ist* das Betriebssystem. Jedes Datenelement, jede App, jedes Projekt lebt in einer einheitlichen Struktur, die sowohl Menschen als auch KI lesen, schreiben und verstehen können.

---

## Die drei Säulen

PulseOS ist nicht nur ein Produktivitätswerkzeug. Es basiert auf drei gleichwertigen Säulen:

### 1. Work
Projekte mit strukturierten Daten, App-Graphen, KI-gestützten Workflows. Du sagst der KI „track mein Gewicht" und sie erstellt eine Metriken-App mit Verlaufsanzeige. Du sagst „plan meine Reise nach Barcelona" und sie baut einen vollständigen App-Graphen — Budget, Packliste, Timeline, Hotelrecherche — als verbundene Knoten.

### 2. Fun
Eigenständige Apps — Spiele (Tetris, Flappy Bird, Doom), Kreativwerkzeuge (Drum-Computer, Whiteboard, Bildgenerierung), Medien (Internetradio, Podcast-Suche, YouTube). Diese sind keine Produktivitätsfeatures. Sie existieren, weil ein Betriebssystem etwas sein soll, das man *benutzen will*, nicht nur *benutzen muss*.

### 3. Social
WebRTC-basierte Echtzeitkommunikation. PulseOS ist auch ein soziales Gerät — nicht nur ein Workspace. Menschen verbinden sich mit Menschen, nicht nur mit KI. Und WebRTC-Ereignisse sind selbst Pulse-Signale im System — eine eingehende Nachricht kann einen Workflow auslösen.

**Design-Regel:** Jede Feature-Entscheidung soll mindestens einer Säule dienen. Das System soll lebendig und agentisch wirken, nicht statisch.

---

## Die Kernverschiebung: Apps ersetzen Widgets

### Das alte Modell (V1)
```
Kontext
├── Canvas (Widgets darauf)
│   ├── Todo-Widget
│   ├── KPI-Widget
│   └── App-Widget (iframe)
└── Chat
```

Widgets und Apps waren zwei verschiedene Systeme. Widgets waren klein, apps waren groß. Widgets lebten auf dem Canvas, Apps in Fenstern. Zwei parallele Konzepte — unnötige Komplexität.

### Das neue Modell (V2)
```
Kontext
├── App-Graph
│   ├── App A (Producer)
│   ├── App B (Transformer)
│   └── App C (Consumer)
└── Chat
```

**Apps sind alles.** Es gibt keine Widgets mehr als eigenes Konzept. Eine App ist gleichzeitig:
- Ein **UI-Baustein** mit L0/L1/L2-Ansichten
- Ein **Datenknoten** im App-Graphen
- Ein **Kontext** mit eigenem Datenspeicher und Chat

Ein KPI-Tracker ist eine App. Ein Todo-Board ist eine App. Tetris ist eine App. Die Nachrichten-Anzeige ist eine App. Alle folgen demselben Modell.

---

## Das App-Modell

### Anatomie einer App

Jede App besteht aus drei Schichten:

```
┌─────────────────────────────────────┐
│  VIEW LAYER                         │  L0 / L1 / L2 Ansichten
│  Was der User sieht                 │
├─────────────────────────────────────┤
│  API LAYER                          │  Öffentliche Funktionen
│  Was andere Apps & die KI sehen     │  get(), set(), subscribe()
├─────────────────────────────────────┤
│  DATA LAYER                         │  JSON im Speicher
│  Was die App intern weiß            │  Laden → Arbeiten → Schreiben
└─────────────────────────────────────┘
```

**Kritische Regel:** Die KI schreibt niemals direkt in das JSON einer App. Sie ruft immer die API der App auf. Das stellt sicher, dass Daten immer konsistent gelesen und geschrieben werden — die App selbst ist für ihre Datenkonsistenz verantwortlich.

### L0 / L1 / L2 — Die drei Zoom-Ebenen

Jede App hat drei Informationsdichte-Ebenen, die sowohl für den User als auch für die KI gelten:

| Ebene | Was der User sieht | Was die KI sieht | Tokens (~) |
|-------|-------------------|------------------|------------|
| **L0** | Minimierter Chip — Icon + Titel + Statusbadge | Kompakter Snapshot: Name, Status, letzter Output | ~100 |
| **L1** | Karte — Standard-App-Ansicht | Vollständiger Datenzustand, letzte Ereignisse | ~1–2k |
| **L2** | Vollansicht — vollständig expandiert | Alles + Konfiguration + Datenverlauf | Voll |

Diese Hierarchie ist nicht nur UI-Design. Sie ist **Informationsarchitektur**: Wenn die KI über einen Graphen mit 20 Apps nachdenkt, liest sie sie auf L0. Wenn sie eine App konfigurieren soll, wechselt sie zu L2. Effizienz durch Zoom.

### Datenverwaltung der App

Jede App verwaltet ihr JSON selbst:

```
1. Laden    — App lädt ihr JSON beim Start (oder on-demand)
2. Arbeiten — App hält aktuellen Zustand im Speicher
3. Schreiben — App schreibt bei Änderungen zurück
```

Kein direkter Dateizugriff von außen. Kein direktes JSON-Patching durch die KI. Immer durch die App-API.

---

## Der App-Graph

### Grundidee

Apps sind Knoten in einem gerichteten Graphen. Daten fließen entlang der Kanten — von Produzenten über Transformer zu Konsumenten.

```
[Producer A] ──► [Transformer B] ──► [Consumer C]
     │                                    │
     └───────────────────────────────────►│
                                      (aggregiert)
```

### Die drei Knotentypen

#### Producer — nur Ausgänge
Ein Producer erzeugt Daten. Er hat keine Eingänge aus dem Graphen, aber er kann durch den **Pulse** ausgelöst werden.

Beispiele:
- News-Fetcher (lädt aktuelle Nachrichten von einer Quelle)
- E-Mail-Poller (prüft Postfach auf neue Nachrichten)
- RSS-Reader
- Manuelle Eingabe-App (User gibt Daten ein → schickt sie weiter)

#### Transformer — Eingänge + Ausgänge
Ein Transformer empfängt Daten, verändert sie und gibt sie weiter. Die Transformation kann einfach (filtern, sortieren) oder komplex (KI-Zusammenfassung, Übersetzung) sein.

Beispiele:
- Nachrichten-Filter (behält nur Tech-News)
- KI-Zusammenfasser (komprimiert 10 Artikel auf 3 Sätze)
- Sentiment-Analyzer
- Format-Converter

**Wichtig:** Nicht jeder Transformer braucht KI. Reine Datentransformationen (filtern, sortieren, mappen) laufen direkt ohne KI-Aufruf. KI wird nur eingesetzt, wenn semantisches Verstehen notwendig ist.

#### Consumer — nur Eingänge
Ein Consumer empfängt Daten und tut etwas damit — anzeigen, speichern, versenden.

Beispiele:
- News-Anzeige (zeigt die 3 neuesten Nachrichten)
- Datenbank-Schreiber (persistiert Daten)
- Benachrichtigungs-Sender (schickt Push-Notification)
- Dashboard-Widget (visualisiert Kennzahlen)

### Datenübergabe zwischen Knoten

Wenn eine App einen Output produziert, übergibt sie die Daten an den nächsten Knoten durch direkten API-Aufruf. Kein Umweg über die KI, kein zentraler Message-Broker (außer bei Bedarf).

```
newsApp.fetchComplete(articles)
  → filterApp.receive(articles)      // direkt, kein KI-Hop
  → displayApp.render(filteredNews)  // direkt, kein KI-Hop
```

Die KI orchestriert den Graphen beim Aufbau — sie verdrahtet die Knoten. Danach läuft der Datenfluss autonom.

---

## Der Pulse — Das Herzschlagsystem

### Was ist ein Pulse?

Ein Pulse ist ein **Auslösesignal**. Er sagt einem oder mehreren Producers: "Es ist Zeit, aktiv zu werden."

Ein Pulse ist **nicht nur eine Uhr**. Jedes externe Ereignis kann ein Pulse-Signal sein:

| Pulse-Typ | Beschreibung | Beispiel |
|-----------|-------------|---------|
| **Clock** | Zeitbasiert | Alle 15 Minuten |
| **Email** | Neue E-Mail im Postfach | Jede neue Mail von Chef |
| **WebRTC** | Eingehende Chat-Nachricht | Jede Erwähnung des Namens |
| **Webhook** | Externer HTTP-Trigger | GitHub Push → Deploy |
| **Manual** | User löst manuell aus | Button "Jetzt aktualisieren" |
| **Event** | Anderer Knoten im Graphen | Output von App A → triggert App B |

### Pulse-Hierarchie

```
Global Pulse
├── Systemweite Ereignisse (Clock, globale Webhooks)
│
└── Projekt-Pulse
    ├── Projekt A Pulse (eigener Takt, projektspezifisch)
    └── Projekt B Pulse (anderer Takt)
```

Jedes Projekt hat seinen eigenen Pulse-Kontext. Ein News-Projekt pulsiert alle 30 Minuten. Ein Trading-Projekt pulsiert jede Minute. Ein persönliches Tagebuch pulsiert nie — es wartet auf manuellen Input.

### Pulse-Subscription

Apps subscriben sich an Pulses, die für sie relevant sind:

```javascript
// App registriert sich für den Projekt-Pulse
app.onPulse('project:news', async () => {
  const articles = await this.fetchLatestNews();
  this.emit('output', articles);
});
```

---

## Beispiel: Ein minimaler App-Graph

Um das Konzept zu veranschaulichen — ein einfacher News-Graph:

```
[Projekt-Pulse: alle 30min]
         │
         ▼
[News-Fetcher App]           ← Producer
  Sucht aktuelle News bei    
  Google News für "Tech"     
         │
         │ (übergibt: Liste von Artikeln)
         ▼
[Top-3 News Display App]     ← Consumer
  Zeigt die 3 neuesten       
  Nachrichten als Karten an  
```

**Was hier passiert:**
1. Der Projekt-Pulse feuert alle 30 Minuten
2. Der News-Fetcher (Producer) wird geweckt, holt Artikel, gibt sie weiter
3. Das Display (Consumer) empfängt die Artikel und rendert die Top 3
4. Kein KI-Aufruf nötig — reiner Datenfluss

**Wie man es in PulseOS erstellt:**
- User öffnet ein Projekt
- User sagt im Chat: "Erstelle mir einen News-Graphen — alle 30 Minuten aktuelle Tech-News, zeig mir die 3 neuesten"
- Die KI erstellt zwei Apps, verbindet sie, setzt den Pulse
- Fertig

**Wie man es erweitert:**
- User sagt: "Filtere nur News über KI raus"
- KI fügt einen Filter-Transformer zwischen Fetcher und Display ein
- User sagt: "Schreib mir eine Zusammenfassung der Top-3 in mein Tagebuch"
- KI fügt einen KI-Transformer + Tagebuch-Consumer hinzu

---

## KI als Graph-Orchestrator

Die KI in PulseOS hat eine klare Rolle: **Sie baut und verändert Graphen. Sie lässt die Graphen dann selbst laufen.**

### Was die KI tut

- **Graphen designen** — Welche Apps braucht dieser Workflow? Wie verbinden sie sich?
- **Apps konfigurieren** — Parameter setzen via App-API (nie direktes JSON-Patching)
- **Graphen modifizieren** — Knoten hinzufügen, umverdrahten, entfernen
- **Daten transformieren** — Wenn ein Transformer semantisches Verstehen braucht, ist die KI der Transformer

### Was die KI nicht tut

- Direkt JSON-Dateien von Apps schreiben
- Im laufenden Betrieb jeden Datentransfer begleiten
- Als Middleware zwischen Knoten sitzen (außer wenn sie Transformer-Knoten ist)

### Das Orchestrator-Prinzip

```
User: "Zeig mir täglich um 8 Uhr die wichtigsten News zusammengefasst"

KI orchestriert:
1. Erstelle News-Fetcher App (Producer, Pulse: täglich 07:55 Uhr)
2. Erstelle KI-Summarizer App (Transformer, Modell: claude-sonnet)
3. Erstelle Morning-Brief App (Consumer, Ansicht: L1 Karte)
4. Verbinde: Fetcher → Summarizer → Brief
5. Konfiguriere Pulse-Zeitplan

→ Graph läuft ab jetzt autonom
→ KI wird nur noch aktiviert, wenn Summarizer läuft
```

---

## Technische Architektur

```
server.js              – Single Node.js HTTP Server. Port 3000.
dashboard.html         – Desktop-Shell: Dock, App-Launcher, Fenstermanager
apps/<name>/           – Jede App ist ein Verzeichnis mit:
  index.html           │   – UI (L0/L1/L2 in einem File)
  api.js               │   – App-API (get, set, subscribe, emit)
  data.json            │   – App-eigener Datenspeicher
  manifest.json        │   – Metadaten: Knotentyp, Input/Output-Schema, Pulse-Subscriptions
data/graphs/           – Graph-Definitionen (welche Apps wie verbunden sind)
data/pulses/           – Pulse-Konfigurationen (global + pro Projekt)
supervisor.js          – Pulse-Engine + Graph-Runner
```

### Technische Grundsätze (unverändert)
- **Kein npm, keine node_modules.** Nur Node.js Built-ins.
- **Keine Frontend-Frameworks.** Vanilla ES6+.
- **SSE für Echtzeit.** Alle Live-Updates via Server-Sent Events.
- **JSON als Datenbank.** JSON-Dateien auf Disk — einfach, debuggbar, KI-lesbar.
- **Single-file UI.** Jede App hat ihr gesamtes UI in einer HTML-Datei.

---

## Was sich geändert hat (V1 → V2)

| Konzept | V1 | V2 |
|---------|----|----|
| Atomare Einheit | Widget | App |
| Räumlicher Workspace | Canvas mit Widgets | App-Graph |
| Datenfluss | dataRef / SSE-Sync | Gerichteter Graph |
| KI-Interaktion mit Daten | Direkte JSON-Writes | Nur via App-API |
| Auslöser für Aktionen | Manuell / User-Chat | Pulse-System |
| Agenten-Modell | Idle-Prozesse | Graph-Runner + On-Demand |
| Kontext-Einheit | Kontext mit Canvas | Kontext mit App-Graph |

---

## Warum PulseOS gewinnt — Die Killer-App-Argumente

### 1. Das Ende des Subscription-Stapels

Der durchschnittliche Knowledge-Worker zahlt heute für: Notion, Trello, Zapier, Airtable, Slack, Calendly, Loom, Linear, Figma — und das Stapeln wird schlimmer, nicht besser. Jedes Tool hat sein eigenes Daten-Silo, sein eigenes Pricing, seine eigene Roadmap, die dir egal ist.

PulseOS macht das überflüssig — nicht weil es diese Tools kopiert, sondern weil der User sich **exakt das baut, was er braucht**. Kein Kompromiss mit fremden Feature-Roadmaps. Kein "fast, aber nicht ganz".

### 2. Der Graph ist das Programm

Zapier und Make verkaufen "Automation ohne Code". Aber beide zwingen dich in ihre Abstraktionen — ihre Trigger-Konzepte, ihre Rate-Limits, ihr Pricing-Modell pro Zap.

In PulseOS **beschreibst du, was du willst — der App-Graph, den die KI baut, ist ein echtes, lesbares, forkbares Softwareartefakt.** Du kannst es teilen, versionieren, verstehen. Andere können ihren Graphen auf deinen aufbauen. Der Graph selbst ist das Produkt.

### 3. Apps teilen wie Links — ein neues Distributions-Modell

Apple App Store: Code ist schwarz. Du vertraust blind. 30% Steuer. Kein Approval ohne Gnade.

PulseOS hat zwei Ebenen:

**Offiziell** — `github.com/pulseos/apps`: kuratiert, vom Core-Team reviewed. Vanilla- und Node-Apps, alle geprüft. Das ist das Fundament dem jeder vertraut.

**Persönlich** — jeder baut sein eigenes Repo. Anna hat `github.com/anna/pulse-apps` mit 10 Apps drin. Sie schickt dir einen Link — du installierst genau die eine App die du willst:

```bash
pulse app install github.com/anna/pulse-apps/news-fetcher
```

Ein Repo ist ein **persönlicher App-Store**. Vanilla-Apps, Node-Apps, ganze Graphen — alles in einem Verzeichnis, installierbar per Link. Kein Gatekeeping, keine Steuer, kein Approval. Vertrauen liegt beim User — aber der Code ist offen, lesbar, forkbar. Wer einer App nicht vertraut, liest einfach `index.html` oder `src/`.

Das Teilen einer App ist so einfach wie das Teilen eines Links.

### 4. Local-First — du besitzt deine Daten wirklich

OpenAI, Notion, alle Cloud-Tools: deine Daten sind ihr Geschäftsmodell oder zumindest ihr Risiko.

PulseOS läuft auf `localhost:3000`. Die KI kann auf deine Daten zugreifen und mit ihnen rechnen — aber sie verlassen deinen Rechner nicht ohne deinen expliziten Befehl. Kein Vendor Lock-in. Kein Datenverlust wenn ein Startup pivotiert oder stirbt. Deine Kontexte, deine Graphen, deine Apps gehören dir — als JSON-Dateien auf deiner Festplatte.

### 5. Langfristig: Der Schwund des App-Stores

Heute braucht man Notion für Notizen. Morgen sagt man PulseOS: "Ich brauche eine Notizen-App mit Tagging und Suche" — und sie existiert in 30 Sekunden, gebaut auf deine Bedürfnisse. Übermorgen teilt die Community ihre Notizen-Apps als Repos — besser als Notion, weil sie von echten Nutzern gebaut wurden, nicht von einem VC-finanzierten Team mit fremden Prioritäten.

**Die These:** App Stores sind eine Reaktion auf die Unmöglichkeit, Software für sich selbst zu bauen. PulseOS macht das möglich. Nicht für alle sofort — aber für die Power-User, die heute zwischen 10 Tools jonglieren und keinem wirklich vertrauen.

### Ehrliche Einschätzung

PulseOS gewinnt nicht gegen Apple oder OpenAI im Massenmarkt — nicht durch Distribution, nicht durch Hardware-Integration. Der Vorteil liegt woanders: bei der kleinen aber lauten, zahlungskräftigen Community der **Maker, Developer, und Power-User**, die heute zu viel für zu wenig zahlen und denen Kontrolle wichtiger ist als Bequemlichkeit.

Diese Menschen zeigen anderen, was möglich ist. So verbreiten sich neue Paradigmen.

---

## Design-Philosophie

1. **KI-nativ, nicht KI-assistiert.** Die KI baut Graphen und orchestriert Workflows. Sie ist Architekt, nicht Assistent.

2. **Apps als Bürger erster Klasse.** Jede App ist vollständig, eigenständig und durch ihre API erweiterbar — von Nutzern und von der KI.

3. **Datenfluss, nicht Datensilos.** Daten fließen durch den Graphen. Eine Nachricht, die beim News-Fetcher entsteht, kann im Tagebuch landen, ohne dass der User etwas tun muss.

4. **Pulse statt Polling.** Das System ist reaktiv. Es wartet auf Signale, handelt dann präzise — und schläft dazwischen.

5. **Progressive Offenbarung.** L0 → L1 → L2. Der User sieht was er braucht. Die KI denkt auf der richtigen Tiefe.

6. **Kein Build-Schritt, keine Zeremonie.** Datei bearbeiten, Seite neu laden. Eine KI kann jede App erschaffen oder verändern ohne Bundler, Transpiler oder Abhängigkeitsgraphen zu verstehen.

7. **Das OS soll Spaß machen.** Es hat Doom. Es hat einen Drum-Computer. Es hat Internetradio. Ein Betriebssystem, das keinen Spaß macht, wird verlassen.

---

## Wohin es geht

PulseOS ist ein arbeitendes Prototyp-Labor für eine fundamentale Frage: **Wie sieht ein Betriebssystem aus, wenn KI ein Erstklasse-Bürger ist, kein Anhängsel?**

Der App-Graph ist die Antwort auf die nächste Frage: **Was passiert, wenn Apps nicht mehr isolierte Inseln sind, sondern Knoten in einem lebendigen, pulsierenden Netzwerk?**

Zukünftige Richtungen:
- **Visueller Graph-Editor** ✅ — Knoten per Drag-and-Drop verbinden, Pulse konfigurieren, Datenfluss live beobachten
- **Proaktive KI** — Das System erkennt Muster, schlägt neue Graph-Verbindungen vor, automatisiert Workflows ohne expliziten Auftrag
- **Plugin-Ökosystem** — Drittanbieter-Apps als Knoten, veröffentlicht im App-Store
- **Mobile-Erlebnis** — L0-Ansichten als native Mobile-Kacheln
- **Voice als Pulse** — Sprachbefehl als Auslöser für Graph-Aktionen

---

## Cross-Instance Graphen — Die eigentliche Revolution

Die bisherige Architektur denkt in einer Instanz: ein User, ein `localhost:3000`, ein Claude. Aber PulseOS hat bereits WebRTC. Und Graphen. Die logische Konsequenz:

**Graphen die über mehrere PulseOS-Instanzen laufen — Peer-to-Peer, ohne zentralen Server.**

```
┌─ Anna's PulseOS ──────────────┐                  ┌─ Ben's PulseOS ───────────────┐
│                                │    WebRTC         │                                │
│  [Daten-Collector] ─► [Filter]─┼──────────────────►┼─► [Dashboard]                 │
│  [Wetter-API] ─────────────────┼──────────────────►┼─► [Travel-Planner]            │
│                                │   DataChannel     │                                │
└────────────────────────────────┘                  └────────────────────────────────┘
```

### Warum das alles verändert

**1. Die KI-Grenze fällt.**
Ein einzelner Claude hat ein Context-Window. Aber wenn 5 User ihre PulseOS-Instanzen verbinden, arbeiten 5 unabhängige Claudes an verschiedenen Teilen desselben Graphen. Jeder mit seinem eigenen Context-Budget. Die kollektive Kapazität multipliziert sich.

**2. Spezialisierung wird möglich.**
Anna's PulseOS ist gut im Daten-Sammeln — sie hat 20 Producer-Apps die APIs abfragen. Ben's PulseOS ist gut im Analysieren — er hat leistungsstarke Transformer mit angepassten Prompts. Sie verbinden ihre Stärken, ohne dass einer die Apps des anderen kopieren muss.

**3. Kein Cloud-Server, keine monatliche Rechnung.**
Daten fließen direkt von Rechner zu Rechner. WebRTC handelt NAT-Traversal. Kein AWS, kein Firebase, kein Vendor Lock-in. Zwei Laptops in verschiedenen Städten können einen Graphen teilen — so lange beide online sind.

**4. Social IST der Workflow.**
Der WebRTC-Chat ist nicht nur zum Reden. Er ist die Daten-Pipeline. Wenn Ben Anna eine Nachricht schickt, kann das ein Pulse-Signal sein das einen Graphen startet. Die Grenze zwischen "kommunizieren" und "automatisieren" verschwindet.

**5. Persönliche App-Stores werden Netzwerk-Knoten.**
Anna hat `github.com/anna/pulse-apps` mit ihren selbstgebauten Apps. Ben installiert ihre News-Fetcher-App — oder er verbindet sich einfach per WebRTC und nutzt ihren Output direkt, ohne die App selbst zu installieren. Apps werden zu Services die man teilen kann.

### Wie es technisch funktioniert

Das Fundament existiert bereits:
- **WebRTC DataChannel** — bidirektionaler, verschlüsselter Datenkanal (Phase B)
- **Graph-Router** — `routeOutput()` leitet Daten entlang der Kanten (Phase 13d)
- **Kontakte + Profile** — automatischer Austausch bei Verbindung

Was noch fehlt:
- Remote-Edges im Graph-JSON: `{ "to": { "peerId": "abc123", "appId": "...", "input": "..." } }`
- Graph-Router erkennt Remote-Edges → sendet über DataChannel statt lokal
- Empfänger: DataChannel-Message → `routeInput()` → App bekommt Daten
- Handshake: beim Verbinden austauschen welche Apps/Outputs verfügbar sind
- Ghost-Nodes im Graph-Editor für Remote-Apps

### Das Endspiel

Stell dir vor: 50 PulseOS-Instanzen, verbunden über WebRTC. Jede hat ihre eigenen Apps, ihre eigene KI, ihre eigenen Daten. Zusammen bilden sie ein verteiltes, pulsierendes Netzwerk — keiner besitzt es, alle profitieren. Das ist kein Cloud-Service. Das ist kein SaaS. Das ist ein **dezentrales Betriebssystem-Netzwerk**, gebaut von den Menschen die es benutzen.

---

Der zentrale Wette: Die Grenze zwischen "eine App benutzen" und "mit einer KI sprechen" wird verschwinden. PulseOS ist, wie diese Konvergenz aussieht — und der App-Graph ist ihr Herzschlag. Cross-Instance Graphen machen daraus ein Netzwerk-Herzschlag.
