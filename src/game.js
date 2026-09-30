// Squirrel: plays the hand-made world in data/world.js.
// The world is one grid of 5x5 rooms, 20x20 tiles each; neighbouring rooms share their outer row/column,
// so the grid is 5*19+1 = 96 tiles square. The game runs on that whole grid and shows one room at a time.
(() => {
  const E = ENGINE(), CP = COMPONENTS(E), SP = SPRITES();
  const RN = 5, RS = 20, GW = RN * (RS - 1) + 1, COLS = "ABCDE";
  const SAVE_KEY = "squirrel-save";
  const $ = id => document.getElementById(id);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = { line: css("--line"), accent: css("--accent"), player: css("--player"), panel: css("--panel") };

  // ---------- the world ----------
  const grid = CP.parse(WORLD_DATA);
  if (grid.W !== GW || grid.H !== GW) throw new Error(`data/world.js must be ${GW}×${GW} tiles`);
  const L = E.build(GW, GW, grid.terr, grid.obj);
  const INITIAL = L.obj;
  const gidx = (gx, gy) => gy * GW + gx;
  const origin = (rx, ry) => [rx * (RS - 1), ry * (RS - 1)];
  const roomKey = (rx, ry) => rx + "," + ry;
  const roomOf = g => [Math.min(RN - 1, Math.floor((g % GW) / (RS - 1))), Math.min(RN - 1, Math.floor(((g / GW) | 0) / (RS - 1)))];
  const START = WORLD_DATA.start ? gidx(WORLD_DATA.start[0], WORLD_DATA.start[1]) : gidx(2 * (RS - 1) + 10, 2 * (RS - 1) + 10);
  // saves only apply to the exact world they were made in
  const WORLD_ID = (() => { let h = 2166136261; const s = WORLD_DATA.map.join("") + JSON.stringify(WORLD_DATA.under || {}); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); })();
  // open sides of each gapped wall, for its sprite
  const GAP = new Uint8Array(GW * GW);
  for (let i = 0; i < GW * GW; i++) if (L.terr[i] === "o") for (let d = 0; d < 4; d++) { const n = E.nb(L, i, d); if (n >= 0 && L.terr[n] !== "w") GAP[i] |= 1 << d; }

  const encode = o => Array.from(o).join("");
  const decode = s => Uint8Array.from(s, ch => +ch);

  // ---------- state ----------
  let S, obj, hist = [], anim = null, busyUntil = 0, facing = 2, lastStepAt = 0, fade = 0, fadeFrom = null;
  function newGame() {
    const cur = roomOf(START);
    S = { id: WORLD_ID, p: START, cur, visited: [roomKey(...cur)], steps: 0, t0: Date.now(), elapsed: 0, won: false,
          entry: START, entryObj: encode(INITIAL), obj: encode(INITIAL) };
    obj = INITIAL.slice(); hist = []; anim = null;
    $("win").hidden = true;
    save(); updateUI(); drawMini();
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || s.id !== WORLD_ID || s.obj.length !== GW * GW) return false;
      S = s; obj = decode(s.obj); return true;
    } catch (e) { return false; }
  }
  let saveTimer = 0;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { S.obj = encode(obj); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }, 200); }

  // ---------- drawing ----------
  const canvas = $("room"), ctx = canvas.getContext("2d");
  canvas.width = canvas.height = RS * 8;
  const bgCache = new Map();
  function roomBackground(rx, ry) {
    const k = roomKey(rx, ry);
    if (bgCache.has(k)) return bgCache.get(k);
    const c = document.createElement("canvas"); c.width = c.height = RS * 8;
    const g = c.getContext("2d"), [ox, oy] = origin(rx, ry);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) { const i = gidx(ox + x, oy + y); SP.tile(g, L, i, x, y, { gapMask: GAP[i] }); }
    bgCache.set(k, c);
    return c;
  }
  function draw(now) {
    const [ox, oy] = origin(...S.cur);
    ctx.drawImage(roomBackground(...S.cur), 0, 0);
    const el = anim ? now - anim.t0 : 0, live = anim && el < anim.dur;
    const st = live ? E.animAt(L, anim.data, el < anim.first ? el / anim.first : 1 + (el - anim.first) / anim.slide) : null;
    const skip = new Set(live ? anim.data.ents.map(e => e.end) : []);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) { const g = gidx(ox + x, oy + y); if (obj[g] && !skip.has(g)) SP.obj(ctx, obj[g], x, y); }
    if (live) for (const e of st.ents) SP.obj(ctx, e.k, e.x - ox, e.y - oy);
    const [px, py] = live ? st.player : [S.p % GW, (S.p / GW) | 0];
    const moving = live || (held >= 0 && now - lastStepAt < 160);
    SP.player(ctx, px - ox, py - oy, facing, moving ? 1 + (Math.floor(now / 90) % 3) : 0);
    if (fade > 0 && fadeFrom) { ctx.globalAlpha = fade; ctx.drawImage(fadeFrom, 0, 0); ctx.globalAlpha = 1; }
  }

  // ---------- moving ----------
  function move(d) {
    if (S.won || performance.now() < busyUntil) return false;
    facing = d; lastStepAt = performance.now();
    const r = E.step(L, S.p, obj, d);
    if (!r) return false;
    if (r.changed) { hist.push({ p: S.p, obj }); if (hist.length > 300) hist.shift(); }
    const first = r.crates >= 5 ? 620 : r.crates === 4 ? 300 : 70, slide = 50;
    const dur = first + Math.max(0, r.anim.T - 1) * slide;
    anim = reduceMotion ? null : { data: r.anim, t0: performance.now(), dur, first, slide };
    busyUntil = performance.now() + (reduceMotion ? Math.min(dur, 300) : dur);
    obj = r.obj; S.p = r.p; S.steps++;
    followPlayer();
    if (L.terr[S.p] === "e") win();
    save(); updateUI();
    return true;
  }
  // Keep the view on the player's room. The shared edge row counts for the room you came from;
  // stepping past it switches to the neighbour.
  function followPlayer() {
    const gx = S.p % GW, gy = (S.p / GW) | 0, [ox, oy] = origin(...S.cur);
    let [rx, ry] = S.cur;
    if (gx < ox) rx--; else if (gx > ox + RS - 1) rx++;
    if (gy < oy) ry--; else if (gy > oy + RS - 1) ry++;
    if (rx === S.cur[0] && ry === S.cur[1]) return;
    if (!reduceMotion) { fadeFrom = document.createElement("canvas"); fadeFrom.width = fadeFrom.height = canvas.width; fadeFrom.getContext("2d").drawImage(canvas, 0, 0); fade = 1; }
    S.cur = [rx, ry];
    if (!S.visited.includes(roomKey(rx, ry))) S.visited.push(roomKey(rx, ry));
    S.entry = S.p; S.entryObj = encode(obj); hist = [];
    drawMini();
  }
  function undo() {
    const h = hist.pop(); if (!h || S.won) return;
    obj = h.obj; S.p = h.p; anim = null; busyUntil = 0; save(); updateUI();
  }
  // back to how things were when you walked into this room
  function resetRoom() {
    if (S.won) return;
    obj = decode(S.entryObj); S.p = S.entry; hist = []; anim = null; busyUntil = 0; save(); updateUI();
  }
  function win() {
    S.won = true; S.elapsed = Date.now() - S.t0;
    $("winStats").textContent = `${S.steps} steps · ${fmtTime(S.elapsed)} · ${S.visited.length} of ${RN * RN} rooms`;
    $("win").hidden = false; $("winAgain").focus();
  }

  // ---------- input ----------
  const KEYDIR = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  const BTNDIR = { up: 0, right: 1, down: 2, left: 3 };
  let held = -1, nextRepeat = 0;
  function press(d) { held = d; move(d); nextRepeat = performance.now() + 170; }
  addEventListener("keydown", e => {
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
  $("undoBtn").addEventListener("click", undo);
  $("resetBtn").addEventListener("click", resetRoom);
  $("restart").addEventListener("click", newGame);
  $("winAgain").addEventListener("click", newGame);
  $("reveal").addEventListener("change", drawMini);

  // ---------- map of visited rooms ----------
  const mini = $("minimap"), mctx = mini.getContext("2d");
  const MAPT = { w: "#7b5a3c", o: "#7b5a3c", "~": "#2d515c", h: "#2d515c", v: "#2d515c", x: "#2d515c", e: "#7fd18b" };
  const MAPO = { 1: "#c28b55", 2: "#9fb3c8", 3: "#9fb3c8", 4: "#dfe8eb", 5: "#ffffff", 6: "#ffffff", 7: "#ffffff", 8: "#ffffff", 9: "#e6eef0" };
  function drawMini() {
    const s = mini.width / GW, all = $("reveal").checked;
    mctx.fillStyle = C.panel; mctx.fillRect(0, 0, mini.width, mini.height);
    for (let ry = 0; ry < RN; ry++) for (let rx = 0; rx < RN; rx++) {
      const [ox, oy] = origin(rx, ry);
      if (all || S.visited.includes(roomKey(rx, ry))) {
        for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
          const g = gidx(ox + x, oy + y);
          mctx.fillStyle = MAPO[obj[g]] || MAPT[L.terr[g]] || "#3a2a1e";
          mctx.fillRect((ox + x) * s, (oy + y) * s, s, s);
        }
      } else { mctx.strokeStyle = C.line; mctx.strokeRect(ox * s + 1.5, oy * s + 1.5, (RS - 1) * s - 2, (RS - 1) * s - 2); }
    }
    const [ox, oy] = origin(...S.cur);
    mctx.strokeStyle = C.accent; mctx.lineWidth = 2; mctx.strokeRect(ox * s + 1, oy * s + 1, RS * s - 2, RS * s - 2); mctx.lineWidth = 1;
    mctx.fillStyle = C.player; mctx.fillRect((S.p % GW) * s - 1, ((S.p / GW) | 0) * s - 1, 4, 4);
  }

  // ---------- UI ----------
  function fmtTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function updateUI() {
    $("coord").textContent = COLS[S.cur[0]] + (S.cur[1] + 1);
    $("visited").textContent = `${S.visited.length} / ${RN * RN}`;
    $("steps").textContent = S.steps;
    $("undoBtn").disabled = !hist.length;
  }
  const LEGEND = { crate: ["floor0", "crate"], door: ["floor0", "rail_h", "door_h"], gap: ["gap10", "rail_w", "rail_e"], ice: ["ice0"], snow: ["snow0"], ball: ["floor0", "ball3"], exit: ["exit0"] };
  function drawLegend() {
    document.querySelectorAll("canvas[data-piece]").forEach(cv => {
      const g = cv.getContext("2d"); g.clearRect(0, 0, 8, 8);
      for (const n of LEGEND[cv.dataset.piece] || []) SP.draw(g, n, 0, 0);
    });
  }

  let last = performance.now();
  function frame(now) {
    const dt = now - last; last = now;
    if (held >= 0 && now >= nextRepeat && now >= busyUntil) { move(held); nextRepeat = now + 20; }
    if (fade > 0) { fade = Math.max(0, fade - dt / 180); if (fade === 0) fadeFrom = null; }
    if (anim && now - anim.t0 > anim.dur) { anim = null; drawMini(); }
    draw(now);
    $("time").textContent = fmtTime(S.won ? S.elapsed : Date.now() - S.t0);
    requestAnimationFrame(frame);
  }

  SP.onReady(() => { bgCache.clear(); drawLegend(); });
  if (load()) { if (S.won) win(); updateUI(); drawMini(); } else newGame();
  requestAnimationFrame(frame);
})();
