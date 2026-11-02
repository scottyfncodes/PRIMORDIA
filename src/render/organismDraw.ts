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
    case 'swimmer': drawSwimmer(ctx, l, r, o, alpha); break;
    case 'frond': drawFrond(ctx, l, r, o, alpha); break;
    case 'nautilus': drawNautilus(ctx, l, r, o, alpha); break;
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

// ───────────────────────── Era IV animal body plan ─────────────────────────
const SX = new Float32Array(24), SY = new Float32Array(24), SW = new Float32Array(24), SNX = new Float32Array(24), SNY = new Float32Array(24);

function drawSwimmer(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t, seed = o.seed;
  const elong = Math.min(1.6, Math.max(0, l.elong));
  const L = r * (2.1 + elong * 0.6);
  const vert = !!l.vertebrate;
  const halfW = r * (vert ? 0.62 - elong * 0.12 : 0.6 - elong * 0.15);
  const N = Math.min(16, Math.max(4, l.segments || 8));
  const spd = Math.min(1.5, o.speed);
  const amp = r * (0.07 + 0.12 * spd);
  const freq = 3 + 7 * spd;
  // spine
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    SX[i] = L / 2 - u * L;
    SY[i] = Math.sin(u * 2.8 - t * freq + seed) * amp * Math.pow(u, 1.3);
    const prof = vert
      ? (u < 0.22 ? 0.62 + 0.38 * Math.sqrt(u / 0.22) : 1 - 0.86 * Math.pow((u - 0.22) / 0.78, 1.7))
      : (u < 0.14 ? 0.55 + 0.45 * Math.sqrt(u / 0.14) : 1 - 0.78 * Math.pow((u - 0.14) / 0.86, 1.35));
    SW[i] = halfW * prof * (1 + (o.pulse || 0) * 0.08);
  }
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
    const tx = SX[b] - SX[a], ty = SY[b] - SY[a];
    const tl = Math.hypot(tx, ty) || 1;
    SNX[i] = -ty / tl; SNY[i] = tx / tl;
  }
  const tailAng = Math.atan2(SY[N] - SY[N - 1], SX[N] - SX[N - 1]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // tail fin
  const tf = (l.tailFin || 0) + (l.flagella || 0) * 0.35;
  if (tf > 0) {
    const size = r * (0.3 + 0.32 * tf);
    const beat = Math.sin(t * freq * 1.2 + seed) * 0.25;
    ctx.save();
    ctx.translate(SX[N], SY[N]);
    ctx.rotate(tailAng + beat);
    ctx.fillStyle = rgba(l.membrane, 0.5 * alpha);
    ctx.strokeStyle = rgba(l.membrane, 0.85 * alpha);
    ctx.lineWidth = Math.max(0.8, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, 0);
    if (l.forkTail) {
      // deeply forked, shark-like caudal fin
      ctx.quadraticCurveTo(size * 0.6, -size * 0.3, size * 1.25, -size * 0.85);
      ctx.quadraticCurveTo(size * 0.55, -size * 0.1, size * 0.45, 0);
      ctx.quadraticCurveTo(size * 0.55, size * 0.1, size * 1.05, size * 0.6);
      ctx.quadraticCurveTo(size * 0.5, size * 0.25, -size * 0.05, 0);
    } else {
      ctx.quadraticCurveTo(size * 0.5, -size * 0.25, size * 1.05, -size * 0.7);
      ctx.quadraticCurveTo(size * 0.7, 0, size * 1.05, size * 0.7);
      ctx.quadraticCurveTo(size * 0.5, size * 0.25, -size * 0.05, 0);
    }
    ctx.fill(); ctx.stroke();
    // fin rays
    ctx.strokeStyle = rgba('#ffffff', 0.25 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.012);
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) { ctx.moveTo(0, 0); ctx.lineTo(size * 0.95, k * size * 0.28); }
    ctx.stroke();
    ctx.restore();
  }

  // legs: walking gait (tetrapod limbs or arthropod legs)
  if (l.legs) {
    const n = Math.min(14, l.legs);
    const big = n <= 2;
    const ll = r * (l.legLen || 0.6);
    const gait = t * (2.5 + spd * 9);
    ctx.strokeStyle = rgba(big ? l.inner : l.membrane, 0.9 * alpha);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0.3 : n === 2 ? [0.26, 0.62][k] : 0.14 + (k / (n - 1)) * 0.7;
      const i = Math.min(N, Math.round(u * N));
      for (const side of [-1, 1]) {
        const ph = gait + k * Math.PI * (big ? 1 : 0.55) + (side > 0 ? 0 : Math.PI);
        const swing = Math.sin(ph) * (0.15 + 0.45 * Math.min(1, spd + 0.15));
        const lift = Math.max(0, Math.cos(ph));
        const hx = SX[i] + SNX[i] * SW[i] * 0.75 * side, hy = SY[i] + SNY[i] * SW[i] * 0.75 * side;
        // knee: out to the side and swinging fore/aft
        const kx = hx + SNX[i] * ll * 0.55 * side + swing * ll * 0.5, ky = hy + SNY[i] * ll * 0.55 * side;
        const fx = kx + swing * ll * 0.45 + ll * (big ? 0.25 : 0.1), fy = ky + SNY[i] * ll * (0.4 - lift * 0.12) * side;
        ctx.lineWidth = Math.max(0.6, r * (big ? 0.11 : 0.035));
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        if (big) {
          // digits
          ctx.lineWidth = Math.max(0.5, r * 0.035);
          ctx.beginPath();
          for (let d = -1; d <= 1; d++) { ctx.moveTo(fx, fy); ctx.lineTo(fx + r * 0.12, fy + d * r * 0.07 + side * r * 0.03); }
          ctx.stroke();
        }
      }
    }
  }
  // insect wings
  if (l.wings) {
    const flap = 0.75 + 0.25 * Math.sin(t * 38 + seed);
    for (const [u, sweep] of [[0.3, 0.25], [0.42, 0.45]] as const) {
      const i = Math.min(N, Math.round(u * N));
      for (const side of [-1, 1]) {
        const span = r * 1.35 * flap;
        const ang = Math.atan2(SNY[i] * side, SNX[i] * side) - side * sweep;
        ctx.save();
        ctx.translate(SX[i], SY[i]);
        ctx.rotate(ang);
        ctx.fillStyle = rgba('#e8fbff', 0.16 * alpha);
        ctx.strokeStyle = rgba(l.glow, 0.5 * alpha);
        ctx.lineWidth = Math.max(0.5, r * 0.012);
        ctx.beginPath(); ctx.ellipse(span * 0.5, 0, span * 0.5, r * 0.13, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(span * 0.95, 0); ctx.moveTo(span * 0.3, 0); ctx.lineTo(span * 0.6, r * 0.08); ctx.moveTo(span * 0.4, 0); ctx.lineTo(span * 0.7, -r * 0.08); ctx.stroke();
        ctx.restore();
      }
    }
  }
  // paired fins
  const fins = Math.min(6, l.fins || 0);
  for (let k = 0; k < fins; k++) {
    const pairs = Math.ceil(fins / 2);
    const pi = Math.floor(k / 2), side = k % 2 === 0 ? 1 : -1;
    const u = 0.22 + (pairs > 1 ? (pi / (pairs - 1)) * 0.42 : 0);
    const i = Math.min(N, Math.round(u * N));
    const flap = 0.55 + 0.4 * Math.sin(t * (5 + spd * 6) + pi * 1.3 + (side > 0 ? 0 : Math.PI * 0.15));
    const baseX = SX[i] + SNX[i] * SW[i] * 0.8 * side, baseY = SY[i] + SNY[i] * SW[i] * 0.8 * side;
    const ang = Math.atan2(SNY[i] * side, SNX[i] * side) - side * (Math.PI / 2 - flap) * 0.9;
    const fl = r * (0.5 - pi * 0.06);
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(ang);
    if (l.lobeFins && pi < 2) {
      // fleshy lobe: a muscular stalk with a fringe — the first limbs
      ctx.fillStyle = rgba(l.inner, 0.85 * alpha);
      ctx.strokeStyle = rgba(l.membrane, 0.85 * alpha);
      ctx.lineWidth = Math.max(0.6, r * 0.02);
      ctx.beginPath();
      ctx.ellipse(fl * 0.42, 0, fl * 0.45, fl * 0.16, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.35 * alpha);
      ctx.beginPath(); ctx.moveTo(fl * 0.05, 0); ctx.lineTo(fl * 0.55, 0); ctx.stroke();
      ctx.fillStyle = rgba(l.membrane, 0.4 * alpha);
      ctx.beginPath(); ctx.moveTo(fl * 0.75, -fl * 0.12); ctx.quadraticCurveTo(fl * 1.15, 0, fl * 0.75, fl * 0.12); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = rgba(l.membrane, 0.42 * alpha);
      ctx.strokeStyle = rgba(l.membrane, 0.8 * alpha);
      ctx.lineWidth = Math.max(0.6, r * 0.02);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(fl * 0.55, -fl * 0.32, fl, 0);
      ctx.quadraticCurveTo(fl * 0.55, fl * 0.18, 0, 0);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // claws
  if (l.claws) {
    const grab = 0.5 + 0.5 * Math.sin(t * 2.2 + seed);
    const cl = r * (0.5 + l.claws * 0.15);
    ctx.strokeStyle = rgba(l.membrane, 0.95 * alpha);
    for (const side of [-1, 1]) {
      const bx = L / 2 - r * 0.12, by = side * SW[1] * 0.5;
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const mx = bx + cl * 0.6, my = by + side * cl * 0.45;
      const tx = bx + cl * (1 + grab * 0.2), ty = by + side * cl * (0.1 - grab * 0.12);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.stroke();
      // spines on the inner edge
      ctx.lineWidth = Math.max(0.6, r * 0.025);
      ctx.beginPath();
      for (let k = 1; k <= 4; k++) {
        const u = k / 5;
        const px = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * mx + u * u * tx;
        const py = (1 - u) * (1 - u) * by + 2 * (1 - u) * u * my + u * u * ty;
        ctx.moveTo(px, py); ctx.lineTo(px - r * 0.02, py - side * r * 0.11);
      }
      ctx.stroke();
    }
  }

  // antennae
  if (l.receptors) {
    ctx.strokeStyle = rgba(l.membrane, 0.65 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.018);
    for (const side of [-1, 1]) {
      const sway = Math.sin(t * 2 + side + seed) * 0.15;
      ctx.beginPath();
      ctx.moveTo(L / 2 - r * 0.05, side * SW[0] * 0.4);
      ctx.quadraticCurveTo(L / 2 + r * 0.6, side * r * (0.35 + sway), L / 2 + r * 1.05, side * r * (0.75 + sway));
      ctx.stroke();
    }
  }

  // filter gills
  if (l.gills) {
    const i = Math.max(1, Math.round(N * 0.15));
    ctx.strokeStyle = rgba('#ffd0e8', 0.7 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.02);
    ctx.beginPath();
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const bx = SX[i] - k * r * 0.12, by = SY[i] + side * SW[i] * 0.9;
        const wv = Math.sin(t * 4 + k) * r * 0.05;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - r * 0.12 + wv, by + side * r * 0.3);
        ctx.moveTo(bx - r * 0.05, by + side * r * 0.12);
        ctx.lineTo(bx - r * 0.16 + wv, by + side * r * 0.16);
      }
    }
    ctx.stroke();
  }

  // body outline
  ctx.beginPath();
  ctx.moveTo(SX[0] + r * 0.12, SY[0]);
  for (let i = 0; i <= N; i++) ctx.lineTo(SX[i] + SNX[i] * SW[i], SY[i] + SNY[i] * SW[i]);
  for (let i = N; i >= 0; i--) ctx.lineTo(SX[i] - SNX[i] * SW[i], SY[i] - SNY[i] * SW[i]);
  ctx.closePath();
  const { g, hx, hy } = bodyFill(ctx, l, r, o.angle, alpha);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, r * (0.05 + (l.plates || 0) * 0.025));
  ctx.strokeStyle = rgba(l.membrane, 0.9 * alpha);
  ctx.stroke();
  if (o.harden && o.harden > 0) {
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = rgba('#fff2c0', 0.7 * o.harden * alpha);
    ctx.stroke();
  }

  // segments / carapace
  if (l.carapace) {
    for (let i = 0; i < N; i++) {
      const j = i + 1;
      ctx.beginPath();
      ctx.moveTo(SX[i] + SNX[i] * SW[i] * 0.95, SY[i] + SNY[i] * SW[i] * 0.95);
      ctx.quadraticCurveTo(SX[i] + (SX[i] - SX[j]) * 0.35, SY[i], SX[i] - SNX[i] * SW[i] * 0.95, SY[i] - SNY[i] * SW[i] * 0.95);
      ctx.lineTo(SX[j] - SNX[j] * SW[j] * 0.95, SY[j] - SNY[j] * SW[j] * 0.95);
      ctx.quadraticCurveTo(SX[j] + (SX[i] - SX[j]) * 0.35, SY[j], SX[j] + SNX[j] * SW[j] * 0.95, SY[j] + SNY[j] * SW[j] * 0.95);
      ctx.closePath();
      ctx.fillStyle = rgba(l.membrane, (i % 2 ? 0.14 : 0.22) * alpha);
      ctx.fill();
      ctx.strokeStyle = rgba(l.membrane, 0.6 * alpha);
      ctx.lineWidth = Math.max(0.7, r * 0.028);
      ctx.stroke();
    }
    // central ridge
    ctx.strokeStyle = rgba('#ffffff', 0.22 * alpha);
    ctx.lineWidth = Math.max(0.6, r * 0.04);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { if (i === 0) ctx.moveTo(SX[i], SY[i]); else ctx.lineTo(SX[i], SY[i]); }
    ctx.stroke();
  } else if (vert) {
    drawVertebrateDetails(ctx, l, r, o, alpha, N, L);
  } else {
    ctx.strokeStyle = rgba(l.membrane, 0.28 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.018);
    ctx.beginPath();
    for (let i = 1; i < N; i++) {
      ctx.moveTo(SX[i] + SNX[i] * SW[i] * 0.85, SY[i] + SNY[i] * SW[i] * 0.85);
      ctx.quadraticCurveTo(SX[i] + r * 0.06, SY[i], SX[i] - SNX[i] * SW[i] * 0.85, SY[i] - SNY[i] * SW[i] * 0.85);
    }
    ctx.stroke();
  }

  // dorsal spines (Silica Spicules)
  if (l.spikes) {
    ctx.strokeStyle = rgba(l.membrane, 0.85 * alpha);
    ctx.lineWidth = Math.max(0.6, r * 0.03);
    ctx.beginPath();
    const len = r * (l.spikeLen || 0.5) * 0.6;
    for (let i = 1; i < N; i++) {
      for (const side of [-1, 1]) {
        const bx = SX[i] + SNX[i] * SW[i] * side, by = SY[i] + SNY[i] * SW[i] * side;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + SNX[i] * len * side - len * 0.5, by + SNY[i] * len * side);
      }
    }
    ctx.stroke();
  }
  // cilia fringe
  if (l.cilia) {
    ctx.strokeStyle = rgba(l.membrane, 0.4 * alpha);
    ctx.lineWidth = Math.max(0.4, r * 0.012);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      for (const side of [-1, 1]) {
        const len = r * 0.1 * (0.7 + 0.5 * Math.sin(i * 1.3 - t * 10));
        const bx = SX[i] + SNX[i] * SW[i] * side, by = SY[i] + SNY[i] * SW[i] * side;
        ctx.moveTo(bx, by); ctx.lineTo(bx + SNX[i] * len * side, by + SNY[i] * len * side);
      }
    }
    ctx.stroke();
  }
  // sun fronds
  if (l.fronds) {
    const n = Math.min(8, l.fronds);
    for (let k = 0; k < n; k++) {
      const u = 0.25 + (k / Math.max(1, n - 1)) * 0.45;
      const i = Math.min(N, Math.round(u * N));
      const side = k % 2 ? -1 : 1;
      const sway = Math.sin(t * 1.8 + k) * 0.2;
      const fl = r * 0.75;
      const ang = Math.atan2(SNY[i] * side, SNX[i] * side) + side * 0.9 + sway;
      ctx.save();
      ctx.translate(SX[i] + SNX[i] * SW[i] * 0.6 * side, SY[i] + SNY[i] * SW[i] * 0.6 * side);
      ctx.rotate(ang);
      ctx.fillStyle = rgba('#7dff8a', 0.42 * alpha);
      ctx.strokeStyle = rgba('#c8ffb8', 0.6 * alpha);
      ctx.lineWidth = Math.max(0.5, r * 0.015);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(fl * 0.5, -fl * 0.3, fl, 0);
      ctx.quadraticCurveTo(fl * 0.5, fl * 0.3, 0, 0);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      for (let q = 1; q < 5; q++) { const x = (q / 5) * fl; ctx.moveTo(x, 0); ctx.lineTo(x + fl * 0.1, -fl * 0.12); ctx.moveTo(x, 0); ctx.lineTo(x + fl * 0.1, fl * 0.12); }
      ctx.stroke();
      ctx.restore();
    }
  }
  // chloroplast patches / vesicles along the body
  if (l.chloro) {
    ctx.fillStyle = rgba('#6dff7a', 0.55 * alpha);
    const n = Math.min(14, l.chloro);
    for (let k = 0; k < n; k++) {
      const i = 1 + (k % (N - 1));
      const off = ((k * 0.37) % 1 - 0.5) * 1.2;
      ctx.beginPath(); ctx.ellipse(SX[i] + SNX[i] * SW[i] * off, SY[i] + SNY[i] * SW[i] * off, r * 0.07, r * 0.045, 0, 0, TAU); ctx.fill();
    }
  }
  if (l.vesicles) {
    ctx.fillStyle = rgba(l.vesicleColor || '#ffffff', 0.7 * alpha);
    const n = Math.min(12, l.vesicles);
    for (let k = 0; k < n; k++) {
      const i = 1 + (k % (N - 1));
      const side = k % 2 ? -1 : 1;
      ctx.beginPath(); ctx.arc(SX[i] + SNX[i] * SW[i] * 0.6 * side, SY[i] + SNY[i] * SW[i] * 0.6 * side, r * 0.045 * (1 + 0.3 * Math.sin(t * 3 + k)), 0, TAU); ctx.fill();
    }
  }
  if (l.ink) {
    const i = Math.round(N * 0.45);
    ctx.fillStyle = rgba('#140a2e', 0.65 * alpha);
    ctx.beginPath(); ctx.ellipse(SX[i], SY[i], r * 0.22, SW[i] * 0.42, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba('#6a5aff', 0.4 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.015);
    ctx.stroke();
  }
  // lateral line
  if (l.lateral) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < N; i++) {
      for (const side of [-1, 1]) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 - i * 0.8);
        drawGlow(ctx, l.glow, SX[i] + SNX[i] * SW[i] * 0.55 * side, SY[i] + SNY[i] * SW[i] * 0.55 * side, r * 0.09, 0.5 * pulse * alpha);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // eyes — small, glossy, set into the head (no cartoon pupils)
  const eyes = l.eyes || (l.eyespot ? 1 : 0);
  if (eyes) {
    const er = r * (eyes >= 2 ? 0.13 : 0.075);
    const ex = L / 2 - r * 0.24;
    for (const side of [-1, 1]) {
      const ey = side * SW[1] * 0.55;
      if (eyes >= 2) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, l.glow, ex, ey, er * 2.4, 0.35 * alpha);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = rgba('#05080f', 0.9 * alpha);
      ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 0.8, 0, 0, TAU); ctx.fill();
      if (eyes >= 2) {
        ctx.strokeStyle = rgba(l.glow, 0.8 * alpha);
        ctx.lineWidth = Math.max(0.6, er * 0.25);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#ffffff', 0.7 * alpha);
      ctx.beginPath(); ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.25, 0, TAU); ctx.fill();
    }
  }
  if (l.lure) {
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    drawGlow(ctx, l.glow, L / 2 + r * 0.25, 0, r * (0.35 + pulse * 0.25), (0.5 + pulse * 0.4) * alpha);
    ctx.globalCompositeOperation = 'source-over';
  }
  // specular sheen along the back
  ctx.fillStyle = rgba('#ffffff', 0.13 * alpha);
  ctx.beginPath();
  ctx.ellipse(hx * 0.5 + L * 0.08, hy * 0.5, L * 0.3, halfW * 0.22, 0, 0, TAU);
  ctx.fill();
}

function drawFrond(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  // holdfast at -x, frond reaches toward +x
  ctx.fillStyle = rgba(l.inner, 0.7 * alpha);
  ctx.beginPath(); ctx.ellipse(-r * 1.05, 0, r * 0.22, r * 0.16, 0, 0, TAU); ctx.fill();
  const segs = 12;
  const px: number[] = [], py: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    px.push(-r + u * r * 2.1);
    py.push(Math.sin(u * 2 + t * 0.8 + o.seed) * r * 0.18 * u);
  }
  // leaflets
  for (let i = 1; i < segs; i++) {
    const u = i / segs;
    const len = r * 0.55 * Math.sin(u * Math.PI) + r * 0.08;
    for (const side of [-1, 1]) {
      const sway = Math.sin(t * 1.4 + i * 0.6 + side) * 0.12;
      const a = side * (1.0 + sway);
      const ex = px[i] + Math.cos(a) * len * 0.5, ey = py[i] + Math.sin(a) * len;
      const g = ctx.createLinearGradient(px[i], py[i], ex, ey);
      g.addColorStop(0, rgba(l.inner, 0.7 * alpha));
      g.addColorStop(1, rgba(l.membrane, 0.5 * alpha));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px[i], py[i]);
      ctx.quadraticCurveTo(px[i] + len * 0.45, py[i] + side * len * 0.4, ex, ey);
      ctx.quadraticCurveTo(px[i] - len * 0.1, py[i] + side * len * 0.55, px[i - 1], py[i - 1]);
      ctx.fill();
    }
  }
  ctx.strokeStyle = rgba(l.membrane, 0.8 * alpha);
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) { if (i === 0) ctx.moveTo(px[i], py[i]); else ctx.lineTo(px[i], py[i]); }
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, l.glow, px[segs], py[segs], r * 0.35, 0.4 * alpha);
  ctx.globalCompositeOperation = 'source-over';
}

function drawNautilus(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number) {
  const t = o.t;
  // tentacles from the aperture (+x)
  const n = l.tentacles || 8;
  ctx.strokeStyle = rgba(l.membrane, 0.6 * alpha);
  ctx.lineWidth = Math.max(0.6, r * 0.04);
  for (let i = 0; i < n; i++) {
    const y0 = ((i + 0.5) / n - 0.5) * r * 0.7;
    ctx.beginPath();
    ctx.moveTo(r * 0.45, y0);
    for (let k = 1; k <= 8; k++) {
      const u = k / 8;
      ctx.lineTo(r * 0.45 + u * r * 0.85, y0 * (1 + u * 0.4) + Math.sin(u * 5 - t * 4 + i) * r * 0.06 * u);
    }
    ctx.stroke();
  }
  // shell
  const cx = -r * 0.12;
  const g = ctx.createRadialGradient(cx - r * 0.3, -r * 0.35, r * 0.1, cx, 0, r);
  g.addColorStop(0, rgba('#ffffff', 0.55 * alpha));
  g.addColorStop(0.4, rgba(l.membrane, 0.7 * alpha));
  g.addColorStop(1, rgba(l.inner, 0.85 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, 0, r * 0.82, 0, TAU); ctx.fill();
  // tiger stripes
  ctx.strokeStyle = rgba(l.inner, 0.55 * alpha);
  ctx.lineWidth = Math.max(0.8, r * 0.06);
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.9 + k * 0.32;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.2) * r * 0.55, Math.sin(a + 0.2) * r * 0.55, cx + Math.cos(a + 0.35) * r * 0.4, Math.sin(a + 0.35) * r * 0.4);
    ctx.stroke();
  }
  // spiral (chambered whorl)
  ctx.strokeStyle = rgba('#fff6e0', 0.6 * alpha);
  ctx.lineWidth = Math.max(0.6, r * 0.03);
  ctx.beginPath();
  for (let k = 0; k <= 60; k++) {
    const a = k * 0.21;
    const rr = r * 0.8 * Math.exp(-a * 0.16);
    const x = cx + Math.cos(a + Math.PI * 0.2) * rr, y = Math.sin(a + Math.PI * 0.2) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(l.membrane, 0.9 * alpha);
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  ctx.beginPath(); ctx.arc(cx, 0, r * 0.82, 0, TAU); ctx.stroke();
  // hood & eye
  ctx.fillStyle = rgba(l.inner, 0.8 * alpha);
  ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.18, r * 0.36, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#05080f', 0.9 * alpha);
  ctx.beginPath(); ctx.arc(r * 0.52, -r * 0.18, r * 0.06, 0, TAU); ctx.fill();
}

/** Fish-like details: scales, gill slits, dorsal ridge, jaws, head armour, electroreceptors. */
function drawVertebrateDetails(ctx: CanvasRenderingContext2D, l: Look, r: number, o: DrawOpts, alpha: number, N: number, L: number) {
  const t = o.t;
  // mottled countershading
  if (l.mottled) {
    ctx.fillStyle = rgba('#02060c', 0.22 * alpha);
    for (let k = 0; k < 14; k++) {
      const i = 1 + (k * 5) % (N - 1);
      const off = (((k * 0.618) % 1) - 0.5) * 1.3;
      ctx.beginPath(); ctx.arc(SX[i] + SNX[i] * SW[i] * off, SY[i] + SNY[i] * SW[i] * off, r * (0.05 + (k % 3) * 0.02), 0, TAU); ctx.fill();
    }
  }
  // scales
  if (l.scales) {
    ctx.strokeStyle = rgba(l.membrane, 0.22 * alpha);
    ctx.lineWidth = Math.max(0.4, r * 0.012);
    ctx.beginPath();
    for (let i = 2; i < N - 1; i++) {
      for (let q = -2; q <= 2; q++) {
        const f = q / 2.6;
        const cx = SX[i] + SNX[i] * SW[i] * f, cy = SY[i] + SNY[i] * SW[i] * f;
        const sr = SW[i] * 0.22;
        ctx.moveTo(cx + sr, cy);
        ctx.arc(cx, cy, sr, 0, Math.PI, false);
      }
    }
    ctx.stroke();
  }
  // dorsal fin ridge along the spine
  const d0 = Math.round(N * 0.3), d1 = Math.round(N * 0.62);
  ctx.strokeStyle = rgba(l.membrane, 0.45 * alpha);
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  ctx.beginPath();
  for (let i = d0; i <= d1; i++) { if (i === d0) ctx.moveTo(SX[i], SY[i]); else ctx.lineTo(SX[i], SY[i]); }
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.25 * alpha);
  ctx.lineWidth = Math.max(0.5, r * 0.02);
  ctx.stroke();
  // gill slits
  const gi = Math.max(1, Math.round(N * 0.2));
  ctx.strokeStyle = rgba('#02060c', 0.45 * alpha);
  ctx.lineWidth = Math.max(0.6, r * 0.025);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (let k = 0; k < (l.jaw && l.jaw >= 2 ? 5 : 3); k++) {
      const x = SX[gi] - k * r * 0.07;
      const w = SW[gi] * 0.9;
      ctx.moveTo(x + r * 0.03, SY[gi] + side * w * 0.5);
      ctx.quadraticCurveTo(x - r * 0.02, SY[gi] + side * w * 0.75, x + r * 0.02, SY[gi] + side * w * 0.95);
    }
  }
  ctx.stroke();
  // head armour (placoderm shield)
  if (l.headArmor) {
    const hi = Math.round(N * 0.32);
    ctx.fillStyle = rgba(l.membrane, 0.25 * alpha);
    ctx.strokeStyle = rgba(l.membrane, 0.75 * alpha);
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(L / 2 + r * 0.05, 0);
    for (let i = 0; i <= hi; i++) ctx.lineTo(SX[i] + SNX[i] * SW[i] * 1.02, SY[i] + SNY[i] * SW[i] * 1.02);
    ctx.quadraticCurveTo(SX[hi] - r * 0.15, SY[hi], SX[hi] - SNX[hi] * SW[hi] * 1.02, SY[hi] - SNY[hi] * SW[hi] * 1.02);
    for (let i = hi; i >= 0; i--) ctx.lineTo(SX[i] - SNX[i] * SW[i] * 1.02, SY[i] - SNY[i] * SW[i] * 1.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(SX[1], SY[1]); ctx.lineTo(SX[hi], SY[hi]);
    const mid = Math.round(hi / 2);
    ctx.moveTo(SX[mid] + SNX[mid] * SW[mid], SY[mid] + SNY[mid] * SW[mid]);
    ctx.lineTo(SX[mid] - SNX[mid] * SW[mid], SY[mid] - SNY[mid] * SW[mid]);
    ctx.stroke();
  }
  // jaws
  if (l.jaw) {
    const open = 0.15 + 0.12 * Math.max(0, Math.sin(t * 1.7 + o.seed)) + (o.engulf || 0) * 0.3;
    const mx = L / 2 - r * 0.02, mw = SW[1] * 0.8;
    ctx.strokeStyle = rgba('#02060c', 0.6 * alpha);
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(mx - r * 0.25, -mw);
    ctx.quadraticCurveTo(mx + r * 0.05, -mw * open, mx + r * 0.08, 0);
    ctx.quadraticCurveTo(mx + r * 0.05, mw * open, mx - r * 0.25, mw);
    ctx.stroke();
    if (l.jaw >= 2) {
      ctx.fillStyle = rgba('#fff8ec', 0.9 * alpha);
      for (let k = 0; k < 5; k++) {
        for (const side of [-1, 1]) {
          const u = 0.15 + k * 0.17;
          const px = mx + r * 0.05 - u * r * 0.3, py = side * mw * (open + u * (1 - open)) * 0.95;
          ctx.beginPath(); ctx.moveTo(px - r * 0.025, py); ctx.lineTo(px + r * 0.025, py); ctx.lineTo(px, py - side * r * 0.05); ctx.closePath(); ctx.fill();
        }
      }
    }
  }
  // throat air sac — pulses as the lungs gulp air
  if (l.airSac) {
    const breath = 0.6 + 0.4 * Math.sin(t * 2.2 + o.seed);
    const ai = Math.max(1, Math.round(N * 0.16));
    ctx.fillStyle = rgba('#e8f8ff', 0.22 * alpha);
    ctx.strokeStyle = rgba('#ffffff', 0.35 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.015);
    ctx.beginPath(); ctx.ellipse(SX[ai], SY[ai], r * 0.16 * breath, SW[ai] * 0.55 * breath, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // eardrums behind the eyes
  if (l.ears) {
    const ei = Math.max(1, Math.round(N * 0.12));
    for (const side of [-1, 1]) {
      ctx.fillStyle = rgba(l.inner, 0.7 * alpha);
      ctx.strokeStyle = rgba(l.membrane, 0.8 * alpha);
      ctx.lineWidth = Math.max(0.5, r * 0.02);
      ctx.beginPath(); ctx.arc(SX[ei] - r * 0.08, SY[ei] + side * SW[ei] * 0.62, r * 0.075, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  // sticky tongue flick
  if (l.tongue) {
    const flick = Math.max(0, Math.sin(t * 1.3 + o.seed * 3));
    if (flick > 0.85) {
      const len = r * 0.9 * (flick - 0.85) / 0.15;
      ctx.strokeStyle = rgba('#ff8aa0', 0.9 * alpha);
      ctx.lineWidth = Math.max(0.8, r * 0.04);
      ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2 + len, Math.sin(t * 9) * r * 0.05); ctx.stroke();
      ctx.fillStyle = rgba('#ffb0c0', 0.95 * alpha);
      ctx.beginPath(); ctx.arc(L / 2 + len, Math.sin(t * 9) * r * 0.05, r * 0.05, 0, TAU); ctx.fill();
    }
  }
  // clutch of eggs carried near the tail
  if (l.eggs) {
    const ci = Math.round(N * 0.7);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05;
      const ex = SX[ci] + Math.cos(a) * r * 0.12, ey = SY[ci] + Math.sin(a) * r * 0.1;
      ctx.fillStyle = rgba('#fff4d0', 0.55 * alpha);
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.06, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#ffb84a', 0.7 * alpha);
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.022, 0, TAU); ctx.fill();
    }
  }
  // electroreceptor pores on the snout
  if (l.electro) {
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (let k = 0; k < 8; k++) {
      const a = (k / 7 - 0.5) * 1.6;
      drawGlow(ctx, '#7ab8ff', L / 2 - r * 0.2 + Math.cos(a) * r * 0.18, Math.sin(a) * SW[1] * 0.7, r * 0.07, (0.4 + 0.4 * pulse) * alpha);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
