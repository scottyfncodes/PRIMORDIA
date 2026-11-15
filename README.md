# PRIMORDIA

A mobile-first evolutionary survival arcade game. Begin as a single cell in a primordial sea — explore, eat, grow, mutate, evolve, survive.

**Playable eras:** I Primordial Life → II Complex Cells → III Multicellular Life → IV Early Aquatic Life (animal body plans: eyes, fins, claws, carapace, ink) → V Vertebrate Life (jaws, scales, lobe fins, electroreception, sharks and armoured titans) → VI Land Transition (a coastline appears: breath, legs, lungs and a land ecosystem) → VII Age of Reptiles (the land grows into a continent: sails, horns, serrated teeth, warm blood, gorgons, tusked grazers and river stalkers) → VIII Age of Dinosaurs (conifer forest and a lake at the heart of the continent: feathers, killing claws, bone armour, tail clubs, a ROAR that routs hunters, sickle-claw packs, tyrant kings, longneck titans, and plesiosaurs, ichthyosaurs and ammonites offshore).

## Art direction
*An entire universe inside a drop of water.* Eras I–III are rendered as if under a darkfield microscope: phase-contrast halos, translucent bilayer membranes, streaming cytoplasm, nuclei with ER and chromatin, food vacuoles digesting what you eat, binary fission, and lysis when cells die. The water itself is alive (`src/render/microcosm.ts`), with out-of-focus distant organisms, drifting molecules and debris, fluid flow, Brownian specks and chemical reactions, each region with its own character. Every mutation visibly morphs the body, and a micrograph scale bar tracks your size. The Codex is a field journal with specimen plates, taxonomy, behaviour, habitat, relationships and a Tree of Life of every form a lineage can take.

**On land** (Eras VI–VIII, `src/render/terrain.ts`) the world is drawn from above as living ground: soil whose colour drifts from meadow to bare earth, a beach that grades from dry sand to the wet edge with swash running up it, and plant life that changes with the era: moss and lichen on the first bare shores, ferns and cycads on the red earth of the reptile age, conifer forest in the age of dinosaurs. Tall crowns pass over the animals and thin out above the player; cloud shadows cross the ground, and in Era VIII so does the shadow of something flying. Out of the water a body is no longer a lit membrane: it is opaque, casts a shadow and walks on limbs with weight in them. From Era VII, animals have a head, a neck and a tail rather than the outline of a fish.

## Evolving
Eat to grow; each quarter of growth is a visible step. Spend DNA on mutations that change both body and behaviour. When fully grown with enough mutations, the helix becomes **Leap**: choose between two branches of the tree of life (each body plan carries an inherited gift), then watch the metamorphosis: endosymbiosis, cell division, gastrulation, a backbone, limbs, an egg that cracks from within, a crown of feathers.

## Assets made with GITCRAFT
| Asset | Tool | Source | Output |
|---|---|---|---|
| 3D microorganism loops (diatom, radiolarian, volvox, hydromedusa, comb jelly) | MeshCraft (Blender 5.2, Cycles) via `run_script` | `design/gitcraft/specimens.py`, packed by `build_sheets.py` | `public/assets/life/*-soft.webp` |
| Interface icon set (14 icons) | VectorCraft | `design/gitcraft/icons.py`, `icons/primordia-icons.vectorcraft`, `build_icons.py` | `src/ui/icons.ts` |
| Looping caustic light | Python (numpy photon splatting) | `design/scripts/caustics.py` | `public/assets/fx/caustics.webp` |

Everything else (organisms, terrain and plants, effects, audio) is procedural at runtime; land plants are painted once into sprites when first needed.

## Play
- **iPhone / touch:** drag on the left of the screen to swim (floating joystick). Buttons on the right: **Burst** plus any abilities you evolve. Tap the glowing **DNA helix** to evolve.
- **Settings:** Vibration (short buzzes on bites, leaps and death) and **Gentle Tides**, an assist mode with 40% less damage and slower hunger.
- **Desktop:** WASD / arrows to swim, Space to burst, Q/E/R/F/T/G/C/X for abilities, V to evolve, Esc to pause. You can also hold the mouse to swim toward the cursor.

## Develop
```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run test:balance  # autopilot runs of every lineage (BOT_SECONDS=3000 to reach Era VI; BOT_ERA=8 starts in a late era)
npm run build    # typecheck + production build to dist/
```

## Architecture
| Layer | Path | Notes |
|---|---|---|
| Engine | `src/engine/` | math, spatial hash grid, touch/keyboard input, procedural WebAudio |
| Simulation | `src/sim/` | environment fields (zones, light, currents, heat, thicket density), species data, pooled organisms & nutrients, ecosystem AI |
| Gameplay | `src/game/` | player, data-driven mutation traits, eras & forms, progression, persistence |
| Rendering | `src/render/` | Canvas 2D: procedural organism drawing, parallax background, land terrain with baked plant sprites, cached glow sprites, pooled particles |
| UI | `src/ui/` | DOM HUD and menus (evolution chamber, era leap, field-journal codex, tree of life, lineage ribbon, death summary) |

Species taxonomy for the Codex lives in `src/game/codex.ts` (one clade entry per species; everything else is derived).

Adding a mutation = one entry in `src/game/traits.ts` (stats + look + text). Adding a species = one entry in `src/sim/species.ts`. Eras are declared in `src/game/eras.ts`; adding one = an `ERAS` entry, four `FORMS`, its traits, species, a score in `src/engine/music.ts`, codex clades, a metamorphosis in `src/render/metamorph.ts` and, on land, a biome in `src/render/terrain.ts`.
