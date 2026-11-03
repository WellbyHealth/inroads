// Phones: the bottom tab bar holds the five daily tabs plus "More", which opens a sheet with every page,
// grouped the same way as the desktop sidebar (Target, Win, Prove, Setup).
const W = () => window.Wellby;
const mq = matchMedia('(max-width: 720px)');

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
  const s = sheet(), list = s.querySelector('.msList'), nav = document.getElementById('nav');
  list.innerHTML = '';
  for (const el of nav.children) {
    if (el.id === 'navMore') continue;
    if (el.classList.contains('navsec')) { const h = document.createElement('div'); h.className = 'msSec'; h.textContent = el.textContent; list.appendChild(h); continue; }
    if (el.tagName !== 'A') continue;
    const a = document.createElement('a'); a.href = el.getAttribute('href'); a.dataset.view = el.dataset.view; a.className = 'msItem' + (el.classList.contains('on') ? ' on' : '');
    a.textContent = el.childNodes[0]?.textContent?.trim() || el.textContent.trim();
    const badge = el.querySelector('.nbadge'); if (badge && !badge.hidden) { const b = document.createElement('span'); b.className = 'nbadge'; b.textContent = badge.textContent; a.appendChild(b); }
    a.onclick = () => close();
    list.appendChild(a);
  }
  // Setup pages live under the account menu on desktop; on phones they close out the sheet.
  const links = X.setupLinks ? X.setupLinks() : [];
  if (links.length) { const h = document.createElement('div'); h.className = 'msSec'; h.textContent = 'Setup'; list.appendChild(h); }
  for (const [label, href] of links) { const a = document.createElement('a'); a.href = href; a.className = 'msItem'; a.textContent = label; a.onclick = () => close(); list.appendChild(a); }
  s.hidden = false; document.body.classList.add('msOpen');
}
function ensure() {
  const nav = document.getElementById('nav'); if (!nav) return;
  let m = document.getElementById('navMore');
  if (!m) {
    m = document.createElement('a'); m.id = 'navMore'; m.href = '#more'; m.dataset.view = 'more'; m.title = 'More'; m.textContent = 'More';
    m.onclick = e => { e.preventDefault(); open(); };
    nav.appendChild(m);
  }
  // Highlight More when the current page lives in the sheet.
  const cur = nav.querySelector('a.on');
  m.classList.toggle('on', !!cur && cur !== m && getComputedStyle(cur).display === 'none');
}
const X = (window.WellbyExt = window.WellbyExt || {});
const prevAfter = X._after;
X._after = (v, sub) => { if (prevAfter) prevAfter(v, sub); ensure(); close(); };
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
mq.addEventListener?.('change', () => { if (!mq.matches) close(); });
if (document.readyState !== 'loading') ensure(); else addEventListener('DOMContentLoaded', ensure);
