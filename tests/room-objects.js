const E = require('../src/engine.js')(), CP = require('../src/comp.js')(E), LIB = require('../src/library.js'), W = require('../src/world.js')(), RG = require('../src/roomgen.js')(E, CP, 20);
const lib = LIB.map(CP.prepare); let bad = 0, rooms = 0, outside = 0;
for (let s = 0; s < 80; s++) { const seed = 'chk' + s, world = W.generateWorld(seed);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const r = RG.generateRoom({ rng: W.rngFrom(`${seed}|roomgen|${x},${y}`), gates: W.roomGates(world, x, y), isStart: x === 2 && y === 2, lib });
    const L = E.build(20, 20, r.terr, r.obj); rooms++;
    for (let i = 0; i < 400; i++) {
      const k = L.obj[i]; if (!k) continue;
      const ok = k === 1 ? !!E.CRATE_OK[L.terr[i]] : k === 2 ? !!L.hAx[i] : !!L.vAx[i];
      if (!ok) { bad++; }
      const cx = i % 20, cy = (i / 20) | 0;
      if (!r.comps.some(c => cx >= c.x0 && cy >= c.y0 && cx < c.x0 + c.W && cy < c.y0 + c.H)) outside++;
    }
  } }
console.log({ rooms, objectsOnInvalidTiles: bad, objectsOutsideComponents: outside });
