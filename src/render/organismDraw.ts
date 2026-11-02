import { rgba, TAU } from '../engine/math';
import type { Look } from './look';
import { drawGlow } from './sprites';

export interface DrawOpts {
  seed: number;
  t: number;
  /** 0..1 normalised swim speed — drives squash/stretch & flagellar beat */
  speed: number;
  alpha?: number;
  /** 0..1 red damage flash */
  hurt?: number;
  /** 0..1 white flash */
  flash?: number;
  /** 0..1 pseudopod extension */
  engulf?: number;
  /** 0..1 hardened membrane glow */
  harden?: number;
  /** pulse scale bump (eating / growing) */
  pulse?: number;
  /** level of detail 0..1 */
  detail?: number;
  /** world-space light angle compensation */
  angle: number;
  /** extra halo ring colour (danger / edible indicators) */
  windup?: number;
  /** halo size multiplier (menus use smaller halos to stay inside the canvas) */
  glowScale?: number;
}

const N_MAX = 48;
const PX = new Float32Array(N_MAX + 1);
const PY = new Float32Array(N_MAX + 1);
const NX = new Float32Array(N_MAX + 1);
const NY = new Float32Array(N_MAX + 1);

const GOLDEN = 2.39996;

function wrapA(a: number) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

/** Compute the membrane outline in local space (heading = +x). */
function outline(l: Look, r: number, o: DrawOpts, n: number) {
  const t = o.t, seed = o.seed;
  const stretch = 1 + l.elong + o.speed * 0.1;
  const ey = 1 / (1 + l.elong * 0.45) * (1 - o.speed * 0.05);
  const lobeAmp = l.lobeAmp * (1 + (o.engulf || 0) * 1.8);
  const pulse = 1 + (o.pulse || 0) * 0.08;
  let rodX = 1, rodY = 1;
  if (l.body === 'rod') { rodX = 1.7; rodY = 0.55; }
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const c = Math.cos(th), s = Math.sin(th);
    let x = c * stretch * rodX, y = s * ey * rodY;
    if (l.body === 'rod') {
      // superellipse capsule
      const sc = Math.sign(c) * Math.pow(Math.abs(c), 0.45), ss = Math.sign(s) * Math.pow(Math.abs(s), 0.8);
      x = sc * stretch * rodX; y = ss * ey * rodY;
    }
    if (c < 0 && l.taper > 0) y *= 1 - l.taper * -c * 0.7;
    let rr = 1 + l.wobble * (Math.sin(3 * th + t * 1.7 + seed) * 0.6 + Math.sin(5 * th - t * 2.3 + seed * 2) * 0.4);
    if (l.lobes > 0) {
      const v = Math.max(0, Math.sin(l.lobes * th + Math.sin(t * 0.55 + seed) * 1.6 + seed));
      rr += lobeAmp * v * v * v * (0.65 + 0.35 * Math.sin(t * 1.3 + i * 0.7 + seed));
    }
    if (l.slipper > 0) {
      const d = wrapA(th - 0.95);
      rr -= l.slipper * Math.exp(-(d * d) / 0.1);
    }
    rr *= pulse;
    PX[i] = x * rr * r;
    PY[i] = y * rr * r;
  }
  // outward normals
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const tx = PX[b] - PX[a], ty = PY[b] - PY[a];
    const tl = Math.hypot(tx, ty) || 1;
    NX[i] = ty / tl; NY[i] = -tx / tl;
  }
}

function tracePath(ctx: CanvasRenderingContext2D, n: number, scale = 1) {
  ctx.beginPath();
  const mx0 = (PX[n - 1] + PX[0]) / 2 * scale, my0 = (PY[n - 1] + PY[0]) / 2 * scale;
  ctx.moveTo(mx0, my0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(PX[i] * scale, PY[i] * scale, (PX[i] + PX[j]) / 2 * scale, (PY[i] + PY[j]) / 2 * scale);
  }
  ctx.closePath();
}

function bodyFill(ctx: CanvasRenderingContext2D, l: Look, r: number, angle: number, alpha: number) {
  // light comes from the upper-left in world space; rotate into local frame
  const wx = -0.38 * r, wy = -0.42 * r;
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const hx = wx * ca - wy * sa, hy = wx * sa + wy * ca;
  const g = ctx.createRadialGradient(hx, hy, r * 0.05, 0, 0, r * 1.35);
  g.addColorStop(0, rgba(l.membrane, 0.5 * alpha));
  g.addColorStop(0.35, rgba(l.inner, 0.42 * alpha));
  g.addColorStop(0.78, rgba(l.inner, 0.62 * alpha));
  g.addColorStop(1, rgba(l.membrane, 0.85 * alpha));
  return { g, hx, hy };
}

export function drawOrganism(ctx: CanvasRenderingContext2D, l: Look, x: number, y: number, r: number, o: DrawOpts) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.01 || r < 0.4) return;
  const detail = o.detail ?? 1;
  const t = o.t;

  // bloom halo (world space)
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, l.glow, x, y, r * 3.1 * (o.glowScale ?? 1), 0.3 * (l.glowStrength ?? 1) * alpha + (o.windup || 0) * 0.5 + (o.harden || 0) * 0.4);
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.angle);

  switch (l.body) {
    case 'spiral': drawSpiral(ctx, l, r, o, alpha); break;
    case 'diatom': drawDiatom(ctx, l, r, o, alpha); break;
    case 'colony': drawColony(ctx, l, r, o, alpha); break;
    case 'jelly': drawJelly(ctx, l, r, o, alpha); break;
    case 'polyp': drawPolyp(ctx, l, r, o, alpha); break;
    case 'worm': drawWorm(ctx, l, r, o, alpha); break;
    default: drawCell(ctx, l, r, o, alpha, detail);
  }

  // damage / flash overlays
  if ((o.hurt || 0) > 0.01 || (o.flash || 0) > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    if (o.hurt) drawGlow(ctx, '#ff3b3b', 0, 0, r * 1.8, o.hurt * 0.8);
    if (o.flash) drawGlow(ctx, '#ffffff', 0, 0, r * 2.2, o.flash * 0.9);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  void t;
}

function drawCell(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number, detail: number) {
  const t = o.t;
  const n = detail > 0.6 ? 40 : 24;
  outline(l, r, o, n);
  const stretch = 1 + l.elong + o.speed * 0.1;
  const rearX = -r * stretch * (l.body === 'rod' ? 1.7 : 1);

  // flagella (behind body)
  if (l.flagella) {
    const len = r * (l.flagLen || 2);
    const beat = t * (10 + o.speed * 14);
    ctx.strokeStyle = rgba(l.membrane, 0.75 * alpha);
    ctx.lineCap = 'round';
    for (let f = 0; f < l.flagella; f++) {
      const off = l.flagella > 1 ? (f === 0 ? -1 : 1) * r * 0.28 : 0;
      const phase = f * 1.7;
      for (let seg = 0; seg < 3; seg++) {
        ctx.lineWidth = Math.max(0.6, r * (0.13 - seg * 0.035));
        ctx.beginPath();
        const u0 = seg / 3, u1 = (seg + 1) / 3;
        for (let k = 0; k <= 8; k++) {
          const u = u0 + (u1 - u0) * (k / 8);
          const px = rearX * 0.92 - u * len;
          const py = off + Math.sin(u * 7 - beat + phase) * u * r * 0.42 + off * u * 0.8;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }

  // tentacles trailing (NPC jelly-like cells)
  // spikes
  if (l.spikes) {
    const step = Math.max(1, Math.round(n / l.spikes));
    ctx.strokeStyle = rgba(l.membrane, 0.85 * alpha);
    ctx.lineWidth = Math.max(0.7, r * 0.05);
    ctx.beginPath();
    for (let i = 0; i < n; i += step) {
      const len = r * (l.spikeLen || 0.5) * (0.85 + 0.15 * Math.sin(i * 3.1 + o.seed));
      ctx.moveTo(PX[i], PY[i]);
      ctx.lineTo(PX[i] + NX[i] * len, PY[i] + NY[i] * len);
    }
    ctx.stroke();
    // glassy tips
    ctx.fillStyle = rgba('#ffffff', 0.7 * alpha);
    for (let i = 0; i < n; i += step) {
      const len = r * (l.spikeLen || 0.5) * (0.85 + 0.15 * Math.sin(i * 3.1 + o.seed));
      ctx.beginPath();
      ctx.arc(PX[i] + NX[i] * len, PY[i] + NY[i] * len, Math.max(0.6, r * 0.04), 0, TAU);
      ctx.fill();
    }
  }

  // cilia fringe (metachronal wave)
  if (l.cilia && detail > 0.3) {
    ctx.strokeStyle = rgba(l.membrane, 0.55 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.025);
    ctx.beginPath();
    const beat = t * (9 + o.speed * 10);
    for (let i = 0; i < n; i++) {
      const len = r * 0.2 * l.cilia * (0.7 + 0.5 * Math.sin(i * 0.9 - beat));
      const sway = Math.sin(i * 0.9 - beat + 1.2) * 0.5;
      ctx.moveTo(PX[i], PY[i]);
      ctx.lineTo(PX[i] + (NX[i] - NY[i] * sway) * len, PY[i] + (NY[i] + NX[i] * sway) * len);
      if (detail > 0.6) {
        const j = (i + 1) % n;
        const mx = (PX[i] + PX[j]) / 2, my = (PY[i] + PY[j]) / 2;
        const mnx = (NX[i] + NX[j]) / 2, mny = (NY[i] + NY[j]) / 2;
        const len2 = r * 0.2 * l.cilia * (0.7 + 0.5 * Math.sin(i * 0.9 + 0.45 - beat));
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + (mnx - mny * sway) * len2, my + (mny + mnx * sway) * len2);
      }
    }
    ctx.stroke();
  }

  // body
  const { g, hx, hy } = bodyFill(ctx, l, r, o.angle, alpha);
  tracePath(ctx, n);
  ctx.fillStyle = g;
  ctx.fill();
  // membrane rim
  ctx.lineWidth = Math.max(0.8, r * (0.07 + (l.plates || 0) * 0.04));
  ctx.strokeStyle = rgba(l.membrane, 0.9 * alpha);
  ctx.stroke();
  if (o.harden && o.harden > 0) {
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.strokeStyle = rgba('#fff2c0', 0.7 * o.harden * alpha);
    ctx.stroke();
  }

  // protective membrane layers
  if (l.plates) {
    tracePath(ctx, n, 1.1);
    ctx.lineWidth = Math.max(0.8, r * 0.05);
    ctx.strokeStyle = rgba(l.membrane, 0.4 * alpha);
    ctx.stroke();
    if (l.plates >= 2) {
      // armour plates: segmented arcs
      ctx.lineWidth = Math.max(1.2, r * 0.11);
      ctx.strokeStyle = rgba(l.membrane, 0.55 * alpha);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let i = 0; i < n; i += 4) {
        const a = i, b = Math.min(i + 3, n);
        ctx.moveTo(PX[a] * 1.05, PY[a] * 1.05);
        for (let k = a + 1; k < b; k++) ctx.lineTo(PX[k % n] * 1.05, PY[k % n] * 1.05);
      }
      ctx.stroke();
      ctx.lineCap = 'round';
    }
  }

  // inner membrane highlight
  tracePath(ctx, n, 0.86);
  ctx.lineWidth = Math.max(0.5, r * 0.025);
  ctx.strokeStyle = rgba('#ffffff', 0.12 * alpha);
  ctx.stroke();

  // ── organelles ──
  if (detail > 0.2) drawOrganelles(ctx, l, r, o, alpha, stretch);

  // specular highlight
  ctx.fillStyle = rgba('#ffffff', 0.16 * alpha);
  ctx.beginPath();
  ctx.ellipse(hx * 0.9, hy * 0.9, r * 0.32, r * 0.17, Math.atan2(hy, hx) + Math.PI / 2, 0, TAU);
  ctx.fill();
}

function drawOrganelles(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number, stretch: number) {
  const t = o.t;
  const ex = stretch * 0.85;
  // multicellular tissue
  if (l.cells) {
    const n = l.cells;
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt((i + 0.5) / n) * 0.72;
      const a = i * GOLDEN + Math.sin(t * 0.3 + i) * 0.05;
      const cx = Math.cos(a) * d * r * ex, cy = Math.sin(a) * d * r * 0.85;
      const cr = r * (0.42 / Math.sqrt(n)) * (1 + 0.08 * Math.sin(t * 2 + i));
      ctx.fillStyle = rgba(l.membrane, 0.14 * alpha);
      ctx.strokeStyle = rgba(l.membrane, 0.4 * alpha);
      ctx.lineWidth = Math.max(0.5, r * 0.018);
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba('#fff6e0', 0.35 * alpha);
      ctx.beginPath(); ctx.arc(cx + cr * 0.15, cy - cr * 0.1, cr * 0.28, 0, TAU); ctx.fill();
    }
  }
  if (l.pores) {
    for (let i = 0; i < l.pores; i++) {
      const a = (i / l.pores) * TAU + o.seed;
      const px = Math.cos(a) * r * 0.66 * ex, py = Math.sin(a) * r * 0.66;
      const pr = r * 0.08 * (1 + 0.25 * Math.sin(t * 1.5 + i));
      ctx.fillStyle = rgba('#000814', 0.45 * alpha);
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(l.membrane, 0.5 * alpha);
      ctx.lineWidth = Math.max(0.5, r * 0.02);
      ctx.stroke();
    }
  }
  if (l.nucleoid) {
    ctx.strokeStyle = rgba(l.membrane, 0.45 * alpha);
    ctx.lineWidth = Math.max(0.6, r * 0.05);
    ctx.beginPath();
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      const a = u * TAU * 1.5 + t * 0.4 + o.seed;
      const rr = r * (0.18 + 0.1 * Math.sin(u * 9 + t));
      const px = Math.cos(a) * rr - r * 0.05, py = Math.sin(a) * rr * 0.8;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (l.nucleus) {
    const nx = -r * 0.12, ny = r * 0.05;
    const nr = r * 0.3;
    const g = ctx.createRadialGradient(nx - nr * 0.3, ny - nr * 0.3, nr * 0.1, nx, ny, nr);
    g.addColorStop(0, rgba(l.nucleus, 0.75 * alpha));
    g.addColorStop(0.7, rgba(l.nucleus, 0.35 * alpha));
    g.addColorStop(1, rgba(l.nucleus, 0.05 * alpha));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(l.inner, 0.6 * alpha);
    ctx.beginPath(); ctx.arc(nx + nr * 0.15, ny + nr * 0.1, nr * 0.32, 0, TAU); ctx.fill();
  }
  if (l.chloro) {
    for (let i = 0; i < l.chloro; i++) {
      const a = i * GOLDEN + t * 0.18;
      const d = 0.3 + ((i * 0.37) % 0.35);
      const px = Math.cos(a) * d * r * ex, py = Math.sin(a) * d * r * 0.8;
      const cr = r * 0.13;
      ctx.fillStyle = rgba('#6dff7a', 0.6 * alpha);
      ctx.beginPath(); ctx.ellipse(px, py, cr, cr * 0.6, a, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#1f7a2a', 0.6 * alpha);
      ctx.lineWidth = Math.max(0.4, r * 0.015);
      ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * cr * 0.6, py - Math.sin(a) * cr * 0.6); ctx.lineTo(px + Math.cos(a) * cr * 0.6, py + Math.sin(a) * cr * 0.6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#7dff6a', 0, 0, r * 1.1, 0.18 * alpha);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (l.mito) {
    for (let i = 0; i < l.mito; i++) {
      const a = i * GOLDEN * 1.3 + 1 - t * 0.12;
      const d = 0.35 + ((i * 0.53) % 0.3);
      const px = Math.cos(a) * d * r * ex, py = Math.sin(a) * d * r * 0.8;
      const cr = r * 0.11;
      ctx.fillStyle = rgba('#ffab5c', 0.65 * alpha);
      ctx.beginPath(); ctx.ellipse(px, py, cr, cr * 0.5, a + 1, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#7a3a0a', 0.5 * alpha);
      ctx.lineWidth = Math.max(0.4, r * 0.012);
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        const ox = Math.cos(a + 1) * k * cr * 0.3, oy = Math.sin(a + 1) * k * cr * 0.3;
        ctx.moveTo(px + ox - Math.sin(a + 1) * cr * 0.3, py + oy + Math.cos(a + 1) * cr * 0.3);
        ctx.lineTo(px + ox + Math.sin(a + 1) * cr * 0.3, py + oy - Math.cos(a + 1) * cr * 0.3);
      }
      ctx.stroke();
    }
  }
  if (l.vesicles) {
    const vc = l.vesicleColor || '#ffffff';
    for (let i = 0; i < l.vesicles; i++) {
      const a = (i / l.vesicles) * TAU + Math.sin(t * 0.4 + i) * 0.2 + o.seed;
      const px = Math.cos(a) * r * 0.66 * ex, py = Math.sin(a) * r * 0.62;
      const pr = r * 0.075 * (1 + 0.3 * Math.sin(t * 3 + i * 1.7));
      ctx.fillStyle = rgba(vc, 0.75 * alpha);
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
    }
  }
  if (l.vacuole) {
    const cycle = (t * 0.7 + o.seed) % 1;
    const s = cycle < 0.8 ? 0.4 + cycle * 0.6 : 0.88 * (1 - (cycle - 0.8) * 4);
    const vx = -r * 0.45, vy = -r * 0.1;
    ctx.fillStyle = rgba('#bfefff', 0.45 * alpha);
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const rr = r * 0.16 * s * (k % 2 ? 0.55 : 1);
      if (k === 0) ctx.moveTo(vx + Math.cos(a) * rr, vy + Math.sin(a) * rr); else ctx.lineTo(vx + Math.cos(a) * rr, vy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  if (l.groove) {
    ctx.strokeStyle = rgba('#001018', 0.4 * alpha);
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    ctx.ellipse(r * 0.3, r * 0.15, r * 0.45, r * 0.25, 0.3, -0.4, 1.6);
    ctx.stroke();
  }
  if (l.receptors) {
    ctx.strokeStyle = rgba(l.membrane, 0.7 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.025);
    const front = r * stretch;
    for (let i = 0; i < l.receptors; i++) {
      const spread = (i - (l.receptors - 1) / 2) * 0.45;
      const sway = Math.sin(t * 2.4 + i * 2) * 0.15;
      const bx = Math.cos(spread) * front * 0.92, by = Math.sin(spread) * r * 0.7;
      const ex2 = bx + Math.cos(spread + sway) * r * 0.75, ey2 = by + Math.sin(spread + sway) * r * 0.75;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + r * 0.4, by + Math.sin(spread) * r * 0.1, ex2, ey2);
      ctx.stroke();
      ctx.fillStyle = rgba('#fff4c0', 0.85 * alpha);
      ctx.beginPath(); ctx.arc(ex2, ey2, Math.max(0.6, r * 0.05), 0, TAU); ctx.fill();
    }
  }
  if (l.eyespot) {
    const ex3 = r * stretch * 0.62, ey3 = -r * 0.16;
    ctx.fillStyle = rgba('#ff5a2a', 0.85 * alpha);
    ctx.beginPath(); ctx.ellipse(ex3, ey3, r * 0.1, r * 0.07, 0.4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#ff7a3a', ex3, ey3, r * 0.35, 0.4 * alpha);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (l.lure) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < l.lure; i++) {
      const a = (i / l.lure) * TAU + t * 0.5;
      const px = Math.cos(a) * r * 0.5 * ex, py = Math.sin(a) * r * 0.5;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.3);
      drawGlow(ctx, l.glow, px, py, r * (0.35 + pulse * 0.25), (0.4 + pulse * 0.5) * alpha);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawSpiral(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  const L = r * 1.7;
  const draw = (w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k <= 22; k++) {
      const u = k / 22 * 2 - 1;
      const px = u * L;
      const py = Math.sin(u * 3 * Math.PI + t * 9) * r * 0.32;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  draw(r * 0.6, rgba(l.membrane, 0.65 * alpha));
  draw(r * 0.36, rgba(l.inner, 0.7 * alpha));
  draw(r * 0.12, rgba('#ffffff', 0.25 * alpha));
}

function drawDiatom(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const n = l.shellSides || 6;
  const rot = o.t * 0.15;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, rgba('#ffffff', 0.55 * alpha));
  g.addColorStop(0.5, rgba(l.inner, 0.45 * alpha));
  g.addColorStop(1, rgba(l.membrane, 0.75 * alpha));
  ctx.fillStyle = g;
  ctx.strokeStyle = rgba(l.membrane, 0.95 * alpha);
  ctx.lineWidth = Math.max(0.8, r * 0.08);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rot;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // radial ribs & pores
  ctx.lineWidth = Math.max(0.4, r * 0.025);
  ctx.strokeStyle = rgba('#ffffff', 0.4 * alpha);
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + rot;
    ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
    ctx.lineTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.stroke();
  if (l.chloro) {
    for (let i = 0; i < l.chloro; i++) {
      const a = i * GOLDEN + o.t * 0.1;
      ctx.fillStyle = rgba('#e0ff7a', 0.6 * alpha);
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, r * 0.12, r * 0.07, a, 0, TAU); ctx.fill();
    }
  }
  if (l.nucleus) {
    ctx.fillStyle = rgba(l.nucleus, 0.55 * alpha);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, '#ffffff', -r * 0.3, -r * 0.3, r * 0.6, 0.35 * alpha);
  ctx.globalCompositeOperation = 'source-over';
}

function drawColony(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, rgba(l.membrane, 0.3 * alpha));
  g.addColorStop(0.8, rgba(l.inner, 0.25 * alpha));
  g.addColorStop(1, rgba(l.membrane, 0.55 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(l.membrane, 0.6 * alpha);
  ctx.lineWidth = Math.max(0.6, r * 0.03);
  ctx.stroke();
  // surface cells rolling
  const n = 26;
  ctx.fillStyle = rgba('#b8ff8a', 0.75 * alpha);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + t * 0.25;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.055, 0, TAU); ctx.fill();
  }
  // daughter colonies
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + t * 0.12 + o.seed;
    const px = Math.cos(a) * r * 0.38, py = Math.sin(a) * r * 0.38;
    ctx.fillStyle = rgba('#5fdf4a', 0.45 * alpha);
    ctx.beginPath(); ctx.arc(px, py, r * 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba('#d6ffb0', 0.5 * alpha);
    ctx.stroke();
  }
}

function drawJelly(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3 + o.seed);
  // the bell faces +x; tentacles trail toward -x
  const bw = r * (1 - pulse * 0.12), bh = r * (0.95 + pulse * 0.1);
  if (l.tentacles) {
    ctx.strokeStyle = rgba(l.membrane, 0.45 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    for (let i = 0; i < l.tentacles; i++) {
      const y0 = ((i + 0.5) / l.tentacles - 0.5) * bh * 1.4;
      ctx.beginPath();
      ctx.moveTo(-bw * 0.2, y0);
      for (let k = 1; k <= 10; k++) {
        const u = k / 10;
        ctx.lineTo(-bw * 0.2 - u * r * 2.2, y0 + Math.sin(u * 6 - t * 4 + i) * r * 0.2 * u);
      }
      ctx.stroke();
    }
  }
  const g = ctx.createRadialGradient(bw * 0.3, -bh * 0.3, r * 0.1, 0, 0, r * 1.2);
  g.addColorStop(0, rgba('#ffffff', 0.35 * alpha));
  g.addColorStop(0.5, rgba(l.inner, 0.3 * alpha));
  g.addColorStop(1, rgba(l.membrane, 0.6 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-bw * 0.25, -bh);
  ctx.bezierCurveTo(bw * 1.1, -bh * 1.05, bw * 1.1, bh * 1.05, -bw * 0.25, bh);
  // scalloped rim
  for (let k = 0; k <= 6; k++) {
    const y = bh - (k / 6) * bh * 2;
    ctx.lineTo(-bw * 0.25 - Math.sin(k * 1.6 + t * 4) * r * 0.06 - r * 0.05, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(l.membrane, 0.75 * alpha);
  ctx.lineWidth = Math.max(0.6, r * 0.04);
  ctx.stroke();
  if (l.combs) {
    const cols = ['#ff5ad6', '#ffd65a', '#5affb4', '#5ab8ff', '#b45aff'];
    for (let row = 0; row < 4; row++) {
      const y = (row / 3 - 0.5) * bh * 1.3;
      for (let k = 0; k < 6; k++) {
        const x = -bw * 0.1 + k * bw * 0.14;
        ctx.fillStyle = rgba(cols[(k + row + Math.floor(t * 6)) % cols.length], 0.8 * alpha);
        ctx.fillRect(x, y - r * 0.03, bw * 0.08, r * 0.06);
      }
    }
  }
  // manubrium
  ctx.fillStyle = rgba(l.glow, 0.4 * alpha);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.25, r * 0.14, 0, 0, TAU); ctx.fill();
}

function drawPolyp(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  // column: anchored base at -x, crown of tentacles at +x
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, rgba(l.inner, 0.7 * alpha));
  g.addColorStop(1, rgba(l.membrane, 0.55 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, -r * 0.18);
  ctx.quadraticCurveTo(0, -r * 0.42 + Math.sin(t) * r * 0.05, r * 0.5, -r * 0.32);
  ctx.lineTo(r * 0.5, r * 0.32);
  ctx.quadraticCurveTo(0, r * 0.42 + Math.sin(t) * r * 0.05, -r * 1.1, r * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(l.membrane, 0.7 * alpha);
  ctx.lineWidth = Math.max(0.6, r * 0.03);
  ctx.stroke();
  const n = l.tentacles || 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const base = ((i + 0.5) / n - 0.5) * 2.4;
    ctx.strokeStyle = rgba(l.membrane, 0.75 * alpha);
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(r * 0.5, Math.sin(base) * r * 0.3);
    let px = r * 0.5, py = Math.sin(base) * r * 0.3;
    for (let k = 1; k <= 9; k++) {
      const u = k / 9;
      const a = base * (0.6 + u * 0.6) + Math.sin(t * 1.6 + i * 1.3 + u * 3) * 0.35;
      px += Math.cos(a) * r * 0.13; py += Math.sin(a) * r * 0.13;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.6 * alpha);
    ctx.beginPath(); ctx.arc(px, py, Math.max(0.6, r * 0.04), 0, TAU); ctx.fill();
  }
}

function drawWorm(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  const segs = 9;
  const L = r * 2.4;
  for (let i = segs - 1; i >= 0; i--) {
    const u = i / (segs - 1);
    const px = L * 0.45 - u * L;
    const py = Math.sin(u * 4 - t * 5 * (0.6 + o.speed)) * r * 0.22 * u;
    const sr = r * (0.42 - u * 0.2) * (i === 0 ? 1.1 : 1);
    const g = ctx.createRadialGradient(px - sr * 0.3, py - sr * 0.4, sr * 0.1, px, py, sr);
    g.addColorStop(0, rgba(l.membrane, 0.6 * alpha));
    g.addColorStop(1, rgba(l.inner, 0.75 * alpha));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, sr, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(l.membrane, 0.6 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.02);
    ctx.stroke();
    // bristles
    ctx.beginPath();
    ctx.moveTo(px, py - sr); ctx.lineTo(px - sr * 0.3, py - sr * 1.45);
    ctx.moveTo(px, py + sr); ctx.lineTo(px - sr * 0.3, py + sr * 1.45);
    ctx.stroke();
  }
  // jaws
  ctx.strokeStyle = rgba('#ffe0c0', 0.8 * alpha);
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  const jaw = 0.3 + 0.2 * Math.sin(t * 6);
  ctx.beginPath();
  ctx.moveTo(L * 0.45 + r * 0.3, -r * 0.1); ctx.lineTo(L * 0.45 + r * 0.6, -r * jaw);
  ctx.moveTo(L * 0.45 + r * 0.3, r * 0.1); ctx.lineTo(L * 0.45 + r * 0.6, r * jaw);
  ctx.stroke();
}
