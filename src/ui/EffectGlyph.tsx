import type { EffectId } from '../engine/effects';

// Tiny animated previews of each ink, drawn with SVG so they cost nothing to render.

const BASE = 'M6 22 C 14 8, 22 34, 30 20 S 44 8, 50 20';
const BOIL = [
  BASE,
  'M6 21 C 15 9, 21 33, 31 21 S 43 9, 50 19',
  'M7 22 C 13 7, 23 35, 29 19 S 45 7, 49 21',
];
const JITTER = [
  'M6 22 C 14 8, 22 34, 30 20 S 44 8, 50 20',
  'M6 23 C 15 9, 21 33, 30 21 S 43 9, 51 21',
  'M5 21 C 13 7, 23 35, 29 19 S 45 7, 50 19',
  'M6 22 C 15 8, 21 35, 31 20 S 44 9, 49 20',
];
const WOBBLE = [BASE, 'M6 20 C 14 14, 22 28, 30 22 S 44 12, 50 18', 'M6 24 C 14 4, 22 38, 30 18 S 44 4, 50 22', BASE];

function Line({ values, dur, discrete, color }: { values: string[]; dur: string; discrete: boolean; color: string }) {
  return (
    <path d={values[0]} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round">
      <animate
        attributeName="d"
        values={values.join(';')}
        dur={dur}
        repeatCount="indefinite"
        calcMode={discrete ? 'discrete' : 'spline'}
        {...(discrete
          ? {}
          : { keySplines: values.slice(1).map(() => '0.45 0 0.55 1').join(';'), keyTimes: values.map((_, i) => (i / (values.length - 1)).toFixed(3)).join(';') })}
      />
    </path>
  );
}

export function EffectGlyph({
  effect,
  color = 'currentColor',
  size = 44,
  dur,
}: {
  effect: EffectId;
  color?: string;
  size?: number;
  /** Override the animation speed (boil only), e.g. "0.3s". */
  dur?: string;
}) {
  return (
    <svg width={size} height={(size * 40) / 56} viewBox="0 0 56 40" aria-hidden="true" className="glyph">
      {effect === 'boil' && <Line values={BOIL} dur={dur ?? '0.375s'} discrete color={color} />}
      {effect === 'jitter' && <Line values={JITTER} dur="0.26s" discrete color={color} />}
      {effect === 'wobble' && <Line values={WOBBLE} dur="1.6s" discrete={false} color={color} />}
      {effect === 'shake' && (
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 2 -1.5; -2 1; 1.5 1.5; -1.5 -1"
            dur="0.42s"
            calcMode="discrete"
            repeatCount="indefinite"
          />
          <path d={BASE} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
        </g>
      )}
      {effect === 'crumple' && (
        <g stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none">
          <path d="M8 8 L22 5 L34 10 L48 6 L50 32 L36 35 L22 31 L8 34 Z" />
          <path strokeWidth={1.4} opacity={0.75}>
            <animate
              attributeName="d"
              values="M22 5 L26 18 L22 31 M34 10 L28 20 L36 35 M8 20 L26 18 L50 22;M22 5 L19 20 L22 31 M34 10 L38 19 L36 35 M8 18 L30 21 L50 19;M22 5 L24 15 L22 31 M34 10 L31 23 L36 35 M8 22 L22 17 L50 24"
              dur="0.75s"
              calcMode="discrete"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}
    </svg>
  );
}
