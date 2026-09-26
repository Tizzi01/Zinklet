// Catalog of invisible inks. The `shaderId` must match the branches in shaders.ts.

export type EffectId = 'boil' | 'jitter' | 'wobble' | 'shake' | 'crumple';

export interface InkParams {
  /** 0–100: how far lines move (or how deep crumple shading goes). */
  strength: number;
  /** Steps per second for stepped inks, cycles per second for continuous inks. */
  speed: number;
  /** 0–100: size of the wiggles. */
  size: number;
  /** Move only the detected linework and keep colors still. */
  linesOnly: boolean;
}

export interface EffectDef {
  id: EffectId;
  shaderId: number;
  name: string;
  blurb: string;
  /** Stepped inks jump between random poses at `speed` fps; continuous ones flow. */
  stepped: boolean;
  /** Max displacement in "units" (1 unit = 1/1000 of the image's long side). */
  ampUnits: number;
  /** Wiggle feature size range in units, mapped from params.size 0–100. */
  sizeUnits: [number, number];
  speedRange: { min: number; max: number; step: number };
  hasSize: boolean;
  defaults: InkParams;
  /** Included in the free plan. */
  free: boolean;
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'boil',
    shaderId: 0,
    name: 'Boil',
    blurb: 'Classic hand-drawn line boil',
    stepped: true,
    ampUnits: 5,
    sizeUnits: [6, 60],
    speedRange: { min: 2, max: 24, step: 1 },
    hasSize: true,
    defaults: { strength: 45, speed: 8, size: 40, linesOnly: true },
    free: true,
  },
  {
    id: 'jitter',
    shaderId: 1,
    name: 'Jitter',
    blurb: 'Nervous, scratchy shiver',
    stepped: true,
    ampUnits: 3.5,
    sizeUnits: [1.5, 12],
    speedRange: { min: 4, max: 30, step: 1 },
    hasSize: true,
    defaults: { strength: 45, speed: 15, size: 40, linesOnly: true },
    free: true,
  },
  {
    id: 'wobble',
    shaderId: 2,
    name: 'Wobble',
    blurb: 'Smooth, jelly-like sway',
    stepped: false,
    ampUnits: 14,
    sizeUnits: [30, 320],
    speedRange: { min: 0.25, max: 3, step: 0.25 },
    hasSize: true,
    defaults: { strength: 40, speed: 1, size: 50, linesOnly: false },
    free: true,
  },
  {
    id: 'shake',
    shaderId: 3,
    name: 'Shake',
    blurb: 'Rattles the whole area',
    stepped: true,
    ampUnits: 10,
    sizeUnits: [20, 20],
    speedRange: { min: 2, max: 24, step: 1 },
    hasSize: false,
    defaults: { strength: 35, speed: 12, size: 50, linesOnly: false },
    free: false,
  },
  {
    id: 'crumple',
    shaderId: 4,
    name: 'Crumple',
    blurb: 'Shifting crumpled-paper texture',
    stepped: true,
    ampUnits: 2.5,
    sizeUnits: [18, 170],
    speedRange: { min: 1, max: 12, step: 1 },
    hasSize: true,
    defaults: { strength: 50, speed: 4, size: 62, linesOnly: false },
    free: false,
  },
];

export const EFFECT_BY_ID: Record<EffectId, EffectDef> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e]),
) as Record<EffectId, EffectDef>;

/** Mask tint colors, one per ink slot. Bright so they read on any artwork. */
export const INK_COLORS = [
  '#ff5d8f',
  '#3fd0ff',
  '#ffd23f',
  '#7cff6b',
  '#b18cff',
  '#ff9f43',
  '#4dffd2',
  '#ff6bf0',
];

export const MAX_INKS = 8;
