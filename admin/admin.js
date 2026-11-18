/* ==========================================================================
   Site editor. Edits js/content.js and uploads photos straight to the
   website's GitHub repository, using a personal access key that never leaves
   this browser.
   ========================================================================== */
(function () {
  "use strict";
  const API = "https://api.github.com";
  const $ = (s, e = document) => e.querySelector(s);
  const two = n => String(n).padStart(2, "0");
  const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const rand = () => Math.random().toString(36).slice(2, 6);
  const app = $("#app");

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
    return el;
  }
  const store = {
    get(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v, remember) { try { (remember ? localStorage : sessionStorage).setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { } }
  };

  /* ---------- state ---------- */
  const S = { site: null, projects: [], sha: null, pending: new Map(), shown: new Map(), dirty: false, conn: null, mode: null, view: "general", p: 0 };

  /* ---------- toast + modal ---------- */
  let toastT;
  function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
  function modal(content) { const m = $("#modal"); m.replaceChildren(h("div", { class: "dialog", role: "dialog" }, content)); m.hidden = false; return m; }
  function closeModal() { $("#modal").hidden = true; $("#modal").replaceChildren(); }
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal" && !$("#modal").dataset.lock) closeModal(); });

  /* ---------- GitHub ---------- */
  async function gh(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts, cache: "no-store",
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${S.conn.token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) }
    });
    if (!r.ok) {
      let msg = ""; try { msg = (await r.json()).message || ""; } catch (e) { }
      const err = new Error(friendly(r.status, msg)); err.status = r.status; throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  function friendly(status, msg) {
    if (status === 401) return "GitHub didn't accept the access key. It may be mistyped or expired — make a new one and connect again.";
    if (status === 403) return "This access key isn't allowed to do that. Check it has “Contents: Read and write” for this repository. (" + msg + ")";
    if (status === 404) return "GitHub couldn't find that repository or file. Check the repository name, and that the key was given access to it.";
    if (status === 409 || status === 422) return "GitHub refused the change (" + msg + "). Reload the editor and try again.";
    return `GitHub error ${status}${msg ? ": " + msg : ""}`;
  }
  const b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), c => c.charCodeAt(0)));
  function parseContent(text) {
    const d = new Function(text + "\n;return { SITE: typeof SITE !== 'undefined' ? SITE : null, PROJECTS: typeof PROJECTS !== 'undefined' ? PROJECTS : null };")();
    if (!d.SITE || !Array.isArray(d.PROJECTS)) throw new Error("js/content.js doesn't contain the website's SITE and PROJECTS.");
    return d;
  }
  function load(d) {
    const s = d.SITE;
    s.about = s.about || { intro: "", facts: [] }; s.about.facts = s.about.facts || [];
    s.expertise = s.expertise || []; s.disciplines = s.disciplines || []; s.heroNotes = s.heroNotes || [];
    ["name", "role", "tagline", "statement", "email", "instagram", "linkedin", "cv"].forEach(k => { if (s[k] == null) s[k] = ""; });
    d.PROJECTS.forEach(p => { p.images = p.images || []; if (p.hero === undefined) p.hero = true; });
    S.site = s; S.projects = d.PROJECTS; S.dirty = false;
  }
  function guessRepo() {
    const host = location.hostname;
    if (host.endsWith(".github.io")) {
      const owner = host.split(".")[0], seg = location.pathname.split("/").filter(Boolean)[0];
      return `${owner}/${seg && seg !== "admin" ? seg : host}`;
    }
    return "";
  }
  async function connect(full, token, remember) {
    const [owner, repo] = full.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repo) throw new Error("Write the repository as  username/repository-name  (e.g. lamakakhi/lamakakhi.github.io).");
    S.conn = { owner, repo, token: token.trim() };
    const info = await gh(`/repos/${owner}/${repo}`);
    if (info.permissions && info.permissions.push === false) throw new Error("This key can read the repository but not save to it. Give it “Contents: Read and write”.");
    S.conn.branch = info.default_branch;
    const f = await gh(`/repos/${owner}/${repo}/contents/js/content.js?ref=${encodeURIComponent(S.conn.branch)}`);
    load(parseContent(b64ToText(f.content)));
    S.sha = f.sha; S.mode = "github";
    store.set("lk-admin", JSON.stringify(S.conn), remember);
  }
  async function openOffline() {
    const r = await fetch("../js/content.js", { cache: "no-store" });
    if (!r.ok) throw new Error("Couldn't read js/content.js");
    load(parseContent(await r.text())); S.mode = "local";
  }

  /* ---------- images ---------- */
  const src = p => !p ? "" : S.pending.has(p) ? S.pending.get(p).url : S.shown.has(p) ? S.shown.get(p).url : /^(data:|blob:|https?:)/.test(p) ? p : "../" + p;
  function loadImg(file) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("unreadable")); i.src = URL.createObjectURL(file); }); }
  async function processImage(file) {
    let img;
    try { img = await createImageBitmap(file); } catch (e) { img = await loadImg(file).catch(() => null); }
    if (!img) throw new Error(`“${file.name}” couldn't be opened. Please export it as a JPG or PNG first (iPhone HEIC photos need converting).`);
    const max = 2200, w0 = img.width, h0 = img.height, k = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .84));
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    return { b64, url: URL.createObjectURL(blob), size: blob.size };
  }
  async function addImage(file, dir) {
    try {
      const p = await processImage(file);
      const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "image";
      const path = `images/${slugify(dir) || "site"}/${base}-${rand()}.jpg`;
      S.pending.set(path, p); markDirty(); return path;
    } catch (e) { toast(e.message, 5000); return null; }
  }
  async function addFile(file, dir) { // non-image files (CV PDF)
    if (file.size > 25e6) { toast("That file is over 25 MB — please make it smaller.", 4000); return null; }
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(file); });
    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [".pdf"])[0].toLowerCase();
    const path = `${dir}/${slugify(file.name.replace(/\.[^.]+$/, "")) || "file"}-${rand()}${ext}`;
    S.pending.set(path, { b64, url: URL.createObjectURL(file), size: file.size }); markDirty(); return path;
  }
  const captionFrom = name => { const s = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
  function allImages() {
    const set = new Set();
    S.projects.forEach(p => { if (p.cover) set.add(p.cover); if (typeof p.hero === "string") set.add(p.hero); p.images.forEach(m => m.src && set.add(m.src)); });
    S.site.expertise.forEach(x => x[2] && set.add(x[2]));
    S.pending.forEach((v, k) => { if (/\.(jpe?g|png|webp)$/i.test(k)) set.add(k); });
    return [...set];
  }
  function pick(cb) {
    modal([h("h2", {}, "Choose an image"), h("p", { class: "sub" }, "Any photo already on your site."),
      h("div", { class: "pickgrid" }, allImages().map(p => h("button", { type: "button", title: p, onclick: () => { closeModal(); cb(p); } }, h("img", { src: src(p), alt: "", loading: "lazy" })))),
      h("div", { class: "row", style: "margin-top:18px" }, h("button", { class: "btn", type: "button", onclick: closeModal }, "Cancel"))]);
  }

  /* ---------- dirty + top bar ---------- */
  function markDirty() { S.dirty = true; updateTop(); }
  function updateTop() {
    const st = $(".status"); if (!st) return;
    st.classList.toggle("dirty", S.dirty);
    const label = S.mode === "github" ? (S.dirty ? "Unsaved changes — click Publish to put them online" : `All changes published · ${S.conn.owner}/${S.conn.repo}`)
      : (S.dirty ? "Offline mode — download content.js to keep your changes" : "Offline mode (not connected to GitHub)");
    st.lastElementChild.textContent = label;
    const pb = $("#pub"); if (pb) pb.disabled = !S.dirty;
  }
  addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- field helpers ---------- */
  const field = (label, input, hint, asLabel = true) => h(asLabel ? "label" : "div", { class: "field" }, h("span", { class: "lbl" }, label), input, hint ? h("small", { class: "hint" }, hint) : null);
  function txt(obj, key, { rows = 0, placeholder = "", type = "text", onInput } = {}) {
    const el = rows ? h("textarea", { rows, placeholder }) : h("input", { type, placeholder });
    el.value = obj[key] ?? "";
    el.addEventListener("input", () => { obj[key] = el.value; markDirty(); onInput && onInput(el.value); });
    return el;
  }
  function lines(obj, key, rows = 4) {
    const el = h("textarea", { rows }); el.value = (obj[key] || []).join("\n");
    el.addEventListener("input", () => { obj[key] = el.value.split("\n").map(s => s.trim()).filter(Boolean); markDirty(); });
    return el;
  }
  function uploadBtn(label, { multiple = false, accept = "image/*", cls = "btn small" } = {}, onFiles) {
    const inp = h("input", { type: "file", accept, multiple });
    inp.addEventListener("change", async () => { const fs = [...inp.files]; inp.value = ""; if (fs.length) await onFiles(fs); });
    return h("label", { class: cls }, label, inp);
  }
  function imageField(obj, key, dirFn, label, hint) {
    const wrap = h("div", { class: "imgfield" });
    const draw = () => wrap.replaceChildren(
      h("div", { class: "thumb" }, obj[key] ? h("img", { src: src(obj[key]), alt: "" }) : "No image"),
      h("div", { class: "imgbtns" },
        uploadBtn("Upload new photo", {}, async fs => { const p = await addImage(fs[0], dirFn()); if (p) { obj[key] = p; markDirty(); draw(); } }),
        h("button", { class: "btn small ghost", type: "button", onclick: () => pick(p => { obj[key] = p; markDirty(); draw(); }) }, "Choose from site"),
        obj[key] ? h("button", { class: "btn small ghost danger", type: "button", onclick: () => { obj[key] = ""; markDirty(); draw(); } }, "Remove") : null));
    draw();
    return field(label, wrap, hint, false);
  }
  let dragFrom = null;
  function sortable(els, arr, after, { handle = null } = {}) {
    els.forEach((el, i) => {
      if (handle) { const hd = el.querySelector(handle); if (hd) { hd.addEventListener("mousedown", () => el.draggable = true); hd.addEventListener("touchstart", () => el.draggable = true, { passive: true }); } }
      else el.draggable = true;
      el.addEventListener("dragstart", e => { dragFrom = i; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); });
      el.addEventListener("dragend", () => { el.classList.remove("dragging"); if (handle) el.draggable = false; });
      el.addEventListener("dragover", e => { if (dragFrom === null) return; e.preventDefault(); el.classList.add("over"); });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", e => {
        el.classList.remove("over"); if (dragFrom === null) return; e.preventDefault(); e.stopPropagation();
        const from = dragFrom; dragFrom = null; if (from === i) return;
        const [m] = arr.splice(from, 1); arr.splice(i, 0, m); markDirty(); after(from, i);
      });
    });
  }
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); return true; };

  /* ---------- screens ---------- */
  function render() { if (!S.mode) return renderConnect(); renderEditor(); }

  function renderConnect(error) {
    const saved = (() => { try { return JSON.parse(store.get("lk-admin") || "null"); } catch (e) { return null; } })();
    const repo = h("input", { type: "text", placeholder: "username/username.github.io", value: saved ? `${saved.owner}/${saved.repo}` : guessRepo() });
    const token = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" });
    const remember = h("input", { type: "checkbox", checked: true });
    const err = h("div", { class: "err", hidden: !error }, error || "");
    const go = h("button", { class: "btn primary", type: "submit" }, "Connect");
    const form = h("form", {
      onsubmit: async e => {
        e.preventDefault(); err.hidden = true; go.disabled = true; go.textContent = "Connecting…";
        try { await connect(repo.value, token.value, remember.checked); render(); }
        catch (x) { err.textContent = x.message; err.hidden = false; go.disabled = false; go.textContent = "Connect"; }
      }
    },
      field("Website repository", repo, "Your GitHub username and the repository name, e.g. lamakakhi/lamakakhi.github.io"),
      field("Access key", token, "Paste the key you made on GitHub (see the steps above). It is only stored in this browser."),
      h("label", { class: "check" }, remember, "Remember me on this device"),
      h("div", { class: "row" }, go, h("button", { class: "btn ghost", type: "button", onclick: async () => { try { await openOffline(); render(); } catch (x) { err.textContent = x.message; err.hidden = false; } } }, "Look around without connecting")),
      err);
    app.replaceChildren(h("div", { class: "connect" },
      h("div", { class: "c-art" }, h("h1", {}, "Site editor"), h("p", {}, "Change text, add projects and upload photos. Publish, and your website updates about a minute later.")),
      h("div", { class: "c-form" },
        h("h2", {}, "Connect to your website"),
        h("p", {}, "You only need to do this once on each computer or phone."),
        h("details", { class: "steps", open: !saved },
          h("summary", {}, "How to make an access key (2 minutes)"),
          h("ol", {},
            h("li", {}, "Open ", h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" }, "GitHub → new fine-grained token"), " (sign in if asked)."),
            h("li", {}, h("b", {}, "Token name: "), "Website editor. ", h("b", {}, "Expiration: "), "1 year."),
            h("li", {}, h("b", {}, "Repository access: "), "Only select repositories → pick your website repository."),
            h("li", {}, h("b", {}, "Permissions → Repository permissions → Contents: "), "Read and write."),
            h("li", {}, "Click ", h("b", {}, "Generate token"), ", copy it and paste it below."))),
        form)));
  }

  function renderEditor() {
    app.replaceChildren(
      h("header", { class: "top" },
        h("div", { class: "brand" }, h("b", {}, initials()), h("span", {}, "Site editor")),
        h("div", { class: "status" }, h("i", { class: "dot" }), h("span", {}, "")),
        h("div", { class: "actions" },
          h("a", { class: "btn ghost small", href: "../", target: "_blank", rel: "noopener" }, "View site ↗"),
          h("button", { class: "btn small", type: "button", onclick: preview }, "Preview changes"),
          S.mode === "github"
            ? h("button", { class: "btn primary small", id: "pub", type: "button", onclick: publish, disabled: !S.dirty }, "Publish")
            : h("button", { class: "btn primary small", type: "button", onclick: download }, "Download content.js"),
          h("button", { class: "btn ghost small", type: "button", title: "Sign out of the editor on this device", onclick: signOut }, "Sign out"))),
      h("div", { class: "shell" }, renderSide(), h("main", { class: "main", id: "main" })));
    renderMain(); updateTop();
  }
  const initials = () => (S.site.name || "LK").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  function renderSide() {
    const navBtn = (view, label, n) => h("button", { class: "nav-i" + (S.view === view ? " on" : ""), type: "button", onclick: () => { S.view = view; refresh(); } }, h("span", { class: "n" }, n), h("span", { class: "t" }, label));
    const items = S.projects.map((p, i) => h("button", { class: "nav-i" + (S.view === "project" && S.p === i ? " on" : ""), type: "button", onclick: () => { S.view = "project"; S.p = i; refresh(); } },
      h("span", { class: "n" }, two(i + 1)), h("span", { class: "t" }, p.title || "Untitled"), h("span", { class: "grip", title: "Drag to reorder" }, "⠿")));
    const list = h("div", {}, items);
    sortable(items, S.projects, (from, to) => {
      if (S.view === "project") { if (S.p === from) S.p = to; else if (from < S.p && to >= S.p) S.p--; else if (from > S.p && to <= S.p) S.p++; }
      refresh();
    });
    return h("aside", { class: "side", id: "side" },
      h("h4", {}, "Website"),
      navBtn("general", "Home page & contact", "◎"), navBtn("about", "About", "◎"), navBtn("expertise", "Expertise", "◎"),
      h("h4", {}, "Projects — drag to reorder"), list,
      h("button", { class: "btn small add", type: "button", onclick: newProject }, "＋ New project"));
  }
  function refresh() { const old = $("#side"); old.replaceWith(renderSide()); renderMain(); }

  function renderMain() {
    const m = $("#main"); if (!m) return;
    const v = S.view === "project" && S.projects[S.p] ? projectView(S.projects[S.p], S.p) : S.view === "about" ? aboutView() : S.view === "expertise" ? expertiseView() : generalView();
    m.replaceChildren(v); window.scrollTo({ top: 0 });
  }
  const head = (title, sub, ...extra) => h("div", { class: "head" }, h("div", {}, h("h1", {}, title), sub ? h("p", {}, sub) : null), extra.length ? h("div", { class: "row" }, extra) : null);
  const card = (title, sub, ...kids) => h("section", { class: "card" }, title ? h("h3", {}, title) : null, sub ? h("p", { class: "sub" }, sub) : null, kids);

  function generalView() {
    const s = S.site;
    return h("div", {},
      head("Home page", "The first screen, the big statement and your contact details."),
      card("First screen", "Your name is shown huge at the bottom of the first screen.",
        h("div", { class: "grid2" }, field("Name", txt(s, "name")), field("Role", txt(s, "role"), "Shown top-left, e.g. Architect & Urban Planner")),
        field("Short intro line", txt(s, "tagline", { rows: 2 })),
        field("Small words at the bottom", lines(s, "heroNotes", 2), "One per line, e.g. Architecture / Urban Planning")),
      card("Statement", "The large sentence that lights up word by word as visitors scroll.",
        field("Statement", txt(s, "statement", { rows: 4 }), "Put *stars* around words to make them orange, e.g. I design *meaningful spaces*")),
      card("Moving words", "The huge words that slide across the screen.",
        field("Words", lines(s, "disciplines", 5), "One per line.")),
      card("Contact", null,
        h("div", { class: "grid2" },
          field("Email", txt(s, "email", { type: "email" })),
          field("Instagram link", txt(s, "instagram", { placeholder: "https://instagram.com/…" }), "Leave empty to hide"),
          field("LinkedIn link", txt(s, "linkedin", { placeholder: "https://linkedin.com/in/…" }), "Leave empty to hide")),
        cvField(s)));
  }
  function cvField(s) {
    const wrap = h("div", { class: "row" });
    const draw = () => wrap.replaceChildren(
      s.cv ? h("a", { class: "btn small ghost", href: src(s.cv), target: "_blank" }, "Open current file ↗") : h("span", { class: "empty-note" }, "No CV uploaded."),
      uploadBtn(s.cv ? "Replace PDF" : "Upload PDF", { accept: ".pdf,application/pdf" }, async fs => { const p = await addFile(fs[0], "files"); if (p) { s.cv = p; draw(); } }),
      s.cv ? h("button", { class: "btn small ghost danger", type: "button", onclick: () => { s.cv = ""; markDirty(); draw(); } }, "Remove") : null);
    draw(); return field("CV / portfolio PDF", wrap, "Adds a “CV” link to the contact section.", false);
  }

  function aboutView() {
    const a = S.site.about;
    const box = h("div", { class: "pairs" });
    const draw = () => {
      const rows = a.facts.map((f, i) => h("div", { class: "pair" },
        h("span", { class: "handle", title: "Drag to reorder" }, "⠿"),
        (() => { const el = h("input", { type: "text", placeholder: "Label", value: f[0] }); el.oninput = () => { f[0] = el.value; markDirty(); }; return el; })(),
        (() => { const el = h("input", { type: "text", class: "pv", placeholder: "Text", value: f[1] }); el.oninput = () => { f[1] = el.value; markDirty(); }; return el; })(),
        h("button", { class: "iconbtn", type: "button", title: "Remove", onclick: () => { a.facts.splice(i, 1); markDirty(); draw(); } }, "✕")));
      box.replaceChildren(...rows);
      sortable(rows, a.facts, draw, { handle: ".handle" });
    };
    draw();
    return h("div", {},
      head("About", "The About section on the home page."),
      card("About text", null, field("Text", txt(a, "intro", { rows: 6 }))),
      card("Facts", "Shown next to the text — education, software, languages…", box,
        h("button", { class: "btn small", type: "button", onclick: () => { a.facts.push(["", ""]); markDirty(); draw(); } }, "＋ Add a fact")));
  }

  function expertiseView() {
    const xs = S.site.expertise;
    const box = h("div", { class: "pairs" });
    const draw = () => {
      const rows = xs.map((x, i) => h("div", { class: "pair xp" },
        h("span", { class: "handle", title: "Drag to reorder" }, "⠿"),
        h("div", { class: "xpbody" },
          field("Title", txt(x, 0)), field("Text", txt(x, 1, { rows: 3 })),
          imageField(x, 2, () => "site", "Picture")),
        h("div", { class: "rowbtns" },
          h("button", { class: "iconbtn", type: "button", title: "Move up", disabled: i === 0, onclick: () => move(xs, i, -1) && draw() }, "↑"),
          h("button", { class: "iconbtn", type: "button", title: "Move down", disabled: i === xs.length - 1, onclick: () => move(xs, i, 1) && draw() }, "↓"),
          h("button", { class: "iconbtn", type: "button", title: "Remove", onclick: () => { if (confirm("Remove this row?")) { xs.splice(i, 1); markDirty(); draw(); } } }, "✕"))));
      box.replaceChildren(...rows);
      sortable(rows, xs, draw, { handle: ".handle" });
    };
    draw();
    return h("div", {},
      head("Expertise", "The “What I do” list. Visitors click a row to open it."),
      card(null, null, box, h("button", { class: "btn small", type: "button", onclick: () => { xs.push(["New expertise", "", ""]); markDirty(); draw(); } }, "＋ Add a row")));
  }

  function projectView(p, i) {
    const syncSlug = () => { const hint = slugInput.parentElement && slugInput.parentElement.querySelector(".hint"); if (hint) hint.textContent = `Used in the link: …/#/p/${p.slug || "name"}. Changing it breaks old links.`; };
    const titleInput = txt(p, "title", { onInput: v => { if (p._auto) { p.slug = uniqueSlug(slugify(v) || "project", p); slugInput.value = p.slug; syncSlug(); } const t = $("#side .nav-i.on .t"); if (t) t.textContent = v || "Untitled"; const hh = $(".main .head h1"); if (hh) hh.textContent = v || "Untitled"; } });
    const slugInput = txt(p, "slug", { onInput: () => { p._auto = false; p.slug = slugify(p.slug); syncSlug(); } });
    slugInput.addEventListener("blur", () => { p.slug = uniqueSlug(slugify(p.slug) || "project", p); slugInput.value = p.slug; syncSlug(); });
    const heroSel = h("select", {},
      h("option", { value: "yes" }, "Yes — use the cover photo"), h("option", { value: "no" }, "No"), h("option", { value: "custom" }, "Yes — with a different photo"));
    heroSel.value = p.hero === false ? "no" : typeof p.hero === "string" ? "custom" : "yes";
    const heroBox = h("div", {});
    const drawHero = () => heroBox.replaceChildren(heroSel.value === "custom" ? imageField(p, "hero", () => p.slug, "Slideshow photo") : "");
    heroSel.onchange = () => { p.hero = heroSel.value === "no" ? false : heroSel.value === "yes" ? true : (typeof p.hero === "string" ? p.hero : p.cover || ""); markDirty(); drawHero(); };
    drawHero();

    return h("div", {},
      head(p.title || "Untitled", `Project ${two(i + 1)} of ${two(S.projects.length)}`,
        h("button", { class: "btn small", type: "button", disabled: i === 0, onclick: () => { if (move(S.projects, i, -1)) { S.p--; refresh(); } } }, "↑ Move up"),
        h("button", { class: "btn small", type: "button", disabled: i === S.projects.length - 1, onclick: () => { if (move(S.projects, i, 1)) { S.p++; refresh(); } } }, "↓ Move down"),
        h("a", { class: "btn small ghost", href: `../#/p/${p.slug}`, target: "_blank" }, "Open live page ↗"),
        h("button", { class: "btn small danger", type: "button", onclick: () => { if (confirm(`Delete “${p.title}”? (Its photos stay in the repository.)`)) { S.projects.splice(i, 1); S.p = Math.max(0, i - 1); S.view = S.projects.length ? "project" : "general"; markDirty(); refresh(); } } }, "Delete")),
      card("Basics", null,
        h("div", { class: "grid2" }, field("Title", titleInput), field("Web address name", slugInput, "Used in the link: …/#/p/" + (p.slug || "name") + ". Changing it breaks old links.")),
        h("div", { class: "grid3" }, field("Type", txt(p, "type", { placeholder: "Public Pavilion" })), field("Year", txt(p, "year")), field("Location", txt(p, "location", { placeholder: "City, Country" }))),
        field("Context", txt(p, "context", { placeholder: "e.g. Competition, University project, Professional work" }), "Shown above the description."),
        h("div", { class: "grid2" }, field("My role", txt(p, "role"), "Leave empty to hide"), field("Software", txt(p, "software")))),
      card("Text", null,
        field("One-line summary", txt(p, "summary", { rows: 2 }), "Shown on the home page and under the project title."),
        field("Description", txt(p, "description", { rows: 9 }), "Leave an empty line between paragraphs. The first paragraph is shown larger."),
        field("My contribution", txt(p, "contribution", { rows: 4 }), "Optional — useful for team projects.")),
      card("Cover & slideshow", null,
        imageField(p, "cover", () => p.slug, "Cover photo", "Used on the home page strip and at the top of the project page."),
        field("Show in the home page slideshow?", heroSel), heroBox),
      card("Photos", "Each photo becomes a chapter on the project page: its caption is the big title on the left while the photo pans on the right. Drag to reorder.",
        imagesEditor(p)));
  }
  function uniqueSlug(base, self) { let s = base, n = 2; while (S.projects.some(q => q !== self && q.slug === s)) s = `${base}-${n++}`; return s; }
  function newProject() {
    const p = { slug: "", title: "New project", type: "", year: String(new Date().getFullYear()), location: "", context: "", software: "", role: "", summary: "", description: "", contribution: "", cover: "", hero: true, images: [], _auto: true };
    p.slug = uniqueSlug("new-project", p);
    S.projects.push(p); S.view = "project"; S.p = S.projects.length - 1; markDirty(); refresh();
    setTimeout(() => { const t = $(".main input"); if (t) { t.focus(); t.select(); } }, 50);
  }

  function imagesEditor(p) {
    const grid = h("div", { class: "igrid" });
    const draw = () => {
      const cards = p.images.map((m, i) => {
        const cap = h("textarea", { rows: 2, placeholder: "Caption — shown as the chapter title" }); cap.value = m.caption || "";
        cap.oninput = () => { m.caption = cap.value; markDirty(); };
        return h("div", { class: "icard" },
          h("div", { class: "ithumb" }, h("img", { src: src(m.src), alt: "", loading: "lazy" }), h("span", { class: "inum" }, two(i + 1)),
            p.cover === m.src ? h("span", { class: "badge" }, "Cover") : null, S.pending.has(m.src) ? h("span", { class: "new" }, "New") : null,
            h("span", { class: "handle", title: "Drag to reorder" }, "⠿")),
          h("div", { class: "ibody" }, cap,
            h("div", { class: "rowbtns" },
              h("div", { class: "row" },
                h("button", { class: "iconbtn", type: "button", title: "Move earlier", disabled: i === 0, onclick: () => move(p.images, i, -1) && draw() }, "←"),
                h("button", { class: "iconbtn", type: "button", title: "Move later", disabled: i === p.images.length - 1, onclick: () => move(p.images, i, 1) && draw() }, "→")),
              h("div", { class: "row" },
                p.cover === m.src ? null : h("button", { class: "btn small ghost", type: "button", onclick: () => { p.cover = m.src; markDirty(); renderMain(); } }, "Make cover"),
                h("button", { class: "iconbtn", type: "button", title: "Remove from project", onclick: () => { p.images.splice(i, 1); markDirty(); draw(); } }, "✕")))));
      });
      grid.replaceChildren(...cards);
      if (!cards.length) grid.replaceChildren(h("p", { class: "empty-note" }, "No photos yet — add some above."));
      sortable(cards, p.images, draw, { handle: ".handle" });
    };
    const addFiles = async fs => {
      const imgs = fs.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name));
      if (!imgs.length) return toast("Those files aren't images.");
      toast(`Preparing ${imgs.length} photo${imgs.length > 1 ? "s" : ""}…`, 60000);
      for (const f of imgs) { const path = await addImage(f, p.slug); if (path) { p.images.push({ src: path, caption: captionFrom(f.name) }); if (!p.cover) p.cover = path; draw(); } }
      toast("Added — remember to Publish.");
    };
    const drop = h("div", { class: "drop" },
      h("strong", {}, "Drop photos here"), "JPG or PNG. They're resized automatically for the web.",
      h("div", {}, uploadBtn("Choose photos", { multiple: true, cls: "btn" }, addFiles)));
    drop.addEventListener("dragover", e => { if (dragFrom !== null) return; e.preventDefault(); drop.classList.add("hot"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
    drop.addEventListener("drop", e => { if (dragFrom !== null) return; e.preventDefault(); drop.classList.remove("hot"); addFiles([...e.dataTransfer.files]); });
    draw();
    return h("div", {}, drop, grid);
  }

  /* ---------- output ---------- */
  const HEADER = `/* ==========================================================================
   Website content. This file is written by the site editor (your-site/admin),
   but you can still edit it by hand: change the text between the quote marks
   and keep the commas, brackets and quote marks where they are.
   ========================================================================== */

`;
  const clean = (k, v) => (k.startsWith("_") ? undefined : v);
  const buildContent = () => HEADER + "const SITE = " + JSON.stringify(S.site, clean, 2) + ";\n\nconst PROJECTS = " + JSON.stringify(S.projects, clean, 2) + ";\n";
  function validate() {
    const errs = [], seen = new Set();
    S.projects.forEach((p, i) => {
      if (!p.title.trim()) errs.push(`Project ${i + 1} needs a title.`);
      if (!p.slug) errs.push(`“${p.title}” needs a web address name.`);
      if (seen.has(p.slug)) errs.push(`Two projects use the web address name “${p.slug}”.`); seen.add(p.slug);
    });
    if (!S.site.name.trim()) errs.push("The site needs a name.");
    return errs;
  }
  function usedPaths() {
    const used = new Set(allImages()); if (S.site.cv) used.add(S.site.cv); return used;
  }

  function preview() {
    const rec = v => S.pending.get(v) || S.shown.get(v);
    let budget = 3.2e6;
    const inline = v => { const r = rec(v); if (r && r.b64 && /\.jpe?g$/i.test(v) && r.b64.length < budget) { budget -= r.b64.length; return "data:image/jpeg;base64," + r.b64; } return src(v); };
    const map = o => JSON.parse(JSON.stringify(o, (k, v) => k.startsWith("_") ? undefined : (typeof v === "string" && rec(v)) ? inline(v) : v));
    try { localStorage.setItem("lk-draft", JSON.stringify({ SITE: map(S.site), PROJECTS: map(S.projects) })); }
    catch (e) { return toast("Couldn't open the preview in this browser."); }
    const p = S.view === "project" && S.projects[S.p] ? `#/p/${S.projects[S.p].slug}` : "#/";
    window.open("../?preview=1" + p, "_blank");
  }
  function download() {
    if ([...S.pending.keys()].length) toast("Photos added offline can't be downloaded — connect to GitHub to upload them.", 5000);
    const a = h("a", { href: URL.createObjectURL(new Blob([buildContent()], { type: "text/javascript" })), download: "content.js" });
    document.body.append(a); a.click(); a.remove(); S.dirty = false; updateTop();
  }
  function signOut() {
    if (S.dirty && !confirm("You have unpublished changes. Sign out and lose them?")) return;
    store.del("lk-admin"); S.dirty = false; S.mode = null; S.conn = null; S.pending.clear(); render();
  }

  async function publish() {
    const errs = validate();
    if (errs.length) { modal([h("h2", {}, "Almost there"), h("p", { class: "sub" }, "Please fix these first:"), h("ul", { class: "log" }, errs.map(e => h("li", { class: "bad" }, e))), h("button", { class: "btn", type: "button", onclick: closeModal }, "OK")]); return; }
    const log = h("ul", { class: "log" }), title = h("h2", {}, "Publishing…"), sub = h("p", { class: "sub" }, "Please keep this tab open.");
    const btns = h("div", { class: "row" });
    const m = modal([title, sub, log, btns]); m.dataset.lock = "1";
    let cur = null;
    const step = t => { if (cur) cur.className = ""; cur = h("li", { class: "run" }, t); log.append(cur); };
    const { owner, repo, branch } = S.conn, base = `/repos/${owner}/${repo}`, ref = encodeURIComponent(branch);
    try {
      step("Checking the website for changes made elsewhere");
      const now = await gh(`${base}/contents/js/content.js?ref=${ref}`);
      if (now.sha !== S.sha && !confirm("The website text was changed somewhere else since you opened the editor. Publish anyway and replace those changes?")) throw new Error("Cancelled — nothing was changed.");
      const head = (await gh(`${base}/git/ref/heads/${ref}`)).object.sha;
      const baseTree = (await gh(`${base}/git/commits/${head}`)).tree.sha;
      const tree = [], used = usedPaths(), uploads = [...S.pending].filter(([p]) => used.has(p));
      for (let k = 0; k < uploads.length; k++) {
        step(`Uploading file ${k + 1} of ${uploads.length}`);
        const b = await gh(`${base}/git/blobs`, { method: "POST", body: JSON.stringify({ content: uploads[k][1].b64, encoding: "base64" }) });
        tree.push({ path: uploads[k][0], mode: "100644", type: "blob", sha: b.sha });
      }
      step("Saving your text");
      const cb = await gh(`${base}/git/blobs`, { method: "POST", body: JSON.stringify({ content: buildContent(), encoding: "utf-8" }) });
      tree.push({ path: "js/content.js", mode: "100644", type: "blob", sha: cb.sha });
      try { // make browsers fetch the new text instead of a cached copy
        const idx = await gh(`${base}/contents/index.html?ref=${ref}`), html = b64ToText(idx.content);
        const nh = html.replace(/(content\.js\?v=)[\w.-]+/, `$1${Date.now().toString(36)}`);
        if (nh !== html) { const ib = await gh(`${base}/git/blobs`, { method: "POST", body: JSON.stringify({ content: nh, encoding: "utf-8" }) }); tree.push({ path: "index.html", mode: "100644", type: "blob", sha: ib.sha }); }
      } catch (e) { }
      step("Publishing");
      const t = await gh(`${base}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree }) });
      const c = await gh(`${base}/git/commits`, { method: "POST", body: JSON.stringify({ message: `Update website from the editor — ${new Date().toLocaleString()}`, tree: t.sha, parents: [head] }) });
      await gh(`${base}/git/refs/heads/${ref}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
      cur.className = "";
      S.sha = cb.sha; S.pending.forEach((v, k) => S.shown.set(k, v)); S.pending.clear(); S.dirty = false; updateTop();
      title.textContent = "Published 🎉"; sub.textContent = "Your website will show the changes in about a minute. Refresh it if you still see the old version.";
      delete m.dataset.lock;
      btns.replaceChildren(h("a", { class: "btn primary", href: "../", target: "_blank" }, "View website ↗"), h("button", { class: "btn", type: "button", onclick: () => { closeModal(); renderMain(); } }, "Keep editing"));
    } catch (e) {
      if (cur) cur.className = "bad";
      title.textContent = "Not published"; sub.textContent = e.message; delete m.dataset.lock;
      btns.replaceChildren(h("button", { class: "btn", type: "button", onclick: closeModal }, "Close"));
    }
  }

  /* ---------- start ---------- */
  (async function start() {
    let saved = null; try { saved = JSON.parse(store.get("lk-admin") || "null"); } catch (e) { }
    if (saved && saved.token) {
      app.replaceChildren(h("div", { class: "connect" }, h("div", { class: "c-art" }, h("h1", {}, "Site editor")), h("div", { class: "c-form" }, h("h2", {}, "Connecting…"))));
      let rem = false; try { rem = !!localStorage.getItem("lk-admin"); } catch (e) { }
      try { await connect(`${saved.owner}/${saved.repo}`, saved.token, rem); }
      catch (e) { S.mode = null; return renderConnect(e.message); }
    }
    render();
  })();

  // exposed for automated testing only
  window.__lkAdmin = { S, buildContent, parseContent };
})();
