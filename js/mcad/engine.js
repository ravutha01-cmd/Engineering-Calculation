/* Mathcad Prime worksheet engine.
 * Evaluates the expression trees produced by tools/mcdx2json.py with units,
 * matrices (ORIGIN = 1), strings, user functions, programs, root() and the
 * built-in functions used by the math.Claude worksheets.
 */
(function (root) {
  'use strict';
  const EC = root.EC = root.EC || {};

  /* ---------- quantities ---------- */
  // dims: [L, M, T, K]
  const D0 = [0, 0, 0, 0];
  class Q {
    constructor(v, d) { this.v = v; this.d = d; }
  }
  const isQ = x => x instanceof Q;
  function mk(v, d) {
    if (!d || (d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] === 0)) return v;
    return new Q(v, d);
  }
  const dimOf = x => (x instanceof Q ? x.d : D0);
  const valOf = x => (x instanceof Q ? x.v : x);
  const sameD = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  const addD = (a, b, s) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
  const scaleD = (a, k) => a.map(x => Math.round(x * k * 1e9) / 1e9);

  class Mat {
    constructor(r, c, a) { this.r = r; this.c = c; this.a = a || new Array(r * c).fill(0); }
    get(i, j) { return this.a[i * this.c + j]; }
    set(i, j, v) { this.a[i * this.c + j] = v; }
  }
  const isM = x => x instanceof Mat;
  class Fn { constructor(params, body, seq, name) { this.params = params; this.body = body; this.seq = seq; this.name = name; } }
  class Builtin { constructor(f, lazy) { this.f = f; this.lazy = lazy; } }
  class Range { constructor(a, step, b) { this.a = a; this.step = step; this.b = b; }
    toArray() {
      const out = []; const a = valOf(this.a), b = valOf(this.b), s = valOf(this.step); const d = dimOf(this.a);
      if (!s) return out;
      const n = Math.floor((b - a) / s + 1e-9);
      for (let k = 0; k <= n && k < 1e6; k++) out.push(mk(a + k * s, d));
      return out;
    } }

  class MErr extends Error { constructor(m) { super(m); this.name = 'MErr'; } }
  const err = m => { throw new MErr(m); };

  /* ---------- units ---------- */
  const L = [1, 0, 0, 0], Mk = [0, 1, 0, 0], T = [0, 0, 1, 0], K = [0, 0, 0, 1];
  const Nd = [1, 1, -2, 0], Pad = [-1, 1, -2, 0], Jd = [2, 1, -2, 0];
  const U = {
    m: [1, L], mm: [1e-3, L], cm: [1e-2, L], km: [1e3, L], um: [1e-6, L], μm: [1e-6, L], in: [0.0254, L], ft: [0.3048, L],
    kg: [1, Mk], g: [1e-3, Mk], tonne: [1000, Mk], t: [1000, Mk], mg: [1e-6, Mk],
    s: [1, T], sec: [1, T], min: [60, T], hr: [3600, T], h: [3600, T], day: [86400, T], week: [604800, T], yr: [31556925.9747, T], year: [31556925.9747, T], ms: [1e-3, T],
    K: [1, K], R: [5 / 9, K],
    N: [1, Nd], kN: [1e3, Nd], MN: [1e6, Nd], kgf: [9.80665, Nd],
    Pa: [1, Pad], kPa: [1e3, Pad], MPa: [1e6, Pad], GPa: [1e9, Pad], bar: [1e5, Pad],
    J: [1, Jd], kJ: [1e3, Jd], W: [1, [2, 1, -3, 0]], kW: [1e3, [2, 1, -3, 0]],
    Hz: [1, [0, 0, -1, 0]], kHz: [1e3, [0, 0, -1, 0]],
    rad: [1, D0], deg: [Math.PI / 180, D0], '°': [Math.PI / 180, D0], '%': [0.01, D0],
    L: [1e-3, [3, 0, 0, 0]], liter: [1e-3, [3, 0, 0, 0]], mL: [1e-6, [3, 0, 0, 0]], ha: [1e4, [2, 0, 0, 0]],
    mph: [0.44704, [1, 0, -1, 0]], kph: [1 / 3.6, [1, 0, -1, 0]],
  };
  function unitQ(name) {
    const u = U[name];
    if (!u) err('unknown unit ' + name);
    return mk(u[0], u[1]);
  }

  /* ---------- arithmetic ---------- */
  function num(x, what) {
    if (typeof x === 'number') return x;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (x instanceof Q) err((what || 'value') + ' must be unitless');
    if (isM(x)) err((what || 'value') + ' must be a scalar');
    if (typeof x === 'string') err((what || 'value') + ' must be a number, not a string');
    err('value is not a number');
  }
  function scalarOK(x) { return typeof x === 'number' || x instanceof Q; }
  function add(a, b, s) {
    if (typeof a === 'number' && typeof b === 'number') return a + s * b;
    if (a instanceof Q && b instanceof Q && sameD(a.d, b.d)) return mk(a.v + s * b.v, a.d);
    if (isM(a) || isM(b)) return ew2(a, b, (x, y) => add(x, y, s), true);
    if (typeof a === 'string' || typeof b === 'string') err('cannot add strings (use concat)');
    if (!scalarOK(a) || !scalarOK(b)) err('invalid operand');
    const da = dimOf(a), db = dimOf(b);
    if (!sameD(da, db)) {
      if (valOf(a) === 0 && !(a instanceof Q)) return s > 0 ? b : neg(b);
      if (valOf(b) === 0 && !(b instanceof Q)) return a;
      err('units do not match');
    }
    return mk(valOf(a) + s * valOf(b), da);
  }
  function neg(a) {
    if (isM(a)) return new Mat(a.r, a.c, a.a.map(neg));
    if (typeof a === 'string') err('cannot negate a string');
    return mk(-valOf(a), dimOf(a));
  }
  function mulS(a, b) {
    if (typeof a === 'string' || typeof b === 'string') err('cannot multiply strings');
    return mk(valOf(a) * valOf(b), addD(dimOf(a), dimOf(b), 1));
  }
  function divS(a, b) {
    if (typeof a === 'string' || typeof b === 'string') err('cannot divide strings');
    const bv = valOf(b);
    if (bv === 0) err('division by zero');
    return mk(valOf(a) / bv, addD(dimOf(a), dimOf(b), -1));
  }
  function mul(a, b, vec) {
    if (typeof a === 'number' && typeof b === 'number') return a * b;
    if (isM(a) && isM(b)) {
      if (vec) return ew2(a, b, mulS);
      if (a.c === 1 && b.c === 1 && a.r === b.r && a.r > 1) { // dot product
        let s = 0; for (let i = 0; i < a.r; i++) s = add(s, mulS(a.a[i], b.a[i]), 1); return s;
      }
      if (a.c !== b.r) err('matrix size mismatch in product');
      const out = new Mat(a.r, b.c);
      for (let i = 0; i < a.r; i++) for (let j = 0; j < b.c; j++) {
        let s = 0; for (let k = 0; k < a.c; k++) s = add(s, mulS(a.get(i, k), b.get(k, j)), 1); out.set(i, j, s);
      }
      return out;
    }
    if (isM(a)) return new Mat(a.r, a.c, a.a.map(x => mul(x, b, vec)));
    if (isM(b)) return new Mat(b.r, b.c, b.a.map(x => mul(a, x, vec)));
    return mulS(a, b);
  }
  function div(a, b, vec) {
    if (typeof a === 'number' && typeof b === 'number') { if (b === 0) err('division by zero'); return a / b; }
    if (isM(a) && isM(b)) return ew2(a, b, divS);
    if (isM(a)) return new Mat(a.r, a.c, a.a.map(x => div(x, b, vec)));
    if (isM(b)) { if (vec) return new Mat(b.r, b.c, b.a.map(x => divS(a, x))); err('cannot divide by a matrix'); }
    return divS(a, b);
  }
  function pow(a, b, vec) {
    if (isM(a)) {
      if (vec || a.r !== a.c || a.c === 1) return new Mat(a.r, a.c, a.a.map(x => pow(x, b, vec)));
      const n = num(b); if (n === -1) return inv(a);
      let r = a; for (let i = 1; i < n; i++) r = mul(r, a); return r;
    }
    if (isM(b)) return new Mat(b.r, b.c, b.a.map(x => pow(a, x, vec)));
    const e = num(b, 'exponent');
    const v = Math.pow(valOf(a), e);
    return mk(v, scaleD(dimOf(a), e));
  }
  function nroot(n, x) {
    if (isM(x)) return new Mat(x.r, x.c, x.a.map(y => nroot(n, y)));
    const k = n == null ? 2 : num(n);
    const v = valOf(x);
    let r;
    if (v < 0 && k % 2 === 1) r = -Math.pow(-v, 1 / k);
    else { if (v < 0) err('square root of a negative number'); r = Math.pow(v, 1 / k); }
    return mk(r, scaleD(dimOf(x), 1 / k));
  }
  function cmp(a, b, op) {
    if (typeof a === 'number' && typeof b === 'number') {
      switch (op) { case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
        case '==': return Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b)) ? 1 : 0; case '!=': return Math.abs(a - b) > 1e-12 * Math.max(Math.abs(a), Math.abs(b)) ? 1 : 0; }
    }
    if (isM(a) || isM(b)) return ew2(a, b, (x, y) => cmp(x, y, op));
    if (typeof a === 'string' || typeof b === 'string') {
      if (op === '==') return a === b ? 1 : 0;
      if (op === '!=') return a !== b ? 1 : 0;
      const r = String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
      return ({ '<': r < 0, '>': r > 0, '<=': r <= 0, '>=': r >= 0 }[op]) ? 1 : 0;
    }
    const da = dimOf(a), db = dimOf(b);
    if (!sameD(da, db) && valOf(a) !== 0 && valOf(b) !== 0) err('units do not match in comparison');
    const x = valOf(a), y = valOf(b);
    const tol = 1e-12 * Math.max(Math.abs(x), Math.abs(y));
    switch (op) {
      case '<': return x < y ? 1 : 0;
      case '>': return x > y ? 1 : 0;
      case '<=': return x <= y ? 1 : 0;
      case '>=': return x >= y ? 1 : 0;
      case '==': return Math.abs(x - y) <= tol ? 1 : 0;
      case '!=': return Math.abs(x - y) > tol ? 1 : 0;
    }
  }
  function ew2(a, b, f, strict) {
    if (isM(a) && isM(b)) {
      if (a.r !== b.r || a.c !== b.c) err('matrix sizes do not match');
      return new Mat(a.r, a.c, a.a.map((x, i) => f(x, b.a[i])));
    }
    if (isM(a)) return new Mat(a.r, a.c, a.a.map(x => f(x, b)));
    return new Mat(b.r, b.c, b.a.map(y => f(a, y)));
  }
  function truth(x) {
    if (typeof x === 'number') return x !== 0;
    if (isM(x)) err('condition must be a scalar');
    if (typeof x === 'string') err('condition must be a number');
    return valOf(x) !== 0;
  }
  function inv(A) {
    const n = A.r; if (n !== A.c) err('matrix must be square');
    const M = A.a.map(valOf); const I = new Array(n * n).fill(0); for (let i = 0; i < n; i++) I[i * n + i] = 1;
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
      if (Math.abs(M[p * n + c]) < 1e-300) err('matrix is singular');
      for (let k = 0; k < n; k++) { [M[c * n + k], M[p * n + k]] = [M[p * n + k], M[c * n + k]]; [I[c * n + k], I[p * n + k]] = [I[p * n + k], I[c * n + k]]; }
      const d = M[c * n + c]; for (let k = 0; k < n; k++) { M[c * n + k] /= d; I[c * n + k] /= d; }
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r * n + c]; if (f) for (let k = 0; k < n; k++) { M[r * n + k] -= f * M[c * n + k]; I[r * n + k] -= f * I[c * n + k]; } }
    }
    return new Mat(n, n, I);
  }
  function lsolve(A, b) {
    // supports units: x = A^-1 b with dims from b/A
    const n = A.r; const dA = dimOf(A.a[0]), db = dimOf(b.a[0]);
    const Ai = inv(new Mat(n, n, A.a.map(valOf)));
    const out = new Mat(n, 1);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < n; k++) s += Ai.a[i * n + k] * valOf(b.a[k]); out.a[i] = mk(s, addD(db, dA, -1)); }
    return out;
  }

  /* ---------- environment with versioning (Mathcad: a function sees the values above its definition) ---------- */
  class Env {
    constructor() { this.m = new Map(); this.seq = 0; }
    def(n, v) { this.seq++; let a = this.m.get(n); if (!a) { a = []; this.m.set(n, a); } a.push([this.seq, v]); }
    get(n, seq) {
      const a = this.m.get(n); if (!a) return undefined;
      if (seq == null) return a[a.length - 1][1];
      for (let i = a.length - 1; i >= 0; i--) if (a[i][0] <= seq) return a[i][1];
      return undefined;
    }
    has(n) { return this.m.has(n); }
  }

  /* ---------- formatting ---------- */
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '.': '·' };
  const sup = s => String(s).split('').map(c => SUP[c] || c).join('');
  const DERIVED = [
    [[1, 1, -2, 0], 'N'], [[-1, 1, -2, 0], 'Pa'], [[2, 1, -2, 0], 'J'], [[0, 1, -2, 0], 'N/m'], [[0, 0, -1, 0], 'Hz'],
    [[2, 1, -3, 0], 'W'], [[-2, 1, -2, 0], 'N/m³'], [[1, 0, -1, 0], 'm/s'], [[1, 0, -2, 0], 'm/s²'], [[-3, 1, 0, 0], 'kg/m³'],
  ];
  function dimStr(d) {
    for (const [dd, n] of DERIVED) if (sameD(d, dd)) return n;
    const names = ['m', 'kg', 's', 'K'];
    const pos = [], negp = [];
    d.forEach((e, i) => { if (e > 0) pos.push(names[i] + (e !== 1 ? sup(+e.toFixed(3)) : '')); if (e < 0) negp.push(names[i] + (e !== -1 ? sup(+(-e).toFixed(3)) : '')); });
    let s = pos.join('·') || (negp.length ? '1' : '');
    if (negp.length) s += '/' + (negp.length > 1 ? negp.join('·') : negp[0]);
    return s;
  }
  function fmtNum(v, prec) {
    if (prec == null) prec = 2;
    if (!isFinite(v)) return isNaN(v) ? 'NaN' : (v > 0 ? '∞' : '-∞');
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e7 || a < 1e-3) {
      const e = Math.floor(Math.log10(a)); let m = v / Math.pow(10, e);
      let ms = (+m.toFixed(prec)).toString();
      if (Math.abs(+ms) >= 10) { ms = (+(+ms / 10).toFixed(prec)).toString(); return ms + '·10' + sup(e + 1); }
      return ms + '·10' + sup(e);
    }
    let s = (+v.toFixed(prec)).toString();
    if (s === '0' || s === '-0') { // keep significance for small numbers
      s = (+v.toPrecision(2)).toString();
    }
    return s;
  }

  /* ---------- evaluator ---------- */
  const BUILTIN_VARS = {
    'π': Math.PI, e: Math.E, g: new Q(9.80665, [1, 0, -2, 0]), ORIGIN: 1, TOL: 1e-3, CTOL: 1e-3, NaN: NaN, '∞': Infinity,
    'ε': 8.8541878128e-12, 'TRUE': 1, 'FALSE': 0,
  };

  let CUR = null; // sheet being evaluated (compiled closures are shared between runs)
  class Sheet {
    constructor() { this.env = new Env(); this.funcs = BUILTINS; this.steps = 0; }

    lookup(name, scope) {
      for (let s = scope; s; s = s.parent) {
        if (s.vars && s.vars.has(name)) return s.vars.get(name);
        if (s.seq != null) { const v = this.env.get(name, s.seq); if (v !== undefined) return v; return this.globalFallback(name); }
      }
      const v = this.env.get(name);
      if (v !== undefined) return v;
      return this.globalFallback(name);
    }
    globalFallback(name) {
      if (name in BUILTIN_VARS) return BUILTIN_VARS[name];
      if (BUILTINS[name]) return BUILTINS[name];
      err('“' + name + '” is not defined');
    }

    ev(e, sc) {
      if (typeof e === 'number') return e;
      if (e == null) err('missing operand (placeholder)');
      let f = e.__c;
      if (!f) { f = this.cc(e); Object.defineProperty(e, '__c', { value: f, enumerable: false }); }
      return f(sc);
    }
    /* compile an AST node to a closure (sc) => value */
    cc(e) {
      if (typeof e === 'number') return () => e;
      if (e == null) return () => err('missing operand (placeholder)');
      const C = x => { if (typeof x === 'number') return () => x; if (x == null) return () => err('missing operand (placeholder)'); return sc => CUR.ev(x, sc); };
      switch (e[0]) {
        case 's': { const v = e[1]; return () => v; }
        case 'v': {
          const n = e[1]; let garr, genv = null;
          return sc => {
            let seq = null;
            for (let s = sc; s; s = s.parent) {
              const vs = s.vars;
              if (vs) { const v = vs.get(n); if (v !== undefined) { if (v instanceof ErrVal) err('“' + n + '” has an error above'); return v; } }
              if (s.seq != null) { seq = s.seq; break; }
            }
            if (genv !== CUR.env || garr === undefined) { genv = CUR.env; garr = CUR.env.m.get(n); }
            if (garr) {
              let v;
              if (seq == null) v = garr[garr.length - 1][1];
              else for (let i = garr.length - 1; i >= 0; i--) if (garr[i][0] <= seq) { v = garr[i][1]; break; }
              if (v !== undefined) { if (v instanceof ErrVal) err('“' + n + '” has an error above'); return v; }
            }
            return CUR.lookup(n, sc);
          };
        }
        case 'u': { const v = unitQ(e[1]); return () => v; }
        case 'o': {
          const o = e[1];
          const A = e[2] === undefined ? null : C(e[2]), B = e.length > 3 ? C(e[3]) : null;
          switch (o) {
            case '+': return sc => add(A(sc), B(sc), 1);
            case '-': return e.length === 3 ? sc => neg(A(sc)) : sc => add(A(sc), B(sc), -1);
            case 'neg': return sc => neg(A(sc));
            case '*': return sc => mul(A(sc), B(sc), sc ? sc.vec === true : false);
            case '/': return sc => div(A(sc), B(sc), sc ? sc.vec === true : false);
            case '^': return sc => pow(A(sc), B(sc), sc ? sc.vec === true : false);
            case 'nroot': return e[2] == null ? sc => nroot(null, B(sc)) : sc => nroot(A(sc), B(sc));
            case '==': case '!=': case '<': case '>': case '<=': case '>=': return sc => cmp(A(sc), B(sc), o);
            case 'and': return sc => { const a = A(sc); if (typeof a === 'number') { if (a === 0) return 0; const b = B(sc); return truth(b) ? 1 : 0; } if (isM(a)) return ew2(a, B(sc), (x, y) => (truth(x) && truth(y)) ? 1 : 0); if (!truth(a)) return 0; return truth(B(sc)) ? 1 : 0; };
            case 'or': return sc => { const a = A(sc); if (isM(a)) return ew2(a, B(sc), (x, y) => (truth(x) || truth(y)) ? 1 : 0); if (truth(a)) return 1; return truth(B(sc)) ? 1 : 0; };
            case 'idx':
              if (e.length === 4) return sc => {
                const m = A(sc), i = B(sc);
                if (m instanceof Mat && typeof i === 'number') { const k = i - 1; if ((m.c === 1 || m.r === 1) && k >= 0 && k < m.a.length && k === (k | 0)) return m.a[k]; }
                if (i instanceof Range || isM(i)) { const ids = i instanceof Range ? i.toArray() : i.a; return new Mat(ids.length, 1, ids.map(k => idx1(m, k))); }
                return idx1(m, i);
              };
              if (e.length === 5) { const J = C(e[4]); return sc => { const m = A(sc); if (!isM(m)) err('indexing a non-matrix'); return idx2(m, B(sc), J(sc)); }; }
              return sc => CUR.op(e, sc);
            default: return sc => CUR.op(e, sc);
          }
        }
        case 'c': {
          const fe = e[1], args = e[2];
          if (fe[0] === 'k' && fe[1] === 'if') {
            const T = C(args[0]), A = C(args[1]), B = C(args[2]);
            return sc => {
              const c = T(sc);
              if (typeof c === 'number') return c !== 0 ? A(sc) : B(sc);
              if (isM(c)) { const a = A(sc), b = B(sc); return new Mat(c.r, c.c, c.a.map((x, i) => truth(x) ? (isM(a) ? a.a[i] : a) : (isM(b) ? b.a[i] : b))); }
              return truth(c) ? A(sc) : B(sc);
            };
          }
          if (fe[0] === 'k') return sc => CUR.call(e, sc);
          const AC = args.map(C);
          const n = fe[1];
          const getF = fe[0] === 'v' ? (sc => { try { return CUR.lookup(n, sc); } catch (x) { const b = BUILTINS[n]; if (!b) throw x; return b; } })
            : fe[0] === 'f' ? (sc => { const b = BUILTINS[n]; if (b) return b; const u = CUR.env.get(n); if (!u) err('function ' + n + ' is not supported'); return u; })
              : (sc => CUR.ev(fe, sc));
          return sc => {
            const f = getF(sc);
            if (f instanceof Builtin) {
              if (f.lazy) return f.f.call(CUR, args, sc);
              const av = new Array(AC.length); for (let i = 0; i < AC.length; i++) av[i] = AC[i](sc);
              if (sc && sc.vec === true && f.map) return mapVec(f.f, av);
              return f.f.apply(CUR, av);
            }
            if (f instanceof Fn) {
              const av = new Array(AC.length); for (let i = 0; i < AC.length; i++) av[i] = AC[i](sc);
              return CUR.apply(f, av);
            }
            if (isM(f)) err('a matrix is not a function');
            err('value is not a function');
          };
        }
        case '()': { const A = C(e[1]); return A; }
        case 'P': return sc => CUR.prog(e, sc);
      }
      return sc => CUR.ev0(e, sc);
    }
    ev0(e, sc) {
      if (++this.steps > 4e8) err('calculation too long');
      switch (e[0]) {
        case 's': return e[1];
        case 'v': return this.lookup(e[1], sc);
        case 'u': return unitQ(e[1]);
        case 'f': { const f = BUILTINS[e[1]]; if (!f) err('function ' + e[1] + ' is not supported'); return f; }
        case 'k': err('keyword ' + e[1] + ' used as value');
        case '()': return this.ev(e[1], sc);
        case 'M': {
          const m = new Mat(e[1], e[2]);
          for (let i = 0; i < e[3].length; i++) m.a[i] = e[3][i] == null ? 0 : this.ev(e[3][i], sc);
          return flattenNested(m);
        }
        case 'o': return this.op(e, sc);
        case 'c': return this.call(e, sc);
        case 'vec': return this.ev(e[1], { parent: sc, vars: null, vec: true });
        case 'sum': {
          const v = this.ev(e[1], sc);
          if (!isM(v)) return v;
          let s = 0; for (const x of v.a) s = add(s, x, 1); return s;
        }
        case 'prod': { const v = this.ev(e[1], sc); if (!isM(v)) return v; let s = 1; for (const x of v.a) s = mulS(s, x); return s; }
        case 'sumi': {
          const lo = num(this.ev(e[2], sc)), hi = num(this.ev(e[3], sc));
          const vars = new Map(); const s2 = { parent: sc, vars, vec: sc ? sc.vec : false };
          let s = 0; for (let i = lo; i <= hi; i++) { vars.set(e[1], i); s = add(s, this.ev(e[4], s2), 1); }
          return s;
        }
        case 'rg': return new Range(this.ev(e[1], sc), 1, this.ev(e[2], sc));
        case 'rg3': { const a = this.ev(e[1], sc), a2 = this.ev(e[2], sc); return new Range(a, add(a2, a, -1), this.ev(e[3], sc)); }
        case 'cb': {
          const v = this.ev(e[2][e[3]], sc);
          if (e[4] == null) return v;
          const sf = Array.isArray(e[4]) && Array.isArray(e[4][0]) ? e[4][e[3]] : e[4];
          return sf == null ? v : mul(v, this.ev(sf, sc));
        }
        case 'P': return this.prog(e, sc);
        case 'ev': return this.ev(e[1], sc);
        case 'def': err('definition inside expression');
        case 'seq': err('unexpected list');
      }
      err('unsupported expression ' + e[0]);
    }

    op(e, sc) {
      const o = e[1];
      const vec = sc ? sc.vec === true : false;
      switch (o) {
        case '+': return add(this.ev(e[2], sc), this.ev(e[3], sc), 1);
        case '-': return e.length === 3 ? neg(this.ev(e[2], sc)) : add(this.ev(e[2], sc), this.ev(e[3], sc), -1);
        case 'neg': return neg(this.ev(e[2], sc));
        case '*': return mul(this.ev(e[2], sc), this.ev(e[3], sc), vec);
        case '/': return div(this.ev(e[2], sc), this.ev(e[3], sc), vec);
        case '^': return pow(this.ev(e[2], sc), this.ev(e[3], sc), vec);
        case 'nroot': return nroot(e[2] == null ? null : this.ev(e[2], sc), this.ev(e[3], sc));
        case 'sqrt': return nroot(null, this.ev(e[2], sc));
        case 'abs': {
          const x = this.ev(e[2], sc);
          if (isM(x)) {
            if (vec) return new Mat(x.r, x.c, x.a.map(y => mk(Math.abs(valOf(y)), dimOf(y))));
            if (x.c === 1 || x.r === 1) { let s = 0; for (const y of x.a) s += valOf(y) ** 2; return mk(Math.sqrt(s), dimOf(x.a[0])); }
            return det(x);
          }
          if (typeof x === 'string') return x.length;
          return mk(Math.abs(valOf(x)), dimOf(x));
        }
        case '==': case '!=': case '<': case '>': case '<=': case '>=': return cmp(this.ev(e[2], sc), this.ev(e[3], sc), o);
        case 'and': { const a = this.ev(e[2], sc); if (isM(a)) return ew2(a, this.ev(e[3], sc), (x, y) => (truth(x) && truth(y)) ? 1 : 0); if (!truth(a)) return 0; return truth(this.ev(e[3], sc)) ? 1 : 0; }
        case 'or': { const a = this.ev(e[2], sc); if (isM(a)) return ew2(a, this.ev(e[3], sc), (x, y) => (truth(x) || truth(y)) ? 1 : 0); if (truth(a)) return 1; return truth(this.ev(e[3], sc)) ? 1 : 0; }
        case 'xor': return (truth(this.ev(e[2], sc)) !== truth(this.ev(e[3], sc))) ? 1 : 0;
        case 'not': return truth(this.ev(e[2], sc)) ? 0 : 1;
        case 'idx': {
          const m = this.ev(e[2], sc);
          const i = this.ev(e[3], sc);
          if (e.length > 4) {
            const j = this.ev(e[4], sc);
            if (!isM(m)) err('indexing a non-matrix');
            return idx2(m, i, j);
          }
          if (i instanceof Range || isM(i)) {
            const ids = i instanceof Range ? i.toArray() : i.a;
            return new Mat(ids.length, 1, ids.map(k => idx1(m, k)));
          }
          return idx1(m, i);
        }
        case 'col': { const m = this.ev(e[2], sc); const j = num(this.ev(e[3], sc)) - 1; if (!isM(m)) err('column of a non-matrix'); if (j < 0 || j >= m.c) err('column index out of range'); const out = new Mat(m.r, 1); for (let i = 0; i < m.r; i++) out.a[i] = m.get(i, j); return out; }
        case 'row': { const m = this.ev(e[2], sc); const i = num(this.ev(e[3], sc)) - 1; if (!isM(m)) err('row of a non-matrix'); if (i < 0 || i >= m.r) err('row index out of range'); return new Mat(1, m.c, m.a.slice(i * m.c, i * m.c + m.c)); }
        case 'T': { const m = this.ev(e[2], sc); if (!isM(m)) return m; const out = new Mat(m.c, m.r); for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) out.set(j, i, m.get(i, j)); return out; }
        case '!': { let n = num(this.ev(e[2], sc)), r = 1; while (n > 1) r *= n--; return r; }
        case '%': return mulS(this.ev(e[2], sc), 0.01);
      }
      err('operator ' + o + ' not supported');
    }

    call(e, sc) {
      const fe = e[1], args = e[2];
      if (fe[0] === 'k') {
        if (fe[1] === 'if') {
          const c = this.ev(args[0], sc);
          if (isM(c)) { // vectorized if
            const a = this.ev(args[1], sc), b = this.ev(args[2], sc);
            return new Mat(c.r, c.c, c.a.map((x, i) => truth(x) ? (isM(a) ? a.a[i] : a) : (isM(b) ? b.a[i] : b)));
          }
          return truth(c) ? this.ev(args[1], sc) : this.ev(args[2], sc);
        }
        if (fe[1] === 'root') return this.root(args, sc);
        err('keyword ' + fe[1]);
      }
      let f;
      if (fe[0] === 'v') {
        // user function, else built-in with this name
        try { f = this.lookup(fe[1], sc); } catch (x) { f = BUILTINS[fe[1]]; if (!f) throw x; }
      } else if (fe[0] === 'f') {
        f = BUILTINS[fe[1]];
        if (!f) {
          // user may have defined a function with a built-in-looking label
          f = this.env.get(fe[1]);
          if (!f) err('function ' + fe[1] + ' is not supported');
        }
      } else f = this.ev(fe, sc);
      if (f instanceof Builtin) {
        if (f.lazy) return f.f.call(this, args, sc);
        const av = args.map(a => this.ev(a, sc));
        if (sc && sc.vec === true && f.map) return mapVec(f.f, av);
        return f.f.apply(this, av);
      }
      if (f instanceof Fn) {
        const av = args.map(a => this.ev(a, sc));
        return this.apply(f, av);
      }
      if (isM(f)) err('a matrix is not a function');
      err('value is not a function');
    }
    apply(f, av) {
      if (av.length !== f.params.length) err('wrong number of arguments for ' + (f.name || 'function'));
      const vars = new Map(); f.params.forEach((p, i) => vars.set(p, av[i]));
      if (++this.depth > 2000) { this.depth = 0; err('recursion too deep'); }
      const sc = { parent: { seq: f.seq }, vars };
      try {
        if (Array.isArray(f.body) && f.body[0] === 'P') {
          try { return this.block(f.body[1], sc); } catch (x) { if (x && x.__ret) return x.v; throw x; }
        }
        return this.ev(f.body, sc);
      } finally { this.depth--; }
    }

    root(args, sc) {
      const ex = args[0]; const vname = args[1][1];
      const vars = new Map(); const s2 = { parent: sc, vars, vec: sc ? sc.vec : false };
      const f = x => { vars.set(vname, x); return this.ev(ex, s2); };
      if (args.length >= 4) {
        let a = this.ev(args[2], sc), b = this.ev(args[3], sc);
        const d = dimOf(a);
        let x0 = valOf(a), x1 = valOf(b);
        let f0 = valOf(f(mk(x0, d))), f1 = valOf(f(mk(x1, d)));
        if (f0 === 0) return mk(x0, d); if (f1 === 0) return mk(x1, d);
        if (f0 * f1 > 0) err('root: no sign change in the interval');
        // Brent-like bisection + secant
        for (let it = 0; it < 200; it++) {
          let xm = x0 - f0 * (x1 - x0) / (f1 - f0);
          if (!(xm > Math.min(x0, x1) && xm < Math.max(x0, x1)) || it % 3 === 2) xm = (x0 + x1) / 2;
          const fm = valOf(f(mk(xm, d)));
          if (fm === 0 || Math.abs(x1 - x0) < 1e-12 * (Math.abs(xm) + 1e-300)) return mk(xm, d);
          if (f0 * fm < 0) { x1 = xm; f1 = fm; } else { x0 = xm; f0 = fm; }
          if (Math.abs(fm) < 1e-13 * (Math.abs(f0) + Math.abs(f1) + 1e-300)) return mk(xm, d);
        }
        return mk((x0 + x1) / 2, d);
      }
      // guess form: use current value of variable
      let x = this.lookup(vname, sc); const d = dimOf(x); let xv = valOf(x) || 1;
      let h = Math.abs(xv) * 1e-4 + 1e-8;
      for (let it = 0; it < 100; it++) {
        const fx = valOf(f(mk(xv, d))); const fp = (valOf(f(mk(xv + h, d))) - fx) / h;
        if (!fp) err('root: zero derivative');
        const nx = xv - fx / fp;
        if (Math.abs(nx - xv) < 1e-12 * (Math.abs(nx) + 1)) return mk(nx, d);
        xv = nx;
      }
      err('root did not converge');
    }

    prog(p, sc) {
      const vars = new Map(); const s2 = { parent: sc, vars, vec: sc && sc.vec };
      try { return this.block(p[1], s2); }
      catch (x) { if (x && x.__ret) return x.v; throw x; }
    }
    block(stmts, sc) {
      let last;
      for (let i = 0; i < stmts.length; i++) {
        const s = stmts[i];
        if (s[0] === 'ld' && s[1][0] === 'v') { const v = this.ev(s[2], sc); setLocal(sc, s[1][1], v); last = v; }
        else last = this.stmt(s, sc);
      }
      return last;
    }
    assignLocal(t, v, sc) {
      if (t[0] === 'v') { setLocal(sc, t[1], v); return v; }
      if (t[0] === 'o' && t[1] === 'idx') {
        const name = t[2][1];
        let m = lookupLocal(sc, name);
        const ix = t.slice(3).map(x => this.ev(x, sc));
        if (m instanceof Mat && m.own === sc.vars) {
          const r = num(ix[0], 'index'), c = ix.length > 1 ? num(ix[1], 'index') : 1;
          if (r >= 1 && c >= 1 && r <= m.r && c <= m.c && r === (r | 0) && c === (c | 0)) { m.a[(r - 1) * m.c + c - 1] = v; return v; }
        }
        if (m === undefined) { try { m = this.lookup(name, sc); } catch (x) { m = undefined; } }
        m = assignIdx(m, ix, v);
        m.own = sc.vars;
        setLocal(sc, name, m); return v;
      }
      if (t[0] === 'M') { // multiple assignment [a b] <- vector
        if (!isM(v)) err('right side must be a vector');
        t[3].forEach((x, i) => this.assignLocal(x, v.a[i], sc)); return v;
      }
      err('cannot assign to this target');
    }
    stmt(s, sc) {
      switch (s[0]) {
        case 'ld': return this.assignLocal(s[1], this.ev(s[2], sc), sc);
        case 'ex': return this.ev(s[1], sc);
        case 'blk': return this.ev(s[1], sc);
        case 'ret': { const v = this.ev(s[1], sc); throw { __ret: true, v }; }
        case 'if': {
          if (truth(this.ev(s[1], sc))) return this.block(s[2][1], sc);
          if (s[3]) return this.block(s[3][1], sc);
          return undefined;
        }
        case 'for': {
          const r = this.ev(s[2], sc);
          const items = r instanceof Range ? r.toArray() : isM(r) ? r.a : [r];
          let last;
          for (const it of items) {
            setLocal(sc, s[1], it);
            try { last = this.block(s[3][1], sc); }
            catch (x) { if (x && x.__brk) break; if (x && x.__cnt) continue; throw x; }
          }
          return last;
        }
        case 'wh': {
          let last, n = 0;
          while (truth(this.ev(s[1], sc))) {
            if (++n > 1e6) err('while loop did not end');
            try { last = this.block(s[2][1], sc); }
            catch (x) { if (x && x.__brk) break; if (x && x.__cnt) continue; throw x; }
          }
          return last;
        }
        case 'brk': throw { __brk: true };
        case 'cnt': throw { __cnt: true };
        case 'try': {
          try { return this.ev(s[1], sc); }
          catch (x) { if (x && (x.__ret || x.__brk || x.__cnt)) throw x; return this.ev(s[2], sc); }
        }
      }
      err('unsupported program line ' + s[0]);
    }

    /* top-level definition */
    define(t, rhs, sc) {
      if (t[0] === 'v') { this.env.def(t[1], rhs); return; }
      if (t[0] === 'fn') return;
      if (t[0] === 'o' && t[1] === 'idx') {
        const name = t[2][1];
        let m = this.env.get(name);
        const ix = t.slice(3).map(x => this.ev(x, sc));
        m = assignIdx(m, ix, rhs);
        this.env.def(name, m); return;
      }
      if (t[0] === 'M') { if (!isM(rhs)) err('right side must be a vector'); t[3].forEach((x, i) => this.define(x, rhs.a[i], sc)); return; }
      err('cannot define this target');
    }
  }
  function isVec(sc) { for (let s = sc; s; s = s.parent) if (s.vec) return true; return false; }
  function lookupLocal(sc, n) { for (let s = sc; s; s = s.parent) { if (s.vars && s.vars.has(n)) return s.vars.get(n); if (s.seq != null) return undefined; } return undefined; }
  function setLocal(sc, n, v) {
    for (let s = sc; s; s = s.parent) { if (s.vars && s.vars.has(n)) { s.vars.set(n, v); return; } if (s.seq != null) break; }
    sc.vars.set(n, v);
  }
  function idx1(m, i) {
    const k = (typeof i === 'number' ? i : num(i, 'index')) - 1;
    if (m instanceof Mat && (m.c === 1 || m.r === 1) && k >= 0 && k < m.a.length && k === (k | 0)) return m.a[k];
    if (typeof m === 'string') err('cannot index a string');
    if (!isM(m)) { if (k === 0) return m; err('indexing a non-matrix'); }
    if (m.c !== 1 && m.r !== 1) err('use two indices for a matrix');
    if (k < 0 || k >= m.a.length || k !== Math.floor(k)) err('index out of range');
    return m.a[k];
  }
  function idx2(m, i, j) {
    const a = num(i, 'index') - 1, b = num(j, 'index') - 1;
    if (a < 0 || a >= m.r || b < 0 || b >= m.c) err('index out of range');
    return m.get(a, b);
  }
  function assignIdx(m, ix, v) {
    const r = num(ix[0], 'index'), c = ix.length > 1 ? num(ix[1], 'index') : 1;
    if (r < 1 || c < 1 || r > 1e6 || c > 1e5) err('index out of range');
    if (!isM(m)) { const n = new Mat(r, c); if (m !== undefined && typeof m === 'number' && false) n.a[0] = m; m = n; }
    else m = new Mat(m.r, m.c, m.a.slice());
    if (r > m.r || c > m.c) {
      const n = new Mat(Math.max(r, m.r), Math.max(c, m.c));
      for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) n.set(i, j, m.get(i, j));
      m = n;
    }
    m.set(r - 1, c - 1, v);
    return m;
  }
  function flattenNested(m) { return m; }
  function det(M) {
    const n = M.r; const a = M.a.map(valOf); let d = 1;
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r;
      if (!a[p * n + c]) return 0;
      if (p !== c) { for (let k = 0; k < n; k++) [a[c * n + k], a[p * n + k]] = [a[p * n + k], a[c * n + k]]; d = -d; }
      d *= a[c * n + c];
      for (let r = c + 1; r < n; r++) { const f = a[r * n + c] / a[c * n + c]; for (let k = c; k < n; k++) a[r * n + k] -= f * a[c * n + k]; }
    }
    return d;
  }
  function mapVec(f, av) {
    const m = av.find(isM);
    if (!m) return f(...av);
    return new Mat(m.r, m.c, m.a.map((_, i) => f(...av.map(x => isM(x) ? x.a[i] : x))));
  }

  /* ---------- built-in functions ---------- */
  const flat = args => { const out = []; for (const a of args) { if (isM(a)) out.push(...a.a); else out.push(a); } return out; };
  function extreme(args, s) {
    const xs = flat(args); if (!xs.length) err('max/min of nothing');
    let best = xs[0];
    for (const x of xs.slice(1)) {
      if (typeof x === 'string' || typeof best === 'string') { if ((s > 0) ? x > best : x < best) best = x; continue; }
      if (!sameD(dimOf(x), dimOf(best)) && valOf(x) !== 0 && valOf(best) !== 0) err('units do not match in max/min');
      if (Number.isNaN(valOf(x))) continue;
      if (s > 0 ? valOf(x) > valOf(best) : valOf(x) < valOf(best)) best = x;
    }
    return best;
  }
  const ang = f => new Builtin(x => f(num(x, 'angle')));
  const ang1 = f => { const b = new Builtin(x => f(num(x, 'argument'))); b.map = true; return b; };
  function fmtStr(x) {
    if (typeof x === 'string') return x;
    if (x instanceof Q) err('num2str: value must be unitless');
    if (typeof x !== 'number') err('num2str needs a number');
    if (Number.isInteger(x)) return String(x);
    return String(+x.toPrecision(15)).replace(/e\+?/, 'e');
  }
  function roundTo(x, n) {
    const k = Math.pow(10, n || 0);
    const r = v => Math.sign(v) * Math.round(Math.abs(v) * k + 1e-9) / k;
    if (isM(x)) return new Mat(x.r, x.c, x.a.map(y => roundTo(y, n)));
    if (x instanceof Q) err('round: value must be unitless (divide by a unit first)');
    return r(num(x));
  }
  function stepRound(x, y, f) {
    if (isM(x)) return new Mat(x.r, x.c, x.a.map(v => stepRound(v, y, f)));
    if (!sameD(dimOf(x), dimOf(y))) err('units do not match');
    const yv = valOf(y); if (!yv) err('step is zero');
    const q = valOf(x) / yv; const n = f(q + (f === Math.floor ? 1e-9 : -1e-9));
    return mk(n * yv, dimOf(x));
  }
  const vecOf = x => (isM(x) ? x.a : [x]);
  function linterp(vx, vy, x) {
    if (isM(x)) return new Mat(x.r, x.c, x.a.map(t => linterp(vx, vy, t)));
    const X = vecOf(vx), Y = vecOf(vy); const n = X.length;
    if (n !== Y.length) err('linterp: vectors must have the same length');
    const xv = valOf(x), dY = dimOf(Y[0]);
    if (!sameD(dimOf(x), dimOf(X[0]))) err('linterp: units of x do not match');
    let i = 0;
    if (xv <= valOf(X[0])) i = 0; else if (xv >= valOf(X[n - 1])) i = n - 2; else { while (i < n - 2 && valOf(X[i + 1]) < xv) i++; }
    const x0 = valOf(X[i]), x1 = valOf(X[i + 1]); const y0 = valOf(Y[i]), y1 = valOf(Y[i + 1]);
    return mk(y0 + (y1 - y0) * (xv - x0) / (x1 - x0), dY);
  }
  function augment(...ms) {
    ms = ms.map(m => isM(m) ? m : new Mat(1, 1, [m]));
    const r = ms[0].r; if (ms.some(m => m.r !== r)) err('augment: row counts differ');
    const c = ms.reduce((s, m) => s + m.c, 0); const out = new Mat(r, c);
    let off = 0; for (const m of ms) { for (let i = 0; i < r; i++) for (let j = 0; j < m.c; j++) out.set(i, off + j, m.get(i, j)); off += m.c; }
    return out;
  }
  function stack(...ms) {
    ms = ms.map(m => isM(m) ? m : new Mat(1, 1, [m]));
    const c = ms[0].c; if (ms.some(m => m.c !== c)) err('stack: column counts differ');
    return new Mat(ms.reduce((s, m) => s + m.r, 0), c, [].concat(...ms.map(m => m.a)));
  }
  function regress(vx, vy) {
    const X = vecOf(vx).map(valOf), Y = vecOf(vy).map(valOf); const n = X.length;
    const mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
    const b = sxy / sxx; return { b, a: my - b * mx, dx: dimOf(vecOf(vx)[0]), dy: dimOf(vecOf(vy)[0]) };
  }
  const BUILTINS = {
    max: new Builtin((...a) => (a.length === 2 && typeof a[0] === 'number' && typeof a[1] === 'number') ? (a[0] >= a[1] || a[1] !== a[1] ? a[0] : a[1]) : extreme(a, 1)),
    min: new Builtin((...a) => (a.length === 2 && typeof a[0] === 'number' && typeof a[1] === 'number') ? (a[0] <= a[1] || a[1] !== a[1] ? a[0] : a[1]) : extreme(a, -1)),
    sin: ang1(Math.sin), cos: ang1(Math.cos), tan: ang1(Math.tan), cot: ang1(x => 1 / Math.tan(x)),
    sec: ang1(x => 1 / Math.cos(x)), csc: ang1(x => 1 / Math.sin(x)),
    asin: ang1(Math.asin), acos: ang1(Math.acos), atan: ang1(Math.atan), sinh: ang1(Math.sinh), cosh: ang1(Math.cosh), tanh: ang1(Math.tanh),
    exp: ang1(Math.exp), ln: ang1(x => { if (x <= 0) err('ln of a non-positive number'); return Math.log(x); }),
    log: new Builtin((x, b) => { const v = num(x); if (v <= 0) err('log of a non-positive number'); return b == null ? Math.log10(v) : Math.log(v) / Math.log(num(b)); }),
    atan2: new Builtin((x, y) => Math.atan2(valOf(y), valOf(x))), angle: new Builtin((x, y) => { let a = Math.atan2(valOf(y), valOf(x)); if (a < 0) a += 2 * Math.PI; return a; }),
    sqrt: new Builtin(x => nroot(null, x)),
    abs: new Builtin(x => mk(Math.abs(valOf(x)), dimOf(x))),
    floor: new Builtin(x => isM(x) ? new Mat(x.r, x.c, x.a.map(v => Math.floor(num(v) + 1e-12))) : Math.floor(num(x) + 1e-12)),
    ceil: new Builtin(x => isM(x) ? new Mat(x.r, x.c, x.a.map(v => Math.ceil(num(v) - 1e-12))) : Math.ceil(num(x) - 1e-12)),
    trunc: new Builtin(x => Math.trunc(num(x))),
    round: new Builtin((x, n) => roundTo(x, n == null ? 0 : num(n))),
    Floor: new Builtin((x, y) => stepRound(x, y, Math.floor)), Ceil: new Builtin((x, y) => stepRound(x, y, Math.ceil)),
    Round: new Builtin((x, y) => stepRound(x, y, Math.round)), Trunc: new Builtin((x, y) => stepRound(x, y, Math.trunc)),
    mod: new Builtin((x, y) => { if (!sameD(dimOf(x), dimOf(y))) err('mod: units differ'); const a = valOf(x), b = valOf(y); return mk(a - b * Math.floor(a / b + 1e-12), dimOf(x)); }),
    sign: new Builtin(x => Math.sign(valOf(x))), signum: new Builtin(x => Math.sign(valOf(x))),
    num2str: new Builtin(x => fmtStr(x)), str2num: new Builtin(s => +s),
    concat: new Builtin((...a) => a.map(x => { if (typeof x !== 'string') err('concat: arguments must be strings'); return x; }).join('')),
    strlen: new Builtin(s => String(s).length), substr: new Builtin((s, a, n) => String(s).substr(num(a), num(n))),
    rows: new Builtin(m => isM(m) ? m.r : 1), cols: new Builtin(m => isM(m) ? m.c : 1),
    last: new Builtin(m => isM(m) ? m.a.length : 1), length: new Builtin(m => isM(m) ? m.a.length : 1),
    augment: new Builtin(augment), stack: new Builtin(stack),
    submatrix: new Builtin((m, ir, jr, ic, jc) => {
      const a = num(ir) - 1, b = num(jr) - 1, c = num(ic) - 1, d = num(jc) - 1;
      if (a < 0 || b >= m.r || c < 0 || d >= m.c || a > b || c > d) err('submatrix: indices out of range');
      const out = new Mat(b - a + 1, d - c + 1); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) out.set(i - a, j - c, m.get(i, j)); return out;
    }),
    linterp: new Builtin(linterp),
    match: new Builtin((z, A) => {
      const out = []; const m = isM(A) ? A : new Mat(1, 1, [A]);
      for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) {
        const x = m.get(i, j);
        const eq = (typeof z === 'string' || typeof x === 'string') ? z === x : (sameD(dimOf(z), dimOf(x)) && Math.abs(valOf(z) - valOf(x)) <= 1e-12 * Math.max(1, Math.abs(valOf(z))));
        if (eq) out.push(m.c === 1 ? [i + 1] : [i + 1, j + 1]);
      }
      if (!out.length) err('match: value not found');
      if (m.c === 1) return new Mat(out.length, 1, out.map(x => x[0]));
      return new Mat(out.length, 1, out.map(x => new Mat(2, 1, x)));
    }),
    lookup: new Builtin((z, A, B) => {
      const a = vecOf(A), b = vecOf(B); const out = [];
      a.forEach((x, i) => { if ((typeof z === 'string') ? z === x : Math.abs(valOf(z) - valOf(x)) < 1e-12) out.push(b[i]); });
      if (!out.length) err('lookup: value not found');
      return new Mat(out.length, 1, out);
    }),
    mean: new Builtin((...a) => { const xs = flat(a); let s = 0; for (const x of xs) s = add(s, x, 1); return divS(s, xs.length); }),
    sum: new Builtin(m => { let s = 0; for (const x of vecOf(m)) s = add(s, x, 1); return s; }),
    slope: new Builtin((vx, vy) => { const r = regress(vx, vy); return mk(r.b, addD(r.dy, r.dx, -1)); }),
    intercept: new Builtin((vx, vy) => { const r = regress(vx, vy); return mk(r.a, r.dy); }),
    lsolve: new Builtin(lsolve),
    IsNaN: new Builtin(x => Number.isNaN(valOf(x)) ? 1 : 0), isNaN: new Builtin(x => Number.isNaN(valOf(x)) ? 1 : 0),
    IsString: new Builtin(x => typeof x === 'string' ? 1 : 0), IsArray: new Builtin(x => isM(x) ? 1 : 0), IsScalar: new Builtin(x => scalarOK(x) ? 1 : 0),
    identity: new Builtin(n => { n = num(n); const m = new Mat(n, n); for (let i = 0; i < n; i++) m.set(i, i, 1); return m; }),
    matrix: new Builtin((r, c, f) => { r = num(r); c = num(c); const m = new Mat(r, c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) m.set(i, j, f instanceof Fn ? this.apply(f, [i + 1, j + 1]) : 0); return m; }),
    transpose: new Builtin(m => { if (!isM(m)) return m; const o = new Mat(m.c, m.r); for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) o.set(j, i, m.get(i, j)); return o; }),
    sort: new Builtin(v => new Mat(v.r, 1, v.a.slice().sort((x, y) => valOf(x) - valOf(y)))),
    reverse: new Builtin(v => new Mat(v.r, v.c, v.a.slice().reverse())),
    csort: new Builtin((m, j) => { j = num(j) - 1; const rows = []; for (let i = 0; i < m.r; i++) rows.push(m.a.slice(i * m.c, i * m.c + m.c)); rows.sort((a, b) => valOf(a[j]) - valOf(b[j])); return new Mat(m.r, m.c, [].concat(...rows)); }),
    READEXCEL: new Builtin(name => {
      const t = CUR && CUR.xl && CUR.xl[name];
      if (!t) err('READEXCEL: the Excel file "' + name + '" is not available in the browser');
      const c = Math.max(...t.map(r => r.length));
      return new Mat(t.length, c, [].concat(...t.map(r => Array.from({ length: c }, (_, j) => (r[j] === undefined || r[j] === null ? NaN : r[j])))));
    }),
    error: new Builtin(s => err(String(s))),
  };
  // functions that need the evaluator (`this`)
  BUILTINS.matrix = new Builtin(function (r, c, f) { r = num(r); c = num(c); const m = new Mat(r, c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) m.set(i, j, f instanceof Fn ? this.apply(f, [i + 1, j + 1]) : 0); return m; });

  /* ---------- run a whole sheet ---------- */
  function sortRegions(regs) {
    return regs.slice().sort((a, b) => (Math.abs(a.y - b.y) < 0.5 ? a.x - b.x : a.y - b.y));
  }
  function overrideValue(sheet, ov) {
    // ov: {t:'num', v, u:'unit expr string as AST'} etc. returns value
    return ov;
  }

  /**
   * Run a worksheet.
   * @param {object} doc  converted worksheet JSON
   * @param {object} inputs  name -> override AST (replaces the right-hand side of yellow input definitions)
   * @returns {{sheet: Sheet, out: Array}} out = flat list of {reg, val, err} in evaluation order
   */
  function run(doc, inputs) {
    const S = new Sheet(); S.depth = 0; CUR = S; S.xl = inputs && inputs.__xl ? Object.assign({}, doc.xl, inputs.__xl) : doc.xl || null;   // __xl: element's own tables (ETABS link)
    const out = [];
    const walk = regs => {
      for (const r of sortRegions(regs)) {
        if (r.k === 'a' || r.k === 'st') { walk(r.r); continue; }
        if (r.k !== 'm') { out.push({ reg: r, seq: S.env.seq }); continue; }
        const rec = { reg: r, seq: S.env.seq };
        out.push(rec);
        const e = r.e;
        try {
          S.steps = 0;
          if (e[0] === 'def') {
            const t = e[1]; let rhs = e[2];
            if (t[0] === 'fn') {
              const body = rhs[0] === 'ev' ? rhs[1] : rhs;
              S.env.def(t[1], new Fn(t[2], body, S.env.seq + 1, t[1]));
              rec.fn = true;
              continue;
            }
            const name = t[0] === 'v' ? t[1] : null;
            let src = rhs[0] === 'ev' ? rhs[1] : rhs;
            if (name && inputs && Object.prototype.hasOwnProperty.call(inputs, name)) {
              const ov = inputs[name];
              if (src && src[0] === 'cb') { const k = typeof ov === 'number' ? ov : 0; src = ['cb', src[1], src[2], Math.max(0, Math.min(src[2].length - 1, k)), src[4]]; rec.sel = src[3]; }
              else { src = ov; }
              rec.ov = true;
            }
            let rgv = []; // x[i] := f(i) / x[i,j] := f(i,j) over range variables: evaluate once per element
            if (t[0] === 'o' && t[1] === 'idx') for (const ix of t.slice(3)) { if (ix[0] !== 'v') continue; const q = S.env.get(ix[1]); if (q instanceof Range) rgv.push([ix[1], q]); }
            let v;
            if (rgv.length) {
              const loop = d => {
                if (d === rgv.length) { v = S.ev(src, null); S.define(t, v, null); return; }
                for (const k of rgv[d][1].toArray()) { S.env.def(rgv[d][0], k); loop(d + 1); }
              };
              loop(0);
              rgv.slice().reverse().forEach(g => S.env.def(g[0], g[1]));
              v = S.env.get(t[2][1]);
            } else {
              v = S.ev(src, null);
              S.define(t, v, null);
            }
            rec.val = v; rec.name = name;
            if (rhs[0] === 'ev') rec.unit = rhs[2];
          } else if (e[0] === 'ev') {
            rec.val = S.ev(e[1], null); rec.unit = e[2];
          } else {
            rec.val = S.ev(e, null);
          }
        } catch (x) {
          if (x && x.__ret) { rec.val = x.v; continue; }
          rec.err = (x && x.message) || String(x);
          if (!(x instanceof MErr)) rec.bug = true;
          // keep name defined as error so dependants report clearly
          if (e[0] === 'def' && e[1][0] === 'v') S.env.def(e[1][1], new ErrVal(e[1][1]));
        }
      }
    };
    walk(doc.regions);
    return { sheet: S, out };
  }
  class ErrVal { constructor(n) { this.n = n; } }
  // looking up an ErrVal should raise
  const _lookup = Sheet.prototype.lookup;
  Sheet.prototype.lookup = function (n, sc) { const v = _lookup.call(this, n, sc); if (v instanceof ErrVal) err('“' + n + '” has an error above'); return v; };

  /* ---------- display helpers ---------- */
  function unitScale(S, uAst) {
    // returns {k: factor, d: dims}
    const v = S.ev(uAst, null);
    return { k: valOf(v), d: dimOf(v) };
  }
  function display(S, v, uAst) {
    // -> {num: string|matrix, unitAst|unitStr}
    if (typeof v === 'string') return { s: v };
    if (v instanceof Fn || v instanceof Builtin) return { s: 'f(…)' };
    if (v instanceof Range) return { s: fmtNum(valOf(v.a)) + '..' + fmtNum(valOf(v.b)) };
    if (isM(v)) return { m: v, rows: v.r, cols: v.c, cells: v.a.map(x => display(S, x, uAst)) };
    if (uAst) {
      try {
        const u = unitScale(S, uAst);
        if (sameD(u.d, dimOf(v))) return { n: valOf(v) / u.k, uAst };
      } catch (x) { /* fall through */ }
    }
    const d = dimOf(v);
    return { n: valOf(v), us: sameD(d, D0) ? '' : dimStr(d) };
  }

  EC.mcad = { run, Q, Mat, Fn, Range, isQ, isM, valOf, dimOf, mk, fmtNum, dimStr, display, unitQ, U, MErr, BUILTINS };
})(typeof window !== 'undefined' ? window : globalThis);
