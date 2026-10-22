# Arquitectura de UMBRAL

## Capas

1. **Entrada web:** `public/index.html` contiene menú, tutorial, HUD, controles e historial.
2. **Orquestación:** `umbral-demo.js` arranca recursos, captura entradas, avanza simulación, procesa eventos y dibuja cada frame.
3. **Simulación:** `umbral-core.mjs` mantiene el estado, daño, armas, poderes, enemigos y hordas. No depende del DOM.
4. **Mundo:** `umbral-maps.mjs`, `umbral-arena.mjs` y `umbral-traversal.mjs` definen mapas, colisiones, navegación, salto y gravedad.
5. **Jefes:** `umbral-titan.mjs`, `umbral-desollador.mjs`, `umbral-madre.mjs` y sus módulos auxiliares contienen máquinas de estados de ataques y recuperaciones.
6. **Presentación:** Three.js dibuja geometría y sprites; Canvas 2D dibuja armas/manos; CSS y SVG muestran el HUD. Los módulos `*-visuals` convierten estados en efectos.
7. **Audio:** Web Audio mezcla muestras y efectos; `umbral-music.mjs` reproduce un MP3 a la vez con HTML Audio.
8. **Persistencia local:** `umbral-local-records.mjs` guarda instantáneas de estadísticas por partida. `umbral-tutorial.mjs` guarda preferencias de primera visita. Se pueden sustituir estos adaptadores sin convertir la simulación en código de red.

## Ciclo de un frame

`requestAnimationFrame → entrada → step(estado, input, dt) → eventos → audio/efectos → render/HUD`.

El delta se limita y se subdivide en pasos de hasta 25 ms para reducir problemas de colisión. No es un reloj fijo de 60 Hz. La calidad automática baja resolución y limita efectos. El objetivo es una experiencia fluida; el rendimiento depende de GPU, navegador, resolución y carga.

El tiempo de la simulación gobierna ataques y cooldowns: al pausar no deben avanzar. Los recursos gráficos y voces de audio se limitan o reutilizan; al cambiar de arena se liberan las instancias anteriores.

## Recursos

`assets/img/umbral-demo/assets.json` especifica sprites, estados, cuadrículas, duración de frames y anclas. El juego usa atlas PNG; los GIF de `design/` sirven para revisar animaciones. Los recursos de ejecución están en `public/`; el arte fuente y las pruebas quedan fuera del directorio servido.

## Modo local

La página no necesita API, base de datos, cookies de sesión ni servicios externos. Los dos servidores de `tools/` solo entregan archivos locales. El ranking es un historial personal en el navegador, no una clasificación competitiva verificada. El guardado sustituye la instantánea de una partida por su id para evitar duplicar bajas al pausar, cerrar o morir.

## Límites actuales

- `umbral-demo.js` todavía concentra mucha orquestación; se puede separar por carga de recursos, entradas, HUD y ciclo de render en cambios pequeños.
- El cliente controla la simulación y sus estadísticas. Un futuro modo competitivo requerirá diseño propio de validación y persistencia.
- La distribución funciona sin Internet con el servidor local en marcha; no instala una aplicación ni un service worker.
