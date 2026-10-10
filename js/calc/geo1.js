/* EC7 geotechnical 1: footing bearing, settlement, raft, retaining walls, sheet pile, anchor, uplift, slope, embankment, stone columns */
(function () {
  const F = EC.F, T = EC.T, fmt = EC.fmt, S = EC.soil, G = EC.geo, gw = EC.soil.gw;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}), icon: 'geo' }, o);
  const DAsel = (d) => F('da', 'Design approach', '', d || 'DA1-2', EC.geo.DAopts);

  /* ---------------- Pad footing - EN 1997 bearing & sliding ---------------- */
  EC.modules.footingec7 = def({
    type: 'footingec7', name: 'Footing Bearing & Sliding (EC7)', cat: 'geo', prefix: 'GF', code: 'EN 1997-1 / EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Footing_Design',
    groups: [
      { t: 'Footing', f: [F('B', 'Width B', 'm', 3.0), F('L', 'Length L', 'm', 3.4), F('D', 'Founding depth D', 'm', 1.5)] },
      { t: 'Ground', f: [F('g', 'Unit weight γ', 'kN/m³', 19), F('gs', 'Saturated γ_sat', 'kN/m³', 20), F('zw', 'Water table depth', 'm', 2.0), F('phi', 'φ\'_k', '°', 30), F('c', 'c\'_k', 'kPa', 0), F('cu', 'c_u,k (0 = drained only)', 'kPa', 60), F('Eoed', 'E_oed for settlement', 'MPa', 15)] },
      { t: 'Actions (characteristic, at base incl. footing)', f: [F('VG', 'V_G', 'kN', 1400), F('VQ', 'V_Q', 'kN', 500), F('HG', 'H_G (along B)', 'kN', 60), F('HQ', 'H_Q', 'kN', 50), F('MG', 'M_G (about L-axis)', 'kNm', 80), F('MQ', 'M_Q', 'kNm', 90), DAsel(), F('slim', 'Settlement limit', 'mm', 25)] }
    ],
    schedCols: [['size', 'B × L × D'], ['da', 'Approach'], ['Uv', 'U bearing']],
    sched: (i, r) => ({ size: `${i.B}×${i.L}×${i.D}`, da: i.da, Uv: r && r.Ub ? r.Ub.toFixed(2) : '' }),
    calc(i) {
      const c = new EC.Calc(), B = +i.B, L = +i.L, D = +i.D;
      c.text('Pad footing on uniform ground (EN 1997-1 Annex D): effective area for eccentric load, drained and undrained bearing resistance with shape and inclination factors, sliding, eccentricity limit, all design approaches compared, settlement by the 2:1 method.');
      const run = (key, show) => {
        const f = G.DA[key];
        const V = f.gG * i.VG + f.gQ * i.VQ, H = f.gG * i.HG + f.gQ * i.HQ, M = f.gG * i.MG + f.gQ * i.MQ;
        const e = M / V, Bp = B - 2 * Math.abs(e);
        const phid = G.phid(+i.phi, f.gphi), cd = i.c / f.gc, cud = i.cu / f.gcu;
        const sv = G.sigv([{ h: 100, g: +i.g, gs: +i.gs }], +i.zw, D);
        const gam = D + B >= i.zw ? i.gs - gw : +i.g;
        const Rd = G.bearing({ B: Bp, L, V, H, q: sv.s1, gam, phi: phid, c: cd });
        const Ru = +i.cu > 0 ? G.bearing({ B: Bp, L, V, H, q: sv.sv, undrained: true, cu: cud }) : null;
        const Rv = Math.min(Rd.R, Ru ? Ru.R : Infinity) / f.gRv;
        const Rh = Math.min((V - sv.u * Bp * L * 0) * Math.tan(EC.rad(phid)), Ru ? Bp * L * cud : Infinity) / f.gRh;
        if (show) {
          c.h1(`Design values - ${f.l}`);
          c.q('Design vertical / horizontal load', 'V_d', 'γ_G V_G + γ_Q V_Q', V, 'kN'); c.q('', 'H_d', '', H, 'kN');
          c.q('Eccentricity', 'e_B', 'M_d/V_d', e, 'm'); c.q('Effective width', 'B\'', 'B − 2e', Bp, 'm');
          c.c('Eccentricity limit', 'e/(B/3)', Math.abs(e), B / 3, 'm', '[EN 1997-3 limit]', 'Eccentricity');
          c.q('Design φ\'', 'φ\'_d', 'atan(tan φ\'_k/γ_φ)', phid, '°');
          c.h2('Drained bearing (Annex D)');
          c.q('Bearing factors', 'N_q', 'e^(π tanφ) tan²(45 + φ/2)', Rd.Nq, ''); c.q('', 'N_γ', '2(N_q − 1) tanφ', Rd.Ng, ''); c.q('Shape / inclination', 's_q', '1 + (B\'/L\') sinφ', Rd.sq, ''); c.q('', 'i_q', '(1 − H/(V + A\'c\' cotφ))^m', Rd.iq, '');
          c.q('Overburden at base', 'q\'', 'σ\'_v(D)', sv.s1, 'kPa');
          c.v({ l: 'Drained bearing resistance', s: 'R/A\'', f: 'c\' N_c s_c i_c + q\' N_q s_q i_q + ½ γ\' B\' N_γ s_γ i_γ', v: Rd.qu, u: 'kPa', key: true, r: 'Annex D.4' });
          if (Ru) { c.h2('Undrained bearing'); c.v({ l: 'Undrained resistance', s: 'R/A\'', f: '(π + 2) c_u s_c i_c + q', v: Ru.qu, u: 'kPa', key: true, r: 'Annex D.3' }); }
          c.c('Bearing', 'V_d/R_d', V, Rv, 'kN', '6.5.2', 'Bearing resistance');
          c.c('Sliding', 'H_d/R_h;d', H, Rh, 'kN', '6.5.3', 'Sliding');
        }
        return { Ub: V / Rv, Uh: H / Rh, e, Bp };
      };
      const res = run(i.da, true);
      c.h1('All design approaches');
      c.tbl(['Approach', 'U bearing', 'U sliding'], Object.keys(G.DA).map(k => { const r = run(k, false); return [G.DA[k].l, r.Ub, r.Uh]; }), [0, 3, 3]);
      c.h1('Settlement (2:1 method, SLS)');
      const qn = (+i.VG + +i.VQ) / (B * L) - i.g * D;
      let s = 0; const pts = [];
      for (let z = 0.25; z <= 2 * B + 0.01; z += 0.5) { const ds = qn * B * L / ((B + z) * (L + z)); s += ds * 0.5 / (i.Eoed * 1000); pts.push([ds, -z]); }
      c.q('Net bearing pressure', 'q_net', '(V_G + V_Q)/(B L) − γ D', qn, 'kPa');
      c.v({ l: 'Consolidation settlement to 2B', s: 's', f: 'Σ Δσ(z) Δz/E_oed,  Δσ = q B L/((B + z)(L + z))', v: s * 1000, u: 'mm', key: true });
      c.c('Settlement', 's/s_lim', s * 1000, +i.slim, 'mm', 'SLS [project limit]', 'Settlement');
      const svg = EC.plot({ title: 'Stress increase under centre (2:1)', xl: 'Δσ (kPa)', yl: 'depth (m)', series: [{ name: 'Δσ', pts }] });
      return c.result({ spec: [['Footing', `${B} × ${L} m at ${D} m depth`], ['Ground', `φ'_k = ${i.phi}°, c'_k = ${i.c} kPa, c_u = ${i.cu} kPa, GWL ${i.zw} m`], ['Approach', G.DA[i.da].l], ['Settlement', `${fmt(s * 1000, 1)} mm`]], bars: [], svg, Ub: res.Ub });
    }
  });

  /* ---------------- Settlement (layered) ---------------- */
  EC.modules.settlement = def({
    type: 'settlement', name: 'Settlement (layered ground)', cat: 'geo', prefix: 'SE', code: 'EN 1997-1 / -2', mathcad: 'EC7_Geotechnical\\Settlement_Design',
    groups: [
      { t: 'Loaded area', f: [F('B', 'Width B', 'm', 12), F('L', 'Length L', 'm', 24), F('D', 'Founding depth', 'm', 1.0), F('q', 'Net applied pressure q_net', 'kPa', 50), F('zw', 'Water table depth', 'm', 1.0), F('t', 'Time considered', 'years', 30), F('slim', 'Settlement limit', 'mm', 250)] },
      { t: 'Layers (top down, below founding level)', f: [T('lay', 'Soil layers', ['h (m)', 'γ_sat', 'E_u (MPa)', 'C_c', 'C_r', 'e_0', 'OCR', 'c_v (m²/yr)', 'C_α'], [[3, 19, 25, 0, 0, 0.6, 1, 50, 0], [6, 17, 8, 0.35, 0.05, 1.1, 1.2, 2, 0.01], [5, 18, 15, 0.25, 0.04, 0.9, 1.5, 3, 0.006]])] }
    ],
    schedCols: [['area', 'B × L'], ['q', 'q (kPa)'], ['s', 's (mm)']],
    sched: (i, r) => ({ area: `${i.B}×${i.L}`, q: i.q, s: r && r.st ? r.st.toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), B = +i.B, L = +i.L;
      const LY = EC.rows(i.lay).map(r => ({ h: r[0], gs: r[1], g: r[1], Eu: r[2], Cc: r[3], Cr: r[4], e0: r[5], OCR: r[6] || 1, cv: r[7], Ca: r[8] }));
      c.text('Settlement of a flexible rectangular loaded area on layered ground: Boussinesq stress under the centre, immediate (undrained) settlement, primary consolidation on the e–log σ\' curve with preconsolidation, secondary compression, and Terzaghi time–settlement per layer.');
      c.h1('Layer calculations (sub-layers of ≤ 1 m)');
      const rows = []; let si = 0, sc = 0, ss = 0, top = 0; const tc = []; const prof = [];
      LY.forEach((Ly, k) => {
        const nsub = Math.max(1, Math.ceil(Ly.h)), dh = Ly.h / nsub; let scL = 0, siL = 0;
        for (let j = 0; j < nsub; j++) {
          const z = top + (j + 0.5) * dh, zabs = +i.D + z;
          const sv0 = G.sigv([{ h: +i.D, g: 19, gs: 19 }].concat(LY.map(l => ({ h: l.h, g: l.g, gs: l.gs }))), +i.zw, zabs).s1;
          const ds = i.q * G.Icentre(B, L, z);
          siL += ds * dh / (Ly.Eu * 1000) * 0.75;
          if (Ly.Cc > 0) {
            const sp = sv0 * Ly.OCR, sf = sv0 + ds;
            const de = sf <= sp ? Ly.Cr * Math.log10(sf / sv0) : Ly.Cr * Math.log10(sp / sv0) + Ly.Cc * Math.log10(sf / sp);
            scL += de / (1 + Ly.e0) * dh;
          }
          prof.push([ds, -z]);
        }
        const tp = 1, Hdr = Ly.h / 2, Tv = Ly.cv * i.t / (Hdr * Hdr);
        const U = Tv < 0.217 ? Math.sqrt(4 * Tv / Math.PI) : 1 - 8 / (Math.PI ** 2) * Math.exp(-(Math.PI ** 2) * Tv / 4);
        const sec = Ly.Ca > 0 && U > 0.9 ? Ly.Ca / (1 + Ly.e0) * Ly.h * Math.log10(Math.max(i.t / Math.max(Hdr * Hdr * 1 / Ly.cv, 0.01), 1)) : 0;
        rows.push([k + 1, Ly.h, siL * 1000, scL * 1000, Math.min(U, 1), sec * 1000]);
        si += siL; sc += scL; ss += sec; tc.push({ scL, cv: Ly.cv, Hdr });
        top += Ly.h;
      });
      c.tbl(['Layer', 'h (m)', 's_i (mm)', 's_c (mm)', 'U(t)', 's_s (mm)'], rows, [0, 1, 1, 1, 2, 1]);
      c.q('Immediate settlement (Eu, centre, rigidity 0.75)', 's_i', 'Σ Δσ h/E_u · 0.75', si * 1000, 'mm');
      c.q('Primary consolidation (final)', 's_c', 'Σ [C_r log(σ\'_p/σ\'_0) + C_c log(σ\'_f/σ\'_p)] h/(1 + e_0)', sc * 1000, 'mm');
      const sct = rows.reduce((a, r, k) => a + r[3] * r[4], 0);
      const st = si * 1000 + sct + ss * 1000;
      c.v({ l: `Settlement at t = ${i.t} years`, s: 's(t)', f: 's_i + Σ U(t) s_c + s_s', v: st, u: 'mm', key: true });
      c.v({ l: 'Final settlement', s: 's_∞', f: 's_i + s_c + s_s', v: (si + sc + ss) * 1000, u: 'mm', key: true });
      c.c('Settlement (final)', 's/s_lim', (si + sc + ss) * 1000, +i.slim, 'mm', 'SLS', 'Total settlement');
      const tt = []; for (let e = -1; e <= 2.3; e += 0.1) { const t = Math.pow(10, e); let s = si * 1000; tc.forEach(l => { const Tv = l.cv * t / (l.Hdr ** 2); const U = Tv < 0.217 ? Math.sqrt(4 * Tv / Math.PI) : 1 - 8 / Math.PI ** 2 * Math.exp(-(Math.PI ** 2) * Tv / 4); s += Math.min(U, 1) * l.scL * 1000; }); tt.push([t, -s]); }
      const svg = EC.plot({ title: 'Settlement vs time', xl: 'time (years)', yl: '− s (mm)', series: [{ name: 's(t)', pts: tt }] }) + EC.plot({ title: 'Stress increase under centre', xl: 'Δσ (kPa)', yl: 'depth (m)', series: [{ name: 'Δσ', pts: prof, cls: 1 }] });
      return c.result({ spec: [['Loaded area', `${B} × ${L} m, q_net = ${i.q} kPa`], ['Settlement', `final ${fmt((si + sc + ss) * 1000, 0)} mm; at ${i.t} yr ${fmt(st, 0)} mm`]], bars: [], svg, st: (si + sc + ss) * 1000 });
    }
  });

  /* ---------------- Raft ---------------- */
  EC.modules.raft = def({
    type: 'raft', name: 'Raft Foundation', cat: 'foundations', prefix: 'RF', icon: 'footing', code: 'EN 1997-1:2024 / EN 1992-1-1:2023', mathcad: 'EC7_Geotechnical\\Raft_Design',
    groups: [
      { t: 'Raft & grid', f: [F('B', 'Raft width B', 'm', 20), F('L', 'Raft length L', 'm', 30), F('t', 'Thickness', 'mm', 1200), F('D', 'Founding depth', 'm', 3), F('sx', 'Column grid spacing', 'm', 7.5), F('cs', 'Column size', 'mm', 700)] },
      { t: 'Loads', f: [F('Pg', 'Interior column load G_k', 'kN', 2400), F('Pq', 'Interior column load Q_k', 'kN', 800), F('Mw', 'Wind overturning moment (along B)', 'kNm', 25000)] },
      { t: 'Ground', f: [F('phi', 'φ\'_k', '°', 30), F('c', 'c\'_k', 'kPa', 5), F('cu', 'c_u,k', 'kPa', 0), F('g', 'γ', 'kN/m³', 19), F('zw', 'Water table depth', 'm', 2), F('E', 'Soil modulus E_s', 'MPa', 30), F('nu', 'Poisson ν', '', 0.3), F('Hc', 'Compressible layer depth below raft', 'm', 20), F('slim', 'Settlement limit', 'mm', 50)] },
      { t: 'Concrete', f: [F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 60), F('db', 'Bottom ϕ', 'mm', 25, EC.barOpts), F('sb', 'spacing', 'mm', 150), F('dt', 'Top ϕ', 'mm', 25, EC.barOpts), F('st', 'spacing', 'mm', 150), F('Dl', 'Aggregate D_lower', 'mm', 16)] }
    ],
    schedCols: [['size', 'B × L × t'], ['grid', 'Grid'], ['bot', 'Bottom'], ['top', 'Top']],
    sched: i => ({ size: `${i.B}×${i.L}×${i.t / 1000}`, grid: i.sx, bot: `H${i.db}@${i.sb}`, top: `H${i.dt}@${i.st}` }),
    calc(i) {
      const c = new EC.Calc(), B = +i.B, L = +i.L, t = i.t / 1000, m = EC.mat(i.fck, i.fyk, i.Dl);
      c.text('Rectangular raft under a regular column grid: bearing with effective area for the wind moment (drained, RFA DC1 and MFA DC3), Steinbrenner settlement at centre and corner, subgrade modulus, column and span moments from a strip on Winkler springs, punching at an interior column.');
      c.h1('Loads');
      const ncol = Math.max(1, Math.round(B / i.sx + 1) * Math.round(L / i.sx + 1));
      const Gw = 25 * B * L * t;
      const VG = ncol * i.Pg * 0.75 + Gw, VQ = ncol * i.Pq * 0.75;
      c.q('Number of columns (grid)', 'n', '(B/s + 1)(L/s + 1)', ncol, ''); c.note('Edge / corner columns taken at 75 % of the interior load on average.');
      c.q('Total permanent / variable', 'V_G', 'n P_G 0.75 + raft', VG, 'kN'); c.q('', 'V_Q', '', VQ, 'kN');
      c.h1('Bearing (ULS)');
      const sv = G.sigv([{ h: 100, g: +i.g, gs: +i.g + 1 }], +i.zw, +i.D);
      const U = sv.u * B * L;
      [['RFA-DC1', 'Bearing RFA DC1'], ['MFA-DC3', 'Bearing MFA DC3']].forEach(([k, item]) => {
        const f = G.DA[k], V = f.gG * VG + f.gQ * VQ - U, M = f.gQ * i.Mw, e = M / V, Bp = B - 2 * e;
        const R = G.bearing({ B: Bp, L, V, H: 0, q: sv.s1, gam: +i.g - gw, phi: G.phid(+i.phi, f.gphi), c: i.c / f.gc });
        c.c(`${f.l}: V'_d/R_d (B' = ${fmt(Bp, 2)} m)`, 'V/R', V, R.R / f.gRv, 'kN', '6.5.2', item);
      });
      c.h1('Settlement (Steinbrenner, SLS)');
      const q = (VG + VQ) / (B * L) - i.g * i.D;
      const F1F2 = (b, l, H) => { const m1 = l / b, n = H / b, A = Math.sqrt(m1 * m1 + 1), Bq = Math.sqrt(m1 * m1 + n * n), C = Math.sqrt(m1 * m1 + n * n + 1); const f1 = (m1 * Math.log((1 + A) * Bq / (m1 * (1 + C))) + Math.log((m1 + A) * Math.sqrt(1 + n * n) / (m1 + C))) / Math.PI; const f2 = n / (2 * Math.PI) * Math.atan(m1 / (n * C)); return [f1, f2]; };
      const Ist = (b, l) => { const [f1, f2] = F1F2(b, l, +i.Hc); return f1 + (1 - 2 * i.nu) / (1 - i.nu) * f2; };
      const sc = 4 * q * (B / 2) * (1 - i.nu ** 2) * Ist(B / 2, L / 2) / (i.E * 1000);
      const sk = q * B * (1 - i.nu ** 2) * Ist(B, L) / (i.E * 1000);
      c.q('Net pressure', 'q_net', '', q, 'kPa');
      c.v({ l: 'Centre settlement (flexible)', s: 's_c', f: '4 q (B/2)(1 − ν²) I_s/E,  I_s = F_1 + (1 − 2ν)/(1 − ν) F_2', v: sc * 1000, u: 'mm', key: true });
      c.q('Corner settlement', 's_k', 'q B (1 − ν²) I_s/E', sk * 1000, 'mm');
      const sm = (2 * sc + sk) / 3 * 0.8;
      c.c('Settlement (mean of rigid raft ≈ 0.8 average)', 's_m/s_lim', sm * 1000, +i.slim, 'mm', 'SLS', 'Settlement');
      c.c('Angular distortion', 'β', (sc - sk) / Math.hypot(B / 2, L / 2), 1 / 500, '', '[practice 1/500]', 'Angular distortion');
      const ks = q / sm;
      c.v({ l: 'Subgrade modulus', s: 'k_s', f: 'q_net/s_m', v: ks, u: 'kN/m³', key: true });
      c.h1('Strip on springs (column line, ULS)');
      const Pd = 1.35 * i.Pg + 1.5 * i.Pq, n = 4, Ls = n * i.sx, ne = 48, EI = m.Ecm * 1000 * (i.sx * t ** 3 / 12) * 0.5;
      const loads = []; for (let k = 0; k <= n; k++) loads.push({ node: Math.round(k * ne / n), P: -Pd * (k === 0 || k === n ? 0.5 : 1) });
      const R = G.beamSprings({ n: ne, Lb: Ls, EI, kfun: () => ks * i.sx, loads });
      const Mmax = Math.max(...R.M.map(Math.abs).slice(Math.round(ne / n), Math.round(3 * ne / n)));
      const Msag = Math.max(...R.M.slice(Math.round(ne / n), Math.round(3 * ne / n)));
      const Mhog = -Math.min(...R.M.slice(Math.round(ne / n), Math.round(3 * ne / n)));
      c.note(`Strip ${i.sx} m wide over 4 bays, cracked stiffness 0.5 E_cm I; interior bays used.`);
      c.q('Moment under column (strip)', 'M_col', 'max interior', Math.max(Msag, Mhog), 'kNm');
      const cs = 1.25;
      const mcol = Math.max(Msag, Mhog) / i.sx * cs, mspan = Math.min(Msag, Mhog) / i.sx;
      c.q('Column zone moment (× 1.25 concentration)', 'm_col', 'M/s · 1.25', mcol, 'kNm/m', '[practice]', true);
      const d = i.t - i.cnom - i.db / 2, dt = i.t - 50 - i.dt / 2;
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: mcol, b: 1000, d: Math.min(d, dt), As: EC.barA(i.db) * 1000 / i.sb, m, barTxt: `H${i.db}@${i.sb}`, tag: 'col', item: 'Raft bending at columns' });
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Math.max(mspan, 0.5 * mcol), b: 1000, d: dt, As: EC.barA(i.dt) * 1000 / i.st, m, barTxt: `H${i.dt}@${i.st}`, tag: 'span', item: 'Raft bending in span' });
      c.h1('Punching at interior column');
      const dv = (d + dt) / 2, cc = +i.cs, b05 = 4 * cc + Math.PI * dv, Ain = (cc * cc + 4 * cc * dv / 2 + Math.PI * dv * dv / 4) / 1e6;
      const Vr = Pd - (Pd / (i.sx * i.sx)) * Ain;
      const rho = EC.barA(i.db) / (i.sb * d);
      const kpb = EC.clamp(3.6 * Math.sqrt(1 - 4 * cc / b05), 1, 2.5);
      const tR = Math.min(0.6 / m.gV * kpb * Math.pow(100 * Math.min(rho, 0.02) * m.fck * m.ddg / dv, 1 / 3), 0.5 / m.gV * Math.sqrt(m.fck));
      c.c('Punching', 'τ_Ed/τ_Rd;c', 1.15 * Vr * 1e3 / (b05 * dv), tR, 'MPa', '8.4', 'Punching');
      const svg = EC.plot({ title: 'Strip moment (kNm) and contact pressure', xl: 'x (m)', yl: 'M (kNm)', series: [{ name: 'M', pts: R.z.map((z, k) => [z, R.M[k]]) }] }) + EC.plot({ title: 'Contact pressure', xl: 'x (m)', yl: 'p (kPa)', series: [{ name: 'p', pts: R.z.map((z, k) => [z, -R.w[k] * ks]), cls: 1, fill: true }] });
      return c.result({ spec: [['Raft', `${B} × ${L} × ${t} m at ${i.D} m`], ['Ground', `φ' = ${i.phi}°, E_s = ${i.E} MPa, k_s ≈ ${fmt(ks, 0)} kN/m³`], ['Bottom', `H${i.db}@${i.sb} both ways`], ['Top', `H${i.dt}@${i.st} both ways`]], bars: [], svg });
    }
  });

  /* ---------------- Cantilever retaining wall ---------------- */
  const wallGeo = [F('H', 'Retained height above base H', 'm', 4.0), F('ts', 'Stem thickness (bottom)', 'mm', 350), F('tb', 'Base thickness', 'mm', 400), F('toe', 'Toe length', 'm', 1.2), F('heel', 'Heel length', 'm', 2.0), F('Df', 'Soil cover over toe', 'm', 0.6)];
  const soilF = [F('g', 'Backfill γ', 'kN/m³', 19), F('phi', 'Backfill φ\'_k', '°', 32), F('q', 'Surcharge q_k (variable)', 'kPa', 10), F('phib', 'Foundation φ\'_k', '°', 30), F('cb', 'Foundation c\'_k', 'kPa', 0), F('gb', 'Foundation γ', 'kN/m³', 19)];
  function wallForces(i, f, extra) {
    const H = +i.H, tb = i.tb / 1000, ts = i.ts / 1000, Hb = H + tb, Bb = +i.toe + ts + +i.heel;
    const phid = G.phid(+i.phi, f.gphi), Ka = S.Ka(phid);
    const Pa = 0.5 * Ka * i.g * Hb * Hb * f.gG, Pq = Ka * i.q * Hb * f.gQ;
    const Ws = 25 * ts * H, Wb = 25 * tb * Bb, Wsoil = i.g * i.heel * H, Wq = i.q * i.heel, Wt = i.g * i.toe * i.Df;
    const xs = +i.toe + ts / 2, xb = Bb / 2, xso = +i.toe + ts + i.heel / 2, xt = i.toe / 2;
    const gS = f.gG >= 1.35 ? 1.0 : 1.0;
    const Vst = (Ws + Wb + Wsoil + Wt) * gS;
    const Mst = (Ws * xs + Wb * xb + Wsoil * xso + Wt * xt) * gS;
    const Mot = Pa * Hb / 3 + Pq * Hb / 2 + (extra ? extra.M : 0);
    const H0 = Pa + Pq + (extra ? extra.H : 0);
    return { Hb, Bb, Ka, phid, Pa, Pq, Vst, Mst, Mot, H0, Ws, Wb, Wsoil, Wq, xso, ts, tb };
  }
  EC.modules.retainingwall = def({
    type: 'retainingwall', name: 'Cantilever Retaining Wall', cat: 'geo', prefix: 'RW', code: 'EN 1997 / EN 1992-1-1:2023', mathcad: 'EC7_Geotechnical\\RetainingWall_Design',
    groups: [
      { t: 'Wall geometry', f: wallGeo },
      { t: 'Soil', f: soilF.concat([DAsel('DA1-2')]) },
      { t: 'Concrete', f: [F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 50), F('ds', 'Stem vertical ϕ (back face)', 'mm', 16, EC.barOpts), F('ss', 'spacing', 'mm', 150), F('dh', 'Heel top ϕ', 'mm', 20, EC.barOpts), F('sh', 'spacing', 'mm', 125), F('dto', 'Toe bottom ϕ', 'mm', 16, EC.barOpts), F('sto', 'spacing', 'mm', 200)] }
    ],
    schedCols: [['H', 'H (m)'], ['base', 'Base (m)'], ['stem', 'Stem bars'], ['heel', 'Heel']],
    sched: i => ({ H: i.H, base: (+i.toe + i.ts / 1000 + +i.heel).toFixed(2), stem: `H${i.ds}@${i.ss}`, heel: `H${i.dh}@${i.sh}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk);
      c.text('Cantilever RC retaining wall: GEO checks (overturning, sliding, bearing with eccentricity) for the selected design approach and DA1-1, STR design of stem, heel and toe (bending, shear, crack width), SLS ground pressure.');
      const geo = (key, show) => {
        const f = G.DA[key], W = wallForces(i, f);
        const V = W.Vst + W.Wq * 0, M = W.Mst - W.Mot;
        const e = W.Bb / 2 - M / V, Bp = W.Bb - 2 * Math.abs(e);
        const phib = G.phid(+i.phib, f.gphi);
        const R = G.bearing({ B: Bp, L: 100, V, H: W.H0, q: i.gb * i.Df, gam: +i.gb, phi: phib, c: i.cb / f.gc });
        const Rh = (V * Math.tan(EC.rad(phib)) + Bp * i.cb / f.gc) / f.gRh;
        if (show) {
          c.h1(`GEO - ${f.l}`);
          c.q('Active coefficient', 'K_a', 'tan²(45 − φ\'_d/2)', W.Ka, '', 'Rankine');
          c.q('Earth thrust', 'P_a', '½ K_a γ H_b² · γ_G', W.Pa, 'kN/m'); c.q('Surcharge thrust', 'P_q', 'K_a q H_b · γ_Q', W.Pq, 'kN/m');
          c.q('Stabilising weight', 'V', 'stem + base + heel soil + toe soil', V, 'kN/m');
          c.c('Overturning (EQU-type)', 'M_dst/M_stb', W.Mot, W.Mst, 'kNm/m', '2.4.7', 'Overturning');
          c.c('Sliding', 'H/R_h', W.H0, Rh, 'kN/m', '6.5.3', 'Sliding');
          c.q('Eccentricity', 'e', 'B/2 − (M_stb − M_dst)/V', e, 'm');
          c.c('Eccentricity', 'e/(B/3)', Math.abs(e), W.Bb / 3, 'm', '[practice]', 'Eccentricity');
          c.c('Bearing', 'V/R_d', V, R.qu * Bp / f.gRv, 'kN/m', '6.5.2', 'Bearing');
        }
        return W;
      };
      const W = geo(i.da, true);
      if (i.da !== 'DA1-1') geo('DA1-1', true);
      c.h1('STR - stem');
      const f1 = G.DA['DA1-1'], H = +i.H;
      const Ka = S.Ka(+i.phi), Ms = (1.35 * Ka * i.g * H ** 3 / 6 + 1.5 * Ka * i.q * H * H / 2), Vs = 1.35 * Ka * i.g * H * H / 2 + 1.5 * Ka * i.q * H;
      const ds = i.ts - i.cnom - i.ds / 2, As = EC.barA(i.ds) * 1000 / i.ss;
      c.q('Stem base moment (DA1-1, K_a with φ\'_k)', 'M_Ed', '1.35 K_a γ H³/6 + 1.5 K_a q H²/2', Ms, 'kNm/m');
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Ms, b: 1000, d: ds, As, m, barTxt: `H${i.ds}@${i.ss}`, tag: 'stem', item: 'Stem bending' });
      const sh = EC.shearNoLinks(c, { V: Vs, b: 1000, d: ds, As, m });
      c.c('Stem shear', 'τ_Ed/τ_Rd;c', sh.tauEd, sh.tauRdc, 'MPa', '8.2.2', 'Stem shear');
      const w = EC.crackW({ b: 1000, h: +i.ts, d: ds, As, phi: +i.ds, c: +i.cnom, M: Ms / 1.4, fck: +i.fck });
      c.c('Stem crack width (SLS ≈ ULS/1.4)', 'w_k', w.wk, 0.3, 'mm', '[2004 7.3.4]', 'Stem crack width');
      c.h1('STR - heel and toe');
      const Mh = 1.35 * (i.g * H + 25 * W.tb) * i.heel ** 2 / 2 + 1.5 * i.q * i.heel ** 2 / 2;
      const dh = i.tb - 50 - i.dh / 2;
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mh, b: 1000, d: dh, As: EC.barA(i.dh) * 1000 / i.sh, m, barTxt: `H${i.dh}@${i.sh}`, tag: 'heel', item: 'Heel bending (top)' });
      const Wd = wallForces(i, f1), Vd = Wd.Vst, ed = Wd.Bb / 2 - (Wd.Mst - Wd.Mot) / Vd, qt = Vd / Wd.Bb * (1 + 6 * Math.abs(ed) / Wd.Bb);
      const Mt = qt * i.toe ** 2 / 2;
      EC.bending(c, { mu: 'kNm/m', au: 'mm²/m', M: Mt, b: 1000, d: i.tb - i.cnom - i.dto / 2, As: EC.barA(i.dto) * 1000 / i.sto, m, barTxt: `H${i.dto}@${i.sto}`, tag: 'toe', item: 'Toe bending (bottom)' });
      const sc = 50, ox = 60, oy = 30, Hb = W.Hb;
      const svg = EC.sketch(420, Hb * sc + 70, 'WALL SECTION', [{ c: 'conc', p: [[ox + i.toe * sc, oy], [ox + i.toe * sc + W.ts * sc, oy], [ox + i.toe * sc + W.ts * sc, oy + i.H * sc], [ox + W.Bb * sc, oy + i.H * sc], [ox + W.Bb * sc, oy + Hb * sc], [ox, oy + Hb * sc], [ox, oy + i.H * sc], [ox + i.toe * sc, oy + i.H * sc]] }, { c: 'rebarline', l: [[ox + i.toe * sc + W.ts * sc - 6, oy + 4], [ox + i.toe * sc + W.ts * sc - 6, oy + Hb * sc - 8], [ox + W.Bb * sc - 4, oy + Hb * sc - 8]] }, { c: 'ground', l: [[ox + i.toe * sc + W.ts * sc, oy], [ox + W.Bb * sc + 40, oy]] }, { dv: [ox - 14, oy, oy + Hb * sc, `${fmt(Hb, 2)} m`] }, { dh: [ox, ox + W.Bb * sc, oy + Hb * sc + 22, `B = ${fmt(W.Bb, 2)} m`] }]);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Wall', `H = ${i.H} m, base ${fmt(W.Bb, 2)} m (toe ${i.toe}, heel ${i.heel})`], ['Stem', `H${i.ds}@${i.ss} back face, H12@200 front`], ['Base', `heel top H${i.dh}@${i.sh}, toe bottom H${i.dto}@${i.sto}`], ['Drainage', 'free-draining backfill + weep holes / drain pipe']], bars: [], svg });
    }
  });

  /* ---------------- Gravity / gabion wall ---------------- */
  EC.modules.gravitywall = def({
    type: 'gravitywall', name: 'Gravity / Gabion Wall', cat: 'geo', prefix: 'GW', code: 'EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\GravityWall_Design',
    groups: [
      { t: 'Courses (from the base, back face flush)', f: [T('cs', 'Courses', ['h (m)', 'b (m)'], [[1.0, 3.0], [1.0, 2.5], [1.0, 2.0], [1.0, 1.5]]), F('gw', 'Wall unit weight', 'kN/m³', 17), F('mu', 'Joint friction factor', '', 0.7)] },
      { t: 'Soil', f: [F('g', 'Backfill γ', 'kN/m³', 19), F('phi', 'Backfill φ\'_k', '°', 32), F('beta', 'Backfill slope β', '°', 0), F('q', 'Surcharge q_k', 'kPa', 10), F('phib', 'Foundation φ\'_k', '°', 30), F('gb', 'Foundation γ', 'kN/m³', 19), DAsel('MFA-DC3')] }
    ],
    schedCols: [['H', 'H (m)'], ['B', 'Base (m)'], ['n', 'Courses']],
    sched: i => { const r = EC.rows(i.cs); return { H: r.reduce((a, x) => a + x[0], 0), B: r.length ? r[0][1] : '', n: r.length }; },
    calc(i) {
      const c = new EC.Calc(), CS = EC.rows(i.cs);
      c.text('Gabion / mass gravity wall built of courses (stepped front, back face flush): Coulomb thrust with wall friction, overturning, base sliding, bearing with eccentricity, and checks at every course joint.');
      const f = G.DA[i.da], Ht = CS.reduce((a, r) => a + r[0], 0);
      const phid = G.phid(+i.phi, f.gphi), del = 2 / 3 * phid, Ka = S.KaC(phid, del, +i.beta, 0);
      c.h1('Earth pressure');
      c.q('Design φ\'', 'φ\'_d', '', phid, '°'); c.q('Coulomb active coefficient (δ = 2/3 φ)', 'K_a', 'Coulomb', Ka, '', 'EN 1997 Annex C');
      const joint = (k0) => {
        const hs = CS.slice(k0).reduce((a, r) => a + r[0], 0);
        let W = 0, Mx = 0, y = 0; const B = CS[k0][1];
        CS.slice(k0).forEach(r => { const w = i.gw * r[0] * r[1]; W += w; Mx += w * (B - r[1] / 2); y += r[0]; });
        const Pa = 0.5 * Ka * i.g * hs * hs * f.gG, Pq = Ka * i.q * hs * f.gQ;
        const Ph = (Pa + Pq) * Math.cos(EC.rad(del)), Pv = (Pa + Pq) * Math.sin(EC.rad(del));
        const V = W + Pv, Mst = Mx + Pv * B, Mot = Pa * Math.cos(EC.rad(del)) * hs / 3 + Pq * Math.cos(EC.rad(del)) * hs / 2;
        const e = B / 2 - (Mst - Mot) / V;
        return { hs, B, V, Ph, Mst, Mot, e };
      };
      const b = joint(0);
      c.h1(`Base (${f.l})`);
      c.q('Vertical / horizontal', 'V_d', 'weight + P_a sin δ', b.V, 'kN/m'); c.q('', 'H_d', 'P_a cos δ', b.Ph, 'kN/m');
      c.c('Overturning', 'M_dst/M_stb', b.Mot, b.Mst, 'kNm/m', '[EQU]', 'Overturning');
      const phibd = G.phid(+i.phib, f.gphi);
      c.c('Sliding', 'H/(V tanφ_b)', b.Ph, b.V * Math.tan(EC.rad(phibd)) / f.gRh, 'kN/m', '6.5.3', 'Base sliding');
      c.c('Eccentricity', 'e/(B/3)', Math.abs(b.e), b.B / 3, 'm', 'EN 1997-3', 'Eccentricity');
      const R = G.bearing({ B: b.B - 2 * Math.abs(b.e), L: 100, V: b.V, H: b.Ph, q: 0.5 * i.gb, gam: +i.gb, phi: phibd, c: 0 });
      c.c('Bearing', 'V/R', b.V, R.qu * (b.B - 2 * Math.abs(b.e)) / f.gRv, 'kN/m', '6.5.2', 'Bearing');
      c.h1('Course joints');
      const rows = [];
      for (let k = 1; k < CS.length; k++) { const j = joint(k); rows.push([k, j.hs, j.Ph / (j.V * i.mu), Math.abs(j.e) / (j.B / 3)]); }
      c.tbl(['Joint', 'height above (m)', 'U sliding', 'U eccentricity'], rows, [0, 2, 3, 3]);
      const worst = rows.reduce((a, r) => Math.max(a, r[2], r[3]), 0);
      c.c('Course joints (worst)', 'U', worst, 1, '', '[Maccaferri practice]', 'Course joints');
      let y = 0; const it = []; const sc = 60, ox = 60, oy = 20 + Ht * sc;
      CS.forEach(r => { it.push({ c: 'conc', r: [ox + (CS[0][1] - r[1]) * sc, oy - (y + r[0]) * sc, r[1] * sc, r[0] * sc] }); y += r[0]; });
      it.push({ c: 'ground', l: [[ox + CS[0][1] * sc, oy - Ht * sc], [ox + CS[0][1] * sc + 80, oy - Ht * sc - 80 * Math.tan(EC.rad(+i.beta))]] });
      const svg = EC.sketch(380, Ht * sc + 60, 'WALL SECTION', it);
      return c.result({ spec: [['Wall', `${CS.length} courses, H = ${fmt(Ht, 2)} m, base ${CS[0] ? CS[0][1] : 0} m`], ['Fill', `γ = ${i.gw} kN/m³`], ['Backfill', `φ' = ${i.phi}°, geotextile filter behind the wall`]], bars: [], svg });
    }
  });

  /* ---------------- Seismic retaining wall (Mononobe-Okabe) ---------------- */
  EC.modules.seismicwall = def({
    type: 'seismicwall', name: 'Retaining Wall - Seismic (M-O)', cat: 'geo', prefix: 'SW', code: 'EN 1998-5 / EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\SeismicWall_Design',
    groups: [
      { t: 'Wall geometry', f: wallGeo },
      { t: 'Soil', f: soilF.concat([F('psi2', 'ψ_2 for surcharge', '', 0.3)]) },
      { t: 'Seismic', f: [F('ag', 'Design ground acceleration a_g/g', '', 0.15), F('Sf', 'Soil factor S', '', 1.15), F('r', 'Displacement factor r', '', 1.5, [{ v: 2, l: 'r = 2 (free gravity wall, d ≤ 300 a_g S mm)' }, { v: 1.5, l: 'r = 1.5 (d ≤ 200 a_g S mm)' }, { v: 1, l: 'r = 1 (rigid / propped)' }]), F('kvr', 'k_v/k_h', '', 0.5)] }
    ],
    schedCols: [['H', 'H'], ['kh', 'k_h'], ['KAE', 'K_AE']],
    sched: (i, r) => ({ H: i.H, kh: (i.ag * i.Sf / i.r).toFixed(3), KAE: r && r.KAE ? r.KAE.toFixed(3) : '' }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Cantilever RC wall in the seismic design situation (EN 1998-5 7.3.2 / Annex E): seismic coefficients, Mononobe-Okabe K_AE on the virtual back through the heel, dynamic increment, wall + soil inertia, sliding / bearing / eccentricity for k_v up and down.');
      c.h1('Seismic coefficients');
      const kh = i.ag * i.Sf / i.r;
      c.q('Horizontal coefficient', 'k_h', '(a_g/g) S/r', kh, '', '(7.1)', true);
      const kv = i.kvr * kh;
      c.q('Vertical coefficient', 'k_v', '± ratio · k_h', kv, '', '(7.2)');
      const phi = +i.phi, f = EC.rad(phi);
      const KAE = sg => { const th = Math.atan(kh / (1 - sg * kv)); const sq = Math.sqrt(Math.max(0, Math.sin(f) * Math.sin(f - th) / Math.cos(th))); return Math.pow(Math.cos(f - th), 2) / (Math.cos(th) * Math.pow(1 + sq, 2)); };
      const Ka = S.Ka(phi);
      const W = wallForces(i, { gG: 1, gQ: 0, gphi: 1 });
      let worst = null;
      [1, -1].forEach(sg => {
        const K = KAE(sg), Hb = W.Hb;
        const Ed = 0.5 * i.g * (1 - sg * kv) * K * Hb * Hb, Est = 0.5 * Ka * i.g * Hb * Hb, dE = Ed - Est;
        const Pq = K * i.psi2 * i.q * Hb;
        const Win = (W.Ws + W.Wb + W.Wsoil);
        const Hd = Est + dE + Pq + kh * Win, V = Win * (1 - sg * kv);
        const Mo = Est * Hb / 3 + dE * Hb * 0.5 + Pq * Hb / 2 + kh * Win * Hb * 0.4;
        const e = W.Bb / 2 - (W.Mst * (1 - sg * kv) - Mo) / V;
        const Rh = V * Math.tan(EC.rad(+i.phib));
        const r = { sg, K, Ed, dE, Hd, V, e, Rh, Bp: W.Bb - 2 * Math.abs(e) };
        if (!worst || Hd / Rh > worst.Hd / worst.Rh) worst = r;
        c.h1(`k_v ${sg > 0 ? 'upward (reduces weight)' : 'downward'}`);
        c.q('Seismic active coefficient', 'K_AE', 'cos²(φ − θ)/[cos θ (1 + √(sinφ sin(φ − θ)/cos θ))²],  θ = atan(k_h/(1 ∓ k_v))', K, '', 'Annex E (E.2)', true);
        c.q('Total thrust', 'E_d', '½ γ (1 ∓ k_v) K_AE H²', Ed, 'kN/m');
        c.q('Dynamic increment (acts at 0.5 H)', 'ΔE_d', 'E_d − E_static', dE, 'kN/m');
        c.c(`Sliding (k_v ${sg > 0 ? 'up' : 'down'})`, 'H_d/R_h', Hd, Rh, 'kN/m', 'γ = 1.0 seismic', `Seismic sliding k_v ${sg > 0 ? 'up' : 'down'}`);
        c.c(`Eccentricity (k_v ${sg > 0 ? 'up' : 'down'})`, 'e/(B/3)', Math.abs(e), W.Bb / 3, 'm', 'EN 1997-3', `Seismic eccentricity k_v ${sg > 0 ? 'up' : 'down'}`);
        const R = G.bearing({ B: r.Bp, L: 100, V, H: Hd, q: i.gb * i.Df, gam: +i.gb, phi: +i.phib, c: +i.cb });
        c.c(`Bearing (k_v ${sg > 0 ? 'up' : 'down'})`, 'V/R', V, R.qu * r.Bp, 'kN/m', '6.5.2', `Seismic bearing k_v ${sg > 0 ? 'up' : 'down'}`);
      });
      const ks = []; for (let k = 0; k <= 0.4; k += 0.02) { const th = Math.atan(k); const sq = Math.sqrt(Math.max(0, Math.sin(f) * Math.sin(f - th) / Math.cos(th))); ks.push([k, Math.pow(Math.cos(f - th), 2) / (Math.cos(th) * Math.pow(1 + sq, 2))]); }
      const svg = EC.plot({ title: 'K_AE vs k_h (k_v = 0)', xl: 'k_h', yl: 'K_AE', series: [{ name: 'K_AE', pts: ks }], points: [{ x: kh, y: worst.K, t: 'design' }] });
      return c.result({ spec: [['Seismic', `a_g S/g = ${fmt(i.ag * i.Sf, 3)}, r = ${i.r}, k_h = ${fmt(kh, 3)}`], ['Wall', `H = ${i.H} m, base ${fmt(W.Bb, 2)} m`], ['Drainage', 'keep backfill drained (no excess pore pressure assumed)']], bars: [], svg, KAE: worst.K });
    }
  });

  /* ---------------- Sheet pile wall ---------------- */
  EC.modules.sheetpile = def({
    type: 'sheetpile', name: 'Sheet Pile Wall', cat: 'geo', prefix: 'SP', code: 'EN 1997 / EN 1993-5', mathcad: 'EC7_Geotechnical\\SheetPile_Design',
    groups: [
      { t: 'Geometry', f: [F('H', 'Retained height H', 'm', 5.0), F('type', 'Support', '', 'anch', [{ v: 'cant', l: 'Cantilever' }, { v: 'anch', l: 'Single anchor / prop (free earth)' }]), F('za', 'Anchor depth below top', 'm', 1.0), F('q', 'Surcharge q_k', 'kPa', 10)] },
      { t: 'Soil (uniform)', f: [F('g', 'γ', 'kN/m³', 18), F('phi', 'φ\'_k', '°', 30), F('dk', 'δ/φ (wall friction)', '', 0.67), DAsel('DA1-2')] },
      { t: 'Section', f: [F('Wel', 'Section modulus W_el', 'cm³/m', 600), F('fy', 'Steel f_y', 'MPa', 355), F('sp', 'Anchor spacing', 'm', 2.5)] }
    ],
    schedCols: [['H', 'H'], ['type', 'Support'], ['d', 'Embedment (m)'], ['W', 'W_el']],
    sched: (i, r) => ({ H: i.H, type: i.type, d: r && r.d ? r.d.toFixed(2) : '', W: i.Wel }),
    calc(i) {
      const c = new EC.Calc(), f = G.DA[i.da], H = +i.H;
      c.text('Embedded sheet-pile wall in uniform granular soil (limit equilibrium): Coulomb K_a / K_p with wall friction from factored φ\', required embedment (cantilever: fixed earth simplified, +20 %; anchored: free earth support), anchor force, maximum bending moment and steel section check (EN 1993-5).');
      const phid = G.phid(+i.phi, f.gphi), del = i.dk * phid;
      const Ka = S.KaC(phid, del, 0, 0), KpE = S.KpC(phid, Math.min(del, phid / 3), 0);
      c.h1('Earth pressure coefficients');
      c.q('Design φ\'', 'φ\'_d', '', phid, '°'); c.q('Active (Coulomb)', 'K_a', '', Ka, ''); c.q('Passive (Coulomb, δ_p ≤ φ/3)', 'K_p', '', KpE, '');
      const g = +i.g, q = i.q * f.gQ / Math.max(f.gG, 1);
      const pa = z => Ka * (g * z + q) * f.gG, pp = z => KpE * g * z;
      const net = (d) => {
        const N = 200, Lt = H + d; let F = 0, Mtoe = 0, Ma = 0;
        for (let k = 0; k < N; k++) { const z = (k + 0.5) / N * Lt, dz = Lt / N; let p = pa(z); if (z > H) p -= pp(z - H); F += p * dz; Mtoe += p * dz * (Lt - z); Ma += p * dz * (z - i.za); }
        return { F, Mtoe, Ma };
      };
      let d, Ta = 0;
      if (i.type === 'cant') {
        let lo = 0.1, hi = 4 * H; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (net(mid).Mtoe > 0) lo = mid; else hi = mid; }
        d = 1.2 * lo;
        c.v({ l: 'Embedment (moment about toe = 0, +20 %)', s: 'd', f: '1.2 d_0', v: d, u: 'm', key: true });
      } else {
        let lo = 0.1, hi = 4 * H; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (net(mid).Ma > 0) lo = mid; else hi = mid; }
        d = lo; Ta = net(d).F;
        c.v({ l: 'Embedment (free earth, moment about anchor = 0)', s: 'd', v: d, u: 'm', key: true });
        c.v({ l: 'Anchor force per metre', s: 'T_d', f: 'Σ (P_a − P_p)', v: Ta, u: 'kN/m', key: true });
        c.q('Force per anchor', 'T_d · s', '', Ta * i.sp, 'kN');
      }
      const N = 200, Lt = H + d; let V = i.type === 'cant' ? 0 : 0, M = 0, Mmax = 0; const pts = [], prs = [];
      for (let k = 0; k <= N; k++) {
        const z = k / N * Lt, dz = Lt / N; let p = pa(z); if (z > H) p -= pp(z - H);
        if (i.type !== 'cant' && z >= i.za && z - dz < i.za) V -= Ta;
        V += p * dz; M += V * dz; Mmax = Math.max(Mmax, Math.abs(M)); pts.push([M, -z]); prs.push([p, -z]);
      }
      c.v({ l: 'Maximum bending moment', s: 'M_Ed', f: 'numerical integration of net pressure', v: Mmax, u: 'kNm/m', key: true });
      const MRd = i.Wel * i.fy / 1000 / 1.0;
      c.c('Sheet pile bending (class 1/2, elastic W)', 'M_Ed/M_Rd', Mmax, MRd, 'kNm/m', 'EN 1993-5 5.2', 'Section bending');
      c.q('Total pile length', 'L', 'H + d', Lt, 'm', '', true);
      const svg = EC.plot({ title: 'Net pressure', xl: 'p (kPa)', yl: 'depth (m)', series: [{ name: 'p_net', pts: prs }] }) + EC.plot({ title: 'Bending moment', xl: 'M (kNm/m)', yl: 'depth (m)', series: [{ name: 'M', pts, cls: 1 }] });
      return c.result({ spec: [['Wall', `H = ${H} m, toe at ${fmt(Lt, 2)} m, ${i.type === 'cant' ? 'cantilever' : `anchored at ${i.za} m`}`], ['Section', `W_el ≥ ${fmt(Mmax / i.fy * 1000, 0)} cm³/m (provided ${i.Wel})`], ['Anchors', i.type === 'cant' ? '–' : `${fmt(Ta * i.sp, 0)} kN design @ ${i.sp} m`]], bars: [], svg, d });
    }
  });

  /* ---------------- Ground anchor ---------------- */
  EC.modules.anchor = def({
    type: 'anchor', name: 'Grouted Ground Anchor', cat: 'geo', prefix: 'GA', code: 'EN 1997-3:2025 / EN ISO 22477-5', mathcad: 'EC7_Geotechnical\\Anchor_Design',
    groups: [
      { t: 'Wall & anchor', f: [F('E', 'Design anchor force per m E_ULS;d', 'kN/m', 180), F('Esls', 'Characteristic SLS force per m', 'kN/m', 120), F('s', 'Anchor spacing', 'm', 2.5), F('za', 'Anchor head depth', 'm', 1.0), F('H', 'Excavation depth', 'm', 6.0), F('inc', 'Inclination below horizontal', '°', 20), F('phi', 'Soil φ\'_k', '°', 32)] },
      { t: 'Fixed length', f: [F('Ds', 'Grout body diameter', 'mm', 150), F('qs', 'Ultimate grout-ground bond q_s', 'kPa', 250), F('Lf', 'Fixed length provided', 'm', 7), F('gRa', 'γ_Ra', '', 1.1), F('gRd', 'Model factor γ_Rd', '', 1.4)] },
      { t: 'Tendon', f: [F('ns', 'Strands', 'no', 4), F('Ap', 'Area per strand', 'mm²', 150), F('fp01', 'f_p0.1k', 'MPa', 1640)] }
    ],
    schedCols: [['P', 'P_d (kN)'], ['L', 'Free + fixed (m)'], ['ten', 'Tendon']],
    sched: (i, r) => ({ P: Math.round(i.E * i.s), L: r && r.Lfree ? `${r.Lfree.toFixed(1)} + ${i.Lf}` : '', ten: `${i.ns}×${i.Ap} mm²` }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Grouted strand anchor of a single-anchored wall: design force, free length beyond the active failure plane, grout-ground resistance and required fixed length, tendon resistance, proof and lock-off loads per EN ISO 22477-5.');
      c.h1('Design force');
      const Pd = i.E * i.s / Math.cos(EC.rad(+i.inc)), Pk = i.Esls * i.s / Math.cos(EC.rad(+i.inc));
      c.q('Design anchor force', 'P_d', 'E_ULS;d s/cos α', Pd, 'kN', '', true); c.q('Serviceability force', 'P_SLS', '', Pk, 'kN');
      c.h1('Free length');
      const th = EC.rad(45 + i.phi / 2), al = EC.rad(+i.inc);
      const zr = i.H - i.za, dist = zr / Math.tan(th) / (Math.cos(al) + Math.sin(al) / Math.tan(th));
      const Lfree = Math.max(5, dist + Math.max(1.5, 0.15 * i.H));
      c.q('Distance to the active plane along the anchor', 'l_a', 'geometry with θ = 45 + φ/2', dist, 'm');
      c.v({ l: 'Free length', s: 'L_free', f: 'l_a + max(1.5 m, 0.15 H) ≥ 5 m', v: Lfree, u: 'm', key: true, r: '[practice]' });
      c.h1('Grout-ground resistance');
      const Rk1 = Math.PI * i.Ds / 1000 * i.qs;
      const Lreq = Pd * i.gRa * i.gRd / Rk1;
      c.q('Resistance per metre', 'R_k/L', 'π D_s q_s', Rk1, 'kN/m');
      c.v({ l: 'Required fixed length', s: 'L_fixed;req', f: 'P_d γ_Ra γ_Rd/(π D_s q_s)', v: Lreq, u: 'm', key: true });
      c.c('Fixed length', 'L_req/L_prov', Lreq, +i.Lf, 'm', 'EN 1997-3 8', 'Fixed length');
      c.ok({ l: 'Fixed length range', cond: i.Lf >= 3 && i.Lf <= 10, txt: '3 m ≤ L_fixed ≤ 10 m', item: 'Fixed length range', r: '[practice]' });
      c.h1('Tendon');
      const Ptk = i.ns * i.Ap * i.fp01 / 1000, Rt = Ptk / 1.15;
      c.q('Characteristic tendon resistance', 'P_t0.1k', 'n A_p f_p0.1k', Ptk, 'kN'); c.c('Tendon', 'P_d/R_t;d', Pd, Rt, 'kN', 'EN 1992-1-1', 'Tendon resistance');
      c.h1('Testing and lock-off');
      const Pp = Math.min(1.25 * Pk * 1.1, 0.8 * Ptk), Pl = 1.1 * Pk;
      c.q('Proof load (acceptance test)', 'P_p', '≈ max(1.25 P_SLS, P_d) ≤ 0.8 P_t0.1k', Math.max(Pp, Math.min(Pd, 0.8 * Ptk)), 'kN', 'EN ISO 22477-5');
      c.q('Lock-off load', 'P_0', '≈ 1.1 P_SLS', Pl, 'kN');
      c.c('Lock-off vs tendon', 'P_0/(0.65 P_tk)', Pl, 0.65 * Ptk, 'kN', '[practice]', 'Lock-off level');
      const pts = []; for (let L = 3; L <= 12; L += 0.5) pts.push([L, Rk1 * L / (i.gRa * i.gRd)]);
      const svg = EC.plot({ title: 'Design grout resistance vs fixed length', xl: 'L_fixed (m)', yl: 'R_d (kN)', series: [{ name: 'R_d', pts }, { name: 'P_d', pts: [[3, Pd], [12, Pd]], cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Anchor', `${i.ns} strands, ${i.inc}° below horizontal @ ${i.s} m`], ['Lengths', `free ${fmt(Lfree, 1)} m, fixed ${i.Lf} m (D_s = ${i.Ds} mm)`], ['Loads', `P_d = ${fmt(Pd, 0)} kN, proof ${fmt(Math.max(Pp, Pd), 0)} kN, lock-off ${fmt(Pl, 0)} kN`], ['Testing', 'investigation / suitability / acceptance tests to EN ISO 22477-5']], bars: [], svg, Lfree });
    }
  });

  /* ---------------- Uplift / buoyancy ---------------- */
  EC.modules.uplift = def({
    type: 'uplift', name: 'Basement Uplift (UPL)', cat: 'geo', prefix: 'UP', code: 'EN 1997-1:2024 / EN 1990:2023', mathcad: 'EC7_Geotechnical\\Uplift_Design',
    groups: [
      { t: 'Basement', f: [F('A', 'Base area', 'm²', 1200), F('per', 'Perimeter', 'm', 140), F('zb', 'Underside of base below ground', 'm', 8.5), F('zw', 'Design water level below ground', 'm', 1.0), F('Gk', 'Permanent weight (final stage)', 'kN', 95000), F('Gc', 'Permanent weight (construction stage)', 'kN', 70000)] },
      { t: 'Factors', f: [F('gdst', 'γ_G;dst (water)', '', 1.0), F('gstb', 'γ_G;stb', '', 0.9), F('fric', 'Wall friction (0 = ignore)', 'kPa', 0)] },
      { t: 'Tension piles', f: [F('np', 'Number of tension piles', 'no', 60), F('Rt', 'Pile tension design resistance R_t;d', 'kN', 450), F('Wp', 'Buoyant pile weight', 'kN', 60)] }
    ],
    schedCols: [['A', 'Area'], ['h', 'Head (m)'], ['np', 'Piles']],
    sched: i => ({ A: i.A, h: (i.zb - i.zw).toFixed(1), np: i.np }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Uplift (UPL) of a basement for the final and construction stages: design water level, destabilising water force, stabilising permanent weight and wall friction, tension pile resistance and number of piles needed.');
      const hw = Math.max(0, i.zb - i.zw), U = hw * gw * i.A;
      c.q('Water head on the base', 'h_w', 'z_b − z_w', hw, 'm'); c.q('Uplift force', 'U_k', 'γ_w h_w A', U, 'kN', '', true);
      const Fr = i.fric * i.per * i.zb;
      [['Final stage', +i.Gk], ['Construction stage', +i.Gc]].forEach(([lab, Gk]) => {
        c.h1(lab);
        const dst = i.gdst * U, stb = i.gstb * Gk + Fr / 1.25;
        const need = Math.max(0, dst - stb);
        c.q('Destabilising', 'V_dst;d', 'γ_G;dst U', dst, 'kN'); c.q('Stabilising', 'G_stb;d', 'γ_G;stb G + friction/1.25', stb, 'kN');
        const Rp = i.np * (i.Rt + 0.9 * i.Wp);
        c.c(`${lab}: UPL`, 'V_dst/(G_stb + R_piles)', dst, stb + Rp, 'kN', 'EN 1997-1 UPL', `UPL ${lab.toLowerCase()}`);
        c.q('Piles needed', 'n_req', '(V_dst − G_stb)/(R_t;d + 0.9 W_p)', need / (+i.Rt + 0.9 * i.Wp), '');
      });
      const pts = []; for (let z = 0; z <= i.zb; z += i.zb / 20) pts.push([z, i.gdst * Math.max(0, i.zb - z) * gw * i.A / 1000]);
      const svg = EC.plot({ title: 'Uplift vs water level', xl: 'water level below ground (m)', yl: 'U_d (MN)', series: [{ name: 'U_d', pts }, { name: 'G_stb,d', pts: [[0, i.gstb * i.Gk / 1000], [+i.zb, i.gstb * i.Gk / 1000]], cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Basement', `A = ${i.A} m², base at ${i.zb} m, DWL at ${i.zw} m`], ['Tension piles', `${i.np} × R_t,d ${i.Rt} kN`], ['Construction', 'maintain dewatering until the construction-stage check is met']], bars: [], svg });
    }
  });

  /* ---------------- Slope stability (Bishop) ---------------- */
  EC.modules.slope = def({
    type: 'slope', name: 'Slope / Embankment Stability', cat: 'geo', prefix: 'SL', code: 'EN 1997-3:2025 Cl. 4', mathcad: 'EC7_Geotechnical\\SlopeStability_Design',
    groups: [
      { t: 'Embankment', f: [F('H', 'Height H', 'm', 4.0), F('n', 'Slope 1 : n', '', 2.0), F('cw', 'Crest width', 'm', 10), F('gf', 'Fill γ', 'kN/m³', 20), F('cf', 'Fill c\'', 'kPa', 5), F('phif', 'Fill φ\'', '°', 32), F('q', 'Crest surcharge q_k', 'kPa', 10)] },
      { t: 'Foundation layers (top down)', f: [T('lay', 'Layers', ['h (m)', 'γ', 'c\' (kPa)', 'φ\' (°)', 'c_u (kPa)', 'type (1 = cohesive)'], [[2, 17, 0, 25, 20, 1], [6, 18, 0, 28, 35, 1]]), F('zw', 'Water table depth (below ground)', 'm', 1.0)] },
      { t: 'Analysis', f: [F('mode', 'Condition', '', 'und', [{ v: 'und', l: 'Short term (undrained c_u in cohesive layers)' }, { v: 'dr', l: 'Long term (drained c\', φ\')' }]), F('gm', 'Material factor (M2: γ_φ = γ_c = 1.25)', '', 1.25), F('gcu', 'γ_cu', '', 1.4)] }
    ],
    schedCols: [['H', 'H'], ['n', '1:n'], ['F', 'F_d']],
    sched: (i, r) => ({ H: i.H, n: i.n, F: r && r.Fd ? r.Fd.toFixed(2) : '' }),
    calc(i) {
      const c = new EC.Calc(), H = +i.H, n = +i.n;
      const LY = EC.rows(i.lay).map(r => ({ h: r[0], g: r[1], c: r[2], phi: r[3], cu: r[4], coh: r[5] }));
      c.text('Overall stability of an embankment on layered ground by Bishop\'s simplified method: grid search of circle centres and tangent levels, short-term (undrained c_u in cohesive layers) or long-term (drained, hydrostatic pore pressure) parameters, factored by M2 so that F_d ≥ 1.0 satisfies EN 1997.');
      const surf = x => x <= 0 ? 0 : x >= n * H ? H : x / n;
      const prop = (x, y) => {
        if (y > 0) return { g: +i.gf, c: +i.cf, phi: +i.phif, cu: 0, coh: 0 };
        let top = 0; for (const L of LY) { if (-y < top + L.h) return L; top += L.h; } return LY[LY.length - 1];
      };
      const fac = (k, Lp) => {
        const und = i.mode === 'und' && Lp.coh;
        return und ? { c: Lp.cu / (k ? i.gcu : 1), tanf: 0 } : { c: Lp.c / (k ? i.gm : 1), tanf: Math.tan(EC.rad(Lp.phi)) / (k ? i.gm : 1) };
      };
      const bishop = (xc, yc, R, k) => {
        const x1 = xc - Math.sqrt(Math.max(R * R - yc * yc, 0)), x2 = xc + Math.sqrt(Math.max(R * R - (yc - H) ** 2, 0));
        if (!(x2 > x1)) return Infinity;
        const N = 30, b = (x2 - x1) / N; let F = 1.3;
        for (let it = 0; it < 30; it++) {
          let num = 0, den = 0;
          for (let s = 0; s < N; s++) {
            const x = x1 + (s + 0.5) * b, yb = yc - Math.sqrt(Math.max(R * R - (x - xc) ** 2, 0)), yt = surf(x);
            if (yt <= yb) continue;
            let W = 0; const nz = 8; for (let j = 0; j < nz; j++) { const y = yb + (j + 0.5) * (yt - yb) / nz; W += prop(x, y).g * (yt - yb) / nz * b; }
            if (x > 0 && x < n * H + i.cw) W += i.q * b * (x >= n * H ? 1 : 0) * 1.3;
            const al = Math.asin(EC.clamp((x - xc) / R, -1, 1));
            const Lp = prop(x, yb), p = fac(k, Lp);
            const u = i.mode === 'dr' && yb < -i.zw ? gw * (-i.zw - yb) : 0;
            const ma = Math.cos(al) + Math.sin(al) * p.tanf / F;
            num += (p.c * b + (W - u * b) * p.tanf) / Math.max(ma, 0.2);
            den += W * Math.sin(al);
          }
          if (den <= 0) return Infinity;
          const Fn = num / den; if (Math.abs(Fn - F) < 1e-4) { F = Fn; break; } F = Fn;
        }
        return F;
      };
      let best = { F: Infinity };
      const depth = LY.reduce((a, l) => a + l.h, 0);
      for (let ix = -2; ix <= 12; ix++) for (let iy = 1; iy <= 10; iy++) for (let it = 0; it <= 6; it++) {
        const xc = ix / 10 * n * H * 1.2, yc = H + iy * H * 0.25, yt = -it / 6 * Math.min(depth, 2 * H), R = yc - yt;
        const F = bishop(xc, yc, R, true);
        if (F < best.F) best = { F, xc, yc, R };
      }
      const Fk = bishop(best.xc, best.yc, best.R, false);
      c.h1('Critical circle (grid search)');
      c.q('Centre', 'x_c', '', best.xc, 'm'); c.q('', 'y_c', '', best.yc, 'm'); c.q('Radius', 'R', '', best.R, 'm');
      c.v({ l: 'Factor of safety with design (M2) parameters', s: 'F_d', f: 'Bishop simplified, Σ[(c\'b + (W − ub) tanφ\')/m_α]/Σ W sinα', v: best.F, u: '', key: true });
      c.q('Factor with characteristic parameters', 'F_k', '', Fk, '');
      c.c('Overall stability', '1/F_d', 1, best.F, '', 'EN 1997-3 4 (MFA)', 'Overall stability');
      const it = []; const sc = 300 / ((n + 3) * H + +i.cw), ox = 100, oy = 60 + H * sc;
      it.push({ c: 'conc', p: [[ox - 2 * H * sc, oy], [ox, oy], [ox + n * H * sc, oy - H * sc], [ox + (n * H + +i.cw) * sc, oy - H * sc], [ox + (n * H + +i.cw) * sc, oy + depth * sc], [ox - 2 * H * sc, oy + depth * sc]] });
      const arc = []; for (let a = 0; a <= 60; a++) { const t = Math.PI + a / 60 * Math.PI; const x = best.xc + best.R * Math.cos(t), y = best.yc + best.R * Math.sin(t); if (y <= surf(x) + 0.01) arc.push([ox + x * sc, oy - y * sc]); }
      if (arc.length > 1) it.push({ c: 'perim', l: arc });
      it.push({ t: [ox + best.xc * sc, oy - best.yc * sc, `F_d = ${fmt(best.F, 2)}`] }, { c: 'ppt', o: [ox + best.xc * sc, oy - best.yc * sc, 3] });
      const svg = EC.sketch(460, oy + depth * sc + 20, 'CROSS-SECTION - CRITICAL CIRCLE', it);
      return c.result({ spec: [['Embankment', `H = ${H} m, slope 1:${n}, fill φ' = ${i.phif}°`], ['Condition', i.mode === 'und' ? 'short term (undrained)' : 'long term (drained)'], ['Result', `F_d = ${fmt(best.F, 2)} (F_k = ${fmt(Fk, 2)})`]], bars: [], svg, Fd: best.F });
    }
  });

  /* ---------------- Staged embankment with PVD ---------------- */
  EC.modules.embankment = def({
    type: 'embankment', name: 'Staged Embankment + PVD', cat: 'geo', prefix: 'EM', code: 'EN 1997-3:2025', mathcad: 'EC7_Geotechnical\\Embankment_Design',
    groups: [
      { t: 'Lifts', f: [T('lifts', 'Lifts (placed in order)', ['thickness (m)', 'wait (days)'], [[1.5, 60], [1.5, 90], [1.5, 120]]), F('gf', 'Fill γ', 'kN/m³', 20), F('Bc', 'Embankment crest + slopes width', 'm', 30)] },
      { t: 'Soft clay', f: [F('Hc', 'Clay thickness', 'm', 10), F('cu0', 'Initial c_u (mid-depth)', 'kPa', 15), F('alpha', 'Strength gain c_u/σ\'', '', 0.22), F('Cc', 'C_c', '', 0.8), F('e0', 'e_0', '', 2.0), F('gc', 'Clay γ', 'kN/m³', 16), F('cv', 'c_v (vertical)', 'm²/yr', 1.5), F('ch', 'c_h (horizontal)', 'm²/yr', 3.0), F('drain', 'Drainage', '', 2, [{ v: 2, l: 'Double (top + bottom)' }, { v: 1, l: 'Single (top)' }])] },
      { t: 'Drains', f: [F('s', 'PVD spacing', 'm', 1.2), F('pat', 'Pattern', '', 'tri', [{ v: 'tri', l: 'Triangular (D_e = 1.05 s)' }, { v: 'sq', l: 'Square (D_e = 1.13 s)' }]), F('dw', 'Equivalent drain diameter', 'mm', 65), F('sm', 'Smear ratio d_s/d_w', '', 2.5), F('khks', 'k_h/k_s', '', 2.0), F('gcu', 'γ_cu × k_M', '', 1.4)] }
    ],
    schedCols: [['H', 'Total fill (m)'], ['s', 'PVD @'], ['sf', 's_final (mm)']],
    sched: (i, r) => ({ H: EC.rows(i.lifts).reduce((a, l) => a + l[0], 0), s: i.s, sf: r && r.sf ? r.sf.toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc(), LF = EC.rows(i.lifts);
      c.text('Staged embankment on soft clay with prefabricated vertical drains: Hansbo radial consolidation with smear plus Terzaghi vertical, undrained strength gain per lift, stage stability as undrained bearing (DC3, γ_cu), primary settlement and settlement–time.');
      const De = (i.pat === 'tri' ? 1.05 : 1.13) * i.s, nn = De * 1000 / i.dw;
      const mu = Math.log(nn / i.sm) + i.khks * Math.log(+i.sm) - 0.75;
      c.h1('Drain geometry');
      c.q('Influence diameter', 'D_e', (i.pat === 'tri' ? '1.05' : '1.13') + ' s', De, 'm'); c.q('Smear function', 'μ', 'ln(n/s) + (k_h/k_s) ln s − 0.75', mu, '', 'Hansbo (1981)');
      const Hdr = i.Hc / i.drain;
      const Ut = tdays => { const t = tdays / 365; const Th = i.ch * t / (De * De), Tv = i.cv * t / (Hdr * Hdr); const Uh = 1 - Math.exp(-8 * Th / mu); const Uv = Tv < 0.217 ? Math.sqrt(4 * Tv / Math.PI) : 1 - 8 / Math.PI ** 2 * Math.exp(-(Math.PI ** 2) * Tv / 4); return 1 - (1 - Uh) * (1 - Math.min(Uv, 1)); };
      c.h1('Stages');
      const sv0 = (i.gc - gw) * i.Hc / 2;
      let t = 0, Hf = 0, dsigEff = 0; const rows = []; const curve = [];
      let worstU = 0;
      LF.forEach(([h, wait], k) => {
        const cu = i.cu0 + i.alpha * dsigEff;
        Hf += h;
        const q = i.gf * Hf, qult = (Math.PI + 2) * cu / i.gcu;
        const Uval = q / qult; worstU = Math.max(worstU, Uval);
        for (let d = 0; d <= wait; d += Math.max(1, wait / 10)) curve.push([(t + d), Hf]);
        t += +wait;
        const U = Ut(t);
        dsigEff = U * i.gf * Hf;
        rows.push([k + 1, Hf, cu, q, qult, Uval, U]);
      });
      c.tbl(['Lift', 'fill (m)', 'c_u (kPa)', 'q (kPa)', 'q_d (kPa)', 'U stab.', 'U consol.'], rows, [0, 1, 1, 1, 1, 2, 2]);
      c.c('Stage stability (worst lift)', 'q/q_d', worstU, 1, '', '(π + 2) c_u/γ_cu', 'Stage stability');
      c.h1('Settlement');
      const q = i.gf * Hf, sf = i.Cc / (1 + i.e0) * i.Hc * Math.log10((sv0 + q) / sv0) * 1000;
      c.v({ l: 'Final primary settlement', s: 's_f', f: 'C_c H/(1 + e_0) log((σ\'_0 + Δσ)/σ\'_0)', v: sf, u: 'mm', key: true });
      const st = Ut(t) * sf;
      c.q('Settlement at end of staging', 's(t_end)', 'U s_f', st, 'mm'); c.q('Residual settlement', 's_res', 's_f − s(t)', sf - st, 'mm', '', true);
      const sc = []; for (let d = 0; d <= t * 1.5; d += t / 30) sc.push([d, -Ut(d) * sf / 1000]);
      const svg = EC.plot({ title: 'Fill height and settlement vs time', xl: 'time (days)', yl: 'fill (m) / −s (m)', series: [{ name: 'fill', pts: curve }, { name: '−s', pts: sc, cls: 1 }], legend: true });
      return c.result({ spec: [['Embankment', `${LF.length} lifts to ${fmt(Hf, 1)} m over ${fmt(t, 0)} days`], ['PVD', `@ ${i.s} m ${i.pat === 'tri' ? 'triangular' : 'square'}, to the base of the clay`], ['Monitoring', 'settlement plates, piezometers, inclinometers at the toe']], bars: [], svg, sf });
    }
  });

  /* ---------------- Stone columns (Priebe) ---------------- */
  EC.modules.stonecolumns = def({
    type: 'stonecolumns', name: 'Stone Columns (Priebe)', cat: 'geo', prefix: 'SC', code: 'EN 1997-3:2025 Cl. 11', mathcad: 'EC7_Geotechnical\\GroundImprovement_Design',
    groups: [
      { t: 'Columns', f: [F('D', 'Column diameter', 'm', 0.8), F('s', 'Spacing', 'm', 2.0), F('pat', 'Grid', '', 'tri', [{ v: 'tri', l: 'Triangular' }, { v: 'sq', l: 'Square' }]), F('phic', 'Column φ\'_c', '°', 40), F('Dc', 'Column constrained modulus', 'MPa', 80), F('L', 'Column length', 'm', 8)] },
      { t: 'Soil & load', f: [F('Ds', 'Soil constrained modulus', 'MPa', 4), F('cu', 'Soil c_u', 'kPa', 25), F('q', 'Applied pressure', 'kPa', 90), F('s0', 'Untreated settlement (calculated)', 'mm', 220), F('ch', 'c_h', 'm²/yr', 2.0)] }
    ],
    schedCols: [['grid', 'D @ s'], ['n', 'n_1'], ['s', 's_treated (mm)']],
    sched: (i, r) => ({ grid: `${i.D} @ ${i.s}`, n: r && r.n1 ? r.n1.toFixed(2) : '', s: r && r.st ? r.st.toFixed(0) : '' }),
    calc(i) {
      const c = new EC.Calc();
      c.text('Vibro-replacement stone columns under a wide load: unit cell, Priebe basic improvement factor n_0 (μ_s = 1/3), correction for column compressibility, upper limit, treated settlement and load sharing, bulging capacity (Hughes & Withers), radial consolidation.');
      const Ac = Math.PI * i.D * i.D / 4, A = i.pat === 'tri' ? Math.sqrt(3) / 2 * i.s * i.s : i.s * i.s, ar = Ac / A;
      c.h1('Unit cell');
      c.q('Area ratio', 'A_c/A', '', ar, '');
      const Kac = Math.pow(Math.tan(EC.rad(45 - i.phic / 2)), 2);
      const n0 = 1 + ar * ((5 - ar) / (4 * Kac * (1 - ar)) - 1);
      c.v({ l: 'Basic improvement factor', s: 'n_0', f: '1 + (A_c/A)[(5 − A_c/A)/(4 K_ac (1 − A_c/A)) − 1]', v: n0, u: '', r: 'Priebe (1995)' });
      const ratio = i.Dc / i.Ds;
      const n1 = Math.min(n0 * (1 - 1 / ratio) + 1 / ratio * 1, 1 + ar * (ratio - 1));
      c.v({ l: 'Improvement with column compressibility', s: 'n_1', f: 'min(n_0 interpolated for D_c/D_s, 1 + (A_c/A)(D_c/D_s − 1))', v: n1, u: '', key: true, r: 'Priebe [simplified]' });
      const st = i.s0 / n1;
      c.v({ l: 'Treated settlement', s: 's_t', f: 's_0/n_1', v: st, u: 'mm', key: true });
      const ps = i.q / n1, pc = (i.q - (1 - ar) * ps) / ar;
      c.q('Soil stress (settlement compatibility)', 'p_s', 'q/n_1', ps, 'kPa'); c.q('Column stress', 'p_c', '(q − (1 − A_c/A) p_s)/(A_c/A)', pc, 'kPa');
      c.h1('Column bulging');
      const Kpc = Math.pow(Math.tan(EC.rad(45 + i.phic / 2)), 2), qult = 4 * i.cu * Kpc;
      c.q('Ultimate column stress', 'q_ult', '4 c_u K_p;c', qult, 'kPa', 'Hughes & Withers (1974)');
      c.c('Bulging (DC1, γ_R = 1.4)', 'p_c/(q_ult/1.4)', pc, qult / 1.4, 'kPa', 'EN 1997-3 11', 'Column bulging');
      c.h1('Consolidation');
      const De = (i.pat === 'tri' ? 1.05 : 1.13) * i.s, nn = De / i.D, mu = Math.log(nn) - 0.75;
      const t90 = -Math.log(0.1) * mu * De * De / (8 * i.ch) * 365;
      c.q('Time for 90 % radial consolidation', 't_90', 'Barron/Hansbo with D_e', t90, 'days');
      const pts = []; for (let s = 1.2; s <= 3.5; s += 0.1) { const a2 = Ac / (i.pat === 'tri' ? Math.sqrt(3) / 2 * s * s : s * s); const n00 = 1 + a2 * ((5 - a2) / (4 * Kac * (1 - a2)) - 1); pts.push([s, n00]); }
      const svg = EC.plot({ title: 'n_0 vs spacing', xl: 'spacing (m)', yl: 'n_0', series: [{ name: 'n_0', pts }], points: [{ x: +i.s, y: n0, t: 'design' }] });
      return c.result({ spec: [['Columns', `ϕ${i.D} m @ ${i.s} m ${i.pat === 'tri' ? 'triangular' : 'square'}, L = ${i.L} m`], ['Stone', `φ'_c ≥ ${i.phic}°, 40–75 mm crushed rock`], ['Result', `n_1 = ${fmt(n1, 2)}, s = ${fmt(st, 0)} mm`]], bars: [], svg, n1, st });
    }
  });
})();
