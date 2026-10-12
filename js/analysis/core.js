/* Design analysis tools: draw the structure, analyse it, design it with the Mathcad worksheet.
 * A tool is a drawing / analysis front end for ONE worksheet: the drawing is turned into the worksheet's own
 * input tables and the worksheet does the design (formulas never retyped). An analysis is an ordinary element
 * of that worksheet type with its drawing in e.fda, so lists, schedules, records and sync work unchanged.
 *
 *   EC.analysis.add({ k, name, sub, icon, sheet, desc,
 *     owns(e) -> bool,                     element belongs to this tool
 *     create(api) -> void,                 new analysis (dialog), call api.newEl(type, {fda, inputs, ...})
 *     view(e) -> html, mount(root, e),     editor page #/analysis/<id>
 *     onResult(e),                         worksheet result for e arrived (redraw)
 *     brief(e) -> text })                  one line for the list
 * See docs/DESIGN_ANALYSIS_TOOLS.md. */
(function () {
  'use strict';
  const EC = window.EC;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tools = [];
  let api = null;
  const toolOf = e => e && e.fda && tools.find(t => t.k === e.fda.tool);

  function home() {
    const p = api.proj(), els = p.elements.filter(e => toolOf(e));
    const cards = tools.map(t => `<div class="card at-card"><div class="at-ic">${api.ic(t.icon)}</div><div class="at-tx"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small><p>${esc(t.desc)}</p>
      <div class="at-ws">Worksheet <code>${esc(t.sheet)}.mcdx</code></div></div><button class="btn primary" data-atnew="${t.k}">${api.ic('plus')}New ${esc(t.short || t.name)}</button></div>`).join('');
    const rows = els.map(e => {
      const t = toolOf(e), r = e.res || {};
      const U = r.Umax == null ? null : r.Umax;
      return `<tr class="click" data-atopen="${e.id}"><td class="mark">${esc(e.mark)}</td><td>${esc(t.name)}</td><td>${esc(t.brief(e))}</td><td>${esc(e.level || '')}${e.grid ? ' · ' + esc(e.grid) : ''}</td><td>${U == null ? '<span class="badge">not run</span>' : api.ubar(U)}</td><td>${r.ok == null ? '' : `<span class="res ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'OK' : 'Revise'}</span>`}</td></tr>`;
    }).join('');
    return `<div class="page-head"><div><h1>Design analysis</h1><div class="sub">Draw the structure, analyse it and design it with the Mathcad worksheet - the formulas are the worksheet's, unchanged.</div></div></div>
      <div class="at-grid">${cards}</div>
      <div class="card" style="margin-top:16px"><header><h3>Analyses in this project</h3><span class="hint">${els.length} element${els.length === 1 ? '' : 's'} · also listed under Design by hand calculation</span></header><div class="body">
      ${els.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mark</th><th>Tool</th><th>Model</th><th>Location</th><th>U<sub>max</sub></th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No analysis yet - start one with a tool above.</div>'}</div></div>`;
  }

  function view(r) {
    if (!r[1]) return home();
    const e = api.proj().elements.find(x => x.id === r[1]);
    const t = toolOf(e);
    if (!t) return `<div class="empty">Analysis not found. <a href="#/analysis">Back to Design analysis</a></div>`;
    return t.view(e);
  }
  function mount(root, r) {
    root.onclick = ev => {
      const b = ev.target.closest('[data-atnew],[data-atopen]'); if (!b) return;
      if (b.dataset.atnew) { const t = tools.find(x => x.k === b.dataset.atnew); if (t) t.create(api); return; }
      location.hash = '#/analysis/' + b.dataset.atopen;
    };
    root.onchange = null;
    if (!r[1]) return;
    const e = api.proj().elements.find(x => x.id === r[1]), t = toolOf(e);
    if (t) t.mount(root, e);
  }
  /* banner on the worksheet element page: the geometry tables come from the drawing */
  function banner(e) {
    const t = toolOf(e); if (!t) return '';
    return `<div class="at-banner no-print">${api.ic(t.icon)}<div><b>Drawn in ${esc(t.name)}</b><small>The pile coordinates and load-node tables of this worksheet come from the drawing; edit them there. Other inputs can be changed here or in the analysis.</small></div><a class="btn sm primary" href="#/analysis/${e.id}">Open drawing</a></div>`;
  }
  function onResult(e) { const t = toolOf(e); if (t && t.onResult) t.onResult(e); }

  EC.analysis = {
    add(t) { tools.push(t); },
    install(a) { api = a; tools.forEach(t => t.install && t.install(a)); },
    tools, toolOf, view, mount, banner, onResult,
    count: p => p.elements.filter(e => toolOf(e)).length
  };
})();
