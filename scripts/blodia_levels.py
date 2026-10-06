"""
Builds src/level/data/blodia.ts from path descriptions of the first 20
Blodia boards (shape only: every graphic stays PYRODIA's).

A board is a region map ('#' outside the board, 'o' tile, '.' the hole) plus
pipe paths. A path starts in a cell, entering through a side, follows moves
(N/E/S/W, wrapping around the edges) and leaves the last cell through a side.
Two paths through one cell are merged into a cross (X0) or a double arc (Z0/Z1).
"""
import json, sys

N, E, S, W = 1, 2, 4, 8
SIDE = {'N': N, 'E': E, 'S': S, 'W': W}
OPP = {N: S, S: N, E: W, W: E}
DELTA = {N: (0, -1), E: (1, 0), S: (0, 1), W: (-1, 0)}
SINGLE = {N | S: 'I0', E | W: 'I1', N | E: 'C0', E | S: 'C1', S | W: 'C2', W | N: 'C3'}

def build(lv):
    w, h = 14, 8
    region = lv['region']
    assert len(region) == h, (lv['id'], 'rows')
    segs = {}
    for p in lv['paths']:
        x, y, entry, moves, exit_ = p
        entry = SIDE[entry]
        cells = [(x, y)]
        for m in moves.replace(' ', ''):
            d = SIDE[m]
            dx, dy = DELTA[d]
            x, y = (x + dx) % w, (y + dy) % h
            cells.append((x, y))
        mv = [SIDE[m] for m in moves.replace(' ', '')]
        for i, c in enumerate(cells):
            a = entry if i == 0 else OPP[mv[i - 1]]
            b = SIDE[exit_] if i == len(cells) - 1 else mv[i]
            if a == b:
                raise SystemExit(f"L{lv['id']}: U-turn inside cell {c}")
            lst = segs.setdefault(c, [])
            used = 0
            for s in lst:
                used |= s
            if used & (a | b):
                raise SystemExit(f"L{lv['id']}: side reused in cell {c}: {lst} + {a|b}")
            lst.append(a | b)
    rows = []
    for yy in range(h):
        toks = []
        for xx in range(w):
            ch = region[yy][xx]
            if (xx, yy) in segs:
                if ch != 'o':
                    raise SystemExit(f"L{lv['id']}: pipe on a non-tile cell {(xx, yy)} ({ch})")
                lst = segs[(xx, yy)]
                if len(lst) == 1:
                    toks.append(SINGLE[lst[0]])
                else:
                    st = set(lst)
                    if st == {N | S, E | W}:
                        toks.append('X0')
                    elif st == {N | E, S | W}:
                        toks.append('Z0')
                    elif st == {E | S, W | N}:
                        toks.append('Z1')
                    else:
                        raise SystemExit(f"L{lv['id']}: impossible tile at {(xx, yy)}: {lst}")
            else:
                toks.append({'#': '##', 'o': '--', '.': '..'}[ch])
        rows.append(' '.join(toks))
    return rows

def R(*rows):
    return list(rows)

LEVELS = []
def level(id, name, region, paths, start, countdown=30, speed=1.0, hint=None, approx=False):
    LEVELS.append(dict(id=id, name=name, region=region, paths=paths, start=start, countdown=countdown,
                       speed=speed, hint=hint, approx=approx))

ALL = 'oooooooooooooo'
NONE = '##############'

# 1 - twin loops
level(1, 'Twin Loops', R(ALL, ALL, ALL, ALL, 'oooooo.ooooooo', ALL, ALL, ALL), [
    (6, 2, 'S', 'WWWSSSEEE', 'N'),
    (7, 2, 'S', 'EEESSSWWWNN', 'N'),
], (6, 2, 'S'), 30, 0.9,
    'Blodia rules: the flame must travel through EVERY pipe. Slide tiles into the black hole, even the one carrying the flame. TURBO starts early.')

# 2 - rails
level(2, 'Rails', R(NONE, NONE, NONE, ALL, 'oooooooooooo.o', ALL, NONE, NONE), [
    (0, 3, 'W', 'ES' + 'E' * 10, 'E'),
    (2, 3, 'W', 'E' * 9, 'E'),
    (13, 3, 'W', '', 'E'),
    (13, 4, 'W', '', 'E'),
    (0, 4, 'W', 'S' + 'E' * 9, 'E'),
    (11, 5, 'W', 'EE', 'E'),
], (2, 3, 'W'), 30, 0.9, 'A pipe that leaves one edge comes back on the opposite edge.')

# 3 - brackets
B3 = '####oooooo####'
M3 = '####oo##oo####'
level(3, 'Brackets', R(B3, B3, M3, M3, M3, M3, B3, '####oooo.o####'), [
    (6, 1, 'N', 'WSSSSSESWW' + 'N' * 7 + 'EE', 'S'),
    (9, 7, 'W', 'N' * 7 + 'WWSESSSSSWS', 'E'),
], (6, 1, 'N'), 80, 0.9, 'Travelled pipes glow orange; the counter shows how many are left.')

# 4 - diamond weave
level(4, 'Diamond Weave', R('######o#######', '#####ooo######', '###ooooooo####', '#ooooooooooo##',
                             '#ooooooooooo##', '###oo.oooo####', '#####ooo######', '######o#######'), [
    (5, 1, 'W', 'ENNNN', 'W'),
    (6, 1, 'S', 'ESEESEESWWSW', 'W'),
    (4, 5, 'E', 'WNWWNEENEEEESSSSWW', 'N'),
    (5, 2, 'N', 'SWWSEEEEEENWWWWS', 'S'),
], (5, 1, 'W'), 30, 0.9)

# 5 - pyramid
level(5, 'Pyramid', R(NONE, '######oo######', '#####oo.o#####', '####oooooo####', '###oooooooo###',
                       '##oooooooooo##', '##oooooooooo##', NONE), [
    (2, 6, 'E', 'NENENENENE', 'S'),
    (8, 2, 'W', 'SESESES' + 'WWWWW' + 'NN' + 'ES' + 'WWWW' + 'SEE', 'E'),
    (7, 3, 'N', 'ESESWNWNWN', 'E'),
    (5, 3, 'E', 'SEN', 'W'),
], (2, 6, 'E'), 30, 0.9)

# 6 - hook
R6 = '###oooooooo###'
level(6, 'Hook', R(R6, '###ooooo##o###', '###ooooo##o###', R6, R6, R6, '###o.oooooo###', R6), [
    (7, 1, 'E', 'S' * 6 + 'W' * 4 + 'N' * 4 + 'E' * 6, 'N'),
], (7, 3, 'N'), 30, 1.0)

# 7 - lattice (approximation)
R7 = '###oooooooo###'
level(7, 'Lattice', R(NONE, R7, R7, R7, R7, R7, '###ooo.oooo###', NONE), [
    (3, 2, 'W', 'N' + 'E' * 7 + 'S' * 5 + 'WWW', 'W'),
    (5, 6, 'E', 'WWNNNNEESEENEESSSWWNWWSWNNNN', 'N'),
    (6, 1, 'N', 'SSSS', 'S'),
    (8, 1, 'N', 'SSSSS', 'S'),
], (3, 2, 'W'), 20, 1.0, approx=True)

# 8 - open square
level(8, 'Open Square', R(NONE, '####o.oooo####', '####o####o####', '####o####o####', '####o####o####',
                           '####oooooo####', '####oooooo####', NONE), [
    (6, 1, 'W', 'EEE' + 'S' * 5, 'W'),
    (4, 1, 'E', 'S' * 5 + 'EEE', 'E'),
], (9, 1, 'W'), 30, 1.0)

# 9 - broken frame
R9 = '####oooooo####'
level(9, 'Broken Frame', R(NONE, R9, '####o.oooo####', R9, R9, R9, R9, NONE), [
    (4, 3, 'S', 'NNEEE', 'E'),
    (9, 1, 'W', 'S' * 5 + 'WW', 'W'),
    (8, 2, 'W', '', 'E'),
    (5, 4, 'N', 'SE', 'E'),
    (8, 5, 'N', '', 'S'),
], (5, 1, 'W'), 30, 1.0)

# 10 - snake (approximation)
R10 = '####oooooo####'
level(10, 'Snake', R(NONE, NONE, R10, R10, R10, '####oo.ooo####', NONE, NONE), [
    (9, 2, 'W', 'SWSESWNWNWSWWNENW', 'N'),
    (5, 2, 'N', 'ESWSS', 'E'),
    (7, 5, 'W', 'NW', 'S'),
    (7, 2, 'E', 'SEN', 'W'),
    (4, 4, 'W', 'SE', 'S'),
], (9, 2, 'W'), 40, 1.0, approx=True)

# 11 - steps
level(11, 'Steps', R('###oooooooo###', '##oooooooooo##', '#oooooooooooo#', ALL, ALL, ALL,
                      'oooooo##oooooo', 'oooo.####ooooo'), [
    (0, 5, 'W', 'E', 'E'), (2, 4, 'W', 'E', 'E'), (4, 3, 'W', 'E', 'E'), (6, 2, 'W', 'E', 'E'),
    (8, 3, 'W', 'E', 'E'), (10, 4, 'W', 'E', 'E'), (12, 5, 'W', 'E', 'E'),
], (0, 5, 'W'), 20, 1.1, 'Seven short rails and a lot of empty tiles: build the road as you go.')

# 12 - two hooks
R12 = '####oooooo####'
level(12, 'Two Hooks', R(NONE, R12, R12, R12, R12, R12, '####.ooooo####', NONE), [
    (4, 2, 'W', 'EESSWW', 'W'),
    (9, 3, 'E', 'WWSSEE', 'E'),
], (4, 2, 'W'), 30, 1.1)

# 13 - crossed frame
R13 = '###oooooooo###'
level(13, 'Crossed Frame', R('###.ooooooo###', R13, R13, '###ooo##ooo###', '###ooo##ooo###', R13, R13, R13), [
    (4, 1, 'N', 'S' * 6, 'E'),
    (3, 1, 'S', 'E' * 6, 'E'),
    (9, 0, 'W', 'S' * 6, 'S'),
    (4, 6, 'W', 'E' * 6, 'N'),
], (4, 1, 'N'), 30, 1.1)

# 14 - twin blocks (approximation)
R14 = '#oooooooooooo#'
level(14, 'Twin Blocks', R(R14, R14, R14, R14, '#oooooo.ooooo#', R14, R14, R14), [
    (1, 0, 'S', 'EEEEESSSWWWWWNN', 'N'),
    (1, 4, 'S', 'EEEEESSSWWWWWNN', 'N'),
    (3, 0, 'N', 'S' * 7, 'S'),
    (4, 0, 'N', 'S' * 7, 'S'),
    (8, 0, 'S', 'EEEESSSWWWWNN', 'N'),
    (8, 4, 'S', 'EEEESSSWWWWNN', 'N'),
    (10, 0, 'N', 'S' * 7, 'S'),
    (11, 0, 'N', 'S' * 7, 'S'),
    (7, 1, 'N', 'SS', 'S'),
    (7, 5, 'N', 'S', 'S'),
], (11, 3, 'N'), 30, 1.1, approx=True)

# 15 - clover
level(15, 'Clover', R(ALL, ALL, 'ooooooooo.oooo', ALL, ALL, 'ooooooo#oooooo', ALL, ALL), [
    (4, 3, 'W', 'NENWNWSWSES', 'E'),
    (0, 4, 'S', 'EESSSWNNW', 'N'),
    (3, 6, 'S', 'EESWW', 'N'),
    (3, 4, 'S', 'EEEENESENENNNESESWSESSSWNWWWSSWWNNWWW', 'N'),
], (4, 3, 'W'), 80, 1.1)

# 16 - knot (approximation)
C16 = '######oo######'
level(16, 'Knot', R(C16, C16, C16, '###oooooooo###', '###.ooooooo###', C16, C16, C16), [
    (6, 0, 'N', 'S' * 7, 'S'),
    (5, 4, 'S', 'EESSSSSSW', 'W'),
    (3, 3, 'W', 'EEEESEEE', 'E'),
    (7, 2, 'E', 'S', 'E'),
    (7, 5, 'W', '', 'E'),
], (7, 2, 'E'), 30, 1.2, approx=True)

# 17 - ring and arc
R17 = '###oooooooo###'
level(17, 'Ring and Arc', R(NONE, '###.ooooooo###', R17, '###ooo#oooo###', R17, R17, R17, NONE), [
    (4, 2, 'S', 'EEESESWSWWWNWNE', 'N'),
    (10, 2, 'E', 'SWSES', 'E'),
], (6, 2, 'E'), 30, 1.2)

# 18 - waves (approximation)
level(18, 'Waves', R(ALL, ALL, 'oooooooooo.ooo', ALL, ALL, ALL, ALL, ALL), [
    (1, 0, 'N', 'S' * 7, 'S'),
    (0, 1, 'W', 'EEEEEENES' + 'E' * 6, 'E'),
    (2, 0, 'N', 'SSEESENESENESEN', 'E'),
    (3, 4, 'S', 'E' * 7 + 'S' + 'W' * 7, 'N'),
    (0, 6, 'W', 'EESENEESENEESENEE', 'N'),
    (12, 7, 'S', 'ENNWNNNENN', 'N'),
], (12, 7, 'S'), 30, 1.2, approx=True)

# 19 - spiral
level(19, 'Spiral', R('oo.ooooooooooo', ALL, ALL, ALL, ALL, ALL, ALL, ALL), [
    (4, 4, 'W', 'EENESWSEENNNWWWSSSSEEEENNNNNWWWWWSSSSSSEEEEEEENNNNW' + 'S' * 7 + 'ENN', 'N'),
    (3, 6, 'E', 'WWSEE', 'E'),
], (10, 0, 'N'), 30, 1.2)

# 20 - propeller
C20 = '######oo######'
level(20, 'Propeller', R(C20, C20, C20, '#oooooooooooo#', '#ooooooo.oooo#', C20, C20, C20), [
    (6, 4, 'W', 'SSSENNN', 'E'),
    (5, 4, 'E', 'WWWWNEEEEENNNESSSEEEEESWWW', 'W'),
    (6, 3, 'E', 'SEN', 'W'),
], (6, 4, 'W'), 50, 1.2)

out = []
for lv in LEVELS:
    rows = build(lv)
    x, y, side = lv['start']
    d = {
        'id': lv['id'], 'name': lv['name'], 'width': 14, 'height': 8, 'win': 'cover',
        'start': {'x': x, 'y': y, 'from': side}, 'countdown': lv['countdown'],
        'flameSpeed': lv['speed'], 'timeLimit': 0, 'lookahead': 2, 'baseScore': 500 + lv['id'] * 50,
        'fuelPerTile': 0, 'rows': rows, 'scramble': '',
        'tags': ['blodia'] + (['approximation'] if lv['approx'] else []),
    }
    if lv['hint']:
        d['hint'] = lv['hint']
    out.append(d)

header = ("// AUTO-GENERATED by scripts/blodia_levels.py - edit the paths there, then run:\n"
          "//   python3 scripts/blodia_levels.py\n"
          "// Board shapes of the first 20 Blodia levels (layout only, PYRODIA graphics).\n"
          "import type { LevelDef } from '../LevelDef';\n\nexport const BLODIA_LEVELS: LevelDef[] = ")
with open('src/level/data/blodia.ts', 'w') as f:
    f.write(header + json.dumps(out, indent=2) + ';\n')
print('wrote', len(out), 'levels')
for d in out:
    print(f"#{d['id']} {d['name']}")
    for r in d['rows']:
        print('   ', r)
