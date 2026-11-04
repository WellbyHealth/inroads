// Navigation: the sidebar is just Today · Target · Win · Prove. Setup pages (Settings, Referral data,
// Connections, billing, staff tools) live in a menu under your name, and on phones at the end of More.
// Also the 3-step guided tour (Target → Win → Prove), started once after setup or from the menu.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;

X.setupLinks = () => {
  const S = W().S, admin = S.me?.role === 'admin';
  return [
    ['Settings', '#settings', 'settings'],
    ['Referral data', '#referrals', 'referrals'],
    ['Connections', '#connections', 'connections'],
    ['Market (public data)', '#market', 'market'],
    ...(admin && !['demo', 'managed'].includes(S.me?.access?.status) ? [['Plan and billing', '#settings/billing', 'billing']] : []),
    ...(S.me?.super ? [['Demo builder', '#demo', 'demo']] : []),
  ];
};

function menu() {
  const me = document.getElementById('me'); if (!me || !W().S.me) return;
  const name = [...me.children].find(el => el.tagName === 'SPAN' && !el.classList.contains('meBtnWrap'));
  const out = document.getElementById('logout');
  if (!name || !out || me.querySelector('.meBtn')) return;
  const wrap = document.createElement('span'); wrap.className = 'meBtnWrap';
  const first = (W().S.me.name || 'Account').split(' ')[0];
  wrap.innerHTML = `<button class="meBtn" aria-haspopup="menu" aria-expanded="false"><span class="meAv">${W().esc(first[0] || '?')}</span><span class="meNm">${W().esc(first)}</span><span aria-hidden="true">▾</span></button>
    <div class="meMenu" role="menu" hidden>${X.setupLinks().map(([l, h]) => `<a role="menuitem" href="${h}">${l}</a>`).join('')}<hr><button role="menuitem" data-tour>Take the tour</button><button role="menuitem" data-out>Sign out</button></div>`;
  name.replaceWith(wrap); out.hidden = true;
  const btn = wrap.querySelector('.meBtn'), m = wrap.querySelector('.meMenu');
  const close = () => { m.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = e => { e.stopPropagation(); m.hidden = !m.hidden; btn.setAttribute('aria-expanded', String(!m.hidden)); };
  m.querySelectorAll('a').forEach(a => a.onclick = close);
  m.querySelector('[data-tour]').onclick = () => { close(); tour(0); };
  m.querySelector('[data-out]').onclick = () => out.click();
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
new MutationObserver(menu).observe(document.getElementById('me') || document.body, { childList: true });

// ---------- Guided tour ----------
const STEPS = [
  { hash: '#territory', view: 'territory', eye: '1 of 3 · Target', title: 'Know who to target', text: 'Every hospital, doctor and facility around your offices, ranked for your type of care, with how many patients each refers out and what a bigger share is worth.' },
  { hash: '#queue', view: 'queue', eye: '2 of 3 · Win', title: 'Win their referrals', text: 'Each day Wellby lines up who to reach, drafts the email in your voice and plans visit days. You approve, send and go. Win flows keep every source moving.' },
  { hash: '#scorecard', view: 'scorecard', eye: '3 of 3 · Prove', title: 'Prove it worked', text: 'Your share of each source’s referrals, and the clients and revenue your outreach started, by source and by marketer. Outcomes, not activity.' },
];
let cur = -1;
function tour(i) {
  cur = i;
  document.getElementById('tourCard')?.remove();
  document.querySelectorAll('#nav a.tourOn').forEach(a => a.classList.remove('tourOn'));
  if (i < 0 || i >= STEPS.length) { cur = -1; try { localStorage.setItem('wb_toured', '1'); } catch {} return; }
  const s = STEPS[i];
  if (location.hash !== s.hash) location.hash = s.hash;
  const c = document.createElement('div'); c.id = 'tourCard'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Tour');
  c.innerHTML = `<div class="tourEye">${s.eye}</div><h3>${s.title}</h3><p>${s.text}</p><div class="tourDots">${STEPS.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tourBtns"><button class="btn sm ghost" data-skip>${i === STEPS.length - 1 ? 'Close' : 'Skip tour'}</button>${i ? '<button class="btn sm" data-back>Back</button>' : ''}<button class="btn sm primary" data-next>${i === STEPS.length - 1 ? 'Done' : 'Next'}</button></div>`;
  document.body.appendChild(c);
  c.querySelector('[data-next]').onclick = () => tour(i + 1);
  c.querySelector('[data-skip]').onclick = () => tour(-1);
  const b = c.querySelector('[data-back]'); if (b) b.onclick = () => tour(i - 1);
  document.querySelector(`#nav a[data-view="${X.groupOf?.(s.view) || s.view}"]`)?.classList.add('tourOn');
}
X.tour = tour;

const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  menu();
  if (cur >= 0) { const s = STEPS[cur]; if (location.hash.split('/')[0] !== s.hash) tour(-1); else document.querySelector(`#nav a[data-view="${X.groupOf?.(s.view) || s.view}"]`)?.classList.add('tourOn'); }
  let start = false; try { start = sessionStorage.getItem('wb_tour') === '1'; if (start) sessionStorage.removeItem('wb_tour'); } catch {}
  if (start && view === 'territory') setTimeout(() => tour(0), 400);
};
