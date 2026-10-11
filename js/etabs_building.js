/* Building checks from ETABS (global / storey level), read live through the ETABS link (tools/etabs_bridge).
 * Checks: inter-storey drift (EC8 4.4.3.2), wind drift (SLS), P-Δ stability coefficient θ and the
 * second-order amplification (EC8 4.4.2.2), torsional irregularity (Δmax/Δavg), base shear & storey shear /
 * overturning moment profiles with overturning stability, and global buckling αcr (EN 1993-1-1 5.2.1,
 * EN 1992-1-1 5.8.2). Units: kN, m. Inputs and the last ETABS read are kept with the project. */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  let api = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ROLES = { seis: 'Seismic', wind: 'Wind SLS', uls: 'ULS', off: 'Not used' };
  const ROLE_ORDER = ['seis', 'wind', 'uls', 'off'];
  const DEF = { qd: 3.0, nu: 0.5, alpha: 0.005, windLim: 500, windLimH: 500, Bx: 20, By: 20, fos: 1.0 };
  let busy = '', err = '';

  const B = () => { const p = api.proj(); p.building = p.building || {}; const b = p.building; b.set = Object.assign({}, DEF, b.set || {}); b.roles = b.roles || {}; return b; };
  function guessRole(c) {
    const n = c.toUpperCase();
    if (/\bW(IND)?[XY]?\b|WIND/.test(n) && /SLS|SER|CHAR|FREQ/.test(n)) return 'wind';
    if (/\bE[XY]?\b|EQ|SEIS|\bRS\b|SPEC|SPECTR/.test(n)) return 'seis';
    if (/ULS|STR|1\.35|1\.5/.test(n)) return 'uls';
    return 'off';
  }

  /* ---------- checks ---------- */
  const maxBy = (xs, f) => xs.reduce((a, x) => (a === null || f(x) > f(a) ? x : a), null);
  function compute(b) {
    const d = b.data; if (!d) return null;
    const s = b.set, role = c => b.roles[c] || 'off';
    const st = d.stories.slice().sort((a, c) => a.elev - c.elev);
    const H = st.length ? st[st.length - 1].elev - (st[0].elev - st[0].h) : 0;
    const out = { st, H };
    // 1. seismic inter-storey drift - EC8 4.4.3.2: dr = qd·de ; dr·ν ≤ α·h
    out.drift = []; out.wind = [];
    st.forEach(x => ['X', 'Y'].forEach(dir => {
      const se = d.drifts.filter(r => r.story === x.name && r.dir === dir && role(r.combo) === 'seis');
      const g = maxBy(se, r => r.drift);
      if (g) { const dr = s.qd * g.drift; out.drift.push({ story: x.name, z: x.elev, h: x.h, dir, combo: g.combo, de: g.drift, dr, v: dr * s.nu, U: dr * s.nu / s.alpha }); }
      const wi = maxBy(d.drifts.filter(r => r.story === x.name && r.dir === dir && role(r.combo) === 'wind'), r => r.drift);
      if (wi) out.wind.push({ story: x.name, z: x.elev, h: x.h, dir, combo: wi.combo, v: wi.drift, U: wi.drift * s.windLim });
    }));
    // 2. P-Δ - EC8 4.4.2.2(2): θ = Ptot·dr / (Vtot·h)
    out.theta = [];
    const fBot = d.forces.filter(r => !r.loc || /bot/i.test(r.loc));
    st.forEach(x => ['X', 'Y'].forEach(dir => {
      const dd = out.drift.find(r => r.story === x.name && r.dir === dir); if (!dd) return;
      const fs = fBot.filter(r => r.story === x.name && role(r.combo) === 'seis');
      const P = Math.max(0, ...fs.map(r => Math.abs(r.P)));
      const V = Math.max(0, ...fs.map(r => Math.abs(dir === 'X' ? r.VX : r.VY)));
      if (!(P > 0 && V > 0)) return;
      const th = P * dd.dr / (V * x.h);
      const amp = th <= 0.1 ? 1 : th <= 0.2 ? 1 / (1 - th) : null;
      out.theta.push({ story: x.name, z: x.elev, h: x.h, dir, P, V, dr: dd.dr, th, amp, U: th / 0.3,
        note: th <= 0.1 ? 'second-order effects may be neglected' : th <= 0.2 ? `multiply seismic action effects by 1/(1−θ) = ${api.fmt(1 / (1 - th), 3)}` : th <= 0.3 ? 'rigorous second-order analysis required' : 'θ > 0.3 not permitted - stiffen the structure' });
    }));
    // 3. torsion - max / average displacement per storey
    out.tors = [];
    st.forEach(x => ['X', 'Y'].forEach(dir => {
      const g = maxBy(d.torsion.filter(r => r.story === x.name && r.dir === dir && role(r.combo) !== 'off' && role(r.combo) !== 'uls'), r => r.ratio);
      if (g) out.tors.push({ story: x.name, z: x.elev, dir, combo: g.combo, ratio: g.ratio, U: g.ratio / 1.4, cls: g.ratio <= 1.2 ? 'Regular' : g.ratio <= 1.4 ? 'Torsional irregularity' : 'Extreme torsional irregularity' });
    }));
    // 4. base shear and overturning
    const Wseis = Math.max(0, ...d.base.filter(r => role(r.combo) === 'seis').map(r => Math.abs(r.FZ)));
    out.base = d.base.filter(r => role(r.combo) !== 'off').map(r => {
      const W = Math.abs(r.FZ) > 1 ? Math.abs(r.FZ) : Wseis, Wfrom = Math.abs(r.FZ) > 1 ? '' : 'G+ψ2Q';
      const Mx = Math.abs(r.MX), My = Math.abs(r.MY);
      const fx = Mx > 1e-6 && W ? W * s.By / 2 / Mx : Infinity, fy = My > 1e-6 && W ? W * s.Bx / 2 / My : Infinity;
      const fos = Math.min(fx, fy);
      return { combo: r.combo + (r.step ? ' ' + r.step : ''), role: role(r.combo), Vx: Math.abs(r.FX), Vy: Math.abs(r.FY), W, Wfrom, Mx, My, cx: W ? Math.abs(r.FX) / W : 0, cy: W ? Math.abs(r.FY) / W : 0, fos, U: Number.isFinite(fos) ? s.fos / fos : 0 };
    });
    out.prof = st.map(x => {
      const fs = fBot.filter(r => r.story === x.name && role(r.combo) !== 'off' && role(r.combo) !== 'uls');
      return { story: x.name, z: x.elev, VX: Math.max(0, ...fs.map(r => Math.abs(r.VX))), VY: Math.max(0, ...fs.map(r => Math.abs(r.VY))), MX: Math.max(0, ...fs.map(r => Math.abs(r.MX))), MY: Math.max(0, ...fs.map(r => Math.abs(r.MY))) };
    });
    // 5. global buckling
    const bf = d.buckling.filter(r => r.factor > 0).sort((a, c) => a.factor - c.factor);
    out.buck = bf;
    if (bf.length) { const a = bf[0].factor; out.acr = { a, U: 3 / a, k: a > 1 ? 1 / (1 - 1 / a) : Infinity, note: a >= 10 ? 'first-order analysis is sufficient (αcr ≥ 10)' : a >= 3 ? `amplify the sway (horizontal) effects by 1/(1−1/αcr) = ${api.fmt(1 / (1 - 1 / a), 3)}` : 'αcr < 3: full second-order analysis required' }; }
    return out;
  }

  /* ---------- small storey-profile chart (value vs height) ---------- */
  function profile(series, opt) {
    const W = 380, Hh = 260, l = 64, r = 34, t = 12, bt = 34;
    const zs = series.flatMap(s => s.pts.map(p => p.z)); if (!zs.length) return '';
    const zmax = Math.max(...zs), vmax = Math.max(opt.limit || 0, ...series.flatMap(s => s.pts.map(p => p.v))) * 1.1 || 1;
    const X = v => l + v / vmax * (W - l - r), Y = z => t + (1 - z / zmax) * (Hh - t - bt);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * vmax);
    const fmtv = opt.fmt || (v => api.fmt(v, 3));
    const lines = series.map(s => { const ps = s.pts.slice().sort((a, c) => a.z - c.z);
      return `<polyline points="${ps.map(p => X(p.v).toFixed(1) + ',' + Y(p.z).toFixed(1)).join(' ')}" fill="none" stroke="var(${s.c})" stroke-width="2" stroke-linejoin="round"/>` +
        ps.map(p => `<g class="pt"><circle cx="${X(p.v).toFixed(1)}" cy="${Y(p.z).toFixed(1)}" r="4" fill="var(${s.c})" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(p.v).toFixed(1)}" cy="${Y(p.z).toFixed(1)}" r="10" fill="transparent"><title>${esc(p.story)} · ${esc(s.n)}: ${fmtv(p.v)}${opt.unit ? ' ' + opt.unit : ''}</title></circle></g>`).join(''); }).join('');
    const storyTicks = series[0].pts.slice().sort((a, c) => a.z - c.z).filter((p, i, a) => a.length <= 12 || i % Math.ceil(a.length / 12) === 0 || i === a.length - 1);
    return `<figure class="bc-chart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(opt.title)}">
      ${ticks.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${t}" y2="${Hh - bt}" stroke="var(--grid)"/><text x="${X(v)}" y="${Hh - bt + 14}" text-anchor="middle" class="ax">${fmtv(v)}</text>`).join('')}
      ${storyTicks.map(p => `<text x="${l - 6}" y="${Y(p.z) + 4}" text-anchor="end" class="ax">${esc(p.story)}</text>`).join('')}
      <line x1="${l}" x2="${l}" y1="${t}" y2="${Hh - bt}" stroke="var(--axis)"/>
      ${opt.limit ? `<line x1="${X(opt.limit)}" x2="${X(opt.limit)}" y1="${t}" y2="${Hh - bt}" stroke="var(--ink-2)" stroke-dasharray="4 3"/><text x="${X(opt.limit) - 4}" y="${Hh - bt - 6}" text-anchor="end" class="ax lim">limit ${fmtv(opt.limit)}</text>` : ''}
      ${lines}
      <text x="${(l + W - r) / 2}" y="${Hh - 4}" text-anchor="middle" class="ax">${esc(opt.xlabel)}</text></svg>
      <figcaption class="legend">${series.map(s => `<span><i style="background:var(${s.c})"></i>${esc(s.n)}</span>`).join('')}${opt.limit ? '<span>┆ limit</span>' : ''}</figcaption></figure>`;
  }

  /* ---------- page ---------- */
  const okTag = U => U <= 1 + 1e-9 ? '<span class="res ok">✓ OK</span>' : '<span class="res bad">✗ Revise</span>';
  function view() {
    const ic = api.ic, fmt = api.fmt, b = B(), s = b.set, live = EC.etabs.live, L = live.L;
    const head = `<div class="page-head"><div><div class="tool-tag">${ic('upload')}Design with ETABS link</div><h1>Building checks</h1><div class="sub">Global checks of the ETABS model · drift, P-Δ, torsion, base shear &amp; overturning, buckling · EN 1998-1, EN 1992 / 1993</div></div>
      <div class="actions">${b.data ? `<button class="btn no-print" data-print>${ic('print')}Print</button>` : ''}</div></div>`;
    const combos = L.model ? L.model.combos.concat(L.model.cases) : Object.keys(b.roles);
    combos.forEach(c => { if (!b.roles[c]) b.roles[c] = guessRole(c); });
    const conn = !L.st ? `<div class="card etabs-live"><div class="etabs-hero">${ic('upload')}<div><b>Connect to ETABS to read the building</b><small>Storey drifts, storey forces, max/avg displacements, base reactions and buckling factors are read through the ETABS API.</small></div><button class="btn primary" data-bc="connect">${ic('check')}Connect to ETABS…</button></div>${b.data ? `<p class="muted" style="margin:0 16px 14px">Showing the last read: ${esc(b.file || '')} · ${new Date(b.at).toLocaleString()}</p>` : ''}</div>`
      : `<div class="card etabs-live on"><div class="card-h"><b><i class="dot"></i>${esc(String(L.st.file).split(/[\\/]/).pop())}</b><small>click a combination to change its role · ${b.at ? 'last read ' + new Date(b.at).toLocaleString() : 'not read yet'}</small></div>
        <div class="etabs-combos">${combos.map(c => `<button class="cmb ${{ seis: 'uls', wind: 'sls', uls: 'qp', off: 'off' }[b.roles[c]]}" data-bcrole="${esc(c)}" title="Click: Seismic → Wind SLS → ULS → Not used">${esc(c)}<span>${ROLES[b.roles[c]]}</span></button>`).join('')}</div>
        ${err ? `<div class="etabs-msg" style="margin:0 16px 12px">${esc(err)}</div>` : ''}
        <div class="etabs-btns" style="padding:0 16px 14px"><button class="btn primary" data-bc="read" ${busy ? 'disabled' : ''}>${ic('download')}${busy ? 'Reading ETABS…' : 'Read building from ETABS'}</button><small class="muted">Seismic: drift, θ, torsion · Wind SLS: wind drift · ULS: base shear &amp; overturning. Put a linear buckling case in the model for αcr.</small></div></div>`;
    const num = (k, l, u, step, hint) => `<label class="bc-in"><span>${l}</span><input class="ctl" type="number" step="${step}" data-bcset="${k}" value="${esc(s[k])}"><small>${u}${hint ? ' · ' + hint : ''}</small></label>`;
    const inputs = `<div class="card"><div class="card-h"><b>Design parameters</b><small>yellow = input · kept with the project</small></div><div class="bc-inputs">
      ${num('qd', 'q<sub>d</sub> displacement behaviour factor', '-', '0.1', 'd<sub>s</sub> = q<sub>d</sub>·d<sub>e</sub> (EC8 4.3.4)')}
      ${num('nu', 'ν reduction factor', '-', '0.05', '0.5 class I–II · 0.4 class III–IV')}
      <label class="bc-in"><span>α drift limit (EC8 4.4.3.2)</span><select class="ctl" data-bcset="alpha">${[[0.005, '0.005 · brittle non-structural'], [0.0075, '0.0075 · ductile non-structural'], [0.010, '0.010 · no interference']].map(([v, l]) => `<option value="${v}" ${+s.alpha === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small>d<sub>r</sub>·ν ≤ α·h</small></label>
      ${num('windLim', 'Wind storey drift limit h /', '-', '50', 'SLS, e.g. h/500')}
      ${num('Bx', 'Plan width B<sub>x</sub>', 'm', '0.1', 'overturning about Y')}
      ${num('By', 'Plan width B<sub>y</sub>', 'm', '0.1', 'overturning about X')}
      ${num('fos', 'Required overturning safety', '-', '0.05', '1.0 with EQU-factored combinations')}</div></div>`;
    const R = compute(b);
    if (!R) return head + conn + inputs + `<div class="card"><div class="empty">No building data yet - connect to ETABS, give the combinations their role and click <b>Read building from ETABS</b>.</div></div>`;
    const Umax = xs => xs.reduce((a, x) => Math.max(a, x.U || 0), 0);
    const sumCard = (k, label, U, txt) => `<a class="card bc-sum" href="#bc-${k}"><div class="label">${label}</div><div class="value">${U === null ? '–' : fmt(U, 2)}</div><div class="foot">${U === null ? 'no data for this check' : okTag(U) + ' <span>' + txt + '</span>'}</div></a>`;
    const dU = Umax(R.drift), wU = Umax(R.wind), tU = Umax(R.theta), qU = Umax(R.tors), oU = Umax(R.base.filter(x => Number.isFinite(x.fos)));
    const thMax = R.theta.length ? Math.max(...R.theta.map(x => x.th)) : null, rMax = R.tors.length ? Math.max(...R.tors.map(x => x.ratio)) : null;
    const sums = `<div class="grid g3 bc-sums">
      ${sumCard('drift', 'Seismic drift', R.drift.length ? dU : null, 'max d<sub>r</sub>ν/h ÷ α')}
      ${sumCard('pdelta', 'P-Δ stability θ', R.theta.length ? tU : null, R.theta.length ? `θ<sub>max</sub> = ${fmt(thMax, 3)} (limit 0.3)` : '')}
      ${sumCard('torsion', 'Torsion Δ<sub>max</sub>/Δ<sub>avg</sub>', R.tors.length ? qU : null, R.tors.length ? `max ratio ${fmt(rMax, 2)} (1.4)` : '')}
      ${sumCard('wind', 'Wind drift', R.wind.length ? wU : null, `drift ÷ h/${s.windLim}`)}
      ${sumCard('base', 'Overturning', R.base.some(x => Number.isFinite(x.fos)) ? oU : null, 'required ÷ provided safety')}
      ${sumCard('buckling', 'Global buckling α<sub>cr</sub>', R.acr ? R.acr.U : null, R.acr ? `α<sub>cr</sub> = ${fmt(R.acr.a, 2)}${R.acr.a >= 10 ? ' ≥ 10: 1st order' : R.acr.a >= 3 ? ` · sway × ${fmt(R.acr.k, 3)}` : ' < 3'}` : '')}</div>`;
    const ser = (rows, key) => ['X', 'Y'].map((d, i) => ({ n: 'Direction ' + d, c: i ? '--s2' : '--s1', pts: rows.filter(r => r.dir === d).map(r => ({ story: r.story, z: r.z, v: r[key] })) })).filter(x => x.pts.length);
    const card = (k, title, ref, sub, body) => `<section class="card bc-card" id="bc-${k}"><div class="card-h"><b>${title}</b><small>${ref}${sub ? ' · ' + sub : ''}</small></div>${body}</section>`;
    const tbl = (cols, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c[2] || ''}">${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const top = xs => xs.slice().sort((a, c) => c.z - a.z || a.dir.localeCompare(c.dir));
    let html = head + conn + sums;
    html += card('drift', 'Inter-storey drift (seismic)', 'EN 1998-1 4.4.3.2', `d<sub>r</sub> = q<sub>d</sub>·d<sub>e</sub> = ${fmt(s.qd, 2)}·d<sub>e</sub> · d<sub>r</sub>·ν ≤ α·h, α = ${s.alpha}, ν = ${s.nu}`,
      R.drift.length ? `<div class="bc-split">${profile(ser(R.drift, 'v'), { title: 'Seismic drift ratio by storey', xlabel: 'd_r·ν / h', limit: +s.alpha, fmt: v => fmt(v, 4) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Governing combination', r => `<small>${esc(r.combo)}</small>`], ['d<sub>e</sub>/h', r => fmt(r.de, 5), 'num'], ['d<sub>r</sub>/h', r => fmt(r.dr, 5), 'num'], ['d<sub>r</sub>ν/h', r => fmt(r.v, 5), 'num'], ['U', r => api.ubar(r.U)]], top(R.drift))}</div>`
        : '<p class="muted bc-pad">No seismic drift - mark the seismic combinations (response spectrum / G+ψ2Q+E) as Seismic.</p>');
    html += card('pdelta', 'P-Δ: second-order effects', 'EN 1998-1 4.4.2.2(2)–(4)', 'θ = P<sub>tot</sub>·d<sub>r</sub> / (V<sub>tot</sub>·h) · θ ≤ 0.1 neglect · ≤ 0.2 × 1/(1−θ) · ≤ 0.3',
      R.theta.length ? `<div class="bc-split">${profile(ser(R.theta, 'th'), { title: 'Stability coefficient θ by storey', xlabel: 'θ', limit: 0.1, fmt: v => fmt(v, 3) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['P<sub>tot</sub> kN', r => fmt(r.P, 0), 'num'], ['V<sub>tot</sub> kN', r => fmt(r.V, 0), 'num'], ['d<sub>r</sub> mm', r => fmt(r.dr * r.h * 1000, 1), 'num'], ['θ', r => fmt(r.th, 3), 'num'], ['Design', r => `<small>${esc(r.note)}</small>`], ['U', r => api.ubar(r.U)]], top(R.theta))}</div>`
        : '<p class="muted bc-pad">Needs the seismic storey forces (P, V) - the G+ψ2Q+E combinations must be marked Seismic.</p>');
    html += card('torsion', 'Torsion of the building', 'Δ<sub>max</sub>/Δ<sub>avg</sub> per storey (ASCE 7 Table 12.3-1 limits 1.2 / 1.4; EC8 4.2.3.2 regularity indicator)', '',
      R.tors.length ? `<div class="bc-split">${profile(ser(R.tors, 'ratio'), { title: 'Max over average displacement', xlabel: 'Δmax / Δavg', limit: 1.2, fmt: v => fmt(v, 2) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Combination', r => `<small>${esc(r.combo)}</small>`], ['Δ<sub>max</sub>/Δ<sub>avg</sub>', r => fmt(r.ratio, 3), 'num'], ['Class', r => esc(r.cls)], ['U', r => api.ubar(r.U)]], top(R.tors))}</div>
        <p class="muted bc-pad">Ratio > 1.2: torsionally irregular - use a spatial model and accidental eccentricity (EC8 4.3.2), check the perimeter members for the torsional drift; > 1.4: add stiffness at the perimeter (walls / bracing).</p>`
        : '<p class="muted bc-pad">ETABS returned no “Story Max Over Avg Displacements” table for the seismic / wind combinations (needs rigid or semi-rigid diaphragms).</p>');
    html += card('wind', 'Wind drift (SLS)', 'EN 1990 A1.4 · storey drift ≤ h/' + s.windLim, '',
      R.wind.length ? `<div class="bc-split">${profile(ser(R.wind, 'v'), { title: 'Wind drift ratio by storey', xlabel: 'drift / h', limit: 1 / s.windLim, fmt: v => fmt(v, 5) })}
        ${tbl([['Storey', r => esc(r.story)], ['Dir.', r => r.dir], ['Combination', r => `<small>${esc(r.combo)}</small>`], ['drift/h', r => fmt(r.v, 5), 'num'], ['h/drift', r => r.v > 0 ? fmt(1 / r.v, 0) : '–', 'num'], ['U', r => api.ubar(r.U)]], top(R.wind))}</div>`
        : '<p class="muted bc-pad">No wind SLS combination marked.</p>');
    html += card('base', 'Base shear, storey shear and overturning moment', 'EN 1990 6.4.1 EQU', `stabilising W·B/2 ÷ overturning M ≥ ${s.fos} · B<sub>x</sub> = ${s.Bx} m, B<sub>y</sub> = ${s.By} m`,
      `<div class="bc-split two">${profile([{ n: 'V_X', c: '--s1', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.VX })) }, { n: 'V_Y', c: '--s2', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.VY })) }].filter(x => x.pts.some(p => p.v > 0)), { title: 'Storey shear', xlabel: 'storey shear kN', unit: 'kN', fmt: v => fmt(v, 0) })}
        ${profile([{ n: 'M about Y (from X)', c: '--s1', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.MY })) }, { n: 'M about X (from Y)', c: '--s2', pts: R.prof.map(p => ({ story: p.story, z: p.z, v: p.MX })) }].filter(x => x.pts.some(p => p.v > 0)), { title: 'Overturning moment', xlabel: 'overturning moment kN·m', unit: 'kN·m', fmt: v => fmt(v, 0) })}</div>
      ${tbl([['Combination', r => `<small>${esc(r.combo)}</small>`], ['Role', r => ROLES[r.role]], ['V<sub>x</sub> kN', r => fmt(r.Vx, 0), 'num'], ['V<sub>y</sub> kN', r => fmt(r.Vy, 0), 'num'], ['W kN', r => fmt(r.W, 0) + (r.Wfrom ? ` <small class="muted">${r.Wfrom}</small>` : ''), 'num'], ['V<sub>x</sub>/W', r => fmt(r.cx, 3), 'num'], ['V<sub>y</sub>/W', r => fmt(r.cy, 3), 'num'], ['M<sub>x</sub> kN·m', r => fmt(r.Mx, 0), 'num'], ['M<sub>y</sub> kN·m', r => fmt(r.My, 0), 'num'], ['Safety', r => Number.isFinite(r.fos) ? fmt(r.fos, 2) : '–', 'num'], ['U', r => Number.isFinite(r.fos) ? api.ubar(r.U) : '']], R.base)}
      <p class="muted bc-pad">Profiles: envelope of the seismic and wind combinations. The overturning check is the rigid-body check of the whole building on its base; the foundation bearing and uplift are checked with the footing / pile elements.</p>`);
    html += card('buckling', 'Global buckling and sway', 'EN 1993-1-1 5.2.1(3), 5.2.2(5)B · EN 1992-1-1 5.8.2(6)', 'α<sub>cr</sub> = lowest positive buckling factor',
      R.buck.length ? `${tbl([['Case', r => esc(r.case)], ['Mode', r => r.mode, 'num'], ['α<sub>cr</sub>', r => fmt(r.factor, 2), 'num'], ['Sway amplification 1/(1−1/α<sub>cr</sub>)', r => r.factor > 1 ? fmt(1 / (1 - 1 / r.factor), 3) : '∞', 'num']], R.buck.slice(0, 12))}
        <div class="bc-verdict ${R.acr.a >= 3 ? 'ok' : 'bad'}">α<sub>cr</sub> = <b>${fmt(R.acr.a, 2)}</b> → ${esc(R.acr.note)}${R.acr.a < 10 && R.acr.a >= 3 ? '. The P-Δ design: increase the horizontal loads (wind, notional, seismic) by this factor, or run ETABS with P-Delta on.' : ''}</div>`
        : '<p class="muted bc-pad">No buckling factors - add a linear buckling load case in ETABS (initial P-Delta from the ULS gravity combination), run it and read again.</p>');
    return html + inputs + `<p class="muted" style="margin-top:12px">Source: ${esc(b.file || '')} · read ${new Date(b.at).toLocaleString()} · units kN, m.</p>`;
  }

  function mount(root) {
    const rer = () => api.render();
    root.onclick = ev => {
      const t = ev.target.closest('[data-bc],[data-bcrole],[data-print],[data-open],[data-go]'); if (!t) return;
      const d = t.dataset, b = B();
      if (d.print !== undefined) return window.print();
      if (d.open) { location.hash = '#/el/' + d.open; return; }
      if (d.go !== undefined) { location.hash = '#/' + d.go; return; }
      if (d.bc === 'connect') return EC.etabs.live.connect(rer);
      if (d.bcrole !== undefined) { b.roles[d.bcrole] = ROLE_ORDER[(ROLE_ORDER.indexOf(b.roles[d.bcrole] || 'off') + 1) % ROLE_ORDER.length]; api.save(); return rer(); }
      if (d.bc === 'read') {
        const cs = Object.keys(b.roles).filter(c => b.roles[c] !== 'off' && EC.etabs.live.L.model && EC.etabs.live.L.model.combos.concat(EC.etabs.live.L.model.cases).includes(c));
        if (!cs.length) { err = 'Give at least one combination a role (Seismic, Wind SLS or ULS).'; return rer(); }
        busy = 'read'; err = ''; rer();
        EC.etabs.live.get('/building?' + cs.map(c => 'c=' + encodeURIComponent(c)).join('&')).then(j => {
          b.data = { stories: j.stories || [], drifts: j.drifts || [], forces: j.forces || [], torsion: j.torsion || [], base: j.base || [], buckling: j.buckling || [] };
          b.file = String(j.file || '').split(/[\\/]/).pop(); b.at = Date.now();
          if (j.plan && b.set.Bx === DEF.Bx && b.set.By === DEF.By) { b.set.Bx = j.plan.Bx; b.set.By = j.plan.By; }
          if (!b.data.stories.length) throw new Error('ETABS returned no storeys.');
          busy = ''; api.save(); api.toast('Building read from ETABS'); rer();
        }).catch(e => { busy = ''; err = e.message; rer(); });
      }
    };
    root.onchange = ev => {
      const t = ev.target; if (t.dataset.bcset === undefined) return;
      const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
      B().set[t.dataset.bcset] = v; api.save(); rer();
    };
  }

  EC.building = { install(a) { api = a; }, view, mount, _compute: compute };
})();
