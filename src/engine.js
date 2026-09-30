// Shared rules engine + solver for Twenty-Five Rooms puzzle components.
// Written as one self-contained function so it can be stringified into a Web Worker.
//
// Terrain:  w wall · _ floor · o gapped wall · s/f ports · - | + rails
//           ~ ice · h v x ice with horizontal / vertical / crossing rail
// Objects:  c crate · = horizontal door · ║ vertical door · * snow pile · 1-5 snowball (5 = snow wall)
//
// Rules summary
// - Pushing: crates, doors (along their rail), snow. A push moves the whole line one tile; at most 5 heavy
//   pieces (crates and snowballs of size 3-4) per line.
// - Snow pile: pushed, it becomes a size-1 ball one tile further and leaves plain floor behind.
// - Snowballs: 1-2 are fragile (destroyed when they run into anything that isn't snow), 3-4 act like crates,
//   5 is a snow wall and never moves. A ball that runs into snow or another ball merges into it (sizes add, max 5).
// - Ice: anything that moves onto ice keeps moving the same way until it is on a tile that isn't ice or is stopped.
//   A sliding crate/ball/door that hits a line of objects stops and passes its momentum to the last one in the line.
//   A sliding player stops at an object and passes momentum on, except a door along its rail: the player pushes it
//   and they keep sliding together. After a normal push, only the front piece of the line gets momentum.
function ENGINE() {
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const WALK = { "_": 1, "-": 1, "|": 1, "+": 1, "s": 1, "f": 1, "e": 1, "~": 1, "h": 1, "v": 1, "x": 1 };   // e = level exit
  const CRATE_OK = { "_": 1, "-": 1, "|": 1, "+": 1, "~": 1, "h": 1, "v": 1, "x": 1 };
  const ICE = { "~": 1, "h": 1, "v": 1, "x": 1 };
  const KIND = { "c": 1, "=": 2, "║": 3, "*": 4, "1": 5, "2": 6, "3": 7, "4": 8, "5": 9 };
  const CH = ["", "c", "=", "║", "*", "1", "2", "3", "4", "5"];
  const MAX_CRATES = 5;
  const PILE = 4, SWALL = 9;
  const snowy = k => k >= 4;
  const snowVal = k => k === PILE ? 1 : k - 4;
  const ball = s => 4 + Math.min(5, s);
  const small = k => k === 4 || k === 5 || k === 6;
  const heavy = k => k === 1 || k === 7 || k === 8;
  const big = k => k === 7 || k === 8;

  function build(W, H, terr, objCh) {
    const N = W * H;
    const obj = new Uint8Array(N), hAx = new Uint8Array(N), vAx = new Uint8Array(N), ice = new Uint8Array(N);
    let s = -1, f = -1, sCount = 0, fCount = 0, hasIce = false;
    for (let i = 0; i < N; i++) {
      const t = terr[i];
      if (t === "-" || t === "+" || t === "h" || t === "x") hAx[i] = 1;
      if (t === "|" || t === "+" || t === "v" || t === "x") vAx[i] = 1;
      if (ICE[t]) { ice[i] = 1; hasIce = true; }
      if (t === "s") { s = i; sCount++; }
      if (t === "f") { f = i; fCount++; }
      const k = KIND[objCh[i]] || 0;
      obj[i] = k;
      if (k === 2) hAx[i] = 1;
      if (k === 3) vAx[i] = 1;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < N; i++) {
        if (terr[i] !== "o") continue;
        const x = i % W, y = (i / W) | 0;
        if (!hAx[i] && ((x > 0 && hAx[i - 1]) || (x < W - 1 && hAx[i + 1]))) { hAx[i] = 1; changed = true; }
        if (!vAx[i] && ((y > 0 && vAx[i - W]) || (y < H - 1 && vAx[i + W]))) { vAx[i] = 1; changed = true; }
      }
    }
    return { W, H, N, terr, obj, hAx, vAx, ice, hasIce, s, f, sCount, fCount };
  }

  function nb(L, i, d) {
    const x = (i % L.W) + DX[d], y = ((i / L.W) | 0) + DY[d];
    if (x < 0 || y < 0 || x >= L.W || y >= L.H) return -1;
    return y * L.W + x;
  }
  function canHold(L, k, i) {
    if (k === 2) return !!L.hAx[i];
    if (k === 3) return !!L.vAx[i];
    return !!CRATE_OK[L.terr[i]];
  }
  const perpendicular = (k, d) => (k === 2 && (d & 1) === 0) || (k === 3 && (d & 1) === 1);

  // ---- mutable simulation state ----
  // S.o = objects. When animating, S.tr keeps a timeline: every piece is an entity with keyframes [time, cell]
  // (time in tiles travelled since the key press), size changes ks [time, code] and an optional time it vanishes.
  function hold(e, t, cell) { const f = e.frames; if (f[f.length - 1][0] < t) f.push([t, cell]); }
  function mv(S, a, b, t) {
    const was = S.o[a], k = was === PILE ? ball(1) : was;
    S.o[b] = k; S.o[a] = 0; S.changed = true;
    if (S.tr) {
      const id = S.tr.id[a], e = S.tr.ents[id];
      hold(e, t, a); e.frames.push([t + 1, b]);
      if (k !== was) e.ks.push([t, k]);
      S.tr.id[b] = id; S.tr.id[a] = -1;
    }
  }
  function kill(S, a, t) {
    S.o[a] = 0; S.changed = true;
    if (S.tr) { const e = S.tr.ents[S.tr.id[a]]; hold(e, t, a); e.dead = t; S.tr.id[a] = -1; }
  }
  function merge(S, a, b, t) {
    const k = ball(snowVal(S.o[a]) + snowVal(S.o[b]));
    if (S.tr) {
      const ea = S.tr.ents[S.tr.id[a]];
      hold(ea, t, a); ea.frames.push([t + 1, b]); ea.dead = t + 1; S.tr.id[a] = -1;
      S.tr.ents[S.tr.id[b]].ks.push([t + 1, k]);
    }
    S.o[b] = k; S.o[a] = 0; S.changed = true;
  }
  function pmove(S, a, b, t) { if (S.tr) { const e = S.tr.player; hold(e, t, a); e.frames.push([t + 1, b]); } }

  // Push the line starting at c0 one tile in d, during time t..t+1. Returns null if blocked, else
  // { heavy, mover } where mover is the cell the front piece moved into (-1 if it merged or broke).
  function pushLine(L, S, c0, d, t) {
    const o = S.o, chain = [];
    let c = c0, hv = 0, end = "";
    for (;;) {
      const k = o[c];
      if (k === SWALL || perpendicular(k, d)) return null;
      if (heavy(k) && ++hv > MAX_CRATES) return null;
      chain.push(c);
      const n = nb(L, c, d);
      if (n < 0) { if (small(k)) { end = "break"; break; } return null; }
      const nk = o[n];
      if (snowy(k) && snowy(nk)) { end = "merge"; break; }
      if (nk) {
        if (small(k)) { end = "break"; break; }
        if (!canHold(L, k, n)) return null;
        c = n; continue;
      }
      if (canHold(L, k, n)) { end = "move"; break; }
      if (small(k)) { end = "break"; break; }
      return null;
    }
    const last = chain[chain.length - 1];
    let mover = -1;
    if (end === "merge") merge(S, last, nb(L, last, d), t);
    else if (end === "break") kill(S, last, t + .5);
    else { mover = nb(L, last, d); mv(S, last, mover, t); }
    for (let j = chain.length - 2; j >= 0; j--) mv(S, chain[j], nb(L, chain[j], d), t);
    return { heavy: hv, mover };
  }

  // Move one piece a single tile at time t (when it receives momentum). Returns its new cell or -1.
  function nudge(L, S, c, d, t) {
    const o = S.o, k = o[c], n = nb(L, c, d);
    if (k === SWALL) return -1;
    if (n < 0) { if (small(k)) kill(S, c, t + .5); return -1; }
    const nk = o[n];
    if (nk) {
      if (big(k) && nk === SWALL) return -1;               // big ball stops against a snow wall
      if (snowy(k) && snowy(nk)) merge(S, c, n, t);
      else if (small(k)) kill(S, c, t + .5);
      return -1;
    }
    if (canHold(L, k, n)) { mv(S, c, n, t); return n; }
    if (small(k)) kill(S, c, t + .5);
    return -1;
  }
  // A sliding piece hits the object at n at time t. Momentum only travels through pieces standing on ice:
  // it goes to the last piece of the run of objects on ice. A piece that isn't on ice just stops the hitter.
  function transfer(L, S, n, d, depth, t) {
    if (!L.ice[n]) return;
    let c = n;
    for (;;) {
      const k = S.o[c];
      if (k === SWALL || perpendicular(k, d)) return;
      const nn = nb(L, c, d);
      if (nn >= 0 && S.o[nn] && L.ice[nn]) { c = nn; continue; }
      break;
    }
    const m = nudge(L, S, c, d, t);
    if (m >= 0) slideObj(L, S, m, d, depth + 1, t + 1);
  }
  function slideObj(L, S, c, d, depth, t) {
    if (depth > 64) return;
    for (;;) {
      if (!L.ice[c]) return;
      const k = S.o[c], n = nb(L, c, d);
      if (n < 0) { if (small(k)) kill(S, c, t + .5); return; }
      const nk = S.o[n];
      if (!nk) {
        if (canHold(L, k, n)) { mv(S, c, n, t); c = n; t++; continue; }
        if (small(k)) kill(S, c, t + .5);
        return;
      }
      if (big(k) && nk === SWALL) return;                  // big ball comes to rest in front of a snow wall
      if (snowy(k) && snowy(nk)) { merge(S, c, n, t); return; }
      if (small(k)) { kill(S, c, t + .5); return; }
      transfer(L, S, n, d, depth, t);
      return;
    }
  }
  function slidePlayer(L, S, p, d, t) {
    for (let guard = 0; guard < L.N; guard++) {
      if (!L.ice[p]) return p;
      const n = nb(L, p, d);
      if (n < 0 || !WALK[L.terr[n]]) return p;
      const nk = S.o[n];
      if (!nk) { pmove(S, p, n, t); p = n; t++; continue; }
      if (nk === 2 || nk === 3) {
        if (perpendicular(nk, d)) return p;
        if (!pushLine(L, S, n, d, t)) return p;   // player and door keep sliding together
        pmove(S, p, n, t); p = n; t++; continue;
      }
      transfer(L, S, n, d, 0, t);
      return p;
    }
    return p;
  }

  // One player move from p in direction d. Returns null when nothing happens.
  // { p, obj, crates (heavy pieces pushed), changed (objects changed), moves [{from,to,k}], dist, anim }
  // anim (only when track): { T, player: [[t, cell]...], ents: [{ k0, ks, frames, dead, end }] }
  function step(L, p, obj, d, track = true) {
    const t = nb(L, p, d);
    if (t < 0 || !WALK[L.terr[t]]) return null;
    if (!L.hasIce && !obj[t] && !track) return { p: t, obj, crates: 0, changed: false, moves: [], dist: 1 };
    const S = { o: obj.slice(), tr: null, changed: false };
    if (track) {
      S.tr = { id: new Int32Array(L.N).fill(-1), ents: [], player: { frames: [[0, p]] } };
      for (let i = 0; i < L.N; i++) if (obj[i]) { S.tr.id[i] = S.tr.ents.length; S.tr.ents.push({ k0: obj[i], ks: [[0, obj[i]]], frames: [[0, i]], dead: null, end: -1 }); }
    }
    let hv = 0;
    if (S.o[t]) {
      const r = pushLine(L, S, t, d, 0);
      if (!r) return null;
      hv = r.heavy;
      if (r.mover >= 0 && L.ice[r.mover]) slideObj(L, S, r.mover, d, 0, 1);
    }
    pmove(S, p, t, 0);
    const pp = slidePlayer(L, S, t, d, 1);
    const out = { p: pp, obj: S.changed ? S.o : obj, crates: hv, changed: S.changed, moves: [], dist: 1 };
    if (track) {
      const tr = S.tr;
      for (let i = 0; i < L.N; i++) if (tr.id[i] >= 0) tr.ents[tr.id[i]].end = i;
      const ents = tr.ents.filter(e => e.frames.length > 1 || e.dead !== null || e.ks.length > 1);
      let T = tr.player.frames[tr.player.frames.length - 1][0];
      for (const e of ents) {
        T = Math.max(T, e.frames[e.frames.length - 1][0], e.dead ?? 0, e.ks[e.ks.length - 1][0]);
        if (e.end >= 0 && e.frames.length > 1) out.moves.push({ from: e.frames[0][1], to: e.end, k: S.o[e.end] });
      }
      out.dist = T;
      out.anim = { T, player: tr.player, ents };
    }
    return out;
  }

  // Where things are at time tau of a step's animation: returns { player: [x, y], ents: [{ k, x, y }] } in tiles.
  function animAt(L, anim, tau) {
    const at = (frames) => {
      if (tau <= frames[0][0]) return frames[0][1];
      for (let i = 0; i + 1 < frames.length; i++) {
        const [t0, c0] = frames[i], [t1, c1] = frames[i + 1];
        if (tau <= t1) {
          const k = t1 > t0 ? (tau - t0) / (t1 - t0) : 1;
          return [c0 % L.W + (c1 % L.W - c0 % L.W) * k, ((c0 / L.W) | 0) + (((c1 / L.W) | 0) - ((c0 / L.W) | 0)) * k];
        }
      }
      return frames[frames.length - 1][1];
    };
    const xy = v => Array.isArray(v) ? v : [v % L.W, (v / L.W) | 0];
    const ents = [];
    for (const e of anim.ents) {
      if (e.dead !== null && tau >= e.dead) continue;
      let k = e.k0; for (const [t, kk] of e.ks) if (tau >= t) k = kk;
      const [x, y] = xy(at(e.frames));
      ents.push({ k, x, y });
    }
    return { player: xy(at(anim.player.frames)), ents };
  }

  // ---------- solver ----------
  function encode(obj, p) {
    let s = String.fromCharCode(p + 1);
    for (let i = 0; i < obj.length; i++) if (obj[i]) s += String.fromCharCode(i * 16 + obj[i]);
    return s;
  }
  function decode(key, N) {
    const o = new Uint8Array(N);
    for (let j = 1; j < key.length; j++) { const c = key.charCodeAt(j); o[c >> 4] = c & 15; }
    return o;
  }

  // Positions the player can reach from p without changing any object (directed when there is ice).
  function reach(L, obj, p) {
    const seen = new Uint8Array(L.N), cells = [p]; seen[p] = 1;
    for (let qi = 0; qi < cells.length; qi++) {
      const c = cells[qi];
      for (let d = 0; d < 4; d++) {
        let n;
        if (!L.hasIce) {
          n = nb(L, c, d);
          if (n < 0 || seen[n] || obj[n] || !WALK[L.terr[n]]) continue;
        } else {
          const r = step(L, c, obj, d, false);
          if (!r || r.changed) continue;
          n = r.p;
          if (seen[n]) continue;
        }
        seen[n] = 1; cells.push(n);
      }
    }
    return { cells, seen };
  }

  function walkPath(L, obj, a, b) {
    if (a === b) return [];
    const from = new Int32Array(L.N).fill(-1), how = new Int8Array(L.N);
    const q = [a]; from[a] = a;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      for (let d = 0; d < 4; d++) {
        const r = step(L, c, obj, d, false);
        if (!r || r.changed || from[r.p] >= 0) continue;
        from[r.p] = c; how[r.p] = d; q.push(r.p);
        if (r.p === b) { const dirs = []; for (let x = b; x !== a; x = from[x]) dirs.push(how[x]); return dirs.reverse(); }
      }
    }
    return null;
  }

  function explore(L, start, target, back, cap) {
    const N = L.N;
    const keyOf = (obj, R) => {
      if (L.hasIce) return encode(obj, R.cells[0]);
      let m = R.cells[0]; for (const c of R.cells) if (c < m) m = c;
      return encode(obj, m);
    };
    const keys = new Map(), K = [], P = [], PAR = [], PC = [], PD = [], DEP = [], CHD = [], HT = [], HB = [];
    const k0 = keyOf(L.obj, reach(L, L.obj, start));
    keys.set(k0, 0); K.push(k0); P.push(start); PAR.push(-1); PC.push(-1); PD.push(-1); DEP.push(0); CHD.push([]);
    let capped = false;
    for (let qi = 0; qi < K.length; qi++) {
      const obj = decode(K[qi], N);
      const R = reach(L, obj, P[qi]);
      HT[qi] = !!R.seen[target];
      HB[qi] = !!R.seen[back];
      for (const c of R.cells) for (let d = 0; d < 4; d++) {
        if (!L.hasIce) { const t = nb(L, c, d); if (t < 0 || !obj[t]) continue; }
        const res = step(L, c, obj, d, false);
        if (!res || !res.changed) continue;
        const key = keyOf(res.obj, L.hasIce ? { cells: [res.p] } : reach(L, res.obj, res.p));
        let id = keys.get(key);
        if (id === undefined) {
          if (K.length >= cap) { capped = true; continue; }
          id = K.length; keys.set(key, id);
          K.push(key); P.push(res.p); PAR.push(qi); PC.push(c); PD.push(d); DEP.push(DEP[qi] + 1); CHD.push([]);
        }
        CHD[qi].push(id);
      }
    }
    const n = K.length;
    let goal = -1;
    for (let i = 0; i < n; i++) if (HT[i]) { goal = i; break; }
    const rev = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) for (const c of CHD[i]) rev[c].push(i);
    const good = new Uint8Array(n);
    let q = [];
    for (let i = 0; i < n; i++) if (HT[i]) { good[i] = 1; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) for (const pn of rev[q[qi]]) if (!good[pn]) { good[pn] = 1; q.push(pn); }
    const goodCount = q.length;
    const seen = new Uint8Array(n);
    q = [];
    for (let i = 0; i < n; i++) if (HT[i]) { seen[i] = 1; q.push(i); }
    let roundTrip = false;
    for (let qi = 0; qi < q.length && !roundTrip; qi++) {
      const i = q[qi];
      if (HB[i]) { roundTrip = true; break; }
      for (const c of CHD[i]) if (!seen[c]) { seen[c] = 1; q.push(c); }
    }
    let path = null;
    if (goal >= 0) {
      const ids = [];
      for (let i = goal; i >= 0; i = PAR[i]) ids.push(i);
      ids.reverse();
      let pos = start;
      path = [];
      for (let j = 1; j < ids.length; j++) {
        const id = ids[j], pobj = decode(K[ids[j - 1]], N);
        path.push(...walkPath(L, pobj, pos, PC[id]));
        path.push(PD[id]);
        pos = P[id];
      }
      path.push(...walkPath(L, decode(K[goal], N), pos, target));
    }
    return { ok: goal >= 0, pushes: goal >= 0 ? DEP[goal] : null, steps: path ? path.length : null, path, states: n, capped, dead: n ? 1 - goodCount / n : 0, roundTrip };
  }

  function solveAll(data) {
    const L = build(data.W, data.H, data.terr, data.obj);
    if (L.sCount !== 1 || L.fCount !== 1) return { error: "Place exactly one s and one f before solving." };
    const cap = data.cap || 150000;
    const t0 = Date.now();
    const sf = explore(L, L.s, L.f, L.s, cap);
    const fs = explore(L, L.f, L.s, L.f, cap);
    return { sf, fs, ms: Date.now() - t0 };
  }

  return { DX, DY, WALK, CRATE_OK, ICE, KIND, CH, MAX_CRATES, build, nb, step, animAt, walkPath, solveAll, snowVal };
}
if (typeof module !== "undefined") module.exports = ENGINE;
