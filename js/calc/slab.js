/* One-way RC slab per metre width + flat slab punching */
(function () {
  const F = EC.F;
  const SUP = [
    { v: 'ss', l: 'Simply supported' }, { v: 'end', l: 'End span (continuous)' },
    { v: 'int', l: 'Interior span (continuous)' }, { v: 'cant', l: 'Cantilever' }
  ];
  /* moment / shear coefficients for uniform load, equal spans (BS 8110 Table 3.12 style, practice) */
  const COEF = { ss: { ms: 0.125, mh: 0, v: 0.5, K: 1.0 }, end: { ms: 0.086, mh: 0.086, v: 0.6, K: 1.3 }, int: { ms: 0.063, mh: 0.063, v: 0.5, K: 1.5 }, cant: { ms: 0, mh: 0.5, v: 1.0, K: 0.4 } };

  EC.modules.slab = {
    type: 'slab', name: 'RC Slab (one-way)', cat: 'slabs', prefix: 'S', icon: 'slab',
    code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Slab_Design',
    groups: [
      { t: 'Geometry', f: [F('h', 'Slab thickness h', 'mm', 200), F('L', 'Effective span L', 'm', 5), F('sup', 'Support condition', '', 'end', SUP)] },
      { t: 'Materials & durability', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('exp', 'Exposure class', '', 'XC1', EC.EXPO), F('cnom', 'Nominal cover c_nom', 'mm', 25), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Loads (characteristic)', f: [F('gsdl', 'Superimposed dead g_k', 'kPa', 1.5), F('qk', 'Imposed load q_k', 'kPa', 3.0), F('gG', 'Partial factor γ_G', '', 1.35), F('gQ', 'Partial factor γ_Q', '', 1.5), F('psi2', 'Quasi-permanent ψ_2', '', 0.3)] },
      { t: 'Reinforcement', f: [F('db', 'Bottom bar ϕ', 'mm', 12, EC.barOpts), F('sb', 'Bottom spacing', 'mm', 150), F('dt', 'Top bar ϕ', 'mm', 12, EC.barOpts), F('st', 'Top spacing', 'mm', 150), F('dd', 'Distribution bar ϕ', 'mm', 10, EC.barOpts), F('sd', 'Distribution spacing', 'mm', 250)] }
    ],
    schedCols: [['h', 'h (mm)'], ['span', 'Span (m)'], ['sup', 'Support'], ['bot', 'Bottom'], ['top', 'Top'], ['dist', 'Distribution'], ['load', 'g_k + q_k (kPa)']],
    sched: i => ({ h: i.h, span: i.L, sup: (SUP.find(s => s.v === i.sup) || {}).l, bot: `H${i.db}@${i.sb}`, top: COEF[i.sup].mh > 0 ? `H${i.dt}@${i.st}` : '–', dist: `H${i.dd}@${i.sd}`, load: `${(+i.gsdl + 25 * i.h / 1000).toFixed(2)} + ${i.qk}` }),
    calc(i) {
      const c = new EC.Calc();
      const m = EC.mat(i.fck, i.fyk, i.Dl);
      const k = COEF[i.sup], b = 1000, h = +i.h, L = +i.L;
      c.text(`One-way solid slab, 1 m strip: loads, ULS bending and shear, deflection, crack control, detailing to ${this.code}. Moment coefficients for uniform load on ≥ 3 near-equal spans (practice) - use FE / ETABS-SAFE moments for other cases.`);
      c.h1('Materials');
      c.v({ l: 'Design compressive strength', s: 'f_cd', f: 'η_cc f_ck/γ_C', v: m.fcd, u: 'MPa', r: '5.1.6', key: true });
      c.v({ l: 'Design yield strength', s: 'f_yd', f: 'f_yk/γ_S', v: m.fyd, u: 'MPa', r: '5.2.4', key: true });
      c.v({ l: 'Mean tensile strength', s: 'f_ctm', v: m.fctm, u: 'MPa', r: 'Table 5.1' });
      c.h1('Loads');
      const sw = 25 * h / 1000;
      c.v({ l: 'Self weight', s: 'g_sw', f: '25 kN/m³ · h', v: sw, u: 'kPa', r: 'EN 1991-1-1' });
      const gk = sw + +i.gsdl;
      c.v({ l: 'Total permanent', s: 'g_k', f: 'g_sw + g_sdl', v: gk, u: 'kPa' });
      const w = i.gG * gk + i.gQ * i.qk;
      c.v({ l: 'ULS design load', s: 'w_Ed', f: 'γ_G g_k + γ_Q q_k', n: `${i.gG}·${EC.fmt(gk)} + ${i.gQ}·${i.qk}`, v: w, u: 'kPa', r: 'EN 1990 (6.10) [NDP]', key: true });
      const wqp = gk + i.psi2 * i.qk;
      c.v({ l: 'Quasi-permanent load', s: 'w_qp', f: 'g_k + ψ_2 q_k', v: wqp, u: 'kPa' });
      const Ms = k.ms * w * L * L, Mh = k.mh * w * L * L, V = k.v * w * L;
      c.v({ l: 'Span moment', s: 'M_Ed;span', f: `${k.ms} w L²`, v: Ms, u: 'kNm/m', key: true });
      if (k.mh) c.v({ l: 'Support moment', s: 'M_Ed;sup', f: `${k.mh} w L²`, v: Mh, u: 'kNm/m', key: true });
      c.v({ l: 'Design shear', s: 'V_Ed', f: `${k.v} w L`, v: V, u: 'kN/m', key: true });

      const d = h - i.cnom - i.db / 2, dt = h - i.cnom - i.dt / 2;
      const As = EC.barA(i.db) * 1000 / i.sb, Ast = EC.barA(i.dt) * 1000 / i.st;
      c.h1('Bending (ULS)');
      c.v({ l: 'Effective depth, bottom', s: 'd', f: 'h − c_nom − ϕ/2', v: d, u: 'mm' });
      let bs = { AsReq: 0 };
      if (k.ms) { c.h2('Span - bottom steel'); bs = EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Ms, b, d, As, m, barTxt: `H${i.db}@${i.sb}`, tag: 'span', item: 'Bending - span' }); }
      let bh = { AsReq: 0 };
      if (k.mh) { c.h2('Support - top steel'); c.v({ l: 'Effective depth, top', s: 'd_t', v: dt, u: 'mm' }); bh = EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mh, b, d: dt, As: Ast, m, barTxt: `H${i.dt}@${i.st}`, tag: 'sup', item: 'Bending - support' }); }
      const dm = k.ms ? d : dt, Am = k.ms ? As : Ast, AreqM = k.ms ? bs.AsReq : bh.AsReq;
      c.h2('Minimum steel and spacing');
      const Asmin = Math.max(0.26 * m.fctm / m.fyk * b * dm, 0.0013 * b * dm);
      c.chk({ l: 'Minimum main steel', s: 'A_s;min', f: 'max(0.26 f_ctm/f_yk, 0.0013) b d', Ed: Asmin, Rd: Am, u: 'mm²/m', r: '12.3 [NDP]', item: 'Minimum reinforcement' });
      c.chk({ l: 'Main bar spacing', s: 's_max', f: 'min(2h, 250) in max-moment zones', Ed: k.ms ? +i.sb : +i.st, Rd: Math.min(2 * h, 250), u: 'mm', r: '12.3 [NDP]', item: 'Main bar spacing' });
      const Ad = EC.barA(i.dd) * 1000 / i.sd;
      c.chk({ l: 'Secondary (distribution) steel', s: 'A_s;dist', f: '≥ 0.2 A_s;main, s ≤ min(3h, 400)', Ed: 0.2 * Am, Rd: Ad, u: 'mm²/m', r: '12.3', item: 'Distribution steel' });
      c.chk({ l: 'Distribution bar spacing', s: 's_dist', Ed: +i.sd, Rd: Math.min(3 * h, 400), u: 'mm', r: '12.3', item: 'Distribution spacing' });

      c.h1('Shear (ULS) - no shear reinforcement');
      const sh = EC.shearNoLinks(c, { V, b, d: k.mh ? dt : d, As: k.mh ? Ast : As, m });
      c.chk({ l: 'Shear without links', s: 'τ_Ed/τ_Rd;c', Ed: sh.tauEd, Rd: sh.tauRdc, u: 'MPa', r: '8.2.2', item: 'Shear' });

      c.h1('Serviceability');
      c.h2('Deflection');
      EC.spanDepth(c, { m, L, d: dm, b, AsReq: Math.max(AreqM, 1), AsProv: Am, K: k.K });
      c.h2('Crack control');
      EC.crackSpacing(c, { m, AsReq: AreqM, AsProv: Am, psi: wqp / w, spacing: k.ms ? +i.sb : +i.st });

      c.h1('Detailing');
      const lbd = EC.anchorage(c, { phi: +i.db, m, sigma: m.fyd * Math.min(1, bs.AsReq / As || 0.5), cd: Math.min(i.sb / 2 - i.db / 2, +i.cnom), what: 'bottom bars' });
      const lbt = EC.anchorage(c, { phi: +i.dt, m, sigma: m.fyd, cd: Math.min(i.st / 2 - i.dt / 2, +i.cnom), what: 'top bars' });
      c.note('Curtail top steel at ≥ 0.15 L + l_bd from the support face; at least 50 % of span steel to continue into supports (12.3).');

      const Lmm = L * 1000;
      const bars = [
        { mark: '01', dia: +i.db, n: Math.ceil(1000 / i.sb), len: Math.round(Lmm + 2 * lbd), shape: 'Straight (per m width)' },
        { mark: '03', dia: +i.dd, n: Math.ceil(Lmm / i.sd) + 1, len: 1000, shape: 'Distribution (per m width)' }
      ];
      if (k.mh) bars.splice(1, 0, { mark: '02', dia: +i.dt, n: Math.ceil(1000 / i.st), len: Math.round(2 * (0.3 * Lmm + lbt)), shape: 'Straight over support' });
      const spec = [
        ['Concrete', EC.concName(i.fck)], ['Exposure / cover', `${i.exp}, c_nom = ${i.cnom} mm`],
        ['Slab', `h = ${h} mm, span ${L} m, ${(SUP.find(s => s.v === i.sup) || {}).l}`],
        ['Loads', `g_k = ${EC.fmt(gk)} kPa (incl. self weight), q_k = ${i.qk} kPa`],
        ['Bottom', `H${i.db} @ ${i.sb} (${EC.fmt(As, 0)} mm²/m)`],
        ['Top', k.mh ? `H${i.dt} @ ${i.st} (${EC.fmt(Ast, 0)} mm²/m), extend 0.3 L each side` : 'nominal H10 @ 250 at supports'],
        ['Distribution', `H${i.dd} @ ${i.sd}`],
        ['Anchorage', `l_bd = ${lbd} mm bottom, ${lbt} mm top`]
      ];
      return c.result({ spec, bars, svg: draw(i, k) + diag(k, w, L) });
    }
  };
  function diag(k, w, L) {
    const pts = [];
    for (let j = 0; j <= 40; j++) {
      const x = j / 40 * L;
      let M;
      if (k.mh && k.ms) { const Mh = k.mh * w * L * L, Ms = k.ms * w * L * L; M = 4 * (Ms + Mh) * (x / L) * (1 - x / L) - Mh; }
      else if (k.ms) M = w * x * (L - x) / 2;
      else M = -w * (L - x) * (L - x) / 2;
      pts.push([x, M]);
    }
    return EC.plot({ title: 'Bending moment (approx. envelope)', xl: 'x (m)', yl: 'M (kNm/m)', series: [{ name: 'M_Ed', pts, fill: true }] });
  }
  function draw(i, k) {
    const S = EC.svg, h = +i.h;
    const W = 380, sc = 120 / Math.max(h, 200), H = h * sc, ox = 40, oy = 34;
    let s = S.open(470, H + 70);
    s += S.label(ox, 18, 'SLAB SECTION (1 m strip, along span)', 'ttl');
    s += `<rect class="conc" x="${ox}" y="${oy}" width="${W}" height="${H}"/>`;
    const yb = oy + H - (+i.cnom + i.db / 2) * sc, yt = oy + (+i.cnom + i.dt / 2) * sc;
    s += `<line class="rebarline" x1="${ox + 6}" x2="${ox + W - 6}" y1="${yb}" y2="${yb}"/>`;
    if (k.mh) s += `<line class="rebarline" x1="${k.ms ? ox + W * 0.62 : ox + 6}" x2="${ox + W - 6}" y1="${yt}" y2="${yt}"/>`;
    const nd = 14;
    for (let j = 0; j < nd; j++) { s += S.bar(ox + 14 + j * (W - 28) / (nd - 1), yb - (i.db / 2 + i.dd / 2) * sc, Math.max(2, i.dd / 2 * sc)); }
    s += S.dimV(ox - 16, oy, oy + H, `h = ${h}`);
    s += S.label(ox + W + 8, yb + 4, `H${i.db}@${i.sb}`);
    if (k.mh) s += S.label(ox + W + 8, yt + 4, `H${i.dt}@${i.st}`);
    s += S.label(ox + 10, oy + H + 22, `distribution H${i.dd}@${i.sd}`);
    return s + '</svg>';
  }

  /* ---------------- Punching at a slab-column connection ---------------- */
  const POS = [{ v: 'int', l: 'Internal column (β_e = 1.15)' }, { v: 'edge', l: 'Edge column (β_e = 1.4)' }, { v: 'corner', l: 'Corner column (β_e = 1.5)' }];
  EC.modules.punching = {
    type: 'punching', name: 'Flat slab punching', cat: 'slabs', prefix: 'P', icon: 'punch',
    code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Punching_Design',
    groups: [
      { t: 'Geometry', f: [F('pos', 'Column position', '', 'int', POS), F('c1', 'Column c_1 (⊥ edge)', 'mm', 400), F('c2', 'Column c_2', 'mm', 400), F('h', 'Slab thickness h', 'mm', 260)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('cnom', 'Top cover c_nom', 'mm', 25), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Action & reinforcement', f: [F('VEd', 'Column reaction V_Ed', 'kN', 520), F('be', 'β_e override (0 = by position)', '', 0), F('dx', 'Top bar ϕ (x)', 'mm', 16, EC.barOpts), F('sx', 'Spacing x', 'mm', 150), F('dy', 'Top bar ϕ (y)', 'mm', 16, EC.barOpts), F('sy', 'Spacing y', 'mm', 150), F('esys', 'η_sys for shear reinforcement [NDP]', '', 1.5)] }
    ],
    schedCols: [['pos', 'Position'], ['col', 'Column (mm)'], ['h', 'Slab h'], ['top', 'Top steel x / y'], ['VEd', 'V_Ed (kN)']],
    sched: i => ({ pos: { int: 'Internal', edge: 'Edge', corner: 'Corner' }[i.pos], col: `${i.c1}×${i.c2}`, h: i.h, top: `H${i.dx}@${i.sx} / H${i.dy}@${i.sy}`, VEd: i.VEd }),
    calc(i) {
      const c = new EC.Calc();
      const m = EC.mat(i.fck, i.fyk, i.Dl);
      const c1 = +i.c1, c2 = +i.c2, h = +i.h;
      c.text(`Punching shear at a slab-column connection without shear reinforcement, control perimeter b_0.5 at d_v/2, ${this.code} 8.4. Column flush with the slab edge for edge / corner positions; no openings.`);
      c.h1('Effective depth and reinforcement');
      const dxx = h - i.cnom - i.dx / 2, dyy = h - i.cnom - i.dx - i.dy / 2, dv = (dxx + dyy) / 2;
      c.v({ l: 'Effective depth x / y', s: 'd_x / d_y', v: dxx, u: 'mm', n: `d_y = ${EC.fmt(dyy)} mm` });
      c.v({ l: 'Shear-resisting effective depth', s: 'd_v', f: '(d_x + d_y)/2', v: dv, u: 'mm', r: '8.4.1' });
      const rx = EC.barA(i.dx) / (i.sx * dxx), ry = EC.barA(i.dy) / (i.sy * dyy), rho = Math.min(Math.sqrt(rx * ry), 0.02);
      c.v({ l: 'Reinforcement ratio', s: 'ρ_l', f: '√(ρ_x ρ_y)', n: `√(${EC.fmt(rx, 4)}·${EC.fmt(ry, 4)})`, v: rho, u: '', dp: 4 });
      c.h1('Control perimeter');
      const pi = Math.PI;
      const P = { int: [2 * (c1 + c2), 2 * (c1 + c2) + pi * dv, 1.15], edge: [2 * c1 + c2, 2 * c1 + c2 + pi * dv / 2, 1.4], corner: [c1 + c2, c1 + c2 + pi * dv / 4, 1.5] }[i.pos];
      const be = +i.be > 0 ? +i.be : P[2];
      c.v({ l: 'Column perimeter', s: 'b_0', v: P[0], u: 'mm' });
      c.v({ l: 'Control perimeter at d_v/2', s: 'b_0.5', f: { int: '2(c_1 + c_2) + π d_v', edge: '2c_1 + c_2 + π d_v/2', corner: 'c_1 + c_2 + π d_v/4' }[i.pos], v: P[1], u: 'mm', r: '8.4.2' });
      c.v({ l: 'Eccentricity factor', s: 'β_e', v: be, u: '', r: '8.4.2 simplified [NDP]' });
      const tauEd = be * i.VEd * 1e3 / (P[1] * dv);
      c.v({ l: 'Punching shear stress', s: 'τ_Ed', f: 'β_e V_Ed/(b_0.5 d_v)', n: `${be}·${i.VEd}·10³/(${EC.fmt(P[1])}·${EC.fmt(dv)})`, v: tauEd, u: 'MPa', key: true });
      c.h1('Punching resistance');
      const kpb = EC.clamp(3.6 * Math.sqrt(Math.max(0, 1 - P[0] / P[1])), 1, 2.5);
      c.v({ l: 'Shear gradient factor', s: 'k_pb', f: '3.6 √(1 − b_0/b_0.5), 1 ≤ k_pb ≤ 2.5', v: kpb, u: '', r: '8.4.3' });
      const t1 = 0.6 / m.gV * kpb * Math.pow(100 * rho * m.fck * m.ddg / dv, 1 / 3), tmax = 0.5 / m.gV * Math.sqrt(m.fck);
      const tRdc = Math.min(t1, tmax);
      c.v({ l: 'Punching resistance', s: 'τ_Rd;c', f: '0.6/γ_V k_pb (100 ρ_l f_ck d_dg/d_v)^(1/3) ≤ 0.5/γ_V √f_ck', n: `0.6/1.4·${EC.fmt(kpb)}·(100·${EC.fmt(rho, 4)}·${m.fck}·${m.ddg}/${EC.fmt(dv)})^(1/3)`, v: tRdc, u: 'MPa', r: '8.4.3', key: true });
      const need = tauEd > tRdc;
      c.chk({ l: 'Punching without shear reinforcement', s: 'τ_Ed/τ_Rd;c', Ed: tauEd, Rd: tRdc, u: 'MPa', r: '8.4.3', item: 'Punching (no shear reinforcement)' });
      let rout = 0;
      if (need) {
        c.h1('Shear reinforcement required');
        c.chk({ l: 'Maximum punching resistance', s: 'τ_Rd;max', f: 'η_sys τ_Rd;c', Ed: tauEd, Rd: +i.esys * tRdc, u: 'MPa', r: '8.4.4 [NDP η_sys - verify]', item: 'Punching - maximum' });
        const bout = be * i.VEd * 1e3 / (tRdc * dv);
        const straight = { int: 2 * (c1 + c2), edge: 2 * c1 + c2, corner: c1 + c2 }[i.pos], fac = { int: 2 * pi, edge: pi, corner: pi / 2 }[i.pos];
        rout = Math.max(0, (bout - straight) / fac);
        c.v({ l: 'Outer perimeter (no reinforcement needed)', s: 'b_out', f: 'β_e V_Ed/(τ_Rd;c d_v)', v: bout, u: 'mm', key: true });
        c.v({ l: 'Distance of outer perimeter from column face', s: 'r_out', v: rout, u: 'mm' });
        c.note('Design the links / studs (rows, s_0 ≤ 0.5 d_v, s_r ≤ 0.75 d_v) with the Mathcad worksheet EC2_Concrete\\Punching_Design (8.4.4).');
      }
      c.h1('Integrity reinforcement');
      const Asint = 0.5 * i.VEd * 1e3 / (m.fyk);
      c.v({ l: 'Bottom bars through the column (each direction, sum)', s: 'A_s;int', f: '≈ 0.5 V_Ed/f_yk [practice - verify 12.6]', v: Asint, u: 'mm²', key: true });
      const spec = [['Concrete', EC.concName(i.fck)], ['Slab', `h = ${h} mm, d_v = ${EC.fmt(dv, 0)} mm`], ['Column', `${c1} × ${c2} mm, ${POS.find(p => p.v === i.pos).l}`], ['Top steel', `H${i.dx}@${i.sx} (x), H${i.dy}@${i.sy} (y) over ≥ 0.4 L around column`], ['Shear reinforcement', need ? `required to r_out = ${EC.fmt(rout, 0)} mm from face` : 'not required'], ['Integrity', `≥ ${EC.fmt(Asint, 0)} mm² bottom bars through column`]];
      return c.result({ spec, bars: [], svg: draw2(i, dv, rout) });
    }
  };
  function draw2(i, dv, rout) {
    const c1 = +i.c1, c2 = +i.c2;
    const ext = Math.max(c1, c2) / 2 + Math.max(dv / 2, rout) + 150;
    const sc = 150 / ext, cx = 200, cy = 180;
    let s = EC.svg.open(420, 360);
    s += EC.svg.label(20, 20, 'PLAN - CONTROL PERIMETERS', 'ttl');
    const rr = (r, cls) => `<rect class="${cls}" x="${cx - (c2 / 2 + r) * sc}" y="${cy - (c1 / 2 + r) * sc}" width="${(c2 + 2 * r) * sc}" height="${(c1 + 2 * r) * sc}" rx="${r * sc}"/>`;
    if (i.pos !== 'int') s += `<rect class="slabarea" x="${cx - (c2 / 2) * sc}" y="${cy - ext * sc}" width="${ext * sc + 60}" height="${2 * ext * sc}"/>`; else s += `<rect class="slabarea" x="${cx - ext * sc}" y="${cy - ext * sc}" width="${2 * ext * sc}" height="${2 * ext * sc}"/>`;
    if (rout) s += rr(rout, 'perim2');
    s += rr(dv / 2, 'perim');
    s += `<rect class="colfill" x="${cx - c2 / 2 * sc}" y="${cy - c1 / 2 * sc}" width="${c2 * sc}" height="${c1 * sc}"/>`;
    if (i.pos !== 'int') s += `<line class="edge" x1="${cx - c2 / 2 * sc}" x2="${cx - c2 / 2 * sc}" y1="${cy - ext * sc}" y2="${cy + ext * sc}"/>`;
    s += EC.svg.label(cx + 8, cy - (c1 / 2 + dv / 2) * sc - 6, 'b0.5', 'lbl');
    if (rout) s += EC.svg.label(cx + 8, cy - (c1 / 2 + rout) * sc - 6, 'b_out', 'lbl');
    return s + '</svg>';
  }
})();
