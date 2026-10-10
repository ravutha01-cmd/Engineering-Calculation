"""Convert Mathcad Prime .mcdx worksheets into compact JSON for the web engine.

Usage: python tools/mcdx2json.py <dir-with-mcdx> <out-dir>

Each worksheet becomes <out>/<Name>.json:
  {file, title, regions:[...]}
Region kinds:
  {k:'t', h:html, y}                         text
  {k:'m', e:AST, c:bg, y, x}                 math (define / eval)
  {k:'p', tr:[{x:AST,y:AST,xu,yu,c,w,sym,ls}], ...}  xy plot
  {k:'a', r:[...], col:bool}                 collapsible area
  {k:'st', r:[math...]}                      spec table (columns of inputs)
AST (JSON arrays):
  number                 -> 1.5
  ['s', str]             string
  ['v', name]            variable
  ['u', name]            unit
  ['k', name]            keyword (if, root)
  ['f', name]            built-in function name
  ['o', op, a, b?]       operator
  ['c', fn, [args]]      call
  ['()', x]              parentheses
  ['M', r, c, [elems]]   matrix, row-major
  ['def', target, rhs]   definition; target ['v',n] | ['fn',n,[params]] | ['o','idx',..]
  ['ev', expr, unit|null, kind]  evaluation (display) ; kind 'eval'
  ['P', [stmts]]         program; stmts: ['ld',t,e] ['for',v,r,P] ['wh',c,P] ['if',c,P,P?] ['ret',e] ['try',P,P] ['brk'] ['cnt']
  ['rg', a, b] / ['rg3', a, a2, b]   range
  ['sum', expr]          vector sum  ;  ['sumi', var, lo, hi, expr]
  ['vec', expr]          vectorize
  ['cb', [names], [values], sel, scale?]   combo box (scale: unit AST or list per row)
"""
import zipfile, re, sys, os, json, io, html
import xml.etree.ElementTree as ET

ML = '{http://schemas.mathsoft.com/math50}'
WS = '{http://schemas.mathsoft.com/worksheet50}'
XAML = '{http://schemas.microsoft.com/winfx/2006/xaml/presentation}'
PW = '{clr-namespace:Ptc.Wpf;assembly=Ptc.Core}'

def local(t):
    return t.split('}', 1)[1] if '}' in t else t

def id_name(el):
    """Variable name: base + '_' + literal subscript (Span/Subscript or plain)."""
    span = None
    for ch in el:
        if local(ch.tag) == 'Span':
            span = ch
    if span is None:
        return (el.text or '').strip()
    out = span.text or ''
    for ch in span:
        if local(ch.tag) == 'Subscript':
            out += '_' + (ch.text or '')
        else:
            out += (ch.text or '')
        out += ch.tail or ''
    return out.strip()

OPS = {'plus': '+', 'minus': '-', 'mult': '*', 'div': '/', 'pow': '^', 'neg': 'neg',
       'nthRoot': 'nroot', 'sqrt': 'sqrt', 'absval': 'abs', 'equal': '==', 'notEqual': '!=',
       'lessThan': '<', 'greaterThan': '>', 'lessOrEqual': '<=', 'greaterOrEqual': '>=',
       'and': 'and', 'or': 'or', 'not': 'not', 'indexer': 'idx', 'matcol': 'col', 'matrow': 'row',
       'scale': '*', 'vectorize': 'vec', 'transpose': 'T', 'factorial': '!', 'crossProduct': 'x',
       'xor': 'xor', 'percent': '%'}

def conv(el):
    t = local(el.tag)
    ch = list(el)
    if t == 'real':
        v = el.text.strip()
        return float(v) if ('.' in v or 'e' in v.lower()) else int(v)
    if t == 'str':
        return ['s', el.text or '']
    if t == 'id':
        lab = el.get('labels', 'VARIABLE')
        n = id_name(el)
        if lab == 'UNIT': return ['u', n]
        if lab == 'KEYWORD': return ['k', n]
        if lab == 'FUNCTION': return ['f', n]
        return ['v', n]
    if t == 'parens':
        return ['()', conv(ch[0])]
    if t == 'placeholder':
        return None
    if t == 'sequence':
        return ['seq', [conv(c) for c in ch]]
    if t == 'apply':
        op = ch[0]; args = ch[1:]
        lo = local(op.tag)
        if lo == 'summation':
            lam = args[0]
            bv = [c for c in lam if local(c.tag) == 'boundVars'][0]
            body = [c for c in lam if local(c.tag) != 'boundVars'][0]
            bvar = [conv(c) for c in bv]
            lower = [c for c in args if local(c.tag) == 'lowerBound']
            upper = [c for c in args if local(c.tag) == 'upperBound']
            if bvar and bvar[0] is not None:
                lo_ = conv(list(lower[0])[0]) if lower else None
                hi_ = conv(list(upper[0])[0]) if upper and list(upper[0]) else None
                return ['sumi', bvar[0][1], lo_, hi_, conv(body)]
            return ['sum', conv(body)]
        if lo == 'product':
            lam = args[0]
            body = [c for c in lam if local(c.tag) != 'boundVars'][0]
            return ['prod', conv(body)]
        if lo in OPS:
            o = OPS[lo]
            a = [conv(c) for c in args]
            if o == 'vec':
                return ['vec', a[0]]
            if lo == 'scale':
                return ['o', '*', a[0], a[1]] if a[1] is not None else a[0]
            if o == 'idx' and a and isinstance(a[-1], list) and a[-1][0] == 'seq':
                return ['o', 'idx', a[0]] + a[-1][1]
            return ['o', o] + a
        # function / keyword call
        f = conv(op)
        a = []
        for c in args:
            v = conv(c)
            if isinstance(v, list) and v and v[0] == 'seq':
                a.extend(v[1])
            else:
                a.append(v)
        return ['c', f, a]
    if t == 'matrix':
        r = int(el.get('rows')); c = int(el.get('cols'))
        items = [conv(x) for x in ch if local(x.tag) != 'display']
        # Mathcad stores matrices column-major -> convert to row-major
        rm = [None] * (r * c)
        for j in range(c):
            for i in range(r):
                rm[i * c + j] = items[j * r + i]
        return ['M', r, c, rm]
    if t == 'define':
        tgt = ch[0]; rhs = ch[1]
        T = conv_target(tgt)
        return ['def', T, conv(rhs)]
    if t == 'eval':
        ex = conv(ch[0])
        uo = [c for c in ch if local(c.tag) == 'unitOverride']
        u = conv(list(uo[0])[0]) if uo and list(uo[0]) else None
        return ['ev', ex, u]
    if t == 'function':
        n = conv(ch[0])
        params = [conv(c) for c in ch[1]]
        return ['fn', n[1], [p[1] for p in params]]
    if t == 'program':
        return ['P', [stmt(c) for c in ch]]
    if t == 'range':
        a = [conv(c) for c in ch]
        if len(a) == 2: return ['rg', a[0], a[1]]
        return ['rg3', a[0], a[1], a[2]]
    if t == 'ComboBoxControl':
        names = [c.text or '' for c in el.find(ML + 'ComboBoxRowNames')]
        vals = [conv(c) for c in el.find(ML + 'ComboBoxValues')]
        sf = el.find(ML + 'ComboBoxScaleFactors')
        sfs = [conv(c) for c in sf] if sf is not None else []
        sfs = [x for x in sfs if x is not None]
        out = ['cb', names, vals, int(el.get('SelectedRow', '0'))]
        if sfs: out.append(sfs if len(sfs) > 1 else sfs[0])
        return out
    if t == 'lambda':
        body = [c for c in ch if local(c.tag) != 'boundVars'][0]
        return conv(body)
    if t == 'boundVars':
        return ['seq', [conv(c) for c in ch]]
    raise ValueError('unknown ml tag ' + t)

def conv_target(tgt):
    t = local(tgt.tag)
    if t == 'eval':  # define with display: x := expr = (rare form)
        return conv(tgt)
    return conv(tgt)

def stmt(el):
    t = local(el.tag); ch = list(el)
    if t == 'localDefine':
        return ['ld', conv(ch[0]), conv(ch[1])]
    if t == 'for':
        return ['for', conv(ch[0])[1], conv(ch[1]), conv(ch[2]) if local(ch[2].tag) == 'program' else ['P', [stmt(ch[2])]]]
    if t == 'while':
        return ['wh', conv(ch[0]), conv(ch[1]) if local(ch[1].tag) == 'program' else ['P', [stmt(ch[1])]]]
    if t == 'if':
        test = then = els = None
        for c in ch:
            lc = local(c.tag)
            if lc == 'test': test = conv(list(c)[0])
            elif lc == 'then': then = body(c)
            elif lc == 'else': els = body(c)
        return ['if', test, then, els]
    if t == 'return':
        return ['ret', conv(ch[0])]
    if t == 'tryCatch':
        return ['try', conv(ch[0]), conv(ch[1])]
    if t == 'break': return ['brk']
    if t == 'continue': return ['cnt']
    if t == 'program':
        return ['blk', conv(el)]
    return ['ex', conv(el)]

def body(c):
    kids = list(c)
    if len(kids) == 1 and local(kids[0].tag) == 'program':
        return conv(kids[0])
    return ['P', [stmt(k) for k in kids]]

def color(region_math):
    fo = region_math.find(WS + 'formattingOverride')
    if fo is None: fo = region_math.find('formattingOverride')
    for f in region_math.iter():
        if local(f.tag) == 'formattingOverride' and f.get('BackgroundColor'):
            return '#' + f.get('BackgroundColor')[3:]
    return None

def xaml_html(data):
    try:
        x = zipfile.ZipFile(io.BytesIO(data)).read('Xaml/Document.xaml').decode('utf-8-sig')
    except Exception:
        return ''
    root = ET.fromstring(x)
    out = []
    for p in root.iter(XAML + 'Paragraph'):
        parts = []
        for r in p:
            if local(r.tag) not in ('Run', 'Span', 'Bold', 'Italic'): continue
            txt = ''.join(r.itertext())
            if not txt: continue
            s = html.escape(txt).replace('\n', '<br>')
            st = r.get('style') or ''
            css = []
            if r.get('FontWeight') == 'Bold' or st.startswith('Heading'): s = '<b>' + s + '</b>'
            if r.get('FontStyle') == 'Italic': s = '<i>' + s + '</i>'
            fg = r.get('Foreground') or p.get('Foreground')
            if fg and fg.upper() not in ('#FF000000',): css.append('color:#' + fg[3:])
            bg = r.get('Background')
            if bg and not bg.startswith('#00'): css.append('background:#' + bg[3:])
            fs = r.get('FontSize')
            if fs:
                try:
                    f = float(fs)
                    if f >= 12.5: css.append('font-size:%.0f%%' % (f / 10.667 * 100))
                except ValueError: pass
            if (r.get('TextDecorations') or '').lower().startswith('underline'): s = '<u>' + s + '</u>'
            if css: s = '<span style="%s">' % ';'.join(css) + s + '</span>'
            parts.append(s)
        if parts:
            st = ''
            runs = [r for r in p if local(r.tag) == 'Run' and ''.join(r.itertext()).strip()]
            for r in runs:
                st = r.get('style') or st
            allb = runs and all(r.get('FontWeight') == 'Bold' for r in runs)
            fsz = max([float(r.get('FontSize') or 10.67) for r in runs] or [10.67])
            tag = 'p'
            if st == 'Heading 1' or (allb and fsz >= 15.5): tag = 'h2'
            elif st == 'Heading 2' or (allb and fsz >= 13.5): tag = 'h3'
            elif st in ('Heading 3', 'Title') or (allb and fsz >= 11.9): tag = 'h4'
            out.append('<%s>%s</%s>' % (tag, ''.join(parts), tag))
    return ''.join(out)

def kid(el, *names):
    """find a descendant path by local tag names (namespace-agnostic)"""
    cur = el
    for n in names:
        nxt = None
        if cur is None: return None
        for c in cur:
            if local(c.tag) == n: nxt = c; break
        cur = nxt
    return cur

def kids(el, name):
    return [c for c in el if local(c.tag) == name] if el is not None else []

def kid(el, *names):
    """descendant by local tag names (namespace-agnostic)"""
    cur = el
    for n in names:
        if cur is None: return None
        cur = next((c for c in cur if local(c.tag) == n), None)
    return cur

def kids(el, name):
    return [c for c in el if local(c.tag) == name] if el is not None else []

def plot(el, region):
    xy = kid(el, 'xyPlot')
    if xy is None: return None
    styles = [kid(t, 'traceStyle') for t in kids(kid(xy, 'traces'), 'trace')]
    xa = kid(xy, 'axes', 'xAxis'); ya = kid(xy, 'axes', 'yAxis')
    def eqs(ax):
        r = []
        for e in kids(kid(ax, 'plotEquations'), 'plotEquation'):
            ms = kids(e, 'math')
            ex = conv(list(ms[0])[0]) if ms and list(ms[0]) else None
            un = conv(list(ms[1])[0]) if len(ms) > 1 and list(ms[1]) else None
            r.append((ex, un))
        return r
    X = eqs(xa); Y = eqs(ya)
    traces = []
    for i in range(max(len(X), len(Y))):
        st = styles[i] if i < len(styles) else None
        x = X[i] if i < len(X) else (X[-1] if X else (None, None))
        y = Y[i] if i < len(Y) else (Y[-1] if Y else (None, None))
        traces.append({'x': x[0], 'xu': x[1], 'y': y[0], 'yu': y[1],
                       'c': ('#' + st.get('color')[3:]) if st is not None and st.get('color') else None,
                       'w': float(st.get('line-weight', 1)) if st is not None else 1,
                       'sym': st.get('symbol') if st is not None else 'none',
                       'ls': st.get('line-style') if st is not None else 'Solid'})
    def lim(ax):
        r = {}
        if ax is None: return r
        d = kid(ax, 'xyDomain')
        r['auto'] = (d.get('auto-scale') == 'true') if d is not None else True
        return r
    leg = kid(xy, 'legend')
    labels = [''.join(it.itertext()).strip() for it in leg.iter() if local(it.tag) == 'legend-label-item'] if leg is not None else []
    gs = kid(xy, 'graph-size')
    return {'k': 'p', 'tr': traces, 'xl': lim(xa), 'yl': lim(ya),
            'legend': labels if leg is not None and leg.get('display') == 'true' else [],
            'w': float(gs.get('width')) if gs is not None else 300.0,
            'h': float(gs.get('height')) if gs is not None else 300.0}

def regions(container, z, rels, errs):
    out = []
    for r in container:
        if local(r.tag) != 'region': continue
        y = float(r.get('top', 0)); x = float(r.get('left', 0))
        kid = list(r)[0] if list(r) else None
        if kid is None: continue
        k = local(kid.tag)
        try:
            if k == 'text':
                ref = kid.get('item-idref')
                h = ''
                if ref in rels:
                    try: h = xaml_html(z.read(rels[ref]))
                    except KeyError: h = ''
                if h: out.append({'k': 't', 'h': h, 'y': y, 'x': x})
            elif k == 'math':
                kids = [c for c in kid if local(c.tag) not in ('formattingOverride', 'resultFormat')]
                if not kids: continue
                e = conv(kids[0])
                d = {'k': 'm', 'e': e, 'y': y, 'x': x}
                if kid.get('resultRef'): d['rr'] = int(kid.get('resultRef'))
                c = color(kid)
                if c: d['c'] = c
                out.append(d)
            elif k == 'plot':
                p = plot(kid, r)
                if p: p['y'] = y; p['x'] = x; out.append(p)
            elif k == 'Area':
                sub = kid.find(WS + 'regions')
                if sub is None: sub = [c for c in kid if local(c.tag) == 'regions'][0]
                out.append({'k': 'a', 'r': regions(sub, z, rels, errs), 'col': kid.get('IsCollapsed') == 'true', 'y': y, 'x': x})
            elif k == 'spec-table':
                ms = []
                for m in kid:
                    if local(m.tag) == 'math':
                        ms.append({'k': 'm', 'e': conv(list(m)[0]), 'y': y, 'x': x, 'c': '#FFF2CC'})
                        if m.get('resultRef'): ms[-1]['rr'] = int(m.get('resultRef'))
                out.append({'k': 'st', 'r': ms, 'y': y, 'x': x})
        except Exception as ex:
            errs.append('%s region %s: %s' % (k, r.get('region-id'), ex))
    return out

def convert(path):
    z = zipfile.ZipFile(path)
    s = z.read('mathcad/worksheet.xml').decode('utf-8-sig')
    root = ET.fromstring(s)
    rels = {}
    try:
        rr = ET.fromstring(z.read('mathcad/_rels/worksheet.xml.rels').decode('utf-8-sig'))
        for rel in rr:
            rels[rel.get('Id')] = rel.get('Target').lstrip('/')
    except KeyError:
        pass
    errs = []
    regs = regions(root.find(WS + 'regions'), z, rels, errs)
    title = ''
    for r in regs:
        if r['k'] == 't':
            title = re.sub('<[^>]+>', '', r['h'])[:120]; break
    return {'file': os.path.basename(path), 'title': title, 'regions': regs}, errs



# ---------------------------------------------------------------- input metadata
def strip_tags(h):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', h))).strip()

def literal_kind(e):
    """Classify the right-hand side of a yellow definition. Returns (kind, value, unit) or None."""
    if isinstance(e, list) and e and e[0] == 'ev':
        e = e[1]
    if isinstance(e, (int, float)):
        return ('num', e, None)
    if not isinstance(e, list) or not e:
        return None
    if e[0] == 'o' and e[1] in ('neg', '-') and len(e) == 3 and isinstance(e[2], (int, float)):
        return ('num', -e[2], None)
    if e[0] == 's':
        return ('str', e[1], None)
    if e[0] == 'cb':
        return ('combo', e[3], None)
    if e[0] == 'o' and e[1] == '*' and len(e) == 4:
        a, u = e[2], e[3]
        if isinstance(a, list) and a[0] == 'o' and a[1] in ('neg', '-') and len(a) == 3 and isinstance(a[2], (int, float)):
            a = -a[2]
        if isinstance(a, (int, float)) and is_unit(u):
            return ('num', a, u)
        if isinstance(a, list) and a[0] == 'M' and all_lit(a) and is_unit(u):
            return ('mat', a, u)
    if e[0] == 'M' and all_lit(e):
        return ('mat', e, None)
    return None

def is_unit(u):
    if isinstance(u, list) and u:
        if u[0] == 'u': return True
        if u[0] == '()': return is_unit(u[1])
        if u[0] == 'o' and u[1] in ('*', '/') and len(u) == 4: return is_unit(u[2]) and (is_unit(u[3]) or isinstance(u[3], (int, float)))
        if u[0] == 'o' and u[1] == '^' and len(u) == 4: return is_unit(u[2]) and isinstance(u[3], (int, float))
    return False

def all_lit(m):
    for x in m[3]:
        if x is None or isinstance(x, (int, float)): continue
        if isinstance(x, list) and x[0] == 's': continue
        if isinstance(x, list) and x[0] == 'o' and x[1] in ('neg', '-') and len(x) == 3 and isinstance(x[2], (int, float)): continue
        return False
    return True

def add_meta(doc):
    flat = []
    stn = [0]
    def walk(rs, area=None):
        for r in sorted(rs, key=lambda r: (round(r['y'], 0), r['x'])):
            if r['k'] == 'st':
                stn[0] += 1
                for m in r['r']: m['_st'] = stn[0]
                walk(r['r'], r)
            elif r['k'] == 'a':
                walk(r['r'], r)
            else:
                flat.append(r)
    walk(doc['regions'])
    inputs = []
    heading = ''; sec = ''; top = ''
    texts = [r for r in flat if r['k'] == 't']
    for i, r in enumerate(flat):
        if r['k'] == 't':
            m = re.search(r'<h([234])>', r['h'])
            if m:
                if m.group(1) == '2': top = strip_tags(r['h'])[:80]; heading = ''
                elif m.group(1) == '3': sec = strip_tags(r['h'])[:80]; heading = sec
                else: heading = (sec + ' › ' if sec else '') + strip_tags(r['h'])[:80]
            continue
        if r['k'] != 'm' or (r.get('c') or '').upper() != '#FFF2CC':
            continue
        e = r['e']
        if e[0] != 'def' or e[1][0] != 'v':
            continue
        lk = literal_kind(e[2])
        if not lk:
            continue
        # label = text on the same row to the left
        lab = ''
        best = 1e9
        for t in texts:
            if t['x'] < r['x'] and abs(t['y'] - r['y']) < 14 and abs(t['y'] - r['y']) < best:
                best = abs(t['y'] - r['y']); lab = strip_tags(t['h'])
        d = {'n': e[1][1], 'l': lab[:160], 'g': heading, 'kind': lk[0]}
        if r.get('_st'): d['st'] = r.pop('_st')
        rhs = e[2][1] if isinstance(e[2], list) and e[2][0] == 'ev' else e[2]
        if lk[0] == 'num':
            d['v'] = lk[1]
            if lk[2] is not None: d['u'] = lk[2]
        elif lk[0] == 'str':
            d['v'] = lk[1]
        elif lk[0] == 'combo':
            d['v'] = lk[1]; d['opts'] = rhs[1]
        elif lk[0] == 'mat':
            d['v'] = lk[1]
            if lk[2] is not None: d['u'] = lk[2]
        inputs.append(d)
    for r in flat:
        r.pop('_st', None)
    doc['inputs'] = inputs
    return doc


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    tot = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith('.mcdx'): continue
        d, errs = convert(os.path.join(src, f))
        add_meta(d)
        name = f[:-5]
        js = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
        open(os.path.join(dst, name + '.js'), 'w', encoding='utf-8').write('EC_SHEET(%s,%s);\n' % (json.dumps(name), js))
        tot += len(js)
        if errs: print(f, len(errs), errs[:3])
    print('total bytes', tot)
