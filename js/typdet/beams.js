/* Typical details: beams (see js/typdet/core.js for the ctx / drawing API) */
(function () {
  'use strict';
  const TD = window.EC.typdet;

  /* common beam values, read from Mathcad or native inputs */
  const beam = c => {
    const b = c.mm(['b_w', 'b', 'bw', 'B'], 300), h = c.mm(['h', 'H', 'D'], 600);
    const cv = c.mm(['c_nom', 'cnom', 'c'], 30), dw = c.bar(['ϕ_w', 'φ_w', 'dw', 'phi_w'], 10);
    const n1 = Math.max(2, Math.round(c.n(['n_1', 'nb', 'n_b'], 4))), d1 = c.bar(['ϕ_1', 'φ_1', 'db', 'phi_1'], 20);
    const nc = Math.max(2, Math.round(c.n(['n_c', 'nt', 'n_t'], 2))), dc = c.bar(['ϕ_c', 'φ_c', 'dt', 'phi_c'], 16);
    return { b, h, cv, dw, n1, d1, nc, dc, L: c.mm(['L_eff', 'L', 'l'], 6000) };
  };

  /* TD: cross-section with bars, links, cover and dimensions */
  TD.add('beams', (c, T) => {
    const g = beam(c), D = T.draw();
    D.concrete([0, 0, g.b, g.h]);
    const ci = g.cv + g.dw / 2;
    D.link(g.cv + g.dw / 2, g.cv + g.dw / 2, g.b - 2 * ci, g.h - 2 * ci, 2 * g.dw);
    const row = (n, d, y) => { const x0 = g.cv + g.dw + d / 2, x1 = g.b - x0; for (let k = 0; k < n; k++) D.bar(n > 1 ? x0 + (x1 - x0) * k / (n - 1) : g.b / 2, y, d); };
    row(g.n1, g.d1, g.h - g.cv - g.dw - g.d1 / 2);
    row(g.nc, g.dc, g.cv + g.dw + g.dc / 2);
    D.dimH(0, g.b, g.h, T.fmt(g.b), 26).dimV(0, g.h, 0, T.fmt(g.h), 26);
    D.leader(g.b - g.cv - g.dw - g.d1 / 2, g.h - g.cv - g.dw - g.d1 / 2, g.b + 60, g.h * 0.78, `${T.bars(g.n1, g.d1)} bottom`);
    D.leader(g.b - g.cv - g.dw - g.dc / 2, g.cv + g.dw + g.dc / 2, g.b + 60, g.h * 0.2, `${T.bars(g.nc, g.dc)} top`);
    D.leader(g.b - g.cv, g.h / 2, g.b + 60, g.h / 2, `H${g.dw} links, cover ${T.fmt(g.cv)}`);
    return { t: 'Beam cross-section', s: `${T.fmt(g.b)} × ${T.fmt(g.h)} mm · cover ${T.fmt(g.cv)} mm to links`, svg: D.svg(520, 380) };
  });
})();
