// Estrategia: red primero, caché como respaldo.
//
// Un cache-first deja al jugador clavado en una versión vieja sin forma obvia
// de salir (y durante el desarrollo hace perder horas depurando código que ya
// no existe). Acá la red siempre gana cuando está disponible, y la caché sirve
// solo para que el juego funcione sin conexión.
const CACHE = 'fliprun-v3';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/main.js',
  'src/config.js',
  'src/rng.js',
  'src/storage.js',
  'src/level.js',
  'src/physics.js',
  'src/sim.js',
  'src/replay.js',
  'src/autopilot.js',
  'src/fx.js',
  'src/audio.js',
  'src/render.js',
  'src/ui.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
