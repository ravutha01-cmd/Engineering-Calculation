"""Write js/mcad/catalog.js: one element type per Mathcad worksheet."""
import json, os, sys, re
# id: (group, name, prefix)
C = {
 'PadFooting_EC2-2023_Standalone': ('foundations', 'Pad footing', 'F'),
 'CombinedFooting_EC2-2023_Standalone': ('foundations', 'Combined footing (2 columns)', 'CF'),
 'SinglePileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 1 pile', 'PC'),
 'TwoPileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 2 piles', 'PC'),
 'ThreePileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 3 piles', 'PC'),
 'FourPileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 4 piles', 'PC'),
 'FivePileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 5 piles', 'PC'),
 'SixPileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 6 piles', 'PC'),
 'SevenPileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 7 piles', 'PC'),
 'EightPileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 8 piles', 'PC'),
 'NinePileCap_EC2-2023_Standalone': ('foundations', 'Pile cap - 9 piles', 'PC'),
 'Pilecap_EC2-2023_HandInput': ('foundations', 'Pile cap - general (hand input)', 'PC'),
 'Pilecap_EC2-2023_ETABS': ('foundations', 'Pile cap - from ETABS data', 'PC'),
 'PileCap_FEM_EC2-2023_ETABS': ('foundations', 'Pile cap - FEM shell forces', 'PC'),
 'PileCap_Multi_EC2-2023_Standalone': ('foundations', 'Pile cap - several columns', 'PC'),
 'Raft_EC7-2024_Standalone': ('foundations', 'Raft foundation', 'RF'),
 'Column_EC2-2023_Standalone': ('columns', 'RC column', 'C'),
 'ShearWall_EC2-2023_Standalone': ('columns', 'RC shear wall', 'W'),
 'SlenderWall_EC2-2023_Standalone': ('columns', 'Slender wall (out of plane)', 'W'),
 'EffectiveLength_EC2-2023_Standalone': ('columns', 'Column effective length', 'C'),
 'Beam_EC2-2023_Standalone': ('beams', 'RC beam', 'B'),
 'Beam_2004_EC2-2023_Standalone': ('beams', 'RC beam (2004 method)', 'B'),
 'Torsion_EC2-2023_Standalone': ('beams', 'Beam torsion + shear', 'B'),
 'LTB_EC2-2023_Standalone': ('beams', 'RC beam lateral-torsional buckling', 'B'),
 'DeepBeam_EC2-2023_Standalone': ('beams', 'Deep / transfer beam (STM)', 'TB'),
 'WebOpening_EC2-2023_Standalone': ('beams', 'Beam with web opening', 'B'),
 'Fatigue_EC2-2023_Standalone': ('beams', 'Fatigue of RC beam', 'B'),
 'Slab_OneWay_EC2-2023_Standalone': ('slabs', 'One-way slab', 'S'),
 'Slab_TwoWay_EC2-2023_Standalone': ('slabs', 'Two-way slab', 'S'),
 'Slab_Flat_EC2-2023_Standalone': ('slabs', 'Flat slab', 'FS'),
 'Punching_EC2-2023_Standalone': ('slabs', 'Punching shear', 'P'),
 'RibbedSlab_EC2-2023_Standalone': ('slabs', 'Ribbed slab (one-way)', 'RS'),
 'PTSlab_EC2-2023_Standalone': ('slabs', 'Post-tensioned slab', 'PT'),
 'Staircase_EC2-2023_Standalone': ('slabs', 'Staircase flight', 'ST'),
 'SpiralStair_EC2-2023_Standalone': ('slabs', 'Helical / spiral stair', 'ST'),
 'Corbel_EC2-2023_Standalone': ('details', 'Corbel / bracket', 'CB'),
 'DappedEnd_EC2-2023_Standalone': ('details', 'Dapped end (half joint)', 'DE'),
 'FrameCorner_EC2-2023_Standalone': ('details', 'Frame corner (knee joint)', 'FC'),
 'BCJoint_EC2-2023_Standalone': ('details', 'Beam-column joint', 'J'),
 'Interface_EC2-2023_Standalone': ('details', 'Interface shear', 'IS'),
 'Anchorage_EC2-2023_Standalone': ('details', 'Anchorage & lap lengths', 'AL'),
 'Cover_EC2-2023_Standalone': ('sls', 'Concrete cover', 'CV'),
 'CrackControl_EC2-2023_Standalone': ('sls', 'Crack control', 'CR'),
 'Deflection_EC2-2023_Standalone': ('sls', 'Deflection by calculation', 'DF'),
 'CreepShrinkage_EC2-2023_Standalone': ('sls', 'Creep & shrinkage', 'CS'),
 'RestraintCracking_EC2-2023_Standalone': ('sls', 'Restraint cracking', 'RC'),
 'Fire_EC2-2023_Standalone': ('sls', 'Fire resistance (tabulated)', 'FR'),
 'TankWall_EC2-2023_Standalone': ('sls', 'Tank wall (liquid retaining)', 'TW'),
 'TankPanel_EC2-2023_Standalone': ('sls', 'Tank wall panel (two-way)', 'TP'),
 'Footing_EC7_Standalone': ('geo', 'Spread footing - geotechnical', 'GF'),
 'Settlement_EC7_Standalone': ('geo', 'Settlement of layered ground', 'SE'),
 'RetainingWall_EC2-2023_Standalone': ('geo', 'Cantilever retaining wall', 'RW'),
 'GravityWall_EC7-2024_Standalone': ('geo', 'Gravity / gabion wall', 'GW'),
 'SeismicWall_EC8-EC7_Standalone': ('geo', 'Retaining wall - seismic', 'RW'),
 'SheetPile_EC7_Standalone': ('geo', 'Sheet pile wall', 'SP'),
 'Anchor_EC7-2024_Standalone': ('geo', 'Grouted ground anchor', 'GA'),
 'Uplift_EC7-2024_Standalone': ('geo', 'Basement uplift & heave', 'UP'),
 'Slope_EC7-2024_Standalone': ('geo', 'Slope stability', 'SL'),
 'Embankment_EC7-2024_Standalone': ('geo', 'Staged embankment + PVD', 'EM'),
 'StoneColumns_EC7-2024_Standalone': ('geo', 'Stone columns', 'SC'),
 'PileAxial_EC7_Standalone': ('geo', 'Pile axial resistance', 'PA'),
 'PileDriven_EC7-2024_Standalone': ('geo', 'Driven precast pile (SPT)', 'PD'),
 'PileLateral_EC7-2024_Standalone': ('geo', 'Pile under lateral load', 'PL'),
 'PileGroupSettlement_EC7-2024_Standalone': ('geo', 'Pile group settlement', 'PG'),
 'PileDowndrag_EC7-2024_Standalone': ('geo', 'Pile downdrag', 'ND'),
 'PileLoadTest_EC7-2024_Standalone': ('geo', 'Pile load test', 'LT'),
 'PileSoilSprings_EC7-2024_Standalone': ('geo', 'Pile soil springs', 'PS'),
 'SPT_Correlation_EC7-2024_Standalone': ('geo', 'SPT soil parameters', 'BH'),
 'Liquefaction_EC8-EC7_Standalone': ('geo', 'Liquefaction (SPT)', 'LQ'),
 'Wind_Building_EC1-2023_Standalone': ('actions', 'Wind on building', 'WL'),
 'Wind_Canopy_Signboard_EC1-2023_Standalone': ('actions', 'Wind on canopy / signboard', 'WL'),
 'Wind_Portal_EC1-2023_Standalone': ('actions', 'Wind on portal frame', 'WL'),
 'Imposed_Loads_EC1-2023_Standalone': ('actions', 'Imposed loads', 'LD'),
 'SelfWeight_EC1-2023_Standalone': ('actions', 'Self-weight build-ups', 'LD'),
 'Vehicle_Impact_EC1-2023_Standalone': ('actions', 'Vehicle impact', 'VI'),
 'Execution_Loads_EC1-2023_Standalone': ('actions', 'Execution loads', 'EX'),
 'Thermal_Actions_EC1-2023_Standalone': ('actions', 'Thermal actions (roof)', 'TH'),
 'Vortex_Shedding_EC1-2023_Standalone': ('actions', 'Vortex shedding (chimney)', 'VS'),
 'WaterTank_EC1-2023_Standalone': ('actions', 'Circular water tank', 'WT'),
 'TallBuilding_EC1-2023_Standalone': ('actions', 'Tall building (wind + take-down)', 'TB'),
 'Wind_TallBuilding_EC1-2023_Standalone': ('actions', 'Tall building wind (dynamic)', 'TW'),
 'Wind_Drift_EC1-2023_Standalone': ('actions', 'Tall building wind drift', 'TD'),
 'Wind_AcrossTorsion_EC1-2023_Standalone': ('actions', 'Across-wind & torsion', 'TA'),
 'WindComb_TallBuilding_EC1-2023_Standalone': ('actions', 'Tall building wind combinations', 'TC'),
 'Thermal_TallBuilding_EC1-2023_Standalone': ('actions', 'Tall building thermal', 'TT'),
 'Shortening_TallBuilding_EC1-2023_Standalone': ('actions', 'Column / core shortening', 'SH'),
 'Outrigger_TallBuilding_EC1-2023_Standalone': ('actions', 'Outrigger & transfer floor', 'OR'),
 'SteelColumn_EC3-2022_Standalone': ('steel', 'Steel column (I/H)', 'SC'),
 'FinPlate_EC3-2024_Standalone': ('steel', 'Fin plate connection', 'FP'),
 'BracketConnection_EC3-EC2-4_Standalone': ('steel', 'Steel seat bracket + anchors', 'BR'),
 'CompositeBridge_EC4-2005_Standalone': ('steel', 'Composite bridge (slab above)', 'BG'),
 'CompositeBridge_SlabBelow_EC4-2005_Standalone': ('steel', 'Composite bridge (slab below)', 'BG'),
}
def guess(sid, fold, title):
    """Group, name and mark prefix for a worksheet not listed in C (a new Mathcad file)."""
    key = (fold + ' ' + sid).lower()
    if 'ec7' in key or 'ec8' in key: g = 'geo'
    elif 'ec1_' in key or '_ec1-' in key: g = 'actions'
    elif 'ec3' in key or 'ec4' in key: g = 'steel'
    elif any(k in key for k in ('pilecap', 'footing', 'raft', 'foundation')): g = 'foundations'
    elif any(k in key for k in ('column', 'wall')): g = 'columns'
    elif any(k in key for k in ('beam', 'torsion', 'lintel')): g = 'beams'
    elif any(k in key for k in ('slab', 'stair', 'punch')): g = 'slabs'
    elif any(k in key for k in ('corbel', 'joint', 'anchorage', 'connection', 'bracket', 'interface', 'dapped')): g = 'details'
    else: g = 'sls'
    t = re.split(r'\s+(?:TO|-|–|\()\s+', title)[0].strip().title()[:48] or sid
    words = re.findall(r'[A-Za-z]+', sid.split('_')[0])
    p = ''.join(w[0] for w in re.findall(r'[A-Z][a-z]*', sid.split('_')[0]))[:2].upper() or 'X'
    return g, t, p

src = sys.argv[1]; out = sys.argv[2]
index = json.load(open(sys.argv[3]))  # tools/drive_index.json
folder = {f[:-5]: v.get('folder', '') for f, v in index['files'].items()}
rows = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.js'): continue
    sid = f[:-3]
    txt = open(os.path.join(src, f), encoding='utf-8').read()
    d = json.loads(txt[txt.index(',') + 1: txt.rindex(')')])
    g, n, p = C[sid] if sid in C else guess(sid, folder.get(sid, ''), re.sub(r'&amp;', '&', d['title']))
    if sid not in C: print('new worksheet:', sid, '->', g, n, p)
    code = re.findall(r'(EN \d{4}(?:-\d+)*(?::\d{4})?|EUROCODE \d|EUROCODES)', d['title'])
    rows.append({'id': sid, 'file': sid + '.mcdx', 'folder': folder.get(sid, ''), 'cat': g, 'name': n, 'prefix': p,
                 'title': re.sub(r'&amp;', '&', d['title']), 'code': ', '.join(dict.fromkeys(code)) or 'Eurocodes',
                 'nin': len(d['inputs']), 'kb': round(len(txt) / 1024)})
missing = set(C) - {r['id'] for r in rows}
if missing: print('worksheets no longer present:', sorted(missing))
open(out, 'w', encoding='utf-8').write('/* Generated by tools/catalog.py - one element type per Mathcad worksheet */\nwindow.EC = window.EC || {};\nEC.sheetCatalog = ' + json.dumps(rows, ensure_ascii=False, indent=0) + ';\n')
print(len(rows), 'sheets')
