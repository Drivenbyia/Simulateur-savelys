/**
 * Service worker — cache de l'app-shell pour l'installation PWA / usage hors-ligne.
 * Stratégie : cache-first sur les ressources statiques, avec mise à jour en tâche de fond.
 */
const CACHE = "simu-pac-savelys-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles/main.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/constants.js",
  "./js/data/climate.js",
  "./js/data/postal-zones.js",
  "./js/data/aides-baremes.js",
  "./js/engines/deperditions.js",
  "./js/engines/dimensionnement.js",
  "./js/engines/prix.js",
  "./js/engines/amortissement.js",
  "./js/engines/aides.js",
  "./js/ui/tunnel.js",
  "./js/ui/render.js",
  "./js/ui/lead.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
