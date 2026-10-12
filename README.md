# CAMBO STRUCT · Engineering Design (web)

A browser app for structural and geotechnical design to the Eurocodes. It runs as plain static files, with no build step and no server.

It has **79 design modules**, covering every calculation in the `math.Claude` Mathcad library (EC1, EC2, EC3, EC4, EC7, EC8).

## One Mathcad worksheet = one element type

Every worksheet in `math.Claude` (92 `.mcdx` files) is an element type in the app. The worksheet itself is the calculation:

- `tools/mcdx2json.py` reads each `.mcdx` file (Mathcad Prime XML) and writes `sheets/<name>.js`: text, formulas as expression trees, plots and the yellow input regions. No formula is retyped or simplified.
- `js/mcad/engine.js` evaluates the worksheet in the browser with units, matrices (ORIGIN = 1), strings, user functions, programs (`for`, `if`, `return`, `try`), `root`, `linterp` and the other built-ins the worksheets use. Heavy sheets run in a Web Worker.
- **Check against Mathcad.** 59 worksheets carry Mathcad's own cached results. On those sheets, 6,020 displayed values match Mathcad exactly. A further 386 do not: about 20 differ by 0.001 % (Mathcad's `root` tolerance), and the rest come from the two pile-cap sheets that need ETABS / Excel data and from not-a-number entries in the SPT sheet.
- The **Calculation** tab shows the worksheet as written in Mathcad: each formula, then the formula with the values substituted, then the result in the worksheet's units. Options show the value of every definition and open the hidden areas. Yellow, green and blue backgrounds keep their meaning.
- **Detailing** shows every Mathcad plot (sections, bar layouts, diagrams) at true scale, plus the bar call-outs. **Specification** lists the inputs and the key results.
- **Autosave and records.** Each change is saved within about 0.25 s, results included. *Save record* keeps a revision of the inputs and the result, which you can restore later. Data syncs between devices through your Claude account (artifact version) or a private GitHub Gist (GitHub Pages version, set up in Project settings).

`node tools/test_sheets.js` runs every worksheet as a regression check.

## Accounts

The app opens on a sign-in page with two account types:

| Account | Calculations | Saving |
|---|---|---|
| **Demo** | every worksheet | nothing is saved - data is lost when the page is closed or reloaded |
| **Admin** | every worksheet | inputs, results and records saved automatically to **Google Drive** (folder `CAMBO STRUCT`, file `CAMBO STRUCT database.json`) and synced to every device |

**Who can use Admin:** the database file is created in the signed-in Google account's own Drive with the
`drive.file` permission, so only that Google account can read or change it. The Admin username and
password are chosen on the first sign-in on each device and only a PBKDF2 check value is kept in that
browser; the password is never stored, sent or published.

**One-time Google setup (needed before Admin sign-in works):**
1. https://console.cloud.google.com → create a project (e.g. *CAMBO STRUCT*).
2. *APIs & Services → Library* → enable **Google Drive API**.
3. *APIs & Services → OAuth consent screen* → External, app name *CAMBO STRUCT*, your email; add the
   scope `.../auth/drive.file`; under *Test users* add your Google account.
4. *Credentials → Create credentials → OAuth client ID* → **Web application**; *Authorised JavaScript
   origins*: `https://ravutha01-cmd.github.io`.
5. Put the client ID (`….apps.googleusercontent.com`, not secret) in `js/config.js` → `googleClientId`, and the
   owner's Google account in `adminEmails` (only that account can use Admin).

A Google sign-in lasts about an hour; after that the badge in the top bar shows *Connect Google Drive*
(one click). In the Claude artifact version the Claude login is the account (private Claude storage).
Pro accounts with registration come later.

## What it does

- **Dashboard**: KPIs (elements, checks OK / revise, design progress, rebar and steel tonnage), utilisation by element, design status, upcoming deadlines and the main element groups.
- **Two separate design tools**, each with its own section in the sidebar, its own element list and its own cards on the dashboard:
  - **Design by hand calculation (Mathcad)**: pick a Mathcad worksheet, enter section, materials and forces by hand. Lists at `#/elements`; the Mathcad library is in this section.
  - **Design with ETABS link**: a live link to the open ETABS model through the CSI API (no Excel export). Pick the load combinations, read beam / column / brace / pier forces and support reactions, envelope them and create or update linked elements designed for the governing combination. After re-running the analysis, **Sync linked elements** pushes the new forces into every linked element and keeps your section and bar edits. Link at `#/etabs`, linked elements at `#/linked`. An exported table (Excel / CSV / paste) is still accepted as an offline fallback.

### Design analysis (draw → analyse → Mathcad design)

A third design tool, in its own sidebar section (`#/analysis`). You draw the structure and the Mathcad worksheet designs it. The drawing only produces the worksheet's input tables, so no formula is retyped. See `docs/DESIGN_ANALYSIS_TOOLS.md`.

- **Foundation · pile caps**: draw piles, columns and walls on a true-scale plan (grid snap, drag, undo), or start from a template (1–12 piles, a wall on piles, a combined cap, a core) or a pile grid. Type N, M_y, M_x, H_x and H_y per column / wall for each load combination. The `PileCap_Multi_EC2-2023_Standalone` worksheet runs once per combination. The plan shows the pile reactions coloured by R / N_Rd,p, and tables give the per-combination results with the envelope. The full EN 1992-1-1:2023 report of the governing combination sits below the drawing. Walls become worksheet load nodes (≤ 1 m segments, statics kept).

### Loads & combinations (ETABS)

**Design with ETABS link → Loads & combinations** writes to the open ETABS model:

- **Load patterns** - creates the missing standard patterns (Dead with self-weight 1.0, SDL, Live, Roof Live, Wind X, Wind Y); every pattern and response-spectrum case is mapped to its action (G, Q with its EN 1990 category, S, W, E, T), guessed from its ETABS type.
- **Slab loads** - SDL and the imposed load q_k of the chosen category (EN 1991-1-1 Table 6.2) on the floor slabs selected in ETABS.
- **Load combinations (EN 1990 Annex A1)** - ULS 6.10 or 6.10a/6.10b with each variable action leading in turn and ψ0 from Table A1.1, G favourable with leading wind, wind ±, EQU 0.9 G + 1.5 W, seismic G + ψ2·Q + E with 100 % + 30 % (EN 1998-1 4.3.3.5.2, ± for static seismic patterns), SLS characteristic / frequent / quasi-permanent, wind-only SLS for drift, and envelopes. Roof imposed loads are not combined with snow or wind (EN 1991-1-1 3.3.2).
- **Seismic design spectrum (EN 1998-1 3.2.2.5)** - from a_gR, importance class (γI), ground type A–E, spectrum type 1 / 2, q and β: S, T_B, T_C, T_D, the plateau a_g·S·2.5/q and the lower bound β·a_g, shown as a chart; written to ETABS as a user response-spectrum function (S_d/g) and the response-spectrum cases EQX RS (U1) / EQY RS (U2) - scale g, CQC, SRSS, accidental eccentricity 0.05 (4.3.2), modal case - used by the seismic combinations.
- **Imperfections (notional loads)** - θi = θ0·αh·αm with θ0 = 1/200, αh = 2/√l (2/3…1), αm = √(0.5(1+1/m)) (EN 1992-1-1 5.2, EN 1993-1-1 5.3.2). One ETABS notional pattern per gravity pattern and direction ("N Dead X" on Dead, ratio θi), factored like its base pattern in every ULS combination, in ±X and ±Y, or in the wind's direction when wind is present. Not used in the seismic combinations. Fully automatic: the link writes ETABS's own notional settings (base pattern, ratio θi, direction) through the notional-load database table; where an ETABS version has no such table, it runs a gravity analysis, takes each floor's load N per base pattern and applies H_i = θi·N (EN 1992-1-1 5.2(8)) as horizontal joint loads on every storey in the same patterns.
- **Preview** - tabs for load patterns, load cases and load combinations show what ETABS will contain after writing: *New*, *Changed* (old and new factors side by side), *Removed* (managed combinations no longer generated), *Unchanged* and your own combinations (*kept*). **Preview with demo model** shows it without ETABS.
- **Auto-update** - the managed combinations (prefix `CS-`) are rebuilt and written back whenever the load patterns or cases change in ETABS (the building is modified) or a rule changes here; the user's own combinations are never touched.

Writing needs `etabs_bridge.py` 1.3 or later. Writes are POST requests accepted only from the CAMBO STRUCT page; an analysed (locked) model is unlocked only after you confirm, because ETABS then deletes the analysis results.

### Building checks (ETABS)

**Design with ETABS link → Building checks** reads the whole building from ETABS (storey drifts, storey forces, max / average displacements, base reactions, buckling factors) and checks:

| Check | Rule |
|---|---|
| Inter-storey drift (seismic) | EN 1998-1 4.4.3.2: d_r = q_d·d_e, d_r·ν ≤ α·h (α = 0.005 / 0.0075 / 0.010) |
| P-Δ second-order effects | EN 1998-1 4.4.2.2: θ = P_tot·d_r / (V_tot·h); ≤ 0.1 neglect, ≤ 0.2 multiply by 1/(1−θ), ≤ 0.3 second-order analysis |
| Torsion of the building | Δmax/Δavg per storey: ≤ 1.2 regular, ≤ 1.4 torsional irregularity, > 1.4 extreme |
| Wind drift (SLS) | storey drift ≤ h/500 (editable) |
| Base shear & overturning moment | storey shear and overturning-moment profiles, V/W per combination, overturning stability W·B/2 ÷ M (EQU) |
| Global buckling | α_cr from a linear buckling case: ≥ 10 first order; ≥ 3 sway effects × 1/(1−1/α_cr) (EN 1993-1-1 5.2.2(5)B); < 3 second-order analysis |
| Modal analysis | EN 1998-1 4.3.3.3.1: periods and participating mass of every mode; Σ effective mass ≥ 90 % in X and Y and every mode with > 5 % included, or k ≥ 3√n with T_k ≤ 0.20 s; a torsional first mode is flagged (4.2.3.2(6)) |
| Soft storey | EN 1998-1 4.2.3.3(3) (stiffness constant or reducing gradually upwards): k_i = V_i/(d_r,i·h_i) per storey and direction; soft below 0.7·k_i+1 or 0.8·mean of the 3 storeys above, extreme below 0.6 / 0.7 (ASCE 7 Table 12.3-2 limits); a soft storey makes the building irregular in elevation (modal analysis, q0 − 20 %) |
| Weak storey | EN 1998-1 4.2.3.3(4) (storey resistance vs required resistance not varying disproportionately): storey shear resistance V_Rd,i = Σ columns + walls in plane, read from the ETABS sections (`/strength`; concrete v_min·b_w·d EN 1992-1-1 6.2.2(1), steel A_v·f_y/√3 EN 1993-1-1 6.2.6); weak below 0.8·V_Rd,i+1, extreme below 0.65 (ASCE 7 Table 12.3-2); Ω_i = V_Rd,i/V_Ed,i flagged when it drops > 30 % from the storey above (prEN 1998-1-2) |
| Mass irregularity | EN 1998-1 4.2.3.3(3) (storey mass constant or reducing gradually upwards): storey masses from the ETABS “Mass Summary by Story” table; irregular when m_i > 1.5 × an adjacent storey (ASCE 7 Table 12.3-2 type 2, a lighter roof not considered); storeys more than 10 % heavier than the one below noted |
| Torsional radius & eccentricity | EN 1998-1 4.2.3.2(6): e_0x ≤ 0.30·r_x and r_x ≥ l_s, and in Y, per storey. r/l_s from the ETABS modes (r_x/l_s = T_Y/T_θ, uncoupled modes), l_s = √(MMI/m) from “Mass Summary by Diaphragm” (or the plan size), e_0 from “Centers Of Mass And Rigidity” (tick “Calculate Diaphragm Centers of Rigidity”); r < l_s → torsionally flexible system (5.2.2.1(4), q_0 Table 5.1), e_0 > 0.3r → not regular in plan |
| Accidental torsion | EN 1998-1 4.3.2(1)P, 4.3.3.2.4, 4.3.3.3.3: the accidental eccentricity ratio of every ETABS response-spectrum case is read and checked against 0.05; storey torques M_ai = e_ai·F_i with e_ai = 0.05·L_i (L_i normal to the action) from the storey shears of the governing seismic case; δ = 1 + 0.6·x/L_e (1.30 at the perimeter) or 1 + 1.2·x/L_e (1.60) for planar models |
| Wind comfort | EN 1991-1-4 Annex B.4 peak along-wind acceleration at the top for the comfort return period vs a_lim (ISO 10137 / CTBUH guidance): one ETABS-linked **Wind_TallBuilding** worksheet per direction is created / updated from ETABS (height, storeys, plan, density from the storey masses, n_1 = 1/T of the first mode in the wind direction, Wind SLS base shear / moment as V_as / M_as) - the formulas are the worksheet's; the worksheet's other flags (e.g. ETABS wind lower than the dynamic wind) are shown |
| Support uplift / pile tension | EN 1997-1 7.6.3.1(2) F_t;d ≤ R_t;d: ETABS joint reactions of every restrained joint (`/supports`, plan coordinates) for the ULS and seismic combinations with vertical load; F_t;d = −FZ_min − 0.9·W_f (foundation weight favourable); inputs R_t;d (piles / anchors, 0 = none) and W_f per support; true-scale support plan, 12 most critical supports |
| Foundation design forces | EN 1998-1 4.4.2.6(2)-(3): E_Fd = E_F,G + γ_Rd·Ω·E_F,E per support (γ_Rd = 1.0 for q ≤ 3, else 1.2; Ω = R_di/E_di ≤ q, input); E_F,G = (Max+Min)/2 and E_F,E = (Max−Min)/2 of the ETABS reactions of the G+ψ2Q+E combinations; N_Fd,max / min, H_Fd and the tension check with R_t;d and W_f |
| Axial shortening | EN 1992-1-1 3.1.4 / Table 3.1: per column line (ETABS label) and wall pier (`/axial`, quasi-permanent combination) δ = Σ(N/(E_cm·A) + φ·σ/(1.05·E_cm) + ε_cs)·h up the building; the slab differential from the load placed after each floor is cast, against the nearest stack, ≤ L/limit; inputs φ, ε_cs, limit and the QP combination |
| Diaphragms | EN 1998-1 4.4.2.5(2) overstrength γ_d (1.3 shear, 1.1 chords) on the floor forces F_i of the governing seismic case; deep beam between the lateral systems: M = F·L/8, chord T = M/(0.9·D) and A_s, edge shear v = F/(2·D) with a_s = v/f_yd and the strut check τ ≤ 0.5·ν·f_cd (EN 1992-1-1 6.2.2(6), 6.2.3(3)); slab thickness and f_ck read from the ETABS floor slabs |
| Seismic joint / pounding | EN 1998-1 4.4.2.7(2)-(3): required gap √(d_s,own² + d_s,adj²) at every level with d_s = q_d·d_e (4.3.4) from the ETABS max corner displacements (Story Max Over Avg Displacements, torsion included; else summed drifts), × 0.7 for equal floor levels; adjacent unit by its top displacement and height (0 = property line); joint widths provided checked |
| Strong column / weak beam | EN 1998-1 4.4.2.3(4) eq. 4.29 ΣM_Rc ≥ 1.3·ΣM_Rb: the beam/column capacity ratio and the joint shear ratio of every column from the ETABS concrete frame design (`/joints`, DesignConcrete.GetSummaryResultsJoint - run the design first); top storey exempt (4.4.2.3); profile per storey and the 12 largest ratios |
| Ductile walls (DCM) | EN 1998-1 5.4.2.4(5), (7): wall pier forces from ETABS (`/piers`, PierForce + PierLabel.GetSectionProperties) enveloped over the seismic / ULS combinations; moment envelope with tension shift a1 = 0.4·l_w (EN 1992-1-1 9.2.1.3(2)) and linear from the base for slender walls (Fig. 5.3), shear V_Ed = ε·V'_Ed (ε = 1.5 DCM), critical height h_cr (5.4.3.4.2(1)), ν_d ≤ 0.4 (5.4.3.4.1(2)) |
| Steel frame design (ETABS) | EN 1993-1-1 6.2 / 6.3.3: the governing ratio (P-M-M interaction or shear), location and combination of every steel member from the ETABS steel frame design (`/steel`, DesignSteel.GetSummaryResults - run the design first), largest ratio per storey and member type, design errors listed, cross-check with the ETABS-linked steel elements of the app |
| Base shear (RS vs lateral force) | EN 1998-1 4.3.3.2: modal T1 per direction vs C_t·H^¾ (C_t 0.085 / 0.075 / 0.050), lateral force method allowed when T1 ≤ min(4T_C, 2 s), F_b = S_d(T1)·m·λ (λ = 0.85 for T1 ≤ 2T_C, > 2 storeys) with the EC8 spectrum of Loads & combinations, compared with the response-spectrum base shear (V_RS/F_b ≥ 0.8 as a plausibility check) |
| Stiffness modifiers | frame (I22, I33, As2, As3, A, J) and shell (f, m) modifiers, mass and weight, with object overrides, read from ETABS and checked against the purpose of the model: seismic ULS / drift / θ (EN 1998-1 4.3.1(7): 0.5 of uncracked, or a cracked analysis 0.35–0.7), wind SLS (≈ 1.4 × cracked), P-Δ and α_cr (EN 1992-1-1 5.8.7.2 nominal stiffness, ≈ 0.15–0.5); steel 1.0; mass, weight and axial area 1.0 |
| P-Δ design of the linked members | each ETABS-linked beam, column, wall, steel member and footing gets the factor of its storey: seismic governing case × 1/(1−θ), lateral (wind / notional) case × 1/(1−1/α_cr), gravity-only case none. **Apply** multiplies its M and V; the ETABS values are kept, re-reads keep the factor, **Remove** restores them. Gravity combinations with imperfection (notional) loads count as sway cases (EN 1993-1-1 5.2.2(5)B: H_Ed includes the equivalent imperfection forces) - when the notional cases' member forces are read from ETABS only their share is amplified, M_d = M + (1/(1−1/α_cr) − 1)·Σ|f|·F(N) (exact); otherwise the whole M and V gets 1/(1−1/α_cr) (conservative); an option leaves them unamplified |

**Load demo building** shows every check on a sample ETABS building (10 storeys, 24 × 18 m) without ETABS or the bridge, and designs a few demo ETABS-linked members for the P-Δ member design. Each combination gets a role (Seismic, Wind SLS, ULS, not used); inputs and the last ETABS read are kept with the project. Planned checks: `tools/etabs_bridge/BUILDING_CHECKS_ROADMAP.md`.

### ETABS live link (CSI API)

A web page cannot call the ETABS API (a Windows COM interface) itself, so a small local bridge does it:

1. On the Windows computer with ETABS v18 or later, install Python 3 (tick *Add to PATH*).
2. Copy `tools/etabs_bridge/etabs_bridge.py` and `start_etabs_link.bat` into one folder.
3. Open the model in ETABS and run the analysis. Double-click `start_etabs_link.bat`: it installs `comtypes` the first time, attaches to the running ETABS and serves the results on `http://127.0.0.1:5480`. Leave the window open.
4. In the app: **Design with ETABS link → Link to ETABS → Connect to ETABS…** (Chrome or Edge). The popup lists every open ETABS window (model file and process); pick one and click **Connect**.
5. **Select members in ETABS** (beams, columns, braces, wall piers, support joints). The *Selected in ETABS* box follows the ETABS selection live. **Design N selected member(s)** reads their forces for the ticked combinations, envelopes them and creates or updates their design elements in one step. *Read whole model* and *Sync linked elements* work on the whole model.

The bridge listens only on this computer, answers only the CAMBO STRUCT page (add other origins with `--allow-origin`), and never edits the model: it switches the present units to kN, m while reading and then restores them. If ETABS is not found, run `RegisterETABS.exe` from the ETABS folder as administrator. `python etabs_bridge.py --mock` serves two demo ETABS windows with a demo selection, without ETABS.
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
js/calc/*.js          quick design modules (earlier version, still open old elements)
js/mcad/              Mathcad engine, compute, MathML renderer, worker, catalog
js/mcui.js            worksheet elements: inputs, worksheet view, detailing, records
js/analysis/          design analysis tools (drawing -> worksheet inputs): core.js, pilecap*.js
js/config.js          Google client ID and Drive location (public, no secrets)
js/auth.js            Demo / Admin accounts, sign-in page, Google sign-in
js/sync.js            autosave + cloud sync (Google Drive / Claude account)
sheets/               converted worksheets (generated by tools/mcdx2json.py)
tools/                converters and tests
```

To add an element type, register `EC.modules.<type> = { name, cat, prefix, code, mathcad, groups, schedCols, sched, calc }` in a file under `js/calc/` (see `beam.js`), then add the script to `index.html`. Its group comes from `cat`.
