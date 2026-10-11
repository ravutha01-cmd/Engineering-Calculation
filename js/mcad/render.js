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
   *   drawing  (detailing: closed section outline, true scale) -> outline / links / bars / guide lines
   *   chart    (diagram: x-y results)                          -> series 1..4 in fixed order, limits dashed */
  const NAMES = { S: 'Section', o: 'Outline', f: 'Outline', c: 'Concrete', w: 'Links', lk: 'Links', st: 'Struts', bar: 'Bars', b: 'Bars', tb: 'Top bars', bb: 'Bottom bars',
    na: 'Neutral axis', 0: 'Datum', ε: 'Strain ε', σ: 'Stress σ', R: 'Resistance', E: 'Action', T: 'Tie', p: 'Pile', k: 'Characteristic', g: 'Ground', a: 'Anchor', lp: 'Lap length', des: 'Design length', r: 'Reference' };
  const plots = new Map(); let plotN = 0;
  function trName(t, k) {
    const e = t.ye;
    if (Array.isArray(e) && e[0] === 'v') { const m = /^Y_(.+)$/.exec(e[1]); if (m) return NAMES[m[1]] || m[1].replace(/_/g, ' '); return e[1].replace(/_/g, ' '); }
    if (Array.isArray(e) && e[0] === 'o' && e[1] === 'idx' && Array.isArray(e[2]) && e[2][0] === 'v') return e[2][1].replace(/^Y_/, '').replace(/_/g, ' ');
    return 'Series ' + (k + 1);
  }
  function plot(p, data, opts) {
    opts = opts || {};
    const raw = (data && data.tr) || [];
    const tr = raw.map((t, k) => Object.assign({}, t, { ye: p.tr && p.tr[k] ? p.tr[k].y : null }));
    const pts = [];
    tr.forEach(t => (t.x || []).forEach((x, i) => { if (x != null && t.y[i] != null) pts.push([x, t.y[i]]); }));
    if (!pts.length) return '<div class="mplot empty">No plot data</div>';
    let x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0]));
    let y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
    if (x1 === x0) { x0 -= 1; x1 += 1; } if (y1 === y0) { y0 -= 1; y1 += 1; }
    const closed = t => { const P = t.x.map((x, i) => [x, t.y[i]]).filter(q => q[0] != null && q[1] != null); return P.length > 3 && Math.abs(P[0][0] - P[P.length - 1][0]) < 1e-9 && Math.abs(P[0][1] - P[P.length - 1][1]) < 1e-9; };
    const sameU = tr.length && tr.every(t => JSON.stringify(t.xu || null) === JSON.stringify(t.yu || null) && t.xu);
    const aspect = (y1 - y0) / (x1 - x0);
    const drawing = sameU || (tr.length > 1 && closed(tr[0]) && aspect > 0.08 && aspect < 12);
    // roles
    let sn = 0;
    tr.forEach((t, k) => {
      const pointsOnly = t.ls === 'None' && t.sym && t.sym !== 'none';
      const guide = t.ls && /Dash|Dot/.test(t.ls);
      t.name = trName(t, k);
      if (drawing) t.role = pointsOnly ? 'bar' : k === 0 && closed(t) ? 'outline' : guide || /neutral|datum/i.test(t.name) ? 'guide' : /link|strut|stirrup/i.test(t.name) ? 'link' : closed(t) ? 'outline2' : 'line';
      else {
        const xs = t.x.filter(v => v != null), ys = t.y.filter(v => v != null);
        const flat = xs.length && (Math.max(...xs) - Math.min(...xs) < 1e-12 || Math.max(...ys) - Math.min(...ys) < 1e-12);   // vertical / horizontal reference line
        t.role = guide || /datum|neutral|limit/i.test(t.name) || (flat && tr.length > 1) ? 'limit' : pointsOnly ? 'dots' : 'series';
      }
      if (t.role === 'series' || t.role === 'dots' || t.role === 'line') t.slot = (sn++ % 4) + 1;
    });
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
    let s = `<svg viewBox="0 0 ${W} ${H}" class="mplot ${drawing ? 'drawing' : 'chart'}" role="img" aria-label="${esc(tr.map(t => t.name).join(', '))}" data-pid="${id}">`;
    // recessive grid + axes
    const hasOl = drawing && tr.some(t => t.role === 'outline');
    const xt = hasOl ? [] : ticks(x0, x1, drawing ? 6 : 7), yt = hasOl ? [] : ticks(y0, y1, drawing ? 6 : 5);
    xt.forEach(v => { s += `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${pad.t}" y2="${(pad.t + ih).toFixed(1)}" class="pg"/><text x="${X(v).toFixed(1)}" y="${(H - pad.b + 15).toFixed(1)}" class="pt" text-anchor="middle">${fmtNum(v, 3)}</text>`; });
    yt.forEach(v => { if (Y(v) < pad.t - 0.5 || Y(v) > pad.t + ih + 0.5) return; s += `<line x1="${pad.l}" x2="${(pad.l + iw).toFixed(1)}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="pg"/><text x="${pad.l - 7}" y="${(Y(v) + 3.5).toFixed(1)}" class="pt" text-anchor="end">${fmtNum(v, 3)}</text>`; });
    if (!drawing && y0 < 0 && y1 > 0) s += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="pz"/>`;
    if (!hasOl) s += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="pa"/>`;
    const path = t => { let d = '', pen = false; t.x.forEach((x, i) => { const y = t.y[i]; if (x == null || y == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); pen = true; }); return d; };
    const order = { outline: 0, outline2: 1, guide: 2, limit: 2, line: 3, series: 3, link: 4, dots: 5, bar: 6 };
    tr.map((t, k) => [t, k]).sort((a, b) => order[a[0].role] - order[b[0].role]).forEach(([t]) => {
      const cls = t.slot ? ` s${t.slot}` : '';
      if (t.role === 'bar' || t.role === 'dots') {
        t.x.forEach((x, i) => { const y = t.y[i]; if (x == null || y == null) return; s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${t.role === 'bar' ? 5 : 4}" class="p-${t.role}${cls}"/>`; });
      } else s += `<path d="${path(t)}" class="p-${t.role}${cls}"/>`;
    });
    const units = [tr[0] && tr[0].xu, tr[0] && tr[0].yu].map(u => (u ? unitText(u) : ''));
    // dimension lines from the calculated outline (detailing drawings)
    const ol = drawing && tr.find(t => t.role === 'outline');
    if (ol) {
      const xs = ol.x.filter(v => v != null), ys = ol.y.filter(v => v != null);
      const a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys);
      const yd = Y(c) + 30, xd = X(a) - 34, u = units[0] ? ' ' + esc(units[0]) : '';
      const tick = (x, y) => `<line x1="${(x - 4).toFixed(1)}" y1="${(y + 4).toFixed(1)}" x2="${(x + 4).toFixed(1)}" y2="${(y - 4).toFixed(1)}" class="pdim"/>`;
      s += `<g class="pdims"><line x1="${X(a).toFixed(1)}" x2="${X(b).toFixed(1)}" y1="${yd.toFixed(1)}" y2="${yd.toFixed(1)}" class="pdim"/>${tick(X(a), yd)}${tick(X(b), yd)}`
        + `<line x1="${X(a).toFixed(1)}" x2="${X(a).toFixed(1)}" y1="${(Y(c) + 6).toFixed(1)}" y2="${(yd + 6).toFixed(1)}" class="pext"/><line x1="${X(b).toFixed(1)}" x2="${X(b).toFixed(1)}" y1="${(Y(c) + 6).toFixed(1)}" y2="${(yd + 6).toFixed(1)}" class="pext"/>`
        + `<text x="${((X(a) + X(b)) / 2).toFixed(1)}" y="${(yd - 5).toFixed(1)}" text-anchor="middle" class="pdt">${fmtNum(b - a, 4)}${u}</text>`
        + `<line y1="${Y(c).toFixed(1)}" y2="${Y(d).toFixed(1)}" x1="${xd.toFixed(1)}" x2="${xd.toFixed(1)}" class="pdim"/>${tick(xd, Y(c))}${tick(xd, Y(d))}`
        + `<line y1="${Y(c).toFixed(1)}" y2="${Y(c).toFixed(1)}" x1="${(xd - 6).toFixed(1)}" x2="${(X(a) - 6).toFixed(1)}" class="pext"/><line y1="${Y(d).toFixed(1)}" y2="${Y(d).toFixed(1)}" x1="${(xd - 6).toFixed(1)}" x2="${(X(a) - 6).toFixed(1)}" class="pext"/>`
        + `<text transform="translate(${(xd - 6).toFixed(1)} ${((Y(c) + Y(d)) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" class="pdt">${fmtNum(d - c, 4)}${u}</text></g>`;
    }
    if (units[0] && !hasOl) s += `<text x="${pad.l + iw}" y="${H - 3}" class="pu" text-anchor="end">${esc(units[0])}</text>`;
    if (units[1] && !drawing) s += `<text x="${pad.l - 7}" y="${pad.t - 3}" class="pu" text-anchor="end">${esc(units[1])}</text>`;
    if (!drawing) s += `<g class="phov" style="display:none"><line class="pxh" y1="${pad.t}" y2="${pad.t + ih}"/></g><rect class="phit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}"/>`;
    s += '</svg>';
    plots.set(id, { tr, X0: x0 - ox / sx, sx, pad, drawing, X, Y, units });
    if (plots.size > 400) plots.delete(plots.keys().next().value);
    // legend (always for >= 2 traces; identity never by colour alone) + data table
    const sw = t => t.role === 'bar' || t.role === 'dots' ? `<i class="lg-dot p-${t.role}${t.slot ? ' s' + t.slot : ''}"></i>` : `<i class="lg-line p-${t.role}${t.slot ? ' s' + t.slot : ''}"></i>`;
    const seen = new Set();
    const leg = tr.length > 1 ? `<div class="plegend">${tr.filter(t => { const k = t.role + t.name; if (seen.has(k)) return false; seen.add(k); return true; }).map(t => `<span>${sw(t)}${esc(t.name)}${t.role === 'bar' ? ` <b>${tr.filter(q => q.role === 'bar').reduce((n, q) => n + q.x.filter((v, i) => v != null && q.y[i] != null).length, 0)} no.</b>` : ''}</span>`).join('')}</div>` : '';
    const rows = []; tr.forEach(t => t.x.forEach((x, i) => { if (rows.length < 80 && x != null && t.y[i] != null) rows.push(`<tr><td>${esc(t.name)}</td><td>${fmtNum(x, 4)}</td><td>${fmtNum(t.y[i], 4)}</td></tr>`); }));
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
        const d = Math.abs(a - x); if (d < bd) { bd = d; nv = ya; nx = a; }
        const b = t.x[i + 1], yb = t.y[i + 1];
        if (v === null && b != null && yb != null && (x - a) * (x - b) <= 0 && a !== b) v = ya + (yb - ya) * (x - a) / (b - a);
      }
      if (t.role === 'dots' || v === null) { if (nv !== null && (t.role !== 'dots' || Math.abs(nx - x) * P.sx < 14)) lines.push([t, nv, nx]); }
      else lines.push([t, v, x]);
    });
    if (!lines.length) return;
    const tip = svg.parentNode.querySelector('.ptip'), g = svg.querySelector('.phov');
    const cx = Math.max(P.pad.l, Math.min(P.X(lines[0][2]), svg.viewBox.baseVal.width - P.pad.r)), gx = cx;
    g.style.display = ''; g.querySelector('.pxh').setAttribute('x1', gx); g.querySelector('.pxh').setAttribute('x2', gx);
    tip.innerHTML = `<b>x = ${fmtNum(lines[0][2], 4)}${P.units[0] ? ' ' + esc(P.units[0]) : ''}</b>` + lines.slice(0, 6).map(([t, y]) => `<span><i class="lg-line p-${t.role}${t.slot ? ' s' + t.slot : ''}"></i>${esc(t.name)}<em>${fmtNum(y, 4)}${P.units[1] ? ' ' + esc(P.units[1]) : ''}</em></span>`).join('');
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
