/* Browser check of every design analysis tool (headless Chromium via Playwright).
   Serves the app, signs in as Demo, creates one analysis per tool, drags the first handle, adds a combination
   and fails on any page error, console error, worksheet error or horizontal scroll at phone width.
   Usage: node tools/test_analysis_ui.js [toolKey ...]      (needs Playwright; Chromium at /opt/pw-browsers) */
const path = require('path'), http = require('http'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0].split('#')[0]) || '/'); const p = f.endsWith('/') ? f + 'index.html' : f; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = 'http://localhost:' + srv.address().port + '/';
  const b = await pw.chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? {} : {});
  const pg = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; pg.on('pageerror', e => errs.push('page error: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(url); await pg.click('[data-a="demo"]'); await pg.waitForTimeout(1200);
  await pg.goto(url + '#/analysis'); await pg.waitForTimeout(500);
  const want = process.argv.slice(2);
  const keys = (await pg.$$eval('[data-atnew]', bs => bs.map(x => x.dataset.atnew))).filter(k => !want.length || want.includes(k));
  let fail = 0;
  for (const k of keys) {
    const e0 = errs.length, notes = [];
    await pg.goto(url + '#/analysis'); await pg.waitForTimeout(400);
    await pg.click(`[data-atnew="${k}"]`); await pg.waitForTimeout(600);
    if (await pg.$('.modal [data-tk]')) { await pg.click('.modal [data-tk]'); }               // tools with a template picker
    await pg.waitForFunction(() => document.querySelector('#akRes .big, #atRes .big, .at-msg'), null, { timeout: 30000 }).catch(() => notes.push('no result within 30 s'));
    const U0 = await pg.evaluate(() => (document.querySelector('#akRes .big, #atRes .big') || {}).innerText || '');
    const h = await pg.$('[data-akh="0"]');
    if (h) { const bb = await h.boundingBox(); await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await pg.mouse.down(); await pg.mouse.move(bb.x + bb.width / 2 + 30, bb.y + bb.height / 2 - 20, { steps: 4 }); await pg.mouse.up(); await pg.waitForTimeout(2500); }
    const add = await pg.$('[data-akadd], [data-atcadd]');
    if (add) { await add.click(); await pg.waitForTimeout(3500); }
    const st = await pg.evaluate(() => {
      const runs = (document.querySelector('#akRes, #atRes') || {}).innerText || '';
      const sum = document.querySelector('#out .verdict-banner');
      return { runs, out: sum ? sum.innerText : '', wsErr: /regions with errors/.test(sum ? sum.innerText : ''), msg: (document.querySelector('.at-msg') || {}).innerText || '' };
    });
    if (st.msg) notes.push('message: ' + st.msg);
    if (st.wsErr) notes.push('worksheet regions with errors: ' + st.out.split('\n')[1]);
    if (!/2 worksheet runs/.test(st.runs)) notes.push('expected 2 worksheet runs after adding a combination');
    await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(500);
    if (await pg.evaluate(() => document.querySelector('#main').scrollWidth > document.querySelector('#main').clientWidth + 1)) notes.push('horizontal scroll at 390 px');
    await pg.setViewportSize({ width: 1400, height: 950 });
    errs.slice(e0).forEach(x => notes.push(x));
    if (notes.length) fail++;
    console.log((notes.length ? 'FAIL ' : 'ok   ') + k.padEnd(16) + ' ' + U0.replace(/\s+/g, ' ') + (notes.length ? '\n     ' + notes.join('\n     ') : ''));
  }
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
