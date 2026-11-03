// Connections to outside systems: mail + calendar (Google, Microsoft 365) and CRMs (HubSpot, Salesforce).
// OAuth tokens are encrypted at rest (AES-256-GCM, key derived from SESSION_SECRET).
// Mail is read as metadata only (who, when, subject): never message bodies.
import crypto from 'node:crypto';
import { readDoc, updateDoc } from './store.mjs';

export const docs = org => ({
  conn: `orgs/${org}/connections.json`,
  synced: `orgs/${org}/synced.json`,
  meetings: `orgs/${org}/meetings.json`,
  activity: `orgs/${org}/activity.json`,
  contacts: `orgs/${org}/contacts.json`,
  flows: `orgs/${org}/flows.json`,
  referrals: `orgs/${org}/referrals.json`,
  settings: `orgs/${org}/settings.json`,
});
export const rid = (n = 6) => crypto.randomBytes(n).toString('base64url');
export const clip = (s, n = 300) => String(s ?? '').slice(0, n);

export const PROVIDERS = {
  google: {
    name: 'Google (Gmail + Calendar)', kind: 'mail', env: 'GOOGLE',
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.metadata',
    extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
  microsoft: {
    name: 'Microsoft 365 (Outlook + Calendar)', kind: 'mail', env: 'MICROSOFT',
    auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'openid email offline_access User.Read Calendars.Read Mail.ReadBasic', extra: { prompt: 'select_account' },
  },
  hubspot: {
    name: 'HubSpot', kind: 'crm', env: 'HUBSPOT',
    auth: 'https://app.hubspot.com/oauth/authorize', token: 'https://api.hubapi.com/oauth/v1/token',
    scope: 'oauth crm.objects.contacts.read crm.objects.contacts.write', extra: {},
  },
  salesforce: {
    name: 'Salesforce', kind: 'crm', env: 'SALESFORCE',
    auth: 'https://login.salesforce.com/services/oauth2/authorize', token: 'https://login.salesforce.com/services/oauth2/token',
    scope: 'api refresh_token', extra: { prompt: 'login consent' },
  },
};
export const creds = p => ({ id: process.env[`${PROVIDERS[p].env}_CLIENT_ID`] || '', secret: process.env[`${PROVIDERS[p].env}_CLIENT_SECRET`] || '' });
export const configured = p => !!(creds(p).id && creds(p).secret);
export const redirectUri = host => `https://${host}/api/oauth/callback`;

// ---------- crypto ----------
const SECRET = () => process.env.SESSION_SECRET || 'dev-only-secret';
const KEY = () => crypto.createHash('sha256').update('wellby-connect:' + SECRET()).digest();
export function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
export function unseal(s) {
  const [iv, tag, data] = String(s).split('.').map(x => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY(), iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
}
export function signState(p) {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET()).update('state:' + body).digest('base64url')}`;
}
export function verifyState(t) {
  const [body, mac] = String(t || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET()).update('state:' + body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
export const hashKey = k => crypto.createHash('sha256').update('wellby-mcp:' + k).digest('hex');

// ---------- OAuth ----------
export function authUrl(p, host, state) {
  const c = creds(p), P = PROVIDERS[p];
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(host), response_type: 'code', scope: P.scope, state, ...P.extra });
  return `${P.auth}?${q}`;
}
async function tokenCall(p, params) {
  const c = creds(p);
  const r = await fetch(PROVIDERS[p].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`${PROVIDERS[p].name}: ${j.error_description || j.error || j.message || r.status}`);
  return j;
}
const toTok = (j, prev = {}) => ({ access: j.access_token, refresh: j.refresh_token || prev.refresh, exp: Date.now() + ((+j.expires_in || 3600) - 60) * 1000, instance: j.instance_url || prev.instance });
export async function exchange(p, code, host) {
  const j = await tokenCall(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(host) });
  const tok = toTok(j);
  let account = '';
  if (p === 'google' && j.id_token) { try { account = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64url').toString()).email || ''; } catch {} }
  if (p === 'microsoft') { const me = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { authorization: `Bearer ${tok.access}` } }).then(r => r.json()).catch(() => ({})); account = me.mail || me.userPrincipalName || ''; }
  if (p === 'hubspot') { const t = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${tok.access}`).then(r => r.json()).catch(() => ({})); account = t.hub_domain || (t.hub_id ? `Portal ${t.hub_id}` : ''); }
  if (p === 'salesforce') account = (tok.instance || '').replace(/^https:\/\//, '');
  return { tok, account: clip(account, 160) };
}
// Returns a fresh access token for a stored account, refreshing (and re-saving) when needed.
export async function accessFor(org, acc) {
  let tok = unseal(acc.enc);
  if (tok.exp > Date.now() + 30000) return tok;
  if (!tok.refresh) throw new Error('Connection expired. Reconnect it.');
  const j = await tokenCall(acc.provider, { grant_type: 'refresh_token', refresh_token: tok.refresh });
  tok = toTok(j, tok);
  await updateDoc(docs(org).conn, {}, cur => { const a = (cur.accounts || []).find(x => x.id === acc.id); if (a) a.enc = seal(tok); return cur; });
  return tok;
}
async function getJSON(url, tok, headers = {}) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${tok.access}`, accept: 'application/json', ...headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || j.message || `HTTP ${r.status}`);
  return j;
}
async function pool(items, n, fn) { const out = []; for (let i = 0; i < items.length; i += n) out.push(...await Promise.all(items.slice(i, i + n).map(fn))); return out; }
const emailsIn = s => (String(s || '').match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g) || []).map(e => e.toLowerCase());

// ---------- per-provider readers ----------
async function readGoogle(tok, since, from, to) {
  const list = await getJSON('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100', tok);
  const msgs = await pool((list.messages || []).slice(0, 100), 10, m => getJSON(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`, tok).catch(() => null));
  const mail = msgs.filter(Boolean).filter(m => +m.internalDate >= since).map(m => {
    const h = Object.fromEntries((m.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
    return { id: m.id, at: new Date(+m.internalDate).toISOString(), from: emailsIn(h.from)[0] || '', to: [...emailsIn(h.to), ...emailsIn(h.cc)], subject: clip(h.subject, 200), sent: (m.labelIds || []).includes('SENT') };
  });
  const ev = await getJSON(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}`, tok);
  const events = (ev.items || []).filter(e => e.status !== 'cancelled').map(e => ({ id: e.id, title: clip(e.summary || '(no title)', 200), start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, allDay: !e.start?.dateTime, location: clip(e.location, 200), attendees: (e.attendees || []).map(a => String(a.email || '').toLowerCase()).filter(Boolean).slice(0, 30), link: e.htmlLink || '' }));
  return { mail, events };
}
async function readMicrosoft(tok, since, from, to) {
  const sel = '$select=subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime&$top=100';
  const sinceIso = new Date(since).toISOString();
  const [inbox, sent] = await Promise.all([
    getJSON(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${sel}&$filter=receivedDateTime ge ${sinceIso}`, tok).catch(() => ({ value: [] })),
    getJSON(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?${sel}&$filter=sentDateTime ge ${sinceIso}`, tok).catch(() => ({ value: [] })),
  ]);
  const addr = l => (l || []).map(x => String(x.emailAddress?.address || '').toLowerCase()).filter(Boolean);
  const mail = [...(inbox.value || []).map(m => ({ m, sent: false })), ...(sent.value || []).map(m => ({ m, sent: true }))].map(({ m, sent }) => ({ id: m.id, at: m.sentDateTime || m.receivedDateTime, from: String(m.from?.emailAddress?.address || '').toLowerCase(), to: [...addr(m.toRecipients), ...addr(m.ccRecipients)], subject: clip(m.subject, 200), sent }));
  const ev = await getJSON(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}&$top=250&$select=id,subject,start,end,location,attendees,webLink,isAllDay,isCancelled`, tok, { Prefer: 'outlook.timezone="UTC"' });
  const z = s => s && !/Z|[+-]\d\d:\d\d$/.test(s) ? s.replace(/\.\d+$/, '') + 'Z' : s;
  const events = (ev.value || []).filter(e => !e.isCancelled).map(e => ({ id: e.id, title: clip(e.subject || '(no title)', 200), start: z(e.start?.dateTime), end: z(e.end?.dateTime), allDay: !!e.isAllDay, location: clip(e.location?.displayName, 200), attendees: (e.attendees || []).map(a => String(a.emailAddress?.address || '').toLowerCase()).filter(Boolean).slice(0, 30), link: e.webLink || '' }));
  return { mail, events };
}
async function readHubspot(tok) {
  const j = await getJSON('https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,jobtitle,company', tok);
  return (j.results || []).map(c => ({ id: c.id, name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' '), email: String(c.properties.email || '').toLowerCase(), phone: c.properties.phone || '', title: c.properties.jobtitle || '', company: c.properties.company || '' }));
}
async function readSalesforce(tok) {
  const q = encodeURIComponent('SELECT Id, Name, Email, Phone, Title, Account.Name FROM Contact ORDER BY LastModifiedDate DESC LIMIT 200');
  const j = await getJSON(`${tok.instance}/services/data/v60.0/query?q=${q}`, tok);
  return (j.records || []).map(c => ({ id: c.Id, name: c.Name || '', email: String(c.Email || '').toLowerCase(), phone: c.Phone || '', title: c.Title || '', company: c.Account?.Name || '' }));
}
export async function pushCrm(org, acc, list) {
  const tok = await accessFor(org, acc); let n = 0;
  for (const c of list.slice(0, 100)) {
    const [first, ...rest] = String(c.name || '').trim().split(/\s+/);
    const r = acc.provider === 'hubspot'
      ? await fetch('https://api.hubapi.com/crm/v3/objects/contacts', { method: 'POST', headers: { authorization: `Bearer ${tok.access}`, 'content-type': 'application/json' }, body: JSON.stringify({ properties: { firstname: first || '', lastname: rest.join(' '), email: c.email || '', phone: c.phone || '', jobtitle: c.role || '', company: c.org || '' } }) })
      : await fetch(`${tok.instance}/services/data/v60.0/sobjects/Contact`, { method: 'POST', headers: { authorization: `Bearer ${tok.access}`, 'content-type': 'application/json' }, body: JSON.stringify({ FirstName: rest.length ? first : '', LastName: rest.join(' ') || first || 'Unknown', Email: c.email || null, Phone: c.phone || null, Title: c.role || null, Description: c.org ? `Referral source: ${c.org} (from Wellby)` : null }) });
    if (r.ok) n++;
  }
  return n;
}

// ---------- sync ----------
// Pulls mail metadata and calendar events from every connected account, logs touches with known contacts
// as Wellby activity, and caches calendar events and CRM contacts for the app.
export async function syncOrg(org, only) {
  const D = docs(org);
  const conn = await readDoc(D.conn, {});
  const accounts = (conn.accounts || []).filter(a => !only || a.id === only);
  const [contacts, flows, activity] = await Promise.all([readDoc(D.contacts, {}), readDoc(D.flows, {}), readDoc(D.activity, [])]);
  const byEmail = new Map();
  for (const [sid, list] of Object.entries(contacts)) for (const c of list || []) if (c.email) byEmail.set(c.email.toLowerCase(), { sid, c });
  const nameOf = sid => flows[sid]?.p?.name || activity.findLast?.(a => a.sourceId === sid && a.sourceName)?.sourceName || '';
  const synced = await readDoc(D.synced, { events: [], crm: [] });
  const from = new Date(Date.now() - 60 * 864e5).toISOString(), to = new Date(Date.now() + 90 * 864e5).toISOString();
  const results = [], newActs = [], seen = new Set(activity.filter(a => a.extId).map(a => a.extId));
  let events = (synced.events || []).filter(e => !accounts.some(a => a.id === e.acc)), crm = (synced.crm || []).filter(e => !accounts.some(a => a.id === e.acc));
  for (const acc of accounts) {
    const res = { id: acc.id, provider: acc.provider, mail: 0, events: 0, crm: 0, touches: 0, error: '' };
    try {
      const tok = await accessFor(org, acc);
      if (PROVIDERS[acc.provider].kind === 'mail') {
        const since = acc.lastSync ? Date.parse(acc.lastSync) - 3600e3 : Date.now() - 30 * 864e5;
        const r = acc.provider === 'google' ? await readGoogle(tok, since, from, to) : await readMicrosoft(tok, since, from, to);
        res.mail = r.mail.length; res.events = r.events.length;
        const me = acc.account.toLowerCase();
        for (const m of r.mail) {
          const ext = `${acc.provider}:mail:${m.id}`; if (seen.has(ext)) continue;
          const others = (m.sent ? m.to : [m.from]).filter(e => e && e !== me);
          const hit = others.map(e => byEmail.get(e)).find(Boolean); if (!hit) continue;
          seen.add(ext); res.touches++;
          newActs.push({ id: rid(), extId: ext, origin: acc.provider, sourceId: hit.sid, sourceName: nameOf(hit.sid), kind: 'email', status: 'done', subject: m.subject, body: '', to: m.sent ? hit.c.email : me, reason: m.sent ? 'Sent from your mailbox' : `Reply from ${hit.c.name || hit.c.email}`, followUp: '', by: acc.by, at: m.at, doneAt: m.at, direction: m.sent ? 'out' : 'in' });
        }
        for (const e of r.events) {
          const hit = e.attendees.map(x => byEmail.get(x)).find(Boolean);
          events.push({ ...e, acc: acc.id, provider: acc.provider, account: acc.account, sourceId: hit?.sid || '', contact: hit ? (hit.c.name || hit.c.email) : '' });
          const ext = `${acc.provider}:event:${e.id}`;
          if (hit && e.end && Date.parse(e.end) < Date.now() && !seen.has(ext)) {
            seen.add(ext); res.touches++;
            newActs.push({ id: rid(), extId: ext, origin: acc.provider, sourceId: hit.sid, sourceName: nameOf(hit.sid), kind: 'meeting', status: 'done', subject: e.title, body: '', to: hit.c.email, reason: `Meeting with ${hit.c.name || hit.c.email}`, followUp: '', by: acc.by, at: e.start, doneAt: e.end });
          }
        }
      } else {
        const list = acc.provider === 'hubspot' ? await readHubspot(tok) : await readSalesforce(tok);
        res.crm = list.length;
        crm.push(...list.map(c => ({ ...c, acc: acc.id, provider: acc.provider, known: !!(c.email && byEmail.has(c.email)) })));
      }
    } catch (e) { res.error = clip(e.message, 200); }
    results.push(res);
  }
  if (newActs.length) await updateDoc(D.activity, [], cur => { const have = new Set(cur.filter(a => a.extId).map(a => a.extId)); return [...cur, ...newActs.filter(a => !have.has(a.extId))].slice(-5000); });
  events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  await updateDoc(D.synced, {}, () => ({ events: events.slice(-800), crm: crm.slice(0, 1000), at: new Date().toISOString() }));
  const now = new Date().toISOString();
  await updateDoc(D.conn, {}, cur => { for (const r of results) { const a = (cur.accounts || []).find(x => x.id === r.id); if (a) { a.lastSync = r.error ? a.lastSync : now; a.lastError = r.error; } } return cur; });
  return results;
}

// ---------- meetings ----------
const KINDS = ['meeting', 'visit', 'lunch', 'call', 'inservice'];
const STATUSES = ['scheduled', 'done', 'canceled', 'no_show'];
const iso = s => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
// Creates or updates a meeting. Completing one logs it as a touch and checks off the source's next visit step.
export async function saveMeeting(org, m, by) {
  const D = docs(org), now = new Date().toISOString();
  const start = iso(m.start); if (!start) throw new Error('Pick a date and time');
  const end = iso(m.end) || new Date(Date.parse(start) + (Math.max(5, Math.min(600, +m.minutes || 30))) * 60000).toISOString();
  let saved, logAct = null;
  await updateDoc(D.meetings, [], cur => {
    let it = m.id && cur.find(x => x.id === m.id);
    const prevStatus = it?.status;
    if (!it) { it = { id: rid(), created: now, by }; cur.push(it); }
    Object.assign(it, {
      title: clip(m.title, 200) || 'Meeting', sourceId: clip(m.sourceId, 80), sourceName: clip(m.sourceName, 160), contact: clip(m.contact, 160), contactEmail: clip(m.contactEmail, 160).toLowerCase(),
      start, end, kind: KINDS.includes(m.kind) ? m.kind : 'meeting', location: clip(m.location, 200), notes: clip(m.notes, 2000), outcome: clip(m.outcome, 2000),
      status: STATUSES.includes(m.status) ? m.status : (it.status || 'scheduled'), updated: now,
    });
    if (it.status === 'done' && prevStatus !== 'done' && !it.activityId) { it.activityId = rid(); logAct = it; }
    saved = { ...it }; return cur.slice(-3000);
  });
  if (logAct) {
    const kind = logAct.kind === 'inservice' ? 'lunch' : logAct.kind;
    await updateDoc(D.activity, [], cur => [...cur, { id: logAct.activityId, sourceId: logAct.sourceId, sourceName: logAct.sourceName, kind, status: 'done', subject: logAct.title, body: logAct.outcome || logAct.notes || '', to: logAct.contactEmail, reason: logAct.contact ? `Met with ${logAct.contact}` : 'Meeting', followUp: '', by, at: logAct.start, doneAt: logAct.end, meetingId: logAct.id }].slice(-5000));
    if (logAct.sourceId && ['visit', 'lunch', 'meeting', 'inservice'].includes(logAct.kind)) await updateDoc(D.flows, {}, cur => { const f = cur[logAct.sourceId]; const s = f?.steps?.find(x => !x.done && !x.skipped && x.kind === 'visit'); if (s) { s.done = logAct.start.slice(0, 10); f.updated = now; } return cur; });
  }
  return saved;
}
