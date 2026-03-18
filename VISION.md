# PulseOS — Vision & Concept

## What Is PulseOS?

PulseOS is a **browser-based agentic operating system**. It bridges the gap between two worlds that currently don't talk to each other:

- **Chat AI** — powerful but has no persistent GUI, no spatial workspace, no visual state
- **Traditional OS** (Windows, macOS, iOS) — rich GUI but static, dumb, AI-bolted-on-as-afterthought

PulseOS fills that gap. It's an OS where AI is native — not a sidebar, not a copilot, not an assistant widget. The AI *is* the operating system. Every piece of data, every app, every project lives in a unified structure that both humans and AI can read, write, and reason about.

It runs entirely in the browser at `localhost:3000`, built with vanilla HTML/CSS/JS and a single Node.js server. No npm. No build tools. No frameworks. Just raw web technology and AI.

---

## The Three Pillars

PulseOS is not just a productivity tool. It's designed around three equal pillars:

### 1. Work
Projects with structured data, widgets, AI-assisted workflows. You tell the AI "track my weight" and it creates a KPI widget with history. You say "plan my trip to Barcelona" and it scaffolds a full project with budget, packing list, timeline, and hotel research as sub-contexts.

### 2. Fun
Standalone apps — games (Tetris, Flappy Bird, Doom), creative tools (drum computer, whiteboard, image generation), media (internet radio, podcast search, YouTube). These aren't productivity features. They exist because an OS should be something you *want* to use, not just something you *have* to use.

### 3. Social
WebRTC-based real-time communication. PulseOS is also a social device — not just a workspace. People connect to people, not just to AI.

**Design rule:** Every feature decision should serve at least one pillar. The system should feel alive and agentic, not static.

---

## The Context Engine — Core Innovation

The most important architectural decision in PulseOS: **everything is a Context**.

### Before vs. After

```
Before:  App ≠ Project ≠ Context ≠ Agent    (4 separate systems, no shared structure)
After:   Context = everything.               (Widgets + Chat + Skills + Data Flow = one system)
```

A Context is the universal unit. A weekend trip is a Context. A budget tracker is a Context. A game of Tetris is a Context. Your entire life ("Root") is a Context. They nest, reference each other, and form a tree.

### What a Context Contains

Every Context has:
- **A Canvas** — a spatial workspace with draggable widgets
- **A Chat** — AI-powered, can read/write all data in the context
- **Widgets** — typed data views (todo lists, KPIs, kanban boards, notes, tables, timelines, progress bars, apps)
- **Data** — JSON key-value store, schema-validated
- **Children** — sub-contexts that inherit data and can propagate data upward

### The Three Zoom Levels (L0 / L1 / L2)

Every widget has three information density levels, inspired by OpenViking's 3-layer information pyramid:

| Level | What You See | What You Can Do | Tokens (~) |
|-------|-------------|-----------------|------------|
| **L0** | Minimized pill — icon + title + badge | Quick-actions: toggle checkbox, update KPI, see count | ~100 |
| **L1** | Card — the standard widget view | Full inline editing, add items, reorder | ~1-2k |
| **L2** | Full view — expanded or enter sub-context | Everything + AI commands + structural changes | Full |

This isn't just a UI feature. It's an **information architecture**. When the AI reasons about your data, it can work at L0 (quick summary), L1 (working detail), or L2 (full depth). The same hierarchy maps to how data is stored, cached, and transmitted.

### Data Flow — Three Directions

Data doesn't just sit in one place. It flows through the context hierarchy:

```
         ↑ PROPAGATION
         │ Data rises to its "home context"
         │ e.g., Weight → Root context ("Me")
    ┌────┴────┐
    │  Root   │
    └────┬────┘
         │
         ↓ INHERITANCE (scope: "inherited")
         │ Data flows automatically to children
         │ e.g., Calendar, Budget visible in all sub-projects
    ┌────┴────┐
    │  Child  │
    └─────────┘
         │
         ↔ REFERENCES (dataRef)
           Same data visible in multiple contexts
           e.g., Weight in "Diet" = Weight in "Fitness"
```

**Widget Scopes:**
- `local` — visible only in this context (default)
- `inherited` — visible in all child contexts
- `global` — visible everywhere

**dataRef** — A widget can point to data in another context. Edit it anywhere, changes propagate everywhere via SSE (Server-Sent Events). The AI knows about these references and can create them automatically.

**homeContext Routing** — When the AI creates data, it decides where it belongs:
- Personal attribute (weight, age) → Root context
- Cross-project data (budget) → nearest parent with matching widget
- Local data → current context

### Skills Instead of Always-Running Agents

The old model: 13 idle agent processes waiting for something to happen. Wasteful.

The new model: **Skills** — reusable instruction modules that get composed into the AI prompt on-demand.

| Skill | Purpose |
|-------|---------|
| `data-writer` | Read/write data in any context |
| `data-router` | Decide which context data belongs to |
| `widget-builder` | Create widgets, change types, restructure |
| `schema-resolver` | Find or create data schemas |
| `context-navigator` | Create sub-contexts, link contexts |

One chat message = one `claude -p` call with the right skills composed in. No idle processes. No wasted compute.

### Schema Registry

Every piece of data can be validated against a schema. Schemas define what fields exist, what types they have, and how the data can be rendered:

**Core schemas:** task, note, event, metric, measurement, link, record, progress, app

A `task` schema can render as a todo list, a kanban board, or a table — same data, different views. The AI knows the schemas and uses them to create correctly structured data.

---

## The App System

PulseOS has 40+ apps, each a single HTML file in `apps/<name>/index.html`. No build step, no compilation. Apps are:

- **Self-contained** — one HTML file with embedded CSS and JS
- **AI-modifiable** — the AI can rewrite any app's HTML in real-time
- **Version-controlled** — every modification auto-saves a version backup
- **Context-aware** — apps can be embedded as widgets inside contexts (L0 pill → L1 card → L2 full iframe)

**App categories:**
- **Productivity:** projects, kanban, notes, budget, calendar, tickets, diary, travel-planner
- **Media:** radio, internet radio, podcast, youtube, mediaplayer, podcast-search
- **Creative:** whiteboard, drumcomputer, imagegen, mindmap, pipette
- **Games:** tetris, flappy, doom
- **System:** terminal, filebrowser, orchestrator, viking, chat
- **Data:** weather, news-channels, social-trends, recipes

The AI can create entirely new apps from chat: "Build me a pomodoro timer" → the AI generates a complete single-file HTML app, registers it, and adds it to the dashboard.

### The PulseOS Bridge Protocol

Apps embedded as widgets communicate with the parent context via a bridge:
- `PulseOS.reportStatus(text)` — live status updates shown in the widget
- `PulseOS.logInteraction(action, detail)` — interaction tracking visible to AI
- The AI sees the last 5 interactions when you chat about a context containing app widgets

---

## Technical Architecture

```
server.js              – Single Node.js HTTP server (no Express). ~4800 lines. Port 3000.
dashboard.html         – Desktop shell: dock, app launcher, window manager
apps/projects/         – The Context Engine UI (~4100 lines). Canvas + Chat + Widget system.
apps/<name>/           – 40+ apps, each a single index.html
widgets/               – Shared widget components (context-view.js)
data/contexts/         – Context JSON files (the "filesystem")
data/schemas/          – 9 schema definitions
supervisor.js          – Agent supervisor (auto-respawn via claude -p)
viking-bridge.py       – Python bridge to OpenViking context database
```

### Key Technical Constraints
- **No npm, no node_modules.** Only Node.js built-ins (http, fs, path, crypto, child_process).
- **No frontend frameworks.** Vanilla ES6+ only. No React, no Vue, no bundlers.
- **Single-file apps.** Every app is one HTML file. Complexity lives in one place.
- **SSE for real-time.** All live updates use Server-Sent Events, not WebSockets.
- **JSON as database.** No SQL, no MongoDB. JSON files on disk. Simple, debuggable, AI-readable.

### OpenViking Integration

PulseOS integrates with OpenViking — an agent-native context database that provides semantic search and multi-layer information storage. Viking mirrors the L0/L1/L2 pyramid, enabling AI to search across all contexts efficiently.

---

## What's Been Built (Implementation Status)

The Context Engine was built in 12 phases, all complete:

| Phase | What | Status |
|-------|------|--------|
| 1 | Schema Registry — 9 schemas, API endpoints | ✅ |
| 2 | Context Store — migration from projects.json to individual context files, full CRUD API | ✅ |
| 3 | Context Chat — AI integration with `claude -p`, action system (write-data, create-widget, etc.) | ✅ |
| 4 | Scope Chain — inherited widgets, data inheritance through context hierarchy | ✅ |
| 5 | Context Hierarchy — sub-contexts, tree navigation, drag-and-drop reparenting | ✅ |
| 6 | Widget Perspectives — same data rendered as different widget types (todo ↔ kanban ↔ table) | ✅ |
| 7 | L0 Quick-Actions — interactive minimized widgets (toggle checkboxes, edit KPIs, preview notes) | ✅ |
| 8 | dataRef Live-Sync — cross-context data references with SSE propagation | ✅ |
| 9 | Inherited Widget Edits + Schema Validation — edit parent data from child, `validateAgainstSchema()` | ✅ |
| 10 | Widget & Context Templates — save and reuse widget configurations and context structures | ✅ |
| 11 | Dashboard Integration — context-aware dashboard, system-level context features | ✅ |
| 12 | App-Context Unification — apps as contexts, bridge protocol, AI app creation from chat | ✅ |

---

## Design Philosophy

1. **AI-native, not AI-assisted.** The AI isn't a helper bolted onto a traditional OS. The entire data model, UI paradigm, and interaction flow are designed for AI co-habitation.

2. **Spatial over sequential.** Conversations are powerful but linear. PulseOS adds a spatial dimension — widgets on a canvas, contexts in a tree, data flowing in three directions.

3. **Progressive disclosure.** L0 → L1 → L2. You see what you need. The AI reasons at the right depth. Information density is a first-class concept.

4. **No build step, no ceremony.** Raw web technology. Edit a file, reload the page. An AI can create or modify any part of the system without needing to understand bundlers, transpilers, or dependency graphs.

5. **Everything connected.** Data doesn't live in silos. A weight measurement in your "Diet" project is the same data point in your "Fitness" project and your "Health" dashboard. The system knows this.

6. **The OS should be fun.** It has Doom. It has a drum machine. It has internet radio. An OS you don't enjoy using is an OS you'll abandon.

---

## Where It's Going

PulseOS is a working prototype exploring a fundamental question: **What does an operating system look like when AI is a first-class citizen, not an add-on?**

Future directions:
- **Multi-user / multi-device** — contexts shared between people, real-time collaboration
- **Proactive AI** — the system notices patterns, suggests actions, automates workflows without being asked
- **Voice-first interaction** — talk to your OS, see the results on your canvas
- **Plugin ecosystem** — third-party widgets, skills, and app templates
- **Mobile-native experience** — responsive canvas that works on phones and tablets
- **Persistent agents** — long-running AI processes that monitor, sync, and act autonomously

The core bet: the boundary between "using an app" and "talking to an AI" will disappear. PulseOS is what that convergence looks like.
