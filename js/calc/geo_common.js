/* Shared geotechnical routines (EN 1997) */
(function () {
  const S = EC.soil;
  EC.geo = {};
  /* partial factor sets: actions (G unfav, Q), materials (tanφ', c', c_u, γ), resistances (bearing, sliding) */
  EC.geo.DA = {
    'DA1-1': { l: 'DA1 comb. 1 (A1+M1+R1)', gG: 1.35, gQ: 1.5, gphi: 1.0, gc: 1.0, gcu: 1.0, gRv: 1.0, gRh: 1.0 },
    'DA1-2': { l: 'DA1 comb. 2 (A2+M2+R1)', gG: 1.0, gQ: 1.3, gphi: 1.25, gc: 1.25, gcu: 1.4, gRv: 1.0, gRh: 1.0 },
    DA2: { l: 'DA2 (A1+M1+R2)', gG: 1.35, gQ: 1.5, gphi: 1.0, gc: 1.0, gcu: 1.0, gRv: 1.4, gRh: 1.1 },
    DA3: { l: 'DA3 (A1/A2+M2+R3)', gG: 1.35, gQ: 1.5, gphi: 1.25, gc: 1.25, gcu: 1.4, gRv: 1.0, gRh: 1.0 },
    'RFA-DC1': { l: 'EN 1997:2024 RFA, DC1', gG: 1.35, gQ: 1.5, gphi: 1.0, gc: 1.0, gcu: 1.0, gRv: 1.4, gRh: 1.1 },
    'MFA-DC3': { l: 'EN 1997:2024 MFA, DC3 (M2)', gG: 1.0, gQ: 1.3, gphi: 1.25, gc: 1.25, gcu: 1.4, gRv: 1.0, gRh: 1.0 }
  };
  EC.geo.DAopts = Object.keys(EC.geo.DA).map(v => ({ v, l: EC.geo.DA[v].l }));
  EC.geo.phid = (phi, g) => EC.deg(Math.atan(Math.tan(EC.rad(phi)) / g));

  /* EN 1997-1 Annex D bearing resistance (drained or undrained), load inclination parallel to B' */
  EC.geo.bearing = function (o) {
    const { B, L, V, H, q, gam } = o;
    const Bp = Math.max(B, 1e-3), Lp = Math.max(L, Bp), A = Bp * Lp, r = Bp / Lp;
    if (o.undrained) {
      const cu = o.cu, sc = 1 + 0.2 * r, ic = 0.5 * (1 + Math.sqrt(Math.max(0, 1 - Math.min(H / (A * cu), 1))));
      const qu = (Math.PI + 2) * cu * sc * ic + q;
      return { A, Nc: Math.PI + 2, sc, ic, qu, R: qu * A };
    }
    const phi = o.phi, c = o.c || 0, f = EC.rad(phi);
    const Nq = S.Nq(phi), Nc = S.Nc(phi), Ng = S.Ng(phi);
    const sq = 1 + r * Math.sin(f), sg = 1 - 0.3 * r, sc = (sq * Nq - 1) / (Nq - 1);
    const mB = (2 + r) / (1 + r), den = V + A * c / Math.tan(f);
    const iq = Math.pow(Math.max(0, 1 - H / den), mB), ig = Math.pow(Math.max(0, 1 - H / den), mB + 1), ic = iq - (1 - iq) / (Nc * Math.tan(f));
    const qu = c * Nc * sc * ic + q * Nq * sq * iq + 0.5 * gam * Bp * Ng * sg * ig;
    return { A, Nq, Nc, Ng, sq, sg, sc, iq, ig, ic, qu, R: qu * A };
  };

  /* vertical stress under the corner of a loaded rectangle (Newmark / Boussinesq), returns Δσ/q */
  EC.geo.Icorner = function (b, l, z) {
    if (z <= 0) return 0.25;
    const m = b / z, n = l / z, m2 = m * m, n2 = n * n, s = Math.sqrt(m2 + n2 + 1);
    let at = Math.atan2(2 * m * n * s, m2 + n2 + 1 - m2 * n2);
    if (at < 0) at += Math.PI;
    return (2 * m * n * s / (m2 + n2 + m2 * n2 + 1) * (m2 + n2 + 2) / (m2 + n2 + 1) + at) / (4 * Math.PI);
  };
  EC.geo.Icentre = (B, L, z) => 4 * EC.geo.Icorner(B / 2, L / 2, z);

  /* beam on Winkler springs by stiffness method: nodes 0..n along length Lb (m), EI (kNm²), kfun(z) spring per length (kN/m/m),
     loads: [{node, P (kN), M (kNm)}], fixed: {node: [w?, θ?]} -> {w (m), M (kNm), V (kN), z} */
  EC.geo.beamSprings = function (o) {
    const n = o.n, h = o.Lb / n, EI = o.EI, N = 2 * (n + 1);
    const K = Array.from({ length: N }, () => new Float64Array(N)), f = new Float64Array(N);
    const k = EI / h ** 3, ke = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]];
    for (let e = 0; e < n; e++) { const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]; for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) K[d[r]][d[s]] += k * ke[r][s]; }
    for (let j = 0; j <= n; j++) K[2 * j][2 * j] += o.kfun(j * h) * h * (j === 0 || j === n ? 0.5 : 1);
    (o.loads || []).forEach(L => { f[2 * L.node] += L.P || 0; f[2 * L.node + 1] += L.M || 0; });
    (o.dist || []).forEach((q, j) => { f[2 * j] += q * h * (j === 0 || j === n ? 0.5 : 1); });
    const big = 1e14;
    Object.entries(o.fixed || {}).forEach(([nd, fx]) => { if (fx[0]) K[2 * nd][2 * nd] += big; if (fx[1]) K[2 * nd + 1][2 * nd + 1] += big; });
    const A = K.map(r => Float64Array.from(r)), b = Float64Array.from(f);
    const bw = 4;
    for (let p = 0; p < N; p++) { const pv = A[p][p]; for (let r = p + 1; r < Math.min(N, p + bw); r++) { const q = A[r][p] / pv; if (!q) continue; for (let s = p; s < Math.min(N, p + bw); s++) A[r][s] -= q * A[p][s]; b[r] -= q * b[p]; } }
    const u = new Float64Array(N); for (let r = N - 1; r >= 0; r--) { let s = b[r]; for (let q = r + 1; q < Math.min(N, r + bw); q++) s -= A[r][q] * u[q]; u[r] = s / A[r][r]; }
    const w = [], M = [], V = [], z = [];
    for (let j = 0; j <= n; j++) {
      z.push(j * h); w.push(u[2 * j]);
      const e = Math.min(j, n - 1), end = j === n ? 1 : 0;
      const w1 = u[2 * e], t1 = u[2 * e + 1], w2 = u[2 * e + 2], t2 = u[2 * e + 3];
      const curv = end ? (6 * w1 + 2 * h * t1 - 6 * w2 + 4 * h * t2) / (h * h) : (-6 * w1 - 4 * h * t1 + 6 * w2 - 2 * h * t2) / (h * h);
      M.push(-EI * curv);
      V.push(-EI * (12 * w1 + 6 * h * t1 - 12 * w2 + 6 * h * t2) / h ** 3);
    }
    return { w, M, V, z };
  };

  /* simple soil-layer helper: rows [thickness, γ, γ_sat, ...] -> σ'_v(z) with water table zw */
  EC.geo.sigv = function (layers, zw, z) {
    let s = 0, top = 0, u = Math.max(0, z - zw) * S.gw;
    for (const L of layers) {
      const bot = top + L.h;
      const seg = Math.max(0, Math.min(z, bot) - top);
      if (seg > 0) { const dry = Math.max(0, Math.min(seg, zw - top)); s += dry * L.g + (seg - dry) * (L.gs || L.g); }
      top = bot; if (z <= bot) break;
    }
    if (z > top) { const L = layers[layers.length - 1]; s += (z - top) * (L.gs || L.g); }
    return { sv: s, u, s1: s - u };
  };
  EC.geo.layerAt = (layers, z) => { let top = 0; for (const L of layers) { if (z < top + L.h) return L; top += L.h; } return layers[layers.length - 1]; };
  /* Student t (one-sided 95 %) for characteristic values */
  EC.geo.t95 = n => EC.interp([2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 60], [6.31, 2.92, 2.35, 2.13, 2.02, 1.89, 1.83, 1.76, 1.73, 1.70, 1.67], n);
})();
