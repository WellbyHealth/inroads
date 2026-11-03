// Tiny JSON document store on a private Vercel Blob store.
// Local development: set LOCAL_STORE_DIR to use plain files instead.
import { get, put } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL = process.env.LOCAL_STORE_DIR;

export async function readRaw(p) {
  if (LOCAL) { try { return fs.readFileSync(path.join(LOCAL, p), 'utf8'); } catch { return null; } }
  try {
    const r = await get(p, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return await new Response(r.stream).text();
  } catch (e) {
    if (String(e?.message || '').match(/not.?found|404/i)) return null;
    console.error('readRaw', p, e?.message);
    throw e;
  }
}
export async function readDoc(p, fallback) {
  const t = await readRaw(p);
  return t == null ? fallback : JSON.parse(t);
}
export async function writeRaw(p, text, cache = 60) {
  if (LOCAL) {
    fs.mkdirSync(path.dirname(path.join(LOCAL, p)), { recursive: true });
    fs.writeFileSync(path.join(LOCAL, p), text);
    return;
  }
  await put(p, text, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: cache });
}
export const writeDoc = (p, data) => writeRaw(p, JSON.stringify(data));

// Read-modify-write helper.
export async function updateDoc(p, fallback, fn) {
  const cur = await readDoc(p, fallback);
  const next = (await fn(cur)) ?? cur;
  await writeDoc(p, next);
  return next;
}

export const GLOBAL = { users: 'users.json', orgs: 'orgs.json' };
export const orgDocs = org => ({
  settings: `orgs/${org}/settings.json`,
  referrals: `orgs/${org}/referrals.json`,
  activity: `orgs/${org}/activity.json`,
  contacts: `orgs/${org}/contacts.json`,
  flows: `orgs/${org}/flows.json`,
});
