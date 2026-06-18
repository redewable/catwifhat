/* ============================================================
   catwifhat — analytics.js  (first-party, cookie-free event tracker)
   Sends events to /api/track (Supabase). Auto-captures the signals that
   matter for a meme coin: pageviews, traffic source (referrer + UTM),
   meme opens, PFP downloads/shares, poll votes, buy clicks, contract
   copies, scores-tab switches, scroll depth and time-on-page.
   Degrades silently if the backend isn't configured.
   ============================================================ */
(function () {
  "use strict";

  function rid() { try { return (crypto.getRandomValues(new Uint32Array(2)).join("")).slice(0, 16); } catch (e) { return String(Math.floor(Math.random() * 1e16)); } }
  function ls(k, mk) { try { var v = localStorage.getItem(k); if (!v) { v = mk(); localStorage.setItem(k, v); } return v; } catch (e) { return mk(); } }
  function ss(k, mk) { try { var v = sessionStorage.getItem(k); if (!v) { v = mk(); sessionStorage.setItem(k, v); } return v; } catch (e) { return mk(); } }

  var VISITOR = ls("wif_vid", rid);     // stable per browser (uniques)
  var SESSION = ss("wif_sid", rid);     // per tab session

  function slug() {
    var f = (location.pathname.split("/").pop() || "index.html").toLowerCase().replace(/\.html$/, "");
    if (!f || f === "index") f = "home";
    return f.replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "home";
  }
  function device() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        return Math.min(screen.width, screen.height) >= 600 ? "tablet" : "mobile";
      }
    } catch (e) {}
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ? "mobile" : "desktop";
  }
  function utm() {
    var q = new URLSearchParams(location.search);
    return { source: q.get("utm_source") || q.get("ref"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") };
  }

  var PAGE = slug(), DEV = device(), UTM = utm();
  var started = Date.now(), maxDepth = 0, leftSent = false;

  function send(type, meta) {
    var body = JSON.stringify({
      type: type, page: PAGE, session: SESSION, visitor: VISITOR,
      ref: document.referrer || "", utm: UTM, device: DEV, meta: meta || null
    });
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" })); return; }
    } catch (e) {}
    try { fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  window.__wifTrack = send;  // let page scripts log custom events too

  // ---- pageview ----
  send("pageview");

  // ---- interaction capture (event delegation, zero edits elsewhere) ----
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("a,button,[data-copy-ca],.meme-item,.pick__choose,.tab,.lbrd__row,.sportcard");
    if (!el) return;
    var href = (el.getAttribute && el.getAttribute("href")) || "";
    var id = el.id || "", cls = el.className && el.className.baseVal != null ? el.className.baseVal : (el.className || "");
    cls = String(cls);

    if (/pump\.fun/i.test(href)) send("buy_click", { href: href });
    else if (/dexscreener/i.test(href)) send("trade_click", { href: href });
    else if (el.hasAttribute && el.hasAttribute("data-copy-ca")) send("copy_contract");
    else if (el.closest && el.closest(".meme-item")) send("meme_open", { src: imgSrc(el) });
    else if (el.closest && el.closest(".banner-item")) send("banner_view", { src: imgSrc(el) });
    else if (id === "pfp-download") send("pfp_download");
    else if (cls.indexOf("pick__choose") > -1 || id === "poll-submit") send("poll_vote", { kind: "match" });
    else if (id === "pick-share" || id === "sb-share" || id === "champ-share" || id === "gpoll-share" || cls.indexOf("sc__share") > -1 || cls.indexOf("pfp__share") > -1 || id === "pfp-share") send("share_click", { id: id || cls });
    else if (cls.indexOf("tab") > -1 && el.dataset && el.dataset.tab) send("scores_tab", { tab: el.dataset.tab });
    else if (el.closest && el.closest(".sportcard") && el.closest(".sportcard").getAttribute("href")) send("sport_open", { href: el.closest(".sportcard").getAttribute("href") });
  }, true);

  function imgSrc(el) { var i = el.tagName === "IMG" ? el : (el.querySelector && el.querySelector("img")); return i ? (i.getAttribute("src") || "") : ""; }

  // selects (champion / golf winner / nation) fire on change, not click
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.id) return;
    if (t.id === "champ-select" && t.value) send("poll_vote", { kind: "champion", pick: t.value });
    else if (t.id === "gpoll-select" && t.value) send("poll_vote", { kind: "golf_winner" });
    else if (t.id === "pfp-nation") send("pfp_nation", { nation: t.value || "default" });
  });

  // ---- scroll depth ----
  window.addEventListener("scroll", function () {
    var h = document.documentElement, sc = h.scrollHeight - h.clientHeight;
    if (sc > 0) { var d = Math.round((h.scrollTop || document.body.scrollTop) / sc * 100); if (d > maxDepth) maxDepth = Math.min(100, d); }
  }, { passive: true });

  // ---- time on page + final depth (once, when leaving) ----
  function leave() {
    if (leftSent) return; leftSent = true;
    send("pageleave", { seconds: Math.round((Date.now() - started) / 1000), depth: maxDepth });
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) leave(); });
  window.addEventListener("pagehide", leave);
})();
