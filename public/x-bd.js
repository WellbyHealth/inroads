// Business development workflow, phase 1 of the BD plan (claude/bd-workflow-plan.md):
//   - Five tabs that follow the rep's week: Today · Plan · Partners · Referrals · Results. Each tab groups the
//     existing pages behind a small sub-nav (Plan = Territory, Targets, Win flows, Calendar).
//   - An always-on Log button (and the L key): partner, what happened, a note (dictation where the browser
//     supports it), the next touch, optionally a drafted thank-you.
//   - Today's stops: booked meetings plus the visits due, in driving order, each with its reason and an ask.
//   - A one-page partner sheet per source (claude/partner-sheet-spec.md, phase 1 data): internal view for the rep,
//     partner copy to hand over. Sharing it is logged against the partner.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pct = v => `${Math.round(v * 100)}%`;
const poss = n => /s$/i.test(n) ? `${n}'` : `${n}'s`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const timeOf = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase();

// ---------- Tabs ----------
const GROUPS = {
  today: { label: 'Today', subs: [['today', 'Today', '#today'], ['queue', 'Queue', '#queue']] },
  plan: { label: 'Plan', subs: [['territory', 'Territory', '#territory'], ['map', 'Targets', '#map'], ['flows', 'Win flows', '#flows'], ['calendar', 'Calendar', '#calendar']] },
  partners: { label: 'Partners', subs: [['scorecard', 'Scorecard', '#scorecard'], ['contacts', 'Contacts', '#contacts']] },
  referrals: { label: 'Referrals', subs: [['referrals', 'Referrals', '#referrals']] },
  results: { label: 'Results', subs: [['results', 'Results', '#results']] },
};
const VIEW_GROUP = { sources: 'plan', sheet: 'partners' };
for (const [g, d] of Object.entries(GROUPS)) for (const [v] of d.subs) VIEW_GROUP[v] = g;
X.navGroups = GROUPS;
X.groupOf = v => VIEW_GROUP[v] || null;

function markNav(view) {
  const g = VIEW_GROUP[view];
  document.querySelectorAll('#nav a[data-view]').forEach(a => { if (a.id !== 'navLog') a.classList.toggle('on', a.dataset.view === g); });
  const h = location.hash.split('/')[0];
  if (g && GROUPS[g].subs.some(x => x[2] === h)) try { sessionStorage.setItem('wb_last_' + g, h); } catch {}
  // Each tab returns to the page you last used inside it.
  for (const [k, d] of Object.entries(GROUPS)) {
    const a = document.querySelector(`#nav a[data-view="${k}"]`); if (!a) continue;
    let last = null; try { last = sessionStorage.getItem('wb_last_' + k); } catch {}
    a.setAttribute('href', last && d.subs.some(x => x[2] === last) ? last : d.subs[0][2]);
  }
}
function subnav(view) {
  const app = document.getElementById('app'), g = VIEW_GROUP[view];
  if (!app) return;
  app.querySelector(':scope > .subnav')?.remove();
  if (!g || GROUPS[g].subs.length < 2) return;
  const cur = view === 'sources' ? 'map' : view;
  const el = document.createElement('nav'); el.className = 'subnav'; el.setAttribute('aria-label', GROUPS[g].label);
  el.innerHTML = GROUPS[g].subs.map(([v, l, h]) => `<a href="${h}"${v === cur ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('');
  app.prepend(el);
}

// ---------- Log ----------
const TYPES = [['visit', 'Visit'], ['dropoff', 'Drop-off'], ['call', 'Call'], ['email', 'Email'], ['lunch', 'Lunch / in-service'], ['sentref', 'We sent them a client']];
const NEXT = { visit: 14, dropoff: 14, call: 7, email: 7, lunch: 21, sentref: 14 };
const MIC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
// A name after "patient", "Mr."/"Mrs." etc. Notes stay free of patient details until Wellby has a BAA in place.
const PHI = /\b(patient|pt\.?|client|mr\.?|mrs\.?|ms\.?|miss)\s+[A-Z][a-z]+/;

function recentIds() {
  const { S } = W(), out = [];
  for (const a of [...S.activity].sort((x, y) => (y.doneAt || y.at).localeCompare(x.doneAt || x.at))) {
    if (a.status !== 'done' || !a.sourceId || out.includes(a.sourceId) || !S.scoredById.get(a.sourceId)) continue;
    out.push(a.sourceId); if (out.length >= 5) break;
  }
  return out;
}
function openLog(opts = {}) {
  const { S, esc, addDays, today } = W();
  if (!S.scored?.length) { W().toast('Add your offices first, so Wellby can load your partners.'); return; }
  closeLog();
  const st = { id: opts.sourceId && S.scoredById.get(opts.sourceId) ? opts.sourceId : null, kind: opts.kind || 'visit', warned: false, rec: null };
  const dlg = document.createElement('div'); dlg.id = 'logDlg';
  const recents = recentIds();
  dlg.innerHTML = `<div class="logBack" data-x></div>
    <form class="logPanel" role="dialog" aria-modal="true" aria-labelledby="logH" novalidate>
      <div class="logHead"><h2 id="logH">Log it</h2><button type="button" class="btn ghost sm" data-x aria-label="Close">✕</button></div>
      <div class="logFld"><span class="logLbl">Partner</span><div class="logPick"></div></div>
      <div class="logFld"><span class="logLbl">What happened</span><div class="logTypes" role="radiogroup">${TYPES.map(([k, l]) => `<button type="button" role="radio" data-k="${k}">${l}</button>`).join('')}</div></div>
      <div class="logFld"><label class="logLbl" for="logNote">Note</label><div class="logNote"><textarea id="logNote" name="note" rows="3" placeholder="Saw Maria in case management. Two discharges Thursday; bring the dementia flyer."></textarea><button type="button" class="logMic" aria-label="Dictate" title="Dictate" hidden>${MIC}</button></div>
        <div class="small muted">Leave out patient names and health details.</div></div>
      <div class="logRow"><label class="logLbl">Next touch <input type="date" name="followUp"></label><label class="logChk"><input type="checkbox" name="draft"> Draft a follow-up email</label></div>
      <p class="logErr" role="alert"></p>
      <div class="logBtns"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`;
  document.body.appendChild(dlg); document.body.classList.add('logOpen');
  const f = dlg.querySelector('form'), err = dlg.querySelector('.logErr'), pick = dlg.querySelector('.logPick');
  const setKind = k => { st.kind = k; dlg.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.k === k))); f.followUp.value = addDays(today(), NEXT[k] || 14); };
  const drawPick = () => {
    const s = st.id && S.scoredById.get(st.id);
    if (s) { pick.innerHTML = `<div class="logSel"><b>${esc(s.p.name)}</b><span class="muted small">${esc(s.p.type || '')}${s.p.city ? ' · ' + esc(s.p.city) : ''}</span><button type="button" class="btn sm ghost" data-chg>Change</button></div>`; pick.querySelector('[data-chg]').onclick = () => { st.id = null; drawPick(); }; return; }
    pick.innerHTML = `<input name="q" placeholder="Search a hospital, practice or facility" autocomplete="off" aria-label="Search partners"><div class="logHits" role="listbox"></div>
      ${recents.length ? `<div class="logRecent"><span class="muted small">Recent</span>${recents.map(id => `<button type="button" class="chip" data-pid="${esc(id)}">${esc(S.scoredById.get(id).p.name)}</button>`).join('')}</div>` : ''}`;
    const q = pick.querySelector('input'), hits = pick.querySelector('.logHits');
    const choose = id => { st.id = id; drawPick(); f.note.focus(); };
    pick.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => choose(b.dataset.pid));
    q.oninput = () => {
      const t = q.value.trim().toLowerCase();
      const list = t.length < 2 ? [] : S.scored.filter(s => s.p.name.toLowerCase().includes(t)).sort((a, b) => (b.total12 || 0) - (a.total12 || 0) || b.priority - a.priority).slice(0, 7);
      hits.innerHTML = list.map(s => `<button type="button" role="option" data-pid="${esc(s.p.id)}"><b>${esc(s.p.name)}</b><span class="muted small">${esc(s.p.type || '')}${s.p.city ? ' · ' + esc(s.p.city) : ''}${s.total12 ? ` · ${s.total12} referrals in 12 mo` : ''}</span></button>`).join('') || (t.length >= 2 ? '<div class="muted small" style="padding:8px">No match. Check the spelling, or add it from Plan → Targets.</div>' : '');
      hits.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => choose(b.dataset.pid));
    };
    q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); hits.querySelector('[data-pid]')?.click(); } };
    setTimeout(() => q.focus(), 30);
  };
  drawPick(); setKind(st.kind);
  if (opts.note) f.note.value = opts.note;
  dlg.querySelectorAll('[data-k]').forEach(b => b.onclick = () => setKind(b.dataset.k));
  dlg.querySelectorAll('[data-x]').forEach(b => b.onclick = closeLog);
  // Dictation: the browser's own speech recognition (Chrome, Edge, Safari). Nothing is sent to Wellby but the text.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = dlg.querySelector('.logMic');
  if (SR) {
    mic.hidden = false;
    mic.onclick = () => {
      if (st.rec) { st.rec.stop(); return; }
      const r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.continuous = true; st.rec = r;
      r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) f.note.value = (f.note.value.trim() + ' ' + e.results[i][0].transcript.trim()).trim(); };
      r.onend = () => { st.rec = null; mic.classList.remove('on'); mic.setAttribute('aria-label', 'Dictate'); };
      r.onerror = () => { err.textContent = 'Dictation stopped. You can type the note instead.'; };
      try { r.start(); mic.classList.add('on'); mic.setAttribute('aria-label', 'Stop dictation'); } catch { st.rec = null; }
    };
  }
  f.onsubmit = async e => {
    e.preventDefault(); err.textContent = '';
    const s = st.id && S.scoredById.get(st.id);
    if (!s) { err.textContent = 'Pick the partner first.'; pick.querySelector('input')?.focus(); return; }
    const note = f.note.value.trim();
    if (PHI.test(note) && !st.warned) { st.warned = true; err.textContent = 'That looks like a patient name. Remove it, or press Save again to keep it.'; return; }
    const label = (TYPES.find(t => t[0] === st.kind) || [, 'Touch'])[1];
    const subject = note ? note.slice(0, 300) : st.kind === 'sentref' ? `Referred a client to ${s.p.name}` : label;
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await W().post('addActivity', { activity: { sourceId: s.p.id, sourceName: s.p.name, kind: st.kind, status: 'done', subject, body: note.length > 300 ? note : '', followUp: f.followUp.value } });
      S.activity = r.activity; W().rescore?.();
      const draft = f.draft.checked; closeLog();
      W().toast(`${label} logged for ${s.p.name}`);
      W().refreshView();
      if (draft) { W().openSource(s.p.id); setTimeout(() => document.querySelector(`#drawer [data-draft="${CSS.escape(s.p.id)}"][data-kind="email"]`)?.click(), 150); }
    } catch (x) { err.textContent = x.message || 'Could not save. Try again.'; btn.disabled = false; btn.textContent = 'Save'; }
  };
}
function closeLog() { const d = document.getElementById('logDlg'); if (!d) return; d.remove(); document.body.classList.remove('logOpen'); }
X.openLog = openLog;
X.log = () => { history.replaceState(null, '', '#today'); W().route(); setTimeout(() => openLog(), 30); };

// ---------- Today's stops ----------
const askFor = s => s.status === 'Protect' && !s.last3 ? 'Ask what changed, and what it would take to be their first call again.' : ASK[s.status] || '';
const ASK = { Protect: 'Ask what would win back their next discharge.', Grow: 'Ask for the next two patients who need care at home.', Open: 'Ask who handles referrals for care at home, and how they choose.', Healthy: 'Thank them, and share the partner sheet.' };
function reasonFor(s, t) {
  if (s.status === 'Protect' && s.prior3 > s.last3) return `Referrals down to ${s.last3} from ${s.prior3} last quarter`;
  if (t?.since == null) return `No visit logged yet${s.total12 ? ` · ${plural(s.total12, 'referral')} in 12 months` : ''}`;
  return `Last visit ${t.since} days ago${s.last3 ? ` · ${plural(s.last3, 'referral')} last quarter` : ''}`;
}
function briefFor(id) {
  const { S, agoText, KIND } = W();
  const c = (S.contacts[id] || []).slice(0, 2).map(c => [c.name, c.role].filter(Boolean).join(', ')).filter(Boolean);
  const last = S.activity.filter(a => a.sourceId === id && a.status === 'done').sort((a, b) => (b.doneAt || b.at).localeCompare(a.doneAt || a.at))[0];
  const ag = last ? agoText((last.doneAt || last.at).slice(0, 10)) : '', when = /^(Today|Yesterday)$/.test(ag) ? ag.toLowerCase() : /ago$/.test(ag) ? ag : 'on ' + ag;
  return [c.length ? `See ${c.join(' or ')}` : 'No contact saved yet', last ? `last: ${(KIND[last.kind] || last.kind).toLowerCase()} ${when}` : ''].filter(Boolean).join(' · ');
}
let calAsked = false;
function stopsHtml() {
  const { S, esc, today, queueItems } = W(), t = today();
  const cal = X.calendarData?.();
  if (cal && !cal.loaded && !calAsked && X.calendarReload) { calAsked = true; X.calendarReload().then(() => { if (S.view === 'today' && !X._queueMode) drawStops(); }).catch(() => {}); }
  const seen = new Set(), booked = [], due = [];
  for (const m of cal?.meetings || []) {
    if (m.status !== 'scheduled' || !m.start || localDay(m.start) !== t) continue;
    booked.push({ id: m.sourceId, name: m.sourceName || m.title, at: m.start, reason: `${m.title || 'Meeting'}${m.contact ? ' with ' + m.contact : ''}` });
    if (m.sourceId) seen.add(m.sourceId);
  }
  booked.sort((a, b) => a.at.localeCompare(b.at));
  const needs = (cal?.meetings || []).filter(m => m.status === 'scheduled' && m.end && Date.parse(m.end) < Date.now() && localDay(m.start) < t).length;
  for (const { id, fs } of queueItems().steps) if (['visit', 'lunch'].includes(fs.next.kind) && !seen.has(id) && S.scoredById.get(id)) { due.push({ s: S.scoredById.get(id), reason: `${fs.next.label}${fs.next.due < t ? ' · overdue' : ''}` }); seen.add(id); }
  for (const x of X.visitsDue?.() || []) { if (due.length >= 6) break; if (seen.has(x.s.p.id)) continue; due.push({ s: x.s, reason: reasonFor(x.s, x.t) }); seen.add(x.s.p.id); }
  const { off, stops } = X.routeStops && due.length ? X.routeStops(due) : { off: null, stops: due };
  const maps = X.mapsUrl && stops.length ? X.mapsUrl(off, stops) : '';
  const acts = id => id ? `<div class="stopA"><button class="btn sm primary" data-log="${esc(id)}">Log</button><a class="btn sm" href="#sheet/${encodeURIComponent(id)}">Sheet</a></div>` : '';
  const row = (n, id, name, why, ask, meta) => `<div class="stop"><span class="stopN">${n}</span><div class="stopB"><div>${id ? `<button class="linklike name" data-open="${esc(id)}">${esc(name)}</button>` : `<b>${esc(name)}</b>`}${meta ? ` <span class="muted small">${meta}</span>` : ''}</div><div class="stopWhy">${esc(why)}</div>${ask ? `<div class="stopAsk small">${esc(ask)}</div>` : ''}${id ? `<div class="small muted">${esc(briefFor(id))}</div>` : ''}</div>${acts(id)}</div>`;
  let n = 0;
  const bookedRows = booked.map(b => { const s = b.id && S.scoredById.get(b.id); return row(timeOf(b.at), b.id && s ? b.id : null, b.name, b.reason, s ? askFor(s) : '', ''); }).join('');
  const dueRows = stops.map(x => row(++n, x.s.p.id, x.s.p.name, x.reason, askFor(x.s), x.leg != null ? `· ${x.leg.toFixed(1)} mi` : '')).join('');
  return `<div class="card" id="bdStops"><div class="head"><div><h2>Today's stops</h2><span class="muted small">${booked.length || stops.length ? `${booked.length ? plural(booked.length, 'meeting') + ' booked' : ''}${booked.length && stops.length ? ' · ' : ''}${stops.length ? plural(stops.length, 'visit') + ' due, in driving order' : ''}` : 'Nothing booked or due today.'}</span></div>
    <div class="row">${maps ? `<a class="btn sm" href="${esc(maps)}" target="_blank" rel="noopener">Directions</a>` : ''}${X.openMeeting ? '<button class="btn sm" data-newmtg>New meeting</button>' : ''}<a class="btn sm ghost" href="#queue">Plan a visit day</a></div></div>
    ${needs ? `<p class="small" style="margin:4px 0 0"><b>${needs}</b> past meeting${needs === 1 ? '' : 's'} still need${needs === 1 ? 's' : ''} an outcome. <a href="#calendar/list">Log how ${needs === 1 ? 'it' : 'they'} went</a></p>` : ''}
    ${bookedRows ? `<h3>Booked</h3>${bookedRows}` : ''}${dueRows ? `<h3>Due for a visit</h3>${dueRows}` : ''}
    ${!bookedRows && !dueRows ? `<p class="small muted" style="margin:0">Your top partners are all visited recently. Open <a href="#territory">Plan</a> to pick someone new to meet.</p>` : ''}</div>`;
}
function bindStops(el) {
  const { openSource } = W();
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openSource(b.dataset.open));
  el.querySelectorAll('[data-log]').forEach(b => b.onclick = () => openLog({ sourceId: b.dataset.log, kind: 'visit' }));
  el.querySelector('[data-newmtg]')?.addEventListener('click', () => X.openMeeting({ day: W().today() }));
}
function drawStops() {
  const app = document.getElementById('app'); if (!app) return;
  const old = app.querySelector('#bdStops');
  const tmp = document.createElement('div'); tmp.innerHTML = stopsHtml(); const el = tmp.firstElementChild;
  if (old) old.replaceWith(el);
  else { const head = app.querySelector('.head'); if (head) head.after(el); else app.prepend(el); }
  bindStops(el);
}

// ---------- Partner sheet ----------
const SH = { mode: 'internal' };
function sheetData(id) {
  const { S, flowState, today } = W();
  const s = S.scoredById.get(id); if (!s) return null;
  const m = S.months || [], h = s.h || [];
  const quarters = [0, 3, 6, 9].map(i => ({ label: m[i] ? `${MON[+m[i].slice(5, 7) - 1]}–${MON[+m[i + 2].slice(5, 7) - 1]}` : '', n: h.slice(i, i + 3).reduce((a, v) => a + (v || 0), 0) }));
  const last3 = new Set(m.slice(9));
  let admits = null; for (const r of S.referrals.rows || []) if (r.key === id && last3.has(r.month) && r.admits != null) admits = (admits || 0) + r.admits;
  const sent = S.activity.filter(a => a.sourceId === id && a.kind === 'sentref' && a.status === 'done' && W().daysSince(a.doneAt || a.at) <= 92).reduce((a, x) => a + (x.count || 1), 0);
  const outQ = +(S.settings.outbound || {})[id] || 0;
  const estQ = outQ ? null : X.outPerYear ? Math.max(1, Math.round(X.outPerYear(s) / 4)) : null;
  const base = outQ || estQ, share = base ? Math.min(1, s.last3 / base) : null;
  const fs = flowState(id), ti = X.touchInfo?.(id);
  const next = ti?.nextIn ? { date: localDay(ti.nextIn.start), what: ti.nextIn.title || 'Visit' } : fs?.next ? { date: fs.next.due, what: fs.next.label } : s.due ? { date: s.due, what: 'Check-in' } : null;
  const period = quarters[3].label ? `${quarters[3].label} ${m[11].slice(0, 4)}` : 'Last 3 months';
  const goal = s.last3 ? Math.ceil(s.last3 * 1.25) : 2;
  const care = (S.settings.careType || 'home_care').replace(/_/g, ' ');
  const pts = [];
  if (s.last3) pts.push(`You sent us ${plural(s.last3, 'referral')} this quarter${s.prior3 ? (s.last3 >= s.prior3 ? `, up from ${s.prior3}` : `, down from ${s.prior3}`) : ''}. Thank you.`);
  if (admits != null && s.last3) pts.push(`We started care for ${admits} of them.`);
  if (sent) pts.push(`We sent ${plural(sent, 'client')} your way this quarter.`);
  if (share != null && s.last3) pts.push({ internal: true, t: `About ${pct(share)} of their ${care} referrals come to us${outQ ? '' : ' (estimate)'}. Ask what it would take to be their first call.` });
  if (!s.last3) pts.push(`We'd like to be your first call for ${care}. We can start care quickly; call us directly.`);
  return { s, quarters, admits, sent, share, shareIsEst: !outQ, next, period, goal, pts: pts.map(x => typeof x === 'string' ? { t: x } : x), claim: (S.settings.sheetNotes || {})[id] || '', contacts: S.contacts[id] || [] };
}
function bars(q) {
  const max = Math.max(1, ...q.map(x => x.n)), H = 96;
  return `<svg class="shBars" viewBox="0 0 320 ${H + 40}" role="img" aria-label="Referrals by quarter: ${q.map(x => `${x.label} ${x.n}`).join(', ')}">${q.map((x, i) => { const bh = Math.max(2, Math.round(H * x.n / max)), bx = 20 + i * 76; return `<rect x="${bx}" y="${16 + H - bh}" width="48" height="${bh}" rx="6" fill="${i === 3 ? 'var(--ink, #000)' : '#D9D7CF'}"/><text x="${bx + 24}" y="${10 + H - bh}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink, #000)">${x.n}</text><text x="${bx + 24}" y="${H + 34}" text-anchor="middle" font-size="11.5" fill="var(--muted, #6B6A64)">${x.label}</text>`; }).join('')}</svg>`;
}
X.sheet = sub => {
  const { S, esc, fmtShort } = W(), app = document.getElementById('app');
  const id = decodeURIComponent(sub || ''), d = sheetData(id);
  if (!d) { app.innerHTML = '<div class="card empty">That partner isn\'t in your market. <a href="#scorecard">Back to Partners</a></div>'; return; }
  const { s } = d, internal = SH.mode === 'internal', me = S.me?.name || '';
  const big = [
    ['Referrals to us', s.last3, d.quarters[2].n !== s.last3 ? `${s.last3 >= d.quarters[2].n ? 'up' : 'down'} from ${d.quarters[2].n} last quarter` : 'same as last quarter'],
    ...(d.admits != null ? [['Care started', d.admits, s.last3 ? `${pct(d.admits / s.last3)} of referrals` : '']] : []),
    ...(internal && d.share != null ? [['Share of their referrals', pct(d.share), d.shareIsEst ? 'estimate from beds and size' : 'from their outbound count']] : []),
    ...(d.sent ? [['Clients we sent you', d.sent, 'this quarter']] : []),
  ];
  app.innerHTML = `<div class="shTools noPrint">
      <a class="btn sm ghost" href="#scorecard">← Partners</a>
      <div class="seg" role="tablist" aria-label="Sheet version"><button data-m="internal" class="${internal ? 'on' : ''}" aria-pressed="${internal}">Internal view</button><button data-m="partner" class="${!internal ? 'on' : ''}" aria-pressed="${!internal}">Partner copy</button></div>
      <span class="grow"></span><button class="btn sm" id="shShare">Mark as shared</button><button class="btn sm primary" id="shPrint">Print or save PDF</button></div>
    <p class="small muted noPrint shHint">${internal ? 'Your prep for the visit: the real numbers, what they say, and the ask. Switch to the partner copy to hand it over.' : 'What the partner sees: a thank-you with their numbers and what happened. Edit any line before you print.'}</p>
    <article class="sheetPage ${internal ? 'internal' : 'partner'}">
      <header class="shHead"><div><div class="shEye">${internal ? 'Partner sheet · internal' : `${esc(S.settings.agencyName || 'Our agency')} · partner update`}</div><h1>${esc(s.p.name)}</h1>
        <div class="muted">${esc([s.p.type, s.p.address, s.p.city].filter(Boolean).join(' · '))}</div>
        ${d.contacts.length ? `<div class="small">With ${esc(d.contacts.slice(0, 3).map(c => [c.name, c.role].filter(Boolean).join(', ')).join('; '))}</div>` : ''}</div>
        <div class="shMeta"><div><span class="muted small">Period</span><b>${esc(d.period)}</b></div>${me ? `<div><span class="muted small">Prepared by</span><b>${esc(me)}</b></div>` : ''}</div></header>
      <section class="shBig">${big.map(([l, v, sub]) => `<div><span class="muted small">${l}</span><b>${esc(String(v))}</b><span class="small muted">${esc(sub)}</span></div>`).join('')}</section>
      <section class="shTrend"><h2>Referrals from ${esc(s.p.name)}, by quarter</h2>${bars(d.quarters)}</section>
      ${internal ? `<section class="shSay"><h2>What they say, and what the numbers show</h2>
        <div class="shSayGrid"><label><span class="muted small">What they told you (only you see this)</span><textarea id="shClaim" rows="2" placeholder="e.g. You're our first call for home care">${esc(d.claim)}</textarea></label>
        <div><span class="muted small">The numbers</span><p>${s.last3 ? `${plural(s.last3, 'referral')} this quarter${d.share != null ? `, about ${pct(d.share)} of what they refer out${d.shareIsEst ? ' (estimate)' : ''}` : ''}.` : 'No referrals this quarter.'}${d.sent ? ` You sent them ${plural(d.sent, 'client')}.` : ''}</p></div></div></section>` : ''}
      <section class="shTalk"><h2>${internal ? 'Talking points' : 'Thank you'}</h2><ul>${d.pts.filter(p => internal || !p.internal).slice(0, 3).map(p => `<li contenteditable="true">${esc(p.t)}</li>`).join('')}</ul></section>
      <section class="shNext"><h2>${internal ? 'Goal and next step' : 'Next time we meet'}</h2><p>${internal ? `Aim for <b>${d.goal}</b> referrals next quarter. ` : ''}${d.next ? `Next touch: <b>${esc(d.next.what)}</b> on ${fmtShort(d.next.date)}.` : internal ? 'No next touch booked: <a class="noPrint" href="#calendar">book one</a>.' : 'We\'ll check in again soon.'}</p></section>
      <footer class="shFoot small muted">${internal ? 'Internal: not for the partner.' : `Prepared for ${esc(s.p.name)} by ${esc(S.settings.agencyName || 'our team')}${me ? `, ${esc(me)}` : ''}.`} Figures from ${esc(poss(S.settings.agencyName || 'the agency'))} own referral records${internal && d.shareIsEst && d.share != null ? '; share is an estimate' : ''}.</footer>
    </article>`;
  markNav('sheet'); subnav('sheet');
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { SH.mode = b.dataset.m; X.sheet(sub); });
  const claim = app.querySelector('#shClaim');
  if (claim) claim.onchange = async () => { try { const r = await W().post('saveSettings', { settings: { sheetNotes: { [id]: claim.value } } }); if (r.settings) S.settings = r.settings; else (S.settings.sheetNotes ||= {})[id] = claim.value; W().toast('Saved'); } catch (e) { W().toast(e.message); } };
  const logShare = async () => { const r = await W().post('addActivity', { activity: { sourceId: id, sourceName: s.p.name, kind: 'sheet', status: 'done', subject: 'Partner sheet shared' } }); S.activity = r.activity; W().rescore?.(); };
  app.querySelector('#shShare').onclick = async e => { e.target.disabled = true; try { await logShare(); W().toast(`Logged: partner sheet shared with ${s.p.name}`); } catch (x) { W().toast(x.message); e.target.disabled = false; } };
  app.querySelector('#shPrint').onclick = () => { if (SH.mode === 'partner') logShare().catch(() => {}); window.print(); };
};

// ---------- Wiring ----------
const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  markNav(view); subnav(view);
  if (view === 'today' && !X._queueMode && W().S.scored?.length) drawStops();
  if (view === 'scorecard') addSheetButton();
};
// Partners: the scorecard's selected source gets a "Partner sheet" button (its panel re-renders on selection).
function addSheetButton() {
  const open = document.getElementById('scOpen'); if (!open || open.parentElement.querySelector('[data-sheet]')) return;
  const id = open.closest('[data-id]')?.dataset.id || open.parentElement.querySelector('[data-draft]')?.dataset.draft; if (!id) return;
  open.insertAdjacentHTML('afterend', `<a class="btn sm primary" data-sheet href="#sheet/${encodeURIComponent(id)}">Partner sheet</a>`);
}
new MutationObserver(() => { if (W()?.S?.view === 'scorecard') addSheetButton(); }).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
// Source drawer: Log and Partner sheet next to the title.
const prevDrawer = X._drawer;
X._drawer = (id, d) => {
  if (prevDrawer) prevDrawer(id, d);
  if (d.querySelector('.dBd')) return;
  const h = d.querySelector('h1'); if (!h) return;
  h.insertAdjacentHTML('afterend', `<div class="row dBd" style="margin:6px 0 10px"><button class="btn sm primary" data-dlog>Log</button><a class="btn sm" href="#sheet/${encodeURIComponent(id)}">Partner sheet</a></div>`);
  d.querySelector('[data-dlog]').onclick = () => openLog({ sourceId: id });
  d.querySelector('.dBd a').onclick = () => W().closeDrawer();
};
// The Log tab button and the L key.
function bindLog() {
  const a = document.getElementById('navLog'); if (!a || a.dataset.b) return;
  a.dataset.b = 1; a.onclick = e => { e.preventDefault(); openLog(); };
}
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (document.getElementById('logDlg')) closeLog(); return; }
  if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable && !document.getElementById('logDlg') && W()?.S?.me) { e.preventDefault(); openLog(); }
});
if (document.readyState !== 'loading') bindLog(); else addEventListener('DOMContentLoaded', bindLog);
