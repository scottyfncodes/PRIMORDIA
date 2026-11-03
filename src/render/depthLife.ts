import { rand } from '../engine/math';

/**
 * Depth life: animated 3D microorganisms (modelled and rendered in Blender through GITCRAFT
 * MeshCraft — see design/gitcraft/specimens.py) drifting through two parallax layers behind
 * the playfield. Everything off the focal plane is defocused, so the layers use the pre-blurred
 * sheets (far: small and faint; near: large, ghostly bokeh).
 * Frames cross-fade so a 16-frame loop rotates smoothly at any speed.
 */
type Specimen = 'diatom' | 'radiolarian' | 'volvox' | 'medusa' | 'ctenophore';

interface Sheet { img: HTMLImageElement; ready: boolean; cell: number }
interface Drifter { sp: Specimen; x: number; y: number; d: number; s: number; a: number; ph: number; spd: number; vx: number; vy: number; rot: number; near: boolean }

const BASE = './assets/life/';
/** loop length in seconds per specimen (rotation or pulse period) */
const PERIOD: Record<Specimen, number> = { diatom: 9, radiolarian: 12, volvox: 10, medusa: 2.6, ctenophore: 3.2 };
const ERA_SET: Record<number, Specimen[]> = {
  1: ['diatom', 'radiolarian', 'diatom'],
  2: ['diatom', 'radiolarian', 'volvox'],
  3: ['volvox', 'radiolarian', 'medusa'],
  4: ['medusa', 'ctenophore'],
  5: ['medusa', 'ctenophore'],
  6: ['medusa', 'ctenophore'],
};

export class DepthLife {
  private sheets = new Map<string, Sheet>();
  private drifters: Drifter[] = [];
  private era = 0;
  /** lowered by adaptive quality */
  density = 1;

  private sheet(sp: Specimen, soft: boolean): Sheet {
    const key = sp + (soft ? '-soft' : '');
    let s = this.sheets.get(key);
    if (!s) {
      const img = new Image();
      img.decoding = 'async';
      s = { img, ready: false, cell: soft ? 128 : 256 };
      const sh = s;
      img.onload = () => { sh.ready = true; };
      img.onerror = () => { /* missing asset: the layer simply stays empty */ };
      img.src = `${BASE}${key}.webp`;
      this.sheets.set(key, s);
    }
    return s;
  }

  setEra(era: number) {
    if (era === this.era) return;
    this.era = era;
    const set = ERA_SET[era] ?? ERA_SET[1];
    this.drifters.length = 0;
    const far = Math.round(7 * this.density), near = Math.round(2 * this.density);
    for (let i = 0; i < far + near; i++) {
      const isNear = i >= far;
      const sp = set[i % set.length];
      const big = sp === 'medusa' || sp === 'ctenophore';
      this.drifters.push({
        sp, near: isNear,
        x: Math.random(), y: Math.random(),
        d: isNear ? rand(0.32, 0.45) : rand(0.08, 0.2),
        s: isNear ? rand(150, 230) * (big ? 1.15 : 1) : rand(34, 80) * (big ? 1.25 : 1),
        a: isNear ? rand(0.12, 0.2) : rand(0.26, 0.45),
        ph: Math.random(), spd: rand(0.8, 1.2),
        vx: rand(-4, 4), vy: big ? rand(-7, -3) : rand(-3, 3),
        rot: big ? rand(-0.25, 0.25) : rand(0, Math.PI * 2),
      });
      // warm the cache for this era
      this.sheet(sp, true);
    }
  }

  /** Draw in screen space (CSS px). `fade` dims the layer (e.g. on dry land). */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, z: number, time: number, light: number, fade: number) {
    if (fade <= 0.02) return;
    const W = w * 1.5, H = h * 1.5;
    for (const dr of this.drifters) {
      const sh = this.sheet(dr.sp, true);
      if (!sh.ready) continue;
      const px = mod(dr.x * W - cx * z * dr.d * 0.5 + time * dr.vx, W) - w * 0.25;
      const py = mod(dr.y * H - cy * z * dr.d * 0.5 + time * dr.vy, H) - h * 0.25;
      if (px < -dr.s || px > w + dr.s || py < -dr.s || py > h + dr.s) continue;
      const loop = (time * dr.spd / PERIOD[dr.sp] + dr.ph) % 1;
      const fpos = loop * 16;
      const f0 = Math.floor(fpos) % 16, f1 = (f0 + 1) % 16, k = fpos - Math.floor(fpos);
      const alpha = dr.a * fade * (0.7 + 0.3 * light);
      const c = sh.cell, s = dr.s;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(dr.rot);
      ctx.globalAlpha = alpha * (1 - k);
      ctx.drawImage(sh.img, (f0 % 4) * c, Math.floor(f0 / 4) * c, c, c, -s / 2, -s / 2, s, s);
      ctx.globalAlpha = alpha * k;
      ctx.drawImage(sh.img, (f1 % 4) * c, Math.floor(f1 / 4) * c, c, c, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function mod(a: number, n: number) { return ((a % n) + n) % n; }
