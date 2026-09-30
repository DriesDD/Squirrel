// 8x8 sprite renderer. The spritesheet is one PNG (128x128 = 16x16 slots of 8x8); SPRITE_MAP names each slot [col, row].
// Sprites named base0, base1, ... are random variants of one sprite (e.g. floor0-floor7); a tile picks one by position.
const SPRITE_SHEET_DEFAULT = "@@URI@@";
const SPRITE_MAP = @@MAP@@;
function SPRITES() {
  const img = new Image();
  let ready = false;
  const listeners = [];
  img.onload = () => { ready = true; listeners.forEach(f => f()); };
  function setSheet(src) { ready = false; img.src = src; }
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
  // Terrain tile at grid (x, y). opts: gapMask (bits 1 N, 2 E, 4 S, 8 W) for gapped walls, gate (2 gate, 3 exit), ports (show s/f letters)
  function tile(ctx, L, i, x, y, opts = {}) {
    const t = L.terr[i], X = x * 8, Y = y * 8, flip = (hash(x, y, 7) & 1) === 1;
    if (t === "w") {
      const below = y + 1 < L.H ? L.terr[i + L.W] : "w";
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
    if (opts.gate) draw(ctx, variant(opts.gate === 3 ? "exit" : "gate", x, y), X, Y, flip);
    else draw(ctx, variant(L.ice && L.ice[i] ? "ice" : "floor", x, y), X, Y, flip);
    if (L.hAx[i] && L.vAx[i]) draw(ctx, "rail_x", X, Y);
    else if (L.hAx[i]) draw(ctx, "rail_h", X, Y);
    else if (L.vAx[i]) draw(ctx, "rail_v", X, Y);
    if (opts.ports && (t === "s" || t === "f")) draw(ctx, "port_" + t, X, Y);
  }
  // Object code k at tile position (fx, fy), fractional while animating.
  const OBJ = { 1: "crate", 2: "door_h", 3: "door_v", 5: "ball1", 6: "ball2", 7: "ball3", 8: "ball4", 9: "snowwall" };
  function obj(ctx, k, fx, fy) {
    if (k === 4) { const x = Math.round(fx), y = Math.round(fy); draw(ctx, variant("snow", x, y), fx * 8, fy * 8, (hash(x, y, 7) & 1) === 1); return; }
    draw(ctx, OBJ[k], fx * 8, fy * 8);
  }
  // Squirrel: dir 0 up, 1 right, 2 down, 3 left; frame 0 standing, 1-3 running
  function player(ctx, fx, fy, dir, frame) {
    const base = dir === 0 ? "sq_up" : dir === 2 ? "sq_down" : "sq_side";
    draw(ctx, base + frame, fx * 8, fy * 8, dir === 3);
  }
  setSheet(SPRITE_SHEET_DEFAULT);
  return { draw, tile, obj, player, variant, setSheet, onReady(f) { listeners.push(f); if (ready) f(); }, isReady: () => ready };
}
