# UMBRAL Architecture

## Layers

1. **Web entry point:** `public/index.html` contains the menu, tutorial, HUD, controls, and match history.
2. **Orchestration:** `umbral-demo.js` loads assets, captures input, advances the simulation, processes events, and renders each frame.
3. **Simulation:** `umbral-core.mjs` manages state, damage, weapons, abilities, enemies, and waves. It does not depend on the DOM.
4. **World:** `umbral-maps.mjs`, `umbral-arena.mjs`, and `umbral-traversal.mjs` define maps, collisions, navigation, jumping, and gravity.
5. **Bosses:** `umbral-titan.mjs`, `umbral-desollador.mjs`, `umbral-madre.mjs`, and their supporting modules contain state machines for attacks and recovery.
6. **Presentation:** Three.js renders geometry and sprites; Canvas 2D renders weapons and hands; CSS and SVG display the HUD. The `*-visuals` modules turn states into effects.
7. **Audio:** Web Audio mixes samples and effects; `umbral-music.mjs` plays one MP3 at a time using HTML Audio.
8. **Local persistence:** `umbral-local-records.mjs` saves statistics snapshots for each match. `umbral-tutorial.mjs` saves first-visit preferences. These adapters can be replaced without adding networking code to the simulation.

## Frame Lifecycle

`requestAnimationFrame → input → step(state, input, dt) → events → audio/effects → render/HUD`.

The time delta is capped and subdivided into steps of up to 25 ms to reduce collision issues. This is not a fixed 60 Hz timestep. Automatic quality adjustment lowers resolution and limits effects. The goal is smooth gameplay; performance depends on the GPU, browser, resolution, and workload.

Simulation time governs attacks and cooldowns: they must not advance while paused. Graphics resources and audio voices are limited or reused; previous arena instances are released when switching arenas.

## Assets

`assets/img/umbral-demo/assets.json` specifies sprites, states, grids, frame durations, and anchors. The game uses PNG atlases; the GIFs in `design/` are animation previews. Runtime assets live in `public/`; source artwork and tests stay outside the served directory.

## Local Mode

The page does not require an API, database, session cookies, or external services. The two servers in `tools/` only serve local files. The leaderboard is a personal history stored in the browser, not a verified competitive ranking. Saving replaces a match's snapshot by its ID to avoid counting kills more than once when pausing, closing the page, or dying.

## Current Limitations

- `umbral-demo.js` still handles much of the orchestration. Asset loading, input, HUD updates, and the render loop can be extracted in small changes.
- The client controls the simulation and its statistics. A future competitive mode will require its own validation and persistence design.
- This distribution works without Internet access while the local server is running; it does not install an application or a service worker.
