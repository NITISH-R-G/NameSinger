import subprocess, numpy as np, wave
FF = r"C:\nsvid\ffmpeg.exe"; V = r"C:\nsvid\NameSinger-demo-v0.2.0.mp4"
subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", V, "-vn", "-ac", "1", "-ar", "16000", r"C:\nsvid\f\a.wav"])
w = wave.open(r"C:\nsvid\f\a.wav"); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float)
rms = [np.sqrt((a[int(i*1600):int((i+1)*1600)]**2).mean()) for i in range(len(a)//1600)]
W, H = 270, 480
p = subprocess.Popen([FF, "-hide_banner", "-loglevel", "error", "-i", V, "-vf", f"fps=10,scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
n = W*H*3; i = 0; rows = []
while True:
    b = p.stdout.read(n)
    if len(b) < n: break
    f = np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(int)
    r, g, bb = f[374, 135]
    gold = r > 190 and 150 < g < 215 and bb < 140
    rows.append(gold); i += 1
# state: 'gold at centre of the play/pause disc' = pause icon showing = playing
prev = None
for k, gold in enumerate(rows):
    t = k/10
    if not (32 <= t <= 62): continue
    loud = rms[k] > 600 if k < len(rms) else False
    s = (bool(gold), loud)
    if s != prev:
        print(f"{t:5.1f}s  pauseIconShown={gold}  audioLoud={loud}  rms={rms[k]:.0f}")
        prev = s
