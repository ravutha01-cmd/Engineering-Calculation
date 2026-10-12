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

/* 3. kit tools (js/analysis/tools_*.js): plan, handles and one run per combination through the worksheet */
require(path.join(root, 'js/analysis/kit.js'));
for (const f of fs.readdirSync(path.join(root, 'js/analysis')).filter(f => /^tools_.*\.js$/.test(f))) require(path.join(root, 'js/analysis', f));
const K = EC.analysisKit;
for (const spec of EC.analysisSpecs || []) {
  eval(fs.readFileSync(path.join(root, 'sheets', spec.sheet + '.js'), 'utf8'));
  const doc = D, errs = [];
  const missing = spec.loads.filter(n => !(doc.inputs || []).some(i => i.n === n));
  if (missing.length) errs.push('load inputs not in the worksheet: ' + missing.join(', '));
  const m = K.newModel(spec, doc, {});
  m.combos.push({ name: 'ULS 2', L: Object.fromEntries(Object.entries(m.combos[0].L).map(([k, v]) => [k, v * 1.1])) });
  const v = K.values(doc, {}), P = spec.plan(v);
  if (!P.shapes.length || P.shapes.some(s => (s.t === 'line' ? s.pts.flat() : [s.x, s.y, s.w != null ? s.w : s.d]).some(x => !Number.isFinite(x)))) errs.push('plan has no or non-finite shapes');
  if (spec.check && spec.check(v)) errs.push('default inputs fail check(): ' + spec.check(v));
  const edits = {};
  (P.handles || []).forEach((h, i) => { const ch = h.set(100, 100) || {}; Object.keys(ch).forEach(n => { if (!v.has(n)) errs.push(`handle ${i} sets unknown input ${n}`); else if (!Number.isFinite(ch[n])) errs.push(`handle ${i} gives ${n} = ${ch[n]}`); else edits[n] = v.ast(n, v.unit(n) in { mm: 1, cm: 1, m: 1 } ? v.fromMM(n, ch[n]) : ch[n]); }); });
  const runs = m.combos.map((c, ci) => EC.mcadc.compute(doc, K.comboInputs(spec, doc, m, ci)));
  runs.forEach((r, ci) => { if (r.errors) errs.push(`combination ${ci + 1}: ${r.errors} worksheet errors`); });
  const r2 = EC.mcadc.compute(doc, Object.assign({}, edits, K.comboInputs(spec, doc, m, 0)));
  if (r2.errors) errs.push('after dragging every handle: ' + r2.errors + ' worksheet errors');
  if (runs[1] && runs[0].summary.Umax != null && !(runs[1].summary.Umax >= runs[0].summary.Umax - 1e-9)) errs.push('loads × 1.1 lowered U_max - loads not reaching the worksheet?');
  if (errs.length) fail++;
  console.log((errs.length ? 'FAIL ' : 'ok   ') + ('kit ' + spec.k).padEnd(30) + ` ${spec.sheet}  U ${runs.map(r => r.summary.Umax == null ? '-' : r.summary.Umax.toFixed(3)).join(' / ')}` + (errs.length ? '\n     ' + errs.join('\n     ') : ''));
}
process.exit(fail ? 1 : 0);
