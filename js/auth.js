/* Accounts: Demo (calculate, nothing saved) and Admin (data saved in the cloud database).
 *
 * The app is a static site, so the Admin database is a private GitHub Gist:
 *  - the GitHub token (gist scope) is encrypted in the browser with a key derived from the Admin
 *    password (PBKDF2-SHA256, 310 000 iterations -> AES-GCM); the password is never stored or sent;
 *  - the account record {user, salt, iter, check, vault} is stored in the gist (file cambo-account.json)
 *    and in this browser, so another device signs in with username + password (+ the gist id once).
 * In the Claude artifact the Claude login is the account (per-user private database).
 */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  const SKEY = 'cambo.session.v1', AKEY = 'cambo.accounts.v1';
  const ITER = 310000;
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = u8 => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };

  async function derive(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 512));
    return { key: bits.slice(0, 32), check: b64(await crypto.subtle.digest('SHA-256', bits.slice(32))) };
  }
  async function aes(keyBytes, usage) { return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [usage]); }
  async function seal(keyBytes, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(keyBytes, 'encrypt'), te.encode(JSON.stringify(obj)));
    return b64(iv) + '.' + b64(ct);
  }
  async function open(keyBytes, vault) {
    const [iv, ct] = vault.split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(iv) }, await aes(keyBytes, 'decrypt'), ub64(ct));
    return JSON.parse(td.decode(pt));
  }

  const GH = 'https://api.github.com/gists';
  const ACC_FILE = 'cambo-account.json', DATA_FILE = 'cambo-struct-data.json';
  async function gh(url, opt) {
    const r = await fetch(url, opt);
    if (!r.ok) throw new Error(r.status === 401 ? 'GitHub token rejected (401)' : r.status === 404 ? 'Gist not found (404)' : 'GitHub error ' + r.status);
    return r.json();
  }
  /* read the account record from a gist (secret gists are readable with their id) */
  async function fetchAccount(gistId) {
    const g = await gh(GH + '/' + encodeURIComponent(gistId), { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    const f = g.files && g.files[ACC_FILE];
    if (!f) throw new Error('This gist has no CAMBO STRUCT account');
    return JSON.parse(f.content);
  }

  const session = () => ls.get(SKEY);
  const role = () => (window.EC_EMBED ? 'admin' : (session() || {}).role || null);

  /* ---------- actions ---------- */
  async function createAdmin(user, password, token) {
    if (!user || !password || password.length < 8) throw new Error('Username and a password of at least 8 characters are required');
    if (!token) throw new Error('A GitHub token (gist permission) is required');
    const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    // keep the existing database gist of this browser if there is one
    const old = (ls.get('cambo.sync.v1') || {}).gistId;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const d = await derive(password, salt, ITER);
    let gistId = old || '';
    if (!gistId) {
      const g = await gh(GH, { method: 'POST', headers: H, body: JSON.stringify({ public: false, description: 'CAMBO STRUCT engineering database', files: { [DATA_FILE]: { content: '{}' } } }) });
      gistId = g.id;
    }
    const acc = { app: 'CAMBO STRUCT', user: user.trim(), role: 'admin', salt: b64(salt), iter: ITER, check: d.check, vault: await seal(d.key, { token, gistId }), gist: gistId, created: new Date().toISOString() };
    await gh(GH + '/' + gistId, { method: 'PATCH', headers: H, body: JSON.stringify({ files: { [ACC_FILE]: { content: JSON.stringify(acc, null, 1) } } }) });
    remember(acc);
    startSession(acc, token);
    return acc;
  }
  function remember(acc) {
    const all = ls.get(AKEY) || {};
    all[acc.user.toLowerCase()] = acc;
    ls.set(AKEY, all);
  }
  async function signIn(user, password, gistId) {
    const key = (user || '').trim().toLowerCase();
    let acc = (ls.get(AKEY) || {})[key];
    const dir = (EC.ACCOUNT_DIRECTORY || {})[key];
    const gid = (gistId || '').trim() || (acc && acc.gist) || dir;
    if (gid) { try { acc = await fetchAccount(gid); } catch (e) { if (!acc) throw e; } }
    if (!acc) throw new Error('Unknown account on this device - enter its Account ID (gist id)');
    if (acc.user.toLowerCase() !== key) throw new Error('Wrong username for this account');
    const d = await derive(password, ub64(acc.salt), acc.iter || ITER);
    if (d.check !== acc.check) throw new Error('Wrong password');
    const v = await open(d.key, acc.vault);
    remember(acc);
    startSession(acc, v.token, v.gistId);
    return acc;
  }
  function startSession(acc, token, gistId) {
    ls.set(SKEY, { role: 'admin', user: acc.user, gist: gistId || acc.gist, t: token, at: Date.now() });
  }
  function demo() { ls.set(SKEY, { role: 'demo', user: 'Demo', at: Date.now() }); }
  function signOut() { ls.del(SKEY); }

  /* ---------- sign-in screen ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function screen(msg) {
    const known = Object.values(ls.get(AKEY) || {});
    const hasLocalData = !!localStorage.getItem('cambo.ecw.v1');
    const el = document.createElement('div');
    el.className = 'auth-bg';
    el.innerHTML = `<div class="auth">
      <div class="auth-brand"><div class="logo">CS</div><div><b>CAMBO STRUCT</b><small>Engineering Design · Eurocodes</small></div></div>
      ${msg ? `<div class="auth-msg">${esc(msg)}</div>` : ''}
      <div class="auth-cards">
        <section class="auth-card">
          <h2>Demo account</h2>
          <p>Use every calculation. Nothing is saved: the data is lost when you close or reload the page.</p>
          <button class="btn" data-a="demo">Continue as Demo</button>
        </section>
        <section class="auth-card main">
          <h2>Admin sign in</h2>
          <p>Calculations and records are saved in your database and open the same on every device.</p>
          <form data-f="in">
            <label>Username<input name="u" autocomplete="username" required value="${esc(known[0] ? known[0].user : '')}"></label>
            <label>Password<input name="p" type="password" autocomplete="current-password" required></label>
            <details ${known.length ? '' : 'open'}><summary>First time on this device?</summary>
              <label>Account ID (gist id, shown in Project settings on your first device)<input name="g" autocomplete="off" placeholder="e.g. 3f2c…"></label></details>
            <button class="btn primary" type="submit">Sign in</button>
          </form>
          <details class="auth-new"><summary>Create the Admin account (once)</summary>
            <form data-f="new">
              <label>Username<input name="u" required value="admin"></label>
              <label>Password (min. 8 characters)<input name="p" type="password" autocomplete="new-password" minlength="8" required></label>
              <label>Repeat password<input name="p2" type="password" autocomplete="new-password" minlength="8" required></label>
              <label>GitHub token with the <b>gist</b> permission
                <input name="t" type="password" autocomplete="off" required placeholder="ghp_… or github_pat_…"></label>
              <p class="hint">Create it at github.com → Settings → Developer settings → Personal access tokens: tick only <b>gist</b>. It is encrypted with your password before it is stored.${hasLocalData ? ' The projects already in this browser become the Admin data.' : ''}</p>
              <button class="btn primary" type="submit">Create Admin account</button>
            </form>
          </details>
        </section>
      </div>
      <p class="auth-foot">Pro accounts with registration will come later.</p>
    </div>`;
    document.body.appendChild(el);
    const busy = (f, on) => { const b = f.querySelector('button[type=submit]'); b.disabled = on; b.textContent = on ? 'Please wait…' : b.dataset.t || b.textContent; };
    el.querySelectorAll('button[type=submit]').forEach(b => { b.dataset.t = b.textContent; });
    const err = m => { let x = el.querySelector('.auth-msg'); if (!x) { x = document.createElement('div'); x.className = 'auth-msg'; el.querySelector('.auth-brand').after(x); } x.textContent = m; };
    el.querySelector('[data-a="demo"]').onclick = () => { demo(); location.reload(); };
    el.querySelector('[data-f="in"]').onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target; busy(f, true);
      try { await signIn(f.u.value, f.p.value, f.g.value); location.reload(); } catch (e) { err(e.message); busy(f, false); }
    };
    el.querySelector('[data-f="new"]').onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target;
      if (f.p.value !== f.p2.value) return err('The passwords do not match');
      busy(f, true);
      try { await createAdmin(f.u.value, f.p.value, f.t.value.trim()); location.reload(); } catch (e) { err(e.message); busy(f, false); }
    };
    setTimeout(() => { const i = el.querySelector(known.length ? '[data-f="in"] [name=p]' : '[data-f="in"] [name=u]'); if (i) i.focus(); }, 50);
  }

  EC.auth = {
    role, session, signOut, screen,
    user: () => (window.EC_EMBED ? 'Claude account' : (session() || {}).user || ''),
    isDemo: () => role() === 'demo',
    gist: () => { const s = session(); return s && s.role === 'admin' ? { token: s.t, gistId: s.gist } : null; },
    accountId: () => (session() || {}).gist || ''
  };
})();
