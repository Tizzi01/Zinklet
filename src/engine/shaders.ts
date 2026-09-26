// Single-pass renderer. All textures hold premultiplied RGBA; output is premultiplied.
// Effect branches (uType) must match `shaderId` in effects.ts.

export const MAX_SLOTS = 8;

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
uniform float uPhase[${MAX_SLOTS}];    // 0..1 loop phase for continuous inks (none yet)
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

void main() {
  vec2 p = vUv * uSize;
  vec2 dWhole = vec2(0.0);
  vec2 dLines = vec2(0.0);
  float wLines = 0.0;
  vec3 tint = vec3(0.0);
  float tintA = 0.0;

  for (int i = 0; i < ${MAX_SLOTS}; i++) {
    int t = uType[i];
    if (t < 0) continue;
    float m = texture(uMasks, vec3(vUv, float(i))).r;
    if (m < 0.003) continue;

    uint seed = uint(uSeed[i]);
    vec2 q = p / uScale[i];
    // Boil: a fresh smooth distortion field every step.
    vec2 d = vnoise(q, seed) * uAmp[i];

    if (uLinesOnly[i] > 0.5) {
      dLines += d * m;
      wLines = max(wLines, m);
    } else {
      dWhole += d * m;
    }
    tint += uTint[i] * m * uTintA[i];
    tintA = max(tintA, m * uTintA[i]);
  }

  vec2 uvW = (p - dWhole) / uSize;
  vec4 col = texture(uSrc, uvW);
  if (wLines > 0.001) {
    vec4 f = texture(uFill, uvW);
    vec4 l = texture(uLines, (p - dWhole - dLines) / uSize);
    vec4 dec = l + f * (1.0 - l.a);
    col = mix(col, dec, wLines);
  }
  col.rgb = min(col.rgb, vec3(col.a));

  if (uShowLines > 0.5) {
    float la = texture(uLines, vUv).a;
    col = mix(col, vec4(1.0, 0.18, 0.55, 1.0), la * 0.85);
  }
  if (uShowMask > 0.001 && tintA > 0.001) {
    vec3 tc = tint / max(tintA, 1e-4);
    tc = tc / max(max(tc.r, tc.g), max(tc.b, 1e-4)) * 0.95;
    float a = tintA * 0.38 * uShowMask;
    col = vec4(col.rgb * (1.0 - a) + tc * a, col.a + a * (1.0 - col.a));
  }
  outColor = col;
}`;
