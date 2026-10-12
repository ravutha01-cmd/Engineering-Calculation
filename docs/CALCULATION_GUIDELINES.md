# CAMBO STRUCT – Calculation guidelines

Every calculation in the app (Mathcad-based "hand calculation" elements and native / ETABS-linked
elements) follows the same four parts. The **engineering content** (formulas, clauses, design steps,
results) comes from the calculation itself. For Mathcad elements that is the worksheet, never retyped.
The **presentation** is the app's own style. Mathcad's layout, colours and pens are not copied.

| Part | What it contains | Where |
|---|---|---|
| 1. Step-by-step calculation | Numbered design steps, each with label + clause, formula, substituted values and the bold result; checks end in OK / NOT OK | Calculation tab |
| 2. Tables | Design data, parameters, bar / check summaries as compact tables instead of long lists | Calculation and Summary tabs |
| 3. Pictures | Drawings and charts of the calculation (section, diagrams, interaction curves) | Calculation + Detailing tabs |
| 4. Typical detailing | 5–10 parametric typical details per element, drawn from its own inputs | Detailing tab |

---

## 1. Step-by-step calculation

- **Steps follow the design workflow of the worksheet.** Each main heading of the worksheet becomes
  `Step N · Title`, for example Step 1 · Input data, Step 2 · Materials, Step 3 · Section and
  reinforcement, Step 4 · Bending (ULS), and so on. Sub-headings stay as sub-headings.
- **One row per design calculation:**
  - left: what it is (plain words) and the clause, e.g. *Design yield strength* · *Table 4.3*;
  - right: the formula, then the substituted values, then the **result** in bold with its unit.
- **Checks** show `E_d ≤ R_d → η = U` and an **OK / NOT OK** badge. Key results are highlighted.
- **Removed from the clean report** (still available with *Full worksheet (all Mathcad steps)*):
  - plot and drawing coordinate vectors (`X_…`, `Y_…`) and their captions;
  - helper functions and program blocks that only feed other formulas;
  - substituted values of conditional or program formulas (`if(…)`, `lookup`, `augment` …).
    For these the result is shown and the formula folds behind a small **formula** toggle.
- **Labels must match their formula.** A label is the closest text at or just above the formula, and
  each label is used once.

## 2. Tables

- **Design data:** the inputs of each step are shown as one table (Parameter · Symbol · Value)
  instead of a row per input. Edited values are marked with an accent bar.
- **Parameters:** constants that are not inputs, such as ε_cu = 0.0035, λ = 0.8, η = 1 and
  ξ_lim = 0.45, are collected into a dashed *Parameters* table.
- **Vectors and matrices** are readable tables with a unit per column. Summaries are one table
  (Item · Check · Utilisation · Status) and are never repeated.

## 3. Pictures and charts

All drawings and charts use the app's plot style (`js/mcad/render.js`, *Plots* block in
`css/styles.css`), in light and dark mode:

- **drawings** are true scale, with concrete fill, link lines, rebar dots with a ring and dimension lines;
- **charts** use the validated 4-colour palette, dashed limit lines, a legend, hover values and a data table.

## 4. Typical detailing (5–10 per calculation)

Each element type shows **at least 5 and up to 10 drawings** in its Detailing tab. The calculation's own
drawings come first, then **typical details** of its category, numbered TD-01, TD-02 and so on.
Typical details are parametric: they read the element's own inputs (section size, cover, bar diameters
and numbers, spacing). Fixed rules come from EN 1992-1-1 Section 11–12 / EN 1993 practice: bends,
laps, anchorage, link hooks, spacing limits.

Minimum set per category:

| Category | Typical details |
|---|---|
| Beams | cross-section · elevation with curtailment and link zones · link shape (135° hooks) · lap splice · end anchorage at support · bar bending shapes · side bars / web openings |
| Columns & walls | section · elevation with link zones and lap above floor · link and cross-tie shapes · starter bars / kicker · beam–column joint links · wall end zone and U-bars |
| Slabs & stairs | bottom / top mesh plan · section with cover · edge U-bars · opening trimmer bars · punching shear studs / links · stair waist and landing junction |
| Foundations | footing plan with bottom mesh · section with starter bars · pile cap plan with piles and ties · pile head embedment · edge / corner bars · blinding and cover |
| Steel & composite | member section · base plate and anchor bolts · fin-plate / end-plate connection · splice · stiffeners · shear studs |
| Connections & details, SLS, geotechnical, actions | the governing detail of the worksheet (corbel ties, dapped-end hanger bars, anchorage and lap table, cover build-up, retaining wall stem and heel, anchor head) plus the general reinforcement rules that apply |

Each typical detail has:
- a **title**;
- a one-line **subtitle** with the key values;
- **notes** for what cannot be drawn, such as "laps staggered 50 %" or "hooks 135°, 10ϕ".

Typical details are marked *indicative*: the calculation governs.

## 5. Inputs

- **Main inputs** are always visible: geometry, materials, strength classes, cover, actions and
  reinforcement.
- **Default parameters** fold into one collapsed section at the bottom of the input panel. These are
  partial factors, [NDP] values, elastic modulus, creep / shrinkage, aggregate size, bond condition and
  crack / deflection limits. The section shows how many there are and how many are changed. Open it to
  edit them (`EC.isDefaultParam` in `js/mcui.js`).

## 6. Checklist for a new or updated calculation

1. The steps read in the design order of the worksheet; no plot vectors or helper programs are visible.
2. Every label matches its formula, and every check has OK / NOT OK.
3. Inputs and constants are in tables; default parameters are folded.
4. The Detailing tab shows 5–10 drawings, all in the app's style, in light and dark mode.
5. `node tools/test_sheets.js` passes, and the browser shows no errors.
