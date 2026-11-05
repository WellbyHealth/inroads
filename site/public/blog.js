(function () {
  var bar = document.querySelector('.tagbar');
  if (!bar) return;
  var cards = [].slice.call(document.querySelectorAll('.blog-grid .post-card'));
  var status = document.querySelector('.tag-status');
  var buttons = [].slice.call(bar.querySelectorAll('button'));
  function apply(tag) {
    var n = 0;
    cards.forEach(function (c) {
      var show = !tag || c.getAttribute('data-tag') === tag;
      c.hidden = !show;
      if (show) { n++; var im = c.querySelector('img'); if (im) im.loading = 'eager'; }
    });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-t') || '') === tag)); });
    if (status) status.textContent = tag ? n + (n === 1 ? ' post' : ' posts') + ' in ' + tag : '';
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) apply(b.getAttribute('data-t') || '');
  });
})();
