/* Generated from math.Claude/README.md - Mathcad calculation library index */
window.EC = window.EC || {};
EC.library = [
 {
  "folder": "Agent_Loop",
  "group": "Other",
  "type": "Tool (not a calculation)",
  "files": [],
  "desc": "local web UI + engineering loop: agy runs Research, Build, Fix with README.md/CLAUDE.md as source of truth; Test opens the .mcdx in Mathcad via _tools\\calc_test.ps1; loops until regions with errors: 0; mode \"New topic\" = research a new topic, then build a new calculation (folder in the chosen Eurocode group, build script, worksheet, docs) and validate it; review gates, per-step logs, run history in runs\\; binds ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design",
  "group": "EC2_Concrete",
  "type": "ETABS API + hand input",
  "files": [
   "Pilecap_EC2-2023_ETABS.mcdx",
   "Pilecap_EC2-2023_HandInput.mcdx"
  ],
  "desc": "hand input: general N-pile cap, 1-13 standard layouts or custom coordinates from a schedule table with a pile-number combo box and a row selector i_cap; reactions uniform (γ_F × allowable / analysis) or from N, M, H on a rigid cap; bending at 0.35 c + STM ties, struts / CCT / CCC nodes, one-way shear with links cotβ_incl Fig. 8.11 a and inclined links α_w Fig. 8.11 b, column punching (optional 'piles within 2 d_v ..."
 },
 {
  "folder": "EC2_Concrete\\Beam_Design",
  "group": "EC2_Concrete",
  "type": "Standalone + JSON UI",
  "files": [
   "Beam_EC2-2023_Standalone.mcdx",
   "Beam_EC2-2023.mcdx",
   "Beam_2004_EC2-2023_Standalone.mcdx"
  ],
  "desc": "combo boxes for concrete class, bar diameters, section type, span type and bond; typed actions; units in functions / programs / plots - updated 2026-10-06), Beam_EC2-2023.mcdx, Beam_Input.json, Beam_Input_UI.ps1, Run_Beam_UI.bat, build_beam_mcdx.py --standalone <file>, DOCUMENTATION.md; older Beam_2004_EC2-2023_Standalone.mcdx (actions from g_k, q_k, not rebuilt"
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\Foundation",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileFoundation_EC-2G.mcdx"
  ],
  "desc": "pile group + cap"
 },
 {
  "folder": "EC2_Concrete\\ShearWall_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "ShearWall_EC2-2023_Standalone.mcdx"
  ],
  "desc": "in-plane N-M, out-of-plane buckling, shear, joint sliding, wall detailing; wall section + end zone drawing, in-plane and strip N-M interaction diagrams, shear diagram, summary augment(Item, U, Status) + bar detailing"
 },
 {
  "folder": "EC2_Concrete\\PTSlab_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "PTSlab_EC2-2023_Standalone.mcdx"
  ],
  "desc": "flat plate / one-way, bonded / unbonded"
 },
 {
  "folder": "EC2_Concrete\\Slab_Design",
  "group": "EC2_Concrete",
  "type": "Standalone (hand calc + FEM input)",
  "files": [
   "Slab_OneWay_EC2-2023_Standalone.mcdx",
   "Slab_TwoWay_EC2-2023_Standalone.mcdx",
   "Slab_Flat_EC2-2023_Standalone.mcdx"
  ],
  "desc": "coefficient method vs SAFE/ETABS moments, Wood-Armer, punching"
 },
 {
  "folder": "EC2_Concrete\\Column_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Column_EC2-2023_Standalone.mcdx"
  ],
  "desc": "rectangular / circular, fibre N-M_y-M_z, slenderness + nominal curvature, biaxial simplified + fibre contour, shear, detailing, 3D interaction surface; updated 2026-10-06: combo boxes with units (shape, class, ϕ_l, ϕ_w), units in the fibre program / contours, section drawing, plot titles / axis titles / legends, rebuild keeps inputs, plots and 3D view; updated 2026-10-08: end-zone link spacing input s_w2, 10.1 ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\MultiColumn",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "PileCap_Multi_EC2-2023_Standalone.mcdx"
  ],
  "desc": "pile cap under several columns and / or walls, loads typed node by node in an input table (x, y, type column / wall combo, footprint, N, M_x, M_y, H_x, H_y; rows kept on rebuild, old vectors migrated), piles typed by coordinates in an input table - no pile layouts or pile number; updated 2026-10-09: section 9 links as in the HandInput worksheet - separate grids for one-way shear / column punching / pile punching ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\FEM",
  "group": "EC2_Concrete",
  "type": "ETABS / SAFE API (shell forces)",
  "files": [
   "PileCap_FEM_EC2-2023_ETABS.mcdx"
  ],
  "desc": "demo data: PileCapFEM_ETABS_Import.ps1 -Demo) (pile cap from ETABS shells, any number of columns and walls on the cap: sandwich / Wood-Armer bending + membrane, one-way shear with a_v, punching at every column / pile, crack width; data set Mode 1 nodal / 2 averaged over b_av / 3 design strips, averaging uses the mesh size so auto-meshed caps work; shear links: one-way with cotβ_incl for loads near the piles (Fig. ..."
 },
 {
  "folder": "EC7_Geotechnical\\RetainingWall_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "RetainingWall_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cantilever wall: EN 1997 DC1/DC2/DC3 overturning, sliding, bearing + eccentricity, SLS ground pressure; EC2 stem/toe/heel bending, shear, crack width, detailing"
 },
 {
  "folder": "EC7_Geotechnical\\SeismicWall_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "SeismicWall_EC8-EC7_Standalone.mcdx"
  ],
  "desc": "cantilever RC wall in the seismic design situation to EN 1998-5 7.3.2 / Annex E with EN 1997-3:2025 / EN 1990:2023: k_h = (a_g/g) S / r, k_v = ± ratio k_h, Mononobe-Okabe K_AE on the virtual back through the heel (static part at H/3, dynamic increment at z_d H), ψ_2 q, wall + soil inertia; static MFA DC3 + seismic k_v down / up: sliding, bearing (B', inclination), e ≤ B/3; stem bending persistent DC1 vs seismic, ..."
 },
 {
  "folder": "EC7_Geotechnical\\Liquefaction_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Liquefaction_EC8-EC7_Standalone.mcdx"
  ],
  "desc": "liquefaction susceptibility from SPT to EN 1998-5 4.1.4 / Annex B: SPT log as vectors (z, N, FC, γ, susceptible flag), water table, α S screening, N1(60) with ER, short rods, C_N 0.5 ... 2, fines correction N1(60)cs (Youd 2001), τ_e = 0.65 α S σ_v0, CRR_7.5 × C_M (Table B.1), FS vs λ = 1.25; LPI (Iwasaki) + risk class, reconsolidation settlement (Idriss & Boulanger 2008); N1, CSR / CRR, FS vs depth plots, soil ..."
 },
 {
  "folder": "EC7_Geotechnical\\SPT_Correlation_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "SPT_Correlation_EC7-2024_Standalone.mcdx"
  ],
  "desc": "soil parameters from SPT to EN 1997-2 / EN ISO 22476-3, characteristic values to EN 1997-1:2024 4.3, units in all functions, tables and plots: SPT log as vectors (z, N, type, layer, FC, PI, γ), N60 (ER, C_B, C_S, rod length C_R), (N1)60 (C_N ≤ 1.7); coarse: D_r, φ' Hatanaka & Uchida / Kulhawy & Mayne / Wolff (mean), E' Kulhawy & Mayne; fine: c_u Stroud f_1(PI), E_u = β c_u, E' from E_oed = f_2 N60, φ' from PI, ..."
 },
 {
  "folder": "EC7_Geotechnical\\SlopeStability_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Slope_EC7-2024_Standalone.mcdx"
  ],
  "desc": "embankment on layered soft ground, soil typed layer by layer as vectors - thickness, γ, γ_sat, c', φ', c_u,top, k_cu, type D cohesive/granular, any number of layers: EN 1997-3 Cl. 4 overall stability, Bishop simplified circular slip, grid search of centres + tangent levels, short term undrained c_u(z) in cohesive layers / long term drained with hydrostatic u, MFA DC3 + M2 × k_M, F_d and F_k, trial circle, ..."
 },
 {
  "folder": "EC7_Geotechnical\\Footing_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Footing_EC7_Standalone.mcdx"
  ],
  "desc": "pad footing on layered ground, eccentric + inclined load: EN 1997 bearing drained/undrained + sliding for DA1-1, DA1-2, DA2, DA3 and EC7-2024 MFA, kern check, settlement 2:1, section plot"
 },
 {
  "folder": "EC7_Geotechnical\\Settlement_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Settlement_EC7_Standalone.mcdx"
  ],
  "desc": "layered ground, Boussinesq / 2:1, immediate + e-log primary consolidation + secondary, Terzaghi time per layer, settlement-time table + plot, SLS limits"
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\Axial",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileAxial_EC7_Standalone.mcdx"
  ],
  "desc": "single pile, European methods only: pile type / section / parameter method as combo boxes, ground as an input table (type / grading combos), ground model method of EN 1997-3:2025 - α c_u, β σ'_v, N_c c_u, N_q σ'_vb - with typed c_u / φ' or parameters from SPT by EN 1997-2 Annex F ((N1)60, D_r, φ' Table F.2, c_u = f_1 N60); verification EN 1997-3:2025 DC1 / DC4 (γ_Rd), EN 1997-1:2004 DA1-1 / DA1-2 / DA2 / DA3 for ..."
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\Driven",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileDriven_EC7-2024_Standalone.mcdx"
  ],
  "desc": "driven precast RC pile 300 x 300 mm from SPT blow counts N: SPT log as an input table, N60, Meyerhof static capacity (sand / clay, toe zone average) with EN 1997-3:2025 DC1 / DC4 and pile length needed; dynamic capacity by Hiley, Danish, modified ENR and Janbu from the final set, required set (mm/blow, blows/250 mm), PDA / CAPWAP with ξ_5 / ξ_6; pile structure: N_Rd, reinforcement ratio / spacing / links, driving ..."
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\Lateral",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileLateral_EC7-2024_Standalone.mcdx"
  ],
  "desc": "single bored pile under horizontal load to EN 1997-3:2025 Cl. 6: Broms ultimate transverse resistance, cohesive c_u / cohesionless φ', free head with load height e or fixed head, short / intermediate / long mechanisms with M_y = M_Rd; case 1 RFA (DC1, γ_R;tr) and case 2 MFA (DC3, M2 × k_M); circular RC section M_Rd EN 1992-1-1:2023 (stress block, N = 0); beam on Winkler springs by finite differences (k_h D = 67 ..."
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\GroupSettlement",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileGroupSettlement_EC7-2024_Standalone.mcdx"
  ],
  "desc": "rectangular pile group under a rigid cap in layered ground (vectors h, E') to EN 1997-3:2025 Cl. 6: single pile settlement Randolph & Wroth + group ratio R_s = n^ω, equivalent raft (Tomlinson, k_r L, 1:4 / 2:1, layered E_oed, rigidity factor) + pile shortening, governing settlement, angular distortion to the neighbour, group and per-pile springs for ETABS / SAFE; ULS group compression: single piles vs block ..."
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\Downdrag",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileDowndrag_EC7-2024_Standalone.mcdx"
  ],
  "desc": "negative skin friction on a single bored pile to EN 1997-3:2025 Cl. 6: layered ground (vectors h, γ, γ_sat, β) with water table, β-method shaft friction, toe N_t σ_v, ground settlement profile (s_g, z_t, z_c from Settlement_Design); unified neutral plane (Fellenius) from force equilibrium, limited to the base of the settling zone (settlement compatibility), drag force G_neg; GEO RFA DC1 with G_neg as permanent ..."
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\LoadTest",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileLoadTest_EC7-2024_Standalone.mcdx"
  ],
  "desc": "static pile load test to EN 1997-3:2025 Cl. 6 / EN ISO 22477-1/-2: planning (P_max, maintained-load stages, kentledge or reaction piles + beam W_pl, spacing); compression readings as vectors: 10 % D, Davisson, Chin-Kondner, Decourt, SLS settlement at the working load; tension readings: load at δ_lim, Chin; R_k from n tests with ξ_1 / ξ_2 (+ stiff structure), R_d, F_c;d and F_t;d checks; load-settlement, Chin, ..."
 },
 {
  "folder": "EC7_Geotechnical\\Pile_Design\\SoilSprings",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "PileSoilSprings_EC7-2024_Standalone.mcdx"
  ],
  "desc": "soil springs at the nodes of a pile frame, mesh Δz (default 1 m), for ETABS / SAFE, all functions and the node table with units: layered ground as an input table (type combo, c_u, φ', E_s, n_h, α, β), lateral method combo, plots with titles / axis titles / legends / water-table and toe markers, intermediate programs in collapsed areas (updated 2026-10-07), lateral K_h = f_m k_h D Δz_trib (Vesic from E_s / ..."
 },
 {
  "folder": "EC7_Geotechnical\\SheetPile_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "SheetPile_EC7_Standalone.mcdx"
  ],
  "desc": "cantilever or anchored sheet pile, Coulomb K_ah/K_ph, water both sides, Δa, required embedment, anchor force, M_max, section, heave, 5 design cases, pressure + moment plots"
 },
 {
  "folder": "EC7_Geotechnical\\Uplift_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Uplift_EC7-2024_Standalone.mcdx"
  ],
  "desc": "basement buoyancy to EN 1997-1:2024 / EN 1997-3:2025 / EN 1990:2023: design water level z_w;rep - Δh_w, UPL for the construction and final stage, optional wall friction M2 × k_M, tension piles RFA γ_s;t γ_Rd + buoyant weight, required number of piles, soil block of the group (EAU), pile tension steel + SLS stress EN 1992-1-1:2023; HYD heave in a cut-off wall (Terzaghi prism, linear head loss or κ_h); base heave ..."
 },
 {
  "folder": "EC7_Geotechnical\\Raft_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Raft_EC7-2024_Standalone.mcdx"
  ],
  "desc": "rectangular raft under a regular column grid to EN 1997-1:2024 / EN 1997-3:2025: bearing (effective area B'×L' for the wind moment, drained c'-φ' on V' with buoyancy, undrained c_u) and sliding for case 1 RFA DC1 + γ_Rv / γ_Rh and case 2 MFA DC3 + M2 × k_M; SLS Steinbrenner settlement centre / corner on a layer H_c, angular distortion, subgrade modulus k_s = q_n / s_m; x and y interior strips on Winkler springs ..."
 },
 {
  "folder": "EC7_Geotechnical\\Anchor_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Anchor_EC7-2024_Standalone.mcdx"
  ],
  "desc": "grouted strand anchor of a single-anchored wall to EN 1997-3:2025 Cl. 8 / EN ISO 22477-5 / EN 1537: E_ULS;d and E_SLS;k from the wall analysis (SheetPile_Design), free length beyond the active plane + margin, overburden, spacing; estimated grout-ground resistance π D_s L_fixed q_s / (γ_Ra γ_Rd), required fixed length, suitability test load; tendon resistance, tendon-grout bond; proof load, lock-off, apparent free ..."
 },
 {
  "folder": "EC7_Geotechnical\\GravityWall_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "GravityWall_EC7-2024_Standalone.mcdx"
  ],
  "desc": "gabion / mass gravity wall to EN 1997-3:2025 / EN 1990:2023: courses typed as vectors h, b from the base, stepped front (back flush) or stepped back (soil on the steps, virtual back δ = β), Coulomb K_a with wall friction, sloping backfill, surcharge; overturning EQU, base sliding, bearing (strip, B' = B - 2e, inclination, drained / undrained) and e ≤ B/3 for case 1 RFA DC1 and case 2 MFA DC3, SLS kern + toe / ..."
 },
 {
  "folder": "EC7_Geotechnical\\GroundImprovement_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "StoneColumns_EC7-2024_Standalone.mcdx"
  ],
  "desc": "stone columns / vibro-replacement under a wide load to EN 1997-3:2025 Cl. 11: triangular / square grid unit cell, Priebe n_0 (μ_s = 1/3), column compressibility D_c/D_s -> n_1, limit 1 + a(D_c/D_s - 1), settlement untreated / treated, load sharing p_c / p_s; column bulging (Hughes & Withers) for case 1 RFA DC1 and case 2 MFA DC3; radial consolidation to the columns (Hansbo with smear), t_req, U(t_av), residual ..."
 },
 {
  "folder": "EC7_Geotechnical\\Embankment_Design",
  "group": "EC7_Geotechnical",
  "type": "Standalone",
  "files": [
   "Embankment_EC7-2024_Standalone.mcdx"
  ],
  "desc": "staged embankment on soft clay with PVD to EN 1997-3:2025 / EN 1997-1:2024: lifts typed as vectors (thickness, waiting time), Hansbo radial (smear) + Terzaghi vertical consolidation per lift, σ' and c_u gain c_u0 + α(σ' - σ'_p) at mid-depth; stage stability as undrained bearing of the finite layer (Mandel & Salençon N_c, MFA DC3, γ_cu × k_M), stage table; primary settlement CR / RR in sublayers, settlement-time ..."
 },
 {
  "folder": "EC2_Concrete\\SpiralStair_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "SpiralStair_EC2-2023_Standalone.mcdx"
  ],
  "desc": "free-standing RC spiral & helical staircase waist slab: 3D FEM section cut actions M_t, T, N, V_z, V_r, M_r from ETABS; ULS torsion-shear strut interaction, closed links with 135° hooks, longitudinal N-M-T flexure, curved bar radial bursting thrust q_burst, SLS concrete & steel stress limits, crack width w_k under quasi-permanent load; cross-section & plan helix plot; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\SinglePile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "SinglePileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on one pile, column and pile on one axis: pile load + head moment, strut-and-tie in x-z / y-z with tolerance + moment eccentricity and minimum tie force for tie beams, strut and CCC / CCT node checks, direct shear and column punching, tie steel / spacing / side bars, anchorage of ties and column bars, tie stress and crack width; plan + STM plot, summary Item / U / Status; updated 2026-10-09: combo boxes with ..."
 },
 {
  "folder": "Corbel_Design",
  "group": "Other",
  "type": "Standalone",
  "files": [
   "Corbel_EC2-2023_Standalone.mcdx"
  ],
  "desc": "RC corbel / bracket to EN 1992-1-1:2023: strut-and-tie method STM, nodal zones CCT / CCC, concrete strut, primary tie, closed horizontal links, outer welded/loop anchorage and column anchorage, SLS tie stress and crack control; elevation + STM diagram plot, summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\DeepBeam_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "DeepBeam_EC2-2023_Standalone.mcdx"
  ],
  "desc": "simply supported deep / transfer beam l/h < 3 by strut-and-tie 8.5: column load at any position + UDL, top CCC node depth and lever arm z (closed form, z <= 0.6 L), CCC / CCT node and bearing checks, cracked strut factor ν(θ, ε_1), bottom tie, bottle-strut splitting vs web mesh, minimum deep beam mesh, tie anchorage Eq. 11.3, SLS tie stress + crack width; elevation + STM plot, summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Cover_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Cover_EC2-2023_Standalone.mcdx"
  ],
  "desc": "concrete cover, EN 1992-1-1:2023 Section 6: exposure class / design life / f_ck / slab / quality control -> structural class S, editable c_min,dur table, c_min,b (bundles, d_g), c_min = max(...), Δc_dev combo, links vs main bars, fire from axis distance a, ground contact 40 / 75 mm, c_nom rounded to 5 mm; table values are the 2004 structural-class method as editable inputs - verify with the 2023 code / NA; ..."
 },
 {
  "folder": "EC2_Concrete\\Anchorage_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Anchorage_EC2-2023_Standalone.mcdx"
  ],
  "desc": "anchorage and lap lengths to Section 11: Eq. 11.3 with every factor for one design bar, c_d, bond condition, tension / compression, straight or bent end, A_s,req/A_s,prov stress, lap l_0, cover / spacing for bond, Table 11.1 mandrel + crushing check; table + plot of l_bd, l_0 for a set of diameters; anchorage / lap sketch; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Interface_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Interface_EC2-2023_Standalone.mcdx"
  ],
  "desc": "shear between concrete cast at different times 8.2.6, precast + topping / construction joints: τ_Edi = β_new V_Ed/(z b_i), surface class very smooth ... very rough, rigid and ductile resistance (adhesion, friction, clamping, dowel), normal stress incl. tension, link angle α, upper limit, required links, τ along the span plot, section sketch, summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Deflection_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Deflection_EC2-2023_Standalone.mcdx"
  ],
  "desc": "SLS deflection by calculation 9.3, simply supported beam / slab strip with UDL: uncracked + cracked transformed sections as functions of α, M_cr, ζ = 1 - β(M_cr/M)², creep by E_c,eff, shrinkage curvature, curvature integrated along the span (virtual work, n_int segments), δ_LT <= L/250 and δ_inc <= L/500, bounds δ_I / δ_II, curvature + ζ plot, section graphic, summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\PadFooting_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "PadFooting_EC2-2023_Standalone.mcdx"
  ],
  "desc": "isolated RC pad footing, structural: linear ground pressure N + biaxial M, kern check, bending at the column faces both ways, one-way shear at d (τ_Rd,c with d_dg), punching b_0,5 with soil relief, β_e, k_pb, a_pd, anchorage Eq. 11.3, crack width; plan with control perimeter + section; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\CreepShrinkage_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "CreepShrinkage_EC2-2023_Standalone.mcdx"
  ],
  "desc": "Annex B creep and shrinkage: temperature + cement-class adjusted age, basic + drying creep, non-linear creep for σ_c > 0.4 f_cm(t_0), autogenous + drying shrinkage incl. swelling, E_c,eff / E_c,adj, φ and ε_cs curves on log time, values for Deflection_Design; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Torsion_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Torsion_EC2-2023_Standalone.mcdx"
  ],
  "desc": "rectangular beam under T + V + M, 8.3: thin-walled section t_ef / A_k / u_k, cracking check vs τ_Rd,c, strut interaction T/T_Rd,max + V/V_Rd,max, closed links per leg (shear + torsion), minimum links and spacing, longitudinal torsion steel per face + bending steel, side bar spacing; section drawing; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\CrackControl_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "CrackControl_EC2-2023_Standalone.mcdx"
  ],
  "desc": "crack control 9.2 for bending or pure tension: A_s,min with k_c / k, cracked section with creep α_L, h_c,eff, ρ_p,eff, k_fl, s_r,m, Δε, k_1/r, w_k vs w_lim, largest bar diameter for w_lim, stress limits 0.8 f_yk / 0.6 f_ck / 0.45 f_ck; w_k vs ϕ and vs σ_s curves, section graphic; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Staircase_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Staircase_EC2-2023_Standalone.mcdx"
  ],
  "desc": "straight waist-slab flight with bottom + top landings spanning longitudinally: loads on plan, three-segment UDL M(x) / V(x), bending, shear τ_Rd,c, deflection by curvature integration along the inclined member with creep + shrinkage (L/250, optional L/500), detailing; elevation with steps, soffit kinks and bars, BMD / SFD; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\FrameCorner_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "FrameCorner_EC2-2023_Standalone.mcdx"
  ],
  "desc": "frame corner / knee joint beam to end column, closing or opening moment: face forces from the stress block, STM diagonal strut / tie, CCC node stress, mandrel against crushing, depth-ratio rule (closing), diagonal tension with inclined bars + joint links and ρ <= 2 % rule (opening), anchorage Eq. 11.3; corner drawing; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\RestraintCracking_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "RestraintCracking_EC2-2023_Standalone.mcdx"
  ],
  "desc": "early-age + long-term restraint cracking: edge restraint (wall on base, R_j and R(y) by L/H) or end restraint, T_1 / T_2, Annex B autogenous + drying shrinkage, K_1, ε_ctu at early age, crack-inducing strain, A_s,min with early-age f_ct, s_r,m and w_k; R(y) plot, w_k vs spacing, wall section sketch; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\CombinedFooting_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "CombinedFooting_EC2-2023_Standalone.mcdx"
  ],
  "desc": "two-column rectangular combined footing: linear pressure with column moments, M(x) / V(x) closed form, bottom (faces) + top (hogging) longitudinal steel, transverse bands under each column, one-way shear at d, punching per column with soil relief and edge-perimeter flag, crack width of the top steel; M / V diagram and plan; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Fire_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Fire_EC2-2023_Standalone.mcdx"
  ],
  "desc": "fire resistance R30 ... R240 by tabulated data, EN 1992-1-2: beams SS / continuous with (b, a) interpolation, corner bars, web; slabs one-way / two-way / flat; columns Method A Eq. 5.7 with validity; table values of EN 1992-1-2:2004 as editable matrices - verify against the 2023 edition; a-b curve, R-μ_fi curve, column section; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\TankWall_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "TankWall_EC2-2023_Standalone.mcdx"
  ],
  "desc": "liquid-retaining wall strip, cantilever or pinned top, hydrostatic M(y), ULS bending both faces + base shear, SLS crack widths with EN 1992-3 tightness classes 0-3 (w_k1 by h_D/h, x_min for classes 2/3); M(y) / pressure diagram, wall section; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\TankPanel_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "TankPanel_EC2-2023_Standalone.mcdx"
  ],
  "desc": "two-way tank wall panel under hydrostatic pressure: moment coefficients from a finite-difference plate solution (free / pinned top, fixed / pinned sides, a/b 0.5-3, validated vs Timoshenko and strip limits, regenerated at build time with numpy), interpolated in Mathcad; ULS + tightness crack width at base, corners, vertical and horizontal span; coefficient curves, panel elevation; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\BeamColumnJoint_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "BCJoint_EC2-2023_Standalone.mcdx"
  ],
  "desc": "exterior beam-column joint, non-seismic, hogging beam: top-bar tension, joint shear V_jh = T - V_col, compression field ν_j f_cd sinθ cosθ, joint cracking and horizontal joint links, L-bar mandrel + anchorage, bottom bars by the shift rule F_E = V cotθ/2; elevation with STM; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\RibbedSlab_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "RibbedSlab_EC2-2023_Standalone.mcdx"
  ],
  "desc": "one-way ribbed slab: ribbed-slab limits, self weight, coefficient moments (SS / end / interior span), rib T-section b_eff, sagging (flange / web NA), hogging, rib shear with optional links, flange-web shear with topping mesh, deflection with T-section ζ interpolation, creep + shrinkage; functions, programs and plots with units; M(x) diagram, two-rib section; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\Punching_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Punching_EC2-2023_Standalone.mcdx"
  ],
  "desc": "punching 8.4: internal / edge / corner column, rectangular or circular, b_0,5 with edge distances and openings, β_e simplified or refined, τ_Rd,c with k_pb and d_dg, links / studs τ_Rd,cs (η_c, η_s), crushing k_sys, outer perimeter and rows required, detailing s_0 / s_r / s_t, integrity bars; functions and plan with units; summary Item / U / Status"
 },
 {
  "folder": "EC2_Concrete\\DappedEnd_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "DappedEnd_EC2-2023_Standalone.mcdx"
  ],
  "desc": "dapped-end / half-joint precast beam end, EN 1992-1-1:2023 8.5 strut-and-tie: nib tie with restraint force H_Ed, hanger stirrups, optional inclined bars (share k_d), bearing node, nib strut, top node, web crushing, main-bar and nib-tie anchorage Eq. 11.3 (U-bar / U-loop / anchor plate), nib U-bars and links, SLS steel stress at the re-entrant corner; combo boxes with units, STM diagram, T_n vs bearing position ..."
 },
 {
  "folder": "EC2_Concrete\\WebOpening_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "WebOpening_EC2-2023_Standalone.mcdx"
  ],
  "desc": "RC beam with a large rectangular web opening, Vierendeel method: actions from a UDL span or typed, chord couple N = M/z_o (tension chord at its steel centroid), shear share by area / top chord, local chord moments V l_o/2; chord N-M by strain compatibility with root (both bending directions, N-M interaction plots), chord shear 8.2 with links, full-depth stirrups beside the opening, trimming bar anchorage Eq. ..."
 },
 {
  "folder": "EC2_Concrete\\Fatigue_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "Fatigue_EC2-2023_Standalone.mcdx"
  ],
  "desc": "fatigue of an RC beam, EN 1992-1-1:2023 Section 10: static basic combination + cyclic load spectrum table (ΔM, ΔV, n), cracked elastic section with α_f; main bars S-N curve combo (straight / welded / couplers) with Palmgren-Miner D, simplified Δσ <= 70 MPa (info); links with tan θ_fat and bend factor ξ; members without links V_max/V_Rd,c limit; concrete f_cd,fat and 0.5 + 0.45 σ_min/f limit; strain diagram, ..."
 },
 {
  "folder": "EC2_Concrete\\SlenderWall_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "SlenderWall_EC2-2023_Standalone.mcdx"
  ],
  "desc": "load-bearing RC wall out of plane per metre: effective height l_0 = β k_end l_w with β for 2 / 3 / 4-sided panels (combo), slab-bearing eccentricity, lateral pressure, imperfection l_0/400, minimum eccentricity, λ_lim, nominal-curvature second order (K_r, K_φ), N-M per metre by strain compatibility with root, wall detailing (ρ_v 0.002 ... 0.04, horizontal min, spacing, links), plain-concrete alternative Φ; ..."
 },
 {
  "folder": "EC2_Concrete\\EffectiveLength_Design",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "EffectiveLength_EC2-2023_Standalone.mcdx"
  ],
  "desc": "ETABS API -> Mathcad assigned inputs through automation SetRealValue, no Excel; -Demo without ETABS), DOCUMENTATION.md (effective length factor of an RC column in a frame: relative flexibilities k_1, k_2 from the beams framing in (cracked-stiffness factor, far-end combo) or fixed / pinned ends, braced and unbraced l_0 = β l, isolated-member comparison, λ = l_0/i and λ_lim = 20 A B C/√n; β vs k_1 plots (braced / ..."
 },
 {
  "folder": "EC1_Actions\\Wind_Building_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Wind_Building_EC1-2023_Standalone.mcdx"
  ],
  "desc": "rectangular building wind actions to EN 1991-1-4:2024 / prEN 1991-1-4:2023: basic velocity v_b, q_b, terrain categories 0-IV, continuous roughness c_r(z), turbulence I_v(z), peak velocity pressure q_p(z) profile plot; Annex B wall zones A-E and roof zones F-I, along-wind drag c_f, internal pressure c_pi, cladding net pressures; height strip division, global base shear V_bw, base overturning moment M_bw, resultant ..."
 },
 {
  "folder": "EC1_Actions\\Wind_Canopy_Signboard_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Wind_Canopy_Signboard_EC1-2023_Standalone.mcdx"
  ],
  "desc": "EN 1991-1-4:2024 free-standing monopitch canopy: Table 7.6 c_f + c_p,net zones A/B/C interpolated in α and blockage φ, resultant at d/4, friction, column uplift + holding-down check; free-standing signboard Cl. 7.4.3: c_f = 1.8, z_e, ±0.25 b eccentricity + torsion, post base moment, pad footing EQU overturning + sliding; q_p profile, canopy section + signboard elevation sketches, summary Item / U / Status"
 },
 {
  "folder": "EC1_Actions\\Thermal_Actions_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Thermal_Actions_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-1-5:2023 roof slab of a building: shade air T_max / T_min, T_0, inner Table 5.1 / outer Table 5.2 temperatures with solar T_3-T_5, Annex D resistances -> slab top / soffit temperatures, ΔT_N,exp / ΔT_N,con / ΔT_M; restraint stress and force with E_eff and k_res, gradient moment vs M_cr, crack-control A_s,min, movement joint width with sealant MAF, end column sway moment; temperature profile, joint width ..."
 },
 {
  "folder": "EC1_Actions\\Imposed_Loads_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Imposed_Loads_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-1-1:2023 imposed loads on buildings: editable category table A-H q_k / Q_k / ψ, movable partitions q_part, area reduction α_A (≥ 0.6 for C, D) and storey reduction α_n, floor ULS / SLS loads, barrier line load, column load take-down table with and without α_n vs N_Rd; α plot + N_Ed plot, summary Item / U / Status"
 },
 {
  "folder": "EC1_Actions\\Vehicle_Impact_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Vehicle_Impact_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-1-7:2023 accidental vehicle impact on a column: editable Table 4.1 F_dx / F_dy incl. forklift 5W, impact height range + area, fixed-fixed / fixed-pinned column moments and shears scanned over the impact heights, accidental N_Ed = G + ψQ, Annex C dynamic v_r √(k m) comparison; EN 1991-1-1 Annex B car park barrier F = ½ m v² / (δ_c + δ_b); moment vs height plot + column sketch, summary Item / U / Status"
 },
 {
  "folder": "EC1_Actions\\Vortex_Shedding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Vortex_Shedding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "EN 1991-1-4:2024 circular steel chimney / pole: section + n_1, q_p(z), Reynolds c_f,0 Eq. 7.19, end effect ψ_λ, along-wind strip force and base moment; Annex E vortex shedding approach 1: v_crit, Scruton Sc, c_lat(Re, v_crit/v_m), iterated L_j / K_w, y_F,max, inertia base moment and shear, cycles N Eq. E.10 and EN 1993-1-9 fatigue stress range; deflected shape plot, summary Item / U / Status"
 },
 {
  "folder": "EC1_Actions\\WaterTank_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "WaterTank_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-4:2023 circular RC water tank: hydrostatic liquid pressure Eq. 7.1, wall as cylindrical shell (long-wall solution, βH check) with fixed / hinged / sliding base: ring tension N_θ(x), vertical moment M_x(x), base shear Q_0; hoop steel ULS, minimum steel, EN 1992-3 tightness class 1 crack width w_k vs w_k1, vertical base steel; N_θ and M_x height plots, summary Item / U / Status"
 },
 {
  "folder": "EC1_Actions\\Execution_Loads_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Execution_Loads_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-1-6:2023 actions during execution of RC slabs: fresh concrete + formwork, Table 4.2 working-area construction loads, deck design load and prop force vs SWL, reduced return period wind c_prob (duration classes) vs notional 1 % horizontal action on falsework bracing, back-propping load share to n_s young slabs with β_cc(t) early-age capacity, back-prop force; c_prob and strength-gain plots, summary Item / ..."
 },
 {
  "folder": "EC1_Actions\\Wind_Portal_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Wind_Portal_EC1-2023_Standalone.mcdx"
  ],
  "desc": "EN 1991-1-4:2024 duopitch portal frame building: q_p(h) at ridge height, wall zones A-E (Table 7.1), roof zones F-J θ = 0° (Table 7.4a, suction / pressure sets) and F-I θ = 90° (Table 7.4b) interpolated in α, c_pi +0.2 / -0.3, internal frame line loads, uplift, horizontal and downward resultants, holding-down tension and base shear per base, purlin / sheeting net pressures; frame + load sketch, summary Item / U / ..."
 },
 {
  "folder": "EC1_Actions\\TallBuilding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "TallBuilding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "tall rectangular building, EN 1991-1-4:2024: q_p(z) with tall-building reference heights z_e (Fig. 7.4), c_f = c_f,0 ψ_r ψ_λ from editable tables, detailed c_s c_d (Annex B procedure 1: n_1 = 46/h or typed, B², R², aerodynamic damping, k_p), equivalent static storey forces, storey shear and overturning moment, first-mode top deflection; along-wind top-floor acceleration for a T_R-year wind (c_prob) vs ISO 6897 ..."
 },
 {
  "folder": "EC1_Actions\\SelfWeight_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "SelfWeight_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-1-1:2023 Section 4 / Annex A self-weight: floor, roof and wall build-ups as input tables with a material combo cell (density kN/m³, 18 materials) and thickness, g_lay = Σ γ t and take-down as programs with units, service loads, wall line load with openings, wall type combo (fixed / movable, Cl. 6.3.1.2(8) partition allowance ≤ 3 kN/m), beam line load, column take-down of permanent loads, each compared ..."
 },
 {
  "folder": "EC1_Actions\\Wind_TallBuilding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Wind_TallBuilding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "EN 1991-1-4:2024 tall building dynamic along-wind response: q_p(z), c_f = c_f,0(d/b) ψ_λ, Annex B procedure 1 with L(z), S_L, B², R² (δ_s + aerodynamic δ_a), peak factor -> c_s c_d, c_s, c_d; Annex F n_1 = 46/h or typed, damping and mode-shape combos; storey table (program with units) z / F / V / M, base shear and overturning moment vs design assumption; peak acceleration at the top for a reduced return period ..."
 },
 {
  "folder": "EC1_Actions\\Wind_Drift_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Wind_Drift_EC1-2023_Standalone.mcdx"
  ],
  "desc": "tall building SLS under wind, EN 1991-1-4:2024: q_p(z) with c_prob for the drift return period, c_f = c_f,0 ψ_λ, Annex B c_s c_d; core as a cantilever with bending k_cr EI + shear GA, storey program SW(c) with units (floor forces, V, M, exact storey bending + shear deflection), Rayleigh n_1 of the model (or F.2 / typed, combo); top deflection h/k_top and inter-storey drift h_st/k_st [NDP], P-Δ stability index θ ..."
 },
 {
  "folder": "EC1_Actions\\Wind_AcrossTorsion_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Wind_AcrossTorsion_EC1-2023_Standalone.mcdx"
  ],
  "desc": "tall building across-wind and torsion, EN 1991-1-4:2024: Annex E vortex shedding (St(d/b), v_crit, Sc) and galloping (a_G, v_CG) screening vs 1.25 v_m; informative NBCC empirical across-wind peak acceleration a_y with c_prob for comfort vs limit; wind torsion from e = 0.1 b with a storey program with units (floor forces, storey torque, Bredt twist k_cr G J), base torque, corner deflection u_x + r φ vs h/k_top; ..."
 },
 {
  "folder": "EC1_Actions\\Thermal_TallBuilding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Thermal_TallBuilding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "prEN 1991-1-5:2023 tall building, exposed perimeter vs internal (air-conditioned) column: Table 5.1 / 5.2 temperatures with solar increment combo, Annex D mean column temperature (facade line / fully outside combo, cladding resistance), summer / winter ΔT; cumulative differential vertical movement with floor-beam restraint (program DM(ΔT) with units: beam shear 12 k_cr EI/L³ vs column EA, relaxation iteration), ..."
 },
 {
  "folder": "EC1_Actions\\Shortening_TallBuilding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Shortening_TallBuilding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "tall building column vs core: prEN 1991-1-1:2023 gravity take-down with α_n, ULS squash check; EN 1992-1-1 Annex B (2004 form) creep φ(t, t_0, h_0) and shrinkage ε_cs as functions with units; shortening per storey following the construction sequence (programs Seg / Sht with units: elastic, creep, shrinkage with reinforcement restraint, imposed ψ_2 q_k at occupation), shortening after casting per level, ..."
 },
 {
  "folder": "EC1_Actions\\Wind_Combinations_TallBuilding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "WindComb_TallBuilding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "tall building core base actions, EN 1991-1-4:2024 + EN 1990:2023: storey program Sto(c, d, b) with units per wind direction (c_f by d/b, c_s c_d per direction), base V, M and torsion from e = 0.1 b; wind case input table (±x, ±y, ±e, optional combined x + y rows) and combination factor input table (ULS 6.10 imposed / wind leading, G favourable, SLS characteristic / frequent); results table, ULS envelope with ..."
 },
 {
  "folder": "EC1_Actions\\Outrigger_TallBuilding_Design",
  "group": "EC1_Actions",
  "type": "Standalone",
  "files": [
   "Outrigger_TallBuilding_EC1-2023_Standalone.mcdx"
  ],
  "desc": "tall building core + one outrigger level under the EN 1991-1-4:2024 wind base moment (uniform w = 2 M_w / H²): rotation compatibility (Smith & Coull) with core, perimeter column axial and outrigger arm flexibility as functions with units, outrigger moment, column couple force, top deflection and core base moment with / without outrigger, scan for the best level; construction-stage force from differential ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\TwoPile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "TwoPileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on two piles, column centred: pile reactions from N, M_y, H_x and tolerance, strut-and-tie 8.5 in x-z (two struts, bottom tie in a 1.5 D_p band, 1-2 layers) and per pile in y-z, strut width at the pile node, CCC / CCT nodes, direct strut vs one-way shear with a_v and links, minimum links, side bars, tie anchorage Eq. 11.3 from the inner pile edge, column bar anchorage, tie stress and crack width; plan + ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\ThreePile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "ThreePileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on three piles in an equilateral triangle, column at the centroid: reactions from N, M_x, M_y, H and tolerance, strut-and-tie 8.5 with three struts and three side ties T = H_radial/√3 (three tie layers, band 1.5 D_p), strut width at the pile node, CCC / CCT nodes, direct strut vs one-way shear with a_v, minimum links, side bars, tie and column bar anchorage, tie stress and crack width; plan + radial elevation ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\FourPile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "FourPileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on four piles 2 x 2, column at the centre: reactions from N, M_x, M_y, H and tolerance, strut-and-tie 8.5 with four struts and four side ties (x ties lower layer, y ties above, band 1.5 D_p), strut width at the pile node, CCC / CCT nodes, direct struts vs one-way shear (V = 2 R_c) with a_v, minimum links, side bars, tie and column bar anchorage, tie stress and crack width; plan + elevation STM plot, summary ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\SixPile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "SixPileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on six piles, column at the centre, layout switch 1 = 2 x 3 rectangular / 2 = five piles on a circle + centre pile: reactions from N, M_x, M_y, H and tolerance, strut-and-tie 8.5 (layout 1: two x row ties lower layer + three y ties; layout 2: five side ties T = H/(2 cos 54°) in three layers, ring-sector strut start), strut width at the pile node, CCC / CCT nodes; sectional bending at the column faces with tie ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\SevenPile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "SevenPileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on seven piles in a regular hexagonal arrangement with one central pile, column at the centroid: reactions from N, M_x, M_y, H and tolerance, strut-and-tie 8.5 with direct vertical strut to the central pile and six inclined struts to peripheral piles, six perimeter side ties T_side = H_r in three layers (band 1.5 D_p), strut width at the pile node, CCC / CCT nodes, direct strut vs one-way shear with a_v, ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\EightPile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "EightPileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on eight piles 4 x 2, column at the centre: reactions from N, M_x, M_y, H and tolerance, bending method at the column faces (stress block, ties in 2 bands over the pile rows, 1-2 layers, and 4 bands over the pile columns), STM checks (flattest strut angle, strut width, CCC / CCT nodes), direct struts vs one-way shear with pile fractions and a_v, column punching at k_pun·d with the reactions inside deducted, ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\FivePile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "FivePileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on five piles, 4 at the corners of a square s_p + 1 centre pile under the column: rigid-cap reactions from N, M_x, M_y, H and tolerance, pile spacing check; strut-and-tie 8.5 with a direct strut to the centre pile and four diagonal struts from the column quarters, x / y ties in bands 1.5 D_p over the corner piles, strut width at the pile node, CCC / CCT nodes; bending cross-check by beam theory at the column ..."
 },
 {
  "folder": "EC2_Concrete\\PileCap_Design\\NinePile",
  "group": "EC2_Concrete",
  "type": "Standalone",
  "files": [
   "NinePileCap_EC2-2023_Standalone.mcdx"
  ],
  "desc": "cap on nine piles in a 3 x 3 grid s_x x s_y, column over the centre pile: rigid-cap reactions from N, M_x, M_y, H and tolerance, pile spacing and band overlap checks; strut-and-tie 8.5 with the column split 3 x 3 - direct strut to the centre pile, side struts and diagonal corner struts, ties in three bands each way (edge bands n_e, middle band n_m, 1.5 D_p), strut width at the pile node, CCC / CCT nodes; bending ..."
 },
 {
  "folder": "EC4_Composite\\Bridge_Design",
  "group": "EC4_Composite",
  "type": "Standalone",
  "files": [
   "CompositeBridge_EC4-2005_Standalone.mcdx"
  ],
  "desc": "simply supported steel-concrete composite road bridge, welded I girders + RC deck slab + headed studs, one girder: b_eff, composite section n_0 / n_L / n_sh with sequential construction; EN 1991-2 LM1 UDL + tandem with Courbon lane distribution; construction stage stresses + LTB (6.3.2.4); section class, M_pl,Rd by plastic neutral axis root (or elastic for class 3); web shear EN 1993-1-5 + end stiffener; studs ..."
 },
 {
  "folder": "EC4_Composite\\Bridge_Design",
  "group": "EC4_Composite",
  "type": "Standalone",
  "files": [
   "CompositeBridge_SlabBelow_EC4-2005_Standalone.mcdx"
  ],
  "desc": "same bridge with the concrete slab BELOW the steel I girders as in the sketch: slab = tension flange, cracked section steel + slab bars, plastic M_pl,Rd with bars in tension (root), class from the sequential elastic stresses, LTB of the free top flange in construction and service, shear flow max(uncracked, cracked), transverse bars cotθ 1.0-1.25, A_s,min 7.4.2, bar stress, crack width, ζ deflection, fatigue of ..."
 },
 {
  "folder": "EC3_Steel\\Column_Design",
  "group": "EC3_Steel",
  "type": "Standalone",
  "files": [
   "SteelColumn_EC3-2022_Standalone.mcdx"
  ],
  "desc": "doubly symmetric I / H column or beam-column to EN 1993-1-1:2022 Section 8, class 1-3: section properties with root fillets, classification, cross-section N + My + Mz, flexural buckling y / z with editable curve table and override, torsional buckling, lateral-torsional buckling (Ayrton-Perry form with f_M, M_cr with C_1), interaction equations with Annex B type k_ij and C_m; table values of the 2005 edition / ..."
 },
 {
  "folder": "EC3_Steel\\BracketConnection_Design",
  "group": "EC3_Steel",
  "type": "Standalone",
  "files": [
   "BracketConnection_EC3-EC2-4_Standalone.mcdx"
  ],
  "desc": "steel seat bracket for a girder end on a concrete face: seat plate + gusset + base plate, girder bolts through the bottom flange, cast-in headed anchor rods in n_r rows x n_c columns; M = V e + H h about the lower edge, rigid-plate anchor tension + compression, bolts EN 1993-1-8, flange bearing, seat plate, gusset + edge buckling, welds, base plate bending, concrete bearing, bearing stiffener; anchors EN 1992-4: ..."
 }
];
