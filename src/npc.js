// NPCs: characters that move on their own in real time, next to the push-puzzle rules.
// They don't block the player and don't push anything; they read the level and the objects to decide
// where they can go. World files list them as  "npcs": [{ "type": "frog", "x": 12, "y": 40 }, ...]
// (x, y in world tiles). To add a new kind, add an entry to BEHAVIOURS with create / update / playerMoved / draw.
function NPCS(E, SP) {
  const DX = E.DX, DY = E.DY;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // ---------------------------------------------------------------------------------------------
  // Frog. Default behaviour "cautious":
  // - picks a destination in a straight, unobstructed line that is water or within 4 straight tiles of water;
  // - on land it jumps 2-4 tiles at a time and rests between jumps; in water it swims tile by tile without resting;
  // - at the destination it climbs onto an adjacent big lily pad if there is one;
  // - when the player moves while the frog is on land and less than 5 tiles away, it jumps into the nearest water;
  // - in water, if the player is 2 tiles away or closer, it swims to a water tile further away, or dives if it can't.
  // ---------------------------------------------------------------------------------------------
  const FROG = {
    JUMP_MS: 280, JUMP_MS_PER_TILE: 70, SWIM_MS: 420, REST_MS: [900, 2600], LOOK: 8, NEAR_WATER: 4,
    FLEE_LAND: 5, FLEE_WATER: 2, WATERLINE: 5,
  };

  function create(L, getObj, list, hooks = {}) {
    const W = L.W;
    const npcs = [];
    let playerCell = -1;
    const at = c => [c % W, (c / W) | 0];
    const dist = (a, b) => { const [ax, ay] = at(a), [bx, by] = at(b); return Math.abs(ax - bx) + Math.abs(ay - by); };
    const isWater = c => c >= 0 && L.water[c] === 1;
    const occupied = (c, self) => npcs.some(n => n !== self && (n.cell === c || (n.move && n.move.to === c)));
    // can a frog be on this tile? (land it can stand on, or open water)
    function blocked(c, self) {
      if (c < 0) return true;
      const t = L.terr[c];
      if (t === "w" || t === "o" || t === "%" || t === "&") return true;
      if (getObj()[c]) return true;
      if (c === playerCell || occupied(c, self)) return true;
      return !(isWater(c) || E.WALK[L.eff[c]]);
    }
    // cells in a straight line from c, stopping before the first blocked one
    function line(c, d, max, self) {
      const out = [];
      for (let k = 1; k <= max; k++) { c = E.nb(L, c, d); if (blocked(c, self)) break; out.push(c); }
      return out;
    }
    const nearWater = (c, self) => isWater(c) || [0, 1, 2, 3].some(d => line(c, d, FROG.NEAR_WATER, self).some(isWater));
    const dirTo = (a, b) => { const [ax, ay] = at(a), [bx, by] = at(b); return bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0; };

    function start(f, to, kind, now) {
      const d = dirTo(f.cell, to);
      if (d === 1) f.face = 1; if (d === 3) f.face = 3;
      const n = dist(f.cell, to);
      f.move = { from: f.cell, to, kind, t0: now, dur: kind === "swim" ? FROG.SWIM_MS : FROG.JUMP_MS + FROG.JUMP_MS_PER_TILE * n };
    }
    function chooseDest(f) {
      const cands = [];
      for (let d = 0; d < 4; d++) line(f.cell, d, FROG.LOOK, f).forEach((c, k) => {
        if ((f.mode === "land" ? k >= 1 : k >= 0) && nearWater(c, f)) cands.push(c);
      });
      return cands.length ? pick(cands) : -1;
    }
    // one move toward f.dest along its straight line
    function advance(f, now) {
      const d = dirTo(f.cell, f.dest), left = dist(f.cell, f.dest);
      if (f.mode === "water") {
        const n = E.nb(L, f.cell, d);
        if (blocked(n, f)) { f.dest = -1; return; }
        start(f, n, isWater(n) ? "swim" : "jump", now);
        return;
      }
      let k = left <= 4 ? left : Math.floor(rand(2, 5));
      const path = line(f.cell, d, k, f);
      while (k > 0 && path.length < k) k--;
      if (k <= 0) { f.dest = -1; return; }
      start(f, path[k - 1], "jump", now);
    }
    function tryLilyPad(f, now) {
      for (let d = 0; d < 4; d++) {
        const n = E.nb(L, f.cell, d);
        if (n >= 0 && L.terr[n] === "@" && !blocked(n, f)) { start(f, n, "jump", now); return true; }
      }
      return false;
    }
    function land(f, now) {
      const m = f.move; f.move = null; f.cell = m.to;
      if (isWater(f.cell)) {
        if (f.mode !== "water" && hooks.onSplash) hooks.onSplash(f.cell, now);
        f.mode = "water"; f.rest = now + 60;
      } else { f.mode = "land"; f.rest = now + rand(...FROG.REST_MS); }
      if (f.cell === f.dest) { f.dest = -1; if (tryLilyPad(f, now)) return; }
    }

    const frog = {
      create(n) { return { type: "frog", cell: n.cell, mode: isWater(n.cell) ? "water" : "land", move: null, rest: performance.now() + rand(300, 2000), dest: -1, face: Math.random() < .5 ? 1 : 3 }; },
      update(f, now) {
        if (f.move) { if (now >= f.move.t0 + f.move.dur) land(f, now); else return; }
        if (f.move || now < f.rest) return;
        if (f.mode === "dive") { if (playerCell < 0 || dist(f.cell, playerCell) > FROG.FLEE_WATER) f.mode = "water"; else return; }
        if (f.dest < 0 || f.dest === f.cell) f.dest = chooseDest(f);
        if (f.dest < 0) { f.rest = now + 1000; return; }
        advance(f, now);
      },
      playerMoved(f, now) {
        if (f.move) return;
        const dp = dist(f.cell, playerCell);
        if (f.mode === "land" && dp < FROG.FLEE_LAND) {
          // jump into the nearest water in a straight line; failing that, jump away from the player
          let best = null;
          for (let d = 0; d < 4; d++) line(f.cell, d, 4, f).forEach((c, k) => { if (isWater(c) && (!best || k < best.k)) best = { c, k }; });
          if (best) { f.dest = -1; start(f, best.c, "jump", now); return; }
          const away = [];
          for (let d = 0; d < 4; d++) { const l = line(f.cell, d, 4, f); if (l.length >= 2 && dist(l[l.length - 1], playerCell) > dp) away.push(l[l.length - 1]); }
          if (away.length) { f.dest = -1; start(f, pick(away), "jump", now); }
        } else if (f.mode === "water" && dp <= FROG.FLEE_WATER) {
          let best = null;
          for (let d = 0; d < 4; d++) {
            const n = E.nb(L, f.cell, d);
            if (isWater(n) && !blocked(n, f) && dist(n, playerCell) > dp && (!best || dist(n, playerCell) > dist(best, playerCell))) best = n;
          }
          f.dest = -1;
          if (best !== null) start(f, best, "swim", now); else f.mode = "dive";
        }
      },
      draw(ctx, f, now, ox, oy) {
        let [x, y] = at(f.cell), lift = 0, name, cut = -1;
        const flip = f.face === 3;
        if (f.move) {
          const k = Math.min(1, (now - f.move.t0) / f.move.dur), [ax, ay] = at(f.move.from), [bx, by] = at(f.move.to);
          x = ax + (bx - ax) * k; y = ay + (by - ay) * k;
          if (f.move.kind === "jump") {
            lift = Math.sin(Math.PI * k) * (0.3 + 0.15 * dist(f.move.from, f.move.to));
            name = "frog_jump" + (k < 0.2 ? 1 : k < 0.8 ? 2 : 3);
          } else { name = "frog_swim" + (1 + Math.floor(now / 120) % 3); cut = FROG.WATERLINE; }
        } else if (f.mode === "land") name = "frog_jump0";
        else { name = "frog_swim0"; cut = f.mode === "dive" ? 0 : FROG.WATERLINE; }
        const px = (x - ox) * 8, py = (y - oy - lift) * 8;
        if (cut >= 0) SP.drawSubmerged(ctx, name, px, py, flip, cut, 1);
        else SP.draw(ctx, name, px, py, flip);
      },
    };
    const BEHAVIOURS = { frog };

    for (const n of list || []) {
      const b = BEHAVIOURS[n.type];
      if (!b) continue;
      const cell = n.y * W + n.x;
      const npc = b.create({ ...n, cell });
      npcs.push(npc);
    }
    return {
      npcs,
      update(now) { for (const n of npcs) BEHAVIOURS[n.type].update(n, now); },
      playerMoved(cell, now) { playerCell = cell; for (const n of npcs) BEHAVIOURS[n.type].playerMoved(n, now); },
      setPlayer(cell) { playerCell = cell; },
      // draw the NPCs that are near the view; ox, oy = top-left tile of the view, size = view width in tiles
      draw(ctx, now, ox, oy, size) {
        for (const n of npcs) {
          const [x, y] = at(n.cell);
          if (x < ox - 5 || y < oy - 5 || x > ox + size + 5 || y > oy + size + 5) continue;
          BEHAVIOURS[n.type].draw(ctx, n, now, ox, oy);
        }
      },
    };
  }
  return { create };
}
