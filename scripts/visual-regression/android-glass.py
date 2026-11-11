#!/usr/bin/env python3
"""Visual regression check for the native glass on Android: toolbar, composer and Settings sheet, Light and Dark.

Development tooling, not part of the app. Needs Python 3 and Pillow, a running emulator or device with the debug
build, Metro serving the project, and `adb reverse tcp:8081 tcp:8081`.

  capture  drive the app and save full-screen screenshots:
             python scripts/visual-regression/android-glass.py capture --out <folder> [--repeats 2]
  compare  compare a candidate capture with a baseline, region by region:
             python scripts/visual-regression/android-glass.py compare --baseline <folder> --candidate <folder> [--diffs <folder>]

What is compared (all boxes are in pixels of a 1080 x 2400 screen, chosen to stay clear of the animated orb so the
comparison is deterministic):
  toolbar            the grouped toolbar (the glass pill with the three icons)
  composer           the composer's glass field and send button
  sheet-top-left     the Settings sheet's top-left corner and the page behind it
  sheet-top-right    the Settings sheet's top-right corner
  sheet-top-center   the sheet's top rim and drag handle

A region passes when its mean difference and its share of changed pixels are both within a limit. The limit is
the larger of the fixed tolerance and three times the noise measured between two captures of the SAME build
(`--repeats 2` stores a second capture), so the check never asks for more precision than the screen has.

Palette: the script does not change the orb colours; baseline and candidate must be captured with the same palette.
The theme (Light and Dark) is switched through the Settings sheet and put back to `--restore` at the end.
"""
import argparse, json, os, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dev"))
import emulator as em  # noqa: E402
from PIL import Image, ImageChops, ImageStat  # noqa: E402

REGIONS = {
    "toolbar": ("main", (600, 100, 1060, 330)),
    "composer": ("main", (20, 2150, 1060, 2340)),
    "sheet-top-left": ("sheet", (0, 300, 240, 560)),
    "sheet-top-right": ("sheet", (840, 300, 1080, 560)),
    "sheet-top-center": ("sheet", (240, 300, 840, 372)),
}
THEME_CHIP = {"light": (540, 732), "dark": (874, 732)}  # the Appearance chips at the top of the Settings sheet
EXPECTED_SIZE = (1080, 2400)


def mean_luma(img):
    return ImageStat.Stat(img.convert("L")).mean[0]


def set_theme(theme):
    x, y = THEME_CHIP[theme]
    em.adb("shell", "input", "tap", str(x), str(y))
    time.sleep(4)
    luma = mean_luma(em.screen())
    ok = luma > 120 if theme == "light" else luma < 110
    if not ok:
        raise RuntimeError(f"the {theme} theme did not take effect (screen mean luma {luma:.0f})")


def capture(out, repeats, restore):
    os.makedirs(out, exist_ok=True)
    em.launch(fresh=True)
    em.enter_main()
    img = em.screen()
    if img.size != EXPECTED_SIZE:
        raise RuntimeError(f"screen is {img.size}, the regions are defined for {EXPECTED_SIZE}")
    meta = {
        "device": em.adb("shell", "getprop", "ro.product.model").strip(),
        "sdk": em.adb("shell", "getprop", "ro.build.version.sdk").strip(),
        "density": em.adb("shell", "wm", "density").strip(),
        "capturedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "themes": {},
    }
    em.open_settings()
    for theme in ("light", "dark"):
        set_theme(theme)
        sheet_shots = []
        for k in range(repeats):
            shot = em.screen()
            if em.on_opening(shot):
                raise RuntimeError("the app is on its opening screen, not the Settings sheet; nothing was captured")
            shot.save(os.path.join(out, f"{theme}-sheet-{k}.png"))
            sheet_shots.append(shot)
            time.sleep(1.5)
        before_close = sheet_shots[-1]
        em.adb("shell", "input", "tap", "975", "445")  # Done
        time.sleep(4)
        if em.region_change(before_close, em.screen()) <= 1.5:
            raise RuntimeError("the Settings sheet did not close")
        for k in range(repeats):
            shot = em.screen()
            if not em.on_main(shot):
                raise RuntimeError("the main screen is not showing; nothing was captured")
            shot.save(os.path.join(out, f"{theme}-main-{k}.png"))
            time.sleep(1.5)
        meta["themes"][theme] = {"meanLuma": round(mean_luma(shot), 1)}
        if theme == "light":
            em.open_settings()  # back to the sheet for the dark pass
    # leave the app in the requested theme
    if restore != "dark":
        em.open_settings()
        set_theme(restore)
        em.adb("shell", "input", "tap", "975", "445")
    json.dump(meta, open(os.path.join(out, "meta.json"), "w", encoding="utf-8"), indent=1)
    print(f"captured {repeats} x 4 screenshots into {out}")


def metrics(a, b, box):
    d = ImageChops.difference(a.crop(box), b.crop(box))
    st = ImageStat.Stat(d)
    mean = sum(st.mean) / 3
    g = d.convert("L")
    hist = g.histogram()
    changed = sum(hist[25:]) / (g.size[0] * g.size[1])  # share of pixels that moved by more than 24 levels
    return mean, changed, d


def load(folder, theme, shot, k):
    p = os.path.join(folder, f"{theme}-{shot}-{k}.png")
    return Image.open(p).convert("RGB") if os.path.exists(p) else None


def compare(baseline, candidate, diffs, tol_mean, tol_changed):
    if diffs:
        os.makedirs(diffs, exist_ok=True)
    rows, failed = [], False
    for theme in ("light", "dark"):
        for name, (shot, box) in REGIONS.items():
            a, b = load(baseline, theme, shot, 0), load(candidate, theme, shot, 0)
            if a is None or b is None:
                raise RuntimeError(f"missing capture for {theme}-{shot}")
            mean, changed, d = metrics(a, b, box)
            a2 = load(baseline, theme, shot, 1)
            n_mean, n_changed = (metrics(a, a2, box)[:2]) if a2 is not None else (0.0, 0.0)
            lim_mean, lim_changed = max(tol_mean, 3 * n_mean), max(tol_changed, 3 * n_changed)
            ok = mean <= lim_mean and changed <= lim_changed
            failed |= not ok
            rows.append((theme, name, mean, changed, n_mean, n_changed, lim_mean, lim_changed, ok))
            if diffs:
                amp = d.point(lambda v: min(255, v * 8))
                amp.save(os.path.join(diffs, f"{theme}-{name}-diff.png"))
                w, h = a.crop(box).size
                sheet = Image.new("RGB", (w * 3 + 20, h), (255, 255, 255))
                sheet.paste(a.crop(box), (0, 0)); sheet.paste(b.crop(box), (w + 10, 0)); sheet.paste(amp, (2 * w + 20, 0))
                sheet.save(os.path.join(diffs, f"{theme}-{name}-side-by-side.png"))
    print(f"{'theme':6} {'region':18} {'mean diff':>10} {'changed':>9} {'noise mean':>11} {'noise chg':>10} {'limit mean':>11} {'limit chg':>10}  result")
    for theme, name, mean, ch, nm, nc, lm, lc, ok in rows:
        print(f"{theme:6} {name:18} {mean:10.3f} {ch * 100:8.3f}% {nm:11.3f} {nc * 100:9.3f}% {lm:11.3f} {lc * 100:9.3f}%  {'PASS' if ok else 'FAIL'}")
    print("\nOVERALL:", "FAIL" if failed else "PASS")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("capture")
    c.add_argument("--out", required=True)
    c.add_argument("--repeats", type=int, default=2)
    c.add_argument("--restore", choices=["light", "dark"], default="light", help="theme to leave the app in")
    p = sub.add_parser("compare")
    p.add_argument("--baseline", required=True)
    p.add_argument("--candidate", required=True)
    p.add_argument("--diffs")
    p.add_argument("--tol-mean", type=float, default=0.35, help="fixed limit on the mean abs difference (0..255)")
    p.add_argument("--tol-changed", type=float, default=0.004, help="fixed limit on the share of pixels that moved by > 24")
    a = ap.parse_args()
    try:
        if a.cmd == "capture":
            capture(a.out, a.repeats, a.restore)
            return 0
        return compare(a.baseline, a.candidate, a.diffs, a.tol_mean, a.tol_changed)
    except RuntimeError as e:
        print("ERROR:", e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
