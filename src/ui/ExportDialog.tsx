import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Image as ImageIcon, Share, X } from 'lucide-react';
import { exportSize, type Background, type ExportFormat, type ExportResult } from '../engine/exportOptions';
import { Segmented, Toggle } from './controls';
import { toast, useEngine } from './store';

type SizeKey = 'small' | 'hd' | 'full';
const SIZE_SIDE: Record<SizeKey, number | null> = { small: 720, hd: 1920, full: null };

function formatBytes(n: number) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

function download(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const e = useEngine();
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [size, setSize] = useState<SizeKey>('hd');
  const [smooth, setSmooth] = useState(false);
  const [length, setLength] = useState<'loop' | '6' | '15'>('6');
  const [background, setBackground] = useState<Background>('white');
  const [watermark, setWatermark] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setSize(format === 'gif' ? 'small' : 'hd');
    if (format === 'mp4' && background === 'transparent') setBackground('white');
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  useEffect(() => setResult(null), [size, smooth, length, background, watermark]);

  const fps = format === 'gif' ? (smooth ? 24 : 12) : smooth ? 60 : 30;
  const repeats = length === 'loop' ? 1 : Math.max(1, Math.ceil(Number(length) / e.loopSeconds));

  const longSide = Math.max(e.width, e.height);
  const sizeOptions = useMemo(() => {
    const opts: { value: SizeKey; label: string }[] = [];
    if (longSide > 720) opts.push({ value: 'small', label: 'Small · 720' });
    if (longSide > 1920) opts.push({ value: 'hd', label: 'HD · 1920' });
    opts.push({ value: 'full', label: `Full · ${longSide}` });
    return opts;
  }, [longSide]);
  const sizeKey: SizeKey = sizeOptions.some((o) => o.value === size) ? size : 'full';
  const dims = exportSize(e, { format, maxSide: SIZE_SIDE[sizeKey] });

  const busy = progress !== null;

  const run = async () => {
    setError(null);
    setResult(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      const { exportAnimation } = await import('../engine/export');
      const r = await exportAnimation(
        e,
        { format, maxSide: SIZE_SIDE[sizeKey], fps, repeats, background, watermark },
        setProgress,
        abort.current.signal,
      );
      setResult(r);
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ExportCancelled')) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setProgress(null);
    }
  };

  const canShare =
    result && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([result.blob], result.filename, { type: result.blob.type })] });

  const share = async () => {
    if (!result) return;
    try {
      await navigator.share({ files: [new File([result.blob], result.filename, { type: result.blob.type })] });
    } catch {
      /* user closed the share sheet */
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(ev) => ev.target === ev.currentTarget && !busy && onClose()}>
      <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="modal-head">
          <h2 id="export-title">Export</h2>
          <button type="button" className="ghost-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="format-cards">
          <button type="button" className={format === 'mp4' ? 'on' : ''} onClick={() => setFormat('mp4')} disabled={busy}>
            <Film size={22} />
            <b>Video</b>
            <small>MP4 · TikTok, Reels, Shorts</small>
          </button>
          <button type="button" className={format === 'gif' ? 'on' : ''} onClick={() => setFormat('gif')} disabled={busy}>
            <ImageIcon size={22} />
            <b>GIF</b>
            <small>Discord, stickers, emotes</small>
          </button>
        </div>

        <Segmented label="Size" value={sizeKey} options={sizeOptions} onChange={setSize} />
        <p className="field-hint">
          {dims.w} × {dims.h} px{format === 'gif' && dims.w * dims.h > 700_000 ? ' · big GIFs can be slow to share' : ''}
        </p>

        {format === 'mp4' && (
          <Segmented
            label="Length"
            value={length}
            options={[
              { value: 'loop', label: `1 loop (${e.loopSeconds}s)` },
              { value: '6', label: '~6s' },
              { value: '15', label: '~15s' },
            ]}
            onChange={setLength}
          />
        )}

        {e.hasAlpha && (
          <Segmented
            label="Background"
            value={background}
            options={[
              { value: 'white', label: 'White' },
              { value: 'black', label: 'Black' },
              { value: 'transparent', label: 'Transparent', disabled: format === 'mp4', title: format === 'mp4' ? 'Videos can’t be transparent — use GIF' : undefined },
            ]}
            onChange={setBackground}
          />
        )}

        <Toggle label="Extra smooth" hint={`${fps} frames per second`} checked={smooth} onChange={setSmooth} />
        <Toggle label="“made with Zinklet” tag" hint="Optional — helps other artists find the app" checked={watermark} onChange={setWatermark} />

        {error && <p className="error-note">{error}</p>}

        {busy ? (
          <div className="progress-row">
            <div className="progress">
              <div style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
            <button type="button" className="ghost-btn" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </div>
        ) : result ? (
          <div className="result-row">
            <span className="muted">
              {result.filename} · {formatBytes(result.blob.size)}
            </span>
            <div className="result-actions">
              {canShare && (
                <button type="button" className="secondary-btn" onClick={share}>
                  <Share size={17} /> Share
                </button>
              )}
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  download(result);
                  toast('Saved to your downloads');
                }}
              >
                <Download size={17} /> Save
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="primary-btn wide" onClick={run}>
            Export {format === 'mp4' ? 'video' : 'GIF'}
          </button>
        )}
      </div>
    </div>
  );
}
