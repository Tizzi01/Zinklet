import { useSyncExternalStore } from 'react';
import { Engine } from '../engine/Engine';
import { makeSampleArt } from '../engine/sample';

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

export async function importArtFile(file: File | Blob) {
  if (file.type && !file.type.startsWith('image/')) {
    toast("That file isn't an image. Try PNG, JPG or WebP.");
    return;
  }
  if (file.type === 'image/vnd.adobe.photoshop' || (file as File).name?.toLowerCase().endsWith('.psd')) {
    toast('PSD support is coming. For now, export a PNG from your art app.', 3200);
    return;
  }
  let img: ImageBitmap | HTMLImageElement;
  try {
    img = await decodeImage(file);
  } catch {
    toast("Couldn't open that image. Try PNG or JPG.", 2600);
    return;
  }
  const replacing = engine.hasImage;
  await engine.setImage(img);
  if (engine.inks.length === 0) engine.addInk('boil', false);
  requestAnimationFrame(() => viewCommands.fit());
  toast(replacing ? 'Art replaced — your inks were kept' : 'Art imported');
}

export async function loadSample() {
  const art = makeSampleArt();
  engine.reset();
  await engine.setImage(art.canvas);
  const boil = engine.addInk('boil', false)!;
  engine.fillInk(boil.id);
  // A second, livelier boil on the stars shows off per-area control.
  const stars = engine.addInk('boil', false)!;
  engine.updateInk(stars.id, { name: 'Boil · stars', params: { strength: 85, speed: 12 } });
  engine.paintCircles(stars.id, art.stars);
  engine.setActiveInk(boil.id);
  engine.history.clear();
  engine.dirty = false;
  requestAnimationFrame(() => viewCommands.fit());
}

if (import.meta.env.DEV && instance) {
  // Handy for debugging in the console: `zinklet.inks`, `zinklet.renderFrame(...)`.
  (window as unknown as { zinklet: Engine }).zinklet = instance;
}
