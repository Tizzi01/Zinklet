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
  House,
  Move,
  Moon,
  Sun,
} from 'lucide-react';
import { IconButton } from './controls';
import { EFFECT_BY_ID } from '../engine/effects';
import { EffectGlyph } from './EffectGlyph';
import { ZMark } from './Logo';
import { setTheme, useEngine, useTheme } from './store';

export type PanelId = 'inks' | 'art' | null;

export function TopBar({
  panel,
  setPanel,
  onImport,
  onExport,
  onSample,
  onHome,
  onShortcuts,
}: {
  panel: PanelId;
  setPanel: (p: PanelId) => void;
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
  onHome: () => void;
  onShortcuts: () => void;
}) {
  const e = useEngine();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
            <ZMark size={26} />
            <span>Zinklet</span>
          </button>
          {menuOpen && (
            <div className="menu" role="menu" onClick={() => setMenuOpen(false)}>
              <button role="menuitem" onClick={onHome}>
                <House size={17} /> Home
              </button>
              <button role="menuitem" onClick={onImport}>
                <ImagePlus size={17} /> Replace art… <kbd>Ctrl I</kbd>
              </button>
              <button role="menuitem" onClick={onSample}>
                <Sparkles size={17} /> Load sample art
              </button>
              <button role="menuitem" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <hr />
              <button role="menuitem" onClick={onShortcuts}>
                <Keyboard size={17} /> Shortcuts & gestures <kbd>?</kbd>
              </button>
              <div className="menu-version">Zinklet v{__APP_VERSION__} · prototype</div>
            </div>
          )}
        </div>
        <IconButton label="Artwork settings" active={panel === 'art'} onClick={() => toggle('art')}>
          <SlidersHorizontal size={20} />
        </IconButton>
        <IconButton label="Replace art" shortcut="Ctrl+I" onClick={onImport}>
          <ImagePlus size={20} />
        </IconButton>
      </div>

      <div className="topbar-group center">
        <IconButton label={e.playing ? 'Pause' : 'Play'} shortcut="P" onClick={() => e.setPlaying(!e.playing)} className="play-btn">
          {e.playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
        <span className="version-tag">v{__APP_VERSION__} (prototype)</span>
      </div>

      <div className="topbar-group right">
        <IconButton label="Move & resize art" shortcut="V" active={e.tool === 'move'} onClick={() => e.setTool('move')}>
          <Move size={20} />
        </IconButton>
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
          aria-label={`Ink brush: ${EFFECT_BY_ID[e.inkBrush.effect].name}`}
          title={`Ink brush: ${EFFECT_BY_ID[e.inkBrush.effect].name}`}
          onClick={() => toggle('inks')}
          style={{ '--ink': e.overlayColor } as CSSProperties}
        >
          <EffectGlyph effect={e.inkBrush.effect} size={22} color="#16161a" />
        </button>
        <button type="button" className="export-btn" onClick={onExport}>
          <Share size={17} />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
