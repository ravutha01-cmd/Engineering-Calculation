/* EC7 geotechnical 2: piles (axial, driven, lateral, group settlement, downdrag, load test, soil springs), SPT correlations, liquefaction */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt, S = EC.soil, G = EC.geo, gw = EC.soil.gw;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}), icon: 'pilecap' }, o);
  const XI3 = n => EC.interp([1, 2, 3, 4, 5, 7, 10], [1.40, 1.35, 1.33, 1.31, 1.29, 1.27, 1.25], n);
  const RSETS = { 'DA1-1': { l: 'DA1-1 (A1 + R1)', gG: 1.35, gQ: 1.5, b: 1.25, s: 1.0, st: 1.25 }, 'DA1-2': { l: 'DA1-2 (A2 + R4)', gG: 1.0, gQ: 1.3, b: 1.6, s: 1.3, st: 1.6 }, DA2: { l: 'DA2 (A1 + R2)', gG: 1.35, gQ: 1.5, b: 1.1, s: 1.1, st: 1.15 } };

  /* soil layer table helper: rows [h, type, γ, γ_sat, c_u, φ'] */
  const layersFrom = rows => EC.rows(rows).map(r => ({ h: r[0], coh: r[1] >= 1, g: r[2], gs: r[3] || r[2], cu: r[4], phi: r[5] }));

  /* ---------------- Single pile axial ---------------- */
  EC.modules.pileaxial = def({
    type: 'pileaxial', name: 'Pile Axial Capacity', cat: 'geo', prefix: 'PA', code: 'EN 1997-1 / EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Pile_Design\\Axial',
    groups: [
      { t: 'Pile', f: [F('D', 'Diameter D', 'm', 0.9), F('L', 'Length L', 'm', 30), F('alpha', 'Adhesion factor α (clay)', '', 0.5), F('K', 'K/K_0 × K_0 (sand, bored)', '', 0.7), F('qslim', 'Shaft friction limit', 'kPa', 150), F('qblim', 'Base resistance limit', 'kPa', 10000)] },
      { t: 'Ground (top down)', f: [T('lay', 'Layers', ['h (m)', 'type (1 = clay)', 'γ', 'γ_sat', 'c_u', 'φ\''], [[4, 1, 18, 18, 30, 0], [10, 0, 18, 19, 0, 30], [6, 1, 19, 19, 120, 0], [15, 0, 19, 20, 0, 36]]), F('zw', 'Water table', 'm', 2), F('np', 'Number of ground profiles', 'no', 1)] },
      { t: 'Actions & factors', f: [F('Gk', 'Permanent G_k', 'kN', 2600), F('Qk', 'Variable Q_k', 'kN', 900), F('Tk', 'Tension (variable) T_k', 'kN', 0), F('set', 'Resistance set', '', 'DA2', Object.keys(RSETS).map(v => ({ v, l: RSETS[v].l }))), F('gRd', 'Model factor γ_Rd', '', 1.0)] }
    ],
    schedCols: [['pile', 'D × L'], ['Rc', 'R_c;d (kN)'], ['Fc', 'F_c;d (kN)']],
    sched: (i, r) => ({ pile: `${i.D} × ${i.L}`, Rc: r && r.Rcd ? Math.round(r.Rcd) : '', Fc: r && r.Fcd ? Math.round(r.Fcd) : '' }),
    calc(i) {
      const c = new EC.Calc(), D = +i.D, Lp = +i.L, LY = layersFrom(i.lay), f = RSETS[i.set];
      c.text('Single bored pile, ground-model method: α c_u shaft and N_c c_u base in clay, β σ\'_v shaft and N_q σ\'_v base in sand, correlation factor ξ for the number of profiles, partial resistance factors of the selected set, compression and uplift.');
      const cap = L => {
        const N = Math.max(10, Math.round(L * 4)); let Rs = 0; const prof = [];
        for (let k = 0; k < N; k++) {
          const z = (k + 0.5) / N * L, dz = L / N, Ly = G.layerAt(LY, z), sv = G.sigv(LY, +i.zw, z).s1;
          const qs = Math.min(Ly.coh ? i.alpha * Ly.cu : i.K * Math.tan(EC.rad(Ly.phi)) * sv, +i.qslim);
          Rs += qs * Math.PI * D * dz; prof.push([qs, -z]);
        }
        const Lb = G.layerAt(LY, L), svb = G.sigv(LY, +i.zw, L).s1;
        const Nq = 0.5 * S.Nq(Lb.phi || 0.01);
        const qb = Math.min(Lb.coh ? 9 * Lb.cu : Nq * svb, +i.qblim);
        const Rb = qb * Math.PI * D * D / 4;
        return { Rs, Rb, qb, Nq, prof, Lb };
      };
      const r = cap(Lp);
      c.h1('Calculated resistances');
      c.q('Shaft resistance', 'R_s;cal', 'Σ q_s π D Δz,  clay α c_u, sand K tanφ\' σ\'_v', r.Rs, 'kN');
      c.q('Base unit resistance', 'q_b', r.Lb.coh ? '9 c_u' : `N_q σ'_v,  N_q (bored) = 0.5 N_q(φ) = ${fmt(r.Nq, 1)}`, r.qb, 'kPa', '[practice]');
      c.q('Base resistance', 'R_b;cal', 'q_b π D²/4', r.Rb, 'kN');
      const xi = XI3(+i.np);
      c.q('Correlation factor', 'ξ_3', `${i.np} profile(s)`, xi, '', 'Table A.10 [NDP]');
      c.h1(`Compression - ${f.l}`);
      const Rcd = (r.Rb / xi / f.b + r.Rs / xi / f.s) / i.gRd;
      const Fcd = f.gG * i.Gk + f.gQ * i.Qk;
      c.v({ l: 'Design compressive resistance', s: 'R_c;d', f: '(R_b;k/γ_b + R_s;k/γ_s)/γ_Rd,  R_k = R_cal/ξ', v: Rcd, u: 'kN', key: true });
      c.q('Design action', 'F_c;d', 'γ_G G_k + γ_Q Q_k', Fcd, 'kN');
      c.c('Compression', 'F_c;d/R_c;d', Fcd, Rcd, 'kN', '7.6.2', 'Compression');
      if (+i.Tk > 0) {
        c.h1('Uplift');
        const Rtd = r.Rs / xi / f.st / i.gRd + 0.9 * 25 * Math.PI * D * D / 4 * Lp * 0.6;
        c.c('Tension', 'F_t;d/R_t;d', 1.5 * i.Tk - 1.0 * i.Gk * 0, Rtd, 'kN', '7.6.3', 'Uplift');
      }
      const caps = []; for (let L = 6; L <= Lp * 1.5; L += 1) { const q = cap(L); caps.push([L, (q.Rb / xi / f.b + q.Rs / xi / f.s) / i.gRd]); }
      const svg = EC.plot({ title: 'Design resistance vs pile length', xl: 'L (m)', yl: 'R_c;d (kN)', series: [{ name: 'R_c;d', pts: caps }, { name: 'F_c;d', pts: [[6, Fcd], [Lp * 1.5, Fcd]], cls: 1, dash: true }], legend: true }) + EC.plot({ title: 'Unit shaft friction', xl: 'q_s (kPa)', yl: 'depth (m)', series: [{ name: 'q_s', pts: r.prof, cls: 2 }] });
      return c.result({ spec: [['Pile', `bored ϕ${D * 1000} mm, L = ${Lp} m`], ['Resistance', `R_c,d = ${fmt(Rcd, 0)} kN (${f.l})`], ['Testing', 'integrity tests on all piles; preliminary load test recommended']], bars: [], svg, Rcd, Fcd });
    }
  });

  /* ---------------- Driven pile from SPT ---------------- */
  EC.modules.piledriven = def({
    type: 'piledriven', name: 'Driven Precast Pile (SPT)', cat: 'geo', prefix: 'PD', code: 'EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Pile_Design\\Driven',
    groups: [
      { t: 'Pile', f: [F('b', 'Square pile side', 'mm', 300), F('L', 'Embedded length', 'm', 18), F('fck', 'Concrete class', '', 40, EC.CONC), F('nb', 'Bars', 'no', 4), F('db', 'Bar ϕ', 'mm', 16, EC.barOpts)] },
      { t: 'SPT log', f: [T('spt', 'SPT (depth, N, type 1 = clay)', ['z (m)', 'N', 'type'], [[2, 4, 1], [4, 6, 1], [6, 10, 0], [8, 14, 0], [10, 18, 0], [12, 22, 0], [14, 27, 0], [16, 32, 0], [18, 40, 0], [20, 45, 0]]), F('ER', 'Hammer energy ratio ER', '%', 60), F('zw', 'Water table', 'm', 1.5)] },
      { t: 'Driving', f: [F('W', 'Hammer weight W', 'kN', 40), F('hd', 'Drop height h', 'm', 1.0), F('eh', 'Hammer efficiency η_h', '', 0.8), F('er', 'Coefficient of restitution', '', 0.4), F('cc', 'Temporary compression c', 'mm', 15), F('set', 'Final set s', 'mm/blow', 3)] },
      { t: 'Actions', f: [F('Gk', 'G_k', 'kN', 500), F('Qk', 'Q_k', 'kN', 200), F('xi', 'Correlation factor ξ', '', 1.4)] }
    ],
    schedCols: [['pile', 'Pile'], ['L', 'L (m)'], ['set', 'Set (mm)'], ['R', 'R_c;d']],
    sched: (i, r) => ({ pile: `${i.b}²`, L: i.L, set: i.set, R: r && r.Rcd ? Math.round(r.Rcd) : '' }),
    calc(i) {
      const c = new EC.Calc(), b = i.b / 1000, A = b * b, P = 4 * b, Lp = +i.L;
      const SP = EC.rows(i.spt).sort((x, y) => x[0] - y[0]);
      c.text('Driven precast RC pile from SPT blow counts: N_60, Meyerhof static capacity (sand / clay), EN 1997-3 resistance factors, dynamic capacity by Hiley and Danish formulae from the final set, required set, pile structural checks (axial, driving stress, lifting).');
      const N60 = z => { const N = EC.interp(SP.map(r => r[0]), SP.map(r => r[1]), z); return N * i.ER / 60; };
      const isClay = z => { const r = SP.reduce((a, q) => Math.abs(q[0] - z) < Math.abs(a[0] - z) ? q : a, SP[0]); return r[2] >= 1; };
      const stat = L => {
        let Rs = 0; const N = Math.round(L * 4), prof = [];
        for (let k = 0; k < N; k++) { const z = (k + 0.5) / N * L, n6 = N60(z); const qs = isClay(z) ? Math.min(EC.interp([25, 70], [1, 0.5], 5 * n6) * 5 * n6, 120) : Math.min(2 * n6, 100); Rs += qs * P * L / N; prof.push([qs, -z]); }
        const nb = N60(L);
        const qb = isClay(L) ? 9 * 5 * nb : Math.min(40 * nb * L / b, 400 * nb);
        return { Rs, Rb: qb * A, qb, prof };
      };
      const r = stat(Lp);
      c.h1('Static capacity (Meyerhof)');
      c.q('N_60 at the toe', 'N_60', 'N ER/60', N60(Lp), '');
      c.q('Shaft resistance', 'R_s', 'sand 2 N̄_60, clay α c_u (c_u = 5 N_60)', r.Rs, 'kN', 'Meyerhof (1976)');
      c.q('Base resistance', 'R_b', isClay(Lp) ? '9 c_u A' : '40 N_60 L/b ≤ 400 N_60', r.Rb, 'kN');
      const Rcd = (r.Rs + r.Rb) / i.xi / 1.1;
      const Fcd = 1.35 * i.Gk + 1.5 * i.Qk;
      c.v({ l: 'Design resistance', s: 'R_c;d', f: '(R_s + R_b)/(ξ γ_t),  γ_t = 1.1', v: Rcd, u: 'kN', key: true, r: 'EN 1997-3 DC1 [NDP]' });
      c.c('Compression', 'F_c;d/R_c;d', Fcd, Rcd, 'kN', '7.6.2', 'Static compression');
      c.h1('Dynamic formulae');
      const Wp = 25 * A * (Lp + 1), E = 9500 * Math.pow(+i.fck + 8, 1 / 3) * 1000;
      const eta = (+i.W + i.er ** 2 * Wp) / (+i.W + Wp);
      const Hiley = s => i.eh * i.W * i.hd * eta / ((s + i.cc / 2) / 1000);
      const s0 = Math.sqrt(2 * i.eh * i.W * i.hd * Lp / (A * E));
      const Danish = s => i.eh * i.W * i.hd / (s / 1000 + s0 / 2);
      const Rh = Hiley(+i.set), Rdn = Danish(+i.set);
      c.q('Hiley ultimate resistance', 'R_u;H', 'η_h W h η/(s + c/2),  η = (W + e² P)/(W + P)', Rh, 'kN');
      c.q('Danish ultimate resistance', 'R_u;D', 'η_h W h/(s + s_0/2)', Rdn, 'kN');
      const Rdyn = Math.min(Rh, Rdn) / 1.5 / 1.1;
      c.v({ l: 'Design resistance from driving', s: 'R_c;d;dyn', f: 'min(R_u)/(ξ_5 = 1.5 · γ_t)', v: Rdyn, u: 'kN', key: true, r: '[NDP]' });
      c.c('Compression (dynamic)', 'F_c;d/R_c;d', Fcd, Rdyn, 'kN', '7.6.2', 'Dynamic compression');
      const target = Fcd * 1.5 * 1.1;
      let sreq = 0.5; for (let s = 0.5; s < 50; s += 0.5) if (Hiley(s) >= target) sreq = s;
      c.v({ l: 'Required set (Hiley)', s: 's_req', v: sreq, u: 'mm/blow', key: true, n: `${fmt(250 / Math.max(sreq, 0.1), 0)} blows / 250 mm` });
      c.h1('Pile structure');
      const m = EC.mat(i.fck, 500), As = i.nb * EC.barA(i.db);
      const NRd = (m.fcd * (i.b * i.b) + As * m.fyd) / 1000;
      c.c('Axial capacity', 'F_c;d/N_Rd', Fcd, NRd, 'kN', 'EN 1992-1-1', 'Pile axial (structure)');
      c.c('Driving stress', 'R_u/A', Math.max(Rh, Rdn) / A / 1000, 0.8 * i.fck, 'MPa', '[practice 0.8 f_ck]', 'Driving stress');
      const wl = 25 * A * 1.5, Ml = 0.0214 * wl * Lp * Lp;
      const MRd = EC.MRdRect(As / 2, +i.b, i.b - 40 - i.db / 2, m);
      c.c('Lifting (2 points at 0.207 L, impact 1.5)', 'M/M_Rd', Ml, MRd, 'kNm', '[practice]', 'Lifting');
      const caps = []; for (let L = 6; L <= Math.max(...SP.map(q => q[0])); L += 1) { const q = stat(L); caps.push([L, (q.Rs + q.Rb) / i.xi / 1.1]); }
      const svg = EC.plot({ title: 'Static design resistance vs length', xl: 'L (m)', yl: 'R_c;d (kN)', series: [{ name: 'R_c;d', pts: caps }, { name: 'F_c;d', pts: [[6, Fcd], [caps.length ? caps[caps.length - 1][0] : 20, Fcd]], cls: 1, dash: true }], legend: true }) + EC.plot({ title: 'Hiley R_u vs set', xl: 'set (mm/blow)', yl: 'R_u (kN)', series: [{ name: 'R_u', pts: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(s => [s, Hiley(s)]), cls: 2 }] });
      return c.result({ spec: [['Pile', `${i.b} × ${i.b} mm precast, ${EC.concName(i.fck)}, ${i.nb}H${i.db}, L = ${Lp} m`], ['Driving', `${i.W} kN hammer, ${i.hd} m drop; final set ≤ ${fmt(sreq, 1)} mm/blow over last 10 blows`], ['Testing', 'PDA / CAPWAP on ≥ 5 % of piles']], bars: [], svg, Rcd });
    }
  });

  /* circular RC section M_Rd at N = 0 */
  function circMRd(D, cover, n, phi, m) {
    const R = D / 2, rs = R - cover - phi / 2, As1 = EC.barA(phi);
    const forces = x => {
      let N = 0, M = 0; const ns = 60;
      for (let k = 0; k < ns; k++) { const y = -R + (k + 0.5) * 2 * R / ns, w = 2 * Math.sqrt(Math.max(R * R - y * y, 0)); if (R - y <= 0.8 * x) { const dA = w * 2 * R / ns; N += m.fcd * dA; M += m.fcd * dA * y; } }
      for (let k = 0; k < n; k++) { const t = 2 * Math.PI * k / n, y = rs * Math.sin(t), yfromTop = R - y; const eps = 0.0035 * (x - yfromTop) / x; const sg = EC.clamp(m.Es * eps, -m.fyd, m.fyd); N += As1 * sg; M += As1 * sg * y; }
      return { N, M };
    };
    let lo = 1, hi = 2 * D; for (let k = 0; k < 60; k++) { const x = (lo + hi) / 2; if (forces(x).N > 0) hi = x; else lo = x; }
    return forces((lo + hi) / 2).M / 1e6;
  }

  /* ---------------- Lateral pile ---------------- */
  EC.modules.pilelateral = def({
    type: 'pilelateral', name: 'Pile Lateral (Broms + Winkler)', cat: 'geo', prefix: 'PL', code: 'EN 1997-3:2025 / EN 1992-1-1:2023', mathcad: 'EC7_Geotechnical\\Pile_Design\\Lateral',
    groups: [
      { t: 'Pile', f: [F('D', 'Diameter D', 'm', 0.8), F('L', 'Length L', 'm', 15), F('e', 'Load height above ground e', 'm', 0.0), F('head', 'Head', '', 'free', [{ v: 'free', l: 'Free head' }, { v: 'fixed', l: 'Fixed head (restrained by cap)' }]), F('fck', 'Concrete class', '', 30, EC.CONC), F('nb', 'Longitudinal bars', 'no', 12), F('db', 'Bar ϕ', 'mm', 20, EC.barOpts), F('cov', 'Cover', 'mm', 75)] },
      { t: 'Soil', f: [F('soil', 'Soil', '', 'clay', [{ v: 'clay', l: 'Cohesive (c_u)' }, { v: 'sand', l: 'Cohesionless (φ\')' }]), F('cu', 'c_u,k', 'kPa', 50), F('phi', 'φ\'_k', '°', 32), F('g', 'Effective γ\'', 'kN/m³', 9), F('nh', 'n_h (sand)', 'kN/m³', 6000)] },
      { t: 'Actions', f: [F('H', 'Design horizontal load H_Ed', 'kN', 150), F('Hs', 'SLS horizontal load', 'kN', 100), F('gR', 'γ_R;tr (RFA)', '', 1.4), F('ylim', 'Head deflection limit', 'mm', 15)] }
    ],
    schedCols: [['pile', 'D × L'], ['head', 'Head'], ['H', 'H_Ed'], ['y', 'y_SLS (mm)']],
    sched: (i, r) => ({ pile: `${i.D} × ${i.L}`, head: i.head, H: i.H, y: r && r.y ? r.y.toFixed(1) : '' }),
    calc(i) {
      const c = new EC.Calc(), D = +i.D, L = +i.L, e = +i.e, m = EC.mat(i.fck, 500), fixed = i.head === 'fixed';
      c.text('Single bored pile under horizontal load: Broms ultimate transverse resistance (short / long pile, free or fixed head) with M_y = M_Rd of the circular section, RFA verification, and a beam on Winkler springs for SLS head deflection and ULS bending moments.');
      c.h1('Pile section');
      const My = circMRd(D * 1000, +i.cov, +i.nb, +i.db, m);
      c.v({ l: 'Yield moment of the pile (N = 0)', s: 'M_y = M_Rd', f: 'circular section, stress block, strain compatibility', v: My, u: 'kNm', key: true, r: 'EN 1992-1-1 8.1' });
      c.h1('Broms ultimate resistance');
      const solve = fn => { let lo = 0, hi = 1e6; for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (fn(mid) > 0) hi = mid; else lo = mid; } return lo; };
      let Hs, Hl;
      if (i.soil === 'clay') {
        const cu = +i.cu, fH = H => H / (9 * cu * D);
        if (!fixed) {
          Hs = solve(H => H * (e + 1.5 * D + 0.5 * fH(H)) - 2.25 * D * cu * Math.max(L - 1.5 * D - fH(H), 0) ** 2);
          Hl = solve(H => H * (e + 1.5 * D + 0.5 * fH(H)) - My);
        } else { Hs = 9 * cu * D * (L - 1.5 * D); Hl = solve(H => H * (1.5 * D + 0.5 * fH(H)) - 2 * My); }
        c.q('Short-pile mechanism', 'H_u;s', fixed ? '9 c_u D (L − 1.5D)' : 'M_max = 2.25 D g² c_u', Hs, 'kN', 'Broms (1964a)');
        c.q('Long-pile mechanism', 'H_u;l', fixed ? 'H (1.5D + 0.5f) = 2 M_y' : 'H (e + 1.5D + 0.5f) = M_y', Hl, 'kN');
      } else {
        const Kp = S.Kp(+i.phi), g = +i.g, fH = H => 0.82 * Math.sqrt(H / (D * Kp * g));
        if (!fixed) { Hs = 0.5 * g * D * L ** 3 * Kp / (e + L); Hl = solve(H => H * (e + 0.67 * fH(H)) - My); }
        else { Hs = 1.5 * g * D * L * L * Kp; Hl = solve(H => H * 0.67 * fH(H) - 2 * My); }
        c.q('Short-pile mechanism', 'H_u;s', fixed ? '1.5 γ D L² K_p' : '0.5 γ D L³ K_p/(e + L)', Hs, 'kN', 'Broms (1964b)');
        c.q('Long-pile mechanism', 'H_u;l', 'from M_y', Hl, 'kN');
      }
      const Hu = Math.min(Hs, Hl);
      c.v({ l: 'Ultimate transverse resistance', s: 'H_u', f: 'min(short, long)', v: Hu, u: 'kN', key: true, n: Hs < Hl ? 'short pile governs' : 'long pile governs' });
      c.c('Transverse resistance (RFA)', 'H_Ed/(H_u/γ_R;tr)', +i.H, Hu / i.gR, 'kN', 'EN 1997-3 6 [NDP]', 'Transverse resistance');
      c.h1('Beam on Winkler springs');
      const EI = m.Ecm * 1000 * Math.PI * D ** 4 / 64 * 0.5;
      const kf = z => i.soil === 'clay' ? 67 * i.cu : i.nh * z;
      c.q('Cracked bending stiffness', 'EI', '0.5 E_cm π D⁴/64', EI, 'kNm²');
      c.q('Subgrade reaction × D', 'k_h D', i.soil === 'clay' ? '67 c_u (Davisson)' : 'n_h z', kf(1), 'kN/m² (at 1 m)');
      const run = H => G.beamSprings({ n: 60, Lb: L, EI, kfun: kf, loads: [{ node: 0, P: H, M: fixed ? 0 : H * e }], fixed: fixed ? { 0: [0, 1] } : {} });
      const Rs = run(+i.Hs), Ru = run(+i.H);
      const y = Rs.w[0] * 1000;
      c.v({ l: 'SLS head deflection', s: 'y_0', v: y, u: 'mm', key: true });
      c.c('Head deflection', 'y_0/y_lim', Math.abs(y), +i.ylim, 'mm', 'SLS [project]', 'Head deflection');
      const Mmax = Math.max(...Ru.M.map(Math.abs));
      c.v({ l: 'ULS maximum moment', s: 'M_Ed', v: Mmax, u: 'kNm', key: true });
      c.c('Pile bending', 'M_Ed/M_Rd', Mmax, My, 'kNm', 'EN 1992-1-1', 'Pile bending (Winkler)');
      const zc = Ru.z.find((z, k) => k > 5 && Math.abs(Ru.M[k]) < 0.05 * Mmax) || L;
      c.q('Curtailment depth (M < 5 % M_max)', 'z_c', '', zc, 'm');
      const svg = EC.plot({ title: 'Deflection (SLS)', xl: 'y (mm)', yl: 'depth (m)', series: [{ name: 'y', pts: Rs.z.map((z, k) => [Rs.w[k] * 1000, -z]) }] }) + EC.plot({ title: 'Bending moment (ULS)', xl: 'M (kNm)', yl: 'depth (m)', series: [{ name: 'M', pts: Ru.z.map((z, k) => [Ru.M[k], -z]), cls: 1 }] });
      return c.result({ spec: [['Pile', `ϕ${D * 1000} mm, L = ${L} m, ${i.nb}H${i.db}, ${fixed ? 'fixed' : 'free'} head`], ['Lateral', `H_u = ${fmt(Hu, 0)} kN, y_SLS = ${fmt(y, 1)} mm, M_Ed = ${fmt(Mmax, 0)} kNm`], ['Reinforcement', `full cage to ≥ ${fmt(zc + 1, 1)} m, then reduced`]], bars: [], svg, y });
    }
  });

  /* ---------------- Group settlement & springs ---------------- */
  EC.modules.pilegroup = def({
    type: 'pilegroup', name: 'Pile Group Settlement', cat: 'geo', prefix: 'PG', code: 'EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Pile_Design\\GroupSettlement', lib: ['EC7_Geotechnical\\Pile_Design\\Foundation'],
    groups: [
      { t: 'Group', f: [F('nx', 'Piles in x', 'no', 3), F('ny', 'Piles in y', 'no', 3), F('s', 'Spacing', 'm', 2.4), F('D', 'Pile diameter', 'm', 0.8), F('L', 'Pile length', 'm', 20), F('Ep', 'Pile modulus', 'GPa', 30)] },
      { t: 'Ground', f: [F('Es', 'Soil modulus along shaft (avg.)', 'MPa', 40), F('Eb', 'Soil modulus below toe', 'MPa', 80), F('nu', 'Poisson ν', '', 0.3), F('Hc', 'Compressible depth below toe', 'm', 15), F('omega', 'Group exponent ω', '', 0.5), F('cu', 'Average c_u for block failure (0 = skip)', 'kPa', 80)] },
      { t: 'Loads', f: [F('P', 'Total SLS load on group', 'kN', 18000), F('Pd', 'Total ULS load', 'kN', 25000), F('Rcd', 'Single pile R_c;d', 'kN', 3000), F('slim', 'Settlement limit', 'mm', 25)] }
    ],
    schedCols: [['grp', 'Group'], ['s', 's (mm)'], ['k', 'k per pile (MN/m)']],
    sched: (i, r) => ({ grp: `${i.nx}×${i.ny} ϕ${i.D}`, s: r && r.sg ? r.sg.toFixed(1) : '', k: r && r.k ? (r.k / 1000).toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), n = i.nx * i.ny, D = +i.D, L = +i.L, r0 = D / 2;
      c.text('Rectangular pile group under a rigid cap: single pile settlement (Randolph & Wroth, rigid pile), group settlement ratio R_s = n^ω, equivalent raft (Tomlinson) at 2L/3 with 1:4 spread and pile shortening, pile springs for ETABS / SAFE, ULS group / block failure.');
      c.h1('Single pile (Randolph & Wroth)');
      const Gs = i.Es * 1000 / (2 * (1 + +i.nu)), zeta = Math.log(2.5 * L * (1 - i.nu) / r0);
      const kp = Gs * r0 * (4 / (1 - i.nu) + 2 * Math.PI * L / (zeta * r0));
      c.q('Shear modulus', 'G', 'E_s/(2(1 + ν))', Gs, 'kPa'); c.q('', 'ζ', 'ln(2.5 L (1 − ν)/r_0)', zeta, '');
      c.v({ l: 'Single pile stiffness', s: 'k_1', f: 'G r_0 [4/(1 − ν) + 2π L/(ζ r_0)]', v: kp, u: 'kN/m', r: 'Randolph & Wroth (1978)' });
      const P1 = i.P / n, w1 = P1 / kp + P1 * L / (Math.PI * D * D / 4 * i.Ep * 1e6);
      c.q('Single pile settlement (+ shortening)', 'w_1', 'P/k_1 + P L/(A E_p)', w1 * 1000, 'mm');
      const Rsr = Math.pow(n, +i.omega), wg = Rsr * w1;
      c.q('Group settlement ratio', 'R_s', 'n^ω', Rsr, '');
      c.q('Group settlement (interaction)', 'w_g', 'R_s w_1', wg * 1000, 'mm');
      c.h1('Equivalent raft (Tomlinson)');
      const Bg = (i.nx - 1) * i.s + D, Lg = (i.ny - 1) * i.s + D, zr = 2 * L / 3;
      let sr = 0; const prof = [];
      for (let z = 0.5; z <= L / 3 + +i.Hc; z += 1) { const B1 = Bg + 2 * zr / 4 + z, L1 = Lg + 2 * zr / 4 + z; const ds = i.P / (B1 * L1); const E = z < L / 3 ? +i.Es : +i.Eb; sr += ds * 1 / (E * 1000); prof.push([ds, -(zr + z)]); }
      const sh = i.P / n * zr / (Math.PI * D * D / 4 * i.Ep * 1e6);
      c.q('Raft settlement (layers below 2L/3)', 's_raft', 'Σ Δσ Δz/E', sr * 1000, 'mm'); c.q('Pile shortening to 2L/3', 's_el', '', sh * 1000, 'mm');
      const se = sr + sh, sg = Math.max(se, wg) * 1000;
      c.v({ l: 'Governing group settlement', s: 's_g', f: 'max(equivalent raft, R_s w_1)', v: sg, u: 'mm', key: true });
      c.c('Settlement', 's_g/s_lim', sg, +i.slim, 'mm', 'SLS', 'Group settlement');
      const k = i.P / n / (sg / 1000);
      c.v({ l: 'Spring per pile for the structural model', s: 'k_pile', f: 'P/(n s_g)', v: k, u: 'kN/m', key: true });
      c.h1('ULS group capacity');
      c.c('Single piles', 'F_d/(n R_c;d)', +i.Pd, n * i.Rcd, 'kN', '7.6', 'Group of single piles');
      if (+i.cu > 0) {
        const Rbl = (2 * (Bg + Lg) * L * i.cu + 9 * i.cu * Bg * Lg) / 1.4 / 1.4;
        c.c('Block failure (clay)', 'F_d/R_block;d', +i.Pd, Rbl, 'kN', '7.6.2.1 [γ = 1.4 × model 1.4]', 'Block failure');
      }
      const it = []; const sc = 220 / Math.max(Bg, Lg); for (let a = 0; a < i.nx; a++) for (let b = 0; b < i.ny; b++) it.push({ c: 'pile', o: [60 + (D / 2 + a * i.s) * sc, 50 + (D / 2 + b * i.s) * sc, D / 2 * sc] });
      const svg = EC.sketch(340, Lg * sc + 90, 'GROUP PLAN', [{ c: 'conc', r: [60 - 10, 40, Bg * sc + 20, Lg * sc + 20] }].concat(it)) + EC.plot({ title: 'Equivalent raft Δσ', xl: 'Δσ (kPa)', yl: 'depth (m)', series: [{ name: 'Δσ', pts: prof }] });
      return c.result({ spec: [['Group', `${i.nx} × ${i.ny} piles ϕ${D * 1000} @ ${i.s} m, L = ${L} m`], ['Settlement', `${fmt(sg, 1)} mm`], ['Springs', `k = ${fmt(k / 1000, 0)} MN/m per pile`]], bars: [], svg, sg, k });
    }
  });

  /* ---------------- Downdrag ---------------- */
  EC.modules.downdrag = def({
    type: 'downdrag', name: 'Pile Downdrag (negative skin friction)', cat: 'geo', prefix: 'NS', code: 'EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Pile_Design\\Downdrag',
    groups: [
      { t: 'Pile', f: [F('D', 'Diameter', 'm', 0.8), F('L', 'Length', 'm', 30), F('Nt', 'Toe coefficient N_t', '', 30), F('fck', 'Concrete class', '', 35, EC.CONC)] },
      { t: 'Ground', f: [T('lay', 'Layers (β-method)', ['h (m)', 'γ', 'γ_sat', 'β'], [[3, 18, 19, 0.30], [12, 16, 16, 0.25], [20, 19, 20, 0.40]]), F('zw', 'Water table', 'm', 1.5), F('zs', 'Base of settling zone', 'm', 15), F('sg', 'Ground settlement at surface', 'mm', 150)] },
      { t: 'Loads', f: [F('Gk', 'Permanent load Q_G', 'kN', 1800), F('Qk', 'Variable load Q_Q', 'kN', 500), F('gb', 'γ_b (toe)', '', 1.25), F('gs', 'γ_s (shaft)', '', 1.25)] }
    ],
    schedCols: [['pile', 'D × L'], ['zn', 'z_n (m)'], ['Gn', 'G_neg (kN)']],
    sched: (i, r) => ({ pile: `${i.D} × ${i.L}`, zn: r && r.zn ? r.zn.toFixed(1) : '', Gn: r && r.Gn ? Math.round(r.Gn) : '' }),
    calc(i) {
      const c = new EC.Calc(), D = +i.D, L = +i.L;
      const LY = EC.rows(i.lay).map(r => ({ h: r[0], g: r[1], gs: r[2], beta: r[3] }));
      c.text('Negative skin friction on a single bored pile (Fellenius unified method): β-method shaft resistance, toe resistance, neutral plane from force equilibrium limited to the base of the settling zone, drag force as a permanent action, structural force at the neutral plane and GEO verification below the neutral plane.');
      const N = 120, dz = L / N, z = [], qs = [];
      for (let k = 0; k < N; k++) { const zz = (k + 0.5) * dz; const Ly = G.layerAt(LY, zz); qs.push(Ly.beta * G.sigv(LY, +i.zw, zz).s1 * Math.PI * D * dz); z.push(zz); }
      const Rt = i.Nt * G.sigv(LY, +i.zw, L).s1 * Math.PI * D * D / 4;
      const Rs = qs.reduce((a, b) => a + b, 0);
      c.h1('Resistances');
      c.q('Shaft resistance (unfactored)', 'R_s', 'Σ β σ\'_v π D Δz', Rs, 'kN'); c.q('Toe resistance', 'R_t', 'N_t σ\'_v,toe A_b', Rt, 'kN');
      const Q = +i.Gk;
      let zn = 0, best = Infinity;
      for (let k = 0; k <= N; k++) { const down = Q + qs.slice(0, k).reduce((a, b) => a + b, 0); const up = Rt + qs.slice(k).reduce((a, b) => a + b, 0); if (Math.abs(down - up) < best) { best = Math.abs(down - up); zn = k * dz; } }
      const znEq = zn; zn = Math.min(zn, +i.zs);
      const kz = Math.round(zn / dz), Gn = qs.slice(0, kz).reduce((a, b) => a + b, 0);
      c.h1('Neutral plane');
      c.q('Neutral plane from force equilibrium', 'z_n;eq', 'Q + Σ_0^z q_s = R_t + Σ_z^L q_s', znEq, 'm');
      c.v({ l: 'Neutral plane (≤ base of settling zone)', s: 'z_n', v: zn, u: 'm', key: true });
      c.v({ l: 'Drag force', s: 'G_neg', f: 'Σ_0^z_n q_s', v: Gn, u: 'kN', key: true });
      c.h1('Verifications');
      const Nmax = 1.35 * (Q + Gn) + 1.5 * i.Qk * 0;
      const m = EC.mat(i.fck, 500), NRd = 0.85 * m.fcd * Math.PI * (D * 1000) ** 2 / 4 / 1000;
      c.c('STR - maximum force at the neutral plane (no transient load)', 'N_max/N_Rd', Nmax, NRd, 'kN', 'EN 1992-1-1 (unreinforced core)', 'Pile structure at z_n');
      const Rbelow = Rt / i.gb + qs.slice(kz).reduce((a, b) => a + b, 0) / i.gs;
      const Fd = 1.35 * (Q + Gn) + 1.5 * i.Qk;
      c.c('GEO - resistance below the neutral plane', 'F_d/R_d', Fd, Rbelow, 'kN', 'EN 1997-3 6 (G_neg permanent)', 'GEO with downdrag');
      const pts = [], res = [];
      let load = Q, r2 = Rt; const rv = [];
      for (let k = 0; k < N; k++) { load += (k < kz ? qs[k] : -qs[k]); pts.push([load, -z[k]]); }
      for (let k = N - 1; k >= 0; k--) { r2 += qs[k]; rv.unshift([r2, -z[k]]); }
      const svg = EC.plot({ title: 'Load and resistance distribution', xl: 'force (kN)', yl: 'depth (m)', series: [{ name: 'load', pts }, { name: 'resistance', pts: rv, cls: 1 }], legend: true });
      return c.result({ spec: [['Pile', `ϕ${D * 1000} mm, L = ${L} m`], ['Downdrag', `z_n = ${fmt(zn, 1)} m, G_neg = ${fmt(Gn, 0)} kN`], ['Mitigation', 'bitumen slip coating to z_n if required']], bars: [], svg, zn, Gn });
    }
  });

  /* ---------------- Static load test ---------------- */
  EC.modules.loadtest = def({
    type: 'loadtest', name: 'Pile Load Test Interpretation', cat: 'geo', prefix: 'LT', code: 'EN 1997-3:2025 / EN ISO 22477-1', mathcad: 'EC7_Geotechnical\\Pile_Design\\LoadTest',
    groups: [
      { t: 'Pile', f: [F('D', 'Diameter', 'mm', 600), F('L', 'Length', 'm', 20), F('E', 'Pile modulus', 'GPa', 30), F('Pw', 'Working load', 'kN', 1500)] },
      { t: 'Readings', f: [T('rd', 'Load-settlement', ['P (kN)', 's (mm)'], [[0, 0], [750, 2.1], [1500, 4.8], [2250, 8.6], [3000, 14.5], [3500, 22.0], [3900, 35.0], [4100, 52.0]])] },
      { t: 'Evaluation', f: [F('ntest', 'Number of tests n', 'no', 2), F('Rmin', 'Lowest R_m of other tests (0 = this one)', 'kN', 0), F('gt', 'γ_t', '', 1.1), F('Fcd', 'Design action F_c;d', 'kN', 2000), F('slim', 'SLS settlement at working load', 'mm', 10)] }
    ],
    schedCols: [['pile', 'Pile'], ['Rm', 'R_m (kN)'], ['Rd', 'R_c;d (kN)']],
    sched: (i, r) => ({ pile: `ϕ${i.D} × ${i.L}`, Rm: r && r.Rm ? Math.round(r.Rm) : '', Rd: r && r.Rd ? Math.round(r.Rd) : '' }),
    calc(i) {
      const c = new EC.Calc(), R = EC.rows(i.rd).sort((a, b) => a[0] - b[0]);
      const D = +i.D, A = Math.PI * D * D / 4, L = +i.L;
      c.text('Static compression load test: ultimate resistance by the 10 % D criterion, Davisson offset limit and Chin-Kondner hyperbola, characteristic and design resistance with ξ_1 / ξ_2 for the number of tests, settlement at the working load.');
      const Ps = R.map(r => r[0]), ss = R.map(r => r[1]);
      const atS = s0 => { for (let k = 1; k < R.length; k++) if (R[k][1] >= s0) return R[k - 1][0] + (R[k][0] - R[k - 1][0]) * (s0 - R[k - 1][1]) / (R[k][1] - R[k - 1][1]); return null; };
      c.h1('Ultimate resistance');
      const P10 = atS(0.1 * D);
      c.q('10 % D criterion', 'R_m;10%', `P at s = ${fmt(0.1 * D)} mm`, P10 || 0, 'kN', 'EN ISO 22477-1');
      const el = P => P * 1000 * L * 1000 / (A * i.E * 1000);
      let Pdav = null; for (let k = 1; k < R.length; k++) { const f0 = R[k - 1][1] - (el(R[k - 1][0]) + 4 + D / 120), f1 = R[k][1] - (el(R[k][0]) + 4 + D / 120); if (f0 < 0 && f1 >= 0) { Pdav = R[k - 1][0] + (R[k][0] - R[k - 1][0]) * (-f0) / (f1 - f0); break; } }
      c.q('Davisson offset limit', 'R_m;D', 's = PL/(AE) + 4 + D/120', Pdav || 0, 'kN', 'Davisson (1972)');
      const pts = R.filter(r => r[1] > 0).slice(-4);
      const xm = pts.reduce((a, r) => a + r[1], 0) / pts.length, ym = pts.reduce((a, r) => a + r[1] / r[0], 0) / pts.length;
      const sl = pts.reduce((a, r) => a + (r[1] - xm) * (r[1] / r[0] - ym), 0) / pts.reduce((a, r) => a + (r[1] - xm) ** 2, 0);
      const Pchin = sl > 0 ? 1 / sl : 0;
      c.q('Chin-Kondner hyperbola (last 4 points)', 'R_u;Chin', '1/slope of s/P vs s', Pchin, 'kN', '(informative, upper bound)');
      const Rm = Math.min(...[P10, Pdav].filter(x => x)) || Math.max(...Ps);
      c.v({ l: 'Measured resistance adopted', s: 'R_c;m', f: 'min(10 % D, Davisson) or max load', v: Rm, u: 'kN', key: true });
      c.h1('Characteristic and design resistance');
      const n = Math.max(1, +i.ntest), x1 = EC.interp([1, 2, 3, 4, 5], [1.4, 1.3, 1.2, 1.1, 1.0], n), x2 = EC.interp([1, 2, 3, 4, 5], [1.4, 1.2, 1.05, 1.0, 1.0], n);
      const Rmin = +i.Rmin > 0 ? Math.min(+i.Rmin, Rm) : Rm, Rmean = +i.Rmin > 0 ? (Rm + +i.Rmin) / 2 : Rm;
      const Rk = Math.min(Rmean / x1, Rmin / x2);
      c.q('Correlation factors', 'ξ_1', `n = ${n}`, x1, '', 'Table A.9 [NDP]'); c.q('', 'ξ_2', '', x2, '');
      c.q('Characteristic resistance', 'R_c;k', 'min(R_mean/ξ_1, R_min/ξ_2)', Rk, 'kN');
      const Rd = Rk / i.gt;
      c.v({ l: 'Design resistance', s: 'R_c;d', f: 'R_c;k/γ_t', v: Rd, u: 'kN', key: true });
      c.c('Compression', 'F_c;d/R_c;d', +i.Fcd, Rd, 'kN', '7.6.2.2', 'Compression from test');
      const sw = EC.interp(Ps, ss, +i.Pw);
      c.c('Settlement at working load', 's_w', sw, +i.slim, 'mm', 'SLS', 'Settlement at working load');
      const dav = R.map(r => [r[0], el(r[0]) + 4 + D / 120]);
      const svg = EC.plot({ title: 'Load-settlement', xl: 'P (kN)', yl: '− s (mm)', series: [{ name: 'test', pts: R.map(r => [r[0], -r[1]]) }, { name: 'Davisson line', pts: dav.map(p => [p[0], -p[1]]), cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Pile', `ϕ${D} mm × ${L} m`], ['Result', `R_c,m = ${fmt(Rm, 0)} kN, R_c,d = ${fmt(Rd, 0)} kN`], ['Test', 'maintained load test to EN ISO 22477-1, 8 stages, hold ≥ 60 min at max']], bars: [], svg, Rm, Rd });
    }
  });

  /* ---------------- Soil springs for pile frame ---------------- */
  EC.modules.soilsprings = def({
    type: 'soilsprings', name: 'Pile Soil Springs (ETABS/SAFE)', cat: 'geo', prefix: 'SS', code: 'EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Pile_Design\\SoilSprings',
    groups: [
      { t: 'Pile', f: [F('D', 'Diameter', 'm', 0.8), F('L', 'Length', 'm', 20), F('dz', 'Node spacing Δz', 'm', 1.0), F('nu', 'Poisson ν', '', 0.3), F('fm', 'Lateral modifier f_m', '', 1.0)] },
      { t: 'Layers (top down)', f: [T('lay', 'Layers', ['h (m)', 'type (1 = clay)', 'γ\'', 'c_u', 'φ\'', 'E_s (MPa)', 'n_h (kN/m³)', 'α / β'], [[5, 1, 8, 30, 0, 12, 0, 0.6], [8, 0, 9, 0, 32, 40, 6000, 0.35], [10, 1, 9, 100, 0, 60, 0, 0.45]])] }
    ],
    schedCols: [['pile', 'D × L'], ['n', 'Nodes']],
    sched: i => ({ pile: `${i.D} × ${i.L}`, n: Math.round(i.L / i.dz) + 1 }),
    calc(i) {
      const c = new EC.Calc(), D = +i.D, L = +i.L, dz = +i.dz;
      const LY = EC.rows(i.lay).map(r => ({ h: r[0], coh: r[1] >= 1, g: r[2], gs: r[2], cu: r[3], phi: r[4], Es: r[5], nh: r[6], ab: r[7] }));
      c.text('Soil springs at the nodes of a pile modelled as a frame (ETABS / SAFE): lateral K = f_m k_h D Δz (clay 67 c_u, sand n_h z) with yield force, vertical shaft springs 2πGΔz/ζ (Randolph) with ultimate shaft resistance, and a base spring 4 G r_0/(1 − ν).');
      const rows = [], ptsK = [], ptsF = [];
      const zeta = Math.log(2.5 * L * (1 - i.nu) / (D / 2));
      for (let z = 0; z <= L + 1e-6; z += dz) {
        const Ly = G.layerAt(LY, Math.max(z, 0.01)), trib = (z === 0 || z >= L - 1e-6 ? 0.5 : 1) * dz, sv = Ly.g * z;
        const kh = Ly.coh ? 67 * Ly.cu : Ly.nh * Math.max(z, 0.5 * dz);
        const K = i.fm * kh * trib;
        const Fu = (Ly.coh ? Math.min(9, 3 + sv / Ly.cu + 0.5 * z / D) * Ly.cu * D : 3 * S.Kp(Ly.phi) * sv * D) * trib;
        const Gs = Ly.Es * 1000 / (2 * (1 + i.nu));
        const Kv = 2 * Math.PI * Gs * trib / zeta;
        const Tu = (Ly.coh ? Ly.ab * Ly.cu : Ly.ab * sv) * Math.PI * D * trib;
        rows.push([z, K, Fu, Kv, Tu]); ptsK.push([K / 1000, -z]); ptsF.push([Fu, -z]);
      }
      c.h1('Node springs');
      c.tbl(['z (m)', 'K_h (kN/m)', 'F_u (kN)', 'K_v (kN/m)', 'T_u (kN)'], rows, [1, 0, 0, 0, 0]);
      const Lb = G.layerAt(LY, L), Gb = Lb.Es * 1000 / (2 * (1 + i.nu));
      const Kb = 4 * Gb * D / 2 / (1 - i.nu);
      const Qb = (Lb.coh ? 9 * Lb.cu : 0.5 * S.Nq(Lb.phi) * Lb.g * L) * Math.PI * D * D / 4;
      c.v({ l: 'Base spring', s: 'K_b', f: '4 G_b r_0/(1 − ν)', v: Kb, u: 'kN/m', key: true });
      c.q('Base ultimate', 'Q_b', '', Qb, 'kN');
      c.q('Total vertical stiffness (springs in parallel, rigid pile)', 'ΣK_v + K_b', '', rows.reduce((a, r) => a + r[3], 0) + Kb, 'kN/m', '', true);
      c.ok({ l: 'Mesh', cond: dz <= D * 2 || dz <= 1.0, txt: `Δz = ${dz} m (≤ 1 m or 2D recommended)`, item: 'Mesh size' });
      const svg = EC.plot({ title: 'Lateral spring vs depth', xl: 'K_h (MN/m)', yl: 'depth (m)', series: [{ name: 'K_h', pts: ptsK }] }) + EC.plot({ title: 'Lateral yield force', xl: 'F_u (kN)', yl: 'depth (m)', series: [{ name: 'F_u', pts: ptsF, cls: 1 }] });
      return c.result({ spec: [['Pile', `ϕ${D * 1000} mm, L = ${L} m, nodes @ ${dz} m`], ['Use', 'assign K_h as link / area springs (multi-linear with F_u) and K_v, K_b as axial springs']], bars: [], svg });
    }
  });

  /* ---------------- SPT correlations ---------------- */
  EC.modules.sptcorr = def({
    type: 'sptcorr', name: 'SPT Soil Parameter Correlations', cat: 'geo', prefix: 'SC', code: 'EN 1997-2 / EN 1997-1:2024', mathcad: 'EC7_Geotechnical\\SPT_Correlation_Design',
    groups: [
      { t: 'SPT log', f: [T('spt', 'Readings', ['z (m)', 'N', 'type (1 = clay)', 'PI (%)', 'γ'], [[1.5, 5, 1, 30, 17], [3.0, 6, 1, 30, 17], [4.5, 12, 0, 0, 18], [6.0, 15, 0, 0, 19], [7.5, 18, 0, 0, 19], [9.0, 22, 0, 0, 19], [10.5, 25, 0, 0, 20], [12.0, 30, 0, 0, 20]])] },
      { t: 'Test parameters', f: [F('ER', 'Energy ratio ER', '%', 60), F('CB', 'Borehole correction C_B', '', 1.0), F('CS', 'Sampler correction C_S', '', 1.0), F('zw', 'Water table', 'm', 2.0)] }
    ],
    schedCols: [['n', 'Readings'], ['phi', 'φ\'_k sand'], ['cu', 'c_u,k clay']],
    sched: (i, r) => ({ n: EC.rows(i.spt).length, phi: r && r.phik ? r.phik.toFixed(1) : '', cu: r && r.cuk ? r.cuk.toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), SP = EC.rows(i.spt).sort((a, b) => a[0] - b[0]);
      c.text('Soil parameters from SPT blow counts (EN 1997-2 / EN ISO 22476-3): N_60 with energy, borehole, sampler and rod-length corrections, (N_1)_60, relative density and φ\' for coarse soils, c_u and E for fine soils, G_0, and characteristic values with the Student t-factor.');
      let sv = 0, zp = 0; const rows = []; const sand = { phi: [] }, clay = { cu: [] };
      SP.forEach(([z, N, ty, PI, g]) => {
        sv += g * (z - zp) - (z > i.zw ? gw * (z - Math.max(zp, +i.zw)) : 0); zp = z;
        const CR = z < 4 ? 0.75 : z < 6 ? 0.85 : z < 10 ? 0.95 : 1.0;
        const N60 = N * i.ER / 60 * i.CB * i.CS * CR, CN = Math.min(Math.sqrt(100 / Math.max(sv, 1)), 1.7), N160 = CN * N60;
        let phi = '', Dr = '', cu = '';
        if (ty >= 1) { const f1 = EC.interp([15, 60], [6.5, 4.4], PI || 30); cu = f1 * N60; clay.cu.push(cu); }
        else { Dr = Math.sqrt(N160 / 60) * 100; const p1 = Math.sqrt(20 * N160) + 20, p2 = EC.deg(Math.atan(Math.pow(N60 / (12.2 + 20.3 * sv / 100), 0.34))), p3 = 27.1 + 0.3 * N160 - 0.00054 * N160 ** 2; phi = (p1 + p2 + p3) / 3; sand.phi.push(phi); }
        const G0 = 1.9 * Math.pow(97 * Math.pow(N, 0.314), 2) / 1000;
        rows.push([z, N, N60, N160, ty >= 1 ? 'clay' : 'sand', Dr === '' ? '–' : Dr, phi === '' ? '–' : phi, cu === '' ? '–' : cu, G0]);
      });
      c.h1('Corrected blow counts and parameters');
      c.tbl(['z (m)', 'N', 'N_60', '(N_1)_60', 'soil', 'D_r (%)', 'φ\' (°)', 'c_u (kPa)', 'G_0 (MPa)'], rows, [1, 0, 1, 1, 0, 0, 1, 0, 0]);
      c.note('φ\' = mean of Hatanaka & Uchida, Kulhawy & Mayne and Wolff; c_u = f_1 N_60 (Stroud, f_1 from PI); G_0 from Imai & Tonouchi V_s = 97 N^0.314.');
      const stat = (arr) => { const n = arr.length, mean = arr.reduce((a, b) => a + b, 0) / Math.max(n, 1), sd = n > 1 ? Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0; return { n, mean, sd, k: n > 1 ? mean - G.t95(n) * sd / Math.sqrt(n) : mean }; };
      c.h1('Characteristic values (EN 1997-1:2024 4.3)');
      let phik = 0, cuk = 0;
      if (sand.phi.length) { const s = stat(sand.phi); phik = s.k; c.v({ l: 'Coarse soil φ\'', s: 'φ\'_k', f: 'mean − t_95 s/√n', n: `n = ${s.n}, mean ${fmt(s.mean, 1)}, s = ${fmt(s.sd, 2)}`, v: s.k, u: '°', key: true }); }
      if (clay.cu.length) { const s = stat(clay.cu); cuk = s.k; c.v({ l: 'Fine soil c_u', s: 'c_u;k', f: 'mean − t_95 s/√n', n: `n = ${s.n}, mean ${fmt(s.mean, 0)}`, v: s.k, u: 'kPa', key: true }); }
      const svg = EC.plot({ title: 'SPT N and (N_1)_60 vs depth', xl: 'N', yl: 'depth (m)', series: [{ name: 'N', pts: rows.map(r => [r[1], -r[0]]) }, { name: '(N1)60', pts: rows.map(r => [r[3], -r[0]]), cls: 1 }], legend: true }) + (sand.phi.length ? EC.plot({ title: 'φ\' vs depth (coarse)', xl: 'φ\' (°)', yl: 'depth (m)', series: [{ name: 'φ\'', pts: rows.filter(r => r[4] === 'sand').map(r => [r[6], -r[0]]), cls: 2 }] }) : '');
      return c.result({ spec: [['Borehole', `${SP.length} SPT readings, ER = ${i.ER} %`], ['Characteristic', `φ'_k = ${fmt(phik, 1)}°, c_u,k = ${fmt(cuk, 0)} kPa`]], bars: [], svg, phik, cuk });
    }
  });

  /* ---------------- Liquefaction ---------------- */
  EC.modules.liquefaction = def({
    type: 'liquefaction', name: 'Liquefaction Screening (SPT)', cat: 'geo', prefix: 'LQ', code: 'EN 1998-5 Annex B / EN 1997', mathcad: 'EC7_Geotechnical\\Liquefaction_Design',
    groups: [
      { t: 'SPT log', f: [T('spt', 'Readings', ['z (m)', 'N', 'FC (%)', 'γ', 'susceptible (1/0)'], [[2, 6, 10, 18, 1], [4, 9, 12, 19, 1], [6, 12, 8, 19, 1], [8, 14, 15, 19, 1], [10, 18, 20, 20, 1], [12, 25, 10, 20, 1], [15, 32, 5, 20, 1]]), F('zw', 'Water table', 'm', 1.5), F('ER', 'Energy ratio', '%', 60)] },
      { t: 'Seismic', f: [F('ag', 'a_g/g (design, rock)', '', 0.12), F('Sf', 'Soil factor S', '', 1.2), F('M', 'Magnitude M_s', '', 7.0), F('lam', 'Required safety factor λ', '', 1.25)] }
    ],
    schedCols: [['n', 'Readings'], ['LPI', 'LPI'], ['risk', 'Risk']],
    sched: (i, r) => ({ n: EC.rows(i.spt).length, LPI: r && r.LPI !== undefined ? r.LPI.toFixed(1) : '', risk: r && r.risk }),
    calc(i) {
      const c = new EC.Calc(), SP = EC.rows(i.spt).sort((a, b) => a[0] - b[0]);
      c.text('Liquefaction susceptibility from SPT (EN 1998-5 4.1.4 / Annex B): cyclic stress τ_e = 0.65 α S σ_v0, (N_1)_60 with C_N, fines correction (Youd et al. 2001), CRR_7.5 × C_M, factor of safety vs λ, Liquefaction Potential Index (Iwasaki) and reconsolidation settlement estimate.');
      const aS = i.ag * i.Sf;
      c.h1('Screening');
      c.ok({ l: 'α S ≥ 0.15 (liquefaction to be checked)', cond: true, txt: `α S = ${fmt(aS, 3)}${aS < 0.15 ? ' - below 0.15: may be neglected if other Annex B conditions hold' : ''}`, item: false });
      const CM = EC.interp([5.5, 6.0, 6.5, 7.0, 8.0], [2.86, 2.20, 1.69, 1.30, 0.67], +i.M);
      c.q('Magnitude correction', 'C_M', 'Table B.1', CM, '');
      let sv = 0, zp = 0, LPI = 0, sett = 0; const rows = [], fs = [];
      SP.forEach(([z, N, FC, g, sus], k) => {
        sv += g * (z - zp); zp = z;
        const u = Math.max(0, z - i.zw) * gw, s1 = sv - u;
        const CN = EC.clamp(Math.sqrt(100 / Math.max(s1, 1)), 0.5, 2);
        const N160 = CN * N * i.ER / 60;
        const a = FC <= 5 ? 0 : FC >= 35 ? 5 : Math.exp(1.76 - 190 / (FC * FC)), b = FC <= 5 ? 1 : FC >= 35 ? 1.2 : 0.99 + Math.pow(FC, 1.5) / 1000;
        const Ncs = a + b * N160;
        const rd = z <= 9.15 ? 1 - 0.00765 * z : 1.174 - 0.0267 * z;
        const CSR = 0.65 * aS * sv / s1 * rd;
        const CRR = Ncs < 30 ? 1 / (34 - Ncs) + Ncs / 135 + 50 / (10 * Ncs + 45) ** 2 - 1 / 200 : 2;
        const FS = z < i.zw || !sus ? 9.99 : CRR * CM / CSR;
        const dz = k ? z - SP[k - 1][0] : z;
        if (z <= 20 && FS < 1) LPI += (1 - FS) * (10 - 0.5 * z) * dz;
        if (FS < 1.2) { const ev = EC.interp([3, 10, 20, 30], [3.5, 2.0, 1.0, 0.3], Ncs) / 100; sett += ev * dz; }
        rows.push([z, N, N160, Ncs, CSR, CRR * CM, Math.min(FS, 9.99)]);
        fs.push([Math.min(FS, 3), -z]);
      });
      c.h1('Layer by layer');
      c.tbl(['z (m)', 'N', '(N_1)_60', '(N_1)_60cs', 'CSR', 'CRR·C_M', 'FS'], rows, [1, 0, 1, 1, 3, 3, 2]);
      c.note('r_d stress reduction (Seed & Idriss) applied to CSR; FS = 9.99 above the water table or for non-susceptible layers.');
      const minFS = Math.min(...rows.map(r => r[6]));
      c.c('Factor of safety (lowest layer)', 'λ/FS_min', +i.lam, minFS, '', 'EN 1998-5 4.1.4(11) [NDP λ]', 'Liquefaction FS');
      const risk = LPI === 0 ? 'very low' : LPI <= 5 ? 'low' : LPI <= 15 ? 'high' : 'very high';
      c.v({ l: 'Liquefaction Potential Index', s: 'LPI', f: 'Σ (1 − FS) (10 − 0.5 z) Δz', v: LPI, u: '', key: true, n: `risk ${risk} (Iwasaki)` });
      c.v({ l: 'Reconsolidation settlement (estimate)', s: 's_v', f: 'Σ ε_v Δz (Ishihara & Yoshimine)', v: sett * 1000, u: 'mm' });
      const svg = EC.plot({ title: 'Factor of safety vs depth', xl: 'FS', yl: 'depth (m)', series: [{ name: 'FS', pts: fs }, { name: 'λ', pts: [[+i.lam, 0], [+i.lam, -SP[SP.length - 1][0]]], cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Seismic', `a_g S/g = ${fmt(aS, 3)}, M = ${i.M}`], ['Result', `FS_min = ${fmt(minFS, 2)}, LPI = ${fmt(LPI, 1)} (${risk})`], ['Mitigation', minFS < i.lam ? 'densification / stone columns / deep foundations to below liquefiable layers' : 'none required']], bars: [], svg, LPI, risk });
    }
  });
})();
