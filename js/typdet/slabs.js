/* Typical details: slabs (see js/typdet/core.js for the ctx / drawing API) */
(function () {
  'use strict';
  const TD = window.EC.typdet;

  /* ---------- RC shell / plate (sandwich model, ETABS shell forces): 4 bar layers b1 b2 t1 t2 ---------- */
  const isShell = c => c.has('ϕ_b1') && c.has('ϕ_t2') && c.has('s_b1');
  const shell = c => {
    const fck = +((c.txt('f_ck', '') || '').match(/C(\d+)/) || [0, 30])[1];
    const g = {
      h: c.mm('h', 250), cv: c.mm('c_nom', 25), fck, fyk: c.n('f_yk', 500),
      b1: c.bar('ϕ_b1', 16), b2: c.bar('ϕ_b2', 16), t1: c.bar('ϕ_t1', 16), t2: c.bar('ϕ_t2', 16),
      sb1: c.mm('s_b1', 150), sb2: c.mm('s_b2', 150), st1: c.mm('s_t1', 150), st2: c.mm('s_t2', 150),
      links: c.n('Links', 0) === 1, dw: c.bar('ϕ_w', 10), sw: c.mm('s_w', 200),
      good: c.n('Bond', 0) === 0, id: c.txt('ShellID', '')
    };
    g.dmax = Math.max(g.b1, g.b2, g.t1, g.t2);
    g.lap = Math.ceil(1.2 * T0.lbd(g.dmax, g.fyk, g.fck, g.good) / 50) * 50;
    return g;
  };
  const T0 = TD.T;
  const lbl = (d, s) => `H${d}@${T0.fmt(s)}`;

  /* TD: section through the thickness, 1 m strip (cut across direction 1: b1 / t1 bars as dots) */
  TD.add('slabs', (c, T) => {
    const g = shell(c), D = T.draw(), W = 1000, h = g.h;
    D.concrete([0, 0, W, h]);
    const yb1 = h - g.cv - g.b1 / 2, yb2 = h - g.cv - g.b1 - g.b2 / 2, yt1 = g.cv + g.t1 / 2, yt2 = g.cv + g.t1 + g.t2 / 2;
    D.rebar([[g.cv, yb2], [W - g.cv, yb2]], g.b2).rebar([[g.cv, yt2], [W - g.cv, yt2]], g.t2);
    for (let x = g.sb1 / 2; x < W; x += g.sb1) D.bar(x, yb1, g.b1);
    for (let x = g.st1 / 2; x < W; x += g.st1) D.bar(x, yt1, g.t1);
    if (g.links) for (let x = g.sw / 2; x < W; x += g.sw) D.line([[x, yt1 - g.t1 / 2 - g.dw / 2], [x, yb1 + g.b1 / 2 + g.dw / 2]], 'td-link');
    D.dimH(0, W, h, '1000 (1 m strip)', 26).dimV(0, h, 0, T.fmt(h), 26);
    D.leader(g.sb1 * 2.5, yb1, W + 60, h * 0.95, `b1 ${lbl(g.b1, g.sb1)} (outer, -3 face)`);
    D.leader(W * 0.7, yb2, W + 60, h * 0.68, `b2 ${lbl(g.b2, g.sb2)} (inner)`);
    D.leader(W * 0.7, yt2, W + 60, h * 0.32, `t2 ${lbl(g.t2, g.st2)} (inner)`);
    D.leader(g.st1 * 2.5, yt1, W + 60, h * 0.05, `t1 ${lbl(g.t1, g.st1)} (outer, +3 face)`);
    return { t: 'Shell section - four bar layers', s: `h = ${T.fmt(h)} mm · cover ${T.fmt(g.cv)} mm · ${g.links ? `links H${g.dw}@${T.fmt(g.sw)}` : 'no shear links'}`,
      svg: D.svg(560, 340), notes: ['Direction 1 bars (along local axis 1) in the outer layers, direction 2 bars inside them, both faces', 'Bottom = -3 face (M11 > 0 tension), top = +3 face, as in the ETABS sign convention'] };
  }, isShell);

  /* TD: mesh plan with local axes 1 / 2 (bottom and top meshes) */
  TD.add('slabs', (c, T) => {
    const g = shell(c), D = T.draw(), W = 1200, H = 900;
    D.concrete([0, 0, W, H]);
    for (let y = g.sb1 / 2; y < H / 2; y += g.sb1) D.rebar([[0, y], [W / 2, y]], g.b1);             // bottom mesh: upper-left quarter
    for (let x = g.sb2 / 2; x < W / 2; x += g.sb2) D.rebar([[x, 0], [x, H / 2]], g.b2);
    for (let y = H / 2 + g.st1 / 2; y < H; y += g.st1) D.line([[W / 2, y], [W, y]], 'td-rebar');     // top mesh: lower-right quarter
    for (let x = W / 2 + g.st2 / 2; x < W; x += g.st2) D.line([[x, H / 2], [x, H]], 'td-rebar');
    D.line([[-160, H + 120], [40, H + 120]], 'td-line').line([[-160, H + 120], [-160, H - 80]], 'td-line');
    D.note(60, H + 125, 'axis 1').note(-160, H - 95, 'axis 2', 'middle');
    D.dimH(0, W / 2, 0, `bottom: b1 ${lbl(g.b1, g.sb1)} · b2 ${lbl(g.b2, g.sb2)}`, -24);
    D.dimH(W / 2, W, H, `top: t1 ${lbl(g.t1, g.st1)} · t2 ${lbl(g.t2, g.st2)}`, 26);
    return { t: 'Mesh plan and local axes', s: `bottom ${lbl(g.b1, g.sb1)} / ${lbl(g.b2, g.sb2)} · top ${lbl(g.t1, g.st1)} / ${lbl(g.t2, g.st2)}`,
      svg: D.svg(560, 420), notes: ['Direction 1 bars run along ETABS local axis 1 of the shell, direction 2 bars along axis 2', 'Check the local axes of every area object in ETABS before placing the meshes'] };
  }, isShell);

  /* TD: shear links in the core */
  TD.add('slabs', (c, T) => {
    const g = shell(c); if (!g.links) return null;
    const D = T.draw(), W = Math.max(3 * g.sw, 600), h = g.h;
    D.concrete([0, 0, W, h]);
    const yb = h - g.cv - g.b1 / 2, yt = g.cv + g.t1 / 2;
    D.rebar([[0, h - g.cv - g.b1 - g.b2 / 2], [W, h - g.cv - g.b1 - g.b2 / 2]], g.b2).rebar([[0, g.cv + g.t1 + g.t2 / 2], [W, g.cv + g.t1 + g.t2 / 2]], g.t2);
    for (let x = g.sw / 2; x < W; x += g.sw) {
      D.bar(x, yb, g.b1).bar(x, yt, g.t1);
      D.rebar([[x + 4 * g.dw, yt - g.t1 / 2 - g.dw / 2], [x, yt - g.t1 / 2 - g.dw / 2], [x, yb + g.b1 / 2 + g.dw / 2], [x - 4 * g.dw, yb + g.b1 / 2 + g.dw / 2]], g.dw);
    }
    D.dimH(g.sw / 2, g.sw * 1.5, h, 's_w ' + T.fmt(g.sw), 26).dimV(0, h, 0, T.fmt(h), 26);
    D.leader(g.sw / 2, h / 2, W + 50, h / 2, `H${g.dw} links @ ${T.fmt(g.sw)} both directions`);
    return { t: 'Shear links in the core', s: `H${g.dw} @ ${T.fmt(g.sw)} mm · s_w ≤ 0.75 d · links enclose the outer bars`,
      svg: D.svg(520, 300), notes: ['Links hook around the outer bars of both faces (135° hooks or closed links)', 'Links need h ≥ 200 mm; extend them over the area where τ_Ed > τ_Rd,c plus d'] };
  }, isShell);

  /* TD: lap splice of the mesh bars (staggered) */
  TD.add('slabs', (c, T) => {
    const g = shell(c), D = T.draw(), L = g.lap, W = 2.6 * L + 400, gap = Math.max(g.dmax, 25);
    D.concrete([0, 0, W, 4 * gap + 40]);
    const y1 = 20 + gap, y2 = 20 + 3 * gap;
    D.rebar([[0, y1], [200 + L, y1]], g.dmax).rebar([[200, y1 + g.dmax], [W, y1 + g.dmax]], g.dmax);
    D.rebar([[0, y2], [200 + 1.3 * L + L, y2]], g.dmax).rebar([[200 + 1.3 * L, y2 + g.dmax], [W, y2 + g.dmax]], g.dmax);
    D.dimH(200, 200 + L, 0, 'l₀ ' + T.fmt(L), -18).dimH(200 + 1.3 * L, 200 + 2.3 * L, 4 * gap + 40, 'l₀ ' + T.fmt(L), 22);
    return { t: 'Lap splice of the mesh bars', s: `H${g.dmax}: l₀ ≈ ${T.fmt(L)} mm (1.2 l_bd, ${g.good ? 'good' : 'poor'} bond, C${g.fck})`,
      svg: D.svg(560, 220), notes: ['Laps staggered: not more than 50 % of the bars lapped in one section, laps ≥ 0.3 l₀ apart', 'Use the anchorage / lap length of section 9.3 of the calculation where it is larger'] };
  }, isShell);

  /* TD: free edge with U-bars closing the two meshes */
  TD.add('slabs', (c, T) => {
    const g = shell(c), D = T.draw(), h = g.h, L = Math.max(g.lap, 2 * h), W = L + 300;
    D.concrete([0, 0, W, h]);
    const yb = h - g.cv - g.b1 / 2, yt = g.cv + g.t1 / 2, xu = W - g.cv - g.t1 / 2;
    D.rebar([[0, yb], [W - g.cv - 2 * g.b1, yb]], g.b1).rebar([[0, yt], [W - g.cv - 2 * g.t1, yt]], g.t1);
    const ud = Math.min(g.b1, g.t1), yi = yt + g.t1 / 2 + ud / 2, yo = yb - g.b1 / 2 - ud / 2;
    D.rebar([[W - L, yi], [xu - ud, yi], [xu - ud, yo], [W - L, yo]], ud);
    D.dimH(W - L, xu, 0, 'U-bar leg ' + T.fmt(L), -18).dimV(0, h, 0, T.fmt(h), 26);
    D.leader(xu - ud, h / 2, W + 50, h / 2, `U-bars H${ud} at the mesh spacing`);
    return { t: 'Free edge - U-bars', s: `U-bars H${ud} lapping both meshes · legs ≥ max(l₀, 2h) ≈ ${T.fmt(L)} mm`,
      svg: D.svg(520, 260), notes: ['Free edges of slabs and walls: U-bars plus longitudinal edge bars (EN 1992-1-1 12.3 / 12.5)', 'Same spacing as the mesh bars they lap with'] };
  }, isShell);

  /* TD: opening with trimmer and diagonal bars */
  TD.add('slabs', (c, T) => {
    const g = shell(c), D = T.draw(), a = 600, W = 1800, H = 1400, x0 = (W - a) / 2, y0 = (H - a) / 2, e = 2 * g.cv + 40;
    D.concrete([0, 0, W, H]).void([x0, y0, a, a]);
    const d = g.dmax, ext = Math.max(g.lap, 400);
    [[y0 - e, 'h'], [y0 + a + e, 'h']].forEach(([y]) => D.rebar([[x0 - ext, y], [x0 + a + ext, y]], d));
    [x0 - e, x0 + a + e].forEach(x => D.rebar([[x, y0 - ext], [x, y0 + a + ext]], d));
    const q = 0.35 * ext;                                    // diagonal bars across each corner, at right angles to the corner crack
    [[x0, y0, -1, -1], [x0 + a, y0, 1, -1], [x0 + a, y0 + a, 1, 1], [x0, y0 + a, -1, 1]].forEach(([x, y, sx, sy]) => {
      const cx = x + sx * 2 * e, cy = y + sy * 2 * e;
      D.rebar([[cx - sy * q, cy + sx * q], [cx + sy * q, cy - sx * q]], d);
    });
    D.note(x0 + a / 2, y0 + a / 2 + 5, 'opening', 'middle');
    D.leader(x0 + a + e, y0 + a / 2, W + 40, H / 2, `trimmers 2 × H${d} each side, l ≥ l₀ past the corners`);
    return { t: 'Opening - trimmer bars', s: `bars cut by the opening replaced by trimmers each face · H${d} · extension ≥ ${T.fmt(ext)} mm`,
      svg: D.svg(520, 400), notes: ['Area of the trimmers ≥ area of the interrupted bars, half on each side, top and bottom faces', 'Diagonal bars at the corners against corner cracking; check large openings with the shell forces around them'] };
  }, isShell);

  /* TD: wall pier section with end zones (P-M2-M3 check of section 7) */
  TD.add('slabs', (c, T) => {
    if (c.n('Pier', 0) !== 1) return null;
    const g = shell(c), D = T.draw(), Lw = c.mm('L_w', 2000), h = g.h, nbe = Math.max(2, Math.round(c.n('n_be', 4))),
      dbe = c.bar('ϕ_be', 16), cbe = c.mm('c_be', 100), vd = c.n('Dir_v', 0) === 0 ? g.b1 : g.b2, vs = c.n('Dir_v', 0) === 0 ? g.sb1 : g.sb2;
    D.concrete([0, 0, Lw, h]);
    const ez = Math.max(2 * cbe, 200), yi = g.cv + 10 + vd / 2, yo = h - yi, per = Math.ceil(nbe / 2);
    [[0, 1], [Lw, -1]].forEach(([x, s]) => {
      D.link(Math.min(x, x + s * ez) + g.cv, g.cv, ez - g.cv, h - 2 * g.cv, 15);
      for (let k = 0; k < per; k++) { const xx = x + s * (cbe + (per > 1 ? (k - (per - 1) / 2) * Math.min(2.5 * dbe + 20, ez / per) : 0)); D.bar(xx, yi, dbe).bar(xx, yo, dbe); }
    });
    for (let x = ez + vs / 2; x < Lw - ez; x += vs) D.bar(x, yi, vd).bar(x, yo, vd);
    D.dimH(0, Lw, h, 'L_w ' + T.fmt(Lw), 26).dimV(0, h, 0, T.fmt(h), 26).dimH(0, cbe, 0, T.fmt(cbe), -18);
    D.leader(cbe, yi, Lw * 0.25, -60, `end zone ${nbe} H${dbe} each end + U-bars / links`);
    D.leader(Lw / 2, yo, Lw * 0.6, h + 70, `vertical mesh H${vd}@${T.fmt(vs)} each face`);
    return { t: 'Wall pier - end zones', s: `${T.fmt(Lw)} × ${T.fmt(h)} mm · ${nbe} H${dbe} per end · mesh H${vd}@${T.fmt(vs)}`,
      svg: D.svg(600, 260), notes: ['End-zone bars confined by links or U-bars (EN 1992-1-1 12.5); lap the vertical bars above the floor', 'Pier forces P, M2, M3 from the ETABS table Pier Forces'] };
  }, isShell);
})();
