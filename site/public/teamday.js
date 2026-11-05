// "Your team's day": steps on the left drive the highlighted row on the right.
(() => {
  const card = document.getElementById('td-card');
  if (!card) return;
  const tabs = [...document.querySelectorAll('.td-steps [role=tab]')];
  const rows = [...card.querySelectorAll('.td-row')];
  const send = card.querySelector('.td-send');
  const links = [...card.querySelectorAll('.td-link')];
  const sec = document.getElementById('team-day');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const DUR = 3600;
  let i = 0, timer = 0, sub = 0, paused = false, visible = false;

  const show = (n, user) => {
    i = n;
    clearTimeout(sub);
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === n)); t.tabIndex = k === n ? 0 : -1; t.classList.toggle('done', k < n); });
    rows.forEach((r, k) => { r.classList.toggle('on', k === n); r.classList.toggle('past', k < n); });
    card.dataset.step = n;
    links.forEach((l, k) => l.classList.toggle('on', k < n));
    if (send) { if (n > 1) { send.textContent = send.dataset.done || 'Sent ✓'; send.className = 'hq-chip up td-send'; } else { send.textContent = 'Approve & send'; send.className = 'hq-chip btn td-send'; } }
    const row = rows[n];
    if (!reduce.matches) row.querySelectorAll('.td-count').forEach(c => {
      const a = +c.dataset.from, b = +c.dataset.to; let v = a; c.textContent = v;
      const step = Math.max(1, Math.round((b - a) / 12));
      const tick = () => { v = Math.min(b, v + step); c.textContent = v; if (v < b) sub = setTimeout(tick, 70); };
      sub = setTimeout(tick, 250);
    });
    if (n === 1 && send) sub = setTimeout(() => { send.textContent = send.dataset.done || 'Sent ✓'; send.className = 'hq-chip up td-send sent'; }, 1700);
  };
  const loop = () => {
    clearTimeout(timer);
    if (reduce.matches || paused || !visible) return;
    timer = setTimeout(() => { show((i + 1) % rows.length); loop(); }, DUR);
  };
  const go = (n, user) => { show(n, user); loop(); };

  tabs.forEach((t, k) => {
    t.addEventListener('click', () => { paused = true; go(k, true); });
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return; e.preventDefault(); paused = true; const n = (k + d + tabs.length) % tabs.length; go(n, true); tabs[n].focus();
    });
  });
  rows.forEach((r, k) => r.addEventListener('click', () => { paused = true; go(k, true); }));
  const area = sec || card;
  area.addEventListener('mouseenter', () => { if (!paused) { paused = 'hover'; clearTimeout(timer); } });
  area.addEventListener('mouseleave', () => { if (paused === 'hover') { paused = false; go(i); } });
  new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) go(0); if (!visible) clearTimeout(timer); }, { threshold: 0.35 }).observe(area);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else loop(); });
  show(0, true);
})();
