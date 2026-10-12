/* Design analysis kit: a drawn-plan analysis tool from a short spec, for worksheets whose geometry is a set of
 * scalar inputs (footing size, column size and position, ...). The drawing is bound to those inputs: drag the
 * handles or type the values, and the worksheet input changes. Loads are typed per load combination; the
 * worksheet runs once per combination and the largest utilisation governs (its report is shown).
 * The worksheet does the design - the spec only says how to draw it and which inputs are loads.
 *
 *   EC.analysis.kit({
 *     k, name, short, sub, icon, sheet, desc,
 *     loads: ['N_Ed', 'M_Ed;x', ...],             worksheet inputs typed per combination (input units)
 *     plan(v) -> { shapes, dims, handles }          v.mm(name) length in mm, v.num(name) value in input units
 *       shapes : [{ t: 'outline'|'col'|'wall'|'pile'|'zone'|'link', x, y, w, h | d, label }]   (mm, x right, y up, x/y = centre)
                { t: 'bar', x, y, d } rebar dot · { t: 'line', pts: [[x,y],...], cls: 'p-guide'|'p-limit'|'p-rebar'|'p-outline2' }
                (a section is drawn the same way: x across, y up the section)
 *       dims   : [{ x1, y1, x2, y2, off, text }]   dimension line between two points, offset in px (+ = below/right)
 *       handles: [{ x, y, set(dx, dy) -> { input: mm or value } }]   drag handle; the result is written to the inputs
 *     check(v) -> string | ''                       optional: a problem that stops the run
 *   })
 * Pure parts (plan, loads) are tested in Node by tools/test_analysis.js. */
(function (root) {
  'use strict';
  const EC = root.EC = root.EC || {};
  const LU = { mm: 1, cm: 10, m: 1000 };

  /* worksheet values of an element (input units) + helpers in mm */
  function values(doc, inputs) {
    const ins = (doc && doc.inputs) || [], by = {};
    ins.forEach(i => { by[i.n] = i; });
    const unit = n => { const i = by[n]; return i && i.u && i.u[0] === 'u' ? i.u[1] : ''; };
    const num = n => {
      const i = by[n]; if (!i) return NaN;
      const o = (inputs || {})[n];
      if (o === undefined) return i.kind === 'combo' ? i.v : +i.v;
      if (typeof o === 'number') return o;
      if (Array.isArray(o) && o[0] === 'o' && typeof o[2] === 'number') return o[2];
      return +i.v;
    };
    const mm = n => num(n) * (LU[unit(n)] || 1);
    const ast = (n, x) => { const i = by[n]; return i && i.u ? ['o', '*', +(+x).toPrecision(10), i.u] : +(+x).toPrecision(10); };
    const fromMM = (n, x) => x / (LU[unit(n)] || 1);
    return { num, mm, unit, ast, fromMM, has: n => !!by[n], def: n => by[n] };
  }
  /* worksheet overrides for combination ci */
  function comboInputs(spec, doc, model, ci) {
    const v = values(doc, {}), c = model.combos[ci] || { L: {} }, o = {};
    spec.loads.forEach(n => { if (c.L[n] !== undefined && v.has(n)) o[n] = v.ast(n, c.L[n]); });
    return o;
  }
  function newModel(spec, doc, inputs) {
    const v = values(doc, inputs), L = {};
    spec.loads.forEach(n => { L[n] = v.num(n); });
    return { tool: spec.k, v: 1, combos: [{ name: 'ULS 1', L }], view: 'gov', snap: 25 };
  }

  if (typeof document === 'undefined') { EC.analysisKit = { values, comboInputs, newModel }; return; }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = s => document.querySelector(s);
  const f1 = x => (+x).toFixed(1);

  function kit(spec) {
    let api = null;
    const S = { id: null, vw: null, drag: null, runs: null, gov: 0, busy: false, dirty: true, msg: '', baseH: null, ptr: null };
    let tok = 0, T = null;
    const fmt = (v, d) => (Number.isFinite(v) ? api.fmt(v, d == null ? 0 : d) : '–');
    const doc = () => EC.mcui.docs[spec.sheet];
    const cur = () => { if (!api) return null; const r = api.route(); if (r[0] !== 'analysis' || !r[1]) return null; const e = api.proj().elements.find(x => x.id === r[1]); return e && e.fda && e.fda.tool === spec.k ? e : null; };
    const V = e => values(doc(), e.inputs);
    const free = e => { const o = {}; Object.keys(e.inputs || {}).forEach(k => { if (!spec.loads.includes(k)) o[k] = e.inputs[k]; }); return o; };
    const shown = e => (typeof e.fda.view === 'number' && e.fda.view < e.fda.combos.length ? e.fda.view : S.gov);

    function schedule(e, ms) { S.dirty = true; clearTimeout(T); T = setTimeout(() => run(e), ms == null ? 450 : ms); }
    async function run(e) {
      const my = ++tok, m = e.fda, d = doc();
      const pb = spec.check ? spec.check(V(e)) : '';
      if (pb) { S.msg = pb; S.runs = null; paintRes(e); return; }
      S.busy = true; S.msg = ''; paintRes(e);
      const base = free(e), runs = [];
      try {
        for (let ci = 0; ci < m.combos.length; ci++) {
          const r = await EC.mcui.compute(spec.sheet, Object.assign({}, base, comboInputs(spec, d, m, ci)));
          if (my !== tok) return;
          runs.push({ Umax: r.summary.Umax, ok: r.summary.ok, result: r.summary.result, rows: r.summary.rows, nBad: r.summary.nBad, errors: r.errors });
        }
      } catch (err) { if (my !== tok) return; S.busy = false; S.msg = 'Worksheet error: ' + err.message; paintRes(e); return; }
      let g = 0; runs.forEach((x, i) => { if ((x.Umax == null ? -1 : x.Umax) > (runs[g].Umax == null ? -1 : runs[g].Umax) + 1e-9) g = i; });
      S.runs = runs; S.gov = g; S.baseH = JSON.stringify(base); S.busy = false; S.dirty = false;
      e.inputs = Object.assign(free(e), comboInputs(spec, d, m, shown(e)));
      api.save(); EC.mcui.refresh(e); paint(e);
    }

    /* ---------- drawing ---------- */
    function size() { const b = $('#akCanvas'); const W = Math.max(280, b ? b.clientWidth : 700); return { W, H: Math.round(Math.max(300, Math.min(560, W * 0.6))) }; }
    function fit(P) {
      const { W, H } = size(), xs = [], ys = [];
      P.shapes.forEach(s => { if (s.t === 'line') { s.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }); return; } const w = s.w != null ? s.w : s.d, h = s.h != null ? s.h : s.d; xs.push(s.x - w / 2, s.x + w / 2); ys.push(s.y - h / 2, s.y + h / 2); });
      if (!xs.length) { xs.push(-2000, 2000); ys.push(-2000, 2000); }
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      S.vw = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: Math.min((W - 150) / Math.max(x1 - x0, 500), (H - 130) / Math.max(y1 - y0, 500)) };
    }
    const X = x => size().W / 2 + (x - S.vw.cx) * S.vw.s, Y = y => size().H / 2 - (y - S.vw.cy) * S.vw.s;
    function world(ev) { const svg = $('#akSvg'), r = svg.getBoundingClientRect(), { W, H } = size(); return { x: S.vw.cx + ((ev.clientX - r.left) * W / r.width - W / 2) / S.vw.s, y: S.vw.cy - ((ev.clientY - r.top) * H / r.height - H / 2) / S.vw.s }; }
    function dim(d) {
      const ax = X(d.x1), ay = Y(d.y1), bx = X(d.x2), by = Y(d.y2), hz = Math.abs(by - ay) < 0.5, o = d.off || 30;
      if (hz) { const y = ay + o; return `<line class="pext" x1="${f1(ax)}" x2="${f1(ax)}" y1="${f1(ay)}" y2="${f1(y)}"/><line class="pext" x1="${f1(bx)}" x2="${f1(bx)}" y1="${f1(by)}" y2="${f1(y)}"/><line class="pdim" x1="${f1(ax)}" x2="${f1(bx)}" y1="${f1(y)}" y2="${f1(y)}"/><path class="pdim" d="M${f1(ax)} ${f1(y - 4)}V${f1(y + 4)}M${f1(bx)} ${f1(y - 4)}V${f1(y + 4)}"/><text class="pdt at-halo" x="${f1((ax + bx) / 2)}" y="${f1(y - 4)}" text-anchor="middle">${esc(d.text)}</text>`; }
      const x = ax + o, cy = (ay + by) / 2;
      return `<line class="pext" x1="${f1(ax)}" x2="${f1(x)}" y1="${f1(ay)}" y2="${f1(ay)}"/><line class="pext" x1="${f1(bx)}" x2="${f1(x)}" y1="${f1(by)}" y2="${f1(by)}"/><line class="pdim" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(ay)}" y2="${f1(by)}"/><path class="pdim" d="M${f1(x - 4)} ${f1(ay)}H${f1(x + 4)}M${f1(x - 4)} ${f1(by)}H${f1(x + 4)}"/><text class="pdt at-halo" x="${f1(x - 5)}" y="${f1(cy)}" text-anchor="middle" transform="rotate(-90 ${f1(x - 5)} ${f1(cy)})">${esc(d.text)}</text>`;
    }
    function svg(e) {
      const P = spec.plan(V(e)), { W, H } = size();
      if (!S.vw) fit(P);
      const s = S.vw.s, steps = [50, 100, 250, 500, 1000, 2500, 5000], g = steps.find(t => t * s >= 28) || 5000;
      let o = '';
      for (let x = Math.ceil((S.vw.cx - W / 2 / s) / g) * g; x <= S.vw.cx + W / 2 / s; x += g) o += `<line class="pg" x1="${f1(X(x))}" x2="${f1(X(x))}" y1="0" y2="${H}"/>`;
      for (let y = Math.ceil((S.vw.cy - H / 2 / s) / g) * g; y <= S.vw.cy + H / 2 / s; y += g) o += `<line class="pg" x1="0" x2="${W}" y1="${f1(Y(y))}" y2="${f1(Y(y))}"/>`;
      const cls = { outline: 'p-outline', col: 'at-col', wall: 'at-wall', pile: 'at-pile', zone: 'p-limit' };
      P.shapes.forEach(sh => {
        const w = (sh.w != null ? sh.w : sh.d) * s, h = (sh.h != null ? sh.h : sh.d) * s, x0 = X(sh.x) - w / 2, y0 = Y(sh.y) - h / 2;
        if (sh.t === 'line') { o += `<path class="${sh.cls || 'p-guide'}" d="${sh.pts.map((p, k) => (k ? 'L' : 'M') + f1(X(p[0])) + ' ' + f1(Y(p[1]))).join('')}"/>`; return; }
        if (sh.t === 'bar') { o += `<circle class="p-bar" cx="${f1(X(sh.x))}" cy="${f1(Y(sh.y))}" r="${f1(Math.max(2.5, sh.d / 2 * s))}">${sh.title ? `<title>${esc(sh.title)}</title>` : ''}</circle>`; return; }
        if (sh.t === 'link') { o += `<rect class="p-link" fill="none" x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(Math.max(2, (sh.r || 0) * s))}"/>`; return; }
        const shape = sh.t === 'pile' ? `<circle class="at-pile" cx="${f1(X(sh.x))}" cy="${f1(Y(sh.y))}" r="${f1(w / 2)}"/>` : sh.t === 'outline' ? `<path class="p-outline" d="M${f1(x0)} ${f1(y0)}h${f1(w)}v${f1(h)}h${f1(-w)}Z"/>` : `<rect class="${cls[sh.t] || 'at-col'}" x="${f1(x0)}" y="${f1(y0)}" width="${f1(Math.max(2, w))}" height="${f1(Math.max(2, h))}" ${sh.t === 'zone' ? 'fill="none"' : ''}/>`;
        o += `<g>${shape}${sh.t === 'col' ? `<path class="at-seg" d="M${f1(x0)} ${f1(y0)}l${f1(w)} ${f1(h)}M${f1(x0 + w)} ${f1(y0)}l${f1(-w)} ${f1(h)}"/>` : ''}${sh.label ? `<text class="at-lbl at-halo" x="${f1(X(sh.x))}" y="${f1(sh.t === 'outline' ? y0 - 8 : y0 + h + 13)}" text-anchor="middle">${esc(sh.label)}</text>` : ''}${sh.title ? `<title>${esc(sh.title)}</title>` : ''}</g>`;
      });
      (P.dims || []).forEach(d => { o += dim(d); });
      o += `<line class="p-guide" x1="${f1(X(0))}" x2="${f1(X(0))}" y1="0" y2="${H}"/><line class="p-guide" x1="0" x2="${W}" y1="${f1(Y(0))}" y2="${f1(Y(0))}"/>`;
      (P.handles || []).forEach((hd, i) => { o += `<circle class="at-handle" data-akh="${i}" cx="${f1(X(hd.x))}" cy="${f1(Y(hd.y))}" r="7"><title>${esc(hd.title || 'Drag to change')}</title></circle>`; });
      return o;
    }
    function paintCanvas(e) { const el = $('#akSvg'); if (!el) return; const { W, H } = size(); el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.innerHTML = svg(e); }

    /* ---------- combinations and results ---------- */
    function combosHTML(e) {
      const m = e.fda, v = V(e), sh = shown(e);
      const head = spec.loads.map(n => `<th class="num"><math>${EC.mrender.ident(n)}</math><small> ${esc(v.def(n) && v.def(n).u ? EC.mrender.unitText(v.def(n).u) : '')}</small></th>`).join('');
      const rows = m.combos.map((c, ci) => { const r = S.runs && !S.dirty ? S.runs[ci] : null;
        return `<tr class="${r && ci === S.gov ? 'gov' : ''}"><td><input class="ak-name" data-akn="${ci}" value="${esc(c.name)}"></td>${spec.loads.map(n => `<td><input class="ak-v" type="number" step="any" data-akc="${ci}" data-akl="${esc(n)}" value="${esc(c.L[n] == null ? 0 : c.L[n])}"></td>`).join('')}
          <td>${r ? api.ubar(r.Umax == null ? NaN : r.Umax) : '<span class="badge">…</span>'}</td><td>${r ? `<span class="res ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'OK' : r.nBad ? r.nBad + ' not OK' : 'Revise'}</span>` : ''}</td>
          <td><label class="at-radio" title="Show this combination in the report"><input type="radio" name="akview" data-akview="${ci}" ${sh === ci && typeof m.view === 'number' ? 'checked' : ''}></label></td><td>${m.combos.length > 1 ? `<button class="btn sm" data-akdel="${ci}" title="Delete">${api.ic('x')}</button>` : ''}</td></tr>`; }).join('');
      return `<div class="tbl-wrap"><table class="tbl at-tbl ak-tbl"><thead><tr><th>Combination</th>${head}<th>U<sub>max</sub></th><th>Status</th><th>Report</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="at-row" style="margin-top:8px"><button class="btn sm" data-akadd>${api.ic('plus')}Add combination</button><label class="at-radio"><input type="radio" name="akview" data-akview="gov" ${typeof m.view !== 'number' ? 'checked' : ''}> Report shows the governing combination</label></div>`;
    }
    function resHTML(e) {
      const m = e.fda;
      if (S.msg) return `<div class="at-msg">${api.ic('alert')}${esc(S.msg)}</div>`;
      if (!S.runs) return `<div class="calcbusy"><span class="spin"></span>Running the worksheet for ${m.combos.length} combination${m.combos.length === 1 ? '' : 's'}…</div>`;
      const g = S.runs[S.gov], bad = (g.rows || []).filter(x => x.st && !/^(OK|PASS|N\/A|-|INFO|SATISFIED)/i.test(x.st.trim()));
      return `${S.busy || S.dirty ? '<div class="calcbusy"><span class="spin"></span>Updating…</div>' : ''}<div class="verdict-banner ${g.ok ? 'ok' : 'bad'}">${api.ic(g.ok ? 'check' : 'alert')}<div>${esc(g.result || (g.ok ? 'All checks satisfied' : 'REVISE'))}<div style="font-weight:400;font-size:12px;opacity:.85">Governing combination <b>${esc(m.combos[S.gov].name)}</b> · ${m.combos.length} worksheet run${m.combos.length === 1 ? '' : 's'}</div></div><div class="big">U<sub>max</sub> = ${fmt(g.Umax, 3)}</div></div>
        ${bad.length ? `<div class="at-bad"><b>Not OK in ${esc(m.combos[S.gov].name)}:</b> ${bad.map(x => `${esc(x.item)} <span class="res bad">${esc(x.st)}</span>`).join(' · ')}</div>` : ''}`;
    }
    function paintRes(e) { const el = $('#akRes'); if (el) el.innerHTML = resHTML(e); }
    function paintCombos(e) { const el = $('#akCombos'); if (el && !el.contains(document.activeElement)) el.innerHTML = combosHTML(e); }
    function paint(e) { paintCanvas(e); paintCombos(e); paintRes(e); }

    function view(e) {
      const d = doc();
      if (!d) { EC.mcui.loadSheet(spec.sheet).then(() => api.render(), err => api.toast(err.message)); return `<div class="empty">Loading worksheet ${esc(spec.sheet)}.mcdx…</div>`; }
      if (S.id !== e.id) Object.assign(S, { id: e.id, vw: null, runs: null, gov: 0, busy: false, dirty: true, msg: '', baseH: null });
      const opt = (arr, v) => arr.map(s => `<option ${String(s) === String(v) ? 'selected' : ''}>${esc(s)}</option>`).join('');
      return `<div class="page-head no-print"><div><a href="#/analysis" class="btn sm" style="margin-bottom:8px">${api.ic('back')}Design analysis</a>
          <h1><span style="color:var(--accent)">${esc(e.mark)}</span> · ${esc(spec.name)}</h1><div class="sub">${esc(spec.sub)} · worksheet <b>${esc(spec.sheet)}.mcdx</b>, one run per load combination</div></div>
        <div class="actions"><button class="btn" data-mrec>${api.ic('check')}Save record</button><a class="btn" href="#/el/${e.id}">${api.ic('book')}Worksheet element</a><button class="btn" data-print>${api.ic('print')}Print</button><button class="btn" data-dup="${e.id}">${api.ic('copy')}Duplicate</button><button class="btn danger" data-del="${e.id}">${api.ic('trash')}Delete</button></div></div>
        <div class="card no-print"><div class="el-head">
          <div><label>Mark</label><input data-m="mark" value="${esc(e.mark)}"></div><div><label>Level</label><input data-m="level" value="${esc(e.level || '')}"></div>
          <div><label>Grid / location</label><input data-m="grid" value="${esc(e.grid || '')}"></div><div><label>Quantity</label><input data-m="qty" type="number" min="1" value="${esc(e.qty || 1)}"></div>
          <div><label>Status</label><select data-m="status">${opt(api.STATUS, e.status)}</select></div><div><label>Designer</label><input data-m="assignee" value="${esc(e.assignee || '')}"></div></div></div>
        <div class="editor at-editor">
          <div class="card inputs"><div class="inp-head"><b>Worksheet inputs</b><span class="badge" style="background:var(--input-bg);border-color:var(--input-border)">geometry · materials · bars</span></div>
            <p class="at-hint" style="padding:0 14px">The plan follows these inputs; drag the round handles on the plan to change the sizes. Loads are typed per combination (right).</p>${EC.mcui.inputsHTML(e, d, spec.loads)}</div>
          <div class="at-main">
            <div class="card at-draw"><div class="at-bar no-print"><b>Plan</b><span class="at-hint" style="margin:0">true scale · mm</span><div class="at-grp at-set"><button class="btn sm" data-akfit>Fit</button></div></div>
              <div class="at-canvas" id="akCanvas" style="border-right:0"><svg id="akSvg" class="mplot drawing at-svg" role="img" aria-label="${esc(spec.name)} plan"></svg></div>
              <div class="plegend at-legend"><span><i class="lg-line p-outline"></i>Footing / cap</span><span><i class="lg-dot at-lg col"></i>Column / wall</span><span><i class="lg-dot" style="--c:var(--accent)"></i>Drag handle</span><span><i class="lg-line p-guide"></i>Axes</span></div></div>
            <div class="card"><div class="body"><h3 class="ksub" style="margin-top:0">Load combinations <small>· each row is a full run of the worksheet</small></h3><div id="akCombos">${combosHTML(e)}</div><div id="akRes" style="margin-top:12px">${resHTML(e)}</div></div></div>
            <h3 class="ksub at-rep">Calculation report <small>· worksheet ${esc(spec.sheet)}.mcdx</small></h3>
            <div id="out">${EC.mcui.vOutput(e)}</div>
          </div></div>`;
    }
    function mount(root, e) {
      paintCanvas(e);
      if (!S.runs || S.baseH !== JSON.stringify(free(e))) schedule(e, 0);
      if (window.ResizeObserver) { if (S.ro) S.ro.disconnect(); const ro = S.ro = new ResizeObserver(() => { const c = cur(); if (c && $('#akSvg')) paintCanvas(c); else ro.disconnect(); }); ro.observe($('#akCanvas')); }
      const el = $('#akSvg');
      el.addEventListener('pointerdown', ev => {
        const e = cur(); if (!e) return;
        const h = ev.target.closest('[data-akh]');
        if (h) { S.drag = { h: +h.dataset.akh, w0: world(ev), P: spec.plan(V(e)) }; }
        else S.drag = { pan: true, px: ev.clientX, py: ev.clientY, cx: S.vw.cx, cy: S.vw.cy };
        el.setPointerCapture(ev.pointerId);
      });
      el.addEventListener('pointermove', ev => {
        const e = cur(), D = S.drag; if (!e || !D) return;
        if (D.pan) { const k = size().W / el.getBoundingClientRect().width / S.vw.s; S.vw.cx = D.cx - (ev.clientX - D.px) * k; S.vw.cy = D.cy + (ev.clientY - D.py) * k; paintCanvas(e); return; }
        const w = world(ev), snap = e.fda.snap || 25, hd = D.P.handles[D.h];
        const ch = hd.set(Math.round((w.x - D.w0.x) / snap) * snap, Math.round((w.y - D.w0.y) / snap) * snap) || {};
        const v = V(e);
        Object.keys(ch).forEach(n => { if (!v.has(n) || !Number.isFinite(ch[n])) return; const def = v.def(n), val = LU[v.unit(n)] ? v.fromMM(n, ch[n]) : ch[n]; e.inputs[n] = v.ast(n, val); void def; });
        D.moved = true; paintCanvas(e);
      });
      const up = () => { const e = cur(), D = S.drag; S.drag = null; if (e && D && D.moved) { e.u = Date.now(); api.save(); api.render(); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', ev => { const e = cur(); if (!e) return; ev.preventDefault(); const w = world(ev), k = ev.deltaY < 0 ? 1.15 : 1 / 1.15; S.vw.s *= k; S.vw.cx = w.x - (w.x - S.vw.cx) / k; S.vw.cy = w.y - (w.y - S.vw.cy) / k; paintCanvas(e); }, { passive: false });
      root.onclick = ev => {
        const e = cur(); if (!e) return;
        const b = ev.target.closest('[data-akfit],[data-akadd],[data-akdel]'); if (!b) return;
        if (b.dataset.akfit !== undefined) { S.vw = null; paintCanvas(e); return; }
        if (b.dataset.akadd !== undefined) { const last = e.fda.combos[e.fda.combos.length - 1]; e.fda.combos.push({ name: 'ULS ' + (e.fda.combos.length + 1), L: Object.assign({}, last.L) }); }
        if (b.dataset.akdel !== undefined) { e.fda.combos.splice(+b.dataset.akdel, 1); if (typeof e.fda.view === 'number') e.fda.view = 'gov'; }
        e.u = Date.now(); api.save(); const box = $('#akCombos'); if (box) box.innerHTML = combosHTML(e); schedule(e);
      };
      root.oninput = ev => {
        const e = cur(), t = ev.target; if (!e) return;
        if (t.dataset.akc !== undefined) { const x = parseFloat(t.value); if (!Number.isFinite(x)) return; e.fda.combos[+t.dataset.akc].L[t.dataset.akl] = x; e.u = Date.now(); api.save(); schedule(e); }
        if (t.dataset.akn !== undefined) { e.fda.combos[+t.dataset.akn].name = t.value || 'Combination'; api.save(); }
      };
      root.onchange = ev => {
        const e = cur(), t = ev.target; if (!e) return;
        if (t.dataset.akview !== undefined) { e.fda.view = t.dataset.akview === 'gov' ? 'gov' : +t.dataset.akview; e.inputs = Object.assign(free(e), comboInputs(spec, doc(), e.fda, shown(e))); api.save(); EC.mcui.refresh(e); }
        if (t.dataset.akc !== undefined || t.dataset.akn !== undefined) paintCombos(e);
      };
    }
    function onResult(e) {
      if (e.id !== S.id) return;
      const h = JSON.stringify(free(e));
      if (S.baseH !== null && h !== S.baseH && !S.busy) { schedule(e, 50); return; }
      paintCanvas(e);
    }
    function create(a) {
      EC.mcui.loadSheet(spec.sheet).then(d => {
        const e = a.newEl('mc:' + spec.sheet, { fda: newModel(spec, d, {}), inputs: {} });
        location.hash = '#/analysis/' + e.id;
      }, err => a.toast(err.message));
    }
    EC.analysis.add(Object.assign({}, spec, {
      install(a) { api = a; }, create, view, mount, onResult,
      brief: e => (spec.brief ? spec.brief(V(e)) + ' · ' : '') + `${e.fda.combos.length} combination${e.fda.combos.length === 1 ? '' : 's'}`
    }));
  }
  EC.analysisKit = { values, comboInputs, newModel };
  if (EC.analysis) EC.analysis.kit = kit;
})(typeof window !== 'undefined' ? window : globalThis);
