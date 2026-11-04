// Phones: the bottom tab bar holds Today · Plan · Log · Partners · Results. A menu button in the top bar opens a
// sheet with every page inside each tab (Plan: Territory, Targets, Win flows, Calendar …) and the Setup pages.
const W = () => window.Wellby;
const mq = matchMedia('(max-width: 720px)');
const X = (window.WellbyExt = window.WellbyExt || {});

function sheet() {
  let s = document.getElementById('moreSheet');
  if (s) return s;
  s = document.createElement('div'); s.id = 'moreSheet'; s.hidden = true;
  s.innerHTML = '<div class="msBack"></div><div class="msPanel" role="dialog" aria-label="All pages"><div class="msGrab"></div><div class="msList"></div></div>';
  document.body.appendChild(s);
  s.querySelector('.msBack').onclick = close;
  return s;
}
function close() { const s = document.getElementById('moreSheet'); if (s) s.hidden = true; document.body.classList.remove('msOpen'); }
function open() {
  const s = sheet(), list = s.querySelector('.msList'), cur = W()?.S?.view;
  list.innerHTML = '';
  const add = (label, href, on) => { const a = document.createElement('a'); a.href = href; a.className = 'msItem' + (on ? ' on' : ''); a.textContent = label; a.onclick = () => close(); list.appendChild(a); };
  const sec = t => { const h = document.createElement('div'); h.className = 'msSec'; h.textContent = t; list.appendChild(h); };
  for (const [, g] of Object.entries(X.navGroups || {})) { sec(g.label); for (const [v, l, h] of g.subs) add(l, h, v === cur || (cur === 'sources' && v === 'map')); }
  const links = X.setupLinks ? X.setupLinks() : [];
  if (links.length) { sec('Setup'); for (const [label, href] of links) add(label, href, false); }
  const out = document.getElementById('logout');
  if (out) { const b = document.createElement('button'); b.className = 'msItem'; b.textContent = 'Sign out'; b.onclick = () => { close(); out.click(); }; list.appendChild(b); }
  s.hidden = false; document.body.classList.add('msOpen');
}
function ensure() {
  const bar = document.querySelector('.hdr .bar'); if (!bar || document.getElementById('navMore')) return;
  const b = document.createElement('button'); b.id = 'navMore'; b.type = 'button'; b.setAttribute('aria-label', 'All pages and settings'); b.title = 'All pages';
  b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  b.onclick = open;
  bar.appendChild(b);
}
const prevAfter = X._after;
X._after = (v, sub) => { if (prevAfter) prevAfter(v, sub); ensure(); close(); };
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
mq.addEventListener?.('change', () => { if (!mq.matches) close(); });
if (document.readyState !== 'loading') ensure(); else addEventListener('DOMContentLoaded', ensure);
