# PRIMORDIA

A mobile-first evolutionary survival arcade game. Begin as a single cell in a primordial sea — explore, eat, grow, mutate, evolve, survive.

**Playable eras:** I Primordial Life → II Complex Cells → III Multicellular Life → IV Early Aquatic Life (animal body plans: eyes, fins, claws, carapace, ink) → V Vertebrate Life (jaws, scales, lobe fins, electroreception, sharks and armoured titans) → VI Land Transition (a coastline appears: breath, legs, lungs and a land ecosystem).

## Art direction
*An entire universe inside a drop of water.* Eras I–III are rendered as if under a darkfield microscope: phase-contrast halos, translucent bilayer membranes, streaming cytoplasm, nuclei with ER and chromatin, food vacuoles digesting what you eat, binary fission, and lysis when cells die. The water itself is alive (`src/render/microcosm.ts`), with out-of-focus distant organisms, drifting molecules and debris, fluid flow, Brownian specks and chemical reactions, each region with its own character. Every mutation visibly morphs the body, and a micrograph scale bar tracks your size. The Codex is a field journal with specimen plates, taxonomy, behaviour, habitat, relationships and a Tree of Life of every form a lineage can take.

## Play
- **iPhone / touch:** drag on the left of the screen to swim (floating joystick). Buttons on the right: **Burst** plus any abilities you evolve. Tap the glowing **DNA helix** to evolve.
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

Adding a mutation = one entry in `src/game/traits.ts` (stats + look + text). Adding a species = one entry in `src/sim/species.ts`. Eras IV–VI are declared in `src/game/eras.ts` for future expansion.
