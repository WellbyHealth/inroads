// Calendar: meetings and visits (scheduled in Wellby or synced from Google/Outlook), touches done and follow-ups due.
// Shows progress (meetings completed by week, show rate, sources met) and what's coming up.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const C = { mode: 'month', cursor: null, sel: null, meetings: [], events: [], calendars: [], syncedAt: null, loaded: false, loading: null, showAll: false };
const MK = { meeting: 'Meeting', visit: 'Visit', lunch: 'Lunch', call: 'Call', inservice: 'In-service' };
const MST = { scheduled: 'Scheduled', done: 'Done', canceled: 'Canceled', no_show: 'No-show' };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = iso => iso ? (iso.length === 10 ? iso : ymd(new Date(iso))) : '';
const tm = iso => iso && iso.length > 10 ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase() : '';
const dLabel = (d, o = { weekday: 'long', month: 'short', day: 'numeric' }) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', o);
const addD = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
const weekStartOf = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - x.getDay()); return ymd(x); };
const nowIso = () => new Date().toISOString();

function patchNames(list) {
  const { S } = W();
  for (const a of list || []) if (!a.sourceName && a.sourceId) a.sourceName = S.scoredById?.get(a.sourceId)?.p.name || '';
  return list;
}
async function load(force) {
  if (C.loaded && !force) return;
  if (C.loading) return C.loading;
  C.loading = W().api('/api/calendar' + (force === 'nosync' ? '?sync=0' : '')).then(r => {
    Object.assign(C, { meetings: r.meetings || [], events: r.events || [], calendars: r.calendars || [], syncedAt: r.syncedAt, loaded: true });
    if (r.activity) { W().S.activity = patchNames(r.activity); }
  }).finally(() => { C.loading = null; });
  return C.loading;
}
X.calendarData = () => C;
X.calendarReload = () => load(true);

// ---------- items per day ----------
function itemsFor(from, to) {
  const { S, isSkip, flowState } = W(), t = ymd(new Date()), out = [];
  const inR = d => d >= from && d <= to;
  for (const m of C.meetings) { const d = dayOf(m.start); if (inR(d)) out.push({ type: 'm', d, at: m.start, m, label: m.title, sub: [m.sourceName, m.contact].filter(Boolean).join(' · ') }); }
  const linkedEv = new Set(C.meetings.map(m => m.extId).filter(Boolean));
  for (const e of C.events) { if (!C.showAll && !e.sourceId) continue; if (linkedEv.has(e.id)) continue; const d = dayOf(e.start); if (inR(d)) out.push({ type: 'e', d, at: e.allDay ? d : e.start, e, label: e.title, sub: [e.sourceId ? S.scoredById?.get(e.sourceId)?.p.name : '', e.contact].filter(Boolean).join(' · ') || (e.provider === 'google' ? 'Google Calendar' : 'Outlook') }); }
  for (const a of S.activity) {
    if (a.status !== 'done' || isSkip(a) || a.meetingId || (a.extId || '').includes(':event:')) continue;
    const d = dayOf(a.doneAt || a.at); if (inR(d)) out.push({ type: 't', d, at: a.doneAt || a.at, a, label: `${W().KIND[a.kind] || a.kind}: ${a.sourceName || S.scoredById?.get(a.sourceId)?.p.name || ''}`, sub: a.subject || '' });
  }
  for (const id of Object.keys(S.flows)) {
    if (!S.scoredById?.has(id)) continue;
    const n = flowState(id).next; if (n && n.due) { const d = n.due < t ? t : n.due; if (inR(d)) out.push({ type: 'd', d, at: d, id, late: n.due < t, label: `${n.label}`, sub: S.scoredById.get(id).p.name }); }
  }
  for (const s of S.scored || []) if (s.due && !S.flows[s.p.id]) { const d = s.due < t ? t : s.due; if (inR(d)) out.push({ type: 'd', d, at: d, id: s.p.id, late: s.due < t, label: 'Follow up', sub: s.p.name }); }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
const cls = it => it.type === 'm' ? `ev m-${it.m.status}` : it.type === 'e' ? 'ev ext' : it.type === 't' ? 'ev touch' : `ev due${it.late ? ' late' : ''}`;
const chipFor = it => `<div class="${cls(it)}" data-it="${it.type}" data-k="${W().esc(it.type === 'm' ? it.m.id : it.type === 'e' ? it.e.id : it.type === 'd' ? it.id : it.a.id)}" title="${W().esc(it.label + (it.sub ? ' · ' + it.sub : ''))}"><span class="evt">${it.type === 'd' ? (it.late ? 'Overdue' : 'Due') : it.type === 't' ? '✓' : tm(it.at) || 'All day'}</span> ${W().esc(it.label)}</div>`;
const rowFor = it => { const { esc } = W(); return `<div class="arow ${cls(it)}" data-it="${it.type}" data-k="${esc(it.type === 'm' ? it.m.id : it.type === 'e' ? it.e.id : it.type === 'd' ? it.id : it.a.id)}"><div class="atime">${it.type === 'd' ? (it.late ? 'Overdue' : 'Due') : it.type === 't' ? 'Done' : tm(it.at) || 'All day'}</div><div class="abody"><b>${esc(it.label)}</b>${it.sub ? `<div class="muted small">${esc(it.sub)}</div>` : ''}</div><div class="atag">${it.type === 'm' ? `<span class="mst s-${it.m.status}">${MST[it.m.status]}</span>` : it.type === 'e' ? `<span class="mst s-ext">${it.e.provider === 'google' ? 'Google' : 'Outlook'}</span>` : it.type === 't' ? '<span class="mst s-touch">Touch</span>' : '<span class="mst s-due">To do</span>'}</div></div>`; };

// ---------- stats ----------
function stats() {
  const { S, isSkip } = W(), t = ymd(new Date()), mStart = t.slice(0, 8) + '01';
  const lastM = new Date(); lastM.setDate(1); lastM.setMonth(lastM.getMonth() - 1); const lmStart = ymd(lastM), lmEnd = addD(mStart, -1);
  const met = (from, to) => { const ids = new Set(), n = { done: 0 }; for (const m of C.meetings) { const d = dayOf(m.start); if (m.status === 'done' && d >= from && d <= to) { n.done++; if (m.sourceId) ids.add(m.sourceId); } } for (const a of S.activity) { if (a.status !== 'done' || isSkip(a) || a.meetingId || !['visit', 'lunch', 'meeting'].includes(a.kind)) continue; const d = dayOf(a.doneAt || a.at); if (d >= from && d <= to) { n.done++; if (a.sourceId) ids.add(a.sourceId); } } return { done: n.done, sources: ids.size }; };
  const thisM = met(mStart, t), prevM = met(lmStart, lmEnd);
  const upcoming = C.meetings.filter(m => m.status === 'scheduled' && dayOf(m.start) >= t && dayOf(m.start) <= addD(t, 14)).length + C.events.filter(e => e.sourceId && dayOf(e.start) >= t && dayOf(e.start) <= addD(t, 14)).length;
  const past90 = C.meetings.filter(m => dayOf(m.start) >= addD(t, -90) && dayOf(m.start) <= t);
  const held = past90.filter(m => m.status === 'done').length, missed = past90.filter(m => m.status === 'no_show' || m.status === 'canceled').length;
  const needs = C.meetings.filter(m => m.status === 'scheduled' && m.end && Date.parse(m.end) < Date.now());
  const q0 = new Date(); q0.setMonth(Math.floor(q0.getMonth() / 3) * 3, 1);
  const weeks = []; let ws = weekStartOf(t);
  for (let i = 7; i >= 0; i--) { const s = addD(ws, -7 * i); weeks.push({ s, n: met(s, addD(s, 6)).done }); }
  return { thisM, prevM, upcoming, rate: held + missed ? Math.round(100 * held / (held + missed)) : null, needs, quarter: met(ymd(q0), t).sources, weeks };
}
function weeksChart(weeks) {
  const max = Math.max(1, ...weeks.map(w => w.n)), H = 64;
  return `<div class="wkchart" role="img" aria-label="Meetings and visits completed per week">${weeks.map((w, i) => `<div class="wkc" title="Week of ${dLabel(w.s, { month: 'short', day: 'numeric' })}: ${w.n} completed"><div class="wkv">${w.n || ''}</div><div class="wkb${i === weeks.length - 1 ? ' cur' : ''}" style="height:${Math.max(2, Math.round(H * w.n / max))}px"></div><div class="wkl">${i === weeks.length - 1 ? 'This wk' : dLabel(w.s, { month: 'numeric', day: 'numeric' })}</div></div>`).join('')}</div>`;
}

// ---------- view ----------
X.calendar = async function viewCalendar(sub) {
  const { $, esc } = W();
  if (['month', 'week', 'list'].includes(sub)) C.mode = sub;
  const t = ymd(new Date());
  if (!C.cursor) C.cursor = t;
  if (!C.sel) C.sel = t;
  if (!C.loaded) { $('#app').innerHTML = '<div class="loading">Loading your calendar…</div>'; try { await load(); } catch (e) { $('#app').innerHTML = `<div class="card empty">Couldn't load the calendar: ${esc(e.message)}</div>`; return; } if (W().S.view !== 'calendar') return; }
  render();
};
function render() {
  const { $, esc, S } = W(), t = ymd(new Date()), st = stats();
  const syncLine = C.calendars.length ? `Synced with ${C.calendars.map(c => esc(c.account)).join(', ')}${C.syncedAt ? ` · ${W().agoText(C.syncedAt).toLowerCase()}` : ''}${C.calendars.some(c => c.lastError) ? ' · <span class="down">sync problem</span>' : ''}` : '<a href="#connections">Connect Google or Outlook</a> to bring in meetings you already have on your calendar.';
  const delta = st.thisM.done - st.prevM.done;
  $('#app').innerHTML = `<div class="head"><div><span class="eyebrow">Calendar</span><h1>Calendar</h1><div class="muted">Meetings, visits and follow-ups in one place. ${syncLine}</div></div>
    <div class="row"><div class="seg" role="tablist">${['month', 'week', 'list'].map(m => `<button data-mode="${m}" class="${C.mode === m ? 'on' : ''}">${m === 'list' ? 'List' : m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div><button class="btn primary" id="newMtg">New meeting</button></div></div>
    ${st.needs.length ? `<div class="notice info cal-needs"><b>${st.needs.length} meeting${st.needs.length === 1 ? '' : 's'} need${st.needs.length === 1 ? 's' : ''} an outcome.</b> How did ${st.needs.length === 1 ? 'it' : 'they'} go? ${st.needs.slice(0, 3).map(m => `<button class="btn sm" data-out="${esc(m.id)}">${esc(m.title)} · ${dLabel(dayOf(m.start), { month: 'short', day: 'numeric' })}</button>`).join(' ')}</div>` : ''}
    <div class="cal-stats">
      <div class="card stat"><div class="muted small">Met this month</div><div class="big">${st.thisM.done}</div><div class="small ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'}">${delta === 0 ? 'Same as' : (delta > 0 ? '+' : '') + delta + ' vs'} last month (${st.prevM.done})</div></div>
      <div class="card stat"><div class="muted small">Coming up, next 14 days</div><div class="big">${st.upcoming}</div><div class="small muted">meetings and visits</div></div>
      <div class="card stat"><div class="muted small">Show rate, last 90 days</div><div class="big">${st.rate == null ? '–' : st.rate + '%'}</div><div class="small muted">held vs canceled or no-show</div></div>
      <div class="card stat"><div class="muted small">Sources met this quarter</div><div class="big">${st.quarter}</div><div class="small muted">distinct referral sources</div></div>
      <div class="card stat wide"><div class="muted small">Meetings and visits completed by week</div>${weeksChart(st.weeks)}</div>
    </div>
    <div class="cal-wrap"><div class="card cal-main">${C.mode === 'month' ? monthHtml() : C.mode === 'week' ? weekHtml() : listHtml()}</div>${C.mode === 'list' ? '' : `<div class="card cal-day" id="calDay">${dayHtml(C.sel)}</div>`}</div>
    <div class="cal-legend small muted">${[['m-scheduled', 'Scheduled'], ['m-done', 'Done'], ['ext', 'From your calendar'], ['due', 'Follow-up or flow step'], ['touch', 'Touch logged']].map(([c, l]) => `<span class="lgi"><i class="lgd ${c}"></i>${l}</span>`).join('')}
      <label class="cal-all"><input type="checkbox" id="calAll" ${C.showAll ? 'checked' : ''}> Show all calendar events, not just referral meetings</label></div>`;
  bind();
}
function navHtml(title) { return `<div class="cal-nav"><button class="btn sm ghost" data-nav="-1" aria-label="Previous">‹</button><h2>${title}</h2><button class="btn sm ghost" data-nav="1" aria-label="Next">›</button><button class="btn sm" data-nav="0">Today</button></div>`; }
function monthHtml() {
  const t = ymd(new Date()), c = new Date(C.cursor + 'T12:00:00'), first = ymd(new Date(c.getFullYear(), c.getMonth(), 1)), start = weekStartOf(first), end = addD(start, 41);
  const items = itemsFor(start, end), by = {}; for (const it of items) (by[it.d] = by[it.d] || []).push(it);
  const mo = c.getMonth();
  let h = navHtml(c.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) + `<div class="mgrid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="mdh">${d}</div>`).join('')}`;
  for (let i = 0; i < 42; i++) {
    const d = addD(start, i), list = by[d] || [], touches = list.filter(x => x.type === 't'), rest = list.filter(x => x.type !== 't');
    h += `<div class="mday${new Date(d + 'T12:00:00').getMonth() !== mo ? ' out' : ''}${d === t ? ' today' : ''}${d === C.sel ? ' sel' : ''}" data-day="${d}"><div class="mnum">${+d.slice(8)}</div>${rest.slice(0, 3).map(chipFor).join('')}${rest.length > 3 ? `<div class="more">+${rest.length - 3} more</div>` : ''}${touches.length ? `<div class="tdot">${touches.length} touch${touches.length === 1 ? '' : 'es'}</div>` : ''}</div>`;
  }
  return h + '</div>';
}
function weekHtml() {
  const t = ymd(new Date()), s = weekStartOf(C.cursor), items = itemsFor(s, addD(s, 6)), by = {}; for (const it of items) (by[it.d] = by[it.d] || []).push(it);
  let h = navHtml(`Week of ${dLabel(s, { month: 'long', day: 'numeric' })}`) + '<div class="wgrid">';
  for (let i = 0; i < 7; i++) { const d = addD(s, i); h += `<div class="wday${d === t ? ' today' : ''}${d === C.sel ? ' sel' : ''}" data-day="${d}"><div class="wdh"><span>${dLabel(d, { weekday: 'short' })}</span><b>${+d.slice(8)}</b></div>${(by[d] || []).map(chipFor).join('') || '<div class="muted small wempty">–</div>'}<button class="wadd" data-add="${d}" aria-label="Add meeting">+</button></div>`; }
  return h + '</div>';
}
function dayHtml(d) {
  const items = itemsFor(d, d), t = ymd(new Date());
  return `<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${d === t ? 'Today' : dLabel(d)}</h3><button class="btn sm" data-add="${d}">Add</button></div>${items.map(rowFor).join('') || `<p class="muted small">${d < t ? 'Nothing logged this day.' : 'Nothing planned yet.'}</p>`}`;
}
function listHtml() {
  const t = ymd(new Date()), now = Date.now(), open = it => it.type === 'd' || (it.type === 'm' && it.m.status === 'scheduled') || (it.type === 'e' && Date.parse(it.e.end || it.e.start) >= now);
  const up = itemsFor(t, addD(t, 30)).filter(open), past = itemsFor(addD(t, -30), t).filter(it => !open(it) || (it.type === 'm' && Date.parse(it.m.end) < now)).filter(it => it.type !== 'd').reverse();
  const group = (list, empty) => { if (!list.length) return `<p class="muted small">${empty}</p>`; const by = {}; for (const it of list) (by[it.d] = by[it.d] || []).push(it); return Object.entries(by).map(([d, l]) => `<div class="agrp"><div class="agh">${d === t ? 'Today' : d === addD(t, 1) ? 'Tomorrow' : dLabel(d)}</div>${l.map(rowFor).join('')}</div>`).join(''); };
  return `<h2>Coming up, next 30 days</h2>${group(up, 'Nothing scheduled. Use New meeting to plan a visit, lunch or in-service.')}<h2 style="margin-top:22px">Done, last 30 days</h2>${group(past, 'No meetings or touches logged in the last 30 days.')}`;
}
function bind() {
  const { $ } = W(), app = $('#app');
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { C.mode = b.dataset.mode; history.replaceState(null, '', '#calendar/' + C.mode); render(); });
  app.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { const n = +b.dataset.nav; if (!n) { C.cursor = C.sel = ymd(new Date()); } else if (C.mode === 'month') { const c = new Date(C.cursor + 'T12:00:00'); c.setDate(1); c.setMonth(c.getMonth() + n); C.cursor = ymd(c); } else C.cursor = addD(C.cursor, 7 * n); render(); });
  app.querySelectorAll('[data-day]').forEach(el => el.onclick = e => { if (e.target.closest('[data-it],[data-add]')) return; C.sel = el.dataset.day; app.querySelectorAll('[data-day]').forEach(x => x.classList.toggle('sel', x.dataset.day === C.sel)); const p = $('#calDay'); if (p) { p.innerHTML = dayHtml(C.sel); bindItems(p); } });
  bindItems(app);
  $('#newMtg').onclick = () => openMeeting({ day: C.sel && C.sel >= ymd(new Date()) ? C.sel : ymd(new Date()) });
  $('#calAll').onchange = e => { C.showAll = e.target.checked; render(); };
  app.querySelectorAll('[data-out]').forEach(b => b.onclick = () => openMeeting({ m: C.meetings.find(m => m.id === b.dataset.out), focusOutcome: true }));
}
function bindItems(root) {
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = e => { e.stopPropagation(); openMeeting({ day: b.dataset.add }); });
  root.querySelectorAll('[data-it]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    const k = el.dataset.k, ty = el.dataset.it;
    if (ty === 'm') openMeeting({ m: C.meetings.find(m => m.id === k) });
    else if (ty === 'e') openEvent(C.events.find(x => x.id === k));
    else if (ty === 'd') W().openSource(k);
    else { const a = W().S.activity.find(x => x.id === k); if (a?.sourceId && W().S.scoredById.has(a.sourceId)) W().openSource(a.sourceId); }
  });
}

// ---------- meeting dialog ----------
function dlg() {
  let d = document.getElementById('mtgDlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'mtgDlg'; d.className = 'mdlg'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d) d.close(); }); }
  return d;
}
function sourceOptions() {
  const { S } = W(), seen = new Set(), out = [];
  const add = s => { if (s && !seen.has(s.p.id)) { seen.add(s.p.id); out.push(s); } };
  for (const id of [...Object.keys(S.flows), ...Object.keys(S.contacts), ...S.activity.slice(-300).map(a => a.sourceId)]) add(S.scoredById?.get(id));
  for (const s of (S.scored || []).slice().sort((a, b) => b.priority - a.priority).slice(0, 400)) add(s);
  return out;
}
const toLocalInput = iso => { const d = new Date(iso); return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; };
function openMeeting({ m, day, sourceId, focusOutcome } = {}) {
  const { esc, S } = W(), d = dlg(), ex = !!m;
  const src = m?.sourceId || sourceId || '', srcName = src ? (S.scoredById?.get(src)?.p.name || m?.sourceName || '') : '';
  const when = m ? toLocalInput(m.start) : { date: day || ymd(new Date()), time: '10:00' };
  const mins = m ? Math.max(5, Math.round((Date.parse(m.end) - Date.parse(m.start)) / 60000)) : 30;
  const past = m && Date.parse(m.end) < Date.now();
  d.innerHTML = `<form method="dialog" class="mform" id="mForm">
    <div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">${ex ? 'Meeting' : 'New meeting'}</h2><button type="button" class="btn ghost sm" id="mX" aria-label="Close">✕</button></div>
    ${ex ? `<div class="mstrow"><span class="mst s-${m.status}">${MST[m.status]}</span>${m.by ? `<span class="muted small">Added by ${esc(String(m.by).split('@')[0].replace('assistant:', 'AI assistant: '))}</span>` : ''}</div>` : ''}
    <label>Title<input name="title" required value="${esc(m?.title || '')}" placeholder="e.g. Lunch-and-learn with the discharge team"></label>
    <div class="g2"><label>Type<select name="kind">${Object.entries(MK).map(([k, v]) => `<option value="${k}" ${(m?.kind || 'visit') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Referral source<input name="source" list="mSrcList" value="${esc(srcName)}" placeholder="Search sources" autocomplete="off"></label></div>
    <datalist id="mSrcList">${sourceOptions().map(s => `<option value="${esc(s.p.name)}">${esc(s.p.type)}${s.p.city ? ' · ' + esc(s.p.city) : ''}</option>`).join('')}</datalist>
    <div class="g3"><label>Date<input type="date" name="date" required value="${when.date}"></label><label>Time<input type="time" name="time" required value="${when.time}"></label><label>Length<select name="minutes">${[15, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${n === mins ? 'selected' : ''}>${n < 60 ? n + ' min' : n / 60 + ' hr'}</option>`).join('')}</select></label></div>
    <div class="g2"><label>With<input name="contact" list="mConList" value="${esc(m?.contact || '')}" placeholder="Contact name" autocomplete="off"></label><label>Where<input name="location" value="${esc(m?.location || '')}" placeholder="Address, room or video link"></label></div>
    <datalist id="mConList"></datalist>
    <label>Prep notes<textarea name="notes" rows="2" placeholder="Goal for the meeting, what to bring">${esc(m?.notes || '')}</textarea></label>
    ${ex ? `<label>Outcome<textarea name="outcome" id="mOut" rows="3" placeholder="What happened, what they need, next step">${esc(m.outcome || '')}</textarea></label>` : ''}
    <div class="mact">
      ${ex && m.status === 'scheduled' ? `<button type="button" class="btn primary" data-st="done">${past ? 'Mark as done' : 'Done'}</button><button type="button" class="btn" data-st="no_show">No-show</button><button type="button" class="btn" data-st="canceled">Canceled</button>` : ''}
      <button type="submit" class="btn ${ex && m.status === 'scheduled' ? '' : 'primary'}" id="mSave">${ex ? 'Save changes' : 'Add to calendar'}</button>
      ${ex && m.status !== 'scheduled' ? '<button type="button" class="btn ghost" data-st="scheduled">Reopen</button>' : ''}
      ${ex ? '<button type="button" class="btn ghost danger" id="mDel">Delete</button>' : ''}
      ${src && S.scoredById?.has(src) ? '<button type="button" class="btn ghost" id="mOpen">Open source</button>' : ''}
    </div>
    ${ex && m.status === 'scheduled' ? '<p class="muted small" style="margin:6px 0 0">Marking it done logs a touch for this source and checks off the next visit step in its win flow.</p>' : ''}
  </form>`;
  const f = d.querySelector('#mForm'), byName = new Map(sourceOptions().map(s => [s.p.name.toLowerCase(), s.p.id]));
  const fillContacts = () => { const id = byName.get(f.source.value.trim().toLowerCase()) || src; d.querySelector('#mConList').innerHTML = (S.contacts[id] || []).map(c => `<option value="${esc(c.name)}">${esc(c.role || c.email)}</option>`).join(''); };
  f.source.oninput = fillContacts; fillContacts();
  d.querySelector('#mX').onclick = () => d.close();
  const collect = status => {
    const fd = Object.fromEntries(new FormData(f)), sid = byName.get(String(fd.source || '').trim().toLowerCase()) || (fd.source && fd.source === srcName ? src : '');
    const cc = (S.contacts[sid] || []).find(c => c.name.toLowerCase() === String(fd.contact || '').trim().toLowerCase());
    const start = new Date(`${fd.date}T${fd.time || '10:00'}`);
    return { id: m?.id, title: fd.title, kind: fd.kind, sourceId: sid, sourceName: sid ? S.scoredById.get(sid)?.p.name : '', contact: fd.contact, contactEmail: cc?.email || m?.contactEmail || '', start: start.toISOString(), minutes: +fd.minutes, location: fd.location, notes: fd.notes, outcome: fd.outcome ?? m?.outcome ?? '', status: status || m?.status || 'scheduled' };
  };
  const save = async (status, btn) => {
    if (!f.reportValidity()) return;
    const body = collect(status);
    if (status === 'done' && !String(body.outcome).trim() && d.querySelector('#mOut') && !d.querySelector('#mOut').dataset.asked) { const o = d.querySelector('#mOut'); o.dataset.asked = 1; o.focus(); o.placeholder = 'Add a line on how it went (optional), then press Done again'; return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const r = await W().api('/api/calendar', { action: 'save', meeting: body });
      C.meetings = r.meetings; W().S.activity = patchNames(r.activity); W().S.flows = r.flows;
      d.close(); afterChange();
      W().toast(status === 'done' ? 'Meeting done and logged' : status === 'no_show' ? 'Marked as a no-show' : status === 'canceled' ? 'Marked as canceled' : ex ? 'Meeting saved' : `Added for ${dLabel(dayOf(r.meeting.start), { weekday: 'short', month: 'short', day: 'numeric' })} at ${tm(r.meeting.start)}`);
    } catch (e) { W().toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Try again'; } }
  };
  f.onsubmit = e => { e.preventDefault(); save(null, d.querySelector('#mSave')); };
  d.querySelectorAll('[data-st]').forEach(b => b.onclick = () => save(b.dataset.st, b));
  if (d.querySelector('#mDel')) d.querySelector('#mDel').onclick = async () => {
    const old = { ...m }; d.close();
    const r = await W().api('/api/calendar', { action: 'remove', id: m.id }); C.meetings = r.meetings; afterChange();
    W().toast('Meeting deleted', { label: 'Undo', fn: async () => { const { id, ...rest } = old; const r2 = await W().api('/api/calendar', { action: 'save', meeting: { ...rest, minutes: Math.round((Date.parse(old.end) - Date.parse(old.start)) / 60000) } }); C.meetings = r2.meetings; afterChange(); } });
  };
  if (d.querySelector('#mOpen')) d.querySelector('#mOpen').onclick = () => { d.close(); W().openSource(src); };
  d.showModal();
  if (focusOutcome && d.querySelector('#mOut')) d.querySelector('#mOut').focus(); else if (!ex) f.title.focus();
}
X.openMeeting = openMeeting;
function openEvent(e) {
  if (!e) return;
  const { esc, S } = W(), d = dlg(), s = e.sourceId ? S.scoredById?.get(e.sourceId) : null;
  d.innerHTML = `<div class="mform"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">${esc(e.title)}</h2><button class="btn ghost sm" id="mX" aria-label="Close">✕</button></div>
    <p class="muted">${e.allDay ? dLabel(dayOf(e.start)) : `${dLabel(dayOf(e.start))}, ${tm(e.start)}–${tm(e.end)}`}${e.location ? ` · ${esc(e.location)}` : ''}</p>
    <p class="small">From ${e.provider === 'google' ? 'Google Calendar' : 'Outlook'} (${esc(e.account)}).${s ? ` Matched to <b>${esc(s.p.name)}</b>${e.contact ? ` through ${esc(e.contact)}` : ''}. Past meetings with known contacts are logged as touches automatically.` : ' No attendee matches a saved contact.'}</p>
    ${e.attendees?.length ? `<p class="small muted">Attendees: ${e.attendees.slice(0, 8).map(esc).join(', ')}${e.attendees.length > 8 ? '…' : ''}</p>` : ''}
    <div class="mact">${e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener">Open in ${e.provider === 'google' ? 'Google Calendar' : 'Outlook'}</a>` : ''}${s ? '<button class="btn" id="eOpen">Open source</button>' : ''}<button class="btn ghost" id="eCopy">Track in Wellby</button></div></div>`;
  d.querySelector('#mX').onclick = () => d.close();
  if (d.querySelector('#eOpen')) d.querySelector('#eOpen').onclick = () => { d.close(); W().openSource(s.p.id); };
  d.querySelector('#eCopy').onclick = () => { d.close(); openMeeting({ m: null, day: dayOf(e.start), sourceId: e.sourceId }); const f = document.querySelector('#mForm'); if (f) { f.title.value = e.title; if (!e.allDay) { const w = toLocalInput(e.start); f.time.value = w.time; } f.location.value = e.location || ''; if (e.contact) f.contact.value = e.contact; } };
  d.showModal();
}
function afterChange() { const { S, navBadges } = W(); if (S.view === 'calendar') render(); else if (S.view === 'today') W().refreshView(); navBadges(); }

// ---------- hooks into other screens ----------
const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  if (view !== 'today') return;
  load().then(() => { if (W().S.view === 'today') todayCard(); }).catch(() => {});
};
function todayCard() {
  const { $, esc } = W(), t = ymd(new Date());
  if ($('#todayMtg')) $('#todayMtg').remove();
  const todays = C.meetings.filter(m => m.status === 'scheduled' && dayOf(m.start) === t).sort((a, b) => a.start.localeCompare(b.start));
  const ext = C.events.filter(e => e.sourceId && dayOf(e.start) === t);
  const needs = C.meetings.filter(m => m.status === 'scheduled' && Date.parse(m.end) < Date.now() && dayOf(m.start) < t);
  const next = C.meetings.filter(m => m.status === 'scheduled' && dayOf(m.start) > t).sort((a, b) => a.start.localeCompare(b.start))[0];
  const rows = [...todays.map(m => `<div class="arow ev m-scheduled" data-tm="${esc(m.id)}"><div class="atime">${tm(m.start)}</div><div class="abody"><b>${esc(m.title)}</b><div class="muted small">${esc([m.sourceName, m.contact, m.location].filter(Boolean).join(' · '))}</div></div></div>`), ...ext.map(e => `<div class="arow ev ext"><div class="atime">${tm(e.start) || 'All day'}</div><div class="abody"><b>${esc(e.title)}</b><div class="muted small">${e.provider === 'google' ? 'Google Calendar' : 'Outlook'}</div></div></div>`)];
  const html = `<div class="card" id="todayMtg" style="margin:14px 0"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Today's meetings</h2><div class="row"><button class="btn sm" id="tmNew">New meeting</button><a class="btn sm ghost" href="#calendar">Open calendar</a></div></div>
    ${rows.join('') || `<p class="muted small" style="margin:8px 0 0">No meetings today.${next ? ` Next: <b>${esc(next.title)}</b>, ${dLabel(dayOf(next.start), { weekday: 'short', month: 'short', day: 'numeric' })} at ${tm(next.start)}.` : ' Plan a visit or lunch with a target to move them forward.'}</p>`}
    ${needs.length ? `<p class="small" style="margin:10px 0 0"><b>${needs.length}</b> past meeting${needs.length === 1 ? '' : 's'} still need${needs.length === 1 ? 's' : ''} an outcome. <a href="#calendar/list">Log how ${needs.length === 1 ? 'it' : 'they'} went</a></p>` : ''}</div>`;
  const head = document.querySelector('#app .head');
  if (head) head.insertAdjacentHTML('afterend', html); else $('#app').insertAdjacentHTML('afterbegin', html);
  $('#tmNew').onclick = () => openMeeting({ day: t });
  document.querySelectorAll('[data-tm]').forEach(el => el.onclick = () => openMeeting({ m: C.meetings.find(m => m.id === el.dataset.tm) }));
}
const prevDrawer = X._drawer;
X._drawer = (id, d) => {
  if (prevDrawer) prevDrawer(id, d);
  if (d.querySelector('#dMtg')) return;
  const { esc } = W(), t = ymd(new Date());
  const up = C.meetings.filter(m => m.sourceId === id && m.status === 'scheduled' && dayOf(m.start) >= t).sort((a, b) => a.start.localeCompare(b.start));
  const box = `<div class="section" id="dMtg"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Meetings</h3><button class="btn sm" id="dMtgNew">Schedule</button></div>${up.length ? up.slice(0, 3).map(m => `<div class="small dm" data-dm="${esc(m.id)}" style="padding:6px 0;border-top:1px solid var(--line);cursor:pointer"><b>${dLabel(dayOf(m.start), { weekday: 'short', month: 'short', day: 'numeric' })} ${tm(m.start)}</b> · ${esc(m.title)}</div>`).join('') : '<p class="muted small" style="margin:6px 0 0">Nothing scheduled.</p>'}</div>`;
  const facts = d.querySelector('dl.facts');
  if (facts) facts.insertAdjacentHTML('afterend', box); else d.insertAdjacentHTML('beforeend', box);
  d.querySelector('#dMtgNew').onclick = () => openMeeting({ sourceId: id, day: t });
  d.querySelectorAll('[data-dm]').forEach(el => el.onclick = () => openMeeting({ m: C.meetings.find(m => m.id === el.dataset.dm) }));
  if (!C.loaded) load().then(() => { const x = d.querySelector('#dMtg'); if (x && d.classList.contains('open')) { x.remove(); X._drawer(id, d); } }).catch(() => {});
};
