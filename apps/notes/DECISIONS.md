# Decisions: Notes App v2

## D-001: Markdown via CDN (marked.js)
date: 2026-04-07
context: Notes sollen Markdown rendern können ohne Build-Step
decision: marked.js über CDN einbinden (unpkg.com)
alternatives: Eigene Markdown-Parser — zu aufwändig für Inline-Logik

## D-002: Daten via PulseOS API + localStorage Fallback
date: 2026-04-07
context: App soll sowohl in PulseOS als auch standalone (GitHub Pages) laufen
decision: PulseOS SDK für saveState/loadState; wenn SDK nicht verfügbar → localStorage
alternatives: Nur localStorage — verliert PulseOS-Integration

## D-003: Auto-Save mit Debounce 1000ms
date: 2026-04-07
context: Nutzer soll nicht manuell speichern müssen
decision: Auto-save 1 Sekunde nach letzter Tastatureingabe
alternatives: Manueller Save-Button — schlechtere UX

## D-004: PWA ohne Service Worker für erste Version
date: 2026-04-07
context: Service Worker erhöht Komplexität erheblich
decision: PWA manifest.json + localStorage — kein SW in v1
alternatives: Vollständiger Service Worker — für spätere Version
