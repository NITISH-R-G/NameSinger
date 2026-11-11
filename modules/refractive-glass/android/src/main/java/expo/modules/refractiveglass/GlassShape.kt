package expo.modules.refractiveglass

import android.graphics.Path
import android.graphics.RectF

/**
 * The one definition of a glass pane's silhouette: a rectangle with circular corners.
 *
 * Four things must agree on where the pane's edge is, or the glass shows a sliver of the wrong shape
 * at its corners:
 *
 *  1. the shader's silhouette and its edge normals (the `sdRoundBox` distance in Refractor's AGSL),
 *  2. the native clip applied to the drawn pane (`path` here),
 *  3. the shadow the React side draws around the pane (`boxShadow` on a view with `borderRadius`),
 *  4. the outline: the shader's rim highlight, which follows the same distance.
 *
 * React Native on Android can only draw circular-corner borders and shadows, so a circular-corner
 * rectangle is the one shape all four can share. The reference Liquid Glass geometry pass uses the same
 * distance, `min(max(q.x, q.y), 0) + length(max(q, 0)) - r`, so nothing is lost against it.
 *
 * `radius` is the corner radius all of them use, already limited the way CSS and React Native limit a
 * border radius that is larger than half the shape (a pill): never more than half the width or height.
 * The shader receives exactly this value, so there is no second clamp that could disagree.
 *
 * Sizes are in pixels. `height` includes any `extendBottom` the pane's shape reaches below its bottom edge.
 */
internal class GlassShape {
  private val rect = RectF()

  /** The clip: the same rounded rectangle the shader's distance describes. */
  val path = Path()

  /** The effective corner radius in px. */
  var radius = 0f
    private set

  fun set(widthPx: Float, heightPx: Float, requestedRadiusPx: Float) {
    radius = maxOf(0f, minOf(requestedRadiusPx, widthPx / 2f, heightPx / 2f))
    rect.set(0f, 0f, widthPx, heightPx)
    path.reset()
    path.addRoundRect(rect, radius, radius, Path.Direction.CW)
  }
}
