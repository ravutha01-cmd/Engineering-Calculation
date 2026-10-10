# CAMBO STRUCT engineering web app

- Every Mathcad worksheet in the Drive folder `math.Claude` is one element type of this app.
- When a Mathcad worksheet is modified, its web calculation must be updated; when a new `.mcdx`
  file is added, add it as a new element. Follow `tools/UPDATE_FROM_MATHCAD.md`.
- Formulas are never retyped: `sheets/*.js` are generated from the `.mcdx` files by `tools/mcdx2json.py`.
- Tests: `node tools/test_sheets.js`.
