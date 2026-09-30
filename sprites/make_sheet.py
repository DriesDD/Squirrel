# Spritesheet v2: 128x128, 8x8 per slot, single-pixel detail, random variants.
from PIL import Image, ImageDraw, ImageFont
import json, random
rnd = random.Random(417)
sheet = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
SPR = {}
def hexc(c): return tuple(int(c[i:i+2], 16) for i in (1, 3, 5)) + (255,)
def put(name, col, row, px):   # px: 8x8 list of '#rrggbb' or None
    for y in range(8):
        for x in range(8):
            if px[y][x]: sheet.putpixel((col * 8 + x, row * 8 + y), hexc(px[y][x]))
    SPR[name] = [col, row]
def blank(): return [[None] * 8 for _ in range(8)]
def fill(c): return [[c] * 8 for _ in range(8)]
def pick(weights):  # [(color, weight)]
    r = rnd.random() * sum(w for _, w in weights)
    for c, w in weights:
        r -= w
        if r <= 0: return c
    return weights[-1][0]

# ---------- soil floor (dark brown) ----------
SOIL = '#3a2a1e'; SOIL_D = '#312318'; SOIL_L = '#443222'; SOIL_DD = '#281c13'; PEB = '#58422e'; PEB_D = '#2e2117'
def soil():
    g = [[pick([(SOIL, 70), (SOIL_D, 14), (SOIL_L, 12), (SOIL_DD, 4)]) for x in range(8)] for y in range(8)]
    for _ in range(rnd.choice([0, 1, 1, 2])):          # a pebble or two
        x, y = rnd.randrange(8), rnd.randrange(7)
        g[y][x] = PEB; g[y + 1][x] = PEB_D
    return g
# ---------- packed dirt wall ----------
DIRT = '#7b5a3c'; DIRT_D = '#6c4e33'; DIRT_L = '#8a6746'; DIRT_H = '#9a7550'; STONE = '#a3896a'; STONE_D = '#6a5642'; ROOT = '#5a3e27'
FACE = '#654830'; FACE_D = '#583f29'; FACE_DD = '#4c3523'; FACE_L = '#72523a'
def dirt():
    g = [[pick([(DIRT, 60), (DIRT_D, 18), (DIRT_L, 16), (DIRT_H, 6)]) for x in range(8)] for y in range(8)]
    if rnd.random() < .6:                               # embedded stone
        x, y = rnd.randrange(7), rnd.randrange(7)
        g[y][x] = STONE; g[y][x + 1] = STONE; g[y + 1][x + 1] = STONE_D
    if rnd.random() < .35:                              # little root
        x, y = rnd.randrange(1, 7), rnd.randrange(6)
        g[y][x] = ROOT; g[y + 1][x + rnd.choice([-1, 1])] = ROOT
    return g
def dirt_face():
    g = dirt()
    for y in range(5, 8):
        for x in range(8):
            base = [FACE_L, FACE, FACE_D][y - 5]
            g[y][x] = pick([(base, 75), (FACE_D if y < 7 else FACE_DD, 18), (FACE_L, 7)])
    for x in range(8):                                  # vertical streaks on the face
        if rnd.random() < .3: g[6][x] = g[7][x] = FACE_DD
    return g
# ---------- ice ----------
ICE = '#25424b'; ICE_M = '#2d515c'; ICE_C = '#3f7382'; ICE_S = '#a6d6e2'
def ice():
    g = [[pick([(ICE, 80), (ICE_M, 20)]) for x in range(8)] for y in range(8)]
    x, y = rnd.randrange(2, 8), rnd.randrange(0, 5)       # a diagonal crack/glint
    for k in range(rnd.randint(2, 4)):
        if 0 <= x - k < 8 and y + k < 8: g[y + k][x - k] = ICE_C
    g[y][x] = ICE_S
    if rnd.random() < .5: g[rnd.randrange(8)][rnd.randrange(8)] = ICE_S
    return g
# ---------- snow ground ----------
SNOW = '#e6eef0'; SNOW_S = '#d6e1e4'; SNOW_D = '#b9ccd2'; SPARK = '#ffffff'
def snow():
    g = [[pick([(SNOW, 72), (SNOW_S, 20), (SNOW_D, 5), (SPARK, 3)]) for x in range(8)] for y in range(8)]
    return g

for v in range(8): put(f'floor{v}', v, 0, soil())
for v in range(8): put(f'wall{v}', 8 + v, 0, dirt())
for v in range(8): put(f'wallface{v}', v, 1, dirt_face())
for v in range(4): put(f'ice{v}', 8 + v, 1, ice())
for v in range(4): put(f'snow{v}', 12 + v, 1, snow())

# ---------- gapped walls (row 2): dirt with a soil channel, index = open sides ----------
for m in range(16):
    g = dirt(); s = soil()
    def carve(x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): g[y][x] = s[y][x]
    carve(2, 2, 5, 5)
    if m & 1: carve(2, 0, 5, 1)
    if m & 2: carve(6, 2, 7, 5)
    if m & 4: carve(2, 6, 5, 7)
    if m & 8: carve(0, 2, 1, 5)
    put(f'gap{m}', m, 2, g)

# ---------- rails (row 3): steel rail on wooden ties ----------
R_L = '#8b999d'; R_D = '#56646a'; TIE = '#4a3525'
def rail(h=None, v=None):
    g = blank()
    if h:
        x0, x1 = h
        for x in range(x0, x1 + 1):
            if x in (1, 5): g[2][x] = TIE; g[5][x] = TIE
            g[3][x] = R_L; g[4][x] = R_D
    if v:
        y0, y1 = v
        for y in range(y0, y1 + 1):
            if y in (1, 5): g[y][2] = TIE; g[y][5] = TIE
            g[y][3] = R_L; g[y][4] = R_D
    return g
put('rail_h', 0, 3, rail(h=(0, 7))); put('rail_v', 1, 3, rail(v=(0, 7))); put('rail_x', 2, 3, rail(h=(0, 7), v=(0, 7)))
put('rail_n', 3, 3, rail(v=(0, 4))); put('rail_e', 4, 3, rail(h=(3, 7)))
put('rail_s', 5, 3, rail(v=(3, 7))); put('rail_w', 6, 3, rail(h=(0, 4)))
# ---------- sliding doors: riveted steel plate, half a tile thick ----------
D_H = '#d3e0ec'; D_L = '#b3c5d6'; D = '#9fb3c8'; D_D = '#7a8ea4'; D_DD = '#5f7289'; RIV = '#e8f0f7'
g = blank()
for x in range(8):
    g[2][x] = D_H; g[3][x] = D_L; g[4][x] = D; g[5][x] = D_DD
for x in (1, 6): g[3][x] = RIV; g[4][x] = D_D
g[3][3] = g[4][3] = D_D                                  # seam
put('door_h', 7, 3, g)
g = blank()
for y in range(8):
    g[y][2] = D_H; g[y][3] = D_L; g[y][4] = D; g[y][5] = D_DD
for y in (1, 6): g[y][3] = RIV; g[y][4] = D_D
g[3][3] = g[3][4] = D_D
put('door_v', 8, 3, g)
# ---------- crate: planks, gaps, nails ----------
W_L = '#dcaa74'; W = '#c28b55'; W_D = '#a8723f'; GAP = '#7a4f28'; NAIL = '#5a3a1c'
put('crate', 9, 3, [
    [W_L, W_L, W_L, W_L, W_L, W_L, W_L, W],
    [W_L, NAIL, W, W, W, W, NAIL, W_D],
    [GAP, GAP, GAP, GAP, GAP, GAP, GAP, GAP],
    [W_L, W, W, W_D, W, W, W, W_D],
    [W, W, W_D, W, W, W_L, W, W_D],
    [GAP, GAP, GAP, GAP, GAP, GAP, GAP, GAP],
    [W_L, NAIL, W, W, W_D, W, NAIL, W_D],
    [W_D, W_D, W_D, W_D, W_D, W_D, W_D, W_D]])
# ---------- port letters (designer) ----------
def glyph(rows, c):
    g = blank()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == '#': g[y][x] = c
    return g
put('port_s', 10, 3, glyph(['........', '..####..', '..#.....', '..####..', '.....#..', '..####..', '........', '........'], '#6fc7e0'))
put('port_f', 11, 3, glyph(['........', '..####..', '..#.....', '..###...', '..#.....', '..#.....', '........', '........'], '#7fd18b'))

# ---------- snowballs (row 4): lit from the top-left ----------
B_HI = '#ffffff'; B = '#e6eef0'; B_S = '#c9d7db'; B_D = '#a4bac2'
def ball(r, cx=3.5, cy=3.5):
    g = blank()
    for y in range(8):
        for x in range(8):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy <= r * r:
                t = (dx + dy) / (r * 1.4)
                g[y][x] = B_D if t > .55 else B_S if t > .15 else B
    hx, hy = round(cx - r * .45), round(cy - r * .45)
    if r > 1.5: g[hy][hx] = B_HI
    return g
for i, r in enumerate([1.3, 2.0, 2.8, 3.7]): put(f'ball{i+1}', i, 4, ball(r))
sw = [[pick([(B, 70), (B_S, 20), (B_HI, 10)]) for x in range(8)] for y in range(8)]
for y in range(5, 8):
    for x in range(8): sw[y][x] = pick([(B_S if y < 7 else B_D, 80), (B_D, 20)])
put('snowwall', 4, 4, sw)
# ---------- gate / exit floor ----------
def marked(base, dark, light):
    return [[pick([(base, 70), (dark, 20), (light, 10)]) for x in range(8)] for y in range(8)]
put('gate0', 5, 4, marked('#e0a340', '#c48a2c', '#eeb85c')); put('gate1', 6, 4, marked('#e0a340', '#c48a2c', '#eeb85c'))
put('exit0', 7, 4, marked('#7fd18b', '#62b36f', '#9be2a5')); put('exit1', 8, 4, marked('#7fd18b', '#62b36f', '#9be2a5'))

# ---------- squirrel (rows 5-7): down, side (facing right), up; frame 0 standing, 1-3 running ----------
SQ = {'.': None, 'O': '#c76b2c', 'o': '#8a4418', 'T': '#e8914a', 't': '#b35a20', 'B': '#f2dcb6', 'K': '#1e1612', 'N': '#e7a08a'}
E8 = '........'
def sq(rows): return [[SQ[ch] for ch in r] for r in rows]
def frames(tops, legs, bob):
    out = []
    for f in range(4):
        body = tops[f] + legs[f]
        if bob[f]: body = body[1:] + [E8]
        out.append(sq(body))
    return out
DOWN_A = ['.o..o...', '.OOOO.T.', '.KOOK.TT', '.OBNO.tT', '..OO..tT', '.OBBO.t.']
DOWN_B = ['.o..o...', '.OOOO..T', '.KOOK.TT', '.OBNO.tT', '..OO..tT', '.OBBO.t.']
DOWN_LEGS = [['.OBBOt..', '.o..o...'], ['.OBBOt..', '.o......'], ['.OBBOt..', '..o..o..'], ['.OBBOt..', '....o...']]
for f, g in enumerate(frames([DOWN_A, DOWN_B, DOWN_A, DOWN_B], DOWN_LEGS, [0, 1, 0, 1])): put(f'sq_down{f}', f, 5, g)
SIDE_A = ['.TT..o..', 'TTtT.OO.', 'Tt.tOOKO', 'T..tOOON', '.TtOOBO.', '..tOOBO.']
SIDE_B = ['..TT.o..', '.TTtTOO.', 'Tt.tOOKO', 'T..tOOON', '.TtOOBO.', '..tOOBO.']
SIDE_LEGS = [['...OOOo.', '...o..o.'], ['..OOOOo.', '.o.....o'], ['...OOOo.', '....oo..'], ['..OOOOo.', '..o...o.']]
for f, g in enumerate(frames([SIDE_A, SIDE_B, SIDE_A, SIDE_B], SIDE_LEGS, [0, 1, 0, 1])): put(f'sq_side{f}', f, 6, g)
UP_A = ['..o..o..', '..OOOO..', '..OOOO..', '.TTOOTT.', 'TTtTTtTT', 'TTTtTTTT']
UP_B = ['..o..o..', '..OOOO..', '..OOOO..', '..TTOTTT', '.TTtTTtT', '.TTTtTTT']
UP_LEGS = [['.TTTTTT.', '..o..o..'], ['.TTTTTT.', '..o.....'], ['..TTTTTT', '..o..o..'], ['.TTTTTT.', '.....o..']]
for f, g in enumerate(frames([UP_A, UP_A, UP_B, UP_A], UP_LEGS, [0, 1, 0, 1])): put(f'sq_up{f}', f, 7, g)

sheet.save('spritesheet.png')
json.dump(SPR, open('sprites.json', 'w'), separators=(',', ':'))

Z = 6; cell = 8 * Z; lab = 14
guide = Image.new('RGBA', (16 * cell, 16 * (cell + lab)), (17, 23, 26, 255))
dr = ImageDraw.Draw(guide)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 9)
except Exception: font = ImageFont.load_default()
big = sheet.resize((128 * Z, 128 * Z), Image.NEAREST)
names = {tuple(v): k for k, v in SPR.items()}
for row in range(16):
    for col in range(16):
        x, y = col * cell, row * (cell + lab)
        dr.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(28, 37, 40, 255) if (row + col) % 2 else (24, 32, 35, 255))
        guide.alpha_composite(big.crop((col * cell, row * cell, col * cell + cell, row * cell + cell)), (x, y))
        n = names.get((col, row), f'{col},{row}')
        dr.text((x + 2, y + cell + 1), n, fill=(230, 225, 214, 255) if (col, row) in names else (90, 105, 108, 255), font=font)
guide.save('spritesheet-guide.png')
print(len(SPR), 'sprites')
