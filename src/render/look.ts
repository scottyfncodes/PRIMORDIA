/** Data description of how an organism is drawn. Shared by NPC species and the player. */
export type BodyKind = 'cell' | 'rod' | 'spiral' | 'diatom' | 'colony' | 'polyp' | 'jelly' | 'worm' | 'swimmer' | 'frond' | 'nautilus';

export interface Look {
  body: BodyKind;
  /** shape params for 'cell' style bodies */
  elong: number;
  taper: number;
  lobes: number;
  lobeAmp: number;
  slipper: number;
  wobble: number;
  membrane: string;
  inner: string;
  glow: string;
  glowStrength?: number;
  nucleus?: string | null;
  nucleoid?: boolean;
  flagella?: number;
  flagLen?: number;
  cilia?: number;
  spikes?: number;
  spikeLen?: number;
  plates?: number;
  chloro?: number;
  mito?: number;
  vesicles?: number;
  vesicleColor?: string;
  eyespot?: boolean;
  receptors?: number;
  vacuole?: boolean;
  groove?: boolean;
  tentacles?: number;
  lure?: number;
  pores?: number;
  combs?: boolean;
  shellSides?: number;
  cells?: number;
  /** ── animal body plan (Era IV) ── */
  segments?: number;
  fins?: number;
  tailFin?: number;
  eyes?: number;
  claws?: number;
  carapace?: boolean;
  fronds?: number;
  lateral?: boolean;
  gills?: boolean;
  ink?: boolean;
  /** ── vertebrate body plan (Era V) ── */
  vertebrate?: boolean;
  jaw?: number;
  headArmor?: boolean;
  lobeFins?: boolean;
  scales?: boolean;
  electro?: boolean;
  mottled?: boolean;
  forkTail?: boolean;
  /** ── land body plan (Era VI) ── */
  legs?: number;
  legLen?: number;
  wings?: boolean;
  airSac?: boolean;
  ears?: boolean;
  tongue?: boolean;
  eggs?: boolean;
}

export const baseLook = (o: Partial<Look>): Look => ({
  body: 'cell',
  elong: 0,
  taper: 0,
  lobes: 0,
  lobeAmp: 0,
  slipper: 0,
  wobble: 0.04,
  membrane: '#7af5df',
  inner: '#1d6f7a',
  glow: '#3fe0c5',
  nucleus: null,
  ...o,
});
