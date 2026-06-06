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

  /* ---------- Scroll reveal (IntersectionObserver) ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    // Fallback: just show everything.
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

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

  /* ---------- PFP maker: pick-a-cat + recolor hat, or hat-on-your-photo ---------- */
  const pcanvas = document.getElementById("pfp-canvas");
  if (pcanvas) {
    const cctx = pcanvas.getContext("2d");
    const SIZE = pcanvas.width; // 1080
    const fileInput = document.getElementById("pfp-file");
    const uploadBtn = document.getElementById("pfp-upload-btn");
    const tabCat = document.getElementById("pfp-tab-cat");
    const tabUpload = document.getElementById("pfp-tab-upload");
    const catsWrap = document.getElementById("pfp-cats");
    const sizeSlider = document.getElementById("pfp-size");
    const rotSlider = document.getElementById("pfp-rotate");
    const flipBtn = document.getElementById("pfp-flip");
    const resetBtn = document.getElementById("pfp-reset");
    const dlBtn = document.getElementById("pfp-download");
    const colorInput = document.getElementById("pfp-hatcolor");
    const swatchWrap = document.getElementById("pfp-swatches");
    let catOnly = document.querySelectorAll(".pfp__catonly");
    const uploadOnly = document.querySelectorAll(".pfp__uploadonly");

    const HAT_DEF = "#2e5fd8";
    const CATS = [ { src: "og-catwifhat.JPG", label: "catwifhat" } ];

    let mode = "cat";
    let hatColor = HAT_DEF;
    let catSrc = CATS[0].src;
    let curCat = CATS[0];
    const catCache = {};
    let baseData = null; // cached pixels of the drawn cat (pre-recolor)

    // upload-mode hat overlay
    const hatImg = new Image();
    let hatReady = false;
    const tintCanvas = document.createElement("canvas");
    const tctx = tintCanvas.getContext("2d");
    let bg = null;
    function upState() { return { x: SIZE / 2, y: SIZE * 0.33, scale: 0.55, rot: 0, flip: false }; }
    let st = upState();

    function hexToRgb(h) {
      h = h.replace("#", "");
      if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
      const n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function drawCover(img) {
      const ratio = img.width / img.height;
      let dw, dh, dx, dy;
      if (ratio > 1) { dh = SIZE; dw = SIZE * ratio; dx = (SIZE - dw) / 2; dy = 0; }
      else { dw = SIZE; dh = SIZE / ratio; dx = 0; dy = (SIZE - dh) / 2; }
      cctx.drawImage(img, dx, dy, dw, dh);
    }

    /* ----- CAT MODE: recolor the blue hat in the chosen cat, per-pixel ----- */
    function loadCat(src) {
      catSrc = src;
      curCat = CATS.filter(function (c) { return c.src === src; })[0] || CATS[0];
      const cached = catCache[src];
      if (cached && cached.complete && cached.naturalWidth) { drawCatBase(cached); return; }
      const img = cached || (catCache[src] = new Image());
      img.onload = function () { drawCatBase(img); };
      if (!img.src) img.src = src;
    }
    function drawCatBase(img) {
      cctx.clearRect(0, 0, SIZE, SIZE);
      drawCover(img);
      baseData = cctx.getImageData(0, 0, SIZE, SIZE);
      recolorCat();
      updateDownload();
    }
    function recolorCat() {
      if (!baseData) return;
      if (hatColor === HAT_DEF) { cctx.putImageData(baseData, 0, 0); return; } // original
      const out = cctx.createImageData(SIZE, SIZE);
      out.data.set(baseData.data);
      const d = out.data, t = hexToRgb(hatColor);
      const tl = (0.299 * t.r + 0.587 * t.g + 0.114 * t.b) || 1;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (b > 90 && b - r > 18 && b - g > 10) { // blue hat pixel
          const f = (0.299 * r + 0.587 * g + 0.114 * b) / tl;
          d[i] = Math.min(255, t.r * f); d[i + 1] = Math.min(255, t.g * f); d[i + 2] = Math.min(255, t.b * f);
        }
      }
      cctx.putImageData(out, 0, 0);
    }

    /* ----- UPLOAD MODE: overlay a recolorable hat sticker ----- */
    function buildTint() {
      if (!hatReady) return;
      tintCanvas.width = hatImg.width; tintCanvas.height = hatImg.height;
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
      tctx.drawImage(hatImg, 0, 0);
      tctx.globalCompositeOperation = "color";
      tctx.fillStyle = hatColor;
      tctx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(hatImg, 0, 0);
      tctx.globalCompositeOperation = "source-over";
    }
    function renderUpload() {
      cctx.clearRect(0, 0, SIZE, SIZE);
      if (bg) { drawCover(bg); }
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

    function render() { if (mode === "cat") recolorCat(); else renderUpload(); }
    function updateDownload() {
      const ok = (mode === "cat" && baseData) || (mode === "upload" && bg);
      dlBtn.setAttribute("aria-disabled", ok ? "false" : "true");
    }

    function setMode(m) {
      mode = m;
      tabCat.classList.toggle("is-active", m === "cat");
      tabUpload.classList.toggle("is-active", m === "upload");
      catOnly.forEach(function (el) { el.hidden = (m !== "cat"); });
      uploadOnly.forEach(function (el) { el.hidden = (m !== "upload"); });
      pcanvas.style.cursor = (m === "upload") ? "grab" : "default";
      if (m === "cat") { loadCat(catSrc); }
      else { st = upState(); sizeSlider.value = 55; rotSlider.value = 0; buildTint(); renderUpload(); }
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

    // cat picker — only shown when there's more than one cat to choose from
    if (CATS.length > 1) {
      CATS.forEach(function (cat, i) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pfp__cat" + (i === 0 ? " is-active" : "");
        b.title = cat.label;
        const im = document.createElement("img");
        im.src = cat.src; im.alt = cat.label; im.loading = "lazy";
        b.appendChild(im);
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(catsWrap.children, function (x) { x.classList.remove("is-active"); });
          b.classList.add("is-active");
          loadCat(cat.src);
        });
        catsWrap.appendChild(b);
      });
    } else {
      // single cat: no picker needed (drop pfp__catonly so setMode won't reveal it)
      catsWrap.classList.remove("pfp__catonly");
      catsWrap.hidden = true;
      catOnly = document.querySelectorAll(".pfp__catonly"); // refresh: exclude the hidden picker
    }

    // hat sticker (for upload mode)
    hatImg.onload = function () { hatReady = true; buildTint(); if (mode === "upload") renderUpload(); };
    hatImg.src = "hat-sticker.png";

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
      if (mode === "cat") { loadCat(catSrc); }
      else { st = upState(); sizeSlider.value = 55; rotSlider.value = 0; buildTint(); renderUpload(); }
    });

    // drag hat (upload mode only)
    let dragging = false, last = null;
    function canvasPos(e) {
      const r = pcanvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * SIZE, y: (e.clientY - r.top) / r.height * SIZE };
    }
    pcanvas.addEventListener("pointerdown", function (e) { if (mode !== "upload") return; dragging = true; last = canvasPos(e); pcanvas.setPointerCapture(e.pointerId); });
    pcanvas.addEventListener("pointermove", function (e) { if (!dragging) return; const p = canvasPos(e); st.x += p.x - last.x; st.y += p.y - last.y; last = p; renderUpload(); });
    pcanvas.addEventListener("pointerup", function () { dragging = false; });
    pcanvas.addEventListener("pointercancel", function () { dragging = false; });
    pcanvas.addEventListener("wheel", function (e) {
      if (mode !== "upload") return;
      e.preventDefault();
      st.scale = Math.min(1.6, Math.max(0.1, st.scale - e.deltaY * 0.0008));
      sizeSlider.value = Math.round(st.scale * 100); renderUpload();
    }, { passive: false });

    // download
    dlBtn.addEventListener("click", function () {
      if (dlBtn.getAttribute("aria-disabled") === "true") return;
      pcanvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "my-catwifhat-pfp.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        showToast("PFP saved!");
      }, "image/png");
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
