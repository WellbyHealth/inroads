import crypto from 'node:crypto';
import { readDoc, writeDoc, GLOBAL } from './store.mjs';

const SECRET = () => process.env.SESSION_SECRET || 'dev-only-secret';
const COOKIE = 'wb_s';
const TTL = 14 * 24 * 3600 * 1000;

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') };
}
export function checkPassword(pw, user) {
  if (!user?.salt || !user?.hash) return false;
  const h = crypto.scryptSync(pw, user.salt, 32);
  const b = Buffer.from(user.hash, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(b, h);
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')}`;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp && p.exp > Date.now() ? p : null;
}
export function sessionCookie(email) {
  return `${COOKIE}=${sign({ e: email, exp: Date.now() + TTL })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL / 1000}`;
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';

export async function loadOrgs() { return readDoc(GLOBAL.orgs, []); }
export async function loadUsers() {
  let users = await readDoc(GLOBAL.users, null);
  if (!users) {
    users = [];
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const pw = process.env.ADMIN_PASSWORD;
    if (email && pw) {
      users.push({ email, name: process.env.ADMIN_NAME || email.split('@')[0], role: 'admin', super: true, org: null, ...hashPassword(pw), mustChange: true, created: new Date().toISOString() });
      await writeDoc(GLOBAL.users, users);
    }
  }
  return users;
}

export async function currentUser(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const p = verify(m?.[1]);
  if (!p) return null;
  const users = await loadUsers();
  const u = users.find(x => x.email === p.e && !x.disabled);
  if (!u) return null;
  const orgs = await loadOrgs();
  let org = u.super ? (u.activeOrg || u.org) : u.org;
  if (u.super && (!org || !orgs.some(o => o.id === org))) org = orgs[0]?.id || null;
  const orgRec = orgs.find(o => o.id === org) || null;
  return { email: u.email, name: u.name, role: u.super ? 'admin' : u.role, super: !!u.super, mustChange: !!u.mustChange, org, orgName: orgRec?.name || '', orgDemo: !!orgRec?.demo, access: orgAccess(orgRec) };
}

// Billing state of a workspace. Self-serve workspaces get a free trial, then need an active Stripe subscription.
// Demo and staff-created customer workspaces are never locked.
export const TRIAL_DAYS = 14;
const PAID = ['active', 'trialing', 'past_due'];
export function orgAccess(o) {
  if (!o) return { status: 'none', locked: false };
  const b = o.billing || {};
  if (b.status === 'trialing') { // Stripe trial with a card on file: show it as the free trial
    const end = Date.parse(b.trialEnd || o.trialEndsAt || 0), daysLeft = Math.max(0, Math.ceil((end - Date.now()) / 864e5));
    return { status: 'trial', locked: false, card: true, plan: b.plan || '', trialEndsAt: b.trialEnd || o.trialEndsAt, daysLeft, hasCustomer: true };
  }
  if (PAID.includes(b.status)) return { status: b.status === 'past_due' ? 'past_due' : 'active', locked: false, plan: b.plan || '', periodEnd: b.periodEnd || null, hasCustomer: !!b.customerId };
  if (o.demo) return { status: 'demo', locked: false };
  if (!o.selfServe) return { status: 'managed', locked: false };
  // Card at sign-up: a self-serve workspace created while Stripe was on starts its trial only once a card is added.
  if (o.cardRequired && !b.subscriptionId) return { status: 'needs_card', locked: true, trialEndsAt: o.trialEndsAt, hasCustomer: !!b.customerId };
  const end = o.trialEndsAt ? Date.parse(o.trialEndsAt) : 0;
  const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / 864e5));
  if (end > Date.now()) return { status: 'trial', locked: false, trialEndsAt: o.trialEndsAt, daysLeft, hasCustomer: !!b.customerId };
  return { status: b.status === 'canceled' ? 'canceled' : 'expired', locked: true, trialEndsAt: o.trialEndsAt, hasCustomer: !!b.customerId };
}

export function publicUser(u) { return { email: u.email, name: u.name, role: u.role, super: !!u.super, org: u.org, mustChange: !!u.mustChange, disabled: !!u.disabled, created: u.created }; }
