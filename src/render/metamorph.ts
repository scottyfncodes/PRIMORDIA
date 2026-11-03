import { clamp, rgba, TAU } from '../engine/math';
import { META_DUR, META_SWAP } from '../game/game';
import type { Player } from '../game/player';
import { drawGlow } from './sprites';
import { drawOrganism } from './organismDraw';
import type { Look } from './look';

/**
 * Metamorphosis: the in-world transformation played at every era leap.
 *
 * Phase A (0 → META_SWAP): the old body encysts; a heartbeat quickens while an
 * era-specific event happens inside the cyst — the step of evolution the leap stands for:
 *   → II  endosymbiosis: a bacterium is engulfed and a nuclear envelope closes around the genome
 *   → III multicellularity: the cell divides 1 → 2 → 4 → 8 and the daughters stay together
 *   → IV  a body plan: a hollow ball of cells folds in on itself (gastrulation) and segments
 *   → V   a backbone: a notochord runs head to tail and vertebrae ossify along it
 *   → VI  limbs: four buds push out of the body as light falls from the surface
 * At META_SWAP the leap is applied (the world may rescale behind the flash).
 * Phase B (META_SWAP → META_DUR): the cyst shatters and the new form unfolds.
 */
export interface MetaState { old: Look | null }

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOutBack = (k: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const seg = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1);

/** Scale applied to the emerging body during phase B (1 outside the cinematic). */
export function emergeScale(mt: number) {
  if (mt < META_SWAP) return 1;
  const v = clamp((mt - META_SWAP) / (META_DUR - META_SWAP), 0, 1);
  return 0.55 + 0.45 * easeOutBack(Math.min(1, v * 1.6));
}

/** Draws phase A completely, and phase B's shell remnants (the body itself is drawn by the renderer). */
export function drawMetamorph(ctx: CanvasRenderingContext2D, p: Player, era: number, mt: number, old: Look, t: number, z: number) {
  const x = p.x, y = p.y, r = p.r;
  if (mt >= META_SWAP) { drawEmergence(ctx, p, mt, t, z); return; }
  const u = mt / META_SWAP;
  const beatHz = 1.4 + u * 4.5;
  const beat = Math.pow(0.5 + 0.5 * Math.sin(t * TAU * beatHz), 6);
  const glow = old.glow;

  // soft light gathering around the cyst
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, glow, x, y, r * (4 + 2 * u), 0.25 + 0.5 * u + beat * 0.15);
  ctx.globalCompositeOperation = 'source-over';

  // the old body, slowly stilled and shrinking into the cyst
  const fade = era === 3 ? 1 - seg(u, 0.22, 0.34) : 1;
  if (fade > 0.01) {
    drawOrganism(ctx, old, x, y, r * (1 - 0.18 * easeInOut(u)) * (1 + beat * 0.03), {
      seed: 3.7, t: t * (1 - u * 0.8), speed: 0, angle: p.angle, alpha: fade, flash: clamp(u * 1.2 - 0.3, 0, 0.9), pulse: beat * 0.6, detail: 1,
    });
  }

  // era-specific event inside the cyst
  switch (era) {
    case 2: endosymbiosis(ctx, x, y, r, u, t, z, old); break;
    case 3: division(ctx, x, y, r, u, t, z, old); break;
    case 4: gastrulation(ctx, x, y, r, u, t, z, old, p.angle); break;
    case 5: notochord(ctx, x, y, r, u, t, z, p.angle); break;
    case 6: limbBuds(ctx, x, y, r, u, t, z, old, p.angle); break;
  }

  // the cyst wall: drawn in as a sweeping arc, then a breathing translucent sphere
  const R = r * (1.55 - 0.2 * u) * (1 + beat * 0.05);
  const sweep = seg(u, 0, 0.35);
  const wall = ctx.createRadialGradient(x, y, R * 0.55, x, y, R);
  wall.addColorStop(0, rgba(glow, 0));
  wall.addColorStop(0.8, rgba(glow, 0.08 + 0.1 * u));
  wall.addColorStop(1, rgba(old.membrane, 0.22 + 0.25 * u));
  if (sweep >= 1) { ctx.fillStyle = wall; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = rgba(old.membrane, 0.55 + 0.4 * beat);
  ctx.lineWidth = Math.max(1.2 / z, r * 0.05);
  ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * sweep); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.18 + 0.2 * beat);
  ctx.lineWidth = Math.max(0.8 / z, r * 0.018);
  ctx.beginPath(); ctx.arc(x, y, R * 0.93, -Math.PI / 2 - 0.3, -Math.PI / 2 - 0.3 + TAU * sweep * 0.35); ctx.stroke();

  // genetic material spiralling in: the genome being rewritten
  ctx.globalCompositeOperation = 'lighter';
  const n = 28;
  for (let i = 0; i < n; i++) {
    const ph = (i / n + t * 0.35) % 1;
    const life = (ph + u * 0.6) % 1;
    const rr = R * (2.6 - life * 2.2);
    const a = i * 2.39996 + life * 5 + t * 0.6;
    const col = i % 3 === 0 ? '#ffd166' : i % 3 === 1 ? glow : '#ffffff';
    ctx.fillStyle = rgba(col, Math.sin(life * Math.PI) * (0.35 + 0.6 * u));
    const s = Math.max(1.2 / z, r * 0.035);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, s, 0, TAU); ctx.fill();
  }
  // the final gathering flash before the swap
  const pre = seg(u, 0.8, 1);
  if (pre > 0) drawGlow(ctx, '#e8fff8', x, y, R * (1.5 + pre * 2), pre * 0.9);
  ctx.globalCompositeOperation = 'source-over';
}

function drawEmergence(ctx: CanvasRenderingContext2D, p: Player, mt: number, t: number, z: number) {
  const v = clamp((mt - META_SWAP) / (META_DUR - META_SWAP), 0, 1);
  const x = p.x, y = p.y, r = p.r;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, p.look.glow, x, y, r * (3 + v * 4), 0.6 * (1 - v));
  // shockwave rings of the shattered cyst
  for (let i = 0; i < 2; i++) {
    const k = clamp(v * 1.3 - i * 0.18, 0, 1);
    if (k <= 0 || k >= 1) continue;
    ctx.strokeStyle = rgba(i ? '#ffffff' : p.look.membrane, 0.55 * (1 - k));
    ctx.lineWidth = Math.max(1 / z, r * 0.08 * (1 - k));
    ctx.beginPath(); ctx.arc(x, y, r * (1.3 + k * 4.5), 0, TAU); ctx.stroke();
  }
  // shell fragments drifting away and dissolving
  const nf = 14;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * TAU + 0.3;
    const d = r * (1.4 + easeInOut(v) * 3.2 + (i % 3) * 0.3);
    const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d;
    const sz = r * (0.22 - 0.12 * v);
    ctx.strokeStyle = rgba(p.look.membrane, 0.6 * (1 - v));
    ctx.lineWidth = Math.max(0.8 / z, r * 0.03);
    ctx.beginPath(); ctx.arc(fx, fy, sz, a + Math.PI * 0.6 + t, a + Math.PI * 1.4 + t); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ───────────────────────── era events ─────────────────────────

function endosymbiosis(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, t: number, z: number, l: Look) {
  // a free-living bacterium spirals in and is taken up: the ancestor of every mitochondrion
  const k = easeInOut(seg(u, 0.05, 0.6));
  const a = t * 0.4 + k * 6.5;
  const d = r * (3.4 * (1 - k) + 0.2);
  const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
  const s = r * (0.3 - 0.08 * k);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(a + Math.PI / 2);
  ctx.fillStyle = rgba('#ffb26b', 0.35); ctx.strokeStyle = rgba('#ffd2a0', 0.9); ctx.lineWidth = Math.max(1 / z, s * 0.12);
  ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU); ctx.fill(); ctx.stroke();
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.5, -s * 0.3); ctx.quadraticCurveTo(i * s * 0.5 + s * 0.15, 0, i * s * 0.5, s * 0.3); ctx.stroke(); }
  ctx.restore();
  // the nuclear envelope closes around the genome
  const env = seg(u, 0.5, 0.95);
  if (env > 0) {
    ctx.strokeStyle = rgba('#fff4d6', 0.75 * env); ctx.lineWidth = Math.max(1 / z, r * 0.04);
    for (const rr of [0.36, 0.43]) { ctx.beginPath(); ctx.arc(x, y, r * rr, 0, TAU * env); ctx.stroke(); }
    ctx.fillStyle = rgba(l.glow, 0.25 * env); ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, TAU); ctx.fill();
  }
}

/** Cell positions for 2^m daughters packed in a disc. */
function layout(m: number, R: number): [number, number][] {
  const n = 1 << m, out: [number, number][] = [];
  if (n === 1) return [[0, 0]];
  for (let i = 0; i < n; i++) {
    const rr = n <= 4 ? R * 0.42 : R * (i < 3 ? 0.25 : 0.58);
    const ring = n <= 4 ? n : i < 3 ? 3 : n - 3;
    const j = n <= 4 ? i : i < 3 ? i : i - 3;
    const a = (j / ring) * TAU + (n === 2 ? 0 : 0.4 + m);
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

function division(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, t: number, z: number, l: Look) {
  // three rounds of binary fission; the daughters never separate
  const k = seg(u, 0.22, 0.95) * 3;
  const m = Math.min(3, Math.floor(k));
  const f = easeInOut(Math.min(1, (k - m) * 1.4));
  const parents = layout(m, r);
  const kids = m < 3 ? layout(m + 1, r) : parents;
  const cr = (mm: number) => r * [0.62, 0.46, 0.34, 0.27][mm];
  const draw = (cx: number, cy: number, rr: number, a: number) => {
    const g = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr);
    g.addColorStop(0, rgba(l.membrane, 0.35)); g.addColorStop(1, rgba(l.inner, 0.5 * a));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(l.membrane, 0.85 * a); ctx.lineWidth = Math.max(1 / z, rr * 0.08); ctx.stroke();
    ctx.fillStyle = rgba('#fff4d6', 0.7 * a); ctx.beginPath(); ctx.arc(cx, cy, rr * 0.22, 0, TAU); ctx.fill();
  };
  const appear = seg(u, 0.2, 0.3);
  if (appear <= 0) return;
  if (m >= 3) { for (const [px, py] of parents) draw(x + px, y + py, cr(3) * (1 + 0.04 * Math.sin(t * 6 + px)), appear); return; }
  parents.forEach(([px, py], i) => {
    const [ax, ay] = kids[i * 2], [bx, by] = kids[i * 2 + 1];
    const rr = cr(m) + (cr(m + 1) - cr(m)) * f;
    // mitotic spindle glimmer just before the split
    if (f < 0.35) {
      ctx.strokeStyle = rgba('#ffd166', 0.6 * (1 - f / 0.35)); ctx.lineWidth = Math.max(0.8 / z, rr * 0.05);
      ctx.beginPath(); ctx.moveTo(x + px + (ax - px) * 0.5, y + py + (ay - py) * 0.5); ctx.lineTo(x + px + (bx - px) * 0.5, y + py + (by - py) * 0.5); ctx.stroke();
    }
    draw(x + px + (ax - px) * f, y + py + (ay - py) * f, rr, appear);
    draw(x + px + (bx - px) * f, y + py + (by - py) * f, rr, appear);
  });
}

function gastrulation(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, t: number, z: number, l: Look, ang: number) {
  // a hollow ball of cells; one side folds in to make a gut — the first body cavity
  const k = easeInOut(seg(u, 0.15, 0.75));
  const n = 18;
  ctx.fillStyle = rgba(l.membrane, 0.6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rel = Math.cos(a);
    const inv = Math.max(0, rel) ** 3 * k * 1.25;
    const rr = r * (0.95 - inv * 0.95);
    const cx = x + Math.cos(a + ang) * rr, cy = y + Math.sin(a + ang) * rr;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.15, 0, TAU); ctx.fill();
  }
  // segments appear along the new head-to-tail axis
  const s = seg(u, 0.6, 0.95);
  for (let i = 0; i < 6; i++) {
    const a = seg(s * 6, i, i + 1);
    if (a <= 0) continue;
    const d = r * (-0.6 + i * 0.24);
    const cx = x + Math.cos(ang) * d, cy = y + Math.sin(ang) * d;
    ctx.strokeStyle = rgba('#ffffff', 0.5 * a); ctx.lineWidth = Math.max(1 / z, r * 0.035);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, ang + Math.PI / 2 - 0.9, ang + Math.PI / 2 + 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, ang - Math.PI / 2 - 0.9, ang - Math.PI / 2 + 0.9); ctx.stroke();
  }
  void t;
}

function notochord(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, t: number, z: number, ang: number) {
  // a stiff rod forms tail to head, then vertebrae ossify along it one by one
  const k = easeInOut(seg(u, 0.1, 0.55));
  const L = r * 1.2;
  const cx = Math.cos(ang), cy = Math.sin(ang);
  const x0 = x - cx * L, y0 = y - cy * L;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#bff6ff', 0.85); ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2 / z, r * 0.07);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + cx * L * 2 * k, y0 + cy * L * 2 * k); ctx.stroke();
  const v = seg(u, 0.5, 0.95);
  const nv = 9;
  for (let i = 0; i < nv; i++) {
    const a = seg(v * nv, i, i + 0.8);
    if (a <= 0) continue;
    const d = (i + 0.5) / nv * 2 * L;
    const px = x0 + cx * d, py = y0 + cy * d;
    drawGlow(ctx, '#fff2c0', px, py, r * 0.18, 0.5 * a);
    ctx.fillStyle = rgba('#fff6dc', 0.9 * a);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.fillRect(-r * 0.05, -r * 0.13 * a, r * 0.1, r * 0.26 * a);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  void t;
}

function limbBuds(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, t: number, z: number, l: Look, ang: number) {
  // light from the surface above, and four buds pushing out to become legs
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const a = 0.12 * Math.sin(t * 0.8 + i * 2) * u;
    const gx = x + (i - 1) * r * 0.9;
    const g = ctx.createLinearGradient(gx, y - r * 5, gx, y + r);
    g.addColorStop(0, rgba('#fff8d8', 0.35 * u)); g.addColorStop(1, rgba('#fff8d8', 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(gx - r * 0.25 + a * r, y - r * 5); ctx.lineTo(gx + r * 0.25 + a * r, y - r * 5); ctx.lineTo(gx + r * 0.6, y + r); ctx.lineTo(gx - r * 0.6, y + r); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const k = easeInOut(seg(u, 0.25, 0.9));
  ctx.strokeStyle = rgba(l.membrane, 0.9); ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2 / z, r * 0.14);
  for (const [along, side] of [[0.45, 1], [0.45, -1], [-0.4, 1], [-0.4, -1]] as const) {
    const bx = x + Math.cos(ang) * r * along, by = y + Math.sin(ang) * r * along;
    const na = ang + side * (Math.PI / 2) - side * 0.35;
    const len = r * (0.25 + 0.55 * k);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(na) * len, by + Math.sin(na) * len); ctx.stroke();
  }
  void z;
}
