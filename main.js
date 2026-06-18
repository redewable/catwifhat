/* ============================================================
   catwifhat ($WIF) — main.js
   Vanilla JS, no dependencies. Handles:
   - mobile nav toggle
   - copy-to-clipboard (CA) with toast
   - scroll-reveal fade-ups (IntersectionObserver)
   - cat easter egg (wobble + "meow" burst)
   ============================================================ */

(function () {
  "use strict";

  // Real contract address — single source of truth for copy actions.
  const CONTRACT_ADDRESS = "Hjj93YiyaFYY8zY2EW6FM2i2gd4rxzhoLCLFabrRpump";

  /* ---------- Mobile nav toggle ---------- */
  const burger = document.getElementById("burger");
  const links = document.querySelector(".nav__links");
  if (burger && links) {
    burger.addEventListener("click", function () {
      const open = links.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
    // Close menu after tapping a link (mobile)
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Toast ---------- */
  const toast = document.getElementById("toast");
  let toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || "copied!";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1800);
  }
  // expose for other page scripts (e.g. scores.js)
  window.__wifToast = showToast;

  /* ---------- Copy contract to clipboard ---------- */
  function copyContract() {
    // Modern clipboard API with a legacy fallback for non-secure contexts.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(CONTRACT_ADDRESS)
        .then(function () { showToast("copied!"); })
        .catch(function () { legacyCopy(); });
    } else {
      legacyCopy();
    }
  }
  function legacyCopy() {
    const ta = document.createElement("textarea");
    ta.value = CONTRACT_ADDRESS;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("copied!");
    } catch (e) {
      showToast("copy failed — select manually");
    }
    document.body.removeChild(ta);
  }

  document.querySelectorAll("[data-copy-ca]").forEach(function (btn) {
    btn.addEventListener("click", copyContract);
  });

  /* ---------- Live market stats ticker (DexScreener) ---------- */
  const ticker = document.getElementById("livestats");
  if (ticker) {
    const fmtUsd = function (n) {
      if (n == null || isNaN(n)) return "—";
      const a = Math.abs(n);
      if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
      if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
      if (a >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
      if (a >= 1) return "$" + n.toFixed(2);
      // sub-dollar (memecoin) price: keep ~4 significant digits
      return "$" + Number(n).toLocaleString("en-US", { maximumSignificantDigits: 4 });
    };
    const set = function (k, v) {
      const el = ticker.querySelector('[data-k="' + k + '"]');
      if (el) el.textContent = v;
    };
    function refreshStats() {
      fetch("https://api.dexscreener.com/latest/dex/tokens/" + CONTRACT_ADDRESS)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          const pairs = (data && data.pairs) || [];
          if (!pairs.length) return; // no market yet — leave the strip hidden
          // pick the deepest-liquidity pair
          pairs.sort(function (a, b) { return ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0); });
          const p = pairs[0];
          set("price", fmtUsd(parseFloat(p.priceUsd)));
          set("mcap", fmtUsd(p.marketCap != null ? p.marketCap : p.fdv));
          set("vol", fmtUsd((p.volume || {}).h24));
          set("liq", fmtUsd((p.liquidity || {}).usd));
          const ch = (p.priceChange || {}).h24;
          const chEl = ticker.querySelector('[data-k="change"]');
          if (chEl && ch != null) {
            const up = ch >= 0;
            chEl.textContent = (up ? "+" : "") + Number(ch).toFixed(2) + "%";
            chEl.classList.toggle("is-up", up);
            chEl.classList.toggle("is-down", !up);
          }
          ticker.hidden = false;
        })
        .catch(function () { /* network/API hiccup — keep last values */ });
    }
    refreshStats();
    setInterval(refreshStats, 30000);
  }

  /* ---------- Scroll reveal (IntersectionObserver) ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    // threshold:0 fires on ANY intersection — a percentage threshold can never be
    // met by elements taller than (viewport / threshold), e.g. the long meme grid,
    // which would otherwise stay opacity:0 and never reveal.
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    // Fallback: just show everything.
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Banner download buttons ---------- */
  document.querySelectorAll(".banner-item").forEach(function (fig) {
    const img = fig.querySelector("img");
    const cap = fig.querySelector("figcaption");
    if (!img || !cap || cap.querySelector(".banner__dl")) return;
    // Display is WebP; download the original JPG for max compatibility on X/Telegram.
    const orig = img.getAttribute("src").replace(/\.webp$/i, ".JPG");
    const a = document.createElement("a");
    a.className = "banner__dl";
    a.href = orig;
    a.download = orig.split("/").pop();
    a.setAttribute("aria-label", "Download banner");
    a.innerHTML = '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1zM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z"/></svg>Download';
    // Don't trigger the lightbox when tapping the download button.
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    cap.appendChild(a);
  });

  /* ---------- Meme gallery lightbox ---------- */
  const lightbox = document.getElementById("lightbox");
  if (lightbox) {
    const lbImg = document.getElementById("lightbox-img");
    const lbCap = document.getElementById("lightbox-cap");
    const lbClose = document.getElementById("lightbox-close");

    function openLightbox(src, alt, caption) {
      lbImg.src = src;
      lbImg.alt = alt || "";
      lbCap.textContent = caption || "";
      lightbox.classList.add("open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden"; // lock scroll behind overlay
    }
    function closeLightbox() {
      lightbox.classList.remove("open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      lbImg.src = "";
    }

    document.querySelectorAll(".meme-item img, .banner-item img").forEach(function (img) {
      img.addEventListener("click", function () {
        const cap = img.closest("figure").querySelector("figcaption");
        openLightbox(img.src, img.alt, cap ? cap.textContent : "");
      });
    });

    // Click anywhere on the overlay (or the X) closes it; clicking the image itself doesn't.
    lightbox.addEventListener("click", function (e) {
      if (e.target !== lbImg) closeLightbox();
    });
    lbClose.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
    });
  }

  /* ---------- PFP maker: recolor hat + drip + backgrounds, or hat-on-your-photo ---------- */
  const pcanvas = document.getElementById("pfp-canvas");
  if (pcanvas) {
    const cctx = pcanvas.getContext("2d");
    const SIZE = pcanvas.width; // 1080
    const fileInput = document.getElementById("pfp-file");
    const uploadBtn = document.getElementById("pfp-upload-btn");
    const tabCat = document.getElementById("pfp-tab-cat");
    const tabUpload = document.getElementById("pfp-tab-upload");
    const sizeSlider = document.getElementById("pfp-size");
    const rotSlider = document.getElementById("pfp-rotate");
    const flipBtn = document.getElementById("pfp-flip");
    const resetBtn = document.getElementById("pfp-reset");
    const dlBtn = document.getElementById("pfp-download");
    const colorInput = document.getElementById("pfp-hatcolor");
    const swatchWrap = document.getElementById("pfp-swatches");
    const accWrap = document.getElementById("pfp-acc");
    const bgWrap = document.getElementById("pfp-bg");
    const accCtrls = document.getElementById("pfp-accctrls");
    const accSizeSlider = document.getElementById("pfp-acc-size");
    const accRotSlider = document.getElementById("pfp-acc-rotate");
    const surpriseBtn = document.getElementById("pfp-surprise");
    const circleBtn = document.getElementById("pfp-circle");
    const circleCtrl = document.getElementById("pfp-circlectrl");
    const circleSizeSlider = document.getElementById("pfp-circle-size");
    const catSizeSlider = document.getElementById("pfp-cat-size");
    const shareXBtn = document.getElementById("pfp-sharex");
    const stage = pcanvas.parentElement;
    const catOnly = document.querySelectorAll(".pfp__catonly");
    const uploadOnly = document.querySelectorAll(".pfp__uploadonly");

    const HAT_DEF = "#2e5fd8";

    /* ---- Asset definitions ---- */
    // Accessories: cx/cy = center as fraction of canvas, w = width as fraction of canvas.
    // group = mutually-exclusive bucket (only one "eyes" accessory at a time).
    const ACCS = {
      aviators: { src: "acc-aviators.webp", label: "Aviators",   cx: 0.50, cy: 0.628, w: 0.50, group: "eyes" },
      thug:     { src: "acc-thug.webp",     label: "Thug shades", cx: 0.50, cy: 0.628, w: 0.52, group: "eyes" },
      lasers:   { src: "acc-lasers.webp",   label: "Laser eyes",  cx: 0.50, cy: 0.632, w: 0.86, group: "eyes" },
      chain:    { src: "acc-chain.webp",    label: "Gold chain",  cx: 0.50, cy: 0.900, w: 0.58, group: "chain" },
      halo:     { src: "acc-halo.webp",     label: "Halo",        cx: 0.50, cy: 0.115, w: 0.46, group: "halo" },
      wallet:   { src: "acc-wallet.webp",   label: "Wallet",      cx: 0.76, cy: 0.93,  w: 0.22, group: "wallet" },
      money:    { src: "acc-money.webp",    label: "Money bag",   cx: 0.24, cy: 0.93,  w: 0.24, group: "money" },
      trophy:   { src: "acc-trophy.webp",   label: "Trophy",      cx: 0.50, cy: 0.92,  w: 0.18, group: "trophy" },
      ball:     { src: "icon-ball.webp?v=3", label: "Soccer ball", cx: 0.74, cy: 0.86, w: 0.24, group: "ball" },
    };
    // Draw order (back to front). Halo behind the head reads better; chain on chest; props on top.
    const ACC_ORDER = ["halo", "chain", "aviators", "thug", "lasers", "wallet", "money", "trophy", "ball"];
    const BGS = {
      original: { src: "bg-original.jpg", label: "Original" },
      none:     { src: null,             label: "None" },
      mars:     { src: "bg-mars.jpg",     label: "Mars" },
      moon:     { src: "bg-moon.jpg",     label: "Moon" },
    };

    let mode = "cat";
    let hatColor = HAT_DEF;
    let bgKey = "original";
    // active accessory state: one per group
    const active = { eyes: null, chain: false, halo: false, wallet: false, money: false, trophy: false, ball: false };
    // per-accessory transform {cx, cy, w} — starts at the default, then user-adjustable
    const accT = {};
    let selectedAcc = null; // accessory currently targeted by the size slider / drag
    function tf(name) {
      if (!accT[name]) { const a = ACCS[name]; accT[name] = { cx: a.cx, cy: a.cy, w: a.w, rot: 0 }; }
      return accT[name];
    }
    function isActive(name) {
      const g = ACCS[name].group;
      return g === "eyes" ? active.eyes === name : !!active[g];
    }

    const imgCache = {};
    // Returns the (possibly still-loading) image. onReady fires once, on load completion,
    // for images that weren't already cached — callers check .complete themselves before drawing.
    function getImg(src, onReady) {
      if (!src) return null;
      let im = imgCache[src];
      if (im) return im;
      im = imgCache[src] = new Image();
      im.onload = function () { onReady && onReady(im); };
      im.src = src;
      return im;
    }

    // Cat subject + its recolor source pixels
    const catImg = new Image();
    let catReady = false;
    const catCanvas = document.createElement("canvas");
    catCanvas.width = catCanvas.height = SIZE;
    const catCtx = catCanvas.getContext("2d");
    let baseCat = null; // ImageData of the drawn cat (pre-recolor)
    // cat subject transform: scale (1 = full canvas width) + offset in canvas px
    let catScale = 1, catX = 0, catY = 0;
    function rebuildCat() { baseCat = null; renderCat(); }

    // upload-mode hat overlay
    const hatImg = new Image();
    let hatReady = false;
    const tintCanvas = document.createElement("canvas");
    const tctx = tintCanvas.getContext("2d");
    let bg = null; // uploaded photo
    function upState() { return { x: SIZE / 2, y: SIZE * 0.33, scale: 0.55, rot: 0, flip: false }; }
    let st = upState();

    function hexToRgb(h) {
      h = h.replace("#", "");
      if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
      const n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function drawCover(ctx, img) {
      const ratio = img.width / img.height;
      let dw, dh, dx, dy;
      if (ratio > 1) { dh = SIZE; dw = SIZE * ratio; dx = (SIZE - dw) / 2; dy = 0; }
      else { dw = SIZE; dh = SIZE / ratio; dx = 0; dy = (SIZE - dh) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    /* ----- CAT MODE ----- */
    // Build the cat layer (cat drawn full-width, top-anchored) into catCanvas, recolored.
    function buildCatLayer() {
      if (!catReady) return;
      if (!baseCat) {
        catCtx.clearRect(0, 0, SIZE, SIZE);
        const dw = SIZE * catScale, dh = dw * catImg.height / catImg.width;
        const dx = catX + (SIZE - dw) / 2, dy = catY; // centered horizontally, top-anchored, then offset
        catCtx.drawImage(catImg, dx, dy, dw, dh);
        baseCat = catCtx.getImageData(0, 0, SIZE, SIZE);
      }
      if (hatColor === HAT_DEF) { catCtx.putImageData(baseCat, 0, 0); return; }
      const out = catCtx.createImageData(SIZE, SIZE);
      out.data.set(baseCat.data);
      const d = out.data, t = hexToRgb(hatColor);
      const tl = (0.299 * t.r + 0.587 * t.g + 0.114 * t.b) || 1;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 80) continue; // transparent cutout area
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (b > 40 && b - r > 14 && b - g > 8 && b >= g) { // blue knit-hat pixel (incl. dark brim recesses)
          const f = (0.299 * r + 0.587 * g + 0.114 * b) / tl;
          d[i] = Math.min(255, t.r * f); d[i + 1] = Math.min(255, t.g * f); d[i + 2] = Math.min(255, t.b * f);
        }
      }
      catCtx.putImageData(out, 0, 0);
    }
    // geometry of an accessory on the canvas (null until its image has loaded)
    function accGeom(name) {
      const im = getImg(ACCS[name].src, renderCat);
      if (!im || !im.complete || !im.naturalWidth) return null;
      const t = tf(name);
      const w = SIZE * t.w, h = w * (im.naturalHeight / im.naturalWidth);
      return { cx: SIZE * t.cx, cy: SIZE * t.cy, w: w, h: h, rot: (t.rot || 0) * Math.PI / 180, img: im };
    }
    function drawAcc(name) {
      const g = accGeom(name);
      if (!g) return;
      cctx.save();
      cctx.translate(g.cx, g.cy);
      cctx.rotate(g.rot);
      cctx.drawImage(g.img, -g.w / 2, -g.h / 2, g.w, g.h);
      cctx.restore();
    }
    // point-in-accessory test that accounts for rotation (inverse-transform the point)
    function accContains(name, p) {
      const g = accGeom(name);
      if (!g) return false;
      const dx = p.x - g.cx, dy = p.y - g.cy, c = Math.cos(-g.rot), s = Math.sin(-g.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      return Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2;
    }
    // corner resize handles
    const HANDLE_R = 28;    // drawn radius (canvas units; canvas is 1080 wide)
    const HANDLE_HIT = 52;  // grab radius (forgiving for touch)
    function accCornerPts(g) {
      const hw = g.w / 2, hh = g.h / 2, c = Math.cos(g.rot), s = Math.sin(g.rot);
      return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (q) {
        return { x: g.cx + q[0] * c - q[1] * s, y: g.cy + q[0] * s + q[1] * c };
      });
    }
    function cornerHit(name, p) {
      const g = accGeom(name); if (!g) return false;
      const cs = accCornerPts(g);
      for (let i = 0; i < 4; i++) { if (Math.hypot(p.x - cs[i].x, p.y - cs[i].y) <= HANDLE_HIT) return true; }
      return false;
    }
    function renderCat() {
      cctx.clearRect(0, 0, SIZE, SIZE);
      const bgSrc = BGS[bgKey] && BGS[bgKey].src;
      if (bgSrc) {
        const bgi = getImg(bgSrc, renderCat);
        if (bgi && bgi.complete && bgi.naturalWidth) drawCover(cctx, bgi);
      }
      buildCatLayer();
      if (catReady) cctx.drawImage(catCanvas, 0, 0);
      ACC_ORDER.forEach(function (name) { if (isActive(name)) drawAcc(name); });
      // selection outline for the accessory the slider/drag will act on
      if (selectedAcc && isActive(selectedAcc)) {
        const g = accGeom(selectedAcc);
        if (g) {
          cctx.save();
          cctx.translate(g.cx, g.cy);
          cctx.rotate(g.rot);
          cctx.strokeStyle = "rgba(46,95,216,0.9)";
          cctx.lineWidth = 3;
          cctx.setLineDash([10, 8]);
          cctx.strokeRect(-g.w / 2, -g.h / 2, g.w, g.h);
          // draggable corner handles
          cctx.setLineDash([]);
          const hw = g.w / 2, hh = g.h / 2;
          [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (q) {
            cctx.beginPath(); cctx.arc(q[0], q[1], HANDLE_R, 0, Math.PI * 2);
            cctx.fillStyle = "#fff"; cctx.fill();
            cctx.lineWidth = 4; cctx.strokeStyle = "rgba(46,95,216,0.95)"; cctx.stroke();
          });
          cctx.restore();
        }
      }
    }

    /* ----- UPLOAD MODE: overlay a recolorable hat sticker ----- */
    function buildTint() {
      if (!hatReady) return;
      tintCanvas.width = hatImg.width; tintCanvas.height = hatImg.height;
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
      tctx.drawImage(hatImg, 0, 0);
      if (hatColor !== HAT_DEF) {
        tctx.globalCompositeOperation = "color";
        tctx.fillStyle = hatColor;
        tctx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
        tctx.globalCompositeOperation = "destination-in";
        tctx.drawImage(hatImg, 0, 0);
      }
      tctx.globalCompositeOperation = "source-over";
    }
    function renderUpload() {
      cctx.clearRect(0, 0, SIZE, SIZE);
      if (bg) { drawCover(cctx, bg); }
      else {
        cctx.fillStyle = "#EDE4DB"; cctx.fillRect(0, 0, SIZE, SIZE);
        cctx.fillStyle = "rgba(26,24,20,0.45)"; cctx.textAlign = "center";
        cctx.font = "600 40px Inter, system-ui, sans-serif";
        cctx.fillText("Choose a photo to start", SIZE / 2, SIZE / 2);
      }
      if (hatReady) {
        const w = SIZE * st.scale, h = w * (hatImg.height / hatImg.width);
        cctx.save();
        cctx.translate(st.x, st.y);
        cctx.rotate((st.rot * Math.PI) / 180);
        if (st.flip) cctx.scale(-1, 1);
        cctx.drawImage(tintCanvas, -w / 2, -h / 2, w, h);
        cctx.restore();
      }
    }

    function render() { if (mode === "cat") renderCat(); else renderUpload(); }
    function updateDownload() {
      const ok = (mode === "cat" && catReady) || (mode === "upload" && bg);
      dlBtn.setAttribute("aria-disabled", ok ? "false" : "true");
    }

    function setMode(m) {
      mode = m;
      tabCat.classList.toggle("is-active", m === "cat");
      tabUpload.classList.toggle("is-active", m === "upload");
      catOnly.forEach(function (el) { el.hidden = (m !== "cat"); });
      uploadOnly.forEach(function (el) { el.hidden = (m !== "upload"); });
      pcanvas.style.cursor = "default";
      if (m === "cat") { syncAccCtrls(); renderCat(); }
      else {
        accCtrls.hidden = true;
        // round-crop preview is a cat-mode tool — clear it when leaving
        stage.classList.remove("show-circle");
        circleBtn.classList.remove("is-active");
        circleBtn.setAttribute("aria-pressed", "false");
        circleCtrl.hidden = true;
        st = upState(); sizeSlider.value = 55; rotSlider.value = 0; buildTint(); renderUpload();
      }
      updateDownload();
    }

    function setColor(c) {
      hatColor = c.toLowerCase();
      Array.prototype.forEach.call(swatchWrap.children, function (s) {
        s.classList.toggle("is-active", s.dataset.color === hatColor);
      });
      if (mode === "upload") buildTint();
      render();
    }

    // swatches
    const PRESETS = ["#2e5fd8", "#e08a3c", "#e84393", "#22b07d", "#8e44ad", "#111111", "#f2f2f2"];
    PRESETS.forEach(function (c, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pfp__swatch" + (i === 0 ? " is-active" : "");
      b.style.background = c; b.dataset.color = c;
      b.setAttribute("aria-label", "Hat color " + c);
      b.addEventListener("click", function () { colorInput.value = c; setColor(c); });
      swatchWrap.appendChild(b);
    });
    colorInput.addEventListener("input", function () { setColor(colorInput.value); });

    // accessory chips (cat mode)
    function syncAccChips() {
      Array.prototype.forEach.call(accWrap.children, function (chip) {
        const name = chip.dataset.acc;
        const on = isActive(name);
        chip.classList.toggle("is-active", on);
        chip.setAttribute("aria-pressed", String(on));
      });
    }
    // show/hide the size slider and point it at the selected accessory
    function syncAccCtrls() {
      if (selectedAcc && !isActive(selectedAcc)) selectedAcc = null;
      const show = mode === "cat" && !!selectedAcc;
      accCtrls.hidden = !show;
      if (show) {
        accSizeSlider.value = Math.round(tf(selectedAcc).w * 100);
        accRotSlider.value = Math.round(tf(selectedAcc).rot || 0);
      }
    }
    Object.keys(ACCS).forEach(function (name) {
      const a = ACCS[name];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pfp__chip";
      chip.dataset.acc = name;
      chip.textContent = a.label;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        getImg(a.src, renderCat); // warm the cache
        if (a.group === "eyes") { active.eyes = (active.eyes === name) ? null : name; }
        else { active[a.group] = !active[a.group]; }
        // selecting an accessory makes it the drag/resize target; turning the last one off clears it
        selectedAcc = isActive(name) ? name : null;
        syncAccChips();
        syncAccCtrls();
        renderCat();
      });
      accWrap.appendChild(chip);
    });
    accSizeSlider.addEventListener("input", function () {
      if (!selectedAcc) return;
      tf(selectedAcc).w = accSizeSlider.value / 100;
      renderCat();
    });
    accRotSlider.addEventListener("input", function () {
      if (!selectedAcc) return;
      tf(selectedAcc).rot = +accRotSlider.value;
      renderCat();
    });
    catSizeSlider.addEventListener("input", function () {
      catScale = catSizeSlider.value / 100;
      rebuildCat();
    });

    // background chips (cat mode)
    function syncBgChips() {
      Array.prototype.forEach.call(bgWrap.children, function (chip) {
        chip.classList.toggle("is-active", chip.dataset.bg === bgKey);
      });
    }
    Object.keys(BGS).forEach(function (key) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pfp__chip" + (key === bgKey ? " is-active" : "");
      chip.dataset.bg = key;
      chip.textContent = BGS[key].label;
      chip.addEventListener("click", function () {
        bgKey = key;
        if (BGS[key].src) getImg(BGS[key].src, renderCat);
        syncBgChips();
        renderCat();
      });
      bgWrap.appendChild(chip);
    });

    // cat subject
    catImg.onload = function () { catReady = true; if (mode === "cat") renderCat(); updateDownload(); };
    catImg.src = "pfp-cat.webp";

    // "Rep your nation" — swap the base cat to a World Cup country cat.
    const nationSel = document.getElementById("pfp-nation");
    const colorsGroup = document.querySelector(".pfp__colors");
    if (nationSel) {
      nationSel.addEventListener("change", function () {
        const v = nationSel.value;
        // nation cats ship with their own beanie — hide the recolor and reset the subject transform
        hatColor = HAT_DEF;
        if (colorsGroup) colorsGroup.style.display = v ? "none" : "";
        catScale = 1; catX = 0; catY = 0; if (catSizeSlider) catSizeSlider.value = 100;
        baseCat = null; catReady = false;
        catImg.src = v ? (v + ".webp") : "pfp-cat.webp";
        if (window.__wifToast) window.__wifToast(v ? "Repping " + nationSel.options[nationSel.selectedIndex].text + " 🐱" : "Back to the OG cat 🐱");
      });
    }

    // hat sticker (upload mode) — uses the standalone beanie
    hatImg.onload = function () { hatReady = true; buildTint(); if (mode === "upload") renderUpload(); };
    hatImg.src = "acc-beanie.webp";

    // tabs + upload
    tabCat.addEventListener("click", function () { setMode("cat"); });
    tabUpload.addEventListener("click", function () { setMode("upload"); if (!bg) fileInput.click(); });
    uploadBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const img = new Image();
        img.onload = function () { bg = img; updateDownload(); renderUpload(); };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    // hat transform (upload mode)
    sizeSlider.addEventListener("input", function () { st.scale = sizeSlider.value / 100; renderUpload(); });
    rotSlider.addEventListener("input", function () { st.rot = +rotSlider.value; renderUpload(); });
    flipBtn.addEventListener("click", function () { st.flip = !st.flip; renderUpload(); });
    resetBtn.addEventListener("click", function () {
      hatColor = HAT_DEF; colorInput.value = "#2E5FD8";
      Array.prototype.forEach.call(swatchWrap.children, function (s) {
        s.classList.toggle("is-active", s.dataset.color === HAT_DEF);
      });
      if (mode === "cat") {
        active.eyes = null; active.chain = false; active.halo = false;
        active.wallet = false; active.money = false; active.trophy = false; active.ball = false;
        Object.keys(accT).forEach(function (k) { delete accT[k]; }); // restore default sizes/positions
        selectedAcc = null;
        bgKey = "original";
        catScale = 1; catX = 0; catY = 0; catSizeSlider.value = 100; baseCat = null;
        if (nationSel && nationSel.value) { nationSel.value = ""; if (colorsGroup) colorsGroup.style.display = ""; catReady = false; catImg.src = "pfp-cat.webp"; }
        syncAccChips(); syncBgChips(); syncAccCtrls(); renderCat();
      } else {
        st = upState(); sizeSlider.value = 55; rotSlider.value = 0; buildTint(); renderUpload();
      }
    });

    // ---- pointer input: drag (1 finger) + pinch zoom/rotate (2 fingers) ----
    // In cat mode a finger on an accessory drags it; a finger on empty canvas drags the cat.
    const pointers = new Map();
    let dragging = false, draggingCat = false, last = null, pinch = null, resizing = false, resizeStart = null;
    function canvasPos(e) {
      const r = pcanvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * SIZE, y: (e.clientY - r.top) / r.height * SIZE };
    }
    // topmost active accessory whose (rotated) box contains the point (front-to-back)
    function accAt(p) {
      for (let i = ACC_ORDER.length - 1; i >= 0; i--) {
        const name = ACC_ORDER[i];
        if (isActive(name) && accContains(name, p)) return name;
      }
      return null;
    }
    function norm180(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
    function twoPts() { const a = Array.from(pointers.values()); return [a[0], a[1]]; }
    function startPinch() {
      const [a, b] = twoPts();
      dragging = false; draggingCat = false;
      const d0 = Math.hypot(a.x - b.x, a.y - b.y), a0 = Math.atan2(b.y - a.y, b.x - a.x);
      if (mode === "upload") {
        pinch = { target: "hat", d0: d0, a0: a0, baseW: st.scale, baseRot: st.rot };
        return;
      }
      // cat mode: pinch the accessory under the fingers, else pinch the cat
      if (!selectedAcc || !isActive(selectedAcc)) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        selectedAcc = accAt(mid) || accAt(a) || accAt(b);
      }
      if (selectedAcc) {
        const t = tf(selectedAcc);
        pinch = { target: "acc", d0: d0, a0: a0, baseW: t.w, baseRot: t.rot || 0 };
        syncAccCtrls(); renderCat();
      } else if (catReady) {
        pinch = { target: "cat", d0: d0, a0: a0, baseW: catScale, baseRot: 0 };
      }
    }
    function movePinch() {
      const [a, b] = twoPts();
      if (!a || !b || !pinch) return;
      const scale = Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d0 || 1);
      const dRot = (Math.atan2(b.y - a.y, b.x - a.x) - pinch.a0) * 180 / Math.PI;
      if (pinch.target === "hat") {
        st.scale = Math.min(1.6, Math.max(0.1, pinch.baseW * scale));
        st.rot = pinch.baseRot + dRot;
        sizeSlider.value = Math.round(st.scale * 100); rotSlider.value = Math.round(norm180(st.rot));
        renderUpload();
      } else if (pinch.target === "cat") {
        catScale = Math.min(1.5, Math.max(0.55, pinch.baseW * scale));
        catSizeSlider.value = Math.round(catScale * 100);
        rebuildCat();
      } else {
        const t = tf(selectedAcc);
        t.w = Math.min(1.4, Math.max(0.15, pinch.baseW * scale));
        t.rot = pinch.baseRot + dRot;
        accSizeSlider.value = Math.round(t.w * 100); accRotSlider.value = Math.round(norm180(t.rot));
        renderCat();
      }
    }
    pcanvas.addEventListener("pointerdown", function (e) {
      const p = canvasPos(e);
      pointers.set(e.pointerId, p);
      pcanvas.setPointerCapture(e.pointerId);
      if (pointers.size === 2) { startPinch(); return; }
      if (mode === "upload") { dragging = true; last = p; return; }
      // cat mode: a corner handle of the selected accessory → resize
      if (selectedAcc && isActive(selectedAcc) && cornerHit(selectedAcc, p)) {
        const g = accGeom(selectedAcc);
        resizing = true;
        resizeStart = { d0: Math.hypot(p.x - g.cx, p.y - g.cy) || 1, baseW: tf(selectedAcc).w };
        pcanvas.style.cursor = "nwse-resize";
        return;
      }
      // grab an accessory, or drag the cat itself
      const hit = accAt(p);
      if (hit) {
        selectedAcc = hit; dragging = true; last = p;
        pcanvas.style.cursor = "grabbing";
        syncAccCtrls(); renderCat();
      } else {
        // clicked empty space → deselect (clears the edit box) and drag the cat
        if (selectedAcc) { selectedAcc = null; syncAccCtrls(); }
        if (catReady) { draggingCat = true; last = p; pcanvas.style.cursor = "grabbing"; }
        renderCat();
      }
    });
    pcanvas.addEventListener("pointermove", function (e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, canvasPos(e));
      if (pinch && pointers.size >= 2) { movePinch(); return; }
      if (mode === "cat") {
        if (resizing && selectedAcc) {
          const p = canvasPos(e), g = accGeom(selectedAcc);
          const d = Math.hypot(p.x - g.cx, p.y - g.cy), t = tf(selectedAcc);
          t.w = Math.min(1.4, Math.max(0.15, resizeStart.baseW * (d / resizeStart.d0)));
          accSizeSlider.value = Math.round(t.w * 100);
          renderCat();
          return;
        }
        if (draggingCat) {
          const p = canvasPos(e); catX += p.x - last.x; catY += p.y - last.y; last = p; rebuildCat();
          return;
        }
        if (!dragging) {
          const hp = canvasPos(e);
          pcanvas.style.cursor = (selectedAcc && isActive(selectedAcc) && cornerHit(selectedAcc, hp)) ? "nwse-resize" : (accAt(hp) ? "grab" : "move");
          return;
        }
        const p = canvasPos(e), t = tf(selectedAcc);
        t.cx += (p.x - last.x) / SIZE; t.cy += (p.y - last.y) / SIZE; last = p;
        renderCat();
        return;
      }
      if (!dragging) return;
      const p = canvasPos(e); st.x += p.x - last.x; st.y += p.y - last.y; last = p; renderUpload();
    });
    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) { dragging = false; draggingCat = false; resizing = false; resizeStart = null; if (mode === "cat") pcanvas.style.cursor = "default"; }
    }
    pcanvas.addEventListener("pointerup", endPointer);
    pcanvas.addEventListener("pointercancel", endPointer);
    pcanvas.addEventListener("wheel", function (e) {
      if (mode === "cat") {
        e.preventDefault();
        if (selectedAcc) {
          const t = tf(selectedAcc);
          t.w = Math.min(1.4, Math.max(0.15, t.w - e.deltaY * 0.0008));
          accSizeSlider.value = Math.round(t.w * 100); renderCat();
        } else if (catReady) {
          catScale = Math.min(1.5, Math.max(0.55, catScale - e.deltaY * 0.0008));
          catSizeSlider.value = Math.round(catScale * 100); rebuildCat();
        }
        return;
      }
      if (mode !== "upload") return;
      e.preventDefault();
      st.scale = Math.min(1.6, Math.max(0.1, st.scale - e.deltaY * 0.0008));
      sizeSlider.value = Math.round(st.scale * 100); renderUpload();
    }, { passive: false });

    // save / share
    function downloadDataUrl(dataUrl) {
      const a = document.createElement("a");
      a.href = dataUrl; a.download = "my-catwifhat-pfp.png";
      document.body.appendChild(a); a.click(); a.remove();
    }
    function dataUrlToFile(dataUrl, name) {
      const arr = dataUrl.split(",");
      const mime = (arr[0].match(/:(.*?);/) || [])[1] || "image/png";
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8 = new Uint8Array(n);
      while (n--) u8[n] = bstr.charCodeAt(n);
      return new File([u8], name, { type: mime });
    }
    // Render once without the selection outline and return the PNG data URL.
    function exportPng() {
      let restore = null;
      if (mode === "cat" && selectedAcc) {
        const keep = selectedAcc; selectedAcc = null; renderCat();
        restore = function () { selectedAcc = keep; renderCat(); };
      }
      const url = pcanvas.toDataURL("image/png");
      if (restore) restore();
      return url;
    }
    function canExport() { return mode === "cat" ? catReady : !!bg; }
    // Mobile gets the native share sheet (iOS "Save Image" → Photos); desktop
    // downloads the PNG straight to disk — which is what desktop users expect.
    const isMobile = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
    dlBtn.addEventListener("click", function () {
      if (dlBtn.getAttribute("aria-disabled") === "true") return;
      // Build the PNG synchronously so the share sheet still counts as a user tap (iOS).
      const dataUrl = exportPng();
      const file = dataUrlToFile(dataUrl, "my-catwifhat-pfp.png");
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "catwifhat", text: "my catwifhat 🐱🧢" })
          .then(function () { showToast("saved!"); })
          .catch(function (err) {
            if (err && err.name === "AbortError") return; // user dismissed the sheet
            downloadDataUrl(dataUrl);                      // fallback if share fails
          });
      } else {
        downloadDataUrl(dataUrl);                          // desktop → direct download
        showToast("PFP downloaded!");
      }
    });

    /* ---- Share to X ---- */
    const SHARE_TEXT = "I made my #catwifhat 🐱🧢\n$WIF, but on $USDC\ncatwifusdc.com";
    function openXIntent(dataUrl) {
      // X's web composer can't attach an image, so save it and open the tweet box with text.
      downloadDataUrl(dataUrl);
      showToast("image saved — attach it to your post!");
      window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(SHARE_TEXT), "_blank", "noopener");
    }
    shareXBtn.addEventListener("click", function () {
      if (!canExport()) { showToast("make your cat first!"); return; }
      const dataUrl = exportPng();
      const file = dataUrlToFile(dataUrl, "my-catwifhat-pfp.png");
      // Mobile: the native sheet lets them post straight to X with the image attached.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: SHARE_TEXT })
          .then(function () { showToast("shared!"); })
          .catch(function (err) {
            if (err && err.name === "AbortError") return;
            openXIntent(dataUrl);
          });
      } else {
        openXIntent(dataUrl);
      }
    });

    /* ---- Surprise me: randomize hat color + drip + background ---- */
    const SURPRISE_COLORS = ["#2e5fd8", "#e08a3c", "#e84393", "#22b07d", "#8e44ad", "#111111", "#f2f2f2", "#ff5a36", "#00b3d6", "#ffd400", "#7b3fe4"];
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    surpriseBtn.addEventListener("click", function () {
      if (mode !== "cat") setMode("cat");
      const col = pick(SURPRISE_COLORS);
      hatColor = col; colorInput.value = col.toUpperCase();
      Array.prototype.forEach.call(swatchWrap.children, function (s) {
        s.classList.toggle("is-active", s.dataset.color === hatColor);
      });
      active.eyes = pick([null, "aviators", "thug", "lasers"]);
      active.chain = Math.random() < 0.5;
      active.halo = Math.random() < 0.35;
      active.wallet = Math.random() < 0.25;
      active.money = Math.random() < 0.25;
      active.trophy = Math.random() < 0.2;
      active.ball = Math.random() < 0.25;
      Object.keys(accT).forEach(function (k) { delete accT[k]; }); // clean default placements
      selectedAcc = null;
      bgKey = pick(Object.keys(BGS));
      if (BGS[bgKey].src) getImg(BGS[bgKey].src, renderCat);
      ACC_ORDER.forEach(function (n) { if (isActive(n)) getImg(ACCS[n].src, renderCat); });
      syncAccChips(); syncBgChips(); syncAccCtrls(); renderCat();
      showToast("surprise! 🎲");
    });

    /* ---- Round-crop preview toggle + size ---- */
    circleBtn.addEventListener("click", function () {
      const on = stage.classList.toggle("show-circle");
      circleBtn.classList.toggle("is-active", on);
      circleBtn.setAttribute("aria-pressed", String(on));
      circleCtrl.hidden = !on;
    });
    circleSizeSlider.addEventListener("input", function () {
      stage.style.setProperty("--cr", circleSizeSlider.value + "%");
    });

    // init — force default colors (ignore any browser-restored input values)
    colorInput.value = "#2E5FD8";
    hatColor = HAT_DEF;
    Array.prototype.forEach.call(swatchWrap.children, function (s) {
      s.classList.toggle("is-active", s.dataset.color === HAT_DEF);
    });
    setMode("cat");
  }

  /* ---------- Cat easter egg: wobble + "meow" burst ---------- */
  const cat = document.getElementById("hero-cat");
  if (cat) {
    const meows = ["meow", "mrrp", "meow!", "nyaa", "purr", "mew"];
    let meowIdx = 0;

    cat.addEventListener("click", function (e) {
      // Wobble (restart animation cleanly)
      cat.classList.remove("wobble");
      void cat.offsetWidth; // force reflow
      cat.classList.add("wobble");

      // Spawn a floating "meow" text burst near the click point
      const burst = document.createElement("span");
      burst.className = "meow-burst";
      burst.textContent = meows[meowIdx % meows.length];
      meowIdx++;
      const rect = cat.getBoundingClientRect();
      const x = e.clientX || (rect.left + rect.width / 2);
      const y = e.clientY || (rect.top + rect.height / 3);
      burst.style.left = x + "px";
      burst.style.top = y + "px";
      document.body.appendChild(burst);
      setTimeout(function () { burst.remove(); }, 900);
    });
  }
})();

/* ============================================================
   Per-page view counter — shows a live count in the sub-footer.
   Counts once per browser session per page; degrades silently if
   the /api/views backend (Upstash Redis) isn't configured.
   ============================================================ */
(function viewCounter() {
  function slugify() {
    var file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    var slug = file.replace(/\.html$/, "");
    if (!slug || slug === "index") slug = "home";
    slug = slug.replace(/[^a-z0-9_-]/g, "").slice(0, 40);
    return slug || "home";
  }
  function show(n) {
    var el = document.getElementById("viewcount");
    if (!el) {
      el = document.createElement("p");
      el.id = "viewcount";
      el.className = "subfooter";
      var wrap = document.querySelector(".footer .section__wrap") || document.querySelector(".footer") || document.body;
      wrap.appendChild(el);
    }
    el.innerHTML = '🐾 <strong>' + Number(n).toLocaleString() + "</strong> paws have wandered through this page";
    el.hidden = false;
  }
  try {
    // Count every page load (classic hit counter) so the number visibly climbs.
    var slug = slugify();
    fetch("/api/views?page=" + encodeURIComponent(slug) + "&hit=1", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.configured !== false && d.views != null) show(d.views); })
      .catch(function () {});
  } catch (e) {}
})();
