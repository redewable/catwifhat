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

    document.querySelectorAll(".meme-item img").forEach(function (img) {
      img.addEventListener("click", function () {
        const cap = img.closest(".meme-item").querySelector("figcaption");
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
