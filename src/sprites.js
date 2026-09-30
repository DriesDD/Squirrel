// Sprite renderer for Squirrel.
// All graphics come from sprites/spritesheet.png: 128x128 pixels = 16x16 slots of 8x8 sprites.
// Edit that PNG in any pixel editor at 1:1 and refresh the page; nothing else needs to change
// unless you move a sprite to another slot or add a new one (then update SPRITE_MAP below).
// Sprites named base0, base1, ... are random variants of one sprite (e.g. floor0-floor7):
// add another numbered entry here and it is picked up automatically.
const SPRITE_SHEET = "sprites/spritesheet.png";
const SPRITE_MAP = {   // name: [column, row] of the 8x8 slot
  // row 0
  floor0: [0, 0], floor1: [1, 0], floor2: [2, 0], floor3: [3, 0], floor4: [4, 0], floor5: [5, 0], floor6: [6, 0], floor7: [7, 0], wall0: [8, 0], wall1: [9, 0], wall2: [10, 0], wall3: [11, 0], wall4: [12, 0], wall5: [13, 0], wall6: [14, 0], wall7: [15, 0],
  // row 1
  wallface0: [0, 1], wallface1: [1, 1], wallface2: [2, 1], wallface3: [3, 1], wallface4: [4, 1], wallface5: [5, 1], wallface6: [6, 1], wallface7: [7, 1], ice0: [8, 1], ice1: [9, 1], ice2: [10, 1], ice3: [11, 1], snow0: [12, 1], snow1: [13, 1], snow2: [14, 1], snow3: [15, 1],
  // row 2
  gap0: [0, 2], gap1: [1, 2], gap2: [2, 2], gap3: [3, 2], gap4: [4, 2], gap5: [5, 2], gap6: [6, 2], gap7: [7, 2], gap8: [8, 2], gap9: [9, 2], gap10: [10, 2], gap11: [11, 2], gap12: [12, 2], gap13: [13, 2], gap14: [14, 2], gap15: [15, 2],
  // row 3
  rail_h: [0, 3], rail_v: [1, 3], rail_x: [2, 3], rail_n: [3, 3], rail_e: [4, 3], rail_s: [5, 3], rail_w: [6, 3], door_h: [7, 3], door_v: [8, 3], crate: [9, 3], port_s: [10, 3], port_f: [11, 3],
  // row 4
  ball1: [0, 4], ball2: [1, 4], ball3: [2, 4], ball4: [3, 4], snowwall: [4, 4], exit0: [7, 4], exit1: [8, 4],
  // row 5
  sq_down0: [0, 5], sq_down1: [1, 5], sq_down2: [2, 5], sq_down3: [3, 5],
  // row 6
  sq_side0: [0, 6], sq_side1: [1, 6], sq_side2: [2, 6], sq_side3: [3, 6],
  // row 7
  sq_up0: [0, 7], sq_up1: [1, 7], sq_up2: [2, 7], sq_up3: [3, 7],
  // row 8: water animation frames, splash ripple frames, lily pads
  water0: [0, 8], water1: [1, 8], water2: [2, 8], water3: [3, 8], splash0: [4, 8], splash1: [5, 8], splash2: [6, 8], splash3: [7, 8], lilypad0: [8, 8], lilypad1: [9, 8], lilyleaves0: [10, 8], lilyleaves1: [11, 8], lilyflower: [12, 8],
  // row 9: reeds, frog (facing right; left is mirrored): jump frames sit/crouch/air/land, swim frames
  reeds0: [0, 9], reeds1: [1, 9], reeds2: [2, 9], reeds3: [3, 9], frog_jump0: [4, 9], frog_jump1: [5, 9], frog_jump2: [6, 9], frog_jump3: [7, 9], frog_swim0: [8, 9], frog_swim1: [9, 9], frog_swim2: [10, 9], frog_swim3: [11, 9],
  // row 10: second water animation; dragonfly perched and flying, one sprite per direction (0 up, 1 right, 2 down, 3 left)
  waterB0: [0, 10], waterB1: [1, 10], waterB2: [2, 10], waterB3: [3, 10],
  dragonfly_sit0: [4, 10], dragonfly_sit1: [5, 10], dragonfly_sit2: [6, 10], dragonfly_sit3: [7, 10],
  dragonfly_fly0: [8, 10], dragonfly_fly1: [9, 10], dragonfly_fly2: [10, 10], dragonfly_fly3: [11, 10],
};
const WATER_SETS = ["water", "waterB"];   // water animations; each water tile uses one, possibly mirrored
const WATER_FRAME_MS = 320;   // water animation speed
const SPLASH_FRAME_MS = 90;   // splash ripple speed (4 frames)
function SPRITES() {
  const img = new Image();
  let ready = false;
  const listeners = [];
  img.onload = () => { ready = true; listeners.forEach(f => f()); };
  img.src = SPRITE_SHEET;
  const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const variantCount = {};
  for (const name in SPRITE_MAP) { const m = name.match(/^(.*?)(\d+)$/); if (m) variantCount[m[1]] = Math.max(variantCount[m[1]] || 0, +m[2] + 1); }
  // Mostly variant 0, the others now and then, so large areas look even with small random differences.
  // salt picks a different (but still fixed) choice for the same tile
  function variant(base, x, y, salt = 0) {
    const n = variantCount[base] || 1, h = hash(x, y, base.length + salt * 31);
    if (n === 1 || (h % 100) < 45) return base + "0";
    return base + (1 + ((h >>> 8) % (n - 1)));
  }
  function draw(ctx, name, x, y, flip) {
    const s = SPRITE_MAP[name];
    if (!s || !ready) return;
    x = Math.round(x); y = Math.round(y);
    if (flip) { ctx.save(); ctx.translate(x + 8, y); ctx.scale(-1, 1); ctx.drawImage(img, s[0] * 8, s[1] * 8, 8, 8, 0, 0, 8, 8); ctx.restore(); }
    else ctx.drawImage(img, s[0] * 8, s[1] * 8, 8, 8, x, y, 8, 8);
  }
  // a sprite turned by quarter turns (rot 0-3) and optionally mirrored, e.g. lily leaves
  function drawTurned(ctx, name, x, y, rot, flip) {
    const s = SPRITE_MAP[name];
    if (!s || !ready) return;
    ctx.save(); ctx.translate(Math.round(x) + 4, Math.round(y) + 4); ctx.rotate(rot * Math.PI / 2); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, s[0] * 8, s[1] * 8, 8, 8, -4, -4, 8, 8); ctx.restore();
  }
  // Part or all of a sprite under water: rows from `cut` down are tinted dark and see-through.
  // cut = 4 for "half submerged", 0 for fully under (diving). lower shifts the sprite down in pixels.
  const tmp = document.createElement("canvas"); tmp.width = tmp.height = 8;
  const tctx = tmp.getContext("2d");
  function drawSubmerged(ctx, name, x, y, flip, cut, lower) {
    const s = SPRITE_MAP[name];
    if (!s || !ready) return;
    tctx.clearRect(0, 0, 8, 8);
    tctx.globalCompositeOperation = "source-over";
    if (flip) { tctx.save(); tctx.translate(8, 0); tctx.scale(-1, 1); tctx.drawImage(img, s[0] * 8, s[1] * 8, 8, 8, 0, 0, 8, 8); tctx.restore(); }
    else tctx.drawImage(img, s[0] * 8, s[1] * 8, 8, 8, 0, 0, 8, 8);
    tctx.globalCompositeOperation = "source-atop";
    tctx.fillStyle = "rgba(14, 44, 64, 0.72)"; tctx.fillRect(0, cut, 8, 8 - cut);
    tctx.globalCompositeOperation = "source-over";
    x = Math.round(x); y = Math.round(y) + (lower || 0);
    if (cut > 0) ctx.drawImage(tmp, 0, 0, 8, cut, x, y, 8, cut);
    ctx.save(); ctx.globalAlpha *= 0.6; ctx.drawImage(tmp, 0, cut, 8, 8 - cut, x, y + cut, 8, 8 - cut); ctx.restore();
  }

  // The tile under an overlay (lily pads, reeds), or the tile itself.
  const baseOf = (L, i) => { const t = L.terr[i], b = OVERLAY_BASE[t]; return b ? ((L.base && L.base[i]) || b) : t; };
  // Water tiles animate, so they are drawn every frame (pass opts.now); the static pass skips them.
  const isAnimated = (L, i) => L.terr[i] !== "w" && L.terr[i] !== "o" && baseOf(L, i) === WATER;
  const OVERLAY_BASE = { ";": "_", "@": "≈", "%": "≈", "&": "≈" }, WATER = "≈";

  // Terrain tile of level L at cell i, drawn at grid position (x, y).
  // opts.gapMask: open sides of a gapped wall (1 N, 2 E, 4 S, 8 W); opts.ports: show test s/f letters;
  // opts.now: time in ms, needed to draw water (without it water tiles are skipped)
  function tile(ctx, L, i, x, y, opts = {}) {
    const t = L.terr[i], X = x * 8, Y = y * 8, flip = (hash(x, y, 7) & 1) === 1;
    if (t === "w") {
      const below = i + L.W < L.N ? L.terr[i + L.W] : "w";
      draw(ctx, variant(below === "w" || below === "o" ? "wall" : "wallface", x, y), X, Y, flip);
      return;
    }
    if (t === "o") {
      const m = opts.gapMask ?? 0;
      draw(ctx, "gap" + m, X, Y);
      if (L.hAx[i] && (m & 8)) draw(ctx, "rail_w", X, Y);
      if (L.hAx[i] && (m & 2)) draw(ctx, "rail_e", X, Y);
      if (L.vAx[i] && (m & 1)) draw(ctx, "rail_n", X, Y);
      if (L.vAx[i] && (m & 4)) draw(ctx, "rail_s", X, Y);
      return;
    }
    const b = baseOf(L, i);
    if (b === WATER) {
      if (opts.now === undefined) return;
      const set = WATER_SETS[hash(x, y, 11) % WATER_SETS.length];
      draw(ctx, set + (Math.floor(opts.now / WATER_FRAME_MS) % 4), X, Y, (hash(x, y, 13) & 1) === 1);
    } else {
      draw(ctx, variant(b === "e" ? "exit" : L.ice[i] ? "ice" : "floor", x, y), X, Y, flip);
      if (L.hAx[i] && L.vAx[i]) draw(ctx, "rail_x", X, Y);
      else if (L.hAx[i]) draw(ctx, "rail_h", X, Y);
      else if (L.vAx[i]) draw(ctx, "rail_v", X, Y);
    }
    if (t === "@") draw(ctx, variant("lilypad", x, y), X, Y, flip);
    else if (t === "%") drawTurned(ctx, variant("lilyleaves", x, y), X, Y, hash(x, y, 3) & 3, flip);
    else if (t === "&") draw(ctx, "lilyflower", X, Y, flip);
    if (opts.ports && (t === "s" || t === "f")) draw(ctx, "port_" + t, X, Y);
  }
  // Reeds are drawn twice: shifted up behind whatever is on the tile, shifted down in front of it,
  // so anything standing in them is half hidden. layer is "back" or "front".
  function reeds(ctx, L, i, x, y, layer) {
    if (L.terr[i] !== ";") return;
    const back = layer === "back";   // the two copies use independently chosen variants
    draw(ctx, variant("reeds", x, y, back ? 0 : 1), x * 8, y * 8 + (back ? -3 : 2), (hash(x, y, back ? 5 : 6) & 1) === 1);
  }
  // splash ripple that started `ms` milliseconds ago; returns false once it has finished
  function splash(ctx, fx, fy, ms) {
    const f = Math.floor(ms / SPLASH_FRAME_MS);
    if (f < 0 || f > 3) return f < 0;
    draw(ctx, "splash" + f, fx * 8, fy * 8);
    return true;
  }
  // Object code k (see engine.js) at tile position (fx, fy), fractional while animating.
  // Code 16 (SUNK) is a crate sunk in water, drawn half under; 16 + k is object k standing on a sunk crate.
  const OBJ = { 1: "crate", 2: "door_h", 3: "door_v", 5: "ball1", 6: "ball2", 7: "ball3", 8: "ball4", 9: "snowwall" };
  const SUNK = 16, SUNK_CUT = 4, SUNK_LOWER = 1;   // sunk crate: rows from SUNK_CUT down are under water, SUNK_LOWER px lower
  function obj(ctx, k, fx, fy) {
    if (k & SUNK) { drawSubmerged(ctx, "crate", fx * 8, fy * 8, false, SUNK_CUT, SUNK_LOWER); k &= 15; if (!k) return; }
    if (k === 4) { const x = Math.round(fx), y = Math.round(fy); draw(ctx, variant("snow", x, y), fx * 8, fy * 8, (hash(x, y, 7) & 1) === 1); return; }
    draw(ctx, OBJ[k], fx * 8, fy * 8);
  }
  // Objects of one cell while a move animates: sunk crates as they were before the move (prev), the piece on
  // top from the current state unless it is moving (skip holds the cells of moving pieces, drawn separately).
  function cell(ctx, cur, prev, skip, g, x, y) {
    if ((prev || cur)[g] & SUNK) obj(ctx, SUNK, x, y);
    const k = cur[g] & 15;
    if (k && !(skip && skip.has(g))) obj(ctx, k, x, y);
  }
  // Squirrel: dir 0 up, 1 right, 2 down, 3 left (right mirrored); frame 0 standing, 1-3 running.
  // inWater: half submerged (bottom half tinted, 1 px lower).
  function player(ctx, fx, fy, dir, frame, inWater) {
    const name = (dir === 0 ? "sq_up" : dir === 2 ? "sq_down" : "sq_side") + frame;
    if (inWater) drawSubmerged(ctx, name, fx * 8, fy * 8, dir === 3, 4, 1);
    else draw(ctx, name, fx * 8, fy * 8, dir === 3);
  }
  return { draw, drawSubmerged, drawTurned, tile, reeds, splash, isAnimated, obj, cell, player, variant, onReady(f) { listeners.push(f); if (ready) f(); } };
}
