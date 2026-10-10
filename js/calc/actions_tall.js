/* EC1 actions 2: tall buildings (dynamic wind, drift, across-wind & torsion, combinations, outrigger, thermal, shortening), vortex shedding, circular water tank */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt, W = EC.wind;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}), icon: 'wind', cat: 'actions' }, o);
  const windIn = () => [F('vb0', 'Basic wind speed v_b,0', 'm/s', 30), F('cat', 'Terrain category', '', 'IV', EC.TERRAIN), F('co', 'Orography c_o', '', 1.0)];
  const cf0 = db => EC.interp([0.1, 0.2, 0.7, 1, 2, 5, 10], [2.0, 2.1, 2.4, 2.1, 1.65, 1.0, 0.9], db);

  /* Annex B procedure 1: structural factor */
  function cscd(o, c) {
    const { h, b, n1, delta, vb, cat, co } = o;
    const T0 = EC.TERRAIN.find(t => t.v === String(cat)) || EC.TERRAIN[2];
    const zs = 0.6 * h, w = W.qp(zs, vb, cat, co);
    const alpha = 0.67 + 0.05 * Math.log(T0.z0), Lz = 300 * Math.pow(Math.max(zs, T0.zmin) / 200, alpha);
    const fL = n1 * Lz / w.vm, SL = 6.8 * fL / Math.pow(1 + 10.2 * fL, 5 / 3);
    const B2 = 1 / (1 + 0.9 * Math.pow((b + h) / Lz, 0.63));
    const Rf = eta => eta <= 0 ? 1 : 1 / eta - 1 / (2 * eta * eta) * (1 - Math.exp(-2 * eta));
    const Rh = Rf(4.6 * h / Lz * fL), Rb = Rf(4.6 * b / Lz * fL);
    const R2 = Math.PI ** 2 / (2 * delta) * SL * Rh * Rb;
    const nu = Math.max(n1 * Math.sqrt(R2 / (B2 + R2)), 0.08);
    const kp = Math.max(Math.sqrt(2 * Math.log(nu * 600)) + 0.6 / Math.sqrt(2 * Math.log(nu * 600)), 3);
    const cs = (1 + 7 * w.Iv * Math.sqrt(B2)) / (1 + 7 * w.Iv), cd = (1 + 2 * kp * w.Iv * Math.sqrt(B2 + R2)) / (1 + 7 * w.Iv * Math.sqrt(B2));
    if (c) {
      c.q('Reference height', 'z_s', '0.6 h', zs, 'm'); c.q('Turbulent length scale', 'L(z_s)', '300 (z_s/200)^α,  α = 0.67 + 0.05 ln z_0', Lz, 'm', 'B.1');
      c.q('Non-dimensional frequency', 'f_L', 'n_1 L/v_m', fL, ''); c.q('Spectral density', 'S_L', '6.8 f_L/(1 + 10.2 f_L)^(5/3)', SL, '', '(B.2)');
      c.q('Background factor', 'B²', '1/(1 + 0.9((b + h)/L)^0.63)', B2, '', '(B.3)'); c.q('Resonance factor', 'R²', 'π²/(2δ) S_L R_h R_b', R2, '', '(B.6)');
      c.q('Up-crossing frequency', 'ν', 'n_1 √(R²/(B² + R²)) ≥ 0.08', nu, 'Hz'); c.q('Peak factor', 'k_p', '√(2 ln νT) + 0.6/√(2 ln νT) ≥ 3', kp, '', '(B.4)');
      c.v({ l: 'Structural factor', s: 'c_s c_d', f: '(1 + 2 k_p I_v √(B² + R²))/(1 + 7 I_v)', v: cs * cd, u: '', key: true, r: '6.3.1' });
    }
    return { cs, cd, cscd: cs * cd, B2, R2, kp, zs, w, Lz, nu };
  }
  /* storey program: forces, shear, moment */
  function storeys(o) {
    const { h, b, nst, vb, cat, co, cf, cscd: k } = o;
    const hs = h / nst, out = []; let V = 0, M = 0;
    for (let j = nst; j >= 1; j--) {
      const z = j * hs, ze = h <= b ? h : z > h - b ? h : z < b ? b : z;
      const q = W.qp(ze, vb, cat, co).qp, Fj = k * cf * q * b * (j === nst ? hs / 2 : hs);
      out.unshift({ j, z, q, F: Fj });
    }
    out.forEach(s => { V += s.F; M += s.F * s.z; });
    let Vc = V; out.forEach(s => { s.V = Vc; Vc -= s.F; });
    out.forEach((s, k) => { s.M = out.slice(k).reduce((a, t) => a + t.F * (t.z - (s.z - hs)), 0); });
    return { st: out, V, M, hs };
  }

  /* ---------------- Tall building - dynamic wind ---------------- */
  EC.modules.windtall = def({
    type: 'windtall', name: 'Tall Building Wind (dynamic)', prefix: 'WT', code: 'EN 1991-1-4:2024', mathcad: 'EC1_Actions\\Wind_TallBuilding_Design', lib: ['EC1_Actions\\TallBuilding_Design'],
    groups: [
      { t: 'Building', f: [F('h', 'Height h', 'm', 150), F('b', 'Width b (crosswind)', 'm', 40), F('d', 'Depth d', 'm', 30), F('nst', 'Storeys', 'no', 40), F('n1', 'First frequency n_1 (0 = 46/h)', 'Hz', 0), F('delta', 'Log. decrement δ (structural + aero)', '', 0.10), F('mass', 'Mass per unit height', 't/m', 600), F('psir', 'Corner factor ψ_r', '', 1.0), F('psil', 'End-effect ψ_λ', '', 0.7)] },
      { t: 'Wind', f: windIn().concat([F('Tr', 'Return period for comfort', 'years', 1), F('alim', 'Acceleration limit', 'm/s²', 0.15)]) }
    ],
    schedCols: [['geo', 'h × b × d'], ['cscd', 'c_s c_d'], ['V', 'V_b (MN)'], ['a', 'a_peak (m/s²)']],
    sched: (i, r) => ({ geo: `${i.h}×${i.b}×${i.d}`, cscd: r && r.k ? r.k.toFixed(3) : '', V: r && r.V ? (r.V / 1000).toFixed(1) : '', a: r && r.a ? r.a.toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc(), h = +i.h, b = +i.b, d = +i.d;
      const n1 = +i.n1 > 0 ? +i.n1 : 46 / h, vb = +i.vb0;
      c.text('Tall rectangular building, along-wind dynamic response (EN 1991-1-4:2024 Annex B procedure 1): q_p(z) with tall-building reference heights, force coefficient c_f = c_f,0 ψ_r ψ_λ, structural factor c_s c_d, equivalent static storey forces, base shear and overturning moment, peak top-floor acceleration for a reduced return period, vortex-shedding screening.');
      c.h1('Dynamic properties');
      c.q('Fundamental frequency', 'n_1', +i.n1 > 0 ? 'typed' : '46/h (Annex F)', n1, 'Hz', 'F.2');
      c.q('Logarithmic decrement', 'δ', 'δ_s + δ_a', +i.delta, '');
      c.h1('Force coefficient');
      const cf = cf0(d / b) * i.psir * i.psil;
      c.v({ l: 'Force coefficient', s: 'c_f', f: 'c_f,0(d/b) ψ_r ψ_λ', n: `c_f,0 = ${fmt(cf0(d / b), 2)} [verify Fig. 7.23]`, v: cf, u: '', r: '7.6' });
      c.h1('Structural factor (Annex B)');
      const K = cscd({ h, b, n1, delta: +i.delta, vb, cat: i.cat, co: +i.co }, c);
      c.h1('Storey forces');
      const P = storeys({ h, b, nst: Math.round(i.nst), vb, cat: i.cat, co: +i.co, cf, cscd: K.cscd });
      const show = P.st.filter((s, k) => k % Math.max(1, Math.round(P.st.length / 12)) === 0 || k === P.st.length - 1);
      c.tbl(['storey', 'z (m)', 'q_p (kPa)', 'F (kN)', 'V (kN)', 'M (MNm)'], show.map(s => [s.j, s.z, s.q, s.F, s.V, s.M / 1000]), [0, 1, 3, 0, 0, 1]);
      c.v({ l: 'Base shear', s: 'V_b', v: P.V, u: 'kN', key: true }); c.v({ l: 'Overturning moment', s: 'M_b', v: P.M / 1000, u: 'MNm', key: true });
      c.h1('Comfort - peak acceleration');
      const p = 1 / i.Tr, cp = Math.sqrt((1 - 0.2 * Math.log(-Math.log(1 - Math.min(p, 0.99)))) / (1 - 0.2 * Math.log(-Math.log(0.98))));
      const vbT = vb * cp;
      const Kt = cscd({ h, b, n1, delta: +i.delta, vb: vbT, cat: i.cat, co: +i.co });
      const wz = W.qp(Kt.zs, vbT, i.cat, +i.co);
      const sig = cf * 1.25 * b * wz.Iv * wz.vm ** 2 * Math.sqrt(Kt.R2) * 1.5 / (i.mass * 1000) ;
      const a = Kt.kp * sig;
      c.q('Probability factor', 'c_prob', `T = ${i.Tr} yr`, cp, ''); c.q('Standard deviation of acceleration', 'σ_a,x', 'c_f ρ b I_v v_m² R K_z/(m)', sig, 'm/s²', 'B.4');
      c.v({ l: 'Peak acceleration at top', s: 'a_peak', f: 'k_p σ_a', v: a, u: 'm/s²', key: true });
      c.c('Occupant comfort', 'a/a_lim', a, +i.alim, 'm/s²', 'ISO 10137 / project', 'Peak acceleration');
      c.h1('Vortex shedding screen');
      const vcrit = b * n1 / 0.12, vm = W.qp(h, vb, i.cat, +i.co).vm;
      c.q('Critical velocity (St = 0.12)', 'v_crit', 'b n_1/St', vcrit, 'm/s');
      c.ok({ l: 'Vortex criterion', cond: vcrit > 1.25 * vm, txt: `v_crit = ${fmt(vcrit, 1)} ${vcrit > 1.25 * vm ? '>' : '≤'} 1.25 v_m(h) = ${fmt(1.25 * vm, 1)} m/s`, item: 'Vortex shedding screen', r: 'E.1.3.1' });
      const svg = EC.plot({ title: 'Storey shear', xl: 'V (kN)', yl: 'z (m)', series: [{ name: 'V', pts: P.st.map(s => [s.V, s.z]) }] }) + EC.plot({ title: 'Overturning moment', xl: 'M (MNm)', yl: 'z (m)', series: [{ name: 'M', pts: P.st.map(s => [s.M / 1000, s.z]), cls: 1 }] });
      return c.result({ spec: [['Building', `${h} × ${b} × ${d} m, n_1 = ${fmt(n1, 3)} Hz`], ['Wind', `c_s c_d = ${fmt(K.cscd, 3)}, c_f = ${fmt(cf, 2)}`], ['Base', `V = ${fmt(P.V, 0)} kN, M = ${fmt(P.M / 1000, 0)} MNm`], ['Comfort', `a = ${fmt(a, 3)} m/s² (T = ${i.Tr} yr)`]], bars: [], svg, k: K.cscd, V: P.V, a });
    }
  });

  /* ---------------- Wind drift ---------------- */
  EC.modules.winddrift = def({
    type: 'winddrift', name: 'Tall Building Wind Drift', prefix: 'WD', code: 'EN 1991-1-4:2024 / EN 1990', mathcad: 'EC1_Actions\\Wind_Drift_Design',
    groups: [
      { t: 'Building & core', f: [F('h', 'Height', 'm', 120), F('b', 'Width b', 'm', 36), F('d', 'Depth d', 'm', 30), F('nst', 'Storeys', 'no', 32), F('EI', 'Core bending stiffness EI (cracked)', 'GNm²', 30000), F('GA', 'Shear stiffness GA', 'GN', 3000), F('cscd', 'c_s c_d (from dynamic module)', '', 0.95), F('P', 'Gravity load per storey (SLS)', 'kN', 18000)] },
      { t: 'Wind', f: windIn().concat([F('Tr', 'Return period for drift', 'years', 10), F('ktop', 'Top drift limit h/…', '', 500), F('kst', 'Storey drift limit h_st/…', '', 400)]) }
    ],
    schedCols: [['h', 'h'], ['u', 'u_top (mm)'], ['dr', 'max drift']],
    sched: (i, r) => ({ h: i.h, u: r && r.u ? r.u.toFixed(0) : '', dr: r && r.dr ? '1/' + Math.round(1 / r.dr) : '' }),
    calc(i) {
      const c = new EC.Calc(), h = +i.h, b = +i.b, n = Math.round(i.nst);
      c.text('SLS lateral drift of a tall building under wind: q_p(z) with c_prob for the drift return period, storey forces, core as a cantilever with bending and shear deformation, top deflection, inter-storey drift, Rayleigh frequency of the model and P-Δ stability index.');
      const p = 1 / i.Tr, cp = Math.sqrt((1 - 0.2 * Math.log(-Math.log(1 - Math.min(p, 0.99)))) / (1 - 0.2 * Math.log(-Math.log(0.98))));
      c.q('Probability factor', 'c_prob', `T = ${i.Tr} yr`, cp, '', '(4.2)');
      const cf = cf0(i.d / b) * 0.7;
      const P = storeys({ h, b, nst: n, vb: i.vb0 * cp, cat: i.cat, co: +i.co, cf, cscd: +i.cscd });
      c.q('Base shear (SLS)', 'V_b', '', P.V, 'kN');
      const EI = i.EI * 1e6, GA = i.GA * 1e6, hs = P.hs;
      const M = P.st.map(s => s.M - s.V * 0), V = P.st.map(s => s.V);
      let th = 0, u = 0, ub = 0, us = 0; const ul = [0];
      for (let k = 0; k < n; k++) { const Mk = P.st[k].M; th += Mk / EI * hs; ub += th * hs; us += V[k] / GA * hs; ul.push(ub + us); }
      u = ul[n];
      c.v({ l: 'Top deflection', s: 'u_top', f: 'bending ∫∫ M/EI + shear ∫ V/GA', v: u * 1000, u: 'mm', key: true });
      c.c('Top drift', 'u/(h/' + i.ktop + ')', u, h / i.ktop, 'm', '[NDP]', 'Top deflection');
      let dr = 0; ul.forEach((x, k) => { if (k) dr = Math.max(dr, (x - ul[k - 1]) / hs); });
      c.q('Maximum inter-storey drift ratio', 'Δ/h_st', '', dr, '', '', true);
      c.c('Inter-storey drift', 'ratio/limit', dr, 1 / i.kst, '', '[NDP]', 'Inter-storey drift');
      const sm = P.st.reduce((a, s, k) => a + s.F * ul[k + 1], 0), sm2 = P.st.reduce((a, s, k) => a + (i.P / 9.81) * ul[k + 1] ** 2, 0);
      const n1 = Math.sqrt(sm / sm2) / (2 * Math.PI);
      c.v({ l: 'Rayleigh frequency of the model', s: 'n_1', f: '(1/2π) √(Σ F u/Σ m u²)', v: n1, u: 'Hz' });
      const thet = n * i.P * dr / (P.V);
      c.q('Stability index (P-Δ)', 'θ', 'P_tot Δ/(V h)', thet, '');
      c.ok({ l: 'Second order effects', cond: thet <= 0.1, txt: thet <= 0.1 ? 'θ ≤ 0.1: ignore' : `θ > 0.1: amplify by 1/(1 − θ) = ${fmt(1 / (1 - thet), 3)}`, item: 'P-Δ stability index', U: thet / 0.1 });
      const svg = EC.plot({ title: 'Deflected shape', xl: 'u (mm)', yl: 'z (m)', series: [{ name: 'u', pts: ul.map((x, k) => [x * 1000, k * hs]) }] }) + EC.plot({ title: 'Drift ratio', xl: 'Δ/h (×10⁻³)', yl: 'z (m)', series: [{ name: 'drift', pts: ul.slice(1).map((x, k) => [(x - ul[k]) / hs * 1000, (k + 1) * hs]), cls: 1 }] });
      return c.result({ spec: [['Drift', `u_top = ${fmt(u * 1000, 0)} mm (h/${fmt(h / u, 0)}), max storey drift 1/${fmt(1 / dr, 0)}`], ['Model', `EI = ${i.EI} GNm², GA = ${i.GA} GN, n_1 = ${fmt(n1, 3)} Hz`]], bars: [], svg, u: u * 1000, dr });
    }
  });

  /* ---------------- Across-wind & torsion ---------------- */
  EC.modules.windacross = def({
    type: 'windacross', name: 'Across-wind & Torsion (tall)', prefix: 'WX', code: 'EN 1991-1-4:2024 / NBCC (informative)', mathcad: 'EC1_Actions\\Wind_AcrossTorsion_Design',
    groups: [
      { t: 'Building', f: [F('h', 'Height', 'm', 150), F('b', 'Width b', 'm', 40), F('d', 'Depth d', 'm', 30), F('nst', 'Storeys', 'no', 40), F('ny', 'Across-wind frequency', 'Hz', 0.28), F('nt', 'Torsional frequency', 'Hz', 0.40), F('beta', 'Damping ratio β', '', 0.015), F('rho', 'Building density ρ_B', 'kg/m³', 200), F('GJ', 'Torsional stiffness GJ', 'GNm²', 6000)] },
      { t: 'Wind', f: windIn().concat([F('cscd', 'c_s c_d', '', 0.95), F('Tr', 'Comfort return period', 'years', 1), F('alim', 'Acceleration limit', 'm/s²', 0.15)]) }
    ],
    schedCols: [['h', 'h'], ['ay', 'a_y'], ['T', 'Base torque (MNm)']],
    sched: (i, r) => ({ h: i.h, ay: r && r.ay ? r.ay.toFixed(3) : '', T: r && r.T ? (r.T / 1000).toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), h = +i.h, b = +i.b, d = +i.d, n = Math.round(i.nst);
      c.text('Tall building across-wind and torsion: vortex-shedding (St by d/b) and galloping screening (Annex E), informative NBCC empirical across-wind peak acceleration, wind torsion from e = 0.1 b with a storey program, twist and corner deflection, torsional-lateral frequency separation.');
      c.h1('Aeroelastic screening');
      const St = EC.interp([1, 1.5, 2, 3], [0.12, 0.10, 0.08, 0.06], d / b);
      const vm = W.qp(h, +i.vb0, i.cat, +i.co).vm, vcrit = b * i.ny / St;
      c.q('Strouhal number', 'St', 'Fig. E.1 by d/b', St, '');
      c.c('Vortex shedding', '1.25 v_m/v_crit', 1.25 * vm, vcrit, 'm/s', 'E.1.3.1', 'Vortex screen');
      const aG = 1.2, mass = i.rho * b * d, Sc = 2 * i.beta * 2 * Math.PI * mass / (1.25 * b * b), vCG = 2 * Sc / aG * i.ny * b;
      c.c('Galloping', '1.25 v_m/v_CG', 1.25 * vm, vCG, 'm/s', 'E.2.3', 'Galloping screen');
      c.h1('Across-wind acceleration (NBCC, informative)');
      const p = 1 / i.Tr, cp = Math.sqrt((1 - 0.2 * Math.log(-Math.log(1 - Math.min(p, 0.99)))) / (1 - 0.2 * Math.log(-Math.log(0.98))));
      const VH = W.qp(h, +i.vb0 * cp, i.cat, +i.co).vm;
      const ar = 78.5e-3 * Math.pow(VH / (i.ny * Math.sqrt(b * d)), 3.3);
      const gp = Math.sqrt(2 * Math.log(i.ny * 3600)) + 0.577 / Math.sqrt(2 * Math.log(i.ny * 3600));
      const ay = i.ny ** 2 * gp * Math.sqrt(b * d) * ar / (i.rho * 9.81 * Math.sqrt(i.beta));
      c.q('Mean wind at top (comfort T)', 'V_H', '', VH, 'm/s');
      c.v({ l: 'Across-wind peak acceleration', s: 'a_y', f: 'n² g_p √(WD) a_r/(ρ_B g √β),  a_r = 78.5·10⁻³ [V_H/(n √(WD))]^3.3', v: ay, u: 'm/s²', key: true, r: 'NBCC Commentary I [informative]' });
      c.c('Comfort (across-wind)', 'a_y/a_lim', ay, +i.alim, 'm/s²', '', 'Across-wind acceleration');
      c.h1('Torsion (e = 0.1 b)');
      const P = storeys({ h, b, nst: n, vb: +i.vb0, cat: i.cat, co: +i.co, cf: cf0(d / b) * 0.7, cscd: +i.cscd });
      const e = 0.1 * b, Tb = P.st.reduce((a, s) => a + s.F * e, 0);
      let tw = 0; const twl = [0];
      P.st.forEach((s, k) => { const Tk = P.st.slice(k).reduce((a, t) => a + t.F * e, 0); tw += Tk / (i.GJ * 1e6) * P.hs; twl.push(tw); });
      c.v({ l: 'Base torque', s: 'T_b', f: 'Σ F_j e', v: Tb, u: 'kNm', key: true });
      c.q('Twist at top', 'φ_top', 'Σ T Δh/GJ', tw * 1000, 'mrad');
      c.q('Corner displacement from twist', 'u_φ', 'φ · √(b² + d²)/2', tw * Math.hypot(b, d) / 2 * 1000, 'mm');
      const sep = Math.abs(i.nt - i.ny) / Math.min(i.nt, i.ny);
      c.ok({ l: 'Frequency separation', cond: sep >= 0.2, txt: `|n_T − n_y|/n = ${fmt(sep, 2)} (≥ 0.2 avoids coupled response)`, item: 'Torsional-lateral separation', r: '[practice]' });
      const svg = EC.plot({ title: 'Twist over height', xl: 'φ (mrad)', yl: 'z (m)', series: [{ name: 'φ', pts: twl.map((x, k) => [x * 1000, k * P.hs]) }] });
      return c.result({ spec: [['Across-wind', `a_y = ${fmt(ay, 3)} m/s²`], ['Torsion', `T_b = ${fmt(Tb / 1000, 0)} MNm, φ_top = ${fmt(tw * 1000, 2)} mrad`]], bars: [], svg, ay, T: Tb });
    }
  });

  /* ---------------- Wind combinations at core base ---------------- */
  EC.modules.windcomb = def({
    type: 'windcomb', name: 'Tall Building Load Combinations', prefix: 'WK', code: 'EN 1990:2023 / EN 1991-1-4:2024', mathcad: 'EC1_Actions\\Wind_Combinations_TallBuilding_Design',
    groups: [
      { t: 'Characteristic base actions', f: [F('G', 'Permanent N_G', 'MN', 650), F('Q', 'Imposed N_Q', 'MN', 180), F('Wx', 'Wind M_x (wind along y)', 'MNm', 900), F('Wy', 'Wind M_y (wind along x)', 'MNm', 1100), F('Tz', 'Wind torsion', 'MNm', 90)] },
      { t: 'Core', f: [F('MRd', 'Core moment resistance M_Rd (at N_G)', 'MNm', 4200), F('Bx', 'Core / raft width for EQU', 'm', 30), F('psi0Q', 'ψ_0 imposed', '', 0.7), F('psi0W', 'ψ_0 wind', '', 0.6)] }
    ],
    schedCols: [['M', 'M_Ed,max (MNm)'], ['comb', 'Governing']],
    sched: (i, r) => ({ M: r && r.M ? r.M.toFixed(0) : '', comb: r && r.comb }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Core base actions of a tall building: wind cases in ±x and ±y with combined x + y cases (0.7 rule, practice), ULS combinations 6.10 with imposed leading and wind leading, permanent favourable, SLS characteristic and frequent, envelope against the core M_Rd (biaxial circle) and EQU overturning.');
      const cases = [['+x', 0, 1], ['+y', 1, 0], ['x + 0.7y', 0.7, 1], ['0.7x + y', 1, 0.7]];
      const combs = [['ULS Q leading', 1.35, 1.5, 1.5 * i.psi0W], ['ULS W leading', 1.35, 1.5 * i.psi0Q, 1.5], ['ULS G favourable, W', 1.0, 0, 1.5], ['SLS characteristic', 1.0, 1.0, 1.0 * i.psi0W], ['SLS W leading', 1.0, i.psi0Q, 1.0]];
      const rows = []; let best = { U: 0 };
      combs.forEach(([nm, gG, gQ, gW]) => cases.forEach(([cs, fx, fy]) => {
        const N = gG * i.G + gQ * i.Q, Mx = gW * fx * i.Wx, My = gW * fy * i.Wy, M = Math.hypot(Mx, My);
        const U = nm.startsWith('ULS') ? M / i.MRd : 0;
        rows.push([nm, cs, N, Mx, My, M]);
        if (U > best.U) best = { U, nm, cs, M, N };
      }));
      c.h1('Combinations');
      c.tbl(['Combination', 'wind case', 'N (MN)', 'M_x (MNm)', 'M_y (MNm)', '|M| (MNm)'], rows, [0, 0, 0, 0, 0, 0]);
      c.v({ l: 'Governing ULS resultant moment', s: 'M_Ed', n: `${best.nm}, ${best.cs}`, v: best.M, u: 'MNm', key: true });
      c.c('Core bending (biaxial circle)', 'M_Ed/M_Rd', best.M, +i.MRd, 'MNm', 'EN 1992-1-1', 'Core bending');
      c.h1('EQU overturning');
      const Mst = 0.9 * i.G * i.Bx / 2, Mdst = 1.5 * Math.max(i.Wx, i.Wy);
      c.c('Overturning', 'M_dst/M_stb', Mdst, Mst, 'MNm', 'EN 1990 EQU', 'EQU overturning');
      c.q('Torsion (W leading)', 'T_Ed', '1.5 T_k', 1.5 * i.Tz, 'MNm');
      const pts = rows.filter(r => r[0].startsWith('ULS')).map(r => ({ x: r[3], y: r[4], t: '' }));
      const circ = []; for (let a = 0; a <= 90; a += 5) circ.push([i.MRd * Math.cos(EC.rad(a)), i.MRd * Math.sin(EC.rad(a))]);
      const svg = EC.plot({ title: 'M_x–M_y scatter vs M_Rd', xl: 'M_x (MNm)', yl: 'M_y (MNm)', series: [{ name: 'M_Rd', pts: circ }], points: pts });
      return c.result({ spec: [['Governing', `${best.nm}, ${best.cs}: M_Ed = ${fmt(best.M, 0)} MNm`]], bars: [], svg, M: best.M, comb: best.nm });
    }
  });

  /* ---------------- Outrigger ---------------- */
  EC.modules.outrigger = def({
    type: 'outrigger', name: 'Core + Outrigger System', prefix: 'OR', code: 'EN 1991-1-4:2024 / Smith & Coull', mathcad: 'EC1_Actions\\Outrigger_TallBuilding_Design',
    groups: [
      { t: 'Structure', f: [F('H', 'Height H', 'm', 180), F('EI', 'Core EI', 'GNm²', 8000), F('dcol', 'Column distance between outrigger tips d', 'm', 30), F('Ac', 'Perimeter column area', 'm²', 1.6), F('Ec', 'Column modulus', 'GPa', 34), F('EIo', 'Outrigger arm EI_o', 'GNm²', 400), F('x', 'Outrigger level from top x', 'm', 80)] },
      { t: 'Loads', f: [F('Mw', 'Wind base moment (characteristic)', 'MNm', 1600), F('dsh', 'Differential shortening at lock-in', 'mm', 15), F('NRd', 'Column N_Rd', 'MN', 75), F('NG', 'Column gravity N_G + N_Q (ULS)', 'MN', 38)] }
    ],
    schedCols: [['x', 'Level from top'], ['red', 'Drift reduction']],
    sched: (i, r) => ({ x: i.x, red: r && r.red ? (r.red * 100).toFixed(0) + ' %' : '' }),
    calc(i) {
      const c = new EC.Calc(), H = +i.H, EI = i.EI * 1e6, d = +i.dcol, EA = i.Ac * i.Ec * 1e6, EIo = i.EIo * 1e6;
      c.text('Core with one outrigger level under the wind base moment (uniform load w = 2 M/H²): rotation compatibility (Smith & Coull) with core, column axial and outrigger arm flexibility, restraining moment, column couple force, top deflection and base moment with and without the outrigger, best outrigger level, construction lock-in force.');
      const w = 2 * i.Mw * 1000 / H ** 2;
      c.q('Equivalent uniform wind load', 'w', '2 M_w/H²', w, 'kN/m');
      const Mo = x => (w * (H ** 3 - x ** 3) / (6 * EI)) / ((1 / EI + 2 / (d * d * EA)) * (H - x) + d / (12 * EIo));
      const ytop = x => w * H ** 4 / (8 * EI) - Mo(x) * (H * H - x * x) / (2 * EI);
      const x = +i.x, M = Mo(x);
      c.h1('Outrigger action');
      c.v({ l: 'Outrigger restraining moment', s: 'M_o', f: 'w(H³ − x³)/(6EI) ÷ [(1/EI + 2/(d² E A_c))(H − x) + d/(12 E I_o)]', v: M / 1000, u: 'MNm', key: true });
      const Fc = M / d;
      c.q('Column couple force', 'F_c', 'M_o/d', Fc / 1000, 'MN');
      const y0 = w * H ** 4 / (8 * EI), y1 = ytop(x);
      c.q('Top deflection without / with outrigger', 'y_0', 'w H⁴/(8EI)', y0 * 1000, 'mm'); c.q('', 'y_1', 'y_0 − M_o (H² − x²)/(2EI)', y1 * 1000, 'mm', '', true);
      const red = 1 - y1 / y0;
      c.q('Reduction', 'Δy/y_0', '', red, '');
      c.q('Core base moment with outrigger', 'M_base', 'M_w − M_o', i.Mw - M / 1000, 'MNm');
      let best = { x: 0, y: Infinity }; const pts = [];
      for (let xx = 0; xx <= H * 0.95; xx += H / 40) { const yy = ytop(xx); pts.push([xx, yy * 1000]); if (yy < best.y) best = { x: xx, y: yy }; }
      c.q('Optimum level (from top)', 'x_opt', 'min y_top', best.x, 'm', '≈ 0.455 H', true);
      c.h1('Checks');
      const kO = 3 * EIo / Math.pow(d / 2, 3), Flock = i.dsh / 1000 * kO;
      c.q('Lock-in force from differential shortening', 'F_lock', 'δ_sh 3EI_o/(d/2)³', Flock / 1000, 'MN');
      c.c('Perimeter column', '(N_G + 1.5 F_c + F_lock)/N_Rd', +i.NG + 1.5 * Fc / 1000 + Flock / 1000, +i.NRd, 'MN', '', 'Perimeter column');
      const svg = EC.plot({ title: 'Top deflection vs outrigger level', xl: 'x from top (m)', yl: 'y_top (mm)', series: [{ name: 'y_top', pts }], points: [{ x, y: y1 * 1000, t: 'design' }] });
      return c.result({ spec: [['Outrigger', `at ${x} m from top (optimum ≈ ${fmt(best.x, 0)} m)`], ['Effect', `top deflection −${fmt(red * 100, 0)} %, F_c = ${fmt(Fc / 1000, 1)} MN`], ['Lock-in', 'delay final outrigger connection until most shortening has occurred']], bars: [], svg, red });
    }
  });

  /* ---------------- Thermal tall building (perimeter column) ---------------- */
  EC.modules.thermaltall = def({
    type: 'thermaltall', name: 'Thermal Movement - Exposed Columns', prefix: 'TT', code: 'prEN 1991-1-5:2023', mathcad: 'EC1_Actions\\Thermal_TallBuilding_Design',
    groups: [
      { t: 'Building', f: [F('n', 'Storeys', 'no', 30), F('hs', 'Storey height', 'm', 3.6), F('Ac', 'Exposed column area', 'm²', 0.36), F('Ec', 'Concrete E', 'GPa', 33), F('Lb', 'Beam span column → core', 'm', 9), F('Ib', 'Beam I (cracked)', '×10⁻³ m⁴', 6), F('nb', 'Beams framing in', 'no', 1)] },
      { t: 'Temperatures', f: [F('Tsum', 'Exposed column summer temperature', '°C', 45), F('Twin', 'Exposed column winter temperature', '°C', 18), F('Tin', 'Internal column temperature', '°C', 24), F('Tinst', 'Installation temperature', '°C', 28), F('alpha', 'α', '×10⁻⁶/°C', 10)] },
      { t: 'Limits', f: [F('MRd', 'Beam end M_Rd spare capacity', 'kNm', 300), F('tilt', 'Floor tilt limit 1/…', '', 300)] }
    ],
    schedCols: [['n', 'Storeys'], ['d', 'δ_top (mm)'], ['M', 'M_beam (kNm)']],
    sched: (i, r) => ({ n: i.n, d: r && r.dtop ? r.dtop.toFixed(1) : '', M: r && r.M ? Math.round(r.M) : '' }),
    calc(i) {
      const c = new EC.Calc(), n = Math.round(i.n), hs = +i.hs, a = i.alpha * 1e-6;
      c.text('Differential vertical movement between an exposed perimeter column and the internal structure: summer / winter column temperature changes, cumulative free movement, elastic chain with floor-beam restraint at every level solved exactly, beam end moments and restraint axial forces, floor tilt.');
      const dTs = i.Tsum - i.Tinst - (i.Tin - i.Tinst), dTw = i.Twin - i.Tinst - (i.Tin - i.Tinst);
      c.q('Summer differential ΔT', 'ΔT_s', '(T_col − T_inst) − (T_in − T_inst)', dTs, '°C'); c.q('Winter differential ΔT', 'ΔT_w', '', dTw, '°C');
      const solve = dT => {
        const EA = i.Ac * i.Ec * 1e6, kc = EA / hs, kb = i.nb * 12 * i.Ec * 1e6 * i.Ib * 1e-3 / i.Lb ** 3, e0 = a * dT * hs;
        const N = n, A = Array.from({ length: N }, () => new Float64Array(N)), f = new Float64Array(N);
        for (let j = 0; j < N; j++) { A[j][j] += kb + kc; f[j] += kc * e0; if (j > 0) { A[j][j - 1] -= kc; } if (j < N - 1) { A[j][j] += kc; A[j][j + 1] -= kc; f[j] -= kc * e0; } }
        for (let p = 0; p < N; p++) for (let r = p + 1; r < Math.min(N, p + 2); r++) { const q = A[r][p] / A[p][p]; for (let s = p; s < Math.min(N, p + 3); s++) A[r][s] -= q * A[p][s]; f[r] -= q * f[p]; }
        const u = new Float64Array(N); for (let r = N - 1; r >= 0; r--) { let s = f[r]; if (r < N - 1) s -= A[r][r + 1] * u[r + 1]; u[r] = s / A[r][r]; }
        return { u: Array.from(u), kb, kc };
      };
      c.h1('Movements');
      const S = solve(dTs), Wn = solve(dTw);
      const free = n * a * dTs * hs * 1000;
      c.q('Free cumulative movement at top (summer)', 'δ_free', 'n α ΔT h_s', free, 'mm');
      const dmax = Math.max(...S.u.map(Math.abs), ...Wn.u.map(Math.abs)) * 1000;
      c.v({ l: 'Restrained differential movement (max level)', s: 'δ_max', f: 'elastic chain with beam springs 12EI/L³', v: dmax, u: 'mm', key: true });
      const M = 6 * i.Ec * 1e6 * i.Ib * 1e-3 * dmax / 1000 / i.Lb ** 2;
      c.v({ l: 'Beam end moment', s: 'M_b', f: '6 E I δ/L²', v: M, u: 'kNm', key: true });
      c.c('Beam spare capacity', 'M_b/M_Rd;spare', M, +i.MRd, 'kNm', '', 'Beam restraint moment');
      c.c('Floor tilt', 'δ/L', dmax / 1000 / i.Lb, 1 / i.tilt, '', '[practice]', 'Floor tilt');
      const Nr = Math.max(...S.u.map((x, k) => Math.abs(S.kb * x))) * n / 2;
      c.q('Restraint axial force in the column (approx.)', 'N_r', 'Σ beam shears', Nr, 'kN');
      const svg = EC.plot({ title: 'Differential movement vs level', xl: 'δ (mm)', yl: 'level', series: [{ name: 'summer', pts: S.u.map((x, k) => [x * 1000, k + 1]) }, { name: 'winter', pts: Wn.u.map((x, k) => [x * 1000, k + 1]), cls: 1 }], legend: true });
      return c.result({ spec: [['Column', `A = ${i.Ac} m², ${n} storeys`], ['Movement', `max ${fmt(dmax, 1)} mm, beam moment ${fmt(M, 0)} kNm`], ['Detailing', 'insulate exposed columns or allow for movement in facades and partitions']], bars: [], svg, dtop: dmax, M });
    }
  });

  /* ---------------- Column shortening ---------------- */
  EC.modules.shortening = def({
    type: 'shortening', name: 'Column / Core Shortening', prefix: 'CS', code: 'EN 1992-1-1 Annex B / prEN 1991-1-1', mathcad: 'EC1_Actions\\Shortening_TallBuilding_Design',
    groups: [
      { t: 'Building', f: [F('n', 'Storeys', 'no', 40), F('hs', 'Storey height', 'm', 3.5), F('cyc', 'Construction cycle per floor', 'days', 7), F('occ', 'Occupation after top-out', 'days', 180), F('tend', 'Final age', 'days', 10000)] },
      { t: 'Column', f: [F('Acol', 'Column area', 'm²', 0.64), F('Pc', 'Load per floor on column (G)', 'kN', 650), F('Qc', 'Imposed per floor (ψ_2 q)', 'kN', 60), F('rc', 'Column reinforcement ratio', '%', 2.0)] },
      { t: 'Core', f: [F('Acore', 'Core wall area', 'm²', 14), F('Pk', 'Load per floor on core (G)', 'kN', 9000), F('Qk', 'Imposed per floor (ψ_2 q)', 'kN', 800), F('rk', 'Core reinforcement ratio', '%', 0.6), F('fck', 'Concrete', '', 50, EC.CONC), F('RH', 'RH', '%', 70)] }
    ],
    schedCols: [['n', 'Storeys'], ['d', 'Max differential (mm)']],
    sched: (i, r) => ({ n: i.n, d: r && r.dmax ? r.dmax.toFixed(1) : '' }),
    calc(i) {
      const c = new EC.Calc(), n = Math.round(i.n), hs = i.hs * 1000, m = EC.mat(i.fck, 500);
      c.text('Elastic, creep and shrinkage shortening of a perimeter column and the core of a tall building, following the construction sequence (EN 1992-1-1 Annex B 2004 form for φ and ε_cs), reinforcement restraint, shortening after casting of each level, column–core differential and compensation by pre-set lengths.');
      const tcast = j => (j - 1) * i.cyc;
      const tocc = n * i.cyc + +i.occ;
      const Ecm = m.Ecm;
      const short = (A, P, Q, rho, h0) => {
        const Es = 200000, ar = 1 + Es / Ecm * rho / 100;
        const seg = k => {
          const out = t => {
            let e = 0;
            for (let j = k; j <= n; j++) { const tl = tcast(j) + i.cyc; if (tl <= t) { const age = Math.max(tl - tcast(k), 1); const ph = t - tl > 0 ? EC.creep.phi(m.fcm, +i.RH, h0, age, t - tcast(k)).phi : 0; e += P * 1000 / (A * 1e6 * Ecm * ar) * (1 + ph); } }
            if (t >= tocc) { const age = tocc - tcast(k); const ph = EC.creep.phi(m.fcm, +i.RH, h0, age, t - tcast(k)).phi; e += (n - k + 1) * Q * 1000 / (A * 1e6 * Ecm * ar) * (1 + ph); }
            const sh = t > tcast(k) + 7 ? EC.creep.shrink(+i.fck, +i.RH, h0, 7, t - tcast(k), 'N').ecs / ar : 0;
            return e + sh;
          };
          return out;
        };
        const segs = Array.from({ length: n }, (_, k) => seg(k + 1));
        const lvl = j => { let s = 0; for (let k = 1; k <= j; k++) s += (segs[k - 1](+i.tend) - segs[k - 1](tcast(j))) * hs; return s; };
        return Array.from({ length: n }, (_, j) => lvl(j + 1));
      };
      const sc = short(+i.Acol, +i.Pc, +i.Qc, +i.rc, 2 * i.Acol * 1e6 / (4 * Math.sqrt(i.Acol) * 1000));
      const sk = short(+i.Acore, +i.Pk, +i.Qk, +i.rk, 2 * 300);
      const diff = sc.map((x, k) => x - sk[k]);
      c.h1('Shortening after casting of each level (to final age)');
      const show = sc.map((x, k) => [k + 1, x, sk[k], diff[k], Math.round(diff[k] / 5) * 5]).filter((r, k) => k % Math.max(1, Math.round(n / 12)) === 0 || k === n - 1);
      c.tbl(['level', 'column (mm)', 'core (mm)', 'differential (mm)', 'pre-set (mm)'], show, [0, 1, 1, 1, 0]);
      const dmax = Math.max(...diff.map(Math.abs));
      c.v({ l: 'Maximum column–core differential', s: 'Δ_max', v: dmax, u: 'mm', key: true });
      c.note(`Without compensation the slab tilt over a 9 m span would be ${fmt(dmax, 1)} mm (1/${fmt(9000 / Math.max(dmax, 0.1), 0)}).`);
      const resid = Math.max(...diff.map(x => Math.abs(x - Math.round(x / 5) * 5)));
      c.c('Residual differential after pre-set compensation', 'Δ_res/(L/500)', resid, 9000 / 500, 'mm', '[practice]', 'Residual tilt after compensation');
      c.note('Compensate by casting each level high by the rounded pre-set value shown (column relative to core).');
      const svg = EC.plot({ title: 'Shortening after casting vs level', xl: 'shortening (mm)', yl: 'level', series: [{ name: 'column', pts: sc.map((x, k) => [x, k + 1]) }, { name: 'core', pts: sk.map((x, k) => [x, k + 1]), cls: 1 }, { name: 'differential', pts: diff.map((x, k) => [x, k + 1]), cls: 2, dash: true }], legend: true });
      return c.result({ spec: [['Building', `${n} storeys @ ${i.hs} m, cycle ${i.cyc} days`], ['Differential', `max ${fmt(dmax, 1)} mm`], ['Compensation', 'pre-set columns per table; survey and adjust every 5 floors']], bars: [], svg, dmax });
    }
  });

  /* ---------------- Vortex shedding of a steel chimney ---------------- */
  EC.modules.vortex = def({
    type: 'vortex', name: 'Chimney / Pole - Vortex Shedding', prefix: 'VS', code: 'EN 1991-1-4:2024 Annex E', mathcad: 'EC1_Actions\\Vortex_Shedding_Design',
    groups: [
      { t: 'Chimney', f: [F('h', 'Height', 'm', 30), F('D', 'Outer diameter', 'm', 2.0), F('t', 'Wall thickness', 'mm', 12), F('madd', 'Added mass (lining, platforms)', 'kg/m', 150), F('ds', 'Log. decrement δ_s (0.012 welded; damper ↑)', '', 0.04), F('k', 'Surface roughness k', 'mm', 0.1)] },
      { t: 'Wind & fatigue', f: windIn().concat([F('fy', 'Steel f_y', 'MPa', 355), F('dsC', 'Fatigue detail Δσ_C', 'MPa', 71)]) }
    ],
    schedCols: [['geo', 'h × D'], ['vcrit', 'v_crit'], ['y', 'y_F,max (mm)']],
    sched: (i, r) => ({ geo: `${i.h} × ${i.D}`, vcrit: r && r.vcrit ? r.vcrit.toFixed(1) : '', y: r && r.y ? r.y.toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), h = +i.h, D = +i.D, t = i.t / 1000;
      c.text('Free-standing circular steel chimney / pole: section and first frequency (Annex F), q_p(z), Reynolds-dependent force coefficient, along-wind base moment, and vortex-induced vibration by approach 1 (Annex E.1.5.2): v_crit, Scruton number, c_lat, iterated correlation length, peak tip deflection, inertia base moment, load cycles and fatigue stress range.');
      c.h1('Section and frequency');
      const A = Math.PI * D * t, I = Math.PI * D ** 3 * t / 8, Wel = 2 * I / D;
      const ms = A * 7850, me = ms + +i.madd;
      const n1 = 1000 * D / (h * h) * Math.sqrt(ms / me);
      c.q('Steel mass per m', 'm_s', 'π D t ρ', ms, 'kg/m'); c.q('Equivalent mass', 'm_e', 'm_s + added', me, 'kg/m');
      c.v({ l: 'First natural frequency', s: 'n_1', f: 'ε_1 b/h_eff² √(W_s/W_t),  ε_1 = 1000', v: n1, u: 'Hz', r: 'F.2 (F.3)', key: true });
      c.h1('Along-wind');
      const w = W.qpLines(c, h, +i.vb0, i.cat, +i.co);
      const Re = D * w.vm / 15e-6;
      const cf0 = Math.max(0.6, 1.2 + 0.18 * Math.log10(10 * i.k / 1000 / D) / (1 + 0.4 * Math.log10(Math.max(Re, 1e5) / 1e6)));
      const lam = Math.min(70, 2 * h / D), psil = EC.interp([1, 10, 70], [0.6, 0.7, 0.92], lam);
      c.q('Reynolds number', 'Re', 'b v(z)/ν', Re, ''); c.q('Basic force coefficient', 'c_f,0', '(7.19)', cf0, ''); c.q('End effect', 'ψ_λ', `λ = ${fmt(lam, 0)}`, psil, '');
      let Mw = 0; for (let z = 0.5; z < h; z += 1) Mw += cf0 * psil * W.qp(z, +i.vb0, i.cat, +i.co).qp * D * 1 * z;
      c.v({ l: 'Along-wind base moment', s: 'M_w', f: 'Σ c_f q_p(z) b Δz z', v: Mw, u: 'kNm', key: true });
      c.c('Along-wind stress', '1.5 M/(W f_y)', 1.5 * Mw * 1e3 / Wel / 1e6, +i.fy, 'MPa', 'EN 1993-3-2', 'Along-wind bending');
      c.h1('Vortex shedding (approach 1)');
      const St = 0.18, vcrit = D * n1 / St;
      c.q('Critical velocity', 'v_crit', 'b n_1/St,  St = 0.18', vcrit, 'm/s', '(E.2)', true);
      const Sc = 2 * i.ds * me / (1.25 * D * D);
      c.q('Scruton number', 'Sc', '2 δ_s m_e/(ρ b²)', Sc, '', '(E.4)');
      const Rec = D * vcrit / 15e-6, clat = Rec <= 3e5 ? 0.7 : Rec <= 5e5 ? 0.7 - 0.5 * (Rec - 3e5) / 2e5 : Rec <= 5e6 ? 0.2 + 0.1 * Math.log10(Rec / 5e5) : 0.3;
      c.q('Lateral force coefficient', 'c_lat', 'Table E.2 by Re(v_crit)', clat, '');
      let LjB = 6, y = 0;
      for (let it = 0; it < 10; it++) { const lr = LjB / (h / D); const Kw = Math.min(0.6, 3 * lr * (1 - lr + lr * lr / 3)); y = D / (St * St) / Sc * 0.13 * Kw * clat; const yb = y / D; LjB = yb < 0.1 ? 6 : yb < 0.6 ? 4.8 + 12 * yb : 12; }
      c.v({ l: 'Peak cross-wind tip deflection', s: 'y_F;max', f: '(1/St²)(1/Sc) K K_w c_lat b,  K = 0.13', v: y * 1000, u: 'mm', key: true, r: '(E.7)' });
      const vm = w.vm;
      const relevant = vcrit < 1.25 * vm;
      c.ok({ l: 'Relevance', cond: true, txt: relevant ? `v_crit = ${fmt(vcrit, 1)} < 1.25 v_m = ${fmt(1.25 * vm, 1)} m/s: vortex shedding must be considered` : 'v_crit > 1.25 v_m: vortex shedding need not be considered', item: false });
      let Mv = 0; for (let z = 0.5; z < h; z += 1) { const ph = Math.pow(z / h, 2); Mv += me * Math.pow(2 * Math.PI * n1, 2) * ph * y * z / 1000; }
      c.v({ l: 'Inertia base moment', s: 'M_v', f: 'Σ m (2π n_1)² Φ(z) y_F z', v: Mv, u: 'kNm', key: true });
      c.c('Vortex bending stress', 'M_v/(W f_y)', Mv * 1e3 / Wel / 1e6, +i.fy, 'MPa', '', 'Vortex bending');
      const v0 = 0.2 * vm, Ncy = 2 * 50 * 3.154e7 * n1 * 0.3 * (vcrit / v0) ** 2 * Math.exp(-((vcrit / v0) ** 2));
      const dsig = 2 * Mv * 1e3 / Wel / 1e6, NR = 2e6 * Math.pow(i.dsC / Math.max(dsig * 1.0 * 1.35, 1e-3), 3);
      c.q('Number of load cycles (50 yr)', 'N', '2 T n ε_0 (v_crit/v_0)² exp(−(v_crit/v_0)²)', Ncy, '', '(E.10)');
      c.q('Stress range', 'Δσ', '2 M_v/W', dsig, 'MPa');
      if (relevant) c.c('Fatigue (EN 1993-1-9, γ_Mf = 1.35)', 'N/N_R', Ncy, NR, '', 'EN 1993-1-9', 'Fatigue');
      const pts = []; for (let z = 0; z <= h; z += h / 20) pts.push([y * 1000 * (z / h) ** 2, z]);
      const svg = EC.plot({ title: 'Cross-wind deflected shape', xl: 'y (mm)', yl: 'z (m)', series: [{ name: 'y(z)', pts }] });
      return c.result({ spec: [['Chimney', `${h} m × ϕ${D} m × ${i.t} mm`], ['Vortex', `v_crit = ${fmt(vcrit, 1)} m/s, y = ${fmt(y * 1000, 0)} mm`], ['Mitigation', relevant ? 'helical strakes on the top third or tuned mass damper if needed' : 'none']], bars: [], svg, vcrit, y: y * 1000 });
    }
  });

  /* ---------------- Circular water tank ---------------- */
  EC.modules.watertank = def({
    type: 'watertank', name: 'Circular Water Tank Wall', prefix: 'CT', icon: 'drop', code: 'prEN 1991-4:2023 / EN 1992-3', mathcad: 'EC1_Actions\\WaterTank_Design',
    groups: [
      { t: 'Tank', f: [F('R', 'Radius (to wall centre)', 'm', 10), F('H', 'Liquid depth', 'm', 6), F('t', 'Wall thickness', 'mm', 300), F('base', 'Base connection', '', 'fixed', [{ v: 'fixed', l: 'Fixed' }, { v: 'hinged', l: 'Hinged' }, { v: 'sliding', l: 'Sliding' }]), F('gF', 'γ_F (liquid)', '', 1.2)] },
      { t: 'Concrete & steel', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('c', 'Cover to bar axis', 'mm', 50), F('dh', 'Hoop bars ϕ (each face)', 'mm', 16, EC.barOpts), F('sh', 'Hoop spacing', 'mm', 100), F('dv', 'Vertical inner ϕ', 'mm', 16, EC.barOpts), F('sv', 'Vertical spacing', 'mm', 150)] }
    ],
    schedCols: [['geo', 'R × H'], ['t', 't'], ['hoop', 'Hoop EF'], ['N', 'N_θ,max (kN/m)']],
    sched: (i, r) => ({ geo: `${i.R} × ${i.H}`, t: i.t, hoop: `H${i.dh}@${i.sh}`, N: r && r.N ? Math.round(r.N) : '' }),
    calc(i) {
      const c = new EC.Calc(), R = +i.R, H = +i.H, t = i.t / 1000, m = EC.mat(i.fck, i.fyk);
      c.text('Circular RC water tank wall as a cylindrical shell under hydrostatic pressure (prEN 1991-4:2023 Eq. 7.1): the vertical strip is solved as a beam on the elastic ring foundation k = E t/R² (exact long-wall solution), giving ring tension N_θ(x), vertical moment M_x(x) and base shear for a fixed, hinged or sliding base; hoop steel, tightness crack width and vertical base steel.');
      const E = m.Ecm * 1000, beta = Math.pow(3 * (1 - 0.04), 0.25) / Math.sqrt(R * t);
      c.q('Shell parameter', 'β', '[3(1 − ν²)]^¼/√(R t)', beta, '1/m'); c.q('', 'βH', '', beta * H, '');
      const n = 60, EI = E * t ** 3 / 12 / (1 - 0.04), k = E * t / (R * R);
      const dist = Array.from({ length: n + 1 }, (_, j) => 10 * (H - j / n * H));
      const fixed = i.base === 'fixed' ? { 0: [1, 1] } : i.base === 'hinged' ? { 0: [1, 0] } : {};
      const S = EC.geo.beamSprings({ n, Lb: H, EI, kfun: () => k, dist, fixed });
      const Nth = S.w.map(w => E * t * w / R);
      const Nmax = Math.max(...Nth), Mb = S.M[0], Mmax = Math.max(...S.M.map(Math.abs));
      c.h1('Shell actions (SLS = full liquid)');
      c.v({ l: 'Maximum ring tension', s: 'N_θ;max', f: 'E t w/R', v: Nmax, u: 'kN/m', key: true });
      c.q('Free ring tension at base (reference)', 'γ H R', '', 10 * H * R, 'kN/m');
      c.v({ l: 'Base / maximum vertical moment', s: 'M_x', v: Mmax, u: 'kNm/m', key: true });
      c.h1('Hoop steel (ULS)');
      const Ah = 2 * EC.barA(i.dh) * 1000 / i.sh;
      c.c('Hoop tension', 'γ_F N_θ/(A_s f_yd)', i.gF * Nmax * 1e3 / m.fyd, Ah, 'mm²/m', 'EN 1992-1-1', 'Hoop steel');
      c.h1('Tightness (class 1)');
      const w = EC.crackW({ b: 1000, h: i.t, d: i.t - i.c, As: Ah, phi: +i.dh, c: i.c - i.dh / 2, N: Nmax, fck: +i.fck });
      const lim = EC.interp([0.2, 35], [0.2, 0.05], H / t);
      c.q('Steel stress (direct tension)', 'σ_s', 'N_θ/A_s', w.ss, 'MPa');
      c.v({ l: 'Crack width (direct tension)', s: 'w_k', v: w.wk, u: 'mm', key: true, r: 'EN 1992-1-1:2004 7.3.4' });
      c.c('Crack width', 'w_k/w_k1', w.wk, lim, 'mm', 'EN 1992-3 7.3.1', 'Crack width (hoop)');
      c.h1('Vertical steel at the base');
      if (Mmax > 0.5) EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: i.gF * Mmax, b: 1000, d: i.t - i.c, As: EC.barA(i.dv) * 1000 / i.sv, m, barTxt: `H${i.dv}@${i.sv}`, tag: 'v', item: 'Vertical base moment' });
      const svg = EC.plot({ title: 'Ring tension N_θ', xl: 'N_θ (kN/m)', yl: 'height (m)', series: [{ name: 'N_θ', pts: Nth.map((v, j) => [v, S.z[j]]) }] }) + EC.plot({ title: 'Vertical moment M_x', xl: 'M_x (kNm/m)', yl: 'height (m)', series: [{ name: 'M_x', pts: S.M.map((v, j) => [v, S.z[j]]), cls: 1 }] });
      return c.result({ spec: [['Tank', `R = ${R} m, liquid ${H} m, wall ${i.t} mm, ${i.base} base`], ['Hoop', `H${i.dh}@${i.sh} each face (N_θ,max ${fmt(Nmax, 0)} kN/m)`], ['Vertical', `H${i.dv}@${i.sv} inner face at base`], ['Tightness', 'class 1, waterstops at joints']], bars: [], svg, N: Nmax });
    }
  });
})();
