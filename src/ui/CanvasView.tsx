import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { ArtPlacement } from '../engine/Engine';
import {
  artSize,
  commitArtPlacement,
  drawArtPreview,
  engine,
  setLivePlacement,
  toast,
  useEngine,
  useLivePlacement,
  viewCommands,
  viewInsets,
} from './store';

interface View {
  x: number;
  y: number;
  s: number;
}

interface Ptr {
  x: number;
  y: number;
  type: string;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const clampZoom = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));

/** Margins kept free for the toolbars when fitting the art to the screen. */
const FIT = { top: 72, bottom: 28, left: 76, right: 28 };

export function CanvasView({ onZoom }: { onZoom: (s: number) => void }) {
  const e = useEngine();
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, s: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  // Mount the engine's WebGL canvas.
  useLayoutEffect(() => {
    boardRef.current!.appendChild(engine.canvas);
  }, []);

  const apply = () => {
    const v = view.current;
    const board = boardRef.current!;
    board.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
    board.style.setProperty('--zoom', String(v.s));
    board.style.width = `${engine.width}px`;
    board.style.height = `${engine.height}px`;
    // Crisp pixels when zoomed way in, smooth when zoomed out.
    engine.canvas.style.imageRendering = v.s >= 3 ? 'pixelated' : 'auto';
    onZoom(v.s);
  };

  const zoomAt = (sx: number, sy: number, s: number) => {
    const v = view.current;
    const ns = clampZoom(s);
    const ix = (sx - v.x) / v.s;
    const iy = (sy - v.y) / v.s;
    view.current = { x: sx - ix * ns, y: sy - iy * ns, s: ns };
    apply();
  };

  const fit = () => {
    const stage = stageRef.current;
    if (!stage || !engine.width) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const narrow = sw < 700;
    const base = narrow ? { top: 64, bottom: 16, left: 60, right: 12 } : FIT;
    const m = { ...base, bottom: base.bottom + viewInsets.bottom };
    const aw = Math.max(50, sw - m.left - m.right);
    const ah = Math.max(50, sh - m.top - m.bottom);
    const s = clampZoom(Math.min(aw / engine.width, ah / engine.height, 4));
    view.current = {
      s,
      x: m.left + (aw - engine.width * s) / 2,
      y: m.top + (ah - engine.height * s) / 2,
    };
    apply();
  };

  useEffect(() => {
    viewCommands.fit = fit;
    viewCommands.actualSize = () => {
      const st = stageRef.current!;
      zoomAt(st.clientWidth / 2, st.clientHeight / 2, 1);
    };
    viewCommands.zoomBy = (f: number) => {
      const st = stageRef.current!;
      zoomAt(st.clientWidth / 2, st.clientHeight / 2, view.current.s * f);
    };
  });

  // Refit when the artwork size changes.
  useEffect(() => {
    if (e.hasImage) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.hasImage, e.width, e.height]);

  useEffect(() => {
    const onResize = () => apply();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  // Space to pan.
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' && !isTyping(ev)) {
        ev.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Block Safari's page-level pinch gestures.
  useEffect(() => {
    const stop = (ev: Event) => ev.preventDefault();
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
    };
  }, []);

  // ------------------------------------------------------------------ pointer input

  const state = useRef({
    pointers: new Map<number, Ptr>(),
    mode: 'none' as 'none' | 'paint' | 'pan' | 'gesture' | 'art',
    art: null as null | { start: { x: number; y: number }; from: ArtPlacement; corner: string | undefined; live: ArtPlacement },
    paintId: -1,
    paintIsPen: false,
    paintStart: 0,
    tempEraser: false,
    penSeen: false,
    panLast: { x: 0, y: 0 },
    gesture: null as null | {
      ids: [number, number];
      startDist: number;
      startMid: { x: number; y: number };
      startView: View;
      t0: number;
      maxPointers: number;
      moved: boolean;
    },
  });

  const local = (ev: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const toImage = (p: { x: number; y: number }) => {
    const v = view.current;
    return { x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s };
  };

  const updateCursor = (p: { x: number; y: number } | null, type?: string) => {
    const c = cursorRef.current;
    if (!c) return;
    if (!p || type === 'touch' || !engine.hasImage || engine.tool === 'move') {
      c.style.display = 'none';
      return;
    }
    const d = engine.brush.size * view.current.s;
    c.style.display = 'block';
    c.style.width = c.style.height = `${d}px`;
    c.style.transform = `translate(${p.x - d / 2}px, ${p.y - d / 2}px)`;
  };

  const startGesture = () => {
    const st = state.current;
    const touches = [...st.pointers.entries()].filter(([, p]) => p.type === 'touch');
    if (touches.length < 2) return;
    const [[ia, a], [ib, b]] = touches;
    st.mode = 'gesture';
    st.gesture = {
      ids: [ia, ib],
      startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startView: { ...view.current },
      t0: st.gesture?.t0 ?? performance.now(),
      maxPointers: Math.max(st.gesture?.maxPointers ?? 0, touches.length),
      moved: st.gesture?.moved ?? false,
    };
  };

  /** Move tool: drag the picture, or drag a corner handle to resize it around the opposite corner. */
  const beginArtDrag = (ev: RPointerEvent) => {
    const st = state.current;
    const from = engine.artPlacement;
    if (!from || !artSize()) return;
    const corner = (ev.target as HTMLElement).dataset?.corner;
    st.mode = 'art';
    st.paintId = ev.pointerId;
    st.art = { start: toImage(local(ev)), from, corner, live: from };
    setLivePlacement(from);
  };

  const moveArtDrag = (ev: RPointerEvent) => {
    const a = state.current.art;
    const size = artSize();
    if (!a || !size) return;
    const p = toImage(local(ev));
    let next: ArtPlacement;
    if (!a.corner) {
      next = { ...a.from, x: a.from.x + p.x - a.start.x, y: a.from.y + p.y - a.start.y };
    } else {
      // Anchor is the opposite corner, in picture pixels.
      const ax = a.corner.includes('w') ? size.aw : 0;
      const ay = a.corner.includes('n') ? size.ah : 0;
      const A = { x: a.from.x + ax * a.from.scale, y: a.from.y + ay * a.from.scale };
      const d0 = Math.max(1, Math.hypot(a.start.x - A.x, a.start.y - A.y));
      const d1 = Math.hypot(p.x - A.x, p.y - A.y);
      const minScale = 16 / Math.max(size.aw, size.ah);
      const scale = Math.max(minScale, a.from.scale * (d1 / d0));
      next = { scale, x: A.x - ax * scale, y: A.y - ay * scale };
    }
    a.live = next;
    setLivePlacement(next);
  };

  const endArtDrag = () => {
    const a = state.current.art;
    state.current.art = null;
    if (!a) return;
    void commitArtPlacement(a.live).finally(() => setLivePlacement(null));
  };

  const beginPaint = (ev: RPointerEvent, isPen: boolean) => {
    const st = state.current;
    if (engine.tool === 'move') {
      beginArtDrag(ev);
      return;
    }
    // Pen eraser end (or eraser button) erases temporarily, like Krita.
    st.tempEraser = isPen && (ev.button === 5 || (ev.buttons & 32) !== 0);
    const prevTool = engine.tool;
    if (st.tempEraser) engine.tool = 'eraser';
    const p = toImage(local(ev));
    const result = engine.beginStroke(p.x, p.y, ev.pressure || 0.5, isPen);
    if (st.tempEraser) engine.tool = prevTool;
    if (result === 'full') toast('You’ve used 16 different inks — pick one under “On your art” and tap “Use for brush”', 3200);
    if (result !== 'ok') return;
    st.mode = 'paint';
    st.paintId = ev.pointerId;
    st.paintIsPen = isPen;
    st.paintStart = performance.now();
  };

  const onPointerDown = (ev: RPointerEvent) => {
    const st = state.current;
    if (!engine.hasImage) return;
    stageRef.current!.setPointerCapture(ev.pointerId);
    const p = local(ev);
    st.pointers.set(ev.pointerId, { ...p, type: ev.pointerType });

    if (ev.pointerType === 'pen') st.penSeen = true;

    if (ev.pointerType === 'touch') {
      const touchCount = [...st.pointers.values()].filter((q) => q.type === 'touch').length;
      if (touchCount >= 2) {
        if (st.mode === 'paint') {
          if (st.paintIsPen) return; // Pen is drawing; ignore resting fingers.
          // A second finger landed: this was a gesture, not a stroke.
          if (performance.now() - st.paintStart < 300) engine.cancelStroke();
          else engine.endStroke();
          st.mode = 'none';
          st.paintId = -1;
        }
        startGesture();
        return;
      }
      if (st.mode !== 'none') return;
      if (st.penSeen) {
        // Palm rejection: once a pen is used, fingers only navigate.
        st.mode = 'pan';
        st.panLast = p;
        st.gesture = { ids: [ev.pointerId, -1], startDist: 1, startMid: p, startView: { ...view.current }, t0: performance.now(), maxPointers: 1, moved: false };
        return;
      }
      beginPaint(ev, false);
      return;
    }

    if (st.mode !== 'none') return;
    if (ev.button === 1 || spaceHeld || (ev.pointerType === 'mouse' && ev.button === 0 && ev.altKey && ev.ctrlKey)) {
      st.mode = 'pan';
      st.panLast = p;
      setPanning(true);
      return;
    }
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.pointerType === 'pen' && ev.button === 2) return;
    beginPaint(ev, ev.pointerType === 'pen');
  };

  const onPointerMove = (ev: RPointerEvent) => {
    const st = state.current;
    const p = local(ev);
    updateCursor(p, ev.pointerType);
    const ptr = st.pointers.get(ev.pointerId);
    if (ptr) {
      ptr.x = p.x;
      ptr.y = p.y;
    }

    if (st.mode === 'art' && ev.pointerId === st.paintId) {
      moveArtDrag(ev);
      return;
    }

    if (st.mode === 'paint' && ev.pointerId === st.paintId) {
      const events = ev.nativeEvent.getCoalescedEvents?.() ?? [];
      const list = events.length ? events : [ev.nativeEvent];
      for (const ce of list) {
        const q = toImage(local(ce));
        engine.strokeTo(q.x, q.y, ce.pressure || 0.5, st.paintIsPen);
      }
      engine.flushStroke();
      return;
    }

    if (st.mode === 'pan' && ptr) {
      const v = view.current;
      view.current = { ...v, x: v.x + p.x - st.panLast.x, y: v.y + p.y - st.panLast.y };
      st.panLast = p;
      apply();
      return;
    }

    if (st.mode === 'gesture' && st.gesture) {
      const g = st.gesture;
      const a = st.pointers.get(g.ids[0]);
      const b = st.pointers.get(g.ids[1]);
      if (!a || !b) return;
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (Math.abs(dist - g.startDist) > 12 || Math.hypot(mid.x - g.startMid.x, mid.y - g.startMid.y) > 12) {
        g.moved = true;
      }
      const s = clampZoom(g.startView.s * (dist / g.startDist));
      const ix = (g.startMid.x - g.startView.x) / g.startView.s;
      const iy = (g.startMid.y - g.startView.y) / g.startView.s;
      view.current = { s, x: mid.x - ix * s, y: mid.y - iy * s };
      apply();
    }
  };

  const onPointerUp = (ev: RPointerEvent) => {
    const st = state.current;
    st.pointers.delete(ev.pointerId);

    if (st.mode === 'art' && ev.pointerId === st.paintId) {
      endArtDrag();
      st.mode = 'none';
      st.paintId = -1;
      return;
    }

    if (st.mode === 'paint' && ev.pointerId === st.paintId) {
      if (ev.type === 'pointercancel' && performance.now() - st.paintStart < 150) engine.cancelStroke();
      else engine.endStroke();
      st.mode = 'none';
      st.paintId = -1;
      return;
    }

    if (st.mode === 'pan') {
      if (st.pointers.size === 0) {
        st.mode = 'none';
        st.gesture = null;
        setPanning(false);
      }
      return;
    }

    if (st.mode === 'gesture') {
      const remainingTouches = [...st.pointers.values()].filter((q) => q.type === 'touch').length;
      if (remainingTouches === 0) {
        const g = st.gesture;
        if (g && !g.moved && performance.now() - g.t0 < 350) {
          if (g.maxPointers === 2) {
            const c = engine.undo();
            if (c) toast(`Undo · ${c.label}`);
          } else if (g.maxPointers >= 3) {
            const c = engine.redo();
            if (c) toast(`Redo · ${c.label}`);
          }
        }
        st.mode = 'none';
        st.gesture = null;
      }
    }
  };

  // Track a third finger for three-finger tap (redo).
  const onPointerDownCapture = (ev: RPointerEvent) => {
    const st = state.current;
    if (ev.pointerType === 'touch' && st.gesture && st.mode === 'gesture') {
      const touches = [...st.pointers.values()].filter((q) => q.type === 'touch').length + 1;
      st.gesture.maxPointers = Math.max(st.gesture.maxPointers, touches);
    }
  };

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    if (!engine.hasImage) return;
    const p = local(ev);
    const pixelMode = ev.deltaMode === 0;
    const mouseWheel = !pixelMode || (Math.abs(ev.deltaY) >= 50 && ev.deltaX === 0 && Number.isInteger(ev.deltaY));
    if (ev.ctrlKey || ev.metaKey || mouseWheel) {
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const dy = pixelMode ? ev.deltaY : ev.deltaY * 33;
      const factor = Math.exp(-dy * (ev.ctrlKey && !mouseWheel ? 0.01 : 0.0015));
      zoomAt(p.x, p.y, view.current.s * factor);
    } else {
      const v = view.current;
      view.current = { ...v, x: v.x - ev.deltaX, y: v.y - ev.deltaY };
      apply();
    }
    updateCursor(p, 'mouse');
  };

  // Native, non-passive wheel listener so trackpad pinch zooms the art, not the page.
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const stage = stageRef.current!;
    const handler = (ev: WheelEvent) => wheelRef.current(ev);
    stage.addEventListener('wheel', handler, { passive: false });
    // Never let ctrl+wheel zoom the whole page (e.g. over panels).
    const guard = (ev: WheelEvent) => {
      if (ev.ctrlKey) ev.preventDefault();
    };
    window.addEventListener('wheel', guard, { passive: false });
    return () => {
      stage.removeEventListener('wheel', handler);
      window.removeEventListener('wheel', guard);
    };
  }, []);

  const cursorClass = !e.hasImage ? '' : panning ? 'panning' : spaceHeld ? 'can-pan' : e.tool === 'move' ? 'move-tool' : 'painting';

  return (
    <div
      ref={stageRef}
      className={`stage ${cursorClass}`}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => updateCursor(null)}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <div ref={boardRef} className="board" style={{ display: e.hasImage ? 'block' : 'none' }}>
        {e.hasImage && e.tool === 'move' && <ArtBox />}
      </div>
      <div ref={cursorRef} className={`brush-cursor ${e.tool === 'eraser' ? 'eraser' : ''}`} />
    </div>
  );
}

export function isTyping(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  const typing = ['text', 'number', 'search', 'email', 'url'];
  return (tag === 'INPUT' && typing.includes((t as HTMLInputElement).type)) || tag === 'TEXTAREA' || t.isContentEditable;
}

/** Move tool overlay: outline + corner handles around the picture, and a live preview while dragging. */
function ArtBox() {
  const e = useEngine();
  const live = useLivePlacement();
  const preview = useRef<HTMLCanvasElement>(null);
  const size = artSize();
  const p = live ?? e.artPlacement;

  useEffect(() => {
    if (live && preview.current && !preview.current.dataset.drawn) {
      drawArtPreview(preview.current);
      preview.current.dataset.drawn = '1';
    }
  }, [live]);

  // Dim the animated render while the preview is showing the new spot.
  useEffect(() => {
    engine.canvas.style.opacity = live ? '0.3' : '';
    return () => {
      engine.canvas.style.opacity = '';
    };
  }, [live]);

  if (!p || !size) return null;
  const style = { left: p.x, top: p.y, width: size.aw * p.scale, height: size.ah * p.scale };
  return (
    <div className="art-box" style={style}>
      {live && <canvas ref={preview} className="art-box-preview" />}
      {['nw', 'ne', 'sw', 'se'].map((c) => (
        <span key={c} className={`art-handle ${c}`} data-corner={c} />
      ))}
    </div>
  );
}
