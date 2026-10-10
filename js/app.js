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
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
  };
  const ic = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || P.layers}"/></svg>`;

  /* ---------------- domain ---------------- */
  const CATS = [
    { k: 'foundations', l: 'Foundations', icon: 'footing', types: ['footing', 'pilecap'] },
    { k: 'columns', l: 'Columns', icon: 'column', types: ['column'] },
    { k: 'beams', l: 'Beams', icon: 'beam', types: ['beam'] },
    { k: 'slabs', l: 'Slabs', icon: 'slab', types: ['slab', 'punching'] },
    { k: 'steel', l: 'Steelwork', icon: 'steel', types: ['steel'] }
  ];
  const STATUS = ['Not started', 'In design', 'Checked', 'Approved', 'IFC'];
  const STATUS_VAR = ['--st0', '--st1', '--st2', '--st3', '--st4'];
  const MOD = EC.modules;
  const defaults = type => { const o = {}; MOD[type].groups.forEach(g => g.f.forEach(f => { o[f.k] = f.d; })); return o; };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

  /* ---------------- store ---------------- */
  let DB;
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  let saveT;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('Could not save in this browser'); } }, 250); }
  function seed() {
    const t = today();
    const el = (type, mark, level, grid, qty, status, start, due, inputs) => ({ id: uid(), type, mark, level, grid, qty, status, start: addDays(t, start), due: addDays(t, due), assignee: 'RA VUTHA', inputs: Object.assign(defaults(type), inputs || {}) });
    const p = {
      id: uid(), name: 'CAMBO Tower – Block A', number: 'CS-2026-014', client: 'Demo Client Co., Ltd.', location: 'Phnom Penh',
      engineer: 'RA VUTHA', checker: '', code: 'Eurocodes (EN 1990:2023, EN 1992-1-1:2023, EN 1993-1-1, EN 1997)', notes: 'Demo project - edit or delete freely.',
      elements: [
        el('pilecap', 'PC1', 'Foundation', 'B/2', 6, 'Approved', -40, -8),
        el('pilecap', 'PC2', 'Foundation', 'C/3', 4, 'Checked', -35, 3, { NEd: 8400, MEx: 600 }),
        el('footing', 'F1', 'Foundation', 'A/1', 4, 'IFC', -45, -15),
        el('footing', 'F2', 'Foundation', 'A/4', 2, 'In design', -10, 6, { NEd: 2300, Nk: 1650 }),
        el('column', 'C1', 'GF–L3', 'B/2', 12, 'Checked', -30, 2),
        el('column', 'C2', 'L4–L8', 'B/2', 10, 'In design', -12, 9, { N: 1500, b: 400, h: 400, nh: 3, nb: 3, dl: 16 }),
        el('column', 'C3', 'GF–L3', 'A/1', 8, 'In design', -8, 12, { N: 3600, My1: 160, My2: -120, l: 4.2 }),
        el('beam', 'B1', 'L1–L8', '2/A–C', 24, 'Approved', -28, -4),
        el('beam', 'B2', 'L1–L8', 'B/1–4', 16, 'In design', -6, 10, { MEd: 340, VEd: 260, L: 7.5 }),
        el('beam', 'TB1', 'Roof', '3/A–B', 2, 'Not started', 5, 25, { b: 400, h: 900, MEd: 780, VEd: 520, nb: 6, db: 25, L: 9 }),
        el('slab', 'S1', 'L1–L8', 'Typical', 8, 'Checked', -20, 4),
        el('slab', 'S2', 'Roof', 'Typical', 1, 'Not started', 8, 30, { h: 175, qk: 1.5, gsdl: 2.5 }),
        el('punching', 'P1', 'L1–L8', 'B/2', 8, 'In design', -4, 14, { VEd: 640 }),
        el('steel', 'SB1', 'Roof', 'Canopy', 6, 'Not started', 10, 35),
        el('steel', 'SC1', 'Roof', 'Canopy', 4, 'Not started', 12, 35, { sec: 'HEB 240', L: 4.5, NEd: 600, MEd: 45, VEd: 30, kLT: 1, wk: 0 })
      ]
    };
    return { projects: [p], current: p.id };
  }
  DB = load() || seed();
  const proj = () => DB.projects.find(p => p.id === DB.current) || DB.projects[0];

  /* ---------------- results cache ---------------- */
  const cache = new Map();
  function result(e) {
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
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  const pill = s => `<span class="pill"><span class="dot" style="background:var(${STATUS_VAR[STATUS.indexOf(s)] || '--muted'})"></span>${esc(s)}</span>`;
  const resTag = r => r.error ? `<span class="res bad">${ic('alert')}Error</span>` : r.ok ? `<span class="res ok">${ic('check')}OK</span>` : `<span class="res bad">${ic('x')}Revise</span>`;
  function ubar(U) {
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
    const cnt = k => p.elements.filter(e => MOD[e.type] && MOD[e.type].cat === k).length;
    const a = (href, icon, label, extra, active) => `<a href="#/${href}" class="${active ? 'active' : ''}">${ic(icon)}<span>${label}</span>${extra || ''}</a>`;
    const r0 = route[0] || 'dashboard';
    $('#sidebar').innerHTML = `<div class="nav">
      ${a('dashboard', 'dashboard', 'Dashboard', '', r0 === 'dashboard')}
      <h4>Project - main elements</h4>
      ${a('elements', 'layers', 'All elements', `<span class="count">${p.elements.length}</span>`, r0 === 'elements' && !route[1])}
      <div class="sub">${CATS.map(c => a('elements/' + c.k, c.icon, c.l, `<span class="count">${cnt(c.k)}</span>`, r0 === 'elements' && route[1] === c.k)).join('')}</div>
      <h4>Schedules</h4>
      ${a('schedules', 'table', 'Element schedules', '', r0 === 'schedules')}
      ${a('programme', 'gantt', 'Design programme', '', r0 === 'programme')}
      <h4>Reference</h4>
      ${a('library', 'book', 'Mathcad library', `<span class="count">${EC.library.length}</span>`, r0 === 'library')}
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

    const cats = CATS.map(c => {
      const xs = R.filter(x => MOD[x.e.type].cat === c.k);
      const ok = xs.filter(x => x.r.ok).length;
      const mu = xs.reduce((a, x) => Math.max(a, Number.isFinite(x.r.Umax) ? x.r.Umax : 0), 0);
      const dn = xs.filter(x => x.e.status === 'Approved' || x.e.status === 'IFC').length;
      return `<div class="card cat-card" data-go="elements/${c.k}"><div class="top"><div class="ic">${ic(c.icon)}</div><div><h3>${c.l}</h3><div class="meta">${c.types.map(typeName).join(' · ')}</div></div></div>
        <div class="nums"><div><b>${xs.length}</b>types</div><div><b>${xs.reduce((a, x) => a + (+x.e.qty || 1), 0)}</b>no. off</div><div><b style="color:${xs.length - ok ? 'var(--critical)' : 'inherit'}">${xs.length - ok}</b>revise</div><div><b>${xs.length ? fmt(mu, 2) : '–'}</b>U max</div></div>
        <div style="margin-top:10px">${ubar(xs.length ? dn / xs.length : 0).replace(/<span class="v">.*?<\/span>/, `<span class="v">${xs.length ? Math.round(dn / xs.length * 100) : 0}%</span>`).replace('title="Maximum utilisation', 'title="Approved / IFC share')}</div></div>`;
    }).join('');

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
      <h2 style="font-size:16px;margin:22px 0 10px">Main elements</h2>
      <div class="grid g3">${cats}</div>`;
  }

  /* ---------------- element list ---------------- */
  function vElements(catKey) {
    const p = proj();
    const cat = CATS.find(c => c.k === catKey);
    const els = p.elements.filter(e => !cat || MOD[e.type].cat === cat.k);
    const rows = els.map(e => { const r = result(e); return `<tr class="click" data-open="${e.id}">
      <td class="mark">${esc(e.mark)}</td><td>${esc(typeName(e.type))}</td><td>${esc(e.level || '')}</td><td>${esc(e.grid || '')}</td><td class="num">${esc(e.qty)}</td>
      <td>${pill(e.status)}</td><td class="num">${esc(e.due || '')}</td><td>${ubar(r.Umax)}</td><td>${resTag(r)}</td>
      <td class="no-print" style="white-space:nowrap"><button class="btn sm" data-dup="${e.id}" title="Duplicate">${ic('copy')}</button> <button class="btn sm danger" data-del="${e.id}" title="Delete">${ic('trash')}</button></td></tr>`; }).join('');
    return `<div class="page-head"><div><h1>${cat ? cat.l : 'All elements'}</h1><div class="sub">${cat ? cat.types.map(typeName).join(' · ') : 'Project → main elements → elements'} · ${els.length} element types</div></div>
      <div class="actions"><button class="btn primary" data-add="${cat ? cat.k : ''}">${ic('plus')}New element</button></div></div>
      <div class="tabs">${[{ k: '', l: 'All' }].concat(CATS).map(c => `<button class="${(c.k || '') === (catKey || '') ? 'active' : ''}" data-go="elements${c.k ? '/' + c.k : ''}">${c.l}<span class="badge">${p.elements.filter(e => !c.k || MOD[e.type].cat === c.k).length}</span></button>`).join('')}</div>
      <div class="card"><div class="tbl-wrap">${els.length ? `<table class="tbl"><thead><tr><th>Mark</th><th>Type</th><th>Level</th><th>Grid / location</th><th class="num">Qty</th><th>Status</th><th class="num">Due</th><th>Utilisation</th><th>Result</th><th class="no-print"></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">No elements in this group yet.<br><br><button class="btn primary" data-add="${cat ? cat.k : ''}">${ic('plus')}Add the first one</button></div>`}</div></div>`;
  }

  /* ---------------- element editor ---------------- */
  let activeTab = 'summary';
  function vElement(id) {
    const p = proj(), e = p.elements.find(x => x.id === id);
    if (!e) return `<div class="empty">Element not found. <a href="#/elements">Back to elements</a></div>`;
    const mod = MOD[e.type];
    const inputs = mod.groups.map(g => `<div class="grp"><h4>${esc(g.t)}</h4>${g.f.map(f => {
      const v = e.inputs[f.k] !== undefined ? e.inputs[f.k] : f.d;
      const ctl = f.opts ? `<select data-k="${f.k}">${f.opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`
        : `<input data-k="${f.k}" type="${typeof f.d === 'number' ? 'number' : 'text'}" step="any" value="${esc(v)}" inputmode="decimal">`;
      return f.opts && !f.u ? `<div class="field wide"><span class="fl">${EC.sym(f.l)}</span>${ctl}</div>` : `<div class="field"><span class="fl">${EC.sym(f.l)}</span>${ctl}<span class="fu">${esc(f.u || '')}</span></div>`;
    }).join('')}</div>`).join('');
    const opt = (arr, v) => arr.map(s => `<option ${s === v ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `<div class="page-head no-print"><div><a href="#/elements/${mod.cat}" class="btn sm" style="margin-bottom:8px">${ic('back')}${esc(CATS.find(c => c.k === mod.cat).l)}</a>
        <h1><span style="color:var(--accent)">${esc(e.mark)}</span> · ${esc(mod.name)}</h1><div class="sub">${esc(mod.code)} · Mathcad reference: ${esc(mod.mathcad)}</div></div>
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
      <div class="editor">
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
    const detail = `<div class="drawings">${r.svg || ''}</div>${bars}`;
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
    const head = ['Mark', 'Level', 'Grid', 'Qty'].concat(mod.schedCols.map(c => c[1])).concat(['U max', 'Result', 'Status']);
    const rows = els.map(e => { const r = result(e), s = mod.sched(Object.assign(defaults(e.type), e.inputs), r); return { e, r, cells: [e.mark, e.level || '', e.grid || '', e.qty || 1].concat(mod.schedCols.map(c => s[c[0]])) }; });
    return `<div class="page-head"><div><h1>Element schedules</h1><div class="sub">One schedule per element type - as issued on the drawings</div></div>
      <div class="actions"><select class="ctl" id="schedFilter"><option value="">All statuses</option>${STATUS.map(s => `<option ${s === schedFilter ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button class="btn" data-csv>${ic('download')}CSV</button><button class="btn" data-printpage>${ic('print')}Print</button></div></div>
      <div class="tabs">${types.map(t => `<button class="${t === schedType ? 'active' : ''}" data-stype="${t}">${esc(MOD[t].name)}<span class="badge">${p.elements.filter(e => e.type === t).length}</span></button>`).join('')}</div>
      <div class="print-head"><div><b>CAMBO STRUCT</b> · ${esc(p.name)} (${esc(p.number)})<br>${esc(mod.name)} schedule</div><div>${today()}</div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h, k) => `<th class="${k === 3 ? 'num' : ''}">${EC.sym(h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(x => `<tr class="click" data-open="${x.e.id}">${x.cells.map((c, k) => `<td class="${k === 0 ? 'mark' : ''} ${k === 3 ? 'num' : ''}">${esc(c === undefined ? '' : c)}</td>`).join('')}<td>${ubar(x.r.Umax)}</td><td>${resTag(x.r)}</td><td>${pill(x.e.status)}</td></tr>`).join('') || `<tr><td colspan="${head.length}" class="empty">No elements match</td></tr>`}
      </tbody></table></div></div>
      <p style="color:var(--muted);font-size:12px">Totals: ${els.reduce((a, e) => a + (+e.qty || 1), 0)} no. off · rebar ≈ ${fmt(rows.reduce((a, x) => a + x.r.rebarKg * (+x.e.qty || 1), 0), 0)} kg${rows.some(x => x.r.steelMass) ? ` · steel ≈ ${fmt(rows.reduce((a, x) => a + (x.r.steelMass || 0) * (+x.e.qty || 1), 0), 0)} kg` : ''}</p>`;
  }
  function schedCSV() {
    const p = proj(), mod = MOD[schedType];
    const head = ['Mark', 'Level', 'Grid', 'Qty'].concat(mod.schedCols.map(c => c[1].replace(/_/g, ''))).concat(['Umax', 'Result', 'Status']);
    const q = v => `"${String(v === undefined ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(',')].concat(p.elements.filter(e => e.type === schedType && (!schedFilter || e.status === schedFilter)).map(e => {
      const r = result(e), s = mod.sched(Object.assign(defaults(e.type), e.inputs), r);
      return [e.mark, e.level, e.grid, e.qty].concat(mod.schedCols.map(c => s[c[0]])).concat([fmt(r.Umax, 3), r.ok ? 'OK' : 'REVISE', e.status]).map(q).join(',');
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
      <div class="grid g2">${L.map(x => `<div class="card lib-card"><h3>${ic('folder')}${esc(x.folder)} <span class="badge">${esc(x.type)}</span></h3><p>${esc(x.desc)}</p>${x.files.map(f => `<code>${esc(f)}</code>`).join('')}</div>`).join('') || '<div class="empty">No match</div>'}</div>`;
  }

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
        <p style="color:var(--muted);font-size:12px;margin-top:14px">Data is stored locally in this browser. Use <b>Export</b> in the top bar to back up or share a project file, and <b>Import</b> to load it on another machine.</p>
        <button class="btn" data-demo>Add demo project</button></div></div></div>`;
  }

  /* ---------------- router ---------------- */
  function route() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }
  function render() {
    const r = route();
    chrome(r);
    const m = $('#main');
    const v = r[0] || 'dashboard';
    m.innerHTML = v === 'elements' ? vElements(r[1]) : v === 'el' ? vElement(r[1]) : v === 'schedules' ? vSchedules() : v === 'programme' ? vProgramme() : v === 'library' ? vLibrary() : v === 'project' ? vProject() : vDashboard();
    if (v !== 'el') m.scrollTop = 0;
    $('#app').classList.remove('nav-open');
    const p = proj();
    document.title = `${v === 'el' ? ((p.elements.find(e => e.id === r[1]) || {}).mark || '') + ' · ' : ''}${p.name} · CAMBO STRUCT`;
  }
  window.addEventListener('hashchange', render);

  /* ---------------- actions ---------------- */
  function addElement(catKey) {
    const cats = catKey ? CATS.filter(c => c.k === catKey) : CATS;
    const bg = modal('New element', `<div class="type-pick">${cats.flatMap(c => c.types).map(t => `<button data-type="${t}">${ic(MOD[t].icon === 'punch' ? 'punch' : MOD[t].icon)}<span><b>${esc(MOD[t].name)}</b><small>${esc(MOD[t].code)}</small></span></button>`).join('')}</div>`);
    $$('[data-type]', bg).forEach(b => b.onclick = () => {
      const t = b.dataset.type, e = { id: uid(), type: t, mark: nextMark(t), level: '', grid: '', qty: 1, status: 'Not started', start: today(), due: addDays(today(), 14), assignee: proj().engineer || '', inputs: defaults(t) };
      proj().elements.push(e); save(); bg.remove(); activeTab = 'summary'; location.hash = '#/el/' + e.id;
    });
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
      if (route()[0] === 'el') location.hash = '#/elements/' + MOD[e.type].cat; else render();
    }, 'Delete');
  }
  function refreshOutput(e) {
    const out = $('#out'); if (!out) return;
    const y = $('#main').scrollTop;
    out.innerHTML = vOutput(e);
    $('#main').scrollTop = y;
  }

  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-open],[data-go],[data-add],[data-dup],[data-del],[data-tab],[data-print],[data-printpage],[data-csv],[data-stype],[data-lg],[data-reset],[data-newproj],[data-useproj],[data-delproj],[data-demo]');
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
    if (ev.target.id === 'projSel') { DB.current = ev.target.value; save(); cache.clear(); location.hash = '#/dashboard'; render(); }
  });

  /* top bar */
  $('#menuBtn').innerHTML = ic('menu');
  $('#menuBtn').onclick = () => $('#app').classList.toggle('nav-open');
  $('#btnExport').innerHTML = ic('download') + 'Export';
  $('#btnImport').innerHTML = ic('upload') + 'Import';
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
  $('#themeBtn').onclick = () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', nx);
    try { localStorage.setItem('cambo.theme', nx); } catch (e) { /* private mode */ }
    chrome(route());
  };
  render();
})();
