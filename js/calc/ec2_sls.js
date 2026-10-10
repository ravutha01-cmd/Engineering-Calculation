/* EC2 durability & SLS: cover, crack control, deflection, creep & shrinkage, restraint cracking, fire, liquid-retaining walls */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}) }, o);

  /* crack width, EN 1992-1-1:2004 7.3.4 (bending or tension) */
  EC.crackW = function (o) {
    const { b, h, d, As, phi, c, M, N, fck, kt, aL } = o;
    const m = EC.mat(fck, 500);
    const ae = m.Es / m.Ecm, al = aL || 15;
    let x, ss;
    if (N && N > 0 && !M) { x = 0; ss = N * 1e3 / As; }
    else {
      x = (-al * As + Math.sqrt(al * al * As * As + 2 * b * al * As * d)) / b;
      const I = b * x ** 3 / 3 + al * As * (d - x) ** 2;
      ss = al * Math.abs(M) * 1e6 * (d - x) / I;
    }
    const hce = N && !M ? Math.min(2.5 * (h - d), h / 2) : Math.min(2.5 * (h - d), (h - x) / 3, h / 2);
    const rho = As / (b * hce);
    const fct = m.fctm;
    const de = Math.max((ss - (kt || 0.4) * fct / rho * (1 + ae * rho)) / m.Es, 0.6 * ss / m.Es);
    const k2 = N && !M ? 1.0 : 0.5;
    const sr = 3.4 * c + 0.425 * 0.8 * k2 * phi / rho;
    return { x, ss, hce, rho, de, sr, wk: sr * de, ae, al, fct };
  };
  const crackLines = (c, o, w) => {
    c.q('Neutral axis (cracked, long-term α_L)', 'x', 'b x²/2 = α_L A_s (d − x)', w.x, 'mm');
    c.q('Steel stress (quasi-permanent)', 'σ_s', 'α_L M (d − x)/I_cr', w.ss, 'MPa', '', true);
    c.q('Effective tension height', 'h_c;ef', 'min(2.5(h − d), (h − x)/3, h/2)', w.hce, 'mm', '7.3.2');
    c.q('Effective reinforcement ratio', 'ρ_p;eff', 'A_s/(b h_c;ef)', w.rho, '');
    c.q('Mean strain difference', 'ε_sm − ε_cm', '[σ_s − k_t f_ct;eff/ρ (1 + α_e ρ)]/E_s ≥ 0.6 σ_s/E_s', w.de * 1000, '‰', '(7.9)');
    c.q('Maximum crack spacing', 's_r;max', '3.4 c + 0.425 k_1 k_2 ϕ/ρ_p;eff', w.sr, 'mm', '(7.11)');
    c.v({ l: 'Crack width', s: 'w_k', f: 's_r;max (ε_sm − ε_cm)', v: w.wk, u: 'mm', key: true, r: 'EN 1992-1-1:2004 7.3.4 [verify 2023 9.2]' });
  };

  /* ---------------- Concrete cover ---------------- */
  const EXPI = { X0: 0, XC1: 1, XC2: 2, XC3: 2, XC4: 3, XD1: 4, XS1: 4, XD2: 5, XS2: 5, XD3: 6, XS3: 6 };
  const CMIN = [[10, 10, 10, 15, 20, 25, 30], [10, 10, 15, 20, 25, 30, 35], [10, 10, 20, 25, 30, 35, 40], [10, 15, 25, 30, 35, 40, 45], [15, 20, 30, 35, 40, 45, 50], [20, 25, 35, 40, 45, 50, 55]];
  const STRC = { X0: 30, XC1: 30, XC2: 35, XC3: 35, XC4: 40, XD1: 40, XS1: 40, XD2: 40, XS2: 45, XD3: 45, XS3: 45 };
  EC.modules.cover = def({
    type: 'cover', name: 'Concrete Cover', cat: 'sls', prefix: 'CV', icon: 'drop', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Cover_Design',
    groups: [
      { t: 'Exposure & design life', f: [F('exp', 'Exposure class', '', 'XC3', EC.EXPO), F('life', 'Design working life', 'years', 50, [{ v: 50, l: '50 years' }, { v: 100, l: '100 years' }]), F('fck', 'Concrete class', '', 35, EC.CONC), F('slab', 'Slab geometry', '', 'no', [{ v: 'no', l: 'No' }, { v: 'yes', l: 'Yes (S − 1)' }]), F('qc', 'Special quality control', '', 'no', [{ v: 'no', l: 'No' }, { v: 'yes', l: 'Yes (S − 1)' }])] },
      { t: 'Bars & tolerances', f: [F('phi', 'Main bar ϕ', 'mm', 20, EC.barOpts), F('phiw', 'Link ϕ', 'mm', 10, EC.barOpts), F('dg', 'Max aggregate d_g', 'mm', 20), F('dev', 'Δc_dev', 'mm', 10, [{ v: 10, l: '10 mm (normal)' }, { v: 5, l: '5 mm (QA)' }, { v: 0, l: '0 mm (measured)' }]), F('ground', 'Cast against', '', 'form', [{ v: 'form', l: 'Formwork' }, { v: 'prep', l: 'Prepared ground / blinding (≥ 40)' }, { v: 'soil', l: 'Directly against soil (≥ 75)' }]), F('afi', 'Fire axis distance a (0 = n/a)', 'mm', 0)] }
    ],
    schedCols: [['exp', 'Exposure'], ['S', 'Class S'], ['cnom', 'c_nom (mm)']],
    sched: (i, r) => ({ exp: i.exp, S: r && r.S ? 'S' + r.S : '', cnom: r && r.cnom }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Nominal concrete cover: structural class from exposure, design life, strength, slab geometry and quality control, minimum cover for bond and durability, allowance for deviation, ground contact and fire. Durability table = EN 1992-1-1:2004 Table 4.4N as editable recommended values [verify against the 2023 exposure-resistance classes].');
      c.h1('Structural class');
      let S = 4;
      if (+i.life === 100) S += 2;
      if (+i.fck >= STRC[i.exp]) S -= 1;
      if (i.slab === 'yes') S -= 1;
      if (i.qc === 'yes') S -= 1;
      S = EC.clamp(S, 1, 6);
      c.v({ l: 'Structural class', s: 'S', f: `S4${+i.life === 100 ? ' + 2 (100 yr)' : ''}${+i.fck >= STRC[i.exp] ? ` − 1 (≥ C${STRC[i.exp]})` : ''}${i.slab === 'yes' ? ' − 1 (slab)' : ''}${i.qc === 'yes' ? ' − 1 (QC)' : ''}`, v: S, u: '', dp: 0, key: true, r: 'Table 4.3N (2004)' });
      c.h1('Minimum cover');
      const cdur = CMIN[S - 1][EXPI[i.exp]];
      c.v({ l: 'Durability', s: 'c_min;dur', f: `Table 4.4N, ${i.exp}, S${S}`, v: cdur, u: 'mm', dp: 0, r: '[NDP]' });
      const cb = +i.phi + (i.dg > 32 ? 5 : 0), cbw = +i.phiw;
      c.v({ l: 'Bond (main bars)', s: 'c_min;b', f: 'ϕ (+5 if d_g > 32)', v: cb, u: 'mm', dp: 0 });
      const cminMain = Math.max(cb, cdur, 10), cminLink = Math.max(cbw, cdur, 10);
      c.q('Minimum cover to main bars', 'c_min', 'max(c_min;b, c_min;dur, 10)', cminMain, 'mm');
      c.q('Minimum cover to links', 'c_min;w', 'max(ϕ_w, c_min;dur, 10)', cminLink, 'mm');
      c.h1('Nominal cover (to links)');
      let cnom = Math.max(cminLink + +i.dev, cminMain + +i.dev - +i.phiw);
      c.q('From durability / bond', 'c_nom', 'max(c_min;w, c_min − ϕ_w) + Δc_dev', cnom, 'mm');
      if (i.ground === 'prep') { cnom = Math.max(cnom, 40); c.note('Cast against prepared ground: c_nom ≥ 40 mm.'); }
      if (i.ground === 'soil') { cnom = Math.max(cnom, 75); c.note('Cast directly against soil: c_nom ≥ 75 mm.'); }
      if (+i.afi > 0) { const cf = i.afi - i.phi / 2 - i.phiw; c.q('Cover for fire axis distance', 'c_fi', 'a − ϕ/2 − ϕ_w', cf, 'mm', 'EN 1992-1-2'); cnom = Math.max(cnom, cf); }
      cnom = Math.ceil(cnom / 5) * 5;
      c.v({ l: 'Nominal cover to specify (rounded to 5 mm)', s: 'c_nom', v: cnom, u: 'mm', dp: 0, key: true });
      c.ok({ l: 'Result', cond: true, txt: `c_nom = ${cnom} mm to links (${cnom + +i.phiw} mm to main bars)`, item: false });
      const rows = [1, 2, 3, 4, 5, 6].map(s => [`S${s}`, CMIN[s - 1][EXPI[i.exp]]]);
      const svg = EC.plot({ title: `c_min,dur vs structural class (${i.exp})`, xl: 'S', yl: 'c_min,dur (mm)', series: [{ name: 'c_min,dur', pts: rows.map((r, k) => [k + 1, r[1]]) }], points: [{ x: S, y: cdur, t: 'design' }] });
      return c.result({ spec: [['Exposure', `${i.exp}, ${i.life} years, ${EC.concName(i.fck)}`], ['Structural class', `S${S}`], ['Nominal cover', `${cnom} mm to links (Δc_dev = ${i.dev} mm)`], ['Spacers', 'concrete / plastic spacers at ≤ 1 m to EN 13670']], bars: [], svg, S, cnom });
    }
  });

  /* ---------------- Crack control ---------------- */
  EC.modules.crackcontrol = def({
    type: 'crackcontrol', name: 'Crack Control', cat: 'sls', prefix: 'CC', icon: 'drop', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\CrackControl_Design',
    groups: [
      { t: 'Section', f: [F('b', 'Width b', 'mm', 1000), F('h', 'Depth h', 'mm', 400), F('c', 'Cover to main bar c', 'mm', 40), F('n', 'Bars n (in width b)', 'no', 7), F('phi', 'Bar ϕ', 'mm', 16, EC.barOpts), F('fck', 'Concrete class', '', 30, EC.CONC)] },
      { t: 'Actions (quasi-permanent)', f: [F('mode', 'Action', '', 'bend', [{ v: 'bend', l: 'Bending' }, { v: 'ten', l: 'Pure tension' }]), F('M', 'M_qp', 'kNm', 120), F('N', 'N_qp (tension)', 'kN', 0), F('aL', 'Long-term modular ratio α_L', '', 15), F('wlim', 'w_lim', 'mm', 0.3, [{ v: 0.4, l: '0.4 (X0, XC1)' }, { v: 0.3, l: '0.3 (XC2–XS3)' }, { v: 0.2, l: '0.2 (water-resisting)' }, { v: 0.1, l: '0.1' }])] }
    ],
    schedCols: [['sec', 'b × h'], ['bars', 'Bars'], ['wk', 'w_k (mm)']],
    sched: (i, r) => ({ sec: `${i.b}×${i.h}`, bars: `${i.n}H${i.phi}`, wk: r && r.wk ? r.wk.toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, 500);
      const b = +i.b, h = +i.h, d = h - i.c - i.phi / 2, As = i.n * EC.barA(i.phi), ten = i.mode === 'ten';
      c.text('Crack control by direct calculation of w_k (EN 1992-1-1:2004 7.3.4 form) under quasi-permanent actions, minimum reinforcement, stress limits, largest bar diameter, w_k vs ϕ and σ_s.');
      c.h1('Minimum reinforcement');
      const kc = ten ? 1.0 : 0.4, k = h <= 300 ? 1.0 : h >= 800 ? 0.65 : 1.0 - 0.35 * (h - 300) / 500;
      const Act = ten ? b * h : b * h / 2;
      const Amin = kc * k * m.fctm * Act / 500;
      c.q('Factors', 'k_c', ten ? 'pure tension 1.0' : 'bending 0.4', kc, '', '7.3.2'); c.q('', 'k', 'h ≤ 300: 1.0 … h ≥ 800: 0.65', k, '');
      c.c('Minimum steel', 'A_s;min', Amin, As, 'mm²', '7.3.2 (σ_s = f_yk)', 'Minimum steel for crack control', 'k_c k f_ct;eff A_ct/σ_s');
      c.h1('Crack width');
      const w = EC.crackW({ b, h, d, As, phi: +i.phi, c: +i.c, M: ten ? 0 : +i.M, N: ten ? +i.N : 0, fck: +i.fck, aL: +i.aL });
      crackLines(c, i, w);
      c.c('Crack width', 'w_k/w_lim', w.wk, +i.wlim, 'mm', '7.3.1 [NDP]', 'Crack width');
      c.c('Steel stress limit', 'σ_s', w.ss, 0.8 * 500, 'MPa', '7.2 [0.8 f_yk]', 'Steel stress');
      const phis = EC.BARS.filter(p => p >= 8 && p <= 32);
      const wv = phis.map(p => { const n = As / EC.barA(p); const q = EC.crackW({ b, h, d: h - i.c - p / 2, As, phi: p, c: +i.c, M: ten ? 0 : +i.M, N: ten ? +i.N : 0, fck: +i.fck, aL: +i.aL }); return [p, q.wk, n]; });
      const ok = wv.filter(r => r[1] <= i.wlim).map(r => r[0]);
      c.v({ l: 'Largest bar for w_lim at the same steel area', s: 'ϕ_max', v: ok.length ? Math.max(...ok) : 0, u: 'mm', dp: 0 });
      const sv = []; for (let s = 100; s <= 400; s += 20) { const p = { ...w }; const de = Math.max((s - 0.4 * w.fct / w.rho * (1 + w.ae * w.rho)) / 200000, 0.6 * s / 200000); sv.push([s, w.sr * de]); }
      const svg = EC.plot({ title: 'w_k vs bar diameter (same A_s)', xl: 'ϕ (mm)', yl: 'w_k (mm)', series: [{ name: 'w_k', pts: wv.map(r => [r[0], r[1]]) }, { name: 'w_lim', pts: [[8, +i.wlim], [32, +i.wlim]], cls: 1, dash: true }], legend: true }) +
        EC.plot({ title: 'w_k vs steel stress', xl: 'σ_s (MPa)', yl: 'w_k (mm)', series: [{ name: 'w_k', pts: sv, cls: 2 }], points: [{ x: w.ss, y: w.wk, t: 'design', ok: w.wk <= i.wlim }] });
      return c.result({ spec: [['Section', `${b} × ${h} mm, ${i.n}H${i.phi}, c = ${i.c} mm`], ['Limit', `w_lim = ${i.wlim} mm`], ['Result', `w_k = ${fmt(w.wk, 3)} mm, σ_s = ${fmt(w.ss, 0)} MPa`]], bars: [], svg, wk: w.wk });
    }
  });

  /* ---------------- Deflection by calculation ---------------- */
  EC.modules.deflection = def({
    type: 'deflection', name: 'Deflection by Calculation', cat: 'sls', prefix: 'DF', icon: 'drop', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Deflection_Design',
    groups: [
      { t: 'Member', f: [F('L', 'Span (simply supported)', 'm', 6.0), F('b', 'Width b', 'mm', 1000), F('h', 'Depth h', 'mm', 260), F('c', 'Cover to bar axis', 'mm', 35), F('n', 'Bottom bars n', 'no', 10), F('phi', 'Bottom ϕ', 'mm', 16, EC.barOpts), F('As2', 'Compression steel A_s2', 'mm²', 0), F('fck', 'Concrete class', '', 30, EC.CONC)] },
      { t: 'Loads (characteristic UDL)', f: [F('gk', 'Permanent g_k (incl. self weight)', 'kN/m', 8.0), F('qk', 'Variable q_k', 'kN/m', 3.0), F('psi2', 'ψ_2', '', 0.3), F('gpart', 'Load applied after partitions (part of g_k)', 'kN/m', 1.5)] },
      { t: 'Long-term', f: [F('cr', 'Creep coefficient φ', '', 2.5), F('ecs', 'Free shrinkage ε_cs', '‰', 0.4), F('beta', 'Load duration β', '', 0.5)] }
    ],
    schedCols: [['sec', 'b × h'], ['L', 'L'], ['d', 'δ_LT (mm)']],
    sched: (i, r) => ({ sec: `${i.b}×${i.h}`, L: i.L, d: r && r.dLT ? r.dLT.toFixed(1) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, 500);
      const b = +i.b, h = +i.h, d = h - i.c, As = i.n * EC.barA(i.phi), As2 = +i.As2, L = i.L * 1000;
      c.text('SLS deflection by calculation (9.3): uncracked and cracked transformed sections, distribution coefficient ζ, creep through E_c,eff, shrinkage curvature, curvatures integrated along the span by virtual work.');
      c.h1('Material and sections');
      const Eeff = m.Ecm / (1 + +i.cr), aL = m.Es / Eeff;
      c.q('Effective modulus', 'E_c;eff', 'E_cm/(1 + φ)', Eeff, 'MPa'); c.q('Modular ratio', 'α_e', 'E_s/E_c;eff', aL, '');
      const sec = ae => {
        const A1 = b * h + (ae - 1) * (As + As2), y1 = (b * h * h / 2 + (ae - 1) * (As * d + As2 * i.c)) / A1;
        const I1 = b * h ** 3 / 12 + b * h * (h / 2 - y1) ** 2 + (ae - 1) * (As * (d - y1) ** 2 + As2 * (y1 - i.c) ** 2);
        const qa = b / 2, qb = ae * (As + As2), qc = -ae * (As * d + As2 * i.c);
        const x2 = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
        const I2 = b * x2 ** 3 / 3 + ae * (As * (d - x2) ** 2 + As2 * (x2 - i.c) ** 2);
        const S1 = As * (d - y1) - As2 * (y1 - i.c), S2 = As * (d - x2) - As2 * (x2 - i.c);
        return { y1, I1, x2, I2, S1, S2 };
      };
      const sL = sec(aL), s0 = sec(m.Es / m.Ecm);
      c.q('Uncracked: centroid / I_I', 'I_I', 'transformed, α_e', sL.I1 / 1e6, '×10⁶ mm⁴'); c.q('Cracked: x / I_II', 'x_II', '', sL.x2, 'mm'); c.q('', 'I_II', '', sL.I2 / 1e6, '×10⁶ mm⁴');
      const Mcr = m.fctm * sL.I1 / (h - sL.y1) / 1e6;
      c.q('Cracking moment', 'M_cr', 'f_ctm I_I/(h − y_I)', Mcr, 'kNm', '', true);
      c.h1('Curvature integration');
      const ec = i.ecs / 1000;
      const defl = (w, E, s, beta, shr) => {
        const N = 40; let del = 0; const kap = [];
        for (let k = 0; k < N; k++) {
          const x = (k + 0.5) / N * L, M = w * (x / 1000) * (i.L - x / 1000) / 2;
          const z = M > Mcr ? 1 - beta * (Mcr / M) ** 2 : 0;
          const k1 = M * 1e6 / (E * s.I1), k2 = M * 1e6 / (E * s.I2);
          const ks = shr ? ec * (m.Es / E) * ((1 - z) * s.S1 / s.I1 + z * s.S2 / s.I2) : 0;
          const kt = z * k2 + (1 - z) * k1 + ks; kap.push([x / 1000, kt * 1e6]);
          const mb = x <= L / 2 ? x / 2 : (L - x) / 2;
          del += kt * mb * L / N;
        }
        return { del, kap };
      };
      const wqp = +i.gk + i.psi2 * i.qk;
      const LT = defl(wqp, Eeff, sL, +i.beta, true);
      c.v({ l: 'Long-term deflection (quasi-permanent)', s: 'δ_LT', f: '∫ (1/r)(x) m̄(x) dx,  1/r = ζ/r_II + (1 − ζ)/r_I + 1/r_cs', n: `w_qp = ${fmt(wqp)} kN/m`, v: LT.del, u: 'mm', key: true });
      c.c('Appearance limit', 'δ_LT/(L/250)', LT.del, L / 250, 'mm', '9.3.1 [NDP]', 'Deflection L/250');
      const before = defl(+i.gk - i.gpart, m.Ecm, s0, 1.0, false).del;
      const inc = Math.max(0, LT.del - before);
      c.q('Deflection before partitions (short term)', 'δ_0', 'g_k − g_part, E_cm', before, 'mm');
      c.v({ l: 'Incremental deflection after partitions', s: 'δ_inc', f: 'δ_LT − δ_0', v: inc, u: 'mm', key: true });
      c.c('Damage limit', 'δ_inc/(L/500)', inc, L / 500, 'mm', '9.3.1 [NDP]', 'Deflection L/500');
      const svg = EC.plot({ title: 'Curvature along the span', xl: 'x (m)', yl: '1/r (×10⁻⁶ /mm)', series: [{ name: '1/r', pts: LT.kap, fill: true }] });
      return c.result({ spec: [['Section', `${b} × ${h} mm, ${i.n}H${i.phi}`], ['Deflection', `δ_LT = ${fmt(LT.del, 1)} mm (L/${fmt(L / Math.max(LT.del, 0.1), 0)}), δ_inc = ${fmt(inc, 1)} mm`], ['Pre-camber', LT.del > L / 250 ? `consider pre-camber ≈ ${fmt(0.75 * before, 0)} mm` : 'not needed']], bars: [], svg, dLT: LT.del });
    }
  });

  /* ---------------- Creep & shrinkage ---------------- */
  EC.modules.creepshrink = def({
    type: 'creepshrink', name: 'Creep & Shrinkage', cat: 'sls', prefix: 'CS', icon: 'drop', code: 'EN 1992-1-1 Annex B', mathcad: 'EC2_Concrete\\CreepShrinkage_Design',
    groups: [
      { t: 'Concrete', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('cem', 'Cement class', '', 'N', [{ v: 'S', l: 'Class S (slow)' }, { v: 'N', l: 'Class N' }, { v: 'R', l: 'Class R (rapid)' }]), F('RH', 'Relative humidity RH', '%', 70)] },
      { t: 'Member', f: [F('Ac', 'Cross-section area A_c', 'mm²', 300000), F('u', 'Perimeter exposed to drying u', 'mm', 2000)] },
      { t: 'Ages', f: [F('t0', 'Age at loading t_0', 'days', 28), F('ts', 'Age at end of curing t_s', 'days', 7), F('t', 'Age considered t', 'days', 25550), F('sig', 'Compressive stress at t_0 σ_c', 'MPa', 10)] }
    ],
    schedCols: [['h0', 'h_0 (mm)'], ['phi', 'φ(t,t0)'], ['ecs', 'ε_cs (‰)']],
    sched: (i, r) => ({ h0: (2 * i.Ac / i.u).toFixed(0), phi: r && r.phi ? r.phi.toFixed(2) : '', ecs: r && r.ecs ? (r.ecs * 1000).toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, 500);
      const h0 = 2 * i.Ac / i.u;
      c.text('Creep coefficient and shrinkage strain to Annex B (EN 1992-1-1:2004 formulation, cement-class adjusted loading age), non-linear creep, effective modulus for deflection and shortening. Verify against the 2023 Annex B model for final design.');
      c.h1('Notional size and adjusted age');
      c.q('Notional size', 'h_0', '2 A_c/u', h0, 'mm');
      const al = { S: -1, N: 0, R: 1 }[i.cem];
      const t0 = Math.max(0.5, i.t0 * Math.pow(9 / (2 + Math.pow(+i.t0, 1.2)) + 1, al));
      c.q('Adjusted loading age', 't_0;adj', 't_0 (9/(2 + t_0^1.2) + 1)^α ≥ 0.5', t0, 'days', '(B.9)');
      c.h1('Creep');
      const C = EC.creep.phi(m.fcm, +i.RH, h0, t0, +i.t);
      c.q('RH factor', 'φ_RH', '', C.phiRH, '', '(B.3)'); c.q('Strength factor', 'β(f_cm)', '16.8/√f_cm', C.bf, '', '(B.4)'); c.q('Age factor', 'β(t_0)', '1/(0.1 + t_0^0.2)', C.bt0, '', '(B.5)');
      c.q('Notional creep', 'φ_0', 'φ_RH β(f_cm) β(t_0)', C.phi0, '', '(B.2)'); c.q('Development', 'β_c(t,t_0)', '((t − t_0)/(β_H + t − t_0))^0.3', C.bc, '', '(B.7)');
      let phi = C.phi;
      c.v({ l: 'Creep coefficient', s: 'φ(t,t_0)', f: 'φ_0 β_c', v: phi, u: '', key: true });
      const ks = i.sig / (0.85 * m.fcm * 1);
      if (ks > 0.45) { const pn = phi * Math.exp(1.5 * (ks - 0.45)); c.q('Non-linear creep (σ_c > 0.45 f_ck(t_0))', 'φ_nl', 'φ exp(1.5(k_σ − 0.45))', pn, '', '(3.7)'); phi = pn; }
      c.q('Effective modulus', 'E_c;eff', 'E_cm/(1 + φ)', m.Ecm / (1 + phi), 'MPa', '', true);
      c.h1('Shrinkage');
      const S = EC.creep.shrink(+i.fck, +i.RH, h0, +i.ts, +i.t, i.cem);
      c.q('Basic drying shrinkage', 'ε_cd;0', '0.85 [(220 + 110 α_ds1) exp(−α_ds2 f_cm/f_cmo)] β_RH', S.ecd0 * 1000, '‰', '(B.11)');
      c.q('Size factor', 'k_h', 'Table 3.3', S.kh, '');
      c.q('Drying shrinkage', 'ε_cd(t)', 'β_ds k_h ε_cd;0', S.ecd * 1000, '‰', '(3.10)');
      c.q('Autogenous shrinkage', 'ε_ca(t)', '(1 − e^(−0.2√t)) 2.5 (f_ck − 10)·10⁻⁶', S.eca * 1000, '‰', '(3.12)');
      c.v({ l: 'Total shrinkage', s: 'ε_cs', f: 'ε_cd + ε_ca', v: S.ecs * 1000, u: '‰', key: true, dp: 3 });
      const ts = [], ph = [], sh = [];
      for (let e = Math.log10(Math.max(+i.t0 + 1, 2)); e <= Math.log10(+i.t); e += 0.1) { const tt = Math.pow(10, e); ph.push([e, EC.creep.phi(m.fcm, +i.RH, h0, t0, tt).phi]); sh.push([e, EC.creep.shrink(+i.fck, +i.RH, h0, +i.ts, tt, i.cem).ecs * 1000]); }
      const svg = EC.plot({ title: 'Creep coefficient vs log time', xl: 'log₁₀ t (days)', yl: 'φ(t,t₀)', series: [{ name: 'φ', pts: ph }] }) + EC.plot({ title: 'Shrinkage vs log time', xl: 'log₁₀ t (days)', yl: 'ε_cs (‰)', series: [{ name: 'ε_cs', pts: sh, cls: 1 }] });
      return c.result({ spec: [['Concrete', `${EC.concName(i.fck)}, cement ${i.cem}, RH ${i.RH} %`], ['Results', `φ = ${fmt(phi, 2)}, ε_cs = ${fmt(S.ecs * 1000, 3)} ‰, E_c,eff = ${fmt(m.Ecm / (1 + phi), 0)} MPa`]], bars: [], svg, phi, ecs: S.ecs });
    }
  });

  /* ---------------- Restraint cracking ---------------- */
  EC.modules.restraint = def({
    type: 'restraint', name: 'Early-age Restraint Cracking', cat: 'sls', prefix: 'RC', icon: 'drop', code: 'EN 1992-1-1 / EN 1992-3', mathcad: 'EC2_Concrete\\RestraintCracking_Design',
    groups: [
      { t: 'Element', f: [F('mode', 'Restraint', '', 'edge', [{ v: 'edge', l: 'Edge restraint (wall cast on base)' }, { v: 'end', l: 'End restraint (between rigid supports)' }]), F('L', 'Length L', 'm', 12), F('H', 'Height H', 'm', 3.0), F('t', 'Thickness', 'mm', 300), F('fck', 'Concrete class', '', 35, EC.CONC)] },
      { t: 'Thermal & shrinkage', f: [F('T1', 'Early-age temperature drop T_1', '°C', 22), F('T2', 'Long-term seasonal drop T_2', '°C', 15), F('alpha', 'Thermal expansion α_c', '×10⁻⁶/°C', 10), F('eca', 'Autogenous shrinkage ε_ca', '×10⁻⁶', 50), F('ecd', 'Drying shrinkage ε_cd', '×10⁻⁶', 200), F('K1', 'Creep factor K_1', '', 0.65)] },
      { t: 'Reinforcement (each face)', f: [F('phi', 'Horizontal ϕ', 'mm', 16, EC.barOpts), F('s', 'Spacing', 'mm', 150), F('c', 'Cover to bar', 'mm', 45), F('wlim', 'w_lim', 'mm', 0.2)] }
    ],
    schedCols: [['el', 'L × H × t'], ['bars', 'Horizontal EF'], ['wk', 'w_k (mm)']],
    sched: (i, r) => ({ el: `${i.L}×${i.H}×${i.t}`, bars: `H${i.phi}@${i.s}`, wk: r && r.wk ? r.wk.toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, 500);
      c.text('Early-age and long-term restraint cracking (EN 1992-3 Annex L / CIRIA C766 approach): restraint factor, restrained strain, tensile strain capacity, minimum steel at early-age f_ct, crack spacing and crack width.');
      c.h1('Restraint');
      const LH = i.L / i.H;
      const R = i.mode === 'end' ? 1.0 : EC.clamp(EC.interp([1, 2, 4, 8, 12], [0.25, 0.45, 0.6, 0.7, 0.75], LH), 0.2, 0.8);
      c.v({ l: 'Restraint factor at the joint', s: 'R', f: i.mode === 'end' ? 'end restraint 1.0' : 'edge restraint by L/H', n: `L/H = ${fmt(LH)}`, v: R, u: '', r: 'EN 1992-3 Annex L [practice]' });
      c.h1('Restrained strain');
      const ef = i.K1 * R * (i.alpha * i.T1 + +i.eca) * 1e-6;
      const elt = i.K1 * R * (i.alpha * (+i.T1 + +i.T2) + +i.eca + +i.ecd) * 1e-6;
      c.q('Early-age restrained strain', 'ε_r;ea', 'K_1 R (α T_1 + ε_ca)', ef * 1e6, '×10⁻⁶');
      c.q('Long-term restrained strain', 'ε_r;lt', 'K_1 R (α (T_1 + T_2) + ε_ca + ε_cd)', elt * 1e6, '×10⁻⁶', '', true);
      const fct3 = 0.6 * m.fctm, Ec3 = 0.85 * m.Ecm;
      const ectu = fct3 / Ec3 / 0.8;
      c.q('Tensile strain capacity (3 days)', 'ε_ctu', 'f_ctm(3d)/(0.8 E_c(3d))', ectu * 1e6, '×10⁻⁶');
      const cracks = elt > ectu;
      c.ok({ l: 'Cracking', cond: true, txt: cracks ? 'ε_r > ε_ctu: cracking expected - control by reinforcement' : 'ε_r ≤ ε_ctu: cracking unlikely', item: false });
      c.h1('Minimum reinforcement');
      const As = EC.barA(i.phi) * 1000 / i.s, hcef = Math.min(2.5 * (i.c + i.phi / 2), i.t / 2);
      const Amin = 1.0 * 1.0 * fct3 * hcef * 1000 / 500;
      c.c('Minimum steel each face', 'A_s;min', Amin, As, 'mm²/m', '7.3.2 (k_c = 1, f_ct;eff at 3 days)', 'Minimum steel');
      c.h1('Crack width');
      const rho = As / (hcef * 1000);
      const sr = 3.4 * i.c + 0.425 * 0.8 * 1.0 * i.phi / rho;
      const wk = sr * Math.max(cracks ? (i.mode === 'end' ? elt - 0.5 * ectu : elt - 0.5 * ectu) : 0, 0);
      c.q('Effective ratio', 'ρ_p;eff', 'A_s/(h_c;ef · 1000)', rho, '');
      c.q('Crack spacing', 's_r;max', '3.4 c + 0.425 k_1 ϕ/ρ', sr, 'mm');
      c.v({ l: 'Crack width', s: 'w_k', f: 's_r;max (ε_r − 0.5 ε_ctu)', v: wk, u: 'mm', key: true, r: 'EN 1992-3 Annex M [practice]' });
      c.c('Crack width', 'w_k/w_lim', wk, +i.wlim, 'mm', '[NDP]', 'Crack width');
      const ss = [100, 125, 150, 175, 200, 225, 250, 300].map(s => { const r2 = EC.barA(i.phi) * 1000 / s / (hcef * 1000); return [s, (3.4 * i.c + 0.34 * i.phi / r2) * Math.max(elt - 0.5 * ectu, 0)]; });
      const rp = []; for (let k = 0; k <= 10; k++) { const y = k / 10; rp.push([R * Math.max(0, 1 - y * (i.mode === 'end' ? 0 : 0.9)), y * i.H]); }
      const svg = EC.plot({ title: 'w_k vs bar spacing', xl: 's (mm)', yl: 'w_k (mm)', series: [{ name: 'w_k', pts: ss }, { name: 'w_lim', pts: [[100, +i.wlim], [300, +i.wlim]], cls: 1, dash: true }], legend: true }) + EC.plot({ title: 'Restraint over height (approx.)', xl: 'R', yl: 'height (m)', series: [{ name: 'R(y)', pts: rp, cls: 2 }] });
      return c.result({ spec: [['Element', `${i.L} × ${i.H} m, t = ${i.t} mm, ${i.mode} restraint`], ['Horizontal steel', `H${i.phi} @ ${i.s} each face`], ['Construction', 'limit pour length / sequence; consider GGBS or low-heat mix to reduce T_1']], bars: [], svg, wk });
    }
  });

  /* ---------------- Fire (tabulated data) ---------------- */
  const RC = [30, 60, 90, 120, 180, 240];
  const BSS = { 30: [[80, 25], [120, 20], [160, 15], [200, 15]], 60: [[120, 40], [160, 35], [200, 30], [300, 25]], 90: [[150, 55], [200, 45], [300, 40], [400, 35]], 120: [[200, 65], [240, 60], [300, 55], [500, 50]], 180: [[240, 80], [300, 70], [400, 65], [600, 60]], 240: [[280, 90], [350, 80], [500, 75], [700, 70]] };
  const BCO = { 30: [[80, 15], [160, 12], [200, 12]], 60: [[120, 25], [200, 12], [250, 12]], 90: [[150, 35], [250, 25], [300, 25]], 120: [[200, 45], [300, 35], [450, 35], [500, 30]], 180: [[240, 60], [400, 50], [550, 50], [600, 40]], 240: [[280, 75], [500, 60], [650, 60], [700, 50]] };
  const SLB = { 30: [60, 10, 10, 150, 10], 60: [80, 20, 10, 180, 15], 90: [100, 30, 15, 200, 25], 120: [120, 40, 20, 200, 35], 180: [150, 55, 30, 200, 45], 240: [175, 65, 40, 200, 50] };
  EC.modules.fire = def({
    type: 'fire', name: 'Fire Resistance (tabulated)', cat: 'sls', prefix: 'FR', icon: 'drop', code: 'EN 1992-1-2', mathcad: 'EC2_Concrete\\Fire_Design',
    groups: [
      { t: 'Element', f: [F('el', 'Element type', '', 'bss', [{ v: 'bss', l: 'Beam, simply supported' }, { v: 'bco', l: 'Beam, continuous' }, { v: 's1', l: 'Slab, one-way SS' }, { v: 's2', l: 'Slab, two-way SS' }, { v: 'sf', l: 'Flat slab' }, { v: 'col', l: 'Column (Method A)' }]), F('R', 'Required resistance R', 'min', 90, RC.map(v => ({ v, l: 'R' + v })))] },
      { t: 'Dimensions', f: [F('b', 'Width b (beam / column)', 'mm', 300), F('h', 'Depth h (column) / slab h_s', 'mm', 200), F('cnom', 'Cover to links / slab bars', 'mm', 30), F('phiw', 'Link ϕ (0 for slabs)', 'mm', 10), F('phi', 'Main bar ϕ', 'mm', 20)] },
      { t: 'Column (Method A)', f: [F('mufi', 'Load level μ_fi', '', 0.5), F('l0fi', 'Effective length in fire l_0;fi', 'm', 3.0), F('nbar', 'Number of bars', 'no', 8), F('omega', 'Mechanical ratio ω', '', 0.3)] }
    ],
    schedCols: [['el', 'Element'], ['R', 'R'], ['a', 'a (mm)'], ['Rv', 'Result']],
    sched: (i, r) => ({ el: i.el, R: 'R' + i.R, a: (+i.cnom + +i.phiw + i.phi / 2), Rv: r && r.ok ? 'OK' : 'NOT OK' }),
    calc(i) {
      const c = new EC.Calc(), R = +i.R;
      const a = +i.cnom + +i.phiw + i.phi / 2;
      c.text('Fire resistance by tabulated data (EN 1992-1-2:2004 Section 5, values as editable recommended data - verify against the 2023 edition and the National Annex). Axis distance a = c_nom + ϕ_w + ϕ/2.');
      c.q('Axis distance provided', 'a', 'c + ϕ_w + ϕ/2', a, 'mm', '', true);
      if (i.el === 'bss' || i.el === 'bco') {
        const tbl = (i.el === 'bss' ? BSS : BCO)[R];
        c.h1(`${i.el === 'bss' ? 'Simply supported' : 'Continuous'} beam R${R}`);
        c.tbl(['b_min (mm)', 'a (mm)'], tbl, 0);
        c.c('Minimum width', 'b_min', tbl[0][0], +i.b, 'mm', i.el === 'bss' ? 'Table 5.5' : 'Table 5.6', 'Beam width');
        const areq = EC.interp(tbl.map(r => r[0]), tbl.map(r => r[1]), +i.b);
        c.v({ l: 'Required axis distance (interpolated at b)', s: 'a_req', v: areq, u: 'mm' });
        c.c('Axis distance', 'a_req/a', areq, a, 'mm', i.el === 'bss' ? 'Table 5.5' : 'Table 5.6', 'Axis distance');
        c.note('Corner bars of single-layer beams: a_sd = a + 10 mm where b is below the value in column 4 of the table.');
      } else if (i.el[0] === 's') {
        const t = SLB[R];
        c.h1(`Slab R${R}`);
        const hmin = i.el === 'sf' ? t[3] : t[0], areq = i.el === 's1' ? t[1] : i.el === 's2' ? t[2] : t[4];
        c.c('Minimum thickness', 'h_s;min', hmin, +i.h, 'mm', i.el === 'sf' ? 'Table 5.9' : 'Table 5.8', 'Slab thickness');
        c.c('Axis distance', 'a_req', areq, a, 'mm', i.el === 'sf' ? 'Table 5.9' : 'Table 5.8', 'Axis distance');
      } else {
        c.h1(`Column Method A, R${R}`);
        const bp = 2 * i.b * i.h / (+i.b + +i.h);
        const acc = 0.85;
        const Re = 83 * (1 - i.mufi * (1 + +i.omega) / (0.85 / acc + +i.omega));
        const Ra = 1.6 * (a - 30), Rl = 9.6 * (5 - i.l0fi), Rb = 0.09 * bp, Rn = +i.nbar === 4 ? 0 : 12;
        const Rv = 120 * Math.pow(Math.max(0, Re + Ra + Rl + Rb + Rn) / 120, 1.8);
        c.q('', 'R_ηfi', '83(1 − μ_fi (1 + ω)/(0.85/α_cc + ω))', Re, ''); c.q('', 'R_a', '1.60 (a − 30)', Ra, ''); c.q('', 'R_l', '9.60 (5 − l_0;fi)', Rl, ''); c.q('', 'R_b', '0.09 b\',  b\' = 2A_c/(b + h)', Rb, ''); c.q('', 'R_n', '0 for 4 bars, 12 otherwise', Rn, '');
        c.v({ l: 'Fire resistance', s: 'R', f: '120 ((R_ηfi + R_a + R_l + R_b + R_n)/120)^1.8', v: Rv, u: 'min', key: true, r: '(5.7)' });
        c.c('Column fire resistance', 'R_req/R', R, Rv, 'min', '5.3.2', 'Column fire resistance');
        c.ok({ l: 'Validity', cond: a >= 25 && a <= 80 && i.l0fi >= 2 && i.l0fi <= 6 && bp >= 200 && bp <= 450, txt: '25 ≤ a ≤ 80, 2 ≤ l_0,fi ≤ 6 m, 200 ≤ b\' ≤ 450 mm', item: 'Method A validity' });
      }
      const pts = (BSS[R] || []).map(r => [r[0], r[1]]);
      const svg = i.el === 'bss' ? EC.plot({ title: `Beam R${R}: a_min vs b`, xl: 'b (mm)', yl: 'a (mm)', series: [{ name: 'a_min', pts }], points: [{ x: +i.b, y: a, t: 'provided', ok: a >= EC.interp(pts.map(p => p[0]), pts.map(p => p[1]), +i.b) }] }) : '';
      return c.result({ spec: [['Fire rating', `R${R}`], ['Axis distance', `a = ${a} mm`], ['Spalling', 'a > 70 mm: surface reinforcement mesh (4.5.2)']], bars: [], svg });
    }
  });

  /* ---------------- Tank wall strip ---------------- */
  const wk1 = (hD, h) => EC.interp([0.2, 35], [0.2, 0.05], hD / h);
  EC.modules.tankwall = def({
    type: 'tankwall', name: 'Tank Wall Strip (liquid retaining)', cat: 'sls', prefix: 'TW', icon: 'drop', code: 'EN 1992-3', mathcad: 'EC2_Concrete\\TankWall_Design',
    groups: [
      { t: 'Wall', f: [F('H', 'Liquid depth H', 'm', 4.0), F('t', 'Thickness', 'mm', 350), F('top', 'Top condition', '', 'free', [{ v: 'free', l: 'Free (cantilever)' }, { v: 'pin', l: 'Pinned / propped by roof slab' }]), F('gw', 'Liquid unit weight', 'kN/m³', 10), F('gF', 'Partial factor γ_F (liquid)', '', 1.2)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('c', 'Cover to bar axis', 'mm', 50), F('cls', 'Tightness class', '', 1, [{ v: 0, l: 'Class 0' }, { v: 1, l: 'Class 1' }, { v: 2, l: 'Class 2' }, { v: 3, l: 'Class 3' }])] },
      { t: 'Vertical reinforcement', f: [F('di', 'Inner face ϕ', 'mm', 20, EC.barOpts), F('si', 'Inner spacing', 'mm', 100), F('do', 'Outer face ϕ', 'mm', 12, EC.barOpts), F('so', 'Outer spacing', 'mm', 150)] }
    ],
    schedCols: [['H', 'H (m)'], ['t', 't'], ['in', 'Inner vert.'], ['out', 'Outer vert.'], ['cls', 'Class']],
    sched: i => ({ H: i.H, t: i.t, in: `H${i.di}@${i.si}`, out: `H${i.do}@${i.so}`, cls: i.cls }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), H = +i.H, g = +i.gw, t = +i.t;
      c.text('Liquid-retaining wall designed as a vertical 1 m strip under hydrostatic pressure (EN 1992-3): base moment and shear, ULS bending of both faces, SLS crack width against the tightness class limit, minimum compression zone for classes 2 / 3.');
      c.h1('Actions per metre');
      const cant = i.top === 'free';
      const Mb = cant ? g * H ** 3 / 6 : g * H ** 3 / 15, Vb = cant ? g * H * H / 2 : 0.4 * g * H * H, Ms = cant ? 0 : 0.0298 * g * H ** 3;
      c.q('Base moment (SLS, tension inner face)', 'm_base', cant ? 'γ H³/6' : 'γ H³/15', Mb, 'kNm/m', '', true);
      if (!cant) c.q('Span moment (tension outer face)', 'm_span', '0.0298 γ H³', Ms, 'kNm/m');
      c.q('Base shear', 'v_base', cant ? 'γ H²/2' : '0.4 γ H²', Vb, 'kN/m');
      c.h1('ULS');
      const di = t - i.c, Ai = EC.barA(i.di) * 1000 / i.si, Ao = EC.barA(i.do) * 1000 / i.so;
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: i.gF * Mb, b: 1000, d: di, As: Ai, m, barTxt: `H${i.di}@${i.si}`, tag: 'base', item: 'Base bending (inner face)' });
      if (!cant) EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: i.gF * Ms, b: 1000, d: t - i.c, As: Ao, m, barTxt: `H${i.do}@${i.so}`, tag: 'span', item: 'Span bending (outer face)' });
      const sh = EC.shearNoLinks(c, { V: i.gF * Vb, b: 1000, d: di, As: Ai, m });
      c.c('Base shear', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'Base shear');
      c.h1('SLS - tightness');
      const w = EC.crackW({ b: 1000, h: t, d: di, As: Ai, phi: +i.di, c: i.c - i.di / 2, M: Mb, fck: +i.fck });
      crackLines(c, i, w);
      const lim = +i.cls === 0 ? 0.2 : wk1(H, t / 1000);
      c.v({ l: 'Crack width limit', s: 'w_k1', f: +i.cls === 0 ? 'class 0: 0.2 (7.3.1)' : '0.2 (h_D/h ≤ 0.2) … 0.05 (h_D/h ≥ 35)', n: `h_D/h = ${fmt(H / (t / 1000))}`, v: lim, u: 'mm', r: 'EN 1992-3 7.3.1 [NDP]' });
      if (+i.cls <= 1) c.c('Crack width at base', 'w_k/w_k1', w.wk, lim, 'mm', 'EN 1992-3 7.3.1', 'Crack width (tightness)');
      else c.c('Compression zone (class 2/3)', 'x_min/x', Math.min(50, 0.2 * t), w.x, 'mm', 'EN 1992-3 7.3.1', 'Compression zone depth');
      c.c('Minimum steel each face', 'A_s;min', 0.5 * m.fctm * t * 1000 / 2 / 500, Math.min(Ai, Ao), 'mm²/m', '7.3.2 (k_c = 0.5 restraint)', 'Minimum steel');
      const ps = [], ms = [];
      for (let k = 0; k <= 30; k++) { const y = k / 30 * H, z = H - y; ps.push([g * z, y]); const Mx = cant ? -g * z ** 3 / 6 : (0.1 * g * H * H) * z - g * z ** 3 / 6; ms.push([Mx, y]); }
      const svg = EC.plot({ title: 'Pressure and moment over height', xl: 'p (kPa) / m (kNm/m)', yl: 'height above base (m)', series: [{ name: 'p', pts: ps, cls: 0 }, { name: 'm', pts: ms, cls: 1 }], legend: true });
      return c.result({ spec: [['Concrete', `${EC.concName(i.fck)} - watertight mix, w/c ≤ 0.5`], ['Wall', `t = ${t} mm, liquid depth ${H} m, tightness class ${i.cls}`], ['Vertical', `inner H${i.di}@${i.si}, outer H${i.do}@${i.so}`], ['Joints', 'waterstops at construction joints; base kicker cast with base']], bars: [], svg });
    }
  });

  /* ---------------- Tank panel (two-way, grillage analysis) ---------------- */
  /* grillage (Hambly): beams in x and y, DOFs w, φx = ∂w/∂x, φy = ∂w/∂y; E = 1, ν = 0.2 */
  EC.plateGrillage = function (o) {
    const { a, Hh, nx, ny, load, bc } = o;
    const dx = a / nx, dy = Hh / ny, nu = 0.2, G = 1 / (2 * (1 + nu)), t = 1;
    const id = (ix, iy) => (iy * (nx + 1) + ix) * 3;
    const N = (nx + 1) * (ny + 1) * 3;
    const K = Array.from({ length: N }, () => new Float64Array(N)), f = new Float64Array(N);
    const addBeam = (n1, n2, L, I, J, dirX) => {
      const EI = I, k = EI / L ** 3;
      const kb = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      const bd = dirX ? [n1, n1 + 1, n2, n2 + 1] : [n1, n1 + 2, n2, n2 + 2];
      for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) K[bd[r]][bd[s]] += k * kb[r][s];
      const td = dirX ? [n1 + 2, n2 + 2] : [n1 + 1, n2 + 1], kt = G * J / L;
      K[td[0]][td[0]] += kt; K[td[1]][td[1]] += kt; K[td[0]][td[1]] -= kt; K[td[1]][td[0]] -= kt;
    };
    for (let iy = 0; iy <= ny; iy++) { const wtr = (iy === 0 || iy === ny ? 0.5 : 1) * dy; for (let ix = 0; ix < nx; ix++) addBeam(id(ix, iy), id(ix + 1, iy), dx, wtr * t ** 3 / 12, wtr * t ** 3 / 6, true); }
    for (let ix = 0; ix <= nx; ix++) { const wtr = (ix === 0 || ix === nx ? 0.5 : 1) * dx; for (let iy = 0; iy < ny; iy++) addBeam(id(ix, iy), id(ix, iy + 1), dy, wtr * t ** 3 / 12, wtr * t ** 3 / 6, false); }
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) f[id(ix, iy)] = load(iy * dy) * (ix === 0 || ix === nx ? 0.5 : 1) * dx * (iy === 0 || iy === ny ? 0.5 : 1) * dy;
    const fix = new Set();
    for (let ix = 0; ix <= nx; ix++) { fix.add(id(ix, 0)); fix.add(id(ix, 0) + 1); if (bc.base === 'fixed') fix.add(id(ix, 0) + 2); if (bc.top === 'pin' || bc.top === 'fixed') { fix.add(id(ix, ny)); fix.add(id(ix, ny) + 1); } if (bc.top === 'fixed') fix.add(id(ix, ny) + 2); }
    for (let iy = 0; iy <= ny; iy++) [0, nx].forEach(ix => { fix.add(id(ix, iy)); fix.add(id(ix, iy) + 2); if (bc.sides === 'fixed') fix.add(id(ix, iy) + 1); });
    const free = []; for (let k = 0; k < N; k++) if (!fix.has(k)) free.push(k);
    const n = free.length, A = free.map(r => Float64Array.from(free.map(s => K[r][s]))), bb = Float64Array.from(free.map(r => f[r]));
    for (let p = 0; p < n; p++) { let mx = p; for (let r = p + 1; r < n; r++) if (Math.abs(A[r][p]) > Math.abs(A[mx][p])) mx = r; [A[p], A[mx]] = [A[mx], A[p]]; [bb[p], bb[mx]] = [bb[mx], bb[p]]; const pv = A[p][p]; for (let r = p + 1; r < n; r++) { const q = A[r][p] / pv; if (!q) continue; const Ar = A[r], Ap = A[p]; for (let s = p; s < n; s++) Ar[s] -= q * Ap[s]; bb[r] -= q * bb[p]; } }
    const xsol = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let s = bb[r]; for (let q = r + 1; q < n; q++) s -= A[r][q] * xsol[q]; xsol[r] = s / A[r][r]; }
    const u = new Float64Array(N); free.forEach((k, j) => { u[k] = xsol[j]; });
    const D = 1 / 12;
    const curv = (w1, t1, w2, t2, L, end) => end === 0 ? (-6 * w1 - 4 * L * t1 + 6 * w2 - 2 * L * t2) / (L * L) : (6 * w1 + 2 * L * t1 - 6 * w2 + 4 * L * t2) / (L * L);
    const my = (ix, iy) => { const v = []; if (iy < ny) v.push(curv(u[id(ix, iy)], u[id(ix, iy) + 2], u[id(ix, iy + 1)], u[id(ix, iy + 1) + 2], dy, 0)); if (iy > 0) v.push(curv(u[id(ix, iy - 1)], u[id(ix, iy - 1) + 2], u[id(ix, iy)], u[id(ix, iy) + 2], dy, 1)); return -D * v.reduce((s, q) => s + q, 0) / v.length; };
    const mx = (ix, iy) => { const v = []; if (ix < nx) v.push(curv(u[id(ix, iy)], u[id(ix, iy) + 1], u[id(ix + 1, iy)], u[id(ix + 1, iy) + 1], dx, 0)); if (ix > 0) v.push(curv(u[id(ix - 1, iy)], u[id(ix - 1, iy) + 1], u[id(ix, iy)], u[id(ix, iy) + 1], dx, 1)); return -D * v.reduce((s, q) => s + q, 0) / v.length; };
    let r = { myMin: 0, myMax: 0, mxMin: 0, mxMax: 0, wMax: 0 };
    const prof = [];
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const a1 = my(ix, iy), b1 = mx(ix, iy);
      r.myMin = Math.min(r.myMin, a1); r.myMax = Math.max(r.myMax, a1); r.mxMin = Math.min(r.mxMin, b1); r.mxMax = Math.max(r.mxMax, b1); r.wMax = Math.max(r.wMax, u[id(ix, iy)]);
    }
    for (let iy = 0; iy <= ny; iy++) prof.push([iy * dy, my(nx / 2, iy), mx(nx / 2, iy), mx(0, iy)]);
    return Object.assign(r, { prof, myBase: my(nx / 2, 0), mxEdge: Math.min(...Array.from({ length: ny + 1 }, (_, iy) => mx(0, iy))) });
  };
  EC.modules.tankpanel = def({
    type: 'tankpanel', name: 'Tank Wall Panel (two-way)', cat: 'sls', prefix: 'TP', icon: 'drop', code: 'EN 1992-3', mathcad: 'EC2_Concrete\\TankPanel_Design',
    groups: [
      { t: 'Panel', f: [F('a', 'Panel width a', 'm', 6.0), F('H', 'Panel height = liquid depth H', 'm', 4.0), F('t', 'Thickness', 'mm', 300), F('top', 'Top edge', '', 'free', [{ v: 'free', l: 'Free' }, { v: 'pin', l: 'Pinned' }]), F('sides', 'Vertical edges', '', 'fixed', [{ v: 'fixed', l: 'Fixed (continuous / corner)' }, { v: 'pin', l: 'Pinned' }]), F('base', 'Base', '', 'fixed', [{ v: 'fixed', l: 'Fixed' }, { v: 'pin', l: 'Pinned' }])] },
      { t: 'Materials & loads', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('c', 'Cover to bar axis', 'mm', 50), F('gw', 'Liquid unit weight', 'kN/m³', 10), F('gF', 'γ_F (liquid)', '', 1.2), F('cls', 'Tightness class', '', 1, [{ v: 0, l: 'Class 0' }, { v: 1, l: 'Class 1' }])] },
      { t: 'Reinforcement (inner face = tension at supports)', f: [F('dv', 'Vertical inner ϕ', 'mm', 16, EC.barOpts), F('sv', 'spacing', 'mm', 150), F('dh', 'Horizontal inner ϕ', 'mm', 16, EC.barOpts), F('sh', 'spacing', 'mm', 150), F('do', 'Outer face ϕ (both ways)', 'mm', 12, EC.barOpts), F('so', 'spacing', 'mm', 200)] }
    ],
    schedCols: [['p', 'a × H'], ['t', 't'], ['v', 'Vert. inner'], ['h', 'Hor. inner'], ['o', 'Outer']],
    sched: i => ({ p: `${i.a}×${i.H}`, t: i.t, v: `H${i.dv}@${i.sv}`, h: `H${i.dh}@${i.sh}`, o: `H${i.do}@${i.so}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), H = +i.H, a = +i.a, t = +i.t, g = +i.gw;
      c.text('Two-way liquid-retaining wall panel under hydrostatic pressure. Moments come from a grillage (Hambly) analysis of the plate run in the browser - 12 × 12 grid, ν = 0.2, accuracy about ±10 % - then ULS bending and tightness crack width at the base, the vertical edges and in the span.');
      c.h1('Plate analysis');
      const nx = 12, ny = 12;
      const R = EC.plateGrillage({ a, Hh: H, nx, ny, load: y => g * Math.max(H - y, 0), bc: { top: i.top, sides: i.sides, base: i.base } });
      const coef = v => v / (g * H ** 3);
      c.tbl(['Location', 'm (kNm/m)', 'm/(γH³)', 'Tension face'], [['Vertical, base (mid-width)', R.myBase, coef(R.myBase), R.myBase < 0 ? 'inner' : 'outer'], ['Vertical, max span', R.myMax, coef(R.myMax), 'outer'], ['Horizontal, at vertical edge', R.mxEdge, coef(R.mxEdge), 'inner'], ['Horizontal, max span', R.mxMax, coef(R.mxMax), 'outer']], [0, 2, 4, 0]);
      c.note(`a/H = ${fmt(a / H)}; signs: negative = tension on the liquid (inner) face.`);
      const dI = t - i.c;
      const Av = EC.barA(i.dv) * 1000 / i.sv, Ah = EC.barA(i.dh) * 1000 / i.sh, Ao = EC.barA(i.do) * 1000 / i.so;
      c.h1('ULS bending');
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: i.gF * Math.abs(Math.min(R.myBase, R.myMin)), b: 1000, d: dI, As: Av, m, barTxt: `H${i.dv}@${i.sv}`, tag: 'v', item: 'Vertical moment at base' });
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: i.gF * Math.abs(R.mxMin), b: 1000, d: dI - i.dv, As: Ah, m, barTxt: `H${i.dh}@${i.sh}`, tag: 'h', item: 'Horizontal moment at edge' });
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: i.gF * Math.max(R.myMax, R.mxMax), b: 1000, d: dI, As: Ao, m, barTxt: `H${i.do}@${i.so}`, tag: 'span', item: 'Span moment (outer face)' });
      c.h1('Tightness');
      const lim = +i.cls === 0 ? 0.2 : wk1(H, t / 1000);
      c.q('Crack width limit', 'w_k1', '', lim, 'mm', 'EN 1992-3 7.3.1');
      const w1 = EC.crackW({ b: 1000, h: t, d: dI, As: Av, phi: +i.dv, c: i.c - i.dv / 2, M: Math.abs(R.myBase), fck: +i.fck });
      const w2 = EC.crackW({ b: 1000, h: t, d: dI - i.dv, As: Ah, phi: +i.dh, c: i.c - i.dh / 2 + +i.dv, M: Math.abs(R.mxMin), fck: +i.fck });
      c.c('Crack width at base (vertical bars)', 'w_k', w1.wk, lim, 'mm', 'EN 1992-3', 'Crack width at base');
      c.c('Crack width at edge (horizontal bars)', 'w_k', w2.wk, lim, 'mm', 'EN 1992-3', 'Crack width at vertical edge');
      const svg = EC.plot({ title: 'Moments at mid-width / edge vs height', xl: 'm (kNm/m)', yl: 'height (m)', series: [{ name: 'm_y mid', pts: R.prof.map(p => [p[1], p[0]]) }, { name: 'm_x mid', pts: R.prof.map(p => [p[2], p[0]]), cls: 1 }, { name: 'm_x edge', pts: R.prof.map(p => [p[3], p[0]]), cls: 2, dash: true }], legend: true });
      return c.result({ spec: [['Panel', `${a} × ${H} m, t = ${t} mm; top ${i.top}, sides ${i.sides}, base ${i.base}`], ['Inner face', `vertical H${i.dv}@${i.sv}, horizontal H${i.dh}@${i.sh}`], ['Outer face', `H${i.do}@${i.so} both ways`], ['Analysis', 'grillage 12 × 12 in browser - refine with FE for openings or irregular panels']], bars: [], svg });
    }
  });
})();
