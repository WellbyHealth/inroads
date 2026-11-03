// Pricing: Monthly / Annual toggle. Swaps prices, billing notes and adds &interval=year to the signup links.
(() => {
  const btns = document.querySelectorAll('.pp-toggle button');
  if (!btns.length) return;
  const set = int => {
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.int === int)));
    document.querySelectorAll('[data-m][data-y]').forEach(el => { el.textContent = el.dataset[int]; });
    document.querySelectorAll('.pp-cta[data-base]').forEach(a => { a.href = a.dataset.base + (int === 'y' ? '&interval=year' : ''); });
  };
  btns.forEach(b => b.addEventListener('click', () => set(b.dataset.int)));
  set(new URLSearchParams(location.search).get('billing') === 'annual' ? 'y' : 'm');
})();
