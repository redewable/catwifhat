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
  const CORE = "https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/";
  let timer = null;
  const expanded = {};   // id -> selected round index (or null for default)
  let state = { rows: [], round: 1 };
  let course = null, courseFetched = false;   // course meta from the core API
  let playerMeta = {}, pollInit = false;       // id -> {name, flag} for the winner poll
  const POLL_API = "/api/poll", LKEY = "wif-localusopen", VKEY = "wif-usopen-voted";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtTime(d) { try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function parDisp(s) { if (s == null || s === "") return "—"; s = String(s).trim(); if (s === "0" || s === "E") return "E"; return s; }
  function parNum(s) { if (s == null) return 999; s = String(s).trim(); if (s === "E" || s === "") return 0; const n = parseFloat(s.replace("+", "")); return isNaN(n) ? 999 : n; }
  function parClass(s) { if (s == null || s === "" || s === "—") return ""; const n = parNum(s); return n < 0 ? "is-under" : (n > 0 ? "is-over" : "is-even"); }
  function relNum(s) { if (s == null) return null; s = String(s).trim(); if (s === "E" || s === "") return 0; const n = parseInt(s, 10); return isNaN(n) ? null : n; }
  function holeClass(rel) { if (rel == null) return "hole--empty"; if (rel <= -2) return "hole--eagle"; if (rel === -1) return "hole--birdie"; if (rel === 0) return "hole--par"; if (rel === 1) return "hole--bogey"; return "hole--dbl"; }

  function roundOf(ev) { const c = (ev.competitions || [])[0] || {}; return (c.status || {}).period || 1; }

  function dateRange(a, b) {
    try {
      const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const da = new Date(a), db = new Date(b || a);
      if (isNaN(da)) return "";
      // dates come as the host-timezone midnight encoded in UTC — read the UTC calendar date
      const m1 = da.getUTCMonth(), d1 = da.getUTCDate();
      if (isNaN(db)) return MO[m1] + " " + d1;
      const m2 = db.getUTCMonth(), d2 = db.getUTCDate();
      if (m1 === m2 && d1 === d2) return MO[m1] + " " + d1;
      if (m1 === m2) return MO[m1] + " " + d1 + "–" + d2;
      return MO[m1] + " " + d1 + " – " + MO[m2] + " " + d2;
    } catch (e) { return ""; }
  }
  function loadCourse(id) {
    if (courseFetched || !id) return; courseFetched = true;
    fetch(CORE + encodeURIComponent(id) + "?lang=en&region=us", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        const c = (d.courses || [])[0] || {}, ad = c.address || {};
        const holePar = {}; (c.holes || []).forEach(function (h) { if (h && h.number != null) holePar[h.number] = h.shotsToPar; });
        course = {
          name: c.name || "", where: [ad.city, ad.state || ad.country].filter(Boolean).join(", "),
          par: c.shotsToPar, yards: c.totalYards, holePar: holePar,
          dates: dateRange(d.date, d.endDate), champ: ((d.defendingChampion || {}).athlete || {}).fullName || ""
        };
        renderCourse(); paint();   // repaint so any open scorecard picks up hole pars
      })
      .catch(function () {});
  }
  function renderCourse() {
    const el = $("golf-course"); if (!el || !course) return;
    const bits = [];
    if (course.name) bits.push('<span class="golfcourse__pin">📍</span> <strong>' + esc(course.name) + "</strong>" + (course.where ? " · " + esc(course.where) : ""));
    const facts = [];
    if (course.par != null) facts.push("Par " + course.par);
    if (course.yards) facts.push(Number(course.yards).toLocaleString() + " yds");
    if (course.dates) facts.push(course.dates);
    if (course.champ) facts.push("Defending: " + course.champ);
    let html = "";
    if (bits.length) html += '<div class="golfcourse__line">' + bits.join("") + "</div>";
    if (facts.length) html += '<div class="golfcourse__facts">' + facts.map(function (f) { return "<span>" + esc(f) + "</span>"; }).join("") + "</div>";
    el.innerHTML = html; el.hidden = !html;
  }

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
      const d = byHole[n];
      const par = (course && course.holePar[n] != null) ? course.holePar[n] : (d && d.par != null ? d.par : null);
      let cls = "hole--empty", sc = "–";
      if (d && d.strokes != null) { sc = d.strokes; const rel = d.rel != null ? d.rel : (par != null ? d.strokes - par : null); cls = holeClass(rel); }
      const parTxt = par != null ? "Par " + par : "·";
      return '<div class="hole ' + cls + '"><span class="hole__hd">' + n + " · " + parTxt + '</span><span class="hole__sc">' + sc + "</span></div>";
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
    const share = '<button class="sc__share" type="button" data-share-id="' + esc(String(c.id)) + '" data-share-round="' + sel + '">📸 Share this scorecard</button>';
    return '<div class="sc" data-card-id="' + esc(String(c.id)) + '">' + tabs + nine(1, 9, "OUT", "Front nine") + nine(10, 18, "IN", "Back nine") + legend + share + "</div>";
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
    const sh = e.target.closest(".sc__share");
    if (sh) { e.stopPropagation(); shareScorecard(sh.getAttribute("data-share-id"), parseInt(sh.getAttribute("data-share-round"), 10)); return; }
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

  /* ---- shareable scorecard image (canvas → X / download) ---- */
  const HOLE_COLORS = {
    "hole--eagle": { bg: "#ffe6b0", fg: "#b8731b" }, "hole--birdie": { bg: "#d3f1e0", fg: "#1a8a5a" },
    "hole--par": { bg: "#ffffff", fg: "#1a1814" }, "hole--bogey": { bg: "#ffdfdb", fg: "#d8483c" },
    "hole--dbl": { bg: "#d9e4ff", fg: "#2e5fd8" }, "hole--empty": { bg: "#efe7dc", fg: "rgba(26,24,20,0.35)" }
  };
  function dataUrlToFile(u, name) { const a = u.split(","), m = (a[0].match(/:(.*?);/) || [])[1] || "image/png", b = atob(a[1]); let n = b.length; const u8 = new Uint8Array(n); while (n--) u8[n] = b.charCodeAt(n); return new File([u8], name, { type: m }); }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function findRow(id) { for (let i = 0; i < state.rows.length; i++) if (String(state.rows[i].c.id) === String(id)) return state.rows[i]; return null; }

  function shareScorecard(id, roundIdx) {
    const r = findRow(id); if (!r) return; const c = r.c, a = c.athlete || {};
    const rounds = c.linescores || []; let sel = roundIdx;
    if (sel == null || !((rounds[sel] || {}).linescores || []).length) { const p = playedRounds(c); sel = p.length ? p[p.length - 1].i : 0; }
    const round = rounds[sel] || {}, byHole = {};
    (round.linescores || []).forEach(function (h) { const rel = relNum((h.scoreType || {}).displayValue), s = parseInt(h.displayValue, 10); byHole[h.period] = { strokes: isNaN(s) ? null : s, rel: rel }; });

    const W = 1200, H = 675, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#efe7dc"); g.addColorStop(1, "#e2d6c9"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "left"; ctx.fillStyle = "#1a1814"; ctx.font = "800 30px Unbounded,Arial"; ctx.fillText("catwifhat · Scorebox", 60, 70);
    ctx.fillStyle = "rgba(26,24,20,0.5)"; ctx.font = "700 20px 'Hanken Grotesk',Arial"; ctx.fillText((course && course.name ? course.name.toUpperCase() + " · " : "") + (($("golf-title").textContent || "U.S. OPEN").toUpperCase()), 60, 100);

    function drawCard(flagImg) {
      // player line
      let x = 60; const py = 165;
      if (flagImg) { ctx.save(); rr(ctx, x, py - 34, 60, 40, 6); ctx.clip(); ctx.drawImage(flagImg, x, py - 34, 60, 40); ctx.restore(); x += 76; }
      ctx.fillStyle = "#1a1814"; ctx.font = "800 46px Unbounded,Arial"; ctx.textAlign = "left"; ctx.fillText(a.displayName || "", x, py);
      ctx.font = "800 26px 'Hanken Grotesk',Arial"; ctx.fillStyle = "rgba(26,24,20,0.6)"; ctx.fillText(r.posLabel + " · " + parDisp(c.score) + " total", x, py + 38);
      // hole grid: 2 rows of 9
      const gx = 60, gy = 250, cw = (W - 120 - 8 * 14) / 9, ch = 150, gap = 14;
      function rowCells(start, ry, label) {
        ctx.textAlign = "left"; ctx.fillStyle = "#1a1814"; ctx.font = "800 22px Unbounded,Arial"; ctx.fillText(label, gx, ry - 14);
        for (let i = 0; i < 9; i++) {
          const n = start + i, d = byHole[n];
          const par = (course && course.holePar[n] != null) ? course.holePar[n] : null;
          let cls = "hole--empty", sc = "–";
          if (d && d.strokes != null) { sc = String(d.strokes); const rel = d.rel != null ? d.rel : (par != null ? d.strokes - par : null); cls = (rel == null ? "hole--empty" : rel <= -2 ? "hole--eagle" : rel === -1 ? "hole--birdie" : rel === 0 ? "hole--par" : rel === 1 ? "hole--bogey" : "hole--dbl"); }
          const col = HOLE_COLORS[cls], cx = gx + i * (cw + gap);
          ctx.fillStyle = "#ffffff"; rr(ctx, cx, ry, cw, ch, 12); ctx.fill();
          ctx.fillStyle = "rgba(26,24,20,0.5)"; ctx.font = "700 17px 'Hanken Grotesk',Arial"; ctx.textAlign = "center";
          ctx.fillText(n + (par != null ? " · P" + par : ""), cx + cw / 2, ry + 26);
          ctx.fillStyle = col.bg; const cr = 30, ccx = cx + cw / 2, ccy = ry + 92;
          ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col.fg; ctx.font = "800 34px Unbounded,Arial"; ctx.fillText(sc, ccx, ccy + 12);
        }
      }
      rowCells(1, gy + 24, "Front nine");
      rowCells(10, gy + 24 + ch + 60, "Back nine");
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(26,24,20,0.55)"; ctx.font = "700 24px 'Hanken Grotesk',Arial";
      ctx.fillText("$WIF, but on $USDC · catwifusdc.com 🐱⛳", W / 2, H - 28);

      let url; try { url = cv.toDataURL("image/png"); } catch (e) { if (window.__wifToast) window.__wifToast("Card not ready — try again"); return; }
      const text = (a.displayName || "player") + " — " + r.posLabel + " (" + parDisp(c.score) + ") at the " + ($("golf-title").textContent || "U.S. Open") + " 🐱⛳ #catwifhat\ncatwifusdc.com";
      const file = dataUrlToFile(url, "catwifhat-scorecard.png");
      if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: text }).then(function () { if (window.__wifToast) window.__wifToast("shared!"); }).catch(function () {});
      else { const link = document.createElement("a"); link.href = url; link.download = "catwifhat-scorecard.png"; document.body.appendChild(link); link.click(); link.remove(); if (window.__wifToast) window.__wifToast("Scorecard saved — drop it on X!"); }
    }

    const flagUrl = (a.flag || {}).href || "";
    if (flagUrl) { const fi = new Image(); fi.crossOrigin = "anonymous"; fi.referrerPolicy = "no-referrer"; fi.onload = function () { drawCard(fi); }; fi.onerror = function () { drawCard(null); }; fi.src = flagUrl; }
    else drawCard(null);
  }

  /* ---- "Call the winner" global poll (namespaced champ tally) ---- */
  function pollLget() { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { return {}; } }
  function pollLset(o) { try { localStorage.setItem(LKEY, JSON.stringify(o)); } catch (e) {} }
  function pollVoted() { try { return localStorage.getItem(VKEY); } catch (e) { return null; } }
  function pollResults(teams) {
    const wrap = $("gpoll-results"), bars = $("gpoll-bars"), tot = $("gpoll-total"); if (!wrap || !bars) return;
    const arr = Object.keys(teams || {}).map(function (k) { return { id: k, n: +teams[k] || 0 }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    if (!arr.length) { wrap.hidden = true; return; }
    const total = arr.reduce(function (s, x) { return s + x.n; }, 0), max = arr[0].n, mine = pollVoted();
    bars.innerHTML = arr.slice(0, 10).map(function (x) {
      const m = playerMeta[x.id] || {}, pct = Math.round(x.n / total * 100), w = Math.max(6, Math.round(x.n / max * 100));
      const badge = m.flag ? '<img class="champ__badge champ__badge--flag" src="' + esc(m.flag) + '" alt=""/>' : '<span class="champ__badge champ__badge--ph"></span>';
      return '<li class="champ__bar' + (x.id === mine ? " is-mine" : "") + '">' + badge +
        '<span class="champ__barname">' + esc(m.name || ("#" + x.id)) + (x.id === mine ? ' <span class="champ__you">✓ you</span>' : "") + "</span>" +
        '<span class="champ__track"><span class="champ__fill" style="width:' + w + '%"></span></span><span class="champ__pct">' + pct + "%</span></li>";
    }).join("");
    tot.textContent = total.toLocaleString() + (total === 1 ? " vote" : " votes");
    wrap.hidden = false;
  }
  function pollRefresh() {
    pollResults(pollLget());
    fetch(POLL_API + "?champ=1&ns=usopen", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.configured !== false && d.teams) pollResults(d.teams); }).catch(function () {});
  }
  function pollCast(id) {
    const t = pollLget(); t[id] = (t[id] || 0) + 1; pollLset(t);
    try { localStorage.setItem(VKEY, id); } catch (e) {}
    pollResults(t);
    fetch(POLL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ champ: 1, ns: "usopen", team: id }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.configured !== false && d.teams) pollResults(d.teams); }).catch(function () {});
  }
  function pollShow(id) {
    const nm = (playerMeta[id] || {}).name || ("#" + id);
    $("gpoll-saved").hidden = false; $("gpoll-saved").textContent = "Your pick: " + nm + " — locked in 🔒";
    const b = $("gpoll-share"); b.hidden = false; b.dataset.text = "My #catwifhat U.S. Open winner: " + nm + " 🏆🐱⛳\n$WIF, but on $USDC\ncatwifusdc.com";
  }
  function pollLock(id) { const sel = $("gpoll-select"); sel.value = id; sel.disabled = true; }
  function pollSetup(players) {
    const sel = $("gpoll-select"); if (!sel) return;
    const wrap = $("gpoll"); if (wrap) wrap.hidden = false;
    if (pollInit) return; pollInit = true;
    players.forEach(function (p) { const a = p.athlete || {}; const o = document.createElement("option"); o.value = String(p.id); o.textContent = a.displayName || ""; sel.appendChild(o); });
    const v = pollVoted(); if (v) { pollLock(v); pollShow(v); }
    pollRefresh();
    sel.addEventListener("change", function () {
      if (!sel.value || pollVoted()) return;
      pollLock(sel.value); pollShow(sel.value); pollCast(sel.value);
      if (window.__wifToast) window.__wifToast("Pick locked 🏆 — vote counted");
    });
    $("gpoll-share").addEventListener("click", function () {
      const t = $("gpoll-share").dataset.text || "", u = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(t);
      if (navigator.share) navigator.share({ text: t }).catch(function () { window.open(u, "_blank", "noopener"); }); else window.open(u, "_blank", "noopener");
    });
  }

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

    playerMeta = {};
    players.forEach(function (p) { const a = p.athlete || {}; playerMeta[String(p.id)] = { name: a.displayName || "", flag: (a.flag || {}).href || "" }; });
    if (players.length) pollSetup(players);

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
        loadCourse(ev.id);
        render(ev);
      })
      .catch(function () { clearTimeout(timer); timer = setTimeout(load, 30000); });
  }

  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else load(); });
  load();
})();
