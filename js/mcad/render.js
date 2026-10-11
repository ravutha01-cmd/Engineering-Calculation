/* Render worksheet expressions as MathML and results/plots as HTML/SVG, the way Mathcad shows them */
(function (root) {
  'use strict';
  const EC = root.EC = root.EC || {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtNum = (v, p) => (EC.mcad ? EC.mcad.fmtNum(v, p) : String(v));

  /* identifier: base_sub (literal subscript) */
  function ident(name, cls) {
    const k = name.indexOf('_');
    const base = k > 0 ? name.slice(0, k) : name;
    const sub = k > 0 ? name.slice(k + 1) : '';
    const mi = s => `<mi${s.length > 1 ? ' mathvariant="normal"' : ''}${cls ? ` class="${cls}"` : ''}>${esc(s)}</mi>`;
    return sub ? `<msub>${mi(base)}<mi mathvariant="normal">${esc(sub)}</mi></msub>` : mi(base);
  }
  const mo = (s, extra) => `<mo${extra || ''}>${s}</mo>`;
  const row = (...a) => `<mrow>${a.join('')}</mrow>`;
  const paren = x => row(mo('('), x, mo(')'));
  const unitM = u => `<mi mathvariant="normal" class="mu">${esc(u)}</mi>`;

  // precedence for automatic parentheses (Mathcad keeps explicit parens as ['()'] nodes)
  const PREC = { 'or': 1, 'and': 2, '==': 3, '!=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 6, 'neg': 7, '^': 8 };

  function mm(e, ctx) {
    ctx = ctx || {};
    if (typeof e === 'number') return `<mn>${esc(fmtLit(e))}</mn>`;
    if (e == null) return `<mi class="ph">▪</mi>`;
    switch (e[0]) {
      case 's': return `<mtext class="mstr">"${esc(e[1])}"</mtext>`;
      case 'v': return ident(e[1]);
      case 'u': return unitM(e[1]);
      case 'f': return `<mi mathvariant="normal" class="mf">${esc(e[1])}</mi>`;
      case 'k': return `<mi mathvariant="normal" class="mk">${esc(e[1])}</mi>`;
      case '()': return paren(mm(e[1], ctx));
      case 'val': return valM(e[1], true);
      case 'o': return op(e, ctx);
      case 'c': {
        const f = e[1];
        const name = f[0] === 'v' ? ident(f[1]) : mm(f, ctx);
        return row(name, mo('(', ' stretchy="false"'), e[2].map(a => mm(a, ctx)).join(mo(',')), mo(')', ' stretchy="false"'));
      }
      case 'M': return matM(e[1], e[2], e[3].map(x => mm(x, ctx)));
      case 'rg': return row(mm(e[1], ctx), mo('..'), mm(e[2], ctx));
      case 'rg3': return row(mm(e[1], ctx), mo(','), mm(e[2], ctx), mo('..'), mm(e[3], ctx));
      case 'sum': return row(`<munder><mo>∑</mo><mrow></mrow></munder>`, mm(e[1], ctx));
      case 'prod': return row(`<mo>∏</mo>`, mm(e[1], ctx));
      case 'sumi': return row(`<munderover><mo>∑</mo>${row(ident(e[1]), mo('='), mm(e[2], ctx))}${mm(e[3], ctx)}</munderover>`, mm(e[4], ctx));
      case 'vec': return `<mover>${mm(e[1], ctx)}<mo stretchy="true">→</mo></mover>`;
      case 'cb': return `<mtext class="cb">${esc(e[1][e[3]] || '')}</mtext>`;
      case 'P': return progM(e, ctx);
      case 'ev': return mm(e[1], ctx);
    }
    return `<mtext>?</mtext>`;
  }
  function fmtLit(x) {
    if (Number.isInteger(x)) return String(x);
    return String(+x.toPrecision(12));
  }
  function wrap(child, parentP, right) {
    if (!Array.isArray(child) || child[0] !== 'o') return null;
    const p = PREC[child[1]];
    if (p == null) return null;
    if (p < parentP || (right && p === parentP && parentP !== 5 && parentP !== 4)) return true;
    return null;
  }
  function sideM(x, P, ctx, right) {
    const s = mm(x, ctx);
    return wrap(x, P, right) ? paren(s) : s;
  }
  function isUnitish(x) {
    if (!Array.isArray(x)) return false;
    if (x[0] === 'u') return true;
    if (x[0] === 'o' && (x[1] === '*' || x[1] === '/' || x[1] === '^')) return isUnitish(x[2]) && (isUnitish(x[3]) || typeof x[3] === 'number');
    if (x[0] === '()') return isUnitish(x[1]);
    return false;
  }
  function op(e, ctx) {
    const o = e[1], a = e[2], b = e[3];
    switch (o) {
      case '+': return row(sideM(a, 4, ctx), mo('+'), sideM(b, 4, ctx, true));
      case '-': return e.length === 3 ? row(mo('−'), sideM(a, 7, ctx)) : row(sideM(a, 4, ctx), mo('−'), sideM(b, 4, ctx, true));
      case 'neg': return row(mo('−'), sideM(a, 7, ctx));
      case '*': {
        // number · unit shows as "300 mm"
        if (typeof a === 'number' && isUnitish(b)) return row(mm(a, ctx), `<mspace width="0.2em"/>`, mm(b, ctx));
        return row(sideM(a, 5, ctx), mo('·'), sideM(b, 5, ctx, true));
      }
      case '/': return `<mfrac>${mm(stripP(a), ctx)}${mm(stripP(b), ctx)}</mfrac>`;
      case '^': return `<msup>${sideM(a, 8.5, ctx)}${mm(stripP(b), ctx)}</msup>`;
      case 'nroot': return a == null ? `<msqrt>${mm(b, ctx)}</msqrt>` : `<mroot>${mm(b, ctx)}${mm(a, ctx)}</mroot>`;
      case 'sqrt': return `<msqrt>${mm(a, ctx)}</msqrt>`;
      case 'abs': return row(mo('|', ' stretchy="true"'), mm(a, ctx), mo('|', ' stretchy="true"'));
      case '==': return row(sideM(a, 3, ctx), mo('=', ' class="beq"'), sideM(b, 3, ctx, true));
      case '!=': return row(sideM(a, 3, ctx), mo('≠'), sideM(b, 3, ctx, true));
      case '<': return row(sideM(a, 3, ctx), mo('&lt;'), sideM(b, 3, ctx, true));
      case '>': return row(sideM(a, 3, ctx), mo('&gt;'), sideM(b, 3, ctx, true));
      case '<=': return row(sideM(a, 3, ctx), mo('≤'), sideM(b, 3, ctx, true));
      case '>=': return row(sideM(a, 3, ctx), mo('≥'), sideM(b, 3, ctx, true));
      case 'and': return row(sideM(a, 2, ctx), mo('∧'), sideM(b, 2, ctx, true));
      case 'or': return row(sideM(a, 1, ctx), mo('∨'), sideM(b, 1, ctx, true));
      case 'xor': return row(sideM(a, 1, ctx), mo('⊕'), sideM(b, 1, ctx, true));
      case 'not': return row(mo('¬'), sideM(a, 7, ctx));
      case 'idx': return `<msub>${sideM(a, 9, ctx)}${row(e.slice(3).map(x => mm(x, ctx)).join(mo(',')))}</msub>`;
      case 'col': return `<msup>${sideM(a, 9, ctx)}${row(mo('⟨'), mm(b, ctx), mo('⟩'))}</msup>`;
      case 'row': return `<msup>${sideM(a, 9, ctx)}${row(mo('⟨'), mo('⟨'), mm(b, ctx), mo('⟩'), mo('⟩'))}</msup>`;
      case 'T': return `<msup>${sideM(a, 9, ctx)}<mi mathvariant="normal">T</mi></msup>`;
      case '!': return row(sideM(a, 9, ctx), mo('!'));
      case '%': return row(sideM(a, 9, ctx), mo('%'));
    }
    return row(`<mi>${esc(o)}</mi>`, paren(e.slice(2).map(x => mm(x, ctx)).join(mo(','))));
  }
  const stripP = x => (Array.isArray(x) && x[0] === '()' ? x[1] : x);
  function matM(r, c, cells) {
    let s = '<mtable class="mmat">';
    for (let i = 0; i < r; i++) { s += '<mtr>'; for (let j = 0; j < c; j++) s += `<mtd>${cells[i * c + j]}</mtd>`; s += '</mtr>'; }
    return row(mo('[', ' stretchy="true"'), s + '</mtable>', mo(']', ' stretchy="true"'));
  }
  /* program: vertical bar with one statement per line */
  function progM(p, ctx) {
    const lines = p[1].map(s => `<mtr><mtd columnalign="left">${stmtM(s, ctx)}</mtd></mtr>`).join('');
    return `<mtable class="mprog" columnalign="left">${lines}</mtable>`;
  }
  const kw = s => `<mi mathvariant="bold" class="mkw">${s}</mi>`;
  function stmtM(s, ctx) {
    switch (s[0]) {
      case 'ld': return row(mm(s[1], ctx), mo('←'), mm(s[2], ctx));
      case 'ex': return mm(s[1], ctx);
      case 'blk': return mm(s[1], ctx);
      case 'ret': return row(kw('return'), `<mspace width="0.3em"/>`, mm(s[1], ctx));
      case 'brk': return kw('break');
      case 'cnt': return kw('continue');
      case 'for': return row(kw('for'), `<mspace width="0.3em"/>`, ident(s[1]), mo('∈'), mm(s[2], ctx), `<mspace width="0.4em"/>`, progM(s[3], ctx));
      case 'wh': return row(kw('while'), `<mspace width="0.3em"/>`, mm(s[1], ctx), `<mspace width="0.4em"/>`, progM(s[2], ctx));
      case 'if': return row(kw('if'), `<mspace width="0.3em"/>`, mm(s[1], ctx), `<mspace width="0.4em"/>`, progM(s[2], ctx)) + (s[3] ? row(`<mspace linebreak="newline"/>`, kw('else'), `<mspace width="0.4em"/>`, progM(s[3], ctx)) : '');
      case 'try': return row(kw('try'), progM(s[1], ctx), kw('on error'), progM(s[2], ctx));
    }
    return '<mtext>?</mtext>';
  }

  /* value (serialized by compute.js) */
  function valM(v, inSub) {
    if (!v) return '<mi class="ph">?</mi>';
    if (v.s !== undefined) {
      const cls = /^OK\b/i.test(v.s) ? 'sok' : /NOT OK|REVISE|FAIL/i.test(v.s) ? 'sbad' : '';
      return `<mtext class="mstr${cls ? ' ' + cls : ''}">"${esc(v.s)}"</mtext>`;
    }
    if (v.f !== undefined) return `<mi mathvariant="normal">f(…)</mi>`;
    if (v.m) {
      const [r, c] = v.m; const rr = Math.min(r, 60), cc = Math.min(c, 16);
      const cells = []; for (let i = 0; i < rr * cc; i++) cells.push(valM(v.cells[i], true));
      return matM(rr, cc, cells) + (v.cut ? `<mtext class="cut"> (${r}×${c}, first rows shown)</mtext>` : '');
    }
    const n = v.n;
    let s = `<mn>${esc(Number.isNaN(n) || n == null ? 'NaN' : fmtNum(n, inSub ? 3 : 2))}</mn>`;
    if (v.uA) s = row(s, `<mspace width="0.2em"/>`, mm(v.uA));
    else if (v.us) s = row(s, `<mspace width="0.2em"/>`, unitM(v.us));
    return s;
  }

  /** one math region -> HTML */
  function region(r, val, opts) {
    opts = opts || {};
    const e = r.e;
    let body = '';
    if (e[0] === 'def') {
      const t = e[1];
      const lhs = t[0] === 'fn' ? row(ident(t[1]), mo('(', ' stretchy="false"'), t[2].map(p => ident(p)).join(mo(',')), mo(')', ' stretchy="false"')) : mm(t);
      const rhsE = Array.isArray(e[2]) && e[2][0] === 'ev' ? e[2][1] : e[2];
      const shown = Array.isArray(e[2]) && e[2][0] === 'ev';
      let rhs;
      if (val && val.inputHTML) rhs = val.inputHTML;
      else if (Array.isArray(rhsE) && rhsE[0] === 'cb') rhs = `<mtext class="cb">${esc(rhsE[1][val && val.sel != null ? val.sel : rhsE[3]] || '')}</mtext>`;
      else rhs = mm(rhsE);
      body = row(lhs, mo('≔', ' class="def"'), rhs);
      if (val && val.v && (shown || opts.all) && !(val.v.f !== undefined)) {
        if (shown && val.sub && opts.sub !== false) body += row(mo('='), mm(val.sub));
        body += row(mo('='), `<mrow class="${shown ? 'res' : 'res faint'}">${valM(val.v)}</mrow>`);
      }
    } else if (e[0] === 'ev') {
      body = row(mm(e[1]), mo('='), val && val.v ? `<mrow class="mres">${valM(val.v)}</mrow>` : '<mi class="ph">?</mi>');
    } else body = mm(e);
    return `<math display="block" class="mcm">${body}</math>`;
  }

  /* Plots in the app's own style (the data comes from the worksheet; Mathcad's colours, pens and
   * symbols are NOT copied). Each trace gets a role from what it is:
   *   drawing  (detailing: closed section outline, true scale) -> outline / links / bars / rebar / guide lines
   *   chart    (diagram: x-y results)                          -> series 1..4 in fixed order, limits dashed, points */
  // legend words for the worksheet's plot variables Y_<key>; a word is used only when the trace's role agrees with it
  const NAMES = {
    S: ['Section'], o: ['Outline', /outline/], f: ['Outline', /outline/], c: ['Concrete', /outline/],
    w: ['Links', /link/], lk: ['Links', /link/], link: ['Links', /link/], st: ['Struts', /guide/],
    bar: ['Bars', /bar|rebar/], bars: ['Bars', /bar|rebar/], b: ['Bars', /bar|rebar/], tb: ['Top bars', /bar|rebar/], bb: ['Bottom bars', /bar|rebar/],
    na: ['Neutral axis'], 0: ['Datum'], ε: ['Strain ε'], σ: ['Stress σ'], R: ['Resistance', /series|limit/], E: ['Action', /series|limit/],
    T: ['Tie', /rebar/], p: ['Pile', /outline2|series/, 'closed'], g: ['Ground', /series|line/, 'chart'], lp: ['Lap length'], des: ['Design length'], r: ['Reference', /limit|guide/]
  };
  const RE_LINK = /^(w|lk\d*|links?|lnk|stir\w*)$/i;
  const RE_REBAR = /^(b\d*|bars?|tb|bb|bx|by|hb|tie|T\d*|T[xy]|r[a-z]{1,2}|br)$/;
  const plots = new Map(); let plotN = 0;
  const symH = n => { const k = n.indexOf('_'); return k > 0 ? `${esc(n.slice(0, k))}<sub>${esc(n.slice(k + 1))}</sub>` : esc(n); };
  /* short label of a plotted expression: Bars⟨2⟩ -> "Bars", V_Rd/kN -> "V_Rd", P_gr[2] -> "P_gr,2" */
  function exprLab(e, d, full) {
    d = d || 0;
    if (typeof e === 'number') return { t: fmtLit(e), h: fmtLit(e) };
    if (!Array.isArray(e) || d > 4) return null;
    switch (e[0]) {
      case 'v': return { t: e[1], h: symH(e[1]) };
      case '()': case 'ev': return exprLab(e[1], d + 1, full);
      case 'c': return exprLab(e[1], d + 1, full);
      case 'M': { for (const c of e[3]) { const l = exprLab(c, d + 1, full); if (l && /[^\d.\s-]/.test(l.t)) return l; } return null; }
      case 'o': {
        const a = exprLab(e[2], d + 1, full), b = e[3] != null ? exprLab(e[3], d + 1, full) : null;
        // column / element of a result matrix: the bare name, the column or index only when asked for (to tell curves apart)
        if (e[1] === 'col') return a && (full ? { t: a.t + '⟨' + (b ? b.t : '') + '⟩', h: a.h + '<sup>⟨' + (b ? b.h : '') + '⟩</sup>' } : a);
        if (e[1] === 'idx') {
          if (!a) return null;
          if (!full) return a;
          const ix = e.slice(3).map(x => exprLab(x, d + 1)).filter(Boolean).map(x => x.t).join(',');
          return { t: a.t + '[' + ix + ']', h: /<\/sub>$/.test(a.h) ? a.h.replace(/<\/sub>$/, ',' + esc(ix) + '</sub>') : a.h + '<sub>' + esc(ix) + '</sub>' };
        }
        if ((e[1] === '/' || e[1] === '*') && isUnitish(e[3])) return a;
        if (e[1] === '*' && isUnitish(e[2])) return b;
        if (a && b && (e[1] === '+' || e[1] === '-') && a.t.length + b.t.length < 16) return { t: a.t + ' ' + e[1] + ' ' + b.t, h: a.h + ' ' + (e[1] === '-' ? '−' : '+') + ' ' + b.h };
        return a && /[^\d.\s-]/.test(a.t) ? a : b;
      }
    }
    return null;
  }
  const valid = t => { const P = []; (t.x || []).forEach((x, i) => { const y = t.y[i]; if (x != null && y != null) P.push([x, y]); }); return P; };
  const bbox = P => { const xs = P.map(q => q[0]), ys = P.map(q => q[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
  /* closed polygon (end = start), or a curve of many points that comes back round to its start (a circle drawn from 5° to 360°) */
  const isClosed = P => {
    if (P.length <= 3) return false;
    const g = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]);
    if (g < 1e-9) return true;
    if (P.length < 12) return false;
    const [a, b, c, d] = bbox(P);
    return g < 0.06 * Math.hypot(b - a, d - c);
  };
  /* pieces of a trace between pen lifts (a worksheet draws several piles / circles in one trace, separated by NaN) */
  const pieces = t => { const out = []; let cur = []; (t.x || []).forEach((x, i) => { const y = t.y[i]; if (x == null || y == null) { if (cur.length) out.push(cur); cur = []; } else cur.push([x, y]); }); if (cur.length) out.push(cur); return out; };
  const allClosed = t => { const q = pieces(t); return q.length > 0 && q.every(isClosed); };
  /* share of the path length running parallel to the axes (sections, steps, capacity lines) */
  function axisShare(P) {
    let all = 0, ax = 0;
    for (let i = 1; i < P.length; i++) { const dx = Math.abs(P[i][0] - P[i - 1][0]), dy = Math.abs(P[i][1] - P[i - 1][1]), L = Math.hypot(dx, dy); all += L; if (dx < 1e-6 * L || dy < 1e-6 * L) ax += L; }
    return all ? ax / all : 1;
  }
  /* share of the segments running parallel to the axes (unit-free: a step-wise capacity line in a chart) */
  function axisSegs(P) {
    let all = 0, ax = 0;
    for (let i = 1; i < P.length; i++) { const dx = Math.abs(P[i][0] - P[i - 1][0]), dy = Math.abs(P[i][1] - P[i - 1][1]); if (!dx && !dy) continue; all++; if (dx < 1e-9 * (1 + Math.abs(P[i][0])) || dy < 1e-9 * (1 + Math.abs(P[i][1]))) ax++; }
    return all ? ax / all : 1;
  }
  /* a section outline: few corners, mostly straight orthogonal edges, or a circle (an interaction curve is none of these) */
  function outlineShape(P) {
    if (!isClosed(P)) return false;
    if (P.length <= 13 || axisShare(P) >= 0.5) return true;
    const [a, b, c, d] = bbox(P), cx = (a + b) / 2, cy = (c + d) / 2;
    const r = P.map(q => Math.hypot(q[0] - cx, q[1] - cy)), rm = r.reduce((s, v) => s + v, 0) / r.length;
    return r.every(v => Math.abs(v - rm) < 0.04 * rm);
  }
  function plot(p, data, opts) {
    opts = opts || {};
    const raw = (data && data.tr) || [];
    const tr = raw.map((t, k) => Object.assign({}, t, { ye: p.tr && p.tr[k] ? p.tr[k].y : null, xe: p.tr && p.tr[k] ? p.tr[k].x : null }));
    tr.forEach(t => { t.P = valid(t); });
    const pts = [].concat(...tr.map(t => t.P));
    if (!pts.length) return '<div class="mplot empty">No plot data</div>';
    let [x0, x1, y0, y1] = bbox(pts);
    if (x1 === x0) { x0 -= 1; x1 += 1; } if (y1 === y0) { y0 -= 1; y1 += 1; }
    const sameU = tr.length && tr.every(t => JSON.stringify(t.xu || null) === JSON.stringify(t.yu || null) && t.xu);
    const aspect = (y1 - y0) / (x1 - x0);
    const drawing = sameU || (tr.length > 1 && tr[0].P.length && pieces(tr[0]).every(outlineShape) && aspect > 0.08 && aspect < 12);
    // roles from what each trace is (never from Mathcad's pen colour)
    const ol0 = drawing && allClosed(tr[0]) ? bbox(tr[0].P) : null;
    tr.forEach((t, k) => {
      const P = t.P, n = P.length;
      const ye = t.ye, m = Array.isArray(ye) && ye[0] === 'v' ? /^Y_(.+)$/.exec(ye[1]) : null;
      t.key = m ? m[1] : null;
      const pointsOnly = (t.ls === 'None' && t.sym && t.sym !== 'none') || n === 1;
      const dashed = !!(t.ls && /Dash|Dot/.test(t.ls));
      const [a, b, c, d] = n ? bbox(P) : [0, 0, 0, 0];
      t.flat = n >= 2 && (b - a < 1e-12 || d - c < 1e-12);
      t.closed = allClosed(t);
      if (!n) t.role = 'none';
      else if (drawing) {
        let inset = false;
        if (ol0 && k > 0 && n >= 4) { const w = ol0[1] - ol0[0], h = ol0[3] - ol0[2], s = [a - ol0[0], ol0[1] - b, c - ol0[2], ol0[3] - d], lim = 0.12 * Math.min(w, h); inset = s.every(v => v > 0 && v < lim); }
        t.role = pointsOnly ? 'bar' : k === 0 && t.closed ? 'outline' : dashed || /^(na|0)$/.test(t.key || '') ? 'guide'
          : RE_LINK.test(t.key || '') ? 'link' : RE_REBAR.test(t.key || '') ? 'rebar' : inset ? 'link' : t.closed ? 'outline2' : 'line';
      } else {
        const others = tr.some(q => q !== t && q.P.length >= 2 && !(q.ls === 'None' && q.sym && q.sym !== 'none') && (() => { const [qa, qb, qc, qd] = bbox(q.P); return qb - qa > 1e-12 && qd - qc > 1e-12; })());
        t.role = pointsOnly ? 'dots' : /^(na|0)$/.test(t.key || '') || (dashed && (n <= 2 || axisSegs(P) >= 0.7) && others) || (t.flat && others) ? 'limit' : 'series';
      }
    });
    // names: the worksheet's own variable (Y_S -> "Section" where the word fits the role), else the plotted expression
    tr.forEach((t, k) => {
      const nm = t.key != null ? NAMES[t.key] : null;
      if (nm && (!nm[1] || nm[1].test(t.role)) && (nm[2] !== 'closed' || t.closed) && (nm[2] !== 'chart' || !drawing)) { t.name = nm[0]; t.html = esc(nm[0]); return; }
      if (t.key != null) { t.name = t.key; t.html = esc(t.key.replace(/_/g, ' ')); return; }
      const l = exprLab(t.ye);
      if (l) { t.name = l.t; t.html = l.h; } else { t.name = 'Series ' + (k + 1); t.html = t.name; }
    });
    // the same name on curves with different x (depth profiles z vs. several results): name them by their x instead
    if (!drawing) {
      const by = {}; tr.forEach(t => { if (t.role !== 'none') (by[t.name] = by[t.name] || []).push(t); });
      Object.values(by).forEach(g => {
        if (g.length < 2) return;
        const xl = g.map(t => exprLab(t.xe));
        const fl = g.map(t => (t.key == null ? exprLab(t.ye, 0, true) : null));
        if (fl.every(Boolean) && new Set(fl.map(l => l.t)).size === g.length) g.forEach((t, i) => { t.name = fl[i].t; t.html = fl[i].h; });
        else if (xl.every(Boolean) && new Set(xl.map(l => l.t)).size === g.length) g.forEach((t, i) => { t.name = xl[i].t; t.html = xl[i].h; });
        else g.forEach((t, i) => { if (i) { t.name += ' (' + (i + 1) + ')'; t.html += ' (' + (i + 1) + ')'; } });
      });
    }
    // palette slots by name: a member drawn several times keeps one colour
    const slotOf = {}; let sn = 0;
    tr.forEach(t => { if (t.role === 'series' || t.role === 'dots' || t.role === 'line') { if (!(t.name in slotOf)) slotOf[t.name] = sn++; t.slot = (slotOf[t.name] % 4) + 1; t.alt = slotOf[t.name] >= 4; } });
    const W = 560, H = drawing ? Math.max(200, Math.min(560, 520 * aspect + 40)) : 320;
    const pad = drawing ? { l: 70, r: 16, t: 14, b: 58 } : { l: 58, r: 18, t: 14, b: 36 };
    const dx = (x1 - x0) * (drawing ? 0.08 : 0.04), dy = (y1 - y0) * (drawing ? 0.08 : 0.07);
    x0 -= dx; x1 += dx; y0 -= dy; y1 += dy;
    let sx = (W - pad.l - pad.r) / (x1 - x0), sy = (H - pad.t - pad.b) / (y1 - y0);
    if (drawing) { const q = Math.min(sx, sy); sx = sy = q; }
    // drawings: true scale, centred in the frame
    const ox = drawing ? ((W - pad.l - pad.r) - (x1 - x0) * sx) / 2 : 0, oy = drawing ? ((H - pad.t - pad.b) - (y1 - y0) * sy) / 2 : 0;
    const X = x => pad.l + ox + (x - x0) * sx, Y = y => H - pad.b - oy - (y - y0) * sy;
    const ticks = (a, b, n) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const m = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toPrecision(10)); return out; };
    const id = 'pl' + (++plotN);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="mplot ${drawing ? 'drawing' : 'chart'}" role="img" aria-label="${esc(tr.filter(t => t.role !== 'none').map(t => t.name).join(', '))}" data-pid="${id}">`;
    // recessive grid + axes
    const hasOl = drawing && tr.some(t => t.role === 'outline');
    const xt = hasOl ? [] : ticks(x0, x1, drawing ? 6 : 7), yt = hasOl ? [] : ticks(y0, y1, drawing ? 6 : 5);
    xt.forEach(v => { s += `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${pad.t}" y2="${(pad.t + ih).toFixed(1)}" class="pg"/><text x="${X(v).toFixed(1)}" y="${(H - pad.b + 15).toFixed(1)}" class="pt" text-anchor="middle">${fmtNum(v, 3)}</text>`; });
    yt.forEach(v => { if (Y(v) < pad.t - 0.5 || Y(v) > pad.t + ih + 0.5) return; s += `<line x1="${pad.l}" x2="${(pad.l + iw).toFixed(1)}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="pg"/><text x="${pad.l - 7}" y="${(Y(v) + 3.5).toFixed(1)}" class="pt" text-anchor="end">${fmtNum(v, 3)}</text>`; });
    if (!drawing && y0 < 0 && y1 > 0) s += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="pz"/>`;
    if (!hasOl) s += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="pa"/>`;
    const path = t => { let d = '', pen = false; t.x.forEach((x, i) => { const y = t.y[i]; if (x == null || y == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); pen = true; }); return d; };
    const order = { none: -1, outline: 0, outline2: 1, guide: 2, limit: 2, line: 3, series: 3, link: 4, rebar: 5, dots: 6, bar: 7 };
    tr.map((t, k) => [t, k]).sort((a, b) => order[a[0].role] - order[b[0].role]).forEach(([t]) => {
      if (t.role === 'none') return;
      const cls = (t.slot ? ` s${t.slot}` : '') + (t.alt ? ' p-alt' : '');
      if (t.role === 'bar' || t.role === 'dots') t.P.forEach(([x, y]) => { s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${t.role === 'bar' ? 5 : 4}" class="p-${t.role}${cls}"/>`; });
      else if (t.role === 'outline' && pieces(t).length > 1) {
        // one outline trace with a ring drawn inside it (circular pile: section + spiral link): section filled, ring as the link
        const q = pieces(t), o = bbox(q[0]), inside = r => { const b = bbox(r); return b[0] > o[0] && b[1] < o[1] && b[2] > o[2] && b[3] < o[3]; };
        const d = r => r.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
        s += `<path d="${q.filter((r, i) => !i || !inside(r)).map(d).join('')}" class="p-outline"/>`;
        const inner = q.slice(1).filter(inside);
        if (inner.length) s += `<path d="${inner.map(d).join('')}" class="p-link"/>`;
      } else s += `<path d="${path(t)}" class="p-${t.role}${cls}"/>`;
    });
    const units = [tr[0] && tr[0].xu, tr[0] && tr[0].yu].map(u => (u ? unitText(u) : ''));
    // dimension lines of the calculated outline, set outside everything that is drawn
    const ol = drawing && tr.find(t => t.role === 'outline');
    if (ol) {
      const [a, b, c, d] = bbox(ol.P), all = bbox(pts);
      const yd = Y(all[2]) + 30, xd = X(all[0]) - 34, u = units[0] ? ' ' + esc(units[0]) : '';
      const dimT = v => esc(fmtNum(+v.toPrecision(5), 4)) + u;
      const tick = (x, y) => `<line x1="${(x - 4).toFixed(1)}" y1="${(y + 4).toFixed(1)}" x2="${(x + 4).toFixed(1)}" y2="${(y - 4).toFixed(1)}" class="pdim"/>`;
      const tw = str => str.replace(/<[^>]+>/g, '').length * 6.4 + 8;
      const ht = dimT(b - a), vt = dimT(d - c);
      const hFit = X(b) - X(a) >= tw(ht), vFit = Y(c) - Y(d) >= tw(vt);
      s += `<g class="pdims"><line x1="${X(a).toFixed(1)}" x2="${X(b).toFixed(1)}" y1="${yd.toFixed(1)}" y2="${yd.toFixed(1)}" class="pdim"/>${tick(X(a), yd)}${tick(X(b), yd)}`
        + `<line x1="${X(a).toFixed(1)}" x2="${X(a).toFixed(1)}" y1="${(Y(c) + 6).toFixed(1)}" y2="${(yd + 6).toFixed(1)}" class="pext"/><line x1="${X(b).toFixed(1)}" x2="${X(b).toFixed(1)}" y1="${(Y(c) + 6).toFixed(1)}" y2="${(yd + 6).toFixed(1)}" class="pext"/>`
        + (hFit ? `<text x="${((X(a) + X(b)) / 2).toFixed(1)}" y="${(yd - 5).toFixed(1)}" text-anchor="middle" class="pdt">${ht}</text>` : `<text x="${(X(b) + 8).toFixed(1)}" y="${(yd + 4).toFixed(1)}" text-anchor="start" class="pdt">${ht}</text>`)
        + `<line y1="${Y(c).toFixed(1)}" y2="${Y(d).toFixed(1)}" x1="${xd.toFixed(1)}" x2="${xd.toFixed(1)}" class="pdim"/>${tick(xd, Y(c))}${tick(xd, Y(d))}`
        + `<line y1="${Y(c).toFixed(1)}" y2="${Y(c).toFixed(1)}" x1="${(xd - 6).toFixed(1)}" x2="${(X(a) - 6).toFixed(1)}" class="pext"/><line y1="${Y(d).toFixed(1)}" y2="${Y(d).toFixed(1)}" x1="${(xd - 6).toFixed(1)}" x2="${(X(a) - 6).toFixed(1)}" class="pext"/>`
        + (vFit ? `<text transform="translate(${(xd - 6).toFixed(1)} ${((Y(c) + Y(d)) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" class="pdt">${vt}</text>` : `<text transform="translate(${(xd + 4).toFixed(1)} ${(Y(d) - 8).toFixed(1)}) rotate(-90)" text-anchor="start" class="pdt">${vt}</text>`) + '</g>';
    }
    if (units[0] && !hasOl) s += `<text x="${pad.l + iw}" y="${H - 3}" class="pu" text-anchor="end">${esc(units[0])}</text>`;
    if (units[1] && !drawing) s += `<text x="${pad.l - 7}" y="${pad.t - 3}" class="pu" text-anchor="end">${esc(units[1])}</text>`;
    if (!drawing) s += `<g class="phov" style="display:none"><line class="pxh" y1="${pad.t}" y2="${pad.t + ih}"/></g><rect class="phit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}"/>`;
    s += '</svg>';
    plots.set(id, { tr: tr.filter(t => t.role !== 'none'), X0: x0 - ox / sx, sx, pad, drawing, X, Y, units });
    if (plots.size > 400) plots.delete(plots.keys().next().value);
    // legend (always for >= 2 drawn traces; identity never by colour alone) + data table
    const shown = tr.filter(t => t.role !== 'none');
    const sw = t => `<i class="${t.role === 'bar' || t.role === 'dots' ? 'lg-dot' : 'lg-line'} p-${t.role}${t.slot ? ' s' + t.slot : ''}${t.alt ? ' p-alt' : ''}"></i>`;
    const seen = new Map();
    shown.forEach(t => { const k = t.role + '|' + t.name + '|' + (t.slot || '') + (t.alt ? 'a' : ''); if (!seen.has(k)) seen.set(k, { t, n: 0 }); seen.get(k).n += t.P.length; });
    const leg = shown.length > 1 ? `<div class="plegend">${[...seen.values()].map(({ t, n }) => `<span>${sw(t)}<bdi>${t.html}</bdi>${t.role === 'bar' ? ` <b>${n} no.</b>` : ''}</span>`).join('')}</div>` : '';
    const rows = []; shown.forEach(t => t.P.forEach(([x, y]) => { if (rows.length < 80) rows.push(`<tr><td>${t.html}</td><td>${fmtNum(x, 4)}</td><td>${fmtNum(y, 4)}</td></tr>`); }));
    const table = `<details class="pdata no-print"><summary>Data</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Series</th><th class="num">x${units[0] ? ' (' + esc(units[0]) + ')' : ''}</th><th class="num">y${units[1] ? ' (' + esc(units[1]) + ')' : ''}</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
    return `<div class="pwrap">${s}<div class="ptip" hidden></div></div>${leg}${table}`;
  }
  /* hover: crosshair + nearest value of each series (charts only) */
  if (typeof document !== 'undefined') document.addEventListener('pointermove', ev => {
    const svg = ev.target.closest && ev.target.closest('svg.mplot.chart');
    document.querySelectorAll('.pwrap .ptip:not([hidden])').forEach(t => { if (!svg || t.parentNode !== svg.parentNode) { t.hidden = true; const g = t.parentNode.querySelector('.phov'); if (g) g.style.display = 'none'; } });
    if (!svg) return;
    const P = plots.get(svg.dataset.pid); if (!P) return;
    const r = svg.getBoundingClientRect(), k = svg.viewBox.baseVal.width / r.width;
    const vx = (ev.clientX - r.left) * k, x = P.X0 + (vx - P.pad.l) / P.sx;
    const lines = [];
    // value of each series at the cursor: linear interpolation on the segment that spans x, else the nearest point
    P.tr.forEach(t => {
      if (t.role === 'limit') return;
      let v = null, bd = Infinity, nv = null, nx = null;
      for (let i = 0; i < t.x.length; i++) {
        const a = t.x[i], ya = t.y[i]; if (a == null || ya == null) continue;
        const d = Math.abs(a - x); if (d < bd - 1e-12 || (d <= bd + 1e-12 && nv !== null && Math.abs(ya) > Math.abs(nv))) { bd = d; nv = ya; nx = a; }   // on a vertical line: its far end
        const b = t.x[i + 1], yb = t.y[i + 1];
        if (v === null && b != null && yb != null && (x - a) * (x - b) <= 0 && a !== b) v = ya + (yb - ya) * (x - a) / (b - a);
      }
      // off the curve (outside its x range, e.g. a bar of a bar chart): no value rather than a misleading nearest one
      if (t.role === 'dots' || v === null) { if (nv !== null && Math.abs(nx - x) * P.sx < 14) lines.push([t, nv, nx]); }
      else lines.push([t, v, x]);
    });
    if (!lines.length) return;
    const tip = svg.parentNode.querySelector('.ptip'), g = svg.querySelector('.phov');
    const cx = Math.max(P.pad.l, Math.min(P.X(lines[0][2]), svg.viewBox.baseVal.width - P.pad.r)), gx = cx;
    g.style.display = ''; g.querySelector('.pxh').setAttribute('x1', gx); g.querySelector('.pxh').setAttribute('x2', gx);
    tip.innerHTML = `<b>x = ${fmtNum(lines[0][2], 4)}${P.units[0] ? ' ' + esc(P.units[0]) : ''}</b>` + lines.slice(0, 6).map(([t, y]) => `<span><i class="lg-line p-${t.role}${t.slot ? ' s' + t.slot : ''}${t.alt ? ' p-alt' : ''}"></i><bdi>${t.html}</bdi><em>${fmtNum(y, 4)}${P.units[1] ? ' ' + esc(P.units[1]) : ''}</em></span>`).join('');
    tip.hidden = false;
    const left = (gx / k) + 12, w = tip.offsetWidth;
    tip.style.left = (left + w > r.width ? (gx / k) - w - 12 : left) + 'px';
    tip.style.top = Math.max(0, (ev.clientY - r.top) - 20) + 'px';
  });
  function unitText(u) {
    if (!Array.isArray(u)) return String(u);
    if (u[0] === 'u') return u[1];
    if (u[0] === '()') return unitText(u[1]);
    if (u[0] === 'o') return unitText(u[2]) + ({ '*': '·', '/': '/', '^': '^' }[u[1]] || '') + unitText(u[3]);
    return String(u);
  }
  /* plain-text formula (for search, CSV, tooltips) */
  function text(e) {
    if (typeof e === 'number') return fmtLit(e);
    if (e == null) return '▪';
    switch (e[0]) {
      case 's': return '"' + e[1] + '"';
      case 'v': case 'u': case 'f': case 'k': return e[1];
      case '()': return '(' + text(e[1]) + ')';
      case 'o': return e.length === 3 ? e[1] + text(e[2]) : e[1] === 'idx' ? text(e[2]) + '[' + e.slice(3).map(text).join(',') + ']' : text(e[2]) + ' ' + e[1] + ' ' + text(e[3]);
      case 'c': return text(e[1]) + '(' + e[2].map(text).join(', ') + ')';
      default: return '…';
    }
  }

  EC.mrender = { mm, region, plot, valM, ident, unitText, text, esc };
})(typeof window !== 'undefined' ? window : globalThis);
