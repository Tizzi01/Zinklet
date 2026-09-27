import { useEffect, useState } from 'react';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import { EFFECT_BY_ID } from '../engine/effects';
import { commitArtPlacement, engine, presetPlacement, useAdvanced, useBrushPreview, useEngine, useToast, viewCommands } from './store';

export function Hint() {
  const e = useEngine();
  if (!e.hasImage || e.anyPaint || e.isStroking || e.tool === 'move') return null;
  const brushName = EFFECT_BY_ID[e.inkBrush.effect].name;
  return (
    <div className="hint" onPointerDown={(ev) => ev.stopPropagation()}>
      <span>
        Brush over the lines you want to bring to life with <b style={{ color: e.overlayColor }}>{brushName}</b>
      </span>
      <button type="button" className="primary-btn small" onClick={() => e.fillWithBrush()}>
        <Sparkles size={15} /> Animate everything
      </button>
    </div>
  );
}

export function Toast() {
  const t = useToast();
  return (
    <div className="toast-layer" aria-live="polite">
      {t && (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      )}
    </div>
  );
}

export function ZoomBadge({ zoom }: { zoom: number }) {
  const e = useEngine();
  if (!e.hasImage) return null;
  return (
    <button type="button" className="zoom-badge" onClick={() => viewCommands.fit()} title="Fit to screen (Ctrl+0)">
      {Math.round(zoom * 100)}%
    </button>
  );
}

export function DropOverlay() {
  return (
    <div className="drop-overlay">
      <div>
        <ImagePlus size={40} />
        <p>Drop your art to import it</p>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Move & resize art'],
  ['B', 'Ink brush'],
  ['E', 'Eraser'],
  ['Arrows', 'Nudge art (Move tool; Shift = 10px)'],
  ['[  ]', 'Brush size'],
  ['Ctrl Z', 'Undo'],
  ['Ctrl Shift Z / Ctrl Y', 'Redo'],
  ['Space + drag', 'Pan'],
  ['Scroll / Ctrl + scroll', 'Zoom'],
  ['Ctrl 0', 'Fit to screen'],
  ['Ctrl 1', 'Actual size'],
  ['P', 'Play / pause'],
  ['H', 'Always show ink / hide ink'],
  ['L', 'Inks panel'],
  ['1 – 5', 'Brush effect (Boil, Jitter, Wobble, Shake, Crumple)'],
  ['Tab', 'Hide interface'],
  ['Ctrl I / Ctrl O', 'Import art'],
  ['Ctrl E', 'Export'],
];

const GESTURES: [string, string][] = [
  ['Pinch', 'Zoom and move'],
  ['Two-finger tap', 'Undo'],
  ['Three-finger tap', 'Redo'],
  ['Pen', 'Paints with pressure; fingers then only navigate'],
  ['Pen eraser end', 'Erases'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onPointerDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <div className="modal-head">
          <h2 id="sc-title">Shortcuts & gestures</h2>
          <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="shortcut-cols">
          <dl>
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <dl>
            {GESTURES.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export function StatsOverlay() {
  const adv = useAdvanced();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!adv.stats) return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [adv.stats]);
  if (!adv.stats) return null;
  return (
    <div className="stats-overlay">
      {engine.stats.fps} redraws/s · {engine.stats.drawMs.toFixed(1)} ms · {engine.width}×{engine.height}
    </div>
  );
}

/** While resizing the brush, show it at its real on-screen size in the middle of the canvas. */
export function BrushSizePreview({ zoom }: { zoom: number }) {
  const e = useEngine();
  const on = useBrushPreview();
  if (!on || !e.hasImage) return null;
  const d = Math.max(4, e.brush.size * zoom);
  return (
    <div className="brush-preview" aria-hidden="true">
      <div className={`brush-preview-circle ${e.brush.hard ? 'hard' : 'soft'}`} style={{ width: d, height: d, borderColor: e.overlayColor }} />
      <span className="brush-preview-label">{e.brush.size} px</span>
    </div>
  );
}

/** Floating bar while the Move tool is active. */
export function MoveBar() {
  const e = useEngine();
  if (!e.hasImage || e.tool !== 'move') return null;
  const place = (mode: 'center' | 'fit' | 'fill' | 'original') => {
    const p = presetPlacement(mode);
    if (p) void commitArtPlacement(p);
  };
  return (
    <div className="move-bar" onPointerDown={(ev) => ev.stopPropagation()}>
      <span className="move-bar-hint">Drag to move · drag a corner to resize · arrows nudge</span>
      <div className="move-bar-actions">
        <button type="button" onClick={() => place('center')}>Center</button>
        <button type="button" onClick={() => place('fit')}>Fit</button>
        <button type="button" onClick={() => place('fill')}>Fill</button>
        <button type="button" onClick={() => place('original')}>Original size</button>
        <button type="button" className="done" onClick={() => e.setTool('brush')}>Done</button>
      </div>
    </div>
  );
}
