(() => {
  const E = ENGINE(), CP = COMPONENTS(E), WD = WORLD(), RG = ROOMGEN(E, CP, WD.T);
  const LIB = LIBRARY.map(CP.prepare);
  const { N, T } = WD;
  const DX = E.DX, DY = E.DY;
  const PX = 8;                     // one 8x8 sprite per tile; the canvas is scaled up with crisp pixels
  const SP = SPRITES();
  const COLS = "ABCDE";
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = {};
  ["ground", "floor", "line", "wall", "gate", "exit", "player", "muted", "crate", "door", "rail", "ice", "ice-line", "snow"].forEach(k => C[k] = css("--" + k));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);

  const canvas = $("room"), ctx = canvas.getContext("2d");
  const mini = $("minimap"), mctx = mini.getContext("2d");
  canvas.width = canvas.height = T * PX;

  let world, S, room, obj, hist = [], anim = null, busyUntil = 0;
  let fade = 0, fadeFrom = null, facing = 2, lastStepAt = 0;
  const cache = new Map();
  const SAVE_VERSION = 3;   // bump whenever room layout or size rules change; older saves are discarded

  // ---------- rooms ----------
  function getRoom(x, y) {
    const key = x + "," + y;
    if (cache.has(key)) return cache.get(key);
    const gates = WD.roomGates(world, x, y);
    const gen = RG.generateRoom({
      rng: WD.rngFrom(`${world.seed}|roomgen|${x},${y}`), gates,
      isStart: x === world.start.x && y === world.start.y, lib: LIB,
    });
    const L = E.build(T, T, gen.terr, gen.obj);
    const gateCode = new Uint8Array(T * T);
    for (const g of gates) for (let j = g.offset; j < g.offset + WD.GATE; j++) {
      const i = g.side === "N" ? j : g.side === "S" ? (T - 1) * T + j : g.side === "W" ? j * T : j * T + T - 1;
      gateCode[i] = g.exit ? 3 : 2;
    }
    // gapped walls only open toward their own component
    const gapMask = new Uint8Array(T * T);
    for (const c of gen.comps) for (let yy = c.y0; yy < c.y0 + c.H; yy++) for (let xx = c.x0; xx < c.x0 + c.W; xx++) {
      const i = yy * T + xx; if (L.terr[i] !== "o") continue;
      for (let d = 0; d < 4; d++) {
        const nx = xx + DX[d], ny = yy + DY[d];
        if (nx < c.x0 || ny < c.y0 || nx >= c.x0 + c.W || ny >= c.y0 + c.H) continue;
        if (L.terr[ny * T + nx] !== "w") gapMask[i] |= 1 << d;
      }
    }
    const r = { x, y, key, gates, gen, L, gateCode, gapMask, roomSeed: WD.hashString(`${world.seed}|room|${x},${y}`) };
    r.bg = drawStatic(r);
    cache.set(key, r);
    return r;
  }
  const encode = o => Array.from(o).join("");
  const decode = s => Uint8Array.from(s, ch => +ch);
  const validSave = s => s && s.v === SAVE_VERSION && s.T === T && s.rooms && typeof s.rooms === "object";

  function enterRoom(x, y) {
    room = getRoom(x, y);
    const saved = S.rooms[room.key];
    obj = saved && saved.length === T * T ? decode(saved) : room.L.obj.slice();
    if (saved && saved.length !== T * T) delete S.rooms[room.key];
    hist = []; anim = null;
  }

  // ---------- drawing ----------
  function drawStatic(r) {
    const c = document.createElement("canvas"); c.width = c.height = T * PX;
    const g = c.getContext("2d"), L = r.L;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = y * T + x;
      SP.tile(g, L, i, x, y, { gapMask: r.gapMask[i], gate: r.gateCode[i] });
    }
    return c;
  }
  const drawObj = (k, fx, fy) => SP.obj(ctx, k, fx, fy);
  const lerp = (a, b, k) => a + (b - a) * k;
  function draw(now) {
    ctx.drawImage(room.bg, 0, 0);
    const el = anim ? now - anim.t0 : 0;
    const live = anim && el < anim.dur;
    const st = live ? E.animAt(room.L, anim.data, el < anim.first ? el / anim.first : 1 + (el - anim.first) / anim.slide) : null;
    const skip = new Set(live ? anim.data.ents.map(e => e.end) : []);
    for (let i = 0; i < obj.length; i++) {
      if (!obj[i] || skip.has(i)) continue;
      drawObj(obj[i], i % T, (i / T) | 0);
    }
    if (live) for (const e of st.ents) drawObj(e.k, e.x, e.y);
    const [px, py] = live ? st.player : [S.px, S.py];
    const moving = live || (held >= 0 && now - lastStepAt < 160);
    SP.player(ctx, px, py, facing, moving ? 1 + (Math.floor(now / 90) % 3) : 0);
    if (fade > 0 && fadeFrom) { ctx.globalAlpha = fade; ctx.drawImage(fadeFrom, 0, 0); ctx.globalAlpha = 1; }
  }
  function snapshotCanvas() {
    if (reduceMotion) return null;
    const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
    c.getContext("2d").drawImage(canvas, 0, 0); return c;
  }

  // ---------- game flow ----------
  function randomSeed() {
    const words = ["ash","brine","cinder","dusk","ember","flint","gale","heron","iris","juniper","kiln","loam","moss","nettle","onyx","pike","quill","rust","slate","thorn","umber","vale","wren","yarrow"];
    return words[Math.floor(Math.random() * words.length)] + Math.floor(Math.random() * 1000);
  }
  const cleanSeed = s => (s || "").replace(/[^A-Za-z0-9._~-]/g, "").slice(0, 24);

  function newGame(seed, saved) {
    seed = cleanSeed(seed) || randomSeed();
    world = WD.generateWorld(seed);
    cache.clear();
    if (validSave(saved) && saved.seed === seed) S = saved;
    else {
      const startRoom = getRoom(world.start.x, world.start.y);
      const [sx, sy] = startRoom.gen.start || [T >> 1, T >> 1];
      S = { v: SAVE_VERSION, T, seed, rx: world.start.x, ry: world.start.y, px: sx, py: sy, entry: [sx, sy],
        visited: [world.start.x + "," + world.start.y], steps: 0, t0: Date.now(), elapsed: 0, won: false, rooms: {} };
    }
    enterRoom(S.rx, S.ry);
    $("seed").value = seed;
    try { history.replaceState(null, "", "#" + seed); } catch (e) {}
    $("win").hidden = !S.won;
    if (S.won) showWin();
    updateUI(); drawMini();
  }

  function move(d) {
    if (S.won || performance.now() < busyUntil) return false;
    facing = d; lastStepAt = performance.now();
    const nx = S.px + DX[d], ny = S.py + DY[d];
    if (nx < 0 || ny < 0 || nx >= T || ny >= T) {
      const gc = room.gateCode[S.py * T + S.px];
      if (gc === 3) { escape(); return true; }
      if (gc !== 2) return false;
      fadeFrom = snapshotCanvas();
      S.rx += DX[d]; S.ry += DY[d];
      if (DX[d]) S.px = DX[d] > 0 ? 0 : T - 1;
      if (DY[d]) S.py = DY[d] > 0 ? 0 : T - 1;
      S.entry = [S.px, S.py];
      enterRoom(S.rx, S.ry);
      const key = S.rx + "," + S.ry;
      if (!S.visited.includes(key)) S.visited.push(key);
      S.steps++;
      fade = reduceMotion ? 0 : 1;
      updateUI(); drawMini();
      return true;
    }
    const p = S.py * T + S.px;
    const r = E.step(room.L, p, obj, d);
    if (!r) return false;
    if (r.changed) { hist.push({ px: S.px, py: S.py, obj }); if (hist.length > 300) hist.shift(); }
    const first = r.crates >= 5 ? 620 : r.crates === 4 ? 300 : 70, slide = 50;
    const dur = first + Math.max(0, r.anim.T - 1) * slide;
    anim = reduceMotion ? null : { data: r.anim, t0: performance.now(), dur, first, slide };
    busyUntil = performance.now() + (reduceMotion ? (r.crates >= 4 ? dur : 60) : dur);
    obj = r.obj;
    S.px = r.p % T; S.py = (r.p / T) | 0; S.steps++;
    if (r.changed) S.rooms[room.key] = encode(obj);
    updateUI();
    return true;
  }
  function undo() {
    const h = hist.pop(); if (!h || S.won) return;
    obj = h.obj; S.px = h.px; S.py = h.py; anim = null; busyUntil = 0;
    S.rooms[room.key] = encode(obj);
    updateUI();
  }
  function resetRoom() {
    if (S.won) return;
    obj = room.L.obj.slice(); delete S.rooms[room.key];
    [S.px, S.py] = S.entry; hist = []; anim = null; busyUntil = 0;
    updateUI();
  }
  function escape() {
    S.steps++; S.won = true; S.elapsed = Date.now() - S.t0;
    showWin(); updateUI(); drawMini();
  }
  function showWin() {
    $("winStats").textContent = `${S.steps} steps · ${fmtTime(S.elapsed)} · ${S.visited.length} of ${N * N} rooms`;
    $("win").hidden = false;
    $("winNew").focus();
  }

  // ---------- input ----------
  const KEYDIR = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  const BTNDIR = { up: 0, right: 1, down: 2, left: 3 };
  let held = -1, nextRepeat = 0;
  function press(d) { held = d; move(d); nextRepeat = performance.now() + 170; }
  addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" && e.target.type === "text") return;
    if (e.key in KEYDIR) { e.preventDefault(); if (!e.repeat) press(KEYDIR[e.key]); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "z" || e.key === "Z") { e.preventDefault(); undo(); }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); resetRoom(); }
  });
  addEventListener("keyup", e => { if (KEYDIR[e.key] === held) held = -1; });
  addEventListener("blur", () => { held = -1; });
  document.querySelectorAll(".dpad button").forEach(b => {
    const d = BTNDIR[b.dataset.dir];
    b.addEventListener("pointerdown", e => { e.preventDefault(); press(d); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, () => { if (held === d) held = -1; }));
  });

  // ---------- minimap ----------
  function drawMini() {
    const w = mini.width, pad = 10, cs = (w - pad * 2) / N, reveal = $("reveal").checked;
    const known = (x, y) => reveal || S.visited.includes(x + "," + y);
    mctx.clearRect(0, 0, w, w);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = pad + x * cs, Y = pad + y * cs, g = 5;
      mctx.strokeStyle = C.line; mctx.lineWidth = 1;
      if (known(x, y)) { mctx.fillStyle = C.floor; mctx.fillRect(X + g, Y + g, cs - 2 * g, cs - 2 * g); }
      mctx.strokeRect(X + g + .5, Y + g + .5, cs - 2 * g - 1, cs - 2 * g - 1);
    }
    mctx.lineCap = "round"; mctx.lineWidth = 3;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!known(x, y)) continue;
      const cell = world.cells[y][x];
      const cx = pad + x * cs + cs / 2, cy = pad + y * cs + cs / 2;
      const sides = Object.keys(cell.open);
      if (cell.exit) sides.push(cell.exit);
      for (const d of sides) {
        const isExit = d === cell.exit, len = isExit ? cs / 2 + pad - 2 : cs / 2;
        mctx.strokeStyle = isExit ? C.exit : C.gate;
        mctx.beginPath(); mctx.moveTo(cx, cy);
        mctx.lineTo(cx + WD.DIRS[d].dx * len, cy + WD.DIRS[d].dy * len); mctx.stroke();
      }
      mctx.fillStyle = C.gate;
      mctx.beginPath(); mctx.arc(cx, cy, 3.5, 0, Math.PI * 2); mctx.fill();
      if (x === world.start.x && y === world.start.y) {
        mctx.fillStyle = C.muted; mctx.font = "500 9px 'IBM Plex Mono', monospace";
        mctx.textAlign = "left"; mctx.textBaseline = "top";
        mctx.fillText("S", pad + x * cs + 9, pad + y * cs + 8);
      }
    }
    mctx.strokeStyle = C.player; mctx.lineWidth = 2;
    mctx.strokeRect(pad + S.rx * cs + 4, pad + S.ry * cs + 4, cs - 8, cs - 8);
  }

  // ---------- UI ----------
  function fmtTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function updateUI() {
    const isStart = S.rx === world.start.x && S.ry === world.start.y;
    $("coord").firstChild.nodeValue = COLS[S.rx] + (S.ry + 1);
    $("coordNote").textContent = isStart ? "start" : `${world.dist[S.ry][S.rx]} rooms from start`;
    $("roomSeed").textContent = room.roomSeed.toString(16).padStart(8, "0");
    $("gates").textContent = room.gates.map(g => g.exit ? g.side + "*" : g.side).join(" ");
    $("pos").textContent = `${S.px}, ${S.py}`;
    $("visited").textContent = `${S.visited.length} / ${N * N}`;
    $("steps").textContent = S.steps;
    const ul = $("puzzles");
    ul.innerHTML = "";
    $("puzzleBox").hidden = !$("reveal").checked;
    for (const c of room.gen.comps) {
      const li = document.createElement("li");
      li.append(Object.assign(document.createElement("span"), { textContent: c.name }),
        Object.assign(document.createElement("span"), { className: "tag", textContent: c.maze ? "maze" : c.dir === "both" ? "two-way" : "one-way" }));
      ul.append(li);
    }
    if (!room.gen.comps.length) ul.innerHTML = `<li class="none">No puzzles in this room</li>`;
    $("undoBtn").disabled = !hist.length;
  }

  let last = performance.now();
  function frame(now) {
    const dt = now - last; last = now;
    if (held >= 0 && now >= nextRepeat && now >= busyUntil) { move(held); nextRepeat = now + 20; }
    if (fade > 0) { fade = Math.max(0, fade - dt / 180); if (fade === 0) fadeFrom = null; }
    if (anim && now - anim.t0 > anim.dur) anim = null;
    draw(now);
    $("time").textContent = fmtTime(S.won ? S.elapsed : Date.now() - S.t0);
    requestAnimationFrame(frame);
  }

  $("seedForm").addEventListener("submit", e => { e.preventDefault(); newGame($("seed").value); $("seed").blur(); });
  $("newSeed").addEventListener("click", () => newGame(randomSeed()));
  $("restart").addEventListener("click", () => newGame(S.seed));
  $("winNew").addEventListener("click", () => newGame(randomSeed()));
  $("winAgain").addEventListener("click", () => newGame(S.seed));
  $("reveal").addEventListener("change", () => { drawMini(); updateUI(); });
  $("undoBtn").addEventListener("click", undo);
  $("resetBtn").addEventListener("click", resetRoom);

  // legend icons drawn from the spritesheet
  const LEGEND = { crate: ["floor0", "crate"], door: ["floor0", "rail_h", "door_h"], gap: ["gap10", "rail_w", "rail_e"], ice: ["ice0"], snow: ["snow0"], ball: ["floor0", "ball3"] };
  function drawLegend() {
    document.querySelectorAll("canvas[data-piece]").forEach(cv => {
      const g = cv.getContext("2d"); g.clearRect(0, 0, 8, 8);
      for (const n of LEGEND[cv.dataset.piece] || []) SP.draw(g, n, 0, 0);
    });
  }

  // spritesheet: built-in, or one the player loads (kept in this browser)
  const SHEET_KEY = "tfr-spritesheet";
  SP.onReady(() => { for (const r of cache.values()) r.bg = drawStatic(r); drawLegend(); });
  try { const saved = localStorage.getItem(SHEET_KEY); if (saved) SP.setSheet(saved); } catch (e) {}
  $("sheetFile").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const test = new Image();
      test.onload = () => {
        if (test.width < 128 || test.height < 128) { $("sheetMsg").textContent = "The sheet must be at least 128×128 pixels."; return; }
        SP.setSheet(rd.result); $("sheetMsg").textContent = `Using ${f.name}`;
        try { localStorage.setItem(SHEET_KEY, rd.result); } catch (err) {}
      };
      test.onerror = () => { $("sheetMsg").textContent = "Couldn't read that image. Use a PNG."; };
      test.src = rd.result;
    };
    rd.readAsDataURL(f);
    e.target.value = "";
  });
  $("sheetReset").addEventListener("click", () => {
    SP.setSheet(SPRITE_SHEET_DEFAULT); $("sheetMsg").textContent = "Using the built-in sheet";
    try { localStorage.removeItem(SHEET_KEY); } catch (err) {}
  });

  function start(data) {
    const saved = data && data.S;
    newGame(saved ? saved.seed : cleanSeed(location.hash.slice(1)), saved);
    requestAnimationFrame(frame);
  }
  window.claude?.hot?.snapshot?.(() => ({ S }));
  window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
