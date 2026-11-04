// Machine endpoint for the data pipeline: read (GET ?path=) and upload (POST) market files. Requires INGEST_SECRET.
import crypto from 'node:crypto';
import { readRaw, writeRaw } from '../lib/store.mjs';
import { readBody, send } from '../lib/http.mjs';

const same = (a, b) => !!a && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Wellby sales outreach (LinkedIn via La Growth Machine): the daily check posts its status here with OUTREACH_TOKEN,
// a narrow token that can only read and write this one document.
const OUTREACH = 'sales/outreach.json';
async function outreach(req, res) {
  if (req.method === 'GET') { const t = await readRaw(OUTREACH); res.statusCode = t ? 200 : 404; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); return res.end(t || '{"error":"none yet"}'); }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  const b = await readBody(req), o = b.outreach;
  if (!o || typeof o !== 'object' || !Array.isArray(o.leads)) return send(res, 400, { error: 'Send {outreach: {updatedAt, campaigns: [], leads: [], replies: []}}' });
  const text = JSON.stringify({ ...o, receivedAt: new Date().toISOString() });
  if (text.length > 2e6) return send(res, 413, { error: 'too big' });
  await writeRaw(OUTREACH, text, 0);
  return send(res, 200, { ok: true, leads: o.leads.length, bytes: text.length });
}

export default async function handler(req, res) {
  if (req.headers['x-outreach-token']) return same(String(req.headers['x-outreach-token']), process.env.OUTREACH_TOKEN || '') ? outreach(req, res) : send(res, 401, { error: 'no' });
  const want = process.env.INGEST_SECRET || '';
  const got = String(req.headers['x-ingest-secret'] || '');
  if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return send(res, 401, { error: 'no' });
  const ok = p => /^market\/v\d+\/[\w/.-]+\.json$/.test(p || '');
  if (req.method === 'GET') {
    const path = new URL(req.url, 'http://x').searchParams.get('path');
    if (!ok(path)) return send(res, 400, { error: 'bad path' });
    const t = await readRaw(path);
    if (t == null) return send(res, 404, { error: 'not found' });
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); return res.end(t);
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  const b = await readBody(req);
  if (!ok(b.path) || typeof b.text !== 'string') return send(res, 400, { error: 'bad path' });
  await writeRaw(b.path, b.text, 3600);
  return send(res, 200, { ok: true, bytes: b.text.length });
}
