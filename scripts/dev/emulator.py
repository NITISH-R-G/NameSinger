"""Emulator/device helpers shared by the development scripts (glass-perf.py, the visual regression tool).

Development tooling only: nothing in the app imports this. Needs Python 3 and Pillow (`pip install pillow`).

Screen state is read from screenshots, not from uiautomator: the orb animates forever, so the app never
reports idle and a uiautomator dump takes about a minute and returns nothing.
"""
import io, os, subprocess, time

PKG = "com.namesinger.app"
ADB = os.path.join(os.environ.get("ANDROID_HOME", os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk")), "platform-tools", "adb.exe")
if not os.path.exists(ADB):
    ADB = "adb"


def adb(*args, check=True, timeout=60):
    r = subprocess.run([ADB, *args], capture_output=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"adb {' '.join(args)} failed: {r.stderr.decode(errors='replace')[:300]}")
    return r.stdout.decode(errors="replace").replace("\r\n", "\n")  # adb shell on Windows ends lines with CRLF


def screen():
    from PIL import Image
    data = subprocess.run([ADB, "exec-out", "screencap", "-p"], capture_output=True, timeout=30).stdout
    return Image.open(io.BytesIO(data)).convert("RGB")


def region_change(a, b, box=(40, 700, 1040, 2000)):
    """Mean absolute difference (0..255) of a region between two screenshots, on a coarse grid."""
    from PIL import ImageChops, ImageStat
    d = ImageChops.difference(a.crop(box).resize((100, 130)), b.crop(box).resize((100, 130)))
    return sum(ImageStat.Stat(d).mean) / 3


def on_opening(img):
    """The opening screen shows the hint "Swipe up to enter" at the bottom: strong text contrast in this box.
    On the main screen the same box is part of the composer's empty field (contrast below about 60)."""
    lo, hi = img.crop((400, 2255, 680, 2312)).convert("L").getextrema()
    return hi - lo > 100


def on_main(img):
    """The main screen: the toolbar's three icons (strong contrast in the top-right box) AND the composer's placeholder
    text (contrast in the box at the bottom left). Either signal alone is fooled: the dev "Bundling..." banner that
    appears right after launch has white text in the toolbar box. Measured on screenshots of every state:
    main screens read 139+ and 98+; the opening screen 0 and 12-14; the bundling banner 191 and 0."""
    g = img.convert("L")
    t_lo, t_hi = g.crop((640, 170, 1020, 260)).getextrema()
    c_lo, c_hi = g.crop((90, 2225, 385, 2275)).getextrema()
    return (t_hi - t_lo) > 100 and (c_hi - c_lo) > 60


def wait_for(predicate, timeout, step=1.5):
    end = time.time() + timeout
    while time.time() < end:
        img = screen()
        if predicate(img):
            return img
        time.sleep(step)
    return None


def launch(fresh=True):
    if fresh:
        adb("shell", "am", "force-stop", PKG)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    if wait_for(lambda i: on_opening(i) or on_main(i), 120) is None:
        raise RuntimeError("the app never showed a screen (is Metro running, and was `adb reverse tcp:8081 tcp:8081` run?)")
    time.sleep(3)


def enter_main():
    """From the opening screen (or already on main) to the main screen."""
    if on_main(screen()):
        return
    for _ in range(6):  # the first swipes can be ignored while the app is still starting
        adb("shell", "input", "swipe", "540", "2100", "540", "800", "400")
        if wait_for(on_main, 9) is not None:
            time.sleep(6)  # the first message is spoken and animated
            return
    raise RuntimeError("could not reach the main screen")


def open_settings():
    """Tap the Settings button and confirm by what the screen does. The button's height depends on the
    status-bar inset, which has differed between launches."""
    before = screen()
    changes = []
    for y in (212, 147):
        adb("shell", "input", "tap", "963", str(y))
        time.sleep(4)
        changes.append(round(region_change(before, screen()), 2))
        if changes[-1] > 1.5:  # idle noise is about 0.2; a pale sheet in Light mode measures about 2.7
            time.sleep(2)
            return
    raise RuntimeError(f"could not open the Settings sheet (screen change after tapping was {changes}, needed > 1.5)")


def close_settings():
    adb("shell", "input", "tap", "975", "445")  # "Done"
    if wait_for(on_main, 10) is None:
        raise RuntimeError("the Settings sheet did not close")
    time.sleep(3)
