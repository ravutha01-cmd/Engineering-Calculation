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
  const KIND = { G: 'Permanent G', Q: 'Imposed Q', S: 'Snow S', W: 'Wind W', E: 'Seismic E', T: 'Temperature T', off: 'Not used' };
  const PT = { 1: 'Dead', 2: 'Super dead', 3: 'Live', 4: 'Reducible live', 5: 'Quake', 6: 'Wind', 7: 'Snow', 8: 'Other', 10: 'Temperature', 11: 'Roof live', 12: 'Notional' };
  const CT = { 1: 'Linear static', 3: 'Modal', 4: 'Response spectrum', 10: 'Buckling' };
  const DEF = { expr: '6.10', gG: 1.35, gGinf: 1.0, gQ: 1.5, xi: 0.85, cat: 'B', windBoth: true, e30: true, equ: true, slsW: true, prefix: 'CS-', auto: false, sdl: 1.5 };

  const P = () => { const p = api.proj(); p.loads = p.loads || {}; const L = p.loads; L.set = Object.assign({}, DEF, L.set || {}); L.act = L.act || {}; L.qk = Object.assign({}, QK, L.qk || {}); return L; };

  /* default action of an ETABS load pattern / case */
  function guess(u, set) {
    const dir = /Y/.test(u.name.replace(/[a-z]/g, '')) ? 'Y' : 'X';   // "Wind Y", "EQY RS", "EY" → Y
    if (u.src === 'case') return u.type === 4 ? { k: 'E', dir, rs: true } : { k: 'off' };
    return ({ 1: { k: 'G' }, 2: { k: 'G' }, 3: { k: 'Q', cat: set.cat }, 4: { k: 'Q', cat: set.cat }, 5: { k: 'E', dir }, 6: { k: 'W', dir }, 7: { k: 'S' }, 10: { k: 'T' }, 11: { k: 'Q', cat: 'H' } })[u.type] || { k: 'off' };
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
  const S = { model: null, busy: '', err: '', locked: false, last: '', sig: '' };
  let pollT = null;
  const live = () => EC.etabs.live;
  async function readModel() {
    const m = await live().get('/loads');
    S.model = m; S.locked = m.locked;
    const L = P();
    units(m).forEach(u => { if (!L.act[u.name]) L.act[u.name] = guess(u, L.set); });
    return m;
  }
  const sigOf = m => JSON.stringify([m.patterns.map(p => [p.name, p.type]), m.cases.map(c => [c.name, c.type])]);
  const managed = () => (S.model ? S.model.combos.filter(c => c.name.startsWith(P().set.prefix)) : []);
  const sameAsModel = gen => { const a = managed().map(c => c.name + JSON.stringify(c.items.map(i => [i[0], Math.round(i[1] * 1000) / 1000, !!i[2]]))).sort().join(), b = gen.map(c => c.name + JSON.stringify(c.items.map(i => [i[0], i[1], !!i[2]]))).sort().join(); return a === b; };
  async function apply(unlock) {
    const L = P(), gen = generate(units(S.model), L.act, L.set);
    const r = await live().post('/loads/apply', { prefix: L.set.prefix, patterns: [], combos: gen.map(c => ({ name: c.name, type: c.type, items: c.items })), unlock: !!unlock });
    await readModel(); S.sig = sigOf(S.model); S.last = new Date().toLocaleTimeString();
    return `${r.combos} combination(s) written to ETABS`;
  }
  /* auto-update: watch the ETABS model; regenerate when the load patterns / cases change */
  async function poll() {
    clearTimeout(pollT); pollT = null;
    if (!live().L.st || !/^#\/?loads\b/.test(location.hash)) return;
    if (!S.busy) {
      try {
        const before = S.sig; await readModel(); const now = sigOf(S.model);
        if (P().set.auto && before && now !== before) {
          S.sig = now;
          const gen = generate(units(S.model), P().act, P().set);
          if (!sameAsModel(gen) && !S.locked) { S.busy = 'auto'; try { const m = await apply(false); api.toast('Building modified in ETABS · ' + m); } finally { S.busy = ''; } }
          api.save(); api.render();
        } else if (!before) { S.sig = now; }
      } catch (e) { /* link down: the page shows it on the next action */ }
    }
    pollT = setTimeout(poll, 4000);
  }

  /* ---------- page ---------- */
  function view() {
    const ic = api.ic, L = P(), s = L.set, ln = live().L;
    const head = `<div class="page-head"><div><div class="tool-tag">${ic('upload')}Design with ETABS link</div><h1>Loads &amp; combinations</h1><div class="sub">Create load patterns, assign slab loads and generate the EN 1990 load combinations in ETABS · rebuilt automatically when the building changes</div></div></div>`;
    if (!ln.st) return head + `<div class="card etabs-live"><div class="etabs-hero">${ic('upload')}<div><b>Connect to ETABS</b><small>The load patterns of the open model are read, and the combinations are written back through the ETABS API.</small></div><button class="btn primary" data-ld="connect">${ic('check')}Connect to ETABS…</button></div></div>`;
    if (!S.model) return head + `<div class="card"><div class="empty">${S.err ? esc(S.err) : 'Reading the load patterns from ETABS…'}</div></div>`;
    const us = units(S.model), gen = generate(us, L.act, L.set), same = sameAsModel(gen), mine = managed();
    const kinds = gen.reduce((a, c) => (a[c.kind] = (a[c.kind] || 0) + 1, a), {});
    const lockMsg = S.locked ? `<div class="etabs-msg info" style="margin:0 16px 12px">The ETABS model is analysed (locked). Writing loads or combinations unlocks it and <b>deletes the analysis results</b> - run the analysis again afterwards.</div>` : '';
    const sel = (k, opts, v, extra) => `<select class="ctl" data-ldset="${k}" ${extra || ''}>${opts.map(([val, l]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const chk = (k, l) => `<label class="ld-chk"><input type="checkbox" data-ldset="${k}" ${s[k] ? 'checked' : ''}>${l}</label>`;
    const num = (k, l, step) => `<label class="bc-in"><span>${l}</span><input class="ctl" type="number" step="${step}" data-ldset="${k}" value="${esc(s[k])}"></label>`;

    const status = `<div class="card etabs-live on"><div class="card-h"><b><i class="dot"></i>${esc(String(ln.st.file).split(/[\\/]/).pop())}</b><small>${S.model.patterns.length} load patterns · ${S.model.cases.length} load cases · ${S.model.combos.length} combinations (${mine.length} managed “${esc(s.prefix)}”)${S.last ? ' · last written ' + S.last : ''}</small></div>
      ${lockMsg}${S.err ? `<div class="etabs-msg" style="margin:0 16px 12px">${esc(S.err)}</div>` : ''}
      <div class="etabs-btns" style="padding:0 16px 14px"><button class="btn primary" data-ld="apply" ${S.busy ? 'disabled' : ''}>${ic('check')}${S.busy === 'apply' ? 'Writing to ETABS…' : same ? `Combinations up to date (${gen.length})` : `${mine.length ? 'Update' : 'Create'} ${gen.length} combinations in ETABS`}</button>
        <label class="ld-chk ld-auto"><input type="checkbox" data-ldset="auto" ${s.auto ? 'checked' : ''}><span><b>Auto-update</b> · rebuild the combinations when the building's loads change in ETABS or a setting changes here</span></label>
        ${same ? '<span class="res ok">✓ ETABS matches</span>' : `<span class="res bad">${mine.length ? 'ETABS differs from the generated set' : 'not created yet'}</span>`}</div></div>`;

    const tbl = `<div class="card"><div class="card-h"><b>Load patterns and cases</b><small>the action each one represents · read from ETABS, guessed from its type - change where needed</small></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ETABS name</th><th>ETABS type</th><th>Action</th><th>Category / direction</th><th class="num">ψ0 · ψ1 · ψ2</th></tr></thead><tbody>
      ${us.map(u => { const a = L.act[u.name] || { k: 'off' }; const psi = a.k === 'Q' ? CATS[a.cat || s.cat].slice(1) : PSI[a.k];
        return `<tr><td class="mark">${esc(u.name)}${u.sw ? ` <small class="muted">self-weight × ${u.sw}</small>` : ''}</td><td><small>${esc(u.src === 'case' ? (CT[u.type] || 'Load case') : (PT[u.type] || 'Pattern'))}</small></td>
          <td><select class="ctl" data-ldk="${esc(u.name)}">${Object.keys(KIND).map(k => `<option value="${k}" ${a.k === k ? 'selected' : ''}>${KIND[k]}</option>`).join('')}</select></td>
          <td>${a.k === 'Q' ? `<select class="ctl" data-ldcat="${esc(u.name)}">${Object.keys(CATS).map(c => `<option value="${c}" ${(a.cat || s.cat) === c ? 'selected' : ''}>${CATS[c][0]}</option>`).join('')}</select>` : a.k === 'W' || a.k === 'E' ? `<select class="ctl" data-lddir="${esc(u.name)}">${['X', 'Y'].map(d => `<option ${a.dir === d ? 'selected' : ''}>${d}</option>`).join('')}</select>${a.k === 'E' ? ` <small class="muted">${u.type === 4 ? 'response spectrum' : 'static ±'}</small>` : ''}` : ''}</td>
          <td class="num">${psi ? psi.join(' · ') : '–'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="etabs-btns" style="padding:12px 16px 14px"><button class="btn" data-ld="std" ${S.busy ? 'disabled' : ''}>${ic('plus')}Create missing standard patterns</button><small class="muted">Dead (self-weight 1.0), SDL, Live, Roof Live, Wind X, Wind Y - existing ones are kept. Define the wind loads themselves in ETABS (auto lateral loads, EN 1991-1-4).</small></div></div>`;

    const opts = `<div class="card"><div class="card-h"><b>Combination rules</b><small>EN 1990 Annex A1 · recommended values - check your National Annex</small></div><div class="bc-inputs">
      <label class="bc-in"><span>ULS expression</span>${sel('expr', [['6.10', '6.10 · γG·G + γQ·Q1 + γQ·ψ0·Qi'], ['6.10ab', '6.10a / 6.10b · ξ = ' + s.xi]], s.expr)}</label>
      ${num('gG', 'γ<sub>G,sup</sub>', '0.05')}${num('gGinf', 'γ<sub>G,inf</sub>', '0.05')}${num('gQ', 'γ<sub>Q</sub>', '0.05')}${s.expr !== '6.10' ? num('xi', 'ξ (6.10b)', '0.01') : ''}
      <label class="bc-in"><span>Default imposed-load category</span>${sel('cat', Object.keys(CATS).map(c => [c, CATS[c][0]]), s.cat)}</label>
      <label class="bc-in"><span>Managed-combination prefix</span><input class="ctl" data-ldset="prefix" value="${esc(s.prefix)}"></label></div>
      <div class="ld-chks">${chk('windBoth', 'Wind in both senses (±)')}${chk('e30', 'Seismic 100 % + 30 % (EN 1998-1 4.3.3.5.2)')}${chk('equ', 'EQU combinations 0.9 G + 1.5 W (Table A1.2(A))')}${chk('slsW', 'Wind-only SLS combinations for drift')}</div></div>`;

    const loadsCard = `<div class="card"><div class="card-h"><b>Slab loads</b><small>uniform area loads (gravity) on the floor slabs selected in ETABS · imposed loads from EN 1991-1-1 Table 6.2</small></div><div class="bc-inputs">
      ${num('sdl', 'SDL - finishes, services, partitions (kN/m²)', '0.1')}
      <label class="bc-in"><span>Imposed load q<sub>k</sub> (kN/m²) for category</span><select class="ctl" id="ldCat">${Object.keys(CATS).map(c => `<option value="${c}" ${s.cat === c ? 'selected' : ''}>${CATS[c][0]} · ${L.qk[c]} kN/m²</option>`).join('')}</select></label>
      <label class="bc-in"><span>SDL pattern</span><select class="ctl" id="ldSdlPat">${S.model.patterns.map(p => `<option ${/SDL|super/i.test(p.name) || p.type === 2 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="bc-in"><span>Imposed-load pattern</span><select class="ctl" id="ldQPat">${S.model.patterns.map(p => `<option ${p.type === 3 || p.type === 4 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
      <div class="etabs-btns" style="padding:0 16px 14px"><button class="btn" data-ld="assign" ${S.busy ? 'disabled' : ''}>${ic('download')}Assign to the slabs selected in ETABS</button><small class="muted">Select floor slabs in the ETABS window first (walls are skipped). Replaces the previous value of these two patterns on those slabs.</small></div></div>`;

    const groups = ['ULS', 'EQU', 'SEIS', 'SLS-CHAR', 'SLS-FREQ', 'SLS-QP', 'SLS-W', 'ENV'];
    const prev = `<div class="card"><div class="card-h"><b>Generated combinations</b><small>${gen.length} combinations · ${groups.filter(k => kinds[k]).map(k => `${k} ${kinds[k]}`).join(' · ')}</small></div>
      <div class="tbl-wrap"><table class="tbl ld-tbl"><thead><tr><th>Name</th><th>Combination</th><th>Rule</th></tr></thead><tbody>
      ${gen.map(c => `<tr><td class="mark" style="white-space:nowrap">${esc(c.name)}</td><td>${c.type === 1 ? `<small>Envelope of ${c.items.length} combinations</small>` : expr(c)}</td><td><small>${esc(c.note || '')}</small></td></tr>`).join('')}</tbody></table></div></div>`;
    return head + status + tbl + opts + loadsCard + prev;
  }

  function mount(root) {
    const rer = () => api.render();
    if (live().L.st && !S.model && !S.busy) { S.busy = 'read'; readModel().then(() => { S.busy = ''; S.err = ''; S.sig = sigOf(S.model); api.save(); rer(); }, e => { S.busy = ''; S.err = e.message; rer(); }); }
    if (live().L.st && !pollT) pollT = setTimeout(poll, 4000);
    const run = (k, f) => {
      if (S.busy) return; S.busy = k; S.err = ''; rer();
      f().then(m => { S.busy = ''; if (m) api.toast(m); api.save(); rer(); }, e => {
        S.busy = '';
        if (/^LOCKED/.test(e.message) && confirm('The ETABS model is analysed (locked).\n\nUnlock it and write the change? This deletes the analysis results; run the analysis again afterwards.')) return run(k, () => f(true));
        S.err = e.message.replace(/^LOCKED: /, ''); rer();
      });
    };
    const autoApply = () => { if (P().set.auto && S.model && !S.locked) run('apply', () => apply(false)); };
    root.onclick = ev => {
      const t = ev.target.closest('[data-ld]'); if (!t) return;
      const d = t.dataset.ld;
      if (d === 'connect') return live().connect(() => { S.model = null; rer(); });
      if (d === 'apply') return run('apply', unlock => apply(unlock));
      if (d === 'std') return run('std', async unlock => {
        const want = [['Dead', 1, 1], ['SDL', 2, 0], ['Live', 3, 0], ['Roof Live', 11, 0], ['Wind X', 6, 0], ['Wind Y', 6, 0]];
        const have = new Set(S.model.patterns.map(p => p.name)), add = want.filter(w => !have.has(w[0]));
        if (!add.length) return 'All standard load patterns already exist';
        const L = P(), r = await live().post('/loads/apply', { prefix: L.set.prefix, patterns: add.map(([name, type, sw]) => ({ name, type, sw })), combos: managed().map(c => ({ name: c.name, type: c.type, items: c.items })), unlock: !!unlock });
        await readModel(); S.sig = sigOf(S.model);
        if (L.set.auto) await apply(false);
        return `${r.patterns_created.length} load pattern(s) created: ${r.patterns_created.join(', ')}`;
      });
      if (d === 'assign') {
        const L = P(), cat = root.querySelector('#ldCat').value, sp = root.querySelector('#ldSdlPat').value, qp = root.querySelector('#ldQPat').value;
        return run('assign', async unlock => { const r = await live().post('/loads/assign', { items: [{ pattern: sp, value: +L.set.sdl }, { pattern: qp, value: +L.qk[cat] }], unlock: !!unlock }); return `${sp} ${L.set.sdl} kN/m² and ${qp} ${L.qk[cat]} kN/m² assigned to ${r.slabs} slab(s)`; });
      }
    };
    root.onchange = ev => {
      const t = ev.target, L = P();
      if (t.dataset.ldset !== undefined) { const k = t.dataset.ldset; L.set[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value; api.save(); rer(); if (k !== 'auto' || t.checked) autoApply(); return; }
      if (t.dataset.ldk !== undefined) { const a = L.act[t.dataset.ldk] = Object.assign({}, L.act[t.dataset.ldk], { k: t.value }); if (t.value === 'Q' && !a.cat) a.cat = L.set.cat; if ((t.value === 'W' || t.value === 'E') && !a.dir) a.dir = 'X'; api.save(); rer(); return autoApply(); }
      if (t.dataset.ldcat !== undefined) { L.act[t.dataset.ldcat].cat = t.value; api.save(); rer(); return autoApply(); }
      if (t.dataset.lddir !== undefined) { L.act[t.dataset.lddir].dir = t.value; api.save(); rer(); return autoApply(); }
    };
  }

  EC.loads = { install(a) { api = a; }, view, mount, _generate: generate, _units: units, _guess: guess, CATS };
})();
