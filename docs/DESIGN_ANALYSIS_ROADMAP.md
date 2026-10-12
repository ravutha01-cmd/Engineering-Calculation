# Design analysis tools - roadmap

The hourly routine builds **one tool per run**, taking the first row with status `todo` that has no open
pull request (branch `claude/analysis-tool-<key>`). Rules: `docs/DESIGN_ANALYSIS_TOOLS.md`. Each tool
draws the worksheet's own inputs and runs the worksheet; formulas are never retyped. When a tool is merged,
set its row to `done`; if a worksheet does not suit a drawing, set `skip` with the reason.

Kit tools go in `js/analysis/tools_<group>.js` (one file per group, loaded in `index.html` after `kit.js`).
Ready means `node tools/test_analysis.js`, `node tools/test_sheets.js` and a browser check pass.

| # | Key | Tool | Worksheet | View | Status |
|---|---|---|---|---|---|
| 1 | pilecap | Foundation · pile caps (any layout, columns + walls) | PileCap_Multi_EC2-2023_Standalone | plan, own editor | done |
| 2 | padfooting | Foundation · pad footing | PadFooting_EC2-2023_Standalone | plan (kit) | done |
| 3 | combfooting | Foundation · combined footing | CombinedFooting_EC2-2023_Standalone | plan (kit) | done |
| 4 | footingec7 | Foundation · footing bearing & sliding (EC7) | Footing_EC7_Standalone | plan + section (kit) | todo |
| 5 | singlepile | Foundation · cap on a single pile | SinglePileCap_EC2-2023_Standalone | plan (kit) | todo |
| 6 | pilecapstm | Foundation · pile cap STM (2-9 piles, one worksheet per layout) | TwoPileCap … NinePileCap_EC2-2023_Standalone | plan (kit, one spec per worksheet) | todo |
| 7 | raft | Foundation · raft | Raft_EC7-2024_Standalone | plan (kit) | todo |
| 8 | rccolumn | Columns · RC column section | Column_EC2-2023_Standalone | section with bars (kit) | todo |
| 9 | shearwall | Columns · RC shear wall | ShearWall_EC2-2023_Standalone | section with bars (kit) | todo |
| 10 | rcbeam | Beams · RC beam section | Beam_EC2-2023_Standalone | section with bars (kit) | todo |
| 11 | punching | Slabs · flat slab punching (column, openings) | Punching_EC2-2023_Standalone | plan (kit) | todo |
| 12 | slabtwoway | Slabs · two-way slab panel | Slab_TwoWay_EC2-2023_Standalone | plan (kit) | todo |
| 13 | flatslab | Slabs · flat slab strips | Slab_Flat_EC2-2023_Standalone | plan (kit) | todo |
| 14 | slaboneway | Slabs · one-way slab | Slab_OneWay_EC2-2023_Standalone | section (kit) | todo |
| 15 | retwall | Geotechnical · cantilever retaining wall | RetainingWall_EC2-2023_Standalone | section (kit) | todo |
| 16 | gravitywall | Geotechnical · gravity wall | GravityWall_EC7-2024_Standalone | section (kit) | todo |
| 17 | corbel | Details · corbel | Corbel_EC2-2023_Standalone | elevation (kit) | todo |
| 18 | deepbeam | Beams · deep / transfer beam | DeepBeam_EC2-2023_Standalone | elevation (kit) | todo |
| 19 | dappedend | Details · dapped end | DappedEnd_EC2-2023_Standalone | elevation (kit) | todo |
| 20 | webopening | Beams · beam with web opening | WebOpening_EC2-2023_Standalone | elevation (kit) | todo |
| 21 | staircase | Slabs · staircase | Staircase_EC2-2023_Standalone | section (kit) | todo |
| 22 | steelcolumn | Steel · steel column | SteelColumn_EC3-2022_Standalone | section (kit) | todo |
| 23 | finplate | Steel · fin-plate connection | FinPlate_EC3-2024_Standalone | elevation (kit) | todo |
| 24 | tankwall | SLS · water tank wall | TankWall_EC2-2023_Standalone | section (kit) | todo |
| 25 | pilelateral | Geotechnical · pile under lateral load | PileLateral_EC7-2024_Standalone | section with soil (kit) | todo |

New worksheets that arrive from Drive and suit a drawing are added to the end of this table by the routine.
