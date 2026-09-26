import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { Engine } from './Engine';
import { exportSize, type Background, type ExportOptions, type ExportResult } from './exportOptions';

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = Math.max(11, Math.round(Math.min(w, h) * 0.032));
  const pad = Math.round(size * 0.7);
  ctx.save();
  ctx.font = `700 ${size}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = size * 0.4;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('made with Zinklet', w - pad, h - pad);
  ctx.restore();
}

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportAnimation(
  engine: Engine,
  opts: ExportOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const { w, h } = exportSize(engine, opts);
  const background: Background = opts.format === 'mp4' && opts.background === 'transparent' ? 'white' : opts.background;
  const framesPerLoop = Math.max(1, Math.round(engine.loopSeconds * opts.fps));
  const total = opts.format === 'gif' ? framesPerLoop : framesPerLoop * Math.max(1, opts.repeats);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: opts.format === 'gif' })!;
  ctx.imageSmoothingQuality = 'high';

  const drawFrame = (i: number) => {
    const t = ((i % framesPerLoop) / framesPerLoop) * engine.loopSeconds;
    engine.renderFrame(t, { maskAlpha: 0, showLines: false });
    ctx.clearRect(0, 0, w, h);
    if (background !== 'transparent' || !engine.hasAlpha) {
      ctx.fillStyle = background === 'black' ? '#000' : '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(engine.canvas, 0, 0, w, h);
    if (opts.watermark) drawWatermark(ctx, w, h);
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  engine.busy = true;
  try {
    if (opts.format === 'gif') {
      const transparent = background === 'transparent' && engine.hasAlpha;
      const gif = GIFEncoder();
      const delay = Math.round(1000 / opts.fps);
      for (let i = 0; i < total; i++) {
        if (signal.aborted) throw new ExportCancelled();
        drawFrame(i);
        const { data } = ctx.getImageData(0, 0, w, h);
        if (transparent) {
          const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
          const index = applyPalette(data, palette, 'rgba4444');
          const ti = palette.findIndex((c) => c[3] === 0);
          gif.writeFrame(index, w, h, {
            palette,
            delay,
            transparent: ti >= 0,
            transparentIndex: Math.max(0, ti),
            dispose: 2,
          });
        } else {
          const palette = quantize(data, 256);
          const index = applyPalette(data, palette);
          gif.writeFrame(index, w, h, { palette, delay });
        }
        onProgress((i + 1) / total);
        await nextTask();
      }
      gif.finish();
      return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), filename: `zinklet-${stamp}.gif` };
    }

    const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'hevc'], { width: w, height: h });
    if (!codec) {
      throw new Error("This browser can't make videos yet. Try GIF, or use Chrome, Edge or Safari.");
    }
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    const source = new CanvasSource(out, { codec, quality: QUALITY_HIGH, keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: opts.fps });
    await output.start();
    for (let i = 0; i < total; i++) {
      if (signal.aborted) {
        await output.cancel();
        throw new ExportCancelled();
      }
      drawFrame(i);
      await source.add(i / opts.fps, 1 / opts.fps);
      onProgress((i + 1) / total);
    }
    await output.finalize();
    const buffer = output.target.buffer!;
    return { blob: new Blob([buffer], { type: 'video/mp4' }), filename: `zinklet-${stamp}.mp4` };
  } finally {
    engine.busy = false;
    engine.invalidate();
  }
}
