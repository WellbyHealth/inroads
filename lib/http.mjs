import { currentUser } from './auth.mjs';

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
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

// Wraps a handler that requires a logged-in user. Rejects cross-site writes.
export function withUser(handler, { admin = false, superOnly = false, needOrg = true, allowLocked = false } = {}) {
  return async (req, res) => {
    try {
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' });
      }
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: 'Not signed in' });
      if (admin && user.role !== 'admin') return send(res, 403, { error: 'Admins only' });
      if (superOnly && !user.super) return send(res, 403, { error: 'Wellby staff only' });
      if (needOrg && !user.org) return send(res, 409, { error: 'No workspace yet', needWorkspace: true, me: user });
      if (!allowLocked && !user.super && user.access?.locked) return send(res, 402, { error: user.access.status === 'needs_card' ? 'Pick a plan and add a card to start your free trial.' : 'Your free trial has ended. Subscribe to keep using Wellby.', locked: true, me: user });
      return await handler(req, res, user);
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: /Billing|plan is not available/.test(e?.message || '') ? e.message : 'Server error' });
    }
  };
}
