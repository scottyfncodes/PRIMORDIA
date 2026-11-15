import { clamp, damp, hexToRgb, makeRng, mixHex, TAU } from '../engine/math';
import type { Environment } from '../sim/environment';

/**
 * Dry land, seen from above: living ground rather than a flat fill. Soil with colour drifting
 * from meadow to bare earth, a beach that darkens toward the waterline, swash running up the
 * sand, and plant life that changes with the era: moss and lichen on the first shores, ferns and
 * cycads in the age of reptiles, conifer forest in the age of dinosaurs.
 *
 * Plants are painted once into small sprites (with a blurred copy for their shadow) and then
 * stamped across a deterministic grid, so the detail costs nothing per frame.
 */

type DecorKind = 'pebble' | 'moss' | 'lichen' | 'sprig' | 'grass' | 'fern' | 'horsetail' | 'cycad' | 'crack' | 'log' | 'conifer' | 'treefern';

interface Sprite { img: HTMLCanvasElement; shadow: HTMLCanvasElement | null }

interface Biome {
  ground: string;
  /** soft colour fields laid over the ground: [meadow, shade, bare] */
  patches: string[];
  sand: string;
  /** foliage: dark, mid, light */
  leaf: [string, string, string];
  /** ground cover and its relative frequency */
  decor: [DecorKind, number][];
  /** share of grid cells that hold something */
  density: number;
  /** tall plants whose crowns pass over the animals: [kind, share of tree cells] */
  trees: [DecorKind, number][];
}

const BIOMES: Record<number, Biome> = {
  // VI: bare rock, lichen and the first moss
  6: {
    ground: '#7f7a64', patches: ['#5c8040', '#5b5a4c', '#a59c7e'], sand: '#e2d2a6',
    leaf: ['#2f5a2c', '#5d9a44', '#b4dc7c'],
    decor: [['moss', 0.3], ['lichen', 0.24], ['pebble', 0.22], ['sprig', 0.2], ['crack', 0.04]],
    density: 0.62, trees: [],
  },
  // VII: red earth, fern scrub and cycads
  7: {
    ground: '#9a6c48', patches: ['#6c7e3c', '#7c4e34', '#bd8e58'], sand: '#e8d0a0',
    leaf: ['#2c5226', '#5a8e3a', '#b9d873'],
    decor: [['fern', 0.3], ['horsetail', 0.16], ['cycad', 0.14], ['pebble', 0.12], ['moss', 0.1], ['crack', 0.12], ['log', 0.06]],
    density: 0.72, trees: [['treefern', 0.16]],
  },
  // VIII: deep green, conifer forest
  8: {
    ground: '#4c7036', patches: ['#74993f', '#2f4c2a', '#8c8a48'], sand: '#e4d3a2',
    leaf: ['#234a26', '#4f8a3a', '#b0d870'],
    decor: [['fern', 0.36], ['horsetail', 0.14], ['cycad', 0.16], ['moss', 0.12], ['log', 0.08], ['pebble', 0.08], ['sprig', 0.06]],
    density: 0.82, trees: [['conifer', 0.34], ['treefern', 0.14]],
  },
};

/** World-space size of each kind, in grid cells. */
const SIZE: Record<DecorKind, number> = {
  pebble: 0.4, moss: 0.46, lichen: 0.8, sprig: 0.36, grass: 0.42, fern: 0.78, horsetail: 0.5, cycad: 0.95, crack: 1, log: 1, conifer: 2.7, treefern: 1.7,
};
/** How far the shadow falls, as a share of the sprite: taller plants throw longer shadows. */
const HEIGHT: Record<DecorKind, number> = {
  pebble: 0.03, moss: 0.02, lichen: 0, sprig: 0.04, grass: 0.04, fern: 0.05, horsetail: 0.05, cycad: 0.07, crack: 0, log: 0.04, conifer: 0.13, treefern: 0.1,
};
const VARIANTS = 3;

function hash2(x: number, y: number) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
/** Smooth low-frequency field in 0..1: where forest gathers and where the ground lies open. */
function field(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const rgb = (hex: string, a: number) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

export class Terrain {
  /** 0..1: how much of the view is over land (drives light, haze and vignette) */
  landK = 0;
  private sprites = new Map<string, Sprite[]>();
  private patchCache = new Map<string, HTMLCanvasElement>();
  private grain: HTMLCanvasElement | null = null;
  private xs: number[] = [];
  private ys: number[] = [];
  private motes: { x: number; y: number; s: number; d: number; a: number; ph: number }[] = [];

  constructor() {
    const rnd = makeRng(4242);
    for (let i = 0; i < 46; i++) this.motes.push({ x: rnd(), y: rnd(), s: 0.7 + rnd() * 1.6, d: 0.9 + rnd() * 0.7, a: 0.25 + rnd() * 0.55, ph: rnd() * TAU });
  }

  private biome(era: number): Biome { return BIOMES[clamp(era, 6, 8)]; }

  update(env: Environment, cx: number, cy: number, dt: number) {
    this.landK = damp(this.landK, env.land && env.isLand(cx, cy) ? 1 : 0, 3, dt);
  }

  /** Distance inland from the nearest water's edge (negative in the water). */
  private shoreDist(env: Environment, x: number, y: number): number {
    let d = env.coastY(x) - y;
    const [ix, iy] = env.island;
    const idx = x - ix, idy = y - iy, id = Math.hypot(idx, idy);
    if (id < env.island[2] * 1.3) d = Math.max(d, env.islandRadius(Math.atan2(idy, idx)) - id);
    if (env.lake) {
      const [lx, ly] = env.lakeBasin;
      const ldx = x - lx, ldy = y - ly, ld = Math.hypot(ldx, ldy);
      d = Math.min(d, ld - env.lakeRadius(Math.atan2(ldy, ldx)));
    }
    return d;
  }

  // ───────────────────────── ground ─────────────────────────

  /** Ground, shoreline and low plants. Drawn in world space, beneath every animal. */
  drawGround(ctx: CanvasRenderingContext2D, env: Environment, era: number, minX: number, minY: number, maxX: number, maxY: number) {
    const t = env.time, k = env.scale;
    const B = this.biome(era);
    const pad = (maxX - minX) * 0.1;
    const x0 = minX - pad, x1 = maxX + pad;
    const n = 64;
    const xs = this.xs, ys = this.ys;
    const band = 120 * k;
    // `mainland`: some of the view is north of the coast. `surf`: the coastline itself is close enough to draw.
    let mainland = false, surf = false;
    for (let i = 0; i <= n; i++) {
      xs[i] = x0 + ((x1 - x0) * i) / n;
      ys[i] = env.coastY(xs[i]);
      if (ys[i] > minY) mainland = true;
      if (ys[i] > minY - band * 6 && ys[i] < maxY + band * 6) surf = true;
    }
    const [ix, iy] = env.island;
    const ir = env.island[2] * 1.3;
    const island = ix + ir > minX && ix - ir < maxX && iy + ir > minY && iy - ir < maxY;
    const [lx, ly] = env.lakeBasin;
    const lr = env.lakeBasin[2] * 1.3;
    const lake = env.lake && lx + lr > minX && lx - lr < maxX && ly + lr > minY && ly - lr < maxY;
    if (!mainland && !island) return;
    const shore = surf || island;

    // the shoreline, pushed `off` world units out to sea
    // `lace` scallops the line, the way a wave's leading edge runs further up the sand in some places than others
    const coast = (off: number, lace = 0, ph = 0) => {
      if (surf) for (let i = 0; i <= n; i++) {
        const y = ys[i] + off + (lace ? lace * scallop(xs[i] / band, ph) : 0);
        if (i === 0) ctx.moveTo(xs[i], y); else ctx.lineTo(xs[i], y);
      }
      if (island) this.loop(ctx, ix, iy, (a) => env.islandRadius(a) + off + (lace ? lace * scallop(a * env.island[2] / band, ph) : 0));
    };
    const lakeLoop = (off: number, lace = 0, ph = 0) => this.loop(ctx, lx, ly, (a) => Math.max(0, env.lakeRadius(a) - off - (lace ? lace * scallop(a * env.lakeBasin[2] / band, ph) : 0)));
    const groundPath = () => {
      ctx.beginPath();
      if (mainland) {
        ctx.moveTo(x0, minY - pad);
        for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], ys[i]);
        ctx.lineTo(x1, minY - pad);
        ctx.closePath();
      }
      if (island) this.loop(ctx, ix, iy, (a) => env.islandRadius(a));
    };

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the sea shoals toward the beach: turquoise over pale sand
    for (let q = 0; shore && q < 8; q++) {
      ctx.beginPath(); coast(0);
      ctx.strokeStyle = `rgba(${126 + q * 12},${232 + q * 2},${214 - q * 4},${0.045 + q * 0.006})`;
      ctx.lineWidth = band * (5 - q * 0.6);
      ctx.stroke();
    }
    if (shore) this.swash(ctx, coast, band, t);

    // ── ground ──
    groundPath();
    ctx.fillStyle = B.ground;
    ctx.fill();
    ctx.save();
    groundPath();
    ctx.clip();

    // colour drifting across the land: meadow, shade and bare earth
    const P = 520 * k;
    for (let gx = Math.floor(minX / P) - 1; gx <= Math.ceil(maxX / P); gx++) {
      for (let gy = Math.floor(minY / P) - 1; gy <= Math.ceil(maxY / P); gy++) {
        const h = hash2(gx * 3.1 + 7, gy * 1.7 - 3);
        const px = (gx + 0.5 + (hash2(gy, gx * 5) - 0.5) * 0.8) * P, py = (gy + 0.5 + (hash2(gx * 9, gy) - 0.5) * 0.8) * P;
        const pr = P * (0.85 + h * 0.6);
        const col = B.patches[Math.floor(hash2(gx - 11, gy + 5) * B.patches.length) % B.patches.length];
        ctx.globalAlpha = 0.5 + h * 0.3;
        ctx.drawImage(this.patch(col), px - pr, py - pr, pr * 2, pr * 2);
      }
    }
    ctx.globalAlpha = 1;

    // the beach: dry sand fading inland, damp sand, then the wet edge
    // (many thin washes rather than a few bands, so the sand grades instead of striping)
    const shores = (lace = 0, ph = 0) => { ctx.beginPath(); coast(0, lace, ph); if (lake) lakeLoop(0, lace, ph); };
    const sandDamp = mixHex(B.sand, '#7a6240', 0.5);
    const beach = shore || lake;
    for (let q = 0; beach && q < 9; q++) {
      shores(band * 0.1, q * 1.7);
      ctx.strokeStyle = rgb(B.sand, 0.26);
      ctx.lineWidth = band * (4 - q * 0.3);
      ctx.stroke();
    }
    for (let q = 0; beach && q < 7; q++) {
      shores(band * 0.07, 3 + q);
      ctx.strokeStyle = rgb(sandDamp, 0.17);
      ctx.lineWidth = band * (1.25 - q * 0.16);
      ctx.stroke();
    }
    // the last wave's sheen sliding back down the sand
    const sheen = 0.5 + 0.5 * Math.sin(t * 0.9);
    if (beach) { shores(band * 0.06, t * 0.2); ctx.strokeStyle = `rgba(206,238,232,${0.1 + sheen * 0.14})`; ctx.lineWidth = band * (0.16 + sheen * 0.22); ctx.stroke(); }

    // grain: fine speckle so the ground reads as soil, not paint
    const grain = this.grainTile();
    const G = 400 * k;
    ctx.globalAlpha = 0.9;
    for (let gx = Math.floor(minX / G); gx <= Math.floor(maxX / G); gx++) {
      for (let gy = Math.floor(minY / G); gy <= Math.floor(maxY / G); gy++) ctx.drawImage(grain, gx * G, gy * G, G + 1, G + 1);
    }
    ctx.globalAlpha = 1;

    // ground cover
    const C = 150 * k;
    const cx0 = Math.floor(minX / C) - 1, cx1 = Math.ceil(maxX / C) + 1;
    const cy0 = Math.floor(minY / C) - 1, cy1 = Math.ceil(maxY / C) + 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let gx = cx0; gx <= cx1; gx++) {
        for (let gy = cy0; gy <= cy1; gy++) {
          const h = hash2(gx, gy);
          if (h > B.density) continue;
          const px = (gx + hash2(gy, gx * 3)) * C, py = (gy + hash2(gx * 7, gy)) * C;
          const sd = this.shoreDist(env, px, py);
          if (sd < band * 0.35) continue;
          const pick = hash2(gx * 1.3 + 17, gy * 2.1 - 5);
          let kind: DecorKind;
          if (sd < band * 1.0) { if (pick > 0.45) continue; kind = 'pebble'; }
          else if (sd < band * 2.3) { if (pick > 0.75) continue; kind = pick < 0.5 ? 'grass' : 'pebble'; }
          else kind = this.pickDecor(B, pick, field(px / (C * 7), py / (C * 7)));
          const size = C * SIZE[kind] * (0.75 + hash2(gx * 5, gy * 3) * 0.5);
          const sp = this.sprite(kind, Math.floor(h * 97) % VARIANTS, B);
          const rot = h * 40;
          if (pass === 0) { if (sp.shadow) this.stamp(ctx, sp.shadow, px + size * HEIGHT[kind], py + size * HEIGHT[kind] * 1.2, size, rot, 0.3); }
          else this.stamp(ctx, sp.img, px, py, size, rot + (kind === 'pebble' || kind === 'crack' || kind === 'log' || kind === 'lichen' ? 0 : Math.sin(t * 0.9 + h * 30) * 0.035), 1);
        }
      }
    }
    // tall plants throw their shadow across the ground and whatever walks beneath
    this.forEachTree(env, B, minX, minY, maxX, maxY, (px, py, size, kind, h) => {
      const sp = this.sprite(kind, Math.floor(h * 97) % VARIANTS, B);
      if (sp.shadow) this.stamp(ctx, sp.shadow, px + size * HEIGHT[kind], py + size * HEIGHT[kind] * 1.25, size * 1.04, h * 40, 0.34);
    });
    ctx.restore();

    // ── the lake ──
    if (lake) this.drawLake(ctx, env, lakeLoop, lx, ly, band, t);

    // sunlit edge where water meets sand
    if (!beach) return;
    ctx.beginPath(); coast(0); if (lake) lakeLoop(0);
    ctx.strokeStyle = 'rgba(255,250,228,0.34)';
    ctx.lineWidth = band * 0.045;
    ctx.stroke();
  }

  /** Waves running up the beach: each lace of foam rides in, thins and dies on the sand. */
  private swash(ctx: CanvasRenderingContext2D, shore: (off: number, lace?: number, ph?: number) => void, band: number, t: number) {
    for (let w = 0; w < 3; w++) {
      const ph = (t * 0.2 + w / 3) % 1;
      const off = band * 1.7 * (1 - ph) * (1 - ph);
      const a = Math.sin(ph * Math.PI) * (0.35 + 0.4 * ph);
      const lace = band * (0.1 + 0.16 * ph);
      // the thin sheet of water behind the leading edge
      ctx.beginPath(); shore(off + band * 0.12, lace, w * 2.3);
      ctx.strokeStyle = `rgba(214,250,244,${a * 0.2})`;
      ctx.lineWidth = band * 0.34;
      ctx.stroke();
      ctx.beginPath(); shore(off, lace, w * 2.3);
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`;
      ctx.lineWidth = band * 0.04;
      ctx.stroke();
      // froth breaking up behind it
      ctx.beginPath(); shore(off + band * 0.1, lace * 0.8, w * 2.3 + 0.9);
      ctx.setLineDash([band * 0.07, band * 0.31, band * 0.15, band * 0.52, band * 0.04, band * 0.23]);
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.4})`;
      ctx.lineWidth = band * 0.034;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawLake(ctx: CanvasRenderingContext2D, env: Environment, lakeLoop: (off: number, lace?: number, ph?: number) => void, lx: number, ly: number, band: number, t: number) {
    const R = env.lakeBasin[2];
    ctx.beginPath(); lakeLoop(0);
    const g = ctx.createRadialGradient(lx, ly, R * 0.1, lx, ly, R * 1.2);
    g.addColorStop(0, '#0b3f52');
    g.addColorStop(0.55, '#12667a');
    g.addColorStop(0.86, '#2a9c98');
    g.addColorStop(1, '#63cdb6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.beginPath(); lakeLoop(0);
    ctx.clip();
    for (const [wd, a] of [[2.6, 0.12], [1.3, 0.18]] as const) {
      ctx.beginPath(); lakeLoop(0);
      ctx.strokeStyle = `rgba(150,240,220,${a})`;
      ctx.lineWidth = band * wd;
      ctx.stroke();
    }
    // wind ripples crossing the open water
    ctx.strokeStyle = 'rgba(220,255,248,0.16)';
    ctx.lineWidth = band * 0.07;
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996, d = R * (0.12 + ((i * 0.618) % 1) * 0.72);
      const px = lx + Math.cos(a) * d + Math.sin(t * 0.3 + i) * band * 0.6, py = ly + Math.sin(a) * d * 0.9;
      const len = band * (1.1 + (i % 4) * 0.5) * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 1.9));
      ctx.beginPath(); ctx.moveTo(px - len, py); ctx.quadraticCurveTo(px, py - band * 0.16, px + len, py); ctx.stroke();
    }
    // a lake has no surf, only a ripple lapping at the sand
    const lap = 0.5 + 0.5 * Math.sin(t * 0.8);
    ctx.beginPath(); lakeLoop(band * (0.1 + lap * 0.14), band * 0.08, t * 0.3);
    ctx.strokeStyle = `rgba(240,255,250,${0.3 + 0.3 * lap})`;
    ctx.lineWidth = band * 0.04;
    ctx.stroke();
    ctx.restore();
  }

  private loop(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: (a: number) => number) {
    for (let i = 0; i <= 56; i++) {
      const a = (i / 56) * TAU;
      const rr = radius(a);
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private pickDecor(B: Biome, pick: number, forest: number): DecorKind {
    // open ground runs to stone and cracked earth; shade runs to fern
    let total = 0;
    const w = B.decor.map(([kind, wt]) => {
      const open = kind === 'pebble' || kind === 'crack' || kind === 'sprig' || kind === 'lichen';
      const v = wt * (open ? 1.6 - forest * 1.2 : 0.5 + forest);
      total += v;
      return v;
    });
    let r = pick * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return B.decor[i][0]; }
    return B.decor[0][0];
  }

  private forEachTree(env: Environment, B: Biome, minX: number, minY: number, maxX: number, maxY: number, fn: (x: number, y: number, size: number, kind: DecorKind, h: number) => void) {
    if (!B.trees.length) return;
    const C = 150 * env.scale, T = C * 2.6, band = 120 * env.scale;
    const reach = C * 1.6;
    for (let gx = Math.floor((minX - reach) / T); gx <= Math.floor((maxX + reach) / T); gx++) {
      for (let gy = Math.floor((minY - reach) / T); gy <= Math.floor((maxY + reach) / T); gy++) {
        const h = hash2(gx * 2.7 + 31, gy * 4.3 + 11);
        const px = (gx + 0.15 + hash2(gy + 3, gx * 3 + 1) * 0.7) * T, py = (gy + 0.15 + hash2(gx * 7 + 5, gy) * 0.7) * T;
        const forest = field(px / (C * 7), py / (C * 7));
        let acc = 0, kind: DecorKind | null = null;
        for (const [kd, share] of B.trees) { acc += share * (0.25 + forest * 1.5); if (h < acc) { kind = kd; break; } }
        if (!kind) continue;
        if (this.shoreDist(env, px, py) < band * 3.2) continue;
        fn(px, py, C * SIZE[kind] * (0.8 + hash2(gx * 5 + 2, gy * 3 + 9) * 0.45), kind, h);
      }
    }
  }

  /**
   * Crowns of the tall plants, drawn above the animals. A crown thins out when the player
   * walks under it, so the body is never lost from sight.
   */
  drawCanopy(ctx: CanvasRenderingContext2D, env: Environment, era: number, minX: number, minY: number, maxX: number, maxY: number, px: number, py: number, pr: number) {
    if (!env.land) return;
    const B = this.biome(era);
    const t = env.time;
    this.forEachTree(env, B, minX, minY, maxX, maxY, (x, y, size, kind, h) => {
      const d = Math.hypot(x - px, y - py);
      const near = clamp((d - size * 0.38 - pr) / (pr * 2.2), 0, 1);
      const sp = this.sprite(kind, Math.floor(h * 97) % VARIANTS, B);
      this.stamp(ctx, sp.img, x, y, size, h * 40 + Math.sin(t * 0.55 + h * 20) * 0.02, 0.26 + 0.7 * near);
    });
  }

  private stamp(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number, rot: number, alpha: number) {
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.save();
    ctx.transform(c, s, -s, c, x, y);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // ───────────────────────── sky over the land ─────────────────────────

  /** Screen-space weather over dry land: cloud shadows crossing the ground, drifting seed and dust. */
  drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, z: number, time: number) {
    const k = this.landK;
    if (k < 0.02) return;
    // cloud shadows drift east across the ground
    const span = Math.max(w, h) * 2.4;
    const shade = this.patch('#04121a');
    for (let i = 0; i < 4; i++) {
      const r = Math.max(w, h) * (0.5 + (i % 3) * 0.16);
      const sx = mod(hash2(i, 3) * span - cx * z + time * (9 + i * 2.5), span) - span * 0.25;
      const sy = mod(hash2(7, i) * span - cy * z + time * 2.2, span) - span * 0.25;
      ctx.globalAlpha = 0.2 * k;
      ctx.drawImage(shade, sx - r, sy - r * 0.72, r * 2, r * 1.44);
    }
    // warm light from the upper left
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(w * 0.12, h * 0.04, 0, w * 0.12, h * 0.04, Math.hypot(w, h) * 0.85);
    g.addColorStop(0, `rgba(255,236,190,${0.13 * k})`);
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // spores, seed and dust turning in the sun
    ctx.fillStyle = '#fff6cf';
    for (const m of this.motes) {
      const px = mod(m.x * w * 1.3 - cx * z * m.d * 0.5 + time * 9 * m.d + Math.sin(time * 0.7 + m.ph) * 14, w * 1.3) - w * 0.15;
      const py = mod(m.y * h * 1.3 - cy * z * m.d * 0.5 - time * 5 * m.d, h * 1.3) - h * 0.15;
      ctx.globalAlpha = m.a * k * (0.45 + 0.55 * Math.sin(time * 1.3 + m.ph * 3));
      const s = m.s * m.d;
      ctx.fillRect(px, py, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A flier crossing the sun: its shadow slides over the ground (Era VIII). */
  drawFlyover(ctx: CanvasRenderingContext2D, cx: number, cy: number, viewR: number, time: number) {
    if (this.landK < 0.2) return;
    const period = 26, dur = 7;
    const n = Math.floor(time / period), ph = (time - n * period) / dur;
    if (ph > 1) return;
    const dir = hash2(n, 9) * TAU;
    const side = (hash2(n, 2) - 0.5) * viewR * 0.9;
    const along = (ph * 2 - 1) * viewR * 1.5;
    const x = cx + Math.cos(dir) * along - Math.sin(dir) * side, y = cy + Math.sin(dir) * along + Math.cos(dir) * side;
    const s = viewR * 0.3;
    const flap = Math.sin(time * 2.4) * 0.12;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(dir);
    ctx.fillStyle = `rgba(4,14,18,${0.2 * this.landK})`;
    ctx.beginPath();
    // head with a long crest, narrow body, membrane wings swept back to the ankles
    ctx.moveTo(s * 0.62, 0);
    ctx.lineTo(s * 0.34, -s * 0.045);
    ctx.quadraticCurveTo(s * 0.2, -s * (0.5 + flap), -s * 0.02, -s * (1 + flap));
    ctx.quadraticCurveTo(-s * 0.1, -s * 0.5, -s * 0.36, -s * 0.07);
    ctx.lineTo(-s * 0.6, 0);
    ctx.lineTo(-s * 0.36, s * 0.07);
    ctx.quadraticCurveTo(-s * 0.1, s * 0.5, -s * 0.02, s * (1 + flap));
    ctx.quadraticCurveTo(s * 0.2, s * (0.5 + flap), s * 0.34, s * 0.045);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ───────────────────────── baked sprites ─────────────────────────

  private patch(color: string): HTMLCanvasElement {
    let c = this.patchCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    const S = 96;
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, rgb(color, 1));
    grad.addColorStop(0.45, rgb(color, 0.72));
    grad.addColorStop(0.8, rgb(color, 0.2));
    grad.addColorStop(1, rgb(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    this.patchCache.set(color, c);
    return c;
  }

  /** Tileable speckle: grit, grains and small stains. */
  private grainTile(): HTMLCanvasElement {
    if (this.grain) return this.grain;
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const rnd = makeRng(977);
    const img = g.createImageData(S, S);
    const d = img.data;
    for (let i = 0; i < S * S; i++) {
      const v = rnd();
      const light = v > 0.5;
      const a = Math.pow(Math.abs(v - 0.5) * 2, 2.2) * 44;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = light ? 255 : 0;
      d[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    const dot = (x: number, y: number, r: number, col: string) => {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (x + ox < -r || x + ox > S + r || y + oy < -r || y + oy > S + r) continue;
        g.fillStyle = col;
        g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, TAU); g.fill();
      }
    };
    for (let i = 0; i < 70; i++) dot(rnd() * S, rnd() * S, 18 + rnd() * 46, `rgba(0,0,0,${0.02 + rnd() * 0.035})`);
    for (let i = 0; i < 40; i++) dot(rnd() * S, rnd() * S, 14 + rnd() * 36, `rgba(255,250,220,${0.015 + rnd() * 0.03})`);
    for (let i = 0; i < 900; i++) dot(rnd() * S, rnd() * S, 0.6 + rnd() * 2.2, `rgba(0,0,0,${0.06 + rnd() * 0.14})`);
    for (let i = 0; i < 520; i++) dot(rnd() * S, rnd() * S, 0.5 + rnd() * 1.6, `rgba(255,248,220,${0.06 + rnd() * 0.12})`);
    this.grain = c;
    return c;
  }

  private sprite(kind: DecorKind, variant: number, B: Biome): Sprite {
    const key = kind + B.leaf[1];
    let set = this.sprites.get(key);
    if (!set) { set = []; this.sprites.set(key, set); }
    let sp = set[variant];
    if (sp) return sp;
    const S = kind === 'conifer' || kind === 'treefern' ? 384 : kind === 'cycad' || kind === 'log' || kind === 'crack' ? 224 : 160;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.translate(S / 2, S / 2);
    PAINT[kind](g, S / 2, makeRng(variant * 131 + kind.length * 17 + kind.charCodeAt(0)), B);
    let shadow: HTMLCanvasElement | null = null;
    if (HEIGHT[kind] > 0) {
      shadow = document.createElement('canvas');
      shadow.width = shadow.height = S;
      const sg = shadow.getContext('2d')!;
      sg.shadowColor = '#020a08';
      sg.shadowBlur = S * 0.035;
      sg.shadowOffsetX = S * 4;
      sg.drawImage(c, -S * 4, 0);
    }
    sp = { img: c, shadow };
    set[variant] = sp;
    return sp;
  }
}

function mod(a: number, b: number) { return ((a % b) + b) % b; }
/** Irregular scalloping along a shoreline, -1..1. `u` is distance along the shore in beach-widths. */
function scallop(u: number, ph: number) {
  return Math.sin(u * 1.9 + ph) * 0.5 + Math.sin(u * 4.3 - ph * 1.7 + 1.3) * 0.3 + Math.sin(u * 9.1 + ph * 0.6) * 0.2;
}

type Painter = (g: CanvasRenderingContext2D, R: number, rnd: () => number, B: Biome) => void;

/** One pinnate frond pointing along +x from the origin. */
function frond(g: CanvasRenderingContext2D, len: number, width: number, pairs: number, dark: string, light: string, droop: number) {
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, dark);
  grad.addColorStop(1, light);
  g.fillStyle = grad;
  for (let i = 1; i <= pairs; i++) {
    const u = i / (pairs + 1);
    const x = u * len, y = droop * u * u * len;
    const pl = width * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.7);
    const pw = (len / pairs) * 0.62;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(x - pw * 0.5, y);
      g.quadraticCurveTo(x + pw * 0.1, y + side * pl * 0.6, x + pw * 0.75, y + side * pl);
      g.quadraticCurveTo(x + pw * 0.7, y + side * pl * 0.35, x + pw * 0.5, y);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = rgb(light, 0.7);
  g.lineWidth = Math.max(0.6, width * 0.07);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, droop * len * 0.25, len, droop * len); g.stroke();
}

function rosette(g: CanvasRenderingContext2D, R: number, rnd: () => number, B: Biome, count: number, pairs: number, wk: number, droop: number) {
  // two whorls: the older fronds lie low and dark, the young ones stand up into the light
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? count : Math.max(4, Math.round(count * 0.6));
    const off = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU + (rnd() - 0.5) * 0.3;
      const len = R * (ring === 0 ? 0.94 : 0.62) * (0.82 + rnd() * 0.18);
      g.save();
      g.rotate(a);
      frond(g, len, len * wk, pairs, ring === 0 ? B.leaf[0] : B.leaf[1], ring === 0 ? B.leaf[1] : B.leaf[2], (rnd() - 0.5) * droop);
      g.restore();
    }
  }
}

function stone(g: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: () => number, tone: number) {
  const n = 9, rot = rnd() * TAU, sq = 0.62 + rnd() * 0.3;
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.88 + 0.14 * Math.sin(a * 3 + rot * 5) + 0.06 * Math.sin(a * 5));
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * sq;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  // light falls from the upper left of the world; the stone is drawn rotated, so aim the gradient back
  const lx = Math.cos(-rot - 2.3) * r * 0.5, ly = Math.sin(-rot - 2.3) * r * 0.5;
  const grad = g.createRadialGradient(lx, ly, r * 0.05, 0, 0, r * 1.1);
  const v = Math.round(112 + tone * 40);
  grad.addColorStop(0, `rgb(${v + 46},${v + 40},${v + 24})`);
  grad.addColorStop(0.55, `rgb(${v},${v - 6},${v - 18})`);
  grad.addColorStop(1, `rgb(${v - 52},${v - 56},${v - 62})`);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(20,18,14,0.45)';
  g.lineWidth = Math.max(0.6, r * 0.06);
  g.stroke();
  g.restore();
}

const PAINT: Record<DecorKind, Painter> = {
  pebble(g, R, rnd) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = i === 0 ? 0 : R * (0.3 + rnd() * 0.3);
      stone(g, Math.cos(a) * d, Math.sin(a) * d, R * (i === 0 ? 0.42 : 0.16 + rnd() * 0.14), rnd, rnd());
    }
  },
  moss(g, R, rnd, B) {
    // a low cushion: many small domes, dark in the creases
    const deep = mixHex(B.leaf[0], '#1c2a14', 0.5), mid = mixHex(mixHex(B.leaf[1], B.leaf[0], 0.5), '#5a6a3c', 0.35), top = mixHex(mixHex(B.leaf[1], B.leaf[2], 0.3), '#7f8f52', 0.4);
    const n = 26 + Math.floor(rnd() * 10);
    for (let pass = 0; pass < 2; pass++) {
      const r2 = makeRng(Math.floor(R * 7));
      for (let i = 0; i < n; i++) {
        const a = r2() * TAU, d = Math.sqrt(r2()) * R * 0.62 * (0.7 + 0.3 * Math.sin(a * 3));
        const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.86, r = R * (0.1 + r2() * 0.12);
        if (pass === 0) { g.fillStyle = deep; g.beginPath(); g.arc(x, y, r * 1.18, 0, TAU); g.fill(); continue; }
        const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
        grad.addColorStop(0, top);
        grad.addColorStop(1, mid);
        g.fillStyle = grad;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    }
    // spore capsules standing above the cushion
    g.fillStyle = 'rgba(226,204,128,0.9)';
    for (let i = 0; i < 9; i++) { const a = rnd() * TAU, d = rnd() * R * 0.5; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R * 0.02, 0, TAU); g.fill(); }
  },
  lichen(g, R, rnd) {
    // crusts spreading over bare rock in rosettes: sage, bone and rust
    const tones = ['#a9b48c', '#c9c2a0', '#c08a4e', '#8fa07a'];
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = i === 0 ? 0 : R * (0.25 + rnd() * 0.4);
      const x = Math.cos(a) * d, y = Math.sin(a) * d, r = R * (i === 0 ? 0.42 : 0.16 + rnd() * 0.2);
      const col = tones[Math.floor(rnd() * tones.length)];
      const lobes = 7 + Math.floor(rnd() * 5), ph = rnd() * TAU;
      for (let ring = 0; ring < 3; ring++) {
        const rr = r * (1 - ring * 0.3);
        g.fillStyle = rgb(mixHex(col, ring === 1 ? '#3a3a2c' : '#ffffff', ring === 1 ? 0.22 : ring === 2 ? 0.18 : 0), ring === 0 ? 0.62 : 0.5);
        g.beginPath();
        for (let q = 0; q <= 48; q++) {
          const qa = (q / 48) * TAU;
          const q2 = rr * (0.86 + 0.14 * Math.abs(Math.sin(qa * lobes * 0.5 + ph)) + 0.05 * Math.sin(qa * 3 + ph * 2));
          if (q === 0) g.moveTo(x + Math.cos(qa) * q2, y + Math.sin(qa) * q2); else g.lineTo(x + Math.cos(qa) * q2, y + Math.sin(qa) * q2);
        }
        g.closePath(); g.fill();
      }
    }
  },
  sprig(g, R, rnd, B) {
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.5, len = R * (0.4 + rnd() * 0.3);
      const mx = Math.cos(a) * len, my = Math.sin(a) * len;
      g.strokeStyle = B.leaf[1];
      g.lineWidth = R * 0.045;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(mx, my);
      const tips: [number, number][] = [];
      for (const fork of [-0.45, 0.45]) {
        const tx = mx + Math.cos(a + fork) * len * 0.5, ty = my + Math.sin(a + fork) * len * 0.5;
        g.moveTo(mx, my); g.lineTo(tx, ty);
        tips.push([tx, ty]);
      }
      g.stroke();
      g.fillStyle = '#e2c66a';
      for (const [tx, ty] of tips) { g.beginPath(); g.ellipse(tx, ty, R * 0.06, R * 0.04, a, 0, TAU); g.fill(); }
    }
  },
  grass(g, R, rnd, B) {
    const pale = mixHex(B.leaf[2], '#e6d79a', 0.55), dark = mixHex(B.leaf[1], '#8a8a4a', 0.4);
    for (let i = 0; i < 22; i++) {
      const a = rnd() * TAU, len = R * (0.45 + rnd() * 0.5), wd = R * 0.035;
      g.fillStyle = i % 3 ? pale : dark;
      const bend = (rnd() - 0.5) * 0.5;
      g.beginPath();
      g.moveTo(Math.cos(a + 1.57) * wd, Math.sin(a + 1.57) * wd);
      g.quadraticCurveTo(Math.cos(a + bend) * len * 0.6, Math.sin(a + bend) * len * 0.6, Math.cos(a) * len, Math.sin(a) * len);
      g.quadraticCurveTo(Math.cos(a + bend) * len * 0.55, Math.sin(a + bend) * len * 0.55, Math.cos(a - 1.57) * wd, Math.sin(a - 1.57) * wd);
      g.closePath(); g.fill();
    }
  },
  fern(g, R, rnd, B) {
    rosette(g, R, rnd, B, 8 + Math.floor(rnd() * 3), 11, 0.24, 0.3);
    // fiddleheads still coiled at the heart
    g.strokeStyle = B.leaf[2];
    g.lineWidth = R * 0.03;
    for (let i = 0; i < 3; i++) {
      const a = rnd() * TAU, d = R * 0.1;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R * 0.05, a, a + 4.6); g.stroke();
    }
  },
  horsetail(g, R, rnd, B) {
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = i === 0 ? 0 : R * (0.25 + rnd() * 0.4);
      const x = Math.cos(a) * d, y = Math.sin(a) * d, r = R * (0.2 + rnd() * 0.16);
      for (let ring = 0; ring < 3; ring++) {
        const rr = r * (1 - ring * 0.3), spokes = 12 - ring * 2, off = rnd() * TAU;
        g.strokeStyle = [B.leaf[0], B.leaf[1], B.leaf[2]][ring];
        g.lineWidth = R * 0.028;
        g.beginPath();
        for (let s = 0; s < spokes; s++) { const sa = off + (s / spokes) * TAU; g.moveTo(x + Math.cos(sa) * rr * 0.18, y + Math.sin(sa) * rr * 0.18); g.lineTo(x + Math.cos(sa) * rr, y + Math.sin(sa) * rr); }
        g.stroke();
      }
      g.fillStyle = '#d9c877';
      g.beginPath(); g.arc(x, y, r * 0.14, 0, TAU); g.fill();
    }
  },
  cycad(g, R, rnd, B) {
    const leaf: Biome = { ...B, leaf: [mixHex(B.leaf[0], '#3a4a14', 0.4), mixHex(B.leaf[1], '#8a9a2a', 0.4), mixHex(B.leaf[2], '#e2e07a', 0.4)] };
    rosette(g, R, rnd, leaf, 13 + Math.floor(rnd() * 4), 17, 0.15, 0.08);
    // the cone at the crown
    const cr = R * 0.15;
    const grad = g.createRadialGradient(-cr * 0.3, -cr * 0.35, cr * 0.1, 0, 0, cr);
    grad.addColorStop(0, '#d8a45a');
    grad.addColorStop(1, '#5e3a1a');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(40,22,8,0.5)';
    for (let i = 0; i < 16; i++) { const a = i * 2.39996, d = cr * Math.sqrt(i / 16) * 0.85; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, cr * 0.09, 0, TAU); g.fill(); }
  },
  crack(g, R, rnd) {
    // dried mud: a web of shrinkage cracks
    const walk = (x: number, y: number, a: number, len: number, depth: number) => {
      const steps = 4 + Math.floor(rnd() * 3);
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < steps; i++) {
        a += (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps;
        if (Math.hypot(x, y) > R * 0.92) break;
        g.lineTo(x, y);
      }
      g.stroke();
      if (depth > 0) for (const turn of [-1, 1]) if (rnd() < 0.8) walk(x, y, a + turn * (0.7 + rnd() * 0.5), len * 0.62, depth - 1);
    };
    g.strokeStyle = 'rgba(28,16,8,0.42)';
    for (let i = 0; i < 5; i++) { g.lineWidth = R * (0.014 + rnd() * 0.012); walk(0, 0, (i / 5) * TAU + rnd() * 0.6, R * 0.6, 2); }
  },
  log(g, R, rnd, B) {
    const len = R * 0.9, wd = R * (0.13 + rnd() * 0.05);
    g.rotate(rnd() * 0.4);
    const grad = g.createLinearGradient(0, -wd, 0, wd);
    grad.addColorStop(0, '#a07850');
    grad.addColorStop(0.5, '#6a4a2c');
    grad.addColorStop(1, '#2e1e10');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-len, -wd); g.lineTo(len * 0.86, -wd * 0.8);
    g.lineTo(len * 0.9, -wd * 0.2); g.lineTo(len * 0.8, wd * 0.1); g.lineTo(len * 0.92, wd * 0.5); g.lineTo(len * 0.82, wd * 0.8);
    g.lineTo(-len, wd);
    g.closePath(); g.fill();
    // a broken limb
    g.beginPath(); g.moveTo(-len * 0.2, -wd); g.lineTo(-len * 0.05, -wd * 2.4); g.lineTo(len * 0.06, -wd * 2.2); g.lineTo(len * 0.05, -wd); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,12,6,0.4)';
    g.lineWidth = R * 0.012;
    g.beginPath();
    for (let i = 0; i < 7; i++) { const y = (i / 6 - 0.5) * wd * 1.5, x0 = -len * (0.9 - rnd() * 0.3); g.moveTo(x0, y); g.lineTo(x0 + len * (0.5 + rnd() * 0.9), y + (rnd() - 0.5) * wd * 0.2); }
    g.stroke();
    // the sawn-off end with its growth rings
    g.fillStyle = '#c9a070';
    g.beginPath(); g.ellipse(-len, 0, wd * 0.34, wd, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(70,40,16,0.6)';
    for (const q of [0.3, 0.62]) { g.beginPath(); g.ellipse(-len, 0, wd * 0.34 * q, wd * q, 0, 0, TAU); g.stroke(); }
    // moss creeping over the bark
    for (let i = 0; i < 6; i++) {
      const x = (rnd() - 0.4) * len * 1.4, r = wd * (0.3 + rnd() * 0.4);
      g.fillStyle = rgb(B.leaf[i % 2 ? 1 : 2], 0.75);
      g.beginPath(); g.arc(x, -wd * (0.2 + rnd() * 0.5), r, 0, TAU); g.fill();
    }
  },
  conifer(g, R, rnd, B) {
    // a monkey-puzzle seen from above: whorls of rope-like branches, each tier smaller and brighter
    const dark = mixHex(B.leaf[0], '#0e2a2c', 0.5), mid = mixHex(B.leaf[1], '#1f5a4a', 0.5), light = mixHex(B.leaf[2], '#7ac48a', 0.45);
    const tiers = 4;
    for (let tier = 0; tier < tiers; tier++) {
      const u = tier / (tiers - 1);
      const rr = R * (0.96 - u * 0.62), n = 10 - tier * 2, off = rnd() * TAU;
      const col = mixHex(mixHex(dark, mid, Math.min(1, u * 1.6)), light, Math.max(0, u - 0.45) * 1.3);
      const edge = mixHex(col, '#000000', 0.35);
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU + (rnd() - 0.5) * 0.18;
        const len = rr * (0.86 + rnd() * 0.14), wd = R * (0.085 - u * 0.02);
        g.save();
        g.rotate(a);
        // needles bristling along the bough
        g.strokeStyle = edge;
        g.lineWidth = R * 0.016;
        g.beginPath();
        for (let q = 2; q <= 16; q++) { const x = (q / 16) * len; const nl = wd * 1.25 * Math.sin((q / 16) * Math.PI * 0.9 + 0.3); g.moveTo(x, 0); g.lineTo(x + nl * 0.5, -nl); g.moveTo(x, 0); g.lineTo(x + nl * 0.5, nl); }
        g.stroke();
        const grad = g.createLinearGradient(0, -wd, 0, wd);
        grad.addColorStop(0, mixHex(col, '#ffffff', 0.14));
        grad.addColorStop(1, edge);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, -wd * 0.6);
        g.quadraticCurveTo(len * 0.6, -wd, len, 0);
        g.quadraticCurveTo(len * 0.6, wd, 0, wd * 0.6);
        g.closePath(); g.fill();
        g.restore();
      }
    }
    g.fillStyle = light;
    g.beginPath(); g.arc(0, 0, R * 0.05, 0, TAU); g.fill();
  },
  treefern(g, R, rnd, B) {
    rosette(g, R, rnd, B, 12 + Math.floor(rnd() * 3), 19, 0.19, 0.22);
    // the fibrous crown of the trunk
    const cr = R * 0.1;
    const grad = g.createRadialGradient(-cr * 0.3, -cr * 0.3, cr * 0.1, 0, 0, cr);
    grad.addColorStop(0, '#9a6e42');
    grad.addColorStop(1, '#3a2412');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill();
  },
};
