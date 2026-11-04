// Wellby pilot app (vanilla JS). Market = national public data; referrals/activity = the agency's own data.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n ?? 0).toLocaleString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const phoneFmt = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || ''; };

const S = { me: null, settings: {}, referrals: { rows: [], uploads: [] }, activity: [], contacts: {}, flows: {}, market: null, index: null, offices: [], orgs: [], byId: new Map(), scored: [], months: [], view: 'today', mapState: null, srcFilter: { q: '', group: 'all', status: 'all', sort: 'priority' }, scoreMode: 'mom' };

// ---------- API ----------
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (r.status === 401) { location.href = '/login'; throw new Error('signed out'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
const post = (action, extra) => api('/api/data', { action, ...extra });
function toast(msg, act) {
  const t = $('#toast'); t.innerHTML = esc(msg) + (act ? ` <button class="tact">${esc(act.label)}</button>` : ''); t.classList.add('show'); clearTimeout(t._h);
  if (act) t.querySelector('.tact').onclick = async () => { t.classList.remove('show'); try { await act.fn(); } catch (e) { toast(e.message); } };
  t._h = setTimeout(() => t.classList.remove('show'), act ? 6000 : 2600);
}
const isSkip = a => String(a.kind || '').startsWith('skip');

// ---------- Types & scoring ----------
const GROUPS = {
  'Hospitals': ['Hospital', 'Rehab hospital', 'LTAC hospital', 'Psychiatric hospital'],
  'Post-acute': ['Skilled nursing', 'Assisted living', 'Home health agency', 'Hospice'],
  'Physicians': ['Physician: geriatrics', 'Physician: neurology', 'Physician: cardiology', 'Physician: PM&R', 'Physician: internal medicine', 'Physician: family medicine'],
  'Other': ['Case management', 'Clinic', 'Other source'],
};
const groupOf = t => Object.keys(GROUPS).find(g => GROUPS[g].includes(t)) || 'Other';
// How well each kind of referral source fits the agency, by the agency's type of care (0-1).
const CARE = { home_care: 'Home care', home_health: 'Home health', hospice: 'Hospice', snf: 'Skilled nursing', rehab: 'Rehab', assisted_living: 'Assisted living', home_infusion: 'Home infusion', other: 'Post-acute care' };
const careType = () => CARE[S.settings.careType] ? S.settings.careType : 'home_care';
const careLabel = () => CARE[careType()];
const FITS = {
  home_health: { 'Hospital': 1, 'Rehab hospital': .95, 'Skilled nursing': .9, 'LTAC hospital': .85, 'Physician: geriatrics': .85, 'Physician: internal medicine': .75, 'Physician: family medicine': .7, 'Physician: cardiology': .7, 'Physician: neurology': .7, 'Physician: PM&R': .75, 'Assisted living': .7, 'Case management': .6, 'Hospice': .4, 'Home health agency': .2, 'Clinic': .45, 'Psychiatric hospital': .3, 'Other source': .5 },
  hospice: { 'Hospital': .95, 'Skilled nursing': .95, 'Assisted living': .9, 'Physician: geriatrics': .9, 'Physician: internal medicine': .8, 'Physician: cardiology': .8, 'Physician: neurology': .8, 'Physician: family medicine': .7, 'Home health agency': .8, 'LTAC hospital': .8, 'Case management': .7, 'Rehab hospital': .5, 'Physician: PM&R': .4, 'Hospice': .2, 'Clinic': .4, 'Psychiatric hospital': .3, 'Other source': .5 },
  snf: { 'Hospital': 1, 'LTAC hospital': .85, 'Case management': .7, 'Physician: PM&R': .7, 'Rehab hospital': .6, 'Physician: geriatrics': .6, 'Physician: neurology': .6, 'Physician: internal medicine': .5, 'Physician: cardiology': .5, 'Assisted living': .5, 'Physician: family medicine': .4, 'Home health agency': .4, 'Hospice': .3, 'Skilled nursing': .2, 'Clinic': .3, 'Psychiatric hospital': .3, 'Other source': .5 },
  assisted_living: { 'Skilled nursing': .85, 'Rehab hospital': .85, 'Physician: geriatrics': .85, 'Hospital': .8, 'Case management': .8, 'Home health agency': .7, 'Physician: internal medicine': .6, 'Physician: family medicine': .6, 'Physician: neurology': .6, 'Hospice': .5, 'LTAC hospital': .5, 'Physician: cardiology': .4, 'Physician: PM&R': .4, 'Assisted living': .2, 'Clinic': .4, 'Psychiatric hospital': .3, 'Other source': .5 },
  home_infusion: { 'Hospital': 1, 'Home health agency': .9, 'Physician: internal medicine': .8, 'LTAC hospital': .7, 'Physician: cardiology': .6, 'Skilled nursing': .6, 'Rehab hospital': .6, 'Clinic': .6, 'Case management': .6, 'Physician: family medicine': .5, 'Physician: neurology': .5, 'Physician: geriatrics': .5, 'Hospice': .4, 'Assisted living': .4, 'Physician: PM&R': .3, 'Psychiatric hospital': .2, 'Other source': .5 },
};
FITS.rehab = FITS.snf; FITS.other = FITS.home_health;
const fitFor = t => (FITS[careType()] || FIT)[t] ?? .4;
const FIT = { 'Hospital': 1, 'Rehab hospital': .95, 'Skilled nursing': .9, 'LTAC hospital': .85, 'Assisted living': .85, 'Physician: geriatrics': .85, 'Case management': .75, 'Hospice': .65, 'Physician: neurology': .65, 'Home health agency': .6, 'Physician: PM&R': .6, 'Physician: cardiology': .5, 'Physician: internal medicine': .45, 'Physician: family medicine': .4, 'Psychiatric hospital': .35, 'Clinic': .3, 'Other source': .5 };
const STATUS_COLOR = { Protect: '#C0262D', Grow: '#EE8B4B', Healthy: '#1F7A4D', Open: '#9DB4D3' };
const IMG = n => `/img/${n}.webp`;
// Source-group palette (validated: lightness, chroma, CVD separation, contrast). Status colors stay reserved for relationship state.
const GROUP_COLOR = { 'Hospitals': '#2F6DB5', 'Post-acute': '#D9692C', 'Physicians': '#B52E92', 'Other': '#6E9A1F' };
const GROUP_ART = { 'Hospitals': 'g-cl-rehab-cut', 'Post-acute': 'g-cl-nursing-cut', 'Physicians': 'g-cl-clipboard-cut', 'Other': 'g-cl-envelope-cut' };
const SEQ = ['#EEF4FD', '#D3E3F8', '#A9C8EE', '#6F9FDC', '#3F77C2', '#1E4F8F', '#0D2747']; // sequential, one hue light->dark
const artFor = t => IMG(GROUP_ART[groupOf(t)] || 'g-cl-envelope-cut');
const fmtShort = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

// ---------- Win flows: a playbook per source type, stages from first contact to regular referrer ----------
const STAGES = ['Targeted', 'Introduced', 'Met', 'First referral', 'Regular'];
const PLAYBOOKS = { // [kind, step, day offset from start; null = after the first referral]
  'Hospitals': [['email', 'Intro email to case management', 0], ['visit', 'Drop-in visit with materials', 7], ['visit', 'Lunch-and-learn for the discharge team', 21], ['call', 'Follow-up call', 35], ['email', 'Thank-you after the first referral', null]],
  'Post-acute': [['email', 'Intro email to the social worker or director', 0], ['visit', 'Visit and meet the team', 7], ['visit', 'Offer an in-service for staff', 21], ['call', 'Follow-up call', 35], ['email', 'Thank-you after the first referral', null]],
  'Physicians': [['email', 'Intro email to the office manager', 0], ['visit', 'Drop off materials and meet the staff', 7], ['visit', 'Lunch for the office', 21], ['call', 'Follow-up call', 35], ['email', 'Thank-you after the first referral', null]],
  'Other': [['email', 'Intro email', 0], ['call', 'Intro call', 5], ['visit', 'Visit', 14], ['call', 'Follow-up call', 30], ['email', 'Thank-you after the first referral', null]],
};
const playbookFor = t => PLAYBOOKS[groupOf(t)] || PLAYBOOKS.Other;
function flowState(id) {
  const f = S.flows[id]; if (!f) return null;
  const sc = S.scoredById?.get(id), startM = f.startedAt.slice(0, 7);
  const refsSince = sc ? sc.h.reduce((a, v, i) => a + (S.months[i] >= startM ? v : 0), 0) : 0;
  const activeMonths = sc ? sc.h.slice(9).filter(v => v > 0).length : 0;
  const done = f.steps.filter(st => st.done);
  let stage = 0;
  if (done.length) stage = 1;
  if (done.some(st => st.kind === 'visit')) stage = 2;
  if (refsSince > 0) stage = 3;
  if (refsSince >= 3 && activeMonths >= 2) stage = 4;
  const steps = f.steps.map((st, i) => ({ ...st, i, due: st.offset == null ? (stage >= 3 ? today() : null) : addDays(f.startedAt, st.offset) }));
  const next = steps.find(st => !st.done && !st.skipped && st.due);
  return { f, stage, steps, next, refsSince };
}
const snap = p => ({ name: p.name, type: p.type, tx: p.tx, city: p.city, address: p.address, zip: p.zip, phone: p.phone, lat: p.lat, lng: p.lng, size: p.size, beds: p.beds });
async function saveFlow(id, flow) { const s = S.scoredById.get(id); const r = await post('saveFlow', { sourceId: id, flow: flow && { ...flow, p: flow.p || (s && snap(s.p)) } }); S.flows = r.flows; }
async function startFlow(id) {
  const s = S.scoredById.get(id); if (!s) return;
  const flow = { startedAt: today(), steps: playbookFor(s.p.type).map(([kind, label, offset]) => ({ kind, label, offset })), p: snap(s.p) };
  await saveFlow(id, flow);
  toast('Win flow started. Drafting the first step…');
  await makeDraft(id, flow.steps[0].kind, true, 0);
  refreshView(); openSource(id); toast('Win flow started. The first message is ready to approve.');
}
async function stepAction(id, i, act) {
  const fs = flowState(id); if (!fs) return;
  const st = fs.f.steps[i];
  if (act === 'draft') return makeDraft(id, st.kind, false, i);
  if (act === 'skip') st.skipped = true;
  if (act === 'done') {
    st.done = today();
    const nxt = flowState(id)?.next;
    const r = await post('addActivity', { activity: { sourceId: id, sourceName: S.scoredById.get(id)?.p.name, kind: st.kind, subject: st.label, status: 'done', flowStep: i, followUp: nxt?.due || '' } }); S.activity = r.activity;
  }
  await saveFlow(id, fs.f); rescore();
  refreshView(); if ($('#drawer').classList.contains('open')) openSource(id);
  toast(act === 'done' ? 'Step logged. Next step scheduled.' : 'Step skipped');
}
function refreshView() { const v = (window.WellbyExt || {})[S.view] || { today: viewToday, flows: viewFlows, results: viewResults, contacts: viewContacts }[S.view]; if (v) v(); navBadges(); const X = window.WellbyExt || {}; if (v && X._after) try { X._after(S.view); } catch (e) { console.error(e); } }
const stageBar = stage => `<div class="stages">${STAGES.map((n, i) => `<span class="${i < stage ? 'done' : i === stage ? 'on' : ''}">${n}</span>`).join('')}</div>`;
const rchips = why => `<div class="rchips">${why.map(w => `<span class="rchip">${esc(w)}</span>`).join('')}</div>`;
const stepVerb = st => st.kind === 'visit' ? 'Visit plan' : st.kind === 'call' ? 'Call plan' : 'Draft email';
function flowSection(id) {
  const s = S.scoredById.get(id), fs = flowState(id);
  if (!fs) { const pb = playbookFor(s.p.type); return `<div class="section flowbox"><h3>Win flow</h3><p class="small" style="margin:0 0 10px">A ${pb.length}-step playbook for ${esc(groupOf(s.p.type).toLowerCase())}: ${pb.map(x => esc(x[1].toLowerCase())).join(', ')}. Wellby drafts each step when it's due, and you approve it.</p><button class="btn primary" data-flow="${esc(id)}">Start win flow</button></div>`; }
  return `<div class="section flowbox"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Win flow</h3><button class="btn sm ghost" data-stopflow="${esc(id)}">Stop flow</button></div>${stageBar(fs.stage)}
    <ol class="steps">${fs.steps.map(st => { const isNext = fs.next === st, late = isNext && st.due < today();
      return `<li class="${st.done ? 'done' : st.skipped ? 'skipped' : isNext ? 'next' : ''}"><div><b>${esc(st.label)}</b><div class="muted small ${late ? 'down' : ''}">${st.done ? `Done ${fmtShort(st.done)}` : st.skipped ? 'Skipped' : st.due ? `${late ? 'Overdue · was due' : 'Due'} ${fmtShort(st.due)}` : 'After the first referral'}</div></div>
      ${isNext && S.activity.some(a => a.sourceId === id && a.status === 'draft' && a.flowStep === st.i) ? '<div class="small"><span class="chip st-Grow">Draft ready</span> Approve it under Outreach history below, or on Today.</div>' : isNext ? `<div class="row"><button class="btn sm primary" data-stepact="draft" data-sid="${esc(id)}" data-idx="${st.i}">${stepVerb(st)}</button><button class="btn sm" data-stepact="done" data-sid="${esc(id)}" data-idx="${st.i}">Mark done</button><button class="btn sm ghost" data-stepact="skip" data-sid="${esc(id)}" data-idx="${st.i}">Skip</button></div>` : ''}</li>`; }).join('')}</ol></div>`;
}

// ---------- Results: did outreach win referrals? ----------
function resultsData() {
  const M = S.months, firstTouch = new Map();
  const done = S.activity.filter(a => a.status === 'done' && !isSkip(a));
  for (const a of done) { const d = (a.doneAt || a.at).slice(0, 10); if (!firstTouch.has(a.sourceId) || firstTouch.get(a.sourceId) > d) firstTouch.set(a.sourceId, d); }
  const worked = S.scored.filter(s => firstTouch.has(s.p.id)), others = S.scored.filter(s => !firstTouch.has(s.p.id) && s.total12);
  const sum = (list, a, b) => list.reduce((t, s) => t + s.h.slice(a, b).reduce((x, y) => x + y, 0), 0);
  let wonBack = 0, refsAfter = 0;
  for (const s of worked) {
    const i = M.indexOf(firstTouch.get(s.p.id).slice(0, 7)); if (i < 0) continue;
    const quietBefore = s.h.slice(0, i).some(v => v > 0) && s.h.slice(Math.max(0, i - 3), i).every(v => !v);
    if (quietBefore && s.h.slice(i, i + 3).some(v => v > 0)) wonBack++;
    refsAfter += s.h.slice(i).reduce((a, b) => a + b, 0);
  }
  const waits = S.activity.filter(a => a.status === 'done' && a.drafter && a.doneAt).map(a => (Date.parse(a.doneAt) - Date.parse(a.at)) / 36e5).sort((a, b) => a - b);
  const by = {};
  for (const a of done) { const r = by[a.by] || (by[a.by] = { touches: 0, ids: new Set() }); r.touches++; r.ids.add(a.sourceId); }
  const people = Object.entries(by).map(([k, r]) => { let refs = 0; for (const id of r.ids) { const s = S.scoredById.get(id), i = M.indexOf((firstTouch.get(id) || '').slice(0, 7)); if (s && i >= 0) refs += s.h.slice(i).reduce((a, b) => a + b, 0); } return { who: String(k).split('@')[0], touches: r.touches, sources: r.ids.size, refs }; }).sort((a, b) => b.refs - a.refs || b.touches - a.touches);
  return { worked: worked.length, w3: sum(worked, 9, 12), w0: sum(worked, 6, 9), o3: sum(others, 9, 12), o0: sum(others, 6, 9), wonBack, refsAfter, touches: done.length,
    medianWait: waits.length ? waits[Math.floor(waits.length / 2)] : null, people,
    series: M.map((m, i) => ({ m, worked: worked.reduce((t, s) => t + s.h[i], 0), other: others.reduce((t, s) => t + s.h[i], 0) })),
    stages: STAGES.map((st, i) => ({ label: st, value: Object.keys(S.flows).filter(id => flowState(id)?.stage === i).length, color: i >= 3 ? '#1F7A4D' : '#2F6DB5' })) };
}
const change = (a, b) => b ? `<span class="${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(100 * (a - b) / b))}%</span> vs prior 3 months` : a ? '<span class="up">new</span> vs prior 3 months' : '&nbsp;';
function viewResults() {
  const r = resultsData(), noRefs = !(S.referrals.rows || []).length;
  const max = Math.max(1, ...r.series.map(x => x.worked + x.other)), W = 640, H = 170, bw = W / 12;
  const chart = `<svg class="chart" viewBox="0 0 ${W} ${H + 22}" preserveAspectRatio="none" role="img" aria-label="Referrals by month from worked sources and from the rest of the market">${r.series.map((x, i) => { const hw = H * .92 * x.worked / max, ho = H * .92 * x.other / max, bx = i * bw + bw * .18; return `<g data-tip="${esc(`<b>${monthLabel(x.m)}</b><br>${x.worked} from sources you worked<br>${x.other} from the rest`)}"><rect x="${bx}" y="${H - hw - ho}" width="${bw * .64}" height="${Math.max(0, ho - (ho && hw ? 2 : 0))}" rx="2" fill="#A9C8EE"/><rect x="${bx}" y="${H - hw}" width="${bw * .64}" height="${hw}" rx="2" fill="#0D2747"/><text x="${i * bw + bw / 2}" y="${H + 16}" font-size="10" text-anchor="middle" fill="#667085">${monthLabel(x.m)}</text></g>`; }).join('')}</svg>`;
  $('#app').innerHTML = `<div class="head"><div class="hero-head"><img src="${IMG('g-cl-stk-score-cut')}" alt="" style="width:120px"><div><span class="eyebrow">Prove it worked</span><h1>Results</h1><div class="muted">Referrals from the sources your team works, compared with the rest of your market.</div></div></div><button class="btn no-print" onclick="print()">Print summary</button></div>
    ${sampleNotice()}
    ${noRefs ? `<div class="notice info"><img src="${IMG('g-cl-clipboard-cut')}" alt=""><div>Results need your referral history. <a href="#referrals">Upload it</a> (or load sample data) and every touch is measured against the referrals that followed.</div></div>` : ''}
    <div class="grid kpis">
      <div class="card kpi c1"><img src="${IMG('g-cl-stk-score-cut')}" alt=""><div class="l">Referrals from sources you worked (3 mo)</div><div class="v">${fmt(r.w3)}</div><div class="d">${change(r.w3, r.w0)}</div></div>
      <div class="card kpi c2"><img src="${IMG('g-cl-stk-market-cut')}" alt=""><div class="l">From the rest of your market (3 mo)</div><div class="v">${fmt(r.o3)}</div><div class="d">${change(r.o3, r.o0)}</div></div>
      <div class="card kpi c3"><img src="${IMG('g-cl-stk-reconnect-cut')}" alt=""><div class="l">Quiet sources won back</div><div class="v">${fmt(r.wonBack)}</div><div class="d muted">referred again within 3 months of outreach</div></div>
      <div class="card kpi c4"><img src="${IMG('g-cl-stk-plan-cut')}" alt=""><div class="l">Referrals per 10 touches</div><div class="v">${r.touches ? (10 * r.refsAfter / r.touches).toFixed(1) : '–'}</div><div class="d muted">${fmt(r.touches)} touches logged${r.medianWait != null ? ` · drafts approved in ${r.medianWait < 1 ? 'under an hour' : Math.round(r.medianWait) + ' h'} (median)` : ''}</div></div>
    </div>
    <div class="cols">
      <div class="card"><div class="head"><h2>Referrals by month</h2><div class="legend"><span><i class="dot" style="background:#0D2747"></i>Sources you worked (${fmt(r.worked)})</span><span><i class="dot" style="background:#A9C8EE"></i>The rest</span></div></div>${chart}</div>
      <div class="card"><h2>Win flows by stage</h2>${Object.keys(S.flows).length ? hbars(r.stages) : `<div class="empty small"><img src="${IMG('g-cl-stk-market-cut')}" alt="" style="width:140px">No win flows yet. Start one from <a href="#today">Today</a>.</div>`}</div>
    </div>
    <div class="card" style="margin-top:18px"><h2>By marketer</h2>${r.people.length ? `<table><thead><tr><th>Marketer</th><th class="num">Touches</th><th class="num">Sources worked</th><th class="num">Referrals since first touch</th></tr></thead><tbody>${r.people.map(x => `<tr><td><b>${esc(x.who)}</b></td><td class="num">${fmt(x.touches)}</td><td class="num">${fmt(x.sources)}</td><td class="num">${fmt(x.refs)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Approve or log outreach and each marketer\'s results show here.</div>'}</div>`;
}

// ---------- Win flows board ----------
function viewFlows() {
  const ids = Object.keys(S.flows).filter(id => S.scoredById.has(id));
  const cols = STAGES.map((st, i) => ({ st, items: ids.map(id => ({ id, fs: flowState(id) })).filter(x => x.fs.stage === i) }));
  $('#app').innerHTML = `<div class="head"><div class="hero-head"><img src="${IMG('g-cl-stk-plan-cut')}" alt="" style="width:96px"><div><span class="eyebrow">Win</span><h1>Win flows</h1><div class="muted">${ids.length} target${ids.length === 1 ? '' : 's'} in a flow, from first contact to regular referrer.</div></div></div><a class="btn" href="#map">Find targets</a></div>
    ${ids.length ? `<div class="board">${cols.map(c => `<div class="bcol"><div class="bhead"><b>${c.st}</b><span class="chip">${c.items.length}</span></div>${c.items.map(({ id, fs }) => { const p = S.scoredById.get(id).p, late = fs.next && fs.next.due < today();
      return `<div class="bcard" data-src="${esc(id)}"><div class="name">${esc(p.name)}</div><div class="muted small">${esc(p.type)}${p.city ? ' · ' + esc(p.city) : ''}</div>${fs.next ? `<div class="small ${late ? 'down' : ''}" style="margin-top:6px">Next: ${esc(fs.next.label)} · ${late ? 'overdue' : fmtShort(fs.next.due)}</div>` : `<div class="small muted" style="margin-top:6px">${fs.stage >= 3 ? 'Keep the relationship warm' : 'Waiting on a first referral'}</div>`}</div>`; }).join('') || '<div class="muted small" style="padding:6px 4px">None yet</div>'}</div>`).join('')}</div>`
    : `<div class="card empty"><img src="${IMG('g-cl-stk-market-cut')}" alt="" style="width:220px">No win flows yet. Pick a target on <a href="#today">Today</a> or the <a href="#map">map</a> and tap <b>Start win flow</b>.</div>`}`;
  bindCommon($('#app'));
}

// ---------- Contacts: a CRM-style table of every relationship ----------
const CF = { mode: 'people', q: '', cat: 'all', group: 'none', sort: 'last', dir: -1 };
const daysSince = d => d ? Math.round((Date.parse(today()) - Date.parse(d.slice(0, 10))) / 864e5) : null;
const agoText = d => { const n = daysSince(d); return n == null ? 'Never' : n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 45 ? `${n} days ago` : fmtShort(d.slice(0, 10)); };
const KIND = { email: 'Email', call: 'Call', visit: 'Visit', lunch: 'Lunch / in-service', meeting: 'Meeting', dropoff: 'Drop-off', sentref: 'Sent them a client', sheet: 'Partner sheet shared' };
function crmData() {
  const touch = new Map(), byEmail = new Map();
  for (const a of S.activity) {
    if (a.status !== 'done' || isSkip(a)) continue;
    const d = (a.doneAt || a.at).slice(0, 10), t = touch.get(a.sourceId) || { count: 0 };
    t.count++; if (!t.last || d > t.last) Object.assign(t, { last: d, kind: a.kind, by: a.by, subject: a.subject }); touch.set(a.sourceId, t);
    if (a.to) { const k = a.to.toLowerCase(), e = byEmail.get(k); if (!e || d > e.last) byEmail.set(k, { last: d, kind: a.kind }); }
  }
  const ids = new Set([...Object.keys(S.contacts).filter(id => (S.contacts[id] || []).length), ...touch.keys(), ...Object.keys(S.flows), ...S.scored.filter(x => x.total12).map(x => x.p.id)]);
  const orgs = [...ids].map(id => { const s = S.scoredById.get(id); if (!s) return null; const t = touch.get(id) || { count: 0 }, fs = flowState(id);
    return { id, s, t, fs, cat: groupOf(s.p.type), stage: fs ? STAGES[fs.stage] : '', contacts: S.contacts[id] || [], next: fs?.next ? { due: fs.next.due, label: fs.next.label } : s.due ? { due: s.due, label: 'Follow-up' } : null, owner: t.by ? String(t.by).split('@')[0] : '' }; }).filter(Boolean);
  const people = orgs.flatMap(o => o.contacts.map(c => { const own = c.email && byEmail.get(c.email.toLowerCase()); return { ...o, c, last: own?.last || o.t.last || '', kind: own?.kind || o.t.kind || '', key: o.id + c.id }; }));
  return { orgs: orgs.map(o => ({ ...o, last: o.t.last || '', kind: o.t.kind || '', key: o.id })), people };
}
function viewContacts() {
  const f = CF, { orgs, people } = crmData(), list0 = f.mode === 'people' ? people : orgs;
  const stale = orgs.filter(o => o.t.last && daysSince(o.t.last) > 60).length, recent = orgs.filter(o => o.t.last && daysSince(o.t.last) <= 30).length;
  const due = orgs.filter(o => o.next && o.next.due <= today()).length, never = orgs.filter(o => !o.t.last).length;
  const cats = ['all', ...Object.keys(GROUPS)];
  $('#app').innerHTML = `<div class="head"><div class="hero-head"><div><span class="eyebrow">Relationships</span><h1>Contacts</h1><div class="muted">Everyone you know at your referral sources, and every source you're working, with when you last reached out.</div></div></div>
      <div class="row"><button class="btn primary" id="cAdd">Add contact</button><button class="btn" id="cCsv">Export CSV</button></div></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="l">People</div><div class="v">${fmt(people.length)}</div><div class="d muted">at ${fmt(orgs.filter(o => o.contacts.length).length)} organizations</div></div>
      <div class="card kpi"><div class="l">Contacted in the last 30 days</div><div class="v">${fmt(recent)}</div><div class="d muted">of ${fmt(orgs.length)} relationships</div></div>
      <div class="card kpi"><div class="l">No touch in 60+ days</div><div class="v ${stale ? 'down' : ''}">${fmt(stale)}</div><div class="d muted">${fmt(never)} never contacted</div></div>
      <div class="card kpi"><div class="l">Next steps due</div><div class="v">${fmt(due)}</div><div class="d muted">follow-ups and win-flow steps</div></div>
    </div>
    <div id="cForm2"></div>
    <div class="filters" style="align-items:center">
      <div class="seg" id="cMode"><button data-m="people" class="${f.mode === 'people' ? 'on' : ''}">People</button><button data-m="orgs" class="${f.mode === 'orgs' ? 'on' : ''}">Organizations</button></div>
      <div class="seg" id="cCat">${cats.map(c => `<button data-c="${c}" class="${f.cat === c ? 'on' : ''}">${c === 'all' ? 'All' : c}</button>`).join('')}</div>
      <input id="cq" placeholder="Search name, organization, role or email" value="${esc(f.q)}" style="flex:1;min-width:220px">
      <label class="small" style="margin:0;display:flex;gap:6px;align-items:center;white-space:nowrap">Group by<select id="cGroup" style="width:auto"><option value="none">None</option><option value="cat" ${f.group === 'cat' ? 'selected' : ''}>Category</option><option value="status" ${f.group === 'status' ? 'selected' : ''}>Relationship</option><option value="stage" ${f.group === 'stage' ? 'selected' : ''}>Win-flow stage</option><option value="owner" ${f.group === 'owner' ? 'selected' : ''}>Owner</option></select></label>
      <span class="muted small" id="ccnt"></span></div>
    <div class="card" style="padding:0;overflow:auto"><table class="crm"><thead><tr id="cHead"></tr></thead><tbody id="ctb"></tbody></table></div>`;
  const P = f.mode === 'people';
  const cols = P ? [['name', 'Name'], ['org', 'Organization'], ['status', 'Relationship'], ['stage', 'Stage'], ['last', 'Last contacted'], ['next', 'Next step'], ['refs', 'Referrals 12 mo', 'num'], ['owner', 'Owner'], ['', 'Email · phone']]
    : [['org', 'Organization'], ['people', 'Contacts'], ['status', 'Relationship'], ['stage', 'Stage'], ['last', 'Last contacted'], ['touches', 'Touches', 'num'], ['next', 'Next step'], ['refs', 'Referrals 12 mo', 'num'], ['owner', 'Owner']];
  $('#cHead').innerHTML = cols.map(([k, l, c]) => `<th ${k ? `data-cs="${k}"` : ''} class="${c || ''}">${l}${f.sort === k ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('');
  const val = (r, k) => ({ name: r.c?.name || '', org: r.s.p.name, status: r.s.status, stage: r.fs ? r.fs.stage : -1, last: r.last || '', next: r.next?.due || '9999', refs: r.s.total12, owner: r.owner, touches: r.t.count, people: r.contacts.length })[k];
  const gkey = r => f.group === 'cat' ? r.cat : f.group === 'status' ? r.s.status : f.group === 'stage' ? (r.stage || 'Not in a flow') : f.group === 'owner' ? (r.owner || 'Unassigned') : '';
  const render = () => {
    const q = f.q.toLowerCase().trim();
    const list = list0.filter(r => (f.cat === 'all' || r.cat === f.cat) && (!q || `${r.c?.name || ''} ${r.c?.role || ''} ${r.c?.email || ''} ${r.s.p.name} ${r.s.p.city} ${r.contacts.map(c => c.name).join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => { if (f.group !== 'none') { const g = gkey(a).localeCompare(gkey(b)); if (g) return g; } const x = val(a, f.sort), y = val(b, f.sort); if (f.sort === 'last' && (!x || !y) && x !== y) return x ? -1 : 1; return (x > y ? 1 : x < y ? -1 : 0) * f.dir; });
    $('#ccnt').textContent = `${fmt(list.length)} ${P ? 'people' : 'organizations'}`;
    let g = null; const rows = [];
    for (const r of list.slice(0, 500)) {
      if (f.group !== 'none' && gkey(r) !== g) { g = gkey(r); rows.push(`<tr class="grp"><td colspan="${cols.length}">${esc(g)} <span class="muted">${list.filter(x => gkey(x) === g).length}</span></td></tr>`); }
      const n = daysSince(r.last), lastCell = `<td><div class="${n != null && n > 60 ? 'down' : ''}">${agoText(r.last)}</div><div class="muted small">${r.kind ? esc(KIND[r.kind] || r.kind) : ''}</div></td>`;
      const nextCell = `<td>${r.next ? `<div class="${r.next.due < today() ? 'down' : ''}">${r.next.due <= today() ? (r.next.due < today() ? 'Overdue' : 'Today') : fmtShort(r.next.due)}</div><div class="muted small">${esc(r.next.label)}</div>` : '<span class="muted">–</span>'}</td>`;
      const org = `<td><div class="orgn">${esc(r.s.p.name)}</div><div class="muted small">${esc(r.s.p.type)}${r.s.p.city ? ' · ' + esc(r.s.p.city) : ''}</div></td>`;
      const common = `<td><span class="chip st-${r.s.status}">${r.s.status}</span></td><td>${r.stage ? esc(r.stage) : '<span class="muted">–</span>'}</td>`;
      rows.push(P ? `<tr class="click" data-src="${esc(r.id)}"><td><b>${esc(r.c.name || '(no name)')}</b><div class="muted small">${esc(r.c.role || '')}</div></td>${org}${common}${lastCell}${nextCell}<td class="num">${r.s.total12 || '–'}</td><td class="small">${esc(r.owner) || '<span class="muted">–</span>'}</td><td class="small">${r.c.email ? `<a href="mailto:${esc(r.c.email)}" onclick="event.stopPropagation()">${esc(r.c.email)}</a>` : ''}${r.c.phone ? `<div class="muted">${esc(r.c.phone)}</div>` : ''}</td></tr>`
        : `<tr class="click" data-src="${esc(r.id)}">${org}<td class="small">${r.contacts.length ? esc(r.contacts.map(c => c.name || c.email).slice(0, 3).join(', ')) + (r.contacts.length > 3 ? ` +${r.contacts.length - 3}` : '') : '<span class="muted">No contact yet</span>'}</td>${common}${lastCell}<td class="num">${r.t.count || '–'}</td>${nextCell}<td class="num">${r.s.total12 || '–'}</td><td class="small">${esc(r.owner) || '<span class="muted">–</span>'}</td></tr>`);
    }
    $('#ctb').innerHTML = rows.join('') || `<tr><td colspan="${cols.length}"><div class="empty small" style="padding:30px">${P ? 'No contacts yet. Add the case managers, discharge planners and office managers you work with, or add them from any source\'s page.' : 'No relationships yet. Start a win flow or log a touch and the organization shows here.'}</div></td></tr>`;
    if (list.length > 500) $('#ctb').insertAdjacentHTML('beforeend', `<tr><td colspan="${cols.length}" class="muted small">Showing 500. Narrow the search to see more.</td></tr>`);
    bindCommon($('#ctb'));
  };
  render();
  $('#cMode').querySelectorAll('button').forEach(b => b.onclick = () => { f.mode = b.dataset.m; if (f.mode === 'orgs' && f.sort === 'name') f.sort = 'org'; viewContacts(); });
  $('#cCat').querySelectorAll('button').forEach(b => b.onclick = () => { f.cat = b.dataset.c; $('#cCat').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  $('#cGroup').onchange = e => { f.group = e.target.value; render(); };
  let t; $('#cq').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; render(); }, 150); };
  document.querySelectorAll('#cHead [data-cs]').forEach(th => th.onclick = () => { const k = th.dataset.cs; f.dir = f.sort === k ? -f.dir : (['name', 'org', 'owner', 'next'].includes(k) ? 1 : -1); f.sort = k; viewContacts(); });
  $('#cCsv').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['name', 'role', 'email', 'phone', 'organization', 'type', 'category', 'city', 'relationship', 'stage', 'last_contacted', 'last_touch', 'touches', 'next_step', 'next_due', 'referrals_12mo', 'owner'];
    const rows = (people.length ? people : orgs).map(r => [r.c?.name, r.c?.role, r.c?.email, r.c?.phone, r.s.p.name, r.s.p.type, r.cat, r.s.p.city, r.s.status, r.stage, r.last, KIND[r.kind] || r.kind, r.t.count, r.next?.label, r.next?.due, r.s.total12, r.owner].map(q).join(','));
    download('wellby-contacts.csv', [head.join(','), ...rows].join('\n'));
  };
  $('#cAdd').onclick = () => {
    const opts = S.scored.slice().sort((a, b) => b.priority - a.priority).slice(0, 3000), byLabel = new Map(opts.map(x => [`${x.p.name}${x.p.city ? ' — ' + x.p.city : ''}`, x.p.id]));
    $('#cForm2').innerHTML = `<div class="card" style="margin-bottom:14px"><h2>Add a contact</h2><form id="cNew" class="grid" style="grid-template-columns:2fr 1fr 1fr;gap:8px">
      <input name="org" list="cOrgs" placeholder="Organization (start typing)" required autocomplete="off"><datalist id="cOrgs">${[...byLabel.keys()].map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      <input name="name" placeholder="Name" required><input name="role" placeholder="Role (e.g. discharge planner)">
      <input name="email" type="email" placeholder="Email"><input name="phone" placeholder="Phone">
      <div class="row"><button class="btn primary">Save contact</button><button class="btn ghost" type="button" id="cCancel">Cancel</button></div></form><p class="err small" id="cErr"></p></div>`;
    $('#cCancel').onclick = () => { $('#cForm2').innerHTML = ''; };
    $('#cNew').onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), id = byLabel.get(v.org);
      if (!id) { $('#cErr').textContent = 'Pick the organization from the list.'; return; }
      const r = await post('saveContact', { sourceId: id, contact: { name: v.name, role: v.role, email: v.email, phone: v.phone } }); S.contacts = r.contacts; toast('Contact saved'); viewContacts(); };
    $('[name=org]', $('#cNew')).focus();
  };
}

// ---------- Setup checklist ----------
function checklist() {
  if (S.me.role !== 'admin' || S.me.super) return '';
  try { if (localStorage.getItem('wb_ck_' + S.me.org) === 'x') return ''; } catch {}
  const top = planItems(1)[0];
  const items = [[S.offices.length > 0, 'Add your offices', '<a href="#settings/setup">Add offices</a>'], [Object.keys(S.flows).length > 0, 'Start your first win flow', top ? `<button class="btn sm primary" data-flow="${esc(top.p.id)}">Start on ${esc(top.p.name.slice(0, 28))}</button>` : ''], [(S.referrals.rows || []).length > 0, 'Add your referral history, or try sample data', '<a href="#referrals">Referrals</a>']];
  if (items.every(x => x[0])) return '';
  return `<div class="card checklist"><div class="row" style="justify-content:space-between"><b>Get set up · ${items.filter(x => x[0]).length} of ${items.length} done</b><button class="btn sm ghost" id="ckHide">Hide</button></div>
    <ol>${items.map(([ok, label, act]) => `<li class="${ok ? 'ok' : ''}"><span class="ck">${ok ? '✓' : ''}</span><span>${label}</span>${ok ? '' : act}</li>`).join('')}<li><span class="ck"></span><span>Invite your team (optional)</span><a href="#settings">Team</a></li></ol></div>`;
}
const bindChecklist = () => { const b = $('#ckHide'); if (b) b.onclick = () => { try { localStorage.setItem('wb_ck_' + S.me.org, 'x'); } catch {} b.closest('.checklist').remove(); }; };

// ---------- Tooltip + small chart components ----------
const tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl);
document.addEventListener('mouseover', e => { const t = e.target.closest?.('[data-tip]'); if (!t) { tipEl.style.display = 'none'; return; } tipEl.innerHTML = t.dataset.tip; tipEl.style.display = 'block'; });
document.addEventListener('mousemove', e => { if (tipEl.style.display === 'block') { tipEl.style.left = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8) + 'px'; tipEl.style.top = (e.clientY + 16) + 'px'; } });
function donut(items, { size = 148, center = '', sub = '', onKey } = {}) {
  const live = items.filter(i => i.value > 0); const total = live.reduce((a, b) => a + b.value, 0);
  const r = size / 2, ir = r * .64, mid = (r + ir) / 2;
  let a0 = -Math.PI / 2; const pt = (a, rad) => `${(r + rad * Math.cos(a)).toFixed(2)},${(r + rad * Math.sin(a)).toFixed(2)}`;
  const tip = i => esc(`<b>${esc(i.label)}</b><br>${fmt(i.value)} · ${total ? Math.round(100 * i.value / total) : 0}%`);
  const arcs = live.length === 1 ? `<circle cx="${r}" cy="${r}" r="${mid}" fill="none" stroke="${live[0].color}" stroke-width="${r - ir}" data-tip="${tip(live[0])}"/>`
    : live.map(i => { const a1 = a0 + 2 * Math.PI * i.value / total; const L = a1 - a0 > Math.PI ? 1 : 0;
      const d = `M${pt(a0, r)}A${r},${r} 0 ${L} 1 ${pt(a1, r)}L${pt(a1, ir)}A${ir},${ir} 0 ${L} 0 ${pt(a0, ir)}Z`; a0 = a1;
      return `<path d="${d}" fill="${i.color}" stroke="#fff" stroke-width="2" data-tip="${tip(i)}"/>`; }).join('');
  return `<div class="donut"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(items.map(i => `${i.label} ${i.value}`).join(', '))}">${total ? arcs : `<circle cx="${r}" cy="${r}" r="${mid}" fill="none" stroke="#EEEDE8" stroke-width="${r - ir}"/>`}<text x="${r}" y="${r + 2}" text-anchor="middle" class="dn-c">${center}</text><text x="${r}" y="${r + 20}" text-anchor="middle" class="dn-s">${sub}</text></svg>
    <ul class="lg">${items.map(i => `<li ${onKey ? `data-key="${esc(i.key || i.label)}" class="click"` : ''}><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${fmt(i.value)}</b></li>`).join('')}</ul></div>`;
}
function hbars(items, { color = '#2F6DB5', clickable = false, unit = '' } = {}) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="hbars">${items.map(i => `<div class="hb${clickable ? ' click' : ''}" ${clickable ? `data-hb="${esc(i.key ?? i.label)}"` : ''} data-tip="${esc(`<b>${esc(i.label)}</b><br>${fmt(i.value)}${unit}`)}"><span class="hb-l">${esc(i.label)}</span><span class="hb-t"><i style="width:${Math.max(1.5, 100 * i.value / max)}%;background:${i.color || color}"></i></span><span class="hb-v">${fmt(i.value)}</span></div>`).join('')}</div>`;
}
const groupItems = counts => Object.keys(GROUPS).map(g => ({ key: g, label: g, color: GROUP_COLOR[g], value: GROUPS[g].reduce((a, t) => a + (counts[t] || 0), 0) }));

function miles(a, b, c, d) {
  const R = 3958.8, toR = x => x * Math.PI / 180;
  const dLat = toR(c - a), dLng = toR(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const monthKey = d => d.toISOString().slice(0, 7);
function lastMonths(n, endKey) {
  const [y, m] = endKey.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(monthKey(d)); }
  return out;
}
function monthLabel(k) { const [y, m] = k.split('-'); return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + (m === '01' ? ` ’${y.slice(2)}` : ''); }

function rescore() {
  const rows = S.referrals.rows || [];
  // Reference month: latest month in the data, else last full calendar month.
  const lastFull = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return monthKey(d); })();
  const maxMonth = rows.reduce((m, r) => r.month > m ? r.month : m, '');
  const end = maxMonth || lastFull;
  S.months = lastMonths(12, end);
  const idx = Object.fromEntries(S.months.map((m, i) => [m, i]));
  const hist = new Map(); // key -> [12]
  const extra = new Map(); // custom sources not in market
  for (const r of rows) {
    if (!(r.month in idx)) continue;
    const h = hist.get(r.key) || Array(12).fill(0);
    h[idx[r.month]] += r.count; hist.set(r.key, h);
    if (!S.byId.has(r.key) && !extra.has(r.key)) extra.set(r.key, { id: r.key, name: r.name || r.key.replace(/^x:/, ''), type: 'Other source', tx: 'From your referral data', address: '', city: '', zip: '', lat: null, lng: null, size: 50, custom: true });
  }
  const inMarket = new Set(S.market.providers.map(p => p.id));
  for (const [id, f] of Object.entries(S.flows || {})) if (!inMarket.has(id) && !extra.has(id) && f.p?.name) extra.set(id, { ...f.p, id });
  const lastTouch = new Map(), dueFollow = new Map();
  for (const a of S.activity) {
    if (a.status === 'done' || a.status === 'approved') { const t = (a.doneAt || a.approvedAt || a.at).slice(0, 10); if (!lastTouch.has(a.sourceId) || lastTouch.get(a.sourceId) < t) lastTouch.set(a.sourceId, t); }
    if (a.followUp && a.status === 'done' && !a.followDone) { const cur = dueFollow.get(a.sourceId); if (!cur || cur > a.followUp) dueFollow.set(a.sourceId, a.followUp); }
  }
  // A newer touch clears an older follow-up
  for (const [sid, due] of dueFollow) { const lt = lastTouch.get(sid); if (lt && lt > due) dueFollow.delete(sid); }
  S.ctx = { hist, dueFollow, lastTouch, now: today() };
  const all = [...S.market.providers, ...extra.values()];
  S.scored = all.map(scoreOne);
  S.scoredById = new Map(S.scored.map(s => [s.p.id, s]));
}

function scoreOne(p) {
  const { hist, dueFollow, lastTouch, now } = S.ctx;
    const h = hist.get(p.id) || Array(12).fill(0);
    const last3 = h.slice(9).reduce((a, b) => a + b, 0), prior3 = h.slice(6, 9).reduce((a, b) => a + b, 0);
    const last6 = last3 + prior3, prior6 = h.slice(0, 6).reduce((a, b) => a + b, 0), total12 = last6 + prior6;
    const near = p.lat != null && S.offices.length ? nearestOffice(p.lat, p.lng) : null;
    const dist = near ? near.d : null, radius = near ? near.o.radiusMiles : 20;
    const prox = dist == null ? .6 : dist <= radius ? 1 - .6 * (dist / radius) : Math.max(0, .4 - .4 * (dist - radius) / radius);
    const sales = S.me?.orgSales;
    const fit = sales ? icpType(p) : fitFor(p.type);
    const size = (p.size ?? 50) / 100;
    const potential = sales ? icp(p) : Math.round(100 * (.45 * fit + .30 * size + .25 * prox));
    let status, priority; const why = [];
    let lastIdx = -1; h.forEach((v, i) => { if (v) lastIdx = i; });
    if (sales && total12 === 0) { status = 'Open'; priority = potential * .9; why.push(p.type); if ((p.sites || 1) >= 2) why.push(`${p.sites} sites: ${p.sites >= 6 ? 'Enterprise' : 'Team'} prospect`); if (p.official) why.push(`Decision maker: ${p.official}${p.officialTitle ? ', ' + p.officialTitle : ''}`); if (p.city) why.push(`${p.city}, ${p.st}`); }
    else if (total12 === 0) { status = 'Open'; priority = potential * .9; why.push(fit >= .8 ? `${p.type.replace('Physician: ', '')}: a core ${careLabel().toLowerCase()} referrer` : p.type); if (size >= .75) why.push(p.beds ? `${p.beds} beds` : 'large practice/campus'); }
    else if ((last3 === 0 && prior3 + prior6 > 0) || (prior3 >= 2 && last3 < .6 * prior3)) { status = 'Protect'; priority = 60 + .4 * potential + Math.min(20, (prior3 + prior6) * 1.5); why.push(last3 === 0 ? `No referrals in 3 months (last: ${monthLabel(S.months[lastIdx])})` : `Down to ${last3} from ${prior3} vs prior 3 months`); }
    else if (potential >= 55 && last6 < 6) { status = 'Grow'; priority = 30 + .5 * potential; why.push(`${last6} referrals in 6 months; room to grow`); }
    else { status = 'Healthy'; priority = 10 + .3 * potential; why.push(`${last6} referrals in 6 months`); }
    if (dist != null) why.push(`${dist.toFixed(1)} mi from ${near.o.label}`);
    const due = dueFollow.get(p.id); const lt = lastTouch.get(p.id);
    if (due && due <= now) { priority += 25; why.unshift(`Follow-up due ${due}`); }
    if (lt && addDays(lt, 7) > now && !(due && due <= now)) priority -= 40;
    return { p, h, last3, prior3, last6, prior6, total12, dist, office: near?.o.label || '', prox, fit, size, potential, status, priority: Math.max(0, Math.min(100, Math.round(priority))), why, lastTouch: lt, due };
  }
function ensureScored(p) {
  if (!S.scoredById.has(p.id)) { S.scoredById.set(p.id, scoreOne(p)); S.byId.set(p.id, p); }
  return S.scoredById.get(p.id);
}

// ---------- Boot ----------
function nearestOffice(lat, lng) {
  let best = null;
  for (const o of S.offices) { const d = miles(o.lat, o.lng, lat, lng); if (!best || d < best.d) best = { d, o }; }
  return best;
}
// Wellby sales workspace: the prospects are agencies nationwide (the top ranked, or every agency in chosen states).
async function loadProspects(progress) {
  S.offices = [];
  const ir = await fetch('/api/market?file=prospects'); const pidx = ir.ok ? await ir.json() : null;
  const states = (S.settings.sales?.states || []).filter(st => pidx?.states?.[st]);
  const files = states.length ? states.flatMap(st => Array.from({ length: pidx.states[st].parts }, (_, k) => `pp=${st}-${k}`)) : ['file=top'];
  const F = pidx?.fields || [], providers = [], counts = {}, seen = new Set();
  // Researched business contacts (website, BD people) for the first sales list, keyed by NPI.
  const cr = await fetch('/api/market?file=contacts'); const research = cr.ok ? await cr.json() : {};
  let done = 0;
  await Promise.all(files.map(async f => {
    const r = await fetch(`/api/market?${f}`);
    if (r.ok) for (const row of await r.json()) {
      const p = Object.fromEntries(F.map((k, j) => [k, row[j]]));
      if (seen.has(p.id)) continue; seen.add(p.id);
      if (research[p.id]) p.research = research[p.id];
      providers.push(p); counts[p.type] = (counts[p.type] || 0) + 1;
    }
    progress?.(++done, files.length);
  }));
  const label = states.length ? states.join(' · ') : 'Top agencies nationwide';
  S.market = { territory: { label, center: [39.5, -98.35] }, builtAt: pidx?.builtAt || '', sources: pidx?.sources || {}, counts, providers, sales: { states, total: pidx ? Object.values(pidx.states).reduce((a, c) => a + c.n, 0) : 0, stateCounts: pidx?.states || {} } };
  S.byId = new Map(providers.map(p => [p.id, p]));
  nameIndex = null;
}
// How well an agency fits Wellby: agencies with field BD reps first, multi-site groups (Team and Enterprise) up.
const icpType = p => /home care|personal care|private duty|companion/i.test(`${p.tx || ''} ${p.name}`) ? .95
  : p.type === 'Home health agency' || p.type === 'Hospice' ? 1 : p.type === 'Skilled nursing' ? .75 : p.type === 'Rehab hospital' ? .7 : p.type === 'Assisted living' ? .6 : .5;
const icpSites = n => n >= 6 ? 1 : n >= 2 ? .85 : .5;
// Not first customers: government, hospital systems and the national chains (they buy enterprise software top-down).
const ICP_OUT = /department|county|state of|hospital|health system|healthcare system|medical center|university|amedisys|bayada|maxim healthcare|centerwell|kindred|enhabit|lhc group|aveanna|encompass|vitas|gentiva|interim|brookdale|accentcare|elara|addus/i;
function icp(p) { const base = 100 * (.45 * icpType(p) + .25 * icpSites(p.sites || 1) + .2 * ((p.size ?? 30) / 100) + .1 * (p.official ? 1 : 0)) + (p.research?.people?.length ? 3 : 0); return Math.min(100, Math.round(ICP_OUT.test(p.name) || p.research?.status === 'acquired' ? base * .6 : base)); }
async function loadMarket(progress) {
  if (S.me?.orgSales) return loadProspects(progress);
  S.offices = (S.settings.offices || []).filter(o => o.lat);
  const idx = S.index;
  const empty = { territory: { label: 'No offices yet', center: [39.5, -98.35] }, builtAt: idx?.builtAt || '', sources: idx?.sources || {}, counts: {}, providers: [] };
  if (!idx || !S.offices.length) { S.market = empty; return; }
  const parts = [];
  for (const [fips, c] of Object.entries(idx.counties)) {
    const near = S.offices.some(o => miles(o.lat, o.lng, c.lat, c.lng) <= o.radiusMiles * 1.3 + 45);
    if (near) for (let k = 0; k < (c.parts || 1); k++) parts.push(`${fips}-${k}`);
  }
  const F = idx.fields, providers = [], counts = {};
  let done = 0, i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < parts.length) {
      const part = parts[i++];
      const r = await fetch(`/api/market?part=${part}`); if (!r.ok) continue;
      for (const row of await r.json()) {
        const p = Object.fromEntries(F.map((f, j) => [f, row[j]]));
        const n = nearestOffice(p.lat, p.lng);
        if (!n || n.d > n.o.radiusMiles * 1.25) continue;
        providers.push(p); counts[p.type] = (counts[p.type] || 0) + 1;
      }
      progress?.(++done, parts.length);
    }
  }));
  S.market = { territory: { label: S.offices.map(o => o.label).join(' · '), center: [S.offices[0].lat, S.offices[0].lng] }, builtAt: idx.builtAt, sources: idx.sources, counts, providers };
  S.byId = new Map(providers.map(p => [p.id, p]));
  nameIndex = null;
}
async function boot() {
  try {
    const r = await fetch('/api/data');
    if (r.status === 401) { location.href = '/login'; return; }
    const data = await r.json();
    if (r.status === 409 && data.needWorkspace) { S.me = data.me; renderMe(); return viewNoWorkspace(); }
    if (r.status === 402 && data.locked) { S.me = data.me; renderMe(); return viewPaywall(); }
    Object.assign(S, { me: data.me, settings: data.settings, referrals: data.referrals, activity: data.activity, contacts: data.contacts, flows: data.flows || {} });
    renderMe();
    const ir = await fetch('/api/market');
    S.index = ir.ok ? await ir.json() : null;
    await loadMarket((d, n) => { $('#app').innerHTML = `<div class="loading">Loading your market… ${Math.round(100 * d / n)}%</div>`; });
  } catch (e) { $('#app').innerHTML = `<div class="card empty">Couldn't load: ${esc(e.message)}</div>`; return; }
  rescore();
  if (!S._routed) { window.addEventListener('hashchange', route); S._routed = true; }
  route();
  if (S.me.mustChange && !location.hash.startsWith('#settings')) toast('Please set a new password in Settings.');
}
// Settings → Workspaces: switch, archive (hides it from the switcher; nothing is deleted) or restore.
let wsShowArchived = false;
function drawWsList() {
  const el = $('#wsList'); if (!el) return;
  const all = S.orgs || [], arch = all.filter(o => o.archived && o.id !== S.me.org);
  const list = all.filter(o => wsShowArchived ? o.archived && o.id !== S.me.org : !o.archived || o.id === S.me.org);
  el.innerHTML = list.map(o => `<div class="row" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--line-soft)"><span><b>${esc(o.name)}</b> ${o.demo ? '<span class="chip">demo</span>' : '<span class="chip st-Healthy">customer</span>'} ${o.id === S.me.org ? '<span class="chip st-Open">current</span>' : ''}${o.archived ? ' <span class="chip">archived</span>' : ''}</span><span class="row" style="gap:6px">${o.id !== S.me.org && !o.archived ? `<button class="btn sm" data-ws="${esc(o.id)}">Switch</button><button class="btn sm" data-arch="${esc(o.id)}">Archive</button>` : ''}${o.archived && o.id !== S.me.org ? `<button class="btn sm" data-unarch="${esc(o.id)}">Restore</button>` : ''}</span></div>`).join('')
    + `<div class="row small" style="padding:8px 0 0;border-top:1px solid var(--line-soft)"><a href="#" id="wsArchTog">${wsShowArchived ? 'Back to active workspaces' : `Archived (${arch.length})`}</a><span class="muted">Archived workspaces are hidden from the switcher. Nothing is deleted.</span></div>`;
  const act = async (body, msg) => { try { const r = await api('/api/workspaces', body); S.orgs = r.orgs; drawWsList(); renderMe(); toast(msg); } catch (e) { toast(e.message); } };
  el.querySelectorAll('[data-ws]').forEach(b => b.onclick = async () => { await api('/api/workspaces', { action: 'switch', id: b.dataset.ws }); location.hash = '#map'; $('#app').innerHTML = '<div class="loading">Switching workspace…</div>'; boot(); });
  el.querySelectorAll('[data-arch]').forEach(b => b.onclick = () => act({ action: 'archive', id: b.dataset.arch }, 'Archived'));
  el.querySelectorAll('[data-unarch]').forEach(b => b.onclick = () => act({ action: 'archive', id: b.dataset.unarch, archived: false }, 'Restored'));
  $('#wsArchTog').onclick = e => { e.preventDefault(); wsShowArchived = !wsShowArchived; drawWsList(); };
}
async function renderMe() {
  let ws = '';
  if (S.me.super) {
    try { const w = await api('/api/workspaces'); S.orgs = w.orgs; ws = `<select id="wsSel" title="Workspace" style="width:auto;height:36px;padding:0 10px">${w.orgs.filter(o => !o.archived || o.id === S.me.org).map(o => `<option value="${esc(o.id)}" ${o.id === S.me.org ? 'selected' : ''}>${esc(o.name)}${o.demo ? ' (demo)' : ''}</option>`).join('')}<option value="__new">+ New workspace…</option></select>`; } catch {}
  }
  const ac = S.me.access || {};
  const chip = ac.status === 'trial' ? `<a class="trialchip" href="#settings/billing">Free trial · ${ac.daysLeft} day${ac.daysLeft === 1 ? '' : 's'} left</a>` : ac.status === 'past_due' ? '<a class="trialchip warn" href="#settings/billing">Payment issue</a>' : '';
  $('#me').innerHTML = `${ws}${chip}<span>${esc(S.me.name)}</span><button id="logout">Sign out</button>`;
  $('#logout').onclick = async () => { await api('/api/auth?action=logout', {}); location.href = '/login'; };
  const sel = $('#wsSel');
  if (sel) sel.onchange = async () => { if (sel.value === '__new') { location.hash = '#settings/workspaces'; if (S.market) route(); else viewNoWorkspace(); return; } await api('/api/workspaces', { action: 'switch', id: sel.value }); location.hash = '#map'; $('#app').innerHTML = '<div class="loading">Switching workspace…</div>'; boot(); };
}
// ---------- Billing ----------
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
async function startCheckout(btn) { btn.disabled = true; try { const r = await api('/api/billing', { action: 'checkout' }); location.href = r.url; } catch (e) { toast(e.message); btn.disabled = false; } }
async function openPortal(btn) { btn.disabled = true; try { const r = await api('/api/billing', { action: 'portal' }); location.href = r.url; } catch (e) { toast(e.message); btn.disabled = false; } }
function viewPaywall() {
  const admin = S.me.role === 'admin', ended = S.me.access?.status === 'canceled';
  $('#app').innerHTML = `<div class="card paywall"><img src="${IMG('g-cl-house-cut')}" alt=""><span class="eyebrow">${ended ? 'Subscription ended' : 'Free trial ended'}</span><h1>Keep your referral plan going</h1>
    <p class="muted">Your ${esc(S.me.orgName || 'agency')} workspace is saved: offices, referral data, contacts and outreach history. ${admin ? 'Subscribe to pick up right where you left off.' : 'Ask your admin to subscribe to keep using Wellby.'}</p>
    ${admin ? '<button class="btn primary wide" id="subNow">Subscribe</button>' : ''}</div>`;
  if (admin) $('#subNow').onclick = e => startCheckout(e.target);
  // Just back from checkout? A sync may already have unlocked the workspace.
  api('/api/billing').then(b => { if (!b.access.locked) { S.me.access = b.access; boot(); } }).catch(() => {});
}
function billingCard() {
  const ac = S.me.access || {};
  if (S.me.role !== 'admin' || ['demo', 'managed', 'none'].includes(ac.status)) return '';
  const line = ac.status === 'trial' ? `<b>Free trial</b> · ${ac.daysLeft} day${ac.daysLeft === 1 ? '' : 's'} left, ends ${fmtDate(ac.trialEndsAt)}`
    : ac.status === 'active' ? `<b>Subscribed</b>${ac.periodEnd ? ` · renews ${fmtDate(ac.periodEnd)}` : ''}`
    : ac.status === 'past_due' ? '<b class="down">Payment failed</b> · update your card to keep access' : '<b>Not subscribed</b>';
  return `<div class="card" id="billing" style="margin-bottom:14px"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>Plan and billing</h2><p class="small" style="margin:0 0 10px">${line}</p></div><img src="${IMG('g-cl-stk-plan-cut')}" alt="" style="width:64px"></div>
    <div class="row">${ac.status !== 'active' ? '<button class="btn sm primary" id="bSub">Subscribe</button>' : ''}${ac.hasCustomer ? '<button class="btn sm" id="bPortal">Manage billing and invoices</button>' : ''}</div>
    <p class="muted small" id="bNote" style="margin:10px 0 0">Secure checkout by Stripe. Cancel anytime.</p></div>`;
}
function bindBilling() {
  if ($('#bSub')) $('#bSub').onclick = e => startCheckout(e.target);
  if ($('#bPortal')) $('#bPortal').onclick = e => openPortal(e.target);
}
function viewNoWorkspace() {
  $('#app').innerHTML = `<div class="card" style="max-width:560px;margin:40px auto"><span class="eyebrow">Welcome</span><h1>Create your first workspace</h1><p class="muted">A workspace holds one agency's offices, referral data, contacts and outreach. Create one per customer or demo.</p>${workspaceForm()}</div>`;
  bindWorkspaceForm();
}
function workspaceForm() {
  return `<form id="wsForm" class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><input name="name" placeholder="Agency name (e.g. Cambridge Caregivers)" required><input name="website" placeholder="Website (optional)"><label class="small" style="margin:0;display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" name="demo" checked style="width:auto"> Demo workspace</label><button class="btn primary" style="justify-self:start">Create workspace</button></form>`;
}
function bindWorkspaceForm() {
  $('#wsForm').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api('/api/workspaces', { action: 'create', name: f.name, website: f.website, demo: !!f.demo }); location.hash = '#settings'; $('#app').innerHTML = '<div class="loading">Setting up…</div>'; boot(); };
}
// Home depends on who signs in: a new agency sets up and sees its map; liaisons get Today; owners get Results.
function homeView() {
  if (S.me.orgSales) return 'prospects';
  if (S.me.super) return 'map';
  if (!S.offices.length) return S.me.role === 'admin' ? 'settings/setup' : 'map';
  const started = Object.keys(S.flows).length || S.activity.some(a => !isSkip(a));
  if (!started) return 'map';
  return S.me.role === 'admin' ? 'results' : 'today';
}
function route() {
  const [view, sub] = (location.hash.slice(1) || homeView()).split('/');
  closeDrawer();
  const EXT = window.WellbyExt || {};
  S.view = ['today', 'map', 'sources', 'market', 'flows', 'contacts', 'results', 'referrals', 'settings'].includes(view) || EXT[view] ? view : 'map';
  S.pure = S.view === 'market';
  if (S.pure && sub === 'list') S.view = 'sources';
  if (S.view === 'market') S.view = 'map';
  document.body.classList.toggle('mapmode', S.view === 'map');
  if (S.view !== 'map' && S.lmap) { S.lmap.remove(); S.lmap = null; }
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.view === (S.pure ? 'market' : S.view === 'sources' ? 'map' : S.view)));
  $('#agencyName').textContent = S.settings.agencyName || '';
  setupSearch(); setTimeout(navBadges, 0);
  (EXT[S.view] || { today: viewToday, map: viewMap, sources: viewSources, flows: viewFlows, contacts: viewContacts, results: viewResults, referrals: viewReferrals, settings: viewSettings }[S.view])(sub);
  if (EXT._after) try { EXT._after(S.view, sub); } catch (e) { console.error(e); }
}

// ---------- Today ----------
function statusItems() { const st = { Protect: 0, Grow: 0, Healthy: 0, Open: 0 }; for (const x of S.scored) st[x.status]++; return Object.entries(st).map(([k, v]) => ({ key: k, label: k, value: v, color: STATUS_COLOR[k] })); }
function planItems(n = 12) {
  const pending = new Set(S.activity.filter(a => a.status === 'draft').map(a => a.sourceId));
  return S.scored.filter(s => !pending.has(s.p.id) && !S.flows[s.p.id] && !S.activity.some(a => a.sourceId === s.p.id && a.kind === 'skip' && a.status === 'skipped' && addDays(a.at.slice(0, 10), 30) > today()))
    .sort((a, b) => b.priority - a.priority).slice(0, n);
}
const isSample = () => (S.referrals.uploads || []).filter(u => u.mode === 'replace').at(-1)?.file === 'SAMPLE DATA';
const sampleNotice = () => isSample() ? `<div class="notice"><b>Sample data.</b> The referral numbers you're seeing are made up, on real sources in your market, so you can try the app. ${S.me.role === 'admin' ? 'Clear them on the Referrals page before uploading your own.' : ''}</div>` : '';
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
function queueItems() {
  const pending = new Set(S.activity.filter(a => a.status === 'draft').map(a => a.sourceId));
  const steps = Object.keys(S.flows).filter(id => S.scoredById.has(id) && !pending.has(id)).map(id => ({ id, fs: flowState(id) })).filter(x => x.fs.next && x.fs.next.due <= today()).sort((a, b) => a.fs.next.due.localeCompare(b.fs.next.due));
  const follow = S.scored.filter(s => s.due && s.due <= today() && !S.flows[s.p.id] && !pending.has(s.p.id));
  return { steps, follow };
}
function viewToday() {
  const noRefs = !(S.referrals.rows || []).length;
  const items = planItems();
  const drafts = S.activity.filter(a => a.status === 'draft').sort((a, b) => b.at.localeCompare(a.at));
  const { steps, follow } = queueItems();
  const goal = S.settings.weeklyGoal || 10, wk = weekStart(), doneWk = S.activity.filter(a => a.status === 'done' && !isSkip(a) && (a.doneAt || a.at).slice(0, 10) >= wk).length;
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const queueCount = drafts.length + steps.length + follow.length;
  const stepRow = ({ id, fs }) => { const p = S.scoredById.get(id).p, st = fs.next, late = st.due < today();
    return `<div class="qrow"><span class="qicon q-${st.kind}"></span><div><span class="name" data-src="${esc(id)}">${esc(p.name)}</span><div class="why ${late ? 'down' : ''}">${esc(st.label)} · ${late ? 'overdue since ' + fmtShort(st.due) : 'due today'} · ${STAGES[fs.stage]}</div></div>
      <div class="row"><button class="btn sm primary" data-stepact="draft" data-sid="${esc(id)}" data-idx="${st.i}">${stepVerb(st)}</button><button class="btn sm" data-stepact="done" data-sid="${esc(id)}" data-idx="${st.i}">Mark done</button></div></div>`; };
  const followRow = s => `<div class="qrow"><span class="qicon q-call"></span><div><span class="name" data-src="${esc(s.p.id)}">${esc(s.p.name)}</span><div class="why">Follow-up due ${fmtShort(s.due)} · ${esc(s.p.type)}</div></div>
      <div class="row"><button class="btn sm primary" data-draft="${esc(s.p.id)}" data-kind="email">Draft email</button><button class="btn sm" data-flow="${esc(s.p.id)}">Start win flow</button></div></div>`;
  $('#app').innerHTML = `
    <div class="head"><div class="hero-head"><img src="${IMG('g-cl-house-cut')}" alt=""><div><span class="eyebrow">Today in Wellby</span><h1>${hello}, ${esc(S.me.name.split(' ')[0])}</h1><div class="muted">${queueCount ? `${drafts.length} to approve · ${steps.length} flow step${steps.length === 1 ? '' : 's'} due · ${follow.length} follow-up${follow.length === 1 ? '' : 's'}` : 'Your queue is clear. Pick a target below to start winning their referrals.'}</div></div></div>
    <div class="goal"><div class="small"><b>${doneWk} of ${goal}</b> touches this week</div><div class="bar-g"><i style="width:${Math.min(100, 100 * doneWk / goal)}%"></i></div></div></div>
    ${checklist()}
    ${sampleNotice()}
    ${!S.offices.length && !S.me.orgSales ? `<div class="notice">Add your office locations in <a href="#settings/setup">Settings</a>. Wellby loads every hospital, physician and facility around each office from national public data.</div>` : ''}
    ${queueCount ? `<div class="card queue"><div class="head"><h2>Your queue</h2><span class="muted small">Approve, then send or log it. Wellby schedules the next step.</span></div>
      ${drafts.length ? `<h3>Waiting for your approval</h3><div id="drafts">${drafts.map(draftCard).join('')}</div>` : ''}
      ${steps.length ? `<h3>Win flow steps due</h3>${steps.map(stepRow).join('')}` : ''}
      ${follow.length ? `<h3>Follow-ups due</h3>${follow.map(followRow).join('')}` : ''}</div>` : ''}
    <div class="head" style="margin-top:22px"><h2 style="margin:0">Top targets</h2><span class="muted small">Ranked by score · ${noRefs ? 'fit, size and distance until you add referral history' : 'opportunity × relationship'}</span></div>
    <div class="hero-cards" style="margin-top:12px">${items.slice(0, 3).map((s, i) => `<div class="hcard">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><span class="rank">${i + 1}</span><img src="${artFor(s.p.type)}" alt=""></div>
      <div class="name" data-src="${esc(s.p.id)}">${esc(s.p.name)}</div>
      <div class="row" style="margin:6px 0"><span class="chip st-${s.status}">${s.status}</span><span class="chip">Score ${s.priority}</span><span class="chip">${esc(s.p.type)}</span></div>
      ${rchips(s.why)}
      <div class="row" style="margin-top:12px"><button class="btn sm primary" data-flow="${esc(s.p.id)}">Start win flow</button><button class="btn sm ghost" data-skip="${esc(s.p.id)}">Skip</button></div></div>`).join('')}</div>
    ${noRefs ? `<div class="notice info"><img src="${IMG('g-cl-clipboard-cut')}" alt=""><div>Your market is loaded from public data. <a href="#referrals">Add your referral history</a> so Wellby can tell who's sending you patients, who's gone quiet, and prove which outreach worked.</div></div>` : ''}
    <div class="cols" style="margin-top:18px">
      <div class="card"><div class="head"><h2>Up next</h2><span class="muted small">${S.market.providers.length ? fmt(S.market.providers.length) + ' sources in your market' : ''}</span></div>
        <ul class="plan">${items.slice(3).map((s, i) => `<li>
          <div class="rank">${i + 4}</div>
          <div><div><span class="name" data-src="${esc(s.p.id)}">${esc(s.p.name)}</span> <span class="chip st-${s.status}">${s.status}</span></div>
            <div class="why">Score ${s.priority} · ${esc(s.p.type)}${s.p.city ? ' · ' + esc(s.p.city) : ''} · ${s.why.map(esc).join(' · ')}</div></div>
          <div class="row"><button class="btn sm" data-flow="${esc(s.p.id)}">Start win flow</button><button class="btn sm ghost" data-skip="${esc(s.p.id)}" title="Hide for 30 days">Skip</button></div>
        </li>`).join('')}</ul>
      </div>
      <div>${kpisCompact()}${recentDone()}</div>
    </div>`;
  bindCommon($('#app')); bindChecklist();
}
function kpisCompact() {
  const quiet = S.scored.filter(s => s.status === 'Protect').length, active = S.scored.filter(s => s.last3 > 0).length;
  return `<div class="card"><h2>Your market</h2><div class="mini"><div><b>${fmt(active)}</b><span>active sources (3 mo)</span></div><div><b class="${quiet ? 'down' : ''}">${fmt(quiet)}</b><span>gone quiet or dropping</span></div><div><b>${fmt(Object.keys(S.flows).length)}</b><span>in a win flow</span></div></div><a class="btn sm" href="#results" style="margin-top:10px">See results</a></div>`;
}
function recentDone() {
  const done = S.activity.filter(a => a.status === 'done').sort((a, b) => (b.doneAt || b.at).localeCompare(a.doneAt || a.at)).slice(0, 6);
  if (!done.length) return '';
  return `<div class="card" style="margin-top:14px"><h2>Recent outreach</h2>${done.map(a => `<div class="row" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--line)"><span><span class="name" data-src="${esc(a.sourceId)}" style="cursor:pointer;font-weight:600">${esc(a.sourceName)}</span> <span class="muted small">${esc(KIND[a.kind] || a.kind)} · ${agoText(a.doneAt || a.at)}</span></span><span class="muted small">${a.followUp ? 'Follow up ' + fmtShort(a.followUp) : ''}</span></div>`).join('')}</div>`;
}
function draftCard(a) {
  const s = S.scoredById.get(a.sourceId);
  const contacts = S.contacts[a.sourceId] || [];
  const isEmail = a.kind === 'email';
  return `<div class="draft" data-id="${esc(a.id)}">
    <div class="meta"><div><span class="name" data-src="${esc(a.sourceId)}" style="cursor:pointer;font-weight:600">${esc(a.sourceName)}</span> ${s ? `<span class="chip st-${s.status}">${s.status}</span>` : ''}</div><span class="muted small">${esc(a.kind)} · ${a.drafter === 'claude' ? 'drafted by Claude' : 'template'}</span></div>
    ${isEmail ? `<input class="d-to" placeholder="To (email)" value="${esc(a.to || contacts.find(c => c.email)?.email || '')}" list="cl-${esc(a.id)}"><datalist id="cl-${esc(a.id)}">${contacts.filter(c => c.email).map(c => `<option value="${esc(c.email)}">${esc(c.name)}</option>`).join('')}</datalist>` : ''}
    <input class="d-subj" value="${esc(a.subject)}" style="margin:6px 0">
    <textarea class="d-body">${esc(a.body)}</textarea>
    <div class="row" style="margin-top:8px;justify-content:space-between">
      <label class="small" style="margin:0;display:flex;gap:6px;align-items:center">Follow up <input type="date" class="d-fu" value="${esc(a.followUp || addDays(today(), 7))}" style="width:auto;padding:4px 6px"></label>
      <div class="row"><button class="btn sm ghost" data-act="discard">Discard</button>
      ${isEmail ? `<button class="btn sm" data-act="copy">Copy</button><button class="btn sm primary" data-act="send">Approve &amp; open in ${S.settings.mailClient === 'outlook' ? 'Outlook' : S.settings.mailClient === 'default' ? 'mail app' : 'Gmail'}</button>` : `<button class="btn sm primary" data-act="done">Approve &amp; mark done</button>`}</div>
    </div></div>`;
}
function composeUrl(to, subject, body) {
  const c = S.settings.mailClient;
  if (c === 'outlook') return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (c === 'default') return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
async function makeDraft(sourceId, kind, quiet, flowStep) {
  const s = S.scoredById.get(sourceId); if (!s) return;
  const contact = (S.contacts[sourceId] || [])[0];
  const stats = { status: s.status, last6: s.last6, prior6: s.prior6, total12: s.total12, lastMonth: (() => { let k = ''; s.h.forEach((v, i) => { if (v) k = S.months[i]; }); return k; })(), lastTouch: s.lastTouch || '', why: s.why.join('; ') };
  if (!quiet) toast('Drafting…');
  const d = await api('/api/draft', { kind, source: { name: s.p.name, type: s.p.type, taxonomy: s.p.tx, city: s.p.city, address: s.p.address, distance: s.dist?.toFixed(1) }, stats, contact });
  const r = await post('addActivity', { activity: { sourceId, sourceName: s.p.name, kind, status: 'draft', subject: d.subject, body: d.body, to: contact?.email || '', reason: s.why.join('; '), drafter: d.drafter, followUp: addDays(today(), kind === 'visit' ? 14 : 7), flowStep: Number.isInteger(flowStep) ? flowStep : undefined } });
  S.activity = r.activity; rescore();
  if (!quiet) { refreshView(); if (S.view !== 'today' || $('#drawer').classList.contains('open')) openSource(sourceId); toast(d.warning || 'Draft ready for review'); }
}
async function actOnDraft(card, act) {
  const id = card.dataset.id; const a = S.activity.find(x => x.id === id);
  const to = $('.d-to', card)?.value.trim() || '', subject = $('.d-subj', card).value, body = $('.d-body', card).value, followUp = $('.d-fu', card).value;
  if (act === 'copy') { await navigator.clipboard.writeText(`${subject}\n\n${body}`); toast('Copied'); return; }
  if (act === 'send') window.open(composeUrl(to, subject, body), '_blank', 'noopener');
  const status = act === 'discard' ? 'skipped' : 'done';
  const r = await post('updateActivity', { activity: { id, to, subject, body, followUp, status } });
  S.activity = r.activity;
  if (to && act === 'send' && !(S.contacts[a.sourceId] || []).some(c => c.email === to)) {
    const c = await post('saveContact', { sourceId: a.sourceId, contact: { email: to, name: '', role: '' } }); S.contacts = c.contacts;
  }
  const fl = S.flows[a.sourceId];
  if (status === 'done' && fl && Number.isInteger(a.flowStep) && fl.steps[a.flowStep] && !fl.steps[a.flowStep].done) { fl.steps[a.flowStep].done = today(); await saveFlow(a.sourceId, fl); }
  rescore(); if (act === 'discard') toast('Draft discarded', { label: 'Undo', fn: async () => { const u = await post('updateActivity', { activity: { id, status: 'draft' } }); S.activity = u.activity; rescore(); refreshView(); toast('Draft restored'); } }); else toast(fl ? 'Logged. The next step is scheduled.' : `Logged. Follow-up set for ${fmtShort(followUp)}`);
  refreshView(); if ($('#drawer').classList.contains('open')) openSource(a.sourceId);
}
function bindCommon(root) {
  root.querySelectorAll('[data-src]').forEach(el => el.onclick = () => openSource(el.dataset.src));
  root.querySelectorAll('[data-draft]').forEach(el => el.onclick = async () => { el.disabled = true; el.textContent = 'Drafting\u2026'; try { await makeDraft(el.dataset.draft, el.dataset.kind); } catch (e) { toast(e.message); el.disabled = false; } });
  root.querySelectorAll('[data-skip]').forEach(el => el.onclick = async () => { const s = S.scoredById.get(el.dataset.skip); const r = await post('addActivity', { activity: { sourceId: s.p.id, sourceName: s.p.name, kind: 'skip', status: 'skipped' } }); S.activity = r.activity; rescore(); refreshView(); const sk = r.activity.filter(a => a.sourceId === s.p.id && a.kind === 'skip').at(-1); toast(`${s.p.name} hidden for 30 days`, sk && { label: 'Undo', fn: async () => { const u = await post('updateActivity', { activity: { id: sk.id, kind: 'skip-undone' } }); S.activity = u.activity; rescore(); refreshView(); toast('Back in your plan'); } }); });
  root.querySelectorAll('.draft [data-act]').forEach(el => el.onclick = () => actOnDraft(el.closest('.draft'), el.dataset.act).catch(e => toast(e.message)));
  root.querySelectorAll('[data-flow]').forEach(el => el.onclick = async e => { e.stopPropagation(); el.disabled = true; el.textContent = 'Starting\u2026'; try { await startFlow(el.dataset.flow); } catch (err) { toast(err.message); el.disabled = false; } });
  root.querySelectorAll('[data-stepact]').forEach(el => el.onclick = async e => { e.stopPropagation(); el.disabled = true; try { await stepAction(el.dataset.sid, +el.dataset.idx, el.dataset.stepact); } catch (err) { toast(err.message); el.disabled = false; } });
  root.querySelectorAll('[data-stopflow]').forEach(el => el.onclick = async () => { const id = el.dataset.stopflow, old = JSON.parse(JSON.stringify(S.flows[id])); await saveFlow(id, null); rescore(); refreshView(); openSource(id); toast('Win flow stopped. Outreach history is kept.', { label: 'Undo', fn: async () => { await saveFlow(id, old); rescore(); refreshView(); if ($('#drawer').classList.contains('open')) openSource(id); toast('Win flow restored'); } }); });
}

// ---------- Source drawer ----------
function spark(h) {
  const max = Math.max(1, ...h), w = 12, gap = 4;
  return `<svg class="spark" width="${h.length * (w + gap)}" height="60" role="img" aria-label="Referrals by month">${h.map((v, i) => `<rect x="${i * (w + gap)}" y="${44 - 40 * v / max}" width="${w}" height="${Math.max(1, 40 * v / max)}" rx="2" fill="${v ? '#0D2747' : '#e4e7ec'}"><title>${monthLabel(S.months[i])}: ${v}</title></rect>`).join('')}${[0, 11].map(i => `<text x="${i * (w + gap)}" y="58" font-size="9" fill="#667085">${monthLabel(S.months[i])}</text>`).join('')}</svg>`;
}
function openSource(id) {
  const s = S.scoredById.get(id); if (!s) return;
  const p = s.p, d = $('#drawer');
  const contacts = S.contacts[id] || [];
  const acts = S.activity.filter(a => a.sourceId === id && !isSkip(a)).sort((a, b) => b.at.localeCompare(a.at));
  const isNpi = /^\d{10}$/.test(p.id);
  if (S.pure) return openMarketSource(s, isNpi);
  d.innerHTML = `<button class="btn ghost close" id="dClose" aria-label="Close">✕</button>
    <img class="d-art" src="${artFor(p.type)}" alt=""><div class="muted small">${esc(p.type)}</div><h1 style="padding-right:30px">${esc(p.name)}</h1>
    <div class="row" style="margin-top:6px"><span class="chip st-${s.status}">${s.status}</span><span class="chip">Score ${s.priority}</span>${S.flows[id] ? `<span class="chip st-Open">${STAGES[flowState(id).stage]}</span>` : ''}</div>
    <div style="margin-top:10px">${rchips(s.why)}</div>
    <dl class="facts">
      ${p.address ? `<dt>Address</dt><dd>${esc(p.address)}, ${esc(p.city)} ${esc(p.zip)}${s.dist != null ? ` · ${s.dist.toFixed(1)} mi` : ''}</dd>` : ''}
      ${p.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(p.phone)}">${esc(phoneFmt(p.phone))}</a></dd>` : ''}
      <dt>Specialty</dt><dd>${esc(p.tx)}</dd>
      ${p.beds ? `<dt>Beds</dt><dd>${p.beds} certified (CMS)</dd>` : ''}
      ${p.cmsType ? `<dt>CMS type</dt><dd>${esc(p.cmsType)}</dd>` : ''}
      ${p.rating ? `<dt>CMS rating</dt><dd>${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</dd>` : ''}
      ${p.official ? `<dt>Listed official</dt><dd>${esc(p.official)}${p.officialTitle ? ', ' + esc(p.officialTitle) : ''}</dd>` : ''}
      ${isNpi ? `<dt>NPI</dt><dd><a href="https://npiregistry.cms.hhs.gov/provider-view/${p.id}" target="_blank" rel="noopener">${p.id}</a></dd>` : ''}
      ${p.colocated > 1 ? `<dt>At this address</dt><dd>${p.colocated} registered providers</dd>` : ''}
    </dl>
    ${flowSection(id)}
    <details class="section"><summary><b>How the score works</b> <span class="muted small">opportunity ${s.potential} of 100, then adjusted for your relationship</span></summary>
    <div class="breakdown" style="margin-top:12px">
      <span>Fit for ${esc(careLabel().toLowerCase())}</span><span class="bar-g"><i style="width:${s.fit * 100}%"></i></span><span class="num">${Math.round(s.fit * 100)}</span>
      <span>Size</span><span class="bar-g"><i style="width:${s.size * 100}%"></i></span><span class="num">${Math.round(s.size * 100)}</span>
      <span>Proximity</span><span class="bar-g"><i style="width:${s.prox * 100}%"></i></span><span class="num">${Math.round(s.prox * 100)}</span>
    </div></details>
    <div class="section"><h3>Referrals, last 12 months</h3>${s.total12 ? spark(s.h) + `<div class="muted small">${s.total12} total · ${s.last3} in the last 3 months</div>` : '<div class="muted small">No referrals from this source in your data yet.</div>'}</div>
    <div class="section"><h3>Outreach history</h3><div class="row"><button class="btn sm" data-draft="${esc(id)}" data-kind="email">Draft email</button><button class="btn sm" data-draft="${esc(id)}" data-kind="call">Call plan</button><button class="btn sm" data-draft="${esc(id)}" data-kind="visit">Visit plan</button><button class="btn sm" id="logTouch">Log a touch</button></div>
      <div id="logForm"></div>
      <div style="margin-top:10px">${acts.filter(a => a.status === 'draft').map(draftCard).join('')}</div>
      ${acts.filter(a => a.status !== 'draft').map(a => `<div class="small" style="padding:6px 0;border-top:1px solid var(--line)"><b>${esc(KIND[a.kind] || a.kind)}</b> · ${fmtShort((a.doneAt || a.at).slice(0, 10))} · ${esc(a.status === 'skipped' ? 'discarded' : 'done')} by ${esc(a.by.split('@')[0])}${a.subject ? ` · ${esc(a.subject)}` : ''}${a.followUp && a.status === 'done' ? ` · follow up ${fmtShort(a.followUp)}` : ''}</div>`).join('') || ''}
    </div>
    <div class="section"><h3>Contacts</h3>
      ${contacts.map(c => `<div class="row small" style="justify-content:space-between;padding:4px 0"><span><b>${esc(c.name || '(no name)')}</b> ${esc(c.role)} ${c.email ? `· <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''} ${c.phone ? '· ' + esc(c.phone) : ''}</span><span class="row"><button class="btn sm ghost" data-edc="${esc(c.id)}">Edit</button><button class="btn sm ghost" data-rmc="${esc(c.id)}">Remove</button></span></div>`).join('') || '<div class="muted small">No contacts yet. Add the case manager, discharge planner or office manager you work with.</div>'}
      <form id="cForm" class="grid" style="grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <input type="hidden" name="id"><input name="name" placeholder="Name"><input name="role" placeholder="Role (e.g. discharge planner)"><input name="email" type="email" placeholder="Email"><input name="phone" placeholder="Phone">
        <button class="btn sm" type="submit" id="cSave" style="grid-column:span 2;justify-self:start">Add contact</button></form>
    </div>`;
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); const X = window.WellbyExt || {}; if (X._drawer) try { X._drawer(id, d); } catch (e) { console.error(e); }
  $('#dClose').onclick = closeDrawer;
  bindCommon(d);
  $('#cForm').onsubmit = async e => { e.preventDefault(); const c = Object.fromEntries(new FormData(e.target)); if (!c.name && !c.email) return; if (!c.id) delete c.id; const r = await post('saveContact', { sourceId: id, contact: c }); S.contacts = r.contacts; openSource(id); refreshView(); toast(c.id ? 'Contact updated' : 'Contact saved'); };
  d.querySelectorAll('[data-edc]').forEach(b => b.onclick = () => { const c = contacts.find(x => x.id === b.dataset.edc), f = $('#cForm'); for (const k of ['id', 'name', 'role', 'email', 'phone']) f.elements[k].value = c[k] || ''; $('#cSave').textContent = 'Save changes'; f.elements.name.focus(); });
  d.querySelectorAll('[data-rmc]').forEach(b => b.onclick = async () => { const old = contacts.find(x => x.id === b.dataset.rmc); const r = await post('saveContact', { sourceId: id, contact: { id: b.dataset.rmc }, remove: true }); S.contacts = r.contacts; openSource(id); refreshView(); toast('Contact removed', { label: 'Undo', fn: async () => { const u = await post('saveContact', { sourceId: id, contact: old }); S.contacts = u.contacts; if ($('#drawer').classList.contains('open')) openSource(id); refreshView(); } }); });
  $('#logTouch').onclick = () => {
    $('#logForm').innerHTML = `<form class="grid" style="grid-template-columns:1fr 1fr;gap:6px;margin-top:10px"><select name="kind"><option value="visit">Visit</option><option value="call">Call</option><option value="email">Email</option><option value="lunch">Lunch / in-service</option></select><input type="date" name="followUp" value="${addDays(today(), 14)}" title="Follow-up date"><input name="subject" placeholder="Note (e.g. met with Sarah in case management)" style="grid-column:span 2"><button class="btn sm primary" style="justify-self:start">Save</button></form>`;
    $('#logForm form').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const r = await post('addActivity', { activity: { sourceId: id, sourceName: p.name, kind: f.kind, subject: f.subject, followUp: f.followUp, status: 'done' } }); S.activity = r.activity; rescore(); openSource(id); toast('Touch logged'); if (S.view === 'today') viewToday(); };
  };
}
function openMarketSource(s, isNpi) {
  const p = s.p, d = $('#drawer');
  d.innerHTML = `<button class="btn ghost close" id="dClose" aria-label="Close">✕</button>
    <img class="d-art" src="${artFor(p.type)}" alt=""><div class="muted small">${esc(p.type)} · public data</div><h1 style="padding-right:30px">${esc(p.name)}</h1>
    <dl class="facts">
      ${p.address ? `<dt>Address</dt><dd>${esc(p.address)}, ${esc(p.city)} ${esc(p.zip)}${s.dist != null ? ` · ${s.dist.toFixed(1)} mi from ${esc(s.office)}` : ''}</dd>` : ''}
      ${p.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(p.phone)}">${esc(phoneFmt(p.phone))}</a></dd>` : ''}
      <dt>Specialty</dt><dd>${esc(p.tx)}</dd>
      ${p.beds ? `<dt>Beds</dt><dd>${p.beds} certified (CMS)</dd>` : ''}
      ${p.cmsType ? `<dt>CMS type</dt><dd>${esc(p.cmsType)}</dd>` : ''}
      ${p.rating ? `<dt>CMS rating</dt><dd>${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</dd>` : ''}
      ${p.official ? `<dt>Listed official</dt><dd>${esc(p.official)}${p.officialTitle ? ', ' + esc(p.officialTitle) : ''}</dd>` : ''}
      ${isNpi ? `<dt>NPI</dt><dd><a href="https://npiregistry.cms.hhs.gov/provider-view/${p.id}" target="_blank" rel="noopener">${p.id}</a></dd>` : ''}
      ${p.colocated > 1 ? `<dt>At this address</dt><dd>${p.colocated} registered providers</dd>` : ''}
    </dl>
    <div class="section"><h3>Fit score ${s.potential} of 100</h3><div class="breakdown">
      <span>Fit for ${esc(careLabel().toLowerCase())}</span><span class="bar-g"><i style="width:${s.fit * 100}%"></i></span><span class="num">${Math.round(s.fit * 100)}</span>
      <span>Size</span><span class="bar-g"><i style="width:${s.size * 100}%"></i></span><span class="num">${Math.round(s.size * 100)}</span>
      <span>Proximity</span><span class="bar-g"><i style="width:${s.prox * 100}%"></i></span><span class="num">${Math.round(s.prox * 100)}</span></div></div>
    <div class="notice info" style="margin-top:16px"><div>You're viewing public data only. <a href="#" id="dWith">Open with your data</a> to see referrals, outreach and win flows for this source.</div></div>`;
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  $('#dClose').onclick = closeDrawer;
  $('#dWith').onclick = e => { e.preventDefault(); location.hash = '#sources'; setTimeout(() => openSource(p.id), 60); };
}
function closeDrawer() { const d = $('#drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDrawer(); $('#gsr')?.classList.remove('open'); }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { const g = $('#gs'); if (g) { e.preventDefault(); g.focus(); g.select(); } }
});
document.addEventListener('mousedown', e => {
  if (!$('#drawer').classList.contains('open')) return;
  if (e.target.closest('#drawer, [data-src], [data-flow], .leaflet-interactive, .leaflet-marker-icon, #toast, .hdr, .tip')) return;
  closeDrawer();
});
// Plain-language meaning for status and score labels, wherever they appear
const STATUS_TIP = { Protect: 'Was sending you referrals but has dropped off. Reach out before you lose them.', Grow: 'Sends you a few referrals and has room for more.', Healthy: 'Referring steadily. Keep the relationship warm.', Open: "Hasn't referred to you yet. A new opportunity." };
new MutationObserver(() => { document.querySelectorAll('.chip:not([data-tip])').forEach(c => { const m = c.className.match(/st-(\w+)/), t = c.textContent.trim(); if (m && STATUS_TIP[m[1]]) c.dataset.tip = `<b>${m[1]}</b><br>${STATUS_TIP[m[1]]}`; else if (/^Score \d+/.test(t)) c.dataset.tip = '<b>Score</b><br>How strongly Wellby recommends working this source now: fit, size and distance, adjusted for your relationship.'; }); }).observe(document.body, { childList: true, subtree: true });
// ---------- Global search ----------
function setupSearch() {
  if ($('#gs')) return;
  $('#nav').insertAdjacentHTML('beforebegin', `<div class="gsw"><input id="gs" type="search" placeholder="Search" aria-label="Search sources and contacts" autocomplete="off"><kbd>\u2318K</kbd><div id="gsr" class="gsr" role="listbox"></div></div>`);
  const inp = $('#gs'), box = $('#gsr'); let hits = [], sel = 0;
  const VIEWS = [['Today', 'today'], ['Calendar', 'calendar'], ['Targets map', 'map'], ['Targets list', 'sources'], ['Market (public data)', 'market'], ['Win flows', 'flows'], ['Contacts', 'contacts'], ['Results', 'results'], ['Referrals', 'referrals'], ['Connections', 'connections'], ['Settings', 'settings']];
  const go = h => { box.classList.remove('open'); inp.value = ''; inp.blur(); if (!h) return; if (h.view) location.hash = '#' + h.view; else { if (S.view === 'market' || S.pure) location.hash = '#sources'; setTimeout(() => openSource(h.id), 30); } };
  const render = () => {
    const q = inp.value.toLowerCase().trim(); if (!q) { box.classList.remove('open'); return; }
    const people = []; for (const [sid, list] of Object.entries(S.contacts || {})) for (const c of list || []) if (`${c.name} ${c.email} ${c.role}`.toLowerCase().includes(q)) { const s = S.scoredById.get(sid); if (s) people.push({ id: sid, label: c.name || c.email, sub: `${c.role ? c.role + ' \u00b7 ' : ''}${s.p.name}`, kind: 'Person' }); }
    const src = S.scored.filter(x => `${x.p.name} ${x.p.city} ${x.p.zip} ${x.p.id}`.toLowerCase().includes(q)).sort((a, b) => (b.p.name.toLowerCase().startsWith(q) - a.p.name.toLowerCase().startsWith(q)) || b.priority - a.priority).slice(0, 7).map(x => ({ id: x.p.id, label: x.p.name, sub: `${x.p.type}${x.p.city ? ' \u00b7 ' + x.p.city : ''}`, kind: x.status }));
    const views = VIEWS.filter(([n]) => n.toLowerCase().includes(q)).map(([n, v]) => ({ view: v, label: n, sub: 'Go to page', kind: '' }));
    hits = [...people.slice(0, 5), ...src, ...views]; sel = 0;
    box.innerHTML = hits.length ? hits.map((h, i) => `<div class="gsi ${i === sel ? 'on' : ''}" data-i="${i}"><div><b>${esc(h.label)}</b><div class="muted small">${esc(h.sub)}</div></div>${h.kind ? `<span class="chip ${STATUS_COLOR[h.kind] ? 'st-' + h.kind : ''}">${esc(h.kind)}</span>` : ''}</div>`).join('') : '<div class="gsi muted small">No matches</div>';
    box.classList.add('open');
    box.querySelectorAll('[data-i]').forEach(el => el.onmousedown = e => { e.preventDefault(); go(hits[+el.dataset.i]); });
  };
  inp.oninput = render;
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!hits.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; box.querySelectorAll('.gsi').forEach((el, i) => el.classList.toggle('on', i === sel)); }
    if (e.key === 'Enter') { e.preventDefault(); go(hits[sel]); }
  };
  inp.onblur = () => setTimeout(() => box.classList.remove('open'), 150);
}
// ---------- Sidebar counts ----------
function navBadges() {
  if (!S.scored?.length && !S.activity?.length) return;
  const drafts = S.activity.filter(a => a.status === 'draft').length, { steps, follow } = queueItems(), n = drafts + steps.length + follow.length;
  const a = document.querySelector('#nav a[data-view="today"]'); if (!a) return;
  let b = a.querySelector('.nbadge'); if (!b) { b = document.createElement('span'); b.className = 'nbadge'; a.appendChild(b); }
  b.textContent = n > 99 ? '99+' : n; b.hidden = !n; a.title = n ? `Today \u00b7 ${n} waiting for you` : 'Today';
}

// ---------- National map (home) ----------
let GEO = null;
async function loadGeo() {
  if (GEO) return GEO;
  if (!window.topojson) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://unpkg.com/topojson-client@3/dist/topojson-client.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  const us = await fetch('https://unpkg.com/us-atlas@3/counties-10m.json').then(r => r.json());
  const counties = topojson.feature(us, us.objects.counties), states = topojson.feature(us, us.objects.states);
  GEO = { counties, states, stateMesh: topojson.mesh(us, us.objects.states, (a, b) => a !== b), stateName: Object.fromEntries(states.features.map(f => [f.id, f.properties.name])) };
  return GEO;
}
const officeBounds = os => L.latLngBounds(os.flatMap(o => { const dLat = o.radiusMiles / 69, dLng = o.radiusMiles / (69 * Math.cos(o.lat * Math.PI / 180)); return [[o.lat - dLat, o.lng - dLng], [o.lat + dLat, o.lng + dLng]]; }));
const MAP = { metric: 'all', color: 'type', scope: { kind: 'us' }, dots: new Map(), loading: new Set() };
function countyMetric(c) {
  if (!c) return 0;
  if (MAP.metric === 'all') return c.n;
  return (GROUPS[MAP.metric] || []).reduce((a, t) => a + (c.counts?.[t] || 0), 0);
}
function scopeCounties() {
  const C = S.index?.counties || {}, sc = MAP.scope;
  if (sc.kind === 'state') return Object.entries(C).filter(([f]) => f.slice(0, 2) === sc.id);
  if (sc.kind === 'county') return C[sc.id] ? [[sc.id, C[sc.id]]] : [];
  return Object.entries(C);
}
function aggregate(list) {
  const counts = {}; let n = 0;
  for (const [, c] of list) { n += c.n; for (const [t, v] of Object.entries(c.counts || {})) counts[t] = (counts[t] || 0) + v; }
  return { n, counts };
}
function viewMap() {
  $('#app').innerHTML = `<div class="mapwrap"><div id="nmap"></div>
    <aside class="mpanel" id="mpanel"><div class="loading" style="padding:30px">Loading the national map…</div></aside>
    <div class="mtools">
      <input id="mSearch" list="mPlaces" placeholder="Search a state, county or office" autocomplete="off"><datalist id="mPlaces"></datalist>
      <div class="seg" id="mMetric">${['all', ...Object.keys(GROUPS)].map(k => `<button data-m="${k}" class="${MAP.metric === k ? 'on' : ''}">${k === 'all' ? 'All sources' : k}</button>`).join('')}</div>
      ${S.pure ? `<div class="purenote"><b>Public data only</b> \u00b7 none of your agency's data <a href="#map">Show with your data</a></div>` : ''}<div class="row"><a class="btn sm" href="${S.pure ? '#market/list' : '#sources'}">List view</a><button class="btn sm" id="mUS">United States</button>${S.offices.length ? '<button class="btn sm primary" id="mTerr">My territory</button>' : ''}</div>
    </div>
    <div class="mlegend" id="mLegend"></div></div>`;
  if (!S.index) { $('#mpanel').innerHTML = `<div class="empty">The national market data isn't available yet. Try again in a few minutes.</div>`; return; }
  const map = S.lmap = L.map('nmap', { preferCanvas: true, zoomControl: false, minZoom: 3, worldCopyJump: true });
  const US = L.latLngBounds([24.3, -124.8], [49.4, -66.9]); const PAD = innerWidth > 960 ? { paddingTopLeft: [410, 70], paddingBottomRight: [20, 60] } : { padding: [10, 10] };
  if (S.offices.length && !MAP._init) { MAP._init = true; let best = null; for (const [f, c] of Object.entries(S.index.counties)) { const d = miles(S.offices[0].lat, S.offices[0].lng, c.lat, c.lng); if (!best || d < best.d) best = { d, f }; } if (best) MAP.scope = { kind: 'state', id: best.f.slice(0, 2) }; }
  if (S.offices.length) map.fitBounds(officeBounds(S.offices), innerWidth > 960 ? { paddingTopLeft: [420, 20], paddingBottomRight: [20, 20] } : { padding: [10, 10] }); else map.fitBounds(US, PAD);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // Basemap: Esri light gray canvas (no API key needed). Base and labels are separate so labels sit above the county shading.
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_';
  L.tileLayer(ESRI + 'Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Data: NPPES, CMS, U.S. Census', maxNativeZoom: 16, maxZoom: 19 }).addTo(map);
  const labels = L.tileLayer(ESRI + 'Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 19, pane: 'shadowPane' }).addTo(map);
  const dotLayer = L.layerGroup().addTo(map);
  for (const o of S.offices) {
    L.circle([o.lat, o.lng], { radius: o.radiusMiles * 1609.34, color: '#EE8B4B', weight: 1.5, fill: false, dashArray: '5 5', interactive: false }).addTo(map);
    L.marker([o.lat, o.lng], { icon: L.divIcon({ className: 'opin', html: `<img src="${IMG('g-cl-house-cut')}" alt=""><span>${esc(o.label)}</span>`, iconSize: [44, 44], iconAnchor: [22, 40] }), zIndexOffset: 1000 }).bindTooltip(`${esc(o.label)} office · ${o.radiusMiles} mi`).addTo(map);
  }
  if (!S.pure) planItems(10).filter(s => s.p.lat != null).forEach((s, i) => L.marker([s.p.lat, s.p.lng], { icon: L.divIcon({ className: 'tgt', html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 900 }).bindTooltip(`<b>#${i + 1} ${esc(s.p.name)}</b><br>${esc(s.p.type)} · score ${s.priority}`).on('click', () => openSource(s.p.id)).addTo(map));
  let countyLayer = null, breaks = [];
  const colorFor = v => { if (!v) return '#F6F5F1'; let i = 0; while (i < breaks.length && v > breaks[i]) i++; return SEQ[Math.min(i + 1, SEQ.length - 1)]; };
  const computeBreaks = () => { const vals = Object.values(S.index.counties).map(countyMetric).filter(v => v > 0).sort((a, b) => a - b); const q = k => vals[Math.floor((vals.length - 1) * k)] || 0; breaks = [.2, .4, .6, .75, .9].map(q); };
  const styleCounty = f => { const z = map.getZoom(); const v = countyMetric(S.index.counties[f.id]); return { fillColor: colorFor(v), fillOpacity: z >= 9 ? .12 : .82, color: '#fff', weight: z >= 7 ? 1 : .35, opacity: z >= 9 ? .5 : 1 }; };
  const legend = () => {
    const z = map.getZoom();
    if (z >= 9) {
      $('#mLegend').innerHTML = MAP.color === 'status' && S.offices.length && !S.pure
        ? `<b>Relationship</b>${Object.entries(STATUS_COLOR).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<button class="btn sm ghost" id="mColor">Color by type</button>`
        : `<b>Source type</b>${Object.entries(GROUP_COLOR).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}${S.offices.length && !S.pure ? '<button class="btn sm ghost" id="mColor">Color by relationship</button>' : ''}`;
      const b = $('#mColor'); if (b) b.onclick = () => { MAP.color = MAP.color === 'status' ? 'type' : 'status'; drawDots(); legend(); };
    } else {
      const lab = MAP.metric === 'all' ? 'Referral sources per county' : `${MAP.metric} per county`;
      $('#mLegend').innerHTML = `<b>${lab}</b><span class="ramp">${SEQ.slice(1).map((c, i) => `<i style="background:${c}" data-tip="${esc(i === 0 ? `up to ${fmt(breaks[0])}` : i < breaks.length ? `${fmt(breaks[i - 1] + 1)}–${fmt(breaks[i])}` : `over ${fmt(breaks[breaks.length - 1])}`)}"></i>`).join('')}</span><span class="muted small">fewer → more · zoom in to see every source</span>`;
    }
  };
  const restyle = () => { computeBreaks(); countyLayer?.setStyle(styleCounty); legend(); };

  async function drawDots() {
    dotLayer.clearLayers();
    if (map.getZoom() < 9 || !countyLayer) return;
    const bounds = map.getBounds().pad(.1);
    const vis = []; countyLayer.eachLayer(l => { if (bounds.intersects(l.getBounds())) vis.push(l.feature.id); });
    const need = vis.filter(f => S.index.counties[f] && !MAP.dots.has(f) && !MAP.loading.has(f)).slice(0, 12);
    if (need.length) {
      need.forEach(f => MAP.loading.add(f));
      $('#mLegend').insertAdjacentHTML('beforeend', '<span class="muted small" id="mLoad"> · loading sources…</span>');
      await Promise.all(need.map(async f => {
        const parts = S.index.counties[f].parts || 1, rows = [];
        for (let k = 0; k < parts; k++) { const r = await fetch(`/api/market?part=${f}-${k}&all=1`); if (r.ok) rows.push(...await r.json()); }
        MAP.dots.set(f, rows.map(row => Object.fromEntries(S.index.fields.map((fl, j) => [fl, row[j]]))));
        MAP.loading.delete(f);
      }));
      $('#mLoad')?.remove();
      if (!S.lmap || S.lmap !== map) return;
      return drawDots();
    }
    const groupsOn = MAP.metric === 'all' ? null : new Set(GROUPS[MAP.metric]);
    let shown = 0; const ORDER = { Physicians: 0, Other: 1, 'Post-acute': 2, Hospitals: 3 };
    const pts = [];
    for (const f of vis) for (const p of MAP.dots.get(f) || []) if (p.lat != null && bounds.contains([p.lat, p.lng]) && (!groupsOn || groupsOn.has(p.type))) pts.push(p);
    pts.sort((a, b) => (ORDER[groupOf(a.type)] - ORDER[groupOf(b.type)]) || ((a.size || 0) - (b.size || 0)));
    const limit = 12000, skipPhys = pts.length > limit && MAP.metric !== 'Physicians';
    for (const p of pts) {
      const g = groupOf(p.type); if (skipPhys && g === 'Physicians') continue;
      if (++shown > limit) break;
      const byStatus = MAP.color === 'status' && !S.pure, sc = byStatus ? S.scoredById.get(p.id) : null;
      const fill = byStatus ? (sc ? STATUS_COLOR[sc.status] : '#C9C7BF') : GROUP_COLOR[g];
      const r = g === 'Physicians' ? 3.5 : 4.5 + 6 * ((p.size ?? 50) / 100);
      L.circleMarker([p.lat, p.lng], { radius: r, weight: 1, color: '#fff', fillColor: fill, fillOpacity: .9 })
        .bindTooltip(`<b>${esc(p.name)}</b><br>${esc(p.type)} · ${esc(p.city)}${p.beds ? ` · ${p.beds} beds` : ''}${sc ? ` · ${sc.status}` : ''}`)
        .on('click', () => { ensureScored(p); openSource(p.id); }).addTo(dotLayer);
    }
    if (skipPhys) $('#mLegend').insertAdjacentHTML('beforeend', `<span class="muted small"> · physicians hidden here; zoom in or pick Physicians</span>`);
  }

  function panel() {
    const sc = MAP.scope, C = S.index.counties;
    const list = scopeCounties(), agg = aggregate(list), gi = groupItems(agg.counts);
    let title = 'United States', sub = `${fmt(agg.n)} referral sources in ${fmt(list.length)} counties`, barsTitle = 'Top states', bars = [];
    if (sc.kind === 'us') {
      const byState = {}; for (const [f, c] of list) { const k = f.slice(0, 2); byState[k] = (byState[k] || 0) + countyMetric(c); }
      bars = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ key: 's:' + k, label: GEO?.stateName[k] || k, value: v }));
    } else if (sc.kind === 'state') {
      title = GEO?.stateName[sc.id] || sc.id; barsTitle = 'Top counties';
      bars = list.map(([f, c]) => ({ key: 'c:' + f, label: c.name, value: countyMetric(c) })).sort((a, b) => b.value - a.value).slice(0, 8);
    } else if (sc.kind === 'county') {
      const c = C[sc.id]; title = c ? `${c.name}, ${c.state}` : sc.id; sub = `${fmt(agg.n)} referral sources`; barsTitle = 'Largest facilities';
      const dots = (MAP.dots.get(sc.id) || []).filter(p => groupOf(p.type) !== 'Physicians').sort((a, b) => (b.beds || 0) - (a.beds || 0) || (b.size || 0) - (a.size || 0)).slice(0, 8);
      bars = dots.map(p => ({ key: 'p:' + p.id, label: p.name, value: p.beds || p.colocated || 1, color: GROUP_COLOR[groupOf(p.type)] }));
    }
    const metricName = MAP.metric === 'all' ? 'sources' : MAP.metric.toLowerCase();
    const terr = S.offices.length && S.pure ? `<div class="pcard terr"><span class="eyebrow sky">Around your offices \u00b7 public data</span><div class="row" style="margin:8px 0 4px">${S.offices.map(o => `<button class="chip click" data-off="${esc(o.id)}">${esc(o.label)} \u00b7 ${o.radiusMiles} mi</button>`).join('')}</div>${donut(groupItems(S.market.counts), { size: 120, center: fmt(S.market.providers.length), sub: 'sources' })}<a class="btn wide" href="#market/list" style="margin-top:10px">See the list</a></div>` : S.offices.length ? (() => { const st = { Protect: 0, Grow: 0, Healthy: 0, Open: 0 }; for (const x of S.scored) st[x.status]++; return `
      <div class="pcard terr"><div class="row" style="justify-content:space-between"><div><span class="eyebrow sky">Your territory</span><div class="pname">${esc(S.settings.agencyName || 'Your agency')}</div></div><img src="${IMG('g-cl-house-cut')}" alt="" style="width:58px"></div>
        <div class="row" style="margin:8px 0 4px">${S.offices.map(o => `<button class="chip click" data-off="${esc(o.id)}">${esc(o.label)} · ${o.radiusMiles} mi</button>`).join('')}</div>
        ${donut(Object.entries(st).map(([k, v]) => ({ key: k, label: k, value: v, color: STATUS_COLOR[k] })), { size: 120, center: fmt(S.market.providers.length), sub: 'in territory' })}
        <a class="btn primary wide" href="#today" style="margin-top:10px">Open today's plan</a></div>
      <div class="pcard"><h3>Your top targets</h3>${planItems(5).map((s, i) => `<div class="trow"><span class="rank">${i + 1}</span><div><span class="name" data-src="${esc(s.p.id)}">${esc(s.p.name)}</span><div class="muted small">${esc(s.p.type)} · score ${s.priority}</div></div><button class="btn sm primary" data-flow="${esc(s.p.id)}">Start</button></div>`).join('') || '<div class="muted small">Every top target is in a win flow.</div>'}</div>`; })() : `<div class="pcard"><h3>Add your offices</h3><p class="muted small">Set office addresses in <a href="#settings">Settings</a> and Wellby scores every source around them.</p></div>`;
    $('#mpanel').innerHTML = `
      <div class="ptitle">${sc.kind !== 'us' ? `<button class="btn sm ghost" id="pBack">← ${sc.kind === 'county' ? (GEO?.stateName[sc.id.slice(0, 2)] || 'State') : 'United States'}</button>` : ''}<span class="eyebrow">Market</span><h2>${esc(title)}</h2><div class="muted small">${sub}</div></div>
      <div class="vcards">${[{ key: 'all', label: 'All sources', value: agg.n, art: 'g-cl-stk-market-cut', color: '#0D2747' }, ...gi.map(g => ({ ...g, art: GROUP_ART[g.key] }))].filter(c => c.key !== 'Other').map(c => `<button class="vcard ${MAP.metric === c.key ? 'on' : ''}" data-metric="${c.key}" style="--c:${c.color}"><img src="${IMG(c.art)}" alt=""><span class="vv">${fmt(c.value)}</span><span class="vl">${esc(c.label)}</span></button>`).join('')}</div>
      <div class="pcard"><h3>Source mix</h3>${donut(gi, { center: fmt(agg.n), sub: 'sources', onKey: true })}</div>
      ${bars.length ? `<div class="pcard"><h3>${barsTitle} · ${sc.kind === 'county' ? 'beds or size' : metricName}</h3>${hbars(bars, { clickable: true, color: '#2F6DB5' })}</div>` : ''}
      ${terr}`;
    $('#mpanel').querySelectorAll('[data-metric]').forEach(b => b.onclick = () => setMetric(b.dataset.metric));
    $('#mpanel').querySelectorAll('.lg [data-key]').forEach(b => b.onclick = () => setMetric(b.dataset.key));
    $('#mpanel').querySelectorAll('[data-hb]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.hb.split(/:(.*)/); if (k === 's') zoomState(v); else if (k === 'c') zoomCounty(v); else if (k === 'p') { const p = (MAP.dots.get(sc.id) || []).find(x => x.id === v); if (p) { ensureScored(p); openSource(p.id); } } });
    $('#mpanel').querySelectorAll('[data-off]').forEach(b => b.onclick = () => { const o = S.offices.find(x => x.id === b.dataset.off); map.fitBounds(officeBounds([o]), { paddingTopLeft: [420, 20] }); });
    const back = $('#pBack'); if (back) back.onclick = () => sc.kind === 'county' ? zoomState(sc.id.slice(0, 2)) : zoomUS();
    bindCommon($('#mpanel'));
  }
  const setMetric = m => { MAP.metric = m; document.querySelectorAll('#mMetric button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); restyle(); panel(); drawDots(); };
  const boundsOf = pred => { let b = null; countyLayer.eachLayer(l => { if (pred(l.feature.id)) b = b ? b.extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast()); }); return b; };
  const zoomUS = () => { MAP.scope = { kind: 'us' }; map.fitBounds(US, PAD); panel(); };
  const zoomState = id => { MAP.scope = { kind: 'state', id }; const b = boundsOf(f => f.slice(0, 2) === id); if (b) map.fitBounds(b, { paddingTopLeft: [420, 20], paddingBottomRight: [20, 20] }); panel(); };
  const zoomCounty = id => { MAP.scope = { kind: 'county', id }; const b = boundsOf(f => f === id); if (b) map.fitBounds(b, { paddingTopLeft: [420, 20], paddingBottomRight: [20, 20], maxZoom: 11 }); panel(); setTimeout(panel, 2500); };
  document.querySelectorAll('#mMetric button').forEach(b => b.onclick = () => setMetric(b.dataset.m));
  $('#mUS').onclick = zoomUS;
  if ($('#mTerr')) $('#mTerr').onclick = () => map.fitBounds(officeBounds(S.offices), { paddingTopLeft: [420, 20] });

  loadGeo().then(G => {
    if (S.lmap !== map) return;
    computeBreaks();
    countyLayer = L.geoJSON(G.counties, { style: styleCounty, onEachFeature: (f, l) => {
      const c = S.index.counties[f.id];
      l.bindTooltip(() => { const cc = S.index.counties[f.id]; return cc ? `<b>${esc(cc.name)}, ${esc(cc.state)}</b><br>${fmt(cc.n)} sources · ${fmt(countyMetric(cc))} ${MAP.metric === 'all' ? '' : esc(MAP.metric.toLowerCase())}` : `${esc(f.properties.name)} · no data`; }, { sticky: true });
      l.on('click', () => { if (map.getZoom() < 9 && c) zoomCounty(f.id); });
    } }).addTo(map);
    L.geoJSON(G.stateMesh, { style: { color: '#fff', weight: 1.6, opacity: .95 }, interactive: false }).addTo(map);
    labels.bringToFront();
    const places = [...G.states.features.map(f => [f.properties.name, 's:' + f.id]), ...Object.entries(S.index.counties).map(([f, c]) => [`${c.name}, ${c.state}`, 'c:' + f]), ...S.offices.map(o => [`${o.label} office`, 'o:' + o.id])];
    $('#mPlaces').innerHTML = places.map(([n]) => `<option value="${esc(n)}">`).join('');
    $('#mSearch').onchange = e => { const hit = places.find(([n]) => n.toLowerCase() === e.target.value.toLowerCase()); if (!hit) return; const [k, v] = hit[1].split(/:(.*)/); if (k === 's') zoomState(v); else if (k === 'c') zoomCounty(v); else { const o = S.offices.find(x => x.id === v); map.setView([o.lat, o.lng], 10); } e.target.blur(); };
    legend(); panel();
  }).catch(err => { $('#mpanel').innerHTML = `<div class="empty">Couldn't load the map: ${esc(err.message)}</div>`; });
  let t; map.on('zoomend moveend', () => { clearTimeout(t); t = setTimeout(() => { countyLayer?.setStyle(styleCounty); legend(); drawDots(); }, 150); });
  setTimeout(() => map.invalidateSize(), 50);
}

// ---------- Sources ----------
// Market tab: the public data on its own. No referral history, relationship status, outreach or win flows.
const MF = { q: '', group: 'all', sort: 'potential' };
function viewMarketList() {
  const f = MF, base = S.market.providers.map(p => S.scoredById.get(p.id)).filter(Boolean);
  const byType = Object.entries(S.market.counts).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => ({ key: k, label: k, value: v, color: GROUP_COLOR[groupOf(k)] }));
  const byCity = Object.entries(base.reduce((m, x) => (x.p.city && (m[x.p.city] = (m[x.p.city] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => ({ key: k, label: k, value: v }));
  $('#app').innerHTML = `<div class="head"><div class="hero-head"><img src="${IMG('g-cl-stk-market-cut')}" alt="" style="width:110px"><div><span class="eyebrow">Market · public data only</span><h1>Your market</h1><div class="muted">Every hospital, facility and referring physician around your offices (${esc(S.market.territory.label)}), straight from NPPES and CMS. None of your referral history, outreach or win flows is mixed in.</div></div></div><div class="row"><a class="btn" href="#market">Map view</a><a class="btn" href="#sources">With your data</a><button class="btn" id="csvOut">Export CSV</button></div></div>
    <div class="grid charts2" style="margin-top:16px">
      <div class="card"><h3>Sources by type · click to filter</h3>${hbars(byType, { clickable: true })}</div>
      <div class="card"><h3>Sources by city</h3>${hbars(byCity, { color: '#2F6DB5' })}</div></div>
    <div class="filters"><input id="q" placeholder="Search name, city, ZIP or NPI" value="${esc(f.q)}">
      <select id="g"><option value="all">All types</option>${Object.keys(GROUPS).map(g => `<optgroup label="${g}">${GROUPS[g].map(t => `<option ${f.group === t ? 'selected' : ''}>${t}</option>`).join('')}</optgroup>`).join('')}</select>
      <span class="muted small" id="cnt" style="align-self:center"></span></div>
    <div class="card" style="padding:0;overflow:auto"><table><thead><tr>
      <th data-sort="name">Source</th><th data-sort="type">Type</th><th data-sort="potential" class="num" title="Fit for your type of care, size and distance. No referral data.">Fit score</th><th data-sort="beds" class="num">Beds</th><th data-sort="rating" class="num">CMS rating</th><th>Phone</th><th data-sort="dist" class="num">Miles</th><th data-sort="office">Office</th>
    </tr></thead><tbody id="tb"></tbody></table></div>
    <p class="muted small">Fit score uses only your type of care (${esc(careLabel().toLowerCase())}), the source's size, and its distance from your offices.</p>`;
  const filtered = () => {
    const q = f.q.toLowerCase().trim(), k = f.sort;
    const val = s => k === 'name' ? s.p.name : k === 'type' ? s.p.type : k === 'office' ? s.office : k === 'dist' ? (s.dist ?? 999) : k === 'beds' ? (s.p.beds || 0) : k === 'rating' ? (s.p.rating || 0) : s.potential;
    const dir = ['name', 'type', 'dist', 'office'].includes(k) ? 1 : -1;
    return base.filter(s => (f.group === 'all' || s.p.type === f.group) && (!q || `${s.p.name} ${s.p.city} ${s.p.zip} ${s.p.id}`.toLowerCase().includes(q))).sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  };
  const render = () => {
    const list = filtered();
    $('#cnt').textContent = `${fmt(list.length)} sources`;
    $('#tb').innerHTML = list.slice(0, 400).map(s => `<tr class="click" data-src="${esc(s.p.id)}"><td><b>${esc(s.p.name)}</b><div class="muted small">${esc(s.p.city)}${s.p.zip ? ' ' + esc(s.p.zip) : ''}</div></td><td class="small">${esc(s.p.type)}</td>
      <td class="num"><span class="score">${s.potential}<span class="bar-g"><i style="width:${s.potential}%"></i></span></span></td><td class="num">${s.p.beds || '–'}</td><td class="num">${s.p.rating ? '★'.repeat(s.p.rating) : '–'}</td><td class="small">${esc(phoneFmt(s.p.phone))}</td><td class="num">${s.dist != null ? s.dist.toFixed(1) : '–'}</td><td class="small">${esc(s.office)}</td></tr>`).join('') + (list.length > 400 ? `<tr><td colspan="8" class="muted small">Showing the top 400. Narrow the search to see more.</td></tr>` : '');
    bindCommon($('#tb'));
  };
  render();
  document.querySelectorAll('.charts2 [data-hb]').forEach(b => b.onclick = () => { f.group = f.group === b.dataset.hb ? 'all' : b.dataset.hb; $('#g').value = f.group; render(); });
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; render(); }, 150); };
  $('#g').onchange = e => { f.group = e.target.value; render(); };
  document.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { f.sort = th.dataset.sort; render(); });
  $('#csvOut').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['name', 'type', 'fit_score', 'beds', 'cms_rating', 'address', 'city', 'zip', 'phone', 'npi', 'miles', 'office'].join(',')];
    for (const s of filtered()) lines.push([s.p.name, s.p.type, s.potential, s.p.beds || '', s.p.rating || '', s.p.address, s.p.city, s.p.zip, phoneFmt(s.p.phone), /^\d{10}$/.test(s.p.id) ? s.p.id : '', s.dist?.toFixed(1) ?? '', s.office].map(q).join(','));
    download('wellby-market.csv', lines.join('\n'));
  };
}
function viewSources() {
  if (S.pure) return viewMarketList();
  const f = S.srcFilter;
  $('#app').innerHTML = `<div class="head"><div class="hero-head"><img src="${IMG('g-cl-rehab-cut')}" alt="" style="width:96px"><div><span class="eyebrow">Targets</span><h1>Referral sources</h1><div class="muted">Every hospital, facility and referring physician around your offices (${esc(S.market.territory.label)}), plus any source in your referral data.</div></div></div><div class="row"><a class="btn" href="#map">Map view</a><button class="btn" id="csvOut">Export CSV</button></div></div>
    <div class="grid charts2" style="margin-top:16px">
      <div class="card"><h3>Sources by type · click to filter</h3>${hbars(Object.entries(S.scored.reduce((m, x) => (m[x.p.type] = (m[x.p.type] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => ({ key: k, label: k, value: v, color: GROUP_COLOR[groupOf(k)] })), { clickable: true })}</div>
      <div class="card"><h3>Relationship · click to filter</h3>${donut(statusItems(), { center: fmt(S.scored.length), sub: 'sources', onKey: true })}</div></div>
    <div class="filters"><input id="q" placeholder="Search name, city, ZIP or NPI" value="${esc(f.q)}">
      <select id="g"><option value="all">All types</option>${Object.keys(GROUPS).map(g => `<optgroup label="${g}">${GROUPS[g].map(t => `<option ${f.group === t ? 'selected' : ''}>${t}</option>`).join('')}</optgroup>`).join('')}</select>
      <select id="st"><option value="all">All statuses</option>${Object.keys(STATUS_COLOR).map(k => `<option ${f.status === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <span class="muted small" id="cnt" style="align-self:center"></span></div>
    <div class="card" style="padding:0;overflow:auto"><table><thead><tr>
      <th data-sort="name">Source</th><th data-sort="type">Type</th><th data-sort="status">Status</th><th data-sort="priority" class="num">Score</th><th data-sort="last6" class="num">Referrals 6 mo</th><th data-sort="trend" class="num">Trend</th><th data-sort="dist" class="num">Miles</th><th data-sort="office">Office</th>
    </tr></thead><tbody id="tb"></tbody></table></div>`;
  const filtered = () => {
    const q = f.q.toLowerCase().trim();
    let list = S.scored.filter(s => (f.group === 'all' || s.p.type === f.group) && (f.status === 'all' || s.status === f.status) && (!q || `${s.p.name} ${s.p.city} ${s.p.zip} ${s.p.id}`.toLowerCase().includes(q)));
    const k = f.sort;
    const val = s => k === 'name' ? s.p.name : k === 'office' ? s.office : k === 'type' ? s.p.type : k === 'status' ? s.status : k === 'trend' ? s.last3 - s.prior3 : k === 'dist' ? (s.dist ?? 999) : s[k];
    const dir = ['name', 'type', 'status', 'dist', 'office'].includes(k) ? 1 : -1;
    return list.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  };
  const render = () => {
    const list = filtered();
    $('#cnt').textContent = `${fmt(list.length)} sources`;
    $('#tb').innerHTML = list.slice(0, 400).map(s => `<tr class="click" data-src="${esc(s.p.id)}"><td><b>${esc(s.p.name)}</b><div class="muted small">${esc(s.p.city)}${s.p.zip ? ' ' + esc(s.p.zip) : ''}</div></td><td class="small">${esc(s.p.type)}</td><td><span class="chip st-${s.status}">${s.status}</span></td>
      <td class="num"><span class="score">${s.priority}<span class="bar-g"><i style="width:${Math.min(100, s.priority)}%"></i></span></span></td><td class="num">${s.last6 || '–'}</td>
      <td class="num ${s.last3 > s.prior3 ? 'up' : s.last3 < s.prior3 ? 'down' : 'muted'}">${s.total12 ? (s.last3 - s.prior3 > 0 ? '+' : '') + (s.last3 - s.prior3) : '–'}</td><td class="num">${s.dist != null ? s.dist.toFixed(1) : '–'}</td><td class="small">${esc(s.office)}</td></tr>`).join('') + (list.length > 400 ? `<tr><td colspan="8" class="muted small">Showing the top 400. Narrow the search to see more.</td></tr>` : '');
    bindCommon($('#tb'));
  };
  render();
  document.querySelectorAll('.charts2 [data-hb]').forEach(b => b.onclick = () => { f.group = f.group === b.dataset.hb ? 'all' : b.dataset.hb; $('#g').value = f.group; render(); });
  document.querySelectorAll('.charts2 [data-key]').forEach(b => b.onclick = () => { f.status = f.status === b.dataset.key ? 'all' : b.dataset.key; $('#st').value = f.status; render(); });
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; render(); }, 150); };
  $('#g').onchange = e => { f.group = e.target.value; render(); };
  $('#st').onchange = e => { f.status = e.target.value; render(); };
  document.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { f.sort = th.dataset.sort; render(); });
  $('#csvOut').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['name', 'type', 'status', 'priority', 'potential', 'referrals_6mo', 'address', 'city', 'zip', 'phone', 'npi', 'miles'].join(',')];
    for (const s of filtered()) lines.push([s.p.name, s.p.type, s.status, s.priority, s.potential, s.last6, s.p.address, s.p.city, s.p.zip, phoneFmt(s.p.phone), /^\d{10}$/.test(s.p.id) ? s.p.id : '', s.dist?.toFixed(1) ?? ''].map(q).join(','));
    download('wellby-sources.csv', lines.join('\n'));
  };
}
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); }

// ---------- Referrals: upload + scorecard ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const STOP = new Set(['THE', 'AND', 'OF', 'LLC', 'INC', 'LP', 'PA', 'PLLC', 'CENTER', 'CTR', 'TX', 'MD', 'DO', 'AT', 'GROUP', 'CO', 'CORP']);
const toks = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
let nameIndex = null;
function buildIndex() {
  nameIndex = new Map();
  for (const p of S.market.providers) for (const t of new Set(toks(p.name))) { (nameIndex.get(t) || nameIndex.set(t, []).get(t)).push(p); }
}
function matchName(name) {
  if (!nameIndex) buildIndex();
  const T = new Set(toks(name)); if (!T.size) return [];
  const cand = new Map();
  for (const t of T) { const l = nameIndex.get(t); if (l && l.length < 800) for (const p of l) cand.set(p, (cand.get(p) || 0) + 1); }
  const scored = [];
  for (const [p, n] of cand) { const P = new Set(toks(p.name)); const sc = n / (T.size + P.size - n); scored.push([sc + (p.org ? .02 : 0) + (S.scoredById.get(p.id)?.size || 0) * .03, p]); }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 5);
}
function detectCols(header) {
  const h = header.map(x => x.toLowerCase().trim());
  const find = re => h.findIndex(x => re.test(x));
  return {
    source: find(/referr(al)?\s*source|referr(er|ed by|ing)|^source|facility|organization|^name$|account/),
    npi: find(/\bnpi\b/), month: find(/month|period/), date: find(/date|referred on|received/),
    count: find(/^(count|referrals|#|number|total|qty|referral count|# of referrals)$/), admits: (() => { const i = find(/admit|start|converted|won/); return i >= 0 ? i : find(/^status$|outcome/); })(), payer: find(/payer|payor|payment|pay source|funding/),
  };
}
function toMonth(v) {
  v = String(v || '').trim(); if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}`; }
  m = v.match(/^(\d{1,2})[/-](\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const d = new Date(v); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function viewReferrals() {
  const up = S.referrals.uploads || [];
  $('#app').innerHTML = `<div class="head"><div class="hero-head"><img src="${IMG('g-cl-stk-score-cut')}" alt="" style="width:120px"><div><span class="eyebrow">Referrals</span><h1>Referrals</h1><div class="muted">Your own referral history, matched to the market. Counts only: no patient names or details are stored.</div></div></div>
    <div class="row"><a class="btn" href="/referral-template.csv" download>Download template</a>${S.me.role === 'admin' ? `<button class="btn" id="sample">Load sample data</button>` : ''}</div></div>
    ${sampleNotice()}
    <div class="cols" style="margin-top:18px">
      <div class="card" id="scorecard"></div>
      <div class="card"><h2>Upload referral history</h2>
        <div class="drop" id="drop"><img src="${IMG('g-cl-clipboard-cut')}" alt=""><b>Drop a CSV here</b> or click to choose<br><span class="muted small">Export from WellSky, AxisCare, ClearCare, Alora or a spreadsheet. One row per referral, or one row per source per month.</span><input type="file" id="file" accept=".csv,.tsv,.txt" hidden></div>
        <p class="muted small">Only the source name, NPI, month, count, admits and payer columns are read. Any other column, including patient names, is dropped in your browser and never uploaded.</p>
        <div id="mapping"></div>
        ${up.length ? `<div class="section"><h3>Upload history</h3>${up.slice().reverse().slice(0, 8).map(u => `<div class="small muted">${esc(u.at.slice(0, 16).replace('T', ' '))} · ${esc(u.file || 'upload')} · ${fmt(u.rows)} rows · ${esc(u.by.split('@')[0])}</div>`).join('')}${S.me.role === 'admin' ? `<button class="btn sm ghost" id="clearRefs" style="margin-top:8px">Clear all referral data</button>` : ''}</div>` : ''}
      </div></div>`;
  renderScorecard();
  const drop = $('#drop'), file = $('#file');
  drop.onclick = () => file.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  file.onchange = () => file.files[0] && handleFile(file.files[0]);
  if ($('#sample')) $('#sample').onclick = loadSample;
  if ($('#clearRefs')) $('#clearRefs').onclick = async () => { if (!confirm('Delete all uploaded referral data? This cannot be undone.')) return; const r = await post('clearReferrals'); S.referrals = r.referrals; rescore(); viewReferrals(); };
}
async function handleFile(f) {
  const text = await f.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return toast('That file looks empty.');
  const header = rows[0], cols = detectCols(header);
  const opt = (k, label) => `<label style="margin:0">${label}<select data-col="${k}"><option value="-1">(none)</option>${header.map((h, i) => `<option value="${i}" ${cols[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
  $('#mapping').innerHTML = `<div class="section"><h3>1. Confirm columns · ${esc(f.name)} · ${fmt(rows.length - 1)} rows</h3>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">${opt('source', 'Referral source *')}${opt('npi', 'Source NPI')}${opt('month', 'Month')}${opt('date', 'Referral date')}${opt('count', 'Count (blank = 1 per row)')}${opt('admits', 'Admits / starts')}${opt('payer', 'Payer')}</div>
    <button class="btn dark" id="doMatch" style="margin-top:10px">Match sources</button></div><div id="matchOut"></div>`;
  $('#doMatch').onclick = () => {
    document.querySelectorAll('[data-col]').forEach(s => cols[s.dataset.col] = +s.value);
    if (cols.source < 0) return toast('Pick the referral source column.');
    if (cols.month < 0 && cols.date < 0) return toast('Pick a month or date column.');
    const agg = new Map(); let bad = 0;
    for (const r of rows.slice(1)) {
      const name = (r[cols.source] || '').trim(); const month = toMonth(cols.month >= 0 ? r[cols.month] : r[cols.date]);
      if (!name || !month) { bad++; continue; }
      const npi = cols.npi >= 0 ? (r[cols.npi] || '').replace(/\D/g, '') : '';
      const payer = cols.payer >= 0 ? (r[cols.payer] || '').trim().slice(0, 40) : '';
      const k = `${name}|${npi}|${month}|${payer}`;
      const a = agg.get(k) || { name, npi, month, payer, count: 0, admits: cols.admits >= 0 ? 0 : null };
      a.count += cols.count >= 0 ? (+String(r[cols.count]).replace(/[^\d.]/g, '') || 0) : 1;
      if (cols.admits >= 0) { const v = String(r[cols.admits] || '').trim(); a.admits += /^(y|yes|true|admitted|won)$/i.test(v) ? 1 : (+v.replace(/[^\d.]/g, '') || 0); }
      agg.set(k, a);
    }
    const names = [...new Set([...agg.values()].map(a => `${a.name}|${a.npi}`))];
    const resolved = {};
    for (const nk of names) {
      const [name, npi] = nk.split('|');
      if (npi && S.byId.has(npi)) { resolved[nk] = { key: npi, conf: 'npi', cands: [] }; continue; }
      const prior = (S.referrals.rows || []).find(r => r.name === name);
      if (prior) { resolved[nk] = { key: prior.key, conf: 'previous', cands: [] }; continue; }
      const c = matchName(name);
      resolved[nk] = c[0] && c[0][0] >= .75 ? { key: c[0][1].id, conf: 'auto', cands: c } : { key: c[0] && c[0][0] >= .4 ? c[0][1].id : `x:${name.toLowerCase().replace(/\s+/g, ' ')}`, conf: c[0] && c[0][0] >= .4 ? 'suggested' : 'none', cands: c };
    }
    const vol = {}; for (const a of agg.values()) { const nk = `${a.name}|${a.npi}`; vol[nk] = (vol[nk] || 0) + a.count; }
    const order = names.sort((a, b) => ({ none: 0, suggested: 1, auto: 2, previous: 3, npi: 4 }[resolved[a].conf] - { none: 0, suggested: 1, auto: 2, previous: 3, npi: 4 }[resolved[b].conf]) || vol[b] - vol[a]);
    const months = [...new Set([...agg.values()].map(a => a.month))].sort();
    $('#matchOut').innerHTML = `<div class="section"><h3>2. Check matches</h3>
      <p class="small">${fmt(agg.size)} source-month rows from ${fmt(names.length)} sources, ${esc(months[0])} to ${esc(months.at(-1))}${bad ? ` · ${bad} rows skipped (missing source or date)` : ''}. Review anything marked <span class="chip st-Grow">check</span>.</p>
      <div style="max-height:380px;overflow:auto"><table><thead><tr><th>Your name for it</th><th class="num">Refs</th><th>Matched to</th></tr></thead><tbody>
      ${order.map((nk, i) => { const r = resolved[nk]; const [name] = nk.split('|'); return `<tr><td class="small">${esc(name)}</td><td class="num small">${vol[nk]}</td><td><select data-nk="${i}" style="font-size:12px;padding:4px">
        ${r.conf === 'npi' || r.conf === 'previous' ? `<option value="${esc(r.key)}">${esc(S.byId.get(r.key)?.name || name)} (${r.conf === 'npi' ? 'NPI' : 'saved'})</option>` : ''}
        ${r.cands.map(([sc, p]) => `<option value="${esc(p.id)}" ${p.id === r.key ? 'selected' : ''}>${esc(p.name)} · ${esc(p.type)} · ${esc(p.city)}</option>`).join('')}
        <option value="x:${esc(name.toLowerCase().replace(/\s+/g, ' '))}" ${r.key.startsWith('x:') ? 'selected' : ''}>Keep as its own source (not in public data)</option></select>
        ${r.conf === 'suggested' ? '<span class="chip st-Grow">check</span>' : r.conf === 'none' ? '<span class="chip">no match</span>' : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><label style="margin:0" class="small"><input type="radio" name="mode" value="merge" checked style="width:auto"> Add to existing data (same months are replaced)</label><label style="margin:0" class="small"><input type="radio" name="mode" value="replace" style="width:auto"> Replace all existing data</label></div>
      <button class="btn primary" id="save" style="margin-top:10px">Save ${fmt(agg.size)} rows</button></div>`;
    $('#save').onclick = async e => {
      e.target.disabled = true;
      const pick = {}; document.querySelectorAll('[data-nk]').forEach(s => pick[order[+s.dataset.nk]] = s.value);
      const out = [...agg.values()].map(a => { const key = pick[`${a.name}|${a.npi}`]; return { key, npi: /^\d{10}$/.test(key) ? key : a.npi, name: a.name, month: a.month, count: a.count, admits: a.admits, payer: a.payer }; });
      const r = await post('saveReferrals', { rows: out, mode: document.querySelector('[name=mode]:checked').value, fileName: f.name });
      S.referrals = r.referrals; rescore(); viewReferrals(); toast('Referral data saved');
    };
  };
}
function renderScorecard() {
  const rows = S.referrals.rows || [], el = $('#scorecard');
  if (!rows.length) { el.innerHTML = `<h2>Scorecard</h2><div class="empty"><img src="${IMG('g-cl-stk-score-cut')}" alt="" style="width:220px">Upload your referral history to see trends by month and by source.<br><span class="small">Use the template if your system's export doesn't import cleanly.</span></div>`; return; }
  const m = S.months; const mode = S.scoreMode;
  const byMonth = Object.fromEntries(m.map(k => [k, 0])), admitsM = Object.fromEntries(m.map(k => [k, 0]));
  let hasAdmits = false;
  for (const r of rows) if (r.month in byMonth) { byMonth[r.month] += r.count; if (r.admits != null) { admitsM[r.month] += r.admits; hasAdmits = true; } }
  let labels, vals, admits;
  if (mode === 'qoq') { labels = [0, 1, 2, 3].map(q => `${monthLabel(m[q * 3])}–${monthLabel(m[q * 3 + 2])}`); vals = [0, 1, 2, 3].map(q => m.slice(q * 3, q * 3 + 3).reduce((a, k) => a + byMonth[k], 0)); admits = [0, 1, 2, 3].map(q => m.slice(q * 3, q * 3 + 3).reduce((a, k) => a + admitsM[k], 0)); }
  else { labels = m.map(monthLabel); vals = m.map(k => byMonth[k]); admits = m.map(k => admitsM[k]); }
  const max = Math.max(1, ...vals), W = 560, H = 200, PL = 26, bw = (W - PL) / vals.length;
  const chart = `<svg class="chart" viewBox="0 0 ${W} ${H + 24}" preserveAspectRatio="none" role="img" aria-label="Referrals over time">
    ${[0.5, 1].map(f => `<line x1="0" x2="${W}" y1="${H - H * f * .9}" y2="${H - H * f * .9}" stroke="#eef1f5"/><text x="2" y="${H - H * f * .9 - 3}" font-size="10" fill="#98a2b3">${Math.round(max * f)}</text>`).join('')}
    ${vals.map((v, i) => `<rect x="${PL + i * bw + bw * .18}" y="${H - H * .9 * v / max}" width="${bw * .64}" height="${H * .9 * v / max}" rx="3" fill="${i === vals.length - 1 ? '#EE8B4B' : '#0D2747'}"><title>${labels[i]}: ${v} referrals${hasAdmits ? `, ${admits[i]} admits` : ''}</title></rect>
      ${hasAdmits ? `<rect x="${PL + i * bw + bw * .18}" y="${H - H * .9 * admits[i] / max}" width="${bw * .64}" height="2" fill="#fff" opacity=".8"/>` : ''}
      <text x="${PL + i * bw + bw / 2}" y="${H + 16}" font-size="10" text-anchor="middle" fill="#667085">${labels[i]}</text>
      <text x="${PL + i * bw + bw / 2}" y="${H - H * .9 * v / max - 4}" font-size="10" text-anchor="middle" fill="#344054">${v || ''}</text>`).join('')}</svg>`;
  // Source table with change
  const span = mode === 'qoq' ? 3 : 1;
  const top = S.scored.filter(s => s.total12).map(s => { const cur = s.h.slice(12 - span).reduce((a, b) => a + b, 0), prev = s.h.slice(12 - 2 * span, 12 - span).reduce((a, b) => a + b, 0); return { s, cur, prev, d: cur - prev }; })
    .sort((a, b) => b.s.total12 - a.s.total12).slice(0, 15);
  const totalCur = vals.at(-1), totalPrev = vals.at(-2);
  el.innerHTML = `<div class="head"><h2>Scorecard</h2><div class="seg"><button data-m="mom" class="${mode === 'mom' ? 'on' : ''}">Month over month</button><button data-m="qoq" class="${mode === 'qoq' ? 'on' : ''}">Quarter over quarter</button></div></div>
    <div class="row" style="gap:22px;margin:6px 0 4px"><div><span class="pill-n" style="font-size:20px">${fmt(totalCur)}</span> <span class="muted small">referrals, ${esc(labels.at(-1))}</span></div>
      <div class="${totalCur >= totalPrev ? 'up' : 'down'} small" style="font-weight:600">${totalCur >= totalPrev ? '▲' : '▼'} ${Math.abs(totalCur - totalPrev)} vs ${esc(labels.at(-2))}</div>
      ${hasAdmits ? `<div class="small muted">${fmt(admits.at(-1))} admits (${totalCur ? Math.round(100 * admits.at(-1) / totalCur) : 0}% conversion)</div>` : ''}</div>
    ${chart}
    <h3 style="margin-top:12px">Top sources, last 12 months</h3>
    <table><thead><tr><th>Source</th><th class="num">12 mo</th><th class="num">${mode === 'qoq' ? 'This qtr' : 'This mo'}</th><th class="num">Change</th></tr></thead><tbody>
    ${top.map(t => `<tr class="click" data-src="${esc(t.s.p.id)}"><td><b>${esc(t.s.p.name)}</b> <span class="chip st-${t.s.status}">${t.s.status}</span></td><td class="num">${t.s.total12}</td><td class="num">${t.cur}</td><td class="num ${t.d > 0 ? 'up' : t.d < 0 ? 'down' : 'muted'}">${t.d > 0 ? '+' : ''}${t.d}</td></tr>`).join('')}</tbody></table>
    ${payerMix(rows)}
    <h3 style="margin-top:14px">Referrals by source type, last 12 months</h3>${hbars((() => { const byG = {}; for (const x of S.scored) if (x.total12) { const g = groupOf(x.p.type); byG[g] = (byG[g] || 0) + x.total12; } return Object.keys(GROUPS).map(g => ({ label: g, value: byG[g] || 0, color: GROUP_COLOR[g] })); })())}`;
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.scoreMode = b.dataset.m; renderScorecard(); });
  bindCommon(el);
}
function payerMix(rows) {
  const set = new Set(S.months); const mix = {};
  for (const r of rows) if (set.has(r.month) && r.payer) mix[r.payer] = (mix[r.payer] || 0) + r.count;
  const tot = Object.values(mix).reduce((a, b) => a + b, 0); if (!tot) return '';
  return `<h3 style="margin-top:14px">Payer mix, last 12 months</h3><div class="row">${Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(k)} ${Math.round(100 * v / tot)}%</span>`).join('')}</div>`;
}
async function loadSample() {
  if (!confirm('Load SAMPLE referral data (made-up numbers on real sources in your market) so you can try the app? You can clear it later.')) return;
  // Deterministic pseudo-random sample on real, large, nearby sources.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pool = S.scored.filter(s => ['Hospital', 'Skilled nursing', 'Rehab hospital', 'Assisted living', 'Physician: geriatrics'].includes(s.p.type) && s.size >= .5).sort((a, b) => b.potential - a.potential).slice(0, 60);
  const months = S.months.length ? lastMonths(12, (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return monthKey(d); })()) : [];
  const out = [];
  pool.slice(0, 28).forEach((s, i) => {
    const base = 1 + Math.floor(rnd() * (s.p.type === 'Hospital' ? 7 : 4));
    const pattern = i % 7 === 3 ? 'quiet' : i % 5 === 1 ? 'drop' : i % 6 === 2 ? 'grow' : 'steady';
    months.forEach((m, j) => {
      let c = Math.max(0, Math.round(base + (rnd() - .5) * 2));
      if (pattern === 'quiet' && j >= 9) c = 0; if (pattern === 'drop' && j >= 9) c = Math.floor(c / 3); if (pattern === 'grow') c = Math.round(c * (0.5 + j / 11));
      if (c) out.push({ key: s.p.id, npi: /^\d{10}$/.test(s.p.id) ? s.p.id : '', name: s.p.name, month: m, count: c, admits: Math.round(c * (.45 + rnd() * .3)), payer: rnd() < .55 ? 'Private pay' : rnd() < .6 ? 'Long-term care insurance' : rnd() < .5 ? 'VA' : 'Medicaid waiver' });
    });
  });
  ['Self / family', 'Elder law attorney referrals', 'Church and community'].forEach((n, i) => months.forEach(m => { const c = Math.round(rnd() * (3 - i)); if (c) out.push({ key: `x:${n.toLowerCase()}`, npi: '', name: n, month: m, count: c, admits: Math.round(c * .6), payer: 'Private pay' }); }));
  const r = await post('saveReferrals', { rows: out, mode: 'replace', fileName: 'SAMPLE DATA' });
  S.referrals = r.referrals; rescore(); viewReferrals(); toast('Sample data loaded');
}

// ---------- Settings ----------
function officeRow(o) {
  return `<div class="off-row grid" data-id="${esc(o.id || '')}" style="grid-template-columns:1fr 2.2fr 80px 32px;gap:6px;align-items:center;margin-bottom:6px">
    <input name="label" placeholder="Label (e.g. Dallas)" value="${esc(o.label || '')}"><input name="address" placeholder="Street, city, state ZIP" value="${esc(o.address || '')}" title="${esc(o.matched || '')}">
    <input name="radius" type="number" min="3" max="75" value="${esc(o.radiusMiles || 20)}" title="Radius in miles"><button class="btn sm ghost" type="button" data-rm title="Remove">✕</button>
    ${o.unmatched ? '<div class="err small" style="grid-column:span 4;margin:0">Address not found. Check the spelling and ZIP.</div>' : o.matched ? `<div class="muted small" style="grid-column:span 4">${esc(o.matched)} · ${esc(o.radiusMiles)} mi radius</div>` : ''}</div>`;
}
function bindOffRows() { document.querySelectorAll('.off-row [data-rm]').forEach(b => b.onclick = () => b.closest('.off-row').remove()); }
async function viewSettings(sub) {
  const s = S.settings, admin = S.me.role === 'admin';
  $('#app').innerHTML = `<div class="hero-head"><img src="${IMG('g-cl-office-cut')}" alt="" style="width:120px"><div><span class="eyebrow">Settings</span><h1>Settings</h1></div></div>
    ${S.me.mustChange ? `<div class="notice">You're using a temporary password. Set a new one below.</div>` : ''}
    ${sub === 'setup' ? `<div class="notice info"><img src="${IMG('g-cl-stk-market-cut')}" alt=""><div><b>Welcome to Wellby${S.me.name ? ', ' + esc(S.me.name.split(' ')[0]) : ''}!</b> Add your office addresses below and save. Wellby loads every hospital, physician and facility around each office from national public data, scores them, and builds your plan.</div></div>` : ''}
    <div class="cols" style="margin-top:16px">
      <div><div class="card" id="offices"><h2>Offices and territory</h2><p class="muted small">Wellby loads every hospital, physician and facility within each office's radius from national public data. Anywhere in the US.</p>
        <div id="offList">${(s.offices || []).map(officeRow).join('')}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="addOff" type="button">+ Add office</button><button class="btn sm primary" id="saveOff" type="button">Save offices and reload market</button></div></div>
      <div class="card" style="margin-top:14px"><h2>Agency profile</h2><p class="muted small">Used to rank sources by distance and to write outreach in your voice.</p>
        <form id="sf">
          <label>Type of care<select name="careType">${Object.entries(CARE).map(([k, v]) => `<option value="${k}" ${careType() === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Agency name<input name="agencyName" value="${esc(s.agencyName)}" placeholder="e.g. Comfort Keepers of North Dallas"></label>
          <label>Your name for email sign-offs<input name="senderName" value="${esc(s.senderName)}" placeholder="e.g. Maria Lopez, Community Liaison"></label>
          <label>Website<input name="website" value="${esc(s.website)}" placeholder="https://"></label>
          <label>Services you offer<textarea name="services">${esc(s.services)}</textarea></label>
          <label>What makes you different (optional)<textarea name="pitch" placeholder="e.g. same-day starts, RN-supervised care plans, dementia-trained caregivers, bilingual staff">${esc(s.pitch)}</textarea></label>
          <label>Weekly outreach goal per person<input name="weeklyGoal" type="number" min="1" max="200" value="${esc(s.weeklyGoal || 10)}"></label>
          <label>Open approved emails in<select name="mailClient"><option value="gmail">Gmail</option><option value="outlook" ${s.mailClient === 'outlook' ? 'selected' : ''}>Outlook (web)</option><option value="default" ${s.mailClient === 'default' ? 'selected' : ''}>My default mail app</option></select></label>
          <button class="btn primary">Save profile</button></form></div></div>
      <div>
        ${billingCard()}
        ${S.me.super ? `<div class="card" id="workspaces" style="margin-bottom:14px"><span class="eyebrow sky">Wellby staff</span><h2>Workspaces</h2><p class="muted small">One per customer or demo. Switch from the menu at the top right.</p><div id="wsList" class="small"></div>${workspaceForm()}</div>` : ''}
        <div class="card" id="pw"><h2>Your password</h2><form id="pf"><label>Current password<input type="password" name="currentPassword" autocomplete="current-password" required></label><label>New password (10+ characters)<input type="password" name="newPassword" autocomplete="new-password" minlength="10" required></label><p class="err" id="pErr"></p><button class="btn">Change password</button></form></div>
        ${admin ? `<div class="card" style="margin-top:14px"><h2>Team</h2><div id="team" class="muted small">Loading…</div>
          <form id="inv" class="grid" style="grid-template-columns:1fr 1fr auto;gap:6px;margin-top:10px"><input name="name" placeholder="Name"><input name="email" type="email" placeholder="Email" required><select name="role" style="width:auto"><option value="marketer">Marketer</option><option value="admin">Admin</option></select><button class="btn sm dark" style="grid-column:span 3;justify-self:start">Invite</button></form><div id="invOut"></div></div>` : ''}
        <div class="card" style="margin-top:14px"><h2>Data</h2><div class="small">
          <p><b>Market:</b> ${fmt(S.market.providers.length)} referral sources around your offices, from a national dataset built ${esc(String(S.market.builtAt).slice(0, 10))} from:</p>
          <ul>${Object.values(S.market.sources).map(v => `<li>${esc(v)}</li>`).join('')}</ul>
          <p>${Object.entries(S.market.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)}: ${fmt(v)}`).join(' · ')}</p>
          <p><b>Your data:</b> referral counts by source and month, contacts and outreach notes, stored privately for your agency. No patient-level data is collected.</p></div></div>
      </div></div>`;
  if (sub === 'password') $('#pw').scrollIntoView();
  if (sub === 'setup') { $('#offices').scrollIntoView(); if (!(s.offices || []).length) { $('#offList').insertAdjacentHTML('beforeend', officeRow({})); bindOffRows(); } }
  if (sub === 'billing' && $('#billing')) {
    $('#billing').scrollIntoView();
    api('/api/billing').then(b => { const was = S.me.access?.status; S.me.access = b.access; if (!b.configured && $('#bNote')) $('#bNote').textContent = "Online billing isn't switched on yet."; if (b.access.status !== was) { renderMe(); viewSettings('billing'); if (b.access.status === 'active') toast('Thanks! Your subscription is active.'); } }).catch(() => {});
  }
  bindBilling();
  if (sub === 'workspaces' && $('#workspaces')) $('#workspaces').scrollIntoView();
  if (S.me.super) { bindWorkspaceForm(); drawWsList(); document.querySelectorAll('[data-ws]').forEach(b => b.onclick = async () => { await api('/api/workspaces', { action: 'switch', id: b.dataset.ws }); location.hash = '#map'; $('#app').innerHTML = '<div class="loading">Switching workspace…</div>'; boot(); }); }
  $('#addOff').onclick = () => { $('#offList').insertAdjacentHTML('beforeend', officeRow({})); bindOffRows(); };
  bindOffRows();
  $('#saveOff').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Saving…';
    const offices = [...document.querySelectorAll('.off-row')].map(r => ({ id: r.dataset.id, label: $('[name=label]', r).value, address: $('[name=address]', r).value, radiusMiles: $('[name=radius]', r).value })).filter(o => o.address.trim());
    const r = await post('saveSettings', { settings: { offices } }); S.settings = r.settings;
    const bad = r.settings.offices.filter(o => o.unmatched);
    $('#app').innerHTML = '<div class="loading">Loading your market…</div>';
    await loadMarket((d, n) => { $('#app').innerHTML = `<div class="loading">Loading your market… ${Math.round(100 * d / n)}%</div>`; });
    rescore(); if (sub === 'setup' && S.offices.length) { location.hash = '#map'; toast(`Market loaded: ${fmt(S.market.providers.length)} referral sources`); return; } viewSettings(); toast(bad.length ? `Couldn't find: ${bad.map(o => o.label).join(', ')}` : `Market loaded: ${fmt(S.market.providers.length)} referral sources`);
  };
  $('#sf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const r = await post('saveSettings', { settings: f }); S.settings = r.settings; $('#agencyName').textContent = S.settings.agencyName || ''; rescore(); viewSettings(); toast('Profile saved'); };
  $('#pf').onsubmit = async e => { e.preventDefault(); try { await api('/api/auth?action=password', Object.fromEntries(new FormData(e.target))); S.me.mustChange = false; toast('Password changed'); viewSettings(); } catch (err) { $('#pErr').textContent = err.message; } };
  if (admin) {
    const renderTeam = users => { $('#team').innerHTML = `<table>${users.map(u => `<tr><td><b>${esc(u.name)}</b><div class="muted small">${esc(u.email)}</div></td><td class="small">${esc(u.role)}${u.disabled ? ' · disabled' : ''}${u.mustChange ? ' · invited' : ''}</td><td class="num"><button class="btn sm ghost" data-reset="${esc(u.email)}">Reset password</button>${u.email !== S.me.email ? `<button class="btn sm ghost" data-toggle="${esc(u.email)}">${u.disabled ? 'Enable' : 'Disable'}</button>` : ''}</td></tr>`).join('')}</table>`;
      document.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { const r = await api('/api/users', { action: 'reset', email: b.dataset.reset }); showTemp(b.dataset.reset, r.tempPassword); renderTeam(r.users); });
      document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { const r = await api('/api/users', { action: 'toggle', email: b.dataset.toggle }); renderTeam(r.users); }); };
    const showTemp = (email, pw) => { $('#invOut').innerHTML = `<div class="notice info" style="margin-top:10px;display:block">Send <b>${esc(email)}</b> this temporary password: <code>${esc(pw)}</code><br>They sign in at <b>${esc(location.origin)}/login</b> and will be asked to change it. It won't be shown again.</div>`; };
    api('/api/users').then(r => renderTeam(r.users)).catch(e => $('#team').textContent = e.message);
    $('#inv').onsubmit = async e => { e.preventDefault(); try { const f = Object.fromEntries(new FormData(e.target)); const r = await api('/api/users', { action: 'invite', ...f }); showTemp(f.email, r.tempPassword); renderTeam(r.users); e.target.reset(); } catch (err) { toast(err.message); } };
  }
}

// Extension modules (public/x-*.js) register views in window.WellbyExt and use these helpers.
window.Wellby = { icp, rescore, S, $, esc, fmt, today, addDays, fmtShort, agoText, KIND, IMG, STATUS_COLOR, api, post, toast, route, refreshView, openSource, closeDrawer, handleFile, navBadges, isSkip, phoneFmt, flowState, queueItems, daysSince };
boot();
