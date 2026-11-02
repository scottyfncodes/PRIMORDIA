import { rand, rgba, TAU } from '../engine/math';
import { drawGlow } from './sprites';

type Kind = 'spark' | 'ring' | 'bubble' | 'text' | 'shard';

interface P {
  active: boolean;
  kind: Kind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; grow: number;
  color: string;
  text: string;
  drag: number;
}

/** Pooled world-space particle effects. */
export class Fx {
  private pool: P[] = [];
  constructor(n = 700) {
    for (let i = 0; i < n; i++) this.pool.push({ active: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0, color: '#fff', text: '', drag: 2 });
  }
  private get(): P | null {
    for (const p of this.pool) if (!p.active) return p;
    return null;
  }
  spawn(kind: Kind, x: number, y: number, o: Partial<P> = {}) {
    const p = this.get();
    if (!p) return;
    p.active = true; p.kind = kind; p.x = x; p.y = y;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.life = 0; p.max = o.max ?? 0.8;
    p.size = o.size ?? 2; p.grow = o.grow ?? 0; p.color = o.color ?? '#ffffff'; p.text = o.text ?? ''; p.drag = o.drag ?? 2.5;
  }
  burst(x: number, y: number, n: number, color: string, speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.3, 1) * speed;
      this.spawn('spark', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rand(0.4, 0.9), size: size * rand(0.6, 1.3), color });
    }
  }
  ring(x: number, y: number, r0: number, r1: number, color: string, max = 0.6) {
    this.spawn('ring', x, y, { size: r0, grow: (r1 - r0) / max, max, color });
  }
  text(x: number, y: number, text: string, color: string, size: number) {
    this.spawn('text', x, y, { vy: -size * 2.2, max: 1.1, size, color, text, drag: 1.5 });
  }
  bubbles(x: number, y: number, n: number, size: number) {
    for (let i = 0; i < n; i++) this.spawn('bubble', x + rand(-size, size), y + rand(-size, size), { vx: rand(-6, 6) * size * 0.2, vy: -rand(10, 30) * size * 0.12, max: rand(0.8, 1.6), size: size * rand(0.15, 0.4), color: '#e0fffb', drag: 0.8 });
  }
  shards(x: number, y: number, n: number, color: string, speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.5, 1) * speed;
      this.spawn('shard', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rand(0.5, 1), size: size * rand(0.6, 1.2), color, drag: 3 });
    }
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) { p.active = false; continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }
  clear() { for (const p of this.pool) p.active = false; }

  draw(ctx: CanvasRenderingContext2D, zoom: number, minX: number, minY: number, maxX: number, maxY: number) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.active || p.kind !== 'spark') continue;
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const k = 1 - p.life / p.max;
      drawGlow(ctx, p.color, p.x, p.y, p.size * 2.5, k * 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.pool) {
      if (!p.active || p.kind === 'spark') continue;
      if (p.x < minX - 200 || p.x > maxX + 200 || p.y < minY - 200 || p.y > maxY + 200) continue;
      const k = 1 - p.life / p.max;
      if (p.kind === 'ring') {
        ctx.strokeStyle = rgba(p.color, 0.7 * k);
        ctx.lineWidth = Math.max(1 / zoom, p.size * 0.06 * k + 0.6 / zoom);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = rgba(p.color, 0.45 * k);
        ctx.lineWidth = Math.max(0.6 / zoom, p.size * 0.15);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      } else if (p.kind === 'shard') {
        ctx.fillStyle = rgba(p.color, 0.8 * k);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 8 + p.size);
        ctx.fillRect(-p.size, -p.size * 0.3, p.size * 2, p.size * 0.6);
        ctx.restore();
      } else if (p.kind === 'text') {
        const a = p.life < 0.15 ? p.life / 0.15 : k;
        ctx.font = `600 ${p.size}px Outfit, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba('#001018', 0.5 * a);
        ctx.fillText(p.text, p.x + p.size * 0.06, p.y + p.size * 0.08);
        ctx.fillStyle = rgba(p.color, a);
        ctx.fillText(p.text, p.x, p.y);
      }
    }
  }
}
