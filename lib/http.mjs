import { currentUser, clearCookie, kickedCookie } from './auth.mjs';

export async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString();
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  if (res._extraCookie) headers = { ...headers, 'Set-Cookie': [].concat(headers['Set-Cookie'] || [], res._extraCookie) };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

export const KICKED = 'You were signed out because your account signed in on another device. Solo allows one device at a time.';
export function lockedMessage(a) {
  if (a.status === 'needs_card') return 'Pick a plan and add a card to start your free trial.';
  if (a.status === 'over_seats') return a.limit === 1 ? 'This workspace is on Solo, which includes 1 user. Ask your admin to switch to Team to give you access.' : `This workspace's plan covers ${a.limit} users. Ask your admin to add a user in Plan and billing.`;
  return 'Your free trial has ended. Subscribe to keep using Wellby.';
}

// Wraps a handler that requires a logged-in user. Rejects cross-site writes.
export function withUser(handler, { admin = false, superOnly = false, needOrg = true, allowLocked = false } = {}) {
  return async (req, res) => {
    try {
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' });
      }
      const ctx = {};
      const user = await currentUser(req, ctx);
      if (ctx.kicked) return send(res, 401, { error: KICKED, kicked: true }, { 'Set-Cookie': [clearCookie, kickedCookie] });
      if (!user) return send(res, 401, { error: 'Not signed in' });
      if (ctx.setCookie) res._extraCookie = ctx.setCookie;
      if (admin && user.role !== 'admin') return send(res, 403, { error: 'Admins only' });
      if (superOnly && !user.super) return send(res, 403, { error: 'Wellby staff only' });
      if (needOrg && !user.org) return send(res, 409, { error: 'No workspace yet', needWorkspace: true, me: user });
      if (!allowLocked && !user.super && user.access?.locked) return send(res, 402, { error: lockedMessage(user.access), locked: true, me: user });
      return await handler(req, res, user);
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: /Billing|plan is not available/.test(e?.message || '') ? e.message : 'Server error' });
    }
  };
}
