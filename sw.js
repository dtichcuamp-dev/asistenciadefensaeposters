/**
 * SERVICE WORKER - PWA XIV CONGRESO PINEDA (HCUAMP)
 * Soporte Offline de alto rendimiento y cacheo de App Shell
 */

const CACHE_NAME = "congreso-pineda-v1.0.0";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/posters.js",
  "./manifest.json",
  "./assets/logo.png",
  "./assets/favicon.svg",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/lucide@latest",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
];

// Instalación: Precarga de recursos clave
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Precaching app shell");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[Service Worker] Algunos recursos CDN no se pudieron precachear:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza de cachés antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[Service Worker] Eliminando caché antigua:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones (Network first con fallback a Cache para la app)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones hacia Google Script API o métodos POST (se manejan vía Queue en app.js)
  if (event.request.method !== "GET" || url.hostname.includes("script.google.com") || url.hostname.includes("googleusercontent.com")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // En caso de fallo de red, devolver la caché si existe
        return cachedResponse;
      });

      // Retorna la caché inmediatamente si existe (Stale While Revalidate) o espera a la red
      return cachedResponse || fetchPromise;
    })
  );
});
