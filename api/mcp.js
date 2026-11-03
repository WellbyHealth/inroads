// Wellby MCP server (Model Context Protocol, Streamable HTTP, stateless JSON responses).
// Lets AI assistants such as Claude read a workspace's referral sources, contacts, calendar and results,
// and log touches, schedule meetings, add contacts or draft emails for human approval.
// Auth: a workspace key from Wellby > Connections, sent as "Authorization: Bearer wk_..." or "?key=wk_...".
import crypto from 'node:crypto';
import { readDoc, updateDoc } from '../lib/store.mjs';
import { readBody } from '../lib/http.mjs';
import { loadOrgs, orgAccess } from '../lib/auth.mjs';
import { docs, hashKey, rid, clip, saveMeeting } from '../lib/conn.mjs';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const reply = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*'); res.end(body == null ? '' : JSON.stringify(body)); };

async function auth(req) {
  const h = String(req.headers.authorization || ''), q = new URL(req.url, 'http://x').searchParams.get('key') || '';
  const key = h.startsWith('Bearer ') ? h.slice(7).trim() : q;
  const m = key.match(/^wk_(.+)\.([\w-]{20,})$/); if (!m) return null;
  const org = m[1], conn = await readDoc(docs(org).conn, {});
  const want = hashKey(key), k = (conn.keys || []).find(x => x.hash.length === want.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(want)));
  if (!k) return null;
  const orgRec = (await loadOrgs()).find(o => o.id === org);
  if (!orgRec || orgAccess(orgRec).locked) return null;
  if (!k.lastUsed || Date.now() - Date.parse(k.lastUsed) > 3600e3) updateDoc(docs(org).conn, {}, cur => { const x = (cur.keys || []).find(y => y.id === k.id); if (x) x.lastUsed = new Date().toISOString(); return cur; }).catch(() => {});
  return { org, orgName: orgRec.name, by: `assistant:${k.name}` };
}

const day = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
async function load(org) {
  const D = docs(org);
  const [activity, contacts, flows, referrals, meetings, synced, settings] = await Promise.all([readDoc(D.activity, []), readDoc(D.contacts, {}), readDoc(D.flows, {}), readDoc(D.referrals, { rows: [] }), readDoc(D.meetings, []), readDoc(D.synced, {}), readDoc(D.settings, {})]);
  // Every source the workspace knows about: from win flows, touches, referral history, contacts and meetings.
  const src = new Map(), touch = (id, name, extra = {}) => { if (!id) return; const s = src.get(id) || { id, name: '', type: '', city: '' }; if (name && !s.name) s.name = name; Object.assign(s, Object.fromEntries(Object.entries(extra).filter(([, v]) => v))); src.set(id, s); };
  for (const [id, f] of Object.entries(flows)) touch(id, f.p?.name, { type: f.p?.type, city: f.p?.city, phone: f.p?.phone, address: f.p?.address });
  for (const a of activity) touch(a.sourceId, a.sourceName);
  for (const r of referrals.rows || []) touch(r.key, r.name);
  for (const id of Object.keys(contacts)) touch(id, '');
  for (const m of meetings) touch(m.sourceId, m.sourceName);
  return { activity, contacts, flows, referrals: referrals.rows || [], meetings, synced, settings, src };
}
function stage(f, refs) {
  if (!f) return refs ? 'Referring (no flow)' : 'Not started';
  if (refs >= 3) return 'Regular'; if (refs >= 1) return 'First referral';
  const done = (f.steps || []).filter(s => s.done);
  return done.some(s => s.kind === 'visit') ? 'Met' : done.length ? 'Introduced' : 'Targeted';
}
function summary(W, s) {
  const since = addDays(day(), -365).slice(0, 7);
  const refs = W.referrals.filter(r => r.key === s.id && r.month >= since).reduce((n, r) => n + (r.count || 0), 0);
  const acts = W.activity.filter(a => a.sourceId === s.id && a.status === 'done' && !String(a.kind).startsWith('skip'));
  const last = acts.map(a => a.doneAt || a.at).sort().pop() || null;
  return { id: s.id, name: s.name || s.id, type: s.type || '', city: s.city || '', stage: stage(W.flows[s.id], refs), referrals_12m: refs, last_touch: last, contacts: (W.contacts[s.id] || []).length };
}
function findSource(W, q) {
  if (!q) return null;
  if (W.src.has(q)) return W.src.get(q);
  const l = String(q).toLowerCase(), all = [...W.src.values()];
  return all.find(s => s.name.toLowerCase() === l) || all.find(s => s.name.toLowerCase().includes(l)) || null;
}
const flowDue = (f) => { const s = (f.steps || []).find(x => !x.done && !x.skipped); return s && s.offset != null ? { step: s.label, kind: s.kind, due: addDays(f.startedAt, s.offset) } : null; };

const TOOLS = [
  { name: 'get_today', description: "What needs attention today in this Wellby workspace: email drafts waiting for approval, follow-ups due, win-flow steps due, and meetings in the next 7 days.", inputSchema: { type: 'object', properties: {} },
    run: (W) => {
      const t = day(), wk = addDays(t, 7);
      return {
        drafts: W.activity.filter(a => a.status === 'draft').slice(-20).map(a => ({ id: a.id, source: a.sourceName, subject: a.subject, to: a.to })),
        follow_ups_due: W.activity.filter(a => a.followUp && a.followUp <= t && a.status === 'done' && !W.activity.some(b => b.sourceId === a.sourceId && (b.doneAt || '') > (a.doneAt || ''))).slice(-20).map(a => ({ source: a.sourceName, due: a.followUp, last: a.subject })),
        flow_steps_due: Object.entries(W.flows).map(([id, f]) => ({ id, name: f.p?.name, d: flowDue(f) })).filter(x => x.d && x.d.due <= t).map(x => ({ source_id: x.id, source: x.name, ...x.d })),
        meetings_next_7_days: W.meetings.filter(m => m.status === 'scheduled' && m.start.slice(0, 10) >= t && m.start.slice(0, 10) <= wk).sort((a, b) => a.start.localeCompare(b.start)).map(m => ({ id: m.id, title: m.title, source: m.sourceName, contact: m.contact, start: m.start, kind: m.kind, location: m.location })),
      };
    } },
  { name: 'search_sources', description: 'Search the referral sources this workspace works with (hospitals, physicians, skilled nursing and more) by name or city. Returns stage, referrals in the last 12 months and last touch.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Name or city. Leave empty to list the most active sources.' }, limit: { type: 'number' } } },
    run: (W, a) => { const l = String(a.query || '').toLowerCase(); return [...W.src.values()].filter(s => !l || `${s.name} ${s.city}`.toLowerCase().includes(l)).map(s => summary(W, s)).sort((x, y) => y.referrals_12m - x.referrals_12m || String(y.last_touch).localeCompare(String(x.last_touch))).slice(0, Math.min(50, +a.limit || 15)); } },
  { name: 'get_source', description: 'Full detail for one referral source: contacts, win-flow steps, recent touches, meetings and referrals by month.', inputSchema: { type: 'object', properties: { source: { type: 'string', description: 'Source id or name' } }, required: ['source'] },
    run: (W, a) => {
      const s = findSource(W, a.source); if (!s) throw new Error(`No source matches "${a.source}". Try search_sources.`);
      const f = W.flows[s.id];
      return { ...summary(W, s), phone: s.phone || '', address: s.address || '', contacts: W.contacts[s.id] || [],
        win_flow: f ? { started: f.startedAt, steps: f.steps.map(x => ({ label: x.label, kind: x.kind, due: x.offset == null ? null : addDays(f.startedAt, x.offset), done: x.done || null, skipped: !!x.skipped })) } : null,
        recent_touches: W.activity.filter(x => x.sourceId === s.id && !String(x.kind).startsWith('skip')).slice(-12).reverse().map(x => ({ kind: x.kind, status: x.status, date: (x.doneAt || x.at || '').slice(0, 10), subject: x.subject, to: x.to })),
        meetings: W.meetings.filter(m => m.sourceId === s.id).slice(-10).map(m => ({ id: m.id, title: m.title, start: m.start, status: m.status, contact: m.contact, outcome: m.outcome })),
        referrals_by_month: Object.entries(W.referrals.filter(r => r.key === s.id).reduce((o, r) => (o[r.month] = (o[r.month] || 0) + r.count, o), {})).sort().slice(-12).map(([month, count]) => ({ month, count })) };
    } },
  { name: 'list_contacts', description: 'People saved on referral sources (discharge planners, case managers, physicians, office managers), with when each was last contacted.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } },
    run: (W, a) => { const l = String(a.query || '').toLowerCase(), out = []; for (const [sid, list] of Object.entries(W.contacts)) for (const c of list || []) { const s = W.src.get(sid) || { name: sid }; if (l && !`${c.name} ${c.role} ${c.email} ${s.name}`.toLowerCase().includes(l)) continue; const last = W.activity.filter(x => x.sourceId === sid && x.status === 'done' && (!c.email || !x.to || x.to.toLowerCase().includes(c.email.toLowerCase()))).map(x => x.doneAt || x.at).sort().pop() || null; out.push({ name: c.name, role: c.role, email: c.email, phone: c.phone, source_id: sid, source: s.name, last_contacted: last, notes: c.notes }); } return out.sort((x, y) => String(x.last_contacted).localeCompare(String(y.last_contacted))).slice(0, Math.min(200, +a.limit || 50)); } },
  { name: 'get_calendar', description: 'Meetings and visits between two dates: those scheduled in Wellby plus events synced from connected Google or Outlook calendars. Includes completed, canceled and no-show meetings.', inputSchema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD, default today' }, to: { type: 'string', description: 'YYYY-MM-DD, default 14 days later' } } },
    run: (W, a) => { const from = a.from || day(), to = a.to || addDays(from, 14), inR = s => s && s.slice(0, 10) >= from && s.slice(0, 10) <= to; return { from, to, meetings: W.meetings.filter(m => inR(m.start)).sort((x, y) => x.start.localeCompare(y.start)).map(m => ({ id: m.id, title: m.title, source: m.sourceName, contact: m.contact, start: m.start, end: m.end, kind: m.kind, status: m.status, location: m.location, outcome: m.outcome })), synced_events: (W.synced.events || []).filter(e => inR(e.start)).map(e => ({ title: e.title, start: e.start, end: e.end, calendar: e.provider, source_id: e.sourceId || null, contact: e.contact || null })) }; } },
  { name: 'get_results', description: 'Referral results: referrals by month for the last N months, top sources, and touches and meetings completed.', inputSchema: { type: 'object', properties: { months: { type: 'number', description: 'Default 12' } } },
    run: (W, a) => { const n = Math.max(1, Math.min(36, +a.months || 12)), since = addDays(day(), -31 * n).slice(0, 7), rows = W.referrals.filter(r => r.month >= since); const byM = {}, byS = {}; for (const r of rows) { byM[r.month] = (byM[r.month] || 0) + r.count; byS[r.key] = (byS[r.key] || 0) + r.count; } const sinceDay = since + '-01'; return { months: n, total_referrals: rows.reduce((s, r) => s + r.count, 0), by_month: Object.entries(byM).sort().map(([month, count]) => ({ month, count })), top_sources: Object.entries(byS).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([id, count]) => ({ id, name: W.src.get(id)?.name || id, count })), touches_done: W.activity.filter(x => x.status === 'done' && (x.doneAt || x.at || '') >= sinceDay && !String(x.kind).startsWith('skip')).length, meetings_done: W.meetings.filter(m => m.status === 'done' && m.start >= sinceDay).length }; } },
  { name: 'log_touch', description: 'Record a call, visit, email or lunch that already happened with a referral source. It counts toward Results and the source’s last-contacted date.', inputSchema: { type: 'object', properties: { source: { type: 'string', description: 'Source id or name' }, kind: { type: 'string', enum: ['call', 'visit', 'email', 'lunch', 'meeting'] }, summary: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD, default today' }, contact_email: { type: 'string' }, follow_up: { type: 'string', description: 'YYYY-MM-DD for the next touch' } }, required: ['source', 'kind', 'summary'] },
    write: true, run: async (W, a, ctx) => { const s = findSource(W, a.source); if (!s) throw new Error(`No source matches "${a.source}"`); const at = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date + 'T15:00:00.000Z' : new Date().toISOString(); const item = { id: rid(), sourceId: s.id, sourceName: s.name, kind: ['call', 'visit', 'email', 'lunch', 'meeting'].includes(a.kind) ? a.kind : 'call', status: 'done', subject: clip(a.summary, 300), body: '', to: clip(a.contact_email, 160), reason: 'Logged by AI assistant', followUp: /^\d{4}-\d{2}-\d{2}$/.test(a.follow_up || '') ? a.follow_up : '', by: ctx.by, at, doneAt: at }; await updateDoc(docs(ctx.org).activity, [], cur => [...cur, item].slice(-5000)); return { ok: true, logged: { source: s.name, kind: item.kind, date: at.slice(0, 10) } }; } },
  { name: 'schedule_meeting', description: 'Put a meeting, visit, lunch or in-service on the Wellby calendar, optionally linked to a referral source and contact.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, start: { type: 'string', description: 'ISO date-time, e.g. 2026-11-10T14:30:00-05:00' }, minutes: { type: 'number', description: 'Default 30' }, kind: { type: 'string', enum: ['meeting', 'visit', 'lunch', 'call', 'inservice'] }, source: { type: 'string', description: 'Source id or name (optional)' }, contact: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' } }, required: ['title', 'start'] },
    write: true, run: async (W, a, ctx) => { const s = a.source ? findSource(W, a.source) : null; if (a.source && !s) throw new Error(`No source matches "${a.source}"`); const m = await saveMeeting(ctx.org, { title: a.title, start: a.start, minutes: a.minutes, kind: a.kind, sourceId: s?.id, sourceName: s?.name, contact: a.contact, location: a.location, notes: a.notes }, ctx.by); return { ok: true, meeting: { id: m.id, title: m.title, start: m.start, end: m.end, source: m.sourceName } }; } },
  { name: 'complete_meeting', description: 'Mark a scheduled meeting as done (with the outcome), canceled or a no-show. Done meetings are logged as touches.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['done', 'canceled', 'no_show'] }, outcome: { type: 'string' } }, required: ['id', 'status'] },
    write: true, run: async (W, a, ctx) => { const m = W.meetings.find(x => x.id === a.id); if (!m) throw new Error('No meeting with that id. Use get_calendar to find it.'); const r = await saveMeeting(ctx.org, { ...m, status: a.status, outcome: a.outcome ?? m.outcome }, ctx.by); return { ok: true, meeting: { id: r.id, status: r.status } }; } },
  { name: 'add_contact', description: 'Save a person on a referral source (for example a discharge planner or case manager).', inputSchema: { type: 'object', properties: { source: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, notes: { type: 'string' } }, required: ['source', 'name'] },
    write: true, run: async (W, a, ctx) => { const s = findSource(W, a.source); if (!s) throw new Error(`No source matches "${a.source}"`); const item = { id: rid(), name: clip(a.name, 120), role: clip(a.role, 120), email: clip(a.email, 160), phone: clip(a.phone, 40), notes: clip(a.notes, 500), updated: new Date().toISOString() }; await updateDoc(docs(ctx.org).contacts, {}, cur => { (cur[s.id] = cur[s.id] || []).push(item); return cur; }); return { ok: true, contact: { ...item, source: s.name } }; } },
  { name: 'draft_email', description: 'Draft an outreach email to a referral source. It is not sent: it lands in Wellby’s Today queue for a person to review, edit and send.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['source', 'subject', 'body'] },
    write: true, run: async (W, a, ctx) => { const s = findSource(W, a.source); if (!s) throw new Error(`No source matches "${a.source}"`); const item = { id: rid(), sourceId: s.id, sourceName: s.name, kind: 'email', status: 'draft', subject: clip(a.subject, 300), body: clip(a.body, 6000), to: clip(a.to, 300), reason: 'Drafted by AI assistant', followUp: '', by: ctx.by, at: new Date().toISOString(), drafter: 'assistant' }; await updateDoc(docs(ctx.org).activity, [], cur => [...cur, item].slice(-5000)); return { ok: true, draft_id: item.id, note: 'Waiting for approval in Wellby > Today.' }; } },
];

async function handle(msg, ctx) {
  const { id, method, params = {} } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result }), err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!method) return err(-32600, 'Invalid request');
  if (id === undefined || id === null) return null; // notification
  if (method === 'initialize') return ok({ protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'wellby', title: 'Wellby', version: '1.0.0' }, instructions: `Wellby referral intelligence for ${ctx.orgName}. Use search_sources or get_today first. Write tools change the workspace; draft_email never sends.` });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: !t.write, destructiveHint: false } })) });
  if (method === 'tools/call') {
    const t = TOOLS.find(x => x.name === params.name); if (!t) return err(-32602, `Unknown tool: ${params.name}`);
    try { const W = await load(ctx.org); const out = await t.run(W, params.arguments || {}, ctx); return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { items: out } : out }); }
    catch (e) { return ok({ content: [{ type: 'text', text: e.message }], isError: true }); }
  }
  return err(-32601, `Method not found: ${method}`);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version, mcp-session-id'); return reply(res, 204); }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Use POST (Streamable HTTP, JSON responses)' } }); }
    const ctx = await auth(req);
    if (!ctx) { res.setHeader('WWW-Authenticate', 'Bearer realm="wellby"'); return reply(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid Wellby key. Create one in Wellby > Connections.' } }); }
    const body = await readBody(req);
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(m => handle(m, ctx)))).filter(Boolean); return out.length ? reply(res, 200, out) : reply(res, 202); }
    const out = await handle(body, ctx);
    return out ? reply(res, 200, out) : reply(res, 202);
  } catch (e) { console.error(e); return reply(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Server error' } }); }
}
