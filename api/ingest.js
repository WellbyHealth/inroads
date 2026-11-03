// Machine endpoint for the data pipeline: read (GET ?path=) and upload (POST) market files. Requires INGEST_SECRET.
import crypto from 'node:crypto';
import { readRaw, writeRaw } from '../lib/store.mjs';
import { readBody, send } from '../lib/http.mjs';

export default async function handler(req, res) {
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
