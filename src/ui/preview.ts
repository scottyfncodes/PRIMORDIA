import { drawOrganism } from '../render/organismDraw';
import type { Look } from '../render/look';

/** Small animated organism previews for menus (evolution chamber, codex, leap). */
export class PreviewCanvas {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  look: Look;
  bodyScale = 0.28;
  angle = -0.5;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  constructor(look: Look, cls = 'preview', bodyScale = 0.28) {
    this.look = look;
    this.bodyScale = bodyScale;
    this.canvas = document.createElement('canvas');
    this.canvas.className = cls;
    this.ctx = this.canvas.getContext('2d')!;
  }
  draw(t: number, speed = 0.35) {
    const c = this.canvas;
    const w = c.clientWidth || 120, h = c.clientHeight || 120;
    const W = Math.round(w * this.dpr), H = Math.round(h * this.dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const animal = this.look.body === 'swimmer';
    const r = Math.min(w, h) * this.bodyScale * (animal ? 0.68 : this.look.flagella ? 0.85 : 1);
    // shift so trailing flagella / tentacles (or leading claws) stay in frame
    const tail = animal ? (this.look.claws || this.look.receptors ? -r * 0.3 : 0) : this.look.flagella || this.look.tentacles ? r * 0.55 : 0;
    const a = this.angle;
    drawOrganism(ctx, this.look, w / 2 + Math.cos(a) * tail, h / 2 + Math.sin(a) * tail, r, { seed: 2.1, t, speed, angle: this.angle + Math.sin(t * 0.4) * 0.15, detail: 1, glowScale: 0.5 });
  }
}

/** Scale that frames a body kind comfortably in a square preview. */
export function previewScale(look: Look) {
  const b = look.body;
  return b === 'worm' ? 0.18 : b === 'spiral' || b === 'rod' ? 0.2 : b === 'polyp' ? 0.24 : 0.28;
}

export function staticPreview(look: Look, size: number, scale = 0.28, cls = 'preview', silhouette = false): HTMLCanvasElement {
  const p = new PreviewCanvas(look, cls, scale);
  p.canvas.style.width = size + 'px';
  p.canvas.style.height = size + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  p.canvas.width = size * dpr; p.canvas.height = size * dpr;
  // draw synchronously with explicit size (element may not be laid out yet)
  Object.defineProperty(p.canvas, 'clientWidth', { value: size });
  Object.defineProperty(p.canvas, 'clientHeight', { value: size });
  p.draw(1.3, 0.2);
  if (silhouette) {
    // an unidentified shape glimpsed at the edge of vision
    const ctx = p.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = 'rgba(120,220,205,0.16)';
    ctx.fillRect(0, 0, p.canvas.width, p.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  return p.canvas;
}
