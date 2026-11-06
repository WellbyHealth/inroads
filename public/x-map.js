// Map layers for the business, Google Maps style: choose what the county colors mean (sources, density,
// competition, opportunity, your referrals) and which of your own data to show on top. Remembered per browser.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;

const GROUPS = {
  Hospitals: ['Hospital', 'Rehab hospital', 'LTAC hospital', 'Psychiatric hospital'],
  'Post-acute': ['Skilled nursing', 'Assisted living', 'Home health agency', 'Hospice'],
  Physicians: ['Physician: geriatrics', 'Physician: neurology', 'Physician: cardiology', 'Physician: PM&R', 'Physician: internal medicine', 'Physician: family medicine'],
  Other: ['Case management', 'Clinic', 'Other source'],
};
// Public data has no "home care" category, so home health agencies are the closest stand-in for home care competitors.
const COMPETITOR = { home_care: 'Home health agency', home_health: 'Home health agency', home_infusion: 'Home health agency', other: 'Home health agency', hospice: 'Hospice', snf: 'Skilled nursing', rehab: 'Skilled nursing', assisted_living: 'Assisted living' };
const RAMP = {
  count: ['#EEF4FD', '#D3E3F8', '#A9C8EE', '#6F9FDC', '#3F77C2', '#1E4F8F', '#0D2747'],
  density: ['#EEF4FD', '#D3E3F8', '#A9C8EE', '#6F9FDC', '#3F77C2', '#1E4F8F', '#0D2747'],
  competition: ['#F1F6FD', '#D6E6FA', '#B3D0F5', '#8FB8EE', '#5F95DA', '#2F6DB5', '#1B4A82'],
  opportunity: ['#ECF7EE', '#CDEBD3', '#9DD5A9', '#62B678', '#33914F', '#1D6B36', '#0E4422'],
  referrals: ['#F3EEFB', '#DDD0F4', '#BDA5E7', '#9874D6', '#7448BF', '#55309A', '#371D6B'],
};
const MODES = {
  count: { label: 'Referral sources', sub: 'How many hospitals, physicians and facilities are in each county' },
  density: { label: 'Source density', sub: 'Sources per 100 square miles, so big rural counties don’t look busier than they are' },
  competition: { label: 'Competition', sub: '' },
  opportunity: { label: 'Opportunity', sub: 'Referral sources per competitor: darker means more sources and fewer agencies chasing them' },
  referrals: { label: 'Your referrals', sub: 'Referrals you received in the last 12 months, by the county of the source' },
  none: { label: 'No colors', sub: 'Plain map, easiest to read' },
};
const DEF = { mode: 'count', strong: false, refs: true, outreach: false, offices: true, targets: true, labels: true };
let P = { ...DEF };
try { P = { ...DEF, ...JSON.parse(localStorage.getItem('wb.layers') || '{}') }; } catch {}
if (!MODES[P.mode]) P.mode = 'count';
const save = () => { try { localStorage.setItem('wb.layers', JSON.stringify(P)); } catch {} };

let M = null;
const fmt = n => W().fmt(Math.round(n));
const group = () => document.querySelector('#mMetric button.on')?.dataset.m || 'all';
const compType = () => COMPETITOR[W().S.settings.careType] || 'Home health agency';
const compLabel = () => ({ 'Home health agency': 'home health agencies', Hospice: 'hospices', 'Skilled nursing': 'skilled nursing facilities', 'Assisted living': 'assisted living communities' })[compType()];

// ---------- county numbers ----------
function areaSqMi(geom) {
  // Spherical polygon area (as in geojson-area), in square miles.
  const R = 3958.8, rad = Math.PI / 180;
  const ring = c => { let a = 0; for (let i = 0; i < c.length - 1; i++) a += (c[i + 1][0] - c[i][0]) * rad * (2 + Math.sin(c[i][1] * rad) + Math.sin(c[i + 1][1] * rad)); return Math.abs(a * R * R / 2); };
  const poly = p => p.length ? ring(p[0]) - p.slice(1).reduce((s, h) => s + ring(h), 0) : 0;
  if (!geom) return 0;
  return geom.type === 'Polygon' ? poly(geom.coordinates) : geom.type === 'MultiPolygon' ? geom.coordinates.reduce((s, p) => s + poly(p), 0) : 0;
}
function inRing(pt, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
function inGeom(pt, g) { const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; return polys.some(p => inRing(pt, p[0]) && !p.slice(1).some(h => inRing(pt, h))); }
function referralsByCounty() {
  if (M.refByCounty) return M.refByCounty;
  const out = {}, layers = []; M.county.eachLayer(l => layers.push(l));
  for (const s of W().S.scored || []) {
    if (!s.total12 || s.p.lat == null) continue;
    const pt = [s.p.lng, s.p.lat], ll = L.latLng(s.p.lat, s.p.lng);
    const hit = layers.find(l => l.getBounds().contains(ll) && inGeom(pt, l.feature.geometry));
    if (hit) out[hit.feature.id] = (out[hit.feature.id] || 0) + s.total12;
  }
  return (M.refByCounty = out);
}
function valueFor(id) {
  const c = W().S.index?.counties?.[id]; if (!c && P.mode !== 'referrals') return 0;
  const g = group(), types = g === 'all' ? null : GROUPS[g];
  const sources = c ? (types ? types.reduce((a, t) => a + (c.counts?.[t] || 0), 0) : c.n) : 0;
  if (P.mode === 'count') return sources;
  if (P.mode === 'density') { const a = M.area[id] || 0; return a > 1 ? 100 * sources / a : 0; }
  const comp = c?.counts?.[compType()] || 0;
  if (P.mode === 'competition') return comp;
  if (P.mode === 'opportunity') { const s2 = types && types.includes(compType()) ? sources - comp : sources - (g === 'all' ? comp : 0); return c ? s2 / (comp + 1) : 0; }
  if (P.mode === 'referrals') return referralsByCounty()[id] || 0;
  return 0;
}
function computeBreaks() {
  const vals = []; M.county.eachLayer(l => { const v = valueFor(l.feature.id); if (v > 0) vals.push(v); });
  vals.sort((a, b) => a - b);
  const q = k => vals[Math.floor((vals.length - 1) * k)] || 0;
  M.breaks = vals.length ? [.2, .4, .6, .75, .9].map(q) : [];
  M.breakKey = P.mode + '|' + group();
}
const colorFor = v => { if (!v) return '#F6F5F1'; let i = 0; while (i < M.breaks.length && v > M.breaks[i]) i++; return RAMP[P.mode][Math.min(i + 1, 6)]; };

function wrapCounty(gl) {
  if (gl._wbWrapped) return;
  gl._wbWrapped = true;
  M.area = {}; gl.eachLayer(l => { M.area[l.feature.id] = areaSqMi(l.feature.geometry); });
  const adjust = (st, f) => {
    const k = P.strong ? 1 : 0.55;
    if (P.mode === 'none') return { ...st, fillOpacity: 0, weight: Math.max(st.weight || .5, .7), color: '#C9C7BF' };
    if (P.mode === 'count' || !f) return { ...st, fillOpacity: (st.fillOpacity ?? .8) * k };
    if (M.breakKey !== P.mode + '|' + group()) computeBreaks();
    return { ...st, fillColor: colorFor(valueFor(f.id)), fillOpacity: (st.fillOpacity ?? .8) * k };
  };
  gl.setStyle = s => L.GeoJSON.prototype.setStyle.call(gl, typeof s === 'function' ? f => adjust(s(f), f) : s);
  // County tooltips also say what the current color means.
  gl.eachLayer(l => { const t = l.getTooltip(); if (!t) return; const base = t._content; l.setTooltipContent(() => { const html = typeof base === 'function' ? base(l) : base; return P.mode === 'count' || P.mode === 'none' ? html : `${html}<br><span style="opacity:.8">${lineFor(l.feature.id)}</span>`; }); });
  gl.setStyle(gl.options.style);
  legendWatch();
}
function lineFor(id) {
  const v = valueFor(id);
  return P.mode === 'density' ? `${v.toFixed(1)} sources per 100 sq mi` : P.mode === 'competition' ? `${fmt(v)} ${compLabel()}` : P.mode === 'opportunity' ? `${v.toFixed(1)} sources per competitor` : P.mode === 'referrals' ? `${fmt(v)} referrals to you, last 12 months` : '';
}

// ---------- legend ----------
function legendHtml() {
  const lab = { density: 'Sources per 100 sq mi', competition: `Competition: ${compLabel()} per county`, opportunity: 'Opportunity: sources per competitor', referrals: 'Your referrals by county, 12 months' }[P.mode];
  const b = M.breaks, dec = P.mode === 'density' || P.mode === 'opportunity' ? 1 : 0, f = v => dec ? v.toFixed(1) : fmt(v);
  const tip = i => i === 0 ? `up to ${f(b[0] || 0)}` : i < b.length ? `${f(b[i - 1])}–${f(b[i])}` : `over ${f(b[b.length - 1] || 0)}`;
  return `<b>${W().esc(lab)}</b><span class="ramp">${RAMP[P.mode].slice(1).map((c, i) => `<i style="background:${c}" data-tip="${W().esc(tip(i))}"></i>`).join('')}</span><span class="muted small">${P.mode === 'referrals' && !b.length ? 'no referral data yet' : 'less → more'}</span>`;
}
function legendWatch() {
  const el = document.getElementById('mLegend'); if (!el || el._wbObs) return;
  const fix = () => {
    if (!M || W().S.lmap !== M.map) return;
    if (['count', 'none'].includes(P.mode) || M.map.getZoom() >= 9) { if (P.mode === 'none' && M.map.getZoom() < 9) set('<b>No county colors</b><span class="muted small">Choose a layer in Layers</span>'); return; }
    if (M.breakKey !== P.mode + '|' + group()) computeBreaks();
    set(legendHtml());
  };
  const set = h => { if (el.innerHTML === h) return; el._wbSet = true; el.innerHTML = h; };
  el._wbObs = new MutationObserver(() => { if (el._wbSet) { el._wbSet = false; return; } fix(); });
  el._wbObs.observe(el, { childList: true });
  el._wbFix = fix; fix();
}

// ---------- your data on top ----------
function drawOverlays() {
  const { S, STATUS_COLOR, esc, openSource } = W(), map = M.map;
  M.refLayer.clearLayers(); M.outLayer.clearLayers();
  if (P.refs && !S.pure) {
    for (const s of (S.scored || []).filter(x => x.total12 && x.p.lat != null).sort((a, b) => b.total12 - a.total12).slice(0, 400)) {
      L.circleMarker([s.p.lat, s.p.lng], { pane: 'wbData', radius: Math.min(18, 4 + Math.sqrt(s.total12) * 1.5), weight: 1.5, color: '#fff', fillColor: STATUS_COLOR[s.status] || '#7448BF', fillOpacity: .85 })
        .bindTooltip(`<b>${esc(s.p.name)}</b><br>${fmt(s.total12)} referrals in 12 months · ${esc(s.status)}`).on('click', () => openSource(s.p.id)).addTo(M.refLayer);
    }
  }
  if (P.outreach && !S.pure) {
    const since = new Date(Date.now() - 90 * 864e5).toISOString(), last = new Map();
    for (const a of S.activity) if (a.status === 'done' && !W().isSkip(a) && (a.doneAt || a.at) >= since && a.sourceId) last.set(a.sourceId, (last.get(a.sourceId) || 0) + 1);
    for (const [id, n] of last) { const s = S.scoredById?.get(id); if (!s || s.p.lat == null) continue;
      L.marker([s.p.lat, s.p.lng], { pane: 'wbData', icon: L.divIcon({ className: 'wbtouch', html: '<span>✓</span>', iconSize: [20, 20], iconAnchor: [10, 10] }) })
        .bindTooltip(`<b>${esc(s.p.name)}</b><br>${n} touch${n === 1 ? '' : 'es'} in the last 90 days`).on('click', () => openSource(id)).addTo(M.outLayer); }
  }
}
function apply() {
  const map = M.map;
  for (const l of M.offices) P.offices ? l.addTo(map) : map.removeLayer(l);
  for (const l of M.targets) P.targets ? l.addTo(map) : map.removeLayer(l);
  if (M.labels) P.labels ? (map.hasLayer(M.labels) || M.labels.addTo(map)) : map.removeLayer(M.labels);
  drawOverlays();
  if (M.county) { M.breakKey = null; M.county.setStyle(M.county.options.style); }
  document.getElementById('mLegend')?._wbFix?.();
}

// ---------- control ----------
const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="m2.5 12.5 9.5 5 9.5-5"/><path d="m2.5 16.5 9.5 5 9.5-5" opacity=".55"/></svg>';
function control() {
  const host = document.getElementById('nmap')?.parentElement; if (!host) return;
  document.getElementById('mLayers')?.remove();
  const box = document.createElement('div'); box.id = 'mLayers'; box.className = 'mlayers'; host.appendChild(box);
  const draw = open => {
    const { esc, S } = W();
    const tog = (k, label, sub) => `<label class="ltog"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-tog="${k}" ${P[k] ? 'checked' : ''}><i></i></label>`;
    const modes = Object.entries(MODES).filter(([k]) => !(S.pure && k === 'referrals'));
    box.innerHTML = `<button class="lbtn ${open ? 'on' : ''}" aria-label="Map layers" aria-expanded="${open}">${ICON}<span>Layers</span></button>
      ${open ? `<div class="lpanel" role="dialog" aria-label="Map layers">
        <div class="lhead"><b>Color counties by</b><button class="lx" aria-label="Close">✕</button></div>
        <div class="lmodes">${modes.map(([k, m]) => `<button class="lmode ${P.mode === k ? 'on' : ''}" data-mode="${k}"><i class="sw" style="background:${k === 'none' ? '#fff' : `linear-gradient(135deg, ${RAMP[k][2]}, ${RAMP[k][5]})`}"></i><span><b>${esc(m.label)}</b><small>${esc(k === 'competition' ? `Other ${compLabel()} in each county` : m.sub)}</small></span></button>`).join('')}</div>
        ${P.mode !== 'none' ? `<div class="lrow"><span>Color strength</span><div class="seg"><button data-strong="0" class="${P.strong ? '' : 'on'}">Soft</button><button data-strong="1" class="${P.strong ? 'on' : ''}">Strong</button></div></div>` : ''}
        <p class="lnote">The type buttons at the top (Hospitals, Post-acute…) narrow which sources are counted.</p>
        <div class="lhead"><b>Show on the map</b></div>
        ${S.pure ? '' : tog('refs', 'Your referral sources', 'Sized by referrals, colored by relationship')}
        ${S.pure ? '' : tog('outreach', 'Your outreach', 'Sources you touched in the last 90 days')}
        ${S.pure ? '' : tog('targets', 'Top 10 targets')}
        ${tog('offices', 'Offices and radius')}
        ${tog('labels', 'City and county names')}
        <button class="lreset">Reset</button>
      </div>` : ''}`;
    box.querySelector('.lbtn').onclick = e => { e.stopPropagation(); draw(!open); };
    if (!open) return;
    box.querySelector('.lx').onclick = () => draw(false);
    box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { P.mode = b.dataset.mode; save(); apply(); draw(true); });
    box.querySelectorAll('[data-strong]').forEach(b => b.onclick = () => { P.strong = b.dataset.strong === '1'; save(); apply(); draw(true); });
    box.querySelectorAll('[data-tog]').forEach(c => c.onchange = () => { P[c.dataset.tog] = c.checked; save(); apply(); });
    box.querySelector('.lreset').onclick = () => { P = { ...DEF }; save(); apply(); draw(true); };
  };
  draw(false);
  box._close = () => draw(false);
}
document.addEventListener('mousedown', e => { const box = document.getElementById('mLayers'); if (box && !box.contains(e.target) && box.querySelector('.lpanel')) box._close(); });
document.addEventListener('click', e => { if (e.target.closest('#mMetric button') && M) setTimeout(() => { M.breakKey = null; M.county?.setStyle(M.county.options.style); document.getElementById('mLegend')?._wbFix?.(); }, 0); });

function attach() {
  const map = W().S.lmap; if (!map || map._wbLayers) return;
  map._wbLayers = true;
  M = { map, labels: null, county: null, offices: [], targets: [], breaks: [], breakKey: null, area: {}, refByCounty: null };
  if (!map.getPane('wbData')) { map.createPane('wbData'); map.getPane('wbData').style.zIndex = 590; }
  M.refLayer = L.layerGroup().addTo(map); M.outLayer = L.layerGroup().addTo(map);
  map.eachLayer(l => {
    if (l instanceof L.TileLayer && /Reference/.test(l._url)) M.labels = l;
    else if (l instanceof L.Circle && l.options.dashArray) M.offices.push(l);
    else if (l instanceof L.Marker && l.options.icon?.options?.className === 'opin') M.offices.push(l);
    else if (l instanceof L.Marker && l.options.icon?.options?.className === 'tgt') M.targets.push(l);
  });
  map.on('layeradd', e => { const l = e.layer; if (l instanceof L.GeoJSON && typeof l.options.style === 'function' && l.options.interactive !== false && !M.county) { M.county = l; wrapCounty(l); } });
  apply();
  control();
}
const prevAfter = X._after;
X._after = (view, sub) => { if (prevAfter) prevAfter(view, sub); if (view === 'map') setTimeout(attach, 0); };
