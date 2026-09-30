// Component preparation: parse, 8 transforms, port exits/tunnels.
function COMPONENTS(E) {
  const DEF_UNDER = { c: "_", "=": "-", "║": "|", "*": "_", "1": "_", "2": "_", "3": "_", "4": "_", "5": "_" };
  const SWAP = { "-": "|", "|": "-", "=": "║", "║": "=", "h": "v", "v": "h" };
  function parse(c) {
    const H = c.map.length, W = Math.max(...c.map.map(l => [...l].length));
    const terr = [], obj = [];
    c.map.forEach((l, y) => { const a = [...l]; for (let x = 0; x < W; x++) { const ch = a[x] || "w"; if (E.KIND[ch]) { obj.push(ch); terr.push((c.under || {})[x + "," + y] || DEF_UNDER[ch]); } else { obj.push(""); terr.push(ch); } } });
    return { W, H, terr, obj };
  }
  function rot(g) { // 90° clockwise
    const W = g.H, H = g.W, terr = Array(W * H), obj = Array(W * H);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const i = y * g.W + x, j = x * W + (g.H - 1 - y);
      terr[j] = SWAP[g.terr[i]] || g.terr[i]; obj[j] = SWAP[g.obj[i]] || g.obj[i];
    }
    return { W, H, terr, obj };
  }
  function mir(g) {
    const terr = Array(g.W * g.H), obj = Array(g.W * g.H);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) { const i = y * g.W + x, j = y * g.W + (g.W - 1 - x); terr[j] = g.terr[i]; obj[j] = g.obj[i]; }
    return { W: g.W, H: g.H, terr, obj };
  }
  function transform(g, t) { let r = (t >> 2) ? mir(g) : g; for (let k = 0; k < (t & 3); k++) r = rot(r); return r; }
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  // Find how a port reaches outside the bounding box: straight through walls only, tunnel walls flanked by walls/gaps.
  function portExit(g, ch) {
    const p = g.terr.indexOf(ch); if (p < 0) return null;
    const px = p % g.W, py = (p / g.W) | 0;
    let best = null;
    for (let d = 0; d < 4; d++) {
      let x = px, y = py; const tunnel = []; let ok = true;
      for (;;) {
        x += DX[d]; y += DY[d];
        if (x < 0 || y < 0 || x >= g.W || y >= g.H) break;
        const i = y * g.W + x;
        if (g.terr[i] !== "w") { ok = false; break; }
        for (const s of [(d + 1) & 3, (d + 3) & 3]) {
          const nx = x + DX[s], ny = y + DY[s];
          if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
          const t = g.terr[ny * g.W + nx];
          if (t !== "w" && t !== "o") ok = false;
        }
        if (!ok) break;
        tunnel.push([x, y]);
      }
      if (ok && (!best || tunnel.length < best.tunnel.length)) best = { port: [px, py], d, tunnel, exit: [x, y] };
    }
    return best;
  }
  // Walkable edge cells that aren't ports would let corridors leak in.
  function leaks(g) {
    const out = [];
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      if (x && y && x < g.W - 1 && y < g.H - 1) continue;
      const t = g.terr[y * g.W + x];
      if (E.WALK[t] && t !== "s" && t !== "f") out.push([x, y]);
    }
    return out;
  }
  function prepare(c) {
    const base = parse(c);
    const dir = c.meta && c.meta.dir;
    const variants = [];
    for (let t = 0; t < 8; t++) {
      const g = transform(base, t);
      const s = portExit(g, "s"), f = portExit(g, "f");
      variants.push({ t, ...g, s, f, leaks: leaks(g) });
    }
    const usable = variants[0].s && variants[0].f && dir && dir !== "none";
    // entry/exit for one-way pieces: travel from `in` port to `out` port
    const oneWay = dir === "sf" || dir === "fs" || dir === "either-once";
    const inPort = dir === "fs" ? "f" : "s";
    return { id: c.id, name: c.name, dir, rating: c.meta ? c.meta.rating : 1, twoWay: dir === "both", oneWay, inPort, outPort: inPort === "s" ? "f" : "s", variants, usable };
  }
  return { parse, transform, portExit, leaks, prepare, SWAP };
}
if (typeof module !== "undefined") module.exports = COMPONENTS;
