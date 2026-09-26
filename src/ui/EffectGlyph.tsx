import type { EffectId } from '../engine/effects';

// Tiny animated preview of an ink, drawn with SVG so it costs nothing to render.

const BOIL = [
  'M6 22 C 14 8, 22 34, 30 20 S 44 8, 50 20',
  'M6 21 C 15 9, 21 33, 31 21 S 43 9, 50 19',
  'M7 22 C 13 7, 23 35, 29 19 S 45 7, 49 21',
];

export function EffectGlyph({
  effect,
  color = 'currentColor',
  size = 44,
  dur = '0.375s',
}: {
  effect: EffectId;
  color?: string;
  size?: number;
  dur?: string;
}) {
  return (
    <svg width={size} height={(size * 40) / 56} viewBox="0 0 56 40" aria-hidden="true" className="glyph" data-effect={effect}>
      <path d={BOIL[0]} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round">
        <animate attributeName="d" values={BOIL.join(';')} dur={dur} repeatCount="indefinite" calcMode="discrete" />
      </path>
    </svg>
  );
}
