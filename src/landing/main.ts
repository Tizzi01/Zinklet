import './landing.css';
import { LINKS, WAITLIST } from './config';

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

// ------------------------------------------------------------------ theme (shared with the app)

const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>';

function syncThemeButton() {
  const btn = $('#theme');
  if (!btn) return;
  const dark = document.documentElement.dataset.theme !== 'light';
  btn.innerHTML = dark ? MOON : SUN;
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
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
      toast(key === 'discord' ? 'The Discord opens very soon — join the waitlist to get the invite.' : 'The survey opens very soon — join the waitlist to get it.');
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
        note.textContent = 'The waitlist opens in a few days — check back soon!';
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
        note.textContent = 'Couldn’t reach the waitlist — check your connection and try again.';
        note.classList.add('warn');
      }
    }
  });
}

// ------------------------------------------------------------------ clips (drop files into /public/clips)

async function findClip(name: string): Promise<{ url: string; kind: 'video' | 'image' } | null> {
  for (const ext of ['mp4', 'webm', 'gif']) {
    const url = `/clips/${name}.${ext}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && (type.startsWith('video/') || type.startsWith('image/'))) {
        return { url, kind: ext === 'gif' ? 'image' : 'video' };
      }
    } catch {
      /* keep looking */
    }
  }
  return null;
}

for (const box of $$('[data-clip]')) {
  void findClip(box.dataset.clip!).then((clip) => {
    if (!clip) return;
    const el =
      clip.kind === 'video'
        ? Object.assign(document.createElement('video'), { src: clip.url, autoplay: true, muted: true, loop: true, playsInline: true })
        : Object.assign(document.createElement('img'), { src: clip.url, alt: '', loading: 'lazy' });
    box.replaceChildren(el);
  });
}

// ------------------------------------------------------------------ live demo (the real engine)

async function startDemo() {
  const stage = $('[data-demo-stage]');
  if (!stage) return;
  const loading = $('[data-demo-loading]');
  const stateLabel = $('[data-demo-state]');
  const title = $('.demo-title');
  const [{ Engine }, { makeSampleArt }] = await Promise.all([import('../engine/Engine'), import('../engine/sample')]);
  const art = makeSampleArt();

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
  await engine.setImage(art.canvas);
  engine.setBrush({ size: 90, hard: false, opacity: 100 });
  engine.setInkBrush({ effect: 'boil', params: { strength: 55 } });
  engine.fillWithBrush();
  engine.clearMaskFlash();
  loading?.remove();

  type Mode = 'alive' | 'still' | 'paint';
  let mode: Mode = 'alive';
  let hint: HTMLElement | null = null;

  const setMode = (m: Mode) => {
    mode = m;
    $$('[data-demo]').forEach((b) => b.classList.toggle('on', b.dataset.demo === m || (m === 'paint' && b.dataset.demo === 'paint')));
    stage.classList.toggle('painting', m === 'paint');
    if (stateLabel) stateLabel.textContent = m === 'still' ? 'Still' : m === 'paint' ? 'Painting' : 'Alive';
    if (title) title.textContent = m === 'paint' ? 'Brush over the lines ✦' : 'Live demo';
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
      const m = btn.dataset.demo as Mode;
      if (m === 'still') {
        engine.inks.forEach((i) => engine.updateInk(i.id, { visible: false }));
        hint?.remove();
      } else if (m === 'alive') {
        if (!engine.inks.some((i) => i.painted)) {
          engine.fillWithBrush();
          engine.clearMaskFlash();
        }
        engine.inks.forEach((i) => engine.updateInk(i.id, { visible: true }));
        hint?.remove();
      } else {
        [...engine.inks].forEach((i) => engine.removeInk(i.id));
        engine.setTool('brush');
        showHint('Drag across the drawing to paint boil ink');
      }
      setMode(m);
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
    engine.suspended = !e.isIntersecting;
    if (e.isIntersecting) engine.invalidate();
  }).observe(stage);
}

void startDemo();
