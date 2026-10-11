"""CAMBO STRUCT - ETABS live link (bridge between the web app and the ETABS API).

Run it on the Windows computer where ETABS is open:

    pip install comtypes
    python etabs_bridge.py

It attaches to the running ETABS instance through the CSI API (OAPI, ETABSv1), reads the load
combinations and the analysis results, and serves them to the CAMBO STRUCT page on
http://127.0.0.1:5480 (this computer only). In the app: Design with ETABS link -> Connect.

Read-only: the bridge never edits the model. While reading it switches the present units to
kN, m and selects the requested combinations for output, then restores the units.

Endpoints (JSON):
    GET /instances                 running ETABS windows (process id, model file)
    GET /connect?pid=<id>          link to that ETABS window (pid omitted: the first one found)
    GET /status                    ETABS version, model file, analysed or not
    GET /model                     load combinations and load cases
    GET /selection                 members selected in ETABS now (beams, columns, braces, piers, joints)
    GET /results?c=<combo>&c=...&k=beams&k=columns&k=braces&k=piers&k=reactions[&sel=1]
                                   results as ETABS-style tables (header row, units row, rows);
                                   sel=1: only the members selected in ETABS

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

VERSION = '1.1'
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

    def instances(self):
        return {'instances': [{'pid': 4120, 'file': r'C:\Projects\Demo\Tower-A.EDB', 'linked': self.pid == 4120},
                              {'pid': 5388, 'file': r'C:\Projects\Demo\Podium-B.EDB', 'linked': self.pid == 5388}]}

    def connect(self, pid):
        self.pid = pid or 4120
        return self.status()

    def status(self):
        f = next(i['file'] for i in self.instances()['instances'] if i['pid'] == self.pid)
        return {'connected': True, 'etabs': 'mock', 'pid': self.pid, 'file': f, 'analysed': True}

    def model_info(self):
        return {'combos': self.COMBOS, 'cases': ['Dead', 'Live', 'Wind X']}

    def selection(self):
        return {'items': [{'kind': 'beams', 'story': b[0], 'label': b[1]} for b in self.BEAMS if b[2] in self.SEL['frames']] +
                [{'kind': 'columns', 'story': c[0], 'label': c[1]} for c in self.COLS if c[2] in self.SEL['frames']] +
                [{'kind': 'reactions', 'story': j[0], 'label': j[1]} for j in self.JOINTS if j[2] in self.SEL['points']]}

    def results(self, combos, kinds, only_sel=False):
        combos = [c for c in combos if c in self.F]
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
                    w = 48 * k * self.F[c]
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
                    f = self.F[c]
                    for i, x in enumerate([0, 1.75, 3.5]):
                        rows.append([st, cl, u, c, 'Combination', '', x, -1500 * k * f, 22, 9, 0.4, 16 * (1 - i), 58 * k * (1 - 0.8 * i)])
        if rows:
            out.append({'name': 'Element Forces - Columns', 'rows': [[h or 'Column' for h in FRAME_HEAD], FRAME_UNITS] + rows})
        rows = []
        if 'reactions' in kinds:
            rows = [[st, j, u, c, 'Combination', '', 14, 8, 1650 * k * self.F[c], 25, 48, 0.2] for st, j, u, k in self.JOINTS if pt(u) for c in combos]
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
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
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
                if u.path == '/results':
                    kinds = [k for k in q.get('k', KINDS) if k in KINDS]
                    return self.send(200, src.results(q.get('c', []), kinds, q.get('sel', ['0'])[0] == '1'))
                return self.send(404, {'error': 'unknown endpoint'})
            except BridgeError as e:
                return self.send(503, {'error': str(e)})
            except Exception as e:   # COM errors: report, keep serving
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
