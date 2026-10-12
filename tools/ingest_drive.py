"""Turn Google Drive downloads of .mcdx files into sheets/*.js, update the catalog and the Drive index.

Usage:
  python3 -I tools/ingest_drive.py <work-dir> [changes.json]

<work-dir>     empty scratch folder; the .mcdx files are written to <work-dir>/mcdx
changes.json   optional list [{"file", "id", "folder", "modifiedTime"}] of the files that were
               downloaded; it updates tools/drive_index.json (lastSync = now).

The downloads are the JSON results of the Google Drive "download_file_content" tool
({content: base64, title}), saved by Claude Code under ~/.claude/projects/*/*/tool-results/.
Only worksheets that were downloaded are regenerated; every other sheet keeps its file.
"""
import base64, glob, json, os, sys, subprocess, datetime

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
work = sys.argv[1]
mdir = os.path.join(work, 'mcdx'); os.makedirs(mdir, exist_ok=True)
pat = os.path.expanduser('~/.claude/projects/*/*/tool-results/mcp-Google[_-]Drive-download_file_content-*.txt')
got = []
for f in sorted(glob.glob(pat.replace('[_-]','?')), key=os.path.getmtime):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    t = d.get('title', '')
    if t.endswith('.mcdx') and d.get('content'):
        open(os.path.join(mdir, t), 'wb').write(base64.b64decode(d['content']))
        got.append(t)
print('worksheets downloaded:', sorted(set(got)))
if got:
    subprocess.check_call([sys.executable, '-I', os.path.join(root, 'tools/mcdx2json.py'), mdir, os.path.join(root, 'sheets')])
idx_p = os.path.join(root, 'tools/drive_index.json')
idx = json.load(open(idx_p))
if len(sys.argv) > 2:
    for c in json.load(open(sys.argv[2])):
        idx['files'][c['file']] = {'id': c['id'], 'folder': c.get('folder', ''), 'modifiedTime': c['modifiedTime']}
    idx['lastSync'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    idx['files'] = dict(sorted(idx['files'].items()))
    json.dump(idx, open(idx_p, 'w'), indent=1)
subprocess.check_call([sys.executable, '-I', os.path.join(root, 'tools/catalog.py'), os.path.join(root, 'sheets'), os.path.join(root, 'js/mcad/catalog.js'), idx_p])
