# Zinklet

Zinklet brings finished art to life. Artists import a drawing made in Procreate, Krita, Clip Studio, etc.,
then paint **invisible ink** over parts of it. Each ink is an animated effect (line boil, jitter, wobble,
shake, crumpled paper) that only moves what it covers. Export as a looping MP4 or GIF for TikTok,
Instagram, Discord, stream overlays and stickers.

We are **not** a drawing app. We are the step after drawing. Never add features that compete with
Procreate/Krita on painting; every feature must serve "import → ink → export → share".

## Product & UX principles (follow these on every change)

1. **Canvas first.** The art fills the screen. UI lives at the edges, is compact, and can be hidden (Tab).
2. **Feels like Procreate/Krita.** Artists should know how to use it without a tutorial:
   - Procreate layout: tools top-right, brush size + opacity vertical sliders on the left edge, inks panel
     on the right like the Layers panel.
   - Krita/Photoshop shortcuts: `V` move/resize art, `B` brush, `E` eraser, `[`/`]` size, `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`,
     `Space`+drag pan, `Ctrl+0` fit, `Ctrl+1` 100%, `Tab` hide UI.
   - Procreate gestures: pinch zoom/rotate-free pan, two-finger tap undo, three-finger tap redo.
3. **Pen and touch are first-class.** Pen pressure changes brush size. Once a pen is seen, touch only
   navigates (palm rejection). Mouse works everywhere too.
4. **Every action within two taps.** No deep menus. No modal unless it's export.
5. **Instant feedback.** The animation is always live while you paint. Sliders update the preview in real time.
6. **The first minute must delight.** Empty state offers "Try sample art" which is already animated.
7. **Never lose work silently.** Destructive actions are undoable.
8. **Honest, friendly copy.** Short labels, plain words, no jargon ("Strength", not "Displacement amplitude").
9. **Fast on mid-range phones/iPads.** One WebGL pass per frame, render only when something changed.

## Stack

- Vite + React 18 + TypeScript (strict). No UI framework; plain CSS with variables in `src/styles.css`.
- WebGL2 for all effects (single fragment shader, masks in a `TEXTURE_2D_ARRAY`).
- Export: `gifenc` (GIF), `mediabunny` (MP4 via WebCodecs).
- Icons: `lucide-react`.
- Ships first as a web app / PWA. Later wrapped with Tauri (Win/Mac) and Capacitor (iOS/Android).

## Site layout

- `/` — landing page (`index.html`, `src/landing/`): live engine demo, waitlist, Discord/survey links.
  Links and the waitlist Google Form are configured in `src/landing/config.ts` (empty = "soon").
  Media is auto-picked up from `public/landing-media/`: `demo.png` (hero demo art) and `clip1|clip2|clip3.(mp4|webm|gif)`.
- `/app/` — the Zinklet app (`app/index.html`, `src/main.tsx`).
- Brand: "Mint pop" — mint `#2ee6b8` on deep teal-navy `#0c161b`, pink ink overlay `#ff5d8f`, Lexend
  ExtraBold "Z" mark (`src/ui/Logo.tsx`, `public/icon.svg`), logo PNGs in `brand/`. Never pair orange with black.
- SVG boil filters (`feTurbulence`) are expensive: use them only on small/hero elements.
- New/updated clips: drop them in `public/landing-media/`, then (dev server running) open
  http://localhost:5173/tools/compress-clips.html — it re-encodes clip1-3 to 720p H.264 in place and backs
  up originals to `media-originals/` (git-ignored). Keep landing clips around 1-2 MB each.

## Commands

- `npm run dev` — dev server: landing http://localhost:5173, app http://localhost:5173/app/
- `npm run build` — typecheck + production build
- `npm run typecheck` — `tsc --noEmit`

## Architecture

- `src/engine/` — framework-free core. `Engine` owns the image, inks, masks, WebGL renderer, undo history.
  React never touches WebGL directly; it calls Engine methods and subscribes to its change events.
  - `effects.ts` — ink catalog (names, defaults, slider ranges). Add new inks here + a branch in the shader.
  - `shaders.ts` — the single render shader. Effect ids must match `effects.ts`.
  - `lines.ts` — splits art into a "lines" layer and an inpainted "fill" layer (pull-push) so
    "Lines only" inks move linework without smearing colors.
  - `history.ts` — undo/redo command stack.
  - `export.ts` — GIF/MP4 export.
- `src/ui/` — React components. `store.ts` bridges Engine events into React.

## Ink model (important)

- The **brush** (`engine.inkBrush`: effect + strength/speed/size/lines-only) only affects what you paint next.
- Painted strokes go into an **ink group** (`Ink`) whose effect + settings match the brush exactly; if none
  matches, a new group is created. Changing the brush never changes ink already on the art.
- The Inks panel's **"On your art"** list shows the groups. Selecting one highlights it and edits only it.
- **One ink per spot:** painting replaces any other visible ink under the stroke (inks never stack their
  motion); "Animate everything" replaces all visible inks. The eraser removes ink from every visible group.
- **Move tool (V):** the store keeps the imported picture un-cropped plus `engine.artPlacement`; moving/resizing
  re-composes the canvas via `engine.moveArt()`, which carries every ink mask along (and re-runs line detection).
- **The brush decides what moves:** by default (`linesOnly: false`) everything under the ink moves; no line
  detection. "Only dark lines" (`linesOnly`) is an opt-in for dark lineart where fills should stay still, because
  darkness-based detection fails on colored/light linework.
- Motion amounts are scaled to the **art's** size on the canvas (`artSide`), not the canvas size. Up to 16 groups per artwork (`MAX_INKS` = `MAX_SLOTS`).
- The ink overlay uses one color for all groups (`engine.overlayColor`, default orange, set in Artwork panel).

## Animation timing rules

- Everything loops over the project loop length `loopSeconds` so preview == export and loops are seamless.
- Stepped inks (boil, jitter, shake, crumple) change at `fps`; step boundaries align with the loop.
- Continuous inks (wobble) complete an integer number of cycles per loop.

## Current focus

- **Everything is free.** No Pro badges, locks, paywalls or pricing copy anywhere in the app until the owner says so.
- **All inks are open to everyone** (Boil, Jitter, Wobble, Shake, Crumple) — no codes, no hidden/dev labels.
  Boil is the one being perfected first. Power options live under Artwork → Advanced
  (uncapped sliders, performance stats, re-roll randomness).
- Keep effects modular so future inks (and, later, paid ones) slot in via `effects.ts` + a shader branch.

## Dev tips

- In dev builds the engine is on `window.zinklet` (e.g. `zinklet.inks`, `zinklet.renderFrame(t, {maskAlpha: 0, showLines: false})`).
- Don't `import('/src/ui/store.ts')` from the console to test: it can create a second store + engine.
  Drive the real app via DOM events instead (e.g. dispatch a `drop` DragEvent with a File).
- Engine/shader edits trigger a full page reload in dev (no HMR for the engine singleton).

## Status (prototype v0.1)

Working: home screen (canvas presets Match/Square/Portrait/Story/Wide/Custom, fit/fill, background,
continue-editing card; browser Back/Forward move between home and editor), light/dark theme,
import (file picker, drag & drop, paste; PNG/JPG/WebP; capped at 2048px), sample art,
the Boil ink (multiple Boil inks per artwork) with Strength/Speed/Size/Lines-only, brush + eraser with
pen pressure, soft/hard tip, opacity, undo/redo, Animate all / Invert / Clear, ink overlay that fades
after painting (H pins it), line-detection slider with preview, loop length, MP4 + GIF export
(transparent GIF), Procreate gestures, Krita shortcuts, phone bottom-sheet layout.

## Next up

1. Autosave projects to IndexedDB (and a simple project gallery).
2. Move `decompose()` into a Web Worker (it takes ~0.8s on a 2048px image and blocks the UI).
3. Edge-aware inpainting so fills don't blend colors from both sides of a line at high strength.
4. PSD import (layers → pick the line layer = perfect line detection).
5. PWA service worker (offline), then Tauri/Capacitor wrappers.
6. More inks, one at a time, once Boil feels perfect.

## Releases

- **App** versions go v0.0 → v0.1 → v0.2 … Bump the **minor** in `package.json` (`0.1.0`, `0.2.0`, …) with each
  app release pushed to GitHub, tag it (`git tag v0.1`), and push tags. The version shows in the app.
- **Landing page** has its own versions: `SITE_VERSION` in `src/landing/version.ts` ("0.1", "0.2", …), tagged
  `site-v0.1`, … Bump it when the landing page changes. It shows in the landing footer.
- `main` on https://github.com/Tizzi01/Zinklet auto-deploys to Vercel.
