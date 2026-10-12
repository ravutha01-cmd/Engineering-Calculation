/* Typical details: parametric detailing drawings in the app's own style (see docs/CALCULATION_GUIDELINES.md).
 * Every element type gets 5-10 drawings in its Detailing tab: the worksheet's own drawings first, then the
 * typical details of its category, drawn from the element's inputs (section, bars, cover, ...).
 *
 *   EC.typdet.add(cat, fn, match?)   cat = beams | columns | slabs | foundations | steel | details | sls | geo | actions
 *     fn(ctx, T) -> { t: 'Title', s: 'one-line note', svg } | null (null = not applicable)
 *     match(ctx) -> bool  optional: only for some element types (e.g. ctx.has('PileDia'))
 *
 *   ctx: values of the element (Mathcad or native) by name, with fallbacks
 *     ctx.mm(['b_w','b'], 300)    length in mm (converts m / cm inputs)
 *     ctx.n(['n_1','nb'], 4)      plain number
 *     ctx.bar(['ϕ_1','db'], 20)   bar diameter in mm (reads "H20 - 20 mm" combo boxes too)
 *     ctx.txt(['BeamID'], '')     text
 *     ctx.has('name')             input exists
 *     ctx.type, ctx.name, ctx.cat, ctx.mark
 *
 *   T.draw() -> builder in mm (y down); primitives are styled by the shared plot CSS (light + dark):
 *     concrete(pts|[x,y,w,h]) · steel(pts) · ground(x1,x2,y) · bar(x,y,d) · rebar(pts,d) · link(x,y,w,h,r)
 *     line(pts,cls) · dimH(x1,x2,y,label,off) · dimV(y1,y2,x,label,off) · note(x,y,text,anchor) · leader(x,y,tx,ty,text)
 *     .svg(maxW, maxH) -> '<svg …>'  (scaled to fit; text and strokes keep their screen size)
 */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  const reg = {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9α-ωϕ]/g, '');

  /* ---------- values of an element ---------- */
  function ctxOf(e, MOD, doc) {
    const mod = MOD[e.type], vals = {}, units = {}, texts = {};
    if (mod.mc && doc) {
      (doc.inputs || []).forEach(i => {
        const o = e.inputs && e.inputs[i.n];
        if (i.kind === 'num') {
          let v = i.v; if (o !== undefined) v = typeof o === 'number' ? o : Array.isArray(o) && typeof o[2] === 'number' ? o[2] : v;
          vals[i.n] = v; units[i.n] = i.u ? EC.mrender.unitText(i.u) : '';
        } else if (i.kind === 'combo') { const k = o !== undefined ? o : i.v; texts[i.n] = (i.opts || [])[k] || ''; vals[i.n] = k; }
        else if (i.kind === 'str') texts[i.n] = o ? o[1] : i.v;
      });
    } else if (!mod.mc) {
      mod.groups.forEach(g => g.f.forEach(f => {
        const v = e.inputs && e.inputs[f.k] !== undefined ? e.inputs[f.k] : f.d;
        if (typeof v === 'number') { vals[f.k] = v; units[f.k] = f.u || ''; }
        else if (f.opts) { const o = f.opts.find(x => String(x.v) === String(v)); texts[f.k] = o ? o.l : String(v); vals[f.k] = typeof v === 'number' ? v : parseFloat(v); }
        else if (typeof v === 'string') texts[f.k] = v;
      }));
    }
    const keys = Object.keys(vals).concat(Object.keys(texts));
    const find = names => { for (const n of names) if (n in vals || n in texts) return n; const nn = names.map(norm); return keys.find(k => nn.includes(norm(k))) || null; };
    const toMm = (v, u) => (u === 'm' ? v * 1000 : u === 'cm' ? v * 10 : v);
    return {
      e, type: e.type, cat: mod.cat, name: mod.name, mark: e.mark,
      has: n => !!find([].concat(n)),
      n: (names, d) => { const k = find([].concat(names)); const v = k ? vals[k] : undefined; return Number.isFinite(v) ? v : d; },
      mm: (names, d) => { const k = find([].concat(names)); const v = k ? vals[k] : undefined; return Number.isFinite(v) ? toMm(v, units[k]) : d; },
      bar: (names, d) => { const k = find([].concat(names)); if (!k) return d; const t = texts[k]; if (t) { const m = t.match(/(\d+(?:\.\d+)?)\s*mm/) || t.match(/[HTØφϕ]\s*(\d+)/i); if (m) return +m[1]; } const v = vals[k]; return Number.isFinite(v) && v >= 6 ? v : d; },
      txt: (names, d) => { const k = find([].concat(names)); return k && texts[k] != null ? texts[k] : d; },
      vals, texts, units
    };
  }

  /* ---------- drawing builder (mm, y down) ---------- */
  function draw() {
    const P = [];
    const pts = a => (a.length === 4 && typeof a[0] === 'number' ? [[a[0], a[1]], [a[0] + a[2], a[1]], [a[0] + a[2], a[1] + a[3]], [a[0], a[1] + a[3]]] : a);
    const b = {
      concrete(a) { P.push({ k: 'poly', p: pts(a), c: 'td-conc' }); return b; },
      steel(a) { P.push({ k: 'poly', p: pts(a), c: 'td-steel' }); return b; },
      void(a) { P.push({ k: 'poly', p: pts(a), c: 'td-void' }); return b; },
      ground(x1, x2, y) { P.push({ k: 'ground', x1, x2, y }); return b; },
      bar(x, y, d) { P.push({ k: 'bar', x, y, d: d || 16 }); return b; },
      rebar(p, d) { P.push({ k: 'pl', p, c: 'td-rebar', d: d || 16 }); return b; },
      link(x, y, w, h, r) { P.push({ k: 'link', x, y, w, h, r: r == null ? 20 : r }); return b; },
      line(p, c) { P.push({ k: 'pl', p, c: c || 'td-line' }); return b; },
      dimH(x1, x2, y, label, off) { P.push({ k: 'dimH', x1, x2, y, label, off: off == null ? 22 : off }); return b; },
      dimV(y1, y2, x, label, off) { P.push({ k: 'dimV', y1, y2, x, label, off: off == null ? 22 : off }); return b; },
      note(x, y, t, a) { P.push({ k: 'note', x, y, t, a: a || 'start' }); return b; },
      leader(x, y, tx, ty, t) { P.push({ k: 'lead', x, y, tx, ty, t }); return b; },
      svg(maxW, maxH) {
        maxW = maxW || 520; maxH = maxH || 400;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const ext = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
        P.forEach(q => { if (q.p) q.p.forEach(([x, y]) => ext(x, y)); if (q.k === 'bar') { ext(q.x - q.d / 2, q.y - q.d / 2); ext(q.x + q.d / 2, q.y + q.d / 2); } if (q.k === 'link') { ext(q.x, q.y); ext(q.x + q.w, q.y + q.h); } if (q.k === 'ground') { ext(q.x1, q.y); ext(q.x2, q.y); } if (q.k === 'dimH') { ext(q.x1, q.y); ext(q.x2, q.y); } if (q.k === 'dimV') { ext(q.x, q.y1); ext(q.x, q.y2); } if (q.k === 'note' || q.k === 'lead') ext(q.x, q.y); });
        if (!Number.isFinite(x0)) return '';
        const pad = 46, w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
        const s = Math.min((maxW - 2 * pad) / w, (maxH - 2 * pad) / h);
        let W = w * s + 2 * pad; const H = h * s + 2 * pad;
        const X = x => +(pad + (x - x0) * s).toFixed(1), Y = y => +(pad + (y - y0) * s).toFixed(1);
        // widen the canvas so labels on the right are not clipped (about 6 px per character at 10.5 px)
        let left = 0;
        P.forEach(q => { if (q.k !== 'lead' && q.k !== 'note') return; const len = String(q.t).length * 6.1;
          const x = q.k === 'lead' ? X(q.tx) + (q.tx >= q.x ? 4 : -4) : X(q.x), a = q.k === 'lead' ? (q.tx >= q.x ? 'start' : 'end') : q.a;
          const r = a === 'start' ? x + len : a === 'middle' ? x + len / 2 : x, l = a === 'end' ? x - len : a === 'middle' ? x - len / 2 : x;
          W = Math.max(W, r + 10); left = Math.max(left, -l + 10); });
        const path = p => p.map((q, i) => (i ? 'L' : 'M') + X(q[0]) + ' ' + Y(q[1])).join('');
        const tick = (x, y) => `<line x1="${x - 4}" y1="${y + 4}" x2="${x + 4}" y2="${y - 4}" class="pdim"/>`;
        let o = '';
        P.forEach(q => {
          if (q.k === 'poly') o += `<path d="${path(q.p)}Z" class="${q.c}"/>`;
          else if (q.k === 'pl') o += `<path d="${path(q.p)}" class="${q.c}" ${q.d ? `style="stroke-width:${Math.max(1.6, Math.min(5, q.d * s * 0.9)).toFixed(2)}px"` : ''}/>`;
          else if (q.k === 'bar') o += `<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="${Math.max(3.2, q.d / 2 * s).toFixed(1)}" class="p-bar"/>`;
          else if (q.k === 'link') { const r = Math.min(q.r * s, 8); o += `<rect x="${X(q.x)}" y="${Y(q.y)}" width="${(q.w * s).toFixed(1)}" height="${(q.h * s).toFixed(1)}" rx="${r.toFixed(1)}" class="td-link"/>`; }
          else if (q.k === 'ground') { const yy = Y(q.y); o += `<line x1="${X(q.x1)}" x2="${X(q.x2)}" y1="${yy}" y2="${yy}" class="td-ground"/>`; for (let x = X(q.x1) + 6; x < X(q.x2); x += 12) o += `<line x1="${x}" y1="${yy}" x2="${x - 8}" y2="${yy + 8}" class="td-hatch"/>`; }
          else if (q.k === 'dimH') { const yy = Y(q.y) + q.off, a = X(q.x1), z = X(q.x2); o += `<line x1="${a}" x2="${a}" y1="${Y(q.y) + (q.off > 0 ? 4 : -4)}" y2="${yy + (q.off > 0 ? 5 : -5)}" class="pext"/><line x1="${z}" x2="${z}" y1="${Y(q.y) + (q.off > 0 ? 4 : -4)}" y2="${yy + (q.off > 0 ? 5 : -5)}" class="pext"/><line x1="${a}" x2="${z}" y1="${yy}" y2="${yy}" class="pdim"/>${tick(a, yy)}${tick(z, yy)}<text x="${((a + z) / 2).toFixed(1)}" y="${(yy - 5).toFixed(1)}" text-anchor="middle" class="pdt">${esc(q.label)}</text>`; }
          else if (q.k === 'dimV') { const xx = X(q.x) - q.off, a = Y(q.y1), z = Y(q.y2); o += `<line y1="${a}" y2="${a}" x1="${X(q.x) - (q.off > 0 ? 4 : -4)}" x2="${xx - (q.off > 0 ? 5 : -5)}" class="pext"/><line y1="${z}" y2="${z}" x1="${X(q.x) - (q.off > 0 ? 4 : -4)}" x2="${xx - (q.off > 0 ? 5 : -5)}" class="pext"/><line y1="${a}" y2="${z}" x1="${xx}" x2="${xx}" class="pdim"/>${tick(xx, a)}${tick(xx, z)}<text transform="translate(${(xx - 6).toFixed(1)} ${((a + z) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" class="pdt">${esc(q.label)}</text>`; }
          else if (q.k === 'note') o += `<text x="${X(q.x)}" y="${Y(q.y)}" text-anchor="${q.a}" class="td-note">${esc(q.t)}</text>`;
          else if (q.k === 'lead') { const tx = X(q.tx), ty = Y(q.ty); o += `<line x1="${X(q.x)}" y1="${Y(q.y)}" x2="${tx}" y2="${ty}" class="td-lead"/><circle cx="${X(q.x)}" cy="${Y(q.y)}" r="2" class="td-leaddot"/><text x="${tx + (tx >= X(q.x) ? 4 : -4)}" y="${ty + 4}" text-anchor="${tx >= X(q.x) ? 'start' : 'end'}" class="td-note">${esc(q.t)}</text>`; }
        });
        return `<svg viewBox="${(-left).toFixed(0)} 0 ${(W + left).toFixed(0)} ${H.toFixed(0)}" class="mplot drawing tdet" role="img" style="max-width:${(W + left).toFixed(0)}px">${o}</svg>`;
      }
    };
    return b;
  }

  /* ---------- shared helpers for detail functions ---------- */
  const T = {
    draw, esc,
    fmt: (v, d) => (Number.isFinite(v) ? (+v.toFixed(d == null ? 0 : d)).toLocaleString('en-US') : '-'),
    /* anchorage / lap length, simple EN 1992-1-1 bond estimate (indicative, for typical details only) */
    lbd: (phi, fyk, fck, good) => { const fbd = 2.25 * (good === false ? 0.7 : 1) * Math.min(0.7 * 0.3 * Math.pow(fck || 30, 2 / 3), 0.7 * 0.3 * Math.pow(50, 2 / 3)) / 1.5; return Math.ceil(phi * (fyk || 500) / 1.15 / (4 * fbd) / 50) * 50; },
    /* bar label like "4 H20" */
    bars: (n, d) => `${n} H${d}`
  };

  EC.typdet = {
    add(cat, fn, match) { (reg[cat] = reg[cat] || []).push({ fn, match }); },
    ctx: ctxOf, T,
    /* cards for one element: [{t, s, svg}] */
    list(e, MOD, doc) {
      const ctx = ctxOf(e, MOD, doc), out = [];
      (reg[ctx.cat] || []).concat(reg['*'] || []).forEach(r => {
        if (r.match && !r.match(ctx)) return;
        try { const d = r.fn(ctx, T); if (d && d.svg) out.push(d); } catch (err) { if (window.console) console.warn('typical detail', err); }
      });
      return out;
    },
    html(e, MOD, doc, have) {
      const ds = this.list(e, MOD, doc);
      if (!ds.length) return '';
      return `<h3 class="ksub td-h">Typical details <small>${ds.length} drawings · parametric from this element's inputs · indicative, check against the calculation</small></h3><div class="dgrid">${ds.map((d, k) => `<figure class="dcard td-card"><figcaption><b><span class="td-no">TD-${String((have || 0) + k + 1).padStart(2, '0')}</span>${esc(d.t)}</b>${d.s ? `<small>${esc(d.s)}</small>` : ''}</figcaption>${d.svg}${d.notes ? `<ul class="td-notes">${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</figure>`).join('')}</div>`;
    }
  };
})();
