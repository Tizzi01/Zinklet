// Catalog of invisible inks. The `shaderId` must match the branches in shaders.ts.
// We're perfecting one ink at a time; earlier experiments (jitter, wobble, shake, crumple)
// live in git tag v0.0 if we want to bring them back.

export type EffectId = 'boil';

export interface InkParams {
  /** 0–100: how far lines move. */
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
