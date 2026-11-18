"""Regenerate optical alignment after font/data edits: pip install 'fonttools[woff]'."""
from pathlib import Path
import hashlib
import json
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
font_path = ROOT / 'api/fonts.woff2'
font = TTFont(font_path)
glyph_set, cmap = font.getGlyphSet(), font.getBestCmap()
upm = font['head'].unitsPerEm
# CSS line-height: 1 centers the font's ascender/descender inside an em cell.
baseline = (1 + (font['hhea'].ascent + font['hhea'].descent) / upm) / 2
names = json.loads((ROOT / 'api/colors.json').read_text())
characters = sorted(set(''.join(color['Name'] for color in names)))
metrics = {}
for character in characters:
    pen = BoundsPen(glyph_set)
    glyph_set[cmap[ord(character)]].draw(pen)
    x0, y0, x1, y1 = (value / upm for value in pen.bounds)
    # Keep natural proportions and small characters; only reduce oversized ink.
    scale = min(1, .96 / max(x1 - x0, y1 - y0))
    # These four generated, wide characters have a larger visual footprint.
    if character in '榲樫鈫鷃':
        scale = min(scale, .90 / (x1 - x0))
    x = scale * (.5 - (x0 + x1) / 2)
    y = scale * ((y0 + y1) / 2 - (baseline - .5))
    metrics[character] = [round(value, 5) for value in (scale, x, y)]

result = {'fontSha256': hashlib.sha256(font_path.read_bytes()).hexdigest(), 'glyphs': metrics}
target = ROOT / 'src/color-name-metrics.json'
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Wrote optical alignment for {len(metrics)} characters to {target}')
