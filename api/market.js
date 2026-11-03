// Serves the national public-data market: the county index and county shard parts.
// Parts are filtered server-side to providers within the workspace's office radiuses.
import { readRaw, readDoc, orgDocs } from '../lib/store.mjs';
import { send, withUser } from '../lib/http.mjs';

const V = 'market/v3';
const cache = new Map(); // per-instance memo of parsed shards
async function cached(path, parse) {
  const key = path + (parse ? '#json' : '');
  if (cache.has(key)) return cache.get(key);
  const t = await readRaw(path);
  if (t == null) return null;
  const v = parse ? JSON.parse(t) : t;
  if (cache.size > 200) cache.clear();
  cache.set(key, v);
  return v;
}
function miles(a, b, c, d) {
  const R = 3958.8, r = x => x * Math.PI / 180, dLat = r(c - a), dLng = r(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default withUser(async (req, res, me) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const part = q.get('part');
  if (part) {
    if (!/^\d{5}-\d{1,3}$/.test(part)) return send(res, 400, { error: 'Bad part' });
    const [index, rows] = await Promise.all([cached(`${V}/index.json`, true), cached(`${V}/c/${part}.json`, true)]);
    if (!rows || !index) return send(res, 404, { error: 'Not found' });
    const offices = me.org && q.get('all') !== '1' ? ((await readDoc(orgDocs(me.org).settings, {})).offices || []).filter(o => o.lat) : [];
    if (!offices.length) return send(res, 200, rows, { 'Cache-Control': 'no-store' });
    const LAT = index.fields.indexOf('lat'), LNG = index.fields.indexOf('lng');
    const out = rows.filter(r => offices.some(o => miles(o.lat, o.lng, r[LAT], r[LNG]) <= o.radiusMiles * 1.25));
    return send(res, 200, out, { 'Cache-Control': 'no-store' });
  }
  const t = await cached(`${V}/index.json`, false);
  return t == null ? send(res, 503, { error: 'Market data is still being built. Try again in a few minutes.' }) : send(res, 200, t, { 'Cache-Control': 'private, max-age=600' });
}, { needOrg: false });
