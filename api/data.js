import { lightfield } from '../lib/lightfield.mjs';
import crypto from 'node:crypto';
import { readDoc, writeDoc, updateDoc, orgDocs } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';
import { CARE } from '../lib/care.mjs';

const DEFAULT_SETTINGS = {
  agencyName: '', senderName: '', services: 'Non-medical in-home care: personal care, companionship, respite, overnight and 24-hour care, transitions home from hospital or rehab.',
  pitch: '', mailClient: 'gmail', website: '', offices: [], careType: 'home_care', weeklyGoal: 10, clientValue: 0, outbound: {}, visitEvery: 30, admitRate: 0, targetShare: 0,
};
const id = () => crypto.randomBytes(6).toString('base64url');
const clip = (s, n = 4000) => String(s ?? '').slice(0, n);

async function geocode(address) {
  if (process.env.LOCAL_STORE_DIR) return { lat: 32.92, lng: -96.77, matched: address.toUpperCase() };
  const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  try {
    const r = await fetch(u); const j = await r.json();
    const m = j?.result?.addressMatches?.[0];
    if (m) return { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress };
  } catch {}
  // Fallback: ZIP code centroid (Census ZCTA), e.g. for freeway frontage addresses the geocoder can't parse.
  const zip = (address.match(/\b(\d{5})(?:-\d{4})?\s*$/) || [])[1];
  if (zip) { const zips = await readDoc('market/v3/zips.json', {}); if (zips[zip]) return { lat: zips[zip][0], lng: zips[zip][1], matched: `ZIP ${zip} (approximate)` }; }
  return null;
}

// Wellby sales workspace: a finished touch is copied to the prospect's Lightfield account as a note (when linked).
async function touchToCrm(me, a) {
  if (!me.orgSales || !process.env.LIGHTFIELD_API_KEY) return;
  try {
    const title = `${a.kind[0].toUpperCase()}${a.kind.slice(1)}: ${a.subject || a.reason || a.sourceName}`;
    const content = [a.body, a.followUp ? `Next touch: ${a.followUp}` : '', `Logged in Wellby by ${me.name || me.email}`].filter(Boolean).join('\n\n');
    await lightfield(me, { op: 'note', id: a.sourceId, title, content, key: a.id });
  } catch (e) { console.error('lightfield note', e.message); }
}
export default withUser(async (req, res, me) => {
  const DOCS = orgDocs(me.org);
  if (req.method === 'GET') {
    const [settings, referrals, activity, contacts, flows] = await Promise.all([
      readDoc(DOCS.settings, DEFAULT_SETTINGS), readDoc(DOCS.referrals, { rows: [], uploads: [] }),
      readDoc(DOCS.activity, []), readDoc(DOCS.contacts, {}), readDoc(DOCS.flows, {}),
    ]);
    return send(res, 200, { me, settings: { ...DEFAULT_SETTINGS, ...settings }, referrals, activity, contacts, flows });
  }
  const body = await readBody(req);
  const now = new Date().toISOString();

  switch (body.action) {
    case 'saveSettings': {
      const s = body.settings || {};
      const next = await updateDoc(DOCS.settings, DEFAULT_SETTINGS, async cur => {
        const base = { ...DEFAULT_SETTINGS, ...cur };
        const out = { ...base,
          agencyName: clip(s.agencyName ?? base.agencyName, 120), senderName: clip(s.senderName ?? base.senderName, 120), services: clip(s.services ?? base.services, 1500),
          pitch: clip(s.pitch ?? base.pitch, 1500), website: clip(s.website ?? base.website, 200),
          mailClient: ['gmail', 'outlook', 'default'].includes(s.mailClient) ? s.mailClient : (base.mailClient || 'gmail'),
          careType: CARE[s.careType] ? s.careType : (base.careType || 'home_care'),
          weeklyGoal: Math.max(1, Math.min(200, Math.round(+s.weeklyGoal || base.weeklyGoal || 10))),
          // Scorecard inputs: average revenue per new client, and each source's estimated outbound referrals per quarter.
          visitEvery: Math.max(7, Math.min(180, Math.round(+(s.visitEvery ?? base.visitEvery) || 30))),
          clientValue: Math.max(0, Math.min(1e7, Math.round(+(s.clientValue ?? base.clientValue) || 0))),
          // Opportunity assumptions: share of referrals that become clients, and the share of each source to aim for (0 = default).
          admitRate: Math.max(0, Math.min(1, +(s.admitRate ?? base.admitRate) || 0)), targetShare: Math.max(0, Math.min(.5, +(s.targetShare ?? base.targetShare) || 0)),
          // Partner sheet: what each partner says about the relationship ("You're our first call"), merged per source.
          sheetNotes: (() => { const n = { ...(base.sheetNotes || {}) }; if (s.sheetNotes && typeof s.sheetNotes === 'object') for (const [k, v] of Object.entries(s.sheetNotes).slice(0, 200)) { const key = clip(k, 80), val = clip(v, 300).trim(); if (val) n[key] = val; else delete n[key]; } return n; })(),
          sales: s.sales && typeof s.sales === 'object' ? { states: (Array.isArray(s.sales.states) ? s.sales.states : []).filter(x => /^[A-Z]{2}$/.test(x)).slice(0, 60) } : base.sales,
          outbound: s.outbound && typeof s.outbound === 'object' ? Object.fromEntries(Object.entries(s.outbound).slice(0, 3000).map(([k, v]) => [clip(k, 80), Math.max(0, Math.min(1e5, Math.round(+v || 0)))]).filter(([, v]) => v > 0)) : (base.outbound || {}) };
        if (Array.isArray(s.offices)) {
          const prev = cur.offices || [];
          out.offices = [];
          for (const o of s.offices.slice(0, 12)) {
            const address = clip(o.address, 200).trim(); if (!address) continue;
            const old = prev.find(p => p.address === address && p.lat);
            const g = old ? { lat: old.lat, lng: old.lng, matched: old.matched } : await geocode(address);
            out.offices.push({ id: clip(o.id, 20) || id(), label: clip(o.label, 60) || address.split(',')[1]?.trim() || 'Office', address, radiusMiles: Math.max(3, Math.min(75, +o.radiusMiles || 20)), ...(g ? g : { unmatched: true }) });
          }
        }
        return out;
      });
      return send(res, 200, { ok: true, settings: next });
    }
    case 'saveReferrals': {
      // rows: [{ key, npi, name, month: 'YYYY-MM', count, payer }] — counts only, no patient data.
      const rows = (body.rows || []).slice(0, 50000).map(r => ({
        key: clip(r.key, 80), npi: /^\d{10}$/.test(r.npi) ? r.npi : '', name: clip(r.name, 160),
        month: /^\d{4}-\d{2}$/.test(r.month) ? r.month : '', count: Math.max(0, Math.round(+r.count || 0)),
        admits: r.admits === '' || r.admits == null ? null : Math.max(0, Math.round(+r.admits || 0)),
        payer: clip(r.payer, 40),
      })).filter(r => r.key && r.month);
      const next = await updateDoc(DOCS.referrals, { rows: [], uploads: [] }, cur => {
        let base = cur.rows || [];
        if (body.mode === 'replace') base = [];
        else { // merge: incoming months replace the same source+month
          const k = new Set(rows.map(r => `${r.key}|${r.month}|${r.payer}`));
          base = base.filter(r => !k.has(`${r.key}|${r.month}|${r.payer}`));
        }
        return { rows: [...base, ...rows], uploads: [...(cur.uploads || []), { at: now, by: me.email, file: clip(body.fileName, 120), rows: rows.length, mode: body.mode || 'merge' }].slice(-50) };
      });
      return send(res, 200, { ok: true, referrals: next });
    }
    case 'clearReferrals': {
      if (me.role !== 'admin') return send(res, 403, { error: 'Admins only' });
      const next = { rows: [], uploads: [] };
      await writeDoc(DOCS.referrals, next);
      return send(res, 200, { ok: true, referrals: next });
    }
    case 'saveContact': {
      const c = body.contact || {};
      const sid = clip(body.sourceId, 80);
      const next = await updateDoc(DOCS.contacts, {}, cur => {
        const list = cur[sid] || [];
        const item = { id: c.id || id(), name: clip(c.name, 120), role: clip(c.role, 120), email: clip(c.email, 160), phone: clip(c.phone, 40), notes: clip(c.notes, 500), updated: now };
        const i = list.findIndex(x => x.id === item.id);
        if (body.remove) { if (i >= 0) list.splice(i, 1); }
        else if (i >= 0) list[i] = item; else list.push(item);
        cur[sid] = list; return cur;
      });
      return send(res, 200, { ok: true, contacts: next });
    }
    case 'addActivity': {
      const a = body.activity || {};
      const item = {
        id: id(), sourceId: clip(a.sourceId, 80), sourceName: clip(a.sourceName, 160), kind: clip(a.kind, 20) || 'email',
        status: ['draft', 'approved', 'done', 'skipped'].includes(a.status) ? a.status : 'draft',
        subject: clip(a.subject, 300), body: clip(a.body, 6000), to: clip(a.to, 300), reason: clip(a.reason, 300),
        followUp: /^\d{4}-\d{2}-\d{2}$/.test(a.followUp) ? a.followUp : '', by: me.email, at: now, drafter: clip(a.drafter, 40),
        flowStep: Number.isInteger(a.flowStep) ? a.flowStep : null,
      };
      if (item.status === 'done') item.doneAt = now;
      const next = await updateDoc(DOCS.activity, [], cur => [...cur, item].slice(-5000));
      if (item.status === 'done') await touchToCrm(me, item);
      return send(res, 200, { ok: true, activity: next, item });
    }
    case 'updateActivity': {
      const a = body.activity || {};
      const next = await updateDoc(DOCS.activity, [], cur => {
        const it = cur.find(x => x.id === a.id);
        if (!it) return cur;
        for (const k of ['subject', 'body', 'to', 'followUp', 'kind', 'notes']) if (k in a) it[k] = clip(a[k], k === 'body' ? 6000 : 300);
        if (a.status && ['draft', 'approved', 'done', 'skipped'].includes(a.status)) {
          it.status = a.status;
          if (a.status === 'approved') { it.approvedBy = me.email; it.approvedAt = now; }
          if (a.status === 'done') { it.doneAt = now; }
        }
        it.updated = now; return cur;
      });
      const done = a.status === 'done' && next.find(x => x.id === a.id);
      if (done) await touchToCrm(me, done);
      return send(res, 200, { ok: true, activity: next });
    }
    case 'saveFlow': {
      // A win flow per referral source: playbook steps with day offsets, plus a snapshot of the source.
      const sid = clip(body.sourceId, 80), f = body.flow;
      if (!sid) return send(res, 400, { error: 'Missing source' });
      const day = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
      const next = await updateDoc(DOCS.flows, {}, cur => {
        if (!f) { delete cur[sid]; return cur; }
        const p = f.p || {};
        cur[sid] = {
          startedAt: day(f.startedAt) || now.slice(0, 10), by: cur[sid]?.by || me.email, updated: now, sample: !!f.sample,
          steps: (f.steps || []).slice(0, 12).map(s => ({ kind: ['email', 'call', 'visit'].includes(s.kind) ? s.kind : 'email', label: clip(s.label, 120), offset: s.offset == null ? null : Math.max(0, Math.min(365, Math.round(+s.offset || 0))), done: day(s.done), skipped: !!s.skipped })),
          p: { name: clip(p.name, 160), type: clip(p.type, 60), tx: clip(p.tx, 160), city: clip(p.city, 60), address: clip(p.address, 160), zip: clip(p.zip, 10), phone: clip(p.phone, 20), lat: +p.lat || null, lng: +p.lng || null, size: +p.size || 50, beds: +p.beds || null },
        };
        return cur;
      });
      return send(res, 200, { ok: true, flows: next });
    }
    default: return send(res, 400, { error: 'Unknown action' });
  }
});
