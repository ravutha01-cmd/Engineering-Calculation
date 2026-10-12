/* Design analysis tools: run every pile-cap template through the Mathcad worksheet and check that the
   drawing -> worksheet input conversion keeps the statics (walls cut into nodes).
   Usage: node tools/test_analysis.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'js/mcad/engine.js')); require(path.join(root, 'js/mcad/compute.js'));
require(path.join(root, 'js/analysis/pilecap_model.js'));
const PM = EC.pilecapModel;
let D; global.EC_SHEET = (n, d) => { D = d; };
eval(fs.readFileSync(path.join(root, 'sheets', PM.SHEET + '.js'), 'utf8'));
let fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6) * Math.max(1, Math.abs(a), Math.abs(b));
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL ' + msg); } };

/* 1. statics of the wall -> node conversion */
const m = { seg: 1000, combos: [{ name: 'A' }], piles: [{ id: 'p', x: 0, y: 0 }], cols: [],
  walls: [{ id: 'w1', x1: -2500, y1: 400, x2: 2500, y2: 400, t: 300, L: [{ N: 3000, Mx: 120, My: 900, Hx: 50, Hy: -20 }] },
    { id: 'w2', x1: 1000, y1: -1800, x2: 1000, y2: 1200, t: 250, L: [{ N: 1500, Mx: -400, My: 60, Hx: 0, Hy: 30 }] }] };
const ns = PM.nodes(m, 0);
const want = { N: 4500, Hx: 50, Hy: 10,
  My: 900 + 3000 * 0 + 60 + 1500 * 1.0,             // M_y about the origin: own moments + N·x
  Mx: 120 + 3000 * 0.4 + -400 + 1500 * (-0.3) };    // M_x about the origin: own moments + N·y (wall 2 centre y = -300)
const got = PM.resultant(m, 0);
['N', 'Mx', 'My', 'Hx', 'Hy'].forEach(k => check(near(got[k], want[k], 1e-9), `wall statics ${k}: ${got[k]} vs ${want[k]}`));
check(ns.filter(n => n.src === 'w1').length === 5 && ns.filter(n => n.src === 'w2').length === 3, 'wall segments 5 + 3');
check(ns.every(n => n.T === 2), 'wall nodes are type Wall (T_n = 2)');
console.log('ok   wall -> nodes statics (N, M_x, M_y, H_x, H_y)');

/* 2. every template through the worksheet */
const flat = EC.mcadc.flatten(D), idx = {};
flat.forEach((r, i) => { if (r.k === 'm' && r.e[0] === 'def' && r.e[1][0] === 'v') idx[r.e[1][1]] = i; });
for (const t of PM.TEMPLATES) {
  const mm = PM.fromTemplate(t.k, { d: 600, k: 3, NRd: 2800 });
  const r = EC.mcadc.compute(D, PM.inputs(mm, 0));
  const R = r.vals[idx.R_i] && r.vals[idx.R_i].v;
  const nR = R ? R.m[0] : 0, sumR = R ? R.cells.reduce((s, c) => s + c.n, 0) : NaN;
  const res = PM.resultant(mm, 0);
  const foot = r.summary.rows.find(x => /footprints/i.test(x.item));
  const ok = !r.errors && nR === mm.piles.length && sumR >= res.N && foot && /^OK/.test(foot.st);     // ΣR = ΣN + γ_G·G_cap; loads inside the cap
  if (!ok) fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + t.n.padEnd(30) + ` piles ${mm.piles.length}  nodes ${PM.nodes(mm, 0).length}  errors ${r.errors}  ΣR ${sumR.toFixed(0)} kN  ΣN ${res.N.toFixed(0)} kN  Umax ${r.summary.Umax == null ? '-' : r.summary.Umax.toFixed(3)}  ${r.summary.result}`);
}
process.exit(fail ? 1 : 0);
