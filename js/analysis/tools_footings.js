/* Design analysis tools built with the kit (js/analysis/kit.js): footings.
 * Each spec only draws the worksheet's own inputs and lists its load inputs; the worksheet designs.
 * Registered in the browser; collected in EC.analysisSpecs for tools/test_analysis.js. */
(function (root) {
  'use strict';
  const EC = root.EC = root.EC || {};
  const specs = EC.analysisSpecs = EC.analysisSpecs || [];
  const r0 = x => Math.round(x);
  const mtxt = x => (Math.abs(x) >= 1000 ? (x / 1000).toFixed(2) + ' m' : r0(x) + '');

  /* Pad footing under one column - PadFooting_EC2-2023_Standalone (footing B_x × B_y centred on the column) */
  specs.push({
    k: 'padfooting', name: 'Foundation · pad footing', short: 'pad footing', icon: 'footing', sheet: 'PadFooting_EC2-2023_Standalone',
    sub: 'Pad footing under one column',
    desc: 'Size the footing and the column on the plan (drag the edges), type N and the moments of each load combination; the worksheet checks bearing, bending, shear, punching, cracking and detailing to EN 1992-1-1:2023 for every combination.',
    loads: ['N_Ed', 'M_Ed;x', 'M_Ed;y', 'N_qp', 'M_qp;x', 'M_qp;y'],
    plan(v) {
      const Bx = v.mm('B_x'), By = v.mm('B_y'), cx = v.mm('c_x'), cy = v.mm('c_y');
      return {
        shapes: [{ t: 'outline', x: 0, y: 0, w: Bx, h: By, label: 'Footing ' + mtxt(Bx) + ' × ' + mtxt(By) + ' × ' + r0(v.mm('h_f')), title: 'h_f = ' + r0(v.mm('h_f')) + ' mm' },
          { t: 'col', x: 0, y: 0, w: cx, h: cy, label: 'Column ' + r0(cx) + ' × ' + r0(cy) }],
        dims: [{ x1: -Bx / 2, y1: -By / 2, x2: Bx / 2, y2: -By / 2, off: 34, text: r0(Bx) }, { x1: Bx / 2, y1: By / 2, x2: Bx / 2, y2: -By / 2, off: 34, text: r0(By) }],
        handles: [
          { x: Bx / 2, y: 0, title: 'Footing length B_x', set: dx => ({ B_x: Math.max(cx + 100, Bx + 2 * dx) }) },
          { x: 0, y: By / 2, title: 'Footing width B_y', set: (dx, dy) => ({ B_y: Math.max(cy + 100, By + 2 * dy) }) },
          { x: cx / 2, y: cy / 2, title: 'Column size c_x × c_y', set: (dx, dy) => ({ c_x: Math.max(100, Math.min(Bx - 100, cx + 2 * dx)), c_y: Math.max(100, Math.min(By - 100, cy + 2 * dy)) }) }
        ]
      };
    },
    check: v => (v.mm('c_x') >= v.mm('B_x') || v.mm('c_y') >= v.mm('B_y') ? 'The column is larger than the footing.' : ''),
    brief: v => `${(v.mm('B_x') / 1000).toFixed(2)} × ${(v.mm('B_y') / 1000).toFixed(2)} m`
  });

  /* Combined footing under two columns - CombinedFooting_EC2-2023_Standalone (x from the left end of the footing) */
  specs.push({
    k: 'combfooting', name: 'Foundation · combined footing', short: 'combined footing', icon: 'footing', sheet: 'CombinedFooting_EC2-2023_Standalone',
    sub: 'Combined footing under two columns',
    desc: 'Place the two columns along the footing and size it on the plan (drag the columns and edges), type the column loads per combination; the worksheet gives soil pressure, longitudinal and transverse bending, shear, punching and cracking for every combination.',
    loads: ['N_1', 'M_1', 'N_2', 'M_2'],
    plan(v) {
      const L = v.mm('L_f'), B = v.mm('B_f'), x1 = v.mm('x_1'), x2 = v.mm('x_2');
      const a1 = v.mm('c_1'), b1 = v.mm('c_1y'), a2 = v.mm('c_2'), b2 = v.mm('c_2y');
      return {
        shapes: [{ t: 'outline', x: L / 2, y: 0, w: L, h: B, label: 'Footing ' + mtxt(L) + ' × ' + mtxt(B) + ' × ' + r0(v.mm('h_f')) },
          { t: 'col', x: x1, y: 0, w: a1, h: b1, label: 'C1 · N ' + r0(v.num('N_1')) }, { t: 'col', x: x2, y: 0, w: a2, h: b2, label: 'C2 · N ' + r0(v.num('N_2')) }],
        dims: [{ x1: 0, y1: -B / 2, x2: L, y2: -B / 2, off: 52, text: r0(L) }, { x1: 0, y1: -B / 2, x2: x1, y2: -B / 2, off: 26, text: r0(x1) }, { x1: x1, y1: -B / 2, x2: x2, y2: -B / 2, off: 26, text: r0(x2 - x1) }, { x1: x2, y1: -B / 2, x2: L, y2: -B / 2, off: 26, text: r0(L - x2) },
          { x1: L, y1: B / 2, x2: L, y2: -B / 2, off: 34, text: r0(B) }],
        handles: [
          { x: L, y: 0, title: 'Footing length L_f', set: dx => ({ L_f: Math.max(x2 + a2 / 2 + 50, L + dx) }) },
          { x: L / 2, y: B / 2, title: 'Footing width B_f', set: (dx, dy) => ({ B_f: Math.max(Math.max(b1, b2) + 100, B + 2 * dy) }) },
          { x: x1, y: 0, title: 'Column 1 position x_1', set: dx => ({ x_1: Math.max(a1 / 2, Math.min(x2 - (a1 + a2) / 2 - 50, x1 + dx)) }) },
          { x: x2, y: 0, title: 'Column 2 position x_2', set: dx => ({ x_2: Math.min(L - a2 / 2, Math.max(x1 + (a1 + a2) / 2 + 50, x2 + dx)) }) }
        ]
      };
    },
    check: v => (v.mm('x_1') >= v.mm('x_2') ? 'Column 1 must be left of column 2.' : v.mm('x_2') > v.mm('L_f') ? 'Column 2 is outside the footing.' : ''),
    brief: v => `${(v.mm('L_f') / 1000).toFixed(2)} × ${(v.mm('B_f') / 1000).toFixed(2)} m, 2 columns`
  });

  if (EC.analysis && EC.analysis.kit) specs.forEach(s => { if (!EC.analysis.tools.some(t => t.k === s.k)) EC.analysis.kit(s); });
})(typeof window !== 'undefined' ? window : globalThis);
