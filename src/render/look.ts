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
  /** ── amniote body plan (Era VII) ── */
  /** dorsal sail (0..2: size) */
  sail?: number;
  /** brow horns (count) */
  horns?: number;
  /** blade-edged teeth */
  serrated?: boolean;
  /** frill of skin around the neck */
  frill?: boolean;
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

/**
 * Blend two looks for evolutionary transformation sequences: numeric structures
 * grow in (spines lengthen, flagella sprout), colours shift, discrete features
 * switch over at the midpoint.
 */
export function lerpLook(a: Look, b: Look, k: number): Look {
  if (k >= 1) return b;
  if (k <= 0) return a;
  const out: Record<string, unknown> = { ...b };
  const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const key of keys) {
    const va = A[key], vb = B[key];
    if (typeof va === 'number' || typeof vb === 'number') {
      const x = typeof va === 'number' ? va : 0, y = typeof vb === 'number' ? vb : 0;
      out[key] = x + (y - x) * k;
    } else if (typeof va === 'string' && typeof vb === 'string' && va[0] === '#' && vb[0] === '#' && va.length === 7 && vb.length === 7) {
      out[key] = mixHexLocal(va, vb, k);
    } else {
      out[key] = k < 0.5 ? va : vb;
    }
  }
  return out as unknown as Look;
}

function mixHexLocal(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
  const g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
  const bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
