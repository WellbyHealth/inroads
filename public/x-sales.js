// Wellby sales workspace (an org with sales: true, run by Wellby staff). The same tool, pointed at Wellby's own market:
//   - Prospects tab (Plan → Prospects): post-acute agencies nationwide that might buy Wellby, ranked by fit
//     (agency type, multi-site groups, size, a named decision maker). Top 6,000 nationwide, or every agency in chosen states.
//   - Each prospect opens in the usual drawer; logging a touch works as for any partner.
//   - Lightfield: copy prospects (account + decision maker) to Lightfield; finished touches follow as notes (server side).
//   - Staff: "Open Wellby sales" on the Settings → Workspaces card creates or opens the workspace.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const sales = () => !!W()?.S?.me?.orgSales;
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const F = { q: '', type: '', sites: 1, dm: false, stage: 'all', n: 100 };
const LF = { loaded: false, configured: false, ids: {} };
const tier = n => n >= 6 ? 'Enterprise' : n >= 2 ? 'Team' : 'Solo';
const phone = p => W().phoneFmt ? W().phoneFmt(p) : p;

async function lfStatus() {
  if (LF.loaded) return LF;
  try { Object.assign(LF, await W().api('/api/connect', { action: 'lightfield', op: 'status' }), { loaded: true }); } catch { LF.loaded = true; }
  return LF;
}
// Already in Lightfield: copied from the app, or added directly with the researched contacts.
const lfOf = p => LF.ids[p.id] || (p.research?.lf?.account ? { id: p.research.lf.account, link: p.research.lf.link } : null);
async function lfPush(list) {
  list = list.filter(s => !lfOf(s.p));
  const items = list.map(s => ({ id: s.p.id, name: s.p.name, type: s.p.type, address: s.p.address, city: s.p.city, st: s.p.st, zip: s.p.zip, lat: s.p.lat, lng: s.p.lng, phone: s.p.phone, official: s.p.official, officialTitle: s.p.officialTitle, sites: s.p.sites, score: s.potential, why: s.why.join('; '), website: s.p.research?.website || '', people: (s.p.research?.people || []).slice(0, 5).map(x => ({ name: x.name, title: x.title, email: x.email || '', source: x.source || '' })), notes: s.p.research?.notes || '' }));
  let pushed = 0;
  for (let i = 0; i < items.length; i += 25) { const r = await W().api('/api/connect', { action: 'lightfield', op: 'push', items: items.slice(i, i + 25) }); Object.assign(LF.ids, r.ids || {}); pushed += r.pushed || 0; }
  return pushed;
}

const url = u => /^https?:/i.test(u) ? u : `https://${u}`;
// Best person to call: a researched business development lead, then a researched leader, then the NPPES official.
function personCell(p, esc) {
  const ppl = p.research?.people || [];
  const best = ppl.find(x => x.role === 'bd') || ppl[0];
  if (best) return `${best.source ? `<a href="${esc(url(best.source))}" target="_blank" rel="noopener">${esc(best.name)}</a>` : esc(best.name)}${best.role === 'bd' ? ' <span class="chip sp-bd">BD</span>' : ''}<div class="muted">${esc(best.title || '')}${ppl.length > 1 ? ` · +${ppl.length - 1} more` : ''}</div>`;
  return p.official ? `${esc(p.official)}<div class="muted">${esc(p.officialTitle || '')}</div>` : '<span class="muted">Not listed</span>';
}
function stageOf(s) {
  if (s.due && s.due <= W().today()) return 'due';
  if (s.lastTouch) return 'working';
  return 'new';
}
function filtered() {
  const { S } = W(); const q = F.q.trim().toLowerCase();
  return (S.scored || []).filter(s => {
    const p = s.p;
    if (F.type && p.type !== F.type) return false;
    if ((p.sites || 1) < F.sites) return false;
    if (F.dm && !p.official) return false;
    if (F.stage === 'lf' ? !lfOf(p) : F.stage === 'res' ? !p.research : F.stage !== 'all' && stageOf(s) !== F.stage) return false;
    if (q && !`${p.name} ${p.city} ${p.st} ${p.official || ''}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.priority - a.priority || b.potential - a.potential);
}

X.prospects = () => {
  const { S, esc, fmt } = W(), app = document.getElementById('app');
  if (!sales()) { app.innerHTML = `<div class="card"><h2>Prospects</h2><p class="muted">Prospects live in the Wellby sales workspace. Staff can open it from <a href="#settings">Settings → Workspaces</a>.</p></div>`; return; }
  const m = S.market.sales || { states: [], total: 0 };
  const types = Object.entries(S.market.counts || {}).sort((a, b) => b[1] - a[1]);
  const list = filtered(), shown = list.slice(0, F.n);
  const stages = { all: 'All', res: 'Researched', new: 'Not contacted', working: 'In progress', due: 'Follow-up due', lf: 'In Lightfield' };
  app.innerHTML = `
  <div class="head"><div><span class="eyebrow">Wellby sales</span><h1>Prospects</h1>
    <div class="muted">${fmt(S.market.providers.length)} agencies loaded · ${esc(m.states.length ? m.states.join(', ') : `top ranked of ${fmt(m.total)} nationwide`)} · <a href="#" id="spStates">${m.states.length ? 'Change states' : 'Load every agency in chosen states'}</a></div></div>
    <div class="row"><button class="btn sm" id="spLfTop" title="Copies each account and its listed official">Copy top 25 to Lightfield</button></div></div>
  <div class="card sp-tools">
    <input id="spQ" type="search" placeholder="Search agency, city, state or person" value="${esc(F.q)}">
    <select id="spType"><option value="">All types</option>${types.map(([t, n]) => `<option value="${esc(t)}" ${F.type === t ? 'selected' : ''}>${esc(t)} (${fmt(n)})</option>`).join('')}</select>
    <select id="spSites"><option value="1">Any size</option><option value="2" ${F.sites === 2 ? 'selected' : ''}>2+ sites (Team)</option><option value="6" ${F.sites === 6 ? 'selected' : ''}>6+ sites (Enterprise)</option></select>
    <label class="small"><input type="checkbox" id="spDm" ${F.dm ? 'checked' : ''}> Named decision maker</label>
    <div class="seg" id="spStage">${Object.entries(stages).map(([k, l]) => `<button class="${F.stage === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
  </div>
  <div class="card sp-list">
    <div class="muted small" style="margin-bottom:8px">${fmt(list.length)} match · fit weighs agency type, number of sites, size and whether a decision maker is listed (NPPES).${LF.loaded && !LF.configured ? ' · Lightfield sync is off until an API key is added.' : ''}</div>
    <table class="sp"><thead><tr><th>Fit</th><th>Agency</th><th>Type</th><th>Sites</th><th>Decision maker</th><th>Phone</th><th>Last touch</th><th></th></tr></thead>
    <tbody>${shown.map(s => { const p = s.p, lf = lfOf(p); return `<tr data-id="${esc(p.id)}">
      <td><b class="sp-fit">${s.potential}</b></td>
      <td><a href="#" data-open>${esc(p.name)}</a><div class="muted small">${esc([p.city, p.st].filter(Boolean).join(', '))}${p.research?.website ? ` · <a href="${esc(url(p.research.website))}" target="_blank" rel="noopener">site</a>` : ''}${p.research?.parent ? ` · part of ${esc(p.research.parent)}` : ''}</div></td>
      <td class="small">${esc(p.type)}</td>
      <td class="small">${p.sites || 1}<div class="muted">${tier(p.sites || 1)}</div></td>
      <td class="small">${personCell(p, esc)}</td>
      <td class="small">${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(phone(p.phone))}</a>` : ''}</td>
      <td class="small">${s.lastTouch ? esc(W().agoText(s.lastTouch)) : '<span class="muted">Never</span>'}${s.due ? `<div class="muted">Next ${esc(W().fmtShort ? W().fmtShort(s.due) : s.due)}</div>` : ''}</td>
      <td class="sp-act"><button class="btn sm" data-log>Log</button>${lf ? (lf.link ? `<a class="btn sm" href="${esc(lf.link)}" target="_blank" rel="noopener">Lightfield ↗</a>` : '<span class="small muted">In Lightfield</span>') : `<button class="btn sm" data-lf>+ Lightfield</button>`}</td></tr>`; }).join('')}</tbody></table>
    ${list.length > F.n ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="spMore">Show ${fmt(Math.min(100, list.length - F.n))} more</button></div>` : ''}
    ${!list.length ? '<p class="muted">No prospects match. Clear a filter or load more states.</p>' : ''}
  </div>`;
  const re = () => X.prospects();
  const q = app.querySelector('#spQ'); let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { F.q = q.value; F.n = 100; re(); app.querySelector('#spQ')?.focus(); const e = app.querySelector('#spQ'); if (e) e.selectionStart = e.selectionEnd = e.value.length; }, 250); };
  app.querySelector('#spType').onchange = e => { F.type = e.target.value; F.n = 100; re(); };
  app.querySelector('#spSites').onchange = e => { F.sites = +e.target.value; F.n = 100; re(); };
  app.querySelector('#spDm').onchange = e => { F.dm = e.target.checked; F.n = 100; re(); };
  app.querySelectorAll('#spStage [data-st]').forEach(b => b.onclick = () => { F.stage = b.dataset.st; F.n = 100; re(); });
  app.querySelector('#spMore')?.addEventListener('click', () => { F.n += 100; re(); });
  app.querySelector('#spStates').onclick = e => { e.preventDefault(); pickStates(); };
  app.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('[data-open]').onclick = e => { e.preventDefault(); W().openSource(id); };
    tr.querySelector('[data-log]').onclick = () => X.openLog ? X.openLog({ sourceId: id }) : W().openSource(id);
    tr.querySelector('[data-lf]')?.addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'Copying…';
      try { await lfPush([W().S.scoredById.get(id)]); W().toast('Copied to Lightfield'); re(); } catch (x) { W().toast(x.message); e.target.disabled = false; e.target.textContent = '+ Lightfield'; }
    });
  });
  app.querySelector('#spLfTop').onclick = async e => {
    const top = list.filter(s => !lfOf(s.p)).slice(0, 25); if (!top.length) return W().toast('Everything shown is already in Lightfield');
    e.target.disabled = true; e.target.textContent = 'Copying…';
    try { const n = await lfPush(top); W().toast(`Copied ${n} prospects to Lightfield`); re(); } catch (x) { W().toast(x.message); e.target.disabled = false; e.target.textContent = 'Copy top 25 to Lightfield'; }
  };
  X.subnav?.('prospects');
  if (!LF.loaded) lfStatus().then(() => { if (W().S.view === 'prospects') re(); });
};

function pickStates() {
  const { S, esc, fmt, post, toast } = W();
  const cur = new Set(S.settings.sales?.states || []), counts = S.market.sales?.stateCounts || {};
  const dlg = document.createElement('div'); dlg.className = 'sp-dlg'; dlg.id = 'spDlg';
  dlg.innerHTML = `<div class="card"><h2>Which states?</h2><p class="muted small">Pick none for the top-ranked agencies nationwide. Each state loads every agency in it (larger states take a few seconds).</p>
    <div class="sp-grid">${STATES.filter(s => counts[s]).map(s => `<label><input type="checkbox" value="${s}" ${cur.has(s) ? 'checked' : ''}> ${s} <span class="muted">${fmt(counts[s].n)}</span></label>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-x>Cancel</button><button class="btn" data-none>Top nationwide</button><button class="btn primary" data-ok>Load</button></div></div>`;
  document.body.appendChild(dlg);
  const save = async states => { try { await post('saveSettings', { settings: { sales: { states } } }); location.hash = '#prospects'; location.reload(); } catch (e) { toast(e.message); } };
  dlg.querySelector('[data-x]').onclick = () => dlg.remove();
  dlg.onclick = e => { if (e.target === dlg) dlg.remove(); };
  dlg.querySelector('[data-none]').onclick = () => save([]);
  dlg.querySelector('[data-ok]').onclick = () => save([...dlg.querySelectorAll('input:checked')].map(i => i.value));
}

// Plan tab: Prospects replaces Territory; Referrals and Results hide (prospects don't send referrals); Partners reads Accounts.
function shapeNav() {
  if (!sales() || document.body.classList.contains('sales')) return;
  document.body.classList.add('sales');
  const g = X.navGroups; if (g?.plan) g.plan.subs = [['prospects', 'Prospects', '#prospects'], ...g.plan.subs.filter(x => x[0] !== 'territory')];
  if (g?.partners) g.partners.label = 'Accounts';
  if (g?.partners) g.partners.subs = g.partners.subs.filter(x => x[0] !== 'scorecard'); // the partner scorecard is about referrals
  const pa = document.querySelector('#nav a[data-view="partners"]');
  if (pa) { const tn = [...pa.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (tn) tn.textContent = 'Accounts'; pa.title = 'Accounts: prospects you are working, contacts'; }
  const plan = document.querySelector('#nav a[data-view="plan"]'); if (plan) plan.setAttribute('href', '#prospects');
}
// Drawer: Lightfield link or copy, and a trial invite to the decision maker.
const prevDrawer = X._drawer;
X._drawer = (id, d) => {
  if (prevDrawer) prevDrawer(id, d);
  if (!sales() || d.querySelector('.dSales')) return;
  const s = W().S.scoredById?.get(id); if (!s) return;
  const row = d.querySelector('.dBd') || d.querySelector('h1'); if (!row) return;
  const lf = lfOf(s.p);
  const first = (s.p.official || '').split(' ')[0];
  const subj = encodeURIComponent(`${s.p.name} + Wellby`);
  const body = encodeURIComponent(`Hi${first ? ' ' + first : ''},\n\nWellby helps post-acute teams see which hospitals, physicians and facilities are sending referrals, which are slipping, and who to visit next. Your liaisons get a daily plan and you get the results.\n\nYou can try it free for 14 days: https://app.wellbyinroads.com/signup\n\nHappy to walk you through it for 20 minutes.\n`);
  row.insertAdjacentHTML('afterend', `<div class="row dSales" style="margin:0 0 10px"><span class="small muted">Wellby fit ${s.potential} · ${tier(s.p.sites || 1)} prospect</span>
    ${lf?.link ? `<a class="btn sm" href="${W().esc(lf.link)}" target="_blank" rel="noopener">Open in Lightfield ↗</a>` : `<button class="btn sm" data-dlf>Copy to Lightfield</button>`}
    <a class="btn sm" href="mailto:?subject=${subj}&body=${body}">Trial invite</a></div>`);
  const r = s.p.research;
  if (r) {
    const esc = W().esc;
    const ppl = (r.people || []).map(x => `<li><b>${esc(x.name)}</b>${x.role === 'bd' ? ' <span class="chip sp-bd">BD</span>' : ''}<div class="muted small">${esc(x.title || '')}${x.email ? ` · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}${x.source ? ` · <a href="${esc(url(x.source))}" target="_blank" rel="noopener">${/linkedin\.com/i.test(x.source) ? 'LinkedIn' : 'source'}</a>` : ''}${x.confidence === 'low' ? ' · may have moved on' : ''}</div></li>`).join('');
    d.querySelector('.dSales').insertAdjacentHTML('afterend', `<div class="sp-res"><div class="eyebrow">Researched contacts</div>
      <div class="small">${[r.website ? `<a href="${esc(url(r.website))}" target="_blank" rel="noopener">${esc(r.website.replace(/^https?:\/\//, ''))}</a>` : '', r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '', r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '', r.linkedin_company ? `<a href="${esc(url(r.linkedin_company))}" target="_blank" rel="noopener">LinkedIn</a>` : ''].filter(Boolean).join(' · ')}</div>
      ${r.parent || r.locations ? `<div class="small muted">${[r.parent ? `Part of ${esc(r.parent)}` : '', r.locations ? `${esc(String(r.locations))} locations` : '', r.status && r.status !== 'operating' ? esc(r.status) : ''].filter(Boolean).join(' · ')}</div>` : ''}
      ${ppl ? `<ul>${ppl}</ul>` : ''}${r.notes ? `<div class="small">${esc(r.notes)}</div>` : ''}
      <div class="small muted">From public sources (company sites, news, search results), ${esc(r.at || 'Nov 2026')}. Check before reaching out.</div></div>`);
  }
  d.querySelector('[data-dlf]')?.addEventListener('click', async e => {
    e.target.disabled = true;
    try { await lfPush([s]); W().toast('Copied to Lightfield'); d.querySelector('.dSales')?.remove(); X._drawer(id, d); } catch (x) { W().toast(x.message); e.target.disabled = false; }
  });
};
const prevAfter = X._after;
X._after = (view, sub) => {
  shapeNav();
  if (prevAfter) prevAfter(view, sub);
  if (view === 'settings' && W().S.me.super) staffButton();
};
// Staff: create or open the Wellby sales workspace.
function staffButton() {
  const card = document.getElementById('workspaces'); if (!card || card.querySelector('[data-salesws]')) return;
  const h = card.querySelector('h2'); if (!h) return;
  h.insertAdjacentHTML('afterend', `<p class="small muted" style="margin:4px 0 8px">Selling Wellby? The sales workspace lists agencies nationwide as prospects. <button class="btn sm primary" data-salesws>${W().S.me.orgSales ? 'You are in Wellby sales' : 'Open Wellby sales'}</button></p>`);
  card.querySelector('[data-salesws]').onclick = async e => {
    if (W().S.me.orgSales) { location.hash = '#prospects'; return; }
    e.target.disabled = true;
    try { await W().api('/api/workspaces', { action: 'sales' }); location.hash = '#prospects'; location.reload(); } catch (x) { W().toast(x.message); e.target.disabled = false; }
  };
}
