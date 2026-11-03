import { loadUsers, loadOrgs, checkPassword, hashPassword, startSession, clearCookie, kickedCookie, currentUser, slug, TRIAL_DAYS } from '../lib/auth.mjs';
import { KICKED } from '../lib/http.mjs';
import { writeDoc, GLOBAL, orgDocs } from '../lib/store.mjs';
import { readBody, send } from '../lib/http.mjs';
import { CARE, careOf } from '../lib/care.mjs';

const attempts = new Map(); // best-effort per-instance throttle

export default async function handler(req, res) {
  try {
    const action = new URL(req.url, 'http://x').searchParams.get('action');
    if (req.method === 'GET' && action === 'me') {
      const ctx = {}, u = await currentUser(req, ctx);
      if (ctx.kicked) return send(res, 401, { error: KICKED, kicked: true }, { 'Set-Cookie': [clearCookie, kickedCookie] });
      return u ? send(res, 200, { user: u }, ctx.setCookie ? { 'Set-Cookie': ctx.setCookie } : {}) : send(res, 401, { error: 'Not signed in' });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' });
    const body = await readBody(req);

    if (action === 'login') {
      const email = String(body.email || '').toLowerCase().trim();
      const key = `${email}|${req.headers['x-forwarded-for'] || ''}`;
      const a = attempts.get(key) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      const users = await loadUsers();
      const u = users.find(x => x.email === email && !x.disabled);
      if (!u || !checkPassword(String(body.password || ''), u)) {
        a.n++; attempts.set(key, a);
        return send(res, 401, { error: 'Email or password is incorrect.' });
      }
      attempts.delete(key);
      return send(res, 200, { ok: true, mustChange: !!u.mustChange }, { 'Set-Cookie': [await startSession(users, u), 'wb_kicked=; Path=/; Secure; SameSite=Lax; Max-Age=0'] });
    }
    if (action === 'signup') {
      // Self-serve: create an agency workspace on a free trial, with the signer as its admin.
      if (body.company_url) return send(res, 400, { error: 'Sign up failed.' }); // honeypot
      const ipKey = `signup|${req.headers['x-forwarded-for'] || ''}`;
      const a = attempts.get(ipKey) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 60 * 60e3) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 5) return send(res, 429, { error: 'Too many sign-ups from this network. Try again later.' });
      const email = String(body.email || '').toLowerCase().trim().slice(0, 200);
      const name = String(body.name || '').trim().slice(0, 100);
      const agency = String(body.agency || '').trim().slice(0, 100);
      const website = String(body.website || '').trim().slice(0, 200);
      const pw = String(body.password || '');
      const careType = careOf(body.careType);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
      if (!name || !agency) return send(res, 400, { error: 'Add your name and your agency name.' });
      if (pw.length < 10) return send(res, 400, { error: 'Use a password of at least 10 characters.' });
      const users = await loadUsers();
      if (users.some(u => u.email === email)) return send(res, 409, { error: 'An account with this email already exists. Sign in instead.' });
      const orgs = await loadOrgs();
      let id = slug(agency); while (orgs.some(o => o.id === id)) id = `${slug(agency)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();
      const cardRequired = !!process.env.STRIPE_SECRET_KEY && process.env.BILLING_ON === '1'; // card at sign-up once billing is switched on
      orgs.push({ id, name: agency, website, demo: false, selfServe: true, cardRequired, created: now.toISOString(), by: email, trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 864e5).toISOString(), billing: { status: 'trial' } });
      await writeDoc(GLOBAL.orgs, orgs);
      await writeDoc(orgDocs(id).settings, { agencyName: agency, senderName: name, website, careType, services: CARE[careType].services, offices: [] });
      const nu = { email, name, role: 'admin', super: false, org: id, ...hashPassword(pw), mustChange: false, created: now.toISOString(), selfServe: true };
      users.push(nu);
      const cookie = await startSession(users, nu);
      a.n++; attempts.set(ipKey, a);
      return send(res, 200, { ok: true, next: cardRequired ? '/#plan' : '/#welcome' }, { 'Set-Cookie': cookie });
    }
    if (action === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });

    if (action === 'password') {
      const me = await currentUser(req);
      if (!me) return send(res, 401, { error: 'Not signed in' });
      // (A password change keeps this device signed in and does not rotate the session.)
      const pw = String(body.newPassword || '');
      if (pw.length < 10) return send(res, 400, { error: 'Use at least 10 characters.' });
      const users = await loadUsers();
      const u = users.find(x => x.email === me.email);
      if (!checkPassword(String(body.currentPassword || ''), u)) return send(res, 400, { error: 'Current password is incorrect.' });
      Object.assign(u, hashPassword(pw), { mustChange: false });
      await writeDoc(GLOBAL.users, users);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
}
