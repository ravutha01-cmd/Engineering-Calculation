# Design analysis tools

A design analysis tool is a **drawing / analysis front end for one Mathcad worksheet**. You draw the
structure, the tool turns the drawing into the worksheet's own input tables, and the worksheet does the
whole design. No design formula is retyped: the worksheet stays the calculation (see `CLAUDE.md`).

Sidebar: **Design analysis** (`#/analysis`). Each analysis is an ordinary element of the worksheet's type,
with its drawing stored in `e.fda`. Lists, schedules, the dashboard, records and sync work as for any
other element. The worksheet element page (`#/el/<id>`) shows a banner that links back to the drawing.

## Foundation · pile caps (first tool)

| | |
|---|---|
| Worksheet | `PileCap_Multi_EC2-2023_Standalone.mcdx`: a pile cap under several columns and walls, with loads given per node |
| Files | `js/analysis/pilecap_model.js` (drawing → worksheet inputs, pure), `js/analysis/pilecap.js` (editor) |
| Test | `node tools/test_analysis.js` |

- **Draw**: piles, columns (b_x × b_y) and walls (horizontal or vertical, thickness t) on a true-scale
  plan with grid snap. You can also start from a template (1–12 piles, a wall on piles, a combined cap
  for two columns, a core) or generate a rectangular pile grid. Drag to move objects; undo / redo are available.
- **Loads**: N, M_y, M_x, H_x and H_y per column / wall for each load combination. The sign convention
  is the worksheet's: N + = compression, M_y > 0 loads the piles at +x, and M_x > 0 loads the piles at +y.
- **Analysis**: the worksheet runs **once per combination**, which is the worksheet's own instruction
  ("run the worksheet once per combination"). The combination with the largest U_max governs. Pile
  reactions R_i come from the worksheet (rigid cap), are drawn on the plan coloured by R / N_Rd,p, and are listed
  per combination with the envelope.
- **Report**: the worksheet's full step-by-step calculation, detailing, specification and records for
  the governing combination. You can tick another combination to see its report instead.
- **Inputs mapped from the drawing**: `x_p, y_p` (piles); `x_n, y_n, T_n, w_xn, w_yn, N_n, M_yn, M_xn,
  H_xn, H_yn` (load nodes). All other worksheet inputs (pile size and type, N_Rd,p, cap depth,
  materials, bars, NDPs) are edited in the left panel. The cap outline follows the worksheet's rule
  (pile extremes + h/2 + e_p).
- **Walls** are cut into nodes of at most *Wall node ≤* (default 1000 mm), as the worksheet asks
  ("a long wall is typed as several nodes, each with the load of its segment"). N, H and the out-of-plane
  moment are shared by length. The in-plane moment becomes a linear share of N: ΔN_i = M·L_i·e_i / ΣL_j·e_j²,
  so ΣΔN_i·e_i = M. `tools/test_analysis.js` checks that the statics are kept.

## Adding a tool for another worksheet

1. Write `js/analysis/<tool>_model.js` with pure functions: `inputs(model, combo)` → worksheet overrides,
   in the same form the input tables use (`['o','*',['M',n,1,[…]],['u','mm']]`). List the worksheet
   inputs the drawing owns (`GEOM`); the editor hides them from the input panel.
2. Write `js/analysis/<tool>.js` and register it with `EC.analysis.add({ k, name, short, sub, icon, sheet,
   desc, install, create, view, mount, onResult, brief })` (see `js/analysis/core.js`). Reuse
   `EC.mcui.compute`, `EC.mcui.inputsHTML(e, doc, GEOM)` and `EC.mcui.vOutput(e)` for the runs, the input
   panel and the report.
3. Drawings follow the app's plot style (`svg.mplot` classes, the *Plots* block in `css/styles.css`, light and dark).
4. Add the scripts to `index.html` after `js/mcui.js`, and add a Node test like `tools/test_analysis.js`.

Candidates in the Mathcad library: pad / combined footings (column positions on the footing), raft
(`Raft_EC7-2024`), retaining walls, and beams or slabs from a drawn grid.
