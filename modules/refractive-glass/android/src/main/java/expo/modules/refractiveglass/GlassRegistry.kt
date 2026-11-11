package expo.modules.refractiveglass

import java.lang.ref.WeakReference

/** Finds the page (target) a pane of glass should refract, by name, and tells panes when it changes. */
internal object GlassRegistry {
  private val targets = HashMap<String, WeakReference<GlassTargetView>>()
  private val glasses = ArrayList<WeakReference<RefractiveGlassView>>()

  fun register(name: String, view: GlassTargetView) {
    targets[name] = WeakReference(view)
    invalidateGlasses(name)
  }

  fun unregister(name: String, view: GlassTargetView) {
    if (targets[name]?.get() === view) targets.remove(name)
  }

  fun target(name: String): GlassTargetView? = targets[name]?.get()

  fun addGlass(view: RefractiveGlassView) {
    glasses.removeAll { it.get() == null }
    if (glasses.none { it.get() === view }) glasses.add(WeakReference(view))
  }

  fun removeGlass(view: RefractiveGlassView) {
    glasses.removeAll { it.get() == null || it.get() === view }
  }

  fun glassCount(): Int = glasses.count { it.get() != null }

  /** The target drew something new: every pane over it must redraw its refraction. */
  fun invalidateGlasses(name: String) {
    for (ref in glasses) {
      val glass = ref.get() ?: continue
      if (glass.targetName == name) glass.invalidate()
    }
  }

  /** Redraw every pane (used when the temporary dev switch flips the renderer on or off). */
  fun invalidateAll() {
    for (ref in glasses) ref.get()?.invalidate()
  }
}

/**
 * Plain counters, read by the module's getStats() so performance can be measured on a real run
 * instead of guessed. Times are for the work this module does in a draw, not whole frames.
 */
internal object GlassStats {
  /**
   * TEMPORARY development switch (see GlassDevControl): false makes every pane skip refraction, so a
   * run with glass off can be compared with one with glass on. Always true unless the dev control
   * flips it, and the dev control only runs in debuggable builds.
   */
  @Volatile var enabled = true

  /** Per pane draw: everything Refractor.draw does, including renewing the page recording when it is due. */
  var paneDraws = 0L
  var paneDrawNanos = 0L
  var paneDrawMaxNanos = 0L

  /** Recording of a pane's own small node (only when the page, position, size or effect changed). */
  var paneRecordings = 0L
  var paneRecordNanos = 0L
  var paneRecordMaxNanos = 0L

  /** Renewing the shared page recording (GlassTargetView.snapshot). Included in paneDraw time too. */
  var pageRecordings = 0L
  var pageRecordNanos = 0L
  var pageRecordMaxNanos = 0L

  var failures = 0L
  private var startedAtNanos = System.nanoTime()

  fun reset() {
    paneDraws = 0
    paneDrawNanos = 0
    paneDrawMaxNanos = 0
    paneRecordings = 0
    paneRecordNanos = 0
    paneRecordMaxNanos = 0
    pageRecordings = 0
    pageRecordNanos = 0
    pageRecordMaxNanos = 0
    failures = 0
    startedAtNanos = System.nanoTime()
  }

  fun snapshot(): Map<String, Any> = mapOf(
    "enabled" to enabled,
    "elapsedMs" to (System.nanoTime() - startedAtNanos) / 1e6,
    "paneDraws" to paneDraws,
    "paneDrawAvgMs" to if (paneDraws > 0) paneDrawNanos / paneDraws / 1e6 else 0.0,
    "paneDrawMaxMs" to paneDrawMaxNanos / 1e6,
    "glassTotalMs" to paneDrawNanos / 1e6,
    "paneRecordings" to paneRecordings,
    "paneRecordAvgMs" to if (paneRecordings > 0) paneRecordNanos / paneRecordings / 1e6 else 0.0,
    "paneRecordMaxMs" to paneRecordMaxNanos / 1e6,
    "pageRecordings" to pageRecordings,
    "pageRecordAvgMs" to if (pageRecordings > 0) pageRecordNanos / pageRecordings / 1e6 else 0.0,
    "pageRecordMaxMs" to pageRecordMaxNanos / 1e6,
    "pageRecordTotalMs" to pageRecordNanos / 1e6,
    "failures" to failures,
    "glassCount" to GlassRegistry.glassCount(),
  )
}
