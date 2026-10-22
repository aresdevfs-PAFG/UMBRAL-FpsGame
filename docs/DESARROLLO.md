# Continuing Development

## Conventions

- Use JavaScript with ES modules. Keep simulation functions separate from the DOM and Three.js.
- Use UTF-8 without a BOM, LF line endings, spaces, and a final newline; `.editorconfig` defines the basics.
- Use `camelCase` for values and functions, and `UPPER_SNAKE_CASE` for configuration constants.
- Use comments to explain decisions and units. Combat durations are measured in seconds; sprite frame durations are measured in milliseconds.
- Reuse simulation events to trigger sounds and animations. Do not resolve damage in the rendering layer.
- Use relative paths and local assets. Do not introduce CDN dependencies at startup.
- Preserve third-party license headers. Do not assume a song is freely licensed just because it is included in the package.
- The existing code is compact. Use readable formatting in new modules without reformatting the entire codebase in the same task.

## Adding a Weapon

1. Define its configuration, ammunition, and behavior in the simulation.
2. Add or reuse firing and impact events.
3. Package the sprite atlas and register animation sequences in `assets.json`.
4. Add audio and the first-person visuals.
5. Update the weapon selector, controls guide, and tutorial if the number of weapons changes.
6. Test ammunition costs, cooldowns, pause behavior, and hit scenarios.

## Adding an Enemy, Boss, or Arena

- Enemy: define attributes and attacks in the simulation, visual states in the manifest, and sounds in the audio module.
- Boss: use a state machine with startup, telegraph, attack, and recovery states; clean up projectiles and release the player from capture attacks on death.
- Arena: define collision geometry and navigation in `umbral-maps.mjs`, and visuals in `umbral-world.js`. Check heights, edges, bridges, supplies, spawn points, and recovery after falls.
- Test mechanics that depend on the time delta and pause transitions at 20, 60, and 120 Hz.

## Verification

`npm run check` validates syntax, imports, and registered assets. `npm test` runs the tests using Node's built-in test runner. Tests are included in the repository and do not require an external service. Then test in the browser: the first visit, tutorial, waves, each boss, weapon switching, pause, sound, death and restart, and page reloads to verify persistence.

Use the performance test report below the game to compare FPS and resolution before and after graphics changes.

## Character Artwork

The material in `design/umbral/player-v1/` preserves the character's black hair, hospital wristband, bandage, and subtle electrode. To rebuild the atlas and GIF from the source sheet, install Pillow in an art production environment and run `python design/umbral/player-v1/build_sprites.py`. This is not required to play.
