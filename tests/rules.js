const E = require('../src/engine.js')();
const DEF = { c: '_', '=': '-', '║': '|', '*': '_', '1':'_','2':'_','3':'_','4':'_','5':'_' };
function lvl(lines, under = {}) {
  const H = lines.length, W = Math.max(...lines.map(l => [...l].length)); const terr = [], obj = [];
  lines.forEach((l, y) => { const a = [...l]; for (let x = 0; x < W; x++) { const ch = a[x] || 'w'; if (E.KIND[ch]) { obj.push(ch); terr.push(under[x + ',' + y] || DEF[ch]); } else { obj.push(''); terr.push(ch); } } });
  return { W, H, terr, obj };
}
// '@' marks the player start (floor unless under says otherwise)
function t(name, lines, d, under = {}, expect) {
  let p = -1; lines = lines.map((l, y) => { const x = [...l].indexOf('@'); if (x >= 0) { p = [y, x]; return l.replace('@', '_'); } return l; });
  for (const k in under) if (k === p[1] + ',' + p[0]) { }
  const l = lvl(lines, under); const L = E.build(l.W, l.H, l.terr, l.obj);
  if (under['@']) L.terr[p[0] * L.W + p[1]] = under['@'], Object.assign(L, E.build(l.W, l.H, L.terr, l.obj));
  const r = E.step(L, p[0] * L.W + p[1], L.obj, d);
  let out = 'blocked';
  if (r) { out = ''; for (let y = 0; y < L.H; y++) { for (let x = 0; x < L.W; x++) { const i = y * L.W + x; out += i === r.p ? '@' : (r.obj[i] ? E.CH[r.obj[i]] : L.terr[i]); } if (y < L.H - 1) out += ' / '; } }
  const ok = expect === undefined ? '' : (out === expect ? ' ✓' : ' ✗ expected ' + expect);
  console.log(name.padEnd(44), out + ok);
}
const R = 1, Lf = 3, D = 2;
t('walk onto ice slides to first non-ice', ['@~~~__'], R, {}, '_~~~@_');
t('slide stops at wall', ['@~~~w'], R, {}, '_~~@w');
t('slide into crate: player stops, crate moves', ['@~~c~~_'], R, {'3,0':'~'}, '_~@~~~c');
t('crate hits line on ice: last one moves', ['@c~~cc~~_'], R, {'4,0':'~','5,0':'~'}, '_@~~cc~~c'.replace('_@','_@'));
t('push crate onto ice, it slides', ['@c~~~_'], R, {}, '_@~~~c');
t('push onto ice then player follows & hits', ['@c~~~w'], R, {}, '_@~~cw');
t('sliding player pushes door along rail', ['@~h=hh_'], R, {'3,0':'h'}, '_~hh@=_');
t('door pushed onto ice rail slides', ['@=hhh-'], R, {}, '_@hhh=');
t('pile -> ball size 1', ['@*__'], R, {}, '_@1_');
t('pile into pile -> ball size 2', ['@**_'], R, {}, '_@2_');
t('pile into wall -> destroyed', ['@*w'], R, {}, '_@w');
t('small ball into crate -> destroyed', ['@2c_'], R, {}, '_@c_');
t('ball 2 into ball 2 -> 4', ['@22_'], R, {}, '_@4_');
t('ball 3 pushes crate', ['@3c_'], R, {}, '_@3c');
t('crate pushes ball 3', ['@c3_'], R, {}, '_@c3');
t('ball 4 into ball 3 -> snow wall 5', ['@43_'], R, {}, '_@5_');
t('snow wall is immovable', ['@5_'], R, {}, 'blocked');
t('crate into snow wall blocked', ['@c5'], R, {}, 'blocked');
t('ball 3 into snow wall merges', ['@35'], R, {}, '_@5');
t('ball 3 rolls into pile -> 4', ['@3*_'], R, {}, '_@4_');
t('6 heavy blocked', ['@cc3cc4_'], R, {}, 'blocked');
t('5 heavy ok', ['@cc3cc_'], R, {}, '_@cc3cc');
t('ball slides on ice and breaks on wall', ['@1~~w'], R, {}, '_@~~w');
t('ball 3 slides and hits crate line: transfer', ['@3~~cc_'], R, {}, '_@~3c_c'.replace('_@~3c_c','_@~3c_c'));
t('sliding player hits perpendicular door: stop', ['@~║_'], R, {'2,0':'x'}, '_@║_'.replace('_@║_','_@║_'));
t('USER BUG: crate slides into snow line on floor', ['@c~~~**w'], R, {}, '_@~~c**w');
t('slider hits crate on floor: no transfer', ['@~~c_'], R, {}, '_~@c_');
t('slider hits line on ice, beyond on floor stops', ['@~cc_'], R, {'2,0':'~','3,0':'~'}, '_@cc_'.replace('_@cc_','_@cc_'));
t('big ball slides into snow wall: stops', ['@3~~~5'], R, {}, '_@~~35');
t('ball 4 slides into snow wall: stops', ['@4~~5'], R, {}, '_@~45');
t('small ball slides into snow wall: absorbed', ['@2~~5'], R, {}, '_@~~5');
t('push big ball into snow wall (no ice)', ['@35'], R, {}, '_@5');
// ---- water ----
function tw(name, lines, d, expectP, expectSplash) {
  let p = -1; lines = lines.map((l, y) => { const x = [...l].indexOf('@'); if (x >= 0) { p = y * [...l].length + x; return l.replace('@', '_'); } return l; });
  const l = lvl(lines); const L = E.build(l.W, l.H, l.terr, l.obj); const r = E.step(L, p, L.obj, d);
  const got = r ? `p=${r.p} splash=${r.splash ? r.splash.cell : '-'}` : 'p=x splash=-';
  const want = `p=${expectP} splash=${expectSplash}`;
  console.log(name.padEnd(44), got + (got === want ? ' ✓' : ' ✗ expected ' + want));
}
tw('walk into water: splash, stay', ['@≈'], R, 0, 1);
tw('slide on ice into water: splash, stop on ice', ['@~~≈'], R, 2, 3);
tw('crate cannot be pushed into water', ['@c≈'], R, 'x', '-');
