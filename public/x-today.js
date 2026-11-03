// Today, redesigned as a daily briefing: a one-line summary, four pulse tiles (referrals, this week's
// touches, meetings, pipeline), the one thing to do first, and what changed in your referrals.
// It sits on top of the existing queue and targets, whose buttons keep working.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const STAGES = ['Targeted', 'Introduced', 'Met', 'First referral', 'Regular'];
const mLabel = k => { const [y, m] = k.split('-'); return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); };
const mLong = k => { const [y, m] = k.split('-'); return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }); };
const pct = (a, b) => b ? Math.round(100 * (a - b) / b) : null;
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

function spark(vals, { w = 132, h = 36, color = '#0071E3' } = {}) {
  if (!vals.length) return '';
  const max = Math.max(1, ...vals), step = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => [i * step, h - 3 - (h - 6) * v / max]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="tspark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h} Z" fill="${color}" opacity=".10"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/></svg>`;
}
function ring(done, goal) {
  const r = 22, c = 2 * Math.PI * r, f = Math.min(1, goal ? done / goal : 0);
  return `<svg class="tring" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(118,118,128,.18)" stroke-width="6"/><circle cx="28" cy="28" r="${r}" fill="none" stroke="${f >= 1 ? '#34C759' : '#0071E3'}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>`;
}

function data() {
  const { S, isSkip, flowState, queueItems, today } = W();
  const t = today(), wk = weekStart();
  const months = S.months || [], hasRefs = (S.referrals.rows || []).length > 0;
  const byMonth = months.map((_, i) => S.scored.reduce((a, s) => a + (s.h?.[i] || 0), 0));
  const cur = byMonth[11] || 0, prev = byMonth[10] || 0;
  const doneWk = S.activity.filter(a => a.status === 'done' && !isSkip(a) && (a.doneAt || a.at).slice(0, 10) >= wk).length;
  const goal = S.settings.weeklyGoal || 10;
  const cal = X.calendarData?.() || { meetings: [] };
  const wkEnd = new Date(wk + 'T12:00:00'); wkEnd.setDate(wkEnd.getDate() + 6); const we = wkEnd.toISOString().slice(0, 10);
  const mtgWk = cal.meetings.filter(m => m.start.slice(0, 10) >= wk && m.start.slice(0, 10) <= we && m.status !== 'canceled');
  const flows = Object.keys(S.flows).map(id => flowState(id)).filter(Boolean);
  const stages = STAGES.map((_, i) => flows.filter(f => f.stage === i).length);
  const { steps, follow } = queueItems();
  const drafts = S.activity.filter(a => a.status === 'draft');
  // What changed in referrals
  const sig = [];
  for (const s of S.scored) {
    if (!s.total12) continue;
    const first = s.h.findIndex(v => v > 0);
    if (first >= 10) sig.push({ kind: 'new', w: 50 + s.h[first], s, text: `First referral${s.h.slice(10).reduce((a, b) => a + b, 0) > 1 ? 's' : ''} from <b>${W().esc(s.p.name)}</b> in ${mLong(months[first])}`, sub: `${s.p.type} · send a thank-you and lock in the relationship` });
    else if (s.status === 'Protect') sig.push({ kind: 'down', w: 40 + (s.prior3 - s.last3) * 3 + s.prior3, s, text: s.last3 === 0 ? `<b>${W().esc(s.p.name)}</b> hasn’t referred in 3 months` : `<b>${W().esc(s.p.name)}</b> dropped to ${s.last3} from ${s.prior3}`, sub: `${s.total12} referrals in the last 12 months${s.lastTouch ? ` · last touch ${W().agoText(s.lastTouch).toLowerCase()}` : ' · no outreach logged yet'}` });
    else if (s.prior3 > 0 && s.last3 >= s.prior3 + 3) sig.push({ kind: 'up', w: 20 + s.last3 - s.prior3, s, text: `<b>${W().esc(s.p.name)}</b> is up to ${s.last3} from ${s.prior3}`, sub: `Last 3 months vs the 3 before · ${s.p.type}` });
  }
  sig.sort((a, b) => b.w - a.w);
  return { t, hasRefs, months, byMonth, cur, prev, doneWk, goal, mtgWk, flows, stages, steps, follow, drafts, sig };
}

function focusPick(D) {
  const { S } = W();
  const st = D.steps[0];
  if (st) { const s = S.scoredById.get(st.id); return { s, why: `${st.fs.next.label}. ${st.fs.next.due < D.t ? 'Overdue since ' + W().fmtShort(st.fs.next.due) : 'Due today'} in its win flow (${STAGES[st.fs.stage]}).`, act: { sel: `[data-stepact="draft"][data-sid="${CSS.escape(st.id)}"]`, label: 'Do this step' } }; }
  const drop = D.sig.find(x => x.kind === 'down' && !(x.s.lastTouch && W().daysSince(x.s.lastTouch) < 14));
  if (drop) return { s: drop.s, why: `${drop.s.why[0]}. They sent you ${drop.s.total12} referrals in the last year; a visit now is how you win them back.`, act: S.flows[drop.s.p.id] ? null : { sel: `[data-flow="${CSS.escape(drop.s.p.id)}"]`, label: 'Start win-back flow' } };
  const fresh = D.sig.find(x => x.kind === 'new');
  if (fresh) return { s: fresh.s, why: 'They just started sending you patients. Thank them while it’s fresh and ask what would make the next referral easy.', act: null };
  const top = S.scored.filter(s => !S.flows[s.p.id] && s.status !== 'Healthy').sort((a, b) => b.priority - a.priority)[0];
  return top ? { s: top, why: `${top.why.join('. ')}. Your best opening right now.`, act: { sel: `[data-flow="${CSS.escape(top.p.id)}"]`, label: 'Start win flow' } } : null;
}

function summary(D) {
  const bits = [];
  if (D.hasRefs && D.prev) { const p = pct(D.cur, D.prev); bits.push(p === 0 ? `Referrals held steady in ${mLong(D.months[11])}` : `Referrals were ${p > 0 ? 'up' : 'down'} ${Math.abs(p)}% in ${mLong(D.months[11])}`); }
  const down = D.sig.filter(s => s.kind === 'down').length, fresh = D.sig.filter(s => s.kind === 'new').length;
  if (down) bits.push(`${down} source${down === 1 ? ' has' : 's have'} slowed down`);
  if (fresh) bits.push(`${fresh} new referrer${fresh === 1 ? '' : 's'} to thank`);
  const q = D.steps.length + D.follow.length + D.drafts.length;
  if (q) bits.push(`${q} item${q === 1 ? '' : 's'} in your queue`);
  if (!bits.length) return 'A quiet day. A good time to open a new relationship.';
  return bits.length === 1 ? bits[0] + '.' : bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] + '.';
}

function render() {
  const { S, esc, fmt, phoneFmt, openSource } = W(), app = document.getElementById('app');
  if (!app || S.view !== 'today') return;
  document.getElementById('tBrief')?.remove();
  const D = data(), F = focusPick(D);
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const p = pct(D.cur, D.prev);
  const refTile = D.hasRefs ? `<div class="ttile" data-go="#results"><div class="tlab">Referrals · ${esc(mLabel(D.months[11]))}</div><div class="tbig">${fmt(D.cur)}${p != null ? `<span class="tdelta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>` : ''}</div>${spark(D.byMonth)}<div class="tsub">12 months · ${fmt(D.byMonth.reduce((a, b) => a + b, 0))} total</div></div>`
    : `<div class="ttile" data-go="#referrals"><div class="tlab">Referrals</div><div class="tbig muted">–</div><div class="tsub"><a href="#referrals">Add your referral history</a> to see your trend</div></div>`;
  const left = Math.max(0, D.goal - D.doneWk);
  const wkTile = `<div class="ttile row2"><div>${ring(D.doneWk, D.goal)}</div><div><div class="tlab">Touches this week</div><div class="tbig">${D.doneWk}<span class="tof">/ ${D.goal}</span></div><div class="tsub">${left ? `${left} to go to hit your goal` : 'Goal hit. Nice work.'}</div></div></div>`;
  const mDone = D.mtgWk.filter(m => m.status === 'done').length, mUp = D.mtgWk.filter(m => m.status === 'scheduled' && Date.parse(m.end) >= Date.now()).length;
  const mtgTile = `<div class="ttile" data-go="#calendar"><div class="tlab">Meetings this week</div><div class="tbig">${D.mtgWk.length}</div><div class="tsub">${mDone} done · ${mUp} coming up</div><div class="tmini">${D.mtgWk.slice(0, 5).map(m => `<i class="${m.status === 'done' ? 'ok' : m.status === 'scheduled' ? 'sch' : 'miss'}" title="${esc(m.title)}"></i>`).join('') || '<span class="tsub">Nothing booked yet</span>'}</div></div>`;
  const maxSt = Math.max(1, ...D.stages);
  const pipeTile = `<div class="ttile" data-go="#flows"><div class="tlab">Win flows</div><div class="tbig">${D.flows.length}</div><div class="tstages">${D.stages.map((n, i) => `<div title="${STAGES[i]}: ${n}"><i style="height:${Math.round(4 + 26 * n / maxSt)}px" class="${i >= 3 ? 'won' : ''}"></i><span>${n}</span></div>`).join('')}</div><div class="tsub">Targeted → Regular</div></div>`;

  let focus = '';
  if (F) {
    const s = F.s, c = (S.contacts[s.p.id] || [])[0];
    focus = `<div class="card tfocus"><div class="tflab">Your one thing today</div>
      <div class="tfrow"><div class="tfmain"><h2><span class="name" data-src="${esc(s.p.id)}">${esc(s.p.name)}</span> <span class="chip st-${s.status}">${s.status}</span></h2>
        <div class="muted small">${esc(s.p.type)}${s.p.city ? ' · ' + esc(s.p.city) : ''}${s.dist != null ? ` · ${s.dist.toFixed(1)} mi from ${esc(s.office)}` : ''}</div>
        <p class="tfwhy">${esc(F.why)}</p>
        <div class="tfmeta">${c ? `<span><b>${esc(c.name)}</b>${c.role ? ', ' + esc(c.role) : ''}${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(phoneFmt(c.phone))}</a>` : ''}</span>` : s.p.phone ? `<span>Main line <a href="tel:${esc(s.p.phone)}">${esc(phoneFmt(s.p.phone))}</a></span>` : ''}<span>${s.lastTouch ? 'Last touch ' + W().agoText(s.lastTouch).toLowerCase() : 'No outreach yet'}</span></div>
        <div class="row" style="margin-top:12px">${F.act ? `<button class="btn primary" id="tfAct">${esc(F.act.label)}</button>` : ''}<button class="btn" id="tfOpen">Open source</button>${X.openMeeting ? '<button class="btn ghost" id="tfMeet">Schedule a visit</button>' : ''}</div></div>
        ${s.total12 ? `<div class="tfchart"><div class="tlab">Their referrals, 12 months</div>${spark(s.h, { w: 180, h: 54, color: s.status === 'Protect' ? '#C0262D' : '#0071E3' })}<div class="tsub">${s.last3} in the last 3 months · ${s.prior3} the 3 before</div></div>` : ''}</div></div>`;
  }
  const ICON = { down: '↘', up: '↗', new: '★' };
  const changes = D.sig.length ? `<div class="card tchanges"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 style="margin:0">What changed</h2><a class="small" href="#results">See results</a></div>
    ${D.sig.slice(0, 5).map(x => `<div class="tsig" data-src="${esc(x.s.p.id)}"><span class="tsi ${x.kind}">${ICON[x.kind]}</span><div class="tst"><div>${x.text}</div><div class="muted small">${esc(x.sub)}</div></div>${spark(x.s.h.slice(6), { w: 64, h: 24, color: x.kind === 'down' ? '#C0262D' : x.kind === 'new' ? '#B7791F' : '#1E7B34' })}</div>`).join('')}
    ${D.sig.length > 5 ? `<div class="muted small" style="margin-top:8px">+${D.sig.length - 5} more on the <a href="#sources">targets list</a></div>` : ''}</div>`
    : D.hasRefs ? '' : '';
  const html = `<div id="tBrief"><div class="thead"><div><span class="eyebrow">${esc(dateLine)}</span><h1>${hello}, ${esc(S.me.name.split(' ')[0])}</h1><p class="tsum">${esc(summary(D))}</p></div></div>
    <div class="ttiles">${refTile}${wkTile}${mtgTile}${pipeTile}</div>
    <div class="tgrid">${focus}${changes}</div></div>`;
  const head = app.querySelector(':scope > .head');
  if (head) { head.classList.add('t-old'); head.insertAdjacentHTML('beforebegin', html); } else app.insertAdjacentHTML('afterbegin', html);
  // Lighter page below the briefing: the market card repeats the tiles, and Up next shows five until expanded.
  app.querySelectorAll('.card h2').forEach(h => { if (h.textContent.trim() === 'Your market') h.closest('.card').style.display = 'none'; });
  const plan = app.querySelector('ul.plan');
  if (plan && !plan.dataset.trim) { plan.dataset.trim = 1; const li = [...plan.children]; if (li.length > 5) { li.slice(5).forEach(x => x.hidden = true); plan.insertAdjacentHTML('afterend', `<button class="btn sm ghost" id="tMore">Show ${li.length - 5} more</button>`); document.getElementById('tMore').onclick = e => { li.forEach(x => x.hidden = false); e.target.remove(); }; } }
  const b = document.getElementById('tBrief');
  b.querySelectorAll('[data-go]').forEach(el => el.onclick = e => { if (e.target.closest('a')) return; location.hash = el.dataset.go; });
  b.querySelectorAll('[data-src]').forEach(el => el.onclick = () => openSource(el.dataset.src));
  if (F) {
    const act = document.getElementById('tfAct');
    if (act) act.onclick = () => { const btn = app.querySelector(F.act.sel); if (btn) btn.click(); else openSource(F.s.p.id); };
    document.getElementById('tfOpen').onclick = () => openSource(F.s.p.id);
    const mt = document.getElementById('tfMeet'); if (mt) mt.onclick = () => X.openMeeting({ sourceId: F.s.p.id, day: W().today() });
  }
}

const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  if (view !== 'today') return;
  render();
  // Meetings load in the background; refresh the meetings tile once they arrive.
  if (X.calendarData && !X.calendarData().loaded) { let n = 0; const iv = setInterval(() => { if (X.calendarData().loaded || ++n > 20) { clearInterval(iv); if (W().S.view === 'today' && X.calendarData().loaded) render(); } }, 300); }
};
