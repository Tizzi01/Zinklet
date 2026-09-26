import type { Engine } from './Engine';

// Lightweight types and helpers the UI needs without loading the encoders.

export type ExportFormat = 'mp4' | 'gif';
export type Background = 'white' | 'black' | 'transparent';

export interface ExportOptions {
  format: ExportFormat;
  /** Long side in pixels, or null for the full working resolution. */
  maxSide: number | null;
  fps: number;
  /** How many times the loop plays in the file (video only; GIFs loop forever). */
  repeats: number;
  background: Background;
  watermark: boolean;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export function exportSize(engine: Engine, opts: Pick<ExportOptions, 'maxSide' | 'format'>) {
  const s = opts.maxSide ? Math.min(1, opts.maxSide / Math.max(engine.width, engine.height)) : 1;
  let w = Math.max(2, Math.round(engine.width * s));
  let h = Math.max(2, Math.round(engine.height * s));
  if (opts.format === 'mp4') {
    // H.264 wants even dimensions.
    w -= w % 2;
    h -= h % 2;
  }
  return { w, h };
}
