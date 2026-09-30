const E = require('../src/engine.js')(), CP = require('../src/comp.js')(E), LIB = require('../src/library.js'), W = require('../src/world.js')(), RG = require('../src/roomgen.js')(E, CP, 20);
const lib = LIB.map(CP.prepare);
const T = 20, DX=[0,1,0,-1], DY=[-1,0,1,0];
let rooms = 0, fallback = 0, leaks = 0, notSC = 0, ms = 0, compCounts = {}, attemptsMax = 0, maxMs = 0;
function check(room, gates) {
  // leak check: flood each region over walkable cells outside component boxes; must stay in one region
  const box = new Uint8Array(T*T);
  for (const c of room.comps) for (let y=0;y<c.H;y++) for (let x=0;x<c.W;x++) box[(c.y0+y)*T+c.x0+x]=1;
  const reg = new Int16Array(T*T).fill(-1); let rid = 0, bad = false;
  for (let i=0;i<T*T;i++) {
    if (box[i] || reg[i]>=0 || !E.WALK[room.terr[i]]) continue;
    const owners = new Set(); const st=[i]; reg[i]=rid;
    while (st.length) { const c=st.pop(); if (room.owner[c]>0) owners.add(room.owner[c]); const x=c%T,y=(c/T)|0; for (let d=0;d<4;d++){const nx=x+DX[d],ny=y+DY[d]; if(nx<0||ny<0||nx>=T||ny>=T)continue; const j=ny*T+nx; if(reg[j]>=0||box[j]||!E.WALK[room.terr[j]])continue; reg[j]=rid; st.push(j);} }
    if (owners.size > 1) bad = true;
    rid++;
  }
  // box interior cells walkable that touch outside floor must be ports
  for (const c of room.comps) for (let y=0;y<c.H;y++) for (let x=0;x<c.W;x++) {
    const i=(c.y0+y)*T+c.x0+x; if (!E.WALK[room.terr[i]]) continue;
    for (let d=0;d<4;d++){ const nx=c.x0+x+DX[d], ny=c.y0+y+DY[d]; const j=ny*T+nx; if (box[j]) continue; if (E.WALK[room.terr[j]] && room.owner[i] <= 0) bad = true; }
  }
  return !bad;
}
for (let s = 0; s < 60; s++) {
  const seed = 'test' + s, world = W.generateWorld(seed);
  for (let y=0;y<5;y++) for (let x=0;x<5;x++) {
    const gates = W.roomGates(world, x, y);
    const t0 = Date.now();
    const room = RG.generateRoom({ rng: W.rngFrom(`${seed}|roomgen|${x},${y}`), gates, isStart: x===2&&y===2, lib });
    const dt = Date.now()-t0; ms += dt; maxMs = Math.max(maxMs, dt);
    rooms++;
    if (room.fallback) { fallback++; continue; }
    attemptsMax = Math.max(attemptsMax, room.attempts);
    if (!check(room, gates)) leaks++;
    const n = room.comps.length; compCounts[n] = (compCounts[n]||0)+1;
    if (x===2&&y===2 && !room.start) console.log('no start', seed);
  }
}
console.log({ rooms, fallback, leaks, avgMs: (ms/rooms).toFixed(1), maxMs, attemptsMax, compCounts });
// strong connectivity of the final region graph + maze stats
let sc = 0, mz = 0, pockets = 0, puz = 0, fill = 0, n2 = 0;
for (let s = 0; s < 60; s++) {
  const seed = 'test' + s, world = W.generateWorld(seed);
  for (let y=0;y<5;y++) for (let x=0;x<5;x++) {
    const room = RG.generateRoom({ rng: W.rngFrom(`${seed}|roomgen|${x},${y}`), gates: W.roomGates(world,x,y), isStart: x===2&&y===2, lib });
    if (room.fallback) continue;
    const g = room.graph, n = g.n;
    const fw = Array.from({length:n},()=>[]); for (const e of g.edges){ fw[e.a].push(e.b); if(e.two) fw[e.b].push(e.a); }
    let ok = true; for (let a=0;a<n;a++){ const seen=new Set([a]),q=[a]; for(let i=0;i<q.length;i++) for(const m of fw[q[i]]) if(!seen.has(m)){seen.add(m);q.push(m);} if(seen.size!==n) ok=false; }
    if (!ok) sc++;
    for (const c of room.comps) { if (c.name==='maze') mz++; else if (c.maze) pockets++; else puz++; }
    let open = 0; for (let i=0;i<400;i++) if (room.terr[i] !== 'w') open++; fill += open/324; n2++;
  }
}
console.log({ notStronglyConnected: sc, perRoom: { puzzles: (puz/n2).toFixed(2), seriesMazes: (mz/n2).toFixed(2), pocketMazes: (pockets/n2).toFixed(2) }, avgOpenShare: (fill/n2).toFixed(2) });
const lv = {};
for (let s = 0; s < 30; s++) { const seed='test'+s, world=W.generateWorld(seed); for (let y=0;y<5;y++) for (let x=0;x<5;x++) { const r = RG.generateRoom({ rng: W.rngFrom(`${seed}|roomgen|${x},${y}`), gates: W.roomGates(world,x,y), isStart: x===2&&y===2, lib }); const k = (r.level ?? 'F') + '/g' + W.roomGates(world,x,y).length; lv[k]=(lv[k]||0)+1; } }
console.log(lv);
