/* CAMBO STRUCT - Engineering Design web app (no build step, data kept in the browser) */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = EC.esc, fmt = EC.fmt;
  const KEY = 'cambo.ecw.v1';
  if (window.EC_EMBED) document.documentElement.classList.add('embed'); /* hosted preview: no print / file downloads */

  /* ---------------- icons ---------------- */
  const P = {
    dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    table: 'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16',
    gantt: 'M4 5h9M7 10h11M5 15h8M10 20h10M2 2v20',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
    plus: 'M12 5v14M5 12h14', download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
    copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
    back: 'M19 12H5M12 19l-7-7 7-7', menu: 'M3 6h18M3 12h18M3 18h18', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    beam: 'M2 9h20v6H2zM5 9v6M19 9v6', column: 'M8 2h8v20H8zM6 2h12M6 22h12', slab: 'M2 10l6-4h14l-6 4zM2 10v4h14v-4M16 14l6-4v-4',
    footing: 'M10 2h4v8h-4zM3 10h18v6H3zM2 20h20', pilecap: 'M3 6h18v6H3zM6 12v10M18 12v10M12 12v10', steel: 'M4 3h16M4 21h16M12 3v18M4 3v3M20 3v3M4 21v-3M20 21v-3', punch: 'M3 3h18v18H3zM9 9h6v6H9zM6 6h12v12H6z',
    detail: 'M4 4h10v6h6v10H4zM14 4l6 6', drop: 'M12 2.7 6.3 9.6a7 7 0 1 0 11.4 0z', geo: 'M2 20h20M2 15c3-2 5-2 8 0s5 2 8 0 3-1 4-1M2 10c3-2 5-2 8 0s5 2 8 0', wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
    undo: 'M3 7v6h6M3.5 13A9 9 0 1 0 6 6.3L3 9', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
  };
  const ic = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || P.layers}"/></svg>`;

  /* ---------------- domain ---------------- */
  const CATS = [
    { k: 'foundations', l: 'Foundations', icon: 'footing' },
    { k: 'columns', l: 'Columns & walls', icon: 'column' },
    { k: 'beams', l: 'Beams', icon: 'beam' },
    { k: 'slabs', l: 'Slabs & stairs', icon: 'slab' },
    { k: 'details', l: 'Connections & details', icon: 'detail' },
    { k: 'sls', l: 'Durability & SLS', icon: 'drop' },
    { k: 'geo', l: 'Geotechnical', icon: 'geo' },
    { k: 'actions', l: 'Actions & loads', icon: 'wind' },
    { k: 'steel', l: 'Steel & composite', icon: 'steel' }
  ];
  EC.mcui.register(EC.modules); /* one element type per Mathcad worksheet */
  CATS.forEach(c => { c.types = Object.keys(EC.modules).filter(t => EC.modules[t].cat === c.k && EC.modules[t].mc); c.legacy = Object.keys(EC.modules).filter(t => EC.modules[t].cat === c.k && !EC.modules[t].mc); });
  const STATUS = ['Not started', 'In design', 'Checked', 'Approved', 'IFC'];
  const STATUS_VAR = ['--st0', '--st1', '--st2', '--st3', '--st4'];
  const MOD = EC.modules;
  /* two separate design tools: hand calculation (Mathcad worksheets, inputs typed in) and ETABS link (forces imported from ETABS) */
  const TOOLS = {
    hand: { r: 'elements', l: 'Design by hand calculation', all: 'Hand-calculated elements', sub: 'Mathcad worksheets · inputs and forces entered by hand', has: e => !e.etabs },
    etabs: { r: 'linked', l: 'Design with ETABS link', all: 'ETABS-linked elements', sub: 'Forces imported from ETABS · governing combination per member', has: e => !!e.etabs }
  };
  const listHref = e => '#/' + TOOLS[e.etabs ? 'etabs' : 'hand'].r + '/' + MOD[e.type].cat;
  const defaults = type => { if (MOD[type].mc) return {}; const o = {}; MOD[type].groups.forEach(g => g.f.forEach(f => { o[f.k] = f.cols ? JSON.parse(JSON.stringify(f.d)) : f.d; })); return o; };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

  /* ---------------- store ---------------- */
  let DB;
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  let saveT;
  /* every project / element carries u = time of its last change (used to merge devices) */
  const seen = new Map();
  const itemSig = x => JSON.stringify(x, (k, v) => (k === 'u' || k === 'elements' ? undefined : v));
  function stamp() {
    const now = Date.now(), live = new Set();
    DB.tomb = DB.tomb || {};
    const one = (key, x) => { live.add(key); const sg = itemSig(x); const old = seen.get(key); if (old !== undefined && old !== sg) x.u = now; else if (!x.u) x.u = now; seen.set(key, sg); };
    DB.projects.forEach(p => { one('p_' + p.id, p); p.elements.forEach(e => one('e_' + e.id, e)); });
    seen.forEach((_, k) => { if (!live.has(k)) { DB.tomb[k] = now; seen.delete(k); } });
    if (seen.get('meta') !== DB.current) { DB.metaU = now; seen.set('meta', DB.current); }
  }
  function primeSeen() { seen.clear(); DB.projects.forEach(p => { seen.set('p_' + p.id, itemSig(p)); p.elements.forEach(e => seen.set('e_' + e.id, itemSig(e))); }); seen.set('meta', DB.current); }
  function save() {
    if (DEMO) { stamp(); return; } /* demo: kept in memory only */
    clearTimeout(saveT); setSync('saving');
    saveT = setTimeout(() => {
      stamp();
      try { localStorage.setItem(KEY, JSON.stringify(DB)); setSync('saved'); } catch (e) { toast('Could not save in this browser'); }
      EC.sync.changed();
    }, 250);
  }
  let syncSt = { state: 'local' };
  function setSync(local) {
    const el = document.getElementById('syncState'); if (!el) return;
    if (DEMO) { el.className = 'sync err'; el.innerHTML = '<i></i><span>Demo · not saved</span>'; el.title = 'Demo account: calculations work, but nothing is saved. Sign in as Admin to save.'; return; }
    const s = EC.sync.status();
    const cloud = s.backend ? (s.state === 'syncing' ? 'Syncing…' : s.state === 'signin' ? 'Connect Google Drive' : s.state === 'error' ? 'Sync error · tap' : s.at ? 'Saved to Drive ' + s.at.toTimeString().slice(0, 5) : 'Cloud') : 'Saved in this browser';
    el.dataset.gconnect = s.state === 'signin' || s.state === 'error' ? '1' : '';
    el.style.cursor = el.dataset.gconnect ? 'pointer' : '';
    const txt = local === 'saving' ? 'Saving…' : cloud;
    el.className = 'sync ' + (local === 'saving' || s.state === 'syncing' ? 'busy' : s.state === 'error' ? 'err' : s.backend ? 'ok' : 'local');
    el.innerHTML = `<i></i><span>${esc(txt)}</span>`;
    el.title = s.backend ? `Autosave on · synced with ${s.label}${s.err ? ' · ' + s.err : ''}` : 'Autosave on · data kept in this browser. Set up cloud sync in Project settings to use it on other devices.';
    syncSt = s;
  }
  function seed() {
    const t = today();
    const el = (type, mark, level, grid, qty, status, start, due, inputs) => ({ id: uid(), type, mark, level, grid, qty, status, start: addDays(t, start), due: addDays(t, due), assignee: 'RA VUTHA', inputs: Object.assign(defaults(type), inputs || {}) });
    const p = {
      id: uid(), name: 'CAMBO Tower – Block A', number: 'CS-2026-014', client: 'Demo Client Co., Ltd.', location: 'Phnom Penh',
      engineer: 'RA VUTHA', checker: '', code: 'Eurocodes (EN 1990:2023, EN 1992-1-1:2023, EN 1993-1-1, EN 1997)', notes: 'Demo project - edit or delete freely.',
      elements: [
        el('mc:FourPileCap_EC2-2023_Standalone', 'PC1', 'Foundation', 'B/2', 6, 'Approved', -40, -8),
        el('mc:SixPileCap_EC2-2023_Standalone', 'PC2', 'Foundation', 'C/3', 4, 'Checked', -35, 3),
        el('mc:PadFooting_EC2-2023_Standalone', 'F1', 'Foundation', 'A/1', 4, 'IFC', -45, -15),
        el('mc:Footing_EC7_Standalone', 'GF1', 'Foundation', 'A/1', 4, 'Approved', -44, -14),
        el('mc:Column_EC2-2023_Standalone', 'C1', 'GF–L3', 'B/2', 12, 'Checked', -30, 2),
        el('mc:ShearWall_EC2-2023_Standalone', 'W1', 'GF–L3', 'Core', 2, 'In design', -14, 8),
        el('mc:Beam_EC2-2023_Standalone', 'B1', 'L1–L8', '2/A–C', 24, 'Approved', -28, -4),
        el('mc:Torsion_EC2-2023_Standalone', 'B2', 'L1–L8', 'B/1–4', 16, 'In design', -6, 10),
        el('mc:Slab_TwoWay_EC2-2023_Standalone', 'S1', 'L1–L8', 'Typical', 8, 'Checked', -20, 4),
        el('mc:Punching_EC2-2023_Standalone', 'P1', 'L1–L8', 'B/2', 8, 'In design', -4, 14),
        el('mc:Staircase_EC2-2023_Standalone', 'ST1', 'GF–Roof', 'Core', 2, 'Not started', 6, 24),
        el('mc:Corbel_EC2-2023_Standalone', 'CB1', 'L1', 'C/4', 6, 'In design', -3, 16),
        el('mc:Cover_EC2-2023_Standalone', 'CV1', 'All', 'Global', 1, 'Approved', -46, -20),
        el('mc:RetainingWall_EC2-2023_Standalone', 'RW1', 'Basement', 'North', 1, 'Checked', -25, 1),
        el('mc:PileAxial_EC7_Standalone', 'PA1', 'Foundation', 'All', 64, 'Approved', -42, -12),
        el('mc:Wind_Building_EC1-2023_Standalone', 'WL1', 'Roof', 'Global', 1, 'Approved', -38, -10),
        el('mc:SteelColumn_EC3-2022_Standalone', 'SC1', 'Roof', 'Canopy', 4, 'Not started', 12, 35)
      ]
    };
    return { projects: [p], current: p.id };
  }
  /* accounts: Demo = calculate only (nothing saved), Admin = saved + synced database */
  const ROLE = EC.auth.role();
  if (!ROLE) { document.getElementById('app').style.display = 'none'; EC.auth.screen(); return; }
  const DEMO = ROLE === 'demo';
  if (DEMO) document.documentElement.classList.add('demo');
  DB = DEMO ? seed() : (load() || seed());
  DB.tomb = DB.tomb || {};
  primeSeen();
  const proj = () => DB.projects.find(p => p.id === DB.current) || DB.projects[0];

  /* ---------------- results cache ---------------- */
  const cache = new Map();
  function result(e) {
    if (MOD[e.type].mc) return EC.mcui.result(e);
    const key = JSON.stringify(e.inputs) + e.type;
    const hit = cache.get(e.id);
    if (hit && hit.key === key) return hit.r;
    let r;
    try { r = MOD[e.type].calc(Object.assign(defaults(e.type), e.inputs)); }
    catch (err) { console.error(err); r = { report: [{ k: 'note', t: 'Calculation error: ' + err.message }], summary: [], Umax: Infinity, ok: false, spec: [], bars: [], svg: '', error: true }; }
    r.rebarKg = (r.bars || []).reduce((a, b) => a + b.n * b.len / 1000 * EC.kgm(b.dia), 0);
    cache.set(e.id, { key, r });
    return r;
  }

  /* ---------------- small UI helpers ---------------- */
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), Math.max(2200, String(msg).length * 60)); }
  const pill = s => `<span class="pill"><span class="dot" style="background:var(${STATUS_VAR[STATUS.indexOf(s)] || '--muted'})"></span>${esc(s)}</span>`;
  const resTag = r => r.pending ? `<span class="res">…</span>` : r.error ? `<span class="res bad">${ic('alert')}Error</span>` : r.ok ? `<span class="res ok">${ic('check')}OK</span>` : `<span class="res bad">${ic('x')}Revise</span>`;
  function ubar(U) {
    if (Number.isNaN(U)) return `<div class="ubar"><div class="track"></div><span class="v">…</span></div>`;
    if (!Number.isFinite(U)) return `<div class="ubar"><div class="track"><div class="fill bad" style="width:100%"></div></div><span class="v">–</span></div>`;
    const cls = U > 1 + 1e-6 ? 'bad' : U > 0.9 ? 'hi' : '';
    return `<div class="ubar" title="Maximum utilisation ${fmt(U, 3)}"><div class="track"><div class="fill ${cls}" style="width:${Math.min(100, U * 100)}%"></div></div><span class="v">${fmt(U, 2)}</span></div>`;
  }
  const typeName = t => MOD[t].name;
  function modal(title, body, onOk, okText) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><header>${esc(title)}<button class="btn sm" data-x>${ic('x')}</button></header><div class="mb">${body}</div>${onOk ? `<footer><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>${okText || 'Save'}</button></footer>` : ''}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener('click', ev => { if (ev.target === bg || ev.target.closest('[data-x]')) close(); });
    const ok = $('[data-ok]', bg); if (ok) ok.onclick = () => { if (onOk(bg) !== false) close(); };
    return bg;
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function nextMark(type) {
    const pre = MOD[type].prefix, used = new Set(proj().elements.map(e => e.mark));
    let n = 1; while (used.has(pre + n)) n++; return pre + n;
  }

  /* ---------------- chrome ---------------- */
  function chrome(route) {
    const p = proj();
    $('#projSel').innerHTML = DB.projects.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.number ? x.number + ' · ' : '')}${esc(x.name)}</option>`).join('');
    const a = (href, icon, label, extra, active) => `<a href="#/${href}" class="${active ? 'active' : ''}">${ic(icon)}<span>${label}</span>${extra || ''}</a>`;
    const r0 = route[0] || 'dashboard';
    const tool = (k, cats) => { const T = TOOLS[k], els = p.elements.filter(T.has), cnt = c => els.filter(e => MOD[e.type] && MOD[e.type].cat === c).length;
      return `${a(T.r, 'layers', 'All elements', `<span class="count">${els.length}</span>`, r0 === T.r && !route[1])}
      <div class="sub">${cats.map(c => a(T.r + '/' + c.k, c.icon, c.l, `<span class="count">${cnt(c.k)}</span>`, r0 === T.r && route[1] === c.k)).join('')}</div>`; };
    const linkedCats = CATS.filter(c => p.elements.some(e => e.etabs && MOD[e.type] && MOD[e.type].cat === c.k));
    $('#sidebar').innerHTML = `<div class="nav">
      ${a('dashboard', 'dashboard', 'Dashboard', '', r0 === 'dashboard')}
      <h4 class="tool">Design by hand calculation<small>Mathcad worksheets</small></h4>
      ${tool('hand', CATS)}
      ${a('library', 'book', 'Mathcad library', `<span class="count">${EC.library.length}</span>`, r0 === 'library')}
      <h4 class="tool">Design with ETABS link<small>analysis results → design</small></h4>
      ${a('etabs', 'upload', 'Link to ETABS', '', r0 === 'etabs')}
      ${a('loads', 'wind', 'Loads & combinations', '', r0 === 'loads')}
      ${a('building', 'gantt', 'Building checks', '', r0 === 'building')}
      ${tool('etabs', linkedCats)}
      <h4>Schedules</h4>
      ${a('schedules', 'table', 'Element schedules', '', r0 === 'schedules')}
      ${a('programme', 'gantt', 'Design programme', '', r0 === 'programme')}
      <h4>Project</h4>
      ${a('project', 'gear', 'Project settings', '', r0 === 'project')}
    </div>`;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    $('#themeBtn').innerHTML = ic(dark ? 'sun' : 'moon');
  }

  /* ---------------- dashboard ---------------- */
  function vDashboard() {
    const p = proj(), els = p.elements;
    const R = els.map(e => ({ e, r: result(e) }));
    const nOk = R.filter(x => x.r.ok).length, nBad = R.length - nOk;
    const qty = els.reduce((a, e) => a + (+e.qty || 1), 0);
    const Umax = R.reduce((a, x) => Math.max(a, Number.isFinite(x.r.Umax) ? x.r.Umax : 0), 0);
    const rebar = R.reduce((a, x) => a + x.r.rebarKg * (+x.e.qty || 1), 0) / 1000;
    const steel = R.reduce((a, x) => a + (x.r.steelMass || 0) * (+x.e.qty || 1), 0) / 1000;
    const stCount = STATUS.map(s => els.filter(e => e.status === s).length);
    const done = stCount[3] + stCount[4];
    const prog = els.length ? Math.round(done / els.length * 100) : 0;
    const t = today();

    const kpi = (label, value, foot, icon) => `<div class="card kpi"><div class="label">${ic(icon)}${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
    const stack = `<div class="stack" role="img" aria-label="Design status">${STATUS.map((s, k) => stCount[k] ? `<div style="flex:${stCount[k]};background:var(${STATUS_VAR[k]})" title="${s}: ${stCount[k]}"></div>` : '').join('')}</div>
      <div class="legend">${STATUS.map((s, k) => `<span><i style="background:var(${STATUS_VAR[k]})"></i>${s} <b class="num">${stCount[k]}</b></span>`).join('')}</div>`;

    const top = R.filter(x => Number.isFinite(x.r.Umax)).sort((a, b) => b.r.Umax - a.r.Umax).slice(0, 12);
    const scaleMax = Math.max(1.2, ...top.map(x => x.r.Umax));
    const pct = v => Math.min(100, v / scaleMax * 100);
    const ticks = [0, 0.25, 0.5, 0.75, 1].concat(scaleMax >= 1.25 ? [1.25] : []).concat(scaleMax >= 1.5 ? [1.5] : []);
    const uchart = top.length ? `<div class="chart-u">${top.map(x => `<div class="row" data-open="${x.e.id}" title="${esc(x.e.mark)} – ${esc(typeName(x.e.type))}: U = ${fmt(x.r.Umax, 3)}">
        <div class="name">${esc(x.e.mark)}<small>${esc(typeName(x.e.type))}</small></div>
        <div class="lane"><div class="b ${x.r.Umax > 1 + 1e-6 ? 'bad' : ''}" style="width:${pct(x.r.Umax)}%"></div><div class="ref" style="left:${pct(1)}%"></div></div>
        <div class="val">${fmt(x.r.Umax, 2)} ${x.r.Umax > 1 + 1e-6 ? '✗' : '✓'}</div></div>`).join('')}
        <div class="axisrow"><div></div><div class="lane" style="position:relative">${ticks.map(v => `<span style="left:${pct(v)}%">${v}</span>`).join('')}</div><div></div></div></div>
        <div class="legend"><span><i style="background:var(--good)"></i>✓ U ≤ 1.0</span><span><i style="background:var(--critical)"></i>✗ U > 1.0 - revise</span><span>┆ limit U = 1.0</span></div>` : '<div class="empty">No elements yet</div>';

    const catCards = (k, cats) => cats.map(c => {
      const T = TOOLS[k], xs = R.filter(x => T.has(x.e) && MOD[x.e.type].cat === c.k);
      const ok = xs.filter(x => x.r.ok).length;
      const mu = xs.reduce((a, x) => Math.max(a, Number.isFinite(x.r.Umax) ? x.r.Umax : 0), 0);
      const dn = xs.filter(x => x.e.status === 'Approved' || x.e.status === 'IFC').length;
      return `<div class="card cat-card" data-go="${T.r}/${c.k}"><div class="top"><div class="ic">${ic(c.icon)}</div><div><h3>${c.l}</h3><div class="meta">${k === 'hand' ? `${c.types.length} Mathcad worksheets` : 'designed from ETABS forces'}</div></div></div>
        <div class="nums"><div><b>${xs.length}</b>types</div><div><b>${xs.reduce((a, x) => a + (+x.e.qty || 1), 0)}</b>no. off</div><div><b style="color:${xs.length - ok ? 'var(--critical)' : 'inherit'}">${xs.length - ok}</b>revise</div><div><b>${xs.length ? fmt(mu, 2) : '–'}</b>U max</div></div>
        <div style="margin-top:10px">${ubar(xs.length ? dn / xs.length : 0).replace(/<span class="v">.*?<\/span>/, `<span class="v">${xs.length ? Math.round(dn / xs.length * 100) : 0}%</span>`).replace('title="Maximum utilisation', 'title="Approved / IFC share')}</div></div>`;
    }).join('');
    const nHand = els.filter(TOOLS.hand.has).length, nLinked = els.length - nHand;
    const linkedCats = CATS.filter(c => els.some(e => e.etabs && MOD[e.type].cat === c.k));
    const toolCard = (k, icon, n, txt, go, btn) => `<div class="card tool-card" data-go="${go}"><div class="top"><div class="ic">${ic(icon)}</div><div><h3>${TOOLS[k].l}</h3><div class="meta">${txt}</div></div><b class="n">${n}<small>elements</small></b></div>
      <div class="foot">${btn}</div></div>`;

    const upcoming = els.filter(e => e.status !== 'IFC' && e.status !== 'Approved').sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 8);
    const dueTbl = upcoming.length ? `<table class="tbl"><thead><tr><th>Mark</th><th>Element</th><th>Status</th><th>Due</th></tr></thead><tbody>${upcoming.map(e => {
      const od = e.due && e.due < t;
      return `<tr class="click" data-open="${e.id}"><td class="mark">${esc(e.mark)}</td><td>${esc(typeName(e.type))}</td><td>${pill(e.status)}</td><td class="num" style="white-space:nowrap;${od ? 'color:var(--critical);font-weight:600' : ''}">${od ? '⚠ ' : ''}${esc(e.due || '–')}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">Nothing pending</div>';

    return `<div class="page-head"><div><h1>${esc(p.name)}</h1><div class="sub">${esc(p.number)} · ${esc(p.client)} · ${esc(p.location)} · Engineer ${esc(p.engineer)}</div></div>
      <div class="actions"><button class="btn primary" data-add>${ic('plus')}New element</button></div></div>
      <div class="grid g4">
        ${kpi('Element types', `${els.length} <small>/ ${qty} no. off</small>`, `${CATS.filter(c => R.some(x => MOD[x.e.type].cat === c.k)).length} main element groups`, 'layers')}
        ${kpi('Design checks', `${nOk} <small>OK</small> · <span style="color:${nBad ? 'var(--critical)' : 'inherit'}">${nBad}</span> <small>revise</small>`, `Max utilisation ${fmt(Umax, 2)}`, 'check')}
        ${kpi('Design progress', `${prog}<small>%</small>`, `${done} of ${els.length} approved / IFC`, 'gantt')}
        ${kpi('Quantities (indicative)', `${fmt(rebar, 1)} <small>t rebar</small>`, `${fmt(steel, 1)} t structural steel`, 'table')}
      </div>
      <div class="grid g21" style="margin-top:16px">
        <div class="card"><header><h3>Utilisation by element</h3><span class="hint">highest 12 · click to open</span></header><div class="body">${uchart}</div></div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h3>Design status</h3><span class="hint">${els.length} elements</span></header><div class="body">${stack}</div></div>
          <div class="card"><header><h3>Upcoming deadlines</h3></header><div class="body" style="padding-top:8px">${dueTbl}</div></div>
        </div>
      </div>
      <h2 style="font-size:16px;margin:22px 0 10px">Design tools</h2>
      <div class="grid g2">
        ${toolCard('hand', 'book', nHand, 'Mathcad worksheets · section, materials and forces entered by hand', 'elements', `<button class="btn sm primary" data-add>${ic('plus')}New hand calculation</button><button class="btn sm" data-go="library">${ic('book')}Mathcad library</button>`)}
        ${toolCard('etabs', 'upload', nLinked, 'Live link to the ETABS model (API) · envelope the combinations · design each member', 'linked', `<button class="btn sm primary" data-go="etabs">${ic('upload')}Link to ETABS</button><button class="btn sm" data-go="linked">${ic('layers')}Linked elements</button>`)}
      </div>
      <h2 style="font-size:16px;margin:22px 0 10px">Design by hand calculation (Mathcad) · main elements</h2>
      <div class="grid g3">${catCards('hand', CATS)}</div>
      <h2 style="font-size:16px;margin:22px 0 10px">Design with ETABS link · main elements</h2>
      ${linkedCats.length ? `<div class="grid g3">${catCards('etabs', linkedCats)}</div>` : `<div class="card"><div class="empty">No ETABS-linked elements yet.<br><br><button class="btn primary" data-go="etabs">${ic('upload')}Link to ETABS</button></div></div>`}`;
  }

  /* ---------------- element list ---------------- */
  function vElements(catKey, k) {
    const p = proj(), T = TOOLS[k], hand = k === 'hand';
    const cat = CATS.find(c => c.k === catKey);
    const all = p.elements.filter(T.has);
    const els = all.filter(e => !cat || MOD[e.type].cat === cat.k);
    const tabCats = hand ? CATS : CATS.filter(c => c.k === catKey || all.some(e => MOD[e.type].cat === c.k));
    const addBtn = (lbl, cls) => hand ? `<button class="btn ${cls}" data-add="${cat ? cat.k : ''}">${ic('plus')}${lbl}</button>` : `<button class="btn ${cls}" data-go="etabs">${ic('upload')}Link to ETABS</button>`;
    const rows = els.map(e => { const r = result(e); return `<tr class="click" data-open="${e.id}">
      <td class="mark">${esc(e.mark)}</td><td>${esc(typeName(e.type))}</td><td>${esc(e.level || '')}</td><td>${esc(e.grid || '')}</td>${hand ? '' : `<td><small>${esc(e.etabs.combo)}</small></td>`}<td class="num">${esc(e.qty)}</td>
      <td>${pill(e.status)}</td><td class="num">${esc(e.due || '')}</td><td>${ubar(r.Umax)}</td><td>${resTag(r)}</td>
      <td class="no-print" style="white-space:nowrap"><button class="btn sm" data-dup="${e.id}" title="Duplicate">${ic('copy')}</button> <button class="btn sm danger" data-del="${e.id}" title="Delete">${ic('trash')}</button></td></tr>`; }).join('');
    return `<div class="page-head"><div><div class="tool-tag">${ic(hand ? 'book' : 'upload')}${T.l}</div><h1>${cat ? cat.l : T.all}</h1><div class="sub">${hand && cat ? `${cat.types.length} Mathcad worksheets` : T.sub} · ${els.length} elements in this project</div></div>
      <div class="actions">${addBtn(hand ? 'New element' : '', 'primary')}</div></div>
      <div class="tabs">${[{ k: '', l: 'All' }].concat(tabCats).map(c => `<button class="${(c.k || '') === (catKey || '') ? 'active' : ''}" data-go="${T.r}${c.k ? '/' + c.k : ''}">${c.l}<span class="badge">${all.filter(e => !c.k || MOD[e.type].cat === c.k).length}</span></button>`).join('')}</div>
      <div class="card"><div class="tbl-wrap">${els.length ? `<table class="tbl"><thead><tr><th>Mark</th><th>Type</th><th>Level</th><th>Grid / location</th>${hand ? '' : '<th>Governing combination</th>'}<th class="num">Qty</th><th>Status</th><th class="num">Due</th><th>Utilisation</th><th>Result</th><th class="no-print"></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${hand ? 'No hand-calculated elements in this group yet.' : 'No ETABS-linked elements in this group yet - link to ETABS to create them.'}<br><br>${addBtn('Add the first one', 'primary')}</div>`}</div></div>`;
  }

  /* ---------------- element editor ---------------- */
  let activeTab = 'summary';
  function vElement(id) {
    const p = proj(), e = p.elements.find(x => x.id === id);
    if (!e) return `<div class="empty">Element not found. <a href="#/elements">Back to elements</a></div>`;
    const mod = MOD[e.type];
    if (mod.mc) return EC.mcui.vElement(e);
    const inputs = mod.groups.map(g => `<div class="grp"><h4>${esc(g.t)}</h4>${g.f.map(f => {
      const v = e.inputs[f.k] !== undefined ? e.inputs[f.k] : f.d;
      if (f.cols) return `<div class="tblin"><div class="fl">${EC.sym(f.l)}</div><div class="tbl-wrap"><table><thead><tr>${f.cols.map(c => `<th>${EC.sym(c)}</th>`).join('')}<th></th></tr></thead><tbody>${(v || []).map((r, ri) => `<tr>${f.cols.map((c, ci) => `<td><input data-t="${f.k}" data-r="${ri}" data-c="${ci}" type="number" step="any" value="${esc(r[ci] === undefined ? '' : r[ci])}"></td>`).join('')}<td><button class="btn sm" data-trdel="${f.k}" data-r="${ri}" title="Delete row">${ic('x')}</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" data-tradd="${f.k}">${ic('plus')}Row</button></div>`;
      const ctl = f.opts ? `<select data-k="${f.k}">${f.opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`
        : `<input data-k="${f.k}" type="${typeof f.d === 'number' ? 'number' : 'text'}" step="any" value="${esc(v)}" inputmode="decimal">`;
      return f.opts && !f.u ? `<div class="field wide"><span class="fl">${EC.sym(f.l)}</span>${ctl}</div>` : `<div class="field"><span class="fl">${EC.sym(f.l)}</span>${ctl}<span class="fu">${esc(f.u || '')}</span></div>`;
    }).join('')}</div>`).join('');
    const opt = (arr, v) => arr.map(s => `<option ${s === v ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `<div class="page-head no-print"><div><a href="${listHref(e)}" class="btn sm" style="margin-bottom:8px">${ic('back')}${e.etabs ? 'ETABS link · ' : ''}${esc(CATS.find(c => c.k === mod.cat).l)}</a>
        <h1><span style="color:var(--accent)">${esc(e.mark)}</span> · ${esc(mod.name)}</h1><div class="sub">${esc(mod.code)} · ${e.etabs ? `Designed from ETABS results (${esc(e.etabs.label)}, ${esc(e.etabs.story)})` : 'Mathcad reference: ' + esc(mod.mathcad)}</div></div>
      <div class="actions"><button class="btn" data-print>${ic('print')}Print calculation</button><button class="btn" data-dup="${e.id}">${ic('copy')}Duplicate</button><button class="btn danger" data-del="${e.id}">${ic('trash')}Delete</button></div></div>
      <div class="card no-print"><div class="el-head" id="elHead">
        <div><label>Mark</label><input data-m="mark" value="${esc(e.mark)}"></div>
        <div><label>Level</label><input data-m="level" value="${esc(e.level || '')}"></div>
        <div><label>Grid / location</label><input data-m="grid" value="${esc(e.grid || '')}"></div>
        <div><label>Quantity</label><input data-m="qty" type="number" min="1" value="${esc(e.qty || 1)}"></div>
        <div><label>Status</label><select data-m="status">${opt(STATUS, e.status)}</select></div>
        <div><label>Start</label><input data-m="start" type="date" value="${esc(e.start || '')}"></div>
        <div><label>Due</label><input data-m="due" type="date" value="${esc(e.due || '')}"></div>
        <div><label>Designer</label><input data-m="assignee" value="${esc(e.assignee || '')}"></div>
      </div></div>
      ${EC.etabs.banner(e)}<div class="editor">
        <div class="card inputs"><div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px"><b>Input data</b><span class="badge" style="background:var(--input-bg);border-color:var(--input-border)">yellow = input</span><button class="btn sm" style="margin-left:auto" data-reset title="Restore default inputs">Defaults</button></div>${inputs}</div>
        <div id="out">${vOutput(e)}</div>
      </div>`;
  }
  function vOutput(e) {
    const r = result(e), mod = MOD[e.type], p = proj();
    const tabs = [['summary', 'Summary'], ['calc', 'Calculation'], ['spec', 'Specification'], ['detail', 'Detailing']];
    const sumRows = r.summary.map(s => `<tr><td class="item">${EC.sym(s.item)}${s.r ? ` <span class="badge">${esc(s.r)}</span>` : ''}</td><td>${s.U === null ? '' : ubar(s.U)}</td><td>${s.ok ? '<span class="res ok">' + ic('check') + 'OK</span>' : '<span class="res bad">' + ic('x') + 'NOT OK</span>'}</td></tr>`).join('');
    const summary = `<div class="verdict-banner ${r.ok ? 'ok' : 'bad'}">${ic(r.ok ? 'check' : 'alert')}<div>${r.ok ? 'All checks satisfied - design OK' : 'REVISE - see NOT OK items'}<div style="font-weight:400;font-size:12px;opacity:.85">${r.summary.length} checks · ${r.summary.filter(s => !s.ok).length} not OK</div></div><div class="big">U<sub>max</sub> = ${fmt(r.Umax, 3)}</div></div>
      <div class="tbl-wrap"><table class="tbl sumtbl"><thead><tr><th>Item</th><th>Utilisation U</th><th>Status</th></tr></thead><tbody>${sumRows}</tbody></table></div>`;
    const calc = `<div class="calc"><div class="ctitle">${esc(mod.name)} ${esc(e.mark)} – ${esc(mod.code)}</div>${r.report.map(row).join('')}
      <div class="h1">${r.report.filter(x => x.k === 'h1').length + 1}. SUMMARY</div>${summary}</div>`;
    const spec = `<dl class="spec">${[['Element', `${e.mark} – ${mod.name}`], ['Location', `${e.level || '–'}, ${e.grid || '–'} (${e.qty || 1} no.)`], ['Design code', mod.code]].concat(r.spec || []).map(s => `<dt>${esc(s[0])}</dt><dd>${EC.sym(s[1])}</dd>`).join('')}</dl>
      <p class="text" style="color:var(--muted);font-size:12px;margin-top:12px">General: workmanship to EN 13670; reinforcement B500B to EN 10080 / ISO 6935-2; laps and anchorages to EN 1992-1-1 Section 11 unless shown; cover tolerance Δc_dev = 10 mm.</p>`;
    const bars = r.bars && r.bars.length ? `<h3 style="font-size:14px;margin:18px 0 8px">Bar schedule (indicative, per element)</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mark</th><th>Type &amp; size</th><th class="num">No.</th><th class="num">Length (mm)</th><th>Shape</th><th class="num">Mass (kg)</th></tr></thead><tbody>
      ${r.bars.map(b => `<tr><td>${b.mark}</td><td>H${b.dia}</td><td class="num">${b.n}</td><td class="num">${fmt(b.len, 0)}</td><td>${esc(b.shape)}</td><td class="num">${fmt(b.n * b.len / 1000 * EC.kgm(b.dia), 1)}</td></tr>`).join('')}
      <tr><td colspan="5" style="text-align:right;font-weight:600">Total per element / × ${e.qty || 1} no.</td><td class="num"><b>${fmt(r.rebarKg, 1)}</b> / ${fmt(r.rebarKg * (e.qty || 1), 0)}</td></tr></tbody></table></div>` : (r.steelMass ? `<p>Steel mass: <b>${fmt(r.steelMass, 0)} kg</b> per member, ${fmt(r.steelMass * (e.qty || 1), 0)} kg total.</p>` : '');
    const detail = `<div class="drawings">${(r.svg || '').replace(/(width|height|r)="-[\d.e-]+"/g, '$1="0"').replace(/="NaN"/g, '="0"')}</div>${bars}`;
    const head = `<div class="print-head"><div><b>CAMBO STRUCT</b> · ${esc(p.name)} (${esc(p.number)})<br>${esc(mod.name)} <b style="font-size:12px;color:inherit">${esc(e.mark)}</b> · ${esc(e.level || '')} ${esc(e.grid || '')}</div><div style="text-align:right">Cal. by ${esc(e.assignee || p.engineer)} · Checked ${esc(p.checker || '…')}<br>${today()} · ${esc(mod.code)}</div></div>`;
    return `${head}<div class="card"><div class="tabs no-print" style="padding:0 10px;margin:0">${tabs.map(t => `<button data-tab="${t[0]}" class="${activeTab === t[0] ? 'active' : ''}">${t[1]}${t[0] === 'summary' ? ` <span class="res ${r.ok ? 'ok' : 'bad'}" style="padding:0 6px">${fmt(r.Umax, 2)}</span>` : ''}</button>`).join('')}</div>
      <div class="body">${[['summary', summary], ['calc', calc], ['spec', spec], ['detail', detail]].map(([k, h]) => `<div class="tab-pane" data-pane="${k}" style="${activeTab === k ? '' : 'display:none'}">${h}</div>`).join('')}</div></div>`;
  }
  function row(x) {
    if (x.k === 'h1') return `<div class="h1">${esc(x.t)}</div>`;
    if (x.k === 'h2') return `<div class="h2">${esc(x.t)}</div>`;
    if (x.k === 'text') return `<div class="text">${EC.sym(x.t)}</div>`;
    if (x.k === 'note') return `<div class="note">${EC.sym(x.t)}</div>`;
    const lab = `<div class="lab">${esc(x.l)}${x.r ? `<span class="ref">${EC.sym(x.r)}</span>` : ''}</div>`;
    if (x.k === 'v') {
      const val = `<span class="val">${EC.sym(x.s)} = ${fmt(x.v, x.dp)}${x.u ? ' ' + esc(x.u) : ''}</span>`;
      const f = x.f ? `<span class="f">${EC.sym(x.s)} = ${EC.sym(x.f)}</span>` : '';
      const n = x.n ? `<span class="n"> = ${EC.sym(String(x.n).replace(/·/g, ' · '))}</span>` : '';
      return `<div class="row ${x.key ? 'key' : ''} ${x.inp ? 'inp' : ''}">${lab}<div class="math">${f}${n}${f || n ? '<br>' : ''}${val}</div></div>`;
    }
    if (x.k === 'chk') {
      return `<div class="row chk">${lab}<div class="math">${x.f ? `<span class="f">${EC.sym(x.f)}</span><br>` : ''}${fmt(Math.abs(x.Ed), x.dp)} ${x.U <= 1 + 1e-6 ? '≤' : '>'} ${fmt(x.Rd, x.dp)} ${esc(x.u || '')} → <span class="val">${EC.sym(x.s || 'η')} = ${fmt(x.U, 3)}</span>
        <span class="verdict res ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'OK' : 'NOT OK'}</span></div></div>`;
    }
    if (x.k === 'tbl') return `<div class="tbl-wrap" style="margin:6px 0 10px"><table class="tbl"><thead><tr>${x.head.map(h => `<th class="num">${EC.sym(h)}</th>`).join('')}</tr></thead><tbody>${x.rows.map(r => `<tr>${r.map((v, j) => `<td class="num">${typeof v === 'number' ? fmt(v, Array.isArray(x.dp) ? x.dp[j] : x.dp) : EC.sym(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (x.k === 'ok') return `<div class="row okrow">${lab}<div class="math">${EC.sym(x.txt || '')}<span class="verdict res ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'OK' : 'NOT OK'}</span></div></div>`;
    return '';
  }

  /* ---------------- schedules ---------------- */
  let schedType = null, schedFilter = '';
  function vSchedules() {
    const p = proj();
    const types = Object.keys(MOD).filter(t => p.elements.some(e => e.type === t));
    if (!types.length) return `<div class="page-head"><div><h1>Element schedules</h1></div></div><div class="card empty">No elements yet.</div>`;
    if (!types.includes(schedType)) schedType = types[0];
    const mod = MOD[schedType];
    const els = p.elements.filter(e => e.type === schedType && (!schedFilter || e.status === schedFilter));
    const mcCols = mod.mc ? (els.map(e => EC.mcui.schedRow(e)).find(x => x.length) || []).map(x => x[0]) : [];
    const head = ['Mark', 'Level', 'Grid', 'Qty'].concat(mod.mc ? mcCols.concat(['Key result']) : mod.schedCols.map(c => c[1])).concat(['U max', 'Result', 'Status']);
    const rows = els.map(e => { const r = result(e); if (mod.mc) { const sr = EC.mcui.schedRow(e); return { e, r, cells: [e.mark, e.level || '', e.grid || '', e.qty || 1].concat(mcCols.map((_, k) => (sr[k] || [])[1])).concat([EC.mcui.keyText(e)]) }; } const s = mod.sched(Object.assign(defaults(e.type), e.inputs), r); return { e, r, cells: [e.mark, e.level || '', e.grid || '', e.qty || 1].concat(mod.schedCols.map(c => s[c[0]])) }; });
    return `<div class="page-head"><div><h1>Element schedules</h1><div class="sub">One schedule per element type - as issued on the drawings</div></div>
      <div class="actions"><select class="ctl" id="schedFilter"><option value="">All statuses</option>${STATUS.map(s => `<option ${s === schedFilter ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button class="btn" data-csv>${ic('download')}CSV</button><button class="btn" data-printpage>${ic('print')}Print</button></div></div>
      <div style="margin-bottom:14px" class="no-print"><select class="ctl" id="schedType" style="min-width:260px;max-width:100%">${CATS.map(c => { const ts = types.filter(t => MOD[t].cat === c.k); return ts.length ? `<optgroup label="${esc(c.l)}">${ts.map(t => `<option value="${t}" ${t === schedType ? 'selected' : ''}>${esc(MOD[t].name)} (${p.elements.filter(e => e.type === t).length})</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div>
      <div class="print-head"><div><b>CAMBO STRUCT</b> · ${esc(p.name)} (${esc(p.number)})<br>${esc(mod.name)} schedule</div><div>${today()}</div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h, k) => `<th class="${k === 3 ? 'num' : ''}">${EC.sym(h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(x => `<tr class="click" data-open="${x.e.id}">${x.cells.map((c, k) => `<td class="${k === 0 ? 'mark' : ''} ${k === 3 ? 'num' : ''}">${esc(c === undefined ? '' : c)}</td>`).join('')}<td>${ubar(x.r.Umax)}</td><td>${resTag(x.r)}</td><td>${pill(x.e.status)}</td></tr>`).join('') || `<tr><td colspan="${head.length}" class="empty">No elements match</td></tr>`}
      </tbody></table></div></div>
      <p style="color:var(--muted);font-size:12px">Totals: ${els.reduce((a, e) => a + (+e.qty || 1), 0)} no. off${mod.mc ? ` · worksheet ${esc(mod.mcFile)}` : ''}<span ${mod.mc ? 'hidden' : ''}> · rebar ≈ ${fmt(rows.reduce((a, x) => a + x.r.rebarKg * (+x.e.qty || 1), 0), 0)} kg${rows.some(x => x.r.steelMass) ? ` · steel ≈ ${fmt(rows.reduce((a, x) => a + (x.r.steelMass || 0) * (+x.e.qty || 1), 0), 0)} kg` : ''}</span></p>`;
  }
  function schedCSV() {
    const p = proj(), mod = MOD[schedType];
    const els = p.elements.filter(e => e.type === schedType && (!schedFilter || e.status === schedFilter));
    const mcCols = mod.mc ? (els.map(e => EC.mcui.schedRow(e)).find(x => x.length) || []).map(x => x[0]) : [];
    const head = ['Mark', 'Level', 'Grid', 'Qty'].concat(mod.mc ? mcCols.concat(['Key result']) : mod.schedCols.map(c => c[1].replace(/_/g, ''))).concat(['Umax', 'Result', 'Status']);
    const q = v => `"${String(v === undefined ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(',')].concat(els.map(e => {
      const r = result(e);
      const mid = mod.mc ? mcCols.map((_, k) => (EC.mcui.schedRow(e)[k] || [])[1]).concat([EC.mcui.keyText(e)]) : (s => mod.schedCols.map(c => s[c[0]]))(mod.sched(Object.assign(defaults(e.type), e.inputs), r));
      return [e.mark, e.level, e.grid, e.qty].concat(mid).concat([fmt(r.Umax, 3), r.ok ? 'OK' : 'REVISE', e.status]).map(q).join(',');
    }));
    download(`${p.number || 'project'}_${schedType}_schedule.csv`, lines.join('\n'), 'text/csv');
  }

  /* ---------------- programme (gantt) ---------------- */
  function vProgramme() {
    const p = proj(), els = p.elements.filter(e => e.start || e.due);
    if (!els.length) return `<div class="page-head"><div><h1>Design programme</h1></div></div><div class="card empty">Give elements a start and due date to see the programme.</div>`;
    const ds = els.flatMap(e => [e.start || e.due, e.due || e.start]).sort();
    let d0 = new Date(ds[0]), d1 = new Date(ds[ds.length - 1]);
    d0.setDate(d0.getDate() - 3); d1.setDate(d1.getDate() + 3);
    const span = Math.max(1, (d1 - d0) / 864e5);
    const pos = d => ((new Date(d) - d0) / 864e5) / span * 100;
    const tpos = pos(today());
    const weeks = []; for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
    const rows = CATS.map(c => {
      const xs = els.filter(e => MOD[e.type].cat === c.k).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      if (!xs.length) return '';
      return `<div class="g-cat">${c.l}</div>` + xs.map(e => {
        const s = pos(e.start || e.due), f = pos(e.due || e.start), k = STATUS.indexOf(e.status), od = e.due < today() && e.status !== 'IFC' && e.status !== 'Approved';
        return `<div class="g-row" data-open="${e.id}" title="${esc(e.mark)} ${esc(e.start)} → ${esc(e.due)} · ${esc(e.status)}"><div class="g-name"><b>${esc(e.mark)}</b> <span>${esc(typeName(e.type))}</span></div>
          <div class="g-lane"><div class="g-bar" style="left:${s}%;width:${Math.max(1.2, f - s)}%;background:var(${STATUS_VAR[k] || '--muted'})"></div>${od ? `<span class="g-od" style="left:${f}%">⚠</span>` : ''}</div><div class="g-st">${esc(e.status)}</div></div>`;
      }).join('');
    }).join('');
    return `<style>
      .gantt{position:relative}.g-cat{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:10px 0 4px}
      .g-row,.g-axis{display:grid;grid-template-columns:170px 1fr 92px;gap:10px;align-items:center}.g-row{padding:3px 0;cursor:pointer;border-radius:6px}.g-row:hover{background:var(--surface-2)}
      .g-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}.g-name span{color:var(--muted)}.g-st{font-size:11.5px;color:var(--ink-2)}
      .g-lane{position:relative;height:18px}.g-bar{position:absolute;top:3px;height:12px;border-radius:4px}.g-od{position:absolute;top:0;font-size:12px;color:var(--critical);margin-left:3px}
      .g-axis .g-lane{height:20px;border-bottom:1px solid var(--axis)}.g-axis span{position:absolute;font-size:10.5px;color:var(--muted);transform:translateX(-50%);white-space:nowrap}
      .g-today{position:absolute;top:0;bottom:0;border-left:1.5px dashed var(--critical)}
      @media(max-width:760px){.g-row,.g-axis{grid-template-columns:90px 1fr}.g-st{display:none}}
    </style>
    <div class="page-head"><div><h1>Design programme</h1><div class="sub">Element design schedule - start → due, coloured by status · dashed line = today</div></div></div>
    <div class="card"><div class="body"><div class="gantt">
      <div class="g-axis"><div></div><div class="g-lane">${weeks.map(w => `<span style="left:${pos(w)}%">${w.toISOString().slice(5, 10)}</span>`).join('')}</div><div></div></div>
      <div style="position:relative">${rows}<div style="position:absolute;inset:0;display:grid;grid-template-columns:170px 1fr 92px;gap:10px;pointer-events:none"><div></div><div style="position:relative">${tpos >= 0 && tpos <= 100 ? `<div class="g-today" style="left:${tpos}%"></div>` : ''}</div></div></div>
      <div class="legend">${STATUS.map((s, k) => `<span><i style="background:var(${STATUS_VAR[k]})"></i>${s}</span>`).join('')}<span style="color:var(--critical)">⚠ overdue</span></div>
    </div></div></div>`;
  }

  /* ---------------- library ---------------- */
  let libQ = '', libG = '';
  function vLibrary() {
    const groups = Array.from(new Set(EC.library.map(x => x.group)));
    const L = EC.library.filter(x => (!libG || x.group === libG) && (!libQ || (x.folder + ' ' + x.desc + ' ' + x.files.join(' ')).toLowerCase().includes(libQ.toLowerCase())));
    return `<div class="page-head"><div><h1>Mathcad calculation library</h1><div class="sub">math.Claude · ${EC.library.length} worksheets indexed from README.md - the detailed Mathcad Prime 12 calculations behind this web app</div></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><input class="ctl" id="libQ" placeholder="Search worksheets, clauses, methods…" value="${esc(libQ)}" style="min-width:280px;flex:1;max-width:460px">
      <div class="chips">${[''].concat(groups).map(g => `<button class="chip ${g === libG ? 'active' : ''}" data-lg="${esc(g)}">${g ? esc(g.replace('_', ' ')) : 'All'}</button>`).join('')}</div></div>
      <div class="grid g2">${L.map(x => `<div class="card lib-card"><h3>${ic('folder')}${esc(x.folder)} <span class="badge">${esc(x.type)}</span></h3><p>${esc(x.desc)}</p>${x.files.map(f => `<code>${esc(f)}</code>`).join('')}${libMods(x).length ? `<div class="chips" style="margin-top:10px">${libMods(x).map(t => `<button class="btn sm primary" data-newtype="${t}">${ic('plus')}Design ${esc(MOD[t].name)}</button>`).join('')}</div>` : ''}</div>`).join('') || '<div class="empty">No match</div>'}</div>`;
  }

  const libMods = x => EC.mcui.libTypes(x);

  /* ---------------- project settings ---------------- */
  function vProject() {
    const p = proj();
    const f = (k, l) => `<div><label>${l}</label><input data-p="${k}" value="${esc(p[k] || '')}"></div>`;
    return `<div class="page-head"><div><h1>Project settings</h1><div class="sub">Project information used on the dashboard, schedules and printed calculations</div></div>
      <div class="actions"><button class="btn primary" data-newproj>${ic('plus')}New project</button></div></div>
      <div class="grid g2"><div class="card"><header><h3>Project information</h3></header><div class="body form">
        <div class="row2">${f('name', 'Project name')}${f('number', 'Project number')}</div>
        <div class="row2">${f('client', 'Client')}${f('location', 'Location')}</div>
        <div class="row2">${f('engineer', 'Design engineer')}${f('checker', 'Checked by')}</div>
        <div style="margin-bottom:12px">${f('code', 'Code basis')}</div>
        <div><label>Notes</label><textarea data-p="notes" rows="3">${esc(p.notes || '')}</textarea></div>
      </div></div>
      <div class="card"><header><h3>Projects in this browser</h3></header><div class="body"><table class="tbl"><tbody>${DB.projects.map(x => `<tr><td><b>${esc(x.number)}</b> ${esc(x.name)}<br><small style="color:var(--muted)">${x.elements.length} elements</small></td><td style="text-align:right;white-space:nowrap">${x.id === p.id ? '<span class="badge">current</span>' : `<button class="btn sm" data-useproj="${x.id}">Open</button>`} <button class="btn sm danger" data-delproj="${x.id}">${ic('trash')}</button></td></tr>`).join('')}</tbody></table>
        <p style="color:var(--muted);font-size:12px;margin-top:14px">Data autosaves in this browser and syncs to the cloud when connected (below). <b>Export</b> / <b>Import</b> in the top bar make a backup file.</p>
        <button class="btn" data-demo>Add demo project</button></div></div></div>
      ${syncCard()}`;
  }
  function syncCard() {
    if (DEMO) return `<div class="card" style="margin-top:16px"><header><h3>Account &amp; saving</h3><span class="hint">Demo account</span></header><div class="body"><p style="margin-top:0">You are using the <b>Demo account</b>: all calculations work, but nothing is saved - the data is lost when the page is closed or reloaded.</p><button class="btn primary" data-signout>Sign in as Admin</button></div></div>`;
    const s = EC.sync.status();
    return `<div class="card" style="margin-top:16px"><header><h3>Account &amp; saving</h3><span class="hint">${esc(s.backend ? 'Database: ' + s.label : 'Not connected')}</span></header><div class="body form">
      <p style="margin-top:0">Signed in as <b>${esc(EC.auth.user())}</b> (Admin). Every change is saved automatically - inputs, results and records - ${window.EC_EMBED ? 'in your Claude account.' : `in your Google Drive (folder “${esc((EC.CONFIG || {}).driveFolder || 'CAMBO STRUCT')}”${EC.auth.email() ? ' of ' + esc(EC.auth.email()) : ''}) and in this browser.`}</p>
      <p>Status: <b>${esc(s.state === 'synced' ? 'saved ' + (s.at ? s.at.toLocaleTimeString() : '') : s.state)}</b>${s.err ? ` · <span style="color:var(--critical)">${esc(s.err)}</span>` : ''}</p>
      ${!window.EC_EMBED && s.state === 'signin' ? '<p><button class="btn primary" data-gconnect>Sign in with Google to sync</button></p>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-syncnow>Save &amp; sync now</button>${window.EC_EMBED ? '' : '<button class="btn danger" data-signout>Sign out</button>'}</div>
    </div></div>`;
  }


  /* ---------------- router ---------------- */
  function route() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }
  function render() {
    const r = route();
    chrome(r);
    const m = $('#main');
    const v = r[0] || 'dashboard';
    m.innerHTML = v === 'elements' ? vElements(r[1], 'hand') : v === 'linked' ? vElements(r[1], 'etabs') : v === 'el' ? vElement(r[1]) : v === 'schedules' ? vSchedules() : v === 'programme' ? vProgramme() : v === 'library' ? vLibrary() : v === 'etabs' ? EC.etabs.view() : v === 'building' ? EC.building.view() : v === 'loads' ? EC.loads.view() : v === 'project' ? vProject() : vDashboard();
    if (v === 'etabs') EC.etabs.mount(m); else if (v === 'building') EC.building.mount(m); else if (v === 'loads') EC.loads.mount(m); else m.onclick = m.onchange = null;
    if (v !== 'el' && v !== 'etabs' && v !== 'building' && v !== 'loads') m.scrollTop = 0;
    $('#app').classList.remove('nav-open');
    const p = proj();
    document.title = `${v === 'el' ? ((p.elements.find(e => e.id === r[1]) || {}).mark || '') + ' · ' : ''}${p.name} · CAMBO STRUCT`;
  }
  window.addEventListener('hashchange', render);

  /* ---------------- quick search (Ctrl+K / "/") ---------------- */
  function palette() {
    if ($('.cmdk-bg')) return;
    const p = proj(), go = h => () => { location.hash = h; };
    const items = [];
    p.elements.forEach(e => items.push({ g: 'Elements', t: e.mark, s: typeName(e.type) + (e.level ? ' · ' + e.level : '') + (e.grid ? ' · ' + e.grid : ''), b: e.status, ic: (CATS.find(c => MOD[e.type] && c.k === MOD[e.type].cat) || {}).icon || 'layers', run: () => { activeTab = 'summary'; location.hash = '#/el/' + e.id; } }));
    [['dashboard', 'dashboard', 'Dashboard'], ['elements', 'layers', 'Hand-calculated elements', 'Design by hand calculation (Mathcad)']].concat(CATS.map(c => ['elements/' + c.k, c.icon, c.l, 'Hand calculation (Mathcad)']), [['library', 'book', 'Mathcad library', 'Design by hand calculation'], ['etabs', 'upload', 'Link to ETABS', 'Design with ETABS link'], ['loads', 'wind', 'Loads & combinations: auto-create EN 1990 combinations in ETABS', 'Design with ETABS link'], ['building', 'gantt', 'Building checks: drift, P-Δ, torsion, overturning, buckling', 'Design with ETABS link'], ['linked', 'layers', 'ETABS-linked elements', 'Design with ETABS link']], CATS.map(c => ['linked/' + c.k, c.icon, c.l, 'ETABS link']), [['schedules', 'table', 'Element schedules'], ['programme', 'gantt', 'Design programme'], ['project', 'gear', 'Project settings']])
      .forEach(([h, i, l, sub]) => items.push({ g: 'Go to', t: l, s: sub, ic: i, run: go('#/' + h) }));
    CATS.forEach(c => c.types.forEach(t => items.push({ g: 'New element', t: 'New ' + typeName(t), s: c.l, ic: 'plus', run: () => createEl(t) })));
    items.push({ g: 'Actions', t: 'Toggle light / dark mode', ic: 'moon', run: () => $('#themeBtn').click() });
    if (!DEMO) items.push({ g: 'Actions', t: 'Export all projects (JSON)', ic: 'download', run: () => $('#btnExport').click() });
    const bg = document.createElement('div'); bg.className = 'modal-bg cmdk-bg';
    bg.innerHTML = `<div class="cmdk" role="dialog" aria-modal="true" aria-label="Quick search"><div class="cmdk-in">${ic('search')}<input id="cmdkQ" placeholder="Search elements, pages, new element types…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="cmdk-list" role="listbox"></div><div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> or <kbd>/</kbd> anywhere</span></div></div>`;
    document.body.appendChild(bg);
    const q = $('#cmdkQ', bg), list = $('.cmdk-list', bg);
    let shown = [], sel = 0;
    const score = (it, w) => { const t = it.t.toLowerCase(), all = (it.t + ' ' + (it.s || '') + ' ' + it.g).toLowerCase(); let sc = 0; for (const x of w) { if (t.startsWith(x)) sc += 3; else if (t.includes(x)) sc += 2; else if (all.includes(x)) sc += 1; else return -1; } return sc; };
    const draw = () => {
      const w = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const r = items.map(it => ({ it, sc: score(it, w) })).filter(x => x.sc >= 0).sort((a, b) => b.sc - a.sc), gs = [...new Set(r.map(x => x.it.g))];   // groups ordered by their best match, so each header appears once
      shown = w.length ? r.sort((a, b) => gs.indexOf(a.it.g) - gs.indexOf(b.it.g)).map(x => x.it).slice(0, 60) : items.filter(it => it.g !== 'New element').slice(0, 40);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      let last = '';
      list.innerHTML = shown.length ? shown.map((it, i) => { const h = it.g !== last ? `<div class="cmdk-g">${esc(it.g)}</div>` : ''; last = it.g; return `${h}<div class="cmdk-it${i === sel ? ' sel' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">${ic(it.ic)}<b>${esc(it.t)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ''}${it.b ? pill(it.b) : ''}</div>`; }).join('') : `<div class="cmdk-empty">No match for “${esc(q.value)}”</div>`;
      const el = $('.cmdk-it.sel', list); if (el) el.scrollIntoView({ block: 'nearest' });
    };
    const close = () => bg.remove();
    const run = i => { const it = shown[i]; if (!it) return; close(); it.run(); };
    q.oninput = () => { sel = 0; draw(); };
    q.onkeydown = ev => {
      if (ev.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { run(sel); ev.preventDefault(); }
      else if (ev.key === 'Escape') close();
    };
    list.onclick = ev => { const r = ev.target.closest('[data-i]'); if (r) run(+r.dataset.i); };
    list.onmousemove = ev => { const r = ev.target.closest('[data-i]'); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; $$('.cmdk-it', list).forEach(x => x.classList.toggle('sel', +x.dataset.i === sel)); } };
    bg.addEventListener('click', ev => { if (ev.target === bg) close(); });
    draw(); q.focus();
  }
  document.addEventListener('keydown', ev => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target.tagName || '')) || ev.target.isContentEditable;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); palette(); }
    else if (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); palette(); }
  });

  /* ---------------- actions ---------------- */
  function addElement(catKey, onlyType) {
    if (onlyType) return createEl(onlyType);
    const cats = catKey ? CATS.filter(c => c.k === catKey) : CATS;
    const bg = modal('New element', `<input class="ctl" id="typeQ" placeholder="Search element types…" style="width:100%;margin-bottom:12px">${cats.filter(c => c.types.length).map(c => `<div class="tp-grp"><h4 class="tp-h">${esc(c.l)}</h4><div class="type-pick">${c.types.map(t => `<button data-type="${t}" data-q="${esc((MOD[t].name + ' ' + MOD[t].code + ' ' + (MOD[t].title || '') + ' ' + (MOD[t].mcFile || '') + ' ' + c.l).toLowerCase())}">${ic(MOD[t].icon || c.icon)}<span><b>${esc(MOD[t].name)}</b><small>${esc(MOD[t].mcFile || MOD[t].code)}</small></span></button>`).join('')}</div></div>`).join('')}`);
    const q = $('#typeQ', bg); q.focus();
    q.oninput = () => { const s = q.value.toLowerCase(); $$('[data-type]', bg).forEach(b => { b.hidden = s && !b.dataset.q.includes(s); }); $$('.tp-grp', bg).forEach(g => { g.hidden = !$$('[data-type]', g).some(b => !b.hidden); }); };
    $$('[data-type]', bg).forEach(b => b.onclick = () => { bg.remove(); createEl(b.dataset.type); });
  }
  function createEl(t) {
    {
      const e = { id: uid(), type: t, mark: nextMark(t), level: '', grid: '', qty: 1, status: 'Not started', start: today(), due: addDays(today(), 14), assignee: proj().engineer || '', inputs: defaults(t) };
      proj().elements.push(e); save(); activeTab = 'summary'; location.hash = '#/el/' + e.id;
    }
  }
  function dupElement(id) {
    const p = proj(), e = p.elements.find(x => x.id === id); if (!e) return;
    const n = JSON.parse(JSON.stringify(e)); n.id = uid(); n.mark = nextMark(e.type); n.status = 'Not started';
    p.elements.splice(p.elements.indexOf(e) + 1, 0, n); save(); toast(`Duplicated as ${n.mark}`); location.hash = '#/el/' + n.id;
  }
  function delElement(id) {
    const p = proj(), e = p.elements.find(x => x.id === id); if (!e) return;
    modal('Delete element', `<p>Delete <b>${esc(e.mark)}</b> (${esc(typeName(e.type))}) and its calculation? This cannot be undone.</p>`, () => {
      p.elements = p.elements.filter(x => x.id !== id); cache.delete(id); save();
      if (route()[0] === 'el') location.hash = listHref(e); else render();
    }, 'Delete');
  }
  function refreshOutput(e) {
    if (MOD[e.type].mc) return;
    const out = $('#out'); if (!out) return;
    const y = $('#main').scrollTop;
    out.innerHTML = vOutput(e);
    $('#main').scrollTop = y;
  }

  document.addEventListener('click', ev => {
    const tr = ev.target.closest('[data-tradd],[data-trdel]');
    if (tr) {
      const e = proj().elements.find(x => x.id === route()[1]); if (!e) return;
      const k = tr.dataset.tradd || tr.dataset.trdel, tb = e.inputs[k];
      if (tr.dataset.tradd) tb.push(tb.length ? tb[tb.length - 1].slice() : MOD[e.type].groups.flatMap(g => g.f).find(f => f.k === k).cols.map(() => 0));
      else if (tb.length > 1) tb.splice(+tr.dataset.r, 1);
      save(); const y = $('.inputs') ? $('.inputs').scrollTop : 0; render(); if ($('.inputs')) $('.inputs').scrollTop = y; return;
    }
    const nt = ev.target.closest('[data-newtype]'); if (nt) return addElement(null, nt.dataset.newtype);
    const t = ev.target.closest('[data-open],[data-go],[data-add],[data-dup],[data-del],[data-tab],[data-print],[data-printpage],[data-csv],[data-stype],[data-lg],[data-reset],[data-newproj],[data-useproj],[data-delproj],[data-demo],[data-syncnow],[data-gconnect],[data-signout]');
    if (!t) return;
    const d = t.dataset;
    if (d.dup !== undefined) { ev.stopPropagation(); return dupElement(d.dup); }
    if (d.del !== undefined) { ev.stopPropagation(); return delElement(d.del); }
    if (d.open) { activeTab = activeTab || 'summary'; location.hash = '#/el/' + d.open; return; }
    if (d.go !== undefined) { location.hash = '#/' + d.go; return; }
    if (d.add !== undefined) return addElement(d.add);
    if (d.tab) { activeTab = d.tab; $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === d.tab)); $$('[data-pane]').forEach(p => { p.style.display = p.dataset.pane === d.tab ? '' : 'none'; }); return; }
    if (d.print !== undefined || d.printpage !== undefined) return window.print();
    if (d.csv !== undefined) return schedCSV();
    if (d.stype) { schedType = d.stype; return render(); }
    if (d.lg !== undefined) { libG = d.lg; return render(); }
    if (d.reset !== undefined) {
      const e = proj().elements.find(x => x.id === route()[1]); if (!e) return;
      modal('Restore defaults', `<p>Replace all inputs of <b>${esc(e.mark)}</b> with the default values?</p>`, () => { e.inputs = defaults(e.type); save(); render(); }, 'Restore');
      return;
    }
    if (d.newproj !== undefined) {
      const bg = modal('New project', `<div class="form"><div class="row2"><div><label>Project name</label><input id="npName" value="New project"></div><div><label>Project number</label><input id="npNum" value="CS-${new Date().getFullYear()}-"></div></div></div>`, () => {
        const p = { id: uid(), name: $('#npName', bg).value || 'New project', number: $('#npNum', bg).value, client: '', location: '', engineer: proj().engineer || '', checker: '', code: 'Eurocodes', notes: '', elements: [] };
        DB.projects.push(p); DB.current = p.id; save(); location.hash = '#/dashboard'; render();
      }, 'Create');
      return;
    }
    if (d.useproj) { DB.current = d.useproj; save(); cache.clear(); location.hash = '#/dashboard'; return render(); }
    if (d.delproj) {
      const p = DB.projects.find(x => x.id === d.delproj);
      modal('Delete project', `<p>Delete project <b>${esc(p.name)}</b> with ${p.elements.length} elements from this browser?</p>`, () => {
        DB.projects = DB.projects.filter(x => x.id !== p.id);
        if (!DB.projects.length) DB = seed();
        if (DB.current === p.id) DB.current = DB.projects[0].id;
        save(); render();
      }, 'Delete');
      return;
    }
    if (d.signout !== undefined) { EC.auth.signOut(); location.hash = ''; location.reload(); return; }
    if (d.syncnow !== undefined) { EC.sync.now().then(() => { toast('Synced'); render(); }); return; }
    if (d.gconnect !== undefined && d.gconnect !== '') { const s0 = EC.sync.status(); if (s0.state === 'error') { toast(s0.err + ' - retrying…'); EC.sync.now().then(() => { const s1 = EC.sync.status(); toast(s1.state === 'synced' ? 'Google Drive synced' : s1.err); render(); }); return; } EC.sync.connectGoogle().then(() => { toast('Google Drive connected'); render(); }).catch(e => toast(e.message)); return; }
    if (d.demo !== undefined) { const s = seed(); DB.projects.push(s.projects[0]); DB.current = s.current; save(); toast('Demo project added'); location.hash = '#/dashboard'; render(); }
  });

  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.k) {
      const e = proj().elements.find(x => x.id === route()[1]); if (!e) return;
      const f = MOD[e.type].groups.flatMap(g => g.f).find(x => x.k === t.dataset.k);
      let v = t.value;
      if (typeof f.d === 'number' || (f.opts && typeof f.opts[0].v === 'number')) { v = parseFloat(v); if (!Number.isFinite(v)) return; }
      e.inputs[f.k] = v; save(); refreshOutput(e);
      return;
    }
    if (t.dataset.t) {
      const e = proj().elements.find(x => x.id === route()[1]); if (!e) return;
      const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
      const tb = e.inputs[t.dataset.t]; tb[+t.dataset.r][+t.dataset.c] = v; save(); refreshOutput(e);
      return;
    }
    if (t.dataset.m) {
      const e = proj().elements.find(x => x.id === route()[1]); if (!e) return;
      e[t.dataset.m] = t.dataset.m === 'qty' ? Math.max(1, parseInt(t.value, 10) || 1) : t.value; save();
      if (t.dataset.m === 'mark') { const h = $('.page-head h1 span'); if (h) h.textContent = t.value; }
      if (t.dataset.m === 'qty') refreshOutput(e);
      return;
    }
    if (t.dataset.p) { proj()[t.dataset.p] = t.value; save(); chrome(route()); return; }
    if (t.id === 'libQ') { libQ = t.value; const pos = t.selectionStart; render(); const n = $('#libQ'); n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'schedFilter') { schedFilter = ev.target.value; render(); }
    if (ev.target.id === 'schedType') { schedType = ev.target.value; render(); }
    if (ev.target.id === 'projSel') { DB.current = ev.target.value; save(); cache.clear(); location.hash = '#/dashboard'; render(); }
  });

  /* top bar */
  $('#menuBtn').innerHTML = ic('menu');
  $('#menuBtn').onclick = () => $('#app').classList.toggle('nav-open');
  $('#btnExport').innerHTML = ic('download') + 'Export';
  $('#btnImport').innerHTML = ic('upload') + 'Import';
  $('#searchBtn').onclick = palette;
  $('#btnExport').onclick = () => download(`cambo-struct-projects-${today()}.json`, JSON.stringify(DB, null, 1), 'application/json');
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = ev => {
    const f = ev.target.files[0]; if (!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt);
      const list = d.projects || (d.elements ? [d] : null);
      if (!list) throw new Error('not a project file');
      list.forEach(p => { p.id = uid(); p.elements = (p.elements || []).filter(e => MOD[e.type]).map(e => Object.assign(e, { id: uid(), inputs: Object.assign(defaults(e.type), e.inputs) })); DB.projects.push(p); });
      DB.current = DB.projects[DB.projects.length - 1].id; save(); cache.clear(); toast(`Imported ${list.length} project(s)`); location.hash = '#/dashboard'; render();
    }).catch(err => toast('Import failed: ' + err.message));
    ev.target.value = '';
  };
  const acct = $('#acctBtn');
  if (acct) {
    acct.innerHTML = `<span class="av">${esc((EC.auth.user() || '?').slice(0, 1).toUpperCase())}</span><span class="who"><b>${esc(EC.auth.user())}</b><small>${DEMO ? 'Demo account' : 'Admin'}</small></span>`;
    acct.onclick = () => {
      if (window.EC_EMBED) return toast('Signed in with your Claude account');
      modal(DEMO ? 'Demo account' : 'Admin account', DEMO
        ? '<p>You are using the <b>Demo account</b>: every calculation works, but nothing is saved. Sign in as Admin to keep your projects, calculations and records.</p>'
        : `<p>Signed in as <b>${esc(EC.auth.user())}</b> (Admin). Your data is saved in your Google Drive and synced to every device where you sign in.</p><p class="hint">Database: Google Drive${EC.auth.email() ? ' · ' + esc(EC.auth.email()) : ''}</p>`,
        () => { EC.auth.signOut(); location.hash = ''; location.reload(); }, DEMO ? 'Sign in as Admin' : 'Sign out');
    };
  }
  $('#themeBtn').onclick = () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', nx);
    try { localStorage.setItem('cambo.theme', nx); } catch (e) { /* private mode */ }
    chrome(route());
  };
  EC.etabs.install({ proj, save, toast, modal, ic, fmt, ubar, uid, today, addDays, render: () => render() });
  EC.building.install({ proj, save, toast, ic, fmt, ubar, render: () => render() });
  EC.loads.install({ proj, save, toast, ic, fmt, render: () => render() });
  EC.mcui.install({
    MOD, STATUS, proj, save, toast, modal, ic, fmt, ubar, route, catName: k => (CATS.find(c => c.k === k) || {}).l || k,
    render: () => render(),
    onResult: e => {
      const r = route();
      if (r[0] === 'el') return;
      clearTimeout(resT); resT = setTimeout(() => { if (route()[0] !== 'el' && !document.querySelector('.modal-bg') && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) render(); }, 300);
    }
  });
  let resT = null;
  if (!DEMO) EC.sync.start({
    get: () => DB,
    set: nd => {
      const keepCur = DB.current;
      DB.projects = nd.projects.length ? nd.projects : DB.projects; DB.tomb = nd.tomb; DB.metaU = nd.metaU;
      DB.current = DB.projects.some(p => p.id === nd.current) ? nd.current : (DB.projects.some(p => p.id === keepCur) ? keepCur : DB.projects[0].id);
      primeSeen(); cache.clear();
      try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* ignore */ }
      const a = document.activeElement;
      if (!(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) render();
    },
    status: () => setSync()
  });
  render();
  setSync();
})();
