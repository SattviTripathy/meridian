# Meridian — Vegetation Risk Intelligence

**Condition-based vegetation management for electric utilities.** Meridian scores every
line span by wildfire/outage risk, forecasts *when* each span will breach its required
clearance, and tells a vegetation-management planner where the next trimming dollar buys
down the most risk — replacing fixed "trim everything every N years" cycles with a
data-driven, budget-aware plan.

> **Live demo:** https://sattvitripathy.github.io/meridian/
>
> All data is **synthetic, seeded, and fictional** — no real utility data. The modelled
> utility (*Sierra Crest Power & Electric*) spans the Sacramento Valley up into the Sierra
> Nevada foothills, across the CPUC High Fire-Threat District Tier 1 → 3 gradient.

---

## Why this exists

Trees and brush growing into power lines are the leading cause of distribution outages and
a major wildfire ignition source. Utilities are obligated (CPUC GO 95, NERC FAC-003) to
keep vegetation clear of conductors. Most still trim on fixed cycles — expensive and blind
to which spans are actually dangerous *now*. Meridian moves the planner from **cyclical** to
**condition-based** trimming.

## The Vegetation Risk Index (VRI)

Every span scores **0–100** by blending five normalized factors (weights are tunable in
*Scenario compare*):

| Factor | Proxy | Why |
|---|---|---|
| **Encroachment** | current tree-to-conductor clearance vs. required envelope | how close to failure now |
| **Growth** | species growth rate × time since last trim | how fast the gap closes |
| **Fire threat** | CPUC HFTD tier (1 / 2 / 3) | turns an outage into a catastrophe |
| **Criticality** | customers downstream + voltage class | a fault here hurts more |
| **Access** | terrain slope & crew reachability | response time & cost |

**Time-to-violation** = clearance headroom ÷ growth rate — converts a score into a *deadline*
("breaches in ~8 months"), which is how planners actually think.

## What's in the app

- **Risk dashboard** — hybrid map (stylized schematic **or** real California basemap), every
  span colored by VRI, linked to a ranked work-priority list and a deep span-detail drawer
  (clearance gauge, factor breakdown, recommended action).
- **Budget optimizer** — greedy risk-per-dollar selection: given a budget, pick the set of
  spans that buys down the most risk / protects the most customers / covers the most Tier-3.
  Includes the **spend-efficiency frontier** that visually argues for condition-based trimming.
- **Portfolio analytics** — 24-month projected-violations curve (no-action vs. funded plan),
  risk by fire tier, highest-risk circuits, risk by species, clearance-margin distribution.
- **Crew dispatch (lite)** — turn high-risk spans into work orders, auto-assign to crews,
  track them across a Backlog → Scheduled → In-progress → Completed board.
- **Compliance register** — auditable list of clearance violations & imminent breaches with
  GO 95 / FAC-003 references and remediation deadlines. Export CSV or print.
- **Scenario compare** — save tuned weight/budget models and compare two head-to-head.

## Tech

Plain, dependency-light static PWA — no backend, no build step.

- `index.html` — app shell
- `css/styles.css` — lavender theme
- `js/data.js` — **seeded** synthetic data engine (deterministic; ~570 spans, 21 circuits,
  6 substations) plus the VRI scoring functions
- `js/app.js` — all views, scoring, map rendering, persistence
- `sw.js` + `manifest.webmanifest` — installable, offline-capable PWA
- `generate-icons.js` — zero-dependency Node PNG icon generator
- `server.js` — tiny static server for local preview

State (work orders, tuned weights, scenarios) persists in `localStorage`. The geographic
basemap uses Leaflet + OpenStreetMap/CARTO tiles (the schematic view works fully offline).

## Run locally

```bash
node server.js          # → http://localhost:5174
# or: python -m http.server 8125
```

To regenerate the app icons: `node generate-icons.js`.

---

*Built as an exploratory prototype. Basemap © OpenStreetMap contributors © CARTO.*
