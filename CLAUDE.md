# CAMBO STRUCT engineering web app

- Every Mathcad worksheet in the Drive folder `math.Claude` is one element type of this app.
- When a Mathcad worksheet is modified, its web calculation must be updated; when a new `.mcdx`
  file is added, add it as a new element. Follow `tools/UPDATE_FROM_MATHCAD.md`.
- Formulas are never retyped: `sheets/*.js` are generated from the `.mcdx` files by `tools/mcdx2json.py`.
- Tests: `node tools/test_sheets.js`.
- Plots and detailing drawings use the app's OWN style (js/mcad/render.js `plot`, "Plots" block in
  css/styles.css): only the calculated data and the formula / calculation workflow come from the
  worksheet. Never copy Mathcad's plot styling (colours, pens, dashes, symbols). Traces get a role
  (section outline, links, bars, guide/limit lines, series 1-4 from the validated palette, light + dark),
  drawings are true scale with dimension lines, charts have a legend, hover values and a data table.
  Any new visual work follows this new style.
