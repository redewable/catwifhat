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
  function tzAbbr(d) { try { const p = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(d).filter(function (x) { return x.type === "timeZoneName"; })[0]; return p ? p.value : ""; } catch (e) { return ""; } }
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
    else { const dt = new Date(ev.date); txt = !isNaN(dt) ? "Kickoff " + fmtTime(dt) + " " + tzAbbr(dt) : (detail || "Scheduled"); }
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
    renderStandings(summary);
    renderLineups(summary, home, away, homeColor, awayColor);

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
    refreshPoll(ev.id);
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
      votePoll(featuredId, side);
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
    preloadShareImgs(eventsById[id]);
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

  /* ---------- group standings ---------- */
  function renderStandings(summary) {
    const wrap = $("standings");
    if (!wrap) return;
    const g = ((summary.standings || {}).groups || [])[0];
    const entries = g && g.standings && g.standings.entries;
    if (!entries || !entries.length) { wrap.hidden = true; return; }
    $("standings-body").innerHTML = entries.map(function (e) {
      const get = function (n) { const s = (e.stats || []).filter(function (x) { return x.name === n; })[0]; return s ? s.displayValue : "0"; };
      const name = typeof e.team === "string" ? e.team : (e.team || {}).displayName || "";
      const logo = ((e.logo || [])[0] || {}).href || "";
      return "<tr><td class=\"standings__team\"><img class=\"standings__flag\" src=\"" + escapeHtml(logo) + "\" alt=\"\" loading=\"lazy\" />" + escapeHtml(name) + "</td>" +
        "<td>" + get("gamesPlayed") + "</td><td>" + get("wins") + "</td><td>" + get("ties") + "</td><td>" + get("losses") + "</td><td>" + get("pointDifferential") + "</td><td class=\"standings__pts\">" + get("points") + "</td></tr>";
    }).join("");
    wrap.hidden = false;
  }

  /* ---------- lineups (starting XI) ---------- */
  function renderLineups(summary, home, away, homeColor, awayColor) {
    const wrap = $("lineups");
    if (!wrap) return;
    const ros = summary.rosters || [];
    if (ros.length < 2) { wrap.hidden = true; return; }
    const byId = function (id) { return ros.filter(function (r) { return String((r.team || {}).id) === String(id); })[0]; };
    const hr = byId((home.team || {}).id) || ros[0];
    const ar = byId((away.team || {}).id) || ros[1];
    const xi = function (r) { return (r.roster || []).filter(function (p) { return p.starter; }); };
    if (!xi(hr).length && !xi(ar).length) { wrap.hidden = true; return; }
    const fmt = function (r) { return r.formation ? "(" + r.formation + ")" : ""; };
    const list = function (r) {
      return xi(r).map(function (p) {
        const pos = (p.position || {}).abbreviation || "";
        const nm = (p.athlete || {}).displayName || "";
        const j = p.jersey || "";
        return "<li><span class=\"lineups__pos\">" + escapeHtml(pos) + "</span><span class=\"lineups__num\">" + escapeHtml(j) + "</span> " + escapeHtml(nm) + "</li>";
      }).join("");
    };
    $("lineup-home-head").innerHTML = "<span style=\"color:" + homeColor + "\">●</span> " + escapeHtml((home.team || {}).displayName || "") + " <span class=\"whoyougot__hint\">" + fmt(hr) + "</span>";
    $("lineup-away-head").innerHTML = "<span style=\"color:" + awayColor + "\">●</span> " + escapeHtml((away.team || {}).displayName || "") + " <span class=\"whoyougot__hint\">" + fmt(ar) + "</span>";
    $("lineup-home").innerHTML = list(hr) || "<li class=\"plays__empty\">TBD</li>";
    $("lineup-away").innerHTML = list(ar) || "<li class=\"plays__empty\">TBD</li>";
    wrap.hidden = false;
  }

  /* ---------- shareable match card (canvas → PNG) ---------- */
  const shareImgs = { home: null, away: null };
  function preloadShareImgs(ev) {
    const s = sides(ev);
    [["home", s.home], ["away", s.away]].forEach(function (pair) {
      const im = teamImg(pair[1]);
      if (!im.src) { shareImgs[pair[0]] = null; return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.src = im.src;
      shareImgs[pair[0]] = { img: img, isCat: im.isCat };
    });
  }
  function clip(s, n) { s = s || ""; return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function drawBadge(ctx, entry, cx, cy, r, ring) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#fffaf4"; ctx.fill(); ctx.clip();
    const im = entry && entry.img;
    if (im && im.complete && im.naturalWidth) {
      if (entry.isCat) { const sc = (2 * r) / im.naturalWidth; ctx.drawImage(im, cx - r, cy - r, im.naturalWidth * sc, im.naturalHeight * sc); }
      else { const m = r * 0.5; ctx.drawImage(im, cx - r + m, cy - r + m, 2 * (r - m), 2 * (r - m)); }
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 9; ctx.strokeStyle = ring; ctx.stroke();
  }
  function buildShareCard(ev) {
    const s = sides(ev), home = s.home, away = s.away, status = s.status;
    const stype = status.type || {}, state = stype.state;
    const W = 1200, H = 630;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#efe7dc"); g.addColorStop(1, "#e2d6c9");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1814"; ctx.font = "800 34px Unbounded, Arial"; ctx.fillText("catwifhat · Scorebox", W / 2, 72);
    ctx.fillStyle = "rgba(26,24,20,0.5)"; ctx.font = "700 21px 'Hanken Grotesk', Arial"; ctx.fillText(COMP.toUpperCase(), W / 2, 104);
    const hC = colorOf(home.team, "#da291c"), aC = colorOf(away.team, "#418fde");
    drawBadge(ctx, shareImgs.home, 250, 300, 120, hC);
    drawBadge(ctx, shareImgs.away, 950, 300, 120, aC);
    ctx.fillStyle = "#1a1814"; ctx.font = "800 38px Unbounded, Arial";
    ctx.fillText(clip((home.team || {}).displayName, 16), 250, 478);
    ctx.fillText(clip((away.team || {}).displayName, 16), 950, 478);
    const hs = home.score != null && state !== "pre" ? home.score : "–";
    const as = away.score != null && state !== "pre" ? away.score : "–";
    ctx.font = "900 128px Unbounded, Arial"; ctx.fillStyle = "#1a1814"; ctx.fillText(hs + "   :   " + as, W / 2, 330);
    let st; if (state === "in") st = status.displayClock || "LIVE"; else if (state === "post") st = "FULL TIME"; else { const dt = new Date(ev.date); st = !isNaN(dt) ? "Kickoff " + fmtTime(dt) : "Scheduled"; }
    ctx.font = "800 30px 'Hanken Grotesk', Arial"; ctx.fillStyle = state === "in" ? "#d8483c" : "rgba(26,24,20,0.7)"; ctx.fillText((state === "in" ? "● " : "") + st, W / 2, 398);
    ctx.fillStyle = "rgba(26,24,20,0.55)"; ctx.font = "700 26px 'Hanken Grotesk', Arial"; ctx.fillText("$WIF, but on $USDC · catwifusdc.com", W / 2, 582);
    return cv;
  }
  function dataUrlToFile(dataUrl, name) {
    const arr = dataUrl.split(","), mime = (arr[0].match(/:(.*?);/) || [])[1] || "image/png";
    const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new File([u8], name, { type: mime });
  }
  function shareCard() {
    const ev = eventsById[featuredId]; if (!ev) return;
    let url;
    try { url = buildShareCard(ev).toDataURL("image/png"); }
    catch (e) { if (window.__wifToast) window.__wifToast("Card not ready — try again"); return; }
    const s = sides(ev);
    const text = ((s.home.team || {}).displayName || "") + " vs " + ((s.away.team || {}).displayName || "") + " 🐱⚽ #catwifhat Scorebox\ncatwifusdc.com";
    const file = dataUrlToFile(url, "catwifhat-scorebox.png");
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: text }).then(function () { if (window.__wifToast) window.__wifToast("shared!"); }).catch(function () {});
    } else {
      const a = document.createElement("a"); a.href = url; a.download = "catwifhat-scorebox.png"; document.body.appendChild(a); a.click(); a.remove();
      if (window.__wifToast) window.__wifToast("Card saved — drop it on X!");
    }
  }
  (function () { const b = $("sb-share"); if (b) b.addEventListener("click", shareCard); })();

  /* ---------- global "who you got" poll (needs /api/poll backend) ---------- */
  const POLL_API = "/api/poll";
  function refreshPoll(eventId) {
    fetch(POLL_API + "?event=" + encodeURIComponent(eventId), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).then(renderPoll).catch(function () { renderPoll(null); });
  }
  function votePoll(eventId, side) {
    fetch(POLL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: eventId, side: side }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(renderPoll).catch(function () {});
  }
  function renderPoll(d) {
    const wrap = $("poll"); if (!wrap) return;
    if (!d || (d.home == null && d.away == null)) { wrap.hidden = true; return; }
    const h = +d.home || 0, a = +d.away || 0, tot = h + a;
    const hp = tot ? Math.round(h / tot * 100) : 50;
    $("poll-home-fill").style.width = hp + "%";
    $("poll-away-fill").style.width = (100 - hp) + "%";
    $("poll-home-pct").textContent = hp + "%";
    $("poll-away-pct").textContent = (100 - hp) + "%";
    $("poll-total").textContent = tot.toLocaleString() + (tot === 1 ? " vote" : " votes");
    wrap.hidden = false;
  }

  /* ---------- predict the champion ---------- */
  (function champ() {
    const sel = $("champ-select"); if (!sel) return;
    const KEY = "wif-champ";
    // ESPN's /teams endpoint isn't CORS-enabled, so the 2026 field is baked in.
    const WC_TEAMS = [["ALG","Algeria"],["ARG","Argentina"],["AUS","Australia"],["AUT","Austria"],["BEL","Belgium"],["BIH","Bosnia-Herzegovina"],["BRA","Brazil"],["CAN","Canada"],["CPV","Cape Verde"],["COL","Colombia"],["COD","Congo DR"],["CRO","Croatia"],["CUW","Curaçao"],["CZE","Czechia"],["ECU","Ecuador"],["EGY","Egypt"],["ENG","England"],["FRA","France"],["GER","Germany"],["GHA","Ghana"],["HAI","Haiti"],["IRN","Iran"],["IRQ","Iraq"],["CIV","Ivory Coast"],["JPN","Japan"],["JOR","Jordan"],["MEX","Mexico"],["MAR","Morocco"],["NED","Netherlands"],["NZL","New Zealand"],["NOR","Norway"],["PAN","Panama"],["PAR","Paraguay"],["POR","Portugal"],["QAT","Qatar"],["KSA","Saudi Arabia"],["SCO","Scotland"],["SEN","Senegal"],["RSA","South Africa"],["KOR","South Korea"],["ESP","Spain"],["SWE","Sweden"],["SUI","Switzerland"],["TUN","Tunisia"],["TUR","Türkiye"],["USA","United States"],["URU","Uruguay"],["UZB","Uzbekistan"]];
    const nameByAbbr = {};
    WC_TEAMS.forEach(function (t) { nameByAbbr[t[0]] = t[1]; const o = document.createElement("option"); o.value = t[0]; o.textContent = t[1]; sel.appendChild(o); });
    function show(val) {
      const name = nameByAbbr[val] || val;
      $("champ-saved").hidden = false; $("champ-saved").textContent = "🏆 Your pick: " + name;
      const sbtn = $("champ-share"); sbtn.hidden = false;
      sbtn.dataset.text = "My #catwifhat World Cup champion: " + name + " 🏆🐱\n$WIF, but on $USDC\ncatwifusdc.com";
    }
    (function () { let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {} if (saved) { sel.value = saved; show(saved); } })();
    sel.addEventListener("change", function () {
      if (!sel.value) return;
      try { localStorage.setItem(KEY, sel.value); } catch (e) {}
      show(sel.value);
      if (window.__wifToast) window.__wifToast("Champion locked 🏆");
    });
    $("champ-share").addEventListener("click", function () {
      const text = $("champ-share").dataset.text || "My pick 🏆 catwifusdc.com";
      const url = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
      if (navigator.share) navigator.share({ text: text }).catch(function () { window.open(url, "_blank", "noopener"); });
      else window.open(url, "_blank", "noopener");
    });
  })();

  /* ---------- date nav + lifecycle ---------- */
  function shiftDay(delta) { const d = new Date(currentDate); d.setDate(d.getDate() + delta); currentDate = d; reload(); }
  $("date-prev").addEventListener("click", function () { shiftDay(-1); });
  $("date-next").addEventListener("click", function () { shiftDay(1); });
  $("date-today").addEventListener("click", function () { currentDate = new Date(); reload(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) { clearTimeout(sbTimer); clearTimeout(ftTimer); ftTimer = null; } else { pollScoreboard(); } });

  reload();
})();
