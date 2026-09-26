import { ImagePlus, Sparkles, X } from 'lucide-react';
import { EffectGlyph } from './EffectGlyph';
import { useEngine, useToast, viewCommands } from './store';

export function EmptyState({ onImport, onSample }: { onImport: () => void; onSample: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-glyphs" aria-hidden="true">
          <EffectGlyph effect="boil" size={56} color="#ffd23f" />
          <EffectGlyph effect="wobble" size={56} color="#3fd0ff" />
          <EffectGlyph effect="jitter" size={56} color="#ff5d8f" />
        </div>
        <h1>Bring your art to life</h1>
        <p>
          Import a finished drawing, then brush <b>invisible ink</b> over the parts you want to move.
          Export a looping video or GIF in seconds.
        </p>
        <div className="empty-actions">
          <button type="button" className="primary-btn" onClick={onImport}>
            <ImagePlus size={18} /> Import your art
          </button>
          <button type="button" className="secondary-btn" onClick={onSample}>
            <Sparkles size={18} /> Try sample art
          </button>
        </div>
        <small className="muted">PNG, JPG or WebP · drag & drop or paste works too</small>
      </div>
    </div>
  );
}

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
