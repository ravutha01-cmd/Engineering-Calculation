/* Foundations: isolated pad footing and pile cap (rigid cap, n_x × n_y piles) */
(function () {
  const F = EC.F;

  /* ---------------- Pad footing ---------------- */
  EC.modules.footing = {
    type: 'footing', name: 'Pad Footing', cat: 'foundations', prefix: 'F', icon: 'footing',
    code: 'EN 1992-1-1:2023 / EN 1997', mathcad: 'EC2_Concrete\\PadFooting_Design',
    groups: [
      { t: 'Geometry', f: [F('B', 'Length B (x)', 'm', 2.9), F('Lf', 'Width L (y)', 'm', 2.9), F('h', 'Thickness h', 'mm', 750), F('cx', 'Column c_x', 'mm', 450), F('cy', 'Column c_y', 'mm', 450), F('Ds', 'Soil cover above footing', 'm', 1.0)] },
      { t: 'Materials & ground', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('cnom', 'Bottom cover c_nom', 'mm', 50), F('Dl', 'Aggregate D_lower', 'mm', 16), F('gs', 'Soil unit weight γ_s', 'kN/m³', 18), F('qa', 'Allowable bearing pressure (SLS)', 'kPa', 250)] },
      { t: 'Column actions', f: [F('NEd', 'ULS N_Ed', 'kN', 1800), F('MEx', 'ULS M_Ed (eccentric in x)', 'kNm', 90), F('MEy', 'ULS M_Ed (eccentric in y)', 'kNm', 40), F('Nk', 'SLS N_k', 'kN', 1300), F('Mkx', 'SLS M_k (x)', 'kNm', 65), F('Mky', 'SLS M_k (y)', 'kNm', 30)] },
      { t: 'Reinforcement (bottom)', f: [F('dx', 'Bars along x ϕ', 'mm', 16, EC.barOpts), F('sx', 'Spacing x-bars', 'mm', 150), F('dy', 'Bars along y ϕ', 'mm', 16, EC.barOpts), F('sy', 'Spacing y-bars', 'mm', 150), F('be', 'Punching β_e', '', 1.15)] }
    ],
    schedCols: [['size', 'B × L × h'], ['col', 'Column (mm)'], ['botx', 'Bottom x'], ['boty', 'Bottom y'], ['N', 'N_Ed / N_k (kN)'], ['q', 'q_allow (kPa)']],
    sched: i => ({ size: `${i.B} × ${i.Lf} × ${(i.h / 1000).toFixed(2)} m`, col: `${i.cx}×${i.cy}`, botx: `H${i.dx}@${i.sx}`, boty: `H${i.dy}@${i.sy}`, N: `${i.NEd} / ${i.Nk}`, q: i.qa }),
    calc(i) {
      const c = new EC.Calc();
      const m = EC.mat(i.fck, i.fyk, i.Dl);
      const B = +i.B, L = +i.Lf, h = +i.h, A = B * L, cx = +i.cx, cy = +i.cy;
      c.text('Isolated RC pad footing under N + biaxial M: SLS bearing pressure and kern, ULS bending at the column faces, one-way shear, punching (8.4) and anchorage. Pressure linear (rigid footing), loads at the column base.');
      c.h1('SLS bearing pressure');
      const Gf = 25 * A * h / 1000 + i.gs * (A - cx * cy / 1e6) * i.Ds;
      c.v({ l: 'Footing + soil weight', s: 'G_f', f: '25 B L h + γ_s (B L − A_col) D_s', v: Gf, u: 'kN' });
      const P = +i.Nk + Gf;
      c.v({ l: 'Total vertical load', s: 'P_k', f: 'N_k + G_f', v: P, u: 'kN' });
      const ex = i.Mkx / P, ey = i.Mky / P;
      c.v({ l: 'Eccentricities', s: 'e_x', f: 'M_k;x/P_k', v: ex, u: 'm', n: `e_y = ${EC.fmt(ey, 3)} m` });
      const kern = Math.abs(ex) / B + Math.abs(ey) / L;
      c.chk({ l: 'Resultant inside the kern', s: 'e_x/B + e_y/L', Ed: kern, Rd: 1 / 6, u: '', r: 'EN 1997 [practice]', item: 'Kern (no uplift)' });
      const qmax = P / A * (1 + 6 * Math.abs(ex) / B + 6 * Math.abs(ey) / L);
      const qmin = P / A * (1 - 6 * Math.abs(ex) / B - 6 * Math.abs(ey) / L);
      c.v({ l: 'Maximum / minimum pressure', s: 'q_max', f: 'P/A (1 ± 6e_x/B ± 6e_y/L)', v: qmax, u: 'kPa', n: `q_min = ${EC.fmt(qmin)} kPa` });
      c.chk({ l: 'Bearing pressure', s: 'q_max/q_allow', Ed: qmax, Rd: +i.qa, u: 'kPa', r: 'EN 1997 (allowable, SLS)', item: 'Bearing pressure' });

      c.h1('ULS ground pressure (net, for structural design)');
      const qu = i.NEd / A, qux = qu * (1 + 6 * Math.abs(i.MEx / i.NEd) / B), quy = qu * (1 + 6 * Math.abs(i.MEy / i.NEd) / L);
      c.v({ l: 'Mean net pressure', s: 'σ_Ed', f: 'N_Ed/(B L)', v: qu, u: 'kPa' });
      c.v({ l: 'Edge pressure for x-bending', s: 'σ_Ed;x', f: 'σ_Ed (1 + 6 e_x/B)', v: qux, u: 'kPa' });
      c.v({ l: 'Edge pressure for y-bending', s: 'σ_Ed;y', f: 'σ_Ed (1 + 6 e_y/L)', v: quy, u: 'kPa' });

      const dxx = h - i.cnom - i.dx / 2, dyy = h - i.cnom - i.dx - i.dy / 2;
      const Asx = EC.barA(i.dx) * 1000 / i.sx, Asy = EC.barA(i.dy) * 1000 / i.sy;
      const dir = (tag, Bd, cdim, q1, d, As, sp, Lw, barTxt) => {
        c.h1(`Bending and one-way shear - ${tag}-direction`);
        const a = (Bd * 1000 - cdim) / 2 / 1000;
        const qf = qu + (q1 - qu) * (cdim / 2 / 1000) / (Bd / 2);
        const M = Lw * (qf * a * a / 2 + (q1 - qf) * a * a / 3);
        c.v({ l: 'Cantilever from column face', s: `a_${tag}`, f: `(B − c_${tag})/2`, v: a, u: 'm' });
        c.v({ l: 'Moment at column face (full width)', s: `M_Ed;${tag}`, f: 'L [σ_face a²/2 + (σ_edge − σ_face) a²/3]', v: M, u: 'kNm', key: true });
        c.v({ l: 'Effective depth', s: `d_${tag}`, v: d, u: 'mm' });
        const r = EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: M / Lw, b: 1000, d, As, m, barTxt, tag, item: `Bending ${tag}` });
        const Asmin = Math.max(0.26 * m.fctm / m.fyk * 1000 * d, 0.0013 * 1000 * d);
        c.chk({ l: 'Minimum steel', s: 'A_s;min', Ed: Asmin, Rd: As, u: 'mm²/m', r: '12.2', item: `Minimum steel ${tag}` });
        c.chk({ l: 'Bar spacing', s: 's', Ed: sp, Rd: 250, u: 'mm', r: '12.3 [practice]', item: `Bar spacing ${tag}` });
        const av = a - d / 1000;
        if (av > 0) {
          const qd = qf + (q1 - qf) * (d / 1000) / a;
          const V = (qd + q1) / 2 * av;
          c.v({ l: 'Shear at d from face (per m)', s: `V_Ed;${tag}`, f: '(σ_d + σ_edge)/2 · (a − d)', v: V, u: 'kN/m' });
          const sh = EC.shearNoLinks(c, { V, b: 1000, d, As, m });
          c.chk({ l: 'One-way shear', s: 'τ_Ed/τ_Rd;c', Ed: sh.tauEd, Rd: sh.tauRdc, u: 'MPa', r: '8.2.2', item: `One-way shear ${tag}` });
        } else c.note('Shear plane at d lies outside the footing - one-way shear not critical.');
        return r;
      };
      const rx = dir('x', B, cx, qux, dxx, Asx, +i.sx, L, `H${i.dx}@${i.sx}`);
      const ry = dir('y', L, cy, quy, dyy, Asy, +i.sy, B, `H${i.dy}@${i.sy}`);

      c.h1('Punching at the column');
      const dv = (dxx + dyy) / 2;
      const b0 = 2 * (cx + cy), b05 = b0 + Math.PI * dv;
      const Ain = (cx * cy + dv * (cx + cy) + Math.PI * dv * dv / 4) / 1e6;
      c.v({ l: 'Effective depth', s: 'd_v', f: '(d_x + d_y)/2', v: dv, u: 'mm' });
      c.v({ l: 'Control perimeter', s: 'b_0.5', f: '2(c_x + c_y) + π d_v', v: b05, u: 'mm', r: '8.4.2' });
      const Vred = Math.max(0, i.NEd - qu * Math.min(Ain, A));
      c.v({ l: 'Reduced punching force', s: 'V_Ed;red', f: 'N_Ed − σ_Ed A_inside', n: `A_inside = ${EC.fmt(Ain, 3)} m²`, v: Vred, u: 'kN' });
      const tauEd = i.be * Vred * 1e3 / (b05 * dv);
      c.v({ l: 'Punching shear stress', s: 'τ_Ed', f: 'β_e V_Ed;red/(b_0.5 d_v)', v: tauEd, u: 'MPa' });
      const rho = Math.min(Math.sqrt(Asx / (1000 * dxx) * Asy / (1000 * dyy)), 0.02);
      const kpb = EC.clamp(3.6 * Math.sqrt(1 - b0 / b05), 1, 2.5);
      const tRdc = Math.min(0.6 / m.gV * kpb * Math.pow(100 * rho * m.fck * m.ddg / dv, 1 / 3), 0.5 / m.gV * Math.sqrt(m.fck));
      c.v({ l: 'Punching resistance', s: 'τ_Rd;c', f: '0.6/γ_V k_pb (100 ρ_l f_ck d_dg/d_v)^(1/3)', n: `k_pb = ${EC.fmt(kpb)}, ρ_l = ${EC.fmt(rho, 4)}`, v: tRdc, u: 'MPa', r: '8.4.3', key: true });
      c.note('Enhancement for compact footings with a_pd (8.4.3) not applied - conservative. Refine with Mathcad PadFooting_EC2-2023.');
      c.chk({ l: 'Punching', s: 'τ_Ed/τ_Rd;c', Ed: tauEd, Rd: tRdc, u: 'MPa', r: '8.4', item: 'Punching' });

      c.h1('Anchorage of bottom bars');
      const ax = EC.anchorage(c, { phi: +i.dx, m, sigma: m.fyd * Math.min(1, rx.AsReq / Asx), cd: Math.min(+i.cnom, i.sx / 2), what: 'x-bars' });
      const avail = (B * 1000 - cx) / 2 - i.cnom;
      c.chk({ l: 'Straight length available beyond column face', s: 'l_bd ≤ l_avail', Ed: ax, Rd: avail + 12 * i.dx, u: 'mm', r: '11.4 [use end bends if not OK]', item: 'Anchorage x' });

      const bars = [
        { mark: '01', dia: +i.dx, n: Math.floor((L * 1000 - 2 * i.cnom) / i.sx) + 1, len: Math.round(B * 1000 - 2 * i.cnom + 2 * 10 * i.dx), shape: 'U-ends 10ϕ up' },
        { mark: '02', dia: +i.dy, n: Math.floor((B * 1000 - 2 * i.cnom) / i.sy) + 1, len: Math.round(L * 1000 - 2 * i.cnom + 2 * 10 * i.dy), shape: 'U-ends 10ϕ up' }
      ];
      const spec = [['Concrete', `${EC.concName(i.fck)}, blinding 50–75 mm C12/15`], ['Cover', `${i.cnom} mm bottom/sides (cast against blinding)`], ['Footing', `${B} × ${L} × ${h / 1000} m, top ${i.Ds} m below ground`], ['Bottom bars x', `H${i.dx} @ ${i.sx} (${EC.fmt(Asx, 0)} mm²/m)`], ['Bottom bars y', `H${i.dy} @ ${i.sy} (${EC.fmt(Asy, 0)} mm²/m)`], ['Ground', `q_allow = ${i.qa} kPa, q_max = ${EC.fmt(qmax, 0)} kPa (SLS)`], ['Column starters', 'Lap with column bars, L-bars on the bottom mat']];
      return c.result({ spec, bars, svg: drawF(i, dv) });
    }
  };
  function drawF(i, dv) {
    const B = i.B * 1000, L = i.Lf * 1000, cx = +i.cx, cy = +i.cy, h = +i.h;
    const sc = 220 / Math.max(B, L), ox = 50, oy = 36;
    let s = EC.svg.open(760, 320);
    s += EC.svg.label(ox, 20, 'PLAN', 'ttl');
    s += `<rect class="conc" x="${ox}" y="${oy}" width="${B * sc}" height="${L * sc}"/>`;
    const nx = Math.min(30, Math.floor(L / i.sx)), ny = Math.min(30, Math.floor(B / i.sy));
    for (let k = 0; k <= nx; k++) { const y = oy + (i.cnom + k * (L - 2 * i.cnom) / nx) * sc; s += `<line class="rebarline thin" x1="${ox + 4}" x2="${ox + B * sc - 4}" y1="${y}" y2="${y}"/>`; }
    for (let k = 0; k <= ny; k++) { const x = ox + (i.cnom + k * (B - 2 * i.cnom) / ny) * sc; s += `<line class="rebarline thin alt" y1="${oy + 4}" y2="${oy + L * sc - 4}" x1="${x}" x2="${x}"/>`; }
    const mx = ox + B / 2 * sc, my = oy + L / 2 * sc;
    s += `<rect class="perim" x="${mx - (cx / 2 + dv / 2) * sc}" y="${my - (cy / 2 + dv / 2) * sc}" width="${(cx + dv) * sc}" height="${(cy + dv) * sc}" rx="${dv / 2 * sc}"/>`;
    s += `<rect class="colfill" x="${mx - cx / 2 * sc}" y="${my - cy / 2 * sc}" width="${cx * sc}" height="${cy * sc}"/>`;
    s += EC.svg.dimH(ox, ox + B * sc, oy + L * sc + 18, `B = ${i.B} m`);
    s += EC.svg.dimV(ox - 18, oy, oy + L * sc, `L = ${i.Lf} m`);
    /* section */
    const sx0 = 380, sw = 340, ss = sw / B, hy = 120;
    s += EC.svg.label(sx0, 20, 'SECTION', 'ttl');
    s += `<rect class="conc" x="${sx0}" y="${hy}" width="${sw}" height="${h * ss}"/><rect class="colfill" x="${sx0 + sw / 2 - cx / 2 * ss}" y="${hy - 70}" width="${cx * ss}" height="70"/>`;
    const yb = hy + h * ss - (i.cnom) * ss;
    s += `<polyline class="rebarline" points="${sx0 + 6},${yb - 10 * i.dx * ss} ${sx0 + 6},${yb} ${sx0 + sw - 6},${yb} ${sx0 + sw - 6},${yb - 10 * i.dx * ss}"/>`;
    s += EC.svg.dimV(sx0 + sw + 22, hy, hy + h * ss, `h = ${h}`);
    s += EC.svg.label(sx0, yb + 30, `H${i.dx}@${i.sx} (x) / H${i.dy}@${i.sy} (y), cover ${i.cnom}`);
    const gy = Math.max(34, hy - i.Ds * 1000 * ss);
    s += `<line class="ground" x1="${sx0 - 10}" x2="${sx0 + sw + 10}" y1="${gy}" y2="${gy}"/>` + EC.svg.label(sx0 + sw - 70, gy - 4, `ground, D_s = ${i.Ds} m`);
    return s + '</svg>';
  }

  /* ---------------- Pile cap ---------------- */
  EC.modules.pilecap = {
    type: 'pilecap', name: 'Pile Cap', cat: 'foundations', prefix: 'PC', icon: 'pilecap',
    code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\PileCap_Design',
    groups: [
      { t: 'Piles', f: [F('nx', 'Piles in x', 'no', 2), F('ny', 'Piles in y', 'no', 2), F('Dp', 'Pile diameter D_p', 'mm', 600), F('spx', 'Spacing s_x', 'mm', 1800), F('spy', 'Spacing s_y', 'mm', 1800), F('ed', 'Edge distance (pile axis → edge)', 'mm', 600), F('Rcd', 'Pile design capacity R_c;d', 'kN', 2600), F('Rtd', 'Pile tension capacity R_t;d', 'kN', 0)] },
      { t: 'Cap & column', f: [F('h', 'Cap depth h', 'mm', 1400), F('cx', 'Column c_x', 'mm', 600), F('cy', 'Column c_y', 'mm', 600), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('cnom', 'Bottom cover c_nom', 'mm', 75), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'ULS actions at cap top', f: [F('NEd', 'N_Ed', 'kN', 7600), F('MEx', 'M_Ed causing x-variation', 'kNm', 420), F('MEy', 'M_Ed causing y-variation', 'kNm', 250), F('etol', 'Pile position tolerance', 'mm', 75)] },
      { t: 'Reinforcement (bottom)', f: [F('dx', 'Bars along x ϕ', 'mm', 25, EC.barOpts), F('sx', 'Spacing x-bars', 'mm', 125), F('dy', 'Bars along y ϕ', 'mm', 25, EC.barOpts), F('sy', 'Spacing y-bars', 'mm', 125), F('enh', 'Short shear span enhancement (1 = on)', '', 1)] }
    ],
    schedCols: [['piles', 'Piles'], ['size', 'Cap B × L × h (m)'], ['botx', 'Bottom x'], ['boty', 'Bottom y'], ['N', 'N_Ed (kN)'], ['R', 'R_max (kN)']],
    sched: (i, r) => { const g = geo(i); return { piles: `${i.nx * i.ny} × ϕ${i.Dp}`, size: `${(g.B / 1000).toFixed(2)} × ${(g.L / 1000).toFixed(2)} × ${(i.h / 1000).toFixed(2)}`, botx: `H${i.dx}@${i.sx}`, boty: `H${i.dy}@${i.sy}`, N: i.NEd, R: r && r.Rmax ? Math.round(r.Rmax) : '–' }; },
    calc(i) {
      const c = new EC.Calc();
      const m = EC.mat(i.fck, i.fyk, i.Dl);
      const g = geo(i), h = +i.h, cx = +i.cx, cy = +i.cy;
      c.text(`Rigid pile cap on ${i.nx} × ${i.ny} piles, column at the centroid: pile reactions, bending at the column faces, one-way shear, column punching and anchorage (${this.code}). For STM node checks use the dedicated Mathcad PileCap worksheets.`);
      c.h1('Geometry and pile reactions');
      c.v({ l: 'Cap plan size', s: 'B × L', v: g.B, u: 'mm', n: `${EC.fmt(g.B, 0)} × ${EC.fmt(g.L, 0)} mm` });
      const W = 1.35 * 25 * g.B * g.L * h / 1e9;
      c.v({ l: 'Cap self weight (factored)', s: 'G_Ed', f: '1.35 · 25 B L h', v: W, u: 'kN' });
      const Nt = +i.NEd + W;
      const Ix = g.P.reduce((a, p) => a + p.x * p.x, 0) / 1e6, Iy = g.P.reduce((a, p) => a + p.y * p.y, 0) / 1e6;
      const tol = i.etol / 1000;
      const Mx = Math.abs(i.MEx) + i.NEd * tol, My = Math.abs(i.MEy) + i.NEd * tol;
      c.v({ l: 'Moments incl. tolerance', s: 'M_x;tot', f: 'M_Ed + N_Ed e_tol', v: Mx, u: 'kNm', n: `M_y;tot = ${EC.fmt(My)} kNm` });
      g.P.forEach(p => { p.R = Nt / g.n + (Ix > 0 ? Mx * (p.x / 1000) / Ix : 0) + (Iy > 0 ? My * (p.y / 1000) / Iy : 0); });
      const Rmax = Math.max(...g.P.map(p => p.R)), Rmin = Math.min(...g.P.map(p => p.R));
      c.v({ l: 'Pile reaction', s: 'R_i', f: '(N_Ed + G_Ed)/n + M_x x_i/Σx² + M_y y_i/Σy²', v: Rmax, u: 'kN', n: `n = ${g.n}`, key: true });
      c.v({ l: 'Minimum pile reaction', s: 'R_min', v: Rmin, u: 'kN' });
      c.chk({ l: 'Pile compression', s: 'R_max/R_c;d', Ed: Rmax, Rd: +i.Rcd, u: 'kN', r: 'EN 1997-3', item: 'Pile capacity (compression)' });
      if (Rmin < 0) c.chk({ l: 'Pile tension', s: '|R_min|/R_t;d', Ed: -Rmin, Rd: +i.Rtd, u: 'kN', r: 'EN 1997-3', item: 'Pile capacity (tension)' });
      c.chk({ l: 'Pile spacing', s: 's_min', f: '≥ 2.5 D_p [practice]', Ed: 2.5 * i.Dp, Rd: Math.min(i.nx > 1 ? +i.spx : 1e9, i.ny > 1 ? +i.spy : 1e9), u: 'mm', item: 'Pile spacing' });

      const dxx = h - i.cnom - 100 - i.dx / 2, dyy = dxx - i.dx / 2 - i.dy / 2;
      c.note('Bars sit on top of the pile heads: effective depth taken from 100 mm pile embedment + cover.');
      const Asx = EC.barA(i.dx) * 1000 / i.sx, Asy = EC.barA(i.dy) * 1000 / i.sy;
      const out = { Rmax };
      const dir = (tag, coord, cdim, d, As, width, barTxt) => {
        c.h1(`Bending and shear - ${tag}-direction`);
        const face = cdim / 2;
        let M = 0, V = 0, av = Infinity;
        [1, -1].forEach(sg => {
          let Ms = 0, Vs = 0;
          g.P.forEach(p => { const u = sg * p[coord]; if (u > face) { Ms += p.R * (u - face) / 1000; Vs += p.R; av = Math.min(av, u - face - 0.2 * i.Dp); } });
          M = Math.max(M, Ms); V = Math.max(V, Vs);
        });
        c.v({ l: 'Moment at column face (full width)', s: `M_Ed;${tag}`, f: 'Σ R_i (x_i − c/2)', v: M, u: 'kNm', key: true });
        c.v({ l: 'Effective depth', s: `d_${tag}`, v: d, u: 'mm' });
        const r = EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: M / (width / 1000), b: 1000, d, As, m, barTxt, tag, item: `Bending ${tag}` });
        const Asmin = Math.max(0.26 * m.fctm / m.fyk * 1000 * d, 0.0013 * 1000 * d);
        c.chk({ l: 'Minimum steel', s: 'A_s;min', Ed: Asmin, Rd: As, u: 'mm²/m', r: '12.2', item: `Minimum steel ${tag}` });
        if (V > 0) {
          const avc = Math.max(av, 0.5 * d);
          const beta = +i.enh && avc < 2 * d ? avc / (2 * d) : 1;
          c.v({ l: 'Shear at column face', s: `V_Ed;${tag}`, f: 'Σ R_i beyond face', v: V, u: 'kN' });
          if (beta < 1) c.v({ l: 'Shear span reduction (piles within 2d)', s: 'β', f: 'a_v/(2d),  a_v = x_pile − c/2 − 0.2 D_p ≥ 0.5 d', v: beta, u: '', r: '[practice, EN 1992-1-1:2004 6.2.2(6) - verify 2023 8.2]' });
          const sh = EC.shearNoLinks(c, { V: V / (width / 1000), b: 1000, d, As, m, beta: beta < 1 ? beta : undefined });
          c.chk({ l: 'One-way shear', s: 'τ_Ed/τ_Rd;c', Ed: sh.tauEd, Rd: sh.tauRdc, u: 'MPa', r: '8.2.2', item: `One-way shear ${tag}` });
        }
        return r;
      };
      const rx = dir('x', 'x', cx, dxx, Asx, g.L, `H${i.dx}@${i.sx}`);
      dir('y', 'y', cy, dyy, Asy, g.B, `H${i.dy}@${i.sy}`);

      c.h1('Column punching');
      const dv = (dxx + dyy) / 2;
      const all2d = g.P.every(p => Math.abs(p.x) - cx / 2 <= 2 * dv && Math.abs(p.y) - cy / 2 <= 2 * dv);
      const b05 = 2 * (cx + cy) + Math.PI * dv;
      const inside = g.P.filter(p => Math.abs(p.x) <= cx / 2 + dv / 2 && Math.abs(p.y) <= cy / 2 + dv / 2).reduce((a, p) => a + p.R, 0);
      const Vp = Math.max(0, +i.NEd - inside);
      const tauEd = 1.15 * Vp * 1e3 / (b05 * dv);
      c.v({ l: 'Control perimeter', s: 'b_0.5', f: '2(c_x + c_y) + π d_v', v: b05, u: 'mm' });
      c.v({ l: 'Punching stress', s: 'τ_Ed', f: '1.15 (N_Ed − ΣR_inside)/(b_0.5 d_v)', v: tauEd, u: 'MPa' });
      const rho = Math.min(Math.sqrt(Asx / (1000 * dxx) * Asy / (1000 * dyy)), 0.02);
      const kpb = EC.clamp(3.6 * Math.sqrt(1 - 2 * (cx + cy) / b05), 1, 2.5);
      const tRdc = Math.min(0.6 / m.gV * kpb * Math.pow(100 * rho * m.fck * m.ddg / dv, 1 / 3), 0.5 / m.gV * Math.sqrt(m.fck));
      c.v({ l: 'Punching resistance', s: 'τ_Rd;c', f: '0.6/γ_V k_pb (100 ρ_l f_ck d_dg/d_v)^(1/3)', v: tRdc, u: 'MPa', r: '8.4.3' });
      if (all2d) { c.note('All piles lie within 2 d_v of the column faces: load goes by direct struts - punching check informative only.'); c.chk({ l: 'Column punching (informative)', s: 'τ_Ed/τ_Rd;c', Ed: tauEd, Rd: tRdc, u: 'MPa', r: '8.4', item: false }); }
      else c.chk({ l: 'Column punching', s: 'τ_Ed/τ_Rd;c', Ed: tauEd, Rd: tRdc, u: 'MPa', r: '8.4', item: 'Column punching' });

      c.h1('Detailing');
      const lb = EC.anchorage(c, { phi: +i.dx, m, sigma: m.fyd * Math.min(1, rx.AsReq / Asx), cd: Math.min(+i.cnom, i.sx / 2), what: 'bottom ties beyond pile centre' });
      c.chk({ l: 'Anchorage beyond inner face of pile', s: 'l_bd ≤ l_avail', f: 'edge − cover + D_p/2 + bend', Ed: lb, Rd: +i.ed - i.cnom + i.Dp / 2 + 12 * i.dx, u: 'mm', r: '11.4 [use bobs/U-bars if not OK]', item: 'Tie anchorage' });
      c.note('Provide side face bars (≥ H12 @ 250) and top nominal mesh (≥ H16 @ 200) - 12.x [practice].');
      const bars = [
        { mark: '01', dia: +i.dx, n: Math.floor((g.L - 2 * i.cnom) / i.sx) + 1, len: Math.round(g.B - 2 * i.cnom + 2 * (h - 2 * i.cnom)), shape: 'U-bar (bottom x)' },
        { mark: '02', dia: +i.dy, n: Math.floor((g.B - 2 * i.cnom) / i.sy) + 1, len: Math.round(g.L - 2 * i.cnom + 2 * (h - 2 * i.cnom)), shape: 'U-bar (bottom y)' },
        { mark: '03', dia: 16, n: Math.floor(g.L / 200) + Math.floor(g.B / 200) + 2, len: Math.round(Math.max(g.B, g.L) - 2 * i.cnom), shape: 'Top mesh H16@200' },
        { mark: '04', dia: 12, n: 2 * Math.ceil((h - 2 * i.cnom) / 250), len: Math.round(2 * (g.B + g.L) - 8 * i.cnom + 500), shape: 'Side bars (closed), H12@250' }
      ];
      const spec = [['Concrete', EC.concName(i.fck)], ['Cover', `${i.cnom} mm bottom/sides; piles embedded 100 mm`], ['Cap', `${EC.fmt(g.B, 0)} × ${EC.fmt(g.L, 0)} × ${h} mm`], ['Piles', `${g.n} × ϕ${i.Dp}, s = ${i.spx} / ${i.spy} mm, R_c;d = ${i.Rcd} kN`], ['Bottom x', `H${i.dx} @ ${i.sx} U-bars`], ['Bottom y', `H${i.dy} @ ${i.sy} U-bars`], ['Top / sides', 'H16 @ 200 top mesh, H12 @ 250 side bars'], ['Max pile load', `${EC.fmt(Rmax, 0)} kN`]];
      return c.result(Object.assign({ spec, bars, svg: drawP(i, g) }, out));
    }
  };
  function geo(i) {
    const nx = Math.max(1, +i.nx), ny = Math.max(1, +i.ny);
    const P = [];
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) P.push({ x: (a - (nx - 1) / 2) * i.spx, y: (b - (ny - 1) / 2) * i.spy });
    return { P, n: P.length, B: (nx - 1) * i.spx + 2 * i.ed, L: (ny - 1) * i.spy + 2 * i.ed };
  }
  function drawP(i, g) {
    const sc = 300 / Math.max(g.B, g.L), cx0 = 220, cy0 = 190;
    let s = EC.svg.open(560, 380);
    s += EC.svg.label(20, 20, 'PLAN - PILE REACTIONS (kN)', 'ttl');
    s += `<rect class="conc" x="${cx0 - g.B / 2 * sc}" y="${cy0 - g.L / 2 * sc}" width="${g.B * sc}" height="${g.L * sc}"/>`;
    s += `<rect class="tieband" x="${cx0 - g.B / 2 * sc}" y="${cy0 - g.L / 2 * sc + (i.ed - 0.75 * i.Dp) * sc}" width="${g.B * sc}" height="${1.5 * i.Dp * sc}"/>`;
    if (i.ny > 1) s += `<rect class="tieband" x="${cx0 - g.B / 2 * sc}" y="${cy0 + g.L / 2 * sc - (i.ed + 0.75 * i.Dp) * sc}" width="${g.B * sc}" height="${1.5 * i.Dp * sc}"/>`;
    g.P.forEach(p => {
      const x = cx0 + p.x * sc, y = cy0 - p.y * sc;
      s += `<circle class="pile" cx="${x}" cy="${y}" r="${i.Dp / 2 * sc}"><title>R = ${EC.fmt(p.R || 0)} kN</title></circle>`;
      s += `<line class="strut" x1="${cx0}" y1="${cy0}" x2="${x}" y2="${y}"/>`;
      s += `<text class="lbl strong" x="${x}" y="${y + 4}" text-anchor="middle">${p.R ? Math.round(p.R) : ''}</text>`;
    });
    s += `<rect class="colfill" x="${cx0 - i.cx / 2 * sc}" y="${cy0 - i.cy / 2 * sc}" width="${i.cx * sc}" height="${i.cy * sc}"/>`;
    s += EC.svg.dimH(cx0 - g.B / 2 * sc, cx0 + g.B / 2 * sc, cy0 + g.L / 2 * sc + 20, `B = ${EC.fmt(g.B, 0)}`);
    s += EC.svg.dimV(cx0 - g.B / 2 * sc - 20, cy0 - g.L / 2 * sc, cy0 + g.L / 2 * sc, `L = ${EC.fmt(g.L, 0)}`);
    s += EC.svg.label(cx0 + g.B / 2 * sc + 14, cy0 - 10, `x: H${i.dx}@${i.sx}`);
    s += EC.svg.label(cx0 + g.B / 2 * sc + 14, cy0 + 8, `y: H${i.dy}@${i.sy}`);
    s += EC.svg.label(cx0 + g.B / 2 * sc + 14, cy0 + 26, `h = ${i.h}`);
    return s + '</svg>';
  }
})();
