/* ============================================================
   catwifhat — scores-golf.js  (PGA Tour live leaderboard)
   100% client-side off ESPN's public golf scoreboard feed.
   ============================================================ */
(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  if (!$("golf-rows")) return;

  const URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
  let timer = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtTime(d) { try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function parDisp(s) { if (s == null || s === "") return "—"; s = String(s).trim(); if (s === "0" || s === "E") return "E"; return s; }
  function parNum(s) { if (s == null) return 999; s = String(s).trim(); if (s === "E" || s === "") return 0; const n = parseFloat(s.replace("+", "")); return isNaN(n) ? 999 : n; }
  function parClass(s) { const n = parNum(s); if (s == null || s === "" || s === "—") return ""; return n < 0 ? "is-under" : (n > 0 ? "is-over" : "is-even"); }

  // current round number from the competition status
  function roundOf(ev) { const c = (ev.competitions || [])[0] || {}; return (c.status || {}).period || 1; }

  function todayAndThru(c, round) {
    const rounds = c.linescores || [];
    let cur = rounds.filter(function (r) { return r.period === round; })[0];
    if (!cur) cur = rounds[rounds.length - 1];
    if (!cur) return { today: "—", thru: "—" };
    const holes = (cur.linescores || []).length;
    let thru;
    if (holes >= 18) thru = "F";
    else if (holes > 0) thru = String(holes);
    else thru = "—";
    return { today: parDisp(cur.displayValue), thru: thru };
  }

  function rowHtml(c, posLabel, round) {
    const a = c.athlete || {}, flag = (a.flag || {}).href || "", country = (a.flag || {}).alt || "";
    const tt = todayAndThru(c, round);
    const total = parDisp(c.score);
    const badge = flag
      ? '<img class="lbrd__flag" src="' + esc(flag) + '" alt="' + esc(country) + '" loading="lazy"/>'
      : '<span class="lbrd__flag lbrd__flag--ph"></span>';
    return '<div class="lbrd__row">' +
      '<span class="lbrd__c lbrd__c--pos">' + esc(posLabel) + "</span>" +
      '<span class="lbrd__c lbrd__c--player">' + badge + '<span class="lbrd__name">' + esc(a.displayName || "") + "</span></span>" +
      '<span class="lbrd__c lbrd__c--num ' + parClass(tt.today) + '">' + esc(tt.today) + "</span>" +
      '<span class="lbrd__c lbrd__c--num lbrd__thru">' + esc(tt.thru) + "</span>" +
      '<span class="lbrd__c lbrd__c--num lbrd__c--total ' + parClass(total) + '">' + esc(total) + "</span>" +
      "</div>";
  }

  function render(ev) {
    const c = (ev.competitions || [])[0] || {};
    const st = (ev.status || {}).type || (c.status || {}).type || {};
    const state = st.state;

    $("golf-title").textContent = ev.shortName || ev.name || "PGA Tour";
    $("golf-state").textContent = (state === "post" ? "Final" : (st.detail || st.shortDetail || (state === "pre" ? "Upcoming" : "Live")));
    $("golf-live").hidden = state !== "in";
    const badge = $("golf-badge");
    if (badge) badge.classList.toggle("golfhead__badge--live", state === "in");

    const v = c.venue || {};
    const ad = v.address || {};
    const where = [v.fullName, [ad.city, ad.state || ad.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    const vEl = $("golf-venue");
    if (where) { vEl.innerHTML = '<span aria-hidden="true">📍</span> ' + esc(where); vEl.hidden = false; } else { vEl.hidden = true; }

    const players = (c.competitors || []).slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); });
    const round = roundOf(ev);

    // tie-aware position labels based on total score
    let lastScore = null, lastPos = 0;
    const rows = players.map(function (p, i) {
      const sc = p.score;
      let pos;
      if (sc === lastScore) pos = lastPos; else { pos = i + 1; lastPos = pos; lastScore = sc; }
      return { p: p, pos: pos };
    });
    // count ties per pos to add "T"
    const counts = {};
    rows.forEach(function (r) { counts[r.pos] = (counts[r.pos] || 0) + 1; });

    $("golf-rows").innerHTML = rows.length
      ? rows.map(function (r) {
          const label = (counts[r.pos] > 1 ? "T" : "") + r.pos;
          return rowHtml(r.p, label, round);
        }).join("")
      : '<p class="matches__empty">No players posted yet.</p>';

    $("golf-updated").textContent = "Updated " + fmtTime(new Date()) + " · auto-refreshing";

    clearTimeout(timer);
    timer = state === "in" ? setTimeout(load, 30000) : null;
  }

  function load() {
    fetch(URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        const ev = (d && d.events || [])[0];
        if (!ev) { $("golf-rows").innerHTML = '<p class="matches__empty">No tournament in progress right now. Check back soon.</p>'; $("golf-state").textContent = "No event"; $("golf-live").hidden = true; return; }
        render(ev);
      })
      .catch(function () { clearTimeout(timer); timer = setTimeout(load, 30000); });
  }

  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else load(); });
  load();
})();
