/* ============================================================
   catwifhat — scores.js  ("The Scorebox")
   The whole World Cup, live & auto-updating, 100% client-side.
   Data: ESPN's public sports API (no key, CORS-enabled).
     - scoreboard?dates=YYYYMMDD  → every match that day (score, clock, status)
     - summary?event=ID           → key plays for the featured match
   ============================================================ */
(function () {
  "use strict";

  const sb = document.getElementById("sb");
  if (!sb) return; // not the scores page

  const LEAGUE = "fifa.world";
  const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + LEAGUE;

  /* ---- Team cat memes ----
     Map an ESPN team abbreviation → the base filename of its cat PFP.
     Create <base>.webp (display) and <base>.PNG (download) and add a line here.
     Teams without a cat fall back to their country flag automatically. */
  const TEAM_CATS = {
    POR: "portugal-cat",
    COD: "congo-dr-cat",
    // ENG: "england-cat", BRA: "brazil-cat", FRA: "france-cat", ARG: "argentina-cat", ...
  };

  /* ---------- state ---------- */
  let currentDate = new Date();
  let featuredId = null;
  const eventsById = {};
  let sbTimer = null, ftTimer = null;
  let prevGoals = {}; // per-event goal count, for the flash

  /* ---------- helpers ---------- */
  const $ = function (id) { return document.getElementById(id); };
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function isToday(d) { return d.toDateString() === new Date().toDateString(); }
  function dayLabel(d) {
    try { return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); }
    catch (e) { return d.toDateString(); }
  }
  function fmtTime(d) {
    try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function iconFor(typeText) {
    const t = (typeText || "").toLowerCase();
    if (t.indexOf("own goal") > -1) return "⚽️";
    if (t.indexOf("goal") > -1) return "⚽️";
    if (t.indexOf("yellow") > -1) return "🟨";
    if (t.indexOf("red") > -1) return "🟥";
    if (t.indexOf("var") > -1) return "📺";
    return "•";
  }
  function isKey(typeText) { return /goal|yellow|red|penalt|var/i.test(typeText || ""); }

  function teamImg(competitor) {
    const team = competitor.team || {};
    const ab = team.abbreviation || "";
    if (TEAM_CATS[ab]) return { src: TEAM_CATS[ab] + ".webp", isCat: true, base: TEAM_CATS[ab] };
    const logo = team.logo || ((team.logos || [])[0] || {}).href || "";
    return { src: logo, isCat: false, base: null };
  }
  function competitors(ev) {
    const c = (ev.competitions || [])[0] || {};
    const list = c.competitors || [];
    const home = list.filter(function (x) { return x.homeAway === "home"; })[0] || list[0] || {};
    const away = list.filter(function (x) { return x.homeAway === "away"; })[0] || list[1] || {};
    return { comp: c, home: home, away: away, status: (c.status || {}) };
  }

  /* ---------- featured scoreboard ---------- */
  function setBadge(imgEl, competitor) {
    const im = teamImg(competitor);
    if (im.src && !imgEl.src.endsWith(im.src)) imgEl.src = im.src;
    imgEl.classList.toggle("team__cat--flag", !im.isCat);
    imgEl.alt = ((competitor.team || {}).displayName || "") + (im.isCat ? " cat" : " flag");
    return im;
  }
  function renderFeatured(ev) {
    const { home, away, status } = competitors(ev);
    const stype = status.type || {};
    const state = stype.state;

    setBadge($("home-cat"), home);
    setBadge($("away-cat"), away);
    $("home-name").textContent = (home.team || {}).displayName || "";
    $("away-name").textContent = (away.team || {}).displayName || "";
    $("home-score").textContent = home.score != null && state !== "pre" ? home.score : "–";
    $("away-score").textContent = away.score != null && state !== "pre" ? away.score : "–";

    sb.dataset.state = state || "";
    const live = state === "in";
    $("livedot").hidden = !live;
    const detail = (stype.shortDetail || stype.detail || "").trim();
    let txt;
    if (live) txt = /ht|half/i.test(detail) ? "HALFTIME" : (status.displayClock || detail || "LIVE");
    else if (state === "post") txt = "FULL TIME";
    else { const dt = new Date(ev.date); txt = !isNaN(dt) ? "Kickoff " + fmtTime(dt) : (detail || "Scheduled"); }
    $("status-text").textContent = txt;

    $("sb-comp").textContent = "FIFA World Cup 2026 · " + ((ev.shortName || "").replace("@", "v"));
    renderPicks(ev, home, away);
  }

  /* ---------- featured key plays (from summary) ---------- */
  function renderDetail(summary) {
    const events = (summary.keyEvents || []).map(function (ev) {
      const typeText = (ev.type && ev.type.text) || "";
      const minute = (ev.clock && ev.clock.displayValue) || "";
      const who = (ev.participants || []).map(function (p) { return p.athlete && p.athlete.displayName; }).filter(Boolean);
      return { typeText: typeText, minute: minute, name: who[0] || (ev.team && ev.team.displayName) || "", icon: iconFor(typeText) };
    }).filter(function (e) { return isKey(e.typeText) && e.minute; });

    renderRunner(events);
    renderPlays(events);

    const goals = events.filter(function (e) { return /goal/i.test(e.typeText); }).length;
    if (prevGoals[featuredId] != null && goals > prevGoals[featuredId]) {
      sb.classList.remove("goal-flash"); void sb.offsetWidth; sb.classList.add("goal-flash");
      if (window.__wifToast) window.__wifToast("GOAL! ⚽️");
    }
    prevGoals[featuredId] = goals;
    $("updated").textContent = "Updated " + fmtTime(new Date()) + " · auto-refreshing";
  }
  function renderRunner(events) {
    const track = $("runner-track");
    if (!events.length) {
      track.style.animation = "none";
      track.innerHTML = '<span class="runner__item runner__item--empty">No key plays yet — hang tight.</span>';
      return;
    }
    const items = events.map(function (e) {
      return '<span class="runner__item"><span class="runner__icon">' + e.icon + "</span>" +
        escapeHtml(e.name) + " <b>" + escapeHtml(e.minute) + "</b></span>";
    }).join('<span class="runner__sep">•</span>');
    const half = items + '<span class="runner__gap" aria-hidden="true"></span>';
    track.innerHTML = half + half;
    track.style.animation = "none"; void track.offsetWidth;
    track.style.animationDuration = Math.max(14, events.length * 5) + "s";
    track.style.animationName = "runner-scroll";
  }
  function renderPlays(events) {
    const list = $("plays-list");
    if (!events.length) { list.innerHTML = '<li class="plays__empty">No plays yet.</li>'; return; }
    list.innerHTML = events.map(function (e) {
      const goal = /goal/i.test(e.typeText);
      return '<li class="play' + (goal ? " play--goal" : "") + '">' +
        '<span class="play__min">' + escapeHtml(e.minute) + "</span>" +
        '<span class="play__icon">' + e.icon + "</span>" +
        '<span class="play__txt"><b>' + escapeHtml(e.name) + "</b> " +
        '<span class="play__type">' + escapeHtml(e.typeText) + "</span></span></li>";
    }).join("");
  }

  /* ---------- who you got (featured teams) ---------- */
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
    if (im.isCat) {
      dl.hidden = false; soon.hidden = true;
      dl.href = im.base + ".PNG";
      dl.setAttribute("download", im.base + "wifhat-pfp.png");
    } else {
      dl.hidden = true; soon.hidden = false;
    }
  }
  function renderPicks(ev, home, away) {
    fillPick("home", home);
    fillPick("away", away);
    // restore this match's saved pick
    let saved = null;
    try { saved = localStorage.getItem("wif-pick-" + ev.id); } catch (e) {}
    document.querySelectorAll(".pick").forEach(function (f) {
      f.classList.toggle("is-picked", saved && f.dataset.side === saved);
    });
  }
  document.querySelectorAll(".pick__choose").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const side = btn.dataset.side;
      document.querySelectorAll(".pick").forEach(function (f) { f.classList.toggle("is-picked", f.dataset.side === side); });
      try { if (featuredId) localStorage.setItem("wif-pick-" + featuredId, side); } catch (e) {}
      const name = $("pick-" + side + "-name").textContent;
      if (window.__wifToast) window.__wifToast("You're rolling with " + name + "! 🐱");
    });
  });

  /* ---------- all-matches grid ---------- */
  function renderGrid(events) {
    const wrap = $("matches");
    if (!events.length) { wrap.innerHTML = '<p class="matches__empty">No matches on this date.</p>'; return; }
    // order: live first, then upcoming, then finished
    const rank = { in: 0, pre: 1, post: 2 };
    const sorted = events.slice().sort(function (a, b) {
      const ra = rank[stateOf(a)] != null ? rank[stateOf(a)] : 3;
      const rb = rank[stateOf(b)] != null ? rank[stateOf(b)] : 3;
      if (ra !== rb) return ra - rb;
      return new Date(a.date) - new Date(b.date);
    });
    wrap.innerHTML = sorted.map(matchCard).join("");
    wrap.querySelectorAll(".match").forEach(function (card) {
      card.addEventListener("click", function () {
        const ev = eventsById[card.dataset.id];
        if (ev) selectFeatured(ev.id);
      });
    });
  }
  function stateOf(ev) { return ((((ev.competitions || [])[0] || {}).status || {}).type || {}).state; }
  function badgeHtml(competitor) {
    const im = teamImg(competitor);
    const cls = "match__badge" + (im.isCat ? "" : " match__badge--flag");
    return '<img class="' + cls + '" src="' + escapeHtml(im.src) + '" alt="" loading="lazy" />';
  }
  function matchCard(ev) {
    const { home, away, status } = competitors(ev);
    const stype = status.type || {};
    const state = stype.state;
    const ab = function (c) { return (c.team || {}).abbreviation || ""; };
    let big, small, smallCls;
    if (state === "in") {
      big = (home.score || 0) + "–" + (away.score || 0);
      small = /ht|half/i.test(stype.shortDetail || "") ? "HT" : (status.displayClock || "LIVE");
      smallCls = "match__small--live";
    } else if (state === "post") {
      big = (home.score || 0) + "–" + (away.score || 0); small = "FT"; smallCls = "";
    } else {
      const dt = new Date(ev.date); big = "vs"; small = !isNaN(dt) ? fmtTime(dt) : "TBD"; smallCls = "";
    }
    const cur = ev.id === featuredId ? " is-active" : "";
    return '<button class="match' + cur + '" type="button" data-id="' + ev.id + '">' +
      '<span class="match__side">' + badgeHtml(home) + '<span class="match__ab">' + escapeHtml(ab(home)) + "</span></span>" +
      '<span class="match__cen"><span class="match__big">' + escapeHtml(big) + "</span>" +
      '<span class="match__small ' + smallCls + '">' + escapeHtml(small) + "</span></span>" +
      '<span class="match__side match__side--r"><span class="match__ab">' + escapeHtml(ab(away)) + "</span>" + badgeHtml(away) + "</span>" +
      "</button>";
  }

  /* ---------- featured selection ---------- */
  function selectFeatured(id) {
    if (!eventsById[id]) return;
    featuredId = id;
    // reset detail UI while the summary loads
    $("runner-track").innerHTML = '<span class="runner__item runner__item--empty">Loading plays…</span>';
    $("plays-list").innerHTML = '<li class="plays__empty">Loading…</li>';
    renderFeatured(eventsById[id]);
    markActiveCard();
    clearTimeout(ftTimer); ftTimer = null;
    pollFeatured();
    try { document.getElementById("sb").scrollIntoView({ block: "nearest" }); } catch (e) {}
  }
  function markActiveCard() {
    document.querySelectorAll(".match").forEach(function (c) {
      c.classList.toggle("is-active", c.dataset.id === featuredId);
    });
  }
  function pickDefault(events) {
    const byState = function (s) { return events.filter(function (e) { return stateOf(e) === s; }); };
    const live = byState("in");
    if (live.length) return live[0].id;
    const pre = byState("pre").sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (pre.length) return pre[0].id;
    const post = byState("post").sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    if (post.length) return post[0].id;
    return events[0] && events[0].id;
  }

  /* ---------- polling ---------- */
  function pollFeatured() {
    if (!featuredId) return;
    fetch(BASE + "/summary?event=" + featuredId, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (s) {
        renderDetail(s);
        const live = stateOf(eventsById[featuredId]) === "in";
        clearTimeout(ftTimer);
        ftTimer = live ? setTimeout(pollFeatured, 20000) : null;
      })
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

        // keep the user's featured choice if it's still on the slate, else auto-pick
        if (!featuredId || !eventsById[featuredId]) {
          const id = pickDefault(events);
          if (id) selectFeatured(id);
          else { sb.dataset.state = "empty"; $("status-text").textContent = "No match"; }
        } else {
          renderFeatured(eventsById[featuredId]);
          markActiveCard();
          if (stateOf(eventsById[featuredId]) === "in" && !ftTimer) pollFeatured();
        }

        const anyLive = events.some(function (e) { return stateOf(e) === "in"; });
        clearTimeout(sbTimer);
        sbTimer = (isToday(currentDate) || anyLive) ? setTimeout(pollScoreboard, 30000) : null;
      })
      .catch(function () { clearTimeout(sbTimer); sbTimer = setTimeout(pollScoreboard, 30000); });
  }

  function reload() {
    clearTimeout(sbTimer); clearTimeout(ftTimer); ftTimer = null;
    featuredId = null; // force re-pick for the new day
    $("date-label").textContent = isToday(currentDate) ? "Today · " + dayLabel(currentDate) : dayLabel(currentDate);
    pollScoreboard();
  }

  /* ---------- date nav ---------- */
  function shiftDay(delta) { const d = new Date(currentDate); d.setDate(d.getDate() + delta); currentDate = d; reload(); }
  $("date-prev").addEventListener("click", function () { shiftDay(-1); });
  $("date-next").addEventListener("click", function () { shiftDay(1); });
  $("date-today").addEventListener("click", function () { currentDate = new Date(); reload(); });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearTimeout(sbTimer); clearTimeout(ftTimer); ftTimer = null; }
    else { pollScoreboard(); }
  });

  reload(); // go
})();
