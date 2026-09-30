// Room generator: strings puzzle components and mazes together between the room's gates.
// Regions (one per gate, optional hubs, and areas behind mazes) are separate floor areas;
// puzzles and mazes are the only links between them. Dead-end "pocket" mazes fill leftover space.
function ROOMGEN(E, CP, T) {
  const GATE = 4, LO = 1, HI = T - 2;            // interior spans 1..T-2
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const SIDE = { N: 0, E: 1, S: 2, W: 3 };
  const FREE = 0, BORDER = -2, BOX = -1, LEAK = -3;

  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  function shuffle(rng, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- mazes ----------
  // Perfect maze on a small cell grid; every tunnel column/row and wall column/row gets its own width (1-4).
  function makeMaze(rng, maxW, maxH, twoPorts) {
    for (let tries = 0; tries < 60; tries++) {
      const nx = Math.min(randInt(rng, 2, 4), (maxW - 1) >> 1), ny = Math.min(randInt(rng, 2, 4), (maxH - 1) >> 1);
      if (nx < 2 && ny < 2) return null;
      const tw = Array.from({ length: nx }, () => randInt(rng, 1, 4)), th = Array.from({ length: ny }, () => randInt(rng, 1, 4));
      const ww = Array.from({ length: nx - 1 }, () => randInt(rng, 1, 4)), wh = Array.from({ length: ny - 1 }, () => randInt(rng, 1, 4));
      const sum = a => a.reduce((s, v) => s + v, 0);
      // shrink random widths until the maze fits its box
      const fit = (t, w, max) => { while (2 + sum(t) + sum(w) > max) { const all = t.concat(w).map((v, i) => [v, i]).filter(([v]) => v > 1); if (!all.length) return false; const [, i] = pick(rng, all); if (i < t.length) t[i]--; else w[i - t.length]--; } return true; };
      if (!fit(tw, ww, maxW) || !fit(th, wh, maxH)) continue;
      const W = 2 + sum(tw) + sum(ww), H = 2 + sum(th) + sum(wh);
      if (W < 5 && H < 5) continue;
      const cx = [1], cy = [1];
      for (let i = 1; i < nx; i++) cx[i] = cx[i - 1] + tw[i - 1] + ww[i - 1];
      for (let j = 1; j < ny; j++) cy[j] = cy[j - 1] + th[j - 1] + wh[j - 1];
      const g = Array.from({ length: H }, () => Array(W).fill("w"));
      const carve = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = "_"; };
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) carve(cx[i], cy[j], tw[i], th[j]);
      // recursive backtracker
      const seen = new Set(["0,0"]), stack = [[0, 0]], adj = {};
      const link = (a, b) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };
      while (stack.length) {
        const [i, j] = stack[stack.length - 1];
        const opts = shuffle(rng, [[1, 0], [-1, 0], [0, 1], [0, -1]]).map(([a, b]) => [i + a, j + b])
          .filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !seen.has(a + "," + b));
        if (!opts.length) { stack.pop(); continue; }
        const [a, b] = opts[0];
        seen.add(a + "," + b); stack.push([a, b]); link(i + "," + j, a + "," + b);
        if (a !== i) { // horizontal passage through wall column
          const L = Math.min(i, a), pw = randInt(rng, 1, th[j]), off = randInt(rng, 0, th[j] - pw);
          carve(cx[L] + tw[L], cy[j] + off, ww[L], pw);
        } else {
          const L = Math.min(j, b), pw = randInt(rng, 1, tw[i]), off = randInt(rng, 0, tw[i] - pw);
          carve(cx[i] + off, cy[L] + th[L], pw, wh[L]);
        }
      }
      // ports: pick boundary cells far apart (by maze distance)
      const boundary = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        if (j === 0) boundary.push([i, j, 0]); if (j === ny - 1) boundary.push([i, j, 2]);
        if (i === 0) boundary.push([i, j, 3]); if (i === nx - 1) boundary.push([i, j, 1]);
      }
      const portTile = ([i, j, d]) => {
        if (d === 0 || d === 2) return [cx[i] + randInt(rng, 0, tw[i] - 1), d === 0 ? 0 : H - 1];
        return [d === 3 ? 0 : W - 1, cy[j] + randInt(rng, 0, th[j] - 1)];
      };
      const a = pick(rng, boundary);
      const sT = portTile(a);
      g[sT[1]][sT[0]] = "s";
      if (twoPorts) {
        const dist = { [a[0] + "," + a[1]]: 0 }, q = [a[0] + "," + a[1]];
        for (let k = 0; k < q.length; k++) for (const n of adj[q[k]] || []) if (!(n in dist)) { dist[n] = dist[q[k]] + 1; q.push(n); }
        const far = boundary.filter(b => !(b[0] === a[0] && b[1] === a[1] && b[2] === a[2]))
          .map(b => ({ b, d: dist[b[0] + "," + b[1]] + rng() * .5 })).sort((x, y) => y.d - x.d);
        let placed = false;
        for (const { b } of far) {
          const fT = portTile(b);
          if (Math.abs(fT[0] - sT[0]) + Math.abs(fT[1] - sT[1]) < 3) continue;
          g[fT[1]][fT[0]] = "f"; placed = true; break;
        }
        if (!placed) continue;
      }
      // very rarely, a wall block is a crate
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === "w" && rng() < .015) g[y][x] = "c";
      return g.map(r => r.join(""));
    }
    return null;
  }
  function mazeComp(rng, maxW, maxH, twoPorts) {
    const map = makeMaze(rng, maxW, maxH, twoPorts);
    if (!map) return null;
    const P = CP.prepare({ id: "maze", name: "maze", map, under: {}, meta: { dir: "both" } });
    P.maze = true; P.twoWay = true; P.oneWay = false;
    if (!twoPorts) for (const v of P.variants) v.f = null;
    return P;
  }

  // ---------- region graph ----------
  function stronglyConnected(n, edges) {
    const fw = Array.from({ length: n }, () => []), bw = Array.from({ length: n }, () => []);
    for (const e of edges) {
      fw[e.a].push(e.b); bw[e.b].push(e.a);
      if (e.two) { fw[e.b].push(e.a); bw[e.a].push(e.b); }
    }
    const reach = adj => { const seen = new Uint8Array(n); const q = [0]; seen[0] = 1; for (let i = 0; i < q.length; i++) for (const m of adj[q[i]]) if (!seen[m]) { seen[m] = 1; q.push(m); } return q.length === n; };
    return reach(fw) && reach(bw);
  }
  function makeGraph(rng, k, isStart, pools, mLo, mHi) {
    for (let attempt = 0; attempt < 300; attempt++) {
      let hubs = isStart ? 1 : 0;
      if (k === 1) hubs = Math.max(hubs, 1);
      else if (rng() < .3) hubs++;
      hubs = Math.min(hubs, 2);
      const n = k + hubs, m = randInt(rng, mLo, mHi);
      if (m < n - 1) continue;
      const edges = [], keys = new Set();
      for (let tries = 0; edges.length < m && tries < 40; tries++) {
        const a = Math.floor(rng() * n); let b = Math.floor(rng() * (n - 1)); if (b >= a) b++;
        const two = pools.one.length === 0 || (pools.two.length > 0 && rng() < .5);
        const key = two ? `t${Math.min(a, b)}-${Math.max(a, b)}` : `o${a}-${b}`;
        if (keys.has(key) || keys.has(`t${Math.min(a, b)}-${Math.max(a, b)}`)) continue;
        keys.add(key); edges.push({ a, b, two });
      }
      if (edges.length !== m) continue;
      const deg = new Array(n).fill(0);
      for (const e of edges) { deg[e.a]++; deg[e.b]++; }
      if (deg.some((d, i) => d === 0 || (i >= k && !isStart && d < 2))) continue;
      if (!stronglyConnected(n, edges)) continue;
      return { n, k, hubs, edges, parent: {} };
    }
    return null;
  }
  // Put a maze in series: node X keeps the maze, a new area X' behind it takes over some of X's links.
  function insertMaze(rng, graph, comp) {
    const X = Math.floor(rng() * graph.n);
    const ends = [];
    graph.edges.forEach((e, i) => { if (e.a === X) ends.push([i, "a"]); if (e.b === X) ends.push([i, "b"]); });
    if (!ends.length) return;
    const Xp = graph.n++;
    graph.parent[Xp] = X;
    const moved = shuffle(rng, ends).slice(0, randInt(rng, 1, ends.length));
    for (const [i, side] of moved) graph.edges[i][side] = Xp;
    graph.edges.push({ a: X, b: Xp, two: true, comp, maze: true });
  }

  // ---------- layout ----------
  function layout(rng, gates, graph, isStart, pocketTries) {
    const N = T * T;
    const owner = new Int16Array(N), conn = new Uint8Array(N);
    const terr = new Array(N).fill("w"), obj = new Array(N).fill("");
    const at = (x, y) => y * T + x;
    const inner = (x, y) => x >= LO && y >= LO && x <= HI && y <= HI;
    for (let i = 0; i < T; i++) { owner[at(i, 0)] = owner[at(i, T - 1)] = owner[at(0, i)] = owner[at(T - 1, i)] = BORDER; }
    const claim = (i, R, c) => { owner[i] = R; terr[i] = "_"; if (c) conn[i] = 1; };
    const hasCore = new Set();

    const anchors = [];
    gates.forEach((g, gi) => {
      const R = gi + 1, d = SIDE[g.side];
      let sx = 0, sy = 0;
      for (let j = g.offset; j < g.offset + GATE; j++) {
        let bx, by;
        if (d === 0) { bx = j; by = 0; } else if (d === 2) { bx = j; by = T - 1; } else if (d === 3) { bx = 0; by = j; } else { bx = T - 1; by = j; }
        claim(at(bx, by), R, 1);
        const cx = bx - DX[d], cy = by - DY[d];
        claim(at(cx, cy), R, 1); sx += cx; sy += cy;
      }
      anchors[R] = [sx / GATE - DX[d] * 3, sy / GATE - DY[d] * 3];
      hasCore.add(R);
    });

    let startCell = null;
    for (let h = 0; h < graph.hubs; h++) {
      const R = graph.k + h + 1, w = randInt(rng, 2, 3), hh = randInt(rng, 2, 3);
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        let x0, y0;
        const mid = T / 2 - 1;
        if (isStart && h === 0) { x0 = mid - (w >> 1) + (tries ? randInt(rng, -3, 3) : 0); y0 = mid - (hh >> 1) + (tries ? randInt(rng, -3, 3) : 0); }
        else { x0 = randInt(rng, 3, T - 4 - w); y0 = randInt(rng, 3, T - 4 - hh); }
        let ok = true;
        for (let y = y0 - 2; y < y0 + hh + 2 && ok; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) {
          if (!inner(x, y) && (x === x0 - 2 || y === y0 - 2 || x === x0 + w + 1 || y === y0 + hh + 1)) continue;
          if (!inner(x, y) || owner[at(x, y)] !== FREE) { ok = false; break; }
        }
        if (!ok) continue;
        for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) claim(at(x, y), R, 1);
        anchors[R] = [x0 + w / 2, y0 + hh / 2];
        hasCore.add(R);
        if (isStart && h === 0) startCell = [x0 + (w >> 1), y0 + (hh >> 1)];
        placed = true;
      }
      if (!placed) return null;
    }
    for (let node = graph.k + graph.hubs; node < graph.n; node++) {
      const P = anchors[graph.parent[node] + 1];
      anchors[node + 1] = [(P[0] + T / 2) / 2 + (rng() - .5) * 4, (P[1] + T / 2) / 2 + (rng() - .5) * 4];
    }

    const pending = [], comps = [];
    function fits(v, x0, y0, ports) {
      for (let y = y0 - 1; y <= y0 + v.H; y++) for (let x = x0 - 1; x <= x0 + v.W; x++) if (owner[at(x, y)] !== FREE) return false;
      for (const [port, R] of ports) {
        const ex = x0 + port.exit[0], ey = y0 + port.exit[1];
        if (!inner(ex, ey)) return false;
        for (let d = 0; d < 4; d++) { const o = owner[at(ex + DX[d], ey + DY[d])]; if (o > 0 && o !== R) return false; }
      }
      if (ports.length === 2) {
        const s = ports[0][0].exit, f = ports[1][0].exit;
        if (Math.abs(s[0] - f[0]) + Math.abs(s[1] - f[1]) <= 1) return false;
      }
      return true;
    }
    function place(v, x0, y0, ports) {
      for (let y = 0; y < v.H; y++) for (let x = 0; x < v.W; x++) {
        const i = at(x0 + x, y0 + y), j = y * v.W + x;
        owner[i] = BOX; terr[i] = v.terr[j]; obj[i] = v.obj[j];
      }
      for (const [lx, ly] of v.leaks) owner[at(x0 + lx, y0 + ly)] = LEAK;
      for (const [port, R] of ports) {
        const pi = at(x0 + port.port[0], y0 + port.port[1]);
        owner[pi] = R; terr[pi] = "_";                    // entrances are ordinary floor in the room
        for (const [tx2, ty2] of port.tunnel) { const i = at(x0 + tx2, y0 + ty2); owner[i] = R; terr[i] = "_"; }
        const ei = at(x0 + port.exit[0], y0 + port.exit[1]);
        claim(ei, R, 0);
        pending.push({ cell: ei, R });
      }
    }

    // Place linking components (puzzles and in-series mazes), largest first
    const order = graph.edges.map((e, i) => i).sort((a, b) => {
      const A = graph.edges[a].comp.variants[0], B = graph.edges[b].comp.variants[0];
      return B.W * B.H - A.W * A.H;
    });
    for (const ei of order) {
      const e = graph.edges[ei], C = e.comp;
      const aS = anchors[e.sR], aF = anchors[e.fR];
      const tx = (aS[0] + aF[0]) / 2 + (rng() - .5) * 6, ty = (aS[1] + aF[1]) / 2 + (rng() - .5) * 6;
      const ranked = C.variants.map(v => {
        const ox = tx - v.W / 2, oy = ty - v.H / 2;
        const s = v.s.exit, f = v.f.exit;
        const score = Math.hypot(ox + s[0] - aS[0], oy + s[1] - aS[1]) + Math.hypot(ox + f[0] - aF[0], oy + f[1] - aF[1]) + rng() * 6;
        return { v, score };
      }).sort((a, b) => a.score - b.score);
      let done = false;
      for (const { v } of ranked.slice(0, 5)) {
        const cands = [];
        for (let y0 = 2; y0 + v.H - 1 <= T - 3; y0++) for (let x0 = 2; x0 + v.W - 1 <= T - 3; x0++)
          cands.push([Math.hypot(x0 + v.W / 2 - tx, y0 + v.H / 2 - ty) + rng() * 3, x0, y0]);
        cands.sort((a, b) => a[0] - b[0]);
        for (const [, x0, y0] of cands) {
          const ports = [[v.s, e.sR], [v.f, e.fR]];
          if (!fits(v, x0, y0, ports)) continue;
          place(v, x0, y0, ports);
          comps.push({ id: C.id, name: C.name, dir: C.dir, maze: !!C.maze, x0, y0, W: v.W, H: v.H, t: v.t, sR: e.sR, fR: e.fR });
          done = true; break;
        }
        if (done) break;
      }
      if (!done) return null;
    }

    // Routing
    const allowed = (x, y, R) => {
      if (!inner(x, y)) return false;
      if (owner[at(x, y)] !== FREE) return false;
      for (let d = 0; d < 4; d++) { const o = owner[at(x + DX[d], y + DY[d])]; if ((o > 0 && o !== R) || o === LEAK) return false; }
      return true;
    };
    const touchesConn = (x, y, R) => {
      for (let d = 0; d < 4; d++) { const j = at(x + DX[d], y + DY[d]); if (owner[j] === R && conn[j]) return true; }
      return false;
    };
    const spread = R => {
      const st = []; for (let i = 0; i < N; i++) if (owner[i] === R && conn[i]) st.push(i);
      while (st.length) { const c = st.pop(), x = c % T, y = (c / T) | 0; for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= T || ny >= T) continue; const j = at(nx, ny); if (owner[j] === R && !conn[j]) { conn[j] = 1; st.push(j); } } }
    };
    function route(cell, R) {
      const sx = cell % T, sy = (cell / T) | 0;
      if (touchesConn(sx, sy, R)) { conn[cell] = 1; spread(R); return true; }
      const from = new Int32Array(N).fill(-1); from[cell] = cell;
      const q = [cell]; let goal = -1;
      for (let qi = 0; qi < q.length && goal < 0; qi++) {
        const c = q[qi], x = c % T, y = (c / T) | 0;
        for (const d of shuffle(rng, [0, 1, 2, 3])) {
          const nx = x + DX[d], ny = y + DY[d], j = at(nx, ny);
          if (from[j] >= 0 || !allowed(nx, ny, R)) continue;
          from[j] = c; q.push(j);
          if (touchesConn(nx, ny, R)) { goal = j; break; }
        }
      }
      if (goal < 0) return false;
      for (let c = goal; c !== cell; c = from[c]) claim(c, R, 1);
      conn[cell] = 1; spread(R);
      return true;
    }
    for (const p of shuffle(rng, pending)) {
      if (conn[p.cell]) continue;
      if (!hasCore.has(p.R)) { conn[p.cell] = 1; hasCore.add(p.R); spread(p.R); continue; }
      if (!route(p.cell, p.R)) return null;
    }

    // Pocket mazes: dead ends hanging off any area, to fill leftover space.
    // Their own outer wall seals them, so they may sit right against other walls.
    const regionDist = (ex, ey) => {
      const best = new Map();
      for (let i = 0; i < N; i++) if (owner[i] > 0 && conn[i]) {
        const d = Math.abs(i % T - ex) + Math.abs(((i / T) | 0) - ey);
        if (!best.has(owner[i]) || d < best.get(owner[i])) best.set(owner[i], d);
      }
      return [...best.entries()].sort((a, b) => a[1] - b[1]);
    };
    let fails = 0;
    for (let t = 0; t < pocketTries && fails < 8; t++) {
      // find the larger empty rectangles and size the maze to one of them
      const ps = new Int32Array((T + 1) * (T + 1));
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) ps[(y + 1) * (T + 1) + x + 1] = (inner(x, y) && owner[at(x, y)] === FREE ? 1 : 0) + ps[y * (T + 1) + x + 1] + ps[(y + 1) * (T + 1) + x] - ps[y * (T + 1) + x];
      const free = (x0, y0, w, h) => ps[(y0 + h) * (T + 1) + x0 + w] - ps[y0 * (T + 1) + x0 + w] - ps[(y0 + h) * (T + 1) + x0] + ps[y0 * (T + 1) + x0] === w * h;
      const rects = [];
      for (let y0 = 1; y0 <= HI; y0++) for (let x0 = 1; x0 <= HI; x0++) for (let h = 5; h <= 12 && y0 + h - 1 <= HI; h++) for (let w = 5; w <= 12 && x0 + w - 1 <= HI; w++) if (free(x0, y0, w, h)) rects.push([w * h + rng() * 8, x0, y0, w, h]);
      if (!rects.length) break;
      rects.sort((a, b) => b[0] - a[0]);
      const [, rx0, ry0, rw, rh] = pick(rng, rects.slice(0, 6));
      const C = mazeComp(rng, rw, rh, false);
      if (!C) { fails++; continue; }
      let done = false;
      const tries = [];
      for (const v of shuffle(rng, C.variants)) if (v.W <= rw && v.H <= rh) for (let y0 = ry0; y0 + v.H <= ry0 + rh; y0++) for (let x0 = rx0; x0 + v.W <= rx0 + rw; x0++) tries.push([v, x0, y0]);
      for (const [v, x0, y0] of tries) {
        const ex = x0 + v.s.exit[0], ey = y0 + v.s.exit[1];
        if (!inner(ex, ey)) continue;
        const eo = owner[at(ex, ey)];
        if (eo !== FREE && !(eo > 0 && conn[at(ex, ey)])) continue;
        const targets = eo > 0 ? [[eo, 0]] : regionDist(ex, ey).slice(0, 2);
        for (const [R, d] of targets) {
          if (d > 8) break;
          // exit cell may not touch another area
          let clean = true;
          for (let dd = 0; dd < 4; dd++) { const o = owner[at(ex + DX[dd], ey + DY[dd])]; if ((o > 0 && o !== R) || o === LEAK) clean = false; }
          if (!clean) continue;
          const snap = [owner.slice(), conn.slice(), terr.slice(), obj.slice()];
          place(v, x0, y0, [[v.s, R]]);
          const p = pending.pop();
          if (eo > 0 || route(p.cell, p.R)) {
            conn[p.cell] = 1; spread(R);
            comps.push({ id: "maze", name: "maze (dead end)", dir: "both", maze: true, x0, y0, W: v.W, H: v.H, t: v.t, sR: R, fR: null });
            done = true; break;
          }
          owner.set(snap[0]); conn.set(snap[1]);
          for (let i = 0; i < N; i++) { terr[i] = snap[2][i]; obj[i] = snap[3][i]; }
        }
        if (done) break;
      }
      if (!done) fails++;
    }

    // Widen corridors a little
    for (let pass = 0; pass < 2; pass++) {
      for (const i of shuffle(rng, Array.from({ length: N }, (_, i) => i))) {
        const x = i % T, y = (i / T) | 0;
        if (!inner(x, y) || owner[i] !== FREE) continue;
        let R = 0, same = 0, bad = false;
        for (let d = 0; d < 4; d++) {
          const o = owner[at(x + DX[d], y + DY[d])];
          if (o === LEAK) bad = true;
          if (o > 0) { if (R && o !== R) bad = true; R = o; same++; }
        }
        if (bad || same < 2 || rng() < .35) continue;
        claim(i, R, 1);
      }
    }
    return { terr, obj, owner, comps, start: startCell, regions: graph.n };
  }

  function openRoom(gates, isStart) {
    const N = T * T, terr = new Array(N).fill("w"), obj = new Array(N).fill("");
    for (let y = 1; y < T - 1; y++) for (let x = 1; x < T - 1; x++) terr[y * T + x] = "_";
    for (const g of gates) for (let j = g.offset; j < g.offset + GATE; j++) {
      const d = SIDE[g.side];
      const x = d === 0 || d === 2 ? j : d === 3 ? 0 : T - 1, y = d === 1 || d === 3 ? j : d === 0 ? 0 : T - 1;
      terr[y * T + x] = "_";
    }
    return { terr, obj, comps: [], start: isStart ? [T / 2, T / 2] : null, fallback: true };
  }

  function generateRoom({ rng, gates, isStart, lib }) {
    const pools = { two: lib.filter(c => c.usable && c.twoWay), one: lib.filter(c => c.usable && c.oneWay) };
    if (!pools.two.length && !pools.one.length) return openRoom(gates, isStart);
    for (let attempt = 0; attempt < 160; attempt++) {
      // start ambitious, relax the puzzle and maze counts when a room won't fit
      const lvl = Math.min(4, Math.floor(attempt / 30));
      const [mLo, mHi, zLo, zHi] = [[3, 4, 1, 2], [2, 3, 1, 2], [2, 3, 1, 1], [1, 3, 1, 1], [1, 3, 0, 1]][lvl];
      const graph = makeGraph(rng, gates.length, isStart, pools, mLo, mHi);
      if (!graph) continue;
      const used = new Set();
      for (const e of graph.edges) {
        const pool = e.two ? pools.two : pools.one;
        const fresh = pool.filter(c => !used.has(c.id));
        e.comp = pick(rng, fresh.length ? fresh : pool);
        used.add(e.comp.id);
      }
      const mazes = randInt(rng, zLo, zHi);
      for (let m = 0; m < mazes; m++) {
        const C = mazeComp(rng, randInt(rng, 5, 10), randInt(rng, 5, 10), true);
        if (C) insertMaze(rng, graph, C);
      }
      for (const e of graph.edges) {
        const a = e.a + 1, b = e.b + 1, C = e.comp;
        if (e.two) { if (rng() < .5) { e.sR = a; e.fR = b; } else { e.sR = b; e.fR = a; } }
        else if (C.inPort === "s") { e.sR = a; e.fR = b; } else { e.sR = b; e.fR = a; }
      }
      for (let tries = 0; tries < 2; tries++) {
        const res = layout(rng, gates, graph, isStart, 14);
        if (res) { res.attempts = attempt + 1; res.level = lvl; res.graph = graph; return res; }
      }
    }
    return openRoom(gates, isStart);
  }

  return { generateRoom, makeMaze };
}
if (typeof module !== "undefined") module.exports = ROOMGEN;
