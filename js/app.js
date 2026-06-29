/* Meridian — application logic (vanilla JS, no build step). */
(function () {
  'use strict';
  const M = window.MeridianData;
  const DATA = M.generate();

  // ---------- persistence ----------
  const LS = {
    work: 'meridian:work',        // { spanId: {status, crew} }
    weights: 'meridian:weights',
    scenarios: 'meridian:scenarios'
  };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ---------- state ----------
  let weights = Object.assign({}, M.DEFAULT_WEIGHTS, load(LS.weights, {}));
  let workState = load(LS.work, {});
  let scenarios = load(LS.scenarios, []);
  let view = 'dashboard';
  let mapMode = 'schematic';
  let leafletMap = null, leafletLayer = null, leafletSubs = null;
  let selectedId = null;
  let sortKey = 'vri';
  const filters = { tier: 'all', sub: 'all', status: 'all', q: '', minVri: 0 };
  let optimizer = { budget: 500000, objective: 'risk', result: null };

  // apply persisted work statuses
  DATA.spans.forEach(s => {
    const w = workState[s.id];
    if (w) { s.status = w.status; s.crew = w.crew; }
  });

  // ---------- helpers ----------
  const $ = sel => document.querySelector(sel);
  const view$ = () => document.getElementById('view');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function money(n) {
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/\.00$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function num(n) { return n.toLocaleString('en-US'); }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // risk ramp
  const RAMP = [[0,52,211,153],[20,163,217,119],[40,245,196,81],[60,240,138,60],[80,226,84,59],[100,192,38,74]];
  function vriColor(v) {
    v = Math.max(0, Math.min(100, v));
    for (let i = 1; i < RAMP.length; i++) {
      if (v <= RAMP[i][0]) {
        const a = RAMP[i - 1], b = RAMP[i], t = (v - a[0]) / (b[0] - a[0]);
        const c = j => Math.round(a[j] + (b[j] - a[j]) * t);
        return `rgb(${c(1)},${c(2)},${c(3)})`;
      }
    }
    return 'rgb(192,38,74)';
  }
  function ttvClass(m) { return m <= 6 ? 'ttv-urgent' : m <= 18 ? 'ttv-soon' : 'ttv-ok'; }
  function ttvText(m) { return m >= 999 ? 'stable' : m <= 0 ? 'in violation' : m < 24 ? m + ' mo' : (m / 12).toFixed(1) + ' yr'; }
  function tierChip(t) { return `<span class="chip t${t}">Tier ${t}${t === 3 ? ' \u{1F525}' : ''}</span>`; }

  // ---------- scoring helpers ----------
  function recomputeAll() {
    DATA.spans.forEach(s => { s.vri = M.computeVRI(s, weights); });
  }
  // VRI of a span at a hypothetical clearance (for forecasting)
  function vriAtClearance(s, clearanceFt) {
    const clone = Object.assign({}, s, { clearanceFt });
    clone._f = M.factorsFor(clone);
    return M.computeVRI(clone, weights);
  }

  function persistWork(s) {
    workState[s.id] = { status: s.status, crew: s.crew };
    save(LS.work, workState);
  }

  // ---------- filtering / sorting ----------
  function filteredSpans() {
    const q = filters.q.trim().toLowerCase();
    return DATA.spans.filter(s => {
      if (filters.tier !== 'all' && s.tier !== +filters.tier) return false;
      if (filters.sub !== 'all' && s.sub !== filters.sub) return false;
      if (filters.status !== 'all' && s.status !== filters.status) return false;
      if (s.vri < filters.minVri) return false;
      if (q && !(s.id.toLowerCase().includes(q) || s.circuit.toLowerCase().includes(q) || s.species.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const SORTS = {
    vri: (a, b) => b.vri - a.vri,
    ttv: (a, b) => a.ttv - b.ttv,
    customers: (a, b) => b.customers - a.customers,
    cost: (a, b) => a.cost - b.cost,
    roi: (a, b) => (b.vri / b.cost) - (a.vri / a.cost)
  };
  function rankedSpans() { return filteredSpans().sort(SORTS[sortKey]); }

  // ---------- portfolio metrics ----------
  function portfolio() {
    const sp = DATA.spans;
    const totalVri = sp.reduce((a, s) => a + s.vri, 0);
    const violations = sp.filter(s => s.clearanceFt - s.requiredFt <= 0).length;
    const imminent = sp.filter(s => s.ttv > 0 && s.ttv <= 6).length;
    const high = sp.filter(s => s.vri >= 70).length;
    const open = sp.filter(s => s.status === 'open').length;
    const tier3 = sp.filter(s => s.tier === 3).length;
    return { count: sp.length, avgVri: Math.round(totalVri / sp.length), totalVri, violations, imminent, high, open, tier3 };
  }

  // ========================================================================
  //  KPI strip (header)
  // ========================================================================
  function renderKpis() {
    const p = portfolio();
    const committed = DATA.spans.filter(s => s.status !== 'open' && s.status !== 'completed')
      .reduce((a, s) => a + s.cost, 0);
    const pct = Math.min(100, Math.round(committed / DATA.utility.annualBudget * 100));
    $('#kpiStrip').innerHTML = `
      <div class="kpi"><b>${p.avgVri}</b><span>avg risk index</span></div>
      <div class="kpi"><b style="color:${p.violations?'var(--rose)':'inherit'}">${p.violations}</b><span>in violation</span></div>
      <div class="kpi"><b style="color:var(--amber)">${p.imminent}</b><span>breach &lt; 6 mo</span></div>
      <div class="kpi">
        <b>${money(committed)} <span style="font-size:11px;color:var(--muted)">/ ${money(DATA.utility.annualBudget)}</span></b>
        <span>budget committed</span>
        <div class="budget-meter"><i style="width:${pct}%"></i></div>
      </div>`;
  }

  // ========================================================================
  //  Projection (schematic SVG)
  // ========================================================================
  const B = DATA.bounds;
  const meanLat = (B.minLat + B.maxLat) / 2;
  const lngSpan = (B.maxLng - B.minLng) * Math.cos(meanLat * Math.PI / 180);
  const latSpan = (B.maxLat - B.minLat);
  const VW = 1000, PAD = 40;
  const VH = Math.round((VW - 2 * PAD) * (latSpan / lngSpan)) + 2 * PAD;
  function projX(lng) { return PAD + (lng - B.minLng) / (B.maxLng - B.minLng) * (VW - 2 * PAD); }
  function projY(lat) { return PAD + (B.maxLat - lat) / (B.maxLat - B.minLat) * (VH - 2 * PAD); }

  // ========================================================================
  //  VIEW: Dashboard
  // ========================================================================
  function renderDashboard() {
    const v = view$();
    v.className = 'view dash';
    v.innerHTML = `
      <div class="mapwrap">
        <div class="maptools">
          <div class="seg">
            <button id="mSchem" class="${mapMode === 'schematic' ? 'on' : ''}">Schematic</button>
            <button id="mGeo" class="${mapMode === 'geo' ? 'on' : ''}">Map</button>
          </div>
          <div class="filterbar">
            <select id="fTier">
              <option value="all">All fire tiers</option><option value="3">Tier 3</option>
              <option value="2">Tier 2</option><option value="1">Tier 1</option>
            </select>
            <span class="div"></span>
            <select id="fSub"><option value="all">All substations</option>
              ${DATA.substations.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
            </select>
            <span class="div"></span>
            <input id="fq" placeholder="search span / circuit / species" style="width:170px">
          </div>
        </div>
        <svg id="schematic" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet"></svg>
        <div id="leaflet"></div>
        <div class="legend">
          <div>Vegetation Risk Index</div>
          <div class="ramp"><i style="background:var(--r0)"></i><i style="background:var(--r1)"></i><i style="background:var(--r2)"></i><i style="background:var(--r3)"></i><i style="background:var(--r4)"></i><i style="background:var(--r5)"></i></div>
          <div class="lr"><span>0 low</span><span>high 100</span></div>
        </div>
        <div class="spancount" id="spanCount"></div>
      </div>
      <aside class="side">
        <div class="side-head">
          <h3>Work priority</h3>
          <div class="sortsel">
            <select id="sortKey">
              <option value="vri">Sort: risk index</option>
              <option value="ttv">Sort: time to breach</option>
              <option value="customers">Sort: customers</option>
              <option value="roi">Sort: risk / $</option>
              <option value="cost">Sort: lowest cost</option>
            </select>
          </div>
        </div>
        <div class="worklist" id="worklist"></div>
        <div class="detail" id="detail"></div>
      </aside>`;

    $('#fTier').value = filters.tier;
    $('#fSub').value = filters.sub;
    $('#fq').value = filters.q;
    $('#sortKey').value = sortKey;

    $('#mSchem').onclick = () => { mapMode = 'schematic'; renderDashboard(); };
    $('#mGeo').onclick = () => { mapMode = 'geo'; renderDashboard(); };
    $('#fTier').onchange = e => { filters.tier = e.target.value; refreshDash(); };
    $('#fSub').onchange = e => { filters.sub = e.target.value; refreshDash(); };
    $('#fq').oninput = e => { filters.q = e.target.value; refreshDash(); };
    $('#sortKey').onchange = e => { sortKey = e.target.value; renderWorklist(); };

    if (mapMode === 'schematic') { $('#schematic').style.display = 'block'; $('#leaflet').style.display = 'none'; drawSchematic(); }
    else { $('#schematic').style.display = 'none'; $('#leaflet').style.display = 'block'; drawLeaflet(); }
    renderWorklist();
    if (selectedId) openDetail(selectedId, false);
  }

  function refreshDash() {
    if (mapMode === 'schematic') drawSchematic(); else drawLeaflet();
    renderWorklist();
  }

  function inFilter(s) {
    if (filters.tier !== 'all' && s.tier !== +filters.tier) return false;
    if (filters.sub !== 'all' && s.sub !== filters.sub) return false;
    if (s.vri < filters.minVri) return false;
    const q = filters.q.trim().toLowerCase();
    if (q && !(s.id.toLowerCase().includes(q) || s.circuit.toLowerCase().includes(q) || s.species.toLowerCase().includes(q))) return false;
    return true;
  }

  function drawSchematic() {
    const svg = $('#schematic');
    if (!svg) return;
    const shown = DATA.spans.filter(inFilter);
    const dim = shown.length !== DATA.spans.length;
    let s = '';
    // faint context lines for filtered-out spans
    if (dim) {
      DATA.spans.forEach(sp => {
        if (inFilter(sp)) return;
        s += `<line class="ctx" x1="${projX(sp.a[1]).toFixed(1)}" y1="${projY(sp.a[0]).toFixed(1)}" x2="${projX(sp.b[1]).toFixed(1)}" y2="${projY(sp.b[0]).toFixed(1)}" stroke="#e9e1f6" stroke-width="1.5"/>`;
      });
    }
    shown.forEach(sp => {
      const sel = sp.id === selectedId;
      s += `<line class="svg-span${sel ? ' sel' : ''}" data-span="${sp.id}" x1="${projX(sp.a[1]).toFixed(1)}" y1="${projY(sp.a[0]).toFixed(1)}" x2="${projX(sp.b[1]).toFixed(1)}" y2="${projY(sp.b[0]).toFixed(1)}" stroke="${sel ? '#2e2342' : vriColor(sp.vri)}" stroke-width="${sel ? 5 : 3}"/>`;
    });
    // substations
    DATA.substations.forEach(sub => {
      const x = projX(sub.lng), y = projY(sub.lat);
      s += `<g class="sub-node" data-sub="${sub.id}">
        <rect x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" rx="2.5" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})" fill="#6d28d9" stroke="#fff" stroke-width="2"/>
        <text x="${(x + 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="13" font-weight="700" fill="#4c3d66">${esc(sub.name)}</text>
      </g>`;
    });
    svg.innerHTML = s;
    svg.onclick = e => {
      const line = e.target.closest('[data-span]');
      if (line) openDetail(line.getAttribute('data-span'), true);
    };
    $('#spanCount').textContent = `${num(shown.length)} of ${num(DATA.spans.length)} spans`;
  }

  function drawLeaflet() {
    const host = $('#leaflet');
    if (!host) return;
    if (typeof L === 'undefined') {
      host.innerHTML = '<div class="empty" style="height:100%"><div>Map tiles unavailable offline.<br>Switch to the Schematic view.</div></div>';
      $('#spanCount').textContent = '';
      return;
    }
    if (!leafletMap) {
      leafletMap = L.map(host, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO'
      }).addTo(leafletMap);
      leafletMap.fitBounds([[B.minLat, B.minLng], [B.maxLat, B.maxLng]], { padding: [20, 20] });
    }
    if (leafletLayer) leafletLayer.remove();
    if (leafletSubs) leafletSubs.remove();
    const shown = DATA.spans.filter(inFilter);
    leafletLayer = L.layerGroup();
    shown.forEach(sp => {
      const pl = L.polyline([sp.a, sp.b], {
        color: sp.id === selectedId ? '#2e2342' : vriColor(sp.vri),
        weight: sp.id === selectedId ? 6 : 3, opacity: 0.9
      });
      pl.on('click', () => openDetail(sp.id, true));
      pl.bindTooltip(`${sp.id} · VRI ${sp.vri} · Tier ${sp.tier}`, { sticky: true });
      leafletLayer.addLayer(pl);
    });
    leafletLayer.addTo(leafletMap);
    leafletSubs = L.layerGroup();
    DATA.substations.forEach(sub => {
      L.marker([sub.lat, sub.lng], {
        icon: L.divIcon({ className: '', html: `<div style="background:#6d28d9;width:13px;height:13px;border:2px solid #fff;border-radius:3px;transform:rotate(45deg);box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`, iconSize: [13, 13] })
      }).bindTooltip(sub.name, { permanent: false }).addTo(leafletSubs);
    });
    leafletSubs.addTo(leafletMap);
    setTimeout(() => leafletMap.invalidateSize(), 60);
    $('#spanCount').textContent = `${num(shown.length)} of ${num(DATA.spans.length)} spans`;
  }

  function renderWorklist() {
    const host = $('#worklist');
    if (!host) return;
    const list = rankedSpans();
    if (!list.length) { host.innerHTML = '<div class="empty" style="height:160px">No spans match the filters.</div>'; return; }
    const cap = 300;
    host.innerHTML = list.slice(0, cap).map((s, i) => `
      <div class="wl-row${s.id === selectedId ? ' sel' : ''}" data-span="${s.id}">
        <div class="wl-rank">${i + 1}</div>
        <div class="vri" style="background:${vriColor(s.vri)}">${s.vri}</div>
        <div>
          <div class="wl-id">${s.id} <span class="muted" style="font-weight:500">· ${esc(s.circuit)}</span></div>
          <div class="wl-meta">${tierChip(s.tier)} <span>${esc(s.species)}</span> <span>${num(s.customers)} cust</span></div>
        </div>
        <div class="wl-right">
          <div class="wl-ttv ${ttvClass(s.ttv)}">${ttvText(s.ttv)}</div>
          <div>${money(s.cost)}</div>
        </div>
      </div>`).join('') + (list.length > cap ? `<div class="muted" style="padding:12px 16px">+ ${num(list.length - cap)} more — narrow the filters to see them.</div>` : '');
    host.onclick = e => {
      const r = e.target.closest('[data-span]');
      if (r) openDetail(r.getAttribute('data-span'), true);
    };
  }

  // ---------- span detail drawer ----------
  function statusBadge(st) {
    const map = { open: ['Open', 'var(--muted)'], scheduled: ['Scheduled', 'var(--sky)'], 'in-progress': ['In progress', 'var(--amber)'], completed: ['Completed', 'var(--green)'] };
    const [t, c] = map[st] || map.open;
    return `<span class="tag" style="color:${c}">${t}</span>`;
  }
  function openDetail(id, focus) {
    selectedId = id;
    const s = DATA.spans.find(x => x.id === id);
    const d = $('#detail');
    if (!s || !d) return;
    const f = M.factorsFor(s);
    const margin = +(s.clearanceFt - s.requiredFt).toFixed(1);
    const maxClear = s.requiredFt + 22;
    const fillPct = Math.max(2, Math.min(100, s.clearanceFt / maxClear * 100));
    const reqPct = Math.min(100, s.requiredFt / maxClear * 100);
    const fbar = (label, val) => `<div class="fbar"><span>${label}</span><div class="track"><i style="width:${Math.round(val * 100)}%"></i></div><span class="r mono">${Math.round(val * 100)}</span></div>`;
    const action = margin <= 0 ? 'Immediate trim — clearance violation'
      : s.ttv <= 6 ? 'Schedule now — breach within 6 months'
      : s.ttv <= 18 ? 'Plan for this cycle' : 'Monitor — within tolerance';
    d.innerHTML = `
      <div class="detail-head">
        <div class="vri" style="background:${vriColor(s.vri)};width:46px;height:38px;font-size:16px">${s.vri}</div>
        <div>
          <h3>${s.id}</h3>
          <div class="muted" style="font-size:12px">${esc(s.circuit)} · ${esc(DATA.substations.find(x=>x.id===s.sub).name)}</div>
        </div>
        <button class="close" id="dClose">&times;</button>
      </div>
      <div class="detail-body">
        <div class="row wrap" style="gap:6px">${tierChip(s.tier)} ${statusBadge(s.status)} <span class="tag">${s.voltageLabel}</span>${s.crew ? `<span class="crewpill">${esc(DATA.crews.find(c=>c.id===s.crew)?.name||s.crew)}</span>` : ''}</div>

        <div style="margin-top:14px"><div class="sec-title" style="margin-bottom:4px">Clearance to conductor</div>
          <div class="row" style="justify-content:space-between"><b style="font-size:18px;color:${margin<=0?'var(--rose)':'inherit'}">${s.clearanceFt} ft</b><span class="muted">requires ${s.requiredFt} ft</span></div>
          <div class="gauge"><i style="width:${fillPct}%;background:${margin<=0?'var(--rose)':'linear-gradient(90deg,var(--violet),var(--violet-deep))'}"></i><span class="req" style="left:${reqPct}%"></span></div>
          <div class="legend-note">${margin > 0 ? margin + ' ft of headroom' : Math.abs(margin) + ' ft inside the required envelope'} · red line = required clearance</div>
        </div>

        <div class="kv">
          <div><div class="k">Time to violation</div><div class="v ${ttvClass(s.ttv)}">${ttvText(s.ttv)}</div></div>
          <div><div class="k">Growth rate</div><div class="v">${s.growthRate} ft/yr</div></div>
          <div><div class="k">Species</div><div class="v">${esc(s.species)}</div></div>
          <div><div class="k">Last trimmed</div><div class="v">${s.lastTrim}</div></div>
          <div><div class="k">Customers downstream</div><div class="v">${num(s.customers)}</div></div>
          <div><div class="k">Terrain slope</div><div class="v">${s.slope}° ${s.accessHard ? '· hard access' : ''}</div></div>
          <div><div class="k">Est. trim cost</div><div class="v">${money(s.cost)}</div></div>
          <div><div class="k">Fault consequence</div><div class="v">${num(s.consequence)} <span class="muted" style="font-weight:500">cust-eq</span></div></div>
        </div>

        <div class="sec-title">Risk factor breakdown</div>
        ${fbar('Encroachment', f.enc)}
        ${fbar('Growth', f.growth)}
        ${fbar('Fire threat', f.fire)}
        ${fbar('Criticality', f.crit)}
        ${fbar('Access', f.access)}

        <div class="hr"></div>
        <div class="row" style="gap:8px;align-items:flex-start"><div style="font-size:13px"><b>Recommended action</b><br><span class="muted">${action}</span></div></div>
        <div class="row" style="margin-top:14px;gap:8px">
          ${s.status === 'open'
            ? `<button class="btn pri" id="dWO">Create work order</button>`
            : `<button class="btn" id="dAdvance">${s.status === 'completed' ? 'Reopen' : 'Advance status'}</button>`}
          <button class="btn" id="dDeselect">Close</button>
        </div>
      </div>`;
    d.classList.add('show');
    $('#dClose').onclick = closeDetail;
    $('#dDeselect').onclick = closeDetail;
    const wo = $('#dWO'); if (wo) wo.onclick = () => createWorkOrder(s);
    const adv = $('#dAdvance'); if (adv) adv.onclick = () => advanceStatus(s);
    // reflect selection on maps/list
    if (mapMode === 'schematic') drawSchematic(); else drawLeaflet();
    document.querySelectorAll('.wl-row').forEach(r => r.classList.toggle('sel', r.getAttribute('data-span') === id));
  }
  function closeDetail() {
    const d = $('#detail'); if (d) d.classList.remove('show');
    selectedId = null;
    if (view === 'dashboard') { if (mapMode === 'schematic') drawSchematic(); else drawLeaflet(); renderWorklist(); }
  }

  // ---------- work orders / crews ----------
  function autoCrew(s) {
    // prefer a crew based at the span's substation, else any crew in same zone tier band
    let c = DATA.crews.find(c => c.base === s.sub);
    if (!c) c = DATA.crews.find(c => DATA.substations.find(x => x.id === c.base)?.zone ===
      DATA.substations.find(x => x.id === s.sub)?.zone);
    return (c || DATA.crews[0]).id;
  }
  function createWorkOrder(s) {
    s.status = 'scheduled'; s.crew = autoCrew(s); persistWork(s);
    toast(`Work order created · ${s.id} → ${DATA.crews.find(c => c.id === s.crew).name}`);
    openDetail(s.id, false); renderKpis();
  }
  function advanceStatus(s) {
    const order = ['scheduled', 'in-progress', 'completed', 'open'];
    const i = order.indexOf(s.status);
    s.status = order[(i + 1) % order.length];
    if (s.status === 'completed') {
      // trimming resets clearance well clear of requirement
      s.clearanceFt = +(s.requiredFt + 14).toFixed(1);
      s._f = M.factorsFor(s); s.vri = M.computeVRI(s, weights); s.ttv = M.timeToViolation(s);
      s.lastTrim = new Date().toISOString().slice(0, 10);
    }
    if (s.status === 'open') s.crew = null;
    persistWork(s);
    openDetail(s.id, false); renderKpis();
    if (view === 'crews') renderCrews();
  }

  // ========================================================================
  //  VIEW: Budget optimizer
  // ========================================================================
  function runOptimizer() {
    const cands = DATA.spans.filter(s => s.status === 'open' || s.status === 'scheduled');
    const valueOf = s =>
      optimizer.objective === 'risk' ? s.vri
      : optimizer.objective === 'customers' ? s.consequence
      : /* fire */ (s.tier === 3 ? 600 : s.tier === 2 ? 120 : 8) + s.vri;
    const sorted = cands.map(s => ({ s, v: valueOf(s), d: valueOf(s) / s.cost })).sort((a, b) => b.d - a.d);
    let spent = 0; const chosen = [];
    const frontier = [{ cost: 0, risk: 0 }];
    let cumRisk = 0;
    for (const it of sorted) {
      if (spent + it.s.cost > optimizer.budget) continue;
      spent += it.s.cost; cumRisk += it.s.vri; chosen.push(it.s);
      frontier.push({ cost: spent, risk: cumRisk });
      if (spent > optimizer.budget * 0.999) break;
    }
    // full frontier (ignore budget) for the efficiency curve
    const fullFrontier = [{ cost: 0, risk: 0 }]; let fc = 0, fr = 0;
    for (const it of sorted) { fc += it.s.cost; fr += it.s.vri; fullFrontier.push({ cost: fc, risk: fr }); }
    const totalVri = DATA.spans.reduce((a, s) => a + s.vri, 0);
    optimizer.result = {
      chosen, spent,
      riskReduced: cumRisk, riskPct: Math.round(cumRisk / totalVri * 100),
      customers: chosen.reduce((a, s) => a + s.customers, 0),
      tier3: chosen.filter(s => s.tier === 3).length,
      violations: chosen.filter(s => s.clearanceFt - s.requiredFt <= 0).length,
      frontier: fullFrontier, budgetPoint: { cost: spent, risk: cumRisk }
    };
  }
  function renderOptimizer() {
    runOptimizer();
    const r = optimizer.result;
    const v = view$(); v.className = 'view';
    const tier3total = DATA.spans.filter(s => s.tier === 3).length;
    v.innerHTML = `
      <div class="grid" style="grid-template-columns:340px 1fr;align-items:start">
        <div class="card pad panel">
          <div class="sec-title">Spend plan</div>
          <div class="numwrap"><div class="big-num">${money(optimizer.budget)}</div></div>
          <input type="range" id="oBudget" min="100000" max="${DATA.utility.annualBudget}" step="50000" value="${optimizer.budget}" style="margin:10px 0 4px">
          <div class="row" style="justify-content:space-between"><span class="muted">$100K</span><span class="muted">${money(DATA.utility.annualBudget)}</span></div>

          <div class="sec-title" style="margin-top:18px">Optimize for</div>
          <div class="seg" style="width:100%">
            <button class="oObj ${optimizer.objective==='risk'?'on':''}" data-obj="risk" style="flex:1">Risk</button>
            <button class="oObj ${optimizer.objective==='customers'?'on':''}" data-obj="customers" style="flex:1">Customers</button>
            <button class="oObj ${optimizer.objective==='fire'?'on':''}" data-obj="fire" style="flex:1">Fire&nbsp;tier</button>
          </div>
          <div class="legend-note" style="margin-top:8px">Greedy risk-per-dollar selection across all open spans. The plan buys down the most ${optimizer.objective === 'risk' ? 'portfolio risk' : optimizer.objective === 'customers' ? 'customer exposure' : 'wildfire exposure'} the budget allows.</div>
          <div class="hr"></div>
          <button class="btn pri" id="oSend" style="width:100%">Schedule ${r.chosen.length} spans to crews</button>
        </div>

        <div>
          <div class="tiles" style="margin-bottom:14px">
            <div class="tile"><div class="n">${num(r.chosen.length)}</div><div class="l">spans funded</div></div>
            <div class="tile"><div class="n">${money(r.spent)}</div><div class="l">of ${money(optimizer.budget)} used</div></div>
            <div class="tile"><div class="n" style="color:var(--violet-deep)">${r.riskPct}%</div><div class="l">portfolio risk bought down</div></div>
            <div class="tile"><div class="n">${num(r.customers)}</div><div class="l">customers protected</div></div>
            <div class="tile"><div class="n" style="color:var(--rose)">${r.violations}</div><div class="l">violations cleared</div></div>
            <div class="tile"><div class="n">${r.tier3}<span style="font-size:14px;color:var(--muted)"> / ${tier3total}</span></div><div class="l">Tier 3 spans covered</div></div>
          </div>

          <div class="card chart-card" style="margin-bottom:14px">
            <h3>Spend efficiency frontier</h3>
            <div class="cap">Risk bought down per cumulative dollar. The steep early slope is why condition-based beats cycle-based trimming — the first dollars clear the worst spans. Marker = your budget.</div>
            <div id="frontier"></div>
          </div>

          <div class="card">
            <div class="pad" style="border-bottom:1px solid var(--line);font-weight:700">Funded spans <span class="muted" style="font-weight:500">(top of plan)</span></div>
            <div style="max-height:340px;overflow:auto">
              <table>
                <thead><tr><th>#</th><th>Span</th><th>Circuit</th><th>Tier</th><th class="r">VRI</th><th class="r">Breach</th><th class="r">Cost</th><th class="r">Risk/$</th></tr></thead>
                <tbody>${r.chosen.slice(0, 60).map((s, i) => `
                  <tr><td>${i + 1}</td><td><b>${s.id}</b></td><td>${esc(s.circuit)}</td><td>${tierChip(s.tier)}</td>
                  <td class="r"><span class="vri" style="background:${vriColor(s.vri)};width:30px;height:22px;font-size:11px">${s.vri}</span></td>
                  <td class="r ${ttvClass(s.ttv)}">${ttvText(s.ttv)}</td><td class="r">${money(s.cost)}</td>
                  <td class="r mono">${(s.vri / s.cost * 1000).toFixed(1)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    const bud = $('#oBudget');
    bud.oninput = e => { optimizer.budget = +e.target.value; v.querySelector('.big-num').textContent = money(optimizer.budget); };
    bud.onchange = () => renderOptimizer();
    v.querySelectorAll('.oObj').forEach(b => b.onclick = () => { optimizer.objective = b.getAttribute('data-obj'); renderOptimizer(); });
    $('#oSend').onclick = () => {
      r.chosen.forEach(s => { if (s.status === 'open') { s.status = 'scheduled'; s.crew = autoCrew(s); persistWork(s); } });
      toast(`${r.chosen.length} spans scheduled to crews`); renderKpis(); renderOptimizer();
    };
    drawFrontier(r);
  }
  function drawFrontier(r) {
    const host = $('#frontier'); if (!host) return;
    const W = host.clientWidth || 760, H = 220, p = 34;
    const fr = r.frontier;
    const maxCost = fr[fr.length - 1].cost || 1, maxRisk = fr[fr.length - 1].risk || 1;
    const X = c => p + c / maxCost * (W - 2 * p);
    const Y = rk => H - p - rk / maxRisk * (H - 2 * p);
    const path = fr.map((pt, i) => (i ? 'L' : 'M') + X(pt.cost).toFixed(1) + ' ' + Y(pt.risk).toFixed(1)).join(' ');
    const bx = X(r.budgetPoint.cost), by = Y(r.budgetPoint.risk);
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
      <line x1="${p}" y1="${H-p}" x2="${W-p}" y2="${H-p}" stroke="var(--line)"/>
      <line x1="${p}" y1="${p}" x2="${p}" y2="${H-p}" stroke="var(--line)"/>
      <path d="${path}" fill="none" stroke="var(--violet-deep)" stroke-width="2.5"/>
      <path d="${path} L ${X(r.budgetPoint.cost).toFixed(1)} ${(H-p)} L ${p} ${H-p} Z" fill="url(#fg)" opacity="0.12"/>
      <defs><linearGradient id="fg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6d28d9"/><stop offset="1" stop-color="#6d28d9" stop-opacity="0"/></linearGradient></defs>
      <line x1="${bx}" y1="${p}" x2="${bx}" y2="${H-p}" stroke="var(--rose)" stroke-dasharray="4 4"/>
      <circle cx="${bx}" cy="${by}" r="5" fill="var(--rose)"/>
      <text x="${Math.min(bx+8,W-120)}" y="${p+12}" font-size="11" fill="var(--rose)" font-weight="700">your budget · ${r.riskPct}% risk</text>
      <text x="${p}" y="${H-10}" font-size="11" fill="var(--muted)">$0</text>
      <text x="${W-p}" y="${H-10}" font-size="11" fill="var(--muted)" text-anchor="end">${money(maxCost)} (trim everything)</text>
      <text x="${p-6}" y="${p+4}" font-size="11" fill="var(--muted)" text-anchor="end" transform="rotate(-90 ${p-18} ${H/2})">cumulative risk reduced</text>
    </svg>`;
  }

  // ========================================================================
  //  VIEW: Analytics
  // ========================================================================
  function renderAnalytics() {
    const v = view$(); v.className = 'view';
    v.innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card chart-card" style="grid-column:1/-1"><h3>Projected clearance violations — 24 months</h3>
          <div class="cap">Spans breaching required clearance if nothing is trimmed vs. if this year's optimizer plan is executed now. The plan flattens the curve; vegetation regrowth slowly bends it back up — the case for an annual cycle.</div>
          <div id="burndown"></div></div>
        <div class="card chart-card"><h3>Risk by fire-threat tier</h3><div class="cap">Where the dangerous spans concentrate.</div><div id="tierDonut"></div></div>
        <div class="card chart-card"><h3>Highest-risk circuits</h3><div class="cap">Total risk index carried by each feeder.</div><div id="circuitBars"></div></div>
        <div class="card chart-card"><h3>Risk contribution by species</h3><div class="cap">Average risk index where each species dominates.</div><div id="speciesBars"></div></div>
        <div class="card chart-card"><h3>Clearance margin distribution</h3><div class="cap">Headroom to required clearance. Bars left of zero are active violations.</div><div id="marginHist"></div></div>
      </div>`;
    drawBurndown(); drawTierDonut(); drawCircuitBars(); drawSpeciesBars(); drawMarginHist();
  }

  function drawBurndown() {
    const host = $('#burndown'); if (!host) return;
    const months = 24;
    // optimizer plan (current budget) trims its chosen spans at month 0
    runOptimizer();
    const trimmed = new Set(optimizer.result.chosen.map(s => s.id));
    const noAction = [], withPlan = [];
    for (let m = 0; m <= months; m++) {
      let na = 0, wp = 0;
      DATA.spans.forEach(s => {
        const grow = s.growthRate * (m / 12);
        if ((s.clearanceFt - grow) - s.requiredFt <= 0) na++;
        const base = trimmed.has(s.id) ? s.requiredFt + 14 : s.clearanceFt;
        if ((base - grow) - s.requiredFt <= 0) wp++;
      });
      noAction.push(na); withPlan.push(wp);
    }
    const W = host.clientWidth || 760, H = 240, p = 38;
    const hi = Math.max(...noAction) * 1.12;   // zero-based count axis
    const lo = 0;
    const X = i => p + i / months * (W - 2 * p);
    const Y = val => H - p - (val - lo) / (hi - lo) * (H - 2 * p);
    const line = arr => arr.map((val, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val).toFixed(1)).join(' ');
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
      <line x1="${p}" y1="${H-p}" x2="${W-p}" y2="${H-p}" stroke="var(--line)"/>
      <line x1="${p}" y1="${p}" x2="${p}" y2="${H-p}" stroke="var(--line)"/>
      <path d="${line(noAction)}" fill="none" stroke="var(--rose)" stroke-width="2.5"/>
      <path d="${line(withPlan)}" fill="none" stroke="var(--violet-deep)" stroke-width="2.5"/>
      ${[0,6,12,18,24].map(mm => `<text x="${X(mm)}" y="${H-12}" font-size="11" fill="var(--muted)" text-anchor="middle">${mm}mo</text>`).join('')}
      <text x="${p-6}" y="${p+4}" font-size="11" fill="var(--muted)" text-anchor="end">${Math.round(hi)}</text>
      <text x="${p-6}" y="${H-p}" font-size="11" fill="var(--muted)" text-anchor="end">0</text>
      <text x="${p+6}" y="${p-6}" font-size="11" fill="var(--muted)">spans in violation</text>
      <g font-size="12" font-weight="700">
        <rect x="${W-186}" y="${p}" width="11" height="11" fill="var(--rose)" rx="2"/><text x="${W-170}" y="${p+10}" fill="var(--ink)">No action</text>
        <rect x="${W-186}" y="${p+18}" width="11" height="11" fill="var(--violet-deep)" rx="2"/><text x="${W-170}" y="${p+28}" fill="var(--ink)">With funded plan</text>
      </g>
    </svg>`;
  }

  function drawTierDonut() {
    const host = $('#tierDonut'); if (!host) return;
    const tiers = [1, 2, 3].map(t => {
      const sp = DATA.spans.filter(s => s.tier === t);
      return { t, count: sp.length, avg: Math.round(sp.reduce((a, s) => a + s.vri, 0) / (sp.length || 1)) };
    });
    const total = DATA.spans.length;
    const colors = { 1: '#34d399', 2: '#f5c451', 3: '#e2543b' };
    let a0 = -Math.PI / 2; const R = 70, cx = 90, cy = 90, r2 = 44;
    const arcs = tiers.map(t => {
      const frac = t.count / total, a1 = a0 + frac * Math.PI * 2;
      const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      const xi0 = cx + r2 * Math.cos(a1), yi0 = cy + r2 * Math.sin(a1);
      const xi1 = cx + r2 * Math.cos(a0), yi1 = cy + r2 * Math.sin(a0);
      const large = frac > 0.5 ? 1 : 0;
      a0 = a1;
      return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${xi0.toFixed(1)} ${yi0.toFixed(1)} A${r2} ${r2} 0 ${large} 0 ${xi1.toFixed(1)} ${yi1.toFixed(1)} Z" fill="${colors[t.t]}"/>`;
    }).join('');
    host.innerHTML = `<div class="row" style="gap:20px">
      <svg viewBox="0 0 180 180" width="180" height="180">${arcs}
        <text x="90" y="86" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink)">${total}</text>
        <text x="90" y="104" text-anchor="middle" font-size="11" fill="var(--muted)">spans</text></svg>
      <div>${tiers.slice().reverse().map(t => `<div class="bar-row" style="grid-template-columns:14px 1fr auto;margin:9px 0">
        <span style="width:12px;height:12px;border-radius:3px;background:${colors[t.t]}"></span>
        <span>Tier ${t.t} — ${num(t.count)} spans</span><b class="nowrap">avg VRI ${t.avg}</b></div>`).join('')}</div>
    </div>`;
  }

  function drawCircuitBars() {
    const host = $('#circuitBars'); if (!host) return;
    const rows = DATA.circuits.map(c => {
      const sp = DATA.spans.filter(s => s.circuit === c.id);
      return { id: c.id, total: sp.reduce((a, s) => a + s.vri, 0), tier: c.tier };
    }).sort((a, b) => b.total - a.total).slice(0, 8);
    const max = rows[0].total || 1;
    host.innerHTML = rows.map(r => `<div class="bar-row">
      <span class="mono">${r.id}</span>
      <div class="track"><i style="width:${Math.round(r.total / max * 100)}%;background:${vriColor(r.total / DATA.spans.filter(s=>s.circuit===r.id).length)}"></i></div>
      <b class="r">${num(r.total)}</b></div>`).join('');
  }

  function drawSpeciesBars() {
    const host = $('#speciesBars'); if (!host) return;
    const map = {};
    DATA.spans.forEach(s => { (map[s.species] = map[s.species] || []).push(s.vri); });
    const rows = Object.entries(map).map(([k, arr]) => ({ k, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), n: arr.length }))
      .sort((a, b) => b.avg - a.avg).slice(0, 8);
    host.innerHTML = rows.map(r => `<div class="bar-row">
      <span style="font-size:11.5px">${esc(r.k)}</span>
      <div class="track"><i style="width:${r.avg}%;background:${vriColor(r.avg)}"></i></div>
      <b class="r">${r.avg}</b></div>`).join('');
  }

  function drawMarginHist() {
    const host = $('#marginHist'); if (!host) return;
    const bins = []; const lo = -10, hi = 24, step = 2;
    for (let x = lo; x < hi; x += step) bins.push({ x, n: 0 });
    DATA.spans.forEach(s => {
      const m = s.clearanceFt - s.requiredFt;
      let i = Math.floor((m - lo) / step); i = Math.max(0, Math.min(bins.length - 1, i));
      bins[i].n++;
    });
    const max = Math.max(...bins.map(b => b.n)) || 1;
    const W = host.clientWidth || 360, H = 150, p = 24, bw = (W - 2 * p) / bins.length;
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
      ${bins.map((b, i) => { const h = b.n / max * (H - 2 * p); const x = p + i * bw;
        return `<rect x="${(x+1).toFixed(1)}" y="${(H-p-h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${b.x < 0 ? 'var(--rose)' : vriColor(60 - b.x * 2.2)}"/>`; }).join('')}
      <line x1="${(p+((0-lo)/step)*bw).toFixed(1)}" y1="${p-4}" x2="${(p+((0-lo)/step)*bw).toFixed(1)}" y2="${H-p}" stroke="var(--ink)" stroke-dasharray="3 3"/>
      <text x="${(p+((0-lo)/step)*bw).toFixed(1)}" y="${H-6}" font-size="10" fill="var(--ink)" text-anchor="middle">0 ft</text>
      <text x="${p}" y="${H-6}" font-size="10" fill="var(--muted)">${lo}</text>
      <text x="${W-p}" y="${H-6}" font-size="10" fill="var(--muted)" text-anchor="end">+${hi}</text>
    </svg>`;
  }

  // ========================================================================
  //  VIEW: Crews
  // ========================================================================
  function renderCrews() {
    const v = view$(); v.className = 'view';
    const cols = [['scheduled', 'Scheduled'], ['in-progress', 'In progress'], ['completed', 'Completed']];
    const byCrew = {};
    DATA.crews.forEach(c => byCrew[c.id] = DATA.spans.filter(s => s.crew === c.id && s.status !== 'open'));
    v.innerHTML = `
      <div class="tiles" style="margin-bottom:16px">
        ${DATA.crews.map(c => {
          const assigned = byCrew[c.id];
          const load = assigned.filter(s => s.status !== 'completed').length;
          const pct = Math.min(100, Math.round(load / c.capacity * 100));
          return `<div class="tile"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span class="tag">${esc(c.org)}</span></div>
            <div class="l" style="margin-top:6px">${load} / ${c.capacity} spans/wk · base ${esc(DATA.substations.find(x=>x.id===c.base).name)}</div>
            <div class="budget-meter" style="width:100%;margin-top:8px"><i style="width:${pct}%;background:${pct>100?'var(--rose)':'linear-gradient(90deg,var(--violet),var(--violet-deep))'}"></i></div></div>`;
        }).join('')}
      </div>
      <div class="kanban">
        <div class="kcol"><h4>Backlog (unassigned) <span>${DATA.spans.filter(s=>s.status==='open'&&s.vri>=60).length}</span></h4>
          ${DATA.spans.filter(s => s.status === 'open' && s.vri >= 60).sort(SORTS.vri).slice(0, 12).map(woCard).join('') || '<div class="muted" style="font-size:12px">No high-risk open spans — nice.</div>'}
        </div>
        ${cols.map(([st, label]) => `<div class="kcol"><h4>${label} <span>${DATA.spans.filter(s => s.status === st).length}</span></h4>
          ${DATA.spans.filter(s => s.status === st).sort(SORTS.vri).slice(0, 20).map(woCard).join('') || '<div class="muted" style="font-size:12px">—</div>'}
        </div>`).join('')}
      </div>`;
    v.onclick = e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const s = DATA.spans.find(x => x.id === btn.getAttribute('data-id'));
      const act = btn.getAttribute('data-act');
      if (act === 'schedule') { s.status = 'scheduled'; s.crew = autoCrew(s); }
      else if (act === 'advance') advanceStatus(s);
      persistWork(s); renderKpis(); renderCrews();
    };
  }
  function woCard(s) {
    return `<div class="kcard">
      <div class="top"><span class="id">${s.id}</span><span class="vri" style="background:${vriColor(s.vri)};width:30px;height:22px;font-size:11px">${s.vri}</span></div>
      <div class="meta">${esc(s.circuit)} · Tier ${s.tier} · ${money(s.cost)}${s.crew ? ' · ' + esc(DATA.crews.find(c=>c.id===s.crew)?.name||'') : ''}</div>
      <div class="acts">
        ${s.status === 'open'
          ? `<button class="btn sm pri" data-act="schedule" data-id="${s.id}">Assign</button>`
          : s.status === 'completed'
            ? `<button class="btn sm" data-act="advance" data-id="${s.id}">Reopen</button>`
            : `<button class="btn sm pri" data-act="advance" data-id="${s.id}">${s.status === 'scheduled' ? 'Start' : 'Complete'}</button>`}
      </div></div>`;
  }

  // ========================================================================
  //  VIEW: Compliance
  // ========================================================================
  function complianceRows() {
    return DATA.spans.filter(s => (s.clearanceFt - s.requiredFt) <= 0 || (s.ttv > 0 && s.ttv <= 12))
      .map(s => {
        const margin = +(s.clearanceFt - s.requiredFt).toFixed(1);
        const violation = margin <= 0;
        const due = new Date(2026, 5, 29); due.setMonth(due.getMonth() + Math.max(0, Math.min(12, s.ttv)));
        return {
          s, margin, violation,
          reason: violation ? 'Clearance violation (GO 95 / FAC-003)' : 'Projected breach within 12 mo',
          ref: s.tier >= 2 ? `HFTD Tier ${s.tier} · GO 95 Rule 35` : 'GO 95 Rule 35',
          due: due.toISOString().slice(0, 10)
        };
      }).sort((a, b) => (a.violation === b.violation ? a.margin - b.margin : a.violation ? -1 : 1));
  }
  function renderCompliance() {
    const v = view$(); v.className = 'view';
    const rows = complianceRows();
    const viol = rows.filter(r => r.violation).length;
    const t3 = rows.filter(r => r.s.tier === 3).length;
    v.innerHTML = `
      <div class="row no-print" style="justify-content:space-between;margin-bottom:14px">
        <div><h2 style="font-size:18px">Vegetation compliance register</h2><div class="muted" style="font-size:12.5px">CPUC GO 95 / NERC FAC-003 exposure · generated ${new Date().toISOString().slice(0,10)}</div></div>
        <div class="row"><button class="btn" id="cCsv">Export CSV</button><button class="btn pri" id="cPrint">Print report</button></div>
      </div>
      <div class="tiles" style="margin-bottom:16px">
        <div class="tile"><div class="n" style="color:var(--rose)">${viol}</div><div class="l">active clearance violations</div></div>
        <div class="tile"><div class="n" style="color:var(--amber)">${rows.length - viol}</div><div class="l">projected breaches (12 mo)</div></div>
        <div class="tile"><div class="n">${t3}</div><div class="l">in HFTD Tier 3</div></div>
        <div class="tile"><div class="n">${money(rows.reduce((a, r) => a + r.s.cost, 0))}</div><div class="l">est. remediation cost</div></div>
      </div>
      <div class="print-only" style="margin-bottom:10px">
        <h2>${DATA.utility.name} — Vegetation Compliance Register</h2>
        <div>${DATA.utility.territory} · Generated ${new Date().toISOString().slice(0,10)} · ${rows.length} findings (${viol} active violations)</div>
      </div>
      <div class="card"><div style="max-height:calc(100vh - 320px);overflow:auto" id="cScroll">
        <table>
          <thead><tr><th>Span</th><th>Circuit</th><th>kV</th><th>Tier</th><th class="r">Req ft</th><th class="r">Actual ft</th><th class="r">Margin</th><th>Finding</th><th>Authority</th><th>Last trim</th><th>Remediate by</th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td><b>${r.s.id}</b></td><td>${esc(r.s.circuit)}</td><td>${r.s.kv}</td><td>${tierChip(r.s.tier)}</td>
            <td class="r">${r.s.requiredFt}</td><td class="r">${r.s.clearanceFt}</td>
            <td class="r" style="color:${r.violation?'var(--rose)':'inherit'};font-weight:700">${r.margin > 0 ? '+' : ''}${r.margin}</td>
            <td>${r.reason}</td><td>${r.ref}</td><td>${r.s.lastTrim}</td><td><b>${r.due}</b></td></tr>`).join('')}
          </tbody>
        </table></div></div>`;
    $('#cPrint').onclick = () => window.print();
    $('#cCsv').onclick = () => {
      const head = ['span', 'circuit', 'kv', 'tier', 'required_ft', 'actual_ft', 'margin_ft', 'finding', 'authority', 'last_trim', 'remediate_by', 'est_cost'];
      const lines = [head.join(',')].concat(rows.map(r => [r.s.id, r.s.circuit, r.s.kv, r.s.tier, r.s.requiredFt, r.s.clearanceFt, r.margin, '"' + r.reason + '"', '"' + r.ref + '"', r.s.lastTrim, r.due, r.s.cost].join(',')));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'meridian-compliance-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
      toast('Compliance register exported');
    };
  }

  // ========================================================================
  //  VIEW: Scenarios
  // ========================================================================
  let cmpA = null, cmpB = null;
  function snapshotScenario(name) {
    runOptimizer();
    const r = optimizer.result;
    return {
      id: 'scn-' + Date.now(), name,
      weights: Object.assign({}, weights),
      budget: optimizer.budget, objective: optimizer.objective,
      spans: r.chosen.length, spent: r.spent, riskPct: r.riskPct,
      customers: r.customers, tier3: r.tier3, violations: r.violations
    };
  }
  function renderScenarios() {
    const v = view$(); v.className = 'view';
    v.innerHTML = `
      <div class="row no-print" style="justify-content:space-between;margin-bottom:8px">
        <div><h2 style="font-size:18px">Scenario compare</h2>
          <div class="muted" style="font-size:12.5px">Save the current risk weights + budget as a scenario, then compare any two side by side.</div></div>
        <button class="btn pri" id="sSave">Save current as scenario</button>
      </div>
      <div class="card pad panel" style="margin-bottom:16px">
        <div class="sec-title">Current risk-weight model <span class="muted" style="text-transform:none;letter-spacing:0">— retune to create variants</span></div>
        <div class="weights" id="weightCtrls"></div>
        <div class="row" style="margin-top:8px;gap:10px">
          <span class="muted">Budget ${money(optimizer.budget)}</span>
          <input type="range" id="sBudget" min="100000" max="${DATA.utility.annualBudget}" step="50000" value="${optimizer.budget}" style="max-width:280px">
          <button class="btn sm" id="sReset">Reset weights</button>
        </div>
      </div>
      <div id="scnList"></div>`;
    renderWeightCtrls();
    $('#sBudget').oninput = e => { optimizer.budget = +e.target.value; v.querySelector('.muted').textContent = 'Budget ' + money(optimizer.budget); };
    $('#sReset').onclick = () => { weights = Object.assign({}, M.DEFAULT_WEIGHTS); save(LS.weights, weights); recomputeAll(); renderScenarios(); renderKpis(); };
    $('#sSave').onclick = () => {
      const n = 'Scenario ' + (scenarios.length + 1);
      scenarios.push(snapshotScenario(n)); save(LS.scenarios, scenarios);
      toast('Scenario saved'); renderScnList();
    };
    renderScnList();
  }
  function renderWeightCtrls() {
    const host = $('#weightCtrls'); if (!host) return;
    const labels = { encroachment: 'Encroachment', growth: 'Growth rate', fire: 'Fire threat', criticality: 'Criticality', access: 'Access' };
    host.innerHTML = Object.keys(labels).map(k => `<div class="wrow">
      <span>${labels[k]}</span>
      <input type="range" data-w="${k}" min="0" max="0.6" step="0.01" value="${weights[k]}">
      <span class="mono r" id="wv-${k}">${weights[k].toFixed(2)}</span></div>`).join('');
    host.querySelectorAll('input').forEach(inp => {
      inp.oninput = () => {
        const k = inp.getAttribute('data-w'); weights[k] = +inp.value;
        $('#wv-' + k).textContent = (+inp.value).toFixed(2);
        save(LS.weights, weights); recomputeAll(); renderKpis();
      };
    });
  }
  function renderScnList() {
    const host = $('#scnList'); if (!host) return;
    if (!scenarios.length) { host.innerHTML = '<div class="empty" style="height:140px">No scenarios yet — tune the weights/budget and hit “Save current as scenario”.</div>'; return; }
    const metric = (a, key, hi) => {
      if (!cmpA || !cmpB) return '';
      const x = scenarios.find(s => s.id === cmpA), y = scenarios.find(s => s.id === cmpB);
      if (!x || !y || a.id !== cmpB && a.id !== cmpA) return '';
      return '';
    };
    host.innerHTML = `<div class="scn-grid">${scenarios.map(sc => `
      <div class="scn ${sc.id === cmpA ? 'cmpA' : ''} ${sc.id === cmpB ? 'cmpB' : ''}">
        <button class="x" data-del="${sc.id}">&times;</button>
        <h4>${esc(sc.name)}</h4>
        <div class="kv" style="grid-template-columns:1fr;gap:6px">
          <div><span class="muted">Budget</span> · <b>${money(sc.budget)}</b> · for ${sc.objective}</div>
          <div><span class="muted">Risk bought down</span> · <b style="color:var(--violet-deep)">${sc.riskPct}%</b></div>
          <div><span class="muted">Spans funded</span> · <b>${sc.spans}</b> (${money(sc.spent)})</div>
          <div><span class="muted">Customers protected</span> · <b>${num(sc.customers)}</b></div>
          <div><span class="muted">Violations cleared</span> · <b style="color:var(--rose)">${sc.violations}</b> · Tier 3: ${sc.tier3}</div>
        </div>
        <div class="row" style="gap:6px;margin-top:8px">
          <button class="btn sm ${sc.id===cmpA?'pri':''}" data-cmp="A" data-id="${sc.id}">Set A</button>
          <button class="btn sm ${sc.id===cmpB?'pri':''}" data-cmp="B" data-id="${sc.id}">Set B</button>
        </div>
      </div>`).join('')}</div>
      ${cmpA && cmpB ? compareBlock() : '<div class="legend-note" style="margin-top:12px">Pick an A and a B to see a head-to-head.</div>'}`;
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const id = b.getAttribute('data-del'); scenarios = scenarios.filter(s => s.id !== id);
      if (cmpA === id) cmpA = null; if (cmpB === id) cmpB = null;
      save(LS.scenarios, scenarios); renderScnList();
    });
    host.querySelectorAll('[data-cmp]').forEach(b => b.onclick = () => {
      const id = b.getAttribute('data-id');
      if (b.getAttribute('data-cmp') === 'A') cmpA = cmpA === id ? null : id; else cmpB = cmpB === id ? null : id;
      renderScnList();
    });
  }
  function compareBlock() {
    const a = scenarios.find(s => s.id === cmpA), b = scenarios.find(s => s.id === cmpB);
    if (!a || !b) return '';
    const row = (label, x, y, fmt, hiBetter) => {
      const better = x === y ? 0 : (x > y ? 1 : -1) * (hiBetter ? 1 : -1);
      const col = d => d > 0 ? 'color:var(--green);font-weight:800' : d < 0 ? 'color:var(--muted)' : '';
      return `<tr><td>${label}</td>
        <td class="r" style="${col(better)}">${fmt(x)}</td>
        <td class="r" style="${col(-better)}">${fmt(y)}</td></tr>`;
    };
    return `<div class="card" style="margin-top:14px;max-width:560px"><div class="pad" style="border-bottom:1px solid var(--line);font-weight:700">A vs B</div>
      <table><thead><tr><th>Metric</th><th class="r">${esc(a.name)}</th><th class="r">${esc(b.name)}</th></tr></thead><tbody>
      ${row('Budget', a.budget, b.budget, money, false)}
      ${row('Risk bought down %', a.riskPct, b.riskPct, x => x + '%', true)}
      ${row('Spans funded', a.spans, b.spans, num, true)}
      ${row('Customers protected', a.customers, b.customers, num, true)}
      ${row('Violations cleared', a.violations, b.violations, num, true)}
      ${row('Tier 3 covered', a.tier3, b.tier3, num, true)}
      </tbody></table></div>`;
  }

  // ========================================================================
  //  VIEW: About
  // ========================================================================
  function renderAbout() {
    const v = view$(); v.className = 'view';
    const u = DATA.utility;
    v.innerHTML = `<div style="max-width:760px">
      <h2 style="font-size:20px">Meridian</h2>
      <p class="muted" style="margin:6px 0 18px">Condition-based vegetation risk intelligence for electric utilities. A planning cockpit that scores every line span, forecasts when it will breach clearance, and tells you where the next trimming dollar buys down the most risk — replacing fixed “trim everything every N years” cycles.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card pad"><div class="sec-title">The Vegetation Risk Index</div>
          <p style="font-size:13px">Each span scores 0–100 by blending five normalized factors. Tune the weights under <b>Scenario compare</b>.</p>
          <ul style="font-size:13px;padding-left:18px;line-height:1.7">
            <li><b>Encroachment</b> — current tree-to-conductor clearance vs. required envelope</li>
            <li><b>Growth</b> — species growth rate × time since last trim</li>
            <li><b>Fire threat</b> — CPUC HFTD tier (1/2/3)</li>
            <li><b>Criticality</b> — customers downstream + voltage class</li>
            <li><b>Access</b> — slope &amp; crew reachability</li>
          </ul>
          <p style="font-size:13px"><b>Time-to-violation</b> = clearance headroom ÷ growth rate — converts a score into a deadline.</p>
        </div>
        <div class="card pad"><div class="sec-title">Synthetic data</div>
          <p style="font-size:13px">All data is generated, seeded, and fictional — no real utility data.</p>
          <div class="kv">
            <div><div class="k">Utility</div><div class="v">${esc(u.name)}</div></div>
            <div><div class="k">Territory</div><div class="v">${esc(u.territory)}</div></div>
            <div><div class="k">Spans modelled</div><div class="v">${num(DATA.spans.length)}</div></div>
            <div><div class="k">Circuits</div><div class="v">${DATA.circuits.length}</div></div>
            <div><div class="k">Substations</div><div class="v">${DATA.substations.length}</div></div>
            <div><div class="k">Line miles</div><div class="v">${num(u.miles)}</div></div>
          </div>
          <button class="btn" id="aReset" style="margin-top:8px">Reset demo (clear saved state)</button>
        </div>
      </div>
      <p class="legend-note" style="margin-top:16px">Built as an exploratory prototype. Geographic basemap © OpenStreetMap / CARTO. Offline-capable PWA — no backend, data lives in your browser.</p>
    </div>`;
    $('#aReset').onclick = () => {
      localStorage.removeItem(LS.work); localStorage.removeItem(LS.scenarios); localStorage.removeItem(LS.weights);
      location.reload();
    };
  }

  // ========================================================================
  //  Router
  // ========================================================================
  const TITLES = {
    dashboard: ['Vegetation Risk Dashboard', 'Score, map & prioritize every span'],
    optimizer: ['Budget Optimizer', 'Spend the next dollar where it buys down the most risk'],
    analytics: ['Portfolio Analytics', 'Risk trends, projections & concentration'],
    crews: ['Crew Dispatch', 'Turn risk into scheduled work'],
    compliance: ['Compliance Register', 'CPUC GO 95 / NERC FAC-003 exposure'],
    scenarios: ['Scenario Compare', 'Tune the model, compare the plans'],
    about: ['About Meridian', 'How the scoring works']
  };
  function go(name) {
    view = name;
    document.querySelectorAll('.rail button[data-view]').forEach(b => b.classList.toggle('on', b.getAttribute('data-view') === name));
    const [t, s] = TITLES[name];
    $('#topTitle').textContent = t; $('#topSub').textContent = `${DATA.utility.name} · ${s}`;
    closeDetailSilently();
    ({ dashboard: renderDashboard, optimizer: renderOptimizer, analytics: renderAnalytics, crews: renderCrews, compliance: renderCompliance, scenarios: renderScenarios, about: renderAbout }[name])();
  }
  function closeDetailSilently() { const d = $('#detail'); if (d) d.classList.remove('show'); if (view !== 'dashboard') selectedId = null; }

  // ---------- boot ----------
  recomputeAll();
  document.querySelectorAll('.rail button[data-view]').forEach(b => b.onclick = () => go(b.getAttribute('data-view')));
  renderKpis();
  go('dashboard');
  window.addEventListener('resize', () => {
    if (view === 'analytics') renderAnalytics();
    if (view === 'optimizer' && optimizer.result) drawFrontier(optimizer.result);
  });
})();
