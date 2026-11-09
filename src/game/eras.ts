import type { Look } from '../render/look';
import type { Archetype } from './traits';

export interface EraDef {
  index: number;
  numeral: string;
  name: string;
  subtitle: string;
  playable: boolean;
  minR: number;
  maxR: number;
  growthNeeded: number;
  mutationsToLeap: number;
  drain: number;
  nutrientR: number;
  nutrientEnergy: number;
  dnaMoteChance: number;
  populationTarget: number;
  /** size of the sea relative to Era I (the world rescales at the leap) */
  worldScale: number;
}

export const ERAS: EraDef[] = [
  { index: 1, numeral: 'I', name: 'Primordial Life', subtitle: 'Single cells in a young sea', playable: true, minR: 10, maxR: 20, growthNeeded: 300, mutationsToLeap: 2, drain: 1.25, nutrientR: 2.6, nutrientEnergy: 3.2, dnaMoteChance: 0.06, populationTarget: 64, worldScale: 1 },
  { index: 2, numeral: 'II', name: 'Complex Cells', subtitle: 'Nuclei, organelles and new ways to eat', playable: true, minR: 24, maxR: 46, growthNeeded: 1250, mutationsToLeap: 5, drain: 1.7, nutrientR: 5, nutrientEnergy: 4.2, dnaMoteChance: 0.045, populationTarget: 60, worldScale: 1 },
  { index: 3, numeral: 'III', name: 'Multicellular Life', subtitle: 'Many cells, one body', playable: true, minR: 56, maxR: 104, growthNeeded: 3200, mutationsToLeap: 9, drain: 2.2, nutrientR: 10, nutrientEnergy: 5.5, dnaMoteChance: 0.035, populationTarget: 54, worldScale: 2 },
  { index: 4, numeral: 'IV', name: 'Early Aquatic Life', subtitle: 'Primitive swimmers, hunters and the first eyes', playable: true, minR: 112, maxR: 200, growthNeeded: 6000, mutationsToLeap: 13, drain: 2.8, nutrientR: 20, nutrientEnergy: 7, dnaMoteChance: 0.03, populationTarget: 46, worldScale: 4 },
  { index: 5, numeral: 'V', name: 'Vertebrate Life', subtitle: 'Backbones, fins and complex predators', playable: true, minR: 230, maxR: 400, growthNeeded: 11000, mutationsToLeap: 17, drain: 3.4, nutrientR: 40, nutrientEnergy: 9, dnaMoteChance: 0.025, populationTarget: 40, worldScale: 8 },
  { index: 6, numeral: 'VI', name: 'Land Transition', subtitle: 'A new world above the water', playable: true, minR: 420, maxR: 700, growthNeeded: 18000, mutationsToLeap: 21, drain: 4.2, nutrientR: 70, nutrientEnergy: 12, dnaMoteChance: 0.02, populationTarget: 38, worldScale: 14 },
  { index: 7, numeral: 'VII', name: 'Age of Reptiles', subtitle: 'Scales, eggs and the first giants of the land', playable: true, minR: 740, maxR: 1250, growthNeeded: 28000, mutationsToLeap: 99, drain: 5, nutrientR: 120, nutrientEnergy: 15, dnaMoteChance: 0.018, populationTarget: 36, worldScale: 24 },
];

export const MAX_PLAYABLE_ERA = ERAS.filter((e) => e.playable).length;

export interface Palette { membrane: string; inner: string; glow: string }

export const BASE_PALETTE: Palette = { membrane: '#8ffbe6', inner: '#16707a', glow: '#3fe0c5' };
export const ARCHETYPE_PALETTE: Record<Archetype, Palette> = {
  predator: { membrane: '#ff9ad5', inner: '#6a1f5a', glow: '#ff5fb8' },
  defender: { membrane: '#ffd59a', inner: '#7a4a1a', glow: '#ffb35a' },
  opportunist: { membrane: '#8fe6ff', inner: '#1a4f8a', glow: '#4fb8ff' },
  phototroph: { membrane: '#c8ff9a', inner: '#2f7a2a', glow: '#8dff6a' },
};

export const ARCHETYPE_INFO: Record<Archetype, { name: string; blurb: string }> = {
  predator: { name: 'Predator', blurb: 'Fast, perceptive and hungry. Lives by the hunt.' },
  defender: { name: 'Defensive Survivor', blurb: 'Armoured and enduring. Lets the world break against it.' },
  opportunist: { name: 'Opportunistic Feeder', blurb: 'Efficient and adaptable. Eats whatever the sea provides.' },
  phototroph: { name: 'Photosynthetic Organism', blurb: 'Fed by sunlight. Thrives where light falls.' },
};

export interface FormDef {
  id: string;
  era: number;
  archetype: Archetype | null;
  name: string;
  desc: string;
  shape: (l: Look) => void;
}

export const FORMS: FormDef[] = [
  { id: 'protocell', era: 1, archetype: null, name: 'Protocell', desc: 'A simple bubble of chemistry that learned to copy itself.', shape: (l) => { l.nucleoid = true; } },

  { id: 'e2-predator', era: 2, archetype: 'predator', name: 'Hunter Amoeboid', desc: 'A complex cell built for pursuit, with a nucleus and an appetite to match.', shape: (l) => { l.elong += 0.3; l.taper += 0.15; l.lobes = Math.max(l.lobes, 3); l.lobeAmp = Math.max(l.lobeAmp, 0.1); l.nucleus = '#ffd6ec'; l.vesicles = (l.vesicles || 0) + 3; } },
  { id: 'e2-defender', era: 2, archetype: 'defender', name: 'Armoured Testate', desc: 'A complex cell wrapped in mineral layers. Slow, stubborn, hard to kill.', shape: (l) => { l.plates = Math.max(l.plates || 0, 1) + 1; l.wobble *= 0.5; l.nucleus = '#fff0d6'; } },
  { id: 'e2-opportunist', era: 2, archetype: 'opportunist', name: 'Ciliate Forager', desc: 'A slipper-shaped generalist that can turn on a dime and eat on the move.', shape: (l) => { l.elong += 0.45; l.slipper = Math.max(l.slipper, 0.18); l.nucleus = '#e3f6ff'; l.cilia = Math.max(l.cilia || 0, 0.4); } },
  { id: 'e2-phototroph', era: 2, archetype: 'phototroph', name: 'Euglenoid Drifter', desc: 'A spindle of green light, part plant and part animal.', shape: (l) => { l.elong += 0.55; l.taper += 0.4; l.eyespot = true; l.nucleus = '#eaffd6'; l.chloro = (l.chloro || 0) + 4; } },

  { id: 'e3-predator', era: 3, archetype: 'predator', name: 'Siphon Hunter', desc: 'A streamlined body of specialised cells: some to swim, some to sting, some to digest.', shape: (l) => { l.elong += 0.6; l.taper += 0.35; l.nucleus = null; l.pores = 0; l.cells = 9; } },
  { id: 'e3-defender', era: 3, archetype: 'defender', name: 'Sponge Fortress', desc: 'A porous, walled colony that filters the sea and fears very little.', shape: (l) => { l.pores = 12; l.plates = Math.max(l.plates || 0, 2); l.nucleus = null; l.cells = 7; l.wobble *= 0.5; } },
  { id: 'e3-opportunist', era: 3, archetype: 'opportunist', name: 'Swarm Colony', desc: 'A loose federation of cells that flows around obstacles and food alike.', shape: (l) => { l.lobes = Math.max(l.lobes, 5); l.lobeAmp = Math.max(l.lobeAmp, 0.12); l.nucleus = null; l.cells = 13; } },
  { id: 'e3-phototroph', era: 3, archetype: 'phototroph', name: 'Volvocine Sun-Sphere', desc: 'A radiant sphere of green cells, turning gently toward the light.', shape: (l) => { l.nucleus = null; l.cells = 16; l.chloro = (l.chloro || 0) + 4; l.wobble *= 0.6; } },

  { id: 'e4-predator', era: 4, archetype: 'predator', name: 'Clawed Hunter', desc: 'A true animal hunter: forward-facing eyes, grasping claws and a powerful tail.', shape: (l) => { swimmer(l); l.claws = Math.max(l.claws || 0, 1); l.eyes = Math.max(l.eyes || 0, 2); l.fins = (l.fins || 0) + 2; l.tailFin = (l.tailFin || 0) + 1; l.segments = 8; } },
  { id: 'e4-defender', era: 4, archetype: 'defender', name: 'Armoured Crawler', desc: 'Jointed plates from head to tail. Predators break their mouths on it.', shape: (l) => { swimmer(l); l.carapace = true; l.segments = 9; l.eyes = Math.max(l.eyes || 0, 1); l.fins = (l.fins || 0) + 1; l.tailFin = (l.tailFin || 0) + 0.5; l.elong = Math.min(l.elong, 0.3); } },
  { id: 'e4-opportunist', era: 4, archetype: 'opportunist', name: 'Finned Forager', desc: 'Quick, nimble and never picky — a body built to turn and to taste the water.', shape: (l) => { swimmer(l); l.fins = (l.fins || 0) + 3; l.tailFin = (l.tailFin || 0) + 1.1; l.eyes = Math.max(l.eyes || 0, 1); l.segments = 7; l.receptors = 2; } },
  { id: 'e4-phototroph', era: 4, archetype: 'phototroph', name: 'Frond Glider', desc: 'A gliding animal draped in living, sun-drinking fronds.', shape: (l) => { swimmer(l); l.fronds = (l.fronds || 0) + 4; l.fins = (l.fins || 0) + 2; l.eyes = Math.max(l.eyes || 0, 1); l.segments = 7; l.tailFin = (l.tailFin || 0) + 0.6; } },

  { id: 'e5-predator', era: 5, archetype: 'predator', name: 'Cartilage Hunter', desc: 'Jaws, teeth and a forked tail: the template every great hunter will follow.', shape: (l) => { fish(l, 0.95); l.jaw = 2; l.forkTail = true; l.eyes = Math.max(l.eyes || 0, 1); l.fins = Math.max(l.fins || 0, 2) + 2; l.tailFin = (l.tailFin || 0) + 1.2; } },
  { id: 'e5-defender', era: 5, archetype: 'defender', name: 'Plated Placoderm', desc: 'A fish in a suit of bone, with a head shield no predator wants to bite.', shape: (l) => { fish(l, 0.45); l.headArmor = true; l.jaw = Math.max(l.jaw || 0, 1); l.scales = true; l.fins = Math.max(l.fins || 0, 2); l.tailFin = (l.tailFin || 0) + 0.8; } },
  { id: 'e5-opportunist', era: 5, archetype: 'opportunist', name: 'Lobe-Finned Rover', desc: 'Fleshy, boned fins that can push off the sea floor. Somewhere in them, legs are waiting.', shape: (l) => { fish(l, 0.6); l.lobeFins = true; l.fins = Math.max(l.fins || 0, 4); l.scales = true; l.jaw = Math.max(l.jaw || 0, 1); l.tailFin = (l.tailFin || 0) + 0.9; } },
  { id: 'e5-phototroph', era: 5, archetype: 'phototroph', name: 'Kelp-Backed Drifter', desc: 'A gentle fish wearing a living garden of algae on its back, basking in the shallows.', shape: (l) => { fish(l, 0.55); l.fronds = Math.max(l.fronds || 0, 3) + 2; l.mottled = true; l.fins = Math.max(l.fins || 0, 2); l.tailFin = (l.tailFin || 0) + 0.7; } },

  { id: 'e6-predator', era: 6, archetype: 'predator', name: 'Ambush Tetrapod', desc: 'A broad-headed hunter that waits in the shallows and lunges onto the shore.', shape: (l) => { fish(l, 0.75); tetrapod(l); l.jaw = 2; l.eyes = Math.max(l.eyes || 0, 2); l.tailFin = (l.tailFin || 0) + 0.8; } },
  { id: 'e6-defender', era: 6, archetype: 'defender', name: 'Armoured Amphibian', desc: 'Low, heavy and plated with bony scutes. It walks where it likes.', shape: (l) => { fish(l, 0.45); tetrapod(l); l.headArmor = true; l.scales = true; l.legLen = 0.5; l.tailFin = (l.tailFin || 0) + 0.4; } },
  { id: 'e6-opportunist', era: 6, archetype: 'opportunist', name: 'Coastal Walker', desc: 'Long-legged and curious, at home on the wet sand between two worlds.', shape: (l) => { fish(l, 0.6); tetrapod(l); l.legLen = 0.8; l.jaw = Math.max(l.jaw || 0, 1); l.tailFin = (l.tailFin || 0) + 0.5; } },
  { id: 'e6-phototroph', era: 6, archetype: 'phototroph', name: 'Moss-Backed Basker', desc: 'Its back is a living carpet of moss and algae. It lies in the sun and simply grows.', shape: (l) => { fish(l, 0.5); tetrapod(l); l.fronds = Math.max(l.fronds || 0, 3) + 3; l.mottled = true; l.legLen = 0.55; l.tailFin = (l.tailFin || 0) + 0.5; } },

  { id: 'e7-predator', era: 7, archetype: 'predator', name: 'Serrated Tyrant', desc: 'Upright legs, a deep skull and blade-edged teeth. The first true terror of the dry land.', shape: (l) => { fish(l, 0.85); tetrapod(l); amniote(l); l.jaw = 2; l.serrated = true; l.eyes = Math.max(l.eyes || 0, 2); l.legLen = 0.95; } },
  { id: 'e7-defender', era: 7, archetype: 'defender', name: 'Horned Shieldback', desc: 'A walking fortress of bony scutes, crowned with a pair of brow horns.', shape: (l) => { fish(l, 0.45); tetrapod(l); amniote(l); l.headArmor = true; l.horns = Math.max(l.horns || 0, 2); l.legLen = 0.55; } },
  { id: 'e7-opportunist', era: 7, archetype: 'opportunist', name: 'Swift Strider', desc: 'Light, long-legged and endlessly curious: it covers more ground than anything alive.', shape: (l) => { fish(l, 0.7); tetrapod(l); amniote(l); l.legLen = 1.05; l.jaw = Math.max(l.jaw || 0, 1); } },
  { id: 'e7-phototroph', era: 7, archetype: 'phototroph', name: 'Sail-Backed Basker', desc: 'A great fan of skin along its spine drinks the morning sun, warming it before anything else is awake.', shape: (l) => { fish(l, 0.6); tetrapod(l); amniote(l); l.sail = Math.max(l.sail || 0, 1); l.mottled = true; l.legLen = 0.65; } },
];

/** Era VII: the amniote body — dry scaly skin, lungs, a land animal through and through. */
function amniote(l: Look) {
  l.scales = true;
  l.gills = false;
  l.airSac = true;
  l.tailFin = Math.min(l.tailFin || 0, 0.35);
}

/** Era VI: fins become weight-bearing limbs. */
function tetrapod(l: Look) {
  l.legs = 2;
  l.legLen = l.legLen || 0.65;
  l.lobeFins = false;
  l.fins = 0;
  l.forkTail = false;
}

/** Shared Era V vertebrate body plan. */
function fish(l: Look, elong: number) {
  swimmer(l);
  l.vertebrate = true;
  l.carapace = false;
  l.claws = 0;
  l.receptors = 0;
  l.elong = elong;
  l.segments = 10;
  l.eyes = Math.max(l.eyes || 0, 1);
}

/** Shared Era IV animal body plan. */
function swimmer(l: Look) {
  l.body = 'swimmer';
  l.nucleus = null; l.nucleoid = false; l.cells = 0; l.pores = 0;
  l.lobes = 0; l.lobeAmp = 0; l.slipper = 0;
  l.elong = Math.min(1.2, 0.5 + l.elong * 0.3);
  l.wobble = 0.02;
}

export const FORM_BY_ID: Record<string, FormDef> = Object.fromEntries(FORMS.map((f) => [f.id, f]));

export function formFor(era: number, archetype: Archetype): FormDef {
  if (era <= 1) return FORM_BY_ID['protocell'];
  return FORMS.find((f) => f.era === era && f.archetype === archetype) || FORM_BY_ID['protocell'];
}

/**
 * Inherited gifts: the body plan you choose at a leap carries a lasting, era-scaled
 * advantage, so choosing a branch of the tree is a real decision, not a cosmetic one.
 */
export interface FormGift { name: string; lines: string[]; apply: (s: import('./traits').Stats, era: number) => void }
export const FORM_GIFTS: Record<Archetype, FormGift> = {
  predator: { name: 'Hunter\'s Body', lines: ['+8% top speed', 'Swallows slightly larger prey'], apply: (s, e) => { s.speed *= 1 + 0.04 + 0.01 * e; s.eatRatio += 0.03 + 0.005 * e; s.strikeRatio += 0.05; } },
  defender: { name: 'Armoured Body', lines: ['−15% damage taken', '+15% integrity'], apply: (s, e) => { s.damageTaken *= 0.88 - 0.006 * e; s.maxHp *= 1.1 + 0.01 * e; } },
  opportunist: { name: 'Forager\'s Body', lines: ['+12% energy from food', 'Wider nutrient pull'], apply: (s, e) => { s.digestion *= 1.08 + 0.008 * e; s.magnet += 0.35 + 0.05 * e; } },
  phototroph: { name: 'Sun-Drinker\'s Body', lines: ['Draws energy from light', '−10% metabolic drain'], apply: (s) => { s.photo += 0.8; s.metabolism *= 0.9; } },
};

/**
 * The branches open to a lineage at a leap: the path its mutations point to, then the
 * strongest alternative. Ties fall back to a fixed order so the choice is deterministic.
 */
export function leapChoices(era: number, weights: Record<Archetype, number>, dominant: Archetype): FormDef[] {
  const order: Archetype[] = ['predator', 'defender', 'opportunist', 'phototroph'];
  const rest = order.filter((a) => a !== dominant).sort((a, b) => weights[b] - weights[a] || order.indexOf(a) - order.indexOf(b));
  return [formFor(era, dominant), formFor(era, rest[0])];
}
