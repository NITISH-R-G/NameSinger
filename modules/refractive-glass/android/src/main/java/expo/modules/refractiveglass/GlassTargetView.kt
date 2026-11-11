package expo.modules.refractiveglass

import android.content.Context
import android.graphics.RenderNode
import android.os.Build
import android.view.View
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * The page that glass refracts. It is an ordinary container for React children; nothing about how
 * it draws changes.
 *
 * It also owns ONE recording of itself (a RenderNode) that every pane of glass draws from, so the
 * page is traversed and recorded once however many panes there are, and only when something inside
 * it actually redrew (`dirty`). A pane that merely moves (a sheet sliding up) reuses the recording.
 */
class GlassTargetView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var name: String? = null
  private var node: RenderNode? = null
  private var recordedWidth = 0
  private var recordedHeight = 0
  private var dirty = true

  /** Increments every time the recording is renewed, so panes know whether their copy is current. */
  var version = 0L
    private set

  fun setTargetName(value: String) {
    name?.let { GlassRegistry.unregister(it, this) }
    name = value
    GlassRegistry.register(value, this)
  }

  /** The current recording of the page, renewed first if anything inside it changed. Android 13+. */
  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  fun snapshot(): RenderNode? {
    val w = width
    val h = height
    if (w <= 0 || h <= 0 || !isAttachedToWindow) return null
    var n = node
    if (n == null) {
      n = RenderNode("glass-page")
      node = n
      dirty = true
    }
    if (dirty || w != recordedWidth || h != recordedHeight) {
      val start = System.nanoTime()
      n.setPosition(0, 0, w, h)
      val canvas = n.beginRecording(w, h)
      try {
        draw(canvas)
      } finally {
        n.endRecording()
      }
      recordedWidth = w
      recordedHeight = h
      dirty = false
      version++
      val spent = System.nanoTime() - start
      GlassStats.pageRecordings++
      GlassStats.pageRecordNanos += spent
      if (spent > GlassStats.pageRecordMaxNanos) GlassStats.pageRecordMaxNanos = spent
    }
    return n
  }

  override fun onDescendantInvalidated(child: View, target: View) {
    super.onDescendantInvalidated(child, target)
    dirty = true
    name?.let { GlassRegistry.invalidateGlasses(it) }
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    dirty = true
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    dirty = true
    name?.let { GlassRegistry.register(it, this) }
  }

  override fun onDetachedFromWindow() {
    name?.let { GlassRegistry.unregister(it, this) }
    // Give the recording's memory back; it is rebuilt on the next attach.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) node?.discardDisplayList()
    node = null
    super.onDetachedFromWindow()
  }
}
