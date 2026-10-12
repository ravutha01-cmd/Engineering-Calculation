# CAMBO STRUCT engineering web app

- Every Mathcad worksheet in the Drive folder `math.Claude` is one element type of this app.
- When a Mathcad worksheet is modified, its web calculation must be updated; when a new `.mcdx`
  file is added, add it as a new element. Follow `tools/UPDATE_FROM_MATHCAD.md`.
- Formulas are never retyped: `sheets/*.js` are generated from the `.mcdx` files by `tools/mcdx2json.py`.
- Tests: `node tools/test_sheets.js` and `node tools/test_analysis.js`.
- Design analysis tools (`js/analysis/`, sidebar "Design analysis") draw a structure and feed the worksheet's own
  input tables; the worksheet does the design. Follow `docs/DESIGN_ANALYSIS_TOOLS.md` to add one.
- Plots and detailing drawings use the app's OWN style (js/mcad/render.js `plot`, "Plots" block in
  css/styles.css): only the calculated data and the formula / calculation workflow come from the
  worksheet. Never copy Mathcad's plot styling (colours, pens, dashes, symbols). Traces get a role
  (section outline, links, bars, guide/limit lines, series 1-4 from the validated palette, light + dark),
  drawings are true scale with dimension lines, charts have a legend, hover values and a data table.
  Any new visual work follows this new style.
- Every calculation follows docs/CALCULATION_GUIDELINES.md: step-by-step report in the app's own style
  (numbered steps from the worksheet's design workflow, unimportant Mathcad regions hidden), tables for
  inputs / constants / summaries, pictures in the plot style, and 5-10 typical details per element
  (js/typdet/<category>.js). Default parameters (partial factors, NDPs, constants, limits) are folded
  in the input panel.
