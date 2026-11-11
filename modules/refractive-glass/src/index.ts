import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

/**
 * JavaScript side of the native refraction module (modules/refractive-glass, Android 13+).
 * Without the native build (Expo Go, iOS, older Android) `isRefractionSupported` is false and the
 * views are null: the glass components then draw their fallback.
 */
interface RefractiveGlassNativeModule {
  supported: boolean;
  getStats(): Record<string, number>;
  resetStats(): void;
}

const nativeModule = requireOptionalNativeModule<RefractiveGlassNativeModule>('RefractiveGlass');

export const isRefractionSupported: boolean = nativeModule?.supported === true;

/** Timing counters of the native module (draw cost, recordings, failures). Null without the native build. */
export const glassStats = nativeModule && isRefractionSupported
  ? { read: () => nativeModule.getStats(), reset: () => nativeModule.resetStats() }
  : null;

export interface GlassTargetViewProps extends ViewProps {
  /** The name panes of glass use to find this page. */
  name: string;
}

export interface RefractiveGlassViewProps extends ViewProps {
  target: string;
  /** dp */
  cornerRadius?: number;
  /** dp the pane's shape extends below its bottom edge, so a sheet has no rounded bottom corners. */
  extendBottom?: number;
  /** dp width of the curved edge where the page is bent. */
  bezel?: number;
  /** dp glass thickness: how far the edge bends the page. */
  thickness?: number;
  /** How strongly the rim bends the page (multiplier on the physical displacement). */
  strength?: number;
  /** 0 to 1: extra blur toward the bottom of a tall pane. */
  progressive?: number;
  /** Index of refraction, about 1.5 for glass. */
  ior?: number;
  /** Chromatic aberration, 0 to about 0.1. */
  aberration?: number;
  /** dp of blur applied to the sampled page. */
  frost?: number;
  saturation?: number;
  specular?: number;
  lightX?: number;
  lightY?: number;
  /** ARGB ints from `processColor`. */
  tint?: number;
  glow?: number;
  specularColor?: number;
  /** Sample the page every frame (a pane that moves, or sits in something that moves). */
  animated?: boolean;
}

export const GlassTargetView: ComponentType<GlassTargetViewProps> | null = isRefractionSupported
  ? requireNativeView<GlassTargetViewProps>('RefractiveGlass', 'GlassTargetView')
  : null;

export const RefractiveGlassView: ComponentType<RefractiveGlassViewProps> | null = isRefractionSupported
  ? requireNativeView<RefractiveGlassViewProps>('RefractiveGlass', 'RefractiveGlassView')
  : null;
