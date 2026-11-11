package expo.modules.refractiveglass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Native backdrop refraction for NameSinger, Android only.
 *
 * Two views work as a pair:
 *  - GlassTargetView holds the page (scene, orb, transcript). It is the content that gets refracted.
 *  - RefractiveGlassView is a pane of glass placed above it. Each frame it records the target's real
 *    drawing into a RenderNode, offset to the pane's position, and draws that through an AGSL
 *    runtime shader (Android 13+) that blurs, bends and tints it like a thick convex bezel.
 *
 * Below Android 13 `supported` is false and the JavaScript side draws its fallback instead.
 */
class RefractiveGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RefractiveGlass")

    Constants("supported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU))

    // Counters for measuring the module's own cost on a real run (see GlassStats).
    Function("getStats") { GlassStats.snapshot() }
    Function("resetStats") { GlassStats.reset() }

    // TEMPORARY (phase 2 instrumentation): debug builds only, see GlassDevControl for how to remove.
    OnCreate { GlassDevControl.start(appContext.applicationContext) }

    View(GlassTargetView::class) {
      Name("GlassTargetView")
      Prop("name") { view: GlassTargetView, name: String -> view.setTargetName(name) }
    }

    View(RefractiveGlassView::class) {
      Name("RefractiveGlassView")
      Prop("target") { view: RefractiveGlassView, name: String -> view.setTargetName(name) }
      Prop("cornerRadius") { view: RefractiveGlassView, v: Float -> view.params.cornerRadius = v; view.paramsChanged() }
      Prop("extendBottom") { view: RefractiveGlassView, v: Float -> view.params.extendBottom = v; view.paramsChanged() }
      Prop("bezel") { view: RefractiveGlassView, v: Float -> view.params.bezel = v; view.paramsChanged() }
      Prop("thickness") { view: RefractiveGlassView, v: Float -> view.params.thickness = v; view.paramsChanged() }
      Prop("strength") { view: RefractiveGlassView, v: Float -> view.params.strength = v; view.paramsChanged() }
      Prop("progressive") { view: RefractiveGlassView, v: Float -> view.params.progressive = v; view.paramsChanged() }
      Prop("ior") { view: RefractiveGlassView, v: Float -> view.params.ior = v; view.paramsChanged() }
      Prop("aberration") { view: RefractiveGlassView, v: Float -> view.params.aberration = v; view.paramsChanged() }
      Prop("frost") { view: RefractiveGlassView, v: Float -> view.params.frost = v; view.paramsChanged() }
      Prop("saturation") { view: RefractiveGlassView, v: Float -> view.params.saturation = v; view.paramsChanged() }
      Prop("specular") { view: RefractiveGlassView, v: Float -> view.params.specular = v; view.paramsChanged() }
      Prop("lightX") { view: RefractiveGlassView, v: Float -> view.params.lightX = v; view.paramsChanged() }
      Prop("lightY") { view: RefractiveGlassView, v: Float -> view.params.lightY = v; view.paramsChanged() }
      Prop("tint") { view: RefractiveGlassView, v: Int -> view.params.tint = v; view.paramsChanged() }
      Prop("glow") { view: RefractiveGlassView, v: Int -> view.params.glow = v; view.paramsChanged() }
      Prop("specularColor") { view: RefractiveGlassView, v: Int -> view.params.specularColor = v; view.paramsChanged() }
      Prop("animated") { view: RefractiveGlassView, v: Boolean -> view.setAnimated(v) }
    }
  }
}
