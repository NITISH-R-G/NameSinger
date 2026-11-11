#!/usr/bin/env python3
"""TEMPORARY development tool: measures what the native glass costs, glass off versus glass on.

It drives a debuggable NameSinger build on an emulator or device over adb. It needs the dev control that
lives in modules/refractive-glass (GlassDevControl.kt, removable, debug builds only) and nothing else. Needs Python 3 and Pillow (`pip install pillow`) for the screenshot checks.

Scene measured: the main screen with the Settings sheet open, so the grouped toolbar, the composer and the
Settings sheet are all glass at once. The orb animates behind them, so the page redraws continuously.

Per run and per condition (glass OFF, glass ON, alternating) it records
  * the module's own counters (page recording, pane recording, pane draw, total glass time) from GlassStats,
  * every frame's timing from `dumpsys gfxinfo ... framestats` (polled and de-duplicated over the window),
  * Android's own frame summary (`gfxinfo`: total frames, janky frames, percentiles),
  * memory from `dumpsys meminfo`.

Before running: start the emulator, start Metro for the project (`npx expo start --dev-client`) and run
`adb reverse tcp:8081 tcp:8081`. Metro must be up before the app launches.

  python scripts/dev/glass-perf.py --label A --runs 3 --seconds 30 --out <folder>

Frame times from an emulator describe that emulator's GPU path, not a phone. Compare conditions with each
other, not with a device.
"""
import argparse, json, os, re, statistics, subprocess, sys, time

VSYNC_MS = 1000.0 / 60.0


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import emulator as em  # noqa: E402  (shared adb/screenshot helpers; see emulator.py)
from emulator import adb, PKG  # noqa: E402


def open_scene_once():
    """Fresh launch, enter the conversation, open Settings: toolbar + composer + sheet are all on screen."""
    em.launch(fresh=True)
    em.enter_main()
    em.open_settings()


def open_scene(attempts=3):
    """open_scene_once, then PROVE the scene is what we think: three native panes registered (toolbar, composer, sheet).
    A run where the glass fell back to the blur renderer, or the sheet is not open, would measure nothing."""
    last = None
    for _ in range(attempts):
        try:
            open_scene_once()
            n = counters().get("glassCount")
            if n is not None and n >= 3:
                return
            last = f"only {n} native glass panes registered (expected 3)"
        except RuntimeError as e:
            last = str(e)
        print("scene check failed:", last, "- relaunching", flush=True)
    raise RuntimeError(f"could not set up the measurement scene: {last}")


# ---------------------------------------------------------------- dev control (command file + logcat)
_seq = [int(time.time()) % 100000]


def control(enabled, action):
    _seq[0] += 1
    seq = _seq[0]
    content = f"enabled={1 if enabled else 0} seq={seq} action={action}"
    adb("shell", f"run-as {PKG} sh -c 'echo \"{content}\" > cache/glass-dev.cmd'")
    return seq


def wait_log(pattern, timeout=8):
    end = time.time() + timeout
    while time.time() < end:
        out = adb("logcat", "-d", "-s", "GlassDev:I", check=False)
        m = re.search(pattern, out)
        if m:
            return m
        time.sleep(0.4)
    raise RuntimeError(f"no log line matching {pattern!r} (is this a debuggable build with GlassDevControl?)")


def counters():
    seq = control(_state["enabled"], "dump")
    m = wait_log(rf"stats seq={seq} (\{{.*\}})")
    return json.loads(m.group(1))


_state = {"enabled": True}


def set_glass(enabled):
    _state["enabled"] = enabled
    adb("logcat", "-c", check=False)
    control(enabled, "reset")
    wait_log(r"reset seq=")
    time.sleep(1.0)  # the toggle redraws every pane once


# ---------------------------------------------------------------- gfxinfo framestats
def read_frames(seen):
    out = adb("shell", "dumpsys", "gfxinfo", PKG, "framestats", check=False)
    m = re.search(r"---PROFILEDATA---\n(.*?)---PROFILEDATA---", out, re.S)
    if not m:
        return 0
    lines = [l for l in m.group(1).strip().split("\n") if l.strip()]
    header = lines[0].rstrip(",").split(",")
    ix = {name: i for i, name in enumerate(header)}
    added = 0
    for line in lines[1:]:
        cols = line.rstrip(",").split(",")
        if len(cols) < len(header):
            continue
        try:
            flags = int(cols[ix["Flags"]])
            intended = int(cols[ix["IntendedVsync"]])
            done = int(cols[ix["FrameCompleted"]])
            gpu = int(cols[ix["GpuCompleted"]]) if "GpuCompleted" in ix else 0
        except (ValueError, KeyError):
            continue
        if flags & 1 or intended in seen or done <= intended:  # bit 0: layout pass, not a normal frame
            continue
        total = (done - intended) / 1e6
        with_gpu = (max(done, gpu) - intended) / 1e6 if gpu > intended else total
        seen[intended] = (total, with_gpu)
        added += 1
    return added


def summary_gfx():
    out = adb("shell", "dumpsys", "gfxinfo", PKG, check=False)
    def num(pat):
        m = re.search(pat, out)
        return float(m.group(1)) if m else None
    return {
        "totalFrames": num(r"Total frames rendered: (\d+)"),
        "jankyFrames": num(r"Janky frames: (\d+)"),
        "p50ms": num(r"50th percentile: (\d+)ms"),
        "p90ms": num(r"90th percentile: (\d+)ms"),
        "p95ms": num(r"95th percentile: (\d+)ms"),
        "p99ms": num(r"99th percentile: (\d+)ms"),
    }


def pct(values, p):
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


def frame_stats(seen):
    t = [v[0] for v in seen.values()]
    g = [v[1] for v in seen.values()]
    return {
        "frames": len(t),
        "meanMs": statistics.fmean(t) if t else None,
        "p50Ms": pct(t, 50), "p90Ms": pct(t, 90), "p95Ms": pct(t, 95), "p99Ms": pct(t, 99), "maxMs": max(t) if t else None,
        "gpuP50Ms": pct(g, 50), "gpuP95Ms": pct(g, 95),
        "over16_7": sum(1 for x in t if x > VSYNC_MS),
        "over33_3": sum(1 for x in t if x > 2 * VSYNC_MS),
    }


# ---------------------------------------------------------------- memory
def meminfo():
    out = adb("shell", "dumpsys", "meminfo", PKG, check=False)
    def kb(label):
        m = re.search(rf"^\s*{label}:?\s+(\d+)", out, re.M)
        return int(m.group(1)) if m else None
    total = re.search(r"^\s*TOTAL PSS:\s+(\d+)", out, re.M) or re.search(r"^\s*TOTAL\s+(\d+)", out, re.M)
    return {
        "totalPssKb": int(total.group(1)) if total else None,
        "javaHeapKb": kb("Java Heap"), "nativeHeapKb": kb("Native Heap"), "graphicsKb": kb("Graphics"),
        "codeKb": kb("Code"), "stackKb": kb("Stack"),
    }


# ---------------------------------------------------------------- one measurement window
def measure(enabled, seconds):
    set_glass(enabled)
    adb("shell", "dumpsys", "gfxinfo", PKG, "reset", check=False)
    mem_before = meminfo()
    seen = {}
    end = time.time() + seconds
    while time.time() < end:
        read_frames(seen)
        time.sleep(1.0)
    read_frames(seen)
    stats = counters()
    return {
        "glass": "ON" if enabled else "OFF",
        "counters": stats,
        "frames": frame_stats(seen),
        "gfxinfoSummary": summary_gfx(),
        "memBefore": mem_before,
        "memAfter": meminfo(),
    }


def median(rows, getter):
    vals = [getter(r) for r in rows if getter(r) is not None]
    return statistics.median(vals) if vals else None


def report(results):
    def fmt(v, d=2):
        return "-" if v is None else (f"{v:.{d}f}" if isinstance(v, float) else str(v))
    cols = [
        ("frames", lambda r: r["frames"]["frames"], 0),
        ("frame p50 ms", lambda r: r["frames"]["p50Ms"], 2),
        ("frame p95 ms", lambda r: r["frames"]["p95Ms"], 2),
        ("frame p99 ms", lambda r: r["frames"]["p99Ms"], 2),
        ("frame max ms", lambda r: r["frames"]["maxMs"], 1),
        ("> 16.7 ms", lambda r: r["frames"]["over16_7"], 0),
        ("> 33.3 ms", lambda r: r["frames"]["over33_3"], 0),
        ("gfxinfo janky", lambda r: r["gfxinfoSummary"]["jankyFrames"], 0),
        ("pane draws", lambda r: r["counters"]["paneDraws"], 0),
        ("pane draw avg ms", lambda r: r["counters"]["paneDrawAvgMs"], 3),
        ("pane draw max ms", lambda r: r["counters"]["paneDrawMaxMs"], 2),
        ("page rec n", lambda r: r["counters"]["pageRecordings"], 0),
        ("page rec avg ms", lambda r: r["counters"]["pageRecordAvgMs"], 3),
        ("pane rec avg ms", lambda r: r["counters"]["paneRecordAvgMs"], 3),
        ("glass total ms", lambda r: r["counters"]["glassTotalMs"], 0),
        ("total PSS MB", lambda r: (r["memAfter"]["totalPssKb"] or 0) / 1024, 1),
        ("graphics MB", lambda r: (r["memAfter"]["graphicsKb"] or 0) / 1024, 1),
        ("native heap MB", lambda r: (r["memAfter"]["nativeHeapKb"] or 0) / 1024, 1),
    ]
    print("\nmedian over runs" + "".join(f"   [{c}]" for c in ("OFF", "ON")))
    for name, getter, d in cols:
        row = []
        for c in ("OFF", "ON"):
            rows = [r for r in results if r["glass"] == c]
            row.append(fmt(median(rows, getter), d) if rows else "-")
        print(f"  {name:20} OFF {row[0]:>10}   ON {row[1]:>10}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--label", required=True, help="name for this build, e.g. A or B")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--seconds", type=int, default=30)
    ap.add_argument("--out", required=True)
    ap.add_argument("--conditions", default="OFF,ON", help="comma list, alternated each run")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    conds = [c.strip().upper() == "ON" for c in a.conditions.split(",")]
    info = {
        "device": adb("shell", "getprop", "ro.product.model").strip(),
        "android": adb("shell", "getprop", "ro.build.version.release").strip(),
        "sdk": adb("shell", "getprop", "ro.build.version.sdk").strip(),
        "density": adb("shell", "wm", "density").strip(),
        "size": adb("shell", "wm", "size").strip(),
        "label": a.label, "seconds": a.seconds, "runs": a.runs,
        "startedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    print(json.dumps(info))
    open_scene()
    results = []
    for run in range(a.runs):
        for enabled in conds:
            r = measure(enabled, a.seconds)
            r["run"] = run + 1
            results.append(r)
            f = r["frames"]
            print(f"run {run + 1} glass {r['glass']:3}: {f['frames']} frames, p50 {f['p50Ms']:.1f} ms, p95 {f['p95Ms']:.1f} ms, "
                  f"pane draw avg {r['counters']['paneDrawAvgMs']:.3f} ms, PSS {(r['memAfter']['totalPssKb'] or 0) / 1024:.0f} MB", flush=True)
    set_glass(True)
    with open(os.path.join(a.out, f"perf-{a.label}.json"), "w", encoding="utf-8") as fh:
        json.dump({"info": info, "results": results}, fh, indent=1)
    report(results)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
