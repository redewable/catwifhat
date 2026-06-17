/* ============================================================
   catwifhat — scores-engine.js  ("The Scorebox")
   Shared live-scores engine for any sport. A per-sport page sets
   window.SCORE_CONFIG = { sport, league, compShort, teamCats } before
   loading this file. Data: ESPN public API (no key, CORS-enabled).
   ============================================================ */
(function () {
  "use strict";

  const sb = document.getElementById("sb");
  if (!sb) return;

  const CFG = window.SCORE_CONFIG || {};
  const SPORT = CFG.sport || "soccer";
  const LEAGUE = CFG.league || "fifa.world";
  const COMP = CFG.compShort || "";
  const TEAM_CATS = CFG.teamCats || {};
  const BASE = "https://site.api.espn.com/apis/site/v2/sports/" + SPORT + "/" + LEAGUE;

  // Stats shown in the live match-stats bar (besides the possession bar).
  const STAT_ROWS = [
    { name: "totalShots", label: "Shots" },
    { name: "shotsOnTarget", label: "On target" },
    { name: "wonCorners", label: "Corners" },
    { name: "foulsCommitted", label: "Fouls" },
  ];

  /* ---------- state ---------- */
  let currentDate = new Date();
  let featuredId = null;
  const eventsById = {};
  let sbTimer = null, ftTimer = null;
  let prevGoals = {};

  /* ---------- helpers ---------- */
  const $ = function (id) { return document.getElementById(id); };
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function isToday(d) { return d.toDateString() === new Date().toDateString(); }
  function dayLabel(d) { try { return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return d.toDateString(); } }
  function fmtTime(d) { try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function iconFor(t) { t = (t || "").toLowerCase(); if (t.indexOf("goal") > -1) return "⚽️"; if (t.indexOf("yellow") > -1) return "🟨"; if (t.indexOf("red") > -1) return "🟥"; if (t.indexOf("var") > -1) return "📺"; return "•"; }
  function isKey(t) { return /goal|yellow|red|penalt|var/i.test(t || ""); }
  function colorOf(team, fallback) {
    const c = (team || {}).color;
    if (!c) return fallback;
    const hex = "#" + String(c).replace("#", "");
    // guard against near-white team colors that vanish on cream
    const n = parseInt(hex.slice(1), 16);
    const lum = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114);
    return lum > 225 ? fallback : hex;
  }
  function teamImg(competitor) {
    const team = competitor.team || {};
    const ab = team.abbreviation || "";
    if (TEAM_CATS[ab]) return { src: TEAM_CATS[ab] + ".webp", isCat: true, base: TEAM_CATS[ab] };
    const logo = team.logo || ((team.logos || [])[0] || {}).href || "";
    return { src: logo, isCat: false, base: null };
  }
  function sides(ev) {
    const c = (ev.competitions || [])[0] || {};
    const list = c.competitors || [];
    const home = list.filter(function (x) { return x.homeAway === "home"; })[0] || list[0] || {};
    const away = list.filter(function (x) { return x.homeAway === "away"; })[0] || list[1] || {};
    return { comp: c, home: home, away: away, status: c.status || {} };
  }
  function stateOf(ev) { return ((((ev.competitions || [])[0] || {}).status || {}).type || {}).state; }

  /* ---------- featured scoreboard ---------- */
  function setBadge(imgEl, competitor) {
    const im = teamImg(competitor);
    if (im.src && !imgEl.src.endsWith(im.src)) imgEl.src = im.src;
    imgEl.classList.toggle("team__cat--flag", !im.isCat);
    imgEl.alt = ((competitor.team || {}).displayName || "") + (im.isCat ? " cat" : " flag");
  }
  function renderFeatured(ev) {
    const { home, away, status } = sides(ev);
    const stype = status.type || {};
    const state = stype.state;
    setBadge($("home-cat"), home);
    setBadge($("away-cat"), away);
    $("home-name").textContent = (home.team || {}).displayName || "";
    $("away-name").textContent = (away.team || {}).displayName || "";
    $("home-score").textContent = home.score != null && state !== "pre" ? home.score : "–";
    $("away-score").textContent = away.score != null && state !== "pre" ? away.score : "–";
    // tint the badge rings with team colors
    $("home-cat").style.borderColor = colorOf(home.team, "#da291c");
    $("away-cat").style.borderColor = colorOf(away.team, "#418fde");

    sb.dataset.state = state || "";
    const live = state === "in";
    $("livedot").hidden = !live;
    const detail = (stype.shortDetail || stype.detail || "").trim();
    let txt;
    if (live) txt = /ht|half/i.test(detail) ? "HALFTIME" : (status.displayClock || detail || "LIVE");
    else if (state === "post") txt = "FULL TIME";
    else { const dt = new Date(ev.date); txt = !isNaN(dt) ? "Kickoff " + fmtTime(dt) : (detail || "Scheduled"); }
    $("status-text").textContent = txt;
    $("sb-comp").textContent = COMP + " · " + ((ev.shortName || "").replace("@", "v"));
    renderPicks(ev, home, away);
  }

  /* ---------- featured detail: team-split key plays + live stats ---------- */
  function renderDetail(summary) {
    const comp = (summary.header && summary.header.competitions && summary.header.competitions[0]) || {};
    const cs = comp.competitors || [];
    const home = cs.filter(function (x) { return x.homeAway === "home"; })[0] || cs[0] || {};
    const away = cs.filter(function (x) { return x.homeAway === "away"; })[0] || cs[1] || {};
    const homeId = String((home.team || {}).id);
    const awayId = String((away.team || {}).id);
    const homeColor = colorOf(home.team, "#da291c");
    const awayColor = colorOf(away.team, "#418fde");

    const events = (summary.keyEvents || []).map(function (ev) {
      const typeText = (ev.type && ev.type.text) || "";
      const minute = (ev.clock && ev.clock.displayValue) || "";
      const who = (ev.participants || []).map(function (p) { return p.athlete && p.athlete.displayName; }).filter(Boolean);
      const tid = String((ev.team || {}).id);
      return { typeText: typeText, minute: minute, name: who[0] || "", icon: iconFor(typeText), side: tid === homeId ? "home" : (tid === awayId ? "away" : "") };
    }).filter(function (e) { return isKey(e.typeText) && e.minute; });

    renderPlayColumns(home, away, homeColor, awayColor, events);
    renderStats(summary, home, away, homeColor, awayColor);

    const goals = events.filter(function (e) { return /goal/i.test(e.typeText); }).length;
    if (prevGoals[featuredId] != null && goals > prevGoals[featuredId]) {
      sb.classList.remove("goal-flash"); void sb.offsetWidth; sb.classList.add("goal-flash");
      if (window.__wifToast) window.__wifToast("GOAL! ⚽️");
    }
    prevGoals[featuredId] = goals;
    $("updated").textContent = "Updated " + fmtTime(new Date()) + " · auto-refreshing";
  }

  function playLi(e, color) {
    const goal = /goal/i.test(e.typeText);
    return '<li class="play' + (goal ? " play--goal" : "") + '" style="border-color:' + color + '">' +
      '<span class="play__min" style="color:' + color + '">' + escapeHtml(e.minute) + "</span>" +
      '<span class="play__icon">' + e.icon + "</span>" +
      '<span class="play__txt"><b>' + escapeHtml(e.name) + "</b> " +
      '<span class="play__type">' + escapeHtml(e.typeText) + "</span></span></li>";
  }
  function colHead(competitor, color) {
    const im = teamImg(competitor);
    const cls = "plays__badge" + (im.isCat ? "" : " plays__badge--flag");
    return '<img class="' + cls + '" src="' + escapeHtml(im.src) + '" alt="" />' +
      '<span class="plays__team">' + escapeHtml((competitor.team || {}).displayName || "") + "</span>";
  }
  function renderPlayColumns(home, away, homeColor, awayColor, events) {
    $("plays-home-head").innerHTML = colHead(home, homeColor);
    $("plays-away-head").innerHTML = colHead(away, awayColor);
    $("plays-home-head").style.borderColor = homeColor;
    $("plays-away-head").style.borderColor = awayColor;
    const hl = events.filter(function (e) { return e.side === "home"; });
    const al = events.filter(function (e) { return e.side === "away"; });
    $("plays-home-list").innerHTML = hl.length ? hl.map(function (e) { return playLi(e, homeColor); }).join("") : '<li class="plays__empty">—</li>';
    $("plays-away-list").innerHTML = al.length ? al.map(function (e) { return playLi(e, awayColor); }).join("") : '<li class="plays__empty">—</li>';
  }

  function statMap(boxTeam) {
    const m = {};
    (boxTeam.statistics || []).forEach(function (s) { m[s.name] = s.displayValue; });
    return m;
  }
  function renderStats(summary, home, away, homeColor, awayColor) {
    const box = (summary.boxscore || {}).teams || [];
    const byId = {};
    box.forEach(function (t) { byId[String((t.team || {}).id)] = statMap(t); });
    const hs = byId[String((home.team || {}).id)];
    const as = byId[String((away.team || {}).id)];
    const panel = $("matchstats");
    if (!hs || !as || (hs.possessionPct == null && hs.totalShots == null)) {
      panel.innerHTML = '<div class="matchstats__pending">Live match stats appear after kickoff.</div>';
      return;
    }
    const hp = parseFloat(hs.possessionPct) || 50;
    const ap = parseFloat(as.possessionPct) || (100 - hp);
    let html =
      '<div class="matchstats__poss">' +
        '<span class="matchstats__possval" style="color:' + homeColor + '">' + Math.round(hp) + "%</span>" +
        '<span class="matchstats__posslabel">Possession</span>' +
        '<span class="matchstats__possval" style="color:' + awayColor + '">' + Math.round(ap) + "%</span>" +
      "</div>" +
      '<div class="matchstats__bar">' +
        '<span style="width:' + hp + "%;background:" + homeColor + '"></span>' +
        '<span style="width:' + ap + "%;background:" + awayColor + '"></span>' +
      "</div>";
    STAT_ROWS.forEach(function (row) {
      const h = hs[row.name] != null ? hs[row.name] : "0";
      const a = as[row.name] != null ? as[row.name] : "0";
      const hw = parseFloat(h) >= parseFloat(a);
      const aw = parseFloat(a) >= parseFloat(h);
      html +=
        '<div class="matchstats__row">' +
          '<span class="matchstats__v ' + (hw ? "is-lead" : "") + '">' + escapeHtml(h) + "</span>" +
          '<span class="matchstats__l">' + row.label + "</span>" +
          '<span class="matchstats__v ' + (aw ? "is-lead" : "") + '">' + escapeHtml(a) + "</span>" +
        "</div>";
    });
    panel.innerHTML = html;
  }

  /* ---------- who you got ---------- */
  function fillPick(side, competitor) {
    const im = teamImg(competitor);
    const name = (competitor.team || {}).displayName || "";
    const imgEl = $("pick-" + side + "-img");
    if (im.src) imgEl.src = im.src;
    imgEl.alt = name + (im.isCat ? " catwifhat" : "");
    imgEl.classList.toggle("is-flag", !im.isCat);
    $("pick-" + side + "-name").textContent = name;
    const dl = $("pick-" + side + "-dl");
    const soon = $("pick-" + side + "-soon");
    if (im.isCat) { dl.hidden = false; soon.hidden = true; dl.href = im.base + ".PNG"; dl.setAttribute("download", im.base + "wifhat-pfp.png"); }
    else { dl.hidden = true; soon.hidden = false; }
  }
  function renderPicks(ev, home, away) {
    fillPick("home", home);
    fillPick("away", away);
    let saved = null;
    try { saved = localStorage.getItem("wif-pick-" + ev.id); } catch (e) {}
    document.querySelectorAll(".pick").forEach(function (f) { f.classList.toggle("is-picked", saved && f.dataset.side === saved); });
    updateShare(saved, home, away);
  }
  function updateShare(saved, home, away) {
    const btn = $("pick-share");
    if (!btn) return;
    if (!saved) { btn.hidden = true; return; }
    const team = saved === "home" ? home : away;
    const name = (team.team || {}).displayName || "my team";
    btn.hidden = false;
    btn.dataset.text = "I'm rolling with " + name + " 🐱⚽ in the #catwifhat Scorebox\n$WIF, but on $USDC\ncatwifusdc.com";
  }
  document.querySelectorAll(".pick__choose").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const side = btn.dataset.side;
      document.querySelectorAll(".pick").forEach(function (f) { f.classList.toggle("is-picked", f.dataset.side === side); });
      try { if (featuredId) localStorage.setItem("wif-pick-" + featuredId, side); } catch (e) {}
      const ev = eventsById[featuredId];
      if (ev) { const s = sides(ev); updateShare(side, s.home, s.away); }
      const name = $("pick-" + side + "-name").textContent;
      if (window.__wifToast) window.__wifToast("You're rolling with " + name + "! 🐱");
    });
  });
  (function () {
    const btn = $("pick-share");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const text = btn.dataset.text || "Who you got? 🐱⚽ catwifusdc.com";
      const url = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
      if (navigator.share) { navigator.share({ text: text }).catch(function () { window.open(url, "_blank", "noopener"); }); }
      else window.open(url, "_blank", "noopener");
    });
  })();

  /* ---------- all-matches grid ---------- */
  function badgeHtml(competitor) {
    const im = teamImg(competitor);
    return '<img class="match__badge' + (im.isCat ? "" : " match__badge--flag") + '" src="' + escapeHtml(im.src) + '" alt="" loading="lazy" />';
  }
  function matchCard(ev) {
    const { home, away, status } = sides(ev);
    const stype = status.type || {};
    const state = stype.state;
    const ab = function (c) { return (c.team || {}).abbreviation || ""; };
    let big, small, smallCls;
    if (state === "in") { big = (home.score || 0) + "–" + (away.score || 0); small = /ht|half/i.test(stype.shortDetail || "") ? "HT" : (status.displayClock || "LIVE"); smallCls = "match__small--live"; }
    else if (state === "post") { big = (home.score || 0) + "–" + (away.score || 0); small = "FT"; smallCls = ""; }
    else { const dt = new Date(ev.date); big = "vs"; small = !isNaN(dt) ? fmtTime(dt) : "TBD"; smallCls = ""; }
    const cur = ev.id === featuredId ? " is-active" : "";
    return '<button class="match' + cur + '" type="button" data-id="' + ev.id + '">' +
      '<span class="match__side">' + badgeHtml(home) + '<span class="match__ab">' + escapeHtml(ab(home)) + "</span></span>" +
      '<span class="match__cen"><span class="match__big">' + escapeHtml(big) + "</span><span class=\"match__small " + smallCls + "\">" + escapeHtml(small) + "</span></span>" +
      '<span class="match__side match__side--r"><span class="match__ab">' + escapeHtml(ab(away)) + "</span>" + badgeHtml(away) + "</span></button>";
  }
  function renderGrid(events) {
    const wrap = $("matches");
    if (!events.length) { wrap.innerHTML = '<p class="matches__empty">No matches on this date.</p>'; return; }
    const rank = { in: 0, pre: 1, post: 2 };
    const sorted = events.slice().sort(function (a, b) {
      const ra = rank[stateOf(a)] != null ? rank[stateOf(a)] : 3, rb = rank[stateOf(b)] != null ? rank[stateOf(b)] : 3;
      return ra !== rb ? ra - rb : new Date(a.date) - new Date(b.date);
    });
    wrap.innerHTML = sorted.map(matchCard).join("");
    wrap.querySelectorAll(".match").forEach(function (card) {
      card.addEventListener("click", function () { if (eventsById[card.dataset.id]) selectFeatured(card.dataset.id); });
    });
  }
  function markActiveCard() { document.querySelectorAll(".match").forEach(function (c) { c.classList.toggle("is-active", c.dataset.id === featuredId); }); }

  /* ---------- featured selection ---------- */
  function selectFeatured(id) {
    if (!eventsById[id]) return;
    featuredId = id;
    $("matchstats").innerHTML = '<div class="matchstats__pending">Loading…</div>';
    $("plays-home-list").innerHTML = '<li class="plays__empty">…</li>';
    $("plays-away-list").innerHTML = '<li class="plays__empty">…</li>';
    renderFeatured(eventsById[id]);
    markActiveCard();
    clearTimeout(ftTimer); ftTimer = null;
    pollFeatured();
    try { $("sb").scrollIntoView({ block: "nearest" }); } catch (e) {}
  }
  function pickDefault(events) {
    const by = function (s) { return events.filter(function (e) { return stateOf(e) === s; }); };
    const live = by("in"); if (live.length) return live[0].id;
    const pre = by("pre").sort(function (a, b) { return new Date(a.date) - new Date(b.date); }); if (pre.length) return pre[0].id;
    const post = by("post").sort(function (a, b) { return new Date(b.date) - new Date(a.date); }); if (post.length) return post[0].id;
    return events[0] && events[0].id;
  }

  /* ---------- polling ---------- */
  function pollFeatured() {
    if (!featuredId) return;
    fetch(BASE + "/summary?event=" + featuredId, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (s) { renderDetail(s); const live = stateOf(eventsById[featuredId]) === "in"; clearTimeout(ftTimer); ftTimer = live ? setTimeout(pollFeatured, 20000) : null; })
      .catch(function () { clearTimeout(ftTimer); ftTimer = setTimeout(pollFeatured, 20000); });
  }
  function pollScoreboard() {
    fetch(BASE + "/scoreboard?dates=" + ymd(currentDate), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        const events = data.events || [];
        for (const k in eventsById) delete eventsById[k];
        events.forEach(function (e) { eventsById[e.id] = e; });
        $("matches-day").textContent = "· " + dayLabel(currentDate);
        renderGrid(events);
        if (!featuredId || !eventsById[featuredId]) { const id = pickDefault(events); if (id) selectFeatured(id); else { sb.dataset.state = "empty"; $("status-text").textContent = "No match"; } }
        else { renderFeatured(eventsById[featuredId]); markActiveCard(); if (stateOf(eventsById[featuredId]) === "in" && !ftTimer) pollFeatured(); }
        const anyLive = events.some(function (e) { return stateOf(e) === "in"; });
        clearTimeout(sbTimer);
        sbTimer = (isToday(currentDate) || anyLive) ? setTimeout(pollScoreboard, 30000) : null;
      })
      .catch(function () { clearTimeout(sbTimer); sbTimer = setTimeout(pollScoreboard, 30000); });
  }
  function reload() {
    clearTimeout(sbTimer); clearTimeout(ftTimer); ftTimer = null; featuredId = null;
    $("date-label").textContent = isToday(currentDate) ? "Today · " + dayLabel(currentDate) : dayLabel(currentDate);
    pollScoreboard();
  }

  /* ---------- date nav + lifecycle ---------- */
  function shiftDay(delta) { const d = new Date(currentDate); d.setDate(d.getDate() + delta); currentDate = d; reload(); }
  $("date-prev").addEventListener("click", function () { shiftDay(-1); });
  $("date-next").addEventListener("click", function () { shiftDay(1); });
  $("date-today").addEventListener("click", function () { currentDate = new Date(); reload(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) { clearTimeout(sbTimer); clearTimeout(ftTimer); ftTimer = null; } else { pollScoreboard(); } });

  reload();
})();
