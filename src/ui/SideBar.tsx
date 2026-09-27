import { Redo2, Undo2 } from 'lucide-react';
import { BRUSH_MAX, BRUSH_MIN } from '../engine/Engine';
import { IconButton, VSlider } from './controls';
import { setBrushPreview, toast, useEngine } from './store';

const CURVE = 2.2;
export const sizeToT = (size: number) => Math.pow((size - BRUSH_MIN) / (BRUSH_MAX - BRUSH_MIN), 1 / CURVE);
export const tToSize = (t: number) => Math.round(BRUSH_MIN + (BRUSH_MAX - BRUSH_MIN) * Math.pow(t, CURVE));

export function SideBar() {
  const e = useEngine();
  return (
    <aside className="sidebar" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="side-group">
        <span className="side-label">Size</span>
        <VSlider
          label="Brush size"
          t={sizeToT(e.brush.size)}
          display={`${e.brush.size} px`}
          onChange={(t) => e.setBrush({ size: tToSize(t) })}
          onStart={() => setBrushPreview(true)}
          onEnd={() => setBrushPreview(false)}
        />
        <span className="side-value">{e.brush.size}</span>
      </div>

      <button
        type="button"
        className={`hardness-btn ${e.brush.hard ? 'hard' : 'soft'}`}
        title={e.brush.hard ? 'Hard edge — tap for soft' : 'Soft edge — tap for hard'}
        aria-label={e.brush.hard ? 'Hard brush edge' : 'Soft brush edge'}
        onClick={() => e.setBrush({ hard: !e.brush.hard })}
      >
        <span className="hardness-dot" />
        <span className="side-label">{e.brush.hard ? 'Hard' : 'Soft'}</span>
      </button>

      <div className="side-group">
        <span className="side-label">Opacity</span>
        <VSlider
          label="Brush opacity"
          t={e.brush.opacity / 100}
          display={`${e.brush.opacity}%`}
          onChange={(t) => e.setBrush({ opacity: Math.max(1, Math.round(t * 100)) })}
        />
        <span className="side-value">{e.brush.opacity}%</span>
      </div>

      <div className="sidebar-actions">
        <IconButton
          label="Undo"
          shortcut="Ctrl+Z · two-finger tap"
          disabled={!e.history.canUndo}
          onClick={() => {
            const c = e.undo();
            if (c) toast(`Undo · ${c.label}`);
          }}
        >
          <Undo2 size={19} />
        </IconButton>
        <IconButton
          label="Redo"
          shortcut="Ctrl+Shift+Z · three-finger tap"
          disabled={!e.history.canRedo}
          onClick={() => {
            const c = e.redo();
            if (c) toast(`Redo · ${c.label}`);
          }}
        >
          <Redo2 size={19} />
        </IconButton>
      </div>
    </aside>
  );
}
