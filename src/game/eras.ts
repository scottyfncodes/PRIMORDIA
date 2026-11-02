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
}

export const ERAS: EraDef[] = [
  { index: 1, numeral: 'I', name: 'Primordial Life', subtitle: 'Single cells in a young sea', playable: true, minR: 10, maxR: 20, growthNeeded: 300, mutationsToLeap: 2, drain: 1.25, nutrientR: 2.6, nutrientEnergy: 3.2, dnaMoteChance: 0.06, populationTarget: 64 },
  { index: 2, numeral: 'II', name: 'Complex Cells', subtitle: 'Nuclei, organelles and new ways to eat', playable: true, minR: 24, maxR: 46, growthNeeded: 1250, mutationsToLeap: 5, drain: 1.7, nutrientR: 5, nutrientEnergy: 4.2, dnaMoteChance: 0.045, populationTarget: 60 },
  { index: 3, numeral: 'III', name: 'Multicellular Life', subtitle: 'Many cells, one body', playable: true, minR: 56, maxR: 104, growthNeeded: 3200, mutationsToLeap: 99, drain: 2.2, nutrientR: 10, nutrientEnergy: 5.5, dnaMoteChance: 0.035, populationTarget: 54 },
  { index: 4, numeral: 'IV', name: 'Early Aquatic Life', subtitle: 'Primitive swimmers, hunters and the first eyes', playable: false, minR: 0, maxR: 0, growthNeeded: 0, mutationsToLeap: 0, drain: 0, nutrientR: 0, nutrientEnergy: 0, dnaMoteChance: 0, populationTarget: 0 },
  { index: 5, numeral: 'V', name: 'Vertebrate Life', subtitle: 'Backbones, fins and complex predators', playable: false, minR: 0, maxR: 0, growthNeeded: 0, mutationsToLeap: 0, drain: 0, nutrientR: 0, nutrientEnergy: 0, dnaMoteChance: 0, populationTarget: 0 },
  { index: 6, numeral: 'VI', name: 'Land Transition', subtitle: 'A new world above the water', playable: false, minR: 0, maxR: 0, growthNeeded: 0, mutationsToLeap: 0, drain: 0, nutrientR: 0, nutrientEnergy: 0, dnaMoteChance: 0, populationTarget: 0 },
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
];

export const FORM_BY_ID: Record<string, FormDef> = Object.fromEntries(FORMS.map((f) => [f.id, f]));

export function formFor(era: number, archetype: Archetype): FormDef {
  if (era <= 1) return FORM_BY_ID['protocell'];
  return FORMS.find((f) => f.era === era && f.archetype === archetype) || FORM_BY_ID['protocell'];
}
