package ai.jackknife.killayue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.os.SystemClock;
import android.view.View;

import java.util.Random;

/**
 * A vinyl record that spins like one. NameSinger code; it uses the rim of Killa YuE's record artwork (skins/gold/dial.png,
 * Apache-2.0, Copyright 2026 JackKnifeAI) and paints everything else itself, so no Killa lettering is shown.
 *
 * Layers, all the same square and drawn about one integer-snapped centre:
 *   1. static: the artwork's gold rim over a flat black face;
 *   2. rotating: the grooves (with a few dust glints so the turning can be seen) and the centre label with its cue mark;
 *   3. static: the gloss. Reflections on a real record stay where the light is while the disc turns under them.
 *
 * The angle comes from real elapsed time at a constant angular velocity (no per-frame steps, so no jitter). Speed changes ease in
 * and out like a platter; a stopped record stops drawing.
 */
public class Vinyl extends View {
    private static final float ART = 380f;       // dial.png is 380 x 380 and its disc is centred exactly
    private static final float FACE = 144f / ART; // radius of the playing surface, as a fraction of the picture
    private static final float LABEL = 46f / ART;

    private final Paint bmp = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private Bitmap base, spin, gloss;
    private int size, left, top;

    private float angle;      // degrees
    private float rate;       // degrees per second right now
    private float target;     // degrees per second wanted
    private long last;

    public Vinyl(Context c) {
        super(c);
        Skin.load(c);
        setLayerType(LAYER_TYPE_HARDWARE, null);
    }

    /** Degrees per second; 0 stops the record. 200 is the speed of a 33 rpm record. */
    public void setSpeed(float degreesPerSecond) {
        target = degreesPerSecond;
        last = 0;
        invalidate();
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        int s = (int) (Math.min(w, h) * 0.8f) & ~1; // 80% of the view (the glow needs room), even so the centre falls on a pixel edge
        if (s <= 0) return;
        size = s;
        left = (w - s) / 2;
        top = (h - s) / 2;
        base = buildBase(s);
        spin = buildSpin(s);
        gloss = buildGloss(s);
    }

    private Bitmap buildBase(int s) {
        Bitmap out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        c.drawBitmap(Skin.dial(), null, new RectF(0, 0, s, s), bmp);
        float cx = s / 2f, cy = s / 2f, r = FACE * s;
        p.setStyle(Paint.Style.FILL);
        p.setShader(new RadialGradient(cx, cy, r, new int[] {0xFF161616, 0xFF0C0C0C, 0xFF040404}, new float[] {0f, 0.7f, 1f},
                Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, r, p);
        p.setShader(null);
        return out;
    }

    private Bitmap buildSpin(int s) {
        Bitmap out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        float cx = s / 2f, cy = s / 2f, face = FACE * s, label = LABEL * s;
        float u = s / ART;
        Random rnd = new Random(7);
        p.setStyle(Paint.Style.STROKE);
        // grooves: fine concentric lines, a few with slightly lighter dust arcs
        int n = 0;
        for (float r = label + 7 * u; r < face - 2 * u; r += 2.6f * u, n++) {
            p.setStrokeWidth(Math.max(1f, 0.9f * u));
            p.setColor(((n % 5) == 0) ? 0x26FFFFFF : 0x0FFFFFFF);
            c.drawCircle(cx, cy, r, p);
            if (rnd.nextInt(9) == 0) {
                float start = rnd.nextFloat() * 360f, sweep = 6f + rnd.nextFloat() * 28f;
                p.setStrokeWidth(Math.max(1.2f, 1.4f * u));
                p.setColor(0x4DFFFFFF);
                c.drawArc(new RectF(cx - r, cy - r, cx + r, cy + r), start, sweep, false, p);
            }
        }
        // the centre label: gold, with a ring, tick marks and one cue mark so the turning reads at a glance
        p.setStyle(Paint.Style.FILL);
        p.setShader(new RadialGradient(cx - 9 * u, cy - 11 * u, label * 1.45f, new int[] {Skin.HI, Skin.ACCENT, Skin.LO},
                new float[] {0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, label, p);
        p.setShader(null);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2f * u);
        p.setColor(Skin.LO);
        c.drawCircle(cx, cy, label - 1f * u, p);
        p.setStrokeWidth(1.2f * u);
        p.setColor(0x66000000);
        c.drawCircle(cx, cy, label * 0.72f, p);
        for (int i = 0; i < 24; i++) {
            double a = Math.toRadians(i * 15.0);
            float r0 = label * 0.80f, r1 = label * (i % 6 == 0 ? 0.93f : 0.88f);
            p.setStrokeWidth((i % 6 == 0 ? 1.8f : 1.1f) * u);
            c.drawLine(cx + (float) Math.cos(a) * r0, cy + (float) Math.sin(a) * r0, cx + (float) Math.cos(a) * r1,
                    cy + (float) Math.sin(a) * r1, p);
        }
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF1A1206);
        double cue = Math.toRadians(-62);
        c.drawCircle(cx + (float) Math.cos(cue) * label * 0.50f, cy + (float) Math.sin(cue) * label * 0.50f, 4.2f * u, p);
        p.setColor(0xFF050505);
        c.drawCircle(cx, cy, 5.5f * u, p);
        // trim to the playing surface so nothing spills over the rim
        Path clip = new Path();
        clip.addCircle(cx, cy, face, Path.Direction.CW);
        Bitmap trimmed = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas tc = new Canvas(trimmed);
        tc.clipPath(clip);
        tc.drawBitmap(out, 0, 0, null);
        out.recycle();
        return trimmed;
    }

    private Bitmap buildGloss(int s) {
        Bitmap out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        float cx = s / 2f, cy = s / 2f, face = FACE * s;
        Path clip = new Path();
        clip.addCircle(cx, cy, face, Path.Direction.CW);
        c.clipPath(clip);
        p.setStyle(Paint.Style.FILL);
        // two soft wedges of light, fixed in space like the reflection of a window
        p.setShader(new SweepGradient(cx, cy, new int[] {0x00FFFFFF, 0x00FFFFFF, 0x36FFFFFF, 0x00FFFFFF, 0x00FFFFFF, 0x24FFFFFF, 0x00FFFFFF, 0x00FFFFFF},
                new float[] {0f, 0.06f, 0.11f, 0.17f, 0.52f, 0.60f, 0.68f, 1f}));
        c.drawCircle(cx, cy, face, p);
        // slight darkening toward the edge for depth
        p.setShader(new RadialGradient(cx, cy, face, new int[] {0x00000000, 0x00000000, 0x55000000}, new float[] {0f, 0.78f, 1f},
                Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, face, p);
        p.setShader(null);
        return out;
    }

    @Override
    protected void onDraw(Canvas c) {
        if (base == null) return;
        long now = SystemClock.uptimeMillis();
        float dt = last == 0 ? 0f : (now - last) / 1000f;
        if (dt > 0.5f) dt = 0f; // the screen was hidden: do not jump
        last = now;
        // ease toward the wanted speed (platter inertia), then advance by real elapsed time
        float k = 1f - (float) Math.exp(-dt * 3.5);
        rate += (target - rate) * k;
        if (target == 0f && Math.abs(rate) < 0.4f) rate = 0f;
        angle = (angle + rate * dt) % 360f;

        float cx = left + size / 2f, cy = top + size / 2f;
        // amber light behind the record, brighter while it turns
        float glowR = Math.min(size * 0.78f, Math.min(getWidth(), getHeight()) / 2f - 1f); // fades to nothing before the view edge (no square tint)
        int a = (int) (0x30 + 0x30 * Math.min(1f, Math.abs(rate) / 120f));
        p.setStyle(Paint.Style.FILL);
        p.setShader(new RadialGradient(cx, cy, glowR, (a << 24) | Skin.GLOW, Skin.glow(0), Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, glowR, p);
        p.setShader(null);

        c.drawBitmap(base, left, top, bmp);
        c.save();
        c.rotate(angle, cx, cy);
        c.drawBitmap(spin, left, top, bmp);
        c.restore();
        c.drawBitmap(gloss, left, top, bmp);

        if ((rate != 0f || target != 0f) && getVisibility() == VISIBLE) postInvalidateOnAnimation();
    }

    @Override
    protected void onDetachedFromWindow() {
        last = 0;
        super.onDetachedFromWindow();
    }
}
