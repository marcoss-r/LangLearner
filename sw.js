// Service Worker de LangLearner.
// Sube CACHE_VERSION en cada despliegue que cambie ficheros del app shell:
// con estrategia cache-first, un CACHE_VERSION sin cambios deja a los usuarios
// atrapados en la versión antigua de HTML/CSS/JS.
const CACHE_VERSION = 'll-v6';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// Rutas relativas al scope del SW (./), imprescindible bajo un subdirectorio de GitHub Pages.
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/exercises.css',
  './css/screens.css',
  './css/lesson.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/data.js',
  './js/srs.js',
  './js/audio.js',
  './js/grader.js',
  './js/screens/parts.js',
  './js/screens/session.js',
  './js/screens/home.js',
  './js/screens/course.js',
  './js/screens/lesson.js',
  './js/screens/exam.js',
  './js/screens/review.js',
  './js/screens/stats.js',
  './js/screens/settings.js',
  './js/screens/dev.js',
  './js/exercises/index.js',
  './js/exercises/shared.js',
  './js/exercises/mcq.js',
  './js/exercises/trueFalse.js',
  './js/exercises/oddOneOut.js',
  './js/exercises/genderArticle.js',
  './js/exercises/matchPairs.js',
  './js/exercises/categorize.js',
  './js/exercises/fillBlank.js',
  './js/exercises/wordOrder.js',
  './js/exercises/translate.js',
  './js/exercises/conjugation.js',
  './js/exercises/listening.js',
  './js/exercises/shadowing.js',
  './js/exercises/speakPrompt.js',
  './js/exercises/dialogue.js',
  './js/exercises/errorCorrection.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Permite a la pantalla de Ajustes forzar la activación inmediata de un SW nuevo
// tras pulsar "Buscar actualizaciones" (registration.update() + recarga).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isDataRequest(url) {
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isDataRequest(url)) {
    // stale-while-revalidate: sirve rápido de caché y actualiza en segundo plano.
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      // Cualquier navegación sin coincidencia exacta en caché (por ejemplo con
      // query string) debe caer en el index cacheado: si no, sin red la app
      // arranca en blanco en vez de abrir.
      if (request.mode === 'navigate') {
        return fetch(request).catch(() => caches.match('./index.html'));
      }
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
