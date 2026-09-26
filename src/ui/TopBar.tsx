import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Brush,
  Eraser,
  Eye,
  EyeOff,
  ImagePlus,
  Keyboard,
  Layers,
  Pause,
  Play,
  Share,
  SlidersHorizontal,
  Sparkles,
  FilePlus2,
  KeyRound,
} from 'lucide-react';
import { IconButton } from './controls';
import { useDev, useEngine } from './store';

export type PanelId = 'inks' | 'art' | null;

export function TopBar({
  panel,
  setPanel,
  onImport,
  onExport,
  onSample,
  onNew,
  onShortcuts,
  onCode,
}: {
  panel: PanelId;
  setPanel: (p: PanelId) => void;
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
  onNew: () => void;
  onShortcuts: () => void;
  onCode: () => void;
}) {
  const e = useEngine();
  const dev = useDev();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = e.activeInk;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (ev: PointerEvent) => {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const toggle = (p: Exclude<PanelId, null>) => setPanel(panel === p ? null : p);

  return (
    <header className="topbar" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="topbar-group">
        <div className="menu-anchor" ref={menuRef}>
          <button type="button" className="logo" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
            <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
              <path d="M14 18 C24 14 36 22 48 17 L20 46 C30 42 40 50 50 45" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Zinklet</span>
            {dev.unlocked && <em className="dev-badge">DEV</em>}
          </button>
          {menuOpen && (
            <div className="menu" role="menu" onClick={() => setMenuOpen(false)}>
              <button role="menuitem" onClick={onImport}>
                <ImagePlus size={17} /> Import art… <kbd>Ctrl O</kbd>
              </button>
              <button role="menuitem" onClick={onSample}>
                <Sparkles size={17} /> Load sample art
              </button>
              <button role="menuitem" onClick={onNew}>
                <FilePlus2 size={17} /> New project
              </button>
              <hr />
              <button role="menuitem" onClick={onShortcuts}>
                <Keyboard size={17} /> Shortcuts & gestures <kbd>?</kbd>
              </button>
              <button role="menuitem" onClick={onCode}>
                <KeyRound size={17} /> Enter a code…
              </button>
              <div className="menu-version">Zinklet v{__APP_VERSION__} · prototype</div>
            </div>
          )}
        </div>
        <IconButton label="Artwork settings" active={panel === 'art'} onClick={() => toggle('art')}>
          <SlidersHorizontal size={20} />
        </IconButton>
        <IconButton label="Import art" shortcut="Ctrl+O" onClick={onImport}>
          <ImagePlus size={20} />
        </IconButton>
      </div>

      <div className="topbar-group center">
        <IconButton label={e.playing ? 'Pause' : 'Play'} shortcut="P" onClick={() => e.setPlaying(!e.playing)} className="play-btn">
          {e.playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
      </div>

      <div className="topbar-group right">
        <IconButton label="Ink brush" shortcut="B" active={e.tool === 'brush'} onClick={() => e.setTool('brush')}>
          <Brush size={20} />
        </IconButton>
        <IconButton label="Eraser" shortcut="E" active={e.tool === 'eraser'} onClick={() => e.setTool('eraser')}>
          <Eraser size={20} />
        </IconButton>
        <IconButton
          label={e.showMask ? 'Ink always visible (tap to hide)' : 'Ink hidden while not painting (tap to always show)'}
          shortcut="H"
          active={e.showMask}
          onClick={() => e.setShowMask(!e.showMask)}
        >
          {e.showMask ? <Eye size={20} /> : <EyeOff size={20} />}
        </IconButton>
        <IconButton label="Inks" shortcut="L" active={panel === 'inks'} onClick={() => toggle('inks')}>
          <Layers size={20} />
        </IconButton>
        <button
          type="button"
          className="ink-swatch-btn"
          aria-label={active ? `Current ink: ${active.name}` : 'No ink selected'}
          title={active ? `Current ink: ${active.name}` : 'Add an ink'}
          onClick={() => toggle('inks')}
          style={{ '--ink': active?.color ?? '#555' } as CSSProperties}
        />
        <button type="button" className="export-btn" onClick={onExport}>
          <Share size={17} />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
