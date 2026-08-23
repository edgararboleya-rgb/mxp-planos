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

  S.riser_meter = { name: 'Meter Can', short: 'Meter', cat: 'riser', layer: 'electrical', w: 44, h: 64,
    svg: R(-21, -31, 42, 62) + C(0, -14, 11) + T(0, -11.5, 6.5, 'kWh') + L(-21, 2, 21, 2) + T(0, 14, 6.5, 'METER', { bold: true }) };

  S.riser_panel = { name: 'Panel / Load Center', short: 'Panel', cat: 'riser', layer: 'electrical', w: 44, h: 64,
    svg: R(-21, -31, 42, 62) + L(0, -24, 0, -6, 1.4) + T(0, 8, 7, 'PANEL', { bold: true }) + T(0, 18, 5.5, '120/240V') };

  S.riser_disc = { name: 'Disconnect / Safety Switch', short: 'Disconnect', cat: 'riser', layer: 'electrical', w: 40, h: 48,
    svg: R(-19, -23, 38, 46) + L(-8, -2, 6, -14, 1.4) + C(-8, -2, 1.6, ' fill="#14161a"') + C(8, -14, 1.6, ' fill="#14161a"') + T(0, 12, 6, 'DISC', { bold: true }) };

  S.riser_ats = { name: 'ATS (Transfer Switch)', short: 'ATS', cat: 'riser', layer: 'electrical', w: 44, h: 56,
    svg: R(-21, -27, 42, 54) + T(0, -8, 8, 'ATS', { bold: true }) + L(-10, 2, 0, 12, 1.2) + L(0, 12, 10, 2, 1.2) + C(-10, 2, 1.5, ' fill="#14161a"') + C(10, 2, 1.5, ' fill="#14161a"') + C(0, 12, 1.5, ' fill="#14161a"') };

  S.riser_gen = { name: 'Standby Generator', short: 'Generator', cat: 'riser', layer: 'electrical', w: 44, h: 52,
    svg: R(-21, -25, 42, 50) + C(0, -4, 12) + T(0, 0.5, 12, 'G', { bold: true }) + T(0, 18, 5.5, 'GEN') };

  S.riser_ev = { name: 'EV Charger', short: 'EV', cat: 'riser', layer: 'electrical', w: 38, h: 48,
    svg: R(-18, -23, 36, 46) + T(0, -2, 9, 'EV', { bold: true }) + '<path d="M-3,2 L2,2 L-1,12 L6,4 L1,4 L4,-4" fill="none" stroke-width="1.1"/>' };

  S.riser_xfmr = { name: 'Transformer', short: 'Transformer', cat: 'riser', layer: 'electrical', w: 34, h: 52,
    svg: C(0, -10, 10) + C(0, 6, 10) + T(0, 24, 5.5, 'XFMR') };

  S.riser_ct = { name: 'CT Cabinet', short: 'CT Cabinet', cat: 'riser', layer: 'electrical', w: 44, h: 44,
    svg: R(-21, -21, 42, 42) + T(0, 2.5, 8, 'CT', { bold: true }) };

  S.riser_wh = { name: 'Weatherhead / Service Drop', short: 'Weatherhead', cat: 'riser', layer: 'electrical', w: 26, h: 56,
    svg: '<path d="M0,26 L0,-14" stroke-width="1.6"/>' + '<path d="M0,-14 Q0,-26 12,-24" stroke-width="1.4"/>' + L(-7, -18, 7, -24, 0.8) };

  S.riser_ground = { name: 'Ground Rods (2)', short: 'Ground Rods', cat: 'riser', layer: 'electrical', w: 90, h: 46,
    svg: (function () {
      function rod(x) {
        return L(x, -18, x, 6, 1.2) +
          L(x - 7, 6, x + 7, 6, 1.4) + L(x - 4.5, 10, x + 4.5, 10, 1.2) + L(x - 2, 14, x + 2, 14, 1);
      }
      return rod(-30) + rod(30) + L(-30, -18, 30, -18, 1) + T(0, -23, 5.5, "6'-0\" MIN.");
    })() };

  S.riser_spd = { name: 'Surge Protector (SPD)', short: 'SPD', cat: 'riser', layer: 'electrical', w: 30, h: 36,
    svg: R(-14, -17, 28, 34) + T(0, 2.5, 6.5, 'SPD', { bold: true }) };

  S.riser_gnd_sym = { name: 'Ground Symbol', short: 'Ground', cat: 'riser', layer: 'electrical', w: 18, h: 22,
    svg: L(0, -10, 0, 0, 1.2) + L(-8, 0, 8, 0, 1.4) + L(-5, 4, 5, 4, 1.2) + L(-2, 8, 2, 8, 1) };

  /* ============================ PLOMERÍA / EQUIPOS ============================ */

  S.toilet = { name: 'Toilet', cat: 'plumbing', layer: 'furniture', w: 22, h: 30,
    svg: R(-10, -14.5, 20, 7.5, 1.5) + '<ellipse cx="0" cy="2.5" rx="8" ry="9.5"/>' };

  S.lavatory = { name: 'Vanity Sink', cat: 'plumbing', layer: 'furniture', w: 26, h: 22,
    svg: R(-13, -10.5, 26, 21) + '<ellipse cx="0" cy="0.5" rx="7.5" ry="5.5"/>' + C(0, -7, 1) };

  S.sink_pedestal = { name: 'Pedestal Sink', cat: 'plumbing', layer: 'furniture', w: 22, h: 20,
    svg: '<ellipse cx="0" cy="0" rx="10" ry="8.5"/>' + '<ellipse cx="0" cy="0.5" rx="6.5" ry="5"/>' + C(0, -5.5, 1) };

  S.kitchen_sink = { name: 'Double Kitchen Sink', cat: 'plumbing', layer: 'furniture', w: 34, h: 23,
    svg: R(-16.5, -11, 33, 22) + R(-14, -8, 12.5, 16, 1.5) + R(1.5, -8, 12.5, 16, 1.5) + C(0, -9.2, 1) };

  S.tub = { name: 'Bathtub 60"', cat: 'plumbing', layer: 'furniture', w: 62, h: 32,
    svg: R(-30, -15, 60, 30, 3) + R(-26.5, -11.5, 53, 23, 9) + C(-21, 0, 1.6) };

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

  S.tree_lg = { name: 'Tree (10 ft canopy)', cat: 'site', layer: 'furniture', w: 124, h: 124,
    svg: scallop(60, 14) + C(0, 0, 2, ' fill="#14161a"') };

  S.tree_md = { name: 'Tree (6 ft canopy)', cat: 'site', layer: 'furniture', w: 76, h: 76,
    svg: scallop(36, 11) + C(0, 0, 1.8, ' fill="#14161a"') };

  S.shrub = { name: 'Shrub', cat: 'site', layer: 'furniture', w: 40, h: 40,
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

  // grosores de línea afinados por categoría (los alzados van más finos y refinados)
  Object.keys(S).forEach(function (k) {
    var c = S[k].cat;
    if (c === 'elev') S[k].lw = 0.55;
    else if (c === 'furniture' || c === 'plumbing') S[k].lw = 0.75;
    else if (c === 'site') S[k].lw = 0.7;
  });

  window.SYMBOLS = S;

  window.SYMBOL_CATS = {
    electrical: '⚡ Electrical',
    riser: '🔌 Riser / One-line',
    elev: '🗄 Elevation / Cabinets',
    plumbing: '🚿 Plumbing / Appliances',
    furniture: '🛋 Furniture',
    site: '🌴 Site'
  };
})();
