"""Measures where the record artwork's disc really is inside dial.png (centre and radii), to rotate it about its true centre."""
import numpy as np
from PIL import Image

im = Image.open(r"C:\Projects\Name singer\research-killa-yue\killa-yue\app\assets\skins\gold\dial.png").convert("RGBA")
a = np.array(im)
alpha = a[..., 3]
ys, xs = np.nonzero(alpha > 40)
print("size", im.size, "alpha bbox x", xs.min(), xs.max(), "y", ys.min(), ys.max())
cx_b, cy_b = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
print("bbox centre", cx_b, cy_b, "bbox radius x/y", (xs.max() - xs.min()) / 2, (ys.max() - ys.min()) / 2)
# centroid of opaque pixels
w = (alpha > 40).astype(float)
yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
print("alpha centroid", (xx * w).sum() / w.sum(), (yy * w).sum() / w.sum())
# radial profile of luminance along 8 directions from the bbox centre: where does the bright gold rim sit?
lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2])
for ang in range(0, 360, 45):
    t = np.deg2rad(ang)
    prof = []
    for r in range(0, 200):
        x, y = int(round(cx_b + r * np.cos(t))), int(round(cy_b + r * np.sin(t)))
        if 0 <= x < im.size[0] and 0 <= y < im.size[1] and alpha[y, x] > 40:
            prof.append(lum[y, x])
        else:
            prof.append(-1)
    edge = max(i for i, v in enumerate(prof) if v >= 0)
    face = [i for i, v in enumerate(prof) if 0 <= v < 40]
    print(f"angle {ang:3d}: outer edge r={edge}, dark-face r<= {max(face) if face else None}")
