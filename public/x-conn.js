// Connections: mail + calendar, CRMs, EMR imports, and the Wellby MCP server for AI assistants.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const K = { data: null, crm: null, newKey: null };
const DESC = {
  google: 'Gmail and Google Calendar. Wellby reads who you emailed and when, and your calendar events. It never reads message content. Emails and meetings with your saved contacts are logged as touches automatically.',
  microsoft: 'Outlook mail and calendar through Microsoft 365. Wellby reads who you emailed and when, and your calendar events, never message content. Touches with your saved contacts are logged automatically.',
  hubspot: 'Bring HubSpot contacts into Wellby and match them to referral sources, or send the contacts you add in Wellby back to HubSpot.',
  salesforce: 'Bring Salesforce contacts into Wellby and match them to referral sources, or send the contacts you add in Wellby back to Salesforce.',
};
const EMRS = [
  { id: 'wellsky', name: 'WellSky', note: 'Home health, hospice and personal care (including ClearCare).' },
  { id: 'hchb', name: 'Homecare Homebase (HCHB)', note: 'Home health and hospice.' },
  { id: 'axxess', name: 'Axxess', note: 'Home health, hospice and home care.' },
  { id: 'matrixcare', name: 'MatrixCare', note: 'Home health, hospice, skilled nursing and senior living.' },
  { id: 'kantime', name: 'KanTime', note: 'Home health, hospice and private duty.' },
  { id: 'pcc', name: 'PointClickCare', note: 'Skilled nursing and senior living.' },
  { id: 'fhir', name: 'Other EMR (FHIR or CSV)', note: 'Any system that exports a CSV, or FHIR R4 referral data (ServiceRequest bundles or NDJSON).' },
];
const HUB = {
  'connected-google': 'Google is connected. Your recent email and calendar are syncing.', 'connected-microsoft': 'Microsoft 365 is connected. Your recent email and calendar are syncing.',
  'connected-hubspot': 'HubSpot is connected.', 'connected-salesforce': 'Salesforce is connected.',
  declined: 'Connection canceled.', error: "That connection didn't go through. Please try again.", 'admin-only': 'Only workspace admins can connect a CRM.',
};

async function load() { K.data = await W().api('/api/connect'); }
X.connections = async function viewConnections(sub) {
  const { $, esc, toast } = W();
  if (sub && HUB[sub]) { toast(HUB[sub]); history.replaceState(null, '', '#connections'); }
  if (sub && sub.endsWith('-setup')) { toast(`${sub.replace('-setup', '')} needs to be set up first. See the steps below.`); history.replaceState(null, '', '#connections'); }
  $('#app').innerHTML = '<div class="loading">Loading connections…</div>';
  try { await load(); } catch (e) { $('#app').innerHTML = `<div class="card empty">Couldn't load connections: ${esc(e.message)}</div>`; return; }
  if (W().S.view !== 'connections') return;
  render();
  if (sub && sub.startsWith('connected-')) setTimeout(() => { if (W().S.view === 'connections') { load().then(render); X.calendarReload?.().catch(() => {}); } }, 1500);
};

function render() {
  const { $, esc, S, agoText } = W(), d = K.data, admin = S.me.role === 'admin', sup = S.me.super;
  const P = Object.fromEntries(d.providers.map(p => [p.id, p]));
  const card = p => {
    const accts = p.accounts.map(a => `<div class="acct"><div><b>${esc(a.account || p.name)}</b><div class="muted small">Connected by ${esc(a.by.split('@')[0])}${a.lastSync ? ` · synced ${agoText(a.lastSync).toLowerCase()}` : ''}</div>${a.lastError ? `<div class="small down">${esc(a.lastError)}</div>` : ''}</div><div class="row"><button class="btn sm" data-sync="${esc(a.id)}">Sync now</button>${a.by === S.me.email || admin ? `<button class="btn sm ghost" data-disc="${esc(a.id)}">Disconnect</button>` : ''}</div></div>`).join('');
    const canConnect = p.kind === 'mail' || admin;
    const action = !p.configured ? `<span class="chip">Not set up yet</span>` : canConnect ? `<a class="btn sm ${p.accounts.length ? '' : 'primary'}" href="/api/connect?action=start&provider=${p.id}">${p.accounts.length ? (p.kind === 'mail' ? 'Connect another account' : 'Reconnect') : 'Connect'}</a>` : '<span class="muted small">Ask an admin to connect</span>';
    const setup = !p.configured ? (sup ? `<details class="setup"><summary>Set up ${esc(p.name)} (Wellby staff)</summary><ol class="small">${setupSteps(p.id, d.redirectUri)}</ol></details>` : '<p class="muted small" style="margin:8px 0 0">Your Wellby team is switching this on.</p>') : '';
    return `<div class="ccard"><div class="chead"><span class="clogo l-${p.id}" aria-hidden="true"></span><div style="flex:1"><h3>${esc(p.name)}</h3><p class="muted small">${DESC[p.id]}</p></div><div>${action}</div></div>${accts}${setup}</div>`;
  };
  const crmConnected = ['hubspot', 'salesforce'].some(k => P[k].accounts.length);
  $('#app').innerHTML = `<div class="head"><div><span class="eyebrow">Connections</span><h1>Connections</h1><div class="muted">Bring in your email, calendar, CRM and EMR data, and let AI assistants work with Wellby.</div></div></div>
    <section class="csec"><h2>Email and calendar</h2><p class="muted small">Each person connects their own account. Wellby checks for new email and meetings when you open the calendar, or when you press Sync now.</p>${card(P.google)}${card(P.microsoft)}</section>
    <section class="csec"><h2>CRM</h2><p class="muted small">One connection for the whole workspace. Admins only.</p>${card(P.hubspot)}${card(P.salesforce)}${crmConnected ? `<div class="ccard" id="crmBox"><div class="chead"><div style="flex:1"><h3>CRM contacts</h3><p class="muted small">${d.crmCount} contacts pulled from your CRM. Match them to referral sources to add them to Wellby.</p></div><div class="row"><button class="btn sm" id="crmReview">Review and match</button>${admin ? '<button class="btn sm ghost" id="crmPush">Send Wellby contacts to CRM</button>' : ''}</div></div><div id="crmList"></div></div>` : ''}</section>
    <section class="csec"><h2>EMR</h2><p class="muted small">Referral and admission counts from your EMR show which sources really send you patients. Export a referral report from your EMR and drop it on a card below. Only the source, NPI, date, admit and payer columns are kept; patient details are dropped in your browser before anything is uploaded. Direct, automatic EMR sync needs a partner agreement with each vendor and isn't available yet.</p>
      <div class="emrgrid">${EMRS.map(e => `<div class="ccard emr" data-emr="${e.id}"><h3>${esc(e.name)}</h3><p class="muted small">${esc(e.note)}</p><label class="btn sm">Import referral report<input type="file" accept=".csv,.tsv,.txt,.json,.ndjson" hidden data-emrfile="${e.id}"></label></div>`).join('')}</div>
      ${(d.emr || []).length ? `<div class="small muted" style="margin-top:10px">Recent imports: ${d.emr.slice(-5).reverse().map(x => `${esc(EMRS.find(e => e.id === x.vendor)?.name || x.vendor)} · ${esc(x.file)} · ${W().fmtShort(x.at.slice(0, 10))}`).join(' &nbsp;·&nbsp; ')}</div>` : ''}</section>
    <section class="csec"><h2>AI assistants (MCP)</h2><p class="muted small">Wellby runs an MCP server, so assistants like Claude can look up your sources, contacts, calendar and results, log touches, schedule meetings and draft emails. Drafts never send on their own: they wait in Today for a person to approve. Use it next to the assistant's own Gmail, Outlook or CRM connectors.</p>
      <div class="ccard"><div class="chead"><span class="clogo l-mcp" aria-hidden="true"></span><div style="flex:1"><h3>Wellby MCP server</h3><p class="small"><code>${esc(d.mcpUrl)}</code> <button class="btn sm ghost" data-copy="${esc(d.mcpUrl)}">Copy</button></p></div>${admin ? '<button class="btn sm primary" id="newKey">Create a key</button>' : ''}</div>
        <div id="keyOut"></div>
        ${d.keys.length ? `<table class="keys"><tr><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>${d.keys.map(k => `<tr><td><b>${esc(k.name)}</b><div class="muted small">wk_…${esc(k.prefix)}…</div></td><td class="small">${W().fmtShort(k.created.slice(0, 10))} by ${esc(k.by.split('@')[0])}</td><td class="small">${k.lastUsed ? agoText(k.lastUsed) : 'Never'}</td><td class="num">${admin ? `<button class="btn sm ghost" data-revoke="${esc(k.id)}">Revoke</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted small">No keys yet. A key gives an assistant access to this workspace only. Revoke it at any time.</p>'}
        <details class="setup"><summary>What assistants can do</summary><ul class="small"><li><b>Read:</b> today's queue, search sources, source detail, contacts, calendar, referral results.</li><li><b>Write:</b> log a touch, schedule or complete a meeting, add a contact, draft an email for approval.</li></ul></details></div></section>`;
  bind();
}
function setupSteps(id, redirect) {
  const env = { google: 'GOOGLE', microsoft: 'MICROSOFT', hubspot: 'HUBSPOT', salesforce: 'SALESFORCE' }[id];
  const where = {
    google: 'In Google Cloud Console, create an OAuth client (type: Web application). Enable the Gmail API and Google Calendar API. Gmail metadata is a restricted scope, so a public launch needs Google\'s verification and security assessment; until then add pilot users as test users.',
    microsoft: 'In Microsoft Entra admin center, register an app (accounts in any organizational directory and personal accounts). Add delegated Graph permissions: User.Read, Calendars.Read, Mail.ReadBasic, offline_access. Create a client secret.',
    hubspot: 'In a HubSpot developer account, create a public app with scopes crm.objects.contacts.read and crm.objects.contacts.write.',
    salesforce: 'In Salesforce Setup, create a Connected App (or External Client App) with OAuth scopes "api" and "refresh_token".',
  }[id];
  return `<li>${where}</li><li>Set the redirect URI to <code>${W().esc(redirect)}</code></li><li>In Vercel (project inroad-app), add <code>${env}_CLIENT_ID</code> and <code>${env}_CLIENT_SECRET</code>, then redeploy.</li>`;
}
function bind() {
  const { $, toast, api } = W(), app = $('#app');
  app.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = 'Syncing…';
    try { const r = await api('/api/connect', { action: 'sync' }); W().S.activity = r.activity; const n = r.results.reduce((s, x) => s + x.touches, 0), bad = r.results.filter(x => x.error); toast(bad.length ? `Sync problem: ${bad[0].error}` : n ? `${n} new touch${n === 1 ? '' : 'es'} logged from email and calendar` : 'Up to date'); X.calendarReload?.().catch(() => {}); await load(); render(); W().navBadges(); }
    catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Sync now'; }
  });
  app.querySelectorAll('[data-disc]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api('/api/connect', { action: 'disconnect', id: b.dataset.disc }); toast('Disconnected. Touches already logged stay in Wellby.'); X.calendarReload?.().catch(() => {}); await load(); render(); } catch (e) { toast(e.message); b.disabled = false; } });
  app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Copied'), () => toast('Copy failed')); });
  app.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('Revoke this key? Assistants using it will lose access right away.')) return; await api('/api/connect', { action: 'revokeKey', id: b.dataset.revoke }); toast('Key revoked'); await load(); render(); });
  if ($('#newKey')) $('#newKey').onclick = async () => {
    const name = prompt('Name this key (for example "Claude, Maria")', 'Claude'); if (name == null) return;
    const r = await api('/api/connect', { action: 'createKey', name });
    await load(); render(); showKey(r.key);
  };
  app.querySelectorAll('[data-emrfile]').forEach(inp => inp.onchange = () => inp.files[0] && importEmr(inp.dataset.emrfile, inp.files[0]));
  app.querySelectorAll('.emr').forEach(el => { el.ondragover = e => { e.preventDefault(); el.classList.add('over'); }; el.ondragleave = () => el.classList.remove('over'); el.ondrop = e => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer.files[0]) importEmr(el.dataset.emr, e.dataTransfer.files[0]); }; });
  if ($('#crmReview')) $('#crmReview').onclick = reviewCrm;
  if ($('#crmPush')) $('#crmPush').onclick = pushCrm;
}
function showKey(key) {
  const { $, esc } = W(), url = K.data.mcpUrl;
  $('#keyOut').innerHTML = `<div class="notice info keybox"><b>Copy this key now. It won't be shown again.</b><div class="keyline"><code>${esc(key)}</code><button class="btn sm" data-copy="${esc(key)}">Copy key</button></div>
    <div class="small"><b>Claude (claude.ai or desktop):</b> Settings › Connectors › Add custom connector, then paste this URL:<div class="keyline"><code>${esc(url)}?key=${esc(key)}</code><button class="btn sm ghost" data-copy="${esc(url)}?key=${esc(key)}">Copy</button></div></div>
    <div class="small"><b>Claude Code:</b><div class="keyline"><code>claude mcp add --transport http wellby ${esc(url)} --header "Authorization: Bearer ${esc(key)}"</code><button class="btn sm ghost" data-copy='claude mcp add --transport http wellby ${esc(url)} --header "Authorization: Bearer ${esc(key)}"'>Copy</button></div></div>
    <div class="small muted">Other MCP clients: Streamable HTTP at the URL above, with the header <code>Authorization: Bearer &lt;key&gt;</code>.</div></div>`;
  document.querySelectorAll('#keyOut [data-copy]').forEach(b => b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => W().toast('Copied')));
}

// ---------- EMR import ----------
async function importEmr(vendor, file) {
  const { toast, api } = W();
  let f = file;
  try {
    const text = await file.text();
    if (/\.(json|ndjson)$/i.test(file.name) || /^\s*[{[]/.test(text)) {
      const csv = fhirToCsv(text);
      if (!csv) return toast("Couldn't find referrals in that file. Wellby reads FHIR ServiceRequest resources with a requester.");
      f = new File([csv], file.name.replace(/\.(n?json)$/i, '') + '-referrals.csv', { type: 'text/csv' });
    }
    api('/api/connect', { action: 'emrLog', vendor, file: file.name, rows: Math.max(0, text.split('\n').length - 1) }).catch(() => {});
    location.hash = '#referrals';
    setTimeout(() => { W().handleFile(f); setTimeout(() => document.querySelector('#mapping')?.scrollIntoView({ behavior: 'smooth' }), 120); }, 80);
    toast('Check the columns, then import');
  } catch (e) { toast(e.message); }
}
// FHIR R4: ServiceRequest (Bundle, single resource or NDJSON) -> CSV of referral source, NPI, date, admitted.
function fhirToCsv(text) {
  let res = [];
  try { const j = JSON.parse(text); res = j.resourceType === 'Bundle' ? (j.entry || []).map(e => e.resource).filter(Boolean) : [j]; }
  catch { res = text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  const byRef = new Map(); for (const r of res) if (r.id && r.resourceType) byRef.set(`${r.resourceType}/${r.id}`, r);
  const npiOf = r => (r?.identifier || []).find(i => /us-npi/i.test(i.system || ''))?.value || '';
  const nameOf = r => !r ? '' : r.resourceType === 'Practitioner' ? [r.name?.[0]?.prefix?.[0], ...(r.name?.[0]?.given || []), r.name?.[0]?.family].filter(Boolean).join(' ') || r.name?.[0]?.text || '' : r.name || '';
  const rows = [];
  for (const r of res) {
    if (r.resourceType !== 'ServiceRequest') continue;
    let req = r.requester || {}, target = byRef.get(req.reference) || r.contained?.find(c => '#' + c.id === req.reference);
    if (target?.resourceType === 'PractitionerRole') { const org = byRef.get(target.organization?.reference); const pr = byRef.get(target.practitioner?.reference); target = org || pr || target; }
    const name = nameOf(target) || req.display || ''; if (!name) continue;
    const npi = npiOf(target) || (req.identifier && /us-npi/i.test(req.identifier.system || '') ? req.identifier.value : '');
    const date = String(r.authoredOn || r.occurrenceDateTime || r.meta?.lastUpdated || '').slice(0, 10);
    const admitted = ['completed', 'active'].includes(r.status) ? 1 : 0;
    rows.push([name, npi, date, admitted]);
  }
  if (!rows.length) return '';
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  return ['Referral source,NPI,Referral date,Admits', ...rows.map(r => r.map(q).join(','))].join('\n');
}
X.fhirToCsv = fhirToCsv;

// ---------- CRM matching ----------
const STOP = new Set(['the', 'of', 'and', 'inc', 'llc', 'pc', 'pa', 'md', 'center', 'medical', 'health', 'healthcare', 'group', 'at', 'a']);
const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
function matcher() {
  const { S } = W(), idx = (S.scored || []).map(s => ({ s, t: new Set(norm(s.p.name)) })).filter(x => x.t.size);
  return company => {
    const t = new Set(norm(company)); if (!t.size) return null;
    let best = null, bs = 0;
    for (const x of idx) { let n = 0; for (const w of t) if (x.t.has(w)) n++; if (!n) continue; const sc = n / (t.size + x.t.size - n) + (x.s.priority || 0) / 1e4; if (sc > bs) { bs = sc; best = x.s; } }
    return bs >= 0.5 ? best : null;
  };
}
async function reviewCrm() {
  const { $, esc, api, toast, S, post } = W(), box = $('#crmList');
  box.innerHTML = '<p class="muted small">Loading…</p>';
  const { crm } = await api('/api/connect', { action: 'crm' });
  const known = new Set(); for (const list of Object.values(S.contacts)) for (const c of list || []) if (c.email) known.add(c.email.toLowerCase());
  const match = matcher(), todo = crm.filter(c => !(c.email && known.has(c.email))).map(c => ({ c, s: match(c.company) }));
  if (!todo.length) { box.innerHTML = '<p class="muted small">Every CRM contact is already in Wellby.</p>'; return; }
  const opts = W().S.scored.slice().sort((a, b) => b.priority - a.priority).slice(0, 400);
  box.innerHTML = `<datalist id="crmSrc">${opts.map(s => `<option value="${esc(s.p.name)}">`).join('')}</datalist><table class="crmt"><tr><th><input type="checkbox" id="crmAll"></th><th>Contact</th><th>Company in CRM</th><th>Referral source in Wellby</th></tr>${todo.slice(0, 300).map((x, i) => `<tr><td><input type="checkbox" data-ci="${i}" ${x.s ? 'checked' : ''}></td><td><b>${esc(x.c.name || x.c.email)}</b><div class="muted small">${esc([x.c.title, x.c.email].filter(Boolean).join(' · '))}</div></td><td class="small">${esc(x.c.company || '–')}<div class="muted small">${x.c.provider === 'hubspot' ? 'HubSpot' : 'Salesforce'}</div></td><td><input data-cs="${i}" list="crmSrc" value="${esc(x.s?.p.name || '')}" placeholder="Pick a source"></td></tr>`).join('')}</table><div class="row" style="margin-top:10px"><button class="btn primary sm" id="crmAdd">Add selected to Wellby</button><span class="muted small">${todo.length > 300 ? `Showing 300 of ${todo.length}.` : ''}</span></div>`;
  $('#crmAll').onchange = e => box.querySelectorAll('[data-ci]').forEach(c => c.checked = e.target.checked);
  $('#crmAdd').onclick = async e => {
    const byName = new Map(S.scored.map(s => [s.p.name.toLowerCase(), s.p.id])), picks = [...box.querySelectorAll('[data-ci]:checked')].map(c => +c.dataset.ci);
    const jobs = picks.map(i => ({ x: todo[i], sid: byName.get(box.querySelector(`[data-cs="${i}"]`).value.trim().toLowerCase()) })).filter(j => j.sid);
    if (!jobs.length) return toast('Pick a referral source for each contact you want to add');
    e.target.disabled = true; e.target.textContent = `Adding ${jobs.length}…`;
    for (const j of jobs) { const r = await post('saveContact', { sourceId: j.sid, contact: { name: j.x.c.name, role: j.x.c.title, email: j.x.c.email, phone: j.x.c.phone, notes: `From ${j.x.c.provider === 'hubspot' ? 'HubSpot' : 'Salesforce'}` } }); S.contacts = r.contacts; }
    toast(`${jobs.length} contact${jobs.length === 1 ? '' : 's'} added`); reviewCrm();
  };
}
async function pushCrm() {
  const { api, toast, S } = W(), acc = K.data.providers.filter(p => p.kind === 'crm').flatMap(p => p.accounts)[0];
  if (!acc) return;
  const { crm } = await api('/api/connect', { action: 'crm' }), inCrm = new Set(crm.map(c => c.email).filter(Boolean));
  const list = []; for (const [sid, cs] of Object.entries(S.contacts)) for (const c of cs || []) if (c.email && !inCrm.has(c.email.toLowerCase())) list.push({ ...c, org: S.scoredById.get(sid)?.p.name || '' });
  if (!list.length) return toast('Every Wellby contact with an email is already in your CRM');
  if (!confirm(`Create ${list.length} contact${list.length === 1 ? '' : 's'} in ${acc.provider === 'hubspot' ? 'HubSpot' : 'Salesforce'}?`)) return;
  const r = await api('/api/connect', { action: 'pushCrm', id: acc.id, contacts: list });
  toast(`${r.created} contact${r.created === 1 ? '' : 's'} created in your CRM`);
}
