// Lightfield CRM sync for the Wellby sales workspace. Needs LIGHTFIELD_API_KEY (scopes: accounts, contacts, notes create).
//   status            { configured, synced }                 is the key set, and how many prospects are linked
//   push   items[]    find-or-create the account and its decision maker; remembers the Lightfield IDs per prospect
//   note   id, title, content   adds a note (a logged touch) to the prospect's Lightfield account
import { readDoc, updateDoc } from './store.mjs';

const BASE = 'https://api.lightfield.app';
const clip = (v, n) => String(v ?? '').slice(0, n);
const mapDoc = org => `orgs/${org}/lightfield.json`;

async function call(path, body, key) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.LIGHTFIELD_API_KEY}`, 'Lightfield-Version': '2026-03-01', 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = {}; try { j = JSON.parse(t); } catch {}
  if (!r.ok) { const e = new Error(`Lightfield: ${j.error?.message || j.message || r.status}`); e.status = r.status === 401 || r.status === 403 ? 502 : r.status; throw e; }
  return j.data || j;
}
const phoneE164 = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : ''; };
const splitName = n => { const w = clip(n, 120).trim().split(/\s+/); return { firstName: w.slice(0, -1).join(' ') || w[0] || '', lastName: w.length > 1 ? w.at(-1) : '' }; };

export async function lightfield(me, b) {
  const configured = !!process.env.LIGHTFIELD_API_KEY;
  const doc = mapDoc(me.org);
  if (b.op === 'status') { const m = await readDoc(doc, {}); return { configured, synced: Object.keys(m.ids || {}).length, ids: m.ids || {} }; }
  if (!configured) { const e = new Error('Add a Lightfield API key (LIGHTFIELD_API_KEY) to turn on sync.'); e.status = 409; throw e; }

  if (b.op === 'push') {
    const items = (b.items || []).slice(0, 25);
    const m = await readDoc(doc, {}); const ids = m.ids || {}; const out = {};
    for (const it of items) {
      const id = clip(it.id, 80); if (!id) continue;
      if (ids[id]) { out[id] = ids[id]; continue; }
      const acc = await call('/v1/accounts', {
        fields: {
          $name: clip(it.name, 200),
          $primaryAddress: { street: clip(it.address, 200), city: clip(it.city, 80), state: clip(it.st, 2), postalCode: clip(it.zip, 10), country: 'US', ...(it.lat ? { latitude: +it.lat, longitude: +it.lng } : {}) },
          $industry: ['Hospitals And Health Care'],
          $notes: clip(`${it.type}${it.sites > 1 ? ` · ${it.sites} sites` : ''} · Wellby fit ${it.score}/100. ${it.why || ''} NPI ${id}.`, 900),
        },
        skipEnrichment: items.length >= 10,
      }, `wellby-acct-${me.org}-${id}`);
      const rec = { account: acc.id, link: acc.httpLink || '' };
      if (it.official) {
        const phone = phoneE164(it.phone);
        const c = await call('/v1/contacts', { fields: { $name: splitName(it.official), ...(phone ? { $phone: [phone] } : {}) }, relationships: { $account: acc.id }, skipEnrichment: true }, `wellby-ct-${me.org}-${id}`);
        rec.contact = c.id;
      }
      ids[id] = rec; out[id] = rec;
    }
    await updateDoc(doc, {}, cur => ({ ...cur, ids: { ...(cur.ids || {}), ...out } }));
    return { ok: true, pushed: Object.keys(out).length, ids: out };
  }

  if (b.op === 'note') {
    const m = await readDoc(doc, {}); const rec = (m.ids || {})[clip(b.id, 80)];
    if (!rec) return { ok: true, skipped: true };
    const n = await call('/v1/notes', { fields: { $title: clip(b.title, 160) || 'Touch logged in Wellby', $content: clip(b.content, 4000) }, relationships: { $account: rec.account, ...(rec.contact ? { $contact: rec.contact } : {}) } }, b.key ? `wellby-note-${me.org}-${clip(b.key, 60)}` : undefined);
    return { ok: true, note: n.id };
  }
  const e = new Error('Unknown Lightfield operation'); e.status = 400; throw e;
}
