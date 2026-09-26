import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasView, isTyping } from './ui/CanvasView';
import { TopBar, type PanelId } from './ui/TopBar';
import { SideBar, sizeToT, tToSize } from './ui/SideBar';
import { InksPanel } from './ui/InksPanel';
import { ArtPanel } from './ui/ArtPanel';
import { ExportDialog } from './ui/ExportDialog';
import { DropOverlay, EmptyState, Hint, ShortcutsDialog, Toast, ZoomBadge } from './ui/Overlays';
import { engine, importArtFile, loadSample, toast, useEngine, viewCommands, viewInsets } from './ui/store';

const wide = () => window.innerWidth >= 900;

export default function App() {
  const e = useEngine();
  const [panel, setPanel] = useState<PanelId>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);

  const openImport = useCallback(() => fileInput.current?.click(), []);

  const afterLoad = () => {
    setUiHidden(false);
    if (wide()) setPanel('inks');
  };

  const onSample = async () => {
    if (engine.hasImage && engine.dirty && !window.confirm('Load the sample art? Your current project will be replaced.')) return;
    await loadSample();
    afterLoad();
    toast('Sample loaded — it’s already alive. Try painting more ink!', 2600);
  };

  const onNew = () => {
    if (engine.dirty && !window.confirm('Start a new project? Your current inks will be cleared.')) return;
    engine.reset();
    setPanel(null);
  };

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    await importArtFile(file);
    if (engine.hasImage) afterLoad();
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
      if (exportOpen || shortcutsOpen) {
        if (k === 'escape') {
          setExportOpen(false);
          setShortcutsOpen(false);
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

  const showUi = e.hasImage && !uiHidden;

  return (
    <div className={`app ${uiHidden ? 'ui-hidden' : ''} ${panel ? 'panel-open' : ''}`}>
      <CanvasView onZoom={setZoom} />

      {!e.hasImage && <EmptyState onImport={openImport} onSample={onSample} />}

      {showUi && (
        <>
          <TopBar
            panel={panel}
            setPanel={setPanel}
            onImport={openImport}
            onExport={onExport}
            onSample={onSample}
            onNew={onNew}
            onShortcuts={() => setShortcutsOpen(true)}
          />
          <SideBar />
          {panel === 'inks' && <InksPanel onClose={() => setPanel(null)} />}
          {panel === 'art' && <ArtPanel onClose={() => setPanel(null)} onReplace={openImport} />}
          <ZoomBadge zoom={zoom} />
          <Hint />
        </>
      )}

      {uiHidden && e.hasImage && (
        <button type="button" className="show-ui-btn" onClick={() => setUiHidden(false)}>
          Show interface (Tab)
        </button>
      )}

      {e.analyzing && <div className="analyzing">Finding your lines…</div>}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {dragging && <DropOverlay />}
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
