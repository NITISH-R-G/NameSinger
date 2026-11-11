import subprocess, sys, json
import numpy as np

FF = r"C:\nsvid\ffmpeg.exe"
W, H, FPS = 270, 598, 10   # quarter resolution

def frames(path):
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = W * H * 3
    i = 0
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield i / FPS, np.frombuffer(b, np.uint8).reshape(H, W, 3)
        i += 1

def gold(px):
    r, g, b = [int(v) for v in px]
    return r > 190 and 150 < g < 215 and b < 140

def white_count(f, x0, y0, x1, y1):
    reg = f[y0:y1, x0:x1].astype(int)
    return int(((reg[..., 0] > 235) & (reg[..., 1] > 235) & (reg[..., 2] > 235)).sum())

rows = []
for t, f in frames(sys.argv[1]):
    pill = white_count(f, 80, 36, 200, 66) > 500            # 'Used for ...' pill (x 320-800, y 145-265 at full size)
    # play/pause disc: sample at y 1806/4, left ring x 470/4 and the gap between pause bars x 541/4
    disc = gold(f[451, 118]) and gold(f[451, 152])
    centre = f[451, 135]
    centre_gold = gold(centre)
    rows.append((round(t, 1), int(pill), int(disc), int(centre_gold)))
json.dump(rows, open(sys.argv[2], "w"))
print("frames", len(rows))
