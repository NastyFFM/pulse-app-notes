# Decisions: City Visit Adviser

## D-001: Node.js HTTP ohne Express
date: 2026-04-07
context: PulseOS-Konvention schreibt kein npm/Express vor, nur Node.js Builtins
decision: Nutze Node.js http-Modul direkt (wie server.js im Root-Projekt)
alternatives: Express.js — verworfen wegen Dependency-Overhead

## D-002: Statische Stadtdaten + freie APIs
date: 2026-04-07
context: Keine API-Key-Pflicht, App soll sofort nutzbar sein
decision: Vordefinierte Städte-Daten in cities.json + OpenStreetMap Nominatim für Geocoding
alternatives: Google Places API — verworfen wegen API-Key-Pflicht

## D-003: Tab-Navigation für Kategorien
date: 2026-04-07
context: 4 Kategorien (Sehenswürdigkeiten, Restaurants, Aktivitäten, Geheimtipps)
decision: Tab-basierte Navigation in der Sidebar
alternatives: Accordion — verworfen wegen schlechterer UX auf Mobile

## D-004: Dual-Deployment Architektur
date: 2026-04-07
context: Template verlangt Railway (Backend) + GitHub Pages (Frontend)
decision: server.js auf Railway, index.html kann standalone laufen (API-URL konfigurierbar)
alternatives: Nur Railway — verworfen weil Template GitHub Pages explizit fordert
