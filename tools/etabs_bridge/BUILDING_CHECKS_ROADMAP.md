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
- [x] Loads & combinations: create standard load patterns, assign slab loads to the selected slabs, generate the EN 1990 combinations (ULS 6.10 / 6.10a-b, EQU, seismic 100/30, SLS char / freq / qp, wind SLS, envelopes) in ETABS and rebuild them automatically when the building's loads change
- [x] Imperfections as notional loads: θi = θ0·αh·αm (EN 1992-1-1 5.2(5)-(6), EN 1993-1-1 5.3.2(3)); one ETABS notional pattern per gravity pattern and direction (base pattern, ratio θi, X/Y set through the ETABS database table), factored like its base pattern in every ULS combination, ±X/±Y or in the wind's direction
- [x] P-Δ member design with imperfections: gravity combinations carrying notional loads (base shear ≤ 1 % of the vertical load) are sway cases for EN 1993-1-1 5.2.2(5)B - × 1/(1−1/αcr) on the whole M and V by default (conservative), or left unamplified by option
- [x] EC8 design spectrum written to ETABS: Sd(T) of EN 1998-1 3.2.2.5(4) (Tables 3.2 / 3.3, ag = γI·agR, β lower bound) as a user response-spectrum function, and the EX (U1) / EY (U2) response-spectrum cases (× g, CQC, SRSS, accidental eccentricity 4.3.2, modal case)
- [x] Stiffness modifiers: frame / shell property modifiers and object overrides read from ETABS, by use (columns, beams, braces, walls, slabs) and material, checked against the purpose of the model - seismic EN 1998-1 4.3.1(7), wind SLS (≈ 1.4 × cracked), P-Δ / αcr EN 1992-1-1 5.8.7.2; steel unreduced; mass, weight, axial area 1.0
- [x] P-Δ member design, exact for imperfections: the linked members' forces under the notional cases are read from ETABS with the combinations that use them; only the notional share Σ|f|·F(N) of each amplified force is multiplied, M_d = M + (1/(1−1/αcr) − 1)·Σ|f|·F(N) (EN 1993-1-1 5.2.2(5)B); whole-force amplification stays as the fallback
- [x] Base shear check: modal T1 vs Ct·H^¾ (EN 1998-1 4.3.3.2.2(3)), lateral force method applicability T1 ≤ min(4TC, 2 s) (4.3.3.2.1), Fb = Sd(T1)·m·λ (4.3.3.2.2(1)) with the EC8 spectrum of Loads & combinations, compared with the response-spectrum base shear (V_RS/Fb plausibility ≥ 0.8)
- [x] Soft storey: storey stiffness k_i = V_i/(d_r,i·h_i) from the seismic case with the largest base shear per direction, k_i/k_i+1 and k_i/mean(3 above) against 0.7 / 0.8 (soft) and 0.6 / 0.7 (extreme, ASCE 7 Table 12.3-2) for the EN 1998-1 4.2.3.3(3) criterion; consequence stated (4.2.3.1, Table 4.1, 5.2.2.2(3))
- [x] Weak storey: storey shear resistance V_Rd,i from the ETABS columns and walls (bridge `/strength`: section size, material, local-axis angle, wall length / angle), V_Rd,i/V_Rd,i+1 against 0.8 (weak) / 0.65 (extreme, ASCE 7 Table 12.3-2) and the resistance-to-demand ratio Ω_i against the storey above (≤ 30 % drop, prEN 1998-1-2) for EN 1998-1 4.2.3.3(4)
- [x] Mass irregularity: storey masses from the ETABS “Mass Summary by Story” table (fallback “Centers Of Mass And Rigidity”, diaphragms summed) read with the building, m_i against 1.5 × the lighter adjacent storey (ASCE 7 Table 12.3-2 type 2, lighter roof excluded) for EN 1998-1 4.2.3.3(3); storeys > 10 % heavier than the one below noted
- [x] Torsional radius and eccentricity: e_0x ≤ 0.30·r_x, r_x ≥ l_s (and Y) per storey - EN 1998-1 4.2.3.2(6); r/l_s from the modal periods (T_Y/T_θ, T_X/T_θ, uncoupled-mode relation, coupling noted), l_s = √(MMI/m) from “Mass Summary by Diaphragm”, e_0 from the ETABS centres of mass and rigidity; torsionally flexible → q_0 of Table 5.1 (5.2.2.1(4))
- [x] Accidental torsion: eccentricity ratio of the ETABS response-spectrum cases (ResponseSpectrum.GetEccentricity / GetLoads) against 0.05 (EN 1998-1 4.3.2(1)P), storey torques M_ai = 0.05·L_i·F_i per direction (4.3.3.3.3), δ = 1 + 0.6 x/L_e and 1 + 1.2 x/L_e for planar models (4.3.3.2.4)

## Fixes
- [x] 2026-10-11 · Notional loads asked the user to set them by hand when the notional table was not found (it was searched only among the tables that already had data). Now fully automatic: all tables searched (also empty ones, fields read with GetAllFieldsInTable); without such a table, a gravity analysis gives N per floor and H_i = θi·N is applied as storey joint loads (EN 1992-1-1 5.2(8))
- [x] 2026-10-11 · Building checks guessed EN 1990 EQU combinations (CS-EQU) as seismic - now ULS
- [x] 2026-10-11 · P-Δ θ was divided by the storey height twice (d_r already a drift ratio) - θ came out ~h times too small (unconservative). Now θ = P·(d_r/h)/V
- [x] 2026-10-11 · Building checks: Print opened the print dialog twice (the page and the app both handled the click)
- [x] 2026-10-11 · Soft storey cited EN 1998-1 4.2.3.3(4)P for the stiffness criterion - it is 4.2.3.3(3) (4.2.3.3(4) is the storey resistance ratio, now the weak-storey check)

## Next
- [ ] Wind-induced top acceleration / occupant comfort (ISO 10137)
- [ ] Support uplift and pile tension from base reactions
- [ ] Column axial shortening / differential shortening in tall buildings
- [ ] Diaphragm forces and chord / collector design - EN 1998-1 4.4.2.5
- [ ] Seismic joint / pounding gap between adjacent blocks - EN 1998-1 4.4.2.7
