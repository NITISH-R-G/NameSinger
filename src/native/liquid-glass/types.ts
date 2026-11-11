/**
 * The seam between the glass components and any native glass renderer.
 *
 * Today the only renderer is the React Native one ("rn-approximation": a tinted translucent fill,
 * a lit rim, a top highlight and a soft shadow, drawn with views and gradients). It is NOT the
 * AndroidLiquidGlass (Backdrop) effect: that library is Kotlin / Compose and needs Compose content
 * to refract, so it cannot sample React Native views. See docs/ui/liquid-glass-design.md.
 *
 * A native renderer (an Expo module hosting a Compose surface) would implement GlassRenderer and
 * be returned by getGlassRenderer(); the glass components would not change.
 */
export type GlassRendererKind = 'rn-approximation' | 'agsl-refraction';

export interface GlassRenderer {
  kind: GlassRendererKind;
  /** True only when the effect really refracts the content behind it. False for the approximation. */
  refractsBackdrop: boolean;
}
