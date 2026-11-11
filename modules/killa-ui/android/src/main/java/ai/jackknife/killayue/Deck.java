package ai.jackknife.killayue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.media.MediaPlayer;
import android.os.SystemClock;
import android.text.TextUtils;
import android.view.MotionEvent;
import android.view.View;

/**
 * The player deck of Killa YuE (Apache-2.0, Copyright 2026 JackKnifeAI), adapted from PlayerView.java.
 * CHANGES: the host MainActivity is replaced by this view's own MediaPlayer; previous/next and the "open the lyrics" tap
 * were removed because NameSinger plays one song at a time. The deck drawing, level bars, scrubber and glyphs are unchanged.
 */
public class Deck extends View {
    private static final int PREV = 0, BACK = 1, PLAY = 2, FWD = 3, NEXT = 4;
    private static final int BARS = 16;

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bmp = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    private final Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float dp;
    private final float[] bx = new float[5], br = new float[5];
    private float by;
    private float spin, energy;
    private long last;
    private int pressed = -1;
    private boolean scrubbing;
    private float scrubTo;

    private MediaPlayer player;
    private boolean ended;
    private String playTitle = "";

    public Deck(Context c, float scale) {
        super(c);
        Skin.load(c);
        dp = getResources().getDisplayMetrics().density * scale; // NameSinger: the whole deck can be drawn larger
        setContentDescription("Music player");
    }

    /** Loads a song and optionally starts it. */
    public void setSource(String path, boolean autoplay) {
        release();
        if (path == null || path.length() == 0) {
            invalidate();
            return;
        }
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setDataSource(path);
            mp.prepare();
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                public void onCompletion(MediaPlayer m) {
                    ended = true;
                    invalidate();
                }
            });
            player = mp;
            ended = false;
            if (autoplay) mp.start();
        } catch (Exception e) {
            release();
        }
        invalidate();
    }

    public void setTitle(String t) {
        playTitle = t == null ? "" : t;
        invalidate();
    }

    public void replay() {
        if (player == null) return;
        try {
            player.seekTo(0);
            player.start();
            ended = false;
        } catch (Exception e) {
            // the player was released
        }
        invalidate();
    }

    private void release() {
        if (player != null) {
            try {
                player.release();
            } catch (Exception e) {
                // already released
            }
            player = null;
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        release();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onMeasure(int w, int h) {
        setMeasuredDimension(MeasureSpec.getSize(w), (int) (132 * dp)); // scales with the deck
    }

    private boolean playing() {
        try {
            return player != null && player.isPlaying();
        } catch (Exception e) {
            return false;
        }
    }

    private int duration() {
        try {
            return player == null ? 0 : player.getDuration();
        } catch (Exception e) {
            return 0;
        }
    }

    private int position() {
        try {
            return player == null ? 0 : (ended ? player.getDuration() : player.getCurrentPosition());
        } catch (Exception e) {
            return 0;
        }
    }

    static String clock(int s) {
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    private void togglePlay() {
        if (player == null) return;
        try {
            if (player.isPlaying()) {
                player.pause();
            } else {
                if (ended) {
                    player.seekTo(0);
                    ended = false;
                }
                player.start();
            }
        } catch (Exception e) {
            // the player was released
        }
    }

    private void seekBy(int ms) {
        if (player == null) return;
        try {
            int to = Math.max(0, Math.min(player.getDuration(), player.getCurrentPosition() + ms));
            player.seekTo(to);
            ended = false;
        } catch (Exception e) {
            // the player was released
        }
    }

    private void seekTo(float fraction) {
        if (player == null) return;
        try {
            player.seekTo((int) (fraction * player.getDuration()));
            ended = false;
        } catch (Exception e) {
            // the player was released
        }
    }

    /** Vertical centre of the scrubber. */
    private float trackY() {
        return 63 * dp;
    }

    private float trackLeft() {
        return 20 * dp;
    }

    private float trackRight() {
        return getWidth() - 20 * dp;
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth();
        long now = SystemClock.uptimeMillis();
        float dt = last == 0 ? 0 : Math.min(100, now - last) / 1000f;
        last = now;
        boolean on = playing();
        energy += ((on ? 1f : 0f) - energy) * Math.min(1f, dt * 4f);
        spin = (spin + dt * 200f * energy) % 360f; // a 33 rpm record turns 200 degrees a second

        // deck: near-black with a gold hairline along the top
        c.drawColor(Skin.DECK);
        p.setShader(new LinearGradient(0, 0, w, 0, new int[] {Skin.accent(0), Skin.ACCENT, Skin.accent(0)}, null, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, Math.max(1f, dp), p);
        p.setShader(null);

        // the record
        float rr = 20 * dp, rx = 20 * dp + rr, ry = 10 * dp + rr;
        p.setShader(new RadialGradient(rx, ry, rr * 1.5f, ((int) (0x55 * energy)) << 24 | Skin.GLOW, Skin.glow(0x00), Shader.TileMode.CLAMP));
        c.drawCircle(rx, ry, rr * 1.5f, p);
        p.setShader(null);
        Bitmap disc = Skin.dial();
        if (disc != null) {
            c.save();
            c.rotate(spin, rx, ry);
            c.drawBitmap(disc, null, new RectF(rx - rr, ry - rr, rx + rr, ry + rr), bmp);
            c.restore();
        }

        float barsL = w - 20 * dp; // the original's decorative level bars were removed

        // title and time
        float tx = rx + rr + 12 * dp, tMax = barsL - tx - 10 * dp;
        txt.setTypeface(Skin.text());
        txt.setTextSize(14 * dp);
        txt.setColor(playTitle.length() > 0 ? Skin.TEXT : Skin.DIM);
        String title = playTitle.length() > 0 ? playTitle : "Nothing playing";
        c.drawText(TextUtils.ellipsize(title, new android.text.TextPaint(txt), tMax, TextUtils.TruncateAt.END).toString(),
                tx, ry - 2 * dp, txt);
        int dur = duration();
        int pos = scrubbing ? (int) (scrubTo * dur) : position();
        txt.setTypeface(Typeface.MONOSPACE);
        txt.setTextSize(11 * dp);
        txt.setColor(Skin.ACCENT);
        c.drawText(clock(pos / 1000) + "  /  " + clock(dur / 1000), tx, ry + 14 * dp, txt);

        // scrubber
        float tl = trackLeft(), tr = trackRight(), ty = trackY();
        float frac = dur > 0 ? Math.max(0f, Math.min(1f, pos / (float) dur)) : 0f;
        float hx = tl + (tr - tl) * frac;
        p.setColor(Skin.OFF);
        c.drawRoundRect(new RectF(tl, ty - 2.5f * dp, tr, ty + 2.5f * dp), 3 * dp, 3 * dp, p);
        p.setColor(Skin.EDGE);
        for (int i = 0; i <= 10; i++) {
            float nx = tl + (tr - tl) * i / 10f;
            c.drawRect(nx - 0.5f * dp, ty + 4 * dp, nx + 0.5f * dp, ty + (i % 5 == 0 ? 8 : 6.5f) * dp, p);
        }
        if (hx > tl) {
            p.setShader(new LinearGradient(tl, 0, hx, 0, Skin.LO, Skin.HI, Shader.TileMode.CLAMP));
            c.drawRoundRect(new RectF(tl, ty - 2.5f * dp, hx, ty + 2.5f * dp), 3 * dp, 3 * dp, p);
            // a glint that runs along the played part while the song plays
            float gx = tl + (hx - tl) * (float) ((now % 2400) / 2400.0);
            p.setShader(new RadialGradient(gx, ty, 16 * dp, ((int) (0x99 * energy)) << 24 | (Skin.HI & 0xFFFFFF), Skin.hi(0x00), Shader.TileMode.CLAMP));
            c.drawRect(Math.max(tl, gx - 16 * dp), ty - 2.5f * dp, Math.min(hx, gx + 16 * dp), ty + 2.5f * dp, p);
        }
        p.setShader(new RadialGradient(hx, ty, 12 * dp, Skin.glow(0xAA), Skin.glow(0x00), Shader.TileMode.CLAMP));
        c.drawCircle(hx, ty, 12 * dp, p);
        p.setShader(new RadialGradient(hx - 1.5f * dp, ty - 1.5f * dp, 7 * dp, Skin.HI, Skin.glow(0xFF), Shader.TileMode.CLAMP));
        c.drawCircle(hx, ty, (scrubbing ? 7.5f : 5.5f) * dp, p);
        p.setShader(null);

        // transport buttons
        by = 101 * dp;
        float gap = Math.min(58 * dp, (w - 40 * dp) / 5.2f);
        for (int i = BACK; i <= FWD; i++) {
            bx[i] = w / 2f + (i - 2) * gap;
            br[i] = (i == PLAY ? 23 : 17) * dp;
            if (i == PLAY - 1) bx[i] -= 5 * dp;
            if (i == PLAY + 1) bx[i] += 5 * dp;
            if (i == PREV) bx[i] -= 5 * dp;
            if (i == NEXT) bx[i] += 5 * dp;
            Bitmap round = Skin.round();
            boolean down = pressed == i;
            if (i == PLAY || down) {
                float gl = br[i] * 1.4f;
                int al = down ? 0xAA : (int) (0x30 + 0x45 * energy * (0.6 + 0.4 * Math.sin(now / 320.0)));
                p.setShader(new RadialGradient(bx[i], by, gl, (al << 24) | Skin.GLOW, Skin.glow(0x00), Shader.TileMode.CLAMP));
                c.drawCircle(bx[i], by, gl, p);
                p.setShader(null);
            }
            if (round != null) c.drawBitmap(round, null, new RectF(bx[i] - br[i], by - br[i], bx[i] + br[i], by + br[i]), bmp);
            glyph(c, i, bx[i], by + (down ? dp : 0), br[i] * 0.36f, on);
        }

        if (on || energy > 0.01f || scrubbing || pressed >= 0) postInvalidateOnAnimation();
    }

    private void tri(Path path, float x, float y, float s, boolean right) {
        float d = right ? 1 : -1;
        path.moveTo(x - d * s * 0.5f, y - s * 0.62f);
        path.lineTo(x + d * s * 0.5f, y);
        path.lineTo(x - d * s * 0.5f, y + s * 0.62f);
        path.close();
    }

    /** Draws a transport symbol in cast gold: s is half the symbol's height. */
    private void glyph(Canvas c, int which, float x, float y, float s, boolean on) {
        Path path = new Path();
        if (which == PLAY) {
            if (on) {
                path.addRoundRect(new RectF(x - s * 0.72f, y - s, x - s * 0.2f, y + s), s * 0.12f, s * 0.12f, Path.Direction.CW);
                path.addRoundRect(new RectF(x + s * 0.2f, y - s, x + s * 0.72f, y + s), s * 0.12f, s * 0.12f, Path.Direction.CW);
            } else {
                path.moveTo(x - s * 0.55f, y - s);
                path.lineTo(x + s * 0.95f, y);
                path.lineTo(x - s * 0.55f, y + s);
                path.close();
            }
        } else if (which == BACK || which == FWD) {
            boolean right = which == FWD;
            tri(path, x - s * 0.5f, y, s * 1.35f, right);
            tri(path, x + s * 0.5f, y, s * 1.35f, right);
        } else {
            boolean right = which == NEXT;
            float d = right ? 1 : -1;
            tri(path, x - d * s * 0.28f, y, s * 1.35f, right);
            path.addRoundRect(new RectF(x + d * s * 0.5f - s * 0.16f, y - s * 0.84f, x + d * s * 0.5f + s * 0.16f, y + s * 0.84f),
                    s * 0.08f, s * 0.08f, Path.Direction.CW);
        }
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xAA000000);
        c.save();
        c.translate(0, dp);
        c.drawPath(path, p);
        c.restore();
        p.setShader(new LinearGradient(0, y - s, 0, y + s, new int[] {Skin.HI, Skin.ACCENT, Skin.LO}, null, Shader.TileMode.CLAMP));
        c.drawPath(path, p);
        p.setShader(null);
    }

    private int buttonAt(float x, float y) {
        for (int i = BACK; i <= FWD; i++) {
            float dx = x - bx[i], dy = y - by;
            float r = br[i] + 7 * dp; // a little larger than drawn, for fingers
            if (dx * dx + dy * dy <= r * r) return i;
        }
        return -1;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int action = e.getActionMasked();
        float x = e.getX(), y = e.getY();
        if (action == MotionEvent.ACTION_DOWN) {
            if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
            pressed = buttonAt(x, y);
            scrubbing = pressed < 0 && Math.abs(y - trackY()) < 16 * dp && duration() > 0;
        }
        if (scrubbing) {
            scrubTo = Math.max(0f, Math.min(1f, (x - trackLeft()) / (trackRight() - trackLeft())));
            if (action == MotionEvent.ACTION_UP) {
                seekTo(scrubTo);
                scrubbing = false;
            }
            if (action == MotionEvent.ACTION_CANCEL) scrubbing = false;
            invalidate();
            return true;
        }
        if (action == MotionEvent.ACTION_UP) {
            int hit = buttonAt(x, y);
            if (hit >= 0 && hit == pressed) {
                if (hit == PLAY) togglePlay();
                if (hit == BACK) seekBy(-10000);
                if (hit == FWD) seekBy(10000);
                performClick();
            }
            pressed = -1;
        }
        if (action == MotionEvent.ACTION_CANCEL) pressed = -1;
        invalidate();
        return true;
    }

    @Override
    public boolean performClick() {
        super.performClick();
        return true;
    }
}
