# CAMBO STRUCT · Engineering Design (web)

A browser app for structural design to the Eurocodes. It runs as plain static files, with no build step and no server.

- **Dashboard**: KPIs (elements, checks OK / revise, design progress, rebar and steel tonnage), utilisation by element, design status, upcoming deadlines and the main element groups.
- **Project → main elements → elements**: Foundations, Columns, Beams, Slabs and Steelwork. Each element has a mark, level, grid, quantity, status, start/due dates and a designer.
- **Element editor**: inputs on the left (yellow cells, as in the Mathcad worksheets). On the right are four tabs:
  - **Summary**: Item / U / Status table, U<sub>max</sub> and the overall verdict.
  - **Calculation**: the full calculation. Each line shows its clause, formula, substituted values and result. Key results are blue; checks are marked OK or NOT OK.
  - **Specification**: materials, cover, reinforcement, anchorage and laps.
  - **Detailing**: SVG section, elevation and plan drawings, interaction diagrams and an indicative bar schedule with masses.
- **Element schedules**: one schedule per element type (beam schedule, column schedule …). You can filter by status, export CSV and print.
- **Design programme**: a Gantt view of element design from start to due date, coloured by status, with a today line and overdue flags.
- **Mathcad library**: an index of the `math.Claude` Mathcad Prime worksheets, generated from its `README.md`.
- **Light / dark mode**: follows the system setting and can be switched with the toggle.
- **Printing**: printed calculations get a CAMBO STRUCT header (project, element, calculated by / checked by, date).
- **Data**: saved in the browser (`localStorage`). Use **Export / Import** to back up or share projects as JSON.

## Run

Online (GitHub Pages): https://ravutha01-cmd.github.io/Engineering-Calculation/

Locally: open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000   # then open http://localhost:8000
```

## Calculation modules (`js/calc/`)

| Module | Element | Checks |
|---|---|---|
| `beam.js` | RC beam (rectangular) | Bending sag/hog (λ = 0.8 stress block, x/d), A<sub>s,min/max</sub>, shear with links (variable θ, τ<sub>Rd,c</sub> with d<sub>dg</sub>), span/depth deflection, crack-control bar spacing, clear spacing, anchorage Eq. 11.3 |
| `column.js` | RC column | N<sub>Rd</sub>, slenderness and λ<sub>lim</sub>, nominal-curvature second order, M<sub>Rd</sub> at N<sub>Ed</sub> by strain compatibility, biaxial interaction, N–M diagrams, detailing |
| `slab.js` | One-way slab, flat-slab punching | Loads (EN 1990), coefficient moments, bending, shear without links, deflection, distribution steel; punching b<sub>0.5</sub>, k<sub>pb</sub>, τ<sub>Rd,c</sub>, outer perimeter, integrity steel |
| `foundation.js` | Pad footing, pile cap | Bearing pressure and kern, bending at the faces, one-way shear, punching with soil relief; rigid-cap pile reactions with tolerance, bending, shear with a short-span reduction, column punching, tie anchorage |
| `steel.js` | Rolled I/H member (EN 1993-1-1) | Classification, N / M / V resistance, flexural buckling, LTB (M<sub>cr</sub>, rolled-section method), interaction 6.61 / 6.62, deflection |

Code basis: EN 1992-1-1:2023 for concrete, EN 1993-1-1 for steel, and EN 1990 / EN 1997 for actions and ground. Lines marked **[NDP]** use the recommended values. Lines marked **[verify]** or "2004 … (informative)" take a formula from the 2004 edition or from practice; check them against your copy of the code and the National Annex. These calculations are for preliminary design. Final design uses the detailed Mathcad worksheets listed in the library.

To add an element type, create `js/calc/<name>.js` that registers `EC.modules.<type> = { name, cat, prefix, code, groups, schedCols, sched, calc }` (see `beam.js`). Then add the script to `index.html` and the type to a category in `js/app.js`.
