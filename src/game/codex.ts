import type { SpeciesDef } from '../sim/species';
import { SPECIES } from '../sim/species';
import { ZONES, type ZoneId } from '../sim/environment';

/**
 * Field-journal knowledge about each species, derived from the species data
 * (look, behaviour, habitat) plus a small taxonomy table. Adding a species only
 * needs a clade entry here; everything else is inferred.
 */

export interface Clade { key: string; name: string; path: string[]; blurb: string }

export const CLADES: Record<string, Clade> = {
  protobacteria: { key: 'protobacteria', name: 'Protobacteria', path: ['Bacteria', 'Protobacteria'], blurb: 'The first free-living cells: tiny, nucleus-free and quick to divide.' },
  archaea: { key: 'archaea', name: 'Thermoarchaea', path: ['Archaea', 'Thermoarchaea'], blurb: 'Ancient heat-lovers with membranes unlike any other life.' },
  luminaria: { key: 'luminaria', name: 'Luminaria', path: ['Incertae sedis', 'Luminaria'], blurb: 'Glowing cells of uncertain ancestry. No one knows where they belong.' },
  excavata: { key: 'excavata', name: 'Excavata', path: ['Eukaryota', 'Excavata'], blurb: 'Whip-tailed swimmers with a feeding groove: some hunt, some photosynthesise.' },
  amoebozoa: { key: 'amoebozoa', name: 'Amoebozoa', path: ['Eukaryota', 'Amoebozoa'], blurb: 'Shape-shifting cells that crawl and feed on flowing pseudopods.' },
  stramenopiles: { key: 'stramenopiles', name: 'Stramenopila', path: ['Eukaryota', 'Stramenopila'], blurb: 'Algae that build intricate glass houses of silica.' },
  alveolata: { key: 'alveolata', name: 'Alveolata', path: ['Eukaryota', 'Alveolata'], blurb: 'Cells with a quilted layer of sacs beneath the membrane: ciliates and armoured flagellates.' },
  haptista: { key: 'haptista', name: 'Actinophryida', path: ['Eukaryota', 'Actinophryida'], blurb: 'Sun-shaped cells radiating stiff, sticky arms.' },
  chlorophyta: { key: 'chlorophyta', name: 'Volvocales', path: ['Eukaryota', 'Chlorophyta'], blurb: 'Green algae that learned to live together as one rolling body.' },
  rotifera: { key: 'rotifera', name: 'Rotifera', path: ['Animalia', 'Rotifera'], blurb: 'Microscopic animals crowned with a wheel of beating cilia.' },
  cnidaria: { key: 'cnidaria', name: 'Cnidaria', path: ['Animalia', 'Cnidaria'], blurb: 'Bells and polyps armed with stinging cells.' },
  ctenophora: { key: 'ctenophora', name: 'Ctenophora', path: ['Animalia', 'Ctenophora'], blurb: 'Comb-rowed drifters that scatter rainbows as they swim.' },
  annelida: { key: 'annelida', name: 'Annelida', path: ['Animalia', 'Annelida'], blurb: 'Segmented worms, the first bodies built from repeating units.' },
  petalonamae: { key: 'petalonamae', name: 'Petalonamae', path: ['Animalia', 'Petalonamae'], blurb: 'Frond-shaped animals of the earliest seafloor gardens.' },
  arthropoda: { key: 'arthropoda', name: 'Arthropoda', path: ['Animalia', 'Arthropoda'], blurb: 'Jointed legs and armoured plates: the most successful body plan ever evolved.' },
  mollusca: { key: 'mollusca', name: 'Cephalopoda', path: ['Animalia', 'Mollusca'], blurb: 'Shelled hunters that steer with jets of water.' },
  chordata: { key: 'chordata', name: 'Proto-chordata', path: ['Animalia', 'Chordata'], blurb: 'Soft swimmers with a stiffening rod along the back: the first hint of a spine.' },
  agnatha: { key: 'agnatha', name: 'Agnatha', path: ['Chordata', 'Agnatha'], blurb: 'Jawless fish: the first animals with a true backbone.' },
  chondrichthyes: { key: 'chondrichthyes', name: 'Chondrichthyes', path: ['Chordata', 'Chondrichthyes'], blurb: 'Cartilage skeletons, sharp senses and jaws full of replaceable teeth.' },
  placodermi: { key: 'placodermi', name: 'Placodermi', path: ['Chordata', 'Placodermi'], blurb: 'Armour-headed fish, the first giants with jaws.' },
  actinopterygii: { key: 'actinopterygii', name: 'Actinopterygii', path: ['Chordata', 'Actinopterygii'], blurb: 'Ray-finned fish: light bones, quick fins, endless variety.' },
  sarcopterygii: { key: 'sarcopterygii', name: 'Sarcopterygii', path: ['Chordata', 'Sarcopterygii'], blurb: 'Lobe-finned fish whose fleshy fins would become legs.' },
  reptilia: { key: 'reptilia', name: 'Sauropsida', path: ['Chordata', 'Sauropsida'], blurb: 'Scaly amniotes: lizards, crocodile kin and, one day, the dinosaurs.' },
  synapsida: { key: 'synapsida', name: 'Synapsida', path: ['Chordata', 'Synapsida'], blurb: 'Amniotes with a single opening behind the eye: sail-backs, tuskers, gorgons — and the ancestors of mammals.' },
  cycadophyta: { key: 'cycadophyta', name: 'Cycadophyta', path: ['Plantae', 'Cycadophyta'], blurb: 'Seed plants with crowns of stiff fronds, the gardens of the reptile age.' },
  plantae: { key: 'plantae', name: 'Progymnospermae', path: ['Plantae', 'Progymnospermae'], blurb: 'The first true trees, raising wood toward an open sky.' },
};

const SPECIES_CLADE: Record<string, string> = {
  driftspore: 'protobacteria', bacillus: 'protobacteria', spirillum: 'protobacteria', coccus: 'protobacteria', burr: 'protobacteria',
  ember: 'archaea', aurora: 'luminaria',
  needle: 'excavata', euglena: 'excavata',
  lurker: 'amoebozoa', chaos: 'amoebozoa', testate: 'amoebozoa',
  diatom: 'stramenopiles',
  slipper: 'alveolata', dino: 'alveolata',
  heliozoan: 'haptista',
  rotifer: 'rotifera',
  volvox: 'chlorophyta',
  larva: 'cnidaria', hydra: 'cnidaria', moonbell: 'cnidaria',
  comb: 'ctenophora',
  worm: 'annelida',
  frond: 'petalonamae',
  crawler: 'arthropoda', raptor: 'arthropoda', scorpion: 'arthropoda', scuttler: 'arthropoda', millipede: 'arthropoda', landscorp: 'arthropoda', skydarter: 'arthropoda',
  nautiloid: 'mollusca',
  darter: 'chordata',
  lamprey: 'agnatha', shieldfish: 'agnatha',
  ray: 'chondrichthyes', shark: 'chondrichthyes',
  titan: 'placodermi',
  shoal: 'actinopterygii', mudskipper: 'actinopterygii',
  lobefish: 'sarcopterygii', rival: 'sarcopterygii',
  fern: 'plantae',
  cycad: 'cycadophyta',
  skink: 'reptilia', shieldback: 'reptilia', phytosaur: 'reptilia', glider: 'reptilia',
  grazer: 'synapsida', gorgon: 'synapsida',
};

export function cladeOf(sp: SpeciesDef): Clade {
  const k = SPECIES_CLADE[sp.id];
  if (k && CLADES[k]) return CLADES[k];
  const e = sp.eras[0];
  return e <= 1 ? CLADES.protobacteria : e <= 2 ? CLADES.amoebozoa : CLADES.chordata;
}

/** Visible anatomy, read straight from how the organism is built. */
export function characteristics(sp: SpeciesDef): string[] {
  const l = sp.look, out: string[] = [];
  const add = (c: unknown, s: string) => { if (c) out.push(s); };
  add(l.body === 'rod', 'Rod-shaped body');
  add(l.body === 'spiral', 'Helical body');
  add(l.body === 'diatom' && !l.plates, 'Silica frustule');
  add(l.body === 'diatom' && !!l.plates, 'Mineral test');
  add(l.body === 'colony', 'Colony of cooperating cells');
  add(l.body === 'jelly', 'Pulsing bell');
  add(l.body === 'polyp', 'Stinging tentacle crown');
  add(l.body === 'worm', 'Segmented body with jaws');
  add(l.body === 'frond', 'Feathered frond');
  add(l.body === 'nautilus', 'Chambered shell');
  add(l.nucleoid, 'Free DNA, no nucleus');
  add(l.nucleus, 'True nucleus');
  add(l.flagella, (l.flagella || 0) > 1 ? 'Paired flagella' : 'Whip-like flagellum');
  add(l.cilia, 'Beating cilia');
  add(l.spikes && (l.spikeLen || 0) > 0.8, 'Radiating axopodia');
  add(l.spikes && (l.spikeLen || 0) <= 0.8, 'Glassy spines');
  add(l.plates && l.body !== 'diatom', 'Armoured pellicle');
  add(l.lobes, 'Flowing pseudopods');
  add(l.chloro, 'Chloroplasts');
  add(l.mito, 'Mitochondria');
  add(l.vesicles, l.vesicleColor === '#d77bff' || l.vesicleColor === '#c77dff' ? 'Toxin vesicles' : 'Digestive vesicles');
  add(l.vacuole, 'Contractile vacuole');
  add(l.groove, 'Oral groove');
  add(l.eyespot, 'Light-sensing eyespot');
  add(l.tentacles && l.body !== 'polyp', 'Trailing tentacles');
  add(l.combs, 'Rainbow comb rows');
  add((l.glowStrength || 1) > 1.3 || l.lure, 'Bioluminescent');
  add(l.eyes, (l.eyes || 0) > 1 ? 'Paired eyes' : 'Simple eyes');
  add(l.claws, 'Grasping claws');
  add(l.carapace, 'Jointed carapace');
  add(l.fins, 'Paired fins');
  add(l.vertebrate, 'Backbone');
  add(l.jaw, (l.jaw || 0) > 1 ? 'Toothed jaws' : 'Jaws');
  add(l.headArmor, 'Bony head shield');
  add(l.scales, 'Scales');
  add(l.electro, 'Electric organs');
  add(l.lobeFins, 'Lobed fins');
  add(l.legs, 'Walking legs');
  add(l.wings, 'Wings');
  add(l.sail, 'Dorsal sail');
  add(l.horns, 'Horns');
  add(l.serrated, 'Serrated teeth');
  add(l.frill, 'Neck frill');
  for (const d of sp.defenses) add(true, d === 'spiny' ? 'Spiny defence' : d === 'shelled' ? 'Hard shell' : 'Toxic to eat');
  return [...new Set(out)];
}

/** How the organism lives, as field notes. */
export function behaviour(sp: SpeciesDef): string[] {
  const out: string[] = [];
  out.push(
    sp.diet === 'none' ? 'Absorbs dissolved nutrients and light; never hunts.'
      : sp.diet === 'nutrients' ? 'Grazes on drifting nutrients.'
        : sp.diet === 'prey' ? 'An active predator of smaller organisms.'
          : 'Grazes, and hunts smaller cells opportunistically.');
  if (sp.sessile) out.push('Anchored in place, waiting for food to come to it.');
  if (sp.lunge) out.push('Stalks its prey, then strikes in a sudden lunge.');
  if (sp.aggression > 0.7) out.push('Aggressive: it will pursue you when hungry.');
  if (sp.schooling > 0.5) out.push('Gathers in shoals with its own kind.');
  if (sp.fear > 0.75) out.push('Skittish: flees anything larger than itself.');
  if (!sp.sessile && (sp.look.body === 'cell' || sp.look.body === 'rod') && sp.category !== 'predator' && sp.category !== 'rare') out.push('Reproduces by binary fission.');
  if (sp.ventBound) out.push('Lives only in the scalding water around hydrothermal vents.');
  if (sp.habitat === 'land') out.push('A creature of dry land.');
  if (sp.habitat === 'both') out.push('Moves freely between water and land.');
  return out;
}

export function habitat(sp: SpeciesDef): { zone: ZoneId; name: string; w: number }[] {
  const entries = (Object.entries(sp.zones) as [ZoneId, number][]).filter(([, w]) => w > 0);
  const max = Math.max(...entries.map(([, w]) => w), 0.001);
  return entries.sort((a, b) => b[1] - a[1]).map(([zone, w]) => ({ zone, name: ZONES[zone].name, w: w / max }));
}

const sharesEra = (a: SpeciesDef, b: SpeciesDef) => a.eras.some((e) => b.eras.includes(e));
const avg = (s: SpeciesDef) => (s.size[0] + s.size[1]) / 2;
function canHunt(a: SpeciesDef, b: SpeciesDef) {
  if (a.id === b.id || (a.diet !== 'prey' && a.diet !== 'both')) return false;
  if (!sharesEra(a, b)) return false;
  const ratio = a.category === 'predator' ? 0.85 : 0.6;
  if (avg(b) > avg(a) * ratio) return false;
  if (b.defenses.includes('spiny') && avg(b) > avg(a) * 0.4) return false;
  return true;
}

export interface Relations { relatives: SpeciesDef[]; preysOn: SpeciesDef[]; huntedBy: SpeciesDef[] }

export function relations(sp: SpeciesDef): Relations {
  const clade = cladeOf(sp).key;
  return {
    relatives: SPECIES.filter((s) => s !== sp && cladeOf(s).key === clade).slice(0, 6),
    preysOn: SPECIES.filter((s) => canHunt(sp, s)).sort((a, b) => avg(b) - avg(a)).slice(0, 5),
    huntedBy: SPECIES.filter((s) => canHunt(s, sp)).sort((a, b) => avg(a) - avg(b)).slice(0, 5),
  };
}

/** Specimen catalogue number (stable: species order in the data). */
export const specimenNo = (sp: SpeciesDef) => String(SPECIES.indexOf(sp) + 1).padStart(2, '0');
