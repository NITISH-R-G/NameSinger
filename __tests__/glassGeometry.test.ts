import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const KT = 'modules/refractive-glass/android/src/main/java/expo/modules/refractiveglass';
const kt = (f: string) => read(`${KT}/${f}`);

const view = kt('RefractiveGlassView.kt');
const shape = kt('GlassShape.kt');
/** The AGSL source only: the shader string inside Refractor. */
const shader = view.slice(view.indexOf('private const val SOURCE = """'), view.lastIndexOf('"""'));

describe('glass geometry: one definition for the silhouette, the clip, the shadow and the outline', () => {
  it('the shader takes its silhouette, normals and rim from one exact rounded-box distance', () => {
    expect(shader).toContain('float sdRoundBox(float2 p, float2 hs, float r)');
    expect(shader).toContain('min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r');
    // defined once, used for the silhouette (1) and the four taps of the normal (4)
    expect(shader.match(/sdRoundBox\(/g)).toHaveLength(1 + 5);
  });

  it('has no squircle approximation: that shape could not match the clip, the shadow or the React border', () => {
    // the code only: the comment that records why the squircle was removed is allowed to name it
    const shaderCode = shader.replace(/\/\/.*$/gm, '');
    expect(shaderCode).not.toMatch(/sdSquircle|squircle/i);
    // the p-norm used pow() and log2(); the exact distance needs neither
    expect(shaderCode).not.toMatch(/\bpow\(/);
    expect(shaderCode).not.toMatch(/\blog2\(/);
  });

  it('documents why the distance changed, so the departure from the earlier shader is on record', () => {
    expect(view).toMatch(/CHANGED \(phase 1, geometry consistency\)/);
    expect(view).toMatch(/Every other calculation in this shader is unchanged/);
  });

  it('the native clip and the shader radius come from the same GlassShape', () => {
    expect(view).toContain('shape.set(w.toFloat(), h + extra, radius)');
    expect(view).toContain('applyUniforms(p, d, w, h, extra, shape.radius)');
    expect(view).toContain('canvas.clipPath(shape.path)');
    // only GlassShape builds the outline; nothing else may build a second one
    expect(view).not.toMatch(/addRoundRect/);
    expect(shape).toMatch(/path\.addRoundRect\(rect, radius, radius, Path\.Direction\.CW\)/);
  });

  it('limits the radius the way CSS and React Native limit a border radius: never more than half the width or height', () => {
    expect(shape).toContain('minOf(requestedRadiusPx, widthPx / 2f, heightPx / 2f)');
  });

  it('the React shadow and border use the same radius the native pane receives', () => {
    const surface = read('src/components/glass/GlassSurface.tsx');
    expect(surface).toContain('cornerRadius={radius}');
    expect(surface).toMatch(/borderTopLeftRadius: radius,/);
    expect(surface).toMatch(/borderTopRightRadius: radius,/);
    // a sheet is round at the top only, and its native shape reaches below the screen edge so the bottom is never round
    expect(surface).toMatch(/borderBottomLeftRadius: topOnly \? 0 : radius,/);
    expect(surface).toContain('extendBottom={topOnly ? 96 : 0}');
    // the shadow is drawn on the same view that carries the radius, not on a separate shape
    expect(surface).toMatch(/<View style=\{\[corners, shadow, style\]\}>\s*\{\/\*[^]*?<RefractiveGlassView/);
  });

  describe('the distance function is zero on the clip outline and signs the inside and outside correctly', () => {
    // A TypeScript port of sdRoundBox, checked against the Kotlin text above, then evaluated on the outline of
    // GlassShape's rounded rectangle for each shape the app draws (sizes in dp x 2.625, the emulator density).
    const sdRoundBox = (px: number, py: number, hx: number, hy: number, r: number) => {
      const qx = Math.abs(px) - hx + r;
      const qy = Math.abs(py) - hy + r;
      return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    };
    const effectiveRadius = (w: number, h: number, r: number) => Math.max(0, Math.min(r, w / 2, h / 2));
    const DENSITY = 2.625;
    const shapes: Array<[string, number, number, number]> = [
      ['composer field', 320, 48, 26],
      ['settings sheet (extended below the screen)', 360, 520 + 96, 30],
      ['confirm dialog card', 300, 200, 28],
      ['toolbar pill', 160, 48, 999],
    ];

    it.each(shapes)('%s', (_name, wDp, hDp, rDp) => {
      const w = wDp * DENSITY;
      const h = hDp * DENSITY;
      const r = effectiveRadius(w, h, rDp * DENSITY);
      const hx = w / 2;
      const hy = h / 2;
      // the outline: four straight edges and four circular arcs of radius r, exactly what Path.addRoundRect draws
      const outline: Array<[number, number]> = [];
      for (let t = 0; t <= 1; t += 0.05) {
        outline.push([-hx + r + t * (w - 2 * r), -hy], [-hx + r + t * (w - 2 * r), hy]);
        outline.push([-hx, -hy + r + t * (h - 2 * r)], [hx, -hy + r + t * (h - 2 * r)]);
      }
      for (let a = 0; a <= 90; a += 5) {
        const c = Math.cos((a * Math.PI) / 180) * r;
        const s = Math.sin((a * Math.PI) / 180) * r;
        outline.push([hx - r + c, hy - r + s], [-hx + r - c, hy - r + s], [hx - r + c, -hy + r - s], [-hx + r - c, -hy + r - s]);
      }
      for (const [x, y] of outline) expect(Math.abs(sdRoundBox(x, y, hx, hy, r))).toBeLessThan(1e-6);
      expect(sdRoundBox(0, 0, hx, hy, r)).toBeLessThan(0);
      expect(sdRoundBox(hx + 2, 0, hx, hy, r)).toBeGreaterThan(0);
      // at a corner the distance is Euclidean: a point 3 px outside the arc, along its diagonal, is 3 px away
      if (r > 3 && r < Math.min(hx, hy)) {
        const k = Math.SQRT1_2;
        expect(sdRoundBox(hx - r + (r + 3) * k, hy - r + (r + 3) * k, hx, hy, r)).toBeCloseTo(3, 6);
      }
    });
  });
});

describe('glass instrumentation is development-only and removable (phase 2)', () => {
  const control = kt('GlassDevControl.kt');
  const registry = kt('GlassRegistry.kt');

  it('does nothing unless the app is a debuggable build', () => {
    expect(control).toContain('FLAG_DEBUGGABLE');
    expect(control).toMatch(/if \(!debuggable\) return/);
    // the check comes before anything is started or read
    expect(control.indexOf('if (!debuggable) return')).toBeLessThan(control.indexOf('handler.post(tick)'));
  });

  it('is marked temporary and says how to remove it', () => {
    expect(control).toMatch(/TEMPORARY, development only/);
    expect(control).toMatch(/To remove it: delete this file/);
  });

  it('is started from one place in the module', () => {
    const module = kt('RefractiveGlassModule.kt');
    expect(module.match(/GlassDevControl\./g)).toHaveLength(1);
  });

  it('glass is on by default, and only the dev control can switch it', () => {
    expect(registry).toMatch(/@Volatile var enabled = true/);
    const writers = fs
      .readdirSync(path.join(root, KT))
      .filter((f) => f.endsWith('.kt'))
      .filter((f) => /GlassStats\.enabled\s*=[^=]/.test(kt(f)));
    expect(writers).toEqual(['GlassDevControl.kt']);
  });

  it('adds no debugging UI and no JavaScript hook: the app never imports the dev control or the measurement scripts', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`;
        return e.isDirectory() ? walk(rel) : /\.(tsx?|json)$/.test(e.name) ? [rel] : [];
      });
    for (const f of [...walk('src'), 'app.json', 'package.json']) {
      expect(read(f)).not.toMatch(/GlassDevControl|glass-dev\.cmd|glass-perf|visual-regression/);
    }
  });
});
