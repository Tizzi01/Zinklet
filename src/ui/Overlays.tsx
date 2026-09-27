import { useEffect, useState } from 'react';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import { engine, useAdvanced, useEngine, useToast, viewCommands } from './store';

export function Hint() {
  const e = useEngine();
  const ink = e.activeInk;
  if (!e.hasImage || !ink || e.anyPaint || e.isStroking) return null;
  return (
    <div className="hint" onPointerDown={(ev) => ev.stopPropagation()}>
      <span>
        Brush over the lines you want to bring to life with <b style={{ color: ink.color }}>{ink.name}</b>
      </span>
      <button type="button" className="primary-btn small" onClick={() => e.fillInk(ink.id)}>
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
  ['B', 'Ink brush'],
  ['E', 'Eraser'],
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
  ['1 – 8', 'Select ink'],
  ['Tab', 'Hide interface'],
  ['Ctrl O', 'Import art'],
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
