/* Typical details: foundations (see js/typdet/core.js for the ctx / drawing API) */
(function () {
  'use strict';
  const TD = window.EC.typdet, T0 = TD.T;

  /* ---------- cap on a single pile (SinglePileCap_EC2-2023_Standalone, native pilecap1) ---------- */
  const isSingle = c => /SinglePileCap/.test(c.type) || c.type === 'pilecap1';
  const circle = (x, y, r, n) => Array.from({ length: n || 36 }, (_, k) => [x + r * Math.cos(2 * Math.PI * k / (n || 36)), y + r * Math.sin(2 * Math.PI * k / (n || 36))]);
  const single = c => {
    const fckT = String(c.txt(['f_ck', 'fck'], '') || ''), fm = fckT.match(/C(\d+)/);
    const g = {
      Bx: c.mm(['B_x', 'B'], 700), By: c.mm(['B_y', 'B'], 700), h: c.mm('h', 800),
      cx: c.mm(['c_x', 'c'], 400), cy: c.mm(['c_y', 'c'], 400),
      circ: c.has('PileType') ? c.txt('PileType', 'Circular') !== 'Square' : true, Dp: c.mm(['D_p', 'Dp'], 300),
      ex: c.mm(['e_x', 'tol'], 25), ey: c.mm(['e_y', 'tol'], 25),
      cb: c.mm(['c_bot', 'cnom'], 50), cn: c.mm(['c_nom', 'cnom'], 50),
      fck: fm ? +fm[1] : c.n(['fck'], 30), fyk: c.n(['f_yk', 'fyk'], 500),
      dx: c.bar(['ϕ_bx', 'd'], 16), dy: c.bar(['ϕ_by', 'd'], 16), dsd: c.bar(['ϕ_sd', 'dh'], 12), dcol: c.bar(['ϕ_col'], 25),
      hook: c.has('i_hook') ? c.n('i_hook', 0) === 0 : true, good: c.n('Bond', 0) === 0,
      N: c.n(['N_Ed', 'N'], 540), ktb: c.has('k_tb') ? c.n('k_tb', 0.1) : c.n('tie', 2) / 100,
      id: c.txt('CapID', c.mark || '')
    };
    // bars across the cap: from the spacing (worksheet) or the number of bars (native)
    const lay = (s, n, w) => { if (s > 0) return { s, n: Math.floor((w - 2 * g.cn) / s) + 1 }; n = Math.max(2, Math.round(n)); return { n, s: (w - 2 * g.cn) / (n - 1) }; };
    const lx = lay(c.mm('s_bx', 0), c.n('n', 5), g.By), ly = lay(c.mm('s_by', 0), c.n('n', 5), g.Bx);
    g.sx = lx.s; g.nx = lx.n; g.sy = ly.s; g.ny = ly.n;
    g.ssd = c.has('s_sd') ? c.mm('s_sd', 200) : (g.h - g.cb - g.cn) / (Math.max(1, c.n('nh', 3)) + 1);
    g.ybx = g.h - g.cb - g.dx / 2; g.yby = g.h - g.cb - g.dx - g.dy / 2;     // x bars lower layer, y bars on top of them
    g.ap = g.circ ? 2 * g.Dp / (3 * Math.PI) : g.Dp / 4;                       // centroid of half the pile (worksheet a_p)
    g.lbd = T0.lbd(Math.max(g.dx, g.dy), g.fyk, g.fck, g.good);
    g.lcol = T0.lbd(g.dcol, g.fyk, g.fck, true);
    return g;
  };
  const pile = (D, g, x, y, cls) => (g.circ ? D[cls || 'void'](circle(x, y, g.Dp / 2)) : D[cls || 'void']([x - g.Dp / 2, y - g.Dp / 2, g.Dp, g.Dp]));
  const pileLine = (D, g, x, y) => D.line(g.circ ? circle(x, y, g.Dp / 2).concat([[x + g.Dp / 2, y]]) : [[x - g.Dp / 2, y - g.Dp / 2], [x + g.Dp / 2, y - g.Dp / 2], [x + g.Dp / 2, y + g.Dp / 2], [x - g.Dp / 2, y + g.Dp / 2], [x - g.Dp / 2, y - g.Dp / 2]], 'td-center');
  const lbl = (d, s) => `H${d}@${T0.fmt(s)}`;

  /* TD: plan with the bottom mat, column and pile */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), { Bx, By } = g;
    D.concrete([0, 0, Bx, By]);
    for (let k = 0; k < g.nx; k++) { const y = g.cn + k * g.sx; if (y <= By - g.cn + 1) D.rebar([[g.cn, y], [Bx - g.cn, y]], g.dx); }
    for (let k = 0; k < g.ny; k++) { const x = g.cn + k * g.sy; if (x <= Bx - g.cn + 1) D.rebar([[x, g.cn], [x, By - g.cn]], g.dy); }
    D.steel([Bx / 2 - g.cx / 2, By / 2 - g.cy / 2, g.cx, g.cy]);
    pileLine(D, g, Bx / 2, By / 2);
    D.line([[-60, By / 2], [Bx + 60, By / 2]], 'td-center').line([[Bx / 2, -60], [Bx / 2, By + 60]], 'td-center');
    D.dimH(0, Bx, By, 'B_x ' + T.fmt(Bx), 30).dimV(0, By, 0, 'B_y ' + T.fmt(By), 30);
    D.leader(Bx - g.cn, g.cn, Bx + 80, -30, `x: ${g.nx} ${lbl(g.dx, g.sx)} (lower layer)`);
    D.leader(g.cn, By - g.cn, Bx + 80, By + 10, `y: ${g.ny} ${lbl(g.dy, g.sy)} (upper layer)`);
    D.leader(Bx / 2 + g.cx / 2, By / 2 - g.cy / 2, Bx + 80, By * 0.3, `column ${T.fmt(g.cx)} × ${T.fmt(g.cy)}`);
    D.leader(Bx / 2 + g.Dp / 2, By / 2 + g.Dp / 4, Bx + 80, By * 0.7, `pile ${g.circ ? 'ϕ' : '□'}${T.fmt(g.Dp)} below (dashed)`);
    return { t: `Plan - ${g.id ? g.id + ', ' : ''}bottom reinforcement`, s: `${T.fmt(Bx)} × ${T.fmt(By)} × ${T.fmt(g.h)} mm on one ${g.circ ? 'circular' : 'square'} pile`,
      svg: D.svg(560, 380), notes: ['Bars along x in the lower layer (d_x), bars along y on top of them (d_y), as in the worksheet', 'Column, cap and pile on one axis'] };
  }, isSingle);

  /* TD: sections x-z and y-z through the cap */
  const section = dir => (c, T) => {
    const g = single(c), D = T.draw(), X = dir === 'x';
    const B = X ? g.Bx : g.By, cc = X ? g.cx : g.cy, h = g.h, cn = g.cn;
    const dm = X ? g.dx : g.dy, sm = X ? g.sx : g.sy, ym = X ? g.ybx : g.yby;          // main bars of this section (drawn as lines)
    const dt = X ? g.dy : g.dx, st = X ? g.sy : g.sx, yt = X ? g.yby : g.ybx;          // cross bars (dots)
    const Hc = Math.max(300, 0.6 * cc), Lp = Math.max(400, g.Dp);
    D.concrete([0, 0, B, h]).concrete([B / 2 - cc / 2, -Hc, cc, Hc]).concrete([B / 2 - g.Dp / 2, h, g.Dp, Lp]);
    if (g.hook) D.rebar([[cn, cn + 20], [cn, ym], [B - cn, ym], [B - cn, cn + 20]], dm); else D.rebar([[cn, ym], [B - cn, ym]], dm);
    for (let x = cn + dt / 2; x <= B - cn; x += st) D.bar(x, yt, dt);
    for (let y = ym - g.ssd; y > cn + g.dsd; y -= g.ssd) D.bar(cn + (g.hook ? dm : 0) + g.dsd / 2, y, g.dsd).bar(B - cn - (g.hook ? dm : 0) - g.dsd / 2, y, g.dsd);
    const ycl = Math.min(ym, yt) - Math.max(g.dx, g.dy) / 2 - g.dcol / 2, foot = Math.min(12 * g.dcol, cc / 2 - 40);
    [[B / 2 - cc / 2 + 50, 1], [B / 2 + cc / 2 - 50, -1]].forEach(([x, s]) => D.rebar([[x, -Hc], [x, ycl], [x + s * foot, ycl]], g.dcol));
    D.line([[B / 2, -Hc - 40], [B / 2, h + Lp + 40]], 'td-center');
    D.dimH(0, B, h + Lp, `B_${dir} ${T.fmt(B)}`, 30).dimV(0, h, 0, 'h ' + T.fmt(h), 30).dimV(ym + dm / 2, h, B, 'c_bot ' + T.fmt(g.cb), -30)
      .dimH(B / 2 - cc / 2, B / 2 + cc / 2, -Hc, `c_${dir} ${T.fmt(cc)}`, -18).dimH(B / 2 - g.Dp / 2, B / 2 + g.Dp / 2, h + Lp * 0.6, 'D_p ' + T.fmt(g.Dp), 0);
    D.leader(B * 0.3, ym, -120, h * 0.95, `${X ? 'x' : 'y'} ${lbl(dm, sm)} ${g.hook ? 'U-bars' : 'straight'}`);
    D.leader(cn + dt, yt, -120, h * 0.7, `${X ? 'y' : 'x'} ${lbl(dt, st)}`);
    D.leader(B - cn - g.dsd, ym - g.ssd, B + 90, h * 0.4, `side bars ${lbl(g.dsd, g.ssd)}`);
    D.leader(B / 2 - cc / 2 + 50, -Hc * 0.5, -120, -Hc * 0.6, `column starters H${g.dcol}, L-bars on the mat`);
    return { t: `Section ${X ? 'A-A (x-z plane)' : 'B-B (y-z plane)'}`, s: `${T.fmt(B)} × ${T.fmt(h)} mm · cover ${T.fmt(g.cb)} bottom / ${T.fmt(cn)} sides`,
      svg: D.svg(560, 420), notes: [g.hook ? 'Bottom ties as U-bars: the legs up the sides anchor the tie beyond the pile node' : 'Straight ties: check l_bd from the pile axis (worksheet 6.2)', 'Column bars stand on the bottom mat with a foot to hold them during the pour'] };
  };
  TD.add('foundations', section('x'), isSingle);
  TD.add('foundations', section('y'), isSingle);

  /* TD: strut-and-tie model (x-z plane), as in worksheet section 4 */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), B = g.Bx, h = g.h, d = g.h - g.cb - g.dx / 2, z = 0.9 * d, yb = g.ybx, ytop = yb - z, Hc = 300;
    D.concrete([0, 0, B, h]).concrete([B / 2 - g.cx / 2, -Hc, g.cx, Hc]).concrete([B / 2 - g.Dp / 2, h, g.Dp, 300]);
    const xt = [B / 2 - g.cx / 4 - g.ex, B / 2 + g.cx / 4 + g.ex], xb = [B / 2 - g.ap, B / 2 + g.ap];
    D.rebar([[xb[0] - 60, yb], [xb[1] + 60, yb]], 14);
    D.line([[xt[0], ytop], [xb[0], yb]]).line([[xt[1], ytop], [xb[1], yb]]).line([[xt[0], ytop], [xt[1], ytop]], 'td-center');
    xt.forEach(x => D.bar(x, ytop, 30).line([[x, -Hc], [x, ytop]], 'td-center')); xb.forEach(x => D.bar(x, yb, 30).line([[x, yb], [x, h + 300]], 'td-center'));
    D.line([[B / 2, -Hc - 160], [B / 2, -Hc - 10]]).line([[B / 2 - 25, -Hc - 50], [B / 2, -Hc - 10], [B / 2 + 25, -Hc - 50]]);
    D.note(B / 2 + 30, -Hc - 120, `N_Ed = ${T.fmt(g.N)} kN`);
    D.dimV(ytop, yb, B, 'z = 0.9 d = ' + T.fmt(z), -40).dimH(xb[0], xb[1], h + 300, '2 a_p = ' + T.fmt(2 * g.ap), 20);
    D.leader((xt[0] + xb[0]) / 2, (ytop + yb) / 2, -120, h * 0.4, 'strut C = N_Ed / (2 sin θ)');
    D.leader(B / 2, yb, -120, h * 0.9, 'tie T = (N_Ed/2)·Δ/z ≥ k_tb·N_Ed');
    D.leader(xt[1], ytop, B + 90, ytop - 40, 'CCC node (column)');
    D.leader(xb[1], yb, B + 90, yb + 40, 'CCT node (pile)');
    return { t: 'Strut-and-tie model (x-z)', s: `d = ${T.fmt(d)} mm · z = ${T.fmt(z)} mm · Δ = |a_p − c/4| + e`,
      svg: D.svg(560, 420), notes: ['Column halves at c/4 shifted by the eccentricity e; pile reaction at the centroid of the pile halves a_p', 'Same model in the y-z plane with c_y, d_y and e_y'] };
  }, isSingle);

  /* TD: bar shapes of the bottom ties (bending schedule) */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), leg = g.h - g.cb - g.cn - g.dx, wx = g.Bx - 2 * g.cn, wy = g.By - 2 * g.cn, gap = 300;
    const shape = (x0, w, d) => (g.hook ? D.rebar([[x0, 0], [x0, leg], [x0 + w, leg], [x0 + w, 0]], d) : D.rebar([[x0, leg], [x0 + w, leg]], d));
    shape(0, wx, g.dx); shape(wx + gap, wy, g.dy);
    D.dimH(0, wx, leg, T.fmt(wx), 26).dimH(wx + gap, wx + gap + wy, leg, T.fmt(wy), 26);
    if (g.hook) D.dimV(0, leg, 0, T.fmt(leg), 24).dimV(0, leg, wx + gap, T.fmt(leg), 24);
    D.note(wx / 2, leg / 2, `mark 01 · ${g.nx} H${g.dx} (x)`, 'middle').note(wx + gap + wy / 2, leg / 2, `mark 02 · ${g.ny} H${g.dy} (y)`, 'middle');
    const Lx = wx + (g.hook ? 2 * leg : 0), Ly = wy + (g.hook ? 2 * leg : 0);
    return { t: 'Bar shapes - bottom ties', s: `${g.hook ? 'U-bars (shape code 21)' : 'straight bars (shape code 00)'} · cut lengths ≈ ${T.fmt(Lx)} / ${T.fmt(Ly)} mm`,
      svg: D.svg(560, 300), notes: [`Indicative anchorage length l_bd ≈ ${T.fmt(g.lbd)} mm (${g.good ? 'good' : 'poor'} bond), measured from the pile axis: see worksheet 6.2`, 'Legs stop at the side cover below the top face; bend radius to EN 1992-1-1 Table 11.1'] };
  }, isSingle);

  /* TD: side face elevation, horizontal side bars */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), B = g.Bx, h = g.h, cn = g.cn;
    D.concrete([0, 0, B, h]);
    let n = 0;
    for (let y = g.ybx - g.ssd; y > cn + g.dsd; y -= g.ssd) { D.rebar([[cn, y], [B - cn, y]], g.dsd); n++; }
    if (g.hook) D.rebar([[cn + 30, cn + 20], [cn + 30, g.ybx]], g.dx).rebar([[B - cn - 30, cn + 20], [B - cn - 30, g.ybx]], g.dx);
    D.rebar([[cn, g.ybx], [B - cn, g.ybx]], g.dx);
    D.dimH(0, B, h, T.fmt(B), 26).dimV(0, h, 0, T.fmt(h), 26).dimV(g.ybx - 2 * g.ssd, g.ybx - g.ssd, B, 's_sd ' + T.fmt(g.ssd), -30);
    D.leader(B * 0.6, g.ybx - g.ssd, B + 80, h * 0.35, `${n} horizontal links H${g.dsd} each face`);
    return { t: 'Side faces - horizontal bars', s: `closed links ${lbl(g.dsd, g.ssd)} round the cap, cover ${T.fmt(cn)} mm`,
      svg: D.svg(540, 340), notes: ['Side bars control cracking of the deep faces and tie the U-bar legs together (EN 1992-1-1 12.2)', 'Spacing not more than s_max of the worksheet'] };
  }, isSingle);

  /* TD: column starter bars in the cap */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), cc = g.cx, h = g.h, W = cc + 400, x0 = 200, kick = 75, Lup = Math.ceil(1.5 * g.lcol / 50) * 50;
    D.concrete([0, 0, W, h]).concrete([x0, -kick - Lup * 0.5, cc, kick + Lup * 0.5]);
    D.line([[x0 - 30, -kick], [x0 + cc + 30, -kick]], 'td-center');
    const ycl = g.yby - g.dy / 2 - g.dcol / 2, foot = Math.min(12 * g.dcol, cc / 2 - 40), xa = x0 + 50, xb = x0 + cc - 50;
    D.rebar([[xa, -kick - Lup * 0.5], [xa, ycl], [xa + foot, ycl]], g.dcol).rebar([[xb, -kick - Lup * 0.5], [xb, ycl], [xb - foot, ycl]], g.dcol);
    D.rebar([[0, g.ybx], [W, g.ybx]], g.dx);
    for (let x = 30; x < W; x += g.sy) D.bar(x, g.yby, g.dy);
    D.link(x0 + 30, -kick - Lup * 0.4, cc - 60, 1, 10).link(x0 + 30, g.cn + 40, cc - 60, 1, 10);
    D.dimV(0, ycl, x0 + cc, 'l_av ' + T.fmt(ycl), -60).dimV(-kick, 0, x0, 'kicker ' + kick, 30).dimH(xa, xa + foot, ycl, 'foot ' + T.fmt(foot), 22);
    D.leader(xb, -kick - Lup * 0.3, W + 60, -kick - Lup * 0.3, `starters H${g.dcol}, lap ≈ ${T.fmt(Lup)} above kicker`);
    D.leader(x0 + cc - 30, g.cn + 40, W + 60, g.cn + 60, 'locating link in the cap');
    return { t: 'Column starter bars', s: `H${g.dcol} L-bars on the bottom mat · l_bd ≈ ${T.fmt(g.lcol)} mm needed, ${T.fmt(ycl)} mm available`,
      svg: D.svg(540, 420), notes: ['Anchorage of the column bars in the cap is checked in worksheet 6.3 (l_col vs l_av;col)', 'At least two locating links in the cap depth; first column link above the kicker'] };
  }, isSingle);

  /* TD: pile head into the cap */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), Dp = g.Dp, W = Dp + 600, hc = Math.min(g.h, 500), x0 = 300, bl = 75, Lp = 500;
    const top = g.h - hc;     // show the lower part of the cap only
    D.concrete([0, 0, W, hc]).concrete([x0, hc, Dp, Lp]).concrete([-50, hc, x0 + 50, bl]).concrete([x0 + Dp, hc, W - x0 - Dp + 50, bl]);
    D.ground(-50, x0, hc + bl).ground(x0 + Dp, W + 50, hc + bl);
    const yb = g.ybx - top, yy = g.yby - top, dpb = 16, lp = T0.lbd(dpb, g.fyk, g.fck, true), yp = Math.max(30, hc - lp);
    D.rebar([[0, yb], [W, yb]], g.dx);
    for (let x = 30; x < W; x += g.sy) D.bar(x, yy, g.dy);
    [x0 + 60, x0 + Dp - 60].forEach(x => D.rebar([[x, hc + Lp], [x, yp]], dpb));
    D.line([[-80, hc], [W + 80, hc]], 'td-center');
    D.dimV(yb + g.dx / 2, hc, W, 'c_bot ' + T.fmt(g.cb), -30).dimV(hc, hc + bl, 0, 'blinding ' + bl, 30).dimH(x0, x0 + Dp, hc + Lp, 'D_p ' + T.fmt(Dp), 24);
    D.leader(x0 + 60, (yp + hc) / 2, -140, hc * 0.4, `pile bars into the cap ≈ ${T.fmt(Math.min(lp, hc - 30))} mm`);
    D.leader(x0, hc, -140, hc + Lp * 0.6, 'pile cut-off level = cap soffit');
    return { t: 'Pile head into the cap', s: `${g.circ ? 'ϕ' : '□'}${T.fmt(Dp)} pile · trim to sound concrete, cover ${T.fmt(g.cb)} mm to the bottom mat`,
      svg: D.svg(540, 360), notes: ['Break down the pile head to sound concrete at cut-off level; clean and wet before casting', 'Pile bars (shown H16, indicative) anchored into the cap or as required by the pile design (M_Rd,p)'] };
  }, isSingle);

  /* TD: pile position tolerance and eccentricity (plan) */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), { Bx, By } = g, x = Bx / 2, y = By / 2, s = 3;      // tolerance drawn 3× for clarity
    D.concrete([0, 0, Bx, By]).steel([x - g.cx / 2, y - g.cy / 2, g.cx, g.cy]);
    pile(D, g, x + g.ex * s, y + g.ey * s);
    pileLine(D, g, x, y);
    D.line([[-60, y], [Bx + 60, y]], 'td-center').line([[x, -60], [x, By + 60]], 'td-center');
    D.bar(x, y, 14).bar(x + g.ex * s, y + g.ey * s, 14).line([[x, y], [x + g.ex * s, y + g.ey * s]]);
    D.dimH(x, x + g.ex * s, By, `e_x ${T.fmt(g.ex)}`, 30).dimV(y, y + g.ey * s, Bx, `e_y ${T.fmt(g.ey)}`, -30);
    D.leader(x + g.ex * s + g.Dp / 2 * 0.7, y + g.ey * s + g.Dp / 2 * 0.7, Bx + 80, By * 0.85, 'as-built pile (dashed)');
    D.leader(x - g.Dp / 2, y, -100, By * 0.3, 'set-out pile on the column axis');
    return { t: 'Pile position tolerance', s: `e_x = ${T.fmt(g.ex)} mm · e_y = ${T.fmt(g.ey)} mm (drawn ×${s})`,
      svg: D.svg(520, 380), notes: ['Total eccentricity e_t = tolerance + M_Ed / N_Ed (worksheet 3.2): it raises the tie forces and the pile head moment', 'Survey the as-built pile before casting; re-check if the deviation exceeds e_x / e_y'] };
  }, isSingle);

  /* TD: tie beams in two directions */
  TD.add('foundations', (c, T) => {
    const g = single(c), D = T.draw(), { Bx, By } = g, bt = 300, L = 1100, x = Bx / 2, y = By / 2;
    D.concrete([x - bt / 2, -L, bt, L]).concrete([Bx, y - bt / 2, L, bt]).concrete([0, 0, Bx, By]);
    D.steel([x - g.cx / 2, y - g.cy / 2, g.cx, g.cy]); pileLine(D, g, x, y);
    const la = Math.max(g.lbd, 0.5 * Bx);
    [-1, 1].forEach(s => { D.rebar([[x + s * (bt / 2 - 50), -L], [x + s * (bt / 2 - 50), Math.min(la, By - g.cn)]], 16); D.rebar([[Bx + L, y + s * (bt / 2 - 50)], [Math.max(Bx - la, g.cn), y + s * (bt / 2 - 50)]], 16); });
    D.line([[x - bt, -L], [x + bt, -L]], 'td-center').line([[Bx + L, y - bt], [Bx + L, y + bt]], 'td-center');
    D.dimH(x - bt / 2, x + bt / 2, -L, T.fmt(bt), -18).dimH(0, Bx, By, T.fmt(Bx), 26).dimV(0, By, 0, T.fmt(By), 26);
    D.note(x + bt / 2 + 20, -L / 2, 'tie beam y (to next cap)').note(Bx + L / 2, y + bt / 2 + 40, 'tie beam x', 'middle');
    D.leader(x + bt / 2 - 50, By * 0.6, Bx + 80, By + 60, `tie bars anchored ≥ l_bd ≈ ${T.fmt(g.lbd)} into the cap`);
    return { t: 'Tie beams in two directions', s: `minimum tie force k_tb·N_Ed = ${T.fmt(g.ktb * g.N)} kN each way`,
      svg: D.svg(540, 420), notes: ['A cap on a single pile has no moment capacity of its own: restrain it with tie beams (or a slab) in both directions', 'The worksheet applies the minimum horizontal tie force k_tb·N_Ed to the bottom ties'] };
  }, isSingle);
})();
