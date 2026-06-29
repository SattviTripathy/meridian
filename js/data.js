/* Meridian — synthetic data engine
 * Builds a deterministic, realistic Utility Vegetation Management (UVM) dataset
 * for a fictional California utility spanning the Sacramento Valley up into the
 * Sierra Nevada (CPUC HFTD Tier 1 / 2 / 3 fire-threat gradient).
 *
 * Everything is seeded so the demo is stable across reloads. No backend.
 */
(function (global) {
  'use strict';

  // ---- seeded PRNG (mulberry32) ------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- domain catalogs ----------------------------------------------------
  // Species: growth ft/yr, canopy size factor (cost), and zone affinity.
  const SPECIES = {
    valley_oak:       { name: 'Valley oak',        growth: 1.0, size: 1.4, conifer: false },
    fremont_cottonwood:{ name: 'Fremont cottonwood',growth: 5.2, size: 1.6, conifer: false },
    london_plane:     { name: 'London plane',      growth: 2.2, size: 1.1, conifer: false },
    blue_oak:         { name: 'Blue oak',          growth: 0.9, size: 1.0, conifer: false },
    interior_live_oak:{ name: 'Interior live oak', growth: 1.3, size: 1.1, conifer: false },
    gray_pine:        { name: 'Gray pine',         growth: 2.1, size: 1.3, conifer: true  },
    manzanita:        { name: 'Manzanita / chamise',growth: 1.1, size: 0.6, conifer: false },
    ponderosa_pine:   { name: 'Ponderosa pine',    growth: 2.6, size: 1.7, conifer: true  },
    douglas_fir:      { name: 'Douglas fir',       growth: 2.3, size: 1.8, conifer: true  },
    incense_cedar:    { name: 'Incense cedar',     growth: 1.6, size: 1.4, conifer: true  },
    black_oak:        { name: 'California black oak',growth: 1.5, size: 1.3, conifer: false }
  };

  // Substations define the west→east fire/terrain gradient.
  // tier = baseline CPUC HFTD fire-threat tier for that area.
  const SUBSTATIONS = [
    { id: 'RVB', name: 'Riverbend',       zone: 'valley',   tier: 1, lat: 38.503, lng: -121.452,
      species: ['fremont_cottonwood','valley_oak','london_plane'], slope: 3,  custBase: 2600 },
    { id: 'OKH', name: 'Oakhaven',        zone: 'valley',   tier: 1, lat: 38.611, lng: -121.262,
      species: ['valley_oak','london_plane','interior_live_oak'],  slope: 5,  custBase: 2100 },
    { id: 'FHJ', name: 'Foothill Junction',zone: 'foothill', tier: 2, lat: 38.776, lng: -121.041,
      species: ['blue_oak','interior_live_oak','gray_pine','manzanita'], slope: 14, custBase: 720 },
    { id: 'GLD', name: 'Goldcrest',       zone: 'foothill', tier: 2, lat: 38.902, lng: -120.921,
      species: ['blue_oak','gray_pine','black_oak','manzanita'],   slope: 18, custBase: 540 },
    { id: 'CDR', name: 'Cedar Ridge',     zone: 'sierra',   tier: 3, lat: 38.842, lng: -120.623,
      species: ['ponderosa_pine','incense_cedar','black_oak','manzanita'], slope: 26, custBase: 230 },
    { id: 'SMT', name: 'Summit Pass',     zone: 'sierra',   tier: 3, lat: 38.801, lng: -120.451,
      species: ['ponderosa_pine','douglas_fir','incense_cedar','manzanita'], slope: 31, custBase: 150 }
  ];

  const CREWS = [
    { id: 'CRW-1', name: 'Crew Alpha',   org: 'In-house',          base: 'RVB', capacity: 9 },
    { id: 'CRW-2', name: 'Crew Bravo',   org: 'In-house',          base: 'OKH', capacity: 8 },
    { id: 'CRW-3', name: 'Sierra Arbor', org: 'Contractor',        base: 'GLD', capacity: 7 },
    { id: 'CRW-4', name: 'Summit Line',  org: 'Contractor',        base: 'CDR', capacity: 6 },
    { id: 'CRW-5', name: 'Air Strike T&T',org: 'Contractor (aerial)',base: 'SMT', capacity: 4 }
  ];

  // Voltage classes drive base clearance + customer load + cost.
  const VOLTAGES = [
    { kv: 12,  label: '12 kV distribution',     reqBase: 4,  weight: 1.0,  freq: 0.62 },
    { kv: 21,  label: '21 kV distribution',     reqBase: 6,  weight: 1.3,  freq: 0.24 },
    { kv: 60,  label: '60 kV sub-transmission', reqBase: 10, weight: 2.2,  freq: 0.14 }
  ];

  // ---- scoring ------------------------------------------------------------
  const DEFAULT_WEIGHTS = {
    encroachment: 0.30,
    growth:       0.20,
    fire:         0.30,
    criticality:  0.15,
    access:       0.05
  };

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // Per-span normalized factor values (0..1). Independent of weights.
  function factorsFor(span) {
    const margin = span.clearanceFt - span.requiredFt;           // ft of headroom
    const enc = margin <= 0 ? 1 : clamp01(1 - margin / 20);       // 20ft headroom => 0
    const growth = clamp01(span.growthRate / 5.0);               // 5 ft/yr => 1
    const fire = span.tier === 3 ? 1.0 : span.tier === 2 ? 0.58 : 0.18;
    const crit = clamp01(Math.log10(span.customers + 1) / Math.log10(3500) * 0.7
                         + (span.kv / 60) * 0.3);
    const access = clamp01(span.slope / 35 * 0.7 + (span.accessHard ? 0.3 : 0));
    return { enc, growth, fire, crit, access };
  }

  function computeVRI(span, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    const f = span._f || factorsFor(span);
    const sum = w.encroachment + w.growth + w.fire + w.criticality + w.access || 1;
    const raw = (f.enc * w.encroachment + f.growth * w.growth + f.fire * w.fire +
                 f.crit * w.criticality + f.access * w.access) / sum;
    return Math.round(clamp01(raw) * 100);
  }

  // Months until the span breaches its required clearance, given growth.
  function timeToViolation(span) {
    const margin = span.clearanceFt - span.requiredFt;
    if (margin <= 0) return 0;
    if (span.growthRate <= 0.01) return 999;
    return Math.round((margin / span.growthRate) * 12);
  }

  // Consequence of a vegetation-caused fault on this span (relative units).
  function consequence(span) {
    const fireMult = span.tier === 3 ? 3.2 : span.tier === 2 ? 1.8 : 1.0;
    return Math.round(span.customers * fireMult);
  }

  // ---- generation ---------------------------------------------------------
  function generate() {
    const rng = mulberry32(20260629);
    const rand = (a, b) => a + (b - a) * rng();
    const randint = (a, b) => Math.floor(rand(a, b + 1));
    const chance = p => rng() < p;
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    const pickVoltage = () => {
      const r = rng();
      let acc = 0;
      for (const v of VOLTAGES) { acc += v.freq; if (r <= acc) return v; }
      return VOLTAGES[0];
    };

    const spans = [];
    const circuits = [];
    let spanSeq = 1000;
    let circuitSeq = 1;

    SUBSTATIONS.forEach(sub => {
      const nCircuits = sub.zone === 'valley' ? randint(3, 4)
                       : sub.zone === 'foothill' ? randint(3, 4) : randint(2, 3);
      for (let c = 0; c < nCircuits; c++) {
        const circuitId = sub.id + '-' + String(circuitSeq++).padStart(2, '0');
        const baseHeading = rand(0, Math.PI * 2);
        const circuitName = circuitId;
        const circuit = {
          id: circuitId, sub: sub.id, name: circuitName, zone: sub.zone,
          tier: sub.tier, spanIds: []
        };
        circuits.push(circuit);

        // Build a radial feeder: a trunk of poles stepping outward, with branches.
        const trunkLen = sub.zone === 'valley' ? randint(14, 26)
                        : sub.zone === 'foothill' ? randint(12, 22) : randint(10, 18);
        let lat = sub.lat, lng = sub.lng;
        let heading = baseHeading;
        const stepBase = sub.zone === 'valley' ? 0.0055 : sub.zone === 'foothill' ? 0.0065 : 0.0072;

        const makeSpan = (lat1, lng1, lat2, lng2, idx, branch) => {
          const v = pickVoltage();
          // customers decline outward along the feeder
          const decay = Math.pow(0.96, idx);
          const customers = Math.max(8, Math.round(sub.custBase * decay * v.weight * rand(0.5, 1.25)));
          const speciesKey = pick(sub.species);
          const sp = SPECIES[speciesKey];
          // local tier can step up one near ridgelines in higher zones
          let tier = sub.tier;
          if (sub.tier === 2 && chance(0.18)) tier = 3;
          if (sub.tier === 1 && chance(0.10)) tier = 2;

          const reqExtra = tier === 3 ? 8 : tier === 2 ? 4 : 0;
          const requiredFt = v.reqBase + reqExtra;

          const growthRate = +(sp.growth * rand(0.8, 1.2)).toFixed(2);
          // Clearance modelled from last trim: cleared high, then closes via growth.
          const yearsSinceTrim = +rand(0.4, 6.0).toFixed(2);
          const clearedTo = requiredFt + rand(7, 17);
          let clearanceFt = +(clearedTo - growthRate * yearsSinceTrim + rand(-2.2, 2.2)).toFixed(1);
          if (clearanceFt < 0) clearanceFt = +(rand(-3, 0)).toFixed(1); // some active violations

          const slope = Math.max(1, Math.round(sub.slope * rand(0.6, 1.45)));
          const accessHard = sub.zone === 'sierra' ? chance(0.5) : sub.zone === 'foothill' ? chance(0.25) : chance(0.06);

          // Cost: access + tree size + voltage handling
          const accessMult = sub.zone === 'valley' ? 1.0 : sub.zone === 'foothill' ? 1.8 : 3.0;
          const cost = Math.round((350 + sp.size * 520 + v.weight * 240) * accessMult
                       * (accessHard ? 1.45 : 1.0) * rand(0.85, 1.2) / 10) * 10;

          const lastTrim = new Date(2026, 5, 29);
          lastTrim.setDate(lastTrim.getDate() - Math.round(yearsSinceTrim * 365));

          const span = {
            id: 'SPN-' + (spanSeq++),
            circuit: circuitId, sub: sub.id, zone: sub.zone,
            name: circuitName + ' / span ' + (idx + 1) + (branch ? 'b' : ''),
            kv: v.kv, voltageLabel: v.label,
            customers,
            species: sp.name, speciesKey, conifer: sp.conifer,
            growthRate, requiredFt, clearanceFt,
            tier, slope, accessHard,
            cost,
            lastTrim: lastTrim.toISOString().slice(0, 10),
            yearsSinceTrim,
            a: [lat1, lng1], b: [lat2, lng2],
            status: 'open', crew: null
          };
          span._f = factorsFor(span);
          span.vri = computeVRI(span, DEFAULT_WEIGHTS);
          span.ttv = timeToViolation(span);
          span.consequence = consequence(span);
          spans.push(span);
          circuit.spanIds.push(span.id);
        };

        for (let i = 0; i < trunkLen; i++) {
          heading += rand(-0.35, 0.35);
          const step = stepBase * rand(0.7, 1.3);
          const lat2 = lat + Math.sin(heading) * step;
          const lng2 = lng + Math.cos(heading) * step * 1.25; // lng compress
          makeSpan(lat, lng, lat2, lng2, i, false);
          // occasional lateral branch (a tap line)
          if (i > 3 && chance(0.22)) {
            let blat = lat2, blng = lng2, bh = heading + (chance(0.5) ? 1 : -1) * rand(0.6, 1.2);
            const blen = randint(2, 6);
            for (let j = 0; j < blen; j++) {
              bh += rand(-0.3, 0.3);
              const bstep = stepBase * rand(0.6, 1.0);
              const blat2 = blat + Math.sin(bh) * bstep;
              const blng2 = blng + Math.cos(bh) * bstep * 1.25;
              makeSpan(blat, blng, blat2, blng2, i + j, true);
              blat = blat2; blng = blng2;
            }
          }
          lat = lat2; lng = lng2;
        }
      }
    });

    // geographic bounds for projection
    let minLat = 999, maxLat = -999, minLng = 999, maxLng = -999;
    spans.forEach(s => {
      [s.a, s.b].forEach(p => {
        minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
        minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]);
      });
    });
    SUBSTATIONS.forEach(s => {
      minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat);
      minLng = Math.min(minLng, s.lng); maxLng = Math.max(maxLng, s.lng);
    });

    return {
      utility: {
        name: 'Sierra Crest Power & Electric',
        short: 'SCP&E',
        territory: 'Sacramento Valley → Sierra Nevada foothills, California',
        miles: 4180,
        annualBudget: 850000
      },
      substations: SUBSTATIONS,
      crews: CREWS,
      circuits,
      spans,
      bounds: { minLat, maxLat, minLng, maxLng },
      defaultWeights: Object.assign({}, DEFAULT_WEIGHTS)
    };
  }

  // ---- public API ---------------------------------------------------------
  const Meridian = {
    generate,
    factorsFor,
    computeVRI,
    timeToViolation,
    consequence,
    DEFAULT_WEIGHTS,
    SPECIES
  };

  global.MeridianData = Meridian;
})(typeof window !== 'undefined' ? window : this);
