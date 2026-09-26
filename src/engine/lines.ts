// Splits artwork into a "lines" layer (dark linework) and a "fill" layer where the
// linework has been painted out with nearby colors (pull-push inpainting).
// "Lines only" inks move the lines layer over the still fill layer, so colors don't smear.

export interface Decomposition {
  /** Premultiplied RGBA of the original art. */
  src: Uint8Array;
  /** Premultiplied RGBA of the detected linework. */
  lines: Uint8Array;
  /** Premultiplied RGBA of the art with linework painted out. */
  fill: Uint8Array;
}

interface Level {
  w: number;
  h: number;
  /** Normalized premultiplied RGBA (0..1). */
  v: Float32Array;
  /** Confidence 0..1. */
  c: Float32Array;
}

/** sensitivity 0–100: higher counts lighter strokes as lines. */
export function sensitivityToThreshold(sensitivity: number): number {
  return 0.08 + 0.72 * (sensitivity / 100);
}

export function premultiply(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    out[i] = (rgba[i] * a + 127) / 255;
    out[i + 1] = (rgba[i + 1] * a + 127) / 255;
    out[i + 2] = (rgba[i + 2] * a + 127) / 255;
    out[i + 3] = a;
  }
  return out;
}

/** 0..1 "how much is this pixel linework", from darkness and alpha. */
function lineCoverage(rgba: Uint8ClampedArray, n: number, threshold: number): Float32Array {
  const cov = new Float32Array(n);
  const soft = 0.1;
  const lo = threshold - soft;
  const hi = threshold + soft;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    if (a < 0.02) continue;
    const lum = (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255;
    let dark = (hi - lum) / (hi - lo);
    dark = dark <= 0 ? 0 : dark >= 1 ? 1 : dark * dark * (3 - 2 * dark);
    // Faint alpha fringes count proportionally less.
    const alphaW = a >= 0.3 ? 1 : a / 0.3;
    cov[i] = dark * alphaW;
  }
  return cov;
}

function downsample(prev: Level): Level {
  const w = Math.max(1, (prev.w + 1) >> 1);
  const h = Math.max(1, (prev.h + 1) >> 1);
  const v = new Float32Array(w * h * 4);
  const c = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sw = 0, r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) {
        const py = 2 * y + dy;
        if (py >= prev.h) continue;
        for (let dx = 0; dx < 2; dx++) {
          const px = 2 * x + dx;
          if (px >= prev.w) continue;
          const pi = py * prev.w + px;
          const cw = prev.c[pi];
          if (cw <= 0) continue;
          sw += cw;
          r += prev.v[pi * 4] * cw;
          g += prev.v[pi * 4 + 1] * cw;
          b += prev.v[pi * 4 + 2] * cw;
          a += prev.v[pi * 4 + 3] * cw;
        }
      }
      const i = y * w + x;
      if (sw > 0) {
        v[i * 4] = r / sw;
        v[i * 4 + 1] = g / sw;
        v[i * 4 + 2] = b / sw;
        v[i * 4 + 3] = a / sw;
      }
      c[i] = Math.min(1, sw);
    }
  }
  return { w, h, v, c };
}

/** Bilinear sample of a coarse level at fine-pixel coordinates (x, y) of a level twice its size. */
function sampleUp(coarse: Level, x: number, y: number, out: Float32Array) {
  let cx = x * 0.5 - 0.25;
  let cy = y * 0.5 - 0.25;
  if (cx < 0) cx = 0;
  if (cy < 0) cy = 0;
  let x0 = Math.floor(cx);
  let y0 = Math.floor(cy);
  if (x0 > coarse.w - 1) x0 = coarse.w - 1;
  if (y0 > coarse.h - 1) y0 = coarse.h - 1;
  const x1 = Math.min(coarse.w - 1, x0 + 1);
  const y1 = Math.min(coarse.h - 1, y0 + 1);
  const fx = Math.min(1, cx - x0);
  const fy = Math.min(1, cy - y0);
  const i00 = (y0 * coarse.w + x0) * 4;
  const i10 = (y0 * coarse.w + x1) * 4;
  const i01 = (y1 * coarse.w + x0) * 4;
  const i11 = (y1 * coarse.w + x1) * 4;
  const v = coarse.v;
  for (let k = 0; k < 4; k++) {
    const top = v[i00 + k] + (v[i10 + k] - v[i00 + k]) * fx;
    const bot = v[i01 + k] + (v[i11 + k] - v[i01 + k]) * fx;
    out[k] = top + (bot - top) * fy;
  }
}

/** 3×3 max filter, so antialiased line fringes are treated as linework too. */
function dilate(cov: Float32Array, W: number, H: number): Float32Array {
  const tmp = new Float32Array(cov.length);
  const out = new Float32Array(cov.length);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let m = cov[row + x];
      if (x > 0 && cov[row + x - 1] > m) m = cov[row + x - 1];
      if (x < W - 1 && cov[row + x + 1] > m) m = cov[row + x + 1];
      tmp[row + x] = m;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let m = tmp[i];
      if (y > 0 && tmp[i - W] > m) m = tmp[i - W];
      if (y < H - 1 && tmp[i + W] > m) m = tmp[i + W];
      out[i] = m;
    }
  }
  return out;
}

/**
 * Pull-push inpainting: pixels with confidence < 1 are (partly) replaced by a smooth
 * average of confident neighbors. Writes normalized premultiplied RGBA into `v0`.
 */
function pullPush(src: Uint8Array, conf: Float32Array, W: number, H: number, v0: Float32Array) {
  const n = W * H;
  for (let i = 0; i < n * 4; i++) v0[i] = src[i] / 255;
  const levels: Level[] = [{ w: W, h: H, v: v0, c: conf }];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    levels.push(downsample(levels[levels.length - 1]));
  }
  const tmp = new Float32Array(4);
  for (let li = levels.length - 2; li >= 0; li--) {
    const lv = levels[li];
    const coarse = levels[li + 1];
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const i = y * lv.w + x;
        const c = lv.c[i];
        if (c >= 1) continue;
        sampleUp(coarse, x, y, tmp);
        const k = i * 4;
        lv.v[k] = lv.v[k] * c + tmp[0] * (1 - c);
        lv.v[k + 1] = lv.v[k + 1] * c + tmp[1] * (1 - c);
        lv.v[k + 2] = lv.v[k + 2] * c + tmp[2] * (1 - c);
        lv.v[k + 3] = lv.v[k + 3] * c + tmp[3] * (1 - c);
      }
    }
  }
}

export function decompose(image: ImageData, sensitivity: number): Decomposition {
  const { width: W, height: H, data } = image;
  const n = W * H;
  const src = premultiply(data);
  const cov = lineCoverage(data, n, sensitivityToThreshold(sensitivity));
  const work = new Float32Array(n * 4);
  const conf = new Float32Array(n);

  // 1) Fill layer: paint out the linework (and its antialiased fringe) with nearby colors.
  const grown = dilate(cov, W, H);
  for (let i = 0; i < n; i++) {
    const d = grown[i];
    conf[i] = d <= 0.02 ? 1 : d >= 0.3 ? 0 : 1 - (d - 0.02) / 0.28;
  }
  pullPush(src, conf, W, H, work);
  const fill = new Uint8Array(n * 4);
  for (let i = 0; i < n * 4; i++) fill[i] = work[i] * 255 + 0.5;

  // 2) Line color: recover the pure ink color from line centers, so moved edges don't
  //    carry the background color along with them.
  let solid = 0;
  for (let i = 0; i < n; i++) {
    const c = cov[i];
    conf[i] = c <= 0.55 ? 0 : c >= 0.95 ? 1 : (c - 0.55) / 0.4;
    solid += conf[i];
  }
  // Only faint lines detected: use them as-is rather than losing them.
  if (solid === 0) conf.set(cov);
  pullPush(src, conf, W, H, work);
  const lines = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const cv = cov[i];
    if (cv <= 0) continue;
    const k = i * 4;
    const f = cv * 255;
    lines[k] = work[k] * f + 0.5;
    lines[k + 1] = work[k + 1] * f + 0.5;
    lines[k + 2] = work[k + 2] * f + 0.5;
    lines[k + 3] = work[k + 3] * f + 0.5;
  }
  return { src, lines, fill };
}
