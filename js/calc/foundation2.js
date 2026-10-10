/* Foundations 2: combined footing, pile caps by STM (standard / custom layouts), single-pile cap, multi-column cap, cap from FE forces */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}) }, o);
  const mat = (c, m) => {
    c.h1('Materials');
    c.inp('Concrete class', 'f_ck', m.fck, 'MPa', 'Table 5.1');
    c.v({ l: 'Design compressive strength', s: 'f_cd', f: 'η_cc f_ck/γ_C', v: m.fcd, u: 'MPa', r: '5.1.6', key: true });
    c.v({ l: 'Design yield strength', s: 'f_yd', f: 'f_yk/γ_S', v: m.fyd, u: 'MPa', r: '5.2.4', key: true });
  };
  const tauPunch = (m, rho, dv, b0, b05) => {
    const kpb = EC.clamp(3.6 * Math.sqrt(Math.max(0, 1 - b0 / b05)), 1, 2.5);
    return { kpb, t: Math.min(0.6 / m.gV * kpb * Math.pow(100 * Math.min(rho, 0.02) * m.fck * m.ddg / dv, 1 / 3), 0.5 / m.gV * Math.sqrt(m.fck)) };
  };

  /* ---------------- Combined footing ---------------- */
  EC.modules.combinedfooting = def({
    type: 'combinedfooting', name: 'Combined Footing (2 columns)', cat: 'foundations', prefix: 'CF', icon: 'footing', code: 'EN 1992-1-1:2023 / EN 1997', mathcad: 'EC2_Concrete\\CombinedFooting_Design',
    groups: [
      { t: 'Footing', f: [F('L', 'Length L', 'm', 6.4), F('B', 'Width B', 'm', 2.6), F('h', 'Thickness h', 'mm', 1100), F('x1', 'Column 1 centre from left end', 'm', 0.6), F('x2', 'Column 2 centre from left end', 'm', 5.2), F('c1', 'Column 1 size (square)', 'mm', 450), F('c2', 'Column 2 size (square)', 'mm', 500), F('qa', 'Allowable bearing (SLS)', 'kPa', 250)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 50), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Column loads', f: [F('N1', 'ULS N_1', 'kN', 1500), F('N2', 'ULS N_2', 'kN', 2200), F('M1', 'ULS M_1 (about y)', 'kNm', 40), F('M2', 'ULS M_2 (about y)', 'kNm', 60), F('sls', 'SLS / ULS ratio', '', 0.72)] },
      { t: 'Reinforcement', f: [F('db', 'Bottom long. ϕ', 'mm', 20, EC.barOpts), F('sb', 'spacing', 'mm', 150), F('dt', 'Top long. ϕ', 'mm', 20, EC.barOpts), F('st', 'spacing', 'mm', 125), F('dx', 'Transverse bottom ϕ', 'mm', 16, EC.barOpts), F('sx', 'spacing', 'mm', 150)] }
    ],
    schedCols: [['size', 'L × B × h'], ['N', 'N_1 / N_2'], ['bot', 'Bottom'], ['top', 'Top'], ['tr', 'Transverse']],
    sched: i => ({ size: `${i.L}×${i.B}×${i.h / 1000}`, N: `${i.N1} / ${i.N2}`, bot: `H${i.db}@${i.sb}`, top: `H${i.dt}@${i.st}`, tr: `H${i.dx}@${i.sx}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), L = +i.L, B = +i.B, h = +i.h;
      c.text('Rectangular combined footing under two columns: linear ground pressure with column moments, M(x) and V(x) along the footing, bottom and top longitudinal steel, transverse bands under the columns, one-way shear and punching with soil relief, top-steel crack control.');
      mat(c, m);
      c.h1('Ground pressure');
      const N = +i.N1 + +i.N2, xr = (i.N1 * i.x1 + i.N2 * i.x2 + +i.M1 + +i.M2) / N, e = xr - L / 2;
      c.q('Resultant position', 'x_R', '(Σ N x + Σ M)/Σ N', xr, 'm'); c.q('Eccentricity', 'e', 'x_R − L/2', e, 'm');
      c.c('Kern', '|e|/(L/6)', Math.abs(e), L / 6, 'm', 'EN 1997 [practice]', 'Resultant in kern');
      const qmx = N / (B * L) * (1 + 6 * Math.abs(e) / L);
      const Gk = 25 * B * L * h / 1000;
      const qsls = (N * i.sls + Gk) / (B * L) * (1 + 6 * Math.abs(e) / L);
      c.c('SLS bearing pressure', 'q_max/q_a', qsls, +i.qa, 'kPa', 'EN 1997', 'Bearing pressure');
      const q = x => N / (B * L) * (1 + 12 * e * (x - L / 2) / (L * L)) * B;
      c.h1('Longitudinal actions');
      const nS = 240, Ms = [], Vs = []; let Mmax = 0, Mmin = 0;
      const pl = [[+i.x1, +i.N1, +i.M1], [+i.x2, +i.N2, +i.M2]];
      for (let k = 0; k <= nS; k++) {
        const x = k / nS * L; let V = 0, M = 0;
        for (let j = 0; j < k; j++) { const xi = (j + 0.5) / nS * L, w = q(xi) * L / nS; V += w; M += w * (x - xi); }
        pl.forEach(([xp, P, Mp]) => { if (xp < x) { V -= P; M -= P * (x - xp) + Mp; } });
        Ms.push([x, M]); Vs.push([x, V]); Mmax = Math.max(Mmax, M); Mmin = Math.min(Mmin, M);
      }
      c.q('Max sagging (tension bottom)', 'M_Ed;bot', 'numerical', Mmax, 'kNm', '', true);
      c.q('Max hogging (tension top)', 'M_Ed;top', 'numerical', -Mmin, 'kNm', '', true);
      const d = h - i.cnom - i.dx - i.db / 2, dt = h - i.cnom - i.dt / 2;
      const Ab = EC.barA(i.db) * 1000 / i.sb, At = EC.barA(i.dt) * 1000 / i.st;
      c.h2('Bottom steel');
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mmax / B, b: 1000, d, As: Ab, m, barTxt: `H${i.db}@${i.sb}`, tag: 'bot', item: 'Longitudinal bottom' });
      c.h2('Top steel');
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: -Mmin / B, b: 1000, d: dt, As: At, m, barTxt: `H${i.dt}@${i.st}`, tag: 'top', item: 'Longitudinal top' });
      c.h1('Shear');
      let Vmax = 0;
      pl.forEach(([xp, , ], k) => { const cc = (k ? i.c2 : i.c1) / 2000 + d / 1000; [xp - cc, xp + cc].forEach(x => { if (x > 0 && x < L) { const j = Math.round(x / L * nS); Vmax = Math.max(Vmax, Math.abs(Vs[j][1])); } }); });
      c.q('Shear at d from column faces', 'V_Ed', 'max |V(x)|', Vmax, 'kN');
      const sh = EC.shearNoLinks(c, { V: Vmax / B, b: 1000, d: dt, As: At, m });
      c.c('One-way shear', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'One-way shear');
      c.h1('Punching');
      const dv = (d + dt) / 2, rho = Math.sqrt(Ab / (1000 * d) * (EC.barA(i.dx) * 1000 / i.sx) / (1000 * (d + i.dx)));
      pl.forEach(([xp, P], k) => {
        const cc = k ? +i.c2 : +i.c1, edge = xp * 1000 - cc / 2 < dv / 2 || (L - xp) * 1000 - cc / 2 < dv / 2;
        const b0 = edge ? 3 * cc : 4 * cc, b05 = edge ? 3 * cc + Math.PI * dv / 2 : 4 * cc + Math.PI * dv;
        const Ain = (cc * cc + 4 * cc * dv / 2 + Math.PI * dv * dv / 4) / 1e6;
        const Vr = P - N / (B * L) * Ain, tE = (edge ? 1.4 : 1.15) * Vr * 1e3 / (b05 * dv);
        const R = tauPunch(m, rho, dv, b0, b05);
        c.c(`Punching column ${k + 1}${edge ? ' (edge)' : ''}`, 'τ_Ed/τ_Rd;c', tE, R.t, 'MPa', '8.4', `Punching column ${k + 1}`);
      });
      c.h1('Transverse steel under columns');
      const Ax = EC.barA(i.dx) * 1000 / i.sx;
      pl.forEach(([xp, P], k) => {
        const cc = (k ? i.c2 : i.c1) / 1000, bw = cc + 1.5 * d / 1000, a = (B - cc) / 2;
        const Mt = P / B * a * a / 2;
        c.c(`Band under column ${k + 1} (width c + 1.5d = ${fmt(bw, 2)} m)`, 'A_s;req', EC.AsReq(Mt / bw, 1000, d + i.dx / 2, m), Ax, 'mm²/m', '8.1', `Transverse band ${k + 1}`);
      });
      c.h1('Crack control (top steel)');
      const w = EC.crackW({ b: 1000, h, d: dt, As: At, phi: +i.dt, c: i.cnom + i.dt / 2, M: -Mmin / B * i.sls * 0.8, fck: +i.fck });
      c.c('Crack width top face', 'w_k', w.wk, 0.3, 'mm', '[2004 7.3.4]', 'Crack width');
      const svg = EC.plot({ title: 'M(x) and V(x)', xl: 'x (m)', yl: 'M (kNm), V (kN)', series: [{ name: 'M', pts: Ms, fill: true }, { name: 'V', pts: Vs, cls: 1 }], legend: true });
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Footing', `${L} × ${B} × ${h / 1000} m`], ['Bottom', `H${i.db}@${i.sb} long., H${i.dx}@${i.sx} transverse`], ['Top', `H${i.dt}@${i.st} long. between columns`]], bars: [], svg });
    }
  });

  /* ---------------- Pile cap STM (standard + custom layouts) ---------------- */
  const LAY = [{ v: '2', l: '2 piles in line' }, { v: '3', l: '3 piles - triangle' }, { v: '4', l: '4 piles - square' }, { v: '5', l: '5 piles - square + centre' }, { v: '6r', l: '6 piles - 2 × 3' }, { v: '6c', l: '6 piles - 5 on circle + centre' }, { v: '7', l: '7 piles - hexagon + centre' }, { v: '8', l: '8 piles - 4 × 2' }, { v: '9', l: '9 piles - 3 × 3' }, { v: 'custom', l: 'Custom coordinates (table)' }];
  function layout(i) {
    const s = +i.s, P = [];
    const grid = (nx, ny) => { for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) P.push([(a - (nx - 1) / 2) * s, (b - (ny - 1) / 2) * s]); };
    const ring = (n, r, off) => { for (let k = 0; k < n; k++) { const t = off + 2 * Math.PI * k / n; P.push([r * Math.cos(t), r * Math.sin(t)]); } };
    switch (i.lay) {
      case '2': grid(2, 1); break;
      case '3': ring(3, s / Math.sqrt(3), Math.PI / 2); break;
      case '4': grid(2, 2); break;
      case '5': grid(2, 2); P.push([0, 0]); break;
      case '6r': grid(3, 2); break;
      case '6c': ring(5, s / (2 * Math.sin(Math.PI / 5)), Math.PI / 2); P.push([0, 0]); break;
      case '7': ring(6, s, 0); P.push([0, 0]); break;
      case '8': grid(4, 2); break;
      case '9': grid(3, 3); break;
      default: EC.rows(i.xy).forEach(r => P.push([r[0], r[1]]));
    }
    return P.map(p => ({ x: p[0], y: p[1] }));
  }
  EC.modules.pilecapstm = def({
    type: 'pilecapstm', name: 'Pile Cap - STM (2–9 piles / custom)', cat: 'foundations', prefix: 'PS', icon: 'pilecap', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\PileCap_Design',
    lib: ['EC2_Concrete\\PileCap_Design\\TwoPile', 'EC2_Concrete\\PileCap_Design\\ThreePile', 'EC2_Concrete\\PileCap_Design\\FourPile', 'EC2_Concrete\\PileCap_Design\\FivePile', 'EC2_Concrete\\PileCap_Design\\SixPile', 'EC2_Concrete\\PileCap_Design\\SevenPile', 'EC2_Concrete\\PileCap_Design\\EightPile', 'EC2_Concrete\\PileCap_Design\\NinePile'],
    groups: [
      { t: 'Pile layout', f: [F('lay', 'Layout', '', '3', LAY), F('s', 'Pile spacing s', 'mm', 1800), F('Dp', 'Pile diameter', 'mm', 600), F('ed', 'Edge distance (pile axis → edge)', 'mm', 600), F('Rcd', 'Pile capacity R_c;d', 'kN', 2600), T('xy', 'Custom pile coordinates (layout = custom)', ['x (mm)', 'y (mm)'], [[-900, -900], [900, -900], [900, 900], [-900, 900], [0, 0]])] },
      { t: 'Cap & column', f: [F('h', 'Cap depth h', 'mm', 1300), F('cx', 'Column c_x', 'mm', 600), F('cy', 'Column c_y', 'mm', 600), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Bottom cover', 'mm', 75), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'ULS actions', f: [F('N', 'N_Ed', 'kN', 5800), F('Mx', 'M about y (x-variation)', 'kNm', 300), F('My', 'M about x (y-variation)', 'kNm', 200), F('tol', 'Pile tolerance e', 'mm', 75)] },
      { t: 'Ties (bottom)', f: [F('nxb', 'Bars in x (total)', 'no', 16), F('dxb', 'x-bar ϕ', 'mm', 25, EC.barOpts), F('nyb', 'Bars in y (total)', 'no', 16), F('dyb', 'y-bar ϕ', 'mm', 25, EC.barOpts)] }
    ],
    schedCols: [['lay', 'Layout'], ['cap', 'Cap (m)'], ['tx', 'x ties'], ['ty', 'y ties'], ['R', 'R_max (kN)']],
    sched: (i, r) => ({ lay: (LAY.find(l => l.v === i.lay) || {}).l, cap: r && r.cap, tx: `${i.nxb}H${i.dxb}`, ty: `${i.nyb}H${i.dyb}`, R: r && r.Rmax ? Math.round(r.Rmax) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), h = +i.h, cx = +i.cx, cy = +i.cy, Dp = +i.Dp;
      const P = layout(i), n = P.length;
      c.text(`Pile cap on ${n} piles (${(LAY.find(l => l.v === i.lay) || {}).l}) by strut-and-tie (8.5): rigid-cap reactions with tolerance, struts from the column quarter points to every pile, tie forces in x and y, CCC / CCT node and strut stresses, one-way shear and column punching, tie anchorage.`);
      mat(c, m);
      const nu = 1 - m.fck / 250;
      c.h1('Geometry and reactions');
      const xs = P.map(p => p.x), ys = P.map(p => p.y);
      const B = Math.max(...xs) - Math.min(...xs) + 2 * i.ed, L = Math.max(...ys) - Math.min(...ys) + 2 * i.ed;
      c.q('Cap plan (bounding rectangle)', 'B × L', '', B, 'mm', '', false); c.q('', 'L', '', L, 'mm');
      if (i.lay === '3' || i.lay === '6c' || i.lay === '7') c.note('Cap weight from the bounding rectangle; chamfer the corners on the drawings.');
      const W = 1.35 * 25 * B * L * h / 1e9, Nt = +i.N + W;
      const cxg = xs.reduce((a, b) => a + b, 0) / n, cyg = ys.reduce((a, b) => a + b, 0) / n;
      P.forEach(p => { p.x -= cxg; p.y -= cyg; });
      const Ix = P.reduce((a, p) => a + p.x * p.x, 0) / 1e6, Iy = P.reduce((a, p) => a + p.y * p.y, 0) / 1e6;
      const Mx = Math.abs(i.Mx) + i.N * i.tol / 1000, My = Math.abs(i.My) + i.N * i.tol / 1000;
      P.forEach(p => { p.R = Nt / n + (Ix ? Mx * p.x / 1000 / Ix : 0) + (Iy ? My * p.y / 1000 / Iy : 0); });
      const Rmax = Math.max(...P.map(p => p.R)), Rmin = Math.min(...P.map(p => p.R));
      c.q('Cap self weight (factored)', 'G_Ed', '1.35 · 25 B L h', W, 'kN');
      c.tbl(['Pile', 'x (mm)', 'y (mm)', 'R (kN)'], P.map((p, k) => [k + 1, p.x, p.y, p.R]), [0, 0, 0, 0]);
      c.c('Pile compression', 'R_max/R_c;d', Rmax, +i.Rcd, 'kN', 'EN 1997-3', 'Pile capacity');
      c.ok({ l: 'No pile tension', cond: Rmin >= 0, txt: `R_min = ${fmt(Rmin)} kN`, item: 'Pile tension', r: '' });
      c.h1('Strut-and-tie model');
      const d = h - i.cnom - 100 - Math.max(i.dxb, i.dyb), z = 0.85 * d;
      c.q('Lever arm', 'z', '0.85 d (d below pile head embedment)', z, 'mm', '[practice]', true);
      let Tx = 0, Ty = 0, thMin = 90;
      [1, -1].forEach(sg => {
        let tx = 0, ty = 0;
        P.forEach(p => { const ux = sg * p.x - cx / 4, uy = sg * p.y - cy / 4; if (sg * p.x > 1) tx += p.R * Math.max(ux, 0) / z; if (sg * p.y > 1) ty += p.R * Math.max(uy, 0) / z; });
        Tx = Math.max(Tx, tx); Ty = Math.max(Ty, ty);
      });
      P.forEach(p => { const r = Math.hypot(Math.max(Math.abs(p.x) - cx / 4, 0), Math.max(Math.abs(p.y) - cy / 4, 0)); p.th = r > 1 ? EC.deg(Math.atan(z / r)) : 90; thMin = Math.min(thMin, p.th); });
      c.v({ l: 'Tie force in x', s: 'F_t;x', f: 'Σ R_i (x_i − c_x/4)/z  (one side of the column)', v: Tx, u: 'kN', key: true, r: '8.5' });
      c.v({ l: 'Tie force in y', s: 'F_t;y', f: 'Σ R_i (y_i − c_y/4)/z', v: Ty, u: 'kN', key: true });
      const Ax = i.nxb * EC.barA(i.dxb), Ay = i.nyb * EC.barA(i.dyb);
      c.c('x ties', 'F_t;x/(A_s f_yd)', Tx * 1e3 / m.fyd, Ax, 'mm²', '8.5', 'Ties in x');
      c.c('y ties', 'F_t;y/(A_s f_yd)', Ty * 1e3 / m.fyd, Ay, 'mm²', '8.5', 'Ties in y');
      c.note('Place ≥ 80 % of the tie bars in bands 1.5 D_p wide over the piles; the rest as a distributed grid.');
      c.q('Flattest strut', 'θ_min', 'atan(z/r_i)', thMin, '°');
      c.ok({ l: 'Strut angle', cond: thMin >= 26.5, txt: `θ_min = ${fmt(thMin, 1)}° ≥ 26.6° (cot θ ≤ 2)`, item: 'Strut angle', r: '[practice]' });
      c.h1('Nodes');
      c.c('Column node (CCC)', 'N/(c_x c_y)', i.N * 1e3 / (cx * cy), nu * m.fcd, 'MPa', '8.5.4', 'Column node CCC');
      const Ap = Math.PI * Dp * Dp / 4;
      c.c('Pile node (CCT), bearing', 'R/A_p', Rmax * 1e3 / Ap, 0.85 * nu * m.fcd, 'MPa', '8.5.4', 'Pile node CCT');
      const pc = P.reduce((a, p) => p.R * 1e3 / (Ap * Math.sin(EC.rad(p.th)) ** 2) > a.v ? { v: p.R * 1e3 / (Ap * Math.sin(EC.rad(p.th)) ** 2) } : a, { v: 0 });
      c.c('Strut at the pile node', 'R/(A_p sin²θ)', pc.v, 0.85 * nu * m.fcd, 'MPa', '8.5.2', 'Strut at pile node');
      c.h1('Shear and punching');
      const all2d = P.every(p => Math.abs(p.x) - cx / 2 <= 2 * d && Math.abs(p.y) - cy / 2 <= 2 * d);
      const rho = Math.sqrt(Ax / (L * d) * Ay / (B * d));
      [['x', 'x', cx, L], ['y', 'y', cy, B]].forEach(([tag, k, cc, wid]) => {
        let V = 0, av = Infinity;
        [1, -1].forEach(sg => { let v = 0; P.forEach(p => { const u = sg * p[k] - cc / 2; if (u > 0) { v += p.R; av = Math.min(av, u - 0.2 * Dp); } }); V = Math.max(V, v); });
        if (!V) return;
        const beta = Math.max(av, 0.5 * d) < 2 * d ? Math.max(av, 0.5 * d) / (2 * d) : 1;
        const tauE = beta * V * 1e3 / (wid * 0.9 * d), tR = EC.tauRdc(m, rho, d).t;
        c.c(`One-way shear ${tag} (β = ${fmt(beta, 2)} for a_v < 2d)`, 'τ_Ed/τ_Rd;c', tauE, tR, 'MPa', '8.2 [short-span reduction - verify]', `One-way shear ${tag}`);
      });
      const b05 = 2 * (cx + cy) + Math.PI * d, inside = P.filter(p => Math.abs(p.x) <= cx / 2 + d / 2 && Math.abs(p.y) <= cy / 2 + d / 2).reduce((a, p) => a + p.R, 0);
      const T2 = tauPunch(m, rho, d, 2 * (cx + cy), b05), tP = 1.15 * Math.max(0, i.N - inside) * 1e3 / (b05 * d);
      if (all2d) { c.note('All piles within 2d of the column: direct struts - column punching informative.'); c.c('Column punching (informative)', 'τ_Ed/τ_Rd;c', tP, T2.t, 'MPa', '8.4', false); }
      else c.c('Column punching', 'τ_Ed/τ_Rd;c', tP, T2.t, 'MPa', '8.4', 'Column punching');
      c.h1('Anchorage');
      const lb = EC.anchorage(c, { phi: +i.dxb, m, sigma: Tx * 1e3 / Ax, cd: +i.cnom, what: 'ties beyond the pile centre' });
      c.c('Anchorage beyond the inner pile face', 'l_bd', lb, +i.ed + Dp / 2 - i.cnom + 12 * i.dxb, 'mm', '11.4 [bobs / U-bars]', 'Tie anchorage');
      const sc = 300 / Math.max(B, L), ox = 210, oy = 190;
      const it = [{ c: 'conc', r: [ox - B / 2 * sc, oy - L / 2 * sc, B * sc, L * sc] }];
      P.forEach(p => { it.push({ c: 'strut', l: [[ox, oy], [ox + p.x * sc, oy - p.y * sc]] }); it.push({ c: 'pile', o: [ox + p.x * sc, oy - p.y * sc, Dp / 2 * sc] }); it.push({ c: 'lbl strong', t: [ox + p.x * sc, oy - p.y * sc + 4, Math.round(p.R), 'lbl strong', 'middle'] }); });
      it.push({ c: 'colfill', r: [ox - cx / 2 * sc, oy - cy / 2 * sc, cx * sc, cy * sc] }, { t: [ox + B / 2 * sc + 12, oy - 10, `F_t,x = ${fmt(Tx, 0)} kN`] }, { t: [ox + B / 2 * sc + 12, oy + 8, `F_t,y = ${fmt(Ty, 0)} kN`] });
      const svg = EC.sketch(560, 380, 'PLAN - PILE REACTIONS (kN) AND STRUTS', it);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Cap', `${fmt(B, 0)} × ${fmt(L, 0)} × ${h} mm`], ['Piles', `${n} × ϕ${Dp}, s = ${i.s} mm`], ['Ties', `x: ${i.nxb}H${i.dxb}, y: ${i.nyb}H${i.dyb} (80 % in bands over piles)`], ['Other', 'top mesh H16@200, side bars H12@250, pile embedment 100 mm']], bars: [], svg, Rmax, cap: `${fmt(B / 1000, 2)}×${fmt(L / 1000, 2)}×${h / 1000}` });
    }
  });

  /* ---------------- Single-pile cap ---------------- */
  EC.modules.pilecap1 = def({
    type: 'pilecap1', name: 'Pile Cap - Single Pile', cat: 'foundations', prefix: 'P1', icon: 'pilecap', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\PileCap_Design\\SinglePile',
    groups: [
      { t: 'Geometry', f: [F('Dp', 'Pile diameter', 'mm', 900), F('B', 'Cap size (square)', 'mm', 1300), F('h', 'Cap depth', 'mm', 1000), F('c', 'Column size (square)', 'mm', 500), F('tol', 'Pile position tolerance', 'mm', 75)] },
      { t: 'Materials & actions', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 75), F('N', 'N_Ed', 'kN', 4200), F('M', 'Column base moment M_Ed', 'kNm', 80), F('Rcd', 'Pile capacity R_c;d', 'kN', 5000), F('tie', 'Tie beam minimum tie force (% N)', '%', 2)] },
      { t: 'Reinforcement', f: [F('n', 'Bars each way (bottom)', 'no', 8), F('d', 'ϕ', 'mm', 20, EC.barOpts), F('nh', 'Horizontal links over depth', 'no', 4), F('dh', 'Link ϕ', 'mm', 16, EC.barOpts)] }
    ],
    schedCols: [['cap', 'Cap'], ['pile', 'Pile'], ['bars', 'Bottom EW'], ['links', 'Links']],
    sched: i => ({ cap: `${i.B}²×${i.h}`, pile: `ϕ${i.Dp}`, bars: `${i.n}H${i.d}`, links: `${i.nh}H${i.dh}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), nu = 1 - m.fck / 250, Dp = +i.Dp, cc = +i.c, h = +i.h;
      c.text('Cap on a single pile, column on the pile axis: pile load and head moment, load spreading from column to pile (bursting ties), tolerance and moment eccentricity, node checks, tie steel each way, horizontal links and anchorage.');
      mat(c, m);
      c.h1('Loads and nodes');
      const R = +i.N + 1.35 * 25 * i.B * i.B * h / 1e9;
      c.c('Pile load', 'R/R_c;d', R, +i.Rcd, 'kN', 'EN 1997-3', 'Pile capacity');
      c.c('Column node (CCC)', 'N/c²', i.N * 1e3 / (cc * cc), nu * m.fcd, 'MPa', '8.5.4', 'Column node');
      c.c('Pile head node', 'R/A_p', R * 1e3 / (Math.PI * Dp * Dp / 4), 0.85 * nu * m.fcd, 'MPa', '8.5.4', 'Pile node');
      c.h1('Ties');
      const z = 0.85 * (h - i.cnom - i.d);
      const Tsp = 0.25 * i.N * Math.max(0, 1 - cc / Dp);
      c.q('Spreading (bursting) force', 'T_sp', '0.25 N (1 − c/D_p)', Tsp, 'kN', '8.5.? [practice]');
      const e = i.tol / 1000 + Math.abs(i.M) / i.N;
      const Te = i.N * e / z * 1000 / 2;
      c.q('Eccentricity tie (tolerance + M/N)', 'T_e', 'N e/(2z)', Te, 'kN');
      const Tmin = i.tie / 100 * i.N;
      const Tt = Math.max(Tsp + Te, Tmin);
      c.v({ l: 'Design tie force each way', s: 'F_t', f: 'max(T_sp + T_e, tie-beam minimum)', v: Tt, u: 'kN', key: true });
      c.c('Bottom bars each way', 'F_t/(A_s f_yd)', Tt * 1e3 / m.fyd, i.n * EC.barA(i.d), 'mm²', '8.5', 'Bottom ties');
      c.c('Horizontal links (bursting over depth)', 'T_sp/(A f_yd)', Tsp * 1e3 / m.fyd, i.nh * 2 * EC.barA(i.dh), 'mm²', '[practice]', 'Bursting links');
      const lb = EC.anchorage(c, { phi: +i.d, m, sigma: Tt * 1e3 / (i.n * EC.barA(i.d)), cd: +i.cnom, what: 'bottom bars (U-bars)' });
      c.c('Anchorage', 'l_bd', lb, (i.B - Dp) / 2 + Dp / 2 - i.cnom + h - 2 * i.cnom, 'mm', '11.4 (U-bars up the sides)', 'Anchorage');
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Cap', `${i.B} × ${i.B} × ${h} mm on ϕ${Dp} pile`], ['Bottom', `${i.n}H${i.d} U-bars each way`], ['Links', `${i.nh} closed H${i.dh} round the cap`], ['Tie beams', `connect in two directions for ≥ ${i.tie} % N`]], bars: [], svg: '' });
    }
  });

  /* ---------------- Multi-column pile cap ---------------- */
  EC.modules.pilecapmulti = def({
    type: 'pilecapmulti', name: 'Pile Cap - Multi-column', cat: 'foundations', prefix: 'PM', icon: 'pilecap', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\PileCap_Design\\MultiColumn',
    groups: [
      { t: 'Columns / walls (nodes)', f: [T('nodes', 'Loads', ['x (mm)', 'y (mm)', 'c_x', 'c_y', 'N (kN)', 'M_x', 'M_y'], [[-1500, 0, 500, 500, 3200, 0, 120], [1500, 0, 500, 500, 2800, 0, 80]])] },
      { t: 'Piles', f: [T('piles', 'Pile coordinates', ['x (mm)', 'y (mm)'], [[-2700, -900], [-2700, 900], [-900, -900], [-900, 900], [900, -900], [900, 900], [2700, -900], [2700, 900]]), F('Dp', 'Pile diameter', 'mm', 600), F('ed', 'Edge distance', 'mm', 600), F('Rcd', 'Pile capacity R_c;d', 'kN', 1500)] },
      { t: 'Cap', f: [F('h', 'Cap depth', 'mm', 1300), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Bottom cover', 'mm', 75), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Reinforcement (per metre)', f: [F('dbx', 'Bottom x ϕ', 'mm', 25, EC.barOpts), F('sbx', 'spacing', 'mm', 150), F('dby', 'Bottom y ϕ', 'mm', 20, EC.barOpts), F('sby', 'spacing', 'mm', 150), F('dtx', 'Top x ϕ', 'mm', 20, EC.barOpts), F('stx', 'spacing', 'mm', 150), F('dty', 'Top y ϕ', 'mm', 16, EC.barOpts), F('sty', 'spacing', 'mm', 200)] }
    ],
    schedCols: [['n', 'Columns / piles'], ['h', 'h'], ['bx', 'Bottom x'], ['tx', 'Top x']],
    sched: i => ({ n: `${EC.rows(i.nodes).length} / ${EC.rows(i.piles).length}`, h: i.h, bx: `H${i.dbx}@${i.sbx}`, tx: `H${i.dtx}@${i.stx}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), h = +i.h;
      const Nd = EC.rows(i.nodes).map(r => ({ x: r[0], y: r[1], cx: r[2], cy: r[3], N: r[4], Mx: r[5] || 0, My: r[6] || 0 }));
      const P = EC.rows(i.piles).map(r => ({ x: r[0], y: r[1] }));
      c.text('Rigid pile cap under several columns / walls: loads typed node by node, piles by coordinates, rigid-cap reactions, cap strip scanned along x and y (sagging → bottom, hogging → top), one-way shear and punching at every column.');
      mat(c, m);
      if (!Nd.length || P.length < 2) { c.ok({ l: 'Input', cond: false, txt: 'Enter at least one column and two piles' }); return c.result({ spec: [], bars: [], svg: '' }); }
      c.h1('Pile reactions');
      const xs = P.map(p => p.x), ys = P.map(p => p.y);
      const B = Math.max(...xs) - Math.min(...xs) + 2 * i.ed, L = Math.max(...ys) - Math.min(...ys) + 2 * i.ed;
      const x0 = (Math.max(...xs) + Math.min(...xs)) / 2, y0 = (Math.max(...ys) + Math.min(...ys)) / 2;
      const W = 1.35 * 25 * B * L * h / 1e9;
      const n = P.length, xg = xs.reduce((a, b) => a + b, 0) / n, yg = ys.reduce((a, b) => a + b, 0) / n;
      const Ntot = Nd.reduce((a, d) => a + d.N, 0) + W;
      const Mgy = Nd.reduce((a, d) => a + d.N * (d.x - xg) / 1000 + d.My, 0) + W * (x0 - xg) / 1000;
      const Mgx = Nd.reduce((a, d) => a + d.N * (d.y - yg) / 1000 + d.Mx, 0) + W * (y0 - yg) / 1000;
      const Ix = P.reduce((a, p) => a + ((p.x - xg) / 1000) ** 2, 0), Iy = P.reduce((a, p) => a + ((p.y - yg) / 1000) ** 2, 0);
      P.forEach(p => { p.R = Ntot / n + (Ix ? Mgy * (p.x - xg) / 1000 / Ix : 0) + (Iy ? Mgx * (p.y - yg) / 1000 / Iy : 0); });
      c.q('Total load incl. cap', 'ΣN', '', Ntot, 'kN');
      c.tbl(['Pile', 'x', 'y', 'R (kN)'], P.map((p, k) => [k + 1, p.x, p.y, p.R]), 0);
      const Rmax = Math.max(...P.map(p => p.R));
      c.c('Pile capacity', 'R_max/R_c;d', Rmax, +i.Rcd, 'kN', 'EN 1997-3', 'Pile capacity');
      c.ok({ l: 'No pile tension', cond: Math.min(...P.map(p => p.R)) >= 0, txt: `R_min = ${fmt(Math.min(...P.map(p => p.R)))} kN`, item: 'Pile tension' });
      const scan = (k, len, wid, x0c) => {
        const out = [], N = 120;
        const lo = (k === 'x' ? Math.min(...xs) : Math.min(...ys)) - i.ed;
        for (let s = 0; s <= N; s++) {
          const cut = lo + s / N * len; let M = 0, V = 0;
          P.forEach(p => { if (p[k] < cut) { M += p.R * (cut - p[k]) / 1000; V += p.R; } });
          Nd.forEach(d => { if (d[k] < cut) { M -= d.N * (cut - d[k]) / 1000 + (k === 'x' ? d.My : d.Mx); V -= d.N; } });
          const wcap = 25 * 1.35 * wid * h / 1e6 * ((cut - lo) / 1000);
          M -= wcap * (cut - lo) / 2000; V -= wcap;
          out.push([cut / 1000, M, V]);
        }
        return out;
      };
      const Sx = scan('x', B, L), Sy = scan('y', L, B);
      const dbx = h - i.cnom - 100 - i.dbx / 2, dby = dbx - i.dbx / 2 - i.dby / 2, dtx = h - 50 - i.dtx / 2, dty = dtx - i.dtx / 2 - i.dty / 2;
      const des = (tag, S, wid, db, dt, Ab, At, phb, sb, pht, st) => {
        c.h1(`Bending and shear along ${tag}`);
        const Mp = Math.max(0, ...S.map(s => s[1])), Mn = Math.max(0, ...S.map(s => -s[1]));
        c.q('Max sagging (bottom)', `M_Ed;${tag};bot`, 'scan of cuts', Mp, 'kNm'); c.q('Max hogging (top)', `M_Ed;${tag};top`, '', Mn, 'kNm');
        EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mp / (wid / 1000), b: 1000, d: db, As: Ab, m, barTxt: `H${phb}@${sb}`, tag: tag + ';bot', item: `Bottom ${tag}` });
        const Atmin = Math.max(0.0013 * 1000 * dt, 0.25 * Ab * 0);
        if (Mn > 0) EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mn / (wid / 1000), b: 1000, d: dt, As: At, m, barTxt: `H${pht}@${st}`, tag: tag + ';top', item: `Top ${tag}` });
        else c.c('Top shrinkage steel', 'A_s;top', Atmin, At, 'mm²/m', '[practice]', `Top ${tag} (nominal)`);
        let Vm = 0; Nd.forEach(d => { const cc = tag === 'x' ? d.cx : d.cy, xx = tag === 'x' ? d.x : d.y; [xx - cc / 2 - db, xx + cc / 2 + db].forEach(cut => { const s = S.reduce((a, q) => Math.abs(q[0] * 1000 - cut) < Math.abs(a[0] * 1000 - cut) ? q : a); Vm = Math.max(Vm, Math.abs(s[2])); }); });
        const sh = EC.shearNoLinks(c, { V: Vm / (wid / 1000), b: 1000, d: db, As: Ab, m });
        c.c(`One-way shear ${tag} (at d from faces)`, 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', `One-way shear ${tag}`);
      };
      const Abx = EC.barA(i.dbx) * 1000 / i.sbx, Aby = EC.barA(i.dby) * 1000 / i.sby, Atx = EC.barA(i.dtx) * 1000 / i.stx, Aty = EC.barA(i.dty) * 1000 / i.sty;
      des('x', Sx, L, dbx, dtx, Abx, Atx, i.dbx, i.sbx, i.dtx, i.stx);
      des('y', Sy, B, dby, dty, Aby, Aty, i.dby, i.sby, i.dty, i.sty);
      c.h1('Punching at columns');
      const dv = (dbx + dby) / 2, rho = Math.sqrt(Abx / (1000 * dbx) * Aby / (1000 * dby));
      Nd.forEach((d, k) => {
        const b05 = 2 * (d.cx + d.cy) + Math.PI * dv;
        const inside = P.filter(p => Math.abs(p.x - d.x) <= d.cx / 2 + dv / 2 && Math.abs(p.y - d.y) <= d.cy / 2 + dv / 2).reduce((a, p) => a + p.R, 0);
        const R = tauPunch(m, rho, dv, 2 * (d.cx + d.cy), b05), tE = 1.15 * Math.max(0, d.N - inside) * 1e3 / (b05 * dv);
        const near = P.filter(p => Math.abs(p.x - d.x) - d.cx / 2 <= 2 * dv && Math.abs(p.y - d.y) - d.cy / 2 <= 2 * dv).length === P.length;
        c.c(`Column ${k + 1}${near ? ' (informative - direct struts)' : ''}`, 'τ_Ed/τ_Rd;c', tE, R.t, 'MPa', '8.4', near ? false : `Punching column ${k + 1}`);
      });
      const sc = 300 / Math.max(B, L), cxp = 220, cyp = 180;
      const it = [{ c: 'conc', r: [cxp + (Math.min(...xs) - i.ed - x0) * sc, cyp - (Math.max(...ys) + +i.ed - y0) * sc, B * sc, L * sc] }];
      P.forEach(p => { it.push({ c: 'pile', o: [cxp + (p.x - x0) * sc, cyp - (p.y - y0) * sc, i.Dp / 2 * sc] }, { t: [cxp + (p.x - x0) * sc, cyp - (p.y - y0) * sc + 4, Math.round(p.R), 'lbl strong', 'middle'] }); });
      Nd.forEach(d => it.push({ c: 'colfill', r: [cxp + (d.x - x0 - d.cx / 2) * sc, cyp - (d.y - y0 + d.cy / 2) * sc, d.cx * sc, d.cy * sc] }));
      const svg = EC.sketch(460, 360, 'PLAN - REACTIONS (kN)', it) + EC.plot({ title: 'M along x / y', xl: 'position (m)', yl: 'M (kNm)', series: [{ name: 'M_x-strip', pts: Sx.map(s => [s[0], s[1]]) }, { name: 'M_y-strip', pts: Sy.map(s => [s[0], s[1]]), cls: 1 }], legend: true });
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Cap', `${fmt(B, 0)} × ${fmt(L, 0)} × ${h} mm, ${Nd.length} columns, ${P.length} piles ϕ${i.Dp}`], ['Bottom', `x H${i.dbx}@${i.sbx}, y H${i.dby}@${i.sby}`], ['Top', `x H${i.dtx}@${i.stx}, y H${i.dty}@${i.sty}`]], bars: [], svg });
    }
  });

  /* ---------------- Pile cap from FE shell forces ---------------- */
  EC.modules.pilecapfem = def({
    type: 'pilecapfem', name: 'Pile Cap from FE Forces', cat: 'foundations', prefix: 'PF', icon: 'pilecap', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\PileCap_Design\\FEM',
    groups: [
      { t: 'FE design strips (ULS, per m)', f: [T('rows', 'Shell forces at design points', ['m_x', 'm_y', 'm_xy', 'v_x', 'v_y'], [[820, 610, 140, 250, 180], [540, 700, -90, 160, 230], [-210, -120, 60, 60, 40], [300, 260, 30, 310, 120]])] },
      { t: 'Cap', f: [F('h', 'Thickness', 'mm', 1300), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cb', 'Bottom cover (+ pile embedment)', 'mm', 175), F('ct', 'Top cover', 'mm', 50), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Reinforcement (per m)', f: [F('dbx', 'Bottom x ϕ', 'mm', 25, EC.barOpts), F('sbx', 'spacing', 'mm', 150), F('dby', 'Bottom y ϕ', 'mm', 25, EC.barOpts), F('sby', 'spacing', 'mm', 150), F('dt', 'Top ϕ (both ways)', 'mm', 16, EC.barOpts), F('stp', 'spacing', 'mm', 200)] }
    ],
    schedCols: [['h', 'h'], ['bx', 'Bottom x'], ['by', 'Bottom y'], ['top', 'Top']],
    sched: i => ({ h: i.h, bx: `H${i.dbx}@${i.sbx}`, by: `H${i.dby}@${i.sby}`, top: `H${i.dt}@${i.stp}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), h = +i.h, R = EC.rows(i.rows);
      c.text('Pile cap (or any thick slab) designed from FE shell forces exported from ETABS / SAFE: Wood-Armer moments for bottom and top steel in x and y, shear without links at each design point.');
      mat(c, m);
      const dbx = h - i.cb - i.dbx / 2, dby = dbx - i.dbx / 2 - i.dby / 2, dtx = h - i.ct - i.dt / 2, dty = dtx - i.dt;
      const Abx = EC.barA(i.dbx) * 1000 / i.sbx, Aby = EC.barA(i.dby) * 1000 / i.sby, At = EC.barA(i.dt) * 1000 / i.stp;
      const wa = (mx, my, mxy) => {
        let bx = mx + Math.abs(mxy), by = my + Math.abs(mxy);
        if (bx < 0 && by < 0) { bx = 0; by = 0; } else if (bx < 0) { bx = 0; by = my + Math.abs(mxy * mxy / (mx || 1e-9)); } else if (by < 0) { by = 0; bx = mx + Math.abs(mxy * mxy / (my || 1e-9)); }
        let tx = -(mx - Math.abs(mxy)), ty = -(my - Math.abs(mxy));
        if (tx < 0 && ty < 0) { tx = 0; ty = 0; } else if (tx < 0) { tx = 0; ty = -(my - Math.abs(mxy * mxy / (mx || 1e-9))); } else if (ty < 0) { ty = 0; tx = -(mx - Math.abs(mxy * mxy / (my || 1e-9))); }
        return [Math.max(bx, 0), Math.max(by, 0), Math.max(tx, 0), Math.max(ty, 0)];
      };
      c.h1('Wood-Armer design moments');
      const rows = [];
      let worst = { bx: 0, by: 0, tx: 0, ty: 0, v: 0 };
      R.forEach(([mx, my, mxy, vx, vy], k) => {
        const [bx, by, tx, ty] = wa(mx, my, mxy), v = Math.hypot(vx, vy);
        rows.push([k + 1, bx, by, tx, ty, v]);
        worst = { bx: Math.max(worst.bx, bx), by: Math.max(worst.by, by), tx: Math.max(worst.tx, tx), ty: Math.max(worst.ty, ty), v: Math.max(worst.v, v) };
      });
      c.tbl(['Point', 'm*_x;bot', 'm*_y;bot', 'm*_x;top', 'm*_y;top', 'v_0 (kN/m)'], rows, 0);
      c.note('Wood-Armer: m*_bot = m + |m_xy| (with the standard corrections when one value is negative).');
      c.h1('Bending');
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: worst.bx, b: 1000, d: dbx, As: Abx, m, barTxt: `H${i.dbx}@${i.sbx}`, tag: 'x;bot', item: 'Bottom x' });
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: worst.by, b: 1000, d: dby, As: Aby, m, barTxt: `H${i.dby}@${i.sby}`, tag: 'y;bot', item: 'Bottom y' });
      if (worst.tx > 0) EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: worst.tx, b: 1000, d: dtx, As: At, m, barTxt: `H${i.dt}@${i.stp}`, tag: 'x;top', item: 'Top x' });
      if (worst.ty > 0) EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: worst.ty, b: 1000, d: dty, As: At, m, barTxt: `H${i.dt}@${i.stp}`, tag: 'y;top', item: 'Top y' });
      c.h1('Shear (principal v_0)');
      const sh = EC.shearNoLinks(c, { V: worst.v, b: 1000, d: dby, As: Math.min(Abx, Aby), m });
      c.c('Shear without links', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'Shear (worst point)');
      c.note('Near piles and columns (a_v < 2d) shear reduction or STM may apply - use the dedicated pile-cap modules for those zones.');
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Cap', `h = ${h} mm`], ['Bottom', `x H${i.dbx}@${i.sbx}, y H${i.dby}@${i.sby}`], ['Top', `H${i.dt}@${i.stp} both ways`]], bars: [], svg: '' });
    }
  });
})();
