/* VKBDevCfg Explained - site behaviour */
(function () {
  'use strict';

  /* ---------------- tabs ---------------- */
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var btns = group.querySelectorAll('button[data-tab]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.toggle('on', x === b); });
        var panels = group.parentElement.parentElement.querySelectorAll('[data-panel]');
        panels.forEach(function (p) { p.hidden = p.dataset.panel !== b.dataset.tab; });
      });
    });
  });

  /* ---------------- search filter ---------------- */
  var q = document.getElementById('q');
  if (q) {
    var targets = [];
    document.querySelectorAll('main > section').forEach(function (sec) {
      var head = sec.querySelector('h2');
      targets.push({ el: sec, title: head ? head.textContent.trim() : '' });
    });
    q.addEventListener('input', function () {
      var term = q.value.trim().toLowerCase();
      if (!term) {
        targets.forEach(function (t) { t.el.classList.remove('hidden-by-search'); });
        return;
      }
      targets.forEach(function (t) {
        var hit = t.el.textContent.toLowerCase().indexOf(term) !== -1;
        t.el.classList.toggle('hidden-by-search', !hit);
      });
    });
  }

  /* ---------------- scroll spy ---------------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.sidebar a.item'));
  var secs = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && secs.length) {
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.intersectionRatio; });
      var best = null, bestR = 0;
      secs.forEach(function (s) {
        var r = visible[s.id] || 0;
        if (r > bestR) { bestR = r; best = s; }
      });
      links.forEach(function (a) {
        a.classList.toggle('active', !!best && a.getAttribute('href') === '#' + best.id);
      });
    }, { rootMargin: '-10% 0px -70% 0px', threshold: [0, 0.1, 0.5, 1] });
    secs.forEach(function (s) { io.observe(s); });
  }
})();