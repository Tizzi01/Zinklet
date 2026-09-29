import { ArrowLeftRight, ArrowRight, Image as ImageIcon, ImagePlus, Moon, Sparkles, Sun } from 'lucide-react';
import { Segmented } from './controls';
import { ZMark } from './Logo';
import {
  CANVAS_PRESETS,
  canvasSizeFor,
  setCanvasSettings,
  setTheme,
  useCanvasSettings,
  useEngine,
  useTheme,
  type CanvasSettings,
} from './store';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <span key={theme} className="theme-icon">
        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
      </span>
    </button>
  );
}

function RatioIcon({ w, h }: { w: number; h: number }) {
  const max = 26;
  const s = max / Math.max(w, h);
  return <span className="ratio-icon" style={{ width: Math.round(w * s), height: Math.round(h * s) }} />;
}

function CanvasSetup() {
  const s = useCanvasSettings();
  // Show the resulting size as if the art were 2000×1500 when "Match art" is picked.
  const size = canvasSizeFor(2000, 1500, s);
  const setNum = (key: 'width' | 'height', v: string) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) setCanvasSettings({ [key]: Math.min(8192, Math.max(0, n)) } as Partial<CanvasSettings>);
  };

  return (
    <section className="home-card">
      <h2>
        <span className="step">1</span> Canvas
      </h2>
      <div className="preset-grid">
        {CANVAS_PRESETS.map((p) => {
          const w = p.id === 'custom' ? s.width || 1 : p.w;
          const h = p.id === 'custom' ? s.height || 1 : p.h;
          return (
            <button
              key={p.id}
              type="button"
              className={`preset ${s.preset === p.id ? 'on' : ''}`}
              onClick={() => setCanvasSettings({ preset: p.id })}
              aria-pressed={s.preset === p.id}
            >
              <span className="preset-icon">{p.id === 'match' ? <ImageIcon size={22} /> : <RatioIcon w={w} h={h} />}</span>
              <b>{p.label}</b>
              <small>{p.hint}</small>
            </button>
          );
        })}
      </div>

      {s.preset === 'custom' && (
        <div className="custom-size">
          <label>
            <span>Width</span>
            <input type="number" inputMode="numeric" min={16} max={8192} value={s.width || ''} onChange={(ev) => setNum('width', ev.target.value)} />
          </label>
          <button
            type="button"
            className="ghost-btn swap"
            aria-label="Swap width and height"
            title="Swap width and height"
            onClick={() => setCanvasSettings({ width: s.height, height: s.width })}
          >
            <ArrowLeftRight size={16} />
          </button>
          <label>
            <span>Height</span>
            <input type="number" inputMode="numeric" min={16} max={8192} value={s.height || ''} onChange={(ev) => setNum('height', ev.target.value)} />
          </label>
          <span className="unit">px</span>
        </div>
      )}

      {s.preset !== 'match' && (
        <>
          <Segmented
            label="Art placement"
            value={s.fit}
            options={[
              { value: 'original', label: 'Original size' },
              { value: 'fit', label: 'Fit' },
              { value: 'fill', label: 'Fill' },
            ]}
            onChange={(fit) => setCanvasSettings({ fit })}
          />
          <p className="field-hint placement-hint">
            {s.fit === 'original'
              ? 'Your art keeps its exact pixel size and is centered — never stretched or blurred.'
              : s.fit === 'fit'
                ? 'Your art is scaled to fit inside the canvas (small art gets enlarged).'
                : 'Your art is scaled to cover the whole canvas; edges may be cropped.'}
          </p>
        </>
      )}

      <div className="field-label">Background</div>
      <div className="swatches">
        {(['transparent', 'white', 'black'] as const).map((bg) => (
          <button
            key={bg}
            type="button"
            className={`swatch ${bg} ${s.background === bg ? 'on' : ''}`}
            onClick={() => setCanvasSettings({ background: bg })}
            aria-pressed={s.background === bg}
          >
            <span />
            {bg === 'transparent' ? 'None' : bg === 'white' ? 'White' : 'Black'}
          </button>
        ))}
      </div>

      <p className="field-hint">
        {s.preset === 'match' ? 'The canvas will be the same size as your drawing.' : `Canvas: ${size.w} × ${size.h} px`}
        {size.capped && s.preset !== 'match' ? ' (scaled down to fit the 2048 px limit)' : ''}
      </p>
    </section>
  );
}

export function HomeScreen({
  thumb,
  dragging,
  onImport,
  onSample,
  onContinue,
}: {
  thumb: string;
  dragging: boolean;
  onImport: () => void;
  onSample: () => void;
  onContinue: () => void;
}) {
  const e = useEngine();

  return (
    <div className="home">
      <header className="home-top">
        <div className="home-logo">
          <ZMark size={30} boil />
          <span>Zinklet</span>
          <em className="home-version">v{__APP_VERSION__} (prototype)</em>
        </div>
        <ThemeToggle />
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h1 className="boil-text">Bring your art to life</h1>
          <p>
            Import a finished drawing, brush <b>invisible ink</b> over the parts you want to move, and export a looping
            video or GIF.
          </p>
        </section>

        {e.hasImage && (
          <button type="button" className="continue-card" onClick={onContinue}>
            {thumb ? <img src={thumb} alt="" /> : <span className="thumb-empty" />}
            <span className="continue-text">
              <b>Continue editing</b>
              <small>
                {e.width} × {e.height} px · {e.inks.length} {e.inks.length === 1 ? 'ink' : 'inks'}
              </small>
            </span>
            <ArrowRight size={20} className="continue-arrow" />
          </button>
        )}

        <div className="home-grid">
          <CanvasSetup />

          <section className="home-card">
            <h2>
              <span className="step">2</span> Your art
            </h2>
            <button type="button" className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={onImport}>
              <span className="dropzone-icon">
                <ImagePlus size={30} />
              </span>
              <b>{dragging ? 'Drop it!' : 'Import your art'}</b>
              <small>Click to choose · drop a file · or paste (Ctrl+V)</small>
            </button>
            <button type="button" className="home-action" onClick={onSample}>
              <span className="home-action-icon">
                <Sparkles size={20} />
              </span>
              <span>
                <b>Try sample art</b>
                <small>See it working in one tap</small>
              </span>
              <ArrowRight size={18} className="home-action-arrow" />
            </button>
            <p className="field-hint">PNG, JPG or WebP. Export a flat image from Procreate, Krita, Clip Studio, etc.</p>
          </section>
        </div>

      </main>
    </div>
  );
}
