/* =========================================================================
 * MXP Planos — motor de dibujo
 * Unidades del mundo: pulgadas reales. 1 unidad SVG = 1 pulgada.
 * ========================================================================= */
(function () {
  'use strict';

  // versión visible abajo a la derecha — para saber QUÉ build está corriendo
  // cuando se depura a distancia. Subirla en cada entrega.
  var APP_VERSION = 'v27.R';
  try { var _vt = document.getElementById('verTag'); if (_vt) _vt.textContent = APP_VERSION; } catch (e) {}

  // Si js/symbols.js no cargó (subida incompleta o cache a medias), la app no
  // debe morirse a mitad de un import: se avisa y se sigue sin paleta.
  if (!window.SYMBOLS || !window.SYMBOL_CATS) {
    window.SYMBOLS = window.SYMBOLS || {};
    window.SYMBOL_CATS = window.SYMBOL_CATS || {};
    setTimeout(function () {
      alert('Falta parte de la app (js/symbols.js no cargó).\n' +
        'La app abre igual pero sin símbolos. Recarga la página; si sigue, ' +
        'verifica que el sitio tenga TODOS los archivos (carpetas js y css completas).');
    }, 800);
  }

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
    // acepta TODO lo que la app misma escribe y lo que teclea un iPad:
    // 20' · 20'-6" · 32'-6 1/2" · 6 1/2" · 54" · 1.5 (pies) · comillas rizadas ’ ”
    if (s == null) return null;
    s = String(s).trim()
      .replace(/[’‘′]/g, "'").replace(/[“”″]/g, '"')
      .replace(/,/g, '.')
      .replace(/\bft\b/ig, "'").replace(/\bpies?\b/ig, "'")
      .replace(/\b(?:in|pulg(?:adas)?)\b/ig, '"');
    if (!s) return null;
    function num(t) {
      if (t == null) return 0;
      t = String(t).trim();
      if (!t) return 0;
      var fm = t.match(/^(?:(\d+(?:\.\d+)?)[\s-]+)?(\d+)\s*\/\s*(\d+)$/);
      if (fm) return (fm[1] ? parseFloat(fm[1]) : 0) + parseInt(fm[2], 10) / parseInt(fm[3], 10);
      if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
      return parseFloat(t);
    }
    var neg = /^-/.test(s) ? -1 : 1;
    s = s.replace(/^-\s*/, '');
    var m = s.match(/^([^'"]+)'\s*[-–]?\s*(?:([^'"]+)"?\s*)?$/);   // pies (+ pulgadas)
    if (m) {
      var f = num(m[1]), iv = m[2] !== undefined ? num(m[2]) : 0;
      if (f === null || iv === null) return null;
      return neg * (f * 12 + iv);
    }
    m = s.match(/^([^'"]+)"$/);                                     // solo pulgadas
    if (m) { var i2 = num(m[1]); return i2 === null ? null : neg * i2; }
    var nv = num(s);                                                // número pelado = pies
    return nv === null ? null : neg * nv * 12;
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
    blockdry: { name: '8" Block + Furring (forrado)', t: 8, dry: true },
    block12dry: { name: '12" Block + Furring (forrado)', t: 12, dry: true },
    furr15: { name: 'Furring 1½" (listón + gyp)', t: 1.5 },
    drywall25: { name: 'Drywall 2½" (furred)', t: 2.5 },
    drywall35: { name: 'Drywall 3½"', t: 3.5 },
    drywall: { name: 'Drywall 4½" (2x4 + gyp)', t: 4.5 },
    drywall6: { name: 'Drywall 6" (2x6)', t: 6 },
    // medias paredes (no llegan al techo): mostradores, barras, divisiones
    // bajas — se dibujan con la línea de centro discontinua y su altura
    pony30: { name: 'Half Wall 30" (media pared)', t: 4.5, pony: 30 },
    pony42: { name: 'Half Wall 42" (barra)', t: 4.5, pony: 42 },
    // malla del pool cage / lanai (plano de la cliente 08/29): línea fina
    // con palitos regulares = los postes de aluminio del screen enclosure
    screen: { name: 'Screen Enclosure / Malla 2"', t: 2, screen: true }
  };
  var OPEN_DEFAULT = { door: 36, double: 60, bifold: 48, pocket: 32, window: 36, slider: 72, bypass: 60, opening: 48, garage: 192 };
  var OPEN_NAMES = { door: 'Door', double: 'Double Door', bifold: 'Bifold Door', pocket: 'Pocket Door', window: 'Window', slider: 'Sliding Glass Door', bypass: 'Bypass Closet Door', opening: 'Opening', garage: 'Garage / OH Door' };

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
    water: { name: 'Water / Pool', w: 24, h: 12,
      content: '<path d="M0,4 Q3,1 6,4 T12,4 T18,4 T24,4"' + PAT_STROKE + '/><path d="M0,10 Q3,7 6,10 T12,10 T18,10 T24,10"' + PAT_STROKE + '/>' },
    pool: { name: '🏊 Pool — agua + borde (coping)', w: 24, h: 12, coping: 12,
      content: '<path d="M0,4 Q3,1 6,4 T12,4 T18,4 T24,4"' + PAT_STROKE + '/><path d="M0,10 Q3,7 6,10 T12,10 T18,10 T24,10"' + PAT_STROKE + '/>' },
    spa_agua: { name: '♨ Spa / Jacuzzi — agua + borde', w: 16, h: 8, coping: 8,
      content: '<path d="M0,3 Q2,1 4,3 T8,3 T12,3 T16,3"' + PAT_STROKE + '/><path d="M0,7 Q2,5 4,7 T8,7 T12,7 T16,7"' + PAT_STROKE + '/>' },
    pavers: { name: 'Pavers (running bond)', w: 32, h: 16,
      content: '<path d="M0,8 H32 M0,16 H32 M16,0 V8 M0,8 V16 M32,8 V16"' + PAT_STROKE + '/><path d="M8,8 V16 M24,8 V16"' + PAT_STROKE + '/>' },
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
    guia: [],      // {x1,y1,x2,y2} — contorno del survey: guía visual e imán, NO cuenta en nada
    huecos: [],    // {x,y} — donde Edgar BORRÓ pared a propósito: la soldadura no rellena ahí
    wires: [],     // {id,x1,y1,x2,y2,style,side,bulge}
    leaders: [],   // {id,tx,ty,x,y,text,size}
    bg: null,      // {url,x,y,w,h,opacity}
    bg2: null,     // overlay de comparación (plano rojo encima del azul)
    panels: [],    // panel schedules E-2
    precision: 4,  // fracción de pulgada para medidas (8=1/8")
    sheets: [{ no: '', title: '', data: null }],   // multi-hoja: cada hoja guarda su dibujo (sin nombre hasta que haya contenido)
    curSheet: 0,
    project: { name: '', client: '', address: '', job: '', sheetNo: '', sheetTitle: '', drawn: '' }
  };
  window.__mxpState = state;
  // ganchos SOLO para las pruebas automáticas (no los usa la app)
  window.__zf = function () { try { zoomFit(); } catch (e) {} };
  window.__viewZ = function () { return view.z; };
  window.__viewSet = function (z) { view.z = z; applyView(); };
  window.__marcoMinDbg = function () { return marcoMin(); };
  window.__mdDbg = function (t) { try { return mdMini(t); } catch (e) { return 'EXC ' + e.message; } };
  window.__aplicaCalceDbg = function (refs, c) { try { aplicarCalce(refs, c); } catch (e) { return 'EXC ' + e.message; } };
  window.__refreshDbg = function () { try { refresh(); } catch (e) {} };
  window.__joinsDbg = function () { try { return computeJoins(); } catch (e) { return 'EXC ' + e.message; } };
  window.__sheetDataDbg = function () { try { return sheetData(); } catch (e) { return '{}'; } };
  // prueba la función REAL de exportar, no una copia: lo que salga aquí es
  // literalmente lo que se convierte en el PNG y el PDF del inspector
  window.__exportSvgDbg = function () {
    try {
      var c = cleanSvgClone({ x: -100, y: -100, w: 800, h: 600 });
      return { html: c.outerHTML, guia: !!c.querySelector('#gGuia'),
               paredes: (c.querySelector('#gWalls') || {}).childElementCount || 0 };
    } catch (e) { return { err: e.message }; }
  };
  window.__loadSheetDbg = function (j) { try { loadSheetData(j); } catch (e) {} };
  window.__selGrupoDbg = function (g) { selGroup = g; sel = null; renderSel(); showProps(); };
  window.__encajaDbg = function () { try { encajarSel(); } catch (e) { return 'EXC ' + e.message; } };
  window.__resumenDbg = function () { try { return planoResumen(); } catch (e) { return 'EXC ' + e.message; } };
  window.__calceDbg = function (a, b, o) { try { return calcePropuesta(a, b, o); } catch (e) { return 'EXC ' + e.message; } };
  var view = { tx: 120, ty: 90, z: 1 };
  var measure = null;                 // medición transitoria
  var sel = null;                     // {kind,id}
  var selGroup = null;                // [{kind,id},…] selección múltiple (marquee)
  // cuadrícula de importación: dónde cae la próxima pieza de escaneo
  var gridX = 24, gridY = 24, gridRowH = 0;
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
      guia: state.guia,
      huecos: state.huecos,
      bgMeta: state.bg ? { x: state.bg.x, y: state.bg.y, w: state.bg.w, h: state.bg.h, opacity: state.bg.opacity } : null,
      bg2Meta: state.bg2 ? { x: state.bg2.x, y: state.bg2.y, w: state.bg2.w, h: state.bg2.h, opacity: state.bg2.opacity } : null
    });
  }
  function pushUndo(snap) {
    undoStack.push(snap || snapshot());
    // AUDITORÍA 08/28: 80 instantáneas × 51 KB (casa entera) = ~4 MB en
    // memoria. Se recorta por PESO, no por número: en planos chicos siguen
    // cabiendo muchas, y en uno grande no se dispara.
    var peso = 0;
    for (var i = undoStack.length - 1; i >= 0; i--) {
      peso += undoStack[i].length;
      if (peso > 6e6 || undoStack.length - i > 80) { undoStack.splice(0, i + 1); break; }
    }
    redoStack.length = 0;
    scheduleAutosave();
  }
  // guardado automático en el navegador: nada se pierde si se cierra la ventana
  var autosaveTimer = null;
  function scheduleAutosave() { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(doAutosave, 1500); }
  function doAutosave() {
    try {
      syncSheet();
      var payload = JSON.stringify({ app: 'mxp-planos', version: 1, state: state, view: view });
      // IndexedDB primero: localStorage se queda corto (~5MB) con varios planos
      // de fondo y fallaba en silencio — se perdían las medidas al salir
      idbSet('autosave', payload);
      try { localStorage.setItem('mxp_autosave', payload); }
      catch (e) { try { localStorage.removeItem('mxp_autosave'); } catch (e2) {} }
    } catch (e) {}
  }
  function idbKV(mode, cb) {
    try {
      var rq = indexedDB.open('mxp-planos', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () {
        var db = rq.result;
        try {
          var tx = db.transaction('kv', mode);
          cb(tx.objectStore('kv'));
          tx.oncomplete = function () { db.close(); };
        } catch (e) { db.close(); cb(null); }
      };
      rq.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function idbSet(k, v) { idbKV('readwrite', function (st) { if (st) try { st.put(v, k); } catch (e) {} }); }
  function idbGet(k, done) {
    var called = false;
    function fin(v) { if (!called) { called = true; done(v); } }
    idbKV('readonly', function (st) {
      if (!st) return fin(null);
      try {
        var g = st.get(k);
        g.onsuccess = function () { fin(g.result || null); };
        g.onerror = function () { fin(null); };
      } catch (e) { fin(null); }
    });
    // un PDF de 30MB en un iPad puede tardar varios segundos la primera vez
    setTimeout(function () { fin(null); }, 12000);
  }
  function applySnap(snap) {
    var o = JSON.parse(snap);
    state.walls = o.walls; state.openings = o.openings; state.symbols = o.symbols;
    state.texts = o.texts; state.dims = o.dims; state.areas = o.areas || [];
    state.wires = o.wires || []; state.leaders = o.leaders || [];
    state.panels = o.panels || [];
    state.guia = o.guia || [];
    state.huecos = o.huecos || [];
    if (state.bg && o.bgMeta) { state.bg.x = o.bgMeta.x; state.bg.y = o.bgMeta.y; state.bg.w = o.bgMeta.w; state.bg.h = o.bgMeta.h; state.bg.opacity = o.bgMeta.opacity; }
    if (state.bg2 && o.bg2Meta) { state.bg2.x = o.bg2Meta.x; state.bg2.y = o.bg2Meta.y; state.bg2.w = o.bg2Meta.w; state.bg2.h = o.bg2Meta.h; state.bg2.opacity = o.bg2Meta.opacity; }
    limpiaHuerfanas();      // aberturas cuya pared ya no existe
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
  // % de zoom al estilo Bluebeam: 100% = el PAPEL a tamaño real en pantalla
  // (96px por pulgada de papel). Solo se puede si el fondo sabe su tamaño de
  // hoja (PDF). Sin fondo, 100% = como antes (pulgadas reales de la obra).
  function zoomPct() {
    var bg = state.bg;
    if (bg && bg.paperW && bg.w) return Math.round(view.z * bg.w / bg.paperW / 96 * 100);
    return Math.round(view.z * 100);
  }
  function applyView() {
    G.world.setAttribute('transform', 'translate(' + view.tx + ' ' + view.ty + ') scale(' + view.z + ')');
    $('#zoomLabel').textContent = zoomPct() + '%';
    if (typeof scheduleHires === 'function') scheduleHires();
  }

  /* ---------------- snap ---------------- */
  // OSNAP: agarra extremos, puntos medios, centros de símbolos y vértices cercanos
  function osnapPt(p) {
    // el punto verde se VE desde lejos (es la referencia que pidió Edgar),
    // pero llevarte el punto es otra cosa: eso solo pasa si vas casi encima.
    // Antes agarraba en el mismo radio en que se veía y "no dejaba poner la
    // línea donde uno quiere" (08/30).
    var r = 12 / view.z, best = null;
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
    if (!sn) return { p: p, sn: null };
    if (!imanesOn) return { p: p, sn: sn };        // se ve la marca, no tira
    // SEÑALA SIEMPRE, LLEVA SOLO SI VAS A ÉL: la marca verde se dibuja en
    // cuanto hay un punto notable cerca, pero el cursor solo se pega cuando
    // estás prácticamente encima (4 px). Así la referencia ayuda sin mandar.
    var pega = sn.d <= 4 / view.z;
    return { p: pega ? [sn.x, sn.y] : p, sn: sn };
  }

  // FILLET al dibujar: la punta que se pasa del cruce se RECORTA y la que
  // se queda a una rendija se EXTIENDE — exacto al cruce de EJES con la
  // pared vecina. Solo se toca la pared NUEVA, nunca las existentes.
  // (De la foto de Edgar calcando el bano de Caroline: puntas asomadas
  // dentro del bloque y rendijas en la esquina.)
  // Dibujar drywall ENCIMA de un bloque no crea una pared duplicada — en la
  // obra eso es UNA pared: bloque con drywall por dentro (furring). El bloque
  // se convierte en '8" Block + Drywall' con la línea fina del lado dibujado.
  // (De la tercera foto de Edgar: dos paredes encimadas jamás sueldan.)
  function absorbeEnBloque(w) {
    var famA = w.type === 'screen' ? 'screen'
             : (String(w.type).indexOf('block') === 0 ? 'block' : 'drywall');
    if (famA !== 'drywall') return false;
    var L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (L < 12) return false;
    var ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
    var mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    for (var i = 0; i < state.walls.length; i++) {
      var h = state.walls[i];
      if (h.type !== 'block' && h.type !== 'blockdry') continue;
      var hL = Math.hypot(h.x2 - h.x1, h.y2 - h.y1);
      if (hL < 12) continue;
      var hx = (h.x2 - h.x1) / hL, hy = (h.y2 - h.y1) / hL;
      if (Math.abs(ux * hy - uy * hx) > 0.07) continue;          // no son paralelas (±4°)
      var r = distToSeg(mx, my, h.x1, h.y1, h.x2, h.y2);
      // solo si esta ENCIMADA de verdad (el eje del drywall dentro de la
      // banda del bloque + un pelo). El forro dibujado A RAS del bloque es
      // legitimo (asi ensena Edgar el furring) y se queda como pared propia.
      if (r.d > h.t / 2 + w.t / 2 - 1) continue;
      var t1 = (w.x1 - h.x1) * hx + (w.y1 - h.y1) * hy;
      var t2 = (w.x2 - h.x1) * hx + (w.y2 - h.y1) * hy;
      var lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(hL, Math.max(t1, t2));
      if (hi - lo < L * 0.6) continue;                            // no corre por encima de verdad
      // de que LADO del bloque quedo el forro. Si el drywall cayo calcado sobre
      // el EJE, este numero sale de la basura de coma flotante (1e-16) y el
      // signo se decide al azar: asi es como el drywall terminaba dibujado por
      // FUERA de la casa. Sin lado definido no se absorbe y se deja como pared.
      var perp = (mx - h.x1) * -hy + (my - h.y1) * hx, lado;
      if (Math.abs(perp) >= 0.5) {
        lado = perp > 0 ? 1 : -1;
      } else {
        // el forro cayó CALCADO sobre el eje del bloque: el lado no está
        // definido y el signo lo decidía la basura de coma flotante — así es
        // como el drywall terminaba dibujado por fuera de la casa. Se decide por
        // geometría: el lado que mira al centro del dibujo, que es el interior.
        var cx = 0, cy = 0, nC = 0;
        state.walls.forEach(function (q) { cx += (q.x1 + q.x2) / 2; cy += (q.y1 + q.y2) / 2; nC++; });
        if (!nC) continue;
        var pc = (cx / nC - h.x1) * -hy + (cy / nC - h.y1) * hx;
        if (Math.abs(pc) < 0.5) continue;      // ni así se puede decidir: mejor no absorber
        lado = pc > 0 ? 1 : -1;
      }
      h.type = 'blockdry'; h.drySide = lado;
      renderWalls();
      setHint('🧱 Ese bloque ya lleva su drywall: quedó como "8\" Block + Drywall" con la línea fina del lado que dibujaste — UNA pared, no dos encimadas (el lado se cambia en Propiedades)');
      return true;
    }
    return false;
  }

  function recortaPuntas(w, soloContra) {
    var TRIM = 8, EXT = 4;   // pulgadas: pasado hasta 8" se recorta, corto hasta 4" se alarga
    var tocada = false;
    ['s', 'e'].forEach(function (fin) {
      var P = fin === 's' ? [w.x1, w.y1] : [w.x2, w.y2];
      var O = fin === 's' ? [w.x2, w.y2] : [w.x1, w.y1];
      var L = Math.hypot(P[0] - O[0], P[1] - O[1]);
      if (L < 2) return;
      var ux = (P[0] - O[0]) / L, uy = (P[1] - O[1]) / L;
      // si la punta ya cayo en un extremo de otra pared (osnap), no se toca
      for (var i = 0; i < state.walls.length; i++) {
        var q = state.walls[i];
        if (q === w) continue;   // no cuenta encontrarse a si misma (pared ya en la hoja)
        if (Math.hypot(P[0] - q.x1, P[1] - q.y1) < 0.6 || Math.hypot(P[0] - q.x2, P[1] - q.y2) < 0.6) return;
      }
      // dos candidatos: el cruce con una pared de MI familia manda sobre el
      // cruce con otra (el drywall que forra un bloque cierra su esquina con
      // el OTRO drywall, no contra el bloque de al lado — foto de Edgar 08/29)
      var famW = String(w.type).indexOf('block') === 0 ? 'block'
               : (w.type === 'screen' ? 'screen' : 'drywall');
      var mejorMismo = null, mejorOtro = null;
      state.walls.forEach(function (h) {
        if (h === w || (soloContra && h !== soloContra)) return;
        var hL = Math.hypot(h.x2 - h.x1, h.y2 - h.y1);
        if (hL < 2) return;
        var hx = (h.x2 - h.x1) / hL, hy = (h.y2 - h.y1) / hL;
        var cr = ux * hy - uy * hx;
        if (Math.abs(cr) < 0.05) return;                     // casi paralelas
        // cruce de ejes: O + s*u  =  h1 + t*hdir
        var dx = h.x1 - O[0], dy = h.y1 - O[1];
        var sA = (dx * hy - dy * hx) / cr;
        var tH = (dx * uy - dy * ux) / cr;
        // el cruce vale dentro de la vecina Y hasta 8" mas alla de sus puntas
        // (asi se cierran las esquinas donde las dos paredes se quedan cortas)
        if (tH < -8 || tH > hL + 8) return;
        var famH = String(h.type).indexOf('block') === 0 ? 'block'
                 : (h.type === 'screen' ? 'screen' : 'drywall');
        // misma familia: la punta va al CRUCE DE EJES (esquina/tee continuo).
        // Otra familia: va a la CARA que enfrenta (el drywall muere contra la
        // cara del bloque, nunca enterrado hasta su centro)
        var sFin = sA;
        if (famH !== famW) sFin = sA - (h.t / 2) / Math.abs(cr);
        if (sFin < 6) return;                 // cruzaria en la otra punta
        // la ventana se mide SIEMPRE contra la meta real. Antes se filtraba
        // primero contra el eje y despues contra la cara, asi que contra una
        // pared de otra familia la mitad "corta" de la ventana se comia el
        // medio grosor del vecino: una division a 2" de la cara del bloque
        // nunca se estiraba y quedaba la rendija abierta.
        var delta = L - sFin;                 // >0 = pasada, <0 = corta
        if (delta > TRIM || delta < -EXT) return;
        var cand = { delta: delta, x: O[0] + ux * sFin, y: O[1] + uy * sFin,
                     h: h, tH: tH, hL: hL, mismo: famH === famW };
        if (famH === famW) {
          if (!mejorMismo || Math.abs(delta) < Math.abs(mejorMismo.delta)) mejorMismo = cand;
        } else {
          if (!mejorOtro || Math.abs(delta) < Math.abs(mejorOtro.delta)) mejorOtro = cand;
        }
      });
      var mejor = mejorMismo || mejorOtro;
      if (!mejor) {
        // A RAS: el forro que viaja pegado a otra pared (casi paralela, banda
        // con banda) termina alineado con la punta de esa vecina — la puntica
        // asomada por encima del bloque se recoge sola
        var ras = null;
        state.walls.forEach(function (h) {
          if (h === w || (soloContra && h !== soloContra)) return;
          var hL = Math.hypot(h.x2 - h.x1, h.y2 - h.y1);
          if (hL < 12) return;
          var hx = (h.x2 - h.x1) / hL, hy = (h.y2 - h.y1) / hL;
          if (Math.abs(ux * hy - uy * hx) > 0.07) return;      // solo casi paralelas
          var dLat = Math.abs((P[0] - h.x1) * hy - (P[1] - h.y1) * hx);
          if (dLat < h.t / 2 - 1 || dLat > h.t / 2 + w.t / 2 + 3) return;   // no viaja pegada
          var dirW = (ux * hx + uy * hy) >= 0 ? 1 : -1;
          var tP = (P[0] - h.x1) * hx + (P[1] - h.y1) * hy;
          var sobra = tP > hL ? tP - hL : (tP < 0 ? tP : 0);   // + pasada del fin, - pasada del inicio
          if (sobra === 0 || Math.abs(sobra) > 8) return;
          if (!ras || Math.abs(sobra) < Math.abs(ras.sobra)) ras = { sobra: sobra, dirW: dirW };
        });
        if (ras) {
          var rx = Math.round((P[0] - ux * ras.sobra * ras.dirW) * 64) / 64;
          var ry = Math.round((P[1] - uy * ras.sobra * ras.dirW) * 64) / 64;
          if (fin === 's') { w.x1 = rx; w.y1 = ry; } else { w.x2 = rx; w.y2 = ry; }
          tocada = true;
        }
        return;
      }
      var nx = Math.round(mejor.x * 64) / 64, ny = Math.round(mejor.y * 64) / 64;
      if (fin === 's') { w.x1 = nx; w.y1 = ny; } else { w.x2 = nx; w.y2 = ny; }
      tocada = true;
      // cerrar la esquina COMPLETA: si el cruce cae un palmo mas alla de la
      // punta de la vecina (misma familia), su punta tambien viene al cruce.
      // Eso es cerrar una esquina — jamas se corta una pared por el medio.
      if (mejor.mismo) {
        if (mejor.tH > mejor.hL - 0.01 && mejor.tH <= mejor.hL + 8) {
          mejor.h.x2 = nx; mejor.h.y2 = ny;
        } else if (mejor.tH < 0.01 && mejor.tH >= -8) {
          mejor.h.x1 = nx; mejor.h.y1 = ny;
        }
      }
    });
    return tocada;
  }

  // EL ORDEN DE DIBUJO NO DEBE IMPORTAR (Edgar, 08/30: "si hago primero la
  // de drywall y despues la de bloque, no se integra; al reves si"). El
  // fillet solo ajustaba la pared NUEVA, asi que una division ya dibujada se
  // quedaba enterrada o corta cuando el muro llegaba despues. Ahora, al
  // cerrar una pared, las puntas SUELTAS de las vecinas tambien se ajustan
  // contra ella — como hace un CAD.
  function ajustaVecinas(nueva) {
    var nL = Math.hypot(nueva.x2 - nueva.x1, nueva.y2 - nueva.y1);
    if (nL < 12) return 0;
    var cerca = nueva.t / 2 + 10, n = 0;
    state.walls.slice().forEach(function (e) {
      if (e === nueva) return;
      var toca = false;
      ['1', '2'].forEach(function (k) {
        var r = distToSeg(e['x' + k], e['y' + k], nueva.x1, nueva.y1, nueva.x2, nueva.y2);
        if (r.d < cerca) toca = true;
      });
      if (toca && recortaPuntas(e, nueva)) n++;
    });
    return n;
  }

  // EL DRYWALL DEL BLOQUE VA SIEMPRE PARA ADENTRO.
  // drySide es relativo al SENTIDO en que se dibujó (+1 = a la derecha del
  // avance), así que trazar el perímetro al revés dejaba TODO el drywall por
  // fuera de la casa — y las dos versiones se parecen tanto de un vistazo que
  // el error no se descubre hasta que se imprime el plano. Al cerrar el lazo se
  // orienta solo: se encadenan las paredes de bloque, se mira si la vuelta va
  // en sentido horario en pantalla y se manda la línea fina al interior.
  // Una pared que el usuario volteó a mano (dryManual) no se toca jamás.
  // soloMapa = true: no toca nada, sólo devuelve {idPared: ladoInterior} para
  // que el panel pueda decir si el drywall está adentro o AFUERA
  function orientaDrySide(soloMapa) {
    var mapa = {};
    var bl = state.walls.filter(function (w) { return String(w.type).indexOf('block') === 0; });
    if (bl.length < 3) return mapa;
    var usada = {};
    bl.forEach(function (w0) {
      if (usada[w0.id]) return;
      usada[w0.id] = 1;
      var cad = [{ w: w0, fw: true }];
      var ini = [w0.x1, w0.y1], fin = [w0.x2, w0.y2], sigue = true;
      while (sigue) {
        sigue = false;
        for (var i = 0; i < bl.length; i++) {
          var q = bl[i];
          if (usada[q.id]) continue;
          if (Math.hypot(q.x1 - fin[0], q.y1 - fin[1]) < 0.6) {
            usada[q.id] = 1; cad.push({ w: q, fw: true }); fin = [q.x2, q.y2]; sigue = true; break;
          }
          if (Math.hypot(q.x2 - fin[0], q.y2 - fin[1]) < 0.6) {
            usada[q.id] = 1; cad.push({ w: q, fw: false }); fin = [q.x1, q.y1]; sigue = true; break;
          }
        }
      }
      if (cad.length < 3) return;
      if (Math.hypot(fin[0] - ini[0], fin[1] - ini[1]) > 0.6) return;   // la vuelta no cierra
      var pts = cad.map(function (c) { return c.fw ? [c.w.x1, c.w.y1] : [c.w.x2, c.w.y2]; });
      var A = 0;
      for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        A += pts[b][0] * pts[a][1] - pts[a][0] * pts[b][1];
      }
      // con la Y hacia abajo, A>0 es una vuelta HORARIA en pantalla; y como la
      // normal (nx,ny) gira 90° horario respecto al avance, en ese caso el
      // interior queda del lado +1
      var dentro = A > 0 ? 1 : -1;
      cad.forEach(function (c) {
        mapa[c.w.id] = dentro * (c.fw ? 1 : -1);
        if (soloMapa) return;
        if (!WALL_TYPES[c.w.type] || !WALL_TYPES[c.w.type].dry) return;
        if (c.w.dryManual) return;
        c.w.drySide = mapa[c.w.id];
      });
    });
    return mapa;
  }

  /* GUÍAS DE ALINEACIÓN AL DIBUJAR (Edgar, 08/30, dos peticiones que son la
     misma familia):
       1) "que el cursor me marque donde la línea queda perpendicular a 90°
          sobre la otra, para evitar líneas en diagonal" → guía ÁMBAR.
       2) "estoy haciendo la línea de los gabinetes, en el medio está el
          refrigerador, y quiero que al otro lado me señale dónde debe
          empezar para que se vea uniforme" → guía VERDE: el cursor se alinea
          con las puntas de lo que ya está dibujado y con su prolongación.
     Las guías se dibujan mientras arrastras y el punto se imanta a ellas.
     Con SHIFT solo quedan las de 90° (perpendicular / recto), que es lo que
     Edgar pidió para no salirse en diagonal. */
  var guiasVivas = '';                     // el dibujo de las guías del momento
  var puntoGuiado = null;                  // dónde caería el PRIMER clic, ya guiado
  function puntasDeTodo() {
    var ps = [];
    state.walls.forEach(function (w) {
      ps.push([w.x1, w.y1, w]); ps.push([w.x2, w.y2, w]);
    });
    state.areas.forEach(function (a) {
      if (!a.pts) return;
      ps.push([a.pts[0][0], a.pts[0][1], a]);
      ps.push([a.pts[a.pts.length - 1][0], a.pts[a.pts.length - 1][1], a]);
    });
    state.symbols.forEach(function (sy) {
      var d = SYMBOLS[sy.key]; if (!d) return;
      var kk = symK(d), ex = d.w / 2 * (sy.scale || 1) * (sy.sx || 1) * kk;
      var ey = d.h / 2 * (sy.scale || 1) * (sy.sy || 1) * kk;
      // las cuatro caras del objeto: el borde del refrigerador es justo esto
      ps.push([sy.x - ex, sy.y - ey, sy]); ps.push([sy.x + ex, sy.y - ey, sy]);
      ps.push([sy.x - ex, sy.y + ey, sy]); ps.push([sy.x + ex, sy.y + ey, sy]);
    });
    return ps;
  }
  // ajusta el punto p a las guías; 'desde' es el punto de partida del trazo
  // eje: direccion [ux,uy] contra la que se mide el "recto" del SHIFT. Si no
  // viene, el recto es contra los ejes del papel (horizontal / vertical). En un
  // poligono viene la direccion del LADO ANTERIOR, y entonces SHIFT da esquinas
  // de 90 exactos aunque toda la figura este inclinada.
  function guiaAjusta(p, desde, ev, eje) {
    guiasVivas = '';
    if (ev && ev.altKey) return p;                 // Alt = a mano alzada, sin guías
    var soloRecto = !!(ev && ev.shiftKey);
    // 16 px de alcance (medido 08/30: con 8 px, a zoom 4x había que acertar a
    // menos de 1¾" y la guía no llegaba a aparecer — Edgar no la veía nunca).
    // Sigue yendo en píxeles, así que al acercarte exige más puntería.
    var TOL = 16 / (view.z || 1);
    var x = p[0], y = p[1], gs = [], refs = [], destinos = [];

    // (1) PERPENDICULAR / RECTO respecto al punto de partida — guía ámbar.
    // Con SHIFT se fuerza SIEMPRE (es lo que pediste al apretarlo, no una
    // sugerencia); sin Shift solo cuando el pulso ya viene casi recto.
    if (desde) {
      var dx = x - desde[0], dy = y - desde[1];
      if (soloRecto && eje) {
        // proyeccion sobre el eje o sobre su perpendicular: la que menos mueva
        var a1 = dx * eje[0] + dy * eje[1], b1 = -dx * eje[1] + dy * eje[0];
        if (Math.abs(b1) >= Math.abs(a1)) { x = desde[0] - eje[1] * b1; y = desde[1] + eje[0] * b1; }
        else { x = desde[0] + eje[0] * a1; y = desde[1] + eje[1] * a1; }
        x = +x.toFixed(2); y = +y.toFixed(2);
        gs.push({ x1: desde[0], y1: desde[1], x2: x, y2: y, c: '#e6a100' });
      } else if (soloRecto) {
        if (Math.abs(dx) >= Math.abs(dy)) y = desde[1]; else x = desde[0];
        gs.push({ x1: desde[0], y1: desde[1], x2: x, y2: y, c: '#e6a100' });
      } else if (Math.abs(dy) < TOL && Math.abs(dx) > TOL) {
        y = desde[1];
        gs.push({ x1: desde[0], y1: desde[1], x2: x, y2: y, c: '#e6a100' });
      } else if (Math.abs(dx) < TOL && Math.abs(dy) > TOL) {
        x = desde[0];
        gs.push({ x1: desde[0], y1: desde[1], x2: x, y2: y, c: '#e6a100' });
      }
    }
    // (2) ALINEACIÓN con las puntas y caras de lo ya dibujado — guía verde
    if (!soloRecto) {
      var pts = puntasDeTodo(), mejorX = null, mejorY = null;
      pts.forEach(function (q) {
        if (desde && Math.hypot(q[0] - desde[0], q[1] - desde[1]) < 0.6) return;
        var ddx = Math.abs(q[0] - x), ddy = Math.abs(q[1] - y);
        if (ddx < TOL && (!mejorX || ddx < mejorX.d)) mejorX = { d: ddx, q: q };
        if (ddy < TOL && (!mejorY || ddy < mejorY.d)) mejorY = { d: ddy, q: q };
      });
      // SOLO REFERENCIA (Edgar, 08/30: "quiero que me señales, no que me
      // obligues; a veces toma mal la referencia y la línea me queda mal").
      // La guía verde se DIBUJA para que veas dónde quedaría alineado, pero
      // el punto se queda donde tú lo pusiste. Manda tu mano, no el imán.
      if (mejorX) {
        gs.push({ x1: mejorX.q[0], y1: mejorX.q[1], x2: mejorX.q[0], y2: y, c: '#0a8f3c' });
        refs.push(mejorX.q);                       // de dónde viene la referencia
        destinos.push([mejorX.q[0], y]);           // dónde caería si la sigues
      }
      if (mejorY) {
        gs.push({ x1: mejorY.q[0], y1: mejorY.q[1], x2: x, y2: mejorY.q[1], c: '#0a8f3c' });
        refs.push(mejorY.q);
        destinos.push([x, mejorY.q[1]]);
      }
      // (3) PROLONGACIÓN: la línea de gabinete que sigue al otro lado del
      // refrigerador. Si el cursor cae cerca de la RECTA que prolonga un
      // tramo ya dibujado, se pega a ella aunque la punta quede lejos.
      if (!mejorX && !mejorY) {
        var mejorP = null;
        state.areas.forEach(function (a) {
          if (!a.pts || a.pts.length < 2) return;
          for (var t2 = 0; t2 + 1 < a.pts.length; t2++) {
            var A2 = a.pts[t2], B2 = a.pts[t2 + 1];
            var vx2 = B2[0] - A2[0], vy2 = B2[1] - A2[1];
            var L2 = Math.hypot(vx2, vy2);
            if (L2 < 6) continue;
            var ux2 = vx2 / L2, uy2 = vy2 / L2;
            var dPerp = Math.abs((x - A2[0]) * -uy2 + (y - A2[1]) * ux2);
            var along = (x - A2[0]) * ux2 + (y - A2[1]) * uy2;
            if (along > -6 && along < L2 + 6) continue;      // eso ya es la línea misma
            if (dPerp < TOL && (!mejorP || dPerp < mejorP.d)) {
              mejorP = { d: dPerp, A: A2, ux: ux2, uy: uy2, along: along };
            }
          }
        });
        if (mejorP) {
          var px2 = mejorP.A[0] + mejorP.ux * mejorP.along;
          var py2 = mejorP.A[1] + mejorP.uy * mejorP.along;
          gs.push({ x1: mejorP.A[0], y1: mejorP.A[1], x2: px2, y2: py2, c: '#0a8f3c' });
          refs.push([mejorP.A[0], mejorP.A[1]]);
          destinos.push([px2, py2]);
        }
      }
    }
    if (gs.length) {
      guiasVivas = gs.map(function (g) {
        return '<line x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 +
          '" stroke="' + g.c + '" stroke-width="' + (0.8 / (view.z || 1)) + '" stroke-dasharray="' +
          (6 / (view.z || 1)) + ' ' + (4 / (view.z || 1)) + '"/>';
      }).join('') +
      // el CUADRADO VERDE: marca de dónde sale la referencia (la punta del
      // gabinete al otro lado del refrigerador), y el círculo, dónde va a caer
      refs.map(function (q) {
        var rr2 = 3.5 / (view.z || 1);
        return '<rect x="' + (q[0] - rr2) + '" y="' + (q[1] - rr2) + '" width="' + (rr2 * 2) +
          '" height="' + (rr2 * 2) + '" fill="none" stroke="#0a8f3c" stroke-width="' +
          (1.4 / (view.z || 1)) + '"/>';
      }).join('') +
      // el círculo marca DÓNDE QUEDARÍA alineado — es la sugerencia, y tú
      // decides si vas ahí o no (con Shift sí manda, que eso es una orden)
      (soloRecto
        ? '<circle cx="' + x + '" cy="' + y + '" r="' + (4 / (view.z || 1)) + '" fill="none" stroke="#e6a100" stroke-width="' + (1.2 / (view.z || 1)) + '"/>'
        : destinos.map(function (q) {
            return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (4 / (view.z || 1)) +
              '" fill="none" stroke="#0a8f3c" stroke-width="' + (1.2 / (view.z || 1)) + '"/>';
          }).join(''));
    }
    return [x, y];
  }

  function snapWallPt(p) {
    // con los imanes apagados, el punto cae donde tocaste (solo se redondea a
    // la precisión elegida en el panel: ¼" por defecto)
    if (!imanesOn) {
      var gs0 = 1 / (state.precision || 4);
      return [Math.round(p[0] / gs0) * gs0, Math.round(p[1] / gs0) * gs0];
    }
    // 1) extremos y puntos medios de paredes existentes (las esquinas mandan)
    for (var i = 0; i < state.walls.length; i++) {
      var w = state.walls[i];
      if (Math.hypot(p[0] - w.x1, p[1] - w.y1) < 9 / view.z + 2) return [w.x1, w.y1];
      if (Math.hypot(p[0] - w.x2, p[1] - w.y2) < 9 / view.z + 2) return [w.x2, w.y2];
      // el PUNTO MEDIO de una pared es útil, pero agarraba con la misma fuerza
      // que una esquina y arrastraba el punto donde el usuario no lo quería
      // ("me obliga a ponerlo en el medio de la línea de una pared"). Ahora
      // pide casi tocarlo: la esquina sigue mandando, el medio solo si vas a él.
      var mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      if (Math.hypot(p[0] - mx, p[1] - my) < 4 / view.z) return [mx, my];
    }
    // 2) el EJE de una pared existente: al sobreescribir/calcar encima, el
    //    cursor agarra la línea de CENTRO y la pared nueva se inserta sobre
    //    ese mismo eje — exacto, que estamos hablando de medidas. La
    //    tolerancia encoge con el zoom: acércate y el imán afina.
    // el eje y la cara de una pared imantan MUY de cerca: son ayuda para
    // calcar encima, no para que la línea se te vaya sola (Edgar, 08/30)
    var eje = null;
    var tolEje = 4 / view.z;
    state.walls.forEach(function (w2) {
      var Lw2 = Math.hypot(w2.x2 - w2.x1, w2.y2 - w2.y1);
      if (Lw2 < 0.01) return;
      var r = distToSeg(p[0], p[1], w2.x1, w2.y1, w2.x2, w2.y2);
      if (r.d < tolEje && (!eje || r.d < eje.d)) eje = { d: r.d, w: w2, t: r.t, off: 0 };
      // IMÁN A LA CARA, no sólo al eje. La cara es la línea que el electricista
      // VE y sobre la que apunta al forrar un bloque. En un bloque de 8" la cara
      // queda a 4" del eje, dentro del alcance del imán del eje: el clic sobre
      // la cara se lo tragaba el eje y el mismo gesto daba un resultado distinto
      // en cada zoom (el forro desaparecía absorbido, o salía del lado de
      // afuera). Con las dos candidatas gana la más cercana, que es lo que el
      // usuario está mirando.
      var hm = (w2.t || 0) / 2;
      if (hm <= 0.75) return;                                  // pared fina: cara y eje son lo mismo
      var ux2 = (w2.x2 - w2.x1) / Lw2, uy2 = (w2.y2 - w2.y1) / Lw2;
      var alo = (p[0] - w2.x1) * ux2 + (p[1] - w2.y1) * uy2;
      if (alo < -tolEje || alo > Lw2 + tolEje) return;          // ni siquiera va a lo largo de esa pared
      var lat = (p[0] - w2.x1) * -uy2 + (p[1] - w2.y1) * ux2;
      var dCara = Math.abs(Math.abs(lat) - hm);
      if (dCara < tolEje && (!eje || dCara < eje.d)) {
        // el forro SE APOYA sobre la cara, no se clava en ella: su EJE va a
        // media pared más allá, así la cara terminada cae donde debe. Antes el
        // eje aterrizaba en la propia cara y un Furring de 1½" quedaba 0.75"
        // ENTERRADO en el bloque — se fundía con la línea de cara y no se veía
        // (auditoría 08/30). Solo cuando la nueva es más fina que la anfitriona.
        var tNva = 0;
        try { tNva = (WALL_TYPES[$('#wallType').value] || {}).t || 0; } catch (e9) {}
        var apoyo = hm + (tNva > 0 && tNva < (w2.t || 0) ? tNva / 2 : 0);
        eje = { d: dCara, w: w2, t: Math.max(0, Math.min(1, alo / Lw2)), off: (lat >= 0 ? 1 : -1) * apoyo };
      }
    });
    if (eje) {
      // la posición A LO LARGO del eje también se cuantiza a la precisión
      // elegida (y se matan las migajas de coma flotante del cursor): sobre
      // una pared en 100 el punto cae en 80.00, no en 79.99999
      var we = eje.w, Lw = Math.hypot(we.x2 - we.x1, we.y2 - we.y1);
      var gsE = 1 / (state.precision || 4);
      var aAlong = Math.max(0, Math.min(Lw, Math.round(eje.t * Lw / gsE) * gsE));
      var uxe = (we.x2 - we.x1) / Lw, uye = (we.y2 - we.y1) / Lw;
      var oX = -uye * (eje.off || 0), oY = uxe * (eje.off || 0);
      return [Math.round((we.x1 + uxe * aAlong + oX) * 64) / 64,
              Math.round((we.y1 + uye * aAlong + oY) * 64) / 64];
    }
    // 3) libre: se respeta la precisión elegida en el panel (1/4" por
    //    defecto) — antes había una rejilla fija de 6" que corría el punto
    //    hasta 3" de donde tocabas
    var gs = 1 / (state.precision || 4);
    return [Math.round(p[0] / gs) * gs, Math.round(p[1] / gs) * gs];
  }
  // 🐢 MODO FINO (Alt/Option apretado): la pieza se mueve MUCHO menos de lo
  // que corre el mouse y se apaga el imán de la rejilla — para cuadrar al
  // cuarto de pulgada sin que se vaya de un salto
  var FINO = 0.15;
  var calceOn = true;              // 🧲 imán entre piezas al armar el rompecabezas
  /* MARCO DE SELECCIÓN: cuánto hay que arrastrar para que cuente como marco.
     28/08 — Edgar: "siempre que selecciono una pared de pronto se me
     seleccionan varias cosas sin yo tocar". El umbral estaba en PULGADAS DE
     PLANO (4"), no en píxeles de pantalla. Alejado viendo la casa entera,
     4" son menos de UN píxel: cualquier temblor al hacer clic ya contaba
     como marco, y como los símbolos son un punto, se llevaba los que
     tuviera cerca. Ahora son píxeles de pantalla de verdad — 5 con ratón,
     10 con el dedo, que tiembla más. */
  function marcoMin() {
    return (document.body.classList.contains('touch') ? 10 : 5) / (view.z || 1);
  }
  // corre lo seleccionado sin tocar nada más (el calce lo usa al soltar)
  function moveRefs(refs, dx, dy) {
    dx = Math.round(dx); dy = Math.round(dy);
    if (!dx && !dy) return;
    refs.forEach(function (r) {
      var e = entityOf(r);
      if (!e) return;
      if (e.pts) e.pts = e.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
      else if (e.x1 != null) { e.x1 += dx; e.y1 += dy; e.x2 += dx; e.y2 += dy; }
      else if (e.x != null) { e.x += dx; e.y += dy; if (e.tx != null) { e.tx += dx; e.ty += dy; } }
    });
  }
  // deja lo seleccionado calzado contra las piezas ya puestas
  function aplicarCalce(refs, c) {
    if (!c) return;
    if (Math.abs(c.deg) > 0.01) rotateRefs(refs, c.deg, c.cx, c.cy);
    moveRefs(refs, c.dx, c.dy);
  }
  // las paredes que se mueven y las que se quedan quietas
  function partirParedes(refs) {
    var ids = {}, mv = [], fj = [];
    refs.forEach(function (r) { if (r.kind === 'wall') ids[r.id] = 1; });
    state.walls.forEach(function (w) { (ids[w.id] ? mv : fj).push(w); });
    // el contorno del survey también imanta (solo como pared fija)
    if (state.guia && state.guia.length) fj = fj.concat(guiaComoParedes());
    return { mv: mv, fj: fj };
  }
  function finoOn(ev) { return !!(ev && ev.altKey); }
  function finoPt(ev, start, ox, oy, p) {
    return [ox + (p[0] - start[0]) * FINO, oy + (p[1] - start[1]) * FINO];
  }
  // con Shift: bloquea a horizontal o vertical exacto desde el punto inicial
  // pixeles de pantalla -> pulgadas de mundo (misma tolerancia a cualquier zoom)
  function PX(px) {
    var TF = document.body.classList.contains('touch') ? 2.4 : 1;
    return (px * TF) / (view.z || 1);
  }
  function orthoLock(a, b) {
    return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
  }
  // SHIFT dentro de un poligono (Edgar, 08/30: "que el poligono me haga lados
  // perfectamente en 90 grados, no que queden vertical u horizontal, porque a
  // lo mejor el poligono queda en un plano inclinado"). El candado NO es
  // contra los ejes del papel: es contra EL LADO ANTERIOR. Asi un poligono
  // torcido 23 grados sigue teniendo todas sus esquinas en escuadra.
  function ejeLadoPrevio(pts) {
    if (!pts || pts.length < 2) return null;
    var A = pts[pts.length - 1], P = pts[pts.length - 2];
    var dx = A[0] - P[0], dy = A[1] - P[1], L = Math.hypot(dx, dy);
    return L < 1e-6 ? null : [dx / L, dy / L];
  }
  function orthoRel(pts, b) {
    var n = pts.length;
    var A = pts[n - 1];
    if (n < 2) return orthoLock(A, b);         // el primer lado no tiene contra que medirse
    var P = pts[n - 2];
    var dx = A[0] - P[0], dy = A[1] - P[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) return orthoLock(A, b);
    var ux = dx / L, uy = dy / L;
    var vx = b[0] - A[0], vy = b[1] - A[1];
    var a1 = vx * ux + vy * uy;                // cuanto avanza en la direccion del lado
    var b1 = -vx * uy + vy * ux;               // cuanto se va de lado (perpendicular)
    if (Math.abs(b1) >= Math.abs(a1)) return [+(A[0] - uy * b1).toFixed(2), +(A[1] + ux * b1).toFixed(2)];
    return [+(A[0] + ux * a1).toFixed(2), +(A[1] + uy * a1).toFixed(2)];
  }
  // DONDE TENDRIA QUE CAER UNA PUNTA para que su esquina mida 90 exactos.
  // Es la circunferencia de Tales: todo punto que ve el segmento A-B bajo un
  // angulo recto esta sobre el circulo que tiene A-B de diametro. Devuelve el
  // punto de ese circulo mas cercano al cursor, que es la correccion minima.
  function punto90(A, B, cur) {
    if (!A || !B) return null;
    var cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2;
    var R = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2;
    if (R < 0.5) return null;
    var vx = cur[0] - cx, vy = cur[1] - cy, L = Math.hypot(vx, vy);
    if (L < 1e-6) return null;
    return [+(cx + vx / L * R).toFixed(2), +(cy + vy / L * R).toFixed(2)];
  }
  function angEn(A, V, B) {
    var ax = A[0] - V[0], ay = A[1] - V[1], bx = B[0] - V[0], by = B[1] - V[1];
    var la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) return 0;
    var c = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    return Math.acos(c) * 180 / Math.PI;
  }
  // colores predeterminados para formas y líneas (funcionan en cualquier visor)
  var COLOR_PRESETS = [
    ['#14161a', 'Negro'], ['#c62828', 'Rojo'], ['#1c5fa8', 'Azul'], ['#2e7d32', 'Verde'],
    ['#f9a825', 'Amarillo'], ['#ef6c00', 'Naranja'], ['#6a1b9a', 'Morado'], ['#757575', 'Gris']
  ];

  // tipo activo de cada herramienta (se elige con la flechita ▾ del botón)
  var curAreaPattern = 'pavers';
  // TIPOS DE LÍNEA (Edgar, 08/30: "que me dé la opción de discontinua,
  // discontinua pequeña, recta y de varias formas"). Son los del plano de
  // verdad, cada uno con su significado en obra. El patrón va en pulgadas
  // reales, así que se ve igual de proporcionado a cualquier zoom.
  var LINE_STYLES = {
    solid:    { name: '——— Continua (lo que se ve)', dash: '' },
    dashed:   { name: '– – – Discontinua (oculto / sobre el techo)', dash: '7 4' },
    dashfina: { name: '- - - Discontinua corta (detalle oculto)', dash: '3 2.5' },
    dotted:   { name: '· · · Punteada (bajo el piso, tubería)', dash: '0.8 3' },
    centro:   { name: '—·—·— Eje (línea de centro)', dash: '12 3 1 3' },
    fantasma: { name: '—··—··— Fantasma (lote, lo que se quita)', dash: '14 3 1 3 1 3' },
    gruesa:   { name: '▬▬▬ Gruesa (contorno destacado)', dash: '', lw: 2.2 },
    cloud:    { name: '☁ Nube de revisión', dash: '' }
  };
  var curLineStyle = 'solid';
  // forma de la herramienta Rect: rectangulo o poligono regular (poly3, poly5...)
  var curShapeKind = 'rect';
  var curDoorType = 'door', curWinType = 'window', curDoorW = 0;   // 0 = ancho por defecto del tipo
  var pendingAreaLabel = false;   // la próxima área/polilínea muestra su medida en el plano

  // ORTHO 90°: como en AutoCAD (F8) — las líneas se mantienen rectas sin apretar Shift
  var orthoOn = false;
  function setOrtho(v) {
    orthoOn = v;
    $('#btnOrtho').classList.toggle('active', orthoOn);
    setHint(orthoOn ? 'ORTHO 90° activado — dibujar Y arrastrar sale siempre recto (F8 o el botón para apagarlo)' : 'ORTHO 90° apagado — con Shift apretado sigue saliendo recto');
  }
  $('#btnOrtho').addEventListener('click', function () { setOrtho(!orthoOn); });

  // 🧲 IMANES ON/OFF (Edgar, 08/30: "las líneas me siguen llevando a lo
  // automático y no me dejan ponerla donde yo quiero; yo solo quiero que los
  // puntos verdes sean de referencia"). Apagados, el punto cae EXACTAMENTE
  // donde tocas (redondeado a la precisión del panel) y las guías verdes y
  // las marcas de osnap se siguen viendo — pero no tiran de nada.
  var imanesOn = true;
  function setImanes(v) {
    imanesOn = v;
    var bt = $('#btnImanes');
    if (bt) bt.classList.toggle('active', imanesOn);
    setHint(imanesOn
      ? '🧲 Imanes ENCENDIDOS — el punto se pega a esquinas y ejes de lo ya dibujado'
      : '🧲 Imanes APAGADOS — la línea cae donde tú toques; las marcas verdes quedan solo de referencia');
  }
  var bImanes = $('#btnImanes');
  if (bImanes) bImanes.addEventListener('click', function () { setImanes(!imanesOn); });
  function wantOrtho(ev) { return orthoOn || (ev && ev.shiftKey); }
  // medir/cotas/calibrar: si la línea va CASI recta, se endereza sola (como
  // Bluebeam) — con ORTHO o Shift el candado es total
  function autoStraight(p, ev) {
    if (!(drawing && drawing.mode === 'twopoint')) return p;
    if (wantOrtho(ev)) return orthoLock(drawing.a, p);
    if (drawing.kind === 'measure' || drawing.kind === 'dim' || drawing.kind === 'calibrate') {
      return orthoSnap(drawing.a, p);
    }
    return p;
  }
  function orthoSnap(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var ang = Math.atan2(dy, dx);
    var step = Math.PI / 4;
    var snapAng = Math.round(ang / step) * step;
    if (Math.abs(ang - snapAng) < (10 * Math.PI / 180)) {
      // el largo es la PROYECCIÓN sobre la dirección ya elegida, cuantizada a la
      // precisión del panel: con la hipotenusa cruda salían medidas sucias
      // (236.0339) y las cotas se caían del cuarto de pulgada
      var gsO = 1 / (state.precision || 4);
      var len = Math.round((dx * Math.cos(snapAng) + dy * Math.sin(snapAng)) / gsO) * gsO;
      return [a[0] + Math.cos(snapAng) * len, a[1] + Math.sin(snapAng) * len];
    }
    return b;
  }

  /* ---------------- render: paredes ---------------- */
  // CORTES PRESTADOS. Una puerta pertenece a UNA pared, pero en la obra el vano
  // atraviesa también el forro que va pegado a esa pared. Cuando el bloque y su
  // furring son dos paredes distintas, la banda del forro cruzaba el vano de
  // punta a punta: el plano decía que había drywall construido por delante de
  // la puerta. Aquí se toman prestados los vanos de la pared pegada y paralela
  // SOLO para partir el cuerpo; los símbolos (hoja, arco, conteo) siguen siendo
  // los propios, así que no se duplican.
  function wallCortes(w) {
    var g = wallGeom(w);
    var out = wallOpenings(w).map(function (o) { return { pos: o.pos, w: o.w }; });
    if (!state.openings.length) return out;
    var esBl = String(w.type).indexOf('block') === 0;
    state.walls.forEach(function (h) {
      if (h.id === w.id) return;
      // sólo entre mampostería y su forro: dos tabiques espalda con espalda de
      // un chase son paredes de verdad distintas y no se cortan entre sí
      if (!esBl && String(h.type).indexOf('block') !== 0) return;
      var hg = wallGeom(h);
      if (Math.abs(g.ux * hg.uy - g.uy * hg.ux) > 0.07) return;      // no son paralelas (±4°)
      var sep = Math.abs((h.x1 - w.x1) * g.nx + (h.y1 - w.y1) * g.ny);
      if (sep > w.t / 2 + h.t / 2 + 1) return;                       // no están pegadas cara con cara
      wallOpenings(h).forEach(function (o) {
        var P = ptAlong(h, hg, o.pos);
        var d = (P[0] - w.x1) * g.ux + (P[1] - w.y1) * g.uy;         // proyectado a MI eje
        if (d > -o.w && d < g.len + o.w) out.push({ pos: d, w: o.w });
      });
    });
    return out.sort(function (a, b) { return a.pos - b.pos; });
  }

  function wallSegs(w) {
    var g = wallGeom(w), ops = wallCortes(w), segs = [], d = 0, i;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i], d0 = Math.max(0, o.pos - o.w / 2), d1 = Math.min(g.len, o.pos + o.w / 2);
      if (d0 > d) segs.push([d, d0]);
      d = Math.max(d, d1);
    }
    if (d < g.len - 0.01) segs.push([d, g.len]);
    // ops = SÓLO los míos: los prestados parten el cuerpo pero no vuelven a
    // dibujar hoja ni arco de barrido (si no, salen puertas fantasma dobles)
    return { g: g, segs: segs, ops: wallOpenings(w) };
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
      // plus/minus: huecos de la CARA. dryPlus/dryMinus: huecos de la línea fina
      // de furring, que se interrumpe aunque la rama sea de otro material
      cuts[w.id] = { plus: [], minus: [], dryPlus: [], dryMinus: [] };
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

    // familia de material y su peso: en la obra la mampostería manda.
    // block/block12/blockdry son una familia y sueldan entre sí aunque cambie
    // el grosor; los drywall igual. En esquinas mixtas, el material pesado
    // conserva su esquina cuadrada y el liviano se recorta contra su cara.
    function famDe(ty) {
      if (ty === 'screen') return 'screen';
      return String(ty).indexOf('block') === 0 ? 'block' : 'drywall';
    }
    var PESO = { block: 3, drywall: 2, screen: 1 };

    // lo que hay que saber de la pared VECINA en un punto de inglete
    function infoVecina(nb, esP) {
      var wt = WALL_TYPES[nb.e.w.type] || {};
      return {
        u: [nb.ux, nb.uy],
        bloque: String(nb.e.w.type).indexOf('block') === 0,
        furr: !!wt.dry && (((nb.e.w.drySide || 1) > 0) === esP)
      };
    }

    // ¿las dos puntas se encuentran EN ÁNGULO? (si van casi en la misma línea
    // no hay esquina que ingletear: es un empalme a tope)
    function enAngulo(a, b) {
      var ga = wallGeom(a.w), gb = wallGeom(b.w);
      return Math.abs(ga.ux * gb.uy - ga.uy * gb.ux) >= 0.05;
    }

    // nodos donde coinciden extremos de dos o más paredes.
    // Con TRES o más puntas se sueldan con inglete las de la MISMA FAMILIA:
    // una pared de drywall que llega a una esquina de bloque ya ocupada se
    // recorta contra la cara del bloque (más abajo, como unión en T).
    // Con DOS puntas es una ESQUINA en L de verdad y se ingletea SIEMPRE,
    // aunque cambien material y grosor: separadas por familia cada grupo
    // quedaba con k=1, las dos caían a la unión en T, y el liviano conservaba
    // su medio espesor a los dos lados del eje del pesado — asomaba por fuera
    // de la tapa y su boca se quedaba sin línea porque la cara del pesado ya
    // se había acabado ahí.
    function miterNode(nd) {
      if (!nd.ends || nd.ends.length < 2) return;
      var byType = {};
      if (nd.ends.length === 2 && enAngulo(nd.ends[0], nd.ends[1])) {
        byType.L = nd.ends;
      } else {
        nd.ends.forEach(function (e) { var f = famDe(e.w.type); (byType[f] = byType[f] || []).push(e); });
      }
      Object.keys(byType).forEach(function (ty) {
        var grp = byType[ty];
        var k = grp.length;
        if (k < 2) return;   // extremo suelto de otro material: lo resuelve la unión en T
        // si el nodo cae sobre el CUERPO de una pared de familia más pesada que
        // no es del grupo, no hay esquina que ingletear: cada rama muere contra
        // la cara de la mampostería (lo resuelve la unión en T de más abajo).
        // Sin esto, dos tabiques que arrancan del mismo punto sobre un bloque se
        // sueldan ENTRE ELLOS, pintan su relleno encima del rayado y disparan
        // una punta de lanza que atraviesa el bloque y asoma al otro lado.
        var pesoGrp = 0;
        grp.forEach(function (e) { pesoGrp = Math.max(pesoGrp, PESO[famDe(e.w.type)]); });
        var pesado = false;
        if (pesoGrp < 3) state.walls.forEach(function (h) {   // 3 = bloque: nada pesa más
          if (pesado) return;
          if (PESO[famDe(h.type)] <= pesoGrp) return;
          for (var gi = 0; gi < grp.length; gi++) if (grp[gi].w.id === h.id) return;
          var hg2 = wallGeom(h);
          // mismo criterio que la unión en T: una pared PARALELA no sirve de
          // anfitrión para recortar, y si la dejáramos entrar aquí romperíamos
          // ingletes buenos convirtiéndolos en punta abierta
          var util = false;
          grp.forEach(function (e) {
            var wg2 = wallGeom(e.w);
            if (Math.abs(wg2.ux * hg2.uy - wg2.uy * hg2.ux) >= 0.05) util = true;
          });
          if (!util) return;
          if (distToSeg(nd.x, nd.y, h.x1, h.y1, h.x2, h.y2).d <= h.t / 2 + 0.75) pesado = true;
        });
        if (pesado) return;
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
          var nxt = ends[(m + 1) % k], prv = ends[(m - 1 + k) % k];
          var qCCW = Q[m], qCW = Q[(m - 1 + k) % k];
          // mit: esta unión es una ESQUINA a inglete (no un tee) — la línea de
          // furring la necesita para doblar la esquina en vez de pasarse.
          // pu/mu: hacia dónde sale la pared VECINA en cada punto de inglete. El
          // pico lo comparten dos paredes distintas, así que ningún trazo de una
          // sola las puede unir; con esto el render pinta la cuña que le falta.
          // Q[m] lo comparte con nxt (y es el punto 'p' de nxt sólo si nxt NO
          // arranca ahí); Q[m-1] lo comparte con prv (y es su 'p' sólo si prv sí
          // arranca ahí). Se guarda de la vecina lo que el render necesita: por
          // dónde sale, qué material es, y si SU línea de furring pasa por ese
          // mismo pico (si no pasa, la cuña de furring quedaría colgando en el
          // aire — la pared vecina de drywall no lleva línea fina ninguna).
          var iNxt = infoVecina(nxt, !nxt.e.atStart);
          var iPrv = infoVecina(prv, prv.e.atStart);
          var jo = a.e.atStart
            ? { p: qCCW, m: qCW, cap: false, mit: true, pu: iNxt, mu: iPrv }
            : { p: qCW, m: qCCW, cap: false, mit: true, pu: iPrv, mu: iNxt };
          // ¿esta punta ATRAVIESA el nodo? (hay otra igual saliendo justo al
          // revés). Entonces no es una esquina: la pared SIGUE DE LARGO y su
          // boca en el nodo es PLANA. Con el inglete los rellenos de las dos
          // mitades formaban un moño y dejaban una mella triangular de fondo
          // justo en el cruce — la T de tabique más común del plano. pf/mf las
          // usa SÓLO el relleno; las líneas se quedan en el inglete, que ahí sí
          // es lo correcto (la cara se abre para dejar pasar la rama).
          var pasa = false;
          for (var m2 = 0; m2 < k; m2++) {
            if (m2 === m || Math.abs(a.t - ends[m2].t) > 0.01) continue;
            if (a.ux * ends[m2].ux + a.uy * ends[m2].uy < -0.999) pasa = true;
          }
          if (pasa) {
            var gA = wallGeom(a.e.w);
            jo.pf = [nd.x + gA.nx * a.t / 2, nd.y + gA.ny * a.t / 2];
            jo.mf = [nd.x - gA.nx * a.t / 2, nd.y - gA.ny * a.t / 2];
          }
          setJoin(a.e.w, a.e.atStart, jo);
        }
      });
    }
    nodes.forEach(miterNode);

    // ESQUINA DESALINEADA: dos puntas libres que no llegaron a compartir nodo
    // (se pasaron o se quedaron cortas más de TOL=1") pero que siguen dentro
    // del grosor una de la otra. Físicamente las paredes se solapan, así que la
    // esquina se suelda igual. El vértice es el CRUCE DE LOS EJES, no el punto
    // medio: así el inglete sale limpio en vez del cuadrado hueco que quedaba.
    var libres = [];
    state.walls.forEach(function (w) {
      if (!joins[w.id].s) libres.push({ w: w, atStart: true, P: [w.x1, w.y1] });
      if (!joins[w.id].e) libres.push({ w: w, atStart: false, P: [w.x2, w.y2] });
    });
    for (var i1 = 0; i1 < libres.length; i1++) {
      for (var j1 = i1 + 1; j1 < libres.length; j1++) {
        var A = libres[i1], B = libres[j1];
        if (A.w.id === B.w.id) continue;
        if (joins[A.w.id][A.atStart ? 's' : 'e'] || joins[B.w.id][B.atStart ? 's' : 'e']) continue;
        // el alcance es exactamente la ventana que hoy se rompe: más lejos que
        // esto las dos paredes de verdad no se tocan y cada una lleva su tapa
        var lim = Math.max(A.w.t, B.w.t) / 2 + 0.75;
        if (Math.hypot(A.P[0] - B.P[0], A.P[1] - B.P[1]) > lim) continue;
        var ga = wallGeom(A.w), gb = wallGeom(B.w);
        var cr = ga.ux * gb.uy - ga.uy * gb.ux;
        if (Math.abs(cr) < 0.05) continue;                      // casi paralelas: no hay esquina
        var ddx = B.P[0] - A.P[0], ddy = B.P[1] - A.P[1];
        var sA = (ddx * gb.uy - ddy * gb.ux) / cr;
        var V = [A.P[0] + sA * ga.ux, A.P[1] + sA * ga.uy];      // cruce de los EJES
        if (Math.hypot(V[0] - A.P[0], V[1] - A.P[1]) > 1.5 * lim) continue;
        if (Math.hypot(V[0] - B.P[0], V[1] - B.P[1]) > 1.5 * lim) continue;
        miterNode({ x: V[0], y: V[1], ends: [{ w: A.w, atStart: A.atStart }, { w: B.w, atStart: B.atStart }] });
      }
    }

    // uniones en T: extremo libre que cae sobre el cuerpo de otra pared
    state.walls.forEach(function (w) {
      ['s', 'e'].forEach(function (endKey) {
        if (joins[w.id][endKey]) return;
        var atStart = endKey === 's';
        var P = atStart ? [w.x1, w.y1] : [w.x2, w.y2];
        var other = atStart ? [w.x2, w.y2] : [w.x1, w.y1];
        var wg = wallGeom(w);
        var host = null, hr = null, hostL = null, hrL = null;
        state.walls.forEach(function (h) {
          if (h.id === w.id) return;
          var hg2 = wallGeom(h);
          if (Math.abs(wg.ux * hg2.uy - wg.uy * hg2.ux) < 0.05) return;   // casi paralelas: no hay cara contra la cual recortar
          var r = distToSeg(P[0], P[1], h.x1, h.y1, h.x2, h.y2);
          var d = r.t * hg2.len;
          if (r.d > h.t / 2 + 0.75) return;
          // el material pesado no se recorta contra el liviano si tiene otro
          // anfitrión de su peso: un bloque conserva su esquina cuadrada y es el
          // drywall el que se recorta contra él. Pero si NO hay otro anfitrión,
          // mejor que muera en la cara del tabique que dejarlo enterrado hasta
          // el eje, con su tapa negra flotando dentro del relleno del tabique.
          if (PESO[famDe(h.type)] < PESO[famDe(w.type)]) {
            if (!hostL || r.d < hrL.dist) { hostL = h; hrL = { d: d, dist: r.d }; }
            return;
          }
          if (!host || r.d < hr.dist) { host = h; hr = { d: d, dist: r.d }; }
        });
        if (!host && hostL) { host = hostL; hr = hrL; }
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
        var Ep = edgeHit(1), Em = edgeHit(-1);
        // ¿la boca de la rama queda TAPADA por la línea de cara del anfitrión?
        // Esa cara sólo existe entre 0 y hg.len: si la boca se sale de ese tramo
        // (la rama muere contra la PUNTA del host, no contra su cuerpo) no hay
        // nada que la cierre y el relleno se queda al aire. Entonces la tapa la
        // dibujamos nosotros.
        var dP = (Ep[0] - host.x1) * hg.ux + (Ep[1] - host.y1) * hg.uy;
        var dM = (Em[0] - host.x1) * hg.ux + (Em[1] - host.y1) * hg.uy;
        var tapada = Math.min(dP, dM) >= -0.01 && Math.max(dP, dM) <= hg.len + 0.01;
        var mismaFam = famDe(host.type) === famDe(w.type);
        // y si el que muere es el PESADO contra un liviano, cierra con SU línea
        // gruesa: la línea fina del tabique no alcanza a tapar una boca de 8"
        var pesadoEnLiviano = PESO[famDe(host.type)] < PESO[famDe(w.type)];
        setJoin(w, atStart, { p: Ep, m: Em, cap: !tapada || pesadoEnLiviano });
        // misma familia: se abre la cara del host para que la unión sea continua
        // (drywall que tee en bloque NO la abre: la cara de mampostería sigue)
        if (mismaFam && tapada) {
          (sside > 0 ? cuts[host.id].plus : cuts[host.id].minus).push([hr.d - w.t / 2, hr.d + w.t / 2]);
        }
        // la línea fina del furring SÍ se abre siempre: el yeso se interrumpe
        // aunque la rama sea de otro material. Si no, la raya cruza por delante
        // del tabique y que se vea o no depende del orden de dibujo.
        if (tapada) {
          (sside > 0 ? cuts[host.id].dryPlus : cuts[host.id].dryMinus).push([hr.d - w.t / 2, hr.d + w.t / 2]);
        }
      });
    });

    state.walls.forEach(function (w) {
      if (!joins[w.id].s) joins[w.id].s = plainEnd(w, true);
      if (!joins[w.id].e) joins[w.id].e = plainEnd(w, false);
    });
    return { joins: joins, cuts: cuts };
  }

  function edgeLines(w, g, t, sg, sign, sPt, ePt, cutList, cls) {
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
      s += '<line class="' + (cls || 'wall-edge') + '" x1="' + P1[0] + '" y1="' + P1[1] + '" x2="' + P2[0] + '" y2="' + P2[1] + '"/>';
    });
    return s;
  }

  // CUÑA DE INGLETE. El pico de una esquina lo comparten DOS paredes distintas,
  // así que ningún trazo de una sola pared puede cerrarlo: la línea de una cara
  // moría a tope en el vértice y la de la otra arrancaba ahí mismo, dejando
  // mordido un cuadradito de fondo justo en la punta (y un diente en los
  // quiebres de 45°). Estas dos patitas caen EXACTAMENTE encima de las líneas de
  // cara que ya se dibujan; lo único que aportan es el inglete que rellena el
  // pico. Se pinta dos veces por esquina, una por pared: es la misma tinta.
  // stroke-miterlimit alto porque en las puntas agudas el límite por defecto
  // (4) recortaría el inglete y volvería a dejar el escalón.
  function cunaMiter(cls, Q, uOwn, uNb, d) {
    if (!Q || !uNb) return '';
    return '<path class="' + cls + '" fill="none" stroke-linejoin="miter" stroke-miterlimit="20" d="M' +
      (Q[0] + uOwn[0] * d) + ',' + (Q[1] + uOwn[1] * d) + ' L' + Q[0] + ',' + Q[1] +
      ' L' + (Q[0] + uNb[0] * d) + ',' + (Q[1] + uNb[1] * d) + '"/>';
  }
  function cunasDe(g, J, atStart, esBloque, Qp, Qm, d) {
    if (!J || !J.mit) return '';
    var uO = [atStart ? g.ux : -g.ux, atStart ? g.uy : -g.uy];
    // la patita se apoya encima de la cara de la VECINA: si una de las dos es
    // liviana se usa el trazo fino, para no engordarle la línea al tabique
    function cl(nb) { return (esBloque && nb && nb.bloque) ? 'wall-edge' : 'wall-edge dry'; }
    return cunaMiter(cl(J.pu), Qp, uO, J.pu && J.pu.u, d) +
           cunaMiter(cl(J.mu), Qm, uO, J.mu && J.mu.u, d);
  }

  // OPACIDAD POR OBJETO (Edgar, 08/30: "que podamos editar el objeto y
  // hacerlo mas transparente o menos, como el control del fondo pero por
  // cosa"). Sirve para dejar atenuado lo que es de referencia — el mobiliario
  // del cliente, un circuito viejo, una fase futura — sin borrarlo.
  // e.op va de 0 a 100; sin campo = 100 (opaco de toda la vida).
  function opAttr(e) {
    var o = (e && e.op != null) ? Number(e.op) : 100;
    if (!isFinite(o) || o >= 100) return '';
    return ' opacity="' + Math.max(0.03, o / 100) + '"';
  }

  function renderWalls() {
    var jc = computeJoins();
    var out = '';
    // RAYADO DE MAMPOSTERÍA QUE SIGUE A LA PARED (Edgar, 08/30: "el dibujo
    // siempre va en la misma diagonal y cuando la pared va en esa misma
    // dirección no se ve bien"). El patrón estaba clavado a 45° del mundo, así
    // que en una pared a 45° — la bahía del primary — las líneas corrían
    // PARALELAS a la pared y el bloque se veía vacío. Ahora cada dirección de
    // pared tiene su patrón, girado para que el rayado quede siempre a 45°
    // RESPECTO A LA PARED, que es como se dibuja la mampostería en un plano.
    var hatchUsados = {};
    function hatchDe(w2) {
      var a = Math.atan2(w2.y2 - w2.y1, w2.x2 - w2.x1) * 180 / Math.PI;
      a = ((a % 180) + 180) % 180;                 // una pared y su opuesta son igual
      var k = Math.round(a / 5) * 5; if (k >= 180) k -= 180;
      hatchUsados[k] = 1;
      return 'hb' + k;
    }
    // EL ORDEN DE DIBUJO NO DEBE CAMBIAR EL PLANO. Antes se pintaba en el orden
    // en que el usuario dibujó, así que la misma escena salía bien o rota según
    // quién quedara encima. Se pinta por peso de material — primero lo liviano,
    // la mampostería al final — para que ningún relleno de tabique pueda
    // borrarle el rayado ni las líneas de cara a un muro de bloque.
    var pesoDib = { screen: 1, drywall: 2, block: 3 };
    var ordenDib = state.walls.map(function (w, i) { return { w: w, i: i }; });
    ordenDib.sort(function (a, b) {
      var fa = a.w.type === 'screen' ? 'screen' : (String(a.w.type).indexOf('block') === 0 ? 'block' : 'drywall');
      var fb = b.w.type === 'screen' ? 'screen' : (String(b.w.type).indexOf('block') === 0 ? 'block' : 'drywall');
      return (pesoDib[fa] - pesoDib[fb]) || (a.i - b.i);
    });
    ordenDib.forEach(function (od) {
      var w = od.w;
      var out0 = out;                     // marca para poder envolver esta pared
      var info = wallSegs(w), g = info.g, t = w.t / 2;
      var J = jc.joins[w.id], cut = jc.cuts[w.id];
      var esBloque = String(w.type).indexOf('block') === 0;
      var fillCls = esBloque ? 'wall-fill-block' : 'wall-fill-drywall';
      var fillSty = esBloque ? ' style="fill:url(#' + hatchDe(w) + ')"' : '';
      var ecls = esBloque ? 'wall-edge' : 'wall-edge dry';   // el plano profesional: mamposteria gruesa, division liviana
      var dCuna = Math.min(Math.max(0.8, w.t / 4), g.len / 3);
      info.segs.forEach(function (sg) {
        var atS = sg[0] < 0.01, atE = sg[1] > g.len - 0.01;
        var aP = atS ? J.s.p : offPt(w, g, sg[0], 1, t);
        var aM = atS ? J.s.m : offPt(w, g, sg[0], -1, t);
        var bP = atE ? J.e.p : offPt(w, g, sg[1], 1, t);
        var bM = atE ? J.e.m : offPt(w, g, sg[1], -1, t);
        // el relleno usa la boca PLANA cuando la pared atraviesa el nodo (pf/mf)
        var fP1 = atS ? (J.s.pf || aP) : aP, fM1 = atS ? (J.s.mf || aM) : aM;
        var fP2 = atE ? (J.e.pf || bP) : bP, fM2 = atE ? (J.e.mf || bM) : bM;
        out += '<path class="' + fillCls + '"' + fillSty + ' d="M' + fP1 + ' L' + fP2 + ' L' + fM2 + ' L' + fM1 + ' Z"/>';
        var capS = atS ? J.s.cap : true, capE = atE ? J.e.cap : true;
        // el contorno del REMATE va en UN SOLO trazo con inglete: cuatro <line>
        // sueltas dejaban las cuatro esquinas de la punta mordidas (a cada pico
        // le faltaba medio grosor de línea). Con cortes de por medio hay que
        // seguir partiendo cara por cara.
        if (!cut.plus.length && !cut.minus.length && (capS || capE)) {
          var dd = capS && capE ? 'M' + aP + ' L' + bP + ' L' + bM + ' L' + aM + ' Z'
                 : capE ? 'M' + aP + ' L' + bP + ' L' + bM + ' L' + aM
                        : 'M' + bM + ' L' + aM + ' L' + aP + ' L' + bP;
          out += '<path class="' + ecls + '" fill="none" stroke-linejoin="miter" stroke-miterlimit="20" d="' + dd + '"/>';
        } else {
          out += edgeLines(w, g, t, sg, 1, aP, bP, cut.plus, ecls);
          out += edgeLines(w, g, t, sg, -1, aM, bM, cut.minus, ecls);
          if (capS) out += '<line class="' + ecls + '" x1="' + aP[0] + '" y1="' + aP[1] + '" x2="' + aM[0] + '" y2="' + aM[1] + '"/>';
          if (capE) out += '<line class="' + ecls + '" x1="' + bP[0] + '" y1="' + bP[1] + '" x2="' + bM[0] + '" y2="' + bM[1] + '"/>';
        }
        if (atS) out += cunasDe(g, J.s, true, esBloque, aP, aM, dCuna);
        if (atE) out += cunasDe(g, J.e, false, esBloque, bP, bM, dCuna);
      });
      // media pared: línea de centro discontinua = no llega al techo.
      // Arranca DONDE ARRANCA EL CUERPO (la cara de la pared anfitriona o el
      // inglete), no en el eje crudo: si no, la raya se entierra en la
      // mampostería del vecino y queda un guioncito suelto en medio del rayado.
      if (WALL_TYPES[w.type] && WALL_TYPES[w.type].pony) {
        // hasta dónde llega el cuerpo, medido a lo largo del eje: el medio de la
        // boca de la unión (en una T, la cara del anfitrión; en un extremo
        // suelto, la punta misma)
        var dMed = function (Jx) {
          return ((Jx.p[0] + Jx.m[0]) / 2 - w.x1) * g.ux + ((Jx.p[1] + Jx.m[1]) / 2 - w.y1) * g.uy;
        };
        // y en una esquina a inglete contra MAMPOSTERÍA se para antes: en la
        // CARA del bloque. El cruce de ejes cae medio muro adentro y el
        // guioncito se lee como mugre encima del rayado.
        var topeBloque = function (Jx, esIni) {
          if (!Jx.mit) return null;
          var best = null;
          [['p', 'pu'], ['m', 'mu']].forEach(function (kk) {
            var nb = Jx[kk[1]];
            if (!nb || !nb.bloque) return;
            var Q = Jx[kk[0]];
            var cr2 = g.ux * nb.u[1] - g.uy * nb.u[0];
            if (Math.abs(cr2) < 1e-6) return;
            var s2 = ((Q[0] - w.x1) * nb.u[1] - (Q[1] - w.y1) * nb.u[0]) / cr2;
            if (best === null || (esIni ? s2 > best : s2 < best)) best = s2;
          });
          return best;
        };
        var dIni = dMed(J.s), dFin = dMed(J.e);
        var tb0 = topeBloque(J.s, true); if (tb0 != null) dIni = Math.max(dIni, tb0);
        var tb1 = topeBloque(J.e, false); if (tb1 != null) dFin = Math.min(dFin, tb1);
        info.segs.forEach(function (sg) {
          var a0 = sg[0] < 0.01 ? dIni : sg[0];
          var a1 = sg[1] > g.len - 0.01 ? dFin : sg[1];
          if (a1 - a0 < 0.01) return;
          var C1 = ptAlong(w, g, a0), C2 = ptAlong(w, g, a1);
          out += '<line class="furr-line" stroke-dasharray="5 4" x1="' + C1[0] + '" y1="' + C1[1] + '" x2="' + C2[0] + '" y2="' + C2[1] + '"/>';
        });
      }
      // screen enclosure: palitos perpendiculares cada 24" (los postes de
      // aluminio del pool cage, como en el plano de la cliente)
      if (WALL_TYPES[w.type] && WALL_TYPES[w.type].screen) {
        info.segs.forEach(function (sg) {
          for (var dTick = sg[0] + 12; dTick < sg[1] - 2; dTick += 24) {
            var Tp = offPt(w, g, dTick, 1, t + 1.5), Tm = offPt(w, g, dTick, -1, t + 1.5);
            out += '<line class="screen-tick" x1="' + Tp[0] + '" y1="' + Tp[1] + '" x2="' + Tm[0] + '" y2="' + Tm[1] + '"/>';
          }
        });
      }
      // línea fina de drywall al frente del bloque (furring).
      // ENTRELAZA EN LAS ESQUINAS igual que el bloque (Edgar, 08/30: "no
      // entrelazan el furry, solo la parte de bloque"): antes se dibujaba de
      // punta a punta y en cada esquina las dos líneas se cruzaban sacando
      // bigotes. El punto de inglete del cuerpo (Q), prolongado desde el
      // extremo por offD/t, es EXACTAMENTE donde se encuentran las dos
      // líneas de furring — misma bisectriz, otro radio.
      if (WALL_TYPES[w.type] && WALL_TYPES[w.type].dry) {
        var sideD = w.drySide || 1, offD = t + 1.5, kF = offD / t;
        var cutF = sideD > 0 ? cut.dryPlus : cut.dryMinus;
        // dónde queda la unión medida a lo largo del eje (el medio de la boca)
        var dJoin = function (Jx) {
          return ((Jx.p[0] + Jx.m[0]) / 2 - w.x1) * g.ux + ((Jx.p[1] + Jx.m[1]) / 2 - w.y1) * g.uy;
        };
        // dónde muere la raya en la esquina: si la vecina también lleva
        // furring, las dos rayas se encuentran en la prolongación del inglete;
        // si no lleva (un tabique, un bloque pelado), el yeso topa contra la
        // CARA de esa vecina y ahí se acaba
        var finFurr = function (Jx, nb, A) {
          if (!nb || nb.furr) return null;
          var Q = sideD > 0 ? Jx.p : Jx.m;
          var cr2 = g.ux * nb.u[1] - g.uy * nb.u[0];
          if (Math.abs(cr2) < 1e-6) return null;
          var s2 = ((Q[0] - A[0]) * nb.u[1] - (Q[1] - A[1]) * nb.u[0]) / cr2;
          return [A[0] + s2 * g.ux, A[1] + s2 * g.uy];
        };
        info.segs.forEach(function (sg) {
          var atSf = sg[0] < 0.01, atEf = sg[1] > g.len - 0.01;
          // en una T la raya arranca en la unión, no en el extremo crudo (si no
          // saca un bigote que se mete en el rayado del vecino)
          var d0 = (atSf && !J.s.mit) ? Math.max(sg[0], dJoin(J.s)) : sg[0];
          var d1 = (atEf && !J.e.mit) ? Math.min(sg[1], dJoin(J.e)) : sg[1];
          if (d1 - d0 < 0.01) return;
          var P1 = offPt(w, g, d0, sideD, offD), P2 = offPt(w, g, d1, sideD, offD);
          // la cuña de la raya de furring SÓLO si la vecina también trae su raya
          // por ese mismo pico (contra un tabique de drywall no hay nada que
          // enlazar y quedaría un palito colgando en el aire)
          var nbS = atSf && J.s.mit ? (sideD > 0 ? J.s.pu : J.s.mu) : null;
          var nbE = atEf && J.e.mit ? (sideD > 0 ? J.e.pu : J.e.mu) : null;
          if (atSf && J.s.mit) {
            var Qs = sideD > 0 ? J.s.p : J.s.m;
            P1 = finFurr(J.s, nbS, P1) ||
                 [w.x1 + (Qs[0] - w.x1) * kF, w.y1 + (Qs[1] - w.y1) * kF];
          }
          if (atEf && J.e.mit) {
            var Qe = sideD > 0 ? J.e.p : J.e.m;
            P2 = finFurr(J.e, nbE, P2) ||
                 [w.x2 + (Qe[0] - w.x2) * kF, w.y2 + (Qe[1] - w.y2) * kF];
          }
          // se dibuja con edgeLines para que SE ABRA en el ancho de los tabiques
          // que mueren en ella: antes cruzaba por encima y que se viera o no
          // dependía del orden en que se hubieran dibujado las paredes
          out += edgeLines(w, g, offD, [d0, d1], sideD, P1, P2, cutF, 'furr-line');
          if (nbS && nbS.furr) out += cunaMiter('furr-line', P1, [g.ux, g.uy], nbS.u, dCuna);
          if (nbE && nbE.furr) out += cunaMiter('furr-line', P2, [-g.ux, -g.uy], nbE.u, dCuna);
        });
      }
      info.ops.forEach(function (o) { out += renderOpening(w, g, o); });
      // opacidad de ESTA pared (con sus aberturas): se envuelve lo que acaba
      // de dibujarse, sin tocar el resto del plano
      var opW = opAttr(w);
      if (opW) { out = out0 + '<g' + opW + '>' + out.slice(out0.length) + '</g>'; }
    });
    // los patrones de rayado que hicieron falta, uno por dirección de pared
    var defs = '';
    Object.keys(hatchUsados).forEach(function (k) {
      defs += '<pattern id="hb' + k + '" width="6" height="6" patternUnits="userSpaceOnUse"' +
        ' patternTransform="rotate(' + (Number(k) + 45) + ')">' +
        '<rect width="6" height="6" fill="#efede6"/>' +
        '<line x1="0" y1="0" x2="0" y2="6" stroke="#8f8b7e" stroke-width="0.8"/></pattern>';
    });
    G.walls.innerHTML = (defs ? '<defs>' + defs + '</defs>' : '') + out;
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
      // puerta corredera de CRISTAL (plano de la cliente 08/29): cada hoja
      // es un panel fino con su línea de vidrio, solapados en el encuentro.
      // Dos hojas hasta 9 ft; a partir de ahí, tres (las grandes del lanai).
      var nP = o.w >= 108 ? 3 : 2, lp = o.w / nP;
      var TH = Math.min(1, t * 0.45);                        // media-anchura del panel
      var paso = t - TH;                                     // hojas a ras de cara: nunca fuera de la pared
      for (var ip = 0; ip < nP; ip++) {
        var da = d0 + ip * lp - (ip > 0 ? 3 : 0);           // 3" de solape
        var db = d0 + (ip + 1) * lp + (ip < nP - 1 ? 3 : 0);
        var offP = (nP === 2 ? (ip === 0 ? 1 : -1) : (ip - 1)) * paso;
        var Pa = ptAlong(w, g, da), Pb = ptAlong(w, g, db);
        var c1x = Pa[0] + g.nx * (offP + TH), c1y = Pa[1] + g.ny * (offP + TH);
        var c2x = Pb[0] + g.nx * (offP + TH), c2y = Pb[1] + g.ny * (offP + TH);
        var c3x = Pb[0] + g.nx * (offP - TH), c3y = Pb[1] + g.ny * (offP - TH);
        var c4x = Pa[0] + g.nx * (offP - TH), c4y = Pa[1] + g.ny * (offP - TH);
        s += '<path class="sgd-panel" d="M' + c1x + ',' + c1y + ' L' + c2x + ',' + c2y +
          ' L' + c3x + ',' + c3y + ' L' + c4x + ',' + c4y + ' Z"/>';
        s += '<line class="win-line" x1="' + (Pa[0] + g.nx * offP) + '" y1="' + (Pa[1] + g.ny * offP) +
          '" x2="' + (Pb[0] + g.nx * offP) + '" y2="' + (Pb[1] + g.ny * offP) + '"/>';
      }
    } else if (o.type === 'bypass') {
      // puertas de closet que se deslizan una tras otra (bypass): dos hojas
      // sólidas solapadas 3", sin vidrio — como en el plano de la cliente
      var TB = Math.min(0.9, t * 0.4), pasoB = t - TB, lb = o.w / 2;
      for (var ib = 0; ib < 2; ib++) {
        var dba = d0 + ib * lb - (ib > 0 ? 3 : 0);
        var dbb = d0 + (ib + 1) * lb + (ib < 1 ? 3 : 0);
        var offB = (ib === 0 ? 1 : -1) * pasoB;
        var Ba = ptAlong(w, g, dba), Bb = ptAlong(w, g, dbb);
        s += '<path class="sgd-panel" d="M' + (Ba[0] + g.nx * (offB + TB)) + ',' + (Ba[1] + g.ny * (offB + TB)) +
          ' L' + (Bb[0] + g.nx * (offB + TB)) + ',' + (Bb[1] + g.ny * (offB + TB)) +
          ' L' + (Bb[0] + g.nx * (offB - TB)) + ',' + (Bb[1] + g.ny * (offB - TB)) +
          ' L' + (Ba[0] + g.nx * (offB - TB)) + ',' + (Ba[1] + g.ny * (offB - TB)) + ' Z"/>';
      }
    } else if (o.type === 'opening') {
      s += '<line class="door-arc" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '"/>';
    } else if (o.type === 'garage') {
      // portón overhead: panel sólido EN la pared (la pared se ve completa)
      // + riel discontinuo hacia adentro, como en los planos de verdad
      var swg = o.swing || 1;
      s += '<line class="door-leaf" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '" stroke-width="2.5"/>';
      var offg = (t + 7) * swg;
      var gA = [A[0] + g.ux * 4 + g.nx * offg, A[1] + g.uy * 4 + g.ny * offg];
      var gB = [B[0] - g.ux * 4 + g.nx * offg, B[1] - g.uy * 4 + g.ny * offg];
      s += '<line class="door-arc" stroke-dasharray="6 4" x1="' + gA[0] + '" y1="' + gA[1] + '" x2="' + gB[0] + '" y2="' + gB[1] + '"/>';
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
      // BIFOLD (acordeon de closet). Se dibuja como en el plano de la
      // cliente: cada juego de dos hojas plegadas hace un PICO hacia adentro
      // del cuarto. Una puerta angosta (pantry, hasta 3 ft) lleva UN pico;
      // una de closet de cuarto lleva DOS, uno por cada lado — el simbolo
      // que se lee de un vistazo y no se confunde con una hoja normal.
      var swb = o.swing || 1;
      var juegos = o.w > 40 ? 2 : 1;
      var lj = o.w / juegos;                  // ancho de cada juego de dos hojas
      // el pico entra POCO al cuarto: con media hoja (lj/2) un bifold de 6 ft
      // metia 18" y se comia el espacio (Edgar, 08/30). Tope de 9": se lee
      // igual de claro y deja el cuarto libre, mida lo que mida la puerta.
      var alt = Math.min(lj / 2, 9);
      for (var jb = 0; jb < juegos; jb++) {
        var da = d0 + jb * lj, db2 = da + lj;
        var Pa = ptAlong(w, g, da), Pb2 = ptAlong(w, g, db2);
        var Pico = ptAlong(w, g, da + lj / 2);
        var px = Pico[0] + g.nx * swb * alt, py = Pico[1] + g.ny * swb * alt;
        s += '<path class="door-leaf" d="M' + Pa[0] + ',' + Pa[1] + ' L' + px + ',' + py +
          ' L' + Pb2[0] + ',' + Pb2[1] + '" fill="none"/>';
        // la linea de riel discontinua, dentro del vano
        s += '<line class="door-arc" x1="' + Pa[0] + '" y1="' + Pa[1] + '" x2="' + Pb2[0] + '" y2="' + Pb2[1] + '"/>';
      }
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
  // BORDE DE PISCINA (coping): el mismo poligono desplazado hacia ADENTRO
  // la distancia d. Se cruzan las aristas ya desplazadas, que es como se
  // saca un offset de verdad — no vale con encoger hacia el centro porque
  // en una piscina en L el borde quedaria despegado de un lado.
  function offsetPolyIn(pts, d) {
    var n = pts.length;
    if (n < 3 || !(d > 0)) return null;
    // sentido del poligono: si el area con signo es negativa, la normal se invierte
    var a2 = 0;
    for (var i0 = 0; i0 < n; i0++) {
      var q1 = pts[i0], q2 = pts[(i0 + 1) % n];
      a2 += q1[0] * q2[1] - q2[0] * q1[1];
    }
    var sg = a2 >= 0 ? 1 : -1;
    var L = [];
    for (var i = 0; i < n; i++) {
      var A = pts[i], B = pts[(i + 1) % n];
      var dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
      if (len < 1e-6) return null;
      var nx = (dy / len) * sg * -1, ny = (-dx / len) * sg * -1;   // normal hacia adentro
      L.push([A[0] + nx * d, A[1] + ny * d, B[0] + nx * d, B[1] + ny * d]);
    }
    var out = [];
    for (var k = 0; k < n; k++) {
      var e1 = L[(k - 1 + n) % n], e2 = L[k];
      var r1x = e1[2] - e1[0], r1y = e1[3] - e1[1];
      var r2x = e2[2] - e2[0], r2y = e2[3] - e2[1];
      var den = r1x * r2y - r1y * r2x;
      if (Math.abs(den) < 1e-9) { out.push([e2[0], e2[1]]); continue; }
      var t = ((e2[0] - e1[0]) * r2y - (e2[1] - e1[1]) * r2x) / den;
      out.push([+(e1[0] + r1x * t).toFixed(2), +(e1[1] + r1y * t).toFixed(2)]);
    }
    // si el borde es mas ancho que la piscina, el offset se da vuelta: no se dibuja
    var a3 = 0;
    for (var i2 = 0; i2 < n; i2++) {
      var s1 = out[i2], s2 = out[(i2 + 1) % n];
      a3 += s1[0] * s2[1] - s2[0] * s1[1];
    }
    if (a3 * a2 <= 0 || Math.abs(a3) < Math.abs(a2) * 0.04) return null;
    return out;
  }
  function copingDe(a) {
    if (a.open) return 0;
    if (a.coping != null) return Number(a.coping) || 0;
    var pt = AREA_PATTERNS[a.pattern];
    return (pt && pt.coping) || 0;
  }

  function renderAreas() {
    var out = '';
    state.areas.forEach(function (a) {
      var fill;
      if (a.open || a.pattern === 'none' || !AREA_PATTERNS[a.pattern]) fill = 'none';
      else fill = 'url(#' + ensurePattern(a.pattern, a.rot || 0) + ')';
      var d = a.lineStyle === 'cloud' ? cloudPath(a.pts, !a.open) : areaPath(a);
      var est = LINE_STYLES[a.lineStyle] || LINE_STYLES.solid;
      var dash = est.dash ? ' stroke-dasharray="' + est.dash + '"' : '';
      var col = a.color || '#14161a', lw = a.lw || est.lw || 0.9;
      // el borde de la piscina va DEBAJO: el agua se dibuja dentro de el
      var cop = copingDe(a);
      if (cop > 0) {
        var inner = offsetPolyIn(a.pts, cop);
        if (inner) {
          // la banda del coping queda en blanco (es el borde de concreto) y el
          // agua solo llena el poligono de adentro
          out += '<path d="' + d + '" fill="#ffffff" stroke="none"' + opAttr(a) + '/>';
          out += '<path d="M' + inner.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' Z" fill="' + fill +
            '" stroke="' + col + '" stroke-width="' + Math.max(0.6, lw * 0.8) + '" stroke-linejoin="round"' + opAttr(a) + '/>';
          fill = 'none';
          lw = Math.max(lw, 1.5);
        }
      }
      out += '<path data-id="' + a.id + '" d="' + d + '" fill="' + fill + '" stroke="' + col + '" stroke-width="' + lw + '" stroke-linejoin="round"' + dash + opAttr(a) + '/>';
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
  // pedido de Edgar: la simbología del oficio (devices, switches, GFCI,
  // plomería…) se ve muy grande — factor global 0.7. Los MUEBLES y el
  // site del escaneo NO se tocan: van a tamaño real de la casa.
  function symK(def) {
    // capa 'furniture' = objetos a TAMAÑO REAL (camas, toilet, tub, nevera
    // — vengan del escaneo o de la paleta); site (árboles) igual
    return (def && (def.layer === 'furniture' || def.cat === 'site')) ? 1 : 0.7;
  }
  function symTransform(s) {
    var k = symK(SYMBOLS[s.key]);
    var sx = (s.scale || 1) * (s.sx || 1) * k;
    var sy = (s.scale || 1) * (s.sy || 1) * k;
    return 'translate(' + s.x + ' ' + s.y + ') rotate(' + (s.rot || 0) + ') scale(' + sx + ' ' + sy + ')';
  }
  // esquinas del símbolo en coordenadas de mundo (para las asas de estirar)
  function symCorners(e) {
    var def = SYMBOLS[e.key];
    if (!def) return null;
    var k = symK(def);
    var hx = def.w / 2 * (e.scale || 1) * (e.sx || 1) * k;
    var hy = def.h / 2 * (e.scale || 1) * (e.sy || 1) * k;
    var r = (e.rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
    function P(lx, ly) { return [e.x + lx * cr - ly * sr, e.y + lx * sr + ly * cr]; }
    return [P(-hx, -hy), P(hx, -hy), P(hx, hy), P(-hx, hy)];
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
    state.wires.forEach(function (w) {
      var oW = opAttr(w);
      elec += oW ? '<g' + oW + '>' + wireMarkup(w) + '</g>' : wireMarkup(w);
    });
    state.symbols.forEach(function (s) {
      var def = SYMBOLS[s.key]; if (!def) return;
      var sw = def.lw ? ' style="stroke-width:' + def.lw + '"' : '';
      var frag = '<g class="sym" data-id="' + s.id + '" transform="' + symTransform(s) + '"' + sw + opAttr(s) + '>' + def.svg + '</g>';
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
    var txt = label || fmtFtIn(len);
    if (String(cls).indexOf('meas') >= 0) {
      // medición: el número SIEMPRE horizontal y con fondito blanco — legible
      // en medidas verticales sin virar el plano (estilo Bluebeam)
      var lmx = (a[0] + b[0]) / 2, lmy = (a[1] + b[1]) / 2;
      // número discreto: chico, y si la medida es corta se achica más para no
      // llevarse toda la línea
      var chars = String(txt).length;
      var fs = Math.max(2.2, Math.min(4.5, (len * 0.7) / (chars * 0.62)));
      var tw = chars * fs * 0.62 + fs * 0.7;
      s += '<rect x="' + (lmx - tw / 2) + '" y="' + (lmy - fs * 1.2) + '" width="' + tw + '" height="' + (fs * 1.55) + '" rx="' + (fs * 0.3) + '" fill="#ffffff" fill-opacity="0.88" stroke="none"/>';
      s += '<text x="' + lmx + '" y="' + lmy + '" font-size="' + fs + '" text-anchor="middle">' + esc(txt) + '</text>';
    } else {
      var mid = [(a[0] + b[0]) / 2 + nx * 3.5, (a[1] + b[1]) / 2 + ny * 3.5];
      var ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90 || ang <= -90) ang += 180;
      s += '<text x="0" y="0" font-size="7" text-anchor="middle" transform="translate(' + mid[0] + ' ' + mid[1] + ') rotate(' + ang + ')">' +
        esc(txt) + '</text>';
    }
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
    state.dims.forEach(function (d) {
      var mk = dimMarkup(d.x1, d.y1, d.x2, d.y2, d.off, d.meas ? 'dim meas' : 'dim');
      var oD = opAttr(d);
      s += oD ? '<g' + oD + '>' + mk + '</g>' : mk;
    });
    state.leaders.forEach(function (l) {
      var mk2 = leaderMarkup(l), oL = opAttr(l);
      s += oL ? '<g' + oL + '>' + mk2 + '</g>' : mk2;
    });
    state.texts.forEach(function (t) {
      var sz = t.size || 9;
      if (t.style === 'circle' || t.style === 'hex') {
        var r = Math.max(sz * 0.95, t.text.length * sz * 0.34 + 2.5);
        s += '<g class="sym" data-id="' + t.id + '"' + opAttr(t) + '>';
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
        s += '<text class="lbl" data-id="' + t.id + '" x="' + t.x + '" y="' + t.y + '" font-size="' + sz + '"' + opAttr(t) + '>' + esc(t.text) + '</text>';
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
    scheduleHires();
  }

  /* --- re-dibujado nítido de la zona visible (nivel Bluebeam) ---
     El raster base se queda corto al acercarse en hojas de 36". Si la hoja
     vino de un PDF (vectorial) y sigue abierta en la sesión, al parar el
     zoom se re-dibuja SOLO el pedazo visible a resolución de pantalla. */
  var pdfLive = {};   // índice de hoja → { doc, page } — solo vive en la sesión
  var hiresTimer = null, hiresTok = 0, hiresTask = null;
  function scheduleHires() { clearTimeout(hiresTimer); hiresTimer = setTimeout(updateHires, 400); }
  function hiresClear() { var el = document.getElementById('bgHires'); if (el && el.parentNode) el.parentNode.removeChild(el); }
  // tras recargar la página, el PDF vivo se rehidrata desde IndexedDB
  var pdfBinLoading = {};
  function loadPdfLive(bg) {
    var key = bg.pdfId;
    if (!key || pdfBinLoading[key] || typeof pdfjsLib === 'undefined') return;
    pdfBinLoading[key] = true;
    idbGet(key, function (bytes) {
      if (!bytes) { delete pdfBinLoading[key]; return; }   // reintenta en el próximo zoom
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = window.MXP_PDF_WORKER_URL || 'js/vendor/pdf.worker.min.js'; } catch (e) {}
      pdfjsLib.getDocument({ data: bytes.slice(0) }).promise.then(function (doc) {
        // el mismo archivo sirve a todas las hojas que salieron de él
        state.sheets.forEach(function (sh, i) {
          var o;
          if (i === state.curSheet) o = { bg: state.bg };
          else { try { o = JSON.parse(sh.data || '{}'); } catch (e) { o = {}; } }
          if (o.bg && o.bg.pdfId === key) pdfLive[i] = { doc: doc, page: o.bg.pdfPage || 1 };
        });
        scheduleHires();
      }).catch(function () { delete pdfBinLoading[key]; });
    });
  }
  function updateHires() {
    var tok = ++hiresTok;
    var b = state.bg, rec = pdfLive[state.curSheet];
    if (b && !rec && b.pdfId) loadPdfLive(b);
    if (!b || !rec || b.origUrl) return hiresClear();  // sin PDF vivo o con "Solo líneas"
    var basePx = b.pxW || 4096;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    // el raster base alcanza SOLO si cubre los píxeles FÍSICOS de la pantalla
    // (Retina = 2x): sin esto, en iPad el modo nítido nunca encendía al zoom
    // normal de trabajo y todo se veía igual de suave
    if (view.z * dpr <= (basePx / b.w) * 1.05) return hiresClear();
    var r = svg.getBoundingClientRect();
    var p0 = screenToWorld(r.left, r.top), p1 = screenToWorld(r.right, r.bottom);
    var x0 = Math.max(b.x, p0[0]), y0 = Math.max(b.y, p0[1]);
    var x1 = Math.min(b.x + b.w, p1[0]), y1 = Math.min(b.y + b.h, p1[1]);
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return hiresClear();
    var cw = Math.round((x1 - x0) * view.z * dpr), ch = Math.round((y1 - y0) * view.z * dpr);
    var MAXA = document.body.classList.contains('touch') ? 9e6 : 16e6;
    var shr = Math.min(1, 4096 / cw, 4096 / ch, Math.sqrt(MAXA / (cw * ch)));
    cw = Math.max(1, Math.round(cw * shr)); ch = Math.max(1, Math.round(ch * shr));
    rec.doc.getPage(rec.page).then(function (page) {
      if (tok !== hiresTok) return;
      var vp1 = page.getViewport({ scale: 1 });
      var S = cw / (vp1.width * ((x1 - x0) / b.w));
      var vp = page.getViewport({ scale: S });
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      var ox = (x0 - b.x) / b.w * vp.width, oy = (y0 - b.y) / b.h * vp.height;
      if (hiresTask) { try { hiresTask.cancel(); } catch (e) {} }
      hiresTask = page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -ox, -oy] });
      hiresTask.promise.then(function () {
        hiresTask = null;
        if (tok !== hiresTok) { cv.width = 1; cv.height = 1; return; }
        var url = cv.toDataURL('image/jpeg', 0.85);
        cv.width = 1; cv.height = 1;
        hiresClear();
        var im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        im.setAttribute('id', 'bgHires');
        im.setAttribute('href', url);
        im.setAttribute('x', x0); im.setAttribute('y', y0);
        im.setAttribute('width', x1 - x0); im.setAttribute('height', y1 - y0);
        im.setAttribute('opacity', b.opacity == null ? 0.7 : b.opacity);
        im.setAttribute('preserveAspectRatio', 'none');
        G.bg.appendChild(im);
      }).catch(function () { hiresTask = null; });
    }).catch(function () {});
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
      s += rotHandleMarkup(selGroup);
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
          if (def.layer === 'furniture') {
            // asas de ESQUINA: jala una y el objeto se estira a la medida
            var scs = symCorners(e), shr = 5 / view.z + 2;
            scs.forEach(function (c5) {
              s += '<circle class="handle" cx="' + c5[0] + '" cy="' + c5[1] + '" r="' + shr + '"/>';
            });
          }
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
          var dhr = (document.body.classList.contains('touch') ? 9 : 5) / view.z + 2;
          s += '<circle class="handle" data-h="1" cx="' + e.x1 + '" cy="' + e.y1 + '" r="' + dhr + '"/>';
          s += '<circle class="handle" data-h="2" cx="' + e.x2 + '" cy="' + e.y2 + '" r="' + dhr + '"/>';
        } else if (sel.kind === 'area') {
          s += '<path class="sel" d="' + areaPath(e) + '"/>';
          // una asa por PUNTA: se arrastran igual que los extremos de una pared
          // (Edgar, 08/30: "al cerrar el poligono que yo pueda editar cada punta")
          var ahr = (document.body.classList.contains('touch') ? 9 : 5) / view.z + 2;
          e.pts.forEach(function (q, qi) {
            s += '<circle class="handle" data-v="' + qi + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + ahr + '"/>';
          });
        } else if (sel.kind === 'wire') {
          s += '<path class="sel" d="' + wirePath(e).d + '"/>';
        } else if (sel.kind === 'leader') {
          var lw = (e.text.length * (e.size || 7)) * 0.58 + 6;
          var lx = e.x >= e.tx ? e.x - 3 : e.x - lw + 3;
          s += '<rect class="sel" x="' + lx + '" y="' + (e.y - (e.size || 7)) + '" width="' + lw + '" height="' + ((e.size || 7) + 5) + '"/>';
        }
        // el circulito de girar tambien en una sola pieza (menos aberturas,
        // que viajan pegadas a su pared)
        if (sel.kind !== 'opening') s += rotHandleMarkup([sel]);
      }
    }
    G.sel.innerHTML = s;
  }

  function findSel() {
    if (!sel) return null;
    var pool = { wall: state.walls, opening: state.openings, symbol: state.symbols, text: state.texts, dim: state.dims, area: state.areas, wire: state.wires, leader: state.leaders }[sel.kind];
    return pool ? pool.find(function (e) { return e.id === sel.id; }) : null;
  }

  function renderGuia() {
    var g = document.getElementById('gGuia');
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.id = 'gGuia';
      G.bg.parentNode.insertBefore(g, G.bg.nextSibling);   // encima del fondo, debajo de las paredes
    }
    if (!state.guia || !state.guia.length) { g.innerHTML = ''; return; }
    var W = 2.2 / (view.z || 1);
    g.innerHTML = state.guia.map(function (t) {
      return '<line x1="' + t.x1 + '" y1="' + t.y1 + '" x2="' + t.x2 + '" y2="' + t.y2 +
        '" stroke="#8a8fa3" stroke-width="' + W + '" stroke-dasharray="' + (W * 5) + ' ' + (W * 3.5) + '" stroke-linecap="round" opacity="0.9"/>';
    }).join('') +
    '<text x="' + state.guia[0].x1 + '" y="' + (state.guia[0].y1 - 8) + '" font-size="' + (11 / (view.z || 1) * 1.2) + '" fill="#8a8fa3">CONTORNO (guía — no cuenta en materiales)</text>';
  }
  function refresh() {
    renderWalls(); renderAreas(); renderSymbols(); renderAnnot(); renderBg(); renderGuia(); renderSel();
    refreshCounts(); showProps();
  }

  /* ---------------- hit testing ---------------- */
  var layerVisible = { background: true, architecture: true, areas: true, furniture: true, electrical: true, annotation: true, grid: true };

  function hitTest(p) {
    /* QUÉ AGARRA EL CLIC (Edgar, 08/30: "paso mucho trabajo para seleccionar
       un objeto cuando hay varios; que solo tome ese, y si aumento que sea
       más preciso").

       Dos cosas estaban mal:
       1) Los márgenes de captura tenían un trozo FIJO en pulgadas del plano
          (los símbolos agarraban 2" alrededor, las aberturas ¡6"!), así que
          por mucho que te acercaras seguían tragándose al vecino. Ahora TODO
          el margen va en PÍXELES DE PANTALLA: de lejos es generoso y ayuda a
          atinar, y al acercarte se encoge solo — el zoom manda.
       2) Ganaba el PRIMERO de la lista, no el que estaba debajo del dedo.
          Ahora se juntan todos los candidatos y gana el MÁS CERCANO; la capa
          solo desempata cuando dos están a la misma distancia (ahí manda lo
          eléctrico, que es lo que se dibuja encima). */
    var i, e, def, cand = [];
    // en pantalla táctil el dedo no es un cursor: tolerancia doble para atinar
    var TF = document.body.classList.contains('touch') ? 2.4 : 1;
    var Z = view.z || 1;
    function PX(px) { return (px * TF) / Z; }        // píxeles de pantalla → pulgadas
    function pon(kind, id, d, prio) { cand.push({ kind: kind, id: id, d: d, prio: prio }); }

    // símbolos
    for (i = 0; i < state.symbols.length; i++) {
      e = state.symbols[i]; def = SYMBOLS[e.key];
      if (!def || !layerVisible[def.layer]) continue;
      var rot = -(e.rot || 0) * Math.PI / 180, kk = symK(def);
      var scx = (e.scale || 1) * (e.sx || 1) * kk;
      var scy = (e.scale || 1) * (e.sy || 1) * kk;
      var dxs = p[0] - e.x, dys = p[1] - e.y;
      var lx = (dxs * Math.cos(rot) - dys * Math.sin(rot)) / scx;
      var ly = (dxs * Math.sin(rot) + dys * Math.cos(rot)) / scy;
      // distancia REAL al borde de su caja (0 si el punto cae dentro)
      var fx = Math.max(0, Math.abs(lx) - def.w / 2) * scx;
      var fy = Math.max(0, Math.abs(ly) - def.h / 2) * scy;
      var ds = Math.hypot(fx, fy);
      if (ds <= PX(4)) pon('symbol', e.id, ds, def.layer === 'electrical' ? 9 : 8);
    }
    if (layerVisible.architecture) {
      // aberturas (van encima de su pared)
      for (i = 0; i < state.openings.length; i++) {
        e = state.openings[i];
        var w = null;
        for (var iw = 0; iw < state.walls.length; iw++) if (state.walls[iw].id === e.wallId) { w = state.walls[iw]; break; }
        if (!w) continue;
        var g = wallGeom(w), r = distToSeg(p[0], p[1], w.x1, w.y1, w.x2, w.y2);
        var d = r.t * g.len;
        var fuera = Math.abs(d - e.pos) - e.w / 2;              // a lo largo del vano
        var lejos = r.d - w.t / 2;                              // perpendicular a la cara
        if (fuera <= PX(2) && lejos <= PX(6)) {
          pon('opening', e.id, Math.max(0, Math.max(fuera, lejos)), 7);
        }
      }
      // paredes
      for (i = 0; i < state.walls.length; i++) {
        e = state.walls[i];
        var rr = distToSeg(p[0], p[1], e.x1, e.y1, e.x2, e.y2);
        var dw = rr.d - e.t / 2;
        if (dw <= PX(3)) pon('wall', e.id, Math.max(0, dw), 3);
      }
    }
    if (layerVisible.annotation) {
      for (i = 0; i < state.texts.length; i++) {
        e = state.texts[i];
        var sz = e.size || 9;
        if (e.style === 'circle' || e.style === 'hex') {
          var br = Math.max(sz * 0.95, e.text.length * sz * 0.34 + 2.5) * 1.2;
          var dt = Math.hypot(p[0] - e.x, p[1] - e.y) - br;
          if (dt <= PX(3)) pon('text', e.id, Math.max(0, dt), 6);
        } else {
          var tw = e.text.length * sz * 0.58;
          var qx1 = Math.max(0, Math.max(e.x - p[0], p[0] - (e.x + tw)));
          var qy1 = Math.max(0, Math.max((e.y - sz) - p[1], p[1] - e.y));
          var dt2 = Math.hypot(qx1, qy1);
          if (dt2 <= PX(3)) pon('text', e.id, dt2, 6);
        }
      }
      for (i = 0; i < state.dims.length; i++) {
        e = state.dims[i];
        var dx2 = e.x2 - e.x1, dy2 = e.y2 - e.y1, ln = Math.hypot(dx2, dy2) || 1;
        var nx = -dy2 / ln, ny = dx2 / ln, off = e.off == null ? 14 : e.off;
        var rd = distToSeg(p[0], p[1], e.x1 + nx * off, e.y1 + ny * off, e.x2 + nx * off, e.y2 + ny * off);
        var rd2 = distToSeg(p[0], p[1], e.x1, e.y1, e.x2, e.y2);   // también los puntos medidos
        var dd2 = Math.min(rd.d, rd2.d);
        if (dd2 <= PX(5)) pon('dim', e.id, dd2, 5);
      }
      for (i = 0; i < state.leaders.length; i++) {
        e = state.leaders[i];
        var lsz = e.size || 7, ltw = e.text.length * lsz * 0.58;
        var lx0 = e.x >= e.tx ? e.x : e.x - ltw;
        var gx1 = Math.max(0, Math.max(lx0 - p[0], p[0] - (lx0 + ltw)));
        var gy1 = Math.max(0, Math.max((e.y - lsz) - p[1], p[1] - e.y));
        var dl = Math.hypot(gx1, gy1);
        var dl2 = distToSeg(p[0], p[1], e.x, e.y, e.tx, e.ty).d;
        var dlm = Math.min(dl, dl2);
        if (dlm <= PX(3)) pon('leader', e.id, dlm, 5);
      }
    }
    if (layerVisible.electrical) {
      for (i = 0; i < state.wires.length; i++) {
        e = state.wires[i];
        var wp = wirePath(e), best = 1e9;
        for (var k = 0; k <= 20; k++) {
          var tt = k / 20, mt = 1 - tt;
          var qx = mt * mt * e.x1 + 2 * mt * tt * wp.cx + tt * tt * e.x2;
          var qy = mt * mt * e.y1 + 2 * mt * tt * wp.cy + tt * tt * e.y2;
          var ddw = Math.hypot(p[0] - qx, p[1] - qy);
          if (ddw < best) best = ddw;
        }
        if (best <= PX(4)) pon('wire', e.id, best, 5);
      }
    }
    // LÍNEAS Y SUPERFICIES. Una polilínea ABIERTA no tiene interior, así que
    // preguntarle "¿el punto cae dentro?" nunca la agarraba — por eso las
    // líneas se resistían al clic aunque las paredes y los símbolos no
    // (Edgar, 08/30). Ahora se mide la distancia AL TRAZO, como con un cable
    // o una cota. Una superficie cerrada se puede agarrar de las dos formas:
    // por su línea (preciso, compite de tú a tú) o por su relleno (prioridad
    // baja, que suelen ser grandes y estar debajo de todo).
    if (layerVisible.areas) {
      for (i = 0; i < state.areas.length; i++) {
        e = state.areas[i];
        if (!e.pts || e.pts.length < 2) continue;
        var dBor = 1e9, q2;
        for (q2 = 0; q2 + 1 < e.pts.length; q2++) {
          var dq = distToSeg(p[0], p[1], e.pts[q2][0], e.pts[q2][1], e.pts[q2 + 1][0], e.pts[q2 + 1][1]).d;
          if (dq < dBor) dBor = dq;
        }
        if (!e.open && e.pts.length > 2) {          // el tramo que cierra el polígono
          var np2 = e.pts.length - 1;
          var dqc = distToSeg(p[0], p[1], e.pts[np2][0], e.pts[np2][1], e.pts[0][0], e.pts[0][1]).d;
          if (dqc < dBor) dBor = dqc;
        }
        var lwA = (e.lw || ((LINE_STYLES[e.lineStyle] || {}).lw) || 0.9) / 2;
        if (dBor - lwA <= PX(4)) pon('area', e.id, Math.max(0, dBor - lwA), 5);
        else if (!e.open && pointInPoly(p, e.pts)) pon('area', e.id, 0, 1);
      }
    }
    if (!cand.length) return null;
    // gana el más cercano; a igual distancia, el de más arriba en el dibujo.
    // El "casi igual" es medio píxel de pantalla, no una medida del plano.
    var eps = PX(0.5);
    cand.sort(function (a, b) {
      if (Math.abs(a.d - b.d) > eps) return a.d - b.d;
      return b.prio - a.prio;
    });
    return { kind: cand[0].kind, id: cand[0].id };
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
    // iOS a veces se traga el pointerup durante un pellizco y queda un "dedo
    // fantasma": cada toque siguiente contaría como pellizco y la app parece
    // muerta (solo zoom). Purgar punteros viejos sin movimiento lo cura.
    var nowT = Date.now();
    ptrs.forEach(function (v, k) { if (nowT - (v.t || 0) > 2500) ptrs.delete(k); });
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, t: nowT });
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
    // doble TOQUE en pantalla táctil = doble clic (editar medida/texto)
    if (ev.pointerType === 'touch') {
      var now = Date.now();
      if (lastTap && now - lastTap.t < 450 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30) {
        lastTap = null;
        if (tool === 'select' || tool === 'measure' || tool === 'dim') {
          var th = hitTest(p);
          if (th && th.kind === 'dim') {
            drag = null;
            editDimValue(state.dims.find(function (x) { return x.id === th.id; }));
            return;
          }
          if (th && th.kind === 'text') {
            drag = null;
            var tt = state.texts.find(function (x) { return x.id === th.id; });
            uiPrompt('Editar texto:', tt.text, function (nt) {
              if (nt !== null && nt !== '') { pushUndo(); tt.text = nt; refresh(); }
            });
            return;
          }
        }
      } else {
        lastTap = { t: now, x: ev.clientX, y: ev.clientY };
      }
    }
    onToolDown(p, ev);
  });
  var lastTap = null;

  svg.addEventListener('pointermove', function (ev) {
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, t: Date.now() });
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
    $('#coords').textContent = fmtFtIn(p[0]) + ' , ' + fmtFtIn(p[1]) + '   ·   zoom ' + zoomPct() + '%';
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
  // red de seguridad iOS: si el dedo se levanta fuera del svg o Safari corta el
  // gesto, igual se limpia — y al volver a la app no quedan dedos fantasma
  window.addEventListener('pointerup', function (ev) { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; });
  window.addEventListener('pointercancel', function (ev) { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; });
  document.addEventListener('visibilitychange', function () { ptrs.clear(); pinch = null; drag = null; });
  svg.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    if (drawing && drawing.mode === 'wallchain') finishWallChain();
    else if (drawing && drawing.mode === 'areachain') finishAreaChain();
  });
  // escribe la medida deseada y el segundo punto se ajusta solo en la misma dirección
  function editDimValue(dd) {
    if (!dd) return;
    var len0 = Math.hypot(dd.x2 - dd.x1, dd.y2 - dd.y1) || 1;
    uiPrompt('Nueva medida de la cota (ej: 20\'  ·  20\' 6"):', fmtFtIn(len0), function (v) {
      if (v === null || v === '') return;
      var nv = parseDist(v);
      if (!nv || nv <= 0) {
        uiAlert('No entendí la medida "' + v + '".\nEjemplos válidos:  20\'   ·   20\'-6"   ·   6 1/2"   ·   54"');
        return;
      }
      pushUndo();
      var ux = (dd.x2 - dd.x1) / len0, uy = (dd.y2 - dd.y1) / len0;
      dd.x2 = dd.x1 + ux * nv;
      dd.y2 = dd.y1 + uy * nv;
      sel = { kind: 'dim', id: dd.id };
      refresh();
    });
  }

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
      editDimValue(state.dims.find(function (x) { return x.id === h.id; }));
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
    var rawP = p;   // el toque SIN imán: para detectar qué tocó el dedo de verdad
    if (SNAP_TOOLS[tool]) {
      var so = applyOsnap(p);
      if (so.sn) p = so.p;   // el snap gana sobre el ortho
      else if (drawing && drawing.mode === 'twopoint') p = autoStraight(p, ev);
      else if (wantOrtho(ev) && drawing && drawing.mode === 'areachain') p = orthoRel(drawing.pts, p);
    } else if (drawing && drawing.mode === 'twopoint') {
      p = autoStraight(p, ev);
    }
    switch (tool) {
      case 'select': return selectDown(p, ev);
      case 'wall': return wallDown(p, ev);
      case 'area': return areaDown(p);
      case 'rect': case 'ellipse': return shapeDown(p, tool, ev);
      case 'cloud': return shapeDown(p, 'cloud', ev);
      case 'pline': return areaDown(p);
      case 'door': return openingDown(p, curDoorType);
      case 'window': return openingDown(p, curWinType);
      case 'measure':
        // en Measure, tocar una medida existente la SELECCIONA (como Bluebeam):
        // se usa el toque SIN imán — el OSNAP saltaba al extremo de la medida
        // vieja y arrancaba otra medida en vez de seleccionarla
        if (!drawing) {
          var hm = hitTest(rawP);
          if (hm && hm.kind === 'dim') return selectDown(rawP, ev);
          if (sel) { sel = null; renderSel(); showProps(); }
        }
        return twoPointDown(p, 'measure');
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
      else if (drawing && drawing.mode === 'twopoint') p = autoStraight(p, ev);
      else if (drawing && drawing.mode === 'areachain' && wantOrtho(ev)) p = orthoRel(drawing.pts, p);
    } else if (drawing && drawing.mode === 'twopoint') {
      p = autoStraight(p, ev);
    }
    var hadPreview = true;
    if (tool === 'wall' && drawing && drawing.mode === 'wallchain') {
      var raw = snapWallPt(p);
      var b = wantOrtho(ev) ? orthoLock(drawing.last, raw) : orthoSnap(drawing.last, raw);
      var len = Math.hypot(b[0] - drawing.last[0], b[1] - drawing.last[1]);
      var wtPrev = WALL_TYPES[$('#wallType').value];
      var t = wtPrev.t / 2;
      // en el bloque forrado, el fantasma enseña de qué LADO va a caer la línea
      // fina ANTES de soltar el clic: el drySide sale a la derecha del avance y
      // trazar el perímetro al revés lo dejaba todo por fuera de la casa
      var gp = '';
      if (wtPrev.dry && len > 1) {
        var upx = (b[0] - drawing.last[0]) / len, upy = (b[1] - drawing.last[1]) / len;
        var opx = -upy * (t + 1.5), opy = upx * (t + 1.5);
        gp = '<line x1="' + (drawing.last[0] + opx) + '" y1="' + (drawing.last[1] + opy) +
          '" x2="' + (b[0] + opx) + '" y2="' + (b[1] + opy) + '" stroke="#0b84ff" stroke-width="0.9" stroke-dasharray="4 3"/>';
      }
      G.prev.innerHTML = '<g class="preview">' +
        '<line class="wall-edge" x1="' + drawing.last[0] + '" y1="' + drawing.last[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke-width="' + (t * 2) + '" stroke="#9a968a"/>' + gp +
        '<text class="lbl" x="' + ((drawing.last[0] + b[0]) / 2 + 8) + '" y="' + ((drawing.last[1] + b[1]) / 2 - 8) + '" font-size="9" font-weight="bold">' + fmtFtIn(len) + '</text></g>';
      drawing.cursor = b;
    } else if (drawing && drawing.mode === 'shape2') {
      var spts = shapePts(drawing.kind === 'cloud' ? 'rect' : drawing.kind, drawing.a, [Math.round(p[0]), Math.round(p[1])], ev && ev.shiftKey);
      var d2 = 'M' + spts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' Z';
      G.prev.innerHTML = '<g class="preview"><path d="' + d2 + '" fill="none" stroke="#0b84ff" stroke-width="1.2" stroke-dasharray="5 4"/></g>';
    } else if ((tool === 'area' || tool === 'pline') && !drawing) {
      // AÚN NO HAY LÍNEA: las guías ya trabajan, para que veas DÓNDE empezar.
      // Es lo del refrigerador: el gabinete sigue al otro lado y la guía verde
      // te dice exactamente a qué altura arrancar para que quede parejo.
      var np0 = guiaAjusta(snapWallPt(p), null, ev);
      puntoGuiado = np0;
      G.prev.innerHTML = guiasVivas ? '<g class="preview">' + guiasVivas + '</g>' : '';
    } else if ((tool === 'area' || tool === 'pline') && drawing && drawing.mode === 'areachain') {
      var ult = drawing.pts[drawing.pts.length - 1];
      var np = guiaAjusta(snapWallPt(p), ult, ev, ejeLadoPrevio(drawing.pts));
      drawing.cursor = np;                                  // el clic usa el punto YA guiado
      var d = 'M' + drawing.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' L' + np[0] + ',' + np[1];
      var largoPrev = Math.hypot(np[0] - ult[0], np[1] - ult[1]);
      // el PRIMER punto se marca en cuanto hay 2 tramos: ahí se cierra
      var cerrarMk = '';
      if (drawing.pts.length >= 2) {
        var pc = drawing.pts[0], rc2 = 6 / (view.z || 1);
        var cerca2 = Math.hypot(np[0] - pc[0], np[1] - pc[1]) < 14 / (view.z || 1);
        cerrarMk = '<circle cx="' + pc[0] + '" cy="' + pc[1] + '" r="' + rc2 +
          '" fill="' + (cerca2 ? 'rgba(10,143,60,.25)' : 'none') + '" stroke="#0a8f3c" stroke-width="' +
          ((cerca2 ? 2 : 1.1) / (view.z || 1)) + '"/>';
        if (cerca2) cerrarMk += '<path d="M' + drawing.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') +
          ' Z" fill="rgba(10,143,60,.10)" stroke="#0a8f3c" stroke-width="' + (1.2 / (view.z || 1)) + '"/>';
      }
      G.prev.innerHTML = '<g class="preview">' + guiasVivas + cerrarMk +
        '<path d="' + d + '" fill="none" stroke="#0b84ff" stroke-width="1.2" stroke-dasharray="5 4"/>' +
        '<text class="lbl" x="' + ((ult[0] + np[0]) / 2 + 8) + '" y="' + ((ult[1] + np[1]) / 2 - 8) +
        '" font-size="9" font-weight="bold">' + fmtFtIn(largoPrev) + '</text></g>';
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
      // OJO: la condición pedía 'drawing' además de hadPreview, así que la
      // vista previa que se dibuja ANTES del primer clic — las guías de
      // alineación del refrigerador — se borraba justo después de pintarse.
      // Por eso Edgar nunca veía el cuadrado verde (medido 08/30).
      if (hadPreview) { if (snapMark) G.prev.innerHTML += snapMark; }
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
    // el circulito de giro manda: se comprueba ANTES de cualquier otra cosa
    if (selGroup && tryRotateGrab(p, selGroup)) return;
    if (sel && sel.kind !== 'opening' && findSel() && tryRotateGrab(p, [sel])) return;
    var h = hitTest(p);
    // arrastrar cualquier pieza del grupo mueve el grupo completo
    if (inGroup(h)) {
      drag = {
        mode: 'groupmove', start: p, snap: snapshot(), moved: false,
        refs: selGroup.slice(), calce: null,
        items: selGroup.map(function (r) { return { ref: r, e: entityOf(r), orig: JSON.parse(JSON.stringify(entityOf(r))) }; })
      };
      return;
    }
    // asas de extremos de pared seleccionada
    if (sel && sel.kind === 'wall') {
      var w = findSel();
      if (w) {
        var hr = 8 / view.z + 3;
        if (Math.hypot(p[0] - w.x1, p[1] - w.y1) < hr) { drag = { mode: 'endpoint', wall: w, end: 1, start: p, ox: w.x1, oy: w.y1, snap: snapshot(), moved: false }; return; }
        if (Math.hypot(p[0] - w.x2, p[1] - w.y2) < hr) { drag = { mode: 'endpoint', wall: w, end: 2, start: p, ox: w.x2, oy: w.y2, snap: snapshot(), moved: false }; return; }
      }
    }
    // asas de extremos de una medida/cota seleccionada
    if (sel && sel.kind === 'dim') {
      var dsel = findSel();
      if (dsel) {
        var dLen = Math.hypot(dsel.x2 - dsel.x1, dsel.y2 - dsel.y1);
        // el asa nunca se come más de un tercio de la medida: el centro queda libre para mover
        var dhr2 = Math.min((document.body.classList.contains('touch') ? 14 : 8) / view.z + 3, dLen / 3);
        if (Math.hypot(p[0] - dsel.x1, p[1] - dsel.y1) < dhr2) { drag = { mode: 'dimEnd', dim: dsel, end: 1, start: p, ox: dsel.x1, oy: dsel.y1, snap: snapshot(), moved: false }; return; }
        if (Math.hypot(p[0] - dsel.x2, p[1] - dsel.y2) < dhr2) { drag = { mode: 'dimEnd', dim: dsel, end: 2, start: p, ox: dsel.x2, oy: dsel.y2, snap: snapshot(), moved: false }; return; }
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
    // asas de PUNTA de un poligono / polilinea seleccionada
    if (sel && sel.kind === 'area') {
      var asel = findSel();
      if (asel && asel.pts) {
        var avr = (document.body.classList.contains('touch') ? 14 : 9) / view.z + 3;
        for (var vi = 0; vi < asel.pts.length; vi++) {
          if (Math.hypot(p[0] - asel.pts[vi][0], p[1] - asel.pts[vi][1]) < avr) {
            drag = { mode: 'areaVtx', e: asel, i: vi, snap: snapshot(), moved: false,
                     ox: asel.pts[vi][0], oy: asel.pts[vi][1], start: p };
            return;
          }
        }
      }
    }
    // asas de esquina de un objeto a tamaño real: estirar jalando
    if (sel && sel.kind === 'symbol') {
      var se = findSel();
      var sdef = se && SYMBOLS[se.key];
      if (se && sdef && sdef.layer === 'furniture') {
        var cs = symCorners(se);
        var cr3 = (document.body.classList.contains('touch') ? 14 : 9) / view.z + 3;
        for (var ci = 0; ci < 4; ci++) {
          if (Math.hypot(p[0] - cs[ci][0], p[1] - cs[ci][1]) < cr3) {
            var kP = symK(sdef), esc0 = (se.scale || 1) * kP;
            var W0 = sdef.w * esc0 * (se.sx || 1), H0 = sdef.h * esc0 * (se.sy || 1);
            drag = { mode: 'symResize', e: se, opp: cs[(ci + 2) % 4], snap: snapshot(), moved: false,
                     prop: (H0 > 0 ? W0 / H0 : 1) };   // para el SHIFT: conservar la forma
            return;
          }
        }
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
      // no se pinta hasta que el arrastre sea de verdad: así lo que se ve
      // en pantalla es exactamente lo que va a seleccionar
      if (Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) <= marcoMin()) { G.prev.innerHTML = ''; return; }
      var x0 = Math.min(drag.start[0], p[0]), y0 = Math.min(drag.start[1], p[1]);
      G.prev.innerHTML = '<rect x="' + x0 + '" y="' + y0 + '" width="' + Math.abs(p[0] - drag.start[0]) +
        '" height="' + Math.abs(p[1] - drag.start[1]) + '" fill="rgba(11,132,255,0.08)" stroke="#0b84ff" stroke-width="0.8" stroke-dasharray="4 3"/>';
      return;
    }
    if (drag.mode === 'groupmove') {
      drag.moved = true;
      var gdx = p[0] - drag.start[0], gdy = p[1] - drag.start[1];
      if (finoOn(ev)) { gdx *= FINO; gdy *= FINO; setHint('🐢 Fino (Alt): el grupo se mueve poquito a poquito'); }
      if (wantOrtho(ev)) { if (Math.abs(gdx) >= Math.abs(gdy)) gdy = 0; else gdx = 0; }
      applyGroupDelta(drag.items, gdx, gdy);
      // 🧲 CALCE: ¿esta pieza pega con alguna de las ya puestas? Se enseña
      // en vivo y se aplica al soltar. Con Alt (fino) el imán se apaga:
      // si está ajustando al milímetro, no queremos que salte.
      drag.calce = null; G.prev.innerHTML = '';
      if (calceOn && !finoOn(ev)) {
        var pw = partirParedes(drag.refs);
        if (pw.mv.length && pw.mv.length <= 140 && pw.fj.length) {
          var cc = calcePropuesta(pw.mv, pw.fj,
            { abMov: aberturasDe(pw.mv), abFij: aberturasDe(pw.fj) });
          if (cc) {
            drag.calce = cc;
            var gg = 3 / view.z;
            G.prev.innerHTML = '<g class="preview">' +
              '<line x1="' + cc.wr.x1 + '" y1="' + cc.wr.y1 + '" x2="' + cc.wr.x2 + '" y2="' + cc.wr.y2 +
              '" stroke="#12b886" stroke-width="' + gg + '" stroke-linecap="round" opacity="0.85"/>' +
              '<line x1="' + cc.wm.x1 + '" y1="' + cc.wm.y1 + '" x2="' + cc.wm.x2 + '" y2="' + cc.wm.y2 +
              '" stroke="#12b886" stroke-width="' + (gg * 0.7) + '" stroke-dasharray="' + (gg * 3) + ' ' + (gg * 2) + '"/>' +
              '</g>';
            setHint('🧲 Calza aquí — suelta y se pega exacta (' + fmtFtIn(cc.solape) +
              ' de pared en común' + (Math.abs(cc.deg) >= 0.1 ? ', endereza ' + Math.abs(cc.deg).toFixed(1) + '°' : '') +
              ') · Alt para apagar el imán');
          }
        }
      }
      renderWalls(); renderAreas(); renderSymbols(); renderAnnot(); renderSel();
      return;
    }
    if (drag.mode === 'rotate') {
      drag.moved = true;
      var a1 = Math.atan2(p[1] - drag.cy, p[0] - drag.cx) * 180 / Math.PI;
      var deg = a1 - drag.a0;
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      // a donde queda el angulo dominante de la pieza si giro esto
      // 🐢 GIRO FINO con Alt (Edgar, 08/30: "que lo pueda girar suave, como
      // cuando alargamos una linea con Alt"): el angulo avanza a un 15% de lo
      // que corre la mano, se apaga el iman de los 90 grados y se cuantiza a
      // 1/4 de grado. Sin Alt, el giro de siempre — de grado en grado y
      // cuadrandose solo cerca de recto.
      var fino = finoOn(ev);
      if (fino) {
        deg = Math.round(deg * FINO * 4) / 4;
        var ahF = (drag.a0 + deg) * Math.PI / 180;
        drag.hx = drag.cx + Math.cos(ahF) * drag.R;
        drag.hy = drag.cy + Math.sin(ahF) * drag.R;
        restoreItems(drag.items);
        rotateRefs(drag.refs, deg, drag.cx, drag.cy);
        renderWalls(); renderAreas(); renderSymbols(); renderAnnot(); renderSel();
        setHint('🐢 ' + deg.toFixed(2) + '° — giro fino (Alt): suelta Alt para el giro normal con imán a recto');
        return;
      }
      var res = drag.base + deg;
      res = ((res % 90) + 135) % 90 - 45;          // -45..45
      var recto = Math.abs(res) < 4;
      if (recto) deg -= res;                        // se cuadra sola
      else deg = Math.round(deg);
      var ah = (drag.a0 + deg) * Math.PI / 180;
      drag.hx = drag.cx + Math.cos(ah) * drag.R;
      drag.hy = drag.cy + Math.sin(ah) * drag.R;
      restoreItems(drag.items);
      rotateRefs(drag.refs, deg, drag.cx, drag.cy);
      renderWalls(); renderAreas(); renderSymbols(); renderAnnot(); renderSel();
      setHint('↻ ' + deg.toFixed(1) + '°' + (recto ? ' — recto ✓ (se cuadró sola)' : ' — suéltalo cerca de recto y se cuadra'));
      return;
    }
    if (drag.mode === 'pan') {
      view.tx = drag.tx + (ev.clientX - drag.sx);
      view.ty = drag.ty + (ev.clientY - drag.sy);
      applyView(); return;
    }
    if (drag.mode === 'endpoint') {
      // Alt = fino: sin imán y a paso corto; sin Alt, el imán de siempre
      var np = finoOn(ev) ? finoPt(ev, drag.start, drag.ox, drag.oy, p) : snapWallPt(p);
      // con SHIFT (o el botón ∟ 90°) la pared no se puede inclinar: queda
      // recta respecto al extremo que se queda quieto
      var anc = drag.end === 1 ? [drag.wall.x2, drag.wall.y2] : [drag.wall.x1, drag.wall.y1];
      if (wantOrtho(ev)) np = orthoLock(anc, np);
      if (drag.end === 1) { drag.wall.x1 = np[0]; drag.wall.y1 = np[1]; }
      else { drag.wall.x2 = np[0]; drag.wall.y2 = np[1]; }
      drag.moved = true;
      var eLen = fmtFtIn(Math.hypot(drag.wall.x2 - drag.wall.x1, drag.wall.y2 - drag.wall.y1));
      if (finoOn(ev)) setHint('🐢 Fino (Alt) · largo ' + eLen + (wantOrtho(ev) ? ' · ∟ recto' : ''));
      else if (wantOrtho(ev)) setHint('∟ Shift: pared recta · ' + eLen);
      renderWalls(); renderSel(); return;
    }
    if (drag.mode === 'dimEnd') {
      var od = drag.dim;
      var anchor = drag.end === 1 ? [od.x2, od.y2] : [od.x1, od.y1];
      // Alt = fino (paso corto, sin enderezar solo)
      var praw = finoOn(ev) ? finoPt(ev, drag.start, drag.ox, drag.oy, p) : p;
      // se endereza solo si va casi recto; con SHIFT el candado es total
      var dp = wantOrtho(ev) ? orthoLock(anchor, praw) : (finoOn(ev) ? praw : orthoSnap(anchor, praw));
      if (drag.end === 1) { od.x1 = dp[0]; od.y1 = dp[1]; }
      else { od.x2 = dp[0]; od.y2 = dp[1]; }
      drag.moved = true;
      renderAnnot(); renderSel(); return;
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
    if (drag.mode === 'areaVtx') {
      var ea = drag.e, ia = drag.i, na = ea.pts.length;
      // Alt = paso fino, igual que al estirar una pared
      var pv = finoOn(ev) ? finoPt(ev, drag.start, drag.ox, drag.oy, p) : p;
      // las dos puntas vecinas (en una polilinea abierta los extremos solo
      // tienen una, y entonces no hay esquina que poner en escuadra)
      var Aq = (ia > 0) ? ea.pts[ia - 1] : (ea.open ? null : ea.pts[na - 1]);
      var Bq = (ia < na - 1) ? ea.pts[ia + 1] : (ea.open ? null : ea.pts[0]);
      var P90 = punto90(Aq, Bq, pv);
      var marca = '';
      if (P90) {
        var cerca = Math.hypot(pv[0] - P90[0], pv[1] - P90[1]) < PX(10);
        // SHIFT = llevame ahi exacto. Si no, el iman solo agarra si estan
        // encendidos: la marca es referencia, no obligacion (Edgar, 08/30:
        // "quiero que sea solo para que me senales, no que me obligues")
        if ((ev && ev.shiftKey) || (cerca && imanesOn)) pv = P90;
        var rr90 = PX(8), pegado = Math.hypot(pv[0] - P90[0], pv[1] - P90[1]) < 0.4;
        marca = '<circle cx="' + P90[0] + '" cy="' + P90[1] + '" r="' + rr90 + '" fill="' +
          (pegado ? 'rgba(22,163,74,.30)' : 'rgba(255,255,255,.75)') + '" stroke="#16a34a" stroke-width="' +
          PX(pegado ? 2.4 : 1.9) + '"/>';
        if (pegado) {
          // escuadrita en la punta: la senal de que la esquina ya mide 90 exactos
          var la = Math.hypot(Aq[0] - P90[0], Aq[1] - P90[1]) || 1, lb = Math.hypot(Bq[0] - P90[0], Bq[1] - P90[1]) || 1;
          var e1x = (Aq[0] - P90[0]) / la, e1y = (Aq[1] - P90[1]) / la;
          var e2x = (Bq[0] - P90[0]) / lb, e2y = (Bq[1] - P90[1]) / lb;
          var ll = PX(11);
          marca += '<path d="M' + (P90[0] + e1x * ll) + ',' + (P90[1] + e1y * ll) +
            ' L' + (P90[0] + (e1x + e2x) * ll) + ',' + (P90[1] + (e1y + e2y) * ll) +
            ' L' + (P90[0] + e2x * ll) + ',' + (P90[1] + e2y * ll) +
            '" fill="none" stroke="#16a34a" stroke-width="' + PX(1.4) + '"/>';
        } else {
          marca += '<line x1="' + pv[0] + '" y1="' + pv[1] + '" x2="' + P90[0] + '" y2="' + P90[1] +
            '" stroke="#16a34a" stroke-width="' + PX(1) + '" stroke-dasharray="' + PX(3) + ' ' + PX(3) + '"/>';
        }
      }
      ea.pts[ia] = [+pv[0].toFixed(2), +pv[1].toFixed(2)];
      G.prev.innerHTML = marca;
      drag.moved = true;
      if (Aq && Bq) {
        var an90 = angEn(Aq, ea.pts[ia], Bq);
        setHint('Punta ' + (ia + 1) + '/' + na + ' · esquina ' + an90.toFixed(1) + '°' +
          (Math.abs(an90 - 90) < 0.15 ? ' ✓ escuadra' : ' — el círculo verde es donde queda a 90° (SHIFT lo lleva exacto)'));
      }
      renderAreas(); renderSel(); return;
    }
    if (drag.mode === 'symResize') {
      var e4 = drag.e, d4 = SYMBOLS[e4.key], k4 = symK(d4);
      var r4 = (e4.rot || 0) * Math.PI / 180, c4 = Math.cos(r4), s4 = Math.sin(r4);
      var vx = p[0] - drag.opp[0], vy = p[1] - drag.opp[1];
      // la diagonal, vista en el marco local del objeto (rotación incluida)
      var lw = vx * c4 + vy * s4, lh = -vx * s4 + vy * c4;
      var W4 = Math.max(6, Math.round(Math.abs(lw)));
      var H4 = Math.max(6, Math.round(Math.abs(lh)));
      // SHIFT: el objeto no pierde su forma (Edgar, 08/30 — el sink y el
      // dishwasher se achataban al jalar la esquina). Se conserva la
      // proporcion que TENIA al empezar a estirar, no la de fabrica: si ya
      // lo habias ajustado a tu gusto, ese gusto se respeta. Va con Shift a
      // secas, no con ∟90°, porque en el iPad ORTHO esta siempre encendido
      // y entonces nunca podrias deformar a proposito.
      var propOn = !!(ev && ev.shiftKey);
      if (propOn) {
        var prop4 = drag.prop || (d4.w / d4.h) || 1;
        var lado = Math.max(W4, H4 * prop4);
        W4 = Math.max(6, Math.round(lado));
        H4 = Math.max(6, Math.round(lado / prop4));
        // el vector diagonal se recalcula con la medida ya corregida
        var lwA = (lw < 0 ? -1 : 1) * W4, lhA = (lh < 0 ? -1 : 1) * H4;
        vx = lwA * c4 - lhA * s4;
        vy = lwA * s4 + lhA * c4;
      }
      e4.sx = W4 / (d4.w * (e4.scale || 1) * k4);
      e4.sy = H4 / (d4.h * (e4.scale || 1) * k4);
      e4.x = drag.opp[0] + vx / 2;
      e4.y = drag.opp[1] + vy / 2;
      drag.moved = true;
      setHint('↔ ' + fmtFtIn(W4) + ' × ' + fmtFtIn(H4) +
        (propOn ? ' — 🔒 Shift: conserva la forma' : ' — Shift para no deformarlo'));
      refresh(); renderSel();
      return;
    }
    if (drag.mode === 'move') {
      var dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      if (Math.hypot(dx, dy) < 2 / view.z) return;
      if (finoOn(ev)) { dx *= FINO; dy *= FINO; setHint('🐢 Fino (Alt): se mueve poquito a poquito'); }
      // con SHIFT (o ∟ 90°) la pieza se corre en línea recta: o de lado
      // o de arriba abajo, nunca en diagonal
      if (wantOrtho(ev)) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
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
        // arrastrar la medida la MUEVE completa (como Bluebeam);
        // los extremos se estiran con sus asas
        var mdx = Math.round(dx), mdy = Math.round(dy);
        e.x1 = o.x1 + mdx; e.y1 = o.y1 + mdy;
        e.x2 = o.x2 + mdx; e.y2 = o.y2 + mdy;
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
      if (drag.cur && Math.hypot(drag.cur[0] - drag.start[0], drag.cur[1] - drag.start[1]) > marcoMin()) {
        var g = marqueeCollect(drag.start, drag.cur);
        selGroup = g.length ? g : null;
        sel = null;
        renderSel(); showProps();
        if (selGroup) setHint(selGroup.length + ' elemento(s) seleccionados — arrastra cualquiera para mover el grupo · Supr para borrar');
      }
      drag = null;
      return;
    }
    if (drag.mode === 'rotate' && drag.moved) {
      pushUndo(drag.snap);
      // el circulito vuelve a su sitio sobre la caja ya girada
      drag.hx = null; renderSel();
      refreshCounts(); showProps();
    }
    if (drag.mode === 'groupmove' && drag.moved) {
      G.prev.innerHTML = '';
      if (drag.calce) {
        aplicarCalce(drag.refs, drag.calce);
        setHint('🧲 Calzada — ' + fmtFtIn(drag.calce.solape) + ' de pared en común. Ahora 🧲 Soldar une las dos en una sola.');
        refresh();
      }
      pushUndo(drag.snap);
      refreshCounts();
    }
    if (drag.mode === 'areaVtx') G.prev.innerHTML = '';
    if ((drag.mode === 'move' || drag.mode === 'endpoint' || drag.mode === 'openJamb' || drag.mode === 'dimEnd' || drag.mode === 'symResize' || drag.mode === 'areaVtx') && drag.moved) {
      pushUndo(drag.snap);
      refreshCounts(); showProps();
    }
    drag = null;
  }

  /* --- paredes --- */
  // CON EL DEDO NO HAY "MOVER ANTES DE TOCAR". Se usaba drawing.cursor — el
  // punto que dejó la ÚLTIMA vista previa — así que en una tableta cada pared
  // salía UNA PULSACIÓN TARDE (y con un toque perfectamente quieto, que no
  // manda ningún move, no salía nada). El punto bueno ya se calcula aquí: np.
  // Se le aplica el mismo ortho que usa la vista previa, así el ratón se
  // comporta exactamente igual que antes.
  function wallDown(p, ev) {
    var np = snapWallPt(p);
    if (!drawing) { drawing = { mode: 'wallchain', last: np, cursor: np }; return; }
    var b = wantOrtho(ev) ? orthoLock(drawing.last, np) : orthoSnap(drawing.last, np);
    if (Math.hypot(b[0] - drawing.last[0], b[1] - drawing.last[1]) > 2) {
      pushUndo();
      var wt = $('#wallType').value;
      var wNueva = { id: uid(), x1: drawing.last[0], y1: drawing.last[1], x2: b[0], y2: b[1], type: wt, t: WALL_TYPES[wt].t };
      if (absorbeEnBloque(wNueva)) {
        drawing.last = b; drawing.cursor = b;
        G.prev.innerHTML = '';
        refreshCounts();
        return;
      }
      recortaPuntas(wNueva);
      state.walls.push(wNueva);
      ajustaVecinas(wNueva);
      // en cuanto la vuelta cierra, el forro del bloque salta solo al interior
      orientaDrySide();
      // la cadena sigue desde el extremo REAL de la pared que quedó dibujada,
      // no desde el punto sin corregir: si no, el tramo de cierre se engancha a
      // una punta enterrada y arrastra el error hasta el final de la vuelta
      drawing.last = [wNueva.x2, wNueva.y2];
      drawing.cursor = drawing.last;
      G.prev.innerHTML = '';
      renderWalls(); refreshCounts();
    }
  }
  function finishWallChain() {
    drawing = null; G.prev.innerHTML = '';
    // al cerrar la vuelta, el forro del bloque salta solo al INTERIOR (dibujar
    // el perímetro al revés lo dejaba todo por fuera de la casa)
    orientaDrySide(); renderWalls();
  }

  /* --- superficies / techos --- */
  function areaDown(p) {
    // CERRAR TOCANDO EL PRIMER PUNTO (Edgar, 08/30: "no me dejaba cerrar las
    // líneas y se veía como despegado"). Es lo que hace cualquier CAD: el
    // primer vértice tiene su propio imán, siempre, aunque los demás estén
    // apagados — cerrar exacto no puede depender de la puntería.
    if (drawing && drawing.pts && drawing.pts.length >= 2) {
      var p0 = drawing.pts[0];
      if (Math.hypot(p[0] - p0[0], p[1] - p0[1]) < 14 / (view.z || 1)) {
        finishAreaChain(true);           // true = cerrado en el primer punto
        return;
      }
    }
    // el punto que se guarda es el YA GUIADO (el que se ve en la vista previa),
    // no el crudo del cursor: si no, el clic caía un pelo fuera de la guía
    var np = (drawing && drawing.cursor) ? drawing.cursor : snapWallPt(p);
    if (!drawing) {
      // el primer punto también respeta la guía que se estaba viendo
      var p0 = puntoGuiado || snapWallPt(p);
      puntoGuiado = null;
      drawing = { mode: 'areachain', pts: [p0] };
      return;
    }
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
    // POLÍGONOS REGULARES (Edgar, 08/30: "ponme la opción de crear polígonos
    // no solo rectángulos y círculos"). Se dibujan inscritos en la caja que
    // arrastras, con la punta arriba, y con la esquina superior izquierda.
    var mp = /^poly(\d+)$/.exec(kind);
    if (mp) {
      var n = parseInt(mp[1], 10);
      var cxp = (a[0] + b[0]) / 2, cyp = (a[1] + b[1]) / 2;
      var rxp = Math.abs(b[0] - a[0]) / 2 || 1, ryp = Math.abs(b[1] - a[1]) / 2 || 1;
      var out = [];
      for (var k3 = 0; k3 < n; k3++) {
        var an3 = -Math.PI / 2 + (k3 / n) * Math.PI * 2;   // punta arriba
        out.push([+(cxp + rxp * Math.cos(an3)).toFixed(2), +(cyp + ryp * Math.sin(an3)).toFixed(2)]);
      }
      return out;
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
    // la herramienta Rect dibuja la forma elegida en su menu (rect o poligono)
    if (kind === 'rect') kind = curShapeKind || 'rect';
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

  function finishAreaChain(cerrado) {
    if (!drawing || drawing.mode !== 'areachain') return;
    var pts = drawing.pts;
    var isLine = tool === 'pline' && !cerrado;   // cerrar en el 1er punto = polígono
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
    if (isLine) { e.open = true; if (curLineStyle !== 'solid') e.lineStyle = curLineStyle; }
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
    // el ancho SIEMPRE sale de lo que se ve en la barra: si el selector marca
    // una medida, esa manda; 'auto' usa la de fábrica del tipo. Antes el
    // tamaño elegido en el menú se quedaba pegado invisible y todas las
    // puertas salían iguales sin que nada lo dijera (Edgar, 08/30).
    var selW = 0;
    try { selW = parseInt(($('#doorSize') || {}).value, 10) || 0; } catch (e0) {}
    // el ancho elegido vale para la puerta sencilla Y para el garage (16'/9'/
    // 6' golf cart): antes solo miraba 'door', asi que los garages chicos
    // colocaban siempre el porton de 16 pies (auditoria 08/30)
    var g = wallGeom(near.wall), ajust = false;
    // de donde sale el ancho, por orden: el selector visible manda en la
    // puerta sencilla; el menu de la flechita manda en los demas tipos (ahi
    // viven los garages de 16', 9' y 6' golf cart); si no, el de fabrica
    var w = OPEN_DEFAULT[type];
    if (type === 'door' && selW) w = selW;
    else if (type === curDoorType && curDoorW) w = curDoorW;
    // pared corta (las de ángulo del escaneo lo son casi siempre): en vez de
    // negarse, la abertura se achica a lo que cabe — luego se afina el Ancho
    if (g.len < w + 4) {
      if (g.len < 20) { setHint('Esa pared mide ' + fmtFtIn(g.len) + ' — muy corta hasta para una abertura'); return; }
      w = Math.round(g.len - 4); ajust = true;
    }
    var d = Math.max(w / 2 + 1, Math.min(g.len - w / 2 - 1, near.t * g.len));
    pushUndo();
    var o = { id: uid(), wallId: near.wall.id, type: type, pos: Math.round(d), w: w, swing: 1, hinge: 0 };
    state.openings.push(o);
    sel = { kind: 'opening', id: o.id };
    refresh();
    var incl = Math.abs(Math.atan2(near.wall.y2 - near.wall.y1, near.wall.x2 - near.wall.x1) * 180 / Math.PI) % 90;
    if (ajust) setHint('↔ ' + OPEN_NAMES[type] + ' ajustada a ' + fmtFtIn(w) + ' (la pared mide ' + fmtFtIn(g.len) + ') — cambia el Ancho en Propiedades');
    else if (incl > 3 && incl < 87) setHint(OPEN_NAMES[type] + ' de ' + fmtFtIn(w) + ' en pared inclinada — arrástrala para moverla, o ajusta Ancho y Abatimiento');
  }

  /* --- medir / cotas / calibrar --- */
  function twoPointDown(p, kind) {
    if (kind === 'calibrate' && !state.bg) { setHint('Primero importa un plano de fondo (botón "Fondo")'); return; }
    if (!drawing) { drawing = { mode: 'twopoint', kind: kind, a: p }; return; }
    var a = drawing.a; drawing = null; G.prev.innerHTML = '';
    var len = Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (len < 1) return;
    if (kind === 'measure') {
      // la medida queda como objeto real: seleccionable, movible y guardada
      pushUndo();
      var dm = { id: uid(), x1: a[0], y1: a[1], x2: p[0], y2: p[1], off: 14, meas: true };
      state.dims.push(dm);
      sel = { kind: 'dim', id: dm.id };
      refresh();
      setHint('Distancia: ' + fmtFtIn(len) + ' — quedó en el plano · clic para medir otra vez · Delete la borra');
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
      // AL BUSCAR se mira TODA la biblioteca, no solo la pestaña abierta:
      // escribir "torre" estando en Electrical no encontraba nada, y el
      // usuario no tiene por qué saber en qué pestaña vive cada símbolo
      : (q ? Object.keys(SYMBOLS)
           : Object.keys(SYMBOLS).filter(function (k) { return SYMBOLS[k].cat === activeCat; }));
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

  // girar la pieza seleccionada completa (para armar el rompecabezas):
  // paredes, textos, cotas, areas y simbolos rotan alrededor del centro
  // del grupo; las aberturas viajan solas con su pared
  // caja y centro de una selección (para girar y para las asas)
  function refsBBox(refs) {
    var xs = [], ys = [];
    (refs || []).forEach(function (r) {
      var e = entityOf(r);
      if (!e) return;
      if (e.pts) e.pts.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); });
      else if (e.x1 != null) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
      else if (e.x != null) { xs.push(e.x); ys.push(e.y); }
    });
    if (!xs.length) return null;
    var x1 = Math.min.apply(null, xs), x2 = Math.max.apply(null, xs);
    var y1 = Math.min.apply(null, ys), y2 = Math.max.apply(null, ys);
    return { x1: x1, y1: y1, x2: x2, y2: y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  }
  // ángulo dominante de la selección: cuánto hay que girarla para dejarla
  // RECTA. OJO: no vale promediar todo — un cuarto real trae paredes a 45°
  // (nichos, esquinas cortadas) y el promedio se iría al medio de las dos
  // familias. Se busca el PICO (la familia con más metros de pared) y solo
  // se promedia esa.
  function refsAngle(refs) {
    var segs = [];
    (refs || []).forEach(function (r) {
      var e = entityOf(r);
      if (!e) return;
      var raw = [];
      if (e.x1 != null) raw.push([e.x1, e.y1, e.x2, e.y2]);
      else if (e.pts) for (var i = 0; i < e.pts.length; i++) {
        var q = e.pts[(i + 1) % e.pts.length];
        raw.push([e.pts[i][0], e.pts[i][1], q[0], q[1]]);
      }
      raw.forEach(function (g) {
        var dx = g[2] - g[0], dy = g[3] - g[1], L = Math.hypot(dx, dy);
        if (L < 6) return;
        var a = Math.atan2(dy, dx) * 180 / Math.PI;
        segs.push([((a % 90) + 90) % 90, L]);          // 0..90
      });
    });
    if (!segs.length) return 0;
    // histograma de 1° con ventana de ±4° (una familia no se parte en dos)
    var bins = [], i2;
    for (i2 = 0; i2 < 90; i2++) bins[i2] = 0;
    segs.forEach(function (g) { bins[Math.floor(g[0]) % 90] += g[1]; });
    var best = 0, bestV = -1;
    for (i2 = 0; i2 < 90; i2++) {
      var v = 0;
      for (var k = -4; k <= 4; k++) v += bins[(i2 + k + 90) % 90];
      if (v > bestV) { bestV = v; best = i2; }
    }
    // media circular SOLO de la familia dominante (±10° del pico)
    var sinS = 0, cosS = 0;
    segs.forEach(function (g) {
      var d = g[0] - best;
      while (d > 45) d -= 90;
      while (d < -45) d += 90;
      if (Math.abs(d) > 10) return;
      var a4 = g[0] * 4 * Math.PI / 180;
      sinS += Math.sin(a4) * g[1]; cosS += Math.cos(a4) * g[1];
    });
    if (!sinS && !cosS) return 0;
    return Math.atan2(sinS, cosS) / 4 * 180 / Math.PI;   // grados, −45..45
  }
  function rotateRefs(refs, deg, cx0, cy0) {
    var rad = deg * Math.PI / 180, cr = Math.cos(rad), sr = Math.sin(rad);
    var bb = refsBBox(refs);
    if (!bb) return;
    var cx = cx0 == null ? bb.cx : cx0;
    var cy = cy0 == null ? bb.cy : cy0;
    function rot(x, y) {
      var ox = x - cx, oy = y - cy;
      return [Math.round(cx + ox * cr - oy * sr), Math.round(cy + ox * sr + oy * cr)];
    }
    refs.forEach(function (r) {
      var e = entityOf(r);
      if (!e) return;
      if (e.pts) e.pts = e.pts.map(function (q) { return rot(q[0], q[1]); });
      else if (e.x1 != null) {
        var a = rot(e.x1, e.y1), b = rot(e.x2, e.y2);
        e.x1 = a[0]; e.y1 = a[1]; e.x2 = b[0]; e.y2 = b[1];
      } else if (e.x != null) {
        var p = rot(e.x, e.y);
        e.x = p[0]; e.y = p[1];
        if (e.tx != null) { var t2 = rot(e.tx, e.ty); e.tx = t2[0]; e.ty = t2[1]; }
        if (r.kind === 'symbol') e.rot = (((e.rot || 0) + deg) % 360 + 360) % 360;
      }
    });
  }
  // 🔵 ASA DE GIRO: el circulito que sale ARRIBA de lo seleccionado.
  // Se agarra con el mouse y se arrastra: la pieza gira en vivo y se
  // endereza sola cuando queda casi a escuadra (sin botones de grados).
  function rotHandleOf(refs) {
    var bb = refsBBox(refs);
    if (!bb) return null;
    var d = 34 / view.z + 10;
    return { x: bb.cx, y: bb.y1 - d, cx: bb.cx, cy: (bb.y1 + bb.y2) / 2, top: bb.y1 };
  }
  function rotHandleMarkup(refs) {
    var H = rotHandleOf(refs);
    if (!H) return '';
    // mientras se gira, el circulito sigue al dedo (no salta con la caja)
    if (drag && drag.mode === 'rotate' && drag.hx != null) { H.x = drag.hx; H.y = drag.hy; H.top = drag.cy; }
    var r = (document.body.classList.contains('touch') ? 11 : 7) / view.z + 2;
    return '<line x1="' + H.x + '" y1="' + H.top + '" x2="' + H.x + '" y2="' + H.y +
      '" stroke="#0b84ff" stroke-width="' + (1 / view.z) + '" stroke-dasharray="' + (3 / view.z) + ' ' + (2 / view.z) + '"/>' +
      '<circle class="handle" data-rot="1" cx="' + H.x + '" cy="' + H.y + '" r="' + r + '" fill="#0b84ff" fill-opacity="0.35"/>';
  }
  function restoreItems(items) {
    items.forEach(function (it) {
      var e = it.e, o = it.orig;
      if (!e) return;
      if (o.pts) e.pts = o.pts.map(function (q) { return [q[0], q[1]]; });
      if (o.x1 != null) { e.x1 = o.x1; e.y1 = o.y1; e.x2 = o.x2; e.y2 = o.y2; }
      if (o.x != null) { e.x = o.x; e.y = o.y; }
      if (o.tx != null) { e.tx = o.tx; e.ty = o.ty; }
      if (o.rot != null) e.rot = o.rot;
    });
  }
  // arranca el arrastre de giro si el clic cayo sobre el circulito
  function tryRotateGrab(p, refs) {
    var H = rotHandleOf(refs);
    if (!H) return false;
    var rr = (document.body.classList.contains('touch') ? 16 : 11) / view.z + 4;
    if (Math.hypot(p[0] - H.x, p[1] - H.y) > rr) return false;
    drag = {
      mode: 'rotate', refs: refs, cx: H.cx, cy: H.cy,
      a0: Math.atan2(p[1] - H.cy, p[0] - H.cx) * 180 / Math.PI,
      R: Math.max(20, Math.hypot(H.x - H.cx, H.y - H.cy)),
      base: refsAngle(refs), snap: snapshot(), moved: false,
      items: refs.map(function (r) { return { ref: r, e: entityOf(r), orig: JSON.parse(JSON.stringify(entityOf(r))) }; })
    };
    return true;
  }
  // ⬅➡⬆⬇ EMPUJONCITO: mueve la selección una medida EXACTA con las flechas
  function moveRefs(refs, dx, dy) {
    (refs || []).forEach(function (r) {
      var e = entityOf(r);
      if (!e) return;
      if (r.kind === 'opening') {
        var w = state.walls.find(function (x) { return x.id === e.wallId; });
        if (!w) return;
        var g = wallGeom(w);
        var t = (dx * (w.x2 - w.x1) + dy * (w.y2 - w.y1)) / (g.len || 1);
        e.pos = Math.max(e.w / 2, Math.min(g.len - e.w / 2, e.pos + t));
        return;
      }
      if (e.pts) e.pts = e.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
      else if (e.x1 != null) { e.x1 += dx; e.y1 += dy; e.x2 += dx; e.y2 += dy; }
      else if (e.x != null) {
        e.x += dx; e.y += dy;
        if (e.tx != null) { e.tx += dx; e.ty += dy; }
      }
    });
  }
  function nudgeSel(dx, dy, step) {
    var refs = selGroup || (sel ? [sel] : null);
    if (!refs || !refs.length) return false;
    pushUndo();
    moveRefs(refs, dx * step, dy * step);
    refresh(); renderSel();
    setHint('⬌ Movido ' + fmtFtIn(step) + ' — flechas = 1" · Shift+flecha = 1 pie · Alt+flecha = 1/4"');
    return true;
  }
  function rotateGroup(deg) {
    if (!selGroup) return;
    pushUndo();
    rotateRefs(selGroup, deg);
    refresh(); renderSel();
    setHint('↻ Pieza girada ' + deg + '° — arrastrala a su sitio y 🧲 Soldar armado');
  }
  // 📐 ENDEREZAR: gira la selección lo justo para que sus paredes queden
  // rectas (horizontales/verticales) — un toque y el cuarto sale derecho
  function straightenRefs(refs) {
    var a = refsAngle(refs);
    if (Math.abs(a) < 0.05) { setHint('📐 Ya está recto'); return; }
    pushUndo();
    rotateRefs(refs, -a);
    refresh(); renderSel();
    setHint('📐 Enderezado ' + (-a).toFixed(1) + '° — ya está a escuadra');
  }

  /* ══════════ CALCE: armar el rompecabezas pieza por pieza ══════════
     Cada cuarto se escanea suelto, así que llegan 13 piezas sueltas y hay
     que armarlas. Lo que estaba DISEÑADO para armarlas solas no funciona,
     y está medido con los 13 escaneos de Caroline (28/08):

       · BRÚJULA — se captura un rumbo por cuarto. Si sirviera, girando cada
         pieza por su rumbo todas apuntarían al mismo norte. Medido:
         concentración R = 0.257 (1 = perfecto, 0 = azar) y desviaciones de
         hasta ±44°. Dentro de una casa el magnetómetro se lo comen el
         refuerzo, los electrodomésticos y el cableado. NO SIRVE para orientar.

       · ANCHO DE PUERTA — la idea era emparejar aberturas del mismo ancho.
         Medido: de 49 aberturas, 30 miden entre 29" y 32". 109 de los 136
         pares de cuartos posibles tienen "candidato". NO IDENTIFICA nada.

     Lo que SÍ es información fiable es la que pone Edgar: él sabe qué cuarto
     va pegado a cuál, porque caminó la casa. Lo que la máquina puede aportar
     es la EXACTITUD: él acerca la pieza a ojo y ella la deja pegada perfecta
     — paralela, a ras y alineada. Imán de verdad, no adivinanza.

     calcePropuesta(mov, fij, opts) → el giro y el corrimiento que dejan una
     pared de la pieza que se mueve pegada a una pared de las ya puestas.
     Sin estado: se puede probar sola. */
  function _cpDir(w) {
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
    return { ux: dx / L, uy: dy / L, L: L, mx: (w.x1 + w.x2) / 2, my: (w.y1 + w.y2) / 2 };
  }
  // piezas de un conjunto: paredes que se tocan entre sí (punta con punta)
  function _cpPiezas(W, tol) {
    tol = tol || 18;
    var pad = W.map(function () { return -1; }), np = 0;
    function toca(a, b) {
      var pa = [[a.x1, a.y1], [a.x2, a.y2]], pb = [[b.x1, b.y1], [b.x2, b.y2]];
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++)
        if (Math.hypot(pa[i][0] - pb[j][0], pa[i][1] - pb[j][1]) < tol) return true;
      return false;
    }
    for (var i = 0; i < W.length; i++) {
      if (pad[i] >= 0) continue;
      var id = np++, pila = [i]; pad[i] = id;
      while (pila.length) {
        var k = pila.pop();
        for (var j = 0; j < W.length; j++)
          if (pad[j] < 0 && toca(W[k], W[j])) { pad[j] = id; pila.push(j); }
      }
    }
    return { pad: pad, n: np };
  }
  // distancia más corta entre dos paredes (segmento a segmento)
  function segDist(a, b) {
    function pt2seg(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      var t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
    return Math.min(
      pt2seg(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2), pt2seg(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2),
      pt2seg(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2), pt2seg(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2));
  }
  // centros en el mundo de las aberturas que viven en estas paredes
  function aberturasDe(walls) {
    var ids = {};
    walls.forEach(function (w) { ids[w.id] = w; });
    var out = [];
    state.openings.forEach(function (o) {
      var w = ids[o.wallId];
      if (!w) return;
      var L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      var t = o.pos / L;
      out.push({ x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t, w: o.w, wid: o.wallId });
    });
    return out;
  }
  function calcePropuesta(mov, fij, opts) {
    opts = opts || {};
    var MAXROT = opts.maxRot == null ? 15 : opts.maxRot;   // giro que se permite
    var SNAP = opts.snap == null ? 36 : opts.snap;         // acercamiento máximo
    var MINL = opts.minL == null ? 30 : opts.minL;         // paredes cortas no calzan
    if (!mov || !mov.length || !fij || !fij.length) return null;
    var M = mov.filter(function (w) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= MINL; });
    var F = fij.filter(function (w) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= MINL; });
    if (!M.length || !F.length) return null;
    // centro de la pieza que se mueve (se gira alrededor de él)
    var cx = 0, cy = 0, tl = 0;
    mov.forEach(function (w) {
      var d = _cpDir(w); cx += d.mx * d.L; cy += d.my * d.L; tl += d.L;
    });
    if (!tl) return null;
    cx /= tl; cy /= tl;
    // centro de la pieza fija a la que pertenece cada pared quieta
    var pz = _cpPiezas(fij), cent = [];
    for (var q = 0; q < pz.n; q++) cent.push({ x: 0, y: 0, L: 0 });
    fij.forEach(function (w, i) {
      var d = _cpDir(w), c = cent[pz.pad[i]];
      c.x += d.mx * d.L; c.y += d.my * d.L; c.L += d.L;
    });
    cent.forEach(function (c) { if (c.L) { c.x /= c.L; c.y /= c.L; } });
    var idxF = {}; fij.forEach(function (w, i) { idxF[w.id != null ? w.id : i] = i; });
    var best = null;
    M.forEach(function (wm) {
      var dm = _cpDir(wm);
      var am = Math.atan2(dm.uy, dm.ux) * 180 / Math.PI;
      F.forEach(function (wr, fi) {
        var dr = _cpDir(wr);
        var ar = Math.atan2(dr.uy, dr.ux) * 180 / Math.PI;
        // dos formas de quedar paralelas: misma dirección o al revés
        [0, 180].forEach(function (flip) {
          var rot = ar + flip - am;
          while (rot > 180) rot -= 360;
          while (rot < -180) rot += 360;
          if (Math.abs(rot) > MAXROT) return;
          var rad = rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
          function gir(x, y) {
            var ox = x - cx, oy = y - cy;
            return [cx + ox * co - oy * si, cy + ox * si + oy * co];
          }
          var pm = gir(dm.mx, dm.my);
          // perpendicular a la pared quieta
          var nx = -dr.uy, ny = dr.ux;
          var vx = dr.mx - pm[0], vy = dr.my - pm[1];
          var t = vx * nx + vy * ny;                 // lo que hay que acercar
          if (Math.abs(t) > SNAP) return;
          var s0 = vx * dr.ux + vy * dr.uy;          // corrimiento a lo largo
          // opciones a lo largo: quedarse donde está, o alinear puntas
          var pa = gir(wm.x1, wm.y1), pb = gir(wm.x2, wm.y2);
          var proj = function (p) { return (p[0] - dr.mx) * dr.ux + (p[1] - dr.my) * dr.uy; };
          var m1 = Math.min(proj(pa), proj(pb)), m2 = Math.max(proj(pa), proj(pb));
          var r1 = -dr.L / 2, r2 = dr.L / 2;
          var alter = [0, r1 - m1, r2 - m2, (r1 + r2) / 2 - (m1 + m2) / 2];
          // 🚪 PUERTA CON PUERTA: si la pared que se mueve trae una puerta y
          // la quieta tiene la suya, probar el corrimiento que las deja UNA
          // SOBRE OTRA. Con el premio de puertas en el puntaje, cuando ese
          // corrimiento encaja, gana — y las puertas quedan casadas exactas.
          if (opts.abMov && opts.abFij) {
            opts.abMov.forEach(function (am) {
              if (am.wid !== wm.id) return;
              var g3 = gir(am.x, am.y);
              var pm2 = (g3[0] - dr.mx) * dr.ux + (g3[1] - dr.my) * dr.uy;
              opts.abFij.forEach(function (af) {
                if (af.wid !== wr.id) return;
                if (Math.abs(am.w - af.w) > 8) return;
                var pf2 = (af.x - dr.mx) * dr.ux + (af.y - dr.my) * dr.uy;
                var sAl = pf2 - pm2;
                if (Math.abs(sAl) <= 36) alter.push(sAl);
              });
            });
          }
          alter.forEach(function (s, si2) {
            if (Math.abs(s) > (si2 >= 4 ? 36 : 24)) return;
            var a1 = m1 + s, a2 = m2 + s;
            var sol = Math.min(a2, r2) - Math.max(a1, r1);   // solape a lo largo
            if (sol < Math.min(24, Math.min(dm.L, dr.L) * 0.4)) return;
            var tx = nx * t + dr.ux * s, ty = ny * t + dr.uy * s;
            // ¿queda la pieza del lado bueno? dos cuartos vecinos van uno a
            // cada lado de la pared que comparten, nunca montados encima
            if (!wr._guia) {
              var cf = cent[pz.pad[fi]];
              var ladoF = (cf.x - dr.mx) * nx + (cf.y - dr.my) * ny;
              var pcm = gir(cx, cy);                  // el centro no se mueve al girar
              var ladoM = (pcm[0] + tx - dr.mx) * nx + (pcm[1] + ty - dr.my) * ny;
              if (Math.abs(ladoF) > 6 && Math.abs(ladoM) > 6 && ladoF * ladoM > 0) return;
            }
            var costo = Math.abs(t) + Math.abs(s) * 0.5 + Math.abs(rot) * 6 - sol * 0.25;
            /* PUERTAS CARA A CARA: la misma puerta vive en las dos piezas
               (cada escaneo trae su copia). Un calce que deja dos puertas
               del mismo ancho una sobre otra es casi seguro EL bueno — vale
               más que cualquier pista geométrica. Medido 28/08: el ancho de
               puerta NO sirve para elegir pareja entre 13 piezas (109 de
               136 pares tienen candidato), pero para DESEMPATAR entre dos
               posiciones de las MISMAS dos piezas es oro. */
            var puertasOK = 0;
            if (opts.abMov && opts.abMov.length && opts.abFij && opts.abFij.length) {
              opts.abMov.forEach(function (am) {
                var g2 = gir(am.x, am.y);
                var gx = g2[0] + tx, gy = g2[1] + ty;
                opts.abFij.forEach(function (af) {
                  if (Math.abs(am.w - af.w) > 8) return;
                  // casada = casada: a 6" o menos. (Con 14" el corrimiento
                  // "centrado" también cobraba el premio con las puertas a
                  // 12" — medido 08/29 — y ganaba al corrimiento exacto.)
                  if (Math.hypot(gx - af.x, gy - af.y) < 6) puertasOK++;
                });
              });
              costo -= Math.min(puertasOK, 2) * 60;
            }
            if (!best || costo < best.costo)
              best = { deg: rot, dx: tx, dy: ty, cx: cx, cy: cy, costo: costo,
                       solape: sol, sep: t, wm: wm, wr: wr, puertas: puertasOK };
          });
        });
      });
    });
    return best;
  }

  /* 🧩 CALZAR de un toque: para cuando la pieza está colocada por encima
     pero todavía lejos. Busca más lejos que el imán del arrastre (hasta 10
     pies) y permite enderezarla hasta 20°. Sigue siendo Edgar quien decide
     DÓNDE va la pieza; esto solo la deja exacta. */
  /* 🔄 CALCE A 4 VIENTOS: la pieza puede venir girada 90/180/270 del
     escaneo. En vez de obligar a Edgar al ↺90 a mano, se prueba el calce
     en las 4 orientaciones y gana la de mejor puntaje (con el bonus de
     puertas cara a cara desempatando). Devuelve {pre, c}: el giro previo
     y el calce fino encontrado desde ahí. */
  function calceCuatro(movWs, fijWs, opts) {
    var cx = 0, cy = 0, tl = 0;
    movWs.forEach(function (w) {
      var L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      cx += (w.x1 + w.x2) / 2 * L; cy += (w.y1 + w.y2) / 2 * L; tl += L;
    });
    if (!tl) return null;
    cx /= tl; cy /= tl;
    var abM = aberturasDe(movWs), abF = aberturasDe(fijWs);
    var mejor = null;
    [0, 90, 180, 270].forEach(function (pre) {
      var rad = pre * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
      function gp(x, y) {
        var ox = x - cx, oy = y - cy;
        return [cx + ox * co - oy * si, cy + ox * si + oy * co];
      }
      var giradas = movWs.map(function (w) {
        var a = gp(w.x1, w.y1), b2 = gp(w.x2, w.y2);
        return { id: w.id, x1: a[0], y1: a[1], x2: b2[0], y2: b2[1] };
      });
      var abG = abM.map(function (o) { var g = gp(o.x, o.y); return { x: g[0], y: g[1], w: o.w, wid: o.wid }; });
      var o2 = {};
      for (var k in (opts || {})) o2[k] = opts[k];
      o2.abMov = abG; o2.abFij = abF;
      var c = calcePropuesta(giradas, fijWs, o2);
      if (c && (!mejor || c.costo < mejor.c.costo)) mejor = { pre: pre, c: c, cx: cx, cy: cy };
    });
    return mejor;
  }

  function calzarSel() {
    if (!selGroup || !selGroup.length) { setHint('Selecciona primero la pieza que quieres calzar'); return; }
    var pw = partirParedes(selGroup);
    if (!pw.mv.length) { setHint('🧩 Lo seleccionado no tiene paredes que calzar'); return; }
    if (!pw.fj.length) { setHint('🧩 No hay ninguna otra pieza puesta con la que calzar'); return; }
    var m4 = calceCuatro(pw.mv, pw.fj, { maxRot: 20, snap: 120 });
    if (!m4) {
      setHint('🧩 No encuentro con qué calzarla. Acércala más a la pieza vecina (a menos de 10 pies) y vuelve a darle.');
      return;
    }
    pushUndo();
    if (m4.pre) rotateRefs(selGroup, m4.pre, m4.cx, m4.cy);
    aplicarCalce(selGroup, m4.c);
    refresh(); renderSel();
    setHint('🧩 Calzada: ' + fmtFtIn(m4.c.solape) + ' de pared en común' +
      (m4.pre ? ', girada ' + m4.pre + '°' : '') +
      (Math.abs(m4.c.deg) >= 0.1 ? ', enderezada ' + Math.abs(m4.c.deg).toFixed(1) + '°' : '') +
      (m4.c.puertas ? ' · las puertas casan cara a cara ✓' : '') +
      '. Ahora 🧲 Soldar las une en una sola pared.');
  }

  /* 🧭 CONTORNO DE GUÍA (pedido de Edgar 28/08): el survey de la propiedad
     trae la huella del edificio. Se mete el survey de fondo (📂 Abrir, PDF o
     foto), se calibra con 📐 Escala, se CALCAN sus líneas con la herramienta
     de pared, se seleccionan y se convierten en guía. La guía:
       · se ve punteada gris, con su letrero
       · IMANTA las piezas (el calce la trata como pared fija)
       · NO cuenta en materiales, takeoff, estimador ni pies lineales
       · la soldadura no la toca jamás (no vive en state.walls)
     Así el exterior lo da el survey y el interior lo van dando las piezas. */
  function hacerGuia() {
    if (!selGroup || !selGroup.length) { setHint('🧭 Selecciona primero las paredes que calcaste del survey'); return; }
    var ids = {};
    selGroup.forEach(function (r) { if (r.kind === 'wall') ids[r.id] = 1; });
    var mover = state.walls.filter(function (w) { return ids[w.id]; });
    if (!mover.length) { setHint('🧭 Lo seleccionado no tiene paredes'); return; }
    pushUndo();
    mover.forEach(function (w) { state.guia.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }); });
    state.walls = state.walls.filter(function (w) { return !ids[w.id]; });
    limpiaHuerfanas();
    selGroup = null; sel = null;
    refresh(); renderSel(); showProps();
    setHint('🧭 ' + mover.length + ' tramo(s) ahora son GUÍA: imantan pero no cuentan. Ctrl+Z lo deshace · borrarla: botón 🧭 en el panel derecho');
  }
  function borrarGuia() {
    if (!state.guia.length) { setHint('🧭 No hay guía en la hoja'); return; }
    uiConfirm('¿Borrar el contorno de guía (' + state.guia.length + ' tramos)?\n\nLas piezas ya calzadas se quedan donde están.', function (okb) {
      if (!okb) return;
      pushUndo();
      state.guia = [];
      refresh();
      setHint('🧭 Guía borrada');
    });
  }
  function guiaComoParedes() {
    return state.guia.map(function (t, i) {
      return { id: '_guia' + i, x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, t: 4.5, _guia: true };
    });
  }

  /* ══════════ 🎯 ENCAJAR EN LA GUÍA ══════════
     Pedido de Edgar 08/29, con el plano que le mandó la cliente: "¿podemos
     adecuar las capturas del scan al plano que ella me dio?".

     El imán (calcePropuesta) resuelve otra cosa: pegar DOS PIEZAS por la
     pared que comparten. Para meter una pieza DENTRO del contorno de su
     cuarto hace falta un ajuste GLOBAL — que TODAS las paredes de la pieza
     queden lo más cerca posible del contorno, no que una sola encaje bien.
     Medido: con el imán, el office quedaba a 26" de mediana del plano de la
     cliente porque agarró una pared y se conformó; el escaneo venía girado
     90° (171x149 contra 138x169).

     Aquí se prueba el giro COMPLETO (barrido de 3° en toda la vuelta, luego
     fino de medio grado) y el corrimiento alrededor de donde Edgar la dejó.
     Gana el que deja la menor distancia media al contorno. */
  function encajarEnGuia(refs, guiaSegs) {
    var G = guiaSegs && guiaSegs.length ? guiaSegs : (state.guia || []);
    if (!G.length) return { err: 'No hay guía en la hoja. Calca el plano del cliente y conviértelo con 🧭.' };
    var ids = {};
    refs.forEach(function (r) { if (r.kind === 'wall') ids[r.id] = 1; });
    var ws = state.walls.filter(function (w) { return ids[w.id]; });
    if (!ws.length) return { err: 'Lo seleccionado no tiene paredes.' };

    // centro de la pieza y muestras a lo largo de sus paredes
    var cx = 0, cy = 0, TL = 0, muestras = [];
    ws.forEach(function (w) {
      var L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      cx += (w.x1 + w.x2) / 2 * L; cy += (w.y1 + w.y2) / 2 * L; TL += L;
      var n = Math.max(2, Math.round(L / 24));
      for (var i = 0; i <= n; i++)
        muestras.push([w.x1 + (w.x2 - w.x1) * i / n, w.y1 + (w.y2 - w.y1) * i / n]);
    });
    if (!TL) return { err: 'Lo seleccionado no mide nada.' };
    cx /= TL; cy /= TL;

    function d2s(px, py, o) {
      var dx = o.x2 - o.x1, dy = o.y2 - o.y1, Q = dx * dx + dy * dy;
      var t = Q ? ((px - o.x1) * dx + (py - o.y1) * dy) / Q : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      return Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t));
    }
    var TOPE = 48;   // más lejos de 4 pies ya no distingue: no premia irse lejos
    function puntaje(ang, ox, oy) {
      var co = Math.cos(ang), si = Math.sin(ang), sc = 0;
      for (var i = 0; i < muestras.length; i++) {
        var q = muestras[i];
        var rx = cx + (q[0] - cx) * co - (q[1] - cy) * si + ox;
        var ry = cy + (q[0] - cx) * si + (q[1] - cy) * co + oy;
        var d = 1e9;
        for (var j = 0; j < G.length; j++) {
          var dd = d2s(rx, ry, G[j]);
          if (dd < d) { d = dd; if (d < 0.5) break; }
        }
        sc += d < TOPE ? d : TOPE;
      }
      return sc / muestras.length;
    }

    /* Se ALTERNAN las dos búsquedas, dos veces. Un solo barrido de ángulo no
       basta: se hace con la pieza donde Edgar la dejó, y si está descolocada
       elige un giro que luego, ya centrada, resulta peor. Medido 08/29: el
       office daba 2.9" saliendo de su sitio y 11.6" saliendo descolocado 25".
       Girar → centrar → volver a girar → volver a centrar converge. */
    var best = { ang: 0, ox: 0, oy: 0, sc: puntaje(0, 0, 0) };
    for (var pasada = 0; pasada < 2; pasada++) {
      // la vuelta completa, de 3 en 3 grados, DESDE la posición actual
      for (var a = -180; a < 180; a += 3) {
        var sc = puntaje(a * Math.PI / 180, best.ox, best.oy);
        if (sc < best.sc) best = { ang: a * Math.PI / 180, ox: best.ox, oy: best.oy, sc: sc };
      }
      // corrimiento grueso → fino, reafinando el ángulo en cada ronda
      [[60, 10], [12, 2]].forEach(function (paso) {
        var R = paso[0], P = paso[1];
        for (var ox = best.ox - R; ox <= best.ox + R; ox += P)
          for (var oy = best.oy - R; oy <= best.oy + R; oy += P) {
            var s2 = puntaje(best.ang, ox, oy);
            if (s2 < best.sc) best = { ang: best.ang, ox: ox, oy: oy, sc: s2 };
          }
        for (var da = -4; da <= 4; da += 0.5) {
          var s3 = puntaje(best.ang + da * Math.PI / 180, best.ox, best.oy);
          if (s3 < best.sc) best = { ang: best.ang + da * Math.PI / 180, ox: best.ox, oy: best.oy, sc: s3 };
        }
      });
    }
    if (best.sc > 36) return { err: 'No encuentro dónde encaja (queda a ' + fmtFtIn(best.sc) +
      ' de media del contorno). Acércala al cuarto que le toca y vuelve a darle.' };
    return { ang: best.ang, ox: best.ox, oy: best.oy, sc: best.sc, cx: cx, cy: cy };
  }

  function encajarSel() {
    if (!selGroup || !selGroup.length) { setHint('🎯 Selecciona primero la pieza que quieres encajar'); return; }
    var r = encajarEnGuia(selGroup);
    if (r.err) { setHint('🎯 ' + r.err); return; }
    pushUndo();
    var deg = r.ang * 180 / Math.PI;
    if (Math.abs(deg) > 0.01) rotateRefs(selGroup, deg, r.cx, r.cy);
    moveRefs(selGroup, r.ox, r.oy);
    refresh(); renderSel();
    /* El residuo del encaje es un CONTROL DE CALIDAD gratis: si la pieza no
       logra pegarse al contorno del plano del cliente, casi siempre es que
       ese escaneo salió torcido (medido 08/29: el bedroom de Caroline llega
       como trapecio donde el plano dice rectángulo). Vale la pena decirlo. */
    var giro = Math.abs(deg) > 0.5 ? ' (la giré ' + Math.round(((deg % 360) + 360) % 360) + '°)' : '';
    if (r.sc <= 4) {
      setHint('🎯 Encajada CLAVADA en el plano — ' + r.sc.toFixed(1) + '" de media' + giro + ' · Ctrl+Z si no era ahí');
    } else if (r.sc <= 10) {
      setHint('🎯 Encajada: ' + r.sc.toFixed(1) + '" de media del contorno' + giro +
        ' — normal si el cuarto no es un rectángulo limpio · Ctrl+Z si no era ahí');
    } else {
      setHint('⚠️ Encajada, pero queda a ' + r.sc.toFixed(1) + '" del plano del cliente' + giro +
        '. Eso es mucho: probablemente ESE ESCANEO salió torcido. Compara la forma con el plano — ' +
        'si no cuadra, fíate del plano y corrige con 📏, o repite ese cuarto.');
    }
  }

  function deleteGroup() {
    if (!selGroup) return;
    pushUndo();
    selGroup.forEach(function (r) {
      if (r.kind === 'wall') {
        var wDel = null;
        state.walls.forEach(function (w) { if (w.id === r.id) wDel = w; });
        if (wDel) recuerdaHueco(wDel);
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
        '<div style="display:flex;gap:6px;margin:6px 0">' +
        '<button id="prRotL" style="flex:1" title="Girar 90 a la izquierda">↺ 90°</button>' +
        '<button id="prRotR" style="flex:1" title="Girar 90 a la derecha">↻ 90°</button>' +
        '<button id="prRot180" style="flex:1" title="Voltear 180">180°</button></div>' +
        '<button id="prEndG" style="width:100%;margin-bottom:6px" title="Pone la pieza a escuadra (recta)">📐 Enderezar</button>' +
        '<button id="prCalce" style="width:100%;margin-bottom:6px" title="Pega esta pieza a la pared mas cercana de las ya puestas">🧩 Calzar con lo puesto</button>' +
        '<button id="prEncaja" style="width:100%;margin-bottom:6px" title="Mete esta pieza DENTRO del contorno de guia (el plano del cliente): prueba todos los giros y elige el que mejor encaja">🎯 Encajar en el plano (guía)</button>' +
        '<button id="prGuia" style="width:100%;margin-bottom:6px" title="Las paredes seleccionadas pasan a ser CONTORNO DE GUIA: se ven punteadas, imantan las piezas, y NO cuentan en materiales ni las toca la soldadura. Para el survey de la propiedad.">🧭 Convertir en guía (survey)</button>' +
        '<button id="prFlipDryG" style="width:100%;margin-bottom:6px" title="Cambia de lado la línea fina del drywall en TODAS las paredes de bloque seleccionadas — un clic en vez de una por una">↕ Lado del drywall (grupo)</button>' +
        '<button class="danger" id="prDelGroup">🗑 Borrar todo el grupo</button>';
      var bg = $('#prDelGroup');
      if (bg) bg.addEventListener('click', deleteGroup);
      var bl = $('#prRotL'), br = $('#prRotR'), b8 = $('#prRot180');
      if (bl) bl.addEventListener('click', function () { rotateGroup(-90); });
      if (br) br.addEventListener('click', function () { rotateGroup(90); });
      if (b8) b8.addEventListener('click', function () { rotateGroup(180); });
      var be = $('#prEndG');
      if (be) be.addEventListener('click', function () { straightenRefs(selGroup); });
      var bc = $('#prCalce');
      if (bc) bc.addEventListener('click', function () { calzarSel(); });
      var bgd = $('#prGuia');
      if (bgd) bgd.addEventListener('click', function () { hacerGuia(); });
      var ben = $('#prEncaja');
      if (ben) ben.addEventListener('click', function () { encajarSel(); });
      // voltear el lado del drywall en TODO el grupo: en una casa de 12 tramos
      // de bloque eran 12 selecciones y 12 clics
      var bfd = $('#prFlipDryG');
      if (bfd) bfd.addEventListener('click', function () {
        pushUndo();
        selGroup.forEach(function (r) {
          if (r.kind !== 'wall') return;
          var q = entityOf(r);
          if (!q || !WALL_TYPES[q.type] || !WALL_TYPES[q.type].dry) return;
          q.drySide = -(q.drySide || 1); q.dryManual = 1;
        });
        refresh();
      });
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
      // ángulo exacto (para cuadrar sin pelear con el mouse; en el iPad es
      // la forma más precisa: escribes 0 y la pared queda recta)
      var wAng = Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI;
      html += '<div class="row"><label>Ángulo</label><input id="prWallAng" type="number" step="0.5" value="' + (Math.round(wAng * 10) / 10) + '"></div>';
      if (WALL_TYPES[e.type] && WALL_TYPES[e.type].dry) {
        // el botón dice de qué lado está AHORA: el error de tener el drywall por
        // fuera de la casa es invisible de un vistazo, así que se escribe
        var intr = orientaDrySide(true)[e.id];
        var dice = intr == null ? '' : ((e.drySide || 1) === intr ? ': adentro' : ': AFUERA ⚠');
        html += '<button id="prFlipDry">↕ Drywall' + dice + '</button>';
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
      var def2 = SYMBOLS[e.key];
      html += '<div class="row"><label>Escala</label><input id="prScale" type="number" step="0.1" min="0.2" value="' + (e.scale || 1) + '"></div>';
      if (def2 && def2.layer === 'furniture') {
        // pedido de Edgar: estirar a la MEDIDA real (un shower 36x60, una
        // tina a la medida...) — ancho y fondo independientes, en ft-in
        html += '<div class="row"><label>Ancho</label><input id="prSymW" value="' + fmtFtIn(def2.w * (e.scale || 1) * (e.sx || 1)) + '"></div>';
        html += '<div class="row"><label>Fondo</label><input id="prSymH" value="' + fmtFtIn(def2.h * (e.scale || 1) * (e.sy || 1)) + '"></div>';
      }
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
        html += '<div class="row"><label>Borde (coping)</label><select id="prCoping">' +
          [['0', 'Sin borde'], ['8', '8\"'], ['12', '12\" (normal)'], ['16', '16\"'], ['18', '18\"'], ['24', '24\" (deck)']].map(function (c9) {
            return '<option value="' + c9[0] + '"' + (copingDe(e) === parseFloat(c9[0]) ? ' selected' : '') + '>' + c9[1] + '</option>';
          }).join('') + '</select></div>';
      }
      html += '<div class="row"><label>Line</label><select id="prAreaLine">' +
        Object.keys(LINE_STYLES).map(function (k5) {
          var act = (e.lineStyle || 'solid') === k5;
          return '<option value="' + k5 + '"' + (act ? ' selected' : '') + '>' + esc(LINE_STYLES[k5].name) + '</option>';
        }).join('') + '</select></div>';
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
    if (sel && e) {
      // OPACIDAD: vale para todo lo que se puede seleccionar
      var opAct = (e.op == null ? 100 : e.op);
      html += '<div class="row"><label>Opacidad</label>' +
        '<input id="prOpac" type="range" min="10" max="100" step="5" value="' + opAct + '" style="flex:1" ' +
        'title="Deja el objeto atenuado sin borrarlo — para lo que es de referencia">' +
        '<span id="prOpacN" class="muted small" style="width:38px;text-align:right">' + opAct + '%</span></div>';
    }
    if (sel && /^(wall|dim|wire|area|leader)$/.test(sel.kind)) {
      html += '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button id="prRotSelL" style="flex:1" title="Girar 90 a la izquierda">↺ 90°</button>' +
        '<button id="prRotSelR" style="flex:1" title="Girar 90 a la derecha">↻ 90°</button>' +
        '<button id="prRotSel45" style="flex:1" title="Girar 45">↻ 45°</button></div>' +
        '<button id="prEndSel" style="width:100%;margin-top:6px" title="Pone la pieza a escuadra (recta)">📐 Enderezar</button>';
    }
    body.innerHTML = html;

    // cada control captura su propio nodo (n) para no leer el valor de otro
    function on(id, evt, fn) {
      var n = $('#' + id);
      if (n) n.addEventListener(evt, function () { fn(n); });
    }
    on('prOpac', 'input', function (n) {
      var v = parseInt(n.value, 10);
      if (!isFinite(v)) return;
      var et = findSel(); if (!et) return;
      et.op = (v >= 100 ? null : v);       // 100 = sin campo, como siempre
      var lbl = $('#prOpacN'); if (lbl) lbl.textContent = v + '%';
      refresh(); renderSel();
    });
    on('prOpac', 'change', function () { pushUndo(); });
    on('prDelete', 'click', deleteSelected);
    on('prRotSelL', 'click', function () { pushUndo(); rotateRefs([sel], -90); refresh(); renderSel(); });
    on('prRotSelR', 'click', function () { pushUndo(); rotateRefs([sel], 90); refresh(); renderSel(); });
    on('prRotSel45', 'click', function () { pushUndo(); rotateRefs([sel], 45); refresh(); renderSel(); });
    on('prEndSel', 'click', function () { straightenRefs([sel]); });
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
    on('prWallAng', 'change', function (n) {
      var a = parseFloat(n.value);
      if (isNaN(a)) return;
      pushUndo();
      var gg = wallGeom(e), rr = a * Math.PI / 180;
      // gira la pared sobre su CENTRO: los dos extremos se mueven lo mismo
      var mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2, hl = gg.len / 2;
      e.x1 = Math.round(mx - Math.cos(rr) * hl); e.y1 = Math.round(my - Math.sin(rr) * hl);
      e.x2 = Math.round(mx + Math.cos(rr) * hl); e.y2 = Math.round(my + Math.sin(rr) * hl);
      refresh(); renderSel();
    });
    on('prOpenType', 'change', function (n) {
      if (!OPEN_NAMES[n.value]) return;
      pushUndo(); e.type = n.value; refresh();
    });
    on('prOpenW', 'change', function (n) {
      var v = parseDist(n.value); if (!v || v < 6) return;
      pushUndo(); e.w = v; refresh();
    });
    // dryManual: el volteo A MANO manda. El orientador automático de la vuelta
    // no vuelve a tocar nunca una pared que el usuario decidió él mismo.
    on('prFlipDry', 'click', function () { pushUndo(); e.drySide = -(e.drySide || 1); e.dryManual = 1; refresh(); });
    on('prFlipSwing', 'click', function () { pushUndo(); e.swing = -(e.swing || 1); refresh(); });
    on('prFlipHinge', 'click', function () { pushUndo(); e.hinge = e.hinge ? 0 : 1; refresh(); });
    on('prRot', 'change', function (n) { pushUndo(); e.rot = parseFloat(n.value) || 0; refresh(); });
    on('prRot45', 'click', function () { pushUndo(); e.rot = ((e.rot || 0) + 45) % 360; refresh(); });
    on('prScale', 'change', function (n) { pushUndo(); e.scale = Math.max(0.2, parseFloat(n.value) || 1); refresh(); });
    on('prSymW', 'change', function (n) {
      var v = parseDist(n.value), d2 = SYMBOLS[e.key];
      if (!v || v < 4 || !d2) return;
      pushUndo(); e.sx = v / (d2.w * (e.scale || 1)); refresh(); showProps();
    });
    on('prSymH', 'change', function (n) {
      var v = parseDist(n.value), d2 = SYMBOLS[e.key];
      if (!v || v < 4 || !d2) return;
      pushUndo(); e.sy = v / (d2.h * (e.scale || 1)); refresh(); showProps();
    });
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
    on('prCoping', 'change', function (n) { pushUndo(); e.coping = parseFloat(n.value) || 0; refresh(); showProps(); });
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

  function recuerdaHueco(w) {
    state.huecos = state.huecos || [];
    state.huecos.push({ x: Math.round((w.x1 + w.x2) / 2), y: Math.round((w.y1 + w.y2) / 2) });
    if (state.huecos.length > 60) state.huecos = state.huecos.slice(-60);
  }
  // ¿este punto cae donde Edgar borró pared a propósito?
  function esHuecoQuerido(x, y) {
    if (!state.huecos || !state.huecos.length) return false;
    for (var i = 0; i < state.huecos.length; i++)
      if (Math.hypot(x - state.huecos[i].x, y - state.huecos[i].y) < 16) return true;
    return false;
  }
  function deleteSelected() {
    var e = findSel(); if (!e) return;
    pushUndo();
    if (sel.kind === 'wall') {
      // Edgar borró esta pared A PROPÓSITO (p. ej. para dejar el hueco de
      // una puerta). Se recuerda el centro: la soldadura no rellena ahí.
      recuerdaHueco(e);
      state.walls = state.walls.filter(function (w) { return w.id !== e.id; });
      state.openings = state.openings.filter(function (o) { return o.wallId !== e.id; });
    } else {
      var pool = { opening: 'openings', symbol: 'symbols', text: 'texts', dim: 'dims', area: 'areas', wire: 'wires', leader: 'leaders' }[sel.kind];
      state[pool] = state[pool].filter(function (x) { return x.id !== e.id; });
    }
    sel = null;
    refresh();
  }

  /* ---------------- conteo de materiales ----------------
     OJO (auditoría 08/28): las aberturas cuyo muro ya no existe seguían
     contando en el takeoff, el CSV y el estimado. Se cuenta solo lo vivo. */
  function aberturasVivas() {
    return state.openings.filter(function (o) {
      return state.walls.some(function (w) { return w.id === o.wallId; });
    });
  }
  // ...y de paso se tiran: una abertura sin pared no se dibuja, no se puede
  // seleccionar y no sirve para nada. Se limpia al abrir y al soldar.
  function limpiaHuerfanas() {
    var n = state.openings.length;
    state.openings = aberturasVivas();
    return n - state.openings.length;
  }
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
    aberturasVivas().forEach(function (o) { openCount[o.type] = (openCount[o.type] || 0) + 1; });
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
    aberturasVivas().forEach(function (o) { openCount[o.type] = (openCount[o.type] || 0) + 1; });
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
  // 🧲 SOLDAR ARMADO: tras arrastrar cada cuarto (pieza) a su sitio, este
  // botón une todo: fusiona las paredes dobladas donde dos piezas empatan,
  // suelda esquinas, reconecta las aberturas a su pared sobreviviente y
  // re-tipa automáticamente (lo que da a la calle = block 8", lo interior
  // = drywall) — la respuesta a "¿cómo se quita el block y queda drywall?"
  /* ======================= 🤖 ASISTENTE MXP =======================
     Edgar: "el escáner de Apple no es infalible… ¿cómo mejoramos lo que nos
     da? Que la app tenga un botón donde yo te pida ayuda, y si yo tomo una
     medida a mano tú me rectifiques el plano".

     Esto es ese cerebro, y vive DENTRO de la app: no llama a ningún
     servidor, no cuesta nada y funciona en la obra sin señal. Lee la
     geometría real del plano y saca conclusiones — igual que las saco yo
     cuando miro tus capturas, pero al instante y sobre TODO el plano.
  =================================================================== */
  function angMod90(w) {
    var a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
    return ((a % 90) + 135) % 90 - 45;
  }
  function largo(w) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1); }
  // ¿qué es este cuarto? El dato que más manda no es el tamaño: es si tiene
  // VENTANA. El código exige ventana de escape en todo cuarto habitable, así
  // que un espacio sin ventana casi nunca es un dormitorio — es clóset,
  // pasillo, baño o lavandería. Ese es el mismo razonamiento que usa un
  // plans examiner mirando el plano.
  function adivinaCuarto(r) {
    var xs = r.poly.map(function (p) { return p[0]; });
    var ys = r.poly.map(function (p) { return p[1]; });
    var an = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    var al = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var lar = Math.max(an, al) / 12, cor = Math.min(an, al) / 12;   // pies
    var prop = cor > 0 ? lar / cor : 9;
    var sq = r.sqft, vent = 0, puertas = 0;
    (r.walls || []).forEach(function (w) {
      state.openings.forEach(function (o) {
        if (o.wallId !== w.id) return;
        if (o.type === 'window' || o.type === 'slider') vent++; else puertas++;
      });
    });
    var conV = vent > 0 ? ' y tiene ventana' : ' y NO tiene ventana';
    if (prop >= 3 && cor <= 6) return { n: 'HALLWAY', pq: 'largo y estrecho, ' + cor.toFixed(1) + ' ft de ancho' };
    if (sq <= 25) return { n: 'CLOSET', pq: sq + ' sq ft' + conV };
    if (sq <= 55) return vent > 0
      ? { n: 'BATHROOM', pq: sq + ' sq ft con ventana' }
      : { n: 'CLOSET', pq: sq + ' sq ft sin ventana — un cuarto habitable necesita ventana de escape' };
    if (sq <= 95) return vent > 0
      ? { n: 'BATHROOM', pq: sq + ' sq ft con ventana' }
      : { n: 'WALK-IN CLOSET ó LAUNDRY', pq: sq + ' sq ft sin ventana' };
    if (sq <= 140) return vent > 0
      ? { n: 'BEDROOM', pq: sq + ' sq ft con ventana de escape' }
      : { n: 'WALK-IN CLOSET ó LAUNDRY', pq: sq + ' sq ft sin ventana — sin ventana no puede ser dormitorio' };
    if (sq <= 220) return { n: 'BEDROOM', pq: sq + ' sq ft' + conV };
    if (sq <= 340) return vent > 0
      ? { n: 'MASTER BEDROOM', pq: sq + ' sq ft con ventana' }
      : { n: 'GARAGE ó BONUS', pq: sq + ' sq ft sin ventana' };
    return { n: 'LIVING / GREAT ROOM', pq: sq + ' sq ft' + conV };
  }
  // distancia perpendicular de un punto a la RECTA de una pared
  function perpRecta(px, py, w) {
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
    return Math.abs((px - w.x1) * dy - (py - w.y1) * dx) / L;
  }
  /* ═══════════ 🔧 RECTIFICAR: arreglar la deriva SIN repetir el escaneo ═══
     Edgar: "¿y si me dice que lo repita y lo repito diez veces y diez veces
     sale mal? ¿No puede arreglarlo él por mí?"

     Sí se puede, y esto es por qué. Se comprobó con sus escaneos reales:
     el polígono del piso NO sirve de segunda opinión (deriva igual que las
     paredes). Pero el error del sensor NO es parejo:
       · los LARGOS son buenos — cada pared se mide en pocos segundos
       · lo que deriva es el ÁNGULO entre paredes escaneadas con minutos de
         diferencia (el giro del sensor se va acumulando)
       · y una casa tiene esquinas de 90° y, a veces, cortes de 45°
     Así que se agrupan las paredes por dirección, cada grupo se lleva al
     múltiplo de 45° más cercano, y CADA PARED CONSERVA SU LARGO EXACTO.
     Es lo mismo que hace un topógrafo al cerrar una poligonal: se fía de
     las distancias y corrige los ángulos.
     Medido en los escaneos de Caroline: bedroom_2 −18.5° → queda a
     escuadra; Master Bedroom −2° y su corte real de 45° SE RESPETA;
     bedroom_1 (que estaba bien) no se toca. Largos: 0.00" de cambio. */
  /* ⚠️ CORRECCIÓN IMPORTANTE (08/28, tras medirlo en los 13 escaneos):
     los ángulos de 19-21° que se estaban marcando como DERIVA del sensor son
     ESQUINAS REALES de la casa de Caroline. La prueba: en bedroom_2,
     living/dining y Kitchen, las paredes de ese segundo grupo son
     perpendiculares ENTRE SÍ y se tocan formando esquina. La deriva es un
     giro que se acumula: reparte las paredes de cualquier manera y NUNCA
     produce un par perpendicular y pegado. Edgar ya lo había dicho: "esta
     casa tiene muchas esquinas y diagonales, no es una casa de paredes
     rectas". Así que:
       · un grupo COHERENTE (perpendicular consigo mismo + pegado) = la casa
         es así, y no se toca jamás
       · el ruido de verdad son los 1-4° de cada pared respecto a SU grupo
     Rectificar limpia ESO: lleva cada pared al ángulo exacto de su propio
     grupo. Los cantos reales de la casa se quedan donde están. */
  function gruposDir(W) {
    var gr = [];
    W.slice().sort(function (a, b) { return largo(b) - largo(a); }).forEach(function (w) {
      if (largo(w) < 10) return;
      var t = ((Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI % 90) + 90) % 90;
      var g = null;
      for (var i = 0; i < gr.length; i++) if (dist90(gr[i].a, t) < 8) { g = gr[i]; break; }
      if (!g) { g = { a: t, L: 0, ws: [] }; gr.push(g); }
      // media circular en el espacio mod 90 (para no promediar 89° con 1°)
      var d = t - g.a;
      while (d > 45) d -= 90;
      while (d < -45) d += 90;
      g.a = ((g.a + d * largo(w) / (g.L + largo(w))) % 90 + 90) % 90;
      g.L += largo(w); g.ws.push(w);
    });
    gr.sort(function (a, b) { return b.L - a.L; });
    return gr;
  }
  // ¿este grupo es una esquina REAL de la casa o ruido suelto?
  function grupoCoherente(g) {
    if (g.ws.length < 2) return false;
    for (var i = 0; i < g.ws.length; i++) for (var j = i + 1; j < g.ws.length; j++) {
      var A = g.ws[i], B = g.ws[j];
      var d = Math.abs(Math.atan2(A.y2 - A.y1, A.x2 - A.x1) - Math.atan2(B.y2 - B.y1, B.x2 - B.x1)) * 180 / Math.PI % 180;
      d = Math.min(d, 180 - d);
      if (Math.abs(d - 90) > 6) continue;                 // no son perpendiculares entre sí
      var dd = Math.min(
        Math.hypot(A.x1 - B.x1, A.y1 - B.y1), Math.hypot(A.x1 - B.x2, A.y1 - B.y2),
        Math.hypot(A.x2 - B.x1, A.y2 - B.y1), Math.hypot(A.x2 - B.x2, A.y2 - B.y2));
      if (dd < 24) return true;                            // perpendiculares Y pegadas = esquina
    }
    return false;
  }
  function dist90(a, b) { var d = Math.abs(a - b) % 90; return Math.min(d, 90 - d); }
  /* La poligonal cerrada, como la cierra un topógrafo.
     Girar cada pared sobre su punto medio deja el cuarto "a escuadra" en los
     números pero DESPEGADO en el dibujo (probado: se ve roto). Lo correcto es
     recorrer el circuito: se van encadenando las paredes con su ÁNGULO
     CORREGIDO y su LARGO MEDIDO, y al final sobra un pelo — el error de
     cierre. Ese error se reparte entre todos los vértices en proporción a lo
     que llevas andado (regla de Bowditch, la de toda la vida en topografía).
     El cuarto sale cerrado, a escuadra, y con los largos del sensor. */
  function rectificarYcerrar(W) {
    var L0 = {};
    W.forEach(function (w) { if (!w.id) w.id = uid(); L0[w.id] = largo(w); });
    var gr = gruposDir(W);
    if (!gr.length) return null;
    var info = gr.map(function (g) {
      return { a: g.a, ft: g.L / 12, n: g.ws.length, real: grupoCoherente(g),
               sep: dist90(g.a, gr[0].a) };
    });
    // ¿hay algo que limpiar? el ruido es lo que cada pared se aparta de SU grupo
    var maxRuido = 0;
    gr.forEach(function (g) {
      g.ws.forEach(function (w) {
        var t = ((Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI % 90) + 90) % 90;
        maxRuido = Math.max(maxRuido, dist90(t, g.a));
      });
    });
    if (maxRuido < 0.6) return { grupos: info, girada: 0, maxG: 0, yaEstaba: true, maxDL: 0, bucles: 0 };
    // cada pared al ángulo exacto de su grupo (giros de 1-4°, nada violento)
    var dest = gr.map(function (g) { return { origen: g.a, corr: 0, exacto: g.a }; });
    var tocadas = 0, maxG = 0;
    gr.forEach(function (g) {
      g.ws.forEach(function (w) {
        var a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
        var t = ((a % 90) + 90) % 90;
        var d = g.a - t;
        while (d > 45) d -= 90;
        while (d < -45) d += 90;
        if (Math.abs(d) < 0.05 || Math.abs(d) > 8) return;
        w._corr = d; tocadas++; maxG = Math.max(maxG, Math.abs(d));
      });
    });
    if (!tocadas) return { grupos: info, girada: 0, maxG: 0, yaEstaba: true, maxDL: 0, bucles: 0 };
    // Las correcciones son de 1-5°: girando cada pared sobre su punto medio
    // los extremos se mueven pulgadas, no pies. Así se conserva EXACTO el
    // largo de cada pared — que es el dato bueno del sensor — y después una
    // soldadura suave vuelve a juntar las esquinas.
    W.forEach(function (w) {
      if (!w._corr) return;
      var giro = w._corr * Math.PI / 180;
      var a0 = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) + giro;
      var l = largo(w) / 2, mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      w.x1 = Math.round(mx - Math.cos(a0) * l); w.y1 = Math.round(my - Math.sin(a0) * l);
      w.x2 = Math.round(mx + Math.cos(a0) * l); w.y2 = Math.round(my + Math.sin(a0) * l);
    });
    snapTJunctions(W); weldCorners(W, 10); unbendTees(W, 3.5);
    // el largo medido manda: se le devuelve a cada pared el suyo
    W.forEach(function (w) {
      var l0 = L0[w.id], l = largo(w);
      delete w._corr;
      if (!l0 || !l || Math.abs(l - l0) < 0.6) return;
      var mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2, k = l0 / l;
      w.x1 = Math.round(mx + (w.x1 - mx) * k); w.y1 = Math.round(my + (w.y1 - my) * k);
      w.x2 = Math.round(mx + (w.x2 - mx) * k); w.y2 = Math.round(my + (w.y2 - my) * k);
    });
    var maxDL = 0;
    W.forEach(function (w) { if (L0[w.id]) maxDL = Math.max(maxDL, Math.abs(largo(w) - L0[w.id])); });
    return { grupos: info, girada: tocadas, maxG: maxG, maxDL: maxDL };
  }

  function analizarPlano() {
    var av = [];
    var W = state.walls;
    var roomsPre = detectRoomPolys(W);
    // ¿este punto cae DENTRO de un cuarto? (para no confundir un pasillo —
    // que también son dos paredes paralelas — con una pieza sin pegar)
    function dentroDeCuarto(x, y) {
      for (var k = 0; k < roomsPre.length; k++) if (ptInPoly(x, y, roomsPre[k].poly)) return true;
      return false;
    }
    // PIEZAS: grupos de paredes que se tocan entre sí. Dos paredes de la
    // MISMA pieza nunca son "una pieza sin pegar" — serán un pasillo, un
    // chase o dos muros de verdad. Solo tiene sentido avisar cuando las dos
    // vienen de piezas distintas.
    var pieza = {};
    (function () {
      var par = {};
      W.forEach(function (w) { par[w.id] = w.id; });
      function find(k) { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; }
      for (var i2 = 0; i2 < W.length; i2++) for (var j2 = i2 + 1; j2 < W.length; j2++) {
        var A = W[i2], B = W[j2], toca = false;
        [[A.x1, A.y1], [A.x2, A.y2]].forEach(function (q) {
          if (distToSeg(q[0], q[1], B.x1, B.y1, B.x2, B.y2).d < 24) toca = true;
        });
        [[B.x1, B.y1], [B.x2, B.y2]].forEach(function (q) {
          if (distToSeg(q[0], q[1], A.x1, A.y1, A.x2, A.y2).d < 24) toca = true;
        });
        if (toca) par[find(A.id)] = find(B.id);
      }
      W.forEach(function (w) { pieza[w.id] = find(w.id); });
    })();
    // ——— 1. paredes casi rectas pero torcidas (ruido del escáner) ———
    var torcidas = W.filter(function (w) {
      var a = Math.abs(angMod90(w));
      return largo(w) >= 24 && a > 0.6 && a <= 4.5;
    });
    if (torcidas.length) {
      av.push({
        sev: 2, tit: torcidas.length + ' pared(es) casi rectas pero torcidas',
        txt: 'Están a menos de 4½° del eje. En una casa real eso no existe: es ruido del escáner. La más torcida va a ' +
          torcidas.map(function (w) { return Math.abs(angMod90(w)); }).sort(function (a, b) { return b - a; })[0].toFixed(1) + '°.',
        accion: 'Ponerlas rectas', refs: torcidas.map(function (w) { return { kind: 'wall', id: w.id }; }),
        fix: function () {
          pushUndo();
          torcidas.forEach(function (w) {
            var dx = Math.abs(w.x2 - w.x1), dy = Math.abs(w.y2 - w.y1);
            if (dx >= dy) { var y = Math.round((w.y1 + w.y2) / 2); w.y1 = y; w.y2 = y; }
            else { var x = Math.round((w.x1 + w.x2) / 2); w.x1 = x; w.x2 = x; }
          });
          weldCorners(state.walls, 8);
          refresh();
        }
      });
    }
    // ——— 2. piezas que NO pegaron (paredes gemelas separadas) ———
    var sinPegar = [];
    for (var i = 0; i < W.length; i++) for (var j = i + 1; j < W.length; j++) {
      var a = W[i], b = W[j];
      if (largo(a) < 48 || largo(b) < 48) continue;
      var da = Math.abs(angMod90(a) - angMod90(b));
      if (da > 4) continue;
      var sep = Math.max(perpRecta(b.x1, b.y1, a), perpRecta(b.x2, b.y2, a));
      if (sep <= 24 || sep > 84) continue;         // ≤24 ya las une el imán
      // ¿se pisan a lo largo?
      var dx = (a.x2 - a.x1) / largo(a), dy = (a.y2 - a.y1) / largo(a);
      var t1 = (b.x1 - a.x1) * dx + (b.y1 - a.y1) * dy;
      var t2 = (b.x2 - a.x1) * dx + (b.y2 - a.y1) * dy;
      var sol = Math.min(largo(a), Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
      if (sol < 0.7 * Math.min(largo(a), largo(b))) continue;
      // si el hueco entre las dos es un ESPACIO REAL (pasillo, chase), ahí
      // hay cuarto detectado en medio: no son una pieza sin pegar
      var mx = ((a.x1 + a.x2) / 2 + (b.x1 + b.x2) / 2) / 2;
      var my = ((a.y1 + a.y2) / 2 + (b.y1 + b.y2) / 2) / 2;
      if (dentroDeCuarto(mx, my)) continue;
      if (pieza[a.id] === pieza[b.id]) continue;    // misma pieza: no es un empate
      sinPegar.push({ a: a, b: b, sep: sep });
    }
    sinPegar.sort(function (x, y) { return x.sep - y.sep; });
    sinPegar.slice(0, 4).forEach(function (par) {
      av.push({
        sev: 1, tit: 'Dos paredes gemelas separadas ' + fmtFtIn(par.sep) + ' — el imán no las une',
        txt: 'Son paralelas, se pisan casi enteras y NO están conectadas entre sí: o son dos piezas que no pegaron, ' +
          'o un pedazo suelto del mismo escaneo. Están a ' + fmtFtIn(par.sep) + ' y el imán solo une hasta 2 pies. ' +
          'Acércalas (selecciona una y arrástrala, o con las flechas del teclado: cada una mueve 1") y vuelve a 🧲 Soldar. ' +
          'Si de verdad son dos paredes distintas de la casa, ignora este aviso.',
        accion: 'Enseñármelas', refs: [{ kind: 'wall', id: par.a.id }, { kind: 'wall', id: par.b.id }],
        /* Desde v25.L el aviso también lo ARREGLA: trae la pieza de la
           pared b hasta la de la pared a con el calce (alcanza 10 pies,
           prueba las 4 orientaciones, las puertas desempatan) y suelda
           SOLO esa costura. Ctrl+Z lo deshace entero. */
        accion2: '🧩 Traerla y soldarla',
        fix2: function () {
          var pa = pieza[par.a.id];
          var movWs = state.walls.filter(function (w) { return pieza[w.id] !== pa; })
            .filter(function (w) { return pieza[w.id] === pieza[par.b.id]; });
          var fijWs = state.walls.filter(function (w) { return pieza[w.id] === pa; });
          if (!movWs.length || !fijWs.length) { setHint('🧩 Ya no encuentro las dos piezas — ¿se soldaron?'); return; }
          var m4 = calceCuatro(movWs, fijWs, { maxRot: 20, snap: 120 });
          if (!m4) { setHint('🧩 No les encuentro calce limpio — acércalas un poco a mano.'); return; }
          pushUndo();
          var refs = movWs.map(function (w) { return { kind: 'wall', id: w.id }; });
          if (m4.pre) rotateRefs(refs, m4.pre, m4.cx, m4.cy);
          aplicarCalce(refs, m4.c);
          selGroup = refs.concat(fijWs.map(function (w) { return { kind: 'wall', id: w.id }; }));
          window.__weldOK = 1;
          try { $('#btnWeld').click(); } finally { window.__weldOK = 0; }
          selGroup = null; renderSel(); showProps();
          refresh();
          setHint('🧩 Traída y soldada: ' + fmtFtIn(m4.c.solape) + ' de pared en común' +
            (m4.c.puertas ? ' · las puertas casan ✓' : '') + ' — Ctrl+Z si no era ahí.');
        }
      });
    });
    // ——— 3. direcciones de la casa: cuáles son reales y cuáles ruido ———
    // (esto se corrigió el 08/28: los ángulos de 19-21° de la casa de
    //  Caroline NO son deriva del sensor, son esquinas de verdad. Se
    //  distinguen porque sus paredes son perpendiculares entre sí y se
    //  tocan. Ver gruposDir/grupoCoherente.)
    var gr = gruposDir(W);
    var ruido = 0, maxRu = 0;
    gr.forEach(function (g) {
      g.ws.forEach(function (w) {
        var t = ((Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI % 90) + 90) % 90;
        var d = dist90(t, g.a);
        if (d > 0.6) { ruido++; maxRu = Math.max(maxRu, d); }
      });
    });
    if (gr.length > 1) {
      var lin = gr.map(function (g, i) {
        return '   • ' + Math.round(g.L / 12) + ' ft de pared a ' + g.a.toFixed(0) + '°' +
          (i ? ' (a ' + dist90(g.a, gr[0].a).toFixed(0) + '° de la principal) — ' +
            (grupoCoherente(g) ? 'ESQUINA REAL de la casa: no se toca' : 'suelto, puede ser ruido') : ' — dirección principal');
      });
      var sueltos2 = gr.filter(function (g, i) { return i && !grupoCoherente(g); });
      av.push({
        sev: sueltos2.length ? 1 : 2,
        tit: 'Esta parte de la casa tiene ' + gr.length + ' direcciones',
        txt: lin.join('\n') + '\n\n' +
          (sueltos2.length
            ? 'Los grupos marcados como "suelto" son paredes que no forman esquina con nadie a ese ángulo: ' +
              'ésas sí pueden ser ruido del escáner.'
            : 'Todas son esquinas de verdad. La casa es así — no hay nada que arreglar en los ángulos.'),
        accion: null, refs: null, fix: null
      });
    }
    if (ruido) {
      av.push({
        sev: 2,
        tit: ruido + ' pared(es) se apartan hasta ' + maxRu.toFixed(1) + '° de su propia dirección',
        txt: 'Cada pared debería ir EXACTA en la dirección de su grupo, y estas se van uno o dos grados. ' +
          'Eso sí es ruido del sensor.\n\n🔧 Rectificar las lleva al ángulo exacto de su grupo SIN cambiarles el largo ' +
          'y SIN tocar los ángulos reales de la casa (los cantos de 19° o de 45° se quedan donde están).',
        accion: '🔧 Rectificar (llevar cada pared a su dirección)',
        refs: null,
        fix: function () {
          pushUndo();
          var r = rectificarYcerrar(state.walls);
          refresh();
          if (!r) { setHint('🔧 No pude agrupar las direcciones de este plano.'); return; }
          if (r.yaEstaba) { setHint('🔧 Ya está todo en su dirección — no toqué nada.'); return; }
          var dirs = r.grupos.map(function (g) {
            return Math.round(g.ft) + 'ft@' + g.a.toFixed(0) + '°' + (g.real && g.sep > 1 ? ' (real)' : '');
          }).join(' · ');
          uiAlert('🔧 RECTIFICADO\n\n' +
            '· ' + r.girada + ' pared(es) llevadas al ángulo exacto de su grupo\n' +
            '· corrección máxima: ' + r.maxG.toFixed(1) + '°\n' +
            '· los largos cambiaron como mucho ' + r.maxDL.toFixed(1) + '"\n\n' +
            'Direcciones de la casa (SE CONSERVAN):\n   ' + dirs + '\n\n' +
            'Los cantos reales de la casa no se tocaron: solo se le quitó a cada pared el pelo de ' +
            'grado que el escáner le metió.\n\nSi no te gusta: Ctrl+Z.');
        }
      });
    }
    // ——— 4. extremos sueltos cerca de otra pared ———
    var sueltos = [];
    W.forEach(function (w) {
      ['1', '2'].forEach(function (e) {
        var px = w['x' + e], py = w['y' + e], best = null;
        W.forEach(function (o) {
          if (o === w) return;
          var r = distToSeg(px, py, o.x1, o.y1, o.x2, o.y2);
          if (!best || r.d < best.d) best = { d: r.d, o: o };
        });
        if (best && best.d > 3 && best.d < 40) sueltos.push({ w: w, e: e, d: best.d });
      });
    });
    if (sueltos.length) {
      av.push({
        sev: 1, tit: sueltos.length + ' esquina(s) sin cerrar',
        txt: 'Hay extremos de pared que se quedaron en el aire a menos de 3 pies de otra pared. Un cuarto que no cierra no calcula superficie ni sabe si su pared da a la calle.',
        accion: 'Cerrarlas', refs: sueltos.map(function (x) { return { kind: 'wall', id: x.w.id }; }),
        fix: function () { pushUndo(); snapTJunctions(state.walls); weldCorners(state.walls, 12); refresh(); }
      });
    }
    // ——— 5. cuartos sin nombre: qué son ———
    var rooms = roomsPre;
    var conNombre = state.texts.filter(function (t) { return !/SQ FT/i.test(t.text); });
    var anon = rooms.filter(function (r) {
      return !conNombre.some(function (t) { return ptInPoly(t.x, t.y, r.poly); });
    });
    if (anon.length) {
      var lineas = anon.slice(0, 8).map(function (r) {
        var g = adivinaCuarto(r);
        return '   • ' + r.sqft + ' sq ft → probablemente ' + g.n + ' (' + g.pq + ')';
      });
      av.push({
        sev: 2, tit: anon.length + ' cuarto(s) sin nombre — lo que creo que son',
        txt: lineas.join('\n') + '\n\nSe ponen con la herramienta Text encima de cada uno; el nombre sale en el permit.',
        accion: 'Escribir estos nombres', refs: null,
        fix: function () {
          pushUndo();
          anon.forEach(function (r) {
            var g = adivinaCuarto(r);
            var nm = g.n.split(' ó ')[0];
            state.texts.push({ id: uid(), x: Math.round(r.cx - nm.length * 2.9), y: Math.round(r.cy), text: nm, size: r.sqft < 120 ? 7 : 10 });
          });
          refresh();
        }
      });
    }
    // ——— 6. pedacitos de pared ———
    var micro = W.filter(function (w) { return largo(w) < 7; });
    if (micro.length) {
      av.push({
        sev: 2, tit: micro.length + ' pedacito(s) de pared de menos de 7"',
        txt: 'Basura del escáner: tramos más cortos que un ladrillo. No son paredes de verdad y ensucian el conteo de materiales.',
        accion: 'Borrarlos', refs: micro.map(function (w) { return { kind: 'wall', id: w.id }; }),
        fix: function () {
          pushUndo();
          var ids = {}; micro.forEach(function (w) { ids[w.id] = 1; });
          state.openings = state.openings.filter(function (o) { return !ids[o.wallId]; });
          state.walls = state.walls.filter(function (w) { return !ids[w.id]; });
          refresh();
        }
      });
    }
    // ——— 7. aberturas encimadas ———
    var dobles = [];
    state.openings.forEach(function (o, k) {
      for (var m = 0; m < k; m++) {
        var q2 = state.openings[m];
        if (q2.wallId === o.wallId && Math.abs(q2.pos - o.pos) < 10) dobles.push(o);
      }
    });
    if (dobles.length) {
      av.push({
        sev: 1, tit: dobles.length + ' abertura(s) encimadas',
        txt: 'La misma puerta escaneada desde los dos cuartos quedó dos veces en la misma pared. En el permit sale doble y en el estimado también.',
        accion: 'Dejar una sola', refs: null,
        fix: function () {
          pushUndo();
          var fuera = {}; dobles.forEach(function (o) { fuera[o.id] = 1; });
          state.openings = state.openings.filter(function (o) { return !fuera[o.id]; });
          refresh();
        }
      });
    }
    av.sort(function (x, y) { return x.sev - y.sev; });
    return { av: av, rooms: rooms.length, paredes: W.length };
  }

  function abrirAsistente() {
    if (!state.walls.length) { uiAlert('Todavía no hay paredes en la hoja. Importa un escaneo o dibuja algo y te lo reviso.'); return; }
    var r = analizarPlano();
    window.__aiFix = r.av;
    var h = '<div class="muted small" style="margin-bottom:10px">' + r.paredes + ' paredes · ' + r.rooms +
      ' cuarto(s) cerrados · revisado ahora mismo, sin internet</div>';
    if (!r.av.length) {
      h += '<div style="padding:14px;background:#eafaf0;border-radius:8px;font-size:13px">✅ <b>No le veo nada raro.</b> ' +
        'Las paredes están a escuadra, los cuartos cierran y las aberturas están cada una en su sitio.</div>';
    } else {
      r.av.forEach(function (a, i) {
        var col = a.sev === 0 ? '#c62828' : (a.sev === 1 ? '#ef6c00' : '#1c5fa8');
        var bg = a.sev === 0 ? '#fdecea' : (a.sev === 1 ? '#fff4e5' : '#eaf3ff');
        h += '<div style="border-left:4px solid ' + col + ';background:' + bg + ';padding:10px 12px;margin-bottom:10px;border-radius:0 8px 8px 0">' +
          '<div style="font-weight:700;font-size:13px;color:' + col + '">' + (a.sev === 0 ? '⛔ ' : (a.sev === 1 ? '⚠️ ' : 'ℹ️ ')) + esc(a.tit) + '</div>' +
          '<div style="font-size:12px;margin:5px 0;white-space:pre-wrap;line-height:1.45">' + esc(a.txt) + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          (a.fix ? '<button class="aiFix" data-i="' + i + '" style="padding:5px 12px;border:none;background:' + col + ';color:#fff;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:700">✔ ' + esc(a.accion) + '</button>' : '') +
          (a.fix2 ? '<button class="aiFix2" data-i="' + i + '" style="padding:5px 12px;border:none;background:' + col + ';color:#fff;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:700">' + esc(a.accion2) + '</button>' : '') +
          (a.refs ? '<button class="aiSel" data-i="' + i + '" style="padding:5px 12px;border:1px solid #c9c9c3;background:#fff;border-radius:6px;cursor:pointer;font-size:11.5px">👁 Enseñármelo en el plano</button>' : '') +
          '</div></div>';
      });
    }
    // ——— preguntarle a Claude (el cerebro, si está conectado) ———
    var cfg = cerebroCfg();
    h += '<div style="border-top:1px solid #e3e1da;margin-top:12px;padding-top:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-weight:700;font-size:12.5px">💬 Pregúntale a Claude sobre este plano</div>' +
      '<button id="aiCfgBtn" style="font-size:10.5px;padding:2px 8px;border:1px solid #c9c9c3;background:#fff;border-radius:5px;cursor:pointer">⚙ Ajustes</button></div>' +
      (cfg.url
        ? '<div class="muted small" style="margin:4px 0 6px">Va con el plano entero y el diagnóstico de arriba. Cuesta unos 9 centavos por pregunta.</div>' +
          '<textarea id="aiPreg" rows="2" placeholder="ej: ¿cómo armo estas 13 piezas? · ¿este cuarto puede ser dormitorio? · ¿qué circuitos necesita esta cocina?" style="width:100%;padding:7px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-family:inherit;font-size:12.5px"></textarea>' +
          '<button id="aiPregOk" style="margin-top:5px;padding:7px 16px;border:none;background:#0b84ff;color:#fff;border-radius:6px;cursor:pointer;font-weight:700">Preguntar</button>' +
          '<div id="aiResp" style="margin-top:8px;font-size:12.5px;line-height:1.5"></div>'
        : '<div class="muted small" style="margin:4px 0">Sin conectar. El asistente de arriba funciona igual (mide la geometría, no cuesta nada y va sin internet). Conectando el cerebro puedes además PREGUNTARLE a Claude sobre el plano. Ver <b>mxp-brain/README.md</b> — 10 minutos.</div>') +
      '</div>';
    h += '<div style="border-top:1px solid #e3e1da;margin-top:12px;padding-top:12px">' +
      '<div style="font-weight:700;font-size:12.5px;margin-bottom:4px">📏 Tomé una medida en la obra y no cuadra</div>' +
      '<div class="muted small" style="margin-bottom:6px">Selecciona la pared en el plano, escribe aquí la medida REAL y se corrige arrastrando lo que tenga pegado (la esquina no se abre).</div>' +
      '<div style="display:flex;gap:6px"><input id="aiMed" placeholder="ej: 12\' 4 1/2&quot;" style="flex:1;padding:7px;border:1px solid #ccc;border-radius:6px">' +
      '<button id="aiMedOk" style="padding:7px 14px;border:none;background:#1e2530;color:#fff;border-radius:6px;cursor:pointer;font-weight:700">Corregir</button></div>' +
      '<div id="aiMedMsg" class="muted small" style="margin-top:5px"></div></div>';
    $('#aiBody').innerHTML = h;
    $('#aiModal').hidden = false;
    $$('.aiFix').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = window.__aiFix[+b.dataset.i];
        if (a && a.fix) { a.fix(); $('#aiModal').hidden = true; setHint('🤖 ' + a.accion + ': hecho — Ctrl+Z lo deshace'); }
      });
    });
    $$('.aiFix2').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = window.__aiFix[+b.dataset.i];
        if (a && a.fix2) { $('#aiModal').hidden = true; a.fix2(); }
      });
    });
    $$('.aiSel').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = window.__aiFix[+b.dataset.i];
        if (!a || !a.refs) return;
        sel = null; selGroup = a.refs.slice();
        $('#aiModal').hidden = true;
        refresh(); renderSel(); zoomSel();
        setHint('🤖 Ahí está lo que te decía — seleccionado en azul');
      });
    });
    var mb = $('#aiMedOk');
    if (mb) mb.addEventListener('click', corregirMedida);
    var cb = $('#aiCfgBtn');
    if (cb) cb.addEventListener('click', configurarCerebro);
    var pb = $('#aiPregOk');
    if (pb) pb.addEventListener('click', preguntarCerebro);
  }

  /* ——— EL CEREBRO: Claude dentro de la app (ver mxp-brain/README.md) ———
     El asistente de arriba mide y no cuesta nada. Esto es lo otro: poder
     PREGUNTARLE. Va por un worker propio que guarda la clave — meterla en
     esta página sería regalarla. Si no está conectado, todo lo demás
     funciona igual. */
  function cerebroCfg() {
    try {
      return {
        url: localStorage.getItem('mxpCerebroUrl') || '',
        tok: localStorage.getItem('mxpCerebroTok') || ''
      };
    } catch (e) { return { url: '', tok: '' }; }
  }
  function configurarCerebro() {
    var c = cerebroCfg();
    uiPrompt('Dirección del cerebro (el worker de Cloudflare).\n\nEj: https://cerebro-mxp.tucuenta.workers.dev\n\nDéjalo vacío para desconectarlo.', c.url, function (u) {
      if (u === null) return;
      try { localStorage.setItem('mxpCerebroUrl', u.trim()); } catch (e) {}
      if (!u.trim()) { abrirAsistente(); return; }
      uiPrompt('Tu MXP_TOKEN (la contraseña que pusiste al desplegar el worker):', c.tok, function (t) {
        if (t !== null) { try { localStorage.setItem('mxpCerebroTok', t.trim()); } catch (e) {} }
        // ping GRATIS al guardar: así se sabe AHORA si la dirección y el
        // token son buenos, no cuando falle la primera pregunta de verdad
        var c2 = cerebroCfg();
        if (c2.url) {
          setHint('🔌 Probando el cerebro…');
          fetch(c2.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-mxp-token': c2.tok },
            body: JSON.stringify({ ping: true })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.texto === 'pong') setHint('🔌 ✓ Cerebro conectado de verdad' +
              (d.modelo ? ' (' + d.modelo + ')' : '') +
              (d.cerebro ? ' · instrucciones: ' + d.cerebro : ''));
            // "Falta la pregunta" ante un ping = worker anterior al ping: la
            // dirección y el token son buenos, lo viejo es el worker
            else if (/Falta la pregunta/.test(d.error || ''))
              setHint('🔌 ⚠️ Dirección y token BIEN — el cerebro contestó. Lo que está viejo es el worker: en la laptop, cd max-power-app\\mxp-brain · git pull · wrangler deploy');
            else setHint('🔌 ✗ ' + (d.error || 'Esa dirección contesta, pero no es el cerebro MXP'));
          }).catch(function (e) { setHint('🔌 ✗ No se llega al cerebro: ' + e.message); });
        }
        abrirAsistente();
      });
    });
  }
  // resumen COMPACTO del plano: números ya medidos, no el JSON crudo
  function planoResumen() {
    var L = [];
    L.push('PAREDES (x1,y1,x2,y2 en pulgadas · tipo):');
    state.walls.forEach(function (w, i) {
      L.push(' w' + i + ' ' + Math.round(w.x1) + ',' + Math.round(w.y1) + ' → ' +
        Math.round(w.x2) + ',' + Math.round(w.y2) + '  ' + Math.round(largo(w)) + '" ' + w.type);
    });
    if (state.openings.length) {
      L.push('ABERTURAS (pared · tipo · ancho):');
      state.openings.forEach(function (o) {
        var iw = state.walls.findIndex(function (w) { return w.id === o.wallId; });
        L.push(' w' + iw + ' ' + o.type + ' ' + Math.round(o.w) + '"');
      });
    }
    var rooms = detectRoomPolys(state.walls);
    if (rooms.length) {
      L.push('CUARTOS CERRADOS:');
      rooms.forEach(function (r) {
        var nom = state.texts.filter(function (t) { return !/SQ FT/i.test(t.text) && ptInPoly(t.x, t.y, r.poly); })[0];
        L.push(' ' + (nom ? nom.text : '(sin nombre)') + ' — ' + r.sqft + ' sq ft');
      });
    }
    /* TODAS las etiquetas escritas, cierre o no cierre el cuarto.
       28/08: Edgar preguntó por la cocina y el cerebro dijo que no había —
       y sí había un rótulo KITCHEN. Los nombres solo viajaban si el cuarto
       salía como polígono CERRADO, y en un plano armado por piezas casi
       ninguno cierra todavía. El rótulo es dato del oficio: va siempre. */
    var etq = state.texts.filter(function (t) { return t.text && !/SQ FT/i.test(t.text); });
    if (etq.length) {
      L.push('RÓTULOS ESCRITOS EN EL PLANO (nombre · dónde está, en pulgadas):');
      etq.forEach(function (t) {
        L.push(' "' + t.text + '" en ' + Math.round(t.x) + ',' + Math.round(t.y));
      });
      L.push('OJO: un rótulo que no salga arriba en CUARTOS CERRADOS existe igual. ' +
        'Puede ser (a) una cocina, comedor o family room ABIERTOS, que en planta ' +
        'de verdad no cierran contra nada y así es como son; o (b) un cuarto al ' +
        'que todavía le falta cerrar una esquina. NO des por hecho que falta: si ' +
        'necesitas saber cuál de las dos es, míralo por las paredes de alrededor ' +
        'o pregúntaselo a Edgar.');
    }
    if (state.areas && state.areas.length) {
      L.push('ÁREAS MARCADAS A MANO:');
      state.areas.forEach(function (a) {
        L.push(' ' + (a.name || '(sin nombre)') + (a.sqft ? ' — ' + a.sqft + ' sq ft' : ''));
      });
    }
    // el armado por piezas, contado (así el cerebro sabe en qué fase está Edgar)
    var pzs = piezasConNombre();
    if (pzs.length > 1) {
      L.push('PIEZAS SUELTAS EN LA HOJA: ' + pzs.length + ' — Edgar está ARMANDO el rompecabezas.');
      pzs.forEach(function (pz) {
        var ftp = 0;
        pz.ws.forEach(function (w) { ftp += Math.hypot(w.x2 - w.x1, w.y2 - w.y1); });
        L.push(' · ' + (pz.noms[0] || '(sin rótulo)') + ' — ' + pz.ws.length + ' paredes, ' + Math.round(ftp / 12) + ' ft');
      });
      L.push('(Él puede escribir en el chat: "suelda el X con el Y" y la app lo hace sola, gratis.)');
    }
    if (state.guia && state.guia.length) {
      L.push('HAY GUÍA en la hoja (' + state.guia.length + ' tramos): el contorno del survey o la casa fantasma — referencia, no cuenta en materiales.');
    }
    var an = analizarPlano();
    if (an.av.length) {
      L.push('DIAGNÓSTICO YA MEDIDO POR LA APP:');
      an.av.forEach(function (a) { L.push(' [' + (a.sev === 0 ? 'GRAVE' : a.sev === 1 ? 'AVISO' : 'nota') + '] ' + a.tit); });
    }
    return L.join('\n');
  }
  /* El cerebro contesta en markdown (tablas de circuitos, negritas, títulos).
     Pintándolo como texto plano, la tabla salía en crudo con las barras.
     Esto la pinta de verdad. Se escapa TODO el HTML primero: lo que llega
     de fuera nunca se inyecta tal cual. */
  function mdEsc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function mdLinea(t) {
    return mdEsc(t)
      .replace(/`([^`]+)`/g, '<code style="background:#f0f0ec;padding:1px 4px;border-radius:3px;font-size:11.5px">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  }
  function mdMini(txt) {
    var ls = String(txt || '').split('\n'), out = [], i = 0;
    var TD = 'padding:3px 7px;border:1px solid #d8d8d2;text-align:left';
    function esFila(l) { return /^\s*\|.*\|\s*$/.test(l); }
    function celdas(l) {
      return l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
    }
    while (i < ls.length) {
      var l = ls[i];
      // tabla: fila, separador de guiones, y las filas que sigan
      if (esFila(l) && i + 1 < ls.length && /^\s*\|[\s:|-]+\|\s*$/.test(ls[i + 1])) {
        var enc = celdas(l), cuerpo = [];
        i += 2;
        while (i < ls.length && esFila(ls[i])) { cuerpo.push(celdas(ls[i])); i++; }
        out.push('<div style="overflow-x:auto;margin:7px 0"><table style="border-collapse:collapse;font-size:11.5px;min-width:100%">' +
          '<thead><tr>' + enc.map(function (c) {
            return '<th style="' + TD + ';background:#f4f4ef;font-weight:700">' + mdLinea(c) + '</th>';
          }).join('') + '</tr></thead><tbody>' +
          cuerpo.map(function (f) {
            return '<tr>' + f.map(function (c) { return '<td style="' + TD + '">' + mdLinea(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }
      var h = /^(#{1,4})\s+(.*)$/.exec(l);
      if (h) {
        var tam = [15, 14, 13, 12.5][h[1].length - 1];
        out.push('<div style="font-weight:700;font-size:' + tam + 'px;margin:10px 0 4px">' + mdLinea(h[2]) + '</div>');
        i++; continue;
      }
      var li = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(l);
      if (li) {
        var items = [];
        while (i < ls.length) {
          var m2 = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(ls[i]);
          if (!m2) break;
          items.push('<li style="margin:2px 0">' + mdLinea(m2[2]) + '</li>');
          i++;
        }
        out.push('<ul style="margin:5px 0 5px 18px;padding:0">' + items.join('') + '</ul>');
        continue;
      }
      if (!l.trim()) { out.push('<div style="height:6px"></div>'); i++; continue; }
      out.push('<div>' + mdLinea(l) + '</div>');
      i++;
    }
    return out.join('');
  }


  /* ══════════ 💬 CHAT FLOTANTE ══════════
     Pedido de Edgar (28/08): "que no tenga que ser obligado entrando en la
     parte de asistente, sino que se quede un chat flotando y me permita
     seguir trabajando en el plano mientras te pregunto".

     Va fuera del lienzo, así que no roba clics al dibujo. Se arrastra por la
     barra de arriba, se encoge a una burbuja, y recuerda dónde lo dejaste.

     Y CONVERSA: mantiene el hilo, así que "¿y si la estufa es de gas?" se
     entiende sin repetir la pregunta entera. El plano solo se vuelve a mandar
     si CAMBIÓ desde la última pregunta — una conversación de diez turnos no
     cuesta como diez preguntas nuevas. */
  var chatMsgs = [], chatUltDatos = null, chatCentavos = 0, chatOcupado = false;

  function chatPos() {
    try { return JSON.parse(localStorage.getItem('mxpChatPos') || 'null'); } catch (e) { return null; }
  }
  function chatGuardaPos(x, y) {
    try { localStorage.setItem('mxpChatPos', JSON.stringify({ x: x, y: y })); } catch (e) {}
  }
  function chatEl() { return document.getElementById('chatFlot'); }

  function chatMonta() {
    if (chatEl()) return chatEl();
    var d = document.createElement('div');
    d.id = 'chatFlot';
    d.innerHTML =
      '<div id="chatCab">' +
        '<span id="chatTit">💬 Claude</span>' +
        '<span id="chatCoste"></span>' +
        '<button id="chatLimpiar" title="Empezar una conversación nueva">🗑</button>' +
        '<button id="chatMin" title="Encoger">–</button>' +
      '</div>' +
      '<div id="chatCuerpo"></div>' +
      '<div id="chatPie">' +
        '<textarea id="chatTxt" rows="2" placeholder="Pregúntale sobre este plano…"></textarea>' +
        '<button id="chatEnv" title="Enviar (Enter)">➤</button>' +
      '</div>';
    document.body.appendChild(d);

    var p = chatPos();
    if (p) { d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; d.style.right = 'auto'; d.style.bottom = 'auto'; }
    chatClamp();

    // arrastrar por la barra de arriba
    var cab = document.getElementById('chatCab'), ar = null;
    cab.addEventListener('pointerdown', function (ev) {
      if (/BUTTON/.test(ev.target.tagName)) return;
      var r = d.getBoundingClientRect();
      ar = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      d.style.right = 'auto'; d.style.bottom = 'auto';
      cab.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    cab.addEventListener('pointermove', function (ev) {
      if (!ar) return;
      d.style.left = (ev.clientX - ar.dx) + 'px';
      d.style.top = (ev.clientY - ar.dy) + 'px';
    });
    function suelta() {
      if (!ar) return;
      ar = null; chatClamp();
      var r = d.getBoundingClientRect(); chatGuardaPos(r.left, r.top);
    }
    cab.addEventListener('pointerup', suelta);
    cab.addEventListener('pointercancel', suelta);

    document.getElementById('chatMin').addEventListener('click', function () { chatCierra(); });
    document.getElementById('chatEnv').addEventListener('click', chatEnvia);
    document.getElementById('chatLimpiar').addEventListener('click', function () {
      chatMsgs = []; chatUltDatos = null; chatCentavos = 0;
      chatPinta(); chatCoste();
      setHint('💬 Conversación nueva — el plano se vuelve a mandar entero');
    });
    var t = document.getElementById('chatTxt');
    t.addEventListener('keydown', function (ev) {
      // Enter envía, Shift+Enter hace párrafo. Y nada de aquí dentro
      // toca el plano: ni Escape cancela el dibujo, ni Ctrl+Z lo deshace.
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); chatEnvia(); }
      ev.stopPropagation();
    });
    return d;
  }

  // que no se quede fuera de la pantalla (pasa al girar el iPad)
  function chatClamp() {
    var d = chatEl(); if (!d) return;
    var r = d.getBoundingClientRect();
    if (!r.width) return;
    var x = Math.min(Math.max(4, r.left), window.innerWidth - r.width - 4);
    var y = Math.min(Math.max(4, r.top), window.innerHeight - Math.min(r.height, 90) - 4);
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.right = 'auto'; d.style.bottom = 'auto';
  }
  window.addEventListener('resize', function () { if (chatEl()) chatClamp(); });

  // foco: SOLO cuando Edgar lo abre a propósito. Al restaurarlo solo al
  // cargar la página no debe robar el teclado — si no, la 'w' de pared se
  // escribiría en el chat en vez de coger la herramienta.
  function chatAbre(foco) {
    var c = cerebroCfg();
    if (!c.url) {
      uiConfirm('El chat necesita el cerebro conectado.\n\n¿Lo configuras ahora? ' +
        '(dirección del worker y tu MXP_TOKEN — están en MAÑANA.md)', function (ok) {
        if (ok) configurarCerebro();
      });
      return;
    }
    chatMonta();
    chatEl().classList.remove('oculto');
    var b = document.getElementById('chatBurbuja'); if (b) b.classList.add('oculto');
    try { localStorage.setItem('mxpChatOpen', '1'); } catch (e) {}
    chatPinta();
    if (foco !== false) { var t = document.getElementById('chatTxt'); if (t) t.focus(); }
  }
  function chatCierra() {
    var d = chatEl(); if (d) d.classList.add('oculto');
    var b = document.getElementById('chatBurbuja'); if (b) b.classList.remove('oculto');
    try { localStorage.setItem('mxpChatOpen', '0'); } catch (e) {}
  }

  function chatCoste() {
    var e = document.getElementById('chatCoste');
    if (e) e.textContent = chatCentavos ? chatCentavos.toFixed(1) + ' ¢' : '';
  }
  function chatPinta() {
    var c = document.getElementById('chatCuerpo'); if (!c) return;
    if (!chatMsgs.length) {
      c.innerHTML = '<div class="chatVacio">Pregúntale lo que quieras sobre <b>este</b> plano.' +
        '<br><br>Va con las paredes, las aberturas, los cuartos y el diagnóstico ya medido.' +
        '<br><br>Sigue el hilo: puedes repreguntar sin repetirlo todo.</div>';
      return;
    }
    c.innerHTML = chatMsgs.map(function (m) {
      if (m.rol === 'user') return '<div class="chatYo">' + mdEsc(m.txt) + '</div>';
      if (m.rol === 'error') return '<div class="chatErr">⚠️ ' + mdEsc(m.txt) + '</div>';
      if (m.rol === 'pensando') return '<div class="chatEl chatPensando">⏳ Pensando…</div>';
      return '<div class="chatEl">' + mdMini(m.txt) + '</div>';
    }).join('');
    c.scrollTop = c.scrollHeight;
  }


  /* ══════════ 🧲 ÓRDENES DE ARMADO POR PALABRAS ══════════
     Edgar (28/08): "yo le podía decir a usted como asistente de la app
     'me puedes soldar el master bedroom con el closet' y usted lo hacía
     correctamente". Se hace AQUÍ, en la app, sin gastar un centavo: es
     geometría nuestra, no hace falta preguntarle a nadie.

     El chat detecta la orden, busca las dos piezas por su rótulo, calza la
     chica contra la grande (hasta 10 pies) y suelda SOLO esa costura. */
  function quitaAcentos(t) {
    return String(t || '').toUpperCase()
      .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
      .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // piezas de la hoja, cada una con su rótulo (el texto que le cae dentro)
  function piezasConNombre() {
    var W = state.walls;
    var pad = W.map(function () { return -1; }), np = 0;
    function toca(a, b) {
      var pa = [[a.x1, a.y1], [a.x2, a.y2]], pb = [[b.x1, b.y1], [b.x2, b.y2]];
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++)
        if (Math.hypot(pa[i][0] - pb[j][0], pa[i][1] - pb[j][1]) < 18) return true;
      return false;
    }
    for (var i = 0; i < W.length; i++) {
      if (pad[i] >= 0) continue;
      var id = np++, pila = [i]; pad[i] = id;
      while (pila.length) {
        var k = pila.pop();
        for (var j = 0; j < W.length; j++)
          if (pad[j] < 0 && toca(W[k], W[j])) { pad[j] = id; pila.push(j); }
      }
    }
    var piezas = [];
    for (var q = 0; q < np; q++) piezas.push({ ws: [], bb: { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 }, noms: [] });
    W.forEach(function (w, ii) {
      var pz = piezas[pad[ii]];
      pz.ws.push(w);
      pz.bb.x1 = Math.min(pz.bb.x1, w.x1, w.x2); pz.bb.y1 = Math.min(pz.bb.y1, w.y1, w.y2);
      pz.bb.x2 = Math.max(pz.bb.x2, w.x1, w.x2); pz.bb.y2 = Math.max(pz.bb.y2, w.y1, w.y2);
    });
    state.texts.forEach(function (t) {
      if (!t.text || /SQ FT/i.test(t.text)) return;
      piezas.forEach(function (pz) {
        if (t.x >= pz.bb.x1 - 12 && t.x <= pz.bb.x2 + 12 && t.y >= pz.bb.y1 - 12 && t.y <= pz.bb.y2 + 12)
          pz.noms.push(quitaAcentos(t.text));
      });
    });
    return piezas;
  }
  function buscaPieza(piezas, nombre) {
    var n = quitaAcentos(nombre);
    if (!n) return null;
    var hit = null;
    piezas.forEach(function (pz) {
      pz.noms.forEach(function (nm) {
        if (nm === n && !hit) hit = pz;
      });
    });
    if (hit) return hit;
    piezas.forEach(function (pz) {
      pz.noms.forEach(function (nm) {
        if (!hit && (nm.indexOf(n) >= 0 || n.indexOf(nm) >= 0)) hit = pz;
      });
    });
    return hit;
  }
  // ¿la frase es una orden de soldar? → {a, b} o null
  function ordenDeSoldar(q) {
    var t = quitaAcentos(q);
    var m = /(?:SUELDA(?:ME)?|SOLDA(?:R|RME|ME)?|SOLDAR|UNE(?:ME)?|UNIR|PEGA(?:ME)?|PEGAR|CALZA(?:ME)?|CALZAR|JUNTA(?:ME)?|JUNTAR)\s+(?:EL |LA |LOS |LAS )?(.+?)\s+(?:CON|AL?|Y)\s+(?:EL |LA |LOS |LAS )?(.+)$/.exec(t);
    if (!m) return null;
    return { a: m[1].trim(), b: m[2].trim() };
  }
  function soldarPorNombre(nomA, nomB) {
    var piezas = piezasConNombre();
    if (piezas.length < 2) return { err: 'Solo veo una pieza en la hoja — no hay nada que soldar con nada.' };
    var A = buscaPieza(piezas, nomA), B = buscaPieza(piezas, nomB);
    var vistos = [];
    piezas.forEach(function (pz) { pz.noms.forEach(function (n) { if (vistos.indexOf(n) < 0) vistos.push(n); }); });
    if (!A || !B) {
      var falta = !A ? nomA : nomB;
      return { err: 'No encuentro ninguna pieza que se llame "' + falta + '".' +
        (vistos.length ? ' Los rótulos que veo: ' + vistos.join(', ') + '.' : ' Ninguna pieza tiene rótulo — ponles nombre con la herramienta Text.') };
    }
    if (A === B) return { err: '"' + nomA + '" y "' + nomB + '" son la misma pieza — ya están unidas.' };
    // la grande se queda quieta; la chica viene
    var LA = 0, LB = 0;
    A.ws.forEach(function (w) { LA += Math.hypot(w.x2 - w.x1, w.y2 - w.y1); });
    B.ws.forEach(function (w) { LB += Math.hypot(w.x2 - w.x1, w.y2 - w.y1); });
    var fija = LA >= LB ? A : B, mov = LA >= LB ? B : A;
    var m4 = calceCuatro(mov.ws, fija.ws, { maxRot: 20, snap: 120 });
    var c = m4 && m4.c;
    pushUndo();
    var girada = 0;
    if (c) {
      var refs = mov.ws.map(function (w) { return { kind: 'wall', id: w.id }; });
      if (m4.pre) rotateRefs(refs, m4.pre, m4.cx, m4.cy);
      aplicarCalce(refs, c);
      girada = Math.abs(c.deg) + (m4.pre || 0);
    }
    // soldar SOLO esas dos piezas (más las paredes de la costura)
    selGroup = A.ws.concat(B.ws).map(function (w) { return { kind: 'wall', id: w.id }; });
    var antesW = state.walls.length, antesA = aberturasVivas().length;
    window.__weldOK = 1;
    try { $('#btnWeld').click(); } finally { window.__weldOK = 0; }
    selGroup = null; renderSel(); showProps();
    var dW = antesW - state.walls.length, dA = antesA - aberturasVivas().length;
    refresh(); zoomFit();
    return {
      ok: '🧲 Hecho: **' + nomA.toUpperCase() + '** + **' + nomB.toUpperCase() + '**.\n' +
        (c ? '· Calzadas con ' + fmtFtIn(c.solape) + ' de pared en común' +
             (girada >= 0.1 ? ', giré ' + girada.toFixed(1) + '°' : '') +
             (c.puertas ? ' · las puertas casan cara a cara ✓' : '') + '\n'
           : '· Ya estaban pegadas — solo soldé la costura\n') +
        '· ' + (dW > 0 ? dW + ' pared(es) fundidas en la costura' : 'ninguna pared sobraba') +
        (dA > 0 ? '\n· ' + dA + ' puerta(s)/ventana(s) repetidas fundidas en una' : '') +
        '\n\nSi no te gusta cómo quedó: **Ctrl+Z** lo deshace entero.'
    };
  }

  function chatEnvia() {
    if (chatOcupado) return;
    var t = document.getElementById('chatTxt'), q = (t.value || '').trim();
    if (!q) return;
    // ¿es una orden de armado? Eso lo hace la app aquí mismo: gratis y exacto
    var ord = ordenDeSoldar(q);
    if (ord) {
      chatMsgs.push({ rol: 'user', txt: q });
      t.value = '';
      var res = soldarPorNombre(ord.a, ord.b);
      chatMsgs.push(res.err ? { rol: 'error', txt: res.err } : { rol: 'claude', txt: res.ok });
      chatPinta();
      return;
    }
    var c = cerebroCfg();
    if (!c.url) { chatMsgs.push({ rol: 'error', txt: 'Falta la dirección del cerebro (⚙ Ajustes en el Asistente).' }); chatPinta(); return; }

    // el plano SOLO se manda si cambió desde la última vez: una conversación
    // de diez turnos no puede costar como diez preguntas nuevas
    var resumen = planoResumen();
    var manda = resumen !== chatUltDatos ? resumen : '';
    var hist = chatMsgs.filter(function (m) { return m.rol === 'user' || m.rol === 'claude'; })
      .map(function (m) { return { rol: m.rol, txt: m.txt }; });

    chatMsgs.push({ rol: 'user', txt: q });
    chatMsgs.push({ rol: 'pensando' });
    t.value = ''; chatOcupado = true; chatPinta();

    fetch(c.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mxp-token': c.tok },
      body: JSON.stringify({ origen: 'planos', pregunta: q, datos: manda, historial: hist })
    }).then(function (r) { return r.json(); }).then(function (d) {
      chatOcupado = false;
      chatMsgs = chatMsgs.filter(function (m) { return m.rol !== 'pensando'; });
      if (d.error) { chatMsgs.push({ rol: 'error', txt: d.error + (d.detalle ? ' — ' + d.detalle : '') }); }
      else {
        if (manda) chatUltDatos = resumen;      // ya sabe cómo está el plano
        chatMsgs.push({ rol: 'claude', txt: d.texto });
        if (d.uso && d.uso.centavos) chatCentavos += Number(d.uso.centavos) || 0;
        chatCoste();
      }
      chatPinta();
    }).catch(function (e) {
      chatOcupado = false;
      chatMsgs = chatMsgs.filter(function (m) { return m.rol !== 'pensando'; });
      chatMsgs.push({ rol: 'error', txt: 'No se pudo llegar al cerebro (' + e.message + '). ¿Hay internet?' });
      chatPinta();
    });
  }

  // la burbuja que lo llama, siempre a mano en la esquina
  (function () {
    var b = document.createElement('button');
    b.id = 'chatBurbuja'; b.textContent = '💬';
    b.title = 'Preguntarle a Claude sin salir del plano';
    b.addEventListener('click', function () { chatAbre(true); });
    document.body.appendChild(b);
    var abierto = false;
    try { abierto = localStorage.getItem('mxpChatOpen') === '1'; } catch (e) {}
    if (abierto && cerebroCfg().url) setTimeout(function () { chatAbre(false); }, 300);
  })();

  function preguntarCerebro() {
    var c = cerebroCfg(), out = $('#aiResp'), q = ($('#aiPreg').value || '').trim();
    if (!q) { out.textContent = '⚠️ Escribe la pregunta.'; return; }
    out.textContent = '⏳ Pensando…';
    var btn = $('#aiPregOk'); if (btn) btn.disabled = true;
    fetch(c.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mxp-token': c.tok },
      body: JSON.stringify({ origen: 'planos', pregunta: q, datos: planoResumen() })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (btn) btn.disabled = false;
      if (d.error) { out.textContent = '⚠️ ' + d.error + (d.detalle ? '\n' + d.detalle : ''); return; }
      out.innerHTML = mdMini(d.texto) +
        (d.uso ? '<div style="margin-top:8px;color:#777;font-size:11px">— ' + mdEsc(d.uso.centavos) + ' centavos</div>' : '');
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      out.textContent = '⚠️ No se pudo llegar al cerebro (' + e.message + '). ¿Hay internet? ¿Está bien la dirección en ⚙ Ajustes?';
    });
  }

  /* ——— 🪄 IA: plano desde imagen — el cerebro lee la foto del plano y
     devuelve los cuartos; aquí se arman como piezas rectangulares SUELTAS
     para acomodar y soldar con las herramientas de siempre ——— */

  // pies-pulgadas ("12'1\"" o "12'1") a PULGADAS del mundo; null si no parsea
  function piesAPulg(s) {
    var m = String(s == null ? '' : s).trim().match(/^(\d+)'\s*(\d+)?/);
    if (!m) return null;
    return parseInt(m[1], 10) * 12 + (m[2] ? parseInt(m[2], 10) : 0);
  }

  // constructor determinista (NO llama a la red).
  // pl = { cuartos:[{nombre, ancho, alto, x, y, tipo}], notas } con x,y en 0-100
  function planoDesdeJSON(pl) {
    var ESC = 8;   // 0-100 → pulgadas: una imagen típica abarca ~66 ft (100*8 = 800")
    var saltados = 0, listos = [];
    (Array.isArray(pl && pl.cuartos) ? pl.cuartos : []).forEach(function (c) {
      if (!c || typeof c !== 'object') { saltados++; return; }
      var an = piesAPulg(c.ancho), al = piesAPulg(c.alto);
      if (!an || !al) { saltados++; return; }
      // x/y del modelo: si vienen rotos (Infinity, NaN) no tumban la hoja
      var px = Number(c.x), py = Number(c.y);
      if (!isFinite(px)) px = 0;
      if (!isFinite(py)) py = 0;
      var caja = null;
      if (c.caja && isFinite(Number(c.caja.x0)) && isFinite(Number(c.caja.x1)) &&
          isFinite(Number(c.caja.y0)) && isFinite(Number(c.caja.y1)) &&
          Number(c.caja.x1) > Number(c.caja.x0) && Number(c.caja.y1) > Number(c.caja.y0)) {
        caja = { x0: Number(c.caja.x0), x1: Number(c.caja.x1),
                 y0: Number(c.caja.y0), y1: Number(c.caja.y1) };
      }
      // contorno = recorrido de perímetro (traverse): [{rumbo, largo, pared}]
      // — la forma REAL del cuarto: bahías, chaflanes a 45°, muescas, lados
      // abiertos. Se valida aquí; el cierre se comprueba al construir.
      var RUMBOS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
                     NE: [0.7071, -0.7071], SE: [0.7071, 0.7071],
                     SW: [-0.7071, 0.7071], NW: [-0.7071, -0.7071] };
      var cont = null;
      if (Array.isArray(c.contorno) && c.contorno.length >= 3) {
        cont = [];
        c.contorno.forEach(function (tr) {
          if (!tr || typeof tr !== 'object' || !cont) return;
          var u = RUMBOS[String(tr.rumbo || '').toUpperCase()];
          var Lg = piesAPulg(tr.largo);
          if (!u || Lg === null || Lg <= 0 || Lg > 2400) { cont = null; return; }
          cont.push({ dx: u[0] * Lg, dy: u[1] * Lg, pared: tr.pared !== false });
        });
        if (cont && cont.length < 3) cont = null;
      }
      listos.push({
        nombre: c.nombre, tipo: String(c.tipo || '').toLowerCase(),
        an: an, al: al, ab: Array.isArray(c.aberturas) ? c.aberturas : [], caja: caja, cont: cont,
        cx: Math.max(0, Math.min(100, px)) * ESC,
        cy: Math.max(0, Math.min(100, py)) * ESC
      });
    });
    // AUTOCALIBRACIÓN: si la pasada 1 trajo las cajas, la escala del plano se
    // deduce de los propios datos — mediana de (%-de-imagen / pulgada real)
    // por eje (la imagen no es cuadrada: cada eje tiene su escala). Así la
    // posición de cada pieza queda consistente con su tamaño real y el
    // conjunto aterriza como una casa, no como un montón.
    function mediana(v) { v = v.slice().sort(function (p, q) { return p - q; }); return v[v.length >> 1]; }
    var kxs = [], kys = [];
    listos.forEach(function (c) {
      if (!c.caja) return;
      kxs.push((c.caja.x1 - c.caja.x0) / c.an);
      kys.push((c.caja.y1 - c.caja.y0) / c.al);
    });
    if (kxs.length >= 3) {
      var kx = mediana(kxs), ky = mediana(kys);
      if (kx > 0 && ky > 0) {
        listos.forEach(function (c) {
          if (!c.caja) return;
          c.cx = (c.caja.x0 + c.caja.x1) / 2 / kx;
          c.cy = (c.caja.y0 + c.caja.y1) / 2 / ky;
        });
      }
    }
    if (!listos.length) {
      setHint('⚠️ El cerebro no devolvió ningún cuarto con medidas legibles');
      return { cuartos: 0, aberturas: 0, saltados: saltados };
    }
    // bbox del plano completo (se coloca como UNA pieza, al lado de lo que
    // ya haya en la hoja — mismo cursor de cuadrícula que importRoomScan)
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    listos.forEach(function (c) {
      minx = Math.min(minx, c.cx - c.an / 2); maxx = Math.max(maxx, c.cx + c.an / 2);
      miny = Math.min(miny, c.cy - c.al / 2); maxy = Math.max(maxy, c.cy + c.al / 2);
    });
    var anchoPieza = maxx - minx, altoPieza = maxy - miny;
    var ANCHO_MAX = 110 * 12, SEP = 72;
    // hoja vacía: el plano se queda donde el cerebro lo puso (offset 0,0)
    if (!state.walls.length) { gridX = minx; gridY = miny; gridRowH = 0; }
    if (state.walls.length && gridX + anchoPieza > ANCHO_MAX) {
      gridX = 24;                          // se acabó la fila: baja una
      gridY = gridY + gridRowH + SEP;
      gridRowH = 0;
    }
    var baseX = gridX, baseY = gridY;
    gridX += anchoPieza + SEP;
    gridRowH = Math.max(gridRowH, altoPieza);
    var offX = baseX - minx, offY = baseY - miny;

    pushUndo();      // UNA sola vez: paredes + aberturas + textos en el mismo snapshot
    var nAb = 0, sinCerrar = 0;
    // colocar una abertura sobre una pared ya construida, con reglas de obra
    function ponAbertura(wallId, wx1, wy1, wx2, wy2, tipoA0, anchoA, centro0) {
      var L = Math.hypot(wx2 - wx1, wy2 - wy1);
      if (L < 20) return false;
      var tipoA = OPEN_NAMES[tipoA0] ? tipoA0 : 'door';
      var wA = Number(anchoA) > 0 && isFinite(Number(anchoA)) ? Number(anchoA) : OPEN_DEFAULT[tipoA];
      if (wA > L - 8) wA = Math.max(12, L - 8);
      var centro = centro0;
      // reglas de obra: jamba a 4" de la esquina, o centrado exacto
      if (centro - wA / 2 < 9) centro = 4 + wA / 2;
      else if (L - (centro + wA / 2) < 9) centro = L - 4 - wA / 2;
      else if (Math.abs(centro - L / 2) < 12) centro = L / 2;
      centro = Math.max(wA / 2 + 2, Math.min(L - wA / 2 - 2, centro));
      state.openings.push({ id: uid(), wallId: wallId, pos: Math.round(centro), w: Math.round(wA), type: tipoA });
      nAb++;
      return true;
    }
    listos.forEach(function (c) {
      var ty = 'drywall', tt = WALL_TYPES.drywall.t;
      if (/porch|pool/.test(c.tipo)) { ty = 'screen'; tt = WALL_TYPES.screen.t; }
      else if (/garage/.test(c.tipo)) { ty = 'block'; tt = WALL_TYPES.block.t; }

      if (c.cont) {
        // ——— PIEZA POLÍGONO: el recorrido de perímetro ———
        var pts = [[0, 0]], px2 = 0, py2 = 0, perim = 0;
        c.cont.forEach(function (tr) { px2 += tr.dx; py2 += tr.dy; perim += Math.hypot(tr.dx, tr.dy); pts.push([px2, py2]); });
        var errX = pts[pts.length - 1][0], errY = pts[pts.length - 1][1];
        var errC = Math.hypot(errX, errY);
        if (errC > Math.max(12, perim * 0.02)) {
          // el recorrido no cierra: la lectura está mala. Antes de dibujar
          // mentira, esta pieza cae al rectángulo y se avisa.
          sinCerrar++;
          c.cont = null;
        } else if (errC > 0.01) {
          // regla de Bowditch (ajuste de traverse): el error de cierre se
          // reparte proporcional a la distancia recorrida — agrimensura pura
          var acum = 0;
          for (var vi = 1; vi < pts.length; vi++) {
            acum += Math.hypot(c.cont[vi - 1].dx, c.cont[vi - 1].dy);
            pts[vi][0] -= errX * (acum / perim);
            pts[vi][1] -= errY * (acum / perim);
          }
        }
        if (c.cont) {
          // centrar la caja del polígono donde aterriza la pieza
          var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          pts.forEach(function (p) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); });
          var dxC = c.cx + offX - (bx0 + bx1) / 2, dyC = c.cy + offY - (by0 + by1) / 2;
          var muros = [];
          for (var ei = 0; ei < c.cont.length; ei++) {
            var A = pts[ei], B = pts[ei + 1];
            var w2 = null;
            if (c.cont[ei].pared) {
              w2 = { id: uid(), x1: Math.round(A[0] + dxC), y1: Math.round(A[1] + dyC),
                     x2: Math.round(B[0] + dxC), y2: Math.round(B[1] + dyC), type: ty, t: tt };
              if (Math.hypot(w2.x2 - w2.x1, w2.y2 - w2.y1) >= 2) state.walls.push(w2); else w2 = null;
            }
            muros.push(w2);
          }
          // aberturas por tramo: {tramo: índice del recorrido, desde, tipo, ancho}
          c.ab.forEach(function (ab) {
            if (!ab || typeof ab !== 'object') return;
            var w3 = muros[Number(ab.tramo)];
            if (!w3) return;
            var desde = piesAPulg(ab.desde);
            var L3 = Math.hypot(w3.x2 - w3.x1, w3.y2 - w3.y1);
            var centro = desde !== null ? desde + (Number(ab.ancho) > 0 ? Number(ab.ancho) : OPEN_DEFAULT[OPEN_NAMES[ab.tipo] ? ab.tipo : 'door']) / 2
              : (isFinite(Number(ab.pos)) ? Math.max(0, Math.min(100, Number(ab.pos))) / 100 * L3 : null);
            if (centro === null) return;
            ponAbertura(w3.id, w3.x1, w3.y1, w3.x2, w3.y2, ab.tipo, ab.ancho, centro);
          });
          var ctx0 = (bx0 + bx1) / 2 + dxC, cty0 = (by0 + by1) / 2 + dyC;
          if (c.nombre) {
            var sq2 = Math.round(c.an * c.al / 144), ls2 = sq2 < 120 ? 7 : 10;
            state.texts.push({ id: uid(), x: Math.round(ctx0 - String(c.nombre).length * ls2 * 0.29), y: Math.round(cty0), text: c.nombre, size: ls2 });
          }
          return;
        }
      }

      // ——— PIEZA RECTÁNGULO (sin contorno, o con recorrido que no cerró) ———
      var x1 = Math.round(c.cx + offX - c.an / 2), y1 = Math.round(c.cy + offY - c.al / 2);
      var x2 = x1 + Math.round(c.an), y2 = y1 + Math.round(c.al);
      var idN = uid(), idE = uid(), idS = uid(), idW = uid();
      state.walls.push({ id: idN, x1: x1, y1: y1, x2: x2, y2: y1, type: ty, t: tt });
      state.walls.push({ id: idE, x1: x2, y1: y1, x2: x2, y2: y2, type: ty, t: tt });
      state.walls.push({ id: idS, x1: x2, y1: y2, x2: x1, y2: y2, type: ty, t: tt });
      state.walls.push({ id: idW, x1: x1, y1: y2, x2: x1, y2: y1, type: ty, t: tt });
      // aberturas por lado: N/S desde la esquina IZQUIERDA, E/W desde la SUPERIOR
      var Ln = x2 - x1, Le = y2 - y1;
      var mapa = { N: { id: idN, L: Ln, inv: false, a: [x1, y1, x2, y1] },
                   S: { id: idS, L: Ln, inv: true, a: [x2, y2, x1, y2] },
                   E: { id: idE, L: Le, inv: false, a: [x2, y1, x2, y2] },
                   W: { id: idW, L: Le, inv: true, a: [x1, y2, x1, y1] } };
      c.ab.forEach(function (ab) {
        if (!ab || typeof ab !== 'object') return;
        var m = mapa[String(ab.lado || '').toUpperCase()];
        if (!m) return;
        var tipoA = OPEN_NAMES[ab.tipo] ? ab.tipo : 'door';
        var wA = Number(ab.ancho) > 0 && isFinite(Number(ab.ancho)) ? Number(ab.ancho) : OPEN_DEFAULT[tipoA];
        var centro = null, desde = piesAPulg(ab.desde);
        if (desde !== null) centro = desde + wA / 2;
        else if (isFinite(Number(ab.pos))) centro = Math.max(0, Math.min(100, Number(ab.pos))) / 100 * m.L;
        if (centro === null) return;
        if (m.inv) centro = m.L - centro;
        ponAbertura(m.id, m.a[0], m.a[1], m.a[2], m.a[3], ab.tipo, ab.ancho, centro);
      });
      if (c.nombre) {
        var sqft = Math.round(c.an * c.al / 144);
        var ls = sqft < 120 ? 7 : 10;
        state.texts.push({ id: uid(), x: Math.round((x1 + x2) / 2 - String(c.nombre).length * ls * 0.29), y: Math.round((y1 + y2) / 2), text: c.nombre, size: ls });
      }
    });
    refresh(); zoomFit();
    setHint('✔ ' + listos.length + ' cuartos' + (nAb ? ' + ' + nAb + ' puertas/ventanas' : '') +
      ' del plano — ajusta y suelda las piezas' +
      (saltados ? ' · ' + saltados + ' sin medida legible' : '') +
      (sinCerrar ? ' · ⚠ ' + sinCerrar + ' contorno(s) no cerraron y quedaron como caja' : ''));
    return { cuartos: listos.length, aberturas: nAb, saltados: saltados, sinCerrar: sinCerrar };
  }

  // el flujo con el cerebro: consigue la imagen y se la manda.
  // DOS PASADAS: (1) el plano entero → cuartos con sus medidas impresas y la
  // caja de cada uno; (2) un RECORTE por cuarto a máxima resolución → las
  // aberturas con su distancia a la esquina. En el plano entero una puerta
  // mide ~20 px y la posición sale a ±1-2 ft; en el recorte mide ~200 px y
  // sale a pulgadas. Eso, más las reglas de obra del importador (jamba a 4",
  // centrado exacto), es lo que hace el resultado de nivel arquitectónico.
  var planoEnVuelo = false;
  function planoDesdeImagen() {
    if (planoEnVuelo) { setHint('🪄 Ya estoy leyendo un plano — espera a que termine'); return; }
    var c = cerebroCfg();
    if (!c.url) {
      uiConfirm('Falta la dirección del cerebro (el worker de Cloudflare). ¿La configuramos ahora?', function (ok) { if (ok) configurarCerebro(); });
      return;
    }
    // si hay fondo se usa ese (la ORIGINAL si "Solo líneas" está activo:
    // la versión transparente saldría negra al pasarla a JPEG)
    if (state.bg && state.bg.url) { planoImgManda(state.bg.origUrl || state.bg.url); return; }
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { planoImgManda(fr.result); };
      fr.readAsDataURL(f);
    });
    inp.click();
  }
  function pideCerebro(cuerpo) {
    var c = cerebroCfg();
    cuerpo.token = c.tok;
    return fetch(c.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mxp-token': c.tok },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); });
  }
  // recorte de un cuarto del plano ORIGINAL (a plena resolución, no del
  // reducido de la pasada 1) con 8% de margen para que se vean las paredes
  function recorteCuarto(img, caja) {
    var W = img.width, H = img.height;
    var x0 = Math.max(0, Math.min(100, Number(caja.x0) || 0)) / 100 * W;
    var x1 = Math.max(0, Math.min(100, Number(caja.x1) || 0)) / 100 * W;
    var y0 = Math.max(0, Math.min(100, Number(caja.y0) || 0)) / 100 * H;
    var y1 = Math.max(0, Math.min(100, Number(caja.y1) || 0)) / 100 * H;
    var mw = (x1 - x0) * 0.08, mh = (y1 - y0) * 0.08;
    x0 = Math.max(0, x0 - mw); x1 = Math.min(W, x1 + mw);
    y0 = Math.max(0, y0 - mh); y1 = Math.min(H, y1 + mh);
    if (x1 - x0 < 20 || y1 - y0 < 20) return null;
    var k = Math.min(1, 1568 / Math.max(x1 - x0, y1 - y0));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((x1 - x0) * k));
    cv.height = Math.max(1, Math.round((y1 - y0) * k));
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
    var b = cv.toDataURL('image/jpeg', 0.85).split(',')[1];
    cv.width = 1; cv.height = 1;
    return b;
  }
  function planoImgManda(dataUrl) {
    if (planoEnVuelo) return;
    // el candado va AQUÍ, síncrono — no dentro de img.onload, donde un doble
    // tap en el iPad colaba dos llamadas (hallazgo de la revisión adversaria)
    planoEnVuelo = true;
    var btn = $('#btnPlanoIA'); if (btn) btn.disabled = true;
    function termina() { planoEnVuelo = false; if (btn) btn.disabled = false; }
    var img = new Image();
    img.onload = function () {
      // la API de imágenes acepta hasta ~1568 px de lado: se re-encoge aquí
      var MAX = 1568, k = Math.min(1, MAX / Math.max(img.width, img.height));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      var cx2 = cv.getContext('2d');
      cx2.fillStyle = '#fff'; cx2.fillRect(0, 0, cv.width, cv.height);   // JPEG no tiene transparencia
      cx2.drawImage(img, 0, 0, cv.width, cv.height);
      var b64 = cv.toDataURL('image/jpeg', 0.85).split(',')[1];
      cv.width = 1; cv.height = 1;   // libera la memoria del canvas de una
      var hoja = state.curSheet;   // si cambia de hoja en pleno vuelo, se aborta
      setHint('🪄 Paso 1/2: leyendo el plano completo… (unos 30-60 s)');
      pideCerebro({ imagen: { b64: b64, tipo: 'image/jpeg' } }).then(function (d) {
        if (d.error) { termina(); setHint(''); uiAlert('⚠️ ' + d.error + (d.detalle ? '\n\n' + d.detalle : '')); return; }
        var pl = d.plano;
        if (!pl && d.texto) {
          // worker que contesta texto: a ver si el JSON viene adentro
          try { pl = JSON.parse(String(d.texto).replace(/^[\s\S]*?({[\s\S]*})[\s\S]*$/, '$1')); } catch (e2) {}
        }
        if (!pl || !Array.isArray(pl.cuartos)) {
          termina(); setHint('');
          uiAlert('⚠️ El cerebro contestó pero no mandó el plano en el formato esperado.\n\nSi el worker está viejo: en la laptop, cd max-power-app\\mxp-brain · git pull · wrangler deploy');
          return;
        }
        // PASADA 2: un recorte por cuarto → aberturas a pulgadas. Si el
        // worker es viejo y no entiende el modo detalle, se sigue sin él.
        var cola = pl.cuartos.filter(function (q) {
          return q && q.caja && piesAPulg(q.ancho) !== null && piesAPulg(q.alto) !== null;
        }).slice(0, 40);
        var i = 0, sinDetalle = 0;
        function cierra() {
          if (state.curSheet !== hoja) {
            termina(); setHint('');
            uiAlert('⚠️ Cambiaste de hoja mientras el cerebro leía el plano. Vuelve a la hoja donde empezaste y dale otra vez.');
            return;
          }
          planoDesdeJSON(pl);
          termina();
          var avisos = [];
          if (pl.notas) avisos.push(pl.notas);
          if (sinDetalle) avisos.push(sinDetalle + ' cuarto(s) quedaron sin el detalle de puertas/ventanas — revísalos contra el plano.');
          if (avisos.length) uiAlert('📝 Notas del cerebro:\n\n' + avisos.join('\n\n'));
        }
        function sigue() {
          if (i >= cola.length) { cierra(); return; }
          var q = cola[i++];
          setHint('🪄 Paso 2/2: puertas y ventanas de ' + (q.nombre || 'cuarto') + ' (' + i + '/' + cola.length + ')…');
          var rec = recorteCuarto(img, q.caja);
          if (!rec) { sinDetalle++; sigue(); return; }
          pideCerebro({ imagen: { b64: rec, tipo: 'image/jpeg' },
                        cuarto: { nombre: q.nombre, ancho: q.ancho, alto: q.alto } })
            .then(function (d2) {
              if (d2 && d2.detalle && Array.isArray(d2.detalle.aberturas)) q.aberturas = d2.detalle.aberturas;
              else sinDetalle++;
              sigue();
            }).catch(function () { sinDetalle++; sigue(); });
        }
        sigue();
      }).catch(function (e) {
        termina(); setHint('');
        uiAlert('⚠️ No se pudo llegar al cerebro (' + e.message + '). ¿Hay internet? ¿Está bien la dirección en ⚙ Ajustes?');
      });
    };
    img.onerror = function () { termina(); uiAlert('⚠️ No se pudo leer esa imagen.'); };
    img.src = dataUrl;
  }

  // acercar la vista a lo seleccionado
  function zoomSel() {
    var refs = selGroup || (sel ? [sel] : null);
    var bb = refs && refsBBox(refs);
    if (!bb) return;
    var r = svg.getBoundingClientRect();
    var an = Math.max(60, bb.x2 - bb.x1), al = Math.max(60, bb.y2 - bb.y1);
    view.z = Math.max(0.15, Math.min(6, Math.min(r.width / (an * 1.8), r.height / (al * 1.8))));
    view.tx = r.width / 2 - bb.cx * view.z;
    view.ty = r.height / 2 - bb.cy * view.z;
    applyView();
  }
  // 📏 la medida real manda: se corrige la pared Y se arrastra lo pegado
  function corregirMedida() {
    var msg = $('#aiMedMsg');
    var e = sel && sel.kind === 'wall' ? findSel() : null;
    if (!e) { msg.textContent = '⚠️ Primero selecciona en el plano la pared que mediste (cierra esto, tócala, y vuelve a abrir el asistente).'; return; }
    var v = parseDist($('#aiMed').value);
    if (!v || v < 2) { msg.textContent = '⚠️ Escribe la medida, por ejemplo 12\' 4 1/2" o 148.5'; return; }
    var L0 = largo(e);
    pushUndo();
    // ¿qué extremo está más "suelto"? ese es el que se mueve
    function pegados(px, py) {
      var n = 0;
      state.walls.forEach(function (o) {
        if (o === e) return;
        var r = distToSeg(px, py, o.x1, o.y1, o.x2, o.y2);
        if (r.d < 6) n++;
      });
      return n;
    }
    var n1 = pegados(e.x1, e.y1), n2 = pegados(e.x2, e.y2);
    var mueve2 = n2 <= n1;                       // se mueve el extremo con menos pegado
    var ux = (e.x2 - e.x1) / L0, uy = (e.y2 - e.y1) / L0;
    var d = v - L0;
    var ax, ay, bx, by;
    if (mueve2) { ax = e.x2; ay = e.y2; bx = Math.round(e.x2 + ux * d); by = Math.round(e.y2 + uy * d); e.x2 = bx; e.y2 = by; }
    else { ax = e.x1; ay = e.y1; bx = Math.round(e.x1 - ux * d); by = Math.round(e.y1 - uy * d); e.x1 = bx; e.y1 = by; }
    // arrastrar lo que estaba pegado a ese extremo (la esquina no se abre)
    var movidas = 0;
    state.walls.forEach(function (o) {
      if (o === e) return;
      ['1', '2'].forEach(function (k) {
        if (Math.hypot(o['x' + k] - ax, o['y' + k] - ay) < 6) {
          o['x' + k] = bx; o['y' + k] = by; movidas++;
        }
      });
    });
    refresh(); renderSel();
    msg.textContent = '✅ Corregida: ' + fmtFtIn(L0) + ' → ' + fmtFtIn(v) +
      (movidas ? ' · se arrastraron ' + movidas + ' extremo(s) pegado(s) para no abrir la esquina' : '') + ' · Ctrl+Z lo deshace';
    setHint('📏 Pared corregida a ' + fmtFtIn(v) + ' — la medida de la obra manda sobre el escáner');
  }
  var dsz = $('#doorSize');
  if (dsz) dsz.addEventListener('change', function () {
    curDoorType = 'door';
    curDoorW = parseInt(this.value, 10) || 0;
    setTool('door');
    setHint('Puerta ' + (curDoorW ? 'de ' + fmtFtIn(curDoorW) : "de 3'-0\" (auto)") + ' — haz clic sobre una pared para colocarla');
  });
  $('#btnAI').addEventListener('click', abrirAsistente);
  var bPlanoIA = $('#btnPlanoIA');
  if (bPlanoIA) bPlanoIA.addEventListener('click', planoDesdeImagen);
  $('#aiClose').addEventListener('click', function () { $('#aiModal').hidden = true; });

  // cuántas piezas sueltas hay en la hoja (grupos de paredes que se tocan)
  function contarPiezas(W) {
    var par = {}, i, j;
    W.forEach(function (w) { par[w.id] = w.id; });
    function find(k) { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; }
    for (i = 0; i < W.length; i++) for (j = i + 1; j < W.length; j++) {
      var A = W[i], B = W[j], toca = false;
      [[A.x1, A.y1], [A.x2, A.y2]].forEach(function (q) {
        if (distToSeg(q[0], q[1], B.x1, B.y1, B.x2, B.y2).d < 30) toca = true;
      });
      if (!toca) [[B.x1, B.y1], [B.x2, B.y2]].forEach(function (q) {
        if (distToSeg(q[0], q[1], A.x1, A.y1, A.x2, A.y2).d < 30) toca = true;
      });
      if (toca) par[find(A.id)] = find(B.id);
    }
    var raiz = {};
    W.forEach(function (w) { raiz[find(w.id)] = 1; });
    return Object.keys(raiz).length;
  }
  $('#btnRecibo').addEventListener('click', function () {
    if (!ultimoRecibo) {
      uiAlert('Todavía no has importado ningún escaneo en esta sesión.\n\nAbre un JSON de MXP Scan y aquí te queda el recibo: lo que trae el archivo contra lo que se dibujó, línea por línea.');
      return;
    }
    uiAlert(ultimoRecibo);
  });
  $('#btnWeld').addEventListener('click', function () {
    if (!state.walls.length) { uiAlert('No hay paredes en esta hoja.'); return; }
    pushUndo();
    // Si hay una SELECCIÓN de paredes, se suelda SOLO eso. Con 13 piezas en
    // la hoja, soldar todo de golpe encadena errores; de dos en dos se ve
    // lo que pasa y se puede deshacer una sola unión.
    // AUDITORÍA 08/28: con las 13 piezas cargadas, soldar todo de golpe hizo
    // que el candado tuviera que revertir 24 de 141 paredes — el imán pelea
    // demasiado. Se avisa antes, porque de dos en dos sale mucho mejor.
    var soloSel = null;
    if (!selGroup && state.walls.length > 60) {
      var piezasSueltas = contarPiezas(state.walls);
      if (piezasSueltas >= 4 && !window.__weldOK) {
        uiConfirm('Vas a soldar ' + piezasSueltas + ' piezas sueltas de una vez (' +
          state.walls.length + ' paredes).\n\nSale MUCHO mejor de dos en dos: seleccionas dos ' +
          'piezas con el marco y le das a 🧲 — así ves lo que pasa en cada unión y Ctrl+Z ' +
          'deshace solo ésa.\n\nOK = soldar todo igual · Cancelar = mejor lo hago de dos en dos',
          function (ok) { if (ok) { window.__weldOK = 1; $('#btnWeld').click(); window.__weldOK = 0; } });
        return;
      }
    }
    if (selGroup) {
      var idsSel = {};
      selGroup.forEach(function (r) { if (r.kind === 'wall') idsSel[r.id] = 1; });
      var elegidas = state.walls.filter(function (w) { return idsSel[w.id]; });
      if (elegidas.length >= 2) {
        /* LA COSTURA. Soldar SOLO lo seleccionado dejaba la unión sin tocar:
           al calzar una pieza queda seleccionada, se pulsa 🧲 y no pasa nada
           — la pared repetida sigue ahí doble. Medido 28/08: 8 paredes → 8.
           Por eso al universo se le suman las paredes de al lado (a menos de
           30"): son justo las de la costura. Lo lejano sigue sin tocarse. */
        var VEC = 30;
        var vecinas = state.walls.filter(function (w) {
          if (idsSel[w.id]) return false;
          return elegidas.some(function (e) { return segDist(w, e) <= VEC; });
        });
        soloSel = elegidas.concat(vecinas);
      }
    }
    var universo = soloSel || state.walls;
    // FOTO de cómo estaba cada pared antes de tocarla (para el candado)
    var foto = {};
    universo.forEach(function (w) {
      foto[w.id] = { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, type: w.type, t: w.t };
      delete w._fus;
    });
    universo.forEach(function (w) {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      var dev = Math.abs(Math.atan2(dy, dx) % (Math.PI / 2));
      dev = Math.min(dev, Math.PI / 2 - dev);
      w._o = dev > 0.14 ? 'D' : (Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V');
    });
    // posición absoluta de cada abertura ANTES de mover paredes
    var opPts = state.openings.map(function (op) {
      var w = null;
      for (var i = 0; i < state.walls.length; i++) if (state.walls[i].id === op.wallId) { w = state.walls[i]; break; }
      if (!w) return null;
      var len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      var t = op.pos / len;
      return { op: op, x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t };
    });
    var antes = state.walls.length;
    var trabajo = universo.slice();
    quitaCabitos(trabajo);
    mergeParallelWalls(trabajo);
    mergeDiagWalls(trabajo);
    bridgeCollinear(trabajo);
    // El orden importa y salió de medirlo: primero se pone TODO a escuadra
    // (así el escalón de 2-3° no llega nunca a la esquina) y solo después
    // se cierran las esquinas. Cerrar es lo último: una esquina abierta se
    // ve, un pelo de grado no.
    squareNearAxis(trabajo, 3);
    snapTJunctions(trabajo);
    weldCorners(trabajo);
    squareNearAxis(trabajo, 2);
    snapTJunctions(trabajo);
    closeLCorners(trabajo);
    cierraEsquinasLibres(trabajo);
    recortaCruces(trabajo);
    weldCorners(trabajo, 8);
    unbendTees(trabajo, 3.5);
    extenderApoyos(trabajo, 10);
    recortaCruces(trabajo);
    fundeColineales(trabajo);
    microSolda(trabajo);
    // 🔒 CANDADO: ninguna pared puede salir DEFORMADA del soldado. Si el
    // imán la giró más de 5°, corrió su centro más de 30" o le cambió el
    // largo más de un 40%, esa pared vuelve exactamente a como estaba.
    // (Las que ABSORBIERON a otra crecen a propósito: a esas solo se les
    // mira el ángulo.) El imán puede arreglar o no hacer nada — romper no.
    var revertidas = 0;
    trabajo.forEach(function (w) {
      var o = foto[w.id];
      if (!o) return;
      var L0 = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
      var L1 = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      var a0 = Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180 / Math.PI;
      var a1 = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
      var da = Math.abs(a1 - a0) % 360; if (da > 180) da = 360 - da;
      if (da > 90) da = 180 - da;
      var mal = da > 5;
      if (!w._fus) {
        var mov = Math.hypot((w.x1 + w.x2) / 2 - (o.x1 + o.x2) / 2, (w.y1 + w.y2) / 2 - (o.y1 + o.y2) / 2);
        if (mov > 30 || Math.abs(L1 - L0) > Math.max(36, L0 * 0.4)) mal = true;
      }
      if (mal) {
        w.x1 = o.x1; w.y1 = o.y1; w.x2 = o.x2; w.y2 = o.y2;
        w.type = o.type; w.t = o.t;
        revertidas++;
      }
    });
    if (soloSel) {
      var vivas = {}; trabajo.forEach(function (x) { vivas[x.id] = 1; });
      state.walls = state.walls.filter(function (w) { return !foto[w.id] || vivas[w.id]; });
    } else {
      state.walls = trabajo;
    }
    // la marca de fusión no puede quedarse pegada: si se guarda en el
    // proyecto, la próxima soldadura exime a esa pared del candado
    state.walls.forEach(function (w) { delete w._fus; });
    // reconectar aberturas. Tres reglas que salieron de medir el daño:
    //  a) si la pared de siempre sobrevivió y sigue cerca, la puerta NO se
    //     muda a la pared vecina (antes saltaba hasta 10")
    //  b) la puerta nunca queda colgando de la punta: se mete dentro y, si
    //     la pared es más corta que la puerta, la puerta se achica
    //  c) puertas gemelas (la misma de dos escaneos) se funden en una
    opPts.forEach(function (r) {
      if (!r) return;
      var vivo = null;
      state.walls.forEach(function (w) { if (w.id === r.op.wallId) vivo = w; });
      var best = null;
      state.walls.forEach(function (w) {
        var res = distToSeg(r.x, r.y, w.x1, w.y1, w.x2, w.y2);
        if (!best || res.d < best.res.d) best = { w: w, res: res };
      });
      // (a) la pared de origen manda si sigue viva y a mano
      if (vivo) {
        var rv = distToSeg(r.x, r.y, vivo.x1, vivo.y1, vivo.x2, vivo.y2);
        if (rv.d < 24) best = { w: vivo, res: rv };
      }
      if (!best || best.res.d >= 24) return;
      r.op.wallId = best.w.id;
      var len2 = Math.hypot(best.w.x2 - best.w.x1, best.w.y2 - best.w.y1);
      var pos2 = best.res.t * len2;
      // (b) que quepa entera dentro de la pared
      if (r.op.w > len2 - 2) r.op.w = Math.max(12, Math.round(len2 - 2));
      r.op.pos = Math.round(Math.max(r.op.w / 2, Math.min(len2 - r.op.w / 2, pos2)));
    });
    state.openings = state.openings.filter(function (op) {
      return state.walls.some(function (w) { return w.id === op.wallId; });
    });
    // (c) gemelas: la MISMA puerta vista desde dos escaneos. Antes solo se
    // fundían si acabaron en la misma pared — pero la puerta del bedroom y
    // la del closet viven en DOS paredes (una de cada cuarto) y si esas dos
    // no llegan a fundirse, la puerta quedaba doble (28/08, foto de Edgar).
    // Ahora se comparan POR DÓNDE ESTÁN EN EL PLANO: mismo tipo, centros a
    // menos de 10" y ancho parecido = la misma puerta. Se queda la de la
    // pared más larga.
    var gemelas = 0;
    function opMundo(op) {
      var w = null;
      for (var i2 = 0; i2 < state.walls.length; i2++) if (state.walls[i2].id === op.wallId) { w = state.walls[i2]; break; }
      if (!w) return null;
      var L2 = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      var t2 = op.pos / L2;
      return { x: w.x1 + (w.x2 - w.x1) * t2, y: w.y1 + (w.y2 - w.y1) * t2, L: L2 };
    }
    state.openings.forEach(function (op) { op._m = opMundo(op); });
    state.openings = state.openings.filter(function (op, i) {
      if (!op._m) return true;
      for (var k = 0; k < state.openings.length; k++) {
        if (k === i) continue;
        var q = state.openings[k];
        if (q._fuera || op._fuera || !q._m) continue;
        // una VENTANA solo se funde con otra ventana; todo lo demás (door,
        // opening, double, pocket…) es un HUECO DE PASO: el mismo hueco
        // puede venir como 'door' de un escaneo y 'opening' del otro
        var vent1 = q.type === 'window' || q.type === 'slider';
        var vent2 = op.type === 'window' || op.type === 'slider';
        if (vent1 !== vent2) continue;
        if (Math.hypot(q._m.x - op._m.x, q._m.y - op._m.y) > 12) continue;
        if (Math.abs(q.w - op.w) > 16) continue;
        // sobrevive la de la pared más larga (la principal); empate: la primera
        var soyMenor = op._m.L < q._m.L || (op._m.L === q._m.L && i > k);
        if (soyMenor) {
          q.w = Math.max(q.w, op.w);
          if (q.type === 'opening' && op.type !== 'opening') q.type = op.type;
          op._fuera = true; gemelas++; return false;
        }
      }
      return true;
    });
    state.openings.forEach(function (op) { delete op._m; });
    // (d) el MISMO paso partido en dos: cada escaneo capturó su mitad de la
    // entrada y quedan dos huecos borde con borde en la misma pared (medido
    // 28/08: 35" + 32" pegados = una entrada de ~66"). Pasos (no ventanas)
    // en la misma pared con hueco de ≤8" entre sí → uno solo que abarca los dos.
    var unidos = 0;
    state.openings.forEach(function (op) {
      if (op._fuera || op.type === 'window' || op.type === 'slider') return;
      state.openings.forEach(function (q) {
        if (q === op || q._fuera || op._fuera) return;
        if (q.type === 'window' || q.type === 'slider') return;
        if (q.wallId !== op.wallId) return;
        var a1 = op.pos - op.w / 2, a2 = op.pos + op.w / 2;
        var b1 = q.pos - q.w / 2, b2 = q.pos + q.w / 2;
        var hueco = Math.max(a1, b1) - Math.min(a2, b2);   // negativo = se solapan
        if (hueco > 8) return;
        var lo = Math.min(a1, b1), hi = Math.max(a2, b2);
        op.pos = Math.round((lo + hi) / 2); op.w = Math.round(hi - lo);
        if (op.type === 'opening' && q.type !== 'opening') op.type = q.type;
        q._fuera = true; unidos++;
      });
    });
    if (unidos) state.openings = state.openings.filter(function (o) { return !o._fuera; });
    gemelas += unidos;
    // re-tipar por cuartos cerrados: interior (entre 2 cuartos) = drywall,
    // el resto (da a la calle) = block. Si se soldó solo una selección, el
    // re-tipado NO se hace: con media casa en la hoja el "exterior" todavía
    // no se sabe y repintaría de block paredes interiores.
    var rooms = soloSel ? [] : detectRoomPolys(state.walls);
    if (rooms.length) {
      var ext = rooms[0]._ext;
      state.walls.forEach(function (w) {
        if (ext.has(w)) { w.type = 'block'; w.t = 8; }
        else { w.type = 'drywall'; w.t = 4.5; }
      });
    }
    // el candado puede devolver una pared con su micro-desfase de 2-3" en
    // la punta; volver a micro-soldar es inofensivo (mueve ≤4.5") y sella
    // el inglete de la esquina
    microSolda(trabajo);
    // red de seguridad: los recortes en cadena pueden dejar una pared
    // colapsada en un punto (medido 28/08: dos de 0" en la casa de 13
    // piezas). Una pared de menos de 2" no es una pared.
    var puntos = state.walls.filter(function (w) {
      return Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 2;
    });
    if (puntos.length) state.walls = state.walls.filter(function (w) {
      return Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= 2;
    });
    limpiaHuerfanas();
    orientaDrySide();          // el forro del bloque, siempre para adentro
    refresh(); refreshCounts();
    setHint('🧲 ' + (soloSel ? 'Soldadas solo las paredes seleccionadas' : 'Armado soldado') + ': ' +
      antes + '→' + state.walls.length + ' paredes' + (soloSel ? '' : ', ' + rooms.length + ' cuarto(s) cerrados') +
      (gemelas ? ', ' + gemelas + ' puerta(s) gemela(s) fundida(s)' : '') +
      (revertidas ? ' · 🔒 ' + revertidas + ' pared(es) se dejaron COMO ESTABAN (el imán las deformaba)' : '') +
      (soloSel ? ' · selecciona otras dos piezas y vuelve a soldar' : ' · consejo: selecciona 2 piezas y suelda de dos en dos'));
  });

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
      guia: state.guia, huecos: state.huecos,
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
    state.guia = o.guia || []; state.huecos = o.huecos || [];
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
        '<span class="sx" data-x="' + i + '" title="' + (state.sheets.length > 1 ? 'Eliminar hoja' : 'Borrar todo y dejar la hoja en blanco') + '">×</span>' +
        '</button>';
    });
    html += '<button class="stab add" id="stAdd" title="Agregar hoja al set">+</button>';
    el.innerHTML = html;
    $$('#sheetTabs .stab[data-i]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.classList && t.classList.contains('sx')) {
          var idx = parseInt(t.dataset.x, 10);
          if (state.sheets.length === 1) {
            // última hoja: borrar todo deja el lienzo en blanco, sin nombre
            uiConfirm('¿Borrar TODO (dibujo y plano de fondo) y dejar una hoja en blanco?', function (ok) {
              if (!ok) return;
              state.sheets = [{ no: '', title: '', data: null }];
              state.curSheet = 0;
              state.project.sheetNo = ''; state.project.sheetTitle = '';
              pdfLive = {};
              loadSheetData(null);
              syncProjectInputs();
              renderSheetTabs();
              scheduleAutosave();
              setHint('Hoja en blanco — dibuja, o abre un plano con 📂 Abrir');
            });
            return;
          }
          uiConfirm('¿Eliminar la hoja "' + (state.sheets[idx].no || '') + '" con todo su dibujo?', function (ok) {
            if (!ok) return;
            var wasActive = idx === state.curSheet;
            var activeObj = state.sheets[state.curSheet];
            state.sheets.splice(idx, 1);
            // el mapa de PDFs vivos va por índice de hoja: correr los que siguen
            var nl = {};
            Object.keys(pdfLive).forEach(function (k) {
              k = +k;
              if (k < idx) nl[k] = pdfLive[k];
              else if (k > idx) nl[k - 1] = pdfLive[k];
            });
            pdfLive = nl;
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
    state.bg = { url: url, x: 0, y: 0, w: w, h: w * pxH / pxW, pxW: pxW, pxH: pxH, opacity: ($('#bgOpacity').value / 100) };
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
    var pdfKey = null;   // el PDF crudo se guarda en IndexedDB: el zoom nítido sobrevive recargas
    var rd = new FileReader();
    rd.onload = function () {
      tryOpen(null);
      // si el PDF pide contraseña, la pedimos y reintentamos (pdf.js consume el buffer: se copia)
      function tryOpen(password) {
        var data = rd.result.slice(0);
        var opts = password ? { data: data, password: password } : { data: data };
        pdfjsLib.getDocument(opts).promise.then(function (doc) {
          if (!deliver && !pdfKey && !password) {
            pdfKey = 'pdfbin_' + uid();
            try { idbSet(pdfKey, rd.result.slice(0)); } catch (e) { pdfKey = null; }
          }
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
          uiAlert('No se pudo leer el PDF.\nDetalle: ' + (err && err.message ? err.message : err) + '\n\nSi estás en el visor de Claude, usa mejor tu enlace propio (edgararboleya-rgb.github.io/mxp-planos). También puedes mandar una captura del plano como imagen.');
          setHint('');
        });
      }
    };
    rd.readAsArrayBuffer(file);
    function renderPdfPage(doc, pageNum, cb) {
      doc.getPage(pageNum).then(function (page) {
        var vp1 = page.getViewport({ scale: 1 });
        // resolución alta para que el zoom no se pixele (Bluebeam re-dibuja el vector;
        // aquí se rasteriza una vez, así que hay que rasterizar grande). Límite de
        // Safari iOS por canvas: ~16.7 MP → presupuesto de área con margen.
        var lite = document.body.classList.contains('touch');
        var MAXDIM = lite ? 4096 : 6000;
        var AREA = lite ? 13e6 : 26e6;
        var scale = Math.min(6,
          MAXDIM / vp1.width, MAXDIM / vp1.height,
          Math.sqrt(AREA / (vp1.width * vp1.height)));
        var vp = page.getViewport({ scale: scale });
        var cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          // el PDF sabe su tamaño de papel real (72 puntos = 1"): con eso la escala del plano es exacta
          // JPEG para hojas grandes (el PNG de 20+ MP pesa demasiado en memoria)
          var big = cv.width * cv.height > 9e6;
          var url = (lite || big) ? cv.toDataURL('image/jpeg', lite ? 0.82 : 0.9) : cv.toDataURL('image/png');
          cv.width = 1; cv.height = 1;   // libera la memoria del canvas de una
          if (cb) cb(url, Math.round(vp.width), Math.round(vp.height), vp1.width / 72, vp1.height / 72);
          else {
            insertBackground(url, Math.round(vp.width), Math.round(vp.height), vp1.width / 72, vp1.height / 72);
            pdfLive[state.curSheet] = { doc: doc, page: pageNum };
            if (pdfKey) { state.bg.pdfId = pdfKey; state.bg.pdfPage = pageNum; }
            if (!state.sheets[state.curSheet].no) {
              state.sheets[state.curSheet].no = 'PG-1';
              state.project.sheetNo = 'PG-1';
              syncProjectInputs(); renderSheetTabs();
            }
            scheduleHires();
          }
        });
      }).catch(function (err) {
        console.error(err);
        uiAlert('No se pudo renderizar la página ' + pageNum + ' del PDF.\nDetalle: ' + (err && err.message ? err.message : err));
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
          else {
            // el set completo se nombra PG-1, PG-2, … desde la primera página
            state.sheets[state.curSheet].no = 'PG-1';
            state.project.sheetNo = 'PG-1';
            syncProjectInputs();
          }
          insertBackground(url, pxW, pxH, paperW, paperH);
          pdfLive[state.curSheet] = { doc: doc, page: i };
          if (pdfKey) { state.bg.pdfId = pdfKey; state.bg.pdfPage = i; }
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

  // AUDITORÍA 08/28: _o, _fus y demás marcas de trabajo se guardaban dentro
  // del .mxp.json. Solo ensucian y pueden confundir a una versión futura.
  function limpiaMarcas() {
    state.walls.forEach(function (w) {
      delete w._o; delete w._fus; delete w._dead; delete w._corr;
    });
    state.openings.forEach(function (o) { delete o._fuera; });
  }
  (function () {
    var bg = document.getElementById('btnGuiaDel');
    if (bg) bg.addEventListener('click', borrarGuia);
  })();
  $('#btnSave').addEventListener('click', function () {
    syncSheet(); limpiaMarcas();
    var data = JSON.stringify({ app: 'mxp-planos', version: 1, state: state, view: view });
    saveFile((state.project.name || 'proyecto').replace(/[^\w\-. ]+/g, '') + '.mxp.json', data);
    setHint('Proyecto guardado (archivo descargado)');
  });

  /* --- FASE 5: importar un escaneo de casa (Apple RoomPlan / MXP Scan) ---
     RoomPlan entrega paredes/puertas/ventanas como planos 3D: matriz de
     transformación 4x4 (column-major, metros) + dimensiones [ancho,alto].
     Aquí se proyecta al plano 2D (x,z) y nacen como paredes DE VERDAD. */
  var M2IN = 39.3701, CM2IN = 1 / 2.54;
  function looksLikeRoomScan(o) {
    if (o && o.app === 'mxp-scan') return true;
    if (o && Array.isArray(o.walls) && o.walls.length && o.walls[0] &&
      o.walls[0].transform && o.walls[0].dimensions) return true;
    // proyecto de OpenPlan3D (editor web / app iOS): floors[].walls con start/end
    if (o && Array.isArray(o.floors) && o.floors.length && o.floors[0] &&
      Array.isArray(o.floors[0].walls)) return true;
    // CapturedStructure de Apple (escaneo continuo): rooms[].walls
    if (o && Array.isArray(o.rooms) && o.rooms.length && o.rooms[0] &&
      Array.isArray(o.rooms[0].walls) && o.rooms[0].walls[0] && o.rooms[0].walls[0].transform) return true;
    return false;
  }

  /* --- redibujado tipo Twindo: el escaneo llega con paredes levemente
     torcidas y esquinas que no cierran; aquí se endereza TODO ---
     1) rotación global al eje dominante (preserva la topología)
     2) cada pared se clasifica H o V y se le pone candado de eje
     3) las esquinas cercanas se sueldan: la pared V manda en X,
        la H manda en Y → esquinas perfectas a 90°                    */
  function redrawScan(walls, anchors, noLock) {
    if (!walls.length) return;
    var i, j, w, dx, dy, len;
    // rotación dominante (espacio 4θ para que 0/90/180/270 cuenten juntos)
    var sinS = 0, cosS = 0;
    for (i = 0; i < walls.length; i++) {
      w = walls[i]; dx = w.x2 - w.x1; dy = w.y2 - w.y1; len = Math.hypot(dx, dy);
      if (len < 1) continue;
      var a4 = Math.atan2(dy, dx) * 4;
      sinS += Math.sin(a4) * len; cosS += Math.cos(a4) * len;
    }
    var rot = -Math.atan2(sinS, cosS) / 4;
    var cx = 0, cy = 0;
    for (i = 0; i < walls.length; i++) { cx += walls[i].x1 + walls[i].x2; cy += walls[i].y1 + walls[i].y2; }
    cx /= walls.length * 2; cy /= walls.length * 2;
    var cr = Math.cos(rot), sr = Math.sin(rot);
    function rp(p, kx, ky) {
      var ox = p[kx] - cx, oy = p[ky] - cy;
      p[kx] = cx + ox * cr - oy * sr;
      p[ky] = cy + ox * sr + oy * cr;
    }
    for (i = 0; i < walls.length; i++) { rp(walls[i], 'x1', 'y1'); rp(walls[i], 'x2', 'y2'); }
    (anchors || []).forEach(function (p) { rp(p, 'cx', 'cy'); });
    // clasificar H/V y poner candado de eje — SOLO si la pared está a menos
    // de 15° de un eje; una diagonal real (pared en ángulo de la casa) se
    // respeta tal cual en vez de aplastarla y romper el circuito del cuarto
    for (i = 0; i < walls.length; i++) {
      w = walls[i];
      dx = w.x2 - w.x1; dy = w.y2 - w.y1;
      var aa = Math.atan2(dy, dx);
      var dev = Math.abs(aa % (Math.PI / 2));
      dev = Math.min(dev, Math.PI / 2 - dev);
      if (dev > 0.14) { w._o = 'D'; continue; }   // >8°: angulo real (rombo), se respeta
      w._o = Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V';
      if (noLock) continue;               // modo FIEL: clasificar sin mover
      if (w._o === 'H') { var my = Math.round((w.y1 + w.y2) / 2); w.y1 = my; w.y2 = my; w.x1 = Math.round(w.x1); w.x2 = Math.round(w.x2); }
      else { var mx = Math.round((w.x1 + w.x2) / 2); w.x1 = mx; w.x2 = mx; w.y1 = Math.round(w.y1); w.y2 = Math.round(w.y2); }
    }
    if (!noLock) weldCorners(walls);
    return rot;
  }
  // soldar esquinas cercanas (union-find): la pared V manda en X, la H en Y
  // Al soldar, juntar los extremos deja las paredes rectas con un pelo de
  // inclinación (1-2°) y la esquina hace un escalón feo. Esto las vuelve a
  // poner a escuadra EXACTA. Solo toca las que ya venían casi rectas
  // (≤ 2°): una pared del escaneo inclinada de verdad no se toca.
  function squareNearAxis(walls, tolDeg) {
    var tol = (tolDeg || 2) * Math.PI / 180;
    walls.forEach(function (w) {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      if (Math.hypot(dx, dy) < 8) return;
      var ang = Math.atan2(dy, dx);
      var dH = Math.min(Math.abs(ang), Math.abs(Math.abs(ang) - Math.PI));
      var dV = Math.abs(Math.abs(ang) - Math.PI / 2);
      if (dH <= tol && dH <= dV) {
        var y = Math.round((w.y1 + w.y2) / 2); w.y1 = y; w.y2 = y;
      } else if (dV <= tol) {
        var x = Math.round((w.x1 + w.x2) / 2); w.x1 = x; w.x2 = x;
      }
    });
  }
  // 🩹 ÚLTIMO REPASO: una pared que quedó torcida 1-3° porque el soldado le
  // jaló una punta se vuelve a poner recta DESLIZANDO esa punta sobre la
  // pared en la que se apoya (así no se despega). Si al enderezarla se
  // saldría de su apoyo, se deja como está.
  function unbendTees(walls, tolDeg) {
    var tol = (tolDeg || 3.5) * Math.PI / 180;
    function proy(px, py, o) {
      var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = dx * dx + dy * dy;
      var t = L ? ((px - o.x1) * dx + (py - o.y1) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t));
    }
    function apoyo(px, py, w) {
      var best = null;
      walls.forEach(function (o) {
        if (o === w) return;
        var d = proy(px, py, o);
        if (d < 4 && (!best || d < best.d)) best = { o: o, d: d };
      });
      return best && best.o;
    }
    walls.forEach(function (w) {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy);
      if (L < 12) return;
      var ang = Math.atan2(dy, dx);
      var dH = Math.min(Math.abs(ang), Math.abs(Math.abs(ang) - Math.PI));
      var dV = Math.abs(Math.abs(ang) - Math.PI / 2);
      var H = dH <= tol && dH <= dV, V = dV <= tol && dV < dH;
      if (!H && !V) return;
      if ((H && dy === 0) || (V && dx === 0)) return;      // ya está recta
      var h1 = apoyo(w.x1, w.y1, w), h2 = apoyo(w.x2, w.y2, w);
      var o1 = w.x1, o2 = w.y1, o3 = w.x2, o4 = w.y2;
      if (H) { var yy = Math.round((w.y1 + w.y2) / 2); w.y1 = yy; w.y2 = yy; }
      else { var xx = Math.round((w.x1 + w.x2) / 2); w.x1 = xx; w.x2 = xx; }
      var ok = (!h1 || proy(w.x1, w.y1, h1) < 4.5) && (!h2 || proy(w.x2, w.y2, h2) < 4.5);
      if (!ok) { w.x1 = o1; w.y1 = o2; w.x2 = o3; w.y2 = o4; }
    });
  }
  // Cerrar el pelo que queda: si una punta se pasó unas pulgadas del final
  // de la pared en la que se apoya, se ESTIRA esa pared (por su propio eje,
  // sin torcerla) hasta alcanzarla. Cierra la esquina sin inclinar nada.
  function extenderApoyos(walls, max) {
    var MX = max || 10;
    walls.forEach(function (w) {
      ['1', '2'].forEach(function (e) {
        var px = w['x' + e], py = w['y' + e];
        walls.forEach(function (o) {
          if (o === w) return;
          var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy);
          if (L < 1) return;
          var ux = dx / L, uy = dy / L;
          var t = (px - o.x1) * ux + (py - o.y1) * uy;          // a lo largo
          var perp = Math.abs((px - o.x1) * uy - (py - o.y1) * ux);
          if (perp > 3) return;
          if (t < -MX || t > L + MX) return;
          if (t >= -0.5 && t <= L + 0.5) return;                // ya toca
          if (t < 0) { o.x1 = Math.round(o.x1 + ux * t); o.y1 = Math.round(o.y1 + uy * t); }
          else { o.x2 = Math.round(o.x1 + ux * t); o.y2 = Math.round(o.y1 + uy * t); }
        });
      });
    });
  }
  function weldCorners(walls, md) {
    // MD 12: los escaneos REALES dejan esquinas a 8-12" (los sintéticos a 2-3)
    var i, j, MD = md || 12;
    walls.forEach(function (w) {
      if (!w._o) w._o = Math.abs(w.x2 - w.x1) >= Math.abs(w.y2 - w.y1) ? 'H' : 'V';
    });
    var eps = [];
    for (i = 0; i < walls.length; i++) { eps.push({ w: walls[i], e: 1 }); eps.push({ w: walls[i], e: 2 }); }
    function gx(p) { return p.e === 1 ? p.w.x1 : p.w.x2; }
    function gy(p) { return p.e === 1 ? p.w.y1 : p.w.y2; }
    function sp(p, x, y) { if (p.e === 1) { p.w.x1 = x; p.w.y1 = y; } else { p.w.x2 = x; p.w.y2 = y; } }
    var par = eps.map(function (_, k) { return k; });
    function find(k) { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; }
    // dos paredes PARALELAS que corren separadas no forman una esquina: son
    // dos T distintas contra la misma pared. Soldarlas en un punto torcía a
    // las dos (medido 2.4°). Si son paralelas y sus ejes distan más de 6",
    // cada una se queda con su T.
    function paralelasSeparadas(A, B) {
      if (A._o === 'D' || B._o === 'D' || A._o !== B._o) return false;
      var ejeA = A._o === 'H' ? (A.y1 + A.y2) / 2 : (A.x1 + A.x2) / 2;
      var ejeB = B._o === 'H' ? (B.y1 + B.y2) / 2 : (B.x1 + B.x2) / 2;
      return Math.abs(ejeA - ejeB) > 6;
    }
    for (i = 0; i < eps.length; i++) for (j = i + 1; j < eps.length; j++) {
      if (eps[i].w === eps[j].w) continue;
      if (paralelasSeparadas(eps[i].w, eps[j].w)) continue;
      if (Math.hypot(gx(eps[i]) - gx(eps[j]), gy(eps[i]) - gy(eps[j])) < MD) par[find(i)] = find(j);
    }
    var groups = {};
    for (i = 0; i < eps.length; i++) { var r = find(i); (groups[r] = groups[r] || []).push(eps[i]); }
    // Una pared MÁS CORTA que la distancia de soldadura no puede "abrir" una
    // esquina: si se le jalan los dos extremos a sitios distintos se GIRA
    // entera (medido: pedacitos de 6-7" girando 48-90°). Esas se mueven
    // RÍGIDAS — el mismo desplazamiento a los dos extremos — así conservan
    // su largo y su ángulo exactos.
    var rigida = {}, yaMovida = {};
    walls.forEach(function (w) {
      if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < MD * 1.6) rigida[w.id || (w.id = uid())] = w;
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      var xV = [], yH = [], ax = [], ay = [];
      g.forEach(function (p) {
        ax.push(gx(p)); ay.push(gy(p));
        if (p.w._o === 'V') xV.push(gx(p));
        if (p.w._o === 'H') yH.push(gy(p));
      });
      function avg(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
      var fx = Math.round(xV.length ? avg(xV) : avg(ax));
      var fy = Math.round(yH.length ? avg(yH) : avg(ay));
      g.forEach(function (p) {
        var id = p.w.id;
        if (rigida[id]) {
          if (yaMovida[id]) return;              // ya se colocó por su otro extremo
          var dx0 = fx - gx(p), dy0 = fy - gy(p);
          p.w.x1 += dx0; p.w.y1 += dy0; p.w.x2 += dx0; p.w.y2 += dy0;
          yaMovida[id] = 1;
          return;
        }
        sp(p, fx, fy);
      });
    });
  }
  // cuartos vecinos: la MISMA pared escaneada desde los dos lados llega como
  // dos paredes paralelas casi encimadas — aquí se fusionan en una sola
  // ¿qué tan bien armada está una pared? = qué tan recta respecto a la
  // rejilla de 45°. Al fusionar dos paredes, la MÁS RECTA manda: su eje se
  // queda, la otra se acomoda. (Pedido de Edgar 08/29: "de las dos, la
  // pared mejor armada es la que manda sobre la otra".)
  function ruidoDeParada(w) {
    var a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
    var r = ((a % 45) + 45) % 45;
    return Math.min(r, 45 - r);
  }
  function mergeParallelWalls(walls) {
    // GAP = a qué distancia dos paredes paralelas se consideran LA MISMA.
    // Medido con Edgar: colocando las piezas a mano la separación real
    // llegaba a 16-20" y con GAP 14 quedaban DOS paredes encimadas y la
    // esquina abierta. 24" (2 pies) cubre el pulso + los dos espesores.
    var GAP = 24, i, j;
    for (i = 0; i < walls.length; i++) {
      var a = walls[i];
      if (!a || a._dead) continue;
      if (a._o === 'D') continue;
      for (j = i + 1; j < walls.length; j++) {
        var b = walls[j];
        if (!b || b._dead || a._o !== b._o) continue;
        var H = a._o === 'H';
        var axA = H ? a.y1 : a.x1, axB = H ? b.y1 : b.x1;
        if (Math.abs(axA - axB) > GAP) continue;
        var a1 = H ? Math.min(a.x1, a.x2) : Math.min(a.y1, a.y2);
        var a2 = H ? Math.max(a.x1, a.x2) : Math.max(a.y1, a.y2);
        var b1 = H ? Math.min(b.x1, b.x2) : Math.min(b.y1, b.y2);
        var b2 = H ? Math.max(b.x1, b.x2) : Math.max(b.y1, b.y2);
        // La corta tiene que estar DENTRO de la larga (92%). Así la
        // fusionada NUNCA se estira: se queda con el tramo de la larga.
        // Antes se tomaba la unión y una pieza mal puesta alargaba una
        // pared buena hacia el vacío — medido +89" — y había que rehacerla.
        var La0 = a2 - a1, Lb0 = b2 - b1;
        var over = Math.min(a2, b2) - Math.max(a1, b1);
        if (over < 0.92 * Math.min(La0, Lb0)) {
          /* CORRIDAS (28/08, foto de Edgar): la pared del bedroom y la del
             closet quedaban DOBLES porque una va corrida ~13" a lo largo —
             solape del 85%, y el 92% no llegaba. La solución honesta, sin
             repetir el estirón: la que tiene el tramo doble se RECORTA a lo
             que le sobra. Nada se estira, lo doble desaparece, y lo que la
             corta cubría de más se queda como pared de verdad. */
          var LMIN = Math.min(La0, Lb0);
          /* A RAS y con 20"+ en común = LA MISMA pared vista por dos
             escaneos (la izquierda del closet ES la derecha del bedroom).
             Aquí la unión no es el estirón de antes: las dos son testigos
             reales del mismo eje (a ≤6" una de otra), la pared de verdad
             abarca las dos. */
          if (over >= 20 && Math.abs(axA - axB) <= 6) {
            var u1 = Math.min(a1, b1), u2 = Math.max(a2, b2);
            var rA2 = ruidoDeParada(a), rB2 = ruidoDeParada(b);
            var ejeU;
            if (rA2 + 0.3 < rB2) ejeU = Math.round(axA);
            else if (rB2 + 0.3 < rA2) ejeU = Math.round(axB);
            else ejeU = Math.round((axA * La0 + axB * Lb0) / (La0 + Lb0 || 1));
            if (H) { a.y1 = a.y2 = ejeU; a.x1 = Math.round(u1); a.x2 = Math.round(u2); }
            else { a.x1 = a.x2 = ejeU; a.y1 = Math.round(u1); a.y2 = Math.round(u2); }
            if ((b.t || 0) > (a.t || 0)) { a.type = b.type; a.t = b.t; }
            a.rids = (a.rids || (a.rid ? [a.rid] : [])).concat(b.rids || (b.rid ? [b.rid] : []));
            a._fus = true; b._dead = true;
            continue;
          }
          if (over >= 0.55 * LMIN && over > 20) {
            var corta = La0 <= Lb0 ? a : b, larga = La0 <= Lb0 ? b : a;
            var c1 = H ? Math.min(corta.x1, corta.x2) : Math.min(corta.y1, corta.y2);
            var c2 = H ? Math.max(corta.x1, corta.x2) : Math.max(corta.y1, corta.y2);
            var g1 = H ? Math.min(larga.x1, larga.x2) : Math.min(larga.y1, larga.y2);
            var g2 = H ? Math.max(larga.x1, larga.x2) : Math.max(larga.y1, larga.y2);
            var izq = Math.max(0, g1 - c1), der = Math.max(0, c2 - g2);   // lo que la corta asoma
            var n1, n2;
            if (izq >= der) { n1 = c1; n2 = Math.min(c2, g1); } else { n1 = Math.max(c1, g2); n2 = c2; }
            var axL = H ? larga.y1 : larga.x1;      // la corta se alinea al eje de la larga
            if (n2 - n1 < 12) {
              // lo que sobra es un pellizco: la LARGA lo absorbe (crece esas
              // pocas pulgadas, con la corta como testigo) y así la cadena
              // del cuarto no se rompe — matarla partía el closet en dos
              if (izq > 0 && izq <= 16) { if (H) { if (larga.x1 < larga.x2) larga.x1 = Math.round(c1); else larga.x2 = Math.round(c1); } else { if (larga.y1 < larga.y2) larga.y1 = Math.round(c1); else larga.y2 = Math.round(c1); } }
              if (der > 0 && der <= 16) { if (H) { if (larga.x1 > larga.x2) larga.x1 = Math.round(c2); else larga.x2 = Math.round(c2); } else { if (larga.y1 > larga.y2) larga.y1 = Math.round(c2); else larga.y2 = Math.round(c2); } }
              larga._fus = true;
              corta._dead = true;
            }
            else if (H) { corta.x1 = Math.round(n1); corta.x2 = Math.round(n2); corta.y1 = corta.y2 = axL; corta._fus = true; }
            else { corta.y1 = Math.round(n1); corta.y2 = Math.round(n2); corta.x1 = corta.x2 = axL; corta._fus = true; }
            if ((corta.t || 0) > (larga.t || 0)) { larga.type = corta.type; larga.t = corta.t; }
          }
          continue;
        }
        // fusionar. El eje: manda LA MEJOR ARMADA (la más recta respecto a
        // la rejilla). Si están igual de rectas, se pondera por largo como
        // antes (la grande manda). Espesor: se queda el MAYOR.
        var La = La0, Lb = Lb0;
        var rA = ruidoDeParada(a), rB = ruidoDeParada(b);
        var ax2;
        if (rA + 0.3 < rB) ax2 = Math.round(axA);
        else if (rB + 0.3 < rA) ax2 = Math.round(axB);
        else ax2 = Math.round((axA * La + axB * Lb) / (La + Lb || 1));
        // el tramo es el de la LARGA (la corta ya está dentro)
        var lo = La >= Lb ? a1 : b1, hi = La >= Lb ? a2 : b2;
        if (H) { a.y1 = ax2; a.y2 = ax2; a.x1 = lo; a.x2 = hi; }
        else { a.x1 = ax2; a.x2 = ax2; a.y1 = lo; a.y2 = hi; }
        if ((b.t || 0) > (a.t || 0)) { a.type = b.type; a.t = b.t; }
        a.rids = (a.rids || (a.rid ? [a.rid] : [])).concat(b.rids || (b.rid ? [b.rid] : []));
        a._fus = true;
        b._dead = true;
      }
    }
    var out = walls.filter(function (w) { return !w._dead; });
    walls.length = 0;
    out.forEach(function (w) { walls.push(w); });
  }
  // Paredes EN ÁNGULO duplicadas (dos piezas que comparten una pared
  // diagonal). El primer intento de esto se comía paredes buenas en cadena
  // porque solo miraba el ángulo. Ahora hay tres candados a la vez y los
  // tramos consecutivos de una cadena NO los pasan (se tocan punta con
  // punta, no se solapan):
  //   1. mismo ángulo (±6°)  2. separación perpendicular ≤ 24"
  //   3. se pisan al menos el 60% de la más corta
  function mergeDiagWalls(walls) {
    var GAP = 24, MINSOL = 0.92, i, j;
    function proyecta(w, px, py) {          // distancia a lo largo de w
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
      return ((px - w.x1) * dx + (py - w.y1) * dy) / L;
    }
    function perp(w, px, py) {              // distancia perpendicular a la RECTA de w
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
      return Math.abs((px - w.x1) * dy - (py - w.y1) * dx) / L;
    }
    for (i = 0; i < walls.length; i++) {
      var a = walls[i];
      if (!a || a._dead || a._o !== 'D') continue;
      for (j = i + 1; j < walls.length; j++) {
        var b = walls[j];
        if (!b || b._dead || b._o !== 'D') continue;
        var aa = Math.atan2(a.y2 - a.y1, a.x2 - a.x1) * 180 / Math.PI;
        var ab = Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180 / Math.PI;
        var da = Math.abs(aa - ab) % 180;
        if (da > 90) da = 180 - da;
        if (da > 6) continue;                                   // (1)
        var La = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
        var Lb = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
        if (La < 12 || Lb < 12) continue;
        // (2) separación: la recta de la larga contra los dos extremos de la otra
        var lar = La >= Lb ? a : b, cor = La >= Lb ? b : a;
        var sep = Math.max(perp(lar, cor.x1, cor.y1), perp(lar, cor.x2, cor.y2));
        if (sep > GAP) continue;
        // (3) solape proyectado sobre la larga
        var t1 = proyecta(lar, cor.x1, cor.y1), t2 = proyecta(lar, cor.x2, cor.y2);
        var c1 = Math.min(t1, t2), c2 = Math.max(t1, t2);
        var Ll = Math.hypot(lar.x2 - lar.x1, lar.y2 - lar.y1);
        var sol = Math.min(Ll, c2) - Math.max(0, c1);
        if (sol < MINSOL * Math.min(La, Lb)) continue;
        // fusionar sobre la recta y el TRAMO de la larga (nunca se estira)
        a.x1 = lar.x1; a.y1 = lar.y1; a.x2 = lar.x2; a.y2 = lar.y2;
        if ((b.t || 0) > (a.t || 0)) { a.type = b.type; a.t = b.t; }
        a.rids = (a.rids || (a.rid ? [a.rid] : [])).concat(b.rids || (b.rid ? [b.rid] : []));
        a._fus = true;
        b._dead = true;
      }
    }
    var out = walls.filter(function (w) { return !w._dead; });
    walls.length = 0;
    out.forEach(function (w) { walls.push(w); });
  }
  // uniones en T: una pared que muere cerca del cuerpo de otra se suelda a
  // ella (TOL 16 por los huecos de escaneos reales; el extremo se lleva al
  // cuerpo y se recorta al tramo de la otra pared)
  function snapTJunctions(walls) {
    var TOL = 16, TOL_FREE = 30;
    // extremo LIBRE = no toca ninguna otra pared: puede estirarse más
    // lejos por su propio eje hasta encontrar la pared que cruza
    // (extend-to-meet); un extremo ya conectado solo se ajusta fino
    function d2s(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
      var t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
    }
    walls.forEach(function (w) {
      ['1', '2'].forEach(function (e) {
        var px = w['x' + e], py = w['y' + e];
        var free = true;
        for (var k = 0; k < walls.length && free; k++) {
          if (walls[k] !== w && d2s(px, py, walls[k].x1, walls[k].y1, walls[k].x2, walls[k].y2) < 3) free = false;
        }
        var tol = free ? TOL_FREE : TOL;
        // elegir la pared cruzada MÁS CERCANA (no la última que coincida)
        var best = null, bestD = Infinity;
        walls.forEach(function (h) {
          if (h === w || h._o === w._o) return;
          if (h._o !== 'H' && h._o !== 'V') return;
          var d;
          if (h._o === 'H') {
            var lo = Math.min(h.x1, h.x2), hi = Math.max(h.x1, h.x2);
            d = Math.abs(py - h.y1);
            if (d < tol && d < bestD && px > lo - 8 && px < hi + 8) { best = h; bestD = d; }
          } else {
            var lo2 = Math.min(h.y1, h.y2), hi2 = Math.max(h.y1, h.y2);
            d = Math.abs(px - h.x1);
            if (d < tol && d < bestD && py > lo2 - 8 && py < hi2 + 8) { best = h; bestD = d; }
          }
        });
        if (best) {
          if (best._o === 'H') {
            w['y' + e] = best.y1;
            w['x' + e] = Math.max(Math.min(best.x1, best.x2), Math.min(Math.max(best.x1, best.x2), px));
          } else {
            w['x' + e] = best.x1;
            w['y' + e] = Math.max(Math.min(best.y1, best.y2), Math.min(Math.max(best.y1, best.y2), py));
          }
        }
      });
    });
  }
  // esquinas en L donde AMBAS paredes se quedan cortas (ninguna alcanza el
  // cuerpo de la otra): se extienden las dos hasta su intersección
  /* 🪢 UN SOLO LAYOUT (pedido de Edgar 08/29): tras soldar, dos tramos
     colineales que se tocan punta con punta son LA MISMA pared partida en
     dos. Se funden en una — el plano queda de piezas enteras, no de
     tramitos. Solo mismo tipo, misma dirección (≤2.5°) y puntas pegadas
     (≤2.5"); las puertas se re-enganchan solas después (van por posición). */
  function fundeColineales(walls) {
    var cambio = true, guarda = 0;
    while (cambio && guarda++ < 8) {
      cambio = false;
      for (var i = 0; i < walls.length && !cambio; i++) {
        var a = walls[i];
        for (var j = i + 1; j < walls.length && !cambio; j++) {
          var b = walls[j];
          if (a.type !== b.type) continue;
          var aa = Math.atan2(a.y2 - a.y1, a.x2 - a.x1) * 180 / Math.PI;
          var ab = Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180 / Math.PI;
          var da = Math.abs(aa - ab) % 180;
          if (da > 90) da = 180 - da;
          if (da > 2.5) continue;
          // ¿qué puntas se tocan?
          var pares2 = [['1','1'],['1','2'],['2','1'],['2','2']];
          for (var q = 0; q < 4; q++) {
            var ea = pares2[q][0], eb = pares2[q][1];
            var d = Math.hypot(a['x'+ea]-b['x'+eb], a['y'+ea]-b['y'+eb]);
            if (d > 2.5) continue;
            // los extremos LEJANOS pasan a ser la pared única
            var fa = ea === '1' ? '2' : '1', fb = eb === '1' ? '2' : '1';
            var nx1 = a['x'+fa], ny1 = a['y'+fa], nx2 = b['x'+fb], ny2 = b['y'+fb];
            // la unión debe seguir la misma línea (no doblar en V)
            var Ln = Math.hypot(nx2-nx1, ny2-ny1);
            var La2 = Math.hypot(a.x2-a.x1, a.y2-a.y1), Lb2 = Math.hypot(b.x2-b.x1, b.y2-b.y1);
            if (Ln < (La2 + Lb2) * 0.985) continue;   // en V: se doblaría — no
            a.x1 = nx1; a.y1 = ny1; a.x2 = nx2; a.y2 = ny2;
            if ((b.t || 0) > (a.t || 0)) { a.type = b.type; a.t = b.t; }
            a.rids = (a.rids || []).concat(b.rids || []);
            a._fus = true;
            walls.splice(j, 1);
            cambio = true;
            break;
          }
        }
      }
    }
  }

  /* 🔗 MICRO-SOLDADURA: dos puntas a 3-4 pulgadas una de otra no son una
     esquina, son LA MISMA esquina con ruido (medido 28/08: (351,194) contra
     (351,197) dejaba un hueco visible y sin inglete). Se llevan al medio. */
  function microSolda(walls) {
    var T = 4.5;
    for (var i = 0; i < walls.length; i++) for (var j = i + 1; j < walls.length; j++) {
      var a = walls[i], b = walls[j];
      [['1', '1'], ['1', '2'], ['2', '1'], ['2', '2']].forEach(function (par) {
        var ax = a['x' + par[0]], ay = a['y' + par[0]];
        var bx = b['x' + par[1]], by = b['y' + par[1]];
        var d = Math.hypot(ax - bx, ay - by);
        if (d < 0.5 || d > T) return;
        var mx3 = Math.round((ax + bx) / 2), my3 = Math.round((ay + by) / 2);
        a['x' + par[0]] = mx3; a['y' + par[0]] = my3;
        b['x' + par[1]] = mx3; b['y' + par[1]] = my3;
      });
    }
  }

  /* 🧹 CABITOS: paredecitas de ≤9" que el escáner deja colgadas en las
     esquinas (medido 28/08: un cabo de 7" en la entrada del bedroom hacía
     que la esquina se viera ROTA). Un tramo más corto que un ladrillo con
     una punta al aire no es una pared: se borra. Si tiene una puerta encima
     (jamba de verdad) se respeta. */
  function quitaCabitos(walls) {
    var CORTO = 9, borrados = 0;
    function tocada(px, py, quien) {
      for (var k = 0; k < walls.length; k++) {
        var o = walls[k];
        if (o === quien || o._dead) continue;
        var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = dx * dx + dy * dy;
        var t = L ? ((px - o.x1) * dx + (py - o.y1) * dy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        if (Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t)) < 3) return true;
      }
      return false;
    }
    walls.forEach(function (w) {
      var L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (L > CORTO) return;
      if (state.openings.some(function (o) { return o.wallId === w.id; })) return;
      var t1 = tocada(w.x1, w.y1, w), t2 = tocada(w.x2, w.y2, w);
      if (t1 && t2) {
        // ¿puentecito de verdad, o una ASTILLA montada encima de otra pared?
        // Si las dos puntas y el medio caen sobre la misma pared, es astilla.
        var mx2 = (w.x1 + w.x2) / 2, my2 = (w.y1 + w.y2) / 2;
        var astilla = walls.some(function (o) {
          if (o === w || o._dead) return false;
          function dd(px, py) {
            var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L2 = dx * dx + dy * dy;
            var t = L2 ? ((px - o.x1) * dx + (py - o.y1) * dy) / L2 : 0;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t));
          }
          return dd(w.x1, w.y1) < 4 && dd(w.x2, w.y2) < 4 && dd(mx2, my2) < 4;
        });
        if (!astilla) return;            // puente de verdad: se queda
      }
      w._dead = true; borrados++;
    });
    if (borrados) {
      var out = walls.filter(function (w) { return !w._dead; });
      walls.length = 0;
      out.forEach(function (w) { walls.push(w); });
    }
    return borrados;
  }

  /* ✂️ CRUCES EN X (28/08, foto de Edgar): al soldar el closet contra la
     diagonal del bedroom, los cabos ATRAVESABAN la esquina y quedaba una X.
     Si dos paredes se cruzan y a una le sobra un cabito corto (≤14") más
     allá del cruce, y ese cabo no sostiene nada, se recorta al cruce. */
  function recortaCruces(walls) {
    function inter(a, b) {
      var d1x = a.x2 - a.x1, d1y = a.y2 - a.y1, d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
      var den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-6) return null;
      var t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / den;
      var u = ((b.x1 - a.x1) * d1y - (b.y1 - a.y1) * d1x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return { x: a.x1 + d1x * t, y: a.y1 + d1y * t, t: t, u: u };
    }
    function libre(px, py, quien) {
      for (var k = 0; k < walls.length; k++) {
        var o = walls[k];
        if (o === quien) continue;
        if (Math.hypot(px - o.x1, py - o.y1) < 3 || Math.hypot(px - o.x2, py - o.y2) < 3) return false;
      }
      return true;
    }
    var CABO = 14;
    for (var i = 0; i < walls.length; i++) for (var j = i + 1; j < walls.length; j++) {
      var a = walls[i], b = walls[j];
      var q = inter(a, b);
      if (!q) continue;
      [{ w: a, t: q.t }, { w: b, t: q.u }].forEach(function (par) {
        var w = par.w, L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        var d1 = par.t * L, d2 = (1 - par.t) * L;        // cabo por cada lado
        if (d1 > 2 && d1 <= CABO && libre(w.x1, w.y1, w)) { w.x1 = Math.round(q.x); w.y1 = Math.round(q.y); }
        else if (d2 > 2 && d2 <= CABO && libre(w.x2, w.y2, w)) { w.x2 = Math.round(q.x); w.y2 = Math.round(q.y); }
      });
    }
  }

  /* 📐 ESQUINAS EN CUALQUIER ÁNGULO: closeLCorners solo sabe V×H, y esta
     casa tiene diagonales de verdad. Dos puntas libres cercanas cuyas
     paredes NO son paralelas se llevan al cruce de sus rectas — solo
     alargando un poco (≤32"), nunca doblando la pared. */
  function cierraEsquinasLibres(walls) {
    /* Afinado tras verlo con los cuartos reales: la 1ª versión creó una PÚA
       cerrando un vano que era un paso de verdad. Tres frenos:
       · MAX 22" — por debajo del ancho mínimo de una puerta (24"): un hueco
         más ancho puede ser un paso real y se deja en paz
       · el cruce tiene que estar AHÍ MISMO (≤30" de las dos puntas), no en
         la prolongación lejana de dos rectas casi paralelas
       · si hay una puerta/abertura viva cerca del hueco, ese hueco es una
         ENTRADA: no se cierra */
    var MAX = 22, ALARGA = 30;
    function d2s(px, py, o) {
      var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = dx * dx + dy * dy;
      var t = L ? ((px - o.x1) * dx + (py - o.y1) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t));
    }
    var eps = [];
    walls.forEach(function (w) {
      ['1', '2'].forEach(function (e) {
        var px = w['x' + e], py = w['y' + e], free = true;
        for (var k = 0; k < walls.length && free; k++)
          if (walls[k] !== w && d2s(px, py, walls[k]) < 3) free = false;
        if (free) eps.push({ w: w, e: e });
      });
    });
    eps.forEach(function (a) {
      if (a.done) return;
      var ax = a.w['x' + a.e], ay = a.w['y' + a.e];
      var best = null, bd = 1e9;
      eps.forEach(function (b) {
        if (b === a || b.done || b.w === a.w) return;
        var d = Math.hypot(ax - b.w['x' + b.e], ay - b.w['y' + b.e]);
        if (d < bd) { bd = d; best = b; }
      });
      if (!best || bd > MAX) return;
      var b = best;
      var bx = b.w['x' + b.e], by = b.w['y' + b.e];
      var d1x = a.w.x2 - a.w.x1, d1y = a.w.y2 - a.w.y1;
      var d2x = b.w.x2 - b.w.x1, d2y = b.w.y2 - b.w.y1;
      var den = d1x * d2y - d1y * d2x;
      var L1 = Math.hypot(d1x, d1y) || 1, L2 = Math.hypot(d2x, d2y) || 1;
      if (Math.abs(den) / (L1 * L2) < 0.5) return;       // menos de ~30° entre sí: no es esquina
      var t = ((b.w.x1 - a.w.x1) * d2y - (b.w.y1 - a.w.y1) * d2x) / den;
      var ix = a.w.x1 + d1x * t, iy = a.w.y1 + d1y * t;
      // el cruce tiene que estar pegado a las dos puntas — si queda lejos,
      // esto no es una esquina rota, es otra cosa
      if (Math.hypot(ix - ax, iy - ay) > 30 || Math.hypot(ix - bx, iy - by) > 30) return;
      // ¿hay una puerta/abertura viva asomada al hueco? entonces es una entrada
      var mx = (ax + bx) / 2, my = (ay + by) / 2, entrada = false;
      if (esHuecoQuerido(mx, my)) return;   // Edgar borró pared aquí: se respeta
      state.openings.forEach(function (op) {
        if (entrada) return;
        var wo = null;
        for (var k2 = 0; k2 < state.walls.length; k2++) if (state.walls[k2].id === op.wallId) { wo = state.walls[k2]; break; }
        if (!wo) return;
        var Lo = Math.hypot(wo.x2 - wo.x1, wo.y2 - wo.y1) || 1;
        var to = op.pos / Lo;
        var ox2 = wo.x1 + (wo.x2 - wo.x1) * to, oy2 = wo.y1 + (wo.y2 - wo.y1) * to;
        if (Math.hypot(ox2 - mx, oy2 - my) < 36) entrada = true;
      });
      if (entrada) return;
      // cada punta solo puede ALARGARSE hacia el cruce (nunca doblarse hacia atrás)
      function vale(w, e, px, py) {
        var ox = e === '1' ? w.x2 : w.x1, oy = e === '1' ? w.y2 : w.y1;
        var ex = w['x' + e], ey = w['y' + e];
        var Lw = Math.hypot(ex - ox, ey - oy);
        var Ln = Math.hypot(px - ox, py - oy);
        // ni más de ALARGA, ni más del 35% del largo (el candado lo tumbaría)
        return Ln >= Lw - 2 && Ln - Lw <= Math.min(ALARGA, Lw * 0.35 + 6);
      }
      if (!vale(a.w, a.e, ix, iy) || !vale(b.w, b.e, ix, iy)) return;
      a.w['x' + a.e] = Math.round(ix); a.w['y' + a.e] = Math.round(iy);
      b.w['x' + b.e] = Math.round(ix); b.w['y' + b.e] = Math.round(iy);
      a.done = b.done = true;
    });
  }

  function closeLCorners(walls) {
    var MAX = 32;
    function d2s(px, py, o) {
      var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = dx * dx + dy * dy;
      var t = L ? ((px - o.x1) * dx + (py - o.y1) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t));
    }
    var eps = [];
    walls.forEach(function (w) {
      ['1', '2'].forEach(function (e) {
        var px = w['x' + e], py = w['y' + e], free = true;
        for (var k = 0; k < walls.length && free; k++) {
          if (walls[k] !== w && d2s(px, py, walls[k]) < 3) free = false;
        }
        if (free) eps.push({ w: w, e: e, x: px, y: py });
      });
    });
    eps.forEach(function (a) {
      if (a.done || a.w._o !== 'V') return;
      var best = null, bestD = Infinity;
      eps.forEach(function (b) {
        if (b.done || b.w._o !== 'H') return;
        var ix = a.x, iy = b.y;                    // intersección V×H
        var dA = Math.abs(a.y - iy), dB = Math.abs(b.x - ix);
        if (dA > MAX || dB > MAX) return;
        // solo EXTENDER (no atravesar la pared hacia atrás)
        var ay0 = a.e === '1' ? a.w.y2 : a.w.y1;
        var bx0 = b.e === '1' ? b.w.x2 : b.w.x1;
        if ((iy - ay0) * (a.y - ay0) < 0 || Math.abs(iy - ay0) < Math.abs(a.y - ay0) - 2) return;
        if ((ix - bx0) * (b.x - bx0) < 0 || Math.abs(ix - bx0) < Math.abs(b.x - bx0) - 2) return;
        var d = dA + dB;
        if (d < bestD) { best = { b: b, ix: ix, iy: iy }; bestD = d; }
      });
      if (best) {
        a.w['x' + a.e] = best.ix; a.w['y' + a.e] = best.iy;
        best.b.w['x' + best.b.e] = best.ix; best.b.w['y' + best.b.e] = best.iy;
        a.done = true; best.b.done = true;
      }
    });
  }
  // extremo SUELTO (no toca nada): se suelda al punto más cercano de otra
  // pared si está a menos de 24" — vale para paredes en ángulo, donde el
  // snap H/V no aplica (particiones diagonales que mueren en el aire)
  function snapFreeEnds(walls) {
    var MAXD = 24;
    function proj(px, py, o) {
      var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = dx * dx + dy * dy;
      var t = L ? ((px - o.x1) * dx + (py - o.y1) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      var qx = o.x1 + dx * t, qy = o.y1 + dy * t;
      return { d: Math.hypot(px - qx, py - qy), x: qx, y: qy };
    }
    walls.forEach(function (w) {
      ['1', '2'].forEach(function (e) {
        var px = w['x' + e], py = w['y' + e];
        var free = true, best = null;
        walls.forEach(function (o) {
          if (o === w) return;
          var r = proj(px, py, o);
          if (r.d < 3) free = false;
          if (r.d < MAXD && (!best || r.d < best.d)) best = r;
        });
        if (free && best) { w['x' + e] = Math.round(best.x); w['y' + e] = Math.round(best.y); }
      });
    });
  }
  // tramos COLINEALES fragmentados: un muro real llega partido en pedazos
  // con huecos de pulgadas (defecto de escaneo, no un pasillo — los pasos
  // reales miden 24"+ y vienen como openings) — se puentean y fusionan
  function bridgeCollinear(walls) {
    var MAXGAP = 18, AXTOL = 7, i, j, changed = true, guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      for (i = 0; i < walls.length; i++) {
        var a = walls[i];
        if (!a || a._dead) continue;
        if (a._o === 'D') continue;
        for (j = i + 1; j < walls.length; j++) {
          var b = walls[j];
          if (!b || b._dead || a._o !== b._o) continue;
          var H = a._o === 'H';
          var axA = H ? a.y1 : a.x1, axB = H ? b.y1 : b.x1;
          if (Math.abs(axA - axB) > AXTOL) continue;
          var a1 = H ? Math.min(a.x1, a.x2) : Math.min(a.y1, a.y2);
          var a2 = H ? Math.max(a.x1, a.x2) : Math.max(a.y1, a.y2);
          var b1 = H ? Math.min(b.x1, b.x2) : Math.min(b.y1, b.y2);
          var b2 = H ? Math.max(b.x1, b.x2) : Math.max(b.y1, b.y2);
          var gap = Math.max(a1, b1) - Math.min(a2, b2);   // >0 = hueco entre tramos
          if (gap > MAXGAP) continue;
          if (gap < -2) continue;                            // encimados: eso es de mergeParallel
          // si Edgar borró pared justo AHÍ, ese hueco es una puerta suya
          var gmid = (Math.min(a2, b2) + Math.max(a1, b1)) / 2;
          if (esHuecoQuerido(H ? gmid : (axA + axB) / 2, H ? (axA + axB) / 2 : gmid)) continue;
          var ax2 = Math.round((axA + axB) / 2), lo = Math.min(a1, b1), hi = Math.max(a2, b2);
          if (H) { a.y1 = ax2; a.y2 = ax2; a.x1 = lo; a.x2 = hi; }
          else { a.x1 = ax2; a.x2 = ax2; a.y1 = lo; a.y2 = hi; }
          a.rids = (a.rids || (a.rid ? [a.rid] : [])).concat(b.rids || (b.rid ? [b.rid] : []));
          a._fus = true;
          b._dead = true;
          changed = true;
        }
      }
    }
    var out = walls.filter(function (w) { return !w._dead; });
    walls.length = 0;
    out.forEach(function (w) { walls.push(w); });
  }
  // etiquetas de habitación que manda el escaneo (kitchen, bedroom…)
  var SECTION_NAMES = {
    kitchen: 'KITCHEN', livingRoom: 'LIVING ROOM', bedroom: 'BEDROOM',
    bathroom: 'BATHROOM', diningRoom: 'DINING ROOM', office: 'OFFICE',
    laundryRoom: 'LAUNDRY', garage: 'GARAGE', hallway: 'HALLWAY',
    closet: 'CLOSET', stairs: 'STAIRS', unidentified: ''
  };
  /* --- detección de habitaciones: encuentra los cuartos CERRADOS en el
     grafo de paredes (caras internas del grafo plano). Con esto la app sabe
     dónde está cada cuarto, cuánto mide y qué paredes son exteriores. --- */
  function detectRoomPolys(walls) {
    // 1) segmentos virtuales: partir cada pared donde otra la toca (uniones T)
    var segs = [];
    walls.forEach(function (w) {
      var H = Math.abs(w.y2 - w.y1) <= Math.abs(w.x2 - w.x1);
      var lo = H ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2);
      var hi = H ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
      var axis = H ? w.y1 : w.x1;
      var cuts = [];
      walls.forEach(function (o) {
        if (o === w) return;
        [[o.x1, o.y1], [o.x2, o.y2]].forEach(function (p) {
          var along = H ? p[0] : p[1], perp = H ? p[1] : p[0];
          if (Math.abs(perp - axis) < 0.75 && along > lo + 0.75 && along < hi - 0.75) cuts.push(along);
        });
      });
      cuts.sort(function (a, b) { return a - b; });
      var stops = [lo];
      cuts.forEach(function (c) { if (c - stops[stops.length - 1] > 0.75) stops.push(c); });
      if (hi - stops[stops.length - 1] > 0.75) stops.push(hi); else stops[stops.length - 1] = hi;
      for (var i = 0; i + 1 < stops.length; i++) {
        segs.push(H
          ? { x1: stops[i], y1: axis, x2: stops[i + 1], y2: axis, wall: w }
          : { x1: axis, y1: stops[i], x2: axis, y2: stops[i + 1], wall: w });
      }
    });
    // 2) grafo de medios-lados y trazado de caras (girar siempre lo más a la izquierda)
    function key(x, y) { return Math.round(x) + ',' + Math.round(y); }
    var nodes = {}, edges = [];
    segs.forEach(function (s) {
      var a = key(s.x1, s.y1), b = key(s.x2, s.y2);
      if (a === b) return;
      var e1 = { from: a, to: b, seg: s, ang: Math.atan2(s.y2 - s.y1, s.x2 - s.x1), used: false };
      var e2 = { from: b, to: a, seg: s, ang: Math.atan2(s.y1 - s.y2, s.x1 - s.x2), used: false };
      e1.twin = e2; e2.twin = e1;
      edges.push(e1, e2);
      (nodes[a] = nodes[a] || []).push(e1);
      (nodes[b] = nodes[b] || []).push(e2);
    });
    Object.keys(nodes).forEach(function (k) {
      nodes[k].sort(function (a, b) { return a.ang - b.ang; });
    });
    function nextEdge(e) {
      var list = nodes[e.to];
      var back = e.twin.ang;
      // el siguiente en orden angular DESPUÉS del edge de regreso (giro a la izquierda)
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i] === e.twin) { idx = i; break; }
      return list[(idx + 1) % list.length];
    }
    var faces = [];
    edges.forEach(function (e0) {
      if (e0.used) return;
      var poly = [], faceSegs = [], e = e0, guard = 0;
      while (!e.used && guard++ < 4000) {
        e.used = true;
        var p = e.from.split(',');
        poly.push([+p[0], +p[1]]);
        faceSegs.push(e.seg);
        e = nextEdge(e);
        if (e === e0) break;
      }
      if (poly.length < 3) return;
      var area = 0;
      for (var i = 0; i < poly.length; i++) {
        var q = poly[(i + 1) % poly.length];
        area += poly[i][0] * q[1] - q[0] * poly[i][1];
      }
      faces.push({ poly: poly, area: area / 2, segs: faceSegs });
    });
    if (!faces.length) return [];
    // la cara exterior es la de mayor área absoluta: se descarta
    var outer = faces.reduce(function (m, f) { return Math.abs(f.area) > Math.abs(m.area) ? f : m; }, faces[0]);
    var rooms = faces.filter(function (f) { return f !== outer && Math.abs(f.area) >= 15 * 144; });
    // exterior = pared con ALGÚN segmento que da a la cara de afuera
    // (un perímetro largo toca varios cuartos por dentro, pero por fuera
    // siempre da a la calle — por eso se cuenta POR SEGMENTO)
    var segCount = new Map();
    rooms.forEach(function (f) {
      f.segs.forEach(function (s) { segCount.set(s, (segCount.get(s) || 0) + 1); });
    });
    var ext = new Set();
    segs.forEach(function (s) {
      if ((segCount.get(s) || 0) < 2) ext.add(s.wall);
    });
    return rooms.map(function (f) {
      var cx = 0, cy = 0;
      f.poly.forEach(function (p) { cx += p[0]; cy += p[1]; });
      return {
        poly: f.poly, sqft: Math.round(Math.abs(f.area) / 144),
        cx: cx / f.poly.length, cy: cy / f.poly.length,
        walls: f.segs.map(function (s) { return s.wall; }),
        _ext: ext
      };
    });
  }
  function ptInPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if ((poly[i][1] > y) !== (poly[j][1] > y) &&
        x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside;
    }
    return inside;
  }
  // post-proceso con los polígonos de piso REALES de Apple (rooms[].floors):
  // área exacta por cuarto, nombre en su centro y tipo de pared por lados —
  // no depende de que el grafo de paredes cierre perfecto
  // 📋 RECIBO: lo que el archivo TRAE vs lo que el plano DIBUJÓ. Edgar:
  // "quiero ver si el dibujo tuvo alguna diferencia con el documento que
  // exporta" — aquí es donde se pierde información entre las dos apps, así
  // que en vez de confiar, se cuenta y se compara.
  var reciboDib = [];      // [{name, sqft}] de cada cuarto que se dibujó
  var ultimoRecibo = null; // texto del último recibo (botón 📋 Recibo)
  var reciboNota = '';     // aviso extra del importador para el recibo
  var reciboLimpio = null; // qué hizo la limpieza automática al importar
  // lo que el ARCHIVO trae, contado sin tocar el dibujo
  function contarArchivo(o) {
    var M = 39.3700787;
    var r = { cuartos: 0, paredes: 0, puertas: 0, ventanas: 0, aberturas: 0, pies: 0, sqft: 0, nombres: [] };
    function sumaSup(list, campo) {
      (list || []).forEach(function (s2) {
        r[campo]++;
        if (campo === 'paredes') r.pies += ((s2.dimensions && s2.dimensions[0]) || 0) * M / 12;
      });
    }
    function unCuarto(rm) {
      sumaSup(rm.walls, 'paredes');
      sumaSup(rm.doors, 'puertas');
      sumaSup(rm.windows, 'ventanas');
      sumaSup(rm.openings, 'aberturas');
      return unCuarto2(rm);
    }
    function flatM(t) { return Array.isArray(t[0]) ? [].concat(t[0], t[1], t[2], t[3]) : t; }
    function unCuarto2(rm) {          // solo la superficie del piso
      // OJO (auditoría 08/28): polygonCorners viene en coordenadas LOCALES
      // de la superficie — su Z es ~0. Tomando la Z, el área salía CERO y el
      // recibo daba falsa alarma en cualquier escaneo sin mxpMeta. Hay que
      // pasar los puntos por la matriz, igual que hace el importador.
      var mejor = 0;
      (rm.floors || []).forEach(function (f) {
        var pc = f.polygonCorners;
        if (!Array.isArray(pc) || pc.length < 3) return;
        var t = f.transform ? flatM(f.transform) : null;
        var pts = pc.map(function (c) {
          if (!t) return [c[0] * M, (c[2] != null ? c[2] : c[1]) * M];
          var wx = t[0] * c[0] + t[4] * c[1] + t[8] * (c[2] || 0) + t[12];
          var wz = t[2] * c[0] + t[6] * c[1] + t[10] * (c[2] || 0) + t[14];
          return [wx * M, wz * M];
        });
        var a = 0;
        for (var i = 0; i < pts.length; i++) {
          var p1 = pts[i], p2 = pts[(i + 1) % pts.length];
          a += p1[0] * p2[1] - p2[0] * p1[1];
        }
        mejor = Math.max(mejor, Math.abs(a / 2) / 144);
      });
      return Math.round(mejor);
    }
    var meta = (o.mxpMeta && Array.isArray(o.mxpMeta.rooms)) ? o.mxpMeta.rooms : [];
    // IMPORTANTE: hay que contar de DONDE LEE el importador, si no el recibo
    // miente. El archivo trae las dos cosas: las paredes de raíz (las que ya
    // pasaron por el StructureBuilder de Apple) y las crudas de cada cuarto.
    // Si hay paredes de raíz, ésas son las que se dibujan.
    var unSolo = (Array.isArray(o.rooms) && o.rooms.length === 1 && o.rooms[0] && Array.isArray(o.rooms[0].walls) &&
      (!Array.isArray(o.walls) || o.rooms[0].walls.length >= o.walls.length));
    var cuartos = ((unSolo || !o.walls) && Array.isArray(o.rooms) && o.rooms.length && o.rooms[0] && o.rooms[0].walls) ? o.rooms : null;
    if (cuartos) {
      cuartos.forEach(function (rm, i) {
        r.cuartos++;
        var sq = unCuarto(rm);
        var nm = (meta[i] && meta[i].name) ? String(meta[i].name).toUpperCase() : '(sin nombre)';
        if (meta[i] && meta[i].sqft) sq = Math.round(meta[i].sqft);
        r.nombres.push({ name: nm, sqft: sq });
        r.sqft += sq;
      });
    } else {
      // paredes/puertas de raíz (un solo set), pero la superficie y los
      // nombres salen cuarto por cuarto
      sumaSup(o.walls, 'paredes');
      sumaSup(o.doors, 'puertas');
      sumaSup(o.windows, 'ventanas');
      sumaSup(o.openings, 'aberturas');
      var lista = (Array.isArray(o.rooms) && o.rooms.length) ? o.rooms : [o];
      lista.forEach(function (rm, i) {
        r.cuartos++;
        var sq = unCuarto2(rm) || unCuarto2(o);
        var nm = (meta[i] && meta[i].name) ? String(meta[i].name).toUpperCase() : '(sin nombre)';
        if (meta[i] && meta[i].sqft) sq = Math.round(meta[i].sqft);
        r.nombres.push({ name: nm, sqft: sq });
        r.sqft += sq;
      });
    }
    r.pies = Math.round(r.pies);
    return r;
  }
  // compara ARCHIVO vs DIBUJO y arma el texto del recibo
  function reciboImport(o, dib) {
    var A = contarArchivo(o);
    var pies = 0;
    dib.walls.forEach(function (w) { pies += Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 12; });
    pies = Math.round(pies);
    var sqDib = 0;
    reciboDib.forEach(function (c) { sqDib += c.sqft || 0; });
    var lin = [], fallas = 0;
    function fila(rot, a, b, uni, tol, nota) {
      // tol 0 = tiene que cuadrar EXACTO (cuartos, puertas, ventanas)
      var lim = tol ? Math.max(1, a * tol) : 0;
      var ok = Math.abs(a - b) <= lim;
      if (!ok) fallas++;
      var dif = a !== b ? '  (' + (b > a ? '+' : '') + (b - a) + ')' : '';
      lin.push((ok ? '✅ ' : '⚠️ ') + rot.padEnd(16) +
        'archivo ' + String(a + (uni || '')).padStart(9) +
        '   plano ' + String(b + (uni || '')).padStart(9) + dif + (nota || ''));
    }
    fila('CUARTOS', A.cuartos, reciboDib.length, '', 0);
    // OJO con PAREDES: el escáner de Apple manda la misma pared partida en
    // pedazos y duplicada. Que bajen no es perder: lo que NO puede bajar son
    // los PIES DE PARED. Por eso el conteo de paredes solo avisa si además
    // se perdieron pies.
    var piesOk = Math.abs(A.pies - pies) <= Math.max(1, A.pies * 0.03);
    fila('PAREDES', A.paredes, dib.walls.length, '',
      piesOk ? 1 : 0.02,
      (piesOk && A.paredes !== dib.walls.length)
        ? '  ← pedazos y duplicados unidos (los pies cuadran)' : '');
    fila('PUERTAS+ABERT.', A.puertas + A.aberturas, dib.doors, '', 0);
    fila('VENTANAS', A.ventanas, dib.windows, '', 0);
    fila('PIES DE PARED', A.pies, pies, ' ft', 0.03);
    fila('SUPERFICIE', A.sqft, sqDib, ' sf', 0.04);
    var txt = '📋 RECIBO DE IMPORTACIÓN — MXP Scan → MXP Planos\n\n' + lin.join('\n');
    if (reciboNota) txt += '\n\nℹ️ ' + reciboNota;
    /* Trabajo callado, pero CON RECIBO: la limpieza corre sola al importar,
       y aquí queda escrito qué tocó y qué NO pudo mejorar. Edgar pidió que
       trabajara en silencio — no que trabajara a escondidas. */
    if (reciboLimpio) {
      var L = reciboLimpio, l = [];
      if (L.mejoradas) l.push(L.mejoradas + ' cuarto(s) enderezado(s)' +
        (L.enderezadas ? ' (' + L.enderezadas + ' paredes al ángulo exacto de su familia)' : ''));
      if (L.cabitos) l.push(L.cabitos + ' cabito(s) de basura fuera');
      if (L.puntas) l.push(L.puntas + ' punta(s) de esquina soldadas');
      if (L.revertidas) l.push(L.revertidas + ' cuarto(s) se dejaron COMO VINIERON (limpiarlos los empeoraba)');
      if (l.length) txt += '\n\n🧹 LIMPIEZA AUTOMÁTICA: ' + l.join(' · ') +
        '.\nSe limpia solo lo que MEJORA: se mide el ruido antes y después, y si no baja, la pieza vuelve exacta a como vino.';
    }
    if (fallas) {
      txt += '\n\n⚠️ HAY DIFERENCIAS. Cuarto por cuarto:\n';
      A.nombres.forEach(function (a) {
        var d = reciboDib.filter(function (x) { return x.name === a.name; })[0];
        txt += (d ? (Math.abs(d.sqft - a.sqft) <= Math.max(4, a.sqft * 0.06) ? '   ✅ ' : '   ⚠️ ') +
          a.name + ': ' + a.sqft + ' sf en el archivo → ' + d.sqft + ' sf dibujado'
          : '   ❌ ' + a.name + ': ' + a.sqft + ' sf — NO SE DIBUJÓ') + '\n';
      });
      txt += '\nSi falta un cuarto, ese escaneo llegó incompleto: vuelve a exportarlo desde MXP Scan.';
    } else {
      txt += '\n\n✅ Todo lo que trae el archivo está en el plano. Nada se perdió.';
    }
    return { txt: txt, fallas: fallas };
  }
  function scanRoomsFromPolys(newWalls, polys, ox, oy, outer, noType) {
    var names = [];
    // huella exterior global (si viene): lo de "afuera" se mide contra
    // ELLA — un clóset sin huella propia ya no marca block a sus paredes
    var outPolys = (outer || []).map(function (op) {
      return op.map(function (p) { return [p.cx + ox, p.cy + oy]; });
    });
    var rl = polys.map(function (rp) {
      var pts = rp.pts.map(function (p) { return [p.cx + ox, p.cy + oy]; });
      var area = 0, cx = 0, cy = 0;
      for (var i = 0; i < pts.length; i++) {
        var q = pts[(i + 1) % pts.length];
        area += pts[i][0] * q[1] - q[0] * pts[i][1];
        cx += pts[i][0]; cy += pts[i][1];
      }
      return {
        pts: pts, sqft: Math.round(Math.abs(area / 2) / 144),
        cx: cx / pts.length, cy: cy / pts.length, name: rp.name
      };
    }).filter(function (r) { return r.sqft >= 5; });
    // tipo de pared: se prueba a 9" de cada lado en 3 puntos del muro;
    // si un lado da FUERA de todos los cuartos en 2+ puntos → exterior (block)
    function insideAny(x, y) {
      if (outPolys.length) {
        for (var j = 0; j < outPolys.length; j++) if (ptInPoly(x, y, outPolys[j])) return true;
        return false;
      }
      for (var i = 0; i < rl.length; i++) if (ptInPoly(x, y, rl[i].pts)) return true;
      return false;
    }
    // OJO: aquí NO se pone block nunca. En CUARTOS SUELTOS cada cuarto llega
    // solo, así que TODAS sus paredes parecen exteriores y salían de bloque —
    // Edgar: "realmente solo el contorno de la casa es de bloque, y es más
    // fácil editar 4 paredes que 30". El block lo pone 🧲 Soldar armado, que
    // es el único momento en que se sabe qué da de verdad a la calle.
    if (false) newWalls.forEach(function (w) {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1;
      var nx = -dy / L, ny = dx / L, OFF = 9, votes = 0;
      [0.25, 0.5, 0.75].forEach(function (t) {
        var mx = w.x1 + dx * t, my = w.y1 + dy * t;
        var a = insideAny(mx + nx * OFF, my + ny * OFF);
        var b = insideAny(mx - nx * OFF, my - ny * OFF);
        if (a !== b) votes++;
      });
      if (votes >= 2) { w.type = 'block'; w.t = 8; }
    });
    rl.forEach(function (r) {
      reciboDib.push({ name: r.name ? String(r.name).toUpperCase() : '(sin nombre)', sqft: r.sqft });
      var small = r.sqft < 120;
      var ls = small ? 7 : 10, as2 = small ? 4.5 : 6;
      if (r.name) {
        state.texts.push({ id: uid(), x: Math.round(r.cx - String(r.name).length * ls * 0.29), y: Math.round(r.cy), text: r.name, size: ls });
        state.texts.push({ id: uid(), x: Math.round(r.cx - as2 * 0.55 * String(r.sqft + ' SQ FT').length / 2), y: Math.round(r.cy + ls * 1.3), text: r.sqft + ' SQ FT', size: as2 });
        names.push(String(r.name).toUpperCase());
      } else {
        state.texts.push({ id: uid(), x: Math.round(r.cx - 3.2 * String(r.sqft + ' SQ FT').length / 2), y: Math.round(r.cy), text: r.sqft + ' SQ FT', size: 6 });
      }
    });
    return names;
  }
  // post-proceso pro del escaneo: nombres en su cuarto + sq ft + tipo de pared
  function scanRoomsPost(newWalls, labels, offX, offY) {
    var rooms = detectRoomPolys(newWalls);
    var names = [];
    if (rooms.length) {
      // (el tipo de pared NO se decide al importar — ver nota en
      // scanRoomsFromPolys; todo entra en drywall y el block lo pone 🧲 Soldar)
      var claimed = new Set();
      (labels || []).forEach(function (l) {
        var lx = l.cx + offX, ly = l.cy + offY;
        var room = null;
        for (var i = 0; i < rooms.length; i++) {
          if (!claimed.has(i) && ptInPoly(lx, ly, rooms[i].poly)) { room = rooms[i]; claimed.add(i); break; }
        }
        if (!room) {
          var bd = Infinity, bi = -1;
          rooms.forEach(function (r, i) {
            if (claimed.has(i)) return;
            var d = Math.hypot(r.cx - lx, r.cy - ly);
            if (d < bd) { bd = d; bi = i; }
          });
          if (bi >= 0) { room = rooms[bi]; claimed.add(bi); }
        }
        var tx = room ? room.cx : lx, ty = room ? room.cy : ly;
        // en cuartos chicos (baño, closet) la letra se achica para no encimarse
        var small = room && room.sqft < 120;
        var ls = small ? 7 : 10, as2 = small ? 4.5 : 6;
        state.texts.push({ id: uid(), x: Math.round(tx - String(l.text).length * ls * 0.29), y: Math.round(ty), text: l.text, size: ls });
        if (room) state.texts.push({ id: uid(), x: Math.round(tx - as2 * 0.55 * String(room.sqft + ' SQ FT').length / 2), y: Math.round(ty + ls * 1.3), text: room.sqft + ' SQ FT', size: as2 });
        reciboDib.push({ name: String(l.text).toUpperCase(), sqft: room ? room.sqft : 0 });
        names.push(String(l.text).toUpperCase());
      });
      // cuartos sin nombre: solo su área
      rooms.forEach(function (r, i) {
        if (claimed.has(i)) return;
        reciboDib.push({ name: '(sin nombre)', sqft: r.sqft });
        state.texts.push({ id: uid(), x: Math.round(r.cx - 3.2 * String(r.sqft + ' SQ FT').length / 2), y: Math.round(r.cy), text: r.sqft + ' SQ FT', size: 6 });
      });
    } else {
      (labels || []).forEach(function (l) {
        state.texts.push({ id: uid(), x: Math.round(l.cx + offX), y: Math.round(l.cy + offY), text: l.text, size: 10 });
        names.push(String(l.text).toUpperCase());
      });
    }
    return names;
  }
  // recordatorios NEC según los cuartos que trajo el escaneo
  var NEC_TIPS = {
    'KITCHEN': 'KITCHEN: 2 circuitos 20A small-appliance + GFCI en countertops (NEC 210.11(C)(1), 210.8)',
    'BATHROOM': 'BATHROOM: circuito 20A + GFCI (NEC 210.11(C)(3), 210.8(A)(1))',
    'LAUNDRY': 'LAUNDRY: circuito 20A dedicado + GFCI (NEC 210.11(C)(2))',
    'GARAGE': 'GARAGE: receptáculos con GFCI (NEC 210.8(A)(2))',
    'BEDROOM': 'BEDROOM: protección AFCI (NEC 210.12)',
    'LIVING ROOM': 'LIVING ROOM: protección AFCI (NEC 210.12)',
    'DINING ROOM': 'DINING ROOM: AFCI + considerar circuito small-appliance (NEC 210.52(B))'
  };
  function scanNecTips(names) {
    var tips = [];
    var seen = new Set();
    (names || []).forEach(function (n) {
      if (NEC_TIPS[n] && !seen.has(n)) { seen.add(n); tips.push('• ' + NEC_TIPS[n]); }
    });
    if (tips.length) uiAlert('⚡ Recordatorios NEC para este plano:\n\n' + tips.join('\n'));
  }

  // acotado automático: solo el PERÍMETRO (las cotas interiores cruzando los
  // cuartos son ruido — Twindo tampoco las pone); si no se detectó exterior,
  // se acotan las paredes largas
  function scanAutoDims(newWalls) {
    var ext = newWalls.filter(function (w) { return w.type === 'block'; });
    var list = ext.length >= 3 ? ext : newWalls;
    list.forEach(function (w) {
      if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 48) return;
      state.dims.push({ id: uid(), x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, off: 14 });
    });
  }
  // colocar una abertura sobre una pared, proyectando su centro.
  // REGLA: una abertura JAMÁS cruza el punto donde otra pared se une a esta
  // (un portón no puede atravesar la división del cuarto de al lado) — se
  // encaja en el tramo libre entre uniones y se recorta si no cabe.
  function scanPlaceOpening(wall, px, py, wdt, type, counts, isWin, allWalls) {
    var len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    wdt = Math.max(18, Math.round(wdt || 36));
    var r = distToSeg(px, py, wall.x1, wall.y1, wall.x2, wall.y2);
    var c = r.t * len;
    // tramo libre: entre los puntos donde otras paredes tocan esta
    var lo = 0, hi = len;
    (allWalls || []).forEach(function (o) {
      if (o === wall) return;
      [[o.x1, o.y1], [o.x2, o.y2]].forEach(function (p) {
        var rr = distToSeg(p[0], p[1], wall.x1, wall.y1, wall.x2, wall.y2);
        if (rr.d > 2) return;
        var along = rr.t * len;
        if (along <= 1 || along >= len - 1) return;   // esquina, no unión intermedia
        if (along <= c && along > lo) lo = along;
        if (along >= c && along < hi) hi = along;
      });
    });
    var span = hi - lo;
    if (span < 22) return;                       // no cabe ninguna abertura aquí
    if (wdt > span - 4) wdt = Math.round(span - 4);   // se recorta al tramo
    var pos = Math.max(lo + wdt / 2 + 1, Math.min(hi - wdt / 2 - 1, Math.round(c)));
    state.openings.push({ id: uid(), wallId: wall.id, type: type || (isWin ? 'window' : 'door'), pos: Math.round(pos), w: wdt, swing: 1, hinge: 0 });
    if (isWin) counts.windows++; else counts.doors++;
  }
  // tipos de puerta del editor OpenPlan3D → los nuestros
  var OP3D_DOOR = { single: 'door', double: 'double', french: 'double', sliding: 'slider', bifold: 'bifold', pocket: 'pocket', opening: 'opening', garage: 'garage' };

  // muebles/equipos que RoomPlan detecta → nombre corto en el plano
  var FURN_NAMES = {
    bed: 'BED', sofa: 'SOFA', table: 'TABLE', storage: 'CABINET',
    refrigerator: 'REF', oven: 'OVEN', stove: 'RANGE', sink: 'SINK',
    toilet: 'WC', bathtub: 'TUB', washerDryer: 'W/D', dishwasher: 'DW',
    television: 'TV', fireplace: 'FIREPLACE', stairs: 'STAIRS'
  };
  // cada mueble detectado se dibuja con SU símbolo real de la paleta
  // (la cama se ve como cama, el sofá como sofá — no un rectángulo gris)
  function furnSymbol(cat, wIn) {
    switch (cat) {
      case 'bed': return wIn < 45 ? 'bed_twin' : (wIn < 66 ? 'bed_queen' : 'bed_king');
      case 'sofa': return wIn < 70 ? 'loveseat' : 'sofa';
      case 'table': return 'dining6';
      case 'storage': return 'dresser';
      case 'refrigerator': return 'fridge';
      case 'oven': return 'range';
      case 'stove': return 'range';
      case 'sink': return 'kitchen_sink';
      case 'toilet': return 'toilet';
      case 'bathtub': return 'tub';
      case 'washerDryer': return 'washer';
      case 'dishwasher': return 'dishwasher';
      case 'television': return 'tv_console';
    }
    return null;
  }
  function catKey(c) {
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object') return Object.keys(c)[0] || '';
    return '';
  }
  // cuántos muebles útiles trae el escaneo (las sillas se ignoran: solo estorban)
  function scanFurnCount(o) {
    var n = 0;
    function cnt(list) { (list || []).forEach(function (s) { if (FURN_NAMES[catKey(s.category)]) n++; }); }
    cnt(o.objects);
    (o.rooms || []).forEach(function (rm) { cnt(rm.objects); });
    return n;
  }

  /* ══════════ 🧹 LIMPIEZA AUTOMÁTICA AL IMPORTAR ══════════
     Pedido de Edgar 08/29: *"yo no quería la IA para preguntarle nada; yo
     quería que trabajara en silencio, que mejorara la calidad de los
     escaneos y arreglara las líneas y los puntos de geometría para que el
     traspaso a MXP Planos sea más limpio"*. Tiene razón: esto es geometría,
     no es una conversación. Corre aquí, gratis, en milisegundos y sin
     internet.

     PERO NO A CIEGAS. Medido sobre sus 13 escaneos reales (08/29):
       office        6.4° → 0.00°   ✓
       main living   4.8° → 0.00°   ✓
       master closet 2.4° → 0.63°   ✓
       master bath   1.5° → 1.54°   =
       living/dining 5.3° → 5.21°   =
       KITCHEN       2.1° → 4.55°   ✗ EMPEORA
     Por eso el candado: se limpia, se vuelve a medir, y si no mejoró la
     pieza vuelve EXACTA a como venía. La regla de MODO FIEL sigue en pie —
     el escaneo manda; la limpieza solo puede ayudar, nunca estropear. */
  function ruidoDePieza(W) {
    var gr = gruposDir(W), m = 0;
    gr.forEach(function (g) {
      g.ws.forEach(function (w) {
        var t = ((Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI % 90) + 90) % 90;
        m = Math.max(m, dist90(t, g.a));
      });
    });
    return m;
  }
  function limpiaPiezaImportada(ids) {
    var W = state.walls.filter(function (w) { return ids[w.id]; });
    if (W.length < 3) return null;
    var rep = { enderezadas: 0, ruido0: 0, ruido1: 0, cabitos: 0, puntas: 0, revertido: false };

    /* EL ORDEN IMPORTA (medido 08/29): quitar un cabito CAMBIA las familias
       de dirección de la pieza, así que si se quita después de enderezar, la
       medida del candado se falsea y el office pasaba de 0.00° a 3.27°.
       Primero se saca la basura, y ya con la pieza limpia se endereza. */

    // 1) cabitos: tramos de menos de 9" con una punta al aire no son paredes
    var antesN = W.length;
    quitaCabitos(W);
    rep.cabitos = antesN - W.length;
    if (rep.cabitos) {
      var vivos = {};
      W.forEach(function (w) { vivos[w.id] = 1; });
      state.walls = state.walls.filter(function (w) { return !ids[w.id] || vivos[w.id]; });
      limpiaHuerfanas();
    }

    // 2) enderezar el ruido de 1-5° contra las familias de la propia pieza
    rep.ruido0 = ruidoDePieza(W);
    if (rep.ruido0 >= 0.6 && W.length >= 3) {
      var foto = W.map(function (w) { return { w: w, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }; });
      var r = rectificarYcerrar(W);
      rep.ruido1 = ruidoDePieza(W);
      // 🔒 CANDADO: si no mejoró de verdad, la pieza vuelve EXACTA a como vino
      if (rep.ruido1 > rep.ruido0 - 0.3) {
        foto.forEach(function (o) { o.w.x1 = o.x1; o.w.y1 = o.y1; o.w.x2 = o.x2; o.w.y2 = o.y2; });
        rep.ruido1 = rep.ruido0; rep.revertido = true;
      } else rep.enderezadas = (r && r.girada) || 0;
    } else rep.ruido1 = rep.ruido0;

    // 3) puntas a 3-4" son LA MISMA esquina con ruido: se juntan
    var antesP = 0, T = 4.5;
    for (var i = 0; i < W.length; i++) for (var j = i + 1; j < W.length; j++)
      ['1', '2'].forEach(function (ea) {
        ['1', '2'].forEach(function (eb) {
          var d = Math.hypot(W[i]['x' + ea] - W[j]['x' + eb], W[i]['y' + ea] - W[j]['y' + eb]);
          if (d > 0.5 && d <= T) antesP++;
        });
      });
    microSolda(W);
    rep.puntas = antesP;
    return rep;
  }

  function importRoomScan(o, opts) {
    opts = opts || {};
    // OJO: el CapturedStructure REAL de Apple también trae "floors" (las
    // superficies de piso). Solo es un proyecto OpenPlan3D si sus pisos
    // traen paredes con start/end — si no, sigue el camino RoomPlan.
    if (o.floors && o.floors[0] && o.floors[0].walls) return importOP3D(o);
    // nombres puestos EN EL SITIO desde MXP Scan (mxpMeta.rooms, centro en
    // metros) — se capturan ANTES del aplanado de CapturedStructure
    var metaRooms = (o.mxpMeta && Array.isArray(o.mxpMeta.rooms))
      ? o.mxpMeta.rooms.filter(function (r) { return r && r.name; }) : [];
    // rooms[] originales (con sus pisos) ANTES de cualquier aplanado
    var srcRooms = Array.isArray(o.rooms) ? o.rooms : [];
    var metaAll = (o.mxpMeta && Array.isArray(o.mxpMeta.rooms)) ? o.mxpMeta.rooms : [];
    // si el cuarto se escaneó sin ponerle nombre con los chips, se usa el
    // NOMBRE DEL ARCHIVO (Edgar los nombra descriptivos: "Caroline_office")
    if (opts.fileName && metaAll.length === 1 && !metaAll[0].name) {
      var fnm = String(opts.fileName).replace(/\.[^.]*$/, '')
        .replace(/^[0-9a-f]{6,}[-_]/i, '')
        .replace(/^caroline[-_\s]*/i, '')
        .replace(/[-_]+/g, ' ').trim();
      if (fnm) metaAll[0].name = fnm.toUpperCase();
    }
    // CUARTOS SUELTOS (arquitectura de Edgar): cada cuarto se escaneó por
    // separado, SIN el entrelazado automático de Apple (ahí era donde se
    // desfasaba todo en casas complejas). Cada uno se importa solo —
    // perfecto, enderezado por su propio eje — y se monta AL LADO del
    // anterior; se arma arrastrando el grupo (marco de selección) a su
    // sitio. Paredes en drywall neutro: el tipo lo pone Edgar al armar.
    if (o.mxpMeta && o.mxpMeta.separate && srcRooms.length && srcRooms[0] && srcRooms[0].walls) {
      var totS = { walls: 0, doors: 0, windows: 0, furn: 0, floors: 1, names: [] };
      srcRooms.forEach(function (rm, ri) {
        var sub = {
          version: 2,
          walls: rm.walls || [], doors: rm.doors || [], windows: rm.windows || [],
          openings: rm.openings || [], sections: [], objects: rm.objects || [],
          floors: [], rooms: [rm], _noType: true,
          mxpMeta: { app: 'MXP Scan', rooms: [metaAll[ri] || {}] }
        };
        var idsAntes = {};
        state.walls.forEach(function (w) { idsAntes[w.id] = 1; });
        var n = importRoomScan(sub, opts);
        // 🧹 limpieza silenciosa de ESTA pieza (nunca de toda la hoja: cada
        // cuarto tiene sus propias familias de dirección)
        var nuevos = {};
        state.walls.forEach(function (w) { if (!idsAntes[w.id]) nuevos[w.id] = 1; });
        var lp = limpiaPiezaImportada(nuevos);
        if (lp) {
          totS.limpio = totS.limpio || { enderezadas: 0, cabitos: 0, puntas: 0, mejoradas: 0, revertidas: 0 };
          totS.limpio.enderezadas += lp.enderezadas;
          totS.limpio.cabitos += lp.cabitos;
          totS.limpio.puntas += lp.puntas;
          if (lp.revertido) totS.limpio.revertidas++;
          else if (lp.ruido0 - lp.ruido1 > 0.3) totS.limpio.mejoradas++;
        }
        ['walls', 'doors', 'windows', 'furn'].forEach(function (k2) { totS[k2] += n[k2] || 0; });
        totS.names = totS.names.concat(n.names || []);
      });
      reciboLimpio = totS.limpio || null;
      refresh(); zoomFit();
      return totS;
    }
    function flat(t) { return Array.isArray(t[0]) ? [].concat(t[0], t[1], t[2], t[3]) : t; }
    function seg(s) {
      var f = flat(s.transform);
      var L = ((s.dimensions && s.dimensions[0]) || 0) * M2IN;
      var cx = f[12] * M2IN, cy = f[14] * M2IN;
      var dx = f[0], dz = f[2], dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      return { x1: cx - dx * L / 2, y1: cy - dz * L / 2, x2: cx + dx * L / 2, y2: cy + dz * L / 2, cx: cx, cy: cy, w: L };
    }
    var totals = { walls: 0, doors: 0, windows: 0, furn: 0, floors: 0, names: [] };
    // ⚖️ AUDITORÍA 08/28: el archivo trae las paredes DOS VECES —
    //   rooms[].walls = lo que capturó el sensor (LO QUE DIBUJA MX SCAN)
    //   walls (raíz)  = lo que devolvió el StructureBuilder de Apple
    // Medido en los 13 escaneos de Caroline: casi siempre idénticas, pero el
    // StructureBuilder BORRA paredes (Master Bedroom −1, living/dining −2) y
    // funde tramos (closet: una pared cambió 31"). Con UN SOLO cuarto el
    // StructureBuilder no aporta nada (no hay nada que entrelazar) y sí
    // quita: se usan las del sensor, que es lo que Edgar vio en el teléfono.
    if (srcRooms.length === 1 && srcRooms[0] && Array.isArray(srcRooms[0].walls) &&
        srcRooms[0].walls.length && Array.isArray(o.walls)) {
      var nSens = srcRooms[0].walls.length, nEstr = o.walls.length;
      if (nSens >= nEstr) {
        o = {
          version: o.version,
          walls: srcRooms[0].walls,
          doors: srcRooms[0].doors || o.doors || [],
          windows: srcRooms[0].windows || o.windows || [],
          openings: srcRooms[0].openings || o.openings || [],
          objects: srcRooms[0].objects || o.objects || [],
          sections: o.sections || [], floors: o.floors || [],
          rooms: srcRooms, mxpMeta: o.mxpMeta, _noType: o._noType
        };
        if (nSens > nEstr) reciboNota = 'Se usaron las ' + nSens + ' paredes del SENSOR (las que viste en el teléfono); el StructureBuilder de Apple entregaba ' + nEstr + '.';
      }
    }
    // CapturedStructure (escaneo continuo multi-cuarto de MXP Scan): las
    // habitaciones vienen en rooms[] YA alineadas en el mismo origen —
    // se aplanan a un solo set y la fusión de paredes hace el resto
    if (!o.walls && Array.isArray(o.rooms) && o.rooms.length && o.rooms[0] && o.rooms[0].walls) {
      var flatO = { walls: [], doors: [], windows: [], openings: [], sections: [], objects: [] };
      o.rooms.forEach(function (rm) {
        ['walls', 'doors', 'windows', 'openings', 'sections', 'objects'].forEach(function (k2) {
          if (Array.isArray(rm[k2])) flatO[k2] = flatO[k2].concat(rm[k2]);
        });
      });
      o = flatO;
    }
    // dibuja UN piso ya recolectado y devuelve los conteos
    function buildFloor(fd) {
      /* FAMILIAS DE DIRECCIÓN (lo que hace un CAD de verdad): las paredes
         de una casa siguen POCAS direcciones (los ejes + el ángulo real del
         bay). Se detectan las dominantes (mod 90°, ponderadas por longitud)
         y cada pared se alinea EXACTA a su familia más cercana (±10°).
         Así: nada de paredes "casi rectas" inclinadas, y las diagonales
         reales salen paralelas perfectas entre sí — no una "curva". */
      // cuadrar la huella contra las familias SIN romper el circuito:
      // paredes desde la huella del piso (ver polysComplete arriba)
      /* AUDITORÍA 08/28 — AQUÍ HABÍA CÓDIGO MUERTO Y PELIGROSO.
         Un bloque de 60 líneas reconstruía las paredes desde la HUELLA DEL
         PISO (no desde los muros escaneados) y las cuadraba contra "familias
         de dirección". Estaba desactivado porque su bandera `fd.polyWalls`
         NO SE ASIGNABA EN NINGÚN SITIO — nunca corrió. Se borra: si se
         hubiera despertado, habría reemplazado el escaneo fiel de Edgar por
         una versión "arreglada" del contorno, que es justo lo que él pidió
         que no se hiciera. Con él se van dirClusters/clusterDelta/
         squarePoly/snapWallDir, que solo vivían ahí. */
      if (!fd.walls.length) return;
      // los puntos de los polígonos de cuarto (y la huella exterior)
      // giran junto con las paredes
      var polyPts = [];
      (fd.polys || []).forEach(function (rp) { polyPts = polyPts.concat(rp.pts); });
      (fd.outer || []).forEach(function (op) { polyPts = polyPts.concat(op); });
      var rot = redrawScan(fd.walls, fd.drs.concat(fd.wins, fd.labels, fd.furn, polyPts), fd.faithful);
      if (fd.faithful) {
        // MODO FIEL (pedido de Edgar, y tiene razon): las paredes se
        // dibujan EXACTAS como las entrega el escaneo — lo MISMO que se
        // ve en el 3D del iPhone. Solo rotacion global para ver la casa
        // derecha y soldar pelos de esquina de <7". Cada paso de
        // "arreglar" (enderezar/fusionar/cuadrar) era donde se perdia
        // la informacion.
        weldCorners(fd.walls, 7);
      } else {
        mergeParallelWalls(fd.walls);
        bridgeCollinear(fd.walls);
        snapTJunctions(fd.walls);
        closeLCorners(fd.walls);
        weldCorners(fd.walls);
        snapFreeEnds(fd.walls);
      }
      var minx = Infinity, miny = Infinity;
      fd.walls.forEach(function (w) { minx = Math.min(minx, w.x1, w.x2); miny = Math.min(miny, w.y1, w.y2); });
      // si la hoja YA tiene un escaneo, el nuevo se monta AL LADO (no
      // encima): dos zonas escaneadas por separado quedan una junto a la
      // otra — ambas enderezadas a los mismos ejes, solo falta arrastrar
      // CUADRÍCULA: con 13 piezas (casa completa) una fila sola queda
      // kilométrica; las nuevas se acomodan en filas que se envuelven al
      // pasar de ~110 ft de ancho — cómodo de armar en el iPad
      var baseX = 24, baseY = 24, ANCHO_MAX = 110 * 12, SEP = 72;
      if (!state.walls.length) { gridX = 24; gridY = 24; gridRowH = 0; }
      var pieMaxX = -Infinity, pieMaxY = -Infinity;
      fd.walls.forEach(function (w) {
        pieMaxX = Math.max(pieMaxX, w.x1, w.x2);
        pieMaxY = Math.max(pieMaxY, w.y1, w.y2);
      });
      var anchoPieza = pieMaxX - minx, altoPieza = pieMaxY - miny;
      if (state.walls.length && gridX + anchoPieza > ANCHO_MAX) {
        gridX = 24;                          // se acabó la fila: baja una
        gridY = gridY + gridRowH + SEP;
        gridRowH = 0;
      }
      baseX = gridX; baseY = gridY;
      gridX += anchoPieza + SEP;
      gridRowH = Math.max(gridRowH, altoPieza);
      var ox = baseX - minx, oy = baseY - miny;
      var byRid = {};
      var newWalls = fd.walls.map(function (w) {
        var nw = { id: uid(), x1: Math.round(w.x1 + ox), y1: Math.round(w.y1 + oy), x2: Math.round(w.x2 + ox), y2: Math.round(w.y2 + oy), type: 'drywall', t: w.t || 4.5 };
        (w.rids || (w.rid ? [w.rid] : [])).forEach(function (rid) { byRid[rid] = nw; });
        return nw;
      });
      state.walls = state.walls.concat(newWalls);
      function attach(list, isWin) {
        list.forEach(function (d) {
          var px = d.cx + ox, py = d.cy + oy;
          var wall = d.pid && byRid[d.pid];
          if (!wall) {
            var best = null;
            newWalls.forEach(function (w) {
              var r = distToSeg(px, py, w.x1, w.y1, w.x2, w.y2);
              if (!best || r.d < best.r.d) best = { w: w, r: r };
            });
            if (!best || best.r.d > 18) return;
            wall = best.w;
          }
          scanPlaceOpening(wall, px, py, d.w, d.type, totals, isWin, newWalls);
        });
      }
      attach(fd.drs, false); attach(fd.wins, true);
      // habitaciones: nombre + sq ft en el centro, y tipo de pared (exterior=block)
      if (fd.polys && fd.polys.length) {
        totals.names = totals.names.concat(scanRoomsFromPolys(newWalls, fd.polys, ox, oy, fd.outer, fd.noType));
      } else {
        totals.names = totals.names.concat(scanRoomsPost(newWalls, fd.labels, ox, oy));
      }
      if (opts.furniture) {
        fd.furn.forEach(function (fo) {
          var ang = fo.ang + rot;
          var cx2 = fo.cx + ox, cy2 = fo.cy + oy;
          var symKey = furnSymbol(fo.cat, Math.max(fo.w, fo.d));
          var def = symKey && SYMBOLS[symKey];
          if (def) {
            // símbolo real de la paleta, escalado y orientado al mueble detectado
            var degs = Math.round((ang * 180 / Math.PI) / 15) * 15;
            if ((fo.w >= fo.d) !== (def.w >= def.h)) degs += 90;
            var sMaj = Math.max(fo.w, fo.d) / Math.max(def.w, def.h);
            var sMin = Math.min(fo.w, fo.d) / Math.min(def.w, def.h);
            var sc = Math.max(0.5, Math.min(1.8, (sMaj + sMin) / 2));
            state.symbols.push({ id: uid(), key: symKey, x: Math.round(cx2), y: Math.round(cy2), rot: ((degs % 360) + 360) % 360, scale: Math.round(sc * 100) / 100 });
          } else {
            // sin símbolo (fireplace, stairs…): rectángulo de referencia con nombre
            var ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
            var hw = fo.w / 2, hd = fo.d / 2;
            state.areas.push({
              id: uid(), pattern: 'none', rot: 0, color: '#9aa4ad', lw: 0.8,
              pts: [
                [Math.round(cx2 - ux * hw - vx * hd), Math.round(cy2 - uy * hw - vy * hd)],
                [Math.round(cx2 + ux * hw - vx * hd), Math.round(cy2 + uy * hw - vy * hd)],
                [Math.round(cx2 + ux * hw + vx * hd), Math.round(cy2 + uy * hw + vy * hd)],
                [Math.round(cx2 - ux * hw + vx * hd), Math.round(cy2 - uy * hw + vy * hd)]
              ]
            });
            state.texts.push({ id: uid(), x: Math.round(cx2 - fo.label.length * 1.5), y: Math.round(cy2), text: fo.label, size: 5 });
          }
          totals.furn++;
        });
      }
      scanAutoDims(newWalls);
      totals.walls += newWalls.length;
    }

    if (o.app === 'mxp-scan' && o.walls && o.walls[0] && o.walls[0].x1 != null) {
      // formato simple de nuestra app nativa (pulgadas o metros)
      var k = o.units === 'm' ? M2IN : 1;
      var fd0 = { walls: [], drs: [], wins: [], labels: [], furn: [] };
      o.walls.forEach(function (w) { fd0.walls.push({ x1: w.x1 * k, y1: w.y1 * k, x2: w.x2 * k, y2: w.y2 * k, t: w.t || 4.5 }); });
      (o.doors || []).forEach(function (d) { fd0.drs.push({ cx: d.x * k, cy: d.y * k, w: (d.w || 36 / k) * k, type: 'opening' }); });
      (o.windows || []).forEach(function (d) { fd0.wins.push({ cx: d.x * k, cy: d.y * k, w: (d.w || 36 / k) * k, type: 'window' }); });
      buildFloor(fd0);
      totals.floors = 1;
      refresh(); zoomFit();
      return totals;
    }

    // JSON nativo de Apple RoomPlan — agrupado por piso (story; sin story = 0)
    var floors = {};
    function fl(s) {
      var st = typeof s.story === 'number' ? s.story : 0;
      return floors[st] = floors[st] || { walls: [], drs: [], wins: [], labels: [], furn: [] };
    }
    (o.walls || []).forEach(function (s) {
      var g = seg(s);
      if (g.w > 6) fl(s).walls.push({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, t: 4.5, rid: s.identifier });
    });
    var APPLE_DOOR = { door: 'door', doubleDoor: 'double', french: 'double', slidingDoor: 'slider', foldingDoor: 'bifold', garage: 'garage', opening: 'opening' };
    (o.doors || []).forEach(function (s) {
      var g = seg(s);
      // pedido de Edgar: el escaneo pone SOLO la abertura (el hueco en la
      // pared, sin hoja ni arco de abatir) — las puertas con su hoja las
      // pone el en 2 minutos con el editor, como a el le gusta
      fl(s).drs.push({ cx: g.cx, cy: g.cy, w: g.w, type: 'opening', pid: s.parentIdentifier });
    });
    (o.openings || []).forEach(function (s) { var g = seg(s); fl(s).drs.push({ cx: g.cx, cy: g.cy, w: g.w, type: 'opening', pid: s.parentIdentifier }); });
    (o.windows || []).forEach(function (s) { var g = seg(s); fl(s).wins.push({ cx: g.cx, cy: g.cy, w: g.w, type: 'window', pid: s.parentIdentifier }); });
    // polígonos de piso REALES por cuarto (rooms[].floors[].polygonCorners):
    // la fuente más fiel de área, centro y nombre — cuando existen, mandan
    var polyCount = 0, allPolys = [];
    srcRooms.forEach(function (rm, ri) {
      var fsur = rm && rm.floors && rm.floors[0];
      if (!fsur || !Array.isArray(fsur.polygonCorners) || fsur.polygonCorners.length < 3 || !fsur.transform) return;
      var f = flat(fsur.transform);
      var pts = fsur.polygonCorners.map(function (c) {
        var wx = f[0] * c[0] + f[4] * c[1] + f[8] * c[2] + f[12];
        var wz = f[2] * c[0] + f[6] * c[1] + f[10] * c[2] + f[14];
        return { cx: wx * M2IN, cy: wz * M2IN };
      });
      var st = typeof fsur.story === 'number' ? fsur.story : 0;
      var g = floors[st] = floors[st] || { walls: [], drs: [], wins: [], labels: [], furn: [] };
      // huella digital del cuarto para casar el nombre: el área NO cambia
      // cuando StructureBuilder recoloca los cuartos (los centros SÍ — se
      // probó y quedan a 600" — jamás casar por posición ni por ICP)
      var rectSq = Math.round(rm.floors.reduce(function (s, ff) {
        return s + (ff.dimensions && ff.dimensions[0] * ff.dimensions[1] || 0);
      }, 0) * 10.7639);
      var shoe = 0;
      for (var qi = 0; qi < pts.length; qi++) {
        var qa = pts[qi], qb = pts[(qi + 1) % pts.length];
        shoe += qa.cx * qb.cy - qb.cx * qa.cy;
      }
      var polySq = Math.round(Math.abs(shoe / 2) / 144);
      var rp2 = { name: null, pts: pts, _sqR: rectSq, _sqP: polySq };
      (g.polys = g.polys || []).push(rp2);
      allPolys.push(rp2);
      polyCount++;
    });
    // nombre → cuarto por huella de área (el sqft del meta se calculó con
    // el mismo piso: Swift viejo = rectángulo, nuevo = polígono; se prueba
    // contra ambos y gana la diferencia menor). En empate (dos BEDROOM
    // iguales) el orden de captura desempata solo.
    if (polyCount && metaAll.length) {
      var pairs = [];
      allPolys.forEach(function (rp, pi) {
        metaAll.forEach(function (mr, mi) {
          if (!mr || !mr.name || mr.sqft == null) return;
          var d = Math.min(Math.abs(rp._sqR - mr.sqft), Math.abs(rp._sqP - mr.sqft));
          if (d <= Math.max(25, mr.sqft * 0.25)) pairs.push([d, pi, mi]);
        });
      });
      pairs.sort(function (a, b) { return a[0] - b[0]; });
      var usedP = {}, usedM = {};
      pairs.forEach(function (p) {
        if (usedP[p[1]] || usedM[p[2]]) return;
        usedP[p[1]] = 1; usedM[p[2]] = 1;
        allPolys[p[1]].name = String(metaAll[p[2]].name).toUpperCase();
      });
    }
    // cuarto ESCANEADO DOS VECES: dos huellas solapadas >55% son el mismo
    // espacio (re-escanear sin borrar el anterior) — las copias encimadas
    // y un pelín giradas eran el "reguero" de paredes cruzadas; se queda
    // la huella mayor y hereda el nombre si le faltaba
    Object.keys(floors).forEach(function (stk) {
      var g = floors[stk];
      if (!g.polys || g.polys.length < 2) return;
      function areaOf(pts) {
        var s = 0;
        for (var i = 0; i < pts.length; i++) {
          var b = pts[(i + 1) % pts.length];
          s += pts[i].cx * b.cy - b.cx * pts[i].cy;
        }
        return Math.abs(s / 2);
      }
      function frac(small, big) {
        var x1 = 1e18, y1 = 1e18, x2 = -1e18, y2 = -1e18;
        small.pts.forEach(function (p) { x1 = Math.min(x1, p.cx); y1 = Math.min(y1, p.cy); x2 = Math.max(x2, p.cx); y2 = Math.max(y2, p.cy); });
        var bigP = big.pts.map(function (p) { return [p.cx, p.cy]; });
        var smallP = small.pts.map(function (p) { return [p.cx, p.cy]; });
        var inside = 0, total = 0;
        for (var i = 0; i < 15; i++) for (var j = 0; j < 15; j++) {
          var px = x1 + (x2 - x1) * (i + 0.5) / 15, py = y1 + (y2 - y1) * (j + 0.5) / 15;
          if (!ptInPoly(px, py, smallP)) continue;
          total++;
          if (ptInPoly(px, py, bigP)) inside++;
        }
        return total ? inside / total : 0;
      }
      for (var a2 = 0; a2 < g.polys.length; a2++) for (var b3 = a2 + 1; b3 < g.polys.length; b3++) {
        var A = g.polys[a2], B = g.polys[b3];
        if (!A || !B || A._dup || B._dup) continue;
        var big = areaOf(A.pts) >= areaOf(B.pts) ? A : B;
        var small = big === A ? B : A;
        if (frac(small, big) > 0.55) {
          small._dup = true;
          if (!big.name) big.name = small.name;
        }
      }
      g.polys = g.polys.filter(function (p) { return !p._dup; });
    });
    // huella EXTERIOR global (o.floors de la estructura): el contorno de
    // TODO lo escaneado — con ella el tipo de pared es fiable: block solo
    // lo que da a la calle, no un clóset sin huella propia
    (o.floors || []).forEach(function (fsur) {
      if (!fsur || !Array.isArray(fsur.polygonCorners) || fsur.polygonCorners.length < 3 || !fsur.transform) return;
      var f2 = flat(fsur.transform);
      var pts2 = fsur.polygonCorners.map(function (c) {
        var wx = f2[0] * c[0] + f2[4] * c[1] + f2[8] * c[2] + f2[12];
        var wz = f2[2] * c[0] + f2[6] * c[1] + f2[10] * c[2] + f2[14];
        return { cx: wx * M2IN, cy: wz * M2IN };
      });
      var st2 = typeof fsur.story === 'number' ? fsur.story : 0;
      var g2 = floors[st2] = floors[st2] || { walls: [], drs: [], wins: [], labels: [], furn: [] };
      (g2.outer = g2.outer || []).push(pts2);
    });
    // si TODOS los cuartos traen su huella de piso, las PAREDES se dibujan
    // desde la huella (no desde los muros escaneados): los muros llegan
    // cortados por gabinetes, sofitos y dobles alturas — la huella del piso
    // siempre cierra el cuarto completo (lo que se ve en el 3D del iPhone)
    var polysComplete = polyCount > 0 && polyCount === srcRooms.length;
    // los nombres que Edgar puso en el teléfono MANDAN sobre las
    // adivinanzas de Apple (sections): si vienen, las sections se ignoran;
    // y si hay polígonos de cuarto, los nombres ya viajan con ellos
    if (polyCount) { /* nombres y áreas salen de los polígonos */ }
    else if (metaRooms.length) {
      metaRooms.forEach(function (r) {
        fl(r).labels.push({ cx: (r.cx || 0) * M2IN, cy: (r.cz || 0) * M2IN, text: String(r.name).toUpperCase() });
      });
    } else (o.sections || []).forEach(function (s) {
      var name = s.displayName || SECTION_NAMES[s.label];
      if (name === undefined) name = String(s.label || '').toUpperCase();
      if (!name) return;
      fl(s).labels.push({ cx: (s.center && s.center[0] || 0) * M2IN, cy: (s.center && s.center[2] || 0) * M2IN, text: name });
    });
    (o.objects || []).forEach(function (s) {
      var label = FURN_NAMES[catKey(s.category)];
      if (!label || !s.transform || !s.dimensions) return;
      var f = flat(s.transform);
      fl(s).furn.push({
        cx: f[12] * M2IN, cy: f[14] * M2IN,
        w: (s.dimensions[0] || 0.5) * M2IN, d: (s.dimensions[2] || 0.5) * M2IN,
        ang: Math.atan2(f[2], f[0]), label: label, cat: catKey(s.category)
      });
    });
    var keys = Object.keys(floors).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return totals;
    var idsPrevios = {};
    state.walls.forEach(function (w) { idsPrevios[w.id] = 1; });
    keys.forEach(function (st, i) {
      if (i > 0) addSheet('PISO-' + (i + 1));
      floors[st].faithful = polysComplete;
      floors[st].noType = !!o._noType;
      buildFloor(floors[st]);
    });
    // 🧹 limpieza silenciosa de lo recién importado (con su candado)
    if (keys.length === 1) {
      var nv = {};
      state.walls.forEach(function (w) { if (!idsPrevios[w.id]) nv[w.id] = 1; });
      var lp2 = limpiaPiezaImportada(nv);
      if (lp2) totals.limpio = {
        enderezadas: lp2.enderezadas, cabitos: lp2.cabitos, puntas: lp2.puntas,
        mejoradas: lp2.revertido ? 0 : (lp2.ruido0 - lp2.ruido1 > 0.3 ? 1 : 0),
        revertidas: lp2.revertido ? 1 : 0
      };
    }
    totals.floors = keys.length;
    reciboLimpio = totals.limpio || reciboLimpio;
    if (keys.length > 1) activateSheet(state.curSheet);
    refresh(); zoomFit();
    return totals;
  }

  // proyecto del editor OpenPlan3D: floors[].walls con start/end en cm.
  // Cada piso del proyecto cae en su propia hoja de MXP Planos.
  function importOP3D(o) {
    var floors = (o.floors || []).filter(function (f) { return f && f.walls && f.walls.length; });
    var totals = { walls: 0, doors: 0, windows: 0, names: [] };
    floors.forEach(function (fl, fi) {
      if (fi > 0) addSheet('PISO-' + (fi + 1));
      var byId = {};
      var raw = fl.walls.map(function (w) {
        return { x1: w.start.x * CM2IN, y1: w.start.y * CM2IN, x2: w.end.x * CM2IN, y2: w.end.y * CM2IN, t: Math.max(2.5, Math.min(12, (w.thickness || 12) * CM2IN)), id0: w.id };
      });
      var minx = Infinity, miny = Infinity;
      raw.forEach(function (w) { minx = Math.min(minx, w.x1, w.x2); miny = Math.min(miny, w.y1, w.y2); });
      var ox = 24 - minx, oy = 24 - miny;
      var newWalls = raw.map(function (w) {
        var nw = { id: uid(), x1: Math.round(w.x1 + ox), y1: Math.round(w.y1 + oy), x2: Math.round(w.x2 + ox), y2: Math.round(w.y2 + oy), type: 'drywall', t: w.t };
        byId[w.id0] = nw;
        return nw;
      });
      state.walls = state.walls.concat(newWalls);
      function place(list, isWin) {
        (list || []).forEach(function (d) {
          var wall = byId[d.wallId];
          if (!wall) return;
          var len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
          var fr = Math.max(0, Math.min(1, d.position == null ? 0.5 : d.position));
          var px = wall.x1 + (wall.x2 - wall.x1) * fr, py = wall.y1 + (wall.y2 - wall.y1) * fr;
          scanPlaceOpening(wall, px, py, (d.width || 91) * CM2IN, isWin ? 'window' : (OP3D_DOOR[d.type] || 'door'), totals, isWin, newWalls);
        });
      }
      place(fl.doors, false); place(fl.windows, true);
      // nombres de cuartos como anclas → sq ft + tipo de pared, igual que un escaneo
      var labels = [];
      (fl.rooms || []).forEach(function (rm) {
        if (!rm.name || !rm.walls || !rm.walls.length) return;
        var xs = [], ys = [];
        rm.walls.forEach(function (wid) {
          var w = byId[wid];
          if (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
        });
        if (!xs.length) return;
        function avg(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
        labels.push({ cx: avg(xs), cy: avg(ys), text: String(rm.name).toUpperCase() });
      });
      totals.names = (totals.names || []).concat(scanRoomsPost(newWalls, labels, 0, 0));
      scanAutoDims(newWalls);
      totals.walls += newWalls.length;
    });
    if (floors.length > 1) activateSheet(state.curSheet);
    refresh(); zoomFit();
    return totals;
  }

  function restoreProject(o) {
    Object.assign(state, o.state);
    state.areas = o.state.areas || [];
    state.wires = o.state.wires || [];
    state.leaders = o.state.leaders || [];
    state.panels = o.state.panels || [];
    state.guia = o.state.guia || [];
    state.huecos = o.state.huecos || [];
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
    var f = this.files[0]; this.value = '';
    if (!f) return;
    // "Abrir" acepta todo: si es un PDF o una foto, se importa como plano de fondo
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '') || /^image\//.test(f.type || '')) {
      handleBgFile(f);
      return;
    }
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(rd.result);
        if (o.app === 'mxp-planos') {
          pushUndo();
          restoreProject(o);
          setHint('Proyecto abierto: ' + (state.project.name || f.name));
          return;
        }
        // escaneo de casa: formato MXP Scan o el JSON nativo de Apple RoomPlan
        if (looksLikeRoomScan(o)) {
          var nObj = scanFurnCount(o);
          var doImport = function (withFurn) {
            pushUndo();
            reciboDib = []; reciboNota = ''; reciboLimpio = null;
            var wAntes = state.walls.length;
            var n = importRoomScan(o, { furniture: withFurn, fileName: f.name });
            var rec = reciboImport(o, {
              walls: state.walls.slice(wAntes),
              doors: n.doors, windows: n.windows
            });
            ultimoRecibo = rec.txt;
            setHint('🏠 Escaneo importado: ' + n.walls + ' paredes, ' + n.doors + ' aberturas, ' +
              n.windows + ' ventanas' + (n.floors > 1 ? ' en ' + n.floors + ' pisos' : '') +
              (withFurn && n.furn ? ' + ' + n.furn + ' muebles de referencia' : ' — plano limpio, sin muebles') +
              (rec.fallas ? ' · ⚠️ el RECIBO marca ' + rec.fallas + ' diferencia(s) — botón 📋 Recibo en Capas'
                          : ' · 📋 recibo: todo llegó completo') +
              ' · a escala real, en drywall (el block lo pone 🧲 Soldar)');
            // si algo se perdió, se enseña en la cara: es el punto débil
            if (rec.fallas) uiAlert(rec.txt);
            scanNecTips(n.names);
          };
          if (nObj > 0) {
            uiConfirm('El escaneo detectó ' + nObj + ' muebles/equipos (cama, sofá, nevera…).\n\n' +
              'OK = incluirlos como referencia gris claro (se pueden borrar uno a uno)\n' +
              'Cancelar = PLANO LIMPIO, solo paredes, puertas y ventanas', doImport);
          } else doImport(false);
          return;
        }
        throw new Error('formato');
      } catch (e) {
        uiAlert('Ese archivo no es un proyecto de MXP Planos (.mxp.json) ni un escaneo de casa (RoomPlan/MXP Scan).\n\nSi es un PLANO (PDF o foto), vuelve a elegirlo aquí mismo, que también entran por Abrir.');
      }
    };
    rd.readAsText(f);
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
    // 'gGuia' entra aquí desde la auditoría del 08/29: la guía del survey se
    // estaba IMPRIMIENDO en el PNG y el PDF, con su rótulo en español encima.
    // Es una referencia de trabajo, no parte del plano que ve el inspector.
    ['gGridBase', 'gSel', 'gPreview', 'gMeasure', 'gGuia'].forEach(function (id) {
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
  // tocar el fondo oscuro también cierra (clave en iPad, sin tecla Escape)
  $$('.modal').forEach(function (m) {
    if (m.id === 'askModal') return;
    m.addEventListener('click', function (ev) { if (ev.target === m) m.hidden = true; });
  });
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
    // escribiendo en el chat, Ctrl+Z deshace LO ESCRITO, no el plano
    if (inField && document.activeElement.id === 'chatTxt') return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (inField) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') { copySel(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'v' && clipboard) { ev.preventDefault(); pasteClip(lastMouseWorld); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); copySel(); pasteClip(null, 24); return; }
    switch (ev.key) {
      case 'Escape':
        // primero cierra cualquier modal abierto (Panel Schedule, Lot…)
        var openMod = $$('.modal').find(function (m) { return !m.hidden && m.id !== 'askModal'; });
        if (openMod) { openMod.hidden = true; break; }
        // pedido de Edgar: Escape SIEMPRE cancela lo que este a medias y
        // devuelve a Select — como en un CAD de verdad
        if (drawing) {
          // una cadena de paredes se cierra por su puerta (finishWallChain), no
          // a lo bruto: ahí es donde el forro del bloque se orienta al interior
          if (drawing.mode === 'wallchain') finishWallChain();
          else { drawing = null; G.prev.innerHTML = ''; }
          measure = null; renderAnnot();
          setTool('select');
        } else if (tool !== 'select') {
          measure = null; renderAnnot();
          setTool('select');
        } else { sel = null; selGroup = null; measure = null; renderSel(); renderAnnot(); showProps(); }
        break;
      case 'Delete': case 'Backspace':
        if (selGroup) { ev.preventDefault(); deleteGroup(); }
        else if (sel) { ev.preventDefault(); deleteSelected(); }
        else if (tool !== 'select' && tool !== 'pan') {
          // recien dibujaste una pared/medida/etc y sigues en la
          // herramienta: Delete la quita al instante (deshace lo ultimo)
          ev.preventDefault();
          if (drawing) { drawing = null; G.prev.innerHTML = ''; }
          undo();
          setHint('🗑 Último elemento eliminado (deshacer) — sigue dibujando o Esc para Select');
        }
        break;
      case 'r': case 'R':
        if (tool === 'place') { placingRot = (placingRot + 45) % 360; }
        else if (sel && sel.kind === 'symbol') { var e = findSel(); pushUndo(); e.rot = ((e.rot || 0) + 45) % 360; refresh(); }
        else if (sel) { pushUndo(); rotateRefs([sel], 45); refresh(); renderSel(); }
        else if (selGroup) { rotateGroup(90); }
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
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        // empujoncito exacto: 1" · Shift = 1 pie · Alt = 1/4"
        var nstep = ev.shiftKey ? 12 : (ev.altKey ? 0.25 : 1);
        var ndx = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0;
        var ndy = ev.key === 'ArrowUp' ? -1 : ev.key === 'ArrowDown' ? 1 : 0;
        if (nudgeSel(ndx, ndy, nstep)) ev.preventDefault();
        break;
      case 'F8': ev.preventDefault(); setOrtho(!orthoOn); break;
    }
  });

  $$('#toolButtons .tool').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      // Calibrate al estilo Bluebeam: al tocarlo salen las dos vías
      // (medir una distancia conocida, o aplicar la escala escrita en el plano)
      if (b.dataset.tool === 'calibrate' && state.bg) {
        setTool('calibrate');
        showToolMenu('calibrate', b);
        return;
      }
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
    if (wt.screen) {
      return '<svg width="36" height="20"><line x1="2" y1="10" x2="34" y2="10" stroke="#14161a" stroke-width="1.6"/>' +
        '<line x1="9" y1="6" x2="9" y2="14" stroke="#14161a" stroke-width="0.9"/>' +
        '<line x1="18" y1="6" x2="18" y2="14" stroke="#14161a" stroke-width="0.9"/>' +
        '<line x1="27" y1="6" x2="27" y2="14" stroke="#14161a" stroke-width="0.9"/></svg>';
    }
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
      html += '<div class="tmHead">Puerta sencilla (swing)</div>';
      [[18, "1'6\" pantry"], [24, "2'0\""], [28, "2'4\""], [30, "2'6\""], [32, "2'8\""], [36, "3'0\""]].forEach(function (t2) {
        var sel2 = curDoorType === 'door' && curDoorW === t2[0];
        html += '<div class="tmItem' + (sel2 ? ' cur' : '') + '" data-k="door" data-w="' + t2[0] + '"><span>Door ' + t2[1] + ' (' + t2[0] + '\")</span></div>';
      });
      html += '<div class="tmHead">Closet / Pantry (bifold, acordeon)</div>';
      [[24, "2'0\" pantry"], [30, "2'6\" pantry"], [36, "3'0\" pantry"],
       [48, "4'0\" closet"], [60, "5'0\" closet"], [72, "6'0\" closet"]].forEach(function (t4) {
        var sel4 = curDoorType === 'bifold' && curDoorW === t4[0];
        html += '<div class="tmItem' + (sel4 ? ' cur' : '') + '" data-k="bifold" data-w="' + t4[0] + '"><span>Bifold ' + t4[1] + '</span></div>';
      });
      html += '<div class="tmHead">Otras puertas</div>';
      ['double', 'pocket', 'slider', 'bypass', 'opening'].forEach(function (k) {
        html += '<div class="tmItem' + (k === curDoorType ? ' cur' : '') + '" data-k="' + k + '"><span>' + esc(OPEN_NAMES[k]) + ' (' + fmtFtIn(OPEN_DEFAULT[k]) + ')</span></div>';
      });
      html += '<div class="tmHead">Garage / Overhead</div>';
      [[192, "16'0\" doble"], [108, "9'0\" sencillo"], [72, "6'0\" golf cart"]].forEach(function (t3) {
        var sel3 = curDoorType === 'garage' && curDoorW === t3[0];
        html += '<div class="tmItem' + (sel3 ? ' cur' : '') + '" data-k="garage" data-w="' + t3[0] + '"><span>Garage ' + t3[1] + '</span></div>';
      });
    } else if (kind === 'rect') {
      html += '<div class="tmHead">Forma</div>';
      [['rect', '▭ Rectángulo / cuadrado'], ['poly3', '△ Triángulo'], ['poly5', '⬠ Pentágono'], ['poly6', '⬡ Hexágono'], ['poly8', '⯃ Octágono'], ['poly12', '◯ Dodecágono']].forEach(function (fk) {
        html += '<div class="tmItem' + (fk[0] === curShapeKind ? ' cur' : '') + '" data-k="' + fk[0] + '"><span>' + esc(fk[1]) + '</span></div>';
      });
      html += '<div class="tmHead">Dibujo libre</div>';
      html += '<div class="tmItem" data-k="__pline"><span>⌐ Polígono a mano — clic en cada esquina y cierra en el 1er punto</span></div>';
    } else if (kind === 'window') {
      html += '<div class="tmHead">Tipo de ventana</div>';
      ['window', 'slider'].forEach(function (k) {
        html += '<div class="tmItem' + (k === curWinType ? ' cur' : '') + '" data-k="' + k + '"><span>' + esc(OPEN_NAMES[k]) + ' (' + fmtFtIn(OPEN_DEFAULT[k]) + ')</span></div>';
      });
    } else if (kind === 'pline') {
      html += '<div class="tmHead">Tipo de línea</div>';
      Object.keys(LINE_STYLES).forEach(function (k6) {
        if (k6 === 'cloud') return;   // la nube tiene su propia herramienta
        html += '<div class="tmItem' + (k6 === curLineStyle ? ' cur' : '') + '" data-k="' + k6 + '"><span>' +
          esc(LINE_STYLES[k6].name) + '</span></div>';
      });
    } else if (kind === 'measure') {
      html += '<div class="tmHead">Tipo de medición</div>';
      html += '<div class="tmItem" data-k="length"><span>📏 Length — distancia entre 2 puntos</span></div>';
      html += '<div class="tmItem" data-k="marea"><span>▦ Area — polígono con sq ft en el plano</span></div>';
      html += '<div class="tmItem" data-k="mperim"><span>⌐ Perimeter — longitud total de una línea</span></div>';
    } else if (kind === 'bgscale' || kind === 'calibrate') {
      if (kind === 'calibrate') {
        html += '<div class="tmHead">Poner el plano a escala</div>';
        html += '<div class="tmItem" data-k="__measure"><span>📏 Calibrar midiendo — 2 clics en una distancia conocida</span></div>';
      }
      html += '<div class="tmHead">📐 Escala escrita en el plano</div>';
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
          curDoorW = parseInt(it.dataset.w, 10) || 0;
          var ds = $('#doorSize');
          if (ds) {
            // el menú y el selector visible son lo MISMO: lo que elijas aquí
            // se ve arriba, y lo que dice arriba es lo que se coloca
            // nunca se deshabilita: si quedaba bloqueado tras elegir un garage,
            // no habia forma de volver a la puerta sencilla desde la barra
            ds.value = (k === 'door') ? String(curDoorW || 0) : '0';
          }
          setTool('door');
          setHint(OPEN_NAMES[k] + (curDoorW ? ' de ' + fmtFtIn(curDoorW) : '') + ' — haz clic sobre una pared para colocarla');
        } else if (kind === 'rect') {
          if (k === '__pline') {
            setTool('pline');
            setHint('Polígono a mano: clic en cada esquina y CIERRA haciendo clic en el primer punto (el círculo verde) — o Enter/doble clic para dejarlo abierto');
          } else {
            curShapeKind = k;
            setTool('rect');
            setHint(k === 'rect'
              ? 'Rectángulo: 2 clics (SHIFT = cuadrado)'
              : 'Polígono de ' + k.slice(4) + ' lados: 2 clics para la caja (SHIFT = regular exacto)');
          }
        } else if (kind === 'window') {
          curWinType = k;
          setTool('window');
          setHint(OPEN_NAMES[k] + ' — haz clic sobre una pared para colocarla');
        } else if (kind === 'pline') {
          curLineStyle = k;
          setTool('pline');
          setHint('Línea: ' + LINE_STYLES[k].name + ' — marca los puntos (doble clic o Enter termina)');
        } else if (kind === 'measure') {
          if (k === 'length') { setTool('measure'); }
          else if (k === 'marea') {
            setTool('area'); curAreaPattern = 'none'; pendingAreaLabel = true;
            setHint('MEDIR ÁREA: marca las esquinas del espacio (doble clic o Enter termina) — el sq ft queda escrito en el plano');
          } else {
            setTool('pline'); pendingAreaLabel = true;
            setHint('MEDIR PERÍMETRO: marca los puntos de la línea (doble clic o Enter termina) — la longitud total queda escrita en el plano');
          }
        } else if (kind === 'bgscale' || kind === 'calibrate') {
          if (k === '__measure') {
            setTool('calibrate');
            tm.hidden = true;
            return;
          }
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
    if (!tm.hidden && !tm.contains(ev.target) && !(ev.target.closest && ev.target.closest('.dd'))
      && !(ev.target.closest && ev.target.closest('[data-tool="calibrate"]'))) tm.hidden = true;
  });

  /* ---------------- modo iPad / táctil (estilo Bluebeam Revu iPad) ---------------- */
  var isTouch = false;
  try { isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
  if (isTouch) {
    document.body.classList.add('touch');
    // salvavidas: en iPad no hay tecla Escape — si hay un trazo a medias
    // (línea pegada al dedo), aparece este botón para cancelarlo
    var cbtn = document.createElement('button');
    cbtn.id = 'cancelDraw';
    cbtn.textContent = '✕ Cancelar trazo';
    cbtn.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);z-index:60;' +
      'padding:12px 22px;border-radius:24px;border:0;background:#c62828;color:#fff;' +
      'font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.35);display:none';
    document.body.appendChild(cbtn);
    cbtn.addEventListener('click', function () {
      drawing = null; G.prev.innerHTML = '';
      drag = null; pinch = null; ptrs.clear();
      setHint('Trazo cancelado');
    });
    // 🗑 flotante: en iPad no hay tecla Delete — aparece al seleccionar algo
    var dbtn = document.createElement('button');
    dbtn.id = 'touchDel';
    dbtn.textContent = '🗑 Borrar';
    dbtn.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);z-index:60;' +
      'padding:12px 22px;border-radius:24px;border:0;background:#14161a;color:#fff;' +
      'font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.35);display:none';
    document.body.appendChild(dbtn);
    dbtn.addEventListener('click', function () {
      if (selGroup) deleteGroup();
      else if (sel) deleteSelected();
    });
    setInterval(function () {
      cbtn.style.display = drawing ? 'block' : 'none';
      dbtn.style.display = !drawing && (sel || selGroup) ? 'block' : 'none';
    }, 400);
    // iOS muestra los PDF "en gris" en la app de Archivos cuando el selector trae
    // filtro de tipos — se lo quitamos y la app valida el archivo por dentro
    ['fileBg', 'fileBg2', 'fileOpen'].forEach(function (id) {
      var f = document.getElementById(id);
      if (f) f.removeAttribute('accept');
    });
    var palOpen = false, propsOpen = false;
    function syncDrawers() {
      $('#palette').classList.toggle('open', palOpen);
      $('#rightPanel').classList.toggle('open', propsOpen);
      var bp = $('#btnPal'), bq = $('#btnProps');
      if (bp) bp.classList.toggle('active', palOpen);
      if (bq) bq.classList.toggle('active', propsOpen);
    }
    if ($('#btnPal')) $('#btnPal').addEventListener('click', function () {
      palOpen = !palOpen; if (palOpen) propsOpen = false; syncDrawers();
    });
    if ($('#btnProps')) $('#btnProps').addEventListener('click', function () {
      propsOpen = !propsOpen; if (propsOpen) palOpen = false; syncDrawers();
    });
    // al elegir un símbolo, la gaveta se cierra sola para dejar el plano completo
    $('#symList').addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.symBtn') && !ev.target.closest('.favstar')) {
        palOpen = false; syncDrawers();
      }
    });
    // tocar el plano cierra las gavetas
    svg.addEventListener('pointerdown', function () {
      if (palOpen || propsOpen) { palOpen = false; propsOpen = false; syncDrawers(); }
    });
    setTimeout(function () {
      setHint('📱 Modo iPad: 🧰 abre los símbolos · ⚙ abre propiedades · pellizca para zoom · un dedo dibuja');
    }, 400);
  }

  /* ---------------- inicio ---------------- */
  window.__mxpRefresh = refresh;
  window.__mxpView = view;      // gancho de pruebas (mundo -> pantalla)
  window.__mxpAngle = refsAngle;
  window.__mxpRect = rectificarYcerrar;   // gancho de pruebas
  window.__guiaDbg = function (p, desde, ev) { var r = guiaAjusta(p, desde, ev || {}); return { p: r, guias: guiasVivas.length }; };
  window.__snapDbg = snapWallPt;
  window.__hitDbg = hitTest;            // gancho de pruebas: que agarra un clic
  window.__gruposDbg = function (W) { try { return gruposDir(W); } catch (e) { return []; } };
  window.__planoJsonDbg = planoDesdeJSON;   // gancho de pruebas del importador IA
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
  // restaurar el trabajo guardado automáticamente: IndexedDB primero (aguanta
  // planos pesados), localStorage como respaldo de versiones viejas
  idbGet('autosave', function (payload) {
    var restored = false;
    try {
      var as = payload || localStorage.getItem('mxp_autosave');
      if (as) {
        var ao = JSON.parse(as);
        if (ao && ao.app === 'mxp-planos' && ao.state) { restoreProject(ao); restored = true; }
      }
    } catch (e) {}
    // precalentar el PDF guardado: el zoom nítido queda listo sin esperar al primer zoom
    try { if (restored && state.bg && state.bg.pdfId) loadPdfLive(state.bg); } catch (e) {}
    renderSheetTabs();
    updateOvUI();
    setHint(restored
      ? '🔄 Tu trabajo se restauró automáticamente — todo se guarda solo mientras dibujas (💾 Guardar para tener el archivo)'
      : 'Bienvenido a MXP Planos — dibuja paredes (W), coloca símbolos desde la paleta, o importa un plano con "Fondo" y calíbralo (K)');
  });
  // app instalable: registra el service worker cuando corre como sitio (GitHub Pages / servidor)
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  } catch (e) {}
})();
