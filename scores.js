/* ============================================================
   catwifhat — scores.js
   Live, auto-updating scoreboard + key-play runner.
   Data: ESPN's public sports API (no key, CORS-enabled).
   Single poll of the match "summary" endpoint drives the whole page:
   score, live match clock, status, and key events.
   ============================================================ */
(function () {
  "use strict";

  const sb = document.getElementById("sb");
  if (!sb) return; // not the scores page

  /* ---- Featured match config ----
     Swap EVENT_ID (and the team meta) to feature a different game.
     Find an event id at:
     site.api.espn.com/apis/site/v2/sports/soccer/<league>/scoreboard  */
  const LEAGUE = "fifa.world";
  const EVENT_ID = "760435"; // Portugal vs Congo DR — 2026 WC group stage
  const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + LEAGUE + "/summary?event=" + EVENT_ID;

  // Team metadata keyed by ESPN abbreviation → our cat PFPs.
  const TEAMS = {
    POR: { name: "Portugal", cat: "portugal-cat.webp" },
    COD: { name: "Congo DR", cat: "congo-dr-cat.webp" },
  };

  // Which key events make the runner / timeline, with an emoji.
  function iconFor(typeText) {
    const t = (typeText || "").toLowerCase();
    if (t.indexOf("penalty") > -1 && t.indexOf("miss") > -1) return "❌";
    if (t.indexOf("own goal") > -1) return "⚽️";
    if (t.indexOf("goal") > -1) return "⚽️";
    if (t.indexOf("yellow") > -1) return "🟨";
    if (t.indexOf("red") > -1) return "🟥";
    if (t.indexOf("substitution") > -1) return "🔁";
    if (t.indexOf("kickoff") > -1 || t.indexOf("start") > -1) return "🟢";
    if (t.indexOf("end") > -1 || t.indexOf("full") > -1) return "🏁";
    if (t.indexOf("var") > -1) return "📺";
    return "•";
  }
  function isKey(typeText) {
    const t = (typeText || "").toLowerCase();
    return /goal|yellow|red|penalt|var/.test(t); // skip drinks-break / generic delays
  }

  const $ = function (id) { return document.getElementById(id); };
  const els = {
    homeCat: $("home-cat"), awayCat: $("away-cat"),
    homeName: $("home-name"), awayName: $("away-name"),
    homeScore: $("home-score"), awayScore: $("away-score"),
    statusText: $("status-text"), livedot: $("livedot"),
    runnerTrack: $("runner-track"), playsList: $("plays-list"),
    updated: $("updated"),
  };

  let prevGoals = null; // detect new goals for the flash
  let timer = null;
  let stopped = false;

  function teamMeta(competitor) {
    const ab = (competitor.team && competitor.team.abbreviation) || "";
    if (TEAMS[ab]) return TEAMS[ab];
    // fallback: match by display name
    const dn = (competitor.team && competitor.team.displayName) || "";
    for (const k in TEAMS) if (TEAMS[k].name === dn) return TEAMS[k];
    return { name: dn || ab, cat: null };
  }

  function setTeam(slot, competitor) {
    const meta = teamMeta(competitor);
    els[slot + "Name"].textContent = meta.name;
    if (meta.cat && !els[slot + "Cat"].src.endsWith(meta.cat)) els[slot + "Cat"].src = meta.cat;
    els[slot + "Cat"].alt = meta.name + " cat";
    els[slot + "Score"].textContent = (competitor.score != null ? competitor.score : "–");
  }

  function fmtTime(d) {
    try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  }

  function render(data) {
    const header = data && data.header;
    const comp = header && header.competitions && header.competitions[0];
    if (!comp) throw new Error("no competition in summary");

    const status = comp.status || {};
    const stype = status.type || {};
    const state = stype.state; // pre | in | post
    const competitors = comp.competitors || [];
    const home = competitors.filter(function (c) { return c.homeAway === "home"; })[0] || competitors[0];
    const away = competitors.filter(function (c) { return c.homeAway === "away"; })[0] || competitors[1];

    if (home) setTeam("home", home);
    if (away) setTeam("away", away);

    // ---- status / clock ----
    sb.dataset.state = state || "";
    const live = state === "in";
    els.livedot.hidden = !live;
    let txt;
    const detail = (stype.shortDetail || stype.detail || "").trim();
    if (live) {
      txt = /ht|half/i.test(detail) ? "HALFTIME" : (status.displayClock || detail || "LIVE");
    } else if (state === "post") {
      txt = "FULL TIME";
    } else {
      // pre-match: show local kickoff time if available
      const dt = header.competitions[0].date || (data.gameInfo && data.gameInfo.date);
      const when = dt ? new Date(dt) : null;
      txt = when && !isNaN(when) ? "Kickoff " + fmtTime(when) : (detail || "Scheduled");
    }
    els.statusText.textContent = txt;

    // ---- key events ----
    const events = (data.keyEvents || []).map(function (ev) {
      const typeText = (ev.type && ev.type.text) || "";
      const minute = (ev.clock && ev.clock.displayValue) || "";
      const who = (ev.participants || [])
        .map(function (p) { return p.athlete && p.athlete.displayName; })
        .filter(Boolean);
      const name = who[0] || (ev.team && ev.team.displayName) || "";
      return { typeText: typeText, minute: minute, name: name, key: isKey(typeText), icon: iconFor(typeText) };
    });
    const keyEvents = events.filter(function (e) { return e.key && e.minute; });

    renderRunner(keyEvents);
    renderPlays(keyEvents);

    // ---- new-goal flash ----
    const goals = keyEvents.filter(function (e) { return /goal/i.test(e.typeText); }).length;
    if (prevGoals != null && goals > prevGoals) {
      sb.classList.remove("goal-flash"); void sb.offsetWidth; sb.classList.add("goal-flash");
      if (window.__wifToast) window.__wifToast("GOAL! ⚽️");
    }
    prevGoals = goals;

    els.updated.textContent = "Updated " + fmtTime(new Date()) + " · auto-refreshing";
    return state;
  }

  function renderRunner(keyEvents) {
    const track = els.runnerTrack;
    if (!keyEvents.length) {
      track.style.animation = "none";
      track.innerHTML = '<span class="runner__item runner__item--empty">No key plays yet — hang tight.</span>';
      return;
    }
    const items = keyEvents.map(function (e) {
      return '<span class="runner__item"><span class="runner__icon">' + e.icon + '</span>' +
        escapeHtml(e.name) + ' <b>' + escapeHtml(e.minute) + "</b></span>";
    }).join('<span class="runner__sep">•</span>');
    // Each half ends with a wide spacer so there's clear separation at the loop seam.
    const half = items + '<span class="runner__gap" aria-hidden="true"></span>';
    track.innerHTML = half + half; // duplicate for a seamless -50% loop
    track.style.animation = "none"; void track.offsetWidth;
    track.style.animationDuration = Math.max(14, keyEvents.length * 5) + "s";
    track.style.animationName = "runner-scroll";
  }

  function renderPlays(keyEvents) {
    const list = els.playsList;
    if (!keyEvents.length) { list.innerHTML = '<li class="plays__empty">No plays yet.</li>'; return; }
    list.innerHTML = keyEvents.map(function (e) {
      const goal = /goal/i.test(e.typeText);
      return '<li class="play' + (goal ? " play--goal" : "") + '">' +
        '<span class="play__min">' + escapeHtml(e.minute) + "</span>" +
        '<span class="play__icon">' + e.icon + "</span>" +
        '<span class="play__txt"><b>' + escapeHtml(e.name) + "</b> " +
        '<span class="play__type">' + escapeHtml(e.typeText) + "</span></span></li>";
    }).join("");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- polling loop with state-aware cadence ----
  function intervalFor(state) {
    if (state === "in") return 15000;   // live: tight
    if (state === "post") return null;   // final: stop
    return 60000;                        // pre: relaxed
  }
  function schedule(state) {
    if (stopped) return;
    const ms = intervalFor(state);
    clearTimeout(timer);
    if (ms != null) timer = setTimeout(poll, ms);
  }
  function poll() {
    fetch(SUMMARY, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        let state;
        try { state = render(data); }
        catch (e) { state = "pre"; }
        schedule(state);
      })
      .catch(function () {
        els.updated.textContent = "Reconnecting…";
        schedule("in"); // retry soon
      });
  }

  // Pause polling while the tab is hidden; refresh immediately on return.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearTimeout(timer); }
    else { poll(); }
  });

  /* ---- "Who you got?" local pick ---- */
  (function picks() {
    const KEY = "wif-pick";
    const figs = document.querySelectorAll(".pick");
    function apply(side) {
      figs.forEach(function (f) { f.classList.toggle("is-picked", f.dataset.side === side); });
    }
    try { const saved = localStorage.getItem(KEY); if (saved) apply(saved); } catch (e) {}
    document.querySelectorAll(".pick__choose").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const side = btn.dataset.side;
        apply(side);
        try { localStorage.setItem(KEY, side); } catch (e) {}
        const name = btn.closest(".pick").querySelector(".pick__name").textContent;
        if (window.__wifToast) window.__wifToast("You're rolling with " + name + "! 🐱");
      });
    });
  })();

  poll(); // kick off
})();
