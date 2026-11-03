// Plans and billing in the app: a plan picker after sign-up (card required, 14-day free trial, nothing
// charged until it ends), the same picker in place of the old paywall, and a richer billing card in Settings.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const B = { data: null, plan: 'growth', interval: 'month', seats: null, busy: false };
const FEAT = {
  insight: ['Market map and ranked targets', 'Scorecard for every referral source', 'Share of referrals and results'],
  growth: ['Everything in Insight', 'Win flows and drafted outreach', 'Queue, visit-day routing and calendar'],
  network: ['Everything in Growth', 'Multi-location rollup', 'CRM and EMR connections, guided onboarding'],
};
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const day = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';

async function load(force) { if (!B.data || force) B.data = await W().api('/api/billing'); return B.data; }

function picker(host, { heading, sub } = {}) {
  const d = B.data, P = d.plans, admin = W().S.me.role === 'admin';
  const min = P[B.plan].min, users = d.billing.users || 1;
  if (B.seats == null) B.seats = Math.max(min, users);
  B.seats = Math.max(min, B.seats);
  const unit = B.interval === 'year' ? P[B.plan].annual / 12 : P[B.plan].monthly;
  const total = B.interval === 'year' ? P[B.plan].annual * B.seats : P[B.plan].monthly * B.seats;
  const trialEnd = new Date(Date.now() + 14 * 864e5);
  const ends = d.billing.trialEndsAt && Date.parse(d.billing.trialEndsAt) > Date.now() ? d.billing.trialEndsAt : trialEnd;
  host.innerHTML = `<div class="plan-wrap">
    <div class="plan-head"><span class="eyebrow">Start your free trial</span><h1>${heading || 'Pick a plan for your agency'}</h1>
      <p class="muted">${sub || `14 days free. Add a card now; you won't be charged until <b>${day(ends)}</b>. Cancel before then and you pay nothing.`}</p>
      <div class="seg" role="tablist"><button data-int="month" class="${B.interval === 'month' ? 'on' : ''}">Monthly</button><button data-int="year" class="${B.interval === 'year' ? 'on' : ''}">Annual · 2 months free</button></div></div>
    <div class="plan-grid">${Object.entries(P).map(([k, p]) => `<button class="plan-card ${B.plan === k ? 'on' : ''}" data-plan="${k}">
        ${k === 'growth' ? '<span class="plan-tag">Recommended</span>' : ''}<b class="plan-name">${p.name}</b>
        <span class="plan-price">${money(B.interval === 'year' ? p.annual / 12 : p.monthly)}<small>/user/month</small></span>
        <span class="muted small">${B.interval === 'year' ? `${money(p.annual)} per user, billed yearly` : 'billed monthly'}${p.min > 1 ? ` · ${p.min}-user minimum` : ''}</span>
        <ul>${FEAT[k].map(f => `<li>${f}</li>`).join('')}</ul></button>`).join('')}</div>
    <div class="card plan-bar">
      <div><span class="muted small">Users</span><div class="stepper"><button data-s="-1" aria-label="Fewer users">−</button><b>${B.seats}</b><button data-s="1" aria-label="More users">+</button></div>
        <span class="muted small">${users > 1 ? `${users} people in your workspace` : 'You can add teammates later'}</span></div>
      <div class="plan-total"><span class="muted small">After your free trial</span><b>${money(total)}<small>/${B.interval === 'year' ? 'year' : 'month'}</small></b>
        <span class="muted small">${P[B.plan].name} · ${B.seats} user${B.seats === 1 ? '' : 's'} × ${money(unit)}/month</span></div>
      ${admin ? `<button class="btn primary" id="planGo" ${d.configured ? '' : 'disabled'}>${B.busy ? 'Opening secure checkout…' : 'Start 14-day free trial'}</button>` : '<span class="muted small">Ask your admin to pick a plan.</span>'}
    </div>
    ${d.configured ? '<p class="muted small plan-fine">Secure checkout by Stripe. Change plan or users, or cancel, anytime in Settings → Billing.</p>' : '<p class="notice">Online billing isn’t switched on yet. Your workspace works on the free trial in the meantime.</p>'}</div>`;
  host.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { B.plan = b.dataset.plan; picker(host, { heading, sub }); });
  host.querySelectorAll('[data-int]').forEach(b => b.onclick = () => { B.interval = b.dataset.int; picker(host, { heading, sub }); });
  host.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { B.seats = Math.max(min, Math.min(500, B.seats + +b.dataset.s)); picker(host, { heading, sub }); });
  const go = host.querySelector('#planGo');
  if (go) go.onclick = async () => {
    B.busy = true; go.disabled = true; go.textContent = 'Opening secure checkout…';
    try { const r = await W().api('/api/billing', { action: 'checkout', plan: B.plan, interval: B.interval, seats: B.seats }); location.href = r.url; }
    catch (e) { B.busy = false; W().toast(e.message); go.disabled = false; go.textContent = 'Start 14-day free trial'; }
  };
}

X.plan = async () => {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Loading plans…</div>';
  try { await load(true); } catch (e) { app.innerHTML = `<div class="card">${W().esc(e.message)}</div>`; return; }
  const ac = B.data.access;
  if (['trialing', 'active', 'past_due'].includes(B.data.billing.status) || (ac.status === 'trial' && ac.card)) { location.hash = '#settings/billing'; return; }
  picker(app);
};

// The bundle's paywall: swap in the picker with the right words for each case.
new MutationObserver(async () => {
  const pw = document.querySelector('#app > .card.paywall');
  if (!pw || pw.dataset.x) return;
  pw.dataset.x = 1;
  try { await load(true); } catch { return; }
  const st = B.data.access.status;
  const host = document.createElement('div'); pw.replaceWith(host);
  if (st === 'needs_card') picker(host);
  else picker(host, { heading: st === 'canceled' ? 'Your subscription has ended' : 'Your free trial has ended', sub: 'Your workspace is saved: offices, referral data, contacts and outreach history. Pick a plan to pick up where you left off.' });
}).observe(document.getElementById('app') || document.body, { childList: true, subtree: false });

// Settings → Billing: plan, users, trial or renewal date, and the customer portal.
async function billingCard() {
  const el = document.querySelector('#billing'); if (!el || el.dataset.x) return;
  el.dataset.x = 1;
  let d; try { d = await load(true); } catch { return; }
  const b = d.billing, ac = d.access, esc = W().esc;
  if (['demo', 'managed', 'none'].includes(ac.status)) return;
  const line = b.status === 'trialing' ? `<b>Free trial</b> · ${b.planName || 'plan'} · ${b.seats || 1} user${b.seats === 1 ? '' : 's'} · first charge on <b>${day(b.trialEnd)}</b>`
    : b.status === 'active' ? `<b>${esc(b.planName || 'Subscribed')}</b> · ${b.seats || 1} user${b.seats === 1 ? '' : 's'} · ${b.interval === 'year' ? 'annual' : 'monthly'} · ${b.cancelAtPeriodEnd ? 'ends' : 'renews'} ${day(b.periodEnd)}`
    : b.status === 'past_due' ? '<b class="down">Payment failed</b> · update your card to keep access'
    : ac.status === 'trial' ? `<b>Free trial</b> · ${ac.daysLeft} day${ac.daysLeft === 1 ? '' : 's'} left · no card on file yet`
    : '<b>No plan yet</b>';
  const seatWarn = b.seats && b.users > b.seats ? `<p class="small down" style="margin:6px 0 0">${b.users} people use this workspace but the plan covers ${b.seats}. Add users in Manage billing.</p>` : '';
  const started = /started=1/.test(location.hash) ? '<div class="notice" style="margin-bottom:10px">Your free trial has started. You won’t be charged until it ends. <a href="#settings/setup"><b>Next: add your offices →</b></a></div>' : '';
  el.innerHTML = `${started}<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>Plan and billing</h2><p class="small" style="margin:0">${line}</p>${seatWarn}</div></div>
    <div class="row" style="margin-top:10px">${!b.hasCustomer || !['trialing', 'active', 'past_due'].includes(b.status) ? '<a class="btn sm primary" href="#plan">Pick a plan</a>' : ''}${b.hasCustomer ? '<button class="btn sm" id="xPortal">Manage billing, users and invoices</button>' : ''}</div>`;
  const pb = el.querySelector('#xPortal');
  if (pb) pb.onclick = async () => { pb.disabled = true; try { const r = await W().api('/api/billing', { action: 'portal' }); location.href = r.url; } catch (e) { W().toast(e.message); pb.disabled = false; } };
}

// Trial ending soon: a one-line reminder on Today (Stripe sends trial_will_end ~3 days before).
function reminder(app) {
  const ac = W().S.me?.access || {};
  if (ac.status !== 'trial' || !ac.card || ac.daysLeft > 3 || app.querySelector('#trialRem')) return;
  app.insertAdjacentHTML('afterbegin', `<a id="trialRem" class="notice" href="#settings/billing" style="display:block;margin-bottom:12px">Your free trial ends ${day(ac.trialEndsAt)}. Your card will be charged then; change or cancel your plan in Settings → Billing.</a>`);
}

const prevAfter = X._after;
X._after = (v, sub) => {
  if (prevAfter) prevAfter(v, sub);
  const app = document.getElementById('app'); if (!app) return;
  if (v === 'settings') setTimeout(billingCard, 0);
  if (v === 'today') reminder(app);
};
