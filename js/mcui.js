/* Worksheet elements: one element type per Mathcad worksheet in math.Claude.
 * Inputs = the yellow input regions of the worksheet; the calculation is the worksheet itself,
 * evaluated by js/mcad/engine.js with the formulas exactly as written in Mathcad. */
(function () {
  'use strict';
  const EC = window.EC;
  const R = EC.mrender;
  const esc = R.esc;
  const docs = {}, loading = {};
  const full = new Map();      // element id -> {h, r}
  const queue = []; let worker = null, wReady = false, reqN = 0; const waiting = {};
  let api = null;
  const opts = { sub: true, all: false, areas: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem('cambo.wsopts') || '{}')); } catch (e) { /* ignore */ }

  /* ---------- catalog -> element types ---------- */
  function register(MOD) {
    (EC.sheetCatalog || []).forEach(s => {
      MOD['mc:' + s.id] = {
        mc: s.id, name: s.name, cat: s.cat, prefix: s.prefix, code: s.code, title: s.title,
        mathcad: (s.folder ? s.folder + '\\' : '') + s.file, mcFile: s.file, groups: [], schedCols: [],
        sched: () => ({}), calc: null
      };
    });
  }

  /* ---------- loading & computing ---------- */
  function loadSheet(id) {
    if (docs[id]) return Promise.resolve(docs[id]);
    if (loading[id]) return loading[id];
    loading[id] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'sheets/' + encodeURIComponent(id) + '.js';
      s.onload = () => (docs[id] ? res(docs[id]) : rej(new Error('worksheet did not load')));
      s.onerror = () => { delete loading[id]; rej(new Error('could not load worksheet ' + id)); };
      document.head.appendChild(s);
    });
    return loading[id];
  }
  window.EC_SHEET = (id, d) => { docs[id] = d; };

  function startWorker() {
    if (worker !== null) return;
    try {
      worker = new Worker('js/mcad/worker.js');
      worker.onmessage = ev => { wReady = true; const w = waiting[ev.data.req]; delete waiting[ev.data.req]; if (w) (ev.data.error ? w.rej(new Error(ev.data.error)) : w.res(ev.data.r)); };
      worker.onerror = ev => { ev.preventDefault && ev.preventDefault(); if (!wReady) { worker = false; Object.keys(waiting).forEach(k => { const w = waiting[k]; delete waiting[k]; w.retry(); }); } };
    } catch (e) { worker = false; }
  }
  function computeMain(id, inputs) {
    return loadSheet(id).then(doc => new Promise((res, rej) => setTimeout(() => { try { res(EC.mcadc.compute(doc, inputs)); } catch (e) { rej(e); } }, 0)));
  }
  function compute(id, inputs) {
    startWorker();
    if (!worker) return computeMain(id, inputs);
    return new Promise((res, rej) => {
      const req = ++reqN;
      waiting[req] = { res, rej, retry: () => computeMain(id, inputs).then(res, rej) };
      worker.postMessage({ req, id, inputs });
    });
  }
  const hash = e => JSON.stringify(e.inputs || {});
  const inflight = new Map();
  function ensure(e) {
    const mod = api.MOD[e.type]; const h = hash(e);
    const f = full.get(e.id);
    if (f && f.h === h) return Promise.resolve(f.r);
    const key = e.id + '|' + h;
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.all([compute(mod.mc, e.inputs || {}), loadSheet(mod.mc)]).then(([r, doc]) => {
      inflight.delete(key);
      full.set(e.id, { h, r });
      const before = JSON.stringify(e.res || null);
      e.res = digest(e, r, doc, h);
      if (JSON.stringify(e.res) !== before) api.save();
      api.onResult(e);
      return r;
    }, err => { inflight.delete(key); e.res = { h, error: err.message, at: Date.now() }; api.onResult(e); throw err; });
    inflight.set(key, p);
    return p;
  }
  /* small persisted summary used by dashboard, lists and schedules */
  function digest(e, r, doc, h) {
    const s = r.summary;
    const keys = r.keys.filter(k => k.v && (k.v.s !== undefined || k.v.n !== undefined)).slice(0, 40).map(k => [k.n, valText(k.v), k.c === '#E2EFDA' ? 1 : 0]);
    const inp = (doc.inputs || []).filter(i => i.kind === 'num' || i.kind === 'combo').slice(0, 5).map(i => [shortLab(i), inputText(i, e.inputs && e.inputs[i.n])]);
    return { h, Umax: s.Umax, ok: s.ok, result: s.result, rows: s.rows.slice(0, 40), nBad: s.nBad, errors: r.errors, keys, inp, at: Date.now(), ms: r.ms };
  }
  const shortLab = i => (i.l || i.n).replace(/\(.*?\)/g, '').replace(/\s+-\s+.*/, '').trim().slice(0, 22) || i.n;
  function valText(v) {
    if (!v) return '';
    if (v.s !== undefined) return v.s;
    if (v.m) return '[' + v.m[0] + '×' + v.m[1] + ']';
    if (v.n === undefined || v.n === null) return '';
    return EC.mcad.fmtNum(v.n, 3) + (v.uA ? ' ' + R.unitText(v.uA) : v.us ? ' ' + v.us : '');
  }

  /* ---------- result for dashboard / lists ---------- */
  function result(e) {
    const res = e.res;
    const h = hash(e);
    if (!res || res.h !== h) ensure(e).catch(() => {});
    if (!res) return { pending: true, Umax: NaN, ok: false, summary: [], spec: [], bars: [], report: [], rebarKg: 0 };
    if (res.error) return { error: true, Umax: Infinity, ok: false, summary: [], spec: [], bars: [], report: [], rebarKg: 0, msg: res.error };
    return {
      Umax: res.Umax == null ? 0 : res.Umax, ok: res.ok, stale: res.h !== h, rebarKg: 0, bars: [], spec: [], report: [],
      summary: (res.rows || []).map(x => ({ item: x.item, U: x.U, ok: !x.st || /^(OK|PASS|N\/A|-|INFO|SATISFIED)/i.test(x.st.trim()) }))
    };
  }

  /* ---------- inputs ---------- */
  function curAst(i, ov) { return ov !== undefined ? ov : null; }
  function numOf(i, ov) {
    const a = curAst(i, ov);
    if (a == null) return i.v;
    if (typeof a === 'number') return a;
    if (Array.isArray(a) && a[0] === 'o' && a[1] === '*' && typeof a[2] === 'number') return a[2];
    return i.v;
  }
  function inputText(i, ov) {
    if (i.kind === 'combo') { const k = ov !== undefined ? ov : i.v; return (i.opts || [])[k] || ''; }
    if (i.kind === 'num') return EC.mcad.fmtNum(numOf(i, ov), 3) + (i.u ? ' ' + R.unitText(i.u) : '');
    if (i.kind === 'str') return ov ? ov[1] : i.v;
    return '';
  }
  function matOf(i, ov) {
    let a = ov !== undefined ? ov : null;
    let M = i.v;
    if (a) M = Array.isArray(a) && a[0] === 'o' ? a[2] : a;
    const cells = M[3].map(x => (typeof x === 'number' ? x : Array.isArray(x) && x[0] === 's' ? x[1] : Array.isArray(x) && x[0] === 'o' ? -x[2] : x == null ? 0 : x));
    return { r: M[1], c: M[2], cells };
  }
  function matAst(i, r, c, cells) {
    const M = ['M', r, c, cells.map(x => (typeof x === 'string' ? ['s', x] : x))];
    return i.u ? ['o', '*', M, i.u] : M;
  }
  function inputsHTML(e, doc) {
    const ins = doc.inputs || [];
    const ov = e.inputs || {};
    const groups = [];
    ins.forEach(i => { let g = groups[groups.length - 1]; if (!g || g.t !== i.g) groups.push(g = { t: i.g, f: [] }); g.f.push(i); });
    const sym = n => `<math class="isym">${R.ident(n)}</math>`;
    const field = i => {
      const o = ov[i.n];
      const edited = (o !== undefined ? ' edited' : '') + ((i.l || '').length > 26 && i.kind !== 'num' ? ' lab-top' : '');
      const lab = `<span class="fl" title="${esc(i.l || i.n)}">${esc(i.l || i.n)} ${sym(i.n)}</span>`;
      if (i.kind === 'combo') {
        const k = o !== undefined ? o : i.v;
        return `<div class="field wide${edited}">${lab}<select data-mi="${esc(i.n)}">${(i.opts || []).map((n, j) => `<option value="${j}" ${j === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
      }
      if (i.kind === 'str') return `<div class="field wide${edited}">${lab}<input data-mi="${esc(i.n)}" data-kind="str" value="${esc(o ? o[1] : i.v)}"></div>`;
      if (i.kind === 'num') return `<div class="field${edited}">${lab}<input data-mi="${esc(i.n)}" data-kind="num" type="number" step="any" inputmode="decimal" value="${esc(numOf(i, o))}"><span class="fu">${esc(i.u ? R.unitText(i.u) : '')}</span></div>`;
      return '';
    };
    const table = cols => {
      const ms = cols.map(i => matOf(i, ov[i.n]));
      const rows = Math.max(...ms.map(m => m.r));
      const single = cols.length === 1 && ms[0].c > 1;
      const edited = cols.some(i => ov[i.n] !== undefined) ? ' edited' : '';
      let head, body = '';
      if (single) {
        const m = ms[0];
        head = `<th>#</th>${Array.from({ length: m.c }, (_, j) => `<th>${j + 1}</th>`).join('')}`;
        for (let r = 0; r < m.r; r++) body += `<tr><td class="rn">${r + 1}</td>${Array.from({ length: m.c }, (_, j) => cell(cols[0], r, j, m.cells[r * m.c + j])).join('')}<td><button class="btn sm" data-mrdel="${esc(cols[0].n)}" data-r="${r}" title="Delete row">×</button></td></tr>`;
      } else {
        head = `<th>#</th>${cols.map(i => `<th title="${esc(i.l)}">${sym(i.n)}${i.u ? `<small> ${esc(R.unitText(i.u))}</small>` : ''}</th>`).join('')}`;
        for (let r = 0; r < rows; r++) body += `<tr><td class="rn">${r + 1}</td>${cols.map((i, k) => cell(i, r, 0, ms[k].cells[r * ms[k].c])).join('')}<td><button class="btn sm" data-mrdel="${esc(cols.map(i => i.n).join('|'))}" data-r="${r}" title="Delete row">×</button></td></tr>`;
      }
      const lab = cols.length === 1 ? (cols[0].l || cols[0].n) : (cols.map(i => i.l).filter(Boolean)[0] || 'Table');
      return `<div class="tblin${edited}"><div class="fl">${esc(lab)}${single ? ' ' + sym(cols[0].n) + (cols[0].u ? ` <small>(${esc(R.unitText(cols[0].u))})</small>` : '') : ''}</div><div class="tbl-wrap"><table><thead><tr>${head}<th></th></tr></thead><tbody>${body}</tbody></table></div><button class="btn sm" data-mradd="${esc(cols.map(i => i.n).join('|'))}">+ Row</button></div>`;
    };
    const cell = (i, r, j, v) => `<td><input data-mc="${esc(i.n)}" data-r="${r}" data-c="${j}" ${typeof v === 'number' ? 'type="number" step="any"' : ''} value="${esc(v == null ? '' : v)}"></td>`;
    return groups.map(g => {
      let html = '', k = 0;
      while (k < g.f.length) {
        const i = g.f[k];
        if (i.kind === 'mat') {
          const cols = [i]; k++;
          while (i.st && k < g.f.length && g.f[k].kind === 'mat' && g.f[k].st === i.st) cols.push(g.f[k++]);
          html += table(cols); continue;
        }
        html += field(i); k++;
      }
      const t = g.t.split(' › ');
      return `<div class="grp"><h4>${esc(t[t.length - 1] || 'Input')}</h4>${html}</div>`;
    }).join('') || '<div class="empty">This worksheet has no editable inputs.</div>';
  }

  /* ---------- worksheet (calculation) view ---------- */
  function worksheetHTML(e, doc, r) {
    const flat = EC.mcadc.flatten(doc);
    const ov = e.inputs || {};
    let out = '', rowItems = [], rowY = null;
    const flush = () => {
      if (!rowItems.length) return;
      const left = rowItems.filter(x => x.x < 290 && x.k === 't');
      const right = rowItems.filter(x => !(x.x < 290 && x.k === 't'));
      if (left.length && right.length) out += `<div class="wrow">${'<div class="wl">' + left.map(x => x.h).join('') + '</div><div class="wr">' + right.map(x => x.h).join('') + '</div>'}</div>`;
      else out += rowItems.map(x => x.h).join('');
      rowItems = []; rowY = null;
    };
    flat.forEach((reg, idx) => {
      if (reg.k === 'area') { flush(); out += reg.end ? '</div></details>' : `<details class="warea" ${opts.areas || !reg.col ? 'open' : ''}><summary>Mathcad area (hidden in the worksheet) – click to show</summary><div>`; return; }
      if (reg.k === 'st') { flush(); return; }
      let h = '';
      if (reg.k === 't') h = `<div class="wt">${reg.h}</div>`;
      else if (reg.k === 'm') {
        let v = r && r.vals[idx];
        const name = reg.e[0] === 'def' && reg.e[1][0] === 'v' ? reg.e[1][1] : null;
        if (v && name && ov[name] !== undefined && !(Array.isArray(reg.e[2]) && (reg.e[2][0] === 'cb' || (reg.e[2][0] === 'ev' && reg.e[2][1][0] === 'cb')))) v = Object.assign({}, v, { inputHTML: R.mm(ov[name]) });
        const c = (reg.c || '').toUpperCase();
        const cls = c === '#FFF2CC' ? 'cin' : c === '#E2EFDA' ? 'cchk' : c === '#DDEBF7' ? 'ckey' : '';
        let m;
        try { m = R.region(reg, v, opts); } catch (er) { m = `<code>${esc(R.text(reg.e))}</code>`; }
        h = `<div class="wm ${cls}${v && v.err ? ' werr' : ''}${v && v.ov ? ' wov' : ''}">${m}${v && v.err ? `<div class="errmsg">⚠ ${esc(v.err)}</div>` : ''}</div>`;
      } else if (reg.k === 'p') h = `<div class="wp">${R.plot(reg, r && r.vals[idx])}</div>`;
      if (!h) return;
      const y = reg.y;
      if (rowY !== null && Math.abs(y - rowY) > 10) flush();
      if (rowY === null) rowY = y;
      rowItems.push({ x: reg.x, k: reg.k, h });
    });
    flush();
    return out;
  }

  /* ---------- element page ---------- */
  let tab = 'summary';
  function vElement(e) {
    const mod = api.MOD[e.type], doc = docs[mod.mc];
    if (!doc) { loadSheet(mod.mc).then(() => api.render(), err => api.toast(err.message)); return `<div class="empty">Loading worksheet ${esc(mod.mcFile)}…</div>`; }
    const opt = (arr, v) => arr.map(s => `<option ${s === v ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const nEdit = Object.keys(e.inputs || {}).length;
    return `<div class="page-head no-print"><div><a href="#/elements/${mod.cat}" class="btn sm" style="margin-bottom:8px">${api.ic('back')}${esc(api.catName(mod.cat))}</a>
        <h1><span style="color:var(--accent)">${esc(e.mark)}</span> · ${esc(mod.name)}</h1><div class="sub">${esc(mod.title)} · Mathcad worksheet <b>${esc(mod.mcFile)}</b></div></div>
      <div class="actions"><button class="btn" data-mrec>${api.ic('check')}Save record</button><button class="btn" data-print>${api.ic('print')}Print</button><button class="btn" data-dup="${e.id}">${api.ic('copy')}Duplicate</button><button class="btn danger" data-del="${e.id}">${api.ic('trash')}Delete</button></div></div>
      <div class="card no-print"><div class="el-head">
        <div><label>Mark</label><input data-m="mark" value="${esc(e.mark)}"></div>
        <div><label>Level</label><input data-m="level" value="${esc(e.level || '')}"></div>
        <div><label>Grid / location</label><input data-m="grid" value="${esc(e.grid || '')}"></div>
        <div><label>Quantity</label><input data-m="qty" type="number" min="1" value="${esc(e.qty || 1)}"></div>
        <div><label>Status</label><select data-m="status">${opt(api.STATUS, e.status)}</select></div>
        <div><label>Start</label><input data-m="start" type="date" value="${esc(e.start || '')}"></div>
        <div><label>Due</label><input data-m="due" type="date" value="${esc(e.due || '')}"></div>
        <div><label>Designer</label><input data-m="assignee" value="${esc(e.assignee || '')}"></div>
      </div></div>
      <div class="editor">
        <div class="card inputs"><div class="inp-head"><b>Input data</b><span class="badge" style="background:var(--input-bg);border-color:var(--input-border)">yellow regions</span>${nEdit ? `<span class="badge">${nEdit} edited</span>` : ''}<button class="btn sm" style="margin-left:auto" data-mreset title="Restore the worksheet values">Defaults</button></div>${inputsHTML(e, doc)}</div>
        <div id="out">${vOutput(e)}</div>
      </div>`;
  }
  function vOutput(e) {
    const mod = api.MOD[e.type], doc = docs[mod.mc], p = api.proj();
    const f = full.get(e.id); const cur = f && f.h === hash(e);
    if (!cur) ensure(e).then(() => refresh(e)).catch(err => refresh(e, err));
    const r = f ? f.r : null;
    const res = e.res || {};
    const busy = !cur ? `<div class="calcbusy"><span class="spin"></span>Calculating the worksheet…</div>` : '';
    if (!r) return `<div class="card"><div class="body">${busy || '<div class="empty">No result</div>'}${res.error ? `<div class="errmsg">⚠ ${esc(res.error)}</div>` : ''}</div></div>`;
    const s = r.summary;
    const U = s.Umax;
    const tabs = [['summary', 'Summary'], ['calc', 'Calculation'], ['detail', 'Detailing'], ['spec', 'Specification'], ['rec', `Records${(e.records || []).length ? ` <span class="badge">${e.records.length}</span>` : ''}`]];
    const verdict = s.ok ? 'ok' : 'bad';
    const summary = `<div class="verdict-banner ${verdict}">${api.ic(s.ok ? 'check' : 'alert')}<div>${esc(s.result || (s.ok ? 'All checks satisfied' : 'REVISE - see NOT OK items'))}<div style="font-weight:400;font-size:12px;opacity:.85">${s.rows.length} checks · ${s.nBad} not OK${r.errors ? ` · ${r.errors} regions with errors` : ''} · calculated in ${r.ms} ms</div></div><div class="big">U<sub>max</sub> = ${U == null ? '–' : api.fmt(U, 3)}</div></div>
      ${s.rows.length ? `<div class="tbl-wrap"><table class="tbl sumtbl"><thead><tr><th>Item</th><th>Utilisation U</th><th>Status</th></tr></thead><tbody>${s.rows.map(x => { const ok = !x.st || /^(OK|PASS|N\/A|-|INFO|SATISFIED)/i.test(x.st.trim()); return `<tr><td class="item">${esc(x.item)}</td><td>${x.U == null ? '' : api.ubar(x.U)}</td><td><span class="res ${ok ? 'ok' : 'bad'}">${esc(x.st || '')}</span></td></tr>`; }).join('')}</tbody></table></div>` : ''}
      ${keyTable(r, doc, 'ckey', 'Key results')}`;
    const tools = `<div class="wtools no-print"><label><input type="checkbox" data-wopt="sub" ${opts.sub ? 'checked' : ''}> Substituted values</label><label><input type="checkbox" data-wopt="all" ${opts.all ? 'checked' : ''}> Value of every definition</label><label><input type="checkbox" data-wopt="areas" ${opts.areas ? 'checked' : ''}> Open hidden areas</label><span class="hint">Formulas are read directly from ${esc(mod.mcFile)} – unchanged.</span></div>`;
    const calc = tab === 'calc' ? `${tools}<div class="ws">${worksheetHTML(e, doc, r)}</div>` : '<div class="ws"></div>';
    const detail = detailHTML(e, doc, r);
    const spec = `<dl class="spec">${[['Element', `${e.mark} – ${mod.name}`], ['Location', `${e.level || '–'}, ${e.grid || '–'} (${e.qty || 1} no.)`], ['Design basis', mod.title], ['Worksheet', mod.mathcad]].map(x => `<dt>${esc(x[0])}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
      ${inputSummary(e, doc)}${keyTable(r, doc, 'ckey', 'Design results to specify')}${keyTable(r, doc, 'cchk', 'Checks')}`;
    const rec = recordsHTML(e);
    const head = `<div class="print-head"><div><b>CAMBO STRUCT</b> · ${esc(p.name)} (${esc(p.number)})<br>${esc(mod.name)} <b style="font-size:12px;color:inherit">${esc(e.mark)}</b> · ${esc(e.level || '')} ${esc(e.grid || '')}</div><div style="text-align:right">Cal. by ${esc(e.assignee || p.engineer)} · Checked ${esc(p.checker || '…')}<br>${new Date().toISOString().slice(0, 10)} · ${esc(mod.mcFile)}</div></div>`;
    return `${head}<div class="card">${busy}<div class="tabs no-print" style="padding:0 10px;margin:0">${tabs.map(t => `<button data-mtab="${t[0]}" class="${tab === t[0] ? 'active' : ''}">${t[1]}${t[0] === 'summary' ? ` <span class="res ${verdict}" style="padding:0 6px">${U == null ? '–' : api.fmt(U, 2)}</span>` : ''}</button>`).join('')}</div>
      <div class="body">${[['summary', summary], ['calc', calc], ['detail', detail], ['spec', spec], ['rec', rec]].map(([k, h]) => `<div class="tab-pane" data-mpane="${k}" style="${tab === k ? '' : 'display:none'}">${h}</div>`).join('')}</div></div>`;
  }
  function labelFor(doc, reg) {
    const flat = EC.mcadc.flatten(doc);
    let best = '', d = 1e9;
    flat.forEach(t => { if (t.k === 't' && t.x < reg.x && Math.abs(t.y - reg.y) < 14 && Math.abs(t.y - reg.y) < d) { d = Math.abs(t.y - reg.y); best = t.h; } });
    return best.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function keyTable(r, doc, cls, title) {
    const flat = EC.mcadc.flatten(doc);
    const want = cls === 'ckey' ? '#DDEBF7' : '#E2EFDA';
    const rows = [];
    flat.forEach((reg, i) => {
      if (reg.k !== 'm' || (reg.c || '').toUpperCase() !== want) return;
      const v = r.vals[i]; if (!v || !v.v || v.v.m) return;
      const name = reg.e[0] === 'def' && reg.e[1][0] === 'v' ? reg.e[1][1] : null; if (!name) return;
      rows.push(`<tr><td>${esc(labelFor(doc, reg))}</td><td><math>${R.ident(name)}</math></td><td class="num"><math>${R.valM(v.v)}</math></td></tr>`);
    });
    return rows.length ? `<h3 class="ksub">${esc(title)}</h3><div class="tbl-wrap"><table class="tbl ktbl"><tbody>${rows.join('')}</tbody></table></div>` : '';
  }
  function inputSummary(e, doc) {
    const ins = (doc.inputs || []).filter(i => i.kind !== 'mat');
    if (!ins.length) return '';
    return `<h3 class="ksub">Design inputs</h3><div class="tbl-wrap"><table class="tbl ktbl"><tbody>${ins.map(i => `<tr class="${(e.inputs || {})[i.n] !== undefined ? 'edited' : ''}"><td>${esc(i.l || i.n)}</td><td><math>${R.ident(i.n)}</math></td><td class="num">${esc(inputText(i, (e.inputs || {})[i.n]))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function detailHTML(e, doc, r) {
    const flat = EC.mcadc.flatten(doc);
    let heading = '', sub = '';
    const cards = [];
    flat.forEach((reg, i) => {
      if (reg.k === 't') {
        const m = reg.h.match(/<h([234])>/);
        if (m) { const t = reg.h.replace(/<[^>]+>/g, '').trim(); if (m[1] !== '4') { heading = t; sub = ''; } else sub = t; }
        return;
      }
      if (reg.k !== 'p') return;
      cards.push(`<figure class="dcard"><figcaption><b>${esc(sub || heading)}</b>${sub && heading ? `<small>${esc(heading)}</small>` : ''}</figcaption>${R.plot(reg, r.vals[i])}</figure>`);
    });
    const strs = r.keys.filter(k => k.v && k.v.s !== undefined && !/^(OK|NOT OK)/i.test(k.v.s) && k.v.s.length > 3 && /[0-9]/.test(k.v.s));
    const specList = strs.length ? `<h3 class="ksub">Reinforcement / detailing callouts</h3><ul class="callouts">${strs.map(k => `<li><math>${R.ident(k.n)}</math> <span>${esc(k.v.s)}</span></li>`).join('')}</ul>` : '';
    return (cards.length ? `<div class="dgrid">${cards.join('')}</div>` : '<div class="empty">This worksheet has no drawings.</div>') + specList;
  }
  function recordsHTML(e) {
    const recs = (e.records || []).slice().reverse();
    return `<div class="rec-head"><p>A record is a saved copy of this element's inputs and results. Your data also autosaves after every change${EC.sync && EC.sync.status().backend ? ' and syncs to ' + esc(EC.sync.status().label) : ' in this browser'}.</p><button class="btn primary" data-mrec>${api.ic('check')}Save record now</button></div>
      ${recs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Saved</th><th>Note</th><th>Inputs changed</th><th>U max</th><th>Result</th><th></th></tr></thead><tbody>${recs.map(x => `<tr><td class="num" style="white-space:nowrap">${esc(new Date(x.at).toLocaleString())}</td><td>${esc(x.note || '')}${x.by ? `<br><small>${esc(x.by)}</small>` : ''}</td><td class="num">${Object.keys(x.inputs || {}).length}</td><td class="num">${x.Umax == null ? '–' : api.fmt(x.Umax, 3)}</td><td><span class="res ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'OK' : 'Revise'}</span></td><td style="white-space:nowrap"><button class="btn sm" data-mrestore="${x.at}">Restore</button> <button class="btn sm danger" data-mrecdel="${x.at}">${api.ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No records saved yet.</div>'}`;
  }

  /* ---------- refresh ---------- */
  function refresh(e, err) {
    const out = document.getElementById('out');
    if (!out || api.route()[1] !== e.id) return;
    const main = document.getElementById('main'); const y = main.scrollTop;
    out.innerHTML = vOutput(e);
    if (err) out.insertAdjacentHTML('afterbegin', `<div class="errmsg">⚠ ${esc(err.message)}</div>`);
    main.scrollTop = y;
  }
  let rt = null;
  function changed(e) { e.u = Date.now(); api.save(); clearTimeout(rt); rt = setTimeout(() => refresh(e), 350); }
  const curEl = () => { const r = api.route(); if (r[0] !== 'el') return null; const e = api.proj().elements.find(x => x.id === r[1]); return e && api.MOD[e.type] && api.MOD[e.type].mc ? e : null; };
  const inputDef = (e, n) => (docs[api.MOD[e.type].mc].inputs || []).find(i => i.n === n);

  document.addEventListener('input', ev => {
    const t = ev.target; const e = curEl(); if (!e) return;
    if (t.dataset.mi !== undefined) {
      const i = inputDef(e, t.dataset.mi); if (!i) return;
      e.inputs = e.inputs || {};
      let v;
      if (i.kind === 'combo') v = +t.value;
      else if (i.kind === 'str') v = ['s', t.value];
      else { const x = parseFloat(t.value); if (!Number.isFinite(x)) return; v = i.u ? ['o', '*', x, i.u] : x; }
      if (JSON.stringify(v) === JSON.stringify(i.kind === 'combo' ? i.v : i.kind === 'str' ? ['s', i.v] : i.u ? ['o', '*', i.v, i.u] : i.v)) delete e.inputs[i.n]; else e.inputs[i.n] = v;
      t.closest('.field') && t.closest('.field').classList.toggle('edited', e.inputs[i.n] !== undefined);
      changed(e); return;
    }
    if (t.dataset.mc !== undefined) {
      const i = inputDef(e, t.dataset.mc); if (!i) return;
      const m = matOf(i, (e.inputs || {})[i.n]);
      const old = m.cells[+t.dataset.r * m.c + +t.dataset.c];
      let v = t.value;
      if (typeof old === 'number' || t.type === 'number') { v = parseFloat(v); if (!Number.isFinite(v)) return; }
      m.cells[+t.dataset.r * m.c + +t.dataset.c] = v;
      e.inputs = e.inputs || {}; e.inputs[i.n] = matAst(i, m.r, m.c, m.cells);
      changed(e);
    }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.wopt) { opts[t.dataset.wopt] = t.checked; try { localStorage.setItem('cambo.wsopts', JSON.stringify(opts)); } catch (x) { /* ignore */ } const e = curEl(); if (e) refresh(e); }
  });
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-mtab],[data-mradd],[data-mrdel],[data-mreset],[data-mrec],[data-mrestore],[data-mrecdel]');
    if (!t) return;
    const e = curEl(); if (!e) return;
    const d = t.dataset;
    if (d.mtab) {
      tab = d.mtab;
      if (tab === 'calc') { refresh(e); return; }
      document.querySelectorAll('[data-mtab]').forEach(b => b.classList.toggle('active', b.dataset.mtab === tab));
      document.querySelectorAll('[data-mpane]').forEach(p => { p.style.display = p.dataset.mpane === tab ? '' : 'none'; });
      return;
    }
    if (d.mradd !== undefined || d.mrdel !== undefined) {
      const names = (d.mradd !== undefined ? d.mradd : d.mrdel).split('|');
      e.inputs = e.inputs || {};
      names.forEach(n => {
        const i = inputDef(e, n); const m = matOf(i, e.inputs[n]);
        if (d.mradd !== undefined) { const last = m.cells.slice((m.r - 1) * m.c, m.r * m.c); m.cells = m.cells.concat(last); m.r++; }
        else { if (m.r <= 1) return; m.cells.splice(+d.r * m.c, m.c); m.r--; }
        e.inputs[n] = matAst(i, m.r, m.c, m.cells);
      });
      e.u = Date.now(); api.save(); api.render(); return;
    }
    if (d.mreset !== undefined) {
      api.modal('Restore worksheet values', `<p>Replace all inputs of <b>${esc(e.mark)}</b> with the values saved in the Mathcad worksheet? Save a record first if you want to keep the current set.</p>`, () => { e.inputs = {}; e.u = Date.now(); api.save(); api.render(); }, 'Restore');
      return;
    }
    if (d.mrec !== undefined) {
      const bg = api.modal('Save record', `<div class="form"><label>Note (optional)</label><input id="recNote" placeholder="e.g. Issued for checking, rev A"></div>`, () => {
        const res = e.res || {};
        e.records = (e.records || []).concat([{ at: Date.now(), note: bg.querySelector('#recNote').value, by: e.assignee || api.proj().engineer || '', inputs: JSON.parse(JSON.stringify(e.inputs || {})), Umax: res.Umax == null ? null : res.Umax, ok: !!res.ok, result: res.result || '' }]).slice(-25);
        e.u = Date.now(); api.save(); api.toast('Record saved'); tab = 'rec'; api.render();
      }, 'Save');
      setTimeout(() => { const n = bg.querySelector('#recNote'); if (n) n.focus(); }, 30);
      return;
    }
    if (d.mrestore) {
      const x = (e.records || []).find(q => String(q.at) === d.mrestore); if (!x) return;
      api.modal('Restore record', `<p>Load the inputs saved on <b>${esc(new Date(x.at).toLocaleString())}</b>? The current inputs are saved as a new record first.</p>`, () => {
        const res = e.res || {};
        e.records = (e.records || []).concat([{ at: Date.now(), note: 'Auto: before restore', by: '', inputs: JSON.parse(JSON.stringify(e.inputs || {})), Umax: res.Umax, ok: !!res.ok }]).slice(-25);
        e.inputs = JSON.parse(JSON.stringify(x.inputs || {})); e.u = Date.now(); api.save(); api.toast('Record restored'); tab = 'summary'; api.render();
      }, 'Restore');
      return;
    }
    if (d.mrecdel) { e.records = (e.records || []).filter(q => String(q.at) !== d.mrecdel); e.u = Date.now(); api.save(); refresh(e); }
  });

  EC.mcui = {
    install(a) { api = a; },
    register, result, vElement, loadSheet, ensure, docs,
    libTypes: x => Object.keys(api.MOD).filter(t => api.MOD[t].mc && x.files.includes(api.MOD[t].mcFile)),
    schedRow: e => (e.res && e.res.inp) || [],
    keyText: e => ((e.res && e.res.keys) || []).filter(k => !k[2] && /[A-Za-z]/.test(k[1]) && /\d/.test(k[1])).map(k => k[1]).slice(0, 2).join(' · ')
  };
})();
