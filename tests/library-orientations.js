const E = require('../src/engine.js')(); const CP = require('../src/comp.js')(E); const LIB = require('../src/library.js');
for (const c of LIB) {
  const P = CP.prepare(c); const res = [];
  for (const v of P.variants) {
    const r = E.solveAll({ W: v.W, H: v.H, terr: v.terr, obj: v.obj });
    res.push(`${r.sf.ok?r.sf.pushes:'x'}/${r.fs.ok?r.fs.pushes:'x'}${r.sf.roundTrip?'R':''}${r.fs.roundTrip?'R':''}`);
  }
  const v = P.variants[0];
  console.log(c.name.padEnd(18), c.meta.dir.padEnd(5), [...new Set(res)].join(' | '), ' s-tunnel', v.s && v.s.tunnel.length, 'f-tunnel', v.f && v.f.tunnel.length, 'leaks', JSON.stringify(v.leaks));
}
