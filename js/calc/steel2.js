/* EC3 / EC4: composite bridge girder (slab above or below), steel seat bracket with cast-in anchors (EN 1993-1-8 / EN 1992-4) */
(function () {
  const F = EC.F, fmt = EC.fmt;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}), icon: 'steel', cat: 'steel' }, o);

  /* elastic properties of a stack of rectangles [{b, h, y (centroid from bottom), E-ratio}] */
  const props = parts => { const A = parts.reduce((a, p) => a + p.b * p.h * p.r, 0), y = parts.reduce((a, p) => a + p.b * p.h * p.r * p.y, 0) / A; const I = parts.reduce((a, p) => a + p.r * (p.b * p.h ** 3 / 12 + p.b * p.h * (p.y - y) ** 2), 0); return { A, y, I }; };

  /* ---------------- Composite bridge girder ---------------- */
  EC.modules.compositebridge = def({
    type: 'compositebridge', name: 'Composite Bridge Girder', prefix: 'CG', code: 'EN 1994-2 / EN 1993-2 / EN 1991-2', mathcad: 'EC4_Composite\\Bridge_Design',
    groups: [
      { t: 'Bridge', f: [F('L', 'Span (simply supported)', 'm', 30), F('ng', 'Number of girders', 'no', 5), F('sg', 'Girder spacing', 'm', 2.5), F('W', 'Carriageway width', 'm', 10.5), F('pos', 'Slab position', '', 'above', [{ v: 'above', l: 'Slab above girders (normal)' }, { v: 'below', l: 'Slab below girders (tension flange)' }]), F('Lb', 'Lateral restraint spacing (cross-frames)', 'm', 6)] },
      { t: 'Steel girder', f: [F('bt', 'Top flange b', 'mm', 400), F('tt', 'Top flange t', 'mm', 25), F('hw', 'Web depth', 'mm', 1500), F('tw', 'Web t', 'mm', 14), F('bb', 'Bottom flange b', 'mm', 600), F('tb', 'Bottom flange t', 'mm', 40), F('fy', 'Steel grade', '', 355, [{ v: 355, l: 'S355' }, { v: 460, l: 'S460' }])] },
      { t: 'Slab & studs', f: [F('hs', 'Slab thickness', 'mm', 250), F('fck', 'Concrete', '', 35, EC.CONC), F('dr', 'Slab bars (long.) ϕ', 'mm', 16, EC.barOpts), F('sr', 'Slab bar spacing (each face)', 'mm', 150), F('ds', 'Stud ϕ', 'mm', 19, [{ v: 19, l: 'ϕ19' }, { v: 22, l: 'ϕ22' }, { v: 25, l: 'ϕ25' }]), F('hst', 'Stud height', 'mm', 150), F('nst', 'Studs per row', 'no', 3), F('sst', 'Row spacing at support', 'mm', 150)] },
      { t: 'Loads', f: [F('sdl', 'Surfacing + parapets per girder', 'kN/m', 6), F('phi', 'Creep coefficient φ_t', '', 2.0), F('ecs', 'Shrinkage ε_cs', '‰', 0.3)] }
    ],
    schedCols: [['L', 'Span'], ['sec', 'Girder'], ['studs', 'Studs'], ['U', 'U_M']],
    sched: (i, r) => ({ L: i.L, sec: `${i.bt}×${i.tt} / ${i.hw}×${i.tw} / ${i.bb}×${i.tb}`, studs: `${i.nst}×ϕ${i.ds}@${i.sst}`, U: r && r.UM ? r.UM.toFixed(2) : '' }),
    calc(i) {
      const c = new EC.Calc(), L = +i.L, fy = +i.fy, below = i.pos === 'below';
      const m = EC.mat(i.fck, 500), Ea = 210000, n0 = Ea / m.Ecm, nL = n0 * (1 + 1.1 * i.phi), eps = Math.sqrt(235 / fy);
      c.text(`Simply supported steel–concrete composite road bridge girder${below ? ' with the concrete slab BELOW the steel girders (slab = tension flange in sagging, cracked)' : ''}: effective width, steel / short-term / long-term sections, construction stage with LTB, LM1 traffic with Courbon distribution, ULS bending (plastic or elastic), web shear buckling, shear connection, SLS stresses with shrinkage, deflection and simplified fatigue.`);
      c.h1('Sections');
      const be = Math.min(i.sg, 2 * L / 8) * 1000;
      c.q('Effective slab width', 'b_eff', 'min(s, 2 L_e/8)', be, 'mm', 'EN 1994-2 5.4.1.2');
      c.q('Modular ratios', 'n_0', 'E_a/E_cm', n0, ''); c.q('', 'n_L', 'n_0 (1 + ψ_L φ_t),  ψ_L = 1.1', nL, '');
      const hs = +i.hs, ht = +i.tt, hw = +i.hw, hb = +i.tb, hst = hb + hw + ht;
      const steel = [{ b: +i.bb, h: hb, y: hb / 2, r: 1 }, { b: +i.tw, h: hw, y: hb + hw / 2, r: 1 }, { b: +i.bt, h: ht, y: hb + hw + ht / 2, r: 1 }];
      const ySlab = below ? -hs / 2 : hst + hs / 2;
      const slab = r => ({ b: be, h: hs, y: ySlab, r });
      const Ast = (be / i.sr) * 2 * EC.barA(i.dr);
      const bars = { b: Ast / 10, h: 10, y: ySlab, r: 1 };
      const Pa = props(steel), P0 = props(below ? steel.concat([bars]) : steel.concat([slab(1 / n0)])), PL = props(below ? steel.concat([bars]) : steel.concat([slab(1 / nL)]));
      const yTop = below ? hst : hst, yBot = below ? -hs : 0;
      c.tbl(['section', 'A (mm²)', 'y_c (mm)', 'I (×10⁹ mm⁴)'], [['steel', Pa.A, Pa.y, Pa.I / 1e9], [below ? 'steel + slab bars (cracked)' : 'composite n_0', P0.A, P0.y, P0.I / 1e9], [below ? 'steel + slab bars (cracked)' : 'composite n_L', PL.A, PL.y, PL.I / 1e9]], [0, 0, 0, 2]);
      c.h1('Actions per girder');
      const gs = 78.5 * Pa.A / 1e6 * 1.1, gc = 25 * hs / 1000 * i.sg;
      const ng = Math.round(i.ng), xs = Array.from({ length: ng }, (_, k) => (k - (ng - 1) / 2) * i.sg), Sx2 = xs.reduce((a, x) => a + x * x, 0);
      const nl = Math.floor(i.W / 3), lanes = Array.from({ length: nl }, (_, k) => i.W / 2 - 1.5 - 3 * k);
      const dfac = e => 1 / ng + e * xs[ng - 1] / Sx2;
      const qUDL = lanes.reduce((a, e, k) => a + (k === 0 ? 9 : 2.5) * 3 * Math.max(dfac(e), 0), 0);
      const TS = lanes.reduce((a, e, k) => a + [300, 200, 100][k] * 2 * Math.max(dfac(e), 0) * (k < 3 ? 1 : 0), 0);
      c.q('Steel self weight (+10 % details)', 'g_a', '', gs, 'kN/m'); c.q('Slab (wet concrete, on steel)', 'g_c', '25 h_s s', gc, 'kN/m'); c.q('Superimposed dead', 'g_sdl', '', +i.sdl, 'kN/m');
      c.q('LM1 UDL to outer girder (Courbon)', 'q_LM1', 'Σ q_i 3 m (1/n + e x/Σx²)', qUDL, 'kN/m', 'EN 1991-2 4.3.2');
      c.q('LM1 tandem axle to outer girder (per axle pair)', 'Q_TS', 'Σ Q_i (…)', TS, 'kN');
      const Mu = q => q * L * L / 8, Vu = q => q * L / 2;
      const Mts = TS / 2 * L / 4 * 2 - TS / 2 * 0.6;
      const M1 = Mu(gs + gc), M2 = Mu(+i.sdl), M3 = Mu(qUDL) + Mts;
      const V1 = Vu(gs + gc), V2 = Vu(+i.sdl), V3 = Vu(qUDL) + TS * (1 - 0.6 / L);
      c.tbl(['action', 'M (kNm)', 'V (kN)'], [['steel + wet slab (on steel)', M1, V1], ['SDL (long-term section)', M2, V2], ['LM1 traffic (short-term)', M3, V3]], [0, 0, 0]);
      const MEd = 1.35 * (M1 + M2) + 1.35 * M3, VEd = 1.35 * (V1 + V2) + 1.35 * V3;
      c.v({ l: 'ULS moment / shear', s: 'M_Ed', f: '1.35 (G + LM1)', v: MEd, u: 'kNm', key: true }); c.q('', 'V_Ed', '', VEd, 'kN');
      c.h1('Construction stage (steel alone)');
      const Mc = 1.35 * M1 + 1.5 * 1.0 * L * L / 8 * i.sg * 0.75;
      const Iz = (i.tt * Math.pow(+i.bt, 3) + i.tb * Math.pow(+i.bb, 3)) / 12, It = (i.bt * ht ** 3 + i.bb * hb ** 3 + hw * i.tw ** 3) / 3, Iw = Iz * (hst - ht / 2 - hb / 2) ** 2 / 4;
      const Lt = i.Lb * 1000, Mcr = 1.13 * Math.PI ** 2 * Ea * Iz / Lt ** 2 * Math.sqrt(Iw / Iz + Lt * Lt * 81000 * It / (Math.PI ** 2 * Ea * Iz)) / 1e6;
      const Wtop = Pa.I / (hst - Pa.y), lam = Math.sqrt(Wtop * fy / (Mcr * 1e6)), ph = 0.5 * (1 + 0.76 * (lam - 0.2) + lam * lam), chi = Math.min(1, 1 / (ph + Math.sqrt(Math.max(ph * ph - lam * lam, 0))));
      const MbRd = chi * Wtop * fy / 1.1 / 1e6;
      c.q('Elastic critical moment (top flange, L_b)', 'M_cr', 'C_1 = 1.13', Mcr, 'kNm'); c.q('LTB', 'χ_LT', 'curve d (welded)', chi, '');
      c.c('Construction stage LTB (incl. 0.75 kPa construction load)', 'M/M_b;Rd', Mc, MbRd, 'kNm', 'EN 1993-1-1 6.3.2', 'Construction stage LTB');
      c.h1('ULS bending resistance');
      const fyd = fy / 1.0, fcd = 0.85 * m.fck / 1.5;
      const Af = [{ A: i.bb * hb, y: hb / 2 }, { A: i.tw * hw, y: hb + hw / 2 }, { A: i.bt * ht, y: hb + hw + ht / 2 }];
      let MplRd, xpl;
      if (!below) {
        const Fs = Af.reduce((a, f) => a + f.A, 0) * fyd, Fc = be * hs * fcd;
        if (Fc >= Fs) { const x = Fs / (be * fcd); xpl = x; MplRd = Fs * (hst + hs - x / 2 - Pa.y) / 1e6; }
        else {
          let lo = 0, hi = hst; for (let k = 0; k < 60; k++) { const yp = (lo + hi) / 2; let Fcomp = Fc, Ften = 0; steel.forEach(p => { const top = p.y + p.h / 2, bot = p.y - p.h / 2; const ab = Math.max(0, Math.min(top, hst) - Math.max(bot, yp)), be2 = Math.max(0, Math.min(top, yp) - bot); Fcomp += p.b * ab * fyd; Ften += p.b * be2 * fyd; }); if (Fcomp > Ften) lo = yp; else hi = yp; }
          const yp = (lo + hi) / 2; let M = Fc * (hst + hs / 2 - yp);
          steel.forEach(p => { const top = p.y + p.h / 2, bot = p.y - p.h / 2; const a1 = Math.max(0, top - Math.max(bot, yp)), y1 = Math.max(bot, yp) + a1 / 2; const a2 = Math.max(0, Math.min(top, yp) - bot), y2 = bot + a2 / 2; M += p.b * a1 * fyd * (y1 - yp) + p.b * a2 * fyd * (yp - y2); });
          MplRd = M / 1e6; xpl = hst + hs - yp;
        }
      } else {
        const Fbar = Ast * m.fyd;
        let lo = -hs, hi = hst; for (let k = 0; k < 60; k++) { const yp = (lo + hi) / 2; let Fcomp = 0, Ften = Fbar; steel.forEach(p => { const top = p.y + p.h / 2, bot = p.y - p.h / 2; Fcomp += p.b * Math.max(0, top - Math.max(bot, yp)) * fyd; Ften += p.b * Math.max(0, Math.min(top, yp) - bot) * fyd; }); if (Fcomp > Ften) lo = yp; else hi = yp; }
        const yp = (lo + hi) / 2; let M = Fbar * (yp - ySlab);
        steel.forEach(p => { const top = p.y + p.h / 2, bot = p.y - p.h / 2; const a1 = Math.max(0, top - Math.max(bot, yp)), y1 = Math.max(bot, yp) + a1 / 2; const a2 = Math.max(0, Math.min(top, yp) - bot), y2 = bot + a2 / 2; M += p.b * a1 * fyd * (y1 - yp) + p.b * a2 * fyd * (yp - y2); });
        MplRd = M / 1e6; xpl = hst - yp;
        c.note('Slab below: concrete cracked in sagging, only the slab bars act; the steel top flange is the compression flange.');
      }
      const wc = Math.max(0, xpl - (below ? 0 : hs) - ht), alw = Math.min(1, wc / hw);
      const lim2 = alw > 0.5 ? 456 * eps / (13 * alw - 1) : 41.5 * eps / Math.max(alw, 1e-3);
      const cls = alw <= 0 ? 1 : hw / i.tw <= lim2 ? 2 : 3;
      c.q('Web in compression', 'α', 'compressed depth/h_w', alw, '', 'EN 1993-1-1 Table 5.2');
      c.q('Plastic neutral axis depth from top', 'x_pl', 'force equilibrium (bisection)', xpl, 'mm');
      const MRd = cls <= 2 ? MplRd : MplRd * 0.85;
      c.v({ l: `Bending resistance (class ${cls <= 2 ? '1/2 plastic' : '3 - elastic approx. 0.85 M_pl'})`, s: 'M_Rd', v: MRd, u: 'kNm', key: true, r: 'EN 1994-2 6.2.1' });
      const UM = MEd / MRd;
      c.c('ULS bending', 'M_Ed/M_Rd', MEd, MRd, 'kNm', 'EN 1994-2 6.2', 'ULS bending');
      if (below) {
        const Mcr2 = Mcr, lam2 = Math.sqrt(MplRd * 1e6 / (Mcr2 * 1e6)), p2 = 0.5 * (1 + 0.76 * (lam2 - 0.2) + lam2 * lam2), ch2 = Math.min(1, 1 / (p2 + Math.sqrt(Math.max(p2 * p2 - lam2 * lam2, 0))));
        c.c('LTB of the free top flange in service', 'M_Ed/(χ_LT M_Rd)', MEd, ch2 * MRd / 1.1, 'kNm', 'EN 1993-2 6.3.4', 'Service LTB (top flange)');
      }
      c.h1('Web shear');
      const lw = hw / (86.4 * i.tw * eps), chiw = lw < 0.83 / 1.2 ? 1.2 : lw < 1.08 ? 0.83 / lw : 1.37 / (0.7 + lw);
      const VbRd = chiw * fy * hw * i.tw / Math.sqrt(3) / 1.1 / 1000;
      c.q('Web slenderness', 'λ̄_w', 'h_w/(86.4 t_w ε)', lw, '', 'EN 1993-1-5 5.3'); c.q('Reduction', 'χ_w', 'non-rigid end post', chiw, '');
      c.c('Shear buckling', 'V_Ed/V_b;Rd', VEd, VbRd, 'kN', 'EN 1993-1-5 5.2', 'Web shear');
      c.h1('Shear connection');
      const Pst = Math.min(0.8 * 450 * Math.PI * i.ds ** 2 / 4, 0.29 * i.ds ** 2 * Math.sqrt(m.fck * m.Ecm)) / 1.25 / 1000;
      c.q('Stud resistance', 'P_Rd', 'min(0.8 f_u π d²/4, 0.29 α d² √(f_ck E_cm))/γ_V', Pst, 'kN', 'EN 1994-2 6.6.3.1', true);
      const Ac = below ? Ast : be * hs / n0, yc = below ? Math.abs(ySlab - P0.y) : Math.abs(ySlab - P0.y);
      const vL = 1.35 * (V2 + V3) * 1e3 * Ac * yc / P0.I;
      c.q('Longitudinal shear flow at support', 'v_L;Ed', 'V A_c y_c/I (short-term)', vL, 'N/mm');
      c.c('Studs at support', 'v_L s/(n P_Rd)', vL * i.sst / 1000, i.nst * Pst, 'kN', 'EN 1994-2 6.6.2', 'Shear connectors');
      const nreq = (below ? Ast * m.fyd : Math.min(be * hs * fcd, Af.reduce((a, f) => a + f.A, 0) * fyd)) / 1000 / Pst;
      c.q('Studs per half span for full connection', 'n_f', 'N_c,f/P_Rd', nreq, '');
      const At = EC.barA(i.dr) / i.sr * 2 * 1000, vEd = vL / 2 / hs;
      c.c('Transverse slab bars (two shear planes)', 'A_sf/s_f', vEd * hs * 1000 / (m.fyd * 1.25), At, 'mm²/m', 'EN 1994-2 6.6.6 (cot θ = 1.25)', 'Transverse reinforcement');
      c.h1('SLS stresses (characteristic)');
      const sB = M1 * 1e6 * Pa.y / Pa.I + M2 * 1e6 * (PL.y - yBot) / PL.I + M3 * 1e6 * (P0.y - yBot) / P0.I;
      c.q('Bottom flange stress', 'σ_a;bot', 'staged: steel / n_L / n_0 sections', sB, 'MPa');
      c.c('Steel stress limit', 'σ/f_y', sB, fy, 'MPa', 'EN 1994-2 7.2.2', 'SLS steel stress');
      if (!below) { const sc = (M2 * 1e6 * (hst + hs - PL.y) / PL.I / nL + M3 * 1e6 * (hst + hs - P0.y) / P0.I / n0); c.c('Concrete top fibre', 'σ_c/0.6 f_ck', sc, 0.6 * m.fck, 'MPa', 'EN 1992-2 7.2', 'SLS concrete stress'); }
      c.h1('Deflection and camber');
      const dLM = 5 * qUDL * Math.pow(L * 1000, 4) / (384 * Ea * P0.I) + TS * Math.pow(L * 1000, 3) / (48 * Ea * P0.I) * 1000;
      const dG = 5 * (gs + gc) * Math.pow(L * 1000, 4) / (384 * Ea * Pa.I) + 5 * i.sdl * Math.pow(L * 1000, 4) / (384 * Ea * PL.I);
      c.c('Traffic deflection', 'δ_LM1/(L/800)', dLM, L * 1000 / 800, 'mm', '[practice]', 'Traffic deflection');
      c.q('Pre-camber for permanent loads', 'δ_G', '', dG, 'mm', '', true);
      c.h1('Fatigue (FLM3, simplified)');
      const MF = 480 / 2 * (L / 4) * 0.9, dsf = MF * 1e6 * (P0.y - yBot) / P0.I * dfac(lanes[0]);
      c.c('Bottom flange (detail 71, λ = 1.0, γ_Mf = 1.35)', 'Δσ/(Δσ_C/γ_Mf)', dsf, 71 / 1.35, 'MPa', 'EN 1993-2 9 [verify λ]', 'Fatigue bottom flange');
      const pts = [], cap = []; for (let k = 0; k <= 20; k++) { const x = k / 20 * L; const f = 4 * x * (L - x) / (L * L); pts.push([x, MEd * f]); cap.push([x, MRd]); }
      const sk = 0.12, H = (hst + hs) * sk, ox = 100, oy = 30;
      const it = [];
      if (!below) it.push({ c: 'conc', r: [ox - be * sk / 2, oy, be * sk, hs * sk] });
      const top0 = below ? oy : oy + hs * sk;
      it.push({ c: 'steel', r: [ox - i.bt * sk / 2, top0, i.bt * sk, ht * sk] }, { c: 'steel', r: [ox - i.tw * sk / 2, top0 + ht * sk, Math.max(i.tw * sk, 1.5), hw * sk] }, { c: 'steel', r: [ox - i.bb * sk / 2, top0 + (ht + hw) * sk, i.bb * sk, hb * sk] });
      if (below) it.push({ c: 'conc', r: [ox - be * sk / 2, top0 + hst * sk, be * sk, hs * sk] });
      const svg = EC.sketch(260, H + 70, 'GIRDER SECTION', it) + EC.plot({ title: 'M_Ed envelope vs M_Rd', xl: 'x (m)', yl: 'M (kNm)', series: [{ name: 'M_Ed', pts, fill: true }, { name: 'M_Rd', pts: cap, cls: 1, dash: true }], legend: true });
      return c.result({ spec: [['Bridge', `span ${L} m, ${ng} girders @ ${i.sg} m, slab ${hs} mm ${below ? 'below' : 'above'}`], ['Girder', `S${fy}: top ${i.bt}×${i.tt}, web ${hw}×${i.tw}, bottom ${i.bb}×${i.tb}`], ['Studs', `${i.nst} × ϕ${i.ds}×${i.hst} @ ${i.sst} mm at supports (${fmt(nreq, 0)} per half span)`], ['Camber', `${fmt(dG, 0)} mm at midspan`]], bars: [], svg, UM });
    }
  });

  /* ---------------- Steel bracket on concrete face ---------------- */
  EC.modules.bracket = def({
    type: 'bracket', name: 'Steel Seat Bracket + Anchors', prefix: 'SB', code: 'EN 1993-1-8 / EN 1992-4', mathcad: 'EC3_Steel\\BracketConnection_Design',
    groups: [
      { t: 'Actions (ULS)', f: [F('V', 'Vertical reaction V_Ed', 'kN', 180), F('H', 'Horizontal force H_Ed', 'kN', 20), F('e', 'Load eccentricity from wall face', 'mm', 150), F('hH', 'Height of H above plate bottom', 'mm', 350)] },
      { t: 'Steel', f: [F('fy', 'Steel grade', '', 355, [{ v: 275, l: 'S275' }, { v: 355, l: 'S355' }]), F('bp', 'Base plate width', 'mm', 300), F('hp', 'Base plate height', 'mm', 450), F('tp', 'Base plate t', 'mm', 25), F('tg', 'Gusset t', 'mm', 20), F('hg', 'Gusset depth at wall', 'mm', 300), F('aw', 'Fillet weld throat a', 'mm', 8), F('nb', 'Girder bolts (M20 8.8)', 'no', 4)] },
      { t: 'Anchors', f: [F('nr', 'Rows', 'no', 3), F('nc', 'Columns', 'no', 2), F('da', 'Anchor ϕ', 'mm', 24, [{ v: 16, l: 'M16' }, { v: 20, l: 'M20' }, { v: 24, l: 'M24' }, { v: 30, l: 'M30' }]), F('hef', 'Embedment h_ef', 'mm', 300), F('sx', 'Spacing horizontal', 'mm', 200), F('sy', 'Spacing vertical', 'mm', 170), F('cedge', 'Edge distance (side)', 'mm', 700), F('fuk', 'Anchor f_uk', 'MPa', 500), F('fck', 'Concrete', '', 35, EC.CONC), F('cr', 'Concrete state', '', 'cr', [{ v: 'cr', l: 'Cracked' }, { v: 'ucr', l: 'Uncracked' }])] }
    ],
    schedCols: [['V', 'V / H (kN)'], ['plate', 'Base plate'], ['anch', 'Anchors']],
    sched: i => ({ V: `${i.V} / ${i.H}`, plate: `${i.bp}×${i.hp}×${i.tp}`, anch: `${i.nr}×${i.nc} M${i.da} h_ef ${i.hef}` }),
    calc(i) {
      const c = new EC.Calc(), fy = +i.fy, fu = fy === 355 ? 470 : 410, gM0 = 1.0, gM2 = 1.25;
      const M = (i.V * i.e + i.H * i.hH) / 1000;
      c.text('Steel seat bracket carrying a girder end on a concrete face: seat bolts (EN 1993-1-8), gusset, welds, base plate in bending, anchor tension from a rigid plate rotating about the compression edge, concrete bearing, cast-in headed anchors to EN 1992-4 (steel, cone, pull-out, blow-out, pry-out, edge breakout, N–V interaction).');
      c.h1('Actions at the wall face');
      c.q('Moment about the plate bottom edge', 'M', 'V e + H h_H', M, 'kNm', '', true);
      c.h1('Girder bolts');
      const As = 245, FvRd = 0.6 * 800 * As / gM2 / 1000;
      c.c('Bolt shear (M20 8.8, threads in shear plane)', 'V/(n F_v;Rd)', Math.hypot(+i.V, +i.H), i.nb * FvRd, 'kN', 'EN 1993-1-8 Table 3.4', 'Girder bolts');
      c.h1('Gusset and welds');
      const Wg = i.tg * i.hg ** 2 / 6, sg = i.V * i.e * 1e3 / Wg + i.H * 1e3 / (i.tg * i.hg);
      c.c('Gusset stress at the wall', 'σ/f_y', sg, fy / gM0, 'MPa', 'EN 1993-1-1 6.2', 'Gusset');
      c.ok({ l: 'Gusset free edge', cond: i.hg / i.tg <= 14 * Math.sqrt(235 / fy) * 1.5, txt: `h_g/t_g = ${fmt(i.hg / i.tg, 1)} (≤ 21ε practice)`, item: 'Gusset edge buckling', r: '[practice]' });
      const Lw = 2 * +i.hg + 2 * +i.bp, Ww = 2 * i.aw * i.hg ** 2 / 6;
      const tw = Math.hypot(i.V * 1e3 / (Lw * i.aw), M * 1e6 / Ww);
      const fvw = fu / Math.sqrt(3) / ((fy === 355 ? 0.9 : 0.85) * gM2);
      c.c('Fillet welds (simplified method)', 'τ_w/f_vw;d', tw, fvw, 'MPa', 'EN 1993-1-8 4.5.3.3', 'Welds');
      c.h1('Anchor forces (rigid plate)');
      const nr = Math.round(i.nr), nc = Math.round(i.nc), n = nr * nc;
      const ys = Array.from({ length: nr }, (_, k) => (i.hp - i.sy * (nr - 1)) / 2 + k * i.sy);
      const yc = 0.1 * i.hp, Sy2 = ys.reduce((a, y) => a + (y - yc) ** 2, 0);
      const Tmax = (M * 1e3 * (ys[nr - 1] - yc) / Sy2) / nc + Math.max(0, i.H) / n;
      const Ttot = ys.reduce((a, y) => a + M * 1e3 * (y - yc) / Sy2, 0) + Math.max(0, +i.H);
      c.q('Tension in the top anchor', 'N_Ed;1', 'M y/Σy² /n_c + H/n', Tmax, 'kN', '', true);
      c.q('Tension of the anchor group', 'N_Ed;g', '', Ttot, 'kN');
      c.q('Shear per anchor', 'V_Ed;1', 'V/n', i.V / n, 'kN');
      const C = Ttot - +i.H;
      c.c('Concrete bearing at compression edge', 'σ_c/f_jd', C * 1e3 / (i.bp * 2 * yc), 0.67 * 2 * i.fck / 1.5, 'MPa', 'EN 1993-1-8 6.2.5 (β_j = 2/3, α = 2)', 'Concrete bearing');
      c.h1('Base plate');
      const mlev = Math.max(i.sx / 2 - i.tg / 2 - 0.8 * i.aw * Math.SQRT2, 20);
      const treq = Math.sqrt(4 * Tmax * 1e3 * mlev * gM0 / (Math.min(i.bp / nc, 2 * Math.PI * mlev) * fy));
      c.c('Plate bending (T-stub mode 1)', 't_req/t_p', treq, +i.tp, 'mm', 'EN 1993-1-8 6.2.4', 'Base plate');
      c.h1('Anchors - EN 1992-4');
      const d = +i.da, Asa = { 16: 157, 20: 245, 24: 353, 30: 561 }[d], gMs = Math.max(1.2 * i.fuk / (0.8 * i.fuk), 1.4);
      const NRs = Asa * i.fuk / 1000 / gMs;
      c.c('Steel failure (tension)', 'N_Ed;1/N_Rd;s', Tmax, NRs, 'kN', '7.2.1.3', 'Anchor steel tension');
      const hef = +i.hef, k1 = i.cr === 'cr' ? 7.7 : 11.0, N0 = k1 * Math.sqrt(+i.fck) * Math.pow(hef, 1.5) / 1000;
      const scr = 3 * hef, ccr = 1.5 * hef;
      const nt = nc * Math.max(1, nr - 1);
      const AcN = Math.min(i.sx * (nc - 1) + scr, 1e9) * Math.min(i.sy * Math.max(nr - 2, 0) + scr, 1e9) * Math.min(1, (Math.min(+i.cedge, ccr) + ccr) / scr);
      const psis = Math.min(1, 0.7 + 0.3 * i.cedge / ccr), psire = Math.min(1, 0.5 + hef / 200);
      const NRc = N0 * AcN / (scr * scr) * psis * psire / 1.5;
      c.q('Characteristic single-anchor cone', 'N⁰_Rk;c', `k_1 √f_ck h_ef^1.5, k_1 = ${k1}`, N0, 'kN', '7.2.1.4');
      c.c('Concrete cone (tension anchors)', 'N_Ed;g/N_Rd;c', Ttot, NRc, 'kN', '7.2.1.4 [verify group areas]', 'Concrete cone');
      const dh = d * 1.8, Ah = Math.PI / 4 * (dh * dh - d * d), NRp = (i.cr === 'cr' ? 7.5 : 10.5) * Ah * i.fck / 1000 / 1.5;
      c.c('Pull-out (headed)', 'N_Ed;1/N_Rd;p', Tmax, NRp, 'kN', '7.2.1.5', 'Pull-out');
      if (i.cedge < 0.5 * hef) { const NRcb = 8.7 * i.cedge * Math.sqrt(Ah) * Math.sqrt(+i.fck) / 1000 / 1.5; c.c('Blow-out (edge)', 'N_Ed;1/N_Rd;cb', Tmax, NRcb, 'kN', '7.2.1.8', 'Blow-out'); }
      const VRs = 0.6 * Asa * i.fuk / 1000 / 1.25;
      c.c('Steel failure (shear)', 'V_Ed;1/V_Rd;s', i.V / n, VRs, 'kN', '7.2.2.3', 'Anchor steel shear');
      const VRcp = 2 * N0 * AcN / (scr * scr) * psis * psire / 1.5;
      c.c('Pry-out', 'V_Ed/V_Rd;cp', +i.V, VRcp, 'kN', '7.2.2.4 (k_8 = 2)', 'Pry-out');
      const c1 = +i.cedge, lf = Math.min(hef, 12 * d), al = 0.1 * Math.sqrt(lf / c1), be = 0.1 * Math.pow(d / c1, 0.2);
      const V0 = (i.cr === 'cr' ? 1.7 : 2.4) * Math.pow(d, al) * Math.pow(lf, be) * Math.sqrt(+i.fck) * Math.pow(c1, 1.5) / 1000;
      const VRc = V0 * Math.min(1, (3 * c1 + i.sx * (nc - 1)) / (4.5 * c1)) / 1.5;
      c.c('Concrete edge breakout (side edge, load parallel)', 'V/(2.5 V_Rd;c)', +i.V, 2.5 * VRc, 'kN', '7.2.2.5 (parallel to edge ×2.5) [verify]', 'Edge breakout');
      const bN = Math.max(Tmax / NRs, Ttot / NRc, Tmax / NRp), bV = Math.max(i.V / n / VRs, i.V / VRcp, i.V / (2.5 * VRc));
      c.c('N–V interaction', 'β_N^1.5 + β_V^1.5', Math.pow(bN, 1.5) + Math.pow(bV, 1.5), 1, '', '7.2.3', 'N–V interaction');
      const sk = 0.5, ox = 60, oy = 40;
      const svg = EC.sketch(380, i.hp * sk + 90, 'SIDE ELEVATION', [{ c: 'conc', r: [10, 20, 50, i.hp * sk + 40] }, { c: 'steel', r: [ox, oy, i.tp * sk, i.hp * sk] }, { c: 'steel', p: [[ox + i.tp * sk, oy], [ox + i.tp * sk + i.e * sk * 1.6, oy], [ox + i.tp * sk, oy + i.hg * sk]] }].concat(ys.map(y => ({ c: 'rebarline', l: [[ox - hef * sk * 0.3, oy + (i.hp - y) * sk], [ox + i.tp * sk + 6, oy + (i.hp - y) * sk]] }))).concat([{ t: [ox + i.e * sk + 20, oy - 8, `V = ${i.V} kN`] }]));
      return c.result({ spec: [['Bracket', `S${fy}, base plate ${i.bp}×${i.hp}×${i.tp}, gusset t ${i.tg}`], ['Anchors', `${nr}×${nc} headed M${d}, h_ef ${hef} mm, f_uk ${i.fuk} MPa`], ['Welds', `${i.aw} mm fillet all round`], ['Bolts', `${i.nb} × M20 8.8 to girder`]], bars: [], svg });
    }
  });
})();
