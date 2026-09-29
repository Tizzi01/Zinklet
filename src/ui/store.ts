import { useSyncExternalStore } from 'react';
import { Engine, MAX_SIDE, type ArtPlacement } from '../engine/Engine';
import { makeSampleArt } from '../engine/sample';
import { EFFECT_BY_ID, OVERLAY_COLORS } from '../engine/effects';

let instance: Engine | null = null;
let initError: string | null = null;
try {
  instance = new Engine();
} catch (err) {
  initError = err instanceof Error ? err.message : String(err);
}

export const engine = instance as Engine;
export const engineError = initError;

/** Re-render the calling component whenever engine state changes. */
export function useEngine(): Engine {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}

// ------------------------------------------------------------------ toasts

interface ToastState {
  id: number;
  text: string;
}
let toastState: ToastState | null = null;
let toastTimer = 0;
const toastListeners = new Set<() => void>();
const notifyToast = () => toastListeners.forEach((fn) => fn());

export function toast(text: string, ms = 1800) {
  toastState = { id: Date.now(), text };
  notifyToast();
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastState = null;
    notifyToast();
  }, ms);
}

export function useToast(): ToastState | null {
  return useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
    () => toastState,
  );
}

// ------------------------------------------------------------------ advanced settings

export interface AdvancedSettings {
  /** Let ink sliders go past their normal limits. */
  uncapped: boolean;
  /** Show the redraws-per-second / draw-time overlay. */
  stats: boolean;
}

let advanced: AdvancedSettings = { uncapped: false, stats: false };
const advancedListeners = new Set<() => void>();

export function setAdvanced(patch: Partial<AdvancedSettings>) {
  advanced = { ...advanced, ...patch };
  advancedListeners.forEach((fn) => fn());
}

export function useAdvanced(): AdvancedSettings {
  return useSyncExternalStore(
    (fn) => {
      advancedListeners.add(fn);
      return () => advancedListeners.delete(fn);
    },
    () => advanced,
  );
}

// ------------------------------------------------------------------ view commands
// The canvas view registers these so toolbar buttons and shortcuts can drive zoom.

/** Extra screen space covered by UI (e.g. the phone bottom sheet) that fitting should avoid. */
export const viewInsets = { bottom: 0 };

export const viewCommands = {
  fit: () => {},
  actualSize: () => {},
  zoomBy: (_factor: number) => {},
};

// ------------------------------------------------------------------ import

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// ------------------------------------------------------------------ small shared stores

/** Tiny external store: `use()` re-renders React components when `set()` is called. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((fn) => fn());
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: just won't be remembered */
  }
}

// ------------------------------------------------------------------ theme

export type Theme = 'dark' | 'light';
const THEME_KEY = 'zinklet.theme';
try {
  localStorage.removeItem('zinklet.devMode'); // left over from v0.2–v0.4
} catch {
  /* ignore */
}
// index.html sets data-theme before first paint (no flash); read it back here.
const themeStore = createStore<Theme>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export const useTheme = themeStore.use;

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f7f6' : '#0c161b');
  writeLocal(THEME_KEY, theme);
  themeStore.set(theme);
}

// ------------------------------------------------------------------ ink overlay color

const INK_COLOR_KEY = 'zinklet.inkColor';
{
  const saved = OVERLAY_COLORS.find((c) => c.id === readLocal(INK_COLOR_KEY));
  if (saved && instance) instance.overlayColor = saved.hex;
}

export function setInkColor(id: string) {
  const c = OVERLAY_COLORS.find((o) => o.id === id);
  if (!c) return;
  writeLocal(INK_COLOR_KEY, c.id);
  engine.setOverlayColor(c.hex);
}

// ------------------------------------------------------------------ brush size preview
// While the size slider (or [ ]) is in use, show the brush at its real on-screen size.

const brushPreviewStore = createStore(false);
let brushPreviewTimer = 0;
export const useBrushPreview = brushPreviewStore.use;

export function setBrushPreview(on: boolean, autoHideMs = 0) {
  clearTimeout(brushPreviewTimer);
  brushPreviewStore.set(on);
  if (on && autoHideMs) brushPreviewTimer = window.setTimeout(() => brushPreviewStore.set(false), autoHideMs);
}

// ------------------------------------------------------------------ canvas settings (home screen)

export type CanvasPreset = 'match' | 'square' | 'portrait' | 'story' | 'wide' | 'custom';

export const CANVAS_PRESETS: { id: CanvasPreset; label: string; hint: string; w: number; h: number }[] = [
  { id: 'match', label: 'Match art', hint: 'Same size as your drawing', w: 0, h: 0 },
  { id: 'square', label: 'Square', hint: '1:1 · posts, emotes', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait', hint: '4:5 · Instagram feed', w: 1080, h: 1350 },
  { id: 'story', label: 'Story', hint: '9:16 · TikTok, Reels', w: 1080, h: 1920 },
  { id: 'wide', label: 'Wide', hint: '16:9 · YouTube, banners', w: 1920, h: 1080 },
  { id: 'custom', label: 'Custom', hint: 'Your own size', w: 1200, h: 1200 },
];

export interface CanvasSettings {
  preset: CanvasPreset;
  /** Used when preset is 'custom'. */
  width: number;
  height: number;
  /**
   * How the art sits in a canvas of a different size:
   * original = keep its pixel size (never enlarged; shrunk only if bigger than the canvas),
   * fit = scale to show all of it, fill = scale to cover the canvas (crops edges).
   */
  fit: 'original' | 'fit' | 'fill';
  background: 'transparent' | 'white' | 'black';
}

const CANVAS_KEY = 'zinklet.canvas';
const canvasStore = createStore<CanvasSettings>(
  (() => {
    const fallback: CanvasSettings = { preset: 'match', width: 1200, height: 1200, fit: 'original', background: 'transparent' };
    try {
      return { ...fallback, ...JSON.parse(readLocal(CANVAS_KEY) ?? '{}') };
    } catch {
      return fallback;
    }
  })(),
);

export const useCanvasSettings = canvasStore.use;

export function setCanvasSettings(patch: Partial<CanvasSettings>) {
  const next = { ...canvasStore.get(), ...patch };
  writeLocal(CANVAS_KEY, JSON.stringify(next));
  canvasStore.set(next);
}

/** Final canvas size for the current settings and a piece of art, capped to the engine's limit. */
export function canvasSizeFor(artW: number, artH: number, s = canvasStore.get()) {
  const preset = CANVAS_PRESETS.find((p) => p.id === s.preset) ?? CANVAS_PRESETS[0];
  let w = s.preset === 'match' ? artW : s.preset === 'custom' ? s.width : preset.w;
  let h = s.preset === 'match' ? artH : s.preset === 'custom' ? s.height : preset.h;
  w = Math.max(16, Math.round(w) || 16);
  h = Math.max(16, Math.round(h) || 16);
  const cap = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { w: Math.round(w * cap), h: Math.round(h * cap), capped: cap < 1, cap };
}

type ArtSource = CanvasImageSource & { width: number; height: number };

/** The picture of the open project, kept un-cropped so the Move tool can reposition it. */
interface ArtState {
  source: ArtSource;
  aw: number;
  ah: number;
  background: CanvasSettings['background'];
  /** Canvas px per original px at "original size" (below 1 only if the canvas was capped). */
  cap: number;
}
let art: ArtState | null = null;

/** Picture size, for the Move tool. */
export function artSize() {
  return art ? { aw: art.aw, ah: art.ah } : null;
}

/** Draw the picture onto a canvas of the project size at a placement. */
function renderArt(a: ArtState, w: number, h: number, p: ArtPlacement) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (a.background !== 'transparent') {
    ctx.fillStyle = a.background === 'white' ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(a.source, p.x, p.y, a.aw * p.scale, a.ah * p.scale);
  return { canvas, artSide: Math.max(a.aw, a.ah) * p.scale };
}

/** Where the art goes for a placement mode, on a canvas of size w × h. */
export function placementFor(mode: 'original' | 'fit' | 'fill', aw: number, ah: number, w: number, h: number, cap = 1): ArtPlacement {
  const fitScale = Math.min(w / aw, h / ah);
  const scale = mode === 'fill' ? Math.max(w / aw, h / ah) : mode === 'fit' ? fitScale : Math.min(cap, fitScale);
  return { x: (w - aw * scale) / 2, y: (h - ah * scale) / 2, scale };
}

/** Place art onto a canvas of the chosen size and background. Returns where the art landed. */
function composeArt(img: ArtSource) {
  const aw = (img as HTMLImageElement).naturalWidth || img.width;
  const ah = (img as HTMLImageElement).naturalHeight || img.height;
  const s = canvasStore.get();
  const { w, h, cap } = canvasSizeFor(aw, ah, s);
  // "Original size" keeps the imported pixels (shrinking only if the canvas had to be capped).
  const placement = s.preset === 'match' ? { x: 0, y: 0, scale: w / aw } : placementFor(s.fit, aw, ah, w, h, cap);
  art = { source: img, aw, ah, background: s.background, cap };
  const { canvas, artSide } = renderArt(art, w, h, placement);
  return { canvas, artSide, placement, scale: placement.scale, dx: placement.x, dy: placement.y };
}

/** Move tool: re-place the picture (ink follows it). */
export async function commitArtPlacement(next: ArtPlacement) {
  const prev = engine.artPlacement;
  if (!art || !prev || !engine.hasImage) return;
  if (Math.abs(next.x - prev.x) < 0.01 && Math.abs(next.y - prev.y) < 0.01 && Math.abs(next.scale - prev.scale) < 1e-6) return;
  const { canvas, artSide } = renderArt(art, engine.width, engine.height, next);
  const k = next.scale / prev.scale;
  await engine.moveArt(canvas, artSide, next, { k, dx: next.x - prev.x * k, dy: next.y - prev.y * k });
}

/** Move tool quick actions. */
export function presetPlacement(mode: 'center' | 'fit' | 'fill' | 'original'): ArtPlacement | null {
  const cur = engine.artPlacement;
  if (!art || !cur) return null;
  const W = engine.width;
  const H = engine.height;
  if (mode === 'center') return { scale: cur.scale, x: (W - art.aw * cur.scale) / 2, y: (H - art.ah * cur.scale) / 2 };
  if (mode === 'original') return { scale: art.cap, x: (W - art.aw * art.cap) / 2, y: (H - art.ah * art.cap) / 2 };
  return placementFor(mode, art.aw, art.ah, W, H);
}

/** Draw the picture into a small canvas for the live drag preview. */
export function drawArtPreview(target: HTMLCanvasElement) {
  if (!art) return;
  const s = Math.min(1, 1024 / Math.max(art.aw, art.ah));
  target.width = Math.max(1, Math.round(art.aw * s));
  target.height = Math.max(1, Math.round(art.ah * s));
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art.source, 0, 0, target.width, target.height);
}

// Live placement while dragging (the preview), before it's committed.
const livePlacementStore = createStore<ArtPlacement | null>(null);
export const useLivePlacement = livePlacementStore.use;
export const setLivePlacement = (p: ArtPlacement | null) => livePlacementStore.set(p);

/**
 * Import a picture. `new` starts a fresh project (from the home screen);
 * `replace` swaps the art but keeps the current inks (from the editor).
 * Returns true when art was loaded.
 */
export async function importArtFile(file: File | Blob, mode: 'new' | 'replace' = 'new'): Promise<boolean> {
  if (file.type && !file.type.startsWith('image/')) {
    toast("That file isn't an image. Try PNG, JPG or WebP.");
    return false;
  }
  if (file.type === 'image/vnd.adobe.photoshop' || (file as File).name?.toLowerCase().endsWith('.psd')) {
    toast('PSD support is coming. For now, export a PNG from your art app.', 3200);
    return false;
  }
  let img: ImageBitmap | HTMLImageElement;
  try {
    img = await decodeImage(file);
  } catch {
    toast("Couldn't open that image. Try PNG or JPG.", 2600);
    return false;
  }
  const replacing = mode === 'replace' && engine.hasImage;
  if (!replacing) engine.reset();
  const placed = composeArt(img);
  await engine.setImage(placed.canvas, { artSide: placed.artSide, placement: placed.placement });
  engine.dirty = replacing;
  requestAnimationFrame(() => viewCommands.fit());
  toast(replacing ? 'Art replaced — your inks were kept' : 'Art imported');
  return true;
}

export async function loadSample() {
  const art = makeSampleArt();
  const placed = composeArt(art.canvas);
  const at = (c: { x: number; y: number; r: number }) => ({
    x: placed.dx + c.x * placed.scale,
    y: placed.dy + c.y * placed.scale,
    r: c.r * placed.scale,
  });
  engine.reset();
  await engine.setImage(placed.canvas, { artSide: placed.artSide, placement: placed.placement });
  engine.setInkBrush({ effect: 'boil', params: EFFECT_BY_ID.boil.defaults });
  engine.fillWithBrush();
  // A second, livelier boil on the stars shows off per-area control.
  const stars = engine.addInk('boil', { strength: 85, speed: 12 });
  if (stars) {
    engine.updateInk(stars.id, { name: 'Boil · stars' });
    engine.paintCircles(stars.id, art.stars.map(at));
  }
  engine.selectInk(null);
  engine.history.clear();
  engine.dirty = false;
  requestAnimationFrame(() => viewCommands.fit());
}

if (import.meta.env.DEV && instance) {
  // Handy for debugging in the console: `zinklet.inks`, `zinklet.renderFrame(...)`.
  (window as unknown as { zinklet: Engine }).zinklet = instance;
}
