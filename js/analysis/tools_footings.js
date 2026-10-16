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

  /* Footing bearing, sliding and settlement to EC7 - Footing_EC7_Standalone. Plan B × L and, below it, the section
     through the ground: base depth D_f, thickness h_f, water table z_w and the layer boundaries of the borehole table. */
  specs.push({
    k: 'footingec7', name: 'Foundation · footing bearing & sliding (EC7)', short: 'EC7 footing check', icon: 'geo', sheet: 'Footing_EC7_Standalone',
    sub: 'Bearing resistance, sliding and settlement of a footing on layered ground',
    desc: 'Size the footing on the plan and set its depth and the water table on the section (drag the handles); type the characteristic actions of each load case. The worksheet checks bearing, sliding, eccentricity and settlement to EN 1997-1 for all its design cases (DA1-1, DA1-2, DA2, DA3, EC7:2024) and every load case.',
    loads: ['G_k', 'Q_k', 'H_B', 'H_L', 'M_B', 'M_L'],
    plan(v) {
      const B = v.mm('B_f'), L = v.mm('L_f'), D = v.mm('D_f'), h = v.mm('h_f'), zw = v.mm('z_w');
      const zmax = D + 1.5 * Math.max(B, L), x0 = -B / 2 - Math.max(1500, 0.6 * B), x1 = -x0;
      const yG = -L / 2 - Math.max(1500, 0.5 * L) - 400;                      // ground level of the section
      const shapes = [{ t: 'outline', x: 0, y: 0, w: B, h: L, label: 'Plan · footing ' + mtxt(B) + ' × ' + mtxt(L) },
        { t: 'line', pts: [[x0, yG], [x1, yG]], cls: 'p-outline2', label: 'Section · ground level' },
        { t: 'outline', x: 0, y: yG - D + h / 2, w: B, h: h, title: 'Footing h_f = ' + r0(h) + ' mm, base at D_f = ' + r0(D) + ' mm' }];
      let z = 0;
      v.vecmm('h_L').forEach((t, i) => { z += t; if (Number.isFinite(z) && z < zmax) shapes.push({ t: 'line', pts: [[x0, yG - z], [x1, yG - z]], cls: 'p-guide', label: 'Layer ' + (i + 1) + ' / ' + (i + 2), title: 'Layer boundary at ' + (z / 1000).toFixed(2) + ' m' }); });
      if (zw < zmax) shapes.push({ t: 'line', pts: [[x0, yG - zw], [x1, yG - zw]], cls: 'p-limit', label: 'Water table', title: 'z_w = ' + (zw / 1000).toFixed(2) + ' m' });
      return {
        shapes,
        dims: [{ x1: -B / 2, y1: -L / 2, x2: B / 2, y2: -L / 2, off: 30, text: 'B ' + r0(B) }, { x1: B / 2, y1: L / 2, x2: B / 2, y2: -L / 2, off: 30, text: 'L ' + r0(L) },
          { x1: -B / 2, y1: yG - D, x2: B / 2, y2: yG - D, off: 26, text: 'B ' + r0(B) }, { x1: x0, y1: yG, x2: x0, y2: yG - D, off: -26, text: 'D ' + r0(D) }],
        handles: [
          { x: B / 2, y: 0, title: 'Footing width B', set: dx => ({ B_f: Math.max(500, B + 2 * dx) }) },
          { x: 0, y: L / 2, title: 'Footing length L', set: (dx, dy) => ({ L_f: Math.max(500, L + 2 * dy) }) },
          { x: B / 2, y: yG - D, title: 'Depth of the base D_f', set: (dx, dy) => ({ D_f: Math.max(h, D - dy) }) },
          { x: x1, y: yG - zw, title: 'Water table depth z_w', set: (dx, dy) => ({ z_w: Math.max(0, zw - dy) }) }
        ]
      };
    },
    check: v => (v.mm('h_f') > v.mm('D_f') ? 'The footing is thicker than its depth below ground (h_f > D_f).' : ''),
    brief: v => `${(v.mm('B_f') / 1000).toFixed(2)} × ${(v.mm('L_f') / 1000).toFixed(2)} m at ${(v.mm('D_f') / 1000).toFixed(2)} m`
  });

  /* Cap on a single pile - SinglePileCap_EC2-2023_Standalone. The pile is drawn at its position tolerance (e_x, e_y). */
  specs.push({
    k: 'singlepile', name: 'Foundation · cap on a single pile', short: 'single-pile cap', icon: 'pilecap', sheet: 'SinglePileCap_EC2-2023_Standalone',
    sub: 'Pile cap on one pile, strut-and-tie',
    desc: 'Size the cap, the column and the pile on the plan (the pile is shown at its position tolerance), type N, M and H of each load combination; the worksheet designs the cap by strut-and-tie (nodes, ties, punching, cracking, detailing) to EN 1992-1-1:2023 for every combination.',
    loads: ['N_Ed', 'M_Ed;y', 'M_Ed;x', 'H_Ed;x', 'H_Ed;y', 'N_qp'],
    plan(v) {
      const Bx = v.mm('B_x'), By = v.mm('B_y'), cx = v.mm('c_x'), cy = v.mm('c_y'), D = v.mm('D_p'), ex = v.mm('e_x'), ey = v.mm('e_y');
      return {
        shapes: [{ t: 'outline', x: 0, y: 0, w: Bx, h: By, label: 'Cap ' + r0(Bx) + ' × ' + r0(By) + ' × ' + r0(v.mm('h')) },
          { t: 'col', x: 0, y: 0, w: cx, h: cy, label: 'Column ' + r0(cx) + ' × ' + r0(cy) },
          { t: 'pile', x: ex, y: ey, d: D, sq: v.num('PileType') === 1, hidden: true, title: 'Pile ' + r0(D) + ' below the cap, at the position tolerance e_x = ' + r0(ex) + ', e_y = ' + r0(ey) + ' mm' }],
        dims: [{ x1: -Bx / 2, y1: -By / 2, x2: Bx / 2, y2: -By / 2, off: 30, text: r0(Bx) }, { x1: Bx / 2, y1: By / 2, x2: Bx / 2, y2: -By / 2, off: 30, text: r0(By) }],
        handles: [
          { x: Bx / 2, y: 0, title: 'Cap size B_x', set: dx => ({ B_x: Math.max(Math.max(cx, D) + 100, Bx + 2 * dx) }) },
          { x: 0, y: By / 2, title: 'Cap size B_y', set: (dx, dy) => ({ B_y: Math.max(Math.max(cy, D) + 100, By + 2 * dy) }) },
          { x: -cx / 2, y: cy / 2, title: 'Column size c_x × c_y', set: (dx, dy) => ({ c_x: Math.max(150, Math.min(Bx - 100, cx - 2 * dx)), c_y: Math.max(150, Math.min(By - 100, cy + 2 * dy)) }) },
          { x: ex + D / 2, y: ey - D / 2, title: 'Pile size D_p', set: dx => ({ D_p: Math.max(150, Math.min(Math.min(Bx, By) - 100, D + 2 * dx)) }) }
        ]
      };
    },
    check: v => (v.mm('c_x') >= v.mm('B_x') || v.mm('c_y') >= v.mm('B_y') ? 'The column is larger than the cap.' : v.mm('D_p') >= Math.min(v.mm('B_x'), v.mm('B_y')) ? 'The pile is larger than the cap.' : ''),
    brief: v => `${r0(v.mm('B_x'))} × ${r0(v.mm('B_y'))} mm, pile ${r0(v.mm('D_p'))}`
  });

  if (EC.analysis && EC.analysis.kit) specs.forEach(s => { if (!EC.analysis.tools.some(t => t.k === s.k)) EC.analysis.kit(s); });
})(typeof window !== 'undefined' ? window : globalThis);
