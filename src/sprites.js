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
};
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
  function variant(base, x, y) {
    const n = variantCount[base] || 1, h = hash(x, y, base.length);
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
  // Terrain tile of level L at cell i, drawn at grid position (x, y).
  // opts.gapMask: open sides of a gapped wall (1 N, 2 E, 4 S, 8 W); opts.ports: show test s/f letters
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
    draw(ctx, variant(t === "e" ? "exit" : L.ice[i] ? "ice" : "floor", x, y), X, Y, flip);
    if (L.hAx[i] && L.vAx[i]) draw(ctx, "rail_x", X, Y);
    else if (L.hAx[i]) draw(ctx, "rail_h", X, Y);
    else if (L.vAx[i]) draw(ctx, "rail_v", X, Y);
    if (opts.ports && (t === "s" || t === "f")) draw(ctx, "port_" + t, X, Y);
  }
  // Object code k (see engine.js) at tile position (fx, fy), fractional while animating.
  const OBJ = { 1: "crate", 2: "door_h", 3: "door_v", 5: "ball1", 6: "ball2", 7: "ball3", 8: "ball4", 9: "snowwall" };
  function obj(ctx, k, fx, fy) {
    if (k === 4) { const x = Math.round(fx), y = Math.round(fy); draw(ctx, variant("snow", x, y), fx * 8, fy * 8, (hash(x, y, 7) & 1) === 1); return; }
    draw(ctx, OBJ[k], fx * 8, fy * 8);
  }
  // Squirrel: dir 0 up, 1 right, 2 down, 3 left (right mirrored); frame 0 standing, 1-3 running
  function player(ctx, fx, fy, dir, frame) {
    const base = dir === 0 ? "sq_up" : dir === 2 ? "sq_down" : "sq_side";
    draw(ctx, base + frame, fx * 8, fy * 8, dir === 3);
  }
  return { draw, tile, obj, player, variant, onReady(f) { listeners.push(f); if (ready) f(); } };
}
