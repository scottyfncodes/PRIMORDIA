# PRIMORDIA

A mobile-first evolutionary survival arcade game. Begin as a single cell in a primordial sea — explore, eat, grow, mutate, evolve, survive.

**Playable eras:** I Primordial Life → II Complex Cells → III Multicellular Life → IV Early Aquatic Life (animal body plans: eyes, fins, claws, carapace, ink) → V Vertebrate Life (jaws, scales, lobe fins, electroreception, sharks and armoured titans) → VI Land Transition (a coastline appears: breath, legs, lungs and a land ecosystem) → VII Age of Reptiles (the land grows into a continent: sails, horns, serrated teeth, warm blood, gorgons, tusked grazers and river stalkers).

## Art direction
*An entire universe inside a drop of water.* Eras I–III are rendered as if under a darkfield microscope: phase-contrast halos, translucent bilayer membranes, streaming cytoplasm, nuclei with ER and chromatin, food vacuoles digesting what you eat, binary fission, and lysis when cells die. The water itself is alive (`src/render/microcosm.ts`), with out-of-focus distant organisms, drifting molecules and debris, fluid flow, Brownian specks and chemical reactions, each region with its own character. Every mutation visibly morphs the body, and a micrograph scale bar tracks your size. The Codex is a field journal with specimen plates, taxonomy, behaviour, habitat, relationships and a Tree of Life of every form a lineage can take.

## Evolving
Eat to grow; each quarter of growth is a visible step. Spend DNA on mutations that change both body and behaviour. When fully grown with enough mutations, the helix becomes **Leap**: choose between two branches of the tree of life (each body plan carries an inherited gift), then watch the metamorphosis: endosymbiosis, cell division, gastrulation, a backbone, limbs.

## Assets made with GITCRAFT
| Asset | Tool | Source | Output |
|---|---|---|---|
| 3D microorganism loops (diatom, radiolarian, volvox, hydromedusa, comb jelly) | MeshCraft (Blender 5.2, Cycles) via `run_script` | `design/gitcraft/specimens.py`, packed by `build_sheets.py` | `public/assets/life/*-soft.webp` |
| Interface icon set (13 icons) | VectorCraft | `design/gitcraft/icons.py`, `icons/primordia-icons.vectorcraft`, `build_icons.py` | `src/ui/icons.ts` |
| Looping caustic light | Python (numpy photon splatting) | `design/scripts/caustics.py` | `public/assets/fx/caustics.webp` |

Everything else (organisms, environment, effects, audio) is procedural at runtime.

## Play
- **iPhone / touch:** drag on the left of the screen to swim (floating joystick). Buttons on the right: **Burst** plus any abilities you evolve. Tap the glowing **DNA helix** to evolve.
- **Settings:** Vibration (short buzzes on bites, leaps and death) and **Gentle Tides**, an assist mode with 40% less damage and slower hunger.
- **Desktop:** WASD / arrows to swim, Space to burst, Q/E/R/F/T/G for abilities, V to evolve, Esc to pause. You can also hold the mouse to swim toward the cursor.

## Develop
```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run test:balance  # autopilot runs of every lineage (BOT_SECONDS=3000 to reach Era VI)
npm run build    # typecheck + production build to dist/
```

## Architecture
| Layer | Path | Notes |
|---|---|---|
| Engine | `src/engine/` | math, spatial hash grid, touch/keyboard input, procedural WebAudio |
| Simulation | `src/sim/` | environment fields (zones, light, currents, heat, thicket density), species data, pooled organisms & nutrients, ecosystem AI |
| Gameplay | `src/game/` | player, data-driven mutation traits, eras & forms, progression, persistence |
| Rendering | `src/render/` | Canvas 2D: procedural organism drawing, parallax background, cached glow sprites, pooled particles |
| UI | `src/ui/` | DOM HUD and menus (evolution chamber, era leap, field-journal codex, tree of life, lineage ribbon, death summary) |

Species taxonomy for the Codex lives in `src/game/codex.ts` (one clade entry per species; everything else is derived).

Adding a mutation = one entry in `src/game/traits.ts` (stats + look + text). Adding a species = one entry in `src/sim/species.ts`. Eras are declared in `src/game/eras.ts`; adding one = an `ERAS` entry, four `FORMS`, its traits, species, a score in `src/engine/music.ts` and codex clades.
