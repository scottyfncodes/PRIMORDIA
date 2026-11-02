import { clamp, mixHex, TAU } from '../engine/math';
import { baseLook, type Look } from '../render/look';
import { ARCHETYPE_PALETTE, BASE_PALETTE, ERAS, formFor, type EraDef, type FormDef } from './eras';
import { archetypeWeights, deriveStats, dominantArchetype, TRAIT_BY_ID, type AbilityId, type Archetype, type Stats, type TraitLevels } from './traits';

export interface Satellite { a: number; alive: boolean; regrow: number; x: number; y: number }

export class Player {
  x = 0; y = 0; vx = 0; vy = 0;
  r = 10; targetR = 10;
  angle = -Math.PI / 2;
  energy = 100; hp = 100;
  traits: TraitLevels = {};
  traitOrder: string[] = [];
  /** mutations gained during the current era (weights the next leap's form) */
  recentTraits: TraitLevels = {};
  stillT = 0;
  stats: Stats = deriveStats({});
  eraIndex = 1;
  form: FormDef = formFor(1, 'opportunist');
  archetype: Archetype = 'opportunist';
  look: Look = baseLook({});
  dna = 0;
  dnaTotal = 0;
  growth = 0;
  alive = true;

  burstT = 0; burstCd = 0;
  cooldowns: Record<AbilityId, number> = { engulf: 0, harden: 0, pulse: 0, toxin: 0, strike: 0, ink: 0 };
  engulfT = 0; hardenT = 0; pulseT = -1; strikeT = 0; hiddenT = 0;
  hurtT = 0; sinceHurt = 99; eatPulse = 0; growPulse = 0; transformT = -1;
  spinyCd = 0; heatT = 0;
  satellites: Satellite[] = [];
  /** visible tentacle trail history */
  trail: { x: number; y: number }[] = [];

  get era(): EraDef { return ERAS[this.eraIndex - 1]; }
  /** lineage direction for the next leap, favouring recent choices */
  get leapArchetype(): Archetype { return dominantArchetype(this.traits, this.recentTraits); }

  get maxEnergy() { return 100 * this.stats.maxEnergy; }
  get maxHp() { return 100 * this.stats.maxHp; }
  get mutationCount() { return Object.values(this.traits).reduce((a, b) => a + b, 0); }

  reset(x: number, y: number) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.traits = {}; this.traitOrder = []; this.recentTraits = {}; this.stillT = 0;
    this.eraIndex = 1;
    this.r = this.targetR = ERAS[0].minR;
    this.growth = 0; this.dna = 0; this.dnaTotal = 0;
    this.alive = true;
    this.burstT = 0; this.burstCd = 0;
    this.cooldowns = { engulf: 0, harden: 0, pulse: 0, toxin: 0, strike: 0, ink: 0 };
    this.engulfT = 0; this.hardenT = 0; this.pulseT = -1; this.strikeT = 0; this.hiddenT = 0;
    this.hurtT = 0; this.sinceHurt = 99; this.eatPulse = 0; this.growPulse = 0; this.transformT = -1;
    this.trail = [];
    this.refresh();
    this.energy = this.maxEnergy * 0.8;
    this.hp = this.maxHp;
  }

  addTrait(id: string) {
    const lv = (this.traits[id] || 0) + 1;
    this.traits[id] = lv;
    this.recentTraits[id] = (this.recentTraits[id] || 0) + 1;
    if (!this.traitOrder.includes(id)) this.traitOrder.push(id);
    const prevMaxE = this.maxEnergy, prevMaxH = this.maxHp;
    this.refresh();
    // keep ratios when max values change
    this.energy = this.energy * (this.maxEnergy / prevMaxE);
    this.hp = this.hp * (this.maxHp / prevMaxH);
    this.transformT = 0;
    return lv;
  }

  /** Recompute stats + visual look from traits / era / archetype. */
  refresh() {
    this.stats = deriveStats(this.traits, this.eraIndex);
    this.archetype = dominantArchetype(this.traits);
    this.look = buildPlayerLook(this.traits, this.eraIndex, this.form);
    const n = this.stats.satellites;
    while (this.satellites.length < n) this.satellites.push({ a: (this.satellites.length / Math.max(1, n)) * TAU, alive: true, regrow: 0, x: this.x, y: this.y });
    this.satellites.length = n;
    this.satellites.forEach((s, i) => (s.a = (i / Math.max(1, n)) * TAU));
  }

  /** Era progress 0..1 */
  get growthFrac() { return clamp(this.growth / this.era.growthNeeded, 0, 1); }

  updateSize(dt: number) {
    const e = this.era;
    this.targetR = e.minR + (e.maxR - e.minR) * Math.sqrt(this.growthFrac);
    const prev = this.r;
    this.r += (this.targetR - this.r) * Math.min(1, dt * 2.5);
    if (Math.floor(this.r) > Math.floor(prev)) this.growPulse = 1;
  }

  get maxSpeed() {
    // absolute speed scales with body size so on-screen feel stays consistent across eras
    const scale = Math.pow(this.r / 10, 0.78);
    let s = 118 * this.stats.speed * scale;
    if (this.hardenT > 0) s *= 0.5;
    return s;
  }

  get canSeeThreatRatio() { return Math.max(this.stats.eatRatio, this.engulfT > 0 ? this.stats.engulfRatio : 0, this.strikeT > 0 ? this.stats.strikeRatio : 0); }
}

export function buildPlayerLook(traits: TraitLevels, eraIndex: number, form: FormDef): Look {
  // colour shifts toward the dominant strategy as mutations accumulate
  const w = archetypeWeights(traits);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let membrane = BASE_PALETTE.membrane, inner = BASE_PALETTE.inner, glow = BASE_PALETTE.glow;
  if (total > 0) {
    const strength = clamp(0.25 + total * 0.07 + (eraIndex - 1) * 0.25, 0, 0.85);
    for (const k of Object.keys(w) as Archetype[]) {
      const t = (w[k] / total) * strength;
      if (t <= 0) continue;
      const pal = ARCHETYPE_PALETTE[k];
      membrane = mixHex(membrane, pal.membrane, t);
      inner = mixHex(inner, pal.inner, t);
      glow = mixHex(glow, pal.glow, t);
    }
  }
  const l = baseLook({ membrane, inner, glow, wobble: 0.05, nucleus: eraIndex >= 2 ? '#fff4d6' : null, nucleoid: eraIndex < 2, glowStrength: 1.15 });
  form.shape(l);
  for (const id of Object.keys(traits)) {
    const t = TRAIT_BY_ID[id];
    if (t && traits[id] > 0) t.look(l, traits[id]);
  }
  // older invertebrate structures are re-expressed in a backboned body
  if (l.vertebrate) {
    if (l.carapace) { l.carapace = false; l.headArmor = true; l.scales = true; }
    if (l.claws) { l.jaw = Math.max(l.jaw || 0, 2); l.claws = 0; }
    l.receptors = 0;
  }
  return l;
}
