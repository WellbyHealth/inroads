// Scorecard: every referral source, scored and mapped. Mirrors the site's scorecard, on your real data.
// Left: a relationship map (line weight = referral volume, dots = new referrals this month, dashed = going quiet).
// Right: the selected source (share of their referrals, new clients, revenue started, last referral,
// referrals by month, and the two-way balance of referrals you sent vs. they sent). Below: every source.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const SC = { mode: 'mom', sel: null, all: false };
const PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mShort = k => k ? MON[+k.slice(5, 7) - 1] : '';
const artOf = t => /hospital/i.test(t) && !/rehab/i.test(t) ? 'g-hospital-cut' : /rehab/i.test(t) ? 'g-rehab-cut' : /physician|office|clinic/i.test(t) ? 'g-office-cut' : /skilled|nursing|assisted|living/i.test(t) ? 'g-nursing-cut' : 'g-clipboard-cut';
const money = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k' : '$' + Math.round(v);
const isSent = a => a.kind === 'sentref' && a.status === 'done';

function rows() {
  const { S, daysSince } = W();
  const m = S.months, last3 = new Set(m.slice(9)), prevQ = new Set(m.slice(6, 9));
  const admits = new Map(), hasAdmits = (S.referrals.rows || []).some(r => r.admits != null);
  for (const r of S.referrals.rows || []) if (last3.has(r.month) && r.admits != null) admits.set(r.key, (admits.get(r.key) || 0) + r.admits);
  const sent = new Map();
  for (const a of S.activity) if (isSent(a) && daysSince(a.doneAt || a.at) <= 92) sent.set(a.sourceId, (sent.get(a.sourceId) || 0) + (a.count || 1));
  const out = S.settings.outbound || {}, value = +S.settings.clientValue || 0;
  const list = S.scored.filter(s => s.total12 || sent.has(s.p.id)).map(s => {
    const id = s.p.id, refs = s.last3, cur = SC.mode === 'mom' ? s.h[11] : s.last3, prev = SC.mode === 'mom' ? s.h[10] : s.prior3;
    const lastIdx = s.h.reduce((a, v, i) => v ? i : a, -1), firstIdx = s.h.findIndex(v => v > 0);
    const ad = admits.get(id) ?? null;
    let status = 'Active', tone = 'ok';
    if (firstIdx >= 9 && refs) { status = 'New'; tone = 'new'; }
    else if (!refs) { status = lastIdx >= 0 ? `Quiet since ${mShort(m[lastIdx])}` : 'No referrals yet'; tone = 'quiet'; }
    else if (s.status === 'Protect') { status = 'Slowing'; tone = 'warn'; }
    return { s, id, refs, cur, prev, chg: prev ? Math.round(100 * (cur - prev) / prev) : cur ? null : 0, admits: ad, revenue: ad != null && value ? ad * value : null,
      sent: sent.get(id) || 0, outbound: +out[id] || 0, share: +out[id] ? Math.min(1, refs / +out[id]) : null, lastIdx, firstIdx, status, tone };
  }).sort((a, b) => b.refs - a.refs || b.s.total12 - a.s.total12);
  list.forEach((r, i) => { r.color = i < PAL.length ? PAL[i] : null; });
  return { list, hasAdmits, value, total: list.reduce((a, r) => a + r.refs, 0) };
}

function mapSvg(D) {
  const { esc, IMG } = W();
  const nodes = D.list.filter(r => r.refs || r.tone === 'quiet').slice(0, 5);
  if (!nodes.length) return '<div class="scEmpty muted">Upload referral history to see your relationship map.</div>';
  const Wd = 1000, H = 600, cx = 500, cy = 520, max = Math.max(1, ...nodes.map(n => n.refs));
  // Biggest sources nearest the middle of the arc; nodes spread evenly so labels never collide.
  const order = []; nodes.forEach((n, i) => (i % 2 ? order.push(n) : order.unshift(n)));
  const N = order.length;
  const pos = order.map((n, i) => { const t = N === 1 ? 0.5 : i / (N - 1); return { n, x: Wd * (0.11 + 0.78 * t), y: H * (0.78 - 0.46 * Math.sin(Math.PI * (0.08 + 0.84 * t)) + (i % 2 ? 0.10 : -0.04)) }; });
  const q = (p, t) => { const c = { x: (cx + p.x) / 2, y: Math.max(p.y, cy) + 6 }; return { x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * c.x + t * t * cx, y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * c.y + t * t * cy, c }; };
  const lines = pos.map(p => { const { c } = q(p, 0), quiet = p.n.tone === 'quiet' || p.n.tone === 'warn', sel = p.n.id === SC.sel;
    const dots = Math.min(3, p.n.s.h[11]); const ds = [...Array(dots)].map((_, k) => q(p, (k + 1) / (dots + 1)));
    return `<path d="M${p.x.toFixed(1)} ${(p.y + 34).toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${cx} ${cy}" fill="none" stroke="${p.n.color}" stroke-opacity="${sel ? 0.95 : 0.55}" stroke-width="${(2 + 9 * p.n.refs / max).toFixed(1)}" stroke-linecap="round" ${quiet ? 'stroke-dasharray="2 12"' : ''}/>
      ${ds.map(d => `<circle cx="${d.x.toFixed(1)}" cy="${(d.y + 34 * 0).toFixed(1)}" r="6" fill="#fff" stroke="${p.n.color}" stroke-width="3"/>`).join('')}`; }).join('');
  const labels = pos.map(p => `<button class="scNode ${p.n.id === SC.sel ? 'on' : ''}" data-sc="${esc(p.n.id)}" style="left:${(100 * p.x / Wd).toFixed(2)}%;top:${(100 * p.y / H).toFixed(2)}%">
      <span class="scPill"><i style="background:${p.n.color}"></i><b title="${esc(p.n.s.p.name)}">${esc(p.n.s.p.name)}</b><span title="${p.n.refs} referrals in the last 3 months">${p.n.refs}</span></span>
      <img src="${IMG(artOf(p.n.s.p.type))}" alt="" loading="lazy"></button>`).join('');
  return `<div class="scMap"><svg viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="${cx}" cy="${cy}" rx="250" ry="70" fill="none" stroke="rgba(13,39,71,.08)" stroke-dasharray="3 6"/><ellipse cx="${cx}" cy="${cy}" rx="420" ry="120" fill="none" stroke="rgba(13,39,71,.06)" stroke-dasharray="3 6"/>${lines}</svg>
    ${labels}
    <div class="scHome" style="left:50%;top:${(100 * cy / H).toFixed(2)}%"><img src="${IMG('g-house-cut')}" alt=""><span class="scOrg">Your organization <span>${D.total} referrals in</span></span></div>
    </div><div class="scLegend"><span><i class="lw"></i>Line weight = referral volume</span><span><i class="ld"></i>New referral this month</span><span><i class="lq"></i>Going quiet</span>${D.list.filter(r => r.refs || r.tone === 'quiet').length > N ? `<span>Top ${N} sources shown. All sources are in the table.</span>` : ''}</div>`;
}

function headline(r) {
  if (r.sent >= 3 && r.refs <= r.sent / 3) return ['You send far more than you get', 'warn'];
  if (r.refs >= 3 && r.sent * 3 <= r.refs && r.sent < r.refs) return ['Sends far more than it gets', 'warn'];
  if (r.tone === 'new') return [`New this quarter: first referral in ${mShort(W().S.months[r.firstIdx])}`, 'ok'];
  if (r.tone === 'quiet') return [r.lastIdx >= 0 ? `Gone quiet: no referrals since ${mShort(W().S.months[r.lastIdx])}` : 'No referrals yet', 'bad'];
  if (r.tone === 'warn') return [`Slowing: ${r.s.last3} in the last 3 months, down from ${r.s.prior3}`, 'bad'];
  if (r.chg > 0) return [`Growing: up ${r.chg}% vs last ${SC.mode === 'mom' ? 'month' : 'quarter'}`, 'ok'];
  return ['Steady partner', 'ok'];
}

function detail(D) {
  const { esc, S, fmt } = W(), r = D.list.find(x => x.id === SC.sel) || D.list[0];
  if (!r) return '<div class="card scSide"><p class="muted">No sources with referrals yet.</p></div>';
  SC.sel = r.id;
  const [hl, tone] = headline(r), m = S.months;
  const bars = SC.mode === 'mom' ? m.slice(6).map((k, i) => ({ l: mShort(k), v: r.s.h[6 + i] })) : [0, 1, 2, 3].map(q => ({ l: `${mShort(m[q * 3])}–${mShort(m[q * 3 + 2])}`, v: r.s.h.slice(q * 3, q * 3 + 3).reduce((a, b) => a + b, 0) }));
  const bmax = Math.max(1, ...bars.map(b => b.v)), last = bars.at(-1).v, prior = bars.at(-2).v;
  const cmp = prior ? (last === prior ? `Flat vs ${bars.at(-2).l}` : `${last > prior ? '+' : ''}${Math.round(100 * (last - prior) / prior)}% vs ${bars.at(-2).l}`) : last ? `New vs ${bars.at(-2).l}` : '';
  const lastRef = r.lastIdx < 0 ? 'Never' : r.lastIdx === 11 ? mShort(m[11]) : `${mShort(m[r.lastIdx])}`;
  const sentW = r.sent + r.refs ? Math.max(4, 100 * r.sent / (r.sent + r.refs)) : 50;
  return `<div class="card scSide">
    <div class="scTop"><span class="muted">${esc(r.s.p.type)}</span><span class="muted">Last 3 months</span></div>
    <h2 class="scName">${esc(r.s.p.name)}</h2><div class="scHl ${tone}">${esc(hl)}</div>
    <div class="scTile wide"><div class="scRow"><span>Your share of their referrals</span><b class="scBig">${r.share != null ? Math.round(100 * r.share) + '%' : '–'}</b></div>
      ${r.share != null ? `<div class="scBar"><i style="width:${Math.max(3, 100 * r.share).toFixed(1)}%"></i></div><p class="small muted">${r.refs} of the ~${r.outbound} patients they refer out each quarter came to you. The other ${Math.max(0, r.outbound - r.refs)} went to other agencies.</p>` : '<p class="small muted">Add how many patients they refer out a quarter (your best estimate from the discharge planner) to see your share.</p>'}
      <form class="scOut"><input type="number" min="1" name="n" placeholder="Patients they refer out per quarter" value="${r.outbound || ''}"><button class="btn sm">${r.outbound ? 'Update' : 'Save'}</button></form></div>
    <div class="scTiles">
      <div class="scTile"><span>Referrals to you</span><b class="scBig">${r.refs}</b></div>
      <div class="scTile"><span>New clients</span><b class="scBig">${r.admits != null ? r.admits : '–'}</b>${r.admits == null ? '<small class="muted">Include admits in your upload</small>' : ''}</div>
      <div class="scTile"><span>Revenue started</span><b class="scBig">${r.revenue != null ? money(r.revenue) : '–'}</b>${r.revenue == null ? `<small class="muted">${D.value ? 'Needs admits in your upload' : 'Set revenue per client above'}</small>` : ''}</div>
      <div class="scTile"><span>Last referral</span><b class="scBig">${esc(lastRef)}</b></div>
    </div>
    <div class="scTile wide"><div class="scRow"><span>Referrals by ${SC.mode === 'mom' ? 'month' : 'quarter'}</span><b class="${last >= prior ? 'up' : 'down'} small">${esc(cmp)}</b></div>
      <div class="scBars">${bars.map((b, i) => `<div><em>${b.v}</em><i style="height:${Math.round(8 + 64 * b.v / bmax)}px;${i === bars.length - 1 ? `background:${r.color || 'var(--tint)'}` : ''}"></i><span class="${i === bars.length - 1 ? 'cur' : ''}">${esc(b.l)}</span></div>`).join('')}</div></div>
    <div class="scBal"><div class="scBalT">You sent ${r.sent}, they sent ${r.refs}</div><div class="scBalBar"><i class="you" style="width:${sentW.toFixed(1)}%"></i><i class="them"></i></div>
      <div class="scBalL"><span><i class="you"></i>You sent</span><span><i class="them"></i>They sent</span><button class="btn sm ghost" id="scSent">Log a referral you sent</button></div></div>
    <div class="row" style="margin-top:12px"><button class="btn sm" id="scOpen">Open source</button><button class="btn sm ghost" data-draft="${esc(r.id)}" data-kind="email">Draft email</button></div></div>`;
}

function table(D) {
  const { esc } = W();
  const showRev = D.value && D.hasAdmits;
  return `<div class="card scTable"><table><thead><tr><th>Source</th><th class="num">Referrals</th><th class="num">Your share</th>${D.hasAdmits ? '<th class="num">New clients</th>' : ''}${showRev ? '<th class="num">Revenue</th>' : ''}<th class="num">You sent</th><th class="num">vs last ${SC.mode === 'mom' ? 'mo.' : 'qtr'}</th><th>Status</th></tr></thead><tbody>
    ${(SC.all ? D.list : D.list.slice(0, 10)).map(r => `<tr class="click ${r.id === SC.sel ? 'sel' : ''}" data-sc="${esc(r.id)}"><td><span class="scDot" style="background:${r.color || 'transparent'};${r.color ? '' : 'box-shadow:inset 0 0 0 1.5px var(--line)'}"></span><b>${esc(r.s.p.name)}</b></td>
      <td class="num">${r.refs}</td><td class="num">${r.share != null ? Math.round(100 * r.share) + '%' : '<span class="muted">–</span>'}</td>
      ${D.hasAdmits ? `<td class="num">${r.admits ?? '–'}</td>` : ''}${showRev ? `<td class="num">${r.revenue != null ? money(r.revenue) : '–'}</td>` : ''}
      <td class="num">${r.sent}</td><td class="num ${r.chg > 0 ? 'up' : r.chg < 0 ? 'down' : 'muted'}">${r.chg == null ? 'New' : r.chg === 0 ? 'Flat' : (r.chg > 0 ? '+' : '−') + Math.abs(r.chg) + '%'}</td>
      <td><span class="scSt ${r.tone}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table>
    ${D.list.length > 10 ? `<button class="btn sm ghost" id="scAll" style="margin:10px 4px 0">${SC.all ? 'Show top 10' : `Show all ${D.list.length} sources`}</button>` : ''}
    <p class="small muted" style="margin:10px 4px 0">Referrals, new clients, revenue and you sent cover the last 3 months. Your share uses your estimate of how many patients each source refers out a quarter.</p></div>`;
}

function view() {
  const { S, esc, fmt } = W(), app = document.getElementById('app');
  if (!(S.referrals.rows || []).length) {
    app.innerHTML = `<div class="head"><div><span class="eyebrow">The scorecard</span><h1>Every source, scored and mapped.</h1></div></div><div class="card empty"><img src="${W().IMG('g-scorecard-600')}" alt="" style="width:220px"><p>Upload your referral history to score every source.</p><a class="btn primary" href="#referrals">Upload referrals</a></div>`;
    return;
  }
  const D = rows();
  if (!SC.sel || !D.list.some(r => r.id === SC.sel)) SC.sel = D.list[0]?.id || null;
  app.innerHTML = `<div class="head scHead"><div><span class="eyebrow">The scorecard</span><h1>Every source, <span class="scAccent">scored and mapped.</span></h1>
      <div class="muted">Pick a source to see its trend and two-way balance.</div></div>
    <div class="scCtl"><div class="seg"><button data-m="mom" class="${SC.mode === 'mom' ? 'on' : ''}">Month over month</button><button data-m="qoq" class="${SC.mode === 'qoq' ? 'on' : ''}">Quarter over quarter</button></div>
      <form class="scVal small"><label>Revenue per new client <span class="muted">$</span><input type="number" min="0" step="100" name="v" value="${D.value || ''}" placeholder="e.g. 7500"></label><button class="btn sm ghost">Save</button></form></div></div>
    <div class="scGrid"><div class="card scMapCard"><div class="scTop"><span class="muted">Relationship map</span><span class="muted">Last 3 months</span></div>${mapSvg(D)}</div>${detail(D)}</div>
    ${table(D)}`;
  bind(D);
}

function bind(D) {
  const { S, post, toast, openSource, refreshView } = W(), app = document.getElementById('app');
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { SC.mode = b.dataset.m; view(); });
  const all = document.getElementById('scAll'); if (all) all.onclick = () => { SC.all = !SC.all; view(); };
  app.querySelectorAll('[data-sc]').forEach(el => el.onclick = () => { SC.sel = el.dataset.sc; view(); if (innerWidth < 1000) app.querySelector('.scSide')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const saveSettings = async patch => { const r = await post('saveSettings', { settings: patch }); S.settings = { ...S.settings, ...r.settings }; view(); };
  app.querySelector('.scVal').onsubmit = e => { e.preventDefault(); saveSettings({ clientValue: +e.target.v.value || 0 }).then(() => toast('Revenue per client saved')).catch(er => toast(er.message)); };
  const out = app.querySelector('.scOut');
  if (out) out.onsubmit = e => { e.preventDefault(); saveSettings({ outbound: { ...(S.settings.outbound || {}), [SC.sel]: +e.target.n.value || 0 } }).then(() => toast('Saved. Your share is updated.')).catch(er => toast(er.message)); };
  const op = document.getElementById('scOpen'); if (op) op.onclick = () => openSource(SC.sel);
  const sentBtn = document.getElementById('scSent');
  if (sentBtn) sentBtn.onclick = async () => {
    const s = S.scoredById.get(SC.sel); if (!s) return;
    sentBtn.disabled = true;
    try { const r = await post('addActivity', { activity: { sourceId: s.p.id, sourceName: s.p.name, kind: 'sentref', status: 'done', subject: `Referred a client to ${s.p.name}` } }); S.activity = r.activity; toast('Logged a referral you sent', { label: 'Undo', fn: async () => { const u = await post('updateActivity', { activity: { id: r.item.id, status: 'skipped' } }); S.activity = u.activity; view(); } }); view(); }
    catch (e) { toast(e.message); sentBtn.disabled = false; }
  };
  // Draft buttons use the app's own handler via the drawer: open the source and press its draft button.
  app.querySelectorAll('.scSide [data-draft]').forEach(b => b.onclick = () => { openSource(b.dataset.draft); setTimeout(() => document.querySelector(`#drawer [data-draft="${CSS.escape(b.dataset.draft)}"][data-kind="email"]`)?.click(), 120); });
}

X.scorecard = view;
if (W()?.KIND) W().KIND.sentref = 'Referral you sent';
else addEventListener('load', () => { if (W()?.KIND) W().KIND.sentref = 'Referral you sent'; });

// Results keeps its summary; point its scorecard section at the full page.
const prevAfter = X._after;
X._after = (v, sub) => {
  if (prevAfter) prevAfter(v, sub);
  if (W()?.KIND && !W().KIND.sentref) W().KIND.sentref = 'Referral you sent';
  if (v !== 'results') return;
  const h = document.querySelector('#scorecard h2');
  if (h && !document.getElementById('scLink')) h.insertAdjacentHTML('afterend', '<a id="scLink" class="small" href="#scorecard" style="margin-left:10px">Open the full scorecard</a>');
};
