# UMBRAL

A horde-based FPS set in Mictlán. It runs in the browser, combining a first-person perspective with 3D geometry and pixel art sprites. This distribution runs entirely locally, including assets, sound, music, the tutorial, and match records.

## Play with XAMPP (Windows)

1. Open the `C:\xampp\docs\umbral` folder.
2. Double-click **Jugar.cmd**.
3. Visit **http://127.0.0.1:8091** and start the game.

Keep the console open while playing. Press `Ctrl+C` to stop the server. You do not need to start Apache or MySQL. The launcher uses the PHP installation bundled with XAMPP; it also supports the `PHP_BINARY` environment variable or a `php` executable on PATH.

No Internet connection is required. The local server allows the browser to load modules, images, and audio; opening `index.html` directly through `file://` does not work. If the browser opens before the server is ready, refresh the page. If the port is already in use, close the previous server instance or choose another port using the commands below.

## Development

With Node.js 22 or later, run these commands from this folder:

```sh
npm start
npm run check
npm test
```

These scripts use only built-in Node modules. No `npm install`, bundler, or downloads are required. Three.js is already included locally. Alternatively, run:

```sh
php -S 127.0.0.1:8091 -t public tools/router.php
```

To change the Node server port in PowerShell, run: `$env:PORT='8092'; npm start`. Both servers expose only `public/` and listen on the loopback interface. To host the game as a static website, use `public/` as the site root.

## Features

- Three randomly selected arenas: Cuenca de Obsidiana, Corona del Viento, and Río de las Ánimas.
- A tutorial on the first visit, with access from the menu afterward.
- Six weapons, flames bound to R, and the macuahuitl bound to F.
- Titán de Obsidiana, Desollador del Vendaval, and Madre del Ahogo, with dedicated practice encounters accessible from the menu.
- Five local music tracks, shuffled playback, a one-second gap between tracks, and an initial volume of 8%.
- Automatic graphics quality, volume controls, pause, and fullscreen mode.
- Local history for up to 500 matches and a top 10 ranked by waves cleared and kills. The tutorial and practice encounters do not count toward scores.

Direct practice links: `/?demo=titan`, `/?demo=desollador`, `/?demo=madre`.

## Controls

| Action | Control |
| --- | --- |
| Move / look | WASD / mouse |
| Jump / pause | Space / Escape |
| Primary / secondary fire | Left / right mouse button |
| Knife, shotgun, assault rifle, submachine gun, bow, solar cannon | 1–6 |
| Flames / macuahuitl | R / F |
| Rifle sniper mode | Hold the right mouse button to aim and press the left mouse button to fire |

## Project Structure

```text
public/
  index.html                Playable page and HUD
  assets/js/                Simulation, graphics, sound, and local persistence
  assets/css/               Game and page styles
  assets/img/umbral-demo/    Sprites, backgrounds, and animation manifest
  assets/audio/umbral/       Effects, enemy sounds, and music
  assets/vendor/three/      Three.js and its license
design/umbral/              Source artwork, reference GIFs, and design decisions
tests/                      Regression tests for combat, maps, audio, and local mode
tools/                      Local servers and dependency validation
docs/                       Architecture and contribution guide
```

The protagonist's full-body sprite is in `design/umbral/player-v1/`. It is design material and does not replace the first-person arms.

### Local Data

The chosen player name is a local label; there are no accounts or authentication. Match history, the player name, and tutorial preferences are stored in `localStorage`. Each browser and address/port combination has separate storage. Clearing site data deletes the history. If the browser blocks storage, the game continues and reports that results will last only for the current session. An active match cannot be resumed after closing the game; only its saved statistics are retained.

## Future Development

See [Architecture](docs/ARQUITECTURA.md) and [Development](docs/DESARROLLO.md). New mechanics are tested in the simulation first; animations and sounds respond to simulation events.

## Repository

Project repository: https://github.com/aresdevfs-PAFG/UMBRAL-FpsGame

This folder is an independent project root. Git history should begin here. Before publishing, review the music and asset distribution terms in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
