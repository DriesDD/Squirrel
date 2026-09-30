#!/usr/bin/env python3
"""Builds the two self-contained pages from src/ and sprites/:
   index.html     the game
   designer.html  the room + component designer
Run:  python3 build.py
"""
import base64, os
ROOT = os.path.dirname(os.path.abspath(__file__))
src = lambda *p: os.path.join(ROOT, *p)
read = lambda p: open(p, encoding='utf-8').read()

def module(name):
    # drop the Node export line so the file can be inlined in a <script>
    return '\n'.join(l for l in read(src('src', name)).split('\n') if not l.startswith('if (typeof module'))

sheet = 'data:image/png;base64,' + base64.b64encode(open(src('sprites', 'spritesheet.png'), 'rb').read()).decode()
sprites = read(src('src', 'sprites.template.js')).replace('@@URI@@', sheet).replace('@@MAP@@', read(src('sprites', 'sprites.json')).strip())
engine, comp, library, world, roomgen = (module(n) for n in ['engine.js', 'comp.js', 'library.js', 'world.js', 'roomgen.js'])

game = read(src('src', 'game.template.html'))
game = game.replace('/*LIBS*/', '\n'.join([engine, sprites, comp, library, world, roomgen])).replace('/*MAIN*/', read(src('src', 'main.js')))
open(src('index.html'), 'w', encoding='utf-8').write(game)

designer = read(src('src', 'designer.template.html'))
designer = designer.replace('/*ENGINE*/', engine).replace('/*SPRITES*/', sprites).replace('/*COMP*/', comp).replace('/*LIB*/', library)
open(src('designer.html'), 'w', encoding='utf-8').write(designer)
print('built index.html and designer.html')
