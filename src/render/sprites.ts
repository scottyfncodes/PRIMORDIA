import { hexToRgb } from '../engine/math';

/** Pre-rendered soft glow sprites, cached per colour. Cheap additive bloom without shadowBlur. */
const glowCache = new Map<string, HTMLCanvasElement>();

export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  const S = 128;
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.45)`);
  grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  glowCache.set(color, c);
  return c;
}

export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number, alpha: number) {
  if (alpha <= 0.005 || radius <= 0.5) return;
  const s = glowSprite(color);
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = prevA;
}

/** A tileable field of soft coloured clouds used as the far parallax layer. */
export function makeNebulaTile(size: number, colors: string[], seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size, y = rnd() * size, r = size * (0.08 + rnd() * 0.22);
    const [cr, cg, cb] = hexToRgb(colors[i % colors.length]);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const a = 0.05 + rnd() * 0.07;
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  return c;
}

/** Bokeh disc for out-of-focus foreground particles. */
let bokeh: HTMLCanvasElement | null = null;
export function bokehSprite(): HTMLCanvasElement {
  if (bokeh) return bokeh;
  const c = document.createElement('canvas');
  const S = 64;
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(210,255,250,0.22)');
  grad.addColorStop(0.75, 'rgba(210,255,250,0.14)');
  grad.addColorStop(0.92, 'rgba(230,255,252,0.22)');
  grad.addColorStop(1, 'rgba(230,255,252,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  bokeh = c;
  return c;
}
