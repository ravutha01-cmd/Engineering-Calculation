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
  const DEF = { qd: 3.0, nu: 0.5, alpha: 0.005, windLim: 500, windLimH: 500, Bx: 20, By: 20, fos: 1.0, ampImp: true, kPurpose: 'seis', ct: 0.075 };
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
    return d;
  }

  /* ---------- checks ---------- */
  const maxBy = (xs, f) => xs.reduce((a, x) => (a === null || f(x) > f(a) ? x : a), null);
  function compute(b) {
    const d = b.data; if (!d) return null;
    const s = b.set, role = c => b.roles[c] || 'off';
    const st = d.stories.slice().sort((a, c) => a.elev - c.elev);
    const H = st.length ? st[st.length - 1].elev - (st[0].elev - st[0].h) : 0;
    const out = { st, H };
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
    const inputs = `<div class="card"><div class="card-h"><b>Design parameters</b><small>yellow = input · kept with the project</small></div><div class="bc-inputs">
      ${num('qd', 'q<sub>d</sub> displacement behaviour factor', '-', '0.1', 'd<sub>s</sub> = q<sub>d</sub>·d<sub>e</sub> (EC8 4.3.4)')}
      ${num('nu', 'ν reduction factor', '-', '0.05', '0.5 class I–II · 0.4 class III–IV')}
      <label class="bc-in"><span>α drift limit (EC8 4.4.3.2)</span><select class="ctl" data-bcset="alpha">${[[0.005, '0.005 · brittle non-structural'], [0.0075, '0.0075 · ductile non-structural'], [0.010, '0.010 · no interference']].map(([v, l]) => `<option value="${v}" ${+s.alpha === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small>d<sub>r</sub>·ν ≤ α·h</small></label>
      ${num('windLim', 'Wind storey drift limit h /', '-', '50', 'SLS, e.g. h/500')}
      ${num('Bx', 'Plan width B<sub>x</sub>', 'm', '0.1', 'overturning about Y')}
      ${num('By', 'Plan width B<sub>y</sub>', 'm', '0.1', 'overturning about X')}
      ${num('fos', 'Required overturning safety', '-', '0.05', '1.0 with EQU-factored combinations')}</div></div>`;
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
        b.data = demoBuilding(); b.data.mods = demoMods();
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
      if (d.bcrole !== undefined) { b.roles[d.bcrole] = ROLE_ORDER[(ROLE_ORDER.indexOf(b.roles[d.bcrole] || 'off') + 1) % ROLE_ORDER.length]; api.save(); return rer(); }
      if (d.bc === 'read') {
        const cs = Object.keys(b.roles).filter(c => b.roles[c] !== 'off' && EC.etabs.live.L.model && EC.etabs.live.L.model.combos.concat(EC.etabs.live.L.model.cases).includes(c));
        if (!cs.length) { err = 'Give at least one combination a role (Seismic, Wind SLS or ULS).'; return rer(); }
        busy = 'read'; err = ''; rer();
        EC.etabs.live.get('/building?' + cs.map(c => 'c=' + encodeURIComponent(c)).join('&')).then(j => {
          b.data = { stories: j.stories || [], drifts: j.drifts || [], forces: j.forces || [], torsion: j.torsion || [], base: j.base || [], buckling: j.buckling || [], modal: j.modal || [] };
          b.file = String(j.file || '').split(/[\\/]/).pop(); b.at = Date.now(); b.demo = false;
          if (j.plan && b.set.Bx === DEF.Bx && b.set.By === DEF.By) { b.set.Bx = j.plan.Bx; b.set.By = j.plan.By; }
          if (!b.data.stories.length) throw new Error('ETABS returned no storeys.');
          return EC.etabs.live.get('/modifiers').then(mj => { b.data.mods = mj.props || []; }, () => { b.data.mods = []; })
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
      const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
      B().set[t.dataset.bcset] = v; api.save(); rer();
    };
  }

  EC.building = { install(a) { api = a; }, view, mount, reamp, _modCheck: (p, k) => modCheck(p, k), _compute: compute, _memberFactors: (b, R) => memberFactors(b, R) };
})();
