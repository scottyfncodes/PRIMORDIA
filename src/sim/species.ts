import { baseLook, type Look } from '../render/look';
import type { ZoneId } from './environment';

export type Defense = 'spiny' | 'shelled' | 'toxic';
export type Category = 'harmless' | 'prey' | 'competitor' | 'predator' | 'rare';

export interface SpeciesDef {
  id: string;
  name: string;
  latin: string;
  desc: string;
  category: Category;
  eras: number[];
  size: [number, number];
  speed: number;
  accel: number;
  diet: 'none' | 'nutrients' | 'prey' | 'both';
  /** Perception range in multiples of own radius */
  sight: number;
  /** 0..1 how readily it hunts */
  aggression: number;
  /** 0..1 tendency to school with kin */
  schooling: number;
  /** 0..1 how skittish it is */
  fear: number;
  lunge?: number;
  sessile?: boolean;
  defenses: Defense[];
  energy: number;
  growth: number;
  dna: number;
  hp: number;
  bite: number;
  /** spawn weighting per zone */
  zones: Partial<Record<ZoneId, number>>;
  weight: number;
  /** spawns only close to vents */
  ventBound?: boolean;
  look: Look;
}

const S = (d: SpeciesDef) => d;

export const SPECIES: SpeciesDef[] = [
  // ───────────── ERA I ─────────────
  S({
    id: 'driftspore', name: 'Driftspore', latin: 'Sporula vagans', category: 'harmless',
    desc: 'A dormant spore carried on the current. Barely alive, but rich in sugars.',
    eras: [1, 2], size: [3.5, 5], speed: 14, accel: 20, diet: 'none', sight: 4, aggression: 0, schooling: 0, fear: 0,
    defenses: [], energy: 5, growth: 2, dna: 0, hp: 4, bite: 0,
    zones: { shallows: 1.2, drift: 1.4, thicket: 0.6, vents: 0.3, abyss: 0.4 }, weight: 1.3,
    look: baseLook({ membrane: '#d8fff4', inner: '#5fb8a8', glow: '#9ef0dc', wobble: 0.02, nucleoid: true }),
  }),
  S({
    id: 'bacillus', name: 'Glimmer Bacillus', latin: 'Bacillus scintillans', category: 'prey',
    desc: 'Rod-shaped and gregarious. Shoals flicker away from anything larger.',
    eras: [1, 2], size: [5, 7.5], speed: 52, accel: 90, diet: 'nutrients', sight: 9, aggression: 0, schooling: 0.85, fear: 0.9,
    defenses: [], energy: 9, growth: 3.5, dna: 1, hp: 6, bite: 0,
    zones: { shallows: 1, drift: 1.2, thicket: 1.4, vents: 0.4, abyss: 0.3 }, weight: 1.6,
    look: baseLook({ body: 'rod', membrane: '#9ff7ff', inner: '#2a8fb0', glow: '#57d9ff', nucleoid: true, flagella: 1, flagLen: 1.3 }),
  }),
  S({
    id: 'spirillum', name: 'Corkscrew Spirillum', latin: 'Spirillum velox', category: 'prey',
    desc: 'A helical sprinter. Hard to catch without real speed.',
    eras: [1, 2], size: [6, 8.5], speed: 105, accel: 150, diet: 'nutrients', sight: 11, aggression: 0, schooling: 0.2, fear: 1,
    defenses: [], energy: 13, growth: 5, dna: 3, hp: 8, bite: 0,
    zones: { shallows: 0.6, drift: 1.2, thicket: 0.5, vents: 0.6, abyss: 0.5 }, weight: 0.9,
    look: baseLook({ body: 'spiral', membrane: '#ffe59a', inner: '#b8862a', glow: '#ffd166' }),
  }),
  S({
    id: 'coccus', name: 'Amber Coccus', latin: 'Coccus avidus', category: 'competitor',
    desc: 'A greedy grazer that competes with you for every nutrient.',
    eras: [1, 2], size: [8, 13], speed: 46, accel: 60, diet: 'nutrients', sight: 10, aggression: 0, schooling: 0.3, fear: 0.5,
    defenses: [], energy: 16, growth: 7, dna: 2, hp: 14, bite: 0,
    zones: { shallows: 1, drift: 1, thicket: 1.1, vents: 0.9, abyss: 0.4 }, weight: 1.1,
    look: baseLook({ membrane: '#ffc77a', inner: '#9a5a1c', glow: '#ffb347', nucleoid: true, wobble: 0.05, cilia: 0.3 }),
  }),
  S({
    id: 'burr', name: 'Burr Cell', latin: 'Echinocyta lenta', category: 'competitor',
    desc: 'Studded with glassy barbs. Touching it unprotected tears your membrane.',
    eras: [1, 2], size: [9, 14], speed: 26, accel: 30, diet: 'nutrients', sight: 6, aggression: 0, schooling: 0, fear: 0.2,
    defenses: ['spiny'], energy: 18, growth: 8, dna: 4, hp: 16, bite: 8,
    zones: { shallows: 0.5, drift: 0.7, thicket: 1.3, vents: 1, abyss: 0.6 }, weight: 0.8,
    look: baseLook({ membrane: '#d9b8ff', inner: '#5a3a8a', glow: '#b57bff', spikes: 14, spikeLen: 0.55, nucleoid: true }),
  }),
  S({
    id: 'ember', name: 'Ember Archaeon', latin: 'Pyrococcus primus', category: 'prey',
    desc: 'Thrives in scalding vent water that would boil other cells.',
    eras: [1, 2], size: [5, 8], speed: 40, accel: 60, diet: 'nutrients', sight: 8, aggression: 0, schooling: 0.6, fear: 0.8,
    defenses: [], energy: 12, growth: 4, dna: 2, hp: 6, bite: 0,
    zones: { vents: 3 }, weight: 1.4, ventBound: true,
    look: baseLook({ membrane: '#ffb08a', inner: '#b8401c', glow: '#ff7b3a', nucleoid: true, wobble: 0.06 }),
  }),
  S({
    id: 'needle', name: 'Needle Hunter', latin: 'Acus venator', category: 'predator',
    desc: 'A darting flagellate predator. It stalks, then strikes in sudden bursts.',
    eras: [1, 2], size: [14, 19], speed: 78, accel: 120, diet: 'prey', sight: 11, aggression: 1, schooling: 0, fear: 0.3, lunge: 2.3,
    defenses: [], energy: 26, growth: 12, dna: 10, hp: 40, bite: 16,
    zones: { shallows: 0.5, drift: 1.1, thicket: 0.6, vents: 0.8, abyss: 1 }, weight: 0.55,
    look: baseLook({ membrane: '#ff8fc2', inner: '#7a1a4a', glow: '#ff4f9a', elong: 0.65, taper: 0.55, flagella: 1, flagLen: 1.8, nucleus: '#ffd0e4', eyespot: true }),
  }),
  S({
    id: 'lurker', name: 'Lurker Amoeba', latin: 'Amoeba insidians', category: 'predator',
    desc: 'Slow and patient. It flows toward prey and folds around it.',
    eras: [1, 2], size: [19, 27], speed: 44, accel: 50, diet: 'prey', sight: 7, aggression: 0.85, schooling: 0, fear: 0.1, lunge: 1.7,
    defenses: [], energy: 40, growth: 18, dna: 15, hp: 70, bite: 20,
    zones: { shallows: 0.4, drift: 0.8, thicket: 1.2, vents: 0.9, abyss: 1.2 }, weight: 0.45,
    look: baseLook({ membrane: '#ff9a8a', inner: '#7a2a2a', glow: '#ff5a5a', lobes: 5, lobeAmp: 0.22, wobble: 0.08, nucleus: '#ffd6c2', vesicles: 6, vesicleColor: '#ffcf8a' }),
  }),
  S({
    id: 'diatom', name: 'Prism Diatom', latin: 'Prismatica lucens', category: 'rare',
    desc: 'Encased in a glass frustule that refracts light. Its shell must be engulfed — or crushed by something much larger.',
    eras: [1, 2], size: [7, 10], speed: 12, accel: 15, diet: 'none', sight: 4, aggression: 0, schooling: 0, fear: 0,
    defenses: ['shelled'], energy: 22, growth: 9, dna: 12, hp: 10, bite: 0,
    zones: { shallows: 1.5, drift: 0.4 }, weight: 0.22,
    look: baseLook({ body: 'diatom', membrane: '#e8fbff', inner: '#5fd0c0', glow: '#bff6ff', shellSides: 6, chloro: 3, glowStrength: 1.4 }),
  }),
  S({
    id: 'aurora', name: 'Aurora Cell', latin: 'Lux errans', category: 'rare',
    desc: 'A shimmering wanderer of the dark. Rich in strange genetic material.',
    eras: [1, 2, 3], size: [6, 9], speed: 120, accel: 160, diet: 'none', sight: 14, aggression: 0, schooling: 0, fear: 1,
    defenses: [], energy: 20, growth: 6, dna: 22, hp: 8, bite: 0,
    zones: { abyss: 1.4, drift: 0.2 }, weight: 0.2,
    look: baseLook({ membrane: '#c2fff1', inner: '#4b6bff', glow: '#7cf7ff', glowStrength: 2, lure: 3, wobble: 0.1 }),
  }),

  // ───────────── ERA II ─────────────
  S({
    id: 'slipper', name: 'Slipper Ciliate', latin: 'Paramecium fugax', category: 'prey',
    desc: 'A fringed swimmer that reverses its cilia to back away from danger.',
    eras: [2, 3], size: [14, 22], speed: 170, accel: 240, diet: 'nutrients', sight: 9, aggression: 0, schooling: 0.5, fear: 0.9,
    defenses: [], energy: 22, growth: 9, dna: 4, hp: 20, bite: 0,
    zones: { shallows: 1, drift: 1.2, thicket: 1.2, vents: 0.5, abyss: 0.4 }, weight: 1.5,
    look: baseLook({ membrane: '#a6f0ff', inner: '#2b7a9a', glow: '#6fdcff', elong: 0.55, slipper: 0.25, cilia: 1, nucleus: '#e3fbff', groove: true, vacuole: true }),
  }),
  S({
    id: 'testate', name: 'Glass Testate', latin: 'Arcella vitrea', category: 'prey',
    desc: 'An amoeba living in a domed glass test. Only engulfers can pry it open.',
    eras: [2, 3], size: [16, 24], speed: 60, accel: 80, diet: 'nutrients', sight: 6, aggression: 0, schooling: 0, fear: 0.3,
    defenses: ['shelled'], energy: 30, growth: 12, dna: 7, hp: 24, bite: 0,
    zones: { shallows: 0.8, drift: 0.6, thicket: 1.2, vents: 0.8, abyss: 0.6 }, weight: 0.8,
    look: baseLook({ body: 'diatom', membrane: '#ffe6b8', inner: '#a8742a', glow: '#ffcf7a', shellSides: 10, plates: 1, nucleus: '#fff2d6' }),
  }),
  S({
    id: 'heliozoan', name: 'Sun Heliozoan', latin: 'Actinophrys solaris', category: 'competitor',
    desc: 'Radiates long needle-arms that snag small prey and punish careless predators.',
    eras: [2, 3], size: [20, 30], speed: 45, accel: 60, diet: 'both', sight: 5, aggression: 0.3, schooling: 0, fear: 0.2,
    defenses: ['spiny'], energy: 34, growth: 14, dna: 6, hp: 34, bite: 12,
    zones: { shallows: 1.2, drift: 0.9, thicket: 0.6, vents: 0.6, abyss: 0.5 }, weight: 0.8,
    look: baseLook({ membrane: '#fff0a6', inner: '#a88a1c', glow: '#ffe066', spikes: 22, spikeLen: 0.95, nucleus: '#fffbe0' }),
  }),
  S({
    id: 'dino', name: 'Stinger Dinoflagellate', latin: 'Toxidinium acre', category: 'predator',
    desc: 'Armoured in cellulose plates and laced with toxins. Eating one unprotected is painful.',
    eras: [2, 3], size: [22, 30], speed: 205, accel: 280, diet: 'prey', sight: 10, aggression: 0.75, schooling: 0, fear: 0.4, lunge: 2,
    defenses: ['toxic'], energy: 38, growth: 15, dna: 9, hp: 50, bite: 18,
    zones: { shallows: 0.9, drift: 1, thicket: 0.5, vents: 1, abyss: 0.8 }, weight: 0.6,
    look: baseLook({ membrane: '#ffa86b', inner: '#8a3a1a', glow: '#ff7f3a', elong: 0.25, plates: 2, flagella: 2, flagLen: 1.2, vesicles: 5, vesicleColor: '#d77bff', eyespot: true }),
  }),
  S({
    id: 'rotifer', name: 'Wheel Grazer', latin: 'Rotaria vorax', category: 'competitor',
    desc: 'Spins a crown of cilia to vacuum up food — including small cells.',
    eras: [2, 3], size: [26, 36], speed: 130, accel: 170, diet: 'both', sight: 8, aggression: 0.4, schooling: 0, fear: 0.4,
    defenses: [], energy: 44, growth: 18, dna: 7, hp: 60, bite: 12,
    zones: { shallows: 0.6, drift: 1, thicket: 1.4, vents: 0.7, abyss: 0.4 }, weight: 0.7,
    look: baseLook({ membrane: '#b8ffcf', inner: '#2a7a4a', glow: '#6fffa8', elong: 0.5, taper: 0.4, cilia: 0.7, nucleus: '#e0ffe8', mito: 4 }),
  }),
  S({
    id: 'chaos', name: 'Chaos Engulfer', latin: 'Chaos carolinensis', category: 'predator',
    desc: 'A colossal amoeba. Its pseudopods can wrap around almost anything.',
    eras: [2, 3], size: [52, 70], speed: 170, accel: 200, diet: 'prey', sight: 6, aggression: 0.9, schooling: 0, fear: 0.05, lunge: 1.6,
    defenses: [], energy: 90, growth: 40, dna: 32, hp: 220, bite: 30,
    zones: { shallows: 0.4, drift: 0.8, thicket: 1, vents: 0.9, abyss: 1.3 }, weight: 0.35,
    look: baseLook({ membrane: '#ff8fa8', inner: '#6a1a3a', glow: '#ff4f7a', lobes: 6, lobeAmp: 0.28, wobble: 0.1, nucleus: '#ffd0dc', vesicles: 10, vesicleColor: '#ffb0c8', mito: 5 }),
  }),
  S({
    id: 'euglena', name: 'Opaline Euglena', latin: 'Euglena opalina', category: 'rare',
    desc: 'Half plant, half hunter. Its chloroplasts hold unusual genes.',
    eras: [2, 3], size: [16, 22], speed: 300, accel: 400, diet: 'none', sight: 12, aggression: 0, schooling: 0, fear: 1,
    defenses: [], energy: 30, growth: 10, dna: 26, hp: 20, bite: 0,
    zones: { shallows: 1.4, abyss: 0.5 }, weight: 0.2,
    look: baseLook({ membrane: '#d6ffb0', inner: '#3a8a2a', glow: '#b4ff6a', elong: 0.7, taper: 0.5, flagella: 1, flagLen: 1.5, chloro: 6, eyespot: true, glowStrength: 1.6 }),
  }),

  // ───────────── ERA III ─────────────
  S({
    id: 'volvox', name: 'Rolling Volvox', latin: 'Volvox volvens', category: 'prey',
    desc: 'A hollow sphere of a thousand cooperating cells, rolling through the light.',
    eras: [3], size: [34, 52], speed: 170, accel: 200, diet: 'none', sight: 7, aggression: 0, schooling: 0.3, fear: 0.6,
    defenses: [], energy: 50, growth: 18, dna: 9, hp: 40, bite: 0,
    zones: { shallows: 1.6, drift: 1, thicket: 0.6, vents: 0.3, abyss: 0.2 }, weight: 1.3,
    look: baseLook({ body: 'colony', membrane: '#c8ffb0', inner: '#4a9a2a', glow: '#9cff6a', chloro: 0 }),
  }),
  S({
    id: 'larva', name: 'Bell Larva', latin: 'Medusula parva', category: 'prey',
    desc: 'A tiny pulsing bell — a glimpse of animal life to come.',
    eras: [3, 4], size: [30, 46], speed: 300, accel: 380, diet: 'nutrients', sight: 8, aggression: 0, schooling: 0.6, fear: 0.8,
    defenses: [], energy: 55, growth: 20, dna: 10, hp: 50, bite: 0,
    zones: { shallows: 0.8, drift: 1.4, thicket: 0.6, vents: 0.6, abyss: 0.8 }, weight: 1.1,
    look: baseLook({ body: 'jelly', membrane: '#e6d6ff', inner: '#6a4ab8', glow: '#b48aff', tentacles: 4 }),
  }),
  S({
    id: 'hydra', name: 'Anchored Polyp', latin: 'Hydra ancestralis', category: 'predator',
    desc: 'Rooted in place, it sweeps stinging tentacles through passing water.',
    eras: [3, 4], size: [60, 80], speed: 6, accel: 8, diet: 'prey', sight: 3.2, aggression: 1, schooling: 0, fear: 0, sessile: true, lunge: 1,
    defenses: ['toxic'], energy: 120, growth: 45, dna: 30, hp: 260, bite: 34,
    zones: { thicket: 1.4, vents: 1, drift: 0.4, abyss: 0.8 }, weight: 0.4,
    look: baseLook({ body: 'polyp', membrane: '#ffb0d8', inner: '#8a2a6a', glow: '#ff6ac8', tentacles: 7 }),
  }),
  S({
    id: 'worm', name: 'Proto-Worm', latin: 'Vermiforma prima', category: 'predator',
    desc: 'Segmented, muscular and relentless — the first true hunter of the deep.',
    eras: [3, 4], size: [95, 130], speed: 430, accel: 520, diet: 'prey', sight: 6, aggression: 0.95, schooling: 0, fear: 0, lunge: 1.8,
    defenses: [], energy: 160, growth: 60, dna: 45, hp: 420, bite: 48,
    zones: { drift: 0.8, thicket: 0.6, vents: 1, abyss: 1.5 }, weight: 0.28,
    look: baseLook({ body: 'worm', membrane: '#ff9a7a', inner: '#7a2a1a', glow: '#ff5a3a' }),
  }),
  S({
    id: 'comb', name: 'Comb Drifter', latin: 'Ctenophora aurora', category: 'rare',
    desc: 'Rows of beating combs scatter light into rainbows. A treasure of the deep.',
    eras: [3, 4], size: [42, 58], speed: 520, accel: 600, diet: 'none', sight: 12, aggression: 0, schooling: 0, fear: 1,
    defenses: [], energy: 70, growth: 20, dna: 48, hp: 50, bite: 0,
    zones: { abyss: 1.4, drift: 0.5 }, weight: 0.18,
    look: baseLook({ body: 'jelly', membrane: '#e0fffb', inner: '#3a7aaa', glow: '#8afcff', combs: true, glowStrength: 1.8 }),
  }),
  // ───────────── ERA IV ─────────────
  S({
    id: 'darter', name: 'Darting Larva', latin: 'Natatrix minima', category: 'prey',
    desc: 'A tiny segmented swimmer. Schools flash and scatter at the first sign of a hunter.',
    eras: [4], size: [48, 72], speed: 760, accel: 1100, diet: 'nutrients', sight: 9, aggression: 0, schooling: 0.85, fear: 0.95,
    defenses: [], energy: 70, growth: 30, dna: 10, hp: 60, bite: 0,
    zones: { shallows: 1.3, drift: 1.4, thicket: 0.8, vents: 0.6, abyss: 0.5 }, weight: 1.6,
    look: baseLook({ body: 'swimmer', membrane: '#bdf6ff', inner: '#2a7f9a', glow: '#6fe0ff', elong: 0.6, segments: 6, fins: 1, tailFin: 0.8, eyes: 1, receptors: 2 }),
  }),
  S({
    id: 'moonbell', name: 'Moon Bell', latin: 'Aurelia prisca', category: 'prey',
    desc: 'A drifting bell trailing stinging threads. Nourishing — but it burns going down.',
    eras: [4], size: [70, 110], speed: 160, accel: 200, diet: 'none', sight: 5, aggression: 0, schooling: 0.2, fear: 0.3,
    defenses: ['toxic'], energy: 110, growth: 45, dna: 14, hp: 120, bite: 0,
    zones: { shallows: 1.1, drift: 1.3, thicket: 0.4, vents: 0.4, abyss: 1 }, weight: 1,
    look: baseLook({ body: 'jelly', membrane: '#f0e6ff', inner: '#7a6ab8', glow: '#c8b4ff', tentacles: 8, glowStrength: 1.4 }),
  }),
  S({
    id: 'crawler', name: 'Plated Crawler', latin: 'Trilobitoides lentus', category: 'competitor',
    desc: 'Armoured in overlapping plates. Only crushing claws, engulfing bodies or real bulk can crack it.',
    eras: [4], size: [80, 125], speed: 140, accel: 200, diet: 'nutrients', sight: 6, aggression: 0, schooling: 0.2, fear: 0.4,
    defenses: ['shelled'], energy: 140, growth: 55, dna: 16, hp: 200, bite: 0,
    zones: { shallows: 0.5, drift: 0.6, thicket: 1.4, vents: 1.3, abyss: 0.8 }, weight: 0.9,
    look: baseLook({ body: 'swimmer', membrane: '#ffd9a0', inner: '#8a5a2a', glow: '#ffb860', elong: 0.2, segments: 9, carapace: true, eyes: 1, receptors: 2 }),
  }),
  S({
    id: 'frond', name: 'Sea Frond', latin: 'Charnia antiqua', category: 'harmless',
    desc: 'A feathered frond rooted to the sea floor, drinking light. One of the first large living things.',
    eras: [4], size: [90, 140], speed: 4, accel: 6, diet: 'none', sight: 2, aggression: 0, schooling: 0, fear: 0, sessile: true,
    defenses: [], energy: 120, growth: 50, dna: 8, hp: 90, bite: 0,
    zones: { shallows: 1.8, drift: 0.6, thicket: 0.8 }, weight: 0.9,
    look: baseLook({ body: 'frond', membrane: '#d8ffb8', inner: '#3f8a3a', glow: '#a8ff7a', chloro: 0 }),
  }),
  S({
    id: 'lamprey', name: 'Jawless Lamprey', latin: 'Petromyzon primus', category: 'predator',
    desc: 'A relentless eel-like hunter. Not the fastest striker, but it never tires of the chase.',
    eras: [4], size: [140, 190], speed: 900, accel: 900, diet: 'prey', sight: 8, aggression: 0.9, schooling: 0, fear: 0.1, lunge: 1.35,
    defenses: [], energy: 220, growth: 80, dna: 34, hp: 380, bite: 55,
    zones: { shallows: 0.5, drift: 1.2, thicket: 0.6, vents: 1, abyss: 1.3 }, weight: 0.45,
    look: baseLook({ body: 'swimmer', membrane: '#ff9ab0', inner: '#6a1a3a', glow: '#ff5a8a', elong: 1.6, segments: 13, tailFin: 0.6, eyes: 1 }),
  }),
  S({
    id: 'raptor', name: 'Clawed Raptor', latin: 'Anomalocaris rex', category: 'predator',
    desc: 'The apex of the Cambrian sea. Huge eyes, grasping claws and terrible acceleration.',
    eras: [4], size: [230, 300], speed: 760, accel: 900, diet: 'prey', sight: 7, aggression: 1, schooling: 0, fear: 0, lunge: 2,
    defenses: [], energy: 360, growth: 130, dna: 60, hp: 900, bite: 80,
    zones: { shallows: 0.6, drift: 1, thicket: 0.5, vents: 0.9, abyss: 1.2 }, weight: 0.22,
    look: baseLook({ body: 'swimmer', membrane: '#ff8a6a', inner: '#7a2a1a', glow: '#ff6a3a', elong: 0.5, segments: 10, fins: 4, tailFin: 1.2, eyes: 2, claws: 2 }),
  }),
  S({
    id: 'nautiloid', name: 'Spiral Drifter', latin: 'Orthoceras aureum', category: 'rare',
    desc: 'A chambered shell that rises and sinks at will. Its genes are a treasure — and its shell must be cracked.',
    eras: [4], size: [95, 130], speed: 560, accel: 600, diet: 'none', sight: 12, aggression: 0, schooling: 0, fear: 1,
    defenses: ['shelled'], energy: 180, growth: 50, dna: 70, hp: 160, bite: 0,
    zones: { abyss: 1.4, drift: 0.5, vents: 0.4 }, weight: 0.16,
    look: baseLook({ body: 'nautilus', membrane: '#fff0c8', inner: '#b8742a', glow: '#ffd27a', tentacles: 8, glowStrength: 1.5 }),
  }),
];

export const SPECIES_BY_ID: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
