/* Regression test: run every worksheet with its own values and with an edited input.
   Usage: node tools/test_sheets.js            (skips Slope: ~15 s)  */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'js/mcad/engine.js')); require(path.join(root, 'js/mcad/compute.js'));
let D; global.EC_SHEET = (n, d) => { D = d; };
const EXPECT_ERR = /ETABS|HandInput/; // need ETABS / Excel tables or have an overloaded default case
let fail = 0;
for (const f of fs.readdirSync(path.join(root, 'sheets')).filter(f => f.endsWith('.js'))) {
  if (/Slope/.test(f) && !process.argv.includes('--all')) continue;
  eval(fs.readFileSync(path.join(root, 'sheets', f), 'utf8'));
  const a = EC.mcadc.compute(D, {});
  const num = (D.inputs || []).find(i => i.kind === 'num' && i.v > 0);
  const b = num ? EC.mcadc.compute(D, { [num.n]: num.u ? ['o', '*', num.v * 1.1, num.u] : num.v * 1.1 }) : a;
  const bad = a.errors && !EXPECT_ERR.test(f);
  if (bad) fail++;
  console.log((bad ? 'FAIL ' : 'ok   ') + f.padEnd(52) + ' errors ' + a.errors + '  Umax ' + (a.summary.Umax == null ? '-' : a.summary.Umax.toFixed(3)) + (num ? '  edit ' + num.n + ' -> ' + (b.summary.Umax == null ? '-' : b.summary.Umax.toFixed(3)) : ''));
}
process.exit(fail ? 1 : 0);
