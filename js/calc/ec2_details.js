/* EC2 connections & details: corbel, dapped end, frame corner, beam-column joint, interface shear, anchorage & laps */
(function () {
  const F = EC.F, fmt = EC.fmt;
  const def = o => Object.assign({ schedCols: [], sched: () => ({}) }, o);
  const mlines = (c, m) => {
    c.h1('Materials');
    c.inp('Concrete class', 'f_ck', m.fck, 'MPa', 'Table 5.1');
    c.v({ l: 'Design compressive strength', s: 'f_cd', f: 'η_cc f_ck/γ_C', v: m.fcd, u: 'MPa', r: '5.1.6', key: true });
    c.v({ l: 'Design yield strength', s: 'f_yd', f: 'f_yk/γ_S', v: m.fyd, u: 'MPa', r: '5.2.4', key: true });
    const nu = 1 - m.fck / 250;
    c.v({ l: 'Strength reduction for cracked concrete', s: 'ν\'', f: '1 − f_ck/250', v: nu, u: '', r: '8.5 [2004 6.5 form - verify]' });
    return nu;
  };
  const mandrel = (c, phi, Fbt, ab, m) => {
    const req = Fbt * 1e3 * (1 / ab + 1 / (2 * phi)) / m.fcd;
    const std = phi <= 16 ? 4 * phi : 7 * phi;
    c.v({ l: 'Minimum mandrel against crushing', s: 'ϕ_m;min', f: 'F_bt (1/a_b + 1/(2ϕ))/f_cd', v: req, u: 'mm', r: '11.? (2004 Eq. 8.1)' });
    c.v({ l: 'Standard mandrel', s: 'ϕ_m;std', f: 'ϕ ≤ 16: 4ϕ, ϕ > 16: 7ϕ', v: std, u: 'mm', r: 'Table 11.1' });
    return Math.ceil(Math.max(req, std) / 5) * 5;
  };

  /* ---------------- Corbel ---------------- */
  EC.modules.corbel = def({
    type: 'corbel', name: 'Corbel / Bracket (STM)', cat: 'details', prefix: 'CB', icon: 'detail', code: 'EN 1992-1-1:2023', mathcad: 'Corbel_Design',
    groups: [
      { t: 'Geometry', f: [F('b', 'Corbel width b', 'mm', 400), F('h', 'Depth at column face h_c', 'mm', 600), F('ac', 'Load from column face a_c', 'mm', 250), F('lc', 'Corbel projection', 'mm', 450), F('pl', 'Bearing plate length (along a)', 'mm', 150), F('pw', 'Bearing plate width', 'mm', 300), F('hcol', 'Column depth', 'mm', 500)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 40, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 35)] },
      { t: 'ULS actions', f: [F('F', 'Vertical load F_Ed', 'kN', 650), F('H', 'Horizontal load H_Ed', 'kN', 130), F('psi', 'SLS ratio', '', 0.65)] },
      { t: 'Reinforcement', f: [F('nt', 'Main tie bars n', 'no', 4), F('dt', 'Main tie ϕ', 'mm', 20, EC.barOpts), F('nl', 'Horizontal closed links n', 'no', 4), F('dl', 'Link ϕ', 'mm', 12, EC.barOpts), F('tie', 'Tie end', '', 'loop', [{ v: 'loop', l: 'Loop / U-bar in plan' }, { v: 'weld', l: 'Welded cross bar' }])] }
    ],
    schedCols: [['geo', 'b × h, a_c'], ['F', 'F / H (kN)'], ['tie', 'Main tie'], ['links', 'Links']],
    sched: i => ({ geo: `${i.b}×${i.h}, ${i.ac}`, F: `${i.F} / ${i.H}`, tie: `${i.nt}H${i.dt}`, links: `${i.nl}H${i.dl}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b, h = +i.h, ac = +i.ac;
      c.text('RC corbel by strut-and-tie (8.5, Annex J of the 2004 edition): lever arm from the CCC node at the column, primary tie with horizontal load, strut and node stresses, horizontal / vertical links, anchorage of the tie and SLS tie stress.');
      const nu = mlines(c, m);
      c.h1('Strut-and-tie model');
      const d = h - i.cnom - i.dt / 2;
      c.q('Effective depth', 'd', 'h_c − c − ϕ/2', d, 'mm');
      c.ok({ l: 'Corbel type', cond: ac <= d, txt: ac <= 0.5 * h ? 'a_c ≤ 0.5 h_c: short corbel - closed horizontal links' : 'a_c > 0.5 h_c: closed vertical links needed', item: false });
      let z = 0.9 * d;
      for (let k = 0; k < 30; k++) { const Fc = i.F * 1e3 * ac / z; const x = Fc / (b * nu * m.fcd); z = d - x / 2; }
      z = Math.min(z, 0.9 * d);
      const xn = 2 * (d - z);
      c.v({ l: 'Lever arm (iterated)', s: 'z_0', f: 'd − x/2,  x = F a_c/(z b ν\' f_cd)', v: z, u: 'mm', key: true });
      const th = Math.atan(z / ac);
      c.q('Strut angle', 'θ', 'atan(z_0/a_c)', EC.deg(th), '°');
      c.ok({ l: 'Strut angle range', cond: th >= EC.rad(45) - 1e-9 || ac <= z, txt: `1.0 ≤ tan θ ≤ 2.5 recommended - tan θ = ${fmt(Math.tan(th))}`, item: 'Strut angle', r: 'Annex J' });
      const Ft = i.F * ac / z + i.H * (i.cnom + i.dt / 2 + z) / z;
      c.v({ l: 'Tie force', s: 'F_td', f: 'F_Ed a_c/z_0 + H_Ed (a_H + z_0)/z_0', v: Ft, u: 'kN', key: true, r: 'Annex J' });
      const As = i.nt * EC.barA(i.dt);
      c.c('Main tie', 'F_td/(A_s f_yd)', Ft * 1e3 / m.fyd, As, 'mm²', '8.5', 'Main tie', 'A_s;req = F_td/f_yd');
      c.h1('Nodes and strut');
      c.c('Bearing node (CCT)', 'σ', i.F * 1e3 / (i.pl * i.pw), 0.85 * nu * m.fcd, 'MPa', '8.5.4 [k = 0.85]', 'Loading node CCT');
      c.c('Column node (CCC)', 'σ', i.F * 1e3 / Math.tan(th) / (b * Math.max(xn, 1)) , nu * m.fcd, 'MPa', '8.5.4', 'Column node CCC');
      const Fs = i.F / Math.sin(th), ws = i.pl * Math.sin(th) + 2 * (i.cnom + i.dt / 2) * Math.cos(th);
      c.c('Inclined strut', 'σ_c', Fs * 1e3 / (b * ws), 0.6 * nu * m.fcd, 'MPa', '8.5.2', 'Inclined strut', 'F/sinθ / (b w) ≤ 0.6 ν\' f_cd');
      c.h1('Secondary reinforcement');
      const Al = i.nl * 2 * EC.barA(i.dl);
      if (ac <= 0.5 * h) c.c('Closed horizontal links', 'A_s;lnk', 0.25 * As, Al, 'mm²', 'Annex J.3 [practice]', 'Horizontal links', '≥ 0.25 A_s;main');
      else c.c('Closed vertical links', 'A_s;v', 0.5 * i.F * 1e3 / m.fyd, Al, 'mm²', 'Annex J.3', 'Vertical links', '≥ 0.5 F_Ed/f_yd');
      c.h1('Anchorage');
      const lbd = EC.anchorage(c, { phi: +i.dt, m, sigma: Ft * 1e3 / As, cd: +i.cnom, what: 'tie into column' });
      c.c('Anchorage into column', 'l_bd', lbd, +i.hcol - i.cnom + 12 * i.dt, 'mm', '11.4 (bend down in column)', 'Tie anchorage in column');
      c.ok({ l: 'Front anchorage of tie', cond: i.lc - ac - i.pl / 2 >= i.cnom + i.dt, txt: (i.tie === 'loop' ? 'U-loop in plan' : 'welded transverse bar') + ` - bearing plate edge to corbel front = ${fmt(i.lc - ac - i.pl / 2, 0)} mm ≥ c + ϕ`, item: 'Front anchorage', r: 'Annex J' });
      const ss = i.psi * Ft * 1e3 / As;
      c.c('SLS tie stress', 'σ_s', ss, 0.8 * m.fyk, 'MPa', '9.2', 'SLS tie stress');
      const sc = 0.35, ox = 260, oy = 50, H = h * sc, A = i.lc * sc;
      const svg = EC.sketch(560, H + 120, 'ELEVATION - STM', [{ c: 'conc', r: [ox - i.hcol * sc, 20, i.hcol * sc, H + 90] }, { c: 'conc', p: [[ox, oy], [ox + A, oy], [ox + A, oy + H * 0.5], [ox, oy + H]] }, { c: 'rebarline', l: [[ox - i.hcol * sc + 15, oy + 6 + 60], [ox - i.hcol * sc + 15, oy + 6], [ox + A - 6, oy + 6]] }, { c: 'strut', l: [[ox + ac * sc, oy + 6], [ox + 4, oy + z * sc]] }, { c: 'colfill', r: [ox + ac * sc - i.pl * sc / 2, oy - 8, i.pl * sc, 8] }, { t: [ox + ac * sc, oy - 14, `F = ${i.F} kN`, 'lbl', 'middle'] }, { t: [ox + 10, oy + 20, `F_t = ${fmt(Ft, 0)} kN`] }, { dh: [ox, ox + ac * sc, oy + H + 20, `a_c = ${ac}`] }]);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Corbel', `${b} wide, h_c = ${h}, projection ${i.lc}, a_c = ${ac} mm`], ['Main tie', `${i.nt}H${i.dt}, ${i.tie === 'loop' ? 'U-loops' : 'welded cross bar'} at front, bent down into column`], ['Links', `${i.nl} closed H${i.dl} ${ac <= 0.5 * h ? 'horizontal' : 'vertical'}`], ['Bearing', `${i.pl} × ${i.pw} mm plate / pad`]], bars: [], svg });
    }
  });

  /* ---------------- Dapped end ---------------- */
  EC.modules.dappedend = def({
    type: 'dappedend', name: 'Dapped End / Half Joint', cat: 'details', prefix: 'DE', icon: 'detail', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\DappedEnd_Design',
    groups: [
      { t: 'Geometry', f: [F('b', 'Width b', 'mm', 400), F('h', 'Full depth h', 'mm', 800), F('hn', 'Nib depth h_n', 'mm', 400), F('ln', 'Nib length l_n', 'mm', 300), F('an', 'Reaction from re-entrant corner a', 'mm', 150), F('pl', 'Bearing pad length', 'mm', 150)] },
      { t: 'Materials', f: [F('fck', 'Concrete class', '', 40, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('cnom', 'Cover', 'mm', 35)] },
      { t: 'ULS actions', f: [F('V', 'Reaction V_Ed', 'kN', 450), F('H', 'Restraint H_Ed', 'kN', 90), F('kd', 'Share by inclined bars k_d', '', 0)] },
      { t: 'Reinforcement', f: [F('nh', 'Hanger link legs', 'no', 10), F('dh', 'Hanger ϕ', 'mm', 12, EC.barOpts), F('nn', 'Nib tie bars n', 'no', 5), F('dn', 'Nib tie ϕ', 'mm', 16, EC.barOpts), F('nb', 'Main bottom bars n', 'no', 4), F('db', 'Main bottom ϕ', 'mm', 25, EC.barOpts), F('ni', 'Inclined bars n', 'no', 0), F('di', 'Inclined ϕ', 'mm', 16, EC.barOpts)] }
    ],
    schedCols: [['geo', 'h / h_n'], ['V', 'V / H (kN)'], ['hang', 'Hangers'], ['nib', 'Nib tie']],
    sched: i => ({ geo: `${i.h}/${i.hn}`, V: `${i.V}/${i.H}`, hang: `${i.nh} legs H${i.dh}`, nib: `${i.nn}H${i.dn}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b, kd = EC.clamp(+i.kd, 0, 0.5);
      c.text('Dapped end (half joint) of a precast beam by strut-and-tie: vertical hanger links at the re-entrant corner, nib horizontal tie with restraint force, optional inclined bars carrying k_d V, bearing node, nib strut, main bar anchorage beyond the hangers.');
      const nu = mlines(c, m);
      c.h1('Nib model');
      const dn = i.hn - i.cnom - i.dn / 2, zn = 0.85 * dn, a = +i.an + 0.5 * i.cnom;
      c.q('Nib lever arm', 'z_n', '0.85 d_n', zn, 'mm', '[practice]');
      const Vv = (1 - kd) * i.V;
      const Tn = Vv * a / zn + i.H * (zn + i.cnom + i.dn / 2) / zn;
      c.v({ l: 'Nib tie force', s: 'F_tn', f: '(1 − k_d) V a/z_n + H (z_n + a_H)/z_n', v: Tn, u: 'kN', key: true });
      c.c('Nib tie', 'F_tn/(A_s f_yd)', Tn * 1e3 / m.fyd, i.nn * EC.barA(i.dn), 'mm²', '8.5', 'Nib tie');
      c.h1('Hanger links');
      const Fh = Vv;
      c.v({ l: 'Hanger force', s: 'F_h', f: '(1 − k_d) V_Ed', v: Fh, u: 'kN', key: true });
      c.c('Hanger links (within h/2 of the corner)', 'F_h/(A_sh f_yd)', Fh * 1e3 / m.fyd, i.nh * EC.barA(i.dh), 'mm²', '8.5', 'Hanger links');
      if (kd > 0) c.c('Inclined bars', 'k_d V √2/(A f_yd)', kd * i.V * Math.SQRT2 * 1e3 / m.fyd, i.ni * EC.barA(i.di), 'mm²', '8.5', 'Inclined bars');
      c.h1('Nodes and strut');
      c.c('Bearing node (CCT)', 'σ', i.V * 1e3 / (b * i.pl), 0.85 * nu * m.fcd, 'MPa', '8.5.4', 'Bearing node');
      const th = Math.atan(zn / a), w = i.pl * Math.sin(th) + 2 * (i.cnom + i.dn / 2) * Math.cos(th);
      c.c('Nib strut', 'σ_c', Vv / Math.sin(th) * 1e3 / (b * w), 0.6 * nu * m.fcd, 'MPa', '8.5.2', 'Nib strut');
      c.c('Web crushing at re-entrant corner', 'V/(b z ν f_cd/2)', i.V * 1e3, b * 0.9 * (i.h - i.cnom - i.db / 2) * 0.6 * nu * m.fcd / 2, 'N', '8.2.3', 'Web crushing');
      c.h1('Anchorage');
      const lbn = EC.anchorage(c, { phi: +i.dn, m, sigma: Tn * 1e3 / (i.nn * EC.barA(i.dn)), cd: +i.cnom, what: 'nib tie beyond hangers' });
      const lbm = EC.anchorage(c, { phi: +i.db, m, sigma: m.fyd * 0.6, cd: +i.cnom, what: 'main bottom bars beyond hanger' });
      c.c('Main bars past the hanger zone', 'l_bd', lbm, i.h - i.cnom, 'mm', '11.4 [extend main bars ≥ l_bd beyond the hanger links]', 'Main bar anchorage');
      c.c('SLS stress at re-entrant corner', 'σ_s', 0.65 * Fh * 1e3 / (i.nh * EC.barA(i.dh)), 0.8 * m.fyk, 'MPa', '9.2', 'SLS hanger stress');
      const sc = 0.32, ox = 40, oy = 40, H = i.h * sc, Hn = i.hn * sc, Ln = i.ln * sc;
      const svg = EC.sketch(560, H + 90, 'DAPPED END ELEVATION', [{ c: 'conc', p: [[ox, oy + H - Hn], [ox + Ln, oy + H - Hn], [ox + Ln, oy + H], [ox + 460, oy + H], [ox + 460, oy], [ox, oy]] }, { c: 'rebarline', l: [[ox + 8, oy + H - Hn + 0], [ox + 8, oy + H - Hn + Hn * 0.15]] }, { c: 'rebarline', l: [[ox + 6, oy + H - Hn - 10 + Hn * 0.2], [ox + Ln + 40 + lbn * sc, oy + H - Hn - 10 + Hn * 0.2]] }, { c: 'linkline', l: [[ox + Ln + 10, oy + 8], [ox + Ln + 10, oy + H - 8]] }, { c: 'linkline', l: [[ox + Ln + 22, oy + 8], [ox + Ln + 22, oy + H - 8]] }, { c: 'rebarline', l: [[ox + Ln + 4, oy + H - 8], [ox + 455, oy + H - 8]] }, { c: 'strut', l: [[ox + i.an * sc, oy + H - Hn - 4 + Hn], [ox + Ln + 16, oy + H - Hn + 6]] }, { t: [ox + Ln + 28, oy + H / 2, 'hangers'] }, { t: [ox, oy + H + 22, `V = ${i.V} kN, nib tie ${i.nn}H${i.dn}`] }]);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Geometry', `h = ${i.h}, nib ${i.hn} × ${i.ln} mm`], ['Hangers', `${i.nh} legs H${i.dh} within h/2 of the corner`], ['Nib tie', `${i.nn}H${i.dn} U-bars, l_bd = ${lbn} mm beyond hangers`], ['Main bars', `${i.nb}H${i.db} past the hangers by ≥ ${lbm} mm`]], bars: [], svg });
    }
  });

  /* ---------------- Frame corner ---------------- */
  EC.modules.framecorner = def({
    type: 'framecorner', name: 'Frame Corner (knee joint)', cat: 'details', prefix: 'FC', icon: 'detail', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\FrameCorner_Design',
    groups: [
      { t: 'Geometry', f: [F('b', 'Width b', 'mm', 400), F('hb', 'Beam depth h_b', 'mm', 650), F('hc', 'Column depth h_c', 'mm', 550), F('cnom', 'Cover', 'mm', 35), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500)] },
      { t: 'Actions', f: [F('M', 'Corner moment M_Ed', 'kNm', 420), F('mode', 'Moment', '', 'close', [{ v: 'close', l: 'Closing (tension outside)' }, { v: 'open', l: 'Opening (tension inside)' }])] },
      { t: 'Reinforcement', f: [F('n', 'Main bars n', 'no', 4), F('d', 'Main ϕ', 'mm', 25, EC.barOpts), F('ni', 'Inclined bars n (opening)', 'no', 3), F('di', 'Inclined ϕ', 'mm', 16, EC.barOpts), F('nl', 'Joint links n', 'no', 4), F('dl', 'Link ϕ', 'mm', 12, EC.barOpts)] }
    ],
    schedCols: [['geo', 'h_b / h_c'], ['M', 'M (kNm)'], ['bars', 'Main'], ['mode', 'Mode']],
    sched: i => ({ geo: `${i.hb}/${i.hc}`, M: i.M, bars: `${i.n}H${i.d}`, mode: i.mode }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), b = +i.b;
      c.text('Frame corner between a beam and an end column (2004 Annex J.2 practice): face forces, diagonal strut / node, mandrel diameter of the corner bars, depth ratio (closing) or inclined bars and joint links (opening), anchorage.');
      const nu = mlines(c, m);
      c.h1('Face forces');
      const db = i.hb - i.cnom - 10 - i.d / 2, dc = i.hc - i.cnom - 10 - i.d / 2;
      const As = i.n * EC.barA(i.d), zb = 0.9 * db, zc = 0.9 * dc;
      const Tb = i.M * 1e3 / zb, Tc = i.M * 1e3 / zc;
      c.q('Beam tension force', 'T_b', 'M/z_b', Tb, 'kN');
      c.q('Column tension force', 'T_c', 'M/z_c', Tc, 'kN');
      c.c('Main bars (beam face)', 'T/(A_s f_yd)', Tb * 1e3 / m.fyd, As, 'mm²', '8.1', 'Main bars');
      c.h1('Diagonal strut and node');
      const C = Math.hypot(Tb, Tc), th = Math.atan(zb / zc);
      c.q('Diagonal force', 'F_d', '√(T_b² + T_c²)', C, 'kN');
      const xb = Tb * 1e3 / (b * m.fcd * 0.8), w = Math.hypot(xb, Tc * 1e3 / (b * m.fcd * 0.8));
      c.c('Diagonal strut stress', 'σ_c', C * 1e3 / (b * w), nu * m.fcd, 'MPa', '8.5', 'Corner node');
      if (i.mode === 'close') {
        c.h1('Closing moment');
        const r = i.hb / i.hc;
        c.ok({ l: 'Depth ratio', cond: r >= 2 / 3 && r <= 1.5, txt: `h_b/h_c = ${fmt(r)} (2/3 … 3/2: no inclined links needed)`, item: 'Depth ratio', r: 'Annex J.2.2' });
        const sp = (b - 2 * (i.cnom + 10) - i.d) / Math.max(i.n - 1, 1);
        const phm = mandrel(c, +i.d, Tb / i.n, Math.min(sp / 2, i.cnom + 10 + i.d / 2), m);
        c.v({ l: 'Mandrel to specify', s: 'ϕ_m', v: phm, u: 'mm', key: true });
      } else {
        c.h1('Opening moment');
        const rho = As / (b * db);
        c.c('Reinforcement ratio of the corner', 'ρ', rho, 0.02, '', 'Annex J.2.3 [practice ≤ 2 %]', 'Ratio for opening corner');
        const Ai = i.ni * EC.barA(i.di);
        c.c('Inclined bar across the corner', 'A_s;incl', 0.5 * As, Ai, 'mm²', 'Annex J.2.3', 'Inclined bars', '≥ 50 % of main steel');
        const Al = i.nl * 2 * EC.barA(i.dl);
        c.c('Joint links (diagonal tension)', 'A_sw', (Tb * 1e3 / m.fyd - Ai) * 0.5, Al, 'mm²', '[practice]', 'Joint links');
      }
      c.h1('Anchorage');
      const lbd = EC.anchorage(c, { phi: +i.d, m, sigma: m.fyd, cd: +i.cnom + 10, what: 'corner bars' });
      c.note(`Lap the corner bars outside the joint: l_0 ≈ 1.2 l_bd = ${fmt(Math.ceil(1.2 * lbd / 10) * 10, 0)} mm, or run them continuously round the corner.`);
      const sc = 0.3;
      const svg = EC.sketch(460, 360, 'CORNER', [{ c: 'conc', p: [[40, 40], [400, 40], [400, 40 + i.hb * sc], [40 + i.hc * sc, 40 + i.hb * sc], [40 + i.hc * sc, 340], [40, 340]] }, { c: 'rebarline', l: [[400, i.mode === 'close' ? 52 : 40 + i.hb * sc - 12], [i.mode === 'close' ? 52 : 40 + i.hc * sc - 12, i.mode === 'close' ? 52 : 40 + i.hb * sc - 12], [i.mode === 'close' ? 52 : 40 + i.hc * sc - 12, 340]] }, { c: 'strut', l: [[40 + i.hc * sc, 40 + i.hb * sc], [52, 52]] }, { t: [200, 40 + i.hb * sc + 18, `M = ${i.M} kNm (${i.mode === 'close' ? 'closing' : 'opening'})`] }]);
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Corner', `beam ${i.hb}, column ${i.hc}, width ${b} mm`], ['Main bars', `${i.n}H${i.d} continuous round the corner`], ['Opening corner', i.mode === 'open' ? `${i.ni}H${i.di} inclined + ${i.nl} H${i.dl} links` : 'not applicable']], bars: [], svg });
    }
  });

  /* ---------------- Beam-column joint ---------------- */
  EC.modules.bcjoint = def({
    type: 'bcjoint', name: 'Beam-Column Joint (exterior)', cat: 'details', prefix: 'BJ', icon: 'detail', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\BeamColumnJoint_Design',
    groups: [
      { t: 'Geometry', f: [F('bc', 'Column width b_c', 'mm', 450), F('hc', 'Column depth h_c', 'mm', 500), F('bb', 'Beam width b_b', 'mm', 350), F('hb', 'Beam depth h_b', 'mm', 650), F('cnom', 'Cover', 'mm', 35), F('fck', 'Concrete class', '', 35, EC.CONC), F('fyk', 'f_yk', 'MPa', 500)] },
      { t: 'Actions', f: [F('M', 'Beam hogging moment M_Ed', 'kNm', 320), F('Vb', 'Beam shear V_Ed', 'kN', 210), F('Vc', 'Column shear above joint', 'kN', 60)] },
      { t: 'Reinforcement', f: [F('nt', 'Beam top bars n', 'no', 4), F('dt', 'Top ϕ', 'mm', 25, EC.barOpts), F('nbb', 'Beam bottom bars n', 'no', 3), F('dbb', 'Bottom ϕ', 'mm', 20, EC.barOpts), F('nj', 'Horizontal joint links n', 'no', 4), F('dj', 'Joint link ϕ', 'mm', 12, EC.barOpts)] }
    ],
    schedCols: [['col', 'Column'], ['beam', 'Beam'], ['top', 'Top bars'], ['links', 'Joint links']],
    sched: i => ({ col: `${i.bc}×${i.hc}`, beam: `${i.bb}×${i.hb}`, top: `${i.nt}H${i.dt}`, links: `${i.nj}H${i.dj}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk);
      c.text('Exterior beam-column joint, non-seismic, hogging beam: top bar tension, horizontal joint shear, compression field in the joint panel, cracking and horizontal joint links, L-bar mandrel and anchorage, bottom bars by the shift rule.');
      const nu = mlines(c, m);
      c.h1('Joint shear');
      const d = i.hb - i.cnom - 10 - i.dt / 2, z = 0.9 * d, As = i.nt * EC.barA(i.dt);
      const T = Math.min(i.M * 1e3 / z, As * m.fyd / 1e3);
      c.q('Top bar tension', 'T', 'M_Ed/z ≤ A_s f_yd', T, 'kN');
      c.c('Beam top steel', 'M/(z A_s f_yd)', i.M * 1e3 / z, As * m.fyd / 1e3, 'kN', '8.1', 'Beam top steel');
      const Vjh = T - i.Vc;
      c.v({ l: 'Horizontal joint shear', s: 'V_jh', f: 'T − V_col', v: Vjh, u: 'kN', key: true });
      const bj = Math.min(Math.max(i.bc, i.bb), i.bb + i.hc / 2), zc = i.hc - 2 * (i.cnom + 10) - i.dt;
      const th = Math.atan(z / zc);
      const VRd = nu * m.fcd * bj * i.hc * Math.sin(th) * Math.cos(th) / 1e3;
      c.q('Effective joint width', 'b_j', 'min(max(b_c, b_b), b_b + h_c/2)', bj, 'mm', '[practice]');
      c.v({ l: 'Joint compression field resistance', s: 'V_Rd;j', f: 'ν\' f_cd b_j h_c sinθ cosθ,  θ = atan(z_b/z_c)', v: VRd, u: 'kN', r: '[practice]', key: true });
      c.c('Joint panel', 'V_jh/V_Rd;j', Vjh, VRd, 'kN', '[practice]', 'Joint compression field');
      const fctd = 0.7 * m.fctm / 1.5, tj = Vjh * 1e3 / (bj * i.hc);
      c.q('Joint shear stress', 'τ_j', 'V_jh/(b_j h_c)', tj, 'MPa');
      const need = tj > fctd ? 0.5 * Vjh * 1e3 / m.fyd : 0;
      if (tj <= fctd) c.note('τ_j ≤ f_ctd: joint uncracked - nominal links only.');
      c.c('Horizontal joint links', 'A_sj', need, i.nj * 2 * EC.barA(i.dj), 'mm²', '[practice: 0.5 V_jh/f_yd]', 'Joint links');
      c.h1('Bar anchorage in the joint');
      const sp = (i.bb - 2 * (i.cnom + 10) - i.dt) / Math.max(i.nt - 1, 1);
      const phm = mandrel(c, +i.dt, T / i.nt, Math.min(sp / 2, i.cnom + 10 + i.dt / 2), m);
      c.v({ l: 'Mandrel to specify', s: 'ϕ_m', v: phm, u: 'mm', key: true });
      const lbd = EC.anchorage(c, { phi: +i.dt, m, sigma: T * 1e3 / As, cd: +i.cnom + 10, poor: true, what: 'top L-bars' });
      const avail = (i.hc - i.cnom - 10 - i.dt) + (i.hb - 2 * i.cnom);
      c.c('L-bar length available (horizontal + down)', 'l_bd', lbd, avail, 'mm', '11.4', 'Top bar anchorage');
      const FE = i.Vb * 1.5 / 2;
      const lbb = EC.anchorage(c, { phi: +i.dbb, m, sigma: FE * 1e3 / (i.nbb * EC.barA(i.dbb)), cd: +i.cnom + 10, what: 'bottom bars, F_E = V cotθ/2' });
      c.c('Bottom bars into the joint', 'l_bd', lbb, i.hc - i.cnom - 10, 'mm', '12.2', 'Bottom bar anchorage');
      return c.result({ spec: [['Concrete', EC.concName(i.fck)], ['Joint', `column ${i.bc}×${i.hc}, beam ${i.bb}×${i.hb}`], ['Top bars', `${i.nt}H${i.dt} L-bars, mandrel ϕ_m = ${phm} mm, down the column`], ['Joint links', `${i.nj} closed H${i.dj} in the joint`], ['Bottom bars', `${i.nbb}H${i.dbb}, l_bd = ${lbb} mm into joint`]], bars: [], svg: '' });
    }
  });

  /* ---------------- Interface shear ---------------- */
  const SURF = [{ v: 'vs', l: 'Very smooth (steel / plastic formed)', c: 0.025, mu: 0.5 }, { v: 's', l: 'Smooth (slipformed / extruded)', c: 0.2, mu: 0.6 }, { v: 'r', l: 'Rough (≥ 3 mm at 40 mm spacing)', c: 0.4, mu: 0.7 }, { v: 'i', l: 'Indented', c: 0.5, mu: 0.9 }];
  EC.modules.interface = def({
    type: 'interface', name: 'Interface Shear (composite)', cat: 'details', prefix: 'IF', icon: 'detail', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Interface_Design',
    groups: [
      { t: 'Member', f: [F('L', 'Span (UDL, simply supported)', 'm', 7.2), F('V', 'Support shear V_Ed', 'kN', 260), F('bi', 'Interface width b_i', 'mm', 300), F('d', 'Effective depth d', 'mm', 560), F('beta', 'Share of force in new concrete β', '', 1.0), F('sn', 'Normal stress σ_n (comp. +)', 'MPa', 0)] },
      { t: 'Interface', f: [F('surf', 'Surface', '', 'r', SURF), F('fck', 'Weaker concrete', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('dyn', 'Dynamic / fatigue loading', '', 'no', [{ v: 'no', l: 'No' }, { v: 'yes', l: 'Yes (c halved)' }])] },
      { t: 'Connecting steel', f: [F('legs', 'Legs crossing per link', 'no', 2), F('dw', 'Link ϕ', 'mm', 12, EC.barOpts), F('sw', 'Spacing near support', 'mm', 150), F('alpha', 'Link angle α', '°', 90)] }
    ],
    schedCols: [['bi', 'b_i'], ['surf', 'Surface'], ['links', 'Links']],
    sched: i => ({ bi: i.bi, surf: (SURF.find(s => s.v === i.surf) || {}).l, links: `${i.legs}×H${i.dw}@${i.sw}` }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), S = SURF.find(s => s.v === i.surf) || SURF[2];
      c.text('Shear at the interface between concretes cast at different times (precast + topping, construction joints): interface stress, surface class, adhesion, friction, clamping and dowel action of the crossing steel. Coefficients of EN 1992-1-1:2004 6.2.5 [verify against 2023 8.2.6].');
      mlines(c, m);
      c.h1('Interface stress');
      const z = 0.9 * i.d;
      const tE = i.beta * i.V * 1e3 / (z * i.bi);
      c.v({ l: 'Interface shear stress', s: 'v_Edi', f: 'β V_Ed/(z b_i)', v: tE, u: 'MPa', key: true });
      c.h1('Interface resistance');
      const cc = S.c * (i.dyn === 'yes' ? 0.5 : 1), fctd = 0.7 * m.fctm / 1.5, al = EC.rad(+i.alpha);
      c.q('Surface coefficients', 'c', S.l, cc, '', 'Table', false); c.q('', 'μ', '', S.mu, '');
      const rho = i.legs * EC.barA(i.dw) / (i.bi * i.sw);
      c.q('Steel ratio crossing the interface', 'ρ', 'A_s/(b_i s)', rho, '');
      const nu = 0.6 * (1 - m.fck / 250);
      const vR = Math.min(cc * fctd + S.mu * Math.min(i.sn, 0.6 * m.fcd) + rho * m.fyd * (S.mu * Math.sin(al) + Math.cos(al)), 0.5 * nu * m.fcd);
      c.v({ l: 'Interface resistance', s: 'v_Rdi', f: 'c f_ctd + μ σ_n + ρ f_yd (μ sinα + cosα) ≤ 0.5 ν f_cd', v: vR, u: 'MPa', key: true });
      c.c('Interface shear', 'v_Edi/v_Rdi', tE, vR, 'MPa', '6.2.5 (2004)', 'Interface shear');
      const rreq = Math.max(0, (tE - cc * fctd - S.mu * i.sn) / (m.fyd * (S.mu * Math.sin(al) + Math.cos(al))));
      c.q('Required steel ratio', 'ρ_req', '(v_Edi − c f_ctd − μσ_n)/(f_yd (μ sinα + cosα))', rreq, '');
      const pts = [], cap = [];
      for (let k = 0; k <= 20; k++) { const x = k / 20 * i.L / 2; const v = i.beta * i.V * (1 - 2 * x / i.L) * 1e3 / (z * i.bi); pts.push([x, v]); cap.push([x, vR]); }
      const svg = EC.plot({ title: 'Interface stress along half span', xl: 'x (m)', yl: 'v (MPa)', series: [{ name: 'v_Edi', pts }, { name: 'v_Rdi', pts: cap, cls: 2, dash: true }], legend: true });
      return c.result({ spec: [['Interface', `${S.l}, b_i = ${i.bi} mm`], ['Links', `${i.legs} legs H${i.dw} @ ${i.sw} near supports, anchored both sides of the joint`], ['Preparation', 'clean, saturated surface-dry, laitance removed before casting the topping']], bars: [], svg });
    }
  });

  /* ---------------- Anchorage & laps ---------------- */
  EC.modules.anchorage = def({
    type: 'anchorage', name: 'Anchorage & Lap Lengths', cat: 'details', prefix: 'AL', icon: 'detail', code: 'EN 1992-1-1:2023', mathcad: 'EC2_Concrete\\Anchorage_Design',
    groups: [
      { t: 'Bar', f: [F('phi', 'Bar ϕ', 'mm', 20, EC.barOpts), F('fck', 'Concrete class', '', 30, EC.CONC), F('fyk', 'f_yk', 'MPa', 500), F('ratio', 'A_s;req/A_s;prov (stress ratio)', '', 1.0), F('bond', 'Bond condition', '', 'good', [{ v: 'good', l: 'Good' }, { v: 'poor', l: 'Poor (top bars, h > 250)' }]), F('ten', 'Force', '', 't', [{ v: 't', l: 'Tension' }, { v: 'c', l: 'Compression' }])] },
      { t: 'Cover & spacing', f: [F('cx', 'Side cover c_x', 'mm', 40), F('cy', 'Cover c_y', 'mm', 35), F('s', 'Clear spacing s', 'mm', 100), F('end', 'Bar end', '', 'str', [{ v: 'str', l: 'Straight' }, { v: 'bend', l: 'Bend / hook' }])] }
    ],
    schedCols: [['phi', 'ϕ'], ['lbd', 'l_bd (mm)'], ['l0', 'l_0 (mm)']],
    sched: (i, r) => ({ phi: i.phi, lbd: r && r.lbd, l0: r && r.l0 }),
    calc(i) {
      const c = new EC.Calc(), m = EC.mat(i.fck, i.fyk), phi = +i.phi;
      c.text('Design anchorage length l_bd and lap length l_0 for one design bar (EN 1992-1-1:2023 Section 11, Eq. 11.3), with mandrel diameter and a table for a set of bar sizes.');
      c.h1('Inputs');
      const sig = Math.min(1, +i.ratio) * m.fyd;
      c.q('Design bar stress', 'σ_sd', 'f_yd A_s;req/A_s;prov', sig, 'MPa');
      const cd = Math.min(i.s / 2, +i.cx, +i.cy);
      c.q('Cover / spacing parameter', 'c_d', 'min(s/2, c_x, c_y)', cd, 'mm', '11.4.2');
      c.h1('Anchorage length');
      const fn = p => { const cc = new EC.Calc(); return EC.anchorage(cc, { phi: p, m, sigma: sig, cd, poor: i.bond === 'poor' }); };
      let lbd = EC.anchorage(c, { phi, m, sigma: sig, cd, poor: i.bond === 'poor', what: i.ten === 'c' ? 'compression' : 'tension' });
      if (i.end === 'bend' && i.ten === 't') c.note('Bent / hooked end: the anchorage length is measured along the bar centre line through the bend (2023 has no α_1 reduction) [verify].');
      const l0 = Math.ceil(1.2 * lbd / 10) * 10;
      c.v({ l: 'Lap length', s: 'l_0', f: '≈ 1.2 l_bd (laps of ≤ 50 % of bars, staggered)', v: l0, u: 'mm', key: true, r: '11.5 [verify 2023 factor]' });
      c.h1('Bends');
      const mand = phi <= 16 ? 4 * phi : 7 * phi;
      c.v({ l: 'Minimum mandrel', s: 'ϕ_m;min', f: 'ϕ ≤ 16: 4ϕ, ϕ > 16: 7ϕ', v: mand, u: 'mm', r: 'Table 11.1' });
      const ab = Math.min(i.s / 2 + phi / 2, +i.cx + phi / 2);
      const crush = sig * EC.barA(phi) * (1 / ab + 1 / (2 * phi)) / m.fcd;
      c.v({ l: 'Mandrel against concrete crushing', s: 'ϕ_m;req', f: 'σ_sd A_s (1/a_b + 1/(2ϕ))/f_cd', v: crush, u: 'mm', r: '(2004 Eq. 8.1)' });
      c.v({ l: 'Mandrel to specify', s: 'ϕ_m', v: Math.ceil(Math.max(mand, crush) / 5) * 5, u: 'mm', key: true });
      c.h1('Table for bar sizes');
      const rows = EC.BARS.filter(p => p >= 8 && p <= 40).map(p => { const l = fn(p); return [`ϕ${p}`, l, Math.ceil(1.2 * l / 10) * 10, l / p]; });
      c.tbl(['Bar', 'l_bd (mm)', 'l_0 (mm)', 'l_bd/ϕ'], rows, [0, 0, 0, 1]);
      c.ok({ l: 'Minimum spacing for bond', cond: i.s >= Math.max(phi, 20), txt: `s = ${i.s} ≥ max(ϕ, 20) mm`, item: 'Clear spacing', r: '11.2' });
      const svg = EC.plot({ title: 'Anchorage and lap length vs bar size', xl: 'ϕ (mm)', yl: 'length (mm)', series: [{ name: 'l_bd', pts: rows.map((r, k) => [EC.BARS.filter(p => p >= 8 && p <= 40)[k], r[1]]) }, { name: 'l_0', pts: rows.map((r, k) => [EC.BARS.filter(p => p >= 8 && p <= 40)[k], r[2]]), cls: 1 }], legend: true });
      return c.result({ spec: [['Bar', `H${phi}, ${i.bond} bond, ${i.ten === 't' ? 'tension' : 'compression'}`], ['Anchorage', `l_bd = ${lbd} mm`], ['Lap', `l_0 = ${l0} mm`], ['Mandrel', `${mand} mm min.`]], bars: [], svg, lbd, l0 });
    }
  });
})();
