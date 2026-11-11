package expo.modules.refractiveglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Everything the shader needs, in dp and plain numbers. Colours are ARGB ints. */
class GlassParams {
  var cornerRadius = 24f
  var extendBottom = 0f
  var bezel = 14f
  var thickness = 22f
  var strength = 0.5f
  var ior = 1.5f
  var aberration = 0.04f
  var frost = 2f
  var progressive = 0f
  var saturation = 1.25f
  var specular = 0.7f
  var lightX = -0.5f
  var lightY = -0.85f
  var tint = 0
  var glow = 0
  var specularColor = -1
}

/**
 * A pane of glass. It draws its target's page (see GlassTargetView) refracted. It is a leaf: the
 * React content of a glass surface is an ordinary sibling view drawn on top, so it stays sharp and
 * React lays it out normally.
 */
@SuppressLint("ViewConstructor")
class RefractiveGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val params = GlassParams()
  var targetName: String? = null
    private set
  private var animated = false
  private var refractor: Refractor? = null
  private var failed = false

  /** While the pane (or something above it) is moving, it must be redrawn every frame. */
  private val everyFrame = ViewTreeObserver.OnPreDrawListener {
    invalidate()
    true
  }

  init {
    setWillNotDraw(false)
  }

  fun setTargetName(value: String) {
    targetName = value
    invalidate()
  }

  fun setAnimated(value: Boolean) {
    animated = value
    updateFrameListener()
  }

  fun paramsChanged() {
    refractor?.markParamsChanged()
    invalidate()
  }

  private fun updateFrameListener() {
    viewTreeObserver.removeOnPreDrawListener(everyFrame)
    // Only while attached AND the window is on screen: a backgrounded app must not keep drawing.
    if (animated && isAttachedToWindow && windowVisibility == View.VISIBLE) {
      viewTreeObserver.addOnPreDrawListener(everyFrame)
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    GlassRegistry.addGlass(this)
    updateFrameListener()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    updateFrameListener()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(everyFrame)
    GlassRegistry.removeGlass(this)
    // Free the pane's recording and shader; they are rebuilt if the view is attached again.
    refractor?.release()
    refractor = null
    super.onDetachedFromWindow()
  }

  override fun dispatchDraw(canvas: Canvas) {
    // GlassStats.enabled is the TEMPORARY dev switch (always true outside the phase 2 measurements).
    if (!failed && GlassStats.enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val target = targetName?.let { GlassRegistry.target(it) }
      if (target != null) {
        try {
          val r = refractor ?: Refractor().also { refractor = it }
          r.draw(this, canvas, target)
        } catch (error: Throwable) {
          // A shader that will not compile or a draw that throws must never take the app down:
          // stop refracting, count it, and leave the pane drawn by its (transparent) content only.
          failed = true
          GlassStats.failures++
          Log.e("RefractiveGlass", "Refraction disabled for this pane", error)
        }
      }
    }
    super.dispatchDraw(canvas)
  }
}

/**
 * The refraction itself, Android 13 and up. Technique, in the order the work happens:
 *
 *  1. The target keeps one recording of the page. This pane records a tiny node of its own that
 *     draws that recording shifted to the pane's position (so the node holds exactly the part of
 *     the page lying under the glass), and only when the page, the position or the size changed.
 *  2. The node carries a RenderEffect (cached until a parameter changes): an optional blur, then an
 *     AGSL runtime shader.
 *  3. The shader treats the pane as a rounded rectangle (circular corners; see GlassShape, which owns
 *     the clip and the corner radius the shader uses) with a circular-arc
 *     bezel. From the bezel it takes the surface normal, refracts a ray with Snell's law using the
 *     glass index and thickness, and samples the page at the displaced point separately for red,
 *     green and blue (chromatic dispersion). An optional progressive blur adds more blur toward the
 *     bottom of tall panes.
 *  4. On top it adds a saturation grade, the palette tint, a palette-coloured rim reflection, a
 *     specular rim lit from a light direction (and a weaker one from the opposite side), a thin
 *     lit edge and a faint inner shadow. Those last parts are shading, not optics.
 *
 * These techniques follow the structure of the Liquid Glass shaders found in the Music OS 26 APK
 * (circular-bezel normal, Snell refraction with a thickness-and-height displacement, dispersion,
 * edge absorption and a facing-light specular), written here independently for AGSL.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class Refractor {
  private val node = RenderNode("refractive-glass")
  private val shader = RuntimeShader(SOURCE)
  private val shape = GlassShape()
  private val here = IntArray(2)
  private val there = IntArray(2)

  private var paramsDirty = true
  private var effectWidth = -1
  private var effectHeight = -1
  private var recordedVersion = -1L
  private var recordedDx = Float.NaN
  private var recordedDy = Float.NaN

  fun markParamsChanged() {
    paramsDirty = true
  }

  fun release() {
    node.setRenderEffect(null)
    node.discardDisplayList()
    recordedVersion = -1L
    paramsDirty = true
    effectWidth = -1
  }

  fun draw(view: RefractiveGlassView, canvas: Canvas, target: GlassTargetView) {
    if (!canvas.isHardwareAccelerated) return
    val w = view.width
    val h = view.height
    if (w <= 0 || h <= 0) return
    val start = System.nanoTime()
    val d = view.resources.displayMetrics.density
    val p = view.params

    val page = target.snapshot() ?: return
    view.getLocationOnScreen(here)
    target.getLocationOnScreen(there)
    val dx = (here[0] - there[0]).toFloat()
    val dy = (here[1] - there[1]).toFloat()
    val extra = p.extendBottom * d
    val radius = p.cornerRadius * d

    // (Re)build the effect only when a parameter or the size changed.
    if (paramsDirty || w != effectWidth || h != effectHeight) {
      // One shape for the clip and the shader: its effective radius is what the shader receives.
      shape.set(w.toFloat(), h + extra, radius)
      applyUniforms(p, d, w, h, extra, shape.radius)
      val shaderEffect = RenderEffect.createRuntimeShaderEffect(shader, "content")
      val frost = p.frost * d
      val effect = if (frost >= 0.5f) {
        RenderEffect.createChainEffect(shaderEffect, RenderEffect.createBlurEffect(frost, frost, Shader.TileMode.CLAMP))
      } else {
        shaderEffect
      }
      node.setPosition(0, 0, w, h)
      node.setRenderEffect(effect)
      effectWidth = w
      effectHeight = h
      paramsDirty = false
      recordedVersion = -1L // the node must be recorded again for the new effect
    }

    // Record only when the page changed or the pane moved over it.
    if (recordedVersion != target.version || recordedDx != dx || recordedDy != dy) {
      val recordStart = System.nanoTime()
      val recording = node.beginRecording(w, h)
      try {
        recording.translate(-dx, -dy)
        recording.drawRenderNode(page)
      } finally {
        node.endRecording()
      }
      recordedVersion = target.version
      recordedDx = dx
      recordedDy = dy
      val recordSpent = System.nanoTime() - recordStart
      GlassStats.paneRecordings++
      GlassStats.paneRecordNanos += recordSpent
      if (recordSpent > GlassStats.paneRecordMaxNanos) GlassStats.paneRecordMaxNanos = recordSpent
    }

    canvas.save()
    canvas.clipPath(shape.path)
    canvas.drawRenderNode(node)
    canvas.restore()

    val spent = System.nanoTime() - start
    GlassStats.paneDraws++
    GlassStats.paneDrawNanos += spent
    if (spent > GlassStats.paneDrawMaxNanos) GlassStats.paneDrawMaxNanos = spent
  }

  private fun applyUniforms(p: GlassParams, d: Float, w: Int, h: Int, extra: Float, radius: Float) {
    shader.setFloatUniform("viewSize", w.toFloat(), h.toFloat())
    shader.setFloatUniform("size", w.toFloat(), h + extra)
    shader.setFloatUniform("radius", radius)
    shader.setFloatUniform("bezel", maxOf(p.bezel * d, 1f))
    shader.setFloatUniform("thickness", p.thickness * d)
    shader.setFloatUniform("strength", p.strength)
    shader.setFloatUniform("ior", p.ior)
    shader.setFloatUniform("aberration", p.aberration)
    shader.setFloatUniform("saturation", p.saturation)
    shader.setFloatUniform("specular", p.specular)
    shader.setFloatUniform("absorption", 0.22f)
    shader.setFloatUniform("density", d)
    shader.setFloatUniform("progressiveBlur", p.progressive * p.frost * d * 2.5f)
    val len = Math.hypot(p.lightX.toDouble(), p.lightY.toDouble()).toFloat().coerceAtLeast(0.0001f)
    shader.setFloatUniform("light", p.lightX / len, p.lightY / len)
    setColor("tint", p.tint)
    setColor("glow", p.glow)
    setColor("specColor", p.specularColor)
  }

  private fun setColor(name: String, argb: Int) {
    val a = ((argb ushr 24) and 0xFF) / 255f
    val r = ((argb shr 16) and 0xFF) / 255f
    val g = ((argb shr 8) and 0xFF) / 255f
    val b = (argb and 0xFF) / 255f
    shader.setFloatUniform(name, r, g, b, a)
  }

  companion object {
    private const val SOURCE = """
      uniform shader content;
      uniform float2 viewSize;
      uniform float2 size;
      uniform float radius;
      uniform float bezel;
      uniform float thickness;
      uniform float strength;
      uniform float ior;
      uniform float aberration;
      uniform float saturation;
      uniform float specular;
      uniform float absorption;
      uniform float density;
      uniform float progressiveBlur;
      uniform float2 light;
      uniform float4 tint;
      uniform float4 glow;
      uniform float4 specColor;

      // Rounded rectangle with circular corners: the exact Euclidean signed distance to the pane's edge
      // (negative inside). The silhouette, the surface normal and the rim all come from this one
      // function, and its shape is the one GlassShape clips to and the React shadow follows.
      //
      // CHANGED (phase 1, geometry consistency): this replaces the earlier `sdSquircle`, a p-norm
      // approximation of a continuous corner. The squircle was this renderer's own addition, not
      // something found in the reference (Music OS 26's geometry pass uses this same rounded-box
      // distance and has no pow() in it), and it could not match the clip path, the shadow or the
      // React border, which are all circular-corner: the glass edge and the shadow disagreed by up to
      // 1.7 px at the sheet corners. Every other calculation in this shader is unchanged.
      float sdRoundBox(float2 p, float2 hs, float r) {
        float2 q = abs(p) - hs + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }

      half3 page(float2 q) {
        return content.eval(clamp(q, float2(0.5), viewSize - float2(0.5))).rgb;
      }

      // Eight taps on a ring plus the centre: the extra, position-dependent part of the blur.
      half3 ring(float2 q, float rad) {
        if (rad < 0.5) return page(q);
        half3 acc = page(q);
        acc += page(q + float2(rad, 0.0));
        acc += page(q + float2(-rad, 0.0));
        acc += page(q + float2(0.0, rad));
        acc += page(q + float2(0.0, -rad));
        float k = rad * 0.7071;
        acc += page(q + float2(k, k));
        acc += page(q + float2(-k, k));
        acc += page(q + float2(k, -k));
        acc += page(q + float2(-k, -k));
        return acc / 9.0;
      }

      half luma(half3 c) { return dot(c, half3(0.299, 0.587, 0.114)); }

      half4 main(float2 fc) {
        float2 hs = size * 0.5;
        float2 p = fc - hs;
        float r = min(radius, min(hs.x, hs.y));
        float d = sdRoundBox(p, hs, r);
        float cover = clamp(0.5 - d, 0.0, 1.0);
        if (cover <= 0.0) return half4(0.0);

        float e = 1.0;
        float2 g = float2(
          sdRoundBox(p + float2(e, 0.0), hs, r) - sdRoundBox(p - float2(e, 0.0), hs, r),
          sdRoundBox(p + float2(0.0, e), hs, r) - sdRoundBox(p - float2(0.0, e), hs, r));
        float gl = length(g);
        float2 dir = gl > 0.0001 ? g / gl : float2(0.0, -1.0);

        // Circular-arc bezel: s = how far into the curved rim (1 at the very edge, 0 past the bezel).
        float depth = -d;
        float s = clamp((bezel - depth) / bezel, 0.0, 1.0);
        float height = sqrt(max(0.0, 1.0 - s * s));
        float nz = height;
        float3 N = normalize(float3(dir * s, max(nz, 0.0001)));

        // Snell's law for a ray travelling straight into the glass; the page is sampled where it ends up.
        float3 R = refract(float3(0.0, 0.0, -1.0), N, 1.0 / max(ior, 0.001));
        float2 off = R.xy * (thickness * (height + 8.0) / max(abs(R.z), 0.001)) * strength;
        off = clamp(off, float2(-bezel * 3.0), float2(bezel * 3.0));

        // Progressive blur: more blur toward the bottom of the pane (none when progressiveBlur is 0).
        float tpos = clamp(fc.y / max(size.y, 1.0), 0.0, 1.0);
        float extra = progressiveBlur * smoothstep(0.1, 1.0, tpos);

        float2 pg = fc + off;
        half3 gRaw = page(pg);
        half3 rRaw = page(fc + off * (1.0 + aberration * 0.5));
        half3 bRaw = page(fc + off * (1.0 - aberration * 0.5));
        half3 base = ring(pg, extra);
        // Chromatic dispersion: red and blue are displaced a little differently from green.
        half3 col = base + half3(rRaw.r - gRaw.r, 0.0, bRaw.b - gRaw.b);

        half lum = luma(col);
        col = clamp(mix(half3(lum), col, half(saturation * mix(1.2, 0.8, lum))), half3(0.0), half3(1.0));
        col = mix(col, half3(tint.rgb), half(tint.a));

        float rimBand = 1.0 - smoothstep(0.0, 0.8, height);
        float ndl = dot(dir, light);
        col += half3(glow.rgb) * half(glow.a * rimBand * (0.5 + 0.5 * ndl));

        // Edge absorption: the curved rim is thicker glass, so it darkens, more away from the light.
        float arc = sqrt(max(0.0, 1.0 - (1.0 - height) * (1.0 - height)));
        col *= half(max(0.0, 1.0 - sqrt(max(0.0, 1.0 - arc)) * absorption * mix(1.4, 0.6, ndl * 0.5 + 0.5)));

        // Specular: bright where the rim faces the light, a weaker echo opposite, tone-mapped, and
        // tinted by the page's own colour so it reads as a reflection and not a white stroke.
        float facing = max(0.0, ndl) + max(0.0, dot(dir, -light)) * 0.8;
        float k = (facing * sqrt(facing) * specular * 3.0 + 0.05) * rimBand * 0.8;
        half3 pageHue = col / max(lum, 0.001);
        half3 hi = mix(half3(specColor.rgb), clamp(pageHue, half3(0.0), half3(1.0)), 0.35);
        col = mix(col, hi, half(k / (1.0 + k)));

        // A thin lit edge where the surface faces the light, and a soft glow just inside the rim.
        float edge = 1.0 - smoothstep(0.0, 1.6 * density, depth);
        col += half3(specColor.rgb) * half(edge * max(0.0, ndl) * 0.3 * specular);
        col = clamp(col + half3(specColor.rgb) * half((1.0 - nz) * rimBand * 0.1 * specular), half3(0.0), half3(1.0));

        return half4(col * half(cover), half(cover));
      }
    """
  }
}
