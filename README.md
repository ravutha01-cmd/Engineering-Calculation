# CAMBO STRUCT · Engineering Design (web)

A browser app for structural and geotechnical design to the Eurocodes. It runs as plain static files, with no build step and no server.

It has **79 design modules**, covering every calculation in the `math.Claude` Mathcad library (EC1, EC2, EC3, EC4, EC7, EC8).

## What it does

- **Dashboard**: KPIs (elements, checks OK / revise, design progress, rebar and steel tonnage), utilisation by element, design status, upcoming deadlines and the main element groups.
- **Project → main elements → elements**: nine groups (Foundations, Columns & walls, Beams, Slabs & stairs, Connections & details, Durability & SLS, Geotechnical, Actions & loads, Steel & composite). Each element has a mark, level, grid, quantity, status, start/due dates and a designer.
- **Element editor**: inputs on the left (yellow cells, as in the Mathcad worksheets). Rows of data such as soil layers, SPT logs, pile coordinates, load spectra and FE forces go in editable tables. On the right are four tabs:
  - **Summary**: Item / U / Status table and U<sub>max</sub>.
  - **Calculation**: the full calculation. Each line shows its clause, formula, substituted values and result.
  - **Specification**: materials, cover, reinforcement and the other items to specify.
  - **Detailing**: SVG sections, elevations, plans and STM models, interaction diagrams and result plots, plus an indicative bar schedule.
- **Element schedules**: one schedule per element type. You can filter by status, export CSV and print.
- **Design programme**: a Gantt view of element design from start to due date, coloured by status, with a today line and overdue flags.
- **Mathcad library**: an index of the `math.Claude` worksheets. Each entry has a button that starts the matching web calculation.
- **Light / dark mode**, printing with a CAMBO STRUCT header, and **Export / Import** of projects as JSON. Data is saved in the browser.

## Run

Online (GitHub Pages): https://ravutha01-cmd.github.io/Engineering-Calculation/

Locally: open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000   # then open http://localhost:8000
```

## Design modules

| Group | Modules |
|---|---|
| **Foundations** (8) | Pad Footing, Pile Cap, Combined Footing (2 columns), Pile Cap - STM (2–9 piles / custom), Pile Cap - Single Pile, Pile Cap - Multi-column, Pile Cap from FE Forces, Raft Foundation |
| **Columns & walls** (4) | RC Column, RC Shear Wall, Slender Wall (out of plane), Column Effective Length |
| **Beams** (5) | RC Beam, Beam Torsion + Shear, Deep / Transfer Beam (STM), Beam with Web Opening, Fatigue of RC Beam |
| **Slabs & stairs** (8) | RC Slab (one-way), Flat slab punching, Two-way Slab, Flat Slab (strip design), Ribbed Slab (one-way), Post-tensioned Slab, Staircase (waist slab), Spiral / Helical Stair |
| **Connections & details** (6) | Corbel / Bracket (STM), Dapped End / Half Joint, Frame Corner (knee joint), Beam-Column Joint (exterior), Interface Shear (composite), Anchorage & Lap Lengths |
| **Durability & SLS** (8) | Concrete Cover, Crack Control, Deflection by Calculation, Creep & Shrinkage, Early-age Restraint Cracking, Fire Resistance (tabulated), Tank Wall Strip (liquid retaining), Tank Wall Panel (two-way) |
| **Geotechnical** (20) | Footing Bearing & Sliding (EC7), Settlement (layered ground), Cantilever Retaining Wall, Gravity / Gabion Wall, Retaining Wall - Seismic (M-O), Sheet Pile Wall, Grouted Ground Anchor, Basement Uplift (UPL), Slope / Embankment Stability, Staged Embankment + PVD, Stone Columns (Priebe), Pile Axial Capacity, Driven Precast Pile (SPT), Pile Lateral (Broms + Winkler), Pile Group Settlement, Pile Downdrag (negative skin friction), Pile Load Test Interpretation, Pile Soil Springs (ETABS/SAFE), SPT Soil Parameter Correlations, Liquefaction Screening (SPT) |
| **Actions & loads** (17) | Wind on Building, Wind on Canopy / Signboard, Wind on Portal Frame Building, Imposed Loads & Take-down, Self Weight Build-ups, Vehicle Impact on Column, Execution Loads (falsework, back-propping), Thermal Actions (roof slab), Tall Building Wind (dynamic), Tall Building Wind Drift, Across-wind & Torsion (tall), Tall Building Load Combinations, Core + Outrigger System, Thermal Movement - Exposed Columns, Column / Core Shortening, Chimney / Pole - Vortex Shedding, Circular Water Tank Wall |
| **Steel & composite** (3) | Steel Member (I/H), Composite Bridge Girder (slab above or below), Steel Seat Bracket + Anchors |

Some modules use small numerical solvers that run in the browser:

- strain-compatibility N–M interaction for columns, walls and chords;
- a grillage plate analysis for two-way tank panels (checked against Timoshenko plate coefficients to within about 10 %);
- a beam on Winkler springs for laterally loaded piles, raft strips and the cylindrical tank wall (sliding base reproduces γHR exactly);
- a Bishop circular-slip grid search for slopes;
- an elastic chain for differential thermal movement;
- a construction-sequence creep and shrinkage model for column shortening.

## Code basis and limits

Concrete follows EN 1992-1-1:2023 and steel EN 1993. Actions follow EN 1991 (2023/2024 drafts where noted) and EN 1990. Geotechnics follows EN 1997 (2004 design approaches, with the EN 1997:2024 RFA DC1 / MFA DC3 sets).

- Lines marked **[NDP]** use the recommended values.
- Lines marked **[verify]**, **[practice]** or "2004 … (informative)" take a formula or table from the 2004 editions or from established practice. Check them against your copy of the code and the National Annex.

These calculations are for preliminary design and checking. Final design uses the detailed Mathcad worksheets listed in the library.

## Code layout

```
index.html            app shell
css/styles.css        light / dark design tokens, layout, print styles
js/app.js             store, router, dashboard, element editor, schedules, programme, library
js/library.js         index of the Mathcad worksheets (generated from math.Claude/README.md)
js/calc/common.js     calculation engine: materials, report builder, EC2 routines, plots, wind, creep
js/calc/*.js          design modules (one file per group)
```

To add an element type, register `EC.modules.<type> = { name, cat, prefix, code, mathcad, groups, schedCols, sched, calc }` in a file under `js/calc/` (see `beam.js`), then add the script to `index.html`. Its group comes from `cat`.
