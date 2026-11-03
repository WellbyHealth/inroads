// Machine endpoint for the data pipeline to upload market shards. Requires INGEST_SECRET.
import crypto from 'node:crypto';
import { writeRaw } from '../lib/store.mjs';
import { readBody, send } from '../lib/http.mjs';

export default async function handler(req, res) {
  const want = process.env.INGEST_SECRET || '';
  const got = String(req.headers['x-ingest-secret'] || '');
  if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return send(res, 401, { error: 'no' });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readBody(req);
  if (!/^market\/v\d+\/[\w/.-]+\.json$/.test(b.path || '') || typeof b.text !== 'string') return send(res, 400, { error: 'bad path' });
  await writeRaw(b.path, b.text, 3600);
  return send(res, 200, { ok: true, bytes: b.text.length });
}
