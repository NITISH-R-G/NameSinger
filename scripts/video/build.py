import os, subprocess, sys

FF = r"C:\nsvid\ffmpeg.exe"
D = r"C:\nsvid"
SEG = os.path.join(D, "seg"); CAP = os.path.join(D, "cap")
os.makedirs(SEG, exist_ok=True); os.makedirs(CAP, exist_ok=True)
R1 = os.path.join(D, "raw3", "rec1.mp4"); R2 = os.path.join(D, "raw3", "rec2.mp4")
FONT = "C\\:/nsvid/KillaMeridian-Text.ttf"
SCRIPT = "C\\:/nsvid/KillaGel-BoldScript.ttf"
GOLD = "0xE7BD61"; TEXT = "0xE9E3D5"; DIM = "0x9D988C"
REAL_TIME = "3:56"   # read from the app's own 'made on this phone in 3:56' line
SPEED = 18

counter = [0]
def cap_file(txt):
    counter[0] += 1
    p = os.path.join(CAP, f"c{counter[0]}.txt")
    open(p, "w", encoding="utf-8", newline="").write(txt)
    return "C\\:/nsvid/cap/" + os.path.basename(p)

def dt(txt, size, color, y, t0, t1, font=FONT):
    return (f"drawtext=fontfile='{font}':textfile='{cap_file(txt)}':fontcolor={color}:fontsize={size}:"
            f"x=(w-text_w)/2:y={y}:enable='between(t,{t0:.2f},{t1:.2f})'")

def run(args):
    r = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y"] + args)
    if r.returncode:
        sys.exit("ffmpeg failed: " + " ".join(args)[:300])

def segment(name, src, ss, to, speed, caps, blur=None):
    """caps: list of (t0, t1, main, sub) relative to the OUTPUT segment; t1 None = whole segment."""
    out_dur = (to - ss) / speed
    base = f"fps=30,trim=start={ss}:end={to},setpts=(PTS-STARTPTS)/{speed}"   # CFR first, so idle (frame-less) stretches keep their length
    for k, (b0, b1, y0, h) in enumerate(blur or []):   # privacy: blur the share sheet's contact row (full-frame coordinates, output seconds)
        base += (f",split[a{k}][b{k}];[b{k}]crop=1080:{h}:0:{y0},gblur=sigma=45[bl{k}];"
                 f"[a{k}][bl{k}]overlay=0:{y0}:enable='between(t,{b0},{b1})'")
    vf = base + ",crop=1080:2185:0:135,fps=30,scale=780:1578:flags=lanczos,"
    vf += "pad=1080:1920:150:290:color=0x080909,drawbox=x=148:y=288:w=784:h=1582:color=0x8F6A22:t=2"
    for t0, t1, main, sub in caps:
        t1 = out_dur if t1 is None else t1
        if main == "__TITLE__":
            vf += "," + dt("NameSinger", 112, GOLD, 50, t0, t1, SCRIPT)
            vf += "," + dt(sub, 46, TEXT, 205, t0, t1)
            continue
        vf += "," + dt(main, 54, TEXT, 100, t0, t1)
        if sub:
            vf += "," + dt(sub, 34, DIM, 180, t0, t1)
    out = os.path.join(SEG, name + ".mp4")
    if os.path.exists(out): return out, out_dur
    run(["-i", src, "-vf", vf,
         "-r", "30", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "6M", "-bufsize", "12M",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", out])
    return out, out_dur

# ---- timeline (source times measured from the recording; see analyze.py output) ----
segs = []
def add(*a, **k):
    out, d = segment(*a, **k); segs.append((a[0], d)); return d

T = {}
T["s1"] = 0.0
d = add("s1", R1, 0.3, 14.0, 1.0, [
    (0.0, 4.7, "__TITLE__", "Type a name. Your phone sings it."),
    (4.9, None, "Type a name", "Pick an occasion and a style, then tap Generate"),
])
T["s2"] = T["s1"] + d
d = add("s2", R1, 14.0, 20.0, 1.0, [(0.0, None, "A song model runs on the phone", "No server. No account.")])
T["s3"] = T["s2"] + d
cap3 = [(0.0, None, f"Real time {REAL_TIME}  -  shown {SPEED}x faster", "Every stage is real: the staff, the notes and the record")]
d1 = add("s3a", R1, 20.0, 146.0, SPEED, cap3)
d2 = add("s3b", R1, 152.0, 180.3, SPEED, cap3)
d3 = add("s3c", R2, 0.0, 67.5, SPEED, cap3)
T["s4"] = T["s3"] + d1 + d2 + d3
# playback and actions: rec2 67.5 -> 102.4 (real time); caption windows relative to 67.5
P = 67.5
d = add("s4a", R2, P, 96.9, 1.0, [
    (0.0, 2.5, "Your song is ready", "Made on this phone"),
    (2.5, 4.8, "Pause", None),
    (4.8, 7.9, "Resume", None),
    (7.9, 17.6, "Tap the waveform to seek", None),
    (17.6, 23.2, "Replay", None),
    (23.2, 25.4, "Save to your Music folder", None),
    (25.4, None, "Saved to Music/NameSinger", None),
])
d_b = add("s4b", R2, 96.9, 101.4, 1.0, [(0.0, None, "Share with any app", "The Android share sheet")], blur=[(0.55, 1.5, 1745, 590), (1.5, 3.8, 1745, 290), (3.8, 4.6, 1745, 590)])
d_c = add("s4c", R2, 101.4, 102.4, 1.0, [(0.0, None, "Share with any app", None)])
T["s4_len"] = d + d_b + d_c
T["close"] = T["s4"] + T["s4_len"]

# ---- closing card (real wallpaper from the app + text) ----
CLOSE = 11.0
close_vf = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=-0.62,"
            + dt("NameSinger", 130, GOLD, 330, 0, CLOSE, SCRIPT)
            + "," + dt("Inference runs locally on Android", 52, TEXT, 600, 0, CLOSE)
            + "," + dt("github.com/NITISH-R-G/NameSinger", 50, GOLD, 900, 0.5, CLOSE)
            + "," + dt("APK: Releases, v0.2.0", 46, TEXT, 990, 0.5, CLOSE)
            + "," + dt("Prototype. Pronunciation varies by name.", 36, DIM, 1500, 0.5, CLOSE)
            + "," + dt("Model weights: CC BY-NC 4.0, non-commercial.", 36, DIM, 1560, 0.5, CLOSE)
            + f",fade=t=in:st=0:d=0.5,fade=t=out:st={CLOSE-0.5}:d=0.5")
if not os.path.exists(os.path.join(SEG,"close.mp4")): run(["-loop", "1", "-t", f"{CLOSE}", "-i", os.path.join(D, "wall.jpg"), "-vf", close_vf + ",fps=30", "-an", "-c:v", "libx264",
     "-preset", "medium", "-crf", "25", "-pix_fmt", "yuv420p", os.path.join(SEG, "close.mp4")])
segs.append(("close", CLOSE))
total = T["close"] + CLOSE

# ---- concatenate video ----
lst = os.path.join(D, "list.txt")
open(lst, "w").write("".join(f"file 'seg/{n}.mp4'\n" for n, _ in segs))
run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", os.path.join(D, "video_only.mp4")])

# ---- audio: the application's own MP3 at the moments the phone was playing, plus narration ----
SONG = os.path.join(D, "song_sam.mp3"); SONGLEN = 12.12
def at(src_t):             # output time of a rec2 source time inside the real-time playback segments
    return T["s4"] + (src_t - P)
pieces = []                # (input index, media_start, length, output_time, volume)
pieces.append((0, 0.0, 70.07 - 67.7, at(67.7), 0.95))
pieces.append((0, 70.07 - 67.7, 75.46 - 72.3, at(72.3), 0.95))
p_seek = SONGLEN - (84.6 - 75.46)
pieces.append((0, p_seek, 84.6 - 75.46, at(75.46), 0.95))
pieces.append((0, 0.0, 90.7 - 85.7, at(85.7), 0.95))
narr = [("n1", 0.25), ("n2", 5.0), ("n3", T["s2"] + 0.3), ("n5", at(90.95)), ("n6", T["close"] + 0.7)]
inputs = ["-i", SONG] + sum([["-i", os.path.join(D, "tts", n + ".wav")] for n, _ in narr], [])
fc = []; labels = []
for i, (idx, m0, ln, ot, vol) in enumerate(pieces):
    fc.append(f"[{idx}:a]atrim=start={m0:.3f}:end={m0+ln:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,"
              f"afade=t=in:d=0.03,afade=t=out:st={ln-0.03:.3f}:d=0.03,volume={vol},adelay={int(ot*1000)}|{int(ot*1000)}[s{i}]")
    labels.append(f"[s{i}]")
for j, (n, ot) in enumerate(narr):
    fc.append(f"[{j+1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0,adelay={int(ot*1000)}|{int(ot*1000)}[v{j}]")
    labels.append(f"[v{j}]")
fc.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest,apad=pad_dur=15[aout]")
run(inputs + ["-filter_complex", ";".join(fc), "-map", "[aout]", "-t", f"{total:.3f}", "-c:a", "aac", "-b:a", "160k", os.path.join(D, "audio.m4a")])

final = os.path.join(D, "NameSinger-demo-v0.2.0.mp4")
run(["-i", os.path.join(D, "video_only.mp4"), "-i", os.path.join(D, "audio.m4a"), "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "6M", "-bufsize", "12M", "-r", "30", "-fps_mode", "cfr", "-pix_fmt", "yuv420p", "-c:a", "copy", "-t", f"{total:.3f}",
     "-movflags", "+faststart", final])
print("total", round(total, 2), "s; offsets", {k: round(v, 2) for k, v in T.items()})
print("size MB", round(os.path.getsize(final) / 1048576, 1))
