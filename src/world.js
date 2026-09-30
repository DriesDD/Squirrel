function WORLD(){
  const N = 5, T = 20, GATE = 4, GATE_MARGIN = 3;
  const DIRS = {
    N: { dx: 0, dy: -1, opp: "S" }, E: { dx: 1, dy: 0, opp: "W" },
    S: { dx: 0, dy: 1, opp: "N" },  W: { dx: -1, dy: 0, opp: "E" },
  };
  function hashString(str) {           // xmur3
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rngFrom(str) {              // mulberry32
    let a = hashString(str);
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
  function shuffle(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  function generateWorld(seed) {
    const rng = rngFrom(seed + "|maze");
    const cells = [];
    for (let y = 0; y < N; y++) { cells.push([]); for (let x = 0; x < N; x++) cells[y].push({ x, y, open: {} }); }
    const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

    // Recursive backtracker from the centre
    const start = { x: Math.floor(N / 2), y: Math.floor(N / 2) };
    const seen = new Set([start.x + "," + start.y]);
    const stack = [start];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const options = shuffle(rng, Object.keys(DIRS)).filter(d => {
        const nx = cur.x + DIRS[d].dx, ny = cur.y + DIRS[d].dy;
        return inside(nx, ny) && !seen.has(nx + "," + ny);
      });
      if (!options.length) { stack.pop(); continue; }
      const d = options[0];
      const nx = cur.x + DIRS[d].dx, ny = cur.y + DIRS[d].dy;
      cells[cur.y][cur.x].open[d] = true;
      cells[ny][nx].open[DIRS[d].opp] = true;
      seen.add(nx + "," + ny);
      stack.push({ x: nx, y: ny });
    }

    // Distances from the start (BFS over the tree)
    const dist = cells.map(r => r.map(() => -1));
    dist[start.y][start.x] = 0;
    const q = [start];
    while (q.length) {
      const c = q.shift();
      for (const d in cells[c.y][c.x].open) {
        const nx = c.x + DIRS[d].dx, ny = c.y + DIRS[d].dy;
        if (dist[ny][nx] < 0) { dist[ny][nx] = dist[c.y][c.x] + 1; q.push({ x: nx, y: ny }); }
      }
    }

    // Exit: the outer room farthest from the start (ties broken by seed)
    const outer = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) outer.push({ x, y, d: dist[y][x], tie: rng() });
    outer.sort((a, b) => b.d - a.d || a.tie - b.tie);
    const ex = outer[0];
    const outSides = [];
    if (ex.y === 0) outSides.push("N"); if (ex.y === N - 1) outSides.push("S");
    if (ex.x === 0) outSides.push("W"); if (ex.x === N - 1) outSides.push("E");
    const exitSide = outSides[Math.floor(rng() * outSides.length)];
    cells[ex.y][ex.x].exit = exitSide;

    // Gate offsets: one per connection, shared by both rooms so doors line up
    const gates = {};
    const range = () => randInt(rng, GATE_MARGIN, T - GATE_MARGIN - GATE);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (cells[y][x].open.E) gates[`${x},${y},E`] = range();
      if (cells[y][x].open.S) gates[`${x},${y},S`] = range();
    }
    gates.exit = range();

    return { seed, cells, start, dist, exit: { x: ex.x, y: ex.y, side: exitSide }, gates, maxDist: ex.d };
  }

  function gateOffset(world, x, y, side) {
    const cell = world.cells[y][x];
    if (cell.exit === side) return world.gates.exit;
    if (side === "E") return world.gates[`${x},${y},E`];
    if (side === "S") return world.gates[`${x},${y},S`];
    if (side === "W") return world.gates[`${x - 1},${y},E`];
    if (side === "N") return world.gates[`${x},${y - 1},S`];
  }

  function roomGates(world, x, y) {
    const cell = world.cells[y][x], out = [];
    for (const side of ["N", "E", "S", "W"]) {
      if (cell.open[side] || cell.exit === side) out.push({ side, offset: gateOffset(world, x, y, side), exit: cell.exit === side });
    }
    return out;
  }
  return { N, T, GATE, DIRS, hashString, rngFrom, generateWorld, gateOffset, roomGates };
}
if (typeof module !== 'undefined') module.exports = WORLD;
