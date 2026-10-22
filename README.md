# UMBRAL

FPS de hordas ambientado en el Mictlán. Se juega en el navegador, en primera persona, con geometría 3D y sprites pixelados. Esta distribución funciona completamente en local: recursos, sonido, música, tutorial y resultados.

## Jugar con XAMPP (Windows)

1. Abre la carpeta `C:\xampp\docs\umbral`.
2. Haz doble clic en **Jugar.cmd**.
3. Entra en **http://127.0.0.1:8091** y pulsa Entrar.

Mantén abierta la consola mientras juegas. `Ctrl+C` detiene el servidor. No necesitas iniciar Apache ni MySQL. El lanzador usa el PHP incluido en XAMPP; también admite la variable `PHP_BINARY` o un `php` instalado en PATH.

No hace falta conexión a Internet. El servidor local permite cargar los módulos, imágenes y audio; abrir `index.html` directamente con `file://` no funciona. Si el navegador se abre antes que el servidor, actualiza la página. Si el puerto está ocupado, cierra la instancia anterior o usa otro puerto con los comandos de abajo.

## Desarrollo

Con Node.js 22 o posterior, desde esta carpeta:

```sh
npm start
npm run check
npm test
```

Los scripts usan únicamente módulos de Node. No hace falta `npm install`, un bundler ni descargas. Three.js ya está incluido localmente. Alternativamente:

```sh
php -S 127.0.0.1:8091 -t public tools/router.php
```

Para cambiar de puerto con Node en PowerShell: `$env:PORT='8092'; npm start`. Ambos servidores exponen solo `public/` y escuchan en loopback. Para publicar el juego como web estática, la raíz es `public/`.

## Contenido

- Tres arenas aleatorias: Cuenca de Obsidiana, Corona del Viento y Río de las Ánimas.
- Tutorial de primera visita y acceso posterior desde el menú.
- Seis armas, llamas con R y macuahuitl con F.
- Titán de Obsidiana, Desollador del Vendaval y Madre del Ahogo, con pruebas directas desde el menú.
- Cinco canciones locales, orden aleatorio, pausa de un segundo entre canciones y volumen inicial del 8%.
- Calidad gráfica automática, control de volumen, pausa y pantalla completa.
- Historial local de hasta 500 partidas y top 10 por hordas superadas y bajas. Tutorial y pruebas no puntúan.

Pruebas directas: `/?demo=titan`, `/?demo=desollador`, `/?demo=madre`.

## Controles

| Acción | Control |
| --- | --- |
| Caminar / mirar | WASD / mouse |
| Saltar / pausar | Espacio / Escape |
| Disparo / secundario | Clic izquierdo / derecho |
| Cuchillo, escopeta, rifle, subfusil, arco, cañón solar | 1–6 |
| Llamas / macuahuitl | R / F |
| Sniper del rifle | Mantener clic derecho y disparar con izquierdo |

## Estructura

```text
public/
  index.html                 Página jugable y HUD
  assets/js/                 Simulación, gráficos, sonido y guardado local
  assets/css/                Estilos del juego y de la página
  assets/img/umbral-demo/    Sprites, fondos y manifiesto de animaciones
  assets/audio/umbral/       Efectos, enemigos y música
  assets/vendor/three/      Three.js y su licencia
design/umbral/              Arte fuente, GIF de referencia y decisiones de diseño
tests/                      Regresiones de combate, mapas, audio y modo local
tools/                      Servidores locales y validación de dependencias
docs/                       Arquitectura y guía de contribución
```

El sprite de cuerpo completo del protagonista está en `design/umbral/player-v1/`; es material de diseño y no reemplaza los brazos de primera persona.

### Datos locales

El nombre elegido es una etiqueta local; no hay cuentas ni autenticación. El historial, el nombre y el tutorial se guardan en `localStorage`. Cada navegador y dirección/puerto tienen su propio almacenamiento. Si se borran los datos del sitio, se pierde el historial. Si el navegador bloquea el almacenamiento, el juego continúa y avisa que los resultados duran solo esa sesión. La partida activa no se reanuda tras cerrar: se conservan sus estadísticas guardadas.

## Próximas implementaciones

Consulta [Arquitectura](docs/ARQUITECTURA.md) y [Desarrollo](docs/DESARROLLO.md). Las nuevas mecánicas se prueban primero en la simulación; las animaciones y sonidos responden a sus eventos.

## Repositorio

Repositorio de destino: https://github.com/aresdevfs-PAFG/UMBRAL-FpsGame

Esta carpeta es una raíz de proyecto independiente. El historial de Git debe comenzar aquí. Antes de publicar, revisa la licencia de distribución de música y recursos en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
