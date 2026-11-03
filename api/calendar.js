// Calendar: meetings scheduled in Wellby plus events synced from Google or Outlook calendars.
import { readDoc, updateDoc } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';
import { docs, saveMeeting, syncOrg } from '../lib/conn.mjs';

export default withUser(async (req, res, me) => {
  const D = docs(me.org);
  if (req.method === 'GET') {
    const [meetings, synced, conn] = await Promise.all([readDoc(D.meetings, []), readDoc(D.synced, {}), readDoc(D.conn, {})]);
    const mail = (conn.accounts || []).filter(a => a.provider === 'google' || a.provider === 'microsoft');
    // Calendars refresh on open when the last sync is over an hour old.
    let synced2 = synced, activity = null;
    const stale = mail.length && (!synced.at || Date.now() - Date.parse(synced.at) > 3600e3);
    if (stale && new URL(req.url, 'http://x').searchParams.get('sync') !== '0') {
      try { await syncOrg(me.org); [synced2, activity] = await Promise.all([readDoc(D.synced, {}), readDoc(D.activity, [])]); } catch (e) { console.error('sync', e.message); }
    }
    return send(res, 200, { meetings, events: synced2.events || [], syncedAt: synced2.at || null, calendars: mail.map(a => ({ provider: a.provider, account: a.account, lastError: a.lastError || '' })), activity });
  }
  const body = await readBody(req);
  if (body.action === 'save') {
    const m = await saveMeeting(me.org, body.meeting || {}, me.email);
    const [meetings, activity, flows] = await Promise.all([readDoc(D.meetings, []), readDoc(D.activity, []), readDoc(D.flows, {})]);
    return send(res, 200, { ok: true, meeting: m, meetings, activity, flows });
  }
  if (body.action === 'remove') {
    const meetings = await updateDoc(D.meetings, [], cur => cur.filter(x => x.id !== body.id));
    return send(res, 200, { ok: true, meetings });
  }
  return send(res, 400, { error: 'Unknown action' });
});
