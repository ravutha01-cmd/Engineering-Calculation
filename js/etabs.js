/* ETABS link: read the analysis results straight from the running ETABS model through the CSI API
 * (tools/etabs_bridge/etabs_bridge.py serves them on 127.0.0.1), or - offline - from an exported table
 * (Element Forces - Beams / Columns, Pier Forces, Joint Reactions; Excel, CSV or pasted), envelope the forces of each member over the
 * selected load combinations and create / update linked design elements. The elements use the native
 * Eurocode calculations (js/calc/*), so the report has the same format as every other calculation:
 * label + clause on the left; formula, substituted values and bold result on the right.
 * Units: everything is converted to kN, kN·m and m. */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  let api = null;
  const S = { tables: [], file: '', combos: {}, sel: {}, msg: '' };   // combos: name -> 'uls' | 'sls' | 'qp' | 'off'

  /* ---------- live link to ETABS (CSI API through the local bridge) ---------- */
  const LKEY = 'cambo.etabs.bridge';
  const L = { url: 'http://127.0.0.1:5480', st: null, model: null, pick: {}, kinds: { beams: true, columns: true, braces: true, piers: true, reactions: true }, busy: '', err: '', sel: null, selErr: '' };
  try { const v = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (v && v.url) L.url = v.url; if (v && v.kinds) Object.assign(L.kinds, v.kinds); } catch (e) {}
  const keepL = () => { try { localStorage.setItem(LKEY, JSON.stringify({ url: L.url, kinds: L.kinds })); } catch (e) {} };
  async function bget(path) {
    let r;
    try { r = await fetch(L.url.replace(/\/+$/, '') + path, { cache: 'no-store' }); }
    catch (e) { throw new Error('ETABS link not running on ' + L.url + ' - start tools/etabs_bridge/start_etabs_link.bat on the computer with ETABS (Chrome or Edge).'); }
    const j = await r.json().catch(() => ({ error: 'Bad answer from the ETABS link (HTTP ' + r.status + ')' }));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  async function connect(pid) {
    L.st = await bget(pid === undefined ? '/status' : '/connect?pid=' + pid); L.model = await bget('/model');
    L.sel = null; pollSel(true);
    const prev = L.pick; L.pick = {};
    L.model.combos.forEach(c => { L.pick[c] = c in prev ? prev[c] : true; });
    L.model.cases.forEach(c => { L.pick[c] = c in prev ? prev[c] : false; });
  }
  async function readLive(onlySel) {
    const names = Object.keys(L.pick).filter(c => L.pick[c]);
    if (!names.length) throw new Error('Select at least one load combination');
    const q = names.map(c => 'c=' + encodeURIComponent(c)).concat(Object.keys(L.kinds).filter(k => L.kinds[k]).map(k => 'k=' + k)).join('&');
    const j = await bget('/results?' + q + (onlySel ? '&sel=1' : ''));
    if (!j.tables.length) throw new Error(onlySel ? 'ETABS returned no results for the selected members - run the analysis (F5) and tick their result types below.' : 'ETABS returned no results for the selected combinations - run the analysis first (F5).');
    S.file = (onlySel ? 'ETABS selection · ' : 'ETABS live · ') + String(j.file || '').split(/[\\/]/).pop();
    ingest(j.tables.map(t => [t.rows, t.name]));
  }
  /* members selected in the ETABS window, watched while the ETABS page is open */
  let selT = null, selBusy = false;
  const KS = { beams: ['beam', 'beams'], columns: ['column', 'columns'], braces: ['brace', 'braces'], piers: ['wall pier', 'wall piers'], reactions: ['support', 'supports'] };
  function selHtml() {
    const ic = api.ic;
    if (L.selErr) return `<div class="etabs-msg">${esc(L.selErr)}</div>`;
    if (!L.sel) return '<p class="muted">Reading the selection in ETABS…</p>';
    if (!L.sel.length) return `<div class="etabs-sel-empty">${ic('search')}<div><b>Nothing selected in ETABS</b><small>Click beams, columns, wall piers or support joints in the ETABS window - they appear here at once.</small></div></div>`;
    const by = {}; L.sel.forEach(x => { (by[x.kind] = by[x.kind] || []).push(x); });
    const linkedOf = x => api.proj().elements.find(e => e.etabs && e.etabs.story === x.story && e.etabs.label === x.label);
    return `<div class="etabs-sel-sum">${Object.keys(by).map(k => `<span class="badge">${by[k].length} ${KS[k][by[k].length > 1 ? 1 : 0]}</span>`).join('')}</div>
      <div class="etabs-chips">${L.sel.slice(0, 40).map(x => { const e = linkedOf(x); return `<span class="chip sel" title="${esc(KS[x.kind][0])}${e ? ' · linked to ' + esc(e.mark) : ''}"><b>${esc(x.label)}</b>${esc(x.story)}${e ? ' <i>linked</i>' : ''}</span>`; }).join('')}${L.sel.length > 40 ? `<span class="muted">+${L.sel.length - 40} more</span>` : ''}</div>`;
  }
  async function pollSel(now) {
    clearTimeout(selT); selT = null;
    if (!L.st || !/^#\/?etabs\b/.test(location.hash)) return;
    if (!selBusy && !L.busy) {
      selBusy = true;
      try { const j = await bget('/selection'); const was = JSON.stringify(L.sel); L.sel = j.items || []; L.selErr = ''; if (was !== JSON.stringify(L.sel)) paintSel(); }
      catch (e) { if (L.selErr !== e.message) { L.selErr = e.message; paintSel(); } }
      selBusy = false;
    }
    selT = setTimeout(pollSel, now === true ? 1500 : 2000);
  }
  function paintSel() {
    const box = document.getElementById('etSel'); if (box) box.innerHTML = selHtml();
    const b = document.querySelector('[data-et="design"]'); if (b) { const n = (L.sel || []).length; b.disabled = !n || !!L.busy; b.lastChild.textContent = n ? `Design ${n} selected member(s)` : 'Design selected members'; }
  }
  /* selection -> results -> linked elements, in one step */
  async function designSelection() {
    await readLive(true);
    let nNew = 0, nUpd = 0;
    S.tables.forEach((t, ti) => { const r = apply(ti, true); nNew += r.nNew; nUpd += r.nUpd; });
    return `${nNew} element(s) created, ${nUpd} updated from the ETABS selection`;
  }
  /* popup: find the running ETABS windows and pick the one to link */
  function openConnect(rer) {
    const ic = api.ic;
    const bg = api.modal('Connect to ETABS', `<div class="etc">
      <p class="muted" style="margin:0 0 12px">Links this app to an ETABS window on this computer through the CSI API. Keep <b>start_etabs_link.bat</b> running.</p>
      <div class="etabs-conn" style="padding:0 0 12px"><label>ETABS link address<input class="ctl" id="etcUrl" value="${esc(L.url)}" spellcheck="false"></label><button class="btn" data-etc="scan">${ic('search')}Find ETABS</button></div>
      <div id="etcList"></div></div>`, () => { const r = bg.querySelector('input[name="etcPid"]:checked'); if (!r) return false; go(+r.value); return false; }, 'Connect');
    const list = bg.querySelector('#etcList'), okB = bg.querySelector('[data-ok]');
    const setup = open => `<details class="etabs-how" ${open ? 'open' : ''}><summary>${ic('gear')}Set up the live link (once per computer)</summary><ol>
      <li>On the Windows computer with ETABS (v18 or later), install <a href="https://www.python.org/downloads/" target="_blank" rel="noopener">Python 3</a> (tick <i>Add to PATH</i>).</li>
      <li>Download <a href="tools/etabs_bridge/etabs_bridge.py" download>etabs_bridge.py</a> and <a href="tools/etabs_bridge/start_etabs_link.bat" download>start_etabs_link.bat</a> into one folder.</li>
      <li>Open the model in ETABS and run the analysis, then double-click <b>start_etabs_link.bat</b> (it installs <code>comtypes</code> the first time) and leave the window open.</li>
      <li>Click <b>Find ETABS</b> (Chrome or Edge). The link reads the model only on this computer (127.0.0.1) and never changes it.</li></ol></details>`;
    const scan = async () => {
      L.url = bg.querySelector('#etcUrl').value.trim() || L.url; keepL();
      list.innerHTML = '<p class="muted">Looking for ETABS…</p>'; okB.disabled = true;
      try {
        const xs = (await bget('/instances')).instances || [];
        if (!xs.length) { list.innerHTML = `<div class="etabs-msg">The ETABS link is running, but no ETABS window is open. Open the model in ETABS and click Find ETABS again.</div>`; return; }
        const cur = L.st ? L.st.pid : null;
        list.innerHTML = `<div class="etc-list" role="radiogroup" aria-label="ETABS windows">${xs.map((x, i) => `<label class="etc-it"><input type="radio" name="etcPid" value="${x.pid}" ${(cur ? x.pid === cur : i === 0) ? 'checked' : ''}>${ic('layers')}<span><b>${esc(String(x.file).split(/[\\/]/).pop())}</b><small>${esc(x.file)}${x.pid ? ' · process ' + x.pid : ''}</small></span>${L.st && x.pid === cur ? '<span class="badge">linked</span>' : ''}</label>`).join('')}</div>`;
        okB.disabled = false;
      } catch (e) { list.innerHTML = `<div class="etabs-msg">${esc(e.message)}</div>${setup(true)}`; }
    };
    const go = async pid => {
      okB.disabled = true; okB.textContent = 'Connecting…';
      try { await connect(pid); bg.remove(); api.toast('Connected to ' + String(L.st.file).split(/[\\/]/).pop()); L.err = ''; rer(); }
      catch (e) { list.insertAdjacentHTML('beforeend', `<div class="etabs-msg">${esc(e.message)}</div>`); okB.disabled = false; okB.textContent = 'Connect'; }
    };
    bg.querySelector('[data-etc="scan"]').onclick = scan;
    bg.querySelector('#etcUrl').onkeydown = ev => { if (ev.key === 'Enter') scan(); };
    list.addEventListener('dblclick', ev => { const r = ev.target.closest('.etc-it'); if (r) go(+r.querySelector('input').value); });
    scan();
  }
  /* re-read and push the new governing forces into every element already linked (keeps section / bar edits) */
  function syncLinked() {
    const p = api.proj(); let n = 0;
    S.tables.forEach((t, ti) => {
      const keep = S.sel[ti];
      TARGETS[t.kind].forEach(tg => {
        if (!p.elements.some(e => e.etabs && e.type === tg.t)) return;
        S.sel[ti] = { target: tg.t, tpl: '', rows: null };
        let ms = []; try { ms = members(ti); } catch (e) { return; }
        ms.forEach(m => {
          const e = p.elements.find(x => x.type === m.target && x.etabs && x.etabs.story === m.story && x.etabs.label === m.label); if (!e) return;
          Object.assign(e.inputs, m.gov.inputs); if (EC.building) EC.building.reamp(e);
          e.etabs = linkOf(t, m); e.u = Date.now(); n++;
        });
      });
      S.sel[ti] = keep;
    });
    api.save();
    return n;
  }

  /* ---------- reading files ---------- */
  let xlsxP = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxP) return xlsxP;
    xlsxP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Could not load the Excel reader - check the internet connection, or export CSV from ETABS')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }
  function splitText(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return [];
    const head = lines.slice(0, 5).join('\n');
    const d = (head.match(/\t/g) || []).length ? '\t' : (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
    return lines.map(l => {
      if (d === '\t') return l.split('\t');
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === d) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur); return out;
    });
  }
  /* a file / paste may hold several ETABS tables, each starting with "TABLE:  <name>" */
  function blocks(rows, fallbackName) {
    const out = []; let cur = null;
    rows.forEach(r => {
      const c0 = String(r[0] == null ? '' : r[0]).trim();
      const m = c0.match(/^TABLE:\s*"?([^"]+)"?/i);
      if (m) { cur = { name: m[1].trim(), rows: [] }; out.push(cur); return; }
      if (!cur) { cur = { name: fallbackName || '', rows: [] }; out.push(cur); }
      cur.rows.push(r);
    });
    return out;
  }

  /* ---------- table recognition ---------- */
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const FORCE = { n: 1e-3, kn: 1, mn: 1e3, kgf: 9.80665e-3, tonf: 9.80665, tf: 9.80665, t: 9.80665, kip: 4.448222, kips: 4.448222, lb: 4.448222e-3, lbf: 4.448222e-3 };
  const LEN = { mm: 1e-3, cm: 1e-2, m: 1, in: 0.0254, ft: 0.3048 };
  function unitFactor(u, kind) {
    const s = String(u || '').toLowerCase().replace(/\s/g, '');
    if (!s) return 1;
    if (kind === 'len') return LEN[s] || 1;
    const p = s.split(/[-·*.]/);
    const f = FORCE[p[0]] || 1;
    return kind === 'mom' ? f * (LEN[p[1]] || 1) : f;
  }
  const COLS = {
    story: ['story'], label: ['beam', 'column', 'pier', 'brace', 'label', 'frame', 'joint', 'spandrel'], uname: ['uniquename'],
    combo: ['outputcase', 'loadcasecombo', 'loadcase', 'combo'], ctype: ['casetype'], step: ['steptype'],
    station: ['station'], loc: ['location'], P: ['p'], V2: ['v2'], V3: ['v3'], T: ['t'], M2: ['m2'], M3: ['m3'],
    FX: ['fx'], FY: ['fy'], FZ: ['fz'], MX: ['mx'], MY: ['my'], MZ: ['mz']
  };
  const KIND = { len: ['station'], mom: ['T', 'M2', 'M3', 'MX', 'MY', 'MZ'] };
  function parseTable(b) {
    const rows = b.rows;
    // header cells may carry their unit: "M3 (kN-m)", "Station [mm]"
    const hn = c => norm(String(c == null ? '' : c).replace(/\s*[([][^)\]]*[)\]]\s*$/, ''));
    const hi = rows.findIndex(r => r.map(hn).includes('story') && r.map(hn).some(c => COLS.combo.includes(c)));
    if (hi < 0) return null;
    const head = rows[hi].map(hn), hu = rows[hi].map(c => (String(c == null ? '' : c).match(/[([]([^)\]]+)[)\]]\s*$/) || [])[1] || '');
    const col = {};
    Object.keys(COLS).forEach(k => { const i = head.findIndex(h => COLS[k].includes(h)); if (i >= 0) col[k] = i; });
    // ETABS writes the units in the row under the header (kN, kN-m, m)
    let start = hi + 1, units = {};
    const ur = rows[hi + 1] || [];
    if (ur.some(c => /^(k?n|mn|kgf|tonf|tf|kips?|lbf?)([-·*.]?(m|mm|cm|in|ft))?$|^(m|mm|cm|in|ft)$/i.test(String(c || '').trim())) && !ur.some(c => typeof c === 'number' || /^-?\d+(\.\d+)?(e-?\d+)?$/.test(String(c || '').trim()))) { start++; Object.keys(col).forEach(k => { units[k] = String(ur[col[k]] || '').trim(); }); }
    Object.keys(col).forEach(k => { if (!units[k] && hu[col[k]]) units[k] = hu[col[k]].trim(); });
    const labelHead = head[col.label] || '';
    const isFrame = col.P !== undefined && col.M3 !== undefined;
    const isReac = col.FZ !== undefined;
    if (!isFrame && !isReac) return null;
    const nm = (b.name || '').toLowerCase();
    const kind = isReac ? 'reactions' : labelHead === 'pier' || /pier/.test(nm) ? 'piers' : labelHead === 'column' || /column/.test(nm) ? 'columns' : labelHead === 'brace' || /brace/.test(nm) ? 'braces' : 'beams';
    const fac = k => unitFactor(units[k], KIND.len.includes(k) ? 'len' : KIND.mom.includes(k) ? 'mom' : 'f');
    const num = v => { const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
    const FK = ['P', 'V2', 'V3', 'T', 'M2', 'M3', 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'].filter(k => col[k] !== undefined);
    const data = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i]; if (!r || r[col.story] == null || String(r[col.story]).trim() === '') continue;
      const o = { story: String(r[col.story]).trim(), label: String(col.label !== undefined ? r[col.label] : r[col.uname] || '').trim(), uname: col.uname !== undefined ? String(r[col.uname] || '') : '',
        combo: String(r[col.combo] || '').trim(), ctype: col.ctype !== undefined ? String(r[col.ctype] || '') : '', step: col.step !== undefined ? String(r[col.step] || '') : '', loc: col.loc !== undefined ? String(r[col.loc] || '') : '' };
      if (FK.every(k => Number.isNaN(num(r[col[k]])))) continue;   // text / sub-header rows: no forces
      ['station'].concat(FK).forEach(k => { if (col[k] !== undefined) { const x = num(r[col[k]]); o[k] = Number.isFinite(x) ? x * fac(k) : 0; } });
      data.push(o);
    }
    if (!data.length) return null;
    return { name: b.name || kind, kind, data, units, labelHead, combos: Array.from(new Set(data.map(d => d.combo))), ctypes: Object.fromEntries(data.map(d => [d.combo, d.ctype])) };
  }
  function guessCombo(name, ctype) {
    const n = name.toUpperCase();
    if (/QP|QUASI/.test(n)) return 'qp';
    if (/SLS|SER|CHAR|FREQ/.test(n)) return 'sls';
    if (ctype && !/comb/i.test(ctype)) return 'off';   // plain load cases: off by default
    return 'uls';
  }
  function ingest(rowsList) {
    const found = [];
    rowsList.forEach(([rows, name]) => blocks(rows, name).forEach(b => { const t = parseTable(b); if (t) found.push(t); }));
    if (!found.length) throw new Error('No ETABS force table found. Export "Element Forces - Beams / Columns", "Pier Forces" or "Joint Reactions" with their header row (Story, …, Output Case, P, V2, V3, T, M2, M3).');
    const hasCombo = found.some(t => t.combos.some(c => /comb/i.test(t.ctypes[c] || '')));
    S.tables = found; S.combos = {}; S.sel = {};
    found.forEach(t => t.combos.forEach(c => { if (!(c in S.combos)) S.combos[c] = hasCombo ? guessCombo(c, t.ctypes[c]) : guessCombo(c, ''); }));
    found.forEach((t, i) => { S.sel[i] = { target: TARGETS[t.kind][0].t, tpl: '', rows: null }; });
  }
  async function readFile(f) {
    S.file = f.name;
    if (/\.(xlsx|xlsm|xls)$/i.test(f.name)) {
      const X = await loadXlsx();
      const wb = X.read(await f.arrayBuffer(), { type: 'array' });
      ingest(wb.SheetNames.map(n => [X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }), n]));
    } else ingest([[splitText(await f.text()), f.name.replace(/\.\w+$/, '')]]);
  }

  /* ---------- design targets & force mapping (kN, kN·m, m) ---------- */
  const len = rs => { const st = rs.map(r => r.station).filter(Number.isFinite); return st.length ? Math.max(...st) - Math.min(...st) : 0; };
  const maxBy = (rs, f) => rs.reduce((a, r) => (a === null || f(r) > f(a) ? r : a), null);
  const byCombo = rs => { const m = new Map(); rs.forEach(r => { const k = r.combo + '|' + r.step; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return Array.from(m.entries()).map(([k, a]) => ({ combo: k.replace(/\|(Max|Min)?$/i, s => (s.length > 1 ? ' ' + s.slice(1) : '')), rows: a })); };
  const ends = rs => { const s = rs.slice().sort((a, b) => a.station - b.station); return { bot: s[0], top: s[s.length - 1] }; };
  const r1 = x => Math.round(x * 10) / 10;
  /* each target returns candidate design cases {combo, inputs, show}; the governing one is chosen by the design itself */
  const TARGETS = {
    beams: [
      { t: 'beam', l: 'RC beam', cases(u, s) {
        const Mp = maxBy(u, r => r.M3), Mn = maxBy(u, r => -r.M3), Vm = maxBy(u, r => Math.abs(r.V2));
        const inp = { MEd: r1(Math.max(0, Mp.M3)), MEdh: r1(Math.max(0, -Mn.M3)), VEd: r1(Math.abs(Vm.V2)) };
        const L = len(u); if (L > 0) inp.L = r1(L * 100) / 100;
        return [{ combo: `M+ ${Mp.combo} · M− ${Mn.combo} · V ${Vm.combo}`, inputs: inp, show: { 'M_Ed,sag': inp.MEd, 'M_Ed,hog': inp.MEdh, V_Ed: inp.VEd } }];
      } },
      { t: 'steel', l: 'Steel beam (I/H)', cases: steelCases }
    ],
    columns: [
      { t: 'column', l: 'RC column', cases(u) {
        return byCombo(u).map(g => { const { bot, top } = ends(g.rows); const L = len(g.rows);
          const inp = { N: r1(Math.max(-bot.P, -top.P)), My1: r1(bot.M3), My2: r1(top.M3), Mz1: r1(bot.M2), Mz2: r1(top.M2) }; if (L > 0) inp.l = r1(L * 100) / 100;
          return { combo: g.combo, inputs: inp, show: { N_Ed: inp.N, 'M_y,bot': inp.My1, 'M_y,top': inp.My2, 'M_z,bot': inp.Mz1, 'M_z,top': inp.Mz2 } }; });
      } },
      { t: 'steel', l: 'Steel column (I/H)', cases: steelCases }
    ],
    braces: [{ t: 'steel', l: 'Steel brace (I/H)', cases: steelCases }],
    piers: [
      { t: 'shearwall', l: 'RC shear wall', cases(u) {
        return byCombo(u).map(g => { const b = g.rows.find(r => /bot/i.test(r.loc)) || maxBy(g.rows, r => Math.abs(r.M3));
          const inp = { N: r1(-b.P), M: r1(Math.abs(b.M3)), V: r1(Math.max(...g.rows.map(r => Math.abs(r.V2)))) };
          return { combo: g.combo, inputs: inp, show: { N_Ed: inp.N, M_Ed: inp.M, V_Ed: inp.V } }; });
      } }
    ],
    reactions: [
      { t: 'footing', l: 'Pad footing', cases(u, s) {
        const k = s.length ? maxBy(s, r => r.FZ) : null;
        return byCombo(u).map(g => { const r = g.rows[0];
          const inp = { NEd: r1(r.FZ), MEx: r1(Math.abs(r.MY)), MEy: r1(Math.abs(r.MX)) };
          if (k) Object.assign(inp, { Nk: r1(k.FZ), Mkx: r1(Math.abs(k.MY)), Mky: r1(Math.abs(k.MX)) });
          return { combo: g.combo, inputs: inp, show: { N_Ed: inp.NEd, 'M_Ed,x': inp.MEx, 'M_Ed,y': inp.MEy } }; });
      } },
      { t: 'punching', l: 'Flat slab punching', cases(u) {
        return byCombo(u).map(g => ({ combo: g.combo, inputs: { VEd: r1(g.rows[0].FZ) }, show: { V_Ed: r1(g.rows[0].FZ) } }));
      } }
    ]
  };
  function steelCases(u) {
    return byCombo(u).map(g => { const P = maxBy(g.rows, r => Math.abs(r.P)), M = maxBy(g.rows, r => Math.abs(r.M3)), V = maxBy(g.rows, r => Math.abs(r.V2)); const L = len(g.rows);
      const inp = { NEd: r1(Math.abs(P.P)), MEd: r1(Math.abs(M.M3)), VEd: r1(Math.abs(V.V2)) }; if (L > 0) inp.L = r1(L * 100) / 100;
      return { combo: g.combo, inputs: inp, show: { N_Ed: inp.NEd, M_Ed: inp.MEd, V_Ed: inp.VEd } }; });
  }

  /* ---------- envelope per member ---------- */
  function members(ti) {
    const t = S.tables[ti], sel = S.sel[ti];
    const tg = TARGETS[t.kind].find(x => x.t === sel.target) || TARGETS[t.kind][0];
    const base = baseInputs(tg.t, sel.tpl);
    const groups = new Map();
    t.data.forEach(r => { const k = r.story + '\u0000' + r.label; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const out = [];
    groups.forEach((rs, k) => {
      const u = rs.filter(r => S.combos[r.combo] === 'uls'), s = rs.filter(r => S.combos[r.combo] === 'sls');
      if (!u.length) return;
      const cs = tg.cases(u, s);
      // an element already linked to this member is designed with its own (possibly edited) section, as apply() keeps it
      const ex = api.proj().elements.find(x => x.type === tg.t && x.etabs && x.etabs.story === rs[0].story && x.etabs.label === rs[0].label);
      const b0 = ex ? Object.assign(defaults(tg.t), JSON.parse(JSON.stringify(ex.inputs || {}))) : base;
      cs.forEach(c => { try { const r = EC.modules[tg.t].calc(Object.assign({}, b0, c.inputs)); c.U = r.Umax; c.ok = r.ok; c.sum = (r.summary || []).reduce((t, x) => t + (Number.isFinite(x.U) ? x.U : 0), 0); } catch (e) { c.U = Infinity; c.ok = false; } });
      const gov = cs.reduce((a, c) => (a === null || c.U > a.U + 1e-9 || (Math.abs(c.U - a.U) <= 1e-9 && c.sum > a.sum) ? c : a), null);   // ties (e.g. detailing governs): most utilised overall
      out.push({ story: rs[0].story, label: rs[0].label, target: tg.t, gov, cases: cs, nCombo: new Set(u.map(r => r.combo)).size });
    });
    return out;
  }
  function baseInputs(type, tplId) {
    const d = defaults(type);
    const tpl = tplId && api.proj().elements.find(e => e.id === tplId);
    return Object.assign(d, tpl ? JSON.parse(JSON.stringify(tpl.inputs || {})) : {});
  }
  function defaults(type) { const o = {}; EC.modules[type].groups.forEach(g => g.f.forEach(f => { o[f.k] = f.cols ? JSON.parse(JSON.stringify(f.d)) : f.d; })); return o; }

  /* ---------- create / update linked elements ---------- */
  const linkOf = (t, m) => ({ file: S.file, table: t.name, story: m.story, label: m.label, combo: m.gov.combo, at: Date.now(),
    cases: m.cases.slice(0, 40).map(c => ({ combo: c.combo, show: c.show, U: Number.isFinite(c.U) ? Math.round(c.U * 1000) / 1000 : null })) });
  function apply(ti, quiet) {
    const t = S.tables[ti], sel = S.sel[ti], p = api.proj();
    const list = members(ti).filter((m, i) => !sel.rows || sel.rows[i] !== false);
    let nNew = 0, nUpd = 0;
    list.forEach(m => {
      const link = linkOf(t, m);
      let e = p.elements.find(x => x.type === m.target && x.etabs && x.etabs.story === m.story && x.etabs.label === m.label);
      if (e) { Object.assign(e.inputs, m.gov.inputs); if (EC.building) EC.building.reamp(e); e.etabs = link; e.u = Date.now(); nUpd++; }
      else {
        e = { id: api.uid(), type: m.target, mark: m.label + (new Set(list.map(x => x.story)).size > 1 ? '-' + m.story : ''), level: m.story, grid: 'ETABS ' + m.label, qty: 1, status: 'In design',
          start: api.today(), due: api.addDays(api.today(), 14), assignee: p.engineer || '', inputs: Object.assign(baseInputs(m.target, sel.tpl), m.gov.inputs), etabs: link };
        p.elements.push(e); nNew++;
      }
    });
    api.save();
    if (quiet) return { nNew, nUpd };
    api.toast(`${nNew} element(s) created, ${nUpd} updated from ETABS`);
    return list.length;
  }

  /* ---------- demo data (ETABS export layout) ---------- */
  function demo() {
    const L = ['TABLE:  Element Forces - Beams', 'Story\tBeam\tUnique Name\tOutput Case\tCase Type\tStep Type\tStation\tP\tV2\tV3\tT\tM2\tM3', '\t\t\t\t\t\tm\tkN\tkN\tkN\tkN-m\tkN-m\tkN-m'];
    const combos = [['ULS1 1.35G+1.5Q', 1], ['ULS2 1.35G+1.05Q+1.5W', 0.86], ['SLS-CHAR G+Q', 0.71], ['SLS-QP G+0.3Q', 0.55]];
    [['Story3', 'B12', 7.2, 1.0], ['Story3', 'B13', 6.0, 0.8], ['Story2', 'B12', 7.2, 1.05]].forEach(([st, b, Lb, k]) => combos.forEach(([c, f]) => {
      for (let i = 0; i <= 4; i++) { const x = Lb * i / 4, w = 48 * k * f; const M = w * x * (Lb - x) / 2 - w * Lb * Lb / 12; const V = w * (Lb / 2 - x);
        L.push([st, b, b === 'B12' ? '101' : '102', c, 'Combination', '', x.toFixed(3), '0', V.toFixed(2), '0', (2.1 * k * f).toFixed(2), '0', M.toFixed(2)].join('\t')); }
    }));
    L.push('TABLE:  Element Forces - Columns', 'Story\tColumn\tUnique Name\tOutput Case\tCase Type\tStep Type\tStation\tP\tV2\tV3\tT\tM2\tM3', '\t\t\t\t\t\tm\tkN\tkN\tkN\tkN-m\tkN-m\tkN-m');
    [['Story2', 'C3', 1], ['Story1', 'C3', 1.6], ['Story1', 'C4', 1.25]].forEach(([st, c, k]) => [['ULS1 1.35G+1.5Q', 1, 0.5], ['ULS2 1.35G+1.05Q+1.5W', 0.82, 1.8], ['SLS-CHAR G+Q', 0.72, 0.4]].forEach(([cb, f, m]) => {
      [0, 1.75, 3.5].forEach((x, i) => L.push([st, c, '20' + c.slice(1), cb, 'Combination', '', x, (-1500 * k * f).toFixed(1), (22 * m).toFixed(1), (9 * m).toFixed(1), '0.4', (16 * m * (1 - i)).toFixed(1), (58 * m * k * (1 - 1.6 * i / 2)).toFixed(1)].join('\t')));
    }));
    L.push('TABLE:  Joint Reactions', 'Story\tLabel\tUnique Name\tOutput Case\tCase Type\tStep Type\tFX\tFY\tFZ\tMX\tMY\tMZ', '\t\t\t\t\t\tkN\tkN\tkN\tkN-m\tkN-m\tkN-m');
    [['Base', 'J1', 1], ['Base', 'J2', 1.3]].forEach(([st, j, k]) => [['ULS1 1.35G+1.5Q', 1, 0.4], ['ULS2 1.35G+1.05Q+1.5W', 0.85, 1.6], ['SLS-CHAR G+Q', 0.72, 0.3]].forEach(([cb, f, m]) =>
      L.push([st, j, '3' + j.slice(1), cb, 'Combination', '', (14 * m).toFixed(1), (8 * m).toFixed(1), (1650 * k * f).toFixed(1), (25 * m).toFixed(1), (48 * m).toFixed(1), '0.2'].join('\t'))));
    S.file = 'ETABS demo export';
    ingest([[splitText(L.join('\n')), 'demo']]);
  }

  /* ---------- page ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KN = { reactions: 'Joint reactions', beams: 'Beam forces', columns: 'Column forces', piers: 'Pier forces', braces: 'Brace forces' };
  const CL = { uls: 'ULS', sls: 'SLS char.', qp: 'SLS q-p', off: 'Not used' };
  function view() {
    const ic = api.ic, fmt = api.fmt;
    const linked = api.proj().elements.filter(e => e.etabs);
    const nLinked = linked.length, busy = L.busy;
    const kindsL = { beams: 'Beams', columns: 'Columns', braces: 'Braces', piers: 'Piers (walls)', reactions: 'Support reactions' };
    const live = !L.st ? `<div class="card etabs-live"><div class="etabs-hero">${ic('upload')}<div><b>Live link to ETABS (API)</b><small>Select members in ETABS and send them to your calculations - no export, no Excel.</small></div>
        <button class="btn primary" data-et="connect">${ic('check')}Connect to ETABS…</button></div>${L.err ? `<div class="etabs-msg">${esc(L.err)}</div>` : ''}</div>`
      : `<div class="card etabs-live on"><div class="card-h"><b><i class="dot"></i>Connected to ${esc(String(L.st.file).split(/[\\/]/).pop())}</b><small>ETABS ${esc(L.st.etabs || '')}${L.st.pid ? ' · process ' + L.st.pid : ''}${L.st.analysed ? ' · analysed' : ' · <span style="color:var(--critical)">not analysed - run the analysis (F5)</span>'}</small>
          <span class="etabs-hbtn"><button class="btn sm" data-et="connect">Change ETABS…</button><button class="btn sm" data-et="disconnect">Disconnect</button></span></div>
        <div class="etabs-selbox"><div class="lbl">${ic('search')}Selected in ETABS <small class="muted">live · select members in the ETABS window</small></div><div id="etSel">${selHtml()}</div>
          <div class="etabs-btns" style="padding:10px 0 2px"><button class="btn primary" data-et="design" ${!(L.sel || []).length || busy ? 'disabled' : ''}>${ic('check')}<span>${busy === 'design' ? 'Designing…' : (L.sel || []).length ? `Design ${L.sel.length} selected member(s)` : 'Design selected members'}</span></button>
          <small class="muted">Reads the forces of the selected members for the ticked combinations, envelopes them and creates / updates their design elements.</small></div></div>
        ${L.err ? `<div class="etabs-msg">${esc(L.err)}</div>` : ''}
        <details class="etabs-pick" ${L.model.combos.length ? '' : 'open'}><summary>${ic('gear')}Combinations &amp; results <small class="muted">${Object.keys(L.pick).filter(c => L.pick[c]).length} of ${L.model.combos.length + L.model.cases.length} ticked</small></summary>
          <div class="lbl">Load combinations <button class="btn sm" data-et="all">All</button><button class="btn sm" data-et="none">None</button></div>
          <div class="etabs-chips">${L.model.combos.map(c => `<label class="chip"><input type="checkbox" data-etpick="${esc(c)}" ${L.pick[c] ? 'checked' : ''}>${esc(c)}</label>`).join('') || '<span class="muted">No load combinations in the model</span>'}</div>
          ${L.model.cases.length ? `<details><summary class="muted">Load cases (${L.model.cases.length})</summary><div class="etabs-chips">${L.model.cases.map(c => `<label class="chip"><input type="checkbox" data-etpick="${esc(c)}" ${L.pick[c] ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></details>` : ''}
          <div class="lbl">Results to read</div><div class="etabs-chips">${Object.keys(kindsL).map(k => `<label class="chip"><input type="checkbox" data-etkind="${k}" ${L.kinds[k] ? 'checked' : ''}>${kindsL[k]}</label>`).join('')}</div></details>
        <div class="etabs-btns"><button class="btn" data-et="read" ${busy ? 'disabled' : ''}>${ic('download')}${busy === 'read' ? 'Reading ETABS…' : 'Read whole model'}</button>
          ${nLinked ? `<button class="btn" data-et="sync" ${busy ? 'disabled' : ''} title="Re-read ETABS and update the forces of the ${nLinked} linked element(s)">${ic('undo')}${busy === 'sync' ? 'Syncing…' : `Sync ${nLinked} linked element(s)`}</button>` : ''}
          <button class="btn" data-et="refresh" ${busy ? 'disabled' : ''}>Refresh combinations</button></div></div>`;
    const how = `<details class="etabs-how"><summary>${ic('book')}How to export from ETABS</summary><ol>
      <li>Run the analysis. <b>Display → Show Tables…</b> (Ctrl+T).</li>
      <li>Tick <b>Analysis → Results → Frame Output → Element Forces - Beams / Element Forces - Columns</b>, <b>Wall Output → Pier Forces</b> and <b>Joint Output → Reactions</b>. Set <b>Load Patterns / Combos</b> to your design combinations.</li>
      <li><b>File → Export to Excel</b> (all tables in one workbook), or open a table, select all and copy (Ctrl+A, Ctrl+C) and paste it below.</li>
      <li>Any ETABS unit set works (kN, kgf, tonf, kip with m, mm, cm, in, ft): the units row is read and everything is converted to kN and m.</li></ol></details>`;
    const load = `<details class="card etabs-offline"><summary>${ic('folder')}No ETABS on this computer? Use an exported table instead</summary><div class="etabs-load"><div class="etabs-drop" id="etDrop" tabindex="0" role="button" aria-label="Choose ETABS export file">${ic('upload')}<div><b>Drop the ETABS export here</b> or <u>choose a file</u><small>Excel (.xlsx) · CSV · text</small></div><input type="file" id="etFile" accept=".xlsx,.xlsm,.xls,.csv,.txt,.tsv" hidden></div>
      <div class="etabs-or"><span>or</span></div>
      <textarea id="etPaste" class="ctl" rows="3" placeholder="Paste a table copied from ETABS (Ctrl+V) - include the header row"></textarea>
      <div class="etabs-btns"><button class="btn primary" data-et="paste">${ic('check')}Read pasted table</button><button class="btn" data-et="demo">${ic('layers')}Try with demo data</button>${S.tables.length ? `<button class="btn" data-et="clear">${ic('x')}Clear</button>` : ''}</div>${how}</div></details>`;
    let body = '';
    if (S.msg) body += `<div class="etabs-msg${/^Reading /.test(S.msg) ? ' info' : ''}" role="status">${esc(S.msg)}</div>`;
    if (S.tables.length) {
      const cs = Object.keys(S.combos);
      body += `<div class="card"><div class="card-h"><b>Load combinations</b><small>${esc(S.file)} · ${S.tables.length} table(s) · click to change the use of a combination</small></div>
        <div class="etabs-combos">${cs.map(c => `<button class="cmb ${S.combos[c]}" data-cmb="${esc(c)}" title="Click: ULS → SLS characteristic → SLS quasi-permanent → not used">${esc(c)}<span>${CL[S.combos[c]]}</span></button>`).join('')}</div></div>`;
      S.tables.forEach((t, ti) => {
        const sel = S.sel[ti], tg = TARGETS[t.kind];
        let ms = []; let err = '';
        try { ms = members(ti); } catch (e) { err = e.message; }
        if (!sel.rows || sel.rows.length !== ms.length) sel.rows = ms.map(() => true);
        const tpls = api.proj().elements.filter(e => e.type === sel.target);
        const keys = ms.length ? Object.keys(ms[0].gov.show) : [];
        body += `<div class="card etabs-tbl"><div class="card-h"><b>${esc(KN[t.kind])}</b><small>“${esc(t.name)}” · ${t.data.length} rows · ${ms.length} members${Object.keys(t.units).length ? ' · units ' + esc(Array.from(new Set(Object.values(t.units).filter(Boolean))).join(', ')) : ''}</small></div>
          <div class="etabs-opts"><label>Design as<select class="ctl" data-ettarget="${ti}">${tg.map(x => `<option value="${x.t}" ${x.t === sel.target ? 'selected' : ''}>${esc(x.l)}</option>`).join('')}</select></label>
          <label>Section, materials &amp; bars from<select class="ctl" data-ettpl="${ti}"><option value="">Default values</option>${tpls.map(e => `<option value="${e.id}" ${e.id === sel.tpl ? 'selected' : ''}>${esc(e.mark)}${e.level ? ' · ' + esc(e.level) : ''}</option>`).join('')}</select></label></div>
          ${err ? `<div class="etabs-msg">${esc(err)}</div>` : ms.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" data-etall="${ti}" ${sel.rows.every(Boolean) ? 'checked' : ''} aria-label="Select all"></th><th>Story</th><th>Member</th><th>Governing combination</th>${keys.map(k => `<th class="num">${EC.sym ? EC.sym(k) : esc(k)}</th>`).join('')}<th>U</th><th></th></tr></thead><tbody>
            ${ms.map((m, i) => { const ex = api.proj().elements.find(x => x.type === m.target && x.etabs && x.etabs.story === m.story && x.etabs.label === m.label);
              return `<tr><td><input type="checkbox" data-etrow="${ti}:${i}" ${sel.rows[i] ? 'checked' : ''} aria-label="Use ${esc(m.label)}"></td><td>${esc(m.story)}</td><td class="mark">${esc(m.label)}</td><td><small>${esc(m.gov.combo)}</small>${m.cases.length > 1 ? `<small class="muted"> · ${m.cases.length} checked</small>` : ''}</td>${keys.map(k => `<td class="num">${fmt(m.gov.show[k], 1)}</td>`).join('')}<td>${api.ubar(m.gov.U)}</td><td>${ex ? `<a href="#/el/${ex.id}" class="badge">linked ${esc(ex.mark)}</a>` : '<span class="badge new">new</span>'}</td></tr>`; }).join('')}
          </tbody></table></div><div class="etabs-btns"><button class="btn primary" data-etapply="${ti}">${ic('check')}Create / update ${sel.rows.filter(Boolean).length} element(s)</button><small class="muted">Forces in kN, kN·m. Linked elements are matched by story + label, so re-importing updates their forces and keeps your section and bar edits.</small></div>`
            : `<p class="muted" style="padding:0 16px 14px">No ULS combination selected for this table.</p>`}</div>`;
      });
    }
    const lk = linked.length ? `<div class="card"><div class="card-h"><b>Linked elements</b><small>${linked.length} element(s) designed from ETABS results</small></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mark</th><th>Design</th><th>Story</th><th>ETABS member</th><th>Governing combination</th><th>Imported</th></tr></thead><tbody>
      ${linked.map(e => `<tr class="click" data-open="${e.id}"><td class="mark">${esc(e.mark)}</td><td>${esc(EC.modules[e.type].name)}</td><td>${esc(e.etabs.story)}</td><td>${esc(e.etabs.label)}</td><td><small>${esc(e.etabs.combo)}</small></td><td><small>${new Date(e.etabs.at).toLocaleString()}</small></td></tr>`).join('')}</tbody></table></div></div>` : '';
    return `<div class="page-head"><div><div class="tool-tag">${ic('upload')}Design with ETABS link</div><h1>Link to ETABS</h1><div class="sub">Design and detail members directly from the ETABS model (CSI API) · RC beams &amp; columns, steel members, shear walls, footings, punching · Eurocodes</div></div>${linked.length ? `<div class="actions"><a class="btn" href="#/linked">${ic('layers')}ETABS-linked elements <span class="badge">${linked.length}</span></a></div>` : ''}</div>${live}${body}${load}${lk}`;
  }
  function mount(root) {
    const rer = () => api.render();
    if (L.st && !selT) pollSel(true);
    const fi = root.querySelector('#etFile'), drop = root.querySelector('#etDrop');
    const go = f => { S.msg = 'Reading ' + f.name + '…'; rer(); readFile(f).then(() => { S.msg = ''; rer(); }, e => { S.msg = e.message; rer(); }); };
    if (drop) {
      drop.onclick = () => fi.click(); drop.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fi.click(); } };
      drop.ondragover = ev => { ev.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = ev => { ev.preventDefault(); drop.classList.remove('over'); const f = ev.dataTransfer.files[0]; if (f) go(f); };
      fi.onchange = () => { if (fi.files[0]) go(fi.files[0]); };
    }
    root.onclick = ev => {
      const b = ev.target.closest('[data-et],[data-cmb],[data-etapply],[data-etall],[data-etrow],[data-etpick],[data-etkind]'); if (!b) return;
      const d = b.dataset;
      const run = (k, f) => { if (L.busy) return; L.busy = k; L.err = ''; rer(); f().then(m => { L.busy = ''; if (m) api.toast(m); rer(); }, e => { L.busy = ''; L.err = e.message; rer(); }); };
      if (d.et === 'connect') return openConnect(rer);
      if (d.et === 'refresh') return run('refresh', () => connect(L.st.pid || 0));
      if (d.et === 'disconnect') { L.st = null; L.model = null; L.sel = null; L.err = ''; clearTimeout(selT); return rer(); }
      if (d.et === 'design') { if (EC.auth && EC.auth.isDemo && EC.auth.isDemo()) api.toast('Demo account: elements are kept until you reload'); return run('design', designSelection); }
      if (d.et === 'read') return run('read', () => readLive().then(() => { S.msg = ''; }));
      if (d.et === 'sync') return run('sync', () => readLive().then(() => { const n = syncLinked(); return `${n} linked element(s) updated from ETABS`; }));
      if (d.et === 'all' || d.et === 'none') { L.model.combos.forEach(c => { L.pick[c] = d.et === 'all'; }); return rer(); }
      if (d.etpick !== undefined) { L.pick[d.etpick] = b.checked; return; }
      if (d.etkind !== undefined) { L.kinds[d.etkind] = b.checked; keepL(); return; }
      if (d.et === 'demo') { demo(); S.msg = ''; return rer(); }
      if (d.et === 'clear') { S.tables = []; S.combos = {}; S.sel = {}; S.msg = ''; S.file = ''; return rer(); }
      if (d.et === 'paste') { const t = root.querySelector('#etPaste').value; try { S.file = 'Pasted table'; ingest([[splitText(t), '']]); S.msg = ''; } catch (e) { S.msg = e.message; } return rer(); }
      if (d.cmb !== undefined) { const o = ['uls', 'sls', 'qp', 'off']; S.combos[d.cmb] = o[(o.indexOf(S.combos[d.cmb]) + 1) % o.length]; return rer(); }
      if (d.etapply !== undefined) { if (EC.auth && EC.auth.isDemo && EC.auth.isDemo()) api.toast('Demo account: elements are kept until you reload'); apply(+d.etapply); return rer(); }
      if (d.etall !== undefined) { const s = S.sel[+d.etall]; s.rows = s.rows.map(() => b.checked); return rer(); }
      if (d.etrow !== undefined) { const [ti, i] = d.etrow.split(':').map(Number); S.sel[ti].rows[i] = b.checked; return rer(); }
    };
    root.onchange = ev => {
      const t = ev.target;
      if (t.dataset.ettarget !== undefined) { S.sel[+t.dataset.ettarget] = { target: t.value, tpl: '', rows: null }; rer(); }
      if (t.dataset.ettpl !== undefined) { S.sel[+t.dataset.ettpl].tpl = t.value; rer(); }
    };
  }
  /* banner on a linked element page */
  function banner(e) {
    if (!e.etabs) return '';
    const L = e.etabs, keys = L.cases && L.cases.length ? Object.keys(L.cases[0].show || {}) : [];
    const cs = (L.cases || []).slice().sort((a, b) => (b.U || 0) - (a.U || 0));
    return `<details class="card etabs-banner no-print"><summary><span class="badge">ETABS</span> Forces from <b>${esc(L.label)}</b> · ${esc(L.story)} · governing <b>${esc(L.combo)}</b><small>${esc(L.file)} · ${new Date(L.at).toLocaleString()}</small></summary>
      ${cs.length > 1 ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Combination checked</th>${keys.map(k => `<th class="num">${EC.sym ? EC.sym(k) : esc(k)}</th>`).join('')}<th>U</th></tr></thead><tbody>${cs.map(c => `<tr${c.combo === L.combo ? ' class="gov"' : ''}><td><small>${esc(c.combo)}</small></td>${keys.map(k => `<td class="num">${api.fmt(c.show[k], 1)}</td>`).join('')}<td>${c.U == null ? '' : api.ubar(c.U)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="muted" style="margin:8px 14px 12px">Re-import the ETABS results on the <a href="#/etabs">ETABS link</a> page to update these forces. Section, material and bar inputs you change here are kept.</p></details>`;
  }

  EC.etabs = { install(a) { api = a; }, view, mount, banner, live: { L, get: bget, connect: openConnect }, _demoDesign: () => { demo(); let n = 0; S.tables.forEach((t, ti) => { const r = apply(ti, true); n += r.nNew + r.nUpd; }); return n; }, _parse: (text) => { ingest([[splitText(text), '']]); return S; }, _members: members, _state: S, _demo: demo };
})();
