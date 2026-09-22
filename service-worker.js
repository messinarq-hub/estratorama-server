// Estratorama — Service Worker
// Objetivo: que la ficha (index.html) pueda abrirse sin internet, incluso
// después de cerrar el navegador. NO cachea llamadas a la API (Render) —
// esas siguen su propio manejo de red/cola offline dentro de la app.

const CACHE_NAME = 'estratorama-cache-v1';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('SW: no se pudo pre-cachear todo', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo interceptamos peticiones GET a nuestro propio origen (la página en sí).
  // Todo lo demás (la API en Render, Google Fonts, etc.) pasa de largo sin tocarlo.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // "network-first": si hay internet, siempre se usa la versión más nueva,
        // y de paso se actualiza la caché — así una actualización futura llega
        // apenas haya conexión, sin perder la posibilidad de abrir offline.
        const copia = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
