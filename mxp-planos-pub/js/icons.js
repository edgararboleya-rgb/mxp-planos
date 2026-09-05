/* ============================================================
   MXP Planos — iconos de línea (guía DISENOMAXPOWER.md §4)
   "Nada de emojis en la interfaz": cada teléfono los pinta distinto y
   se ven como juego de niños. Todo icono es SVG de línea en rejilla
   24×24, trazo 1.7, puntas redondas, color heredado (currentColor).
   Los que ya existían en la app principal (diccionario LEV_SVG de
   max-power-panel) están copiados TAL CUAL para que las dos apps se
   vean hermanas.
   Uso:  ICO.svg('save', 18)  →  cadena <svg…>
         <button data-ico="save">Guardar</button>  →  ICO.pinta() lo rellena
   ============================================================ */
(function () {
  'use strict';
  var D = {
    select: '<path d="M4.5 3.6 20.2 9.9 13.9 12.1 11.7 18.4Z"/>',
    pan: '<path d="M17.3 11.1V6.7a1.76 1.76 0 1 0-3.5 0v4.4"/><path d="M13.8 10.2V5a1.76 1.76 0 1 0-3.5 0v5.3"/><path d="M10.2 10.7V6.7a1.76 1.76 0 1 0-3.5 0v7"/><path d="M17.3 8.5a1.76 1.76 0 1 1 3.5 0v5.3a7 7 0 0 1-7 7H12c-2.46 0-3.96-.76-5.27-2.06l-3.17-3.17a1.76 1.76 0 0 1 2.49-2.48l1.55 1.55"/>',
    wall: '<path d="M3 6h16v14"/><path d="M3 10.5h11.5v9.5"/>',
    door: '<path d="M2.5 18h3M17.5 18h4"/><path d="M5.5 18V6"/><path d="M5.5 6a12 12 0 0 1 12 12"/>',
    window: '<path d="M2.6 5.6h4v12.8h-4z"/><path d="M17.4 5.6h4v12.8h-4z"/><path d="M6.6 9.9h10.8M6.6 14.1h10.8"/>',
    area: '<path d="M4 7.6 11.2 3.9 20 7.9 18.2 18.1 6.4 19.6Z"/><path d="M7.8 13.6 11 10.4M11.8 15.6 15.6 11.8"/>',
    rect: '<rect x="3.5" y="6" width="17" height="12" rx="1.4"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6.6"/>',
    line: '<circle cx="5.5" cy="18.5" r="1.6"/><circle cx="18.5" cy="5.5" r="1.6"/><path d="M7.2 16.8 16.8 7.2"/>',
    pline: '<path d="M4.6 17.2 9.6 9.8 14.4 16 19.4 7.8"/><circle cx="4.6" cy="17.2" r="1.3" fill="currentColor"/><circle cx="9.6" cy="9.8" r="1.3" fill="currentColor"/><circle cx="14.4" cy="16" r="1.3" fill="currentColor"/><circle cx="19.4" cy="7.8" r="1.3" fill="currentColor"/>',
    cloud: '<path d="M12 5.7A3.4 3.4 0 0 1 17.46 8.85A3.4 3.4 0 0 1 17.46 15.15A3.4 3.4 0 0 1 12 18.3A3.4 3.4 0 0 1 6.54 15.15A3.4 3.4 0 0 1 6.54 8.85A3.4 3.4 0 0 1 12 5.7Z"/>',
    homerun: '<path d="M4.6 19.4 17.4 6.6"/><path d="M12.7 7.1 18 5.4 16.3 10.7"/><path d="M5.6 15.6 9.2 19.2M9.2 12 12.8 15.6"/>',
    wire: '<circle cx="4.2" cy="17.4" r="1.5"/><circle cx="19.8" cy="6.6" r="1.5"/><path d="M6 16.4c3.6 0 2.4-5.2 6-5.2s2.4-5.2 6-5.2"/>',
    dim: '<path d="M5 8v8.5M19 8v8.5"/><path d="M5 12h14"/><path d="M7.6 10.6 5 12l2.6 1.4"/><path d="M16.4 10.6 19 12l-2.6 1.4"/>',
    measure: '<path d="m4 17 13-13 3 3-13 13H4z"/><path d="m8.5 12.5 1.5 1.5M11.5 9.5l1.5 1.5M14.5 6.5 16 8"/>',
    text: '<path d="M6 19 12 5l6 14"/><path d="M8 14.4h8"/>',
    callout: '<path d="M7.6 18.1 4.5 19.5 5.4 16.2"/><path d="M4.5 19.5 11.8 10.5h7.7"/><path d="M13.2 6.6h6.3"/>',
    calibrate: '<circle cx="12" cy="8.6" r="4"/><path d="M12 4.6v8M8 8.6h8"/><path d="M4.5 19.5h15"/><circle cx="4.5" cy="19.5" r="1.2" fill="currentColor"/><circle cx="19.5" cy="19.5" r="1.2" fill="currentColor"/>',
    pen: '<path d="m5.5 14.5 11-11 3 3-11 11H5.5z"/><path d="m14.5 5.5 3 3"/><path d="M3.4 20c2.3 0 2.7-2.6 5-2.6s2.7 2.6 5 2.6 2.7-2.6 5-2.6"/>',
    highlight: '<path d="M5.2 12.8 7.8 15.4 10.6 13.6 17.2 7 13.8 3.6 7.2 10.2z"/><path d="M7.2 10.2 10.6 13.6"/><rect x="4.5" y="18.4" width="15" height="2.8" rx="1.4"/>',
    eraser: '<rect x="6" y="7.5" width="12" height="7" rx="1.8" transform="rotate(-45 12 11)"/><path d="M8.1 9.9 13.1 14.9"/><path d="M4 20.4h16"/>',
    undo: '<path d="M4.5 8.5h10a5.5 5.5 0 0 1 0 11H8"/><path d="M8.5 4.5 4.5 8.5l4 4"/>',
    redo: '<path d="M19.5 8.5h-10a5.5 5.5 0 0 0 0 11H16"/><path d="M15.5 4.5 19.5 8.5l-4 4"/>',
    open: '<path d="M3.5 18V6.2A1.7 1.7 0 0 1 5.2 4.5h3.6a1.7 1.7 0 0 1 1.36.68l.98 1.32H17a1.7 1.7 0 0 1 1.7 1.7v1.4"/><path d="M3.6 18.4 5.9 12a1.7 1.7 0 0 1 1.6-1.1h12.2a1.7 1.7 0 0 1 1.6 2.3l-1.9 5.4a1.7 1.7 0 0 1-1.6 1.1H5.3A1.7 1.7 0 0 1 3.6 18z"/>',
    save: '<path d="M5 3.5h9.4a2 2 0 0 1 1.4.6l3.1 3.1a2 2 0 0 1 .6 1.4V18.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M7.6 3.5v4.2h6.6V3.5"/><path d="M6.9 20.5v-6.2h10.2v6.2"/>',
    projects: '<path d="M8.5 3.5h6l4 4v10.5h-10z"/><path d="M14.5 3.5V7.5h4"/><path d="M5.5 7v13.5h9.5"/>',
    png: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="7.8" cy="9" r="1.7"/><path d="M3.4 18 10.5 11.4a1.9 1.9 0 0 1 2.7 0l4.9 4.9"/>',
    pdf: '<path d="M18 12V7.5l-4-4H6.5v17h6"/><path d="M14 3.5V7.5h4"/><path d="M17.5 14.5v6.2"/><path d="M14.8 18 17.5 20.7l2.7-2.7"/>',
    panelsch: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.2h17M3.5 15h17M12 9.2v11.3"/>',
    lot: '<path d="M5 6.5h14v11H5z"/><circle cx="5" cy="6.5" r="1.3"/><circle cx="19" cy="6.5" r="1.3"/><circle cx="5" cy="17.5" r="1.3"/><circle cx="19" cy="17.5" r="1.3"/>',
    ortho: '<path d="M4.2 4.3v15.5h15.5z"/><path d="M4.2 16.6h3.2v3.2"/>',
    magnet: '<path d="M4 19h4.2v-6.8a3.8 3.8 0 0 1 7.6 0V19H20v-6.8a8 8 0 0 0-16 0z"/><path d="M4 15.6h4.2M15.8 15.6H20"/>',
    symbols: '<path d="M9 6.5V5.4a1.9 1.9 0 0 1 1.9-1.9h2.2A1.9 1.9 0 0 1 15 5.4v1.1"/><rect x="3" y="6.5" width="18" height="13" rx="2.4"/><path d="M3 12.4h6.5M14.5 12.4H21"/><rect x="9.5" y="10.6" width="5" height="3.6" rx="1.1"/>',
    props: '<path d="M10.2 6.1L10.3 3.1A9.1 9.1 0 0 1 13.7 3.1L13.8 6.1A6.2 6.2 0 0 1 16.2 7.5L18.9 6A9.1 9.1 0 0 1 20.6 9L18 10.6A6.2 6.2 0 0 1 18 13.4L20.6 15A9.1 9.1 0 0 1 18.9 18L16.2 16.5A6.2 6.2 0 0 1 13.8 17.9L13.7 20.9A9.1 9.1 0 0 1 10.3 20.9L10.2 17.9A6.2 6.2 0 0 1 7.8 16.5L5.1 18A9.1 9.1 0 0 1 3.4 15L6 13.4A6.2 6.2 0 0 1 6 10.6L3.4 9A9.1 9.1 0 0 1 5.1 6L7.8 7.5A6.2 6.2 0 0 1 10.2 6.1Z"/><circle cx="12" cy="12" r="3.2"/>',
    bars: '<path d="M9.3 6.5h.01M14.7 6.5h.01M9.3 12h.01M14.7 12h.01M9.3 17.5h.01M14.7 17.5h.01"/>',
    close: '<path d="M6 6 18 18M18 6 6 18"/>',
    download: '<path d="M12 3.5v11.4"/><path d="M7.2 10.2 12 15l4.8-4.8"/><path d="M4 19.5h16"/>',
    upload: '<path d="M12 15V3.6"/><path d="M7.2 8.4 12 3.6l4.8 4.8"/><path d="M4 19.5h16"/>',
    send: '<path d="M20.5 3.5 3.5 9.6l7.4 3.5 3.5 7.4z"/><path d="M20.5 3.5 10.9 13.1"/>',
    menu: '<path d="M4.5 5.5H19.5M4.5 12H19.5M4.5 18.5H19.5"/>',
    fav: '<path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z"/>',
    electrical: '<path d="M13 2.5 5 13.5h6L11 21.5l8-11h-6z"/>',
    lighting: '<path d="M8.4 12.9a5.4 5.4 0 1 1 7.2 0c-.85.85-1.3 1.6-1.3 2.6h-4.6c0-1-.45-1.75-1.3-2.6z"/><path d="M9.9 18h4.2"/><path d="M10.7 20.6h2.6"/>',
    riser: '<path d="M5.5 3.5v17"/><path d="M5.5 7.5h4.5M5.5 16.5h4.5"/><rect x="10" y="4.5" width="9" height="6" rx="1.4"/><rect x="10" y="13.5" width="9" height="6" rx="1.4"/>',
    oneline: '<path d="M12 2.8v4"/><path d="M12 6.8 15.6 11.2"/><path d="M12 11.8V15"/><path d="M4.5 15h15"/><path d="M8 15v4.7M16 15v4.7"/>',
    etiquetas: '<path d="M11.4 3.6H19a1.4 1.4 0 0 1 1.4 1.4v7.6a1.5 1.5 0 0 1-.44 1.06l-6.5 6.5a1.5 1.5 0 0 1-2.12 0l-7.6-7.6a1.5 1.5 0 0 1 0-2.12l6.5-6.5a1.5 1.5 0 0 1 1.06-.44z"/><circle cx="16.4" cy="7.6" r="1.5"/>',
    elevation: '<path d="M2.5 20.5h19"/><path d="M5.5 20.5V6h13v14.5"/><path d="M9.2 20.5v-6.2h4.2v6.2"/>',
    plumbing: '<path d="M12 3.2v3.4"/><path d="M6.8 12a5.2 5.2 0 0 1 10.4 0z"/><path d="M8.6 15v2.4M12 15v4.6M15.4 15v2.4"/>',
    furniture: '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M6 18v2M18 18v2"/>',
    lutron: '<rect x="7" y="3.5" width="10" height="17" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M12 12V9.8"/>',
    outdoor: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    landscape: '<path d="M11.9 9.6c-.5 4.1-1.7 7.7-3.7 11.1"/><path d="M11.9 9.4C9.6 6.2 6.4 5.9 3.7 8.4"/><path d="M11.9 9.4c2.3-3.2 5.5-3.5 8.4-1"/><path d="M11.9 9.4C11.2 5.5 9.9 3.4 7.7 2.9"/><path d="M11.9 9.4c.7-3.9 2-6 4.2-6.5"/>',
    siteplan: '<rect x="3.5" y="4" width="17" height="13" rx="1.3"/><rect x="8.6" y="7.6" width="6.8" height="5.8" rx="1"/><path d="M3 20.6h18"/>',
    escala: '<rect x="3" y="9" width="18" height="6" rx="1.3"/><path d="M9 9v6M15 9v6"/>',
    tijera: '<circle cx="6.5" cy="6.5" r="3"/><circle cx="6.5" cy="17.5" r="3"/><path d="M20.5 4 8.6 15.9"/><path d="M14.6 14.5 20.5 20.4"/><path d="M8.6 8.6 12 12"/>',
    papelera: '<path d="M4.5 6.5h15"/><path d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 5v1.5"/><path d="M6.5 6.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.5"/><path d="M10 10.5v6M14 10.5v6"/>',
    overlay: '<path d="M12 3.2 20.8 8 12 12.8 3.2 8z"/><path d="M3.2 13.6 12 18.4l8.8-4.8"/>',
    diana: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12h3.5M18 12h3.5"/>',
    chat: '<path d="M18 3.5H6A2.5 2.5 0 0 0 3.5 6v7.5A2.5 2.5 0 0 0 6 16h1.5v4L12 16h6a2.5 2.5 0 0 0 2.5-2.5V6A2.5 2.5 0 0 0 18 3.5z"/><path d="M8.5 9.7h.01M12 9.7h.01M15.5 9.7h.01"/>',
    count: '<circle cx="6.8" cy="6.8" r="2.6"/><circle cx="16.4" cy="6.8" r="2.6"/><circle cx="6.8" cy="16.4" r="2.6"/><path d="M12.8 16.9 15.4 19.5 20.4 13.9"/>',
    varita: '<path d="M3.5 20.5 14.5 9.5"/><path d="M9.6 12.6 11.4 14.4"/><path d="M16.5 4.7v5.6M13.7 7.5h5.6"/><path d="M20 11.6v2.8M18.6 13h2.8"/>',
    recibo: '<path d="M18.5 3.5v17l-2.6-1.8-2.6 1.8-2.6-1.8-2.6 1.8-2.6-1.8V3.5z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>',
    brujula: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4z"/>',
    escoba: '<path d="M12 2.5v9"/><path d="M7.6 11.5h8.8l1.3 8.4H6.3z"/><path d="M10.1 11.5 9.5 19.9M13.9 11.5l.6 8.4"/>',
    lista: '<path d="M8.5 5.5H19M8.5 12H19M8.5 18.5H19"/><path d="M4.5 5.5h.01M4.5 12h.01M4.5 18.5h.01"/>',
    editar: '<path d="M11.2 4.5H5.6a2 2 0 0 0-2 2v11.9a2 2 0 0 0 2 2h11.9a2 2 0 0 0 2-2v-5.6"/><path d="M17.2 3.6a2.1 2.1 0 0 1 3 3l-7.9 7.9-3.9 1 1-3.9z"/>',
    buscar: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    mapa: '<path d="M9 3.5 3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6z"/><path d="M9 3.5V18M15 6v14.5"/>',
    agua: '<path d="M12 3.2c3.4 4 6.2 7 6.2 10.3A6.2 6.2 0 0 1 12 20.5a6.2 6.2 0 0 1-6.2-7c0-3.3 2.8-6.3 6.2-10.3z"/><path d="M8.4 15c1.1-1.7 2.3 1.7 3.4 0s2.3 1.7 3.4 0"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"/>',
    probar: '<path d="M9 3.5v5M15 3.5v5"/><path d="M6.5 8.5h11v2.8a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.8v3.7"/>',
    encaja: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 4.5v3.6a2.1 2.1 0 0 1 0 4.2v7.2"/>',
    flechaArriba: '<path d="M5 15.5 12 8.5l7 7"/>',
    flechaAbajo: '<path d="M5 8.5 12 15.5l7-7"/>',
    flechaIzq: '<path d="M15.5 5 8.5 12l7 7"/>',
    flechaDer: '<path d="M8.5 5 15.5 12l-7 7"/>',
    mas: '<path d="M12 4.5v15M4.5 12h15"/>',
    ok: '<path d="m4.5 12.5 5 5 10-11"/>',
    alerta: '<path d="M10.6 4.3 2.9 17.8a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.3a1.6 1.6 0 0 0-2.8 0z"/><path d="M12 9.5v4.2M12 17.2v.01"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8V12l3.4 2.2"/>',
    ajustar: '<path d="M8.5 3.5H5A1.5 1.5 0 0 0 3.5 5v3.5M15.5 3.5H19A1.5 1.5 0 0 1 20.5 5v3.5M20.5 15.5V19a1.5 1.5 0 0 1-1.5 1.5h-3.5M3.5 15.5V19A1.5 1.5 0 0 0 5 20.5h3.5"/><path d="M9.5 9.5h5v5h-5z"/>'
  };
  function svg(nombre, px) {
    var d = D[nombre];
    if (!d) return '';
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (px ? ' style="width:' + px + 'px;height:' + px + 'px"' : '') + '>' + d + '</svg>';
  }
  /* Rellena todo [data-ico] que aún no tenga su dibujo. Se puede llamar
     las veces que haga falta (paneles que se repintan). */
  function pinta(raiz) {
    var lista = (raiz || document).querySelectorAll('[data-ico]');
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i];
      if (el.querySelector(':scope > svg.ico')) continue;
      var s = svg(el.dataset.ico, +el.dataset.icoPx || 0);
      if (s) el.insertAdjacentHTML('afterbegin', s);
    }
  }
  window.ICO = { svg: svg, pinta: pinta, tiene: function (n) { return !!D[n]; }, claves: Object.keys(D) };
})();
