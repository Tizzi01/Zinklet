import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasView, isTyping } from './ui/CanvasView';
import { TopBar, type PanelId } from './ui/TopBar';
import { SideBar, sizeToT, tToSize } from './ui/SideBar';
import { InksPanel } from './ui/InksPanel';
import { ArtPanel } from './ui/ArtPanel';
import { ExportDialog } from './ui/ExportDialog';
import { CodeDialog, DropOverlay, Hint, ShortcutsDialog, StatsOverlay, Toast, ZoomBadge } from './ui/Overlays';
import { HomeScreen } from './ui/HomeScreen';
import { engine, importArtFile, loadSample, toast, useEngine, viewCommands, viewInsets } from './ui/store';

const wide = () => window.innerWidth >= 900;

type Screen = 'home' | 'editor';

export default function App() {
  const e = useEngine();
  const [panel, setPanel] = useState<PanelId>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [screen, setScreen] = useState<Screen>('home');
  const [thumb, setThumb] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const screenRef = useRef<Screen>('home');
  screenRef.current = screen;

  // ------------------------------------------------------------------ screens & browser history
  // Home and editor are separate history entries, so the browser back button returns home
  // (the project stays open) and forward goes back into the editor.

  useEffect(() => {
    history.replaceState({ screen: 'home' }, '', location.pathname + location.search);
    const onPop = (ev: PopStateEvent) => {
      const wanted = (ev.state as { screen?: Screen } | null)?.screen;
      setScreen(wanted === 'editor' && engine.hasImage ? 'editor' : 'home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goEditor = () => {
    if (screenRef.current === 'editor') return;
    history.pushState({ screen: 'editor' }, '', '#editor');
    setScreen('editor');
    setUiHidden(false);
    if (wide()) setPanel('inks');
  };

  const goHome = () => {
    if ((history.state as { screen?: Screen } | null)?.screen === 'editor') history.back();
    else setScreen('home');
  };

  // Pause the preview while the editor is hidden, and grab a thumbnail for "Continue editing".
  useEffect(() => {
    if (screen === 'home') {
      if (engine.hasImage) setThumb(engine.snapshot());
      engine.suspended = true;
      setPanel(null);
    } else {
      engine.suspended = false;
      engine.invalidate();
    }
  }, [screen]);

  // Nothing to edit (e.g. after a reset): show home.
  useEffect(() => {
    if (screen === 'editor' && !e.hasImage) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, e.hasImage]);

  // ------------------------------------------------------------------ project actions

  /** The file picker imports a new project from home, or replaces the art in the editor. */
  const openImport = useCallback(() => fileInput.current?.click(), []);

  const confirmReplaceProject = () =>
    !engine.hasImage || !engine.dirty || window.confirm('Start a new project? Your current one will be replaced.');

  const onSample = async () => {
    if (!confirmReplaceProject()) return;
    await loadSample();
    goEditor();
    toast('Sample loaded — it’s already alive. Try painting more ink!', 2600);
  };

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (screenRef.current === 'home') {
      if (!confirmReplaceProject()) return;
      if (await importArtFile(file, 'new')) goEditor();
    } else {
      await importArtFile(file, 'replace');
    }
  };

  const onExport = () => {
    if (!engine.hasImage) return;
    if (!engine.anyPaint) toast('Tip: paint some ink first so your art moves', 2400);
    setExportOpen(true);
  };

  // On phones, panels are bottom sheets: keep the art visible above them.
  useEffect(() => {
    if (!engine.hasImage) return;
    const narrow = window.innerWidth < 700;
    const next = narrow && panel ? Math.round(window.innerHeight * 0.5) : 0;
    if (next !== viewInsets.bottom) {
      viewInsets.bottom = next;
      viewCommands.fit();
    }
  }, [panel]);

  // ------------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTyping(ev)) return;
      const mod = ev.ctrlKey || ev.metaKey;
      const k = ev.key.toLowerCase();

      if (screenRef.current === 'home') {
        if (mod && k === 'o') {
          ev.preventDefault();
          openImport();
        }
        if (k === 'escape') setCodeOpen(false);
        return;
      }

      if (mod && k === 'z') {
        ev.preventDefault();
        const c = ev.shiftKey ? engine.redo() : engine.undo();
        if (c) toast(`${ev.shiftKey ? 'Redo' : 'Undo'} · ${c.label}`);
        return;
      }
      if (mod && k === 'y') {
        ev.preventDefault();
        const c = engine.redo();
        if (c) toast(`Redo · ${c.label}`);
        return;
      }
      if (mod && k === 'o') {
        ev.preventDefault();
        openImport();
        return;
      }
      if (mod && k === 'e') {
        ev.preventDefault();
        onExport();
        return;
      }
      if (mod && (k === '0' || ev.code === 'Digit0')) {
        ev.preventDefault();
        viewCommands.fit();
        return;
      }
      if (mod && (k === '1' || ev.code === 'Digit1')) {
        ev.preventDefault();
        viewCommands.actualSize();
        return;
      }
      if (mod && (k === '=' || k === '+')) {
        ev.preventDefault();
        viewCommands.zoomBy(1.25);
        return;
      }
      if (mod && k === '-') {
        ev.preventDefault();
        viewCommands.zoomBy(0.8);
        return;
      }
      if (mod || ev.altKey) return;
      if (exportOpen || shortcutsOpen || codeOpen) {
        if (k === 'escape') {
          setExportOpen(false);
          setShortcutsOpen(false);
          setCodeOpen(false);
        }
        return;
      }

      switch (k) {
        case 'b':
          engine.setTool('brush');
          break;
        case 'e':
          engine.setTool('eraser');
          break;
        case '[':
          engine.setBrush({ size: tToSize(Math.max(0, sizeToT(engine.brush.size) - 0.04)) });
          break;
        case ']':
          engine.setBrush({ size: tToSize(Math.min(1, sizeToT(engine.brush.size) + 0.04)) });
          break;
        case 'p':
          engine.setPlaying(!engine.playing);
          break;
        case 'h':
          engine.setShowMask(!engine.showMask);
          break;
        case 'l':
          setPanel((p) => (p === 'inks' ? null : 'inks'));
          break;
        case 'tab':
          ev.preventDefault();
          setUiHidden((h) => !h);
          break;
        case '?':
          setShortcutsOpen(true);
          break;
        case 'escape':
          setPanel(null);
          break;
        default:
          if (/^[1-8]$/.test(k)) {
            const ink = engine.inks[Number(k) - 1];
            if (ink) {
              engine.setActiveInk(ink.id);
              toast(`Ink: ${ink.name}`, 1000);
            }
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------------ drop / paste / unload

  useEffect(() => {
    let depth = 0;
    const hasFiles = (ev: DragEvent) => [...(ev.dataTransfer?.types ?? [])].includes('Files');
    const enter = (ev: DragEvent) => {
      if (!hasFiles(ev)) return;
      ev.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (ev: DragEvent) => {
      if (hasFiles(ev)) ev.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (ev: DragEvent) => {
      ev.preventDefault();
      depth = 0;
      setDragging(false);
      const file = [...(ev.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/')) ?? ev.dataTransfer?.files[0];
      onFile(file);
    };
    const paste = (ev: ClipboardEvent) => {
      const item = [...(ev.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        ev.preventDefault();
        onFile(file);
      }
    };
    const unload = (ev: BeforeUnloadEvent) => {
      if (engine.dirty) {
        ev.preventDefault();
        ev.returnValue = '';
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
      window.removeEventListener('beforeunload', unload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showUi = screen === 'editor' && e.hasImage && !uiHidden;

  return (
    <div className={`app ${uiHidden ? 'ui-hidden' : ''} ${panel ? 'panel-open' : ''}`}>
      <CanvasView onZoom={setZoom} />

      {screen === 'home' && (
        <HomeScreen
          thumb={thumb}
          dragging={dragging}
          onImport={openImport}
          onSample={onSample}
          onContinue={goEditor}
          onCode={() => setCodeOpen(true)}
        />
      )}

      {showUi && (
        <>
          <TopBar
            panel={panel}
            setPanel={setPanel}
            onImport={openImport}
            onExport={onExport}
            onSample={onSample}
            onHome={goHome}
            onShortcuts={() => setShortcutsOpen(true)}
            onCode={() => setCodeOpen(true)}
          />
          <SideBar />
          {panel === 'inks' && <InksPanel onClose={() => setPanel(null)} />}
          {panel === 'art' && <ArtPanel onClose={() => setPanel(null)} onReplace={openImport} />}
          <ZoomBadge zoom={zoom} />
          <StatsOverlay />
          <Hint />
        </>
      )}

      {uiHidden && screen === 'editor' && e.hasImage && (
        <button type="button" className="show-ui-btn" onClick={() => setUiHidden(false)}>
          Show interface (Tab)
        </button>
      )}

      {e.analyzing && <div className="analyzing">Finding your lines…</div>}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {codeOpen && <CodeDialog onClose={() => setCodeOpen(false)} />}
      {dragging && screen === 'editor' && <DropOverlay />}
      <Toast />

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
        hidden
        onChange={(ev) => {
          onFile(ev.target.files?.[0]);
          ev.target.value = '';
        }}
      />
    </div>
  );
}
