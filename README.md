# Squirrel (Twenty-Five Rooms)

A top-down puzzle game in plain HTML and JavaScript. A squirrel moves through a 5 × 5 maze of rooms,
pushing crates, sliding doors along rails, sliding across ice and rolling snowballs to find the way out.

- `index.html` is the game.
- `designer.html` is the level designer. It has two modes:
  - **Rooms**: design the 25 rooms of the world by hand (20 × 20 tiles each; neighbouring rooms share their
    outer row of tiles). Stamp in puzzle components (rotated or mirrored), set the player start and the exit,
    optionally check a route between a test start `s` and test finish `f`, and play-test across rooms.
    Work is saved in the browser automatically; **Copy world** exports it as JSON.
  - **Component**: build a single puzzle piece, let the solver check both directions and the difficulty,
    and export it for the library in `src/library.js`.

Both pages are single self-contained files, so they work straight from disk or on GitHub Pages.

## Project layout

| Path | What it is |
| --- | --- |
| `src/engine.js` | Rules engine shared by game and designer: movement, pushing, ice, snow, and the solver. |
| `src/comp.js` | Reads components from their ASCII maps and produces the 8 rotations/mirrors. |
| `src/library.js` | The component library (ASCII maps + solver metadata). |
| `src/world.js`, `src/roomgen.js` | Seeded maze and procedural room generation (the game's current mode). |
| `src/main.js` | Game UI, rendering and input. |
| `src/sprites.template.js` | Sprite renderer; the build fills in the sheet and its map. |
| `src/game.template.html`, `src/designer.template.html` | Page markup and styles for the two pages. |
| `sprites/spritesheet.png` | The 128 × 128 spritesheet (16 × 16 slots of 8 × 8). Edit this. |
| `sprites/sprites.json` | Sprite names → `[column, row]` slots. |
| `sprites/spritesheet-guide.png` | The sheet enlarged with every slot labelled. |
| `sprites/make_sheet.py` | Generates the default sheet, map and guide (needs Pillow). |
| `tests/` | Node scripts that check the rules, the library and room generation. |

## Building

```sh
python3 build.py
```

This inlines the scripts and the spritesheet into `index.html` and `designer.html`.
After editing `sprites/spritesheet.png` by hand, keep each sprite in its slot (or update `sprites/sprites.json`)
and run the build again. Both pages can also load an edited sheet at runtime with **Load spritesheet**.

## Tests

```sh
node tests/rules.js                 # push, ice and snowball rules on small cases
node tests/library-orientations.js  # every library piece solves the same in all 8 orientations
node tests/room-objects.js          # generated rooms never place objects on invalid tiles
node tests/room-generation.js       # stress test of procedural rooms (slow)
```

## Tile characters

Terrain: `w` wall · `_` floor · `o` gapped wall · `-` `|` `+` rails · `~` ice · `h` `v` `x` ice with rails ·
`e` exit · `s` `f` test start/finish.
Objects: `c` crate · `=` `║` sliding doors · `*` snow · `1`–`5` snowball sizes (5 is a snow wall).
Objects standing on something other than plain floor record the tile underneath in `under`.
