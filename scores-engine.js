/* ============================================================
   catwifhat — scores-engine.js  ("The Scorebox")
   Dual-mode, config-driven, 100% client-side off ESPN's public API.
     HOME mode  (page has #tabs): tabbed competition hub —
        Standings · Rankings · Bracket · Today · Calendar · Call it now
     GAME mode  (page has #sb, reads ?event=ID): full single-match detail.
   ============================================================ */
(function () {
  "use strict";

  const CFG = window.SCORE_CONFIG || {};
  const SPORT = CFG.sport || "soccer";
  const LEAGUE = CFG.league || "fifa.world";
  const COMP = CFG.compShort || "";
  const TEAM_CATS = CFG.teamCats || {};
  const BASE = "https://site.api.espn.com/apis/site/v2/sports/" + SPORT + "/" + LEAGUE;
  const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/" + LEAGUE + "/standings";

  const HOME = !!document.getElementById("tabs");
  const GAME = !HOME && !!document.getElementById("sb");
  if (!HOME && !GAME) return;

  /* ---------- helpers ---------- */
  const $ = function (id) { return document.getElementById(id); };
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function isToday(d) { return d.toDateString() === new Date().toDateString(); }
  function dayLabel(d) { try { return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return d.toDateString(); } }
  function fmtTime(d) { try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function tzAbbr(d) { try { const p = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(d).filter(function (x) { return x.type === "timeZoneName"; })[0]; return p ? p.value : ""; } catch (e) { return ""; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function svgIc(id, extra) { return '<svg class="ic' + (extra ? " " + extra : "") + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function iconFor(t) { t = (t || "").toLowerCase(); if (t.indexOf("goal") > -1) return svgIc("ic-goal"); if (t.indexOf("yellow") > -1) return svgIc("ic-card", "ic--yellow"); if (t.indexOf("red") > -1) return svgIc("ic-card", "ic--red"); if (t.indexOf("var") > -1) return svgIc("ic-var"); return "•"; }
  function isKey(t) { return /goal|yellow|red|penalt|var/i.test(t || ""); }
  function colorOf(team, fb) { const c = (team || {}).color; if (!c) return fb; const hex = "#" + String(c).replace("#", ""); const n = parseInt(hex.slice(1), 16); const lum = ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114); return lum > 225 ? fb : hex; }
  function teamImg(competitor) {
    const team = competitor.team || {};
    const ab = team.abbreviation || "";
    if (TEAM_CATS[ab]) return { src: TEAM_CATS[ab] + ".webp", isCat: true, base: TEAM_CATS[ab] };
    const logo = team.logo || ((team.logos || [])[0] || {}).href || "";
    return { src: logo, isCat: false, base: null };
  }
  function badgeFromTeam(team) {
    const ab = (team || {}).abbreviation || "";
    if (TEAM_CATS[ab]) return { src: TEAM_CATS[ab] + ".webp", flag: false };
    return { src: (team || {}).logo || (((team || {}).logos || [])[0] || {}).href || "", flag: true };
  }
  function sides(ev) {
    const c = (ev.competitions || [])[0] || {};
    const list = c.competitors || [];
    const home = list.filter(function (x) { return x.homeAway === "home"; })[0] || list[0] || {};
    const away = list.filter(function (x) { return x.homeAway === "away"; })[0] || list[1] || {};
    return { comp: c, home: home, away: away, status: c.status || {} };
  }
  function stateOf(ev) { return ((((ev.competitions || [])[0] || {}).status || {}).type || {}).state; }
  function gameHref(id) { return "scores-game.html?event=" + encodeURIComponent(id); }

  /* shared: a compact match card (links to the game page) */
  function badgeHtml(competitor) { const im = teamImg(competitor); return '<img class="match__badge' + (im.isCat ? "" : " match__badge--flag") + '" src="' + esc(im.src) + '" alt="" loading="lazy" />'; }
  function matchCard(ev) {
    const s = sides(ev), st = s.status.type || {}, state = st.state;
    const ab = function (c) { return (c.team || {}).abbreviation || ""; };
    let big, small, smallCls;
    if (state === "in") { big = (s.home.score || 0) + "–" + (s.away.score || 0); small = /ht|half/i.test(st.shortDetail || "") ? "HT" : (s.status.displayClock || "LIVE"); smallCls = "match__small--live"; }
    else if (state === "post") { big = (s.home.score || 0) + "–" + (s.away.score || 0); small = "FT"; smallCls = ""; }
    else { const dt = new Date(ev.date); big = "vs"; small = !isNaN(dt) ? fmtTime(dt) : "TBD"; smallCls = ""; }
    return '<a class="match" href="' + gameHref(ev.id) + '">' +
      '<span class="match__side">' + badgeHtml(s.home) + '<span class="match__ab">' + esc(ab(s.home)) + "</span></span>" +
      '<span class="match__cen"><span class="match__big">' + esc(big) + '</span><span class="match__small ' + smallCls + '">' + esc(small) + "</span></span>" +
      '<span class="match__side match__side--r"><span class="match__ab">' + esc(ab(s.away)) + "</span>" + badgeHtml(s.away) + "</span></a>";
  }
  function renderGrid(el, events, emptyMsg) {
    if (!el) return;
    if (!events.length) { el.innerHTML = '<p class="matches__empty">' + (emptyMsg || "No matches.") + "</p>"; return; }
    const rank = { in: 0, pre: 1, post: 2 };
    const sorted = events.slice().sort(function (a, b) { const ra = rank[stateOf(a)] != null ? rank[stateOf(a)] : 3, rb = rank[stateOf(b)] != null ? rank[stateOf(b)] : 3; return ra !== rb ? ra - rb : new Date(a.date) - new Date(b.date); });
    el.innerHTML = sorted.map(matchCard).join("");
  }
  function fetchScoreboard(date) { return fetch(BASE + "/scoreboard?dates=" + ymd(date), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return (d && d.events) || []; }); }

  /* ============================================================ HOME MODE */
  if (HOME) {
    let groupsData = [];
    let groupsTimer = null, todayTimer = null;
    let calDate = new Date();

    /* tabs */
    const tabs = document.querySelectorAll("#tabs .tab");
    const panels = document.querySelectorAll(".tabpanel");
    function showTab(name) {
      tabs.forEach(function (t) { t.classList.toggle("is-active", t.dataset.tab === name); t.setAttribute("aria-selected", String(t.dataset.tab === name)); });
      panels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
      try { history.replaceState(null, "", "#" + name); } catch (e) {}
    }
    tabs.forEach(function (t) { t.addEventListener("click", function () { showTab(t.dataset.tab); }); });

    /* standings + rankings (one fetch powers both) */
    function groupTable(child) {
      const entries = (child.standings || {}).entries || [];
      const rows = entries.map(function (e) {
        const get = function (ab) { const x = (e.stats || []).filter(function (s) { return s.abbreviation === ab; })[0]; return x ? x.displayValue : "0"; };
        const t = e.team || {}; const b = badgeFromTeam(t);
        return "<tr><td class=\"gtbl__team\"><img class=\"gtbl__badge" + (b.flag ? " gtbl__badge--flag" : "") + "\" src=\"" + esc(b.src) + "\" alt=\"\" loading=\"lazy\"/><span>" + esc(t.abbreviation || t.displayName || "") + "</span></td><td>" + get("GP") + "</td><td>" + get("W") + "</td><td>" + get("D") + "</td><td>" + get("L") + "</td><td>" + get("GD") + "</td><td class=\"gtbl__pts\">" + get("P") + "</td></tr>";
      }).join("");
      return "<div class=\"gtbl\"><div class=\"gtbl__name\">" + esc(child.name || "Group") + "</div><table><thead><tr><th class=\"gtbl__teamh\">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    }
    function renderStandings() {
      if (!groupsData.length) { $("groups-wrap").innerHTML = "<p class=\"matches__empty\">Standings unavailable.</p>"; return; }
      $("groups-wrap").innerHTML = groupsData.map(groupTable).join("");
    }
    function allTeams() {
      const out = [];
      groupsData.forEach(function (g) {
        ((g.standings || {}).entries || []).forEach(function (e) {
          const num = function (ab) { const x = (e.stats || []).filter(function (s) { return s.abbreviation === ab; })[0]; return x ? (parseFloat(String(x.displayValue).replace("+", "")) || 0) : 0; };
          out.push({ team: e.team || {}, P: num("P"), GP: num("GP"), W: num("W"), GD: num("GD"), F: num("F"), A: num("A") });
        });
      });
      return out;
    }
    function rankCard(title, sub, teams, valFn, valLabel) {
      const rows = teams.map(function (t, i) {
        const b = badgeFromTeam(t.team);
        return "<li><span class=\"rank__pos\">" + (i + 1) + "</span><img class=\"rank__badge" + (b.flag ? " rank__badge--flag" : "") + "\" src=\"" + esc(b.src) + "\" alt=\"\" loading=\"lazy\"/><span class=\"rank__name\">" + esc(t.team.displayName || t.team.abbreviation || "") + "</span><span class=\"rank__val\">" + esc(valFn(t)) + "</span></li>";
      }).join("");
      return "<div class=\"rankcard\"><div class=\"rankcard__h\">" + esc(title) + " <span>" + esc(sub) + "</span></div><ol class=\"rank__list\">" + rows + "</ol></div>";
    }
    function renderRankings() {
      const wrap = $("rankings-wrap"); if (!wrap) return;
      const teams = allTeams();
      if (!teams.length) { wrap.innerHTML = "<p class=\"matches__empty\">Rankings populate as matches are played.</p>"; return; }
      const power = teams.slice().sort(function (a, b) { return b.P - a.P || b.GD - a.GD || b.F - a.F; }).slice(0, 10);
      const attack = teams.slice().sort(function (a, b) { return b.F - a.F || b.GD - a.GD; }).slice(0, 10);
      const defense = teams.slice().filter(function (t) { return t.GP > 0; }).sort(function (a, b) { return a.A - b.A || b.GD - a.GD; }).slice(0, 10);
      wrap.innerHTML =
        rankCard("Power ranking", "pts · GD", power, function (t) { return t.P + " pts"; }) +
        rankCard("Best attack", "goals for", attack, function (t) { return String(t.F); }) +
        rankCard("Best defense", "goals against", defense, function (t) { return String(t.A); });
      const note = $("rankings-note"); if (note) note.hidden = false;
    }
    function fetchGroups() {
      fetch(STANDINGS_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        groupsData = (d && d.children) || [];
        renderStandings(); renderRankings();
      }).catch(function () { renderStandings(); });
      clearTimeout(groupsTimer); groupsTimer = setTimeout(fetchGroups, 300000);
    }

    /* today + calendar grids */
    function loadToday() {
      fetchScoreboard(new Date()).then(function (evs) { renderGrid($("matches-today"), evs, "No matches today."); }).catch(function () {});
      clearTimeout(todayTimer); todayTimer = setTimeout(loadToday, 30000);
    }
    function loadCalendar() {
      $("cal-label").textContent = isToday(calDate) ? "Today · " + dayLabel(calDate) : dayLabel(calDate);
      fetchScoreboard(calDate).then(function (evs) { renderGrid($("cal-matches"), evs, "No matches on this date."); }).catch(function () {});
    }
    $("cal-prev") && $("cal-prev").addEventListener("click", function () { calDate.setDate(calDate.getDate() - 1); loadCalendar(); });
    $("cal-next") && $("cal-next").addEventListener("click", function () { calDate.setDate(calDate.getDate() + 1); loadCalendar(); });
    $("cal-today") && $("cal-today").addEventListener("click", function () { calDate = new Date(); loadCalendar(); });

    /* call it now — champion predictor */
    (function champ() {
      const sel = $("champ-select"); if (!sel) return;
      const KEY = "wif-champ";
      const WC = [["ALG","Algeria"],["ARG","Argentina"],["AUS","Australia"],["AUT","Austria"],["BEL","Belgium"],["BIH","Bosnia-Herzegovina"],["BRA","Brazil"],["CAN","Canada"],["CPV","Cape Verde"],["COL","Colombia"],["COD","Congo DR"],["CRO","Croatia"],["CUW","Curaçao"],["CZE","Czechia"],["ECU","Ecuador"],["EGY","Egypt"],["ENG","England"],["FRA","France"],["GER","Germany"],["GHA","Ghana"],["HAI","Haiti"],["IRN","Iran"],["IRQ","Iraq"],["CIV","Ivory Coast"],["JPN","Japan"],["JOR","Jordan"],["MEX","Mexico"],["MAR","Morocco"],["NED","Netherlands"],["NZL","New Zealand"],["NOR","Norway"],["PAN","Panama"],["PAR","Paraguay"],["POR","Portugal"],["QAT","Qatar"],["KSA","Saudi Arabia"],["SCO","Scotland"],["SEN","Senegal"],["RSA","South Africa"],["KOR","South Korea"],["ESP","Spain"],["SWE","Sweden"],["SUI","Switzerland"],["TUN","Tunisia"],["TUR","Türkiye"],["USA","United States"],["URU","Uruguay"],["UZB","Uzbekistan"]];
      const nm = {}; WC.forEach(function (t) { nm[t[0]] = t[1]; const o = document.createElement("option"); o.value = t[0]; o.textContent = t[1]; sel.appendChild(o); });
      function show(v) { $("champ-saved").hidden = false; $("champ-saved").textContent = "Your pick: " + (nm[v] || v); const b = $("champ-share"); b.hidden = false; b.dataset.text = "My #catwifhat World Cup champion: " + (nm[v] || v) + " 🏆🐱\n$WIF, but on $USDC\ncatwifusdc.com"; }
      try { const s = localStorage.getItem(KEY); if (s) { sel.value = s; show(s); } } catch (e) {}
      sel.addEventListener("change", function () { if (!sel.value) return; try { localStorage.setItem(KEY, sel.value); } catch (e) {} show(sel.value); if (window.__wifToast) window.__wifToast("Champion locked 🏆"); });
      $("champ-share").addEventListener("click", function () { const t = $("champ-share").dataset.text || ""; const u = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(t); if (navigator.share) navigator.share({ text: t }).catch(function () { window.open(u, "_blank", "noopener"); }); else window.open(u, "_blank", "noopener"); });
    })();

    /* init: open tab from hash, kick off fetches */
    const start = (location.hash || "").replace("#", "");
    showTab(["standings", "rankings", "bracket", "today", "calendar", "callit"].indexOf(start) > -1 ? start : "today");
    fetchGroups(); loadToday(); loadCalendar();
    document.addEventListener("visibilitychange", function () { if (document.hidden) { clearTimeout(groupsTimer); clearTimeout(todayTimer); } else { fetchGroups(); loadToday(); } });
    return;
  }

  /* ============================================================ GAME MODE */
  const sb = $("sb");
  const params = new URLSearchParams(location.search);
  const EVENT_ID = params.get("event") || CFG.eventId;
  let prevGoals = null, ftTimer = null;
  const shareImgs = { home: null, away: null };

  if (!EVENT_ID) { $("status-text").textContent = "No match selected"; return; }

  function setBadge(imgEl, c) { const im = teamImg(c); if (im.src && !imgEl.src.endsWith(im.src)) imgEl.src = im.src; imgEl.classList.toggle("team__cat--flag", !im.isCat); imgEl.alt = ((c.team || {}).displayName || "") + (im.isCat ? " cat" : " flag"); }
  function synthEv(summary) { const h = (summary.header || {}); const c = (h.competitions || [])[0] || {}; return { id: h.id || EVENT_ID, date: c.date, shortName: h.shortName || (summary.header || {}).shortName, competitions: h.competitions || [] }; }

  function renderHeader(ev) {
    const s = sides(ev), st = s.status.type || {}, state = st.state;
    setBadge($("home-cat"), s.home); setBadge($("away-cat"), s.away);
    $("home-name").textContent = (s.home.team || {}).displayName || ""; $("away-name").textContent = (s.away.team || {}).displayName || "";
    $("home-score").textContent = s.home.score != null && state !== "pre" ? s.home.score : "–";
    $("away-score").textContent = s.away.score != null && state !== "pre" ? s.away.score : "–";
    $("home-cat").style.borderColor = colorOf(s.home.team, "#da291c"); $("away-cat").style.borderColor = colorOf(s.away.team, "#418fde");
    sb.dataset.state = state || ""; const live = state === "in"; $("livedot").hidden = !live;
    const detail = (st.shortDetail || st.detail || "").trim();
    let txt; if (live) txt = /ht|half/i.test(detail) ? "HALFTIME" : (s.status.displayClock || detail || "LIVE"); else if (state === "post") txt = "FULL TIME"; else { const dt = new Date(ev.date); txt = !isNaN(dt) ? "Kickoff " + fmtTime(dt) + " " + tzAbbr(dt) : (detail || "Scheduled"); }
    $("status-text").textContent = txt;
    let matchup = (ev.shortName || "").replace("@", "v").trim();
    if (!matchup) matchup = ((s.home.team || {}).abbreviation || "") + " v " + ((s.away.team || {}).abbreviation || "");
    $("sb-comp").textContent = COMP + " · " + matchup;
    renderPicks(ev, s.home, s.away);
    preloadShareImgs(ev);
  }

  function renderDetail(summary) {
    const ev = synthEv(summary); const s = sides(ev);
    const homeId = String((s.home.team || {}).id), awayId = String((s.away.team || {}).id);
    const hC = colorOf(s.home.team, "#da291c"), aC = colorOf(s.away.team, "#418fde");
    const events = (summary.keyEvents || []).map(function (e) {
      const tt = (e.type && e.type.text) || "", min = (e.clock && e.clock.displayValue) || "";
      const who = (e.participants || []).map(function (p) { return p.athlete && p.athlete.displayName; }).filter(Boolean);
      const tid = String((e.team || {}).id);
      return { tt: tt, min: min, name: who[0] || "", icon: iconFor(tt), side: tid === homeId ? "home" : (tid === awayId ? "away" : "") };
    }).filter(function (e) { return isKey(e.tt) && e.min; });
    renderPlays(s.home, s.away, hC, aC, events);
    renderStats(summary, s.home, s.away, hC, aC);
    renderLineups(summary, s.home, s.away, hC, aC);
    const goals = events.filter(function (e) { return /goal/i.test(e.tt); }).length;
    if (prevGoals != null && goals > prevGoals) { sb.classList.remove("goal-flash"); void sb.offsetWidth; sb.classList.add("goal-flash"); if (window.__wifToast) window.__wifToast("GOAL! ⚽️"); }
    prevGoals = goals;
    $("updated").textContent = "Updated " + fmtTime(new Date()) + " · auto-refreshing";
  }
  function playLi(e, color) { const g = /goal/i.test(e.tt); return '<li class="play' + (g ? " play--goal" : "") + '" style="border-color:' + color + '"><span class="play__min" style="color:' + color + '">' + esc(e.min) + '</span><span class="play__icon">' + e.icon + '</span><span class="play__txt"><b>' + esc(e.name) + '</b> <span class="play__type">' + esc(e.tt) + "</span></span></li>"; }
  function colHead(c, color) { const im = teamImg(c); return '<img class="plays__badge' + (im.isCat ? "" : " plays__badge--flag") + '" src="' + esc(im.src) + '" alt=""/><span class="plays__team">' + esc((c.team || {}).displayName || "") + "</span>"; }
  function renderPlays(home, away, hC, aC, events) {
    $("plays-home-head").innerHTML = colHead(home, hC); $("plays-away-head").innerHTML = colHead(away, aC);
    $("plays-home-head").style.borderColor = hC; $("plays-away-head").style.borderColor = aC;
    const hl = events.filter(function (e) { return e.side === "home"; }), al = events.filter(function (e) { return e.side === "away"; });
    $("plays-home-list").innerHTML = hl.length ? hl.map(function (e) { return playLi(e, hC); }).join("") : '<li class="plays__empty">—</li>';
    $("plays-away-list").innerHTML = al.length ? al.map(function (e) { return playLi(e, aC); }).join("") : '<li class="plays__empty">—</li>';
  }
  const STAT_ROWS = [{ name: "totalShots", label: "Shots" }, { name: "shotsOnTarget", label: "On target" }, { name: "wonCorners", label: "Corners" }, { name: "foulsCommitted", label: "Fouls" }];
  function statMap(t) { const m = {}; (t.statistics || []).forEach(function (s) { m[s.name] = s.displayValue; }); return m; }
  function renderStats(summary, home, away, hC, aC) {
    const box = (summary.boxscore || {}).teams || [], byId = {};
    box.forEach(function (t) { byId[String((t.team || {}).id)] = statMap(t); });
    const hs = byId[String((home.team || {}).id)], as = byId[String((away.team || {}).id)], panel = $("matchstats");
    if (!hs || !as || (hs.possessionPct == null && hs.totalShots == null)) { panel.innerHTML = '<div class="matchstats__pending">Live match stats appear after kickoff.</div>'; return; }
    const hp = parseFloat(hs.possessionPct) || 50, ap = parseFloat(as.possessionPct) || (100 - hp);
    let html = '<div class="matchstats__poss"><span class="matchstats__possval" style="color:' + hC + '">' + Math.round(hp) + '%</span><span class="matchstats__posslabel">Possession</span><span class="matchstats__possval" style="color:' + aC + '">' + Math.round(ap) + '%</span></div><div class="matchstats__bar"><span style="width:' + hp + "%;background:" + hC + '"></span><span style="width:' + ap + "%;background:" + aC + '"></span></div>';
    STAT_ROWS.forEach(function (r) { const h = hs[r.name] != null ? hs[r.name] : "0", a = as[r.name] != null ? as[r.name] : "0"; html += '<div class="matchstats__row"><span class="matchstats__v ' + (parseFloat(h) >= parseFloat(a) ? "is-lead" : "") + '">' + esc(h) + '</span><span class="matchstats__l">' + r.label + '</span><span class="matchstats__v ' + (parseFloat(a) >= parseFloat(h) ? "is-lead" : "") + '">' + esc(a) + "</span></div>"; });
    panel.innerHTML = html;
  }
  function renderLineups(summary, home, away, hC, aC) {
    const wrap = $("lineups"); if (!wrap) return; const ros = summary.rosters || [];
    if (ros.length < 2) { wrap.hidden = true; return; }
    const byId = function (id) { return ros.filter(function (r) { return String((r.team || {}).id) === String(id); })[0]; };
    const hr = byId((home.team || {}).id) || ros[0], ar = byId((away.team || {}).id) || ros[1];
    const xi = function (r) { return (r.roster || []).filter(function (p) { return p.starter; }); };
    if (!xi(hr).length && !xi(ar).length) { wrap.hidden = true; return; }
    const fmt = function (r) { return r.formation ? "(" + r.formation + ")" : ""; };
    const list = function (r) { return xi(r).map(function (p) { return "<li><span class=\"lineups__pos\">" + esc((p.position || {}).abbreviation || "") + "</span><span class=\"lineups__num\">" + esc(p.jersey || "") + "</span> " + esc((p.athlete || {}).displayName || "") + "</li>"; }).join(""); };
    $("lineup-home-head").innerHTML = "<span style=\"color:" + hC + "\">●</span> " + esc((home.team || {}).displayName || "") + " <span class=\"whoyougot__hint\">" + fmt(hr) + "</span>";
    $("lineup-away-head").innerHTML = "<span style=\"color:" + aC + "\">●</span> " + esc((away.team || {}).displayName || "") + " <span class=\"whoyougot__hint\">" + fmt(ar) + "</span>";
    $("lineup-home").innerHTML = list(hr) || "<li class=\"plays__empty\">TBD</li>"; $("lineup-away").innerHTML = list(ar) || "<li class=\"plays__empty\">TBD</li>";
    wrap.hidden = false;
  }

  /* who you got + poll */
  function fillPick(side, c) {
    const im = teamImg(c), name = (c.team || {}).displayName || "", imgEl = $("pick-" + side + "-img");
    if (im.src) imgEl.src = im.src; imgEl.alt = name; imgEl.classList.toggle("is-flag", !im.isCat);
    $("pick-" + side + "-name").textContent = name;
    const dl = $("pick-" + side + "-dl"), soon = $("pick-" + side + "-soon");
    if (im.isCat) { dl.hidden = false; soon.hidden = true; dl.href = im.base + ".png"; dl.setAttribute("download", im.base + "wifhat-pfp.png"); } else { dl.hidden = true; soon.hidden = false; }
  }
  function renderPicks(ev, home, away) {
    fillPick("home", home); fillPick("away", away);
    let saved = null; try { saved = localStorage.getItem("wif-pick-" + ev.id); } catch (e) {}
    document.querySelectorAll(".pick").forEach(function (f) { f.classList.toggle("is-picked", saved && f.dataset.side === saved); });
    updateShare(saved, home, away); refreshPoll(ev.id);
  }
  function updateShare(saved, home, away) { const b = $("pick-share"); if (!b) return; if (!saved) { b.hidden = true; return; } const t = saved === "home" ? home : away; b.hidden = false; b.dataset.text = "I'm rolling with " + ((t.team || {}).displayName || "my team") + " 🐱⚽ in the #catwifhat Scorebox\n$WIF, but on $USDC\ncatwifusdc.com"; }
  document.querySelectorAll(".pick__choose").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const side = btn.dataset.side;
      document.querySelectorAll(".pick").forEach(function (f) { f.classList.toggle("is-picked", f.dataset.side === side); });
      try { localStorage.setItem("wif-pick-" + EVENT_ID, side); } catch (e) {}
      votePoll(EVENT_ID, side);
      if (window.__wifToast) window.__wifToast("You're rolling with " + $("pick-" + side + "-name").textContent + "! 🐱");
    });
  });
  const POLL_API = "/api/poll";
  function refreshPoll(id) { fetch(POLL_API + "?event=" + encodeURIComponent(id), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(renderPoll).catch(function () { renderPoll(null); }); }
  function votePoll(id, side) { fetch(POLL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: id, side: side }) }).then(function (r) { return r.ok ? r.json() : null; }).then(renderPoll).catch(function () {}); }
  function renderPoll(d) { const w = $("poll"); if (!w) return; if (!d || (d.home == null && d.away == null)) { w.hidden = true; return; } const h = +d.home || 0, a = +d.away || 0, tot = h + a, hp = tot ? Math.round(h / tot * 100) : 50; $("poll-home-fill").style.width = hp + "%"; $("poll-away-fill").style.width = (100 - hp) + "%"; $("poll-home-pct").textContent = hp + "%"; $("poll-away-pct").textContent = (100 - hp) + "%"; $("poll-total").textContent = tot.toLocaleString() + (tot === 1 ? " vote" : " votes"); w.hidden = false; }

  /* share card */
  function preloadShareImgs(ev) { const s = sides(ev);[["home", s.home], ["away", s.away]].forEach(function (p) { const im = teamImg(p[1]); if (!im.src) { shareImgs[p[0]] = null; return; } const img = new Image(); img.crossOrigin = "anonymous"; img.referrerPolicy = "no-referrer"; img.src = im.src; shareImgs[p[0]] = { img: img, isCat: im.isCat }; }); }
  function clip(s, n) { s = s || ""; return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function drawBadge(ctx, en, cx, cy, r, ring) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = "#fffaf4"; ctx.fill(); ctx.clip(); const im = en && en.img; if (im && im.complete && im.naturalWidth) { if (en.isCat) { const sc = (2 * r) / im.naturalWidth; ctx.drawImage(im, cx - r, cy - r, im.naturalWidth * sc, im.naturalHeight * sc); } else { const m = r * 0.5; ctx.drawImage(im, cx - r + m, cy - r + m, 2 * (r - m), 2 * (r - m)); } } ctx.restore(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 9; ctx.strokeStyle = ring; ctx.stroke(); }
  function dataUrlToFile(u, name) { const a = u.split(","), m = (a[0].match(/:(.*?);/) || [])[1] || "image/png", b = atob(a[1]); let n = b.length; const u8 = new Uint8Array(n); while (n--) u8[n] = b.charCodeAt(n); return new File([u8], name, { type: m }); }
  function shareCard() {
    const summary = window.__lastSummary; if (!summary) return; const ev = synthEv(summary), s = sides(ev), st = s.status.type || {}, state = st.state;
    const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#efe7dc"); g.addColorStop(1, "#e2d6c9"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
    ctx.fillStyle = "#1a1814"; ctx.font = "800 34px Unbounded,Arial"; ctx.fillText("catwifhat · Scorebox", W / 2, 72);
    ctx.fillStyle = "rgba(26,24,20,0.5)"; ctx.font = "700 21px 'Hanken Grotesk',Arial"; ctx.fillText(COMP.toUpperCase(), W / 2, 104);
    const hC = colorOf(s.home.team, "#da291c"), aC = colorOf(s.away.team, "#418fde");
    drawBadge(ctx, shareImgs.home, 250, 300, 120, hC); drawBadge(ctx, shareImgs.away, 950, 300, 120, aC);
    ctx.fillStyle = "#1a1814"; ctx.font = "800 38px Unbounded,Arial"; ctx.fillText(clip((s.home.team || {}).displayName, 16), 250, 478); ctx.fillText(clip((s.away.team || {}).displayName, 16), 950, 478);
    const hs = s.home.score != null && state !== "pre" ? s.home.score : "–", as = s.away.score != null && state !== "pre" ? s.away.score : "–";
    ctx.font = "900 128px Unbounded,Arial"; ctx.fillStyle = "#1a1814"; ctx.fillText(hs + "   :   " + as, W / 2, 330);
    let stt; if (state === "in") stt = s.status.displayClock || "LIVE"; else if (state === "post") stt = "FULL TIME"; else { const dt = new Date(ev.date); stt = !isNaN(dt) ? "Kickoff " + fmtTime(dt) : "Scheduled"; }
    ctx.font = "800 30px 'Hanken Grotesk',Arial"; ctx.fillStyle = state === "in" ? "#d8483c" : "rgba(26,24,20,0.7)"; ctx.fillText((state === "in" ? "● " : "") + stt, W / 2, 398);
    ctx.fillStyle = "rgba(26,24,20,0.55)"; ctx.font = "700 26px 'Hanken Grotesk',Arial"; ctx.fillText("$WIF, but on $USDC · catwifusdc.com", W / 2, 582);
    let url; try { url = cv.toDataURL("image/png"); } catch (e) { if (window.__wifToast) window.__wifToast("Card not ready — try again"); return; }
    const text = ((s.home.team || {}).displayName || "") + " vs " + ((s.away.team || {}).displayName || "") + " 🐱⚽ #catwifhat Scorebox\ncatwifusdc.com";
    const file = dataUrlToFile(url, "catwifhat-scorebox.png");
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: text }).then(function () { if (window.__wifToast) window.__wifToast("shared!"); }).catch(function () {});
    else { const a = document.createElement("a"); a.href = url; a.download = "catwifhat-scorebox.png"; document.body.appendChild(a); a.click(); a.remove(); if (window.__wifToast) window.__wifToast("Card saved — drop it on X!"); }
  }
  $("sb-share") && $("sb-share").addEventListener("click", shareCard);

  /* poll the match */
  function poll() {
    fetch(BASE + "/summary?event=" + EVENT_ID, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (summary) {
      window.__lastSummary = summary;
      renderHeader(synthEv(summary)); renderDetail(summary);
      const live = stateOf(synthEv(summary)) === "in";
      clearTimeout(ftTimer); ftTimer = live ? setTimeout(poll, 15000) : null;
    }).catch(function () { clearTimeout(ftTimer); ftTimer = setTimeout(poll, 15000); });
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(ftTimer); else poll(); });
  poll();
})();
