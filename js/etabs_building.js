/* Building checks from ETABS (global / storey level), read live through the ETABS link (tools/etabs_bridge).
 * Checks: inter-storey drift (EC8 4.4.3.2), wind drift (SLS), P-Δ stability coefficient θ and the
 * second-order amplification (EC8 4.4.2.2), torsional irregularity (Δmax/Δavg), base shear & storey shear /
 * overturning moment profiles with overturning stability, and global buckling αcr (EN 1993-1-1 5.2.1,
 * EN 1992-1-1 5.8.2). Units: kN, m. Inputs and the last ETABS read are kept with the project. */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  let api = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ROLES = { seis: 'Seismic', wind: 'Wind SLS', uls: 'ULS', off: 'Not used' };
  const ROLE_ORDER = ['seis', 'wind', 'uls', 'off'];
  const DEF = { qd: 3.0, nu: 0.5, alpha: 0.005, windLim: 500, windLimH: 500, Bx: 20, By: 20, fos: 1.0, ampImp: true, kPurpose: 'seis', ct: 0.075, Rtd: 0, Wf: 0, phi: 2.0, ecs: 0.0003, shortLim: 500, qpCombo: '', gdB: 1.3, gdD: 1.1, slabT: 0, slabFck: 0, fyk: 500, rhoL: 0.006, punchCov: 0.035, flatSlab: false, dcl: 'M', hb: 0.6, colCov: 0.05, beamCov: 0.05, colW: 0.5, cotTh: 1.0, gapX: 0, gapY: 0, adjX: 0, adjY: 0, adjH: 0, sameLev: false, epsV: 1.5, nuLim: 0.4, omega: 1.0, slabCr: 2.0, slabEta: 0.6, slabL1: 250, slabL2: 500, slabLT: false, stagedCase: '' };
  let busy = '', err = '';

  const B = () => { const p = api.proj(); p.building = p.building || {}; const b = p.building; b.set = Object.assign({}, DEF, b.set || {}); b.roles = b.roles || {}; return b; };
  function guessRole(c) {
    const n = c.toUpperCase();
    if (/\bEQU\b/.test(n)) return 'uls';   // EN 1990 EQU (overturning) combinations are not seismic
    if (/\bW(IND)?[XY]?\b|WIND/.test(n) && /SLS|SER|CHAR|FREQ/.test(n)) return 'wind';
    if (/\bE[XY]?\b|EQ|SEIS|\bRS\b|SPEC|SPECTR/.test(n)) return 'seis';
    if (/ULS|STR|1\.35|1\.5/.test(n)) return 'uls';
    return 'off';
  }

  /* ---------- demo building (sample ETABS results, no ETABS needed) ----------
   * 10-storey RC frame-wall building, 24 × 18 m, ground storey 3.4 m + 9 × 3.2 m, 9.2 kN/m² seismic mass.
   * Tuned so every check has something to show: θ between 0.1 and 0.2 in the lower storeys (P-Δ amplification),
   * torsional irregularity in Y, αcr = 8.4 (sway amplification), 93 % modal mass. */
  const DEMO_ROLES = { 'EQX RS': 'seis', 'EQY RS': 'seis', 'G+0.3Q+EX': 'seis', 'G+0.3Q+EY': 'seis', 'WX SLS': 'wind', 'WY SLS': 'wind', 'ULS1 1.35G+1.5Q': 'uls', 'ULS2 1.35G+1.05Q+1.5W': 'uls', 'SLS-CHAR G+Q': 'off', 'SLS-QP G+0.3Q': 'off' };
  function demoBuilding() {
    const st = []; let z = 0;
    for (let i = 0; i < 10; i++) { const h = i ? 3.2 : 3.4; z += h; st.push({ name: 'Story' + (i + 1), elev: Math.round(z * 100) / 100, h }); }
    const W = 9.2 * 24 * 18, n = st.length;
    const lat = { 'EQX RS': ['X', 0.051, 1.0], 'EQY RS': ['Y', 0.047, 1.15], 'G+0.3Q+EX': ['X', 0.051, 1.0], 'G+0.3Q+EY': ['Y', 0.047, 1.15], 'WX SLS': ['X', 0.010, 0.35], 'WY SLS': ['Y', 0.013, 0.42], 'ULS2 1.35G+1.05Q+1.5W': ['X', 0.016, 0.5] };
    const grav = { 'ULS1 1.35G+1.5Q': 1.42, 'ULS2 1.35G+1.05Q+1.5W': 1.3, 'G+0.3Q+EX': 1, 'G+0.3Q+EY': 1 };
    const d = { stories: st, drifts: [], forces: [], torsion: [], base: [], buckling: [], modal: [] };
    Object.keys(DEMO_ROLES).filter(c => DEMO_ROLES[c] !== 'off').forEach(c => {
      const [dir, cs, k] = lat[c] || [null, 0, 0], g = grav[c] || 0, step = /RS/.test(c) ? 'Max' : '';
      const V = cs * W * n, wsum = st.reduce((a, x) => a + x.elev, 0), F = st.map(x => V * x.elev / wsum);
      st.forEach((x, i) => {
        const Vs = F.slice(i).reduce((a, f) => a + f, 0), Ms = F.reduce((a, f, j) => a + (j >= i ? f * (st[j].elev - x.elev + x.h) : 0), 0);
        const de = 0.0016 * k * (1.2 - 0.5 * Math.pow(i / (n - 1), 1.3)) * (i === 0 ? 1.15 : 1);
        if (dir) {
          d.drifts.push({ story: x.name, combo: c, step, dir, drift: de }, { story: x.name, combo: c, step, dir: dir === 'X' ? 'Y' : 'X', drift: de * 0.18 });
          const rat = (dir === 'X' ? 1.12 : 1.31) + (i < 2 ? 0.06 : 0) - 0.008 * i;
          d.torsion.push({ story: x.name, combo: c, step, dir, max: de * x.elev * rat, avg: de * x.elev, ratio: Math.round(rat * 1000) / 1000 });
        }
        d.forces.push({ story: x.name, combo: c, step, loc: 'Bottom', P: g * W * (n - i), VX: dir === 'X' ? Vs : dir ? 0.12 * Vs : 0, VY: dir === 'Y' ? Vs : dir ? 0.12 * Vs : 0, T: 0.05 * Vs * 24, MX: dir === 'Y' ? Ms : 0, MY: dir === 'X' ? Ms : 0 });
      });
      const Mb = F.reduce((a, f, j) => a + f * st[j].elev, 0);
      const Hn = c === 'ULS1 1.35G+1.5Q' ? g * W * n / 405 : 0;   // ULS1 carries the imperfections (notional loads, θi ≈ 1/405)
      d.base.push({ combo: c, step, FX: dir === 'X' ? -V : -Hn, FY: dir === 'Y' ? -V : 0, FZ: g * W * n, MX: dir === 'Y' ? Mb : 0, MY: dir === 'X' ? Mb : 0, MZ: 0 });
    });
    d.buckling = [8.4, 9.1, 13.7, 21.5, 24.0, 33.2].map((f, i) => ({ case: 'Buckling (1.35G+1.5Q)', mode: i + 1, factor: f }));
    let sx = 0, sy = 0, sr = 0;
    d.modal = [[1.12, 0, .742, .004], [1.01, .728, 0, .006], [.86, .003, .004, .731], [.36, 0, .121, .002], [.33, .128, 0, .001], [.28, .002, .001, .119],
      [.20, 0, .044, .001], [.18, .047, 0, 0], [.16, .001, .001, .043], [.14, 0, .021, 0], [.12, .022, 0, 0], [.11, 0, 0, .019]]
      .map(([T, ux, uy, rz], i) => { sx += ux; sy += uy; sr += rz; return { case: 'Modal', mode: i + 1, T, Ux: ux, Uy: uy, Rz: rz, SumUx: sx, SumUy: sy, SumRz: sr }; });
    // storey masses, t: thicker slab at Story1, plant floor at Story6, light roof (same as the --mock bridge)
    d.masses = st.map((x, i) => ({ story: x.name, mx: [430, 405, 405, 405, 405, 470, 405, 405, 405, 330][i], my: [430, 405, 405, 405, 405, 470, 405, 405, 405, 330][i] }));
    // centre of mass at the plan centre, core 1.6-2.4 m off in X, MMI of a uniform 24 × 18 m floor (same as the --mock bridge)
    d.plan_cm = d.masses.map((r, i) => ({ story: r.story, diaph: 'D1', m: r.mx, mmi: r.mx * (24 * 24 + 18 * 18) / 12, xcm: 12, ycm: 9, xcr: Math.round((13.6 + 0.09 * i) * 100) / 100, ycr: Math.round((9.3 + 0.02 * i) * 100) / 100 }));
    d.rs_ecc = [{ case: 'EQX RS', ecc: 0.05, dirs: ['U1'] }, { case: 'EQY RS', ecc: 0.05, dirs: ['U2'] }];
    return d;
  }

  /* demo supports: 20 columns on the 6 m grid; FZ = tributary gravity + overturning shared by the columns
     ΔFZ = M·(x − x_c)/Σ(x − x_c)² (same as the --mock bridge /supports) */
  function demoSupports(d) {
    const pts = []; [0, 6, 12, 18].forEach(y => [0, 6, 12, 18, 24].forEach(x => pts.push([x, y])));
    const trib = (x, y) => ((x === 0 || x === 24) ? 3 : 6) * ((y === 0 || y === 18) ? 3 : 6);
    const sxx = pts.reduce((a, p) => a + (p[0] - 12) ** 2, 0), syy = pts.reduce((a, p) => a + (p[1] - 9) ** 2, 0);
    return pts.map(([x, y], k) => ({ name: String(400 + k), label: 'C' + (k + 1), story: 'Base', x, y, z: 0,
      rows: [].concat(...d.base.map(b => (b.step === 'Max' || /\+E[XY]$/.test(b.combo) ? [['Max', 1], ['Min', -1]] : [['', 1]]).map(([step, sg]) => ({ combo: b.combo, step, FX: b.FX / 20, FY: b.FY / 20,
        FZ: Math.round((b.FZ / 432 * trib(x, y) + sg * (b.MY * (x - 12) / sxx + b.MX * (y - 9) / syy)) * 10) / 10, MX: 0, MY: 0, MZ: 0 })))) }));
  }

  /* demo stacks for the shortening check (same as the --mock bridge /axial): 20 columns, tributary areas × 9.2 kN/m²
     quasi-permanent; 4 core walls with 42 m² of core slab + own weight */
  function demoAxial(fac = 1, combo = 'SLS-QP G+0.3Q') {
    const out = [], pts = []; [0, 6, 12, 18].forEach(y => [0, 6, 12, 18, 24].forEach(x => pts.push([x, y])));
    const trib = (x, y) => ((x === 0 || x === 24) ? 3 : 6) * ((y === 0 || y === 18) ? 3 : 6), r1 = v => Math.round(v * 10) / 10;
    pts.forEach(([x, y], k) => out.push({ name: 'C' + (k + 1), kind: 'column', x, y, levels: Array.from({ length: 10 }, (_, i) => { const [A, f] = i < 3 ? [0.36, 40] : i < 7 ? [0.25, 35] : [0.16, 30]; return { story: 'Story' + (i + 1), A, mat: 'Concrete', f, N: r1(trib(x, y) * 9.2 * fac * (10 - i)) }; }) }));
    [[15.5, 6, 7], [15.5, 12, 7], [12, 9, 6], [18, 9, 6]].forEach(([x, y, L], k) => out.push({ name: 'W' + (k + 1), kind: 'wall', x, y, levels: Array.from({ length: 10 }, (_, i) => { const [t, f] = i < 5 ? [0.25, 40] : [0.2, 30]; return { story: 'Story' + (i + 1), A: L * t, mat: 'Concrete', f, N: r1((42 / 4 * 9.2 + L * t * 3.2 * 25) * fac * (10 - i)) }; }) }));
    return { combo, stacks: out };
  }

  /* demo staged-construction case (same as the --mock bridge /staged): N = one-step quasi-permanent N × 1.05 (columns) /
     × 0.90 (core walls); uz of each level = 2 × the elastic shortening below it from the floors cast after it */
  function demoStaged() {
    const h = [3.4, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2], E = l => 22e6 * Math.pow((l.f + 8) / 10, 0.3);
    return { cases: ['STAGED G+0.3Q'], case: 'STAGED G+0.3Q', stacks: demoAxial().stacks.map(k => {
      const lv = k.levels, fac = k.kind === 'column' ? 1.05 : 0.9, w = lv[lv.length - 1].N;
      return { name: k.name, kind: k.kind, x: k.x, y: k.y, levels: lv.map((l, i) => {
        const after = w * (lv.length - 1 - i); let u = 0; for (let j = 0; j <= i; j++) u += h[j] * after / (E(lv[j]) * lv[j].A);
        return { story: l.story, N: Math.round(l.N * fac * 10) / 10, uz: -Math.round(2 * u * 1e6) / 1e6 };
      }) };
    }) };
  }

  /* demo coupling beams (same as the --mock bridge /spandrels): S1, S2 over 1.2 m doors in W1, W2, 800 mm deep */
  function demoSpandrels() {
    return [1, 2].map(k => ({ name: 'S' + k, levels: Array.from({ length: 10 }, (_, i) => { const [t, f] = i < 5 ? [0.25, 40] : [0.2, 30], V = 300 + 120 * i - 12 * i * i; return { story: 'Story' + (i + 1), L: 1.2, h: 0.8, t, fck: f, V, M: Math.round(V * 6) / 10, case: 'G+0.3Q+EX' }; }) }));
  }

  /* demo joints (same as the --mock bridge /joints): beam/column capacity ratios of the ETABS concrete design */
  function demoJoints() {
    const out = [], pts = [], r3 = v => Math.round(v * 1000) / 1000; [0, 6, 12, 18].forEach(y => [0, 6, 12, 18, 24].forEach(x => pts.push([x, y])));
    for (let i = 0; i < 10; i++) pts.forEach(([x, y], k) => {
      const edge = x === 0 || x === 24 || y === 0 || y === 18, base = 0.62 + 0.03 * i + (edge ? 0.08 : 0) + (i === 2 || i === 6 ? 0.22 : 0);
      out.push({ name: String(500 + 20 * i + k), label: 'C' + (k + 1), story: 'Story' + (i + 1), bc: r3(Math.min(base, 1.4)), bcm: r3(Math.min(base * 0.9, 1.4)), bcCase: 'G+0.3Q+EX', bcmCase: 'G+0.3Q+EY', js: r3(0.35 + 0.02 * i), jsm: r3(0.3 + 0.02 * i), jsCase: 'G+0.3Q+EX', err: '', warn: '' });
    });
    return out;
  }

  /* demo wall piers (same as the --mock bridge /piers): W1-W2 7 m along X, W3-W4 6 m along Y; each takes 35 % of the
     storey shear and overturning moment in its direction of the seismic cases; N as the demo /axial */
  function demoPiers(d) {
    return [[7, 'X'], [7, 'X'], [6, 'Y'], [6, 'Y']].map(([L, dir], k) => ({ name: 'W' + (k + 1), levels: Array.from({ length: 10 }, (_, i) => {
      const st = 'Story' + (i + 1), [t, f] = i < 5 ? [0.25, 40] : [0.2, 30], fs = d.forces.filter(r => r.story === st && (!r.loc || /^bot/i.test(r.loc)));
      const M = Math.max(0, ...fs.map(r => Math.abs(dir === 'X' ? r.MY : r.MX))), V = Math.max(0, ...fs.map(r => Math.abs(dir === 'X' ? r.VX : r.VY))), r1 = v => Math.round(v * 10) / 10;
      return { story: st, lw: L, t, fck: f, M: r1(0.35 * M), V: r1(0.35 * V), N: r1((42 / 4 * 9.2 + L * t * 3.2 * 25) * (10 - i)), case: 'G+0.3Q+E' + dir };
    }) }));
  }

  /* demo steel members (same as the --mock bridge /steel): HEB300 bracing storeys 1-8, IPE400 roof beams */
  function demoSteel() {
    const out = [], r3 = v => Math.round(v * 1000) / 1000;
    for (let i = 0; i < 8; i++) out.push({ name: String(800 + i), label: 'D' + (1 + 2 * i), story: 'Story' + (i + 1), kind: 'braces', sec: 'HEB300', ratio: r3(0.98 - 0.07 * i + (i === 0 ? 0.09 : 0)), type: 'PMM', loc: 0, combo: 'G+0.3Q+EX', err: '', warn: '' });
    for (let k = 0; k < 6; k++) out.push({ name: String(900 + k), label: 'RB' + (k + 1), story: 'Story10', kind: 'beams', sec: 'IPE400', ratio: r3(0.62 + 0.05 * k), type: k !== 5 ? 'PMM' : 'V major', loc: 3, combo: 'ULS1 1.35G+1.5Q', err: '', warn: '' });
    return out;
  }

  /* demo column design (same as the --mock bridge /columns): required longitudinal steel 1 % of the section */
  function demoColumns() {
    const out = [];
    for (let i = 0; i < 10; i++) { const h = i < 3 ? 0.6 : i < 7 ? 0.5 : 0.4; for (let k = 0; k < 20; k++) out.push({ name: String(500 + 20 * i + k), label: 'C' + (k + 1), story: 'Story' + (i + 1), As: Math.round(0.01 * h * h * 1e6) / 1e6, Av: 0.0005, Avm: 0.0005, combo: 'G+0.3Q+EX', vcombo: 'G+0.3Q+EX' }); }
    return out;
  }

  /* demo beams (same as the --mock bridge /beams): B300x600 C30, 6 m spans on the grid, every storey */
  function demoBeams() {
    const out = []; let k = 0;
    const add = (i, edge, endI, endJ) => { out.push({ name: String(2000 + k), label: 'B' + (k % 31 + 1), story: 'Story' + (i + 1), sec: 'B300x600 C30', b: 0.3, h: 0.6, fck: 30, L: 6, topI: endI ? 0.0009 : 0.0012, botI: 0.0008, topJ: endJ ? 0.0009 : 0.0012, botJ: 0.0008, Av: edge ? 0.0005 : 0.0008, VgI: edge ? 41.4 : 82.8, VgJ: edge ? 41.4 : 82.8 }); k++; };
    for (let i = 0; i < 10; i++) {
      [0, 6, 12, 18].forEach(y => [0, 6, 12, 18].forEach(x => add(i, y === 0 || y === 18, x === 0, x === 18)));
      [0, 6, 12, 18, 24].forEach(x => [0, 6, 12].forEach(y => add(i, x === 0 || x === 24, y === 0, y === 12)));
    }
    return { combo: 'SLS-QP G+0.3Q', beams: out };
  }

  /* demo slab panels (same as the --mock bridge /slabdefl): 6 × 6 m bays between the columns, S200 C30 with the model's
     slab bending modifier 0.25; ETABS deflection of G+0.3Q relative to the bay corners = (1.7·c + 0.6 mm)/0.25,
     c = 0.5 interior / 0.65 edge / 0.8 corner bay; roof plant (× 1.8) on the two middle bays of Story10 */
  function demoSlabDefl() {
    const out = [];
    for (let i = 0; i < 10; i++) for (let x = 0; x < 24; x += 6) for (let y = 0; y < 18; y += 6) {
      const ex = x === 0 || x === 18, ey = y === 0 || y === 12, c = ex && ey ? 0.8 : ex || ey ? 0.65 : 0.5, plant = i === 9 && y === 6 && (x === 6 || x === 12) ? 1.8 : 1;
      const d = Math.round((1.7 * c + 0.6) / 0.25 * plant * 100) / 1e5;
      out.push({ story: 'Story' + (i + 1), x0: x, x1: x + 6, y0: y, y1: y + 6, Lx: 6, Ly: 6, d, at: [x + 3, y + 3], n: 25, prop: 'S200 C30', m: 0.25 });
    }
    return { combo: 'SLS-QP G+0.3Q', panels: out };
  }

  /* ---------- checks ---------- */
  const maxBy = (xs, f) => xs.reduce((a, x) => (a === null || f(x) > f(a) ? x : a), null);
  function compute(b) {
    const d = b.data; if (!d) return null;
    const s = b.set, role = c => b.roles[c] || 'off';
    const st = d.stories.slice().sort((a, c) => a.elev - c.elev);
    const H = st.length ? st[st.length - 1].elev - (st[0].elev - st[0].h) : 0;
    const out = { st, H };
    const zOf2 = n => { const x = st.find(q => q.name === n); return x ? x.elev : 0; };
    // 1. seismic inter-storey drift - EC8 4.4.3.2: dr = qd·de ; dr·ν ≤ α·h
    out.drift = []; out.wind = [];
    st.forEach(x => ['X', 'Y'].forEach(dir => {
      const se = d.drifts.filter(r => r.story === x.name && r.dir === dir && role(r.combo) === 'seis');
      const g = maxBy(se, r => r.drift);
      if (g) { const dr = s.qd * g.drift; out.drift.push({ story: x.name, z: x.elev, h: x.h, dir, combo: g.combo, de: g.drift, dr, v: dr * s.nu, U: dr * s.nu / s.alpha }); }
      const wi = maxBy(d.drifts.filter(r => r.story === x.name && r.dir === dir && role(r.combo) === 'wind'), r => r.drift);
      if (wi) out.wind.push({ story: x.name, z: x.elev, h: x.h, dir, combo: wi.combo, v: wi.drift, U: wi.drift * s.windLim });
    }));
    // 2. P-Δ - EC8 4.4.2.2(2): θ = Ptot·dr / (Vtot·h)
    out.theta = [];
    const fBot = d.forces.filter(r => !r.loc || /bot/i.test(r.loc));
    st.forEach(x => ['X', 'Y'].forEach(dir => {
      const dd = out.drift.find(r => r.story === x.name && r.dir === dir); if (!dd) return;
      const fs = fBot.filter(r => r.story === x.name && role(r.combo) === 'seis');
      const P = Math.max(0, ...fs.map(r => Math.abs(r.P)));
      const V = Math.max(0, ...fs.map(r => Math.abs(dir === 'X' ? r.VX : r.VY)));
      if (!(P > 0 && V > 0)) return;
      const th = P * dd.dr / V;   // θ = P·d_r/(V·h) with d_r = dd.dr·h (dd.dr is the drift ratio)
      const amp = th <= 0.1 ? 1 : th <= 0.2 ? 1 / (1 - th) : null;
      out.theta.push({ story: x.name, z: x.elev, h: x.h, dir, P, V, dr: dd.dr, th, amp, U: th / 0.3,
        note: th <= 0.1 ? 'second-order effects may be neglected' : th <= 0.2 ? `multiply seismic action effects by 1/(1−θ) = ${api.fmt(1 / (1 - th), 3)}` : th <= 0.3 ? 'rigorous second-order analysis required' : 'θ > 0.3 not permitted - stiffen the structure' });
    }));
    // 3. torsion - max / average displacement per storey
    out.tors = [];
    st.forEach(x => ['X', 'Y'].forEach(dir => {
      const g = maxBy(d.torsion.filter(r => r.story === x.name && r.dir === dir && role(r.combo) !== 'off' && role(r.combo) !== 'uls'), r => r.ratio);
      if (g) out.tors.push({ story: x.name, z: x.elev, dir, combo: g.combo, ratio: g.ratio, U: g.ratio / 1.4, cls: g.ratio <= 1.2 ? 'Regular' : g.ratio <= 1.4 ? 'Torsional irregularity' : 'Extreme torsional irregularity' });
    }));
    // 4. base shear and overturning
    const Wseis = Math.max(0, ...d.base.filter(r => role(r.combo) === 'seis').map(r => Math.abs(r.FZ)));
    out.base = d.base.filter(r => role(r.combo) !== 'off').map(r => {
      const W = Math.abs(r.FZ) > 1 ? Math.abs(r.FZ) : Wseis, Wfrom = Math.abs(r.FZ) > 1 ? '' : 'G+ψ2Q';
      const Mx = Math.abs(r.MX), My = Math.abs(r.MY);
      const fx = Mx > 1e-6 && W ? W * s.By / 2 / Mx : Infinity, fy = My > 1e-6 && W ? W * s.Bx / 2 / My : Infinity;
      const fos = Math.min(fx, fy);
      return { combo: r.combo + (r.step ? ' ' + r.step : ''), role: role(r.combo), Vx: Math.abs(r.FX), Vy: Math.abs(r.FY), W, Wfrom, Mx, My, cx: W ? Math.abs(r.FX) / W : 0, cy: W ? Math.abs(r.FY) / W : 0, fos, U: Number.isFinite(fos) ? s.fos / fos : 0 };
    });
    out.prof = st.map(x => {
      const fs = fBot.filter(r => r.story === x.name && role(r.combo) !== 'off' && role(r.combo) !== 'uls');
      return { story: x.name, z: x.elev, VX: Math.max(0, ...fs.map(r => Math.abs(r.VX))), VY: Math.max(0, ...fs.map(r => Math.abs(r.VY))), MX: Math.max(0, ...fs.map(r => Math.abs(r.MX))), MY: Math.max(0, ...fs.map(r => Math.abs(r.MY))) };
    });
    // 5. global buckling
    const bf = d.buckling.filter(r => r.factor > 0).sort((a, c) => a.factor - c.factor);
    out.buck = bf;
    if (bf.length) { const a = bf[0].factor; out.acr = { a, U: 3 / a, k: a > 1 ? 1 / (1 - 1 / a) : Infinity, note: a >= 10 ? 'first-order analysis is sufficient (αcr ≥ 10)' : a >= 3 ? `amplify the sway (horizontal) effects by 1/(1−1/αcr) = ${api.fmt(1 / (1 - 1 / a), 3)}` : 'αcr < 3: full second-order analysis required' }; }
    // 6. modal response - EN 1998-1 4.3.3.3.1
    const md = (d.modal || []).slice().sort((a, c) => a.mode - c.mode);
    if (md.length) {
      const last = md[md.length - 1], n = st.length;
      const sum = { X: last.SumUx, Y: last.SumUy };
      const big = dir => md.filter(m => (dir === 'X' ? m.Ux : m.Uy) > 0.05);
      const tail = { X: last.Ux > 0.05, Y: last.Uy > 0.05 };   // the last mode still carries > 5 %: more modes may exist
      const kMin = Math.ceil(3 * Math.sqrt(n)), alt = md.length >= kMin && last.T <= 0.20;
      const dom = m => { const v = { X: m.Ux, Y: m.Uy, 'torsion (RZ)': m.Rz }; return Object.keys(v).reduce((a, k) => (v[k] > v[a] ? k : a), 'X'); };
      const first = md[0];
      out.modal = { md, n, sum, big, tail, kMin, alt, dom, torsFirst: dom(first) === 'torsion (RZ)',
        U: Math.max(...['X', 'Y'].map(dir => (sum[dir] >= 0.9 || alt ? 0.9 / Math.max(sum[dir], 0.9) : 0.9 / Math.max(sum[dir], 1e-6)))),
        T1: first.T };
    }
    // 7. base shear - EN 1998-1 4.3.3.2: T1 ≈ Ct·H^¾, lateral force Fb = Sd(T1)·m·λ, compared with the response-spectrum base shear
    if (md.length && EC.loads && EC.loads.settings) {
      const ls = EC.loads.settings(), SP = EC.loads._spectrum(ls), Ct = +s.ct || 0.075, Hh = out.H;
      const Tct = Ct * Math.pow(Hh, 0.75);
      const W = Math.max(0, ...d.base.filter(r => role(r.combo) === 'seis').map(r => Math.abs(r.FZ)));
      out.bs = ['X', 'Y'].map(dir => {
        const m1 = md.filter(m => (dir === 'X' ? m.Ux : m.Uy) > 0).reduce((a, m) => (!a || (dir === 'X' ? m.Ux : m.Uy) > (dir === 'X' ? a.Ux : a.Uy) ? m : a), null);
        const T1 = m1 ? m1.T : Tct, lam = T1 <= 2 * SP.TC && st.length > 2 ? 0.85 : 1.0;
        const sd = SP.sd(T1), Fb = sd * W * lam;
        const Vrs = Math.max(0, ...d.base.filter(r => role(r.combo) === 'seis').map(r => Math.abs(dir === 'X' ? r.FX : r.FY)));
        const lfm = T1 <= Math.min(4 * SP.TC, 2.0);
        const ratio = Fb > 0 ? Vrs / Fb : null;
        return { dir, mode: m1 ? m1.mode : null, mass: m1 ? (dir === 'X' ? m1.Ux : m1.Uy) : null, T1, Tct, rT: T1 / Tct, lam, sd, W, Fb, Vrs, ratio, lfm, U: ratio ? 0.8 / ratio : 0 };
      });
      out.bsSP = SP; out.bsCt = Ct;
    }
    // 8. soft storey - EN 1998-1 4.2.3.3(3) (lateral stiffness constant or reducing gradually upwards); limits of
    //    ASCE 7 Table 12.3-2: k_i < 0.7·k_i+1 or < 0.8·mean(k_i+1..i+3) soft, < 0.6 / 0.7 extreme. k_i = V_i / (d_r,i·h_i)
    out.soft = [];
    ['X', 'Y'].forEach(dir => {
      const seisC = [...new Set(d.drifts.filter(r => r.dir === dir && role(r.combo) === 'seis').map(r => r.combo))];
      // the seismic case acting in this direction: largest base shear in it
      const c = seisC.map(c => [c, Math.max(0, ...fBot.filter(r => r.combo === c).map(r => Math.abs(dir === 'X' ? r.VX : r.VY)))]).sort((a, b2) => b2[1] - a[1])[0];
      if (!c) return;
      const ks = st.map(x => {
        const dr = d.drifts.find(r => r.story === x.name && r.dir === dir && r.combo === c[0]);
        const f = fBot.find(r => r.story === x.name && r.combo === c[0]);
        const V = f ? Math.abs(dir === 'X' ? f.VX : f.VY) : 0, dd = dr ? dr.drift * x.h : 0;
        return { story: x.name, z: x.elev, dir, combo: c[0], V, d: dd, k: dd > 0 ? V / dd : null };
      });
      ks.forEach((r, i) => {
        const up = ks.slice(i + 1, i + 4).filter(q => q.k);
        r.r1 = r.k && up.length ? r.k / up[0].k : null;
        r.r3 = r.k && up.length >= 3 ? r.k / (up.reduce((a, q) => a + q.k, 0) / up.length) : null;
        r.cls = r.r1 == null ? 'top storey' : (r.r1 < 0.6 || (r.r3 != null && r.r3 < 0.7)) ? 'Extreme soft storey' : (r.r1 < 0.7 || (r.r3 != null && r.r3 < 0.8)) ? 'Soft storey' : 'Regular';
        r.U = r.r1 == null ? 0 : Math.max(0.7 / r.r1, r.r3 != null ? 0.8 / r.r3 : 0);
        out.soft.push(r);
      });
    });
    // 9. weak storey - EN 1998-1 4.2.3.3(4): the ratio of the actual storey resistance to the required one should not
    //    vary disproportionately between adjacent storeys. Storey shear resistance V_Rd,i = Σ of the columns and the
    //    walls (in plane) of the storey; weak if V_Rd,i < 0.8·V_Rd,i+1, extreme < 0.65 (ASCE 7 Table 12.3-2, 5a / 5b);
    //    Ω_i = V_Rd,i / V_Ed,i compared with the storey above (≤ 30 % variation, prEN 1998-1-2 regularity criterion)
    out.weak = [];
    const els = d.strength || [];
    if (els.length) {
      const R = {}; st.forEach(x => { R[x.name] = { X: 0, Y: 0, n: 0 }; });
      els.forEach(e => { const r = R[e.story]; if (!r) return; const v = vrd(e); r.X += v.X; r.Y += v.Y; r.n++; });
      ['X', 'Y'].forEach(dir => {
        const seisC = [...new Set(fBot.filter(r => role(r.combo) === 'seis').map(r => r.combo))];
        const c = seisC.map(c => [c, Math.max(0, ...fBot.filter(r => r.combo === c).map(r => Math.abs(dir === 'X' ? r.VX : r.VY)))]).sort((a, b2) => b2[1] - a[1])[0];
        const rows = st.map(x => {
          const f = c ? fBot.find(r => r.story === x.name && r.combo === c[0]) : null, V = f ? Math.abs(dir === 'X' ? f.VX : f.VY) : 0;
          const Rd = R[x.name][dir];
          return { story: x.name, z: x.elev, dir, combo: c ? c[0] : '', n: R[x.name].n, Rd, V, om: V > 0 && Rd > 0 ? Rd / V : null };
        });
        rows.forEach((r, i) => {
          const up = rows[i + 1];
          r.r1 = up && up.Rd > 0 && r.n ? r.Rd / up.Rd : null;
          r.o1 = up && r.om != null && up.om != null ? r.om / up.om : null;
          r.cls = r.r1 == null ? (r.n ? 'top storey' : 'no members read') : r.r1 < 0.65 ? 'Extreme weak storey' : r.r1 < 0.8 ? 'Weak storey' : 'Regular';
          r.U = r.r1 == null ? 0 : 0.8 / r.r1;
          r.oflag = r.o1 != null && r.o1 < 0.7 && i + 2 < rows.length;   // not against the roof storey (its demand is one floor)
          out.weak.push(r);
        });
      });
    }
    // 10. mass irregularity - EN 1998-1 4.2.3.3(3) (storey mass constant or reducing gradually upwards); limit of
    //     ASCE 7 Table 12.3-2 type 2: m_i > 1.5 × an adjacent storey (a roof lighter than the floor below is not considered)
    out.mass = [];
    const ms = st.map(x => { const r = (d.masses || []).find(q => q.story === x.name); return r ? { story: x.name, z: x.elev, m: Math.max(+r.mx || 0, +r.my || 0) } : null; });
    if (ms.every(x => x && x.m > 0)) {
      ms.forEach((r, i) => {
        const lo = ms[i - 1], up = i + 1 < ms.length ? ms[i + 1] : null;
        // the storey below the roof is not compared with a lighter roof (ASCE 7 Table 12.3-2 type 2)
        const cmp = [lo, up].filter(Boolean).filter(a => !(a === up && i + 2 === ms.length && up.m < r.m));
        r.adj = cmp.length ? Math.min(...cmp.map(a => a.m)) : null;
        r.ratio = r.adj ? r.m / r.adj : null;
        r.up = lo ? r.m / lo.m : null;      // vs the storey below: > 1 = heavier upwards
        r.cls = r.ratio == null ? '–' : r.ratio > 1.5 ? 'Mass irregular' : r.up != null && r.up > 1.1 ? 'Heavier than below' : 'Regular';
        r.U = r.ratio == null ? 0 : r.ratio / 1.5;
        out.mass.push(r);
      });
    }
    // 11. torsional radius and eccentricity - EN 1998-1 4.2.3.2(6): e_0x ≤ 0.30·r_x and r_x ≥ l_s (and in Y).
    //     r/l_s from the modes (uncoupled: ω_θ/ω_Y = r_x/l_s → r_x/l_s = T_Y/T_θ), l_s = √(MMI/m) of the floor,
    //     e_0 = distance between the centres of mass and rigidity of ETABS
    out.plan = []; out.planModes = null;
    const mdP = (d.modal || []).slice().sort((a, c) => a.mode - c.mode), domOf = r => (r.Rz > r.Ux && r.Rz > r.Uy ? 'R' : r.Ux >= r.Uy ? 'X' : 'Y');
    const mX = mdP.find(r => domOf(r) === 'X'), mY = mdP.find(r => domOf(r) === 'Y'), mR = mdP.find(r => domOf(r) === 'R');
    const pcm = d.plan_cm || [];
    if (mX && mY && mR && pcm.length) {
      const rho = { X: mY.T / mR.T, Y: mX.T / mR.T };   // r_x / l_s (lateral stiffness in Y) and r_y / l_s
      out.planModes = { mX, mY, mR, rho };
      st.forEach(x => {
        const p = pcm.filter(q => q.story === x.name).sort((a, c) => (c.m || 0) - (a.m || 0))[0]; if (!p) return;
        const lsFrom = p.mmi > 0 && p.m > 0 ? 'MMI' : 'plan', ls = lsFrom === 'MMI' ? Math.sqrt(p.mmi / p.m) : Math.sqrt((s.Bx * s.Bx + s.By * s.By) / 12);
        const hasCR = Number.isFinite(+p.xcr) && Number.isFinite(+p.xcm) && p.xcr !== null && p.xcm !== null;
        ['X', 'Y'].forEach(dir => {
          const r = rho[dir] * ls, e0 = hasCR ? Math.abs(dir === 'X' ? p.xcr - p.xcm : p.ycr - p.ycm) : null;
          const Ue = e0 != null ? e0 / (0.3 * r) : 0, Ur = ls / r;
          out.plan.push({ story: x.name, z: x.elev, dir, ls, lsFrom, r, rl: rho[dir], e0, Ue, Ur, U: Math.max(Ue, Ur),
            cls: Ur > 1 ? 'Torsionally flexible' : Ue > 1 ? 'Not regular in plan' : 'Regular' });
        });
      });
    }
    // 12. accidental torsion - EN 1998-1 4.3.2(1)P e_ai = ±0.05·L_i (L_i floor size normal to the seismic action);
    //     spatial model: torques M_ai = e_ai·F_i (4.3.3.2.4(3), 4.3.3.3.3) - ETABS applies them through the eccentricity
    //     ratio of the response-spectrum case; planar models: δ = 1 + 0.6·x/L_e (4.3.3.2.4(1)), 1 + 1.2·x/L_e (4.3.3.2.4(2))
    out.acc = { cases: (d.rs_ecc || []).map(c => {
      const dir = (c.dirs || []).some(x => /U1|X/i.test(x)) ? 'X' : (c.dirs || []).some(x => /U2|Y/i.test(x)) ? 'Y' : '';
      const e = c.ecc == null ? null : +c.ecc;
      return { case: c.case, dir, ecc: e, U: e == null ? null : e > 0 ? 0.05 / e : 9.99 };
    }), rows: [] };
    ['X', 'Y'].forEach(dir => {
      const seisC = [...new Set(fBot.filter(r => role(r.combo) === 'seis').map(r => r.combo))];
      const c = seisC.map(c => [c, Math.max(0, ...fBot.filter(r => r.combo === c).map(r => Math.abs(dir === 'X' ? r.VX : r.VY)))]).sort((a, b2) => b2[1] - a[1])[0];
      if (!c || !(c[1] > 0)) return;
      const V = st.map(x => { const f = fBot.find(r => r.story === x.name && r.combo === c[0]); return f ? Math.abs(dir === 'X' ? f.VX : f.VY) : 0; });
      const L = dir === 'X' ? +s.By : +s.Bx, e = 0.05 * L;
      st.forEach((x, i) => { const F = Math.max(0, V[i] - (i + 1 < st.length ? V[i + 1] : 0)); out.acc.rows.push({ story: x.name, z: x.elev, dir, combo: c[0], F, L, e, M: e * F }); });
    });
    // 13. wind comfort - peak along-wind acceleration at the top (EN 1991-1-4 Annex B.4) by the user's worksheet
    //     Wind_TallBuilding, fed with the ETABS building: height, plan, storeys, density from the storey masses,
    //     n_1 = 1/T of the first translational mode in the wind direction, base shear / moment of the wind cases
    out.wc = [];
    const mt = (d.masses || []).reduce((a, r) => a + Math.max(+r.mx || 0, +r.my || 0), 0);
    ['X', 'Y'].forEach(dir => {
      const m1 = mdP.find(r => domOf(r) === dir); if (!m1 || !(m1.T > 0)) return;
      const bw = dir === 'X' ? +s.By : +s.Bx, dw = dir === 'X' ? +s.Bx : +s.By;
      const wb = d.base.filter(r => role(r.combo) === 'wind'), Vas = Math.max(0, ...wb.map(r => Math.abs(dir === 'X' ? r.FX : r.FY))), Mas = Math.max(0, ...wb.map(r => Math.abs(dir === 'X' ? r.MY : r.MX)));
      const wcase = wb.filter(r => Math.abs(dir === 'X' ? r.FX : r.FY) === Vas).map(r => r.combo)[0] || '';
      out.wc.push({ dir, H, bw, dw, nst: st.length, rho: mt > 0 && H > 0 ? mt * 1000 / (bw * dw * H) : null, n1: 1 / m1.T, mode: m1.mode, Vas: Vas > 0 ? Vas : null, Mas: Mas > 0 ? Mas : null, wcase });
    });
    // 14. support uplift / pile tension - EN 1997-1 7.6.3.1(2): F_t;d ≤ R_t;d (eq. 7.12). F_t;d = −FZ_min − 0.9·W_f
    //     (foundation weight favourable, γ_G,inf = 0.9) over the ULS and seismic combinations carrying vertical load
    out.sup = { list: [], skipped: [] };
    if ((d.supports || []).length) {
      const fzOf = c => { const r = d.base.find(q => q.combo === c); return r ? Math.abs(r.FZ) : 0; };
      const cs = [...new Set(d.supports.flatMap(p => p.rows.map(r => r.combo)))].filter(c => role(c) === 'uls' || role(c) === 'seis');
      const use = cs.filter(c => fzOf(c) > 1); out.sup.skipped = cs.filter(c => fzOf(c) <= 1);
      const Wf = +s.Wf || 0, Rt = +s.Rtd || 0;
      d.supports.forEach(p => {
        const rs = p.rows.filter(r => use.includes(r.combo)); if (!rs.length) return;
        const mn = rs.reduce((a, r) => (r.FZ < a.FZ ? r : a)), mx = rs.reduce((a, r) => (r.FZ > a.FZ ? r : a));
        const T = Math.max(0, -mn.FZ - 0.9 * Wf);
        out.sup.list.push({ name: p.name, label: p.label, x: +p.x, y: +p.y, min: mn, max: mx, T, U: T > 0 ? (Rt > 0 ? T / Rt : 9.99) : 0,
          cls: T > 0 ? (Rt > 0 && T <= Rt ? 'Tension ≤ R_t,d' : 'Uplift') : mn.FZ < 0 ? 'Uplift held by W_f' : 'Compression' });
      });
    }
    // 15. axial shortening - elastic N/(E_cm·A) + creep φ·σ/(1.05·E_cm) (EN 1992-1-1 3.1.4(2)) + shrinkage ε_cs (3.1.4(6)),
    //     E_cm = 22·(f_cm/10)^0.3 GPa (Table 3.1); differential for the slabs from the load placed after each floor is cast
    //     (N of the storey above, construction levelled), against the nearest stack: Δ/L ≤ 1/limit
    out.short = null;
    const AX = d.axial;
    if (AX && (AX.stacks || []).length) {
      const idx = {}; st.forEach((x, i) => { idx[x.name] = i; });
      const phi = +s.phi || 0, ecs = +s.ecs || 0;
      const E = l => (l.mat === 'Steel' ? 210e6 : l.mat === 'Concrete' ? 22e6 * Math.pow((+l.f + 8) / 10, 0.3) : 30e6);   // kN/m²
      const S = AX.stacks.map(k => {
        const lv = k.levels.filter(l => idx[l.story] !== undefined && l.A > 0).sort((a, c) => idx[a.story] - idx[c.story]);
        if (!lv.length) return null;
        const conc = l => l.mat === 'Concrete';
        let el = 0, cr = 0, sh = 0;
        const prof = lv.map((l, i) => {
          const h = st[idx[l.story]].h, e = l.N / (E(l) * l.A);
          el += e * h; cr += conc(l) ? phi * l.N / (1.05 * E(l) * l.A) * h : 0; sh += conc(l) ? ecs * h : 0;
          const Nup = i + 1 < lv.length ? lv[i + 1].N : 0;   // load placed after this floor is cast
          const post = lv.slice(0, i + 1).reduce((a, q) => a + (q.N > 0 ? Nup / q.N : 0) * (q.N / (E(q) * q.A)) * (1 + (conc(q) ? phi / 1.05 : 0)) * st[idx[q.story]].h, 0);
          return { story: l.story, z: st[idx[l.story]].elev, tot: el + cr + sh, post, sig: l.N / l.A / 1000 };
        });
        return { name: k.name, kind: k.kind, x: +k.x, y: +k.y, el, cr, sh, tot: el + cr + sh, sig0: prof[0].sig, prof };
      }).filter(Boolean);
      const lim = +s.shortLim || 500;
      S.forEach(a => {
        const nb = S.filter(b2 => b2 !== a).map(b2 => [b2, Math.hypot(b2.x - a.x, b2.y - a.y)]).filter(q => q[1] > 0.5).sort((p1, p2) => p1[1] - p2[1])[0];
        if (!nb) return;
        const [b2, L] = nb; let w = null;
        a.prof.forEach(pa => { const pb = b2.prof.find(q => q.story === pa.story); if (!pb) return; const dd = Math.abs(pa.post - pb.post); if (!w || dd > w.d) w = { d: dd, story: pa.story }; });
        if (!w) return;
        Object.assign(a, { nb: b2.name, L, diff: w.d, at: w.story, tilt: w.d / L, U: w.d / L * lim });
      });
      out.short = { combo: AX.combo, stacks: S, lim };
    }
    // 16. diaphragms - EN 1998-1 4.4.2.5(2): analysis effects × γ_d (1.3 brittle: in-plane shear, 1.1 ductile: chord
    //     tension). Floor force F_i (storey shear difference of the governing seismic case) carried as a deep beam between
    //     the lateral systems at both ends: M = F·L/8, chord T = M/(0.9·D), edge shear v = F/(2·D); in-plane shear:
    //     reinforcement a_s = v/f_yd each way (θ = 45°), strut τ ≤ 0.5·ν·f_cd (EN 1992-1-1 6.2.2(6), 6.2.3(3))
    out.diaph = null;
    if (out.acc.rows.length) {
      const sl = (d.slabs || []).filter(x => x.t > 0), slMin = sl.length ? sl.reduce((a, x) => (x.t < a.t ? x : a)) : null;
      const t = +s.slabT > 0 ? +s.slabT : slMin ? slMin.t : 0.2, fck = +s.slabFck > 0 ? +s.slabFck : slMin && slMin.f > 0 ? slMin.f : 30;
      const fyd = (+s.fyk || 500) / 1.15, nu = 0.6 * (1 - fck / 250), tRd = 0.5 * nu * fck / 1.5;
      const rows = out.acc.rows.map(r => {
        const L = r.dir === 'X' ? +s.Bx : +s.By, D = r.dir === 'X' ? +s.By : +s.Bx;
        const M = (+s.gdD || 1.1) * r.F * L / 8, T = M / (0.9 * D), V = (+s.gdB || 1.3) * r.F / 2, v = V / D, tau = v / (t * 1000);
        return { story: r.story, z: r.z, dir: r.dir, F: r.F, L, D, M, T, As: T * 1000 / fyd, v, tau, as: v * 1000 / fyd, U: tau / tRd };
      });
      out.diaph = { rows, t, fck, tFrom: +s.slabT > 0 ? 'input' : slMin ? 'ETABS ' + slMin.prop : 'default', tRd, fyd, nu };
    }
    // 17. seismic joint / pounding - EN 1998-1 4.4.2.7(2): gap ≥ √(d_s,1² + d_s,2²) at every level, d_s = q_d·d_e (4.3.4);
    //     × 0.7 when the floor levels of both units coincide (4.4.2.7(3)). Own d_e = max corner displacement (Story Max
    //     Over Avg Displacements, includes torsion) of the seismic cases, else the drifts summed up the height
    out.pound = [];
    ['X', 'Y'].forEach(dir => {
      const tor = d.torsion.filter(r => r.dir === dir && role(r.combo) === 'seis');
      let cum = 0;
      const rows = st.map(x => {
        let de = Math.max(0, ...tor.filter(r => r.story === x.name).map(r => Math.abs(+r.max || 0))), from = 'max corner';
        const dr = Math.max(0, ...d.drifts.filter(r => r.story === x.name && r.dir === dir && role(r.combo) === 'seis').map(r => r.drift));
        cum += dr * x.h;
        if (!(de > 0)) { de = cum; from = 'Σ drifts'; }
        return { story: x.name, z: x.elev, dir, de, from };
      });
      if (!rows.some(r => r.de > 0)) return;
      const Hadj = +s.adjH > 0 ? +s.adjH : H, dTop = (dir === 'X' ? +s.adjX : +s.adjY) / 1000, gap = (dir === 'X' ? +s.gapX : +s.gapY) / 1000, f = s.sameLev && dTop > 0 ? 0.7 : 1;   // 0.7 only between two units, not at a property line
      rows.forEach(r => {
        r.ds = (+s.qd || 1) * r.de;
        r.dadj = r.z <= Hadj + 1e-6 ? dTop * r.z / Hadj : null;   // adjacent unit: linear up to its height
        r.req = r.dadj == null ? null : f * Math.sqrt(r.ds * r.ds + r.dadj * r.dadj);
        r.gap = gap; r.U = r.req != null && gap > 0 ? r.req / gap : 0;
        out.pound.push(r);
      });
    });
    // 18. strong column / weak beam - EN 1998-1 4.4.2.3(4): ΣM_Rc ≥ 1.3·ΣM_Rb at every beam-column joint (eq. 4.29),
    //     from the beam/column capacity ratio of the ETABS concrete frame design (1.3·ΣM_Rb/ΣM_Rc ≤ 1); top storey of a
    //     multi-storey building exempt (4.4.2.3); joint shear ratio of the design shown (EN 1998-1 5.5.3.3, DCH)
    out.scwb = null;
    if ((d.joints || []).length) {
      const top = st.length ? st[st.length - 1].name : null, zOf = {}; st.forEach(x => { zOf[x.name] = x.elev; });
      const rows = d.joints.filter(j => zOf[j.story] !== undefined).map(j => {
        const ex = j.story === top, U = Math.max(+j.bc || 0, +j.bcm || 0);
        return Object.assign({}, j, { z: zOf[j.story], exempt: ex, U: ex ? 0 : U, Uraw: U, jsU: Math.max(+j.js || 0, +j.jsm || 0) });
      });
      const prof = st.map(x => { const rs = rows.filter(r => r.story === x.name); return rs.length ? { story: x.name, z: x.elev, maj: Math.max(...rs.map(r => +r.bc || 0)), min: Math.max(...rs.map(r => +r.bcm || 0)), exempt: x.name === top } : null; }).filter(Boolean);
      out.scwb = { rows, prof, top };
    }
    // 19. ductile walls (DCM) - EN 1998-1 5.4.2.4: moment envelope = analysis moments shifted up by the tension shift
    //     a1 = z·cotθ/2 (z = 0.8·l_w, θ = 45°, EN 1992-1-1 9.2.1.3(2)) and linear from the base (Fig. 5.3, slender walls
    //     h_w/l_w > 2) (5); shear V_Ed = ε·V'_Ed, ε = 1.5 (7); critical height h_cr = max(l_w, h_w/6) ≤ 2·l_w, ≤ h_s (n ≤ 6)
    //     or 2·h_s (n ≥ 7) (5.4.3.4.2(1)); normalised axial load ν_d = N_Ed/(A_c·f_cd) ≤ 0.4 (5.4.3.4.1(2))
    out.walls = null;
    if ((d.piers || []).length) {
      const zOf = {}, hOf = {}; st.forEach(x => { zOf[x.name] = x.elev; hOf[x.name] = x.h; });
      const eps = +s.epsV || 1.5, nuL = +s.nuLim || 0.4, nSt = st.length;
      const W = d.piers.map(p => {
        const lv = p.levels.filter(l => zOf[l.story] !== undefined).sort((a, c) => zOf[a.story] - zOf[c.story]); if (!lv.length) return null;
        const z0 = zOf[lv[0].story] - hOf[lv[0].story], hw = zOf[lv[lv.length - 1].story] - z0, b0 = lv[0], lw = +b0.lw;
        const a1 = 0.8 * lw / 2, hs = hOf[b0.story], hcr = Math.min(Math.max(lw, hw / 6), 2 * lw, nSt <= 6 ? hs : 2 * hs), slender = hw / lw > 2;
        const prof = lv.map(l => {
          const zb = zOf[l.story] - hOf[l.story] - z0;   // height of the storey bottom above the wall base
          const lin = slender ? b0.M * Math.min(1, (hw - zb + a1) / hw) : 0;
          const shifted = Math.max(0, ...lv.filter(q => zOf[q.story] - hOf[q.story] - z0 <= zb + a1 + 1e-6 && zOf[q.story] - hOf[q.story] - z0 >= zb - 1e-6).map(q => +q.M));
          const fcd = (+l.fck || 30) / 1.5, nu = l.N / (l.lw * l.t * fcd * 1000);
          return { story: l.story, z: zOf[l.story] - hOf[l.story], zb, Man: +l.M, Menv: Math.max(+l.M, shifted, lin), Van: +l.V, VEd: eps * l.V, N: +l.N, nu, case: l.case, lw: +l.lw, t: +l.t };
        });
        const nuMax = Math.max(...prof.map(r => r.nu));
        return { name: p.name, lw, t: +b0.t, hw, a1, hcr, slender, prof, base: prof[0], nuMax, U: nuMax / nuL };
      }).filter(Boolean);
      out.walls = { W, eps, nuL };
    }
    // 20. foundation design forces - EN 1998-1 4.4.2.6(2): E_Fd = E_F,G + γ_Rd·Ω·E_F,E, γ_Rd = 1.0 for q ≤ 3, 1.2
    //     otherwise; Ω = R_di/E_di ≤ q. For each seismic combination with Max / Min (response spectrum) the support
    //     reactions split exactly into E_F,G = (Max + Min)/2 and E_F,E = (Max − Min)/2
    out.fdn = null;
    if ((d.supports || []).length) {
      const ls = EC.loads && EC.loads.settings ? EC.loads.settings() : null, q = ls && +ls.q > 0 ? +ls.q : 3.9;
      const gRd = q <= 3 ? 1.0 : 1.2, Om = Math.min(+s.omega || 1, q), k = gRd * Om, Wf = +s.Wf || 0, Rt = +s.Rtd || 0;
      const withG = c => { const r = d.base.find(q => q.combo === c); return r && Math.abs(r.FZ) > 1; };
      const list = [];
      d.supports.forEach(p => {
        const cs = [...new Set(p.rows.filter(r => role(r.combo) === 'seis' && withG(r.combo)).map(r => r.combo))];   // G + ψ2Q + E, not E alone
        let best = null;
        cs.forEach(c => {
          const mx = p.rows.find(r => r.combo === c && /max/i.test(r.step || '')), mn = p.rows.find(r => r.combo === c && /min/i.test(r.step || ''));
          if (!mx || !mn) return;
          const G = f => (mx[f] + mn[f]) / 2, E = f => Math.abs(mx[f] - mn[f]) / 2;
          const NG = G('FZ'), NE = E('FZ'), H = Math.hypot(Math.abs(G('FX')) + k * E('FX'), Math.abs(G('FY')) + k * E('FY'));
          const r = { combo: c, NG, NE, Nmax: NG + k * NE, Nmin: NG - k * NE, H };
          if (!best || r.Nmin < best.Nmin) best = Object.assign(r, { NmaxAll: Math.max(r.Nmax, best ? best.NmaxAll : -Infinity) });
          else best.NmaxAll = Math.max(best.NmaxAll, r.Nmax);
        });
        if (!best) return;
        const T = Math.max(0, -best.Nmin - 0.9 * Wf);
        list.push(Object.assign(best, { label: p.label, x: +p.x, y: +p.y, T, U: T > 0 ? (Rt > 0 ? T / Rt : 9.99) : 0, min: { FZ: best.Nmin, combo: best.combo }, max: { FZ: best.NmaxAll } }));
      });
      if (list.length) out.fdn = { list, q, gRd, Om, k, capped: (+s.omega || 1) > q };
    }
    // 21. steel frame design summary - the ETABS steel frame design (EN 1993-1-1 6.2 cross-section, 6.3.3 member
    //     interaction eq. 6.61 / 6.62): governing ratio of every member, ≤ 1; cross-check with the ETABS-linked
    //     steel elements of the app (their own utilisation)
    out.steel = null;
    if ((d.steel || []).length) {
      const els = api.proj && api.proj() ? api.proj().elements || [] : [];
      const rows = d.steel.map(r => {
        const e = els.find(x => x.etabs && !x.etabs.copy && x.etabs.label === r.label && x.etabs.story === r.story);
        let app = null; try { if (e && EC.modules && EC.modules[e.type] && EC.modules[e.type].calc) app = EC.modules[e.type].calc(e.inputs).Umax; } catch (er) { app = null; }
        return Object.assign({}, r, { z: zOf2(r.story), U: +r.ratio || 0, e, app });
      });
      const kinds = [...new Set(rows.map(r => r.kind))];
      const prof = kinds.map(k => ({ k, pts: st.map(x => { const rs = rows.filter(r => r.kind === k && r.story === x.name); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(r => r.U)) } : null; }).filter(Boolean) }));
      out.steel = { rows, kinds, prof };
    }
    // 22. punching shear - EN 1992-1-1 6.4: V_Ed per column and floor = N below − N above (ULS gravity combination);
    //     β = 1.15 / 1.4 / 1.5 interior / edge / corner (6.4.3(6), Fig. 6.21N); basic control perimeter u_1 at 2d (6.4.2);
    //     v_Ed = β·V_Ed/(u_1·d) ≤ v_Rd,c = C_Rd,c·k·(100ρ_l·f_ck)^⅓ ≥ v_min (6.4.4(1), C_Rd,c = 0.18/γ_c), else punching
    //     reinforcement (6.4.5); v_Ed,0 = β·V_Ed/(u_0·d) ≤ v_Rd,max = 0.4·ν·f_cd at the column face (6.4.5(3))
    out.punch = null;
    const AXU = d.axialU;
    if (AXU && (AXU.stacks || []).length && (d.strength || []).length) {
      const idx = {}; st.forEach((x, i) => { idx[x.name] = i; });
      const cols = AXU.stacks.filter(k => k.kind === 'column');
      const xs = cols.map(k => +k.x), ys = cols.map(k => +k.y), tol = 0.3;
      const sl = (d.slabs || []).filter(x => x.t > 0), slMin = sl.length ? sl.reduce((a, x) => (x.t < a.t ? x : a)) : null;
      const t = +s.slabT > 0 ? +s.slabT : slMin ? slMin.t : 0.2, fck = +s.slabFck > 0 ? +s.slabFck : slMin && slMin.f > 0 ? slMin.f : 30;
      const dd = Math.max(0.05, t - (+s.punchCov || 0.035)), dm = dd * 1000, rho = Math.min(0.02, +s.rhoL || 0.006);
      const k = Math.min(2, 1 + Math.sqrt(200 / dm)), vRdc = Math.max(0.12 * k * Math.pow(100 * rho * fck, 1 / 3), 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck));
      const nu = 0.6 * (1 - fck / 250), vRdmax = 0.4 * nu * fck / 1.5;
      const rows = [];
      cols.forEach(c => {
        const ex = Math.abs(c.x - Math.min(...xs)) < tol || Math.abs(c.x - Math.max(...xs)) < tol, ey = Math.abs(c.y - Math.min(...ys)) < tol || Math.abs(c.y - Math.max(...ys)) < tol;
        const pos = ex && ey ? 'corner' : ex || ey ? 'edge' : 'interior', beta = { interior: 1.15, edge: 1.4, corner: 1.5 }[pos];
        const lv = c.levels.filter(l => idx[l.story] !== undefined).sort((a, b2) => idx[a.story] - idx[b2.story]);
        lv.forEach((l, i) => {
          const sec = d.strength.find(e => e.kind === 'column' && e.obj === c.name && e.story === l.story); if (!sec || !(sec.hx > 0)) return;
          const V = l.N - (i + 1 < lv.length ? lv[i + 1].N : 0); if (!(V > 0)) return;
          const hx = +sec.hx, hy = +sec.hy, cpar = ex ? hy : hx, cperp = ex ? hx : hy;   // edge: c_par along the free edge
          const u0 = pos === 'interior' ? 2 * (hx + hy) : pos === 'edge' ? Math.min(cpar + 3 * dd, cpar + 2 * cperp) : Math.min(3 * dd, hx + hy);
          const u1 = pos === 'interior' ? 2 * (hx + hy) + 4 * Math.PI * dd : pos === 'edge' ? cpar + 2 * cperp + 2 * Math.PI * dd : hx + hy + Math.PI * dd;
          const vEd = beta * V * 1000 / (u1 * 1000 * dm), vEd0 = beta * V * 1000 / (u0 * 1000 * dm);
          rows.push({ col: c.name, story: l.story, z: st[idx[l.story]].elev, pos, beta, V, hx, hy, u0, u1, vEd, vEd0, U1: vEd / vRdc, U0: vEd0 / vRdmax, U: Math.max(vEd / vRdc, vEd0 / vRdmax) });
        });
      });
      if (rows.length) out.punch = { rows, t, fck, d: dd, rho, vRdc, vRdmax, k, combo: AXU.combo, tFrom: +s.slabT > 0 ? 'input' : slMin ? 'ETABS ' + slMin.prop : 'default' };
    }
    // 23. columns DCM / DCH - EN 1998-1 5.4.2.3 (5.5.2.2): capacity-design shear
    //     V_Ed = γ_Rd·2·M_Rc·min(1, ΣM_Rb/ΣM_Rc)/l_cl (γ_Rd 1.1 DCM, 1.3 DCH), ΣM_Rb/ΣM_Rc from the ETABS joint ratio
    //     (1.3·ΣM_Rb/ΣM_Rc); M_Rc of the rectangular section with the ETABS required steel (0.4·A_s per face, both yielding,
    //     rectangular stress block) at N_Ed of the seismic combination; ν_d = N_Ed/(A_c·f_cd) ≤ 0.65 / 0.55 (5.4.3.2.1(3), 5.5.3.2.1(3))
    out.cols = null;
    const AXE = d.axialE;
    if ((d.colDesign || []).length && (d.strength || []).length && AXE && (AXE.stacks || []).length) {
      const H = s.dcl === 'H', gRd = H ? 1.3 : 1.1, nuLim = H ? 0.55 : 0.65, fyd = (+s.fyk || 500) / 1.15, d2 = +s.colCov || 0.05, hb = +s.hb || 0;
      const top = st.length ? st[st.length - 1].name : null;
      const rows = [];
      d.colDesign.forEach(cd => {
        const sec = d.strength.find(e => e.kind === 'column' && e.obj === cd.label && e.story === cd.story && e.shape === 'rect');
        const stk = AXE.stacks.find(k => k.kind === 'column' && k.name === cd.label), lv = stk && stk.levels.find(l => l.story === cd.story), x = st.find(q => q.name === cd.story);
        if (!sec || !lv || !x) return;
        const fck = +sec.f || 30, fcd = fck / 1.5, N = Math.max(0, +lv.N), Asf = 0.4 * (+cd.As || 0);
        const MRc = (hh, bb) => { const xc = Math.min(hh, N / (0.8 * bb * fcd * 1000)); return Math.max(0, N * (hh / 2 - 0.4 * xc) + Asf * fyd * 1000 * (hh - 2 * d2)); };
        const jt = (d.joints || []).find(j => j.label === cd.label && j.story === cd.story);
        const lcl = Math.max(0.5, x.h - hb), ex = cd.story === top;
        const one = (MR, bc) => gRd * 2 * MR * Math.min(1, bc != null ? bc / 1.3 : 1) / lcl;
        const Mx = MRc(+sec.hx, +sec.hy), My = MRc(+sec.hy, +sec.hx);
        const nu = N / (sec.hx * sec.hy * fcd * 1000);
        rows.push({ col: cd.label, story: cd.story, z: x.elev, hx: +sec.hx, hy: +sec.hy, fck, N, As: +cd.As, Mx, My, lcl, Vx: one(Mx, jt ? +jt.bc : null), Vy: one(My, jt ? +jt.bcm : null), nu, U: nu / nuLim, top: ex, approx: N / (0.8 * Math.min(sec.hx, sec.hy) * fcd * 1000) > 0.6 * Math.max(sec.hx, sec.hy) });
      });
      if (rows.length) out.cols = { rows, gRd, nuLim, H, combo: AXE.combo };
    }
    // 24. beams DCM / DCH - EN 1998-1 5.4.2.2(1)-(2) (5.5.2.1): capacity-design shear at the beam ends
    //     V_Ed = V_g+ψ2q + γ_Rd·(M_Rb,1 + M_Rb,2)/l_cl for both sway directions (hogging at one end, sagging at the other),
    //     γ_Rd = 1.0 DCM / 1.2 DCH; M_Rb = A_s·f_yd·0.9d from the ETABS required end steel; compared with the shear the ETABS
    //     links resist V_Rd,s = (A_sw/s)·0.9d·f_ywd·cotθ (EN 1992-1-1 6.2.3(3))
    out.beams = null;
    const BM = d.beamDesign;
    if (BM && (BM.beams || []).length) {
      const H = s.dcl === 'H', gRd = H ? 1.2 : 1.0, fyd = (+s.fyk || 500) / 1.15, cov = +s.beamCov || 0.05, cot = +s.cotTh || 1, cw = +s.colW || 0;
      const zOf3 = {}; st.forEach(x => { zOf3[x.name] = x.elev; });
      const rows = BM.beams.filter(bm => zOf3[bm.story] !== undefined && bm.h > 0).map(bm => {
        const dd = bm.h - cov, M = As => As * fyd * 1000 * 0.9 * dd, lcl = Math.max(0.5, bm.L - cw);
        const S1 = M(+bm.topI) + M(+bm.botJ), S2 = M(+bm.botI) + M(+bm.topJ), SM = Math.max(S1, S2), Vg = Math.max(+bm.VgI || 0, +bm.VgJ || 0);
        const VCD = Vg + gRd * SM / lcl, VRs = (+bm.Av || 0) * 0.9 * dd * fyd * 1000 * cot;
        return { label: bm.label, story: bm.story, z: zOf3[bm.story], sec: bm.sec, b: +bm.b, h: +bm.h, L: +bm.L, lcl, Vg, SM, VCD, VRs, U: VRs > 0 ? VCD / VRs : 9.99 };
      });
      if (rows.length) out.beams = { rows, gRd, H, combo: BM.combo, cot };
    }
    // 25. slab deflection - EN 1992-1-1 7.4.1(4)-(5): sag of each slab bay between the columns relative to its corners from the
    //     ETABS joint displacements of the quasi-permanent combination. ETABS linear analysis → long-term:
    //     δ_LT = δ_ETABS·m·k_cr·(1 + φ) (m = slab bending modifier of the model, so δ_ETABS·m is the uncracked value;
    //     k_cr = I_g/I_eff cracked; φ creep, effective modulus 7.4.3(5)); δ after the partitions δ_inc = δ_ETABS·m·k_cr·(1 + φ − η)
    //     (η = part of the quasi-permanent load on before the partitions, its instantaneous deflection is excluded).
    //     Limits span/250 (appearance) and span/500 (damage to partitions); span = longer side of the bay (sag measured from the columns).
    out.slab = null;
    const SD = d.slabDefl;
    if (SD && (SD.panels || []).length) {
      const phi = +s.phi || 0, kcr = +s.slabCr || 1, eta = +s.slabEta || 0, L1 = +s.slabL1 || 250, L2 = +s.slabL2 || 500, lt = !!s.slabLT;
      const zOf4 = {}; st.forEach(x => { zOf4[x.name] = x.elev; });
      const rows = SD.panels.filter(p => zOf4[p.story] !== undefined && p.d != null).map(p => {
        const L = Math.max(+p.Lx || 0, +p.Ly || 0), mm = p.m > 0 ? +p.m : 1;
        const dLT = lt ? +p.d : +p.d * mm * kcr * (1 + phi), dInc = dLT * Math.max(0, 1 + phi - eta) / (1 + phi);
        const U1 = L > 0 ? dLT / (L / L1) : 0, U2 = L > 0 ? dInc / (L / L2) : 0;
        return { story: p.story, z: zOf4[p.story], bay: [p.x0, p.x1, p.y0, p.y1].map(v => String(Math.round(v * 10) / 10)).reduce((t, v, i) => t + (i === 1 || i === 3 ? '–' : i === 2 ? ' / ' : '') + v, ''), Lx: +p.Lx, Ly: +p.Ly, L, dE: +p.d, m: mm, prop: p.prop || '', dLT, dInc, U1, U2, U: Math.max(U1, U2) };
      });
      if (rows.length) out.slab = { rows, combo: SD.combo, phi, kcr, eta, L1, L2, lt, k: lt ? 1 : (rows[0].m * kcr * (1 + phi)) };
    }
    // 26. staged construction - EN 1992-1-1 3.1.4, EN 1990 (execution stages): last stage of the ETABS staged-construction case.
    //     (a) load redistribution N_staged / N_one-step per stack and storey (one-step analysis loads the stiff core too much);
    //     (b) level change of every floor after it was cast from ETABS (uz of joints added in later stages counts from their
    //     placement) - differential to the nearest stack Δ/L ≤ 1/limit (same limit as 15); compared with the estimate of 15
    out.staged = null;
    const SG = d.staged;
    if (SG && (SG.stacks || []).length) {
      const idx = {}; st.forEach((x, i) => { idx[x.name] = i; });
      const lim = +s.shortLim || 500, ax = {}; ((d.axial || {}).stacks || []).forEach(k => k.levels.forEach(l => { ax[k.name + '|' + l.story] = l.N; }));
      const est = {}; ((out.short || {}).stacks || []).forEach(k => k.prof.forEach(p => { est[k.name + '|' + p.story] = p.post; }));
      const S = SG.stacks.map(k => ({ name: k.name, kind: k.kind, x: +k.x, y: +k.y, lv: k.levels.filter(l => idx[l.story] !== undefined) })).filter(k => k.lv.length);
      const rows = [];
      S.forEach(a => {
        const nb = S.filter(b2 => b2 !== a).map(b2 => [b2, Math.hypot(b2.x - a.x, b2.y - a.y)]).filter(q => q[1] > 0.5).sort((p1, p2) => p1[1] - p2[1])[0];
        a.lv.forEach(l => {
          const N1 = ax[a.name + '|' + l.story], u = l.uz != null ? -l.uz : null, o = nb ? nb[0].lv.find(q => q.story === l.story) : null;
          const diff = u != null && o && o.uz != null ? Math.abs(u + o.uz) : null, tilt = diff != null ? diff / nb[1] : null;
          rows.push({ name: a.name, kind: a.kind, story: l.story, z: st[idx[l.story]].elev, N: +l.N, N1: N1 != null ? N1 : null, rN: N1 > 0 ? l.N / N1 : null,
            u, est: est[a.name + '|' + l.story] != null ? est[a.name + '|' + l.story] : null, nb: nb ? nb[0].name : '', L: nb ? nb[1] : null, diff, tilt, U: tilt != null ? tilt * lim : 0 });
        });
      });
      if (rows.length) out.staged = { rows, cases: SG.cases || [], case: SG.case, lim, combo1: (d.axial || {}).combo || '' };
    }
    // 27. coupling beams - EN 1998-1 5.5.3.5: the ordinary beam rules (5.5.3.1) suffice when cracking is unlikely,
    //     V_Ed ≤ f_ctd·b_w·d (f_ctd = 0.7·0.3·f_ck^(2/3)/1.5), or flexure governs, l/h ≥ 3 (5.5.3.5(2)); otherwise two groups of
    //     diagonal bars, V_Ed ≤ 2·A_si·f_yd·sin α (5.5.3.5(3)), α = atan((h − 2·d')/l). The section is checked against the strut
    //     capacity V_Rd,max = 0.5·ν·f_cd·b_w·z (EN 1992-1-1 6.2.3(3), θ = 45°, ν = 0.6(1 − f_ck/250), z = 0.9d)
    out.coup = null;
    if ((d.spandrels || []).length) {
      const fyd = (+s.fyk || 500) / 1.15, cov = +s.beamCov || 0.05, zOf5 = {}; st.forEach(x => { zOf5[x.name] = x.elev; });
      const rows = [];
      d.spandrels.forEach(sp => sp.levels.filter(l => zOf5[l.story] !== undefined && l.h > 0 && l.t > 0 && l.L > 0).forEach(l => {
        const fck = +l.fck > 0 ? +l.fck : 30, dd = l.h - cov, fctd = 0.7 * 0.3 * Math.pow(fck, 2 / 3) / 1.5, Vcr = fctd * 1000 * l.t * dd;
        const al = Math.atan(Math.max(l.h - 2 * cov, 0.01) / l.L), diag = !(l.V <= Vcr || l.L / l.h >= 3);
        const Asi = diag ? l.V / (2 * fyd * 1000 * Math.sin(al)) : 0, nu = 0.6 * (1 - fck / 250), Vmax = 0.5 * nu * fck / 1.5 * 1000 * l.t * 0.9 * dd;
        rows.push({ name: sp.name, story: l.story, z: zOf5[l.story], L: +l.L, h: +l.h, t: +l.t, fck, V: +l.V, Vcr, ar: l.L / l.h, diag, al, Asi, Vmax, U: l.V / Vmax, combo: l.case });
      }));
      if (rows.length) out.coup = { rows, fyd };
    }
    return out;
  }

  /* support plan (true scale): FZ,min at each support - compression filled, tension outlined in the critical colour */
  function supPlan(list) {
    if (!list.length) return '';
    const xs = list.map(p => p.x), ys = list.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = 380, pad = 26, sc = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1), 300 / Math.max(y1 - y0, 1)), Hh = (y1 - y0) * sc + 2 * pad + 18;
    const X = x => pad + (x - x0) * sc, Y = y => Hh - 18 - pad - (y - y0) * sc, fmax = Math.max(...list.map(p => Math.abs(p.min.FZ)), 1);
    const dots = list.map(p => { const r = 4 + 9 * Math.sqrt(Math.abs(p.min.FZ) / fmax), t = p.min.FZ < 0;
      return `<g class="pt"><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${r.toFixed(1)}" fill="${t ? 'var(--surface)' : 'var(--s1)'}" stroke="${t ? 'var(--critical)' : 'var(--surface)'}" stroke-width="${t ? 2.5 : 1.5}"><title>${esc(p.label)} (${api.fmt(p.x, 2)}, ${api.fmt(p.y, 2)}) · FZ,min = ${api.fmt(p.min.FZ, 0)} kN (${esc(p.min.combo)}) · FZ,max = ${api.fmt(p.max.FZ, 0)} kN</title></circle></g>`; }).join('');
    return `<figure class="bc-chart"><svg viewBox="0 0 ${W} ${Hh.toFixed(0)}" role="img" aria-label="Support reactions in plan">
      <line x1="${X(x0)}" x2="${X(x1)}" y1="${Hh - 10}" y2="${Hh - 10}" stroke="var(--axis)"/><text x="${(X(x0) + X(x1)) / 2}" y="${Hh - 13}" text-anchor="middle" class="ax">${api.fmt(x1 - x0, 2)} m</text>
      ${dots}</svg><figcaption class="legend"><span><i style="background:var(--s1)"></i>compression (FZ,min)</span><span><i style="background:var(--surface);box-shadow:inset 0 0 0 2px var(--critical)"></i>uplift</span><span>size ∝ |FZ,min|</span></figcaption></figure>`;
  }

  /* storey shear resistance of one vertical member along X and Y, kN (a resistance index for comparing storeys):
     concrete V_Rd,c,min = v_min·b_w·d, v_min = 0.035·k^1.5·√f_ck, k = 1 + √(200/d) ≤ 2 (EN 1992-1-1 6.2.2(1), no
     shear reinforcement, no axial force); columns d = 0.9·h; walls in plane only, d = 0.8·l_w (projected on X / Y);
     steel and other sections V_pl = A_v·f_y/√3 (EN 1993-1-1 6.2.6(2)) */
  function vrd(e) {
    const f = +e.f || 0;
    const vc = (bw, dd) => { if (!(bw > 0 && dd > 0)) return 0; const k = Math.min(2, 1 + Math.sqrt(200 / (dd * 1000))); return 0.035 * Math.pow(k, 1.5) * Math.sqrt(f) * bw * dd * 1000; };
    if (e.mat === 'Concrete' && e.shape === 'rect') return { X: vc(e.hy, 0.9 * e.hx), Y: vc(e.hx, 0.9 * e.hy) };
    if (e.mat === 'Concrete' && e.shape === 'circle') { const v = vc(0.9 * e.D, 0.8 * e.D); return { X: v, Y: v }; }
    if (e.shape === 'wall') { const v = e.mat === 'Steel' ? e.t * e.L * f / Math.sqrt(3) * 1000 : vc(e.t, 0.8 * e.L), a = (+e.ang || 0) * Math.PI / 180; return { X: v * Math.abs(Math.cos(a)), Y: v * Math.abs(Math.sin(a)) }; }
    if (e.mat === 'Concrete') return { X: vc(Math.sqrt(e.Avx || 0), Math.sqrt(e.Avx || 0)), Y: vc(Math.sqrt(e.Avy || 0), Math.sqrt(e.Avy || 0)) };
    return { X: (e.Avx || 0) * f / Math.sqrt(3) * 1000, Y: (e.Avy || 0) * f / Math.sqrt(3) * 1000 };
  }
  /* demo: same members as the --mock bridge (/strength) */
  function demoStrength() {
    const out = [];
    for (let i = 0; i < 10; i++) {
      const s = 'Story' + (i + 1), [c, f] = i < 3 ? [0.6, 40] : i < 7 ? [0.5, 35] : [0.4, 30], [t, fw] = i < 5 ? [0.25, 40] : [0.2, 30];
      for (let k = 0; k < 20; k++) out.push({ story: s, obj: 'C' + (k + 1), sec: `C${c * 1000}x${c * 1000} C${f}`, kind: 'column', mat: 'Concrete', f, shape: 'rect', hx: c, hy: c });
      [[0, 7], [0, 7], [90, 6], [90, 6]].forEach(([ang, L], k) => out.push({ story: s, obj: 'W' + (k + 1), sec: `W${t * 1000} C${fw}`, kind: 'wall', mat: 'Concrete', f: fw, shape: 'wall', L, t, ang }));
    }
    return out;
  }

  /* cumulative participating mass vs mode number (X, Y) with the 90 % line */
  function cumChart(md) {
    const W = 380, Hh = 220, l = 44, r = 16, t = 12, bt = 34, n = md.length;
    const X = i => l + (n > 1 ? (i / (n - 1)) : 0.5) * (W - l - r), Y = v => t + (1 - v) * (Hh - t - bt);
    const ser = [['ΣU_X', '--s1', 'SumUx'], ['ΣU_Y', '--s2', 'SumUy']];
    return `<figure class="bc-chart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Cumulative participating mass by mode">
      ${[0, 0.25, 0.5, 0.75, 1].map(v => `<line x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${Math.round(v * 100)}%</text>`).join('')}
      <line x1="${l}" x2="${W - r}" y1="${Y(0.9)}" y2="${Y(0.9)}" stroke="var(--ink-2)" stroke-dasharray="4 3"/><text x="${W - r}" y="${Y(0.9) + 13}" text-anchor="end" class="ax lim">90 %</text>
      ${md.map((m, i) => (n <= 15 || i % Math.ceil(n / 15) === 0) ? `<text x="${X(i)}" y="${Hh - bt + 14}" text-anchor="middle" class="ax">${m.mode}</text>` : '').join('')}
      ${ser.map(([nm, c, k]) => `<polyline points="${md.map((m, i) => X(i).toFixed(1) + ',' + Y(Math.min(1, m[k])).toFixed(1)).join(' ')}" fill="none" stroke="var(${c})" stroke-width="2" stroke-linejoin="round"/>` +
        md.map((m, i) => `<g class="pt"><circle cx="${X(i).toFixed(1)}" cy="${Y(Math.min(1, m[k])).toFixed(1)}" r="4" fill="var(${c})" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(i).toFixed(1)}" cy="${Y(Math.min(1, m[k])).toFixed(1)}" r="10" fill="transparent"><title>Mode ${m.mode} · T = ${api.fmt(m.T, 3)} s · ${nm} = ${api.fmt(m[k] * 100, 1)} %</title></circle></g>`).join('')).join('')}
      <text x="${(l + W - r) / 2}" y="${Hh - 4}" text-anchor="middle" class="ax">mode</text></svg>
      <figcaption class="legend"><span><i style="background:var(--s1)"></i>ΣU<sub>X</sub></span><span><i style="background:var(--s2)"></i>ΣU<sub>Y</sub></span><span>┆ 90 %</span></figcaption></figure>`;
  }

  /* ---------- stiffness modifiers vs the purpose of the analysis ----------
   * seis: EN 1998-1 4.3.1(6)-(7) cracked stiffness, 0.5 of the uncracked (or a more accurate cracked analysis, e.g. the
   *       ACI 318 cracked values 0.35-0.7); wind: service level ≈ 1.4 × the ACI strength-level values (≤ 1.0);
   * pdelta: EN 1992-1-1 5.8.7.2 nominal stiffness EI = Kc·Ecd·Ic + Ks·Es·Is, ≈ 0.15-0.5 of Ec·Ic with creep.
   * Steel members are not reduced; mass, weight and axial area stay 1.0. */
  const PURPOSE = {
    seis: ['Seismic ULS forces, drift, θ (EN 1998-1 4.3.1(7))', { columns: [0.35, 0.7], beams: [0.3, 0.7], braces: [0.35, 0.7], walls: [0.35, 0.7], slabsM: [0.25, 0.5], slabsF: [0.25, 1], shear: [0.4, 1] }],
    wind: ['Wind SLS drift (service level ≈ 1.4 × cracked)', { columns: [0.7, 1], beams: [0.35, 0.7], braces: [0.7, 1], walls: [0.5, 1], slabsM: [0.25, 0.5], slabsF: [0.5, 1], shear: [0.5, 1] }],
    pdelta: ['P-Δ and buckling α<sub>cr</sub> (EN 1992-1-1 5.8.7.2)', { columns: [0.15, 0.5], beams: [0.15, 0.5], braces: [0.15, 0.5], walls: [0.15, 0.5], slabsM: [0.15, 0.5], slabsF: [0.25, 1], shear: [0.4, 1] }]
  };
  function modCheck(props, purpose) {
    const R = PURPOSE[purpose][1], f2 = v => api.fmt(v, 2);
    return (props || []).map(p => {
      const uses = Object.keys(p.use || {}), main = uses.sort((a, c) => p.use[c] - p.use[a])[0] || 'other';
      const issues = [];
      const chk = (mods, where) => {
        const M = k => (mods[k] === undefined ? 1 : +mods[k]);
        ['Mass', 'Weight'].forEach(k => { if (Math.abs(M(k) - 1) > 1e-6) issues.push({ lvl: 'bad', t: `${k} ${f2(M(k))} ≠ 1.0${where}: changes the ${k === 'Mass' ? 'seismic mass' : 'self-weight'}` }); });
        if (p.kind === 'frame' && Math.abs(M('A') - 1) > 1e-6) issues.push({ lvl: 'warn', t: `axial area ${f2(M('A'))}${where}: keep 1.0 (reduce only for column shortening)` });
        if (p.mat === 'Steel') {
          const ks = p.kind === 'frame' ? ['I22', 'I33', 'As2', 'As3'] : ['f11', 'f22', 'f12', 'm11', 'm22', 'm12'];
          ks.filter(k => Math.abs(M(k) - 1) > 0.01).forEach(k => issues.push({ lvl: 'warn', t: `steel ${k} ${f2(M(k))}${where}: steel is not reduced - second order through imperfections and α<sub>cr</sub>` }));
          return;
        }
        const range = (ks, r, what) => ks.forEach(k => { const v = M(k); if (v > r[1] + 1e-6) issues.push({ lvl: 'bad', t: `${k} ${f2(v)} > ${r[1]}${where}: too stiff for ${what}` }); else if (v < r[0] - 1e-6) issues.push({ lvl: 'warn', t: `${k} ${f2(v)} < ${r[0]}${where}: softer than usual for ${what}` }); });
        if (p.kind === 'frame') { range(['I22', 'I33'], R[main] || R.beams, main); range(['As2', 'As3'], R.shear, 'shear'); }
        else if (main === 'walls') { range(['f22', 'm11', 'm22'], R.walls, 'walls'); range(['f12'], R.shear, 'wall shear'); }
        else { range(['m11', 'm22', 'm12'], R.slabsM, 'slab bending'); range(['f11', 'f22', 'f12'], R.slabsF, 'diaphragm'); }
      };
      chk(p.mods, '');
      (p.over || []).forEach(o => { const eff = {}; Object.keys(p.mods).forEach(k => { eff[k] = (+p.mods[k]) * (o.mods[k] === undefined ? 1 : +o.mods[k]); }); chk(eff, ` (object ${o.obj} × override)`); });
      const st = issues.some(i => i.lvl === 'bad') ? 'bad' : issues.length ? 'warn' : 'ok';
      return { p, main, uses, issues, st };
    });
  }
  const demoMods = () => {
    const F = o => Object.assign({ A: 1, As2: 1, As3: 1, J: 1, I22: 1, I33: 1, Mass: 1, Weight: 1 }, o), A = o => Object.assign({ f11: 1, f22: 1, f12: 1, m11: 1, m22: 1, m12: 1, v13: 1, v23: 1, Mass: 1, Weight: 1 }, o);
    return [{ kind: 'frame', name: 'C600x600 C40', mat: 'Concrete', use: { columns: 36 }, mods: F({ I22: 0.5, I33: 0.5, As2: 0.5, As3: 0.5 }), over: [] },
      { kind: 'frame', name: 'B300x600 C30', mat: 'Concrete', use: { beams: 84 }, mods: F({ I22: 0.35, I33: 0.35, J: 0.1 }), over: [{ obj: 'B12-Story3', mods: F({ I33: 2.0 }) }] },
      { kind: 'frame', name: 'B400x700 C30', mat: 'Concrete', use: { beams: 22 }, mods: F({}), over: [] },
      { kind: 'frame', name: 'HEB300', mat: 'Steel', use: { braces: 8 }, mods: F({}), over: [] },
      { kind: 'area', name: 'W250 C40', mat: 'Concrete', use: { walls: 40 }, mods: A({ f22: 0.5, f12: 0.5, m11: 0.5, m22: 0.5 }), over: [] },
      { kind: 'area', name: 'S200 C30', mat: 'Concrete', use: { slabs: 60 }, mods: A({ m11: 0.25, m22: 0.25, m12: 0.25, Mass: 0.9 }), over: [] }];
  };

  /* ---------- P-Δ / sway design of the ETABS-linked members ----------
   * EN 1998-1 4.4.2.2(3): seismic action effects × 1/(1−θ) of the storey (0.1 < θ ≤ 0.2).
   * EN 1993-1-1 5.2.2(5)B: sway effects × 1/(1−1/αcr) (3 ≤ αcr < 10) for the non-seismic combinations.
   * The moments and shears of the governing case are multiplied (conservative: the gravity part is amplified too);
   * the original ETABS values are kept in e.pdelta.base so the factor can be changed or removed. */
  const AMP = { beam: ['MEd', 'MEdh', 'VEd'], column: ['My1', 'My2', 'Mz1', 'Mz2'], shearwall: ['M', 'V'], steel: ['MEd', 'VEd'], footing: ['MEx', 'MEy'] };
  function memberFactors(b, R) {
    const role = c => b.roles[c] || 'off';
    const seisNames = Object.keys(b.roles).filter(c => role(c) === 'seis');
    const st = R.st, low = st.length ? st[0].name : null;
    // combinations with horizontal load (base shear > 1 % of the vertical load, or lateral-only cases)
    const lateral = (b.data.base || []).filter(r => { const H = Math.hypot(r.FX, r.FY), V = Math.abs(r.FZ); return H > 1e-6 && (V < 1e-6 || H > 0.01 * V); }).map(r => r.combo);
    // gravity combinations that carry only imperfection-level horizontal load (notional loads: H ≤ 1 % of V)
    const imper = (b.data.base || []).filter(r => { const H = Math.hypot(r.FX, r.FY), V = Math.abs(r.FZ); return H > 1e-6 && V > 1e-6 && H <= 0.01 * V; }).map(r => r.combo);
    const has = (e, names) => names.some(c => String(e.etabs.combo || '').includes(c));
    return api.proj().elements.filter(e => e.etabs && AMP[e.type]).map(e => {
      const story = st.some(x => x.name === e.etabs.story) ? e.etabs.story : low;   // supports (Base) take the lowest storey
      const seis = has(e, seisNames), lat = has(e, lateral), imp = !lat && has(e, imper), sway = seis || lat || (imp && b.set.ampImp);
      let k = 1, basis = '', kk = null;
      if (seis) {
        const th = R.theta.filter(x => x.story === story);
        const t = th.length ? Math.max(...th.map(x => x.th)) : 0;
        if (t > 0.2) { k = null; basis = `θ = ${api.fmt(t, 3)} > 0.2: second-order analysis needed`; }
        else if (t > 0.1) { k = 1 / (1 - t); basis = `θ = ${api.fmt(t, 3)} (${esc(story)}) → 1/(1−θ)`; }
        else basis = th.length ? `θ = ${api.fmt(t, 3)} ≤ 0.1 → no amplification` : 'no θ for this storey';
      } else if (!sway) {
        basis = imp ? 'gravity + imperfections (notional loads): sway share small, not amplified (option below)' : has(e, (b.data.base || []).map(r => r.combo)) ? 'gravity-only governing case → no sway amplification' : 'governing case not read on this page - give it a role (ULS) and read again';
      } else if (R.acr) {
        const a = R.acr.a;
        if (a < 3) { k = null; basis = `α<sub>cr</sub> = ${api.fmt(a, 2)} < 3: second-order analysis needed`; }
        else if (a < 10) {
          k = 1 / (1 - 1 / a);
          const sh = imp ? nShare(b, e) : null;
          if (imp && sh) {   // exact: only the notional (sway) share of each force is amplified
            kk = {}; const pct = [];
            Object.keys(sh).forEach(x => { const v = Math.abs(+e.inputs[x] || 0), base0 = Math.abs(+((e.pdelta && e.pdelta.base) || e.inputs)[x] || 0) || v; if (base0 > 1e-9) { kk[x] = 1 + (k - 1) * Math.min(sh[x], base0) / base0; pct.push(`${x} +${api.fmt((kk[x] - 1) * 100, 2)} %`); } });
            basis = `α<sub>cr</sub> = ${api.fmt(a, 2)} → (1/(1−1/α<sub>cr</sub>) − 1) × notional share Σf·F(N) only (exact): ${pct.join(', ') || 'no notional forces'}`;
          } else basis = `α<sub>cr</sub> = ${api.fmt(a, 2)} → 1/(1−1/α<sub>cr</sub>)${imp ? ' · sway from imperfections (notional loads): whole M, V amplified - conservative (read the building with the notional patterns in ETABS for the exact share)' : ''}`;
        }
        else basis = `α<sub>cr</sub> = ${api.fmt(a, 2)} ≥ 10 → no amplification`;
      } else basis = 'no buckling factor (add a buckling case)';
      const base = (e.pdelta && e.pdelta.base) || Object.fromEntries(AMP[e.type].filter(x => e.inputs[x] !== undefined).map(x => [x, e.inputs[x]]));
      const U = inp => { try { return EC.modules[e.type].calc(Object.assign({}, e.inputs, inp)).Umax; } catch (er) { return NaN; } };
      const fx = x => (kk && kk[x] != null ? kk[x] : kk ? 1 : k);
      const amp = k && k > 1 ? Object.fromEntries(Object.keys(base).map(x => [x, Math.round(base[x] * fx(x) * 10) / 10])) : base;
      const kShow = kk ? Math.max(1, ...Object.values(kk)) : k;
      return { e, story, seis, k: kShow, kk, basis, base, U0: U(base), U1: U(amp), applied: e.pdelta ? e.pdelta.k : null };
    });
  }
  /* exact P-Δ share of the imperfections: for each amplified input, Σ |f_N|·F(N) over the notional cases N of the governing
     combination, F = the member's largest force of that kind under N (M3 / V2 / M2, support MX / MY) - read from ETABS */
  const NFORCE = { beam: { MEd: 'M3', MEdh: 'M3', VEd: 'V2' }, column: { My1: 'M3', My2: 'M3', Mz1: 'M2', Mz2: 'M2' }, shearwall: { M: 'M3', V: 'V2' }, steel: { MEd: 'M3', VEd: 'V2' }, footing: { MEx: 'MY', MEy: 'MX' } };
  function nShare(b, e) {
    const nf = b.data.nf && b.data.nf[e.etabs.story + '|' + e.etabs.label], cm = b.data.ncombos;
    if (!nf || !cm) return null;
    const strip = c => String(c || '').replace(/\s+(Max|Min)$/i, '').trim();
    const g = String(e.etabs.combo || ''), mb = /^M\+ (.+?) · M− (.+?) · V (.+)$/.exec(g);
    const comboOf = x => strip(mb ? { MEd: mb[1], MEdh: mb[2], VEd: mb[3] }[x] : g);
    const out = {}; let any = false;
    Object.entries(NFORCE[e.type] || {}).forEach(([x, F]) => {
      const items = cm[comboOf(x)]; if (!items) return;
      let s = 0; Object.entries(items).forEach(([c, f]) => { if (nf[c] && nf[c][F] != null) s += Math.abs(f) * Math.abs(nf[c][F]); });
      out[x] = s; any = true;
    });
    return any ? out : null;
  }
  /* demo: notional-case member forces of the linked members (about 3 % of their gravity forces, Dead 70 % / Live 30 %) */
  function demoNotional(b) {
    const items = { 'N Dead X': 1.35, 'N Live X': 1.5 };
    b.data.ncombos = { 'ULS1 1.35G+1.5Q': items };
    b.data.nf = {};
    api.proj().elements.filter(e => e.etabs && NFORCE[e.type]).forEach(e => {
      const share = { M3: 0, V2: 0, M2: 0, MX: 0, MY: 0 };
      Object.entries(NFORCE[e.type]).forEach(([x, F]) => { share[F] = Math.max(share[F], 0.03 * Math.abs(+(e.pdelta && e.pdelta.base ? e.pdelta.base[x] : e.inputs[x]) || 0)); });
      const per = f => Object.fromEntries(Object.entries(share).map(([F, v]) => [F, Math.round(v * f / 1.4 * 1000) / 1000]));   // Σ |f|·F(N) = 3 % of the force
      b.data.nf[e.etabs.story + '|' + e.etabs.label] = { 'N Dead X': per(0.7), 'N Live X': per(0.3 * 1.35 / 1.5) };
    });
  }
  /* member forces of the notional cases ("N <pattern> X|Y") for the linked members, and the combinations that use them */
  async function readNotional(b) {
    const ld = await EC.etabs.live.get('/loads');
    const ncases = (ld.patterns || []).filter(p => /^N\s.+\s[XY]$/.test(p.name) && (p.type === 12 || p.type === 8)).map(p => p.name);
    b.data.nf = null; b.data.ncombos = null;
    if (!ncases.length) return;
    const ncombos = {};
    (ld.combos || []).forEach(c => { const its = (c.items || []).filter(i => !i[2]); if (its.some(i => ncases.includes(i[0]))) ncombos[c.name] = Object.fromEntries(its.filter(i => ncases.includes(i[0])).map(i => [i[0], +i[1]])); });
    const want = new Set(api.proj().elements.filter(e => e.etabs).map(e => e.etabs.story + '|' + e.etabs.label));
    const j = await EC.etabs.live.get('/results?' + ncases.map(c => 'c=' + encodeURIComponent(c)).concat(['beams', 'columns', 'braces', 'piers', 'reactions'].map(k => 'k=' + k)).join('&'));
    const nf = {};
    (j.tables || []).forEach(t => {
      const h = (t.rows[0] || []).map(x => String(x).toLowerCase().replace(/\s+/g, '')), col = n => h.indexOf(n);
      const iS = col('story'), iL = 1, iC = col('outputcase');
      const F = ['M3', 'V2', 'M2', 'MX', 'MY'].map(f => [f, col(f.toLowerCase())]).filter(([, i]) => i >= 0);
      t.rows.slice(2).forEach(r => {
        const key = r[iS] + '|' + r[iL]; if (!want.has(key)) return;
        const o = ((nf[key] = nf[key] || {})[r[iC]] = nf[key][r[iC]] || {});
        F.forEach(([f, i]) => { o[f] = Math.max(o[f] || 0, Math.abs(+r[i] || 0)); });
      });
    });
    b.data.nf = nf; b.data.ncombos = ncombos;
  }
  function applyK(e, base, k, kk) {
    e.pdelta = { k, kk: kk || null, base, at: Date.now() };
    Object.keys(base).forEach(x => { e.inputs[x] = Math.round(base[x] * (kk ? (kk[x] != null ? kk[x] : 1) : k) * 10) / 10; });
    e.u = Date.now();
  }
  /* new ETABS forces arrived for an amplified member: keep the factor, refresh the base values */
  function reamp(e) {
    if (!e.pdelta || !AMP[e.type]) return;
    const base = Object.fromEntries(AMP[e.type].filter(x => e.inputs[x] !== undefined).map(x => [x, e.inputs[x]]));
    applyK(e, base, e.pdelta.k, e.pdelta.kk);
  }

  /* ---------- small storey-profile chart (value vs height) ---------- */
  function profile(series, opt) {
    const W = 380, Hh = 260, l = 64, r = 34, t = 12, bt = 34;
    const zs = series.flatMap(s => s.pts.map(p => p.z)); if (!zs.length) return '';
    const zmax = Math.max(...zs), vmax = Math.max(opt.limit || 0, ...series.flatMap(s => s.pts.map(p => p.v))) * 1.1 || 1;
    const X = v => l + v / vmax * (W - l - r), Y = z => t + (1 - z / zmax) * (Hh - t - bt);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * vmax);
    const fmtv = opt.fmt || (v => api.fmt(v, 3));
    const lines = series.map(s => { const ps = s.pts.slice().sort((a, c) => a.z - c.z);
      return `<polyline points="${ps.map(p => X(p.v).toFixed(1) + ',' + Y(p.z).toFixed(1)).join(' ')}" fill="none" stroke="var(${s.c})" stroke-width="2" stroke-linejoin="round"/>` +
        ps.map(p => `<g class="pt"><circle cx="${X(p.v).toFixed(1)}" cy="${Y(p.z).toFixed(1)}" r="4" fill="var(${s.c})" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(p.v).toFixed(1)}" cy="${Y(p.z).toFixed(1)}" r="10" fill="transparent"><title>${esc(p.story)} · ${esc(s.n)}: ${fmtv(p.v)}${opt.unit ? ' ' + opt.unit : ''}</title></circle></g>`).join(''); }).join('');
    const storyTicks = series[0].pts.slice().sort((a, c) => a.z - c.z).filter((p, i, a) => a.length <= 12 || i % Math.ceil(a.length / 12) === 0 || i === a.length - 1);
    return `<figure class="bc-chart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(opt.title)}">
      ${ticks.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${t}" y2="${Hh - bt}" stroke="var(--grid)"/><text x="${X(v)}" y="${Hh - bt + 14}" text-anchor="middle" class="ax">${fmtv(v)}</text>`).join('')}
      ${storyTicks.map(p => `<text x="${l - 6}" y="${Y(p.z) + 4}" text-anchor="end" class="ax">${esc(p.story)}</text>`).join('')}
      <line x1="${l}" x2="${l}" y1="${t}" y2="${Hh - bt}" stroke="var(--axis)"/>
      ${opt.limit ? `<line x1="${X(opt.limit)}" x2="${X(opt.limit)}" y1="${t}" y2="${Hh - bt}" stroke="var(--ink-2)" stroke-dasharray="4 3"/><text x="${X(opt.limit) - 4}" y="${Hh - bt - 6}" text-anchor="end" class="ax lim">limit ${fmtv(opt.limit)}</text>` : ''}
      ${lines}
      <text x="${(l + W - r) / 2}" y="${Hh - 4}" text-anchor="middle" class="ax">${esc(opt.xlabel)}</text></svg>
      <figcaption class="legend">${series.map(s => `<span><i style="background:var(${s.c})"></i>${esc(s.n)}</span>`).join('')}${opt.limit ? '<span>┆ limit</span>' : ''}</figcaption></figure>`;
  }

  /* ---------- wind comfort worksheets (one ETABS-linked Wind_TallBuilding element per direction) ---------- */
  const WT = 'mc:Wind_TallBuilding_EC1-2023_Standalone', WTID = 'Wind_TallBuilding_EC1-2023_Standalone';
  const wcEl = dir => api.proj().elements.find(e => e.type === WT && e.etabs && e.etabs.story === 'Building' && e.etabs.label === 'Wind ' + dir);
  const wcPending = new Set();
  function wcResult(e) {
    if (!e) return null;
    const h = JSON.stringify(e.inputs || {});
    if ((!e.res || e.res.h !== h) && EC.mcui && !wcPending.has(e.id)) { wcPending.add(e.id); EC.mcui.ensure(e).then(() => { wcPending.delete(e.id); api.render(); }, () => wcPending.delete(e.id)); }
    if (!e.res || e.res.h !== h) return { pending: true };
    if (e.res.error) return { error: e.res.error };
    const row = (e.res.rows || []).find(x => /comfort/i.test(x.item)), key = n => ((e.res.keys || []).find(k => k[0] === n) || [])[1];
    const other = (e.res.rows || []).filter(x => x !== row && Number.isFinite(x.U) && x.U > 1 + 1e-9).map(x => ({ item: x.item, U: x.U }));
    return { U: row ? row.U : null, st: row ? row.st : '', a: key('a_peak'), Umax: e.res.Umax, other };
  }
  function wcWrite(b, R) {
    const p = api.proj();
    return EC.mcui.loadSheet(WTID).then(doc => {
      const I = {}; (doc.inputs || []).forEach(i => { I[i.n] = i; });
      const u = (n, v) => (I[n] && I[n].u ? ['o', '*', Math.round(v * 1000) / 1000, I[n].u] : v);
      let nNew = 0, nUpd = 0;
      R.wc.forEach(w => {
        const inp = { h_b: u('h_b', w.H), b_w: u('b_w', w.bw), d_w: u('d_w', w.dw), n_st: w.nst, F_meth: 1, n_1u: u('n_1u', w.n1), ID: ['s', `${b.file || 'ETABS building'} - wind ${w.dir}`] };
        if (w.rho) inp['ρ_bld'] = u('ρ_bld', w.rho);
        if (w.Vas) inp.V_as = u('V_as', w.Vas);
        if (w.Mas) inp.M_as = u('M_as', w.Mas);
        const link = { file: b.file || '', table: 'Building checks', story: 'Building', label: 'Wind ' + w.dir, combo: w.wcase, at: Date.now(), cases: [] };
        let e = wcEl(w.dir);
        if (e) { e.inputs = Object.assign(e.inputs || {}, inp); e.etabs = link; e.u = Date.now(); nUpd++; }   // the user's wind data (v_b,0, terrain, damping, limit) are kept
        else {
          e = { id: api.uid(), type: WT, mark: 'WIND-' + w.dir, level: 'Building', grid: 'ETABS building', qty: 1, status: 'In design', start: api.today(), due: api.addDays(api.today(), 14), assignee: p.engineer || '', inputs: inp, etabs: link };
          p.elements.push(e); nNew++;
        }
      });
      api.save(); return { nNew, nUpd };
    });
  }

  /* ---------- page ---------- */
  const okTag = U => U <= 1 + 1e-9 ? '<span class="res ok">✓ OK</span>' : '<span class="res bad">✗ Revise</span>';
  function view() {
    const ic = api.ic, fmt = api.fmt, b = B(), s = b.set, live = EC.etabs.live, L = live.L;
    const head = `<div class="page-head"><div><div class="tool-tag">${ic('upload')}Design with ETABS link</div><h1>Building checks</h1><div class="sub">Global checks of the ETABS model · drift, P-Δ, torsion, base shear &amp; overturning, buckling · EN 1998-1, EN 1992 / 1993</div></div>
      <div class="actions">${b.data ? `<button class="btn no-print" data-print>${ic('print')}Print</button>` : ''}</div></div>`;
    const combos = L.model ? L.model.combos.concat(L.model.cases) : Object.keys(b.roles);
    combos.forEach(c => { if (!b.roles[c]) b.roles[c] = guessRole(c); });
    const chips = `<div class="etabs-combos">${combos.map(c => `<button class="cmb ${{ seis: 'uls', wind: 'sls', uls: 'qp', off: 'off' }[b.roles[c]]}" data-bcrole="${esc(c)}" title="Click: Seismic → Wind SLS → ULS → Not used">${esc(c)}<span>${ROLES[b.roles[c]]}</span></button>`).join('')}</div>`;
    const demoBtn = `<button class="btn" data-bc="demo">${ic('layers')}${b.demo ? 'Reload demo building' : 'Load demo building'}</button>`;
    const conn = !L.st ? `<div class="card etabs-live"><div class="etabs-hero">${ic('upload')}<div><b>Connect to ETABS to read the building</b><small>Storey drifts, storey forces, max/avg displacements, base reactions, modes and buckling factors are read through the ETABS API - or load the demo building to see every check.</small></div><span class="etabs-hbtn">${demoBtn}<button class="btn primary" data-bc="connect">${ic('check')}Connect to ETABS…</button></span></div>
        ${b.data ? `<div class="card-h" style="padding-top:0"><small>${b.demo ? '<b>Demo building</b> - sample ETABS results of a 10-storey RC building, 24 × 18 m · ' : `Showing the last read: ${esc(b.file || '')} · ${new Date(b.at).toLocaleString()} · `}click a combination to change its role</small></div>${chips}` : ''}</div>`
      : `<div class="card etabs-live on"><div class="card-h"><b><i class="dot"></i>${esc(String(L.st.file).split(/[\\/]/).pop())}</b><small>click a combination to change its role · ${b.at ? 'last read ' + new Date(b.at).toLocaleString() : 'not read yet'}</small><span class="etabs-hbtn">${demoBtn}</span></div>
        ${chips}
        ${err ? `<div class="etabs-msg" style="margin:0 16px 12px">${esc(err)}</div>` : ''}
        <div class="etabs-btns" style="padding:0 16px 14px"><button class="btn primary" data-bc="read" ${busy ? 'disabled' : ''}>${ic('download')}${busy ? 'Reading ETABS…' : 'Read building from ETABS'}</button><small class="muted">Seismic: drift, θ, torsion · Wind SLS: wind drift · ULS: base shear &amp; overturning. Put a linear buckling case in the model for αcr.</small></div></div>`;
    const num = (k, l, u, step, hint) => `<label class="bc-in"><span>${l}</span><input class="ctl" type="number" step="${step}" data-bcset="${k}" value="${esc(s[k])}"><small>${u}${hint ? ' · ' + hint : ''}</small></label>`;
    // default parameters (partial factors, NDPs, creep / shrinkage, limits) fold like in the worksheet input panel (docs/CALCULATION_GUIDELINES.md 5)
    const dp = (keys, html) => `<div class="bc-dp">${EC.defParBlock ? EC.defParBlock(`<div class="bc-inputs">${html}</div>`, keys.length, keys.filter(k => String(s[k]) !== String(DEF[k])).length) : `<div class="bc-inputs">${html}</div>`}</div>`;
    const inputs = `<div class="card"><div class="card-h"><b>Design parameters</b><small>yellow = input · kept with the project</small></div><div class="bc-inputs">
      ${num('qd', 'q<sub>d</sub> displacement behaviour factor', '-', '0.1', 'd<sub>s</sub> = q<sub>d</sub>·d<sub>e</sub> (EC8 4.3.4)')}
      ${num('Bx', 'Plan width B<sub>x</sub>', 'm', '0.1', 'overturning about Y')}
      ${num('By', 'Plan width B<sub>y</sub>', 'm', '0.1', 'overturning about X')}

      <label class="bc-in"><span>Quasi-permanent combination (shortening)</span><select class="ctl" data-bcset="qpCombo"><option value="">${'- guess (QP / quasi) -'}</option>${(L.model ? L.model.combos : Object.keys(b.roles)).map(c => `<option ${s.qpCombo === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><small>G + ψ<sub>2</sub>Q, read for the axial shortening</small></label></div>
      ${dp(['nu', 'alpha', 'windLim', 'fos'], `${num('nu', 'ν reduction factor', '-', '0.05', '0.5 class I–II · 0.4 class III–IV')}
<label class="bc-in"><span>α drift limit (EC8 4.4.3.2)</span><select class="ctl" data-bcset="alpha">${[[0.005, '0.005 · brittle non-structural'], [0.0075, '0.0075 · ductile non-structural'], [0.010, '0.010 · no interference']].map(([v, l]) => `<option value="${v}" ${+s.alpha === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small>d<sub>r</sub>·ν ≤ α·h</small></label>
${num('windLim', 'Wind storey drift limit h /', '-', '50', 'SLS, e.g. h/500')}
      ${num('fos', 'Required overturning safety', '-', '0.05', '1.0 with EQU-factored combinations')}`)}</div>`;
    const R = compute(b);
    if (!R) return head + conn + inputs + `<div class="card"><div class="empty">No building data yet - connect to ETABS, give the combinations their role and click <b>Read building from ETABS</b>.<br><br>No ETABS at hand? ${demoBtn}</div></div>`;
    const Umax = xs => xs.reduce((a, x) => Math.max(a, x.U || 0), 0);
    const sumCard = (k, label, U, txt) => `<a class="card bc-sum" href="#bc-${k}"><div class="label">${label}</div><div class="value">${U === null ? '–' : fmt(U, 2)}</div><div class="foot">${U === null ? 'no data for this check' : okTag(U) + ' <span>' + txt + '</span>'}</div></a>`;
    const dU = Umax(R.drift), wU = Umax(R.wind), tU = Umax(R.theta), qU = Umax(R.tors), oU = Umax(R.base.filter(x => Number.isFinite(x.fos)));
    const thMax = R.theta.length ? Math.max(...R.theta.map(x => x.th)) : null, rMax = R.tors.length ? Math.max(...R.tors.map(x => x.ratio)) : null;
    const MC = b.data.mods && b.data.mods.length ? modCheck(b.data.mods, s.kPurpose) : null;
    const sums = `<div class="grid g3 bc-sums">
      ${sumCard('drift', 'Seismic drift', R.drift.length ? dU : null, 'max d<sub>r</sub>ν/h ÷ α')}
      ${sumCard('pdelta', 'P-Δ stability θ', R.theta.length ? tU : null, R.theta.length ? `θ<sub>max</sub> = ${fmt(thMax, 3)} (limit 0.3)` : '')}
      ${sumCard('torsion', 'Torsion Δ<sub>max</sub>/Δ<sub>avg</sub>', R.tors.length ? qU : null, R.tors.length ? `max ratio ${fmt(rMax, 2)} (1.4)` : '')}
      ${sumCard('wind', 'Wind drift', R.wind.length ? wU : null, `drift ÷ h/${s.windLim}`)}
      ${sumCard('base', 'Overturning', R.base.some(x => Number.isFinite(x.fos)) ? oU : null, 'required ÷ provided safety')}
      ${sumCard('modal', 'Modal mass participation', R.modal ? R.modal.U : null, R.modal ? `ΣU<sub>X</sub> ${fmt(R.modal.sum.X * 100, 1)} % · ΣU<sub>Y</sub> ${fmt(R.modal.sum.Y * 100, 1)} % · T<sub>1</sub> ${fmt(R.modal.T1, 2)} s` : '')}
      ${R.soft.length ? sumCard('soft', 'Soft storey k<sub>i</sub>/k<sub>i+1</sub>', Umax(R.soft), (() => { const w = R.soft.filter(r => r.r1 != null).reduce((a, r) => (!a || r.r1 < a.r1 ? r : a), null); return w ? `min ${fmt(w.r1, 2)} at ${esc(w.story)} ${w.dir} (0.7)` : ''; })()) : ''}
      ${R.walls ? sumCard('walls', 'Ductile walls ν<sub>d</sub> / 0.4', Umax(R.walls.W), (() => { const w = R.walls.W.reduce((a, x) => (!a || x.base.Menv > a.base.Menv ? x : a), null); return `${esc(w.name)}: M<sub>Ed</sub> = ${fmt(w.base.Menv, 0)} kN·m, V<sub>Ed</sub> = ${fmt(w.base.VEd, 0)} kN at the base`; })()) : ''}
      ${R.scwb ? sumCard('scwb', 'Strong column / weak beam 1.3ΣM<sub>Rb</sub>/ΣM<sub>Rc</sub>', Umax(R.scwb.rows), (() => { const w = R.scwb.rows.filter(r => !r.exempt).reduce((a, r) => (!a || r.U > a.U ? r : a), null); return w ? `max at ${esc(w.label)} ${esc(w.story)} · ${R.scwb.rows.filter(r => !r.exempt && r.U > 1 + 1e-9).length} joint(s) &gt; 1` : ''; })()) : ''}
      ${R.pound.length ? (() => { const w = R.pound.filter(r => r.req != null).reduce((a, r) => (!a || r.req > a.req ? r : a), null), any = +s.gapX > 0 || +s.gapY > 0; if (!w) return '';
        const txt = `required ${fmt(w.req * 1000, 0)} mm (${w.dir}, ${esc(w.story)})`;
        return any ? sumCard('pound', 'Seismic joint required / provided', Umax(R.pound), txt) : `<a class="card bc-sum" href="#bc-pound"><div class="label">Seismic joint required</div><div class="value">${fmt(w.req * 1000, 0)} <small>mm</small></div><div class="foot"><span>${w.dir} at ${esc(w.story)} · enter the joint width provided</span></div></a>`; })() : ''}
      ${R.diaph ? sumCard('diaph', 'Diaphragm in-plane shear τ/τ<sub>Rd</sub>', Umax(R.diaph.rows), (() => { const w = R.diaph.rows.reduce((a, r) => (!a || r.T > a.T ? r : a), null); return `chord T<sub>max</sub> = ${fmt(w.T, 0)} kN (${esc(w.story)} ${w.dir}) · A<sub>s</sub> = ${fmt(w.As, 0)} mm²`; })()) : ''}
      ${R.short ? sumCard('short', 'Differential shortening Δ/L', Umax(R.short.stacks), (() => { const w = R.short.stacks.reduce((a, k) => (!a || k.tot > a.tot ? k : a), null); return `roof δ<sub>max</sub> = ${fmt(w.tot * 1000, 1)} mm (${esc(w.name)}) · limit L/${R.short.lim}`; })()) : ''}
      ${R.beams ? sumCard('beamcd', `Beams DC${R.beams.H ? 'H' : 'M'} V<sub>Ed,CD</sub>/V<sub>Rd,s</sub>`, Umax(R.beams.rows), `${R.beams.rows.filter(r => r.U > 1 + 1e-9).length} of ${R.beams.rows.length} beams need more links than the ETABS design`) : ''}
      ${R.slab ? sumCard('slabd', 'Slab deflection δ/(span/' + R.slab.L1 + ', /' + R.slab.L2 + ')', Umax(R.slab.rows), (() => { const w = R.slab.rows.reduce((a, r) => (!a || r.U > a.U ? r : a), null); return `δ<sub>LT</sub> ${fmt(w.dLT * 1000, 1)} mm, after partitions ${fmt(w.dInc * 1000, 1)} mm (${esc(w.story)}, bay ${w.bay})`; })()) : ''}
      ${R.staged ? sumCard('staged', 'Staged construction Δ/L', Umax(R.staged.rows), (() => { const w = R.staged.rows.filter(r => r.rN != null).reduce((a, r) => (!a || Math.abs(r.rN - 1) > Math.abs(a.rN - 1) ? r : a), null); return w ? `N staged / one-step ${fmt(w.rN, 2)} at ${esc(w.name)} ${esc(w.story)}` : esc(R.staged.case); })()) : ''}
      ${R.coup ? sumCard('coup', 'Coupling beams V<sub>Ed</sub>/V<sub>Rd,max</sub>', Umax(R.coup.rows), (() => { const n = R.coup.rows.filter(r => r.diag).length, w = R.coup.rows.reduce((a, r) => (!a || r.Asi > a.Asi ? r : a), null); return n ? `${n} need diagonal bars · A<sub>si</sub> max ${fmt(w.Asi * 1e6, 0)} mm² (${esc(w.name)} ${esc(w.story)})` : 'ordinary beam rules everywhere (5.5.3.5(2))'; })()) : ''}
      ${R.cols ? sumCard('cols', `Columns DC${R.cols.H ? 'H' : 'M'} ν<sub>d</sub> / ${fmt(R.cols.nuLim, 2)}`, Umax(R.cols.rows), (() => { const w = R.cols.rows.reduce((a, r) => (!a || Math.max(r.Vx, r.Vy) > Math.max(a.Vx, a.Vy) ? r : a), null); return `V<sub>Ed,CD</sub> max ${fmt(Math.max(w.Vx, w.Vy), 0)} kN (${esc(w.col)} ${esc(w.story)})`; })()) : ''}
      ${R.punch && s.flatSlab ? sumCard('punch', 'Punching v<sub>Ed</sub>/v<sub>Rd,c</sub>', Math.max(...R.punch.rows.map(r => r.U1)), `${R.punch.rows.filter(r => r.U1 > 1 + 1e-9).length} connection(s) need punching reinforcement · v<sub>Rd,max</sub> ${R.punch.rows.some(r => r.U0 > 1 + 1e-9) ? 'exceeded' : 'OK'}`) : ''}
      ${R.steel ? sumCard('steel', 'Steel frame design ratio', Umax(R.steel.rows), `${R.steel.rows.length} members · ${R.steel.rows.filter(r => r.U > 1 + 1e-9).length} over 1.0 · ${R.steel.rows.filter(r => r.err).length} with design errors`) : ''}
      ${R.fdn ? sumCard('fdn', 'Foundation forces γ<sub>Rd</sub>Ω = ' + fmt(R.fdn.k, 2), Umax(R.fdn.list), (() => { const w = R.fdn.list.reduce((a, p) => (!a || p.NmaxAll > a.NmaxAll ? p : a), null); return `N<sub>Fd,max</sub> = ${fmt(w.NmaxAll, 0)} kN (${esc(w.label)}) · ${R.fdn.list.filter(p => p.T > 0).length} support(s) in tension`; })()) : ''}
      ${R.sup.list.length ? sumCard('sup', 'Support uplift F<sub>t,d</sub>/R<sub>t,d</sub>', Umax(R.sup.list), (() => { const w = R.sup.list.reduce((a, p) => (!a || p.min.FZ < a.min.FZ ? p : a), null); return `FZ<sub>min</sub> = ${fmt(w.min.FZ, 0)} kN at ${esc(w.label)}`; })()) : ''}
      ${(() => { const rs = R.wc.map(w => wcResult(wcEl(w.dir))).filter(x => x && x.U != null); return R.wc.length ? sumCard('wcomf', 'Wind comfort a<sub>peak</sub>/a<sub>lim</sub>', rs.length ? Math.max(...rs.map(x => x.U)) : null, rs.length ? `top acceleration ${R.wc.map(w => { const x = wcResult(wcEl(w.dir)); return w.dir + ' ' + (x && x.a ? x.a : '–'); }).join(' · ')}` : '') : ''; })()}
      ${R.acc.cases.some(c => c.U != null) ? sumCard('acc', 'Accidental eccentricity 0.05 / e', Umax(R.acc.cases), R.acc.cases.map(c => `${esc(c.case)} ${c.ecc != null ? fmt(c.ecc, 3) : '–'}`).join(' · ')) : ''}
      ${R.plan.length ? sumCard('plan', 'Torsional radius e<sub>0</sub>/0.3r · l<sub>s</sub>/r', Umax(R.plan), `r<sub>x</sub>/l<sub>s</sub> = ${fmt(R.planModes.rho.X, 2)} · r<sub>y</sub>/l<sub>s</sub> = ${fmt(R.planModes.rho.Y, 2)} (≥ 1)`) : ''}
      ${R.mass.length ? sumCard('mass', 'Mass irregularity m<sub>i</sub>/m<sub>adj</sub>', Umax(R.mass), (() => { const w = R.mass.reduce((a, r) => (r.ratio != null && (!a || r.ratio > a.ratio) ? r : a), null); return w ? `max ${fmt(w.ratio, 2)} at ${esc(w.story)} (1.5)` : ''; })()) : ''}
      ${R.weak.length ? sumCard('weak', 'Weak storey V<sub>Rd,i</sub>/V<sub>Rd,i+1</sub>', Umax(R.weak), (() => { const w = R.weak.filter(r => r.r1 != null).reduce((a, r) => (!a || r.r1 < a.r1 ? r : a), null); return w ? `min ${fmt(w.r1, 2)} at ${esc(w.story)} ${w.dir} (0.8)` : ''; })()) : ''}
      ${R.bs ? `<a class="card bc-sum" href="#bc-bshear"><div class="label">Base shear V<sub>RS</sub> / F<sub>b</sub></div><div class="value">${R.bs.map(r => (r.ratio != null ? fmt(r.ratio, 2) : '–')).join(' · ')} <small>X · Y</small></div><div class="foot">${R.bs.every(r => r.ratio == null || r.ratio >= 0.8) ? '<span class="res ok">✓ OK</span>' : '<span class="res bad">! Check</span>'} <span>T<sub>1</sub> ${R.bs.map(r => fmt(r.T1, 2)).join(' / ')} s vs C<sub>t</sub>H<sup>¾</sup> ${fmt(R.bs[0].Tct, 2)} s</span></div></a>` : ''}
      ${MC ? `<a class="card bc-sum" href="#bc-mods"><div class="label">Stiffness modifiers</div><div class="value">${MC.filter(r => r.st === 'bad').length} <small>of ${MC.length} properties flagged</small></div><div class="foot">${MC.some(r => r.st === 'bad') ? '<span class="res bad">✗ Revise</span>' : MC.some(r => r.st === 'warn') ? '<span class="res ok">✓ OK</span> <span>with notes</span>' : '<span class="res ok">✓ OK</span>'} <span>${PURPOSE[s.kPurpose][0].split(' (')[0]}</span></div></a>` : ''}
      ${sumCard('buckling', 'Global buckling α<sub>cr</sub>', R.acr ? R.acr.U : null, R.acr ? `α<sub>cr</sub> = ${fmt(R.acr.a, 2)}${R.acr.a >= 10 ? ' ≥ 10: 1st order' : R.acr.a >= 3 ? ` · sway × ${fmt(R.acr.k, 3)}` : ' < 3'}` : '')}</div>`;
    const ser = (rows, key) => ['X', 'Y'].map((d, i) => ({ n: 'Direction ' + d, c: i ? '--s2' : '--s1', pts: rows.filter(r => r.dir === d).map(r => ({ story: r.story, z: r.z, v: r[key] })) })).filter(x => x.pts.length);
    const card = (k, title, ref, sub, body) => `<section class="card bc-card" id="bc-${k}"><div class="card-h"><b>${title}</b><small>${ref}${sub ? ' · ' + sub : ''}</small></div>${body}</section>`;
    const tbl = (cols, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c[2] || ''}">${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const top = xs => xs.slice().sort((a, c) => c.z - a.z || a.dir.localeCompare(c.dir));
    let html = head + conn + sums;
    html += card('drift', 'Inter-storey drift (seismic)', 'EN 1998-1 4.4.3.2', `d<sub>r</sub> = q<sub>d</sub>·d<sub>e</sub> = ${fmt(s.qd, 2)}·d<sub>e</sub> · d<sub>r</sub>·ν ≤ α·h, α = ${s.alpha}, ν = ${s.nu}`,
      R.drift.length ? `<div class="bc-split">${profile(ser(R.drift, 'v'), { title: 'Seismic drift ratio by storey', xlabel: 'd_r·ν / h', limit: +s.alpha, fmt: v => fmt(v, 4) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Governing combination', r => `<small>${esc(r.combo)}</small>`], ['d<sub>e</sub>/h', r => fmt(r.de, 5), 'num'], ['d<sub>r</sub>/h', r => fmt(r.dr, 5), 'num'], ['d<sub>r</sub>ν/h', r => fmt(r.v, 5), 'num'], ['U', r => api.ubar(r.U)]], top(R.drift))}</div>`
        : '<p class="muted bc-pad">No seismic drift - mark the seismic combinations (response spectrum / G+ψ2Q+E) as Seismic.</p>');
    html += card('pdelta', 'P-Δ: second-order effects', 'EN 1998-1 4.4.2.2(2)–(4)', 'θ = P<sub>tot</sub>·d<sub>r</sub> / (V<sub>tot</sub>·h) · θ ≤ 0.1 neglect · ≤ 0.2 × 1/(1−θ) · ≤ 0.3',
      R.theta.length ? `<div class="bc-split">${profile(ser(R.theta, 'th'), { title: 'Stability coefficient θ by storey', xlabel: 'θ', limit: 0.1, fmt: v => fmt(v, 3) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['P<sub>tot</sub> kN', r => fmt(r.P, 0), 'num'], ['V<sub>tot</sub> kN', r => fmt(r.V, 0), 'num'], ['d<sub>r</sub> mm', r => fmt(r.dr * r.h * 1000, 1), 'num'], ['θ', r => fmt(r.th, 3), 'num'], ['Design', r => `<small>${esc(r.note)}</small>`], ['U', r => api.ubar(r.U)]], top(R.theta))}</div>`
        : '<p class="muted bc-pad">Needs the seismic storey forces (P, V) - the G+ψ2Q+E combinations must be marked Seismic.</p>');
    html += card('torsion', 'Torsion of the building', 'Δ<sub>max</sub>/Δ<sub>avg</sub> per storey (ASCE 7 Table 12.3-1 limits 1.2 / 1.4; EC8 4.2.3.2 regularity indicator)', '',
      R.tors.length ? `<div class="bc-split">${profile(ser(R.tors, 'ratio'), { title: 'Max over average displacement', xlabel: 'Δmax / Δavg', limit: 1.2, fmt: v => fmt(v, 2) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Combination', r => `<small>${esc(r.combo)}</small>`], ['Δ<sub>max</sub>/Δ<sub>avg</sub>', r => fmt(r.ratio, 3), 'num'], ['Class', r => esc(r.cls)], ['U', r => api.ubar(r.U)]], top(R.tors))}</div>
        <p class="muted bc-pad">Ratio > 1.2: torsionally irregular - use a spatial model and accidental eccentricity (EC8 4.3.2), check the perimeter members for the torsional drift; > 1.4: add stiffness at the perimeter (walls / bracing).</p>`
        : '<p class="muted bc-pad">ETABS returned no “Story Max Over Avg Displacements” table for the seismic / wind combinations (needs rigid or semi-rigid diaphragms).</p>');
    html += card('wind', 'Wind drift (SLS)', 'EN 1990 A1.4 · storey drift ≤ h/' + s.windLim, '',
      R.wind.length ? `<div class="bc-split">${profile(ser(R.wind, 'v'), { title: 'Wind drift ratio by storey', xlabel: 'drift / h', limit: 1 / s.windLim, fmt: v => fmt(v, 5) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Combination', r => `<small>${esc(r.combo)}</small>`], ['drift/h', r => fmt(r.v, 5), 'num'], ['h/drift', r => r.v > 0 ? fmt(1 / r.v, 0) : '–', 'num'], ['U', r => api.ubar(r.U)]], top(R.wind))}</div>`
        : '<p class="muted bc-pad">No wind SLS combination marked.</p>');
    html += card('base', 'Base shear, storey shear and overturning moment', 'EN 1990 6.4.1 EQU', `stabilising W·B/2 ÷ overturning M ≥ ${s.fos} · B<sub>x</sub> = ${s.Bx} m, B<sub>y</sub> = ${s.By} m`,
      `<div class="bc-split two">${profile([{ n: 'V_X', c: '--s1', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.VX })) }, { n: 'V_Y', c: '--s2', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.VY })) }].filter(x => x.pts.some(p => p.v > 0)), { title: 'Storey shear', xlabel: 'storey shear kN', unit: 'kN', fmt: v => fmt(v, 0) })}
        ${profile([{ n: 'M about Y (from X)', c: '--s1', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.MY })) }, { n: 'M about X (from Y)', c: '--s2', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.MX })) }].filter(x => x.pts.some(p => p.v > 0)), { title: 'Overturning moment', xlabel: 'overturning moment kN·m', unit: 'kN·m', fmt: v => fmt(v, 0) })}</div>
      ${tbl([['Combination', r => `<small>${esc(r.combo)}</small>`], ['Role', r => ROLES[r.role]], ['V<sub>x</sub> kN', r => fmt(r.Vx, 0), 'num'], ['V<sub>y</sub> kN', r => fmt(r.Vy, 0), 'num'], ['W kN', r => fmt(r.W, 0) + (r.Wfrom ? ` <small class="muted">${r.Wfrom}</small>` : ''), 'num'], ['V<sub>x</sub>/W', r => fmt(r.cx, 3), 'num'], ['V<sub>y</sub>/W', r => fmt(r.cy, 3), 'num'], ['M<sub>x</sub> kN·m', r => fmt(r.Mx, 0), 'num'], ['M<sub>y</sub> kN·m', r => fmt(r.My, 0), 'num'], ['Safety', r => Number.isFinite(r.fos) ? fmt(r.fos, 2) : '–', 'num'], ['U', r => Number.isFinite(r.fos) ? api.ubar(r.U) : '']], R.base)}
      <p class="muted bc-pad">Profiles: envelope of the seismic and wind combinations. The overturning check is the rigid-body check of the whole building on its base; the foundation bearing and uplift are checked with the footing / pile elements.</p>`);
    html += card('buckling', 'Global buckling and sway', 'EN 1993-1-1 5.2.1(3), 5.2.2(5)B · EN 1992-1-1 5.8.2(6)', 'α<sub>cr</sub> = lowest positive buckling factor',
      R.buck.length ? `${tbl([['Case', r => esc(r.case)], ['Mode', r => r.mode, 'num'], ['α<sub>cr</sub>', r => fmt(r.factor, 2), 'num'], ['Sway amplification 1/(1−1/α<sub>cr</sub>)', r => r.factor > 1 ? fmt(1 / (1 - 1 / r.factor), 3) : '∞', 'num']], R.buck.slice(0, 12))}
        <div class="bc-verdict ${R.acr.a >= 3 ? 'ok' : 'bad'}">α<sub>cr</sub> = <b>${fmt(R.acr.a, 2)}</b> → ${esc(R.acr.note)}${R.acr.a < 10 && R.acr.a >= 3 ? '. The P-Δ design: increase the horizontal loads (wind, notional, seismic) by this factor, or run ETABS with P-Delta on.' : ''}</div>`
        : '<p class="muted bc-pad">No buckling factors - add a linear buckling load case in ETABS (initial P-Delta from the ULS gravity combination), run it and read again.</p>');
    if (R.modal) {
      const M = R.modal, pc = v => fmt(v * 100, 1) + ' %';
      const verdict = ['X', 'Y'].map(dir => M.sum[dir] >= 0.9 ? `${dir}: Σ = ${pc(M.sum[dir])} ≥ 90 % ✓` : M.alt ? `${dir}: Σ = ${pc(M.sum[dir])} < 90 %, but k = ${M.md.length} ≥ 3√n = ${M.kMin} and T<sub>k</sub> = ${fmt(M.md[M.md.length - 1].T, 3)} s ≤ 0.20 s (4.3.3.3.1(5)) ✓` : `${dir}: Σ = ${pc(M.sum[dir])} < 90 % ✗ - add modes (Ritz vectors) until ≥ 90 %`).join('<br>');
      const notes = [];
      ['X', 'Y'].forEach(dir => { if (M.tail[dir]) notes.push(`the last mode still carries > 5 % in ${dir}: ask for more modes so every mode with > 5 % is included (4.3.3.3.1(3))`); });
      if (M.torsFirst) notes.push('the first mode is torsional: the building is torsionally flexible - check r ≥ l<sub>s</sub> (EN 1998-1 4.2.3.2(6)) and the behaviour factor of torsionally flexible systems (5.2.2.1(4)), or add stiffness at the perimeter');
      html += card('modal', 'Modal analysis: periods and mass participation', 'EN 1998-1 4.3.3.3.1', `sum of effective modal masses ≥ 90 % in each direction, all modes with > 5 % included · n = ${M.n} storeys`,
        `<div class="bc-split">${cumChart(M.md)}
          ${tbl([['Mode', r => r.mode, 'num'], ['T s', r => fmt(r.T, 3), 'num'], ['f Hz', r => r.T > 0 ? fmt(1 / r.T, 2) : '–', 'num'], ['U<sub>X</sub>', r => pc(r.Ux), 'num'], ['U<sub>Y</sub>', r => pc(r.Uy), 'num'], ['R<sub>Z</sub>', r => pc(r.Rz), 'num'], ['ΣU<sub>X</sub>', r => pc(r.SumUx), 'num'], ['ΣU<sub>Y</sub>', r => pc(r.SumUy), 'num'], ['Dominant', r => esc(M.dom(r))]], M.md.slice(0, 30))}</div>
        <div class="bc-verdict ${M.U <= 1 + 1e-9 ? 'ok' : 'bad'}">${verdict}</div>${notes.length ? `<p class="muted bc-pad">Note: ${notes.join('; ')}.</p>` : ''}`);
    }
    if (R.soft.length) {
      const bad = R.soft.filter(r => r.cls !== 'Regular' && r.cls !== 'top storey');
      html += card('soft', 'Soft storey: lateral stiffness by storey', 'EN 1998-1 4.2.3.3(3)', 'k<sub>i</sub> = V<sub>i</sub>/(d<sub>r,i</sub>·h<sub>i</sub>) · soft if k<sub>i</sub> &lt; 0.7·k<sub>i+1</sub> or &lt; 0.8·mean of the 3 storeys above; extreme &lt; 0.6 / 0.7 (limits of ASCE 7 Table 12.3-2)',
        `<div class="bc-split">${profile(ser(R.soft.filter(r => r.k), 'k'), { title: 'Storey stiffness', xlabel: 'storey stiffness kN/m', unit: 'kN/m', fmt: v => fmt(v, 0) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['V<sub>i</sub> kN', r => fmt(r.V, 0), 'num'], ['d<sub>r</sub> mm', r => fmt(r.d * 1000, 2), 'num'], ['k<sub>i</sub> kN/m', r => r.k ? fmt(r.k, 0) : '–', 'num'], ['k<sub>i</sub>/k<sub>i+1</sub>', r => r.r1 != null ? fmt(r.r1, 2) : '–', 'num'], ['k<sub>i</sub>/k̄<sub>3 above</sub>', r => r.r3 != null ? fmt(r.r3, 2) : '–', 'num'], ['Class', r => esc(r.cls)], ['U', r => r.r1 != null ? api.ubar(r.U) : '']], top(R.soft))}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.map(r => `${esc(r.story)} ${r.dir}: ${esc(r.cls).toLowerCase()} (k<sub>i</sub>/k<sub>i+1</sub> = ${fmt(r.r1, 2)})`).join(' · ')} → the building is not regular in elevation (EN 1998-1 4.2.3.1): use the modal response spectrum analysis (Table 4.1) and reduce q<sub>0</sub> by 20 % (5.2.2.2(3)); better, stiffen the soft storey.` : 'Stiffness constant or reducing gradually upwards in X and Y: regular in elevation for the stiffness criterion (EN 1998-1 4.2.3.3(3)).'}</div>
        <p class="muted bc-pad">k<sub>i</sub> from the seismic case with the largest base shear in each direction (storey shear and storey drift of the same case). EN 1998-1 gives the criterion without numbers; the ASCE 7 limits are a common quantification.</p>`);
    }
    if (R.walls) {
      const WW = R.walls, g = WW.W.reduce((a, x) => (!a || x.base.Menv > a.base.Menv ? x : a), null), bad = WW.W.filter(x => x.U > 1 + 1e-9);
      html += card('walls', 'Ductile walls: design envelope from the ETABS piers', 'EN 1998-1 5.4.2.4(5), (7) · 5.4.3.4.1(2) · 5.4.3.4.2(1) · EN 1992-1-1 9.2.1.3(2)', `moment envelope shifted by a<sub>1</sub> = 0.4·l<sub>w</sub> and linear from the base (h<sub>w</sub>/l<sub>w</sub> &gt; 2) · V<sub>Ed</sub> = ε·V'<sub>Ed</sub>, ε = ${fmt(WW.eps, 2)} · ν<sub>d</sub> ≤ ${fmt(WW.nuL, 2)}`,
        `${dp(['epsV', 'nuLim'], `${num('epsV', 'ε shear magnification', '-', '0.05', 'DCM 1.5 (5.4.2.4(7)); DCH eq. 5.25')}${num('nuLim', 'ν<sub>d</sub> limit', '-', '0.05', 'DCM 0.4 (5.4.3.4.1(2)), DCH 0.35')}`)}
        <div class="bc-split">${profile([{ n: g.name + ' analysis M', c: '--s1', pts: g.prof.map(r => ({ story: r.story, z: r.z, v: r.Man })) }, { n: g.name + ' design envelope', c: '--s2', pts: g.prof.map(r => ({ story: r.story, z: r.z, v: r.Menv })) }], { title: 'Wall moment: analysis and design envelope', xlabel: 'M kN·m (storey bottom)', unit: 'kN·m', fmt: v => fmt(v, 0) })}
        ${tbl([['Wall', x => esc(x.name)], ['l<sub>w</sub> × t m', x => `<span style="white-space:nowrap">${fmt(x.lw, 2)} × ${fmt(x.t, 2)}</span>`, 'num'], ['h<sub>w</sub>/l<sub>w</sub>', x => fmt(x.hw / x.lw, 1), 'num'], ['h<sub>cr</sub> m', x => fmt(x.hcr, 2), 'num'], ['a<sub>1</sub> m', x => fmt(x.a1, 2), 'num'], ['M<sub>Ed</sub> base kN·m', x => fmt(x.base.Menv, 0), 'num'], ["V'<sub>Ed</sub> kN", x => fmt(x.base.Van, 0), 'num'], ['V<sub>Ed</sub> = εV\' kN', x => fmt(x.base.VEd, 0), 'num'], ['ν<sub>d</sub> max', x => fmt(x.nuMax, 3), 'num'], ['U', x => api.ubar(x.U)]], WW.W)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `ν<sub>d</sub> &gt; ${fmt(WW.nuL, 2)} in ${bad.map(x => esc(x.name)).join(', ')} → thicker or longer wall, or higher f<sub>ck</sub> (5.4.3.4.1(2)).` : `ν<sub>d</sub> ≤ ${fmt(WW.nuL, 2)} in every wall.`} Design the walls for the envelope: in ${esc(g.name)} M<sub>Ed</sub> rises from ${fmt(g.prof[Math.min(3, g.prof.length - 1)].Man, 0)} (analysis) to ${fmt(g.prof[Math.min(3, g.prof.length - 1)].Menv, 0)} kN·m at ${esc(g.prof[Math.min(3, g.prof.length - 1)].story)}; boundary elements and confinement over h<sub>cr</sub> = ${fmt(g.hcr, 2)} m (5.4.3.4.2).</div>
        <p class="muted bc-pad">Pier forces from ETABS at the bottom of each storey, enveloped over the seismic and ULS combinations. The envelope is the larger of the analysis moment shifted up by a<sub>1</sub> and the straight line from M<sub>Ed,base</sub> (Fig. 5.3) for slender walls. DCH: ε from eq. 5.25 with γ<sub>Rd</sub>·M<sub>Rd</sub>/M<sub>Ed</sub> and S<sub>e</sub>(T<sub>C</sub>)/S<sub>e</sub>(T<sub>1</sub>) - enter it above.</p>`);
    }
    if (!R.scwb && b.data.jointsErr) html += card('scwb', 'Strong column / weak beam: capacity design of the joints', 'EN 1998-1 4.4.2.3(4)', '', `<p class="muted bc-pad">${esc(b.data.jointsErr)}. Then read the building again.</p>`);
    if (R.scwb) {
      const J = R.scwb, act = J.rows.filter(r => !r.exempt), bad = act.filter(r => r.U > 1 + 1e-9), crit = act.slice().sort((a, c) => c.U - a.U).slice(0, 12), jsBad = act.filter(r => r.jsU > 1 + 1e-9);
      const byStory = [...new Set(bad.map(r => r.story))];
      html += card('scwb', 'Strong column / weak beam: capacity design of the joints', 'EN 1998-1 4.4.2.3(4) eq. 4.29 · 5.2.3.3(2)', `ΣM<sub>Rc</sub> ≥ 1.3·ΣM<sub>Rb</sub> at every beam-column joint → ratio 1.3·ΣM<sub>Rb</sub>/ΣM<sub>Rc</sub> ≤ 1 from the ETABS concrete frame design · ${act.length} joints · top storey (${esc(J.top)}) exempt`,
        `<div class="bc-split">${profile([{ n: 'major axis', c: '--s1', pts: J.prof.filter(p => !p.exempt).map(p => ({ story: p.story, z: p.z, v: p.maj })) }, { n: 'minor axis', c: '--s2', pts: J.prof.filter(p => !p.exempt).map(p => ({ story: p.story, z: p.z, v: p.min })) }], { title: 'Largest beam/column capacity ratio per storey', xlabel: '1.3·ΣM_Rb / ΣM_Rc', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Column', r => esc(r.label)], ['Storey', r => esc(r.story)], ['Major', r => `${fmt(+r.bc, 2)} <small class="muted">${esc(r.bcCase || '')}</small>`, 'num'], ['Minor', r => `${fmt(+r.bcm, 2)} <small class="muted">${esc(r.bcmCase || '')}</small>`, 'num'], ['Joint shear', r => fmt(r.jsU, 2), 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.length} joint(s) with 1.3·ΣM<sub>Rb</sub> &gt; ΣM<sub>Rc</sub> (${byStory.slice(0, 6).map(esc).join(', ')}${byStory.length > 6 ? ', …' : ''}): a storey mechanism (soft storey) can form - increase the column section or longitudinal reinforcement (ΣM<sub>Rc</sub>), or reduce the beam top / bottom reinforcement beyond what is required (ΣM<sub>Rb</sub>), and design the ETABS frame again.` : 'ΣM<sub>Rc</sub> ≥ 1.3·ΣM<sub>Rb</sub> at every joint below the top storey: beam-sway mechanism (EN 1998-1 4.4.2.3(4)).'}${jsBad.length ? ` Joint shear ratio &gt; 1 at ${jsBad.length} joint(s) - enlarge the joint (column) or the concrete grade (5.5.3.3).` : ''}</div>
        <p class="muted bc-pad">Ratios as reported by ETABS (Design → Concrete Frame Design, Eurocode 2 with Eurocode 8): M<sub>Rc</sub> of the columns with the axial force of the seismic combination, M<sub>Rb</sub> of the beams with the reinforcement provided by the design. The rule is for frame and frame-equivalent dual buildings in DCM / DCH (4.4.2.3(4)); wall and wall-equivalent dual systems are not covered by it. The top storey of a multi-storey building is exempt (EN 1998-1 4.4.2.3). The 12 largest ratios are listed.</p>`);
    }
    if (R.pound.length) {
      const P = R.pound.filter(r => r.req != null), bad = P.filter(r => r.U > 1 + 1e-9), mm0 = v => fmt(v * 1000, 0);
      const req = dd => P.filter(r => r.dir === dd).reduce((a, r) => Math.max(a, r.req), 0);
      const chk = (k, l, hint) => `<label class="bc-in"><span>${l}</span><input type="checkbox" data-bcset="${k}" ${s[k] ? 'checked' : ''} style="width:20px;height:20px"><small>${hint}</small></label>`;
      html += card('pound', 'Seismic joint: pounding between adjacent units', 'EN 1998-1 4.4.2.7 · 4.3.4', `gap ≥ √(d<sub>s,1</sub>² + d<sub>s,2</sub>²) at every level · d<sub>s</sub> = q<sub>d</sub>·d<sub>e</sub> = ${fmt(+s.qd, 2)}·d<sub>e</sub>${s.sameLev && (+s.adjX > 0 || +s.adjY > 0) ? ' · × 0.7, same floor levels (4.4.2.7(3))' : ''}`,
        `<div class="bc-inputs">${num('gapX', 'Joint width provided, X side', 'mm', '5', 'gap normal to X')}${num('gapY', 'Joint width provided, Y side', 'mm', '5', 'gap normal to Y')}${num('adjX', 'Adjacent unit: top d<sub>s</sub> in X', 'mm', '5', '0 = property line / not known')}${num('adjY', 'Adjacent unit: top d<sub>s</sub> in Y', 'mm', '5', '0 = property line / not known')}${num('adjH', 'Adjacent unit height', 'm', '0.5', '0 = same as this building')}${chk('sameLev', 'Same floor levels', '× 0.7 between two units (4.4.2.7(3))')}</div>
        <div class="bc-split">${profile(['X', 'Y'].map((dd, i) => ({ n: 'required gap ' + dd, c: i ? '--s2' : '--s1', pts: P.filter(r => r.dir === dd).map(r => ({ story: r.story, z: r.z, v: r.req * 1000 })) })).filter(x => x.pts.length).concat(['X', 'Y'].map((dd, i) => ({ n: 'd_s own ' + dd, c: i ? '--s4' : '--s3', pts: R.pound.filter(r => r.dir === dd).map(r => ({ story: r.story, z: r.z, v: r.ds * 1000 })) }))), { title: 'Required seismic joint by height', xlabel: 'mm', unit: 'mm', limit: (gs => (gs.length ? Math.min(...gs) : 0))([+s.gapX, +s.gapY].filter(v => v > 0)), fmt: v => fmt(v, 0) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['d<sub>e</sub> mm', r => `${fmt(r.de * 1000, 1)} <small class="muted">${esc(r.from)}</small>`, 'num'], ['d<sub>s</sub> own mm', r => fmt(r.ds * 1000, 1), 'num'], ['d<sub>s</sub> adjacent mm', r => (r.dadj != null ? fmt(r.dadj * 1000, 1) : '–'), 'num'], ['Required mm', r => (r.req != null ? fmt(r.req * 1000, 1) : '–'), 'num'], ['Provided mm', r => (r.gap > 0 ? fmt(r.gap * 1000, 0) : '–'), 'num'], ['U', r => (r.gap > 0 && r.req != null ? api.ubar(r.U) : '')]], top(R.pound))}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">Required joint: X ${mm0(req('X'))} mm, Y ${mm0(req('Y'))} mm${s.sameLev && (+s.adjX > 0 || +s.adjY > 0) ? ' (× 0.7, same floor levels)' : ''}. ${(() => { const miss = ['X', 'Y'].filter(dd => P.some(r => r.dir === dd) && !(+s['gap' + dd] > 0)); return miss.length && (+s.gapX > 0 || +s.gapY > 0) ? `No joint width entered for ${miss.join(', ')}. ` : ''; })()}${bad.length ? `The joint provided is too narrow at ${[...new Set(bad.map(r => r.dir + ' ' + r.story))].slice(0, 6).join(', ')} → widen the joint, stiffen the building or tie the units into one (then check them as one structure).` : +s.gapX > 0 || +s.gapY > 0 ? `The joint${[+s.gapX, +s.gapY].filter(v => v > 0).length > 1 ? 's' : ''} provided ${[+s.gapX, +s.gapY].filter(v => v > 0).length > 1 ? 'are' : 'is'} wide enough at every level (${['X', 'Y'].filter(dd => +s['gap' + dd] > 0).join(', ')}).` : 'Enter the joint widths provided to check them.'}${!(+s.adjX > 0 || +s.adjY > 0) ? ' Adjacent unit not given: the required gap is this building’s own d<sub>s</sub> (towards a property line; add the neighbour’s displacement when it is known - 4.4.2.7(2) needs both).' : ''}</div>
        <p class="muted bc-pad">d<sub>e</sub> = the largest corner displacement of the seismic cases from the ETABS “Story Max Over Avg Displacements” table (torsion included), or the storey drifts summed up the height when that table is missing. The adjacent unit is taken as displacing linearly up to its height. Where the floors of the two units are at different levels, columns of one unit can be hit at mid-height - avoid it or check those columns for the impact.</p>`);
    }
    if (R.diaph) {
      const D = R.diaph, bad = D.rows.filter(r => r.U > 1 + 1e-9), wT = D.rows.reduce((a, r) => (!a || r.T > a.T ? r : a), null), wv = D.rows.reduce((a, r) => (!a || r.v > a.v ? r : a), null);
      html += card('diaph', 'Diaphragms: in-plane forces, chords and collectors', 'EN 1998-1 4.4.2.5 · EN 1992-1-1 6.2.2(6), 6.2.3(3)', `F<sub>i</sub> × γ<sub>d</sub> (${fmt(+s.gdB, 2)} shear, ${fmt(+s.gdD, 2)} chords) · deep beam between the lateral systems: M = F·L/8, T = M/(0.9·D), v = F/(2·D) · slab t = ${fmt(D.t * 1000, 0)} mm (${esc(D.tFrom)}), f<sub>ck</sub> = ${fmt(D.fck, 0)} MPa`,
        `<div class="bc-inputs">${num('slabT', 'Slab thickness t', 'm', '0.01', '0 = thinnest ETABS floor slab')}${num('slabFck', 'Slab f<sub>ck</sub>', 'MPa', '1', '0 = from ETABS')}${num('fyk', 'f<sub>yk</sub> reinforcement', 'MPa', '10', 'f<sub>yd</sub> = f<sub>yk</sub>/1.15')}</div>${dp(['gdB', 'gdD'], `${num('gdB', 'γ<sub>d</sub> brittle (shear)', '-', '0.05', '4.4.2.5(2): 1.3')}${num('gdD', 'γ<sub>d</sub> ductile (chords)', '-', '0.05', '4.4.2.5(2): 1.1')}`)}
        <div class="bc-split">${profile(['X', 'Y'].map((dd, i) => ({ n: 'chord T ' + dd, c: i ? '--s2' : '--s1', pts: D.rows.filter(r => r.dir === dd).map(r => ({ story: r.story, z: r.z, v: r.T })) })).filter(x => x.pts.length), { title: 'Chord force by floor', xlabel: 'chord force kN', unit: 'kN', fmt: v => fmt(v, 0) })}
        ${tbl([['Floor', r => esc(r.story)], ['Dir.', r => r.dir], ['F<sub>i</sub> kN', r => fmt(r.F, 0), 'num'], ['L × D m', r => `<span style="white-space:nowrap">${fmt(r.L, 1)} × ${fmt(r.D, 1)}</span>`, 'num'], ['M<sub>d</sub> kN·m', r => fmt(r.M, 0), 'num'], ['Chord T kN', r => fmt(r.T, 0), 'num'], ['A<sub>s,chord</sub> mm²', r => fmt(r.As, 0), 'num'], ['v kN/m', r => fmt(r.v, 1), 'num'], ['a<sub>s</sub> mm²/m', r => fmt(r.as, 0), 'num'], ['τ MPa', r => fmt(r.tau, 3), 'num'], ['U', r => api.ubar(r.U)]], top(D.rows))}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `In-plane shear above the strut resistance 0.5·ν·f<sub>cd</sub> = ${fmt(D.tRd, 2)} MPa at ${bad.map(r => esc(r.story) + ' ' + r.dir).join(', ')} → thicker slab or higher f<sub>ck</sub> near the walls.` : `In-plane shear τ ≤ 0.5·ν·f<sub>cd</sub> = ${fmt(D.tRd, 2)} MPa on every floor.`} Chords: the largest T = ${fmt(wT.T, 0)} kN (${esc(wT.story)} ${wT.dir}) needs A<sub>s</sub> = ${fmt(wT.As, 0)} mm² along the two slab edges parallel to the action - the flanges of the deep beam (continuous, lapped for f<sub>yd</sub>). Collectors and edge shear: v = ${fmt(wv.v, 1)} kN/m → a<sub>s</sub> = ${fmt(wv.as, 0)} mm²/m each way near the walls / frames; drag the force into each wall with ties of A<sub>s</sub> = v·l<sub>connected</sub>/f<sub>yd</sub>.</div>
        <p class="muted bc-pad">Simplified: one span between the lateral systems at the plan edges, uniform floor force; openings, re-entrant corners and transfer forces (a podium, a wall that stops) need a model of the diaphragm (semi-rigid shells or strut-and-tie). For response-spectrum results F<sub>i</sub> comes from the SRSS/CQC storey shears (approximate). EN 1998-1 5.10 adds the concrete diaphragm rules for DCH.</p>`);
    }
    if (R.short) {
      const K = R.short.stacks, seen = new Set(), gov = K.filter(k => k.U != null).sort((a, c) => c.U - a.U).filter(k => { const key = [k.name, k.nb].sort().join('|'); if (seen.has(key)) return false; seen.add(key); return true; }), top12 = gov.slice(0, 12), bad = gov.filter(k => k.U > 1 + 1e-9);
      const mx = K.reduce((a, k) => (!a || k.tot > a.tot ? k : a), null), mn = K.reduce((a, k) => (!a || k.tot < a.tot ? k : a), null), mm = v => fmt(v * 1000, 1);
      html += card('short', 'Axial shortening of columns and walls', 'EN 1992-1-1 3.1.4 · Table 3.1', `δ = Σ (N/(E<sub>cm</sub>A) + φ·σ<sub>c</sub>/(1.05E<sub>cm</sub>) + ε<sub>cs</sub>)·h · differential between neighbouring stacks after the floor is cast ≤ L/${R.short.lim} · combination ${esc(R.short.combo)}`,
        `${dp(['phi', 'ecs', 'shortLim'], `${num('phi', 'φ(∞,t<sub>0</sub>) creep coefficient', '-', '0.1', 'EN 1992-1-1 Fig. 3.1, typically 1.5–2.5')}${num('ecs', 'ε<sub>cs</sub> shrinkage strain', '-', '0.0001', '3.1.4(6), typically 0.0003–0.0005')}${num('shortLim', 'Slab tilt limit L /', '-', '50', 'differential between neighbours')}`)}
        <div class="bc-split">${profile([{ n: 'δ total ' + mx.name, c: '--s1', pts: mx.prof.map(p => ({ story: p.story, z: p.z, v: p.tot * 1000 })) }, { n: 'δ total ' + mn.name, c: '--s2', pts: mn.prof.map(p => ({ story: p.story, z: p.z, v: p.tot * 1000 })) }].concat(gov[0] ? [{ n: 'after casting ' + gov[0].name, c: '--s3', pts: gov[0].prof.map(p => ({ story: p.story, z: p.z, v: p.post * 1000 })) }] : []), { title: 'Axial shortening by height', xlabel: 'shortening mm', unit: 'mm', fmt: v => fmt(v, 1) })}
        ${tbl([['Stack', k => esc(k.name)], ['Kind', k => k.kind], ['σ<sub>c</sub> base MPa', k => fmt(k.sig0, 1), 'num'], ['δ roof mm <small>el + creep + sh</small>', k => `${mm(k.tot)} <small class="muted">${mm(k.el)} + ${mm(k.cr)} + ${mm(k.sh)}</small>`, 'num'], ['vs', k => esc(k.nb), ''], ['L m', k => fmt(k.L, 2), 'num'], ['Δ mm', k => `${mm(k.diff)} <small class="muted">${esc(k.at)}</small>`, 'num'], ['Δ/L', k => (k.tilt > 0 ? '1/' + fmt(1 / k.tilt, 0) : '–'), 'num'], ['U', k => api.ubar(k.U)]], top12)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `Differential shortening above L/${R.short.lim} at ${bad.slice(0, 6).map(k => `${esc(k.name)}–${esc(k.nb)} (1/${fmt(1 / k.tilt, 0)} at ${esc(k.at)})`).join(', ')}${bad.length > 6 ? ', …' : ''} → set the columns long (pre-camber the formwork by the predicted difference), lower the column stress σ<sub>c</sub> or check the slabs and partitions for the imposed rotation.` : `Differential shortening between neighbouring columns and walls within L/${R.short.lim}.`} Roof: ${esc(mx.name)} ${mm(mx.tot)} mm, ${esc(mn.name)} ${mm(mn.tot)} mm - allow for it at cladding, lift and service joints.</div>
        <p class="muted bc-pad">N from ETABS for the quasi-permanent combination (columns by label through the storeys, walls by pier), E<sub>cm</sub> from f<sub>ck</sub>; steel E = 210 GPa without creep or shrinkage. The slab differential counts only the load placed after each floor is cast (N of the storey above; the floors are levelled during construction); shrinkage, similar in all stacks, is left out of it. A staged-construction analysis in ETABS gives the time-dependent values more exactly.</p>`);
    }
 if (R.beams) {
      const Bm = R.beams, crit = Bm.rows.slice().sort((a, c) => c.U - a.U).slice(0, 12), bad = Bm.rows.filter(r => r.U > 1 + 1e-9);
      html += card('beamcd', 'Beams: capacity-design shear (DCM / DCH)', 'EN 1998-1 5.4.2.2(1)-(2) · 5.5.2.1 · EN 1992-1-1 6.2.3(3)', `V<sub>Ed</sub> = V<sub>g+ψ2q</sub> + γ<sub>Rd</sub>·(M<sub>Rb,1</sub> + M<sub>Rb,2</sub>)/l<sub>cl</sub>, γ<sub>Rd</sub> = ${fmt(Bm.gRd, 1)} · M<sub>Rb</sub> = A<sub>s</sub>·f<sub>yd</sub>·0.9d from the ETABS end steel · V<sub>g</sub> of ${esc(Bm.combo)} · ETABS links V<sub>Rd,s</sub> with cotθ = ${fmt(Bm.cot, 2)}`,
        `${dp(['beamCov', 'colW', 'cotTh'], `${num('beamCov', 'Beam: d = h − this', 'm', '0.005', 'cover + link + half bar')}${num('colW', 'Column width (l<sub>cl</sub> = L − this)', 'm', '0.05', 'clear span')}${num('cotTh', 'cotθ for the links', '-', '0.1', '1.0 in the critical regions (conservative), ≤ 2.5')}`)}
        <div class="bc-split">${profile([{ n: 'V_Ed,CD / V_Rd,s max', c: '--s1', pts: R.st.map(x => { const rs = Bm.rows.filter(r => r.story === x.name); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(r => r.U)) } : null; }).filter(Boolean) }], { title: 'Beam capacity shear vs ETABS links per storey', xlabel: 'V_Ed,CD / V_Rd,s', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Beam', r => esc(r.label)], ['Storey', r => esc(r.story)], ['Section', r => esc(r.sec)], ['l<sub>cl</sub> m', r => fmt(r.lcl, 2), 'num'], ['ΣM<sub>Rb</sub> kN·m', r => fmt(r.SM, 0), 'num'], ['V<sub>g</sub> kN', r => fmt(r.Vg, 0), 'num'], ['V<sub>Ed,CD</sub> kN', r => fmt(r.VCD, 0), 'num'], ['V<sub>Rd,s</sub> kN', r => fmt(r.VRs, 0), 'num'], ['U', r => api.ubar(Math.min(r.U, 9.99))]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.length} beam(s) where the capacity-design shear exceeds what the ETABS links resist → design the links of the critical regions (l<sub>cr</sub> = h<sub>w</sub>, 5.4.3.1.2) for V<sub>Ed,CD</sub>, not for the analysis shear.` : 'The ETABS links resist the capacity-design shear in every beam.'}${Bm.H ? ' DCH: also the cyclic shear rules of 5.5.3.1.2(2)-(3) (ζ = V<sub>min</sub>/V<sub>max</sub>, inclined bars).' : ''}</div>
        <p class="muted bc-pad">M<sub>Rb</sub> from the steel the ETABS concrete design requires at the beam ends (top for hogging, bottom for sagging) - use the provided bars for the final design. The beam-end moments are not reduced by ΣM<sub>Rc</sub>/ΣM<sub>Rb</sub> (strong columns assumed, conservative). V<sub>g</sub> = gravity shear at the ends from the quasi-permanent combination.</p>`);
    }
    if (R.slab) {
      const S = R.slab, crit = S.rows.slice().sort((a, c) => c.U - a.U).slice(0, 12), bad1 = S.rows.filter(r => r.U1 > 1 + 1e-9), bad2 = S.rows.filter(r => r.U2 > 1 + 1e-9), mm = v => fmt(v * 1000, 1);
      const perSt = key => R.st.map(x => { const rs = S.rows.filter(r => r.story === x.name); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(r => r[key])) } : null; }).filter(Boolean);
      const ltChk = `<label class="bc-in"><span>ETABS combination is already long-term cracked</span><input type="checkbox" data-bcset="slabLT" ${s.slabLT ? 'checked' : ''} style="width:20px;height:20px"><small>e.g. a Nonlinear (Long Term Cracked) case: δ is used as read</small></label>`;
      html += card('slabd', 'Slab deflection (quasi-permanent)', 'EN 1992-1-1 7.4.1(4)-(5) · 7.4.3', S.lt ? `δ<sub>LT</sub> = δ<sub>ETABS</sub> of ${esc(S.combo)} (long-term cracked analysis)` : `δ<sub>LT</sub> = δ<sub>ETABS</sub>·m·k<sub>cr</sub>·(1 + φ) = ${fmt(S.k, 2)}·δ<sub>ETABS</sub> · δ after the partitions = δ<sub>LT</sub>·(1 + φ − η)/(1 + φ) · ${esc(S.combo)}`,
        `<div class="bc-inputs">${ltChk}</div>${dp(['phi', 'slabCr', 'slabEta', 'slabL1', 'slabL2'], `${num('phi', 'φ(∞,t<sub>0</sub>) creep coefficient', '-', '0.1', 'EN 1992-1-1 Fig. 3.1')}${num('slabCr', 'k<sub>cr</sub> = I<sub>g</sub>/I<sub>eff</sub> (cracking)', '-', '0.1', 'cracked two-way slab ≈ 1.5–2.5')}${num('slabEta', 'η part of the load before the partitions', '-', '0.05', 'self-weight share of G+ψ<sub>2</sub>Q')}${num('slabL1', 'Appearance limit span /', '-', '10', '7.4.1(4): 250')}${num('slabL2', 'Partitions limit span /', '-', '10', '7.4.1(5): 500')}`)}
        <div class="bc-split">${profile([{ n: 'δ_LT/(span/' + S.L1 + ')', c: '--s1', pts: perSt('U1') }, { n: 'δ after partitions/(span/' + S.L2 + ')', c: '--s2', pts: perSt('U2') }], { title: 'Slab deflection per storey (worst bay)', xlabel: 'δ / limit', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Storey', r => esc(r.story)], ['Bay x / y m', r => `<span style="white-space:nowrap">${r.bay}</span>`], ['Span m', r => fmt(r.L, 2), 'num'], ['δ<sub>ETABS</sub> mm', r => mm(r.dE), 'num'], ['m', r => fmt(r.m, 2), 'num'], ['δ<sub>LT</sub> mm', r => `${mm(r.dLT)} <small class="muted">≤ ${mm(r.L / S.L1)}</small>`, 'num'], ['δ<sub>inc</sub> mm', r => `${mm(r.dInc)} <small class="muted">≤ ${mm(r.L / S.L2)}</small>`, 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${bad1.length || bad2.length ? 'bad' : 'ok'}">${bad1.length ? `δ<sub>LT</sub> above span/${S.L1} in ${bad1.length} bay(s) → camber the formwork (up to span/250, 7.4.1(4)) or stiffen the slab. ` : ''}${bad2.length ? `Deflection after the partitions above span/${S.L2} in ${bad2.length} bay(s) (${bad2.slice(0, 4).map(r => esc(r.story) + ' ' + r.bay).join(', ')}) → thicker slab, more reinforcement (lower k<sub>cr</sub>), later partitions (higher η) or deflection-tolerant partition heads.` : ''}${!bad1.length && !bad2.length ? `Every slab bay within span/${S.L1} long-term and span/${S.L2} after the partitions.` : ''}</div>
        <p class="muted bc-pad">δ<sub>ETABS</sub> = largest sag of the slab mesh inside each bay between four columns, relative to the mean of its corners, from the ETABS linear analysis of the quasi-permanent combination; m rescales it to the gross section (slab bending modifier of the model). The span-to-depth rules of 7.4.2 or the slab's own EC2 deflection calculation (7.4.3, interpolation ζ) remain the reference for the final design.</p>`);
    }
    if (R.staged) {
      const G = R.staged, crit = G.rows.slice().sort((a, c) => c.U - a.U || Math.abs((c.rN || 1) - 1) - Math.abs((a.rN || 1) - 1)).slice(0, 12), bad = G.rows.filter(r => r.U > 1 + 1e-9), mm = v => (v == null ? '–' : fmt(v * 1000, 1));
      const red = G.rows.filter(r => r.rN != null && Math.abs(r.rN - 1) > 0.15);
      const perSt = (f, kind) => R.st.map(x => { const rs = G.rows.filter(r => r.story === x.name && (!kind || r.kind === kind) && f(r) != null); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(f)) } : null; }).filter(Boolean);
      const sel = G.cases.length > 1 ? `<div class="bc-inputs"><label class="bc-in"><span>Staged-construction case</span><select class="ctl" data-bcset="stagedCase">${G.cases.map(c => `<option ${c === G.case ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><small>read again after changing</small></label></div>` : '';
      html += card('staged', 'Staged construction (last stage)', 'EN 1992-1-1 3.1.4 · EN 1990 execution stages', `${esc(G.case)} · level change of each floor after casting, differential to the nearest stack ≤ L/${G.lim} · N against the one-step ${esc(G.combo1 || 'quasi-permanent')} analysis`,
        `${sel}<div class="bc-split">${profile([{ n: 'Δ/L ÷ 1/' + G.lim + ' max', c: '--s1', pts: perSt(r => r.U) }, { n: 'N staged / one-step, columns max', c: '--s2', pts: perSt(r => r.rN, 'column') }, { n: 'walls', c: '--s3', pts: perSt(r => r.rN, 'wall') }], { title: 'Staged construction per storey', xlabel: 'ratio', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Stack', r => esc(r.name)], ['Storey', r => esc(r.story)], ['N kN <small>staged / one-step</small>', r => `${fmt(r.N, 0)} <small class="muted">/ ${r.N1 != null ? fmt(r.N1, 0) : '–'}</small>`, 'num'], ['ratio', r => (r.rN != null ? fmt(r.rN, 2) : '–'), 'num'], ['u<sub>z</sub> mm <small>ETABS / est.</small>', r => `${mm(r.u)} <small class="muted">/ ${mm(r.est)}</small>`, 'num'], ['vs', r => esc(r.nb)], ['Δ mm', r => mm(r.diff), 'num'], ['Δ/L', r => (r.tilt > 0 ? '1/' + fmt(1 / r.tilt, 0) : '–'), 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `Level difference after casting above L/${G.lim} at ${bad.length} place(s) (${bad.slice(0, 5).map(r => esc(r.name) + '–' + esc(r.nb) + ' ' + esc(r.story)).join(', ')}) → pre-set the column formwork by the ETABS difference or check the slabs for the imposed rotation.` : `Level differences after casting from the staged analysis within L/${G.lim}.`}${red.length ? ` The staged sequence changes N by more than 15 % at ${red.length} stack-storey(s) - design those columns / walls (and any transfer girder) for the staged forces.` : ' Staged N within ±15 % of the one-step analysis.'}</div>
        <p class="muted bc-pad">u<sub>z</sub> = ETABS vertical displacement at the end of construction of the joints placed with each floor (counted from their placement); est. = the after-casting estimate of the axial-shortening check (creep φ, elastic). Use the staged forces where they exceed the one-step ones; time-dependent staged cases include creep and shrinkage only if the ETABS case has time-dependent material properties.</p>`);
    }
    if (R.coup) {
      const K = R.coup, crit = K.rows.slice().sort((a, c) => c.U - a.U).slice(0, 12), bad = K.rows.filter(r => r.U > 1 + 1e-9), dg = K.rows.filter(r => r.diag);
      const perSt = (f, sel) => R.st.map(x => { const rs = K.rows.filter(r => r.story === x.name && (!sel || sel(r))); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(f)) } : null; }).filter(Boolean);
      html += card('coup', 'Coupling beams (wall spandrels)', 'EN 1998-1 5.5.3.5 · EN 1992-1-1 6.2.3(3)', `diagonal bars unless V<sub>Ed</sub> ≤ f<sub>ctd</sub>·b<sub>w</sub>·d or l/h ≥ 3 · V<sub>Ed</sub> ≤ 2·A<sub>si</sub>·f<sub>yd</sub>·sin α · section V<sub>Ed</sub> ≤ V<sub>Rd,max</sub> = 0.5·ν·f<sub>cd</sub>·b<sub>w</sub>·z`,
        `${dp(['beamCov', 'fyk'], `${num('beamCov', 'd′ = h − d (bar centroid)', 'm', '0.005', 'also sets the diagonal angle α')}${num('fyk', 'f<sub>yk</sub> reinforcement', 'MPa', '10', 'f<sub>yd</sub> = f<sub>yk</sub>/1.15')}`)}
        <div class="bc-split">${profile([{ n: 'V_Ed / V_Rd,max', c: '--s1', pts: perSt(r => r.U) }, { n: 'V_Ed / (f_ctd·b_w·d)', c: '--s2', pts: perSt(r => r.V / r.Vcr) }], { title: 'Coupling beams per storey (worst spandrel)', xlabel: 'ratio', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Spandrel', r => esc(r.name)], ['Storey', r => esc(r.story)], ['l × h × b<sub>w</sub> m', r => `<span style="white-space:nowrap">${fmt(r.L, 2)} × ${fmt(r.h, 2)} × ${fmt(r.t, 2)}</span> <small class="muted">C${fmt(r.fck, 0)}</small>`], ['V<sub>Ed</sub> kN', r => fmt(r.V, 0), 'num'], ['f<sub>ctd</sub>b<sub>w</sub>d kN', r => fmt(r.Vcr, 0), 'num'], ['l/h', r => fmt(r.ar, 2), 'num'], ['Reinforcement', r => (r.diag ? `diagonal, α ${fmt(r.al * 180 / Math.PI, 1)}° · A<sub>si</sub> ${fmt(r.Asi * 1e6, 0)} mm²` : 'beam rules 5.5.3.1')], ['V<sub>Rd,max</sub> kN', r => fmt(r.Vmax, 0), 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `V<sub>Ed</sub> above the strut capacity in ${bad.length} coupling beam(s) (${bad.slice(0, 5).map(r => esc(r.name) + ' ' + esc(r.story)).join(', ')}) → thicker or deeper spandrel, higher f<sub>ck</sub>, or release the coupling (lower stiffness modifier) and redesign the walls.` : 'Every coupling beam section resists V<sub>Ed</sub> (strut).'} ${dg.length ? `${dg.length} of ${K.rows.length} need two groups of diagonal bars (A<sub>si</sub> per diagonal in the table), each enclosed in column-like links (side ≥ b<sub>w</sub>/2) with a horizontal and vertical bar mesh on both faces - detailing per 5.5.3.5(3)-(5).` : 'No diagonal bars needed: V<sub>Ed</sub> ≤ f<sub>ctd</sub>b<sub>w</sub>d or l/h ≥ 3.'}</div>
        <p class="muted bc-pad">Spandrel forces of the seismic combinations from ETABS (envelope of |V2| at both ends). 5.5.3.5 belongs to DCH walls; in DCM it is good practice for coupled walls. The diagonal bars of A<sub>si</sub> carry both shear and moment; anchor them into the walls beyond the EN 1992-1-1 anchorage length, increased as 5.5.3.5 requires.</p>`);
    }
    if (R.cols) {
      const C = R.cols, crit = C.rows.slice().sort((a, c) => c.U - a.U || Math.max(c.Vx, c.Vy) - Math.max(a.Vx, a.Vy)).slice(0, 12), bad = C.rows.filter(r => r.U > 1 + 1e-9);
      html += card('cols', 'Columns: capacity-design shear and axial load (DCM / DCH)', 'EN 1998-1 5.4.2.3 · 5.5.2.2 · 5.4.3.2.1(3) · 5.5.3.2.1(3)', `V<sub>Ed</sub> = γ<sub>Rd</sub>·2·M<sub>Rc</sub>·min(1, ΣM<sub>Rb</sub>/ΣM<sub>Rc</sub>)/l<sub>cl</sub>, γ<sub>Rd</sub> = ${fmt(C.gRd, 1)} · ν<sub>d</sub> = N<sub>Ed</sub>/(A<sub>c</sub>f<sub>cd</sub>) ≤ ${fmt(C.nuLim, 2)} · N<sub>Ed</sub> of ${esc(C.combo)}`,
        `<div class="bc-inputs"><label class="bc-in"><span>Ductility class</span><select class="ctl" data-bcset="dcl"><option value="M" ${s.dcl !== 'H' ? 'selected' : ''}>DCM · γ<sub>Rd</sub> 1.1, ν<sub>d</sub> ≤ 0.65</option><option value="H" ${s.dcl === 'H' ? 'selected' : ''}>DCH · γ<sub>Rd</sub> 1.3, ν<sub>d</sub> ≤ 0.55</option></select><small>EN 1998-1 5.2.1</small></label></div>${dp(['hb', 'colCov'], `${num('hb', 'Beam depth (l<sub>cl</sub> = h − this)', 'm', '0.05', 'clear column height')}${num('colCov', 'd<sub>2</sub> bar centroid from the face', 'm', '0.005', 'for M<sub>Rc</sub>')}`)}
        <div class="bc-split">${profile([{ n: 'ν_d max', c: '--s1', pts: R.st.map(x => { const rs = C.rows.filter(r => r.story === x.name); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(r => r.nu)) } : null; }).filter(Boolean) }], { title: 'Normalised axial load per storey', xlabel: 'ν_d', limit: C.nuLim, fmt: v => fmt(v, 2) })}
        ${tbl([['Column', r => esc(r.col)], ['Storey', r => esc(r.story)], ['Section', r => `<span style="white-space:nowrap">${fmt(r.hx * 1000, 0)}×${fmt(r.hy * 1000, 0)}</span> <small class="muted">C${fmt(r.fck, 0)}</small>`], ['N<sub>Ed</sub> kN', r => fmt(r.N, 0), 'num'], ['A<sub>s</sub> mm²', r => fmt(r.As * 1e6, 0), 'num'], ['M<sub>Rc</sub> kN·m', r => `${fmt(r.Mx, 0)} / ${fmt(r.My, 0)}${r.approx ? ' <small class="muted">≈</small>' : ''}`, 'num'], ['V<sub>Ed,CD</sub> kN', r => `${fmt(r.Vx, 0)} / ${fmt(r.Vy, 0)}`, 'num'], ['ν<sub>d</sub>', r => fmt(r.nu, 3), 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `ν<sub>d</sub> &gt; ${fmt(C.nuLim, 2)} at ${bad.length} column(s) (${bad.slice(0, 6).map(r => esc(r.col) + ' ' + esc(r.story)).join(', ')}) → larger section or higher f<sub>ck</sub> (5.4.3.2.1(3)).` : `ν<sub>d</sub> ≤ ${fmt(C.nuLim, 2)} in every column.`} Design the column shear (links, 5.4.3.2.2) for V<sub>Ed,CD</sub> of the table (major / minor axis), not for the analysis shear.</div>
        <p class="muted bc-pad">M<sub>Rc</sub> is an estimate from the longitudinal steel required by the ETABS concrete design (0.4·A<sub>s</sub> on each face, both layers yielding, rectangular stress block; ≈ = large compression zone, less accurate) at N<sub>Ed</sub> of the seismic combination; replace it with the column element's own M<sub>Rd</sub> for the final design. ΣM<sub>Rb</sub>/ΣM<sub>Rc</sub> = (beam/column capacity ratio of ETABS)/1.3, 1 where missing (conservative).</p>`);
    }
    const flatChk = `<label class="bc-in"><span>Flat slab (no beams at the columns)</span><input type="checkbox" data-bcset="flatSlab" ${s.flatSlab ? 'checked' : ''} style="width:20px;height:20px"><small>punching governs only where the slab bears directly on the column</small></label>`;
    if (R.punch && !s.flatSlab) html += card('punch', 'Punching shear at the slab-column connections', 'EN 1992-1-1 6.4', '', `<div class="bc-inputs">${flatChk}</div><p class="muted bc-pad">The model has beams at the columns (beam-and-slab): the slab load reaches the columns through the beams and punching does not govern. Tick <b>Flat slab</b> to check the ${R.punch.rows.length} slab-column connections read from ETABS.</p>`);
    if (R.punch && s.flatSlab) {
      const P = R.punch, crit = P.rows.slice().sort((a, c) => c.U - a.U).slice(0, 12), need = P.rows.filter(r => r.U1 > 1 + 1e-9), over = P.rows.filter(r => r.U0 > 1 + 1e-9);
      const pc = { interior: '--s1', edge: '--s2', corner: '--s3' };
      html += card('punch', 'Punching shear at the slab-column connections', 'EN 1992-1-1 6.4.3(6) · 6.4.4(1) · 6.4.5(3)', `V<sub>Ed</sub> = N below − N above (${esc(P.combo)}) · β 1.15 / 1.4 / 1.5 · u<sub>1</sub> at 2d · slab t = ${fmt(P.t * 1000, 0)} mm (${esc(P.tFrom)}), d = ${fmt(P.d * 1000, 0)} mm, f<sub>ck</sub> = ${fmt(P.fck, 0)} MPa, ρ<sub>l</sub> = ${fmt(P.rho * 100, 2)} % · v<sub>Rd,c</sub> = ${fmt(P.vRdc, 3)} MPa, v<sub>Rd,max</sub> = ${fmt(P.vRdmax, 2)} MPa`,
        `<div class="bc-inputs">${flatChk}${num('rhoL', 'ρ<sub>l</sub> top reinforcement ratio', '-', '0.001', '√(ρ<sub>ly</sub>·ρ<sub>lz</sub>) over the column ≤ 0.02')}</div>${dp(['punchCov'], `${num('punchCov', 'd = t − this', 'm', '0.005', 'cover + bar to the centroid of the top steel')}`)}
        <div class="bc-split">${profile(['interior', 'edge', 'corner'].map(pz => ({ n: pz, c: pc[pz], pts: R.st.map(x => { const rs = P.rows.filter(r => r.pos === pz && r.story === x.name); return rs.length ? { story: x.name, z: x.elev, v: Math.max(...rs.map(r => r.U1)) } : null; }).filter(Boolean) })).filter(x => x.pts.length), { title: 'Punching v_Ed / v_Rd,c per floor', xlabel: 'v_Ed / v_Rd,c', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Column', r => esc(r.col)], ['Floor', r => esc(r.story)], ['Position', r => `${r.pos} <small class="muted">β ${r.beta}</small>`], ['V<sub>Ed</sub> kN', r => fmt(r.V, 0), 'num'], ['u<sub>1</sub> m', r => fmt(r.u1, 2), 'num'], ['v<sub>Ed</sub> MPa', r => fmt(r.vEd, 3), 'num'], ['v<sub>Ed</sub>/v<sub>Rd,c</sub>', r => fmt(r.U1, 2), 'num'], ['v<sub>Ed,0</sub>/v<sub>Rd,max</sub>', r => fmt(r.U0, 2), 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${over.length || need.length ? 'bad' : 'ok'}">${over.length ? `v<sub>Ed,0</sub> &gt; v<sub>Rd,max</sub> at ${over.length} connection(s) - thicker slab, drop panel or larger column (6.4.5(3)). ` : ''}${need.length ? `${need.length} connection(s) with v<sub>Ed</sub> &gt; v<sub>Rd,c</sub> (${[...new Set(need.map(r => r.pos))].join(', ')}): punching shear reinforcement (links / studs) to 6.4.5(1) eq. 6.52 up to u<sub>out</sub>, or more top steel ρ<sub>l</sub> / a thicker slab.` : 'v<sub>Ed</sub> ≤ v<sub>Rd,c</sub> at every slab-column connection: no punching reinforcement needed.'}</div>
        <p class="muted bc-pad">V<sub>Ed</sub> from the ETABS column axial forces of the ULS gravity combination; β from Fig. 6.21N (no large eccentricity, unbraced moments not added); openings near the column reduce u<sub>1</sub> (6.4.2(3)) - check them in the punching element.</p>`);
    }
    if (!R.steel && b.data.steelErr) html += card('steel', 'Steel frame design (ETABS)', 'EN 1993-1-1 6.2, 6.3.3', '', `<p class="muted bc-pad">${esc(b.data.steelErr)}. Then read the building again.</p>`);
    if (R.steel) {
      const S2 = R.steel, crit = S2.rows.slice().sort((a, c) => c.U - a.U).slice(0, 12), bad = S2.rows.filter(r => r.U > 1 + 1e-9), errs = S2.rows.filter(r => r.err), cross = S2.rows.filter(r => r.app != null);
      const kc = { columns: '--s1', beams: '--s2', braces: '--s3', other: '--s4' };
      html += card('steel', 'Steel frame design: ETABS ratios', 'EN 1993-1-1 6.2 · 6.3.3 eq. 6.61 / 6.62 · ETABS steel frame design', `governing ratio of every steel member (interaction P-M-M or shear) ≤ 1 · ${S2.rows.length} members`,
        `<div class="bc-split">${profile(S2.prof.map(p => ({ n: p.k, c: kc[p.k] || '--s4', pts: p.pts })), { title: 'Largest steel ratio per storey', xlabel: 'design ratio', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Member', r => esc(r.label)], ['Storey', r => esc(r.story)], ['Type', r => esc(r.kind)], ['Section', r => esc(r.sec)], ['Ratio', r => `${fmt(r.U, 3)} <small class="muted">${esc(r.type)}</small>`, 'num'], ['Combination', r => `<small>${esc(r.combo)}</small>`], ['App U', r => (r.app != null ? fmt(r.app, 3) : '–'), 'num'], ['U', r => api.ubar(r.U)]], crit)}</div>
        <div class="bc-verdict ${bad.length || errs.length ? 'bad' : 'ok'}">${bad.length ? `${bad.length} steel member(s) over 1.0 (${bad.slice(0, 6).map(r => `${esc(r.label)} ${esc(r.story)} ${fmt(r.U, 2)} ${esc(r.type)}`).join(', ')}${bad.length > 6 ? ', …' : ''}) → larger section or shorter buckling length (bracing), then design the ETABS frame again.` : 'All steel members ≤ 1.0 in the ETABS design.'}${errs.length ? ` ${errs.length} member(s) with design errors in ETABS (e.g. ${esc(errs[0].label)}: ${esc(errs[0].err)}).` : ''}${cross.length ? ` Cross-check with the ETABS-linked app elements: ${cross.map(r => `${esc(r.label)} ETABS ${fmt(r.U, 2)} / app ${fmt(r.app, 2)}`).slice(0, 4).join(' · ')}.` : ''}</div>
        <p class="muted bc-pad">Ratios as reported by the ETABS steel frame design (Eurocode 3 code, the design combinations of the model) - make sure the ETABS code, the NA values and the effective lengths match the design basis. Seismic steel (EN 1998-1 6) capacity-design checks are not covered here. The 12 largest ratios are listed; “App U” is the utilisation of the same member designed in the app, where it is linked.</p>`);
    }
    if (R.fdn) {
      const F = R.fdn, L2 = F.list, crit = L2.slice().sort((a, c) => a.Nmin - c.Nmin).slice(0, 12), up = L2.filter(p => p.T > 0), bad = up.filter(p => p.U > 1 + 1e-9);
      html += card('fdn', 'Foundation design forces: capacity design', 'EN 1998-1 4.4.2.6(2)-(3) · EN 1998-5 5.3.1', `E<sub>Fd</sub> = E<sub>F,G</sub> + γ<sub>Rd</sub>·Ω·E<sub>F,E</sub> · q = ${fmt(F.q, 2)} → γ<sub>Rd</sub> = ${fmt(F.gRd, 1)} · Ω = ${fmt(F.Om, 2)}${F.capped ? ' (limited to q)' : ''} → γ<sub>Rd</sub>Ω = ${fmt(F.k, 2)} · E<sub>F,G</sub> = (Max+Min)/2, E<sub>F,E</sub> = (Max−Min)/2 of the seismic combinations`,
        `<div class="bc-inputs">${num('omega', 'Ω overstrength R<sub>di</sub>/E<sub>di</sub>', '-', '0.05', 'of the column / wall above, 1 ≤ Ω ≤ q (4.4.2.6(2))')}</div>
        <div class="bc-split">${supPlan(L2)}
        ${tbl([['Support', p => esc(p.label)], ['N<sub>F,G</sub> kN', p => fmt(p.NG, 0), 'num'], ['N<sub>F,E</sub> kN', p => fmt(p.NE, 0), 'num'], ['N<sub>Fd,max</sub> kN', p => fmt(p.NmaxAll, 0), 'num'], ['N<sub>Fd,min</sub> kN', p => `${fmt(p.Nmin, 0)} <small class="muted">${esc(p.combo)}</small>`, 'num'], ['H<sub>Fd</sub> kN', p => fmt(p.H, 0), 'num'], ['F<sub>t;d</sub> kN', p => (p.T > 0 ? fmt(p.T, 0) : '–'), 'num'], ['U', p => (p.T > 0 ? api.ubar(Math.min(p.U, 9.99)) : '')]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `With the capacity-design forces ${bad.length} support(s) go into tension above R<sub>t;d</sub> (${bad.slice(0, 6).map(p => `${esc(p.label)} ${fmt(p.T, 0)} kN`).join(', ')}) → tension piles / anchors or a heavier foundation (W<sub>f</sub>, R<sub>t;d</sub> in the support uplift card).` : up.length ? `Tension at ${up.length} support(s), within R<sub>t;d</sub>.` : 'All supports stay in compression with the capacity-design forces.'} Design the footings, pile caps and piles for N<sub>Fd</sub> and H<sub>Fd</sub> of this table (EN 1998-5 5.3.1) - not for the plain analysis reactions.</div>
        <p class="muted bc-pad">Ω = R<sub>di</sub>/E<sub>di</sub> ≤ q of the dissipative element that most influences the foundation (the wall or column above: M<sub>Rd</sub>/M<sub>Ed</sub> at its base, from the linked element); for a common foundation of several elements, the largest Ω (4.4.2.6(3)-(4)). Seismic combinations without Max / Min rows (static, single sign) are not split and are left out. The 12 supports with the lowest N<sub>Fd,min</sub> are listed.</p>`);
    }
    if (R.sup.list.length) {
      const L = R.sup.list, up = L.filter(p => p.T > 0), bad = up.filter(p => p.U > 1 + 1e-9), crit = L.slice().sort((a, c) => a.min.FZ - c.min.FZ).slice(0, 12);
      html += card('sup', 'Support uplift and pile tension', 'EN 1997-1 7.6.3.1(2) · EN 1990 6.4.3', `F<sub>t;d</sub> = −FZ<sub>min</sub> − 0.9·W<sub>f</sub> ≤ R<sub>t;d</sub> (7.12) · ${L.length} supports · ULS and seismic combinations with vertical load`,
        `<div class="bc-inputs">${num('Rtd', 'R<sub>t;d</sub> tension resistance per support', 'kN', '10', 'piles / anchors; 0 = none')}${num('Wf', 'W<sub>f</sub> foundation weight per support', 'kN', '10', 'pile cap / footing + soil, × 0.9')}</div>
        <div class="bc-split">${supPlan(L)}
        ${tbl([['Support', p => esc(p.label)], ['x m', p => fmt(p.x, 2), 'num'], ['y m', p => fmt(p.y, 2), 'num'], ['FZ<sub>min</sub> kN', p => `${fmt(p.min.FZ, 0)} <small class="muted">${esc(p.min.combo)}${p.min.step ? ' ' + esc(p.min.step) : ''}</small>`, 'num'], ['FZ<sub>max</sub> kN', p => fmt(p.max.FZ, 0), 'num'], ['F<sub>t;d</sub> kN', p => (p.T > 0 ? fmt(p.T, 0) : '–'), 'num'], ['Class', p => esc(p.cls)], ['U', p => (p.T > 0 ? api.ubar(Math.min(p.U, 9.99)) : '')]], crit)}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `Uplift at ${bad.length} support(s) (${bad.slice(0, 8).map(p => `${esc(p.label)} ${fmt(p.T, 0)} kN`).join(', ')}${bad.length > 8 ? ', …' : ''}) ${+s.Rtd > 0 ? `&gt; R<sub>t;d</sub> = ${fmt(+s.Rtd, 0)} kN` : 'with no tension resistance'} → tension piles or ground anchors (EN 1997-1 7.6.3, 8), a heavier pile cap / raft, or tie the supports together; the column splice and the base connection carry the tension too.` : up.length ? `Tension at ${up.length} support(s), F<sub>t;d</sub> ≤ R<sub>t;d</sub> = ${fmt(+s.Rtd, 0)} kN.` : 'All supports in compression for the ULS and seismic combinations: no uplift.'}</div>
        <p class="muted bc-pad">The 12 supports with the lowest FZ are listed; hover a support in the plan for its reactions. ${R.sup.skipped.length ? `Not used (no vertical load, lateral cases alone): ${R.sup.skipped.map(esc).join(', ')}. ` : ''}FZ from the ETABS joint reactions (positive = compression on the foundation). Seismic combinations: the foundation design forces include the capacity-design factors of EN 1998-1 4.4.2.6 / 5.8 - check them in the footing / pile cap elements.</p>`);
    }
    if (R.wc.length) {
      const rows = R.wc.map(w => Object.assign({}, w, { e: wcEl(w.dir) })).map(w => Object.assign(w, { r: wcResult(w.e) }));
      const done = rows.filter(w => w.r && w.r.U != null), bad = done.filter(w => w.r.U > 1 + 1e-9);
      html += card('wcomf', 'Wind comfort: peak acceleration at the top', 'EN 1991-1-4 Annex B.4 · ISO 10137', 'a<sub>peak</sub> = k<sub>p</sub>·σ<sub>a,x</sub> (B.10) for the comfort return period ≤ a<sub>lim</sub> · computed by the worksheet Wind_TallBuilding with the ETABS building',
        `${tbl([['Dir.', w => w.dir], ['h m', w => fmt(w.H, 1), 'num'], ['b across m', w => fmt(w.bw, 1), 'num'], ['d along m', w => fmt(w.dw, 1), 'num'], ['Storeys', w => w.nst, 'num'], ['ρ<sub>bld</sub> kg/m³', w => (w.rho ? fmt(w.rho, 0) : '<small class="muted">worksheet</small>'), 'num'], ['n<sub>1</sub> Hz', w => `${fmt(w.n1, 3)} <small class="muted">mode ${w.mode}</small>`, 'num'], ['V<sub>wind</sub> kN', w => (w.Vas ? fmt(w.Vas, 0) : '–'), 'num'], ['Calculation', w => (w.e ? `<a class="mark" style="cursor:pointer" data-open="${w.e.id}">${esc(w.e.mark)}</a>` : '<small class="muted">not created</small>')], ['a<sub>peak</sub>', w => (w.r && w.r.a ? esc(w.r.a) : w.r && w.r.pending ? '<small class="muted">computing…</small>' : '–'), 'num'], ['U', w => (w.r && w.r.U != null ? api.ubar(w.r.U) : '')]], rows)}
        <div class="etabs-btns" style="padding:12px 16px"><button class="btn primary" data-bc="wcomf">${ic('calc')}${rows.some(w => w.e) ? 'Update the wind calculations from ETABS' : 'Create the wind calculations from ETABS'}</button><small class="muted">One Wind_TallBuilding worksheet per direction, linked to ETABS; your wind data (v<sub>b,0</sub>, terrain, damping δ<sub>s</sub>, T<sub>comf</sub>, a<sub>lim</sub>) are set in the worksheet and kept on update.</small></div>
        ${done.length ? `<div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.map(w => `${w.dir}: a<sub>peak</sub> = ${esc(w.r.a)} &gt; a<sub>lim</sub> (U = ${fmt(w.r.U, 2)})`).join(' · ')} → occupants will perceive the motion: stiffen (raise n<sub>1</sub>), add mass or damping (tuned mass damper), or confirm with a wind-tunnel study.` : `Peak top acceleration within the comfort limit in ${done.map(w => w.dir).join(' and ')} (${done.map(w => w.dir + ': ' + esc(w.r.a)).join(', ')}).`}</div>` : ''}
        ${rows.some(w => w.r && w.r.other && w.r.other.length) ? `<div class="bc-verdict bad">The worksheet also flags: ${rows.filter(w => w.r && w.r.other && w.r.other.length).map(w => w.dir + ': ' + w.r.other.map(x => `${esc(x.item)} = ${fmt(x.U, 2)}`).join(', ')).join(' · ')}${rows.some(w => w.r && w.r.other && w.r.other.some(x => /shear|moment/i.test(x.item))) ? ' - the wind base shear / moment in ETABS is lower than the dynamic wind of EN 1991-1-4 (c<sub>s</sub>c<sub>d</sub>, q<sub>p</sub>): check the ETABS wind load patterns.' : ''}</div>` : ''}
        <p class="muted bc-pad">From ETABS: height, storeys, plan (B<sub>x</sub>, B<sub>y</sub> above), ρ<sub>bld</sub> = Σm / (B<sub>x</sub>·B<sub>y</sub>·h) from the storey masses, n<sub>1</sub> = 1/T of the first mode in the wind direction, the largest base shear / moment of the Wind SLS cases as V<sub>as</sub> / M<sub>as</sub>. The worksheet computes q<sub>p</sub>, c<sub>s</sub>c<sub>d</sub>, the along-wind acceleration for T<sub>comf</sub> (common practice 1-10 years) and the vortex-shedding screening; limits for a 10-year return: residential 0.15, hotel 0.18, office 0.25 m/s² (ISO 10137 / CTBUH guidance, as in the worksheet). Across-wind and torsional accelerations: worksheet Wind_AcrossTorsion.</p>`);
    }
    if (R.acc.rows.length || R.acc.cases.length) {
      const A = R.acc, bad = A.cases.filter(c => c.U != null && c.U > 1 + 1e-9), unk = A.cases.filter(c => c.ecc == null), dirs = [...new Set(A.rows.map(r => r.dir))];
      const tot = d => A.rows.filter(r => r.dir === d).reduce((a, r) => a + r.M, 0);
      html += card('acc', 'Accidental torsion', 'EN 1998-1 4.3.2(1)P · 4.3.3.2.4 · 4.3.3.3.3', `e<sub>ai</sub> = ±0.05·L<sub>i</sub> (L<sub>i</sub> floor size normal to the action: B<sub>y</sub> = ${fmt(s.By, 1)} m for X, B<sub>x</sub> = ${fmt(s.Bx, 1)} m for Y) · M<sub>ai</sub> = e<sub>ai</sub>·F<sub>i</sub>`,
        `${A.cases.length ? tbl([['Response-spectrum case', r => esc(r.case)], ['Dir.', r => r.dir || '–'], ['Eccentricity ratio in ETABS', r => r.ecc != null ? fmt(r.ecc, 3) : '<small class="muted">not read</small>', 'num'], ['Required', () => '0.050', 'num'], ['U', r => r.U != null ? api.ubar(Math.min(r.U, 9.99)) : '']], A.cases) : ''}
        ${A.rows.length ? `<div class="bc-split">${profile(dirs.map((dd, i) => ({ n: 'M_ai ' + dd, c: dd === 'Y' ? '--s2' : '--s1', pts: A.rows.filter(r => r.dir === dd).map(r => ({ story: r.story, z: r.z, v: r.M })) })), { title: 'Accidental storey torques', xlabel: 'M_ai kN·m', unit: 'kN·m', fmt: v => fmt(v, 0) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['F<sub>i</sub> kN', r => fmt(r.F, 0), 'num'], ['L<sub>i</sub> m', r => fmt(r.L, 1), 'num'], ['e<sub>ai</sub> m', r => fmt(r.e, 2), 'num'], ['M<sub>ai</sub> kN·m', r => fmt(r.M, 0), 'num']], top(A.rows))}</div>` : ''}
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.map(c => `${esc(c.case)}: eccentricity ${fmt(c.ecc, 3)} &lt; 0.05`).join(' · ')} → set the accidental eccentricity ratio of the response-spectrum case to 0.05 (Load cases → Modify → Diaphragm eccentricity, or Loads &amp; combinations → write the spectrum) and run again.` : A.cases.length && !unk.length ? 'Accidental eccentricity 0.05·L<sub>i</sub> applied in every response-spectrum case (4.3.2(1)P): ETABS adds the storey torques M<sub>ai</sub> = e<sub>ai</sub>·F<sub>i</sub> as an envelope (±) - the forces and drifts read here already include them.' : 'No eccentricity read from ETABS: apply the torques M<sub>ai</sub> of the table about the vertical axis at each floor, with both signs (4.3.3.3.3), or set the eccentricity ratio 0.05 in the response-spectrum cases.'}${dirs.length ? `<br>Total accidental torque: ${dirs.map(dd => `${dd}: ΣM<sub>ai</sub> = ${fmt(tot(dd), 0)} kN·m`).join(' · ')}.` : ''}</div>
        <p class="muted bc-pad">Without the spatial torques (lateral force method): stiffness and mass symmetric in plan → multiply the action effects of each resisting element by δ = 1 + 0.6·x/L<sub>e</sub> (4.3.3.2.4(1)), 1.30 at the perimeter (x = L<sub>e</sub>/2); two planar models (4.3.3.1(8)) → δ = 1 + 1.2·x/L<sub>e</sub> (4.3.3.2.4(2)), 1.60 at the perimeter. F<sub>i</sub> = storey shear difference of the seismic case with the largest base shear (for response-spectrum results the SRSS/CQC storey shears, an approximation of the floor forces).</p>`);
    }
    if (R.plan.length) {
      const PM = R.planModes, flex = R.plan.filter(r => r.Ur > 1), ecc = R.plan.filter(r => r.Ue > 1), noCR = R.plan.some(r => r.e0 == null);
      const coup = [PM.mX, PM.mY].filter(m => m.Rz > 0.1 * Math.max(m.Ux, m.Uy));
      html += card('plan', 'Torsional radius and eccentricity (regularity in plan)', 'EN 1998-1 4.2.3.2(6)', 'e<sub>0x</sub> ≤ 0.30·r<sub>x</sub> (4.1a) · r<sub>x</sub> ≥ l<sub>s</sub> (4.1b), and in Y · l<sub>s</sub> = √(I<sub>m</sub>/m) radius of gyration of the floor mass · r from the modes',
        `<div class="bc-split">${profile(['X', 'Y'].map((dd, i) => ({ n: 'e0/0.3r ' + dd, c: i ? '--s2' : '--s1', pts: R.plan.filter(r => r.dir === dd && r.e0 != null).map(r => ({ story: r.story, z: r.z, v: r.Ue })) })).filter(x => x.pts.length).concat(['X', 'Y'].map((dd, i) => ({ n: 'l_s/r ' + dd, c: i ? '--s4' : '--s3', pts: R.plan.filter(r => r.dir === dd).map(r => ({ story: r.story, z: r.z, v: r.Ur })) }))), { title: 'Eccentricity and torsional radius ratios', xlabel: 'ratio (≤ 1)', limit: 1, fmt: v => fmt(v, 2) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['l<sub>s</sub> m', r => fmt(r.ls, 2) + (r.lsFrom === 'plan' ? ' <small class="muted">plan</small>' : ''), 'num'], ['r m', r => fmt(r.r, 2), 'num'], ['r/l<sub>s</sub>', r => fmt(r.rl, 2), 'num'], ['e<sub>0</sub> m', r => r.e0 != null ? fmt(r.e0, 2) : '–', 'num'], ['0.3r m', r => fmt(0.3 * r.r, 2), 'num'], ['e<sub>0</sub>/0.3r', r => r.e0 != null ? fmt(r.Ue, 2) : '–', 'num'], ['Class', r => esc(r.cls)], ['U', r => api.ubar(r.U)]], top(R.plan))}</div>
        <div class="bc-verdict ${flex.length || ecc.length ? 'bad' : 'ok'}">${flex.length ? `r &lt; l<sub>s</sub> (${[...new Set(flex.map(r => r.dir))].join(', ')}): <b>torsionally flexible system</b> (EN 1998-1 5.2.2.1(4)) - q<sub>0</sub> = 2.0 (DCM) / 3.0 (DCH) for concrete (Table 5.1); add stiffness at the perimeter (walls, bracing) to raise r. ` : ''}${ecc.length ? `e<sub>0</sub> &gt; 0.3r at ${[...new Set(ecc.map(r => r.story + ' ' + r.dir))].join(', ')}: not regular in plan (4.2.3.2) - spatial model (4.3.1), α<sub>u</sub>/α<sub>1</sub> = average of 1.0 and the tabulated value (5.2.2.2(5)); bring the centre of rigidity closer to the centre of mass.` : ''}${!flex.length && !ecc.length ? 'e<sub>0</sub> ≤ 0.3r and r ≥ l<sub>s</sub> in X and Y: regular in plan for the torsion criteria (4.2.3.2(6)) - the other plan criteria (compact shape, rigid diaphragms, slenderness λ = L<sub>max</sub>/L<sub>min</sub> ≤ 4) are checked by the engineer.' : ''}</div>
        <p class="muted bc-pad">Modes: T<sub>X</sub> = ${fmt(PM.mX.T, 3)} s (mode ${PM.mX.mode}), T<sub>Y</sub> = ${fmt(PM.mY.T, 3)} s (mode ${PM.mY.mode}), T<sub>θ</sub> = ${fmt(PM.mR.T, 3)} s (mode ${PM.mR.mode}) → r<sub>x</sub>/l<sub>s</sub> = T<sub>Y</sub>/T<sub>θ</sub> = ${fmt(PM.rho.X, 2)}, r<sub>y</sub>/l<sub>s</sub> = T<sub>X</sub>/T<sub>θ</sub> = ${fmt(PM.rho.Y, 2)} (exact for uncoupled modes${coup.length ? `; mode ${coup.map(m => m.mode).join(', ')} has ${coup.map(m => fmt(m.Rz * 100, 0) + ' %').join(', ')} torsional mass - coupled, the estimate is approximate` : ''}). l<sub>s</sub> from the ETABS “Mass Summary by Diaphragm” (MMI) or the plan B<sub>x</sub> × B<sub>y</sub>; e<sub>0</sub> from “Centers Of Mass And Rigidity”${noCR ? ' - <b>no centres of rigidity in ETABS</b>: tick “Calculate Diaphragm Centers of Rigidity” in the analysis options, run and read again' : ''}.</p>`);
    }
    if (R.mass.length) {
      const bad = R.mass.filter(r => r.cls === 'Mass irregular'), heavy = R.mass.filter(r => r.cls === 'Heavier than below'), tot = R.mass.reduce((a, r) => a + r.m, 0);
      html += card('mass', 'Mass irregularity: storey mass', 'EN 1998-1 4.2.3.3(3)', 'mass constant or reducing gradually upwards · irregular if m<sub>i</sub> &gt; 1.5·m of an adjacent storey (limit of ASCE 7 Table 12.3-2, type 2; a lighter roof is not considered)',
        `<div class="bc-split">${profile([{ n: 'Storey mass', c: '--s1', pts: R.mass.map(r => ({ story: r.story, z: r.z, v: r.m })) }], { title: 'Storey mass', xlabel: 'storey mass t', unit: 't', fmt: v => fmt(v, 0) })}
        ${tbl([['Storey', r => esc(r.story)], ['m<sub>i</sub> t', r => fmt(r.m, 1), 'num'], ['m<sub>i</sub>/m<sub>i−1</sub>', r => r.up != null ? fmt(r.up, 2) : '–', 'num'], ['m<sub>i</sub>/m<sub>adj,min</sub>', r => r.ratio != null ? fmt(r.ratio, 2) : '–', 'num'], ['Class', r => esc(r.cls)], ['U', r => r.ratio != null ? api.ubar(r.U) : '']], R.mass.slice().sort((a, c) => c.z - a.z))}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.map(r => `${esc(r.story)}: m = ${fmt(r.m, 0)} t = ${fmt(r.ratio, 2)} × the lighter adjacent storey`).join(' · ')} → not regular in elevation (EN 1998-1 4.2.3.1): modal response spectrum analysis (Table 4.1), q<sub>0</sub> − 20 % (5.2.2.2(3)); check the heavy storey's columns for the extra inertia force.` : 'Storey masses within 1.5 × the adjacent storeys: regular in elevation for the mass criterion.'}${heavy.length ? `<br>Heavier than the storey below by more than 10 %: ${heavy.map(r => `${esc(r.story)} (× ${fmt(r.up, 2)})`).join(', ')} - mass should reduce gradually upwards (4.2.3.3(3)); acceptable within 1.5, but keep the extra mass (plant, storage) in the seismic mass G + ψ<sub>E</sub>·Q.` : ''}</div>
        <p class="muted bc-pad">Storey masses from the ETABS “Mass Summary by Story” table (mass source of the model) · total ${fmt(tot, 0)} t = ${fmt(tot * 9.81, 0)} kN. EN 1998-1 gives the criterion without a number; the ASCE 7 ratio is a common quantification.</p>`);
    }
    if (R.weak.length) {
      const bad = R.weak.filter(r => /weak/i.test(r.cls)), om = R.weak.filter(r => r.oflag);
      html += card('weak', 'Weak storey: storey shear resistance', 'EN 1998-1 4.2.3.3(4)', 'V<sub>Rd,i</sub> = Σ columns + walls (in plane) · weak if V<sub>Rd,i</sub> &lt; 0.8·V<sub>Rd,i+1</sub>, extreme &lt; 0.65 (limits of ASCE 7 Table 12.3-2) · Ω<sub>i</sub> = V<sub>Rd,i</sub>/V<sub>Ed,i</sub>',
        `<div class="bc-split">${profile([].concat(...['X', 'Y'].map((dd, i) => [{ n: 'V_Rd ' + dd, c: i ? '--s2' : '--s1', pts: R.weak.filter(r => r.dir === dd && r.n).map(r => ({ story: r.story, z: r.z, v: r.Rd })) }, { n: 'V_Ed ' + dd, c: i ? '--s4' : '--s3', pts: R.weak.filter(r => r.dir === dd && r.V > 0).map(r => ({ story: r.story, z: r.z, v: r.V })) }])).filter(x => x.pts.length), { title: 'Storey shear resistance and demand', xlabel: 'storey shear kN', unit: 'kN', fmt: v => fmt(v, 0) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Members', r => r.n, 'num'], ['V<sub>Rd,i</sub> kN', r => fmt(r.Rd, 0), 'num'], ['V<sub>Rd,i</sub>/V<sub>Rd,i+1</sub>', r => r.r1 != null ? fmt(r.r1, 2) : '–', 'num'], ['V<sub>Ed,i</sub> kN', r => r.V > 0 ? fmt(r.V, 0) : '–', 'num'], ['Ω<sub>i</sub>', r => r.om != null ? fmt(r.om, 2) : '–', 'num'], ['Ω<sub>i</sub>/Ω<sub>i+1</sub>', r => r.o1 != null ? fmt(r.o1, 2) + (r.oflag ? ' <span class="res bad">!</span>' : '') : '–', 'num'], ['Class', r => esc(r.cls)], ['U', r => r.r1 != null ? api.ubar(r.U) : '']], top(R.weak))}</div>
        <div class="bc-verdict ${bad.length ? 'bad' : 'ok'}">${bad.length ? `${bad.map(r => `${esc(r.story)} ${r.dir}: ${esc(r.cls).toLowerCase()} (V<sub>Rd,i</sub>/V<sub>Rd,i+1</sub> = ${fmt(r.r1, 2)})`).join(' · ')} → not regular in elevation (EN 1998-1 4.2.3.1): modal response spectrum analysis (Table 4.1), q<sub>0</sub> − 20 % (5.2.2.2(3)); a storey mechanism can form here - strengthen the storey (ASCE 7 12.3.3.1 does not allow an extreme weak storey in high seismicity).` : 'Storey shear resistance constant or reducing gradually upwards in X and Y: no weak storey.'}${om.length ? `<br>Ω<sub>i</sub> drops by more than 30 % from the storey above at ${om.map(r => esc(r.story) + ' ' + r.dir).join(', ')}: the resistance-to-demand ratio varies disproportionately (4.2.3.3(4)) - check that storey's shear design.` : ''}</div>
        <p class="muted bc-pad">V<sub>Rd</sub> is a resistance index read from the ETABS sections: concrete V<sub>Rd,c</sub> = v<sub>min</sub>·b<sub>w</sub>·d (EN 1992-1-1 6.2.2(1), no stirrups or axial force), steel V<sub>pl</sub> = A<sub>v</sub>f<sub>y</sub>/√3 (EN 1993-1-1 6.2.6); walls in plane only, braces not included. It compares storeys - the member shear design stays with the element checks. V<sub>Ed</sub> from the seismic case with the largest base shear; Ω<sub>i</sub> is not compared with the roof storey. EN 1998-1 gives the criterion without numbers: the ASCE 7 ratios and the 30 % of prEN 1998-1-2 are used.</p>`);
    }
    if (R.bs) {
      const SP = R.bsSP, tmax = Math.max(4, ...R.bs.map(x => x.T1 * 1.2)), ts = SP.T.filter(t => t <= tmax), ymax = Math.max(...ts.map(t => SP.sd(t))) * 1.1;
      const vline = (t, key) => ({ p: { y: ['v', 'Y_' + key] }, d: { x: [t, t], y: [0, ymax], ls: 'Dash' } });
      const marks = [vline(R.bs[0].T1, 'T1,X modal'), vline(R.bs[1].T1, 'T1,Y modal'), vline(R.bs[0].Tct, 'Ct·H^¾')];
      const chart = EC.mrender ? EC.mrender.plot({ tr: [{ y: ['v', 'Y_Design spectrum Sd/g'] }].concat(marks.map(m => m.p)) }, { tr: [{ x: ts, y: ts.map(t => SP.sd(t)), xu: ['u', 's'], ls: 'Solid' }].concat(marks.map(m => m.d)) }, {}) : '';
      const CT = [[0.085, 'Steel moment frames · 0.085'], [0.075, 'RC moment frames, steel EBF · 0.075'], [0.05, 'Other (walls, dual) · 0.050']];
      html += card('bshear', 'Base shear: response spectrum vs lateral force method', 'EN 1998-1 4.3.3.2', `T<sub>1</sub> ≈ C<sub>t</sub>·H<sup>3/4</sup> (4.3.3.2.2(3)) · F<sub>b</sub> = S<sub>d</sub>(T<sub>1</sub>)·m·λ (4.3.3.2.2(1)) · spectrum from Loads &amp; combinations (a<sub>g</sub> = ${fmt(SP.ag, 3)} g, T<sub>C</sub> = ${SP.TC} s)`,
        `<div class="bc-inputs" style="grid-template-columns:minmax(0,360px)"><label class="bc-in"><span>C<sub>t</sub> structural system</span><select class="ctl" data-bcct>${CT.map(([v, l]) => `<option value="${v}" ${+s.ct === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small>H = ${fmt(R.H, 2)} m → C<sub>t</sub>·H<sup>3/4</sup> = ${fmt(R.bs[0].Tct, 3)} s</small></label></div>
        <div class="bc-split"><div class="ld-rs" style="padding:0">${chart}</div>
        ${tbl([['Dir.', r => r.dir], ['Mode', r => r.mode != null ? `${r.mode} <small class="muted">${fmt(r.mass * 100, 0)} %</small>` : '–', 'num'], ['T<sub>1</sub> modal s', r => fmt(r.T1, 3), 'num'], ['T<sub>1</sub>/C<sub>t</sub>H<sup>¾</sup>', r => fmt(r.rT, 2), 'num'], ['S<sub>d</sub>(T<sub>1</sub>)/g', r => fmt(r.sd, 4), 'num'], ['λ', r => r.lam, 'num'], ['W kN', r => fmt(r.W, 0), 'num'], ['F<sub>b</sub> kN', r => fmt(r.Fb, 0), 'num'], ['V<sub>RS</sub> kN', r => fmt(r.Vrs, 0), 'num'], ['V<sub>RS</sub>/F<sub>b</sub>', r => r.ratio != null ? fmt(r.ratio, 2) : '–', 'num']], R.bs)}</div>
        ${R.bs.map(r => `<div class="bc-verdict ${r.ratio == null || r.ratio >= 0.8 ? 'ok' : 'bad'}">${r.dir}: ${r.lfm ? `T<sub>1</sub> = ${fmt(r.T1, 2)} s ≤ min(4T<sub>C</sub>, 2 s) = ${fmt(Math.min(4 * SP.TC, 2), 2)} s - the lateral force method may also be used (with regularity in elevation, 4.3.3.2.1)` : `T<sub>1</sub> = ${fmt(r.T1, 2)} s > min(4T<sub>C</sub>, 2 s): modal response spectrum analysis required (4.3.3.2.1)`}; V<sub>RS</sub>/F<sub>b</sub> = ${r.ratio != null ? fmt(r.ratio, 2) : '–'}${r.ratio != null && r.ratio < 0.8 ? ' - the response-spectrum base shear is well below the lateral force; check the seismic mass, the modes and the stiffness modifiers' : ''}${r.rT > 1.5 ? ` · modal T<sub>1</sub> is ${fmt(r.rT, 1)} × C<sub>t</sub>H<sup>¾</sup>: the model may be too flexible` : r.rT < 0.6 ? ` · modal T<sub>1</sub> is only ${fmt(r.rT, 1)} × C<sub>t</sub>H<sup>¾</sup>: check the mass and the stiffness` : ''}</div>`).join('')}
        <p class="muted bc-pad">m = seismic weight W/g from the base reaction of G + ψ<sub>E</sub>·Q; λ = 0.85 for T<sub>1</sub> ≤ 2T<sub>C</sub> and more than two storeys. EN 1998-1 has no minimum ratio between the modal and the lateral-force base shear; 0.8 is used here as a plausibility check of the model.</p>`);
    }
    if (MC) {
      const modTxt = r => { const M = r.p.mods, ks = r.p.kind === 'frame' ? ['I33', 'I22', 'As2', 'As3', 'A', 'J', 'Mass', 'Weight'] : ['f11', 'f22', 'f12', 'm11', 'm22', 'm12', 'Mass', 'Weight'];
        return ks.map(k => `<span class="${Math.abs((M[k] === undefined ? 1 : +M[k]) - 1) > 1e-6 ? 'md-on' : 'md-off'}">${k} ${fmt(M[k] === undefined ? 1 : +M[k], 2)}</span>`).join(' '); };
      html += card('mods', 'Stiffness modifiers', 'EN 1998-1 4.3.1(6)-(7) · EN 1992-1-1 5.8.7.2 · cracked-section stiffness for the purpose of the analysis', '',
        `<div class="bc-inputs" style="grid-template-columns:minmax(0,420px)"><label class="bc-in"><span>Purpose of this ETABS model</span><select class="ctl" data-bcpurpose>${Object.keys(PURPOSE).map(k => `<option value="${k}" ${s.kPurpose === k ? 'selected' : ''}>${PURPOSE[k][0].replace(/<[^>]+>/g, '')}</option>`).join('')}</select><small>expected range of the flexural modifier: columns ${PURPOSE[s.kPurpose][1].columns.join('–')}, beams ${PURPOSE[s.kPurpose][1].beams.join('–')}, walls ${PURPOSE[s.kPurpose][1].walls.join('–')}, slab bending ${PURPOSE[s.kPurpose][1].slabsM.join('–')}; steel 1.0; mass and weight always 1.0</small></label></div>
        ${tbl([['Status', r => `<span class="res ${r.st === 'bad' ? 'bad' : 'ok'}">${r.st === 'bad' ? '✗ Revise' : r.st === 'warn' ? '! Note' : '✓ OK'}</span>`], ['Property', r => `<b>${esc(r.p.name)}</b><br><small class="muted">${r.p.kind === 'frame' ? 'frame section' : 'shell'} · ${esc(r.p.mat)}</small>`],
          ['Used as', r => `<small>${r.uses.map(u => `${r.p.use[u]} ${esc(u)}`).join(', ')}</small>`], ['Modifiers in ETABS', r => `<small class="md">${modTxt(r)}</small>${r.p.over && r.p.over.length ? `<br><small class="muted">${r.p.over.length} object override(s)</small>` : ''}`],
          ['Findings', r => r.issues.length ? `<small>${r.issues.map(i => `${i.lvl === 'bad' ? '✗' : '!'} ${i.t}`).join('<br>')}</small>` : '<small class="muted">within the range for this purpose</small>']], MC)}
        <p class="muted bc-pad">Use one model (or one set of modifiers) per purpose: too stiff underestimates drift, θ and the period and overestimates α<sub>cr</sub> (unsafe for P-Δ); too soft underestimates the forces of stiff buildings. Object overrides multiply the property modifiers. Torsion J of beams (0.01-0.1) avoids compatibility torsion - keep the minimum torsion links (EN 1992-1-1 6.3.1(2)).</p>`);
    }
    const MF = memberFactors(b, R), nAmp = MF.filter(m => m.k && m.k > 1).length, nOn = MF.filter(m => m.applied).length;
    html += card('members', 'P-Δ design of the ETABS-linked members', 'EN 1998-1 4.4.2.2(3) · EN 1993-1-1 5.2.2(5)B', 'seismic governing case × 1/(1−θ) of its storey · other cases × 1/(1−1/α<sub>cr</sub>) · M and V amplified',
      MF.length ? `${tbl([['Mark', r => `<a href="#/el/${r.e.id}" class="mark">${esc(r.e.mark)}</a>`], ['Design', r => esc(EC.modules[r.e.type].name)], ['Storey', r => esc(r.story || '')], ['Governing case', r => `<small>${esc(r.e.etabs.combo)}</small>`], ['Basis', r => `<small>${r.basis}</small>`],
          ['Factor', r => r.k === null ? '<span class="res bad">2nd order</span>' : fmt(r.k, 3), 'num'], ['Applied', r => r.applied ? `<span class="res ok" style="white-space:nowrap">× ${fmt(r.applied, 3)}</span>` : '–'], ['U ETABS', r => fmt(r.U0, 2), 'num'], ['U with P-Δ', r => r.k && r.k > 1 ? api.ubar(r.U1) : fmt(r.U0, 2)]], MF)}
        <div class="etabs-btns" style="padding:12px 16px 14px"><button class="btn primary" data-bc="amp" ${nAmp ? '' : 'disabled'}>${ic('check')}Apply P-Δ to ${nAmp} member(s)</button>${nOn ? `<button class="btn" data-bc="unamp">${ic('undo')}Remove from ${nOn} member(s)</button>` : ''}
          <small class="muted">The original ETABS forces are kept; re-reading or syncing ETABS keeps the factor on the new forces.</small></div>
        <div class="ld-chks"><label class="ld-chk"><input type="checkbox" data-bcset="ampImp" ${b.set.ampImp ? 'checked' : ''}>Treat gravity + imperfection (notional-load) cases as sway cases: × 1/(1−1/α<sub>cr</sub>) on the whole M and V (EN 1993-1-1 5.2.2(5)B - H<sub>Ed</sub> includes the equivalent imperfection forces; conservative)</label></div>`
        : '<p class="muted bc-pad">No ETABS-linked beams, columns, walls, steel members or footings yet - design members from Link to ETABS first.</p>');
    return html + inputs + `<p class="muted" style="margin-top:12px">Source: ${esc(b.file || '')} · read ${new Date(b.at).toLocaleString()} · units kN, m.</p>`;
  }

  function mount(root) {
    const rer = () => api.render();
    root.onclick = ev => {
      // print / open / go are handled by the app's document-level handler
      const t = ev.target.closest('[data-bc],[data-bcrole]'); if (!t) return;
      const d = t.dataset, b = B();
      if (d.bc === 'connect') return EC.etabs.live.connect(rer);
      if (d.bc === 'demo') {
        b.data = demoBuilding(); b.data.mods = demoMods(); b.data.strength = demoStrength(); b.data.supports = demoSupports(b.data); b.data.axial = demoAxial(); b.data.axialU = demoAxial(1.42, 'ULS1 1.35G+1.5Q'); b.data.axialE = demoAxial(1, 'G+0.3Q+EX'); b.data.colDesign = demoColumns(); b.data.beamDesign = demoBeams(); b.data.slabDefl = demoSlabDefl(); b.data.staged = demoStaged(); b.data.spandrels = demoSpandrels(); b.data.joints = demoJoints(); b.data.piers = demoPiers(b.data); b.data.steel = demoSteel(); b.data.slabs = [{ prop: 'S200 C30', t: 0.2, mat: 'Concrete', f: 30 }];
        b.file = 'Demo building (sample ETABS results)'; b.at = Date.now(); b.demo = true;
        Object.assign(b.roles, DEMO_ROLES); Object.assign(b.set, { qd: 3.0, nu: 0.5, alpha: 0.005, windLim: 500, Bx: 24, By: 18, fos: 1.0 });
        let n = 0;   // demo ETABS-linked members (beams, columns, footings) for the P-Δ member design
        if (!api.proj().elements.some(e => e.etabs) && EC.etabs._demoDesign) n = EC.etabs._demoDesign();
        demoNotional(b);   // demo: ULS1 carries notional loads N Dead X / N Live X; their member forces ≈ 3 % of the gravity ones
        api.save(); api.toast('Demo building loaded' + (n ? ` · ${n} demo ETABS-linked member(s) designed` : '')); return rer();
      }
      if (d.bc === 'amp' || d.bc === 'unamp') {
        const R = compute(b); if (!R) return;
        let n = 0;
        memberFactors(b, R).forEach(m => {
          if (d.bc === 'unamp') { if (m.e.pdelta) { Object.assign(m.e.inputs, m.e.pdelta.base); delete m.e.pdelta; m.e.u = Date.now(); n++; } }
          else if (m.k && m.k > 1) { applyK(m.e, m.base, m.k, m.kk); n++; }
          else if (m.e.pdelta) { Object.assign(m.e.inputs, m.e.pdelta.base); delete m.e.pdelta; m.e.u = Date.now(); }
        });
        api.save(); api.toast(d.bc === 'amp' ? `P-Δ amplification applied to ${n} member(s)` : `P-Δ amplification removed from ${n} member(s)`); return rer();
      }
      if (d.bc === 'wcomf') {
        const R = compute(b); if (!R || !R.wc.length || !EC.mcui) return;
        return wcWrite(b, R).then(n => { api.toast(`Wind calculations: ${n.nNew} created, ${n.nUpd} updated from ETABS`); rer(); }, e => api.toast('Could not load the worksheet: ' + e.message));
      }
      if (d.bcrole !== undefined) { b.roles[d.bcrole] = ROLE_ORDER[(ROLE_ORDER.indexOf(b.roles[d.bcrole] || 'off') + 1) % ROLE_ORDER.length]; api.save(); return rer(); }
      if (d.bc === 'read') {
        const cs = Object.keys(b.roles).filter(c => b.roles[c] !== 'off' && EC.etabs.live.L.model && EC.etabs.live.L.model.combos.concat(EC.etabs.live.L.model.cases).includes(c));
        if (!cs.length) { err = 'Give at least one combination a role (Seismic, Wind SLS or ULS).'; return rer(); }
        busy = 'read'; err = ''; rer();
        EC.etabs.live.get('/building?' + cs.map(c => 'c=' + encodeURIComponent(c)).join('&')).then(j => {
          b.data = { stories: j.stories || [], drifts: j.drifts || [], forces: j.forces || [], torsion: j.torsion || [], base: j.base || [], buckling: j.buckling || [], modal: j.modal || [], masses: j.masses || [], plan_cm: j.plan_cm || [], rs_ecc: j.rs_ecc || [] };
          b.file = String(j.file || '').split(/[\\/]/).pop(); b.at = Date.now(); b.demo = false;
          if (j.plan && b.set.Bx === DEF.Bx && b.set.By === DEF.By) { b.set.Bx = j.plan.Bx; b.set.By = j.plan.By; }
          if (!b.data.stories.length) throw new Error('ETABS returned no storeys.');
          return EC.etabs.live.get('/modifiers').then(mj => { b.data.mods = mj.props || []; }, () => { b.data.mods = []; })
            .then(() => EC.etabs.live.get('/strength').then(sj => { b.data.strength = sj.elements || []; b.data.slabs = sj.slabs || []; }, () => { b.data.strength = []; b.data.slabs = []; }))
            .then(() => { const ms = EC.etabs.live.L.model ? EC.etabs.live.L.model.combos : [], qp = b.set.qpCombo && ms.includes(b.set.qpCombo) ? b.set.qpCombo : ms.find(c => /qp|quasi|perm/i.test(c));
              if (!qp) { b.data.axial = null; return; }
              return EC.etabs.live.get('/axial?c=' + encodeURIComponent(qp)).then(aj => { b.data.axial = aj; }, () => { b.data.axial = null; }); })
            .then(() => { const ms = EC.etabs.live.L.model ? EC.etabs.live.L.model.combos : [], qp = b.set.qpCombo && ms.includes(b.set.qpCombo) ? b.set.qpCombo : ms.find(c => /qp|quasi|perm/i.test(c));
              if (!qp) { b.data.beamDesign = null; return; }
              return EC.etabs.live.get('/beams?c=' + encodeURIComponent(qp)).then(bj => { b.data.beamDesign = bj; }, () => { b.data.beamDesign = null; }); })
            .then(() => { const ms = EC.etabs.live.L.model ? EC.etabs.live.L.model.combos : [], qp = b.set.qpCombo && ms.includes(b.set.qpCombo) ? b.set.qpCombo : ms.find(c => /qp|quasi|perm/i.test(c));
              if (!qp) { b.data.slabDefl = null; return; }
              return EC.etabs.live.get('/slabdefl?c=' + encodeURIComponent(qp)).then(sj => { b.data.slabDefl = sj; }, () => { b.data.slabDefl = null; }); })
            .then(() => { const se = cs.filter(c => b.roles[c] === 'seis'); if (!se.length) { b.data.spandrels = []; return; }
              return EC.etabs.live.get('/spandrels?' + se.map(c => 'c=' + encodeURIComponent(c)).join('&')).then(pj => { b.data.spandrels = pj.spandrels || []; }, () => { b.data.spandrels = []; }); })
            .then(() => EC.etabs.live.get('/staged' + (b.set.stagedCase ? '?c=' + encodeURIComponent(b.set.stagedCase) : '')).then(gj => { b.data.staged = gj && (gj.stacks || []).length ? gj : null; }, () => { b.data.staged = null; }))
            .then(() => EC.etabs.live.get('/columns').then(cj => { b.data.colDesign = cj.columns || []; }, () => { b.data.colDesign = []; }))
            .then(() => { const se = Object.keys(b.roles).filter(c => b.roles[c] === 'seis' && (b.data.base || []).some(r => r.combo === c && Math.abs(r.FZ) > 1)).sort((a, c) => Math.abs((b.data.base.find(r => r.combo === c) || {}).FZ || 0) - Math.abs((b.data.base.find(r => r.combo === a) || {}).FZ || 0))[0];
              if (!se) { b.data.axialE = null; return; }
              return EC.etabs.live.get('/axial?c=' + encodeURIComponent(se)).then(aj => { b.data.axialE = aj; }, () => { b.data.axialE = null; }); })
            .then(() => { const ul = Object.keys(b.roles).filter(c => b.roles[c] === 'uls' && (b.data.base || []).some(r => r.combo === c)).sort((a, c) => Math.abs((b.data.base.find(r => r.combo === c) || {}).FZ || 0) - Math.abs((b.data.base.find(r => r.combo === a) || {}).FZ || 0))[0];
              if (!ul) { b.data.axialU = null; return; }
              return EC.etabs.live.get('/axial?c=' + encodeURIComponent(ul)).then(aj => { b.data.axialU = aj; }, () => { b.data.axialU = null; }); })
            .then(() => EC.etabs.live.get('/piers?' + cs.filter(c => b.roles[c] === 'uls' || b.roles[c] === 'seis').map(c => 'c=' + encodeURIComponent(c)).join('&')).then(pj => { b.data.piers = pj.piers || []; }, () => { b.data.piers = []; }))
            .then(() => EC.etabs.live.get('/steel').then(sj => { b.data.steel = sj.members || []; b.data.steelErr = ''; }, e => { b.data.steel = []; b.data.steelErr = e.message; }))
            .then(() => EC.etabs.live.get('/joints').then(jj => { b.data.joints = jj.joints || []; b.data.jointsErr = ''; }, e => { b.data.joints = []; b.data.jointsErr = e.message; }))
            .then(() => EC.etabs.live.get('/supports?' + cs.filter(c => b.roles[c] === 'uls' || b.roles[c] === 'seis').map(c => 'c=' + encodeURIComponent(c)).join('&')).then(sj => { b.data.supports = sj.supports || []; }, () => { b.data.supports = []; }))
            .then(() => readNotional(b).catch(() => { b.data.nf = null; b.data.ncombos = null; }));
        }).then(() => {
          busy = ''; api.save(); api.toast('Building read from ETABS'); rer();
        }).catch(e => { busy = ''; err = e.message; rer(); });
      }
    };
    root.onchange = ev => {
      const t = ev.target;
      if (t.dataset.bcpurpose !== undefined) { B().set.kPurpose = t.value; api.save(); return rer(); }
      if (t.dataset.bcct !== undefined) { B().set.ct = +t.value; api.save(); return rer(); }
      if (t.dataset.bcset === undefined) return;
      if (t.type === 'checkbox') { B().set[t.dataset.bcset] = t.checked; api.save(); return rer(); }
      if (t.dataset.bcset === 'qpCombo' || t.dataset.bcset === 'dcl' || t.dataset.bcset === 'stagedCase') { B().set[t.dataset.bcset] = t.value; api.save(); return rer(); }
      const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
      B().set[t.dataset.bcset] = v; api.save(); rer();
    };
  }

  EC.building = { install(a) { api = a; }, view, mount, reamp, _modCheck: (p, k) => modCheck(p, k), _compute: compute, _memberFactors: (b, R) => memberFactors(b, R), _vrd: vrd, _demo: () => { const d = Object.assign(demoBuilding(), { strength: demoStrength() }); d.supports = demoSupports(d); d.axial = demoAxial(); d.axialU = demoAxial(1.42, 'ULS1 1.35G+1.5Q'); d.axialE = demoAxial(1, 'G+0.3Q+EX'); d.colDesign = demoColumns(); d.beamDesign = demoBeams(); d.slabDefl = demoSlabDefl(); d.staged = demoStaged(); d.spandrels = demoSpandrels(); d.joints = demoJoints(); d.piers = demoPiers(d); d.steel = demoSteel(); return d; }, _demoRoles: DEMO_ROLES };
})();
