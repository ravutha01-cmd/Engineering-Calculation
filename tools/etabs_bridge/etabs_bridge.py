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
    GET /status                    ETABS version, model file, analysed or not
    GET /model                     load combinations and load cases
    GET /results?c=<combo>&c=...&k=beams&k=columns&k=braces&k=piers&k=reactions
                                   results as ETABS-style tables (header row, units row, rows)

Options: --port 5480   --allow-origin https://example.org (repeatable)   --mock (no ETABS, demo data)
"""
import argparse
import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = '1.0'
DEFAULT_ORIGINS = ['https://ravutha01-cmd.github.io', 'null']   # null = the app opened from a local file
KN_M_C = 6                                                    # eUnits.kN_m_C
ORIENT = {1: 'columns', 2: 'beams', 3: 'braces'}             # eFrameDesignOrientation
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

    def attach(self):
        if self.model is not None:
            try:
                self.model.GetModelFilename(True)
                return self.model
            except Exception:
                self.model = None
        try:
            import comtypes.client
        except ImportError:
            raise BridgeError('comtypes is not installed - run: pip install comtypes')
        obj = None
        try:
            helper = comtypes.client.CreateObject('ETABSv1.Helper')
            import comtypes.gen.ETABSv1 as etabs_v1
            helper = helper.QueryInterface(etabs_v1.cHelper)
            obj = helper.GetObject('CSI.ETABS.API.ETABSObject')
        except Exception:
            try:
                obj = comtypes.client.GetActiveObject('CSI.ETABS.API.ETABSObject')
            except Exception:
                obj = None
        if obj is None:
            raise BridgeError('No running ETABS found. Open ETABS with the model (ETABS v18 or later; if the API '
                              'is not registered run RegisterETABS.exe from the ETABS folder as administrator).')
        self.model = obj.SapModel
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
        return {'connected': True, 'etabs': ver, 'file': m.GetModelFilename(True) or '(unsaved model)', 'analysed': locked}

    def names(self, coll, what):
        out = ok(coll.GetNameList(0, []), what)
        return list(out[1] or []) if len(out) > 1 else []

    def model_info(self):
        m = self.attach()
        return {'combos': self.names(m.RespCombo, 'RespCombo.GetNameList'), 'cases': self.names(m.LoadCases, 'LoadCases.GetNameList')}

    def results(self, combos, kinds):
        m = self.attach()
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
                tables += self.frame_tables(m, kinds, ctype)
            if 'piers' in kinds:
                t = self.pier_table(m, ctype)
                if t:
                    tables.append(t)
            if 'reactions' in kinds:
                t = self.reaction_table(m, ctype)
                if t:
                    tables.append(t)
        finally:
            m.SetPresentUnits(old_units)
        return {'file': m.GetModelFilename(True), 'tables': tables}

    def frame_tables(self, m, kinds, ctype):
        r = ok(m.Results.FrameForce('All', 2, 0, [], [], [], [], [], [], [], [], [], [], [], [], []), 'Results.FrameForce')
        n, obj, obj_sta, _elm, _elm_sta, case, step_type, _step_num, P, V2, V3, T, M2, M3 = r
        info = {}
        rows = {k: [] for k in TABLES}
        for i in range(n):
            name = obj[i]
            if name not in info:
                label, story = ok(m.FrameObj.GetLabelFromName(name, '', ''), 'FrameObj.GetLabelFromName')[:2]
                orient = ok(m.FrameObj.GetDesignOrientation(name, 0), 'FrameObj.GetDesignOrientation')[0]
                info[name] = (label, story, ORIENT.get(int(orient)))
            label, story, kind = info[name]
            if kind not in kinds or kind not in rows:
                continue
            rows[kind].append([story, label, name, case[i], ctype(case[i]), step_type[i], obj_sta[i], P[i], V2[i], V3[i], T[i], M2[i], M3[i]])
        out = []
        for k, (title, head) in TABLES.items():
            if rows[k]:
                out.append({'name': title, 'rows': [[head if h is None else h for h in FRAME_HEAD], FRAME_UNITS] + rows[k]})
        return out

    def pier_table(self, m, ctype):
        try:
            r = ok(m.Results.PierForce(0, [], [], [], [], [], [], [], [], [], []), 'Results.PierForce')
        except BridgeError:
            return None
        n, story, pier, case, loc, P, V2, V3, T, M2, M3 = r
        if not n:
            return None
        rows = [[story[i], pier[i], case[i], ctype(case[i]), loc[i], P[i], V2[i], V3[i], T[i], M2[i], M3[i]] for i in range(n)]
        return {'name': 'Pier Forces', 'rows': [['Story', 'Pier', 'Output Case', 'Case Type', 'Location', 'P', 'V2', 'V3', 'T', 'M2', 'M3'],
                                                ['', '', '', '', '', 'kN', 'kN', 'kN', 'kN-m', 'kN-m', 'kN-m']] + rows}

    def reaction_table(self, m, ctype):
        r = ok(m.Results.JointReact('All', 2, 0, [], [], [], [], [], [], [], [], [], [], []), 'Results.JointReact')
        n, obj, _elm, case, step_type, _step_num, F1, F2, F3, M1, M2, M3 = r
        info = {}
        rows = []
        for i in range(n):
            name = obj[i]
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
    """Demo model with the same answers as a live ETABS (for testing without ETABS)."""
    COMBOS = ['ULS1 1.35G+1.5Q', 'ULS2 1.35G+1.05Q+1.5W', 'SLS-CHAR G+Q', 'SLS-QP G+0.3Q']
    F = {'ULS1 1.35G+1.5Q': 1, 'ULS2 1.35G+1.05Q+1.5W': 0.86, 'SLS-CHAR G+Q': 0.71, 'SLS-QP G+0.3Q': 0.55}

    def status(self):
        return {'connected': True, 'etabs': 'mock', 'file': r'C:\Projects\Demo\Tower-A.EDB', 'analysed': True}

    def model_info(self):
        return {'combos': self.COMBOS, 'cases': ['Dead', 'Live', 'Wind X']}

    def results(self, combos, kinds):
        combos = [c for c in combos if c in self.F]
        if not combos:
            raise BridgeError('Select at least one load combination')
        out = []
        if 'beams' in kinds:
            rows = []
            for st, b, L, k in [('Story3', 'B12', 7.2, 1.0), ('Story3', 'B13', 6.0, 0.8), ('Story2', 'B12', 7.2, 1.05)]:
                for c in combos:
                    w = 48 * k * self.F[c]
                    for i in range(5):
                        x = L * i / 4
                        rows.append([st, b, '10' + b[-1], c, 'Combination', '', x, 0, w * (L / 2 - x), 0, 2.1 * k, 0, w * x * (L - x) / 2 - w * L * L / 12])
            out.append({'name': 'Element Forces - Beams', 'rows': [[h or 'Beam' for h in FRAME_HEAD], FRAME_UNITS] + rows})
        if 'columns' in kinds:
            rows = []
            for st, cl, k in [('Story2', 'C3', 1), ('Story1', 'C3', 1.6), ('Story1', 'C4', 1.25)]:
                for c in combos:
                    f = self.F[c]
                    for i, x in enumerate([0, 1.75, 3.5]):
                        rows.append([st, cl, '20' + cl[1:], c, 'Combination', '', x, -1500 * k * f, 22, 9, 0.4, 16 * (1 - i), 58 * k * (1 - 0.8 * i)])
            out.append({'name': 'Element Forces - Columns', 'rows': [[h or 'Column' for h in FRAME_HEAD], FRAME_UNITS] + rows})
        if 'reactions' in kinds:
            rows = [['Base', j, '3' + j[1:], c, 'Combination', '', 14, 8, 1650 * k * self.F[c], 25, 48, 0.2] for j, k in [('J1', 1), ('J2', 1.3)] for c in combos]
            out.append({'name': 'Joint Reactions', 'rows': [['Story', 'Label', 'Unique Name', 'Output Case', 'Case Type', 'Step Type', 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'],
                                                            ['', '', '', '', '', '', 'kN', 'kN', 'kN', 'kN-m', 'kN-m', 'kN-m']] + rows})
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
                if u.path == '/status':
                    return self.send(200, dict(src.status(), bridge=VERSION))
                if u.path == '/model':
                    return self.send(200, src.model_info())
                if u.path == '/results':
                    kinds = [k for k in q.get('k', KINDS) if k in KINDS]
                    return self.send(200, src.results(q.get('c', []), kinds))
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
            print('ETABS:', src.status()['file'])
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
