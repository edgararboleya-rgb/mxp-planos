/* =========================================================================
 * MXP Planos — motor de dibujo
 * Unidades del mundo: pulgadas reales. 1 unidad SVG = 1 pulgada.
 * ========================================================================= */
(function () {
  'use strict';

  /* ---------------- utilidades ---------------- */
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var _seq = 1;
  function uid() { return 'e' + (_seq++) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function fmtFtIn(inches) {
    var neg = inches < 0 ? '-' : '';
    inches = Math.abs(inches);
    var p = (window.__mxpState && window.__mxpState.precision) || 4;   // 8=1/8", 4=1/4", 2=1/2", 1=1"
    var total = Math.round(inches * p) / p;
    var ft = Math.floor(total / 12);
    var rem = total - ft * 12;
    var whole = Math.floor(rem + 1e-9);
    var num = Math.round((rem - whole) * p);
    if (num === p) { whole++; num = 0; }
    if (whole === 12) { ft++; whole = 0; }
    var s = neg + ft + "'-" + whole;
    if (num) { var g = gcd(num, p); s += ' ' + (num / g) + '/' + (p / g); }
    return s + '"';
  }

  function parseDist(s) {
    if (!s) return null;
    s = String(s).trim().replace(',', '.');
    var m = s.match(/^(-?[\d.]+)\s*(?:'|ft|pies?)(?:\s*([\d.]+)\s*(?:"|in)?)?$/i);
    if (m) return parseFloat(m[1]) * 12 + (m[2] ? parseFloat(m[2]) : 0);
    m = s.match(/^(-?[\d.]+)\s*(?:"|in|pulg)$/i);
    if (m) return parseFloat(m[1]);
    m = s.match(/^(-?[\d.]+)$/);
    if (m) return parseFloat(m[1]) * 12;   // número solo = pies
    return null;
  }

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* --------- diálogos propios (el visor de artifacts bloquea prompt/confirm/alert) --------- */
  var askCb = null;
  function uiDialog(title, opts, cb) {
    opts = opts || {};
    askCb = cb || function () { };
    document.getElementById('askTitle').textContent = title;
    var inp = document.getElementById('askInput');
    inp.style.display = opts.input ? '' : 'none';
    inp.value = opts.def || '';
    document.getElementById('askCancel').style.display = opts.alert ? 'none' : '';
    document.getElementById('askModal').hidden = false;
    if (opts.input) setTimeout(function () { inp.focus(); inp.select(); }, 50);
  }
  function askClose(result) {
    document.getElementById('askModal').hidden = true;
    var cb = askCb; askCb = null;
    if (cb) cb(result);
  }
  function uiPrompt(title, def, cb) {
    uiDialog(title, { input: true, def: def }, function (ok) {
      cb(ok ? document.getElementById('askInput').value : null);
    });
  }
  function uiConfirm(title, cb) { uiDialog(title, {}, cb); }
  function uiAlert(title) { uiDialog(title, { alert: true }, null); }
  document.getElementById('askOk').addEventListener('click', function () { askClose(true); });
  document.getElementById('askCancel').addEventListener('click', function () { askClose(false); });
  document.getElementById('askInput').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); askClose(true); }
    if (ev.key === 'Escape') { ev.preventDefault(); askClose(false); }
    ev.stopPropagation();
  });

  /* ---------------- estado ---------------- */
  var WALL_TYPES = {
    block: { name: '8" Block', t: 8 },
    block12: { name: '12" Block', t: 12 },
    blockdry: { name: '8" Block + Drywall', t: 8, dry: true },
    drywall25: { name: 'Drywall 2½" (furred)', t: 2.5 },
    drywall35: { name: 'Drywall 3½"', t: 3.5 },
    drywall: { name: 'Drywall 4½" (2x4 + gyp)', t: 4.5 },
    drywall6: { name: 'Drywall 6" (2x6)', t: 6 }
  };
  var OPEN_DEFAULT = { door: 36, double: 60, bifold: 48, pocket: 32, window: 36, slider: 72, opening: 48 };
  var OPEN_NAMES = { door: 'Door', double: 'Double Door', bifold: 'Bifold Door', pocket: 'Pocket Door', window: 'Window', slider: 'Sliding Door', opening: 'Opening' };

  // patrones de superficie/techo (unidades: pulgadas reales)
  var PAT_STROKE = ' stroke="#8a8578" stroke-width="0.7" fill="none"';
  var AREA_PATTERNS = {
    none: { name: 'Outline only (no fill)', w: 4, h: 4, content: '' },
    wood_floor: { name: 'Wood / Laminate Floor', w: 36, h: 10,
      content: '<path d="M0,0 H36 M0,5 H36 M18,0 V5 M6,5 V10"' + PAT_STROKE + '/>' },
    tile18: { name: 'Tile 18×18', w: 18, h: 18,
      content: '<path d="M18,0 H0 V18"' + PAT_STROKE + '/>' },
    countertop: { name: 'Countertop (granite)', w: 16, h: 16,
      content: '<circle cx="3" cy="4" r="0.6" fill="#8a8578" stroke="none"/><circle cx="10" cy="2" r="0.4" fill="#8a8578" stroke="none"/>' +
        '<circle cx="13" cy="9" r="0.7" fill="#8a8578" stroke="none"/><circle cx="6" cy="12" r="0.5" fill="#8a8578" stroke="none"/>' +
        '<circle cx="14" cy="14" r="0.4" fill="#8a8578" stroke="none"/><line x1="8" y1="7" x2="9.5" y2="8"' + PAT_STROKE + '/>' },
    carpet: { name: 'Carpet', w: 12, h: 12,
      content: '<line x1="2" y1="3" x2="4" y2="3"' + PAT_STROKE + '/><line x1="8" y1="9" x2="10" y2="9"' + PAT_STROKE + '/>' },
    pergola: { name: 'Pergola Roof', w: 18, h: 18,
      content: '<line x1="2.5" y1="0" x2="2.5" y2="18"' + PAT_STROKE + '/><line x1="7.5" y1="0" x2="7.5" y2="18"' + PAT_STROKE + '/>' },
    deck: { name: 'Wood Deck', w: 6, h: 96,
      content: '<line x1="0" y1="0" x2="0" y2="96"' + PAT_STROKE + '/><line x1="0" y1="0" x2="6" y2="0"' + PAT_STROKE + '/>' },
    pavers: { name: 'Pavers 8×4', w: 8, h: 8,
      content: '<path d="M0,0 H8 M0,4 H8 M0,0 V4 M4,4 V8"' + PAT_STROKE + '/>' },
    pavers45: { name: 'Pavers 45°', w: 8, h: 8, rot: 45,
      content: '<path d="M0,0 H8 M0,4 H8 M0,0 V4 M4,4 V8"' + PAT_STROKE + '/>' },
    tile: { name: 'Tile 12×12', w: 12, h: 12,
      content: '<path d="M12,0 H0 V12"' + PAT_STROKE + '/>' },
    gravel: { name: 'Gravel / Stone', w: 14, h: 14,
      content: '<circle cx="3" cy="4" r="1.2"' + PAT_STROKE + '/><circle cx="9" cy="2" r="0.9"' + PAT_STROKE + '/>' +
        '<circle cx="6.5" cy="9" r="1.4"' + PAT_STROKE + '/><circle cx="11.5" cy="11" r="1"' + PAT_STROKE + '/><circle cx="2" cy="12" r="0.8"' + PAT_STROKE + '/>' },
    concrete: { name: 'Concrete', w: 20, h: 20,
      content: '<circle cx="4" cy="5" r="0.5" fill="#8a8578" stroke="none"/><circle cx="14" cy="3" r="0.5" fill="#8a8578" stroke="none"/>' +
        '<circle cx="9" cy="12" r="0.5" fill="#8a8578" stroke="none"/><circle cx="17" cy="16" r="0.5" fill="#8a8578" stroke="none"/><circle cx="3" cy="17" r="0.5" fill="#8a8578" stroke="none"/>' }
  };

  var state = {
    walls: [],     // {id,x1,y1,x2,y2,type,t}
    openings: [],  // {id,wallId,type,pos,w,swing,hinge}
    symbols: [],   // {id,key,x,y,rot,scale}
    texts: [],     // {id,x,y,text,size}
    dims: [],      // {id,x1,y1,x2,y2,off}
    areas: [],     // {id,pts:[[x,y]…],pattern,rot}
    wires: [],     // {id,x1,y1,x2,y2,style,side,bulge}
    leaders: [],   // {id,tx,ty,x,y,text,size}
    bg: null,      // {url,x,y,w,h,opacity}
    bg2: null,     // overlay de comparación (plano rojo encima del azul)
    panels: [],    // panel schedules E-2
    precision: 4,  // fracción de pulgada para medidas (8=1/8")
    sheets: [{ no: 'E-1', title: '', data: null }],   // multi-hoja: cada hoja guarda su dibujo
    curSheet: 0,
    project: { name: '', client: '', address: '', job: '', sheetNo: '', sheetTitle: '', drawn: '' }
  };
  window.__mxpState = state;
  var view = { tx: 120, ty: 90, z: 1 };
  var measure = null;                 // medición transitoria
  var sel = null;                     // {kind,id}
  var selGroup = null;                // [{kind,id},…] selección múltiple (marquee)
  var clipboard = null;               // portapapeles interno (Ctrl+C/V)
  var lastMouseWorld = [0, 0];
  var tool = 'select';
  var placingKey = null;              // símbolo en colocación
  var placingRot = 0;
  var lastWireStyle = 'dashed';       // la herramienta Cable recuerda el último estilo

  var svg = $('#canvas');
  var G = {
    grid: $('#gGridBase'), bg: $('#gBackground'), areas: $('#gAreas'), walls: $('#gWalls'),
    furn: $('#gFurniture'), elec: $('#gElectrical'), annot: $('#gAnnot'),
    meas: $('#gMeasure'), prev: $('#gPreview'), sel: $('#gSel'), world: $('#world')
  };

  /* ---------------- deshacer / rehacer ---------------- */
  var undoStack = [], redoStack = [];
  function snapshot() {
    return JSON.stringify({
      walls: state.walls, openings: state.openings, symbols: state.symbols,
      texts: state.texts, dims: state.dims, areas: state.areas,
      wires: state.wires, leaders: state.leaders, panels: state.panels,
      bgMeta: state.bg ? { x: state.bg.x, y: state.bg.y, w: state.bg.w, h: state.bg.h, opacity: state.bg.opacity } : null,
      bg2Meta: state.bg2 ? { x: state.bg2.x, y: state.bg2.y, w: state.bg2.w, h: state.bg2.h, opacity: state.bg2.opacity } : null
    });
  }
  function pushUndo(snap) {
    undoStack.push(snap || snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    scheduleAutosave();
  }
  // guardado automático en el navegador: nada se pierde si se cierra la ventana
  var autosaveTimer = null;
  function scheduleAutosave() { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(doAutosave, 1500); }
  function doAutosave() {
    try {
      syncSheet();
      localStorage.setItem('mxp_autosave', JSON.stringify({ app: 'mxp-planos', version: 1, state: state, view: view }));
    } catch (e) { /* sin espacio (planos muy pesados): se guarda con 💾 */ }
  }
  function applySnap(snap) {
    var o = JSON.parse(snap);
    state.walls = o.walls; state.openings = o.openings; state.symbols = o.symbols;
    state.texts = o.texts; state.dims = o.dims; state.areas = o.areas || [];
    state.wires = o.wires || []; state.leaders = o.leaders || [];
    state.panels = o.panels || [];
    if (state.bg && o.bgMeta) { state.bg.x = o.bgMeta.x; state.bg.y = o.bgMeta.y; state.bg.w = o.bgMeta.w; state.bg.h = o.bgMeta.h; state.bg.opacity = o.bgMeta.opacity; }
    if (state.bg2 && o.bg2Meta) { state.bg2.x = o.bg2Meta.x; state.bg2.y = o.bg2Meta.y; state.bg2.w = o.bg2Meta.w; state.bg2.h = o.bg2Meta.h; state.bg2.opacity = o.bg2Meta.opacity; }
    sel = null;
    refresh();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); applySnap(undoStack.pop()); setHint('Deshecho'); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); applySnap(redoStack.pop()); }

  /* ---------------- geometría ---------------- */
  function wallGeom(w) {
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    var len = Math.hypot(dx, dy) || 1e-6;
    return { ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len, len: len };
  }
  function wallOpenings(w) {
    return state.openings.filter(function (o) { return o.wallId === w.id; })
      .sort(function (a, b) { return a.pos - b.pos; });
  }
  function ptAlong(w, g, d) { return [w.x1 + g.ux * d, w.y1 + g.uy * d]; }
  function polyArea(pts) {
    var s = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    }
    return Math.abs(s) / 2;
  }
  function pointInPoly(p, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function distToSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    var t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t: t };
  }

  /* ---------------- conversión de coordenadas ---------------- */
  function screenToWorld(sx, sy) {
    var r = svg.getBoundingClientRect();
    return [(sx - r.left - view.tx) / view.z, (sy - r.top - view.ty) / view.z];
  }
  function applyView() {
    G.world.setAttribute('transform', 'translate(' + view.tx + ' ' + view.ty + ') scale(' + view.z + ')');
    $('#zoomLabel').textContent = Math.round(view.z * 100) + '%';
  }

  /* ---------------- snap ---------------- */
  // OSNAP: agarra extremos, puntos medios, centros de símbolos y vértices cercanos
  function osnapPt(p) {
    var r = 9 / view.z + 3, best = null;
    function cand(x, y, kind) {
      var d = Math.hypot(p[0] - x, p[1] - y);
      if (d < r && (!best || d < best.d)) best = { x: x, y: y, d: d, kind: kind };
    }
    state.walls.forEach(function (w) {
      cand(w.x1, w.y1, 'end'); cand(w.x2, w.y2, 'end');
      cand((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, 'mid');
    });
    state.symbols.forEach(function (s) { cand(s.x, s.y, 'center'); });
    state.wires.forEach(function (w) { cand(w.x1, w.y1, 'end'); cand(w.x2, w.y2, 'end'); });
    state.areas.forEach(function (a) { a.pts.forEach(function (q) { cand(q[0], q[1], 'end'); }); });
    state.dims.forEach(function (d) { cand(d.x1, d.y1, 'end'); cand(d.x2, d.y2, 'end'); });
    return best;
  }
  var SNAP_TOOLS = { measure: 1, dim: 1, calibrate: 1, wire: 1, leader: 1, pline: 1, area: 1, rect: 1, ellipse: 1, cloud: 1 };
  function osnapMarker(sn) {
    if (!sn) return '';
    var r = 4.5 / view.z + 1;
    if (sn.kind === 'mid') {
      // triángulo para punto medio
      return '<polygon class="osnap" points="' + sn.x + ',' + (sn.y - r * 1.2) + ' ' + (sn.x + r * 1.2) + ',' + (sn.y + r) + ' ' + (sn.x - r * 1.2) + ',' + (sn.y + r) + '"/>';
    }
    if (sn.kind === 'center') return '<circle class="osnap" cx="' + sn.x + '" cy="' + sn.y + '" r="' + r + '"/>';
    return '<rect class="osnap" x="' + (sn.x - r) + '" y="' + (sn.y - r) + '" width="' + (r * 2) + '" height="' + (r * 2) + '"/>';
  }
  function applyOsnap(p) {
    // el snap no aplica al segundo clic del callout (posición del texto libre)
    if (drawing && drawing.mode === 'twopoint' && drawing.kind === 'leader') return { p: p, sn: null };
    var sn = osnapPt(p);
    return sn ? { p: [sn.x, sn.y], sn: sn } : { p: p, sn: null };
  }

  function snapWallPt(p) {
    // primero a extremos y puntos medios de paredes existentes
    for (var i = 0; i < state.walls.length; i++) {
      var w = state.walls[i];
      if (Math.hypot(p[0] - w.x1, p[1] - w.y1) < 9 / view.z + 4) return [w.x1, w.y1];
      if (Math.hypot(p[0] - w.x2, p[1] - w.y2) < 9 / view.z + 4) return [w.x2, w.y2];
      var mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      if (Math.hypot(p[0] - mx, p[1] - my) < 9 / view.z + 4) return [mx, my];
    }
    var gs = 6; // rejilla de 6"
    return [Math.round(p[0] / gs) * gs, Math.round(p[1] / gs) * gs];
  }
  // con Shift: bloquea a horizontal o vertical exacto desde el punto inicial
  function orthoLock(a, b) {
    return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
  }
  // colores predeterminados para formas y líneas (funcionan en cualquier visor)
  var COLOR_PRESETS = [
    ['#14161a', 'Negro'], ['#c62828', 'Rojo'], ['#1c5fa8', 'Azul'], ['#2e7d32', 'Verde'],
    ['#f9a825', 'Amarillo'], ['#ef6c00', 'Naranja'], ['#6a1b9a', 'Morado'], ['#757575', 'Gris']
  ];

  // tipo activo de cada herramienta (se elige con la flechita ▾ del botón)
  var curAreaPattern = 'pavers';
  var curDoorType = 'door', curWinType = 'window';
  var pendingAreaLabel = false;   // la próxima área/polilínea muestra su medida en el plano

  // ORTHO 90°: como en AutoCAD (F8) — las líneas se mantienen rectas sin apretar Shift
  var orthoOn = false;
  function setOrtho(v) {
    orthoOn = v;
    $('#btnOrtho').classList.toggle('active', orthoOn);
    setHint(orthoOn ? 'ORTHO 90° activado — las líneas salen rectas (F8 o el botón para apagarlo)' : 'ORTHO 90° apagado');
  }
  $('#btnOrtho').addEventListener('click', function () { setOrtho(!orthoOn); });
  function wantOrtho(ev) { return orthoOn || (ev && ev.shiftKey); }
  function orthoSnap(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var ang = Math.atan2(dy, dx);
    var step = Math.PI / 4;
    var snapAng = Math.round(ang / step) * step;
    if (Math.abs(ang - snapAng) < (10 * Math.PI / 180)) {
      var len = Math.hypot(dx, dy);
      return [a[0] + Math.cos(snapAng) * len, a[1] + Math.sin(snapAng) * len];
    }
    return b;
  }

  /* ---------------- render: paredes ---------------- */
  function wallSegs(w) {
    var g = wallGeom(w), ops = wallOpenings(w), segs = [], d = 0, i;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i], d0 = Math.max(0, o.pos - o.w / 2), d1 = Math.min(g.len, o.pos + o.w / 2);
      if (d0 > d) segs.push([d, d0]);
      d = Math.max(d, d1);
    }
    if (d < g.len - 0.01) segs.push([d, g.len]);
    return { g: g, segs: segs, ops: ops };
  }

  /* --- uniones limpias entre paredes (esquinas a inglete, T y cruces) --- */
  function offPt(w, g, d, sign, t) {
    var P = ptAlong(w, g, d);
    return [P[0] + g.nx * sign * t, P[1] + g.ny * sign * t];
  }

  function computeJoins() {
    var joins = {}, cuts = {};
    var TOL = 1.0;
    var nodes = [];
    state.walls.forEach(function (w) {
      joins[w.id] = { s: null, e: null };
      cuts[w.id] = { plus: [], minus: [] };
    });
    function nodeFor(x, y) {
      for (var i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < TOL) return nodes[i];
      }
      var n = { x: x, y: y, ends: [] };
      nodes.push(n); return n;
    }
    state.walls.forEach(function (w) {
      nodeFor(w.x1, w.y1).ends.push({ w: w, atStart: true });
      nodeFor(w.x2, w.y2).ends.push({ w: w, atStart: false });
    });

    function plainEnd(w, atStart) {
      var g = wallGeom(w), t = w.t / 2;
      var P = atStart ? [w.x1, w.y1] : [w.x2, w.y2];
      return { p: [P[0] + g.nx * t, P[1] + g.ny * t], m: [P[0] - g.nx * t, P[1] - g.ny * t], cap: true };
    }
    function setJoin(w, atStart, val) { joins[w.id][atStart ? 's' : 'e'] = val; }

    // punto de encuentro de dos bordes en un nodo (inglete)
    function miterPoint(nd, a, b) {
      var oA = [nd.x - a.uy * a.t / 2, nd.y + a.ux * a.t / 2];   // borde CCW de a
      var oB = [nd.x + b.uy * b.t / 2, nd.y - b.ux * b.t / 2];   // borde CW de b
      var cross = a.ux * b.uy - a.uy * b.ux;
      if (Math.abs(cross) < 1e-6) return [(oA[0] + oB[0]) / 2, (oA[1] + oB[1]) / 2];
      var dx = oB[0] - oA[0], dy = oB[1] - oA[1];
      var s = (dx * b.uy - dy * b.ux) / cross;
      var Qx = oA[0] + s * a.ux, Qy = oA[1] + s * a.uy;
      if (Math.hypot(Qx - nd.x, Qy - nd.y) > 3 * Math.max(a.t, b.t)) {
        return [(oA[0] + oB[0]) / 2, (oA[1] + oB[1]) / 2];
      }
      return [Qx, Qy];
    }

    // nodos donde coinciden extremos de dos o más paredes.
    // Solo se sueldan con inglete las paredes del MISMO material: una pared de
    // drywall que llega a una esquina de bloque se recorta contra la cara del
    // bloque (más abajo, como unión en T) en vez de meterse dentro.
    nodes.forEach(function (nd) {
      if (nd.ends.length < 2) return;
      var byType = {};
      nd.ends.forEach(function (e) { (byType[e.w.type] = byType[e.w.type] || []).push(e); });
      Object.keys(byType).forEach(function (ty) {
        var grp = byType[ty];
        var k = grp.length;
        if (k < 2) return;   // extremo suelto de otro material: lo resuelve la unión en T
        var ends = grp.map(function (e) {
          var g = wallGeom(e.w);
          return { e: e, ux: e.atStart ? g.ux : -g.ux, uy: e.atStart ? g.uy : -g.uy, t: e.w.t };
        });
        ends.forEach(function (a) { a.ang = Math.atan2(a.uy, a.ux); });
        ends.sort(function (a, b) { return a.ang - b.ang; });
        var Q = [];
        for (var m = 0; m < k; m++) Q.push(miterPoint(nd, ends[m], ends[(m + 1) % k]));
        for (m = 0; m < k; m++) {
          var a = ends[m];
          var qCCW = Q[m], qCW = Q[(m - 1 + k) % k];
          setJoin(a.e.w, a.e.atStart,
            a.e.atStart ? { p: qCCW, m: qCW, cap: false } : { p: qCW, m: qCCW, cap: false });
        }
      });
    });

    // uniones en T: extremo libre que cae sobre el cuerpo de otra pared
    state.walls.forEach(function (w) {
      ['s', 'e'].forEach(function (endKey) {
        if (joins[w.id][endKey]) return;
        var atStart = endKey === 's';
        var P = atStart ? [w.x1, w.y1] : [w.x2, w.y2];
        var other = atStart ? [w.x2, w.y2] : [w.x1, w.y1];
        var wg = wallGeom(w);
        var host = null, hr = null;
        state.walls.forEach(function (h) {
          if (h.id === w.id) return;
          var hg2 = wallGeom(h);
          if (Math.abs(wg.ux * hg2.uy - wg.uy * hg2.ux) < 0.05) return;   // casi paralelas: no hay cara contra la cual recortar
          var r = distToSeg(P[0], P[1], h.x1, h.y1, h.x2, h.y2);
          var d = r.t * hg2.len;
          if (r.d <= h.t / 2 + 0.75 && (!host || r.d < hr.dist)) {
            host = h; hr = { d: d, dist: r.d };
          }
        });
        if (!host) { setJoin(w, atStart, plainEnd(w, atStart)); return; }
        var hg = wallGeom(host);
        var cross = wg.ux * hg.uy - wg.uy * hg.ux;
        if (Math.abs(cross) < 1e-6) { setJoin(w, atStart, plainEnd(w, atStart)); return; }
        var proj = [host.x1 + hg.ux * hr.d, host.y1 + hg.uy * hr.d];
        var sside = ((other[0] - proj[0]) * hg.nx + (other[1] - proj[1]) * hg.ny) >= 0 ? 1 : -1;
        // la rama se recorta contra la cara del host que la enfrenta
        var F = [proj[0] + hg.nx * sside * host.t / 2, proj[1] + hg.ny * sside * host.t / 2];
        function edgeHit(sign) {
          var E = [P[0] + wg.nx * sign * w.t / 2, P[1] + wg.ny * sign * w.t / 2];
          var dx = F[0] - E[0], dy = F[1] - E[1];
          var s2 = (dx * hg.uy - dy * hg.ux) / cross;
          return [E[0] + s2 * wg.ux, E[1] + s2 * wg.uy];
        }
        setJoin(w, atStart, { p: edgeHit(1), m: edgeHit(-1), cap: false });
        // mismo material: se abre la cara del host para que la unión sea continua
        if (host.type === w.type) {
          (sside > 0 ? cuts[host.id].plus : cuts[host.id].minus).push([hr.d - w.t / 2, hr.d + w.t / 2]);
        }
      });
    });

    state.walls.forEach(function (w) {
      if (!joins[w.id].s) joins[w.id].s = plainEnd(w, true);
      if (!joins[w.id].e) joins[w.id].e = plainEnd(w, false);
    });
    return { joins: joins, cuts: cuts };
  }

  function edgeLines(w, g, t, sg, sign, sPt, ePt, cutList) {
    var pieces = [[sg[0], sg[1]]];
    (cutList || []).forEach(function (c) {
      var next = [];
      pieces.forEach(function (p) {
        if (c[1] <= p[0] || c[0] >= p[1]) { next.push(p); return; }
        if (c[0] > p[0]) next.push([p[0], c[0]]);
        if (c[1] < p[1]) next.push([c[1], p[1]]);
      });
      pieces = next;
    });
    var s = '';
    pieces.forEach(function (p) {
      var P1 = (p[0] === sg[0]) ? sPt : offPt(w, g, p[0], sign, t);
      var P2 = (p[1] === sg[1]) ? ePt : offPt(w, g, p[1], sign, t);
      s += '<line class="wall-edge" x1="' + P1[0] + '" y1="' + P1[1] + '" x2="' + P2[0] + '" y2="' + P2[1] + '"/>';
    });
    return s;
  }

  function renderWalls() {
    var jc = computeJoins();
    var out = '';
    state.walls.forEach(function (w) {
      var info = wallSegs(w), g = info.g, t = w.t / 2;
      var J = jc.joins[w.id], cut = jc.cuts[w.id];
      var fillCls = (w.type === 'block' || w.type === 'block12' || w.type === 'blockdry') ? 'wall-fill-block' : 'wall-fill-drywall';
      info.segs.forEach(function (sg) {
        var atS = sg[0] < 0.01, atE = sg[1] > g.len - 0.01;
        var aP = atS ? J.s.p : offPt(w, g, sg[0], 1, t);
        var aM = atS ? J.s.m : offPt(w, g, sg[0], -1, t);
        var bP = atE ? J.e.p : offPt(w, g, sg[1], 1, t);
        var bM = atE ? J.e.m : offPt(w, g, sg[1], -1, t);
        out += '<path class="' + fillCls + '" d="M' + aP + ' L' + bP + ' L' + bM + ' L' + aM + ' Z"/>';
        out += edgeLines(w, g, t, sg, 1, aP, bP, cut.plus);
        out += edgeLines(w, g, t, sg, -1, aM, bM, cut.minus);
        if (atS ? J.s.cap : true) out += '<line class="wall-edge" x1="' + aP[0] + '" y1="' + aP[1] + '" x2="' + aM[0] + '" y2="' + aM[1] + '"/>';
        if (atE ? J.e.cap : true) out += '<line class="wall-edge" x1="' + bP[0] + '" y1="' + bP[1] + '" x2="' + bM[0] + '" y2="' + bM[1] + '"/>';
      });
      // línea fina de drywall al frente del bloque (furring)
      if (WALL_TYPES[w.type] && WALL_TYPES[w.type].dry) {
        var sideD = w.drySide || 1, offD = t + 1.5;
        info.segs.forEach(function (sg) {
          var P1 = offPt(w, g, sg[0], sideD, offD), P2 = offPt(w, g, sg[1], sideD, offD);
          out += '<line class="furr-line" x1="' + P1[0] + '" y1="' + P1[1] + '" x2="' + P2[0] + '" y2="' + P2[1] + '"/>';
        });
      }
      info.ops.forEach(function (o) { out += renderOpening(w, g, o); });
    });
    G.walls.innerHTML = out;
  }

  function renderOpening(w, g, o) {
    var t = w.t / 2;
    var d0 = o.pos - o.w / 2, d1 = o.pos + o.w / 2;
    var A = ptAlong(w, g, d0), B = ptAlong(w, g, d1);
    var s = '';
    if (o.type === 'window') {
      // tres líneas: bordes y vidrio central
      [t, 0, -t].forEach(function (off) {
        s += '<line class="win-line" x1="' + (A[0] + g.nx * off) + '" y1="' + (A[1] + g.ny * off) +
          '" x2="' + (B[0] + g.nx * off) + '" y2="' + (B[1] + g.ny * off) + '"/>';
      });
    } else if (o.type === 'slider') {
      var M = ptAlong(w, g, o.pos);
      s += '<line class="door-leaf" x1="' + (A[0] + g.nx * t * 0.45) + '" y1="' + (A[1] + g.ny * t * 0.45) +
        '" x2="' + (M[0] + g.ux * 3 + g.nx * t * 0.45) + '" y2="' + (M[1] + g.uy * 3 + g.ny * t * 0.45) + '"/>';
      s += '<line class="door-leaf" x1="' + (M[0] - g.ux * 3 - g.nx * t * 0.45) + '" y1="' + (M[1] - g.uy * 3 - g.ny * t * 0.45) +
        '" x2="' + (B[0] - g.nx * t * 0.45) + '" y2="' + (B[1] - g.ny * t * 0.45) + '"/>';
    } else if (o.type === 'opening') {
      s += '<line class="door-arc" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '"/>';
    } else if (o.type === 'double') {
      // dos hojas con bisagra en cada jamba, arcos hacia el centro
      var Mm = ptAlong(w, g, o.pos), sw2 = o.swing || 1, half = o.w / 2;
      var E1 = [A[0] + g.nx * sw2 * half, A[1] + g.ny * sw2 * half];
      var E2 = [B[0] + g.nx * sw2 * half, B[1] + g.ny * sw2 * half];
      s += '<line class="door-leaf" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + E1[0] + '" y2="' + E1[1] + '"/>';
      s += '<line class="door-leaf" x1="' + B[0] + '" y1="' + B[1] + '" x2="' + E2[0] + '" y2="' + E2[1] + '"/>';
      var c1 = (E1[0] - A[0]) * (Mm[1] - A[1]) - (E1[1] - A[1]) * (Mm[0] - A[0]);
      var c2 = (E2[0] - B[0]) * (Mm[1] - B[1]) - (E2[1] - B[1]) * (Mm[0] - B[0]);
      s += '<path class="door-arc" d="M' + E1[0] + ',' + E1[1] + ' A' + half + ',' + half + ' 0 0,' + (c1 > 0 ? 1 : 0) + ' ' + Mm[0] + ',' + Mm[1] + '"/>';
      s += '<path class="door-arc" d="M' + E2[0] + ',' + E2[1] + ' A' + half + ',' + half + ' 0 0,' + (c2 > 0 ? 1 : 0) + ' ' + Mm[0] + ',' + Mm[1] + '"/>';
    } else if (o.type === 'bifold') {
      // paneles plegables en zigzag desde ambas jambas al centro
      var Mb = ptAlong(w, g, o.pos), swb = o.swing || 1, q = o.w / 4;
      var P1 = [A[0] + g.ux * q + g.nx * swb * q, A[1] + g.uy * q + g.ny * swb * q];
      var P2 = [B[0] - g.ux * q + g.nx * swb * q, B[1] - g.uy * q + g.ny * swb * q];
      s += '<path class="door-leaf" d="M' + A[0] + ',' + A[1] + ' L' + P1[0] + ',' + P1[1] + ' L' + Mb[0] + ',' + Mb[1] + '" fill="none"/>';
      s += '<path class="door-leaf" d="M' + B[0] + ',' + B[1] + ' L' + P2[0] + ',' + P2[1] + ' L' + Mb[0] + ',' + Mb[1] + '" fill="none"/>';
    } else if (o.type === 'pocket') {
      // hoja medio abierta sobre la línea central + bolsillo discontinuo dentro de la pared
      var Mp = ptAlong(w, g, o.pos);
      s += '<line class="door-leaf" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + Mp[0] + '" y2="' + Mp[1] + '" stroke-width="2"/>';
      var back = Math.max(0, d0 - o.w / 2);
      var Pb = ptAlong(w, g, back);
      [t * 0.4, -t * 0.4].forEach(function (off) {
        s += '<line class="door-arc" x1="' + (Pb[0] + g.nx * off) + '" y1="' + (Pb[1] + g.ny * off) +
          '" x2="' + (A[0] + g.nx * off) + '" y2="' + (A[1] + g.ny * off) + '"/>';
      });
    } else { // door
      var hingeEnd = o.hinge ? d1 : d0;
      var H = ptAlong(w, g, hingeEnd);
      var Jd = o.hinge ? d0 : d1;
      var J = ptAlong(w, g, Jd);
      var sw = o.swing || 1;
      var E = [H[0] + g.nx * sw * o.w, H[1] + g.ny * sw * o.w];
      s += '<line class="door-leaf" x1="' + H[0] + '" y1="' + H[1] + '" x2="' + E[0] + '" y2="' + E[1] + '"/>';
      var cross = (E[0] - H[0]) * (J[1] - H[1]) - (E[1] - H[1]) * (J[0] - H[0]);
      var sweep = cross > 0 ? 1 : 0;
      s += '<path class="door-arc" d="M' + E[0] + ',' + E[1] + ' A' + o.w + ',' + o.w + ' 0 0,' + sweep + ' ' + J[0] + ',' + J[1] + '"/>';
    }
    // jambas
    [d0, d1].forEach(function (dd) {
      var P = ptAlong(w, g, dd);
      s += '<line class="jamb" x1="' + (P[0] + g.nx * t) + '" y1="' + (P[1] + g.ny * t) +
        '" x2="' + (P[0] - g.nx * t) + '" y2="' + (P[1] - g.ny * t) + '"/>';
    });
    return s;
  }

  /* ---------------- render: superficies / techos ---------------- */
  function ensurePattern(type, rot) {
    var p = AREA_PATTERNS[type]; if (!p) return null;
    var totalRot = ((p.rot || 0) + (rot || 0)) % 360;
    var id = 'pat_' + type + '_' + totalRot;
    if (document.getElementById(id)) return id;
    var defs = svg.querySelector('defs');
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    el.setAttribute('id', id);
    el.setAttribute('width', p.w); el.setAttribute('height', p.h);
    el.setAttribute('patternUnits', 'userSpaceOnUse');
    if (totalRot) el.setAttribute('patternTransform', 'rotate(' + totalRot + ')');
    el.innerHTML = p.content;
    defs.appendChild(el);
    return id;
  }
  function areaPath(a) {
    return 'M' + a.pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + (a.open ? '' : ' Z');
  }
  // contorno de nube de revisión: arcos festoneados a lo largo de cada lado
  function cloudPath(pts, closed) {
    var r = 9, n = pts.length, segs = closed ? n : n - 1;
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < segs; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var steps = Math.max(1, Math.round(len / (r * 1.5)));
      for (var k = 1; k <= steps; k++) {
        var x = a[0] + (b[0] - a[0]) * k / steps;
        var y = a[1] + (b[1] - a[1]) * k / steps;
        d += ' A' + r + ',' + r + ' 0 0 1 ' + x.toFixed(1) + ',' + y.toFixed(1);
      }
    }
    return d + (closed ? ' Z' : '');
  }
  function polyPerim(pts, open) {
    var s = 0, n = pts.length, segs = open ? n - 1 : n;
    for (var i = 0; i < segs; i++) {
      var b = pts[(i + 1) % n];
      s += Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]);
    }
    return s;
  }
  function renderAreas() {
    var out = '';
    state.areas.forEach(function (a) {
      var fill;
      if (a.open || a.pattern === 'none' || !AREA_PATTERNS[a.pattern]) fill = 'none';
      else fill = 'url(#' + ensurePattern(a.pattern, a.rot || 0) + ')';
      var d = a.lineStyle === 'cloud' ? cloudPath(a.pts, !a.open) : areaPath(a);
      var dash = a.lineStyle === 'dashed' ? ' stroke-dasharray="6 4"' : '';
      var col = a.color || '#14161a', lw = a.lw || 0.9;
      out += '<path data-id="' + a.id + '" d="' + d + '" fill="' + fill + '" stroke="' + col + '" stroke-width="' + lw + '" stroke-linejoin="round"' + dash + '/>';
      if (a.showLabel) {
        // medida escrita en el plano, estilo Bluebeam: sq ft en áreas, longitud en polilíneas
        var cx = 0, cy = 0;
        a.pts.forEach(function (q) { cx += q[0]; cy += q[1]; });
        cx /= a.pts.length; cy /= a.pts.length;
        var txt = a.open
          ? fmtFtIn(polyPerim(a.pts, true))
          : (polyArea(a.pts) / 144).toFixed(1) + ' sq ft';
        if (a.open) { cy -= 6; }
        out += '<text x="' + cx + '" y="' + cy + '" font-size="9" font-weight="bold" text-anchor="middle" fill="#1c5fa8" stroke="none" style="pointer-events:none" font-family="Arial, sans-serif">' + esc(txt) + '</text>';
      }
    });
    G.areas.innerHTML = out;
  }

  /* ---------------- render: símbolos ---------------- */
  function symTransform(s) {
    return 'translate(' + s.x + ' ' + s.y + ') rotate(' + (s.rot || 0) + ') scale(' + (s.scale || 1) + ')';
  }
  function wirePath(w) {
    var st = w.style || 'dashed';
    if (st === 'straight' || st === 'straightdashed' || st === 'conduit') {
      // recta (para diagramas riser / one-line)
      return { d: 'M' + w.x1 + ',' + w.y1 + ' L' + w.x2 + ',' + w.y2, cx: (w.x1 + w.x2) / 2, cy: (w.y1 + w.y2) / 2 };
    }
    if (st === 'ortho' || st === 'orthodashed' || st === 'conduitortho') {
      // en L: horizontal y luego vertical (riser)
      return { d: 'M' + w.x1 + ',' + w.y1 + ' L' + w.x2 + ',' + w.y1 + ' L' + w.x2 + ',' + w.y2, cx: w.x2, cy: w.y1 };
    }
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy) || 1e-6;
    var nx = -dy / len, ny = dx / len;
    var s = (w.side || 1) * (w.bulge == null ? 0.22 : w.bulge) * len;
    var cx = (w.x1 + w.x2) / 2 + nx * s, cy = (w.y1 + w.y2) / 2 + ny * s;
    return { d: 'M' + w.x1 + ',' + w.y1 + ' Q' + cx + ',' + cy + ' ' + w.x2 + ',' + w.y2, cx: cx, cy: cy };
  }
  function wireLen(w) {
    var st = w.style || 'dashed';
    if (st === 'straight' || st === 'straightdashed' || st === 'conduit') {
      return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    }
    if (st === 'ortho' || st === 'orthodashed' || st === 'conduitortho') {
      return Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
    }
    // curva: longitud aproximada muestreando la cuadrática
    var wp = wirePath(w), L = 0, px = w.x1, py = w.y1;
    for (var k = 1; k <= 20; k++) {
      var t = k / 20, mt = 1 - t;
      var qx = mt * mt * w.x1 + 2 * mt * t * wp.cx + t * t * w.x2;
      var qy = mt * mt * w.y1 + 2 * mt * t * wp.cy + t * t * w.y2;
      L += Math.hypot(qx - px, qy - py);
      px = qx; py = qy;
    }
    return L;
  }
  var WIRE_STYLE_NAMES = {
    dashed: 'Switch Leg', solid: 'Circuit (curved)',
    conduit: 'Conduit (straight)', conduitortho: 'Conduit (L)',
    straight: 'Straight Conductor', straightdashed: 'GEC / Dashed',
    ortho: 'L Conductor', orthodashed: 'L Dashed'
  };
  function wireEndTangents(w) {
    var st = w.style || 'dashed';
    if (st === 'ortho' || st === 'orthodashed' || st === 'conduitortho') {
      var sx = Math.sign(w.x2 - w.x1) || 1, sy = Math.sign(w.y2 - w.y1) || 1;
      return { s: [-sx, 0], e: [0, sy] };
    }
    if (st === 'straight' || st === 'straightdashed' || st === 'conduit') {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
      return { s: [-dx / L, -dy / L], e: [dx / L, dy / L] };
    }
    var wp = wirePath(w);
    var d1x = wp.cx - w.x1, d1y = wp.cy - w.y1, L1 = Math.hypot(d1x, d1y) || 1;
    var d2x = w.x2 - wp.cx, d2y = w.y2 - wp.cy, L2 = Math.hypot(d2x, d2y) || 1;
    return { s: [-d1x / L1, -d1y / L1], e: [d2x / L2, d2y / L2] };
  }
  function capMarkup(P, u, type) {
    if (!type || type === 'none') return '';
    var nx = -u[1], ny = u[0];
    if (type === 'arrow') {
      var bx = P[0] - u[0] * 6, by = P[1] - u[1] * 6;
      return '<polygon points="' + P[0] + ',' + P[1] + ' ' + (bx + nx * 2.4).toFixed(1) + ',' + (by + ny * 2.4).toFixed(1) +
        ' ' + (bx - nx * 2.4).toFixed(1) + ',' + (by - ny * 2.4).toFixed(1) + '" fill="#14161a" stroke="none"/>';
    }
    if (type === 'dot') return '<circle cx="' + P[0] + '" cy="' + P[1] + '" r="1.8" fill="#14161a" stroke="none"/>';
    if (type === 'tick') return '<line x1="' + (P[0] + nx * 3.2).toFixed(1) + '" y1="' + (P[1] + ny * 3.2).toFixed(1) +
      '" x2="' + (P[0] - nx * 3.2).toFixed(1) + '" y2="' + (P[1] - ny * 3.2).toFixed(1) + '" stroke="#14161a" stroke-width="1"/>';
    return '';
  }
  function wireCaps(w) {
    if ((!w.capS || w.capS === 'none') && (!w.capE || w.capE === 'none')) return '';
    var tg = wireEndTangents(w);
    return capMarkup([w.x1, w.y1], tg.s, w.capS) + capMarkup([w.x2, w.y2], tg.e, w.capE);
  }
  function wireMarkup(w, extraCls) {
    var st = w.style || 'dashed';
    var d = wirePath(w).d;
    if (st === 'conduit' || st === 'conduitortho') {
      // tubería: doble línea (trazo grueso oscuro con núcleo claro encima)
      return '<path class="wire-conduit-outer' + (extraCls || '') + '" data-id="' + w.id + '" d="' + d + '"/>' +
        '<path class="wire-conduit-inner" data-id="' + w.id + '" d="' + d + '"/>' + wireCaps(w);
    }
    var dashed = (st === 'dashed' || st === 'straightdashed' || st === 'orthodashed');
    return '<path class="wire ' + (dashed ? 'dashed' : '') + (extraCls || '') +
      '" data-id="' + w.id + '" d="' + d + '"/>' + wireCaps(w);
  }

  function renderSymbols() {
    var elec = '', furn = '';
    state.wires.forEach(function (w) { elec += wireMarkup(w); });
    state.symbols.forEach(function (s) {
      var def = SYMBOLS[s.key]; if (!def) return;
      var sw = def.lw ? ' style="stroke-width:' + def.lw + '"' : '';
      var frag = '<g class="sym" data-id="' + s.id + '" transform="' + symTransform(s) + '"' + sw + '>' + def.svg + '</g>';
      if (def.layer === 'electrical') elec += frag; else furn += frag;
    });
    G.elec.innerHTML = elec;
    G.furn.innerHTML = furn;
  }

  /* ---------------- render: anotaciones ---------------- */
  function dimMarkup(x1, y1, x2, y2, off, cls, label) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-6;
    var ux = dx / len, uy = dy / len, nx = -dy / len, ny = dx / len;
    var o = off == null ? 14 : off;
    var a = [x1 + nx * o, y1 + ny * o], b = [x2 + nx * o, y2 + ny * o];
    var s = '<g class="' + cls + '">';
    var ov = o >= 0 ? 2.5 : -2.5;
    s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (a[0] + nx * ov) + '" y2="' + (a[1] + ny * ov) + '"/>';
    s += '<line x1="' + x2 + '" y1="' + y2 + '" x2="' + (b[0] + nx * ov) + '" y2="' + (b[1] + ny * ov) + '"/>';
    s += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
    // marcas a 45°
    [a, b].forEach(function (p) {
      var mx = (ux + nx) * 2.4, my = (uy + ny) * 2.4;
      s += '<line x1="' + (p[0] - mx) + '" y1="' + (p[1] - my) + '" x2="' + (p[0] + mx) + '" y2="' + (p[1] + my) + '"/>';
    });
    var mid = [(a[0] + b[0]) / 2 + nx * 3.5, (a[1] + b[1]) / 2 + ny * 3.5];
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    if (ang > 90 || ang <= -90) ang += 180;
    s += '<text x="0" y="0" font-size="7" text-anchor="middle" transform="translate(' + mid[0] + ' ' + mid[1] + ') rotate(' + ang + ')">' +
      esc(label || fmtFtIn(len)) + '</text>';
    return s + '</g>';
  }

  function leaderMarkup(l) {
    var size = l.size || 7;
    var anchor = l.x >= l.tx ? 'start' : 'end';
    var sx = l.x + (anchor === 'start' ? -2 : 2), sy = l.y - size * 0.35;
    var dx = l.tx - sx, dy = l.ty - sy, len = Math.hypot(dx, dy) || 1e-6;
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    var bx = l.tx - ux * 4, by = l.ty - uy * 4;   // base de la flecha
    var s = '<g data-id="' + l.id + '">';
    s += '<line class="leader-line" x1="' + sx + '" y1="' + sy + '" x2="' + bx + '" y2="' + by + '"/>';
    s += '<polygon class="leader-head" points="' + l.tx + ',' + l.ty + ' ' + (bx + nx * 1.6) + ',' + (by + ny * 1.6) + ' ' + (bx - nx * 1.6) + ',' + (by - ny * 1.6) + '"/>';
    s += '<text class="lbl" x="' + l.x + '" y="' + l.y + '" font-size="' + size + '" text-anchor="' + anchor + '">' + esc(l.text) + '</text>';
    return s + '</g>';
  }

  function renderAnnot() {
    var s = '';
    state.dims.forEach(function (d) { s += dimMarkup(d.x1, d.y1, d.x2, d.y2, d.off, 'dim'); });
    state.leaders.forEach(function (l) { s += leaderMarkup(l); });
    state.texts.forEach(function (t) {
      var sz = t.size || 9;
      if (t.style === 'circle' || t.style === 'hex') {
        var r = Math.max(sz * 0.95, t.text.length * sz * 0.34 + 2.5);
        s += '<g class="sym" data-id="' + t.id + '">';
        if (t.style === 'circle') {
          s += '<circle cx="' + t.x + '" cy="' + t.y + '" r="' + r + '" fill="none"/>';
        } else {
          var hp = [];
          for (var hi = 0; hi < 6; hi++) {
            var ha = Math.PI / 6 + hi * Math.PI / 3;
            hp.push((t.x + r * 1.1 * Math.cos(ha)).toFixed(1) + ',' + (t.y + r * 1.1 * Math.sin(ha)).toFixed(1));
          }
          s += '<polygon points="' + hp.join(' ') + '" fill="none"/>';
        }
        s += '<text x="' + t.x + '" y="' + (t.y + sz * 0.34) + '" font-size="' + sz + '" text-anchor="middle" font-weight="bold">' + esc(t.text) + '</text></g>';
      } else {
        s += '<text class="lbl" data-id="' + t.id + '" x="' + t.x + '" y="' + t.y + '" font-size="' + sz + '">' + esc(t.text) + '</text>';
      }
    });
    G.annot.innerHTML = s;
    G.meas.innerHTML = measure ? dimMarkup(measure.x1, measure.y1, measure.x2, measure.y2, 14, 'meas') : '';
  }

  /* ---------------- render: fondo y rejilla ---------------- */
  function renderBg() {
    var out = '';
    if (state.bg) {
      out += '<image href="' + state.bg.url + '" x="' + state.bg.x + '" y="' + state.bg.y +
        '" width="' + state.bg.w + '" height="' + state.bg.h + '" opacity="' + (state.bg.opacity == null ? 0.7 : state.bg.opacity) +
        '" preserveAspectRatio="none"/>';
    }
    if (state.bg2) {
      out += '<image href="' + state.bg2.url + '" x="' + state.bg2.x + '" y="' + state.bg2.y +
        '" width="' + state.bg2.w + '" height="' + state.bg2.h + '" opacity="' + (state.bg2.opacity == null ? 0.7 : state.bg2.opacity) +
        '" preserveAspectRatio="none"/>';
    }
    G.bg.innerHTML = out;
  }
  function renderGrid() {
    var EXT = 12000;
    G.grid.innerHTML =
      '<rect x="' + (-EXT) + '" y="' + (-EXT) + '" width="' + (EXT * 2) + '" height="' + (EXT * 2) + '" fill="url(#grid12)"/>' +
      '<rect x="' + (-EXT) + '" y="' + (-EXT) + '" width="' + (EXT * 2) + '" height="' + (EXT * 2) + '" fill="url(#grid60)"/>';
  }

  /* ---------------- render: selección ---------------- */
  function selShapeMarkup(kind, e) {
    if (kind === 'wall') {
      var g = wallGeom(e), t = e.t / 2 + 2;
      return '<path class="sel" d="M' + (e.x1 + g.nx * t) + ',' + (e.y1 + g.ny * t) +
        ' L' + (e.x2 + g.nx * t) + ',' + (e.y2 + g.ny * t) +
        ' L' + (e.x2 - g.nx * t) + ',' + (e.y2 - g.ny * t) +
        ' L' + (e.x1 - g.nx * t) + ',' + (e.y1 - g.ny * t) + ' Z"/>';
    }
    if (kind === 'symbol') {
      var def = SYMBOLS[e.key];
      return '<g transform="' + symTransform(e) + '"><rect class="sel" x="' + (-def.w / 2 - 3) + '" y="' + (-def.h / 2 - 3) +
        '" width="' + (def.w + 6) + '" height="' + (def.h + 6) + '"/></g>';
    }
    if (kind === 'text') {
      var sz = e.size || 9, tw = (e.text.length * sz) * 0.58 + 6;
      return '<rect class="sel" x="' + (e.x - 3) + '" y="' + (e.y - sz) + '" width="' + tw + '" height="' + (sz + 6) + '"/>';
    }
    if (kind === 'dim' || kind === 'wire') {
      return '<circle class="sel" cx="' + ((e.x1 + e.x2) / 2) + '" cy="' + ((e.y1 + e.y2) / 2) + '" r="10"/>';
    }
    if (kind === 'leader') {
      var lsz = e.size || 7, lw = (e.text.length * lsz) * 0.58 + 6;
      var lx = e.x >= e.tx ? e.x - 3 : e.x - lw + 3;
      return '<rect class="sel" x="' + lx + '" y="' + (e.y - lsz) + '" width="' + lw + '" height="' + (lsz + 5) + '"/>';
    }
    if (kind === 'area') return '<path class="sel" d="' + areaPath(e) + '"/>';
    return '';
  }

  function renderSel() {
    var s = '';
    if (selGroup) {
      selGroup.forEach(function (r) {
        var e = entityOf(r);
        if (e) s += selShapeMarkup(r.kind, e);
      });
      G.sel.innerHTML = s;
      return;
    }
    if (sel) {
      var e = findSel();
      if (e) {
        if (sel.kind === 'wall') {
          var g = wallGeom(e), t = e.t / 2 + 2;
          s += '<path class="sel" d="M' + (e.x1 + g.nx * t) + ',' + (e.y1 + g.ny * t) +
            ' L' + (e.x2 + g.nx * t) + ',' + (e.y2 + g.ny * t) +
            ' L' + (e.x2 - g.nx * t) + ',' + (e.y2 - g.ny * t) +
            ' L' + (e.x1 - g.nx * t) + ',' + (e.y1 - g.ny * t) + ' Z"/>';
          var hr = 5 / view.z + 2;
          s += '<circle class="handle" data-h="1" cx="' + e.x1 + '" cy="' + e.y1 + '" r="' + hr + '"/>';
          s += '<circle class="handle" data-h="2" cx="' + e.x2 + '" cy="' + e.y2 + '" r="' + hr + '"/>';
        } else if (sel.kind === 'symbol') {
          var def = SYMBOLS[e.key];
          s += '<g transform="' + symTransform(e) + '"><rect class="sel" x="' + (-def.w / 2 - 3) + '" y="' + (-def.h / 2 - 3) +
            '" width="' + (def.w + 6) + '" height="' + (def.h + 6) + '"/></g>';
        } else if (sel.kind === 'opening') {
          var w = state.walls.find(function (x) { return x.id === e.wallId; });
          if (w) {
            var gg = wallGeom(w), P = ptAlong(w, gg, e.pos);
            var half = e.w / 2 + 3, th = w.t / 2 + (e.type === 'door' ? e.w : 6);
            s += '<circle class="sel" cx="' + P[0] + '" cy="' + P[1] + '" r="' + half + '"/>';
            // asas en las jambas: arrástralas para agrandar o achicar la abertura
            var JA = ptAlong(w, gg, e.pos - e.w / 2), JB = ptAlong(w, gg, e.pos + e.w / 2);
            var jr = 5 / view.z + 2;
            s += '<circle class="handle" cx="' + JA[0] + '" cy="' + JA[1] + '" r="' + jr + '"/>';
            s += '<circle class="handle" cx="' + JB[0] + '" cy="' + JB[1] + '" r="' + jr + '"/>';
          }
        } else if (sel.kind === 'text') {
          var tw = (e.text.length * (e.size || 9)) * 0.58 + 6;
          s += '<rect class="sel" x="' + (e.x - 3) + '" y="' + (e.y - (e.size || 9)) + '" width="' + tw + '" height="' + ((e.size || 9) + 6) + '"/>';
        } else if (sel.kind === 'dim') {
          s += '<circle class="sel" cx="' + ((e.x1 + e.x2) / 2) + '" cy="' + ((e.y1 + e.y2) / 2) + '" r="10"/>';
        } else if (sel.kind === 'area') {
          s += '<path class="sel" d="' + areaPath(e) + '"/>';
        } else if (sel.kind === 'wire') {
          s += '<path class="sel" d="' + wirePath(e).d + '"/>';
        } else if (sel.kind === 'leader') {
          var lw = (e.text.length * (e.size || 7)) * 0.58 + 6;
          var lx = e.x >= e.tx ? e.x - 3 : e.x - lw + 3;
          s += '<rect class="sel" x="' + lx + '" y="' + (e.y - (e.size || 7)) + '" width="' + lw + '" height="' + ((e.size || 7) + 5) + '"/>';
        }
      }
    }
    G.sel.innerHTML = s;
  }

  function findSel() {
    if (!sel) return null;
    var pool = { wall: state.walls, opening: state.openings, symbol: state.symbols, text: state.texts, dim: state.dims, area: state.areas, wire: state.wires, leader: state.leaders }[sel.kind];
    return pool ? pool.find(function (e) { return e.id === sel.id; }) : null;
  }

  function refresh() {
    renderWalls(); renderAreas(); renderSymbols(); renderAnnot(); renderBg(); renderSel();
    refreshCounts(); showProps();
  }

  /* ---------------- hit testing ---------------- */
  var layerVisible = { background: true, architecture: true, areas: true, furniture: true, electrical: true, annotation: true, grid: true };

  function hitTest(p) {
    var i, e, def;
    // símbolos (de arriba hacia abajo: eléctrico primero)
    var ordered = state.symbols.slice().sort(function (a, b) {
      var la = SYMBOLS[a.key].layer === 'electrical' ? 1 : 0;
      var lb = SYMBOLS[b.key].layer === 'electrical' ? 1 : 0;
      return lb - la;
    });
    for (i = 0; i < ordered.length; i++) {
      e = ordered[i]; def = SYMBOLS[e.key];
      if (!layerVisible[def.layer]) continue;
      var rot = -(e.rot || 0) * Math.PI / 180, sc = e.scale || 1;
      var dx = p[0] - e.x, dy = p[1] - e.y;
      var lx = (dx * Math.cos(rot) - dy * Math.sin(rot)) / sc;
      var ly = (dx * Math.sin(rot) + dy * Math.cos(rot)) / sc;
      var pad = 4 / view.z + 2;
      if (Math.abs(lx) <= def.w / 2 + pad && Math.abs(ly) <= def.h / 2 + pad) return { kind: 'symbol', id: e.id };
    }
    // aberturas
    if (layerVisible.architecture) {
      for (i = 0; i < state.openings.length; i++) {
        e = state.openings[i];
        var w = state.walls.find(function (x) { return x.id === e.wallId; });
        if (!w) continue;
        var g = wallGeom(w), r = distToSeg(p[0], p[1], w.x1, w.y1, w.x2, w.y2);
        var d = r.t * g.len;
        if (Math.abs(d - e.pos) <= e.w / 2 && r.d <= w.t / 2 + 6) return { kind: 'opening', id: e.id };
      }
      for (i = state.walls.length - 1; i >= 0; i--) {
        e = state.walls[i];
        var rr = distToSeg(p[0], p[1], e.x1, e.y1, e.x2, e.y2);
        if (rr.d <= e.t / 2 + 3 / view.z) return { kind: 'wall', id: e.id };
      }
    }
    if (layerVisible.annotation) {
      for (i = 0; i < state.texts.length; i++) {
        e = state.texts[i];
        var sz = e.size || 9;
        if (e.style === 'circle' || e.style === 'hex') {
          var br = Math.max(sz * 0.95, e.text.length * sz * 0.34 + 2.5) * 1.2 + 2;
          if (Math.hypot(p[0] - e.x, p[1] - e.y) <= br) return { kind: 'text', id: e.id };
        } else {
          var tw = e.text.length * sz * 0.58;
          if (p[0] >= e.x - 3 && p[0] <= e.x + tw + 3 && p[1] >= e.y - sz - 2 && p[1] <= e.y + 4) return { kind: 'text', id: e.id };
        }
      }
      for (i = 0; i < state.dims.length; i++) {
        e = state.dims[i];
        var g2 = { }, dx2 = e.x2 - e.x1, dy2 = e.y2 - e.y1, ln = Math.hypot(dx2, dy2) || 1;
        var nx = -dy2 / ln, ny = dx2 / ln, off = e.off == null ? 14 : e.off;
        var rd = distToSeg(p[0], p[1], e.x1 + nx * off, e.y1 + ny * off, e.x2 + nx * off, e.y2 + ny * off);
        if (rd.d < 5 / view.z + 3) return { kind: 'dim', id: e.id };
      }
    }
    // cables (muestrea la curva) y notas con flecha
    if (layerVisible.electrical) {
      for (i = state.wires.length - 1; i >= 0; i--) {
        e = state.wires[i];
        var wp = wirePath(e), best = 1e9;
        for (var k = 0; k <= 20; k++) {
          var tt = k / 20, mt = 1 - tt;
          var qx = mt * mt * e.x1 + 2 * mt * tt * wp.cx + tt * tt * e.x2;
          var qy = mt * mt * e.y1 + 2 * mt * tt * wp.cy + tt * tt * e.y2;
          var dd = Math.hypot(p[0] - qx, p[1] - qy);
          if (dd < best) best = dd;
        }
        if (best < 4 / view.z + 2.5) return { kind: 'wire', id: e.id };
      }
    }
    if (layerVisible.annotation) {
      for (i = 0; i < state.leaders.length; i++) {
        e = state.leaders[i];
        var lsz = e.size || 7, ltw = e.text.length * lsz * 0.58;
        var lx0 = e.x >= e.tx ? e.x : e.x - ltw;
        if (p[0] >= lx0 - 3 && p[0] <= lx0 + ltw + 3 && p[1] >= e.y - lsz - 2 && p[1] <= e.y + 4) return { kind: 'leader', id: e.id };
        if (distToSeg(p[0], p[1], e.x, e.y, e.tx, e.ty).d < 3 / view.z + 2) return { kind: 'leader', id: e.id };
      }
    }
    // superficies: prioridad más baja (suelen ser grandes y estar debajo de todo)
    if (layerVisible.areas) {
      for (i = state.areas.length - 1; i >= 0; i--) {
        e = state.areas[i];
        if (pointInPoly(p, e.pts)) return { kind: 'area', id: e.id };
      }
    }
    return null;
  }

  function nearestWall(p, maxDist) {
    var best = null;
    state.walls.forEach(function (w) {
      var r = distToSeg(p[0], p[1], w.x1, w.y1, w.x2, w.y2);
      if (r.d <= (maxDist || w.t / 2 + 14) && (!best || r.d < best.d)) best = { wall: w, d: r.d, t: r.t };
    });
    return best;
  }

  /* ---------------- herramientas ---------------- */
  var HINTS = {
    select: 'Toca un elemento para seleccionarlo · arrástralo para moverlo · Supr para borrar',
    pan: 'Arrastra para mover la vista · rueda o pellizco para zoom',
    wall: 'Clic para iniciar la pared · clic para cada tramo · doble clic o Esc para terminar',
    area: 'Clic en cada esquina de la superficie · doble clic o Enter para cerrar · el patrón se elige en Propiedades',
    rect: 'RECTÁNGULO: clic en una esquina y clic en la opuesta · SHIFT = cuadrado · el patrón (tile, madera…) se elige en Propiedades',
    ellipse: 'ELIPSE: clic y clic en las esquinas del cuadro · SHIFT = círculo · el patrón se elige en Propiedades',
    pline: 'POLILÍNEA: clic en cada punto · doble clic o Enter para terminar · SHIFT = tramos rectos',
    cloud: 'NUBE DE REVISIÓN: clic en una esquina y clic en la opuesta · combínala con Callout para la nota',
    wire: 'CABLEADO: clic en el primer dispositivo y clic en el segundo — dibuja el arco de circuito (discontinuo = línea de switch)',
    leader: 'NOTA: clic donde apunta la flecha · clic donde va el texto · escribe la nota (ej: GFI, Fridge Outlet)',
    door: 'Toca una pared para colocar la puerta · luego ajusta ancho y abatimiento en Propiedades',
    window: 'Toca una pared para colocar la ventana',
    measure: 'Clic en dos puntos para medir (azul, no se imprime) · mantén SHIFT para línea recta',
    dim: 'Clic en dos puntos para colocar una cota · SHIFT = línea recta · doble clic en la cota edita la medida · arrástrala para separarla',
    text: 'Clic donde quieras colocar el texto',
    calibrate: 'CALIBRAR: clic en dos puntos del plano de fondo cuya distancia real conozcas',
    place: 'Clic para colocar · R para rotar 45° · Esc para terminar'
  };
  function setHint(t) { $('#hint').textContent = t; }

  function setTool(t) {
    tool = t;
    if (t !== 'place') placingKey = null;
    pendingAreaLabel = false;
    drawing = null; G.prev.innerHTML = '';
    $$('#toolButtons .tool').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === t); });
    $$('.symBtn').forEach(function (b) { b.classList.toggle('active', t === 'place' && b.dataset.key === placingKey); });
    svg.className.baseVal = 'mxp tool-' + t;
    setHint(HINTS[t] || '');
    if (t === 'calibrate' && !state.bg) setHint('CALIBRAR: primero importa un plano de fondo con el botón "Fondo"');
  }

  /* ---------------- interacción de puntero ---------------- */
  var ptrs = new Map();
  var pinch = null;
  var drawing = null;   // estado transitorio de la herramienta
  var drag = null;      // arrastre de selección

  svg.addEventListener('pointerdown', function (ev) {
    svg.setPointerCapture(ev.pointerId);
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, view: { tx: view.tx, ty: view.ty, z: view.z } };
      drawing = drawing && drawing.mode === 'wallchain' ? drawing : null;
      drag = null; G.prev.innerHTML = '';
      return;
    }
    if (ev.button === 1 || tool === 'pan') {
      drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, tx: view.tx, ty: view.ty };
      svg.classList.add('panning');
      return;
    }
    if (ev.button === 2) return;
    var p = screenToWorld(ev.clientX, ev.clientY);
    onToolDown(p, ev);
  });

  svg.addEventListener('pointermove', function (ev) {
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      var mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
      var f = d / (pinch.d || 1);
      var z = Math.max(0.05, Math.min(20, pinch.view.z * f));
      var r = svg.getBoundingClientRect();
      var wx = (pinch.mx - r.left - pinch.view.tx) / pinch.view.z;
      var wy = (pinch.my - r.top - pinch.view.ty) / pinch.view.z;
      view.z = z;
      view.tx = mx - r.left - wx * z;
      view.ty = my - r.top - wy * z;
      applyView();
      return;
    }
    var p = screenToWorld(ev.clientX, ev.clientY);
    lastMouseWorld = p;
    $('#coords').textContent = fmtFtIn(p[0]) + ' , ' + fmtFtIn(p[1]) + '   ·   zoom ' + Math.round(view.z * 100) + '%';
    if (drag) { onDragMove(p, ev); return; }
    onToolMove(p, ev);
  });

  function endPointer(ev) {
    ptrs.delete(ev.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag) { onDragEnd(); }
    svg.classList.remove('panning');
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    if (drawing && drawing.mode === 'wallchain') finishWallChain();
    else if (drawing && drawing.mode === 'areachain') finishAreaChain();
  });
  svg.addEventListener('dblclick', function (ev) {
    if (drawing && drawing.mode === 'wallchain') { finishWallChain(); return; }
    if (drawing && drawing.mode === 'areachain') { finishAreaChain(); return; }
    var p = screenToWorld(ev.clientX, ev.clientY);
    var h = hitTest(p);
    if (h && h.kind === 'text') {
      var t = state.texts.find(function (x) { return x.id === h.id; });
      uiPrompt('Editar texto:', t.text, function (nt) {
        if (nt !== null && nt !== '') { pushUndo(); t.text = nt; refresh(); }
      });
    } else if (h && h.kind === 'dim') {
      // doble clic en una cota: escribe la medida y la línea se ajusta sola
      var dd = state.dims.find(function (x) { return x.id === h.id; });
      var len0 = Math.hypot(dd.x2 - dd.x1, dd.y2 - dd.y1) || 1;
      uiPrompt('Nueva medida de la cota (ej: 20\'  ·  20\' 6"):', fmtFtIn(len0), function (v) {
        var nv = parseDist(v);
        if (!nv || nv <= 0) return;
        pushUndo();
        var ux = (dd.x2 - dd.x1) / len0, uy = (dd.y2 - dd.y1) / len0;
        dd.x2 = dd.x1 + ux * nv;
        dd.y2 = dd.y1 + uy * nv;
        sel = { kind: 'dim', id: dd.id };
        refresh();
      });
    }
  });

  svg.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var f = Math.pow(1.0015, -ev.deltaY);
    var z = Math.max(0.05, Math.min(20, view.z * f));
    var r = svg.getBoundingClientRect();
    var wx = (ev.clientX - r.left - view.tx) / view.z;
    var wy = (ev.clientY - r.top - view.ty) / view.z;
    view.tx = ev.clientX - r.left - wx * z;
    view.ty = ev.clientY - r.top - wy * z;
    view.z = z;
    applyView();
  }, { passive: false });

  /* ---------------- lógica por herramienta ---------------- */
  function onToolDown(p, ev) {
    if (SNAP_TOOLS[tool]) {
      var so = applyOsnap(p);
      if (so.sn) p = so.p;   // el snap gana sobre el ortho
      else if (wantOrtho(ev) && drawing && drawing.mode === 'twopoint') p = orthoLock(drawing.a, p);
      else if (wantOrtho(ev) && drawing && drawing.mode === 'areachain') p = orthoLock(drawing.pts[drawing.pts.length - 1], p);
    } else if (wantOrtho(ev) && drawing && drawing.mode === 'twopoint') {
      p = orthoLock(drawing.a, p);
    }
    switch (tool) {
      case 'select': return selectDown(p, ev);
      case 'wall': return wallDown(p);
      case 'area': return areaDown(p);
      case 'rect': case 'ellipse': return shapeDown(p, tool, ev);
      case 'cloud': return shapeDown(p, 'cloud', ev);
      case 'pline': return areaDown(p);
      case 'door': return openingDown(p, curDoorType);
      case 'window': return openingDown(p, curWinType);
      case 'measure': return twoPointDown(p, 'measure');
      case 'dim': return twoPointDown(p, 'dim');
      case 'calibrate': return twoPointDown(p, 'calibrate');
      case 'wire': return twoPointDown(p, 'wire');
      case 'leader': return twoPointDown(p, 'leader');
      case 'text': return textDown(p);
      case 'place': return placeDown(p);
      case 'align': return alignDown(p);
    }
  }

  function onToolMove(p, ev) {
    var snapMark = '';
    if (SNAP_TOOLS[tool]) {
      var so = applyOsnap(p);
      if (so.sn) { p = so.p; snapMark = osnapMarker(so.sn); }
      else if (drawing && drawing.mode === 'twopoint' && wantOrtho(ev)) p = orthoLock(drawing.a, p);
      else if (drawing && drawing.mode === 'areachain' && wantOrtho(ev)) p = orthoLock(drawing.pts[drawing.pts.length - 1], p);
    } else if (drawing && drawing.mode === 'twopoint' && wantOrtho(ev)) {
      p = orthoLock(drawing.a, p);
    }
    var hadPreview = true;
    if (tool === 'wall' && drawing && drawing.mode === 'wallchain') {
      var raw = snapWallPt(p);
      var b = wantOrtho(ev) ? orthoLock(drawing.last, raw) : orthoSnap(drawing.last, raw);
      var len = Math.hypot(b[0] - drawing.last[0], b[1] - drawing.last[1]);
      var t = WALL_TYPES[$('#wallType').value].t / 2;
      G.prev.innerHTML = '<g class="preview">' +
        '<line class="wall-edge" x1="' + drawing.last[0] + '" y1="' + drawing.last[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke-width="' + (t * 2) + '" stroke="#9a968a"/>' +
        '<text class="lbl" x="' + ((drawing.last[0] + b[0]) / 2 + 8) + '" y="' + ((drawing.last[1] + b[1]) / 2 - 8) + '" font-size="9" font-weight="bold">' + fmtFtIn(len) + '</text></g>';
      drawing.cursor = b;
    } else if (drawing && drawing.mode === 'shape2') {
      var spts = shapePts(drawing.kind === 'cloud' ? 'rect' : drawing.kind, drawing.a, [Math.round(p[0]), Math.round(p[1])], ev && ev.shiftKey);
      var d2 = 'M' + spts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' Z';
      G.prev.innerHTML = '<g class="preview"><path d="' + d2 + '" fill="none" stroke="#0b84ff" stroke-width="1.2" stroke-dasharray="5 4"/></g>';
    } else if ((tool === 'area' || tool === 'pline') && drawing && drawing.mode === 'areachain') {
      var np = snapWallPt(p);
      var d = 'M' + drawing.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' L' + np[0] + ',' + np[1];
      G.prev.innerHTML = '<g class="preview"><path d="' + d + '" fill="none" stroke="#0b84ff" stroke-width="1.2" stroke-dasharray="5 4"/></g>';
    } else if ((tool === 'door' || tool === 'window') ) {
      var near = nearestWall(p);
      if (near) {
        var typ = tool === 'door' ? curDoorType : curWinType;
        var g = wallGeom(near.wall), d = near.t * g.len;
        var w = OPEN_DEFAULT[typ];
        d = Math.max(w / 2, Math.min(g.len - w / 2, d));
        var fake = { id: 'prev', wallId: near.wall.id, type: typ, pos: d, w: w, swing: 1, hinge: 0 };
        G.prev.innerHTML = '<g class="preview">' + renderOpening(near.wall, g, fake) + '</g>';
      } else G.prev.innerHTML = '';
    } else if (drawing && drawing.mode === 'twopoint') {
      if (drawing.kind === 'wire') {
        G.prev.innerHTML = '<g class="preview">' + wireMarkup({ id: 'prev', x1: drawing.a[0], y1: drawing.a[1], x2: p[0], y2: p[1], style: lastWireStyle, side: 1 }) + '</g>';
      } else if (drawing.kind === 'leader') {
        G.prev.innerHTML = '<g class="preview">' + leaderMarkup({ id: 'prev', tx: drawing.a[0], ty: drawing.a[1], x: p[0], y: p[1], text: 'nota…' }) + '</g>';
      } else {
        G.prev.innerHTML = '<g class="preview">' + dimMarkup(drawing.a[0], drawing.a[1], p[0], p[1], 14, drawing.kind === 'dim' ? 'dim' : 'meas') + '</g>';
      }
    } else if (tool === 'place' && placingKey) {
      var def = SYMBOLS[placingKey];
      G.prev.innerHTML = '<g class="preview"><g class="sym" transform="translate(' + p[0] + ' ' + p[1] + ') rotate(' + placingRot + ')">' + def.svg + '</g></g>';
    } else {
      hadPreview = false;
    }
    // indicador verde de OSNAP
    if (SNAP_TOOLS[tool]) {
      if (hadPreview && drawing) { if (snapMark) G.prev.innerHTML += snapMark; }
      else G.prev.innerHTML = snapMark;
    }
  }

  /* --- selección y arrastre --- */
  function entityOf(ref) {
    var pool = { wall: state.walls, opening: state.openings, symbol: state.symbols, text: state.texts, dim: state.dims, area: state.areas, wire: state.wires, leader: state.leaders }[ref.kind];
    return pool ? pool.find(function (e) { return e.id === ref.id; }) : null;
  }
  function inGroup(h) {
    return selGroup && h && selGroup.some(function (r) { return r.kind === h.kind && r.id === h.id; });
  }
  function selectDown(p, ev) {
    var h = hitTest(p);
    // arrastrar cualquier pieza del grupo mueve el grupo completo
    if (inGroup(h)) {
      drag = {
        mode: 'groupmove', start: p, snap: snapshot(), moved: false,
        items: selGroup.map(function (r) { return { ref: r, e: entityOf(r), orig: JSON.parse(JSON.stringify(entityOf(r))) }; })
      };
      return;
    }
    // asas de extremos de pared seleccionada
    if (sel && sel.kind === 'wall') {
      var w = findSel();
      if (w) {
        var hr = 8 / view.z + 3;
        if (Math.hypot(p[0] - w.x1, p[1] - w.y1) < hr) { drag = { mode: 'endpoint', wall: w, end: 1, snap: snapshot(), moved: false }; return; }
        if (Math.hypot(p[0] - w.x2, p[1] - w.y2) < hr) { drag = { mode: 'endpoint', wall: w, end: 2, snap: snapshot(), moved: false }; return; }
      }
    }
    // asas de jamba: agrandar / achicar una puerta o ventana arrastrando su borde
    if (sel && sel.kind === 'opening') {
      var op = findSel();
      var hw = op && state.walls.find(function (x) { return x.id === op.wallId; });
      if (op && hw) {
        var hg2 = wallGeom(hw), jr2 = 8 / view.z + 3;
        var JA = ptAlong(hw, hg2, op.pos - op.w / 2), JB = ptAlong(hw, hg2, op.pos + op.w / 2);
        if (Math.hypot(p[0] - JA[0], p[1] - JA[1]) < jr2) { drag = { mode: 'openJamb', open: op, wall: hw, end: -1, snap: snapshot(), moved: false }; return; }
        if (Math.hypot(p[0] - JB[0], p[1] - JB[1]) < jr2) { drag = { mode: 'openJamb', open: op, wall: hw, end: 1, snap: snapshot(), moved: false }; return; }
      }
    }
    if (!h) {
      // sin nada debajo: inicia el rectángulo de selección múltiple
      sel = null; selGroup = null; renderSel(); showProps();
      drag = { mode: 'marquee', start: p, cur: p };
      return;
    }
    selGroup = null;
    sel = h; renderSel(); showProps();
    var e = findSel();
    drag = { mode: 'move', kind: h.kind, e: e, start: p, snap: snapshot(), moved: false, orig: JSON.parse(JSON.stringify(e)) };
  }

  function applyGroupDelta(items, dx, dy) {
    dx = Math.round(dx); dy = Math.round(dy);
    items.forEach(function (it) {
      var e = it.e, o = it.orig, k = it.ref.kind;
      if (!e) return;
      if (k === 'wall' || k === 'dim' || k === 'wire') {
        e.x1 = o.x1 + dx; e.y1 = o.y1 + dy; e.x2 = o.x2 + dx; e.y2 = o.y2 + dy;
      } else if (k === 'symbol' || k === 'text') {
        e.x = o.x + dx; e.y = o.y + dy;
      } else if (k === 'leader') {
        e.x = o.x + dx; e.y = o.y + dy; e.tx = o.tx + dx; e.ty = o.ty + dy;
      } else if (k === 'area') {
        e.pts = o.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
      }
    });
  }

  function marqueeCollect(a, b) {
    var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    var y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    function inside(x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
    var g = [];
    state.walls.forEach(function (w) { if (inside(w.x1, w.y1) && inside(w.x2, w.y2)) g.push({ kind: 'wall', id: w.id }); });
    state.symbols.forEach(function (s) { if (inside(s.x, s.y)) g.push({ kind: 'symbol', id: s.id }); });
    state.texts.forEach(function (t) { if (inside(t.x, t.y)) g.push({ kind: 'text', id: t.id }); });
    state.dims.forEach(function (d) { if (inside(d.x1, d.y1) && inside(d.x2, d.y2)) g.push({ kind: 'dim', id: d.id }); });
    state.wires.forEach(function (w) { if (inside(w.x1, w.y1) && inside(w.x2, w.y2)) g.push({ kind: 'wire', id: w.id }); });
    state.leaders.forEach(function (l) { if (inside(l.x, l.y)) g.push({ kind: 'leader', id: l.id }); });
    state.areas.forEach(function (ar) {
      if (ar.pts.every(function (q) { return inside(q[0], q[1]); })) g.push({ kind: 'area', id: ar.id });
    });
    return g;
  }

  function onDragMove(p, ev) {
    if (drag.mode === 'marquee') {
      drag.cur = p;
      var x0 = Math.min(drag.start[0], p[0]), y0 = Math.min(drag.start[1], p[1]);
      G.prev.innerHTML = '<rect x="' + x0 + '" y="' + y0 + '" width="' + Math.abs(p[0] - drag.start[0]) +
        '" height="' + Math.abs(p[1] - drag.start[1]) + '" fill="rgba(11,132,255,0.08)" stroke="#0b84ff" stroke-width="0.8" stroke-dasharray="4 3"/>';
      return;
    }
    if (drag.mode === 'groupmove') {
      drag.moved = true;
      applyGroupDelta(drag.items, p[0] - drag.start[0], p[1] - drag.start[1]);
      renderWalls(); renderAreas(); renderSymbols(); renderAnnot(); renderSel();
      return;
    }
    if (drag.mode === 'pan') {
      view.tx = drag.tx + (ev.clientX - drag.sx);
      view.ty = drag.ty + (ev.clientY - drag.sy);
      applyView(); return;
    }
    if (drag.mode === 'endpoint') {
      var np = snapWallPt(p);
      if (drag.end === 1) { drag.wall.x1 = np[0]; drag.wall.y1 = np[1]; }
      else { drag.wall.x2 = np[0]; drag.wall.y2 = np[1]; }
      drag.moved = true;
      renderWalls(); renderSel(); return;
    }
    if (drag.mode === 'openJamb') {
      // se mueve una jamba, la otra queda fija: la abertura crece o se achica
      var op = drag.open, hw = drag.wall;
      var hg = wallGeom(hw), rr = distToSeg(p[0], p[1], hw.x1, hw.y1, hw.x2, hw.y2);
      var d = Math.round(rr.t * hg.len);
      var fixed = drag.end < 0 ? op.pos + op.w / 2 : op.pos - op.w / 2;
      if (drag.end < 0) d = Math.max(0, Math.min(fixed - 6, d));
      else d = Math.min(hg.len, Math.max(fixed + 6, d));
      op.w = Math.round(Math.abs(d - fixed));
      op.pos = (d + fixed) / 2;
      drag.moved = true;
      renderWalls(); renderSel(); return;
    }
    if (drag.mode === 'move') {
      var dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      if (Math.hypot(dx, dy) < 2 / view.z) return;
      drag.moved = true;
      var e = drag.e, o = drag.orig;
      if (drag.kind === 'symbol' || drag.kind === 'text') {
        e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy);
        renderSymbols(); renderAnnot(); renderSel();
      } else if (drag.kind === 'wall') {
        e.x1 = Math.round(o.x1 + dx); e.y1 = Math.round(o.y1 + dy);
        e.x2 = Math.round(o.x2 + dx); e.y2 = Math.round(o.y2 + dy);
        renderWalls(); renderSel();
      } else if (drag.kind === 'opening') {
        var w = state.walls.find(function (x) { return x.id === e.wallId; });
        if (w) {
          var g = wallGeom(w), r = distToSeg(p[0], p[1], w.x1, w.y1, w.x2, w.y2);
          e.pos = Math.max(e.w / 2, Math.min(g.len - e.w / 2, Math.round(r.t * g.len)));
          renderWalls(); renderSel();
        }
      } else if (drag.kind === 'dim') {
        // arrastrar una cota mueve su línea (offset) sin soltar los puntos medidos,
        // para apilar varias medidas sin que se encimen
        var ddx = o.x2 - o.x1, ddy = o.y2 - o.y1, ln = Math.hypot(ddx, ddy) || 1;
        var nnx = -ddy / ln, nny = ddx / ln;
        e.off = (o.off == null ? 14 : o.off) + (dx * nnx + dy * nny);
        renderAnnot(); renderSel();
      } else if (drag.kind === 'area') {
        var rx = Math.round(dx), ry = Math.round(dy);
        e.pts = o.pts.map(function (q) { return [q[0] + rx, q[1] + ry]; });
        renderAreas(); renderSel();
      } else if (drag.kind === 'wire') {
        e.x1 = o.x1 + dx; e.y1 = o.y1 + dy; e.x2 = o.x2 + dx; e.y2 = o.y2 + dy;
        renderSymbols(); renderSel();
      } else if (drag.kind === 'leader') {
        e.x = o.x + dx; e.y = o.y + dy;   // solo se mueve el texto; la flecha sigue apuntando igual
        renderAnnot(); renderSel();
      }
    }
  }

  function onDragEnd() {
    if (drag.mode === 'marquee') {
      G.prev.innerHTML = '';
      if (drag.cur && Math.hypot(drag.cur[0] - drag.start[0], drag.cur[1] - drag.start[1]) > 4) {
        var g = marqueeCollect(drag.start, drag.cur);
        selGroup = g.length ? g : null;
        sel = null;
        renderSel(); showProps();
        if (selGroup) setHint(selGroup.length + ' elemento(s) seleccionados — arrastra cualquiera para mover el grupo · Supr para borrar');
      }
      drag = null;
      return;
    }
    if (drag.mode === 'groupmove' && drag.moved) {
      pushUndo(drag.snap);
      refreshCounts();
    }
    if ((drag.mode === 'move' || drag.mode === 'endpoint' || drag.mode === 'openJamb') && drag.moved) {
      pushUndo(drag.snap);
      refreshCounts(); showProps();
    }
    drag = null;
  }

  /* --- paredes --- */
  function wallDown(p) {
    var np = snapWallPt(p);
    if (!drawing) { drawing = { mode: 'wallchain', last: np, cursor: np }; return; }
    var b = drawing.cursor || orthoSnap(drawing.last, np);
    if (Math.hypot(b[0] - drawing.last[0], b[1] - drawing.last[1]) > 2) {
      pushUndo();
      var wt = $('#wallType').value;
      state.walls.push({ id: uid(), x1: drawing.last[0], y1: drawing.last[1], x2: b[0], y2: b[1], type: wt, t: WALL_TYPES[wt].t });
      drawing.last = b;
      renderWalls(); refreshCounts();
    }
  }
  function finishWallChain() { drawing = null; G.prev.innerHTML = ''; }

  /* --- superficies / techos --- */
  function areaDown(p) {
    var np = snapWallPt(p);
    if (!drawing) { drawing = { mode: 'areachain', pts: [np] }; return; }
    drawing.pts.push(np);
  }
  /* --- rectángulo y elipse (se guardan como superficies: patrón, área y movibles) --- */
  function shapePts(kind, a, b, square) {
    if (square) {
      var side = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      b = [a[0] + side * (b[0] >= a[0] ? 1 : -1), a[1] + side * (b[1] >= a[1] ? 1 : -1)];
    }
    if (kind === 'rect') {
      return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    }
    // elipse aproximada con 24 puntos
    var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    var rx = Math.abs(b[0] - a[0]) / 2 || 1, ry = Math.abs(b[1] - a[1]) / 2 || 1;
    var pts = [];
    for (var i = 0; i < 24; i++) {
      var an = (i / 24) * Math.PI * 2;
      pts.push([+(cx + rx * Math.cos(an)).toFixed(2), +(cy + ry * Math.sin(an)).toFixed(2)]);
    }
    return pts;
  }
  function shapeDown(p, kind, ev) {
    var np = [Math.round(p[0]), Math.round(p[1])];
    if (!drawing) { drawing = { mode: 'shape2', kind: kind, a: np }; return; }
    var isCloud = drawing.kind === 'cloud';
    var pts = shapePts(isCloud ? 'rect' : drawing.kind, drawing.a, np, ev && ev.shiftKey);
    drawing = null; G.prev.innerHTML = '';
    pushUndo();
    var e = { id: uid(), pts: pts, pattern: 'none', rot: 0 };
    if (isCloud) e.lineStyle = 'cloud';
    state.areas.push(e);
    sel = { kind: 'area', id: e.id };
    refresh();
  }

  function finishAreaChain() {
    if (!drawing || drawing.mode !== 'areachain') return;
    var pts = drawing.pts;
    var isLine = tool === 'pline';
    drawing = null; G.prev.innerHTML = '';
    // quita el último punto si quedó duplicado por el doble clic
    if (pts.length > 1) {
      var a = pts[pts.length - 1], b = pts[pts.length - 2];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 2) pts.pop();
    }
    if (pts.length < (isLine ? 2 : 3)) {
      setHint(isLine ? 'Se necesitan al menos 2 puntos' : 'Se necesitan al menos 3 esquinas para cerrar la superficie');
      return;
    }
    pushUndo();
    var e = { id: uid(), pts: pts, pattern: isLine ? 'none' : curAreaPattern, rot: 0 };
    if (isLine) e.open = true;
    if (pendingAreaLabel) e.showLabel = true;
    state.areas.push(e);
    sel = { kind: 'area', id: e.id };
    refresh();
    setHint(isLine
      ? 'Polilínea creada (' + fmtFtIn(polyPerim(pts, true)) + ') — edítala en Propiedades'
      : 'Superficie creada (' + (polyArea(pts) / 144).toFixed(1) + ' sq ft) — elige el patrón en Propiedades');
  }

  /* --- puertas y ventanas --- */
  function openingDown(p, type) {
    var near = nearestWall(p);
    if (!near) { setHint('Acércate a una pared para colocar la ' + OPEN_NAMES[type].toLowerCase()); return; }
    var g = wallGeom(near.wall), w = OPEN_DEFAULT[type];
    if (g.len < w + 4) { setHint('La pared es muy corta para esta abertura'); return; }
    var d = Math.max(w / 2 + 1, Math.min(g.len - w / 2 - 1, near.t * g.len));
    pushUndo();
    var o = { id: uid(), wallId: near.wall.id, type: type, pos: Math.round(d), w: w, swing: 1, hinge: 0 };
    state.openings.push(o);
    sel = { kind: 'opening', id: o.id };
    refresh();
  }

  /* --- medir / cotas / calibrar --- */
  function twoPointDown(p, kind) {
    if (kind === 'calibrate' && !state.bg) { setHint('Primero importa un plano de fondo (botón "Fondo")'); return; }
    if (!drawing) { drawing = { mode: 'twopoint', kind: kind, a: p }; return; }
    var a = drawing.a; drawing = null; G.prev.innerHTML = '';
    var len = Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (len < 1) return;
    if (kind === 'measure') {
      measure = { x1: a[0], y1: a[1], x2: p[0], y2: p[1] };
      renderAnnot();
      setHint('Distancia: ' + fmtFtIn(len) + ' — clic para medir otra vez');
    } else if (kind === 'wire') {
      pushUndo();
      var wr = { id: uid(), x1: a[0], y1: a[1], x2: p[0], y2: p[1], style: lastWireStyle, side: 1, bulge: 0.22 };
      state.wires.push(wr);
      sel = { kind: 'wire', id: wr.id };
      refresh();
    } else if (kind === 'leader') {
      uiPrompt('Texto de la nota (ej: GFI, Fridge Outlet, A-30):', '', function (txt) {
        if (!txt) return;
        pushUndo();
        var ld = { id: uid(), tx: a[0], ty: a[1], x: p[0], y: p[1], text: txt, size: 7 };
        state.leaders.push(ld);
        sel = { kind: 'leader', id: ld.id };
        refresh();
      });
    } else if (kind === 'dim') {
      pushUndo();
      state.dims.push({ id: uid(), x1: a[0], y1: a[1], x2: p[0], y2: p[1], off: 14 });
      renderAnnot();
    } else if (kind === 'calibrate') {
      uiPrompt('Distancia REAL entre los dos puntos:\n(ejemplos:  4\' 6"   ·   12\'   ·   54")', '', function (input) {
        if (input === null) return;
        var real = parseDist(input);
        if (!real || real <= 0) { setHint('No entendí esa medida — intenta de nuevo (ej: 4\' 6")'); return; }
        var f = real / len;
        pushUndo();
        // escala el fondo alrededor del primer punto para que la distancia coincida
        state.bg.w *= f; state.bg.h *= f;
        state.bg.x = a[0] + (state.bg.x - a[0]) * f;
        state.bg.y = a[1] + (state.bg.y - a[1]) * f;
        renderBg();
        setHint('✔ Plano calibrado: esa distancia ahora mide ' + fmtFtIn(real) + '. Todo el plano quedó a escala.');
        setTool('measure');
      });
    }
  }

  /* --- texto --- */
  function textDown(p) {
    uiPrompt('Texto:', '', function (t) {
      if (!t) return;
      pushUndo();
      var e = { id: uid(), x: p[0], y: p[1], text: t, size: 9 };
      state.texts.push(e);
      sel = { kind: 'text', id: e.id };
      refresh();
    });
  }

  /* --- colocar símbolos --- */
  function placeDown(p) {
    if (!placingKey) return;
    pushUndo();
    var e = { id: uid(), key: placingKey, x: Math.round(p[0]), y: Math.round(p[1]), rot: placingRot, scale: 1 };
    state.symbols.push(e);
    renderSymbols(); refreshCounts();
  }

  /* ---------------- paleta ---------------- */
  var activeCat = 'electrical';
  function symPreviewSvg(def, wpx, hpx) {
    var pad = 4;
    var vb = (-def.w / 2 - pad) + ' ' + (-def.h / 2 - pad) + ' ' + (def.w + pad * 2) + ' ' + (def.h + pad * 2);
    return '<svg class="mxp" style="background:transparent" viewBox="' + vb + '"' + (wpx ? ' width="' + wpx + '" height="' + hpx + '"' : '') + '>' +
      '<g class="sym"' + (def.lw ? ' style="stroke-width:' + def.lw + '"' : '') + '>' + def.svg + '</g></svg>';
  }
  function loadFavs() {
    try { var a = JSON.parse(localStorage.getItem('mxp_favs') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveFavs(a) { try { localStorage.setItem('mxp_favs', JSON.stringify(a)); } catch (e) {} }
  function buildPalette() {
    var q = ($('#symSearch').value || '').toLowerCase();
    var favs = loadFavs();
    var keys = activeCat === 'fav'
      ? favs.filter(function (k) { return SYMBOLS[k]; })
      : Object.keys(SYMBOLS).filter(function (k) { return SYMBOLS[k].cat === activeCat; });
    var html = '';
    keys.forEach(function (k) {
      var d = SYMBOLS[k];
      if (q && d.name.toLowerCase().indexOf(q) < 0) return;
      var isFav = favs.indexOf(k) >= 0;
      html += '<button class="symBtn' + (tool === 'place' && placingKey === k ? ' active' : '') + '" data-key="' + k + '">' +
        symPreviewSvg(d) + '<span class="nm">' + esc(d.short || d.name) + '</span>' +
        '<span class="favstar' + (isFav ? ' on' : '') + '" data-fav="' + k + '" title="★ My Tools">★</span></button>';
    });
    $('#symList').innerHTML = html || '<span class="muted" style="grid-column:1/-1">' +
      (activeCat === 'fav' ? 'Sin favoritos aún — toca la ★ de cualquier símbolo para agregarlo aquí.' : 'Sin resultados') + '</span>';
    $$('.symBtn').forEach(function (b) {
      b.addEventListener('click', function () {
        placingKey = b.dataset.key; placingRot = 0;
        setTool('place');
        $$('.symBtn').forEach(function (x) { x.classList.toggle('active', x.dataset.key === placingKey); });
        setHint(HINTS.place + ' — ' + SYMBOLS[placingKey].name);
      });
    });
    $$('.favstar').forEach(function (st) {
      st.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var k = st.dataset.fav;
        var list = loadFavs();
        var i = list.indexOf(k);
        if (i >= 0) list.splice(i, 1); else list.push(k);
        saveFavs(list);
        buildPalette();
      });
    });
  }
  $('#symSearch').addEventListener('input', buildPalette);
  $$('#catTabs .cat').forEach(function (b) {
    b.addEventListener('click', function () {
      activeCat = b.dataset.cat;
      $$('#catTabs .cat').forEach(function (x) { x.classList.toggle('active', x === b); });
      buildPalette();
    });
  });

  /* ---------------- propiedades ---------------- */
  /* --- portapapeles interno: Ctrl+C copia, Ctrl+V pega en el cursor, Ctrl+D duplica --- */
  function copySel() {
    var refs = selGroup ? selGroup : (sel ? [sel] : null);
    if (!refs) return;
    var items = [], xs = [], ys = [];
    var wallIds = {};
    refs.forEach(function (r) {
      var e = entityOf(r);
      if (!e) return;
      items.push({ kind: r.kind, data: JSON.parse(JSON.stringify(e)) });
      if (r.kind === 'wall') {
        wallIds[e.id] = true;
        xs.push(e.x1, e.x2); ys.push(e.y1, e.y2);
      } else if (e.pts) {
        e.pts.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); });
      } else if (e.x1 != null) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
      else if (e.x != null) { xs.push(e.x); ys.push(e.y); }
    });
    // las puertas/ventanas de las paredes copiadas viajan con ellas
    state.openings.forEach(function (o) {
      if (wallIds[o.wallId]) items.push({ kind: 'opening', data: JSON.parse(JSON.stringify(o)) });
    });
    if (!items.length) return;
    clipboard = {
      items: items,
      ref: [Math.min.apply(null, xs), Math.min.apply(null, ys)]
    };
    setHint('✔ ' + items.length + ' elemento(s) copiados — Ctrl+V pega donde esté el cursor');
  }
  function pasteClip(at, forceOffset) {
    if (!clipboard) return;
    pushUndo();
    var dx = forceOffset != null ? forceOffset : Math.round(at[0] - clipboard.ref[0]);
    var dy = forceOffset != null ? forceOffset : Math.round(at[1] - clipboard.ref[1]);
    var wallMap = {};
    var newRefs = [];
    clipboard.items.forEach(function (it) {
      var d = JSON.parse(JSON.stringify(it.data));
      var oldId = d.id;
      d.id = uid();
      if (it.kind === 'wall') {
        wallMap[oldId] = d.id;
        d.x1 += dx; d.y1 += dy; d.x2 += dx; d.y2 += dy;
        state.walls.push(d); newRefs.push({ kind: 'wall', id: d.id });
      } else if (it.kind === 'opening') {
        d.wallId = wallMap[d.wallId];
        if (d.wallId) state.openings.push(d);
      } else if (it.kind === 'symbol' || it.kind === 'text') {
        d.x += dx; d.y += dy;
        state[it.kind === 'symbol' ? 'symbols' : 'texts'].push(d);
        newRefs.push({ kind: it.kind, id: d.id });
      } else if (it.kind === 'leader') {
        d.x += dx; d.y += dy; d.tx += dx; d.ty += dy;
        state.leaders.push(d); newRefs.push({ kind: 'leader', id: d.id });
      } else if (it.kind === 'dim' || it.kind === 'wire') {
        d.x1 += dx; d.y1 += dy; d.x2 += dx; d.y2 += dy;
        state[it.kind === 'dim' ? 'dims' : 'wires'].push(d);
        newRefs.push({ kind: it.kind, id: d.id });
      } else if (it.kind === 'area') {
        d.pts = d.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
        state.areas.push(d); newRefs.push({ kind: 'area', id: d.id });
      }
    });
    sel = null;
    selGroup = newRefs.length > 1 ? newRefs : null;
    if (newRefs.length === 1) sel = newRefs[0];
    refresh();
  }

  function deleteGroup() {
    if (!selGroup) return;
    pushUndo();
    selGroup.forEach(function (r) {
      if (r.kind === 'wall') {
        state.openings = state.openings.filter(function (o) { return o.wallId !== r.id; });
        state.walls = state.walls.filter(function (w) { return w.id !== r.id; });
      } else {
        var pool = { symbol: 'symbols', text: 'texts', dim: 'dims', area: 'areas', wire: 'wires', leader: 'leaders' }[r.kind];
        if (pool) state[pool] = state[pool].filter(function (x) { return x.id !== r.id; });
      }
    });
    selGroup = null;
    refresh();
  }

  function showProps() {
    var body = $('#propsBody');
    if (selGroup) {
      body.className = 'pbody';
      body.innerHTML = '<div><b>' + selGroup.length + ' elementos seleccionados</b></div>' +
        '<div class="muted small">Arrastra cualquiera para mover el grupo completo</div>' +
        '<button class="danger" id="prDelGroup">🗑 Borrar todo el grupo</button>';
      var bg = $('#prDelGroup');
      if (bg) bg.addEventListener('click', deleteGroup);
      return;
    }
    var e = findSel();
    if (!e) { body.className = 'pbody muted'; body.textContent = 'Nada seleccionado'; return; }
    body.className = 'pbody';
    var html = '';
    if (sel.kind === 'wall') {
      var g = wallGeom(e);
      html += '<div class="row"><label>Tipo</label><select id="prWallType">';
      Object.keys(WALL_TYPES).forEach(function (k) {
        html += '<option value="' + k + '"' + (e.type === k ? ' selected' : '') + '>' + WALL_TYPES[k].name + '</option>';
      });
      html += '</select></div>';
      html += '<div class="row"><label>Largo</label><input id="prWallLen" value="' + fmtFtIn(g.len) + '"></div>';
      if (WALL_TYPES[e.type] && WALL_TYPES[e.type].dry) {
        html += '<button id="prFlipDry">↕ Lado del drywall</button>';
      }
      html += '<button class="danger" id="prDelete">🗑 Borrar pared</button>';
    } else if (sel.kind === 'opening') {
      html += '<div class="row"><label>Tipo</label><select id="prOpenType">';
      Object.keys(OPEN_NAMES).forEach(function (k) {
        html += '<option value="' + k + '"' + (e.type === k ? ' selected' : '') + '>' + OPEN_NAMES[k] + '</option>';
      });
      html += '</select></div>';
      html += '<div class="row"><label>Ancho</label><input id="prOpenW" value="' + fmtFtIn(e.w) + '"></div>';
      if (e.type === 'door' || e.type === 'double' || e.type === 'bifold') {
        html += '<div class="row"><button id="prFlipSwing">↕ Abatimiento</button>' +
          (e.type === 'door' ? '<button id="prFlipHinge">↔ Bisagra</button>' : '') + '</div>';
      }
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    } else if (sel.kind === 'symbol') {
      var def = SYMBOLS[e.key];
      html += '<div><b>' + esc(def.name) + '</b></div>';
      html += '<div class="row"><label>Rotación</label><input id="prRot" type="number" step="15" value="' + (e.rot || 0) + '"></div>';
      html += '<div class="row"><label>Escala</label><input id="prScale" type="number" step="0.1" min="0.2" value="' + (e.scale || 1) + '"></div>';
      html += '<div class="row"><button id="prDup">⧉ Duplicar</button><button id="prRot45">⟳ 45°</button></div>';
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    } else if (sel.kind === 'text') {
      html += '<div class="row"><label>Texto</label><input id="prText" value="' + esc(e.text) + '"></div>';
      html += '<div class="row"><label>Tamaño</label><input id="prTextSize" type="number" min="4" value="' + (e.size || 9) + '"></div>';
      html += '<div class="row"><label>Estilo</label><select id="prTextStyle">' +
        '<option value="plain"' + (!e.style || e.style === 'plain' ? ' selected' : '') + '>Plain text</option>' +
        '<option value="circle"' + (e.style === 'circle' ? ' selected' : '') + '>Bubble ① (conductor #)</option>' +
        '<option value="hex"' + (e.style === 'hex' ? ' selected' : '') + '>Hexagon ⬡ (key note)</option></select></div>';
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    } else if (sel.kind === 'dim') {
      html += '<div class="row"><label>Length</label><input id="prDimLen" value="' + fmtFtIn(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)) + '"></div>';
      html += '<div class="muted small">Doble clic en la cota también edita la medida · arrástrala para separarla</div>';
      html += '<button id="prFlipDim">↕ Cambiar lado</button>';
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    } else if (sel.kind === 'wire') {
      html += '<div><b>Longitud: ' + fmtFtIn(wireLen(e)) + '</b></div>';
      html += '<div class="row"><label>Etiqueta</label><input id="prWireLabel" placeholder="ej: Feeder (1) FPL→MSB" value="' + esc(e.label || '') + '"></div>';
      var wireOpts = [
        ['dashed', 'Switch leg (dashed curve)'],
        ['solid', 'Circuit (solid curve)'],
        ['conduit', 'Conduit double-line — straight (riser)'],
        ['conduitortho', 'Conduit double-line — L (riser)'],
        ['straight', 'Thin straight (solid)'],
        ['straightdashed', 'Dashed straight (GEC / ground)'],
        ['ortho', 'Thin L / ortho (solid)'],
        ['orthodashed', 'Dashed L / ortho']
      ];
      html += '<div class="row"><label>Estilo</label><select id="prWireStyle">';
      wireOpts.forEach(function (o) {
        html += '<option value="' + o[0] + '"' + ((e.style || 'dashed') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      });
      html += '</select></div>';
      html += '<div class="row"><label>Curvatura</label><input id="prWireBulge" type="number" step="0.05" min="-0.6" max="0.6" value="' + (e.bulge == null ? 0.22 : e.bulge) + '"></div>';
      var CAPS = [['none', '— ninguno'], ['arrow', '➤ Flecha'], ['dot', '● Punto'], ['tick', '/ Raya']];
      ['S:Inicio', 'E:Final'].forEach(function (m) {
        var parts = m.split(':'), key = 'cap' + parts[0];
        html += '<div class="row"><label>' + parts[1] + '</label><select id="prWireCap' + parts[0] + '">';
        CAPS.forEach(function (c) {
          html += '<option value="' + c[0] + '"' + ((e[key] || 'none') === c[0] ? ' selected' : '') + '>' + c[1] + '</option>';
        });
        html += '</select></div>';
      });
      html += '<button id="prWireFlip">↕ Cambiar lado del arco</button>';
      html += '<button id="prWireToWall">▬ Convertir en pared</button>';
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    } else if (sel.kind === 'leader') {
      html += '<div class="row"><label>Texto</label><input id="prLeadText" value="' + esc(e.text) + '"></div>';
      html += '<div class="row"><label>Tamaño</label><input id="prLeadSize" type="number" min="4" value="' + (e.size || 7) + '"></div>';
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    } else if (sel.kind === 'area') {
      if (e.open) {
        html += '<div><b>Length: ' + fmtFtIn(polyPerim(e.pts, true)) + '</b></div>';
      } else {
        html += '<div><b>Area: ' + (polyArea(e.pts) / 144).toFixed(1) + ' sq ft</b> · Perimeter: ' + fmtFtIn(polyPerim(e.pts, false)) + '</div>';
      }
      if (!e.open) {
        html += '<div class="row"><label>Fill</label><select id="prAreaPat">';
        Object.keys(AREA_PATTERNS).forEach(function (k) {
          html += '<option value="' + k + '"' + (e.pattern === k ? ' selected' : '') + '>' + AREA_PATTERNS[k].name + '</option>';
        });
        html += '</select></div>';
        html += '<div class="row"><label>Rotación</label><input id="prAreaRot" type="number" step="15" value="' + (e.rot || 0) + '"></div>';
      }
      html += '<div class="row"><label>Line</label><select id="prAreaLine">' +
        '<option value="solid"' + (!e.lineStyle || e.lineStyle === 'solid' ? ' selected' : '') + '>Solid</option>' +
        '<option value="dashed"' + (e.lineStyle === 'dashed' ? ' selected' : '') + '>Dashed</option>' +
        '<option value="cloud"' + (e.lineStyle === 'cloud' ? ' selected' : '') + '>Cloud (revisión)</option></select></div>';
      // muestrario fijo de colores: el selector nativo no abre dentro del visor
      html += '<div class="row"><label>Color</label><div class="swRow" id="prColorRow">' +
        COLOR_PRESETS.map(function (c) {
          return '<span class="sw' + ((e.color || '#14161a') === c[0] ? ' cur' : '') + '" data-c="' + c[0] + '" title="' + c[1] + '" style="background:' + c[0] + '"></span>';
        }).join('') + '</div></div>';
      html += '<div class="row"><label>Grosor</label><select id="prAreaLw">' +
        [['0.5', 'Fina'], ['0.9', 'Normal'], ['1.5', 'Gruesa'], ['2.4', 'Extra gruesa']].map(function (o2) {
          return '<option value="' + o2[0] + '"' + ((e.lw || 0.9) === parseFloat(o2[0]) ? ' selected' : '') + '>' + o2[1] + ' (' + o2[0] + ')</option>';
        }).join('') + '</select></div>';
      html += '<div class="row"><label style="flex:1">Mostrar medida</label><input id="prAreaLbl" type="checkbox"' + (e.showLabel ? ' checked' : '') + ' title="Escribe el sq ft (o la longitud) en el plano"></div>';
      if (e.open) {
        html += '<button id="prToWall">▬ Convertir en paredes</button>';
      }
      html += '<button class="danger" id="prDelete">🗑 Borrar</button>';
    }
    body.innerHTML = html;

    // cada control captura su propio nodo (n) para no leer el valor de otro
    function on(id, evt, fn) {
      var n = $('#' + id);
      if (n) n.addEventListener(evt, function () { fn(n); });
    }
    on('prDelete', 'click', deleteSelected);
    on('prWallType', 'change', function (n) {
      if (!WALL_TYPES[n.value]) return;
      pushUndo(); e.type = n.value; e.t = WALL_TYPES[n.value].t; refresh();
    });
    on('prWallLen', 'change', function (n) {
      var v = parseDist(n.value); if (!v || v <= 0) return;
      pushUndo();
      var g = wallGeom(e);
      e.x2 = e.x1 + g.ux * v; e.y2 = e.y1 + g.uy * v;
      refresh();
    });
    on('prOpenType', 'change', function (n) {
      if (!OPEN_NAMES[n.value]) return;
      pushUndo(); e.type = n.value; refresh();
    });
    on('prOpenW', 'change', function (n) {
      var v = parseDist(n.value); if (!v || v < 6) return;
      pushUndo(); e.w = v; refresh();
    });
    on('prFlipDry', 'click', function () { pushUndo(); e.drySide = -(e.drySide || 1); refresh(); });
    on('prFlipSwing', 'click', function () { pushUndo(); e.swing = -(e.swing || 1); refresh(); });
    on('prFlipHinge', 'click', function () { pushUndo(); e.hinge = e.hinge ? 0 : 1; refresh(); });
    on('prRot', 'change', function (n) { pushUndo(); e.rot = parseFloat(n.value) || 0; refresh(); });
    on('prRot45', 'click', function () { pushUndo(); e.rot = ((e.rot || 0) + 45) % 360; refresh(); });
    on('prScale', 'change', function (n) { pushUndo(); e.scale = Math.max(0.2, parseFloat(n.value) || 1); refresh(); });
    on('prDup', 'click', function () {
      pushUndo();
      var c = JSON.parse(JSON.stringify(e)); c.id = uid(); c.x += 24; c.y += 24;
      state.symbols.push(c); sel = { kind: 'symbol', id: c.id }; refresh();
    });
    on('prText', 'change', function (n) { pushUndo(); e.text = n.value; refresh(); });
    on('prTextSize', 'change', function (n) { pushUndo(); e.size = parseFloat(n.value) || 9; refresh(); });
    on('prTextStyle', 'change', function (n) { pushUndo(); e.style = n.value; refresh(); });
    on('prFlipDim', 'click', function () { pushUndo(); e.off = -(e.off == null ? 14 : e.off); refresh(); });
    on('prDimLen', 'change', function (n) {
      var nv = parseDist(n.value);
      if (!nv || nv <= 0) return;
      pushUndo();
      var l0 = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
      e.x2 = e.x1 + (e.x2 - e.x1) / l0 * nv;
      e.y2 = e.y1 + (e.y2 - e.y1) / l0 * nv;
      refresh();
    });
    on('prAreaPat', 'change', function (n) {
      if (!AREA_PATTERNS[n.value]) return;
      pushUndo(); e.pattern = n.value; refresh();
    });
    on('prAreaRot', 'change', function (n) { pushUndo(); e.rot = parseFloat(n.value) || 0; refresh(); });
    on('prAreaLine', 'change', function (n) { pushUndo(); e.lineStyle = n.value; refresh(); });
    $$('#prColorRow .sw').forEach(function (sw) {
      sw.addEventListener('click', function () {
        pushUndo(); e.color = sw.dataset.c; refresh(); showProps();
      });
    });
    on('prAreaLw', 'change', function (n) { pushUndo(); e.lw = parseFloat(n.value) || 0.9; refresh(); });
    on('prAreaLbl', 'change', function (n) { pushUndo(); e.showLabel = n.checked; refresh(); });
    on('prToWall', 'click', function () {
      // convierte cada tramo de la polilínea en una pared del tipo actual
      pushUndo();
      var wt = $('#wallType').value;
      for (var i = 0; i < e.pts.length - 1; i++) {
        state.walls.push({
          id: uid(), x1: e.pts[i][0], y1: e.pts[i][1], x2: e.pts[i + 1][0], y2: e.pts[i + 1][1],
          type: wt, t: WALL_TYPES[wt].t
        });
      }
      state.areas = state.areas.filter(function (x) { return x.id !== e.id; });
      sel = null;
      refresh();
      setHint('✔ Polilínea convertida en ' + (e.pts.length - 1) + ' pared(es) de ' + WALL_TYPES[wt].name);
    });
    on('prWireStyle', 'change', function (n) { pushUndo(); e.style = n.value; lastWireStyle = n.value; refresh(); });
    on('prWireLabel', 'change', function (n) { pushUndo(); e.label = n.value; refresh(); });
    on('prWireBulge', 'change', function (n) { pushUndo(); e.bulge = Math.max(-0.6, Math.min(0.6, parseFloat(n.value) || 0.22)); refresh(); });
    on('prWireFlip', 'click', function () { pushUndo(); e.side = -(e.side || 1); refresh(); });
    on('prWireCapS', 'change', function (n) { pushUndo(); e.capS = n.value; refresh(); });
    on('prWireCapE', 'change', function (n) { pushUndo(); e.capE = n.value; refresh(); });
    on('prWireToWall', 'click', function () {
      pushUndo();
      var wt = $('#wallType').value;
      state.walls.push({ id: uid(), x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, type: wt, t: WALL_TYPES[wt].t });
      state.wires = state.wires.filter(function (x) { return x.id !== e.id; });
      sel = null;
      refresh();
      setHint('✔ Línea convertida en pared de ' + WALL_TYPES[wt].name);
    });
    on('prLeadText', 'change', function (n) { pushUndo(); e.text = n.value; refresh(); });
    on('prLeadSize', 'change', function (n) { pushUndo(); e.size = parseFloat(n.value) || 7; refresh(); });
  }

  function deleteSelected() {
    var e = findSel(); if (!e) return;
    pushUndo();
    if (sel.kind === 'wall') {
      state.walls = state.walls.filter(function (w) { return w.id !== e.id; });
      state.openings = state.openings.filter(function (o) { return o.wallId !== e.id; });
    } else {
      var pool = { opening: 'openings', symbol: 'symbols', text: 'texts', dim: 'dims', area: 'areas', wire: 'wires', leader: 'leaders' }[sel.kind];
      state[pool] = state[pool].filter(function (x) { return x.id !== e.id; });
    }
    sel = null;
    refresh();
  }

  /* ---------------- conteo de materiales ---------------- */
  function refreshCounts() {
    var body = $('#countsBody');
    var rows = '';
    // símbolos por categoría
    var byCat = {};
    state.symbols.forEach(function (s) {
      var d = SYMBOLS[s.key]; if (!d) return;
      byCat[d.cat] = byCat[d.cat] || {};
      byCat[d.cat][s.key] = (byCat[d.cat][s.key] || 0) + 1;
    });
    Object.keys(SYMBOL_CATS).forEach(function (cat) {
      if (!byCat[cat]) return;
      rows += '<tr class="cat"><td colspan="2">' + SYMBOL_CATS[cat] + '</td></tr>';
      Object.keys(byCat[cat]).forEach(function (k) {
        rows += '<tr><td>' + esc(SYMBOLS[k].name) + '</td><td class="n">' + byCat[cat][k] + '</td></tr>';
      });
    });
    // aberturas
    var openCount = {};
    state.openings.forEach(function (o) { openCount[o.type] = (openCount[o.type] || 0) + 1; });
    if (Object.keys(openCount).length) {
      rows += '<tr class="cat"><td colspan="2">Doors &amp; Windows</td></tr>';
      Object.keys(openCount).forEach(function (k) {
        rows += '<tr><td>' + OPEN_NAMES[k] + '</td><td class="n">' + openCount[k] + '</td></tr>';
      });
    }
    // superficies en pies cuadrados
    var areaSum = {};
    state.areas.forEach(function (a) { areaSum[a.pattern] = (areaSum[a.pattern] || 0) + polyArea(a.pts); });
    if (Object.keys(areaSum).length) {
      rows += '<tr class="cat"><td colspan="2">Surfaces / Roofs</td></tr>';
      Object.keys(areaSum).forEach(function (k) {
        rows += '<tr><td>' + AREA_PATTERNS[k].name + '</td><td class="n">' + (areaSum[k] / 144).toFixed(1) + ' sq ft</td></tr>';
      });
    }
    // cableado: agrupado por etiqueta (o por estilo si no tiene)
    var wireGroups = {};
    state.wires.forEach(function (w) {
      var key = w.label || WIRE_STYLE_NAMES[w.style || 'dashed'] || 'Cableado';
      wireGroups[key] = wireGroups[key] || { n: 0, len: 0 };
      wireGroups[key].n++;
      wireGroups[key].len += wireLen(w);
    });
    if (Object.keys(wireGroups).length) {
      rows += '<tr class="cat"><td colspan="2">Wiring / Circuits</td></tr>';
      Object.keys(wireGroups).forEach(function (k) {
        var g = wireGroups[k];
        rows += '<tr><td>' + esc(k) + (g.n > 1 ? ' ×' + g.n : '') + '</td><td class="n">' + (g.len / 12).toFixed(1) + ' ft</td></tr>';
      });
    }
    // pies lineales de pared
    var wallLen = {};
    state.walls.forEach(function (w) { wallLen[w.type] = (wallLen[w.type] || 0) + wallGeom(w).len; });
    if (Object.keys(wallLen).length) {
      rows += '<tr class="cat"><td colspan="2">Walls (linear feet)</td></tr>';
      Object.keys(wallLen).forEach(function (k) {
        rows += '<tr><td>' + WALL_TYPES[k].name + '</td><td class="n">' + (wallLen[k] / 12).toFixed(1) + ' ft</td></tr>';
      });
    }
    body.innerHTML = rows ? '<table>' + rows + '</table>' : '<span class="muted">Sin elementos aún</span>';
  }

  /* ---------------- exportar lista de materiales (estilo Markups List) ---------------- */
  function exportTakeoffCsv() {
    var rows = [['Category', 'Item', 'Label', 'Qty', 'Length (ft)', 'Length (ft-in)', 'Area (sq ft)']];
    var byCat = {};
    state.symbols.forEach(function (s) {
      var d = SYMBOLS[s.key]; if (!d) return;
      byCat[s.key] = (byCat[s.key] || 0) + 1;
    });
    Object.keys(byCat).forEach(function (k) {
      var d = SYMBOLS[k];
      rows.push([SYMBOL_CATS[d.cat] || d.cat, d.name, '', byCat[k], '', '', '']);
    });
    var openCount = {};
    state.openings.forEach(function (o) { openCount[o.type] = (openCount[o.type] || 0) + 1; });
    Object.keys(openCount).forEach(function (k) {
      rows.push(['Doors & Windows', OPEN_NAMES[k], '', openCount[k], '', '', '']);
    });
    state.wires.forEach(function (w) {
      var L = wireLen(w);
      rows.push(['Wiring', WIRE_STYLE_NAMES[w.style || 'dashed'] || 'Cableado', w.label || '', 1, (L / 12).toFixed(2), fmtFtIn(L), '']);
    });
    var wallLen = {};
    state.walls.forEach(function (w) { wallLen[w.type] = (wallLen[w.type] || 0) + wallGeom(w).len; });
    Object.keys(wallLen).forEach(function (k) {
      rows.push(['Walls', WALL_TYPES[k].name, '', '', (wallLen[k] / 12).toFixed(2), fmtFtIn(wallLen[k]), '']);
    });
    state.areas.forEach(function (a) {
      rows.push(['Surfaces', AREA_PATTERNS[a.pattern] ? AREA_PATTERNS[a.pattern].name : a.pattern, '', 1, '', '', (polyArea(a.pts) / 144).toFixed(1)]);
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    saveFile((state.project.name || 'proyecto') + '_materiales.csv', csv);
    setHint('Lista de materiales exportada a CSV (se abre en Excel)');
  }

  /* ---------------- puente al estimador de Max Power (Fase 3) ----------------
     El plano dice CUÁNTO · el estimador dice A CÓMO · el proyecto dice CÓMO SALIÓ.
     Este botón deja las cantidades en las tablas del estimador (estado BORRADOR),
     usando los nombres EXACTOS del catálogo y la tabla alias_takeoff. */
  var SB = window.MAXPOWER_SUPABASE || null;
  function sbAuth() { try { return JSON.parse(localStorage.getItem('mxp_sb_auth') || 'null'); } catch (e) { return null; } }
  function sbFetch(path, opts) {
    opts = opts || {};
    var auth = sbAuth();
    var headers = { 'apikey': SB.key, 'Content-Type': 'application/json' };
    if (auth && auth.access_token) headers['Authorization'] = 'Bearer ' + auth.access_token;
    if (opts.prefer) headers['Prefer'] = opts.prefer;
    return fetch(SB.url + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (r.status === 401) throw new Error('login');
        return r.text().then(function (t) {
          var data = null; try { data = t ? JSON.parse(t) : null; } catch (e2) {}
          if (!r.ok) throw new Error((data && (data.message || data.msg || data.error_description)) || ('HTTP ' + r.status));
          return data;
        });
      });
  }
  function sbLogin(email, pass) {
    return fetch(SB.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.access_token) throw new Error(d.error_description || d.msg || 'email o contraseña incorrectos');
      localStorage.setItem('mxp_sb_auth', JSON.stringify({ access_token: d.access_token, email: email }));
      return d;
    });
  }
  function askLogin(done) {
    uiPrompt('Entra con tu usuario del panel de Max Power — email:', (sbAuth() && sbAuth().email) || '', function (em) {
      if (!em) return;
      uiPrompt('Contraseña:', '', function (pw) {
        var inp0 = $('#askInput'); if (inp0) inp0.type = 'text';
        if (pw === null || pw === '') return;
        setHint('Entrando al estimador…');
        sbLogin(em.trim(), pw).then(function () { setHint('✔ Sesión iniciada'); done(); })
          .catch(function (e) { uiAlert('No se pudo entrar: ' + e.message); setHint(''); });
      });
      var inp = $('#askInput'); if (inp) inp.type = 'password';
    });
  }
  function normTxt2(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  // cantidades de TODO el set (todas las hojas), listas para mapear al catálogo
  function buildTakeoffEntries() {
    syncSheet();
    var out = [];
    function add(name, qty, unit) { if (qty > 0) out.push({ name: name, qty: qty, unit: unit }); }
    var byKey = {}, oc = {}, wg = {}, wl = {}, areas = [];
    state.sheets.forEach(function (sh) {
      var d = {}; try { d = JSON.parse(sh.data || '{}'); } catch (e) {}
      (d.symbols || []).forEach(function (s) { if (SYMBOLS[s.key]) byKey[s.key] = (byKey[s.key] || 0) + 1; });
      (d.openings || []).forEach(function (o) { oc[o.type] = (oc[o.type] || 0) + 1; });
      (d.wires || []).forEach(function (w) {
        var key = w.label || WIRE_STYLE_NAMES[w.style || 'dashed'] || 'Cableado';
        wg[key] = (wg[key] || 0) + wireLen(w);
      });
      (d.walls || []).forEach(function (w) { wl[w.type] = (wl[w.type] || 0) + wallGeom(w).len; });
      (d.areas || []).forEach(function (a) {
        if (a.open || !AREA_PATTERNS[a.pattern] || a.pattern === 'none') return;
        areas.push([AREA_PATTERNS[a.pattern].name, Math.round(polyArea(a.pts) / 144)]);
      });
    });
    Object.keys(byKey).forEach(function (k) { add(SYMBOLS[k].name, byKey[k], 'EA'); });
    Object.keys(oc).forEach(function (k) { add(OPEN_NAMES[k], oc[k], 'EA'); });
    Object.keys(wg).forEach(function (k) { add(k, Math.ceil(wg[k] / 12), 'FT'); });
    Object.keys(wl).forEach(function (k) { add(WALL_TYPES[k].name + ' wall', Math.ceil(wl[k] / 12), 'FT'); });
    areas.forEach(function (a) { add(a[0], a[1], 'SF'); });
    return out;
  }
  if ($('#btnEst')) $('#btnEst').addEventListener('click', function () {
    if (!SB || typeof fetch === 'undefined') { uiAlert('La conexión al estimador no está configurada.'); return; }
    var entries = buildTakeoffEntries();
    if (!entries.length) { uiAlert('El plano no tiene nada que contar todavía — coloca símbolos, paredes o cableado primero.'); return; }
    function go() {
      setHint('Leyendo el catálogo del estimador…');
      Promise.all([
        sbFetch('/rest/v1/catalogo_items?select=item,unidad,precio,horas_unidad'),
        sbFetch('/rest/v1/alias_takeoff?select=alias,item,factor')
      ]).then(function (res) {
        var cat = res[0] || [], alias = res[1] || [];
        if (!cat.length) {
          uiAlert('El catálogo del estimador llegó vacío.\nEntra con el usuario DUEÑO del panel de Max Power (el mismo de la app operativa) y vuelve a intentar.');
          localStorage.removeItem('mxp_sb_auth');
          setHint(''); return;
        }
        var catByNorm = {}; cat.forEach(function (c) { catByNorm[normTxt2(c.item)] = c; });
        var aliasByNorm = {}; alias.forEach(function (a) { aliasByNorm[normTxt2(a.alias)] = a; });
        var mapped = {}, unmapped = [];
        entries.forEach(function (e) {
          var n = normTxt2(e.name), target = null, factor = 1;
          var al = aliasByNorm[n];
          if (al) { target = catByNorm[normTxt2(al.item)]; factor = Number(al.factor) || 1; }
          if (!target) target = catByNorm[n];
          if (!target) { unmapped.push(e.name + ' (' + e.qty + ' ' + e.unit + ')'); return; }
          var k = target.item;
          if (!mapped[k]) mapped[k] = { item: target.item, unidad: target.unidad, precio: target.precio || 0, horas: target.horas_unidad || 0, cantidad: 0, origen: 'takeoff' };
          mapped[k].cantidad += e.qty * factor;
        });
        var items = Object.keys(mapped).map(function (k, i) { var m = mapped[k]; m.orden = i + 1; return m; });
        if (!items.length) {
          uiAlert('Ninguna pieza del plano coincide todavía con el catálogo del estimador.\n\nSIN MAPEAR:\n• ' + unmapped.join('\n• ') + '\n\nAgrega esos nombres en la tabla de alias del estimador (alias_takeoff) y vuelve a intentar.');
          setHint(''); return;
        }
        // estimate_id EST-AAAA-NNN: lo emite esta app (contrato de datos §3)
        var year = new Date().getFullYear();
        var seq = parseInt(localStorage.getItem('mxp_est_seq_' + year) || '0', 10) + 1;
        var estId = 'EST-' + year + '-' + ('00' + seq).slice(-3);
        setHint('Creando el estimado borrador…');
        sbFetch('/rest/v1/estimados', {
          method: 'POST', prefer: 'return=representation',
          body: [{
            nombre: (state.project.name || 'Takeoff MXP Planos') + ' [' + estId + ']',
            cliente: state.project.client || null,
            direccion: state.project.address || null,
            estado: 'borrador'
          }]
        }).then(function (rows) {
          var est = rows && rows[0];
          if (!est) throw new Error('no se recibió el estimado creado');
          items.forEach(function (it) { it.estimado_id = est.id; });
          return sbFetch('/rest/v1/estimado_items', { method: 'POST', body: items }).then(function () { return est; });
        }).then(function (est) {
          localStorage.setItem('mxp_est_seq_' + year, String(seq));
          state.project.estimateId = estId;
          scheduleAutosave();
          uiAlert('✔ Takeoff enviado al estimador de Max Power.\n\nEstimado: "' + est.nombre + '" — BORRADOR\nRenglones enviados: ' + items.length +
            (unmapped.length ? '\n\n⚠ SIN MAPEAR (no se enviaron — agrégalos como alias en el estimador):\n• ' + unmapped.join('\n• ') : '') +
            '\n\nÁbrelo en tu panel de Max Power → Estimador para elegir escenario y sacar el BID.');
          setHint('✔ Estimado ' + estId + ' creado como borrador en el estimador');
        }).catch(handleErr);
      }).catch(handleErr);
      function handleErr(e) {
        if (e && e.message === 'login') { askLogin(go); return; }
        uiAlert('No se pudo conectar con el estimador: ' + (e && e.message ? e.message : e) +
          '\n\nNota: dentro del visor de Claude las conexiones externas están bloqueadas — usa la app desde tu enlace propio (edgararboleya-rgb.github.io/mxp-planos).');
        setHint('');
      }
    }
    if (!sbAuth()) askLogin(go); else go();
  });

  /* ---------------- capas ---------------- */
  var LAYER_GROUPS = { background: ['gBackground'], architecture: ['gWalls'], areas: ['gAreas'], furniture: ['gFurniture'], electrical: ['gElectrical'], annotation: ['gAnnot'], grid: ['gGridBase'] };
  $$('#layersBody input[type=checkbox]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      layerVisible[cb.dataset.layer] = cb.checked;
      (LAYER_GROUPS[cb.dataset.layer] || []).forEach(function (gid) {
        document.getElementById(gid).style.display = cb.checked ? '' : 'none';
      });
    });
  });
  $('#bgOpacity').addEventListener('input', function () {
    if (state.bg) { state.bg.opacity = this.value / 100; renderBg(); }
  });

  // extrae solo la tinta del fondo: lo blanco se vuelve transparente, quedan las líneas
  function updateBgLinesBtn() {
    $('#btnBgLines').textContent = (state.bg && state.bg.origUrl)
      ? '↩ Volver a la imagen original'
      : '✂ Solo líneas (fondo transparente)';
  }
  $('#btnBgScale').addEventListener('click', function () {
    if (!state.bg) { uiAlert('Primero importa un plano con el botón "Subir Fondo".'); return; }
    showToolMenu('bgscale', this);
  });
  $('#btnBgLines').addEventListener('click', function () {
    if (!state.bg) { uiAlert('Primero importa un plano o screenshot con el botón "Fondo".'); return; }
    if (state.bg.origUrl) {
      state.bg.url = state.bg.origUrl;
      delete state.bg.origUrl;
      renderBg(); updateBgLinesBtn();
      return;
    }
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var d = ctx.getImageData(0, 0, cv.width, cv.height), px = d.data;
      for (var i = 0; i < px.length; i += 4) {
        var lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum > 185) {
          px[i + 3] = 0;                       // claro → transparente
        } else {
          var a = Math.min(255, (255 - lum) * 1.6);
          px[i] = 22; px[i + 1] = 30; px[i + 2] = 42;   // tinta uniforme
          px[i + 3] = a;
        }
      }
      ctx.putImageData(d, 0, 0);
      state.bg.origUrl = state.bg.url;
      state.bg.url = cv.toDataURL('image/png');
      if (state.bg.opacity < 0.95) { state.bg.opacity = 1; $('#bgOpacity').value = 100; }
      renderBg(); updateBgLinesBtn();
      setHint('✔ Solo quedaron las líneas del dibujo. Calíbralo (K) y dibuja tus paredes encima.');
    };
    img.src = state.bg.url;
  });

  /* ---------------- overlay de pisos: plano AZUL (base) + plano ROJO encima ---------------- */
  function updateOvUI() {
    var on = !!state.bg2;
    var r1 = $('#ovRow'), r2 = $('#ovRow2'), b = $('#btnOv');
    if (r1) r1.hidden = !on;
    if (r2) r2.hidden = !on;
    if (b) b.hidden = on;
  }
  // vuelve transparente lo claro y pinta la tinta del color dado (para comparar azul vs rojo)
  function tintTo(url, r, g, bl, cb) {
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var d = ctx.getImageData(0, 0, cv.width, cv.height), px = d.data;
      for (var i = 0; i < px.length; i += 4) {
        var lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (px[i + 3] < 10 || lum > 185) { px[i + 3] = 0; }
        else { px[i] = r; px[i + 1] = g; px[i + 2] = bl; px[i + 3] = Math.min(255, (255 - lum) * 1.6); }
      }
      ctx.putImageData(d, 0, 0);
      cb(cv.toDataURL('image/png'));
    };
    img.src = url;
  }
  function setBg2(url, pxW, pxH, paperW, paperH) {
    var base = state.bg;
    var w = base ? base.w : 600;
    // si el base ya tiene escala y el overlay sabe su tamaño de papel, entran a la MISMA escala
    if (paperW && base && base.scaleFactor) w = paperW * base.scaleFactor;
    state.bg2 = { url: url, x: base ? base.x : 0, y: base ? base.y : 0, w: w, h: w * pxH / pxW, opacity: 0.7 };
    if (paperW) { state.bg2.paperW = paperW; state.bg2.paperH = paperH; }
    // teñir: base AZUL, overlay ROJO
    if (base && !base.origUrl) {
      base.origUrl = base.url;
      tintTo(base.url, 28, 95, 168, function (u) { base.url = u; renderBg(); updateBgLinesBtn(); });
    }
    tintTo(url, 198, 40, 30, function (u) { if (state.bg2) { state.bg2.url = u; renderBg(); } });
    renderBg(); updateOvUI(); scheduleAutosave();
    setHint('🔴 Overlay cargado (ROJO) sobre el plano base (AZUL). Toca 🎯 Alinear para cuadrarlo por 2 puntos de control.');
  }
  $('#btnOv').addEventListener('click', function () {
    if (!state.bg) { uiAlert('Primero sube el plano BASE con "Subir Fondo". Después cargas el plano a comparar.'); return; }
    $('#fileBg2').click();
  });
  $('#fileBg2').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) { importPdfBackground(f, setBg2); return; }
    if (f.type && !/^image\//.test(f.type)) { uiAlert('Formato no soportado — sube una imagen o un PDF.'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () { setBg2(rd.result, img.width, img.height); };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  });
  $('#ov2Op').addEventListener('input', function () {
    if (state.bg2) { state.bg2.opacity = this.value / 100; renderBg(); }
  });
  $('#btnOvOff').addEventListener('click', function () {
    state.bg2 = null;
    if (state.bg && state.bg.origUrl) { state.bg.url = state.bg.origUrl; delete state.bg.origUrl; }
    renderBg(); updateOvUI(); updateBgLinesBtn(); scheduleAutosave();
    setHint('Overlay quitado — el plano base volvió a su color original.');
  });
  // alineación por 2 puntos de control (los ejes del edificio)
  var alignPts = null;
  $('#btnOvAlign').addEventListener('click', function () {
    if (!state.bg2) return;
    alignPts = [];
    setTool('align');
    setHint('🎯 ALINEAR 1/4: clic en el punto de control #1 del plano AZUL (base) — ej. el cruce de ejes A-1');
  });
  function alignDown(p) {
    if (!alignPts) return;
    alignPts.push(p);
    var msgs = [
      '🎯 ALINEAR 2/4: clic en el MISMO punto pero del plano ROJO (overlay)',
      '🎯 ALINEAR 3/4: clic en el punto de control #2 del plano AZUL — lo más lejos posible del #1',
      '🎯 ALINEAR 4/4: clic en el MISMO punto #2 pero del plano ROJO'
    ];
    if (alignPts.length < 4) { setHint(msgs[alignPts.length - 1]); return; }
    var Ab = alignPts[0], Ao = alignPts[1], Bb = alignPts[2], Bo = alignPts[3];
    alignPts = null;
    var dBase = Math.hypot(Bb[0] - Ab[0], Bb[1] - Ab[1]);
    var dOv = Math.hypot(Bo[0] - Ao[0], Bo[1] - Ao[1]);
    if (dOv < 1 || dBase < 1) { setTool('select'); setHint('Los puntos quedaron muy juntos — inténtalo otra vez.'); return; }
    var s = dBase / dOv;
    var g2 = state.bg2;
    pushUndo();
    g2.w *= s; g2.h *= s;
    g2.x = Ab[0] - (Ao[0] - g2.x) * s;
    g2.y = Ab[1] - (Ao[1] - g2.y) * s;
    renderBg(); setTool('select'); scheduleAutosave();
    setHint('✔ Overlay alineado — donde el ROJO no cuadra con el AZUL, algo cambió entre pisos.');
  }

  /* ---------------- proyecto ---------------- */
  $('#pjPrec').addEventListener('change', function () {
    state.precision = parseInt(this.value, 10) || 4;
    refresh();
  });
  $('#pjScale').addEventListener('change', function () {
    state.printScale = this.value;
  });
  var PJ_FIELDS = { pjName: 'name', pjClient: 'client', pjAddress: 'address', pjJob: 'job', pjSheetNo: 'sheetNo', pjSheetTitle: 'sheetTitle', pjDrawn: 'drawn' };
  Object.keys(PJ_FIELDS).forEach(function (id) {
    $('#' + id).addEventListener('input', function () {
      state.project[PJ_FIELDS[id]] = this.value;
      // el número/título de hoja vive también en la pestaña activa
      if (id === 'pjSheetNo' || id === 'pjSheetTitle') {
        var sh = state.sheets && state.sheets[state.curSheet];
        if (sh) {
          if (id === 'pjSheetNo') sh.no = this.value;
          else sh.title = this.value;
          renderSheetTabs();
        }
      }
      scheduleAutosave();
    });
  });
  function syncProjectInputs() {
    Object.keys(PJ_FIELDS).forEach(function (id) {
      $('#' + id).value = state.project[PJ_FIELDS[id]] || '';
    });
  }

  /* ---------------- multi-hoja: pestañas E-1, E-2… (como los sets de Bluebeam) ---------------- */
  function sheetData() {
    return JSON.stringify({
      walls: state.walls, openings: state.openings, symbols: state.symbols,
      texts: state.texts, dims: state.dims, areas: state.areas,
      wires: state.wires, leaders: state.leaders, bg: state.bg, bg2: state.bg2,
      view: { tx: view.tx, ty: view.ty, z: view.z }
    });
  }
  function syncSheet() {
    var sh = state.sheets && state.sheets[state.curSheet];
    if (!sh) return;
    sh.no = state.project.sheetNo || sh.no;
    sh.title = state.project.sheetTitle || sh.title;
    sh.data = sheetData();
  }
  function loadSheetData(json) {
    var o = {};
    try { o = json ? JSON.parse(json) : {}; } catch (e) {}
    state.walls = o.walls || []; state.openings = o.openings || [];
    state.symbols = o.symbols || []; state.texts = o.texts || [];
    state.dims = o.dims || []; state.areas = o.areas || [];
    state.wires = o.wires || []; state.leaders = o.leaders || [];
    state.bg = o.bg || null;
    state.bg2 = o.bg2 || null;
    if (o.view) Object.assign(view, o.view);
    sel = null; selGroup = null; measure = null; drawing = null;
    undoStack.length = 0; redoStack.length = 0;
    applyView(); refresh(); updateBgLinesBtn(); updateOvUI();
  }
  function activateSheet(i) {
    state.curSheet = i;
    var sh = state.sheets[i];
    state.project.sheetNo = sh.no; state.project.sheetTitle = sh.title;
    syncProjectInputs();
    loadSheetData(sh.data);
    renderSheetTabs();
    scheduleAutosave();
  }
  function switchSheet(i) {
    if (i === state.curSheet || !state.sheets[i]) return;
    syncSheet();
    activateSheet(i);
    setHint('Hoja ' + (state.sheets[i].no || '') + ' — cada hoja guarda su propio dibujo y su fondo');
  }
  function addSheet(no) {
    syncSheet();
    state.sheets.push({ no: no, title: '', data: null });
    activateSheet(state.sheets.length - 1);
    setHint('Hoja nueva ' + no + ' — dibuja aquí o súbele su plano de fondo');
  }
  function renderSheetTabs() {
    var el = $('#sheetTabs');
    if (!el) return;
    var html = '';
    state.sheets.forEach(function (sh, i) {
      html += '<button class="stab' + (i === state.curSheet ? ' active' : '') + '" data-i="' + i + '" title="Doble clic: renombrar la hoja">' +
        esc(sh.no || ('H' + (i + 1))) +
        (state.sheets.length > 1 ? '<span class="sx" data-x="' + i + '" title="Eliminar hoja">×</span>' : '') +
        '</button>';
    });
    html += '<button class="stab add" id="stAdd" title="Agregar hoja al set">+</button>';
    el.innerHTML = html;
    $$('#sheetTabs .stab[data-i]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.classList && t.classList.contains('sx')) {
          var idx = parseInt(t.dataset.x, 10);
          uiConfirm('¿Eliminar la hoja "' + (state.sheets[idx].no || '') + '" con todo su dibujo?', function (ok) {
            if (!ok) return;
            var wasActive = idx === state.curSheet;
            var activeObj = state.sheets[state.curSheet];
            state.sheets.splice(idx, 1);
            if (wasActive) activateSheet(Math.min(idx, state.sheets.length - 1));
            else { state.curSheet = state.sheets.indexOf(activeObj); renderSheetTabs(); scheduleAutosave(); }
          });
          return;
        }
        switchSheet(parseInt(b.dataset.i, 10));
      });
      b.addEventListener('dblclick', function () {
        var i = parseInt(b.dataset.i, 10);
        uiPrompt('Número de la hoja (ej: E-2):', state.sheets[i].no || '', function (v) {
          if (v === null || v === '') return;
          state.sheets[i].no = v;
          if (i === state.curSheet) { state.project.sheetNo = v; syncProjectInputs(); }
          renderSheetTabs(); scheduleAutosave();
        });
      });
    });
    var ad = $('#stAdd');
    if (ad) ad.addEventListener('click', function () {
      uiPrompt('Número de la hoja nueva (ej: E-2):', 'E-' + (state.sheets.length + 1), function (v) {
        if (v === null || v === '') return;
        addSheet(v);
      });
    });
  }

  /* ---------------- archivo: fondo, abrir, guardar ---------------- */
  // descarga un archivo: usa el sistema del visor de artifacts si existe, si no un <a download>
  function saveFile(filename, data) {
    function fallback() {
      var a = document.createElement('a');
      var blob = data instanceof Blob ? data : new Blob([data]);
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }
    if (typeof window.claude !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (dl) {
        if (!dl) { fallback(); return; }
        dl.save({ filename: filename, data: data }).catch(function (err) {
          if (err && err.code === 'extension_not_enabled') {
            dl.save({ filename: filename.replace(/\.[^.]+$/, '') + '.txt', data: data }).catch(function () {});
          } else if (!err || err.code !== 'declined') {
            fallback();
          }
        });
      });
      return;
    }
    fallback();
  }
  // (el botón Fondo es un <label for="fileBg">: el navegador abre el selector directo)
  function handleBgFile(f) {
    if (!f) return;
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) { importPdfBackground(f); return; }
    if (f.type && !/^image\//.test(f.type)) { uiAlert('Formato no soportado — sube una imagen (foto/screenshot) o un PDF.'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () { insertBackground(rd.result, img.width, img.height); };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  }
  // pegar screenshot con Ctrl+V (solo si no hay objetos copiados internamente)
  document.addEventListener('paste', function (ev) {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (clipboard) return;
    var items = (ev.clipboardData && ev.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        ev.preventDefault();
        handleBgFile(items[i].getAsFile());
        return;
      }
    }
  });
  // arrastrar y soltar sobre el lienzo
  var cwrap = $('#canvasWrap');
  cwrap.addEventListener('dragover', function (ev) { ev.preventDefault(); });
  cwrap.addEventListener('drop', function (ev) {
    ev.preventDefault();
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) handleBgFile(f);
  });

  function insertBackground(url, pxW, pxH, paperW, paperH) {
    pushUndo();
    var w = 600; // se inserta a 50 pies de ancho; luego se pone a escala o se calibra
    state.bg = { url: url, x: 0, y: 0, w: w, h: w * pxH / pxW, opacity: ($('#bgOpacity').value / 100) };
    if (paperW) { state.bg.paperW = paperW; state.bg.paperH = paperH; }
    renderBg();
    zoomFit();
    updateBgLinesBtn();
    setHint(paperW
      ? 'Plano importado. Usa "📐 Escala del plano" (a la derecha) si el plano trae su escala (ej: 1/4" = 1\'-0"), o calibra (⌖) con una medida conocida.'
      : 'Plano importado. Usa "📐 Escala del plano" si conoces la escala y el tamaño de hoja, o CALIBRAR (⌖) con una medida conocida.');
    setTool('calibrate');
  }

  function importPdfBackground(file, deliver) {
    if (typeof pdfjsLib === 'undefined') {
      uiAlert('No se encontró el módulo de PDF (js/vendor). Sube una imagen o captura del plano.');
      return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.MXP_PDF_WORKER_URL || 'js/vendor/pdf.worker.min.js';
    setHint('Leyendo PDF…');
    var rd = new FileReader();
    rd.onload = function () {
      tryOpen(null);
      // si el PDF pide contraseña, la pedimos y reintentamos (pdf.js consume el buffer: se copia)
      function tryOpen(password) {
        var data = rd.result.slice(0);
        var opts = password ? { data: data, password: password } : { data: data };
        pdfjsLib.getDocument(opts).promise.then(function (doc) {
          if (doc.numPages > 1) {
            if (deliver) {
              uiPrompt('El PDF tiene ' + doc.numPages + ' páginas. ¿Cuál quieres para el overlay?', '1', function (input) {
                if (input === null) { setHint(''); return; }
                renderPdfPage(doc, Math.max(1, Math.min(doc.numPages, parseInt(input, 10) || 1)), deliver);
              });
              return;
            }
            uiPrompt('El PDF tiene ' + doc.numPages + ' páginas. Escribe el número de la página que quieres — o TODAS para crear una hoja por página:', 'todas', function (input) {
              if (input === null) { setHint(''); return; }
              if (/^t/i.test(String(input).trim())) { importAllPages(doc, Math.min(doc.numPages, 15)); return; }
              renderPdfPage(doc, Math.max(1, Math.min(doc.numPages, parseInt(input, 10) || 1)));
            });
            return;
          }
          renderPdfPage(doc, 1, deliver);
        }).catch(function (err) {
          if (err && err.name === 'PasswordException') {
            uiPrompt(password
              ? 'Contraseña incorrecta — inténtalo otra vez:'
              : 'Este PDF está protegido con contraseña. Escríbela:', '', function (pw) {
              if (pw === null || pw === '') { setHint(''); return; }
              tryOpen(pw);
            });
            return;
          }
          console.error(err);
          uiAlert('No se pudo leer ese PDF. Prueba con una imagen o captura del plano.');
          setHint('');
        });
      }
    };
    rd.readAsArrayBuffer(file);
    function renderPdfPage(doc, pageNum, cb) {
      doc.getPage(pageNum).then(function (page) {
        var vp1 = page.getViewport({ scale: 1 });
        var scale = Math.min(4, 2800 / vp1.width);   // nítido pero sin pasarse de memoria
        var vp = page.getViewport({ scale: scale });
        var cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          // el PDF sabe su tamaño de papel real (72 puntos = 1"): con eso la escala del plano es exacta
          var url = cv.toDataURL('image/png');
          if (cb) cb(url, cv.width, cv.height, vp1.width / 72, vp1.height / 72);
          else insertBackground(url, cv.width, cv.height, vp1.width / 72, vp1.height / 72);
        });
      }).catch(function (err) {
        console.error(err);
        uiAlert('No se pudo renderizar esa página del PDF.');
        setHint('');
      });
    }
    // TODAS las páginas: página 1 en la hoja actual, cada página siguiente en su propia hoja nueva
    function importAllPages(doc, n) {
      var i = 1;
      function next() {
        if (i > n) {
          if (doc.numPages > n) uiAlert('Se importaron las primeras ' + n + ' páginas (límite por memoria del navegador).');
          setHint('✔ ' + n + ' páginas importadas — muévete entre hojas con las pestañas de abajo y ponle su 📐 escala a cada una');
          return;
        }
        setHint('Importando página ' + i + ' de ' + n + '…');
        renderPdfPage(doc, i, function (url, pxW, pxH, paperW, paperH) {
          if (i > 1) addSheet('PG-' + i);
          insertBackground(url, pxW, pxH, paperW, paperH);
          i++;
          next();
        });
      }
      next();
    }
  }

  $('#fileBg').addEventListener('change', function () {
    var f = this.files[0];
    this.value = '';
    handleBgFile(f);
  });

  $('#btnSave').addEventListener('click', function () {
    syncSheet();
    var data = JSON.stringify({ app: 'mxp-planos', version: 1, state: state, view: view });
    saveFile((state.project.name || 'proyecto').replace(/[^\w\-. ]+/g, '') + '.mxp.json', data);
    setHint('Proyecto guardado (archivo descargado)');
  });

  function restoreProject(o) {
    Object.assign(state, o.state);
    state.areas = o.state.areas || [];
    state.wires = o.state.wires || [];
    state.leaders = o.state.leaders || [];
    state.panels = o.state.panels || [];
    state.precision = o.state.precision || 4;
    $('#pjPrec').value = String(state.precision);
    state.printScale = o.state.printScale || 'fit';
    $('#pjScale').value = state.printScale;
    // proyectos viejos (sin multi-hoja): se envuelven en una sola hoja
    if (!state.sheets || !state.sheets.length) {
      state.sheets = [{ no: state.project.sheetNo || 'E-1', title: state.project.sheetTitle || '', data: null }];
      state.curSheet = 0;
    }
    if (state.curSheet == null || state.curSheet >= state.sheets.length) state.curSheet = 0;
    if (o.view) Object.assign(view, o.view);
    syncProjectInputs();
    renderSheetTabs(); updateBgLinesBtn();
    applyView(); refresh();
  }
  $('#btnOpen').addEventListener('click', function () { $('#fileOpen').click(); });
  $('#fileOpen').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(rd.result);
        if (o.app !== 'mxp-planos') throw new Error('formato');
        pushUndo();
        restoreProject(o);
        setHint('Proyecto abierto: ' + (state.project.name || f.name));
      } catch (e) { uiAlert('No se pudo abrir el archivo — no parece un proyecto de MXP Planos.'); }
    };
    rd.readAsText(f);
    this.value = '';
  });

  /* ---------------- zoom ---------------- */
  function contentBBox() {
    var xs = [], ys = [];
    state.walls.forEach(function (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
    state.symbols.forEach(function (s) {
      var d = SYMBOLS[s.key], r = Math.max(d.w, d.h) * (s.scale || 1) / 2 + 10;
      xs.push(s.x - r, s.x + r); ys.push(s.y - r, s.y + r);
    });
    state.texts.forEach(function (t) { xs.push(t.x, t.x + 60); ys.push(t.y - 12, t.y + 6); });
    state.dims.forEach(function (d) { xs.push(d.x1, d.x2); ys.push(d.y1, d.y2); });
    state.areas.forEach(function (a) { a.pts.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
    state.wires.forEach(function (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
    state.leaders.forEach(function (l) { xs.push(l.x, l.tx); ys.push(l.y, l.ty); });
    if (state.bg) { xs.push(state.bg.x, state.bg.x + state.bg.w); ys.push(state.bg.y, state.bg.y + state.bg.h); }
    if (!xs.length) return { x: -60, y: -60, w: 720, h: 480 };
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return { x: x0 - 30, y: y0 - 30, w: (x1 - x0) + 60, h: (y1 - y0) + 60 };
  }
  function zoomFit() {
    var b = contentBBox(), r = svg.getBoundingClientRect();
    var z = Math.min(r.width / b.w, r.height / b.h) * 0.92;
    view.z = Math.max(0.05, Math.min(20, z));
    view.tx = (r.width - b.w * view.z) / 2 - b.x * view.z;
    view.ty = (r.height - b.h * view.z) / 2 - b.y * view.z;
    applyView();
  }
  function zoomBy(f) {
    var r = svg.getBoundingClientRect();
    var cx = r.width / 2, cy = r.height / 2;
    var wx = (cx - view.tx) / view.z, wy = (cy - view.ty) / view.z;
    view.z = Math.max(0.05, Math.min(20, view.z * f));
    view.tx = cx - wx * view.z; view.ty = cy - wy * view.z;
    applyView();
  }
  $('#btnCsv').addEventListener('click', exportTakeoffCsv);
  $('#btnZoomIn').addEventListener('click', function () { zoomBy(1.25); });
  $('#btnZoomOut').addEventListener('click', function () { zoomBy(0.8); });
  $('#btnZoomFit').addEventListener('click', zoomFit);
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);

  /* ---------------- exportar PNG ---------------- */
  function cleanSvgClone(b) {
    var clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    ['gGridBase', 'gSel', 'gPreview', 'gMeasure'].forEach(function (id) {
      var n = clone.querySelector('#' + id);
      if (n) n.parentNode.removeChild(n);
    });
    var world = clone.querySelector('#world');
    world.setAttribute('transform', '');
    clone.setAttribute('viewBox', b.x + ' ' + b.y + ' ' + b.w + ' ' + b.h);
    clone.setAttribute('width', b.w); clone.setAttribute('height', b.h);
    var bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', b.x); bgRect.setAttribute('y', b.y);
    bgRect.setAttribute('width', b.w); bgRect.setAttribute('height', b.h);
    bgRect.setAttribute('fill', '#ffffff');
    clone.insertBefore(bgRect, world);
    return clone;
  }

  $('#btnPng').addEventListener('click', function () {
    var b = contentBBox();
    var clone = cleanSvgClone(b);
    var data = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(4, Math.max(1, 2400 / b.w));
      var cv = document.createElement('canvas');
      cv.width = Math.round(b.w * scale); cv.height = Math.round(b.h * scale);
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(function (blob) {
        saveFile((state.project.name || 'plano') + '.png', blob);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
    setHint('Exportando PNG…');
  });

  /* ---------------- imprimir / PDF ---------------- */
  var PRINT_SCALES = { 24: '1/2" = 1\'-0"', 32: '3/8" = 1\'-0"', 48: '1/4" = 1\'-0"', 64: '3/16" = 1\'-0"', 96: '1/8" = 1\'-0"' };
  // arma una hoja imprimible con el dibujo ACTUALMENTE cargado y la agrega al contenedor
  function buildPrintFrame(container) {
    var b = contentBBox();
    var clone = cleanSvgClone(b);
    clone.removeAttribute('width'); clone.removeAttribute('height');
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // escala de impresión: 'fit' = gráfica, o divisor (48 → 1/4" = 1'-0", porque 12"/48 = 1/4")
    var scaleVal = $('#pjScale').value;
    state.printScale = scaleVal;
    var scaleText = 'Graphic / N.T.S.';
    if (scaleVal !== 'fit' && PRINT_SCALES[scaleVal]) {
      var f = parseInt(scaleVal, 10);
      clone.style.width = (b.w / f) + 'in';
      clone.style.height = (b.h / f) + 'in';
      clone.style.display = 'block';
      scaleText = PRINT_SCALES[scaleVal];
    }

    // leyenda: solo símbolos usados
    var used = {};
    state.symbols.forEach(function (s) { used[s.key] = true; });
    var legend = '';
    Object.keys(used).forEach(function (k) {
      var d = SYMBOLS[k]; if (!d) return;
      legend += '<span class="it">' + symPreviewSvg(d, 26, 20) + esc(d.short || d.name) + '</span>';
    });

    var frame = document.createElement('div');
    frame.className = 'sheetFrame';
    frame.innerHTML =
      '  <div class="drawArea"></div>' +
      (legend ? '<div class="legend"><b style="font-size:8px">SYMBOL LEGEND:</b>' + legend + '</div>' : '') +
      titleBlockHtml(state.project.sheetNo || 'E-1', state.project.sheetTitle || 'PLANO', scaleText);
    frame.querySelector('.drawArea').appendChild(clone);
    container.appendChild(frame);
  }
  $('#btnPrint').addEventListener('click', function () {
    var ps = $('#printSheet');
    function go(all) {
      ps.innerHTML = '';
      if (all) {
        // set completo: se carga cada hoja, se arma su página, y se vuelve a la actual
        syncSheet();
        var orig = state.curSheet;
        state.sheets.forEach(function (sh, i) {
          state.curSheet = i;
          state.project.sheetNo = sh.no; state.project.sheetTitle = sh.title;
          loadSheetData(sh.data);
          buildPrintFrame(ps);
        });
        state.curSheet = orig;
        var so = state.sheets[orig];
        state.project.sheetNo = so.no; state.project.sheetTitle = so.title;
        syncProjectInputs();
        loadSheetData(so.data);
      } else {
        buildPrintFrame(ps);
      }
      ps.hidden = false;
      window.print();
      setTimeout(function () { ps.hidden = true; }, 500);
    }
    if (state.sheets.length > 1) {
      uiConfirm('El proyecto tiene ' + state.sheets.length + ' hojas. ¿Imprimir el SET completo?\n(Cancelar = solo la hoja actual)', function (ok) { go(!!ok); });
    } else go(false);
  });

  function titleBlockHtml(sheetNo, sheetTitle, scaleText) {
    scaleText = scaleText || 'Graphic / N.T.S.';
    var fecha = new Date().toLocaleDateString('es-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    var pj = state.project;
    return '<div class="titleBlock">' +
      '  <div class="tb brand" style="width:19%">' +
      '    <div class="bn">MAX POWER</div>' +
      '    <div class="bs">ELECTRICAL SOLUTIONS, INC.</div>' +
      '    <div class="bl">FL EC #EC13016045 · (305) 967-9311<br>info@mxpes.com · mxpes.com</div>' +
      '  </div>' +
      '  <div class="tb" style="flex:1"><div class="cap">Project</div><div class="val">' + esc(pj.name || '—') + '</div>' +
      '    <div class="cap" style="margin-top:2px">Address</div><div class="val">' + esc(pj.address || '—') + '</div></div>' +
      '  <div class="tb" style="width:15%"><div class="cap">Client</div><div class="val">' + esc(pj.client || '—') + '</div>' +
      '    <div class="cap" style="margin-top:2px">Job No.</div><div class="val">' + esc(pj.job || '—') + '</div></div>' +
      '  <div class="tb" style="width:13%"><div class="cap">Date</div><div class="val">' + fecha + '</div>' +
      '    <div class="cap" style="margin-top:2px">Drawn By</div><div class="val">' + esc(pj.drawn || '—') + '</div></div>' +
      '  <div class="tb" style="width:12%"><div class="cap">Scale</div><div class="val">' + esc(scaleText) + '</div>' +
      '    <div class="cap" style="margin-top:2px">Code</div><div class="val">NEC 2023 / FBC 8th</div></div>' +
      '  <div class="tb sheetno" style="width:15%">' +
      '    <div class="st">' + esc(sheetTitle) + '</div>' +
      '    <div class="sn">' + esc(sheetNo) + '</div>' +
      '  </div>' +
      '</div>';
  }

  /* ---------------- Panel Schedule E-2 ---------------- */
  function defaultPanel() {
    return {
      id: uid(), name: 'A', volts: '120/240V, 1Ø, 3W', main: '200A MCB',
      mount: 'Surface — NEMA 1', aic: '10 kA MIN. (VERIFY)', spaces: 30,
      circuits: {},   // { "1": {desc,trip,poles,va}, ... }
      loads: [
        { desc: 'Sq. Ft. (conditioned) × 3 VA/sq ft', va: 0, hvac: false },
        { desc: 'Small Appliance (2 circuits)', va: 3000, hvac: false },
        { desc: 'Laundry Circuit', va: 1500, hvac: false },
        { desc: 'Range', va: 12000, hvac: false },
        { desc: 'Clothes Dryer', va: 5000, hvac: false },
        { desc: 'Water Heater', va: 4500, hvac: false },
        { desc: 'Dishwasher', va: 1200, hvac: false },
        { desc: 'Garbage Disposal', va: 900, hvac: false },
        { desc: 'Microwave', va: 1500, hvac: false },
        { desc: 'Refrigerator + Washer', va: 1900, hvac: false },
        { desc: 'A/C + Air Handler (HVAC @ 100%)', va: 6000, hvac: true }
      ]
    };
  }
  function curPanel() {
    if (!state.panels.length) state.panels.push(defaultPanel());
    return state.panels[0];
  }
  function circuitPhase(n) {
    // 1Ø 3W: cada fila alterna A/B; ckt 1,2 → A; 3,4 → B; …
    return Math.floor((n - 1) / 2) % 2 === 0 ? 'A' : 'B';
  }
  function panelPhaseTotals(p) {
    var t = { A: 0, B: 0, total: 0 };
    Object.keys(p.circuits).forEach(function (k) {
      var va = parseFloat(p.circuits[k].va) || 0;
      t[circuitPhase(parseInt(k, 10))] += va;
      t.total += va;
    });
    return t;
  }
  function panelDemand(p) {
    var nonH = 0, hv = 0;
    p.loads.forEach(function (l) {
      var v = parseFloat(l.va) || 0;
      if (l.hvac) hv += v; else nonH += v;
    });
    var first = Math.min(8000, nonH);
    var rem = Math.max(0, nonH - 8000);
    var demand = first + rem * 0.4 + hv;
    return { nonH: nonH, hv: hv, first: first, rem: rem, demand: demand, amps: demand / 240 };
  }
  function fmtVa(v) { return (Math.round(v)).toLocaleString('en-US'); }

  function buildPanelModal() {
    var p = curPanel();
    $('#psName').value = p.name; $('#psVolts').value = p.volts; $('#psMain').value = p.main;
    $('#psMount').value = p.mount; $('#psSpaces').value = p.spaces; $('#psAic').value = p.aic;

    var rows = '<colgroup><col class="desc"><col><col><col><col style="width:30px"><col style="width:30px"><col><col><col><col class="desc"></colgroup>';
    rows += '<tr><th>DESCRIPTION</th><th>TRIP</th><th>P</th><th>VA</th><th>CKT</th><th>CKT</th><th>VA</th><th>P</th><th>TRIP</th><th>DESCRIPTION</th></tr>';
    for (var r = 0; r < p.spaces / 2; r++) {
      var lo = 2 * r + 1, ro = 2 * r + 2;
      var cl = p.circuits[lo] || {}, cr = p.circuits[ro] || {};
      rows += '<tr>' +
        '<td><input data-ckt="' + lo + '" data-f="desc" value="' + esc(cl.desc || '') + '" placeholder="SPACE"></td>' +
        '<td style="width:40px"><input class="num" data-ckt="' + lo + '" data-f="trip" value="' + esc(cl.trip || '') + '"></td>' +
        '<td style="width:28px"><input class="num" data-ckt="' + lo + '" data-f="poles" value="' + esc(cl.poles || '') + '"></td>' +
        '<td style="width:52px"><input class="num" data-ckt="' + lo + '" data-f="va" value="' + esc(cl.va || '') + '"></td>' +
        '<td class="ck">' + lo + '</td><td class="ck">' + ro + '</td>' +
        '<td style="width:52px"><input class="num" data-ckt="' + ro + '" data-f="va" value="' + esc(cr.va || '') + '"></td>' +
        '<td style="width:28px"><input class="num" data-ckt="' + ro + '" data-f="poles" value="' + esc(cr.poles || '') + '"></td>' +
        '<td style="width:40px"><input class="num" data-ckt="' + ro + '" data-f="trip" value="' + esc(cr.trip || '') + '"></td>' +
        '<td><input data-ckt="' + ro + '" data-f="desc" value="' + esc(cr.desc || '') + '" placeholder="SPACE"></td>' +
        '</tr>';
    }
    $('#psTable').innerHTML = rows;
    $$('#psTable input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var n = inp.dataset.ckt;
        p.circuits[n] = p.circuits[n] || {};
        p.circuits[n][inp.dataset.f] = inp.value;
        updatePanelTotals();
      });
    });

    var lr = '';
    p.loads.forEach(function (l, i) {
      lr += '<tr>' +
        '<td><input type="text" data-i="' + i + '" data-f="desc" value="' + esc(l.desc) + '"></td>' +
        '<td style="width:96px"><input class="num" data-i="' + i + '" data-f="va" value="' + (l.va || '') + '"></td>' +
        '<td class="cb"><label><input type="checkbox" data-i="' + i + '" data-f="hvac"' + (l.hvac ? ' checked' : '') + '> HVAC 100%</label></td>' +
        '<td style="width:26px;text-align:center"><button class="del" data-i="' + i + '">✕</button></td>' +
        '</tr>';
    });
    $('#psLoads').innerHTML = lr;
    $$('#psLoads input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var l = p.loads[parseInt(inp.dataset.i, 10)];
        if (inp.dataset.f === 'hvac') l.hvac = inp.checked;
        else if (inp.dataset.f === 'va') l.va = parseFloat(inp.value) || 0;
        else l.desc = inp.value;
        updatePanelTotals();
      });
    });
    $$('#psLoads button.del').forEach(function (b) {
      b.addEventListener('click', function () {
        p.loads.splice(parseInt(b.dataset.i, 10), 1);
        buildPanelModal();
      });
    });
    updatePanelTotals();
  }

  function updatePanelTotals() {
    var p = curPanel();
    var t = panelPhaseTotals(p);
    $('#psTotals').textContent = 'Connected per phase — A: ' + fmtVa(t.A) + ' VA · B: ' + fmtVa(t.B) +
      ' VA · Total: ' + fmtVa(t.total) + ' VA (' + (t.total / 240).toFixed(1) + ' A @ 240V)';
    var d = panelDemand(p);
    $('#psCalc').innerHTML =
      'Subtotal (non-HVAC): <b>' + fmtVa(d.nonH) + ' VA</b><br>' +
      'First 8,000 VA @ 100%: <b>' + fmtVa(d.first) + ' VA</b> · Remainder (' + fmtVa(d.rem) + ' VA) @ 40%: <b>' + fmtVa(d.rem * 0.4) + ' VA</b><br>' +
      'HVAC @ 100%: <b>' + fmtVa(d.hv) + ' VA</b><br>' +
      'CALCULATED DEMAND: <b>' + fmtVa(d.demand) + ' VA</b> → <b class="amp">' + d.amps.toFixed(1) + ' A @ 240V, 1Ø</b>';
  }

  $('#btnPanel').addEventListener('click', function () {
    pushUndo();
    buildPanelModal();
    $('#panelModal').hidden = false;
  });
  $('#psClose').addEventListener('click', function () { $('#panelModal').hidden = true; });
  $('#psAddLoad').addEventListener('click', function () {
    curPanel().loads.push({ desc: '', va: 0, hvac: false });
    buildPanelModal();
  });
  ['psName:name', 'psVolts:volts', 'psMain:main', 'psMount:mount', 'psAic:aic'].forEach(function (m) {
    var parts = m.split(':');
    $('#' + parts[0]).addEventListener('input', function () { curPanel()[parts[1]] = this.value; });
  });
  $('#psSpaces').addEventListener('change', function () {
    var v = Math.max(2, Math.min(84, parseInt(this.value, 10) || 30));
    curPanel().spaces = v % 2 ? v + 1 : v;
    buildPanelModal();
  });

  $('#psPrint').addEventListener('click', function () {
    var p = curPanel();
    var t = panelPhaseTotals(p), d = panelDemand(p);
    var html = '<div class="e2band">PANEL "' + esc(p.name) + '" SCHEDULE</div>';
    html += '<div class="e2hdr"><span><b>VOLTS:</b> ' + esc(p.volts) + '</span><span><b>MAIN:</b> ' + esc(p.main) +
      '</span><span><b>MOUNTING:</b> ' + esc(p.mount) + '</span><span><b>SPACES:</b> ' + p.spaces +
      '</span><span><b>AIC:</b> ' + esc(p.aic) + '</span></div>';
    html += '<table class="e2"><tr><th style="width:24%">DESCRIPTION</th><th>TRIP</th><th>P</th><th>VA</th><th>CKT</th><th>CKT</th><th>VA</th><th>P</th><th>TRIP</th><th style="width:24%">DESCRIPTION</th></tr>';
    for (var r = 0; r < p.spaces / 2; r++) {
      var lo = 2 * r + 1, ro = 2 * r + 2;
      var cl = p.circuits[lo] || {}, cr = p.circuits[ro] || {};
      html += '<tr>' +
        '<td>' + esc(cl.desc || 'SPACE') + '</td><td class="n">' + esc(cl.trip || '') + '</td><td class="n">' + esc(cl.poles || '') + '</td><td class="n">' + esc(cl.va || '') + '</td>' +
        '<td class="ck">' + lo + '</td><td class="ck">' + ro + '</td>' +
        '<td class="n">' + esc(cr.va || '') + '</td><td class="n">' + esc(cr.poles || '') + '</td><td class="n">' + esc(cr.trip || '') + '</td><td>' + esc(cr.desc || 'SPACE') + '</td>' +
        '</tr>';
    }
    html += '</table>';
    html += '<div class="e2foot"><b>CONNECTED LOAD PER PHASE —</b> A: ' + fmtVa(t.A) + ' VA · B: ' + fmtVa(t.B) + ' VA · TOTAL: ' + fmtVa(t.total) + ' VA (' + (t.total / 240).toFixed(1) + ' A @ 240V)</div>';
    html += '<div class="e2band">LOAD CALCULATION — NEC 220.83</div>';
    html += '<table class="e2"><tr><th style="text-align:left">LOAD DESCRIPTION</th><th style="width:90px">VA</th></tr>';
    p.loads.forEach(function (l) {
      html += '<tr><td>' + esc(l.desc) + (l.hvac ? ' <i>(HVAC @ 100%)</i>' : '') + '</td><td class="n">' + fmtVa(l.va || 0) + '</td></tr>';
    });
    html += '<tr><td><b>Subtotal (non-HVAC)</b></td><td class="n"><b>' + fmtVa(d.nonH) + '</b></td></tr>' +
      '<tr><td>First 8,000 VA @ 100%</td><td class="n">' + fmtVa(d.first) + '</td></tr>' +
      '<tr><td>Remainder @ 40% (NEC 220.83)</td><td class="n">' + fmtVa(d.rem * 0.4) + '</td></tr>' +
      '<tr><td>HVAC @ 100%</td><td class="n">' + fmtVa(d.hv) + '</td></tr>' +
      '<tr><td><b>CALCULATED DEMAND</b></td><td class="n"><b>' + fmtVa(d.demand) + ' VA</b></td></tr>' +
      '<tr><td><b>DEMAND CURRENT @ 240V, 1Ø</b></td><td class="n"><b>' + d.amps.toFixed(1) + ' A</b></td></tr></table>';

    var ps = $('#printSheet');
    ps.innerHTML = '<div class="sheetFrame"><div class="drawArea e2Area">' + html + '</div>' +
      titleBlockHtml('E-2', 'PANEL "' + p.name + '" SCHEDULE & LOAD CALCULATION') + '</div>';
    $('#panelModal').hidden = true;
    ps.hidden = false;
    window.print();
    setTimeout(function () { ps.hidden = true; }, 500);
  });

  /* ---------------- buscador de propiedad / lote ---------------- */
  var FL_COUNTIES = [
    ['Hillsborough (Tampa)', 'https://gis.hcpafl.org/propertysearch/', ['tampa', 'brandon', 'riverview', 'plant city', 'ruskin', 'lutz', 'valrico']],
    ['Pinellas (St. Pete / Clearwater)', 'https://www.pcpao.gov/quick-search', ['st. pete', 'st pete', 'petersburg', 'clearwater', 'largo', 'pinellas', 'dunedin', 'palm harbor', 'oldsmar']],
    ['Pasco', 'https://search.pascopa.com/', ['pasco', 'new port richey', 'wesley chapel', 'zephyrhills', 'land o lakes', 'hudson']],
    ['Hernando', 'https://www.hernandopa-fl.us/PAWebsite/', ['hernando', 'spring hill', 'brooksville']],
    ['Citrus (Inverness / Crystal River)', 'https://www.citruspa.org/', ['citrus', 'inverness', 'crystal river', 'homosassa', 'lecanto', 'beverly hills']],
    ['Sumter (The Villages)', 'https://www.sumterpa.com/', ['sumter', 'wildwood', 'the villages', 'bushnell', 'coleman']],
    ['Marion (Ocala)', 'https://www.pa.marion.fl.us/PropertySearch.aspx', ['ocala', 'marion', 'silver springs', 'belleview', 'dunnellon']],
    ['Lake (Leesburg / Clermont)', 'https://www.lakecopropappr.com/', ['leesburg', 'clermont', 'tavares', 'mount dora', 'eustis', 'lady lake']],
    ['Polk (Lakeland)', 'https://www.polkpa.org/', ['lakeland', 'polk', 'winter haven', 'davenport']],
    ['Osceola (Kissimmee / St. Cloud)', 'https://www.property-appraiser.org/', ['osceola', 'kissimmee', 'st. cloud', 'st cloud', 'saint cloud', 'poinciana']],
    ['Orange (Orlando)', 'https://ocpaweb.ocpafl.org/parcelsearch', ['orlando', 'orange county', 'winter garden', 'apopka', 'ocoee']],
    ['Seminole (Sanford)', 'https://www.scpafl.org/', ['sanford', 'altamonte', 'casselberry', 'oviedo', 'longwood', 'winter springs']],
    ['Volusia (Daytona / Deltona)', 'https://vcpa.vcgov.org/', ['daytona', 'deltona', 'deland', 'volusia', 'ormond']],
    ['Alachua (Gainesville)', 'https://www.acpafl.org/', ['gainesville', 'alachua']],
    ['Manatee (Bradenton)', 'https://www.manateepao.gov/search/', ['bradenton', 'manatee', 'palmetto']],
    ['Sarasota', 'https://www.sc-pa.com/propertysearch', ['sarasota', 'venice', 'north port']],
    ['Miami-Dade', 'https://www.miamidade.gov/Apps/PA/propertysearch/#/', ['miami', 'hialeah', 'doral', 'homestead']],
    ['Broward (Ft. Lauderdale)', 'https://web.bcpa.net/BcpaClient/#/Record-Search', ['fort lauderdale', 'ft lauderdale', 'broward', 'hollywood', 'pembroke']],
    ['Duval (Jacksonville)', 'https://paopropertysearch.coj.net/Basic/Search.aspx', ['jacksonville', 'duval']]
  ];
  function customCounties() {
    try { return JSON.parse(localStorage.getItem('mxp_counties') || '[]'); } catch (e) { return []; }
  }
  function saveCustomCounties(list) {
    try { localStorage.setItem('mxp_counties', JSON.stringify(list)); } catch (e) { }
  }
  function allCounties() { return FL_COUNTIES.concat(customCounties()); }
  function buildCountyOptions(keepValue) {
    var sel = $('#lotCounty');
    var prev = keepValue != null ? keepValue : sel.value;
    sel.innerHTML = '';
    allCounties().forEach(function (c, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = (i >= FL_COUNTIES.length ? '• ' : '') + c[0];
      sel.appendChild(o);
    });
    if (prev != null && prev !== '' && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
  }
  buildCountyOptions(0);
  function lotAutoCounty() {
    var a = ($('#lotAddr').value || '').toLowerCase();
    if (!a) return;
    var list = allCounties();
    for (var i = 0; i < list.length; i++) {
      var kws = list[i][2] || [];
      for (var k = 0; k < kws.length; k++) {
        if (kws[k] && a.indexOf(kws[k]) >= 0) { $('#lotCounty').value = i; return; }
      }
    }
  }
  function promptCounty(existing, done) {
    uiPrompt('Nombre del condado (ej: Lee (Fort Myers)):', existing ? existing[0] : '', function (name) {
      if (!name) { done(null); return; }
      uiPrompt('Link de la página del Property Appraiser (empieza con https://):', existing ? existing[1] : 'https://', function (url) {
        if (!url || !/^https?:\/\//i.test(url)) { uiAlert('El link debe empezar con https://'); done(null); return; }
        uiPrompt('Ciudades/palabras clave para detectarlo solo, separadas por coma (ej: fort myers, cape coral):',
          existing && existing[2] ? existing[2].join(', ') : '', function (kw) {
            var kws = (kw || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
            done([name, url, kws]);
          });
      });
    });
  }
  function copyAddr() {
    var a = $('#lotAddr').value || '';
    if (a && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(a).catch(function () {});
    }
  }
  function lotOpen(url) {
    try { window.open(url, '_blank'); } catch (e) { }
    // el visor puede bloquear la ventana: muestra el link con copiar como plan B
    var fb = $('#lotFallback');
    fb.hidden = false;
    $('#lotUrl').value = url;
    $('#lotUrlA').href = url;
    var inp = $('#lotUrl');
    inp.focus();
    inp.select();
  }
  $('#lotCopy').addEventListener('click', function () {
    var inp = $('#lotUrl');
    inp.focus();
    inp.select();
    inp.setSelectionRange(0, inp.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inp.value).then(function () {
        $('#lotCopy').textContent = '✔ Copiado';
        setTimeout(function () { $('#lotCopy').textContent = '📋 Copiar'; }, 1500);
      }).catch(function () {
        $('#lotCopy').textContent = ok ? '✔ Copiado' : '📋 Copiar';
        if (ok) setTimeout(function () { $('#lotCopy').textContent = '📋 Copiar'; }, 1500);
      });
    } else if (ok) {
      $('#lotCopy').textContent = '✔ Copiado';
      setTimeout(function () { $('#lotCopy').textContent = '📋 Copiar'; }, 1500);
    }
  });
  $('#btnLot').addEventListener('click', function () { $('#lotModal').hidden = false; $('#lotAddr').focus(); });
  $('#lotClose').addEventListener('click', function () { $('#lotModal').hidden = true; });
  $('#lotAddr').addEventListener('input', lotAutoCounty);
  $('#lotOpenPA').addEventListener('click', function () {
    copyAddr();
    var c = allCounties()[parseInt($('#lotCounty').value, 10) || 0];
    if (c) lotOpen(c[1]);
  });
  function countyDomain(url) {
    try {
      var h = new URL(url).hostname.replace(/^www\./, '');
      var parts = h.split('.');
      if (/\.fl\.us$/.test(h)) return parts.slice(-3).join('.');
      return parts.slice(-2).join('.');
    } catch (e) { return ''; }
  }
  $('#lotDirect').addEventListener('click', function () {
    var a = ($('#lotAddr').value || '').trim();
    if (!a) { uiAlert('Escribe primero la dirección o el folio.'); return; }
    var c = allCounties()[parseInt($('#lotCounty').value, 10) || 0];
    // folio de Hillsborough → deep link directo al parcel
    if (c && c[0].indexOf('Hillsborough') === 0 && /^[A-Za-z0-9.\-]+$/.test(a) && a.length >= 6) {
      lotOpen('https://gis.hcpafl.org/propertysearch/#/parcel/basic/' + encodeURIComponent(a.replace(/[.\-]/g, '')));
      return;
    }
    // sin comillas ni site: — la búsqueda amplia es la que encuentra el parcel
    var countyName = c ? c[0].split(' (')[0] : '';
    var q = a + ' ' + (countyName ? countyName + ' county ' : '') + 'property appraiser';
    lotOpen('https://www.google.com/search?q=' + encodeURIComponent(q));
  });
  $('#lotAddCounty').addEventListener('click', function () {
    promptCounty(null, function (c) {
      if (!c) return;
      var list = customCounties();
      list.push(c);
      saveCustomCounties(list);
      buildCountyOptions(FL_COUNTIES.length + list.length - 1);
    });
  });
  $('#lotEditCounty').addEventListener('click', function () {
    var i = parseInt($('#lotCounty').value, 10) || 0;
    if (i < FL_COUNTIES.length) {
      uiAlert('Los condados predeterminados no se editan — agrega uno propio con “+ Agregar” (los tuyos salen con •).');
      return;
    }
    var list = customCounties();
    promptCounty(list[i - FL_COUNTIES.length], function (c) {
      if (!c) return;
      list[i - FL_COUNTIES.length] = c;
      saveCustomCounties(list);
      buildCountyOptions(i);
    });
  });
  $('#lotDelCounty').addEventListener('click', function () {
    var i = parseInt($('#lotCounty').value, 10) || 0;
    if (i < FL_COUNTIES.length) {
      uiAlert('Los condados predeterminados no se borran — solo los tuyos (los que salen con •).');
      return;
    }
    var list = customCounties();
    uiConfirm('¿Borrar "' + list[i - FL_COUNTIES.length][0] + '"?', function (ok) {
      if (!ok) return;
      list.splice(i - FL_COUNTIES.length, 1);
      saveCustomCounties(list);
      buildCountyOptions(0);
    });
  });
  $('#lotGoogle').addEventListener('click', function () {
    var a = $('#lotAddr').value || '';
    lotOpen('https://www.google.com/search?q=' + encodeURIComponent(a + ' property appraiser parcel'));
  });
  $('#lotMaps').addEventListener('click', function () {
    var a = $('#lotAddr').value || '';
    lotOpen('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a));
  });
  $('#lotFema').addEventListener('click', function () {
    var a = $('#lotAddr').value || '';
    lotOpen('https://msc.fema.gov/portal/search?AddressQuery=' + encodeURIComponent(a));
  });

  /* ---------------- teclado ---------------- */
  document.addEventListener('keydown', function (ev) {
    var inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (inField) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') { copySel(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'v' && clipboard) { ev.preventDefault(); pasteClip(lastMouseWorld); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); copySel(); pasteClip(null, 24); return; }
    switch (ev.key) {
      case 'Escape':
        if (drawing) { drawing = null; G.prev.innerHTML = ''; }
        else if (tool === 'place') setTool('select');
        else { sel = null; selGroup = null; measure = null; renderSel(); renderAnnot(); showProps(); }
        break;
      case 'Delete': case 'Backspace':
        if (selGroup) { ev.preventDefault(); deleteGroup(); }
        else if (sel) { ev.preventDefault(); deleteSelected(); }
        break;
      case 'r': case 'R':
        if (tool === 'place') { placingRot = (placingRot + 45) % 360; }
        else if (sel && sel.kind === 'symbol') { var e = findSel(); pushUndo(); e.rot = ((e.rot || 0) + 45) % 360; refresh(); }
        break;
      case 'v': case 'V': setTool('select'); break;
      case 'h': case 'H': setTool('pan'); break;
      case 'w': case 'W': setTool('wall'); break;
      case 'd': case 'D': setTool('door'); break;
      case 'n': case 'N': setTool('window'); break;
      case 'm': case 'M': setTool('measure'); break;
      case 'c': case 'C': setTool('dim'); break;
      case 't': case 'T': setTool('text'); break;
      case 'k': case 'K': setTool('calibrate'); break;
      case 'Enter':
        if (drawing && drawing.mode === 'wallchain') finishWallChain();
        else if (drawing && drawing.mode === 'areachain') finishAreaChain();
        break;
      case 'a': case 'A': setTool('area'); break;
      case 'x': case 'X': setTool('wire'); break;
      case 'l': case 'L': setTool('leader'); break;
      case 'F8': ev.preventDefault(); setOrtho(!orthoOn); break;
    }
  });

  $$('#toolButtons .tool').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      setTool(b.dataset.tool);
      var dd = ev.target.closest && ev.target.closest('.dd');
      if (dd) showToolMenu(dd.dataset.menu, b);
    });
  });

  /* --- flyout: elegir tipo de pared / superficie desde el botón de la herramienta --- */
  function patternSwatch(k) {
    var p = AREA_PATTERNS[k];
    if (!p || !p.content) return '<svg width="36" height="20"><rect x="1" y="1" width="34" height="18" fill="none" stroke="#999" stroke-dasharray="3 2"/></svg>';
    var pid = 'tmpat_' + k;
    return '<svg width="36" height="20"><defs><pattern id="' + pid + '" width="' + p.w + '" height="' + p.h + '" patternUnits="userSpaceOnUse" patternTransform="scale(0.55)' + (p.rot ? ' rotate(' + p.rot + ')' : '') + '">' + p.content + '</pattern></defs>' +
      '<rect x="1" y="1" width="34" height="18" fill="url(#' + pid + ')" stroke="#8a8578" stroke-width="0.6"/></svg>';
  }
  function wallSwatch(k) {
    var wt = WALL_TYPES[k];
    var h = Math.max(3, Math.min(16, wt.t * 1.3));
    var y = (20 - h) / 2;
    var fill = k.indexOf('block') === 0
      ? '<defs><pattern id="tmw_' + k + '" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 L6,0" stroke="#8a8578" stroke-width="0.8" fill="none"/></pattern></defs><rect x="2" y="' + y + '" width="32" height="' + h + '" fill="url(#tmw_' + k + ')" stroke="#14161a" stroke-width="1.2"/>'
      : '<rect x="2" y="' + y + '" width="32" height="' + h + '" fill="#e8e6df" stroke="#14161a" stroke-width="1.2"/>';
    return '<svg width="36" height="20">' + fill + '</svg>';
  }
  // escalas estándar de plano (factor = pulgadas reales por pulgada de papel)
  var BG_SCALES = [
    [12, '1" = 1\'-0"'], [16, '3/4" = 1\'-0"'], [24, '1/2" = 1\'-0"'], [32, '3/8" = 1\'-0"'],
    [48, '1/4" = 1\'-0"'], [64, '3/16" = 1\'-0"'], [96, '1/8" = 1\'-0"'], [192, '1/16" = 1\'-0"'],
    [120, '1" = 10\''], [240, '1" = 20\''], [360, '1" = 30\''], [480, '1" = 40\''], [600, '1" = 50\'']
  ];
  var PAPER_SIZES = [
    ['8.5x11', 'Letter 8½ × 11'], ['11x17', 'Tabloid 11 × 17'], ['18x24', 'Arch C 18 × 24'],
    ['22x34', 'ANSI D 22 × 34'], ['24x36', 'Arch D 24 × 36'], ['30x42', 'Arch E1 30 × 42'], ['36x48', 'Arch E 36 × 48']
  ];
  var pendingBgScale = null;
  function bgScaleName(f) {
    for (var i = 0; i < BG_SCALES.length; i++) if (BG_SCALES[i][0] === f) return BG_SCALES[i][1];
    return '1:' + f;
  }
  function applyBgScale(f) {
    var b = state.bg; if (!b || !b.paperW) return;
    pushUndo();
    b.scaleFactor = f;
    b.w = b.paperW * f;
    b.h = b.paperH * f;
    renderBg(); zoomFit(); refresh();
    setHint('✔ Plano a escala ' + bgScaleName(f) + ' — ya puedes medir directo (M) sin calibrar.');
  }
  function showToolMenu(kind, anchor) {
    var tm = $('#toolMenu');
    var html = '';
    if (kind === 'wall') {
      html += '<div class="tmHead">Tipo de pared</div>';
      var cur = $('#wallType').value;
      Object.keys(WALL_TYPES).forEach(function (k) {
        html += '<div class="tmItem' + (k === cur ? ' cur' : '') + '" data-k="' + k + '">' + wallSwatch(k) + '<span>' + esc(WALL_TYPES[k].name) + '</span></div>';
      });
    } else if (kind === 'area') {
      html += '<div class="tmHead">Superficie / patrón</div>';
      Object.keys(AREA_PATTERNS).forEach(function (k) {
        html += '<div class="tmItem' + (k === curAreaPattern ? ' cur' : '') + '" data-k="' + k + '">' + patternSwatch(k) + '<span>' + esc(AREA_PATTERNS[k].name) + '</span></div>';
      });
    } else if (kind === 'door') {
      html += '<div class="tmHead">Tipo de puerta</div>';
      ['door', 'double', 'bifold', 'pocket', 'slider', 'opening'].forEach(function (k) {
        html += '<div class="tmItem' + (k === curDoorType ? ' cur' : '') + '" data-k="' + k + '"><span>' + esc(OPEN_NAMES[k]) + ' (' + fmtFtIn(OPEN_DEFAULT[k]) + ')</span></div>';
      });
    } else if (kind === 'window') {
      html += '<div class="tmHead">Tipo de ventana</div>';
      ['window', 'slider'].forEach(function (k) {
        html += '<div class="tmItem' + (k === curWinType ? ' cur' : '') + '" data-k="' + k + '"><span>' + esc(OPEN_NAMES[k]) + ' (' + fmtFtIn(OPEN_DEFAULT[k]) + ')</span></div>';
      });
    } else if (kind === 'measure') {
      html += '<div class="tmHead">Tipo de medición</div>';
      html += '<div class="tmItem" data-k="length"><span>📏 Length — distancia entre 2 puntos</span></div>';
      html += '<div class="tmItem" data-k="marea"><span>▦ Area — polígono con sq ft en el plano</span></div>';
      html += '<div class="tmItem" data-k="mperim"><span>⌐ Perimeter — longitud total de una línea</span></div>';
    } else if (kind === 'bgscale') {
      html += '<div class="tmHead">Escala escrita en el plano</div>';
      BG_SCALES.forEach(function (s) {
        html += '<div class="tmItem' + (state.bg && state.bg.scaleFactor === s[0] ? ' cur' : '') + '" data-k="' + s[0] + '"><span>' + esc(s[1]) + '</span></div>';
      });
    } else if (kind === 'bgpaper') {
      html += '<div class="tmHead">¿Tamaño de la hoja original?</div>';
      PAPER_SIZES.forEach(function (s) {
        html += '<div class="tmItem" data-k="' + s[0] + '"><span>' + esc(s[1]) + '</span></div>';
      });
    }
    tm.innerHTML = html;
    var r = anchor.getBoundingClientRect();
    tm.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 240)) + 'px';
    tm.style.top = (r.bottom + 4) + 'px';
    tm.hidden = false;
    $$('#toolMenu .tmItem').forEach(function (it) {
      it.addEventListener('click', function () {
        var k = it.dataset.k;
        if (kind === 'wall') {
          $('#wallType').value = k;
          setTool('wall');
          setHint('Pared: ' + WALL_TYPES[k].name + ' — haz clic para empezar a dibujar');
        } else if (kind === 'area') {
          curAreaPattern = k;
          setTool('area');
          setHint('Superficie: ' + AREA_PATTERNS[k].name + ' — marca los puntos del área (doble clic o Enter termina)');
        } else if (kind === 'door') {
          curDoorType = k;
          setTool('door');
          setHint(OPEN_NAMES[k] + ' — haz clic sobre una pared para colocarla');
        } else if (kind === 'window') {
          curWinType = k;
          setTool('window');
          setHint(OPEN_NAMES[k] + ' — haz clic sobre una pared para colocarla');
        } else if (kind === 'measure') {
          if (k === 'length') { setTool('measure'); }
          else if (k === 'marea') {
            setTool('area'); curAreaPattern = 'none'; pendingAreaLabel = true;
            setHint('MEDIR ÁREA: marca las esquinas del espacio (doble clic o Enter termina) — el sq ft queda escrito en el plano');
          } else {
            setTool('pline'); pendingAreaLabel = true;
            setHint('MEDIR PERÍMETRO: marca los puntos de la línea (doble clic o Enter termina) — la longitud total queda escrita en el plano');
          }
        } else if (kind === 'bgscale') {
          var f = parseFloat(k);
          if (state.bg.paperW) applyBgScale(f);
          else {
            // imagen/screenshot: no sabemos el tamaño de la hoja — se pregunta y luego se aplica
            pendingBgScale = f;
            tm.hidden = true;
            showToolMenu('bgpaper', anchor);
            return;
          }
        } else if (kind === 'bgpaper') {
          var dims = k.split('x').map(parseFloat);
          var b = state.bg;
          // orienta la hoja igual que la imagen (horizontal o vertical)
          var land = b.w >= b.h;
          b.paperW = land ? Math.max(dims[0], dims[1]) : Math.min(dims[0], dims[1]);
          b.paperH = land ? Math.min(dims[0], dims[1]) : Math.max(dims[0], dims[1]);
          if (pendingBgScale) applyBgScale(pendingBgScale);
          pendingBgScale = null;
        }
        tm.hidden = true;
      });
    });
  }
  document.addEventListener('pointerdown', function (ev) {
    var tm = $('#toolMenu');
    if (!tm.hidden && !tm.contains(ev.target) && !(ev.target.closest && ev.target.closest('.dd'))) tm.hidden = true;
  });

  /* ---------------- inicio ---------------- */
  window.__mxpRefresh = refresh;
  // logo oficial de Max Power en la barra (viene de js/logo.js)
  try {
    if (window.MAXPOWER_LOGO) {
      var bl = $('#brandLogo');
      if (bl) { bl.src = window.MAXPOWER_LOGO; bl.hidden = false; }
    }
  } catch (e) {}
  renderGrid();
  buildPalette();
  applyView();
  refresh();
  setTool('select');
  // restaurar el trabajo guardado automáticamente (si lo hay)
  var restored = false;
  try {
    var as = localStorage.getItem('mxp_autosave');
    if (as) {
      var ao = JSON.parse(as);
      if (ao && ao.app === 'mxp-planos' && ao.state) { restoreProject(ao); restored = true; }
    }
  } catch (e) {}
  renderSheetTabs();
  updateOvUI();
  setHint(restored
    ? '🔄 Tu trabajo se restauró automáticamente — todo se guarda solo mientras dibujas (💾 Guardar para tener el archivo)'
    : 'Bienvenido a MXP Planos — dibuja paredes (W), coloca símbolos desde la paleta, o importa un plano con "Fondo" y calíbralo (K)');
  // app instalable: registra el service worker cuando corre como sitio (GitHub Pages / servidor)
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  } catch (e) {}
})();
