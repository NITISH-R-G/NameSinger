import type { CloudRole } from './orbPalettes';

/**
 * The geometry and motion of the orb's six drifting clouds. Their colours come from the selected
 * orb palette (orbPalettes.ts) through `role`; only the opacity pattern is fixed here, so every
 * colour identity flows the same way.
 */
export interface CloudSpec {
  id: string;
  role: CloudRole;
  /** Centre of the cloud and its radius, as fractions of the orb's diameter. */
  cx: number;
  cy: number;
  r: number;
  /** Gradient stops as [offset, opacity]; the colour is the palette's colour for the role. */
  stops: readonly (readonly [offset: number, opacity: number])[];
  /** Milliseconds for one turn around the orb's centre. Different per cloud so the flow never repeats in step. */
  spinMs: number;
  direction: 1 | -1;
  /** White clouds that brighten when the sound is louder. */
  lifts: boolean;
}

export const CLOUDS: readonly CloudSpec[] = [
  {
    id: 'indigo',
    role: 'indigo',
    cx: 0.6,
    cy: 0.82,
    r: 0.72,
    stops: [[0, 1], [0.55, 0.7], [1, 0]],
    spinMs: 26000,
    direction: 1,
    lifts: false,
  },
  {
    id: 'violet',
    role: 'violet',
    cx: 0.2,
    cy: 0.7,
    r: 0.62,
    stops: [[0, 1], [0.6, 0.55], [1, 0]],
    spinMs: 19000,
    direction: -1,
    lifts: false,
  },
  {
    id: 'sky',
    role: 'sky',
    cx: 0.78,
    cy: 0.3,
    r: 0.5,
    stops: [[0, 0.95], [1, 0]],
    spinMs: 23000,
    direction: -1,
    lifts: false,
  },
  {
    id: 'white',
    role: 'white',
    cx: 0.38,
    cy: 0.16,
    r: 0.46,
    stops: [[0, 0.92], [0.6, 0.45], [1, 0]],
    spinMs: 16000,
    direction: 1,
    lifts: true,
  },
  {
    id: 'mist',
    role: 'mist',
    cx: 0.7,
    cy: 0.52,
    r: 0.3,
    stops: [[0, 0.55], [1, 0]],
    spinMs: 12000,
    direction: -1,
    lifts: true,
  },
  {
    id: 'wisp',
    role: 'wisp',
    cx: 0.14,
    cy: 0.34,
    r: 0.28,
    stops: [[0, 0.6], [1, 0]],
    spinMs: 31000,
    direction: 1,
    lifts: true,
  },
];
