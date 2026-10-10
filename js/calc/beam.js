/* RC beam - rectangular section, EN 1992-1-1:2023 */
(function () {
  const F = EC.F;
  const SPANS = [
    { v: 1.0, l: 'Simply supported (K = 1.0)' },
    { v: 1.3, l: 'End span of continuous beam (K = 1.3)' },
    { v: 1.5, l: 'Interior span (K = 1.5)' },
    { v: 0.4, l: 'Cantilever (K = 0.4)' }
  ];
  EC.modules.beam = {
    type: 'beam', name: 'RC Beam', cat: 'beams', prefix: 'B', icon: 'beam',
    code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Beam_Design',
    groups: [
      { t: 'Geometry', f: [F('b', 'Width b', 'mm', 300), F('h', 'Overall depth h', 'mm', 600), F('L', 'Effective span L', 'm', 6.5), F('K', 'Span type', '', 1.0, SPANS)] },
      { t: 'Materials & durability', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('exp', 'Exposure class', '', 'XC1', EC.EXPO), F('cnom', 'Nominal cover c_nom', 'mm', 30), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Design actions (ULS)', f: [F('MEd', 'Sagging moment M_Ed', 'kNm', 260), F('MEdh', 'Hogging moment M_Ed;hog', 'kNm', 0), F('VEd', 'Shear force V_Ed', 'kN', 190), F('psi', 'SLS ratio M_qp / M_Ed', '', 0.55)] },
      { t: 'Reinforcement', f: [F('nb', 'Bottom bars n', 'no', 4), F('db', 'Bottom bar ϕ', 'mm', 20, EC.barOpts), F('nt', 'Top bars n', 'no', 2), F('dt', 'Top bar ϕ', 'mm', 16, EC.barOpts), F('dw', 'Link ϕ_w', 'mm', 10, EC.barOpts), F('legs', 'Link legs', 'no', 2), F('sw', 'Link spacing s', 'mm', 175)] }
    ],
    schedCols: [['size', 'Size b×h (mm)'], ['span', 'Span (m)'], ['bot', 'Bottom'], ['top', 'Top'], ['links', 'Links'], ['MEd', 'M_Ed (kNm)'], ['VEd', 'V_Ed (kN)']],
    sched: i => ({ size: `${i.b}×${i.h}`, span: i.L, bot: `${i.nb}H${i.db}`, top: `${i.nt}H${i.dt}`, links: `H${i.dw}@${i.sw} (${i.legs}L)`, MEd: i.MEd, VEd: i.VEd }),
    calc(i) {
      const c = new EC.Calc();
      const m = EC.mat(i.fck, i.fyk, i.Dl);
      c.text(`Rectangular reinforced concrete beam: bending, shear, deflection, crack control and detailing to ${this.code}. Units kN, m, mm, MPa.`);

      c.h1('Materials');
      c.inp('Concrete class', 'f_ck', m.fck, 'MPa', 'Table 5.1');
      c.v({ l: 'Mean compressive strength', s: 'f_cm', f: 'f_ck + 8', v: m.fcm, u: 'MPa', r: '5.1.4' });
      c.v({ l: 'Mean tensile strength', s: 'f_ctm', f: '0.30 f_ck^(2/3)', v: m.fctm, u: 'MPa', r: 'Table 5.1' });
      c.v({ l: 'Modulus of elasticity', s: 'E_cm', f: '9500 f_cm^(1/3)', v: m.Ecm, u: 'MPa', r: '5.1.4' });
      c.v({ l: 'Strength factor', s: 'η_cc', f: '(40/f_ck)^(1/3) ≤ 1', v: m.etacc, u: '', r: '5.1.6' });
      c.v({ l: 'Design compressive strength', s: 'f_cd', f: 'η_cc k_tc f_ck/γ_C', n: `${EC.fmt(m.etacc, 3)}·1.0·${m.fck}/1.5`, v: m.fcd, u: 'MPa', r: '5.1.6 [NDP γ_C = 1.5]', key: true });
      c.v({ l: 'Design yield strength', s: 'f_yd', f: 'f_yk/γ_S', n: `${m.fyk}/1.15`, v: m.fyd, u: 'MPa', r: '5.2.4 [NDP γ_S = 1.15]', key: true });
      c.v({ l: 'Size parameter of aggregate', s: 'd_dg', f: '16 + D_lower ≤ 40', v: m.ddg, u: 'mm', r: '8.2.1' });

      c.h1('Section');
      const b = +i.b, h = +i.h, cn = +i.cnom;
      const d = h - cn - i.dw - i.db / 2;
      const d2 = cn + +i.dw + i.dt / 2;
      c.v({ l: 'Effective depth (bottom steel)', s: 'd', f: 'h − c_nom − ϕ_w − ϕ/2', n: `${h} − ${cn} − ${i.dw} − ${i.db}/2`, v: d, u: 'mm' });
      c.v({ l: 'Effective depth (top steel)', s: 'd_t', f: 'h − d_2', v: h - d2, u: 'mm' });
      const As = i.nb * EC.barA(i.db), Ast = i.nt * EC.barA(i.dt);
      c.v({ l: 'Bottom reinforcement', s: 'A_s;bot', f: `${i.nb} ϕ${i.db}`, v: As, u: 'mm²' });
      c.v({ l: 'Top reinforcement', s: 'A_s;top', f: `${i.nt} ϕ${i.dt}`, v: Ast, u: 'mm²' });

      c.h1('Bending (ULS)');
      c.h2('Sagging - bottom steel');
      const bs = EC.bending(c, { M: i.MEd, b, d, As, m, barTxt: `${i.nb} ϕ${i.db}`, tag: 'sag', item: 'Bending - sagging' });
      if (+i.MEdh > 0) {
        c.h2('Hogging - top steel');
        EC.bending(c, { M: i.MEdh, b, d: h - d2, As: Ast, m, barTxt: `${i.nt} ϕ${i.dt}`, tag: 'hog', item: 'Bending - hogging' });
      }
      c.h2('Minimum and maximum reinforcement');
      const Asmin = Math.max(0.26 * m.fctm / m.fyk * b * d, 0.0013 * b * d);
      c.chk({ l: 'Minimum tension steel', s: 'A_s;min', f: 'max(0.26 f_ctm/f_yk, 0.0013) b d', Ed: Asmin, Rd: As, u: 'mm²', r: '12.2 [NDP]', item: 'Minimum reinforcement' });
      c.chk({ l: 'Maximum steel', s: 'A_s;max', f: '(A_s;bot + A_s;top) ≤ 0.04 A_c', Ed: As + Ast, Rd: 0.04 * b * h, u: 'mm²', r: '12.2 [NDP]', item: 'Maximum reinforcement' });

      c.h1('Shear (ULS)');
      const Asw = i.legs * EC.barA(i.dw);
      c.v({ l: 'Link area', s: 'A_sw', f: `${i.legs} legs ϕ${i.dw}`, v: Asw, u: 'mm²' });
      const sh = EC.shearLinks(c, { V: i.VEd, b, d, As, m, Asw, s: +i.sw });

      c.h1('Serviceability');
      c.h2('Deflection');
      EC.spanDepth(c, { m, L: +i.L, d, b, AsReq: Math.min(bs.AsReq, As * 1.5), AsProv: As, K: +i.K });
      c.h2('Crack control');
      const sclear = (b - 2 * (cn + +i.dw) - i.nb * i.db) / Math.max(i.nb - 1, 1);
      const sAxis = sclear + +i.db;
      EC.crackSpacing(c, { m, AsReq: bs.AsReq, AsProv: As, psi: +i.psi, spacing: sAxis });

      c.h1('Detailing');
      const smin = Math.max(+i.db, m.Dl + 5, 20);
      c.v({ l: 'Clear spacing of bottom bars', s: 's_cl', f: '(b − 2(c + ϕ_w) − nϕ)/(n − 1)', v: sclear, u: 'mm' });
      c.chk({ l: 'Minimum clear spacing', s: 's_cl;min', f: 'max(ϕ, D_upper + 5, 20) ≤ s_cl', Ed: smin, Rd: sclear, u: 'mm', r: '11.2 [NDP]', item: 'Bar spacing' });
      const sig = m.fyd * Math.min(1, bs.AsReq / As);
      const lbd = EC.anchorage(c, { phi: +i.db, m, sigma: sig, cd: Math.min(sclear / 2, cn + +i.dw), what: 'bottom bars into support' });
      const lbt = EC.anchorage(c, { phi: +i.dt, m, sigma: m.fyd, cd: cn + +i.dw, poor: h > 250, what: 'top bars (poor bond if h > 250)' });
      c.chk({ l: 'Link diameter', s: 'ϕ_w;min', f: 'max(6, ϕ/4) ≤ ϕ_w', Ed: Math.max(6, i.db / 4), Rd: +i.dw, u: 'mm', r: '12.2', item: 'Link diameter' });

      /* bar schedule (indicative) */
      const Lmm = i.L * 1000;
      const linkLen = 2 * (b - 2 * cn) + 2 * (h - 2 * cn) + 20 * i.dw;
      const nLinks = Math.ceil(Lmm / i.sw) + 1;
      const bars = [
        { mark: '01', dia: +i.db, n: +i.nb, len: Math.round(Lmm + 2 * Math.min(lbd, 0.5 * Lmm)), shape: 'Straight / L (into supports)' },
        { mark: '02', dia: +i.dt, n: +i.nt, len: Math.round(Lmm + 2 * lbt), shape: 'Straight (top / hanger)' },
        { mark: '03', dia: +i.dw, n: nLinks, len: Math.round(linkLen), shape: 'Closed link, 135° hooks' }
      ];
      const spec = [
        ['Concrete', `${EC.concName(i.fck)}, aggregate D_lower = ${m.Dl} mm (d_dg = ${m.ddg} mm)`],
        ['Exposure / cover', `${i.exp}, c_nom = ${cn} mm to links`],
        ['Reinforcement', `B${m.fyk} (f_yk = ${m.fyk} MPa), ductility class B`],
        ['Section', `${b} × ${h} mm, span ${i.L} m`],
        ['Bottom steel', `${i.nb} H${i.db} (${EC.fmt(As, 0)} mm²)`],
        ['Top steel', `${i.nt} H${i.dt} (${EC.fmt(Ast, 0)} mm²)`],
        ['Links', `H${i.dw} @ ${i.sw} mm, ${i.legs} legs, cot θ = ${EC.fmt(sh.cot)}`],
        ['Anchorage', `l_bd bottom = ${lbd} mm, top = ${lbt} mm`],
        ['Laps', `l_0 ≈ 1.2 l_bd - bottom ${Math.ceil(1.2 * lbd / 10) * 10} mm, top ${Math.ceil(1.2 * lbt / 10) * 10} mm [verify 11.5]`]
      ];
      return c.result({ spec, bars, svg: draw(i, d) });
    }
  };

  function draw(i, d) {
    const S = EC.svg, b = +i.b, h = +i.h, cn = +i.cnom, dw = +i.dw;
    const sc = 200 / Math.max(b, h * 0.75);
    const W = b * sc, H = h * sc, ox = 50, oy = 30;
    let s = S.open(760, H + 90);
    s += `<rect class="conc" x="${ox}" y="${oy}" width="${W}" height="${H}"/>`;
    s += `<rect class="link" x="${ox + (cn + dw / 2) * sc}" y="${oy + (cn + dw / 2) * sc}" width="${(b - 2 * cn - dw) * sc}" height="${(h - 2 * cn - dw) * sc}" rx="${dw * sc * 1.5}"/>`;
    const row = (n, dia, y) => { for (let k = 0; k < n; k++) { const x = cn + dw + dia / 2 + (n > 1 ? k * (b - 2 * (cn + dw) - dia) / (n - 1) : (b - 2 * (cn + dw) - dia) / 2); s += S.bar(ox + x * sc, oy + y * sc, dia / 2 * sc); } };
    row(+i.nb, +i.db, h - cn - dw - i.db / 2);
    row(+i.nt, +i.dt, cn + dw + i.dt / 2);
    s += S.dimH(ox, ox + W, oy + H + 18, `b = ${b}`);
    s += S.dimV(ox - 18, oy, oy + H, `h = ${h}`);
    s += S.label(ox, oy - 10, 'SECTION', 'ttl');
    s += S.label(ox + W + 10, oy + 12, `${i.nt}H${i.dt}`, 'lbl');
    s += S.label(ox + W + 10, oy + H - 4, `${i.nb}H${i.db}`, 'lbl');
    s += S.label(ox + W + 10, oy + H / 2, `H${dw}@${i.sw}`, 'lbl');
    /* elevation */
    const ex = 340, EW = 390, EH = Math.min(H, 150), ey = oy;
    s += S.label(ex, oy - 10, 'ELEVATION (indicative)', 'ttl');
    s += `<rect class="conc" x="${ex}" y="${ey}" width="${EW}" height="${EH}"/>`;
    s += `<polygon class="support" points="${ex + 8},${ey + EH} ${ex},${ey + EH + 14} ${ex + 16},${ey + EH + 14}"/><polygon class="support" points="${ex + EW - 8},${ey + EH} ${ex + EW - 16},${ey + EH + 14} ${ex + EW},${ey + EH + 14}"/>`;
    const nL = Math.min(60, Math.ceil(i.L * 1000 / i.sw));
    for (let k = 0; k <= nL; k++) { const x = ex + 6 + k * (EW - 12) / nL; s += `<line class="linkline" x1="${x}" x2="${x}" y1="${ey + 6}" y2="${ey + EH - 6}"/>`; }
    s += `<line class="rebarline" x1="${ex + 4}" x2="${ex + EW - 4}" y1="${ey + EH - 8}" y2="${ey + EH - 8}"/><line class="rebarline" x1="${ex + 4}" x2="${ex + EW - 4}" y1="${ey + 8}" y2="${ey + 8}"/>`;
    s += S.dimH(ex, ex + EW, ey + EH + 30, `L = ${i.L} m`);
    return s + '</svg>';
  }
})();
