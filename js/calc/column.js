/* RC column - rectangular, biaxial bending + axial force, slenderness by nominal curvature */
(function () {
  const F = EC.F;

  /* bar layers for bending about one axis: depth H (bending direction), W (width), nH bars along H-faces (incl. corners), nW along W-faces */
  function layers(H, nH, nW, dc, As1) {
    const L = [];
    L.push({ y: dc, As: nW * As1 });
    for (let k = 1; k < nH - 1; k++) L.push({ y: dc + k * (H - 2 * dc) / (nH - 1), As: 2 * As1 });
    L.push({ y: H - dc, As: nW * As1 });
    return L;
  }
  /* section forces for neutral axis depth x (from compression face) */
  function forces(x, H, W, Ls, m) {
    const ecu = 0.0035;
    const eps = y => x <= H ? ecu * (x - y) / x : 0.002 * (x - y) / (x - 3 * H / 7);
    const yb = Math.min(0.8 * x, H);
    const Cc = m.fcd * W * yb;
    let N = Cc, M = Cc * (H / 2 - yb / 2);
    Ls.forEach(l => {
      let sg = EC.clamp(m.Es * eps(l.y), -m.fyd, m.fyd);
      if (l.y < yb && sg > 0) sg -= m.fcd;
      N += l.As * sg; M += l.As * sg * (H / 2 - l.y);
    });
    return { N: N / 1e3, M: M / 1e6 };
  }
  function MRd(N, H, W, Ls, m) {
    let lo = 1e-3 * H, hi = 1e4 * H;
    const fl = forces(lo, H, W, Ls, m).N, fh = forces(hi, H, W, Ls, m).N;
    if (N > fh || N < fl) return { M: 0, x: null };
    for (let k = 0; k < 80; k++) { const x = (lo + hi) / 2; if (forces(x, H, W, Ls, m).N > N) hi = x; else lo = x; }
    const x = (lo + hi) / 2;
    return { M: Math.max(0, forces(x, H, W, Ls, m).M), x };
  }
  function curve(H, W, Ls, m) {
    const pts = [];
    for (let k = 0; k <= 60; k++) { const x = H * Math.pow(10, -2.2 + k * 3.4 / 60); const f = forces(x, H, W, Ls, m); pts.push([f.M, f.N]); }
    return pts;
  }

  function axis(c, o) {
    const { tag, H, W, Ls, m, N, M1, M2, l, beta, phiEf, As, Ac, dc } = o;
    c.h2(`Bending about ${tag}-axis (depth ${H} mm)`);
    const l0 = beta * l * 1000;
    const iR = H / Math.sqrt(12);
    const lam = l0 / iR;
    c.v({ l: 'Effective length', s: `l_0;${tag}`, f: 'β l', n: `${beta}·${l * 1000}`, v: l0, u: 'mm', r: '7.4 [verify]' });
    c.v({ l: 'Slenderness', s: `λ_${tag}`, f: 'l_0/i,  i = h/√12', n: `${EC.fmt(l0)}/${EC.fmt(iR)}`, v: lam, u: '' });
    const n = N * 1e3 / (Ac * m.fcd);
    const w = As * m.fyd / (Ac * m.fcd);
    const a01 = Math.abs(M1), a02 = Math.abs(M2);
    const M02 = Math.max(a01, a02), M01s = (a01 <= a02 ? M1 : M2), M02s = (a01 <= a02 ? M2 : M1);
    const rm = M02 > 0 ? M01s / M02s : 1;
    const A = 1 / (1 + 0.2 * phiEf), B = Math.sqrt(1 + 2 * w), C = 1.7 - rm;
    const lamLim = 20 * A * B * C / Math.sqrt(Math.max(n, 1e-3));
    c.v({ l: 'Relative axial force', s: 'n', f: 'N_Ed/(A_c f_cd)', v: n, u: '' });
    c.v({ l: 'Mechanical reinforcement ratio', s: 'ω', f: 'A_s f_yd/(A_c f_cd)', v: w, u: '' });
    c.v({ l: 'Slenderness limit', s: 'λ_lim', f: '20 A B C/√n,  A = 1/(1+0.2φ_ef), B = √(1+2ω), C = 1.7 − r_m', n: `A = ${EC.fmt(A, 3)}, B = ${EC.fmt(B, 3)}, C = ${EC.fmt(C, 3)}`, v: lamLim, u: '', r: 'EN 1992-1-1:2004 5.8.3.1 [verify 2023 7.4]' });
    const ei = l0 / 400;
    const e0 = Math.max(H / 30, 20);
    c.v({ l: 'Geometric imperfection', s: 'e_i', f: 'l_0/400', v: ei, u: 'mm', r: '5.2 / 7.2' });
    let MEd;
    const M02d = M02 + N * ei / 1000;
    if (lam > lamLim) {
      c.note(`λ = ${EC.fmt(lam)} > λ_lim = ${EC.fmt(lamLim)}: slender - second order effects by nominal curvature.`);
      const d = H - dc;
      const nu = 1 + w, Kr = EC.clamp((nu - n) / (nu - 0.4), 0, 1);
      const bet = 0.35 + m.fck / 200 - lam / 150;
      const Kphi = Math.max(1, 1 + bet * phiEf);
      const r0 = m.eyd / (0.45 * d);
      const rinv = Kr * Kphi * r0;
      const e2 = rinv * l0 * l0 / 10;
      const M0e = Math.max(0.6 * M02s + 0.4 * M01s, 0.4 * M02s) * Math.sign(M02s || 1);
      c.v({ l: 'Correction factor (axial load)', s: 'K_r', f: '(n_u − n)/(n_u − n_bal) ≤ 1', v: Kr, u: '' });
      c.v({ l: 'Creep factor', s: 'K_φ', f: '1 + β φ_ef ≥ 1', v: Kphi, u: '' });
      c.v({ l: 'Curvature', s: '1/r', f: 'K_r K_φ ε_yd/(0.45 d)', v: rinv * 1000, u: '1/m', dp: 5 });
      c.v({ l: 'Second order eccentricity', s: 'e_2', f: '(1/r) l_0²/10', v: e2, u: 'mm', r: '7.4 / 5.8.8.2' });
      c.v({ l: 'Equivalent first order moment', s: 'M_0e', f: 'max(0.6 M_02 + 0.4 M_01, 0.4 M_02)', v: Math.abs(M0e), u: 'kNm' });
      MEd = Math.max(Math.abs(M0e) + N * (ei + e2) / 1000, M02d, N * e0 / 1000);
      c.v({ l: 'Design moment', s: `M_Ed;${tag}`, f: 'max(M_0e + N(e_i + e_2), M_02 + N e_i, N e_0)', v: MEd, u: 'kNm', key: true });
    } else {
      c.note(`λ = ${EC.fmt(lam)} ≤ λ_lim = ${EC.fmt(lamLim)}: second order effects may be ignored.`);
      MEd = Math.max(M02d, N * e0 / 1000);
      c.v({ l: 'Design moment', s: `M_Ed;${tag}`, f: 'max(M_02 + N e_i, N e_0),  e_0 = max(h/30, 20 mm)', v: MEd, u: 'kNm', key: true });
    }
    const R = MRd(N, H, W, Ls, m);
    c.v({ l: 'Moment resistance at N_Ed (strain compatibility)', s: `M_Rd;${tag}`, f: 'ε_cu = 3.5 ‰, λ = 0.8, steel elastic-plastic', n: R.x ? `x = ${EC.fmt(R.x)} mm` : 'N outside range', v: R.M, u: 'kNm', r: '8.1', key: true });
    c.chk({ l: `Uniaxial bending ${tag}`, s: `M_Ed;${tag}/M_Rd;${tag}`, Ed: MEd, Rd: R.M, u: 'kNm', r: '8.1', item: `Bending about ${tag}` });
    return { MEd, MRd: R.M, lam, lamLim, curve: curve(H, W, Ls, m) };
  }

  EC.modules.column = {
    type: 'column', name: 'RC Column', cat: 'columns', prefix: 'C', icon: 'column',
    code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Column_Design',
    groups: [
      { t: 'Geometry', f: [F('b', 'Width b (z-direction)', 'mm', 400), F('h', 'Depth h (y-direction)', 'mm', 500), F('l', 'Clear height l', 'm', 3.6), F('by', 'Effective length factor β_y', '', 1.0), F('bz', 'Effective length factor β_z', '', 1.0), F('phi', 'Effective creep ratio φ_ef', '', 1.0)] },
      { t: 'Materials & durability', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('exp', 'Exposure class', '', 'XC1', EC.EXPO), F('cnom', 'Nominal cover c_nom', 'mm', 35)] },
      { t: 'Design actions (ULS)', f: [F('N', 'Axial force N_Ed (compression +)', 'kN', 2400), F('My1', 'M_y top', 'kNm', 90), F('My2', 'M_y bottom', 'kNm', -45), F('Mz1', 'M_z top', 'kNm', 30), F('Mz2', 'M_z bottom', 'kNm', 20)] },
      { t: 'Reinforcement', f: [F('nh', 'Bars along h-face (incl. corners)', 'no', 4), F('nb', 'Bars along b-face (incl. corners)', 'no', 3), F('dl', 'Bar ϕ', 'mm', 20, EC.barOpts), F('dw', 'Link ϕ_w', 'mm', 10, EC.barOpts), F('sw', 'Link spacing s', 'mm', 250)] }
    ],
    schedCols: [['size', 'Size b×h (mm)'], ['height', 'Height (m)'], ['bars', 'Main bars'], ['links', 'Links'], ['N', 'N_Ed (kN)'], ['M', 'M_y / M_z (kNm)']],
    sched: i => ({ size: `${i.b}×${i.h}`, height: i.l, bars: `${2 * (+i.nh + +i.nb) - 4}H${i.dl}`, links: `H${i.dw}@${i.sw}`, N: i.N, M: `${Math.max(Math.abs(i.My1), Math.abs(i.My2))} / ${Math.max(Math.abs(i.Mz1), Math.abs(i.Mz2))}` }),
    calc(i) {
      const c = new EC.Calc();
      const m = EC.mat(i.fck, i.fyk);
      const b = +i.b, h = +i.h, N = +i.N, nh = Math.max(2, +i.nh), nb = Math.max(2, +i.nb);
      const nTot = 2 * (nh + nb) - 4;
      const A1 = EC.barA(i.dl), As = nTot * A1, Ac = b * h;
      const dc = +i.cnom + +i.dw + i.dl / 2;
      c.text(`Rectangular RC column under N + M_y + M_z: slenderness, second order effects (nominal curvature), section resistance by strain compatibility, biaxial interaction and detailing. ${this.code}; slenderness clauses quoted from the 2004 edition where marked [verify].`);
      c.h1('Materials');
      c.inp('Concrete class', 'f_ck', m.fck, 'MPa', 'Table 5.1');
      c.v({ l: 'Design compressive strength', s: 'f_cd', f: 'η_cc f_ck/γ_C', v: m.fcd, u: 'MPa', r: '5.1.6', key: true });
      c.v({ l: 'Design yield strength', s: 'f_yd', f: 'f_yk/γ_S', v: m.fyd, u: 'MPa', r: '5.2.4', key: true });
      c.v({ l: 'Design yield strain', s: 'ε_yd', f: 'f_yd/E_s', v: m.eyd * 1000, u: '‰', dp: 3 });
      c.h1('Section');
      c.v({ l: 'Concrete area', s: 'A_c', f: 'b h', v: Ac, u: 'mm²' });
      c.v({ l: 'Number of bars', s: 'n_bars', f: '2(n_h + n_b) − 4', v: nTot, u: '', dp: 0 });
      c.v({ l: 'Longitudinal steel', s: 'A_s', f: `${nTot} ϕ${i.dl}`, v: As, u: 'mm²' });
      c.v({ l: 'Axis distance of bars', s: 'd_c', f: 'c_nom + ϕ_w + ϕ/2', v: dc, u: 'mm' });
      const NRd = (Ac * m.fcd + As * (m.fyd - m.fcd)) / 1e3;
      c.v({ l: 'Squash load', s: 'N_Rd', f: 'A_c f_cd + A_s (f_yd − f_cd)', v: NRd, u: 'kN', key: true });
      c.chk({ l: 'Axial force', s: 'N_Ed/N_Rd', Ed: N, Rd: NRd, u: 'kN', r: '8.1', item: 'Axial compression' });

      c.h1('Slenderness and design moments');
      const Ly = layers(h, nh, nb, dc, A1), Lz = layers(b, nb, nh, dc, A1);
      const ry = axis(c, { tag: 'y', H: h, W: b, Ls: Ly, m, N, M1: +i.My1, M2: +i.My2, l: +i.l, beta: +i.by, phiEf: +i.phi, As, Ac, dc });
      const rz = axis(c, { tag: 'z', H: b, W: h, Ls: Lz, m, N, M1: +i.Mz1, M2: +i.Mz2, l: +i.l, beta: +i.bz, phiEf: +i.phi, As, Ac, dc });

      c.h1('Biaxial bending');
      const nr = N / NRd;
      const a = nr <= 0.1 ? 1 : nr >= 1 ? 2 : nr <= 0.7 ? 1 + (nr - 0.1) / 0.6 * 0.5 : 1.5 + (nr - 0.7) / 0.3 * 0.5;
      c.v({ l: 'Exponent', s: 'a', f: 'N_Ed/N_Rd: 0.1 → 1.0, 0.7 → 1.5, 1.0 → 2.0', n: `N_Ed/N_Rd = ${EC.fmt(nr, 3)}`, v: a, u: '', r: '5.8.9 [verify]' });
      const Ub = Math.pow(ry.MEd / Math.max(ry.MRd, 1e-6), a) + Math.pow(rz.MEd / Math.max(rz.MRd, 1e-6), a);
      c.chk({ l: 'Biaxial interaction', s: '(M_Edy/M_Rdy)^a + (M_Edz/M_Rdz)^a', Ed: Ub, Rd: 1, u: '', r: '5.8.9', item: 'Biaxial bending' });

      c.h1('Detailing');
      const Asmin = Math.max(0.1 * N * 1e3 / m.fyd, 0.002 * Ac);
      c.chk({ l: 'Minimum longitudinal steel', s: 'A_s;min', f: 'max(0.10 N_Ed/f_yd, 0.002 A_c)', Ed: Asmin, Rd: As, u: 'mm²', r: '12.5 [NDP]', item: 'Minimum steel' });
      c.chk({ l: 'Maximum longitudinal steel', s: 'A_s;max', f: '0.04 A_c (outside laps)', Ed: As, Rd: 0.04 * Ac, u: 'mm²', r: '12.5 [NDP]', item: 'Maximum steel' });
      c.chk({ l: 'Link diameter', s: 'ϕ_w;min', f: 'max(6, ϕ/4)', Ed: Math.max(6, i.dl / 4), Rd: +i.dw, u: 'mm', r: '12.5', item: 'Link diameter' });
      const smax = Math.min(20 * i.dl, b, h, 400);
      c.chk({ l: 'Link spacing', s: 's_cl;max', f: 'min(20ϕ, b, 400)', Ed: +i.sw, Rd: smax, u: 'mm', r: '12.5 [NDP]', item: 'Link spacing' });
      c.note(`Reduce link spacing to 0.6 s_cl,max = ${EC.fmt(0.6 * smax, 0)} mm within max(b, h) above and below beams/slabs and at laps (ϕ > 14).`);
      const sh = (h - 2 * dc) / (nh - 1) - i.dl, sb = (b - 2 * dc) / (nb - 1) - i.dl;
      c.chk({ l: 'Minimum clear bar spacing', s: 's_cl', f: 'max(ϕ, 25, 20)', Ed: Math.max(+i.dl, 25), Rd: Math.min(sh, sb), u: 'mm', r: '11.2', item: 'Bar spacing' });
      const lbd = EC.anchorage(c, { phi: +i.dl, m, sigma: m.fyd, cd: Math.min(+i.cnom + +i.dw, Math.min(sh, sb) / 2), what: 'compression lap / starter bars' });

      const plots =
        EC.plot({ title: 'N–M_y interaction', xl: 'M_y (kNm)', yl: 'N (kN)', series: [{ name: 'M_Rd,y', pts: ry.curve }], points: [{ x: ry.MEd, y: N, t: 'Ed', ok: ry.MEd <= ry.MRd }] }) +
        EC.plot({ title: 'N–M_z interaction', xl: 'M_z (kNm)', yl: 'N (kN)', series: [{ name: 'M_Rd,z', pts: rz.curve, cls: 2 }], points: [{ x: rz.MEd, y: N, t: 'Ed', ok: rz.MEd <= rz.MRd }] });
      const Hmm = i.l * 1000;
      const spec = [
        ['Concrete', EC.concName(i.fck)], ['Exposure / cover', `${i.exp}, c_nom = ${i.cnom} mm`],
        ['Section', `${b} × ${h} mm, clear height ${i.l} m`],
        ['Main bars', `${nTot} H${i.dl} (ρ = ${EC.fmt(100 * As / Ac, 2)} %)`],
        ['Links', `H${i.dw} @ ${i.sw} mm, @ ${Math.floor(0.6 * smax / 25) * 25} mm at ends and laps`],
        ['Laps / starters', `l_0 ≈ ${Math.ceil(1.2 * lbd / 10) * 10} mm (stagger where ρ > 2 %)`],
        ['Design point', `N_Ed = ${N} kN, M_Ed,y = ${EC.fmt(ry.MEd)} kNm, M_Ed,z = ${EC.fmt(rz.MEd)} kNm`]
      ];
      const bars = [
        { mark: '01', dia: +i.dl, n: nTot, len: Math.round(Hmm + 1.2 * lbd), shape: 'Straight + lap' },
        { mark: '02', dia: +i.dw, n: Math.ceil(Hmm / (0.8 * i.sw)) + 1, len: Math.round(2 * (b + h - 4 * i.cnom) + 20 * i.dw), shape: 'Closed link, 135° hooks' }
      ];
      if (nh > 2 || nb > 2) bars.push({ mark: '03', dia: +i.dw, n: (Math.ceil(Hmm / (0.8 * i.sw)) + 1) * Math.max(0, Math.max(nh, nb) - 3), len: Math.round(Math.max(b, h) - 2 * i.cnom + 20 * i.dw), shape: 'Cross tie (restrain alternate bars)' });
      return c.result({ spec, bars, svg: draw(i, dc, nh, nb) + plots });
    }
  };

  function draw(i, dc, nh, nb) {
    const S = EC.svg, b = +i.b, h = +i.h;
    const sc = 220 / Math.max(b, h);
    const W = b * sc, H = h * sc, ox = 60, oy = 34;
    let s = S.open(420, H + 80);
    s += S.label(ox, 18, 'COLUMN SECTION', 'ttl');
    s += `<rect class="conc" x="${ox}" y="${oy}" width="${W}" height="${H}"/>`;
    const cl = +i.cnom + i.dw / 2;
    s += `<rect class="link" x="${ox + cl * sc}" y="${oy + cl * sc}" width="${(b - 2 * cl) * sc}" height="${(h - 2 * cl) * sc}" rx="${i.dw * sc * 1.5}"/>`;
    const pts = [];
    for (let k = 0; k < nb; k++) { const x = dc + k * (b - 2 * dc) / (nb - 1); pts.push([x, dc], [x, h - dc]); }
    for (let k = 1; k < nh - 1; k++) { const y = dc + k * (h - 2 * dc) / (nh - 1); pts.push([dc, y], [b - dc, y]); }
    pts.forEach(p => { s += S.bar(ox + p[0] * sc, oy + p[1] * sc, i.dl / 2 * sc); });
    s += S.dimH(ox, ox + W, oy + H + 20, `b = ${b}`);
    s += S.dimV(ox - 20, oy, oy + H, `h = ${h}`);
    s += S.label(ox + W + 10, oy + 14, `${pts.length}H${i.dl}`);
    s += S.label(ox + W + 10, oy + 32, `H${i.dw}@${i.sw}`);
    s += `<g class="axisg"><line x1="${ox + W / 2}" y1="${oy - 10}" x2="${ox + W / 2}" y2="${oy + H + 10}"/><line x1="${ox - 10}" y1="${oy + H / 2}" x2="${ox + W + 10}" y2="${oy + H / 2}"/><text x="${ox + W + 14}" y="${oy + H / 2 + 4}">y</text><text x="${ox + W / 2 + 4}" y="${oy + H + 22}">z</text></g>`;
    return s + '</svg>';
  }
})();
