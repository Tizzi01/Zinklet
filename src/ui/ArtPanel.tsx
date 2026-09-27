import { useRef } from 'react';
import { Dices, ImagePlus } from 'lucide-react';
import { Segmented, Slider, Toggle } from './controls';
import { OVERLAY_COLORS } from '../engine/effects';
import { setAdvanced, setInkColor, toast, useAdvanced, useEngine } from './store';

export function ArtPanel({ onClose, onReplace }: { onClose: () => void; onReplace: () => void }) {
  const e = useEngine();
  const adv = useAdvanced();
  const timer = useRef(0);
  const loopOptions = [0.5, 1, 2, 3, 4, 6, 8];
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
          options={loopOptions.map((s) => ({ value: s, label: `${s}s` }))}
          onChange={(s) => e.setLoopSeconds(s)}
        />
        <p className="field-hint">Everything repeats seamlessly over this length. Short loops are great for stickers and emotes.</p>

        <div className="divider" />

        <div className="field-label">Ink color</div>
        <div className="ink-colors" role="radiogroup" aria-label="Ink color">
          {OVERLAY_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={e.overlayColor === c.hex}
              className={`ink-color ${e.overlayColor === c.hex ? 'on' : ''}`}
              style={{ background: c.hex }}
              title={c.label}
              aria-label={c.label}
              onClick={() => setInkColor(c.id)}
            />
          ))}
        </div>
        <p className="field-hint">The color the invisible ink shows while you paint. Pick one that stands out on your art.</p>

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

        <div className="divider" />
        <div className="advanced-head">Advanced</div>
        <Toggle
          label="Uncapped sliders"
          hint="Strength, speed and size go way past normal"
          checked={adv.uncapped}
          onChange={(v) => setAdvanced({ uncapped: v })}
        />
        <Toggle label="Performance stats" hint="Redraws per second and draw time" checked={adv.stats} onChange={(v) => setAdvanced({ stats: v })} />
        <button
          type="button"
          className="wide-btn"
          onClick={() => {
            e.rerollSeeds();
            toast('New randomness for every ink');
          }}
        >
          <Dices size={17} /> Re-roll randomness
        </button>
      </div>
    </section>
  );
}
