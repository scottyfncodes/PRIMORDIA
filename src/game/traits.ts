import type { Look } from '../render/look';

/**
 * Data-driven mutation system. Each trait modifies derived Stats (mechanics)
 * AND the organism Look (visuals) at every level, so evolution is always
 * both visible and functional.
 */
export type AbilityId = 'engulf' | 'harden' | 'pulse' | 'toxin' | 'strike' | 'ink' | 'tongue';
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
  /** predator wind-up multiplier against you (more time to react) */
  reaction: number;
  /** nutrient energy multiplier */
  nutrientMult: number;
  /** Harden duration multiplier */
  hardenMult: number;
  /** turn responsiveness multiplier */
  turn: number;
  /** largest prey (relative size) a Strike can seize */
  strikeRatio: number;
  /** strike damage multiplier against things too big to swallow */
  strikeDamage: number;
  /** 0..1: how well you vanish when holding still */
  stealth: number;
  /** speed multiplier on dry land (fish flop, legs walk) */
  landSpeed: number;
  /** breath lost per second out of water (fraction of full) */
  breathDrain: number;
  /** extra lives from an amniotic clutch */
  extraLives: number;
  /** energy per second basking in sunlight on land */
  bask: number;
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
  reaction: 1,
  nutrientMult: 1,
  hardenMult: 1,
  turn: 1,
  strikeRatio: 1.35,
  strikeDamage: 1,
  stealth: 0,
  landSpeed: 0.42,
  breathDrain: 0.1,
  extraLives: 0,
  bask: 0,
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
  // ───────────── ERA IV ─────────────
  T({
    id: 'eyes', name: 'Camera Eyes', icon: '◐', category: 'Senses', era: 4,
    bio: 'A lens focuses light onto a cup of photoreceptors. For the first time, a creature can truly see.',
    levels: [
      { name: 'Camera Eyes', cost: 150, pros: ['See far into the Abyssal Dark', 'Shows nearby threats at the screen edge', 'Predators telegraph strikes 60% longer'], cons: ['+8% metabolism'] },
    ],
    archetype: { predator: 1.5, opportunist: 0.5 },
    apply: (s) => { s.vision += 0.9; s.sense = Math.max(s.sense, 34); s.reaction *= 1.6; s.metabolism *= 1.08; },
    look: (l) => { l.eyes = 2; },
  }),
  T({
    id: 'fins', name: 'Paired Fins', icon: '⋎', category: 'Locomotion', era: 4,
    bio: 'Flaps of muscle on each flank — stabilisers, rudders and brakes. Swimming becomes steering.',
    levels: [
      { name: 'Paired Fins', cost: 140, pros: ['+15% top speed', 'Much sharper turning and acceleration'], cons: ['+10% metabolism'] },
      { name: 'Ray Fins', cost: 200, pros: ['+10% more top speed', 'Burst travels farther'], cons: ['+6% metabolism'] },
    ],
    archetype: { opportunist: 1.5, predator: 1 },
    apply: (s, lv) => {
      s.speed *= 1.15; s.accel *= 1.5; s.turn *= 1.6; s.metabolism *= 1.1;
      if (lv >= 2) { s.speed *= 1.1; s.burstPower *= 1.25; s.metabolism *= 1.06; }
    },
    look: (l, lv) => { l.fins = (l.fins || 0) + (lv >= 2 ? 3 : 2); },
  }),
  T({
    id: 'claws', name: 'Raptorial Claws', icon: '❯', category: 'Feeding', era: 4,
    bio: 'Spiny grasping limbs folded beneath the head, ready to snap out and seize.',
    levels: [
      { name: 'Raptorial Claws', cost: 170, pros: ['STRIKE ability: lunge and seize prey up to 35% larger than you', 'Strikes crack shells and wound bigger animals'], cons: ['−8% top speed'] },
    ],
    archetype: { predator: 2.5 },
    ability: 'strike',
    apply: (s) => { s.abilities.push('strike'); s.speed *= 0.92; s.eatRatio = Math.max(s.eatRatio, 0.95); },
    look: (l) => { l.claws = 2; },
  }),
  T({
    id: 'carapace', name: 'Mineral Carapace', icon: '⬢', category: 'Defense', era: 4,
    bio: 'Calcium and chitin harden into a jointed exoskeleton — the first true armour.',
    levels: [
      { name: 'Mineral Carapace', cost: 160, pros: ['−50% damage taken', '+40% integrity', 'Immune to spines', 'Harden lasts much longer'], cons: ['−15% top speed', 'Slower turning'] },
    ],
    archetype: { defender: 3 },
    apply: (s) => { s.damageTaken *= 0.5; s.maxHp *= 1.4; s.spinyImmune = true; s.hardenMult *= 1.8; s.speed *= 0.85; s.turn *= 0.8; },
    look: (l) => { l.carapace = true; },
  }),
  T({
    id: 'lateral', name: 'Lateral Line', icon: '┅', category: 'Senses', era: 4,
    bio: 'A row of pressure-sensing pores along each flank feels every ripple in the water.',
    levels: [
      { name: 'Lateral Line', cost: 140, pros: ['Feel hunters coming from any direction', 'Predators telegraph strikes 50% longer', 'Nutrients sensed from farther'], cons: ['+6% metabolism'] },
    ],
    archetype: { defender: 1, opportunist: 1.5 },
    apply: (s) => { s.sense = Math.max(s.sense, 42); s.reaction *= 1.5; s.magnet *= 1.2; s.metabolism *= 1.06; },
    look: (l) => { l.lateral = true; },
  }),
  T({
    id: 'ink', name: 'Ink Sac', icon: '●', category: 'Defense', era: 4,
    bio: 'A pouch of dark pigment. One squeeze and the water turns to night.',
    levels: [
      { name: 'Ink Sac', cost: 150, pros: ['INK ability: a dark cloud that makes hunters lose you', 'You vanish from predators for a few seconds'], cons: ['+5% metabolism'] },
    ],
    archetype: { defender: 1.5, opportunist: 1 },
    ability: 'ink',
    apply: (s) => { s.abilities.push('ink'); s.metabolism *= 1.05; },
    look: (l) => { l.ink = true; },
  }),
  T({
    id: 'filter', name: 'Filter Gills', icon: '≣', category: 'Feeding', era: 4,
    bio: 'Feathered gills strain food from the water as you swim. The whole sea becomes a meal.',
    levels: [
      { name: 'Filter Gills', cost: 145, pros: ['Sweep nutrients from twice as far', 'Nutrients give +60% energy'], cons: ['Can only swallow smaller prey (−10% size)'] },
    ],
    archetype: { opportunist: 2, phototroph: 1 },
    apply: (s) => { s.magnet *= 2; s.nutrientMult *= 1.6; s.eatRatio *= 0.9; },
    look: (l) => { l.gills = true; },
  }),
  T({
    id: 'fronds', name: 'Sun Fronds', icon: '❦', category: 'Metabolism', era: 4,
    requires: ['photosynthesis'],
    bio: 'Broad living fronds packed with symbiotic algae unfurl from your back.',
    levels: [
      { name: 'Sun Fronds', cost: 160, pros: ['Photosynthesis +80%', '+25% max energy'], cons: ['Requires Photosynthesis', '−10% top speed'] },
    ],
    archetype: { phototroph: 3 },
    apply: (s) => { s.photo *= 1.8; s.maxEnergy *= 1.25; s.speed *= 0.9; },
    look: (l) => { l.fronds = (l.fronds || 0) + 3; },
  }),
  // ───────────── ERA V ─────────────
  T({
    id: 'jaws', name: 'Hinged Jaws', icon: '⋀', category: 'Feeding', era: 5,
    bio: 'Gill arches fold forward into a biting jaw — the single most important invention in vertebrate history.',
    levels: [
      { name: 'Hinged Jaws', cost: 230, pros: ['STRIKE ability (or a stronger one): seize prey up to 50% larger', 'Strikes deal double damage to big animals', '+25% food energy'], cons: ['+8% metabolism'] },
      { name: 'Serrated Teeth', cost: 320, pros: ['Strike seizes prey up to 65% larger', 'Strikes deal triple damage'], cons: ['+6% metabolism'] },
    ],
    archetype: { predator: 2.5 },
    ability: 'strike',
    apply: (s, lv) => {
      if (!s.abilities.includes('strike')) s.abilities.push('strike');
      s.strikeRatio = Math.max(s.strikeRatio, lv >= 2 ? 1.65 : 1.5); s.strikeDamage *= lv >= 2 ? 3 : 2; s.digestion *= 1.25; s.metabolism *= 1.08;
      if (lv >= 2) s.metabolism *= 1.06;
    },
    look: (l, lv) => { l.jaw = Math.max(l.jaw || 0, lv >= 2 ? 2 : 1); },
  }),
  T({
    id: 'electro', name: 'Electroreception', icon: 'ϟ', category: 'Senses', era: 5,
    bio: 'Jelly-filled pores on the snout feel the faint electric hum of every living muscle nearby.',
    levels: [
      { name: 'Electroreception', cost: 220, pros: ['See clearly in total darkness', 'Sense hunters and rare life from very far away', 'Predators telegraph strikes 40% longer'], cons: ['+7% metabolism'] },
    ],
    archetype: { predator: 1.5, opportunist: 1 },
    apply: (s) => { s.vision += 1.2; s.sense = Math.max(s.sense, 60); s.reaction *= 1.4; s.metabolism *= 1.07; },
    look: (l) => { l.electro = true; },
  }),
  T({
    id: 'bladder', name: 'Swim Bladder', icon: '◌', category: 'Metabolism', era: 5,
    bio: 'A gas-filled sac lets you hang weightless in the water instead of fighting to stay level.',
    levels: [
      { name: 'Swim Bladder', cost: 210, pros: ['−25% metabolism', '+10% top speed'], cons: ['Burst costs +30%'] },
    ],
    archetype: { opportunist: 1.5, phototroph: 1.5 },
    apply: (s) => { s.metabolism *= 0.75; s.speed *= 1.1; s.burstCost *= 1.3; },
    look: (l) => { l.vacuole = true; },
  }),
  T({
    id: 'scales', name: 'Bony Scales', icon: '⛆', category: 'Defense', era: 5,
    bio: 'Overlapping plates of enamel-coated bone — light, flexible armour.',
    levels: [
      { name: 'Bony Scales', cost: 220, pros: ['−40% damage taken', 'Attackers take damage when they bite you'], cons: ['−6% top speed'] },
    ],
    archetype: { defender: 2.5 },
    apply: (s) => { s.damageTaken *= 0.6; s.contactDamage = Math.max(s.contactDamage, 30); s.speed *= 0.94; },
    look: (l) => { l.scales = true; },
  }),
  T({
    id: 'lobes', name: 'Lobe Fins', icon: '⫚', category: 'Locomotion', era: 5,
    bio: 'Fins with bones and muscle inside them. You can push off the bottom, brace and turn on the spot.',
    levels: [
      { name: 'Lobe Fins', cost: 230, pros: ['Very sharp turning and acceleration', 'Ignores thickets and currents', '+20% integrity'], cons: ['−8% top speed'] },
    ],
    archetype: { opportunist: 2, defender: 1 },
    apply: (s) => { s.turn *= 1.8; s.accel *= 1.6; s.thicketImmune = true; s.currentResist = 1; s.maxHp *= 1.2; s.speed *= 0.92; },
    look: (l) => { l.lobeFins = true; l.fins = Math.max(l.fins || 0, 4); },
  }),
  T({
    id: 'shoal', name: 'Shoaling Instinct', icon: '⋰', category: 'Colonial', era: 5,
    bio: 'Kin stay close and move as one. There is safety in numbers — and more eyes for food.',
    levels: [
      { name: 'Shoaling Instinct', cost: 240, pros: ['+3 shoal-mates swim with you', 'Each takes a bite for you, then rejoins', 'They gather food'], cons: ['+10% metabolism'] },
    ],
    archetype: { defender: 1.5, opportunist: 1 },
    apply: (s) => { s.satellites += 3; s.metabolism *= 1.1; },
    look: () => {},
  }),
  T({
    id: 'muscle', name: 'Fast-Twitch Muscle', icon: '⟿', category: 'Locomotion', era: 5,
    bio: 'White muscle fibres burn fuel without oxygen for explosive bursts of speed.',
    levels: [
      { name: 'Fast-Twitch Muscle', cost: 220, pros: ['Burst is 60% stronger and 40% cheaper', '+8% top speed'], cons: ['+10% metabolism'] },
    ],
    archetype: { predator: 1.5, opportunist: 0.5 },
    apply: (s) => { s.burstPower *= 1.6; s.burstCost *= 0.6; s.speed *= 1.08; s.metabolism *= 1.1; },
    look: (l) => { l.tailFin = (l.tailFin || 0) + 0.5; },
  }),
  T({
    id: 'camo', name: 'Countershading', icon: '◑', category: 'Defense', era: 5,
    bio: 'Dark above, pale below, broken up by blotches. Hold still and you simply disappear.',
    levels: [
      { name: 'Countershading', cost: 210, pros: ['Hold still to vanish from predators', 'Predators spot you from 40% closer'], cons: ['Halves the pull of a Bioluminescent Lure'] },
    ],
    archetype: { defender: 1.5, phototroph: 1 },
    apply: (s) => { s.stealth = 1; s.detectability *= 0.6; s.lure *= 0.5; },
    look: (l) => { l.mottled = true; },
  }),
  // ───────────── ERA VI ─────────────
  T({
    id: 'lungs', name: 'Primitive Lungs', icon: '♺', category: 'Metabolism', era: 6,
    bio: 'A pouch off the gut, lined with blood vessels, gulps air. The sky becomes breathable.',
    levels: [
      { name: 'Primitive Lungs', cost: 300, pros: ['Hold your breath on land 4× longer'], cons: ['+5% metabolism'] },
      { name: 'Full Lungs', cost: 380, pros: ['Breathe freely on land', '−10% metabolism'], cons: ['None — the sky is yours'] },
    ],
    archetype: { opportunist: 1.5, defender: 1 },
    apply: (s, lv) => { s.breathDrain *= lv >= 2 ? 0 : 0.25; s.metabolism *= lv >= 2 ? 0.9 : 1.05; },
    look: (l, lv) => { l.gills = false; l.airSac = true; if (lv >= 2) l.vacuole = true; },
  }),
  T({
    id: 'limbs', name: 'Weight-Bearing Limbs', icon: '⩚', category: 'Locomotion', era: 6,
    bio: 'Shoulder and hip girdles lock onto the spine. For the first time, a body can lift itself off the ground.',
    levels: [
      { name: 'Weight-Bearing Limbs', cost: 290, pros: ['Walk on land nearly as fast as you swim'], cons: ['−8% speed in water'] },
      { name: 'Five Digits', cost: 360, pros: ['Faster and nimbler on land', 'Sharper turning everywhere'], cons: ['+5% metabolism'] },
    ],
    archetype: { opportunist: 2, predator: 0.5 },
    apply: (s, lv) => { s.landSpeed = Math.max(s.landSpeed, lv >= 2 ? 1.05 : 0.85); s.speed *= 0.92; if (lv >= 2) { s.turn *= 1.4; s.metabolism *= 1.05; } },
    look: (l, lv) => { l.legLen = (l.legLen || 0.6) + (lv >= 2 ? 0.2 : 0.1); },
  }),
  T({
    id: 'skin', name: 'Keratin Skin', icon: '▦', category: 'Defense', era: 6,
    bio: 'A tough, waxy outer skin that keeps water in and teeth out.',
    levels: [
      { name: 'Keratin Skin', cost: 280, pros: ['−40% breath lost on land', '−20% damage taken'], cons: ['−5% top speed'] },
    ],
    archetype: { defender: 2 },
    apply: (s) => { s.breathDrain *= 0.6; s.damageTaken *= 0.8; s.speed *= 0.95; },
    look: (l) => { l.scales = true; },
  }),
  T({
    id: 'egg', name: 'Amniotic Egg', icon: '⬮', category: 'Colonial', era: 6,
    bio: 'An egg with its own private pond inside. Your young no longer need the sea — and neither does your line.',
    levels: [
      { name: 'Amniotic Egg', cost: 360, pros: ['Once per life: when you die, your clutch hatches and your lineage carries on'], cons: ['The hatchling loses some growth'] },
    ],
    archetype: { defender: 1.5, phototroph: 1 },
    apply: (s) => { s.extraLives = 1; },
    look: (l) => { l.eggs = true; },
  }),
  T({
    id: 'ears', name: 'Middle Ear', icon: '◖', category: 'Senses', era: 6,
    bio: 'A gill bone becomes a tiny lever that carries sound through air. You hear footsteps before you see them.',
    levels: [
      { name: 'Middle Ear', cost: 290, pros: ['Sense hunters from very far away', 'Predators telegraph strikes 50% longer'], cons: ['+6% metabolism'] },
    ],
    archetype: { predator: 1, opportunist: 1, defender: 0.5 },
    apply: (s) => { s.sense = Math.max(s.sense, 70); s.reaction *= 1.5; s.metabolism *= 1.06; },
    look: (l) => { l.ears = true; },
  }),
  T({
    id: 'tongue', name: 'Sticky Tongue', icon: '⟼', category: 'Feeding', era: 6,
    bio: 'A long muscular tongue tipped with glue. Small prey is caught before it knows you are there.',
    levels: [
      { name: 'Sticky Tongue', cost: 300, pros: ['TONGUE ability: snatch small prey from a distance'], cons: ['+5% metabolism'] },
    ],
    archetype: { predator: 1.5, opportunist: 1 },
    ability: 'tongue',
    apply: (s) => { s.abilities.push('tongue'); s.metabolism *= 1.05; },
    look: (l) => { l.tongue = true; },
  }),
  T({
    id: 'tailpower', name: 'Muscular Tail', icon: '∿', category: 'Locomotion', era: 6,
    bio: 'A thick tail that sculls through water and props you up on land.',
    levels: [
      { name: 'Muscular Tail', cost: 270, pros: ['+18% top speed in water', 'Burst 30% stronger'], cons: ['Slightly slower on land'] },
    ],
    archetype: { predator: 1.5, defender: 0.5 },
    apply: (s) => { s.speed *= 1.18; s.burstPower *= 1.3; s.landSpeed *= 0.88; },
    look: (l) => { l.tailFin = (l.tailFin || 0) + 0.6; },
  }),
  T({
    id: 'bask', name: 'Sun Basking', icon: '☼', category: 'Metabolism', era: 6,
    bio: 'Cold-blooded and proud of it: soak up the sun on warm rock and let the day feed you.',
    levels: [
      { name: 'Sun Basking', cost: 280, pros: ['Gain energy resting in sunlight on land', '−15% metabolism on land'], cons: ['Sluggish in the cold deep (+15% metabolism in darkness)'] },
    ],
    archetype: { phototroph: 3 },
    apply: (s) => { s.bask = 9; s.darkPenalty *= 1.15; },
    look: (l) => { l.mottled = true; },
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

export function archetypeWeights(traits: TraitLevels, recent?: TraitLevels): Record<Archetype, number> {
  const w: Record<Archetype, number> = { predator: 0, defender: 0, opportunist: 0, phototroph: 0 };
  for (const t of TRAITS) {
    // choices made in the current era count extra: your lineage is shaped by what you did lately
    const lv = (traits[t.id] || 0) + (recent?.[t.id] || 0) * 1.5;
    if (!lv) continue;
    for (const k in t.archetype) w[k as Archetype] += (t.archetype[k as Archetype] || 0) * lv;
  }
  return w;
}

export function dominantArchetype(traits: TraitLevels, recent?: TraitLevels): Archetype {
  const w = archetypeWeights(traits, recent);
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
  strike: { name: 'Strike', icon: '❯', cooldown: 3.6, energy: 5 },
  ink: { name: 'Ink', icon: '●', cooldown: 11, energy: 6 },
  tongue: { name: 'Tongue', icon: '⟼', cooldown: 2.2, energy: 3 },
};
