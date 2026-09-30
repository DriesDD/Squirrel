// Squirrel level designer: room mode (hand-made world) and component mode (single puzzle pieces).
(() => {
  const E = ENGINE();
  const $ = id => document.getElementById(id);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = {};
  ["gate", "player"].forEach(k => C[k] = css("--" + k));
  const TS = 8;                    // one 8x8 sprite per tile; the canvas is scaled up with crisp pixels
  const SP = SPRITES();
  const DEF_UNDER = { c: "_", "=": "-", "║": "|", "*": "_", "1": "_", "2": "_", "3": "_", "4": "_", "5": "_" };
  const TERRAIN = new Set(["w", "_", "-", "|", "+", "o", "s", "f", "~", "h", "v", "x", "e", "≈", "@", "%", "&", ";"]);
  const OVERLAY = E.OVERLAY_BASE;   // lily pads and reeds sit on another tile (their "base")
  const CP = COMPONENTS(E);
  const ICEC = { "~": 1, "h": 1, "v": 1, "x": 1 };
  const railsOf = t => ({ h: t === "-" || t === "+" || t === "h" || t === "x", v: t === "|" || t === "+" || t === "v" || t === "x" });
  const compose = (ice, h, v) => ice ? (h && v ? "x" : h ? "h" : v ? "v" : "~") : (h && v ? "+" : h ? "-" : v ? "|" : "_");
  const THEMES = ["warehouse", "cold"];
  const TOOLS = [
    { ch: "w", name: "Wall", key: "w" },
    { ch: "_", name: "Floor", key: "_" },
    { ch: "c", name: "Crate", key: "c" },
    { ch: "o", name: "Gap wall", key: "o" },
    { ch: "-", name: "H rail", key: "-" },
    { ch: "|", name: "V rail", key: "|" },
    { ch: "+", name: "Crossing", key: "+" },
    { ch: "=", name: "H door", key: "=" },
    { ch: "║", name: "V door", key: "i" },
    { ch: "~", name: "Ice", key: "~" },
    { ch: "*", name: "Snow", key: "*" },
    { ch: "b", name: "Snowball", key: "b" },
    { ch: "≈", name: "Water", key: "a" },
    { ch: "@", name: "Lily pad", key: "l" },
    { ch: "%", name: "Lily leaves", key: "k" },
    { ch: "&", name: "Lily flower", key: "y" },
    { ch: ";", name: "Reeds", key: "r" },
    { ch: "s", name: "Start", roomName: "Test start", key: "s" },
    { ch: "f", name: "Finish", roomName: "Test finish", key: "f" },
    { ch: "p", name: "Player start", key: "p", room: true },
    { ch: "e", name: "Exit", key: "e", room: true },
    { ch: "g", name: "Frog", key: "g", room: true },
    { ch: "d", name: "Dragonfly", key: "d", room: true },
  ];
  const DIR_LABEL = {
    both: ["Two-way", "Passable from either side, and the player can always get back out the way they came."],
    "either-once": ["Either side, not back", "Passable from either side in a fresh room, but at least one crossing can't be reversed afterwards."],
    sf: ["One-way s → f", "Only passable from s. The room needs another route for f → s."],
    fs: ["One-way f → s", "Only passable from f. The room needs another route for s → f."],
    none: ["Not passable", "No sequence of moves reaches the other side."],
  };

  // ---------- editor model ----------
  let ed = null, tool = "w", mode = "edit", history = [], kind = "room";
  const idx = (x, y) => y * ed.W + x;

  function blank(W, H) {
    return { name: "", theme: "warehouse", W, H, terr: Array(W * H).fill("_"), obj: Array(W * H).fill(""), base: Array(W * H).fill("") };
  }
  function clone(m) { return { name: m.name, theme: m.theme || "warehouse", W: m.W, H: m.H, terr: m.terr.slice(), obj: m.obj.slice(), base: (m.base || Array(m.W * m.H).fill("")).slice(), found: m.found, room: m.room, rx: m.rx, ry: m.ry }; }
  function pushHistory() { history.push(clone(ed)); if (history.length > 200) history.shift(); }

  function normChar(ch) {
    const map = { ".": "_", " ": "_", "I": "║", "W": "w", "C": "c", "O": "o", "S": "s", "F": "f" };
    ch = map[ch] || ch;
    return TERRAIN.has(ch) || E.KIND[ch] ? ch : "_";
  }
  function fromMap(lines, under = {}, name = "", theme = "warehouse") {
    lines = lines.map(l => [...l.replace(/\s+$/, "")]).filter(l => l.length);
    const H = lines.length, W = Math.max(...lines.map(l => l.length));
    const m = blank(W, H); m.name = name; m.theme = THEMES.includes(theme) ? theme : "warehouse";
    lines.forEach((l, y) => {
      for (let x = 0; x < W; x++) {
        const ch = normChar(l[x] ?? "w"), i = y * W + x;
        const u = under[x + "," + y];
        if (E.KIND[ch]) { m.obj[i] = ch; m.terr[i] = u || DEF_UNDER[ch]; }
        else { m.terr[i] = ch; if (OVERLAY[ch] && u && u !== OVERLAY[ch]) m.base[i] = u; }
      }
    });
    return m;
  }
  function toMap(m) {
    const map = [], under = {};
    for (let y = 0; y < m.H; y++) {
      let s = "";
      for (let x = 0; x < m.W; x++) {
        const i = y * m.W + x, o = m.obj[i];
        const t = m.terr[i], b = m.base && m.base[i];
        if (o) { s += o; if (t !== DEF_UNDER[o]) under[x + "," + y] = t; }
        else { s += t; if (OVERLAY[t] && b && b !== OVERLAY[t]) under[x + "," + y] = b; }
      }
      map.push(s);
    }
    return { map, under };
  }

  function paint(i, t, click) {
    paintTile(i, t, click);
    if (!OVERLAY[ed.terr[i]]) ed.base[i] = "";
  }
  function paintTile(i, t, click) {
    const terr = ed.terr[i], obj = ed.obj[i], ice = !!ICEC[terr], r = railsOf(terr);
    if (t === "s" || t === "f") {
      for (let j = 0; j < ed.terr.length; j++) if (ed.terr[j] === t) ed.terr[j] = "_";
      ed.terr[i] = t; ed.obj[i] = "";
    } else if (t === "w" || t === "o" || t === "_" || t === "e") {
      ed.terr[i] = t; ed.obj[i] = "";
    } else if (t === "~") {
      ed.terr[i] = (terr === "w" || terr === "o" || terr === "s" || terr === "f") ? "~" : compose(true, r.h, r.v);
      if (obj === "*") ed.obj[i] = "";
    } else if (t === "-" || t === "|" || t === "+") {
      const nr = railsOf(t);
      ed.terr[i] = compose(ice, nr.h, nr.v);
      if (obj === "=" && !nr.h) ed.obj[i] = "";
      if (obj === "║" && !nr.v) ed.obj[i] = "";
      if (obj === "*") ed.obj[i] = "";
    } else if (t === "c") {
      ed.obj[i] = "c";
      if (!E.CRATE_OK[terr]) ed.terr[i] = "_";
    } else if (t === "*") {
      ed.obj[i] = "*"; ed.terr[i] = "_";
    } else if (t === "b") {
      if (/^[1-5]$/.test(obj)) { if (click) ed.obj[i] = String(obj === "5" ? 1 : +obj + 1); }
      else ed.obj[i] = "1";
      if (!E.CRATE_OK[terr]) ed.terr[i] = "_";
    } else if (t === "≈") {
      ed.terr[i] = "≈"; ed.obj[i] = "";
    } else if (OVERLAY[t]) {
      // lily pads and reeds keep the tile they are painted on as their base (water for pads by default)
      const under = OVERLAY[terr] ? (ed.base[i] || OVERLAY[terr]) : terr;
      const b = (under === "w" || under === "o" || under === "s" || under === "f" || under === "e") ? OVERLAY[t] : under;
      ed.terr[i] = t; ed.base[i] = b === OVERLAY[t] ? "" : b;
      if (t !== ";" || (obj && !E.CRATE_OK[b])) ed.obj[i] = "";
      return;
    } else if (t === "=") {
      ed.obj[i] = "=";
      if (terr !== "o" && !r.h) ed.terr[i] = compose(ice, true, false);
    } else if (t === "║") {
      ed.obj[i] = "║";
      if (terr !== "o" && !r.v) ed.terr[i] = compose(ice, false, true);
    }
  }

  function levelOf(m) { return E.build(m.W, m.H, m.terr, m.obj, m.base); }

  // ---------- rendering ----------
  const board = $("board"), bctx = board.getContext("2d");

  // All graphics come from the 8x8 spritesheet (see SPRITES)
  function gapMaskOf(L, i) { let m = 0; for (let d = 0; d < 4; d++) { const n = E.nb(L, i, d); if (n >= 0 && L.terr[n] !== "w") m |= 1 << d; } return m; }
  function drawTile(ctx, L, i, x, y, now = performance.now()) { SP.tile(ctx, L, i, x, y, { gapMask: L.terr[i] === "o" ? gapMaskOf(L, i) : 0, ports: true, now }); }
  // splash ripples in progress during play-tests: { cell, t0 }
  function drawSplashes(L, ox, oy, now) {
    const list = play.splashes || [];
    for (let i = list.length - 1; i >= 0; i--) if (!SP.splash(bctx, list[i].cell % L.W - ox, ((list[i].cell / L.W) | 0) - oy, now - list[i].t0)) list.splice(i, 1);
  }
  const playerWet = (L, obj, px, py) => { const c = Math.round(py) * L.W + Math.round(px); return L.water[c] === 1 && !(obj[c] & E.SUNK); };
  function drawObj(ctx, k, fx, fy) { SP.obj(ctx, k, fx, fy); }

  function render() {
    if (kind === "room" && mode === "play") return renderRoomPlay();
    const m = ed;
    const L = mode === "play" ? play.L : levelOf(m);
    if (board.width !== m.W * TS || board.height !== m.H * TS) { board.width = m.W * TS; board.height = m.H * TS; fit(); }
    bctx.clearRect(0, 0, board.width, board.height);
    const now = performance.now();
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) drawTile(bctx, L, y * L.W + x, x, y, now);
    if (mode === "play") drawSplashes(L, 0, 0, now);
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) SP.reeds(bctx, L, y * L.W + x, x, y, "back");
    const obj = mode === "play" ? play.obj : L.obj;
    const a = mode === "play" ? play.anim : null;
    const el = a ? performance.now() - a.t0 : 0;
    const live = a && el < a.dur;
    const st = live ? E.animAt(L, a.data, el < a.first ? el / a.first : 1 + (el - a.first) / a.slide) : null;
    const skip = new Set(live ? a.data.ents.map(e => e.end) : []);
    for (let i = 0; i < obj.length; i++) if (obj[i]) SP.cell(bctx, obj, live ? a.prev : null, skip, i, i % L.W, (i / L.W) | 0);
    if (live) for (const e of st.ents) drawObj(bctx, e.k, e.x, e.y, TS);
    if (mode === "play") {
      const [x, y] = live ? st.player : [play.p % L.W, (play.p / L.W) | 0];
      const walking = live && st.playerDir >= 0;
      SP.player(bctx, x, y, walking ? st.playerDir : play.facing, walking ? 1 + (Math.floor(now / 90) % 3) : 0, playerWet(L, play.obj, x, y));
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) SP.reeds(bctx, L, y * L.W + x, x, y, "front");
    } else {
      if (kind === "room") drawRoomNPCs();
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) SP.reeds(bctx, L, y * L.W + x, x, y, "front");
      if (kind === "room") drawRoomOverlays();
      if (hover >= 0 && tool !== "stamp") {
        bctx.strokeStyle = C.gate; bctx.lineWidth = 1;
        bctx.strokeRect((hover % m.W) * TS + .5, ((hover / m.W) | 0) * TS + .5, TS - 1, TS - 1);
      }
    }
  }

  function fit() {
    const wrap = $("wrap");
    const r = wrap.getBoundingClientRect();
    const availH = window.innerWidth <= 1000 ? Math.max(260, window.innerHeight * .6) : r.height;
    const scale = Math.max(4, Math.min(r.width / ed.W, availH / ed.H, 96));
    board.style.width = Math.floor(scale * ed.W) + "px";
    board.style.height = Math.floor(scale * ed.H) + "px";
  }
  new ResizeObserver(fit).observe($("wrap"));

  // ---------- tool palette ----------
  function buildTools() {
    const host = $("tools");
    host.innerHTML = "";
    for (const t of TOOLS.filter(t => kind === "room" || !t.room)) {
      const b = document.createElement("button");
      b.className = "tool"; b.type = "button"; b.dataset.ch = t.ch;
      b.setAttribute("aria-pressed", String(t.ch === tool));
      const cv = document.createElement("canvas"); cv.width = cv.height = 8;
      const m = blank(3, 3);
      m.terr.fill(t.ch === "o" ? "w" : "_");
      if (t.ch === "o") { m.terr[4] = "o"; m.terr[3] = "-"; m.terr[5] = "_"; }
      b.append(cv, Object.assign(document.createElement("span"), { textContent: kind === "room" && t.roomName ? t.roomName : t.name }), Object.assign(document.createElement("kbd"), { textContent: t.key }));
      host.append(b);
      // preview: draw only the centre tile of a tiny 3x3 level
      const saved = ed; ed = m; if (t.ch !== "o" && t.ch !== "p") paint(4, t.ch); if (t.ch === "b") m.obj[4] = "3"; ed = saved;
      const L = levelOf(m), c2 = cv.getContext("2d");
      c2.save(); c2.translate(-8, -8);
      drawTile(c2, L, 4, 1, 1);
      if (L.obj[4]) drawObj(c2, L.obj[4], 1, 1);
      if (t.ch === "p") SP.player(c2, 1, 1, 2, 0);
      c2.restore();
      b.addEventListener("click", () => setTool(t.ch));
    }
  }
  function setTool(ch) {
    tool = ch;
    $("stampBtn").setAttribute("aria-pressed", String(ch === "stamp"));
    $("stampBtn").textContent = ch === "stamp" ? "Placing…" : "Place";
    document.querySelectorAll(".tool").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ch === ch)));
  }

  // ---------- editing input ----------
  let painting = false, paintTool = null, lastCell = -1, hover = -1;
  function cellAt(e) {
    const r = board.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * ed.W), y = Math.floor((e.clientY - r.top) / r.height * ed.H);
    if (x < 0 || y < 0 || x >= ed.W || y >= ed.H) return -1;
    return idx(x, y);
  }
  board.addEventListener("contextmenu", e => e.preventDefault());
  board.addEventListener("pointerdown", e => {
    if (mode !== "edit") return;
    const i = cellAt(e); if (i < 0) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    pushHistory();
    if (kind === "room" && e.button !== 2 && tool === "stamp") { placeStamp(i); edited(); return; }
    if (kind === "room" && e.button !== 2 && tool === "p") { setPlayerStart(i); edited(); return; }
    if (kind === "room" && e.button !== 2 && (tool === "g" || tool === "d")) { toggleNPC(i, tool === "g" ? "frog" : "dragonfly"); edited(); return; }
    painting = true; paintTool = e.button === 2 ? "_" : tool; lastCell = i;
    paint(i, paintTool, true); edited();
  });
  board.addEventListener("pointermove", e => {
    const i = cellAt(e);
    if (mode === "edit" && i !== hover) { hover = i; updateStatus(); render(); }
    if (!painting || i < 0 || i === lastCell) return;
    if (paintTool === "s" || paintTool === "f" || paintTool === "p" || paintTool === "stamp") return;
    lastCell = i; paint(i, paintTool); edited();
  });
  const stopPaint = () => { painting = false; };
  board.addEventListener("pointerup", stopPaint);
  board.addEventListener("pointercancel", stopPaint);
  board.addEventListener("pointerleave", () => { hover = -1; if (mode === "edit") { updateStatus(); render(); } });

  function edited(skipSolve) {
    render(); updateStatus();
    if (kind === "room") { commitView(); saveWorldSoon(); drawOverview(); markUnchecked(); return; }
    saveDraft();
    if (!skipSolve) scheduleSolve();
  }

  // ---------- transforms / size ----------
  function rotate() {
    pushHistory();
    const m = blank(ed.H, ed.W); m.name = ed.name;
    const swap = { "-": "|", "|": "-", "=": "║", "║": "=", "h": "v", "v": "h" };
    for (let y = 0; y < ed.H; y++) for (let x = 0; x < ed.W; x++) {
      const i = idx(x, y), nx = ed.H - 1 - y, ny = x, j = ny * m.W + nx;
      m.terr[j] = swap[ed.terr[i]] || ed.terr[i];
      m.obj[j] = swap[ed.obj[i]] || ed.obj[i];
      m.base[j] = swap[ed.base[i]] || ed.base[i];
    }
    ed = m; syncInputs(); edited();
  }
  function mirror() {
    pushHistory();
    const m = clone(ed);
    for (let y = 0; y < ed.H; y++) for (let x = 0; x < ed.W; x++) {
      const i = idx(x, y), j = idx(ed.W - 1 - x, y);
      m.terr[j] = ed.terr[i]; m.obj[j] = ed.obj[i]; m.base[j] = ed.base[i];
    }
    ed = m; edited();
  }
  function resize(W, H) {
    W = Math.max(3, Math.min(30, W | 0)); H = Math.max(3, Math.min(30, H | 0));
    pushHistory();
    const m = blank(W, H); m.name = ed.name;
    for (let y = 0; y < Math.min(H, ed.H); y++) for (let x = 0; x < Math.min(W, ed.W); x++) {
      m.terr[y * W + x] = ed.terr[idx(x, y)]; m.obj[y * W + x] = ed.obj[idx(x, y)]; m.base[y * W + x] = ed.base[idx(x, y)];
    }
    ed = m; syncInputs(); edited();
  }
  function syncInputs() { $("w").value = ed.W; $("h").value = ed.H; $("name").value = ed.name; $("theme").value = ed.theme || "warehouse"; }

  $("rot").addEventListener("click", rotate);
  $("mir").addEventListener("click", mirror);
  $("clear").addEventListener("click", () => { pushHistory(); const n = ed.name; ed = blank(ed.W, ed.H); ed.name = n; edited(); });
  $("undoEdit").addEventListener("click", undoEdit);
  $("applySize").addEventListener("click", () => resize(+$("w").value, +$("h").value));
  $("theme").addEventListener("change", () => { ed.theme = $("theme").value; saveDraft(); renderExport(); });
  $("name").addEventListener("input", () => { ed.name = $("name").value; saveDraft(); renderExport(); });
  function undoEdit() {
    if (!history.length) return;
    const h = history.pop();
    if (kind === "room") {
      if (h.rx !== cur[0] || h.ry !== cur[1]) { cur = [h.rx, h.ry]; updateRoomLabel(); }
      ed = roomEd = h; edited(); return;
    }
    ed = h; syncInputs(); edited();
  }

  // ---------- play-test ----------
  const play = { facing: 2, L: null, obj: null, p: -1, from: "s", hist: [], anim: null, pushes: 0, steps: 0, busyUntil: 0 };
  function startPlay(from) {
    play.from = from || play.from;
    let start;
    if (kind === "room") start = startRoomPlay();
    else {
      play.global = false; play.npc = null;
      play.L = levelOf(ed);
      start = play.from === "s" ? play.L.s : play.L.f;
      play.target = play.from === "s" ? play.L.f : play.L.s; play.startCell = start;
    }
    play.obj = play.L.obj.slice(); play.p = start; play.hist = []; play.anim = null; play.pushes = 0; play.steps = 0;
    play.path = []; play.reached = false; play.splashes = [];
    stopWatch();
    $("banner").hidden = true;
    updateStatus(); render();
  }
  function setMode(m) {
    mode = m;
    $("tabEdit").setAttribute("aria-selected", String(m === "edit"));
    $("tabPlay").setAttribute("aria-selected", String(m === "play"));
    $("playControls").hidden = m !== "play";
    $("stage").classList.toggle("play", m === "play");
    if (m === "play") {
      if (kind === "comp") {
        const L = levelOf(ed);
        if (L.sCount !== 1 || L.fCount !== 1) { mode = "edit"; setMode("edit"); flash("Place exactly one s and one f to play-test."); return; }
      }
      startPlay(kind === "room" ? "p" : undefined);
    } else {
      stopWatch(); $("banner").hidden = true;
      if (kind === "room") { loadView(); updateRoomLabel(); drawOverview(); markUnchecked(); }
      updateStatus(); render();
    }
  }
  function playMove(d) {
    if (mode !== "play" || performance.now() < play.busyUntil) return false;
    const r = E.step(play.L, play.p, play.obj, d);
    if (!r) return false;
    play.hist.push({ p: play.p, obj: play.obj, pushes: play.pushes, steps: play.steps, pathLen: play.path.length });
    play.path.push(d);
    const first = r.crates >= 5 ? 620 : r.crates === 4 ? 300 : 95, slide = 60;
    const dur = first + Math.max(0, r.anim.T - 1) * slide;
    const t0 = performance.now();
    play.anim = { data: r.anim, t0, dur, first, slide, prev: play.obj };
    play.facing = d;
    const when = t => t0 + (t < 1 ? t * first : first + (t - 1) * slide);
    for (const s of r.splashes) (play.splashes ||= []).push({ cell: s.cell, t0: when(s.t) });
    if (r.splash) { (play.splashes ||= []).push({ cell: r.splash.cell, t0: when(r.splash.t) }); play.facing = (d + 2) % 4; }
    play.busyUntil = performance.now() + dur;
    play.p = r.p; play.obj = r.obj; play.steps++;
    if (r.changed) play.pushes++;
    if (play.npc) play.npc.playerMoved(play.p, t0);
    if (play.global) followPlayer();
    const target = play.target, startCell = play.startCell;
    let msg = "";
    if (target >= 0 && play.p === target) msg = `Reached ${play.from === "s" ? "f" : "s"} · ${play.steps} steps, ${play.pushes} pushes`;
    if (play.global && play.L.terr[play.p] === "e") msg = `Found the exit · ${play.steps} steps`;
    $("banner").textContent = msg;
    $("banner").hidden = !msg;
    // A solution found by hand counts too: record it so the results and export include it.
    // In room mode it only counts if the player stayed inside this room the whole time.
    const fair = !play.global || !play.leftRoom;
    if (fair && target >= 0 && play.p === target && !play.reached) { play.reached = true; recordPlay(play.from === "s" ? "sf" : "fs", play.pushes, play.path.slice()); }
    else if (fair && play.reached && play.p === startCell) recordPlay(play.from === "s" ? "sfs" : "fsf");
    updateStatus();
    return true;
  }
  function undoMove() {
    const h = play.hist.pop(); if (!h) return;
    stopWatch();
    play.path.length = h.pathLen;
    Object.assign(play, h); play.anim = null; play.busyUntil = 0; $("banner").hidden = true; updateStatus(); render();
  }

  // Hold-to-repeat keyboard movement
  const KEYDIR = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  let held = -1, nextRepeat = 0;
  const typing = e => /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  addEventListener("keydown", e => {
    if (typing(e)) return;
    if (mode === "play") {
      if (e.key in KEYDIR) { e.preventDefault(); if (e.repeat) return; stopWatch(); held = KEYDIR[e.key]; playMove(held); nextRepeat = performance.now() + 170; return; }
      if (e.key === "z" || e.key === "Z") { e.preventDefault(); undoMove(); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); startPlay(); return; }
      if (e.key === "Escape") { setMode("edit"); return; }
    } else {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoEdit(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (kind === "room") {
        if (e.key in KEYDIR) { e.preventDefault(); const d = KEYDIR[e.key]; goRoom(cur[0] + E.DX[d], cur[1] + E.DY[d]); return; }
        if (tool === "stamp" && (e.key === "r" || e.key === "R")) { e.preventDefault(); turnStamp(1); return; }
        if (tool === "stamp" && (e.key === "m" || e.key === "M")) { e.preventDefault(); turnStamp(4); return; }
        if (tool === "stamp" && e.key === "Escape") { setTool("w"); render(); return; }
      }
      const t = TOOLS.find(t => (kind === "room" || !t.room) && (t.key === e.key || (t.ch === "_" && e.key === ".")));
      if (t) { e.preventDefault(); setTool(t.ch); }
    }
  });
  addEventListener("keyup", e => { if (KEYDIR[e.key] === held) held = -1; });
  addEventListener("blur", () => { held = -1; });

  // Solution playback
  let watch = null;
  function watchSolution(which) {
    if (!lastResult || !lastResult[which] || !lastResult[which].path) return;
    setMode("play"); if (mode !== "play") return;
    startPlay(which === "sf" ? "s" : "f");
    const path = lastResult[which].path.slice();
    watch = { path, i: 0 };
  }
  function stopWatch() { watch = null; }

  $("tabEdit").addEventListener("click", () => setMode("edit"));
  $("tabPlay").addEventListener("click", () => setMode("play"));
  $("startS").addEventListener("click", () => startPlay("s"));
  $("startP").addEventListener("click", () => startPlay("p"));
  $("startF").addEventListener("click", () => startPlay("f"));
  $("undoMove").addEventListener("click", undoMove);
  $("resetPlay").addEventListener("click", () => startPlay());

  function loop(now) {
    if (mode === "play") {
      if (watch && now >= play.busyUntil + 60) {
        if (watch.i < watch.path.length) playMove(watch.path[watch.i++]); else stopWatch();
      } else if (!watch && held >= 0 && now >= nextRepeat && now >= play.busyUntil) {
        playMove(held); nextRepeat = now + 80;
      }
      if (play.npc) play.npc.update(now);
      render();
    }
    requestAnimationFrame(loop);
  }

  // ---------- status ----------
  let flashMsg = "", flashUntil = 0;
  function flash(msg) { flashMsg = msg; flashUntil = performance.now() + 3000; updateStatus(); setTimeout(updateStatus, 3100); }
  function updateStatus() {
    let s;
    if (performance.now() < flashUntil) s = flashMsg;
    else if (mode === "play") s = `From ${play.from} · ${play.steps} steps · ${play.pushes} pushes${watch ? " · showing solution" : ""}`;
    else if (hover >= 0) {
      const x = hover % ed.W, y = (hover / ed.W) | 0, o = ed.obj[hover];
      s = `${kind === "room" ? roomName(...cur) + " · " : ed.W + "×" + ed.H + " · "}x ${x}, y ${y} · ${o ? o + " on " : ""}${ed.terr[hover]}`;
    } else s = `${kind === "room" ? roomName(...cur) : ed.W + "×" + ed.H} · tool: ${tool === "stamp" ? "component" : (TOOLS.find(t => t.ch === tool) || TOOLS[0]).name}`;
    $("status").textContent = s;
  }

  // ---------- solver (Web Worker) ----------
  let worker = null, solveTimer = 0, lastResult = null, solverRaw = null, solveId = 0;
  function makeWorker() {
    try {
      const src = `const E=(${ENGINE.toString()})();onmessage=e=>{let r;try{r=E.solveAll(e.data)}catch(err){r={error:String(err)}}r.id=e.data.id;postMessage(r)};`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      w.onmessage = e => { if (e.data.id === solveId) showResult(e.data); };
      return w;
    } catch (e) { return null; }
  }
  function scheduleSolve() {
    clearTimeout(solveTimer);
    lastResult = null; solverRaw = null;
    $("verdict").className = "verdict";
    $("verdict").innerHTML = "<strong>Solving…</strong><p></p>";
    solveTimer = setTimeout(runSolve, 300);
  }
  function runSolve() {
    solveId++;
    const data = { id: solveId, W: ed.W, H: ed.H, terr: ed.terr.slice(), obj: ed.obj.slice(), base: ed.base.slice(), cap: 300000 };
    if (worker) worker.terminate();
    worker = makeWorker();
    if (worker) worker.postMessage(data);
    else { const r = E.solveAll(data); r.id = solveId; showResult(r); }
  }

  // Solutions found while play-testing, tied to the exact map they were found on.
  const mapKey = () => ed.W + "x" + ed.H + ":" + ed.terr.join("") + "|" + ed.obj.map(o => o || ".").join("") + "|" + ed.base.map(b => b || ".").join("");
  function playFound() {
    if (!ed.found || ed.found.key !== mapKey()) ed.found = { key: mapKey(), sf: null, fs: null, sfs: false, fsf: false };
    return ed.found;
  }
  function recordPlay(which, pushes, path) {
    const f = playFound();
    let news = false;
    if (which === "sfs" || which === "fsf") { news = !f[which]; f[which] = true; }
    else if (!f[which] || pushes < f[which].pushes) { news = true; f[which] = { pushes, steps: path.length, path }; }
    if (!news) return;
    saveDraft();
    const label = { sf: "s → f", fs: "f → s", sfs: "back to s after reaching f", fsf: "back to f after reaching s" }[which];
    flash(`Your solution (${label}) was added to the results.`);
    if (solverRaw) showResult(solverRaw);
    else if (kind === "room") showResult(uncheckedRaw());
  }
  // Solver results plus anything proven by play, whichever is better.
  function mergePlay(raw) {
    const r = { ...raw, sf: { ...raw.sf }, fs: { ...raw.fs } };
    const f = ed.found && ed.found.key === mapKey() ? ed.found : null;
    if (f) for (const k of ["sf", "fs"]) {
      const m = f[k];
      if (m && (!r[k].ok || m.pushes < r[k].pushes)) Object.assign(r[k], { ok: true, pushes: m.pushes, steps: m.steps, path: m.path, byPlayer: true });
      const rt = k === "sf" ? "sfs" : "fsf";
      if (f[rt] && !r[k].roundTrip) { r[k].roundTrip = true; r[k].rtByPlayer = true; }
    }
    return r;
  }

  function classify(r) {
    const sf = r.sf.ok, fs = r.fs.ok, sfs = r.sf.roundTrip, fsf = r.fs.roundTrip;
    if (sf && fs && sfs && fsf) return "both";
    if (sf && fs) return "either-once";
    if (sf) return "sf";
    if (fs) return "fs";
    return "none";
  }
  function rate(r) {
    const scores = [r.sf, r.fs].filter(x => x.ok).map(x => x.pushes * (1 + 2 * (x.capped ? 0 : x.dead)));
    if (!scores.length) return null;
    const s = Math.max(...scores);
    if (s === 0) return 0;
    return s < 4 ? 1 : s < 8 ? 2 : s < 14 ? 3 : s < 22 ? 4 : 5;
  }

  function warningsFor(r) {
    const w = [];
    if (r && !r.error) {
      if (r.sf.ok && r.sf.pushes === 0) w.push("s → f needs no pushes: the player can walk straight through.");
      if (r.fs.ok && r.fs.pushes === 0) w.push("f → s needs no pushes: the player can walk straight through.");
      if (r.sf.capped || r.fs.capped) w.push("The solver stopped after 300,000 positions, so it may have missed solutions. Solve it yourself in Play-test and your solution is added to the results.");
    }
    return w;
  }

  function showResult(raw) {
    solverRaw = raw.error ? null : raw;
    const r = raw.error ? raw : mergePlay(raw);
    lastResult = r.error ? null : r;
    const v = $("verdict"), tb = $("results").tBodies[0];
    tb.innerHTML = "";
    if (r.error) {
      v.className = "verdict v-none";
      v.innerHTML = `<strong>Can't solve yet</strong><p>${r.error}</p>`;
    } else {
      const dir = classify(r), rating = rate(r);
      r.dir = dir; r.rating = rating;
      const [title, text] = DIR_LABEL[dir];
      const pips = rating == null ? "" : `<span class="pips" title="Difficulty ${rating} of 5">${[1,2,3,4,5].map(n => `<i class="${n <= rating ? "on" : ""}"></i>`).join("")}</span>`;
      v.className = "verdict v-" + dir;
      v.innerHTML = `<strong>${title}</strong><p>${text}</p><p>Difficulty ${rating == null ? "–" : rating === 0 ? "0 (no pushes)" : rating + " / 5"}${pips}</p>`;
      const yn = b => `<span class="${b ? "yes" : "no"}">${b ? "yes" : "no"}</span>`;
      const pr = x => x.ok ? `${x.pushes} pushes, ${x.steps} steps${x.byPlayer ? " (yours)" : ""}` : `<span class="no">${x.capped ? "not found" : "impossible"}</span>`;
      const rtl = x => yn(x.roundTrip) + (x.rtByPlayer ? " (yours)" : "");
      const rows = [
        ["s → f", pr(r.sf), r.sf.ok ? `<button class="ghost" data-watch="sf" type="button">Watch</button>` : ""],
        ["f → s", pr(r.fs), r.fs.ok ? `<button class="ghost" data-watch="fs" type="button">Watch</button>` : ""],
        ["Back to s after reaching f", rtl(r.sf), ""],
        ["Back to f after reaching s", rtl(r.fs), ""],
        ["Dead-end states from s", r.sf.capped ? "unknown" : `${Math.round(r.sf.dead * 100)}%`, ""],
        ["Dead-end states from f", r.fs.capped ? "unknown" : `${Math.round(r.fs.dead * 100)}%`, ""],
        ["States searched", `${(r.sf.states + r.fs.states).toLocaleString("en")} · ${r.ms} ms`, ""],
      ];
      tb.innerHTML = rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join("");
      tb.querySelectorAll("[data-watch]").forEach(b => b.addEventListener("click", () => watchSolution(b.dataset.watch)));
    }
    $("warnings").innerHTML = warningsFor(r).map(t => `<li>${t}</li>`).join("");
    renderExport();
  }

  // ---------- export / library ----------
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6); }
  function componentData() {
    const { map, under } = toMap(ed);
    const parts = [...new Set(ed.obj.concat(ed.terr).filter(ch => "c=║-|+o~hvx*12345".includes(ch) && ch))].sort().join("");
    const r = lastResult;
    const meta = r ? {
      dir: r.dir, rating: r.rating,
      sf: r.sf.ok ? r.sf.pushes : null, fs: r.fs.ok ? r.fs.pushes : null,
      sfs: r.sf.roundTrip, fsf: r.fs.roundTrip, parts,
      byPlayer: [r.sf.byPlayer && "sf", r.fs.byPlayer && "fs", r.sf.rtByPlayer && "sfs", r.fs.rtByPlayer && "fsf"].filter(Boolean).join(","),
    } : null;
    return { id: "p-" + hashStr(map.join("/") + JSON.stringify(under)), name: ed.name || "Untitled", theme: ed.theme || "warehouse", map, under, meta };
  }
  function fmtComponent(c) {
    const q = s => JSON.stringify(s);
    const m = c.meta;
    const metaStr = m ? `{ dir: ${q(m.dir)}, rating: ${m.rating}, sf: ${m.sf}, fs: ${m.fs}, sfs: ${m.sfs}, fsf: ${m.fsf}, parts: ${q(m.parts)}${m.byPlayer ? `, byPlayer: ${q(m.byPlayer)}` : ""} }` : "null";
    return `{\n  id: ${q(c.id)},\n  name: ${q(c.name)},\n  theme: ${q(c.theme || "warehouse")},\n  map: [\n${c.map.map(l => "    " + q(l)).join(",\n")},\n  ],\n  under: ${JSON.stringify(c.under)},\n  meta: ${metaStr},\n}`;
  }
  function renderExport() {
    $("exportOut").textContent = lastResult ? fmtComponent(componentData()) : "Waiting for the solver…";
    $("copyExport").disabled = $("saveLib").disabled = !lastResult;
  }
  function copyText(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => btn.textContent = o, 1200); };
    const fallback = () => {
      if (kind === "room") { $("worldText").value = text; $("worldText").select(); }
      else {
        const r = document.createRange(); r.selectNodeContents($("exportOut"));
        $("exportOut").textContent = text;
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
      flash("Copy blocked here. The text is selected: press Ctrl+C.");
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  $("copyExport").addEventListener("click", () => copyText(fmtComponent(componentData()), $("copyExport")));

  let library = [];
  const LIB_KEY = "squirrel-designer-library", DRAFT_KEY = "squirrel-designer-draft";
  // Older builds used "tfr-" keys; read those once if the new key is empty.
  const OLD_KEYS = { "squirrel-designer-library": "tfr-designer-library", "squirrel-designer-draft": "tfr-designer-draft", "squirrel-world": "tfr-world", "squirrel-designer-kind": "tfr-designer-kind" };
  function loadStore(k) {
    try { return JSON.parse(localStorage.getItem(k) ?? (OLD_KEYS[k] ? localStorage.getItem(OLD_KEYS[k]) : null)); } catch (e) { return null; }
  }
  function saveStore(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function saveDraft() { if (kind === "room") { commitView(); saveWorldSoon(); } else saveStore(DRAFT_KEY, ed); }
  function renderLib() {
    const ul = $("lib");
    $("libCount").textContent = library.length ? `· ${library.length}` : "";
    if (!library.length) { refreshCompPick(); ul.innerHTML = `<li class="empty" style="border:0;padding:0;display:block">Saved components appear here. Copy the whole library to send them in one go.</li>`; $("copyLib").disabled = true; return; }
    $("copyLib").disabled = false;
    ul.innerHTML = "";
    refreshCompPick();
    library.forEach((c, n) => {
      const li = document.createElement("li");
      const name = Object.assign(document.createElement("button"), { className: "name", type: "button", textContent: c.name, title: "Load into editor" });
      const meta = Object.assign(document.createElement("span"), { className: "meta", textContent: `${c.map[0].length}×${c.map.length} · ${c.meta ? DIR_LABEL[c.meta.dir][0] + " · " + (c.meta.rating ?? "–") : "unsolved"} · ${c.theme || "warehouse"}` });
      const del = Object.assign(document.createElement("button"), { className: "del", type: "button", textContent: "×", title: "Remove from library" });
      del.setAttribute("aria-label", "Remove " + c.name);
      name.addEventListener("click", () => loadComponent(c));
      del.addEventListener("click", () => { library.splice(n, 1); saveStore(LIB_KEY, library); renderLib(); });
      li.append(name, meta, del); ul.append(li);
    });
  }
  $("saveLib").addEventListener("click", () => {
    const c = componentData();
    const at = library.findIndex(x => x.id === c.id || (x.name === c.name && c.name !== "Untitled"));
    if (at >= 0) library[at] = c; else library.push(c);
    saveStore(LIB_KEY, library); renderLib(); flash(`Saved “${c.name}” to the library.`);
  });
  $("copyLib").addEventListener("click", () => copyText("[\n" + library.map(fmtComponent).join(",\n") + "\n]", $("copyLib")));

  function loadComponent(c) {
    if (mode === "play") setMode("edit");
    pushHistory();
    ed = fromMap(c.map, c.under || {}, c.name || "", c.theme || "warehouse");
    syncInputs(); edited();
  }
  $("importBtn").addEventListener("click", () => {
    const txt = $("importText").value;
    try {
      let lines, under = {}, name = "", theme = "warehouse";
      const mm = txt.match(/map\s*:\s*\[([\s\S]*?)\]/);
      if (mm) {
        lines = [...mm[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse('"' + m[1] + '"'));
        const um = txt.match(/under\s*:\s*(\{[^}]*\})/);
        if (um) under = JSON.parse(um[1].replace(/([{,]\s*)([\w-]+)\s*:/g, '$1"$2":'));
        const nm = txt.match(/name\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (nm) name = JSON.parse('"' + nm[1] + '"');
        const tm = txt.match(/theme\s*:\s*"(\w+)"/);
        if (tm) theme = tm[1];
      } else {
        lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      }
      if (!lines.length) throw new Error("empty");
      if (lines.length > 30 || Math.max(...lines.map(l => [...l].length)) > 30) throw new Error("big");
      loadComponent({ map: lines, under, name, theme });
      $("importMsg").textContent = `Loaded ${ed.W}×${ed.H}`;
    } catch (e) {
      $("importMsg").textContent = e.message === "big" ? "Components can be at most 30×30." : "Couldn't read that. Paste ASCII rows or an exported component.";
    }
  });


  // =====================================================================
  // Room designer: the world is one grid of 5x5 rooms, 20x20 tiles each.
  // Neighbouring rooms share their outer row/column, so the grid is 5*19+1 = 96 tiles square.
  // The editor works on a 20x20 view of the current room (with its test s/f markers overlaid)
  // and writes every change straight back into the world.
  // =====================================================================
  const RN = 5, RS = 20, GW = RN * (RS - 1) + 1, COLS = "ABCDE";
  const WORLD_KEY = "squirrel-world", KIND_KEY = "squirrel-designer-kind";
  let world = null, cur = [2, 2], compEd = null, roomEd = null, stamp = { pick: "", t: 0 };
  const gidx = (gx, gy) => gy * GW + gx;
  const origin = (rx, ry) => [rx * (RS - 1), ry * (RS - 1)];
  const roomName = (rx, ry) => COLS[rx] + (ry + 1);
  const roomKey = (rx, ry) => rx + "," + ry;
  function roomData(rx, ry) { const k = roomKey(rx, ry); return world.rooms[k] || (world.rooms[k] = { s: -1, f: -1, found: null }); }

  function defaultWorld() {
    const terr = Array(GW * GW).fill("_"), obj = Array(GW * GW).fill("");
    for (let y = 0; y < GW; y++) for (let x = 0; x < GW; x++) if (x % (RS - 1) === 0 || y % (RS - 1) === 0) terr[gidx(x, y)] = "w";
    const [ox, oy] = origin(2, 2);
    return { terr, obj, base: Array(GW * GW).fill(""), npcs: [], start: gidx(ox + 10, oy + 10), rooms: {} };
  }
  function loadView() {
    const [ox, oy] = origin(...cur), m = blank(RS, RS);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
      const g = gidx(ox + x, oy + y), i = y * RS + x;
      m.terr[i] = world.terr[g]; m.obj[i] = world.obj[g]; m.base[i] = world.base[g];
    }
    const rd = roomData(...cur);
    if (rd.s >= 0) { m.terr[rd.s] = "s"; m.obj[rd.s] = ""; }
    if (rd.f >= 0) { m.terr[rd.f] = "f"; m.obj[rd.f] = ""; }
    m.found = rd.found || null; m.room = true; m.rx = cur[0]; m.ry = cur[1];
    ed = roomEd = m;
  }
  function commitView() {
    if (!ed || !ed.room) return;
    const [ox, oy] = origin(ed.rx, ed.ry), rd = roomData(ed.rx, ed.ry);
    rd.s = rd.f = -1;
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
      const g = gidx(ox + x, oy + y), i = y * RS + x, t = ed.terr[i];
      if (t === "s" || t === "f") { rd[t] = i; world.terr[g] = "_"; world.obj[g] = ""; world.base[g] = ""; }   // test markers stand on plain floor
      else { world.terr[g] = t; world.obj[g] = ed.obj[i]; world.base[g] = ed.base[i]; }
    }
    rd.found = ed.found || null;
  }
  let saveTimer = 0;
  function saveWorldSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveWorld, 250); }
  // don't lose the last edit when the page is closed or reloaded right after it
  addEventListener("pagehide", () => { if (world && kind === "room") { commitView(); saveWorld(); } });
  function saveWorld() {
    clearTimeout(saveTimer);
    saveStore(WORLD_KEY, { v: 1, terr: world.terr.join(""), obj: world.obj.map(o => o || ".").join(""), base: world.base.map(b => b || ".").join(""), npcs: world.npcs, start: world.start, rooms: world.rooms, cur });
  }
  function loadWorld() {
    const s = loadStore(WORLD_KEY);
    if (!s || s.v !== 1) return null;
    const terr = [...s.terr], obj = [...s.obj].map(c => c === "." ? "" : c);
    if (terr.length !== GW * GW || obj.length !== GW * GW) return null;
    const base = s.base ? [...s.base].map(c => c === "." ? "" : c) : Array(GW * GW).fill("");
    return { terr, obj, base, npcs: s.npcs || [], start: s.start ?? -1, rooms: s.rooms || {}, _cur: s.cur };
  }

  function goRoom(rx, ry) {
    if (rx < 0 || ry < 0 || rx >= RN || ry >= RN || mode !== "edit") return;
    commitView(); cur = [rx, ry]; loadView(); hover = -1;
    updateRoomLabel(); drawOverview(); markUnchecked(); render(); updateStatus(); saveWorldSoon();
  }
  function updateRoomLabel() {
    $("roomLabel").textContent = "· " + roomName(...cur);
    const can = (dx, dy) => { const x = cur[0] + dx, y = cur[1] + dy; return x >= 0 && y >= 0 && x < RN && y < RN; };
    $("goN").disabled = !can(0, -1); $("goS").disabled = !can(0, 1); $("goW").disabled = !can(-1, 0); $("goE").disabled = !can(1, 0);
  }
  $("goN").addEventListener("click", () => goRoom(cur[0], cur[1] - 1));
  $("goS").addEventListener("click", () => goRoom(cur[0], cur[1] + 1));
  $("goW").addEventListener("click", () => goRoom(cur[0] - 1, cur[1]));
  $("goE").addEventListener("click", () => goRoom(cur[0] + 1, cur[1]));

  // world overview: 2 px per tile, room outlines, current room highlighted
  const ov = $("overview"), octx = ov.getContext("2d");
  const ovBuf = document.createElement("canvas"); ovBuf.width = ovBuf.height = GW;
  const OVT = { w: "#7b5a3c", o: "#7b5a3c", "~": "#9cc9d8", h: "#9cc9d8", v: "#9cc9d8", x: "#9cc9d8", e: "#7fd18b", "-": "#56646a", "|": "#56646a", "+": "#56646a", "≈": "#1d4a66", "@": "#4f8f3a", "%": "#3f7a36", "&": "#f0a8bf", ";": "#6f9a3c" };
  const OVO = { c: "#c28b55", "=": "#9fb3c8", "║": "#9fb3c8", "*": "#dfe8eb", "1": "#ffffff", "2": "#ffffff", "3": "#ffffff", "4": "#ffffff", "5": "#e6eef0" };
  function drawOverview() {
    if (!world) return;
    const b = ovBuf.getContext("2d"), img = b.createImageData(GW, GW);
    for (let i = 0; i < GW * GW; i++) {
      const c = OVO[world.obj[i]] || OVT[world.terr[i]] || "#3a2a1e";
      img.data[i * 4] = parseInt(c.slice(1, 3), 16); img.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16); img.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16); img.data[i * 4 + 3] = 255;
    }
    b.putImageData(img, 0, 0);
    octx.imageSmoothingEnabled = false;
    octx.clearRect(0, 0, ov.width, ov.height);
    octx.drawImage(ovBuf, 0, 0, GW * 2, GW * 2);
    octx.strokeStyle = "rgba(17,23,26,.55)"; octx.lineWidth = 1;
    for (let k = 1; k < RN; k++) { const p = k * (RS - 1) * 2 + 1; octx.beginPath(); octx.moveTo(p, 0); octx.lineTo(p, GW * 2); octx.moveTo(0, p); octx.lineTo(GW * 2, p); octx.stroke(); }
    const [ox, oy] = origin(...cur);
    octx.strokeStyle = C.gate; octx.lineWidth = 2; octx.strokeRect(ox * 2 + 1, oy * 2 + 1, RS * 2 - 2, RS * 2 - 2);
    if (world.start >= 0) { octx.fillStyle = C.player; octx.fillRect((world.start % GW) * 2 - 1, ((world.start / GW) | 0) * 2 - 1, 4, 4); }
  }
  ov.addEventListener("click", e => {
    const r = ov.getBoundingClientRect();
    const gx = (e.clientX - r.left) / r.width * GW, gy = (e.clientY - r.top) / r.height * GW;
    goRoom(Math.min(RN - 1, Math.floor(gx / (RS - 1))), Math.min(RN - 1, Math.floor(gy / (RS - 1))));
  });

  function setPlayerStart(i) {
    const [ox, oy] = origin(...cur);
    if (!(E.WALK[ed.terr[i]] || ed.terr[i] === ";") || ed.terr[i] === "s" || ed.terr[i] === "f") { ed.terr[i] = "_"; ed.base[i] = ""; }
    ed.obj[i] = "";
    world.start = gidx(ox + i % RS, oy + ((i / RS) | 0));
  }
  // NPCs (frogs, dragonflies) are placed by clicking; clicking one again removes it
  function toggleNPC(i, type) {
    const [ox, oy] = origin(...cur), g = gidx(ox + i % RS, oy + ((i / RS) | 0));
    const at = world.npcs.findIndex(n => n.g === g);
    if (at >= 0) { world.npcs.splice(at, 1); return; }
    const L = levelOf(ed);
    if (type === "frog" && (!(L.water[i] || E.WALK[L.eff[i]]) || ed.obj[i])) { flash("A frog needs open water or ground it can stand on."); return; }
    if (type === "dragonfly" && (L.eff[i] === "w" || L.eff[i] === "o")) { flash("A dragonfly can't live inside a wall. Put it on reeds."); return; }
    world.npcs.push({ type, g });
  }
  function drawRoomNPCs() {
    const [ox, oy] = origin(...cur), L = levelOf(ed);
    for (const n of world.npcs) {
      const x = n.g % GW - ox, y = ((n.g / GW) | 0) - oy;
      if (x < 0 || y < 0 || x >= RS || y >= RS) continue;
      if (n.type === "dragonfly") SP.draw(bctx, "dragonfly_sit2", x * 8, y * 8 - 3);
      else if (L.water[y * RS + x]) SP.drawSubmerged(bctx, "frog_swim0", x * 8, y * 8, false, 5, 1);
      else SP.draw(bctx, "frog_jump0", x * 8, y * 8);
    }
  }
  function drawRoomOverlays() {
    const [ox, oy] = origin(...cur);
    if (world.start >= 0) {
      const sx = world.start % GW - ox, sy = ((world.start / GW) | 0) - oy;
      if (sx >= 0 && sy >= 0 && sx < RS && sy < RS) SP.player(bctx, sx, sy, 2, 0);
    }
    if (tool === "stamp" && hover >= 0) {
      const g = stampGrid(); if (!g) return;
      const x0 = hover % RS - (g.W >> 1), y0 = ((hover / RS) | 0) - (g.H >> 1);
      const L = E.build(g.W, g.H, g.terr, g.obj, g.base);
      bctx.save(); bctx.globalAlpha = .75; bctx.translate(x0 * TS, y0 * TS);
      for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) { drawTile(bctx, L, y * g.W + x, x, y); if (L.obj[y * g.W + x]) drawObj(bctx, L.obj[y * g.W + x], x, y); }
      bctx.restore();
      bctx.strokeStyle = C.gate; bctx.lineWidth = 1; bctx.strokeRect(x0 * TS + .5, y0 * TS + .5, g.W * TS - 1, g.H * TS - 1);
    }
  }

  // ---- inserting components ----
  function allComps() {
    return [...LIBRARY.map((c, n) => ({ key: "b" + n, label: c.name, group: "Game library", c })),
            ...library.map((c, n) => ({ key: "u" + n, label: c.name, group: "My library", c }))];
  }
  function refreshCompPick() {
    const sel = $("compPick"), keep = sel.value || stamp.pick;
    sel.innerHTML = "";
    for (const group of ["Game library", "My library"]) {
      const items = allComps().filter(o => o.group === group);
      if (!items.length) continue;
      const og = document.createElement("optgroup"); og.label = group;
      for (const o of items) og.append(new Option(`${o.label} (${o.c.map[0].length}×${o.c.map.length})`, o.key));
      sel.append(og);
    }
    if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
    stamp.pick = sel.value;
  }
  function stampGrid() {
    const o = allComps().find(o => o.key === stamp.pick);
    return o ? CP.transform(CP.parse(o.c), stamp.t) : null;
  }
  function turnStamp(k) {
    if (k === 4) stamp.t = (stamp.t & 3) | ((stamp.t & 4) ^ 4); else stamp.t = (stamp.t & 4) | ((stamp.t + 1) & 3);
    render();
  }
  function placeStamp(i) {
    const g = stampGrid(); if (!g) return;
    const x0 = i % RS - (g.W >> 1), y0 = ((i / RS) | 0) - (g.H >> 1);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const X = x0 + x, Y = y0 + y;
      if (X < 0 || Y < 0 || X >= RS || Y >= RS) continue;
      const j = y * g.W + x, k = Y * RS + X, t = g.terr[j];
      if (t === "s" || t === "f") {           // the piece's own s/f become this room's test markers if it has none yet
        if (!ed.terr.includes(t)) { ed.terr[k] = t; ed.obj[k] = ""; } else { ed.terr[k] = "_"; ed.obj[k] = ""; }
      } else { ed.terr[k] = t; ed.obj[k] = g.obj[j]; ed.base[k] = g.base[j] || ""; }
    }
  }
  $("compPick").addEventListener("change", () => { stamp.pick = $("compPick").value; stamp.t = 0; setTool("stamp"); render(); });
  $("stampBtn").addEventListener("click", () => { setTool(tool === "stamp" ? "w" : "stamp"); render(); });
  $("stampRot").addEventListener("click", () => { turnStamp(1); if (tool !== "stamp") setTool("stamp"); });
  $("stampMir").addEventListener("click", () => { turnStamp(4); if (tool !== "stamp") setTool("stamp"); });
  $("undoRoom").addEventListener("click", undoEdit);
  $("clearRoom").addEventListener("click", () => {
    pushHistory();
    for (let y = 1; y < RS - 1; y++) for (let x = 1; x < RS - 1; x++) { ed.terr[y * RS + x] = "_"; ed.obj[y * RS + x] = ""; }
    edited();
  });

  // ---- route check (optional) ----
  function uncheckedRaw() {
    const none = { ok: false, pushes: null, steps: null, path: null, states: 0, capped: true, dead: 0, roundTrip: false };
    return { sf: { ...none }, fs: { ...none }, ms: 0 };
  }
  function markUnchecked() {
    if (kind !== "room") return;
    clearTimeout(solveTimer); solveId++;
    lastResult = null; solverRaw = null;
    const hasS = ed.terr.includes("s"), hasF = ed.terr.includes("f");
    $("verdict").className = "verdict";
    $("verdict").innerHTML = `<strong>Not checked</strong><p>${hasS && hasF ? "Press Check s ↔ f to see whether the route works." : "Place a test start (s) and a test finish (f) in this room first."}</p>`;
    $("results").tBodies[0].innerHTML = ""; $("warnings").innerHTML = "";
    if (ed.found && ed.found.key === mapKey() && (ed.found.sf || ed.found.fs)) showResult(uncheckedRaw());
  }
  $("checkRoute").addEventListener("click", () => {
    if (!ed.terr.includes("s") || !ed.terr.includes("f")) { flash("Place a test start (s) and a test finish (f) first."); return; }
    $("verdict").className = "verdict"; $("verdict").innerHTML = "<strong>Solving…</strong><p></p>";
    runSolve();
  });

  // ---- play-testing the whole world ----
  function roomOfCell(g) { const gx = g % GW, gy = (g / GW) | 0; return [Math.min(RN - 1, Math.floor(gx / (RS - 1))), Math.min(RN - 1, Math.floor(gy / (RS - 1)))]; }
  function startRoomPlay() {
    commitView();
    const L = E.build(GW, GW, world.terr, world.obj, world.base);
    const rd = roomData(...cur), [ox, oy] = origin(...cur);
    const gl = li => gidx(ox + li % RS, oy + ((li / RS) | 0));
    let start = -1, target = -1;
    if (play.from === "s" && rd.s >= 0) { start = gl(rd.s); target = rd.f >= 0 ? gl(rd.f) : -1; }
    else if (play.from === "f" && rd.f >= 0) { start = gl(rd.f); target = rd.s >= 0 ? gl(rd.s) : -1; }
    else {
      if (play.from !== "p") flash(`This room has no test ${play.from}, so play starts at the player start.`);
      play.from = "p"; start = world.start;
    }
    if (start < 0 || !E.WALK[L.eff[start]] || L.obj[start]) {
      start = -1;
      for (let y = 1; y < RS - 1 && start < 0; y++) for (let x = 1; x < RS - 1; x++) { const g = gidx(ox + x, oy + y); if (E.WALK[L.eff[g]] && !L.obj[g]) { start = g; break; } }
    }
    play.global = true; play.L = L; play.target = target; play.startCell = start; play.leftRoom = false; play.splashes = [];
    play.npc = NPCS(E, SP).create(L, () => play.obj, world.npcs.map(n => ({ type: n.type, x: n.g % GW, y: (n.g / GW) | 0 })),
      { onSplash: (cell, t0) => play.splashes.push({ cell, t0 }) });
    play.npc.setPlayer(start);
    const r = roomOfCell(start);
    if (r[0] !== cur[0] || r[1] !== cur[1]) { cur = r; loadView(); updateRoomLabel(); drawOverview(); }
    return start;
  }
  // keep the view on the room the player is in; the shared edge counts for the room you came from
  function followPlayer() {
    const gx = play.p % GW, gy = (play.p / GW) | 0, [ox, oy] = origin(...cur);
    let [rx, ry] = cur;
    if (gx < ox) rx--; else if (gx > ox + RS - 1) rx++;
    if (gy < oy) ry--; else if (gy > oy + RS - 1) ry++;
    if (rx !== cur[0] || ry !== cur[1]) { cur = [rx, ry]; play.leftRoom = true; loadView(); updateRoomLabel(); drawOverview(); }
  }
  function renderRoomPlay() {
    const L = play.L, [ox, oy] = origin(...cur);
    if (board.width !== RS * TS) { board.width = board.height = RS * TS; fit(); }
    bctx.clearRect(0, 0, board.width, board.height);
    const now = performance.now();
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) drawTile(bctx, L, gidx(ox + x, oy + y), x, y, now);
    drawSplashes(L, ox, oy, now);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) SP.reeds(bctx, L, gidx(ox + x, oy + y), x, y, "back");
    const a = play.anim, el = a ? now - a.t0 : 0, live = a && el < a.dur;
    const st = live ? E.animAt(L, a.data, el < a.first ? el / a.first : 1 + (el - a.first) / a.slide) : null;
    const skip = new Set(live ? a.data.ents.map(e => e.end) : []);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) { const g = gidx(ox + x, oy + y); if (play.obj[g]) SP.cell(bctx, play.obj, live ? a.prev : null, skip, g, x, y); }
    if (live) for (const e of st.ents) if (e.x > ox - 2 && e.y > oy - 2 && e.x < ox + RS + 1 && e.y < oy + RS + 1) drawObj(bctx, e.k, e.x - ox, e.y - oy);
    if (play.npc) play.npc.draw(bctx, now, ox, oy, RS);
    const [px, py] = live ? st.player : [play.p % GW, (play.p / GW) | 0];
    const walking = live && st.playerDir >= 0;
    SP.player(bctx, px - ox, py - oy, walking ? st.playerDir : play.facing, walking ? 1 + (Math.floor(now / 90) % 3) : 0, playerWet(L, play.obj, px, py));
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) SP.reeds(bctx, L, gidx(ox + x, oy + y), x, y, "front");
    if (play.npc) play.npc.draw(bctx, now, ox, oy, RS, "air");
  }

  // ---- switching between room and component mode ----
  function enterKind() {
    $("bench").classList.toggle("kind-room", kind === "room");
    $("bench").classList.toggle("kind-comp", kind === "comp");
    $("kindRoom").setAttribute("aria-selected", String(kind === "room"));
    $("kindComp").setAttribute("aria-selected", String(kind === "comp"));
    $("modeName").textContent = kind === "room" ? "Room designer" : "Component designer";
    $("board").setAttribute("aria-label", kind === "room" ? "Room editor" : "Component editor");
    history = []; hover = -1;
    if (tool === "stamp" || (kind === "comp" && (tool === "p" || tool === "e" || tool === "g" || tool === "d"))) tool = "w";
    if (kind === "room") { loadView(); updateRoomLabel(); drawOverview(); refreshCompPick(); }
    else { ed = compEd; syncInputs(); }
    buildTools(); setTool(tool); fit(); render(); updateStatus();
    if (kind === "room") markUnchecked(); else scheduleSolve();
    saveStore(KIND_KEY, kind);
  }
  function setKind(k) {
    if (k === kind) return;
    if (mode === "play") setMode("edit");
    if (kind === "room") { commitView(); saveWorld(); } else { compEd = ed; saveStore(DRAFT_KEY, ed); }
    kind = k; enterKind();
  }
  $("kindRoom").addEventListener("click", () => setKind("room"));
  $("kindComp").addEventListener("click", () => setKind("comp"));

  // ---- world file (data/world.js) ----
  // The game plays WORLD_DATA from data/world.js. The designer starts from it when nothing is saved in this
  // browser, and "Copy world" / "Download world.js" produce a complete replacement for that file.
  function worldData() {
    commitView();
    const { map, under } = toMap({ W: GW, H: GW, terr: world.terr, obj: world.obj, base: world.base });
    const tests = {};
    for (const [k, rd] of Object.entries(world.rooms)) {
      const [rx, ry] = k.split(",").map(Number), [ox, oy] = origin(rx, ry), t = {};
      if (rd.s >= 0) t.s = [ox + rd.s % RS, oy + ((rd.s / RS) | 0)];
      if (rd.f >= 0) t.f = [ox + rd.f % RS, oy + ((rd.f / RS) | 0)];
      if (t.s || t.f) tests[k] = t;
    }
    const st = world.start >= 0 ? [world.start % GW, (world.start / GW) | 0] : null;
    return `{\n  "version": 1,\n  "rooms": ${RN},\n  "roomSize": ${RS},\n  "start": ${JSON.stringify(st)},\n  "map": [\n${map.map(l => "    " + JSON.stringify(l)).join(",\n")}\n  ],\n  "under": ${JSON.stringify(under)},\n  "tests": ${JSON.stringify(tests)},\n  "npcs": ${JSON.stringify(world.npcs.map(n => ({ type: n.type, x: n.g % GW, y: (n.g / GW) | 0 })))}\n}`;
  }
  const worldFile = () => (saveWorld(), `// The world played by the game (index.html). The designer (designer.html) also starts from it\n// when nothing is saved in the browser. Replace this whole file with the designer's "Copy world"\n// or "Download world.js" to update the game.\nconst WORLD_DATA = ${worldData()};\n`);
  // WORLD_DATA-style object -> editor world
  function worldFromData(w) {
    if (!w || !Array.isArray(w.map) || w.map.length !== GW || w.map.some(l => [...l].length !== GW)) throw new Error("size");
    const m = fromMap(w.map, w.under || {});
    const nw = { terr: m.terr, obj: m.obj, base: m.base, npcs: (w.npcs || []).map(n => ({ type: n.type, g: gidx(n.x, n.y) })), start: w.start ? gidx(w.start[0], w.start[1]) : -1, rooms: {} };
    for (const [k, t] of Object.entries(w.tests || {})) {
      const [rx, ry] = k.split(",").map(Number), [ox, oy] = origin(rx, ry);
      nw.rooms[k] = { s: t.s ? (t.s[1] - oy) * RS + (t.s[0] - ox) : -1, f: t.f ? (t.f[1] - oy) * RS + (t.f[0] - ox) : -1, found: null };
    }
    return nw;
  }
  function useWorld(nw, msg) {
    world = nw; history = []; loadView(); updateRoomLabel(); drawOverview(); markUnchecked(); render(); saveWorld();
    $("worldMsg").textContent = msg;
  }
  $("copyWorld").addEventListener("click", () => copyText(worldFile(), $("copyWorld")));
  $("downloadWorld").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([worldFile()], { type: "text/javascript" }));
    a.download = "world.js"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("reloadWorld").addEventListener("click", () => {
    try { useWorld(worldFromData(typeof WORLD_DATA !== "undefined" ? WORLD_DATA : null), "Loaded data/world.js"); }
    catch (e) { $("worldMsg").textContent = "data/world.js is missing or not a 96×96 world."; }
  });
  $("loadWorld").addEventListener("click", () => {
    try {
      const txt = $("worldText").value, a = txt.indexOf("{"), b = txt.lastIndexOf("}");
      useWorld(worldFromData(JSON.parse(txt.slice(a, b + 1))), "World loaded");
    } catch (e) {
      $("worldMsg").textContent = e.message === "size" ? `A world is ${GW}×${GW} tiles.` : "Couldn't read that. Paste a copied world.";
    }
  });

  // ---------- boot ----------
  function fileWorld() { try { return typeof WORLD_DATA !== "undefined" ? worldFromData(WORLD_DATA) : null; } catch (e) { return null; } }
  function start() {
    const draft = loadStore(DRAFT_KEY);
    compEd = draft && draft.terr ? Object.assign({ theme: "warehouse" }, draft) : fromMap(["wwsww", "w___w", "w_c_w", "wcc_w", "w__ww", "wwfww"], {}, "Three crates");
    library = loadStore(LIB_KEY) || [];
    world = loadWorld() || fileWorld() || defaultWorld();
    if (world._cur) { cur = world._cur; delete world._cur; }
    renderLib();
    kind = loadStore(KIND_KEY) === "comp" ? "comp" : "room";
    enterKind();
    SP.onReady(() => { buildTools(); render(); drawOverview(); });
    requestAnimationFrame(loop);
  }
  start();
})();
