# Building checks with ETABS - roadmap

Global (whole-building / storey) checks read live from ETABS through `etabs_bridge.py` and shown on
**Design with ETABS link → Building checks** (`js/etabs_building.js`). One item per iteration: bridge
endpoint (+ `--mock` data), Eurocode check and page section, README, test with the mock bridge.

## Done
- [x] Inter-storey drift, seismic - EN 1998-1 4.4.3.2 (d_r = q_d·d_e, d_r·ν ≤ α·h)
- [x] Wind drift, SLS - storey drift ≤ h/limit
- [x] P-Δ stability coefficient θ and the 1/(1−θ) amplification - EN 1998-1 4.4.2.2
- [x] Torsion of the building - Δmax/Δavg per storey (1.2 / 1.4)
- [x] Base shear, storey shear and overturning moment profiles; overturning stability (EQU)
- [x] Global buckling αcr from the ETABS buckling case and sway amplification - EN 1993-1-1 5.2.1 / 5.2.2, EN 1992-1-1 5.8.2
- [x] P-Δ design of the ETABS-linked members: seismic governing case × 1/(1−θ) of its storey (EN 1998-1 4.4.2.2(3)), lateral non-seismic case × 1/(1−1/αcr) (EN 1993-1-1 5.2.2(5)B), gravity-only cases not amplified; kept through ETABS re-reads and removable
- [x] Modal check: periods, participating mass ≥ 90 % per direction, modes > 5 % included, alternative k ≥ 3√n and T_k ≤ 0.20 s, torsional first mode flagged - EN 1998-1 4.3.3.3.1
- [x] Demo building on the Building checks page: sample ETABS results of a 10-storey RC building (all checks, no ETABS needed), plus demo ETABS-linked members

## Fixes
- [x] 2026-10-11 · P-Δ θ was divided by the storey height twice (d_r already a drift ratio) - θ came out ~h times too small (unconservative). Now θ = P·(d_r/h)/V
- [x] 2026-10-11 · Building checks: Print opened the print dialog twice (the page and the app both handled the click)

## Next
- [ ] Base shear check: response spectrum vs lateral force method, T1 vs Ct·H^¾ - EN 1998-1 4.3.3.2
- [ ] Soft storey: lateral stiffness of each storey vs the storey above (regularity in elevation) - EN 1998-1 4.2.3.3
- [ ] Weak storey: storey shear strength ratio
- [ ] Mass irregularity: storey mass vs adjacent storeys
- [ ] Torsional radius r vs radius of gyration ls and eccentricity e0 ≤ 0.3 r - EN 1998-1 4.2.3.2(6)
- [ ] Accidental torsion e_ai = ±0.05 L_i and the δ = 1 + 0.6 x/L_e factor - EN 1998-1 4.3.2, 4.3.3.2.4
- [ ] Wind-induced top acceleration / occupant comfort (ISO 10137)
- [ ] Support uplift and pile tension from base reactions
- [ ] Column axial shortening / differential shortening in tall buildings
- [ ] Diaphragm forces and chord / collector design - EN 1998-1 4.4.2.5
- [ ] Seismic joint / pounding gap between adjacent blocks - EN 1998-1 4.4.2.7
