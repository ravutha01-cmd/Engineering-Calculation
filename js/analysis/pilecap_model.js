/* Foundation analysis - pile caps: the drawn model (piles, columns, walls, load combinations) and its
 * conversion into the input tables of the Mathcad worksheet PileCap_Multi_EC2-2023_Standalone.mcdx.
 * No design formula lives here: the worksheet does the whole design. This file only turns the drawing
 * into the worksheet's own inputs (pile coordinates, load nodes), as the worksheet asks for them:
 *   piles      x_p, y_p                       (mm, global axes)
 *   load nodes x_n, y_n, T_n (1 Column / 2 Wall), w_xn, w_yn (footprint), N_n, M_yn, M_xn, H_xn, H_yn
 * A wall is typed "as several nodes, each with the load of its segment" (worksheet 1.3): it is cut into
 * segments of at most `seg` mm; N, H and the out-of-plane moment are shared by length, the in-plane
 * moment becomes a statically equivalent linear share of N (ΣN_i·e_i = M). Pure functions - also run in Node. */
(function (root) {
  'use strict';
  const EC = root.EC = root.EC || {};
  const SHEET = 'PileCap_Multi_EC2-2023_Standalone';
  const GEOM = ['x_p', 'y_p', 'x_n', 'y_n', 'T_n', 'w_xn', 'w_yn', 'N_n', 'M_yn', 'M_xn', 'H_xn', 'H_yn'];
  const LOADK = ['N', 'Mx', 'My', 'Hx', 'Hy'];
  const r1 = x => Math.round(x * 1000) / 1000;
  let seq = 0;
  const nid = p => p + Date.now().toString(36).slice(-4) + (seq++).toString(36);
  const zeroL = () => ({ N: 0, Mx: 0, My: 0, Hx: 0, Hy: 0 });

  /* load of an object for combination ci (missing entries = 0) */
  function loadOf(o, ci) { const l = (o.L || [])[ci] || {}; const z = zeroL(); LOADK.forEach(k => { z[k] = +l[k] || 0; }); return z; }
  function setLoad(o, ci, k, v) { o.L = o.L || []; while (o.L.length <= ci) o.L.push(zeroL()); o.L[ci][k] = v; }

  const isHoriz = w => Math.abs(w.x2 - w.x1) >= Math.abs(w.y2 - w.y1);
  const wallLen = w => (isHoriz(w) ? Math.abs(w.x2 - w.x1) : Math.abs(w.y2 - w.y1));

  /* load nodes of the worksheet for combination ci */
  function nodes(m, ci) {
    const out = [];
    (m.cols || []).forEach(c => { const l = loadOf(c, ci); out.push({ src: c.id, kind: 'col', x: c.x, y: c.y, T: 1, wx: c.bx, wy: c.by, N: l.N, Mx: l.Mx, My: l.My, Hx: l.Hx, Hy: l.Hy }); });
    (m.walls || []).forEach(w => {
      const l = loadOf(w, ci), h = isHoriz(w), L = Math.max(wallLen(w), 1);
      const n = Math.max(1, Math.ceil(L / Math.max(100, m.seg || 1000) - 1e-9)), Li = L / n;
      const a = h ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), c0 = h ? (w.y1 + w.y2) / 2 : (w.x1 + w.x2) / 2;
      const mid = a + L / 2;
      const Mip = h ? l.My : l.Mx;                          // in-plane moment (M_y for a wall along x, M_x along y)
      let I = 0; for (let i = 0; i < n; i++) { const e = a + (i + 0.5) * Li - mid; I += Li * e * e; }
      for (let i = 0; i < n; i++) {
        const s = a + (i + 0.5) * Li, e = s - mid, f = Li / L;
        const dN = n > 1 && I > 0 ? Mip * Li * e / I * 1000 : 0;   // kNm·mm/mm² -> kN (×1000 mm/m)
        out.push({
          src: w.id, kind: 'wall', seg: i, x: h ? s : c0, y: h ? c0 : s, T: 2, wx: h ? Li : w.t, wy: h ? w.t : Li,
          N: l.N * f + dN,
          My: h ? (n > 1 ? 0 : l.My) : l.My * f,
          Mx: h ? l.Mx * f : (n > 1 ? 0 : l.Mx),
          Hx: l.Hx * f, Hy: l.Hy * f
        });
      }
    });
    return out;
  }

  const vec = (a, u) => { const M = ['M', a.length, 1, a.map(r1)]; return u ? ['o', '*', M, u] : M; };
  const U = { mm: ['u', 'mm'], kN: ['u', 'kN'], kNm: ['o', '*', ['u', 'kN'], ['u', 'm']] };
  /* worksheet overrides (same form as typed in the input tables) */
  function inputs(m, ci) {
    const P = m.piles || [], N = nodes(m, ci);
    return {
      x_p: vec(P.map(p => p.x), U.mm), y_p: vec(P.map(p => p.y), U.mm),
      x_n: vec(N.map(n => n.x), U.mm), y_n: vec(N.map(n => n.y), U.mm), T_n: vec(N.map(n => n.T)),
      w_xn: vec(N.map(n => n.wx), U.mm), w_yn: vec(N.map(n => n.wy), U.mm),
      N_n: vec(N.map(n => n.N), U.kN), M_yn: vec(N.map(n => n.My), U.kNm), M_xn: vec(N.map(n => n.Mx), U.kNm),
      H_xn: vec(N.map(n => n.Hx), U.kN), H_yn: vec(N.map(n => n.Hy), U.kN)
    };
  }
  /* total actions about the origin (statics check of the node conversion) */
  function resultant(m, ci) {
    let N = 0, Mx = 0, My = 0, Hx = 0, Hy = 0;
    nodes(m, ci).forEach(n => { N += n.N; Hx += n.Hx; Hy += n.Hy; My += n.My + n.N * n.x / 1000; Mx += n.Mx + n.N * n.y / 1000; });
    return { N, Mx, My, Hx, Hy, x: N ? My / N * 1000 : 0, y: N ? Mx / N * 1000 : 0 };
  }
  function problems(m) {
    const p = [];
    if (!(m.piles || []).length) p.push('Add at least one pile.');
    if (!(m.cols || []).length && !(m.walls || []).length) p.push('Add a column or a wall (the load nodes).');
    if (!(m.combos || []).length) p.push('Add a load combination.');
    return p;
  }

  /* standard layouts: s = pile spacing, d = pile size (mm) */
  const TEMPLATES = [
    { k: 'p1', n: 'Single pile', piles: s => [[0, 0]] },
    { k: 'p2', n: '2 piles', piles: s => [[-s / 2, 0], [s / 2, 0]] },
    { k: 'p3', n: '3 piles (triangle)', piles: s => [[-s / 2, -s / (2 * Math.sqrt(3))], [s / 2, -s / (2 * Math.sqrt(3))], [0, s / Math.sqrt(3)]] },
    { k: 'p4', n: '4 piles', piles: s => [[-s / 2, -s / 2], [s / 2, -s / 2], [-s / 2, s / 2], [s / 2, s / 2]] },
    { k: 'p5', n: '5 piles (quincunx)', piles: s => { const a = s / Math.SQRT2; return [[-a, -a], [a, -a], [0, 0], [-a, a], [a, a]]; } },
    { k: 'p6', n: '6 piles (2 × 3)', piles: s => [[-s, -s / 2], [0, -s / 2], [s, -s / 2], [-s, s / 2], [0, s / 2], [s, s / 2]] },
    { k: 'p7', n: '7 piles (hexagon)', piles: s => [[0, 0]].concat([0, 60, 120, 180, 240, 300].map(t => [s * Math.cos(t * Math.PI / 180), s * Math.sin(t * Math.PI / 180)])) },
    { k: 'p8', n: '8 piles (3-2-3)', piles: s => [[-s, -s], [0, -s], [s, -s], [-s, 0], [s, 0], [-s, s], [0, s], [s, s]] },
    { k: 'p9', n: '9 piles (3 × 3)', piles: s => { const o = []; for (const y of [-s, 0, s]) for (const x of [-s, 0, s]) o.push([x, y]); return o; } },
    { k: 'p12', n: '12 piles (3 × 4)', piles: s => { const o = []; for (const y of [-s, 0, s]) for (const x of [-1.5 * s, -0.5 * s, 0.5 * s, 1.5 * s]) o.push([x, y]); return o; } },
    { k: 'wall', n: 'Wall on 2 rows of piles', piles: s => { const o = []; for (const y of [-s / 2, s / 2]) for (const x of [-1.5 * s, -0.5 * s, 0.5 * s, 1.5 * s]) o.push([x, y]); return o; }, wall: s => ({ x1: -1.5 * s, y1: 0, x2: 1.5 * s, y2: 0, t: 300 }) },
    { k: 'comb', n: 'Two columns (combined cap)', piles: s => { const o = []; for (const y of [-s / 2, s / 2]) for (const x of [-1.5 * s, -0.5 * s, 0.5 * s, 1.5 * s]) o.push([x, y]); return o; }, cols: s => [[-s, 0], [s, 0]] },
    { k: 'core', n: 'Core: walls + column', piles: s => { const o = []; for (const y of [-s, 0, s]) for (const x of [-s, 0, s]) o.push([x, y]); return o; }, walls: s => [{ x1: -s, y1: -s / 2, x2: s, y2: -s / 2, t: 300 }, { x1: -s, y1: s / 2, x2: s, y2: s / 2, t: 300 }], cols: s => [[0, 0]] }
  ];
  /* new model from a template; NRd = design pile resistance (kN), d = pile size (mm), k = spacing / size */
  function fromTemplate(k, o) {
    o = Object.assign({ d: 600, k: 3, NRd: 2800, snap: 50 }, o || {});
    const t = TEMPLATES.find(x => x.k === k) || TEMPLATES[3];
    const s = Math.round(o.k * o.d / 50) * 50;
    const snap = v => Math.round(v / 5) * 5;
    const m = { tool: 'pilecap', v: 1, snap: o.snap, seg: 1000, combos: [{ name: 'ULS 1' }], view: 'gov', piles: [], cols: [], walls: [] };
    t.piles(s).forEach(([x, y]) => m.piles.push({ id: nid('p'), x: snap(x), y: snap(y) }));
    const nP = m.piles.length, Ntot = Math.round(0.6 * nP * o.NRd / 100) * 100;
    const walls = t.walls ? t.walls(s) : t.wall ? [t.wall(s)] : [];
    const cols = t.cols ? t.cols(s) : walls.length ? [] : [[0, 0]];
    const parts = cols.length + walls.length;
    cols.forEach(([x, y]) => m.cols.push({ id: nid('c'), x: snap(x), y: snap(y), bx: Math.max(400, o.d), by: Math.max(400, o.d), L: [{ N: Math.round(Ntot / parts / 10) * 10, Mx: 0, My: 0, Hx: 0, Hy: 0 }] }));
    walls.forEach(w => m.walls.push(Object.assign({ id: nid('w') }, w, { x1: snap(w.x1), x2: snap(w.x2), y1: snap(w.y1), y2: snap(w.y2), L: [{ N: Math.round(Ntot / parts / 10) * 10, Mx: 0, My: 0, Hx: 0, Hy: 0 }] })));
    return m;
  }
  function addCombo(m, name, copyFrom) {
    const ci = m.combos.length;
    m.combos.push({ name: name || 'ULS ' + (ci + 1) });
    [].concat(m.cols || [], m.walls || []).forEach(o => { const src = copyFrom != null ? loadOf(o, copyFrom) : zeroL(); o.L = o.L || []; while (o.L.length < ci) o.L.push(zeroL()); o.L[ci] = src; });
    return ci;
  }
  function delCombo(m, ci) {
    if (m.combos.length <= 1) return;
    m.combos.splice(ci, 1);
    [].concat(m.cols || [], m.walls || []).forEach(o => { if (o.L) o.L.splice(ci, 1); });
    if (typeof m.view === 'number' && m.view >= m.combos.length) m.view = 'gov';
  }

  EC.pilecapModel = { SHEET, GEOM, LOADK, nodes, inputs, resultant, problems, TEMPLATES, fromTemplate, addCombo, delCombo, loadOf, setLoad, isHoriz, wallLen, nid, zeroL };
})(typeof window !== 'undefined' ? window : globalThis);
