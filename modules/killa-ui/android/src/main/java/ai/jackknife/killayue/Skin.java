package ai.jackknife.killayue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.LightingColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;

import java.io.InputStream;

/**
 * Killa YuE's look (Apache-2.0, Copyright 2026 JackKnifeAI), reduced for NameSinger to the built-in Killa Gold skin.
 * CHANGES from the original Skin.java: community skins (SkinPack), the other built-in skins and the page-background
 * drawables were removed; palette, staff measurements, artwork loading, typefaces and the Plate drawable are unchanged.
 */
public class Skin {
    // palette of Killa Gold (unchanged)
    public static int ACCENT = 0xFFE7BD61, HI = 0xFFFFE2A6, LO = 0xFF8F6A22, GLOW = 0xFFB347, TEXT = 0xFFE9E3D5, DIM = 0xFF9D988C,
            FAINT = 0xFF6E6552, EDGE = 0xFF54482D, OFF = 0xFF1C1912, DECK = 0xFF080909, CARD = 0xF20B0C0C, PILL = 0xFF0B0C0C;
    /** Titles and main buttons use the gel script. */
    public static final boolean SCRIPT_TITLES = true;
    /**
     * Staff image measurements in its own pixels: width, height, left cap, right cap,
     * channel left, right, top, bottom, where notes enter and leave, then the five line centres.
     */
    static float[] STAFF = {1027, 155, 172, 80, 34, 993, 21, 133, 176, 978, 37.4f, 53f, 68.5f, 84f, 100f};

    private static boolean loaded;
    private static Bitmap action, nav, staff, dial, round;
    private static final Bitmap[] notes = new Bitmap[6];
    private static Typeface script, text;

    public static synchronized void load(Context c) {
        if (loaded) return;
        try {
            action = bitmap(c, "btnA");
            nav = bitmap(c, "btnB");
            staff = bitmap(c, "staff");
            dial = withoutLettering(bitmap(c, "dial"));
            round = bitmap(c, "round");
            for (int i = 0; i < notes.length; i++) notes[i] = bitmap(c, "note" + (i + 1));
            script = Typeface.createFromAsset(c.getAssets(), "fonts/KillaGel-BoldScript.ttf");
            text = Typeface.createFromAsset(c.getAssets(), "fonts/KillaMeridian-Text.ttf");
            loaded = true;
        } catch (Exception e) {
            throw new IllegalStateException("The app's artwork is missing", e);
        }
    }

    /** The glow colour of the skin at the given opacity (0 to 255). */
    public static int glow(int alpha) {
        return (alpha << 24) | GLOW;
    }

    /** The highlight colour of the skin at the given opacity. */
    public static int hi(int alpha) {
        return (alpha << 24) | (HI & 0xFFFFFF);
    }

    /** The accent colour of the skin at the given opacity. */
    public static int accent(int alpha) {
        return (alpha << 24) | (ACCENT & 0xFFFFFF);
    }


    /**
     * NameSinger: Killa's record artwork has the Killa YuE lettering over the whole vinyl face. This paints a fresh vinyl face
     * (grooves and a sheen) and a plain gold centre label over it, inside the inner gold ring, and leaves the gold rims as they are.
     */
    private static Bitmap withoutLettering(Bitmap src) {
        Bitmap b = src.copy(Bitmap.Config.ARGB_8888, true);
        Canvas c = new Canvas(b);
        float cx = b.getWidth() / 2f, cy = b.getHeight() / 2f, k = b.getWidth() / 380f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float face = 142 * k;
        p.setShader(new android.graphics.RadialGradient(cx, cy, face, new int[] {0xFF151515, 0xFF0B0B0B, 0xFF050505},
                new float[] {0f, 0.7f, 1f}, android.graphics.Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, face, p);
        p.setShader(null);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, 1.1f * k));
        int n = 0;
        for (float r = 54 * k; r < face - 2 * k; r += 4.5f * k, n++) {
            p.setColor((n % 3 == 0) ? 0x2CFFFFFF : 0x12FFFFFF);
            c.drawCircle(cx, cy, r, p);
        }
        p.setStyle(Paint.Style.FILL);
        p.setShader(new android.graphics.SweepGradient(cx, cy, new int[] {0x00FFFFFF, 0x2EFFFFFF, 0x00FFFFFF, 0x00FFFFFF, 0x2EFFFFFF, 0x00FFFFFF},
                new float[] {0f, 0.07f, 0.15f, 0.5f, 0.57f, 0.65f}));
        c.drawCircle(cx, cy, face, p);
        p.setShader(new android.graphics.RadialGradient(cx - 10 * k, cy - 12 * k, 62 * k, new int[] {HI, ACCENT, LO},
                new float[] {0f, 0.55f, 1f}, android.graphics.Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, 46 * k, p);
        p.setShader(null);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2 * k);
        p.setColor(LO);
        c.drawCircle(cx, cy, 46 * k, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF050505);
        c.drawCircle(cx, cy, 6 * k, p);
        return b;
    }
    private static Bitmap bitmap(Context c, String name) throws Exception {
        InputStream in = c.getAssets().open("skins/gold/" + name + ".png");
        try {
            Bitmap b = BitmapFactory.decodeStream(in);
            if (b == null) throw new Exception(name + " is not a picture");
            return b;
        } finally {
            in.close();
        }
    }

    public static Bitmap round() { return round; }

    public static Bitmap dial() { return dial; }

    public static Bitmap staff() { return staff; }

    public static Bitmap note(int i) { return notes[i % notes.length]; }

    /** The face for titles and main buttons. */
    public static Typeface script() { return script; }

    public static Typeface text() { return text; }

    /** A button plate stretched to any width: the skin's main button, or its quieter sibling. */
    public static class Plate extends Drawable {
        private final boolean gold, sunk;
        private final Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        private boolean pressed;

        public Plate(boolean gold) {
            this(gold, false);
        }

        /** sunk: the plate held down, for the selected tab of a row: pushed in, darker, shaded under its top edge. */
        public Plate(boolean gold, boolean sunk) {
            this.gold = gold;
            this.sunk = sunk;
        }

        @Override
        public void draw(Canvas canvas) {
            Rect b = getBounds();
            if (sunk) {
                int in = Math.max(1, b.height() / 22);
                b = new Rect(b.left + in, b.top + in, b.right - in, b.bottom - in);
            }
            Bitmap bmp = gold ? action : nav;
            Rect s = new Rect(0, 0, bmp.getWidth(), bmp.getHeight());
            float scale = b.height() / (float) s.height();
            // the rounded, knurled ends keep their shape; only the plain middle stretches
            int capSrc = Math.round(s.height() * 0.54f);
            int capDst = Math.min((int) (capSrc * scale), b.width() / 2);
            p.setColorFilter(sunk ? new LightingColorFilter(0xFF8C8C8C, 0) : pressed ? new LightingColorFilter(0xFFFFFFFF, 0x00302410) : null);
            canvas.drawBitmap(bmp, new Rect(s.left, s.top, s.left + capSrc, s.bottom),
                    new Rect(b.left, b.top, b.left + capDst, b.bottom), p);
            canvas.drawBitmap(bmp, new Rect(s.left + capSrc, s.top, s.right - capSrc, s.bottom),
                    new Rect(b.left + capDst, b.top, b.right - capDst, b.bottom), p);
            canvas.drawBitmap(bmp, new Rect(s.right - capSrc, s.top, s.right, s.bottom),
                    new Rect(b.right - capDst, b.top, b.right, b.bottom), p);
            if (sunk) {  // the shadow of the rim on the pushed-in face
                Paint sh = new Paint(Paint.ANTI_ALIAS_FLAG);
                sh.setShader(new android.graphics.LinearGradient(0, b.top, 0, b.top + b.height() * 0.45f, 0x99000000, 0x00000000,
                        android.graphics.Shader.TileMode.CLAMP));
                float r = b.height() / 2f;
                canvas.drawRoundRect(new android.graphics.RectF(b.left + r * 0.35f, b.top + b.height() * 0.12f, b.right - r * 0.35f,
                        b.bottom - b.height() * 0.12f), r, r, sh);
            }
        }

        @Override
        public boolean isStateful() {
            return true;
        }

        @Override
        protected boolean onStateChange(int[] state) {
            boolean now = false;
            for (int i = 0; i < state.length; i++) if (state[i] == android.R.attr.state_pressed) now = true;
            if (now == pressed) return false;
            pressed = now;
            invalidateSelf();
            return true;
        }

        @Override
        public void setAlpha(int alpha) {
        }

        @Override
        public void setColorFilter(ColorFilter cf) {
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }
}
