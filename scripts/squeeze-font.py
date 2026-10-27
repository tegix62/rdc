# Narrows a static TrueType font by machine (x coordinates, advances and side
# bearings scaled), for the Cheltenham trial on the preview homepage: a fake
# condensed. Usage: python3 scripts/squeeze-font.py <fonttools-path> <in> <out> <factor>
import sys
sys.path.insert(0, sys.argv[1])
from fontTools.ttLib import TTFont
src, dst, sx = sys.argv[2], sys.argv[3], float(sys.argv[4])
t = TTFont(src)
glyf, hmtx = t['glyf'], t['hmtx']
for name in t.getGlyphOrder():
    g = glyf[name]
    if g.isComposite():
        for c in g.components:
            c.x = round(c.x * sx)
    elif g.numberOfContours > 0:
        g.coordinates.scale((sx, 1))
        g.coordinates.toInt()
    adv, lsb = hmtx[name]
    hmtx[name] = (round(adv * sx), round(lsb * sx))
for name in t.getGlyphOrder():
    glyf[name].recalcBounds(glyf)
    if glyf[name].numberOfContours != 0:
        hmtx[name] = (hmtx[name][0], glyf[name].xMin)
t['head'].recalc = True
for rec in t['name'].names:
    if rec.nameID in (1, 4, 16):
        rec.string = str(rec.toUnicode()) .replace('Cheltenham Classic', 'Cheltenham Classic Squeezed')
t.flavor = 'woff2'
t.save(dst)
