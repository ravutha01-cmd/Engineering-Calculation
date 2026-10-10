/* Accounts: Demo (calculate, nothing saved) and Admin (data saved in the owner's Google Drive).
 *
 * Admin = Google sign-in (the database file lives in the signed-in account's own Drive, so only
 * that Google account can read it) + an app username / password that the owner sets on each device.
 * The password is never stored or published: only a PBKDF2-SHA256 check value is kept in this
 * browser. In the Claude artifact the Claude login is the account (private Claude storage).
 */
(function () {
  'use strict';
  const EC = window.EC = window.EC || {};
  const CFG = EC.CONFIG || {};
  const SKEY = 'cambo.session.v2', LKEY = 'cambo.adminlock.v1', TKEY = 'cambo.gtoken';
  const ITER = 310000;
  const te = new TextEncoder();
  const b64 = u8 => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const store = (st) => ({ get: k => { try { return JSON.parse(st.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }, del: k => { try { st.removeItem(k); } catch (e) { /* ignore */ } } });
  const ls = store(window.localStorage), ss = store(window.sessionStorage);

  async function check(user, password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(user.toLowerCase() + '\u0000' + password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256);
    return b64(await crypto.subtle.digest('SHA-256', bits));
  }

  /* ---------- Google sign-in (Google Identity Services token client) ---------- */
  const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email';
  let gis = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gis) return gis;
    gis = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gis = null; rej(new Error('Could not load Google sign-in')); };
      document.head.appendChild(s);
    });
    return gis;
  }
  /* must be called from a click (opens Google's sign-in window) */
  async function googleToken(hint) {
    if (!CFG.googleClientId) throw new Error('Google Drive is not set up yet: add the Google OAuth client ID to js/config.js (see README, "Accounts").');
    await loadGis();
    const tok = await new Promise((res, rej) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId, scope: SCOPES, hint: hint || undefined,
        callback: r => (r && r.access_token ? res(r) : rej(new Error((r && r.error) || 'Google sign-in cancelled'))),
        error_callback: e => rej(new Error((e && (e.message || e.type)) || 'Google sign-in failed'))
      });
      client.requestAccessToken({ prompt: '' });
    });
    const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } })).json();
    const allowed = (CFG.adminEmails || []).map(x => x.toLowerCase());
    if (allowed.length && !allowed.includes(String(info.email || '').toLowerCase())) {
      try { google.accounts.oauth2.revoke(tok.access_token, () => {}); } catch (e) { /* ignore */ }
      throw new Error('This Google account (' + (info.email || 'unknown') + ') is not allowed to use the Admin account.');
    }
    const t = { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 - 60000, email: info.email || '' };
    ss.set(TKEY, t);
    return t;
  }
  const token = () => { const t = ss.get(TKEY); return t && t.exp > Date.now() ? t : null; };

  /* ---------- session ---------- */
  const session = () => ls.get(SKEY);
  const role = () => (window.EC_EMBED ? 'admin' : (session() || {}).role || null);
  const lock = () => ls.get(LKEY);

  async function adminSignIn(user, password) {
    user = (user || '').trim();
    if (!user || !password) throw new Error('Enter the username and password');
    const L = lock();
    if (L) {
      if (L.user.toLowerCase() !== user.toLowerCase() || (await check(user, password, ub64(L.salt), L.iter)) !== L.check) throw new Error('Wrong username or password');
      const t = await googleToken(L.email || (CFG.adminEmails || [])[0]);
      if (L.email && t.email && t.email.toLowerCase() !== L.email.toLowerCase()) { ss.del(TKEY); throw new Error('This device is set up for ' + L.email + ' - sign in with that Google account'); }
    } else {
      // first Admin sign-in on this device: Google proves who you are, then the username / password are set
      const t = await googleToken((CFG.adminEmails || [])[0]);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      ls.set(LKEY, { user, salt: b64(salt), iter: ITER, check: await check(user, password, salt, ITER), email: t.email, set: new Date().toISOString() });
    }
    ls.set(SKEY, { role: 'admin', user, email: (lock() || {}).email || '', at: Date.now() });
  }
  function demo() { ls.set(SKEY, { role: 'demo', user: 'Demo', at: Date.now() }); }
  function signOut() {
    const t = ss.get(TKEY);
    if (t && window.google && google.accounts && google.accounts.oauth2) { try { google.accounts.oauth2.revoke(t.token, () => {}); } catch (e) { /* ignore */ } }
    ls.del(SKEY); ss.del(TKEY);
  }

  /* ---------- sign-in page ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function screen(msg) {
    const L = lock();
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
          <p>Calculations and records are saved in your <b>Google Drive</b> (folder “${esc(CFG.driveFolder || 'CAMBO STRUCT')}”) and open the same on every device.</p>
          <form data-f="in">
            <label>Username<input name="u" autocomplete="username" required value="${esc(L ? L.user : '')}"></label>
            <label>Password<input name="p" type="password" autocomplete="current-password" required></label>
            <p class="hint">${L ? `Then confirm with Google${L.email ? ' (' + esc(L.email) + ')' : ''}.` : 'First time on this device: choose your Admin username and password, then sign in with your Google account. Only that Google account can open the database.'}</p>
            <button class="btn primary" type="submit">${L ? 'Sign in' : 'Sign in with Google'}</button>
          </form>
        </section>
      </div>
      <p class="auth-foot">Pro accounts with registration will come later.</p>
    </div>`;
    document.body.appendChild(el);
    const err = m => { let x = el.querySelector('.auth-msg'); if (!x) { x = document.createElement('div'); x.className = 'auth-msg'; el.querySelector('.auth-brand').after(x); } x.textContent = m; };
    el.querySelector('[data-a="demo"]').onclick = () => { demo(); location.reload(); };
    const f = el.querySelector('[data-f="in"]'), btn = f.querySelector('button');
    f.onsubmit = async ev => {
      ev.preventDefault(); const t = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';
      try { await adminSignIn(f.u.value, f.p.value); location.reload(); } catch (e) { err(e.message); btn.disabled = false; btn.textContent = t; }
    };
    setTimeout(() => { const i = f.querySelector(L ? '[name=p]' : '[name=u]'); if (i) i.focus(); }, 50);
  }

  EC.auth = {
    role, session, signOut, screen, googleToken, token,
    user: () => (window.EC_EMBED ? 'Claude account' : (session() || {}).user || ''),
    email: () => (session() || {}).email || ((token() || {}).email || ''),
    isDemo: () => role() === 'demo'
  };
})();
