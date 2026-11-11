"""One-off: Apache-2.0 for the NameSinger source; keep Expo (MIT) and other notices. Kept for provenance."""
import os, re, shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()
def wr(p, t):
    os.makedirs(os.path.dirname(os.path.join(ROOT, p)), exist_ok=True)
    open(os.path.join(ROOT, p), "w", encoding="utf-8", newline="\n").write(t)

expo_mit = rd("LICENSE")
assert "650 Industries" in expo_mit
wr("licenses/Expo-MIT.txt", expo_mit)                              # preserved verbatim
apache = rd("modules/killa-ui/LICENSE-Apache-2.0.txt")
assert "END OF TERMS AND CONDITIONS" in apache and "Version 2.0, January 2004" in apache
wr("LICENSE", apache)                                              # the official, unmodified text

# package.json licence field
pj = rd("package.json")
if '"license"' not in pj:
    pj = pj.replace('"version": "1.0.0",', '"version": "1.0.0",\n  "license": "Apache-2.0",', 1)
wr("package.json", pj)

head = """# NameSinger notices

## NameSinger source code
Copyright 2026 NITISH-R-G and NameSinger contributors.

The original NameSinger application source in this repository (everything under `src/`, `modules/yue-engine/` Kotlin and TypeScript,
`modules/killa-ui/src/`, `modules/killa-ui/android/.../KillaUiModule.kt`, `Waveform.kt`, `Vinyl.java`, `__tests__/`, `scripts/` and the
documentation) is licensed under the **Apache License, Version 2.0** (see [`LICENSE`](LICENSE)). Files that come from third parties keep their own
licences, listed below. Apache-2.0 applies to the source code only.

> **Not licensed by Apache-2.0: the YuE2 model weights.** They are a separate download, are not part of this repository and are licensed
> **CC BY-NC 4.0 (non-commercial only)**. A company needs a licence from the model authors before offering anything built on them commercially.
> The Apache licence on this application's source does **not** clear the complete product for commercial use.

"""
n = rd("NOTICE.md")
n = n.replace("# Third-party notices\n", "## Third-party components\n", 1)
if "## Expo" not in n:
    n += """
## Expo and the project template (MIT)
The project was created from the Expo template. Template-derived files and the Expo / React Native packages installed from npm remain under
their own licences (mostly MIT). The Expo licence text is kept verbatim in [`licenses/Expo-MIT.txt`](licenses/Expo-MIT.txt):
Copyright (c) 2015-present 650 Industries, Inc. (aka Expo). Other npm dependencies carry their own licence files in `node_modules`.

## Modifications to third-party material
- Killa YuE `Skin.java`, `Ui.java`, `StaffProgress.java`: reduced / adapted as listed in `modules/killa-ui/NOTICE.md`.
- Killa YuE engine libraries: unmodified. Typefaces: unmodified. Artwork: used as is, with the lettering covered by NameSinger's own `Vinyl.java` drawing.
"""
n = head + n
wr("NOTICE.md", n)
shutil.copy(os.path.join(ROOT, "NOTICE.md"), os.path.join(ROOT, "modules", "killa-ui", "android", "src", "main", "assets", "licenses", "NOTICE.md"))

# README licensing table
r = rd("README.md")
r = r.replace("| NameSinger application source (this repository) | MIT, see [`LICENSE`](LICENSE) |",
              "| NameSinger application source (this repository) | Apache License 2.0, see [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md). Source code only |")
wr("README.md", r)
print("done")
