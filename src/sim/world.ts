import { clamp, rand, TAU, weightedPick, dist2 } from '../engine/math';
import { SpatialGrid } from '../engine/spatial';
import { Environment, ZONES, type ZoneId } from './environment';
import { Nutrient, Organism, type Body } from './entities';
import { SPECIES, type SpeciesDef } from './species';
import type { EraDef } from '../game/eras';

/** What the ecosystem needs to know about the player. */
export interface PlayerLike extends Body {
  alive: boolean;
  /** largest radius ratio the player can currently swallow */
  threatRatio: number;
  predatorDeter: number;
  detectability: number;
  lure: number;
  hidden: boolean;
  /** multiplies predator wind-up time against the player (eyes / lateral line) */
  reaction: number;
}

export interface ToxinCloud { x: number; y: number; r: number; t: number; life: number; dps: number; kind: 'toxin' | 'ink' }

export type WorldEvent =
  | { type: 'npcEat'; x: number; y: number; r: number }
  | { type: 'npcDie'; x: number; y: number; r: number; sp: SpeciesDef; byToxin: boolean };

const MAX_ORGANISMS = 140;
const MAX_NUTRIENTS = 420;

/** Can predator `a` swallow `b`? (NPC rules) */
export function npcCanEat(a: Organism, b: Organism): boolean {
  if (a.sp.diet !== 'prey' && a.sp.diet !== 'both') return false;
  if (b.sp.id === a.sp.id) return false;
  const ratio = a.sp.category === 'predator' ? 0.85 : 0.6;
  if (b.r > a.r * ratio) return false;
  if (b.sp.defenses.includes('spiny') && b.r > a.r * 0.4) return false;
  if (b.sp.defenses.includes('shelled') && b.r > a.r * 0.5 && a.sp.id !== 'chaos' && a.sp.id !== 'lurker') return false;
  return true;
}

export class World {
  env: Environment;
  organisms: Organism[] = [];
  nutrients: Nutrient[] = [];
  clouds: ToxinCloud[] = [];
  grid: SpatialGrid<Organism>;
  ngrid: SpatialGrid<Nutrient>;
  events: WorldEvent[] = [];
  era!: EraDef;
  time = 0;
  /** seconds since run start, used to ramp danger */
  runTime = 0;
  private nextId = 1;
  private spawnT = 0;
  private tmp: Organism[] = [];
  private tmpN: Nutrient[] = [];
  private cur = { x: 0, y: 0 };
  maxOrgR = 140;
  /** center of the active simulation bubble (camera / player) */
  cx = 0; cy = 0;
  viewR = 400;

  constructor(env: Environment) {
    this.env = env;
    this.grid = new SpatialGrid<Organism>(env.w, env.h, 160 * env.scale);
    this.ngrid = new SpatialGrid<Nutrient>(env.w, env.h, 120 * env.scale);
    for (let i = 0; i < MAX_ORGANISMS; i++) this.organisms.push(new Organism());
    for (let i = 0; i < MAX_NUTRIENTS; i++) this.nutrients.push(new Nutrient());
  }

  /** Rebuild spatial grids after the sea is rescaled. */
  private rebuildGrids() {
    const env = this.env;
    if (this.grid.width !== env.w) {
      this.grid = new SpatialGrid<Organism>(env.w, env.h, 160 * env.scale);
      this.ngrid = new SpatialGrid<Nutrient>(env.w, env.h, 120 * env.scale);
    }
    let m = 0;
    for (const sp of SPECIES) if (sp.eras.includes(this.era.index)) m = Math.max(m, sp.size[1]);
    this.maxOrgR = m + 10;
  }

  /** Clear all life (used when the sea is rescaled between eras). */
  clearLife() {
    for (const o of this.organisms) o.alive = false;
    for (const n of this.nutrients) n.active = false;
    this.clouds.length = 0;
  }

  reset(era: EraDef) {
    this.era = era;
    this.rebuildGrids();
    for (const o of this.organisms) o.alive = false;
    for (const n of this.nutrients) n.active = false;
    this.clouds.length = 0;
    this.events.length = 0;
    this.runTime = 0;
  }

  setEra(era: EraDef) {
    this.era = era;
    this.rebuildGrids();
    // Out-scaled life slowly thins out naturally through despawn; cull tiny motes now.
    for (const n of this.nutrients) if (n.active && n.r < era.nutrientR * 0.5) n.active = false;
  }

  get activeRadius() { return this.viewR * 1.7; }

  // ───────────────────────── spawning ─────────────────────────
  spawnOrganism(sp: SpeciesDef, x: number, y: number, r?: number): Organism | null {
    const o = this.organisms.find((q) => !q.alive);
    if (!o) return null;
    o.id = this.nextId++;
    o.sp = sp;
    o.x = x; o.y = y;
    o.r = r ?? rand(sp.size[0], sp.size[1]);
    o.vx = 0; o.vy = 0;
    o.angle = rand(0, TAU);
    o.maxHp = sp.hp * (o.r / ((sp.size[0] + sp.size[1]) / 2));
    o.hp = o.maxHp;
    o.alive = true;
    o.seed = Math.random() * 1000;
    o.phase = Math.random() * TAU;
    o.mode = 'wander';
    o.target = null; o.targetIsPlayer = false;
    o.thinkT = Math.random() * 0.2;
    o.wanderA = rand(0, TAU);
    o.satiety = rand(0, 4);
    o.huntT = 0; o.restT = 0; o.windupT = 0; o.lungeT = 0; o.lungeCd = rand(0.5, 2);
    o.stunT = 0; o.biteCd = 0; o.hurtT = 0; o.revealT = 0;
    o.anchorX = x; o.anchorY = y;
    o.dyingT = -1; o.eater = null; o.eatenByPlayer = false; o.onScreen = false;
    return o;
  }

  spawnNutrient(x: number, y: number, kind: Nutrient['kind'] = 'mote', scale = 1): Nutrient | null {
    let n: Nutrient | undefined;
    for (const q of this.nutrients) if (!q.active) { n = q; break; }
    if (!n) return null;
    const e = this.era;
    n.active = true;
    n.kind = kind;
    n.x = x; n.y = y;
    n.vx = rand(-4, 4); n.vy = rand(-4, 4);
    n.absorbT = -1;
    n.life = 0;
    if (kind === 'dna') {
      n.r = e.nutrientR * 1.25; n.energy = e.nutrientEnergy * 0.5; n.growth = 0.5; n.dna = e.index === 1 ? 2 : 1;
    } else if (kind === 'rich') {
      n.r = e.nutrientR * 1.5; n.energy = e.nutrientEnergy * 2.4; n.growth = 2.2; n.dna = 0;
    } else if (kind === 'scrap') {
      n.r = e.nutrientR * scale; n.energy = e.nutrientEnergy * 1.2 * scale; n.growth = 1.2 * scale; n.dna = 0;
    } else {
      n.r = e.nutrientR * rand(0.8, 1.15); n.energy = e.nutrientEnergy; n.growth = 1; n.dna = 0;
    }
    return n;
  }

  /** Species spawn weight at a location given era & danger ramp. */
  speciesWeight(sp: SpeciesDef, zone: ZoneId, nearVent: boolean): number {
    if (!sp.eras.includes(this.era.index)) return 0;
    if (sp.ventBound && !nearVent) return 0;
    let w = (sp.zones[zone] || 0) * sp.weight;
    // older-era life persists but thins out as the player outgrows it
    if (sp.eras[0] < this.era.index) w *= 0.45;
    if (sp.category === 'predator') {
      // no predators in the first seconds; ramp up over the first minutes
      const ramp = this.era.index === 1 ? clamp((this.runTime - 14) / 70, 0, 1) : 1;
      w *= ramp;
    }
    return w;
  }

  private ringPoint(minR: number, maxR: number) {
    const a = rand(0, TAU);
    const d = rand(minR, maxR);
    return { x: clamp(this.cx + Math.cos(a) * d, 40, this.env.w - 40), y: clamp(this.cy + Math.sin(a) * d, 40, this.env.h - 40) };
  }

  private insideRock(x: number, y: number, pad: number) {
    for (const r of this.env.rocks) if (dist2(r.x, r.y, x, y) < (r.r + pad) ** 2) return true;
    return false;
  }

  /** Initial fill when a run starts or era changes: populate the visible area too. */
  populate(avoidX: number, avoidY: number, safeR: number) {
    const target = this.era.populationTarget;
    let guard = 0;
    while (this.countAlive() < target * 0.85 && guard++ < 500) {
      const p = this.ringPoint(safeR, this.activeRadius);
      if (dist2(p.x, p.y, avoidX, avoidY) < safeR * safeR) continue;
      this.trySpawnAt(p.x, p.y, true);
    }
    guard = 0;
    while (this.countNutrients() < this.nutrientTarget() && guard++ < 800) {
      const p = this.ringPoint(0, this.activeRadius);
      if (this.insideRock(p.x, p.y, 4)) continue;
      this.spawnNutrient(p.x, p.y, Math.random() < this.era.dnaMoteChance ? 'dna' : Math.random() < 0.12 ? 'rich' : 'mote');
    }
  }

  private nutrientTarget() {
    const z = ZONES[this.env.zoneAt(this.cx, this.cy)];
    return Math.round(150 * z.nutrients);
  }

  countAlive() { let c = 0; for (const o of this.organisms) if (o.alive) c++; return c; }
  countNutrients() { let c = 0; for (const n of this.nutrients) if (n.active) c++; return c; }

  private trySpawnAt(x: number, y: number, initial = false) {
    const zone = this.env.zoneAt(x, y);
    let nearVent = false;
    let vx = x, vy = y;
    for (const v of this.env.vents) if (dist2(v.x, v.y, x, y) < (700 * this.env.scale) ** 2) { nearVent = true; vx = v.x; vy = v.y; break; }
    const sp = weightedPick(SPECIES, (s) => this.speciesWeight(s, zone, nearVent));
    if (!sp) return;
    if (sp.ventBound) { const k = 260 * this.env.scale; x = vx + rand(-k, k); y = vy + rand(-k, k); }
    if (this.insideRock(x, y, sp.size[1])) return;
    // limit concurrent apex threats so the sea stays fair
    if (sp.category === 'predator') {
      let threats = 0;
      for (const o of this.organisms) if (o.alive && o.sp.category === 'predator' && dist2(o.x, o.y, this.cx, this.cy) < this.activeRadius ** 2) threats++;
      if (threats >= (initial ? 2 : 4 + this.era.index)) return;
    }
    const schoolSize = sp.schooling > 0.5 ? 2 + Math.floor(Math.random() * 4) : 1;
    for (let i = 0; i < schoolSize; i++) {
      const ox = x + rand(-1, 1) * sp.size[1] * 4, oy = y + rand(-1, 1) * sp.size[1] * 4;
      this.spawnOrganism(sp, ox, oy);
    }
  }

  private manageSpawns() {
    const ar = this.activeRadius;
    const despawnR2 = (ar * 1.35) ** 2;
    let alive = 0;
    for (const o of this.organisms) {
      if (!o.alive) continue;
      if (o.dyingT < 0 && dist2(o.x, o.y, this.cx, this.cy) > despawnR2) { o.alive = false; continue; }
      alive++;
    }
    for (const n of this.nutrients) {
      if (n.active && dist2(n.x, n.y, this.cx, this.cy) > despawnR2) n.active = false;
    }
    const target = this.era.populationTarget;
    let tries = 0;
    while (alive < target && tries++ < 4) {
      const p = this.ringPoint(this.viewR * 1.15, ar);
      this.trySpawnAt(p.x, p.y);
      alive = this.countAlive();
    }
    // nutrients — denser in rich zones, seeded beyond view so they drift in
    const nTarget = this.nutrientTarget();
    let nc = this.countNutrients();
    tries = 0;
    while (nc < nTarget && tries++ < 12) {
      const p = this.ringPoint(this.viewR * 0.9, ar);
      if (this.insideRock(p.x, p.y, 4)) continue;
      const k = Math.random() < this.era.dnaMoteChance ? 'dna' : Math.random() < 0.1 ? 'rich' : 'mote';
      if (this.spawnNutrient(p.x, p.y, k)) nc++;
    }
  }

  // ───────────────────────── update ─────────────────────────
  update(dt: number, player: PlayerLike) {
    this.time += dt;
    this.runTime += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.25; this.manageSpawns(); }

    // vent plumes emit rich nutrients
    for (const v of this.env.vents) {
      if (dist2(v.x, v.y, this.cx, this.cy) > (this.activeRadius + 300) ** 2) continue;
      if (Math.random() < dt * 1.6) {
        const n = this.spawnNutrient(v.x + rand(-v.r, v.r) * 0.4, v.y + rand(-v.r, v.r) * 0.4, Math.random() < 0.2 ? 'rich' : 'mote');
        if (n) { n.vx = rand(-12, 12) * this.env.scale; n.vy = rand(-40, -20) * this.env.scale; }
      }
    }

    // spatial grids
    this.grid.clear();
    for (const o of this.organisms) if (o.alive && o.dyingT < 0) this.grid.insert(o);
    this.ngrid.clear();
    for (const n of this.nutrients) if (n.active && n.absorbT < 0) this.ngrid.insert(n);

    // toxin clouds
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      if (c.t > c.life) { this.clouds.splice(i, 1); continue; }
    }

    for (const o of this.organisms) {
      if (!o.alive) continue;
      if (o.dyingT >= 0) { this.updateDying(o, dt); continue; }
      this.updateOrganism(o, dt, player);
    }

    this.updateNutrients(dt);
  }

  private updateDying(o: Organism, dt: number) {
    o.dyingT += dt * (o.eatenByPlayer ? 3.2 : 2.4);
    if (o.eater) {
      const k = Math.min(1, dt * 12);
      o.x += (o.eater.x - o.x) * k;
      o.y += (o.eater.y - o.y) * k;
    }
    if (o.dyingT >= 1) o.alive = false;
  }

  private updateNutrients(dt: number) {
    const env = this.env;
    for (const n of this.nutrients) {
      if (!n.active) continue;
      n.life += dt;
      n.phase += dt;
      if (n.absorbT >= 0) {
        n.absorbT += dt * 5;
        n.x += (n.absorbX - n.x) * Math.min(1, dt * 14);
        n.y += (n.absorbY - n.y) * Math.min(1, dt * 14);
        if (n.absorbT >= 1) n.active = false;
        continue;
      }
      env.current(n.x, n.y, this.cur);
      n.vx *= Math.exp(-1.2 * dt);
      n.vy *= Math.exp(-1.2 * dt);
      n.x += (n.vx + this.cur.x * 0.8) * dt;
      n.y += (n.vy + this.cur.y * 0.8 + Math.sin(n.phase * 0.8) * 2) * dt;
      if (n.x < 10 || n.x > this.env.w - 10 || n.y < 10 || n.y > this.env.h - 10) n.active = false;
      if (n.kind === 'scrap' && n.life > 40) n.active = false;
    }
  }

  private updateOrganism(o: Organism, dt: number, p: PlayerLike) {
    const sp = o.sp;
    o.phase += dt;
    o.biteCd -= dt; o.lungeCd -= dt; o.hurtT -= dt; o.revealT -= dt; o.satiety -= dt;

    // toxin clouds damage & scatter
    for (const c of this.clouds) {
      const rr = c.r * Math.min(1, c.t * 3);
      if (dist2(c.x, c.y, o.x, o.y) < (rr + o.r) ** 2) {
        if (c.kind === 'ink') {
          // blinded: lose track of the player and blunder about
          if (o.targetIsPlayer) { o.target = null; o.targetIsPlayer = false; o.mode = 'wander'; o.restT = 3.5; o.windupT = 0; o.lungeT = 0; }
          continue;
        }
        o.hp -= c.dps * dt;
        o.hurtT = 0.15;
        o.mode = 'flee'; o.fleeX = c.x; o.fleeY = c.y; o.target = null; o.targetIsPlayer = false;
        if (o.hp <= 0) { this.kill(o, true); return; }
      }
    }

    if (o.stunT > 0) {
      o.stunT -= dt;
      o.windupT = 0; o.lungeT = 0;
    } else {
      o.thinkT -= dt;
      if (o.thinkT <= 0) { o.thinkT = 0.12 + Math.random() * 0.08; this.think(o, p); }
    }

    // desired velocity
    let dx = 0, dy = 0, speedK = 0.35;
    const stunned = o.stunT > 0;
    if (!stunned) {
      switch (o.mode) {
        case 'flee': {
          const ax = o.x - o.fleeX, ay = o.y - o.fleeY;
          const d = Math.hypot(ax, ay) || 1;
          dx = ax / d; dy = ay / d; speedK = 1;
          break;
        }
        case 'hunt':
        case 'graze':
        case 'lured': {
          const t = o.target;
          if (t) {
            const ax = t.x - o.x, ay = t.y - o.y;
            const d = Math.hypot(ax, ay) || 1;
            dx = ax / d; dy = ay / d;
            speedK = o.mode === 'hunt' ? 0.82 : o.mode === 'lured' ? 0.45 : 0.6;
            // lunge mechanics — telegraphed wind-up, then a strike
            if (o.mode === 'hunt' && sp.lunge && o.lungeCd <= 0 && o.windupT <= 0 && o.lungeT <= 0 && d < o.r * 4.5 + t.r) {
              o.windupT = 0.38 * (o.targetIsPlayer ? p.reaction : 1);
            }
          }
          break;
        }
        case 'school':
        case 'wander':
        default: {
          o.wanderA += (Math.random() - 0.5) * dt * 2.2;
          dx = Math.cos(o.wanderA); dy = Math.sin(o.wanderA);
          speedK = sp.sessile ? 0 : 0.32;
          break;
        }
      }
      if (o.windupT > 0) {
        o.windupT -= dt;
        speedK *= 0.25;
        if (o.windupT <= 0) { o.lungeT = 0.42; o.lungeCd = 2.6 + Math.random(); }
      }
      if (o.lungeT > 0) { o.lungeT -= dt; speedK = sp.lunge || 1; }
    }

    // sessile organisms stay near their anchor
    if (sp.sessile) {
      const ax = o.anchorX - o.x, ay = o.anchorY - o.y;
      dx = dx * 0.3 + ax * 0.02; dy = dy * 0.3 + ay * 0.02;
    }

    // rocks: steer around
    for (const r of this.env.rocks) {
      const d2 = dist2(r.x, r.y, o.x, o.y);
      const pad = Math.max(40, o.r * 2);
      const lim = r.r + o.r + pad;
      if (d2 < lim * lim) {
        const d = Math.sqrt(d2) || 1;
        const k = (1 - (d - r.r - o.r) / pad) * 1.4;
        dx += ((o.x - r.x) / d) * k; dy += ((o.y - r.y) / d) * k;
      }
    }
    // soft world bounds
    const m = 200 * this.env.scale, W = this.env.w, H = this.env.h;
    if (o.x < m) dx += (m - o.x) / m * 2; if (o.x > W - m) dx -= (o.x - (W - m)) / m * 2;
    if (o.y < m) dy += (m - o.y) / m * 2; if (o.y > H - m) dy -= (o.y - (H - m)) / m * 2;

    const dl = Math.hypot(dx, dy);
    if (dl > 1) { dx /= dl; dy /= dl; }
    // larger organisms are proportionally faster in absolute units
    const speed = sp.speed * speedK;
    const tx = dx * speed, ty = dy * speed;
    const maxDv = sp.accel * (o.lungeT > 0 ? 3 : 1) * dt;
    let ex = tx - o.vx, ey = ty - o.vy;
    const el = Math.hypot(ex, ey);
    if (el > maxDv) { ex = ex / el * maxDv; ey = ey / el * maxDv; }
    o.vx += ex; o.vy += ey;
    // drag
    const dens = this.env.density(o.x, o.y);
    const thicketNative = (sp.zones.thicket || 0) >= 1.2 || !!sp.look.cilia;
    const drag = 0.6 + (thicketNative ? 0 : dens * 2.2);
    o.vx *= Math.exp(-drag * dt);
    o.vy *= Math.exp(-drag * dt);

    this.env.current(o.x, o.y, this.cur);
    const cf = sp.sessile ? 0 : 0.7;
    o.x += (o.vx + this.cur.x * cf) * dt;
    o.y += (o.vy + this.cur.y * cf) * dt;

    const sp2 = o.vx * o.vx + o.vy * o.vy;
    if (sp2 > 4) {
      const want = Math.atan2(o.vy, o.vx);
      let da = want - o.angle;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      o.angle += da * Math.min(1, dt * 6);
    }

    this.collideRocks(o);
    this.interact(o, dt);
  }

  collideRocks(b: Body) {
    for (const r of this.env.rocks) {
      const dx = b.x - r.x, dy = b.y - r.y;
      const min = r.r + b.r * 0.85;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d, ny = dy / d;
        b.x = r.x + nx * min; b.y = r.y + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= vn * nx * 1.5; b.vy -= vn * ny * 1.5; }
      }
    }
    b.x = clamp(b.x, b.r, this.env.w - b.r);
    b.y = clamp(b.y, b.r, this.env.h - b.r);
  }

  private think(o: Organism, p: PlayerLike) {
    const sp = o.sp;
    if (o.restT > 0) { o.restT -= 0.15; }
    const sight = o.r * sp.sight;
    const near = this.grid.query(o.x, o.y, sight, this.tmp, this.maxOrgR);

    // 1. threats
    let threat: Body | null = null, td = Infinity;
    const fearR = sight * (0.4 + sp.fear * 0.6);
    if (sp.fear > 0) {
      for (const q of near) {
        if (q === o || q.dyingT >= 0) continue;
        if (!npcCanEat(q, o)) continue;
        const d = dist2(q.x, q.y, o.x, o.y);
        if (d < fearR * fearR && d < td) { td = d; threat = q; }
      }
      if (p.alive && !p.hidden && o.r <= p.r * p.threatRatio) {
        const d = dist2(p.x, p.y, o.x, o.y);
        const pr = fearR * (p.lure > 0 && o.r < p.r * 0.6 ? 0.25 : 1);
        if (d < pr * pr && d < td) { td = d; threat = p; }
      }
    }
    if (threat) {
      o.mode = 'flee'; o.fleeX = threat.x; o.fleeY = threat.y; o.target = null; o.targetIsPlayer = false;
      return;
    }

    // 2. lure (bioluminescence) pulls small, non-predatory life toward the player
    if (p.alive && p.lure > 0 && sp.category !== 'predator' && o.r < p.r * 0.6) {
      const lr = p.r * p.lure;
      if (dist2(p.x, p.y, o.x, o.y) < lr * lr) { o.mode = 'lured'; o.target = p; o.targetIsPlayer = true; return; }
    }

    // 3. hunting
    const hunts = (sp.diet === 'prey' || sp.diet === 'both') && sp.aggression > 0 && o.satiety <= 0 && o.restT <= 0;
    if (hunts) {
      // keep existing player hunt for a while, then give up (fairness)
      if (o.mode === 'hunt' && o.targetIsPlayer) {
        o.huntT += 0.15;
        if (o.huntT > 9 || !p.alive || p.hidden) { o.mode = 'wander'; o.target = null; o.targetIsPlayer = false; o.restT = 3.5; o.huntT = 0; return; }
        const giveUp = sight * 1.6 * p.detectability;
        if (dist2(p.x, p.y, o.x, o.y) > giveUp * giveUp) { o.mode = 'wander'; o.target = null; o.targetIsPlayer = false; return; }
        return;
      }
      let best: Body | null = null, bd = Infinity, isPlayer = false;
      for (const q of near) {
        if (q === o || q.dyingT >= 0 || !npcCanEat(o, q)) continue;
        const d = dist2(q.x, q.y, o.x, o.y);
        if (d < bd) { bd = d; best = q; }
      }
      // the player as prey
      if (p.alive && !p.hidden && p.r <= o.r * (sp.category === 'predator' ? 0.95 : 0.7)) {
        const pr = sight * p.detectability;
        const d = dist2(p.x, p.y, o.x, o.y);
        const keen = sp.aggression * (1 - p.predatorDeter);
        if (d < pr * pr && (d < bd * 1.4 || !best) && Math.random() < keen + 0.15) { best = p; bd = d; isPlayer = true; }
      }
      if (best) {
        o.mode = 'hunt'; o.target = best; o.targetIsPlayer = isPlayer;
        if (!isPlayer) o.huntT = 0;
        return;
      }
    }

    // 4. grazing
    if ((sp.diet === 'nutrients' || sp.diet === 'both') && o.satiety <= 0) {
      const nn = this.ngrid.query(o.x, o.y, sight * 0.8, this.tmpN, 20);
      let best: Nutrient | null = null, bd = Infinity;
      for (const n of nn) {
        const d = dist2(n.x, n.y, o.x, o.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best) { o.mode = 'graze'; o.target = best; o.targetIsPlayer = false; return; }
    }

    // 5. schooling / wandering
    if (sp.schooling > 0) {
      let ax = 0, ay = 0, n = 0;
      for (const q of near) {
        if (q === o || q.sp !== sp) continue;
        ax += Math.cos(q.angle) + (q.x - o.x) * 0.01;
        ay += Math.sin(q.angle) + (q.y - o.y) * 0.01;
        n++;
      }
      if (n > 0) {
        const target = Math.atan2(ay, ax);
        let da = target - o.wanderA;
        while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        o.wanderA += da * sp.schooling * 0.5;
      }
    }
    o.mode = o.mode === 'school' ? 'school' : 'wander';
    o.target = null; o.targetIsPlayer = false;
  }

  /** NPC ↔ NPC / nutrient contacts. */
  private interact(o: Organism, dt: number) {
    // grazing
    if (o.mode === 'graze' && o.target) {
      const n = o.target as Nutrient;
      if (!n.active || n.absorbT >= 0) { o.target = null; o.mode = 'wander'; }
      else if (dist2(n.x, n.y, o.x, o.y) < (o.r + n.r) ** 2) {
        n.absorbT = 0; n.absorbX = o.x; n.absorbY = o.y;
        o.satiety = 1.5 + Math.random() * 2;
        o.target = null; o.mode = 'wander';
      }
    }
    // predation
    if (o.mode === 'hunt' && o.target && !o.targetIsPlayer) {
      const t = o.target as Organism;
      if (!t.alive || t.dyingT >= 0) { o.target = null; o.mode = 'wander'; }
      else if (dist2(t.x, t.y, o.x, o.y) < (o.r + t.r * 0.4) ** 2) {
        t.dyingT = 0; t.eater = o; t.eatenByPlayer = false;
        o.satiety = 5 + Math.random() * 6;
        o.target = null; o.mode = 'wander';
        // messy eaters leave scraps for opportunists
        const scraps = 1 + Math.floor(t.r / (this.era.nutrientR * 3));
        for (let i = 0; i < Math.min(scraps, 4); i++) {
          const n = this.spawnNutrient(t.x + rand(-t.r, t.r), t.y + rand(-t.r, t.r), 'scrap', 1);
          if (n) { n.vx = rand(-30, 30); n.vy = rand(-30, 30); }
        }
        this.events.push({ type: 'npcEat', x: t.x, y: t.y, r: t.r });
      }
    }
    // separation (cheap, only same-size-ish neighbours)
    const near = this.grid.query(o.x, o.y, o.r * 1.2, this.tmp, this.maxOrgR);
    for (const q of near) {
      if (q === o || q.dyingT >= 0) continue;
      const dx = o.x - q.x, dy = o.y - q.y;
      const min = (o.r + q.r) * 0.85;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        if ((o.mode === 'hunt' && o.target === q) || (q.mode === 'hunt' && q.target === o)) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const mo = o.r * o.r, mq = q.r * q.r;
        const wo = mq / (mo + mq);
        o.x += (dx / d) * push * wo * 2 * Math.min(1, dt * 20);
        o.y += (dy / d) * push * wo * 2 * Math.min(1, dt * 20);
      }
    }
  }

  kill(o: Organism, byToxin: boolean) {
    o.dyingT = 0; o.eater = null; o.eatenByPlayer = false;
    const parts = Math.min(7, 2 + Math.floor(o.r / (this.era.nutrientR * 2)));
    for (let i = 0; i < parts; i++) {
      const n = this.spawnNutrient(o.x + rand(-o.r, o.r) * 0.6, o.y + rand(-o.r, o.r) * 0.6, i === 0 && o.sp.dna >= 8 ? 'dna' : 'scrap', 1.3);
      if (n) { n.vx = rand(-50, 50); n.vy = rand(-50, 50); if (n.kind === 'dna') n.dna = Math.max(1, Math.round(o.sp.dna * (this.era.index === 1 ? 0.6 : 0.3))); }
    }
    this.events.push({ type: 'npcDie', x: o.x, y: o.y, r: o.r, sp: o.sp, byToxin });
  }

  addCloud(x: number, y: number, r: number, dps: number, kind: 'toxin' | 'ink' = 'toxin') {
    this.clouds.push({ x, y, r, t: 0, life: kind === 'ink' ? 4.2 : 3.4, dps, kind });
  }

  queryOrganisms(x: number, y: number, r: number, out: Organism[]) {
    return this.grid.query(x, y, r, out, this.maxOrgR);
  }
  queryNutrients(x: number, y: number, r: number, out: Nutrient[]) {
    return this.ngrid.query(x, y, r, out, 20);
  }
}
