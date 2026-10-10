/* Run a Mathcad worksheet and turn the results into plain data for the UI
 * (works on the main thread or inside a Web Worker). */
(function (root) {
  'use strict';
  const EC = root.EC = root.EC || {};
  const M = EC.mcad;
  const { isM, isQ, valOf, dimOf } = M;

  /* regions in evaluation / display order; areas and spec tables are flattened */
  function flatten(doc) {
    if (doc.__flat) return doc.__flat;
    const out = [];
    const walk = (regs, area) => {
      regs.slice().sort((a, b) => (Math.abs(a.y - b.y) < 0.5 ? a.x - b.x : a.y - b.y)).forEach(r => {
        if (r.k === 'a') { out.push({ k: 'area', col: r.col, open: true, y: r.y }); walk(r.r, r); out.push({ k: 'area', end: true }); return; }
        if (r.k === 'st') { out.push({ k: 'st', y: r.y, x: r.x, r: r.r }); r.r.forEach(m => out.push(Object.assign({ inSt: true }, m))); return; }
        out.push(r);
      });
    };
    walk(doc.regions);
    Object.defineProperty(doc, '__flat', { value: out, enumerable: false });
    return out;
  }

  const MAXR = 60, MAXC = 16;
  function ser(S, v, uAst) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return { s: v };
    if (v instanceof M.Fn) return { f: v.params.length };
    if (v instanceof M.Range) return { s: M.fmtNum(valOf(v.a)) + ' .. ' + M.fmtNum(valOf(v.b)) };
    if (isM(v)) {
      const r = Math.min(v.r, MAXR), c = Math.min(v.c, MAXC);
      const cells = [];
      for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) cells.push(ser(S, v.get(i, j), uAst));
      return { m: [v.r, v.c], cells, cut: v.r > MAXR || v.c > MAXC };
    }
    if (typeof v === 'number' || isQ(v)) {
      const d = M.display(S, v, uAst);
      const o = { n: d.n };
      if (d.uAst) o.uA = d.uAst; else if (d.us) o.us = d.us;
      return o;
    }
    return { s: String(v) };
  }

  /* substitution: replace variables by their values (in the unit they were shown in) */
  function substitute(S, e, unitOf, seq, budget) {
    let used = 0, bad = false;
    const sub = x => {
      if (bad || x == null || typeof x === 'number') return x;
      if (!Array.isArray(x)) return x;
      switch (x[0]) {
        case 'v': {
          let v; try { v = S.env.get(x[1], seq); } catch (er) { v = undefined; }
          if (v === undefined || v instanceof M.Fn) return x;
          if (typeof v === 'string' || isM(v)) { if (isM(v) && v.a.length > 6) { bad = true; return x; } }
          used++;
          return ['val', ser(S, v, unitOf[x[1]] || prefUnit(v))];
        }
        case 'o': return x.slice(0, 2).concat(x.slice(2).map(sub));
        case 'c': return ['c', x[1], x[2].map(sub)];
        case '()': return ['()', sub(x[1])];
        case 'M': return ['M', x[1], x[2], x[3].map(sub)];
        case 'P': case 'sumi': case 'sum': case 'vec': case 'cb': bad = true; return x;
        default: return x;
      }
    };
    const out = sub(e);
    if (bad || !used || used > (budget || 14)) return null;
    return out;
  }
  /* engineering display unit for values that were not displayed in the worksheet */
  const PREF = [[[1, 0, 0, 0], ['u', 'mm']], [[2, 0, 0, 0], ['o', '^', ['u', 'mm'], 2]], [[3, 0, 0, 0], ['o', '^', ['u', 'mm'], 3]], [[4, 0, 0, 0], ['o', '^', ['u', 'mm'], 4]],
    [[1, 1, -2, 0], ['u', 'kN']], [[-1, 1, -2, 0], ['u', 'MPa']], [[2, 1, -2, 0], ['o', '*', ['u', 'kN'], ['u', 'm']]], [[0, 1, -2, 0], ['o', '/', ['u', 'kN'], ['u', 'm']]], [[-2, 1, -2, 0], ['o', '/', ['u', 'kN'], ['o', '^', ['u', 'm'], 3]]]];
  function prefUnit(v) {
    const d = isM(v) ? dimOf(v.a[0]) : dimOf(v);
    for (const [dd, u] of PREF) if (dd[0] === d[0] && dd[1] === d[1] && dd[2] === d[2] && dd[3] === d[3]) return u;
    return null;
  }
  const hasVar = e => Array.isArray(e) && (e[0] === 'v' ? true : e.some(hasVar));
  const nodeCount = e => (Array.isArray(e) ? e.reduce((s, x) => s + nodeCount(x), 1) : 1);

  function plotData(S, p, seq) {
    const traces = [];
    const scope = { parent: null, seq };
    const sc = { parent: { seq }, vars: new Map() };
    for (const t of p.tr) {
      const o = { c: t.c, w: t.w, sym: t.sym, ls: t.ls, kind: t.kind };
      try {
        const X = t.x ? S.ev(t.x, sc) : null, Y = t.y ? S.ev(t.y, sc) : null;
        const xs = X == null ? [] : (isM(X) ? X.a : [X]);
        const ys = Y == null ? [] : (isM(Y) ? Y.a : [Y]);
        const ku = u => { if (!u) return 1; try { return valOf(S.ev(u, null)); } catch (e) { return 1; } };
        const kx = ku(t.xu), ky = ku(t.yu);
        const n = Math.min(xs.length || ys.length, ys.length || xs.length);
        o.x = []; o.y = [];
        for (let i = 0; i < n; i++) {
          const xv = xs.length ? valOf(xs[Math.min(i, xs.length - 1)]) / kx : i + 1;
          const yv = ys.length ? valOf(ys[Math.min(i, ys.length - 1)]) / ky : 0;
          o.x.push(Number.isFinite(xv) ? +xv.toPrecision(7) : null); o.y.push(Number.isFinite(yv) ? +yv.toPrecision(7) : null);
        }
      } catch (e) { o.err = e.message; o.x = []; o.y = []; }
      traces.push(o);
    }
    void scope;
    return traces;
  }

  function summarize(S) {
    const g = n => { try { const v = S.env.get(n); return v === undefined ? undefined : v; } catch (e) { return undefined; } };
    const vec = v => (isM(v) ? v.a : v === undefined ? [] : [v]);
    const out = { rows: [] };
    const num = x => (typeof x === 'number' ? x : isQ(x) ? x.v : NaN);
    const U = g('U'), St = g('Status'), It = g('Item'), Sm = g('Summary'), Um = g('U_max'), R = g('Result');
    if (isM(Sm) && Sm.c >= 2) {
      for (let i = 0; i < Sm.r; i++) {
        const cells = []; for (let j = 0; j < Sm.c; j++) cells.push(Sm.get(i, j));
        const item = cells.find(c => typeof c === 'string');
        const st = cells.slice(1).reverse().find(c => typeof c === 'string');
        const u = cells.find(c => typeof c === 'number' || isQ(c));
        // the numeric column is a utilisation only when the worksheet defines U (Wind_Building lists values)
        const row = { item: item || '', U: U !== undefined && Number.isFinite(num(u)) ? num(u) : null, st: st || '' };
        if (U === undefined && u !== undefined) row.val = num(u);
        out.rows.push(row);
      }
    } else if (St !== undefined) {
      const sv = vec(St), uv = vec(U), iv = vec(It);
      for (let i = 0; i < sv.length; i++) out.rows.push({ item: typeof iv[i] === 'string' ? iv[i] : 'Check ' + (i + 1), U: uv.length === sv.length && Number.isFinite(num(uv[i])) ? num(uv[i]) : null, st: typeof sv[i] === 'string' ? sv[i] : String(sv[i]) });
    }
    const us = vec(U).map(num).filter(Number.isFinite);
    out.Umax = Um !== undefined && Number.isFinite(num(Um)) ? num(Um) : (us.length ? Math.max(...us) : null);
    if (out.Umax == null && out.rows.length) { const rr = out.rows.map(r => r.U).filter(Number.isFinite); if (rr.length) out.Umax = Math.max(...rr); }
    out.result = typeof R === 'string' ? R : '';
    const badSt = out.rows.filter(r => r.st && !/^(OK|PASS|N\/A|-|INFO|SATISFIED)/i.test(r.st.trim()));
    out.nBad = badSt.length;
    let ok = !badSt.length;
    if (out.Umax != null && out.Umax > 1.0005) ok = false;
    if (out.result && /REVISE|NOT OK|FAIL|INADEQUATE|UNSAFE/i.test(out.result)) ok = false;
    out.ok = ok;
    return out;
  }

  /**
   * @returns {{vals: Array, summary, keys: Array, errors: number, ms: number}}
   */
  function compute(doc, inputs) {
    const t0 = Date.now();
    const flat = flatten(doc);
    const ins = {};
    for (const k in (inputs || {})) ins[k] = inputs[k];
    const R = M.run(doc, ins);
    const S = R.sheet;
    // map region object -> record
    const recOf = new Map(); R.out.forEach(o => recOf.set(o.reg, o));
    const unitOf = {};
    const vals = new Array(flat.length).fill(null);
    // seq position for plots: replay order using env seq stored on records
    let errors = 0;
    const keys = [];
    flat.forEach((r, i) => {
      if (r.k !== 'm') return;
      const o = recOf.get(r); if (!o) return;
      const e = r.e;
      const item = {};
      if (o.err) { item.err = o.err; errors++; }
      if (o.ov) item.ov = 1;
      if (o.sel !== undefined) item.sel = o.sel;
      const showsValue = e[0] === 'ev' || (e[0] === 'def' && Array.isArray(e[2]) && e[2][0] === 'ev');
      const uAst = o.unit || null;
      if (o.name && uAst) unitOf[o.name] = uAst;
      if (!o.err && o.val !== undefined && !o.fn) {
        item.v = ser(S, o.val, uAst || (showsValue ? null : prefUnit(o.val)));
        item.shown = showsValue ? 1 : 0;
        // substitution line
        if (showsValue && e[0] === 'def') {
          const rhs = e[2][1];
          if (hasVar(rhs) && nodeCount(rhs) < 140 && !(Array.isArray(rhs) && rhs[0] === 'v')) {
            const sb = substitute(S, rhs, unitOf, o.seq, 16);
            if (sb) item.sub = sb;
          }
        }
        const c = (r.c || '').toUpperCase();
        if (o.name && (c === '#DDEBF7' || c === '#E2EFDA')) keys.push({ n: o.name, c, v: item.v });
      }
      vals[i] = item;
    });
    // plots (use the definitions above each plot)
    flat.forEach((r, i) => {
      if (r.k !== 'p') return;
      const seq = r.__seq != null ? r.__seq : S.env.seq;
      vals[i] = { tr: plotData(S, r, seqAt(R, r, S)) };
      void seq;
    });
    return { vals, summary: summarize(S), keys, errors, ms: Date.now() - t0 };
  }
  // env seq at the position of a region: the engine records seq on each output record
  function seqAt(R, reg, S) {
    let seq = 0;
    for (const o of R.out) { if (o.reg === reg) return o.seq != null ? o.seq : seq; if (o.seq != null) seq = o.seq; }
    return S.env.seq;
  }

  EC.mcadc = { compute, flatten, summarize };
})(typeof window !== 'undefined' ? window : globalThis);
