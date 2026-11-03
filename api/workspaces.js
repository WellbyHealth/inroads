// Wellby staff only: create and switch between customer / demo workspaces.
import { loadUsers, loadOrgs, slug } from '../lib/auth.mjs';
import { writeDoc, GLOBAL, orgDocs } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';

export default withUser(async (req, res, me) => {
  const orgs = await loadOrgs();
  if (req.method === 'GET') return send(res, 200, { orgs, active: me.org });
  const body = await readBody(req);
  const users = await loadUsers();
  const self = users.find(u => u.email === me.email);

  if (body.action === 'create') {
    const name = String(body.name || '').trim().slice(0, 100);
    if (!name) return send(res, 400, { error: 'Name the workspace.' });
    let id = slug(name); while (orgs.some(o => o.id === id)) id = `${slug(name)}-${Math.random().toString(36).slice(2, 5)}`;
    orgs.push({ id, name, website: String(body.website || '').slice(0, 200), demo: body.demo !== false, created: new Date().toISOString(), by: me.email });
    await writeDoc(GLOBAL.orgs, orgs);
    await writeDoc(orgDocs(id).settings, { agencyName: name, website: String(body.website || '').slice(0, 200), offices: [] });
    self.activeOrg = id; await writeDoc(GLOBAL.users, users);
    return send(res, 200, { ok: true, orgs, active: id });
  }
  if (body.action === 'switch') {
    if (!orgs.some(o => o.id === body.id)) return send(res, 404, { error: 'No such workspace' });
    self.activeOrg = body.id; await writeDoc(GLOBAL.users, users);
    return send(res, 200, { ok: true, active: body.id });
  }
  if (body.action === 'rename') {
    const o = orgs.find(x => x.id === body.id); if (!o) return send(res, 404, { error: 'No such workspace' });
    o.name = String(body.name || o.name).slice(0, 100); if ('demo' in body) o.demo = !!body.demo;
    await writeDoc(GLOBAL.orgs, orgs);
    return send(res, 200, { ok: true, orgs });
  }
  return send(res, 400, { error: 'Unknown action' });
}, { superOnly: true, needOrg: false });
