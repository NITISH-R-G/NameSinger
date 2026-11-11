"""Decode an MP3 and report duration, level and per-second RMS (proves the file is real, non-silent audio)."""
import sys
import av
import numpy as np

path = sys.argv[1]
c = av.open(path)
s = c.streams.audio[0]
parts = [f.to_ndarray() for f in c.decode(audio=0)]
a = np.concatenate(parts, axis=1).astype(np.float32)
if abs(a).max() > 1.5:
    a = a / 32768.0
print("sample rate", s.rate, "channels", s.channels, "duration s", round(a.shape[1] / s.rate, 2),
      "peak", round(float(abs(a).max()), 3), "rms", round(float(np.sqrt((a ** 2).mean())), 4))
sec = s.rate
rms = [round(float(np.sqrt((a[:, i * sec:(i + 1) * sec] ** 2).mean())), 3) for i in range(a.shape[1] // sec)]
print("rms per second:", rms)
print("silent seconds:", sum(1 for x in rms if x < 0.005))
