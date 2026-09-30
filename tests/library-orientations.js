// Every library component should solve the same way in all 8 orientations (rotations + mirrors).
// Large puzzles can exceed the solver limit; those are reported as "limit" and skipped.
const E = require('../src/engine.js')(), CP = require('../src/comp.js')(E), LIB = require('../src/library.js');
for (const c of LIB) {
  const base = CP.parse(c), res = new Set();
  for (let t = 0; t < 8; t++) {
    const v = CP.transform(base, t);
    const r = E.solveAll({ W: v.W, H: v.H, terr: v.terr, obj: v.obj, cap: 60000 });
    if (r.sf.capped || r.fs.capped) { res.add('limit'); break; }
    res.add(`${r.sf.ok ? r.sf.pushes : 'x'}/${r.fs.ok ? r.fs.pushes : 'x'}${r.sf.roundTrip ? 'R' : ''}${r.fs.roundTrip ? 'R' : ''}`);
  }
  const verdict = res.size === 1 ? 'same in all orientations' : 'DIFFERS';
  console.log(c.name.padEnd(18), (c.meta?.dir || '').padEnd(12), [...res].join(' | ').padEnd(12), verdict);
}
