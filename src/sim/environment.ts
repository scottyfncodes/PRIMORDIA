import { clamp, makeRng, smoothstep, TAU } from '../engine/math';

/**
 * The primordial sea: a bounded world split into ecological zones with
 * environmental fields (light, current, temperature, nutrient density).
 */
export const WORLD_W = 6000;
export const WORLD_H = 6000;

export type ZoneId = 'shallows' | 'drift' | 'thicket' | 'vents' | 'abyss' | 'land';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  blurb: string;
  /** Background tint (deep / near) */
  deep: string;
  near: string;
  light: number;
  current: number;
  nutrients: number;
  /** Rendering darkness (visibility falloff) 0..1 */
  darkness: number;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  shallows: { id: 'shallows', name: 'Sunlit Shallows', blurb: 'Warm light pierces the surface. Phototrophs flourish here.', deep: '#06324a', near: '#0f6f86', light: 1, current: 0.45, nutrients: 0.9, darkness: 0 },
  drift: { id: 'drift', name: 'The Open Drift', blurb: 'Broad currents carry life and food across the sea.', deep: '#041f36', near: '#0b4a6a', light: 0.55, current: 1, nutrients: 0.8, darkness: 0.05 },
  thicket: { id: 'thicket', name: 'Biofilm Thicket', blurb: 'Tangled mats of ancient film. Dense, slow, full of hiding prey.', deep: '#082a26', near: '#1c5a43', light: 0.45, current: 0.15, nutrients: 1.25, darkness: 0.1 },
  vents: { id: 'vents', name: 'Thermal Vents', blurb: 'Mineral heat boils from the floor. Rich food, scalding danger.', deep: '#1c0d14', near: '#5a2a1e', light: 0.25, current: 0.35, nutrients: 1.6, darkness: 0.3 },
  abyss: { id: 'abyss', name: 'The Abyssal Dark', blurb: 'Lightless and quiet. Rare luminous life drifts here, and so do hunters.', deep: '#02040c', near: '#0b1430', light: 0.04, current: 0.25, nutrients: 0.6, darkness: 0.82 },
  land: { id: 'land', name: 'The First Shores', blurb: 'Bare rock and moss under an open sky. Nothing with a backbone has ever walked here.', deep: '#2a3a24', near: '#4a6a3a', light: 1, current: 0, nutrients: 1.1, darkness: 0 },
};

const SEEDS: { x: number; y: number; z: ZoneId }[] = [
  { x: 1200, y: 700, z: 'shallows' },
  { x: 3000, y: 600, z: 'shallows' },
  { x: 4900, y: 800, z: 'shallows' },
  { x: 3000, y: 2700, z: 'drift' },
  { x: 4300, y: 2200, z: 'drift' },
  { x: 900, y: 2900, z: 'thicket' },
  { x: 1600, y: 2300, z: 'thicket' },
  { x: 4700, y: 4600, z: 'vents' },
  { x: 3800, y: 5200, z: 'vents' },
  { x: 1300, y: 5000, z: 'abyss' },
  { x: 2500, y: 5300, z: 'abyss' },
];

export interface Rock { x: number; y: number; r: number; seed: number }
export interface Vent { x: number; y: number; r: number; phase: number }
export interface Strand { x: number; y: number; len: number; angle: number; bend: number; seed: number; w: number }

export const PLAYER_SPAWN = { x: 3000, y: 1750 };

export class Environment {
  time = 0;
  /** World scale: the sea grows as the player's lineage grows (Era III+). */
  scale = 1;
  /** Era VI: the sea has a shoreline and dry land to the north. */
  land = false;
  rocks: Rock[] = [];
  vents: Vent[] = [];
  strands: Strand[] = [];
  private baseRocks: Rock[] = [];
  private baseVents: Vent[] = [];
  private baseStrands: Strand[] = [];

  get w() { return WORLD_W * this.scale; }
  get h() { return WORLD_H * this.scale; }

  constructor(seed = 1337) {
    const rng = makeRng(seed);
    // mineral grains / boulders
    let guard = 0;
    while (this.baseRocks.length < 46 && guard++ < 2000) {
      const r = 50 + rng() * rng() * 190;
      const x = 150 + rng() * (WORLD_W - 300);
      const y = 250 + rng() * (WORLD_H - 400);
      if (Math.hypot(x - PLAYER_SPAWN.x, y - PLAYER_SPAWN.y) < 600) continue;
      if (this.baseRocks.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 160)) continue;
      // fewer rocks in the shallows
      if (y < 1100 && rng() < 0.7) continue;
      this.baseRocks.push({ x, y, r, seed: rng() * 1000 });
    }
    // hydrothermal vents
    for (let i = 0; i < 9; i++) {
      for (let k = 0; k < 40; k++) {
        const x = 3400 + rng() * 2400, y = 3900 + rng() * 1900;
        if (this.baseZoneAt(x, y) !== 'vents') continue;
        if (this.baseVents.some((v) => Math.hypot(v.x - x, v.y - y) < 420)) continue;
        if (this.baseRocks.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 80)) continue;
        this.baseVents.push({ x, y, r: 55 + rng() * 35, phase: rng() * TAU });
        break;
      }
    }
    // biofilm strands
    for (let i = 0; i < 260; i++) {
      const x = rng() * 2800, y = 1500 + rng() * 2800;
      if (this.baseZoneAt(x, y) !== 'thicket') continue;
      this.baseStrands.push({ x, y, len: 120 + rng() * 380, angle: rng() * TAU, bend: (rng() - 0.5) * 2, seed: rng() * 100, w: 2 + rng() * 6 });
    }
    this.setScale(1);
  }

  /** Rescale the whole sea (geography keeps its shape, everything gets bigger). */
  setScale(k: number) {
    this.scale = k;
    this.rocks = this.baseRocks.map((r) => ({ ...r, x: r.x * k, y: r.y * k, r: r.r * k }));
    this.vents = this.baseVents.map((v) => ({ ...v, x: v.x * k, y: v.y * k, r: v.r * k }));
    this.strands = this.baseStrands.map((s) => ({ ...s, x: s.x * k, y: s.y * k, len: s.len * k, w: s.w * k }));
  }

  update(dt: number) {
    this.time += dt;
  }

  private baseZoneAt(x: number, y: number): ZoneId {
    let best = SEEDS[0], bd = Infinity;
    for (const s of SEEDS) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best.z;
  }

  /** Coastline y (world units) at world x: land lies north of it. */
  coastY(x: number): number {
    const bx = x / this.scale;
    return (1450 + Math.sin(bx * 0.0011 + 0.6) * 320 + Math.sin(bx * 0.0031 + 2) * 130 + Math.sin(bx * 0.007) * 45) * this.scale;
  }
  /** Drift Isle: an island off the coast. Returns [x, y, radius] in world units. */
  get island(): [number, number, number] { return [4500 * this.scale, 2600 * this.scale, 520 * this.scale]; }
  islandRadius(angle: number): number {
    return this.island[2] * (1 + 0.12 * Math.sin(angle * 3 + 1) + 0.07 * Math.sin(angle * 7));
  }
  isLand(x: number, y: number): boolean {
    if (!this.land) return false;
    if (y < this.coastY(x)) return true;
    const [ix, iy] = this.island;
    const dx = x - ix, dy = y - iy;
    const d2 = dx * dx + dy * dy;
    const rmax = this.island[2] * 1.2;
    if (d2 > rmax * rmax) return false;
    return Math.sqrt(d2) < this.islandRadius(Math.atan2(dy, dx));
  }

  /** Voronoi zone lookup. */
  zoneAt(x: number, y: number): ZoneId {
    if (this.land && this.isLand(x, y)) return 'land';
    return this.baseZoneAt(x / this.scale, y / this.scale);
  }

  private baseWeights(x: number, y: number, out: Partial<Record<ZoneId, number>>) {
    for (const k of Object.keys(ZONES) as ZoneId[]) out[k] = 0;
    let total = 0;
    for (const s of SEEDS) {
      const d = Math.hypot(s.x - x, s.y - y) + 1;
      const w = 1 / Math.pow(d, 3);
      out[s.z] = (out[s.z] || 0) + w;
      total += w;
    }
    for (const k of Object.keys(out) as ZoneId[]) out[k] = (out[k] || 0) / total;
    return out as Record<ZoneId, number>;
  }

  /** Inverse-distance weighted zone blend, used for smooth ambient colour. */
  zoneWeights(x: number, y: number, out: Partial<Record<ZoneId, number>> = {}) {
    return this.baseWeights(x / this.scale, y / this.scale, out);
  }

  /** Light availability 0..1 (depth gradient × zone × drifting light shafts). */
  light(x: number, y: number): number {
    if (this.land && this.isLand(x, y)) return 1;
    x /= this.scale; y /= this.scale;
    const depth = clamp(1.15 - y / (WORLD_H * 0.62), 0.03, 1);
    const w = this.baseWeights(x, y, this._zw);
    let zl = 0;
    for (const k in w) zl += w[k as ZoneId] * ZONES[k as ZoneId].light;
    const shaft = y < 2600 ? 0.18 * Math.max(0, Math.sin(x * 0.0021 + this.time * 0.07) * Math.sin(x * 0.0007 - this.time * 0.03)) : 0;
    return clamp(depth * 0.55 + zl * 0.55 + shaft, 0, 1) * (0.25 + zl * 0.75);
  }
  private _zw: Partial<Record<ZoneId, number>> = {};

  /** Water current vector at a point (units / s). */
  current(x: number, y: number, out: { x: number; y: number }) {
    if (this.land && this.isLand(x, y)) { out.x = 0; out.y = 0; return out; }
    x /= this.scale; y /= this.scale;
    const t = this.time;
    const w = this.baseWeights(x, y, this._zw);
    let strength = 0;
    for (const k in w) strength += w[k as ZoneId] * ZONES[k as ZoneId].current;
    // a meandering eastward gyre with swirls
    const a = Math.sin(y * 0.0011 + t * 0.05) * 1.2 + Math.cos(x * 0.0009 - t * 0.04) * 0.8;
    const s = 22 * strength * this.scale;
    out.x = Math.cos(a) * s + 10 * strength * this.scale;
    out.y = Math.sin(a) * s * 0.6;
    return out;
  }

  /** Heat 0..1 near vents. */
  heat(x: number, y: number): number {
    let h = 0;
    for (const v of this.vents) {
      const d = Math.hypot(v.x - x, v.y - y);
      if (d < v.r * 3) h = Math.max(h, 1 - smoothstep(v.r * 0.5, v.r * 3, d));
    }
    return h;
  }

  /** Thicket density 0..1 (slows non-ciliated movement). */
  density(x: number, y: number): number {
    if (this.land && this.isLand(x, y)) return 0;
    const w = this.zoneWeights(x, y, this._zw);
    return smoothstep(0.35, 0.8, w.thicket || 0);
  }

  darkness(x: number, y: number): number {
    if (this.land && this.isLand(x, y)) return 0;
    const w = this.zoneWeights(x, y, this._zw);
    let d = 0;
    for (const k in w) d += w[k as ZoneId] * ZONES[k as ZoneId].darkness;
    return clamp(d + smoothstep(3800, 6000, y / this.scale) * 0.25, 0, 0.92);
  }
}
