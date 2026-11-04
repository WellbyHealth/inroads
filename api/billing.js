// Stripe billing (pricing v5, per location): Solo ($199/mo, 1 user, 1 location) and Team ($499/mo for 1 location and
// 5 users, +$149 per extra location with 3 more users each, up to 5 locations), monthly or annual (10x), with a 14-day
// free trial that collects a card at sign-up and charges nothing until the trial ends. Founding code FOUNDING40.
//   POST {action:'checkout', plan, interval, locations} → Stripe Checkout URL (subscription mode)
//   POST {action:'change', plan, interval, locations}   → switch plan, locations or billing period on the live subscription
//   POST {action:'portal'}                              → Stripe customer portal URL (card, invoices, cancel)
//   GET                                                 → access + billing summary for the workspace
//   POST ?webhook=1                                     → signed Stripe webhook that keeps the workspace in sync
// Env: STRIPE_SECRET_KEY (required to switch billing on), STRIPE_WEBHOOK_SECRET. Prices are found by lookup key, so no
// price IDs live in env: v5 wellby_solo_v5_*, wellby_team_v5_*, wellby_team_location_* (_monthly | _annual). v4 keys
// (wellby_solo_*, wellby_team_*, wellby_team_extra_*) are still read so older subscribers keep their price until they
// change plans. STRIPE_API_BASE is for local tests only.
import crypto from 'node:crypto';
import { loadOrgs, loadUsers, orgAccess } from '../lib/auth.mjs';
import { PLANS, DEFAULT_PLAN, ENTERPRISE_EMAIL, planCode, seatOrder, teamUsers, clampLocations, locationsForUsers } from '../lib/plans.mjs';
import { writeDoc, readDoc, GLOBAL, orgDocs } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';

const KEY = () => process.env.STRIPE_SECRET_KEY || '';
// Billing is switched on only when the owner also sets BILLING_ON=1, so a key added by an integration can't turn it on by accident.
export const BILLING_ON = () => !!KEY() && process.env.BILLING_ON === '1';
// Local tests only: on Vercel the key is only ever sent to Stripe itself.
const API = () => (!process.env.VERCEL && process.env.STRIPE_API_BASE) || 'https://api.stripe.com';
export { PLANS };
const per = interval => interval === 'year' ? 'annual' : 'monthly';
const LEGACY_NAMES = { insight: 'Insight', growth: 'Growth', network: 'Network' };
const lk = item => item?.price?.lookup_key || '';
const isExtra = item => /^wellby_team_extra_/.test(lk(item));        // v4: extra user
const isLocation = item => /^wellby_team_location_/.test(lk(item));   // v5: extra location
const isAddon = item => isExtra(item) || isLocation(item);
const baseKey = (plan, interval) => `wellby_${plan}_v5_${per(interval)}`;
// Locations asked for: ?locations=N, or the fewest that cover an old ?users=N link. Solo is always 1.
const locationsFor = (plan, body) => plan === 'solo' ? 1 : body.locations != null ? clampLocations(body.locations) : body.seats != null ? locationsForUsers(body.seats) : 1;

function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join('&');
}
async function stripe(path, params, method = 'POST') {
  const r = await fetch(`${API()}/v1/${path}${method === 'GET' && params ? '?' + form(params) : ''}`, {
    method, headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(params || {}),
  });
  const j = await r.json();
  if (!r.ok) { console.error('stripe', path, r.status, j.error?.type, j.error?.code); throw new Error('Billing is temporarily unavailable. Please try again or contact Wellby.'); }
  return j;
}
const priceCache = new Map();
async function priceFor(k) {
  if (priceCache.has(k)) return priceCache.get(k);
  const r = await stripe('prices', { lookup_keys: { 0: k }, active: 'true', limit: 1 }, 'GET');
  const p = r.data?.[0];
  if (!p) { console.error('stripe: no price for lookup key', k); throw new Error('That plan is not available right now. Please contact Wellby.'); }
  priceCache.set(k, p.id);
  return p.id;
}

// Copy a Stripe subscription onto the workspace record.
// Seats and locations are worked out from the items, never from a quantity a customer could edit:
//   Solo: 1 user, 1 location.  Team v5: 5 + 3 users per extra location, 1 + extra locations (max 5).
//   Team v4 (grandfathered): 3 + extra users (max 10), 1 location.
function applySub(o, sub) {
  const items = sub.items?.data || [];
  const item = items.find(i => !isAddon(i)) || items[0] || {}, price = item.price || {};
  const extra = items.find(isExtra), loc = items.find(isLocation);
  const key = lk(item), version = /_v5_/.test(key) ? 5 : key ? 4 : (o.billing?.version || 5);
  const raw = key.replace(/^wellby_|_v5|_(monthly|annual)$/g, '') || price.metadata?.plan || o.billing?.planKey || '';
  const plan = PLANS[raw] ? raw : '';
  const ts = s => s ? new Date(s * 1000).toISOString() : null;
  const locations = plan === 'team' && version === 5 ? clampLocations(1 + (loc?.quantity || 0)) : plan ? 1 : null;
  const seats = plan === 'solo' ? 1 : plan === 'team' ? (version === 5 ? teamUsers(locations) : Math.min(10, 3 + (extra?.quantity || 0))) : item.quantity || sub.quantity || null;
  o.billing = { ...(o.billing || {}), customerId: sub.customer, subscriptionId: sub.id, status: sub.status,
    planKey: plan, version, legacyPlan: plan ? '' : raw, plan: PLANS[plan]?.name || LEGACY_NAMES[raw] || price.nickname || '', interval: price.recurring?.interval || '',
    seats, locations, unitAmount: price.unit_amount != null ? price.unit_amount / 100 : o.billing?.unitAmount ?? null, trialEnd: ts(sub.trial_end),
    periodEnd: ts(sub.current_period_end || item.current_period_end) || o.billing?.periodEnd || null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end, updated: new Date().toISOString() };
}
async function syncOrg(orgs, o) {
  if (!KEY() || !o.billing?.customerId) return false;
  const subs = await stripe('subscriptions', { customer: o.billing.customerId, status: 'all', limit: 5 }, 'GET');
  const sub = subs.data.sort((a, b) => b.created - a.created)[0];
  if (!sub) return false;
  applySub(o, sub); await writeDoc(GLOBAL.orgs, orgs); return true;
}

async function webhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return send(res, 503, { error: 'Webhook not configured' });
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const sig = String(req.headers['stripe-signature'] || '');
  const t = (sig.match(/(?:^|,)t=(\d+)/) || [])[1];
  const v1s = [...sig.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map(m => m[1]);
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const ok = t && Math.abs(Date.now() / 1000 - +t) < 300 && v1s.some(v => v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want)));
  if (!ok) return send(res, 400, { error: 'Bad signature' });
  const evt = JSON.parse(raw), obj = evt.data?.object || {};
  const orgs = await loadOrgs();
  const find = (orgId, customer) => orgs.find(o => o.id === orgId) || orgs.find(o => customer && o.billing?.customerId === customer);
  if (evt.type === 'checkout.session.completed') {
    const o = find(obj.client_reference_id || obj.metadata?.org, obj.customer);
    if (o && obj.subscription && KEY()) { applySub(o, await stripe(`subscriptions/${obj.subscription}`, null, 'GET')); await writeDoc(GLOBAL.orgs, orgs); }
  } else if (evt.type.startsWith('customer.subscription.')) {
    const o = find(obj.metadata?.org, obj.customer);
    if (o) {
      applySub(o, obj);
      // Stripe sends this about 3 days before a trial ends; the app shows a reminder banner from it.
      if (evt.type === 'customer.subscription.trial_will_end') o.billing.trialReminderAt = new Date().toISOString();
      await writeDoc(GLOBAL.orgs, orgs);
    }
  } else if (evt.type === 'invoice.payment_failed' || evt.type === 'invoice.paid') {
    const o = find(obj.subscription_details?.metadata?.org || obj.metadata?.org, obj.customer);
    if (o) { try { await syncOrg(orgs, o); } catch (e) { console.error('sync', e.message); } }
  }
  return send(res, 200, { received: true });
}

function summary(o, users, offices = null) {
  const b = o.billing || {};
  return { plan: b.planKey || '', planName: b.plan || '', interval: b.interval || '', seats: b.seats || null, locations: b.locations || null, version: b.version || null, users, offices,
    status: b.status || '', trialEnd: b.trialEnd || null, periodEnd: b.periodEnd || null, cancelAtPeriodEnd: !!b.cancelAtPeriodEnd,
    trialReminder: !!b.trialReminderAt, hasCustomer: !!b.customerId, cardRequired: !!o.cardRequired, trialEndsAt: o.trialEndsAt || null };
}

const handler = withUser(async (req, res, me) => {
  const orgs = await loadOrgs();
  const o = orgs.find(x => x.id === me.org);
  if (!o) return send(res, 404, { error: 'No workspace' });
  const configured = BILLING_ON();
  const users = seatOrder(await loadUsers(), o.id).length || 1;
  if (req.method === 'GET') {
    if (configured && o.billing?.customerId) { try { await syncOrg(orgs, o); } catch (e) { console.error('sync', e.message); } }
    const offices = ((await readDoc(orgDocs(o.id).settings, {}))?.offices || []).length;
    return send(res, 200, { access: orgAccess(o), configured, billing: summary(o, users, offices), plans: PLANS, defaultPlan: DEFAULT_PLAN, enterpriseEmail: ENTERPRISE_EMAIL });
  }
  if (me.role !== 'admin') return send(res, 403, { error: 'Only an admin can manage billing.' });
  if (!configured) return send(res, 503, { error: "Online billing isn't switched on yet. Contact Wellby to subscribe." });
  const body = await readBody(req);
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  if (body.action === 'checkout') {
    if (['trialing', 'active', 'past_due'].includes(o.billing?.status) && o.billing?.subscriptionId) return send(res, 400, { error: 'You already have a plan. Change it in Settings → Plan and billing.' });
    const plan = planCode(body.plan) || DEFAULT_PLAN, interval = body.interval === 'year' ? 'year' : 'month';
    const locations = locationsFor(plan, body), seats = plan === 'solo' ? 1 : teamUsers(locations);
    if (plan === 'solo' && users > 1) return send(res, 400, { error: `Solo includes 1 user and this workspace has ${users}. Pick Team, or disable the other users first.` });
    if (seats < users) return send(res, 400, { error: `${users} people use this workspace. Team with ${locations} location${locations === 1 ? '' : 's'} covers ${seats}; add a location.` });
    if (!o.billing?.customerId) {
      const c = await stripe('customers', { email: me.email, name: o.name, metadata: { org: o.id } });
      o.billing = { ...(o.billing || {}), customerId: c.id }; await writeDoc(GLOBAL.orgs, orgs);
    }
    // Free trial: what's left of the workspace's 14 days, only if it has never had a subscription.
    const left = o.trialEndsAt ? Math.ceil((Date.parse(o.trialEndsAt) - Date.now()) / 864e5) : 0;
    const trialDays = !o.billing?.subscriptionId && left >= 1 ? Math.min(14, left) : 0;
    const s = await stripe('checkout/sessions', {
      mode: 'subscription', customer: o.billing.customerId, client_reference_id: o.id, allow_promotion_codes: 'true',
      line_items: { 0: { price: await priceFor(baseKey(plan, interval)), quantity: 1 },
        ...(locations > 1 ? { 1: { price: await priceFor(`wellby_team_location_${per(interval)}`), quantity: locations - 1 } } : {}) },
      payment_method_collection: 'always',
      metadata: { org: o.id, plan, locations },
      subscription_data: { metadata: { org: o.id, plan, version: 5 }, ...(trialDays ? { trial_period_days: trialDays, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}) },
      success_url: `${origin}/#welcome/started`, cancel_url: `${origin}/#plan`,
    });
    return send(res, 200, { url: s.url, trialDays, seats, locations, plan, interval });
  }
  if (body.action === 'change') {
    const id = o.billing?.subscriptionId;
    if (!id || !['trialing', 'active', 'past_due'].includes(o.billing?.status)) return send(res, 400, { error: 'Pick a plan first.' });
    const plan = planCode(body.plan) || o.billing.planKey || DEFAULT_PLAN, interval = body.interval === 'year' ? 'year' : 'month';
    const locations = locationsFor(plan, body), seats = plan === 'solo' ? 1 : teamUsers(locations);
    if (plan === 'solo' && users > 1) return send(res, 400, { error: `Solo includes 1 user. Disable the other ${users - 1} user${users === 2 ? '' : 's'} in Settings → Team first.` });
    if (seats < users) return send(res, 400, { error: `${users} people use this workspace. Team with ${locations} location${locations === 1 ? '' : 's'} covers ${seats}. Add a location, or disable someone in Settings → Team first.` });
    // Any change moves the subscription onto current (v5) prices; until then, older subscribers keep theirs.
    const sub = await stripe(`subscriptions/${id}`, null, 'GET');
    const all = sub.items?.data || [], base = all.find(i => !isAddon(i)) || all[0], loc = all.find(isLocation);
    const items = {}; let n = 0;
    items[n++] = { id: base.id, price: await priceFor(baseKey(plan, interval)), quantity: 1 };
    if (locations > 1) items[n++] = { ...(loc ? { id: loc.id } : {}), price: await priceFor(`wellby_team_location_${per(interval)}`), quantity: locations - 1 };
    else if (loc) items[n++] = { id: loc.id, deleted: 'true' };
    for (const i of all) if (i !== base && i !== loc) items[n++] = { id: i.id, deleted: 'true' };
    const upd = await stripe(`subscriptions/${id}`, { items, proration_behavior: 'create_prorations', metadata: { org: o.id, plan, version: 5 } });
    applySub(o, upd); await writeDoc(GLOBAL.orgs, orgs);
    return send(res, 200, { ok: true, billing: summary(o, users), access: orgAccess(o) });
  }
  if (body.action === 'portal') {
    if (!o.billing?.customerId) return send(res, 400, { error: 'No billing account yet. Pick a plan first.' });
    const s = await stripe('billing_portal/sessions', { customer: o.billing.customerId, return_url: `${origin}/#settings/billing` });
    return send(res, 200, { url: s.url });
  }
  return send(res, 400, { error: 'Unknown action' });
}, { allowLocked: true });

export default async function (req, res) {
  if (req.method === 'POST' && new URL(req.url, 'http://x').searchParams.get('webhook') === '1') {
    try { return await webhook(req, res); } catch (e) { console.error(e); return send(res, 500, { error: 'Webhook error' }); }
  }
  return handler(req, res);
}
