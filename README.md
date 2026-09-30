# Squirrel

A top-down puzzle game in plain HTML and JavaScript. A squirrel explores a world of 5 × 5 rooms,
pushing crates, sliding doors along rails, sliding across ice and rolling snowballs to find the exit.

Open the pages straight from disk; there is no build step. Edit a file, then refresh.

- `index.html` plays the world in `data/world.js`.
- `designer.html` is the level designer, with two modes:
  - **Rooms**: design the 25 rooms by hand (20 × 20 tiles each; neighbouring rooms share their outer
    row of tiles). Stamp in components from the library (rotated or mirrored), set the player start and
    the exit, optionally check a route between a test start `s` and test finish `f`, and play-test the
    whole world. Work is saved in the browser as you go.
  - **Component**: build a single puzzle piece and let the solver check both directions and the difficulty.

## Putting your world in the game

In the designer's **World** panel, press **Download world.js** (or **Copy world**) and replace
`data/world.js` with it. Refresh `index.html` to play it. **Reload data/world.js** in the designer
loads the file back into the editor.

## Editing the graphics

All graphics are in `sprites/spritesheet.png`: 128 × 128 pixels, a grid of 16 × 16 slots of 8 × 8 sprites.
Edit it at 1:1 in any pixel editor (Aseprite, Piskel, GIMP, …), save, and refresh the page.
`SPRITE_MAP` at the top of `src/sprites.js` names each slot as `[column, row]`:

| Row | Slots |
| --- | --- |
| 0 | `floor0`–`floor7` (soil), `wall0`–`wall7` (top of a dirt wall) |
| 1 | `wallface0`–`wallface7` (wall with open floor below), `ice0`–`ice3`, `snow0`–`snow3` |
| 2 | `gap0`–`gap15`: gapped wall, numbered by which sides are open (1 up, 2 right, 4 down, 8 left, added up) |
| 3 | `rail_h`, `rail_v`, `rail_x`, `rail_n`, `rail_e`, `rail_s`, `rail_w` (half rails for gaps), `door_h`, `door_v`, `crate`, `port_s`, `port_f` (designer only) |
| 4 | `ball1`–`ball4`, `snowwall` (slot 4), `exit0`, `exit1` (slots 7–8) |
| 5–7 | squirrel facing down, sideways (right; left is mirrored) and up: frame 0 standing, 1–3 running |
| 8 | `water0`–`water3` (animation frames), `splash0`–`splash3` (ripple frames), `lilypad0`–`lilypad1`, `lilyleaves0`–`lilyleaves1`, `lilyflower` |
| 9 | `reeds0`–`reeds3`, `frog_jump0`–`frog_jump3` (sit, crouch, in the air, landing), `frog_swim0`–`frog_swim3` (all facing right) |
| 10 | `waterB0`–`waterB3` (second water animation), `dragonfly_sit0`–`dragonfly_sit3` (perched), `dragonfly_fly0`–`dragonfly_fly3` (flying); dragonfly directions are 0 up, 1 right, 2 down, 3 left |

Rows 11–15 and the other empty slots are free. Water, splash, frog and dragonfly frames are animation frames, not random variants.
Each water tile picks one of the two water animations (`WATER_SETS` in `src/sprites.js`) and may be mirrored, so the
surface doesn't repeat. The back and front halves of a reed tile pick their variants independently.
Animation speeds are at the top of `src/sprites.js` (`WATER_FRAME_MS`, `SPLASH_FRAME_MS`).
Anything in the water (the squirrel, frogs) is drawn with its lower part darkened and see-through; reeds are drawn
twice, shifted up behind whatever stands in them and shifted down in front of it. Numbered names are random variants of one sprite:
to add a variant, draw it in a free slot and add e.g. `floor8: [col, row]` to `SPRITE_MAP`.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `src/game.js` | The game: page and styles, and the game code. |
| `designer.html`, `src/designer.js` | The designer: page and styles, and the designer code. |
| `src/engine.js` | Rules shared by both: movement, pushing, ice, snow, and the solver. |
| `src/sprites.js` | Sprite map and renderer. |
| `src/comp.js` | Reads ASCII maps and makes the 8 rotations/mirrors of a component. |
| `src/npc.js` | NPCs that move on their own (frogs), shared by the game and the designer's play-test. |
| `src/library.js` | Component library. Paste components exported from Component mode here. |
| `data/world.js` | The world the game plays. |
| `sprites/spritesheet.png` | The spritesheet. |
| `tests/` | Node checks: `node tests/rules.js`, `node tests/library-orientations.js` (slow). |

## Map characters

Terrain: `w` wall · `_` floor · `o` gapped wall · `-` `|` `+` rails · `~` ice · `h` `v` `x` ice with rails ·
`≈` water · `e` exit · `s` `f` test start/finish (components and route checks only).
Overlays, drawn on another tile (water by default, floor for reeds; `under` records any other): `@` big lily pad
(walkable) · `%` small lily leaves (blocks) · `&` lily flower (blocks) · `;` reeds (walk through; they follow the rules
of the tile under them).
Objects: `c` crate · `=` `║` sliding doors · `*` snow · `1`–`5` snowball sizes (5 is a snow wall).
An object standing on something other than plain floor records the tile underneath in `under`.

## NPCs

The world file lists NPCs as `"npcs": [{ "type": "frog", "x": 42, "y": 44 }]` (world tile coordinates); place them
with the Frog and Dragonfly tools in the designer (room mode; click an NPC again to remove it).

- Frogs are passive: they hop between spots near water (2–4 tiles per jump on land) and swim a little, with long rests
  in between. They climb onto big lily pads, jump into the nearest water when you come within 6 tiles on land, and
  swim away (or dive) when you come within 3 tiles in the water. Tuning: the `FROG` object in `src/npc.js`.
- Dragonflies remember their home tile (put them on reeds). They sit near the top of it for a while, then pick a
  short line nearby that doesn't cross a wall, fly to its start, dart back and forth along it 1–3 times, and return
  to sit. They fly above everything, including the reeds. Tuning: the `DFLY` object in `src/npc.js`.

A new kind of NPC is a new entry in `BEHAVIOURS` there.

## Water

Nothing can be pushed into water. When the squirrel walks or slides into it, it splashes in and walks back out to the
tile it came from.
