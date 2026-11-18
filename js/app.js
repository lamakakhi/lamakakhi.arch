/* ==========================================================================
   Site engine. You shouldn't need to edit this file — edit js/content.js
   (or use the site editor at your-site/admin).
   ========================================================================== */
(function (G_SITE, G_PROJECTS) {
  "use strict";
  // "Preview changes" from the site editor shows the unpublished draft
  const DRAFT = (() => { try { if (/[?&]preview=1/.test(location.search)) { const d = JSON.parse(localStorage.getItem("lk-draft") || "null"); if (d && d.SITE && Array.isArray(d.PROJECTS)) return d; } } catch (e) { } return null; })();
  const SITE = DRAFT ? DRAFT.SITE : G_SITE, PROJECTS = DRAFT ? DRAFT.PROJECTS : G_PROJECTS;
  const $ = (s, e = document) => e.querySelector(s);
  const $$ = (s, e = document) => [...e.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const two = n => String(n).padStart(2, "0");
  const num = i => two(i + 1);
  const view = $("#view"), root = document.documentElement;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const YEAR = new Date().getFullYear();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ---------- performance: "lite" mode for slow or software-rendered devices ---------- */
  const QS = new URLSearchParams(location.search);
  function softwareGPU() {
    try {
      const g = document.createElement("canvas").getContext("webgl");
      if (!g) return true;
      const ext = g.getExtension("WEBGL_debug_renderer_info");
      const r = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
    } catch (e) { return false; }
  }
  let LITE = QS.get("lite") === "1" ? true : QS.get("lite") === "0" ? false :
    !!(reduce || (navigator.connection && navigator.connection.saveData) ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4) || softwareGPU());
  if (LITE) root.classList.add("lite");

  /* ---------- images: smaller versions (name.sm.jpg / name.md.jpg) when available ---------- */
  window.lkImg = img => { if (img.dataset.fixed) return; img.dataset.fixed = "1"; img.removeAttribute("srcset"); if (img.dataset.full) img.src = img.dataset.full; };
  const hasVariants = s => typeof s === "string" && /^images\/.+\.jpe?g$/i.test(s) && !/\.(sm|md)\.jpe?g$/i.test(s);
  const variant = (s, tag) => s.replace(/\.(jpe?g)$/i, `.${tag}.$1`);
  function pic(src, sizes, { cls = "", alt = "", eager = false } = {}) {
    const ss = hasVariants(src) ? ` srcset="${esc(variant(src, "sm"))} 800w, ${esc(variant(src, "md"))} 1600w, ${esc(src)} 2200w" sizes="${sizes}" data-full="${esc(src)}" onerror="lkImg(this)"` : "";
    return `<img class="${cls}" src="${esc(src)}"${ss} alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async">`;
  }

  /* ---------- placeholder drawings (only for projects without photos yet) ---------- */
  const PALS = [["#d9d2c5", "#efe9dd", "#3b3a37", "#8c8577"], ["#aeb9b8", "#dfe6e4", "#26302f", "#5f6e6c"], ["#d6b99a", "#f0dfc9", "#4a3322", "#9b7552"], ["#d9a58b", "#f3d9c9", "#4a2418", "#a4553a"]];
  function placeholder(seed) {
    let s = (seed + 1) * 9301 % 233280; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const p = PALS[seed % PALS.length], W = 1600, H = 1000, G = 790;
    let g = `<rect width="${W}" height="${H}" fill="${p[0]}"/><circle cx="${200 + r() * 1200}" cy="${200 + r() * 120}" r="60" fill="${p[1]}"/>`;
    let x = 140 + r() * 120;
    for (let i = 0; i < 4 && x < W - 260; i++) { const w = 220 + r() * 260, h = 160 + r() * 380; g += `<rect x="${x}" y="${G - h}" width="${w}" height="${h}" fill="${i % 2 ? p[3] : p[2]}"/>`; x += w + 30 + r() * 60; }
    g += `<rect y="${G}" width="${W}" height="${H - G}" fill="${p[2]}"/>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${g}</svg>`);
  }
  const cover = (p, i) => p.cover || (p.images && p.images[0] && p.images[0].src) || placeholder(i * 3);
  const heroImg = (p, i) => typeof p.hero === "string" ? p.hero : cover(p, i);
  const heroList = () => { const all = PROJECTS.map((p, i) => ({ p, i })); const l = all.filter(o => o.p.hero !== false); return l.length ? l : all; };
  const gallery = (p, i) => (p.images && p.images.length) ? p.images : [0, 1, 2].map(n => ({ src: placeholder(i * 3 + n + 1), caption: "Placeholder — add photos in content.js" }));
  const metaLine = p => [p.year, p.location].filter(Boolean).map(esc).join(" &nbsp;•&nbsp; ");
  const masked = (text, start = 0) => String(text).split(/\s+/).map((w, k) => `<span class="mask"><span style="--i:${start + k}">${esc(w)}</span></span>`).join(" ");
  function lit(text) { // statement words; *stars* = accent
    let em = false;
    return String(text).split(/\s+/).map(t => {
      let s = t, end = false;
      if (s.startsWith("*")) { em = true; s = s.slice(1); }
      const m = s.match(/^(.*)\*([^\w]*)$/); if (m) { s = m[1] + m[2]; end = true; }
      const out = `<span class="w${em ? " em" : ""}">${esc(s)}</span>`; if (end) em = false; return out;
    }).join(" ");
  }
  function imagePool() {
    const seen = new Set(), out = [];
    PROJECTS.forEach((p, i) => [cover(p, i), ...(p.images || []).slice(0, 3).map(m => m.src)].forEach(s => { if (s && !seen.has(s)) { seen.add(s); out.push(s); } }));
    return out;
  }
  const socials = () => [SITE.instagram && ["Instagram", SITE.instagram], SITE.linkedin && ["LinkedIn", SITE.linkedin], SITE.cv && ["CV", SITE.cv]].filter(Boolean);

  /* ---------- shared footer ---------- */
  const footer = () => `
  <footer>
    <div class="f-grid">
      <div><p class="caps label" style="margin-bottom:14px">${esc(SITE.role)}</p><p>${esc(SITE.tagline)}</p></div>
      <div><h4 class="caps">Navigate</h4><a href="#/" data-go="top">Home</a><a href="#/" data-go="work">Work</a><a href="#/" data-go="about">About</a><a href="#/" data-go="contact">Contact</a></div>
      <div><h4 class="caps">Projects</h4>${PROJECTS.map(p => `<a href="#/p/${p.slug}">${esc(p.title)}</a>`).join("")}</div>
      <div><h4 class="caps">Contact</h4><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>${socials().map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${s[0]}</a>`).join("")}</div>
    </div>
    <div class="f-name"><span class="fitline"><span class="fit">${esc(SITE.name)}</span></span></div>
    <div class="f-base caps"><span>© ${YEAR} ${esc(SITE.name)}</span><a href="#/" data-go="top">Back to top ↑</a></div>
  </footer>`;

  /* ---------- HOME ---------- */
  function renderHome() {
    document.title = `${SITE.name} — ${SITE.role}`;
    const hl = heroList(), first = hl[0];
    const lines = innerWidth < 700 ? SITE.name.split(" ") : [SITE.name];
    let li = 0;
    const nameHTML = lines.map(l => `<span class="fitline"><span class="fit hero-name">${[...l].map(c => c === " " ? "&nbsp;" : `<span class="mask"><span style="--i:${li++}">${esc(c)}</span></span>`).join("")}</span></span>`).join("");
    const disc = SITE.disciplines || [], xp = SITE.expertise || [];
    const strip = arr => { const one = arr.map(d => `<span>${esc(d)}</span><i>✦</i>`).join(""); return one + one + one + one; };
    const pool = imagePool(), rowA = pool.filter((_, k) => k % 2 === 0), rowB = pool.filter((_, k) => k % 2 === 1);
    const imgs = arr => arr.map(s => pic(s, "(max-width:820px) 60vw, 26vw", { cls: "fade" })).join("");
    const notes = (SITE.heroNotes || []).map(esc).join(" &nbsp;//&nbsp; ");

    view.innerHTML = `
    <section class="hero" id="top">
      <div class="hero-media"><div class="hero-move">${hl.map((o, k) => `<div class="slide${k ? "" : " on"}">${pic(heroImg(o.p, o.i), "100vw", { eager: !k })}</div>`).join("")}</div></div>
      <div class="hero-dim"></div><div class="hero-shade"></div><div class="hero-grain"></div>
      <div class="hero-top">
        <p class="h-role">${esc(SITE.role).replace("&amp;", "<em>&amp;</em>")}</p>
        <p class="h-tag">${esc(SITE.tagline)}</p>
        <a class="h-cap" id="heroCap" href="#/p/${first.p.slug}" data-cursor="Open">
          <span class="caps" id="capN">Featured ${two(1)} / ${two(hl.length)}</span><strong id="capT">${esc(first.p.title)}</strong>
          <span class="caps">View project →</span><span class="bar"><i id="capBar"></i></span>
        </a>
      </div>
      <div class="hero-bottom">
        <div class="h-row caps"><span>Portfolio © ${YEAR}</span>${notes ? `<span class="notes">${notes}</span>` : ""}<a href="#/" data-go="intro"><span class="roll"><span data-t="Scroll ↓">Scroll ↓</span></span></a></div>
        <h1 class="hero-h1">${nameHTML}</h1>
      </div>
    </section>

    <div class="above">
      ${SITE.statement ? `<section class="statement" id="intro"><p class="caps label">(01) — Intro</p><p class="st-text">${lit(SITE.statement)}</p></section>` : `<span id="intro"></span>`}

      ${disc.length ? `<div class="smq" data-dir="1"><div class="smq-move"><div class="smq-track">${strip(disc)}</div></div></div><div class="smq outline" data-dir="-1"><div class="smq-move"><div class="smq-track">${strip([...disc].reverse())}</div></div></div>` : ""}

      <section class="work" id="work">
        <div class="sec-head rv"><div><span class="caps sec-num">(02) — Selected work</span><h2 class="big">Selected<br><span class="light">work</span></h2></div>
          <p>${two(PROJECTS.length)} projects across architecture, urban design and building performance. Hover to explore — click to step inside.</p></div>
        <div class="acc" id="acc">${PROJECTS.map((p, i) => `
          <a class="panel" href="#/p/${p.slug}" data-cursor="Open">
            <div class="pimg">${pic(cover(p, i), "(max-width:820px) 100vw, 72vw")}</div><div class="pdim"></div>
            <span class="pnum">${num(i)}</span><span class="pvert">${esc(p.title)}</span>
            <div class="pinfo"><h3>${esc(p.title)}</h3><div><p class="caps meta">${metaLine(p)}</p><p class="sum">${esc(p.summary)}</p></div><span class="pbtn caps">View project →</span></div>
          </a>`).join("")}
        </div>
        <div class="acc-hint caps"><span>← Hover to expand →</span><span>Click to open</span></div>
      </section>

      ${xp.length ? `<section class="expertise" id="expertise">
        <div class="sec-head rv"><div><span class="caps sec-num">(03) — Expertise</span><h2 class="big">What <span class="light">I do</span></h2></div><p>From the first sketch to the energy model — design, analysis and visual storytelling.</p></div>
        <div class="xlist">${xp.map((x, k) => `
          <div class="xrow${k ? "" : " open"}">
            <button class="xhead" aria-expanded="${!k}"><span class="caps xn">${num(k)}</span><span class="xt">${esc(x[0])}</span><span class="xplus"></span></button>
            <div class="xbody"><div class="xinner"><div class="xgrid"><p>${esc(x[1])}</p>${x[2] ? `<div class="ximg"><div>${pic(x[2], "(max-width:820px) 100vw, 34vw")}</div></div>` : ""}</div></div></div>
          </div>`).join("")}</div>
      </section>` : ""}

      <section class="about" id="about">
        <div class="imq" style="--dur:${rowA.length * 9}s"><div class="imq-track">${imgs(rowA)}${imgs(rowA)}</div></div>
        <div class="about-mid${SITE.about.photo ? " has-photo" : ""}">
          ${SITE.about.photo ? `
          <figure class="portrait rv">
            <div class="arch-wrap">
              <span class="arch-line" aria-hidden="true"></span>
              <div class="arch"><div class="arch-in" role="img" aria-label="${esc(SITE.name)}" style="background-image:url('${esc(SITE.about.photo)}')"></div><div class="tone"></div></div>
              <span class="dim dim-w" aria-hidden="true"><i></i><b>${esc(SITE.name)}</b><i></i></span>
              <span class="dim dim-h" aria-hidden="true"><i></i><b>${esc(SITE.role)}</b><i></i></span>
            </div>
            <figcaption class="caps">Fig. 04 — Portrait</figcaption>
          </figure>` : ""}
          <p class="caps label">(04) — About</p>
          <p class="about-lead rv">${esc(SITE.about.intro)}</p>
          <dl class="rv">${SITE.about.facts.map(f => `<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join("")}</dl>
        </div>
        <div class="imq rev" style="--dur:${rowB.length * 10}s"><div class="imq-track">${imgs(rowB)}${imgs(rowB)}</div></div>
      </section>

      <section class="contact" id="contact">
        <a class="c-badge" data-magnetic href="mailto:${esc(SITE.email)}" aria-label="Email"><svg viewBox="0 0 100 100"><defs><path id="cb" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"/></defs><text textLength="234" lengthAdjust="spacingAndGlyphs"><textPath href="#cb" textLength="234" lengthAdjust="spacingAndGlyphs">${esc(SITE.name)} • ${esc(SITE.role)} •&#160;</textPath></text></svg><b>↑</b></a>
        <span class="caps sec-num">(05) — Contact</span>
        <h2 class="c-big rv mask-only">${masked("Let's")}<br><span class="light">${masked("talk.", 1)}</span></h2>
        <div class="c-row">
          <a class="c-mail" href="mailto:${esc(SITE.email)}" data-cursor="Write" data-magnetic>${esc(SITE.email)} <i>→</i></a>
          ${socials().length ? `<div class="c-links caps">${socials().map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${s[0]}</a>`).join("")}</div>` : ""}
        </div>
      </section>
      ${footer()}
    </div>`;
  }

  /* ---------- PROJECT ---------- */
  function renderProject(slug) {
    const i = PROJECTS.findIndex(p => p.slug === slug);
    if (i < 0) { location.hash = "#/"; return false; }
    const p = PROJECTS[i], imgs = gallery(p, i), ni = (i + 1) % PROJECTS.length, next = PROJECTS[ni];
    document.title = `${p.title} — ${SITE.name}`;
    const paras = String(p.description || "").split(/\n\s*\n/).filter(Boolean);
    const facts = [["Type", p.type], ["Year", p.year], ["Location", p.location], ["Role", p.role], ["Software", p.software]].filter(f => f[1]);
    S.captions = imgs.map(m => m.caption || p.title);
    S.imgs = [{ src: cover(p, i), caption: p.title }, ...imgs];

    view.innerHTML = `
    <article class="project">
      <section class="p-hero" id="top">
        <div class="p-media"><div class="im">${pic(cover(p, i), "100vw", { eager: true })}</div></div>
        <div class="hero-dim"></div><div class="hero-shade"></div><div class="hero-grain"></div>
        <a href="#/" data-go="work" class="back caps"><span class="roll"><span data-t="← All projects">← All projects</span></span></a>
        <div class="p-title">
          <p class="p-kicker caps"><b>(${num(i)})</b><span>${esc(p.type)}</span><span>${metaLine(p)}</span></p>
          <h1>${masked(p.title)}</h1>
          <div class="p-sub"><p>${esc(p.summary)}</p><span class="caps p-scroll">Scroll to explore ↓</span></div>
        </div>
      </section>

      <div class="above">
        <div class="p-split">
          <div class="p-left">
            <section class="ch ch-intro" data-f="0">
              <p class="caps ch-n">${esc(p.context || "Overview")}</p>
              ${paras[0] ? `<p class="ch-lead">${esc(paras[0])}</p>` : ""}
              <div class="desc">${paras.slice(1).map(t => `<p>${esc(t)}</p>`).join("")}</div>
              ${p.contribution ? `<div class="contrib"><p class="caps">My contribution</p><p>${esc(p.contribution)}</p></div>` : ""}
              <dl class="facts">${facts.map(f => `<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join("")}</dl>
            </section>
            ${imgs.map((m, k) => `
            <section class="ch" data-f="${k + 1}">
              <span class="ch-big" aria-hidden="true">${two(k + 1)}</span>
              <p class="caps ch-n">${two(k + 1)} / ${two(imgs.length)}</p>
              <h3>${esc(m.caption || p.title)}</h3>
              ${m.text ? `<div class="ch-p">${String(m.text).split(/\n\s*\n/).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join("")}</div>` : ""}
              <button class="open-lb caps" data-k="${k + 1}" data-cursor="Zoom">View full image ↗</button>
              <figure class="ch-img" data-k="${k + 1}">${pic(m.src, "100vw", { cls: "fade", alt: m.caption || p.title })}</figure>
            </section>`).join("")}
          </div>
          <div class="p-right">
            <div class="frame on" data-f="0"><div class="cam">${pic(cover(p, i), "(max-width:820px) 100vw, 80vw", { eager: true })}</div></div>
            ${imgs.map((m, k) => `<div class="frame" data-f="${k + 1}"><div class="cam">${pic(m.src, "(max-width:820px) 100vw, 80vw", { cls: "fade", alt: m.caption || "", eager: k < 1 })}</div></div>`).join("")}
            <div class="p-prog"><i></i></div>
            <button class="p-zoom caps" id="pZoom" data-cursor="Zoom" data-magnetic>Full image ↗</button>
            <div class="p-hud"><span class="caps" id="hudCap">Overview</span><span class="count" id="hudN">00<small> / ${two(imgs.length)}</small></span></div>
          </div>
        </div>

        <a class="next" href="#/p/${next.slug}" data-cursor="Next">
          <div class="im">${pic(cover(next, ni), "70vw")}</div>
          <div class="next-in"><p class="caps">Next project — (${num(ni)})</p><h2 class="next-t">${esc(next.title)}</h2></div>
        </a>
        ${footer()}
      </div>
    </article>`;
    return true;
  }

  /* ---------- smooth scroll (skipped in lite mode: native scrolling is smoother there) ---------- */
  let lenis = null;
  try { if (window.Lenis && !LITE) lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1, smoothWheel: true }); } catch (e) { lenis = null; }
  const scrollTop = () => lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : scrollTo(0, 0);
  function scrollToId(id, instant) {
    const el = id === "top" ? 0 : document.getElementById(id);
    if (el === null) return;
    if (lenis) lenis.scrollTo(el, { immediate: !!instant, duration: 1.4, force: true });
    else if (el === 0) scrollTo({ top: 0, behavior: instant ? "auto" : "smooth" });
    else el.scrollIntoView({ behavior: instant ? "auto" : "smooth" });
  }
  function lock(on) { document.body.classList.toggle("noscroll", on); if (lenis) on ? lenis.stop() : lenis.start(); }
  function goLite() {
    if (LITE) return; LITE = true; root.classList.add("lite");
    if (lenis) { try { lenis.destroy(); } catch (e) { } lenis = null; root.classList.remove("lenis", "lenis-smooth"); }
    M.tx = M.ty = 0;
  }

  /* ---------- per-frame animation ----------
     All measuring happens once (layout cache), so each frame only writes styles.
     Nothing is touched when the page isn't moving. */
  const S = { active: -1, captions: [], imgs: [] };
  const M = { x: 0, y: 0, tx: 0, ty: 0 };
  const PAT = [[1, -1], [-1, 1], [1, 1], [-1, -1], [0, 1], [1, 0]];
  if (fine) addEventListener("pointermove", e => { if (LITE) return; M.tx = e.clientX / innerWidth - .5; M.ty = e.clientY / innerHeight - .5; }, { passive: true });

  const L = { dirty: true };
  const docTop = el => { let t = 0; while (el) { t += el.offsetTop; el = el.offsetParent; } return t; };
  const box = el => el ? { t: docTop(el), h: el.offsetHeight } : null;
  function cache() {
    S.hero = $(".hero, .p-hero"); S.move = $(".hero-move, .p-media"); S.bottom = $(".hero-bottom, .p-title"); S.top = $(".hero-top");
    S.dim = S.hero && S.hero.querySelector(".hero-dim");
    S.words = $$(".st-text .w"); S.st = $(".st-text"); S.n = -1;
    S.smq = $$(".smq").map(el => ({ el, tr: el.firstElementChild, track: el.querySelector(".smq-track"), dir: +el.dataset.dir || 1, unit: 1 }));
    S.chs = $$(".ch"); S.frames = $$(".frame"); S.left = $(".p-left"); S.prog = $(".p-prog");
    S.portrait = $(".portrait"); S.pin = $(".arch-in"); S.q = -1;
    S.hudCap = $("#hudCap"); S.hudN = $("#hudN"); S.active = -1; S.contact = $(".contact");
    S.heroOn = null; S.lastY = -1; S.camBusy = true; S.tone = "";
    L.dirty = true;
  }
  function measure() {
    L.ih = innerHeight; L.H = root.scrollHeight - L.ih;
    L.st = box(S.st); L.contact = box(S.contact); L.left = box(S.left);
    L.portrait = box(S.portrait); L.archH = S.pin ? S.pin.parentElement.offsetHeight : 0;
    L.smq = S.smq.map(o => { o.unit = o.track.scrollWidth / 4 || 1; return box(o.el); });
    L.chs = S.chs.map(c => ({ ...box(c), f: +c.dataset.f }));
    L.dirty = false;
  }
  new ResizeObserver(() => { L.dirty = true; }).observe(view);
  const progEl = $("#progress");

  // frame-time probe: if real scrolling runs below ~45 fps, switch to lite mode automatically
  const probe = { last: 0, d: [], done: !!QS.get("lite") };

  function tick(t) {
    if (L.dirty) measure();
    const y = scrollY, ih = L.ih, moved = y !== S.lastY;
    S.lastY = y;
    let mouse = false;
    if (!LITE && fine) {
      const nx = lerp(M.x, M.tx, .06), ny = lerp(M.y, M.ty, .06);
      mouse = Math.abs(nx - M.x) + Math.abs(ny - M.y) > .0004; M.x = nx; M.y = ny;
    }
    if (!probe.done) {
      if (moved && probe.last) probe.d.push(t - probe.last);
      probe.last = moved ? t : 0;
      if (probe.d.length >= 50) { const s = probe.d.sort((a, b) => a - b), med = s[s.length >> 1]; probe.done = true; if (med > 22) goLite(); }
    }
    if (!moved && !mouse && !S.camBusy) return;   // nothing changed → no work this frame

    if (moved && progEl) progEl.style.transform = `scaleX(${L.H > 0 ? clamp(y / L.H, 0, 1).toFixed(4) : 0})`;

    // hero: subtle mouse + scroll parallax (only while visible)
    if (S.hero && (moved || mouse || S.heroOn === null)) {
      const on = y < ih * 1.05;
      if (on !== S.heroOn) { S.heroOn = on; S.hero.classList.toggle("off", !on); }
      if (on) {
        const p = clamp(y / ih, 0, 1);
        if (S.dim) S.dim.style.opacity = (p * .75).toFixed(3);
        if (S.move) S.move.style.transform = `translate3d(${(-M.x * 2.2).toFixed(3)}%,${(-M.y * 2.2 + p * 6).toFixed(3)}%,0) scale(${(1 + p * .06).toFixed(4)})`;
        if (S.bottom) S.bottom.style.transform = `translate3d(${(M.x * .8).toFixed(3)}%,${(-p * 26).toFixed(2)}vh,0)`;
        if (S.top) S.top.style.transform = `translate3d(${(M.x * 1.4).toFixed(3)}%,${(M.y * 6 - p * 30).toFixed(2)}px,0)`;
      }
    }
    if (moved) {
      // header shade adapts to what is underneath it
      const accent = L.contact && y + 46 > L.contact.t && y + 46 < L.contact.t + L.contact.h;
      const tone = (accent ? "a" : "d") + (y > 30 || accent ? "1" : "0");
      if (tone !== S.tone) { S.tone = tone; document.body.classList.toggle("nav-accent", accent); document.body.classList.toggle("nav-scrolled", tone[1] === "1"); }
      // portrait drifts inside its arch and develops from duotone to colour
      if (L.portrait && S.pin) {
        const top = L.portrait.t - y;
        if (top < ih && top + L.portrait.h > 0) {
          const lim = L.archH * .085;
          S.pin.style.transform = `translate3d(0,${clamp((top + L.portrait.h / 2 - ih / 2) * -.09, -lim, lim).toFixed(1)}px,0)`;
          const q = Math.round(clamp((ih * .85 - top) / (ih * .75), 0, 1) * 20) / 20;
          if (q !== S.q) { S.q = q; S.portrait.style.setProperty("--q", q); }
        }
      }
      // statement lights up word by word
      if (L.st && S.words.length) {
        const top = L.st.t - y;
        if (top < ih && top + L.st.h > 0) {
          const q = clamp((ih * .82 - top) / (L.st.h + ih * .3), 0, 1), n = Math.round(q * S.words.length * 1.08);
          if (n !== S.n) { const lo = Math.min(n, S.n < 0 ? 0 : S.n), hi = Math.max(n, S.n < 0 ? S.words.length : S.n); for (let k = lo; k < hi && k < S.words.length; k++) S.words[k].classList.toggle("lit", k < n); S.n = n; }
        }
      }
    }
    // word strips move with scroll (only while on screen)
    if (moved) S.smq.forEach((o, k) => {
      const b = L.smq[k]; if (!b) return; const top = b.t - y;
      if (top > ih || top + b.h < 0) return;
      const x = (y * .5) % o.unit;
      o.tr.style.transform = `translate3d(${(o.dir > 0 ? -x : x - o.unit).toFixed(1)}px,0,0)`;
    });

    // project page: sticky camera pans across the active image
    if (L.chs.length && S.frames.length && innerWidth > 820 && (moved || mouse || S.camBusy)) {
      const mid = y + ih * .5; let k = 0, q = 0;
      for (const c of L.chs) {
        if (c.t <= mid && c.t + c.h > mid) { k = c.f; q = (mid - c.t) / c.h; break; }
        if (c.t > mid) break;
        k = c.f; q = 1;
      }
      if (k !== S.active) {
        S.frames.forEach(f => f.classList.toggle("on", +f.dataset.f === k)); S.active = k;
        S.chs.forEach(c => c.classList.toggle("cur", +c.dataset.f === k));
        if (S.hudCap) S.hudCap.textContent = k ? S.captions[k - 1] : "Overview";
        if (S.hudN) S.hudN.innerHTML = `${two(k)}<small> / ${two(S.captions.length)}</small>`;
      }
      const f = S.frames[k];
      if (f) {
        const cam = f.firstElementChild, paper = f.classList.contains("paper"), pat = PAT[k % PAT.length], a = paper ? .3 : 1;
        const tz = 1 + (paper ? .04 : .14) * q, tx = pat[0] * (q - .5) * 7 * a - M.x * 1.2, ty = pat[1] * (q - .5) * 5 * a - M.y * 1.2;
        const s = cam._s || (cam._s = { z: tz, x: tx, y: ty });
        const e = LITE ? 1 : .08;
        s.z = lerp(s.z, tz, e); s.x = lerp(s.x, tx, e); s.y = lerp(s.y, ty, e);
        S.camBusy = Math.abs(s.z - tz) + Math.abs(s.x - tx) + Math.abs(s.y - ty) > .002;
        cam.style.transform = `translate3d(${s.x.toFixed(3)}%,${s.y.toFixed(3)}%,0) scale(${s.z.toFixed(4)})`;
      }
      if (moved && L.left && S.prog) S.prog.style.setProperty("--q", clamp((mid - L.left.t) / L.left.h, 0, 1).toFixed(4));
    } else if (!L.chs.length) S.camBusy = false;
  }
  function raf(t) { if (lenis) lenis.raf(t); tick(t); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  /* ---------- fit giant words to the full width ---------- */
  function fitAll() {
    $$(".fit").forEach(el => {
      el.style.fontSize = "100px";
      const w = el.getBoundingClientRect().width, pw = el.parentElement.clientWidth;
      if (w && pw) el.style.fontSize = (100 * pw / w * .995).toFixed(2) + "px";
    });
    L.dirty = true;
  }

  /* ---------- reveal on scroll + pause things that are off screen ---------- */
  let io, vis;
  function observe() {
    io && io.disconnect();
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    $$(".rv").forEach(el => io.observe(el));
    vis && vis.disconnect();
    vis = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("run", e.isIntersecting)), { rootMargin: "100px 0px" });
    $$(".imq, .smq, #acc, .contact").forEach(el => vis.observe(el));
  }

  /* ---------- light (drawing) images get a paper background ---------- */
  function paper(img, target) {
    const run = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 24;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let s = 0;
        const pts = [[0, 0], [23, 0], [0, 23], [23, 23], [12, 0], [0, 12], [23, 12], [12, 23]];
        pts.forEach(([a, b]) => { const o = (b * 24 + a) * 4; s += (d[o] + d[o + 1] + d[o + 2]) / 3; });
        if (s / pts.length > 228) target.classList.add("paper");
      } catch (e) { }
    };
    if (img.complete && img.naturalWidth) run(); else img.addEventListener("load", run, { once: true });
  }

  /* ---------- page behaviours ---------- */
  let heroTimer = null, accTimer = null;
  function startHero() {
    clearInterval(heroTimer);
    const slides = $$(".slide"), hl = heroList(), bar = $("#capBar");
    const runBar = () => { if (!bar) return; bar.classList.remove("run"); void bar.offsetWidth; bar.classList.add("run"); };
    runBar();
    if (slides.length < 2) return;
    let k = 0;
    heroTimer = setInterval(() => {
      if (document.hidden || S.heroOn === false) return;   // paused while the hero is covered
      slides[k].classList.remove("on"); k = (k + 1) % slides.length; slides[k].classList.add("on");
      $("#capN").textContent = `Featured ${two(k + 1)} / ${two(hl.length)}`; $("#capT").textContent = hl[k].p.title; $("#heroCap").href = `#/p/${hl[k].p.slug}`;
      runBar();
    }, 6000);
  }
  function bindPage() {
    clearInterval(heroTimer); clearInterval(accTimer);
    if ($(".hero")) startHero();

    // project accordion (auto-advances only while visible, never in lite mode)
    const ps = $$(".panel"), acc = $("#acc");
    if (ps.length) {
      let k = 0, hover = false;
      const set = i => { if (i === k && ps[i].classList.contains("on")) return; ps.forEach((p, j) => p.classList.toggle("on", i === j)); k = i; };
      ps[0].classList.add("on");
      ps.forEach((p, i) => { p.addEventListener("mouseenter", () => set(i)); p.addEventListener("focus", () => set(i)); });
      acc.addEventListener("mouseenter", () => hover = true); acc.addEventListener("mouseleave", () => hover = false);
      accTimer = setInterval(() => { if (!LITE && !hover && !document.hidden && innerWidth > 820 && acc.classList.contains("run")) set((k + 1) % ps.length); }, 4200);
    }
    // images fade in once loaded
    $$("img.fade").forEach(im => { const ok = () => im.classList.add("ok"); if (im.complete && im.naturalWidth) ok(); else { im.addEventListener("load", ok, { once: true }); im.addEventListener("error", () => setTimeout(() => im.complete && im.naturalWidth && ok(), 50)); } });
    if (fine) {
      // buttons lean towards the cursor
      $$("[data-magnetic]").forEach(el => {
        el.addEventListener("mousemove", e => { if (LITE) return; const r = el.getBoundingClientRect(); const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; el.style.transform = `translate3d(${dx * .22}px,${dy * .3}px,0)`; });
        el.addEventListener("mouseleave", () => { el.style.transform = ""; });
      });
      // open project strip pans with the mouse
      ps.forEach(p => p.addEventListener("mousemove", e => { if (LITE) return; const r = p.getBoundingClientRect(); p.style.setProperty("--mx", ((e.clientX - r.left) / r.width - .5).toFixed(3)); p.style.setProperty("--my", ((e.clientY - r.top) / r.height - .5).toFixed(3)); }));
    }
    // expertise rows
    $$(".xhead").forEach(b => b.onclick = () => {
      const row = b.parentElement, open = !row.classList.contains("open");
      $$(".xrow").forEach(r => { r.classList.remove("open"); r.firstElementChild.setAttribute("aria-expanded", "false"); });
      if (open) { row.classList.add("open"); b.setAttribute("aria-expanded", "true"); }
    });
    // project images
    $$(".frame").forEach(f => paper(f.querySelector("img"), f));
    $$(".ch-img").forEach(f => paper(f.querySelector("img"), f));
    $$(".open-lb, .ch-img").forEach(el => el.onclick = () => openLb(+el.dataset.k));
    const z = $("#pZoom"); if (z) z.onclick = () => openLb(Math.max(0, S.active));
  }

  /* ---------- lightbox ---------- */
  const lb = $("#lightbox"); let lbI = 0;
  const showLb = () => { const m = S.imgs[lbI]; if (!m) return; $("img", lb).src = m.src; $("figcaption", lb).textContent = m.caption || ""; $("#lbCount").textContent = `${two(lbI)} / ${two(S.imgs.length - 1)}`; };
  function openLb(k) { if (!S.imgs.length) return; lbI = clamp(k, 0, S.imgs.length - 1); showLb(); lb.hidden = false; lock(true); }
  const closeLb = () => { lb.hidden = true; lock(false); };
  const stepLb = d => { lbI = (lbI + d + S.imgs.length) % S.imgs.length; showLb(); };
  $(".lb-close").onclick = closeLb; $(".lb-prev").onclick = () => stepLb(-1); $(".lb-next").onclick = () => stepLb(1);
  lb.addEventListener("click", e => { if (e.target === lb) closeLb(); });
  let sx = null;
  lb.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1); sx = null; });

  /* ---------- menu ---------- */
  const menuBtn = $("#menuBtn");
  function setMenu(open) {
    const was = document.body.classList.contains("menu-open"); if (was === open) return;
    document.body.classList.toggle("menu-open", open); lock(open);
    menuBtn.setAttribute("aria-expanded", open); $("#menu").setAttribute("aria-hidden", !open);
    const l = $("#menuLabel"); l.textContent = open ? "Close" : "Menu"; l.dataset.t = l.textContent;
  }
  menuBtn.onclick = () => setMenu(!document.body.classList.contains("menu-open"));
  $("#menuProjects").innerHTML = PROJECTS.map((p, i) => `<a href="#/p/${p.slug}">${esc(p.title)}<span>${num(i)}</span></a>`).join("");
  $("#menuFoot").innerHTML = `<span>${esc(SITE.email)}</span><span>© ${YEAR} ${esc(SITE.name)}</span>`;
  addEventListener("keydown", e => {
    if (!lb.hidden) { if (e.key === "Escape") closeLb(); if (e.key === "ArrowLeft") stepLb(-1); if (e.key === "ArrowRight") stepLb(1); return; }
    if (e.key === "Escape") setMenu(false);
  });

  /* ---------- cursor (only animates while the mouse moves) ---------- */
  const cur = $(".cursor");
  if (fine) {
    let mx = -100, my = -100, cx = -100, cy = -100, running = false;
    const loop = () => {
      cx += (mx - cx) * .25; cy += (my - cy) * .25;
      cur.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
      if (Math.abs(mx - cx) + Math.abs(my - cy) > .3) requestAnimationFrame(loop); else running = false;
    };
    addEventListener("mousemove", e => { if (LITE) return; mx = e.clientX; my = e.clientY; cur.classList.add("show"); if (!running) { running = true; requestAnimationFrame(loop); } }, { passive: true });
    document.addEventListener("mouseover", e => { const t = e.target.closest("[data-cursor]"); cur.classList.toggle("big", !!t); if (t) cur.firstElementChild.textContent = t.dataset.cursor; });
  }

  /* ---------- loader (first visit in a session) ---------- */
  function runLoader(done) {
    const Ld = $("#loader"); if (!Ld) return done();
    let seen = false; try { seen = sessionStorage.getItem("lk-intro") === "1"; } catch (e) { }
    if (seen || reduce) { Ld.remove(); return done(); }
    $("#ldYear").textContent = "© " + YEAR; $("#ldName").innerHTML = masked(SITE.name);
    lock(true); requestAnimationFrame(() => requestAnimationFrame(() => Ld.classList.add("go")));
    const t0 = performance.now(); let ready = false;
    const im = $(".slide img, .p-media img");   // wait for the image the page actually shows
    const loaded = new Promise(r => { if (!im || (im.complete && im.naturalWidth)) r(); else { im.addEventListener("load", r, { once: true }); im.addEventListener("error", () => setTimeout(r, 400), { once: true }); } });
    Promise.race([Promise.all([loaded, document.fonts ? document.fonts.ready : null]), new Promise(r => setTimeout(r, 5000))]).then(() => ready = true);
    (function step() {
      let t = Math.min(1, (performance.now() - t0) / 1700); if (!ready) t = Math.min(t, .92);
      const e = 1 - Math.pow(1 - t, 3); Ld.style.setProperty("--t", e.toFixed(3)); $("#ldCount").textContent = String(Math.round(e * 100)).padStart(3, "0");
      if (t < 1) return requestAnimationFrame(step);
      setTimeout(() => { Ld.classList.add("out"); lock(false); try { sessionStorage.setItem("lk-intro", "1"); } catch (e) { } done(); setTimeout(() => Ld.remove(), 1300); }, 250);
    })();
  }

  /* ---------- routing with curtain wipe ---------- */
  let first = true, pending = null;
  function render() { const m = location.hash.match(/^#\/p\/([\w-]+)/); return m ? renderProject(m[1]) : (renderHome(), true); }
  function after() { cache(); fitAll(); observe(); bindPage(); }
  function animateIn() { const h = $(".hero, .p-hero"); if (h) requestAnimationFrame(() => requestAnimationFrame(() => { h.classList.add("go"); setTimeout(() => h.classList.add("done"), 1900); })); }
  function jump() { scrollTop(); if (pending) { const id = pending; pending = null; setTimeout(() => scrollToId(id, true), 60); } }
  function route() {
    setMenu(false);
    if (first) { first = false; if (!render()) return; after(); jump(); runLoader(() => setTimeout(animateIn, 200)); return; }
    const C = $("#curtain"), dm = location.hash.match(/^#\/p\/([\w-]+)/), dp = dm && PROJECTS.find(p => p.slug === dm[1]);
    $("#curtainName").textContent = dp ? dp.title : SITE.name;
    C.classList.remove("up"); void C.offsetWidth; C.classList.add("cover");
    setTimeout(() => {
      if (!render()) return;
      after(); jump(); C.classList.add("up");
      setTimeout(animateIn, 300); setTimeout(() => C.classList.remove("cover", "up"), 1000);
    }, 740);
  }
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-go]"); if (!a) return;
    const inMenu = !!a.closest("#menu"), onHome = !/^#\/p\//.test(location.hash);
    if (onHome) { e.preventDefault(); setMenu(false); setTimeout(() => scrollToId(a.dataset.go), inMenu ? 500 : 0); }
    else pending = a.dataset.go;
  });
  addEventListener("hashchange", route);
  let rz; addEventListener("resize", () => { L.dirty = true; clearTimeout(rz); rz = setTimeout(fitAll, 120); });
  if (document.fonts) document.fonts.ready.then(fitAll);

  $("#logo").textContent = SITE.name;
  if (DRAFT) document.body.append(Object.assign(document.createElement("div"), { className: "draft-badge", textContent: "Preview — not published yet" }));
  $("#curtainName").textContent = SITE.name;
  window.__lk = { get lite() { return LITE; }, goLite, get lenis() { return !!lenis; } };   // for testing
  route();
})(SITE, PROJECTS);
