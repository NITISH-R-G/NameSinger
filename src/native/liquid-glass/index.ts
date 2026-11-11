import { isRefractionSupported } from '../../../modules/refractive-glass';
import type { GlassRenderer } from './types';

export type { GlassRenderer, GlassRendererKind } from './types';

const RN_APPROXIMATION: GlassRenderer = { kind: 'rn-approximation', refractsBackdrop: false };
const AGSL_REFRACTION: GlassRenderer = { kind: 'agsl-refraction', refractsBackdrop: true };

/**
 * The glass renderer in use. On an Android 13+ build that includes the refractive-glass native
 * module it is the AGSL refraction renderer, which samples and bends the live page. Everywhere
 * else (Expo Go, iOS, older Android) it is the React Native approximation, which only blurs.
 */
export function getGlassRenderer(): GlassRenderer {
  return isRefractionSupported ? AGSL_REFRACTION : RN_APPROXIMATION;
}

export const isNativeLiquidGlassAvailable = false;
