/* ============================================================
   catwifhat — scores-golf.js  (PGA Tour live leaderboard)
   100% client-side off ESPN's public golf scoreboard feed.
   Tap any player to expand a hole-by-hole scorecard (front/back
   nine, par + the player's score, colour-coded, round-toggle).
   ============================================================ */
(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const rowsEl = $("golf-rows");
  if (!rowsEl) return;

  const URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
  let timer = null;
  const expanded = {};   // id -> selected round index (or null for default)
  let state = { rows: [], round: 1 };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtTime(d) { try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function parDisp(s) { if (s == null || s === "") return "—"; s = String(s).trim(); if (s === "0" || s === "E") return "E"; return s; }
  function parNum(s) { if (s == null) return 999; s = String(s).trim(); if (s === "E" || s === "") return 0; const n = parseFloat(s.replace("+", "")); return isNaN(n) ? 999 : n; }
  function parClass(s) { if (s == null || s === "" || s === "—") return ""; const n = parNum(s); return n < 0 ? "is-under" : (n > 0 ? "is-over" : "is-even"); }
  function relNum(s) { if (s == null) return null; s = String(s).trim(); if (s === "E" || s === "") return 0; const n = parseInt(s, 10); return isNaN(n) ? null : n; }
  function holeClass(rel) { if (rel == null) return "hole--empty"; if (rel <= -2) return "hole--eagle"; if (rel === -1) return "hole--birdie"; if (rel === 0) return "hole--par"; if (rel === 1) return "hole--bogey"; return "hole--dbl"; }

  function roundOf(ev) { const c = (ev.competitions || [])[0] || {}; return (c.status || {}).period || 1; }

  function todayAndThru(c, round) {
    const rounds = c.linescores || [];
    let cur = rounds.filter(function (r) { return r.period === round; })[0];
    if (!cur) cur = rounds[rounds.length - 1];
    if (!cur) return { today: "—", thru: "—" };
    const holes = (cur.linescores || []).length;
    return { today: parDisp(cur.displayValue), thru: holes >= 18 ? "F" : (holes > 0 ? String(holes) : "—") };
  }

  /* ---- expandable scorecard ---- */
  function playedRounds(c) {
    return (c.linescores || []).map(function (r, i) { return { r: r, i: i }; })
      .filter(function (o) { return ((o.r.linescores) || []).length > 0; });
  }
  function scorecardHtml(c, roundIdx) {
    const played = playedRounds(c);
    if (!played.length) return '<div class="sc" data-card-id="' + esc(String(c.id)) + '"><div class="sc__empty">This cat hasn\'t teed off yet — the scorecard fills in once they start. 🐾</div></div>';
    const rounds = c.linescores || [];
    let sel = roundIdx;
    if (sel == null || !((rounds[sel] || {}).linescores || []).length) sel = played[played.length - 1].i;
    const round = rounds[sel] || {};
    const byHole = {};
    (round.linescores || []).forEach(function (h) {
      const rel = relNum((h.scoreType || {}).displayValue), strokes = parseInt(h.displayValue, 10);
      byHole[h.period] = { strokes: isNaN(strokes) ? null : strokes, rel: rel, par: (rel != null && !isNaN(strokes)) ? strokes - rel : null };
    });
    function cell(n) {
      const d = byHole[n], cls = d ? holeClass(d.rel) : "hole--empty";
      const par = d && d.par != null ? "Par " + d.par : "·";
      const sc = d && d.strokes != null ? d.strokes : "–";
      return '<div class="hole ' + cls + '"><span class="hole__hd">' + n + " · " + par + '</span><span class="hole__sc">' + sc + "</span></div>";
    }
    function nine(a, b, label, title) {
      let cells = "", t = 0, done = 0;
      for (let n = a; n <= b; n++) { cells += cell(n); if (byHole[n] && byHole[n].strokes != null) { t += byHole[n].strokes; done++; } }
      const tot = done === (b - a + 1) ? label + " " + t : "";   // only show OUT/IN when the nine is complete
      return '<div class="sc__nine"><div class="sc__ninehd">' + title + " <span>" + tot + '</span></div><div class="sc__holes">' + cells + "</div></div>";
    }
    let tabs = "";
    if (played.length > 1) {
      tabs = '<div class="sc__rounds">' + played.map(function (o) {
        return '<button class="sc__rbtn' + (o.i === sel ? " is-active" : "") + '" data-round="' + o.i + '" type="button">R' + (o.r.period || (o.i + 1)) + "</button>";
      }).join("") + "</div>";
    }
    const legend = '<div class="sc__legend">' +
      '<span><i class="sc__dot" style="background:#ffe6b0"></i>Eagle</span>' +
      '<span><i class="sc__dot" style="background:#d3f1e0"></i>Birdie</span>' +
      '<span><i class="sc__dot" style="background:var(--cream-d)"></i>Par</span>' +
      '<span><i class="sc__dot" style="background:#ffdfdb"></i>Bogey</span>' +
      '<span><i class="sc__dot" style="background:#d9e4ff"></i>Dbl+</span></div>';
    return '<div class="sc" data-card-id="' + esc(String(c.id)) + '">' + tabs + nine(1, 9, "OUT", "Front nine") + nine(10, 18, "IN", "Back nine") + legend + "</div>";
  }

  function rowHtml(c, posLabel, round, open) {
    const a = c.athlete || {}, flag = (a.flag || {}).href || "", country = (a.flag || {}).alt || "";
    const tt = todayAndThru(c, round), total = parDisp(c.score);
    const badge = flag
      ? '<img class="lbrd__flag" src="' + esc(flag) + '" alt="' + esc(country) + '" loading="lazy"/>'
      : '<span class="lbrd__flag lbrd__flag--ph"></span>';
    return '<div class="lbrd__row' + (open ? " is-open" : "") + '" data-id="' + esc(String(c.id)) + '">' +
      '<span class="lbrd__c lbrd__c--pos">' + esc(posLabel) + "</span>" +
      '<span class="lbrd__c lbrd__c--player">' + badge + '<span class="lbrd__name">' + esc(a.displayName || "") + '</span><span class="lbrd__chev" aria-hidden="true">›</span></span>' +
      '<span class="lbrd__c lbrd__c--num ' + parClass(tt.today) + '">' + esc(tt.today) + "</span>" +
      '<span class="lbrd__c lbrd__c--num lbrd__thru">' + esc(tt.thru) + "</span>" +
      '<span class="lbrd__c lbrd__c--num lbrd__c--total ' + parClass(total) + '">' + esc(total) + "</span>" +
      "</div>";
  }

  function paint() {
    if (!state.rows.length) { rowsEl.innerHTML = '<p class="matches__empty">No players posted yet.</p>'; return; }
    rowsEl.innerHTML = state.rows.map(function (r) {
      const id = String(r.c.id), open = expanded.hasOwnProperty(id);
      let html = rowHtml(r.c, r.posLabel, state.round, open);
      if (open) html += scorecardHtml(r.c, expanded[id]);
      return html;
    }).join("");
  }

  rowsEl.addEventListener("click", function (e) {
    const rbtn = e.target.closest(".sc__rbtn");
    if (rbtn) {
      const card = rbtn.closest(".sc"); if (!card) return;
      expanded[card.getAttribute("data-card-id")] = parseInt(rbtn.getAttribute("data-round"), 10);
      paint(); return;
    }
    const row = e.target.closest(".lbrd__row");
    if (!row) return;
    const id = row.getAttribute("data-id");
    if (expanded.hasOwnProperty(id)) delete expanded[id]; else expanded[id] = null;
    paint();
  });

  function render(ev) {
    const c = (ev.competitions || [])[0] || {};
    const st = (ev.status || {}).type || (c.status || {}).type || {};
    const stateStr = st.state;

    $("golf-title").textContent = ev.shortName || ev.name || "PGA Tour";
    $("golf-state").textContent = (stateStr === "post" ? "Final" : (st.detail || st.shortDetail || (stateStr === "pre" ? "Upcoming" : "Live")));
    $("golf-live").hidden = stateStr !== "in";
    const badge = $("golf-badge"); if (badge) badge.classList.toggle("golfhead__badge--live", stateStr === "in");

    const v = c.venue || {}, ad = v.address || {};
    const where = [v.fullName, [ad.city, ad.state || ad.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    const vEl = $("golf-venue");
    if (where) { vEl.innerHTML = '<span aria-hidden="true">📍</span> ' + esc(where); vEl.hidden = false; } else { vEl.hidden = true; }

    const players = (c.competitors || []).slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); });
    const round = roundOf(ev);

    let lastScore = null, lastPos = 0;
    const pre = players.map(function (p, i) { const sc = p.score; let pos; if (sc === lastScore) pos = lastPos; else { pos = i + 1; lastPos = pos; lastScore = sc; } return { c: p, pos: pos }; });
    const counts = {}; pre.forEach(function (r) { counts[r.pos] = (counts[r.pos] || 0) + 1; });

    state = { round: round, rows: pre.map(function (r) { return { c: r.c, posLabel: (counts[r.pos] > 1 ? "T" : "") + r.pos }; }) };
    paint();

    $("golf-updated").textContent = "Updated " + fmtTime(new Date()) + " · auto-refreshing";
    clearTimeout(timer);
    timer = stateStr === "in" ? setTimeout(load, 30000) : null;
  }

  function load() {
    fetch(URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        const ev = (d && d.events || [])[0];
        if (!ev) { rowsEl.innerHTML = '<p class="matches__empty">No tournament in progress right now — the litter will be back for the next one. 🐾</p>'; $("golf-state").textContent = "No event"; $("golf-live").hidden = true; return; }
        render(ev);
      })
      .catch(function () { clearTimeout(timer); timer = setTimeout(load, 30000); });
  }

  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else load(); });
  load();
})();
