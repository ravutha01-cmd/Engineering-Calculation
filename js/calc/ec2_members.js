/* EC2 members: walls, effective length, torsion, deep beam, web opening, fatigue, slabs (ribbed, two-way, flat, PT), stairs */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt;
  const mlines = (c, m) => {
    c.h1('Materials');
    c.inp('Concrete class', 'f_ck', m.fck, 'MPa', 'Table 5.1');
    c.v({ l: 'Design compressive strength', s: 'f_cd', f: 'η_cc f_ck/γ_C', v: m.fcd, u: 'MPa', r: '5.1.6 [NDP γ_C = 1.5]', key: true });
    c.v({ l: 'Design yield strength', s: 'f_yd', f: 'f_yk/γ_S', v: m.fyd, u: 'MPa', r: '5.2.4 [NDP γ_S = 1.15]', key: true });
    c.v({ l: 'Mean tensile strength', s: 'f_ctm', v: m.fctm, u: 'MPa', r: 'Table 5.1' });
  };
  const nuP = m => 1 - m.fck / 250;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}), icon: null }, o);

  /* ---------------- Shear wall (in-plane) ---------------- */
  EC.modules.shearwall = def({
    type: 'shearwall', name: 'RC Shear Wall', cat: 'columns', prefix: 'W', icon: 'column', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\ShearWall_Design',
    groups: [
      { t: 'Geometry', f: [F('lw', 'Wall length l_w', 'mm', 4000), F('t', 'Thickness t', 'mm', 250), F('hw', 'Storey height h_s', 'm', 3.5), F('be', 'Buckling factor β (out of plane)', '', 1.0)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('cnom', 'Cover c_nom', 'mm', 30)] },
      { t: 'ULS actions', f: [F('N', 'Axial N_Ed (compression +)', 'kN', 4500), F('M', 'In-plane M_Ed', 'kNm', 6500), F('V', 'In-plane V_Ed', 'kN', 950)] },
      { t: 'Reinforcement', f: [F('le', 'End zone length l_e', 'mm', 450), F('ne', 'Bars per end zone', 'no', 8), F('de', 'End zone bar ϕ', 'mm', 20, EC.barOpts), F('dv', 'Web vertical ϕ (each face)', 'mm', 12, EC.barOpts), F('sv', 'Web vertical spacing', 'mm', 200), F('dh', 'Horizontal ϕ (each face)', 'mm', 10, EC.barOpts), F('sh', 'Horizontal spacing', 'mm', 200)] }
    ],
    schedCols: [['size', 'l_w × t (mm)'], ['ends', 'End zones'], ['web', 'Web vert.'], ['hor', 'Horizontal'], ['NM', 'N / M / V']],
    sched: i => ({ size: `${i.lw}×${i.t}`, ends: `2× ${i.ne}H${i.de}`, web: `H${i.dv}@${i.sv} EF`, hor: `H${i.dh}@${i.sh} EF`, NM: `${i.N} / ${i.M} / ${i.V}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk);
      const lw = +i.lw, t = +i.t, dc = +i.cnom + +i.dh + i.de / 2;
      c.text('Reinforced concrete wall under in-plane N + M + V: section resistance by strain compatibility (end zones + distributed web bars), in-plane shear with horizontal bars, sliding at the construction joint, slenderness screen and wall detailing.');
      mlines(c, m);
      c.h1('Section and reinforcement layers');
      const L = [], Ae = EC.barA(i.de), Av = EC.barA(i.dv);
      const np = Math.max(1, Math.round(i.ne / 2));
      for (let k = 0; k < np; k++) { const y = dc + (np > 1 ? k * (i.le - dc - i.cnom) / (np - 1) : 0); L.push({ y, As: 2 * Ae }); L.push({ y: lw - y, As: 2 * Ae }); }
      const nweb = Math.max(0, Math.floor((lw - 2 * i.le) / i.sv));
      for (let k = 1; k <= nweb; k++) L.push({ y: +i.le + k * (lw - 2 * i.le) / (nweb + 1), As: 2 * Av });
      const As = L.reduce((a, l) => a + l.As, 0), Ac = lw * t;
      c.v({ l: 'End zone steel (each end)', s: 'A_s;e', f: `${2 * np} ϕ${i.de}`, v: 2 * np * Ae, u: 'mm²' });
      c.v({ l: 'Web vertical bars (both faces)', s: 'A_s;web', f: `${nweb} × 2 ϕ${i.dv}`, v: nweb * 2 * Av, u: 'mm²' });
      c.v({ l: 'Total vertical steel', s: 'A_s;v', v: As, u: 'mm²', n: `ρ_v = ${fmt(100 * As / Ac, 2)} %` });
      c.h1('Axial force and in-plane bending');
      const NRd = (Ac * m.fcd + As * (m.fyd - m.fcd)) / 1e3;
      c.v({ l: 'Squash load', s: 'N_Rd', f: 'A_c f_cd + A_s (f_yd − f_cd)', v: NRd, u: 'kN' });
      c.c('Axial compression', 'N_Ed/N_Rd', +i.N, NRd, 'kN', '8.1');
      const R = EC.sec.MRd(+i.N, lw, t, L, m);
      const e0 = Math.max(lw / 30, 20);
      const MEd = Math.max(Math.abs(i.M), i.N * e0 / 1000);
      c.v({ l: 'Design moment incl. minimum eccentricity', s: 'M_Ed', f: 'max(M_Ed, N_Ed e_0)', v: MEd, u: 'kNm' });
      c.v({ l: 'Moment resistance at N_Ed', s: 'M_Rd', f: 'strain compatibility, ε_cu = 3.5 ‰', n: R.x ? `x = ${fmt(R.x)} mm` : 'N outside range', v: R.M, u: 'kNm', key: true, r: '8.1' });
      c.c('In-plane bending', 'M_Ed/M_Rd', MEd, R.M, 'kNm', '8.1', 'In-plane N + M');
      c.h1('In-plane shear');
      const d = 0.8 * lw / 0.9;
      c.note('Lever arm z = 0.8 l_w; horizontal bars act as shear reinforcement (both faces).');
      EC.shearLinks(c, { V: +i.V, b: t, d, As: As / 2, m, Asw: 2 * EC.barA(i.dh), s: +i.sh });
      c.h1('Sliding at the construction joint');
      const fctd = 0.7 * m.fctm / m.gC, sn = Math.min(i.N * 1e3 / Ac, 0.6 * m.fcd), rho = As / Ac;
      const vEdi = i.V * 1e3 / Ac;
      const vRdi = Math.min(0.45 * fctd + 0.7 * sn + rho * m.fyd * 0.7, 0.5 * 0.6 * nuP(m) * m.fcd);
      c.v({ l: 'Interface shear stress', s: 'v_Edi', f: 'V_Ed/(l_w t)', v: vEdi, u: 'MPa' });
      c.v({ l: 'Interface resistance (rough joint)', s: 'v_Rdi', f: 'c f_ctd + μ σ_n + ρ f_yd μ,  c = 0.45, μ = 0.7', v: vRdi, u: 'MPa', r: '8.2.6 [verify 2023 coefficients]', key: true });
      c.c('Sliding shear', 'v_Edi/v_Rdi', vEdi, vRdi, 'MPa', '8.2.6');
      c.h1('Out-of-plane slenderness (screen)');
      const l0 = i.be * i.hw * 1000, lam = l0 * Math.sqrt(12) / t, n = i.N * 1e3 / (Ac * m.fcd);
      const lamLim = 20 * 0.7 * 1.1 * 0.7 / Math.sqrt(Math.max(n, 0.01));
      c.v({ l: 'Slenderness', s: 'λ', f: 'β h_s √12/t', v: lam, u: '', n: `λ_lim = ${fmt(lamLim)}` });
      if (lam > lamLim) c.note('Wall is slender out of plane - design the out-of-plane strip with the Slender wall module.');
      c.h1('Detailing');
      c.c('Minimum vertical steel', 'ρ_v;min', 0.002 * Ac, As, 'mm²', '12.6 [NDP]', 'Minimum vertical steel', '0.002 A_c ≤ A_s;v');
      c.c('Maximum vertical steel', 'ρ_v;max', As, 0.04 * Ac, 'mm²', '12.6 [NDP]', 'Maximum vertical steel');
      const Ah = 2 * EC.barA(i.dh) / i.sh * 1000, Ahmin = Math.max(0.25 * As / lw * 1000, 0.001 * t * 1000);
      c.c('Minimum horizontal steel', 'A_s;h;min', Ahmin, Ah, 'mm²/m', '12.6', 'Minimum horizontal steel', 'max(25 % A_s;v, 0.001 A_c)');
      c.c('Bar spacing', 's_max', Math.max(i.sv, i.sh), Math.min(3 * t, 400), 'mm', '12.6', 'Bar spacing');
      if (2 * np * Ae > 0.02 * i.le * t) c.note('End zone ρ > 2 %: confine the end bars with closed links like a column (12.5).');
      const curve = EC.sec.curve(lw, t, L, m);
      const svg = drawWall(i, L, dc) + EC.plot({ title: 'In-plane N–M interaction', xl: 'M (kNm)', yl: 'N (kN)', series: [{ name: 'M_Rd', pts: curve }], points: [{ x: MEd, y: +i.N, t: 'Ed', ok: MEd <= R.M }] });
      const spec = [['Concrete', EC.concName(i.fck)], ['Wall', `${lw} × ${t} mm, storey ${i.hw} m`], ['End zones', `${2 * np}H${i.de} each end over ${i.le} mm, closed links H10 @ 150`], ['Web vertical', `H${i.dv} @ ${i.sv} each face`], ['Horizontal', `H${i.dh} @ ${i.sh} each face, U-bars at wall ends`], ['Cover', `${i.cnom} mm`]];
      return c.result({ spec, bars: [], svg });
    }
  });
  function drawWall(i, L, dc) {
    const lw = Math.max(+i.lw, 1), t = +i.t, sc = 700 / lw, H = EC.clamp(t * sc, 30, 120), oy = 40;
    let s = EC.svg.open(760, H + 80) + EC.svg.label(30, 20, 'WALL PLAN', 'ttl');
    s += `<rect class="conc" x="30" y="${oy}" width="${lw * sc}" height="${H}"/>`;
    s += `<rect class="tieband" x="30" y="${oy}" width="${i.le * sc}" height="${H}"/><rect class="tieband" x="${30 + (lw - i.le) * sc}" y="${oy}" width="${i.le * sc}" height="${H}"/>`;
    L.forEach(l => { s += EC.svg.bar(30 + l.y * sc, oy + Math.min(dc * sc, H / 3), 2.5) + EC.svg.bar(30 + l.y * sc, oy + H - Math.min(dc * sc, H / 3), 2.5); });
    s += EC.svg.dimH(30, 30 + lw * sc, oy + H + 22, `l_w = ${lw}`);
    return s + '</svg>';
  }

  /* ---------------- Slender wall (out of plane, per m) ---------------- */
  EC.modules.slenderwall = def({
    type: 'slenderwall', name: 'Slender Wall (out of plane)', cat: 'columns', prefix: 'SW', icon: 'column', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\SlenderWall_Design',
    groups: [
      { t: 'Geometry', f: [F('t', 'Thickness t', 'mm', 200), F('l', 'Clear height l_w', 'm', 3.4), F('beta', 'Panel factor β (2-sided = 1.0)', '', 1.0, [{ v: 1.0, l: '2-sided (top + bottom) β = 1.0' }, { v: 0.85, l: '3-sided (approx.) β = 0.85' }, { v: 0.7, l: '4-sided (approx.) β = 0.7' }]), F('kend', 'End restraint factor', '', 0.85)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'Reinforcement f_yk', 'MPa', 500), F('cnom', 'Cover c_nom', 'mm', 25), F('phi', 'Creep ratio φ_ef', '', 1.0)] },
      { t: 'Actions per m (ULS)', f: [F('N', 'Axial n_Ed', 'kN/m', 650), F('es', 'Slab bearing eccentricity', 'mm', 25), F('w', 'Lateral pressure w_Ed', 'kPa', 1.2)] },
      { t: 'Reinforcement (each face)', f: [F('dv', 'Vertical ϕ', 'mm', 12, EC.barOpts), F('sv', 'Vertical spacing', 'mm', 200), F('dh', 'Horizontal ϕ', 'mm', 10, EC.barOpts), F('sh', 'Horizontal spacing', 'mm', 250)] }
    ],
    schedCols: [['t', 't (mm)'], ['l', 'Height (m)'], ['v', 'Vertical EF'], ['h', 'Horizontal EF'], ['N', 'n_Ed (kN/m)']],
    sched: i => ({ t: i.t, l: i.l, v: `H${i.dv}@${i.sv}`, h: `H${i.dh}@${i.sh}`, N: i.N }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), t = +i.t, N = +i.N;
      c.text('Load-bearing RC wall designed as a 1 m vertical strip out of plane: effective height, imperfection, slab-bearing eccentricity, lateral load, second order effects by nominal curvature and N–M resistance per metre.');
      mlines(c, m);
      c.h1('Effective height and slenderness');
      const l0 = i.beta * i.kend * i.l * 1000;
      c.q('Effective height', 'l_0', 'β k_end l_w', l0, 'mm', '7.4 / 12.6 [verify]');
      const lam = l0 * Math.sqrt(12) / t;
      c.q('Slenderness', 'λ', 'l_0 √12/t', lam, '');
      const dc = +i.cnom + +i.dh + i.dv / 2, As1 = EC.barA(i.dv) * 1000 / i.sv, As = 2 * As1, Ac = 1000 * t;
      const n = N * 1e3 / (Ac * m.fcd), w = As * m.fyd / (Ac * m.fcd);
      const lamLim = 20 * (1 / (1 + 0.2 * i.phi)) * Math.sqrt(1 + 2 * w) * 0.7 / Math.sqrt(Math.max(n, 0.01));
      c.q('Slenderness limit', 'λ_lim', '20 A B C/√n', lamLim, '', 'EN 1992-1-1:2004 5.8.3.1 [verify]');
      c.h1('Design moment per metre');
      const ei = l0 / 400, e0 = Math.max(t / 30, 20);
      const M0 = N * i.es / 1000 + i.w * i.l * i.l / 8;
      c.q('First order moment', 'm_0', 'n e_s + w l²/8', M0, 'kNm/m');
      c.q('Imperfection eccentricity', 'e_i', 'l_0/400', ei, 'mm');
      let e2 = 0;
      if (lam > lamLim) {
        const d = t - dc, Kr = EC.clamp((1 + w - n) / (1 + w - 0.4), 0, 1), Kp = Math.max(1, 1 + (0.35 + m.fck / 200 - lam / 150) * i.phi);
        e2 = Kr * Kp * m.eyd / (0.45 * d) * l0 * l0 / 10;
        c.q('Second order eccentricity (nominal curvature)', 'e_2', 'K_r K_φ ε_yd/(0.45 d) · l_0²/10', e2, 'mm');
      } else c.note('λ ≤ λ_lim: second order effects ignored.');
      const MEd = Math.max(M0 + N * (ei + e2) / 1000, N * e0 / 1000);
      c.v({ l: 'Design moment', s: 'm_Ed', f: 'max(m_0 + n(e_i + e_2), n e_0)', v: MEd, u: 'kNm/m', key: true });
      c.h1('Resistance per metre');
      const L = [{ y: dc, As: As1 }, { y: t - dc, As: As1 }];
      const NRd = (Ac * m.fcd + As * (m.fyd - m.fcd)) / 1e3;
      c.c('Axial compression', 'n_Ed/n_Rd', N, NRd, 'kN/m', '8.1');
      const R = EC.sec.MRd(N, t, 1000, L, m);
      c.v({ l: 'Moment resistance at n_Ed', s: 'm_Rd', v: R.M, u: 'kNm/m', key: true, r: '8.1 strain compatibility' });
      c.c('Bending with axial force', 'm_Ed/m_Rd', MEd, R.M, 'kNm/m', '8.1', 'N + M out of plane');
      c.h1('Detailing');
      c.c('Minimum vertical steel', 'ρ_v', 0.002 * Ac, As, 'mm²/m', '12.6 [NDP]', 'Minimum vertical steel');
      c.c('Maximum vertical steel', 'ρ_v;max', As, 0.04 * Ac, 'mm²/m', '12.6', 'Maximum vertical steel');
      const Ah = 2 * EC.barA(i.dh) * 1000 / i.sh;
      c.c('Minimum horizontal steel', 'A_s;h', Math.max(0.25 * As, 0.001 * Ac), Ah, 'mm²/m', '12.6', 'Minimum horizontal steel');
      c.c('Vertical bar spacing', 's_v', +i.sv, Math.min(3 * t, 400), 'mm', '12.6', 'Vertical spacing');
      const pts = []; for (let k = 0; k <= 30; k++) { const x = k / 30 * i.l; pts.push([N * i.es / 1000 * (1 - x / i.l) + i.w * x * (i.l - x) / 2 + N * (ei + e2) / 1000 * Math.sin(Math.PI * x / i.l), x]); }
      const svg = EC.plot({ title: 'Moment over height', xl: 'm (kNm/m)', yl: 'height (m)', series: [{ name: 'm_Ed(x)', pts }] }) +
        EC.plot({ title: 'N–M per metre', xl: 'm (kNm/m)', yl: 'n (kN/m)', series: [{ name: 'm_Rd', pts: EC.sec.curve(t, 1000, L, m) }], points: [{ x: MEd, y: N, t: 'Ed', ok: MEd <= R.M }] });
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Wall', `t = ${t} mm, l_w = ${i.l} m, l_0 = ${fmt(l0 / 1000, 2)} m`], ['Vertical', `H${i.dv} @ ${i.sv} each face`], ['Horizontal', `H${i.dh} @ ${i.sh} each face (outside the verticals)`], ['Cover', `${i.cnom} mm`]], bars: [], svg });
    }
  });

  /* ---------------- Effective length ---------------- */
  const FAR = [{ v: 4, l: 'Far end fixed (4EI/l)' }, { v: 3, l: 'Far end pinned (3EI/l)' }, { v: 2, l: 'Braced, single curvature (2EI/l)' }, { v: 6, l: 'Sway, double curvature (6EI/l)' }];
  EC.modules.efflength = def({
    type: 'efflength', name: 'Column Effective Length', cat: 'columns', prefix: 'EL', icon: 'column', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\EffectiveLength_Design',
    groups: [
      { t: 'Column', f: [F('b', 'Column b', 'mm', 400), F('h', 'Column h (bending dir.)', 'mm', 400), F('l', 'Clear height l', 'm', 3.5), F('lu', 'Column above height (0 = none)', 'm', 3.5), F('ll', 'Column below height (0 = none)', 'm', 3.5), F('fixb', 'Base condition (if no column below)', '', 'frame', [{ v: 'frame', l: 'Beams at bottom joint' }, { v: 'fixed', l: 'Fixed foundation (k = 0.1)' }, { v: 'pinned', l: 'Pinned (k = 10)' }])] },
      { t: 'Beams at each joint', f: [F('bb', 'Beam width', 'mm', 300), F('hb', 'Beam depth', 'mm', 600), F('L1', 'Beam 1 span', 'm', 7), F('L2', 'Beam 2 span (0 = none)', 'm', 7), F('far', 'Far end condition', '', 4, FAR), F('crb', 'Beam cracked stiffness factor', '', 0.5), F('crc', 'Column stiffness factor', '', 1.0)] },
      { t: 'Frame', f: [F('br', 'Frame', '', 'braced', [{ v: 'braced', l: 'Braced (non-sway)' }, { v: 'sway', l: 'Unbraced (sway)' }])] }
    ],
    schedCols: [['size', 'b×h'], ['l', 'l (m)'], ['frame', 'Frame'], ['l0', 'l_0 (m)']],
    sched: (i, r) => ({ size: `${i.b}×${i.h}`, l: i.l, frame: i.br, l0: r && r.l0 ? r.l0.toFixed(2) : '' }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Effective length of an RC column in a frame from the relative flexibilities k_1, k_2 of the end restraints (EN 1992-1-1:2004 5.8.3.2, Eq. 5.15 / 5.16 - verify clause numbers with the 2023 edition).');
      c.h1('Stiffnesses');
      const E = 1, Ic = i.b * Math.pow(i.h, 3) / 12 * i.crc, Ib = i.bb * Math.pow(i.hb, 3) / 12;
      const col = l => l > 0 ? E * Ic / (l * 1000) : 0;
      const Kc = col(i.l), Ku = col(i.lu), Kl = col(i.ll);
      const Kb = [i.L1, i.L2].filter(L => L > 0).reduce((a, L) => a + i.far * i.crb * E * Ib / (L * 1000), 0);
      c.q('Column EI/l (this storey)', '(EI/l)_c', 'E b h³/12 /l', Kc / 1e3, '×10³ E mm³');
      c.q('Beam rotational stiffness at joint', 'ΣK_b', 'Σ α k_cr E I_b/L', Kb / 1e3, '×10³ E mm³');
      const k1 = (Kc + Ku) / Math.max(Kb, 1e-9);
      let k2 = i.ll > 0 || i.fixb === 'frame' ? (Kc + Kl) / Math.max(Kb, 1e-9) : i.fixb === 'fixed' ? 0.1 : 10;
      const k1c = Math.max(k1, 0.1), k2c = Math.max(k2, 0.1);
      c.q('Relative flexibility, top', 'k_1', '(θ/M)(EI/l) = Σ(EI/l)_c/ΣK_b ≥ 0.1', k1c, '', '5.8.3.2');
      c.q('Relative flexibility, bottom', 'k_2', i.ll > 0 || i.fixb === 'frame' ? 'Σ(EI/l)_c/ΣK_b ≥ 0.1' : i.fixb, k2c, '');
      c.h1('Effective length');
      const fb = (a, b) => 0.5 * Math.sqrt((1 + a / (0.45 + a)) * (1 + b / (0.45 + b)));
      const fs = (a, b) => Math.max(Math.sqrt(1 + 10 * a * b / (a + b)), (1 + a / (1 + a)) * (1 + b / (1 + b)));
      const beta = i.br === 'braced' ? fb(k1c, k2c) : fs(k1c, k2c);
      c.v({ l: 'Effective length factor', s: 'β = l_0/l', f: i.br === 'braced' ? '0.5 √[(1 + k_1/(0.45 + k_1))(1 + k_2/(0.45 + k_2))]' : 'max{√(1 + 10 k_1 k_2/(k_1 + k_2)); (1 + k_1/(1 + k_1))(1 + k_2/(1 + k_2))}', v: beta, u: '', key: true, r: i.br === 'braced' ? '(5.15)' : '(5.16)' });
      const l0 = beta * i.l;
      c.v({ l: 'Effective length', s: 'l_0', f: 'β l', v: l0, u: 'm', key: true });
      const lam = l0 * 1000 * Math.sqrt(12) / i.h;
      c.q('Slenderness', 'λ', 'l_0 √12/h', lam, '');
      c.ok({ l: 'Braced factor range', cond: i.br !== 'braced' || (beta >= 0.5 && beta <= 1.0), txt: `β = ${fmt(beta, 3)} (braced: 0.5 … 1.0)`, item: 'Effective length factor in range', U: null });
      const ks = [0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10];
      const svg = EC.plot({ title: 'β vs k_1 (k_2 as designed)', xl: 'k_1', yl: 'β', series: [{ name: 'braced', pts: ks.map(k => [k, fb(k, k2c)]) }, { name: 'sway', pts: ks.map(k => [k, fs(k, k2c)]), cls: 1 }], points: [{ x: k1c, y: beta, t: 'design' }], legend: true });
      return c.result({ spec: [['Column', `${i.b} × ${i.h} mm, l = ${i.l} m`], ['Frame', i.br], ['k_1 / k_2', `${fmt(k1c, 2)} / ${fmt(k2c, 2)}`], ['Effective length', `l_0 = ${fmt(l0, 2)} m (β = ${fmt(beta, 3)})`]], bars: [], svg, l0 });
    }
  });

  /* ---------------- Torsion ---------------- */
  EC.modules.torsion = def({
    type: 'torsion', name: 'Beam Torsion + Shear', cat: 'beams', prefix: 'BT', icon: 'beam', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Torsion_Design',
    groups: [
      { t: 'Section', f: [F('b', 'Width b', 'mm', 400), F('h', 'Depth h', 'mm', 650), F('cnom', 'Cover c_nom', 'mm', 35), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cot', 'Strut cot θ (1.0–2.5)', '', 1.5)] },
      { t: 'ULS actions', f: [F('T', 'Torsion T_Ed', 'kNm', 55), F('V', 'Shear V_Ed', 'kN', 240), F('M', 'Bending M_Ed', 'kNm', 260)] },
      { t: 'Reinforcement', f: [F('nb', 'Bottom bars n', 'no', 4), F('db', 'Bottom ϕ', 'mm', 25, EC.barOpts), F('nt', 'Top bars n', 'no', 3), F('dt', 'Top ϕ', 'mm', 16, EC.barOpts), F('ns', 'Side bars per face', 'no', 2), F('ds', 'Side bar ϕ', 'mm', 16, EC.barOpts), F('dw', 'Closed link ϕ', 'mm', 12, EC.barOpts), F('sw', 'Link spacing', 'mm', 125)] }
    ],
    schedCols: [['size', 'b×h'], ['bot', 'Bottom'], ['side', 'Side'], ['links', 'Closed links'], ['TV', 'T / V (kNm, kN)']],
    sched: i => ({ size: `${i.b}×${i.h}`, bot: `${i.nb}H${i.db}`, side: `${i.ns}H${i.ds} EF`, links: `H${i.dw}@${i.sw}`, TV: `${i.T} / ${i.V}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b, h = +i.h;
      const cot = EC.clamp(+i.cot, 1, 2.5), th = Math.atan(1 / cot), sn = Math.sin(th), cs = Math.cos(th);
      c.text('Rectangular beam under torsion, shear and bending: thin-walled closed section, strut interaction, closed links per leg, longitudinal torsion steel per face (EN 1992-1-1 8.3; 2004 6.3 notation).');
      mlines(c, m);
      c.h1('Thin-walled section');
      const A = b * h, u = 2 * (b + h), cl = +i.cnom + +i.dw + i.db / 2;
      const tef = Math.max(A / u, 2 * cl);
      c.q('Effective wall thickness', 't_ef', 'A/u ≥ 2 × axis distance', tef, 'mm', '8.3.2');
      const Ak = (b - tef) * (h - tef), uk = 2 * (b + h - 2 * tef);
      c.q('Area enclosed by centre line', 'A_k', '(b − t_ef)(h − t_ef)', Ak, 'mm²');
      c.q('Perimeter of A_k', 'u_k', '2(b + h − 2 t_ef)', uk, 'mm');
      const tau = i.T * 1e6 / (2 * Ak * tef);
      c.q('Torsional shear stress', 'τ_t', 'T_Ed/(2 A_k t_ef)', tau, 'MPa');
      c.h1('Strut capacity - interaction');
      const nu = 0.6 * nuP(m), d = h - cl, z = 0.9 * d;
      const TRdmax = 2 * nu * m.fcd * Ak * tef * sn * cs / 1e6;
      const VRdmax = b * z * nu * m.fcd / (cot + 1 / cot) / 1e3;
      c.q('Maximum torsional resistance', 'T_Rd;max', '2 ν f_cd A_k t_ef sinθ cosθ', TRdmax, 'kNm', '8.3.3 [ν = 0.6(1 − f_ck/250)]', true);
      c.q('Maximum shear resistance', 'V_Rd;max', 'b z ν f_cd/(cotθ + tanθ)', VRdmax, 'kN', '8.2.3');
      c.c('Strut interaction', 'T/T_Rd;max + V/V_Rd;max', i.T / TRdmax + i.V / VRdmax, 1, '', '8.3.3', 'Strut interaction', 'T_Ed/T_Rd;max + V_Ed/V_Rd;max ≤ 1');
      c.h1('Closed links');
      const AswT = i.T * 1e6 / (2 * Ak * m.fyd * cot);
      const AswV = i.V * 1e3 / (z * m.fyd * cot) / 2;
      c.q('Torsion links per leg', 'A_sw;T/s', 'T_Ed/(2 A_k f_yd cotθ)', AswT, 'mm²/mm');
      c.q('Shear links per leg', 'A_sw;V/s', 'V_Ed/(z f_yd cotθ)/2', AswV, 'mm²/mm');
      const prov = EC.barA(i.dw) / i.sw;
      c.c('Links per leg', 'A_sw;req/A_sw;prov', AswT + AswV, prov, 'mm²/mm', '8.3.4', 'Closed links', `H${i.dw}@${i.sw} = ${fmt(prov, 3)} mm²/mm per leg`);
      c.c('Link spacing for torsion', 's ≤ u/8', +i.sw, Math.min(u / 8, b, 0.75 * d), 'mm', '12.2', 'Link spacing');
      c.h1('Longitudinal steel');
      const Asl = i.T * 1e6 * uk * cot / (2 * Ak * m.fyd);
      c.q('Total longitudinal torsion steel', 'ΣA_sl', 'T_Ed u_k cotθ/(2 A_k f_yd)', Asl, 'mm²', '8.3.4', true);
      const pb = (b - tef) / uk, ph = (h - tef) / uk;
      const AsM = EC.AsReq(i.M, b, d, m);
      const bot = i.nb * EC.barA(i.db), top = i.nt * EC.barA(i.dt), side = i.ns * EC.barA(i.ds);
      c.c('Bottom face: bending + torsion', 'A_s;bot', AsM + Asl * pb + i.V * 1e3 * cot / 2 / m.fyd, bot, 'mm²', '8.1 + 8.3', 'Bottom steel (M + T + shift)', 'A_s;M + ΣA_sl (b_k/u_k) + V cotθ/(2 f_yd)');
      c.c('Top face (torsion share)', 'A_s;top', Asl * pb, top, 'mm²', '8.3.4', 'Top steel (T)');
      c.c('Each side face (torsion share)', 'A_s;side', Asl * ph, side, 'mm²', '8.3.4', 'Side steel (T)');
      const sc = 240 / Math.max(b, h), W = b * sc, H = h * sc, ox = 50, oy = 36, inset = (+i.cnom + i.dw / 2) * sc;
      const it = [{ r: [ox, oy, W, H] }, { c: 'link', r: [ox + inset, oy + inset, W - 2 * inset, H - 2 * inset] }];
      const row = (n, y, r) => { for (let k = 0; k < n; k++) it.push({ o: [ox + inset + 6 + k * (W - 2 * inset - 12) / Math.max(n - 1, 1), y, r] }); };
      row(+i.nb, oy + H - inset - 6, 4); row(+i.nt, oy + inset + 5, 3);
      for (let k = 1; k <= i.ns; k++) { const y = oy + inset + k * (H - 2 * inset) / (+i.ns + 1); it.push({ o: [ox + inset + 5, y, 3] }, { o: [ox + W - inset - 5, y, 3] }); }
      it.push({ t: [ox + W + 10, oy + 12, `${i.nt}H${i.dt}`] }, { t: [ox + W + 10, oy + H / 2, `${i.ns}H${i.ds} EF`] }, { t: [ox + W + 10, oy + H - 4, `${i.nb}H${i.db}`] }, { t: [ox, oy + H + 22, `closed links H${i.dw}@${i.sw}, 135° hooks`] });
      const svg = EC.sketch(400, H + 70, 'SECTION', it);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Section', `${b} × ${h} mm`], ['Closed links', `H${i.dw} @ ${i.sw}, 135° hooks, lapped round a bar`], ['Longitudinal', `${i.nb}H${i.db} bottom, ${i.nt}H${i.dt} top, ${i.ns}H${i.ds} each side`], ['Strut', `cot θ = ${cot}`]], bars: [], svg });
    }
  });

  /* ---------------- Deep beam (STM) ---------------- */
  EC.modules.deepbeam = def({
    type: 'deepbeam', name: 'Deep / Transfer Beam (STM)', cat: 'beams', prefix: 'TB', icon: 'beam', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\DeepBeam_Design',
    groups: [
      { t: 'Geometry', f: [F('L', 'Span (support centres) L', 'm', 6), F('h', 'Depth h', 'mm', 3000), F('b', 'Width b', 'mm', 500), F('lb', 'Bearing length at supports', 'mm', 600), F('lp', 'Column width (load plate)', 'mm', 600), F('ext', 'Beam end beyond support centre', 'mm', 550)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 40, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 40)] },
      { t: 'ULS actions', f: [F('P', 'Column load P_Ed', 'kN', 4200), F('a', 'Load position from left support a', 'm', 3.0), F('w', 'UDL incl. self weight w_Ed', 'kN/m', 120), F('psi', 'SLS ratio (quasi-perm./ULS)', '', 0.6)] },
      { t: 'Reinforcement', f: [F('nt', 'Tie bars n', 'no', 12), F('dt', 'Tie ϕ', 'mm', 25, EC.barOpts), F('nl', 'Tie layers', 'no', 2), F('dm', 'Web mesh ϕ (each face, both ways)', 'mm', 12, EC.barOpts), F('sm', 'Web mesh spacing', 'mm', 200)] }
    ],
    schedCols: [['size', 'b × h'], ['L', 'Span (m)'], ['tie', 'Tie'], ['mesh', 'Web mesh EF'], ['P', 'P_Ed (kN)']],
    sched: i => ({ size: `${i.b}×${i.h}`, L: i.L, tie: `${i.nt}H${i.dt}`, mesh: `H${i.dm}@${i.sm}`, P: i.P }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b, h = +i.h, L = +i.L, a = EC.clamp(+i.a, 0.05 * L, 0.95 * L);
      c.text('Simply supported deep / transfer beam (L/h < 3) by strut-and-tie (8.5): one column load plus UDL, top CCC node and lever arm, bottom tie, node and strut stresses, web mesh, tie anchorage and SLS tie stress. Node limits in the 2004 6.5 form [verify 2023 8.5].');
      mlines(c, m);
      c.h1('Reactions and moment');
      const RA = i.P * (L - a) / L + i.w * L / 2, RB = i.P * a / L + i.w * L / 2;
      const M = RA * a - i.w * a * a / 2;
      c.q('Left reaction', 'R_A', 'P(L − a)/L + wL/2', RA, 'kN');
      c.q('Right reaction', 'R_B', 'P a/L + wL/2', RB, 'kN');
      c.q('Maximum moment (under the load)', 'M_Ed', 'R_A a − w a²/2', M, 'kNm', '', true);
      c.ok({ l: 'Deep beam range', cond: L * 1000 / h < 3, txt: `L/h = ${fmt(L * 1000 / h)} (< 3)`, item: false });
      c.h1('Lever arm and tie');
      const nu = nuP(m), sCCC = nu * m.fcd, sCCT = 0.85 * nu * m.fcd, sStrut = 0.6 * nu * m.fcd;
      const u = 2 * (+i.cnom + +i.dm + i.dt / 2 + (i.nl - 1) * (+i.dt + 25) / 2);
      const d = h - u / 2;
      c.q('Tie centroid height × 2', 'u', '2 (c + ϕ_m + ϕ/2 + layers)', u, 'mm');
      const disc = d * d - 2 * M * 1e6 / (b * sCCC);
      const atop = disc > 0 ? d - Math.sqrt(disc) : d;
      const z = Math.min(d - atop / 2, 0.6 * L * 1000);
      c.q('Top node depth', 'a_top', 'from C = b a_top ν\' f_cd', atop, 'mm', 'CCC σ_Rd = ν\' f_cd');
      c.q('Lever arm', 'z', 'min(d − a_top/2, 0.6 L)', z, 'mm', '[practice for deep beams]', true);
      const Tt = M * 1e3 / z;
      c.q('Tie force', 'F_t', 'M_Ed/z', Tt, 'kN', '8.5', true);
      const As = i.nt * EC.barA(i.dt);
      c.c('Tie steel', 'F_t/(A_s f_yd)', Tt * 1e3 / m.fyd, As, 'mm²', '8.5', 'Bottom tie', `A_s;req = F_t/f_yd ≤ ${i.nt}H${i.dt}`);
      c.h1('Struts and nodes');
      const thA = Math.atan(z / (a * 1000)), thB = Math.atan(z / ((L - a) * 1000));
      c.q('Strut angle at A', 'θ_A', 'atan(z/a)', EC.deg(thA), '°');
      c.q('Strut angle at B', 'θ_B', 'atan(z/(L − a))', EC.deg(thB), '°');
      c.ok({ l: 'Strut angles', cond: Math.min(thA, thB) >= EC.rad(21.8), txt: 'θ ≥ 21.8° (cot θ ≤ 2.5)', item: 'Strut angle', r: '8.5' });
      const Rmax = Math.max(RA, RB), th = RA >= RB ? thA : thB;
      c.c('Bearing node (CCT)', 'σ_Rd', Rmax * 1e3 / (b * i.lb), sCCT, 'MPa', '8.5.4 [k = 0.85]', 'Support node CCT', 'R/(b l_b) ≤ 0.85 ν\' f_cd');
      c.c('Load node (CCC)', 'σ_Rd', i.P * 1e3 / (b * i.lp), sCCC, 'MPa', '8.5.4', 'Load node CCC', 'P/(b l_p) ≤ ν\' f_cd');
      const Fs = Rmax / Math.sin(th), ws = i.lb * Math.sin(th) + u * Math.cos(th);
      c.q('Strut force', 'F_c', 'R/sinθ', Fs, 'kN');
      c.c('Cracked strut at the node face', 'σ_c', Fs * 1e3 / (b * ws), sStrut, 'MPa', '8.5.2 [0.6 ν\']', 'Inclined strut', 'F_c/(b (l_b sinθ + u cosθ)) ≤ 0.6 ν\' f_cd');
      c.h1('Web reinforcement');
      const Am = EC.barA(i.dm) * 1000 / i.sm;
      c.c('Minimum web mesh (each face, each way)', 'A_s;mesh', Math.max(0.001 * b * 1000, 150), Am, 'mm²/m', '12.? deep beams [NDP]', 'Web mesh minimum');
      const Tsplit = 0.25 * Fs, Ls = z / Math.sin(th) / 1000;
      const Rm = 2 * Am * Ls * 0.7 * m.fyd / 1e3;
      c.c('Bottle-strut splitting', 'T_split', Tsplit, Rm, 'kN', '[practice] 0.25 F_c vs mesh crossing the strut', 'Splitting of strut');
      c.h1('Anchorage and SLS');
      const lbd = EC.anchorage(c, { phi: +i.dt, m, sigma: Tt * 1e3 / As, cd: +i.cnom + +i.dm, what: 'tie beyond node' });
      c.c('Anchorage length available', 'l_bd', lbd, +i.lb / 2 + +i.ext - +i.cnom + 12 * i.dt, 'mm', '11.4 [use U-bars / plates if NOT OK]', 'Tie anchorage');
      const ss = i.psi * Tt * 1e3 / As;
      c.c('SLS tie stress', 'σ_s', ss, 0.8 * m.fyk, 'MPa', '9.2 stress limit', 'SLS steel stress');
      const sc = 620 / (L * 1000 + 2 * i.ext), H = Math.min(h * sc, 230), ox = 50, oy = 40, zp = z * sc * H / (h * sc);
      const xA = ox + i.ext * sc, xB = xA + L * 1000 * sc, xP = xA + a * 1000 * sc, yt = oy + (atop / 2) * H / h, yb = oy + H - (u / 2) * H / h;
      const svg = EC.sketch(720, H + 90, 'ELEVATION - STRUT AND TIE MODEL', [{ r: [ox, oy, (L * 1000 + 2 * i.ext) * sc, H] }, { c: 'strut', l: [[xA, yb], [xP, yt], [xB, yb]] }, { c: 'rebarline', l: [[xA - 10, yb], [xB + 10, yb]] }, { c: 'colfill', r: [xP - i.lp * sc / 2, oy - 22, i.lp * sc, 22] }, { c: 'support', p: [[xA, oy + H], [xA - 8, oy + H + 14], [xA + 8, oy + H + 14]] }, { c: 'support', p: [[xB, oy + H], [xB - 8, oy + H + 14], [xB + 8, oy + H + 14]] }, { t: [xP + 8, oy - 6, `P = ${i.P} kN`] }, { t: [(xA + xB) / 2, yb - 6, `F_t = ${fmt(Tt, 0)} kN`, 'lbl', 'middle'] }, { dh: [xA, xB, oy + H + 30, `L = ${L} m`] }, { dv: [ox - 14, oy, oy + H, `h = ${h}`] }]);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Beam', `${b} × ${h} mm, span ${L} m`], ['Bottom tie', `${i.nt}H${i.dt} in ${i.nl} layers, anchored beyond the support node (l_bd = ${lbd} mm)`], ['Web mesh', `H${i.dm} @ ${i.sm} each face, both ways`], ['Lever arm', `z = ${fmt(z, 0)} mm, F_t = ${fmt(Tt, 0)} kN`]], bars: [], svg });
    }
  });

  /* ---------------- Web opening (Vierendeel) ---------------- */
  EC.modules.webopening = def({
    type: 'webopening', name: 'Beam with Web Opening', cat: 'beams', prefix: 'BO', icon: 'beam', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\WebOpening_Design',
    groups: [
      { t: 'Beam', f: [F('L', 'Span (simply supported) L', 'm', 8), F('w', 'ULS UDL w_Ed', 'kN/m', 45), F('b', 'Width b', 'mm', 300), F('h', 'Depth h', 'mm', 750), F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 30)] },
      { t: 'Opening', f: [F('x0', 'Opening centre from support', 'm', 2.0), F('lo', 'Opening length l_o', 'mm', 900), F('ho', 'Opening height h_o', 'mm', 280), F('yo', 'Opening centre from top', 'mm', 360)] },
      { t: 'Reinforcement', f: [F('nb', 'Bottom bars n', 'no', 4), F('db', 'Bottom ϕ', 'mm', 25, EC.barOpts), F('nt', 'Top bars n', 'no', 3), F('dt', 'Top ϕ', 'mm', 16, EC.barOpts), F('ntr', 'Trimming bars above/below opening', 'no', 2), F('dtr', 'Trimming ϕ', 'mm', 16, EC.barOpts), F('dw', 'Chord link ϕ', 'mm', 10, EC.barOpts), F('sw', 'Chord link spacing', 'mm', 100), F('nfs', 'Full-depth links each side of opening', 'no', 4)] }
    ],
    schedCols: [['size', 'b×h'], ['open', 'Opening l_o × h_o'], ['x', 'At x (m)'], ['bars', 'Bottom / top'], ['links', 'Chord links']],
    sched: i => ({ size: `${i.b}×${i.h}`, open: `${i.lo}×${i.ho}`, x: i.x0, bars: `${i.nb}H${i.db} / ${i.nt}H${i.dt}`, links: `H${i.dw}@${i.sw}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b, h = +i.h, L = +i.L, x0 = +i.x0;
      c.text('RC beam with a large rectangular web opening, Vierendeel method: chord axial force from the global moment, shear shared between chords, local chord moments, chord N–M and shear checks, full-depth links beside the opening and trimming bars.');
      mlines(c, m);
      c.h1('Actions at the opening');
      const ht = i.yo - i.ho / 2, hb = h - i.yo - i.ho / 2;
      const Mx = x => i.w * x * (L - x) / 2, Vx = x => i.w * (L / 2 - x);
      const xa = x0 - i.lo / 2000, xb = x0 + i.lo / 2000;
      const M = Math.max(Mx(xa), Mx(xb)), V = Math.max(Math.abs(Vx(xa)), Math.abs(Vx(xb)));
      c.q('Top chord depth', 'h_t', 'y_o − h_o/2', ht, 'mm');
      c.q('Bottom chord depth', 'h_b', 'h − y_o − h_o/2', hb, 'mm');
      c.q('Moment at opening (max of edges)', 'M_Ed', 'w x(L − x)/2', M, 'kNm');
      c.q('Shear at opening', 'V_Ed', 'w(L/2 − x)', V, 'kN');
      const dc = +i.cnom + +i.dw;
      const dbot = h - dc - i.db / 2, zo = dbot - ht / 2;
      c.q('Chord lever arm', 'z_o', 'd − h_t/2', zo, 'mm');
      const N = M * 1e3 / zo;
      c.q('Chord axial force', 'N_c', 'M_Ed/z_o', N, 'kN', 'Vierendeel', true);
      const At = b * ht, Ab = b * hb, Vt = V * At / (At + Ab), Vb = V - Vt;
      c.q('Shear in top chord (area share)', 'V_t', 'V A_t/(A_t + A_b)', Vt, 'kN');
      c.q('Shear in bottom chord', 'V_b', 'V − V_t', Vb, 'kN');
      const Mt = Vt * i.lo / 2000, Mb = Vb * i.lo / 2000;
      c.q('Local chord moments', 'M_t', 'V_t l_o/2', Mt, 'kNm', '', true);
      c.q('', 'M_b', 'V_b l_o/2', Mb, 'kNm', '', true);
      c.h1('Top chord (compression + local bending)');
      const At1 = EC.barA(i.dt), Atr = EC.barA(i.dtr), Ab1 = EC.barA(i.db);
      const Lt = [{ y: dc + i.dt / 2, As: i.nt * At1 }, { y: ht - dc - i.dtr / 2, As: i.ntr * Atr }];
      const Rt = EC.sec.MRd(N, ht, b, Lt, m);
      c.v({ l: 'Chord M_Rd at N_c (compression)', s: 'M_Rd;t', v: Rt.M, u: 'kNm', key: true, r: '8.1 strain compatibility' });
      c.c('Top chord N + M', 'M_t/M_Rd;t', Mt, Rt.M, 'kNm', '8.1', 'Top chord N + M');
      c.h1('Bottom chord (tension + local bending)');
      const Lb = [{ y: dc + i.dtr / 2, As: i.ntr * Atr }, { y: hb - dc - i.db / 2, As: i.nb * Ab1 }];
      const Rb = EC.sec.MRd(-N, hb, b, Lb, m);
      c.v({ l: 'Chord M_Rd at −N_c (tension)', s: 'M_Rd;b', v: Rb.M, u: 'kNm', key: true });
      c.c('Bottom chord N + M', 'M_b/M_Rd;b', Mb, Rb.M, 'kNm', '8.1', 'Bottom chord N + M');
      c.h1('Chord shear');
      c.h2('Top chord');
      const Asw = 2 * EC.barA(i.dw);
      EC.shearLinks(c, { V: Vt, b, d: ht - dc - i.dt / 2, As: i.nt * At1, m, Asw, s: +i.sw });
      c.summary[c.summary.length - 1].item = 'Top chord shear';
      c.h2('Bottom chord');
      EC.shearLinks(c, { V: Vb, b, d: hb - dc - i.db / 2, As: i.nb * Ab1, m, Asw, s: +i.sw });
      c.summary[c.summary.length - 1].item = 'Bottom chord shear';
      c.h1('Full-depth links beside the opening');
      c.c('Hanger links each side', 'V_Ed/(n A_sw f_yd)', V * 1e3 / m.fyd, i.nfs * Asw, 'mm²', '[practice]', 'Full-depth links', 'V_Ed/f_yd ≤ n · 2 legs');
      c.h1('Geometric limits [practice]');
      c.c('Opening height', 'h_o ≤ 0.5 h', +i.ho, 0.5 * h, 'mm', '[practice]', 'Opening height');
      c.c('Chord depth', 'min(h_t, h_b) ≥ max(0.2h, 100)', Math.max(0.2 * h, 100), Math.min(ht, hb), 'mm', '[practice]', 'Chord depth');
      c.ok({ l: 'Opening clear of supports', cond: xa >= h / 1000 && xb <= L - h / 1000, txt: 'opening ≥ h from the support faces', item: 'Opening position', r: '[practice]' });
      const pts = [], vs = []; for (let k = 0; k <= 40; k++) { const x = k / 40 * L; pts.push([x, Mx(x)]); vs.push([x, Vx(x)]); }
      const sc = 680 / (L * 1000), H = h * sc * 2.2, oy = 36;
      const svg = EC.sketch(740, H + 70, 'ELEVATION', [{ r: [30, oy, L * 1000 * sc, H] }, { c: 'slabarea', r: [30 + xa * 1000 * sc, oy + ht * H / h, i.lo * sc, i.ho * H / h] }, { c: 'edge', l: [[30 + xa * 1000 * sc, oy + ht * H / h], [30 + xb * 1000 * sc, oy + ht * H / h], [30 + xb * 1000 * sc, oy + (ht + +i.ho) * H / h], [30 + xa * 1000 * sc, oy + (ht + +i.ho) * H / h], [30 + xa * 1000 * sc, oy + ht * H / h]] }, { dh: [30, 30 + L * 1000 * sc, oy + H + 24, `L = ${L} m, opening ${i.lo}×${i.ho} at x = ${x0} m`] }]) +
        EC.plot({ title: 'Bending moment / shear', xl: 'x (m)', yl: 'M (kNm), V (kN)', series: [{ name: 'M', pts, fill: true }, { name: 'V', pts: vs, cls: 1 }], legend: true });
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Beam', `${b} × ${h} mm, opening ${i.lo} × ${i.ho} mm at x = ${x0} m`], ['Chords', `top ${fmt(ht, 0)} mm, bottom ${fmt(hb, 0)} mm, N_c = ${fmt(N, 0)} kN`], ['Trimming bars', `${i.ntr}H${i.dtr} above and below the opening, l_bd beyond corners`], ['Links', `chords H${i.dw}@${i.sw}; ${i.nfs} full-depth H${i.dw} links each side`]], bars: [], svg });
    }
  });

  /* ---------------- Fatigue ---------------- */
  EC.modules.fatigue = def({
    type: 'fatigue', name: 'Fatigue of RC Beam', cat: 'beams', prefix: 'FT', icon: 'beam', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Fatigue_Design',
    groups: [
      { t: 'Section', f: [F('b', 'Width b', 'mm', 400), F('h', 'Depth h', 'mm', 800), F('cnom', 'Cover', 'mm', 40), F('nb', 'Bottom bars n', 'no', 5), F('db', 'Bottom ϕ', 'mm', 25, EC.barOpts), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500)] },
      { t: 'Fatigue parameters', f: [F('MG', 'Permanent moment (basic comb.) M_G', 'kNm', 180), F('ae', 'Modular ratio α_f', '', 10), F('Rsk', 'S-N curve Δσ_Rsk (N* = 10⁶)', 'MPa', 162.5, [{ v: 162.5, l: 'Straight / bent bars, k₁ = 5, k₂ = 9 (162.5 MPa)' }, { v: 58.5, l: 'Welded bars / couplers, k₁ = 3, k₂ = 5 (58.5 MPa)' }]), T('spec', 'Load spectrum (moment range, cycles)', ['ΔM (kNm)', 'n'], [[120, 2e5], [80, 2e6], [40, 2e7]])] }
    ],
    schedCols: [['size', 'b×h'], ['bars', 'Bottom'], ['D', 'Damage D']],
    sched: (i, r) => ({ size: `${i.b}×${i.h}`, bars: `${i.nb}H${i.db}`, D: r && r.D !== undefined ? r.D.toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b;
      const S = EC.rows(i.spec);
      const welded = +i.Rsk < 100, k1 = welded ? 3 : 5, k2 = welded ? 5 : 9;
      c.text('Fatigue of an RC beam (Section 10): cracked elastic section with modular ratio α_f, reinforcement S-N curve with Palmgren-Miner damage, concrete compression check under the maximum and minimum moments.');
      mlines(c, m);
      c.h1('Cracked elastic section');
      const d = i.h - i.cnom - 10 - i.db / 2, As = i.nb * EC.barA(i.db), a = +i.ae;
      const x = (-a * As + Math.sqrt(a * a * As * As + 2 * b * a * As * d)) / b;
      const Icr = b * x ** 3 / 3 + a * As * (d - x) ** 2;
      c.q('Effective depth', 'd', 'h − c − 10 − ϕ/2', d, 'mm');
      c.q('Neutral axis depth', 'x', 'b x²/2 = α_f A_s (d − x)', x, 'mm');
      c.q('Cracked second moment', 'I_cr', 'b x³/3 + α_f A_s (d − x)²', Icr / 1e6, '×10⁶ mm⁴');
      c.h1('Reinforcement - damage sum');
      const gF = 1.0, gS = 1.15;
      let D = 0; const rows = [];
      S.forEach(([dM, n]) => {
        const ds = a * dM * 1e6 * (d - x) / Icr;
        const r = (+i.Rsk / gS) / (gF * Math.max(ds, 1e-6));
        const k = r >= 1 ? k2 : k1;
        const N = 1e6 * Math.pow(r, k);
        D += n / N; rows.push([dM, ds, n, N, n / N]);
      });
      c.tbl(['ΔM (kNm)', 'Δσ_s (MPa)', 'n', 'N_i', 'n/N_i'], rows, [0, 1, 0, 0, 4]);
      c.v({ l: 'Steel stress range', s: 'Δσ_s', f: 'α_f ΔM (d − x)/I_cr', v: rows.length ? Math.max(...rows.map(r => r[1])) : 0, u: 'MPa', n: 'largest block' });
      c.v({ l: 'Damage sum (Palmgren-Miner)', s: 'D_Ed', f: 'Σ n_i/N_i,  N_i = N* (Δσ_Rsk/(γ_S;fat γ_F;fat Δσ))^k', n: `k₁ = ${k1}, k₂ = ${k2}, γ_S;fat = 1.15`, v: D, u: '', key: true, r: '10.? [NDP]' });
      c.c('Fatigue damage', 'D_Ed', D, 1, '', 'Section 10', 'Fatigue of reinforcement');
      c.h1('Concrete in compression');
      const Mmax = +i.MG + Math.max(0, ...S.map(r => r[0])), Mmin = +i.MG;
      const scmax = Mmax * 1e6 * x / Icr, scmin = Mmin * 1e6 * x / Icr;
      const fcdfat = 0.85 * m.fcd * (1 - m.fck / 250);
      c.q('Maximum / minimum concrete stress', 'σ_c;max', 'M x/I_cr', scmax, 'MPa');
      c.q('', 'σ_c;min', '', scmin, 'MPa');
      c.q('Fatigue design strength', 'f_cd;fat', 'k_1 β_cc f_cd (1 − f_ck/250),  k_1 = 0.85', fcdfat, 'MPa', '10.? [NDP]');
      const lim = Math.min(0.9, 0.5 + 0.45 * scmin / fcdfat);
      c.c('Concrete fatigue', 'σ_c;max/f_cd;fat', scmax / fcdfat, lim, '', '10.? simplified', 'Concrete fatigue', '≤ 0.5 + 0.45 σ_c;min/f_cd;fat ≤ 0.9');
      const sn = []; for (let e = 4; e <= 9; e += 0.25) { const N = Math.pow(10, e); const k = N <= 1e6 ? k1 : k2; sn.push([e, Math.log10(+i.Rsk / gS * Math.pow(1e6 / N, 1 / k))]); }
      const svg = EC.plot({ title: 'S-N curve (log₁₀)', xl: 'log₁₀ N', yl: 'log₁₀ Δσ (MPa)', series: [{ name: 'Δσ_Rsk/γ_S', pts: sn }], points: rows.map(r => ({ x: Math.log10(r[2]), y: Math.log10(Math.max(r[1], 1)), t: '' })) });
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Section', `${b} × ${i.h} mm, ${i.nb}H${i.db}`], ['Bars', welded ? 'welded / coupled - category per EN 10080' : 'straight / bent bars, mandrel per Table 11.1'], ['Damage', `D = ${fmt(D, 3)}`]], bars: [], svg, D });
    }
  });

  /* ---------------- shared slab helpers ---------------- */
  const loadLines = (c, i, h) => {
    c.h1('Loads');
    const sw = 25 * h / 1000;
    c.q('Self weight', 'g_sw', '25 h', sw, 'kPa');
    const gk = sw + +i.gsdl, w = i.gG * gk + i.gQ * i.qk;
    c.q('Permanent', 'g_k', 'g_sw + g_sdl', gk, 'kPa');
    c.v({ l: 'ULS design load', s: 'w_Ed', f: 'γ_G g_k + γ_Q q_k', n: `${i.gG}·${fmt(gk)} + ${i.gQ}·${i.qk}`, v: w, u: 'kPa', r: 'EN 1990 [NDP]', key: true });
    return { gk, w, wqp: gk + 0.3 * i.qk };
  };
  const LOADS = [F('gsdl', 'Superimposed dead g_sdl', 'kPa', 1.5), F('qk', 'Imposed q_k', 'kPa', 3.0), F('gG', 'γ_G', '', 1.35), F('gQ', 'γ_Q', '', 1.5)];

  /* ---------------- Two-way slab ---------------- */
  const R = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0];
  const TW = {
    ss: { sx: [0.062, 0.074, 0.084, 0.093, 0.099, 0.104, 0.113, 0.118], sy: [0.062, 0.061, 0.059, 0.055, 0.051, 0.046, 0.037, 0.029], nx: null, ny: null, K: 1.0 },
    int: { sx: [0.024, 0.028, 0.032, 0.035, 0.037, 0.040, 0.044, 0.048], sy: [0.024, 0.024, 0.024, 0.024, 0.024, 0.024, 0.024, 0.024], nx: [0.031, 0.037, 0.042, 0.046, 0.050, 0.053, 0.059, 0.063], ny: [0.032, 0.032, 0.032, 0.032, 0.032, 0.032, 0.032, 0.032], K: 1.5 },
    edge: { sx: [0.034, 0.038, 0.042, 0.046, 0.050, 0.052, 0.058, 0.063], sy: [0.034, 0.034, 0.034, 0.034, 0.034, 0.034, 0.034, 0.034], nx: [0.045, 0.050, 0.055, 0.059, 0.063, 0.066, 0.073, 0.078], ny: [0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045], K: 1.3 }
  };
  EC.modules.twoway = def({
    type: 'twoway', name: 'Two-way Slab', cat: 'slabs', prefix: 'TS', icon: 'slab', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Slab_Design', libFile: 'Slab_TwoWay_EC2-2023_Standalone.mcdx',
    groups: [
      { t: 'Panel', f: [F('lx', 'Short span l_x', 'm', 5.0), F('ly', 'Long span l_y', 'm', 6.5), F('h', 'Thickness h', 'mm', 180), F('sup', 'Edge condition', '', 'int', [{ v: 'ss', l: 'Simply supported, corners free' }, { v: 'int', l: 'Interior panel (all edges continuous)' }, { v: 'edge', l: 'One long edge discontinuous' }])] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 25), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Loads', f: LOADS },
      { t: 'Reinforcement', f: [F('dx', 'Bottom x ϕ (outer)', 'mm', 10, EC.barOpts), F('sx', 'Bottom x spacing', 'mm', 150), F('dy', 'Bottom y ϕ (inner)', 'mm', 10, EC.barOpts), F('sy', 'Bottom y spacing', 'mm', 200), F('dt', 'Top ϕ (supports)', 'mm', 12, EC.barOpts), F('st', 'Top spacing', 'mm', 150)] }
    ],
    schedCols: [['panel', 'l_x × l_y (m)'], ['h', 'h'], ['bx', 'Bottom x'], ['by', 'Bottom y'], ['top', 'Top']],
    sched: i => ({ panel: `${i.lx} × ${i.ly}`, h: i.h, bx: `H${i.dx}@${i.sx}`, by: `H${i.dy}@${i.sy}`, top: i.sup === 'ss' ? '–' : `H${i.dt}@${i.st}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), h = +i.h, lx = +i.lx, ly = Math.max(+i.ly, lx), r = Math.min(ly / lx, 2);
      const k = TW[i.sup];
      c.text('Two-way solid slab panel under uniform load: bending moment coefficients for rectangular panels (BS 8110 Tables 3.13 / 3.14 - practice, yield-line based), design both ways, shear, deflection on the short span. For irregular panels use FE moments.');
      mlines(c, m);
      const L = loadLines(c, i, h);
      c.h1('Moments per metre');
      const a = arr => EC.interp(R, arr, r);
      c.q('Aspect ratio', 'l_y/l_x', '', r, '');
      const msx = a(k.sx) * L.w * lx * lx, msy = a(k.sy) * L.w * lx * lx;
      c.v({ l: 'Short-span sagging', s: 'm_sx', f: `α_sx w l_x²,  α_sx = ${fmt(a(k.sx), 3)}`, v: msx, u: 'kNm/m', key: true });
      c.v({ l: 'Long-span sagging', s: 'm_sy', f: `α_sy w l_x²,  α_sy = ${fmt(a(k.sy), 3)}`, v: msy, u: 'kNm/m', key: true });
      let mnx = 0, mny = 0;
      if (k.nx) { mnx = a(k.nx) * L.w * lx * lx; mny = a(k.ny) * L.w * lx * lx; c.v({ l: 'Short-span hogging (support)', s: 'm_nx', v: mnx, u: 'kNm/m', key: true }); c.v({ l: 'Long-span hogging (support)', s: 'm_ny', v: mny, u: 'kNm/m' }); }
      const dx = h - i.cnom - i.dx / 2, dy = dx - i.dx / 2 - i.dy / 2, dt = h - i.cnom - i.dt / 2;
      const Asx = EC.barA(i.dx) * 1000 / i.sx, Asy = EC.barA(i.dy) * 1000 / i.sy, Ast = EC.barA(i.dt) * 1000 / i.st;
      c.h1('Bending');
      c.h2('Short span (outer layer)');
      const bx = EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: msx, b: 1000, d: dx, As: Asx, m, barTxt: `H${i.dx}@${i.sx}`, tag: 'x', item: 'Bending short span' });
      c.h2('Long span (inner layer)');
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: msy, b: 1000, d: dy, As: Asy, m, barTxt: `H${i.dy}@${i.sy}`, tag: 'y', item: 'Bending long span' });
      if (k.nx) { c.h2('Supports (top)'); EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Math.max(mnx, mny), b: 1000, d: dt, As: Ast, m, barTxt: `H${i.dt}@${i.st}`, tag: 'sup', item: 'Bending support' }); }
      const Amin = d => Math.max(0.26 * m.fctm / m.fyk * 1000 * d, 0.0013 * 1000 * d);
      c.c('Minimum steel', 'A_s;min', Amin(dy), Math.min(Asx, Asy), 'mm²/m', '12.3', 'Minimum steel');
      c.c('Bar spacing', 's_max', Math.max(i.sx, i.sy), Math.min(2 * h, 250), 'mm', '12.3 [NDP]', 'Bar spacing');
      c.h1('Shear');
      const V = 0.5 * L.w * lx * (k.nx ? 1.15 : 1);
      c.q('Support shear (approx.)', 'v_Ed', k.nx ? '1.15 × w l_x/2' : 'w l_x/2', V, 'kN/m');
      const sh = EC.shearNoLinks(c, { V, b: 1000, d: dx, As: Asx, m });
      c.c('Shear without links', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'Shear');
      c.h1('Deflection (short span)');
      EC.spanDepth(c, { m, L: lx, d: dx, b: 1000, AsReq: Math.max(bx.AsReq, 1), AsProv: Asx, K: k.K });
      const sc = 260 / ly;
      const svg = EC.sketch(420, lx * sc + 90, 'PANEL PLAN', [{ c: 'conc', r: [60, 40, ly * sc, lx * sc] }, { t: [60 + ly * sc / 2, 40 + lx * sc / 2 - 8, `m_sx = ${fmt(msx, 1)}`, 'lbl', 'middle'] }, { t: [60 + ly * sc / 2, 40 + lx * sc / 2 + 10, `m_sy = ${fmt(msy, 1)} kNm/m`, 'lbl', 'middle'] }, { dh: [60, 60 + ly * sc, 40 + lx * sc + 20, `l_y = ${ly} m`] }, { dv: [44, 40, 40 + lx * sc, `l_x = ${lx}`] }].concat(k.nx ? [{ c: 'edge', l: [[60, 40], [60 + ly * sc, 40]] }, { c: 'edge', l: [[60, 40 + lx * sc], [60 + ly * sc, 40 + lx * sc]] }] : []));
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Slab', `h = ${h} mm, panel ${lx} × ${ly} m`], ['Bottom', `H${i.dx}@${i.sx} (short span, outer), H${i.dy}@${i.sy} (long span)`], ['Top', k.nx ? `H${i.dt}@${i.st} over supports, extend 0.25 l_x` : 'torsion steel at free corners (3/4 of short-span steel over l_x/5)'], ['Loads', `g_k = ${fmt(L.gk)} kPa, q_k = ${i.qk} kPa`]], bars: [], svg });
    }
  });

  /* ---------------- Flat slab ---------------- */
  EC.modules.flatslab = def({
    type: 'flatslab', name: 'Flat Slab (strip design)', cat: 'slabs', prefix: 'FS', icon: 'slab', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Slab_Design', libFile: 'Slab_Flat_EC2-2023_Standalone.mcdx',
    groups: [
      { t: 'Panel', f: [F('lx', 'Span in design direction l_x', 'm', 7.5), F('ly', 'Transverse span l_y', 'm', 7.5), F('h', 'Thickness h', 'mm', 260), F('c', 'Column size c', 'mm', 500), F('span', 'Span', '', 'int', [{ v: 'int', l: 'Interior span (neg 0.65 / pos 0.35 M_0)' }, { v: 'end', l: 'End span, edge column (0.70 / 0.52 / 0.26 M_0)' }])] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 25), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Loads', f: LOADS },
      { t: 'Reinforcement', f: [F('dct', 'Column strip top ϕ', 'mm', 16, EC.barOpts), F('sct', 'spacing', 'mm', 125), F('dmt', 'Middle strip top ϕ', 'mm', 12, EC.barOpts), F('smt', 'spacing', 'mm', 200), F('dcb', 'Column strip bottom ϕ', 'mm', 12, EC.barOpts), F('scb', 'spacing', 'mm', 150), F('dmb', 'Middle strip bottom ϕ', 'mm', 12, EC.barOpts), F('smb', 'spacing', 'mm', 200)] }
    ],
    schedCols: [['panel', 'Grid (m)'], ['h', 'h'], ['cst', 'CS top'], ['mst', 'MS top'], ['csb', 'CS bottom'], ['msb', 'MS bottom']],
    sched: i => ({ panel: `${i.lx} × ${i.ly}`, h: i.h, cst: `H${i.dct}@${i.sct}`, mst: `H${i.dmt}@${i.smt}`, csb: `H${i.dcb}@${i.scb}`, msb: `H${i.dmb}@${i.smb}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), h = +i.h, lx = +i.lx, ly = +i.ly;
      c.text('Flat slab on a regular column grid, design strip method: total static moment M_0, longitudinal distribution (practice coefficients), column / middle strip shares to Annex I, bending checks per metre, deflection. Punching: use the Flat slab punching module.');
      mlines(c, m);
      const L = loadLines(c, i, h);
      c.h1('Static moment and distribution');
      const ln = Math.max(lx - i.c / 1000, 0.65 * lx);
      const M0 = L.w * ly * ln * ln / 8;
      c.q('Clear span', 'l_n', 'l_x − c ≥ 0.65 l_x', ln, 'm');
      c.v({ l: 'Total static moment', s: 'M_0', f: 'w l_y l_n²/8', v: M0, u: 'kNm', key: true });
      const cf = i.span === 'int' ? { ni: 0.65, p: 0.35, ne: 0 } : { ni: 0.70, p: 0.52, ne: 0.26 };
      const Mneg = cf.ni * M0, Mpos = cf.p * M0;
      c.q('Negative moment (interior support)', 'M_neg', `${cf.ni} M_0`, Mneg, 'kNm', '[practice]');
      c.q('Positive moment (span)', 'M_pos', `${cf.p} M_0`, Mpos, 'kNm', '[practice]');
      const wcs = Math.min(lx, ly) / 2, wms = ly - wcs;
      c.q('Column strip width', 'b_cs', 'min(l_x, l_y)/2', wcs, 'm', 'Annex I');
      const mcsT = 0.75 * Mneg / wcs, mmsT = 0.25 * Mneg / wms, mcsB = 0.55 * Mpos / wcs, mmsB = 0.45 * Mpos / wms;
      c.tbl(['Strip', 'share', 'm_Ed (kNm/m)'], [['Column strip top', 0.75, mcsT], ['Middle strip top', 0.25, mmsT], ['Column strip bottom', 0.55, mcsB], ['Middle strip bottom', 0.45, mmsB]], [0, 2, 1]);
      c.note('Annex I shares: negative CS 60–80 %, positive CS 50–70 % - values used: 75 % / 55 %.');
      const dT = h - i.cnom - i.dct / 2, dB = h - i.cnom - i.dcb / 2;
      const chk = (lab, M, d, phi, s) => { c.h2(lab); return EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M, b: 1000, d, As: EC.barA(phi) * 1000 / s, m, barTxt: `H${phi}@${s}`, item: lab }); };
      c.h1('Bending per metre');
      chk('Column strip top', mcsT, dT, +i.dct, +i.sct); chk('Middle strip top', mmsT, dT, +i.dmt, +i.smt);
      const rb = chk('Column strip bottom', mcsB, dB, +i.dcb, +i.scb); chk('Middle strip bottom', mmsB, dB, +i.dmb, +i.smb);
      c.h1('Deflection');
      EC.spanDepth(c, { m, L: Math.max(lx, ly), d: dB, b: 1000, AsReq: Math.max(rb.AsReq, 1), AsProv: EC.barA(i.dcb) * 1000 / i.scb, K: 1.2 });
      c.note('Check punching at every column with the Flat slab punching module (V_Ed ≈ w l_x l_y = ' + fmt(L.w * lx * ly, 0) + ' kN at an interior column).');
      const sc = 300 / ly;
      const svg = EC.sketch(420, 330, 'STRIPS (plan)', [{ c: 'conc', r: [60, 40, lx * sc, ly * sc] }, { c: 'tieband', r: [60, 40, lx * sc, wcs / 2 * sc] }, { c: 'tieband', r: [60, 40 + (ly - wcs / 2) * sc, lx * sc, wcs / 2 * sc] }, { c: 'colfill', r: [54, 34, 12, 12] }, { c: 'colfill', r: [54 + lx * sc, 34, 12, 12] }, { c: 'colfill', r: [54, 34 + ly * sc, 12, 12] }, { c: 'colfill', r: [54 + lx * sc, 34 + ly * sc, 12, 12] }, { t: [70, 40 + ly * sc / 2, 'middle strip'] }, { t: [70, 56, 'column strip'] }, { dh: [60, 60 + lx * sc, 40 + ly * sc + 22, `l_x = ${lx} m`] }]);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Slab', `h = ${h} mm, grid ${lx} × ${ly} m, columns ${i.c} mm`], ['Column strip', `top H${i.dct}@${i.sct}, bottom H${i.dcb}@${i.scb}`], ['Middle strip', `top H${i.dmt}@${i.smt}, bottom H${i.dmb}@${i.smb}`], ['Top bars', 'extend 0.3 l_n from support faces; integrity bars through columns']], bars: [], svg });
    }
  });

  /* ---------------- Ribbed slab ---------------- */
  const RCOEF = { ss: [0.125, 0, 0.5, 1.0, 1.0], end: [0.086, 0.086, 0.6, 1.3, 0.85], int: [0.063, 0.063, 0.5, 1.5, 0.7] };
  EC.modules.ribbed = def({
    type: 'ribbed', name: 'Ribbed Slab (one-way)', cat: 'slabs', prefix: 'RS', icon: 'slab', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\RibbedSlab_Design',
    groups: [
      { t: 'Geometry', f: [F('L', 'Span L', 'm', 8), F('sup', 'Span type', '', 'end', [{ v: 'ss', l: 'Simply supported' }, { v: 'end', l: 'End span' }, { v: 'int', l: 'Interior span' }]), F('s', 'Rib spacing (c/c)', 'mm', 750), F('bw', 'Rib width b_w', 'mm', 150), F('h', 'Total depth h', 'mm', 400), F('hf', 'Topping h_f', 'mm', 80)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 25), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Loads', f: LOADS },
      { t: 'Reinforcement per rib', f: [F('nb', 'Bottom bars n', 'no', 2), F('db', 'Bottom ϕ', 'mm', 20, EC.barOpts), F('nt', 'Top bars n (support)', 'no', 2), F('dt', 'Top ϕ', 'mm', 16, EC.barOpts), F('dw', 'Rib link ϕ (0 = none)', 'mm', 8), F('sw', 'Link spacing', 'mm', 250), F('dm', 'Topping mesh ϕ', 'mm', 8, EC.barOpts), F('sm', 'Mesh spacing', 'mm', 200)] }
    ],
    schedCols: [['geo', 'h / h_f / b_w @ s'], ['span', 'Span'], ['bot', 'Bottom/rib'], ['top', 'Top/rib'], ['mesh', 'Mesh']],
    sched: i => ({ geo: `${i.h}/${i.hf}/${i.bw}@${i.s}`, span: i.L, bot: `${i.nb}H${i.db}`, top: `${i.nt}H${i.dt}`, mesh: `H${i.dm}@${i.sm}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl), L = +i.L, s = +i.s, bw = +i.bw, h = +i.h, hf = +i.hf, k = RCOEF[i.sup];
      c.text('One-way ribbed slab: ribbed-slab limits, self weight, coefficient moments, T-section rib in sagging, rib web in hogging, rib shear, flange–web shear with the topping mesh, deflection.');
      mlines(c, m);
      c.h1('Ribbed slab limits');
      c.c('Rib spacing', 's ≤ 1500', s, 1500, 'mm', '[NDP] 7.3', 'Rib spacing');
      c.c('Rib depth below flange', '(h − h_f) ≤ 4 b_w', h - hf, 4 * bw, 'mm', '[NDP]', 'Rib depth');
      c.c('Topping thickness', 'h_f ≥ max(s/10, 50)', Math.max(s / 10, 50), hf, 'mm', '[NDP]', 'Topping');
      c.h1('Loads per rib');
      const sw = 25 * (hf + (h - hf) * bw / s) / 1000;
      c.q('Equivalent self weight', 'g_sw', '25 [h_f + (h − h_f) b_w/s]', sw, 'kPa');
      const gk = sw + +i.gsdl, w = (i.gG * gk + i.gQ * i.qk) * s / 1000;
      c.v({ l: 'ULS load per rib', s: 'w_rib', f: '(γ_G g_k + γ_Q q_k) s', v: w, u: 'kN/m', key: true });
      const Ms = k[0] * w * L * L, Mh = k[1] * w * L * L, V = k[2] * w * L;
      c.q('Span moment', 'M_Ed;span', `${k[0]} w L²`, Ms, 'kNm');
      if (Mh) c.q('Support moment', 'M_Ed;sup', `${k[1]} w L²`, Mh, 'kNm');
      c.q('Shear', 'V_Ed', `${k[2]} w L`, V, 'kN');
      c.h1('Sagging - T-section');
      const l0 = k[4] * L * 1000;
      const beff = Math.min(s, bw + 2 * Math.min(0.2 * (s - bw) / 2 + 0.1 * l0, 0.2 * l0, (s - bw) / 2));
      c.q('Effective flange width', 'b_eff', 'b_w + Σ min(0.2 b_i + 0.1 l_0, 0.2 l_0, b_i)', beff, 'mm', '7.2.? [verify]');
      const d = h - i.cnom - (+i.dw || 0) - i.db / 2, As = i.nb * EC.barA(i.db);
      const Mf = m.fcd * beff * hf * (d - hf / 2) / 1e6;
      c.q('Flange capacity', 'M_f', 'f_cd b_eff h_f (d − h_f/2)', Mf, 'kNm');
      let MRd;
      if (Ms <= Mf) { EC.bending(c, { M: Ms, b: beff, d, As, m, barTxt: `${i.nb}H${i.db}`, tag: 'span', item: 'Rib sagging' }); }
      else {
        c.note('Stress block extends into the web.');
        const Cf = m.fcd * (beff - bw) * hf, Mrem = Ms * 1e6 - Cf * (d - hf / 2);
        const AsR = Cf / m.fyd + EC.AsReq(Mrem / 1e6, bw, d, m);
        c.q('Required steel', 'A_s;req', 'flange + web parts', AsR, 'mm²', '', true);
        const yw = (As * m.fyd - Cf) / (m.fcd * bw);
        MRd = (Cf * (d - hf / 2) + Math.max(yw, 0) * bw * m.fcd * (d - hf - yw / 2)) / 1e6;
        c.c('Rib sagging', 'M_Ed/M_Rd', Ms, MRd, 'kNm', '8.1', 'Rib sagging');
      }
      const AreqS = EC.AsReq(Math.min(Ms, Mf), beff, d, m);
      if (Mh) { c.h1('Hogging - rib web'); EC.bending(c, { M: Mh, b: bw, d: h - i.cnom - (+i.dw || 0) - i.dt / 2, As: i.nt * EC.barA(i.dt), m, barTxt: `${i.nt}H${i.dt}`, tag: 'sup', item: 'Rib hogging' }); }
      c.h1('Rib shear');
      if (+i.dw > 0) EC.shearLinks(c, { V, b: bw, d, As, m, Asw: 2 * EC.barA(i.dw), s: +i.sw });
      else { const sh = EC.shearNoLinks(c, { V, b: bw, d, As, m }); c.c('Rib shear without links', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'Rib shear'); }
      c.h1('Flange–web shear');
      const dx = (i.sup === 'ss' ? L / 2 : L / 4) * 1000;
      const dF = Math.max(Ms, Mh) * 1e6 / (0.9 * d) * ((beff - bw) / 2 / beff);
      const vEd = dF / (hf * dx);
      c.q('Longitudinal shear in flange', 'v_Ed', 'ΔF_d/(h_f Δx)', vEd, 'MPa', '8.2.? (2004 6.2.4)');
      const fctd = 0.7 * m.fctm / 1.5, Asf = EC.barA(i.dm) * 1000 / i.sm;
      if (vEd <= 0.4 * fctd) c.note('v_Ed ≤ 0.4 f_ctd: no transverse steel needed beyond the minimum.');
      const Areq = vEd <= 0.4 * fctd ? 0 : vEd * hf * 1000 / (m.fyd * 2.0);
      c.c('Transverse steel in topping', 'A_sf/s_f', Areq, Asf, 'mm²/m', 'cot θ_f = 2.0', 'Flange-web shear');
      c.h1('Deflection');
      const f = beff / bw > 3 ? 0.8 : 1;
      EC.spanDepth(c, { m, L, d, b: beff, AsReq: Math.max(AreqS, 1), AsProv: As, K: k[3] * f });
      c.note(`K includes the ribbed-section factor ${f} (b_eff/b_w ${beff / bw > 3 ? '>' : '≤'} 3).`);
      const sc = 0.32, H = h * sc, oy = 40;
      const items = [{ c: 'conc', r: [20, oy, 2 * s * sc + bw * sc, hf * sc] }];
      [0, 1, 2].forEach(j => { items.push({ c: 'conc', r: [20 + j * s * sc, oy + hf * sc, bw * sc, H - hf * sc] }); for (let q = 0; q < i.nb; q++) items.push({ o: [20 + j * s * sc + (bw * sc) * (q + 1) / (+i.nb + 1), oy + H - 8, 3] }); });
      const svg = EC.sketch(Math.max(420, 40 + 2 * s * sc + bw * sc), H + 80, 'TWO RIBS', items.concat([{ dh: [20, 20 + s * sc, oy + H + 20, `s = ${s}`] }]));
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Slab', `h = ${h}, h_f = ${hf}, ribs ${bw} @ ${s} mm`], ['Per rib', `bottom ${i.nb}H${i.db}, top ${i.nt}H${i.dt} at supports${+i.dw ? `, links H${i.dw}@${i.sw}` : ''}`], ['Topping mesh', `H${i.dm} @ ${i.sm} both ways`]], bars: [], svg });
    }
  });

  /* ---------------- PT slab ---------------- */
  EC.modules.ptslab = def({
    type: 'ptslab', name: 'Post-tensioned Slab', cat: 'slabs', prefix: 'PT', icon: 'slab', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\PTSlab_Design',
    groups: [
      { t: 'Slab strip', f: [F('L', 'Span (simply supported strip) L', 'm', 8.5), F('h', 'Thickness h', 'mm', 240), F('fck', 'Concrete class', '', 35, EC.CONC), F('fckt', 'f_ck(t) at transfer', 'MPa', 25), F('phi', 'Creep coefficient φ', '', 2.0)] },
      { t: 'Tendons', f: [F('P0', 'Jacking force per tendon', 'kN', 400), F('Ap', 'A_p per tendon', 'mm²', 300), F('fpk', 'f_pk', 'MPa', 1860), F('st', 'Tendon spacing', 'mm', 450), F('e', 'Drape (midspan below centroid)', 'mm', 80), F('li', 'Initial losses', '%', 8), F('lt', 'Total losses', '%', 20), F('bond', 'Tendon type', '', 'unb', [{ v: 'unb', l: 'Unbonded (σ_p = σ_pe + 100 MPa)' }, { v: 'bond', l: 'Bonded (f_pd)' }])] },
      { t: 'Loads', f: LOADS },
      { t: 'Passive steel', f: [F('db', 'Bottom ϕ', 'mm', 12, EC.barOpts), F('sb', 'Bottom spacing', 'mm', 200), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 30)] }
    ],
    schedCols: [['h', 'h'], ['span', 'Span'], ['tend', 'Tendons'], ['e', 'Drape'], ['pass', 'Passive bottom']],
    sched: i => ({ h: i.h, span: i.L, tend: `${i.P0} kN @ ${i.st}`, e: i.e, pass: `H${i.db}@${i.sb}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), L = +i.L, h = +i.h;
      c.text('Post-tensioned one-way strip per metre: load balancing, SLS stresses at transfer and in service, ULS bending with tendons and passive steel, long-term deflection of the net unbalanced load.');
      mlines(c, m);
      c.h1('Prestress per metre');
      const nt = 1000 / i.st, Pi = i.P0 * (1 - i.li / 100) * nt, Pm = i.P0 * (1 - i.lt / 100) * nt;
      c.q('Initial prestress (after transfer)', 'P_0', 'P_jack (1 − Δ_i) · 1000/s', Pi, 'kN/m');
      c.q('Long-term prestress', 'P_m;∞', 'P_jack (1 − Δ_tot) · 1000/s', Pm, 'kN/m', '', true);
      c.ok({ l: 'Jacking stress', cond: i.P0 * 1e3 / i.Ap <= 0.8 * i.fpk, txt: `σ_p;max = ${fmt(i.P0 * 1e3 / i.Ap)} MPa ≤ 0.8 f_pk = ${fmt(0.8 * i.fpk)} MPa`, item: 'Jacking stress', r: '[NDP]' });
      const L1 = loadLines(c, i, h);
      const wbal = 8 * Pm * i.e / 1000 / (L * L);
      c.v({ l: 'Balanced load', s: 'w_bal', f: '8 P_m;∞ e/L²', v: wbal, u: 'kPa', key: true });
      c.q('Balanced share of permanent load', 'w_bal/g_k', '', wbal / L1.gk, '');
      c.h1('SLS stresses (compression +)');
      const A = 1000 * h, W = 1000 * h * h / 6;
      const sig = (P, M) => [P * 1e3 / A + (M - P * i.e / 1000) * 1e6 / W, P * 1e3 / A - (M - P * i.e / 1000) * 1e6 / W];
      const Msw = 25 * h / 1000 * L * L / 8, Mk = (L1.gk + +i.qk) * L * L / 8;
      const [tt, tb] = sig(Pi, Msw), [st, sb] = sig(Pm, Mk);
      const fctmT = 0.3 * Math.pow(i.fckt, 2 / 3);
      c.tbl(['Stage', 'σ_top (MPa)', 'σ_bottom (MPa)'], [['Transfer (P_0, self weight)', tt, tb], ['Service (P_m∞, characteristic)', st, sb]], [0, 2, 2]);
      c.c('Transfer compression', 'σ_max/0.6 f_ck(t)', Math.max(tt, tb), 0.6 * i.fckt, 'MPa', '5.10.2.2', 'Transfer compression');
      c.c('Transfer tension', '−σ_min/f_ctm(t)', Math.max(0, -Math.min(tt, tb)), fctmT, 'MPa', '[practice]', 'Transfer tension');
      c.c('Service compression', 'σ_max/0.6 f_ck', Math.max(st, sb), 0.6 * m.fck, 'MPa', '9.1', 'Service compression');
      c.c('Service tension', '−σ_min/f_ctm', Math.max(0, -Math.min(st, sb)), m.fctm, 'MPa', '[practice: uncracked]', 'Service tension');
      c.h1('ULS bending');
      const MEd = L1.w * L * L / 8;
      c.q('Design moment', 'M_Ed', 'w_Ed L²/8', MEd, 'kNm/m');
      const dp = h / 2 + +i.e, ds = h - i.cnom - i.db / 2;
      const Ap = i.Ap * nt, As = EC.barA(i.db) * 1000 / i.sb;
      const spe = i.P0 * (1 - i.lt / 100) * 1e3 / i.Ap;
      const sp = i.bond === 'bond' ? 0.9 * i.fpk / 1.15 : Math.min(spe + 100, 0.9 * i.fpk / 1.15);
      c.q('Tendon stress at ULS', 'σ_p;ULS', i.bond === 'bond' ? 'f_p0.1k/γ_S ≈ 0.9 f_pk/1.15' : 'σ_pe + 100 MPa ≤ f_pd', sp, 'MPa', '5.10.8 [practice]');
      const Fp = Ap * sp, Fs = As * m.fyd, y = (Fp + Fs) / (m.fcd * 1000);
      const MRd = (Fp * (dp - y / 2) + Fs * (ds - y / 2)) / 1e6;
      c.v({ l: 'Moment resistance', s: 'M_Rd', f: 'A_p σ_p (d_p − y/2) + A_s f_yd (d_s − y/2)', n: `y = ${fmt(y)} mm`, v: MRd, u: 'kNm/m', key: true });
      c.c('ULS bending', 'M_Ed/M_Rd', MEd, MRd, 'kNm/m', '8.1', 'ULS bending');
      c.c('Ductility', 'x/d_p', y / 0.8 / dp, 0.45, '', '[practice]', 'Ductility x/d');
      c.h1('Deflection');
      const Ec = m.Ecm, I = 1000 * h ** 3 / 12;
      const wnet = L1.wqp - wbal;
      const dl = 5 * wnet * Math.pow(L * 1000, 4) / (384 * Ec * I) * (1 + +i.phi);
      c.q('Net quasi-permanent load', 'w_net', 'w_qp − w_bal', wnet, 'kPa');
      c.q('Long-term deflection (uncracked)', 'δ_LT', '5 w_net L⁴/(384 E_cm I) · (1 + φ)', dl, 'mm');
      c.c('Deflection', 'δ/(L/250)', Math.abs(dl), L * 1000 / 250, 'mm', '9.3', 'Deflection L/250');
      const pts = [], bal = [];
      for (let k = 0; k <= 30; k++) { const x = k / 30 * L; pts.push([x, -(h / 2 + i.e * 4 * x / L * (1 - x / L))]); bal.push([x, -h / 2]); }
      const svg = EC.plot({ title: 'Tendon profile (mm from top)', xl: 'x (m)', yl: 'depth (mm)', series: [{ name: 'tendon', pts, cls: 1 }, { name: 'centroid', pts: bal, dash: true }], legend: true });
      return c.result({ spec: [['Concrete', `${EC.concName(i.fck)}, stress at f_ck(t) ≥ ${i.fckt} MPa`], ['Tendons', `${i.Ap} mm² strands, ${i.P0} kN jacking @ ${i.st} mm, ${i.bond === 'bond' ? 'bonded' : 'unbonded'}`], ['Profile', `parabolic, drape ${i.e} mm`], ['Passive steel', `H${i.db} @ ${i.sb} bottom`], ['Balance', `w_bal = ${fmt(wbal)} kPa`]], bars: [], svg });
    }
  });

  /* ---------------- Staircase ---------------- */
  EC.modules.staircase = def({
    type: 'staircase', name: 'Staircase (waist slab)', cat: 'slabs', prefix: 'ST', icon: 'slab', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Staircase_Design',
    groups: [
      { t: 'Geometry', f: [F('g', 'Going g', 'mm', 280), F('r', 'Riser r', 'mm', 170), F('n', 'Risers in flight', 'no', 10), F('t', 'Waist thickness t', 'mm', 220), F('L1', 'Bottom landing (on plan)', 'm', 1.0), F('L2', 'Top landing (on plan)', 'm', 1.0), F('hl', 'Landing thickness', 'mm', 220)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 25), F('Dl', 'Aggregate D_lower', 'mm', 16)] },
      { t: 'Loads', f: [F('fin', 'Finishes', 'kPa', 1.5), F('qk', 'Imposed q_k', 'kPa', 4.0), F('gG', 'γ_G', '', 1.35), F('gQ', 'γ_Q', '', 1.5)] },
      { t: 'Reinforcement', f: [F('db', 'Main bottom ϕ', 'mm', 16, EC.barOpts), F('sb', 'Spacing', 'mm', 150), F('dd', 'Distribution ϕ', 'mm', 10, EC.barOpts), F('sd', 'Spacing', 'mm', 250)] }
    ],
    schedCols: [['geo', 'g / r / n'], ['t', 'Waist'], ['span', 'Span (m)'], ['main', 'Main'], ['dist', 'Dist.']],
    sched: (i, r) => ({ geo: `${i.g}/${i.r}/${i.n}`, t: i.t, span: r && r.L ? r.L.toFixed(2) : '', main: `H${i.db}@${i.sb}`, dist: `H${i.dd}@${i.sd}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk, i.Dl);
      c.text('Straight waist-slab flight with bottom and top landings spanning longitudinally (simply supported on plan): loads on plan, three-segment moment diagram, bending, shear, deflection, detailing per metre width.');
      mlines(c, m);
      c.h1('Geometry');
      const Lf = (i.n - 1) * i.g / 1000, L = +i.L1 + Lf + +i.L2, al = Math.atan(i.r / i.g);
      c.q('Flight length on plan', 'L_f', '(n − 1) g', Lf, 'm');
      c.q('Total span on plan', 'L', 'L_1 + L_f + L_2', L, 'm', '', true);
      c.q('Pitch', 'α', 'atan(r/g)', EC.deg(al), '°');
      c.ok({ l: 'Comfort rule', cond: 2 * i.r + +i.g >= 550 && 2 * i.r + +i.g <= 700, txt: `2r + g = ${2 * i.r + +i.g} mm (550 … 700)`, item: false });
      c.h1('Loads on plan');
      const gf = 25 * (i.t / 1000 / Math.cos(al) + i.r / 2000) + +i.fin, gl = 25 * i.hl / 1000 + +i.fin;
      c.q('Flight permanent', 'g_f', '25 (t/cosα + r/2) + finishes', gf, 'kPa');
      c.q('Landing permanent', 'g_l', '25 h_l + finishes', gl, 'kPa');
      const wf = i.gG * gf + i.gQ * i.qk, wl = i.gG * gl + i.gQ * i.qk;
      c.q('ULS flight / landing', 'w_f', 'γ_G g + γ_Q q', wf, 'kPa', '', true);
      c.q('', 'w_l', '', wl, 'kPa');
      const wx = x => (x < i.L1 || x > i.L1 + Lf) ? wl : wf;
      const N = 200; let tot = 0, mom = 0;
      for (let k = 0; k < N; k++) { const x = (k + 0.5) / N * L; tot += wx(x) * L / N; mom += wx(x) * x * L / N; }
      const RB = mom / L, RA = tot - RB;
      let Mmax = 0, V = 0; const pts = [];
      for (let k = 0; k <= N; k++) { const x = k / N * L; let Mx = RA * x; for (let j = 0; j < k; j++) { const xi = (j + 0.5) / N * L; Mx -= wx(xi) * (L / N) * (x - xi); } pts.push([x, Mx]); Mmax = Math.max(Mmax, Mx); }
      V = Math.max(RA, RB);
      c.q('Reactions', 'R_A', 'Σ w x', RA, 'kN/m'); c.q('', 'R_B', '', RB, 'kN/m');
      c.v({ l: 'Maximum moment', s: 'M_Ed', f: 'numerical, three segments', v: Mmax, u: 'kNm/m', key: true });
      c.h1('Bending and shear (waist)');
      const d = i.t - i.cnom - i.db / 2, As = EC.barA(i.db) * 1000 / i.sb;
      const b = EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mmax, b: 1000, d, As, m, barTxt: `H${i.db}@${i.sb}`, item: 'Bending' });
      c.c('Minimum steel', 'A_s;min', Math.max(0.26 * m.fctm / m.fyk * 1000 * d, 0.0013 * 1000 * d), As, 'mm²/m', '12.3', 'Minimum steel');
      const sh = EC.shearNoLinks(c, { V, b: 1000, d, As, m });
      c.c('Shear', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'Shear');
      c.h1('Deflection');
      EC.spanDepth(c, { m, L, d, b: 1000, AsReq: Math.max(b.AsReq, 1), AsProv: As, K: 1.0 });
      c.chk({ l: 'Distribution steel', s: 'A_s;dist', Ed: 0.2 * As, Rd: EC.barA(i.dd) * 1000 / i.sd, u: 'mm²/m', r: '12.3', item: 'Distribution steel' });
      const sc = 520 / L, x0 = 30, y0 = 60, hh = (i.n * i.r / 1000) * sc;
      const prof = [[x0, y0 + hh], [x0 + i.L1 * sc, y0 + hh]];
      for (let k = 0; k < i.n - 1; k++) { const x = x0 + (+i.L1 + k * i.g / 1000) * sc, y = y0 + hh - (k + 1) * i.r / 1000 * sc; prof.push([x, y], [x + i.g / 1000 * sc, y]); }
      prof.push([x0 + L * sc, y0]);
      const svg = EC.sketch(600, hh + 120, 'ELEVATION', [{ c: 'edge', l: prof }, { dh: [x0, x0 + L * sc, y0 + hh + 30, `L = ${fmt(L, 2)} m on plan`] }]) + EC.plot({ title: 'Bending moment', xl: 'x on plan (m)', yl: 'M (kNm/m)', series: [{ name: 'M_Ed', pts, fill: true }] });
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Flight', `${i.n} risers ${i.r} mm, goings ${i.g} mm, waist ${i.t} mm`], ['Main bars', `H${i.db} @ ${i.sb} bottom, continuous through kinks with laps`], ['Distribution', `H${i.dd} @ ${i.sd}`], ['Kinks', 'at re-entrant kinks cross the bars (do not bend round the inside corner)']], bars: [], svg, L });
    }
  });

  /* ---------------- Spiral / helical stair ---------------- */
  EC.modules.spiralstair = def({
    type: 'spiralstair', name: 'Spiral / Helical Stair', cat: 'slabs', prefix: 'HS', icon: 'slab', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\SpiralStair_Design',
    groups: [
      { t: 'Section at critical cut', f: [F('b', 'Waist width b', 'mm', 1400), F('h', 'Waist thickness h', 'mm', 220), F('R', 'Centre-line radius R', 'm', 1.6), F('cnom', 'Cover', 'mm', 30), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500)] },
      { t: 'FE section actions (ULS)', f: [F('M', 'Vertical bending M', 'kNm', 85), F('Tq', 'Torsion T', 'kNm', 40), F('V', 'Shear V', 'kN', 120), F('N', 'Axial N (tension +)', 'kN', 60)] },
      { t: 'Reinforcement', f: [F('nb', 'Bottom bars n', 'no', 10), F('db', 'Bottom ϕ', 'mm', 16, EC.barOpts), F('nt', 'Top bars n', 'no', 8), F('dt', 'Top ϕ', 'mm', 12, EC.barOpts), F('dw', 'Closed link ϕ', 'mm', 12, EC.barOpts), F('sw', 'Link spacing', 'mm', 125)] }
    ],
    schedCols: [['sec', 'b × h'], ['R', 'R (m)'], ['bars', 'Bottom/top'], ['links', 'Links']],
    sched: i => ({ sec: `${i.b}×${i.h}`, R: i.R, bars: `${i.nb}H${i.db} / ${i.nt}H${i.dt}`, links: `H${i.dw}@${i.sw}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b, h = +i.h;
      c.text('Free-standing spiral / helical stair waist slab checked at the critical section with actions from a 3D FE model: torsion-shear strut interaction, closed links, flexure with axial tension and torsional longitudinal steel, radial bursting thrust of curved bars.');
      mlines(c, m);
      c.h1('Torsion and shear');
      const A = b * h, u = 2 * (b + h), cl = +i.cnom + +i.dw + i.db / 2, tef = Math.max(A / u, 2 * cl);
      const Ak = (b - tef) * (h - tef), uk = 2 * (b + h - 2 * tef), d = h - cl, z = 0.9 * d, cot = 1.5;
      c.q('Effective wall / area', 't_ef', 'A/u ≥ 2 a', tef, 'mm'); c.q('', 'A_k', '', Ak, 'mm²');
      const nu = 0.6 * nuP(m), sn = Math.sin(Math.atan(1 / cot)), cs = Math.cos(Math.atan(1 / cot));
      const TRd = 2 * nu * m.fcd * Ak * tef * sn * cs / 1e6, VRd = b * z * nu * m.fcd / (cot + 1 / cot) / 1e3;
      c.c('Strut interaction', 'T/T_Rd;max + V/V_Rd;max', i.Tq / TRd + i.V / VRd, 1, '', '8.3.3', 'Torsion-shear interaction');
      const need = i.Tq * 1e6 / (2 * Ak * m.fyd * cot) + i.V * 1e3 / (z * m.fyd * cot) / (b > 600 ? 4 : 2);
      c.c('Closed links per leg', 'A_sw/s', need, EC.barA(i.dw) / i.sw, 'mm²/mm', '8.3.4', 'Closed links');
      c.h1('Flexure + axial tension + torsion steel');
      const Asl = i.Tq * 1e6 * uk * cot / (2 * Ak * m.fyd);
      const Asb = EC.AsReq(i.M, b, d, m) + Math.max(0, +i.N) * 1e3 / (2 * m.fyd) + Asl * (b - tef) / uk;
      const Ab = i.nb * EC.barA(i.db);
      c.q('Torsion longitudinal steel', 'ΣA_sl', 'T u_k cotθ/(2 A_k f_yd)', Asl, 'mm²');
      c.c('Bottom steel', 'A_s;req', Asb, Ab, 'mm²', '8.1 + 8.3', 'Bottom steel (M + N + T)', 'A_s;M + N/(2 f_yd) + A_sl share');
      c.c('Top steel', 'A_s;top', Math.max(0, +i.N) * 1e3 / (2 * m.fyd) + Asl * (b - tef) / uk, i.nt * EC.barA(i.dt), 'mm²', '8.3', 'Top steel (N + T)');
      c.h1('Bursting of curved bars');
      const Fs = Math.min(Asb, Ab) * m.fyd / 1e3, q = Fs / i.R;
      c.q('Bar force', 'F_s', 'A_s;req f_yd', Fs, 'kN');
      c.note('Thrust acts in the plane of the waist; it is taken by the two transverse legs of every closed link.');
      c.q('Radial thrust', 'q_burst', 'F_s/R', q, 'kN/m', '[practice]', true);
      c.c('Links resisting thrust', 'q/(2 A_sw f_yd/s)', q, 2 * EC.barA(i.dw) * m.fyd / i.sw, 'kN/m', '[practice]', 'Radial bursting');
      c.note('Check SLS stresses and crack width under quasi-permanent load with the Mathcad SpiralStair worksheet.');
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Waist', `${b} × ${h} mm, R = ${i.R} m`], ['Longitudinal', `${i.nb}H${i.db} bottom, ${i.nt}H${i.dt} top, curved to the helix`], ['Links', `closed H${i.dw} @ ${i.sw}, 135° hooks`]], bars: [], svg: '' });
    }
  });
})();
