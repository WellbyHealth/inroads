// Plans and billing in the app: Solo and Team (Enterprise by demo). A plan picker after sign-up (card required,
// 14-day free trial, nothing charged until it ends), the same picker to change plan or users later, and a billing card in Settings.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;
const B = { data: null, plan: null, interval: 'month', locations: null, busy: false, mode: 'new' };
const ART = { solo: ['seed', '#e4f0fd'], team: ['bloom', '#fde7d6'], enterprise: ['house', '#ece6fb'] };
const tier = k => `<img class="plan-art" src="/img/g-tier-${ART[k][0]}-cut.webp" alt="" width="48" height="48" style="--t:${ART[k][1]}">`;
const FEAT = {
  solo: ['1 user and 1 location, one device at a time', 'Market map, ranked targets and a weekly visit list', 'A scorecard for every referral source', 'Drafted outreach you approve, follow-up until they reply'],
  team: ['1 location and 5 users; +3 users per extra location, up to 5', 'Everything in Solo', 'A scorecard and territory per location', 'Shared sources and notes, per-marketer visit lists', 'A combined team scorecard'],
};
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const day = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';
const SUBBED = ['trialing', 'active', 'past_due'];

async function load(force) { if (!B.data || force) B.data = await W().api('/api/billing'); return B.data; }
function totalOf(P, k, loc, y) { const p = P[k]; return (y ? p.annual : p.monthly) + (k === 'team' ? (loc - 1) * (y ? p.locationAnnual : p.locationMonthly) : 0); }
const usersFor = loc => 5 + 3 * (loc - 1);
const clampLoc = n => Math.max(1, Math.min(5, Math.round(+n || 1)));
// Fewest locations that cover the people already in the workspace (and its offices).
const minLoc = (users, offices) => clampLoc(Math.max(offices || 1, Math.ceil((users - 5) / 3) + 1));

function picker(host, { heading, sub } = {}) {
  const d = B.data, P = d.plans, admin = W().S.me.role === 'admin', users = d.billing.users || 1, change = B.mode === 'change';
  if (!B.plan) B.plan = change && P[d.billing.plan] ? d.billing.plan : users > 1 ? 'team' : d.defaultPlan || 'team';
  if (B.locations == null) B.locations = change && d.billing.plan === 'team' && d.billing.version === 5 ? d.billing.locations || 1 : minLoc(users, d.billing.offices);
  B.locations = clampLoc(B.locations);
  const y = B.interval === 'year', loc = B.plan === 'solo' ? 1 : B.locations, seats = B.plan === 'solo' ? 1 : usersFor(loc), total = totalOf(P, B.plan, loc, y);
  const tooFew = B.plan === 'team' && users > seats;
  const legacy = change && d.billing.version === 4;
  const ends = d.billing.trialEndsAt && Date.parse(d.billing.trialEndsAt) > Date.now() ? d.billing.trialEndsAt : new Date(Date.now() + 14 * 864e5);
  const soloBlocked = B.plan === 'solo' && users > 1;
  const cta = change ? 'Update plan' : 'Start 14-day free trial';
  const rerender = () => picker(host, { heading, sub });
  host.innerHTML = `<div class="plan-wrap">
    <div class="plan-head"><span class="eyebrow">${change ? 'Plan and billing' : 'Start your free trial'}</span><h1>${heading || (change ? 'Change your plan' : 'Pick a plan for your agency')}</h1>
      <p class="muted">${sub || (change ? 'Changes apply right away. Stripe prorates the difference on your next invoice.' : `14 days free. Add a card now; you won't be charged until <b>${day(ends)}</b>. Cancel before then and you pay nothing.`)}</p>
      <div class="seg" role="tablist"><button data-int="month" class="${!y ? 'on' : ''}">Monthly</button><button data-int="year" class="${y ? 'on' : ''}">Annual · 2 months free</button></div></div>
    <div class="plan-grid">${Object.entries(P).map(([k, p]) => `<button class="plan-card ${B.plan === k ? 'on' : ''}" data-plan="${k}">
        ${k === 'team' ? '<span class="plan-tag">Most popular</span>' : ''}${tier(k)}<b class="plan-name">${p.name}</b>
        <span class="plan-price">${money(y ? Math.round(p.annual / 12) : p.monthly)}<small>/month</small></span>
        <span class="muted small">${k === 'team' ? `1 location, 5 users · ${money(y ? p.locationAnnual : p.locationMonthly)}/${y ? 'yr' : 'mo'} per extra location` : '1 user, 1 location'}${y ? ` · ${money(p.annual)} billed yearly` : ''}</span>
        <ul>${FEAT[k].map(f => `<li>${f}</li>`).join('')}</ul></button>`).join('')}
      <a class="plan-card" href="mailto:${d.enterpriseEmail || 'team@wellbyhealth.com'}?subject=Wellby%20Enterprise%20demo">${tier('enterprise')}<b class="plan-name">Enterprise</b><span class="plan-price">Custom</span>
        <span class="muted small">6+ locations or 20+ users, billed yearly</span><ul><li>Per-rep scorecards, goals and quotas</li><li>Rollups across regions</li><li>Roles, SSO and a signed BAA</li><li>CRM and EMR connections</li></ul><span class="small"><b>Book a demo →</b></span></a></div>
    <div class="card plan-bar">
      <div><span class="muted small">${B.plan === 'team' ? 'Locations' : 'Users'}</span>${B.plan === 'team' ? `<div class="stepper"><button data-s="-1" aria-label="Fewer locations">−</button><b>${B.locations}</b><button data-s="1" aria-label="More locations">+</button></div>` : '<div class="stepper"><b>1</b></div>'}
        <span class="muted small">${soloBlocked ? `<span class="down">${users} people use this workspace. Solo includes 1.</span>` : tooFew ? `<span class="down">${users} people use this workspace; ${loc} location${loc === 1 ? '' : 's'} cover${loc === 1 ? 's' : ''} ${seats}. Add a location.</span>` : B.plan === 'solo' ? 'One sign-in, one device at a time' : `Covers up to ${seats} users${users > 1 ? ` · ${users} in your workspace` : ''}${d.billing.offices > loc ? ` · you have ${d.billing.offices} offices` : ''}`}</span></div>
      <div class="plan-total"><span class="muted small">${change ? 'New price' : 'After your free trial'}</span><b>${money(total)}<small>/${y ? 'year' : 'month'}</small></b>
        <span class="muted small">${P[B.plan].name}${B.plan === 'team' ? ` · 1 location${loc > 1 ? ` + ${loc - 1} extra` : ''}` : ''}${legacy ? ' · moves you to current pricing' : ''}</span></div>
      ${admin ? `<button class="btn primary" id="planGo" ${d.configured && !soloBlocked && !tooFew ? '' : 'disabled'}>${B.busy ? 'Working…' : cta}</button>` : '<span class="muted small">Ask your admin to pick a plan.</span>'}
    </div>
    ${d.configured ? `<p class="muted small plan-fine">${change ? '<a href="#settings/billing">← Back to billing</a> · ' : ''}Secure checkout by Stripe. Change plan or users, or cancel, anytime in Settings → Plan and billing.</p>` : '<p class="notice">Online billing isn’t switched on yet. Your workspace works on the free trial in the meantime.</p>'}</div>`;
  host.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { B.plan = b.dataset.plan; rerender(); });
  host.querySelectorAll('[data-int]').forEach(b => b.onclick = () => { B.interval = b.dataset.int; rerender(); });
  host.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { B.locations = clampLoc(B.locations + +b.dataset.s); rerender(); });
  const go = host.querySelector('#planGo');
  if (go) go.onclick = async () => {
    B.busy = true; go.disabled = true; go.textContent = change ? 'Updating…' : 'Opening secure checkout…';
    try {
      const r = await W().api('/api/billing', { action: change ? 'change' : 'checkout', plan: B.plan, interval: B.interval, locations: loc });
      if (change) { B.busy = false; B.data = null; W().toast('Plan updated.'); location.hash = '#settings/billing'; } else location.href = r.url;
    } catch (e) { B.busy = false; W().toast(e.message); go.disabled = false; go.textContent = cta; }
  };
}

X.plan = async sub => {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Loading plans…</div>';
  try { await load(true); } catch (e) { app.innerHTML = `<div class="card">${W().esc(e.message)}</div>`; return; }
  const subbed = SUBBED.includes(B.data.billing.status) && B.data.billing.hasCustomer;
  B.mode = subbed ? 'change' : 'new'; B.plan = null; B.locations = null;
  if (subbed) B.interval = B.data.billing.interval === 'year' ? 'year' : 'month';
  if (!subbed && B.data.access.status === 'trial' && B.data.access.card) { location.hash = '#settings/billing'; return; }
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
  B.mode = 'new';
  if (st === 'over_seats') {
    const lim = B.data.access.limit || W().S.me.access?.limit;
    host.innerHTML = `<div class="card plan-wrap" style="max-width:560px;margin:40px auto;text-align:center">${tier(lim === 1 ? 'solo' : 'team')}<br><span class="eyebrow">No seat on this plan</span>
      <h1>${lim === 1 ? 'This workspace is on Solo' : `This plan covers ${lim} users`}</h1>
      <p class="muted">${lim === 1 ? 'Solo includes one user. Ask your admin to switch to Team (5 users included) to give you your own sign-in.' : 'Every seat is taken. Ask your admin to add a location in Settings → Plan and billing ($149/mo, 3 more users each, up to 5 locations).'}</p></div>`;
    return;
  }
  if (st === 'needs_card') picker(host);
  else picker(host, { heading: st === 'canceled' ? 'Your subscription has ended' : 'Your free trial has ended', sub: 'Your workspace is saved: offices, referral data, contacts and outreach history. Pick a plan to pick up where you left off.' });
}).observe(document.getElementById('app') || document.body, { childList: true, subtree: false });

// Settings → Billing: plan, users, trial or renewal date, and the customer portal.
const who = b => b.plan === 'team' && b.version === 5 ? `${b.locations || 1} location${b.locations === 1 ? '' : 's'}, up to ${b.seats} users` : `${b.seats || 1} user${b.seats === 1 ? '' : 's'}`;
async function billingCard() {
  const el = document.querySelector('#billing'); if (!el || el.dataset.x) return;
  el.dataset.x = 1;
  let d; try { d = await load(true); } catch { return; }
  const b = d.billing, ac = d.access, esc = W().esc;
  if (['demo', 'managed', 'none'].includes(ac.status)) return;
  const line = b.status === 'trialing' ? `<b>Free trial</b> · ${b.planName || 'plan'} · ${who(b)} · first charge on <b>${day(b.trialEnd)}</b>`
    : b.status === 'active' ? `<b>${esc(b.planName || 'Subscribed')}</b> · ${who(b)} · ${b.interval === 'year' ? 'annual' : 'monthly'} · ${b.cancelAtPeriodEnd ? 'ends' : 'renews'} ${day(b.periodEnd)}`
    : b.status === 'past_due' ? '<b class="down">Payment failed</b> · update your card to keep access'
    : ac.status === 'trial' ? `<b>Free trial</b> · ${ac.daysLeft} day${ac.daysLeft === 1 ? '' : 's'} left · no card on file yet`
    : '<b>No plan yet</b>';
  const seatWarn = b.seats && b.users > b.seats ? `<p class="small down" style="margin:6px 0 0">${b.users} people use this workspace but ${esc(b.planName)} covers ${b.seats}. Users past the limit can't sign in until you <a href="#plan">add a location</a> or disable someone.</p>`
    : b.plan === 'solo' && SUBBED.includes(b.status) ? '<p class="small muted" style="margin:6px 0 0">Solo is 1 user on one device at a time; signing in somewhere new signs out the old device. Switch to Team to add teammates.</p>' : '';
  const started = /started=1/.test(location.hash) ? '<div class="notice" style="margin-bottom:10px">Your free trial has started. You won’t be charged until it ends. <a href="#settings/setup"><b>Next: add your offices →</b></a></div>' : '';
  el.innerHTML = `${started}<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>Plan and billing</h2><p class="small" style="margin:0">${line}</p>${seatWarn}</div></div>
    <div class="row" style="margin-top:10px">${!b.hasCustomer || !SUBBED.includes(b.status) ? '<a class="btn sm primary" href="#plan">Pick a plan</a>' : '<a class="btn sm primary" href="#plan">Change plan or users</a>'}${b.hasCustomer ? '<button class="btn sm" id="xPortal">Card, invoices and cancel</button>' : ''}</div>`;
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
