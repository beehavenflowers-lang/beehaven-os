/* Bee Haven / LCFG Operating System — cloud sync layer.
   Syncs each dashboard's browser data to your own Supabase, so it lives off your
   laptop and follows you to any device. No keys or code for you to touch — the
   keys live in sfb-config.js (written once by Claude Code). With no keys, this
   file does nothing and every dashboard stays purely local. Never edit this file. */
(function () {
  "use strict";

  // "← All dashboards" link back to the hub — on every dashboard except the hub itself.
  function addBackLink() {
    var p = location.pathname;
    if (/index\.html$/.test(p) || p.endsWith("/")) return;
    var a = document.createElement("a");
    a.href = "index.html";
    a.textContent = "← All dashboards";
    a.style.cssText = "position:fixed;top:12px;right:12px;z-index:9998;background:#526360;color:#faf9f6;font:600 12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:7px 12px;border-radius:8px;text-decoration:none;box-shadow:0 2px 8px rgba(82,99,96,.2);";
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addBackLink);
  else addBackLink();

  var PREFIX = "lcfg_";                 // only our OS keys are synced
  var url = window.SFB_SUPABASE_URL, key = window.SFB_SUPABASE_ANON_KEY;

  var sb = null, user = null, timers = {};

  // Capture every save from the moment the page loads (before dashboard scripts run).
  var origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (sb && user && k.indexOf(PREFIX) === 0) {
      clearTimeout(timers[k]);
      timers[k] = setTimeout(function () { push(k, v); }, 600);
    }
  };

  if (!url || !key) return;             // no cloud configured -> plain local mode

  var lib = document.createElement("script");
  lib.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  lib.onload = boot;
  document.head.appendChild(lib);

  async function boot() {
    sb = window.supabase.createClient(url, key);
    var res = await sb.auth.getSession();
    if (res.data && res.data.session) { user = res.data.session.user; await sync(); }
    else { showLogin(); }
  }

  async function push(k, v) {
    try {
      await sb.from("documents").upsert({
        user_id: user.id, doc_type: k, data: JSON.parse(v), updated_at: new Date().toISOString()
      });
      badge("Synced ✓");
    } catch (e) { /* keep local; try again next save */ }
  }

  async function sync() {
    try {
      var r = await sb.from("documents").select("doc_type,data").eq("user_id", user.id);
      var rows = (r && r.data) || [];
      if (rows.length === 0) { await pushAllLocal(); return; }   // first login: seed cloud from this device
      rows.forEach(function (row) { origSet(row.doc_type, JSON.stringify(row.data)); });
      if (!sessionStorage.getItem("sfb_synced")) {               // one reload so boards render with cloud data
        sessionStorage.setItem("sfb_synced", "1");
        location.reload();
      }
    } catch (e) {}
  }

  async function pushAllLocal() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf(PREFIX) === 0) {
        try {
          await sb.from("documents").upsert({
            user_id: user.id, doc_type: k, data: JSON.parse(localStorage.getItem(k)), updated_at: new Date().toISOString()
          });
        } catch (e) {}
      }
    }
    badge("Backed up ✓");
  }

  function badge(msg) {
    var b = document.getElementById("sfb-badge");
    if (!b) {
      b = document.createElement("div"); b.id = "sfb-badge";
      b.style.cssText = "position:fixed;bottom:14px;right:14px;background:#526360;color:#faf9f6;font:600 12px -apple-system,Segoe UI,sans-serif;padding:7px 12px;border-radius:8px;z-index:9999;opacity:0;transition:opacity .3s;";
      document.body.appendChild(b);
    }
    b.textContent = msg; b.style.opacity = "1";
    setTimeout(function () { b.style.opacity = "0"; }, 1500);
  }

  function showLogin() {
    var o = document.createElement("div");
    o.id = "sfb-login";
    o.style.cssText = "position:fixed;inset:0;background:#ebe6dc;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:-apple-system,Segoe UI,sans-serif;";
    o.innerHTML =
      '<div style="background:#faf9f6;border:1px solid #DCD1C7;border-radius:16px;padding:30px 28px;width:320px;text-align:center;box-shadow:0 8px 24px rgba(82,99,96,.18);">' +
      '<div style="font-size:20px;font-weight:600;color:#526360;margin-bottom:4px;">Your Operating System</div>' +
      '<div style="font-size:13px;color:#546461;margin-bottom:18px;line-height:1.5;">Sign in to load your dashboards. First time here? This creates your account.</div>' +
      '<input id="sfb-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #DCD1C7;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
      '<input id="sfb-pass" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #DCD1C7;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
      '<button id="sfb-go" style="width:100%;padding:11px;background:#526360;color:#faf9f6;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Sign in / Create account</button>' +
      '<div id="sfb-msg" style="font-size:12px;color:#9c5a4d;margin-top:10px;min-height:16px;"></div>' +
      '</div>';
    document.body.appendChild(o);
    document.getElementById("sfb-go").onclick = doLogin;
    document.getElementById("sfb-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  }

  async function doLogin() {
    var email = (document.getElementById("sfb-email").value || "").trim();
    var pass = document.getElementById("sfb-pass").value || "";
    var msg = document.getElementById("sfb-msg");
    if (!email || !pass) { msg.style.color = "#9c5a4d"; msg.textContent = "Enter an email and password."; return; }
    msg.style.color = "#546461"; msg.textContent = "Working…";
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (r.error) {                                    // no account yet -> create one, then sign in
      var s = await sb.auth.signUp({ email: email, password: pass });
      if (s.error) { msg.style.color = "#9c5a4d"; msg.textContent = s.error.message; return; }
      r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) { msg.style.color = "#9c5a4d"; msg.textContent = r.error.message; return; }
    }
    user = r.data.user;
    var el = document.getElementById("sfb-login"); if (el) el.remove();
    await sync();
  }
})();
