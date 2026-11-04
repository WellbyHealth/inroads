// Plans, shared by billing, sign-in and team management. Mirrors wellbyinroads.com/pricing (v5, per location).
//   Solo: $199/mo or $1,990/yr. 1 user, 1 location, one device at a time.
//   Team: $499/mo or $4,990/yr for 1 location and up to 5 users. Each extra location is $149/mo or $1,490/yr
//         and adds 3 users, up to 5 locations (17 users).
//   Enterprise (6+ locations or 20+ users): sales-led, no self-serve checkout.
// v4 subscribers (Solo $149, Team $249 + $79 per user) keep their prices until they change plans.
export const PLANS = {
  solo: { name: 'Solo', monthly: 199, annual: 1990, users: 1, locations: 1 },
  team: { name: 'Team', monthly: 499, annual: 4990, baseUsers: 5, usersPerLocation: 3, maxLocations: 5, locationMonthly: 149, locationAnnual: 1490 },
};
export const DEFAULT_PLAN = 'team';
export const ENTERPRISE_EMAIL = 'team@wellbyhealth.com';
export const teamUsers = locations => PLANS.team.baseUsers + PLANS.team.usersPerLocation * (Math.max(1, locations) - 1);
export const clampLocations = n => Math.max(1, Math.min(PLANS.team.maxLocations, Math.round(+n || 1)));
// Fewest locations whose user allowance covers n users (for old ?users= links).
export const locationsForUsers = n => clampLocations(Math.ceil((Math.max(1, +n || 1) - PLANS.team.baseUsers) / PLANS.team.usersPerLocation) + 1);
// Old site links and subscriptions from the earlier plans.
const LEGACY = { insight: 'solo', growth: 'team', network: 'team' };
export const planCode = p => PLANS[p] ? p : LEGACY[p] || '';
const LIVE = ['trialing', 'active', 'past_due'];

// How many active users a workspace's plan covers (null = no limit: demo, staff-managed, no plan yet, older plans).
// billing.seats is worked out from the subscription's items (see applySub in api/billing.js).
export function seatLimit(o) {
  if (!o || o.demo || !o.selfServe) return null;
  const b = o.billing || {};
  if (!LIVE.includes(b.status)) return null;
  if (b.planKey === 'solo') return 1;
  if (b.planKey === 'team') return Math.max(3, b.seats || PLANS.team.baseUsers);
  return null;
}
export const isSolo = o => !!o && !o.demo && o.billing?.planKey === 'solo' && LIVE.includes(o.billing?.status);

// Active (enabled, non-staff) users of a workspace, in seat order: admins first, then oldest first.
export function seatOrder(users, orgId) {
  return users.filter(u => u.org === orgId && !u.super && !u.disabled)
    .sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || String(a.created || '').localeCompare(String(b.created || '')));
}

export function seatMessage(o, n) {
  const lim = seatLimit(o);
  if (lim == null || n < lim) return '';
  const b = o.billing;
  if (b.planKey === 'solo') return 'Solo includes 1 user. Switch to Team in Plan and billing to add teammates (5 users included, $499/mo).';
  const loc = b.locations || 1;
  if (loc >= PLANS.team.maxLocations) return `Team covers up to ${lim} users across ${loc} locations. For more, email ${ENTERPRISE_EMAIL} about Enterprise.`;
  return `Your Team plan covers ${lim} users${loc > 1 ? ` across ${loc} locations` : ''}. Add a location in Plan and billing ($149/mo, 3 more users each, up to 5 locations).`;
}
