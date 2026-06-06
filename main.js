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

  /* ---------- PFP maker: cat-first "wif the hat" generator ---------- */
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

    // Exact placement of the hat sticker back over the cat it was cut from
    const HAT_ON_CAT = { cx: 0.5396, cy: 0.3775, scale: 0.6575 };

    const hatImg = new Image();
    let hatReady = false;
    const tintCanvas = document.createElement("canvas");
    const tctx = tintCanvas.getContext("2d");
    let hatColor = "#2e5fd8";

    const catImg = new Image();
    let catReady = false;

    let bg = null;       // uploaded image
    let mode = "cat";    // 'cat' | 'upload'
    const catState = function () { return { x: HAT_ON_CAT.cx * SIZE, y: HAT_ON_CAT.cy * SIZE, scale: HAT_ON_CAT.scale, rot: 0, flip: false }; };
    const upState = function () { return { x: SIZE / 2, y: SIZE * 0.33, scale: 0.55, rot: 0, flip: false }; };
    let st = catState();

    // Recolor the hat: keep its knit shading (luminance), apply chosen hue/sat
    function buildTint() {
      if (!hatReady) return;
      tintCanvas.width = hatImg.width;
      tintCanvas.height = hatImg.height;
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
      tctx.drawImage(hatImg, 0, 0);
      tctx.globalCompositeOperation = "color";
      tctx.fillStyle = hatColor;
      tctx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
      tctx.globalCompositeOperation = "destination-in"; // clip back to hat shape
      tctx.drawImage(hatImg, 0, 0);
      tctx.globalCompositeOperation = "source-over";
    }

    function drawCover(img) {
      const ratio = img.width / img.height;
      let dw, dh, dx, dy;
      if (ratio > 1) { dh = SIZE; dw = SIZE * ratio; dx = (SIZE - dw) / 2; dy = 0; }
      else { dw = SIZE; dh = SIZE / ratio; dx = 0; dy = (SIZE - dh) / 2; }
      cctx.drawImage(img, dx, dy, dw, dh);
    }

    function render() {
      cctx.clearRect(0, 0, SIZE, SIZE);
      if (mode === "cat" && catReady) {
        drawCover(catImg);
      } else if (mode === "upload" && bg) {
        drawCover(bg);
      } else {
        cctx.fillStyle = "#EDE4DB";
        cctx.fillRect(0, 0, SIZE, SIZE);
        cctx.fillStyle = "rgba(26,24,20,0.45)";
        cctx.textAlign = "center";
        cctx.font = "600 40px Inter, system-ui, sans-serif";
        cctx.fillText("Choose a photo to start", SIZE / 2, SIZE / 2);
      }
      if (hatReady) {
        const w = SIZE * st.scale;
        const h = w * (hatImg.height / hatImg.width);
        cctx.save();
        cctx.translate(st.x, st.y);
        cctx.rotate((st.rot * Math.PI) / 180);
        if (st.flip) cctx.scale(-1, 1);
        cctx.drawImage(tintCanvas, -w / 2, -h / 2, w, h);
        cctx.restore();
      }
    }

    function updateDownload() {
      const ok = (mode === "cat" && catReady) || (mode === "upload" && bg);
      dlBtn.setAttribute("aria-disabled", ok ? "false" : "true");
    }

    function syncSliders() {
      sizeSlider.value = Math.round(st.scale * 100);
      rotSlider.value = st.rot;
    }

    function setMode(m) {
      mode = m;
      tabCat.classList.toggle("is-active", m === "cat");
      tabUpload.classList.toggle("is-active", m === "upload");
      uploadBtn.hidden = (m !== "upload");
      st = (m === "cat") ? catState() : upState();
      syncSliders();
      updateDownload();
      render();
    }

    // images
    hatImg.onload = function () { hatReady = true; buildTint(); render(); };
    hatImg.src = "hat-sticker.png";
    catImg.onload = function () { catReady = true; updateDownload(); render(); };
    catImg.src = "cat-wif-grillz.JPG";

    // color swatches + wheel
    const PRESETS = ["#2e5fd8", "#e08a3c", "#e84393", "#22b07d", "#8e44ad", "#111111", "#f2f2f2"];
    function setColor(c) {
      hatColor = c.toLowerCase();
      buildTint();
      Array.prototype.forEach.call(swatchWrap.children, function (s) {
        s.classList.toggle("is-active", s.dataset.color === hatColor);
      });
      render();
    }
    PRESETS.forEach(function (c, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pfp__swatch" + (i === 0 ? " is-active" : "");
      b.style.background = c;
      b.dataset.color = c;
      b.setAttribute("aria-label", "Hat color " + c);
      b.addEventListener("click", function () { colorInput.value = c; setColor(c); });
      swatchWrap.appendChild(b);
    });
    colorInput.addEventListener("input", function () { setColor(colorInput.value); });

    // controls
    tabCat.addEventListener("click", function () { setMode("cat"); });
    tabUpload.addEventListener("click", function () {
      setMode("upload");
      if (!bg) fileInput.click();
    });
    uploadBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const img = new Image();
        img.onload = function () { bg = img; updateDownload(); render(); };
        img.src = ev.target.result; // data URL keeps canvas exportable
      };
      reader.readAsDataURL(file);
    });

    sizeSlider.addEventListener("input", function () { st.scale = sizeSlider.value / 100; render(); });
    rotSlider.addEventListener("input", function () { st.rot = +rotSlider.value; render(); });
    flipBtn.addEventListener("click", function () { st.flip = !st.flip; render(); });
    resetBtn.addEventListener("click", function () {
      st = (mode === "cat") ? catState() : upState();
      syncSliders(); render();
    });

    // drag the hat
    let dragging = false, last = null;
    function canvasPos(e) {
      const r = pcanvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * SIZE, y: (e.clientY - r.top) / r.height * SIZE };
    }
    pcanvas.addEventListener("pointerdown", function (e) { dragging = true; last = canvasPos(e); pcanvas.setPointerCapture(e.pointerId); });
    pcanvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      const p = canvasPos(e);
      st.x += p.x - last.x; st.y += p.y - last.y; last = p; render();
    });
    pcanvas.addEventListener("pointerup", function () { dragging = false; });
    pcanvas.addEventListener("pointercancel", function () { dragging = false; });
    pcanvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      st.scale = Math.min(1.6, Math.max(0.1, st.scale - e.deltaY * 0.0008));
      sizeSlider.value = Math.round(st.scale * 100); render();
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

    render();
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
