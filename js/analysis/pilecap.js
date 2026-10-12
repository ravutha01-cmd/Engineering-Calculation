/* Foundation analysis - pile caps (Design analysis tool).
 * Draw piles, columns and walls on a true-scale plan, type the loads of each load combination, and the
 * Mathcad worksheet PileCap_Multi_EC2-2023_Standalone designs the cap: it runs once per combination
 * (worksheet: "run the worksheet once per combination"), the governing combination is the one with the
 * largest utilisation and its full step-by-step report is shown below the drawing.
 * Drawing -> worksheet inputs: js/analysis/pilecap_model.js. Style: the app's plot style (css "Plots"). */
(function () {
  'use strict';
  const EC = window.EC, PM = EC.pilecapModel, SHEET = PM.SHEET, TYPE = 'mc:' + SHEET;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let api = null;
  const S = { id: null, tool: 'select', sel: null, vw: null, drag: null, wall0: null, ptr: null, ci: 0, runs: null, gov: 0, busy: false, dirty: true, msg: '', undo: [], redo: [], baseH: null, labels: true, typing: false };
  let runTok = 0, anaT = null;
  const $ = s => document.querySelector(s);
  const fmt = (v, d) => (Number.isFinite(v) ? api.fmt(v, d == null ? 0 : d) : '–');
  const cur = () => { if (!api) return null; const r = api.route(); if (r[0] !== 'analysis' || !r[1]) return null; const e = api.proj().elements.find(x => x.id === r[1]); return e && e.fda && e.fda.tool === 'pilecap' ? e : null; };

  /* ---------- worksheet values used by the drawing ---------- */
  function wsVal(e, n, dflt) {
    const doc = EC.mcui.docs[SHEET], i = doc && (doc.inputs || []).find(x => x.n === n);
    if (!i) return dflt;
    const o = (e.inputs || {})[n];
    if (o === undefined) return i.v;
    if (typeof o === 'number') return o;
    if (Array.isArray(o) && o[0] === 'o' && typeof o[2] === 'number') return o[2];
    return i.v;
  }
  const pileD = e => wsVal(e, 'h_pile', 600), isRound = e => wsVal(e, 'h_type', 0) === 1, edgeD = e => wsVal(e, 'e_p', 200), NRd = e => wsVal(e, 'N_Rd;p', 2800);
  function capLocal(e) {   // same rule as the worksheet (x_lo = min x_p - h/2 - e_p ...); the worksheet value is used once it has run
    const P = e.fda.piles; if (!P.length) return null;
    const a = pileD(e) / 2 + edgeD(e);
    return { x0: Math.min(...P.map(p => p.x)) - a, x1: Math.max(...P.map(p => p.x)) + a, y0: Math.min(...P.map(p => p.y)) - a, y1: Math.max(...P.map(p => p.y)) + a };
  }

  /* ---------- worksheet results ---------- */
  let IDX = null;
  function idx() {
    if (IDX) return IDX;
    IDX = {};
    EC.mcui.flatten(SHEET).forEach((r, i) => { if (r.k === 'm' && r.e[0] === 'def' && r.e[1][0] === 'v') IDX[r.e[1][1]] = i; });
    return IDX;
  }
  const UF = { mm: 1, cm: 10, m: 1000, N: 0.001, kN: 1, MN: 1000 };
  function num(v) { if (!v || v.n == null) return NaN; const u = v.uA ? EC.mrender.unitText(v.uA).trim() : ''; return v.n * (UF[u] == null ? 1 : UF[u]); }
  function extract(r) {
    const I = idx(), g = n => (r.vals[I[n]] || {}).v;
    const R = g('R_i'), Rs = R && R.cells ? R.cells.map(num) : [];
    const s = r.summary;
    return { Umax: s.Umax, ok: s.ok, result: s.result, rows: s.rows, nBad: s.nBad, errors: r.errors, R: Rs, Rmax: Rs.length ? Math.max(...Rs) : NaN, Rmin: Rs.length ? Math.min(...Rs) : NaN,
      cap: { x0: num(g('x_lo')), x1: num(g('x_hi')), y0: num(g('y_lo')), y1: num(g('y_hi')) }, capTxt: (g('Cap') || {}).s || '', P: num(g('P_Ed')) };
  }
  const geomFree = e => { const o = {}; Object.keys(e.inputs || {}).forEach(k => { if (!PM.GEOM.includes(k)) o[k] = e.inputs[k]; }); return o; };
  const shownCombo = e => (typeof e.fda.view === 'number' && e.fda.view < e.fda.combos.length ? e.fda.view : S.gov);

  function schedule(e, ms) { S.dirty = true; clearTimeout(anaT); anaT = setTimeout(() => analyse(e), ms == null ? 450 : ms); }
  async function analyse(e) {
    const tok = ++runTok, m = e.fda;
    const pr = PM.problems(m);
    if (pr.length) { S.runs = null; S.busy = false; S.msg = pr.join(' '); paintResults(e); return; }
    S.busy = true; S.msg = ''; paintResults(e);
    const base = geomFree(e), runs = [];
    try {
      await EC.mcui.loadSheet(SHEET);
      for (let ci = 0; ci < m.combos.length; ci++) {
        const r = await EC.mcui.compute(SHEET, Object.assign({}, base, PM.inputs(m, ci)));
        if (tok !== runTok) return;
        runs.push(extract(r));
      }
    } catch (err) { if (tok !== runTok) return; S.busy = false; S.msg = 'Worksheet error: ' + err.message; paintResults(e); return; }
    let g = 0;
    runs.forEach((x, i) => { const a = x.Umax == null ? -1 : x.Umax, b = runs[g].Umax == null ? -1 : runs[g].Umax; if (a > b + 1e-9 || (Math.abs(a - b) <= 1e-9 && x.Rmax > runs[g].Rmax)) g = i; });
    S.runs = runs; S.gov = g; S.baseH = JSON.stringify(base); S.busy = false; S.dirty = false;
    applyView(e);
    paint(e);
  }
  /* the worksheet element keeps the inputs of the combination shown in the report (governing by default) */
  function applyView(e) {
    const ci = shownCombo(e), ins = PM.inputs(e.fda, ci);
    e.inputs = Object.assign(geomFree(e), ins);
    api.save();
    EC.mcui.refresh(e);
  }

  /* ---------- undo ---------- */
  function snap(e) { S.undo.push(JSON.stringify(e.fda)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
  function commit(e, structural) { e.u = Date.now(); api.save(); if (structural) paintProps(e); paintCanvas(e); paintCombos(e); schedule(e); }
  function undo(e, redo) {
    const a = redo ? S.redo : S.undo, b = redo ? S.undo : S.redo;
    if (!a.length) return;
    b.push(JSON.stringify(e.fda)); e.fda = JSON.parse(a.pop());
    if (S.sel && !findObj(e, S.sel)) S.sel = null;
    S.ci = Math.min(S.ci, e.fda.combos.length - 1);
    commit(e, true);
  }
  const findObj = (e, sel) => sel && (sel.t === 'p' ? e.fda.piles : sel.t === 'c' ? e.fda.cols : e.fda.walls).find(o => o.id === sel.id);

  /* ---------- view transform (world mm, y up) ---------- */
  function size() { const box = $('#atCanvas'); const W = Math.max(280, box ? box.clientWidth : 700); return { W, H: Math.round(Math.max(320, Math.min(600, W * 0.62))) }; }
  function bounds(e) {
    const m = e.fda, c = capLocal(e), xs = [], ys = [];
    if (c) { xs.push(c.x0, c.x1); ys.push(c.y0, c.y1); }
    m.cols.forEach(o => { xs.push(o.x - o.bx / 2, o.x + o.bx / 2); ys.push(o.y - o.by / 2, o.y + o.by / 2); });
    m.walls.forEach(o => { xs.push(o.x1, o.x2); ys.push(o.y1, o.y2); });
    if (!xs.length) return { x0: -3000, x1: 3000, y0: -2000, y1: 2000 };
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  function fit(e) {
    const { W, H } = size(), b = bounds(e), mx = 78, my = 66;
    const bw = Math.max(b.x1 - b.x0, 1500), bh = Math.max(b.y1 - b.y0, 1500);
    S.vw = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s: Math.min((W - 2 * mx) / bw, (H - 2 * my) / bh) };
  }
  const X = x => size().W / 2 + (x - S.vw.cx) * S.vw.s;
  const Y = y => size().H / 2 - (y - S.vw.cy) * S.vw.s;
  function toWorld(ev) {
    const svg = $('#atSvg'), r = svg.getBoundingClientRect(), { W, H } = size();
    const px = (ev.clientX - r.left) * W / r.width, py = (ev.clientY - r.top) * H / r.height;
    return { x: S.vw.cx + (px - W / 2) / S.vw.s, y: S.vw.cy - (py - H / 2) / S.vw.s };
  }
  const snapV = (e, v) => { const g = e.fda.snap || 50; return Math.round(v / g) * g; };

  /* ---------- drawing ---------- */
  const f1 = v => (+v).toFixed(1);
  const uCls = (R, Nr) => (!Number.isFinite(R) ? '' : R < 0 ? 'u-up' : R / Nr > 1 + 1e-6 ? 'u-bad' : R / Nr > 0.9 ? 'u-hi' : 'u-ok');
  function dimH(x0, x1, y, txt) { return `<line class="pdim" x1="${f1(x0)}" x2="${f1(x1)}" y1="${f1(y)}" y2="${f1(y)}"/><path class="pdim" d="M${f1(x0)} ${f1(y - 4)}L${f1(x0)} ${f1(y + 4)}M${f1(x1)} ${f1(y - 4)}L${f1(x1)} ${f1(y + 4)}"/><text class="pdt at-halo" x="${f1((x0 + x1) / 2)}" y="${f1(y - 4)}" text-anchor="middle">${txt}</text>`; }
  function dimV(y0, y1, x, txt) { const cy = (y0 + y1) / 2; return `<line class="pdim" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(y0)}" y2="${f1(y1)}"/><path class="pdim" d="M${f1(x - 4)} ${f1(y0)}L${f1(x + 4)} ${f1(y0)}M${f1(x - 4)} ${f1(y1)}L${f1(x + 4)} ${f1(y1)}"/><text class="pdt at-halo" x="${f1(x - 5)}" y="${f1(cy)}" text-anchor="middle" transform="rotate(-90 ${f1(x - 5)} ${f1(cy)})">${txt}</text>`; }
  function svgPlan(e) {
    const m = e.fda, { W, H } = size(), s = S.vw.s;
    const run = S.runs && !S.dirty ? S.runs[shownCombo(e)] : null;
    const cap = run && Number.isFinite(run.cap.x0) ? run.cap : capLocal(e);
    const d = pileD(e), Nr = NRd(e), round = isRound(e);
    let o = '';
    // grid
    const steps = [50, 100, 250, 500, 1000, 2500, 5000, 10000], g = steps.find(t => t * s >= 28) || 10000;
    const wx0 = S.vw.cx - W / 2 / s, wx1 = S.vw.cx + W / 2 / s, wy0 = S.vw.cy - H / 2 / s, wy1 = S.vw.cy + H / 2 / s;
    for (let x = Math.ceil(wx0 / g) * g; x <= wx1; x += g) o += `<line class="pg" x1="${f1(X(x))}" x2="${f1(X(x))}" y1="0" y2="${H}"/>`;
    for (let y = Math.ceil(wy0 / g) * g; y <= wy1; y += g) o += `<line class="pg" x1="0" x2="${W}" y1="${f1(Y(y))}" y2="${f1(Y(y))}"/>`;
    o += `<line class="p-guide" x1="${f1(X(0))}" x2="${f1(X(0))}" y1="0" y2="${H}"/><line class="p-guide" x1="0" x2="${W}" y1="${f1(Y(0))}" y2="${f1(Y(0))}"/>`;
    o += `<text class="pt" x="${W - 8}" y="${f1(Y(0) - 5)}" text-anchor="end">x</text><text class="pt" x="${f1(X(0) + 6)}" y="12">y</text>`;
    // cap
    if (cap) {
      o += `<path class="p-outline" d="M${f1(X(cap.x0))} ${f1(Y(cap.y0))}H${f1(X(cap.x1))}V${f1(Y(cap.y1))}H${f1(X(cap.x0))}Z"><title>Pile cap ${fmt(cap.x1 - cap.x0)} × ${fmt(cap.y1 - cap.y0)} mm${run && run.capTxt ? ' · ' + esc(run.capTxt) : ''}</title></path>`;
      o += dimH(X(cap.x0), X(cap.x1), Y(cap.y0) + 40, fmt(cap.x1 - cap.x0));
      o += dimV(Y(cap.y1), Y(cap.y0), X(cap.x0) - 40, fmt(cap.y1 - cap.y0));
      const ux = [...new Set(m.piles.map(p => Math.round(p.x)))].sort((a, b) => a - b), uy = [...new Set(m.piles.map(p => Math.round(p.y)))].sort((a, b) => a - b);
      if (ux.length > 1 && ux.length <= 10) { const yy = Y(cap.y1) - 22; o += `<line class="pext" x1="${f1(X(ux[0]))}" x2="${f1(X(ux[0]))}" y1="${f1(yy - 4)}" y2="${f1(Y(cap.y1))}"/>`; for (let i = 1; i < ux.length; i++) o += dimH(X(ux[i - 1]), X(ux[i]), yy, fmt(ux[i] - ux[i - 1])); }
      if (uy.length > 1 && uy.length <= 10) { const xx = X(cap.x1) + 22; for (let i = 1; i < uy.length; i++) o += dimV(Y(uy[i]), Y(uy[i - 1]), xx + 10, fmt(uy[i] - uy[i - 1])); }
    }
    // piles
    m.piles.forEach((p, i) => {
      const R = run ? run.R[i] : NaN, cls = uCls(R, Nr), r = Math.max(3, d / 2 * s);
      const sel = S.sel && S.sel.t === 'p' && S.sel.id === p.id;
      const shape = round ? `<circle class="at-pile ${cls}" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="${f1(r)}"/>` : `<rect class="at-pile ${cls}" x="${f1(X(p.x) - r)}" y="${f1(Y(p.y) - r)}" width="${f1(2 * r)}" height="${f1(2 * r)}"/>`;
      o += `<g data-o="p:${p.id}" class="at-obj">${shape}${sel ? `<circle class="at-sel" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="${f1(r + 5)}"/>` : ''}
        ${r > 8 ? `<text class="at-num" x="${f1(X(p.x))}" y="${f1(Y(p.y) + 4)}" text-anchor="middle">${i + 1}</text>` : ''}
        ${S.labels && Number.isFinite(R) ? `<text class="at-lbl at-halo" x="${f1(X(p.x))}" y="${f1(Y(p.y) + r + 13)}" text-anchor="middle">${fmt(R)} kN</text>` : ''}
        <title>Pile ${i + 1} · x = ${fmt(p.x)}, y = ${fmt(p.y)} mm${Number.isFinite(R) ? ` · R = ${fmt(R)} kN · R/N_Rd = ${fmt(R / Nr, 2)}` : ''}</title></g>`;
    });
    // walls (segments = worksheet load nodes)
    const ci = S.ci, nodes = PM.nodes(m, ci);
    m.walls.forEach((w, i) => {
      const h = PM.isHoriz(w), t = w.t * s / 2;
      const ax = Math.min(w.x1, w.x2), bx = Math.max(w.x1, w.x2), ay = Math.min(w.y1, w.y2), by = Math.max(w.y1, w.y2);
      const x0 = h ? X(ax) : X(w.x1) - t, x1 = h ? X(bx) : X(w.x1) + t, y0 = h ? Y(w.y1) - t : Y(by), y1 = h ? Y(w.y1) + t : Y(ay);
      const sel = S.sel && S.sel.t === 'w' && S.sel.id === w.id, l = PM.loadOf(w, ci);
      const segs = nodes.filter(n => n.src === w.id);
      let ticks = ''; segs.slice(1).forEach(n => { const c = h ? X(n.x - n.wx / 2) : Y(n.y - n.wy / 2); ticks += h ? `<line class="at-seg" x1="${f1(c)}" x2="${f1(c)}" y1="${f1(y0)}" y2="${f1(y1)}"/>` : `<line class="at-seg" x1="${f1(x0)}" x2="${f1(x1)}" y1="${f1(c)}" y2="${f1(c)}"/>`; });
      o += `<g data-o="w:${w.id}" class="at-obj"><rect class="at-wall" x="${f1(x0)}" y="${f1(y0)}" width="${f1(Math.max(2, x1 - x0))}" height="${f1(Math.max(2, y1 - y0))}"/>${ticks}
        ${sel ? `<rect class="at-sel" x="${f1(x0 - 4)}" y="${f1(y0 - 4)}" width="${f1(x1 - x0 + 8)}" height="${f1(y1 - y0 + 8)}"/>` : ''}
        ${S.labels ? `<text class="at-lbl at-halo" x="${f1((x0 + x1) / 2)}" y="${f1(h ? y0 - 6 : (y0 + y1) / 2)}" text-anchor="${h ? 'middle' : 'start'}" ${h ? '' : `dx="${f1(t + 8)}"`}>W${i + 1} · N ${fmt(l.N)} kN</text>` : ''}
        <title>Wall W${i + 1} · ${fmt(PM.wallLen(w))} × ${fmt(w.t)} mm · ${segs.length} load node${segs.length === 1 ? '' : 's'} · N = ${fmt(l.N)} kN</title></g>`;
      if (sel) [[w.x1, w.y1, 1], [w.x2, w.y2, 2]].forEach(([x, y, k]) => { o += `<circle class="at-handle" data-h="w:${w.id}:${k}" cx="${f1(X(x))}" cy="${f1(Y(y))}" r="6"/>`; });
    });
    // columns
    m.cols.forEach((c, i) => {
      const x0 = X(c.x - c.bx / 2), y0 = Y(c.y + c.by / 2), w = c.bx * s, hh = c.by * s, l = PM.loadOf(c, ci);
      const sel = S.sel && S.sel.t === 'c' && S.sel.id === c.id;
      o += `<g data-o="c:${c.id}" class="at-obj"><rect class="at-col" x="${f1(x0)}" y="${f1(y0)}" width="${f1(Math.max(3, w))}" height="${f1(Math.max(3, hh))}"/>
        <path class="at-seg" d="M${f1(x0)} ${f1(y0)}L${f1(x0 + w)} ${f1(y0 + hh)}M${f1(x0 + w)} ${f1(y0)}L${f1(x0)} ${f1(y0 + hh)}"/>
        ${sel ? `<rect class="at-sel" x="${f1(x0 - 4)}" y="${f1(y0 - 4)}" width="${f1(w + 8)}" height="${f1(hh + 8)}"/>` : ''}
        ${S.labels ? `<text class="at-lbl at-halo" x="${f1(x0 + w / 2)}" y="${f1(y0 + hh + 13)}" text-anchor="middle">C${i + 1} · N ${fmt(l.N)} kN${l.My || l.Mx ? ` · M ${fmt(l.My)}/${fmt(l.Mx)}` : ''}</text>` : ''}
        <title>Column C${i + 1} · ${fmt(c.bx)} × ${fmt(c.by)} mm at (${fmt(c.x)}, ${fmt(c.y)}) · N = ${fmt(l.N)} kN, M_y = ${fmt(l.My)}, M_x = ${fmt(l.Mx)} kNm, H_x = ${fmt(l.Hx)}, H_y = ${fmt(l.Hy)} kN</title></g>`;
    });
    // pile-group centroid and resultant of the edited combination
    if (m.piles.length) {
      const gx = m.piles.reduce((a, p) => a + p.x, 0) / m.piles.length, gy = m.piles.reduce((a, p) => a + p.y, 0) / m.piles.length;
      o += `<path class="p-guide at-cg" d="M${f1(X(gx) - 7)} ${f1(Y(gy))}H${f1(X(gx) + 7)}M${f1(X(gx))} ${f1(Y(gy) - 7)}V${f1(Y(gy) + 7)}"><title>Centroid of the pile group (${fmt(gx)}, ${fmt(gy)})</title></path>`;
      const r = PM.resultant(m, ci);
      if (r.N > 0 && (m.cols.length || m.walls.length)) o += `<g class="at-res"><circle cx="${f1(X(r.x))}" cy="${f1(Y(r.y))}" r="4.5"/><title>Resultant of ${esc(m.combos[ci].name)}: ΣN = ${fmt(r.N)} kN at (${fmt(r.x)}, ${fmt(r.y)}) - eccentricity to the pile centroid e_x = ${fmt(r.x - gx)}, e_y = ${fmt(r.y - gy)} mm (H·D_cap added by the worksheet)</title></g>`;
    }
    // wall being drawn
    if (S.tool === 'wall' && S.wall0 && S.ptr) { const b = wallEnd(S.wall0, S.ptr); o += `<line class="at-draft" x1="${f1(X(S.wall0.x))}" y1="${f1(Y(S.wall0.y))}" x2="${f1(X(b.x))}" y2="${f1(Y(b.y))}"/>`; }
    if (S.ptr && S.tool !== 'select') o += `<circle class="at-cursor" cx="${f1(X(S.ptr.x))}" cy="${f1(Y(S.ptr.y))}" r="3"/>`;
    return o;
  }
  const wallEnd = (a, b) => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
  function paintCanvas(e) {
    const svg = $('#atSvg'); if (!svg || !e) return;
    const { W, H } = size();
    if (!S.vw) fit(e);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = svgPlan(e);
    svg.dataset.tool = S.tool;
    const st = $('#atPtr'); if (st) st.textContent = S.ptr ? `x = ${fmt(S.ptr.x)}  y = ${fmt(S.ptr.y)} mm` : '';
  }

  /* ---------- side panel: selection / model ---------- */
  const fld = (k, lab, v, u, extra) => `<label class="at-f"><span>${lab}</span><input type="number" step="any" data-atf="${k}" value="${esc(Number.isFinite(+v) ? +(+v).toFixed(3) : v)}" ${extra || ''}><small>${u || ''}</small></label>`;
  const loadFields = (o, ci) => { const l = PM.loadOf(o, ci); return `<div class="at-sub">Loads · ${esc(S.cur.fda.combos[ci].name)}</div>${fld('L.N', 'N <small>compression +</small>', l.N, 'kN')}${fld('L.My', 'M<sub>y</sub> <small>+ loads +x piles</small>', l.My, 'kNm')}${fld('L.Mx', 'M<sub>x</sub> <small>+ loads +y piles</small>', l.Mx, 'kNm')}${fld('L.Hx', 'H<sub>x</sub>', l.Hx, 'kN')}${fld('L.Hy', 'H<sub>y</sub>', l.Hy, 'kN')}`; };
  function propsHTML(e) {
    const m = e.fda, o = findObj(e, S.sel), run = S.runs && !S.dirty ? S.runs[shownCombo(e)] : null, Nr = NRd(e);
    if (o && S.sel.t === 'p') {
      const i = m.piles.indexOf(o), env = S.runs && !S.dirty ? S.runs.map(r => r.R[i]) : [];
      return `<h4>Pile ${i + 1}</h4>${fld('x', 'x', o.x, 'mm')}${fld('y', 'y', o.y, 'mm')}
        ${env.length ? `<div class="at-sub">Reactions (worksheet R<sub>i</sub>)</div><table class="at-mini">${m.combos.map((c, k) => `<tr class="${k === S.gov ? 'gov' : ''}"><td>${esc(c.name)}</td><td class="num">${fmt(env[k])} kN</td><td class="num">${fmt(env[k] / Nr, 2)}</td></tr>`).join('')}</table>` : ''}
        <p class="at-hint">Size, type and N<sub>Rd,p</sub> of all piles: worksheet inputs (left).</p><button class="btn sm danger" data-atdel>${api.ic('trash')}Delete pile</button>`;
    }
    if (o && S.sel.t === 'c') {
      const i = m.cols.indexOf(o);
      return `<h4>Column C${i + 1}</h4>${fld('x', 'x (centre)', o.x, 'mm')}${fld('y', 'y (centre)', o.y, 'mm')}${fld('bx', 'b<sub>x</sub>', o.bx, 'mm', 'min="50"')}${fld('by', 'b<sub>y</sub>', o.by, 'mm', 'min="50"')}${loadFields(o, S.ci)}
        <p class="at-hint">Worksheet node type <b>Column</b>: punching is checked around it.</p><button class="btn sm danger" data-atdel>${api.ic('trash')}Delete column</button>`;
    }
    if (o && S.sel.t === 'w') {
      const i = m.walls.indexOf(o), n = PM.nodes(m, S.ci).filter(x => x.src === o.id).length;
      return `<h4>Wall W${i + 1}</h4>${fld('x1', 'x<sub>1</sub>', o.x1, 'mm')}${fld('y1', 'y<sub>1</sub>', o.y1, 'mm')}${fld('x2', 'x<sub>2</sub>', o.x2, 'mm')}${fld('y2', 'y<sub>2</sub>', o.y2, 'mm')}${fld('t', 'Thickness t', o.t, 'mm', 'min="50"')}${loadFields(o, S.ci)}
        <p class="at-hint">Worksheet node type <b>Wall</b> (one-way shear, no punching), cut into ${n} node${n === 1 ? '' : 's'} of ≤ ${fmt(m.seg)} mm. N, H and the out-of-plane moment are shared by length; the in-plane moment becomes a linear share of N (ΣN<sub>i</sub>·e<sub>i</sub> = M). Loads at the wall centre.</p><button class="btn sm danger" data-atdel>${api.ic('trash')}Delete wall</button>`;
    }
    const r = PM.resultant(m, S.ci);
    return `<h4>Model</h4><table class="at-mini"><tr><td>Piles</td><td class="num">${m.piles.length}</td></tr><tr><td>Columns</td><td class="num">${m.cols.length}</td></tr><tr><td>Walls</td><td class="num">${m.walls.length}</td></tr><tr><td>Worksheet load nodes</td><td class="num">${PM.nodes(m, S.ci).length}</td></tr>
      <tr><td>ΣN · ${esc(m.combos[S.ci].name)}</td><td class="num">${fmt(r.N)} kN</td></tr><tr><td>Pile capacity n·N<sub>Rd,p</sub></td><td class="num">${fmt(m.piles.length * Nr)} kN</td></tr>${run ? `<tr><td>Cap (worksheet)</td><td class="num">${esc(run.capTxt.split(',').slice(-1)[0] || '')}</td></tr>` : ''}</table>
      <div class="at-sub">Combination ${S.ci + 1}</div><label class="at-f wide"><span>Name</span><input data-atcname value="${esc(m.combos[S.ci].name)}"></label>
      <div class="at-row"><button class="btn sm" data-atcadd>${api.ic('plus')}Add (copy loads)</button>${m.combos.length > 1 ? `<button class="btn sm danger" data-atcdel>${api.ic('trash')}Delete</button>` : ''}</div>
      <p class="at-hint"><b>Draw:</b> pick a tool, click the plan. Wall: click start and end (horizontal or vertical). <b>Select</b> to move (snap ${fmt(m.snap)} mm) or edit. Wheel = zoom, drag the background = pan. Keys V P C W, Del, Ctrl+Z.<br>Sign convention of the worksheet: plan x right, y up, N + = compression; M<sub>y</sub> &gt; 0 loads the piles at +x, M<sub>x</sub> &gt; 0 those at +y; H acts at the column base (H·D<sub>cap</sub> added).</p>`;
  }
  function paintProps(e) { const el = $('#atProps'); if (el) el.innerHTML = propsHTML(e); }
  function combosHTML(e) {
    const m = e.fda;
    return `<span class="at-cl">Loads of</span>${m.combos.map((c, i) => { const r = S.runs && !S.dirty ? S.runs[i] : null; return `<button class="at-chip ${i === S.ci ? 'on' : ''} ${r ? (r.ok ? 'ok' : 'bad') : ''}" data-atci="${i}" title="Edit the loads of ${esc(c.name)}">${esc(c.name)}${r ? ` <b>${fmt(r.Umax, 2)}</b>` : ''}${S.runs && !S.dirty && i === S.gov && m.combos.length > 1 ? ' <i>gov.</i>' : ''}</button>`; }).join('')}<button class="at-chip add" data-atcadd title="New combination (copies the loads of the current one)">${api.ic('plus')}</button>`;
  }
  function paintCombos(e) { const el = $('#atCombos'); if (el) el.innerHTML = combosHTML(e); }

  /* ---------- results ---------- */
  function resultsHTML(e) {
    const m = e.fda, Nr = NRd(e);
    if (S.msg) return `<div class="body"><div class="at-msg">${api.ic('alert')}${esc(S.msg)}</div></div>`;
    if (!S.runs) return `<div class="body"><div class="calcbusy"><span class="spin"></span>Running the worksheet for ${m.combos.length} combination${m.combos.length === 1 ? '' : 's'}…</div></div>`;
    const R = S.runs, g = R[S.gov], sh = shownCombo(e);
    const busy = S.busy || S.dirty ? `<div class="calcbusy"><span class="spin"></span>Updating - ${m.combos.length} worksheet run${m.combos.length === 1 ? '' : 's'}…</div>` : '';
    const comboRows = m.combos.map((c, i) => { const r = R[i]; if (!r) return ''; const sum = PM.resultant(m, i);
      return `<tr class="${i === S.gov ? 'gov' : ''}"><td><label class="at-radio"><input type="radio" name="atview" data-atview="${i}" ${sh === i ? 'checked' : ''}> ${esc(c.name)}</label>${i === S.gov ? ' <span class="badge">governing</span>' : ''}</td><td class="num">${fmt(sum.N)}</td><td class="num">${fmt(r.Rmax)}</td><td class="num">${fmt(r.Rmin)}</td><td>${api.ubar(r.Umax == null ? NaN : r.Umax)}</td><td><span class="res ${r.ok ? 'ok' : 'bad'}">${esc(r.ok ? 'OK' : (r.nBad ? r.nBad + ' not OK' : 'Revise'))}</span></td></tr>`; }).join('');
    const many = m.combos.length > 6;
    const pileRows = m.piles.map((p, i) => { const env = R.map(r => r.R[i]), mx = Math.max(...env), mn = Math.min(...env);
      return `<tr data-atpile="${p.id}" class="click"><td>${i + 1}</td><td class="num">${fmt(p.x)}</td><td class="num">${fmt(p.y)}</td>${many ? '' : env.map(v => `<td class="num">${fmt(v)}</td>`).join('')}<td class="num"><b>${fmt(mx)}</b></td><td class="num">${fmt(mn)}</td><td>${api.ubar(mx / Nr)}</td></tr>`; }).join('');
    const bad = (g.rows || []).filter(x => x.st && !/^(OK|PASS|N\/A|-|INFO|SATISFIED)/i.test(x.st.trim()));
    return `${busy}<div class="body">
      <div class="verdict-banner ${g.ok ? 'ok' : 'bad'}">${api.ic(g.ok ? 'check' : 'alert')}<div>${esc(g.result || (g.ok ? 'All checks satisfied' : 'REVISE'))}<div style="font-weight:400;font-size:12px;opacity:.85">Governing combination <b>${esc(m.combos[S.gov].name)}</b> · ${m.combos.length} worksheet run${m.combos.length === 1 ? '' : 's'} · ${esc(g.capTxt)}</div></div><div class="big">U<sub>max</sub> = ${fmt(g.Umax, 3)}</div></div>
      ${bad.length ? `<div class="at-bad"><b>Not OK in ${esc(m.combos[S.gov].name)}:</b> ${bad.map(x => `${esc(x.item)} <span class="res bad">${esc(x.st)}</span>`).join(' · ')}</div>` : ''}
      <h3 class="ksub">Load combinations <small>· each one is a full run of the worksheet; the report below shows the ticked one</small></h3>
      <div class="tbl-wrap"><table class="tbl at-tbl"><thead><tr><th>Combination</th><th class="num">ΣN (kN)</th><th class="num">R<sub>max</sub> (kN)</th><th class="num">R<sub>min</sub> (kN)</th><th>U<sub>max</sub></th><th>Status</th></tr></thead><tbody>${comboRows}</tbody></table></div>
      <label class="at-radio" style="margin:6px 0 0;display:inline-flex"><input type="radio" name="atview" data-atview="gov" ${e.fda.view === 'gov' || typeof e.fda.view !== 'number' ? 'checked' : ''}> Always show the governing combination</label>
      <h3 class="ksub">Pile reactions <small>· worksheet R<sub>i</sub>, rigid cap, N<sub>Rd,p</sub> = ${fmt(Nr)} kN</small></h3>
      <div class="tbl-wrap at-ptbl"><table class="tbl at-tbl"><thead><tr><th>Pile</th><th class="num">x (mm)</th><th class="num">y (mm)</th>${many ? '' : m.combos.map(c => `<th class="num">${esc(c.name)}</th>`).join('')}<th class="num">R<sub>max</sub></th><th class="num">R<sub>min</sub></th><th>R<sub>max</sub>/N<sub>Rd,p</sub></th></tr></thead><tbody>${pileRows}</tbody></table></div>
    </div>`;
  }
  function paintResults(e) { const el = $('#atRes'); if (el) el.innerHTML = resultsHTML(e); }
  function paint(e) { paintCanvas(e); paintProps(e); paintCombos(e); paintResults(e); }

  /* ---------- page ---------- */
  function legend() {
    return `<div class="plegend at-legend"><span><i class="lg-line p-outline"></i>Pile cap</span><span><i class="lg-dot at-lg u-ok"></i>Pile R/N<sub>Rd</sub> ≤ 0.9</span><span><i class="lg-dot at-lg u-hi"></i>0.9–1.0</span><span><i class="lg-dot at-lg u-bad"></i>&gt; 1.0</span><span><i class="lg-dot at-lg u-up"></i>uplift</span><span><i class="lg-dot at-lg col"></i>Column / wall (segments = load nodes)</span><span><i class="lg-dot at-lg res"></i>Resultant</span><span><i class="lg-line p-guide"></i>Axes / pile centroid</span></div>`;
  }
  function view(e) {
    const doc = EC.mcui.docs[SHEET];
    if (!doc) { EC.mcui.loadSheet(SHEET).then(() => api.render(), err => api.toast(err.message)); return `<div class="empty">Loading worksheet ${esc(SHEET)}.mcdx…</div>`; }
    if (S.id !== e.id) Object.assign(S, { id: e.id, sel: null, vw: null, wall0: null, ci: 0, runs: null, gov: 0, busy: false, dirty: true, msg: '', undo: [], redo: [], baseH: null });
    S.cur = e; S.ci = Math.min(S.ci, e.fda.combos.length - 1);
    const opt = (arr, v) => arr.map(s => `<option ${String(s) === String(v) ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const tb = (k, ic, lab, key) => `<button class="btn sm at-tool ${S.tool === k ? 'on' : ''}" data-attool="${k}" title="${lab} (${key})" aria-pressed="${S.tool === k}">${ic}<span>${lab}</span></button>`;
    const svgI = d => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const nEdit = Object.keys(geomFree(e)).length;
    return `<div class="page-head no-print"><div><a href="#/analysis" class="btn sm" style="margin-bottom:8px">${api.ic('back')}Design analysis</a>
        <h1><span style="color:var(--accent)">${esc(e.mark)}</span> · Foundation analysis - pile cap</h1><div class="sub">Draw piles, columns and walls · worksheet <b>${esc(SHEET)}.mcdx</b> designs the cap (EN 1992-1-1:2023), one run per load combination</div></div>
      <div class="actions"><button class="btn" data-mrec>${api.ic('check')}Save record</button><a class="btn" href="#/el/${e.id}">${api.ic('book')}Worksheet element</a><button class="btn" data-print>${api.ic('print')}Print</button><button class="btn" data-dup="${e.id}">${api.ic('copy')}Duplicate</button><button class="btn danger" data-del="${e.id}">${api.ic('trash')}Delete</button></div></div>
      <div class="card no-print"><div class="el-head">
        <div><label>Mark</label><input data-m="mark" value="${esc(e.mark)}"></div>
        <div><label>Level</label><input data-m="level" value="${esc(e.level || '')}"></div>
        <div><label>Grid / location</label><input data-m="grid" value="${esc(e.grid || '')}"></div>
        <div><label>Quantity</label><input data-m="qty" type="number" min="1" value="${esc(e.qty || 1)}"></div>
        <div><label>Status</label><select data-m="status">${opt(api.STATUS, e.status)}</select></div>
        <div><label>Designer</label><input data-m="assignee" value="${esc(e.assignee || '')}"></div>
      </div></div>
      <div class="editor at-editor">
        <div class="card inputs"><div class="inp-head"><b>Worksheet inputs</b><span class="badge" style="background:var(--input-bg);border-color:var(--input-border)">piles · cap · materials</span>${nEdit ? `<span class="badge n-edit">${nEdit} edited</span>` : ''}</div>
          <p class="at-hint" style="padding:0 14px">Pile coordinates and load nodes come from the drawing. All other inputs of the worksheet are here.</p>${EC.mcui.inputsHTML(e, doc, PM.GEOM)}</div>
        <div class="at-main">
          <div class="card at-draw">
            <div class="at-bar no-print">
              <div class="at-grp">${tb('select', svgI('M5 3l14 8-6 2-2 6z'), 'Select', 'V')}${tb('pile', svgI('M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 3v8'), 'Pile', 'P')}${tb('column', svgI('M7 7h10v10H7zM7 7l10 10M17 7 7 17'), 'Column', 'C')}${tb('wall', svgI('M3 10h18v4H3z'), 'Wall', 'W')}</div>
              <div class="at-grp"><button class="btn sm" data-attpl title="Standard pile layouts">${svgI('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z')}<span>Templates</span></button><button class="btn sm" data-atgrid title="Rectangular pile grid">${svgI('M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18')}<span>Pile grid</span></button></div>
              <div class="at-grp"><button class="btn sm icon-only" data-atundo title="Undo (Ctrl+Z)">${api.ic('undo')}</button><button class="btn sm icon-only" data-atredo title="Redo (Ctrl+Y)" style="transform:scaleX(-1)">${api.ic('undo')}</button><button class="btn sm icon-only" data-atzoom="1.25" title="Zoom in">${api.ic('plus')}</button><button class="btn sm icon-only" data-atzoom="0.8" title="Zoom out">${svgI('M5 12h14')}</button><button class="btn sm" data-atfit title="Zoom to fit (double-click)">Fit</button></div>
              <div class="at-grp at-set"><label>Snap <select data-atsnap>${[5, 10, 25, 50, 100, 150, 300].map(v => `<option value="${v}" ${v === e.fda.snap ? 'selected' : ''}>${v} mm</option>`).join('')}</select></label>
                <label title="Walls are cut into worksheet load nodes of at most this length">Wall node ≤ <select data-atseg>${[500, 750, 1000, 1500, 2000, 3000].map(v => `<option value="${v}" ${v === e.fda.seg ? 'selected' : ''}>${v} mm</option>`).join('')}</select></label>
                <label><input type="checkbox" data-atlabels ${S.labels ? 'checked' : ''}> Labels</label></div>
            </div>
            <div class="at-combos no-print" id="atCombos">${combosHTML(e)}</div>
            <div class="at-body"><div class="at-canvas" id="atCanvas"><svg id="atSvg" class="mplot drawing at-svg" role="img" aria-label="Pile cap plan"></svg><div class="at-ptr" id="atPtr"></div></div><aside class="at-props" id="atProps">${propsHTML(e)}</aside></div>
            ${legend()}
          </div>
          <div class="card at-res" id="atRes">${resultsHTML(e)}</div>
          <h3 class="ksub at-rep">Calculation report <small>· worksheet ${esc(SHEET)}.mcdx, combination shown: ${esc(e.fda.combos[shownCombo(e)] ? e.fda.combos[shownCombo(e)].name : '')}</small></h3>
          <div id="out">${EC.mcui.vOutput(e)}</div>
        </div>
      </div>`;
  }

  /* ---------- interaction ---------- */
  function addObj(e, kind, w) {
    const m = e.fda, d = pileD(e);
    snap(e);
    if (kind === 'pile') {
      const hit = m.piles.find(p => Math.hypot(p.x - w.x, p.y - w.y) < d / 2);
      if (hit) { S.undo.pop(); S.sel = { t: 'p', id: hit.id }; paintProps(e); paintCanvas(e); return; }
      const p = { id: PM.nid('p'), x: w.x, y: w.y }; m.piles.push(p); S.sel = { t: 'p', id: p.id };
    } else if (kind === 'column') {
      const last = m.cols[m.cols.length - 1], c = { id: PM.nid('c'), x: w.x, y: w.y, bx: last ? last.bx : Math.max(400, d), by: last ? last.by : Math.max(400, d), L: m.combos.map(() => PM.zeroL()) };
      if (last) c.L = m.combos.map((_, i) => PM.loadOf(last, i));
      m.cols.push(c); S.sel = { t: 'c', id: c.id };
    }
    commit(e, true);
  }
  function addWall(e, a, b) {
    const m = e.fda, end = wallEnd(a, b);
    if (Math.hypot(end.x - a.x, end.y - a.y) < 100) return;
    snap(e);
    const last = m.walls[m.walls.length - 1];
    const w = { id: PM.nid('w'), x1: a.x, y1: a.y, x2: end.x, y2: end.y, t: last ? last.t : 300, L: m.combos.map((_, i) => (last ? PM.loadOf(last, i) : PM.zeroL())) };
    m.walls.push(w); S.sel = { t: 'w', id: w.id };
    commit(e, true);
  }
  function delSel(e) {
    const o = findObj(e, S.sel); if (!o) return;
    snap(e);
    const k = S.sel.t === 'p' ? 'piles' : S.sel.t === 'c' ? 'cols' : 'walls';
    e.fda[k] = e.fda[k].filter(x => x !== o); S.sel = null;
    commit(e, true);
  }
  function setField(e, k, v) {
    const o = findObj(e, S.sel); if (!o) return;
    if (k.startsWith('L.')) { PM.setLoad(o, S.ci, k.slice(2), v); return; }
    if ((k === 'bx' || k === 'by' || k === 't') && v < 50) return;
    o[k] = v;
    if (S.sel.t === 'w' && (k === 'x1' || k === 'x2' || k === 'y1' || k === 'y2')) {   // keep walls horizontal / vertical
      if (PM.isHoriz(o)) { if (k === 'y1') o.y2 = v; if (k === 'y2') o.y1 = v; else if (k !== 'y1') o.y2 = o.y1; }
      else { if (k === 'x1') o.x2 = v; if (k === 'x2') o.x1 = v; else if (k !== 'x1') o.x2 = o.x1; }
    }
  }
  function templateModal(onPick, title) {
    const e = cur(), d = e ? pileD(e) : 600;
    const thumb = t => { const s = 3 * 600, mm = PM.fromTemplate(t.k, { d: 600 }); const pts = mm.piles, xs = pts.map(p => p.x).concat(mm.walls.flatMap(w => [w.x1, w.x2])), ys = pts.map(p => p.y);
      const x0 = Math.min(...xs) - 500, x1 = Math.max(...xs) + 500, y0 = Math.min(...ys) - 500, y1 = Math.max(...ys) + 500, k = 64 / Math.max(x1 - x0, y1 - y0, s);
      const P = (x, y) => `${f1(36 + (x - (x0 + x1) / 2) * k)},${f1(36 - (y - (y0 + y1) / 2) * k)}`;
      const [ax, ay] = P(x0, y1).split(','), [bx, by] = P(x1, y0).split(',');
      return `<svg viewBox="0 0 72 72" class="at-thumb"><rect class="cap" x="${ax}" y="${ay}" width="${f1(bx - ax)}" height="${f1(by - ay)}"/>${pts.map(p => { const [x, y] = P(p.x, p.y).split(','); return `<circle class="pile" cx="${x}" cy="${y}" r="${f1(300 * k)}"/>`; }).join('')}${mm.walls.map(w => { const [a, b] = P(w.x1, w.y1).split(','), [c2, d2] = P(w.x2, w.y2).split(','); return `<line class="wall" x1="${a}" y1="${b}" x2="${c2}" y2="${d2}"/>`; }).join('')}${mm.cols.map(c => { const [x, y] = P(c.x, c.y).split(','); return `<rect class="col" x="${f1(x - 300 * k)}" y="${f1(y - 300 * k)}" width="${f1(600 * k)}" height="${f1(600 * k)}"/>`; }).join('')}</svg>`; };
    const bg = api.modal(title || 'Pile cap templates', `<div class="at-tplopt"><label>Pile size h <input type="number" id="tplD" value="${d}" step="50"> mm</label><label>Spacing <input type="number" id="tplK" value="3" step="0.25" min="2"> × h</label></div>
      <div class="at-tpls">${PM.TEMPLATES.map(t => `<button class="at-tpl" data-tk="${t.k}">${thumb(t)}<span>${esc(t.n)}</span></button>`).join('')}</div>
      <p class="at-hint">A template sets the piles, columns / walls and a first set of loads (≈ 60 % of the pile resistance). Then edit everything on the plan.</p>`);
    bg.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { const D = +bg.querySelector('#tplD').value || 600, K = +bg.querySelector('#tplK').value || 3; bg.remove(); onPick(b.dataset.tk, D, K); });
    return bg;
  }
  function gridModal(e) {
    const d = pileD(e), s = 3 * d;
    const bg = api.modal('Rectangular pile grid', `<div class="form"><div class="row2"><div><label>Piles along x</label><input id="gnx" type="number" min="1" value="3"></div><div><label>Piles along y</label><input id="gny" type="number" min="1" value="2"></div></div>
      <div class="row2"><div><label>Spacing s<sub>x</sub> (mm)</label><input id="gsx" type="number" value="${s}" step="50"></div><div><label>Spacing s<sub>y</sub> (mm)</label><input id="gsy" type="number" value="${s}" step="50"></div></div></div><p class="at-hint">Replaces the piles, centred on the origin. Columns and walls are kept.</p>`, bg2 => {
      const nx = Math.max(1, Math.min(20, parseInt(bg2.querySelector('#gnx').value, 10) || 1)), ny = Math.max(1, Math.min(20, parseInt(bg2.querySelector('#gny').value, 10) || 1));
      const sx = +bg2.querySelector('#gsx').value || s, sy = +bg2.querySelector('#gsy').value || s;
      snap(e); e.fda.piles = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) e.fda.piles.push({ id: PM.nid('p'), x: Math.round((i - (nx - 1) / 2) * sx), y: Math.round((j - (ny - 1) / 2) * sy) });
      S.sel = null; S.vw = null; commit(e, true);
    }, 'Create grid');
    return bg;
  }
  const setD = (inputs, D) => { if (D && D !== 600) inputs.h_pile = ['o', '*', D, ['u', 'mm']]; return inputs; };
  function create(a) {
    templateModal((k, D, K) => {
      const doc = EC.mcui.docs[SHEET], N = doc ? ((doc.inputs.find(i => i.n === 'N_Rd;p') || {}).v || 2800) : 2800;
      const m = PM.fromTemplate(k, { d: D, k: K, NRd: N });
      const e = a.newEl(TYPE, { fda: m, inputs: setD(PM.inputs(m, 0), D) });
      location.hash = '#/analysis/' + e.id;
    }, 'New pile cap analysis - choose a layout');
    EC.mcui.loadSheet(SHEET).catch(() => {});
  }

  function mount(root, e) {
    S.cur = e;
    const svg = $('#atSvg');
    paintCanvas(e);
    if (!S.runs || S.baseH !== JSON.stringify(geomFree(e))) schedule(e, 0); else paintResults(e);
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { const c = cur(); if (c && $('#atSvg')) paintCanvas(c); else ro.disconnect(); }); ro.observe($('#atCanvas')); }
    // pointer: draw / select / drag / pan
    svg.addEventListener('pointerdown', ev => {
      const e = cur(); if (!e || ev.button > 1) return;
      const w = toWorld(ev), ws = { x: snapV(e, w.x), y: snapV(e, w.y) };
      if (ev.button === 1 || (S.tool === 'select' && !ev.target.closest('[data-o],[data-h]'))) {
        if (S.tool === 'select' && ev.button === 0 && S.sel) { S.sel = null; paintProps(e); paintCanvas(e); }
        S.drag = { pan: true, px: ev.clientX, py: ev.clientY, cx: S.vw.cx, cy: S.vw.cy }; svg.setPointerCapture(ev.pointerId); return;
      }
      if (S.tool === 'pile' || S.tool === 'column') { addObj(e, S.tool, ws); return; }
      if (S.tool === 'wall') { if (!S.wall0) { S.wall0 = ws; } else { addWall(e, S.wall0, ws); S.wall0 = null; } paintCanvas(e); return; }
      const h = ev.target.closest('[data-h]');
      if (h) { const [, id, k] = h.dataset.h.split(':'); S.drag = { wallEnd: +k, id, moved: false, snap0: JSON.stringify(e.fda) }; svg.setPointerCapture(ev.pointerId); return; }
      const t = ev.target.closest('[data-o]');
      if (t) {
        const [k, id] = t.dataset.o.split(':'); S.sel = { t: k, id };
        const o = findObj(e, S.sel), ref = k === 'w' ? { x: o.x1, y: o.y1 } : { x: o.x, y: o.y };
        S.drag = { obj: true, dx: ref.x - w.x, dy: ref.y - w.y, moved: false, snap0: JSON.stringify(e.fda) };
        svg.setPointerCapture(ev.pointerId); paintProps(e); paintCanvas(e);
      }
    });
    svg.addEventListener('pointermove', ev => {
      const e = cur(); if (!e) return;
      const w = toWorld(ev); S.ptr = { x: snapV(e, w.x), y: snapV(e, w.y) };
      const D = S.drag;
      if (D && D.pan) { S.vw.cx = D.cx - (ev.clientX - D.px) / S.vw.s * (size().W / svg.getBoundingClientRect().width); S.vw.cy = D.cy + (ev.clientY - D.py) / S.vw.s * (size().W / svg.getBoundingClientRect().width); paintCanvas(e); return; }
      if (D && D.obj) {
        const o = findObj(e, S.sel); if (!o) return;
        const nx = snapV(e, w.x + D.dx), ny = snapV(e, w.y + D.dy);
        if (S.sel.t === 'w') { const ddx = nx - o.x1, ddy = ny - o.y1; if (ddx || ddy) { o.x1 += ddx; o.x2 += ddx; o.y1 += ddy; o.y2 += ddy; D.moved = true; } }
        else if (o.x !== nx || o.y !== ny) { o.x = nx; o.y = ny; D.moved = true; }
        paintCanvas(e); return;
      }
      if (D && D.wallEnd) {
        const o = e.fda.walls.find(x => x.id === D.id); if (!o) return;
        const other = D.wallEnd === 1 ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 }, p = wallEnd(other, S.ptr);
        if (D.wallEnd === 1) { o.x1 = p.x; o.y1 = p.y; } else { o.x2 = p.x; o.y2 = p.y; }
        D.moved = true; paintCanvas(e); return;
      }
      if (S.tool !== 'select') paintCanvas(e); else { const st = $('#atPtr'); if (st) st.textContent = `x = ${fmt(S.ptr.x)}  y = ${fmt(S.ptr.y)} mm`; }
    });
    const up = ev => {
      const e = cur(), D = S.drag; S.drag = null;
      if (!e || !D) return;
      try { svg.releasePointerCapture(ev.pointerId); } catch (x) { /* not captured */ }
      if ((D.obj || D.wallEnd) && D.moved) { S.undo.push(D.snap0); S.redo = []; commit(e, true); }
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', () => { S.ptr = null; const e = cur(); if (e && !S.drag) paintCanvas(e); });
    svg.addEventListener('wheel', ev => {
      const e = cur(); if (!e) return; ev.preventDefault();
      const w = toWorld(ev), k = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      S.vw.s *= k; S.vw.cx = w.x - (w.x - S.vw.cx) / k; S.vw.cy = w.y - (w.y - S.vw.cy) / k; paintCanvas(e);
    }, { passive: false });
    svg.addEventListener('dblclick', ev => { const e = cur(); if (e && !ev.target.closest('[data-o]')) { fit(e); paintCanvas(e); } });

    root.addEventListener('click', ev => {
      const e = cur(); if (!e) return;
      const b = ev.target.closest('[data-attool],[data-atdel],[data-attpl],[data-atgrid],[data-atundo],[data-atredo],[data-atzoom],[data-atfit],[data-atci],[data-atcadd],[data-atcdel],[data-atpile]');
      if (!b) return;
      const d = b.dataset;
      if (d.attool) { S.tool = d.attool; S.wall0 = null; document.querySelectorAll('[data-attool]').forEach(x => { x.classList.toggle('on', x.dataset.attool === S.tool); x.setAttribute('aria-pressed', x.dataset.attool === S.tool); }); paintCanvas(e); return; }
      if (d.atdel !== undefined) return delSel(e);
      if (d.attpl !== undefined) return templateModal((k, D, K) => {
        snap(e); const n = PM.fromTemplate(k, { d: D, k: K, NRd: NRd(e) });
        const keep = { snap: e.fda.snap, seg: e.fda.seg }; e.fda = Object.assign(n, keep);
        if (D !== pileD(e)) e.inputs.h_pile = ['o', '*', D, ['u', 'mm']];
        S.sel = null; S.ci = 0; S.vw = null; commit(e, true); api.render();
      }, 'Replace the drawing with a template');
      if (d.atgrid !== undefined) return gridModal(e);
      if (d.atundo !== undefined) return undo(e, false);
      if (d.atredo !== undefined) return undo(e, true);
      if (d.atzoom) { S.vw.s *= +d.atzoom; paintCanvas(e); return; }
      if (d.atfit !== undefined) { fit(e); paintCanvas(e); return; }
      if (d.atci !== undefined) { S.ci = +d.atci; paintCombos(e); paintProps(e); paintCanvas(e); return; }
      if (d.atcadd !== undefined) { snap(e); S.ci = PM.addCombo(e.fda, null, S.ci); commit(e, true); return; }
      if (d.atcdel !== undefined) { snap(e); PM.delCombo(e.fda, S.ci); S.ci = Math.max(0, S.ci - 1); commit(e, true); return; }
      if (d.atpile) { S.sel = { t: 'p', id: d.atpile }; S.tool = 'select'; paintProps(e); paintCanvas(e); $('#atCanvas').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    root.addEventListener('input', ev => {
      const e = cur(), t = ev.target; if (!e) return;
      if (t.dataset.atf) {
        const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
        if (!S.typing) { snap(e); S.typing = true; }
        setField(e, t.dataset.atf, v); e.u = Date.now(); api.save(); paintCanvas(e); schedule(e); return;
      }
      if (t.dataset.atcname !== undefined) { e.fda.combos[S.ci].name = t.value || 'Combination ' + (S.ci + 1); api.save(); paintCombos(e); }
    });
    root.addEventListener('change', ev => {
      const e = cur(), t = ev.target; if (!e) return;
      if (t.dataset.atf) { S.typing = false; paintProps(e); paintCombos(e); return; }
      if (t.dataset.atsnap !== undefined) { e.fda.snap = +t.value; api.save(); return; }
      if (t.dataset.atseg !== undefined) { snap(e); e.fda.seg = +t.value; commit(e, true); return; }
      if (t.dataset.atlabels !== undefined) { S.labels = t.checked; paintCanvas(e); return; }
      if (t.dataset.atview !== undefined) { e.fda.view = t.dataset.atview === 'gov' ? 'gov' : +t.dataset.atview; applyView(e); const h = document.querySelector('.at-rep small'); if (h) h.textContent = `· worksheet ${SHEET}.mcdx, combination shown: ${e.fda.combos[shownCombo(e)].name}`; paintCanvas(e); }
    });
  }
  document.addEventListener('keydown', ev => {
    const e = cur(); if (!e || document.querySelector('.modal-bg')) return;
    const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); return undo(e, ev.shiftKey); }
    if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); return undo(e, true); }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tools = { v: 'select', p: 'pile', c: 'column', w: 'wall' };
    if (tools[k]) { const b = document.querySelector(`[data-attool="${tools[k]}"]`); if (b) b.click(); return; }
    if ((k === 'delete' || k === 'backspace') && S.sel) { ev.preventDefault(); return delSel(e); }
    if (k === 'escape') { S.wall0 = null; S.sel = null; paintProps(e); paintCanvas(e); return; }
    const mv = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] }[k];
    if (mv && S.sel) {
      ev.preventDefault(); const o = findObj(e, S.sel); if (!o) return; snap(e); const g = e.fda.snap || 50;
      if (S.sel.t === 'w') { o.x1 += mv[0] * g; o.x2 += mv[0] * g; o.y1 += mv[1] * g; o.y2 += mv[1] * g; } else { o.x += mv[0] * g; o.y += mv[1] * g; }
      commit(e, true);
    }
  });
  /* worksheet result arrived (also after a worksheet input changed in the left panel) */
  function onResult(e) {
    if (!S.cur || e.id !== S.id) return;
    const h = JSON.stringify(geomFree(e));
    if (S.baseH !== null && h !== S.baseH && !S.busy) { schedule(e, 50); return; }
    if (!S.busy && !S.dirty) paintCanvas(e);
  }
  const brief = e => { const m = e.fda; return `${m.piles.length} pile${m.piles.length === 1 ? '' : 's'} · ${m.cols.length} column${m.cols.length === 1 ? '' : 's'} · ${m.walls.length} wall${m.walls.length === 1 ? '' : 's'} · ${m.combos.length} combination${m.combos.length === 1 ? '' : 's'}`; };

  EC.analysis.add({
    k: 'pilecap', name: 'Foundation · pile caps', short: 'pile cap analysis', icon: 'pilecap', sheet: SHEET,
    sub: 'Any pile layout under columns and walls',
    desc: 'Draw piles, columns and walls on the plan (or start from a template: 1-12 piles, wall caps, combined and core caps), type the loads of each load combination and get pile reactions, the governing combination and the full EN 1992-1-1:2023 design of the cap from the Mathcad worksheet.',
    install(a) { api = a; }, create, view, mount, onResult, brief
  });
})();
