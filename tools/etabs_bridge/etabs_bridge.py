"""CAMBO STRUCT - ETABS live link (bridge between the web app and the ETABS API).

Run it on the Windows computer where ETABS is open:

    pip install comtypes
    python etabs_bridge.py

It attaches to the running ETABS instance through the CSI API (OAPI, ETABSv1), reads the load
combinations and the analysis results, and serves them to the CAMBO STRUCT page on
http://127.0.0.1:5480 (this computer only). In the app: Design with ETABS link -> Connect.

Reading never edits the model; the two POST calls below create load patterns, load combinations and slab loads. While reading it switches the present units to
kN, m and selects the requested combinations for output, then restores the units.

Endpoints (JSON):
    GET /instances                 running ETABS windows (process id, model file)
    GET /connect?pid=<id>          link to that ETABS window (pid omitted: the first one found)
    GET /status                    ETABS version, model file, analysed or not
    GET /model                     load combinations and load cases
    GET /selection                 members selected in ETABS now (beams, columns, braces, piers, joints)
    GET /building?c=<combo>&c=...  global building checks: stories, storey drifts, storey forces,
                                   max / average displacement ratios, base reactions, buckling factors
    GET /results?c=<combo>&c=...&k=beams&k=columns&k=braces&k=piers&k=reactions[&sel=1]
                                   results as ETABS-style tables (header row, units row, rows);
                                   sel=1: only the members selected in ETABS
    GET /modifiers                 stiffness / mass modifiers of the frame and area properties (and per-object overrides),
                                   with the material and what each property is used for (columns, beams, walls, slabs)
    GET /loads                     load patterns, load cases and load combinations (with their cases)
    POST /loads/apply              create missing load patterns and rebuild the managed combinations
                                   {prefix, patterns: [{name, type, sw}], combos: [{name, type, items: [[name, sf, isCombo]]}], unlock,
                                    notional: [{name, base, ratio, dir}],   (notional patterns: base pattern, load ratio, X / Y)
                                    spectrum: {func, T: [s], v: [Sd/g], damp, sf, modal, ecc, cases: [{name, dir: U1|U2}]}}
    POST /loads/assign             uniform area loads on the floor slabs selected in ETABS {items: [{pattern, value kN/m2}]}

Writing: only POST with a JSON body from an allowed web page (checked Origin); the model is changed only
through these two calls, and an analysed (locked) model is unlocked only when the request says unlock=true.

Options: --port 5480   --allow-origin https://example.org (repeatable)   --mock (no ETABS, demo data)
"""
import argparse
import csv
import io
import json
import subprocess
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = '1.7'
DEFAULT_ORIGINS = ['https://ravutha01-cmd.github.io', 'null']   # null = the app opened from a local file
KN_M_C = 6                                                    # eUnits.kN_m_C
ORIENT = {1: 'columns', 2: 'beams', 3: 'braces'}             # eFrameDesignOrientation
PROG = 'CSI.ETABS.API.ETABSObject'
SEL_POINT, SEL_FRAME, SEL_AREA = 1, 2, 5                      # SelectObj.GetSelected object types
KINDS = ['beams', 'columns', 'braces', 'piers', 'reactions']
FRAME_HEAD = ['Story', None, 'Unique Name', 'Output Case', 'Case Type', 'Step Type', 'Station', 'P', 'V2', 'V3', 'T', 'M2', 'M3']
FRAME_UNITS = ['', '', '', '', '', '', 'm', 'kN', 'kN', 'kN', 'kN-m', 'kN-m', 'kN-m']
TABLES = {
    'beams': ('Element Forces - Beams', 'Beam'), 'columns': ('Element Forces - Columns', 'Column'),
    'braces': ('Element Forces - Braces', 'Brace'),
}


class BridgeError(Exception):
    pass


def ok(res, what):
    """comtypes returns the [in, out] arguments followed by the return code; 0 = success."""
    if isinstance(res, (list, tuple)):
        if res and res[-1] not in (0, None):
            raise BridgeError(f'ETABS API {what} returned {res[-1]}')
        return list(res[:-1])
    if res not in (0, None):
        raise BridgeError(f'ETABS API {what} returned {res}')
    return []


class Etabs:
    """Live ETABS model through the CSI API."""

    def __init__(self):
        self.model = None
        self.pid = None
        self._helper = None

    def helper(self):
        if self._helper is None:
            try:
                import comtypes.client
            except ImportError:
                raise BridgeError('comtypes is not installed - run: pip install comtypes')
            try:
                h = comtypes.client.CreateObject('ETABSv1.Helper')
                import comtypes.gen.ETABSv1 as etabs_v1
                self._helper = h.QueryInterface(etabs_v1.cHelper)
            except Exception:
                raise BridgeError('The ETABS API is not registered on this computer. Run RegisterETABS.exe from the '
                                  'ETABS folder as administrator (ETABS v18 or later).')
        return self._helper

    @staticmethod
    def pids():
        """process ids of the running ETABS windows"""
        try:
            out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq ETABS.exe', '/FO', 'CSV', '/NH'],
                                 capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout
        except Exception:
            return []
        return [int(r[1]) for r in csv.reader(io.StringIO(out)) if len(r) > 1 and r[1].isdigit()]

    def obj_for(self, pid):
        h = self.helper()
        try:
            return h.GetObjectProcess(PROG, pid) if pid else h.GetObject(PROG)
        except Exception:
            if pid:
                return None
            try:
                import comtypes.client
                return comtypes.client.GetActiveObject(PROG)
            except Exception:
                return None

    def instances(self):
        out = []
        for pid in self.pids():
            o = self.obj_for(pid)
            if o is None:
                continue
            try:
                f = o.SapModel.GetModelFilename(True) or '(unsaved model)'
            except Exception:
                f = '(busy - close any open ETABS dialog)'
            out.append({'pid': pid, 'file': f, 'linked': pid == self.pid})
        if not out:   # tasklist unavailable or a single instance found only through the API
            o = self.obj_for(None)
            if o is not None:
                out.append({'pid': 0, 'file': o.SapModel.GetModelFilename(True) or '(unsaved model)', 'linked': self.model is not None})
        return {'instances': out}

    def connect(self, pid):
        o = self.obj_for(pid)
        if o is None:
            raise BridgeError('No running ETABS found. Open ETABS with the model first.' if not pid else f'ETABS process {pid} is not reachable any more.')
        self.model, self.pid = o.SapModel, pid or None
        return self.status()

    def attach(self):
        if self.model is not None:
            try:
                self.model.GetModelFilename(True)
                return self.model
            except Exception:
                self.model = None
        self.connect(self.pid)
        return self.model

    def status(self):
        m = self.attach()
        ver = ''
        try:
            ver = str(ok(m.GetVersion(), 'GetVersion')[0])
        except Exception:
            pass
        locked = False
        try:
            locked = bool(m.GetModelIsLocked())
        except Exception:
            pass
        return {'connected': True, 'etabs': ver, 'pid': self.pid, 'file': m.GetModelFilename(True) or '(unsaved model)', 'analysed': locked}

    def frame_info(self, m, name, cache):
        if name not in cache:
            label, story = ok(m.FrameObj.GetLabelFromName(name, '', ''), 'FrameObj.GetLabelFromName')[:2]
            orient = ok(m.FrameObj.GetDesignOrientation(name, 0), 'FrameObj.GetDesignOrientation')[0]
            cache[name] = (label, story, ORIENT.get(int(orient)))
        return cache[name]

    def selected(self, m):
        """objects selected in the ETABS window: frames {name}, points {name}, piers {(story, pier)}"""
        n, types, names = ok(m.SelectObj.GetSelected(0, [], []), 'SelectObj.GetSelected')[:3]
        sel = {'frames': set(), 'points': set(), 'piers': set()}
        for i in range(n or 0):
            t, nm = int(types[i]), names[i]
            if t == SEL_FRAME:
                sel['frames'].add(nm)
            elif t == SEL_POINT:
                sel['points'].add(nm)
            elif t == SEL_AREA:
                try:
                    pier = ok(m.AreaObj.GetPier(nm, ''), 'AreaObj.GetPier')[0]
                    story = ok(m.AreaObj.GetLabelFromName(nm, '', ''), 'AreaObj.GetLabelFromName')[1]
                except BridgeError:
                    continue
                if pier and pier.lower() != 'none':
                    sel['piers'].add((story, pier))
        return sel

    def selection(self):
        m = self.attach()
        sel = self.selected(m)
        cache, items = {}, []
        for nm in sorted(sel['frames']):
            label, story, kind = self.frame_info(m, nm, cache)
            if kind:
                items.append({'kind': kind, 'story': story, 'label': label})
        for nm in sorted(sel['points']):
            try:
                restr = ok(m.PointObj.GetRestraint(nm, []), 'PointObj.GetRestraint')[0]
                label, story = ok(m.PointObj.GetLabelFromName(nm, '', ''), 'PointObj.GetLabelFromName')[:2]
            except BridgeError:
                continue
            if any(restr or []):
                items.append({'kind': 'reactions', 'story': story, 'label': label})
        items += [{'kind': 'piers', 'story': st, 'label': p} for st, p in sorted(sel['piers'])]
        return {'items': items}

    def names(self, coll, what):
        out = ok(coll.GetNameList(0, []), what)
        return list(out[1] or []) if len(out) > 1 else []

    def model_info(self):
        m = self.attach()
        return {'combos': self.names(m.RespCombo, 'RespCombo.GetNameList'), 'cases': self.names(m.LoadCases, 'LoadCases.GetNameList')}

    def loads(self):
        return loads_from_model(self.attach())

    def modifiers(self):
        return modifiers_from_model(self.attach())

    def apply_loads(self, body):
        return apply_loads(self.attach(), body)

    def assign_loads(self, body):
        return assign_slab_loads(self.attach(), body)

    def building(self, combos):
        m = self.attach()
        if not combos:
            raise BridgeError('Select at least one load combination')
        cset = set(self.model_info()['combos'])
        old = m.GetPresentUnits()
        m.SetPresentUnits(KN_M_C)
        try:
            out = building_from_model(m, combos, cset)
        finally:
            m.SetPresentUnits(old)
        out['file'] = m.GetModelFilename(True)
        return out

    def results(self, combos, kinds, only_sel=False):
        m = self.attach()
        sel = self.selected(m) if only_sel else None
        if sel is not None and not any(sel.values()):
            raise BridgeError('Nothing is selected in ETABS - select beams, columns, walls or support joints first.')
        if not combos:
            raise BridgeError('Select at least one load combination')
        known = self.model_info()
        cset = set(known['combos'])
        old_units = m.GetPresentUnits()
        m.SetPresentUnits(KN_M_C)
        try:
            setup = m.Results.Setup
            setup.DeselectAllCasesAndCombosForOutput()
            for c in combos:
                if c in cset:
                    ok(setup.SetComboSelectedForOutput(c, True), 'SetComboSelectedForOutput')
                else:
                    ok(setup.SetCaseSelectedForOutput(c, True), 'SetCaseSelectedForOutput')
            ctype = lambda c: 'Combination' if c in cset else 'LoadCase'
            tables = []
            if any(k in kinds for k in TABLES):
                tables += self.frame_tables(m, kinds, ctype, sel)
            if 'piers' in kinds and (sel is None or sel['piers']):
                t = self.pier_table(m, ctype, sel)
                if t:
                    tables.append(t)
            if 'reactions' in kinds and (sel is None or sel['points']):
                t = self.reaction_table(m, ctype, sel)
                if t:
                    tables.append(t)
        finally:
            m.SetPresentUnits(old_units)
        return {'file': m.GetModelFilename(True), 'tables': tables}

    def frame_tables(self, m, kinds, ctype, sel=None):
        if sel is not None and not sel['frames']:
            return []
        # selection: ask ETABS for the selected frames only (ItemTypeElm.SelectionElm = 3), else the whole model
        r = ok(m.Results.FrameForce('', 3, 0, [], [], [], [], [], [], [], [], [], [], [], [], []) if sel is not None else
               m.Results.FrameForce('All', 2, 0, [], [], [], [], [], [], [], [], [], [], [], [], []), 'Results.FrameForce')
        n, obj, obj_sta, _elm, _elm_sta, case, step_type, _step_num, P, V2, V3, T, M2, M3 = r
        info = {}
        rows = {k: [] for k in TABLES}
        for i in range(n):
            name = obj[i]
            if sel is not None and name not in sel['frames']:
                continue
            label, story, kind = self.frame_info(m, name, info)
            if kind not in kinds or kind not in rows:
                continue
            rows[kind].append([story, label, name, case[i], ctype(case[i]), step_type[i], obj_sta[i], P[i], V2[i], V3[i], T[i], M2[i], M3[i]])
        out = []
        for k, (title, head) in TABLES.items():
            if rows[k]:
                out.append({'name': title, 'rows': [[head if h is None else h for h in FRAME_HEAD], FRAME_UNITS] + rows[k]})
        return out

    def pier_table(self, m, ctype, sel=None):
        try:
            r = ok(m.Results.PierForce(0, [], [], [], [], [], [], [], [], [], []), 'Results.PierForce')
        except BridgeError:
            return None
        n, story, pier, case, loc, P, V2, V3, T, M2, M3 = r
        if not n:
            return None
        rows = [[story[i], pier[i], case[i], ctype(case[i]), loc[i], P[i], V2[i], V3[i], T[i], M2[i], M3[i]] for i in range(n)
                if sel is None or (story[i], pier[i]) in sel['piers']]
        if not rows:
            return None
        return {'name': 'Pier Forces', 'rows': [['Story', 'Pier', 'Output Case', 'Case Type', 'Location', 'P', 'V2', 'V3', 'T', 'M2', 'M3'],
                                                ['', '', '', '', '', 'kN', 'kN', 'kN', 'kN-m', 'kN-m', 'kN-m']] + rows}

    def reaction_table(self, m, ctype, sel=None):
        r = ok(m.Results.JointReact('All', 2, 0, [], [], [], [], [], [], [], [], [], [], []), 'Results.JointReact')
        n, obj, _elm, case, step_type, _step_num, F1, F2, F3, M1, M2, M3 = r
        info = {}
        rows = []
        for i in range(n):
            name = obj[i]
            if sel is not None and name not in sel['points']:
                continue
            if name not in info:
                restr = ok(m.PointObj.GetRestraint(name, []), 'PointObj.GetRestraint')[0]
                label, story = ok(m.PointObj.GetLabelFromName(name, '', ''), 'PointObj.GetLabelFromName')[:2]
                info[name] = (label, story, any(restr or []))
            label, story, supported = info[name]
            if supported:
                rows.append([story, label, name, case[i], ctype(case[i]), step_type[i], F1[i], F2[i], F3[i], M1[i], M2[i], M3[i]])
        if not rows:
            return None
        return {'name': 'Joint Reactions', 'rows': [['Story', 'Label', 'Unique Name', 'Output Case', 'Case Type', 'Step Type', 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'],
                                                    ['', '', '', '', '', '', 'kN', 'kN', 'kN', 'kN-m', 'kN-m', 'kN-m']] + rows}


def table(m, key):
    """an ETABS display table (Database Tables API) as a list of dicts, numbers converted"""
    out = ok(m.DatabaseTables.GetTableForDisplayArray(key, [], 'All', 0, [], 0, []), 'GetTableForDisplayArray ' + key)
    _fields, _ver, keys, n, data = out[:5]
    keys = list(keys or [])
    rows = []
    for i in range(n or 0):
        r = {}
        for j, k in enumerate(keys):
            v = data[i * len(keys) + j]
            try:
                v = float(v)
            except (TypeError, ValueError):
                pass
            r[k] = v
        rows.append(r)
    return rows


def pick(r, *names, default=None):
    for nm in names:
        if nm in r and r[nm] not in ('', None):
            return r[nm]
    return default


def building_from_model(m, combos, cset):
    """global building data in kN, m for the requested combinations / cases"""
    # stories (bottom-up, base excluded)
    stories = []
    try:
        base, n, names, elev, hgt = ok(m.Story.GetStories_2(0, 0, [], [], [], [], [], [], [], []), 'Story.GetStories_2')[:5]
    except Exception:
        n, names, elev, hgt = ok(m.Story.GetStories(0, [], [], [], [], [], [], []), 'Story.GetStories')[:4]
        base = None
    for i in range(n):
        if hgt[i] > 0:
            stories.append({'name': names[i], 'elev': elev[i], 'h': hgt[i]})
    stories.sort(key=lambda x: x['elev'])
    # results through the Results API
    setup = m.Results.Setup
    setup.DeselectAllCasesAndCombosForOutput()
    for c in combos:
        ok(setup.SetComboSelectedForOutput(c, True) if c in cset else setup.SetCaseSelectedForOutput(c, True), 'select ' + c)
    drifts = []
    r = ok(m.Results.StoryDrifts(0, [], [], [], [], [], [], [], [], [], []), 'Results.StoryDrifts')
    nr, story, case, step, _sn, dirn, drift, label, x, y, _z = r[:11]
    for i in range(nr):
        d = str(dirn[i]).upper()
        drifts.append({'story': story[i], 'combo': case[i], 'step': step[i], 'dir': 'X' if 'X' in d else 'Y', 'drift': abs(drift[i]), 'label': label[i]})
    base_r = []
    r = ok(m.Results.BaseReact(0, [], [], [], [], [], [], [], [], [], 0, 0, 0), 'Results.BaseReact')
    nr, case, step, _sn, FX, FY, FZ, MX, MY, MZ, gx, gy, gz = r[:13]
    for i in range(nr):
        base_r.append({'combo': case[i], 'step': step[i], 'FX': FX[i], 'FY': FY[i], 'FZ': FZ[i], 'MX': MX[i], 'MY': MY[i], 'MZ': MZ[i]})
    # buckling: every buckling load case
    buck = []
    try:
        setup.DeselectAllCasesAndCombosForOutput()
        bcases = []
        for c in ok(m.LoadCases.GetNameList(0, []), 'LoadCases.GetNameList')[1] or []:
            try:
                if int(ok(m.LoadCases.GetTypeOAPI(c, 0, 0), 'GetTypeOAPI')[0]) == 10:   # eLoadCaseType.Buckling
                    bcases.append(c)
                    setup.SetCaseSelectedForOutput(c, True)
            except BridgeError:
                pass
        if bcases:
            nr, case, _st, num, fac = ok(m.Results.BucklingFactor(0, [], [], [], []), 'Results.BucklingFactor')[:5]
            buck = [{'case': case[i], 'mode': int(num[i]), 'factor': fac[i]} for i in range(nr)]
    except BridgeError:
        pass
    # modal: periods and participating mass ratios of every modal case
    modal = []
    try:
        setup.DeselectAllCasesAndCombosForOutput()
        mcases = []
        for c in ok(m.LoadCases.GetNameList(0, []), 'LoadCases.GetNameList')[1] or []:
            try:
                if int(ok(m.LoadCases.GetTypeOAPI(c, 0, 0), 'GetTypeOAPI')[0]) == 3:   # eLoadCaseType.Modal
                    mcases.append(c)
                    setup.SetCaseSelectedForOutput(c, True)
            except BridgeError:
                pass
        if mcases:
            r = ok(m.Results.ModalParticipatingMassRatios(0, [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []),
                   'Results.ModalParticipatingMassRatios')
            nr, case, _st, num, T, Ux, Uy, _Uz, SUx, SUy, _SUz, _Rx, _Ry, Rz, _SRx, _SRy, SRz = r[:17]
            modal = [{'case': case[i], 'mode': int(num[i]), 'T': T[i], 'Ux': Ux[i], 'Uy': Uy[i], 'Rz': Rz[i],
                      'SumUx': SUx[i], 'SumUy': SUy[i], 'SumRz': SRz[i]} for i in range(nr)]
    except BridgeError:
        pass
    # storey forces and max / average displacements through the display tables
    forces, torsion = [], []
    try:
        dt = m.DatabaseTables
        cs = [c for c in combos if c in cset]
        ks = [c for c in combos if c not in cset]
        dt.SetLoadCombinationsSelectedForDisplay(cs)
        dt.SetLoadCasesSelectedForDisplay(ks)
        for r in table(m, 'Story Forces'):
            forces.append({'story': pick(r, 'Story'), 'combo': pick(r, 'OutputCase', 'LoadCase'), 'step': pick(r, 'StepType', default=''),
                           'loc': pick(r, 'Location', default=''), 'P': pick(r, 'P', default=0), 'VX': pick(r, 'VX', default=0), 'VY': pick(r, 'VY', default=0),
                           'T': pick(r, 'T', default=0), 'MX': pick(r, 'MX', default=0), 'MY': pick(r, 'MY', default=0)})
        for key in ('Story Max Over Avg Displacements', 'Story Max Over Avg Drifts'):
            try:
                rows = table(m, key)
            except Exception:
                continue
            for r in rows:
                torsion.append({'story': pick(r, 'Story'), 'combo': pick(r, 'OutputCase', 'LoadCase'), 'step': pick(r, 'StepType', default=''),
                                'dir': 'X' if 'X' in str(pick(r, 'Direction', default='X')).upper() else 'Y',
                                'max': pick(r, 'Maximum', 'Max', default=0), 'avg': pick(r, 'Average', 'Avg', default=0), 'ratio': pick(r, 'Ratio', default=0)})
            if torsion:
                break
    except Exception as e:
        print('display tables not available:', e)
    return {'stories': stories, 'drifts': drifts, 'forces': forces, 'torsion': torsion, 'base': base_r, 'buckling': buck, 'modal': modal}


COMBO_TYPES = {0: 'Linear Add', 1: 'Envelope', 2: 'Absolute Add', 3: 'SRSS', 4: 'Range Add'}


def loads_from_model(m):
    pats = []
    for n in ok(m.LoadPatterns.GetNameList(0, []), 'LoadPatterns.GetNameList')[1] or []:
        t = ok(m.LoadPatterns.GetLoadType(n, 0), 'LoadPatterns.GetLoadType')[0]
        sw = ok(m.LoadPatterns.GetSelfWTMultiplier(n, 0), 'LoadPatterns.GetSelfWTMultiplier')[0]
        pats.append({'name': n, 'type': int(t), 'sw': sw})
    cases = []
    for n in ok(m.LoadCases.GetNameList(0, []), 'LoadCases.GetNameList')[1] or []:
        try:
            t = int(ok(m.LoadCases.GetTypeOAPI(n, 0, 0), 'LoadCases.GetTypeOAPI')[0])
        except BridgeError:
            t = 0
        cases.append({'name': n, 'type': t})
    combos = []
    for n in ok(m.RespCombo.GetNameList(0, []), 'RespCombo.GetNameList')[1] or []:
        t = ok(m.RespCombo.GetTypeOAPI(n, 0), 'RespCombo.GetTypeOAPI')[0]
        k, ctypes, cnames, sfs = ok(m.RespCombo.GetCaseList(n, 0, [], [], []), 'RespCombo.GetCaseList')[:4]
        combos.append({'name': n, 'type': int(t), 'items': [[cnames[i], sfs[i], int(ctypes[i]) == 1] for i in range(k or 0)]})
    return {'patterns': pats, 'cases': cases, 'combos': combos, 'locked': bool(m.GetModelIsLocked())}


def apply_loads(m, body):
    prefix = str(body.get('prefix') or 'CS-')
    if len(prefix) < 2:
        raise BridgeError('The managed-combination prefix must have at least 2 characters.')
    if m.GetModelIsLocked():
        if not body.get('unlock'):
            raise BridgeError('LOCKED: the ETABS model is analysed (locked). Unlocking deletes the analysis results.')
        ok(m.SetModelIsLocked(False), 'SetModelIsLocked')
    have = set(ok(m.LoadPatterns.GetNameList(0, []), 'LoadPatterns.GetNameList')[1] or [])
    made = []
    for p in body.get('patterns', []):
        if p['name'] not in have:
            ok(m.LoadPatterns.Add(p['name'], int(p['type']), float(p.get('sw', 0)), True), 'LoadPatterns.Add ' + p['name'])
            made.append(p['name'])
    # rebuild the managed combinations: delete every <prefix>* combination (envelopes first), then add
    old = [c for c in (ok(m.RespCombo.GetNameList(0, []), 'RespCombo.GetNameList')[1] or []) if c.startswith(prefix)]
    for _ in range(4):
        left = []
        for c in old:
            try:
                ok(m.RespCombo.Delete(c), 'RespCombo.Delete')
            except BridgeError:
                left.append(c)          # still used by another managed envelope: next pass
        old = left
        if not old:
            break
    spectrum = set_spectrum(m, body.get('spectrum'))
    notional = set_notional(m, body.get('notional', []), bool(body.get('notional_run')))
    n = 0
    for c in body.get('combos', []):
        if not str(c['name']).startswith(prefix):
            continue                    # never touch the user's own combinations
        ok(m.RespCombo.Add(c['name'], int(c.get('type', 0))), 'RespCombo.Add ' + c['name'])
        for name, sf, is_combo in c['items']:
            ok(m.RespCombo.SetCaseList(c['name'], 1 if is_combo else 0, name, float(sf)), 'RespCombo.SetCaseList ' + c['name'])
        n += 1
    return {'patterns_created': made, 'combos': n, 'removed_left': old, 'notional': notional, 'spectrum': spectrum}


def set_notional(m, items, allow_run=False):
    """notional (imperfection) loads, fully automatic:
    1. through ETABS's own notional load patterns (base pattern, ratio, direction) in the editable database
       table - searched among ALL tables, also the empty ones, field names discovered;
    2. otherwise, on a manual write (allow_run), as explicit storey forces H_i = ratio * N_i (EN 1992-1-1 5.2(8)):
       a gravity-only analysis gives each floor's vertical load N_i per base pattern, and H_i is applied as
       horizontal point loads on the joints of that storey, in the notional pattern (made an 'Other' pattern)."""
    if not items:
        return {'set': 0}
    why = notional_by_table(m, items)
    if why is None:
        return {'set': len(items), 'mode': 'table'}
    if not allow_run:
        return {'set': 0, 'pending': True, 'why': why}
    try:
        r = notional_by_forces(m, items)
        r['why_table'] = why
        return r
    except Exception as e:
        traceback.print_exc()
        return {'set': 0, 'error': f'notional loads not applied: {why}; storey forces: {type(e).__name__}: {e}'}


def notional_by_table(m, items):
    """None when done, else the reason it could not be done"""
    dt = m.DatabaseTables
    keys = []
    for fn, args in (('GetAllTables', (0, [], [], [], [])), ('GetAvailableTables', (0, [], [], []))):
        try:
            keys = list(ok(getattr(dt, fn)(*args), fn)[1] or [])
            if keys:
                break
        except Exception:
            continue
    cands = [k for k in keys if 'notional' in k.lower()]
    if not cands:
        return 'this ETABS version has no notional-load table'
    last = ''
    for key in cands:
        try:
            out = ok(dt.GetTableForEditingArray(key, 'All', 0, [], 0, []), 'GetTableForEditingArray')
            ver, fields, nrec, data = out[0], list(out[1] or []), out[2] or 0, list(out[3] or [])
            if not fields:   # empty table: ask for its importable fields
                fo = ok(dt.GetAllFieldsInTable(key, 0, 0, [], [], [], [], []), 'GetAllFieldsInTable')
                ver, fkeys, imp = fo[0], list(fo[2] or []), list(fo[6] or [])
                fields = [k for k, i in zip(fkeys, imp) if i] or fkeys
                nrec, data = 0, []
            low = [k.lower() for k in fields]
            pick = lambda test: next((i for i, k in enumerate(low) if test(k)), None)
            i_base = pick(lambda k: 'base' in k)
            i_name = pick(lambda k: ('name' in k or 'pattern' in k) and 'base' not in k)
            i_ratio = pick(lambda k: 'ratio' in k or 'coef' in k)
            i_dir = pick(lambda k: 'dir' in k)
            if None in (i_name, i_base, i_ratio, i_dir):
                last = f'{key}: unexpected fields ' + ', '.join(fields)
                continue
            nf = len(fields)
            rows = [data[r * nf:(r + 1) * nf] for r in range(nrec)]
            want = {it['name'] for it in items}
            glob = any('global' in str(x).lower() for x in data[i_dir::nf])
            rows = [r for r in rows if r[i_name] not in want]
            for it in items:
                r = [''] * nf
                r[i_name], r[i_base], r[i_ratio] = it['name'], it['base'], f"{float(it['ratio']):.6g}"
                r[i_dir] = ('Global ' if glob else '') + it['dir']
                rows.append(r)
            ok(dt.SetTableForEditingArray(key, ver, fields, len(rows), [x for r in rows for x in r]), 'SetTableForEditingArray')
            res = dt.ApplyEditedTables(True, 0, 0, 0, 0, '')       # -> [fatal, errors, warnings, info, log, ret]
            res = list(res) if isinstance(res, (list, tuple)) else [0, 0, 0, 0, '', res]
            if (res[0] or 0) + (res[1] or 0):
                last = f'{key}: ETABS refused it: ' + str(res[4])[:200]
                continue
            return None
        except Exception as e:
            last = f'{key}: {type(e).__name__}: {e}'
    return last or 'notional-load table not editable'


def notional_by_forces(m, items):
    bases = sorted({it['base'] for it in items})
    try:
        _b, n, names, elev, hgt = ok(m.Story.GetStories_2(0, 0, [], [], [], [], [], [], [], []), 'Story.GetStories_2')[:5]
    except Exception:
        n, names, elev, hgt = ok(m.Story.GetStories(0, [], [], [], [], [], [], []), 'Story.GetStories')[:4]
    stories = sorted([(names[i], elev[i]) for i in range(n) if hgt[i] > 0], key=lambda x: x[1])
    old = m.GetPresentUnits()
    m.SetPresentUnits(KN_M_C)
    try:
        # 1. gravity-only analysis of the base patterns -> axial load at the bottom of each storey
        if m.GetModelIsLocked():
            ok(m.SetModelIsLocked(False), 'SetModelIsLocked')
        ok(m.Analyze.SetRunCaseFlag('', False, True), 'SetRunCaseFlag (all off)')
        for b in bases:
            ok(m.Analyze.SetRunCaseFlag(b, True, False), 'SetRunCaseFlag ' + b)
        try:
            ok(m.Analyze.RunAnalysis(), 'RunAnalysis')
        except BridgeError as e:
            raise BridgeError(f'{e} - save the ETABS model once (File > Save) so it can be analysed')
        finally:
            try:
                m.Analyze.SetRunCaseFlag('', True, True)   # all cases back to Run
            except Exception:
                pass
        dt = m.DatabaseTables
        dt.SetLoadCombinationsSelectedForDisplay([])
        dt.SetLoadCasesSelectedForDisplay(bases)
        Pbot = {}
        for r in table(m, 'Story Forces'):
            if 'bot' in str(pick(r, 'Location', default='Bottom')).lower():
                Pbot[(pick(r, 'Story'), pick(r, 'OutputCase', 'LoadCase'))] = abs(float(pick(r, 'P', default=0) or 0))
        # 2. unlock and apply H_i = ratio * (P_bottom(i) - P_bottom(i+1)) on the joints of storey i
        ok(m.SetModelIsLocked(False), 'SetModelIsLocked')
        pts = {}
        for st, _z in stories:
            try:
                pts[st] = list(ok(m.PointObj.GetNameListOnStory(st, 0, []), 'PointObj.GetNameListOnStory')[1] or [])
            except BridgeError:
                pts[st] = []
        applied, njoint = 0, 0
        for it in items:
            name, base, ratio, d = it['name'], it['base'], float(it['ratio']), it.get('dir', 'X')
            try:   # a notional-type pattern cannot carry user loads: make it an 'Other' pattern of the same name
                if int(ok(m.LoadPatterns.GetLoadType(name, 0), 'GetLoadType')[0]) == 12:
                    try:
                        ok(m.LoadPatterns.SetLoadType(name, 8), 'SetLoadType')
                    except BridgeError:
                        ok(m.LoadPatterns.Delete(name), 'LoadPatterns.Delete')
                        ok(m.LoadPatterns.Add(name, 8, 0, True), 'LoadPatterns.Add')
            except BridgeError:
                ok(m.LoadPatterns.Add(name, 8, 0, True), 'LoadPatterns.Add')
            for i, (st, _z) in enumerate(stories):
                above = stories[i + 1][0] if i + 1 < len(stories) else None
                Ni = Pbot.get((st, base), 0.0) - (Pbot.get((above, base), 0.0) if above else 0.0)
                js = pts.get(st) or []
                if not js:
                    continue
                f = ratio * max(Ni, 0.0) / len(js)
                v = [f, 0, 0, 0, 0, 0] if d == 'X' else [0, f, 0, 0, 0, 0]
                for j in js:
                    ok(m.PointObj.SetLoadForce(j, name, v, True, 'Global', 0), 'PointObj.SetLoadForce')
                njoint += len(js)
            applied += 1
    finally:
        m.SetPresentUnits(old)
    return {'set': applied, 'mode': 'forces', 'stories': len(stories), 'joints': njoint}


def set_spectrum(m, sp):
    """user response-spectrum function (period, Sd/g) and response-spectrum load cases using it"""
    if not sp:
        return None
    warn = []
    T, v = [float(x) for x in sp['T']], [float(x) for x in sp['v']]
    ok(m.Func.FuncRS.SetUser(sp['func'], len(T), T, v, float(sp.get('damp', 0.05))), 'Func.FuncRS.SetUser')
    rs = m.LoadCases.ResponseSpectrum
    old = m.GetPresentUnits()
    m.SetPresentUnits(KN_M_C)     # scale factor g in m/s2
    try:
        for c in sp.get('cases', []):
            ok(rs.SetCase(c['name']), 'ResponseSpectrum.SetCase')
            ok(rs.SetLoads(c['name'], 1, [c['dir']], [sp['func']], [float(sp.get('sf', 9.80665))], ['Global'], [0.0]), 'ResponseSpectrum.SetLoads')
            for what, call in (('modal case', lambda: rs.SetModalCase(c['name'], sp.get('modal', 'Modal'))),
                               ('CQC', lambda: rs.SetModalComb_1(c['name'], 1, 0.0, 0.0, 1, 0.0) if hasattr(rs, 'SetModalComb_1') else rs.SetModalComb(c['name'], 1, 0.0, 0.0, 0.0)),
                               ('SRSS directions', lambda: rs.SetDirComb(c['name'], 1, 0.0)),
                               ('accidental eccentricity', lambda: rs.SetEccentricity(c['name'], float(sp.get('ecc', 0.05)))),
                               ('damping', lambda: rs.SetDampConstant(c['name'], float(sp.get('damp', 0.05))))):
                try:
                    ok(call(), what)
                except Exception as e:
                    warn.append(f"{c['name']}: {what} not set ({e})")
    finally:
        m.SetPresentUnits(old)
    return {'function': sp['func'], 'cases': [c['name'] for c in sp.get('cases', [])], 'warnings': warn}


def assign_slab_loads(m, body):
    if m.GetModelIsLocked():
        if not body.get('unlock'):
            raise BridgeError('LOCKED: the ETABS model is analysed (locked). Unlocking deletes the analysis results.')
        ok(m.SetModelIsLocked(False), 'SetModelIsLocked')
    n, types, names = ok(m.SelectObj.GetSelected(0, [], []), 'SelectObj.GetSelected')[:3]
    floors = []
    for i in range(n or 0):
        if int(types[i]) == SEL_AREA:
            try:
                if int(ok(m.AreaObj.GetDesignOrientation(names[i], 0), 'AreaObj.GetDesignOrientation')[0]) == 2:   # Floor
                    floors.append(names[i])
            except BridgeError:
                pass
    if not floors:
        raise BridgeError('No floor slab is selected in ETABS - select the slabs (not walls) first.')
    old = m.GetPresentUnits()
    m.SetPresentUnits(KN_M_C)
    try:
        for it in body.get('items', []):
            for a in floors:   # direction 10 = gravity; replace the previous value of this pattern
                ok(m.AreaObj.SetLoadUniform(a, it['pattern'], float(it['value']), 10, True, 'Global', 0), 'AreaObj.SetLoadUniform')
    finally:
        m.SetPresentUnits(old)
    return {'slabs': len(floors), 'items': len(body.get('items', []))}


FRAME_MODS = ['A', 'As2', 'As3', 'J', 'I22', 'I33', 'Mass', 'Weight']
AREA_MODS = ['f11', 'f22', 'f12', 'm11', 'm22', 'm12', 'v13', 'v23', 'Mass', 'Weight']
MAT = {1: 'Steel', 2: 'Concrete'}


def modifiers_from_model(m):
    """property modifiers by section / area property, what uses them, and object overrides (effective = property x object)"""
    def material(name, getter):
        try:
            mat = ok(getter(name, ''), 'GetMaterial')[0]
            return MAT.get(int(ok(m.PropMaterial.GetTypeOAPI(mat, 0, 0), 'PropMaterial.GetTypeOAPI')[0]), 'Other')
        except Exception:
            return 'Other'
    props = {}
    for n in ok(m.PropFrame.GetNameList(0, []), 'PropFrame.GetNameList')[1] or []:
        try:
            v = ok(m.PropFrame.GetModifiers(n, []), 'PropFrame.GetModifiers')[0]
        except BridgeError:
            continue
        props[('frame', n)] = {'kind': 'frame', 'name': n, 'mat': material(n, m.PropFrame.GetMaterial), 'mods': dict(zip(FRAME_MODS, list(v)[:8])),
                               'use': {}, 'over': []}
    for n in ok(m.FrameObj.GetNameList(0, []), 'FrameObj.GetNameList')[1] or []:
        try:
            sec = ok(m.FrameObj.GetSection(n, '', ''), 'FrameObj.GetSection')[0]
            orient = ORIENT.get(int(ok(m.FrameObj.GetDesignOrientation(n, 0), 'GetDesignOrientation')[0]), 'other')
        except BridgeError:
            continue
        p = props.get(('frame', sec))
        if not p:
            continue
        p['use'][orient] = p['use'].get(orient, 0) + 1
        try:
            ov = list(ok(m.FrameObj.GetModifiers(n, []), 'FrameObj.GetModifiers')[0])[:8]
            if any(abs(x - 1) > 1e-9 for x in ov):
                p['over'].append({'obj': n, 'mods': dict(zip(FRAME_MODS, ov))})
        except BridgeError:
            pass
    for n in ok(m.PropArea.GetNameList(0, []), 'PropArea.GetNameList')[1] or []:
        try:
            v = ok(m.PropArea.GetModifiers(n, []), 'PropArea.GetModifiers')[0]
        except BridgeError:
            continue
        props[('area', n)] = {'kind': 'area', 'name': n, 'mat': material(n, m.PropArea.GetMaterial) if hasattr(m.PropArea, 'GetMaterial') else 'Concrete',
                              'mods': dict(zip(AREA_MODS, list(v)[:10])), 'use': {}, 'over': []}
    for n in ok(m.AreaObj.GetNameList(0, []), 'AreaObj.GetNameList')[1] or []:
        try:
            prop = ok(m.AreaObj.GetProperty(n, ''), 'AreaObj.GetProperty')[0]
            orient = {1: 'walls', 2: 'slabs'}.get(int(ok(m.AreaObj.GetDesignOrientation(n, 0), 'GetDesignOrientation')[0]), 'other')
        except BridgeError:
            continue
        p = props.get(('area', prop))
        if not p:
            continue
        p['use'][orient] = p['use'].get(orient, 0) + 1
        try:
            ov = list(ok(m.AreaObj.GetModifiers(n, []), 'AreaObj.GetModifiers')[0])[:10]
            if any(abs(x - 1) > 1e-9 for x in ov):
                p['over'].append({'obj': n, 'mods': dict(zip(AREA_MODS, ov))})
        except BridgeError:
            pass
    out = [p for p in props.values() if p['use']]
    for p in out:
        p['over'] = p['over'][:50]
    return {'props': out}


class Mock:
    """Demo model with the same answers as a live ETABS (for testing without ETABS).
    The selection is B12 on Story3, column C3 on Story1 and support J1."""
    COMBOS = ['ULS1 1.35G+1.5Q', 'ULS2 1.35G+1.05Q+1.5W', 'SLS-CHAR G+Q', 'SLS-QP G+0.3Q']
    F = {'ULS1 1.35G+1.5Q': 1, 'ULS2 1.35G+1.05Q+1.5W': 0.86, 'SLS-CHAR G+Q': 0.71, 'SLS-QP G+0.3Q': 0.55}
    BEAMS = [('Story3', 'B12', '101', 7.2, 1.0), ('Story3', 'B13', '102', 6.0, 0.8), ('Story2', 'B12', '103', 7.2, 1.05)]
    COLS = [('Story2', 'C3', '201', 1), ('Story1', 'C3', '202', 1.6), ('Story1', 'C4', '203', 1.25)]
    JOINTS = [('Base', 'J1', '301', 1), ('Base', 'J2', '302', 1.3)]
    SEL = {'frames': {'101', '202'}, 'points': {'301'}, 'piers': set()}

    def __init__(self):
        self.pid = 4120
        self.locked = True
        self.patterns = [{'name': 'Dead', 'type': 1, 'sw': 1.0}, {'name': 'SDL', 'type': 2, 'sw': 0.0}, {'name': 'Live', 'type': 3, 'sw': 0.0},
                         {'name': 'Wind X', 'type': 6, 'sw': 0.0}, {'name': 'Wind Y', 'type': 6, 'sw': 0.0}]
        self.extra_cases = [{'name': 'Modal', 'type': 3}, {'name': 'EQX RS', 'type': 4}, {'name': 'EQY RS', 'type': 4}, {'name': 'Buckling', 'type': 10}]
        self.combos = [{'name': c, 'type': 0, 'items': [['Dead', 1.35, False], ['Live', 1.5, False]]} for c in self.COMBOS]
        self.slab_loads = {}

    def modifiers(self):
        F = lambda **k: dict(dict(zip(FRAME_MODS, [1.0] * 8)), **k)
        A = lambda **k: dict(dict(zip(AREA_MODS, [1.0] * 10)), **k)
        return {'props': [
            {'kind': 'frame', 'name': 'C600x600 C40', 'mat': 'Concrete', 'use': {'columns': 36}, 'mods': F(I22=0.7, I33=0.7), 'over': []},
            {'kind': 'frame', 'name': 'B300x600 C30', 'mat': 'Concrete', 'use': {'beams': 84}, 'mods': F(I22=0.35, I33=0.35, J=0.1), 'over': [{'obj': '101', 'mods': F(I33=2.0)}]},
            {'kind': 'frame', 'name': 'B400x700 C30', 'mat': 'Concrete', 'use': {'beams': 22}, 'mods': F(), 'over': []},
            {'kind': 'frame', 'name': 'HEB300', 'mat': 'Steel', 'use': {'braces': 8}, 'mods': F(), 'over': []},
            {'kind': 'area', 'name': 'W250 C40', 'mat': 'Concrete', 'use': {'walls': 40}, 'mods': A(f22=0.7, f12=0.7, m11=0.7, m22=0.7), 'over': []},
            {'kind': 'area', 'name': 'S200 C30', 'mat': 'Concrete', 'use': {'slabs': 60}, 'mods': A(m11=0.25, m22=0.25, m12=0.25, Mass=0.9), 'over': []}]}

    def loads(self):
        cases = [{'name': p['name'], 'type': 1} for p in self.patterns] + self.extra_cases
        return {'patterns': self.patterns, 'cases': cases, 'combos': self.combos, 'locked': self.locked, 'notional': list(getattr(self, 'notional', {}).values()), 'spectrum': getattr(self, 'spectrum', None)}

    def apply_loads(self, body):
        prefix = str(body.get('prefix') or 'CS-')
        if self.locked:
            if not body.get('unlock'):
                raise BridgeError('LOCKED: the ETABS model is analysed (locked). Unlocking deletes the analysis results.')
            self.locked = False
        made = [p['name'] for p in body.get('patterns', []) if p['name'] not in {x['name'] for x in self.patterns}]
        self.patterns += [{'name': p['name'], 'type': int(p['type']), 'sw': float(p.get('sw', 0))} for p in body.get('patterns', []) if p['name'] in made]
        self.combos = [c for c in self.combos if not c['name'].startswith(prefix)]
        new = [{'name': c['name'], 'type': int(c.get('type', 0)), 'items': [list(i) for i in c['items']]} for c in body.get('combos', []) if c['name'].startswith(prefix)]
        self.combos += new
        # the mock behaves like an ETABS without a notional-load table: storey forces on a manual write
        items = body.get('notional', [])
        if items and body.get('notional_run'):
            self.notional = {it['name']: dict(it, mode='forces') for it in items}
            for p in self.patterns:
                if p['name'] in self.notional:
                    p['type'] = 8
            nres = {'set': len(items), 'mode': 'forces', 'stories': 10, 'joints': 10 * 24 * len(items), 'why_table': 'this ETABS version has no notional-load table'}
        elif items:
            nres = {'set': 0, 'pending': True, 'why': 'this ETABS version has no notional-load table'}
        else:
            nres = {'set': 0}
        sp, spr = body.get('spectrum'), None
        if sp:
            self.spectrum = sp
            for c in sp.get('cases', []):
                if c['name'] not in {x['name'] for x in self.extra_cases}:
                    self.extra_cases.append({'name': c['name'], 'type': 4})
            spr = {'function': sp['func'], 'cases': [c['name'] for c in sp['cases']], 'warnings': []}
        return {'patterns_created': made, 'combos': len(new), 'removed_left': [], 'notional': nres, 'spectrum': spr}

    def assign_loads(self, body):
        if self.locked and not body.get('unlock'):
            raise BridgeError('LOCKED: the ETABS model is analysed (locked). Unlocking deletes the analysis results.')
        self.locked = False
        for it in body.get('items', []):
            self.slab_loads[it['pattern']] = float(it['value'])
        return {'slabs': 6, 'items': len(body.get('items', []))}

    def instances(self):
        return {'instances': [{'pid': 4120, 'file': r'C:\Projects\Demo\Tower-A.EDB', 'linked': self.pid == 4120},
                              {'pid': 5388, 'file': r'C:\Projects\Demo\Podium-B.EDB', 'linked': self.pid == 5388}]}

    def connect(self, pid):
        self.pid = pid or 4120
        return self.status()

    def status(self):
        f = next(i['file'] for i in self.instances()['instances'] if i['pid'] == self.pid)
        return {'connected': True, 'etabs': 'mock', 'pid': self.pid, 'file': f, 'analysed': self.locked}

    def model_info(self):
        own = [c['name'] for c in self.combos if c['name'] not in self.COMBOS]
        return {'combos': self.COMBOS + ['EQX RS', 'EQY RS', 'G+0.3Q+EX', 'G+0.3Q+EY', 'WX SLS', 'WY SLS'] + own, 'cases': [p['name'] for p in self.patterns] + ['Buckling']}

    def building(self, combos):
        """10-storey RC frame, 3.4 m ground storey + 3.2 m above, 24 x 18 m plan"""
        if not combos:
            raise BridgeError('Select at least one load combination')
        st, z = [], 0.0
        for i in range(10):
            h = 3.4 if i == 0 else 3.2
            z += h
            st.append({'name': f'Story{i + 1}', 'elev': round(z, 2), 'h': h})
        W = 9.2 * 24 * 18          # kN per floor (seismic mass, G + 0.3Q)
        H = st[-1]['elev']
        lat = {'EQX RS': ('X', 0.075, 1.0), 'EQY RS': ('Y', 0.068, 1.12), 'G+0.3Q+EX': ('X', 0.075, 1.0), 'G+0.3Q+EY': ('Y', 0.068, 1.12),
               'WX SLS': ('X', 0.012, 0.35), 'WY SLS': ('Y', 0.016, 0.42), 'ULS1 1.35G+1.5Q': (None, 0, 0), 'ULS2 1.35G+1.05Q+1.5W': ('X', 0.018, 0.5)}
        grav = {'ULS1 1.35G+1.5Q': 1.42, 'ULS2 1.35G+1.05Q+1.5W': 1.3, 'G+0.3Q+EX': 1.0, 'G+0.3Q+EY': 1.0, 'EQX RS': 0, 'EQY RS': 0, 'WX SLS': 0, 'WY SLS': 0,
                'SLS-CHAR G+Q': 1.1, 'SLS-QP G+0.3Q': 1.0}
        drifts, forces, torsion, base = [], [], [], []
        for c in combos:
            d, cs, k = lat.get(c, (None, 0, 0))
            g = grav.get(c, 1.0)
            step = 'Max' if 'RS' in c else ''
            V = cs * W * len(st)
            wsum = sum(s['elev'] for s in st)
            Fi = [V * s['elev'] / wsum for s in st]
            for i, s in enumerate(st):
                above = range(i, len(st))
                Vs = sum(Fi[j] for j in above)
                Ms = sum(Fi[j] * (st[j]['elev'] - s['elev'] + s['h']) for j in above)
                P = g * W * len(above) if g else 0
                prof = 1.25 - 0.55 * (i / (len(st) - 1)) ** 1.3
                dr = 0.0019 * k * prof * (1.15 if i == 0 else 1)
                if d:
                    drifts.append({'story': s['name'], 'combo': c, 'step': step, 'dir': d, 'drift': dr, 'label': '12'})
                    drifts.append({'story': s['name'], 'combo': c, 'step': step, 'dir': 'Y' if d == 'X' else 'X', 'drift': dr * 0.18, 'label': '12'})
                    rat = (1.12 if d == 'X' else 1.31) + (0.06 if i < 2 else 0) - 0.008 * i
                    torsion.append({'story': s['name'], 'combo': c, 'step': step, 'dir': d, 'max': dr * s['elev'] * rat, 'avg': dr * s['elev'], 'ratio': round(rat, 3)})
                forces.append({'story': s['name'], 'combo': c, 'step': step, 'loc': 'Bottom', 'P': P,
                               'VX': Vs if d == 'X' else 0.12 * Vs if d else 0, 'VY': Vs if d == 'Y' else 0.12 * Vs if d else 0, 'T': 0.05 * Vs * 24,
                               'MX': Ms if d == 'Y' else 0, 'MY': Ms if d == 'X' else 0})
            Mb = sum(Fi[j] * st[j]['elev'] for j in range(len(st)))
            base.append({'combo': c, 'step': step, 'FX': -V if d == 'X' else 0, 'FY': -V if d == 'Y' else 0, 'FZ': g * W * len(st),
                         'MX': Mb if d == 'Y' else 0, 'MY': Mb if d == 'X' else 0, 'MZ': 0})
        buck = [{'case': 'Buckling', 'mode': i + 1, 'factor': f} for i, f in enumerate([8.4, 9.1, 13.7, 21.5, 24.0, 33.2])]
        # 12 modes: Y, X, torsion, then the higher modes (participating mass ratios)
        mm = [(1.12, 0, .742, .004), (1.01, .728, 0, .006), (.86, .003, .004, .731), (.36, 0, .121, .002), (.33, .128, 0, .001), (.28, .002, .001, .119),
              (.20, 0, .044, .001), (.18, .047, 0, 0), (.16, .001, .001, .043), (.14, 0, .021, 0), (.12, .022, 0, 0), (.11, 0, 0, .019)]
        modal, sx, sy, sr = [], 0, 0, 0
        for i, (T, ux, uy, rz) in enumerate(mm):
            sx, sy, sr = sx + ux, sy + uy, sr + rz
            modal.append({'case': 'Modal', 'mode': i + 1, 'T': T, 'Ux': ux, 'Uy': uy, 'Rz': rz, 'SumUx': sx, 'SumUy': sy, 'SumRz': sr})
        return {'file': self.status()['file'], 'stories': st, 'drifts': drifts, 'forces': forces, 'torsion': torsion, 'base': base, 'buckling': buck, 'modal': modal,
                'plan': {'Bx': 24, 'By': 18}}

    def selection(self):
        return {'items': [{'kind': 'beams', 'story': b[0], 'label': b[1]} for b in self.BEAMS if b[2] in self.SEL['frames']] +
                [{'kind': 'columns', 'story': c[0], 'label': c[1]} for c in self.COLS if c[2] in self.SEL['frames']] +
                [{'kind': 'reactions', 'story': j[0], 'label': j[1]} for j in self.JOINTS if j[2] in self.SEL['points']]}

    def results(self, combos, kinds, only_sel=False):
        # notional cases "N <pattern> X|Y": about 3 % of the gravity forces
        F = dict(self.F, **{c: 0.03 for c in combos if c.startswith('N ')})
        combos = [c for c in combos if c in F]
        if not combos:
            raise BridgeError('Select at least one load combination')
        fr = (lambda u: u in self.SEL['frames']) if only_sel else (lambda u: True)
        pt = (lambda u: u in self.SEL['points']) if only_sel else (lambda u: True)
        out = []
        rows = []
        if 'beams' in kinds:
            for st, b, u, L, k in self.BEAMS:
                if not fr(u):
                    continue
                for c in combos:
                    w = 48 * k * F[c]
                    for i in range(5):
                        x = L * i / 4
                        rows.append([st, b, u, c, 'Combination', '', x, 0, w * (L / 2 - x), 0, 2.1 * k, 0, w * x * (L - x) / 2 - w * L * L / 12])
        if rows:
            out.append({'name': 'Element Forces - Beams', 'rows': [[h or 'Beam' for h in FRAME_HEAD], FRAME_UNITS] + rows})
        rows = []
        if 'columns' in kinds:
            for st, cl, u, k in self.COLS:
                if not fr(u):
                    continue
                for c in combos:
                    f = F[c]
                    for i, x in enumerate([0, 1.75, 3.5]):
                        wm = 1.8 if 'W' in c else 1.0   # wind combination: larger moments, less axial load
                        rows.append([st, cl, u, c, 'Combination', '', x, -1500 * k * f, 22 * wm, 9 * wm, 0.4, 16 * wm * (1 - i), 58 * k * wm * (1 - 0.8 * i)])
        if rows:
            out.append({'name': 'Element Forces - Columns', 'rows': [[h or 'Column' for h in FRAME_HEAD], FRAME_UNITS] + rows})
        rows = []
        if 'reactions' in kinds:
            rows = [[st, j, u, c, 'Combination', '', 14, 8, 1650 * k * F[c], 25, 48, 0.2] for st, j, u, k in self.JOINTS if pt(u) for c in combos]
        if rows:
            out.append({'name': 'Joint Reactions', 'rows': [['Story', 'Label', 'Unique Name', 'Output Case', 'Case Type', 'Step Type', 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'],
                                                            ['', '', '', '', '', '', 'kN', 'kN', 'kN', 'kN-m', 'kN-m', 'kN-m']] + rows})
        if only_sel and not out:
            raise BridgeError('Nothing is selected in ETABS - select beams, columns, walls or support joints first.')
        return {'file': self.status()['file'], 'tables': out}


def make_handler(src, origins):
    class Handler(BaseHTTPRequestHandler):
        def cors(self):
            o = self.headers.get('Origin')
            if o and (o in origins or '*' in origins or o.startswith(('http://localhost:', 'http://127.0.0.1:'))):
                self.send_header('Access-Control-Allow-Origin', o)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Private-Network', 'true')

        def send(self, code, body):
            data = json.dumps(body, default=str).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.cors()
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

        def do_GET(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            try:
                if u.path == '/instances':
                    return self.send(200, src.instances())
                if u.path == '/connect':
                    pid = q.get('pid', ['0'])[0]
                    return self.send(200, dict(src.connect(int(pid) if pid.isdigit() else 0), bridge=VERSION))
                if u.path == '/selection':
                    return self.send(200, src.selection())
                if u.path == '/status':
                    return self.send(200, dict(src.status(), bridge=VERSION))
                if u.path == '/model':
                    return self.send(200, src.model_info())
                if u.path == '/modifiers':
                    return self.send(200, src.modifiers())
                if u.path == '/loads':
                    return self.send(200, src.loads())
                if u.path == '/building':
                    return self.send(200, src.building(q.get('c', [])))
                if u.path == '/results':
                    kinds = [k for k in q.get('k', KINDS) if k in KINDS]
                    return self.send(200, src.results(q.get('c', []), kinds, q.get('sel', ['0'])[0] == '1'))
                return self.send(404, {'error': 'unknown endpoint'})
            except BridgeError as e:
                return self.send(503, {'error': str(e)})
            except Exception as e:   # COM errors: report, keep serving
                traceback.print_exc()
                return self.send(500, {'error': f'{type(e).__name__}: {e}'})

        def allowed(self):
            o = self.headers.get('Origin')
            return bool(o) and (o in origins or '*' in origins or o.startswith(('http://localhost:', 'http://127.0.0.1:')))

        def do_POST(self):
            u = urlparse(self.path)
            # writes: only from an allowed page, only with a JSON body (a cross-site form cannot send one)
            if not self.allowed() or 'application/json' not in (self.headers.get('Content-Type') or ''):
                return self.send(403, {'error': 'Writing to ETABS is only allowed from the CAMBO STRUCT page.'})
            try:
                n = int(self.headers.get('Content-Length') or 0)
                if n > 2_000_000:
                    return self.send(413, {'error': 'request too large'})
                body = json.loads(self.rfile.read(n) or b'{}')
                if u.path == '/loads/apply':
                    return self.send(200, src.apply_loads(body))
                if u.path == '/loads/assign':
                    return self.send(200, src.assign_loads(body))
                return self.send(404, {'error': 'unknown endpoint'})
            except BridgeError as e:
                return self.send(409 if str(e).startswith('LOCKED') else 503, {'error': str(e)})
            except Exception as e:
                traceback.print_exc()
                return self.send(500, {'error': f'{type(e).__name__}: {e}'})

        def log_message(self, fmt, *args):
            sys.stderr.write('  ' + (fmt % args) + '\n')
    return Handler


def main():
    ap = argparse.ArgumentParser(description='CAMBO STRUCT - ETABS live link')
    ap.add_argument('--port', type=int, default=5480)
    ap.add_argument('--allow-origin', action='append', default=[], help='extra web origin allowed to read the results')
    ap.add_argument('--mock', action='store_true', help='serve demo results without ETABS')
    a = ap.parse_args()
    src = Mock() if a.mock else Etabs()
    if not a.mock:
        try:
            import comtypes
            comtypes.CoInitialize()
            found = src.instances()['instances']
            print('ETABS windows:', ', '.join(f"{i['file']} (pid {i['pid']})" for i in found) or 'none yet')
        except Exception as e:
            print('ETABS not reachable yet:', e)
    srv = HTTPServer(('127.0.0.1', a.port), make_handler(src, DEFAULT_ORIGINS + a.allow_origin))
    print(f'CAMBO STRUCT ETABS link {VERSION} on http://127.0.0.1:{a.port}  (Ctrl+C to stop)')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
