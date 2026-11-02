# PRIMORDIA

A mobile-first evolutionary survival arcade game. Begin as a single cell in a primordial sea — explore, eat, grow, mutate, evolve, survive.

**Playable eras:** I Primordial Life → II Complex Cells → III Multicellular Life → IV Early Aquatic Life (animal body plans: eyes, fins, claws, carapace, ink). Eras V–VI are declared for future releases.

## Play
- **iPhone / touch:** drag on the left of the screen to swim (floating joystick). Buttons on the right: **Burst** plus any abilities you evolve. Tap the glowing **DNA helix** to evolve.
- **Desktop:** WASD / arrows to swim, Space to burst, Q/E/R/F/T/G for abilities, V to evolve, Esc to pause. You can also hold the mouse to swim toward the cursor.

## Develop
```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run test:balance  # autopilot runs of every lineage (BOT_SECONDS=1200 to reach Era IV)
npm run build    # typecheck + production build to dist/
```

## Architecture
| Layer | Path | Notes |
|---|---|---|
| Engine | `src/engine/` | math, spatial hash grid, touch/keyboard input, procedural WebAudio |
| Simulation | `src/sim/` | environment fields (zones, light, currents, heat, thicket density), species data, pooled organisms & nutrients, ecosystem AI |
| Gameplay | `src/game/` | player, data-driven mutation traits, eras & forms, progression, persistence |
| Rendering | `src/render/` | Canvas 2D: procedural organism drawing, parallax background, cached glow sprites, pooled particles |
| UI | `src/ui/` | DOM HUD and menus (evolution chamber, era leap, codex, death summary) |

Adding a mutation = one entry in `src/game/traits.ts` (stats + look + text). Adding a species = one entry in `src/sim/species.ts`. Eras IV–VI are declared in `src/game/eras.ts` for future expansion.
