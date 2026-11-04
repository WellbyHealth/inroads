// Growth: the pieces that carry the sales story inside the app.
//  - The opportunity model: how many patients each top source refers out a year (estimate), your share,
//    and what reaching a target share is worth. Shared by every view below.
//  - #territory: "Your territory", a one-page, printable report (also the demo's Territory snapshot).
//  - The opportunity headline on Today and Targets.
//  - #welcome: the 60-second setup after checkout (offices, agency, who sends you patients today).
//  - #demo: Wellby staff build a ready demo workspace for a prospect from an address.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const pctTxt = f => f > 0 && f < .1 ? (100 * f).toFixed(1) + '%' : Math.round(100 * f) + '%';
const moneyShort = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? '$' + Math.round(n / 1e3) + 'k' : money(n);
const CARE_LABEL = { home_care: 'home care', home_health: 'home health', hospice: 'hospice', snf: 'skilled nursing', rehab: 'rehab', assisted_living: 'assisted living', home_infusion: 'home infusion', other: 'post-acute care' };
// Change the page and reload it, without first re-rendering the old state on hashchange.
const go = h => { history.replaceState(null, '', h); location.reload(); };
const ss = { get: k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} }, del: k => { try { sessionStorage.removeItem(k); } catch {} } };

// ---------- Opportunity model ----------
// Conservative typical rates: patients needing this type of care, per bed per year (hospitals), and the
// share of a nursing home's short-stay discharges home that need it. Physicians scale with practice size.
const PER_BED = { home_health: 3, home_care: .5, hospice: .4, snf: 4, rehab: .8, assisted_living: .2, home_infusion: .4, other: 1 };
const SNF_SHARE = { home_health: .45, home_care: .1, hospice: .08, assisted_living: .05 };
const MD_MULT = { home_health: 1, home_care: .4, hospice: .3, snf: .5, rehab: .3, assisted_living: .2, home_infusion: .3, other: .5 };
const DEFAULT_VALUE = { home_care: 15600 }; // Home Care Pulse average lifetime revenue per client
function outPerYear(s, care) {
  const p = s.p, size = Math.max(.05, (p.size ?? 50) / 100), fit = s.fit ?? .5, beds = +p.beds || 0;
  const rate = PER_BED[care] ?? 1, md = MD_MULT[care] ?? .5;
  let n;
  switch (p.type) {
    case 'Hospital': n = (beds || 30 + 270 * size) * rate; break;
    case 'LTAC hospital': case 'Rehab hospital': n = (beds || 40) * rate * 1.5; break;
    case 'Psychiatric hospital': n = (beds || 40) * rate * .2; break;
    case 'Skilled nursing': n = (beds || 100) * 4 * (SNF_SHARE[care] ?? .05); break; // ~4 short-stay discharges home per bed a year
    case 'Assisted living': n = (beds || 60) * .3 * fit; break;
    default: n = (2 + 20 * size) * fit * md;
  }
  return Math.max(1, Math.round(n));
}
function opp() {
  const { S } = W();
  const st = S.settings || {}, care = st.careType || 'home_care';
  const value = +st.clientValue || DEFAULT_VALUE[care] || 0, valueIsDefault = !(+st.clientValue) && !!DEFAULT_VALUE[care];
  const rows = S.referrals?.rows || [];
  const last12 = new Set((S.months || []).slice(-12));
  let refs = 0, admits = 0, admitRows = 0;
  for (const r of rows) if (last12.has(r.month)) { refs += r.count; if (r.admits != null) { admits += r.admits; admitRows += r.count; } }
  const admitRate = +st.admitRate || (admitRows >= 10 ? Math.min(1, admits / admitRows) : .5);
  const target = +st.targetShare || .05;
  const out = st.outbound || {};
  const ranked = (S.scored || []).filter(s => s.p.lat != null && !s.p.custom && (s.fit ?? 0) >= .6)
    .map(s => { const est = +out[s.p.id] ? +out[s.p.id] * 4 : outPerYear(s, care); return { s, est, own: !!+out[s.p.id], yours: s.total12 || 0 }; })
    .sort((a, b) => b.est * (b.s.fit || .5) - a.est * (a.s.fit || .5));
  // Keep the list workable for a marketer: at most 15 hospitals, so nursing homes and physicians make the cut too.
  let hosp = 0; const top = [];
  for (const t of ranked) { if (top.length >= 25) break; const h = /Hospital/.test(t.s.p.type || ''); if (h && hosp >= 15) continue; if (h) hosp++; top.push(t); }
  for (const t of top) { t.share = Math.min(1, t.yours / t.est); t.gap = Math.max(0, Math.round(target * t.est - t.yours)); }
  const totalOut = top.reduce((a, t) => a + t.est, 0), yours = top.reduce((a, t) => a + Math.min(t.yours, t.est), 0);
  const extra = top.reduce((a, t) => a + t.gap, 0);
  return { care, careLabel: CARE_LABEL[care] || 'care', value, valueIsDefault, admitRate, admitFromData: !(+st.admitRate) && admitRows >= 10, target, top, totalOut, yours, share: totalOut ? yours / totalOut : 0, extra, extraClients: extra * admitRate, extraValue: extra * admitRate * value, hasRefs: refs > 0 };
}
X.opp = opp;
X.outPerYear = s => outPerYear(s, W().S.settings?.careType || 'home_care');

function headline(O, where) {
  const { esc } = W();
  if (!O.top.length) return '';
  const val = O.value ? `<b>≈${moneyShort(O.extraValue)} a year</b>` : `<b>≈${Math.round(O.extraClients)} new clients a year</b>`;
  return `<a class="card oppBanner" href="#territory" data-where="${where}"><img src="/img/g-cl-stk-market-cut.webp" alt=""><div><div class="oppEye">Your biggest opportunity</div>
    <div class="oppMain">Your top ${O.top.length} sources refer out <b>≈${Math.round(O.totalOut).toLocaleString('en-US')}</b> ${esc(O.careLabel)} patients a year. ${O.hasRefs ? `You get about <b>${pctTxt(O.share)}</b>.` : 'Add who sends you patients to see your share.'}</div>
    <div class="oppSub">Reaching a ${Math.round(100 * O.target)}% share of each is worth ${val}. See your territory →</div></div></a>`;
}

// ---------- Your territory ----------
const GROUPS = [['Hospitals', t => /Hospital/.test(t)], ['Skilled nursing', t => t === 'Skilled nursing'], ['Physicians', t => t.startsWith('Physician')], ['Assisted living', t => t === 'Assisted living'], ['Other', () => true]];
X.territory = () => {
  const { S, esc, fmt, openSource } = W(), app = document.getElementById('app');
  if (S.me.orgSales) { location.replace('#prospects'); return; }
  if (!S.offices.length) { location.replace('#welcome'); return; }
  const O = opp();
  const counts = GROUPS.map(([n]) => [n, 0]);
  for (const p of S.market.providers) { const i = GROUPS.findIndex(([, f]) => f(p.type || '')); counts[i][1]++; }
  const prep = S.me.super && S.me.orgDemo ? `Prepared for ${esc(S.settings.agencyName || S.me.orgName || 'your agency')} by Wellby` : esc(S.settings.agencyName || S.me.orgName || '');
  const assume = `${O.value ? `${money(O.value)} per new client${O.valueIsDefault ? ' (Home Care Pulse average)' : ''}` : 'no revenue per client set'} · ${Math.round(100 * O.admitRate)}% of referrals become clients${O.admitFromData ? ' (from your data)' : ''} · target share ${Math.round(100 * O.target)}%`;
  app.innerHTML = `<div class="terr">
    <div class="terrHead"><div><span class="eyebrow">Your territory · ${esc(S.offices.map(o => `${o.label} (${o.radiusMiles} mi)`).join(' · '))}</span>
      <h1>${fmt(S.market.providers.length)} referral sources around your offices</h1>
      <p class="muted">${counts.filter(c => c[1]).map(([n, c]) => `${fmt(c)} ${n.toLowerCase()}`).join(' · ')}. From national public data (CMS and NPPES), ranked for ${esc(O.careLabel)}.</p></div>
      <div class="row noprint"><button class="btn" id="tPrint">Print snapshot</button><a class="btn" href="#map">See them on the map</a></div></div>
    <div class="terrBig">
      <div class="card tb1"><span class="tlab">Your top ${O.top.length} sources refer out</span><b class="tnum">≈${fmt(Math.round(O.totalOut))}</b><span class="muted small">${esc(O.careLabel)} patients a year (estimate)</span></div>
      <div class="card tb2"><span class="tlab">You get</span><b class="tnum">${O.hasRefs ? pctTxt(O.share) : '–'}</b><span class="muted small">${O.hasRefs ? `${fmt(O.yours)} of them in the last 12 months` : '<a href="#welcome/3">Add who sends you patients</a>'}</span></div>
      <div class="card tb3"><span class="tlab">Reach a ${Math.round(100 * O.target)}% share</span><b class="tnum">+${fmt(O.extra)}</b><span class="muted small">referrals a year · ≈${Math.round(O.extraClients)} new clients</span></div>
      <div class="card tb4 hl"><span class="tlab">Worth</span><b class="tnum">${O.value ? moneyShort(O.extraValue) : '–'}</b><span class="small">${O.value ? 'a year in new client revenue' : '<a href="#" id="tSetVal">Set revenue per client</a>'}</span></div>
    </div>
    <p class="muted small terrAssume">Assumptions: ${esc(assume)}. <a href="#" id="tEdit" class="noprint">Change</a></p>
    <form id="tAssume" class="card noprint" hidden><div class="row">
      <label>Revenue per new client ($)<input name="clientValue" type="number" min="0" step="100" value="${O.value || ''}"></label>
      <label>Referrals that become clients (%)<input name="admitRate" type="number" min="5" max="100" value="${Math.round(100 * O.admitRate)}"></label>
      <label>Target share of each source (%)<input name="targetShare" type="number" min="1" max="50" value="${Math.round(100 * O.target)}"></label>
      <button class="btn primary">Update</button></div></form>
    <div class="card"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 style="margin:0">Top sources by opportunity</h2><span class="muted small noprint">Tap a source to see contacts and start a win flow</span></div>
      <div class="tscroll"><table class="terrT"><thead><tr><th>#</th><th>Source</th><th class="num">Refer out / yr</th><th class="num">To you (12 mo)</th><th class="num">Your share</th><th class="num">+ at ${Math.round(100 * O.target)}%</th><th>Status</th></tr></thead><tbody>
      ${O.top.map((t, i) => `<tr data-src="${esc(t.s.p.id)}"><td class="muted">${i + 1}</td><td><b>${esc(t.s.p.name)}</b><div class="muted small">${esc(t.s.p.type)}${t.s.p.beds ? ` · ${t.s.p.beds} beds` : ''}${t.s.dist != null ? ` · ${t.s.dist.toFixed(1)} mi from ${esc(t.s.office)}` : ''}</div></td>
        <td class="num">${t.own ? '' : '≈'}${fmt(t.est)}</td><td class="num">${fmt(t.yours)}</td><td class="num">${t.yours ? pctTxt(t.share) : '0%'}</td><td class="num">${t.gap ? '+' + fmt(t.gap) : '–'}</td><td><span class="chip st-${t.s.status}">${t.s.status}</span></td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted small" style="margin:10px 0 0">"Refer out" is an estimate from CMS bed counts and typical discharge patterns for ${esc(O.careLabel)}. If you know a source's real number, enter it on the <a href="#scorecard">Scorecard</a> and it replaces the estimate.</p></div>
    <div class="terrNext noprint card"><div><h2 style="margin:0 0 4px">Win your first one</h2><p class="muted small" style="margin:0">Start a win flow on your #1 source. Wellby drafts the first email in your voice and lines up the visit.</p></div>
      ${O.top[0] ? `<button class="btn primary" id="tStart">Start on ${esc(O.top[0].s.p.name.slice(0, 32))}</button>` : ''}</div>
    <p class="printOnly small muted">${prep} · wellbyinroads.com · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Estimates from public CMS and NPPES data.</p></div>`;
  app.querySelectorAll('[data-src]').forEach(r => r.onclick = () => openSource(r.dataset.src));
  document.getElementById('tPrint').onclick = () => print();
  const form = document.getElementById('tAssume');
  const showForm = e => { e.preventDefault(); form.hidden = false; form.querySelector('input').focus(); };
  document.getElementById('tEdit').onclick = showForm;
  const sv = document.getElementById('tSetVal'); if (sv) sv.onclick = showForm;
  form.onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const r = await W().post('saveSettings', { settings: { clientValue: +f.clientValue.value || 0, admitRate: (+f.admitRate.value || 50) / 100, targetShare: (+f.targetShare.value || 10) / 100 } });
    S.settings = r.settings; X.territory(); W().toast('Assumptions updated');
  };
  const st = document.getElementById('tStart');
  if (st) st.onclick = () => { openSource(O.top[0].s.p.id); setTimeout(() => { const b = document.querySelector('#drawer [data-flow], #drawer [data-startflow]'); if (b) b.click(); }, 120); };
};

// ---------- Opportunity headline on Today and Targets ----------
function placeHeadline(view) {
  const { S } = W(), app = document.getElementById('app');
  if (!app || !S.offices?.length || app.querySelector('.oppBanner')) return;
  const html = headline(opp(), view); if (!html) return;
  if (view === 'today') { const tiles = document.querySelector('#tBrief .ttiles'); if (tiles) tiles.insertAdjacentHTML('afterend', html); }
  else if (view === 'sources' || view === 'map') { const head = app.querySelector(':scope > .head') || app.querySelector('.head'); if (head && view === 'sources') head.insertAdjacentHTML('afterend', html); }
}

// ---------- 60-second setup ----------
const WIZ_STEPS = ['Offices', 'Your agency', 'Who sends you patients'];
function wizShell(step, inner, note = '') {
  return `<div class="wiz"><div class="wizTop"><span class="eyebrow">Set up · about a minute</span><ol class="wizSteps">${WIZ_STEPS.map((s, i) => `<li class="${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}"><b>${i + 1}</b>${s}</li>`).join('')}</ol></div>${note}<div class="card wizCard">${inner}</div></div>`;
}
function offRow(o = {}) {
  const { esc } = W();
  return `<div class="wizOff"><input name="label" placeholder="Office name (e.g. Dallas)" value="${esc(o.label || '')}"><input name="address" placeholder="Street, city, state ZIP" value="${esc(o.address || '')}" required><select name="radius" title="How far your marketers go">${[10, 15, 20, 25, 30, 40, 50].map(m => `<option value="${m}" ${(o.radiusMiles || 20) === m ? 'selected' : ''}>${m} mi</option>`).join('')}</select>${o.unmatched ? '<div class="err small">We couldn\'t find that address. Check the street and ZIP.</div>' : ''}</div>`;
}
X.welcome = sub => {
  const { S, esc, post, toast, fmt } = W(), app = document.getElementById('app');
  const started = sub === 'started';
  const step = started ? 1 : Math.max(1, Math.min(3, +sub || 1));
  if (started && S.offices.length) { toast('Your free trial has started. You won’t be charged until it ends.'); location.replace('#today'); return; }
  const note = started ? '<div class="notice wizNote">Your 14-day free trial has started. Nothing is charged until it ends. Let’s set up your territory.</div>' : '';
  if (step === 1) {
    const offices = S.settings.offices?.length ? S.settings.offices : [{}];
    app.innerHTML = wizShell(1, `<h1>Where are your offices?</h1><p class="muted">Wellby finds every hospital, physician and facility around each one, from national public data.</p>
      <form id="wf1"><div id="wOffs">${offices.map(offRow).join('')}</div><button type="button" class="btn sm ghost" id="wAdd">+ Add another office</button>
      <p class="err" id="wErr"></p><button class="btn primary wide" id="wGo">Find my referral sources</button></form>`, note);
    document.getElementById('wAdd').onclick = () => document.getElementById('wOffs').insertAdjacentHTML('beforeend', offRow());
    document.getElementById('wf1').onsubmit = async e => {
      e.preventDefault();
      const rows = [...document.querySelectorAll('.wizOff')].map(r => ({ label: r.querySelector('[name=label]').value.trim(), address: r.querySelector('[name=address]').value.trim(), radiusMiles: +r.querySelector('[name=radius]').value })).filter(o => o.address);
      if (!rows.length) { document.getElementById('wErr').textContent = 'Add at least one office address.'; return; }
      const btn = document.getElementById('wGo'); btn.disabled = true; btn.textContent = 'Finding your referral sources…';
      try {
        const r = await post('saveSettings', { settings: { offices: rows.map(o => ({ ...o, label: o.label || o.address.split(',')[1]?.trim() || 'Office' })) } });
        S.settings = r.settings;
        if (!r.settings.offices.some(o => o.lat)) { app.innerHTML = ''; X.welcome('1'); document.getElementById('wErr').textContent = "We couldn't find those addresses. Check the street and ZIP."; return; }
        go('#welcome/2');
      } catch (x) { document.getElementById('wErr').textContent = x.message; btn.disabled = false; btn.textContent = 'Find my referral sources'; }
    };
    return;
  }
  if (!S.offices.length) { location.replace('#welcome'); return; }
  if (step === 2) {
    const care = S.settings.careType || 'home_care', v = +S.settings.clientValue || DEFAULT_VALUE[care] || '';
    app.innerHTML = wizShell(2, `<h1>Found ${fmt(S.market.providers.length)} referral sources.</h1><p class="muted">Two quick questions so Wellby can rank them and put a value on each one.</p>
      <form id="wf2"><label>Type of care<select name="careType">${Object.entries(CARE_LABEL).map(([k, l]) => `<option value="${k}" ${k === care ? 'selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`).join('')}</select></label>
      <label>What's a new client worth to you, over their time with you? <span class="muted small">(revenue, $)</span><input name="clientValue" type="number" min="0" step="100" value="${v}" placeholder="e.g. 15600"></label>
      <p class="muted small" id="wValHint">${care === 'home_care' ? 'The average for home care is about $15,600 (Home Care Pulse). Use your own number if you know it.' : 'Your best estimate is fine. You can change it anytime.'}</p>
      <div class="row"><a class="btn ghost" href="#welcome/1">Back</a><button class="btn primary" id="wGo">Continue</button></div></form>`);
    const f = document.getElementById('wf2');
    f.careType.onchange = () => { document.getElementById('wValHint').textContent = f.careType.value === 'home_care' ? 'The average for home care is about $15,600 (Home Care Pulse). Use your own number if you know it.' : 'Your best estimate is fine. You can change it anytime.'; if (f.careType.value === 'home_care' && !f.clientValue.value) f.clientValue.value = 15600; };
    f.onsubmit = async e => {
      e.preventDefault(); const btn = document.getElementById('wGo'); btn.disabled = true;
      const changed = f.careType.value !== care;
      const r = await post('saveSettings', { settings: { careType: f.careType.value, clientValue: +f.clientValue.value || 0 } }); S.settings = r.settings;
      if (changed) go('#welcome/3'); else location.hash = '#welcome/3';
    };
    return;
  }
  // Step 3: who sends you patients today (rough numbers become your starting share).
  const O = opp(), list = O.top.slice(0, 8);
  app.innerHTML = wizShell(3, `<h1>Who sends you patients today?</h1><p class="muted">Your 8 biggest nearby sources. Roughly how many patients did each send you in the last 3 months? A guess is fine; leave it blank if none.</p>
    <form id="wf3"><div class="wSrcs">${list.map(t => `<label class="wSrc"><span><b>${esc(t.s.p.name)}</b><span class="muted small">${esc(t.s.p.type)}${t.s.dist != null ? ` · ${t.s.dist.toFixed(1)} mi` : ''}</span></span><input type="number" min="0" max="500" inputmode="numeric" name="${esc(t.s.p.id)}" placeholder="0" value="${t.s.last3 || ''}"></label>`).join('')}</div>
    <p class="muted small">You can upload your full referral history later on the Referral data page. That replaces these estimates.</p>
    <div class="row"><a class="btn ghost" href="#welcome/2">Back</a><button class="btn primary" id="wGo">Show me my territory</button><button type="button" class="btn ghost" id="wSkip">Skip for now</button></div></form>`);
  const finish = () => { ss.set('wb_tour', 1); go('#territory'); };
  document.getElementById('wSkip').onclick = finish;
  document.getElementById('wf3').onsubmit = async e => {
    e.preventDefault(); const btn = document.getElementById('wGo'); btn.disabled = true; btn.textContent = 'Building your territory…';
    const months = (S.months || []).slice(-3), rows = [];
    for (const t of list) {
      const n = Math.max(0, Math.round(+(e.target.querySelector(`[name="${CSS.escape(t.s.p.id)}"]`)?.value) || 0)); if (!n || !months.length) continue;
      const per = Math.floor(n / 3), rem = n - per * 3;
      months.forEach((m, i) => { const c = per + (i >= 3 - rem ? 1 : 0); if (c) rows.push({ key: t.s.p.id, npi: /^\d{10}$/.test(t.s.p.id) ? t.s.p.id : '', name: t.s.p.name, month: m, count: c, payer: '' }); });
    }
    if (rows.length) await post('saveReferrals', { rows, mode: 'merge', fileName: 'Quick setup (your estimates)' });
    finish();
  };
};

// ---------- Demo builder (Wellby staff) ----------
function sampleRows(S) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pool = S.scored.filter(s => ['Hospital', 'Skilled nursing', 'Rehab hospital', 'Assisted living', 'Physician: geriatrics'].includes(s.p.type) && s.size >= .5).sort((a, b) => b.potential - a.potential).slice(0, 60);
  const months = (S.months || []).slice(-12), out = [];
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
  return out;
}
X.demo = async sub => {
  const { S, esc, api, post, toast } = W(), app = document.getElementById('app');
  if (!S.me.super) { location.replace('#today'); return; }
  const pending = ss.get('wb_demo');
  if (sub === 'finish' && pending) {
    app.innerHTML = '<div class="loading">Adding sample referral history and a win flow…</div>';
    ss.del('wb_demo');
    try {
      if (pending.sample && S.scored.length) await post('saveReferrals', { rows: sampleRows(S), mode: 'replace', fileName: 'SAMPLE DATA' });
      if (pending.flow && X.createSampleFlow) { const d = await api('/api/data'); Object.assign(S, { referrals: d.referrals, flows: d.flows || {} }); await X.createSampleFlow({ quiet: true }); }
    } catch (e) { toast(e.message); }
    go('#territory'); return;
  }
  app.innerHTML = `<div class="wiz"><div class="wizTop"><span class="eyebrow sky">Wellby staff · demo builder</span></div><div class="card wizCard">
    <h1>Build a demo for a prospect</h1><p class="muted">Enter the agency and its office address. In about a minute you get a demo workspace on their real territory: ranked sources, their opportunity in dollars, sample referral history and a win flow in progress. No card, and it never locks.</p>
    <form id="df"><div class="grid2"><label>Agency name<input name="name" required placeholder="e.g. Harbor Home Care"></label><label>Website <span class="muted small">(optional)</span><input name="website" placeholder="https://"></label></div>
      <div class="grid2"><label>Type of care<select name="careType">${Object.entries(CARE_LABEL).map(([k, l]) => `<option value="${k}">${l[0].toUpperCase() + l.slice(1)}</option>`).join('')}</select></label><label>Revenue per new client ($)<input name="clientValue" type="number" min="0" step="100" value="15600"></label></div>
      <div class="tlab" style="margin:6px 0">Offices</div><div id="dOffs">${offRow()}</div><button type="button" class="btn sm ghost" id="dAdd">+ Add another office</button>
      <label class="chk"><input type="checkbox" name="sample" checked> Add sample referral history (labeled as sample)</label>
      <label class="chk"><input type="checkbox" name="flow" checked> Add a win flow in progress</label>
      <p class="err" id="dErr"></p><button class="btn primary wide" id="dGo">Build the demo</button></form>
    <p class="muted small" style="margin-top:12px">Then open <b>Your territory</b> and use <b>Print snapshot</b> for a one-page PDF to send before the call. Switch back to any workspace from the menu at the top right.</p></div></div>`;
  document.getElementById('dAdd').onclick = () => document.getElementById('dOffs').insertAdjacentHTML('beforeend', offRow());
  document.getElementById('df').onsubmit = async e => {
    e.preventDefault(); const f = e.target, err = document.getElementById('dErr'), btn = document.getElementById('dGo');
    const offices = [...document.querySelectorAll('#dOffs .wizOff')].map(r => ({ label: r.querySelector('[name=label]').value.trim(), address: r.querySelector('[name=address]').value.trim(), radiusMiles: +r.querySelector('[name=radius]').value })).filter(o => o.address);
    if (!f.name.value.trim() || !offices.length) { err.textContent = 'Add the agency name and at least one office address.'; return; }
    btn.disabled = true; btn.textContent = 'Building…'; err.textContent = '';
    try {
      await api('/api/workspaces', { action: 'create', name: f.name.value.trim(), website: f.website.value.trim(), demo: true });
      const r = await post('saveSettings', { settings: { agencyName: f.name.value.trim(), website: f.website.value.trim(), careType: f.careType.value, clientValue: +f.clientValue.value || 0, senderName: S.me.name, offices: offices.map(o => ({ ...o, label: o.label || o.address.split(',')[1]?.trim() || 'Office' })) } });
      if (!r.settings.offices.some(o => o.lat)) { err.textContent = "We couldn't find that address. The workspace was created; fix the address in Settings."; btn.disabled = false; btn.textContent = 'Build the demo'; return; }
      ss.set('wb_demo', { sample: f.sample.checked, flow: f.flow.checked });
      go('#demo/finish');
    } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Build the demo'; }
  };
};

// ---------- Hooks ----------
const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  const { S } = W();
  // New agencies set up through the 60-second wizard instead of the Settings page.
  if (view === 'settings' && sub === 'setup' && !S.me.super) { location.replace('#welcome'); return; }
  if (view === 'today' || view === 'sources') try { placeHeadline(view); } catch (e) { console.error(e); }
};
