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

  /* xy plot as SVG */
  function plot(p, data, opts) {
    opts = opts || {};
    const tr = (data && data.tr) || [];
    const pts = [];
    tr.forEach(t => t.x.forEach((x, i) => { if (x != null && t.y[i] != null) pts.push([x, t.y[i]]); }));
    if (!pts.length) return '<div class="mplot empty">No plot data</div>';
    let x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0]));
    let y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
    if (x1 === x0) { x0 -= 1; x1 += 1; } if (y1 === y0) { y0 -= 1; y1 += 1; }
    // geometry plots (same unit on both axes) keep a true scale
    const same = tr.length && tr.every(t => JSON.stringify(t.xu || null) === JSON.stringify(t.yu || null) && t.xu);
    const W = 520, H = same ? Math.max(180, Math.min(520, 520 * (y1 - y0) / (x1 - x0))) : 300;
    const pad = { l: 54, r: 14, t: 12, b: 34 };
    const dx = (x1 - x0) * 0.05, dy = (y1 - y0) * 0.06;
    x0 -= dx; x1 += dx; y0 -= dy; y1 += dy;
    let sx = (W - pad.l - pad.r) / (x1 - x0), sy = (H - pad.t - pad.b) / (y1 - y0);
    if (same) { const s = Math.min(sx, sy); sx = sy = s; }
    const X = x => pad.l + (x - x0) * sx, Y = y => H - pad.b - (y - y0) * sy;
    const ticks = (a, b, n) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const m = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toPrecision(10)); return out; };
    let s = `<svg viewBox="0 0 ${W} ${H}" class="mplot" role="img"><rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" class="pf"/>`;
    ticks(x0, x1, 7).forEach(v => { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${pad.t}" y2="${H - pad.b}" class="pg"/><text x="${X(v)}" y="${H - pad.b + 14}" class="pt" text-anchor="middle">${fmtNum(v, 3)}</text>`; });
    ticks(y0, y1, 6).forEach(v => { s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="pg"/><text x="${pad.l - 5}" y="${Y(v) + 3.5}" class="pt" text-anchor="end">${fmtNum(v, 3)}</text>`; });
    const dash = { Dash: '7 4', Dot: '2 3', DashDot: '7 3 2 3', None: null };
    tr.forEach((t, k) => {
      const col = t.c && t.c !== '#000000' ? t.c : 'var(--ink)';
      const P = t.x.map((x, i) => (x == null || t.y[i] == null ? null : [X(x), Y(t.y[i])]));
      if (t.ls !== 'None') {
        let d = ''; let pen = false;
        P.forEach(q => { if (!q) { pen = false; return; } d += (pen ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); pen = true; });
        s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${Math.max(1, Math.min(4, t.w || 1))}" ${dash[t.ls] ? `stroke-dasharray="${dash[t.ls]}"` : ''} stroke-linejoin="round"/>`;
      }
      if (t.sym && t.sym !== 'none') P.forEach(q => { if (q) s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${Math.max(2, Math.min(5, (t.w || 2) / 1.6))}" fill="${col}"/>`; });
    });
    const units = [tr[0] && tr[0].xu, tr[0] && tr[0].yu].map(u => (u ? unitText(u) : ''));
    if (units[0]) s += `<text x="${W - pad.r}" y="${H - 4}" class="pt" text-anchor="end">${esc(units[0])}</text>`;
    if (units[1]) s += `<text x="4" y="${pad.t + 8}" class="pt">${esc(units[1])}</text>`;
    s += '</svg>';
    const leg = (p.legend || []).filter(Boolean);
    return s + (leg.length ? `<div class="legend">${leg.map((l, i) => `<span><i style="background:${(tr[i] && tr[i].c) || 'var(--ink)'}"></i>${esc(l)}</span>`).join('')}</div>` : '');
  }
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
