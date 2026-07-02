/**
 * The constellation single page (spec constellation.renderer Rule 8; design
 * §12.3, §12.6-§12.8). One static HTML string: a Cytoscape container using
 * COMPOUND NODES for the group hierarchy (no D3, no hand-rolled layout), a
 * preset switcher naming exactly the five locked presets, and the coverage
 * counters. The browser does no graph computation — it renders what
 * `/api/constellation` returns. Restraint is the credibility (§12.7): minimal
 * chrome, no animation flourishes. Visual behaviour beyond this skeleton is
 * deliberately unpinned (journey tier, deferred).
 */

export const SPA_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cortex constellation</title>
<style>
  html, body { margin: 0; height: 100%; font: 14px/1.4 system-ui, sans-serif; color: #1c2733; }
  body { display: flex; flex-direction: column; }
  header { display: flex; gap: 1rem; align-items: baseline; padding: 0.5rem 1rem; border-bottom: 1px solid #d5dbe1; }
  header h1 { font-size: 1rem; margin: 0; font-weight: 600; }
  #presets button { font: inherit; padding: 0.15rem 0.6rem; margin-right: 0.25rem; border: 1px solid #b8c0c8; background: #fff; border-radius: 3px; cursor: pointer; }
  #presets button[aria-pressed="true"] { background: #1c2733; color: #fff; border-color: #1c2733; }
  #domain-input { font: inherit; padding: 0.15rem 0.4rem; width: 9rem; }
  #cy { flex: 1; min-height: 0; }
  #message { padding: 1rem; color: #5a6672; }
  footer { padding: 0.4rem 1rem; border-top: 1px solid #d5dbe1; color: #5a6672; }
</style>
<script src="/vendor/cytoscape.min.js"></script>
</head>
<body>
<header>
  <h1>Cortex constellation</h1>
  <nav id="presets" aria-label="Preset switcher">
    <button data-preset="default" aria-pressed="true">default</button>
    <button data-preset="anatomy-only" aria-pressed="false">anatomy-only</button>
    <button data-preset="knowledge-only" aria-pressed="false">knowledge-only</button>
    <button data-preset="orphans" aria-pressed="false">orphans</button>
    <button data-preset="domain" aria-pressed="false">domain</button>
    <input id="domain-input" placeholder="domain, e.g. schema" hidden>
  </nav>
</header>
<p id="message" hidden></p>
<div id="cy"></div>
<footer id="counters"></footer>
<script>
(function () {
  'use strict';
  var cy = null;
  var messageEl = document.getElementById('message');
  var countersEl = document.getElementById('counters');
  var domainInput = document.getElementById('domain-input');

  function show(msg) {
    messageEl.textContent = msg;
    messageEl.hidden = !msg;
  }

  function renderCounters(c) {
    countersEl.textContent = c
      ? 'anatomy ' + c.anatomy + ' \\u00b7 cerebrum ' + c.cerebrum + ' \\u00b7 atlas ' + c.atlas +
        ' \\u00b7 specs ' + c.specs + ' \\u00b7 edges ' + c.edges
      : '';
  }

  /** Constellation JSON -> Cytoscape elements. Compound nodes carry the group
   *  hierarchy: top group > child group > node (design 12.8). */
  function toElements(map) {
    var elements = [];
    var parents = {};
    map.groups.forEach(function (g) {
      parents[g.id] = true;
      elements.push({ data: { id: g.id, label: g.label } });
      g.children.forEach(function (ch) {
        parents[ch.id] = true;
        elements.push({ data: { id: ch.id, label: ch.label, parent: g.id } });
      });
    });
    map.nodes.forEach(function (n) {
      if (n.group && !parents[n.group]) { // tolerate an undeclared group id
        parents[n.group] = true;
        elements.push({ data: { id: n.group, label: n.group } });
      }
      elements.push({ data: { id: n.id, label: n.label, parent: n.group, module: n.module } });
    });
    map.edges.forEach(function (e, i) {
      elements.push({ data: { id: 'e' + i, source: e.from, target: e.to, kind: e.kind } });
    });
    return elements;
  }

  function render(map) {
    if (cy) { cy.destroy(); cy = null; }
    cy = cytoscape({
      container: document.getElementById('cy'),
      elements: toElements(map),
      layout: { name: 'cose', animate: false },
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 9, 'background-color': '#8ea2b5' } },
        { selector: ':parent', style: { shape: 'round-rectangle', 'background-opacity': 0.08, 'border-color': '#b8c0c8', 'font-size': 11 } },
        { selector: 'edge', style: { width: 1, 'line-color': '#c3ccd4', 'curve-style': 'straight' } }
      ]
    });
  }

  function load(preset, domain) {
    var q = '/api/constellation?preset=' + encodeURIComponent(preset);
    if (preset === 'domain') q += '&domain=' + encodeURIComponent(domain || '');
    fetch(q).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          renderCounters(null);
          show(body.error || ('Request failed (' + res.status + ')'));
          return;
        }
        show('');
        renderCounters(body.counters);
        render(body);
      });
    }).catch(function (err) { show(String(err)); });
  }

  document.getElementById('presets').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-preset]');
    if (!btn) return;
    document.querySelectorAll('#presets button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    var preset = btn.getAttribute('data-preset');
    domainInput.hidden = preset !== 'domain';
    if (preset === 'domain' && !domainInput.value) { domainInput.focus(); return; }
    load(preset, domainInput.value);
  });
  domainInput.addEventListener('change', function () { load('domain', domainInput.value); });

  load('default');
})();
</script>
</body>
</html>
`;
