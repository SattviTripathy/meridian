/* Builds "Meridian — Technical & Interview Brief" as a .docx
 * Companion to build-guide.js (the Product Guide & Domain Reference).
 * Focus: how to EXPLAIN this project in an interview — the pitch, the domain
 * & regulatory context in talking-point form, the technical architecture, the
 * design trade-offs, a production roadmap, and an anticipated Q&A bank.
 * Run: node build-interview-brief.js  ->  Meridian-Interview-Brief.docx
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak
} = require('docx');

// ---------- palette ----------
const VIOLET = '6D28D9', VIOLET2 = '8B5CF6', INK = '3F3457', MUTED = '8B7CA8';
const ROSE = 'C0264A', AMBER = 'B45309', GREEN = '067A52', SKY = '1D4ED8';
const HEADFILL = 'EDE6FD', ZEBRA = 'F7F3FE', LINE = 'D9CCF2';
const CW = 9360; // content width, US Letter 1" margins

// ---------- helpers (mirrors build-guide.js) ----------
const R = (t, o = {}) => new TextRun(Object.assign({ text: t }, o));
const P = (children, o = {}) => new Paragraph(Object.assign({ children: Array.isArray(children) ? children : [R(children)] }, o));
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [R(t)] });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [R(t)] });
const H3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [R(t)] });
const body = (t, o = {}) => P(typeof t === 'string' ? [R(t)] : t, Object.assign({ spacing: { after: 120, line: 276 } }, o));
const bullet = (children) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 60, line: 264 }, children: Array.isArray(children) ? children : [R(children)] });
const numbered = (children, ref = 'n') => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80, line: 264 }, children: Array.isArray(children) ? children : [R(children)] });
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [R('')] });
const mono = (t, o = {}) => R(t, Object.assign({ font: 'Consolas', size: 19, color: '5B21B6' }, o));

const border = { style: BorderStyle.SINGLE, size: 1, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
const cellMargins = { top: 70, bottom: 70, left: 120, right: 120 };

function cell(content, { w, head = false, fill, bold = false, color, alignRight = false } = {}) {
  const runs = (Array.isArray(content) ? content : [content]).map(c =>
    typeof c === 'string' ? R(c, { bold: head || bold, color: head ? VIOLET : (color || INK), size: 19 }) : c);
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA }, margins: cellMargins,
    shading: { fill: fill || (head ? HEADFILL : 'FFFFFF'), type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0, line: 252 }, children: runs })]
  });
}
function table(widths, headerCells, rows, zebra = true) {
  const head = new TableRow({ tableHeader: true, children: headerCells.map((h, i) => cell(h, { w: widths[i], head: true })) });
  const trs = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => {
      const opts = { w: widths[i] };
      if (zebra && ri % 2 === 1) opts.fill = ZEBRA;
      if (Array.isArray(c) && c.length === 2 && typeof c[1] === 'object') { Object.assign(opts, c[1]); return cell(c[0], opts); }
      return cell(c, opts);
    })
  }));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...trs] });
}
function callout(title, lines, fill = 'F3ECFD', accent = VIOLET) {
  const kids = [new Paragraph({ spacing: { after: 60 }, children: [R(title, { bold: true, color: accent, size: 20 })] })];
  lines.forEach(l => kids.push(new Paragraph({ spacing: { after: 40, line: 264 }, children: Array.isArray(l) ? l : [R(l, { size: 20 })] })));
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CW, type: WidthType.DXA },
      margins: { top: 140, bottom: 140, left: 180, right: 180 },
      shading: { fill, type: ShadingType.CLEAR },
      borders: { left: { style: BorderStyle.SINGLE, size: 18, color: accent }, top: { style: BorderStyle.SINGLE, size: 1, color: fill }, bottom: { style: BorderStyle.SINGLE, size: 1, color: fill }, right: { style: BorderStyle.SINGLE, size: 1, color: fill } },
      children: kids
    })] })]
  });
}
// Q&A block: bold question, then answer paragraph(s)
function qa(q, ...answerParas) {
  const out = [new Paragraph({ spacing: { before: 120, after: 50 }, keepNext: true, children: [R('Q.  ', { bold: true, color: VIOLET }), R(q, { bold: true, color: INK })] })];
  answerParas.forEach((a, i) => out.push(new Paragraph({
    spacing: { after: 60, line: 272 },
    children: (i === 0 ? [R('A.  ', { bold: true, color: GREEN })] : []).concat(Array.isArray(a) ? a : [R(a)])
  })));
  return out;
}

// ============================================================
//  CONTENT
// ============================================================
const content = [];
const add = (...x) => x.forEach(e => Array.isArray(e) ? e.forEach(z => content.push(z)) : content.push(e));

// ---- Title block ----
add(
  new Paragraph({ spacing: { before: 1300, after: 0 }, children: [R('MERIDIAN', { bold: true, size: 72, color: VIOLET })] }),
  new Paragraph({ spacing: { after: 40 }, children: [R('Vegetation Risk Intelligence for Electric Utilities', { size: 30, color: INK })] }),
  new Paragraph({ spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: VIOLET2, space: 8 } }, children: [R('Technical & Interview Brief', { size: 24, color: MUTED, italics: true })] }),
  body([R('A one-document briefing for talking about Meridian out loud: the elevator pitch, the problem domain and regulatory landscape condensed into talking points, the full technical architecture, the design decisions and their trade-offs, a prototype-to-production roadmap, and an anticipated interview Q&A bank.', { size: 22 })]),
  spacer(200),
  callout('How to use this brief', [
    [R('For deep domain & regulatory reference, see the companion ', { size: 20 }), R('Meridian — Product Guide & Domain Reference', { size: 20, italics: true }), R('. This brief condenses that material and adds the engineering story.', { size: 20 })],
    [R('Live demo: ', { size: 20 }), R('https://sattvitripathy.github.io/meridian/', { size: 20, color: VIOLET, underline: {} }), R('   ·   Source: ', { size: 20 }), R('github.com/SattviTripathy/meridian', { size: 20, color: VIOLET, underline: {} })],
    [R('All data in the product is ', { size: 20 }), R('synthetic, seeded, and fictional', { size: 20, bold: true }), R(' — there is no real utility data and no backend. The modeled utility, ', { size: 20 }), R('Sierra Crest Power & Electric', { size: 20, italics: true }), R(', is invented for demonstration.', { size: 20 })]
  ]),
  new Paragraph({ children: [new PageBreak()] })
);

// ---- TOC ----
add(
  new Paragraph({ spacing: { after: 160 }, children: [R('Contents', { bold: true, size: 32, color: VIOLET })] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] })
);

// ============================================================
//  1 — THE PITCH
// ============================================================
add(H1('1 — The Pitch'));

add(H2('1.1  The 30-second version'));
add(callout('Say this first', [
  [R('“Meridian is a planning cockpit for electric-utility vegetation management. Utilities are legally required to keep trees clear of power lines, but most still trim on fixed calendar cycles — which over-trims safe areas and under-protects dangerous ones. Meridian scores every line ', { size: 21 }), R('span', { size: 21, italics: true }), R(' on a 0–100 risk index, forecasts when each one will breach its legal clearance, and — under a fixed budget — picks the exact set of spans that buys down the most risk per dollar. It turns a calendar problem into a prioritization problem.”', { size: 21 })]
]));

add(H2('1.2  The two-minute version'));
add(body([
  R('Tree-and-vegetation contact is one of the leading causes of power outages and a leading cause of utility-sparked wildfires — the Dixie Fire (2021, ~963k acres) started with a Douglas fir touching a distribution line. The hard constraint is that there is always more vegetation work than budget, so the real question is never ', {}),
  R('“is this risky?”', { italics: true }), R(' but ', {}), R('“which work, in what order, for the money we have?”', { italics: true }), R('', {})
]));
add(body([
  R('Meridian answers that with three moving parts. First, a ', {}), R('Vegetation Risk Index', { bold: true }),
  R(' blends five factors — encroachment, growth, fire-threat tier, criticality, and access — into a transparent, tunable 0–100 score per span. Second, ', {}),
  R('time-to-violation', { bold: true }), R(' (clearance headroom ÷ growth rate) converts that score into a deadline, so work can be scheduled against budget cycles and seasonal wildlife windows. Third, a ', {}),
  R('budget optimizer', { bold: true }), R(' does a greedy risk-per-dollar selection so the next dollar always goes where it removes the most risk. Around that sit a map, an auto-generated compliance register for GO 95 / FAC-003, a crew board, scenario comparison, and an on-device natural-language assistant. It is a zero-backend, offline-capable web app built on entirely synthetic data.', {})
]));

add(H2('1.3  Why it is interesting to talk about'));
add(
  bullet([R('Real domain: ', { bold: true }), R('it models an actual, regulated problem (utility vegetation management) with its real failure modes, economics, and law — not a toy CRUD app.', {})]),
  bullet([R('A clear thesis: ', { bold: true }), R('condition-based prioritization beats fixed-cycle trimming, and the product proves it visually with the spend-efficiency frontier.', {})]),
  bullet([R('Explainable by design: ', { bold: true }), R('a transparent weighted-factor model instead of a black box — which matters when a regulator asks “why is this span ranked first?”', {})]),
  bullet([R('Pragmatic engineering: ', { bold: true }), R('it deliberately delivers the desirable parts of a “GenAI” concept (recommendations, conversational data access, insights) without a cloud LLM, a database, or a backend — and is honest about that choice.', {})])
);

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  2 — DOMAIN IN TALKING POINTS
// ============================================================
add(H1('2 — The Problem Domain (talking points)'));

add(H2('2.1  The one idea to anchor everything'));
add(callout('The thesis', [
  [R('Fixed-cycle trimming spends money evenly across the calendar. ', { size: 21, bold: true }), R('Condition-based trimming spends it where risk is highest right now. The second is cheaper for the same risk reduction — but only if you can rank risk credibly. That ranking is the whole product.', { size: 21 })]
]));

add(H2('2.2  Two failure modes, very different stakes'));
add(table([2200, 7160],
  ['Failure mode', 'What happens / why it matters'],
  [
    [['Outage', { bold: true }], 'Vegetation faults the line; customers lose power. Cost = reliability penalties, lost load, truck rolls. High frequency, bounded cost.'],
    [['Ignition', { bold: true }], 'The same contact, under dry + windy conditions in a high fire-threat area, starts a wildfire. Cost = lives, property, multi-billion-dollar liability, even utility bankruptcy. Low frequency, catastrophic tail. This is why fire-threat is weighted as heavily as encroachment.'],
  ]));

add(H2('2.3  Where we operate — the modeled territory'));
add(body([
  R('The product models a fictional California utility, ', {}), R('Sierra Crest Power & Electric', { italics: true }),
  R(', because California concentrates the problem: long dry summers, steep terrain, expanding wildland-urban interface, seasonal offshore winds, and the most stringent regulatory regime in the country. The territory runs west-to-east across three ecological bands that map onto the fire-threat gradient:', {})
]));
add(table([2150, 1500, 5710],
  ['Zone', 'Fire tier', 'Character & dominant vegetation'],
  [
    [['Sacramento Valley', { bold: true }], 'HFTD Tier 1', 'High customer density, gentle terrain. Valley oak, Fremont cottonwood (fast riparian growth), London plane street trees.'],
    [['Sierra foothills', { bold: true }], 'HFTD Tier 2', 'Drier, steeper, brushier. Blue / interior live oak, gray (foothill) pine, chaparral (manzanita, chamise — intense fine fuel).'],
    [['Sierra Nevada', { bold: true }], 'HFTD Tier 3', 'Tall conifers, steep / hard-access terrain, highest ignition consequence. Ponderosa pine, Douglas fir, incense cedar, black oak.'],
  ]));
add(body([R('Talking point: ', { bold: true }), R('risk is not uniform — it is a function of what grows where and how fast. The west-to-east gradient is the reason the dataset is generated per-substation with zone-specific species, slopes, and customer densities rather than randomly.', {})]));

add(H2('2.4  The other forces (one-liners)'));
add(
  bullet([R('Drought & tree mortality: ', { bold: true }), R('bark-beetle outbreaks have killed 100M+ Sierra trees, leaving standing-dead “hazard trees” that fall in from outside the corridor.', {})]),
  bullet([R('Climate & fire season: ', { bold: true }), R('longer, drier seasons widen the window in which a contact becomes an ignition.', {})]),
  bullet([R('Wind: ', { bold: true }), R('offshore “Diablo” winds drive both line-slap contacts and rapid spread — the consequence multiplier on a Tier-3 contact.', {})]),
  bullet([R('Wildlife law as a scheduling constraint: ', { bold: true }), R('the cheapest time to trim is not always a legal time to trim — nesting birds (MBTA), Swainson’s hawk, spotted owl, and listed species impose seasonal windows. This is precisely why a time-to-violation forecast (schedule ahead) beats reacting at the deadline.', {})])
);

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  3 — REGULATORY SNAPSHOT
// ============================================================
add(H1('3 — Regulatory Snapshot (interview cheat-sheet)'));
add(callout('Framing, not legal advice', [
  'Summaries are simplified for orientation; specific distances and cadences are amended periodically. The point in an interview is to show you know which body governs what, and how those rules show up in the product.'
], 'FDF0DB', AMBER));

add(H2('3.1  Who governs what'));
add(table([2350, 3200, 3810],
  ['Authority', 'Scope', 'Key instruments'],
  [
    ['FERC / NERC', 'Bulk transmission reliability (federal)', 'FAC-003 (transmission vegetation), MVCD, per-day penalties'],
    ['CPUC', 'Investor-owned utility safety (California)', 'GO 95 (Rules 18 & 35), GO 165, the HFTD map'],
    ['CAL FIRE', 'Fire safety on state lands', 'Public Resources Code §§ 4292–4293'],
    ['Energy Safety (OEIS)', 'Wildfire-mitigation oversight (California)', 'Wildfire Mitigation Plan review, safety certifications'],
    ['USFWS / CDFW', 'Wildlife protection', 'MBTA, ESA / CESA survey & avoidance'],
  ]));

add(H2('3.2  The four you should be able to name'));
add(
  bullet([R('NERC FAC-003: ', { bold: true }), R('federal transmission vegetation standard (≈200 kV+). Born directly out of the 2003 Northeast Blackout, which began with untrimmed trees on Ohio transmission lines. Requires minimum clearance distances, annual inspections, and a documented plan.', {})]),
  bullet([R('CPUC GO 95, Rule 35: ', { bold: true }), R('the California overhead-line vegetation-clearance rule. In High Fire-Threat Districts it incorporates the PRC minimums and pushes utilities to keep larger “time-of-trim” clearances so a span does not drop below the legal minimum before the next cycle. Rule 18 sets how nonconformances are prioritized (Priority 1/2/3) — which maps to Meridian’s “remediate-by” dates.', {})]),
  bullet([R('PRC §§ 4292–4293 (CAL FIRE): ', { bold: true }), R('hard radial minimums — ~10 ft cleared around poles with equipment (4292); and conductor-to-vegetation minimums that rise with voltage (4293): 4 ft at 2.4–72 kV, 6 ft at 72–110 kV, 10 ft above 110 kV, plus removal of dead/diseased trees.', {})]),
  bullet([R('AB 1054 (2019): ', { bold: true }), R('landmark post-fire law — created Energy Safety (OEIS), a multi-billion-dollar Wildfire Fund, and tied liability protection to annual safety certifications and Wildfire Mitigation Plans. SB 901 (2018) first required the annual WMPs.', {})])
);

add(H2('3.3  How the rules show up in the code'));
add(table([3000, 6360],
  ['Regulatory concept', 'Where it lives in Meridian'],
  [
    ['Clearance minimums rise with voltage', 'Voltage classes (12 / 21 / 60 kV) each carry a base required clearance (4 / 6 / 10 ft).'],
    ['Enhanced clearance in fire districts', 'Required clearance is increased by +4 ft in Tier 2 and +8 ft in Tier 3, so high-voltage Tier-3 spans carry the largest envelope and breach soonest.'],
    ['Nonconformance prioritization (GO 95 R18)', 'The Compliance register sorts active violations first, then projected breaches, with remediation dates from time-to-violation.'],
    ['Auditability', 'The register exports to CSV and prints with authority references (GO 95 / FAC-003 / HFTD tier) per finding.'],
  ]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  4 — THE MODEL
// ============================================================
add(H1('4 — How the Model Works'));

add(H2('4.1  The Vegetation Risk Index (VRI)'));
add(body([R('Each span scores 0–100. Each of five factors is normalized to 0–1, multiplied by a weight, and the weighted average is scaled to 100. The formula is intentionally simple and transparent:', {})]));
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 120 }, children: [R('VRI = 100 × Σ(factorᵢ × weightᵢ) / Σ(weightᵢ)', { bold: true, italics: true, size: 24, color: VIOLET })] }));
add(table([2050, 1100, 6210],
  ['Factor', 'Default wt', 'What it captures (and how it is computed)'],
  [
    [['Encroachment', { bold: true }], '0.30', 'Tree-to-conductor headroom vs. required envelope. 1.0 if already in violation; otherwise 1 − margin/20 (zero by 20 ft of headroom).'],
    [['Fire threat', { bold: true }], '0.30', 'HFTD tier mapped to 0.18 / 0.58 / 1.00 for Tier 1 / 2 / 3. Turns an outage into a potential catastrophe.'],
    [['Growth', { bold: true }], '0.20', 'Species growth rate ÷ 5 ft/yr (cottonwood ≈ max). How fast the gap is closing.'],
    [['Criticality', { bold: true }], '0.15', 'log-scaled customers downstream (70%) + voltage class (30%). How much a fault here hurts.'],
    [['Access', { bold: true }], '0.05', 'Terrain slope (÷35°) + a hard-access flag. Affects response time and trim cost.'],
  ]));
add(body([R('Because weights are explicit and user-tunable (Scenario Compare), the same network re-ranks under a “fire-forward” vs. a “reliability-forward” posture — and you can show a regulator exactly how the plan changes.', {})]));

add(H2('4.2  Time-to-violation — a score becomes a deadline'));
add(body([
  R('A score says how bad; it does not say when. ', {}),
  R('time-to-violation = (current clearance − required clearance) ÷ growth rate', { bold: true }),
  R(', in months. A span 4 ft clear of a 2 ft/yr conifer breaches in ~24 months; a span already inside its envelope reads “in violation.” Planners think in deadlines — this field is what lets them schedule against budget cycles, crew capacity, and wildlife windows.', {})
]));

add(H2('4.3  Consequence & the synthetic dataset'));
add(body([R('Consequence', { bold: true }), R(' is estimated separately from likelihood as customers-downstream × a fire multiplier (Tier 3 largest), which drives the optimizer’s “customers protected” objective. The whole dataset is produced by a ', {}), R('deterministic seeded generator', { bold: true }), R(' (so the demo is identical on every reload) and is entirely fictional:', {})]));
add(table([3400, 5960],
  ['Attribute', 'Value'],
  [
    ['Utility (fictional)', 'Sierra Crest Power & Electric'],
    ['Territory', 'Sacramento Valley → Sierra Nevada foothills, CA'],
    ['Scale', '≈570 spans · 21 circuits · 6 substations · ~4,180 line-miles'],
    ['Fire gradient', 'HFTD Tier 1 (valley) → Tier 2 (foothills) → Tier 3 (Sierra)'],
    ['Annual VM budget', '$850,000 — set deliberately below the ~$1.47M backlog so prioritization actually bites'],
  ]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  5 — TECHNICAL ARCHITECTURE
// ============================================================
add(H1('5 — Technical Architecture'));

add(H2('5.1  The shape of the system'));
add(body([R('Meridian is a ', {}), R('100% client-side, static, single-page web application', { bold: true }), R(' — no backend, no database, no API, no build step. Everything (data generation, scoring, optimization, charts, the assistant) runs in the browser. This is a deliberate architecture, not a limitation of scope (see §6 and §7).', {})]));
add(callout('Runtime data flow (all in-browser)', [
  [mono('data.js  ')], [R('   seeded generator → ~570 span objects + factor scores', { size: 20 })],
  [mono('   │')],
  [mono('   ▼')],
  [mono('app.js   ')], [R('   state (weights, work, scenarios) ← localStorage', { size: 20 })],
  [mono('   │        router → 8 views', { size: 19 })],
  [mono('   ▼')],
  [R('   render: hand-rolled SVG  ·  Leaflet basemap  ·  hand-rolled SVG charts', { size: 20 })],
  [mono('   ▲')],
  [R('   user actions → recompute scores → re-render → persist to localStorage', { size: 20 })],
  [R('sw.js → caches the app shell so the whole thing runs offline.', { size: 20, italics: true })]
]));

add(H2('5.2  Stack at a glance'));
add(table([2600, 6760],
  ['Layer', 'Choice'],
  [
    ['Language / framework', 'Vanilla JavaScript (ES2020), no framework, no transpiler, no bundler.'],
    ['Markup / style', 'Single index.html + one hand-written CSS file (CSS custom properties for theming).'],
    ['Geographic map', 'Leaflet + OpenStreetMap / CARTO tiles (CDN). The only network dependency.'],
    ['Schematic map & all charts', 'Hand-rolled inline SVG — zero charting libraries, works offline.'],
    ['Persistence', 'Browser localStorage (work orders, weights, saved scenarios).'],
    ['Offline / installability', 'Service worker (cache-first app shell) + web app manifest = installable PWA.'],
    ['Build / deploy', 'No build. Static files served as-is; deployed on GitHub Pages from main.'],
    ['Tooling', 'A tiny zero-dependency Node script generates PNG icons; this docs/ folder uses the docx lib only for these documents.'],
  ]));

add(H2('5.3  The data & scoring engine (data.js)'));
add(body('A single self-contained module that owns the domain. It exposes pure functions and a generator:'));
add(
  bullet([R('Seeded PRNG (mulberry32): ', { bold: true }), R('a 32-bit deterministic generator seeded with a fixed constant, so every reload yields the identical network — essential for a demo and for reproducible screenshots.', {})]),
  bullet([R('Domain catalogs: ', { bold: true }), R('species (growth rate, canopy size, conifer flag), substations (zone, tier, location, species mix, slope, customer base), voltage classes, and crews — these encode the west-to-east gradient.', {})]),
  bullet([mono('generate()'), R(' builds radial feeders: a trunk of poles stepping outward from each substation with occasional lateral branches, producing geographically plausible circuits. Customer counts decay outward along the feeder.', {})]),
  bullet([R('Pure scoring functions: ', { bold: true }), mono('factorsFor()'), R(', ', {}), mono('computeVRI(span, weights)'), R(', ', {}), mono('timeToViolation()'), R(', ', {}), mono('consequence()'), R(' — no side effects, which makes them trivially re-runnable when weights change.', {})])
);

add(H2('5.4  The application layer (app.js)'));
add(
  bullet([R('Single IIFE, no framework. ', { bold: true }), R('State lives in a handful of module-scoped variables; a ~10-line ', {}), mono('go(view)'), R(' function is the entire router for the 8 views.', {})]),
  bullet([R('Render-on-change. ', { bold: true }), R('Each view is a function that writes an HTML string into the main panel and wires its own event handlers. Changing a weight calls ', {}), mono('recomputeAll()'), R(' then re-renders — no virtual DOM, no reactivity framework, and it is fast enough at this scale.', {})]),
  bullet([R('Hybrid map. ', { bold: true }), R('A custom lat/lng → viewport projection draws the schematic SVG; the same span set feeds Leaflet polylines for the geographic view. Both share one risk-color ramp.', {})]),
  bullet([R('Hand-rolled SVG charts. ', { bold: true }), R('The 24-month projection, tier donut, circuit/species bars, spend-efficiency frontier, and margin histogram are all generated as SVG strings — no dependency, fully offline, and styled to match.', {})])
);

add(H2('5.5  The budget optimizer'));
add(body([
  R('Given a budget and an objective (risk / customers / fire-tier), it computes each candidate span’s ', {}),
  R('value-per-dollar', { bold: true }), R(', sorts descending, and greedily funds spans until the budget is exhausted. It simultaneously builds the full ', {}),
  R('spend-efficiency frontier', { bold: true }), R(' (cumulative risk reduced vs. cumulative dollars) whose steep early slope is the visual proof that the first dollars clear the worst spans. Complexity is O(n log n), dominated by the sort.', {})
]));
add(callout('Why greedy and not a “real” optimizer', [
  'The exact form (maximize value subject to a cost budget) is the 0/1 knapsack problem, which is NP-hard. But because trim costs are tiny relative to the budget and items are near-divisible in aggregate, the greedy value-per-dollar solution is provably near-optimal here — and, crucially, it is explainable: every funded span has an obvious reason. For this domain, defensibility beats squeezing out the last fraction of a percent.'
]));

add(H2('5.6  Ask Meridian — the on-device NL assistant'));
add(body([
  R('A natural-language query layer that runs ', {}), R('entirely in the browser', { bold: true }),
  R(' — no LLM, no API key, no network, nothing leaves the device. ', {}),
  mono('askMeridian(text)'), R(' is a deterministic ', {}), R('intent parser', { bold: true }),
  R(': it extracts entities (span / circuit / substation IDs, species, fire tier, a time window, a result count) with regex, matches the question against an ordered set of intent handlers, and answers by querying the live in-memory dataset.', {})
]));
add(
  bullet([R('Intents: ', { bold: true }), R('explain-a-span (with a factor-contribution breakdown), explain-a-circuit, network insights/patterns, compliance, critical-infrastructure, species/substation comparison, counts, cost totals, and a general filter-and-rank fallback (by tier / substation / species / status / high-risk, sorted by risk / cost / customers / breach-time).', {})]),
  bullet([R('Honest by design: ', { bold: true }), R('it tells the user what it is (on-device) and admits gaps — e.g., “there is no named hospitals layer yet,” then answers with the closest available proxy (criticality).', {})]),
  bullet([R('Wired to the rest of the app: ', { bold: true }), R('answer rows are clickable and deep-link into the dashboard with the relevant span’s detail drawer open.', {})])
);
add(callout('The “GenAI” backstory — a great interview moment', [
  [R('The assistant was inspired by a vendor slide proposing a GenAI vegetation system: OpenAI + LangChain + a SQL-agent over a MySQL warehouse + a human-feedback loop. ', { size: 20 }), R('Meridian deliberately delivers the desirable, doable parts of that vision — prioritized recommendations, conversational data access, generated insights — without a cloud LLM, a database, or a backend.', { size: 20, bold: true })],
  [R('That is the talking point: the value was in the prioritization and the conversation, not in the specific stack. An on-device parser keeps it free, private, offline, and deterministic. §7 covers exactly when you would reach for the real LLM stack.', { size: 20 })]
]));

add(H2('5.7  Offline, persistence & deployment'));
add(
  bullet([R('Service worker (', {}), mono('sw.js'), R('): ', {}), R('caches the app shell cache-first so the app loads and runs with no connection; only the satellite-style basemap needs the network and fails gracefully to the offline schematic. The cache name is versioned (', {}), mono('meridian-v4'), R(') and bumped on every shell change so installed PWAs update.', {})]),
  bullet([R('Persistence: ', { bold: true }), R('work-order state, tuned weights, and saved scenarios live in localStorage under namespaced keys; “Reset demo” clears them.', {})]),
  bullet([R('Deployment: ', { bold: true }), R('the repo is the site — push to ', {}), mono('main'), R(' and GitHub Pages serves the static files. No CI, no servers, no cost.', {})])
);

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  6 — DESIGN DECISIONS & TRADE-OFFS
// ============================================================
add(H1('6 — Design Decisions & Trade-offs'));
add(body('Every interesting choice here was a trade-off. Being able to articulate the alternative you rejected — and why — is the point.'));
add(table([2350, 3300, 3710],
  ['Decision', 'Alternative considered', 'Why this way'],
  [
    [['Transparent weighted-factor score', { bold: true }], 'A trained ML risk model', 'No labeled outcome data exists; and the score must be explainable and defensible to a regulator. A tunable linear blend is auditable and lets a utility set its own posture. ML is a later calibration step, not the foundation.'],
    [['Span as the atomic unit', { bold: true }], 'Score whole circuits', 'Crews work span-by-span; risk is wildly non-uniform within a circuit. Span granularity is what makes prioritization actionable. Circuit-level rollups are derived on top.'],
    [['Greedy risk-per-dollar', { bold: true }], 'Exact knapsack / ILP solver', 'Knapsack is NP-hard; greedy is near-optimal here and, more importantly, explainable. Defensibility > the last 0.5%.'],
    [['On-device NL parser', { bold: true }], 'Cloud LLM (OpenAI etc.)', 'Keeps it free, private, offline, and deterministic; no key management. Trade-off: it understands a bounded vocabulary, not arbitrary phrasing. Acceptable for a demo; §7 shows the upgrade path.'],
    [['Static, no-backend PWA', { bold: true }], 'Server + database + auth', 'Zero cost, trivial deploy, fully offline, and the synthetic data needs no persistence layer. Trade-off: single-user, no shared state, no live data feeds.'],
    [['Synthetic, seeded data', { bold: true }], 'A real or scraped dataset', 'No real utility data is public or safe to use; seeding makes the demo reproducible and the screenshots stable. Trade-off: it cannot reveal real-world data-quality problems.'],
    [['Hand-rolled SVG charts', { bold: true }], 'A charting library (D3/Chart.js)', 'Zero dependencies, smaller payload, works offline, and full control over styling. Trade-off: more code per chart.'],
    [['No framework (vanilla JS)', { bold: true }], 'React / Vue / Svelte', 'No build step, instant load, nothing to learn to read it; at this scale a framework adds weight without benefit. Trade-off: manual DOM wiring.'],
  ]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  7 — PROTOTYPE TO PRODUCTION
// ============================================================
add(H1('7 — From Prototype to Production'));
add(body('If asked “how would you make this real?”, the honest answer is that the analytics core would survive and everything around it would grow a backend and real data. The roadmap, in order of value:'));
add(
  numbered([R('Real condition data. ', { bold: true }), R('Replace synthetic clearance/growth with measured inputs: LiDAR / satellite or aerial imagery for encroachment, a GIS asset model for the network, species and growth from inventory + remote sensing, and the live CPUC HFTD layer for fire tier.', {})]),
  numbered([R('A data pipeline + store. ', { bold: true }), R('Ingest, clean, and enrich those feeds into a warehouse (the slide’s MySQL / warehouse layer); the scoring functions move server-side or into a job that materializes per-span scores.', {})]),
  numbered([R('Calibrate the weights with outcomes. ', { bold: true }), R('Once you have historical faults/ignitions, fit or validate the factor weights against real outcomes — turning the transparent model into a transparent ', {}), R('and', { italics: true }), R(' empirically grounded one. Keep it explainable.', {})]),
  numbered([R('A real assistant (RAG + LLM). ', { bold: true }), R('Swap the on-device parser for a retrieval-augmented LLM with a SQL/agent tool over the warehouse — the slide’s vision — once there is real, large, messy data worth conversing with. Add the human-feedback loop to improve recommendations.', {})]),
  numbered([R('Multi-user backend. ', { bold: true }), R('Auth, roles (planner / compliance / crew), shared scenarios and work orders, and an audit trail — replacing localStorage.', {})]),
  numbered([R('Integrations. ', { bold: true }), R('Push work orders to the utility’s work-management system; pull crew availability; file compliance exports into the regulatory workflow.', {})])
);
add(callout('The discipline to emphasize', [
  'The prototype intentionally stops at the boundary where real data and real users begin. It proves the decision-support value cheaply and honestly, and the architecture leaves a clean seam (the pure scoring functions, the synthetic generator) to swap in production data without rewriting the analytics.'
], 'E6F4EA', GREEN));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  8 — Q&A BANK
// ============================================================
add(H1('8 — Anticipated Questions & Answers'));

add(H2('8.1  Product & domain'));
add(qa('In one sentence, what is Meridian?',
  'A decision-support cockpit that scores every line span by vegetation risk, forecasts when each breaches its legal clearance, and picks the highest risk-per-dollar set of spans to trim under a fixed budget — replacing fixed-cycle trimming with condition-based prioritization.'));
add(qa('Why does this problem matter?',
  'Vegetation contact is a top cause of outages and utility-sparked wildfires; the Dixie Fire alone burned ~963k acres from a tree touching a line. There is always more work than budget, so credible risk ranking is the difference between spending well and spending evenly.'));
add(qa('How is risk actually scored?',
  [R('A 0–100 Vegetation Risk Index: five normalized factors (encroachment, fire-threat tier, growth, criticality, access) times tunable weights, scaled to 100. Time-to-violation = clearance headroom ÷ growth rate turns the score into a deadline.', {})]));

add(H2('8.2  Technical'));
add(qa('Walk me through what happens when I click a span.',
  'The click handler finds the span object, recomputes its five normalized factors, and renders the detail drawer: a clearance gauge (current vs. required), time-to-violation, growth, species, customers, cost, fault consequence, the weighted factor breakdown, and a recommended action — all from in-memory data, no network call.'));
add(qa('Why no backend or framework?',
  'The data is synthetic and needs no persistence beyond the browser; the compute is light enough to run client-side; and a static PWA deploys for free on GitHub Pages and works offline. A framework would add a build step and weight without benefit at this scale. It is a deliberate fit-to-purpose choice, and there is a clear path to a backend (§7).'));
add(qa('Is the budget optimizer optimal?',
  'It is a greedy value-per-dollar selection — near-optimal for this problem because trim costs are small relative to the budget, and far more explainable than an exact knapsack solver, which would be NP-hard. For a regulated, defensible plan, explainability wins.'));
add(qa('Does “Ask Meridian” use ChatGPT?',
  'No — and that is intentional. It is a deterministic intent parser running in the browser: no LLM, no API key, no network, nothing leaves the device. It was inspired by a GenAI concept slide, but I delivered the valuable parts (recommendations, conversation, insights) without the cloud stack. If real, large, messy data existed, §7 is where a RAG + LLM assistant would slot in.'));
add(qa('How do you keep the demo reproducible?',
  'A seeded mulberry32 PRNG generates the entire network deterministically, so every reload — and every screenshot — is identical.'));

add(H2('8.3  Judgment & reflection'));
add(qa('What was the hardest part?',
  'Designing a risk score that is both credible to a domain expert and simple enough to be transparent. The temptation is to over-engineer it; the discipline was keeping it a tunable linear blend that a planner can explain to a regulator.'));
add(qa('What would you do differently or next?',
  'Bring in real condition data (LiDAR/imagery for encroachment, GIS for the network) and calibrate the weights against historical fault/ignition outcomes. That is the single biggest lift from “convincing prototype” to “operational tool.”'));
add(qa('How would you know if it actually worked in production?',
  'Track risk-reduced-per-dollar against the prior fixed-cycle program, and compare vegetation-caused outage and ignition rates on managed vs. baseline circuits over a season. The 24-month projection view is the in-product version of that argument.'));
add(qa('What are its limitations?',
  'Synthetic data can’t expose real data-quality issues; it’s single-user with no live feeds; the assistant understands a bounded vocabulary; and the weights are reasoned, not yet empirically calibrated. None of these are hidden — the product and the FAQ state them.'));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  9 — CHEAT SHEET
// ============================================================
add(H1('9 — Numbers & Names to Remember'));
add(table([3000, 6360],
  ['', ''],
  [
    [['Scale', { bold: true }], '≈570 spans · 21 circuits · 6 substations · ~4,180 line-miles'],
    [['Budget', { bold: true }], '$850K/yr modeled, below a ~$1.47M backlog (so prioritization matters)'],
    [['VRI factors + weights', { bold: true }], 'Encroachment .30 · Fire .30 · Growth .20 · Criticality .15 · Access .05'],
    [['Voltage / clearance', { bold: true }], '12 / 21 / 60 kV → base 4 / 6 / 10 ft; +4 ft Tier 2, +8 ft Tier 3'],
    [['Fire tiers', { bold: true }], 'HFTD Tier 1 valley · Tier 2 foothills · Tier 3 Sierra'],
    [['Views (8)', { bold: true }], 'Dashboard · Optimizer · Analytics · Crews · Compliance · Scenarios · Ask Meridian · FAQ'],
    [['Regulators', { bold: true }], 'NERC FAC-003 · CPUC GO 95/165 · CAL FIRE PRC 4292–4293 · OEIS WMP · USFWS/CDFW'],
    [['Stack', { bold: true }], 'Vanilla JS · SVG + Leaflet · localStorage · service-worker PWA · GitHub Pages, no build'],
  ], false));
add(spacer(160));
add(body([R('Companion document: ', { italics: true, color: MUTED, size: 20 }), R('Meridian — Product Guide & Domain Reference', { italics: true, color: MUTED, size: 20 }), R(' (full domain, flora/fauna, and regulatory depth).', { italics: true, color: MUTED, size: 20 })]));

// ============================================================
//  DOCUMENT
// ============================================================
const doc = new Document({
  creator: 'Meridian',
  title: 'Meridian — Technical & Interview Brief',
  description: 'Pitch, domain & regulatory talking points, technical architecture, trade-offs, and interview Q&A for the Meridian vegetation risk intelligence product.',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: INK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: 'Arial', color: VIOLET },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0, keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: 'D9CCF2', space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 27, bold: true, font: 'Arial', color: '5B21B6' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: 'Arial', color: INK },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2, keepNext: true } },
    ]
  },
  numbering: {
    config: [
      { reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { run: { color: VIOLET }, paragraph: { indent: { left: 460, hanging: 260 } } } }] },
      { reference: 'n', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E7DBF7', space: 4 } }, children: [R('MERIDIAN', { bold: true, size: 16, color: VIOLET }), R('  ·  Technical & Interview Brief', { size: 16, color: MUTED })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [R('Page ', { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }), R(' · Technical & Interview Brief · synthetic data', { size: 16, color: MUTED })] })] }) },
    children: content
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('Meridian-Interview-Brief.docx', buf);
  console.log('wrote Meridian-Interview-Brief.docx (' + buf.length + ' bytes)');
});
