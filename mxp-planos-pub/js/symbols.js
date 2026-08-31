/* =========================================================================
 * MXP Planos — Biblioteca de símbolos
 * Unidades: pulgadas reales. Origen: centro del símbolo.
 * Símbolos eléctricos según convención IEEE 315 / ANSI Y32.9 / láminas NECA.
 * Cada símbolo es un fragmento SVG dibujado con trazos vectoriales.
 * ========================================================================= */
(function () {
  'use strict';

  // texto auxiliar
  function T(x, y, size, txt, opts) {
    opts = opts || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + size +
      '" text-anchor="' + (opts.anchor || 'middle') + '"' +
      (opts.italic ? ' font-style="italic"' : '') +
      (opts.bold ? ' font-weight="bold"' : '') + '>' + txt + '</text>';
  }
  function L(x1, y1, x2, y2, w) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' +
      (w ? ' stroke-width="' + w + '"' : '') + '/>';
  }
  function C(cx, cy, r, extra) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + (extra || '') + '/>';
  }
  function R(x, y, w, h, rx, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' +
      (rx ? ' rx="' + rx + '"' : '') + (extra || '') + '/>';
  }

  // contorno festoneado (copa de árbol / arbusto)
  function scallop(r, n) {
    var pts = [], i, a;
    for (i = 0; i < n; i++) { a = (i / n) * Math.PI * 2; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    var bulge = r * 0.22;
    for (i = 0; i < n; i++) {
      var p2 = pts[(i + 1) % n];
      d += ' A' + bulge.toFixed(1) + ',' + bulge.toFixed(1) + ' 0 0 0 ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return '<path d="' + d + ' Z"/>';
  }

  // tomacorriente dúplex base: círculo con dos líneas paralelas que lo cruzan
  function duplexBase() {
    return C(0, 0, 5.5) + L(-2.4, -9, -2.4, 9) + L(2.4, -9, 2.4, 9);
  }

  var S = {};

  /* ============================= ELÉCTRICO ============================= */

  S.recep_duplex = { name: 'Duplex Receptacle', short: 'Duplex 120V', cat: 'electrical', layer: 'electrical', w: 16, h: 20,
    svg: duplexBase() };

  S.recep_quad = { name: 'Quad Receptacle', short: 'Quad Recept.', cat: 'electrical', layer: 'electrical', w: 22, h: 20,
    svg: duplexBase() + T(9.5, 3, 6, '4', { anchor: 'start', bold: true }) };

  S.recep_gfci = { name: 'GFCI Receptacle', short: 'GFCI', cat: 'electrical', layer: 'electrical', w: 18, h: 26,
    svg: duplexBase() + T(0, 16.5, 5, 'GFCI', { bold: true }) };

  S.recep_wp = { name: 'Weatherproof Receptacle', short: 'WP Recept.', cat: 'electrical', layer: 'electrical', w: 18, h: 26,
    svg: duplexBase() + T(0, 16.5, 5, 'WP', { bold: true }) };

  S.recep_220 = { name: '240V Receptacle', short: '240V Recept.', cat: 'electrical', layer: 'electrical', w: 18, h: 26,
    svg: C(0, 0, 5.5) + L(-3.2, -9, -3.2, 9) + L(0, -9.5, 0, 9.5) + L(3.2, -9, 3.2, 9) + T(0, 16.5, 5, '240V', { bold: true }) };

  S.recep_floor = { name: 'Floor Receptacle', short: 'Floor Recept.', cat: 'electrical', layer: 'electrical', w: 18, h: 18,
    svg: R(-8, -8, 16, 16) + C(0, 0, 5) + L(-2.2, -7.5, -2.2, 7.5) + L(2.2, -7.5, 2.2, 7.5) };

  S.recep_usb = { name: 'USB Receptacle', short: 'USB Recept.', cat: 'electrical', layer: 'electrical', w: 18, h: 26,
    svg: duplexBase() + T(0, 16.5, 5, 'USB', { bold: true }) };

  S.sw_single = { name: 'Single-Pole Switch', short: 'Switch S', cat: 'electrical', layer: 'electrical', w: 12, h: 16,
    svg: T(0, 5, 14, 'S', { italic: true, bold: true }) };

  S.sw_3way = { name: '3-Way Switch', short: 'Switch S3', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: T(-2, 5, 14, 'S', { italic: true, bold: true }) + T(5.5, 8, 7, '3', { anchor: 'start' }) };

  S.sw_4way = { name: '4-Way Switch', short: 'Switch S4', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: T(-2, 5, 14, 'S', { italic: true, bold: true }) + T(5.5, 8, 7, '4', { anchor: 'start' }) };

  S.sw_dimmer = { name: 'Dimmer Switch', short: 'Dimmer', cat: 'electrical', layer: 'electrical', w: 20, h: 16,
    svg: T(-3, 5, 14, 'S', { italic: true, bold: true }) + T(4.5, 8, 6.5, 'DM', { anchor: 'start' }) };

  S.sw_double = { name: 'Double-Pole Switch S2', short: 'Switch S2', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: T(-2, 5, 14, 'S', { italic: true, bold: true }) + T(5.5, 8, 7, '2', { anchor: 'start' }) };

  S.sw_pilot = { name: 'Switch w/ Pilot Light SP', short: 'Switch SP', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: T(-2, 5, 14, 'S', { italic: true, bold: true }) + T(5.5, 8, 7, 'P', { anchor: 'start' }) };

  S.sw_keyed = { name: 'Keyed Switch SK', short: 'Switch SK', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: T(-2, 5, 14, 'S', { italic: true, bold: true }) + T(5.5, 8, 7, 'K', { anchor: 'start' }) };

  S.sw_wp2 = { name: 'Weatherproof Switch SWP', short: 'Switch SWP', cat: 'electrical', layer: 'electrical', w: 20, h: 16,
    svg: T(-3, 5, 14, 'S', { italic: true, bold: true }) + T(4.5, 8, 6.5, 'WP', { anchor: 'start' }) };

  S.sw_motion = { name: 'Motion Sensor Switch SM', short: 'Switch SM', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: T(-2, 5, 14, 'S', { italic: true, bold: true }) + T(5.5, 8, 7, 'M', { anchor: 'start' }) };

  S.chime = { name: 'Chime', short: 'Chime CH', cat: 'electrical', layer: 'electrical', w: 14, h: 14,
    svg: R(-6.5, -6.5, 13, 13) + T(0, 2.4, 5.5, 'CH', { bold: true }) };

  S.motor = { name: 'Motor', short: 'Motor', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: C(0, 0, 7) + T(0, 2.8, 7, 'M', { bold: true }) };

  S.subpanel = { name: 'Subpanel (hatched)', short: 'Subpanel', cat: 'electrical', layer: 'electrical', w: 26, h: 22,
    svg: R(-10, -3.5, 20, 7) + L(-7, 3.5, -3, -3.5, 0.8) + L(-2, 3.5, 2, -3.5, 0.8) + L(3, 3.5, 7, -3.5, 0.8) + T(0, 13.5, 5, 'SUBPANEL', { bold: true }) };

  S.homerun = { name: 'Homerun to Panel', short: 'Homerun', cat: 'electrical', layer: 'electrical', w: 34, h: 24,
    svg: '<path d="M-16,10 Q0,2 14,-8" fill="none"/>' +
      '<polygon points="14,-8 11,-3.6 8.9,-6.6" fill="#14161a" stroke="none"/>' +
      L(-4, 1, -2, 4.5, 0.9) + L(0, -1, 2, 2.5, 0.9) };

  S.light_ceiling = { name: 'Ceiling Light (surface)', short: 'Ceiling Light', cat: 'electrical', layer: 'electrical', w: 24, h: 24,
    svg: C(0, 0, 7.5) + L(7.5, 0, 12, 0) + L(-7.5, 0, -12, 0) + L(0, 7.5, 0, 12) + L(0, -7.5, 0, -12) };

  S.light_recessed = { name: 'Recessed Light', short: 'Recessed', cat: 'electrical', layer: 'electrical', w: 18, h: 18,
    svg: C(0, 0, 7.5) + C(0, 0, 3.8) };

  S.light_pendant = { name: 'Pendant Light', short: 'Pendant', cat: 'electrical', layer: 'electrical', w: 18, h: 18,
    svg: C(0, 0, 7.5) + C(0, 0, 2.2, ' fill="#14161a"') };

  S.light_sconce = { name: 'Wall Sconce', short: 'Sconce', cat: 'electrical', layer: 'electrical', w: 14, h: 20,
    svg: C(0, 2, 5.5) + L(0, -3.5, 0, -10) };

  S.light_strip = { name: '4 ft LED Strip Light', short: 'LED 4 ft', cat: 'electrical', layer: 'electrical', w: 52, h: 14,
    svg: R(-24, -5.5, 48, 11) + L(-24, 0, 24, 0, 0.6) };

  S.fan_ceiling = { name: 'Ceiling Fan', short: 'Fan', cat: 'electrical', layer: 'electrical', w: 42, h: 42,
    svg: C(0, 0, 4.5) +
      '<ellipse cx="12.5" cy="0" rx="8.5" ry="3.4"/>' +
      '<ellipse cx="-12.5" cy="0" rx="8.5" ry="3.4"/>' +
      '<ellipse cx="0" cy="12.5" rx="3.4" ry="8.5"/>' +
      '<ellipse cx="0" cy="-12.5" rx="3.4" ry="8.5"/>' };

  S.fan_exhaust = { name: 'Exhaust Fan', short: 'Exhaust', cat: 'electrical', layer: 'electrical', w: 20, h: 20,
    svg: R(-9, -9, 18, 18) + C(0, 0, 6.5) + T(0, 2.4, 5.5, 'EF', { bold: true }) };

  S.smoke = { name: 'Smoke Detector', short: 'Smoke Det.', cat: 'electrical', layer: 'electrical', w: 18, h: 18,
    svg: C(0, 0, 7.5) + T(0, 2.4, 5.5, 'SD', { bold: true }) };

  S.co_det = { name: 'CO Detector', short: 'CO Det.', cat: 'electrical', layer: 'electrical', w: 18, h: 18,
    svg: C(0, 0, 7.5) + T(0, 2.4, 5.5, 'CO', { bold: true }) };

  S.panel = { name: 'Electrical Panel', short: 'Panel', cat: 'electrical', layer: 'electrical', w: 26, h: 22,
    svg: R(-11, -3.5, 22, 7, 0, ' fill="#14161a"') + T(0, 13.5, 5, 'PANEL', { bold: true }) };

  S.jbox = { name: 'Junction Box (J-Box)', short: 'J-Box', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: C(0, 0, 6.5) + T(0, 2.6, 6.5, 'J', { bold: true }) };

  S.thermostat = { name: 'Thermostat', short: 'Thermostat', cat: 'electrical', layer: 'electrical', w: 16, h: 16,
    svg: C(0, 0, 6.5) + T(0, 2.6, 6.5, 'T', { bold: true }) };

  S.tv_outlet = { name: 'TV / Coax Outlet', short: 'TV', cat: 'electrical', layer: 'electrical', w: 18, h: 24,
    svg: '<path d="M0,-7 L7,5 L-7,5 Z"/>' + T(0, 14.5, 5, 'TV', { bold: true }) };

  S.data_outlet = { name: 'Data Outlet', short: 'Data', cat: 'electrical', layer: 'electrical', w: 18, h: 24,
    svg: '<path d="M0,-7 L7,5 L-7,5 Z"/>' + T(0, 14.5, 5, 'DATA', { bold: true }) };

  S.doorbell = { name: 'Doorbell Button', short: 'Doorbell', cat: 'electrical', layer: 'electrical', w: 12, h: 12,
    svg: C(0, 0, 4.5) + T(0, 2, 4, 'DB', { bold: true }) };

  S.disconnect = { name: 'Disconnect', short: 'Disconnect', cat: 'electrical', layer: 'electrical', w: 16, h: 22,
    svg: R(-7, -7, 14, 14) + T(0, 2.6, 5.5, 'DS', { bold: true }) };

  S.ac_unit = { name: 'A/C Condenser', short: 'A/C', cat: 'electrical', layer: 'electrical', w: 30, h: 36,
    svg: R(-13, -13, 26, 26) + C(0, 0, 9.5) + L(-6.7, -6.7, 6.7, 6.7, 0.7) + L(-6.7, 6.7, 6.7, -6.7, 0.7) + T(0, 20.5, 5.5, 'A/C', { bold: true }) };

  /* ============================ RISER / ONE-LINE ============================ */
  // Equipos para diagramas unifilares E-1 (estilo cajas de permiso, NTS)

  /* ======================= EQUIPO DEL RISER =======================
   * A ESCALA DE VERDAD (Edgar, 30/08: "busca una mejor referencia de medidas
   * a escala porque las veo disparejas… los desconectivos a veces son más
   * rectangulares; busca referencia en Siemens y escálame todos los equipos").
   *
   * Tenía razón: las cajas estaban dibujadas "a ojo", todas con proporción
   * parecida, y en la vida real no es así — un safety switch de 200A es ALTO
   * Y ESTRECHO (25" x 11½"), no casi cuadrado. Aquí las medidas son PULGADAS
   * REALES del cajón, así que las proporciones y los tamaños relativos salen
   * solos y no hay que adivinarlos.
   *
   * Verificado en catálogo Siemens (agosto 2026):
   *   60A GD 3R (GNF322RA) ....... 8.6" x 5.4"
   *   100A GD .................... 17" de alto
   *   200A GD .................... 25" de alto
   *   200A HD 3R (HF364NR) ....... 29.9" x 15.9"
   *   400A HD 3R (HF365R) ........ 45.3" x 22.4"
   *   Load center PL 200A 20/40 .. 28.6" x 14.4"
   * El resto (600A, meter socket, CT, ATS, gutter, J-box…) son medidas de
   * oficio de los cajones que se usan en Florida; van marcadas abajo con
   * "(oficio)" para que se sepa cuál es cuál y se pueda afinar el día que
   * haga falta.
   *
   * OJO: estos símbolos se dibujan a TAMAÑO REAL (ver symK), no al 0.7 de los
   * devices. Un panel puesto sobre el plano de la casa tiene que ocupar los
   * 14½" que ocupa en la pared.
   * =============================================================== */
  function rotuloCaja(txt, alto, ancho, dentro) {
    var tam = Math.max(3.2, Math.min(ancho * 0.26, alto * 0.16, 7));
    // en una caja estrecha el rótulo no cabe dentro: se pone debajo
    return dentro === false || ancho < tam * txt.length * 0.62
      ? T(0, alto / 2 + tam * 1.35, tam, txt, { bold: true })
      : T(0, alto / 2 - alto * 0.09, tam, txt, { bold: true });
  }
  function equipo(clave, nombre, corto, alto, ancho, dentro, extra) {
    var svg = R(-ancho / 2, -alto / 2, ancho, alto) + (extra || '') +
      (corto ? rotuloCaja(corto, alto, ancho, dentro) : '');
    S[clave] = { name: nombre, short: corto, cat: 'riser', layer: 'electrical',
      w: ancho + 6, h: alto + 12, svg: svg };
  }

  /* ---- medición y acometida ---- */
  /* MEDICIÓN — Siemens verificado (agosto 2026)
       Socket 200A ringless UAT417-XGF ....... 15" x 12"
       Meter combo MC0816 (8/16) ............. 24½" x 16½"
       Meter combo MC4040 SECW (40/40) ....... 32¼" x 21" */
  function meterCan(alto, ancho, rotulo) {
    var r = Math.min(ancho, alto) * 0.30;
    return R(-ancho / 2, -alto / 2, ancho, alto) +
      C(0, -alto * 0.12, r) + C(0, -alto * 0.12, r * 0.74) +
      T(0, -alto * 0.12 + r * 0.28, r * 0.62, 'kWh') +
      T(0, alto / 2 - alto * 0.10, Math.min(ancho * 0.26, 5), rotulo, { bold: true });
  }
  S.riser_meter = { name: 'Meter Can 200A — Siemens UAT417 (15"×12")', short: 'Meter Can',
    cat: 'riser', layer: 'electrical', w: 18, h: 24, svg: meterCan(15, 12, 'METER') };

  S.riser_meter_320 = { name: 'Meter Can 320A/400A (21"×15", oficio)', short: 'Meter 320A',
    cat: 'riser', layer: 'electrical', w: 21, h: 30, svg: meterCan(21, 15, 'METER 320A') };

  // combo = socket arriba + load center abajo, con su main
  function meterCombo(alto, ancho, rotulo) {
    var yDiv = -alto * 0.14;
    var r = ancho * 0.20;
    return R(-ancho / 2, -alto / 2, ancho, alto) +
      C(0, (-alto / 2 + yDiv) / 2, r) + C(0, (-alto / 2 + yDiv) / 2, r * 0.74) +
      T(0, (-alto / 2 + yDiv) / 2 + r * 0.28, r * 0.60, 'kWh') +
      L(-ancho / 2, yDiv, ancho / 2, yDiv) +
      L(-ancho * 0.22, yDiv + alto * 0.18, ancho * 0.22, yDiv + alto * 0.18, 0.7) +
      L(-ancho * 0.10, yDiv + alto * 0.18, ancho * 0.13, yDiv + alto * 0.12, 0.7) +
      C(-ancho * 0.10, yDiv + alto * 0.18, ancho * 0.045, ' fill="#14161a"') +
      C(ancho * 0.13, yDiv + alto * 0.12, ancho * 0.045, ' fill="#14161a"') +
      T(0, alto / 2 - alto * 0.07, Math.min(ancho * 0.20, 4.6), rotulo, { bold: true });
  }
  S.riser_meter_main = { name: 'Meter Combo 200A 8/16 — Siemens MC0816 (24½"×16½")', short: 'Meter Combo',
    cat: 'riser', layer: 'electrical', w: 22, h: 34, svg: meterCombo(24.5, 16.5, 'MAIN') };

  S.riser_meter_main40 = { name: 'Meter Combo 200A 40/40 — Siemens MC4040 SECW (32¼"×21")', short: 'Meter Combo 40',
    cat: 'riser', layer: 'electrical', w: 27, h: 42, svg: meterCombo(32.25, 21, 'MAIN 40/40') };

  S.riser_ct = { name: 'CT Cabinet 36"×36" (oficio)', short: 'CT Cabinet',
    cat: 'riser', layer: 'electrical', w: 42, h: 48,
    svg: R(-18, -18, 36, 36) + T(0, 2, 7, 'CT', { bold: true }) };

  S.riser_wh = { name: 'Weatherhead / Service Drop', short: 'Weatherhead',
    cat: 'riser', layer: 'electrical', w: 22, h: 60,
    svg: '<path d="M0,28 L0,-16" stroke-width="0.8"/>' +
      '<path d="M0,-16 Q0,-28 10,-26" stroke-width="0.75"/>' + L(-6, -20, 6, -25, 0.5) };

  /* ---- distribución ---- */
  /* PANELES — Siemens PL/ES verificado (agosto 2026)
       125A 8/16 3R ....... 14¾" x 12⅛"
       100A 12/24 T1 ...... 18"   x 14⅜"
       100A 12/24 3R ...... 23"   x 14¼"
       200A 20/40 3R ...... 28.6" x 14.4"
       200A 30/40 3R ...... 36.6" x 14.4"
       400A 42/20 3R ...... 47"   x 20"     */
  function loadCenter(alto, ancho, rotulo, sub) {
    var tam = Math.min(ancho * 0.24, 4.4);
    return R(-ancho / 2, -alto / 2, ancho, alto) +
      L(0, -alto * 0.36, 0, -alto * 0.12, 0.8) +           // la barra del main
      T(0, alto / 2 - alto * (sub ? 0.17 : 0.10), tam, rotulo, { bold: true }) +
      (sub ? T(0, alto / 2 - alto * 0.06, tam * 0.78, sub) : '');
  }
  S.riser_panel_125 = { name: 'Panel 125A 8/16 — Siemens PL 3R (14¾"×12⅛")', short: 'Panel 125A',
    cat: 'riser', layer: 'electrical', w: 18, h: 24, svg: loadCenter(14.75, 12.125, 'PANEL') };

  S.riser_subpanel = { name: 'Subpanel 100A 12/24 — Siemens PL Tipo 1 (18"×14⅜")', short: 'Subpanel',
    cat: 'riser', layer: 'electrical', w: 20, h: 28, svg: loadCenter(18, 14.375, 'SUB') };

  S.riser_panel_100 = { name: 'Panel 100A 12/24 — Siemens PL 3R (23"×14¼")', short: 'Panel 100A',
    cat: 'riser', layer: 'electrical', w: 20, h: 33, svg: loadCenter(23, 14.25, 'PANEL', '100A') };

  S.riser_panel = { name: 'Panel 200A 20/40 — Siemens PL 3R (28.6"×14.4")', short: 'Panel 200A',
    cat: 'riser', layer: 'electrical', w: 20, h: 39, svg: loadCenter(28.6, 14.4, 'PANEL', '120/240V') };

  S.riser_panel_200_30 = { name: 'Panel 200A 30/40 — Siemens PL 3R (36.6"×14.4")', short: 'Panel 200A 30sp',
    cat: 'riser', layer: 'electrical', w: 20, h: 47, svg: loadCenter(36.6, 14.4, 'PANEL', '200A 30sp') };

  S.riser_panel_400 = { name: 'Panel 400A 42/20 — Siemens PL 3R (47"×20")', short: 'Panel 400A',
    cat: 'riser', layer: 'electrical', w: 26, h: 58, svg: loadCenter(47, 20, 'PANEL', '400A') };

  /* GUTTER / WIREWAY en las dos posiciones (Edgar, 30/08: "gutter hazme uno
     vertical y uno horizontal"). En obra va de las dos maneras: vertical
     bajando del meter a los paneles, y horizontal corriendo por encima de una
     fila de disconnects. Girar el símbolo también valdría, pero teniéndolos
     los dos no hay que acordarse. Las rayas son las juntas de los tramos. */
  function wireway(largo, lado, vertical) {
    var an = vertical ? lado : largo, al = vertical ? largo : lado;
    var out = R(-an / 2, -al / 2, an, al);
    // juntas cada tercio
    for (var i = 1; i <= 2; i++) {
      var t = -largo / 2 + largo * (i / 3);
      out += vertical ? L(-lado / 2, t, lado / 2, t, 0.4) : L(t, -lado / 2, t, lado / 2, 0.4);
    }
    return out + T(0, al / 2 + 4.5, 4, 'GUTTER', { bold: true });
  }
  S.riser_gutter = { name: 'Gutter / Wireway 6×6×36 — VERTICAL (oficio)', short: 'Gutter vert.',
    cat: 'riser', layer: 'electrical', w: 14, h: 48, svg: wireway(36, 6, true) };

  S.riser_gutter_h = { name: 'Gutter / Wireway 6×6×36 — HORIZONTAL (oficio)', short: 'Gutter horiz.',
    cat: 'riser', layer: 'electrical', w: 40, h: 20, svg: wireway(36, 6, false) };

  S.riser_jbox = { name: 'Junction Box 12×12 (oficio)', short: 'J-Box',
    cat: 'riser', layer: 'electrical', w: 18, h: 22,
    svg: R(-6, -6, 12, 12) + L(-6, -6, 6, 6, 0.4) + L(6, -6, -6, 6, 0.4) +
      T(0, 11, 4, 'J-BOX', { bold: true }) };

  /* ---- desconectivos: el tamaño ES el amperaje ---- */
  function safetySwitch(alto, ancho) {
    var hx = ancho / 2, hy = alto / 2;
    var m = Math.min(ancho, alto);
    var bx = ancho * 0.26, by = alto * 0.16;
    var cy = -alto * 0.10;
    var r = Math.max(0.45, m * 0.045);
    return R(-hx, -hy, ancho, alto) +
      L(-bx, cy, bx * 0.75, cy - by, Math.max(0.35, m * 0.030)) +
      C(-bx, cy, r, ' fill="#14161a"') + C(bx, cy - by, r, ' fill="#14161a"') +
      rotuloCaja('DISC', alto, ancho, true);
  }
  function disc(clave, nombre, corto, alto, ancho) {
    S[clave] = { name: nombre, short: corto, cat: 'riser', layer: 'electrical',
      w: ancho + 6, h: alto + 12, svg: safetySwitch(alto, ancho) };
  }
  disc('riser_disc60',  'Disconnect ≤100A — 60A GD 3R Siemens (8.6"×5.4")', 'Disc ≤100A', 8.6, 5.4);
  disc('riser_disc100', 'Disconnect 100–150A — 100A GD Siemens (17"×9")',   'Disc 100–150A', 17, 9);
  // el de siempre conserva su clave: 200A es el que más se usa en casa
  S.riser_disc = { name: 'Disconnect 200–250A — 200A GD Siemens (25"×11½")', short: 'Disc 200–250A',
    cat: 'riser', layer: 'electrical', w: 17.5, h: 37, svg: safetySwitch(25, 11.5) };
  disc('riser_disc400', 'Disconnect 400A — HF365R HD 3R Siemens (45.3"×22.4")', 'Disc 400A', 45.3, 22.4);
  disc('riser_disc600', 'Disconnect >400A — 600A HD 3R (57"×26", estimado)',    'Disc >400A', 57, 26);

  /* ---- respaldo y generación ---- */
  /* ATS — Generac verificado (agosto 2026)
       RXSW100A3 / 150A3 / 200A3 ..... 30" x 13½"  (mismo cajón los tres)
       RTSW400A3 ..................... 48" x 21.8"  */
  function atsCaja(alto, ancho, rotulo) {
    var r = ancho * 0.045;
    var yb = alto * 0.06;
    return R(-ancho / 2, -alto / 2, ancho, alto) +
      T(0, -alto * 0.14, Math.min(ancho * 0.30, 6), 'ATS', { bold: true }) +
      L(-ancho * 0.26, yb, 0, yb + alto * 0.10, 0.65) +
      L(0, yb + alto * 0.10, ancho * 0.26, yb, 0.65) +
      C(-ancho * 0.26, yb, r, ' fill="#14161a"') + C(ancho * 0.26, yb, r, ' fill="#14161a"') +
      C(0, yb + alto * 0.10, r, ' fill="#14161a"') +
      T(0, alto / 2 - alto * 0.06, Math.min(ancho * 0.20, 4.2), rotulo, { bold: true });
  }
  S.riser_ats = { name: 'ATS 100–200A — Generac RXSW (30"×13½")', short: 'ATS 200A',
    cat: 'riser', layer: 'electrical', w: 19, h: 40, svg: atsCaja(30, 13.5, '200A') };

  S.riser_ats400 = { name: 'ATS 400A — Generac RTSW400A3 (48"×21.8")', short: 'ATS 400A',
    cat: 'riser', layer: 'electrical', w: 28, h: 60, svg: atsCaja(48, 21.8, '400A') };

  S.riser_gen = { name: 'Standby Generator 22kW (planta 48"×25", oficio)', short: 'Generator',
    cat: 'riser', layer: 'electrical', w: 54, h: 40,
    svg: R(-24, -12.5, 48, 25, 2) + C(0, -1, 7) + T(0, 2.4, 8, 'G', { bold: true }) +
      T(0, 18, 5, 'GENERATOR', { bold: true }) };

  S.riser_bat = { name: 'Battery / ESS (45"×29", oficio)', short: 'Battery ESS',
    cat: 'riser', layer: 'electrical', w: 35, h: 58,
    svg: R(-14.5, -22.5, 29, 45, 1.5) +
      L(-7, -6, 7, -6, 0.8) + L(-4, -2, 4, -2, 0.8) + L(-7, 3, 7, 3, 0.8) + L(-4, 7, 4, 7, 0.8) +
      T(0, 18, 4.6, 'ESS', { bold: true }) };

  S.riser_pv = { name: 'Solar Inverter PV (26"×17", oficio)', short: 'PV Inverter',
    cat: 'riser', layer: 'electrical', w: 23, h: 38,
    svg: R(-8.5, -13, 17, 26) +
      '<path d="M-5,-4 L-1,-4 L-3,3 L5,-5 L1,-5 L4,-11" fill="none" stroke-width="0.6"/>' +
      T(0, 8, 4, 'PV INV', { bold: true }) };

  /* ---- otros ---- */
  S.riser_xfmr = { name: 'Transformer 75kVA (30"×24", oficio)', short: 'Transformer',
    cat: 'riser', layer: 'electrical', w: 30, h: 46,
    svg: C(0, -6, 8) + C(0, 6, 8) + T(0, 21, 5, 'XFMR', { bold: true }) };

  S.riser_padmount = { name: 'Pad-mount Transformer (planta 60"×48", utility)', short: 'Pad-mount',
    cat: 'riser', layer: 'electrical', w: 66, h: 62,
    svg: R(-30, -24, 60, 48, 2) + C(-9, 0, 8) + C(9, 0, 8) +
      T(0, 32, 6, 'PAD-MOUNT XFMR', { bold: true }) };

  S.riser_ev = { name: 'EV Charger (14"×8", oficio)', short: 'EV',
    cat: 'riser', layer: 'electrical', w: 14, h: 24,
    svg: R(-4, -7, 8, 14) +
      '<path d="M-1.6,-3 L0.8,-3 L-0.5,1.5 L2.6,-2 L0.4,-2 L2,-5.5" fill="none" stroke-width="0.5"/>' +
      T(0, 11, 3.6, 'EV', { bold: true }) };

  S.riser_pool = { name: 'Pool Panel / Time Clock (20"×12", oficio)', short: 'Pool Panel',
    cat: 'riser', layer: 'electrical', w: 18, h: 32,
    svg: R(-6, -10, 12, 20) + C(0, -4, 3.4) + L(0, -4, 0, -6.6, 0.45) + L(0, -4, 2, -4, 0.45) +
      T(0, 6, 3.4, 'POOL', { bold: true }) };

  S.riser_spd = { name: 'Surge Protector SPD (7"×4½", oficio)', short: 'SPD',
    cat: 'riser', layer: 'electrical', w: 12, h: 18,
    svg: R(-2.25, -3.5, 4.5, 7) + T(0, 8, 3.6, 'SPD', { bold: true }) };

  S.riser_ground = { name: 'Ground Rods (2) — 6\'-0" de separación', short: 'Ground Rods',
    cat: 'riser', layer: 'electrical', w: 86, h: 44,
    svg: (function () {
      function rod(x) {
        return L(x, -16, x, 5, 0.7) +
          L(x - 6, 5, x + 6, 5, 0.9) + L(x - 4, 9, x + 4, 9, 0.7) + L(x - 1.8, 13, x + 1.8, 13, 0.55);
      }
      return rod(-36) + rod(36) + L(-36, -16, 36, -16, 0.6) + T(0, -20, 5, "6'-0\" MIN.");
    })() };

  S.riser_gnd_sym = { name: 'Ground Symbol', short: 'Ground',
    cat: 'riser', layer: 'electrical', w: 18, h: 22,
    svg: L(0, -10, 0, 0, 1.2) + L(-8, 0, 8, 0, 1.4) + L(-5, 4, 5, 4, 1.2) + L(-2, 8, 2, 8, 1) };

  /* ============================ PLOMERÍA / EQUIPOS ============================ */

  S.toilet = { name: 'Toilet', cat: 'plumbing', layer: 'furniture', w: 22, h: 30,
    svg: R(-10, -14.5, 20, 7.5, 1.5) + '<ellipse cx="0" cy="2.5" rx="8" ry="9.5"/>' };

  // VANITIES POR MEDIDA (Edgar, 08/30: "hazme mas vanity de 60, 36, 30 y 24;
  // tenemos solo uno y no se de que medida es"). Todos con 21" de fondo, que
  // es el estandar; el ancho es el que da nombre al mueble en la tienda.
  // Se dibujan iguales entre si para que la familia se lea de un vistazo.
  function vanity(an, dobleP) {
    var f = 21, hf = f / 2, ha = an / 2;
    var s2 = R(-ha, -hf, an, f);
    if (dobleP) {
      var q4 = an / 4;
      s2 += '<ellipse cx="' + (-q4) + '" cy="0.5" rx="7.5" ry="5.5"/>' + C(-q4, -7, 1);
      s2 += '<ellipse cx="' + q4 + '" cy="0.5" rx="7.5" ry="5.5"/>' + C(q4, -7, 1);
    } else {
      var rx = Math.min(7.5, ha - 3);
      s2 += '<ellipse cx="0" cy="0.5" rx="' + rx + '" ry="5.5"/>' + C(0, -7, 1);
    }
    return s2;
  }
  S.vanity24 = { name: 'Vanity 24" (1 lavamanos)', short: 'Vanity 24"',
    cat: 'plumbing', layer: 'furniture', w: 24, h: 21, svg: vanity(24) };
  S.vanity30 = { name: 'Vanity 30" (1 lavamanos)', short: 'Vanity 30"',
    cat: 'plumbing', layer: 'furniture', w: 30, h: 21, svg: vanity(30) };
  S.vanity36 = { name: 'Vanity 36" (1 lavamanos)', short: 'Vanity 36"',
    cat: 'plumbing', layer: 'furniture', w: 36, h: 21, svg: vanity(36) };
  S.vanity48 = { name: 'Vanity 48" (1 lavamanos)', short: 'Vanity 48"',
    cat: 'plumbing', layer: 'furniture', w: 48, h: 21, svg: vanity(48) };
  S.vanity60 = { name: 'Vanity 60" doble (2 lavamanos)', short: 'Vanity 60" doble',
    cat: 'plumbing', layer: 'furniture', w: 60, h: 21, svg: vanity(60, true) };
  S.vanity72 = { name: 'Vanity 72" doble (2 lavamanos)', short: 'Vanity 72" doble',
    cat: 'plumbing', layer: 'furniture', w: 72, h: 21, svg: vanity(72, true) };

  // el de siempre, ahora con su medida en el nombre para no adivinar
  S.lavatory = { name: 'Vanity 26" (el de siempre)', cat: 'plumbing', layer: 'furniture', w: 26, h: 22,
    svg: R(-13, -10.5, 26, 21) + '<ellipse cx="0" cy="0.5" rx="7.5" ry="5.5"/>' + C(0, -7, 1) };

  // vanity DOBLE (dos lavamanos, 60x22 tipico) — estirable a la medida
  // real con Ancho/Fondo, como todos los de tamano real
  S.lavatory2 = { name: 'Vanity 60" doble (el de siempre)', short: 'Vanity 60 viejo', cat: 'plumbing', layer: 'furniture', w: 60, h: 22,
    svg: R(-30, -10.5, 60, 21) +
      '<ellipse cx="-15" cy="0.5" rx="7.5" ry="5.5"/>' + C(-15, -7, 1) +
      '<ellipse cx="15" cy="0.5" rx="7.5" ry="5.5"/>' + C(15, -7, 1) };

  S.sink_pedestal = { name: 'Pedestal Sink', cat: 'plumbing', layer: 'furniture', w: 22, h: 20,
    svg: '<ellipse cx="0" cy="0" rx="10" ry="8.5"/>' + '<ellipse cx="0" cy="0.5" rx="6.5" ry="5"/>' + C(0, -5.5, 1) };

  // fregadero de UNA cubeta (Edgar, 08/30): el de cocina chica, bar o laundry
  S.kitchen_sink1 = { name: 'Single Kitchen Sink', short: 'Sink sencillo',
    cat: 'plumbing', layer: 'furniture', w: 25, h: 22,
    svg: R(-12, -10.5, 24, 21, 1.5) + R(-9.5, -7.5, 19, 15, 1.5) +
      C(0, 0.5, 1.4) + C(0, -9, 1.6) };

  S.kitchen_sink = { name: 'Double Kitchen Sink', cat: 'plumbing', layer: 'furniture', w: 34, h: 23,
    svg: R(-16.5, -11, 33, 22) + R(-14, -8, 12.5, 16, 1.5) + R(1.5, -8, 12.5, 16, 1.5) + C(0, -9.2, 1) };

  S.tub = { name: 'Bathtub 60" (encajonada)', cat: 'plumbing', layer: 'furniture', w: 62, h: 32,
    svg: R(-30, -15, 60, 30, 3) + R(-26.5, -11.5, 53, 23, 9) + C(-21, 0, 1.6) };

  // TINA EXENTA OVALADA (Edgar, 08/30: "la de esos banos master que tiene una
  // sola en forma ovalada"). Va suelta, no encajonada: por eso se dibuja el
  // ovalo entero con su faldon, sin el rectangulo de la pared. Medidas de
  // catalogo: 66x36 la grande y 60x32 la mediana.
  S.tub_oval = { name: 'Tina exenta ovalada 66"', short: 'Tina ovalada 66"',
    cat: 'plumbing', layer: 'furniture', bg: 'ellipse', w: 68, h: 38,
    svg: '<ellipse cx="0" cy="0" rx="33" ry="18"/>' +
         '<ellipse cx="0" cy="0" rx="29" ry="14.5"/>' +
         C(-24.5, 0, 1.6) + C(24, 0, 1.2) };

  S.tub_oval60 = { name: 'Tina exenta ovalada 60"', short: 'Tina ovalada 60"',
    cat: 'plumbing', layer: 'furniture', bg: 'ellipse', w: 62, h: 34,
    svg: '<ellipse cx="0" cy="0" rx="30" ry="16"/>' +
         '<ellipse cx="0" cy="0" rx="26" ry="12.5"/>' +
         C(-22, 0, 1.6) + C(21.5, 0, 1.2) };

  S.shower = { name: 'Shower 36×36', cat: 'plumbing', layer: 'furniture', w: 38, h: 38,
    svg: R(-18, -18, 36, 36) + L(-18, -18, -4, -4, 0.6) + L(18, -18, 4, -4, 0.6) + L(-18, 18, -4, 4, 0.6) + L(18, 18, 4, 4, 0.6) + C(0, 0, 2) };

  S.range = { name: 'Range 30"', cat: 'plumbing', layer: 'furniture', w: 32, h: 28,
    svg: R(-15, -13, 30, 26) + C(-7.5, -6, 4.4) + C(7.5, -6, 4.4) + C(-7.5, 6.5, 3.6) + C(7.5, 6.5, 3.6) };

  S.fridge = { name: 'Refrigerator', cat: 'plumbing', layer: 'furniture', w: 38, h: 35,
    svg: R(-18, -16.5, 36, 33) + L(-18, 12.5, 18, 12.5, 0.6) + T(0, 2, 7, 'REF') };

  S.dishwasher = { name: 'Dishwasher (DW)', cat: 'plumbing', layer: 'furniture', w: 26, h: 26,
    svg: R(-12, -12, 24, 24) + T(0, 2.5, 7, 'DW') };

  S.washer = { name: 'Washer', cat: 'plumbing', layer: 'furniture', w: 29, h: 29,
    svg: R(-13.5, -13.5, 27, 27) + C(0, 0, 8.5) + T(0, 3, 8, 'W') };

  S.dryer = { name: 'Dryer', cat: 'plumbing', layer: 'furniture', w: 29, h: 29,
    svg: R(-13.5, -13.5, 27, 27) + C(0, 0, 8.5) + T(0, 3, 8, 'D') };

  // TORRE lavadora/secadora apilada (Edgar, 08/30): en planta ocupa lo mismo
  // que una sola (27" de ancho), pero son DOS aparatos — en el plano se marca
  // con las esquinas dobladas y el rótulo W/D para que el inspector sepa que
  // ahí van las dos cargas. Es lo que va en los laundry chicos como el de
  // Caroline (7'5" x 14'3").
  S.washer_dryer_torre = { name: 'Washer/Dryer Torre (apilada)', short: 'W/D Torre',
    cat: 'plumbing', layer: 'furniture', w: 29, h: 31,
    svg: R(-13.5, -15, 27, 30) +
      L(-13.5, -7, 13.5, -7) +          // la franja de arriba = el aparato apilado
      T(0, -9.5, 6.5, 'W/D') +
      C(0, 4, 8.5) };

  S.water_heater = { name: 'Water Heater', cat: 'plumbing', layer: 'furniture', w: 25, h: 25,
    svg: C(0, 0, 11) + T(0, 2.8, 7, 'WH') };

  S.cabinet_base = { name: 'Base Cabinet 24"', cat: 'plumbing', layer: 'furniture', w: 26, h: 26,
    svg: R(-12, -12, 24, 24) + L(-12, -12, 12, 12, 0.5) };

  S.cabinet_wall = { name: 'Wall Cabinet 12" (hidden line)', cat: 'plumbing', layer: 'furniture', w: 26, h: 14,
    svg: '<rect x="-12" y="-6" width="24" height="12" stroke-dasharray="3 2.2"/>' };

  /* ============================ ALZADO / GABINETES ============================ */
  // Vista frontal (elevación) para paredes de cocina, según estilo de shop drawings

  S.elev_base_door = { name: 'Base Cabinet 24" (door)', short: 'Base Door', cat: 'elev', layer: 'furniture', w: 24, h: 35,
    svg: R(-12, -17.25, 24, 34.5) + L(-12, 13.25, 12, 13.25) + R(-10.5, -15.75, 21, 27.5) + C(8.5, 0, 0.7, ' fill="#14161a"') };

  S.elev_base_drawers = { name: 'Base Cabinet 24" (drawers)', short: 'Drawer Base', cat: 'elev', layer: 'furniture', w: 24, h: 35,
    svg: (function () {
      var s = R(-12, -17.25, 24, 34.5) + L(-12, 13.25, 12, 13.25);
      var top = -15.75, botm = 11.75, hgt = (botm - top) / 3;
      for (var i = 0; i < 3; i++) {
        var y = top + i * hgt;
        s += R(-10.5, y, 21, hgt - 1);
        s += L(-4, y + hgt / 2 - 0.5, 4, y + hgt / 2 - 0.5, 1.2);
      }
      return s;
    })() };

  S.elev_sink_base = { name: 'Sink Base 36"', short: 'Sink Base', cat: 'elev', layer: 'furniture', w: 36, h: 35,
    svg: R(-18, -17.25, 36, 34.5) + L(-18, 13.25, 18, 13.25) + L(0, -15.75, 0, 11.75) +
      R(-16.5, -15.75, 15, 27.5) + R(1.5, -15.75, 15, 27.5) + C(-3, 0, 0.7, ' fill="#14161a"') + C(3, 0, 0.7, ' fill="#14161a"') +
      '<path d="M-3,-17.25 L-3,-21 Q-3,-24 0,-24 Q3,-24 3,-21" fill="none"/>' };

  S.elev_wall_cab = { name: 'Wall Cabinet 24×30', short: 'Wall Cab 24', cat: 'elev', layer: 'furniture', w: 24, h: 30,
    svg: R(-12, -15, 24, 30) + L(0, -15, 0, 15) + R(-10.5, -13.5, 9, 27) + R(1.5, -13.5, 9, 27) +
      C(-2.5, 11, 0.7, ' fill="#14161a"') + C(2.5, 11, 0.7, ' fill="#14161a"') };

  S.elev_wall_cab36 = { name: 'Wall Cabinet 36×30', short: 'Wall Cab 36', cat: 'elev', layer: 'furniture', w: 36, h: 30,
    svg: R(-18, -15, 36, 30) + L(0, -15, 0, 15) + R(-16.5, -13.5, 15, 27) + R(1.5, -13.5, 15, 27) +
      C(-2.5, 11, 0.7, ' fill="#14161a"') + C(2.5, 11, 0.7, ' fill="#14161a"') };

  S.elev_tall_pantry = { name: 'Tall Pantry 24×84 (single door)', short: 'Pantry 24', cat: 'elev', layer: 'furniture', w: 24, h: 84,
    svg: R(-12, -42, 24, 84) + L(-12, 12, 12, 12) + R(-10.5, -40.5, 21, 51) + R(-10.5, 13.5, 21, 27) +
      C(8.5, -12, 0.7, ' fill="#14161a"') + C(8.5, 18, 0.7, ' fill="#14161a"') };

  S.elev_tall_pantry36 = { name: 'Tall Pantry 36×84 (double door)', short: 'Pantry 36', cat: 'elev', layer: 'furniture', w: 36, h: 84,
    svg: R(-18, -42, 36, 84) + L(0, -42, 0, 42) + L(-18, 12, 18, 12) +
      R(-16.5, -40.5, 15, 51) + R(1.5, -40.5, 15, 51) + R(-16.5, 13.5, 15, 27) + R(1.5, 13.5, 15, 27) +
      C(-3, -12, 0.7, ' fill="#14161a"') + C(3, -12, 0.7, ' fill="#14161a"') +
      C(-3, 18, 0.7, ' fill="#14161a"') + C(3, 18, 0.7, ' fill="#14161a"') };

  S.elev_oven_tower = { name: 'Oven Tower 30×84 (tall + wall oven)', short: 'Oven Tower', cat: 'elev', layer: 'furniture', w: 30, h: 84,
    svg: R(-15, -42, 30, 84) +
      R(-13.5, -40.5, 27, 24) + C(10.5, -30, 0.7, ' fill="#14161a"') +
      R(-13.5, -14, 27, 26, 1) + R(-10.5, -10, 21, 15, 1) + L(-9, -12, 9, -12, 1.2) +
      R(-13.5, 14.5, 27, 12) + L(-4, 20.5, 4, 20.5, 1.2) +
      R(-13.5, 28.5, 27, 12) + L(-4, 34.5, 4, 34.5, 1.2) };

  S.elev_tall_utility = { name: 'Tall Utility / Broom 18×84', short: 'Utility 18', cat: 'elev', layer: 'furniture', w: 18, h: 84,
    svg: R(-9, -42, 18, 84) + R(-7.5, -40.5, 15, 81) + C(5.5, 0, 0.7, ' fill="#14161a"') };

  S.elev_counter = { name: 'Countertop 36"', short: 'Countertop', cat: 'elev', layer: 'furniture', w: 36, h: 3,
    svg: R(-18, -1.5, 36, 3, 0, ' fill="#d9d7cf"') };

  S.elev_fridge = { name: 'Refrigerator 36×70 (front)', short: 'Fridge', cat: 'elev', layer: 'furniture', w: 36, h: 70,
    svg: R(-18, -35, 36, 70, 1.5) + L(-18, 8, 18, 8) + L(0, -35, 0, 8) +
      L(-2.5, -28, -2.5, 2, 1.4) + L(2.5, -28, 2.5, 2, 1.4) + L(-8, 12, -8, 30, 1.4) };

  S.elev_range = { name: 'Range 30\u2033 (front)', short: 'Range', cat: 'elev', layer: 'furniture', w: 30, h: 36,
    svg: R(-15, -18, 30, 36) + L(-15, -12, 15, -12) + C(-10, -15, 1.2) + C(-3.5, -15, 1.2) + C(3.5, -15, 1.2) + C(10, -15, 1.2) +
      R(-12, -8, 24, 20, 1) + L(-9, -5, 9, -5, 1.6) };

  S.elev_dishwasher = { name: 'Dishwasher 24 (front)', short: 'DW', cat: 'elev', layer: 'furniture', w: 24, h: 35,
    svg: R(-12, -17.25, 24, 34.5) + L(-12, -11, 12, -11) + L(-8, -14, 8, -14, 1.6) + T(0, 4, 6, 'DW') };

  S.elev_wall_oven = { name: 'Wall Oven / Microwave 30×18', short: 'Wall Oven', cat: 'elev', layer: 'furniture', w: 30, h: 18,
    svg: R(-15, -9, 30, 18) + R(-12, -6, 20, 12, 1) + C(11, -3, 0.8) + C(11, 0, 0.8) + C(11, 3, 0.8) + L(-11, -4, 7, -4, 1.2) };

  S.elev_hood = { name: 'Range Hood 30', short: 'Hood', cat: 'elev', layer: 'furniture', w: 30, h: 24,
    svg: R(-5, -12, 10, 12) + '<path d="M-15,12 L15,12 L15,7 L-15,7 Z"/>' + '<path d="M-15,7 L-5,0 L5,0 L15,7" fill="none"/>' };

  S.elev_recep = { name: 'Receptacle (elevation)', short: 'Recept.', cat: 'elev', layer: 'electrical', w: 5, h: 7,
    svg: R(-2.25, -3.5, 4.5, 7, 0.8) + L(-0.8, -1.8, -0.8, -0.4, 1) + L(0.8, -1.8, 0.8, -0.4, 1) + C(0, 1.6, 0.5) };

  S.elev_switch = { name: 'Switch (elevation)', short: 'Switch', cat: 'elev', layer: 'electrical', w: 5, h: 7,
    svg: R(-2.25, -3.5, 4.5, 7, 0.8) + R(-0.7, -1.6, 1.4, 3.2, 0.4) };

  S.elev_undercab = { name: 'Under-Cabinet LED Strip', short: 'UC LED', cat: 'elev', layer: 'electrical', w: 26, h: 4,
    svg: '<line x1="-12" y1="0" x2="12" y2="0" stroke-dasharray="2.5 1.8" stroke-width="1.2"/>' + C(-12, 0, 0.8) + C(12, 0, 0.8) };

  /* ============================ MOBILIARIO ============================ */

  function bed(w, h, pillows) {
    var s = R(-w / 2, -h / 2, w, h, 1.5);
    var pw = (w - 12) / pillows - 4;
    for (var i = 0; i < pillows; i++) {
      var x = -w / 2 + 6 + i * (pw + 4) + (pillows === 1 ? 3 : 0);
      s += R(x, -h / 2 + 3.5, pw, 11, 4);
    }
    s += L(-w / 2, -h / 2 + 22, w / 2, -h / 2 + 22, 0.6);
    s += L(-w / 2, h / 2, -w / 2 + 12, h / 2 - 12, 0.6);
    return s;
  }

  S.bed_king = { name: 'King Bed 76×80', cat: 'furniture', layer: 'furniture', w: 78, h: 82, svg: bed(76, 80, 2) };
  S.bed_queen = { name: 'Queen Bed 60×80', cat: 'furniture', layer: 'furniture', w: 62, h: 82, svg: bed(60, 80, 2) };
  S.bed_twin = { name: 'Twin Bed 38×75', cat: 'furniture', layer: 'furniture', w: 40, h: 77, svg: bed(38, 75, 1) };

  S.sofa = { name: 'Sofa 84"', cat: 'furniture', layer: 'furniture', w: 86, h: 38,
    svg: R(-42, -18, 84, 36, 4) + L(-36, -11, 36, -11, 0.6) + L(-36, -11, -36, 18, 0.6) + L(36, -11, 36, 18, 0.6) + L(-12, -11, -12, 18, 0.6) + L(12, -11, 12, 18, 0.6) };

  S.loveseat = { name: 'Loveseat 60"', cat: 'furniture', layer: 'furniture', w: 62, h: 38,
    svg: R(-30, -18, 60, 36, 4) + L(-24, -11, 24, -11, 0.6) + L(-24, -11, -24, 18, 0.6) + L(24, -11, 24, 18, 0.6) + L(0, -11, 0, 18, 0.6) };

  S.armchair = { name: 'Armchair', cat: 'furniture', layer: 'furniture', w: 36, h: 36,
    svg: R(-17, -17, 34, 34, 4) + L(-11, -10, 11, -10, 0.6) + L(-11, -10, -11, 17, 0.6) + L(11, -10, 11, 17, 0.6) };

  function chair(x, y, rot) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">' + R(-8, -8, 16, 16, 3) + L(-8, -5, 8, -5, 0.5) + '</g>';
  }

  S.dining6 = { name: 'Dining Table (6)', cat: 'furniture', layer: 'furniture', w: 76, h: 76,
    svg: R(-36, -18, 72, 36) +
      chair(-22, -30, 0) + chair(0, -30, 0) + chair(22, -30, 0) +
      chair(-22, 30, 180) + chair(0, 30, 180) + chair(22, 30, 180) };

  S.table_round = { name: 'Round Table 48"', cat: 'furniture', layer: 'furniture', w: 76, h: 76,
    svg: C(0, 0, 24) + chair(0, -34, 0) + chair(0, 34, 180) + chair(-34, 0, -90) + chair(34, 0, 90) };

  S.desk = { name: 'Desk 60×30', cat: 'furniture', layer: 'furniture', w: 62, h: 52,
    svg: R(-30, -15, 60, 30) + chair(0, 26, 180) };

  S.dresser = { name: 'Dresser 60×18', cat: 'furniture', layer: 'furniture', w: 62, h: 20,
    svg: R(-30, -9, 60, 18) + L(-10, -9, -10, 9, 0.5) + L(10, -9, 10, 9, 0.5) };

  S.nightstand = { name: 'Nightstand', cat: 'furniture', layer: 'furniture', w: 26, h: 20,
    svg: R(-12, -9, 24, 18) + L(-12, -9, 12, 9, 0.5) };

  S.tv_console = { name: 'TV Console 60"', cat: 'furniture', layer: 'furniture', w: 62, h: 20,
    svg: R(-30, -9, 60, 18) + R(-24, -6.5, 48, 4, 0) };

  /* ============================ EXTERIOR / SITIO ============================ */

  S.tree_lg = { name: 'Tree (10 ft canopy)', cat: 'site', layer: 'furniture', bg: 'ellipse', w: 124, h: 124,
    svg: scallop(60, 14) + C(0, 0, 2, ' fill="#14161a"') };

  S.tree_md = { name: 'Tree (6 ft canopy)', cat: 'site', layer: 'furniture', bg: 'ellipse', w: 76, h: 76,
    svg: scallop(36, 11) + C(0, 0, 1.8, ' fill="#14161a"') };

  S.shrub = { name: 'Shrub', cat: 'site', layer: 'furniture', bg: 'ellipse', w: 40, h: 40,
    svg: scallop(18, 8) };

  S.tree_evergreen = { name: 'Evergreen (spiky)', cat: 'site', layer: 'furniture', w: 76, h: 76,
    svg: (function () {
      var n = 12, pts = [];
      for (var i = 0; i < n * 2; i++) {
        var r = i % 2 === 0 ? 36 : 15;
        var a = (i / (n * 2)) * Math.PI * 2;
        pts.push((r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1));
      }
      return '<polygon points="' + pts.join(' ') + '" fill="none"/>' + C(0, 0, 1.8, ' fill="#14161a"');
    })() };

  S.tree_deciduous = { name: 'Deciduous (radial)', cat: 'site', layer: 'furniture', w: 76, h: 76,
    svg: (function () {
      var s = C(0, 0, 36) + C(0, 0, 1.8, ' fill="#14161a"');
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2 + 0.3;
        s += L((6 * Math.cos(a)).toFixed(1), (6 * Math.sin(a)).toFixed(1), (33 * Math.cos(a)).toFixed(1), (33 * Math.sin(a)).toFixed(1), 0.6);
      }
      return s;
    })() };

  S.palm = { name: 'Palm', cat: 'site', layer: 'furniture', w: 96, h: 96,
    svg: (function () {
      var s = C(0, 0, 3, ' fill="#14161a"'), n = 9;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        var mx = 24 * Math.cos(a + 0.35), my = 24 * Math.sin(a + 0.35);
        var ex = 45 * Math.cos(a), ey = 45 * Math.sin(a);
        s += '<path d="M0,0 Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1) + '"/>';
      }
      return s;
    })() };

  S.pool = { name: 'Pool 12×24', cat: 'site', layer: 'furniture', w: 290, h: 148,
    svg: R(-144, -72, 288, 144, 10) + R(-136, -64, 272, 128, 8) };


  /* —— del plano profesional de la cliente (08/29) —— */

  // chimenea: cajón con jambas rayadas + hogar al frente (family room)
  S.fireplace = { name: 'Fireplace 48"', cat: 'furniture', layer: 'furniture', w: 48, h: 28,
    svg: R(-24, -14, 48, 20) + R(-14, -12, 28, 16) +
      '<path d="M-24,-14 L-14,-4 M-20,-14 L-14,-8 M14,-4 L24,-14 M14,-8 L20,-14"/>' +
      '<path d="M-18,6 H18 M-18,10 H18 M-18,6 V10 M18,6 V10"/>' };

  // poste de aluminio/madera del porch o lanai
  S.post8 = { name: 'Column / Post 8×8', cat: 'site', layer: 'furniture', w: 8, h: 8,
    svg: R(-4, -4, 8, 8) + L(-4, -4, 4, 4) + L(-4, 4, 4, -4) };

  // spa octogonal pegado a la piscina (como el del plano)
  S.spa = { name: 'Spa / Hot Tub 7 ft', cat: 'site', layer: 'furniture', bg: 'ellipse', w: 84, h: 84,
    svg: (function () {
      function oct(r) {
        var d = '', i, a;
        for (i = 0; i < 8; i++) { a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          d += (i ? ' L' : 'M') + (r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1); }
        return '<path d="' + d + ' Z"/>';
      }
      return oct(42) + oct(34) + C(0, 0, 3);
    })() };

  // estante con barra de closet (línea del estante + barra discontinua)
  S.shelfrod = { name: 'Closet Shelf & Rod 48"', cat: 'furniture', layer: 'furniture', w: 48, h: 12,
    svg: R(-24, -6, 48, 12) +
      '<line x1="-24" y1="2" x2="24" y2="2" stroke-dasharray="4 3"/>' };

  // grosores de línea afinados por categoría (los alzados van más finos y refinados)
  Object.keys(S).forEach(function (k) {
    var c = S[k].cat;
    if (c === 'elev') S[k].lw = 0.55;
    else if (c === 'furniture' || c === 'plumbing') S[k].lw = 0.75;
    else if (c === 'site') S[k].lw = 0.7;
  });

  window.SYMBOLS = S;


  /* ===================================================================
   * COCINA EXTERIOR / SUMMER KITCHEN (Edgar, 08/30). En Florida casi todo
   * lanai lleva una: grill de gas empotrado, wine cooler, ice maker y su
   * nevera bajo mostrador. Todo esto son CARGAS del plano eléctrico —
   * receptáculos GFCI/WR y circuitos dedicados — así que van dibujados a
   * medida real, con la medida en el nombre para el takeoff.
   * El quemador de GAS se dibuja distinto al eléctrico a propósito: la
   * hornilla eléctrica es un círculo liso (la resistencia); la de gas lleva
   * su parrilla en cruz, que es como se marca en el plano de mecánica.
   * =================================================================== */
  function gasBurner(cx, cy, r) {
    var out = C(cx, cy, r) + C(cx, cy, r * 0.40);
    for (var i = 0; i < 4; i++) {
      var a = Math.PI / 4 + i * Math.PI / 2;
      out += L(+(cx + Math.cos(a) * r * 0.40).toFixed(2), +(cy + Math.sin(a) * r * 0.40).toFixed(2),
               +(cx + Math.cos(a) * r).toFixed(2), +(cy + Math.sin(a) * r).toFixed(2), 0.5);
    }
    return out;
  }
  // parrilla: barras paralelas dentro de la caja de coccion
  function parrilla(x, y, w, h, n) {
    var out = '', paso = h / (n + 1);
    for (var i = 1; i <= n; i++) out += L(x, +(y + paso * i).toFixed(2), x + w, +(y + paso * i).toFixed(2), 0.5);
    return out;
  }

  S.range_gas = { name: 'Gas Range 30" (cocina de gas)', short: 'Gas Range',
    cat: 'outdoor', layer: 'furniture', w: 32, h: 30,
    svg: R(-15, -14, 30, 28) +
      gasBurner(-7.5, -7, 4.4) + gasBurner(7.5, -7, 4.4) +
      gasBurner(-7.5, 4, 3.6) + gasBurner(7.5, 4, 3.6) +
      L(-15, 9, 15, 9, 0.6) + T(0, 12.6, 4.2, 'GAS') };

  S.cooktop_gas36 = { name: 'Gas Cooktop 36" (5 quemadores)', short: 'Gas Cooktop',
    cat: 'outdoor', layer: 'furniture', w: 38, h: 26,
    svg: R(-18, -12, 36, 24) +
      gasBurner(-11, -5.5, 4) + gasBurner(11, -5.5, 4) +
      gasBurner(-11, 3.5, 3.4) + gasBurner(11, 3.5, 3.4) + gasBurner(0, -1, 4.6) +
      L(-18, 7.5, 18, 7.5, 0.6) + T(0, 10.9, 4.2, 'GAS') };

  S.grill_bbq32 = { name: 'BBQ Grill 32" (gas, empotrado)', short: 'Grill 32',
    cat: 'outdoor', layer: 'furniture', w: 34, h: 26,
    svg: R(-17, -13, 34, 26, 1.5) +
      R(-14.5, -10.5, 29, 16) + parrilla(-14.5, -10.5, 29, 16, 6) +
      L(-17, 7, 17, 7, 0.6) +                       // banda de mandos
      C(-14, 10, 1.4) + C(14, 10, 1.4) +
      T(0, 11.4, 4, 'BBQ GAS') };

  S.grill_bbq42 = { name: 'BBQ Grill 42" (gas, empotrado)', short: 'Grill 42',
    cat: 'outdoor', layer: 'furniture', w: 44, h: 28,
    svg: R(-22, -14, 44, 28, 1.5) +
      R(-19, -11.5, 38, 17.5) + parrilla(-19, -11.5, 38, 17.5, 7) +
      L(-22, 7.5, 22, 7.5, 0.6) +
      C(-18.5, 10.8, 1.4) + C(-13, 10.8, 1.4) + C(13, 10.8, 1.4) + C(18.5, 10.8, 1.4) +
      T(0, 12.2, 4.2, 'BBQ GAS') };

  S.side_burner = { name: 'Side Burner 12" (gas)', short: 'Side Burner',
    cat: 'outdoor', layer: 'furniture', w: 14, h: 22,
    svg: R(-7, -11, 14, 22, 1) + gasBurner(0, -3, 4.6) + L(-7, 5, 7, 5, 0.6) + T(0, 9, 4.2, 'GAS') };

  S.kamado = { name: 'Kamado / Egg Grill 22" (carbón)', short: 'Kamado',
    cat: 'outdoor', layer: 'furniture', bg: 'ellipse', w: 26, h: 26,
    svg: C(0, 0, 12) + C(0, 0, 9.5) + C(0, 0, 2.2) +
      L(-9.5, 0, -12, 0, 0.6) + L(9.5, 0, 12, 0, 0.6) };

  S.pizza_oven = { name: 'Pizza Oven 30" (exterior)', short: 'Pizza Oven',
    cat: 'outdoor', layer: 'furniture', w: 32, h: 30,
    svg: R(-15, -14, 30, 28, 2) +
      '<path d="M-10,14 L-10,3 A10,10 0 0 1 10,3 L10,14" fill="none"/>' +
      T(0, -8.5, 5, 'PIZZA') };

  S.wine_cooler = { name: 'Wine Cooler 24" (bajo mostrador)', short: 'Wine',
    cat: 'outdoor', layer: 'furniture', w: 25, h: 25,
    svg: R(-12, -12, 24, 24) +
      L(-12, -5, 12, -5, 0.5) + L(-12, 1, 12, 1, 0.5) + L(-12, 7, 12, 7, 0.5) +
      T(0, -7.2, 5, 'WINE') };

  S.ice_maker = { name: 'Ice Maker 15" (bajo mostrador)', short: 'Ice',
    cat: 'outdoor', layer: 'furniture', w: 16, h: 25,
    svg: R(-7.5, -12, 15, 24) +
      R(-4.5, -8, 4, 4) + R(0.5, -3.5, 4, 4) + R(-4.5, 1, 4, 4) +
      L(-7.5, 6.5, 7.5, 6.5, 0.6) + T(0, 10.6, 4.6, 'ICE') };

  S.fridge_under = { name: 'Outdoor Fridge 24" (bajo mostrador)', short: 'Fridge U/C',
    cat: 'outdoor', layer: 'furniture', w: 25, h: 25,
    svg: R(-12, -12, 24, 24) + L(-12, 6, 12, 6, 0.6) + T(0, -2, 5.5, 'REF') };

  S.kegerator = { name: 'Kegerator 24" (barril)', short: 'Keg',
    cat: 'outdoor', layer: 'furniture', w: 25, h: 25,
    svg: R(-12, -12, 24, 24) + C(0, -1, 7) + C(0, -1, 5) +
      L(0, -8, 0, -12, 0.8) + L(-12, 6, 12, 6, 0.6) + T(0, 10.2, 4.6, 'KEG') };

  S.bar_sink = { name: 'Bar Sink 15" (cocina exterior)', short: 'Bar Sink',
    cat: 'outdoor', layer: 'furniture', w: 17, h: 19,
    svg: R(-8, -9, 16, 18, 1) + R(-5.5, -4, 11, 11, 1) + C(0, -6.5, 1.1) };

  S.hood_outdoor = { name: 'Vent Hood 36" (sobre el grill)', short: 'Hood',
    cat: 'outdoor', layer: 'furniture', bg: 'none', w: 38, h: 26,
    svg: '<rect x="-18" y="-12" width="36" height="24" stroke-dasharray="4 3" fill="none"/>' +
      '<line x1="-18" y1="-12" x2="18" y2="12" stroke-width="0.5" stroke-dasharray="4 3"/>' +
      '<line x1="18" y1="-12" x2="-18" y2="12" stroke-width="0.5" stroke-dasharray="4 3"/>' +
      '<rect x="-11" y="-4.5" width="22" height="9" fill="#fbfaf7" stroke="none"/>' +
      T(0, 2, 5.5, 'HOOD') };

  S.outdoor_tv = { name: 'Outdoor TV 55" (lanai)', short: 'TV',
    cat: 'outdoor', layer: 'furniture', bg: 'none', w: 50, h: 8,
    svg: R(-24, -3, 48, 6) + T(0, -5, 5, 'TV') };


  /* ===================================================================
   * LUTRON (Edgar, 08/30). En las casas de Florida que llevan control de
   * iluminación esto es lo que se especifica, y en el plano tiene que
   * distinguirse del switch normal: un KEYPAD manda escenas por radio, un
   * PICO no lleva cable ninguno —va pegado a la pared o en su pedestal— y
   * el REPETIDOR es el que necesita su tomacorriente. Si el inspector ve
   * una "S" donde va un Pico, cuenta un circuito que no existe.
   * =================================================================== */
  /* EN PLANTA SE DIBUJA COMO SWITCH, NO COMO EL APARATO (Edgar, 30/08:
     "créamelos no para planos verticales o 3D o frontales; créamelos como el
     símbolo de S, quizás con KP que signifique keypad, o con PICO"). Tenía
     razón: lo que yo había dibujado era el FRENTE del aparato —la carátula
     con sus botoncitos— y eso es una vista de elevación. En planta se ve el
     techo cortado a 4 pies: de un keypad no se ve la carátula, se ve dónde
     está. Por eso todo el oficio usa la "S" con su subíndice, y ahí es donde
     tienen que estar éstos para que se lean con los demás.
     El subíndice va en INGLÉS del oficio: KP4, PICO, LUT, FS. */
  // geometría de la "S" con subíndice: la misma separación de siempre
  // (S3, SDM, SWP), pero el conjunto CENTRADO en el punto que se marca. Sin
  // centrarlo, un subíndice largo como PICO-T se salía de la caja del
  // símbolo y en la paleta salía cortado.
  function geoSub(sub) {
    var n = String(sub).length;
    var off = n <= 1 ? 2 : (n === 2 ? 3 : (n === 3 ? 4 : 5));
    var tam = n <= 1 ? 7 : (n <= 3 ? 6.5 : 6);
    var xS = -off, xSub = 7.5 - off, wsub = n * tam * 0.58;
    var izq = xS - 4.5, der = xSub + wsub;
    var d = -(izq + der) / 2;
    return { xS: +(xS + d).toFixed(2), xSub: +(xSub + d).toFixed(2), tam: tam, w: Math.ceil(der - izq) + 3 };
  }
  function swSub(sub) {
    var g = geoSub(sub);
    return T(g.xS, 5, 14, 'S', { italic: true, bold: true }) +
      T(g.xSub, 8, g.tam, sub, { anchor: 'start' });
  }
  function anchoSub(sub) { return geoSub(sub).w; }
  function swLutron(clave, nombre, corto, sub) {
    S[clave] = { name: nombre, short: corto, cat: 'lutron', layer: 'electrical',
      w: anchoSub(sub), h: 16, svg: swSub(sub) };
  }

  swLutron('lut_kp2', 'Lutron Keypad 2 botones', 'Lutron KP2', 'KP2');
  swLutron('lut_kp4', 'Lutron Keypad 4 botones', 'Lutron KP4', 'KP4');
  swLutron('lut_kp5', 'Lutron Keypad 5 botones', 'Lutron KP5', 'KP5');
  swLutron('lut_kp6', 'Lutron Keypad 6 botones', 'Lutron KP6', 'KP6');
  // PICO: no lleva caja ni cable. Va con su propio subíndice para que nadie
  // le cuente un circuito — no es un switch, es un mando por radio.
  swLutron('lut_pico', 'Lutron Pico Remote (pared, inalámbrico)', 'Pico', 'PICO');
  swLutron('lut_pico_ped', 'Lutron Pico + pedestal (mesa)', 'Pico ped.', 'PICO-T');
  swLutron('lut_dim', 'Lutron Dimmer (Sunnata / Maestro)', 'Lutron Dim', 'LUT');
  swLutron('lut_fan', 'Lutron Fan Speed Control', 'Lutron Fan', 'FS');
  swLutron('lut_occ', 'Lutron Radio Powr Savr (ocupación, inalámbrico)', 'Lutron OCC', 'OS');

  /* Estos tres NO son switches: son EQUIPO. En planta el equipo se dibuja
     como una caja con su rótulo, igual que el panel o el subpanel. */
  S.lut_rep = { name: 'Lutron Main Repeater / Hub (necesita receptáculo)', short: 'Lutron RPT',
    cat: 'lutron', layer: 'electrical', w: 22, h: 16,
    svg: R(-10, -6, 20, 12) + T(0, 2.6, 6.5, 'RPT', { bold: true }) };

  S.lut_panel = { name: 'Lutron Power Panel / QS (casa grande)', short: 'Lutron Panel',
    cat: 'lutron', layer: 'electrical', w: 26, h: 20,
    svg: R(-12, -8, 24, 16) + L(-12, -2, 12, -2) +
      T(0, -3.6, 4.6, 'LUTRON', { bold: true }) + T(0, 5, 6, 'QS', { bold: true }) };

  // la shade SÍ se ve en planta: es el rodillo sobre la ventana
  S.lut_shade = { name: 'Lutron Shade (motorizada)', short: 'Lutron Shade',
    cat: 'lutron', layer: 'electrical', w: 40, h: 14,
    svg: R(-18, -5, 36, 4, 0.8) +
      '<path d="M-18,-1 L-18,3 M18,-1 L18,3" fill="none" stroke-width="0.7"/>' +
      T(0, 10, 5.5, 'SHADE', { bold: true }) };

  /* GROSOR DE LÍNEA POR FAMILIA (Edgar, 30/08, con foto del meter: "¿puede
     ser que las líneas del meter y de todos en general sean más finitas?").
     Tenía razón y era consecuencia directa de haberlos puesto a medida real:
     el trazo es de 1 pulgada de MUNDO y no cambia con el tamaño del símbolo.
     En una caja de 28" eso era el 3½% del ancho; en el meter de 12" pasó a
     ser el 8%, y el símbolo salió engordado —el disco parecía un anillo
     macizo y el "kWh" no se leía—. Ahora cada familia lleva su grosor de
     dibujante, proporcional a lo que mide de verdad. */
  Object.keys(S).forEach(function (k) {
    var d = S[k];
    if (d.lw != null) return;                      // el que ya trae el suyo, se respeta
    if (d.cat === 'riser') d.lw = 0.4;             // cajas chicas a medida real
    else if (d.layer === 'furniture') d.lw = 0.7;  // muebles y equipo grande
  });

  window.SYMBOL_CATS = {
    electrical: '⚡ Electrical',
    riser: '🔌 Riser / One-line',
    elev: '🗄 Elevation / Cabinets',
    plumbing: '🚿 Plumbing / Appliances',
    furniture: '🛋 Furniture',
    lutron: '🎛 Lutron / Control',
    outdoor: '🔥 Outdoor Kitchen',
    site: '🌴 Site'
  };
})();
