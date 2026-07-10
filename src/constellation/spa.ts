/**
 * The constellation single page (spec constellation.renderer Rule 8; design
 * §12.3, §12.6-§12.8). One self-contained HTML string: a full-viewport 2D
 * canvas that renders the compiled map as a deep-space starfield of glowing
 * groups. Each top-level group (domain) is a coloured halo; each child group is
 * a glowing star that DISSOLVES into its member artefacts as you zoom in, and
 * re-condenses zooming out (the zoom-driven alpha curves live in `lod.ts` and
 * are embedded verbatim below — one tested source of truth, no drift). Around
 * the canvas: a glass top bar (logo, stats, search, and the preset switcher —
 * still naming exactly the locked presets `default`/`orphans`/`domain`, schema
 * §4.9 v3.0), a breadcrumb, a legend, zoom controls, a hover tooltip, and a
 * slide-in detail panel. The browser does NO graph computation and never
 * fabricates data — every glyph and every line of chrome copy derives from the
 * real `id`/`module`/`label`/`group`/`ref` fields and the computed edge graph
 * that `/api/constellation` returns. Layout is deterministic (static positions,
 * only the camera transform animates), so it holds 60fps trivially.
 *
 * The single external resource is the Google Fonts stylesheet (Space Grotesk +
 * IBM Plex Mono), with full fallback stacks so the page still reads offline.
 * There is no external `<script src>` — all logic is inline.
 */
import {
  clamp,
  hexWithAlpha,
  computeLOD,
  focusLevel,
  clampScale,
  goldenSpiralPoint,
  starRadius,
} from './lod.js';

export const SPA_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cortex constellation</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;height:100%;background:#05060b;overflow:hidden;}
  :root{
    --bg:#05060b; --panel:rgba(13,15,26,0.82); --border:rgba(255,255,255,0.09);
    --text:#eef1fb; --sub:rgba(238,241,251,0.55); --chip:rgba(255,255,255,0.06);
    --input:rgba(255,255,255,0.05); --shadow:0 12px 44px rgba(0,0,0,0.5);
    --ui:'Space Grotesk',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;
  }
  body{font-family:var(--ui);color:var(--text);}
  button{font-family:inherit;cursor:pointer;} input{font-family:inherit;}
  ::-webkit-scrollbar{width:8px;height:8px;} ::-webkit-scrollbar-thumb{background:rgba(140,150,180,0.3);border-radius:6px;} ::-webkit-scrollbar-track{background:transparent;}
  @keyframes slideIn{from{opacity:0;transform:translateX(28px);}to{opacity:1;transform:translateX(0);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  #wrap{position:absolute;inset:0;overflow:hidden;user-select:none;background:var(--bg);}
  #constellation{position:absolute;inset:0;display:block;cursor:grab;touch-action:none;}
  #topbar{position:absolute;top:0;left:0;right:0;height:58px;display:flex;align-items:center;gap:14px;padding:0 16px;z-index:20;background:var(--panel);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--border);}
  .brand{display:flex;align-items:center;gap:11px;min-width:210px;}
  .brand .title{display:flex;flex-direction:column;line-height:1.08;}
  .brand .name{font-weight:700;font-size:14.5px;letter-spacing:0.01em;color:var(--text);}
  #stats{font-size:10px;font-family:var(--mono);color:var(--sub);letter-spacing:0.04em;}
  .search-wrap{flex:1;display:flex;justify-content:center;}
  .search-inner{position:relative;width:min(430px,100%);}
  .search-inner svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);}
  #search{width:100%;height:34px;padding:0 12px 0 32px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:13px;outline:none;}
  #presets{display:flex;gap:3px;padding:3px;border-radius:10px;background:var(--chip);align-items:center;}
  #presets button{border:none;padding:6px 11px;border-radius:7px;font-size:12px;font-weight:600;background:transparent;color:var(--sub);transition:background .15s,color .15s;}
  #presets button[aria-pressed="true"]{background:rgba(255,255,255,0.16);color:#fff;}
  #domain-input{height:28px;width:9rem;padding:0 8px;border-radius:7px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:12px;outline:none;}
  #breadcrumb{position:absolute;top:70px;left:16px;z-index:20;display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:10px;background:var(--panel);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--border);box-shadow:var(--shadow);}
  #breadcrumb .sep{color:var(--sub);font-size:10px;}
  #breadcrumb button{border:none;background:transparent;padding:2px 3px;font-size:12.5px;color:var(--sub);}
  #breadcrumb button.here{font-weight:700;color:var(--text);}
  #legend{position:absolute;left:16px;bottom:16px;z-index:20;display:flex;flex-direction:column;gap:2px;padding:12px;border-radius:13px;background:var(--panel);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--border);box-shadow:var(--shadow);width:224px;max-height:min(48vh,420px);}
  #legend-title{font-size:9.5px;font-family:var(--mono);letter-spacing:0.06em;color:var(--sub);margin:0 0 6px 6px;}
  #legend-list{overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
  #legend-list button{display:flex;align-items:center;gap:9px;border:none;background:transparent;padding:5px 6px;border-radius:7px;text-align:left;transition:background .12s;}
  #legend-list button:hover{background:var(--chip);}
  #legend-list .dot{width:9px;height:9px;border-radius:50%;flex:none;}
  #legend-list .lbl{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #legend-list .cnt{font-size:11px;font-family:var(--mono);color:var(--sub);flex:none;}
  #zoom-controls{position:absolute;right:16px;bottom:16px;z-index:20;display:flex;flex-direction:column;gap:6px;align-items:center;}
  #zoom-pct{font-size:9.5px;font-family:var(--mono);color:var(--sub);padding:4px 8px;border-radius:7px;background:var(--panel);backdrop-filter:blur(14px);border:1px solid var(--border);margin-bottom:2px;}
  #zoom-controls button{width:38px;height:38px;border-radius:9px;border:1px solid var(--border);background:var(--panel);backdrop-filter:blur(14px);color:var(--text);font-size:18px;line-height:1;box-shadow:var(--shadow);}
  #hint{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:15;padding:8px 16px;border-radius:999px;background:var(--panel);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--border);font-size:12px;color:var(--sub);animation:fadeUp .5s ease;white-space:nowrap;}
  #tooltip{position:absolute;z-index:30;width:250px;padding:12px 13px;border-radius:12px;background:var(--panel);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--border);box-shadow:var(--shadow);pointer-events:none;animation:fadeUp .12s ease;}
  #tooltip .kick{display:flex;align-items:center;gap:7px;margin-bottom:7px;}
  #tooltip .kick .dot{width:8px;height:8px;border-radius:50%;}
  #tooltip .kick span{font-size:10px;font-family:var(--mono);letter-spacing:0.05em;}
  #tooltip .tt{font-weight:600;font-size:14.5px;color:var(--text);margin-bottom:5px;line-height:1.2;}
  #tooltip .path{font-family:var(--mono);font-size:10.5px;color:var(--sub);}
  #tooltip .desc{font-size:11.5px;color:var(--sub);margin-top:8px;line-height:1.45;}
  #tooltip .meta{display:flex;gap:14px;margin-top:9px;font-size:10px;font-family:var(--mono);color:var(--sub);}
  #detail{position:absolute;top:0;right:0;bottom:0;width:340px;z-index:40;background:var(--panel);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border-left:1px solid var(--border);box-shadow:var(--shadow);display:flex;flex-direction:column;animation:slideIn .22s cubic-bezier(.2,.8,.2,1);}
  #detail .dhead{display:flex;align-items:center;justify-content:space-between;padding:18px 18px 14px;border-bottom:1px solid var(--border);}
  #detail .dkick{display:flex;align-items:center;gap:8px;}
  #detail .dkick .dot{width:10px;height:10px;border-radius:50%;}
  #detail .dkick span{font-size:11px;font-family:var(--mono);letter-spacing:0.03em;}
  #detail .close{border:none;background:var(--chip);color:var(--sub);width:28px;height:28px;border-radius:7px;font-size:13px;line-height:1;}
  #detail .dbody{padding:16px 18px;overflow-y:auto;flex:1;}
  #detail .dtitle{font-weight:700;font-size:20px;color:var(--text);line-height:1.2;margin-bottom:9px;}
  #detail .dref{font-family:var(--mono);font-size:11.5px;color:var(--sub);padding:6px 9px;border-radius:7px;background:var(--chip);display:inline-block;margin-bottom:18px;word-break:break-all;}
  #detail .dfield{margin-bottom:18px;}
  #detail .dfield .k{font-size:9px;font-family:var(--mono);letter-spacing:0.07em;color:var(--sub);margin-bottom:4px;}
  #detail .dfield .v{font-size:13px;color:var(--text);}
  #detail .esec{font-size:10px;font-family:var(--mono);letter-spacing:0.06em;color:var(--sub);margin-bottom:10px;border-top:1px solid var(--border);padding-top:16px;}
  #detail .elist{display:flex;flex-direction:column;gap:5px;}
  #detail .elist button{display:flex;align-items:center;gap:9px;border:1px solid var(--border);background:transparent;padding:9px 10px;border-radius:8px;text-align:left;transition:background .12s;}
  #detail .elist button:hover{background:var(--chip);}
  #detail .elist .dot{width:7px;height:7px;border-radius:50%;flex:none;}
  #detail .elist .arr{font-family:var(--mono);font-size:11px;color:var(--sub);flex:none;}
  #detail .elist .et{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #detail .elist .ek{font-size:10px;font-family:var(--mono);color:var(--sub);flex:none;}
  #message{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;max-width:60%;text-align:center;font-size:14px;color:var(--sub);padding:18px 22px;border-radius:12px;background:var(--panel);border:1px solid var(--border);backdrop-filter:blur(14px);}
  [hidden]{display:none !important;}
</style>
</head>
<body>
<div id="wrap">
  <canvas id="constellation"></canvas>
  <header id="topbar">
    <div class="brand">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex:none;">
        <line x1="5" y1="7" x2="12" y2="4" stroke="rgba(238,241,251,0.55)" stroke-width="1"></line>
        <line x1="12" y1="4" x2="18" y2="9" stroke="rgba(238,241,251,0.55)" stroke-width="1"></line>
        <line x1="12" y1="4" x2="9" y2="14" stroke="rgba(238,241,251,0.55)" stroke-width="1"></line>
        <line x1="9" y1="14" x2="17" y2="18" stroke="rgba(238,241,251,0.55)" stroke-width="1"></line>
        <line x1="18" y1="9" x2="17" y2="18" stroke="rgba(238,241,251,0.55)" stroke-width="1"></line>
        <circle cx="12" cy="4" r="2.1" fill="#6ea8f5"></circle>
        <circle cx="5" cy="7" r="1.5" fill="rgba(238,241,251,0.55)"></circle>
        <circle cx="18" cy="9" r="1.6" fill="rgba(238,241,251,0.55)"></circle>
        <circle cx="9" cy="14" r="1.5" fill="rgba(238,241,251,0.55)"></circle>
        <circle cx="17" cy="18" r="1.7" fill="#6ea8f5"></circle>
      </svg>
      <div class="title"><span class="name">Cortex Constellation</span><span id="stats"></span></div>
    </div>
    <div class="search-wrap">
      <div class="search-inner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="rgba(238,241,251,0.55)" stroke-width="2"></circle>
          <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="rgba(238,241,251,0.55)" stroke-width="2"></line>
        </svg>
        <input id="search" placeholder="Search artifacts, groups, paths…" autocomplete="off">
      </div>
    </div>
    <div id="presets" role="group" aria-label="Preset switcher">
      <button data-preset="default" aria-pressed="true">Default</button>
      <button data-preset="orphans" aria-pressed="false">Orphans</button>
      <button data-preset="domain" aria-pressed="false">Domain</button>
      <input id="domain-input" placeholder="domain, e.g. schema" hidden>
    </div>
  </header>
  <nav id="breadcrumb" aria-label="Breadcrumb"></nav>
  <div id="legend"><span id="legend-title"></span><div id="legend-list"></div></div>
  <div id="zoom-controls">
    <div id="zoom-pct">100%</div>
    <button id="zoom-in" title="Zoom in">+</button>
    <button id="zoom-out" title="Zoom out">&#8722;</button>
    <button id="zoom-reset" title="Reset view">&#10530;</button>
  </div>
  <div id="hint">Each glowing star is a group — zoom in and it dissolves into its artifacts · Scroll to zoom · Drag to pan</div>
  <div id="tooltip" hidden></div>
  <aside id="detail" hidden></aside>
  <p id="message" hidden></p>
</div>
<script>
(function () {
  'use strict';

  // --- Embedded verbatim from src/constellation/lod.ts (single source of ---
  // --- truth for the group-dissolve threshold; unit-tested there). ---
  ${clamp.toString()}
  ${hexWithAlpha.toString()}
  ${computeLOD.toString()}
  ${focusLevel.toString()}
  ${clampScale.toString()}
  ${goldenSpiralPoint.toString()}
  ${starRadius.toString()}

  var CLUSTER = { atlas: '#a892f7', compass: '#f2b45e', specs: '#6ea8f5' };
  var FALLBACK_HUE = '#8fa0c8';
  var UI = { text: '#eef1fb', shadow: 'rgba(5,6,11,0.9)' };
  var HALO_A = 0.22;
  function hue(id) { return CLUSTER[id] || FALLBACK_HUE; }
  function up(s) { return String(s == null ? '' : s).toUpperCase(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- DOM handles ---
  var wrap = document.getElementById('wrap');
  var canvas = document.getElementById('constellation');
  var ctx = canvas.getContext('2d');
  var statsEl = document.getElementById('stats');
  var searchEl = document.getElementById('search');
  var presetsEl = document.getElementById('presets');
  var domainInput = document.getElementById('domain-input');
  var crumbEl = document.getElementById('breadcrumb');
  var legendTitleEl = document.getElementById('legend-title');
  var legendListEl = document.getElementById('legend-list');
  var zoomPctEl = document.getElementById('zoom-pct');
  var hintEl = document.getElementById('hint');
  var tooltipEl = document.getElementById('tooltip');
  var detailEl = document.getElementById('detail');
  var messageEl = document.getElementById('message');

  // --- Mutable UI state (not the map itself — the map is the scene var) ---
  var scene = null;
  var cam = null, camT = null, fit = 1;
  var W = 1200, H = 800, dpr = 1;
  var lodNodeAlpha = 0;
  var state = {
    query: '', hover: null, selectedId: null, mouse: { x: 0, y: 0 },
    showHint: true, focus: { level: 'all', domainId: null, groupId: null },
    zoomPct: 100, preset: 'default', domain: ''
  };
  var dragging = false, moved = false, last = { x: 0, y: 0 }, downPos = { x: 0, y: 0 };
  var prevFocusKey = '', prevZoomShown = -1;

  // =========================================================================
  // Build the static scene (deterministic layout) from the compiled map.
  // Every field derives from real data; nothing is invented.
  // =========================================================================
  function buildScene(map) {
    var domainsRaw = map.groups || [];
    var D = domainsRaw.length;
    var Rx = 900, Ry = 650, gRing = 220;
    var domains = [], groups = [], nodes = [], byId = {}, groupById = {}, domainById = {};
    var nodesByChild = {};
    (map.nodes || []).forEach(function (n) { (nodesByChild[n.group] = nodesByChild[n.group] || []).push(n); });

    domainsRaw.forEach(function (dd, di) {
      var ang = (di / Math.max(1, D)) * Math.PI * 2 - Math.PI / 2;
      var dcx = Math.cos(ang) * Rx, dcy = Math.sin(ang) * Ry;
      var dom = { id: dd.id, label: dd.label, cx: dcx, cy: dcy, groupIds: [], count: 0, spread: 0 };
      domains.push(dom); domainById[dd.id] = dom;
      var children = dd.children || [];
      var G = children.length;
      children.forEach(function (ch, gj) {
        var ga = (gj / Math.max(1, G)) * Math.PI * 2 + di * 0.7;
        var gcx0 = dcx + Math.cos(ga) * gRing, gcy0 = dcy + Math.sin(ga) * gRing;
        var members = nodesByChild[ch.id] || [];
        var grp = { id: ch.id, domainId: dd.id, label: ch.label, cx: gcx0, cy: gcy0, nodeIds: [], count: members.length, spread: 0, starR: 13 };
        dom.groupIds.push(ch.id);
        members.forEach(function (n, k) {
          var p = goldenSpiralPoint(k, 25);
          var node = {
            id: n.id, label: n.label, module: n.module, ref: n.ref,
            groupId: ch.id, domainId: dd.id, wx: gcx0 + p.x, wy: gcy0 + p.y,
            wr: 5, ph: (nodes.length * 1.37) % 6.28, deg: 0
          };
          nodes.push(node); byId[n.id] = node; grp.nodeIds.push(n.id);
        });
        if (grp.nodeIds.length) {
          var mx = 0, my = 0;
          grp.nodeIds.forEach(function (id) { mx += byId[id].wx; my += byId[id].wy; });
          grp.cx = mx / grp.nodeIds.length; grp.cy = my / grp.nodeIds.length;
        }
        var sp = 0;
        grp.nodeIds.forEach(function (id) { sp = Math.max(sp, Math.hypot(byId[id].wx - grp.cx, byId[id].wy - grp.cy)); });
        grp.spread = sp + 32;
        grp.starR = starRadius(grp.count);
        groups.push(grp); groupById[ch.id] = grp;
      });
      var dsp = 0;
      dom.groupIds.forEach(function (id) { var g = groupById[id]; dsp = Math.max(dsp, Math.hypot(g.cx - dcx, g.cy - dcy) + g.spread); });
      dom.spread = dsp + 50;
      dom.count = dom.groupIds.reduce(function (a, id) { return a + groupById[id].count; }, 0);
    });

    // Edges → drawable links + per-node adjacency (kind + direction, real).
    var edges = map.edges || [];
    var links = [], linksByNode = {};
    edges.forEach(function (e) {
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) return;
      links.push({ a: a, b: b });
      (linksByNode[a.id] = linksByNode[a.id] || []).push({ other: b.id, kind: e.kind, dir: 'out' });
      (linksByNode[b.id] = linksByNode[b.id] || []).push({ other: a.id, kind: e.kind, dir: 'in' });
    });
    nodes.forEach(function (n) { n.deg = (linksByNode[n.id] || []).length; n.wr = 5 + Math.sqrt(n.deg) * 2.2; });

    // Aggregate inter-child-group links (for the zoomed-out group view).
    var aggMap = {};
    links.forEach(function (l) {
      var ga = l.a.groupId, gb = l.b.groupId;
      if (ga === gb) return;
      var k = ga < gb ? ga + '|' + gb : gb + '|' + ga;
      aggMap[k] = (aggMap[k] || 0) + 1;
    });
    var aggLinks = Object.keys(aggMap).map(function (k) {
      var p = k.split('|');
      return { a: groupById[p[0]], b: groupById[p[1]], w: aggMap[k] };
    }).filter(function (l) { return l.a && l.b; });

    // Decorative starfield (visual only — not project data).
    var stars = [];
    for (var i = 0; i < 220; i++) {
      stars.push({ x: (Math.random() * 2 - 1) * 2600, y: (Math.random() * 2 - 1) * 1900, r: Math.random() * 0.8 + 0.3, a: Math.random() * 0.5 + 0.2, p: Math.random() * 6.28 });
    }

    // World bounds → fit-all scale.
    var maxX = 1, maxY = 1;
    nodes.forEach(function (n) { maxX = Math.max(maxX, Math.abs(n.wx)); maxY = Math.max(maxY, Math.abs(n.wy)); });
    groups.forEach(function (g) { maxX = Math.max(maxX, Math.abs(g.cx) + g.spread); maxY = Math.max(maxY, Math.abs(g.cy) + g.spread); });
    domains.forEach(function (d) { maxX = Math.max(maxX, Math.abs(d.cx) + d.spread); maxY = Math.max(maxY, Math.abs(d.cy) + d.spread + 40); });

    return {
      domains: domains, groups: groups, nodes: nodes, edges: edges,
      byId: byId, groupById: groupById, domainById: domainById,
      links: links, linksByNode: linksByNode, aggLinks: aggLinks, stars: stars,
      worldW: maxX * 2 * 1.15, worldH: maxY * 2 * 1.2,
      nodeCount: nodes.length, groupCount: groups.length, edgeCount: edges.length
    };
  }

  function externalLinkCount(groupId) {
    if (!scene) return 0;
    return scene.aggLinks.reduce(function (a, l) {
      return a + ((l.a.id === groupId || l.b.id === groupId) ? l.w : 0);
    }, 0);
  }

  // =========================================================================
  // Canvas sizing + camera.
  // =========================================================================
  function resize() {
    var r = wrap.getBoundingClientRect();
    W = r.width || 1200; H = r.height || 800;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    recomputeFit();
  }
  function recomputeFit() {
    if (!scene || !scene.worldW) { fit = 1; return; }
    fit = Math.min(W / scene.worldW, H / scene.worldH);
    if (!isFinite(fit) || fit <= 0) fit = 0.3;
  }
  function resetCamera() {
    recomputeFit();
    cam = { x: 0, y: 0, s: fit };
    camT = { x: 0, y: 0, s: fit };
  }
  function clampS(s) { return clampScale(s, fit); }

  // --- Picking (screen → node/group) ---
  function pickNode(mx, my) {
    if (!scene) return null;
    var s = cam.s, best = null, bd = 1e9;
    for (var i = 0; i < scene.nodes.length; i++) {
      var n = scene.nodes[i];
      var x = (n.wx - cam.x) * s + W / 2, y = (n.wy - cam.y) * s + H / 2;
      var R = Math.max(3, n.wr * s), d = Math.hypot(mx - x, my - y);
      if (d < R + 8 && d < bd) { bd = d; best = n; }
    }
    return best ? { type: 'node', id: best.id } : null;
  }
  function pickGroup(mx, my) {
    if (!scene) return null;
    var s = cam.s, best = null, bd = 1e9;
    for (var i = 0; i < scene.groups.length; i++) {
      var g = scene.groups[i];
      var x = (g.cx - cam.x) * s + W / 2, y = (g.cy - cam.y) * s + H / 2;
      var R = Math.max(8, g.starR * s), d = Math.hypot(mx - x, my - y);
      if (d < R + 10 && d < bd) { bd = d; best = g; }
    }
    return best ? { type: 'group', id: best.id } : null;
  }
  function pickAt(mx, my) { return lodNodeAlpha > 0.5 ? pickNode(mx, my) : pickGroup(mx, my); }

  // --- Camera moves ---
  function zoomToDomain(id) { var d = scene && scene.domainById[id]; if (!d) return; camT = { x: d.cx, y: d.cy, s: fit * 3.4 }; hideHint(); }
  function zoomToGroup(id) { var g = scene && scene.groupById[id]; if (!g) return; camT = { x: g.cx, y: g.cy, s: fit * 9 }; hideHint(); }
  function selectNode(id) {
    var n = scene && scene.byId[id]; if (!n) return;
    camT = { x: n.wx, y: n.wy, s: Math.max(cam.s, fit * 11) };
    state.selectedId = id; state.showHint = false; hintEl.hidden = true;
    syncDetail();
  }
  function deselect() { if (state.selectedId) { state.selectedId = null; syncDetail(); } }
  function hideHint() { if (state.showHint) { state.showHint = false; hintEl.hidden = true; } }

  // =========================================================================
  // Render loop — faithful port of the reference draw(). Positions are static;
  // only the camera lerps. Dissolve alphas come from computeLOD (embedded).
  // =========================================================================
  function loop(time) { draw(time); requestAnimationFrame(loop); }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060b';
    ctx.fillRect(0, 0, W, H);
    if (!scene || !cam) return;

    cam.x += (camT.x - cam.x) * 0.16;
    cam.y += (camT.y - cam.y) * 0.16;
    cam.s += (camT.s - cam.s) * 0.16;
    var s = cam.s, W2 = W / 2, H2 = H / 2;
    function sx(wx) { return (wx - cam.x) * s + W2; }
    function sy(wy) { return (wy - cam.y) * s + H2; }
    var r = s / fit;
    var q = (state.query || '').trim().toLowerCase();

    var lod = computeLOD(r);
    lodNodeAlpha = lod.nodeAlpha;

    // Focus tier (nearest domain/group to the camera centre) + zoom readout.
    var fd = null, bd = 1e9;
    scene.domains.forEach(function (d) { var dd = Math.hypot(d.cx - cam.x, d.cy - cam.y); if (dd < bd) { bd = dd; fd = d; } });
    var fgp = null, bg = 1e9;
    scene.groups.forEach(function (g) { var gd = Math.hypot(g.cx - cam.x, g.cy - cam.y); if (gd < bg) { bg = gd; fgp = g; } });
    var level = focusLevel(r);
    var fdI = fd ? fd.id : null, fgI = fgp ? fgp.id : null;
    var focusKey = level + '|' + fdI + '|' + fgI;
    if (focusKey !== prevFocusKey) {
      prevFocusKey = focusKey;
      state.focus = { level: level, domainId: fdI, groupId: fgI };
      syncBreadcrumb(); syncLegend();
    }
    var pct = Math.round(r * 100);
    if (pct !== prevZoomShown) { prevZoomShown = pct; state.zoomPct = pct; zoomPctEl.textContent = pct + '%'; }

    var hover = state.hover, sel = state.selectedId;
    var selNode = sel ? scene.byId[sel] : null;
    function matchN(n) { return !q || n.label.toLowerCase().indexOf(q) >= 0 || (n.module || '').toLowerCase().indexOf(q) >= 0 || (n.ref || '').toLowerCase().indexOf(q) >= 0; }
    function matchG(g) { return !q || g.label.toLowerCase().indexOf(q) >= 0 || g.nodeIds.some(function (id) { return matchN(scene.byId[id]); }); }

    // Starfield.
    for (var si = 0; si < scene.stars.length; si++) {
      var st = scene.stars[si], sxp = sx(st.x), syp = sy(st.y);
      if (sxp < -20 || sxp > W + 20 || syp < -20 || syp > H + 20) continue;
      ctx.fillStyle = hexWithAlpha('#ffffff', st.a * (0.5 + 0.5 * Math.sin(time * 0.001 + st.p)) * 0.45);
      ctx.beginPath(); ctx.arc(sxp, syp, st.r, 0, 7); ctx.fill();
    }

    // Domain haloes (one signature hue per branch).
    scene.domains.forEach(function (d) {
      var x = sx(d.cx), y = sy(d.cy), rr = d.spread * s * 1.35, col = hue(d.id);
      var dim = q && !scene.groups.some(function (gr) { return gr.domainId === d.id && matchG(gr); }) ? 0.3 : 1;
      var g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, hexWithAlpha(col, HALO_A * 0.55 * dim)); g.addColorStop(1, hexWithAlpha(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    });

    // Group haloes appear as the group dissolves.
    if (lod.nodeAlpha > 0.02) {
      scene.groups.forEach(function (g) {
        var x = sx(g.cx), y = sy(g.cy), rr = g.spread * s * 1.5, col = hue(g.domainId);
        var gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, hexWithAlpha(col, HALO_A * 0.7 * lod.nodeAlpha)); gr.addColorStop(1, hexWithAlpha(col, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      });
    }

    // Inter-group aggregate links (zoomed out, no active search).
    if (lod.groupStarAlpha > 0.02 && !q) {
      scene.aggLinks.forEach(function (l) {
        ctx.strokeStyle = hexWithAlpha('#9fb0dc', clamp(0.05 + l.w * 0.03, 0, 0.4) * lod.groupStarAlpha);
        ctx.lineWidth = Math.min(3, 0.6 + l.w * 0.4);
        ctx.beginPath(); ctx.moveTo(sx(l.a.cx), sy(l.a.cy)); ctx.lineTo(sx(l.b.cx), sy(l.b.cy)); ctx.stroke();
      });
    }

    // Node links (zoomed in).
    if (lod.nodeAlpha > 0.02) {
      scene.links.forEach(function (lk) {
        var a = lk.a, b = lk.b;
        var involved = (selNode && (a.id === sel || b.id === sel)) || (hover && hover.type === 'node' && (a.id === hover.id || b.id === hover.id));
        var col = hexWithAlpha('#8fa0c8', 0.1 * lod.nodeAlpha), wd = 1;
        if (involved) { col = hexWithAlpha(hue(a.domainId), 0.6); wd = 1.6; }
        else if (q && !(matchN(a) && matchN(b))) { col = hexWithAlpha('#8fa0c8', 0.03 * lod.nodeAlpha); }
        ctx.strokeStyle = col; ctx.lineWidth = wd;
        ctx.beginPath(); ctx.moveTo(sx(a.wx), sy(a.wy)); ctx.lineTo(sx(b.wx), sy(b.wy)); ctx.stroke();
      });
    }

    // Group stars (twinkling, glow gradient).
    if (lod.groupStarAlpha > 0.02) {
      scene.groups.forEach(function (g) {
        var x = sx(g.cx), y = sy(g.cy), col = hue(g.domainId);
        var isH = hover && hover.type === 'group' && hover.id === g.id;
        var a = lod.groupStarAlpha; if (q) a *= matchG(g) ? 1 : 0.16;
        var rad = Math.max(3, g.starR * s), tw = 0.7 + 0.3 * Math.sin(time * 0.0014 + g.cx * 0.01);
        var grd = Math.max(10, rad * 3.4), gg = ctx.createRadialGradient(x, y, 0, x, y, grd);
        gg.addColorStop(0, hexWithAlpha(col, 0.55 * a * tw)); gg.addColorStop(0.5, hexWithAlpha(col, 0.16 * a * tw)); gg.addColorStop(1, hexWithAlpha(col, 0));
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, grd, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = hexWithAlpha(col, a); ctx.fill();
        ctx.fillStyle = hexWithAlpha('#ffffff', 0.8 * a); ctx.beginPath(); ctx.arc(x, y, Math.max(1, rad * 0.32), 0, 7); ctx.fill();
        if (isH) { ctx.strokeStyle = hexWithAlpha('#ffffff', 0.7); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, rad + 5, 0, 7); ctx.stroke(); }
      });
    }

    // Artefact dots.
    if (lod.nodeAlpha > 0.02) {
      scene.nodes.forEach(function (n) {
        var x = sx(n.wx), y = sy(n.wy);
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
        var col = hue(n.domainId), rad = Math.max(2, n.wr * s), a = lod.nodeAlpha; if (q) a *= matchN(n) ? 1 : 0.12;
        var tw = 0.72 + 0.28 * Math.sin(time * 0.0016 + n.ph);
        var gr = Math.max(5, rad * 3), g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, hexWithAlpha(col, 0.5 * a * tw)); g.addColorStop(0.5, hexWithAlpha(col, 0.13 * a * tw)); g.addColorStop(1, hexWithAlpha(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = hexWithAlpha(col, a); ctx.fill();
        ctx.fillStyle = hexWithAlpha('#ffffff', 0.72 * a); ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, rad * 0.34), 0, 7); ctx.fill();
        if (n.id === sel || (hover && hover.type === 'node' && hover.id === n.id)) {
          ctx.strokeStyle = hexWithAlpha('#ffffff', n.id === sel ? 0.95 : 0.6);
          ctx.lineWidth = n.id === sel ? 2 : 1.4;
          ctx.beginPath(); ctx.arc(x, y, rad + (n.id === sel ? 6 : 4), 0, 7); ctx.stroke();
        }
      });
    }

    // Labels.
    ctx.textBaseline = 'middle';
    if (lod.topGroupLabelAlpha > 0.02) {
      ctx.textAlign = 'center';
      scene.domains.forEach(function (d) {
        var x = sx(d.cx), y = sy(d.cy - d.spread - 24);
        ctx.font = '700 17px "Space Grotesk",system-ui,sans-serif';
        ctx.fillStyle = hexWithAlpha(UI.text, lod.topGroupLabelAlpha * 0.95);
        ctx.shadowColor = UI.shadow; ctx.shadowBlur = 6; ctx.fillText(d.label, x, y);
        ctx.font = '600 10px "IBM Plex Mono",monospace';
        ctx.fillStyle = hexWithAlpha(hue(d.id), lod.topGroupLabelAlpha);
        ctx.fillText(d.count + ' ARTIFACTS · ' + d.groupIds.length + ' GROUPS', x, y + 16);
        ctx.shadowBlur = 0;
      });
    }
    if (lod.groupLabelAlpha > 0.02) {
      ctx.textAlign = 'center'; ctx.font = '600 12px "Space Grotesk",system-ui,sans-serif';
      scene.groups.forEach(function (g) {
        var off = g.starR * s * lod.groupStarAlpha + g.spread * s * lod.nodeAlpha + 14;
        var x = sx(g.cx), y = sy(g.cy) + off, a = lod.groupLabelAlpha; if (q) a *= matchG(g) ? 1 : 0.2;
        ctx.fillStyle = hexWithAlpha(UI.text, a); ctx.shadowColor = UI.shadow; ctx.shadowBlur = 5;
        ctx.font = '600 12px "Space Grotesk",system-ui,sans-serif'; ctx.fillText(g.label, x, y);
        if (lod.groupStarAlpha > 0.3) {
          ctx.font = '500 9px "IBM Plex Mono",monospace';
          ctx.fillStyle = hexWithAlpha(hue(g.domainId), a * 0.9);
          ctx.fillText(String(g.count), x, y + 13);
        }
        ctx.shadowBlur = 0;
      });
    }
    if (lod.nodeLabelAlpha > 0.02 || q || hover) {
      ctx.textAlign = 'left'; ctx.font = '500 12px "Space Grotesk",system-ui,sans-serif';
      scene.nodes.forEach(function (n) {
        var x = sx(n.wx), y = sy(n.wy);
        if (x < -100 || x > W + 180 || y < -30 || y > H + 30) return;
        var a = lod.nodeLabelAlpha;
        if (q) a = matchN(n) ? Math.max(a, 0.95) : 0;
        if (n.id === sel || (hover && hover.type === 'node' && hover.id === n.id)) a = 1;
        if (a < 0.04) return;
        var rad = Math.max(2, n.wr * s);
        ctx.shadowColor = UI.shadow; ctx.shadowBlur = 4;
        ctx.fillStyle = hexWithAlpha(UI.text, a); ctx.fillText(n.label, x + rad + 7, y); ctx.shadowBlur = 0;
      });
    }
  }

  // =========================================================================
  // Chrome (imperative DOM render on state change — no framework).
  // =========================================================================
  function dot(color, size) {
    return '<span class="dot" style="width:' + size + 'px;height:' + size + 'px;background:' + color + ';box-shadow:0 0 8px ' + color + ';"></span>';
  }

  function syncBreadcrumb() {
    if (!scene) { crumbEl.innerHTML = ''; return; }
    var F = state.focus, parts = [];
    var rootHere = F.level === 'all';
    parts.push('<button data-crumb="all"' + (rootHere ? ' class="here"' : '') + '>All</button>');
    if (F.level !== 'all' && F.domainId && scene.domainById[F.domainId]) {
      var d = scene.domainById[F.domainId];
      parts.push('<span class="sep">▸</span><button data-crumb="domain" data-id="' + esc(d.id) + '"' + (F.level === 'domain' ? ' class="here"' : '') + '>' + esc(d.label) + '</button>');
    }
    if (F.level === 'group' && F.groupId && scene.groupById[F.groupId]) {
      var g = scene.groupById[F.groupId];
      parts.push('<span class="sep">▸</span><button data-crumb="group" data-id="' + esc(g.id) + '" class="here">' + esc(g.label) + '</button>');
    }
    crumbEl.innerHTML = parts.join('');
  }

  function syncLegend() {
    if (!scene) { legendTitleEl.textContent = ''; legendListEl.innerHTML = ''; return; }
    var F = state.focus, title = 'GROUPS · CLICK TO ZOOM', rows = [];
    if (F.level === 'all') {
      rows = scene.domains.map(function (d) {
        return { kind: 'domain', id: d.id, color: hue(d.id), label: d.label, count: d.count };
      });
    } else if (F.level === 'domain' && F.domainId && scene.domainById[F.domainId]) {
      var d0 = scene.domainById[F.domainId];
      title = up(d0.label) + ' · GROUPS';
      rows = d0.groupIds.map(function (id) { return scene.groupById[id]; }).map(function (g) {
        return { kind: 'group', id: g.id, color: hue(g.domainId), label: g.label, count: g.count };
      });
    } else if (F.level === 'group' && F.groupId && scene.groupById[F.groupId]) {
      var g0 = scene.groupById[F.groupId];
      title = up(g0.label) + ' · ARTIFACTS';
      rows = g0.nodeIds.map(function (id) { return scene.byId[id]; }).map(function (n) {
        return { kind: 'node', id: n.id, color: hue(n.domainId), label: n.label, count: n.deg };
      });
    }
    legendTitleEl.textContent = title;
    legendListEl.innerHTML = rows.map(function (row) {
      return '<button data-kind="' + row.kind + '" data-id="' + esc(row.id) + '">' +
        dot(row.color, 9) +
        '<span class="lbl">' + esc(row.label) + '</span>' +
        '<span class="cnt">' + row.count + '</span></button>';
    }).join('');
  }

  function syncTooltip() {
    var h = state.hover;
    if (!h || dragging || !scene) { tooltipEl.hidden = true; return; }
    var m = state.mouse || { x: 0, y: 0 };
    var tipX = clamp(m.x + 16, 12, W - 262), tipY = clamp(m.y + 16, 66, H - 180);
    var html = '';
    if (h.type === 'node') {
      var n = scene.byId[h.id]; if (!n) { tooltipEl.hidden = true; return; }
      var col = hue(n.domainId);
      var kick = esc(scene.domainById[n.domainId].label) + ' · ' + esc(scene.groupById[n.groupId].label);
      html =
        '<div class="kick">' + dot(col, 8) + '<span style="color:' + col + ';">' + kick + '</span></div>' +
        '<div class="tt">' + esc(n.label) + '</div>' +
        '<div class="path">' + esc(n.ref) + '</div>' +
        '<div class="desc">' + esc(n.module) + ' artifact — ' + n.deg + ' connection' + (n.deg === 1 ? '' : 's') + '.</div>' +
        '<div class="meta"><span>◇ ' + n.deg + ' LINKS</span><span>' + up(n.module) + '</span></div>';
    } else {
      var g = scene.groupById[h.id]; if (!g) { tooltipEl.hidden = true; return; }
      var gcol = hue(g.domainId), ext = externalLinkCount(g.id);
      html =
        '<div class="kick">' + dot(gcol, 8) + '<span style="color:' + gcol + ';">' + up(scene.domainById[g.domainId].label) + ' · GROUP</span></div>' +
        '<div class="tt">' + esc(g.label) + '</div>' +
        '<div class="path">' + esc(g.id) + '</div>' +
        '<div class="desc">' + g.count + ' artifacts in this group — click to zoom in and explore them individually.</div>' +
        '<div class="meta"><span>◇ ' + g.count + ' ARTIFACTS</span><span>' + ext + ' EXTERNAL LINKS</span></div>';
    }
    tooltipEl.innerHTML = html;
    tooltipEl.style.left = tipX + 'px';
    tooltipEl.style.top = tipY + 'px';
    tooltipEl.hidden = false;
  }

  function syncDetail() {
    if (!state.selectedId || !scene) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var n = scene.byId[state.selectedId];
    if (!n) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var col = hue(n.domainId);
    var kick = esc(scene.domainById[n.domainId].label) + ' · ' + esc(scene.groupById[n.groupId].label);
    var edgeRows = (scene.linksByNode[n.id] || []).map(function (e) {
      var other = scene.byId[e.other]; if (!other) return '';
      var arrow = e.dir === 'out' ? '→' : '←';
      return '<button data-kind="node" data-id="' + esc(other.id) + '">' +
        dot(hue(other.domainId), 7) +
        '<span class="arr">' + arrow + '</span>' +
        '<span class="et">' + esc(other.label) + '</span>' +
        '<span class="ek">' + esc(e.kind) + '</span></button>';
    }).join('');
    detailEl.innerHTML =
      '<div class="dhead">' +
        '<div class="dkick">' + dot(col, 10) + '<span style="color:' + col + ';">' + kick + '</span></div>' +
        '<button class="close" data-close="1" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="dbody">' +
        '<div class="dtitle">' + esc(n.label) + '</div>' +
        '<div class="dref">' + esc(n.ref) + '</div>' +
        '<div class="dfield"><div class="k">MODULE</div><div class="v">' + esc(n.module) + '</div></div>' +
        '<div class="esec">EDGES · ' + n.deg + '</div>' +
        '<div class="elist">' + (edgeRows || '<div class="ek" style="padding:4px 2px;">No connections.</div>') + '</div>' +
      '</div>';
    detailEl.hidden = false;
  }

  // =========================================================================
  // Data load + preset switching.
  // =========================================================================
  function showMessage(msg) {
    messageEl.textContent = msg || '';
    messageEl.hidden = !msg;
  }

  function onData(map) {
    scene = buildScene(map);
    resetCamera();
    state.hover = null; state.selectedId = null;
    prevFocusKey = ''; prevZoomShown = -1;
    tooltipEl.hidden = true; syncDetail();
    statsEl.textContent = scene.nodeCount + ' ARTIFACTS · ' + scene.groupCount + ' GROUPS · ' + scene.edgeCount + ' EDGES';
    searchEl.placeholder = 'Search ' + scene.nodeCount + ' artifacts, groups, paths…';
    syncBreadcrumb(); syncLegend();
  }

  function load(preset, domain) {
    var qy = '/api/constellation?preset=' + encodeURIComponent(preset);
    if (preset === 'domain') qy += '&domain=' + encodeURIComponent(domain || '');
    fetch(qy).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) { scene = null; showMessage(body.error || ('Request failed (' + res.status + ')')); return; }
        showMessage('');
        onData(body);
      });
    }).catch(function (err) { showMessage(String(err)); });
  }

  function setActivePreset(preset) {
    state.preset = preset;
    Array.prototype.forEach.call(presetsEl.querySelectorAll('button[data-preset]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === preset));
    });
    domainInput.hidden = preset !== 'domain';
    if (preset === 'domain') {
      if (!domainInput.value) { domainInput.focus(); return; }
      load('domain', domainInput.value);
    } else {
      load(preset);
    }
  }

  // =========================================================================
  // Wiring.
  // =========================================================================
  presetsEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-preset]');
    if (!btn) return;
    setActivePreset(btn.getAttribute('data-preset'));
  });
  domainInput.addEventListener('change', function () { if (state.preset === 'domain') load('domain', domainInput.value); });

  searchEl.addEventListener('input', function (e) { hideHint(); state.query = e.target.value; });

  crumbEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-crumb]'); if (!b) return;
    var kind = b.getAttribute('data-crumb');
    if (kind === 'all') { camT = { x: 0, y: 0, s: fit }; hideHint(); }
    else if (kind === 'domain') zoomToDomain(b.getAttribute('data-id'));
    else if (kind === 'group') zoomToGroup(b.getAttribute('data-id'));
  });

  legendListEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-kind]'); if (!b) return;
    var kind = b.getAttribute('data-kind'), id = b.getAttribute('data-id');
    if (kind === 'domain') zoomToDomain(id);
    else if (kind === 'group') zoomToGroup(id);
    else if (kind === 'node') selectNode(id);
  });

  detailEl.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-close]')) { deselect(); return; }
    var b = ev.target.closest('button[data-kind]'); if (!b) return;
    selectNode(b.getAttribute('data-id'));
  });

  document.getElementById('zoom-in').addEventListener('click', function () { camT.s = clampS(camT.s * 1.5); hideHint(); });
  document.getElementById('zoom-out').addEventListener('click', function () { camT.s = clampS(camT.s * 0.66); hideHint(); });
  document.getElementById('zoom-reset').addEventListener('click', function () { camT = { x: 0, y: 0, s: fit }; hideHint(); });

  canvas.addEventListener('pointerdown', function (e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    dragging = true; moved = false; last = { x: mx, y: my }; downPos = { x: mx, y: my };
    canvas.style.cursor = 'grabbing'; hideHint();
    tooltipEl.hidden = true;
  });
  canvas.addEventListener('pointermove', function (e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dragging) {
      var dx = mx - last.x, dy = my - last.y;
      cam.x -= dx / cam.s; cam.y -= dy / cam.s; camT.x = cam.x; camT.y = cam.y;
      last = { x: mx, y: my };
      if (Math.abs(mx - downPos.x) + Math.abs(my - downPos.y) > 4) moved = true;
      return;
    }
    var p = pickAt(mx, my);
    canvas.style.cursor = p ? 'pointer' : 'grab';
    state.hover = p; state.mouse = { x: mx, y: my };
    syncTooltip();
  });
  window.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    canvas.style.cursor = 'grab';
    if (!moved) {
      var p = pickAt(mx, my);
      if (p && p.type === 'node') selectNode(p.id);
      else if (p && p.type === 'group') zoomToGroup(p.id);
      else deselect();
    }
  });
  canvas.addEventListener('pointerleave', function () { if (state.hover) { state.hover = null; syncTooltip(); } });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var wx = (mx - W / 2) / cam.s + cam.x, wy = (my - H / 2) / cam.s + cam.y;
    var ns = clampS(cam.s * Math.exp(-e.deltaY * 0.0014));
    cam.s = ns; cam.x = wx - (mx - W / 2) / ns; cam.y = wy - (my - H / 2) / ns;
    camT.x = cam.x; camT.y = cam.y; camT.s = ns; hideHint();
  }, { passive: false });

  window.addEventListener('resize', resize);

  resize();
  load('default');
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>
`;
