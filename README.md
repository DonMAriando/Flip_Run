# FLIP//RUN

Runner de precisión de un solo toque. Invertís la gravedad, rozás los orbes, no frenás.

## La tesis de diseño

Lo adictivo de este género no son las skins ni los desbloqueos: es el **"uf, casi"**.
Todo en el juego está subordinado a tres reglas:

1. **La muerte siempre es culpa del jugador.** Nada de castigos al azar. Cuando morís,
   el obstáculo culpable queda resaltado en pantalla.
2. **El techo de habilidad tiene que ser visible.** El riesgo se elige: la ruta segura
   existe siempre, pero puntúa poco.
3. **Reintentar cuesta menos que pensar en no reintentar.** Un toque en cualquier parte
   reinicia al instante.

Concretamente: el score lo dominan los orbes, no la supervivencia. Un run que juega
seguro saca ~150 puntos; el mismo nivel jugado con ambición saca ~2200.

## Cómo jugar

- El personaje avanza solo. Tocá, clickeá o apretá Espacio para invertir la gravedad.
- La velocidad se conserva al invertir, así que **tocando rápido se puede flotar**.
  Ahí está el techo de habilidad: sostener una altura es una decisión continua.
- Los **orbes** están a 45 unidades de la cara de cada obstáculo: cobrarlos exige
  pasar rozando. Cada orbe sube el multiplicador.
- El multiplicador **no se rompe al azar**: decae de a uno cada 780 unidades sin cobrar
  un orbe, y la barra bajo el combo muestra exactamente cuánto falta.
- Con multiplicador x8 entrás en **FEVER** y el score se duplica.

## Modos

- **JUGAR**: semilla aleatoria por run.
- **DAILY RUN**: semilla derivada de la fecha, igual para todo el mundo. Guarda el
  contador de intentos y un **ghost** de tu mejor run del día, para correr contra vos mismo.

## Ejecutar en local

Sin dependencias. Hay dos formas y conviene saber por qué existen las dos.

**Para desarrollar**, servido por HTTP (recarga limpia, archivos separados, sin build):

```bash
node tools/serve.mjs 8080
```

Y abrir `http://localhost:8080`.

**Para sólo jugarlo**, un archivo único que se abre con doble click:

```bash
node tools/build.mjs
```

Genera `dist/flip-run.html`, autocontenido y sin ninguna petición externa.

El motivo de la segunda forma: `index.html` usa módulos ES, y por `file://` el navegador
los bloquea. Abrirlo con doble click dejaba un menú dibujado que no responde a nada,
indistinguible de un juego roto. Hoy eso no pasa en silencio: una guarda de arranque de
1.5 s (`#boot`) detecta que el script no cargó y muestra qué hacer.

`tools/build.mjs` es un empaquetador diminuto a propósito: asume que `src/` usa sólo
`import { a } from './mod.js'` y `export function|const`, ordena los módulos por
dependencias y falla ruidosamente si `index.html` cambió o si quedó alguna referencia a
un archivo local. Si algún día hace falta más que eso, mejor un bundler de verdad que
estirar este.

Flags útiles: `?autopilot=1` deja que el controlador heurístico juegue solo (y expone
`window.__fliprun.info()`), y `?debug=1` expone el diagnóstico sin el autopilot. En
localhost el service worker se desregistra solo para no servir código viejo.

## El arranque de la partida

Los primeros tres segundos son los que deciden si alguien vuelve a jugar, así que están
fijados por contrato y cubiertos por `verify.mjs`:

- **Pista libre** (`LEVEL.introRunway`): el primer obstáculo no puede llegar antes de los
  2.5 s. Sin esto llegaba a los 0.9 s y morías antes de registrar que la partida arrancó.
- **El primer tramo es siempre `orbArc`**: una cadena de orbes sin obstáculos. Enseña a
  maniobrar y paga antes de poder matarte.
- **Cartel de mecánica**: hasta el primer récord se muestra "TOCÁ RÁPIDO PARA FLOTAR",
  porque flotar tapeando no se descubre por intuición y es la diferencia entre sobrevivir
  y jugar.
- El cartel de **NUEVO RÉCORD** no aparece en el primer run: no había nada que superar y
  anunciarlo ahí le quita valor a cuando de verdad rompés tu marca.

## Los dos invariantes

Casi todo el diseño del código existe para sostener estas dos propiedades. Si rompés
una, el juego deja de ser justo.

### 1. La simulación es determinista

`src/sim.js` es una función pura de `(semilla, secuencia de toques)`. No usa
`Math.random` ni tiempo real: los efectos visuales viven aparte en `src/fx.js`. El paso
es fijo (120 Hz, con acumulador e interpolación en el render), así que la física es
idéntica en un monitor de 60 Hz y en uno de 144 Hz.

Además, `src/level.js` usa **un generador de azar propio por tramo**
(`chunkRng(semilla, índice)`), y no un único flujo compartido. Eso es lo que hace que
la Daily Run sea realmente igual para todos: ningún consumo de azar depende de cómo
jugó la persona.

De ahí sale gratis el ghost: un run se guarda como la lista de ticks en los que se
tocó, y eso alcanza para reconstruirlo exacto.

### 2. Todo nivel generado es superable

Cada patrón declara la **ventana de alturas seguras** en la que puede estar el jugador
al entrar y al salir. Con eso el generador calcula la separación mínima usando la
física real: moverse `dy` en vertical cuesta `speed * sqrt(2*dy/g)` de avance.
Ningún patrón puede volverse imposible al subir la dificultad.

Esto no es teórico: la primera versión del generador era **imposible después de los
~1300 m en todas las semillas**, y no lo detectó ninguna prueba de gameplay. Lo
encontró el solver.

## Herramientas

| Comando | Para qué |
| --- | --- |
| `node tools/verify.mjs` | Suite de invariantes: determinismo, ghost, combo, jugabilidad. |
| `node tools/audit.mjs [dist]` | Corre el solver sobre muchas semillas: ¿son superables? |
| `node tools/solve.mjs <semilla> [dist]` | Programación dinámica: superabilidad y techo de orbes de un jugador perfecto. |
| `node tools/histogram.mjs [n]` | Distribución de duración de runs del autopilot. |
| `node tools/trace.mjs <semilla>` | Traza un run: geometría, muerte y trayectoria. |
| `node tools/make-icons.mjs` | Regenera los iconos PNG de la PWA. |

**Corré `verify` y `audit` después de tocar cualquier número de balance.** El solver es
aproximado por el bucketeo del espacio de estados, pero alcanza de sobra para distinguir
"difícil" de "imposible", que es la única pregunta que importa.

## Agregar un patrón nuevo

En `src/level.js`, dentro de `PATTERNS`. El contrato:

```js
miPatron({ rng, d, travel }, out) {
  // rng: azar determinista del tramo. d: dificultad 0..1. travel(dy): avance
  // horizontal necesario para desplazarse dy en vertical.
  out.obstacles.push(/* ... */);
  out.orbs.push(/* ... */);
  return { length, entry: [lo, hi], exit: [lo, hi] };
}
```

Reglas:

- Usá `travel(...)` para todo espaciado que exija cambiar de altura. No inventes números.
- Los orbes van a `ORB.faceOffset` de la cara del obstáculo, nunca más cerca.
- Declará `entry`/`exit` honestamente: son la base del cálculo de separación.
- Registralo en `TIERS` con la dificultad desde la que aparece.
- Validá con `node tools/audit.mjs`.

## Estructura

```
src/
  config.js     todos los números de balance, en un solo lugar
  physics.js    física del jugador y la regla de alcanzabilidad
  rng.js        azar determinista y semillas
  level.js      generador de patrones con el contrato de ventanas
  sim.js        simulación pura
  replay.js     grabación de inputs y ghost
  autopilot.js  controlador heurístico (herramientas + modo autopilot)
  fx.js         partículas, sacudida, destellos
  audio.js      WebAudio con scheduler de lookahead
  render.js     dibujo, viewport virtual y letterbox
  ui.js         DOM del HUD y los paneles
  main.js       loop de paso fijo, estados e input
tools/          servidor, verificación, solver y generación de iconos
```

El campo de juego es un viewport virtual fijo de **540x960** escalado con letterbox.
Así el juego es idéntico en cualquier pantalla: la ventana de reacción, los tamaños de
los huecos y el score son los mismos para todos, que es condición para que un ranking
tenga sentido.

## Subir a itch.io

1. Comprimir **el contenido** de la carpeta en ZIP, con `index.html` en la raíz.
2. Kind of project: **HTML**. Subir el ZIP y marcar "This file will be played in the browser".
3. Viewport recomendado: vertical, con fullscreen habilitado.

El service worker usa **red primero, caché como respaldo**, así que una versión nueva
se toma sola sin dejar a nadie clavado en la anterior.

## Próximas iteraciones

Capa 3 (meta): misiones diarias, biomas por distancia, monedas y skins.
Capa 4 (viral): score card compartible como imagen, ranking de la Daily, ghosts de amigos.
Capa 5 (distribución): telemetría de runs por sesión, punto de abandono y tasa de reintento.
