// Component helpers: read a component from its ASCII map and produce its 8 rotations/mirrors.
function COMPONENTS(E) {
  const DEF_UNDER = { c: "_", "=": "-", "║": "|", "*": "_", "1": "_", "2": "_", "3": "_", "4": "_", "5": "_", "▭": "_", "▯": "_" };
  const SWAP = { "-": "|", "|": "-", "=": "║", "║": "=", "h": "v", "v": "h", "▭": "▯", "▯": "▭" };   // rotating 90° swaps axes
  // { map: [rows], under: {"x,y": tile under an object or overlay} } -> { W, H, terr[], obj[], base[] }
  // base[i] is the tile under an overlay (lily pads, reeds) when it isn't the default one; "" otherwise.
  function parse(c) {
    const H = c.map.length, W = Math.max(...c.map.map(l => [...l].length));
    const terr = [], obj = [], base = [], under = c.under || {};
    c.map.forEach((l, y) => {
      const a = [...l];
      for (let x = 0; x < W; x++) {
        const ch = a[x] || "w", u = under[x + "," + y];
        if (E.KIND[ch]) { obj.push(ch); terr.push(u || DEF_UNDER[ch]); base.push(""); }
        else { obj.push(""); terr.push(ch); base.push(E.OVERLAY_BASE[ch] && u && u !== E.OVERLAY_BASE[ch] ? u : ""); }
      }
    });
    return { W, H, terr, obj, base };
  }
  function rot(g) { // 90° clockwise
    const W = g.H, H = g.W, terr = Array(W * H), obj = Array(W * H), base = Array(W * H);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const i = y * g.W + x, j = x * W + (g.H - 1 - y);
      terr[j] = SWAP[g.terr[i]] || g.terr[i]; obj[j] = SWAP[g.obj[i]] || g.obj[i]; base[j] = SWAP[g.base[i]] || g.base[i];
    }
    return { W, H, terr, obj, base };
  }
  function mir(g) { // left-right
    const terr = Array(g.W * g.H), obj = Array(g.W * g.H), base = Array(g.W * g.H);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) { const i = y * g.W + x, j = y * g.W + (g.W - 1 - x); terr[j] = g.terr[i]; obj[j] = g.obj[i]; base[j] = g.base[i]; }
    return { W: g.W, H: g.H, terr, obj, base };
  }
  // t = 0..7: bit 2 mirrors first, bits 0-1 rotate that many quarter turns
  function transform(g, t) { let r = (t >> 2) ? mir(g) : g; for (let k = 0; k < (t & 3); k++) r = rot(r); return r; }
  return { parse, transform, DEF_UNDER, SWAP };
}
if (typeof module !== "undefined") module.exports = COMPONENTS;
