import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Segmented, Slider, Toggle } from './controls';
import { useEngine } from './store';

export function ArtPanel({ onClose, onReplace }: { onClose: () => void; onReplace: () => void }) {
  const e = useEngine();
  const timer = useRef(0);
  const linesWereShown = useRef(false);

  const reanalyze = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => e.analyze(), 180);
  };

  return (
    <section className="panel art-panel" aria-label="Artwork settings" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="panel-head">
        <h2>Artwork</h2>
        <span className="muted">
          {e.width} × {e.height}
        </span>
        <button type="button" className="ghost-btn close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>
      <div className="panel-body">
        <Segmented
          label="Loop length"
          value={e.loopSeconds}
          options={[1, 2, 3, 4].map((s) => ({ value: s, label: `${s}s` }))}
          onChange={(s) => e.setLoopSeconds(s)}
        />
        <p className="field-hint">Everything repeats seamlessly over this length. Short loops are great for stickers and emotes.</p>

        <div className="divider" />

        <Slider
          label="Line detection"
          value={e.sensitivity}
          min={0}
          max={100}
          display={e.analyzing ? 'Updating…' : `${Math.round(e.sensitivity)}`}
          onStart={() => {
            linesWereShown.current = e.showLines;
            e.setShowLines(true);
          }}
          onEnd={() => {
            reanalyze();
            if (!linesWereShown.current) window.setTimeout(() => e.setShowLines(false), 900);
          }}
          onChange={(v) => {
            e.setSensitivity(v);
            reanalyze();
          }}
        />
        <p className="field-hint">What counts as linework for “Lines only” inks. Raise it if some lines don’t move; lower it if colors start wiggling.</p>
        <Toggle label="Show detected lines" checked={e.showLines} onChange={(v) => e.setShowLines(v)} />

        <div className="divider" />

        <button type="button" className="wide-btn" onClick={onReplace}>
          <ImagePlus size={17} /> Replace art (keeps your inks)
        </button>
      </div>
    </section>
  );
}
