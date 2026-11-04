// Serves the national public-data market: the county index and county shard parts.
// Parts are filtered server-side to providers within the workspace's office radiuses.
import { readRaw, readDoc, orgDocs } from '../lib/store.mjs';
import { send, withUser } from '../lib/http.mjs';

// The newest built market wins: v4 adds CMS volumes (discharges, Medicare patients) and Census seniors.
const VERSIONS = ['market/v4', 'market/v3'];
let V = null;
async function version() {
  if (V) return V;
  for (const v of VERSIONS) if (await cached(`${v}/index.json`, false) != null) return (V = v);
  return (V = VERSIONS.at(-1));
}
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
  await version();
  const part = q.get('part');
  // Wellby sales workspace: the national prospect list (agencies that might buy Wellby), by state or the top ranked.
  const pf = q.get('file') === 'prospects' ? 'index' : q.get('file') === 'top' ? 'top' : q.get('file') === 'contacts' ? 'contacts' : /^[A-Z]{2}-\d{1,2}$/.test(q.get('pp') || '') ? q.get('pp') : null;
  if (pf) {
    if (!me.orgSales && !me.super) return send(res, 403, { error: 'Prospects are for the Wellby sales workspace.' });
    const t = await cached(`market/v3/p/${pf}.json`, false);
    return t == null ? send(res, 404, { error: 'Not built yet' }) : send(res, 200, t, { 'Cache-Control': 'private, max-age=3600' });
  }
  if (q.get('file') === 'seniors') { const t = await cached(`${V}/seniors.json`, false); return t == null ? send(res, 404, { error: 'Not built yet' }) : send(res, 200, t, { 'Cache-Control': 'private, max-age=86400' }); }
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
