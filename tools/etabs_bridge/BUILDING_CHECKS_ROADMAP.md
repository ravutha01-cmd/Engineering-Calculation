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

## Fixes
- [x] 2026-10-11 · Building checks: Print opened the print dialog twice (the page and the app both handled the click)

## Next
- [ ] Apply the P-Δ / αcr amplification to the ETABS-linked members of each storey (design, not only check)
- [ ] Modal check: periods, mass participation ≥ 90 % / all modes > 5 % - EN 1998-1 4.3.3.3.1
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
