import { clamp, makeRng, mixHex, rand, rgba, TAU } from '../engine/math';
import type { Environment, ZoneId } from '../sim/environment';
import { SPECIES } from '../sim/species';
import { drawOrganism } from './organismDraw';
import { drawGlow } from './sprites';

/**
 * The living soup between the organisms: everything that makes a drop of water
 * read as an enormous, busy universe. Screen-space parallax layers (illumination,
 * distant out-of-focus life, molecules & debris, fluid flow, Brownian specks)
 * plus world-space chemical reactions. Each zone and era has its own character.
 */

type MoteKind = 'hex' | 'chain' | 'vesicle' | 'fiber' | 'crystal' | 'globule' | 'pollen' | 'lumen' | 'clump' | 'snow';

interface ZoneStyle {
  /** darkfield background tint for the microscopic eras: deep, near */
  bg: [string, string];
  illum: string;
  speck: string;
  motes: Partial<Record<MoteKind, number>>;
  /** reactions per second on screen */
  reaction: number;
  react: [string, string];
  reactKind: 'bloom' | 'fizz' | 'chain' | 'quorum';
  flow: number;
}

const STYLE: Record<ZoneId, ZoneStyle> = {
  shallows: { bg: ['#05221f', '#0d4840'], illum: '#c6ffd9', speck: '#e8ffd6', motes: { hex: 1, chain: 0.8, pollen: 1.1, vesicle: 0.7, fiber: 0.4 }, reaction: 0.3, react: ['#b8ff8a', '#fff3a0'], reactKind: 'bloom', flow: 0.8 },
  drift: { bg: ['#03142a', '#0a3352'], illum: '#a6dcff', speck: '#d8f6ff', motes: { hex: 1, chain: 1, vesicle: 0.6, fiber: 0.5 }, reaction: 0.18, react: ['#8ad8ff', '#d0b8ff'], reactKind: 'bloom', flow: 1.4 },
  thicket: { bg: ['#041a14', '#103d2c'], illum: '#93ffc9', speck: '#cfffe8', motes: { clump: 1.4, fiber: 1.2, vesicle: 0.8, chain: 0.4 }, reaction: 0.4, react: ['#6affc0', '#d8ff8a'], reactKind: 'quorum', flow: 0.35 },
  vents: { bg: ['#160909', '#3c1a12'], illum: '#ffa066', speck: '#ffd8b0', motes: { crystal: 1.4, globule: 1.2, hex: 0.4 }, reaction: 0.65, react: ['#ffb35a', '#fff07a'], reactKind: 'fizz', flow: 0.7 },
  abyss: { bg: ['#010207', '#070c20'], illum: '#3a5aaa', speck: '#9ab8ff', motes: { lumen: 1.6, chain: 0.3, fiber: 0.4 }, reaction: 0.45, react: ['#5ab8ff', '#8afcff'], reactKind: 'chain', flow: 0.5 },
  land: { bg: ['#03142a', '#0a3352'], illum: '#fff6d8', speck: '#fff8e8', motes: { snow: 1, fiber: 0.4 }, reaction: 0.05, react: ['#ffffff', '#fff3a0'], reactKind: 'bloom', flow: 0.4 },
};

const ZONE_IDS = Object.keys(STYLE) as ZoneId[];

interface Mote { x: number; y: number; d: number; ox: number; oy: number; kind: MoteKind; v: number; rot: number; vr: number; s: number; a: number; lastX: number; lastY: number }
interface Ghost { x: number; y: number; d: number; ox: number; oy: number; vx: number; vy: number; s: number; a: number; sprite: HTMLCanvasElement; ang: number; ph: number }
interface Flow { x: number; y: number; ph: number; sp: number; d: number }
interface Speck { x: number; y: number; d: number; ox: number; oy: number; s: number; a: number }
interface Reaction { x: number; y: number; t: number; life: number; r: number; c1: string; c2: string; kind: ZoneStyle['reactKind']; seed: number }

const VARIANTS = 3;

export class Microcosm {
  private sprites = new Map<string, HTMLCanvasElement>();
  private ghostSprites = new Map<string, HTMLCanvasElement>();
  private motes: Mote[] = [];
  private ghosts: Ghost[] = [];
  private flows: Flow[] = [];
  private specks: Speck[] = [];
  reactions: Reaction[] = [];
  private era = 0;
  private reactAcc = 0;
  private style: ZoneStyle = STYLE.drift;
  private zw: Record<ZoneId, number> = { shallows: 0, drift: 1, thicket: 0, vents: 0, abyss: 0, land: 0 };
  private cur = { x: 0, y: 0 };
  private time = 0;

  constructor() {
    for (let i = 0; i < 34; i++) this.motes.push({ x: Math.random(), y: Math.random(), d: rand(0.35, 0.95), ox: 0, oy: 0, kind: 'hex', v: Math.floor(Math.random() * VARIANTS), rot: rand(0, TAU), vr: rand(-0.3, 0.3), s: rand(0.6, 1.25), a: rand(0.5, 1), lastX: 0, lastY: 0 });
    for (let i = 0; i < 26; i++) this.flows.push({ x: Math.random(), y: Math.random(), ph: Math.random(), sp: rand(0.25, 0.5), d: rand(0.5, 1) });
    for (let i = 0; i < 120; i++) this.specks.push({ x: Math.random(), y: Math.random(), d: [0.3, 0.55, 0.85][i % 3], ox: 0, oy: 0, s: rand(0.5, 1.6), a: rand(0.15, 0.55) });
  }

  /** Background colours for the current location (microscopic eras use darkfield tints). */
  backdrop(env: Environment, cx: number, cy: number, era: number, zoneDeep: string, zoneNear: string): [string, string] {
    env.zoneWeights(cx, cy, this.zw);
    const micro = clamp(4 - era, 0, 1); // eras I–III are microscopic; IV+ fade to the zone sea colours
    let deep = zoneDeep, near = zoneNear;
    if (micro > 0) {
      let dr = 0, dg = 0, db = 0, nr = 0, ng = 0, nb = 0;
      for (const k of ZONE_IDS) {
        const w = this.zw[k];
        if (!w) continue;
        const a = parseInt(STYLE[k].bg[0].slice(1), 16), b = parseInt(STYLE[k].bg[1].slice(1), 16);
        dr += ((a >> 16) & 255) * w; dg += ((a >> 8) & 255) * w; db += (a & 255) * w;
        nr += ((b >> 16) & 255) * w; ng += ((b >> 8) & 255) * w; nb += (b & 255) * w;
      }
      const hex = (r: number, g: number, b: number) => '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
      deep = mixHex(zoneDeep, hex(dr, dg, db), micro);
      near = mixHex(zoneNear, hex(nr, ng, nb), micro);
    }
    // dominant zone style drives motes / reactions / specks
    let best: ZoneId = 'drift', bw = -1;
    for (const k of ZONE_IDS) if (this.zw[k] > bw) { bw = this.zw[k]; best = k; }
    this.style = env.land && env.isLand(cx, cy) ? STYLE.land : STYLE[best];
    return [deep, near];
  }

  setEra(era: number) {
    if (era === this.era) return;
    this.era = era;
    // distant life: a handful of out-of-focus organisms from this era's ecosystem
    const pool = SPECIES.filter((s) => s.eras.includes(era) && s.habitat !== 'land' && (era >= 4 || s.look.body !== 'swimmer'));
    const count = [3, 4, 5, 4, 4, 3][era - 1] ?? 3;
    this.ghosts.length = 0;
    for (let i = 0; i < count && pool.length; i++) {
      const sp = pool[(i * 7 + era * 3) % pool.length];
      const a = rand(0, TAU), v = rand(6, 16);
      this.ghosts.push({ x: Math.random(), y: Math.random(), d: rand(0.08, 0.2), ox: 0, oy: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rand(60, 150) * (sp.look.body === 'swimmer' ? 1.3 : 1), a: rand(0.07, 0.14), sprite: this.ghostSprite(sp.id, sp.look), ang: a, ph: rand(0, TAU) });
    }
    for (const m of this.motes) this.reroll(m);
  }

  private moteWeights(): Partial<Record<MoteKind, number>> {
    const e = this.era;
    if (e >= 4) return { snow: 1.6, fiber: 0.6, vesicle: 0.15, lumen: this.style === STYLE.abyss ? 1 : 0 };
    const w = { ...this.style.motes };
    if (e === 1) { w.hex = (w.hex || 0) * 1.4 + 0.2; w.chain = (w.chain || 0) * 1.3 + 0.2; w.vesicle = (w.vesicle || 0) + 0.3; delete w.clump; }
    if (e === 3) { w.hex = (w.hex || 0) * 0.4; w.chain = (w.chain || 0) * 0.4; w.clump = (w.clump || 0) + 0.6; w.snow = 0.4; }
    return w;
  }

  private reroll(m: Mote) {
    const w = this.moteWeights();
    let total = 0;
    for (const k in w) total += w[k as MoteKind] || 0;
    let r = Math.random() * total;
    let kind: MoteKind = 'hex';
    for (const k in w) { r -= w[k as MoteKind] || 0; if (r <= 0) { kind = k as MoteKind; break; } }
    m.kind = kind; m.v = Math.floor(Math.random() * VARIANTS); m.rot = rand(0, TAU); m.s = rand(0.6, 1.25); m.a = rand(0.5, 1);
  }

  /** Screen-space layers drawn behind the world. */
  drawBack(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, z: number, env: Environment, light: number, dt: number) {
    this.time += dt;
    const st = this.style;
    const t = this.time;
    const era = this.era;
    const micro = era <= 3;

    // illumination field: the soft disc of light from the microscope's condenser
    {
      const ix = w * (0.5 + Math.sin(t * 0.05) * 0.08), iy = h * (0.42 + Math.cos(t * 0.04) * 0.05);
      const R = Math.max(w, h) * 0.78;
      const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, R);
      const a = (micro ? 0.07 : 0.05) + light * 0.07;
      g.addColorStop(0, rgba(st.illum, a));
      g.addColorStop(0.55, rgba(st.illum, a * 0.35));
      g.addColorStop(1, rgba(st.illum, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    env.current(cx, cy, this.cur);
    const curX = this.cur.x * z, curY = this.cur.y * z; // px / s at depth 1

    // distant organisms, far out of focus
    ctx.globalCompositeOperation = 'lighter';
    const W = w * 1.6, H = h * 1.6;
    for (const g of this.ghosts) {
      g.ox += (g.vx + curX * g.d) * dt; g.oy += (g.vy + curY * g.d) * dt;
      const px = mod(g.x * W - cx * z * g.d + g.ox, W) - w * 0.3;
      const py = mod(g.y * H - cy * z * g.d + g.oy, H) - h * 0.3;
      const s = g.s * (1 + Math.sin(t * 0.6 + g.ph) * 0.04);
      ctx.globalAlpha = g.a * (0.6 + light * 0.4);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(g.ang + Math.sin(t * 0.2 + g.ph) * 0.2);
      ctx.drawImage(g.sprite, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // fluid flow: faint streaks advected by the local current
    const flowA = st.flow * (micro ? 1 : 0.6);
    if (flowA > 0.05) {
      const sp = Math.hypot(curX, curY);
      if (sp > 1) {
        const ux = curX / sp, uy = curY / sp;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1;
        for (const f of this.flows) {
          f.ph += dt * f.sp;
          if (f.ph >= 1) { f.ph = 0; f.x = Math.random(); f.y = Math.random(); }
          const px = mod(f.x * w * 1.2 - cx * z * f.d * 0.5 + curX * f.d * f.ph * 3, w * 1.2) - w * 0.1;
          const py = mod(f.y * h * 1.2 - cy * z * f.d * 0.5 + curY * f.d * f.ph * 3, h * 1.2) - h * 0.1;
          const len = 14 + sp * 0.5 * f.d;
          const a = Math.sin(f.ph * Math.PI) * 0.09 * flowA;
          ctx.strokeStyle = rgba(st.speck, a);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - ux * len, py - uy * len); ctx.stroke();
        }
      }
    }

    // molecules, organic debris and mineral flakes at mid depth
    const MW = w * 1.3, MH = h * 1.3;
    for (const m of this.motes) {
      m.ox += (curX * m.d * 0.7 + Math.sin(t * 0.7 + m.rot * 5) * 3) * dt;
      m.oy += (curY * m.d * 0.7 + Math.cos(t * 0.6 + m.rot * 3) * 3) * dt;
      m.rot += m.vr * dt;
      const px = mod(m.x * MW - cx * z * m.d * 0.6 + m.ox, MW) - w * 0.15;
      const py = mod(m.y * MH - cy * z * m.d * 0.6 + m.oy, MH) - h * 0.15;
      if (Math.abs(px - m.lastX) > w * 0.5 || Math.abs(py - m.lastY) > h * 0.5) this.reroll(m); // wrapped: new particle from the local zone
      m.lastX = px; m.lastY = py;
      const spr = this.sprite(m.kind, m.v);
      const size = (m.kind === 'lumen' ? 30 : m.kind === 'clump' ? 34 : m.kind === 'snow' ? 26 : 24) * m.s * (0.55 + m.d * 0.7);
      const a = m.a * (m.kind === 'lumen' ? 0.55 + 0.45 * Math.sin(t * 1.5 + m.rot * 4) : 0.42) * (0.45 + m.d * 0.55);
      if (m.kind === 'lumen') ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(m.rot);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
      if (m.kind === 'lumen') ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // Brownian specks: tiny particles jostled by molecular collisions
    ctx.fillStyle = st.speck;
    const jig = micro ? 26 : 6;
    for (const s of this.specks) {
      s.ox += (curX * s.d * 0.5 + (Math.random() - 0.5) * jig * 2) * dt;
      s.oy += (curY * s.d * 0.5 + (Math.random() - 0.5) * jig * 2) * dt;
      const px = mod(s.x * w * 1.2 - cx * z * s.d * 0.4 + s.ox, w * 1.2) - w * 0.1;
      const py = mod(s.y * h * 1.2 - cy * z * s.d * 0.4 + s.oy, h * 1.2) - h * 0.1;
      ctx.globalAlpha = s.a * (0.5 + light * 0.5);
      const sz = s.s * s.d * 1.6;
      ctx.fillRect(px, py, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  /** World-space chemical reactions: brief blooms of colour where molecules meet. */
  updateReactions(dt: number, minX: number, minY: number, maxX: number, maxY: number, unit: number, playerX: number, playerY: number) {
    const st = this.style;
    const rate = st.reaction * (this.era >= 4 ? 0.25 : 1);
    this.reactAcc += dt * rate;
    while (this.reactAcc >= 1) {
      this.reactAcc -= 1 + Math.random() * 0.6;
      if (this.reactions.length >= 6) break;
      let x = 0, y = 0;
      for (let k = 0; k < 6; k++) {
        x = rand(minX, maxX); y = rand(minY, maxY);
        if (Math.hypot(x - playerX, y - playerY) > unit * 4) break;
      }
      this.reactions.push({ x, y, t: 0, life: st.reactKind === 'chain' ? 2.4 : 1.8, r: unit * rand(1.2, 3.2), c1: st.react[0], c2: st.react[1], kind: st.reactKind, seed: Math.random() * 10 });
    }
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i];
      r.t += dt;
      if (r.t >= r.life) this.reactions.splice(i, 1);
    }
  }

  drawReactions(ctx: CanvasRenderingContext2D, zoom: number) {
    for (const r of this.reactions) {
      const k = r.t / r.life;
      const env = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.globalCompositeOperation = 'lighter';
      if (r.kind === 'chain') {
        // a relay of bioluminescent flashes
        for (let q = 0; q < 4; q++) {
          const tq = r.t - q * 0.35;
          if (tq < 0 || tq > 1) continue;
          const e = tq < 0.1 ? tq / 0.1 : 1 - (tq - 0.1) / 0.9;
          const a = r.seed + q * 0.9;
          const px = r.x + Math.cos(a) * r.r * q * 0.6, py = r.y + Math.sin(a) * r.r * q * 0.6;
          drawGlow(ctx, r.c1, px, py, r.r * 0.9, 0.5 * e);
          drawGlow(ctx, '#ffffff', px, py, r.r * 0.18, 0.7 * e);
        }
      } else if (r.kind === 'fizz') {
        drawGlow(ctx, r.c1, r.x, r.y, r.r * (0.6 + k), 0.3 * env);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba(r.c2, 0.45 * env);
        ctx.lineWidth = Math.max(0.8 / zoom, r.r * 0.03);
        ctx.beginPath();
        for (let q = 0; q < 7; q++) {
          const a = r.seed * 3 + q * 0.9;
          const d = r.r * (0.2 + k * 0.9) * (0.5 + (q % 3) * 0.25);
          const br = r.r * (0.06 + (q % 2) * 0.04);
          const bx = r.x + Math.cos(a) * d, by = r.y + Math.sin(a) * d - k * r.r * 0.8;
          ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, TAU);
        }
        ctx.stroke();
      } else if (r.kind === 'quorum') {
        // quorum-sensing pulse: concentric signalling waves
        drawGlow(ctx, r.c1, r.x, r.y, r.r * 0.6, 0.35 * env);
        ctx.globalCompositeOperation = 'source-over';
        for (let q = 0; q < 3; q++) {
          const kk = (k * 1.4 - q * 0.2);
          if (kk <= 0 || kk >= 1) continue;
          ctx.strokeStyle = rgba(r.c1, 0.35 * (1 - kk));
          ctx.lineWidth = Math.max(0.8 / zoom, r.r * 0.025);
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + kk * 1.6), 0, TAU); ctx.stroke();
        }
      } else {
        drawGlow(ctx, r.c1, r.x, r.y, r.r * (0.7 + k * 0.6), 0.32 * env);
        drawGlow(ctx, r.c2, r.x, r.y, r.r * 0.3, 0.45 * env);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba(r.c2, 0.35 * env);
        ctx.lineWidth = Math.max(0.8 / zoom, r.r * 0.02);
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.3 + k * 1.1), 0, TAU); ctx.stroke();
        // reaction products spreading out
        ctx.fillStyle = rgba('#ffffff', 0.6 * env);
        ctx.beginPath();
        for (let q = 0; q < 6; q++) {
          const a = r.seed + q * (TAU / 6);
          const d = r.r * (0.2 + k * 1.2);
          const pr = r.r * 0.04;
          ctx.moveTo(r.x + Math.cos(a) * d + pr, r.y + Math.sin(a) * d); ctx.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d, pr, 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ───────────────────────── sprites ─────────────────────────
  private ghostSprite(id: string, look: import('./look').Look): HTMLCanvasElement {
    let c = this.ghostSprites.get(id);
    if (c) return c;
    c = document.createElement('canvas');
    // rendered small and scaled up: the softness reads as being far out of the focal plane
    const S = 48;
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const animal = look.body === 'swimmer';
    drawOrganism(g, look, S / 2, S / 2, S * (animal ? 0.17 : 0.24), { seed: 1, t: 2, speed: 0.3, angle: 0, detail: 0.5, glowScale: 0.3 });
    this.ghostSprites.set(id, c);
    return c;
  }

  private sprite(kind: MoteKind, v: number): HTMLCanvasElement {
    const key = kind + v;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const S = 64;
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const rng = makeRng(v * 977 + kind.length * 131);
    g.translate(S / 2, S / 2);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const atoms = (pts: [number, number][], col: string, r: number) => {
      g.fillStyle = col;
      g.beginPath();
      for (const [x, y] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
      g.fill();
    };
    switch (kind) {
      case 'hex': {
        // ring molecules: one to three fused hexagonal rings
        const rings = 1 + (v % 3);
        const R = 8;
        const pts: [number, number][] = [];
        g.strokeStyle = 'rgba(200,250,255,0.85)'; g.lineWidth = 1.6;
        for (let k = 0; k < rings; k++) {
          const ox = (k - (rings - 1) / 2) * R * Math.sqrt(3), oy = k % 2 ? R * 0.0 : 0;
          g.beginPath();
          for (let i = 0; i <= 6; i++) {
            const a = (i / 6) * TAU + Math.PI / 6;
            const x = ox + Math.cos(a) * R, y = oy + Math.sin(a) * R;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
            if (i < 6) pts.push([x, y]);
          }
          g.stroke();
          // alternating double bonds
          g.beginPath();
          for (let i = 0; i < 6; i += 2) {
            const a0 = (i / 6) * TAU + Math.PI / 6, a1 = ((i + 1) / 6) * TAU + Math.PI / 6;
            g.moveTo(ox + Math.cos(a0) * R * 0.72, oy + Math.sin(a0) * R * 0.72);
            g.lineTo(ox + Math.cos(a1) * R * 0.72, oy + Math.sin(a1) * R * 0.72);
          }
          g.stroke();
        }
        // a side group
        const a = Math.PI / 6;
        g.beginPath(); g.moveTo(Math.cos(a) * R + (rings - 1) / 2 * R * Math.sqrt(3), Math.sin(a) * R); g.lineTo(Math.cos(a) * R * 2 + (rings - 1) / 2 * R * Math.sqrt(3), Math.sin(a) * R * 1.6); g.stroke();
        atoms(pts, 'rgba(240,255,255,0.95)', 1.6);
        atoms([[Math.cos(a) * R * 2 + (rings - 1) / 2 * R * Math.sqrt(3), Math.sin(a) * R * 1.6]], 'rgba(255,170,150,0.95)', 2.4);
        break;
      }
      case 'chain': {
        // a polymer: zigzag backbone with side chains
        const n = 6 + (v % 3) * 2;
        const pts: [number, number][] = [];
        const L = 44 / n;
        let x = -22, y = 0;
        g.strokeStyle = 'rgba(210,240,255,0.8)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < n; i++) {
          x += L; y = (i % 2 ? -1 : 1) * 4 + Math.sin(i * 0.8 + v) * 3;
          g.lineTo(x, y); pts.push([x, y]);
        }
        g.stroke();
        g.beginPath();
        for (let i = 1; i < n; i += 2) { g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i][0] + 2, pts[i][1] + (i % 4 === 1 ? 7 : -7)); }
        g.stroke();
        atoms(pts, 'rgba(235,250,255,0.95)', 1.5);
        atoms(pts.filter((_, i) => i % 3 === 1).map(([px, py]) => [px + 2, py + 7]), 'rgba(140,200,255,0.95)', 2.2);
        break;
      }
      case 'vesicle': {
        // lipid vesicle: a bilayer bubble
        const R = 14 + v * 3;
        const gr = g.createRadialGradient(-R * 0.3, -R * 0.3, 1, 0, 0, R);
        gr.addColorStop(0, 'rgba(220,255,250,0.25)'); gr.addColorStop(1, 'rgba(160,230,240,0.06)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(210,255,250,0.7)'; g.lineWidth = 1.3; g.stroke();
        g.strokeStyle = 'rgba(210,255,250,0.3)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R - 2.6, 0, TAU); g.stroke();
        if (v === 2) { g.beginPath(); g.arc(R * 0.25, R * 0.1, R * 0.35, 0, TAU); g.stroke(); }
        break;
      }
      case 'fiber': {
        // organic debris: a frayed translucent fibril
        g.strokeStyle = 'rgba(190,240,220,0.55)'; g.lineWidth = 2.2;
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          const x = -26 + u * 52, y = Math.sin(u * 5 + v * 2) * 6;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
        g.lineWidth = 0.8; g.strokeStyle = 'rgba(220,255,240,0.45)';
        g.beginPath();
        for (let i = 0; i < 5; i++) { const x = -20 + i * 10 + rng() * 4, y = Math.sin((x + 26) / 52 * 5 + v * 2) * 6; g.moveTo(x, y); g.lineTo(x + rng() * 6 - 3, y + (rng() < 0.5 ? -1 : 1) * (4 + rng() * 4)); }
        g.stroke();
        break;
      }
      case 'crystal': {
        // mineral shard: faceted, amber, catching the light
        const n = 5 + v;
        const pts: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const rr = (i % 2 ? 9 : 22) * (0.75 + rng() * 0.35);
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.6]);
        }
        const gr = g.createLinearGradient(-20, -12, 20, 12);
        gr.addColorStop(0, 'rgba(255,230,170,0.75)'); gr.addColorStop(1, 'rgba(200,120,60,0.45)');
        g.fillStyle = gr;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 1; g.stroke();
        g.beginPath(); for (const [x, y] of pts) { g.moveTo(0, 0); g.lineTo(x, y); } g.strokeStyle = 'rgba(255,250,230,0.35)'; g.stroke();
        break;
      }
      case 'globule': {
        // sulfur / mineral globules
        for (let i = 0; i < 2 + v; i++) {
          const x = (rng() - 0.5) * 22, y = (rng() - 0.5) * 22, r = 4 + rng() * 6;
          const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r);
          gr.addColorStop(0, 'rgba(255,250,200,0.95)'); gr.addColorStop(0.6, 'rgba(240,200,80,0.7)'); gr.addColorStop(1, 'rgba(180,120,30,0.2)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        break;
      }
      case 'pollen': {
        // an organic spore with a sculpted wall
        const R = 12;
        const gr = g.createRadialGradient(-4, -4, 1, 0, 0, R);
        gr.addColorStop(0, 'rgba(250,255,210,0.75)'); gr.addColorStop(1, 'rgba(170,210,110,0.4)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(240,255,200,0.7)'; g.lineWidth = 1.2;
        g.beginPath();
        const sp = 14 + v * 4;
        for (let i = 0; i < sp; i++) { const a = (i / sp) * TAU; g.moveTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a) * (R + 3), Math.sin(a) * (R + 3)); }
        g.stroke();
        atoms([[-3, 2], [4, -1], [1, 5], [-2, -5]], 'rgba(255,255,230,0.5)', 1.6);
        break;
      }
      case 'lumen': {
        const col = ['#7cd8ff', '#8afcff', '#a88aff'][v];
        drawGlow(g, col, 0, 0, 30, 0.9);
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill();
        break;
      }
      case 'clump': {
        // a microcolony of bacteria stuck together in slime
        g.fillStyle = 'rgba(140,255,200,0.12)'; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill();
        g.fillStyle = 'rgba(190,255,220,0.75)';
        for (let i = 0; i < 7 + v * 2; i++) {
          const a = rng() * TAU, d = rng() * 15, x = Math.cos(a) * d, y = Math.sin(a) * d;
          g.save(); g.translate(x, y); g.rotate(rng() * TAU);
          if (v === 1) { g.beginPath(); g.arc(0, 0, 3.2, 0, TAU); g.fill(); }
          else { g.beginPath(); g.ellipse(0, 0, 5, 2.2, 0, 0, TAU); g.fill(); }
          g.restore();
        }
        break;
      }
      case 'snow': {
        // organic aggregate ("marine snow"), for the larger-scale eras
        g.fillStyle = 'rgba(230,250,245,0.35)';
        for (let i = 0; i < 6; i++) { const x = (rng() - 0.5) * 18, y = (rng() - 0.5) * 14; g.beginPath(); g.arc(x, y, 4 + rng() * 6, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 5; i++) { g.beginPath(); g.arc((rng() - 0.5) * 20, (rng() - 0.5) * 16, 1.2, 0, TAU); g.fill(); }
        break;
      }
    }
    this.sprites.set(key, c);
    return c;
  }
}

function mod(a: number, b: number) { return ((a % b) + b) % b; }
