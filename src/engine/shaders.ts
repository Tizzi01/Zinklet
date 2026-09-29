// Single-pass renderer. All textures hold premultiplied RGBA; output is premultiplied.
// Effect branches (uType) must match `shaderId` in effects.ts.

export const MAX_SLOTS = 16;

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // aPos is 0..1; uv (0,0) is the top-left of the image (row 0 of every texture).
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSrc;
uniform sampler2D uLines;
uniform sampler2D uFill;
uniform sampler2DArray uMasks;
uniform vec2 uSize;

uniform int uType[${MAX_SLOTS}];       // -1 = slot unused / hidden
uniform float uAmp[${MAX_SLOTS}];      // max displacement in image px
uniform float uScale[${MAX_SLOTS}];    // wiggle feature size in image px
uniform float uSeed[${MAX_SLOTS}];     // changes every step for stepped inks
uniform float uPhase[${MAX_SLOTS}];    // 0..1 loop phase for continuous inks
uniform float uStrength[${MAX_SLOTS}]; // 0..1
uniform float uLinesOnly[${MAX_SLOTS}];
uniform vec3 uTint[${MAX_SLOTS}];
uniform float uTintA[${MAX_SLOTS}];  // overlay weight per ink (active ink is brighter)

uniform float uShowMask;             // 0..1 overall ink overlay opacity
uniform float uShowLines;

uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}

vec2 grad(vec2 cell, uint seed) {
  uvec2 h = pcg2d(uvec2(ivec2(cell) + 32768) + uvec2(seed, seed * 7919u));
  float a = float(h.x) * (6.28318530718 / 4294967295.0);
  return vec2(cos(a), sin(a));
}

// Gradient noise, roughly -1..1.
float gnoise(vec2 p, uint seed) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i, seed), f);
  float b = dot(grad(i + vec2(1.0, 0.0), seed), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0), seed), f - vec2(0.0, 1.0));
  float d = dot(grad(i + vec2(1.0, 1.0), seed), f - vec2(1.0, 1.0));
  return 1.45 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 vnoise(vec2 p, uint seed) {
  return vec2(gnoise(p, seed), gnoise(p + vec2(41.3, 17.9), seed ^ 0x9E3779B9u));
}

// Folded-paper height: big creases plus fainter small ones.
float ridged(vec2 q, uint seed) {
  float sum = 0.0;
  float amp = 0.62;
  float freq = 1.0;
  for (int o = 0; o < 3; o++) {
    float n = 1.0 - abs(gnoise(q * freq, seed + uint(o) * 131u));
    sum += n * amp;
    amp *= 0.33;
    freq *= 2.3;
  }
  return sum;
}

void main() {
  vec2 p = vUv * uSize;
  vec2 dWhole = vec2(0.0);
  vec2 dLines = vec2(0.0);
  float wLines = 0.0;
  float shade = 1.0;
  vec3 tint = vec3(0.0);
  float tintA = 0.0;

  for (int i = 0; i < ${MAX_SLOTS}; i++) {
    int t = uType[i];
    if (t < 0) continue;
    float m = texture(uMasks, vec3(vUv, float(i))).r;
    if (m < 0.003) continue;

    uint seed = uint(uSeed[i]);
    vec2 q = p / uScale[i];
    vec2 d = vec2(0.0);

    if (t == 0) {
      // Boil: a fresh smooth distortion field every step.
      d = vnoise(q, seed) * uAmp[i];
    } else if (t == 1) {
      // Jitter: finer, two octaves for a scratchy feel.
      d = (vnoise(q, seed) * 0.7 + vnoise(q * 2.3, seed + 77u) * 0.3) * uAmp[i];
    } else if (t == 2) {
      // Wobble: two fields rotated through a circle so the motion loops smoothly.
      float a = uPhase[i] * 6.28318530718;
      d = (vnoise(q, seed) * cos(a) + vnoise(q, seed + 1u) * sin(a)) * uAmp[i];
    } else if (t == 3) {
      // Shake: rigid random offset per step with a little extra boil.
      uvec2 h = pcg2d(uvec2(seed, 17u));
      vec2 r = vec2(h) / 4294967295.0 * 2.0 - 1.0;
      d = r * uAmp[i] + vnoise(p / 40.0, seed) * uAmp[i] * 0.12;
    } else if (t == 4) {
      // Crumple: ridged "paper fold" height field; shade by its slope and nudge along it.
      float e = 1.5 / uScale[i]; // ~1.5px finite difference
      float h0 = ridged(q, seed);
      float hx = ridged(q + vec2(e, 0.0), seed);
      float hy = ridged(q + vec2(0.0, e), seed);
      vec2 g = vec2(hx - h0, hy - h0) / e;
      vec3 n = normalize(vec3(-g * 0.28, 1.0));
      vec3 L = normalize(vec3(-0.55, -0.65, 0.55));
      float lit = dot(n, L) - L.z;
      shade *= mix(1.0, clamp(1.0 + lit * 1.1 * uStrength[i], 0.68, 1.22), m);
      d = g / (1.0 + length(g)) * uAmp[i];
    }

    if (uLinesOnly[i] > 0.5) {
      dLines += d * m;
      wLines = max(wLines, m);
    } else {
      dWhole += d * m;
    }
  }

  vec2 uvW = (p - dWhole) / uSize;
  vec4 col = texture(uSrc, uvW);
  if (wLines > 0.001) {
    vec4 f = texture(uFill, uvW);
    vec4 l = texture(uLines, (p - dWhole - dLines) / uSize);
    vec4 dec = l + f * (1.0 - l.a);
    col = mix(col, dec, wLines);
  }
  col.rgb = clamp(col.rgb * shade, 0.0, 1.0);
  col.rgb = min(col.rgb, vec3(col.a));

  if (uShowLines > 0.5) {
    float la = texture(uLines, vUv).a;
    col = mix(col, vec4(1.0, 0.18, 0.55, 1.0), la * 0.85);
  }
  if (uShowMask > 0.001) {
    // The ink overlay moves with the art: read each mask where this pixel's content came from.
    vec2 uvInk = (p - dWhole - dLines) / uSize;
    tint = vec3(0.0);
    tintA = 0.0;
    for (int i = 0; i < ${MAX_SLOTS}; i++) {
      if (uType[i] < 0) continue;
      float m = texture(uMasks, vec3(uvInk, float(i))).r;
      tint += uTint[i] * m * uTintA[i];
      tintA = max(tintA, m * uTintA[i]);
    }
  }
  if (uShowMask > 0.001 && tintA > 0.001) {
    vec3 tc = tint / max(tintA, 1e-4);
    tc = tc / max(max(tc.r, tc.g), max(tc.b, 1e-4)) * 0.95;
    float a = tintA * 0.38 * uShowMask;
    col = vec4(col.rgb * (1.0 - a) + tc * a, col.a + a * (1.0 - col.a));
  }
  outColor = col;
}`;
