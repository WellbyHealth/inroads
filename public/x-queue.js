// Queue + touch mix.
// Today becomes a short briefing; everything waiting on you moves to its own Queue tab:
// drafts to approve, win-flow steps, follow-ups, thank-yous after visits, and sources due for a visit.
// Touch mix keeps digital outreach (email, calls) and in-person touchpoints (visits, lunches, meetings)
// in balance: active and at-risk sources get a face-to-face visit every N days, with digital touches between.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const IN = new Set(['visit', 'lunch', 'meeting', 'inservice']), DIG = new Set(['email', 'call']);
const Q = { pick: new Set(), booked: null };
const every = () => +W().S.settings.visitEvery || 30;
const dAgo = d => W().daysSince(d);
const ago = d => d == null ? 'never' : W().agoText(d).toLowerCase();

export function touchInfo(id) {
  const { S } = W(), cal = X.calendarData?.() || { meetings: [] };
  let lastIn = null, lastDig = null, in90 = 0, dig90 = 0;
  for (const a of S.activity) {
    if (a.sourceId !== id || a.status !== 'done') continue;
    const d = (a.doneAt || a.at).slice(0, 10), k = a.kind;
    if (IN.has(k)) { if (!lastIn || d > lastIn) lastIn = d; if (dAgo(d) <= 90) in90++; }
    else if (DIG.has(k)) { if (!lastDig || d > lastDig) lastDig = d; if (dAgo(d) <= 90) dig90++; }
  }
  const nextIn = cal.meetings.filter(m => m.sourceId === id && m.status === 'scheduled' && IN.has(m.kind) && Date.parse(m.end) > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  const since = lastIn ? dAgo(lastIn) : null;
  return { lastIn, lastDig, in90, dig90, nextIn, overdue: !nextIn && (since == null || since >= every()), since };
}

function visitsDue() {
  const { S, flowState } = W();
  const top = new Set(S.scored.filter(s => s.last3 > 0).sort((a, b) => b.last3 - a.last3 || b.total12 - a.total12).slice(0, 10).map(s => s.p.id));
  return S.scored.filter(s => top.has(s.p.id) || (s.status === 'Protect' && s.total12 >= 3) || S.flows[s.p.id])
    .filter(s => { const fs = flowState(s.p.id); return !(fs?.next && fs.next.kind === 'visit'); }) // flows schedule their own visits
    .filter(s => !s.p.custom && s.p.address)
    .map(s => ({ s, t: touchInfo(s.p.id) })).filter(x => x.t.overdue && (x.t.lastIn || x.t.dig90 || x.s.total12))
    .sort((a, b) => (b.s.status === 'Protect') - (a.s.status === 'Protect') || b.s.total12 - a.s.total12);
}
function thankYous() {
  const { S } = W(), out = [];
  const seen = new Set();
  const acts = S.activity.filter(a => a.status === 'done' && IN.has(a.kind) && dAgo(a.doneAt || a.at) <= 3).sort((a, b) => (b.doneAt || b.at).localeCompare(a.doneAt || a.at));
  for (const a of acts) {
    if (seen.has(a.sourceId)) continue; seen.add(a.sourceId);
    const t = a.doneAt || a.at;
    const followed = S.activity.some(b => b.sourceId === a.sourceId && (b.kind === 'email' || b.kind === 'call') && (b.status === 'draft' || (b.status === 'done' && (b.doneAt || b.at) > t)));
    if (!followed) out.push(a);
  }
  return out;
}

function draftFor(id) { const { openSource } = W(); openSource(id); setTimeout(() => document.querySelector(`#drawer [data-draft="${CSS.escape(id)}"][data-kind="email"]`)?.click(), 120); }

// ---------- Plan a visit day: nearest-neighbour route from the office, booked on the calendar ----------
const rad = x => x * Math.PI / 180;
const miles = (a, b) => { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); };
function route(list) {
  const { S } = W();
  const off = S.offices.find(o => o.label === list[0]?.s.office && o.lat) || S.offices.find(o => o.lat) || null;
  let cur = off ? { lat: off.lat, lng: off.lng } : list[0] && { lat: list[0].s.p.lat, lng: list[0].s.p.lng };
  const left = list.filter(x => x.s.p.lat), out = [], noGeo = list.filter(x => !x.s.p.lat);
  while (left.length) { left.sort((a, b) => miles(cur, a.s.p) - miles(cur, b.s.p)); const n = left.shift(); out.push({ ...n, leg: miles(cur, n.s.p) }); cur = n.s.p; }
  return { off, stops: [...out, ...noGeo.map(x => ({ ...x, leg: null }))] };
}
const addr = p => [p.address, p.city, p.zip].filter(Boolean).join(', ');
function mapsUrl(off, stops) {
  const pts = stops.map(x => addr(x.s.p)).filter(Boolean);
  if (!pts.length) return '';
  const o = off?.address || pts[0], d = off?.address || pts.at(-1), wp = (off?.address ? pts : pts.slice(1, -1)).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving${wp.length ? '&waypoints=' + encodeURIComponent(wp.join('|')) : ''}`;
}
async function bookDay(date, startTime, mins) {
  const { S, api, toast, refreshView } = W();
  const list = visitsDue().filter(x => Q.pick.has(x.s.p.id));
  if (!list.length) return;
  const { off, stops } = route(list);
  let t = new Date(`${date}T${startTime}:00`);
  const booked = [];
  for (const x of stops) {
    const drive = x.leg != null ? Math.max(10, Math.round(x.leg * 2.2 / 5) * 5) : 15; // ~27 mph average in town
    if (booked.length) t = new Date(t.getTime() + drive * 60000);
    const c = (S.contacts[x.s.p.id] || [])[0];
    const m = { title: `Visit: ${x.s.p.name}`, sourceId: x.s.p.id, sourceName: x.s.p.name, kind: 'visit', start: t.toISOString(), minutes: mins, location: addr(x.s.p), contact: c?.name || '', contactEmail: c?.email || '', notes: x.s.status === 'Protect' ? 'Referrals have slowed. Ask what changed and what would help.' : 'Keep the relationship warm in person.' };
    const r = await api('/api/calendar', { action: 'save', meeting: m });
    booked.push({ ...x, at: new Date(t), id: r.meeting?.id });
    t = new Date(t.getTime() + mins * 60000);
  }
  Q.booked = { date, off, stops: booked, url: mapsUrl(off, booked) };
  Q.pick.clear();
  await X.calendarReload?.();
  toast(`Booked ${booked.length} visit${booked.length === 1 ? '' : 's'} on your calendar`);
  refreshView();
}

// ---------- the Queue page ----------
function buildQueue(app) {
  const { S, esc, IMG, fmtShort, addDays, today } = W();
  const qcard = app.querySelector('.card.queue');
  const drafts = S.activity.filter(a => a.status === 'draft').length;
  const ty = thankYous(), vd = visitsDue();
  const steps = qcard ? qcard.querySelectorAll('[data-stepact="draft"]').length : 0;
  const follows = qcard ? [...qcard.querySelectorAll('h3')].find(h => /follow/i.test(h.textContent)) : null;
  const nFollow = follows ? (() => { let n = 0, el = follows.nextElementSibling; while (el && el.tagName !== 'H3') { if (el.classList.contains('qrow')) n++; el = el.nextElementSibling; } return n; })() : 0;
  const total = drafts + steps + nFollow + ty.length + vd.length;
  const wrap = document.createElement('div');
  const nextWeekday = (() => { let d = addDays(today(), 1); while ([0, 6].includes(new Date(d + 'T12:00:00').getDay())) d = addDays(d, 1); return d; })();
  const visitRow = ({ s, t }) => `<label class="qrow qv"><input type="checkbox" data-pick="${esc(s.p.id)}" ${Q.pick.has(s.p.id) ? 'checked' : ''}><span class="qicon q-visit"></span><div><span class="name" data-src="${esc(s.p.id)}">${esc(s.p.name)}</span> <span class="chip st-${s.status}">${s.status}</span>
      <div class="why">${t.lastIn ? `Last in person ${ago(t.lastIn)}` : 'No in-person visit yet'} · ${t.dig90} digital touch${t.dig90 === 1 ? '' : 'es'} in 90 days${s.dist != null ? ` · ${s.dist.toFixed(1)} mi from ${esc(s.office)}` : ''}</div></div>
      <div class="row"><button type="button" class="btn sm" data-meet="${esc(s.p.id)}">Schedule</button></div></label>`;
  const tyRow = a => `<div class="qrow"><span class="qicon q-email"></span><div><span class="name" data-src="${esc(a.sourceId)}">${esc(a.sourceName)}</span><div class="why">${esc(W().KIND[a.kind] || a.kind)} ${ago((a.doneAt || a.at).slice(0, 10))}${a.subject ? ' · ' + esc(a.subject) : ''}. Send a short thank-you while it's fresh.</div></div>
      <div class="row"><button class="btn sm primary" data-ty="${esc(a.sourceId)}">Draft thank-you</button></div></div>`;
  const b = Q.booked;
  wrap.innerHTML = `<div class="head"><div class="hero-head"><img src="${IMG('g-envelope-cut')}" alt=""><div><span class="eyebrow">Win</span><h1>Queue</h1><div class="muted">${total ? 'Everything waiting on you, in the order to do it.' : 'You’re all caught up.'}</div></div></div><a class="btn" href="#map">Find targets</a></div>
    <div class="qnav">${[[drafts, 'to approve', 'qApprove'], [steps, steps === 1 ? 'flow step' : 'flow steps', 'qApprove'], [nFollow, nFollow === 1 ? 'follow-up' : 'follow-ups', 'qApprove'], [ty.length, ty.length === 1 ? 'thank-you' : 'thank-yous', 'qThanks'], [vd.length, vd.length === 1 ? 'visit due' : 'visits due', 'qVisits']].filter(x => x[0]).map(x => `<a href="#queue" data-jump="${x[2]}"><b>${x[0]}</b> ${x[1]}</a>`).join('')}</div>
    ${b ? `<div class="card qbooked"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Visit day booked: ${esc(new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</h2><button class="btn sm ghost" id="qBookedX">Dismiss</button></div>
      <ol class="qstops">${b.off ? `<li class="muted">Start at your ${esc(b.off.label)} office</li>` : ''}${b.stops.map(x => `<li><b>${x.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</b> ${esc(x.s.p.name)}${x.leg != null ? ` <span class="muted small">${x.leg.toFixed(1)} mi</span>` : ''}</li>`).join('')}</ol>
      <div class="row">${b.url ? `<a class="btn primary" href="${esc(b.url)}" target="_blank" rel="noopener">Open route in Google Maps</a>` : ''}<a class="btn" href="#calendar">See it on the calendar</a></div></div>` : ''}
    <div id="qApprove"></div>
    ${ty.length ? `<div class="card" id="qThanks"><div class="head"><h2>Thank them after a visit</h2><span class="muted small">A short note within a day of seeing someone keeps you top of mind.</span></div>${ty.map(tyRow).join('')}</div>` : ''}
    ${vd.length ? `<div class="card" id="qVisits"><div class="head"><h2>Due for a visit</h2><span class="muted small">Your top active sources, at-risk sources and win flows with no face-to-face touch in ${every()} days. Email and calls keep you in touch; visits win referrals.</span></div>
      ${vd.slice(0, 12).map(visitRow).join('')}${vd.length > 12 ? `<div class="muted small" style="padding:8px 0">+${vd.length - 12} more</div>` : ''}
      <form class="qplan"><b>Plan a visit day</b><span class="muted small" id="qPickN">${Q.pick.size ? `${Q.pick.size} selected` : 'Tick the sources to visit'}</span>
        <input type="date" name="d" value="${nextWeekday}" required><input type="time" name="t" value="09:00" required>
        <select name="m"><option value="30">30 min each</option><option value="45" selected>45 min each</option><option value="60">1 hour each</option></select>
        <button class="btn primary" ${Q.pick.size ? '' : 'disabled'}>Book visits and route</button></form>
      <div class="qrule small muted">Visit cadence: every <select id="qEvery">${[14, 21, 30, 45, 60, 90].map(n => `<option ${n === every() ? 'selected' : ''}>${n}</option>`).join('')}</select> days for these sources.</div></div>` : ''}
    ${!total ? `<div class="card empty"><img src="${IMG('g-map-600')}" alt="" style="width:200px"><p>Nothing waiting. Start a win flow on a new target, or plan a visit day.</p><a class="btn primary" href="#map">Find targets</a></div>` : ''}`;
  // Keep the app's own queue card (its buttons are already wired) and drop the rest of Today.
  const keep = qcard;
  app.innerHTML = '';
  app.append(...wrap.childNodes);
  if (keep) { keep.querySelector(':scope > .head h2') && (keep.querySelector(':scope > .head h2').textContent = 'Approve, send and follow up'); app.querySelector('#qApprove').replaceWith(keep); keep.id = 'qApprove'; }
  bindQueue(app);
}
function bindQueue(app) {
  const { S, post, toast, openSource } = W();
  app.querySelectorAll('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  app.querySelectorAll('#qThanks [data-src], #qVisits [data-src]').forEach(el => el.onclick = e => { e.preventDefault(); openSource(el.dataset.src); });
  app.querySelectorAll('[data-ty]').forEach(b => b.onclick = () => draftFor(b.dataset.ty));
  app.querySelectorAll('[data-meet]').forEach(b => b.onclick = e => { e.preventDefault(); X.openMeeting?.({ sourceId: b.dataset.meet, kind: 'visit', day: W().addDays(W().today(), 1) }); });
  const btn = app.querySelector('.qplan button'), n = app.querySelector('#qPickN');
  app.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? Q.pick.add(c.dataset.pick) : Q.pick.delete(c.dataset.pick); if (btn) btn.disabled = !Q.pick.size; if (n) n.textContent = Q.pick.size ? `${Q.pick.size} selected` : 'Tick the sources to visit'; });
  const f = app.querySelector('.qplan');
  if (f) f.onsubmit = e => { e.preventDefault(); btn.disabled = true; btn.textContent = 'Booking…'; bookDay(f.d.value, f.t.value, +f.m.value).catch(er => { toast(er.message); btn.disabled = false; btn.textContent = 'Book visits and route'; }); };
  const ev = app.querySelector('#qEvery');
  if (ev) ev.onchange = async () => { const r = await post('saveSettings', { settings: { visitEvery: +ev.value } }); S.settings = { ...S.settings, ...r.settings }; W().refreshView(); };
  const bx = document.getElementById('qBookedX'); if (bx) bx.onclick = () => { Q.booked = null; W().refreshView(); };
}

// ---------- Today: briefing only, with a one-line pointer to the queue ----------
function slimToday(app) {
  const { S } = W();
  const qcard = app.querySelector('.card.queue');
  const drafts = S.activity.filter(a => a.status === 'draft').length;
  const steps = qcard ? qcard.querySelectorAll('[data-stepact="draft"]').length : 0;
  const ty = thankYous().length, vd = visitsDue().length;
  const n = drafts + (qcard ? qcard.querySelectorAll('.qrow').length : 0) + ty + vd;
  // Hide (not remove) the long lists: the briefing's buttons still drive their actions.
  [qcard, ...app.querySelectorAll(':scope > .head:not(.t-old), :scope > .hero-cards, :scope > .cols, :scope > .notice.info')].forEach(el => { if (el && !el.closest('#tBrief')) el.classList.add('t-hide'); });
  if (!app.querySelector('#tQueue')) {
    const bits = [[drafts, 'to approve'], [steps, 'flow step' + (steps === 1 ? '' : 's') + ' due'], [ty, 'thank-you' + (ty === 1 ? '' : 's')], [vd, 'visit' + (vd === 1 ? '' : 's') + ' due']].filter(x => x[0]);
    const html = `<a id="tQueue" class="card tqueue" href="#queue"><div><b>Your queue</b><span class="muted">${n ? bits.map(b => `${b[0]} ${b[1]}`).join(' · ') : 'Nothing waiting. Plan a visit day or start a new win flow.'}</span></div><span class="btn ${n ? 'primary' : ''} sm">Open queue</span></a>`;
    // After the (hidden) original header, so a refreshed briefing always lands above it.
    const anchor = app.querySelector(':scope > .head.t-old') || app.querySelector('#tBrief');
    if (anchor) anchor.insertAdjacentHTML('afterend', html); else app.insertAdjacentHTML('afterbegin', html);
  }
}

// ---------- Drawer: touch mix for the source ----------
function drawerMix(id, d) {
  if (d.querySelector('#dMix')) return;
  const { esc } = W(), t = touchInfo(id), s = W().S.scoredById.get(id);
  const hist = [...d.querySelectorAll('.section h3')].find(h => /outreach history/i.test(h.textContent))?.closest('.section');
  if (!hist || !s) return;
  const tot = t.in90 + t.dig90, inPct = tot ? Math.round(100 * t.in90 / tot) : 0;
  const relevant = s.last3 > 0 || s.status === 'Protect' || W().S.flows[id];
  const nudge = t.nextIn ? `Visit booked ${W().fmtShort(t.nextIn.start.slice(0, 10))}.` : relevant && t.overdue ? (t.lastIn ? `It's been ${t.since} days since you saw them in person. Time for a visit.` : 'You haven’t met them in person yet. A visit usually does more than another email.') : t.dig90 === 0 && t.in90 ? 'Send a quick email between visits so they hear from you.' : '';
  hist.insertAdjacentHTML('beforebegin', `<div class="section" id="dMix"><h3>Touch mix, last 90 days</h3>
    <div class="mixbar" title="${t.in90} in person, ${t.dig90} digital"><i class="in" style="width:${tot ? inPct : 0}%"></i><i class="dg" style="width:${tot ? 100 - inPct : 0}%"></i></div>
    <div class="mixl small"><span><i class="in"></i>${t.in90} in person · last ${ago(t.lastIn)}</span><span><i class="dg"></i>${t.dig90} email or call · last ${ago(t.lastDig)}</span></div>
    ${nudge ? `<div class="small ${t.overdue && relevant && !t.nextIn ? 'down' : 'muted'}" style="margin-top:6px">${esc(nudge)}</div>` : ''}
    ${!t.nextIn && X.openMeeting ? '<button class="btn sm" id="dMixVisit" style="margin-top:8px">Schedule a visit</button>' : ''}</div>`);
  const b = d.querySelector('#dMixVisit'); if (b) b.onclick = () => X.openMeeting({ sourceId: id, kind: 'visit', day: W().addDays(W().today(), 1) });
}

// ---------- wiring ----------
X.queue = () => { const { S, refreshView } = W(); X._queueMode = true; S.view = 'today'; try { refreshView(); } finally { X._queueMode = false; S.view = 'queue'; } };

const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  const app = document.getElementById('app'); if (!app) return;
  if (view === 'today' && X._queueMode) { app.querySelector('#tBrief')?.remove(); buildQueue(app); }
  else if (view === 'today') slimToday(app);
  if (view === 'referrals') { const sc = app.querySelector('#scorecard'); if (sc && !app.querySelector('#scMoved')) { sc.style.display = 'none'; sc.insertAdjacentHTML('afterend', '<a id="scMoved" class="card tqueue" href="#scorecard"><div><b>Source-by-source scorecard</b><span class="muted">Trends by source now live on the Scorecard page, with share, new clients, revenue and two-way balance.</span></div><span class="btn sm">Open scorecard</span></a>'); } }
  // Queue badge moves from Today to Queue.
  setTimeout(() => {
    const t = document.querySelector('#nav a[data-view="today"] .nbadge'), q = document.querySelector('#nav a[data-view="queue"]');
    if (!q) return;
    let b = q.querySelector('.nbadge'); if (!b) { b = document.createElement('span'); b.className = 'nbadge'; q.appendChild(b); }
    const n = (t && !t.hidden ? +String(t.textContent).replace('+', '') || 0 : 0) + (W().S.scored?.length ? thankYous().length : 0);
    b.textContent = n > 99 ? '99+' : n; b.hidden = !n; if (t) t.hidden = true;
  }, 30);
};
const prevDrawer = X._drawer;
X._drawer = (id, d) => { if (prevDrawer) prevDrawer(id, d); try { drawerMix(id, d); } catch (e) { console.error(e); } };
