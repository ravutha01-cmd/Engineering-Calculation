/* CAMBO STRUCT web - shared calculation engine
   Units: kN, m, mm, MPa. Concrete to EN 1992-1-1:2023 unless a line says otherwise.
   Values marked [NDP] are Nationally Determined Parameters (recommended values);
   values marked [verify] should be checked against your copy of the code. */
window.EC = window.EC || {};
EC.modules = EC.modules || {};

/* ---------- number / text helpers ---------- */
EC.fmt = function (v, dp) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (dp === undefined) {
    const a = Math.abs(v);
    dp = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 2 : a === 0 ? 0 : 3;
  }
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
EC.esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* "f_cd" -> f<sub>cd</sub>, "x^2" -> x<sup>2</sup> */
EC.sym = function (s) {
  if (s === undefined || s === null) return '';
  return EC.esc(s)
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/([A-Za-zα-ωΑ-Ωϕφθ'])_([A-Za-z0-9;,.Ͱ-Ͽ]+)/g, '$1<sub>$2</sub>')
    .replace(/\^\(([^)]+)\)/g, '<sup>$1</sup>')
    .replace(/\^([-0-9./]+)/g, '<sup>$1</sup>');
};
EC.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
EC.barA = d => Math.PI * d * d / 4;              // mm²
EC.kgm = d => d * d / 162.2;                     // kg/m of a bar
EC.BARS = [6, 8, 10, 12, 16, 20, 25, 32, 40];
EC.CONC = [20, 25, 30, 35, 40, 45, 50].map(f => ({ v: f, l: `C${f}/${{ 20: 25, 25: 30, 30: 37, 35: 45, 40: 50, 45: 55, 50: 60 }[f]}` }));
EC.EXPO = ['X0', 'XC1', 'XC2', 'XC3', 'XC4', 'XD1', 'XD2', 'XD3', 'XS1', 'XS2', 'XS3'].map(v => ({ v, l: v }));
EC.F = (k, l, u, d, opts, help) => ({ k, l, u, d, opts, help });
EC.barOpts = EC.BARS.map(v => ({ v, l: 'ϕ' + v }));
EC.concName = fck => (EC.CONC.find(c => c.v === +fck) || { l: 'C' + fck }).l;

/* ---------- materials ---------- */
EC.mat = function (fck, fyk, Dl) {
  fck = +fck; fyk = +fyk || 500; Dl = Dl === undefined ? 16 : +Dl;
  const gC = 1.5, gS = 1.15, gV = 1.4, ktc = 1.0;
  const fcm = fck + 8;
  const fctm = fck <= 50 ? 0.3 * Math.pow(fck, 2 / 3) : 1.1 * Math.pow(fck, 1 / 3);
  const Ecm = 9500 * Math.pow(fcm, 1 / 3);
  const etacc = Math.min(1, Math.pow(40 / fck, 1 / 3));
  const fcd = etacc * ktc * fck / gC;
  const fyd = fyk / gS;
  const ddg = Math.min(40, 16 + Dl);
  return { fck, fyk, fcm, fctm, Ecm, etacc, ktc, fcd, fyd, gC, gS, gV, Es: 200000, eyd: fyd / 200000, ddg, Dl };
};

/* ---------- calculation report builder ---------- */
EC.Calc = class {
  constructor() { this.out = []; this.summary = []; this.n1 = 0; this.n2 = 0; this.warn = []; }
  h1(t) { this.n1++; this.n2 = 0; this.out.push({ k: 'h1', t: `${this.n1}. ${t}` }); }
  h2(t) { this.n2++; this.out.push({ k: 'h2', t: `${this.n1}.${this.n2} ${t}` }); }
  text(t) { this.out.push({ k: 'text', t }); }
  note(t) { this.out.push({ k: 'note', t }); }
  /* value line: {l:label, s:symbol, f:formula, n:substitution, v:value, u:unit, r:clause, key:bool, dp} */
  v(o) { this.out.push(Object.assign({ k: 'v' }, o)); return o.v; }
  inp(l, s, v, u, r) { this.out.push({ k: 'v', l, s, v, u, r, inp: true }); return v; }
  /* utilisation check E_d <= R_d */
  chk(o) {
    const U = o.Rd > 0 ? Math.abs(o.Ed) / o.Rd : (Math.abs(o.Ed) > 0 ? Infinity : 0);
    const ok = U <= 1.0 + 1e-6;
    this.out.push(Object.assign({ k: 'chk', U, ok }, o));
    if (o.item !== false) this.summary.push({ item: o.item || o.l, U, ok, r: o.r });
    return U;
  }
  /* pass / fail check with text */
  ok(o) {
    const ok = !!o.cond;
    this.out.push(Object.assign({ k: 'ok', ok }, o));
    if (o.item !== false) this.summary.push({ item: o.item || o.l, U: o.U === undefined ? null : o.U, ok, r: o.r });
    return ok;
  }
  result(extra) {
    const Us = this.summary.map(s => s.U).filter(u => u !== null && Number.isFinite(u));
    const Umax = Us.length ? Math.max(...Us) : 0;
    const allOk = this.summary.every(s => s.ok);
    return Object.assign({ report: this.out, summary: this.summary, Umax, ok: allOk }, extra || {});
  }
};

/* ---------- shared EC2 design routines ---------- */

/* Rectangular section in bending, rectangular stress block λ = 0.8, η = 1 (EN 1992-1-1:2023 8.1.2) */
EC.bending = function (c, o) {
  const { M, b, d, As, m } = o;
  const tag = o.tag ? ';' + o.tag : '';
  const Mn = Math.max(Math.abs(M), 1e-3) * 1e6;
  const mu = o.mu || 'kNm';
  c.v({ l: 'Design moment', s: `M_Ed${tag}`, v: Math.abs(M), u: mu });
  const disc = d * d - 2 * Mn / (m.fcd * b);
  let ok = true, AsReq;
  if (disc < 0) {
    c.ok({ l: 'Compression zone', cond: false, txt: 'Concrete compression capacity exceeded - increase section depth / width', r: '8.1.2', item: `Bending${tag} - section size` });
    AsReq = Infinity; ok = false;
  } else {
    const y = d - Math.sqrt(disc);
    c.v({ l: 'Depth of stress block', s: 'y = λx', f: 'd − √(d² − 2 M_Ed/(f_cd b))', n: `${EC.fmt(d)} − √(${EC.fmt(d)}² − 2·${EC.fmt(Mn / 1e6)}·10⁶/(${EC.fmt(m.fcd)}·${EC.fmt(b)}))`, v: y, u: 'mm', r: '8.1.2 (λ = 0.8)' });
    const x = y / 0.8;
    c.chk({ l: 'Neutral axis depth (ductility)', s: 'η', Ed: x / d, Rd: 0.45, u: '', f: 'x/d ≤ 0.45', r: '[practice] 7.3 linear analysis', item: `Bending${tag} - ductility x/d` });
    AsReq = m.fcd * b * y / m.fyd;
    c.v({ l: 'Required tension steel', s: `A_s;req${tag}`, f: 'f_cd b y / f_yd', n: `${EC.fmt(m.fcd)}·${EC.fmt(b)}·${EC.fmt(y)}/${EC.fmt(m.fyd)}`, v: AsReq, u: o.au || 'mm²', key: true });
  }
  c.v({ l: 'Provided tension steel', s: `A_s;prov${tag}`, v: As, u: o.au || 'mm²', n: o.barTxt });
  const yp = As * m.fyd / (m.fcd * b);
  const MRd = As * m.fyd * (d - yp / 2) / 1e6;
  c.v({ l: 'Moment resistance', s: `M_Rd${tag}`, f: 'A_s f_yd (d − y_p/2),  y_p = A_s f_yd/(f_cd b)', n: `y_p = ${EC.fmt(yp)} mm`, v: MRd, u: mu, key: true });
  c.chk({ l: 'Bending resistance', s: `η_M${tag}`, Ed: Math.abs(M), Rd: MRd, u: mu, r: '8.1', item: o.item || `Bending${tag}` });
  return { AsReq, MRd, yp, ok };
};

/* Shear resistance without shear reinforcement, EN 1992-1-1:2023 8.2.2 */
EC.tauRdc = function (m, rho, d) {
  const t = 0.66 / m.gV * Math.pow(100 * rho * m.fck * m.ddg / d, 1 / 3);
  const tmin = 11 / m.gV * Math.sqrt(m.fck / m.fyd * m.ddg / d);
  return { t: Math.max(t, tmin), t0: t, tmin };
};
EC.shearNoLinks = function (c, o) {
  const { V, b, d, As, m } = o;
  const z = 0.9 * d;
  const tauEd = Math.abs(V) * 1e3 / (b * z) * (o.beta || 1);
  c.v({ l: 'Shear stress', s: 'τ_Ed', f: (o.beta ? 'β ' : '') + 'V_Ed/(b z),  z = 0.9 d', n: `${o.beta ? EC.fmt(o.beta) + '·' : ''}${EC.fmt(Math.abs(V))}·10³/(${EC.fmt(b)}·${EC.fmt(z)})`, v: tauEd, u: 'MPa', r: '8.2.1' });
  const rho = Math.min(As / (b * d), 0.02);
  c.v({ l: 'Longitudinal reinforcement ratio', s: 'ρ_l', f: 'A_sl/(b d)', v: rho, u: '', dp: 4 });
  const T = EC.tauRdc(m, rho, d);
  c.v({ l: 'Minimum shear strength', s: 'τ_Rd;c;min', f: '11/γ_V √(f_ck/f_yd · d_dg/d)', v: T.tmin, u: 'MPa', r: '8.2.2' });
  c.v({ l: 'Shear strength without links', s: 'τ_Rd;c', f: '0.66/γ_V (100 ρ_l f_ck d_dg/d)^(1/3) ≥ τ_Rd;c;min', n: `0.66/1.4·(100·${EC.fmt(rho, 4)}·${m.fck}·${m.ddg}/${EC.fmt(d)})^(1/3)`, v: T.t, u: 'MPa', r: '8.2.2', key: true });
  return { tauEd, tauRdc: T.t, rho, z };
};

/* Shear with links (vertical), variable strut inclination, 2023 8.2.3 */
EC.shearLinks = function (c, o) {
  const { V, b, d, As, m, Asw, s, fywk } = o;
  const r = EC.shearNoLinks(c, { V, b, d, As, m });
  const fywd = (fywk || m.fyk) / m.gS;
  const nu = 0.5;
  const rhow = Asw / (b * s);
  const rhowMin = 0.08 * Math.sqrt(m.fck) / (fywk || m.fyk);
  c.v({ l: 'Link ratio', s: 'ρ_w', f: 'A_sw/(b s)', n: `${EC.fmt(Asw)}/(${EC.fmt(b)}·${EC.fmt(s)})`, v: rhow, u: '', dp: 5 });
  c.chk({ l: 'Minimum links', s: 'ρ_w;min', Ed: rhowMin, Rd: rhow, f: '0.08 √f_ck / f_yk ≤ ρ_w', u: '', dp: 5, r: '12.2 [NDP]', item: 'Shear - minimum links' });
  const smax = 0.75 * d;
  c.chk({ l: 'Link spacing', s: 's_l;max', Ed: s, Rd: smax, f: 's ≤ 0.75 d', u: 'mm', r: '12.2 [NDP]', item: 'Shear - link spacing' });
  let tauRd, cot = 2.5, mode;
  if (r.tauEd <= r.tauRdc) {
    mode = 'concrete';
    c.note('τ_Ed ≤ τ_Rd,c: no calculated shear reinforcement needed - minimum links govern.');
  }
  const a = r.tauEd / (nu * m.fcd);
  if (a > 0.5) {
    c.ok({ l: 'Concrete strut crushing', cond: false, txt: `τ_Ed > ν f_cd/2 = ${EC.fmt(nu * m.fcd / 2)} MPa - increase section`, r: '8.2.3', item: 'Shear - strut crushing' });
    return Object.assign(r, { tauRd: nu * m.fcd / 2, cot: 1, rhow });
  }
  const cotLim = (1 + Math.sqrt(1 - 4 * a * a)) / (2 * a);
  cot = Math.min(2.5, cotLim);
  c.v({ l: 'Strut inclination (largest allowed)', s: 'cot θ', f: 'min(2.5, cot θ for τ_Rd;max = τ_Ed)', v: cot, u: '', r: '8.2.3 [NDP]' });
  const tauRds = rhow * fywd * cot;
  const tauRdmax = nu * m.fcd * cot / (1 + cot * cot);
  c.v({ l: 'Resistance of links', s: 'τ_Rd;s', f: 'ρ_w f_ywd cot θ', n: `${EC.fmt(rhow, 5)}·${EC.fmt(fywd)}·${EC.fmt(cot)}`, v: tauRds, u: 'MPa', r: '8.2.3' });
  c.v({ l: 'Strut resistance', s: 'τ_Rd;max', f: 'ν f_cd cot θ/(1 + cot²θ),  ν = 0.5', v: tauRdmax, u: 'MPa', r: '8.2.3' });
  tauRd = mode === 'concrete' ? Math.max(r.tauRdc, Math.min(tauRds, tauRdmax)) : Math.min(tauRds, tauRdmax);
  c.v({ l: 'Shear resistance', s: 'τ_Rd', v: tauRd, u: 'MPa', key: true, f: mode === 'concrete' ? 'max(τ_Rd;c, min(τ_Rd;s, τ_Rd;max))' : 'min(τ_Rd;s, τ_Rd;max)' });
  c.chk({ l: 'Shear resistance', s: 'η_V', Ed: r.tauEd, Rd: tauRd, u: 'MPa', r: '8.2', item: 'Shear' });
  return Object.assign(r, { tauRd, cot, rhow, fywd });
};

/* Anchorage length EN 1992-1-1:2023 11.4.2 (11.3) */
EC.anchorage = function (c, o) {
  const { phi, m, sigma, cd, poor } = o;
  const klb = 50, ns = 1.5, kcp = poor ? 1.2 : 1.0;
  const cdl = EC.clamp(cd, phi, 3.75 * phi);
  const lbd = Math.max(10 * phi, klb * kcp * phi * Math.pow(Math.max(sigma, 1) / 435, ns) * Math.sqrt(25 / Math.min(m.fck, 60)) * Math.pow(phi / 20, 1 / 3) * Math.sqrt(1.5 * phi / cdl));
  c.v({ l: `Design anchorage length ϕ${phi}` + (o.what ? ' – ' + o.what : ''), s: 'l_bd', f: 'k_lb k_cp ϕ (σ_sd/435)^1.5 (25/f_ck)^0.5 (ϕ/20)^(1/3) (1.5ϕ/c_d)^0.5 ≥ 10ϕ',
    n: `50·${kcp}·${phi}·(${EC.fmt(sigma)}/435)^1.5·(25/${m.fck})^0.5·(${phi}/20)^(1/3)·(1.5·${phi}/${EC.fmt(cdl)})^0.5`, v: lbd, u: 'mm', r: '11.4.2 (11.3) [NDP: k_lb = 50, n_σ = 1.5] [verify]', key: true });
  return Math.ceil(lbd / 10) * 10;
};

/* Max bar spacing for crack control w_k = 0.3 mm (EN 1992-1-1:2004 Table 7.3N, informative) */
EC.maxSpacing = function (sigma) {
  const T = [[160, 300], [200, 250], [240, 200], [280, 150], [320, 100], [360, 50]];
  if (sigma <= 160) return 300;
  if (sigma >= 360) return 50;
  for (let i = 1; i < T.length; i++) if (sigma <= T[i][0]) {
    const [s0, v0] = T[i - 1], [s1, v1] = T[i];
    return v0 + (v1 - v0) * (sigma - s0) / (s1 - s0);
  }
  return 50;
};
EC.crackSpacing = function (c, o) {
  const { m, AsReq, AsProv, psi, spacing, wlim } = o;
  const sig = m.fyk / m.gS * psi * Math.min(1, AsReq / Math.max(AsProv, 1));
  c.v({ l: 'Steel stress, quasi-permanent load (approx.)', s: 'σ_s', f: 'f_yd · (M_qp/M_Ed) · A_s;req/A_s;prov', n: `${EC.fmt(m.fyd)}·${EC.fmt(psi)}·${EC.fmt(AsReq)}/${EC.fmt(AsProv)}`, v: sig, u: 'MPa' });
  const smax = EC.maxSpacing(sig);
  c.chk({ l: 'Bar spacing for crack control (w_k = 0.3 mm)', s: 's_max', Ed: spacing, Rd: smax, u: 'mm', r: 'EN 1992-1-1:2004 Table 7.3N (informative)', item: 'Crack control - bar spacing' });
  return sig;
};

/* Span / depth ratio, EN 1992-1-1:2004 7.4.2 (7.16), informative simplified method */
EC.spanDepth = function (c, o) {
  const { m, L, d, b, AsReq, AsProv, K, rho2 } = o;
  const fck = m.fck, r0 = Math.sqrt(fck) * 1e-3;
  const rho = Math.max(AsReq / (b * d), 1e-5);
  let ld;
  if (rho <= r0) ld = K * (11 + 1.5 * Math.sqrt(fck) * r0 / rho + 3.2 * Math.sqrt(fck) * Math.pow(r0 / rho - 1, 1.5));
  else ld = K * (11 + 1.5 * Math.sqrt(fck) * r0 / (rho - (rho2 || 0)) + Math.sqrt(fck) / 12 * Math.sqrt((rho2 || 0) / r0));
  const f = Math.min(1.5, AsProv / Math.max(AsReq, 1));
  const f7 = L > 7 && K !== 0.4 ? 7 / L : 1;
  c.v({ l: 'Reference reinforcement ratio', s: 'ρ_0', f: '√f_ck · 10⁻³', v: r0, u: '', dp: 4 });
  c.v({ l: 'Required tension reinforcement ratio', s: 'ρ', f: 'A_s;req/(b d)', v: rho, u: '', dp: 4 });
  c.v({ l: 'Basic span/depth ratio', s: '(l/d)_basic', f: rho <= r0 ? 'K[11 + 1.5√f_ck ρ_0/ρ + 3.2√f_ck (ρ_0/ρ − 1)^1.5]' : 'K[11 + 1.5√f_ck ρ_0/(ρ−ρ\') + √f_ck/12 √(ρ\'/ρ_0)]', n: `K = ${K}`, v: ld, u: '', r: 'EN 1992-1-1:2004 7.4.2 (7.16)' });
  const lim = ld * f * f7;
  c.v({ l: 'Allowable span/depth', s: '(l/d)_lim', f: '(l/d)_basic · (A_s;prov/A_s;req ≤ 1.5)' + (f7 < 1 ? ' · 7/L' : ''), v: lim, u: '', key: true });
  c.chk({ l: 'Deflection (span/depth)', s: 'L/d', Ed: L * 1000 / d, Rd: lim, u: '', r: 'informative - 2023: 9.3 by calculation', item: 'Deflection - span/depth' });
  return lim;
};

/* ---------- simple SVG helpers for detailing ---------- */
EC.svg = {
  open: (w, h, extra) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="det" xmlns="http://www.w3.org/2000/svg" ${extra || ''}>`,
  dimH: (x1, x2, y, txt, off) => {
    const o = off || 0;
    return `<g class="dim"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"/><line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"/><text x="${(x1 + x2) / 2}" y="${y - 5 + o}" text-anchor="middle">${txt}</text></g>`;
  },
  dimV: (x, y1, y2, txt) => `<g class="dim"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/><text x="${x - 6}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 6} ${(y1 + y2) / 2})">${txt}</text></g>`,
  bar: (x, y, r) => `<circle class="rebar" cx="${x}" cy="${y}" r="${Math.max(r, 2)}"/>`,
  label: (x, y, t, cls, anchor) => `<text class="${cls || 'lbl'}" x="${x}" y="${y}" text-anchor="${anchor || 'start'}">${t}</text>`
};

/* x-y line plot (used for interaction diagrams, M/V diagrams) */
EC.plot = function (o) {
  const W = o.w || 360, H = (o.h || 260) + (o.legend ? 14 : 0), P = { l: 52, r: 14, t: o.legend ? 40 : 26, b: 40 };
  const all = o.series.flatMap(s => s.pts);
  let xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  if (o.extra) { xs = xs.concat(o.extra.map(p => p[0])); ys = ys.concat(o.extra.map(p => p[1])); }
  let x0 = Math.min(0, ...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
  const px = x => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r);
  const py = y => H - P.b - (y - y0) / (y1 - y0) * (H - P.t - P.b);
  const ticks = (a, b) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / 4))); const n = [1, 2, 5, 10].find(k => (b - a) / (st * k) <= 6) * st; const out = []; for (let v = Math.ceil(a / n) * n; v <= b + 1e-9; v += n) out.push(+v.toFixed(10)); return out; };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="plot" xmlns="http://www.w3.org/2000/svg">`;
  s += `<text class="ptitle" x="${P.l}" y="16">${o.title || ''}</text>`;
  ticks(y0, y1).forEach(v => { s += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${py(v)}" y2="${py(v)}"/><text class="tick" x="${P.l - 6}" y="${py(v) + 3}" text-anchor="end">${EC.fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)}</text>`; });
  ticks(x0, x1).forEach(v => { s += `<line class="grid" y1="${P.t}" y2="${H - P.b}" x1="${px(v)}" x2="${px(v)}"/><text class="tick" y="${H - P.b + 14}" x="${px(v)}" text-anchor="middle">${EC.fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)}</text>`; });
  s += `<line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${py(0)}" y2="${py(0)}"/><line class="axis" x1="${px(0)}" x2="${px(0)}" y1="${P.t}" y2="${H - P.b}"/>`;
  s += `<text class="atitle" x="${(P.l + W - P.r) / 2}" y="${H - 6}" text-anchor="middle">${o.xl || ''}</text>`;
  s += `<text class="atitle" x="12" y="${(P.t + H - P.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(P.t + H - P.b) / 2})">${o.yl || ''}</text>`;
  o.series.forEach((se, i) => {
    if (se.fill) s += `<path class="pfill s${i}" d="M${se.pts.map(p => px(p[0]) + ',' + py(p[1])).join('L')}L${px(se.pts[se.pts.length - 1][0])},${py(0)}L${px(se.pts[0][0])},${py(0)}Z"/>`;
    s += `<polyline class="pline s${se.cls === undefined ? i : se.cls}${se.dash ? ' dash' : ''}" points="${se.pts.map(p => px(p[0]) + ',' + py(p[1])).join(' ')}"><title>${se.name || ''}</title></polyline>`;
  });
  (o.points || []).forEach(p => { s += `<circle class="ppt ${p.ok === false ? 'bad' : ''}" cx="${px(p.x)}" cy="${py(p.y)}" r="5"><title>${p.t || ''}</title></circle><text class="tick strong" x="${px(p.x) + 8}" y="${py(p.y) - 6}">${p.t || ''}</text>`; });
  if (o.legend) { let lx = W - P.r - 4; o.series.slice().reverse().forEach((se, k) => { const i = o.series.length - 1 - k; if (!se.name) return; const tw = se.name.length * 6 + 22; lx -= tw; s += `<line class="pline s${se.cls === undefined ? i : se.cls}${se.dash ? ' dash' : ''}" x1="${lx}" x2="${lx + 14}" y1="28" y2="28"/><text class="tick" x="${lx + 18}" y="31">${se.name}</text>`; }); }
  return s + '</svg>';
};

/* ---------- table inputs + small helpers ---------- */
EC.T = (k, l, cols, rows) => ({ k, l, cols, d: rows });
EC.rows = v => (Array.isArray(v) ? v : []).map(r => r.map(Number)).filter(r => r.every(Number.isFinite));
EC.interp = function (xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
};
EC.rad = d => d * Math.PI / 180;
EC.deg = r => r * 180 / Math.PI;
EC.Calc.prototype.q = function (l, s, f, v, u, r, key) { return this.v({ l, s, f, v, u, r, key }); };
EC.Calc.prototype.c = function (l, s, Ed, Rd, u, r, item, f) { return this.chk({ l, s, Ed, Rd, u, r, item: item === undefined ? l : item, f }); };
EC.Calc.prototype.tbl = function (head, rows, dp) { this.out.push({ k: 'tbl', head, rows, dp }); };

/* ---------- soil mechanics ---------- */
EC.soil = {
  Ka: phi => Math.pow(Math.tan(EC.rad(45 - phi / 2)), 2),
  Kp: phi => Math.pow(Math.tan(EC.rad(45 + phi / 2)), 2),
  K0: phi => 1 - Math.sin(EC.rad(phi)),
  /* Coulomb active / passive; phi, delta (wall friction), beta (backfill slope), alpha (back face from vertical) in degrees */
  KaC(phi, delta, beta, alpha) {
    const f = EC.rad(phi), d = EC.rad(delta || 0), b = EC.rad(beta || 0), a = EC.rad(alpha || 0);
    const num = Math.pow(Math.cos(f - a), 2);
    const root = Math.sqrt(Math.max(0, Math.sin(f + d) * Math.sin(f - b) / (Math.cos(d + a) * Math.cos(a - b))));
    return num / (Math.pow(Math.cos(a), 2) * Math.cos(d + a) * Math.pow(1 + root, 2));
  },
  KpC(phi, delta, beta) {
    const f = EC.rad(phi), d = EC.rad(delta || 0), b = EC.rad(beta || 0);
    const root = Math.sqrt(Math.max(0, Math.sin(f + d) * Math.sin(f + b) / (Math.cos(d) * Math.cos(b))));
    return Math.pow(Math.cos(f), 2) / (Math.cos(d) * Math.pow(1 - root, 2));
  },
  /* EN 1997-1 Annex D bearing factors */
  Nq: phi => Math.exp(Math.PI * Math.tan(EC.rad(phi))) * Math.pow(Math.tan(EC.rad(45 + phi / 2)), 2),
  Nc: phi => phi < 0.01 ? Math.PI + 2 : (EC.soil.Nq(phi) - 1) / Math.tan(EC.rad(phi)),
  Ng: phi => 2 * (EC.soil.Nq(phi) - 1) * Math.tan(EC.rad(phi)),
  gw: 9.81
};

/* ---------- wind EN 1991-1-4 (peak velocity pressure) ---------- */
EC.TERRAIN = [{ v: '0', l: '0 - sea / coastal', z0: 0.003, zmin: 1 }, { v: 'I', l: 'I - lakes, flat open', z0: 0.01, zmin: 1 }, { v: 'II', l: 'II - low vegetation, isolated obstacles', z0: 0.05, zmin: 2 }, { v: 'III', l: 'III - suburban / forest', z0: 0.3, zmin: 5 }, { v: 'IV', l: 'IV - urban (≥ 15 % built, h > 15 m)', z0: 1.0, zmin: 10 }];
EC.wind = {
  qp(z, vb, cat, co, rho) {
    const T = EC.TERRAIN.find(t => t.v === String(cat)) || EC.TERRAIN[2];
    const zz = Math.max(z, T.zmin);
    const kr = 0.19 * Math.pow(T.z0 / 0.05, 0.07);
    const cr = kr * Math.log(zz / T.z0);
    const vm = cr * (co || 1) * vb;
    const Iv = 1 / ((co || 1) * Math.log(zz / T.z0));
    const qp = (1 + 7 * Iv) * 0.5 * (rho || 1.25) * vm * vm / 1000;
    return { kr, cr, vm, Iv, qp, z0: T.z0, zmin: T.zmin };
  },
  qpLines(c, z, vb, cat, co) {
    const w = EC.wind.qp(z, vb, cat, co);
    c.v({ l: 'Terrain factor', s: 'k_r', f: '0.19 (z_0/z_0;II)^0.07', n: `z_0 = ${w.z0} m, z_min = ${w.zmin} m`, v: w.kr, u: '', r: '4.3.2' });
    c.v({ l: 'Roughness factor', s: 'c_r(z)', f: 'k_r ln(z/z_0)', v: w.cr, u: '', r: '4.3.2' });
    c.v({ l: 'Mean wind velocity', s: 'v_m(z)', f: 'c_r c_o v_b', v: w.vm, u: 'm/s', r: '4.3.1' });
    c.v({ l: 'Turbulence intensity', s: 'I_v(z)', f: '1/(c_o ln(z/z_0))', v: w.Iv, u: '', r: '4.4' });
    c.v({ l: 'Peak velocity pressure', s: 'q_p(z)', f: '[1 + 7 I_v] ½ ρ v_m²', n: `z = ${EC.fmt(z)} m`, v: w.qp, u: 'kPa', r: '4.5', key: true });
    return w;
  }
};

/* ---------- creep & shrinkage, EN 1992-1-1 Annex B (2004 form) ---------- */
EC.creep = {
  phi(fcm, RH, h0, t0, t) {
    const a1 = Math.pow(35 / fcm, 0.7), a2 = Math.pow(35 / fcm, 0.2), a3 = Math.pow(35 / fcm, 0.5);
    const phiRH = fcm <= 35 ? 1 + (1 - RH / 100) / (0.1 * Math.pow(h0, 1 / 3)) : (1 + (1 - RH / 100) / (0.1 * Math.pow(h0, 1 / 3)) * a1) * a2;
    const bf = 16.8 / Math.sqrt(fcm), bt0 = 1 / (0.1 + Math.pow(t0, 0.2));
    const bH = fcm <= 35 ? Math.min(1.5 * (1 + Math.pow(0.012 * RH, 18)) * h0 + 250, 1500) : Math.min(1.5 * (1 + Math.pow(0.012 * RH, 18)) * h0 + 250 * a3, 1500 * a3);
    const bc = Math.pow((t - t0) / (bH + t - t0), 0.3);
    return { phiRH, bf, bt0, bH, bc, phi0: phiRH * bf * bt0, phi: phiRH * bf * bt0 * bc };
  },
  shrink(fck, RH, h0, ts, t, cls) {
    const fcm = fck + 8, a = { S: [3, 0.13], N: [4, 0.12], R: [6, 0.11] }[cls || 'N'];
    const bRH = 1.55 * (1 - Math.pow(RH / 100, 3));
    const ecd0 = 0.85 * ((220 + 110 * a[0]) * Math.exp(-a[1] * fcm / 10)) * 1e-6 * bRH;
    const kh = EC.interp([100, 200, 300, 500], [1, 0.85, 0.75, 0.7], h0);
    const bds = (t - ts) / ((t - ts) + 0.04 * Math.sqrt(Math.pow(h0, 3)));
    const ecd = bds * kh * ecd0;
    const eca = (1 - Math.exp(-0.2 * Math.sqrt(t))) * 2.5 * (fck - 10) * 1e-6;
    return { ecd0, kh, bds, ecd, eca, ecs: ecd + eca };
  }
};

/* rectangle stress-block section with compression steel ignored; returns M_Rd for given As at depth d */
EC.MRdRect = (As, b, d, m) => { const y = As * m.fyd / (m.fcd * b); return As * m.fyd * (d - y / 2) / 1e6; };
EC.AsReq = (M, b, d, m) => { const disc = d * d - 2 * Math.abs(M) * 1e6 / (m.fcd * b); return disc < 0 ? Infinity : m.fcd * b * (d - Math.sqrt(disc)) / m.fyd; };
/* generic sketch: rectangles + lines from a list (used by several modules) */
EC.sketch = function (w, h, title, items) {
  let s = EC.svg.open(w, h) + (title ? EC.svg.label(14, 18, title, 'ttl') : '');
  items.forEach(it => {
    if (it.r) s += `<rect class="${it.c || 'conc'}" x="${it.r[0]}" y="${it.r[1]}" width="${Math.max(0, it.r[2])}" height="${Math.max(0, it.r[3])}"/>`;
    if (it.p) s += `<polygon class="${it.c || 'conc'}" points="${it.p.map(p => p.join(',')).join(' ')}"/>`;
    if (it.l) s += `<polyline class="${it.c || 'rebarline'}" points="${it.l.map(p => p.join(',')).join(' ')}" fill="none"/>`;
    if (it.o) s += `<circle class="${it.c || 'rebar'}" cx="${it.o[0]}" cy="${it.o[1]}" r="${it.o[2]}"/>`;
    if (it.t) s += EC.svg.label(it.t[0], it.t[1], it.t[2], it.c || 'lbl', it.a);
    if (it.dh) s += EC.svg.dimH(it.dh[0], it.dh[1], it.dh[2], it.dh[3]);
    if (it.dv) s += EC.svg.dimV(it.dv[0], it.dv[1], it.dv[2], it.dv[3]);
  });
  return s + '</svg>';
};
