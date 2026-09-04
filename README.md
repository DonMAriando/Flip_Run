# FLIP//RUN

MVP jugable de runner reactivo de un solo toque.

## Cómo jugar

- El personaje avanza solo.
- Tocá/clickeá/presioná Espacio para invertir la gravedad.
- Pasá muy cerca de los obstáculos para conseguir **PERFECT**.
- Encadená 10 PERFECT para activar **FEVER** y duplicar la puntuación.
- Morir y reintentar es prácticamente instantáneo.

## Modos

- **JUGAR:** run procedural normal, récord guardado con `localStorage`.
- **DAILY RUN:** utiliza una semilla basada en la fecha, de modo que el patrón procedural del día sea reproducible en un mismo dispositivo/navegador.

## Ejecutar localmente

No necesita build ni dependencias.

Podés abrir `index.html` directamente, aunque para un comportamiento más parecido a producción es mejor servir la carpeta por HTTP:

```bash
python -m http.server 8080
```

Luego abrir `http://localhost:8080`.

## Subir a itch.io

1. Comprimir **el contenido** de esta carpeta en ZIP, dejando `index.html` en la raíz del ZIP.
2. Crear/editar el proyecto en itch.io.
3. Kind of project: **HTML**.
4. Subir el ZIP.
5. Activar "This file will be played in the browser".
6. Recomendado: viewport vertical / responsive y opción fullscreen disponible.

## Archivos

- `index.html` — estructura y UI.
- `styles.css` — presentación responsive mobile-first.
- `game.js` — gameplay, procedural, partículas, audio WebAudio y persistencia.
- `manifest.webmanifest` — metadata PWA básica.

## Próximas iteraciones sugeridas

- Skins y trails desbloqueables.
- Ghosts de amigos.
- Ranking online para Daily Run.
- Biomas visuales cada cierta distancia.
- Misiones diarias simples.
- Telemetría: runs por sesión, duración media, reintentos y punto de abandono.
