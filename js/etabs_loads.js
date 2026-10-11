/* Loads & combinations in ETABS: create the standard load patterns, assign slab loads and generate the EN 1990
 * load combinations in the open ETABS model through the ETABS link (tools/etabs_bridge, POST /loads/*).
 * Combinations the app manages carry a prefix (CS-) and are rebuilt as a whole; the user's own are never touched.
 * Auto-update: when load patterns / cases change in ETABS (building modified) or a setting changes here,
 * the managed combinations are regenerated and written back. */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  let api = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* EN 1990 Table A1.1 (recommended ψ values) */
  const CATS = {
    A: ['A · domestic, residential', 0.7, 0.5, 0.3], B: ['B · office', 0.7, 0.5, 0.3], C: ['C · congregation', 0.7, 0.7, 0.6], D: ['D · shopping', 0.7, 0.7, 0.6],
    E: ['E · storage', 1.0, 0.9, 0.8], F: ['F · traffic ≤ 30 kN', 0.7, 0.7, 0.6], G: ['G · traffic 30–160 kN', 0.7, 0.5, 0.3], H: ['H · roofs', 0, 0, 0]
  };
  const PSI = { S: [0.5, 0.2, 0], W: [0.6, 0.2, 0], T: [0.6, 0.5, 0] };   // snow (≤ 1000 m), wind, temperature
  /* EN 1991-1-1 Table 6.2 imposed loads qk (kN/m²) - values used by many National Annexes; check yours */
  const QK = { A: 2.0, B: 3.0, C: 4.0, D: 4.0, E: 7.5, F: 2.5, G: 5.0, H: 0.4 };
  const KIND = { G: 'Permanent G', Q: 'Imposed Q', S: 'Snow S', W: 'Wind W', E: 'Seismic E', T: 'Temperature T', N: 'Notional N (imperfection)', off: 'Not used' };
  const PT = { 1: 'Dead', 2: 'Super dead', 3: 'Live', 4: 'Reducible live', 5: 'Quake', 6: 'Wind', 7: 'Snow', 8: 'Other', 10: 'Temperature', 11: 'Roof live', 12: 'Notional' };
  const CT = { 1: 'Linear static', 3: 'Modal', 4: 'Response spectrum', 10: 'Buckling' };
  const DEF = { expr: '6.10', gG: 1.35, gGinf: 1.0, gQ: 1.5, xi: 0.85, cat: 'B', windBoth: true, e30: true, equ: true, slsW: true, prefix: 'CS-', auto: false, sdl: 1.5, std: true, notional: false, nH: 0, nM: 10,
    rs: false, agR: 0.16, gI: 1.0, ground: 'C', stype: 1, q: 3.9, beta: 0.2, rsFunc: 'CS-EC8', rsX: 'EQX RS', rsY: 'EQY RS', rsModal: 'Modal', ecc: 0.05 };

  const P = () => { const p = api.proj(); p.loads = p.loads || {}; const L = p.loads; L.set = Object.assign({}, DEF, L.set || {}); L.act = L.act || {}; L.qk = Object.assign({}, QK, L.qk || {}); return L; };

  /* default action of an ETABS load pattern / case */
  function guess(u, set) {
    const dir = /Y/.test(u.name.replace(/[a-z]/g, '')) ? 'Y' : 'X';   // "Wind Y", "EQY RS", "EY" → Y
    if (u.src === 'case') return u.type === 4 ? { k: 'E', dir, rs: true } : { k: 'off' };
    if (u.type === 8 && /^N\s.+\s[XY]$/.test(u.name)) return { k: 'N', dir, base: u.name.replace(/^N\s+/, '').replace(/\s+[XY]$/, '') };   // notional loads applied as storey forces
    if (u.type === 12) return { k: 'N', dir, base: u.name.replace(/^N(otional)?[\s_-]+/i, '').replace(/[\s_-]+[XY]$/i, '') };   // "N Dead X" → base Dead
    return ({ 1: { k: 'G' }, 2: { k: 'G' }, 3: { k: 'Q', cat: set.cat }, 4: { k: 'Q', cat: set.cat }, 5: { k: 'E', dir }, 6: { k: 'W', dir }, 7: { k: 'S' }, 10: { k: 'T' }, 11: { k: 'Q', cat: 'H' } })[u.type] || { k: 'off' };
  }
  /* geometric imperfections - EN 1992-1-1 5.2(5), EN 1993-1-1 5.3.2(3): θi = θ0·αh·αm, θ0 = 1/200,
     αh = 2/√l (2/3 ≤ αh ≤ 1), αm = √(0.5·(1 + 1/m)); horizontal force at each floor Hi = θi·N (EC2 5.2(8)) */
  function theta(H, m) {
    const ah = H > 0 ? Math.min(1, Math.max(2 / 3, 2 / Math.sqrt(H))) : 1, am = Math.sqrt(0.5 * (1 + 1 / Math.max(1, m || 1)));
    return { ah, am, th: ah * am / 200 };
  }
  /* EN 1998-1 3.2.2.2 Tables 3.2 (Type 1) / 3.3 (Type 2): S, TB, TC, TD by ground type */
  const EC8 = {
    1: { A: [1.0, 0.15, 0.4, 2.0], B: [1.2, 0.15, 0.5, 2.0], C: [1.15, 0.20, 0.6, 2.0], D: [1.35, 0.20, 0.8, 2.0], E: [1.4, 0.15, 0.5, 2.0] },
    2: { A: [1.0, 0.05, 0.25, 1.2], B: [1.35, 0.05, 0.25, 1.2], C: [1.5, 0.10, 0.25, 1.2], D: [1.8, 0.10, 0.30, 1.2], E: [1.6, 0.05, 0.25, 1.2] }
  };
  /* design spectrum for elastic analysis, EN 1998-1 3.2.2.5(4), as Sd/g; ag = γI·agR */
  function spectrum(set) {
    const [S, TB, TC, TD] = EC8[set.stype][set.ground], ag = set.gI * set.agR, q = set.q, b = set.beta;
    const sd = T => T <= TB ? ag * S * (2 / 3 + T / TB * (2.5 / q - 2 / 3)) : T <= TC ? ag * S * 2.5 / q
      : T <= TD ? Math.max(ag * S * 2.5 / q * TC / T, b * ag) : Math.max(ag * S * 2.5 / q * TC * TD / (T * T), b * ag);
    const Ts = new Set([0, TB, TC, TD, 4, 5, 6, 8, 10]);
    for (let t = 0.05; t < 4; t += t < 1 ? 0.05 : 0.1) Ts.add(Math.round(t * 1000) / 1000);
    const T = [...Ts].sort((a, c) => a - c);
    return { S, TB, TC, TD, ag, T, v: T.map(t => Math.round(sd(t) * 1e5) / 1e5), sd, plateau: ag * S * 2.5 / q };
  }
  /* the load "units" of the model: every pattern, plus the load cases that are not a pattern's own case */
  function units(model) {
    const pn = new Set(model.patterns.map(p => p.name));
    return model.patterns.map(p => ({ name: p.name, type: p.type, src: 'pattern', sw: p.sw }))
      .concat(model.cases.filter(c => !pn.has(c.name)).map(c => ({ name: c.name, type: c.type, src: 'case' })));
  }

  /* ---------- EN 1990 combination generator ---------- */
  function generate(us, act, set) {
    const A = u => act[u.name] || { k: 'off' };
    const on = us.filter(u => A(u).k !== 'off');
    const G = on.filter(u => A(u).k === 'G').map(u => u.name);
    // variable actions: one group per Q category, snow, temperature, wind (alternatives: each direction, ± if asked)
    const groups = [];
    const qcats = [...new Set(on.filter(u => A(u).k === 'Q').map(u => A(u).cat || set.cat))];
    qcats.forEach(c => groups.push({ id: 'Q' + c, lab: 'Q(' + c + ')', psi: CATS[c].slice(1), alts: [on.filter(u => A(u).k === 'Q' && (A(u).cat || set.cat) === c).map(u => [u.name, 1])] }));
    ['S', 'T'].forEach(k => { const xs = on.filter(u => A(u).k === k); if (xs.length) groups.push({ id: k, lab: k, psi: PSI[k], alts: [xs.map(u => [u.name, 1])] }); });
    const ws = on.filter(u => A(u).k === 'W');
    if (ws.length) groups.push({ id: 'W', lab: 'W', psi: PSI.W, opt: true, alts: ws.flatMap(u => set.windBoth ? [[[u.name, 1]], [[u.name, -1]]] : [[[u.name, 1]]]) });
    groups.forEach(g => g.alts = g.alts.filter(a => a.length));
    const E = on.filter(u => A(u).k === 'E');

    const out = [], seen = new Set();
    const r3 = x => Math.round(x * 1000) / 1000;
    const add = (kind, terms, note) => {
      const m = new Map();
      terms.forEach(([n, f]) => { if (Math.abs(f) > 1e-9) m.set(n, r3((m.get(n) || 0) + f)); });
      const items = [...m.entries()].filter(([, f]) => Math.abs(f) > 1e-9);
      if (!items.length) return;
      const key = kind + '|' + items.map(([n, f]) => n + '*' + f).sort().join('+');
      if (seen.has(key)) return; seen.add(key);
      out.push({ kind, items, note });
    };
    const sc = (alt, f) => alt.map(([n, s]) => [n, s * f]);
    const gT = f => G.map(n => [n, f]);
    // choices of the accompanying groups (optional groups may also be absent)
    const choices = others => others.reduce((acc, g) => acc.flatMap(c => (g.opt ? [null] : []).concat(g.alts).map(a => c.concat([[g, a]]))), [[]]);
    // EN 1991-1-1 3.3.2(1): imposed roof loads (category H) are not combined with snow or wind
    const apart = (x, y) => (x.id === 'QH' && (y.id === 'W' || y.id === 'S')) || (y.id === 'QH' && (x.id === 'W' || x.id === 'S'));
    const lead = (L, fn) => L.alts.forEach(a => choices(groups.filter(g => g !== L && !apart(L, g))).forEach(ch => fn(a, ch)));
    const accT = (ch, i, f) => ch.flatMap(([g, a]) => (a ? sc(a, f * g.psi[i]) : []));
    const altLab = a => a.map(([n, s]) => (s < 0 ? '−' : '') + n).join('+');

    // ULS STR/GEO - EN 1990 6.4.3.2, Table A1.2(B)
    if (!groups.length) add('ULS', gT(set.gG), 'permanent only');
    groups.forEach(L => lead(L, (a, ch) => {
      if (set.expr === '6.10') add('ULS', gT(set.gG).concat(sc(a, set.gQ), accT(ch, 0, set.gQ)), `6.10 · leading ${L.lab}: ${altLab(a)}`);
      else add('ULS', gT(set.xi * set.gG).concat(sc(a, set.gQ), accT(ch, 0, set.gQ)), `6.10b · leading ${L.lab}: ${altLab(a)}`);
      if (L.id === 'W') add('ULS', gT(set.gGinf).concat(sc(a, set.gQ)), `6.10 · G favourable, leading W: ${altLab(a)}`);
    }));
    if (set.expr !== '6.10') choices(groups.map(g => Object.assign({}, g, { opt: g.opt }))).forEach(ch => add('ULS', gT(set.gG).concat(accT(ch, 0, set.gQ)), '6.10a · all variable actions × ψ0'));
    // EQU - Table A1.2(A): 0.9 G(stb) + 1.5 W
    if (set.equ) groups.filter(g => g.id === 'W').forEach(L => L.alts.forEach(a => add('EQU', gT(0.9).concat(sc(a, set.gQ)), `EQU · overturning / uplift: ${altLab(a)}`)));
    // seismic design situation - EN 1990 6.4.3.4 and EN 1998-1 4.3.3.5.2
    const psi2Q = groups.filter(g => g.id[0] === 'Q' || g.id === 'S').flatMap(g => sc(g.alts[0], g.psi[2]));
    const EX = E.filter(u => A(u).dir !== 'Y'), EY = E.filter(u => A(u).dir === 'Y');
    const eT = (xs, f) => xs.map(u => [u.name, f]);
    const signs = xs => xs.some(u => !A(u).rs) ? [1, -1] : [1];   // static seismic patterns need ±; response spectra are envelopes already
    if (E.length) {
      const sets = EX.length && EY.length && set.e30 ? [[EX, 1, EY, 0.3], [EX, 0.3, EY, 1]] : [[EX, 1, [], 0], [EY, 1, [], 0]].filter(x => x[0].length);
      sets.forEach(([a, fa, b, fb]) => signs(a).forEach(sa => signs(b.length ? b : a).forEach(sb => {
        add('SEIS', gT(1).concat(psi2Q, eT(a, sa * fa), eT(b, sb * fb)), `G + ψ2·Q + ${fa === 1 ? '' : fa + '·'}E${A(a[0]).dir || 'X'}${b.length ? ` + ${fb === 1 ? '' : fb + '·'}E${A(b[0]).dir}` : ''}`);
      })));
    }
    // SLS - EN 1990 6.5.3
    if (!groups.length) add('SLS-CHAR', gT(1), 'permanent only');
    groups.forEach(L => lead(L, (a, ch) => {
      add('SLS-CHAR', gT(1).concat(sc(a, 1), accT(ch, 0, 1)), `characteristic · leading ${L.lab}: ${altLab(a)}`);
      add('SLS-FREQ', gT(1).concat(sc(a, L.psi[1]), accT(ch, 2, 1)), `frequent · leading ${L.lab}: ${altLab(a)}`);
    }));
    add('SLS-QP', gT(1).concat(groups.flatMap(g => sc(g.alts[0], g.psi[2]))), 'quasi-permanent');
    if (set.slsW) ws.forEach(u => (set.windBoth ? [1, -1] : [1]).forEach(sg => add('SLS-W', [[u.name, sg]], `wind only, for drift: ${sg < 0 ? '−' : ''}${u.name}`)));

    // imperfections: notional loads with every ULS combination (EN 1992-1-1 5.2, EN 1993-1-1 5.3.2)
    const N = set.notional ? on.filter(u => A(u).k === 'N') : [];
    if (N.length) {
      const nOf = (base, dir) => N.find(u => A(u).base === base && (A(u).dir || 'X') === dir);
      const dirs = ['X', 'Y'].filter(d => N.some(u => (A(u).dir || 'X') === d));
      const kOf = n => (A(us.find(u => u.name === n) || { name: n }) || {}).k;
      const res = [];
      out.forEach(c => {
        if (c.kind !== 'ULS') return res.push(c);
        const grav = c.items.filter(([n]) => ['G', 'Q'].includes(kOf(n)));
        const w = c.items.find(([n]) => kOf(n) === 'W');
        const variants = w ? [[A(us.find(u => u.name === w[0])).dir || 'X', Math.sign(w[1])]] : dirs.flatMap(d => [[d, 1], [d, -1]]);
        variants.forEach(([d, sg]) => {
          const extra = grav.map(([n, f]) => { const nu = nOf(n, d); return nu ? [nu.name, r3(f * sg)] : null; }).filter(Boolean);
          res.push(Object.assign({}, c, { items: c.items.concat(extra), note: c.note + (extra.length ? ` · imperfection ${sg < 0 ? '−' : '+'}${d}` : '') }));
        });
      });
      out.length = 0; res.forEach(c => out.push(c));
    }
    // names, then envelopes
    const cnt = {};
    out.forEach(c => { cnt[c.kind] = (cnt[c.kind] || 0) + 1; c.name = `${set.prefix}${c.kind} ${String(cnt[c.kind]).padStart(2, '0')}`; c.type = 0; c.items = c.items.map(([n, f]) => [n, f, false]); });
    const env = (nm, kinds, note) => { const xs = out.filter(c => kinds.includes(c.kind) && c.type === 0); if (xs.length > 1) out.push({ kind: 'ENV', name: set.prefix + 'ENV-' + nm, type: 1, items: xs.map(c => [c.name, 1, true]), note }); };
    env('ULS', ['ULS'], 'envelope of the ULS combinations');
    env('SEIS', ['SEIS'], 'envelope of the seismic combinations');
    env('DESIGN', ['ULS', 'SEIS'], 'design envelope ULS + seismic');
    env('SLS-CHAR', ['SLS-CHAR'], 'envelope SLS characteristic');
    return out;
  }
  const expr = c => c.items.map(([n, f, isC], i) => `${f < 0 ? '− ' : i ? '+ ' : ''}${Math.abs(f) === 1 ? '' : api.fmt(Math.abs(f), 3).replace(/\.?0+$/, '') + '·'}${esc(n)}${isC ? '' : ''}`).join(' ');

  /* ---------- state of the link ---------- */
  const STD = [['Dead', 1, 1], ['SDL', 2, 0], ['Live', 3, 0], ['Roof Live', 11, 0], ['Wind X', 6, 0], ['Wind Y', 6, 0]];
  /* demo model for the preview without ETABS: one managed combination out of date and one no longer generated */
  const DEMO_MODEL = {
    patterns: [{ name: 'Dead', type: 1, sw: 1 }, { name: 'SDL', type: 2, sw: 0 }, { name: 'Live', type: 3, sw: 0 }, { name: 'Wind X', type: 6, sw: 0 }, { name: 'Wind Y', type: 6, sw: 0 }],
    cases: [{ name: 'Dead', type: 1 }, { name: 'SDL', type: 1 }, { name: 'Live', type: 1 }, { name: 'Wind X', type: 1 }, { name: 'Wind Y', type: 1 }, { name: 'Modal', type: 3 }, { name: 'EQX RS', type: 4 }, { name: 'EQY RS', type: 4 }, { name: 'Buckling', type: 10 }],
    combos: [{ name: 'ULS1 1.35G+1.5Q', type: 0, items: [['Dead', 1.35, false], ['Live', 1.5, false]] }, { name: 'SLS-QP G+0.3Q', type: 0, items: [['Dead', 1, false], ['Live', 0.3, false]] },
      { name: 'CS-ULS 01', type: 0, items: [['Dead', 1.35, false], ['Live', 1.5, false]] }, { name: 'CS-OLD 01', type: 0, items: [['Dead', 1, false], ['Wind X', 1.5, false]] }],
    locked: true
  };
  const S = { model: null, busy: '', err: '', locked: false, last: '', sig: '', tab: 'combos', filter: 'all', demo: false };
  let pollT = null;
  const live = () => EC.etabs.live;
  const defaults = m => { const L = P(); units(m).forEach(u => { if (!L.act[u.name]) L.act[u.name] = guess(u, L.set); }); };
  async function readModel() {
    const m = await live().get('/loads');
    S.model = m; S.locked = m.locked; S.demo = false;
    defaults(m);
    return m;
  }
  const sigOf = m => JSON.stringify([m.patterns.map(p => [p.name, p.type]), m.cases.map(c => [c.name, c.type])]);
  const managed = () => (S.model ? S.model.combos.filter(c => c.name.startsWith(P().set.prefix)) : []);
  /* the plan: missing standard patterns (when asked) and the model as it will be after writing */
  function planned() {
    const L = P(); if (!S.model) return [];
    const std = L.set.std ? STD.filter(([n]) => !S.model.patterns.some(p => p.name === n)).map(([name, type, sw]) => ({ name, type, sw, planned: true })) : [];
    if (!L.set.notional) return std;
    // one notional pattern per gravity pattern and direction: "N <pattern> X|Y", base = that pattern
    const all = S.model.patterns.concat(std), have = new Set(all.map(p => p.name));
    const grav = all.filter(p => p.type !== 12 && ['G', 'Q'].includes((L.act[p.name] || guess({ name: p.name, type: p.type, src: 'pattern' }, L.set)).k));
    const nn = grav.flatMap(p => ['X', 'Y'].map(d => ({ name: `N ${p.name} ${d}`, type: 12, sw: 0, planned: true, base: p.name, dir: d }))).filter(p => !have.has(p.name));
    nn.forEach(p => { L.act[p.name] = { k: 'N', base: p.base, dir: p.dir }; });
    return std.concat(nn);
  }
  /* notional patterns to (re)define in ETABS: base pattern, ratio θi, direction */
  function notionalDefs(after) {
    const L = P(); if (!L.set.notional) return [];
    const t = theta(nHeight(), L.set.nM).th;
    return after.patterns.filter(p => (L.act[p.name] || {}).k === 'N').map(p => ({ name: p.name, base: L.act[p.name].base, dir: L.act[p.name].dir || 'X', ratio: t }));
  }
  const rsSig = () => JSON.stringify([live().L.st && live().L.st.file, spectrumDef()]);
  function spectrumDef() {
    const s = P().set, sp = spectrum(s);
    return { func: s.rsFunc, T: sp.T, v: sp.v, damp: 0.05, sf: 9.80665, modal: s.rsModal, ecc: s.ecc, cases: [[s.rsX, 'U1'], [s.rsY, 'U2']].filter(([n]) => n).map(([name, dir]) => ({ name, dir })) };
  }
  /* height of the structure: the input, else the top of the building read on Building checks */
  function nHeight() {
    const L = P(); if (+L.set.nH > 0) return +L.set.nH;
    const b = api.proj().building, st = b && b.data && b.data.stories;
    return st && st.length ? Math.max(...st.map(x => x.elev)) - Math.min(...st.map(x => x.elev - x.h)) : 0;
  }
  function plan() {
    const pl = planned(), m = S.model;
    const L0 = P(), rsc = L0.set.rs ? [[L0.set.rsX, 'X'], [L0.set.rsY, 'Y']].filter(([n]) => n) : [];
    rsc.forEach(([n, d]) => { L0.act[n] = { k: 'E', dir: d, rs: true }; });
    const newRS = rsc.filter(([n]) => !m.cases.some(c => c.name === n)).map(([name]) => ({ name, type: 4, planned: true, rsdef: true }));
    const cases = m.cases.map(c => (rsc.some(([n]) => n === c.name) ? Object.assign({}, c, { rsdef: true }) : c));
    const after = { patterns: m.patterns.concat(pl), cases: cases.concat(pl.map(p => ({ name: p.name, type: 1, planned: true })), newRS), combos: m.combos };
    defaults(after);
    const L = P(), gen = generate(units(after), L.act, L.set);
    return { pl, after, gen, diff: diff(gen), nRS: rsc.length, newRS: newRS.length };
  }
  const norm = items => JSON.stringify(items.map(i => [i[0], Math.round(i[1] * 1000) / 1000, !!i[2]]).sort((a, b) => (a[0] + a[2]).localeCompare(b[0] + b[2])));
  /* combination by combination: what writing will do to ETABS */
  function diff(gen) {
    const pre = P().set.prefix, old = new Map(managed().map(c => [c.name, c])), rows = [];
    gen.forEach(c => { const o = old.get(c.name); rows.push({ st: !o ? 'new' : norm(o.items) === norm(c.items) && (o.type || 0) === c.type ? 'same' : 'changed', c, o }); });
    managed().filter(o => !gen.some(c => c.name === o.name)).forEach(o => rows.push({ st: 'removed', c: o, o }));
    S.model.combos.filter(o => !o.name.startsWith(pre)).forEach(o => rows.push({ st: 'kept', c: o, o }));
    const n = rows.reduce((a, r) => (a[r.st] = (a[r.st] || 0) + 1, a), {});
    return { rows, n, upToDate: !n.new && !n.changed && !n.removed };
  }
  async function apply(unlock, withPatterns) {
    const L = P(), p = plan();
    const r = await live().post('/loads/apply', { prefix: L.set.prefix, patterns: withPatterns ? p.pl.map(({ name, type, sw }) => ({ name, type, sw })) : [], combos: p.gen.map(c => ({ name: c.name, type: c.type, items: c.items })), unlock: !!unlock, notional: notionalDefs(p.after), notional_run: !!withPatterns, spectrum: withPatterns && L.set.rs ? spectrumDef() : undefined });
    S.rsmsg = r.spectrum && r.spectrum.warnings && r.spectrum.warnings.length ? r.spectrum.warnings.join('; ') : '';
    if (r.spectrum) L.rsSig = rsSig();   // ETABS cannot report the function back: remember what was written to this model
    const nr = r.notional || {};
    S.nmsg = nr.error || nr.manual || '';
    if (nr.mode === 'table') S.ninfo = `Notional loads set in ETABS: ${nr.set} notional pattern(s) with base pattern, ratio θ<sub>i</sub> and direction.`;
    else if (nr.mode === 'forces') S.ninfo = `ETABS has no editable notional-load table, so the link applied the notional loads itself: a gravity analysis gave each floor's load N per base pattern, and H<sub>i</sub> = θ<sub>i</sub>·N was put on the ${nr.stories} storeys as horizontal joint loads (${nr.set} pattern(s), ${nr.joints} joint loads). Run the analysis again; write again after changing the gravity loads.`;
    else if (nr.pending && !S.ninfo) S.ninfo = 'The notional loads are applied on the next Write to ETABS.';
    await readModel(); S.sig = sigOf(S.model); S.last = new Date().toLocaleTimeString();
    return (r.patterns_created.length ? `${r.patterns_created.length} load pattern(s) created · ` : '') + `${r.combos} combination(s) written to ETABS`;
  }
  /* auto-update: watch the ETABS model; regenerate when the load patterns / cases change (never creates patterns) */
  async function poll() {
    clearTimeout(pollT); pollT = null;
    if (!live().L.st || S.demo || !/^#\/?loads\b/.test(location.hash)) return;
    if (!S.busy) {
      try {
        const before = S.sig; await readModel(); const now = sigOf(S.model);
        if (P().set.auto && before && now !== before) {
          S.sig = now;
          const L = P(), gen = generate(units(S.model), L.act, L.set);
          if (!diff(gen).upToDate && !S.locked) { S.busy = 'auto'; try { const m = await apply(false, false); api.toast('Building modified in ETABS · ' + m); } finally { S.busy = ''; } }
          api.save(); api.render();
        } else if (!before) { S.sig = now; }
      } catch (e) { /* link down: the page shows it on the next action */ }
    }
    pollT = setTimeout(poll, 4000);
  }

  /* ---------- page ---------- */
  const STL = { new: 'New', changed: 'Changed', removed: 'Removed', same: 'Unchanged', kept: 'Yours · kept', exist: 'In ETABS' };
  const pill = st => `<span class="ld-st ${st}">${STL[st]}</span>`;
  function view() {
    const ic = api.ic, L = P(), s = L.set, ln = live().L;
    const head = `<div class="page-head"><div><div class="tool-tag">${ic('upload')}Design with ETABS link</div><h1>Loads &amp; combinations</h1><div class="sub">Create load patterns, assign slab loads and generate the EN 1990 load combinations in ETABS · preview every change before it is written · rebuilt automatically when the building changes</div></div></div>`;
    if (!ln.st && !S.demo) return head + `<div class="card etabs-live"><div class="etabs-hero">${ic('upload')}<div><b>Connect to ETABS</b><small>The load patterns and cases of the open model are read; the preview shows every pattern and combination before anything is written. No ETABS at hand? Preview with a demo model.</small></div><span class="etabs-hbtn"><button class="btn" data-ld="demo">${ic('layers')}Preview with demo model</button><button class="btn primary" data-ld="connect">${ic('check')}Connect to ETABS…</button></span></div></div>`;
    if (!S.model) return head + `<div class="card"><div class="empty">${S.err ? esc(S.err) : 'Reading the load patterns from ETABS…'}</div></div>`;
    const P0 = plan(), D = P0.diff, us = units(P0.after), gen = P0.gen, nPl = P0.pl.length, pre = s.prefix;
    const writeN = (D.n.new || 0) + (D.n.changed || 0) + (D.n.removed || 0);
    const sel = (k, opts, v) => `<select class="ctl" data-ldset="${k}">${opts.map(([val, l]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const chk = (k, l) => `<label class="ld-chk"><input type="checkbox" data-ldset="${k}" ${s[k] ? 'checked' : ''}>${l}</label>`;
    const num = (k, l, step) => `<label class="bc-in"><span>${l}</span><input class="ctl" type="number" step="${step}" data-ldset="${k}" value="${esc(s[k])}"></label>`;
    const rsDue = s.rs && (P0.newRS > 0 || L.rsSig !== rsSig());
    const nRS = S.demo || !rsDue ? 0 : P0.nRS;   // response-spectrum cases (re)defined on a manual write
    const upToDate = D.upToDate && !nPl && !nRS;
    const lockMsg = S.locked && !S.demo ? `<div class="etabs-msg info" style="margin:0 16px 12px">The ETABS model is analysed (locked). Writing unlocks it and <b>deletes the analysis results</b> - run the analysis again afterwards.</div>` : '';
    const summary = [nPl ? `${nPl} load pattern${nPl > 1 ? 's' : ''} new` : '', rsDue ? `spectrum ${s.rsFunc} + ${P0.nRS} response-spectrum case${P0.nRS > 1 ? 's' : ''} (${P0.newRS} new)` : '', D.n.new ? `${D.n.new} combination${D.n.new > 1 ? 's' : ''} new` : '', D.n.changed ? `${D.n.changed} changed` : '', D.n.removed ? `${D.n.removed} removed` : '', D.n.same ? `${D.n.same} unchanged` : ''].filter(Boolean).join(' · ');

    const status = `<div class="card etabs-live ${S.demo ? '' : 'on'}"><div class="card-h"><b>${S.demo ? `${ic('layers')}Demo model (preview only)` : `<i class="dot"></i>${esc(String(ln.st.file).split(/[\\/]/).pop())}`}</b><small>${S.model.patterns.length} load patterns · ${S.model.cases.length} load cases · ${S.model.combos.length} combinations (${managed().length} managed “${esc(pre)}”)${S.last ? ' · last written ' + S.last : ''}</small>${S.demo ? `<span class="etabs-hbtn"><button class="btn sm primary" data-ld="connect">Connect to ETABS…</button></span>` : ''}</div>
      ${lockMsg}${S.err ? `<div class="etabs-msg" style="margin:0 16px 12px">${esc(S.err)}</div>` : ''}
      <div class="ld-sum"><b>${upToDate ? '✓ ETABS is up to date' : 'Writing will:'}</b> ${upToDate ? `${gen.length} combinations match the rules` : esc(summary)}</div>
      <div class="etabs-btns" style="padding:0 16px 14px"><button class="btn primary" data-ld="apply" ${S.busy || upToDate || S.demo ? 'disabled' : ''}>${ic('check')}${S.busy === 'apply' ? 'Writing to ETABS…' : upToDate ? 'Up to date' : S.demo ? 'Connect to ETABS to write' : `Write to ETABS (${[nPl ? nPl + (nPl > 1 ? ' patterns' : ' pattern') : '', nRS ? 'spectrum' : '', writeN ? writeN + (writeN > 1 ? ' combination changes' : ' combination change') : ''].filter(Boolean).join(', ')})`}</button>
        <label class="ld-chk ld-auto"><input type="checkbox" data-ldset="auto" ${s.auto ? 'checked' : ''} ${S.demo ? 'disabled' : ''}><span><b>Auto-update</b> · rebuild the combinations when the building's loads change in ETABS or a rule changes here (never creates or deletes load patterns)</span></label></div></div>`;

    // preview tabs
    const tabs = [['patterns', 'Load patterns', P0.after.patterns.length, nPl], ['cases', 'Load cases', P0.after.cases.length, nPl], ['combos', 'Load combinations', gen.length, writeN]];
    const tabBar = `<div class="tabs ld-tabs">${tabs.map(([k, l, n, ch]) => `<button class="${S.tab === k ? 'active' : ''}" data-ldtab="${k}">${l}<span class="badge">${n}</span>${ch ? `<span class="badge ld-ch">${ch} to write</span>` : ''}</button>`).join('')}</div>`;
    const actCell = u => { const a = L.act[u.name] || { k: 'off' };
      return `<td><select class="ctl" data-ldk="${esc(u.name)}">${Object.keys(KIND).map(k => `<option value="${k}" ${a.k === k ? 'selected' : ''}>${KIND[k]}</option>`).join('')}</select></td>
        <td>${a.k === 'N' ? `<small>θ<sub>i</sub> × <b>${esc(a.base || '?')}</b> · ${esc(a.dir || 'X')}</small>` : a.k === 'Q' ? `<select class="ctl" data-ldcat="${esc(u.name)}">${Object.keys(CATS).map(c => `<option value="${c}" ${(a.cat || s.cat) === c ? 'selected' : ''}>${CATS[c][0]}</option>`).join('')}</select>` : a.k === 'W' || a.k === 'E' ? `<select class="ctl" data-lddir="${esc(u.name)}">${['X', 'Y'].map(d => `<option ${a.dir === d ? 'selected' : ''}>${d}</option>`).join('')}</select>${a.k === 'E' ? ` <small class="muted">${u.type === 4 ? 'response spectrum' : 'static ±'}</small>` : ''}` : ''}</td>`; };
    const psiOf = u => { const a = L.act[u.name] || { k: 'off' }; const p = a.k === 'Q' ? CATS[a.cat || s.cat].slice(1) : PSI[a.k]; return p ? p.join(' · ') : '–'; };
    let body = '';
    if (S.tab === 'patterns') {
      body = `<div class="ld-chks" style="padding-top:4px">${chk('std', 'Create the missing standard patterns: Dead (self-weight 1.0), SDL, Live, Roof Live, Wind X, Wind Y')}</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Status</th><th>Load pattern</th><th>ETABS type</th><th class="num">Self-weight</th><th>Action</th><th>Category / direction</th><th class="num">ψ0 · ψ1 · ψ2</th></tr></thead><tbody>
        ${P0.after.patterns.map(p => { const u = us.find(x => x.name === p.name && x.src === 'pattern') || { name: p.name, type: p.type };
          return `<tr class="${p.planned ? 'ld-new' : ''}"><td>${pill(p.planned ? 'new' : 'exist')}</td><td class="mark">${esc(p.name)}</td><td><small>${esc(PT[p.type] || 'Pattern')}</small></td><td class="num">${p.sw ? p.sw : '–'}</td>${actCell(u)}<td class="num">${psiOf(u)}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="muted bc-pad" style="padding-top:10px">A new pattern gets its linear static load case automatically. Define the wind loads of Wind X / Wind Y in ETABS (auto lateral loads, EN 1991-1-4).</p>`;
    } else if (S.tab === 'cases') {
      const pn = new Set(P0.after.patterns.map(p => p.name));
      body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Status</th><th>Load case</th><th>Case type</th><th>From</th><th>Action</th><th>Category / direction</th><th class="num">ψ0 · ψ1 · ψ2</th></tr></thead><tbody>
        ${P0.after.cases.map(c => { const own = pn.has(c.name); const u = us.find(x => x.name === c.name) || { name: c.name, type: c.type };
          return `<tr class="${c.planned ? 'ld-new' : ''}"><td>${pill(c.planned ? 'new' : c.rsdef && rsDue ? 'changed' : 'exist')}</td><td class="mark">${esc(c.name)}</td><td><small>${esc(CT[c.type] || 'Load case')}</small></td><td><small>${own ? 'its load pattern' : c.rsdef ? `spectrum ${esc(s.rsFunc)} × g · ${(L.act[c.name] || {}).dir === 'Y' ? 'U2' : 'U1'} · CQC · e = ${s.ecc}` : 'load case'}</small></td>${own ? `<td colspan="2"><small class="muted">action set on its load pattern: ${esc(KIND[(L.act[c.name] || { k: 'off' }).k])}</small></td><td class="num">${psiOf(u)}</td>` : `${actCell(u)}<td class="num">${psiOf(u)}</td>`}</tr>`; }).join('')}</tbody></table></div>
        <p class="muted bc-pad" style="padding-top:10px">Combinations use the load cases. Response-spectrum cases (EQX / EQY) enter the seismic combinations; modal and buckling cases are analysis cases and are not combined.</p>`;
    } else {
      const F = ['all', 'new', 'changed', 'removed', 'same', 'kept'];
      const rows = D.rows.filter(r => S.filter === 'all' || r.st === S.filter);
      const ex = (c) => c.type === 1 ? `<small>Envelope of ${c.items.length} combinations</small>` : expr(c);
      body = `<div class="ld-filter etabs-combos">${F.map(f => `<button class="cmb ${S.filter === f ? 'uls' : 'off'}" data-ldf="${f}">${f === 'all' ? 'All' : STL[f]}<span>${f === 'all' ? D.rows.length : D.n[f] || 0}</span></button>`).join('')}</div>
        <div class="tbl-wrap"><table class="tbl ld-tbl"><thead><tr><th>Status</th><th>Name</th><th>Combination</th><th>Rule</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="ld-${r.st}"><td>${pill(r.st)}</td><td class="mark" style="white-space:nowrap">${esc(r.c.name)}</td>
          <td>${r.st === 'removed' ? `<s>${ex(r.o)}</s>` : ex(r.c)}${r.st === 'changed' ? `<div class="ld-was">was: ${ex(r.o)}</div>` : ''}</td>
          <td><small>${r.st === 'kept' ? 'your own combination - not touched' : r.st === 'removed' ? 'no longer generated by the rules - will be deleted' : esc(r.c.note || '')}</small></td></tr>`).join('') || `<tr><td colspan="4" class="empty">No combination with this status</td></tr>`}</tbody></table></div>`;
    }
    const prev = `<div class="card"><div class="card-h"><b>Preview</b><small>what ETABS will contain after writing · actions are read from the ETABS types - change them here</small></div>${tabBar}${body}</div>`;

    const opts = `<div class="card"><div class="card-h"><b>Combination rules</b><small>EN 1990 Annex A1 · recommended values - check your National Annex</small></div><div class="bc-inputs">
      <label class="bc-in"><span>ULS expression</span>${sel('expr', [['6.10', '6.10 · γG·G + γQ·Q1 + γQ·ψ0·Qi'], ['6.10ab', '6.10a / 6.10b · ξ = ' + s.xi]], s.expr)}</label>
      ${num('gG', 'γ<sub>G,sup</sub>', '0.05')}${num('gGinf', 'γ<sub>G,inf</sub>', '0.05')}${num('gQ', 'γ<sub>Q</sub>', '0.05')}${s.expr !== '6.10' ? num('xi', 'ξ (6.10b)', '0.01') : ''}
      <label class="bc-in"><span>Default imposed-load category</span>${sel('cat', Object.keys(CATS).map(c => [c, CATS[c][0]]), s.cat)}</label>
      <label class="bc-in"><span>Managed-combination prefix</span><input class="ctl" data-ldset="prefix" value="${esc(pre)}"></label></div>
      <div class="ld-chks">${chk('windBoth', 'Wind in both senses (±)')}${chk('e30', 'Seismic 100 % + 30 % (EN 1998-1 4.3.3.5.2)')}${chk('equ', 'EQU combinations 0.9 G + 1.5 W (Table A1.2(A))')}${chk('slsW', 'Wind-only SLS combinations for drift')}</div></div>`;

    const loadsCard = `<div class="card"><div class="card-h"><b>Slab loads</b><small>uniform area loads (gravity) on the floor slabs selected in ETABS · imposed loads from EN 1991-1-1 Table 6.2</small></div><div class="bc-inputs">
      ${num('sdl', 'SDL - finishes, services, partitions (kN/m²)', '0.1')}
      <label class="bc-in"><span>Imposed load q<sub>k</sub> (kN/m²) for category</span><select class="ctl" id="ldCat">${Object.keys(CATS).map(c => `<option value="${c}" ${s.cat === c ? 'selected' : ''}>${CATS[c][0]} · ${L.qk[c]} kN/m²</option>`).join('')}</select></label>
      <label class="bc-in"><span>SDL pattern</span><select class="ctl" id="ldSdlPat">${S.model.patterns.map(p => `<option ${/SDL|super/i.test(p.name) || p.type === 2 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="bc-in"><span>Imposed-load pattern</span><select class="ctl" id="ldQPat">${S.model.patterns.map(p => `<option ${p.type === 3 || p.type === 4 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
      <div class="etabs-btns" style="padding:0 16px 14px"><button class="btn" data-ld="assign" ${S.busy || S.demo ? 'disabled' : ''}>${ic('download')}Assign to the slabs selected in ETABS</button><small class="muted">Select floor slabs in the ETABS window first (walls are skipped). Replaces the previous value of these two patterns on those slabs.</small></div></div>`;
    const H = nHeight(), T = theta(H, s.nM), nN = P0.after.patterns.filter(p => (L.act[p.name] || {}).k === 'N').length;
    const impCard = `<div class="card"><div class="card-h"><b>Imperfections - notional loads</b><small>EN 1992-1-1 5.2 · EN 1993-1-1 5.3.2 · θ<sub>i</sub> = θ<sub>0</sub>·α<sub>h</sub>·α<sub>m</sub></small></div>
      <div class="ld-chks" style="padding-top:2px">${chk('notional', 'Add notional loads to every ULS combination (one notional pattern per gravity pattern and direction, factored like its base pattern)')}</div>
      ${s.notional ? `<div class="bc-inputs">
        <label class="bc-in"><span>Height of the structure l (m)</span><input class="ctl" type="number" step="0.1" data-ldset="nH" value="${esc(s.nH || '')}" placeholder="${H ? api.fmt(H, 1) + ' from Building checks' : 'enter'}"><small>${+s.nH > 0 ? 'input' : H ? 'from the storeys read on Building checks' : 'enter the height'}</small></label>
        <label class="bc-in"><span>m - vertical members contributing</span><input class="ctl" type="number" step="1" min="1" data-ldset="nM" value="${esc(s.nM)}"><small>EC2: members carrying ≥ 50 % of the average load · EC3: columns in a row with N ≥ 50 % of the average</small></label></div>
        <div class="bc-verdict ok">α<sub>h</sub> = 2/√${api.fmt(H, 1)} = <b>${api.fmt(T.ah, 3)}</b> (2/3 … 1) · α<sub>m</sub> = √(0.5·(1 + 1/${s.nM})) = <b>${api.fmt(T.am, 3)}</b> · θ<sub>i</sub> = α<sub>h</sub>·α<sub>m</sub>/200 = <b>${api.fmt(T.th, 5)}</b> = 1/${api.fmt(1 / T.th, 0)}
          <br>Notional force at each floor H<sub>i</sub> = θ<sub>i</sub>·N<sub>Ed</sub> of the floor, in ±X and ±Y; with leading or accompanying wind it acts in the wind's direction (${nN} notional pattern${nN === 1 ? '' : 's'}).</div>
        ${S.ninfo ? `<div class="etabs-msg info ld-ok" style="margin:0 16px 12px">${S.ninfo}</div>` : ''}${S.nmsg ? `<div class="etabs-msg" style="margin:0 16px 12px">Notional loads: ${esc(S.nmsg)}</div>` : ''}
        <p class="muted bc-pad">EN 1993-1-1 5.3.2(4): sway imperfections may be neglected when H<sub>Ed</sub> ≥ 0.15·V<sub>Ed</sub> (e.g. with wind); EN 1992-1-1 5.2(6): for a bracing system l = height of the building and m = number of vertical members contributing. Notional loads are not used in the seismic combinations.</p>` : ''}</div>`;
    const SP = spectrum(s), ICL = [[0.8, 'I'], [1.0, 'II'], [1.2, 'III'], [1.4, 'IV']];
    const tmax = 4, pts = SP.T.filter(t => t <= tmax), ymax = Math.max(...SP.v) * 1.1;
    const chart = EC.mrender ? EC.mrender.plot({ tr: [{ y: ['v', 'Y_Design spectrum Sd/g'] }, { y: ['v', 'Y_Lower bound β·ag/g'] }, { y: ['v', 'Y_TB'] }, { y: ['v', 'Y_TC'] }, { y: ['v', 'Y_TD'] }] },
      { tr: [{ x: pts, y: pts.map(t => SP.sd(t)), xu: ['u', 's'], ls: 'Solid' }, { x: [0, tmax], y: [s.beta * SP.ag, s.beta * SP.ag], ls: 'Dash' },
        { x: [SP.TB, SP.TB], y: [0, ymax], ls: 'Dash' }, { x: [SP.TC, SP.TC], y: [0, ymax], ls: 'Dash' }, { x: [SP.TD, SP.TD], y: [0, ymax], ls: 'Dash' }] }, {}) : '';
    const rsCard = `<div class="card"><div class="card-h"><b>Seismic design spectrum</b><small>EN 1998-1 3.2.2.5(4) · written to ETABS as a response-spectrum function with the EX / EY cases</small></div>
      <div class="ld-chks" style="padding-top:2px">${chk('rs', `Create / update the spectrum function “${esc(s.rsFunc)}” and the response-spectrum cases ${esc(s.rsX)} (U1) and ${esc(s.rsY)} (U2) on the next write`)}</div>
      ${s.rs ? `<div class="bc-inputs">
        ${num('agR', 'a<sub>gR</sub> reference ground acceleration (× g)', '0.01')}
        <label class="bc-in"><span>Importance class γ<sub>I</sub> (EN 1998-1 4.2.5)</span>${sel('gI', ICL.map(([v, c]) => [v, `${c} · γI = ${v}`]), s.gI)}</label>
        <label class="bc-in"><span>Ground type (Table 3.1)</span>${sel('ground', ['A', 'B', 'C', 'D', 'E'].map(g => [g, g]), s.ground)}</label>
        <label class="bc-in"><span>Spectrum type</span>${sel('stype', [[1, 'Type 1 · Ms > 5.5'], [2, 'Type 2 · Ms ≤ 5.5']], s.stype)}</label>
        ${num('q', 'q behaviour factor', '0.1')}${num('beta', 'β lower-bound factor', '0.05')}${num('ecc', 'Accidental eccentricity (4.3.2)', '0.01')}
        <label class="bc-in"><span>Modal case used</span><input class="ctl" data-ldset="rsModal" value="${esc(s.rsModal)}"></label></div>
        <div class="bc-verdict ok">a<sub>g</sub> = γ<sub>I</sub>·a<sub>gR</sub> = <b>${api.fmt(SP.ag, 3)} g</b> · S = ${SP.S} · T<sub>B</sub> = ${SP.TB} s · T<sub>C</sub> = ${SP.TC} s · T<sub>D</sub> = ${SP.TD} s · plateau a<sub>g</sub>·S·2.5/q = <b>${api.fmt(SP.plateau, 4)} g</b> · lower bound β·a<sub>g</sub> = ${api.fmt(s.beta * SP.ag, 4)} g</div>
        <div class="ld-rs">${chart}</div>
        ${S.rsmsg ? `<div class="etabs-msg info" style="margin:0 16px 12px">Spectrum written, but ETABS did not take: ${esc(S.rsmsg)} - set these in the response-spectrum case.</div>` : ''}
        <p class="muted bc-pad">Function values are S<sub>d</sub>/g with 5 % damping (η is in q); the cases scale by g = 9.81 m/s², combine modes by CQC and directions by SRSS, and carry the accidental eccentricity ${s.ecc}·L (EN 1998-1 4.3.2). The seismic combinations (100 % + 30 %) use these cases.</p>` : ''}</div>`;
    return head + status + prev + opts + rsCard + impCard + loadsCard;
  }

  function mount(root) {
    const rer = () => api.render();
    if (live().L.st && (!S.model || S.demo) && !S.busy) { S.busy = 'read'; readModel().then(() => { S.busy = ''; S.err = ''; S.sig = sigOf(S.model); api.save(); rer(); }, e => { S.busy = ''; S.err = e.message; rer(); }); }
    if (live().L.st && !S.demo && !pollT) pollT = setTimeout(poll, 4000);
    const run = (k, f) => {
      if (S.busy) return; S.busy = k; S.err = ''; rer();
      f().then(m => { S.busy = ''; if (m) api.toast(m); api.save(); rer(); }, e => {
        S.busy = '';
        if (/^LOCKED/.test(e.message) && confirm('The ETABS model is analysed (locked).\n\nUnlock it and write the change? This deletes the analysis results; run the analysis again afterwards.')) return run(k, () => f(true));
        S.err = e.message.replace(/^LOCKED: /, ''); rer();
      });
    };
    const autoApply = () => { if (P().set.auto && S.model && !S.locked && !S.demo) run('apply', () => apply(false, false)); };
    root.onclick = ev => {
      const tb = ev.target.closest('[data-ldtab]'); if (tb) { S.tab = tb.dataset.ldtab; return rer(); }
      const fb = ev.target.closest('[data-ldf]'); if (fb) { S.filter = fb.dataset.ldf; return rer(); }
      const t = ev.target.closest('[data-ld]'); if (!t) return;
      const d = t.dataset.ld;
      if (d === 'connect') return live().connect(() => { S.model = null; S.demo = false; rer(); });
      if (d === 'demo') { S.model = JSON.parse(JSON.stringify(DEMO_MODEL)); S.locked = true; S.demo = true; defaults(S.model); return rer(); }
      if (d === 'apply') return run('apply', unlock => apply(unlock, true));
      if (d === 'assign') {
        const L = P(), cat = root.querySelector('#ldCat').value, sp = root.querySelector('#ldSdlPat').value, qp = root.querySelector('#ldQPat').value;
        return run('assign', async unlock => { const r = await live().post('/loads/assign', { items: [{ pattern: sp, value: +L.set.sdl }, { pattern: qp, value: +L.qk[cat] }], unlock: !!unlock }); return `${sp} ${L.set.sdl} kN/m² and ${qp} ${L.qk[cat]} kN/m² assigned to ${r.slabs} slab(s)`; });
      }
    };
    root.onchange = ev => {
      const t = ev.target, L = P();
      if (t.dataset.ldset !== undefined) { const k = t.dataset.ldset; L.set[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' || (t.tagName === 'SELECT' && t.value !== '' && !isNaN(+t.value)) ? +t.value : t.value; api.save(); rer(); if (k !== 'std' && (k !== 'auto' || t.checked)) autoApply(); return; }
      if (t.dataset.ldk !== undefined) { const a = L.act[t.dataset.ldk] = Object.assign({}, L.act[t.dataset.ldk], { k: t.value }); if (t.value === 'Q' && !a.cat) a.cat = L.set.cat; if ((t.value === 'W' || t.value === 'E') && !a.dir) a.dir = 'X'; api.save(); rer(); return autoApply(); }
      if (t.dataset.ldcat !== undefined) { L.act[t.dataset.ldcat].cat = t.value; api.save(); rer(); return autoApply(); }
      if (t.dataset.lddir !== undefined) { L.act[t.dataset.lddir].dir = t.value; api.save(); rer(); return autoApply(); }
    };
  }

  EC.loads = { install(a) { api = a; }, view, mount, _spectrum: spectrum, _generate: generate, _diff: diff, _state: S, _units: units, _guess: guess, CATS };
})();
