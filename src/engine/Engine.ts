import { EFFECTS, EFFECT_BY_ID, MAX_INKS, type EffectId, type InkParams } from './effects';
import { FRAG, MAX_SLOTS, VERT } from './shaders';
import { decompose } from './lines';
import { History, type Command } from './history';

export type Tool = 'brush' | 'eraser';

/**
 * A group of painted strokes that share one effect + settings. Painting with the brush adds to the
 * group whose settings match exactly, or starts a new group — so changing the brush never changes
 * ink that's already on the art. Selecting a group lets you edit just that ink.
 */
export interface Ink {
  id: string;
  slot: number;
  effect: EffectId;
  name: string;
  params: InkParams;
  visible: boolean;
  seed: number;
  /** Rough flag for onboarding hints: has anything been painted with this ink. */
  painted: boolean;
}

export interface BrushSettings {
  /** Diameter in image pixels. */
  size: number;
  /** 0–100 */
  opacity: number;
  hard: boolean;
}

export interface FrameOptions {
  /** 0..1 opacity of the colored ink overlay (0 for export). */
  maskAlpha: number;
  showLines: boolean;
}

/** Working resolution cap for the prototype (keeps phones and iPads fast). */
export const MAX_SIDE = 2048;
export const BRUSH_MIN = 2;
export const BRUSH_MAX = 600;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StrokeTarget {
  ink: Ink;
  mask: HTMLCanvasElement;
  /** Created for this stroke (undo removes it again). */
  created: boolean;
}

interface StrokeState {
  /** One ink when painting; every visible ink when erasing. */
  targets: StrokeTarget[];
  eraser: boolean;
  opacity: number;
  last: { x: number; y: number; r: number };
  carry: number;
  bbox: Rect | null;
  pending: Rect | null;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

let idCounter = 0;
const newId = () => `ink${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function make2d(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private u: Uniforms = {};
  private srcTex!: WebGLTexture;
  private linesTex!: WebGLTexture;
  private fillTex!: WebGLTexture;
  private maskTex!: WebGLTexture;
  private vao!: WebGLVertexArrayObject;
  private contextLost = false;

  width = 0;
  height = 0;
  maskW = 0;
  maskH = 0;
  maskScale = 1;
  hasImage = false;
  hasAlpha = false;
  analyzing = false;
  sensitivity = 50;
  private imageData: ImageData | null = null;
  private layers: { src: Uint8Array; lines: Uint8Array; fill: Uint8Array } | null = null;

  inks: Ink[] = [];
  /** Ink group picked in the "On your art" list for editing (null = none). */
  selectedInkId: string | null = null;
  /** What the brush paints next. Remembered per effect so switching back restores your settings. */
  inkBrush: { effect: EffectId; params: InkParams } = { effect: 'boil', params: { ...EFFECT_BY_ID.boil.defaults } };
  private brushParams = Object.fromEntries(EFFECTS.map((e) => [e.id, { ...e.defaults }])) as Record<EffectId, InkParams>;
  /** Color of the ink overlay shown while painting. */
  overlayColor = '#ff8a3d';
  private masks = new Map<string, HTMLCanvasElement>();

  tool: Tool = 'brush';
  brush: BrushSettings = { size: 80, opacity: 100, hard: false };
  /** Pin the ink overlay on. When off, ink shows briefly while painting and then fades away. */
  showMask = false;
  private maskFlashUntil = 0;
  showLines = false;
  playing = true;
  loopSeconds = 2;
  /** Set while exporting so the preview loop doesn't draw in between frames. */
  busy = false;
  /** Set while the editor is off screen (home page) to save battery. */
  suspended = false;
  dirty = false;

  readonly history = new History();
  version = 0;
  private listeners = new Set<() => void>();

  private tip: HTMLCanvasElement = make2d(1, 1);
  private tipHard: boolean | null = null;
  private strokeCanvas: HTMLCanvasElement = make2d(1, 1);
  private scratch: HTMLCanvasElement = make2d(1, 1);
  private stroke: StrokeState | null = null;

  private clockOrigin = performance.now();
  private pausedLoopT = 0;
  private needsRender = true;
  private lastKey = '';
  private raf = 0;
  /** Preview loop stats for the performance overlay: redraws per second and CPU time per draw. */
  readonly stats = { fps: 0, drawMs: 0 };
  private statFrames = 0;
  private statSince = performance.now();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'art-canvas';
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.initGL();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.initGL();
      this.reuploadAll();
    });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- events

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.needsRender = true;
    for (const fn of this.listeners) fn();
  }

  // ---------------------------------------------------------------- GL setup

  private initGL() {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader link failed: ' + gl.getProgramInfoLog(prog));
    }
    this.program = prog;
    gl.useProgram(prog);
    const names = [
      'uSrc', 'uLines', 'uFill', 'uMasks', 'uSize', 'uType', 'uAmp', 'uScale', 'uSeed', 'uPhase',
      'uStrength', 'uLinesOnly', 'uTint', 'uTintA', 'uShowMask', 'uShowLines',
    ];
    for (const n of names) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.uSrc, 0);
    gl.uniform1i(this.u.uLines, 1);
    gl.uniform1i(this.u.uFill, 2);
    gl.uniform1i(this.u.uMasks, 3);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const tex2d = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.srcTex = tex2d();
    this.linesTex = tex2d();
    this.fillTex = tex2d();
    this.maskTex = gl.createTexture()!;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private allocTextures() {
    const gl = this.gl;
    for (const t of [this.srcTex, this.linesTex, this.fillTex]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.deleteTexture(this.maskTex);
    this.maskTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R8, this.maskW, this.maskH, MAX_SLOTS);
  }

  private uploadLayers() {
    if (!this.layers) return;
    const gl = this.gl;
    const put = (t: WebGLTexture, data: Uint8Array) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    };
    put(this.srcTex, this.layers.src);
    put(this.linesTex, this.layers.lines);
    put(this.fillTex, this.layers.fill);
  }

  private reuploadAll() {
    if (!this.hasImage) return;
    this.allocTextures();
    this.uploadLayers();
    for (const ink of this.inks) this.uploadMask(ink, null);
    this.needsRender = true;
  }

  /** Upload a region (mask pixels) of an ink's committed mask, or of an ImageData override. */
  private uploadMask(ink: Ink, rect: Rect | null, override?: ImageData) {
    if (this.contextLost) return;
    const r = rect ?? { x: 0, y: 0, w: this.maskW, h: this.maskH };
    if (r.w <= 0 || r.h <= 0) return;
    const img = override ?? ctx2d(this.masks.get(ink.id)!).getImageData(r.x, r.y, r.w, r.h);
    const src = img.data;
    const out = new Uint8Array(r.w * r.h);
    for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = src[j];
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, r.x, r.y, ink.slot, r.w, r.h, 1, gl.RED, gl.UNSIGNED_BYTE, out);
    this.needsRender = true;
  }

  // ---------------------------------------------------------------- image

  /** Load (or replace) the artwork. Existing inks are kept and rescaled to fit. */
  async setImage(source: CanvasImageSource & { width: number; height: number }) {
    let w = (source as HTMLImageElement).naturalWidth || source.width;
    let h = (source as HTMLImageElement).naturalHeight || source.height;
    const s = Math.min(1, MAX_SIDE / Math.max(w, h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
    const c = make2d(w, h);
    const cx = ctx2d(c);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(source, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h);

    let alpha = false;
    for (let i = 3; i < data.data.length; i += 16) {
      if (data.data[i] < 250) {
        alpha = true;
        break;
      }
    }

    const oldMaskW = this.maskW;
    const oldMaskH = this.maskH;
    this.width = w;
    this.height = h;
    this.maskScale = Math.max(w, h) > 1024 ? 0.5 : 1;
    this.maskW = Math.max(1, Math.round(w * this.maskScale));
    this.maskH = Math.max(1, Math.round(h * this.maskScale));
    this.imageData = data;
    this.hasAlpha = alpha;
    this.canvas.width = w;
    this.canvas.height = h;
    this.strokeCanvas = make2d(this.maskW, this.maskH);

    for (const [id, m] of this.masks) {
      if (m.width === this.maskW && m.height === this.maskH) continue;
      const nm = make2d(this.maskW, this.maskH);
      const nctx = ctx2d(nm);
      nctx.imageSmoothingQuality = 'high';
      if (oldMaskW && oldMaskH) nctx.drawImage(m, 0, 0, this.maskW, this.maskH);
      this.masks.set(id, nm);
    }
    this.history.clear();
    this.allocTextures();
    for (const ink of this.inks) this.uploadMask(ink, null);
    this.hasImage = true;
    await this.analyze();
  }

  /** Re-run line detection (after loading or when sensitivity changes). */
  async analyze() {
    if (!this.imageData) return;
    this.analyzing = true;
    this.emit();
    await new Promise((r) => setTimeout(r, 16));
    this.layers = decompose(this.imageData, this.sensitivity);
    this.uploadLayers();
    this.analyzing = false;
    this.emit();
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    this.emit();
  }

  /** Clear everything back to the empty state. */
  reset() {
    this.hasImage = false;
    this.imageData = null;
    this.layers = null;
    this.inks = [];
    this.masks.clear();
    this.selectedInkId = null;
    this.history.clear();
    this.dirty = false;
    this.emit();
  }

  // ---------------------------------------------------------------- inks

  get selectedInk(): Ink | null {
    return this.inks.find((i) => i.id === this.selectedInkId) ?? null;
  }

  get canAddInk() {
    return this.inks.length < MAX_INKS;
  }

  get anyPaint() {
    return this.inks.some((i) => i.painted);
  }

  /** Change the brush (affects only what you paint next). */
  setInkBrush(patch: { effect?: EffectId; params?: Partial<InkParams> }) {
    const effect = patch.effect ?? this.inkBrush.effect;
    const params = { ...this.brushParams[effect], ...(patch.params ?? {}) };
    this.brushParams[effect] = params;
    this.inkBrush = { effect, params: { ...params } };
    this.emit();
  }

  /** Copy a painted ink's effect + settings onto the brush. */
  useInkAsBrush(id: string) {
    const ink = this.inks.find((i) => i.id === id);
    if (ink) this.setInkBrush({ effect: ink.effect, params: ink.params });
  }

  private sameSettings(a: InkParams, b: InkParams) {
    return a.strength === b.strength && a.speed === b.speed && a.size === b.size && a.linesOnly === b.linesOnly;
  }

  /** The ink group matching the brush exactly, if one exists. */
  private findBrushInk(): Ink | null {
    const { effect, params } = this.inkBrush;
    return this.inks.find((i) => i.effect === effect && this.sameSettings(i.params, params)) ?? null;
  }

  private attachInk(ink: Ink) {
    if (!this.inks.includes(ink)) this.inks.push(ink);
    this.uploadMask(ink, null);
  }

  private detachInk(ink: Ink) {
    this.inks = this.inks.filter((i) => i !== ink);
    if (this.selectedInkId === ink.id) this.selectedInkId = null;
  }

  /** Make a new, empty ink group. No undo entry (callers record their own). */
  private createInk(effect: EffectId, params: InkParams): Ink | null {
    if (!this.canAddInk || !this.hasImage) return null;
    const used = new Set(this.inks.map((i) => i.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const def = EFFECT_BY_ID[effect];
    const names = new Set(this.inks.map((i) => i.name));
    let n = 1;
    while (names.has(n === 1 ? def.name : `${def.name} ${n}`)) n++;
    const ink: Ink = {
      id: newId(),
      slot,
      effect,
      name: n === 1 ? def.name : `${def.name} ${n}`,
      params: { ...params },
      visible: true,
      seed: 1 + Math.floor(Math.random() * 9000),
      painted: false,
    };
    this.masks.set(ink.id, make2d(this.maskW, this.maskH));
    this.attachInk(ink);
    return ink;
  }

  /** Programmatic ink creation (sample art). Not undoable. */
  addInk(effect: EffectId, params: Partial<InkParams> = {}): Ink | null {
    const ink = this.createInk(effect, { ...EFFECT_BY_ID[effect].defaults, ...params });
    if (ink) {
      this.dirty = true;
      this.emit();
    }
    return ink;
  }

  removeInk(id: string) {
    const ink = this.inks.find((i) => i.id === id);
    if (!ink) return;
    const index = this.inks.indexOf(ink);
    this.detachInk(ink);
    this.history.push({
      label: `Delete ${ink.name}`,
      undo: () => {
        // Any command that reused this slot was undone first, so the slot is free again.
        this.inks.splice(Math.min(index, this.inks.length), 0, ink);
        this.uploadMask(ink, null);
      },
      redo: () => this.detachInk(ink),
    });
    this.dirty = true;
    this.emit();
  }

  /** Select a painted ink to edit it (null to deselect). Briefly highlights it on the art. */
  selectInk(id: string | null) {
    this.selectedInkId = id;
    if (id) this.flashMask(1200);
    this.emit();
  }

  updateInk(id: string, patch: Partial<Pick<Ink, 'name' | 'visible'>> & { params?: Partial<InkParams> }) {
    const ink = this.inks.find((i) => i.id === id);
    if (!ink) return;
    if (patch.name !== undefined) ink.name = patch.name;
    if (patch.visible !== undefined) ink.visible = patch.visible;
    if (patch.params) ink.params = { ...ink.params, ...patch.params };
    this.dirty = true;
    this.emit();
  }

  setInkEffect(id: string, effect: EffectId) {
    const ink = this.inks.find((i) => i.id === id);
    if (!ink || ink.effect === effect) return;
    const oldDef = EFFECT_BY_ID[ink.effect];
    const def = EFFECT_BY_ID[effect];
    if (ink.name.startsWith(oldDef.name)) ink.name = def.name + ink.name.slice(oldDef.name.length);
    ink.effect = effect;
    ink.params = { ...def.defaults };
    this.dirty = true;
    this.emit();
  }

  /** Give every ink fresh randomness (a different-looking boil with the same settings). */
  rerollSeeds() {
    for (const ink of this.inks) ink.seed = 1 + Math.floor(Math.random() * 9000);
    this.dirty = true;
    this.emit();
  }

  setOverlayColor(color: string) {
    this.overlayColor = color;
    this.flashMask(1200);
    this.emit();
  }

  private maskSnapshotCommand(ink: Ink, label: string, apply: (ctx: CanvasRenderingContext2D) => void) {
    const mask = this.masks.get(ink.id);
    if (!mask) return;
    const cx = ctx2d(mask);
    const before = cx.getImageData(0, 0, mask.width, mask.height);
    apply(cx);
    const after = cx.getImageData(0, 0, mask.width, mask.height);
    this.uploadMask(ink, null);
    this.flashMask();
    const restore = (img: ImageData) => () => {
      ctx2d(mask).putImageData(img, 0, 0);
      if (this.inks.includes(ink)) this.uploadMask(ink, null);
    };
    this.history.push({ label, undo: restore(before), redo: restore(after) });
    this.dirty = true;
    this.emit();
  }

  /** "Animate everything": cover the whole artwork with the current brush. */
  fillWithBrush() {
    let ink = this.findBrushInk();
    const created = !ink;
    if (!ink) ink = this.createInk(this.inkBrush.effect, this.inkBrush.params);
    if (!ink) return false;
    const mask = this.masks.get(ink.id)!;
    const cx = ctx2d(mask);
    const before = cx.getImageData(0, 0, mask.width, mask.height);
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, this.maskW, this.maskH);
    const after = cx.getImageData(0, 0, mask.width, mask.height);
    ink.painted = true;
    this.uploadMask(ink, null);
    this.flashMask();
    const target = ink;
    this.history.push({
      label: `Animate everything (${target.name})`,
      undo: () => {
        ctx2d(mask).putImageData(before, 0, 0);
        if (created) this.detachInk(target);
        else if (this.inks.includes(target)) this.uploadMask(target, null);
      },
      redo: () => {
        ctx2d(mask).putImageData(after, 0, 0);
        this.attachInk(target);
      },
    });
    this.dirty = true;
    this.emit();
    return true;
  }

  clearInk(id: string) {
    const ink = this.inks.find((i) => i.id === id);
    if (!ink) return;
    this.maskSnapshotCommand(ink, `Clear ${ink.name}`, (cx) => cx.clearRect(0, 0, this.maskW, this.maskH));
  }

  invertInk(id: string) {
    const ink = this.inks.find((i) => i.id === id);
    if (!ink) return;
    ink.painted = true;
    this.maskSnapshotCommand(ink, `Invert ${ink.name}`, (cx) => {
      const img = cx.getImageData(0, 0, this.maskW, this.maskH);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = 255 - d[i + 3];
      }
      cx.putImageData(img, 0, 0);
    });
  }

  /** Programmatic painting (used by the sample art). Coordinates in image pixels. No undo entry. */
  paintCircles(id: string, circles: { x: number; y: number; r: number }[]) {
    const ink = this.inks.find((i) => i.id === id);
    const mask = ink && this.masks.get(ink.id);
    if (!ink || !mask) return;
    this.ensureTip(false);
    const cx = ctx2d(mask);
    const s = this.maskScale;
    for (const c of circles) cx.drawImage(this.tip, (c.x - c.r) * s, (c.y - c.r) * s, 2 * c.r * s, 2 * c.r * s);
    ink.painted = true;
    this.uploadMask(ink, null);
    this.emit();
  }

  // ---------------------------------------------------------------- tools

  setTool(tool: Tool) {
    this.tool = tool;
    this.emit();
  }

  setBrush(patch: Partial<BrushSettings>) {
    this.brush = { ...this.brush, ...patch };
    this.brush.size = Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, this.brush.size));
    this.brush.opacity = Math.min(100, Math.max(1, this.brush.opacity));
    this.emit();
  }

  setShowMask(v: boolean) {
    this.showMask = v;
    this.emit();
  }

  /** Briefly reveal where the ink is (while painting, selecting or changing an ink). */
  flashMask(ms = 1400) {
    this.maskFlashUntil = Math.max(this.maskFlashUntil, performance.now() + ms);
    this.needsRender = true;
  }

  private get maskAlpha(): number {
    if (this.showMask) return 1;
    if (this.stroke) return 1;
    const left = this.maskFlashUntil - performance.now();
    return left <= 0 ? 0 : Math.min(1, left / 500);
  }

  setShowLines(v: boolean) {
    this.showLines = v;
    this.emit();
  }

  undo(): Command | null {
    if (this.stroke) return null;
    const c = this.history.undo();
    if (c) {
      this.flashMask(900);
      this.emit();
    }
    return c;
  }

  redo(): Command | null {
    if (this.stroke) return null;
    const c = this.history.redo();
    if (c) {
      this.flashMask(900);
      this.emit();
    }
    return c;
  }

  // ---------------------------------------------------------------- strokes

  private ensureTip(hard: boolean) {
    if (this.tipHard === hard) return;
    const size = 256;
    const c = make2d(size, size);
    const cx = c.getContext('2d')!;
    const g = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (hard) {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.82, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const a = Math.pow(1 - t * t, 2.2);
        g.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
      }
    }
    cx.fillStyle = g;
    cx.fillRect(0, 0, size, size);
    this.tip = c;
    this.tipHard = hard;
  }

  private radiusFor(pressure: number, isPen: boolean) {
    const f = isPen ? 0.2 + 0.8 * Math.min(1, Math.max(0, pressure)) : 1;
    return Math.max(0.75, (this.brush.size / 2) * f * this.maskScale);
  }

  /**
   * Start painting. The brush adds to the ink group matching its settings (creating one if
   * needed); the eraser removes ink from every visible group.
   * Returns 'ok', 'nothing' (nothing to erase / no art) or 'full' (too many different inks).
   */
  beginStroke(x: number, y: number, pressure: number, isPen: boolean): 'ok' | 'nothing' | 'full' {
    if (!this.hasImage) return 'nothing';
    const eraser = this.tool === 'eraser';
    let targets: StrokeTarget[];
    if (eraser) {
      targets = this.inks.filter((i) => i.visible).map((ink) => ({ ink, mask: this.masks.get(ink.id)!, created: false }));
      if (!targets.length) return 'nothing';
    } else {
      let ink = this.findBrushInk();
      const created = !ink;
      if (!ink) ink = this.createInk(this.inkBrush.effect, this.inkBrush.params);
      if (!ink) return 'full';
      ink.visible = true;
      targets = [{ ink, mask: this.masks.get(ink.id)!, created }];
    }
    this.ensureTip(this.brush.hard);
    const s = this.maskScale;
    const r = this.radiusFor(pressure, isPen);
    this.stroke = {
      targets,
      eraser,
      opacity: this.brush.opacity / 100,
      last: { x: x * s, y: y * s, r },
      carry: 0,
      bbox: null,
      pending: null,
    };
    this.stamp(x * s, y * s, r);
    this.flushStroke();
    return 'ok';
  }

  strokeTo(x: number, y: number, pressure: number, isPen: boolean) {
    const st = this.stroke;
    if (!st) return;
    const s = this.maskScale;
    const nx = x * s;
    const ny = y * s;
    const nr = this.radiusFor(pressure, isPen);
    const { x: lx, y: ly, r: lr } = st.last;
    const dist = Math.hypot(nx - lx, ny - ly);
    let t = st.carry;
    while (true) {
      const rr = lr + (nr - lr) * (dist ? t / dist : 1);
      const spacing = Math.max(0.6, rr * 0.14);
      t += spacing;
      if (t > dist) {
        st.carry = t - spacing - dist;
        break;
      }
      const k = t / dist;
      this.stamp(lx + (nx - lx) * k, ly + (ny - ly) * k, rr);
    }
    st.last = { x: nx, y: ny, r: nr };
  }

  private stamp(x: number, y: number, r: number) {
    const st = this.stroke!;
    const cx = this.strokeCanvas.getContext('2d')!;
    cx.drawImage(this.tip, x - r, y - r, r * 2, r * 2);
    const rect = {
      x: Math.floor(x - r) - 1,
      y: Math.floor(y - r) - 1,
      w: Math.ceil(r * 2) + 3,
      h: Math.ceil(r * 2) + 3,
    };
    st.pending = unionRect(st.pending, rect);
  }

  private clampRect(r: Rect): Rect | null {
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    const w = Math.min(this.maskW, r.x + r.w) - x;
    const h = Math.min(this.maskH, r.y + r.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  }

  /** Push the in-progress stroke to the GPU so the animation updates live while painting. */
  flushStroke() {
    const st = this.stroke;
    if (!st || !st.pending) return;
    const r = this.clampRect(st.pending);
    st.pending = null;
    if (!r) return;
    st.bbox = unionRect(st.bbox, r);
    for (const t of st.targets) this.uploadMask(t.ink, r, this.composeStroke(st, t.mask, r));
  }

  private composeStroke(st: StrokeState, mask: HTMLCanvasElement, r: Rect): ImageData {
    if (this.scratch.width < r.w || this.scratch.height < r.h) {
      this.scratch = make2d(Math.max(r.w, this.scratch.width), Math.max(r.h, this.scratch.height));
    }
    const sx = ctx2d(this.scratch);
    sx.globalCompositeOperation = 'source-over';
    sx.globalAlpha = 1;
    sx.clearRect(0, 0, r.w, r.h);
    sx.drawImage(mask, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    sx.globalCompositeOperation = st.eraser ? 'destination-out' : 'source-over';
    sx.globalAlpha = st.opacity;
    sx.drawImage(this.strokeCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    sx.globalCompositeOperation = 'source-over';
    sx.globalAlpha = 1;
    return sx.getImageData(0, 0, r.w, r.h);
  }

  endStroke() {
    const st = this.stroke;
    if (!st) return;
    this.flushStroke();
    this.stroke = null;
    const r = st.bbox;
    if (!r) {
      for (const t of st.targets) if (t.created) this.detachInk(t.ink);
      return;
    }
    const changes = st.targets.map((t) => {
      const mctx = ctx2d(t.mask);
      const before = mctx.getImageData(r.x, r.y, r.w, r.h);
      mctx.save();
      mctx.globalAlpha = st.opacity;
      mctx.globalCompositeOperation = st.eraser ? 'destination-out' : 'source-over';
      mctx.drawImage(this.strokeCanvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      mctx.restore();
      return { ...t, before, after: mctx.getImageData(r.x, r.y, r.w, r.h) };
    });
    this.strokeCanvas.getContext('2d')!.clearRect(r.x, r.y, r.w, r.h);
    if (!st.eraser) for (const t of st.targets) t.ink.painted = true;
    this.flashMask(1100);
    this.history.push({
      label: st.eraser ? 'Erase' : `Paint ${st.targets[0].ink.name}`,
      undo: () => {
        for (const c of changes) {
          ctx2d(c.mask).putImageData(c.before, r.x, r.y);
          if (c.created) this.detachInk(c.ink);
          else if (this.inks.includes(c.ink)) this.uploadMask(c.ink, r);
        }
      },
      redo: () => {
        for (const c of changes) {
          ctx2d(c.mask).putImageData(c.after, r.x, r.y);
          if (c.created) this.attachInk(c.ink);
          else if (this.inks.includes(c.ink)) this.uploadMask(c.ink, r);
        }
      },
    });
    this.dirty = true;
    this.emit();
  }

  /** Abort the current stroke (e.g. it turned out to be the start of a two-finger gesture). */
  cancelStroke() {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    const r = st.bbox ?? (st.pending && this.clampRect(st.pending));
    if (r) this.strokeCanvas.getContext('2d')!.clearRect(r.x, r.y, r.w, r.h);
    for (const t of st.targets) {
      if (t.created) this.detachInk(t.ink);
      else if (r) this.uploadMask(t.ink, r);
    }
    this.emit();
  }

  get isStroking() {
    return this.stroke !== null;
  }

  // ---------------------------------------------------------------- playback

  get loopTime(): number {
    if (!this.playing) return this.pausedLoopT;
    const t = (performance.now() - this.clockOrigin) / 1000;
    return t % this.loopSeconds;
  }

  setPlaying(p: boolean) {
    if (p === this.playing) return;
    if (p) {
      this.clockOrigin = performance.now() - this.pausedLoopT * 1000;
    } else {
      this.pausedLoopT = this.loopTime;
    }
    this.playing = p;
    this.emit();
  }

  setLoopSeconds(s: number) {
    this.loopSeconds = s;
    this.clockOrigin = performance.now();
    this.pausedLoopT = 0;
    this.dirty = true;
    this.emit();
  }

  private loop() {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.hasImage || this.busy || this.suspended || this.contextLost || !this.layers) return;
    const t0 = performance.now();
    const key = this.renderFrame(
      this.loopTime,
      { maskAlpha: this.maskAlpha, showLines: this.showLines },
      !this.needsRender ? this.lastKey : null,
    );
    if (key !== this.lastKey || this.needsRender) {
      this.statFrames++;
      this.stats.drawMs = performance.now() - t0;
    }
    if (t0 - this.statSince >= 1000) {
      this.stats.fps = Math.round((this.statFrames * 1000) / (t0 - this.statSince));
      this.statFrames = 0;
      this.statSince = t0;
    }
    this.lastKey = key;
    this.needsRender = false;
  }

  /**
   * Render one frame at loop time `t` (seconds). If `skipIfKey` equals the frame's key
   * (nothing visible changed), drawing is skipped. Returns the frame key.
   */
  renderFrame(t: number, opts: FrameOptions, skipIfKey: string | null = null): string {
    const loop = this.loopSeconds;
    const unit = Math.max(this.width, this.height) / 1000;
    const type = new Int32Array(MAX_SLOTS).fill(-1);
    const amp = new Float32Array(MAX_SLOTS);
    const scale = new Float32Array(MAX_SLOTS).fill(1);
    const seed = new Float32Array(MAX_SLOTS);
    const phase = new Float32Array(MAX_SLOTS);
    const strength = new Float32Array(MAX_SLOTS);
    const linesOnly = new Float32Array(MAX_SLOTS);
    const tint = new Float32Array(MAX_SLOTS * 3);
    const tintA = new Float32Array(MAX_SLOTS);
    let key = `${opts.maskAlpha.toFixed(2)}${opts.showLines ? 1 : 0}${this.selectedInkId}${this.overlayColor}`;
    const [tr, tg, tb] = hexToRgb(this.overlayColor);
    const u = t / loop;
    for (const ink of this.inks) {
      if (!ink.visible) continue;
      const def = EFFECT_BY_ID[ink.effect];
      const i = ink.slot;
      const p = ink.params;
      type[i] = def.shaderId;
      amp[i] = def.ampUnits * unit * (p.strength / 100);
      scale[i] = (def.sizeUnits[0] + (def.sizeUnits[1] - def.sizeUnits[0]) * (p.size / 100)) * unit;
      strength[i] = p.strength / 100;
      linesOnly[i] = p.linesOnly ? 1 : 0;
      if (def.stepped) {
        const steps = Math.max(1, Math.round(loop * p.speed));
        const step = Math.min(steps - 1, Math.floor(u * steps));
        seed[i] = (ink.seed * 131 + step * 7) % 16000000;
        key += `|${i}s${step}`;
      } else {
        const cycles = Math.max(1, Math.round(loop * p.speed));
        seed[i] = ink.seed;
        phase[i] = (u * cycles) % 1;
        key += `|${i}p${phase[i].toFixed(4)}`;
      }
      tint[i * 3] = tr;
      tint[i * 3 + 1] = tg;
      tint[i * 3 + 2] = tb;
      // A selected ink stands out; everything else stays faint while one is selected.
      tintA[i] = !this.selectedInkId || ink.id === this.selectedInkId ? 1 : 0.25;
    }
    if (skipIfKey !== null && key === skipIfKey) return key;

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.linesTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.fillTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(this.u.uSize, this.width, this.height);
    gl.uniform1iv(this.u.uType, type);
    gl.uniform1fv(this.u.uAmp, amp);
    gl.uniform1fv(this.u.uScale, scale);
    gl.uniform1fv(this.u.uSeed, seed);
    gl.uniform1fv(this.u.uPhase, phase);
    gl.uniform1fv(this.u.uStrength, strength);
    gl.uniform1fv(this.u.uLinesOnly, linesOnly);
    gl.uniform3fv(this.u.uTint, tint);
    gl.uniform1fv(this.u.uTintA, tintA);
    gl.uniform1f(this.u.uShowMask, opts.maskAlpha);
    gl.uniform1f(this.u.uShowLines, opts.showLines ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return key;
  }

  /** A still preview of the current frame (no ink overlay), for thumbnails. */
  snapshot(maxSide = 480): string {
    if (!this.hasImage || !this.layers || this.contextLost) return '';
    const s = Math.min(1, maxSide / Math.max(this.width, this.height));
    const c = make2d(Math.round(this.width * s), Math.round(this.height * s));
    this.renderFrame(this.loopTime, { maskAlpha: 0, showLines: false });
    c.getContext('2d')!.drawImage(this.canvas, 0, 0, c.width, c.height);
    this.needsRender = true;
    return c.toDataURL('image/png');
  }

  /** Ask the preview loop to redraw on the next frame. */
  invalidate() {
    this.needsRender = true;
  }
}
