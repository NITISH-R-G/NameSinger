package ai.jackknife.killayue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.View;

/**
 * Killa YuE's record (skins/gold/dial.png) turning at the deck's own 200 degrees a second with its amber glow, drawn
 * as in PlayerView.onDraw, larger. Shown while a song is being made. (Apache-2.0, Copyright 2026 JackKnifeAI;
 * the drawing is taken from PlayerView.)
 */
public class RecordSpin extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bmp = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    private float spin;
    private long last;
    private boolean spinning = true;

    public RecordSpin(Context c) {
        super(c);
        Skin.load(c);
    }

    public void setSpinning(boolean on) {
        spinning = on;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        long now = SystemClock.uptimeMillis();
        float dt = last == 0 ? 0 : Math.min(100, now - last) / 1000f;
        last = now;
        if (spinning) spin = (spin + dt * 200f) % 360f;
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float rr = Math.min(getWidth(), getHeight()) / 2f * 0.72f;
        p.setShader(new RadialGradient(cx, cy, rr * 1.5f, (0x55 << 24) | Skin.GLOW, Skin.glow(0x00), Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, rr * 1.5f, p);
        p.setShader(null);
        Bitmap disc = Skin.dial();
        if (disc != null) {
            c.save();
            c.rotate(spin, cx, cy);
            c.drawBitmap(disc, null, new RectF(cx - rr, cy - rr, cx + rr, cy + rr), bmp);
            c.restore();
        }
        if (spinning && getVisibility() == VISIBLE) postInvalidateOnAnimation();
    }
}
