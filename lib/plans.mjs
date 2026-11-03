// Plans, shared by billing, sign-in and team management. Mirrors wellbyinroads.com/pricing.
//   Solo: $149/mo or $1,490/yr, 1 user, one device at a time.
//   Team: $249/mo or $2,490/yr with 3 users included, extra users $79/mo or $790/yr each, up to 10 users.
//   Enterprise (10+ users): sales-led, no self-serve checkout.
export const PLANS = {
  solo: { name: 'Solo', monthly: 149, annual: 1490, included: 1, max: 1 },
  team: { name: 'Team', monthly: 249, annual: 2490, included: 3, max: 10, extraMonthly: 79, extraAnnual: 790 },
};
export const DEFAULT_PLAN = 'team';
export const ENTERPRISE_EMAIL = 'team@wellbyhealth.com';
// Old site links and subscriptions from the earlier per-user plans.
const LEGACY = { insight: 'solo', growth: 'team', network: 'team' };
export const planCode = p => PLANS[p] ? p : LEGACY[p] || '';

// How many active users a workspace's plan covers (null = no limit: demo, staff-managed, no plan yet, legacy plans).
export function seatLimit(o) {
  if (!o || o.demo || !o.selfServe) return null;
  const b = o.billing || {};
  if (!['trialing', 'active', 'past_due'].includes(b.status)) return null;
  if (b.planKey === 'solo') return 1;
  if (b.planKey === 'team') return Math.max(3, Math.min(10, b.seats || 3));
  return null;
}
export const isSolo = o => !!o && !o.demo && o.billing?.planKey === 'solo' && ['trialing', 'active', 'past_due'].includes(o.billing?.status);

// Active (enabled, non-staff) users of a workspace, in seat order: admins first, then oldest first.
export function seatOrder(users, orgId) {
  return users.filter(u => u.org === orgId && !u.super && !u.disabled)
    .sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || String(a.created || '').localeCompare(String(b.created || '')));
}

export function seatMessage(o, n) {
  const lim = seatLimit(o);
  if (lim == null || n < lim) return '';
  if (o.billing.planKey === 'solo') return 'Solo includes 1 user. Switch to Team in Plan and billing to add teammates (3 users included, $249/mo).';
  if (lim >= 10) return `Team plans go up to 10 users. For more, email ${ENTERPRISE_EMAIL} about Enterprise.`;
  return `Your Team plan covers ${lim} users. Add a user in Plan and billing ($79/mo each, up to 10).`;
}
