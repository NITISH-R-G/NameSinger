# Glass geometry and instrumentation (Android native renderer)

Status: phase 1 (geometry consistency) and phase 2 (performance instrumentation). Applies to
`modules/refractive-glass`, the AGSL renderer used on Android 13 and up in a development build.

## 1. One shape for the silhouette, the clip, the shadow and the outline

A pane of glass has four things that must agree on where its edge is:

| What | Where | Shape it follows |
|---|---|---|
| silhouette, edge normals, rim highlight (the outline) | AGSL shader in `RefractiveGlassView.kt` | `sdRoundBox`, an exact rounded-rectangle distance |
| native clip of the drawn pane | `GlassShape.path` | a rounded rectangle, circular corners |
| shadow | `boxShadow` on the React view in `GlassSurface.tsx` | the view's `borderRadius`, circular corners |
| the radius the shader uses | `GlassShape.radius`, passed to the shader as a uniform | the requested radius, limited to half the width or height |

`GlassShape.kt` owns the clip and the effective radius, so the shader and the clip can no longer
disagree. `GlassSurface.tsx` passes the same `radius` to the native view (`cornerRadius`) and to its own
`borderRadius`. React Native on Android can only draw circular-corner borders and shadows, so a
circular-corner rectangle is the only shape all four can share.

### What changed in the shader, and why

Exactly one function: `sdSquircle` (a p-norm approximation of a continuous corner) became `sdRoundBox`
(`min(max(q.x, q.y), 0) + length(max(q, 0)) - r`). Every other calculation is unchanged.

- The squircle was this renderer's own addition. A cross-check of the Music OS 26 shaders found nothing like
  it: the reference geometry pass uses the same rounded-box distance (161 `length(max(...))` terms, no
  `pow()`), and its `squircleDist` is a `sqrt(sqrt(s))` easing term, not a corner shape. The reference also
  derives silhouette coverage (`geometryData.w`), height and rim from one geometry texture, which is the
  single-definition principle used here.
- The squircle could not match the clip, the shadow or the React border. Measured analytically, the two
  outlines differ by up to 1.72 px at the settings sheet's corners (30 dp radius), 1.60 px on the confirm
  dialog (28 dp), 0.37 px on the composer (26 dp, clamped to 24) and 0 px on the toolbar pill.

Visual effect of the change, measured on screenshots (see section 3): toolbar and composer pixel-identical;
the sheet's corner arcs moved by at most 1.7 px (Light) and the rim highlight along them by up to 5.7 px
(Dark); nothing else changed.

## 2. Performance instrumentation (temporary, development only)

`GlassDevControl.kt` exposes the module's counters and an on/off switch without any UI and without
JavaScript. It does nothing unless the app is a debuggable build. It polls one file in the app's own cache
directory every 500 ms and logs to logcat under the tag `GlassDev`:

```
adb shell run-as com.namesinger.app sh -c 'echo "enabled=1 seq=7 action=dump" > cache/glass-dev.cmd'
adb logcat -d -s GlassDev:I
```

`enabled=0` makes every pane skip refraction (glass off); `action=reset` zeroes the counters;
`action=dump` logs them as JSON. The counters (`GlassStats`): `paneDraws` and their average and maximum time
(everything `Refractor.draw` does, including renewing the page recording), `paneRecordings` (the pane's own
small recording), `pageRecordings` (the shared page recording), `glassTotalMs`, `failures`, `glassCount`.
They are UI-thread CPU times of this module's work; the GPU cost of the shader and blur is not included and
shows up in frame times instead.

`scripts/dev/glass-perf.py` drives the app (toolbar, composer and Settings sheet all on screen), alternates
glass off and on, and records the counters, per-frame timings from `dumpsys gfxinfo`, and `dumpsys meminfo`.
It refuses to measure unless three native panes are registered.

To remove all of it: delete `GlassDevControl.kt`, the one `GlassDevControl.start(...)` call in
`RefractiveGlassModule.kt`, the `GlassStats.enabled` check in `RefractiveGlassView.dispatchDraw`, and
`scripts/dev/glass-perf.py`. A test (`__tests__/glassGeometry.test.ts`) keeps it debug-only and out of the app.

## 3. Visual regression

`scripts/visual-regression/android-glass.py` captures the toolbar, composer and Settings sheet in Light and
Dark and compares a candidate with a baseline region by region. Regions avoid the animated orb. A region
passes when its mean difference and its share of changed pixels are within the larger of a fixed tolerance
and three times the noise measured between two captures of the same build.

```
python scripts/visual-regression/android-glass.py capture --out <folder> --repeats 2
python scripts/visual-regression/android-glass.py compare --baseline <a> --candidate <b> --diffs <folder>
```

A deliberate change to a shape fails the check where that shape is drawn. Review the diff images, then
re-capture the baseline from the new build.

## Limits

Measurements come from one emulator (Android 15, 1080 x 2400, 420 dpi, software-assisted GPU). They compare
glass off with glass on; they do not describe a phone. `dumpsys meminfo` reports no graphics memory on this
emulator. Frame time here is the latency from the intended vsync to frame completion.
