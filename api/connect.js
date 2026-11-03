// Connections: OAuth for Google, Microsoft 365, HubSpot and Salesforce; sync; CRM contacts; MCP keys for AI assistants.
import { readDoc, updateDoc } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';
import { docs, PROVIDERS, configured, authUrl, exchange, seal, signState, verifyState, syncOrg, pushCrm, rid, clip, hashKey } from '../lib/conn.mjs';

const redirect = (res, to) => { res.statusCode = 302; res.setHeader('Location', to); res.setHeader('Cache-Control', 'no-store'); res.end(); };
const pub = a => ({ id: a.id, provider: a.provider, account: a.account, by: a.by, connectedAt: a.connectedAt, lastSync: a.lastSync || null, lastError: a.lastError || '' });

export default withUser(async (req, res, me) => {
  const D = docs(me.org), q = new URL(req.url, 'http://x').searchParams, host = req.headers['x-forwarded-host'] || req.headers.host;
  const admin = me.role === 'admin';
  if (req.method === 'GET') {
    const action = q.get('action');
    if (action === 'start') {
      const p = q.get('provider');
      if (!PROVIDERS[p]) return send(res, 400, { error: 'Unknown provider' });
      if (!configured(p)) return redirect(res, `/#connections/${p}-setup`);
      if (PROVIDERS[p].kind === 'crm' && !admin) return redirect(res, '/#connections/admin-only');
      return redirect(res, authUrl(p, host, signState({ p, o: me.org, e: me.email, n: rid() })));
    }
    if (action === 'callback') {
      const st = verifyState(q.get('state'));
      if (!st || st.o !== me.org || st.e !== me.email) return redirect(res, '/#connections/error');
      if (q.get('error') || !q.get('code')) return redirect(res, '/#connections/declined');
      try {
        const { tok, account } = await exchange(st.p, q.get('code'), host);
        let accId;
        await updateDoc(D.conn, {}, cur => {
          cur.accounts = cur.accounts || [];
          const same = cur.accounts.find(a => a.provider === st.p && a.account === account && (PROVIDERS[st.p].kind === 'crm' || a.by === me.email));
          const a = same || { id: rid(), provider: st.p, by: me.email, connectedAt: new Date().toISOString() };
          Object.assign(a, { account, enc: seal(tok), lastError: '' });
          if (!same) cur.accounts.push(a);
          accId = a.id; return cur;
        });
        try { await syncOrg(me.org, accId); } catch (e) { console.error('first sync', e.message); }
        return redirect(res, `/#connections/connected-${st.p}`);
      } catch (e) { console.error('oauth', e.message); return redirect(res, '/#connections/error'); }
    }
    const conn = await readDoc(D.conn, {});
    const synced = await readDoc(D.synced, {});
    return send(res, 200, {
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, kind: p.kind, configured: configured(id), accounts: (conn.accounts || []).filter(a => a.provider === id).map(pub) })),
      keys: (conn.keys || []).map(k => ({ id: k.id, name: k.name, prefix: k.prefix, by: k.by, created: k.created, lastUsed: k.lastUsed || null })),
      mcpUrl: `https://${host}/api/mcp`, redirectUri: `https://${host}/api/oauth/callback`, syncedAt: synced.at || null, crmCount: (synced.crm || []).length, emr: conn.emr || [],
    });
  }
  const b = await readBody(req);
  switch (b.action) {
    case 'sync': {
      const results = await syncOrg(me.org);
      const [activity, synced] = await Promise.all([readDoc(D.activity, []), readDoc(D.synced, {})]);
      return send(res, 200, { ok: true, results, activity, syncedAt: synced.at });
    }
    case 'disconnect': {
      const conn = await readDoc(D.conn, {});
      const a = (conn.accounts || []).find(x => x.id === b.id);
      if (!a) return send(res, 404, { error: 'Not found' });
      if (a.by !== me.email && !admin) return send(res, 403, { error: 'Only the person who connected it, or an admin, can disconnect it' });
      await updateDoc(D.conn, {}, cur => { cur.accounts = (cur.accounts || []).filter(x => x.id !== b.id); return cur; });
      await updateDoc(D.synced, {}, cur => { cur.events = (cur.events || []).filter(e => e.acc !== b.id); cur.crm = (cur.crm || []).filter(e => e.acc !== b.id); return cur; });
      return send(res, 200, { ok: true });
    }
    case 'crm': {
      const synced = await readDoc(D.synced, {});
      return send(res, 200, { crm: synced.crm || [] });
    }
    case 'pushCrm': {
      if (!admin) return send(res, 403, { error: 'Admins only' });
      const conn = await readDoc(D.conn, {});
      const a = (conn.accounts || []).find(x => x.id === b.id && PROVIDERS[x.provider]?.kind === 'crm');
      if (!a) return send(res, 404, { error: 'Connect a CRM first' });
      const n = await pushCrm(me.org, a, (b.contacts || []).map(c => ({ name: clip(c.name, 120), email: clip(c.email, 160), phone: clip(c.phone, 40), role: clip(c.role, 120), org: clip(c.org, 160) })));
      return send(res, 200, { ok: true, created: n });
    }
    case 'emrLog': {
      // Records an EMR import (vendor, file, rows) for the Connections page. Counts only.
      const emr = await updateDoc(D.conn, {}, cur => { cur.emr = [...(cur.emr || []), { vendor: clip(b.vendor, 40), file: clip(b.file, 120), rows: Math.max(0, +b.rows || 0), at: new Date().toISOString(), by: me.email }].slice(-30); return cur; });
      return send(res, 200, { ok: true, emr: emr.emr });
    }
    case 'createKey': {
      if (!admin) return send(res, 403, { error: 'Admins only' });
      const secret = rid(24), key = `wk_${me.org}.${secret}`;
      const k = { id: rid(), name: clip(b.name, 60) || 'AI assistant', prefix: secret.slice(0, 6), hash: hashKey(key), by: me.email, created: new Date().toISOString() };
      await updateDoc(D.conn, {}, cur => { cur.keys = [...(cur.keys || []), k].slice(-20); return cur; });
      return send(res, 200, { ok: true, key, id: k.id });
    }
    case 'revokeKey': {
      if (!admin) return send(res, 403, { error: 'Admins only' });
      await updateDoc(D.conn, {}, cur => { cur.keys = (cur.keys || []).filter(k => k.id !== b.id); return cur; });
      return send(res, 200, { ok: true });
    }
    default: return send(res, 400, { error: 'Unknown action' });
  }
});
