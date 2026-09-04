// Genera los iconos PNG de la PWA sin dependencias externas.
// Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

// Marca: las dos barras del "//" del logo, en cian y lima.
const SLASHES = [
  { c: 0.46, color: [0x6c, 0xe8, 0xff] },
  { c: 0.76, color: [0xa8, 0xff, 0x3e] }
];
const SLANT = 0.3;
const HALF_W = 0.072;

function drawIcon(size, pad) {
  const px = Buffer.alloc(size * size * 4);
  const aa = 1.6 / size;
  const scale = 1 - 2 * pad;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      let r = mix(0x12, 0x05, v) / 255;
      let g = mix(0x1a, 0x07, v) / 255;
      let b = mix(0x35, 0x0f, v) / 255;

      const dr = Math.hypot(u - 0.5, v - 0.36);
      const halo = Math.exp(-(dr * dr) / 0.09) * 0.16;
      r += halo * 0.42; g += halo * 0.9; b += halo;

      const gx = (u - 0.5) / scale + 0.5;
      const gy = (v - 0.5) / scale + 0.5;
      const endFade = smoothstep(0.16, 0.24, gy) * (1 - smoothstep(0.76, 0.84, gy));

      for (const s of SLASHES) {
        const d = Math.abs(gx + SLANT * gy - s.c);
        const core = (1 - smoothstep(HALF_W - aa, HALF_W + aa, d)) * endFade;
        const glow = Math.exp(-Math.pow((d - HALF_W) / 0.07, 2)) * 0.4 * endFade;
        const cr = s.color[0] / 255, cg = s.color[1] / 255, cb = s.color[2] / 255;
        r = mix(r, cr, core) + cr * glow * (1 - core);
        g = mix(g, cg, core) + cg * glow * (1 - core);
        b = mix(b, cb, core) + cb * glow * (1 - core);
      }

      const i = (y * size + x) * 4;
      px[i] = Math.round(clamp01(r) * 255);
      px[i + 1] = Math.round(clamp01(g) * 255);
      px[i + 2] = Math.round(clamp01(b) * 255);
      px[i + 3] = 255;
    }
  }
  return px;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0.13],
  ['icon-512.png', 512, 0.13],
  // Los iconos maskable necesitan el glifo dentro del 80% central.
  ['icon-maskable-512.png', 512, 0.24]
]) {
  writeFileSync(join(OUT_DIR, name), encodePng(size, drawIcon(size, pad)));
  console.log(`icons/${name}`);
}
