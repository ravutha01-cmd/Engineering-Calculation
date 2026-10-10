/* EC1 actions 1: wind on buildings / canopies / portals, imposed loads, self weight, vehicle impact, execution loads, thermal (roof slab) */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt, W = EC.wind;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}), icon: 'wind', cat: 'actions' }, o);
  const windIn = (h) => [F('vb0', 'Fundamental basic wind speed v_b,0', 'm/s', 30), F('cdir', 'c_dir × c_season', '', 1.0), F('cat', 'Terrain category', '', 'III', EC.TERRAIN), F('co', 'Orography factor c_o', '', 1.0)];
  /* EN 1991-1-4 Table 7.1 vertical walls, cpe,10 */
  const WALL = { h: [0.25, 1, 5], A: [-1.2, -1.2, -1.2], B: [-0.8, -0.8, -0.8], C: [-0.5, -0.5, -0.5], D: [0.7, 0.8, 0.8], E: [-0.3, -0.5, -0.7] };
  const wallCp = hd => { const o = {}; ['A', 'B', 'C', 'D', 'E'].forEach(z => { o[z] = EC.interp(WALL.h, WALL[z], hd); }); return o; };

  /* ---------------- Wind on a rectangular building ---------------- */
  EC.modules.windbuilding = def({
    type: 'windbuilding', name: 'Wind on Building', prefix: 'WB', code: 'EN 1991-1-4:2024', mathcad: 'EC1_Actions\\Wind_Building_Design',
    groups: [
      { t: 'Building', f: [F('h', 'Height h', 'm', 24), F('b', 'Width b (crosswind)', 'm', 30), F('d', 'Depth d (in wind direction)', 'm', 18), F('cscd', 'Structural factor c_s c_d', '', 1.0), F('cpi', 'Internal pressure c_pi (±)', '', 0.2), F('nst', 'Storeys (for strip forces)', 'no', 8)] },
      { t: 'Wind', f: windIn() }
    ],
    schedCols: [['geo', 'h × b × d'], ['qp', 'q_p(h) kPa'], ['V', 'V_base (kN)']],
    sched: (i, r) => ({ geo: `${i.h}×${i.b}×${i.d}`, qp: r && r.qp ? r.qp.toFixed(2) : '', V: r && r.V ? Math.round(r.V) : '' }),
    calc(i) {
      const c = new EC.Calc(), h = +i.h, b = +i.b, d = +i.d;
      c.text('Wind actions on a rectangular building (EN 1991-1-4): basic wind velocity, peak velocity pressure profile, reference heights z_e, external pressure coefficients for walls (zones A–E) and flat roof (F–I), internal pressure, global base shear and overturning moment.');
      c.h1('Basic wind');
      const vb = i.vb0 * i.cdir;
      c.q('Basic wind velocity', 'v_b', 'c_dir c_season v_b,0', vb, 'm/s', '4.2 [NDP]', true);
      c.q('Basic velocity pressure', 'q_b', '½ ρ v_b²', 0.5 * 1.25 * vb * vb / 1000, 'kPa');
      c.h1('Peak velocity pressure at h');
      const w = W.qpLines(c, h, vb, i.cat, +i.co);
      c.h1('Reference heights (Fig. 7.4)');
      const strips = h <= b ? [[0, h, h]] : h <= 2 * b ? [[0, b, b], [b, h, h]] : (() => { const s = [[0, b, b]]; const n = Math.max(1, Math.ceil((h - 2 * b) / b)); for (let k = 0; k < n; k++) { const z1 = b + k * (h - 2 * b) / n, z2 = b + (k + 1) * (h - 2 * b) / n; s.push([z1, z2, z2]); } s.push([h - b, h, h]); return s; })();
      c.tbl(['strip from (m)', 'to (m)', 'z_e (m)', 'q_p(z_e) (kPa)'], strips.map(s => [s[0], s[1], s[2], W.qp(s[2], vb, i.cat, +i.co).qp]), [1, 1, 1, 3]);
      c.h1('Walls (Table 7.1)');
      const hd = h / d, cp = wallCp(hd), e = Math.min(b, 2 * h);
      c.q('Ratio', 'h/d', '', hd, ''); c.q('Zone parameter', 'e', 'min(b, 2h)', e, 'm');
      c.tbl(['Zone', 'c_pe,10', 'w_e = q_p c_pe (kPa)'], ['A', 'B', 'C', 'D', 'E'].map(z => [z, cp[z], w.qp * cp[z]]), [0, 2, 3]);
      c.h1('Flat roof, sharp eaves (Table 7.2)');
      c.tbl(['Zone', 'c_pe,10', 'w_e (kPa)'], [['F', -1.8], ['G', -1.2], ['H', -0.7], ['I', '±0.2']].map(r => [r[0], r[1], typeof r[1] === 'number' ? r[1] * w.qp : '±' + fmt(0.2 * w.qp, 2)]), [0, 2, 3]);
      c.q('Net cladding suction, zone A with c_pi = +' + i.cpi, 'w_net', 'q_p (c_pe − c_pi)', w.qp * (cp.A - i.cpi), 'kPa', '7.2.9', true);
      c.h1('Global forces');
      const fcorr = EC.interp([1, 5], [0.85, 1.0], hd);
      c.q('Lack of correlation factor', 'f', 'h/d ≤ 1: 0.85, ≥ 5: 1.0', fcorr, '', '7.2.2(3)');
      let V = 0, M = 0; const rows = [], prof = [];
      const nst = Math.max(1, Math.round(i.nst)), hs = h / nst;
      for (let k = 0; k < nst; k++) {
        const z = (k + 0.5) * hs, s = strips.find(t => z >= t[0] && z <= t[1]) || strips[strips.length - 1];
        const q = W.qp(s[2], vb, i.cat, +i.co).qp, Fk = i.cscd * fcorr * q * (cp.D - cp.E) * b * hs;
        V += Fk; M += Fk * z; rows.push([k + 1, z, q, Fk]); prof.push([q, z]);
      }
      c.tbl(['storey', 'z (m)', 'q_p(z_e)', 'F_w (kN)'], rows, [0, 1, 3, 1]);
      c.v({ l: 'Base shear', s: 'V_b', f: 'Σ c_s c_d f q_p(z_e)(c_pe,D − c_pe,E) b Δh', v: V, u: 'kN', key: true });
      c.v({ l: 'Overturning moment', s: 'M_b', f: 'Σ F_w z', v: M, u: 'kNm', key: true });
      c.q('Resultant height', 'z_res', 'M_b/V_b', M / V, 'm');
      const pp = []; for (let z = 1; z <= h; z += h / 30) pp.push([W.qp(z, vb, i.cat, +i.co).qp, z]);
      const svg = EC.plot({ title: 'q_p(z) profile', xl: 'q_p (kPa)', yl: 'z (m)', series: [{ name: 'q_p(z)', pts: pp }, { name: 'q_p(z_e)', pts: prof, cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Wind', `v_b = ${fmt(vb, 1)} m/s, terrain ${i.cat}, q_p(h) = ${fmt(w.qp, 3)} kPa`], ['Global', `V_b = ${fmt(V, 0)} kN, M_b = ${fmt(M, 0)} kNm`], ['Cladding', `design zone A net ${fmt(w.qp * (cp.A - i.cpi), 2)} kPa`]], bars: [], svg, qp: w.qp, V });
    }
  });

  /* ---------------- Canopy / signboard ---------------- */
  const CAN = { a: [0, 5, 10, 15, 20, 25, 30], cfp: [0.2, 0.4, 0.5, 0.7, 0.8, 1.0, 1.2], cf0: [-0.5, -0.7, -0.9, -1.1, -1.3, -1.6, -1.8], cf1: [-1.3, -1.4, -1.4, -1.4, -1.4, -1.4, -1.4], Ap: [0.5, 0.8, 1.2, 1.4, 1.7, 2.0, 2.2], Bp: [1.8, 2.1, 2.4, 2.7, 2.9, 3.1, 3.2], Cp: [1.1, 1.3, 1.6, 1.8, 2.1, 2.3, 2.4], A0: [-0.6, -1.1, -1.5, -1.8, -2.2, -2.6, -3.0], B0: [-1.3, -1.7, -2.0, -2.4, -2.8, -3.2, -3.8], C0: [-1.4, -1.8, -2.1, -2.5, -2.9, -3.2, -3.6], A1: [-1.5, -1.6, -1.6, -1.6, -1.6, -1.5, -1.5], B1: [-1.8, -2.2, -2.6, -2.9, -2.9, -2.5, -2.2], C1: [-2.2, -2.5, -2.7, -3.0, -3.0, -2.8, -2.7] };
  EC.modules.windcanopy = def({
    type: 'windcanopy', name: 'Wind on Canopy / Signboard', prefix: 'WC', code: 'EN 1991-1-4:2024', mathcad: 'EC1_Actions\\Wind_Canopy_Signboard_Design',
    groups: [
      { t: 'Structure', f: [F('kind', 'Structure', '', 'canopy', [{ v: 'canopy', l: 'Monopitch free-standing canopy' }, { v: 'sign', l: 'Free-standing signboard' }]), F('b', 'Width b', 'm', 12), F('d', 'Depth d (canopy) / height h_s (sign)', 'm', 6), F('z', 'Height to top', 'm', 5), F('alpha', 'Canopy pitch α', '°', 10), F('phi', 'Blockage φ (0 … 1)', '', 0.0), F('G', 'Permanent weight (canopy roof / sign)', 'kN', 60)] },
      { t: 'Supports', f: [F('ncol', 'Number of columns / posts', 'no', 4), F('Bf', 'Pad footing size (square)', 'm', 1.8), F('Df', 'Footing depth', 'm', 1.2)] },
      { t: 'Wind', f: windIn() }
    ],
    schedCols: [['kind', 'Type'], ['size', 'b × d'], ['F', 'F_w (kN)']],
    sched: (i, r) => ({ kind: i.kind, size: `${i.b}×${i.d}`, F: r && r.Fw ? Math.round(r.Fw) : '' }),
    calc(i) {
      const c = new EC.Calc(), b = +i.b, d = +i.d, vb = i.vb0 * i.cdir;
      c.text(i.kind === 'canopy' ? 'Free-standing monopitch canopy (EN 1991-1-4 Table 7.6): overall force coefficients and net pressure zones A/B/C interpolated in pitch α and blockage φ, resultant at d/4, column uplift and holding-down, pad footing overturning.' : 'Free-standing signboard (7.4.3): c_f = 1.8 at z_e = z_g + h/2, eccentricity ±0.25 b with torsion, post base moment, pad footing overturning and sliding.');
      const w = W.qpLines(c, +i.z, vb, i.cat, +i.co);
      let Fw, Fh = 0, ecc;
      if (i.kind === 'canopy') {
        c.h1('Coefficients (Table 7.6) [verify]');
        const a = EC.clamp(+i.alpha, 0, 30), ip = k => EC.interp(CAN.a, CAN[k], a), ph = EC.clamp(+i.phi, 0, 1);
        const cfu = ip('cfp'), cfd = ip('cf0') + ph * (ip('cf1') - ip('cf0'));
        c.tbl(['', 'c_f', 'A', 'B', 'C'], [['max (downward)', cfu, ip('Ap'), ip('Bp'), ip('Cp')], [`min (upward), φ = ${ph}`, cfd, ip('A0') + ph * (ip('A1') - ip('A0')), ip('B0') + ph * (ip('B1') - ip('B0')), ip('C0') + ph * (ip('C1') - ip('C0'))]], [0, 2, 2, 2, 2]);
        const Aref = b * d / Math.cos(EC.rad(a));
        const Fd = cfu * w.qp * Aref, Fu = cfd * w.qp * Aref;
        c.q('Downward resultant', 'F_w;down', 'c_f q_p A_ref', Fd, 'kN'); c.q('Upward resultant', 'F_w;up', '', Fu, 'kN', '', true);
        c.q('Friction (7.3(?))', 'F_fr', '0.04 q_p 2 b d', 0.04 * w.qp * 2 * b * d, 'kN');
        Fw = Math.abs(Fu); ecc = d / 4; Fh = 0.04 * w.qp * 2 * b * d;
        const Tcol = (1.5 * Math.abs(Fu) - 0.9 * i.G) / i.ncol;
        c.v({ l: 'Net uplift per column (1.5 W − 0.9 G)', s: 'T_col', v: Math.max(Tcol, 0), u: 'kN', key: true, n: 'resultant at d/4 adds ± moment: worst column below' });
        c.q('Worst column uplift with eccentricity d/4', 'T_col;max', 'T + F e/(d ncol/2)', Math.max(0, Tcol + 1.5 * Math.abs(Fu) * (d / 4) / (d * i.ncol / 2)), 'kN');
      } else {
        c.h1('Signboard (7.4.3)');
        const hs = d, ze = i.z - hs / 2;
        const qz = W.qp(ze, vb, i.cat, +i.co).qp;
        Fw = 1.8 * qz * b * hs; ecc = 0.25 * b; Fh = Fw;
        c.q('Reference height', 'z_e', 'z_g + h/2', ze, 'm'); c.q('', 'q_p(z_e)', '', qz, 'kPa');
        c.v({ l: 'Wind force', s: 'F_w', f: '1.8 q_p(z_e) b h', v: Fw, u: 'kN', key: true });
        c.q('Torsion from eccentricity ±0.25 b', 'T', 'F_w · 0.25 b', Fw * ecc, 'kNm');
        const Mpost = 1.5 * Fw * ze / i.ncol;
        c.v({ l: 'Post base moment (ULS)', s: 'M_Ed', f: '1.5 F_w z_e/n', v: Mpost, u: 'kNm', key: true });
      }
      c.h1('Footing overturning (EQU)');
      const Bf = +i.Bf, Gf = 25 * Bf * Bf * 0.8 + 18 * Bf * Bf * (i.Df - 0.8);
      const Mdst = 1.5 * (i.kind === 'sign' ? Fw / i.ncol * (i.z - d / 2 + +i.Df) : Fh / i.ncol * (i.z + +i.Df) + Math.abs(Fw) * 0.25 * d / i.ncol);
      const Mstb = 0.9 * (Gf + i.G / i.ncol) * Bf / 2;
      c.c('Overturning per footing', 'M_dst/M_stb', Mdst, Mstb, 'kNm', 'EN 1990 EQU', 'Footing overturning');
      c.c('Sliding per footing', 'H/(0.9 V tan 30°)', 1.5 * Fh / i.ncol, 0.9 * (Gf + i.G / i.ncol) * Math.tan(EC.rad(30)), 'kN', '[practice]', 'Footing sliding');
      return c.result({ spec: [['Structure', `${i.kind}, ${b} × ${d} m, top at ${i.z} m`], ['Wind', `q_p = ${fmt(w.qp, 3)} kPa, F_w = ${fmt(Fw, 0)} kN`], ['Footings', `${Bf} m square × ${i.Df} m deep, ${i.ncol} no.`]], bars: [], svg: '', Fw });
    }
  });

  /* ---------------- Portal frame building ---------------- */
  const R0 = { a: [5, 15, 30, 45], F: [-1.7, -0.9, -0.5, 0.0], G: [-1.2, -0.8, -0.5, 0.0], H: [-0.6, -0.3, -0.2, 0.0], I: [-0.6, -0.4, -0.4, -0.2], J: [0.2, -1.0, -0.5, -0.3], Fp: [0.0, 0.2, 0.7, 0.7], Gp: [0.0, 0.2, 0.7, 0.7], Hp: [0.0, 0.2, 0.4, 0.6] };
  const R90 = { a: [5, 15, 30, 45], F: [-1.6, -1.3, -1.1, -1.1], G: [-1.3, -1.3, -1.4, -1.4], H: [-0.7, -0.6, -0.8, -0.9], I: [-0.6, -0.5, -0.5, -0.5] };
  EC.modules.windportal = def({
    type: 'windportal', name: 'Wind on Portal Frame Building', prefix: 'WP', code: 'EN 1991-1-4:2024', mathcad: 'EC1_Actions\\Wind_Portal_Design',
    groups: [
      { t: 'Building', f: [F('he', 'Eaves height', 'm', 7), F('span', 'Span (gable width)', 'm', 30), F('len', 'Length', 'm', 60), F('alpha', 'Roof pitch α', '°', 10), F('fs', 'Frame spacing', 'm', 6), F('gk', 'Roof dead load', 'kPa', 0.35)] },
      { t: 'Wind', f: windIn().concat([F('cpi1', 'c_pi (pressure)', '', 0.2), F('cpi2', 'c_pi (suction)', '', -0.3)]) }
    ],
    schedCols: [['geo', 'span × len'], ['qp', 'q_p'], ['up', 'Uplift/base (kN)']],
    sched: (i, r) => ({ geo: `${i.span}×${i.len}`, qp: r && r.qp ? r.qp.toFixed(2) : '', up: r && r.up ? Math.round(r.up) : '' }),
    calc(i) {
      const c = new EC.Calc(), a = EC.clamp(+i.alpha, 5, 45), sp = +i.span, hr = i.he + sp / 2 * Math.tan(EC.rad(a)), vb = i.vb0 * i.cdir;
      c.text('Duopitch portal frame building: q_p at ridge height, wall zones A–E (Table 7.1), roof zones F–J for θ = 0° (Table 7.4a, suction and pressure sets) and F–I for θ = 90° (Table 7.4b) interpolated in α, internal pressure, line loads on an internal frame, uplift and holding-down.');
      c.q('Ridge height', 'h', 'h_e + (span/2) tan α', hr, 'm');
      const w = W.qpLines(c, hr, vb, i.cat, +i.co);
      const ip = (t, k) => EC.interp(t.a, t[k], a);
      c.h1('Roof coefficients');
      c.tbl(['θ', 'F', 'G', 'H', 'I', 'J'], [['0° suction', ip(R0, 'F'), ip(R0, 'G'), ip(R0, 'H'), ip(R0, 'I'), ip(R0, 'J')], ['0° pressure', ip(R0, 'Fp'), ip(R0, 'Gp'), ip(R0, 'Hp'), ip(R0, 'I'), ip(R0, 'J')], ['90°', ip(R90, 'F'), ip(R90, 'G'), ip(R90, 'H'), ip(R90, 'I'), '–']], [0, 2, 2, 2, 2, 2]);
      c.note('Table 7.4a/b values (EN 1991-1-4:2005 form) [verify against the 2024 tables].');
      const cpW = wallCp(hr / sp);
      c.h1('Internal frame, wind across (θ = 0°), c_pi = ' + i.cpi2);
      const q = w.qp, s = +i.fs;
      const wD = q * (cpW.D - i.cpi2) * s, wE = q * (cpW.E - i.cpi2) * s, wG = q * (ip(R0, 'H') - i.cpi2) * s, wJ = q * (ip(R0, 'I') - i.cpi2) * s;
      c.tbl(['Member', 'zone', 'w (kN/m, + = towards surface)'], [['Windward column', 'D', wD], ['Leeward column', 'E', wE], ['Windward rafter', 'H', wG], ['Leeward rafter', 'I', wJ]], [0, 0, 2]);
      c.h1('Uplift (θ = 90°, c_pi = +' + i.cpi1 + ')');
      const roofA = sp / Math.cos(EC.rad(a)) * s;
      const cpm = ip(R90, 'H') - i.cpi1;
      const Up = q * cpm * roofA, Gd = 0.9 * i.gk * roofA;
      c.q('Net roof uplift per frame', 'W_up', 'q_p (c_pe,H − c_pi) A', Up, 'kN');
      const base = Math.max(0, (1.5 * Math.abs(Up) - Gd) / 2);
      c.v({ l: 'Holding-down tension per base', s: 'T_base', f: '(1.5 |W_up| − 0.9 G)/2', v: base, u: 'kN', key: true });
      const H0 = (Math.abs(wD) + Math.abs(wE)) * i.he / 2 * 1.5;
      c.v({ l: 'Horizontal base shear per base (approx.)', s: 'H_base', f: '1.5 (|w_D| + |w_E|) h_e/2 / 2', v: H0 / 2, u: 'kN', key: true });
      c.h1('Purlins / sheeting');
      c.q('Zone F local suction (cladding)', 'w_F', 'q_p (c_pe,F − c_pi,pressure)', q * (ip(R0, 'F') - i.cpi1), 'kPa', '', true);
      const sk = 40, H = hr * sk / 3;
      const svg = EC.sketch(520, 200, 'FRAME AND WIND LOADS (θ = 0°)', [{ c: 'edge', l: [[60, 170], [60, 170 - i.he * 6], [60 + sp * 6, 170 - i.he * 6 - sp / 2 * Math.tan(EC.rad(a)) * 6 + sp * 0], [60 + sp * 6, 170 - i.he * 6]] }, { c: 'edge', l: [[60, 170 - i.he * 6], [60 + sp * 3, 170 - hr * 6], [60 + sp * 6, 170 - i.he * 6], [60 + sp * 6, 170]] }, { t: [20, 170 - i.he * 3, `${fmt(wD, 1)}`] }, { t: [70 + sp * 6, 170 - i.he * 3, `${fmt(wE, 1)} kN/m`] }]);
      return c.result({ spec: [['Building', `span ${sp} m, eaves ${i.he} m, pitch ${i.alpha}°, frames @ ${s} m`], ['Wind', `q_p(h) = ${fmt(q, 3)} kPa`], ['Holding-down', `${fmt(base, 0)} kN tension per base`]], bars: [], svg, qp: q, up: base });
    }
  });

  /* ---------------- Imposed loads + take-down ---------------- */
  const CAT = { A: [2.0, 2.0, 0.7, 0.5, 0.3], B: [3.0, 4.5, 0.7, 0.5, 0.3], C1: [3.0, 4.0, 0.7, 0.7, 0.6], C2: [4.0, 4.0, 0.7, 0.7, 0.6], C3: [5.0, 4.0, 0.7, 0.7, 0.6], C4: [5.0, 7.0, 0.7, 0.7, 0.6], C5: [5.0, 4.5, 0.7, 0.7, 0.6], D1: [4.0, 4.0, 0.7, 0.7, 0.6], D2: [5.0, 7.0, 0.7, 0.7, 0.6], E1: [7.5, 7.0, 1.0, 0.9, 0.8], F: [2.5, 20, 0.7, 0.7, 0.6], G: [5.0, 90, 0.7, 0.5, 0.3], H: [0.4, 1.0, 0, 0, 0] };
  EC.modules.imposed = def({
    type: 'imposed', name: 'Imposed Loads & Take-down', prefix: 'IL', code: 'prEN 1991-1-1:2023 / EN 1990', mathcad: 'EC1_Actions\\Imposed_Loads_Design', lib: ['EC1_Actions\\TallBuilding_Design'],
    groups: [
      { t: 'Floor', f: [F('cat', 'Use category', '', 'B', Object.keys(CAT).map(v => ({ v, l: `${v} - q_k ${CAT[v][0]} kPa, Q_k ${CAT[v][1]} kN` }))), F('part', 'Movable partitions self weight', 'kN/m', 1.0, [{ v: 0, l: 'None' }, { v: 1.0, l: '≤ 1.0 kN/m (q = 0.5)' }, { v: 2.0, l: '≤ 2.0 kN/m (q = 0.8)' }, { v: 3.0, l: '≤ 3.0 kN/m (q = 1.2)' }]), F('gk', 'Floor permanent g_k (incl. SW)', 'kPa', 7.0)] },
      { t: 'Column take-down', f: [F('A', 'Tributary area per floor', 'm²', 56), F('n', 'Floors supported', 'no', 10), F('NRd', 'Column N_Rd (ground)', 'kN', 12000), F('red', 'Reduction', '', 'n', [{ v: 'n', l: 'α_n (storeys)' }, { v: 'A', l: 'α_A (area)' }, { v: 'none', l: 'None' }])] }
    ],
    schedCols: [['cat', 'Category'], ['q', 'q_k + partitions'], ['N', 'N_Ed (kN)']],
    sched: (i, r) => ({ cat: i.cat, q: r && r.qt ? r.qt.toFixed(2) : '', N: r && r.N ? Math.round(r.N) : '' }),
    calc(i) {
      const c = new EC.Calc(), k = CAT[i.cat];
      c.text('Imposed loads on floors (prEN 1991-1-1:2023 / EN 1991-1-1 Table 6.2 recommended values - editable NDPs): category q_k / Q_k / ψ, movable partition allowance, area and storey reduction factors, ULS / SLS floor loads, column take-down with and without reduction.');
      c.h1('Floor loads');
      c.tbl(['Category', 'q_k (kPa)', 'Q_k (kN)', 'ψ_0', 'ψ_1', 'ψ_2'], [[i.cat].concat(k)], [0, 1, 1, 1, 1, 1]);
      const qp = +i.part === 0 ? 0 : +i.part <= 1 ? 0.5 : +i.part <= 2 ? 0.8 : 1.2;
      c.q('Partition allowance', 'q_part', 'by line load ≤ 1 / 2 / 3 kN/m', qp, 'kPa', '6.3.1.2(8)');
      const qt = k[0] + qp;
      c.q('Total imposed', 'q_k;tot', 'q_k + q_part', qt, 'kPa', '', true);
      const wuls = 1.35 * i.gk + 1.5 * qt, wsls = +i.gk + qt, wqp = +i.gk + k[4] * qt;
      c.q('ULS floor load', 'w_Ed', '1.35 g_k + 1.5 q_k', wuls, 'kPa', 'EN 1990 (6.10)'); c.q('SLS characteristic', 'w_k', '', wsls, 'kPa'); c.q('Quasi-permanent', 'w_qp', 'g_k + ψ_2 q_k', wqp, 'kPa');
      c.h1('Reduction factors');
      const aA = Math.min(1, 5 / 7 * k[2] + 10 / i.A); const aAl = /^[CD]/.test(i.cat) ? Math.max(aA, 0.6) : aA;
      c.q('Area reduction', 'α_A', '5/7 ψ_0 + A_0/A ≤ 1 (≥ 0.6 for C, D)', aAl, '', '(6.1)');
      const n = +i.n, an = n <= 2 ? 1 : (2 + (n - 2) * k[2]) / n;
      c.q('Storey reduction', 'α_n', '(2 + (n − 2) ψ_0)/n', an, '', '(6.2)');
      c.h1('Column take-down');
      const fac = i.red === 'n' ? an : i.red === 'A' ? aAl : 1;
      const rows = []; const pts = [], pts0 = [];
      for (let j = 1; j <= n; j++) { const anj = j <= 2 ? 1 : (2 + (j - 2) * k[2]) / j; const N0 = (1.35 * i.gk + 1.5 * qt) * i.A * j; const Nr = (1.35 * i.gk + 1.5 * qt * (i.red === 'n' ? anj : i.red === 'A' ? aAl : 1)) * i.A * j; rows.push([j, N0, Nr]); pts.push([j, Nr]); pts0.push([j, N0]); }
      c.tbl(['floors above', 'N_Ed, no reduction (kN)', 'N_Ed, reduced (kN)'], rows, [0, 0, 0]);
      const N = rows[rows.length - 1][2];
      c.c('Ground floor column', 'N_Ed/N_Rd', N, +i.NRd, 'kN', 'EN 1992 / 1993', 'Column take-down');
      const aa = []; for (let A = 5; A <= 200; A += 5) aa.push([A, Math.min(1, 5 / 7 * k[2] + 10 / A)]);
      const svg = EC.plot({ title: 'N_Ed vs floors supported', xl: 'floors', yl: 'N_Ed (kN)', series: [{ name: 'reduced', pts }, { name: 'no reduction', pts: pts0, cls: 1, dash: true }], legend: true }) + EC.plot({ title: 'α_A vs area', xl: 'A (m²)', yl: 'α_A', series: [{ name: 'α_A', pts: aa, cls: 2 }] });
      return c.result({ spec: [['Use', `category ${i.cat}: q_k = ${k[0]} kPa + partitions ${qp} kPa, Q_k = ${k[1]} kN`], ['Floor', `w_Ed = ${fmt(wuls, 2)} kPa`], ['Column', `N_Ed = ${fmt(N, 0)} kN at ground (${i.red === 'none' ? 'no' : i.red === 'n' ? 'α_n' : 'α_A'} reduction)`]], bars: [], svg, qt, N });
    }
  });

  /* ---------------- Self weight build-ups ---------------- */
  const MATS = [['Reinforced concrete', 25], ['Plain concrete', 24], ['Sand-cement screed', 22], ['Ceramic tiles + adhesive', 22], ['Lightweight concrete', 18], ['Brickwork (solid clay)', 20], ['Concrete block (dense)', 21], ['Concrete block (light)', 12], ['Gypsum plaster', 12], ['Cement render', 20], ['Timber', 6], ['Steel', 78.5], ['Glass', 25], ['Mineral wool insulation', 0.5], ['XPS insulation', 0.4], ['Waterproofing membrane', 11], ['Gravel ballast', 18], ['Soil (green roof)', 18]];
  EC.modules.selfweight = def({
    type: 'selfweight', name: 'Self Weight Build-ups', prefix: 'GW', code: 'prEN 1991-1-1:2023 Annex A', mathcad: 'EC1_Actions\\SelfWeight_Design',
    groups: [
      { t: 'Floor build-up', f: [T('floor', 'Layers (material no., thickness mm)', ['mat no.', 't (mm)'], [[1, 200], [3, 50], [4, 15], [9, 12]]), F('serv', 'Services / ceiling', 'kPa', 0.5), F('gass', 'Assumed floor g_k in design', 'kPa', 7.0)] },
      { t: 'Wall', f: [T('wall', 'Wall layers', ['mat no.', 't (mm)'], [[7, 200], [9, 12], [9, 12]]), F('hw', 'Wall height', 'm', 3.2), F('open', 'Openings', '%', 15), F('wass', 'Assumed wall line load', 'kN/m', 14)] },
      { t: 'Take-down', f: [F('A', 'Column tributary area', 'm²', 50), F('nf', 'Floors', 'no', 8), F('Lw', 'Wall length on tributary area', 'm', 6)] }
    ],
    schedCols: [['g', 'Floor g_k (kPa)'], ['w', 'Wall (kN/m)'], ['N', 'N_G (kN)']],
    sched: (i, r) => ({ g: r && r.g ? r.g.toFixed(2) : '', w: r && r.w ? r.w.toFixed(1) : '', N: r && r.N ? Math.round(r.N) : '' }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Self weight of floor and wall build-ups from material densities (prEN 1991-1-1:2023 Annex A, nominal values), wall line load with openings, and permanent-load take-down for a column, each compared with the value assumed in the design.');
      c.h1('Material densities used (kN/m³)');
      c.tbl(['no.', 'material', 'γ'], MATS.map((m, k) => [k + 1, m[0], m[1]]), [0, 0, 1]);
      const sum = rows => EC.rows(rows).reduce((a, r) => { const m = MATS[Math.round(r[0]) - 1]; return a + (m ? m[1] * r[1] / 1000 : 0); }, 0);
      const list = rows => EC.rows(rows).map(r => { const m = MATS[Math.round(r[0]) - 1] || ['?', 0]; return [m[0], r[1], m[1], m[1] * r[1] / 1000]; });
      c.h1('Floor');
      c.tbl(['layer', 't (mm)', 'γ', 'g (kPa)'], list(i.floor), [0, 0, 1, 2]);
      const g = sum(i.floor) + +i.serv;
      c.v({ l: 'Floor permanent load', s: 'g_k', f: 'Σ γ t + services', v: g, u: 'kPa', key: true });
      c.c('Floor vs design assumption', 'g_k/g_assumed', g, +i.gass, 'kPa', '', 'Floor permanent load');
      c.h1('Wall');
      c.tbl(['layer', 't (mm)', 'γ', 'g (kPa)'], list(i.wall), [0, 0, 1, 2]);
      const ww = sum(i.wall) * i.hw * (1 - i.open / 100);
      c.v({ l: 'Wall line load', s: 'g_w', f: 'Σ γ t · h (1 − openings)', v: ww, u: 'kN/m', key: true });
      c.c('Wall vs design assumption', 'g_w/g_assumed', ww, +i.wass, 'kN/m', '', 'Wall line load');
      c.h1('Column take-down (permanent)');
      const per = g * i.A + ww * i.Lw;
      const rows = []; for (let k = 1; k <= i.nf; k++) rows.push([k, per * k]);
      c.tbl(['floors', 'N_G (kN)'], rows, [0, 0]);
      const N = per * i.nf;
      c.v({ l: 'Permanent column load at base', s: 'N_G', f: 'n (g_k A + g_w L_w)', v: N, u: 'kN', key: true });
      const svg = EC.plot({ title: 'Permanent take-down', xl: 'floors', yl: 'N_G (kN)', series: [{ name: 'N_G', pts: rows }] });
      return c.result({ spec: [['Floor', `g_k = ${fmt(g, 2)} kPa`], ['Wall', `${fmt(ww, 1)} kN/m (${i.open} % openings)`], ['Column', `N_G = ${fmt(N, 0)} kN`]], bars: [], svg, g, w: ww, N });
    }
  });

  /* ---------------- Vehicle impact ---------------- */
  const IMP = [{ v: 'mw', l: 'Motorway / main road (1000 / 500 kN)', x: 1000, y: 500, h: 1.25 }, { v: 'cr', l: 'Country road (750 / 375 kN)', x: 750, y: 375, h: 1.25 }, { v: 'ur', l: 'Urban road (500 / 250 kN)', x: 500, y: 250, h: 1.25 }, { v: 'ylc', l: 'Courtyard / car park - lorries (150 / 75 kN)', x: 150, y: 75, h: 1.25 }, { v: 'ycc', l: 'Courtyard / car park - cars (50 / 25 kN)', x: 50, y: 25, h: 0.5 }, { v: 'fl', l: 'Forklift F = 5 W', x: 0, y: 0, h: 0.75 }];
  EC.modules.impact = def({
    type: 'impact', name: 'Vehicle Impact on Column', prefix: 'VI', code: 'prEN 1991-1-7:2023', mathcad: 'EC1_Actions\\Vehicle_Impact_Design',
    groups: [
      { t: 'Impact', f: [F('cls', 'Traffic category', '', 'ycc', IMP), F('Wf', 'Forklift gross weight W', 'kN', 50), F('hlo', 'Impact height range from', 'm', 0.5), F('hhi', 'to', 'm', 1.5)] },
      { t: 'Column', f: [F('L', 'Column height', 'm', 3.5), F('bc', 'Fixity', '', 'ff', [{ v: 'ff', l: 'Fixed - fixed' }, { v: 'fp', l: 'Fixed base - pinned top' }]), F('MRd', 'Column M_Rd (accidental)', 'kNm', 160), F('VRd', 'Column V_Rd', 'kN', 300), F('G', 'G_k on column', 'kN', 900), F('Q', 'Q_k on column', 'kN', 300), F('psi', 'ψ_1 / ψ_2', '', 0.5)] },
      { t: 'Barrier (car park)', f: [F('m', 'Vehicle mass', 'kg', 1500), F('v', 'Velocity', 'm/s', 4.47), F('dc', 'Vehicle deformation δ_c', 'mm', 100), F('db', 'Barrier deflection δ_b', 'mm', 50)] }
    ],
    schedCols: [['cls', 'Category'], ['F', 'F_dx (kN)'], ['M', 'M_Ed (kNm)']],
    sched: (i, r) => ({ cls: i.cls, F: r && r.Fx ? Math.round(r.Fx) : '', M: r && r.M ? Math.round(r.M) : '' }),
    calc(i) {
      const c = new EC.Calc(), I = IMP.find(x => x.v === i.cls) || IMP[4], L = +i.L;
      c.text('Accidental vehicle impact on a column (prEN 1991-1-7:2023 Table 4.1 recommended values, editable NDPs): impact forces, impact heights scanned along the range, column moments and shears for fixed-fixed or fixed-pinned columns, accidental axial force, car-park barrier force.');
      const Fx = i.cls === 'fl' ? 5 * i.Wf : I.x, Fy = i.cls === 'fl' ? 0 : I.y;
      c.h1('Impact forces');
      c.q('Force in driving direction', 'F_dx', i.cls === 'fl' ? '5 W' : 'Table 4.1', Fx, 'kN', '[NDP]', true); c.q('Perpendicular', 'F_dy', '', Fy, 'kN');
      c.note('F_dx and F_dy need not act simultaneously.');
      c.h1('Column effects (scan of impact height)');
      let Mmax = 0, Vmax = 0, hcrit = 0; const pts = [];
      for (let a = +i.hlo; a <= +i.hhi + 1e-9; a += 0.05) {
        const b = L - a; let M, V;
        if (i.bc === 'ff') { const Ma = Fx * a * b * b / L ** 2, Mb = Fx * a * a * b / L ** 2, Ml = 2 * Fx * a * a * b * b / L ** 3; M = Math.max(Ma, Mb, Ml); V = Fx * b * b * (L + 2 * a) / L ** 3; }
        else { const Rb = Fx * a * a * (3 * L - a) / (2 * L ** 3), Ma = Fx * a * b * (L + b) / (2 * L * L), Ml = Rb * b; M = Math.max(Ma, Ml); V = Math.max(Fx - Rb, Rb); }
        pts.push([a, M]); if (M > Mmax) { Mmax = M; hcrit = a; } Vmax = Math.max(Vmax, V);
      }
      c.v({ l: 'Maximum moment', s: 'M_Ed;A', f: i.bc === 'ff' ? 'max(P a b²/L², P a² b/L², 2P a² b²/L³)' : 'propped cantilever', n: `at impact height ${fmt(hcrit, 2)} m`, v: Mmax, u: 'kNm', key: true });
      c.q('Maximum shear', 'V_Ed;A', '', Vmax, 'kN');
      const NA = +i.G + i.psi * i.Q;
      c.q('Accidental axial force', 'N_Ed;A', 'G_k + ψ_1 Q_k', NA, 'kN', 'EN 1990 (6.11)');
      c.c('Column bending (accidental)', 'M_Ed/M_Rd', Mmax, +i.MRd, 'kNm', '', 'Column bending');
      c.c('Column shear (accidental)', 'V_Ed/V_Rd', Vmax, +i.VRd, 'kN', '', 'Column shear');
      c.h1('Car-park barrier');
      const Fb = 0.5 * i.m * i.v ** 2 / ((+i.dc + +i.db) / 1000) / 1000;
      c.v({ l: 'Barrier force', s: 'F', f: '½ m v²/(δ_c + δ_b)', v: Fb, u: 'kN', key: true, r: 'prEN 1991-1-1 Annex B' });
      const svg = EC.plot({ title: 'Column moment vs impact height', xl: 'impact height (m)', yl: 'M_Ed (kNm)', series: [{ name: 'M_Ed', pts }] });
      return c.result({ spec: [['Category', I.l], ['Column', `${L} m, ${i.bc === 'ff' ? 'fixed-fixed' : 'fixed-pinned'}, M_Ed = ${fmt(Mmax, 0)} kNm`], ['Protection', 'bollards / kerbs where impact is not designed for']], bars: [], svg, Fx, M: Mmax });
    }
  });

  /* ---------------- Execution loads (slabs) ---------------- */
  EC.modules.execution = def({
    type: 'execution', name: 'Execution Loads (falsework, back-propping)', prefix: 'EX', code: 'prEN 1991-1-6:2023', mathcad: 'EC1_Actions\\Execution_Loads_Design',
    groups: [
      { t: 'Slab pour', f: [F('h', 'Slab thickness', 'mm', 250), F('fw', 'Formwork self weight', 'kPa', 0.5), F('Atr', 'Prop tributary area', 'm²', 1.44), F('SWL', 'Prop safe working load', 'kN', 25)] },
      { t: 'Wind on falsework', f: [F('dur', 'Execution duration', '', '3m', [{ v: '3d', l: '≤ 3 days (T = 2 yr)' }, { v: '3m', l: '≤ 3 months (T = 5 yr)' }, { v: '1y', l: '≤ 1 year (T = 10 yr)' }, { v: 'long', l: '> 1 year (T = 50 yr)' }]), F('vb', 'Basic wind v_b (50 yr)', 'm/s', 30), F('Afw', 'Falsework exposed area per bay', 'm²', 6), F('Vbay', 'Vertical load per bay', 'kN', 150)] },
      { t: 'Back-propping', f: [F('ns', 'Slabs sharing (incl. new)', 'no', 3), F('cap28', 'Slab ULS capacity at 28 days', 'kPa', 18), F('age', 'Age of youngest supporting slab', 'days', 7), F('scem', 'Cement s (0.25 N)', '', 0.25), F('gsl', 'Supporting slab self weight', 'kPa', 6.25)] }
    ],
    schedCols: [['h', 'Slab h'], ['prop', 'Prop load (kN)'], ['cprob', 'c_prob']],
    sched: (i, r) => ({ h: i.h, prop: r && r.P ? r.P.toFixed(1) : '', cprob: r && r.cp ? r.cp.toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc(), h = i.h / 1000;
      c.text('Actions during execution of RC slabs (prEN 1991-1-6:2023): fresh concrete and formwork, construction loads in the working area, prop design load, reduced-return-period wind factor c_prob vs the notional horizontal action on falsework, load sharing between back-propped young slabs with early-age strength.');
      c.h1('Deck loads');
      const gc = 26 * h, qca = Math.min(Math.max(0.1 * gc, 0.75), 1.5);
      c.q('Fresh concrete (26 kN/m³)', 'q_cf', '26 h', gc, 'kPa'); c.q('Formwork', 'q_cc', '', +i.fw, 'kPa');
      c.q('Construction load in working area', 'q_cb', '0.1 q_cf, 0.75 … 1.5 kPa', qca, 'kPa', 'Table 4.2'); c.q('Outside working area', 'q_ca', '', 0.75, 'kPa');
      const wd = 1.35 * (gc + +i.fw) + 1.5 * qca;
      c.q('ULS deck load', 'w_d', '1.35(q_cf + q_cc) + 1.5 q_cb', wd, 'kPa');
      const P = (gc + +i.fw + qca) * i.Atr;
      c.v({ l: 'Prop working load (SLS)', s: 'P_prop', f: '(q_cf + q_cc + q_cb) A_trib', v: P, u: 'kN', key: true });
      c.c('Prop', 'P/SWL', P, +i.SWL, 'kN', 'manufacturer SWL', 'Prop load');
      c.h1('Wind on falsework');
      const Tr = { '3d': 2, '3m': 5, '1y': 10, long: 50 }[i.dur], p = 1 / Tr;
      const cp = Math.sqrt((1 - 0.2 * Math.log(-Math.log(1 - p))) / (1 - 0.2 * Math.log(-Math.log(0.98))));
      c.v({ l: 'Probability factor', s: 'c_prob', f: '[(1 − K ln(−ln(1 − p)))/(1 − K ln(−ln 0.98))]^n,  K = 0.2, n = 0.5', n: `T = ${Tr} years`, v: cp, u: '', key: true, r: 'EN 1991-1-4 (4.2)' });
      const qb = 0.5 * 1.25 * (cp * i.vb) ** 2 / 1000 * 2.0;
      const Fw = qb * 1.3 * i.Afw, Fn = 0.01 * i.Vbay;
      c.q('Wind on falsework bay (q_p ≈ 2 q_b, c_f 1.3)', 'F_w', '', Fw, 'kN'); c.q('Notional horizontal (1 %)', 'F_n', '0.01 V', Fn, 'kN');
      c.v({ l: 'Design horizontal action per bay', s: 'H_d', f: '1.5 max(F_w, F_n)', v: 1.5 * Math.max(Fw, Fn), u: 'kN', key: true });
      c.h1('Back-propping');
      const share = (gc + +i.fw + qca) / i.ns + +i.gsl;
      const bcc = Math.exp(i.scem * (1 - Math.sqrt(28 / Math.max(1, +i.age))));
      c.q('Load on each supporting slab (equal stiffness)', 'w_slab', '(new pour + construction)/n + own weight', share, 'kPa');
      c.q('Early-age strength factor', 'β_cc(t)', 'exp[s(1 − √(28/t))]', bcc, '', 'EN 1992-1-1 (3.2)');
      c.c('Youngest slab capacity', 'w_slab·1.35/(β_cc w_Rd,28)', share * 1.35, bcc * i.cap28, 'kPa', '', 'Young slab capacity');
      const ts = []; for (let t = 3; t <= 28; t++) ts.push([t, Math.exp(i.scem * (1 - Math.sqrt(28 / t))) * i.cap28]);
      const svg = EC.plot({ title: 'Young slab capacity vs age', xl: 'age (days)', yl: 'w_Rd (kPa)', series: [{ name: 'capacity', pts: ts }, { name: 'demand', pts: [[3, share * 1.35], [28, share * 1.35]], cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Pour', `h = ${i.h} mm, prop ${fmt(P, 1)} kN on ${i.Atr} m²`], ['Back-propping', (() => { const r = share * 1.35 / i.cap28; return `${i.ns} slabs; youngest slab adequate from ${r >= 1 ? '> 28' : fmt(28 / Math.pow(1 - Math.log(r) / i.scem, 2), 0)} days`; })()], ['Wind', `c_prob = ${fmt(cp, 3)}`]], bars: [], svg, P, cp });
    }
  });

  /* ---------------- Thermal actions on a roof slab ---------------- */
  EC.modules.thermal = def({
    type: 'thermal', name: 'Thermal Actions (roof slab)', prefix: 'TH', code: 'prEN 1991-1-5:2023', mathcad: 'EC1_Actions\\Thermal_Actions_Design',
    groups: [
      { t: 'Climate', f: [F('Tmax', 'Max shade air T_max', '°C', 40), F('Tmin', 'Min shade air T_min', '°C', 15), F('T0', 'Initial temperature T_0', '°C', 28), F('Tin', 'Inner temperature', '°C', 25), F('solar', 'Solar increment (surface colour)', '°C', 4, [{ v: 0, l: 'Light surface (T_3 = 0)' }, { v: 2, l: 'Light coloured (2)' }, { v: 4, l: 'Dark (4)' }]), F('dTM', 'Linear difference ΔT_M', '°C', 8)] },
      { t: 'Slab', f: [F('h', 'Slab thickness', 'mm', 200), F('L', 'Length between joints', 'm', 45), F('fck', 'Concrete class', '', 30, EC.CONC), F('kres', 'Restraint factor k_res', '', 0.5), F('phi', 'Creep coefficient (long-term)', '', 2.0), F('MAF', 'Sealant movement accommodation', '%', 25)] },
      { t: 'End column', f: [F('hc', 'Column height', 'm', 3.5), F('bc', 'Column size (square)', 'mm', 400)] }
    ],
    schedCols: [['L', 'L (m)'], ['gap', 'Joint (mm)'], ['dT', 'ΔT_N']],
    sched: (i, r) => ({ L: i.L, gap: r && r.gap ? Math.ceil(r.gap) : '', dT: r && r.dT ? r.dT.toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, 500), a = 10e-6;
      c.text('Thermal actions on an exposed RC roof slab (prEN 1991-1-5:2023): outer surface temperatures with solar increment, uniform expansion / contraction components, restraint stress and force, gradient moment vs cracking moment, crack-control steel, movement joint width and the sway moment in the end column.');
      c.h1('Temperature components');
      const Temax = +i.Tmax + +i.solar, Temin = +i.Tmin;
      const TN = (Temax + +i.Tin) / 2, TNmin = (Temin + +i.Tin) / 2;
      const dexp = TN - i.T0, dcon = i.T0 - TNmin;
      c.q('Summer slab temperature', 'T_slab;max', '(T_max + solar + T_in)/2', TN, '°C'); c.q('Winter slab temperature', 'T_slab;min', '(T_min + T_in)/2', TNmin, '°C');
      c.q('Uniform expansion', 'ΔT_N;exp', 'T − T_0', dexp, '°C', '', true); c.q('Uniform contraction', 'ΔT_N;con', 'T_0 − T_min', dcon, '°C', '', true);
      c.h1('Restraint');
      const Ee = m.Ecm / (1 + +i.phi);
      const sig = i.kres * Ee * a * Math.max(dexp, dcon);
      c.q('Restraint stress', 'σ_r', 'k_res E_eff α ΔT_N', sig, 'MPa');
      c.q('Restraint force per m', 'N_r', 'σ_r h', sig * i.h, 'kN/m');
      const Mg = Ee * a * i.dTM / i.h * (1000 * i.h ** 3 / 12) / 1e6, Mcr = m.fctm * 1000 * i.h ** 2 / 6 / 1e6;
      c.q('Gradient moment (full restraint)', 'm_ΔT', 'E_eff α ΔT_M I/h', Mg, 'kNm/m'); c.q('Cracking moment', 'm_cr', 'f_ctm b h²/6', Mcr, 'kNm/m');
      c.ok({ l: 'Gradient vs cracking', cond: Mg < Mcr, txt: Mg < Mcr ? 'uncracked under gradient alone' : 'gradient can crack the slab - provide A_s,min', item: false });
      const Amin = 1.0 * 0.65 * m.fctm * 1000 * i.h / 500 / 2;
      c.q('A_s,min each face (restraint, k_c = 1)', 'A_s;min', 'k_c k f_ct A_ct/(2 f_yk)', Amin, 'mm²/m', 'EN 1992 7.3.2', true);
      c.h1('Movement joint');
      const mv = a * (dexp + dcon) * i.L * 1000;
      const gap = mv / (i.MAF / 100);
      c.q('Total movement at the joint', 'Δ', 'α (ΔT_exp + ΔT_con) L', mv, 'mm');
      c.v({ l: 'Joint width for sealant MAF', s: 'w_joint', f: 'Δ/MAF', v: gap, u: 'mm', key: true });
      c.ok({ l: 'Joint spacing', cond: i.L <= 60, txt: `L = ${i.L} m (≤ 60 m practice for exposed roof slabs)`, item: 'Joint spacing', r: '[practice]' });
      c.h1('End column');
      const dl = a * Math.max(dexp, dcon) * i.L / 2 * 1000, Ic = Math.pow(+i.bc, 4) / 12, Ec = m.Ecm / (1 + +i.phi);
      const Mc = 6 * Ec * Ic * dl / (i.hc * 1000) ** 2 / 1e6;
      c.q('Free movement at the end column', 'δ', 'α ΔT L/2', dl, 'mm');
      c.v({ l: 'Column end moment (fixed-fixed, creep-reduced)', s: 'M_col', f: '6 E_eff I δ/h²', v: Mc, u: 'kNm', key: true });
      const Ts = []; for (let L = 10; L <= 90; L += 10) Ts.push([L, a * (dexp + dcon) * L * 1000 / (i.MAF / 100)]);
      const svg = EC.plot({ title: 'Joint width vs joint spacing', xl: 'L (m)', yl: 'joint width (mm)', series: [{ name: 'w_joint', pts: Ts }] });
      return c.result({ spec: [['Slab', `h = ${i.h} mm, joints @ ${i.L} m`], ['Temperatures', `ΔT_N,exp = ${fmt(dexp, 1)} °C, ΔT_N,con = ${fmt(dcon, 1)} °C`], ['Joint', `${Math.ceil(gap)} mm wide (sealant MAF ${i.MAF} %)`], ['Insulation', 'insulated roof build-up reduces ΔT significantly']], bars: [], svg, gap, dT: Math.max(dexp, dcon) });
    }
  });
})();
