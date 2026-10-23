"""Draws mac/icon-1024.png, the OpenSig app icon: a blue circle with a faint grid and a white decaying wave, on a soft
shadow. build-mac.sh turns it into OpenSig.icns. The Windows icon (desktop/build.ps1) is drawn the same way.
Needs Pillow: python -m pip install pillow; run: python mac/make-icon.py"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

N, K = 1024, 4                       # final size, supersampling factor
S = N * K
cx = cy = S / 2
R = 0.405 * S                        # circle radius (leaves room for the shadow, like other macOS icons)

def wave(t):                         # one and a half cycles of a decaying wave (as in the Windows icon), t in 0…1
    return (0.2 + 0.6 * t) * S, (0.5 - 0.22 * math.sin(3 * math.pi * t) * math.exp(-0.98 * t)) * S

# shadow
shadow = Image.new('L', (S, S), 0)
ImageDraw.Draw(shadow).ellipse([cx - R, cy - R + 0.012 * S, cx + R, cy + R + 0.012 * S], fill=110)
shadow = shadow.filter(ImageFilter.GaussianBlur(0.014 * S))
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
img.paste(Image.new('RGBA', (S, S), (0, 0, 0, 255)), (0, 0), shadow)

# blue gradient disc
top, bottom = (42, 116, 232), (12, 52, 150)
grad = Image.new('RGBA', (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    f = min(1, max(0, (y - (cy - R)) / (2 * R)))
    gd.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * f) for a, b in zip(top, bottom)) + (255,))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
img.paste(grad, (0, 0), mask)

# faint grid inside the disc
grid = Image.new('RGBA', (S, S), (0, 0, 0, 0))
g = ImageDraw.Draw(grid)
for f in (0.3, 0.5, 0.7):
    g.line([(f * S, 0), (f * S, S)], fill=(255, 255, 255, 34), width=round(0.004 * S))
    g.line([(0, f * S), (S, f * S)], fill=(255, 255, 255, 34), width=round(0.004 * S))
img.paste(grid, (0, 0), Image.composite(grid, Image.new('RGBA', (S, S), (0, 0, 0, 0)), mask))

# the wave: a white stroke with round ends, drawn as closely spaced round dabs (wide polylines get ragged joints)
d = ImageDraw.Draw(img)
r = 0.023 * S
for i in range(3001):
    x, y = wave(i / 3000)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 255))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon-1024.png')
img.resize((N, N), Image.LANCZOS).save(out)
print('wrote', out)
