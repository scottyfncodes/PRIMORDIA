import { clamp, damp, mixHex, rand, rgba, TAU } from '../engine/math';
import { ZONES, type ZoneId } from '../sim/environment';
import type { Game } from '../game/game';
import type { Organism } from '../sim/entities';
import { drawOrganism } from './organismDraw';
import { bokehSprite, drawGlow, makeNebulaTile } from './sprites';
import { Fx } from './fx';

interface Snow { x: number; y: number; s: number; d: number; a: number }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  w = 0; h = 0;
  cam = { x: 0, y: 0, zoom: 1.8, shake: 0 };
  fx = new Fx();
  private nebulaA: HTMLCanvasElement;
  private nebulaB: HTMLCanvasElement;
  private snow: Snow[] = [];
  private bokeh: Snow[] = [];
  private vignette: HTMLCanvasElement | null = null;
  private visible: Organism[] = [];
  private zw: Record<ZoneId, number> = { shallows: 0, drift: 0, thicket: 0, vents: 0, abyss: 0, land: 0 };
  hurtFlash = 0;
  evolveFlash = 0;
  time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.nebulaA = makeNebulaTile(768, ['#1fb6c9', '#2a6fd6', '#38d39f', '#8a5adf'], 7);
    this.nebulaB = makeNebulaTile(512, ['#7af5df', '#4cc9f0', '#b8f2e6', '#ffd6a5'], 13);
    for (let i = 0; i < 140; i++) this.snow.push({ x: Math.random(), y: Math.random(), s: rand(0.5, 1.8), d: [0.25, 0.5, 0.8][i % 3], a: rand(0.15, 0.5) });
    for (let i = 0; i < 9; i++) this.bokeh.push({ x: Math.random(), y: Math.random(), s: rand(30, 90), d: rand(1.2, 1.6), a: rand(0.25, 0.6) });
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // vignette
    const v = document.createElement('canvas');
    v.width = Math.round(w / 2); v.height = Math.round(h / 2);
    const g = v.getContext('2d')!;
    const grad = g.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.3, v.width / 2, v.height / 2, Math.hypot(v.width, v.height) * 0.55);
    grad.addColorStop(0, 'rgba(0,4,10,0)');
    grad.addColorStop(1, 'rgba(0,4,10,0.72)');
    g.fillStyle = grad; g.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  }

  /** On-screen player radius in CSS px — keeps the organism readable on any device. */
  screenPlayerR() {
    const m = Math.min(this.w, this.h);
    return 17 * Math.sqrt(m / 390);
  }

  viewRadiusWorld() {
    return Math.hypot(this.w, this.h) / 2 / this.cam.zoom;
  }

  updateCamera(game: Game, dt: number) {
    const p = game.player;
    const targetZoom = this.bodyZoom(game) * (1 - game.danger * 0.08);
    this.cam.zoom = damp(this.cam.zoom, targetZoom, 2.2, dt);
    const lead = 0.35;
    const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
    this.cam.x = damp(this.cam.x, tx, 4.5, dt);
    this.cam.y = damp(this.cam.y, ty, 4.5, dt);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.5);
  }

  /** Zoom that frames the player's body; slender animal bodies get a closer camera. */
  bodyZoom(game: Game) {
    const p = game.player;
    return this.screenPlayerR() / p.r * (p.look.body === 'swimmer' ? 1.45 : 1);
  }

  snapCamera(game: Game) {
    this.cam.x = game.player.x; this.cam.y = game.player.y;
    this.cam.zoom = this.bodyZoom(game);
  }

  render(game: Game, dt: number) {
    this.time += dt;
    const ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    const env = game.env;
    const cam = this.cam;
    const z = cam.zoom;
    const sx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 10 : 0;
    const sy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 10 : 0;
    const cx = cam.x, cy = cam.y;

    // ───────────── background (screen space) ─────────────
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    env.zoneWeights(cx, cy, this.zw);
    const deep = blend(this.zw, (k) => ZONES[k].deep);
    const near = blend(this.zw, (k) => ZONES[k].near);
    const light = env.light(cx, cy);
    const WORLD_W = env.w, WORLD_H = env.h;
    const depthDark = clamp(cy / WORLD_H, 0, 1);
    const top = mixHex(near, '#000000', depthDark * 0.35);
    const bottom = mixHex(deep, '#000000', depthDark * 0.25);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // nebula parallax
    ctx.globalCompositeOperation = 'lighter';
    this.tile(this.nebulaA, cx * z * 0.05, cy * z * 0.05, 0.65 + light * 0.25, 1.4);
    this.tile(this.nebulaB, cx * z * 0.12, cy * z * 0.12, 0.35 + light * 0.3, 1);
    ctx.globalCompositeOperation = 'source-over';

    // light shafts from the surface
    if (light > 0.15) {
      ctx.globalCompositeOperation = 'lighter';
      const n = 5;
      for (let i = 0; i < n; i++) {
        const baseX = ((i / n) * w * 1.6 - (cx * z * 0.08) % (w * 1.6) + w * 1.6) % (w * 1.6) - w * 0.3;
        const sway = Math.sin(this.time * 0.25 + i * 1.7) * 40;
        const bw = 60 + (i % 3) * 50;
        const a = (light - 0.15) * 0.16 * (0.6 + 0.4 * Math.sin(this.time * 0.4 + i * 2.1));
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `rgba(190,255,240,${a})`);
        g.addColorStop(1, 'rgba(190,255,240,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(baseX + sway, 0);
        ctx.lineTo(baseX + sway + bw, 0);
        ctx.lineTo(baseX + sway + bw * 2.2 + 120, h);
        ctx.lineTo(baseX + sway + 120, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // drifting marine snow (parallax depth)
    ctx.fillStyle = '#d8fff6';
    for (const s of this.snow) {
      const px = mod(s.x * w * 1.2 - cx * z * s.d * 0.4 + this.time * 6 * s.d, w * 1.2) - w * 0.1;
      const py = mod(s.y * h * 1.2 - cy * z * s.d * 0.4 - this.time * 3 * s.d, h * 1.2) - h * 0.1;
      ctx.globalAlpha = s.a * (0.5 + light * 0.5);
      ctx.fillRect(px, py, s.s * s.d * 1.6, s.s * s.d * 1.6);
    }
    ctx.globalAlpha = 1;

    // ───────────── world space ─────────────
    const tx = w / 2 - cx * z + sx, ty = h / 2 - cy * z + sy;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * tx, dpr * ty);
    const vw = w / z / 2 + 20, vh = h / z / 2 + 20;
    const minX = cx - vw, maxX = cx + vw, minY = cy - vh, maxY = cy + vh;
    const t = env.time;

    // world edge haze
    if (minX < 0 || minY < 0 || maxX > WORLD_W || maxY > WORLD_H) {
      ctx.fillStyle = 'rgba(0,6,14,0.55)';
      if (minX < 0) ctx.fillRect(minX - 10, minY - 10, -minX + 10, maxY - minY + 20);
      if (maxX > WORLD_W) ctx.fillRect(WORLD_W, minY - 10, maxX - WORLD_W + 10, maxY - minY + 20);
      if (minY < 0) ctx.fillRect(minX - 10, minY - 10, maxX - minX + 20, -minY + 10);
      if (maxY > WORLD_H) ctx.fillRect(minX - 10, WORLD_H, maxX - minX + 20, maxY - WORLD_H + 10);
    }

    // biofilm strands
    ctx.lineCap = 'round';
    for (const s of env.strands) {
      if (s.x + s.len < minX || s.x - s.len > maxX || s.y + s.len < minY || s.y - s.len > maxY) continue;
      const sway = Math.sin(t * 0.6 + s.seed) * 0.15;
      const a = s.angle + sway;
      const ex = s.x + Math.cos(a) * s.len, ey = s.y + Math.sin(a) * s.len;
      const mx = (s.x + ex) / 2 + Math.cos(a + Math.PI / 2) * s.len * 0.3 * s.bend, my = (s.y + ey) / 2 + Math.sin(a + Math.PI / 2) * s.len * 0.3 * s.bend;
      ctx.strokeStyle = 'rgba(80,190,140,0.18)';
      ctx.lineWidth = s.w * 2.2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,255,200,0.16)';
      ctx.lineWidth = s.w * 0.6;
      ctx.stroke();
    }

    // vents
    for (const v of env.vents) {
      if (v.x + v.r * 4 < minX || v.x - v.r * 4 > maxX || v.y + v.r * 4 < minY || v.y - v.r * 4 > maxY) continue;
      const pulse = 0.7 + 0.3 * Math.sin(t * 2 + v.phase);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, '#ff6a2a', v.x, v.y, v.r * 3.2, 0.35 * pulse);
      drawGlow(ctx, '#ffd27a', v.x, v.y, v.r * 1.1, 0.55 * pulse);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#1a0a08';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const rr = v.r * (0.55 + 0.15 * Math.sin(i * 2.7 + v.phase));
        if (i === 0) ctx.moveTo(v.x + Math.cos(a) * rr, v.y + Math.sin(a) * rr); else ctx.lineTo(v.x + Math.cos(a) * rr, v.y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,150,60,${0.6 * pulse})`;
      ctx.lineWidth = v.r * 0.06;
      ctx.stroke();
      // rising shimmer
      if (Math.random() < dt * 8) this.fx.bubbles(v.x + rand(-v.r, v.r) * 0.4, v.y, 1, v.r * 0.4);
    }

    // dry land (Era VI)
    if (env.land) this.drawLand(game, minX, minY, maxX, maxY);

    // rocks
    for (const r of env.rocks) {
      if (r.x + r.r < minX || r.x - r.r > maxX || r.y + r.r < minY || r.y - r.r > maxY) continue;
      const g = ctx.createRadialGradient(r.x - r.r * 0.35, r.y - r.r * 0.45, r.r * 0.1, r.x, r.y, r.r * 1.05);
      const dry = env.land && env.isLand(r.x, r.y);
      g.addColorStop(0, dry ? 'rgba(170,165,150,0.98)' : 'rgba(70,110,120,0.95)');
      g.addColorStop(0.55, dry ? 'rgba(105,98,84,0.98)' : 'rgba(22,42,52,0.97)');
      g.addColorStop(1, dry ? 'rgba(58,52,44,0.98)' : 'rgba(6,14,20,0.98)');
      ctx.fillStyle = g;
      ctx.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const rr = r.r * (0.92 + 0.08 * Math.sin(a * 3 + r.seed) + 0.04 * Math.sin(a * 7 + r.seed * 2));
        const px = r.x + Math.cos(a) * rr, py = r.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(160,230,220,0.18)';
      ctx.lineWidth = r.r * 0.03;
      ctx.stroke();
      // lichen speckles
      ctx.fillStyle = 'rgba(120,255,200,0.16)';
      for (let i = 0; i < 6; i++) {
        const a = r.seed + i * 1.3, d = r.r * (0.3 + (i * 0.13) % 0.5);
        ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d, r.r * 0.05, 0, TAU); ctx.fill();
      }
    }

    // nutrients
    ctx.globalCompositeOperation = 'lighter';
    for (const n of game.world.nutrients) {
      if (!n.active || n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) continue;
      const fade = n.absorbT >= 0 ? 1 - n.absorbT : Math.min(1, n.life * 2);
      const tw = 0.75 + 0.25 * Math.sin(n.phase * 3);
      if (n.kind === 'dna') {
        drawGlow(ctx, '#ffd166', n.x, n.y, n.r * 4, 0.6 * fade * tw);
      } else if (n.kind === 'rich') {
        drawGlow(ctx, '#b8ffe0', n.x, n.y, n.r * 3.4, 0.55 * fade * tw);
      } else if (n.kind === 'scrap') {
        drawGlow(ctx, '#ffc2a8', n.x, n.y, n.r * 3, 0.45 * fade * tw);
      } else {
        drawGlow(ctx, env.land && env.isLand(n.x, n.y) ? '#e6ff9a' : '#8cffe6', n.x, n.y, n.r * 3, 0.42 * fade * tw);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const n of game.world.nutrients) {
      if (!n.active || n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) continue;
      const fade = n.absorbT >= 0 ? 1 - n.absorbT : Math.min(1, n.life * 2);
      if (n.kind === 'dna') {
        // tiny double helix
        ctx.strokeStyle = rgba('#ffe7a0', 0.95 * fade);
        ctx.lineWidth = n.r * 0.28;
        const rot = n.phase * 2;
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const u = k / 10 * 2 - 1;
          const px = n.x + u * n.r * 1.1, py = n.y + Math.sin(u * 3 + rot) * n.r * 0.6;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.moveTo(n.x - n.r * 1.1, n.y + Math.sin(-3 + rot + Math.PI) * n.r * 0.6);
        for (let k = 0; k <= 10; k++) {
          const u = k / 10 * 2 - 1;
          ctx.lineTo(n.x + u * n.r * 1.1, n.y + Math.sin(u * 3 + rot + Math.PI) * n.r * 0.6);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(n.kind === 'scrap' ? '#ffe2d0' : '#e8fff9', 0.9 * fade);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.55, 0, TAU); ctx.fill();
      }
    }

    // organisms
    const vis = this.visible;
    vis.length = 0;
    for (const o of game.world.organisms) {
      if (!o.alive) continue;
      const ext = o.r * 3;
      if (o.x + ext < minX || o.x - ext > maxX || o.y + ext < minY || o.y - ext > maxY) continue;
      vis.push(o);
    }
    vis.sort((a, b) => a.r - b.r);
    const p = game.player;
    for (const o of vis) {
      const dying = o.dyingT >= 0;
      const scale = dying ? 1 - o.dyingT * 0.85 : 1;
      const alpha = dying ? 1 - o.dyingT * 0.6 : 1;
      const spd = Math.hypot(o.vx, o.vy) / (o.sp.speed || 1);
      const screenR = o.r * z;
      // indicators: hunting threat halo / edible hint
      if (!dying && p.alive && game.state !== 'title') {
        const dd = Math.hypot(o.x - p.x, o.y - p.y);
        if (dd < p.r * 9 + o.r) {
          if (game.isThreat(o)) {
            const hunting = o.targetIsPlayer && o.mode === 'hunt';
            const pulse = 0.5 + 0.5 * Math.sin(this.time * (hunting ? 9 : 4));
            ctx.strokeStyle = `rgba(255,70,90,${(hunting ? 0.55 : 0.22) + pulse * 0.25 + o.windupT * 1.2})`;
            ctx.lineWidth = Math.max(1.5 / z, o.r * 0.06);
            ctx.setLineDash([o.r * 0.35, o.r * 0.2]);
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.45 + pulse * o.r * 0.08, this.time * 0.8, this.time * 0.8 + TAU); ctx.stroke();
            ctx.setLineDash([]);
          } else if (game.canEat(o) === 'ok' && dd < p.r * 6 + o.r) {
            ctx.strokeStyle = 'rgba(170,255,230,0.28)';
            ctx.lineWidth = Math.max(1 / z, o.r * 0.05);
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.35, 0, TAU); ctx.stroke();
          }
        }
      }
      drawOrganism(ctx, o.sp.look, o.x, o.y, o.r * scale, {
        seed: o.seed, t: t + o.phase, speed: clamp(spd, 0, 1.5), alpha,
        angle: o.angle, hurt: o.hurtT > 0 ? o.hurtT * 3 : 0, flash: o.stunT > 0 ? 0.25 : 0,
        detail: screenR > 14 ? 1 : screenR > 5 ? 0.5 : 0.1, windup: o.windupT > 0 ? 1 : 0,
      });
    }

    // toxin clouds
    for (const c of game.world.clouds) {
      const k = Math.min(1, c.t * 3) * (1 - Math.max(0, c.t - c.life + 0.8) / 0.8);
      if (c.kind === 'ink') {
        // billowing pigment that swallows light
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 + c.t * 0.35;
          const d = c.r * (0.2 + 0.5 * ((i * 0.37) % 1)) * Math.min(1, c.t * 2);
          drawGlow(ctx, '#06031a', c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, c.r * 0.85, 0.75 * k);
        }
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, '#5a3aff', c.x, c.y, c.r * 1.1, 0.08 * k);
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + c.t * 0.7;
        drawGlow(ctx, '#b14dff', c.x + Math.cos(a) * c.r * 0.45, c.y + Math.sin(a) * c.r * 0.45, c.r * 0.9, 0.22 * k);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba('#e0a8ff', 0.35 * k);
      ctx.lineWidth = c.r * 0.02;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * Math.min(1, c.t * 3), 0, TAU); ctx.stroke();
    }

    // player
    if (game.state !== 'title' && (p.alive || game.state === 'dead')) this.drawPlayer(game, t);

    // fx
    this.fx.update(dt);
    this.fx.draw(ctx, z, minX, minY, maxX, maxY);

    // ───────────── overlays (screen space) ─────────────
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // foreground bokeh
    const bs = bokehSprite();
    for (const b of this.bokeh) {
      const px = mod(b.x * w * 1.4 - cx * z * b.d * 0.3, w * 1.4) - w * 0.2;
      const py = mod(b.y * h * 1.4 - cy * z * b.d * 0.3 - this.time * 4, h * 1.4) - h * 0.2;
      ctx.globalAlpha = b.a * (0.4 + light * 0.6) * (env.isLand(cx, cy) ? 0.25 : 1);
      ctx.drawImage(bs, px - b.s, py - b.s, b.s * 2, b.s * 2);
    }
    ctx.globalAlpha = 1;

    // darkness of the abyss: visibility shrinks around the player
    const dark = game.state === 'title' ? 0 : clamp(env.darkness(p.x, p.y) - p.stats.vision * 0.6, 0, 0.95);
    if (dark > 0.03) {
      const psx = w / 2 + (p.x - cx) * z, psy = h / 2 + (p.y - cy) * z;
      const vis0 = p.r * z * (2.5 + p.stats.vision * 6 + (p.stats.lure ? 3 : 0));
      const g = ctx.createRadialGradient(psx, psy, vis0, psx, psy, vis0 + Math.max(w, h) * (0.55 - dark * 0.3));
      g.addColorStop(0, 'rgba(0,2,8,0)');
      g.addColorStop(1, `rgba(0,2,8,${dark})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // bioluminescent & revealed organisms shine through the dark
      ctx.globalCompositeOperation = 'lighter';
      for (const o of vis) {
        if (o.dyingT >= 0) continue;
        const glow = (o.sp.look.glowStrength ?? 1) > 1.3 || o.revealT > 0;
        if (!glow && !game.isThreat(o)) continue;
        const ox = w / 2 + (o.x - cx) * z, oy = h / 2 + (o.y - cy) * z;
        const col = game.isThreat(o) ? '#ff4060' : o.sp.look.glow;
        const strength = o.revealT > 0 ? 0.55 : game.isThreat(o) ? 0.18 * dark : 0.45;
        drawGlow(ctx, col, ox, oy, o.r * z * 2.2, strength * dark);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);

    // danger vignette
    const hurt = clamp(p.hurtT * 2.5, 0, 1);
    this.hurtFlash = damp(this.hurtFlash, hurt, 10, dt);
    const dangerA = Math.max(this.hurtFlash * 0.55, game.danger * 0.28 * (0.75 + 0.25 * Math.sin(this.time * 7)), p.energy <= 0 ? 0.3 + 0.15 * Math.sin(this.time * 6) : 0, p.hp < p.maxHp * 0.25 ? 0.2 + 0.1 * Math.sin(this.time * 5) : 0);
    if (dangerA > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(255,30,60,0)');
      g.addColorStop(1, `rgba(255,30,60,${dangerA})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // evolution flash
    if (this.evolveFlash > 0) {
      this.evolveFlash = Math.max(0, this.evolveFlash - dt * 1.2);
      ctx.fillStyle = `rgba(220,255,245,${this.evolveFlash * 0.6})`;
      ctx.fillRect(0, 0, w, h);
    }

    // sensory indicators at the screen edge
    if (p.stats.sense > 0 && p.alive && game.state !== 'title') {
      const psx = w / 2 + (p.x - cx) * z, psy = h / 2 + (p.y - cy) * z;
      const pad = 34;
      const drawArrow = (wx: number, wy: number, color: string, strength: number) => {
        const ox = w / 2 + (wx - cx) * z, oy = h / 2 + (wy - cy) * z;
        if (ox > pad && ox < w - pad && oy > pad && oy < h - pad) return;
        const a = Math.atan2(oy - psy, ox - psx);
        // clamp to screen rect
        const dx = Math.cos(a), dy = Math.sin(a);
        const kx = dx > 0 ? (w - pad - psx) / dx : (pad - psx) / dx;
        const ky = dy > 0 ? (h - pad - psy) / dy : (pad - psy) / dy;
        const k = Math.min(Math.abs(kx), Math.abs(ky));
        const ax = psx + dx * k, ay = psy + dy * k;
        ctx.save();
        ctx.translate(ax, ay); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, color, 0, 0, 22, 0.5 * strength);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgba(color, 0.9 * strength);
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      for (const th of game.threats) drawArrow(th.x, th.y, '#ff4f6a', clamp(1 - th.d / (p.r * p.stats.sense), 0.35, 1));
      for (const rv of game.revealed) drawArrow(rv.x, rv.y, '#ffd166', 0.8);
    }
  }

  private drawPlayer(game: Game, t: number) {
    const ctx = this.ctx, p = game.player, z = this.cam.zoom;
    const look = p.look;
    const spd = clamp(Math.hypot(p.vx, p.vy) / (p.maxSpeed || 1), 0, 1.6);
    const deadK = p.alive ? 1 : 0;
    // trailing stinging tentacles
    if (p.stats.tentacles && p.trail.length > 4) {
      ctx.lineCap = 'round';
      for (let i = 0; i < p.stats.tentacles; i++) {
        const off = ((i + 0.5) / p.stats.tentacles - 0.5) * p.r * 1.4;
        ctx.strokeStyle = rgba(look.membrane, 0.5);
        ctx.lineWidth = Math.max(1 / z, p.r * 0.06);
        ctx.beginPath();
        for (let k = 0; k < p.trail.length; k += 2) {
          const tp = p.trail[k];
          const u = k / p.trail.length;
          const a = p.angle + Math.PI / 2;
          const wav = Math.sin(t * 5 + i * 1.3 + k * 0.4) * p.r * 0.25 * u;
          const px = tp.x + Math.cos(a) * (off + wav) - Math.cos(p.angle) * p.r * (0.6 + u * 1.6);
          const py = tp.y + Math.sin(a) * (off + wav) - Math.sin(p.angle) * p.r * (0.6 + u * 1.6);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    // colony satellites
    for (const s of p.satellites) {
      if (!s.alive) {
        ctx.strokeStyle = rgba(look.membrane, 0.2);
        ctx.lineWidth = 1 / z;
        ctx.beginPath(); ctx.arc(s.x, s.y, p.r * 0.2, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = rgba(look.membrane, 0.25);
      ctx.lineWidth = Math.max(1 / z, p.r * 0.04);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      drawOrganism(ctx, { ...look, flagella: 0, spikes: 0, receptors: 0, tentacles: 0, cells: 0, pores: 0, chloro: Math.min(2, look.chloro || 0), mito: 0, vesicles: 0, lure: 0, groove: false, eyespot: false, elong: 0, taper: 0, slipper: 0, lobes: 0 }, s.x, s.y, p.r * 0.36, { seed: s.a * 10, t, speed: 0, angle: s.a, detail: 0.5 });
    }
    // pulse wave
    if (p.pulseT >= 0) {
      const k = p.pulseT / 1.2;
      ctx.strokeStyle = rgba('#fff4c0', 0.6 * (1 - k));
      ctx.lineWidth = p.r * 0.15 * (1 - k) + 1 / z;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 15), 0, TAU); ctx.stroke();
    }
    // engulf reach
    if (p.strikeT > 0) {
      ctx.strokeStyle = rgba('#ffe0c0', 0.5 * (p.strikeT / 0.55));
      ctx.lineWidth = p.r * 0.08;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.5, p.angle - 0.8, p.angle + 0.8); ctx.stroke();
    }
    if (p.engulfT > 0) {
      ctx.strokeStyle = rgba(look.membrane, 0.35 * (p.engulfT / 0.9));
      ctx.lineWidth = p.r * 0.05;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.45, 0, TAU); ctx.stroke();
    }
    const transform = p.transformT >= 0 ? Math.sin(Math.min(1, p.transformT / 1.6) * Math.PI) : 0;
    drawOrganism(ctx, look, p.x, p.y, p.r * (1 + transform * 0.12), {
      seed: 3.7, t, speed: spd, angle: p.angle, alpha: deadK ? (p.hiddenT > 0 || (p.stats.stealth > 0 && p.stillT > 0.6) ? 0.55 : 1) : 0.35,
      hurt: p.hurtT > 0 ? p.hurtT * 2.5 : 0, flash: transform * 0.8, engulf: p.engulfT > 0 ? 1 : 0,
      harden: p.hardenT > 0 ? 0.6 + 0.4 * Math.sin(t * 12) : 0, pulse: Math.max(p.eatPulse, p.growPulse), detail: 1,
    });
    // subtle self-highlight ring so the player is always findable
    ctx.strokeStyle = 'rgba(230,255,250,0.10)';
    ctx.lineWidth = 1.2 / z;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.9, 0, TAU); ctx.stroke();
  }

  /** Shoreline, beach and ground cover for Era VI. */
  private drawLand(game: Game, minX: number, minY: number, maxX: number, maxY: number) {
    const ctx = this.ctx, env = game.env, t = env.time;
    const k = env.scale;
    const pad = (maxX - minX) * 0.1;
    const x0 = minX - pad, x1 = maxX + pad;
    const n = 64;
    const xs: number[] = [], ys: number[] = [];
    let anyVisible = false;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = env.coastY(x);
      xs.push(x); ys.push(y);
      if (y > minY) anyVisible = true;
    }
    const [ix, iy] = env.island;
    const ir = env.island[2] * 1.25;
    const islandVisible = ix + ir > minX && ix - ir < maxX && iy + ir > minY && iy - ir < maxY;
    if (!anyVisible && !islandVisible) return;

    const band = 120 * k;
    const groundPath = () => {
      ctx.beginPath();
      if (anyVisible) {
        ctx.moveTo(x0, minY - pad);
        for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], ys[i]);
        ctx.lineTo(x1, minY - pad);
        ctx.closePath();
      }
      if (islandVisible) {
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * TAU;
          const rr = env.islandRadius(a);
          const px = ix + Math.cos(a) * rr, py = iy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    };
    const coastStroke = () => {
      ctx.beginPath();
      if (anyVisible) for (let i = 0; i <= n; i++) { if (i === 0) ctx.moveTo(xs[i], ys[i]); else ctx.lineTo(xs[i], ys[i]); }
      if (islandVisible) {
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * TAU;
          const rr = env.islandRadius(a);
          const px = ix + Math.cos(a) * rr, py = iy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
    };

    // waves lapping on the water side
    for (let w = 0; w < 3; w++) {
      const ph = (t * 0.35 + w / 3) % 1;
      ctx.save();
      ctx.translate(0, ph * band * 0.9);
      coastStroke();
      ctx.strokeStyle = `rgba(230,255,250,${0.32 * (1 - ph)})`;
      ctx.lineWidth = band * 0.12 * (1 - ph * 0.5);
      ctx.stroke();
      ctx.restore();
    }
    // shallow turquoise water hugging the shore
    coastStroke();
    ctx.strokeStyle = 'rgba(120,230,220,0.18)';
    ctx.lineWidth = band * 2.2;
    ctx.stroke();

    // ground
    groundPath();
    const midCoast = anyVisible ? ys[n >> 1] : iy;
    const g = ctx.createLinearGradient(0, midCoast, 0, midCoast - (maxY - minY) * 1.2);
    g.addColorStop(0, '#6f7f4f');
    g.addColorStop(0.25, '#466a3a');
    g.addColorStop(1, '#22381f');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    groundPath();
    ctx.clip();
    // beach and wet sand inside the land
    coastStroke();
    ctx.strokeStyle = '#d8c79a';
    ctx.lineWidth = band * 1.6;
    ctx.stroke();
    coastStroke();
    ctx.strokeStyle = '#a8966a';
    ctx.lineWidth = band * 0.5;
    ctx.stroke();
    // ground cover: moss tufts, pebbles and sprigs on a deterministic grid
    const C = 150 * k;
    const cx0 = Math.floor(minX / C), cx1 = Math.ceil(maxX / C);
    const cy0 = Math.floor(minY / C), cy1 = Math.ceil(maxY / C);
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gy = cy0; gy <= cy1; gy++) {
        const h = hash2(gx, gy);
        if (h < 0.35) continue;
        const px = (gx + hash2(gy, gx * 3)) * C, py = (gy + hash2(gx * 7, gy)) * C;
        if (!env.isLand(px, py)) continue;
        const beach = py > env.coastY(px) - band * 1.6 && py < env.coastY(px) + 1;
        const s2 = C * (0.12 + h * 0.18);
        if (beach || h < 0.5) {
          ctx.fillStyle = beach ? 'rgba(120,105,80,0.55)' : 'rgba(150,160,150,0.45)';
          ctx.beginPath(); ctx.ellipse(px, py, s2 * 0.6, s2 * 0.4, h * 6, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.beginPath(); ctx.ellipse(px - s2 * 0.15, py - s2 * 0.12, s2 * 0.2, s2 * 0.1, h * 6, 0, TAU); ctx.fill();
        } else if (h < 0.8) {
          ctx.fillStyle = 'rgba(120,180,80,0.5)';
          for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(px + Math.cos(q * 1.7 + h) * s2 * 0.5, py + Math.sin(q * 1.7 + h) * s2 * 0.4, s2 * 0.42, 0, TAU); ctx.fill(); }
          ctx.fillStyle = 'rgba(190,230,120,0.35)';
          ctx.beginPath(); ctx.arc(px - s2 * 0.2, py - s2 * 0.2, s2 * 0.25, 0, TAU); ctx.fill();
        } else {
          const sway = Math.sin(t * 1.2 + h * 10) * 0.12;
          ctx.strokeStyle = 'rgba(150,210,100,0.75)';
          ctx.lineWidth = s2 * 0.08;
          ctx.beginPath();
          for (let q = 0; q < 5; q++) {
            const a = -Math.PI / 2 + (q - 2) * 0.45 + sway;
            ctx.moveTo(px, py); ctx.quadraticCurveTo(px + Math.cos(a) * s2 * 0.6, py + Math.sin(a) * s2 * 0.4, px + Math.cos(a) * s2 * 1.2, py + Math.sin(a) * s2 * 1.1);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    // sunlit edge along the shoreline
    coastStroke();
    ctx.strokeStyle = 'rgba(255,248,220,0.35)';
    ctx.lineWidth = band * 0.08;
    ctx.stroke();
  }

  private tile(img: HTMLCanvasElement, ox: number, oy: number, alpha: number, scale: number) {
    const ctx = this.ctx, w = this.w, h = this.h;
    const s = img.width * scale;
    const x0 = -mod(ox, s), y0 = -mod(oy, s);
    ctx.globalAlpha = alpha;
    for (let x = x0; x < w; x += s) for (let y = y0; y < h; y += s) ctx.drawImage(img, x, y, s, s);
    ctx.globalAlpha = 1;
  }
}

function mod(a: number, b: number) { return ((a % b) + b) % b; }

function blend(w: Record<ZoneId, number>, f: (k: ZoneId) => string): string {
  let r = 0, g = 0, b = 0;
  for (const k of Object.keys(w) as ZoneId[]) {
    const n = parseInt(f(k).slice(1), 16);
    r += ((n >> 16) & 255) * w[k]; g += ((n >> 8) & 255) * w[k]; b += (n & 255) * w[k];
  }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}

function hash2(x: number, y: number) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
