// Procedural "hand-drawn" sample art so new users see Zinklet working in one tap.

export interface SampleArt {
  canvas: HTMLCanvasElement;
  stars: { x: number; y: number; r: number }[];
  bubble: { x: number; y: number; r: number }[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Pt = [number, number];

/** Closed smooth path through points (quadratic midpoints). */
function smoothClosed(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

function blobPts(cx: number, cy: number, rx: number, ry: number, rand: () => number, wob = 0.05, n = 18): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rand() - 0.5) * 2 * wob;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

function starPts(cx: number, cy: number, r: number, rot: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function polygon(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function makeSampleArt(): SampleArt {
  const W = 1600;
  const H = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(7);
  const INK = '#221d2b';

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Paper
  ctx.fillStyle = '#fbf4e6';
  ctx.fillRect(0, 0, W, H);

  // Ground shadow
  ctx.fillStyle = 'rgba(80, 60, 40, 0.12)';
  ctx.beginPath();
  ctx.ellipse(800, 1010, 330, 50, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  for (const fx of [680, 920]) {
    smoothClosed(ctx, blobPts(fx, 990, 85, 45, rand, 0.06, 12));
    ctx.fillStyle = '#ff9f43';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  // Arms
  ctx.strokeStyle = INK;
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(530, 660);
  ctx.quadraticCurveTo(420, 600, 400, 480);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1070, 660);
  ctx.quadraticCurveTo(1190, 690, 1230, 800);
  ctx.stroke();
  for (const [hx, hy] of [
    [398, 462],
    [1236, 818],
  ]) {
    smoothClosed(ctx, blobPts(hx, hy, 34, 34, rand, 0.08, 10));
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 11;
    ctx.stroke();
  }

  // Body
  smoothClosed(ctx, blobPts(800, 650, 300, 330, rand, 0.045, 22));
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 15;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Belly patch
  smoothClosed(ctx, blobPts(800, 780, 150, 120, rand, 0.06, 14));
  ctx.fillStyle = '#fff1b8';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.stroke();

  // Cheeks
  ctx.fillStyle = '#ff8fab';
  for (const cx of [635, 965]) {
    ctx.beginPath();
    ctx.ellipse(cx, 640, 48, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes
  for (const ex of [690, 910]) {
    smoothClosed(ctx, blobPts(ex, 540, 62, 74, rand, 0.05, 14));
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 11;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(ex + 12, 555, 30, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex + 22, 538, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Smile
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(740, 660);
  ctx.quadraticCurveTo(800, 725, 862, 660);
  ctx.stroke();

  // Antenna
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(800, 322);
  ctx.quadraticCurveTo(760, 250, 820, 190);
  ctx.stroke();
  smoothClosed(ctx, blobPts(826, 176, 32, 32, rand, 0.1, 10));
  ctx.fillStyle = '#ff5d8f';
  ctx.fill();
  ctx.lineWidth = 11;
  ctx.stroke();

  // Stars
  const stars: SampleArt['stars'] = [];
  const starSpots: [number, number, number, string][] = [
    [240, 230, 70, '#6ec6ff'],
    [360, 820, 52, '#b18cff'],
    [1330, 250, 58, '#7cff6b'],
    [1400, 560, 44, '#6ec6ff'],
    [180, 560, 40, '#ff9f43'],
  ];
  for (const [sx, sy, sr, col] of starSpots) {
    polygon(ctx, starPts(sx, sy, sr, (rand() - 0.5) * 0.5));
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    ctx.stroke();
    stars.push({ x: sx, y: sy, r: sr * 1.9 });
  }

  // Speech bubble
  const bx = 1170;
  const by = 420;
  smoothClosed(ctx, blobPts(bx, by, 150, 95, rand, 0.05, 16));
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1075, 480);
  ctx.lineTo(1020, 560);
  ctx.lineTo(1120, 500);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
  // Cover the seam where the tail meets the bubble
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(1098, 488, 30, 16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = 'bold 96px "Comic Sans MS", "Chalkboard SE", "Marker Felt", "Segoe Print", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('hi!', bx + 4, by + 6);
  const bubble: SampleArt['bubble'] = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    bubble.push({ x: bx + Math.cos(a) * 110, y: by + Math.sin(a) * 60, r: 90 });
  }
  bubble.push({ x: bx, y: by, r: 120 }, { x: 1050, y: 530, r: 70 });

  // Motion sparkles
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  for (const [x1, y1, x2, y2] of [
    [470, 330, 520, 380],
    [440, 400, 510, 410],
    [1110, 190, 1080, 250],
    [1170, 210, 1120, 270],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  return { canvas, stars, bubble };
}
