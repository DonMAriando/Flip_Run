// Genera dist/flip-run.html: un único archivo autocontenido, sin ninguna
// petición externa, que se puede abrir con doble click.
//
// Existe porque el juego se escribe en módulos ES y el navegador los bloquea
// por file://. Servido por HTTP los módulos son lo correcto (recarga limpia,
// archivos chicos, nada de build en el medio); pero "quiero probarlo ahora"
// tiene que funcionar sin levantar un servidor, y para itch.io un solo archivo
// además elimina la posibilidad de subir el ZIP con las rutas mal.
//
// El empaquetado es a propósito diminuto y depende de que src/ use sólo dos
// formas: `import { a, b } from './mod.js'` y `export function|const`. Si algún
// día hace falta más que eso, conviene un bundler de verdad antes que estirar
// esto.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'main.js';

const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/([\w.\-]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

const sources = new Map();
const order = [];
const visiting = new Set();

function depsOf(src) {
  return [...src.matchAll(IMPORT_RE)].map(m => m[2]);
}

function visit(name, trail) {
  if (sources.has(name)) return;
  if (visiting.has(name)) {
    throw new Error(`Dependencia circular: ${[...trail, name].join(' -> ')}`);
  }
  visiting.add(name);

  let src;
  try {
    src = readFileSync(resolve(root, 'src', name), 'utf8');
  } catch {
    throw new Error(`No existe src/${name} (importado desde ${trail.at(-1) ?? 'la raíz'})`);
  }

  for (const dep of depsOf(src)) visit(dep, [...trail, name]);

  visiting.delete(name);
  sources.set(name, src);
  order.push(name); // post-orden: las dependencias quedan antes que quien las usa
}

visit(ENTRY, []);

// Aviso si quedó algún módulo huérfano: casi siempre es un import que se borró
// y dejó código muerto, o un archivo que se olvidó de conectar.
const onDisk = readdirSync(resolve(root, 'src')).filter(f => f.endsWith('.js'));
const unused = onDisk.filter(f => !sources.has(f));
if (unused.length) console.warn(`  aviso: src/ tiene módulos que nadie importa: ${unused.join(', ')}`);

function wrap(name) {
  const src = sources.get(name);
  const exported = [...src.matchAll(EXPORT_DECL_RE)].map(m => m[1]);
  if (!exported.length && name !== ENTRY) {
    throw new Error(`src/${name} no exporta nada con la forma esperada`);
  }

  const body = src
    .replace(IMPORT_RE, (_, names, mod) => `const {${names.trim()}} = __req('${mod}');`)
    .replace(/^export\s+/gm, '');

  const tail = exported.map(n => `  __x.${n} = ${n};`).join('\n');
  return `__mods['${name}'] = function (__x, __req) {\n${body}\n${tail}\n};`;
}

// Registro mínimo de módulos. Se cachea antes de ejecutar el cuerpo para que un
// ciclo degrade a exports parciales en vez de colgarse.
const bundle = `'use strict';
(function () {
const __mods = {};
const __cache = {};
function __req(name) {
  if (!__cache[name]) {
    const __x = {};
    __cache[name] = __x;
    __mods[name](__x, __req);
  }
  return __cache[name];
}

${order.map(wrap).join('\n\n')}

__req('${ENTRY}');
})();`;

const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
let html = readFileSync(resolve(root, 'index.html'), 'utf8');

const replacements = [
  ['<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n  </style>`],
  ['<link rel="manifest" href="manifest.webmanifest" />', ''],
  ['<link rel="icon" href="icons/icon-192.png" />', ''],
  ['<link rel="apple-touch-icon" href="icons/icon-192.png" />', ''],
  // Script clásico, no module: un module inline funciona por file://, pero el
  // clásico no depende de eso. El bundle ya no tiene import/export, así que
  // sólo hace falta reponer el modo estricto que daban los módulos.
  ['<script type="module" src="src/main.js"></script>', `<script>\n${bundle}\n  </script>`]
];

for (const [needle, value] of replacements) {
  if (!html.includes(needle)) {
    throw new Error(`index.html cambió y el build quedó viejo: no encontré ${needle}`);
  }
  html = html.replace(needle, value);
}

// Garantía del build: si quedó cualquier referencia a un archivo local, el
// resultado no es autocontenido y fallaría por file:// igual que antes.
const leftovers = [...html.matchAll(/(?:src|href)\s*=\s*"(?!https?:|data:|#)([^"]+)"/g)].map(m => m[1]);
if (leftovers.length) {
  throw new Error(`El build no es autocontenido, quedaron referencias: ${leftovers.join(', ')}`);
}

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = resolve(root, 'dist', 'flip-run.html');
writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\n  dist/flip-run.html · ${kb} KB · ${order.length} módulos`);
console.log(`  orden: ${order.join(' ')}`);
console.log('\n  Se abre con doble click, sin servidor.\n');
