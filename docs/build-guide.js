/* Builds "Meridian — Product Guide & Domain Reference" as a .docx
 * Run: node build-guide.js  ->  Meridian-Product-Guide.docx
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak
} = require('docx');

// ---------- palette ----------
const VIOLET = '6D28D9', VIOLET2 = '8B5CF6', INK = '3F3457', MUTED = '8B7CA8';
const ROSE = 'C0264A', AMBER = 'B45309', GREEN = '067A52';
const HEADFILL = 'EDE6FD', ZEBRA = 'F7F3FE', LINE = 'D9CCF2';
const CW = 9360; // content width, US Letter 1" margins

// ---------- helpers ----------
const R = (t, o = {}) => new TextRun(Object.assign({ text: t }, o));
const P = (children, o = {}) => new Paragraph(Object.assign({ children: Array.isArray(children) ? children : [R(children)] }, o));
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [R(t)] });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [R(t)] });
const H3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [R(t)] });
const body = (t, o = {}) => P(typeof t === 'string' ? [R(t)] : t, Object.assign({ spacing: { after: 120, line: 276 } }, o));
const bullet = (children) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 60, line: 264 }, children: Array.isArray(children) ? children : [R(children)] });
const numbered = (children, ref = 'n') => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80, line: 264 }, children: Array.isArray(children) ? children : [R(children)] });
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [R('')] });

const border = { style: BorderStyle.SINGLE, size: 1, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border,
  insideHorizontal: border, insideVertical: border };
const cellMargins = { top: 70, bottom: 70, left: 120, right: 120 };

function cell(content, { w, head = false, fill, bold = false, color, alignRight = false } = {}) {
  const runs = (Array.isArray(content) ? content : [content]).map(c =>
    typeof c === 'string' ? R(c, { bold: head || bold, color: head ? VIOLET : (color || INK), size: head ? 19 : 19 }) : c);
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    margins: cellMargins,
    shading: { fill: fill || (head ? HEADFILL : 'FFFFFF'), type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0, line: 252 }, children: runs })]
  });
}
// table from a header array + rows array; widths must sum to CW
function table(widths, headerCells, rows, zebra = true) {
  const head = new TableRow({ tableHeader: true, children: headerCells.map((h, i) => cell(h, { w: widths[i], head: true })) });
  const trs = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => {
      const opts = { w: widths[i] };
      if (zebra && ri % 2 === 1) opts.fill = ZEBRA;
      // allow [text, {opts}] cell spec
      if (Array.isArray(c) && c.length === 2 && typeof c[1] === 'object') { Object.assign(opts, c[1]); return cell(c[0], opts); }
      return cell(c, opts);
    })
  }));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...trs] });
}

// callout box (single-cell table)
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

// ============================================================
//  CONTENT
// ============================================================
const content = [];
const add = (...x) => x.forEach(e => content.push(e));

// ---- Title block ----
add(
  new Paragraph({ spacing: { before: 1400, after: 0 }, children: [R('MERIDIAN', { bold: true, size: 72, color: VIOLET })] }),
  new Paragraph({ spacing: { after: 40 }, children: [R('Vegetation Risk Intelligence for Electric Utilities', { size: 30, color: INK })] }),
  new Paragraph({ spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: VIOLET2, space: 8 } }, children: [R('Product Guide & Domain Reference', { size: 24, color: MUTED, italics: true })] }),
  body([R('A planning cockpit that scores every line span by wildfire and outage risk, forecasts when each span will breach its required clearance, and directs the next trimming dollar to where it buys down the most risk — replacing fixed “trim-everything-every-N-years” cycles with condition-based prioritization.', { size: 22 })]),
  spacer(200),
  callout('About this build', [
    [R('Version 1.0  ·  June 2026  ·  Live demo: ', { size: 20 }), R('https://sattvitripathy.github.io/meridian/', { size: 20, color: VIOLET, underline: {} })],
    [R('All data in the product is ', { size: 20 }), R('synthetic, seeded, and fictional', { size: 20, bold: true }), R(' — no real utility data is used. The modeled utility, ', { size: 20 }), R('Sierra Crest Power & Electric', { size: 20, italics: true }), R(', is invented for demonstration.', { size: 20 })],
    [R('This document mixes a fast orientation (Part I) with deep reference material (Parts II–V). Read Part I to get going; dip into the rest as needed.', { size: 20 })]
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
//  PART I — QUICK START
// ============================================================
add(H1('Part I — Quick Start'));

add(H2('1.1  What Meridian is, in one minute'));
add(body('Electric utilities are legally obligated to keep trees and brush clear of power lines. When they fail, the consequences run from routine outages to catastrophic wildfires. Most utilities still manage vegetation on fixed cycles — trimming entire circuits on a calendar regardless of actual condition. That is expensive and blind: it over-trims low-risk spans and under-protects the dangerous ones.'));
add(body([
  R('Meridian flips this. It assigns every line ', {}), R('span', { italics: true }),
  R(' (the segment of conductor between two poles) a ', {}), R('Vegetation Risk Index (VRI)', { bold: true }),
  R(' from 0–100, estimates the ', {}), R('time until that span breaches its required clearance', { bold: true }),
  R(', and then — given a fixed budget — selects the exact set of spans that reduces the most risk per dollar. The planner sees the whole network on a map, a ranked work list, and a set of decision tools.', {})
]));

add(H2('1.2  Who it is for'));
add(
  bullet([R('Vegetation-management planners', { bold: true }), R(' — the primary user. Decides where the trimming budget goes each cycle.', {})]),
  bullet([R('Wildfire-mitigation & reliability teams', { bold: true }), R(' — uses the fire-tier and projection views to target ignition risk.', {})]),
  bullet([R('Compliance & regulatory staff', { bold: true }), R(' — pulls the auditable violation register for GO 95 / FAC-003 reporting.', {})]),
  bullet([R('Operations / crew supervisors', { bold: true }), R(' — turns the plan into assigned, tracked work orders.', {})])
);

add(H2('1.3  The mental model'));
add(body('Five questions, answered in order, drive the whole product:'));
add(
  numbered([R('Where is the vegetation risk? ', { bold: true }), R('→ the map and the Vegetation Risk Index.', {})]),
  numbered([R('How urgent is each span? ', { bold: true }), R('→ time-to-violation (a deadline, not just a score).', {})]),
  numbered([R('What can we afford to fix? ', { bold: true }), R('→ the budget optimizer.', {})]),
  numbered([R('Who does the work, and is it done? ', { bold: true }), R('→ crew dispatch.', {})]),
  numbered([R('Can we prove we are compliant? ', { bold: true }), R('→ the compliance register.', {})])
);

add(H2('1.4  Your first session (5 minutes)'));
add(
  numbered([R('Open the ', {}), R('Risk Dashboard', { bold: true }), R('. The map shows the network colored green→red by risk; the right-hand list ranks spans worst-first.', {})], 'n2'),
  numbered([R('Toggle ', {}), R('Schematic ↔ Map', { bold: true }), R(' to switch between the clean circuit diagram and the real California basemap.', {})], 'n2'),
  numbered([R('Click any span (on the map or in the list) to open its ', {}), R('detail drawer', { bold: true }), R(' — clearance gauge, growth, species, the five-factor breakdown, and a recommended action.', {})], 'n2'),
  numbered([R('Go to the ', {}), R('Budget Optimizer', { bold: true }), R('. Drag the budget slider and watch the funded plan, the “% of portfolio risk bought down,” and the efficiency frontier update live.', {})], 'n2'),
  numbered([R('Open ', {}), R('Analytics', { bold: true }), R(' to see the 24-month projected-violations curve — no-action vs. the funded plan.', {})], 'n2'),
  numbered([R('Visit ', {}), R('Compliance', { bold: true }), R(' and export the register to CSV, or print it.', {})], 'n2'),
  numbered([R('In ', {}), R('Scenario Compare', { bold: true }), R(', retune the risk weights, save two scenarios, and compare them head-to-head.', {})], 'n2')
);

add(H2('1.5  The six modules at a glance'));
add(table([1900, 4360, 3100],
  ['Module', 'What it does', 'Key output'],
  [
    ['Risk Dashboard', 'Hybrid map + ranked work list + per-span detail drawer.', 'Prioritized list of which spans to trim.'],
    ['Budget Optimizer', 'Greedy risk-per-dollar selection under a budget constraint.', 'A funded work plan + spend-efficiency frontier.'],
    ['Portfolio Analytics', '24-month projections and risk concentration charts.', 'The case for the plan; where risk clusters.'],
    ['Crew Dispatch', 'Work orders, crew assignment, status board.', 'Scheduled, tracked field work.'],
    ['Compliance Register', 'Clearance violations & imminent breaches with legal references.', 'Auditable CSV / printable report.'],
    ['Scenario Compare', 'Save & compare tuned weight / budget models.', 'Defensible “why this plan” comparison.'],
  ]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  PART II — THE PROBLEM DOMAIN
// ============================================================
add(H1('Part II — The Problem Domain'));

add(H2('2.1  Why vegetation management matters'));
add(body([
  R('Tree and vegetation contact is consistently among the leading causes of electric distribution outages in the United States, and a leading cause of utility-sparked wildfires. A single branch bridging an energized conductor can trip a circuit (an outage), arc and drop burning material into dry fuel (an ignition), or both. ', {}),
  R('Utility Vegetation Management (UVM)', { bold: true }),
  R(' is the discipline of inspecting, pruning, removing, and monitoring vegetation around overhead lines to prevent these events while balancing cost, ecology, and customer relations.', {})
]));
add(body('The core tension Meridian addresses: there is always far more vegetation work identifiable than budget to do it. Cyclical programs spread money evenly across the calendar; condition-based programs concentrate money where risk is highest right now. The latter is cheaper for the same risk reduction — but only if you can measure and rank risk credibly. That ranking is exactly what the Vegetation Risk Index provides.'));

add(callout('Outage vs. ignition — two failure modes, very different stakes', [
  [R('Outage: ', { bold: true }), R('vegetation contact faults the line; customers lose power. Cost = reliability penalties, lost load, truck rolls.', { size: 20 })],
  [R('Ignition: ', { bold: true }), R('the same contact, under dry, windy conditions in a high fire-threat area, starts a wildfire. Cost = lives, property, and multi-billion-dollar liability. Meridian weights fire-threat heavily precisely because the tail risk is catastrophic.', { size: 20 })]
], 'FDE4E1', ROSE));

add(H2('2.2  California wildfire context'));
add(body('California concentrates the problem: long dry summers, steep terrain, dense wildland-urban interface, seasonal offshore wind events, and decades of fuel accumulation. Several of the state’s most destructive fires were traced to electrical infrastructure interacting with vegetation, which is why California’s regulatory regime (Part IV) is the most stringent in the nation and why Meridian models a California service territory.'));
add(body([R('Notable fires with a vegetation / power-line nexus (illustrative — figures are approximate and drawn from public reporting):', { italics: true, size: 20 })]));
add(table([2050, 1000, 3300, 3010],
  ['Fire', 'Year', 'Cause (as publicly reported)', 'Scale / significance'],
  [
    ['Dixie Fire', '2021', 'Douglas fir contacting a distribution conductor near Cresta Dam.', '~963,000 acres — the canonical vegetation-contact fire; 2nd-largest in CA history.'],
    ['Zogg Fire', '2020', 'A gray pine fell into a distribution line.', '~56,000 acres; fatalities; direct tree-into-line failure.'],
    ['Camp Fire', '2018', 'Transmission line hardware failure (ignition in vegetation).', '85 deaths; destroyed Paradise; drove utility bankruptcy.'],
    ['Butte Fire', '2015', 'A tree contacting a power line.', '~70,000 acres; classic clearance-failure case.'],
    ['Northeast Blackout', '2003', 'Untrimmed trees contacting transmission lines (Ohio).', '~50M people; the event that created NERC FAC-003.'],
  ]));
add(body([R('The 2003 blackout is included deliberately: it was a reliability event, not a fire, yet it produced the federal transmission vegetation standard. Vegetation management sits at the intersection of ', {}), R('reliability', { bold: true }), R(' and ', {}), R('wildfire safety', { bold: true }), R(' regulation.', {})]));

add(new Paragraph({ children: [new PageBreak()] }));

add(H2('2.3  The living landscape — flora that drives risk'));
add(body('Risk is not uniform: it is a function of what grows where, and how fast. Meridian’s modeled territory runs west-to-east across three ecological bands, each with a characteristic species mix, growth rate, and fire behavior.'));
add(H3('Zones'));
add(
  bullet([R('Sacramento Valley (low fire / HFTD Tier 1): ', { bold: true }), R('valley oak, Fremont cottonwood, London plane. High customer density, gentle terrain. Cottonwood is the fast-growing wildcard near waterways.', {})]),
  bullet([R('Sierra foothills (elevated / Tier 2): ', { bold: true }), R('blue oak, interior live oak, gray (foothill) pine, and chaparral — manzanita and chamise. Drier, steeper, brushier.', {})]),
  bullet([R('Sierra Nevada (extreme / Tier 3): ', { bold: true }), R('ponderosa pine, Douglas fir, incense cedar, California black oak. Tall conifers, steep and hard-to-access terrain, the highest ignition consequence.', {})])
);
add(H3('Species reference'));
add(table([2350, 1500, 1500, 4010],
  ['Species', 'Zone', 'Growth (ft/yr)', 'Why it matters for line risk'],
  [
    ['Fremont cottonwood', 'Valley', '~5', 'Extremely fast riparian growth; closes clearance between cycles quickly.'],
    ['London plane', 'Valley', '~2', 'Common urban street tree planted under lines.'],
    ['Valley / blue oak', 'Valley/foothill', '~1', 'Slow but massive; large limbs, brittle in drought.'],
    ['Gray (foothill) pine', 'Foothill', '~2', 'Implicated in tree-into-line fires (e.g., Zogg); weak forks.'],
    ['Manzanita / chamise', 'Foothill', '~1', 'Chaparral — low but intensely flammable fine fuel; ladder fuel to crowns.'],
    ['Ponderosa pine', 'Sierra', '~2.5', 'Tall conifer; resinous; high crown-fire and strike potential.'],
    ['Douglas fir', 'Sierra', '~2.3', 'The Dixie Fire species; heavy, tall, can fall into lines from outside the corridor.'],
    ['Incense cedar', 'Sierra', '~1.6', 'Dense Sierra conifer; contributes ladder and crown fuel.'],
  ]));
add(callout('Fuels, not just trees', [
  'Chaparral (manzanita, chamise) and grasses are “fine fuels” — they ignite and spread fire fastest, even though they rarely touch conductors directly. A span scored low on encroachment can still sit in extreme fire fuel. This is why fire-threat tier is a separate, heavily weighted factor in the VRI rather than being folded into clearance.'
], 'FDF0DB', AMBER));

add(new Paragraph({ children: [new PageBreak()] }));

add(H2('2.4  Local wildlife — constraints on the work'));
add(body('Vegetation work does not happen in an ecological vacuum. Tree crews operate under wildlife-protection law, and the relevant species in this region directly constrain when and how trimming can occur. These constraints affect scheduling and cost — which is why access and timing matter in real programs.'));
add(table([2550, 3200, 3610],
  ['Species / group', 'Status & relevance', 'Operational implication'],
  [
    ['Nesting birds (general)', 'Protected by the federal Migratory Bird Treaty Act (MBTA).', 'Active nests cannot be disturbed; crews survey before work and buffer/defer during nesting season (~Feb–Aug).'],
    ['Swainson’s hawk', 'California-threatened; nests in valley oaks & riparian trees of the Central Valley.', 'Survey buffers around nest trees; seasonal work windows.'],
    ['California spotted owl', 'Sensitive; Sierra conifer forests.', 'Limited operating periods near known nest stands in Tier-3 terrain.'],
    ['Valley elderberry longhorn beetle', 'Federally listed; lives in elderberry shrubs along Central Valley waterways.', 'Elderberry shrubs require avoidance buffers; can constrain corridor clearing.'],
    ['Giant garter snake', 'Federally & state listed; Central Valley wetlands/canals.', 'Ground-disturbance and access constraints in valley riparian zones.'],
    ['Raptors & woodpeckers', 'MBTA-protected; acorn woodpeckers favor oak “granary” trees.', 'Cavity/nest trees flagged; removal may need permits.'],
  ]));
add(body([R('In short: the cheapest time to trim is not always a legal time to trim. A mature program threads vegetation deadlines (driven by growth) through wildlife windows (driven by breeding seasons). Meridian’s ', {}), R('time-to-violation', { bold: true }), R(' forecast is what lets a planner schedule far enough ahead to respect those windows instead of reacting at the last moment.', {})]));

add(H2('2.5  Other contributing factors'));
add(
  bullet([R('Drought & tree mortality: ', { bold: true }), R('California’s prolonged droughts and associated bark-beetle outbreaks have killed well over a hundred million trees in the Sierra, leaving standing dead “hazard trees” that can fall into lines from outside the maintained corridor. Dead/diseased trees are a distinct, severe risk class.', {})]),
  bullet([R('Climate change: ', { bold: true }), R('longer, hotter fire seasons and drier fuels widen the window in which a contact becomes an ignition.', {})]),
  bullet([R('Wind events: ', { bold: true }), R('offshore “Diablo” winds (Northern California) and downslope events drive both line-slap contacts and rapid fire spread; the worst fire days combine dry fuel with high wind.', {})]),
  bullet([R('Terrain & the wildland-urban interface (WUI): ', { bold: true }), R('steep, roadless ground raises trim cost and slows response; expanding WUI puts more people and assets next to fire-prone vegetation.', {})]),
  bullet([R('Aging infrastructure: ', { bold: true }), R('older conductors and hardware lower the threshold at which vegetation contact becomes a fault or an arc.', {})])
);
add(callout('How these map into Meridian', [
  'Drought/mortality and species → growth-rate and clearance inputs. Fire season/climate/fuels → the fire-threat factor. Wind is treated as a consequence multiplier (it is what turns a Tier-3 contact catastrophic). Terrain → the access factor and trim cost. The product makes these levers explicit and tunable rather than hiding them in a single opaque score.'
]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  PART III — METHODOLOGY
// ============================================================
add(H1('Part III — How Meridian Models the Problem'));

add(H2('3.1  The Vegetation Risk Index (VRI)'));
add(body('Each span is scored 0–100 by blending five normalized factors. Each factor is mapped to a 0–1 scale, multiplied by a weight, and the weighted average is scaled to 0–100. Weights are user-tunable in Scenario Compare; the defaults are shown below.'));
add(table([2150, 1100, 6110],
  ['Factor', 'Default wt.', 'What it captures'],
  [
    [['Encroachment', { bold: true }], '0.30', 'Current tree-to-conductor clearance vs. the required envelope. Spans already inside the required clearance score the maximum.'],
    [['Growth', { bold: true }], '0.20', 'Species growth rate × time since last trim — how fast the gap is closing.'],
    [['Fire threat', { bold: true }], '0.30', 'CPUC High Fire-Threat District tier (1 / 2 / 3). Turns an outage into a potential catastrophe.'],
    [['Criticality', { bold: true }], '0.15', 'Customers downstream + voltage class — how much a fault here hurts.'],
    [['Access', { bold: true }], '0.05', 'Terrain slope and crew reachability — affects response time and cost.'],
  ]));
add(body([R('Conceptually: ', {}), R('VRI = 100 × Σ(factorᵢ × weightᵢ) / Σ(weightᵢ)', { italics: true, bold: true }), R('. Because the weights are explicit, two utilities (or one utility in two fire seasons) can adopt different risk postures — e.g., a fire-forward posture pushes the fire-threat weight up and re-ranks the entire network accordingly.', {})]));

add(H2('3.2  Time-to-violation — turning a score into a deadline'));
add(body([
  R('A score tells you how bad a span is; it does not tell you when to act. Meridian computes ', {}),
  R('time-to-violation = (current clearance − required clearance) ÷ growth rate', { bold: true }),
  R(', expressed in months. A span with 4 ft of headroom and a 2 ft/yr conifer breaches in roughly 24 months; a span already inside its envelope reads “in violation.” Planners think in deadlines, and this is the field that lets them schedule against wildlife windows, crew capacity, and budget cycles.', {})
]));

add(H2('3.3  Consequence'));
add(body('Separate from likelihood, Meridian estimates the consequence of a vegetation-caused fault on each span as customers-downstream scaled by a fire multiplier (Tier 3 spans carry the largest multiplier). This drives the optimizer’s “customers protected” objective and keeps high-consequence spans visible even when their raw clearance looks acceptable.'));

add(H2('3.4  Required clearance — where the legal minimums enter'));
add(body('Each span’s required clearance is set from its voltage class and fire tier, mirroring the structure of California’s rules (Part IV): a base clearance by voltage, increased in High Fire-Threat Districts. Higher-voltage and higher-tier spans must be held clear by a larger margin, so they breach sooner for the same growth — exactly the behavior the regulations intend.'));

add(H2('3.5  The synthetic dataset'));
add(body([R('All figures are generated by a ', {}), R('seeded', { bold: true }), R(' procedure (deterministic, so the demo is stable across reloads) and are entirely fictional. The modeled utility:', {})]));
add(table([3400, 5960],
  ['Attribute', 'Value'],
  [
    ['Utility (fictional)', 'Sierra Crest Power & Electric'],
    ['Service territory', 'Sacramento Valley → Sierra Nevada foothills, California'],
    ['Spans modeled', '~570'],
    ['Circuits / substations', '21 circuits across 6 substations'],
    ['Fire-threat gradient', 'HFTD Tier 1 (valley) → Tier 2 (foothills) → Tier 3 (Sierra)'],
    ['Annual VM budget (modeled)', '$850,000 — deliberately set below the total identified backlog so prioritization matters'],
  ]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  PART IV — REGULATORY & LEGAL FRAMEWORK
// ============================================================
add(H1('Part IV — Regulatory & Legal Framework'));
add(callout('Read this as orientation, not legal advice', [
  'The provisions below summarize the framework that shapes utility vegetation management, with a California focus. Specific clearance distances, voltage bands, and inspection cadences are amended periodically; always verify against the current authoritative text before relying on a number operationally.'
], 'FDF0DB', AMBER));

add(H2('4.1  Federal'));
add(H3('NERC FAC-003 — Transmission Vegetation Management'));
add(body([
  R('The North American Electric Reliability Corporation (NERC) Reliability Standard ', {}),
  R('FAC-003', { bold: true }),
  R(' governs vegetation management on the bulk-power transmission system — generally lines operated at 200 kV and above, plus lower-voltage lines designated as elements of an Interconnection Reliability Operating Limit (IROL). It requires utilities to maintain minimum vegetation clearance distances (MVCD), perform vegetation inspections at least annually, and maintain a documented management plan. It was created in direct response to the 2003 Northeast Blackout, which began with untrimmed trees contacting transmission lines in Ohio. Violations are enforceable by FERC/NERC with substantial per-day penalties.', {})
]));
add(body([R('Relevance to Meridian: ', { bold: true }), R('the modeled network is sub-transmission (≤ 60 kV) and distribution, which falls primarily under state rules rather than FAC-003. FAC-003 is included because it is the reliability backbone of the field and because real utilities run both regimes side by side.', {})]));
add(H3('Wildlife statutes'));
add(
  bullet([R('Migratory Bird Treaty Act (MBTA, 1918): ', { bold: true }), R('makes it unlawful to “take” migratory birds, including disturbing active nests — a direct constraint on the timing of tree work.', {})]),
  bullet([R('Endangered Species Act (ESA): ', { bold: true }), R('protects federally listed species and their habitat (e.g., valley elderberry longhorn beetle, giant garter snake), imposing survey and avoidance requirements on corridor work.', {})])
);

add(H2('4.2  California state'));
add(H3('CPUC General Order 95 (GO 95) — Overhead line construction'));
add(body([
  R('Rule 35', { bold: true }),
  R(' of GO 95 sets vegetation-clearance requirements for overhead lines. In High Fire-Threat Districts it incorporates the Public Resources Code minimums (below) and recommends utilities maintain greater “time-of-trim” clearances so a span does not fall below the legal minimum before the next maintenance cycle. ', {}),
  R('Rule 18', { bold: true }),
  R(' establishes how nonconformances are prioritized and corrected (Priority Level 1/2/3), which maps to Meridian’s “remediate-by” dates.', {})
]));
add(H3('CPUC General Order 165 — Inspection cycles'));
add(body('GO 165 establishes minimum inspection intervals and record-keeping for distribution facilities, complementing the vegetation-specific rules of GO 95.'));
add(H3('Public Resources Code §§ 4292–4293 (enforced by CAL FIRE)'));
add(body('In State Responsibility Areas and other hazardous zones, the Public Resources Code sets hard minimums:'));
add(table([3000, 6360],
  ['Provision', 'Requirement (summary)'],
  [
    ['PRC § 4292', 'Maintain a firebreak of ~10 ft of cleared, flammable material around poles/towers carrying specified equipment (switches, transformers, fuses, arresters).'],
    ['PRC § 4293 — 2.4–72 kV', 'Minimum 4 ft radial clearance between conductors and vegetation.'],
    ['PRC § 4293 — 72–110 kV', 'Minimum 6 ft radial clearance.'],
    ['PRC § 4293 — over 110 kV', 'Minimum 10 ft radial clearance; plus removal of dead, rotten, or diseased trees that could fall into the line.'],
  ]));
add(body([R('Meridian mirrors this structure: ', { italics: true, size: 20 }), R('required clearance rises with voltage and is increased again in HFTD Tiers 2 and 3, so high-voltage Tier-3 spans carry the largest required envelope.', { italics: true, size: 20 })]));

add(H3('Post-fire wildfire statutes'));
add(
  bullet([R('SB 901 (2018): ', { bold: true }), R('required investor-owned utilities to file annual Wildfire Mitigation Plans (WMPs) and strengthened vegetation and inspection obligations.', {})]),
  bullet([R('AB 1054 (2019): ', { bold: true }), R('landmark wildfire law. Created the Office of Energy Infrastructure Safety (Energy Safety / OEIS) to review and approve WMPs, established a multi-billion-dollar Wildfire Fund, and tied liability protection to annual safety certifications.', {})]),
  bullet([R('Office of Energy Infrastructure Safety (OEIS): ', { bold: true }), R('the state body (within the Natural Resources Agency) that now reviews utility WMPs and issues safety certifications.', {})])
);

add(H3('The CPUC High Fire-Threat District (HFTD) map'));
add(body('The HFTD map, adopted through a CPUC proceeding, classifies the state into fire-threat tiers used to trigger enhanced GO 95 vegetation rules and other measures. In Meridian the tiers are modeled on an ascending-severity convention — Tier 1 (low / valley), Tier 2 (elevated / foothills), Tier 3 (extreme / Sierra). In the official map, the enhanced regulatory requirements apply chiefly to the elevated and extreme tiers; Meridian’s convention is a simplification for clarity.'));

add(H2('4.3  Authorities at a glance'));
add(table([2600, 3380, 3380],
  ['Authority', 'Scope', 'Instruments'],
  [
    ['FERC / NERC', 'Bulk transmission reliability', 'FAC-003, MVCD, penalties'],
    ['CPUC', 'Investor-owned utility safety (CA)', 'GO 95 (Rules 18, 35), GO 165, HFTD map'],
    ['CAL FIRE', 'Fire safety on state lands', 'PRC §§ 4292–4293'],
    ['Energy Safety (OEIS)', 'Wildfire mitigation oversight (CA)', 'WMP review, safety certifications'],
    ['USFWS / CDFW', 'Wildlife protection', 'MBTA, ESA, CESA survey & avoidance'],
  ]));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  PART V — MODULE REFERENCE
// ============================================================
add(H1('Part V — Module Reference'));

add(H2('5.1  Risk Dashboard'));
add(body('The home view and the analytical heart of the product. Three linked panels:'));
add(
  bullet([R('Hybrid map. ', { bold: true }), R('A schematic SVG circuit diagram (fast, dependency-free, works offline) or a real California basemap (Leaflet). Every span is colored on the green→red risk ramp; substations are diamond nodes. Filter by fire tier, substation, or free-text search.', {})]),
  bullet([R('Ranked work list. ', { bold: true }), R('Spans sorted worst-first, re-sortable by risk index, time-to-breach, customers, lowest cost, or risk-per-dollar. Each row shows the VRI badge, fire tier, species, customers, breach time, and cost.', {})]),
  bullet([R('Span detail drawer. ', { bold: true }), R('Click any span for a clearance gauge (current vs. required, with the required line marked), time-to-violation, growth rate, species, last-trim date, customers, terrain, estimated cost, fault consequence, the five-factor risk breakdown, and a recommended action. From here you create a work order.', {})])
);

add(H2('5.2  Budget Optimizer'));
add(body([R('The “spend the next dollar” engine. Given a budget, it performs a greedy ', {}), R('risk-per-dollar', { bold: true }), R(' selection across all open spans, choosing those that buy down the most value per dollar until the budget is exhausted. You choose the objective:', {})]));
add(
  bullet([R('Risk', { bold: true }), R(' — maximize total risk index reduced.', {})]),
  bullet([R('Customers', { bold: true }), R(' — maximize customer exposure protected.', {})]),
  bullet([R('Fire tier', { bold: true }), R(' — prioritize covering Tier-3 spans.', {})])
);
add(body([R('Outputs: spans funded, dollars used, ', {}), R('percent of portfolio risk bought down', { bold: true }), R(', customers protected, violations cleared, and Tier-3 coverage. The ', {}), R('spend-efficiency frontier', { bold: true }), R(' chart plots cumulative risk reduced against cumulative dollars; its steep early slope is the visual argument for condition-based trimming — the first dollars clear the worst spans. One click schedules the funded plan to crews.', {})]));

add(H2('5.3  Portfolio Analytics'));
add(body('The “why this plan” view. Charts include:'));
add(
  bullet([R('24-month projected clearance violations', { bold: true }), R(' — no-action vs. funded-plan. The plan flattens the curve; regrowth slowly bends it back up, which is the quantitative case for an annual cycle.', {})]),
  bullet([R('Risk by fire-threat tier', { bold: true }), R(' — where dangerous spans concentrate.', {})]),
  bullet([R('Highest-risk circuits', { bold: true }), R(' — total risk carried per feeder.', {})]),
  bullet([R('Risk by species', { bold: true }), R(' — average risk where each species dominates.', {})]),
  bullet([R('Clearance-margin distribution', { bold: true }), R(' — headroom histogram; bars left of zero are active violations.', {})])
);

add(H2('5.4  Crew Dispatch (lite)'));
add(body('Turns risk into tracked work. High-risk open spans become work orders, auto-assigned to a crew based on territory (in-house and contractor crews, including an aerial crew for Tier-3 terrain). A board tracks each order across Backlog → Scheduled → In-progress → Completed, with per-crew capacity meters. Completing a trim resets the span’s clearance and recomputes its risk — closing the loop.'));

add(H2('5.5  Compliance Register'));
add(body('The regulatory pain-killer. Automatically lists spans that are in active clearance violation or projected to breach within 12 months, each annotated with the relevant authority (GO 95 Rule 35, FAC-003, HFTD tier) and a remediation deadline derived from time-to-violation. Summary tiles count active violations, imminent breaches, Tier-3 exposure, and estimated remediation cost. Export to CSV or print a formatted register for audit.'));

add(H2('5.6  Scenario Compare'));
add(body('The governance layer. Retune the five risk-factor weights and the budget, save the result as a named scenario, and compare any two head-to-head — spans funded, risk bought down, customers protected, violations cleared, Tier-3 coverage. This makes the prioritization defensible: a planner can show a regulator or executive exactly how a fire-forward weighting changes the plan versus a reliability-forward one.'));

add(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
//  GLOSSARY + APPENDIX
// ============================================================
add(H1('Glossary'));
add(table([2600, 6760],
  ['Term', 'Definition'],
  [
    ['Span', 'The segment of conductor between two adjacent poles — Meridian’s atomic unit of risk and work.'],
    ['Circuit / feeder', 'A line originating at a substation that distributes power to customers; composed of many spans.'],
    ['Clearance', 'The distance between vegetation and the energized conductor.'],
    ['Encroachment', 'Vegetation intruding into the required clearance envelope.'],
    ['VRI', 'Vegetation Risk Index — Meridian’s 0–100 composite risk score per span.'],
    ['Time-to-violation', 'Estimated months until a span breaches its required clearance, given growth.'],
    ['HFTD', 'High Fire-Threat District — the CPUC fire-tier map (Tiers 1/2/3).'],
    ['MVCD', 'Minimum Vegetation Clearance Distance, used under NERC FAC-003.'],
    ['WUI', 'Wildland-Urban Interface — where development meets fire-prone vegetation.'],
    ['WMP', 'Wildfire Mitigation Plan — annual plan filed with Energy Safety (OEIS).'],
    ['SRA', 'State Responsibility Area — lands where the state has fire-protection responsibility.'],
    ['Condition-based', 'Trimming driven by measured risk/condition rather than a fixed calendar cycle.'],
  ]));

add(H1('Appendix — Data & Disclaimers'));
add(H2('A.1  Per-span data dictionary'));
add(table([2700, 6660],
  ['Field', 'Meaning'],
  [
    ['vri', '0–100 Vegetation Risk Index (recomputed when weights change).'],
    ['clearanceFt / requiredFt', 'Current and required tree-to-conductor clearance (feet).'],
    ['growthRate', 'Species growth rate (feet/year).'],
    ['ttv', 'Time-to-violation (months); 0 = already in violation.'],
    ['tier', 'HFTD fire-threat tier (1/2/3).'],
    ['kv', 'Voltage class (12 / 21 / 60 kV).'],
    ['customers', 'Customers downstream of the span.'],
    ['consequence', 'Customers × fire multiplier (relative fault consequence).'],
    ['cost', 'Estimated trim cost (USD), scaled by terrain and tree size.'],
    ['status / crew', 'Work-order state and assigned crew.'],
  ]));
add(H2('A.2  Disclaimers'));
add(
  bullet('All data is synthetic, seeded, and fictional. The utility, territory, spans, costs, and customer counts are invented for demonstration and must not be used operationally.'),
  bullet('Regulatory summaries are simplified for orientation and may not reflect the latest amendments. Verify all clearance distances, voltage bands, and cadences against current authoritative text.'),
  bullet('Wildfire causes and figures are drawn from public reporting and are approximate; they are included to illustrate the problem, not as the official record.'),
  bullet([R('The geographic basemap is © OpenStreetMap contributors © CARTO. Meridian is an exploratory prototype — an offline-capable PWA with no backend.', {})])
);

// ============================================================
//  DOCUMENT
// ============================================================
const doc = new Document({
  creator: 'Meridian',
  title: 'Meridian — Product Guide & Domain Reference',
  description: 'Quick-start and deep reference for the Meridian vegetation risk intelligence product.',
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
      { reference: 'n2', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E7DBF7', space: 4 } }, children: [R('MERIDIAN', { bold: true, size: 16, color: VIOLET }), R('  ·  Vegetation Risk Intelligence', { size: 16, color: MUTED })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [R('', { size: 16, color: MUTED }), R('Page ', { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }), R(' · Product Guide & Domain Reference · synthetic data', { size: 16, color: MUTED })] })] }) },
    children: content
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('Meridian-Product-Guide.docx', buf);
  console.log('wrote Meridian-Product-Guide.docx (' + buf.length + ' bytes)');
});
