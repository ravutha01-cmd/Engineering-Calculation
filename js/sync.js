/* Autosave + cross-device sync.
 * Data is split into items: 'meta', 'p_<project>', 'e_<element>' (each with u = last change time).
 * Deleted items are kept as tombstones so another device does not bring them back.
 * Backends: Claude artifact database (per-user private storage) or a private GitHub Gist.
 */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  const LKEY = 'cambo.sync.v1';
  const st = { backend: null, label: 'This browser only', state: 'local', at: null, err: '', pending: false };
  let hooks = null; // { get: () => DB, set: DB => void, changed: () => void }
  let synced = {};  // key -> u last written/read from cloud
  let timer = null, busy = false, again = false;
  try { synced = JSON.parse(localStorage.getItem(LKEY) || '{}').synced || {}; } catch (e) { synced = {}; }
  const persist = () => { try { const o = JSON.parse(localStorage.getItem(LKEY) || '{}'); o.synced = synced; localStorage.setItem(LKEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  const cfg = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { return {}; } };
  const setCfg = o => { try { const c = cfg(); Object.assign(c, o); localStorage.setItem(LKEY, JSON.stringify(c)); } catch (e) { /* ignore */ } };

  /* ---------- DB <-> items ---------- */
  function toItems(DB) {
    const it = {};
    it.meta = { u: DB.metaU || 0, current: DB.current };
    (DB.projects || []).forEach((p, pi) => {
      const meta = Object.assign({}, p); delete meta.elements;
      it['p_' + p.id] = Object.assign(meta, { u: p.u || 0, order: pi });
      (p.elements || []).forEach((e, ei) => { it['e_' + e.id] = Object.assign({}, e, { pid: p.id, order: ei, u: e.u || 0 }); });
    });
    Object.keys(DB.tomb || {}).forEach(k => { if (!it[k] || (it[k].u || 0) < DB.tomb[k]) it[k] = { deleted: true, u: DB.tomb[k] }; });
    return it;
  }
  function fromItems(it) {
    const DB = { projects: [], tomb: {}, current: it.meta && it.meta.current, metaU: (it.meta && it.meta.u) || 0 };
    const ps = {}, els = [];
    Object.keys(it).forEach(k => {
      const v = it[k];
      if (!v || k === 'meta') return;
      if (v.deleted) { DB.tomb[k] = v.u; return; }
      if (k.startsWith('p_')) { const p = Object.assign({}, v); p.elements = []; ps[p.id] = p; }
      else if (k.startsWith('e_')) els.push(v);
    });
    els.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(e => {
      const p = ps[e.pid]; if (!p) return;
      const x = Object.assign({}, e); delete x.order; p.elements.push(x);
    });
    DB.projects = Object.values(ps).sort((a, b) => (a.order || 0) - (b.order || 0)).map(p => { delete p.order; return p; });
    return DB;
  }
  function merge(local, remote) {
    const out = Object.assign({}, local);
    let changed = false;
    Object.keys(remote).forEach(k => {
      const r = remote[k], l = local[k];
      if (!l || (r.u || 0) > (l.u || 0)) { out[k] = r; changed = true; }
    });
    return { items: out, changed };
  }

  /* ---------- backends ---------- */
  function artifactBackend(db, uid) {
    const col = db.collection('data/users/' + uid);
    return {
      label: 'Your Claude account', kind: 'cloud',
      async pull() {
        const snap = await col.get(); const it = {};
        snap.docs.forEach(d => { const v = d.data(); if (v) it[d.id] = v.j ? JSON.parse(v.j) : v; });
        return it;
      },
      async push(items, keys) {
        for (const k of keys) await col.doc(k).set({ j: JSON.stringify(items[k]), u: items[k].u || 0 });
      },
      watch(cb) { return col.onSnapshot(s => { if (!s.metadata.hasPendingWrites) cb(); }, () => {}); }
    };
  }
  function gistBackend(token, gistId) {
    const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    const FILE = 'cambo-struct-data.json';
    let id = gistId;
    return {
      label: 'GitHub Gist', kind: 'cloud',
      async pull() {
        if (!id) return {};
        const r = await fetch('https://api.github.com/gists/' + id, { headers: H, cache: 'no-store' });
        if (!r.ok) throw new Error('GitHub ' + r.status);
        const g = await r.json(); const f = g.files && g.files[FILE];
        if (!f) return {};
        let txt = f.content;
        if (f.truncated) txt = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
        return JSON.parse(txt || '{}');
      },
      async push(items) {
        const body = JSON.stringify({ files: { [FILE]: { content: JSON.stringify(items) } }, description: 'CAMBO STRUCT engineering data (auto-sync)' });
        if (!id) {
          const r = await fetch('https://api.github.com/gists', { method: 'POST', headers: H, body: JSON.stringify({ public: false, files: { [FILE]: { content: JSON.stringify(items) } }, description: 'CAMBO STRUCT engineering data (auto-sync)' }) });
          if (!r.ok) throw new Error('GitHub ' + r.status);
          id = (await r.json()).id; setCfg({ gistId: id });
          return;
        }
        const r = await fetch('https://api.github.com/gists/' + id, { method: 'PATCH', headers: H, body });
        if (!r.ok) throw new Error('GitHub ' + r.status);
      },
      watch(cb) { const t = setInterval(cb, 60000); window.addEventListener('focus', cb); return () => { clearInterval(t); window.removeEventListener('focus', cb); }; },
      wholeFile: true
    };
  }

  /* ---------- sync loop ---------- */
  function emit() { if (hooks && hooks.status) hooks.status(Object.assign({}, st)); }
  async function pullMerge() {
    const remote = await st.backend.pull();
    const local = toItems(hooks.get());
    const m = merge(local, remote);
    Object.keys(remote).forEach(k => { synced[k] = Math.max(synced[k] || 0, remote[k].u || 0); });
    persist();
    if (m.changed) hooks.set(fromItems(m.items));
    return m;
  }
  async function pushChanges() {
    const items = toItems(hooks.get());
    const keys = Object.keys(items).filter(k => (items[k].u || 0) > (synced[k] || 0));
    if (!keys.length) return 0;
    await st.backend.push(items, keys);
    keys.forEach(k => { synced[k] = items[k].u || 0; });
    persist();
    return keys.length;
  }
  async function cycle(pullFirst) {
    if (!st.backend || !hooks) return;
    if (busy) { again = true; return; }
    busy = true; st.state = 'syncing'; emit();
    try {
      if (pullFirst) await pullMerge();
      await pushChanges();
      st.state = 'synced'; st.at = new Date(); st.err = '';
    } catch (e) {
      st.state = 'error'; st.err = (e && (e.message || e.code)) || String(e);
    }
    busy = false; emit();
    if (again) { again = false; schedule(); }
  }
  function schedule(ms) { clearTimeout(timer); st.pending = true; timer = setTimeout(() => { st.pending = false; cycle(false); }, ms || 1200); }

  async function start(h) {
    hooks = h; emit();
    // 1) Claude artifact (per-user cloud storage)
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const db = await window.claude.use('db');
        const user = db ? await window.claude.use('user') : null;
        const uid = user && user.id ? await user.id() : null;
        if (db && uid) {
          st.backend = artifactBackend(db, uid); st.label = st.backend.label;
          await cycle(true);
          let wt = null;
          st.backend.watch(() => { clearTimeout(wt); wt = setTimeout(() => { if (!busy) pullMerge().then(m => { if (m.changed) emit(); }).catch(() => {}); }, 400); });
          return;
        }
      } catch (e) { st.err = e.message || String(e); }
    }
    // 2) GitHub Gist (when configured on this device)
    const a = EC.auth && EC.auth.gist && EC.auth.gist();
    const c = a && a.token ? { token: a.token, gistId: a.gistId } : cfg();
    if (c.token) {
      st.backend = gistBackend(c.token, c.gistId); st.label = 'Admin database (GitHub Gist)';
      await cycle(true);
      st.backend.watch(() => { if (!busy && !st.pending) cycle(true); });
      return;
    }
    st.state = 'local'; emit();
  }

  EC.sync = {
    start,
    changed() { if (st.backend) schedule(); },
    now() { return cycle(true); },
    status: () => Object.assign({}, st),
    gist: { get: () => ({ token: cfg().token ? '••••' + cfg().token.slice(-4) : '', gistId: cfg().gistId || '' }),
      async connect(token, gistId) { setCfg({ token, gistId: gistId || '' }); synced = {}; persist(); st.backend = gistBackend(token, gistId); st.label = 'GitHub Gist'; await cycle(true); return st; },
      disconnect() { const c = cfg(); delete c.token; delete c.gistId; localStorage.setItem(LKEY, JSON.stringify(c)); st.backend = null; st.state = 'local'; st.label = 'This browser only'; emit(); } },
    _toItems: toItems, _fromItems: fromItems, _merge: merge
  };
})();
