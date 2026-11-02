import type { Look } from '../render/look';

/**
 * Data-driven mutation system. Each trait modifies derived Stats (mechanics)
 * AND the organism Look (visuals) at every level, so evolution is always
 * both visible and functional.
 */
export type AbilityId = 'engulf' | 'harden' | 'pulse' | 'toxin';
export type Archetype = 'predator' | 'defender' | 'opportunist' | 'phototroph';
export type TraitCategory = 'Locomotion' | 'Feeding' | 'Defense' | 'Senses' | 'Metabolism' | 'Colonial';

export interface Stats {
  speed: number;
  accel: number;
  drag: number;
  eatRatio: number;
  engulfRatio: number;
  magnet: number;
  damageTaken: number;
  spinyImmune: boolean;
  shellBreaker: boolean;
  toxicImmune: boolean;
  heatResist: number;
  contactDamage: number;
  metabolism: number;
  digestion: number;
  photo: number;
  photoMinLight: number;
  darkPenalty: number;
  sense: number;
  vision: number;
  thicketImmune: boolean;
  currentResist: number;
  burstPower: number;
  burstCost: number;
  maxEnergy: number;
  maxHp: number;
  regen: number;
  satellites: number;
  tentacles: number;
  lure: number;
  predatorDeter: number;
  detectability: number;
  abilities: AbilityId[];
}

export const baseStats = (): Stats => ({
  speed: 1,
  accel: 1,
  drag: 2.6,
  eatRatio: 0.9,
  engulfRatio: 0,
  magnet: 1.6,
  damageTaken: 1,
  spinyImmune: false,
  shellBreaker: false,
  toxicImmune: false,
  heatResist: 0,
  contactDamage: 0,
  metabolism: 1,
  digestion: 1,
  photo: 0,
  photoMinLight: 0.2,
  darkPenalty: 1,
  sense: 0,
  vision: 0,
  thicketImmune: false,
  currentResist: 0,
  burstPower: 1,
  burstCost: 1,
  maxEnergy: 1,
  maxHp: 1,
  regen: 1,
  satellites: 0,
  tentacles: 0,
  lure: 0,
  predatorDeter: 0,
  detectability: 1,
  abilities: [],
});

export interface TraitLevel {
  name: string;
  cost: number;
  pros: string[];
  cons: string[];
}

export interface TraitDef {
  id: string;
  name: string;
  icon: string;
  category: TraitCategory;
  era: number;
  bio: string;
  levels: TraitLevel[];
  requires?: string[];
  excludes?: string[];
  archetype: Partial<Record<Archetype, number>>;
  ability?: AbilityId;
  apply: (s: Stats, level: number) => void;
  look: (l: Look, level: number) => void;
}

const T = (d: TraitDef) => d;

export const TRAITS: TraitDef[] = [
  T({
    id: 'flagellum', name: 'Flagellum', icon: '〰', category: 'Locomotion', era: 1,
    bio: 'A whip-like protein filament spun by a rotary motor in the membrane — the fastest engine in the microscopic world.',
    levels: [
      { name: 'Flagellum', cost: 14, pros: ['+40% top speed', 'Burst travels much farther', 'Glides with momentum'], cons: ['+15% metabolism', 'Wider turns'] },
      { name: 'Twin Flagella', cost: 34, pros: ['+25% more top speed', 'Burst cost −20%'], cons: ['+10% metabolism'] },
    ],
    archetype: { predator: 2, opportunist: 0.5 },
    apply: (s, lv) => {
      s.speed *= 1.4; s.burstPower *= 1.6; s.drag *= 0.7; s.accel *= 0.88; s.metabolism *= 1.15;
      if (lv >= 2) { s.speed *= 1.25; s.burstCost *= 0.8; s.metabolism *= 1.1; }
    },
    look: (l, lv) => { l.flagella = lv; l.flagLen = 2.1; l.elong += 0.18; l.taper += 0.2; },
  }),
  T({
    id: 'cilia', name: 'Cilia', icon: '≋', category: 'Locomotion', era: 1,
    bio: 'Thousands of tiny hairs beating in coordinated waves. Precise, agile and unbothered by tangled surroundings.',
    levels: [
      { name: 'Cilia', cost: 12, pros: ['Sharp, precise turning', 'Ignores Biofilm Thicket drag', 'Resists currents'], cons: ['−8% top speed'] },
      { name: 'Dense Ciliation', cost: 30, pros: ['Sweeps nutrients from 35% farther', 'Even quicker acceleration'], cons: ['+6% metabolism'] },
    ],
    archetype: { opportunist: 2, defender: 0.3 },
    apply: (s, lv) => {
      s.accel *= 1.7; s.drag *= 1.7; s.speed *= 0.92; s.thicketImmune = true; s.currentResist = Math.max(s.currentResist, 0.7);
      if (lv >= 2) { s.magnet *= 1.35; s.accel *= 1.2; s.metabolism *= 1.06; }
    },
    look: (l, lv) => { l.cilia = lv >= 2 ? 1 : 0.65; },
  }),
  T({
    id: 'pseudopods', name: 'Pseudopods', icon: '❋', category: 'Feeding', era: 1,
    bio: 'Flowing extensions of cytoplasm that reach out and fold around food — phagocytosis, the origin of eating.',
    levels: [
      { name: 'Pseudopods', cost: 18, pros: ['ENGULF ability: lunge and swallow prey up to 30% larger than you', 'Engulf cracks shells and ignores spines', 'Pulls nutrients from 50% farther'], cons: ['−12% top speed'] },
      { name: 'Phagocytic Lobes', cost: 38, pros: ['Engulf prey up to 45% larger', 'Engulf recharges faster', '+15% food energy'], cons: ['−6% top speed'] },
    ],
    archetype: { predator: 1.5, opportunist: 1 },
    ability: 'engulf',
    apply: (s, lv) => {
      s.engulfRatio = lv >= 2 ? 1.45 : 1.3; s.magnet *= 1.5; s.speed *= 0.88; s.abilities.push('engulf');
      if (lv >= 2) { s.speed *= 0.94; s.digestion *= 1.15; }
    },
    look: (l, lv) => { l.lobes = Math.max(l.lobes, lv >= 2 ? 6 : 4); l.lobeAmp = Math.max(l.lobeAmp, lv >= 2 ? 0.26 : 0.18); l.wobble += 0.03; },
  }),
  T({
    id: 'membrane', name: 'Protective Membrane', icon: '◎', category: 'Defense', era: 1,
    bio: 'A reinforced double membrane with a stiff protein cortex. Bites glance off, toxins and heat struggle to get through.',
    levels: [
      { name: 'Protective Membrane', cost: 15, pros: ['−40% damage taken', 'Safe contact with spiny cells', 'Resists vent heat', 'HARDEN ability: brief near-invulnerability'], cons: ['−15% top speed', 'Slower acceleration'] },
      { name: 'Pellicle Plates', cost: 34, pros: ['−60% damage taken in total', '+30% integrity', 'Immune to toxic prey'], cons: ['−10% more top speed'] },
    ],
    archetype: { defender: 2.5 },
    ability: 'harden',
    apply: (s, lv) => {
      s.damageTaken *= 0.6; s.spinyImmune = true; s.heatResist = Math.max(s.heatResist, 0.6); s.speed *= 0.85; s.accel *= 0.85; s.abilities.push('harden');
      if (lv >= 2) { s.damageTaken *= 0.66; s.maxHp *= 1.3; s.toxicImmune = true; s.speed *= 0.9; }
    },
    look: (l, lv) => { l.plates = Math.max(l.plates || 0, lv); },
  }),
  T({
    id: 'photosynthesis', name: 'Photosynthesis', icon: '☀', category: 'Metabolism', era: 1,
    bio: 'Captured cyanobacteria become chloroplasts, turning sunlight into sugar. Why hunt when you can bask?',
    levels: [
      { name: 'Chloroplasts', cost: 15, pros: ['Generates energy in light', 'Barely needs to eat in the Shallows'], cons: ['Prey yields −25% energy', 'Burns energy faster in darkness'] },
      { name: 'Chloroplast Arrays', cost: 32, pros: ['+80% photosynthesis', 'Works in dimmer light'], cons: ['−5% top speed'] },
    ],
    archetype: { phototroph: 3 },
    apply: (s, lv) => {
      s.photo += lv >= 2 ? 4.3 : 2.4; s.digestion *= 0.75; s.darkPenalty *= 1.3;
      if (lv >= 2) { s.photoMinLight = 0.12; s.speed *= 0.95; }
    },
    look: (l, lv) => { l.chloro = (l.chloro || 0) + (lv >= 2 ? 9 : 5); },
  }),
  T({
    id: 'sensory', name: 'Sensory Receptors', icon: '◉', category: 'Senses', era: 1,
    bio: 'Chemoreceptors taste the water and a pigmented eyespot reads the light. The world becomes legible.',
    levels: [
      { name: 'Chemoreceptors', cost: 12, pros: ['Shows direction of nearby threats', 'Reveals rare organisms at range', 'PULSE ability: reveal & stun small life'], cons: ['+8% metabolism'] },
      { name: 'Eyespot', cost: 28, pros: ['See much farther in the Abyssal Dark', 'Detection range +50%'], cons: ['+5% metabolism'] },
    ],
    archetype: { predator: 1, opportunist: 1 },
    ability: 'pulse',
    apply: (s, lv) => {
      s.sense = lv >= 2 ? 30 : 20; s.magnet *= 1.15; s.metabolism *= 1.08; s.abilities.push('pulse');
      if (lv >= 2) { s.vision += 0.55; s.metabolism *= 1.05; }
    },
    look: (l, lv) => { l.receptors = 3; l.eyespot = lv >= 2; },
  }),

  // ───────────── ERA II ─────────────
  T({
    id: 'toxin', name: 'Toxicysts', icon: '☣', category: 'Defense', era: 2,
    bio: 'Vesicles packed with paralytic toxin, ready to be fired into the water around you.',
    levels: [
      { name: 'Toxicysts', cost: 40, pros: ['TOXIN ability: a cloud that poisons and scatters everything nearby', 'Predators hesitate to attack you'], cons: ['+12% metabolism'] },
    ],
    archetype: { predator: 1.5, defender: 1 },
    ability: 'toxin',
    apply: (s) => { s.abilities.push('toxin'); s.predatorDeter = Math.max(s.predatorDeter, 0.35); s.metabolism *= 1.12; },
    look: (l) => { l.vesicles = (l.vesicles || 0) + 8; l.vesicleColor = '#c77dff'; },
  }),
  T({
    id: 'spines', name: 'Silica Spicules', icon: '✳', category: 'Defense', era: 2,
    bio: 'Needles of glass grow outward through the membrane. Anything that bites you regrets it.',
    levels: [
      { name: 'Silica Spicules', cost: 42, pros: ['Attackers take heavy damage and recoil', 'Most predators avoid you', 'Crush shelled prey'], cons: ['−8% top speed', 'Nutrients harder to sweep up'] },
    ],
    archetype: { defender: 2 },
    apply: (s) => { s.contactDamage = 40; s.predatorDeter = Math.max(s.predatorDeter, 0.55); s.speed *= 0.92; s.magnet *= 0.7; s.shellBreaker = true; },
    look: (l) => { l.spikes = 16; l.spikeLen = 0.5; },
  }),
  T({
    id: 'mitochondria', name: 'Mitochondria', icon: '⬭', category: 'Metabolism', era: 2,
    bio: 'An ancient bacterium swallowed and never digested. Now it burns oxygen to power you.',
    levels: [
      { name: 'Endosymbiont', cost: 38, pros: ['+40% max energy', 'Burst costs −40%', '−10% metabolism'], cons: ['Photosynthesis −30%'] },
      { name: 'Cristae Folding', cost: 60, pros: ['+20% max energy', '+20% top speed in bursts'], cons: ['+4% metabolism'] },
    ],
    archetype: { opportunist: 1.5, predator: 0.6 },
    apply: (s, lv) => {
      s.maxEnergy *= 1.4; s.burstCost *= 0.6; s.metabolism *= 0.9; s.photo *= 0.7;
      if (lv >= 2) { s.maxEnergy *= 1.2; s.burstPower *= 1.2; s.metabolism *= 1.04; }
    },
    look: (l, lv) => { l.mito = (l.mito || 0) + (lv >= 2 ? 7 : 4); },
  }),
  T({
    id: 'gullet', name: 'Oral Groove', icon: '◖', category: 'Feeding', era: 2,
    bio: 'A permanent ciliated mouth funnels food straight into digestive vacuoles.',
    requires: ['cilia'],
    levels: [
      { name: 'Oral Groove', cost: 40, pros: ['Eat prey up to your own size', '+30% food energy', 'Nutrients pulled in faster'], cons: ['Requires Cilia', '+5% metabolism'] },
    ],
    archetype: { opportunist: 2 },
    apply: (s) => { s.eatRatio = Math.max(s.eatRatio, 1.0); s.digestion *= 1.3; s.magnet *= 1.2; s.metabolism *= 1.05; },
    look: (l) => { l.groove = true; l.slipper = Math.max(l.slipper, 0.22); l.elong += 0.15; },
  }),
  T({
    id: 'vacuole', name: 'Contractile Vacuole', icon: '✲', category: 'Defense', era: 2,
    bio: 'A pulsing pump that expels excess water and heat, keeping the cell intact under stress.',
    levels: [
      { name: 'Contractile Vacuole', cost: 34, pros: ['Integrity regenerates 2.2× faster', 'Strong vent-heat resistance'], cons: ['+5% metabolism'] },
    ],
    archetype: { defender: 1, phototroph: 0.5 },
    apply: (s) => { s.regen *= 2.2; s.heatResist = Math.max(s.heatResist, 0.85); s.metabolism *= 1.05; },
    look: (l) => { l.vacuole = true; },
  }),

  // ───────────── ERA III ─────────────
  T({
    id: 'colony', name: 'Colonial Bonding', icon: '⁂', category: 'Colonial', era: 3,
    bio: 'Daughter cells stay attached after division. A body of many begins — the first step to multicellular life.',
    levels: [
      { name: 'Bonded Daughters', cost: 105, pros: ['2 satellite cells orbit you', 'Each absorbs one bite, then regrows', 'They gather nutrients'], cons: ['−6% top speed', '+8% metabolism'] },
      { name: 'Cell Cluster', cost: 140, pros: ['+2 more satellites'], cons: ['−6% top speed', '+8% metabolism'] },
      { name: 'True Colony', cost: 180, pros: ['+2 more satellites', '+20% integrity'], cons: ['−6% top speed', '+8% metabolism'] },
    ],
    archetype: { defender: 1, opportunist: 1, phototroph: 0.5 },
    apply: (s, lv) => { s.satellites = 2 * lv; s.speed *= Math.pow(0.94, lv); s.metabolism *= Math.pow(1.08, lv); if (lv >= 3) s.maxHp *= 1.2; },
    look: () => {},
  }),
  T({
    id: 'tentacles', name: 'Stinging Tentacles', icon: '⫛', category: 'Feeding', era: 3,
    bio: 'Trailing filaments lined with harpoon-like cnidocytes. Prey that brushes them is stunned and reeled in.',
    levels: [
      { name: 'Stinging Tentacles', cost: 120, pros: ['Tentacles stun and reel in smaller prey automatically'], cons: ['−10% top speed'] },
    ],
    archetype: { predator: 2 },
    apply: (s) => { s.tentacles = 5; s.speed *= 0.9; },
    look: (l) => { l.tentacles = 5; },
  }),
  T({
    id: 'lure', name: 'Bioluminescent Lure', icon: '✦', category: 'Senses', era: 3,
    bio: 'Glowing photophores pulse a hypnotic rhythm. Small creatures can\'t resist swimming closer.',
    levels: [
      { name: 'Bioluminescent Lure', cost: 110, pros: ['Draws small prey toward you', 'Lights up the darkness around you'], cons: ['Predators notice you from 50% farther'] },
    ],
    archetype: { predator: 1, phototroph: 1 },
    apply: (s) => { s.lure = 14; s.vision += 0.35; s.detectability *= 1.5; },
    look: (l) => { l.lure = 4; l.glowStrength = (l.glowStrength || 1) + 0.6; },
  }),
  T({
    id: 'symbiosis', name: 'Algal Symbiosis', icon: '❀', category: 'Metabolism', era: 3,
    requires: ['photosynthesis'],
    bio: 'Whole algal cells live inside your tissues, trading sugar for shelter.',
    levels: [
      { name: 'Algal Symbiosis', cost: 115, pros: ['Photosynthesis +60% and works in dim light', '+20% max energy'], cons: ['Requires Photosynthesis', '−8% top speed'] },
    ],
    archetype: { phototroph: 2 },
    apply: (s) => { s.photo *= 1.6; s.photoMinLight = 0.05; s.maxEnergy *= 1.2; s.speed *= 0.92; },
    look: (l) => { l.chloro = (l.chloro || 0) + 6; },
  }),
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export type TraitLevels = Record<string, number>;

/** Derive the player's stats from their trait levels. Order-independent multiplicative stacking. */
export function deriveStats(traits: TraitLevels, eraIndex = 1): Stats {
  const s = baseStats();
  for (const t of TRAITS) {
    const lv = traits[t.id] || 0;
    if (lv > 0) t.apply(s, lv);
  }
  // era scaling of base capabilities
  s.maxEnergy *= 1 + (eraIndex - 1) * 0.35;
  s.maxHp *= 1 + (eraIndex - 1) * 0.5;
  // dark penalty only meaningful for phototrophs
  return s;
}

export function archetypeWeights(traits: TraitLevels): Record<Archetype, number> {
  const w: Record<Archetype, number> = { predator: 0, defender: 0, opportunist: 0, phototroph: 0 };
  for (const t of TRAITS) {
    const lv = traits[t.id] || 0;
    if (!lv) continue;
    for (const k in t.archetype) w[k as Archetype] += (t.archetype[k as Archetype] || 0) * lv;
  }
  return w;
}

export function dominantArchetype(traits: TraitLevels): Archetype {
  const w = archetypeWeights(traits);
  let best: Archetype = 'opportunist', bv = -1;
  for (const k of ['predator', 'defender', 'phototroph', 'opportunist'] as Archetype[]) {
    if (w[k] > bv) { bv = w[k]; best = k; }
  }
  return bv <= 0 ? 'opportunist' : best;
}

export interface Offer { trait: TraitDef; level: number; cost: number }

export function isEligible(t: TraitDef, traits: TraitLevels, era: number): boolean {
  const lv = traits[t.id] || 0;
  if (lv >= t.levels.length) return false;
  if (t.era > era) return false;
  if (t.requires && !t.requires.every((r) => (traits[r] || 0) > 0)) return false;
  if (t.excludes && t.excludes.some((r) => (traits[r] || 0) > 0)) return false;
  return true;
}

/** Choose up to n diverse evolution offers (different categories where possible). */
export function generateOffers(traits: TraitLevels, era: number, n = 3, rnd: () => number = Math.random): Offer[] {
  const pool = TRAITS.filter((t) => isEligible(t, traits, era));
  // favour newly unlocked era traits and unowned traits
  const scored = pool.map((t) => {
    const lv = traits[t.id] || 0;
    let w = lv === 0 ? 1.6 : 1;
    if (t.era === era && era > 1) w *= 1.8;
    return { t, w: w * (0.5 + rnd()) };
  });
  scored.sort((a, b) => b.w - a.w);
  const out: Offer[] = [];
  const usedCats = new Set<TraitCategory>();
  for (const pass of [0, 1]) {
    for (const { t } of scored) {
      if (out.length >= n) break;
      if (out.some((o) => o.trait.id === t.id)) continue;
      if (pass === 0 && usedCats.has(t.category)) continue;
      const level = (traits[t.id] || 0) + 1;
      out.push({ trait: t, level, cost: t.levels[level - 1].cost });
      usedCats.add(t.category);
    }
  }
  return out;
}

export const ABILITY_INFO: Record<AbilityId, { name: string; icon: string; cooldown: number; energy: number }> = {
  engulf: { name: 'Engulf', icon: '❋', cooldown: 3.2, energy: 4 },
  harden: { name: 'Harden', icon: '◎', cooldown: 9, energy: 6 },
  pulse: { name: 'Pulse', icon: '◉', cooldown: 8, energy: 5 },
  toxin: { name: 'Toxin', icon: '☣', cooldown: 10, energy: 9 },
};
