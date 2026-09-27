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
  },
];

export const EFFECT_BY_ID: Record<EffectId, EffectDef> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e]),
) as Record<EffectId, EffectDef>;

/** Different ink groups (effect + settings combos) per artwork. Must match MAX_SLOTS in shaders.ts. */
export const MAX_INKS = 16;

/** Choices for the ink overlay color (shown while painting). */
export const OVERLAY_COLORS = [
  { id: 'orange', label: 'Orange', hex: '#ff8a3d' },
  { id: 'blue', label: 'Light blue', hex: '#4cc9ff' },
  { id: 'pink', label: 'Pink', hex: '#ff5d8f' },
  { id: 'green', label: 'Green', hex: '#4ee07a' },
];
