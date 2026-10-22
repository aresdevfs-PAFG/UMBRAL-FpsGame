# Continuar el desarrollo

## Convenciones

- JavaScript con módulos ES. Mantener funciones de simulación separadas del DOM y de Three.js.
- UTF-8 sin BOM, finales LF, espacios y salto final; `.editorconfig` define lo básico.
- Nombres `camelCase` para valores y funciones, `UPPER_SNAKE_CASE` para configuraciones constantes.
- Comentarios para explicar decisiones y unidades. Duraciones del combate en segundos; duración de sprites en milisegundos.
- Reutilizar los eventos de simulación para disparar sonidos y animaciones. No resolver daño desde el render.
- Rutas relativas y recursos locales. No añadir dependencias de CDN al arranque.
- Conservar cabeceras de licencia de terceros. No asumir que una canción tiene licencia libre por estar incluida en el paquete.
- El código heredado es compacto; aplicar estilo legible en módulos nuevos sin reformatear todo en una misma tarea.

## Agregar un arma

1. Definir configuración, munición y comportamiento en la simulación.
2. Añadir o reutilizar eventos de disparo/impacto.
3. Empaquetar atlas y registrar secuencias en `assets.json`.
4. Añadir audio y representación en primera persona.
5. Actualizar selector, guía y tutorial si cambia el número de armas.
6. Probar costes de munición, cooldown, pausa y casos de impacto.

## Agregar enemigo, jefe o arena

- Enemigo: atributos y ataques en simulación, estados visuales en el manifiesto y sonidos en el módulo de audio.
- Jefe: máquina de estados con inicio, telegráfo, ataque y recuperación; liberación de proyectiles y capturas al morir.
- Arena: geometría de colisión y navegación en `umbral-maps.mjs`, representación en `umbral-world.js`; verificar alturas, bordes, puentes, suministros, puntos de aparición y retorno de caídas.
- Probar a 20, 60 y 120 Hz las mecánicas sensibles a delta y las transiciones de pausa.

## Verificación

`npm run check` valida sintaxis, imports y recursos registrados. `npm test` ejecuta las pruebas con el runner incorporado de Node. Los tests son parte del repositorio y no requieren un servicio externo. Después, probar en navegador: primera visita, tutorial, hordas, cada jefe, cambio de arma, pausa, sonido, muerte/reinicio y recarga de la página para revisar el guardado.

Usar `Rendimiento · reporte de prueba` debajo del juego para comparar FPS y resolución antes y después de cambios gráficos.

## Arte del personaje

El material de `design/umbral/player-v1/` conserva cabello negro, pulsera hospitalaria, venda y electrodo discreto. Para reconstruir el atlas/GIF desde su hoja fuente, instalar Pillow en un entorno de arte y ejecutar `python design/umbral/player-v1/build_sprites.py`. No es necesario para jugar.
