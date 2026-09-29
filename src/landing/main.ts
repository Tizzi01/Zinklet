import './landing.css';
import { LINKS, WAITLIST } from './config';
import { SITE_VERSION } from './version';

// ------------------------------------------------------------------ helpers

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

let toastTimer = 0;
function toast(text: string) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2600);
}

function readLocal(key: string) {
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
    /* private mode */
  }
}

for (const el of document.querySelectorAll('[data-site-version]')) el.textContent = `site v${SITE_VERSION}`;

// ------------------------------------------------------------------ theme (shared with the app)

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme !== 'light';
  $('#theme')?.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}
$('#theme')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  writeLocal('zinklet.theme', next);
  syncThemeButton();
});
syncThemeButton();

// ------------------------------------------------------------------ scroll reveal

const revealer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        revealer.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 },
);
$$('.reveal').forEach((el) => revealer.observe(el));

// ------------------------------------------------------------------ Discord / survey links

for (const a of $$<HTMLAnchorElement>('[data-link]')) {
  const key = a.dataset.link as keyof typeof LINKS;
  const url = LINKS[key];
  if (url) {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
  } else {
    a.classList.add('soon');
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      toast(key === 'discord' ? 'The Discord opens very soon. Join the waitlist to get the invite.' : 'The survey opens very soon. Join the waitlist to get it.');
    });
  }
}

// ------------------------------------------------------------------ waitlist

const WAITLIST_KEY = 'zinklet.waitlist';

function markJoined(form: HTMLFormElement) {
  form.classList.add('done');
  form.innerHTML = '✦ You’re on the list. See you at launch!';
  const note = form.nextElementSibling as HTMLElement | null;
  if (note?.matches('[data-waitlist-note]')) note.textContent = 'We’ll email you once, when early access opens.';
}

for (const form of $$<HTMLFormElement>('[data-waitlist]')) {
  if (readLocal(WAITLIST_KEY)) markJoined(form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = $<HTMLInputElement>('input[type=email]', form)!;
    const email = input.value.trim();
    const note = form.nextElementSibling as HTMLElement | null;
    if (!input.checkValidity() || !email) {
      input.focus();
      return;
    }
    if (!WAITLIST.formAction || !WAITLIST.emailField) {
      // Not wired up yet: be honest instead of pretending the email was saved.
      if (note) {
        note.textContent = 'The waitlist opens in a few days. Check back soon!';
        note.classList.add('warn');
      }
      return;
    }
    const button = $<HTMLButtonElement>('button', form)!;
    button.disabled = true;
    button.textContent = 'Joining…';
    try {
      const body = new FormData();
      body.append(WAITLIST.emailField, email);
      // Google Forms doesn't allow reading the response cross-origin; a sent request is a success.
      await fetch(WAITLIST.formAction, { method: 'POST', mode: 'no-cors', body });
      writeLocal(WAITLIST_KEY, '1');
      $$<HTMLFormElement>('[data-waitlist]').forEach(markJoined);
      toast('You’re on the list ✦');
    } catch {
      button.disabled = false;
      button.textContent = 'Try again';
      if (note) {
        note.textContent = 'Couldn’t reach the waitlist. Check your connection and try again.';
        note.classList.add('warn');
      }
    }
  });
}

// ------------------------------------------------------------------ media (drop files into /public/landing-media)

const MEDIA = '/landing-media';

async function findClip(name: string): Promise<{ url: string; kind: 'video' | 'image' } | null> {
  for (const ext of ['mp4', 'webm', 'gif']) {
    const url = `${MEDIA}/${name}.${ext}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && (type.startsWith('video/') || type.startsWith('image/'))) {
        // (the dev server answers unknown paths with HTML, so the content type check matters)
        return { url, kind: ext === 'gif' ? 'image' : 'video' };
      }
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// Clips only download and play while they're on screen (saves data on phones).
const clipWatcher = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const video = e.target.querySelector('video');
      if (!video) continue;
      if (e.isIntersecting) {
        if (!video.src) video.src = video.dataset.src!;
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  },
  { rootMargin: '200px' },
);

for (const box of $$('[data-clip]')) {
  void findClip(box.dataset.clip!).then((clip) => {
    if (!clip) return;
    if (clip.kind === 'image') {
      box.replaceChildren(Object.assign(document.createElement('img'), { src: clip.url, alt: '', loading: 'lazy' }));
      return;
    }
    const video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'none' });
    video.dataset.src = clip.url;
    video.setAttribute('aria-hidden', 'true');
    box.replaceChildren(video);
    clipWatcher.observe(box);
  });
}

// ------------------------------------------------------------------ live demo (the real engine)

async function startDemo() {
  const stage = $('[data-demo-stage]');
  if (!stage) return;
  const loading = $('[data-demo-loading]');
  const stateLabel = $('[data-demo-state]');
  const title = $('.demo-title');
  const [{ Engine }, { makeSampleArt }, { EFFECT_BY_ID }] = await Promise.all([
    import('../engine/Engine'),
    import('../engine/sample'),
    import('../engine/effects'),
  ]);
  // "Paint it yourself" uses demo.*; Alive/Still can show a different picture (demo-alive.*).
  const paintArt = (await loadDemoArt('demo')) ?? makeSampleArt().canvas;
  const aliveArt = (await loadDemoArt('demo-alive')) ?? paintArt;
  const art = { canvas: aliveArt };
  stage.style.aspectRatio = `${art.canvas.width} / ${art.canvas.height}`;

  let engine: InstanceType<typeof Engine>;
  try {
    engine = new Engine();
  } catch {
    // No WebGL2: show the still drawing.
    art.canvas.style.width = '100%';
    art.canvas.style.height = '100%';
    stage.replaceChildren(art.canvas);
    return;
  }

  engine.canvas.className = '';
  stage.prepend(engine.canvas);
  const useInk = (effect: 'boil' | 'jitter' | 'wobble') => engine.setInkBrush({ effect, params: EFFECT_BY_ID[effect].defaults });

  let shown: HTMLCanvasElement | null = null;
  /** Put a picture in the demo (fresh, no ink). */
  const show = async (canvas: HTMLCanvasElement) => {
    if (shown === canvas) return;
    shown = canvas;
    engine.reset();
    stage.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
    await engine.setImage(canvas);
    engine.setBrush({ size: Math.round(Math.max(engine.width, engine.height) * 0.055), hard: false, opacity: 100 });
  };
  const animateAll = () => {
    useInk('boil');
    engine.fillWithBrush();
    engine.clearMaskFlash();
  };

  // A ready-made animation (landing-media/display.mp4|webm|gif, made in Zinklet) takes over Alive/Still.
  const display = await findClip('display');
  let displayEl: HTMLVideoElement | HTMLImageElement | null = null;
  let displayAspect = '1 / 1';
  let displayOn = false;
  let onScreen = true;
  const syncSuspend = () => {
    engine.suspended = !onScreen || displayOn;
    if (!engine.suspended) engine.invalidate();
  };
  const setDisplay = (on: boolean, playing = true) => {
    if (!displayEl) return;
    displayOn = on;
    displayEl.hidden = !on;
    if (displayEl instanceof HTMLVideoElement) {
      // autoplay as a backup: some browsers ignore play() before the video is ready.
      displayEl.autoplay = on && playing;
      if (on && playing && onScreen) void displayEl.play().catch(() => {});
      else displayEl.pause();
      if (on && !playing) displayEl.currentTime = 0;
    }
    if (on) stage.style.aspectRatio = displayAspect;
    syncSuspend();
  };

  // "Show invisible ink": landing-media/display-ink.webp is the pink overlay exactly as painted.
  // Its alpha also gives back the painted areas, so Alive can run the real engine with that ink
  // (the pink then boils along with the lines); Still shows the overlay over the frozen frame.
  let inkLayer: HTMLImageElement | null = null;
  let inkBtn: HTMLButtonElement | null = null;
  let inkMask: HTMLCanvasElement | null = null;
  let inkShown = false;

  if (display) {
    if (display.kind === 'video') {
      const v = Object.assign(document.createElement('video'), { src: display.url, muted: true, loop: true, playsInline: true, preload: 'auto' });
      await new Promise((res) => {
        v.onloadedmetadata = res;
        v.onerror = res;
      });
      if (v.videoWidth) displayAspect = `${v.videoWidth} / ${v.videoHeight}`;
      displayEl = v;
    } else {
      const img = Object.assign(document.createElement('img'), { alt: '' });
      await imageLoaded(img, display.url);
      if (img.naturalWidth) displayAspect = `${img.naturalWidth} / ${img.naturalHeight}`;
      displayEl = img;
    }
    displayEl.className = 'demo-display';
    displayEl.addEventListener('pointerdown', () => toast('Tap “Paint it yourself” to try the brush'));
    stage.appendChild(displayEl);

    const inkUrl = await findImage('display-ink');
    if (inkUrl) {
      inkLayer = Object.assign(document.createElement('img'), { alt: '', className: 'demo-ink-layer' });
      await imageLoaded(inkLayer, inkUrl);
      inkMask = inkMaskFrom(inkLayer);
      inkBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'ink-reveal' });
      inkBtn.addEventListener('click', () => {
        inkShown = !inkShown;
        void render();
      });
      stage.append(inkLayer, inkBtn);
    }
  }

  type Mode = 'alive' | 'still' | 'paint';
  let mode: Mode = 'alive';
  let hint: HTMLElement | null = null;
  let renderToken = 0;

  /** Put the demo into the state for the current mode + "Show invisible ink". */
  const render = async () => {
    const token = ++renderToken;
    const hasInk = !!(displayEl && inkMask);
    if (inkBtn) {
      inkBtn.hidden = mode === 'paint' || !hasInk;
      inkBtn.classList.toggle('on', inkShown);
      inkBtn.setAttribute('aria-pressed', String(inkShown));
      inkBtn.innerHTML = `<i></i>${inkShown ? 'Hide invisible ink' : 'Show invisible ink'}`;
    }
    if (inkLayer) {
      inkLayer.hidden = !(mode === 'still' && inkShown && displayEl instanceof HTMLVideoElement);
      inkLayer.classList.toggle('on', !inkLayer.hidden);
    }

    if (mode === 'paint') {
      setDisplay(false);
      engine.setShowMask(false);
      await show(paintArt);
      if (token !== renderToken) return;
      [...engine.inks].forEach((i) => engine.removeInk(i.id));
      engine.setTool('brush');
      useInk('boil');
      $$('[data-ink]').forEach((t) => t.classList.toggle('on', t.dataset.ink === 'boil'));
      showHint('Drag across the drawing to paint');
      return;
    }
    hint?.remove();

    if (displayEl && mode === 'alive' && inkShown && inkMask) {
      // The real engine with the artist's exact ink, overlay on: the pink moves with the art.
      setDisplay(false);
      await show(paintArt);
      if (token !== renderToken) return;
      [...engine.inks].forEach((i) => engine.removeInk(i.id));
      const ink = engine.addInk('boil');
      if (ink) engine.setInkMask(ink.id, inkMask);
      engine.setShowMask(true);
      return;
    }

    engine.setShowMask(false);
    if (displayEl && (mode === 'alive' || displayEl instanceof HTMLVideoElement)) {
      // The ready-made animation: playing for Alive, frozen on its first frame for Still.
      setDisplay(true, mode === 'alive');
      return;
    }

    // No ready-made animation: the engine boils the Alive picture itself.
    setDisplay(false);
    if (shown !== aliveArt) {
      await show(aliveArt);
      if (token !== renderToken) return;
      animateAll();
    } else if (!engine.inks.some((i) => i.painted)) {
      animateAll();
    }
    engine.inks.forEach((i) => engine.updateInk(i.id, { visible: mode === 'alive' }));
  };

  if (display) {
    // The engine waits underneath with the paint picture, ready for "Paint it yourself".
    await show(paintArt);
  } else {
    await show(aliveArt);
    animateAll();
  }
  await render();
  loading?.remove();

  const setMode = (m: Mode) => {
    mode = m;
    $$('[data-demo]').forEach((b) => b.classList.toggle('on', b.dataset.demo === m));
    stage.classList.toggle('painting', m === 'paint');
    const inkTabs = $('[data-demo-inks]');
    if (inkTabs) inkTabs.hidden = m !== 'paint';
    if (stateLabel) stateLabel.textContent = m === 'still' ? 'Still' : m === 'paint' ? 'Painting' : 'Alive';
    if (title) title.textContent = m === 'paint' ? 'Pick an ink, brush over the lines' : 'Live demo';
  };

  const showHint = (text: string) => {
    hint?.remove();
    hint = document.createElement('div');
    hint.className = 'demo-hint';
    hint.textContent = text;
    stage.appendChild(hint);
  };

  $$('[data-demo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setMode(btn.dataset.demo as Mode);
      void render();
    }),
  );

  // The three ink tabs shown while painting (basic settings, nothing to tweak).
  $$('[data-ink]').forEach((tab) =>
    tab.addEventListener('click', () => {
      useInk(tab.dataset.ink as 'boil' | 'jitter' | 'wobble');
      $$('[data-ink]').forEach((t) => t.classList.toggle('on', t === tab));
    }),
  );

  // Painting (paint mode only, so the page still scrolls on phones).
  const toImage = (ev: PointerEvent) => {
    const r = engine.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * engine.width, y: ((ev.clientY - r.top) / r.height) * engine.height };
  };
  let painting = false;
  engine.canvas.addEventListener('pointerdown', (ev) => {
    if (mode !== 'paint') {
      toast('Tap “Paint it yourself” to try the brush');
      return;
    }
    engine.canvas.setPointerCapture(ev.pointerId);
    const p = toImage(ev);
    painting = engine.beginStroke(p.x, p.y, ev.pressure || 0.5, ev.pointerType === 'pen') === 'ok';
    hint?.remove();
  });
  engine.canvas.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    const list = ev.getCoalescedEvents?.() ?? [ev];
    for (const e of list.length ? list : [ev]) {
      const p = toImage(e);
      engine.strokeTo(p.x, p.y, e.pressure || 0.5, e.pointerType === 'pen');
    }
    engine.flushStroke();
  });
  const end = () => {
    if (!painting) return;
    painting = false;
    engine.endStroke();
  };
  engine.canvas.addEventListener('pointerup', end);
  engine.canvas.addEventListener('pointercancel', end);

  // Only animate while the demo is on screen (battery!).
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    syncSuspend();
    if (displayEl instanceof HTMLVideoElement && displayOn && mode === 'alive') {
      if (onScreen) void displayEl.play().catch(() => {});
      else displayEl.pause();
    }
  }).observe(stage);
}

/** Load an image (the load event fires even in background tabs, unlike img.decode()). */
function imageLoaded(img: HTMLImageElement, src: string) {
  return new Promise<void>((res) => {
    img.onload = () => res();
    img.onerror = () => res();
    img.src = src;
  });
}

/** The app draws the ink overlay at 38% opacity, so overlay alpha / 0.38 = how much ink was painted. */
function inkMaskFrom(img: HTMLImageElement): HTMLCanvasElement | null {
  if (!img.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.min(255, Math.round(d[i + 3] / 0.38));
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = a;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

/** URL of an image in landing-media (`name`.webp|png), if it's there. */
async function findImage(name: string): Promise<string | null> {
  for (const ext of ['webp', 'png']) {
    try {
      const url = `${MEDIA}/${name}.${ext}`;
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) return url;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** A demo picture from public/landing-media (`name`.png|jpg|jpeg|webp), if it's there. */
async function loadDemoArt(name: string): Promise<HTMLCanvasElement | null> {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    try {
      const res = await fetch(`${MEDIA}/${name}.${ext}`);
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) continue;
      const img = await createImageBitmap(await res.blob());
      // Keep the demo light: at most 1400px on the long side.
      const s = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

void startDemo();
