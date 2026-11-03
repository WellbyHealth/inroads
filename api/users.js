import crypto from 'node:crypto';
import { loadUsers, loadOrgs, hashPassword, publicUser } from '../lib/auth.mjs';
import { seatOrder, seatMessage, seatLimit } from '../lib/plans.mjs';
import { writeDoc, GLOBAL } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';

// Team management, scoped to the current workspace.
export default withUser(async (req, res, me) => {
  const users = await loadUsers();
  const mine = () => users.filter(u => u.org === me.org && !u.super).map(publicUser);
  const org = (await loadOrgs()).find(o => o.id === me.org);
  const full = () => !me.super && seatMessage(org, seatOrder(users, me.org).length);
  if (req.method === 'GET') return send(res, 200, { users: mine(), limit: seatLimit(org), plan: org?.billing?.planKey || '' });
  const body = await readBody(req);
  const email = String(body.email || '').toLowerCase().trim();
  const temp = () => crypto.randomBytes(9).toString('base64url');

  if (body.action === 'invite') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email.' });
    if (users.some(u => u.email === email)) return send(res, 400, { error: 'That person already has an account.' });
    if (full()) return send(res, 400, { error: full(), seats: true });
    const pw = temp();
    users.push({ email, name: String(body.name || email.split('@')[0]).slice(0, 80), role: body.role === 'admin' ? 'admin' : 'marketer', org: me.org, ...hashPassword(pw), mustChange: true, created: new Date().toISOString() });
    await writeDoc(GLOBAL.users, users);
    return send(res, 200, { ok: true, tempPassword: pw, users: mine() });
  }
  const u = users.find(x => x.email === email && (x.org === me.org || x.email === me.email));
  if (!u) return send(res, 404, { error: 'No such user in this workspace' });
  if (body.action === 'reset') {
    const pw = temp();
    Object.assign(u, hashPassword(pw), { mustChange: true });
    await writeDoc(GLOBAL.users, users);
    return send(res, 200, { ok: true, tempPassword: pw, users: mine() });
  }
  if (body.action === 'toggle') {
    if (u.email === me.email) return send(res, 400, { error: "You can't disable yourself." });
    if (u.disabled && full()) return send(res, 400, { error: full(), seats: true });
    u.disabled = !u.disabled;
    await writeDoc(GLOBAL.users, users);
    return send(res, 200, { ok: true, users: mine() });
  }
  return send(res, 400, { error: 'Unknown action' });
}, { admin: true });
