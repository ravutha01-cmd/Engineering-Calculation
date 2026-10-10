/* Steel member - doubly symmetric rolled I / H section, EN 1993-1-1 (beam / beam-column, M_y + N) */
(function () {
  const F = EC.F;
  /* nominal dimensions h, b, t_w, t_f, r (mm) - properties computed */
  const SEC = {
    'IPE 200': [200, 100, 5.6, 8.5, 12], 'IPE 240': [240, 120, 6.2, 9.8, 15], 'IPE 270': [270, 135, 6.6, 10.2, 15], 'IPE 300': [300, 150, 7.1, 10.7, 15],
    'IPE 330': [330, 160, 7.5, 11.5, 18], 'IPE 360': [360, 170, 8.0, 12.7, 18], 'IPE 400': [400, 180, 8.6, 13.5, 21], 'IPE 450': [450, 190, 9.4, 14.6, 21],
    'IPE 500': [500, 200, 10.2, 16.0, 21], 'IPE 550': [550, 210, 11.1, 17.2, 24], 'IPE 600': [600, 220, 12.0, 19.0, 24],
    'HEA 200': [190, 200, 6.5, 10, 18], 'HEA 240': [230, 240, 7.5, 12, 21], 'HEA 300': [290, 300, 8.5, 14, 27], 'HEA 360': [350, 300, 10, 17.5, 27], 'HEA 400': [390, 300, 11, 19, 27],
    'HEB 200': [200, 200, 9, 15, 18], 'HEB 240': [240, 240, 10, 17, 21], 'HEB 300': [300, 300, 11, 19, 27], 'HEB 360': [360, 300, 12.5, 22.5, 27], 'HEB 400': [400, 300, 13.5, 24, 27]
  };
  EC.STEEL_SECTIONS = SEC;
  function props(n) {
    const [h, b, tw, tf, r] = SEC[n];
    const af = (1 - Math.PI / 4) * r * r, zf = 0.2234 * r, hw = h - 2 * tf;
    const A = 2 * b * tf + hw * tw + 4 * af;
    const yf = h / 2 - tf - zf, xf = tw / 2 + zf;
    const Iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12 + 4 * af * yf * yf;
    const Iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12 + 4 * af * xf * xf;
    const Wply = b * tf * (h - tf) + tw * hw * hw / 4 + 4 * af * yf;
    const Wplz = tf * b * b / 2 + hw * tw * tw / 4 + 4 * af * xf;
    const It = (2 * b * tf ** 3 + (h - tf) * tw ** 3) / 3;
    const Iw = Iz * (h - tf) ** 2 / 4;
    return { h, b, tw, tf, r, A, Iy, Iz, Wely: Iy / (h / 2), Welz: Iz / (b / 2), Wply, Wplz, It, Iw, iy: Math.sqrt(Iy / A), iz: Math.sqrt(Iz / A), mass: A * 7850e-6 };
  }
  const chi = (lam, alpha) => { const ph = 0.5 * (1 + alpha * (lam - 0.2) + lam * lam); return Math.min(1, 1 / (ph + Math.sqrt(Math.max(ph * ph - lam * lam, 0)))); };

  EC.modules.steel = {
    type: 'steel', name: 'Steel Member (I/H)', cat: 'steel', prefix: 'SM', icon: 'steel',
    code: 'EN 1993-1-1', mathcad: 'EC3_Steel\\Column_Design',
    groups: [
      { t: 'Section & material', f: [F('sec', 'Section', '', 'IPE 400', Object.keys(SEC).map(v => ({ v, l: v }))), F('fy', 'Steel grade', '', 355, [{ v: 235, l: 'S235' }, { v: 275, l: 'S275' }, { v: 355, l: 'S355' }])] },
      { t: 'Member', f: [F('L', 'Member length L', 'm', 7.5), F('ky', 'Buckling factor k_y', '', 1.0), F('kz', 'Buckling factor k_z', '', 1.0), F('kLT', 'LTB length factor k_LT (restraints)', '', 0.5), F('C1', 'Moment factor C_1', '', 1.13), F('Cm', 'Equivalent factor C_my = C_mLT', '', 0.95)] },
      { t: 'ULS actions', f: [F('NEd', 'Axial compression N_Ed', 'kN', 120), F('MEd', 'Moment M_y;Ed', 'kNm', 220), F('VEd', 'Shear V_z;Ed', 'kN', 140)] },
      { t: 'SLS deflection', f: [F('wk', 'SLS line load (variable) w_k', 'kN/m', 18), F('dlim', 'Deflection limit L/…', '', 300)] }
    ],
    schedCols: [['sec', 'Section'], ['grade', 'Grade'], ['L', 'Length (m)'], ['N', 'N_Ed (kN)'], ['M', 'M_y,Ed (kNm)'], ['mass', 'Mass (kg)']],
    sched: i => ({ sec: i.sec, grade: 'S' + i.fy, L: i.L, N: i.NEd, M: i.MEd, mass: Math.round(props(i.sec).mass * i.L) }),
    calc(i) {
      const c = new EC.Calc();
      const p = props(i.sec), fy = +i.fy * (Math.max(p.tf, p.tw) > 40 ? 0.93 : 1), E = 210000, G = 81000, gM0 = 1.0, gM1 = 1.0;
      const eps = Math.sqrt(235 / fy);
      c.text(`Rolled ${i.sec} in S${i.fy}: classification, cross-section resistance, flexural and lateral-torsional buckling, interaction (Annex B type k-factors), SLS deflection - EN 1993-1-1. Properties computed from nominal dimensions incl. root fillets.`);
      c.h1('Section properties');
      c.v({ l: 'Dimensions', s: 'h × b × t_w × t_f', v: p.h, u: 'mm', n: `${p.h} × ${p.b} × ${p.tw} × ${p.tf}, r = ${p.r}` });
      c.v({ l: 'Area', s: 'A', v: p.A, u: 'mm²' });
      c.v({ l: 'Second moments', s: 'I_y', v: p.Iy / 1e4, u: 'cm⁴', n: `I_z = ${EC.fmt(p.Iz / 1e4)} cm⁴` });
      c.v({ l: 'Plastic modulus', s: 'W_pl;y', v: p.Wply / 1e3, u: 'cm³', n: `W_el;y = ${EC.fmt(p.Wely / 1e3)} cm³` });
      c.v({ l: 'Torsion / warping', s: 'I_t', v: p.It / 1e4, u: 'cm⁴', n: `I_w = ${EC.fmt(p.Iw / 1e6, 0)} cm⁶` });
      c.v({ l: 'Mass', s: 'g', v: p.mass, u: 'kg/m' });
      c.v({ l: 'Yield strength', s: 'f_y', v: fy, u: 'MPa', r: 'Table 5.2 / EN 10025-2' });

      c.h1('Classification');
      const cf = (p.b - p.tw - 2 * p.r) / 2 / p.tf;
      const cw = (p.h - 2 * p.tf - 2 * p.r) / p.tw;
      const clsF = cf <= 9 * eps ? 1 : cf <= 10 * eps ? 2 : cf <= 14 * eps ? 3 : 4;
      const nfrac = Math.min(1, i.NEd * 1e3 / (fy * p.A));
      const alpha = Math.min(1, 0.5 * (1 + i.NEd * 1e3 / (fy * p.tw * (p.h - 2 * p.tf - 2 * p.r))));
      const lim1 = alpha > 0.5 ? 396 * eps / (13 * alpha - 1) : 36 * eps / alpha;
      const lim2 = alpha > 0.5 ? 456 * eps / (13 * alpha - 1) : 41.5 * eps / alpha;
      const psi = 2 * nfrac - 1;
      const lim3 = psi > -1 ? 42 * eps / (0.67 + 0.33 * psi) : 62 * eps * (1 - psi) * Math.sqrt(-psi);
      const clsW = cw <= lim1 ? 1 : cw <= lim2 ? 2 : cw <= lim3 ? 3 : 4;
      const cls = Math.max(clsF, clsW);
      c.v({ l: 'Flange outstand', s: 'c/t_f', v: cf, u: '', n: `class ${clsF} (limits 9ε, 10ε, 14ε; ε = ${EC.fmt(eps, 3)})`, r: 'Table 5.2' });
      c.v({ l: 'Web (bending + compression)', s: 'c/t_w', v: cw, u: '', n: `α = ${EC.fmt(alpha, 3)} → class ${clsW}`, r: 'Table 5.2' });
      c.ok({ l: 'Section class', cond: cls <= 3, txt: `Class ${cls}` + (cls === 4 ? ' - effective section required (not covered)' : ''), item: 'Section class ≤ 3' });
      const Wy = cls <= 2 ? p.Wply : p.Wely;

      c.h1('Cross-section resistance');
      const NcRd = p.A * fy / gM0 / 1e3, McRd = Wy * fy / gM0 / 1e6;
      const Av = Math.max(p.A - 2 * p.b * p.tf + (p.tw + 2 * p.r) * p.tf, p.tw * (p.h - 2 * p.tf));
      const VplRd = Av * fy / Math.sqrt(3) / gM0 / 1e3;
      c.v({ l: 'Compression resistance', s: 'N_c;Rd', f: 'A f_y/γ_M0', v: NcRd, u: 'kN', r: '6.2.4' });
      c.v({ l: 'Bending resistance', s: 'M_c;y;Rd', f: (cls <= 2 ? 'W_pl;y' : 'W_el;y') + ' f_y/γ_M0', v: McRd, u: 'kNm', r: '6.2.5', key: true });
      c.v({ l: 'Shear area', s: 'A_v', f: 'A − 2bt_f + (t_w + 2r)t_f ≥ h_w t_w', v: Av, u: 'mm²' });
      c.v({ l: 'Plastic shear resistance', s: 'V_pl;Rd', f: 'A_v f_y/(√3 γ_M0)', v: VplRd, u: 'kN', r: '6.2.6', key: true });
      c.chk({ l: 'Shear', s: 'V_Ed/V_pl;Rd', Ed: +i.VEd, Rd: VplRd, u: 'kN', r: '6.2.6', item: 'Shear' });
      const rhoV = i.VEd > 0.5 * VplRd ? Math.pow(2 * i.VEd / VplRd - 1, 2) : 0;
      if (rhoV > 0) c.note(`V_Ed > 0.5 V_pl,Rd: reduced yield strength (1 − ρ) f_y in the shear area, ρ = ${EC.fmt(rhoV, 3)} (6.2.8).`);
      const UN = i.NEd / NcRd, aW = Math.min((p.A - 2 * p.b * p.tf) / p.A, 0.5);
      const MNRd = cls <= 2 ? Math.min(McRd, McRd * (1 - UN) / (1 - 0.5 * aW)) : McRd * (1 - UN);
      c.v({ l: 'Reduced moment resistance for N', s: 'M_N;y;Rd', f: cls <= 2 ? 'M_pl;y;Rd (1 − n)/(1 − 0.5a) ≤ M_pl' : 'linear (class 3)', v: MNRd, u: 'kNm', r: '6.2.9' });
      c.chk({ l: 'Cross-section N + M', s: 'M_y;Ed/M_N;y;Rd', Ed: +i.MEd, Rd: MNRd, u: 'kNm', r: '6.2.9', item: 'Cross-section N + M' });
      if (rhoV > 0) c.ok({ l: 'High shear', cond: false, txt: 'V_Ed > 0.5 V_pl,Rd - reduce M_Rd by 6.2.8 (check manually)', item: 'High shear interaction' });

      c.h1('Flexural buckling');
      const L = i.L * 1000, hb = p.h / p.b;
      const ay = hb > 1.2 ? 0.21 : 0.34, az = hb > 1.2 ? 0.34 : 0.49;
      const lamy = i.ky * L / p.iy / (93.9 * eps), lamz = i.kz * L / p.iz / (93.9 * eps);
      const cy = chi(lamy, ay), cz = chi(lamz, az);
      c.v({ l: 'Non-dimensional slenderness y', s: 'λ̄_y', f: 'L_cr;y/(i_y λ_1),  λ_1 = 93.9ε', v: lamy, u: '', n: `curve ${hb > 1.2 ? 'a' : 'b'}, χ_y = ${EC.fmt(cy, 3)}`, r: '6.3.1.3' });
      c.v({ l: 'Non-dimensional slenderness z', s: 'λ̄_z', v: lamz, u: '', n: `curve ${hb > 1.2 ? 'b' : 'c'}, χ_z = ${EC.fmt(cz, 3)}`, r: 'Table 6.2' });
      const NbRd = Math.min(cy, cz) * p.A * fy / gM1 / 1e3;
      c.v({ l: 'Buckling resistance', s: 'N_b;Rd', f: 'χ_min A f_y/γ_M1', v: NbRd, u: 'kN', key: true });
      c.chk({ l: 'Flexural buckling', s: 'N_Ed/N_b;Rd', Ed: +i.NEd, Rd: NbRd, u: 'kN', r: '6.3.1', item: 'Flexural buckling' });

      c.h1('Lateral-torsional buckling');
      const Lt = i.kLT * L;
      const Mcr = i.C1 * Math.PI ** 2 * E * p.Iz / (Lt * Lt) * Math.sqrt(p.Iw / p.Iz + Lt * Lt * G * p.It / (Math.PI ** 2 * E * p.Iz)) / 1e6;
      c.v({ l: 'Elastic critical moment', s: 'M_cr', f: 'C_1 π²EI_z/L² √(I_w/I_z + L²GI_t/(π²EI_z))', v: Mcr, u: 'kNm', r: 'NCCI / Annex' });
      const lamLT = Math.sqrt(Wy * fy / (Mcr * 1e6));
      const aLT = hb > 2 ? 0.49 : 0.34;
      const phLT = 0.5 * (1 + aLT * (lamLT - 0.4) + 0.75 * lamLT * lamLT);
      let cLT = Math.min(1, 1 / lamLT / lamLT, 1 / (phLT + Math.sqrt(Math.max(phLT * phLT - 0.75 * lamLT * lamLT, 0))));
      c.v({ l: 'LTB slenderness', s: 'λ̄_LT', f: '√(W_y f_y/M_cr)', v: lamLT, u: '', r: '6.3.2.2' });
      c.v({ l: 'Reduction factor (rolled sections)', s: 'χ_LT', f: '1/(Φ + √(Φ² − 0.75 λ̄²)),  λ̄_LT;0 = 0.4, β = 0.75', n: `curve ${hb > 2 ? 'c' : 'b'}`, v: cLT, u: '', r: '6.3.2.3' });
      const MbRd = cLT * Wy * fy / gM1 / 1e6;
      c.v({ l: 'LTB resistance', s: 'M_b;Rd', f: 'χ_LT W_y f_y/γ_M1', v: MbRd, u: 'kNm', key: true });
      c.chk({ l: 'Lateral-torsional buckling', s: 'M_Ed/M_b;Rd', Ed: +i.MEd, Rd: MbRd, u: 'kNm', r: '6.3.2', item: 'Lateral-torsional buckling' });

      c.h1('Member interaction N + M_y');
      const ny = i.NEd / (cy * NcRd), nz = i.NEd / (cz * NcRd), Cm = +i.Cm;
      const kyy = Cm * (1 + Math.min(lamy - 0.2, 0.8) * Math.max(ny, 0));
      const kzy = lamz < 0.4 ? Math.max(0.6 + lamz, 1 - 0.1 * lamz * nz / (Cm - 0.25)) : Math.max(1 - 0.1 * lamz * nz / (Cm - 0.25), 1 - 0.1 * nz / (Cm - 0.25));
      c.v({ l: 'Interaction factors', s: 'k_yy', f: 'C_my (1 + (λ̄_y − 0.2) n_y) ≤ C_my (1 + 0.8 n_y)', v: kyy, u: '', n: `k_zy = ${EC.fmt(kzy, 3)}`, r: 'Annex B' });
      const U61 = ny + kyy * i.MEd / MbRd, U62 = nz + kzy * i.MEd / MbRd;
      c.chk({ l: 'Interaction (6.61)', s: 'N/χ_y N_Rk + k_yy M/χ_LT M_Rk', Ed: U61, Rd: 1, u: '', r: '6.3.3', item: 'Interaction 6.61' });
      c.chk({ l: 'Interaction (6.62)', s: 'N/χ_z N_Rk + k_zy M/χ_LT M_Rk', Ed: U62, Rd: 1, u: '', r: '6.3.3', item: 'Interaction 6.62' });

      c.h1('Serviceability');
      const dl = 5 * i.wk * L ** 4 / (384 * E * p.Iy);
      c.v({ l: 'Deflection (simply supported UDL)', s: 'δ', f: '5 w_k L⁴/(384 E I_y)', v: dl, u: 'mm' });
      c.chk({ l: 'Deflection limit', s: 'δ/(L/' + i.dlim + ')', Ed: dl, Rd: L / i.dlim, u: 'mm', r: 'EN 1990 A1.4 [NDP]', item: 'Deflection' });

      const spec = [['Section', `${i.sec} (${EC.fmt(p.mass, 1)} kg/m), class ${cls}`], ['Grade', `S${i.fy} to EN 10025-2, f_y = ${fy} MPa`], ['Length', `${i.L} m, L_cr,y = ${EC.fmt(i.ky * i.L)} m, L_cr,z = ${EC.fmt(i.kz * i.L)} m, L_LT = ${EC.fmt(i.kLT * i.L)} m`], ['Resistances', `N_b,Rd = ${EC.fmt(NbRd, 0)} kN, M_b,Rd = ${EC.fmt(MbRd, 0)} kNm, V_pl,Rd = ${EC.fmt(VplRd, 0)} kN`], ['Protection', 'Corrosion protection / fire protection per project specification'], ['Connections', `Design end connections for V_Ed = ${i.VEd} kN (EN 1993-1-8)`]];
      const bars = [];
      return c.result({ spec, bars, steelMass: p.mass * i.L, svg: drawS(p, i) });
    }
  };
  function drawS(p, i) {
    const sc = 220 / Math.max(p.h, p.b), ox = 80, oy = 40, W = p.b * sc, H = p.h * sc, tw = Math.max(p.tw * sc, 1.5), tf = Math.max(p.tf * sc, 1.5);
    const x0 = ox, xm = ox + W / 2;
    const d = `M${x0},${oy} h${W} v${tf} h${-(W - tw) / 2} v${H - 2 * tf} h${(W - tw) / 2} v${tf} h${-W} v${-tf} h${(W - tw) / 2} v${-(H - 2 * tf)} h${-(W - tw) / 2} Z`;
    let s = EC.svg.open(420, H + 90);
    s += EC.svg.label(ox, 22, i.sec + ' – S' + i.fy, 'ttl');
    s += `<path class="steel" d="${d}"/>`;
    s += EC.svg.dimH(ox, ox + W, oy + H + 20, `b = ${p.b}`);
    s += EC.svg.dimV(ox - 20, oy, oy + H, `h = ${p.h}`);
    s += EC.svg.label(xm + tw + 8, oy + H / 2, `t_w = ${p.tw}`);
    s += EC.svg.label(ox + W + 8, oy + tf + 4, `t_f = ${p.tf}`);
    return s + '</svg>';
  }
})();
