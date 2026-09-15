/* MXP Planos — NEC para el takeoff: llenado de tubo y ajuste por conductores.

   Lo que Edgar pidió (15/09): «que me permita escoger qué cable y qué tubería
   voy a coger, y que si pongo cable 12 me deje seleccionar 3/4 o media, pero
   siempre por el código de la cantidad de cables y del llenado; y que si
   selecciono cable 6 ya no me deje media porque no cabe. Máximo 6 hot sin
   contar el ground, para cumplir con el 80 %.»

   Dos reglas distintas del NEC, y las dos van aquí:

   1) LLENADO — Capítulo 9, Tabla 1: con 3 o más conductores el tubo se
      llena al 40 % de su área interior; con 2, al 31 %; con 1, al 53 %.
      Las áreas del tubo son la Tabla 4 y las del conductor la Tabla 5
      (THHN/THWN). Nota 7 del capítulo: si al dividir sale decimal ≥ 0,8 se
      redondea hacia arriba (por eso 1" EMT admite 26 #12 y no 25).

   2) AJUSTE POR AGRUPAMIENTO — 310.15(C)(1): con más de 3 conductores que
      llevan corriente en el mismo tubo, la ampacidad se ajusta: 4–6 → 80 %,
      7–9 → 70 %, 10–20 → 50 %. Ese «80 %» es el de Edgar: con hasta 6
      portadores se queda en el primer escalón; el séptimo baja a 70 % y ya
      hay que subir de calibre. La tierra NO cuenta (310.15(E)(3)); el neutro
      compartido de un circuito multihilo 120/240 tampoco (310.15(E)(1)).

   Comprobado contra el Anexo C del NEC en tools/prueba-nec.js: 1/2" EMT
   admite 9 #12 THHN, 3/4" 16, 1" 26. Si alguien cambia una tabla y eso deja
   de dar, la prueba lo dice.

   Esto ayuda a contar; no sustituye al inspector ni al ingeniero. */
(function (raiz) {
  'use strict';

  /* Tabla 5 — área aproximada del conductor con aislamiento, in². COBRE, tal
     como lo compra Edgar (su catálogo, 15/09): THHN/THWN del #14 al 4/0 y
     **THW** del 250 al 600 MCM (el THW es más gordo que el THHN: 250 MCM THW
     0,4877 contra 0,3970 — se usa el que se compra, no el más cómodo). */
  var CONDUCTOR = {
    '#14': 0.0097, '#12': 0.0133, '#10': 0.0211, '#8': 0.0366, '#6': 0.0507,
    '#4': 0.0824, '#3': 0.0973, '#2': 0.1158, '#1': 0.1562,
    '1/0': 0.1855, '2/0': 0.2223, '3/0': 0.2679, '4/0': 0.3237,
    '250': 0.4877, '300': 0.5581, '350': 0.6291, '400': 0.6969, '500': 0.8316, '600': 0.9729
  };
  // en orden de calibre (Object.keys pondría los MCM delante por ser números)
  var CALIBRES = ['#14', '#12', '#10', '#8', '#6', '#4', '#3', '#2', '#1', '1/0', '2/0', '3/0', '4/0', '250', '300', '350', '400', '500', '600'];
  /* Tabla 5A — ALUMINIO COMPACTO XHHW, in² (lo que Edgar compra para feeders
     grandes: «# 1/0 XHHW STRANDED ALUMINUM COMPACT»). Solo del 1/0 al 600. */
  var CONDUCTOR_AL = {
    '1/0': 0.1590, '2/0': 0.1885, '3/0': 0.2290, '4/0': 0.2780,
    '250': 0.3525, '300': 0.4071, '350': 0.4656, '400': 0.5216, '500': 0.6151, '600': 0.7620
  };
  var CALIBRES_AL = ['1/0', '2/0', '3/0', '4/0', '250', '300', '350', '400', '500', '600'];
  function areaConductor(calibre, mat) { return (mat === 'AL' ? CONDUCTOR_AL : CONDUCTOR)[calibre]; }

  /* Tabla 4 — área interior TOTAL del tubo, in². Por tipo y tamaño. */
  /* Los tipos y tamaños son LOS QUE EDGAR COMPRA (su catálogo, 15/09): EMT
     ½–4, PVC Sch 40 ½–6, PVC Sch 80 ½–5, GRS ½–6, ENT ½–1½, flex metálico
     ⅜–3. El IMC lo pidió igual «con las mismas medidas», ½–4. */
  var TUBO = {
    EMT:   { '1/2"': 0.304, '3/4"': 0.533, '1"': 0.864, '1-1/4"': 1.496, '1-1/2"': 2.036, '2"': 3.356, '2-1/2"': 5.858, '3"': 8.846, '3-1/2"': 11.545, '4"': 14.753 },
    PVC40: { '1/2"': 0.285, '3/4"': 0.508, '1"': 0.832, '1-1/4"': 1.453, '1-1/2"': 1.986, '2"': 3.291, '2-1/2"': 4.695, '3"': 7.268, '3-1/2"': 9.737, '4"': 12.554, '5"': 19.761, '6"': 28.567 },
    PVC80: { '1/2"': 0.217, '3/4"': 0.409, '1"': 0.688, '1-1/4"': 1.237, '1-1/2"': 1.711, '2"': 2.874, '2-1/2"': 4.119, '3"': 6.442, '3-1/2"': 8.688, '4"': 11.258, '5"': 17.855 },
    GRS:   { '1/2"': 0.314, '3/4"': 0.549, '1"': 0.887, '1-1/4"': 1.526, '1-1/2"': 2.071, '2"': 3.408, '2-1/2"': 4.866, '3"': 7.499, '3-1/2"': 10.010, '4"': 12.882, '5"': 20.212, '6"': 29.158 },
    IMC:   { '1/2"': 0.342, '3/4"': 0.586, '1"': 0.959, '1-1/4"': 1.647, '1-1/2"': 2.225, '2"': 3.630, '2-1/2"': 5.135, '3"': 7.922, '3-1/2"': 10.584, '4"': 13.631 },
    ENT:   { '1/2"': 0.285, '3/4"': 0.508, '1"': 0.832, '1-1/4"': 1.453, '1-1/2"': 1.986 },
    FMC:   { '3/8"': 0.116, '1/2"': 0.317, '3/4"': 0.533, '1"': 0.817, '1-1/4"': 1.277, '1-1/2"': 1.858, '2"': 3.269, '2-1/2"': 4.909, '3"': 7.069 }
  };
  var TUBO_NOM = { EMT: 'EMT', PVC40: 'PVC Sch 40', PVC80: 'PVC Sch 80', GRS: 'GRS (rígido)', IMC: 'IMC', ENT: 'ENT (Smurf tube)', FMC: 'Flex metal conduit' };
  var TAMANOS = ['3/8"', '1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '3-1/2"', '4"', '5"', '6"'];

  /* Tabla 1: qué parte del tubo se puede llenar según cuántos conductores. */
  function pctPermitido(n) { return n <= 0 ? 0 : n === 1 ? 0.53 : n === 2 ? 0.31 : 0.40; }

  function areaDe(calibre, n, mat) { var a = areaConductor(calibre, mat); return a ? a * n : NaN; }

  /* 250.122 — la tierra (EGC) según el breaker que protege el circuito, en
     COBRE. Edgar (15/09): «el ground va seleccionado aparte, con la medida
     que queramos: con cable 6 quizás necesitamos ground 8, no 6». Esto da la
     del código como punto de partida; él la cambia si quiere. */
  var TIERRA_250_122 = [[15, '#14'], [20, '#12'], [60, '#10'], [100, '#8'], [200, '#6'], [300, '#4'], [400, '#3'], [500, '#2'], [600, '#1'], [800, '1/0'], [1000, '2/0'], [1200, '3/0'], [1600, '4/0'], [2000, '250']];
  function tierraPorAmps(amps) {
    var a = Number(amps) || 0;
    for (var i = 0; i < TIERRA_250_122.length; i++) if (a <= TIERRA_250_122[i][0]) return TIERRA_250_122[i][1];
    return TIERRA_250_122[TIERRA_250_122.length - 1][1];
  }
  /* Para un feeder no se sabe el breaker desde el plano: se toma la ampacidad
     a 75 °C del conductor de fase (Tabla 310.16) como si el breaker fuera ese,
     y de ahí 250.122. Cobre THHN/THW y aluminio XHHW compacto. */
  var AMP_75_CU = { '#14': 20, '#12': 25, '#10': 35, '#8': 50, '#6': 65, '#4': 85, '#3': 100, '#2': 115, '#1': 130, '1/0': 150, '2/0': 175, '3/0': 200, '4/0': 230, '250': 255, '300': 285, '350': 310, '400': 335, '500': 380, '600': 420 };
  var AMP_75_AL = { '1/0': 120, '2/0': 135, '3/0': 155, '4/0': 180, '250': 205, '300': 230, '350': 250, '400': 270, '500': 310, '600': 340 };
  function ampacidad(calibre, mat) { return (mat === 'AL' ? AMP_75_AL : AMP_75_CU)[calibre] || 0; }
  function tierraPorFase(calibre, mat) { return tierraPorAmps(ampacidad(calibre, mat)); }

  /* Llenado con hilos de DISTINTO calibre (fases de un calibre, tierra de
     otro): la suma de áreas contra el % de la Tabla 1 según el total de
     hilos. `grupos` = [{calibre, n, mat}]. */
  function llenadoMixto(tipo, tam, grupos) {
    var t = TUBO[tipo], area = t && t[tam];
    if (!area) return null;
    var usado = 0, n = 0;
    for (var i = 0; i < grupos.length; i++) {
      var g = grupos[i]; if (!(g.n > 0)) continue;
      var a = areaConductor(g.calibre, g.mat); if (!a) return null;
      usado += a * g.n; n += g.n;
    }
    if (!(n > 0)) return null;
    var pct = pctPermitido(n), maxArea = area * pct;
    return { tipo: tipo, tam: tam, n: n, area: area, usado: usado, pctPermitido: pct, pct: usado / area, cabe: usado <= maxArea + 1e-9 };
  }
  function tamanoMinimoMixto(tipo, grupos) {
    var t = TUBO[tipo]; if (!t) return null;
    for (var i = 0; i < TAMANOS.length; i++) {
      var tam = TAMANOS[i], ll = t[tam] && llenadoMixto(tipo, tam, grupos);
      if (ll && ll.cabe) return tam;
    }
    return null;
  }
  function tamanosQueCabenMixto(tipo, grupos) {
    var t = TUBO[tipo]; if (!t) return [];
    return TAMANOS.filter(function (tam) { var ll = t[tam] && llenadoMixto(tipo, tam, grupos); return !!(ll && ll.cabe); });
  }

  /* ¿Cabe? Devuelve el detalle, no solo sí/no: Edgar quiere ver el %.
     `mat`: 'CU' (por defecto) o 'AL' (aluminio compacto XHHW). */
  function llenado(tipo, tam, calibre, n, mat) {
    var t = TUBO[tipo], area = t && t[tam];
    if (!area || !areaConductor(calibre, mat) || !(n > 0)) return null;
    var usado = areaDe(calibre, n, mat), pct = pctPermitido(n), maxArea = area * pct;
    return { tipo: tipo, tam: tam, calibre: calibre, mat: mat || 'CU', n: n, area: area, usado: usado,
             pctPermitido: pct, pct: usado / area, cabe: usado <= maxArea + 1e-9 };
  }
  /* Cuántos conductores de un calibre caben (todos iguales), con la Nota 7. */
  function maxConductores(tipo, tam, calibre, mat) {
    var t = TUBO[tipo], area = t && t[tam], c = areaConductor(calibre, mat);
    if (!area || !c) return 0;
    // la Nota 7 (decimal ≥ 0,8 redondea arriba) vale en las TRES filas de la
    // Tabla 1: 1/2" EMT con #6 da 1,86 al 31 % y el Anexo C dice 2
    function n7(q) { var n = Math.floor(q); return (q - n >= 0.8) ? n + 1 : n; }
    var n3 = n7((area * 0.40) / c);
    if (n3 >= 3) return n3;
    if (n7((area * 0.31) / c) >= 2) return 2;
    if (n7((area * 0.53) / c) >= 1) return 1;
    return 0;
  }
  /* El tamaño MÁS CHICO de ese tipo de tubo en que caben n conductores. */
  function tamanoMinimo(tipo, calibre, n, mat) {
    var t = TUBO[tipo]; if (!t) return null;
    for (var i = 0; i < TAMANOS.length; i++) {
      var tam = TAMANOS[i], ll = t[tam] && llenado(tipo, tam, calibre, n, mat);
      if (ll && ll.cabe) return tam;
    }
    return null;
  }
  /* Los tamaños que valen para ese calibre y esa cantidad (del mínimo para arriba). */
  function tamanosQueCaben(tipo, calibre, n, mat) {
    var t = TUBO[tipo]; if (!t) return [];
    return TAMANOS.filter(function (tam) { var ll = t[tam] && llenado(tipo, tam, calibre, n, mat); return !!(ll && ll.cabe); });
  }

  /* 310.15(C)(1): el ajuste por más de 3 portadores. Devuelve el factor. */
  function ajuste(portadores) {
    if (portadores <= 3) return 1;
    if (portadores <= 6) return 0.8;
    if (portadores <= 9) return 0.7;
    if (portadores <= 20) return 0.5;
    if (portadores <= 30) return 0.45;
    if (portadores <= 40) return 0.40;
    return 0.35;
  }
  var MAX_PORTADORES = 6;   // el tope de Edgar: no bajar del 80 %

  /* Cuántos hilos van en el tubo según cómo se arme el homerun.
       ckts  → cuántos circuitos comparten el tubo
       polos → 1 (120 V), 2 (240 V), 3 (3Ø)
       neutro→ 'propio' (uno por circuito), 'compartido' (multihilo: uno cada
               dos fases opuestas), 'ninguno' (240 V puro)
       tierra→ true/false: UNA por tubo, como manda 250.122 (una tierra sirve
               a todos los circuitos del mismo tubo)
     Devuelve hots, neutros, tierras, el total y los que LLEVAN corriente
     (para el ajuste): la tierra nunca; el neutro compartido de un multihilo
     120/240 tampoco (310.15(E)(1)); los demás neutros sí. */
  function hilos(ckts, polos, neutro, tierra) {
    var c = Math.max(1, Math.round(Number(ckts) || 1)), p = Math.max(1, Math.min(3, Math.round(Number(polos) || 1)));
    var hot = c * p, neu = 0, neuPortador = 0;
    if (neutro === 'ninguno') neu = 0;
    else if (neutro === 'compartido' && p === 1) { neu = Math.ceil(c / 2); neuPortador = c % 2; }   // el impar se queda con neutro propio
    else if (neutro === 'compartido' && p === 3) { neu = c; neuPortador = c; }   // 3Ø 4 hilos con cargas no lineales: cuenta (310.15(E)(3))
    else { neu = c; neuPortador = c; }
    var gnd = tierra === false ? 0 : 1;
    var portadores = hot + neuPortador;
    return { hot: hot, neu: neu, gnd: gnd, total: hot + neu + gnd, portadores: portadores,
             ajuste: ajuste(portadores), pasa: portadores <= MAX_PORTADORES };
  }
  /* Cuántos circuitos caben en un tubo sin pasar de 6 portadores. */
  function maxCkts(polos, neutro) {
    for (var c = 12; c >= 1; c--) if (hilos(c, polos, neutro, true).portadores <= MAX_PORTADORES) return c;
    return 1;
  }

  /* Los nombres con que esto llega al estimador. El tubo por su item del
     catálogo (con el nombre que Supabase tiene); el hilo por el alias
     '#12 THHN CU', que el estimador convierte de FT a MLF. */
  /* El PVC Sch 40 de Edgar tiene un nombre distinto casi por tamaño («CONDUIT
     SCH», «CONDUIT. SCH», «CONDUIT.SCH», «CONDUIT .SCH», y el 2-1/2 con
     espacio). No se le corrige el catálogo desde aquí: se le habla con el
     nombre exacto que tiene cada uno. La prueba comprueba los doce. */
  var PVC40_NOM = {
    '1/2"': '1/2" PVC CONDUIT SCH 40', '3/4"': '3/4" PVC CONDUIT. SCH 40', '1"': '1" PVC CONDUIT. SCH 40',
    '1-1/4"': '1-1/4" PVC CONDUIT. SCH 40', '1-1/2"': '1-1/2" PVC CONDUIT. SCH 40', '2"': '2" PVC CONDUIT.SCH 40',
    '2-1/2"': '2 1/2" PVC CONDUIT. SCH 40', '3"': '3" PVC CONDUIT. SCH 40', '3-1/2"': '3-1/2" PVC CONDUIT. SCH 40',
    '4"': '4" PVC CONDUIT. SCH 40', '5"': '5" PVC CONDUIT .SCH 40', '6"': '6" PVC CONDUIT .SCH 40'
  };
  var ITEM_TUBO = {
    EMT:   function (tam) { return tam + ' EMT CONDUIT'; },
    PVC40: function (tam) { return PVC40_NOM[tam] || (tam + ' PVC CONDUIT. SCH 40'); },
    PVC80: function (tam) { return tam + ' PVC CONDUIT.SCH 80'; },
    GRS:   function (tam) { return tam.replace('-', ' ') + ' GRS CONDUIT'; },
    IMC:   function (tam) { return tam + ' IMC CONDUIT'; },                       // Edgar no lo tiene en el catálogo: llega por nombre
    ENT:   function (tam) { return tam.replace('-', ' ') + ' ENT CONDUIT'; },     // '1 1/4" ENT CONDUIT', con espacio
    FMC:   function (tam) { return tam.replace('-', ' ') + ' FLEX. METAL CONDUIT'; }
  };
  function itemTubo(tipo, tam) { var f = ITEM_TUBO[tipo]; return f ? f(tam) : (tam + ' ' + tipo + ' CONDUIT'); }
  /* El hilo con el NOMBRE EXACTO de su catálogo (15/09), para que case por
     nombre sin depender de un alias:
       '#14'        → '# 14 THHN SOLID CU.'        (el 14 lo compra sólido)
       '#12'…'#1'   → '# 12 THHN STRANDED CU.'
       '1/0'…'4/0'  → '# 1/0 THHN STRANDED CU.'
       '250'…'600'  → '# 250 MCM THW CU.'
       aluminio     → '# 1/0 XHHW STRANDED ALUMINUM COMPACT' / '# 250 MCM XHHW STRANDED ALUMINUM COMPACT'
     El catálogo los tiene en MLF (miles de pies): el que reciba pies tiene
     que dividir por 1000 — ver factorUnidad. */
  function itemHilo(calibre, mat) {
    var num = String(calibre).replace(/^#\s*/, '');
    var mcm = !/^\d{1,2}$/.test(num) && !/\/0$/.test(num);
    if (mat === 'AL') return '# ' + num + (mcm ? ' MCM' : '') + ' XHHW STRANDED ALUMINUM COMPACT';
    if (mcm) return '# ' + num + ' MCM THW CU.';
    return '# ' + num + (num === '14' ? ' THHN SOLID CU.' : ' THHN STRANDED CU.');
  }
  /* Cuando lo medido viene en pies y el catálogo vende por mil pies (MLF),
     la cantidad se divide por 1000. Al revés, por mil. Si no, tal cual. */
  function factorUnidad(unidadMedida, unidadCatalogo) {
    var u = String(unidadMedida || '').trim().toUpperCase(), c = String(unidadCatalogo || '').trim().toUpperCase();
    if (c === 'MLF' && (u === 'FT' || u === 'LF' || u === 'PIES')) return 0.001;
    if ((c === 'FT' || c === 'LF') && u === 'MLF') return 1000;
    return 1;
  }

  var NEC = {
    CONDUCTOR: CONDUCTOR, CALIBRES: CALIBRES, CONDUCTOR_AL: CONDUCTOR_AL, CALIBRES_AL: CALIBRES_AL,
    TUBO: TUBO, TUBO_NOM: TUBO_NOM, TAMANOS: TAMANOS,
    MAX_PORTADORES: MAX_PORTADORES,
    pctPermitido: pctPermitido, llenado: llenado, maxConductores: maxConductores,
    tamanoMinimo: tamanoMinimo, tamanosQueCaben: tamanosQueCaben,
    ajuste: ajuste, hilos: hilos, maxCkts: maxCkts,
    tierraPorAmps: tierraPorAmps, tierraPorFase: tierraPorFase, ampacidad: ampacidad, TIERRA_250_122: TIERRA_250_122,
    llenadoMixto: llenadoMixto, tamanoMinimoMixto: tamanoMinimoMixto, tamanosQueCabenMixto: tamanosQueCabenMixto,
    itemTubo: itemTubo, itemHilo: itemHilo, factorUnidad: factorUnidad
  };
  raiz.NEC = NEC;
  if (typeof module !== 'undefined' && module.exports) module.exports = NEC;
})(typeof window !== 'undefined' ? window : globalThis);
