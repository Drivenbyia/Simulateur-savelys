/**
 * Service worker — installation PWA + usage hors-ligne.
 *
 * Stratégie NETWORK-FIRST sur le même domaine : on sert toujours la version
 * fraîche quand le réseau est là (indispensable pour qu'un correctif de calcul
 * atteigne immédiatement les utilisateurs), et on retombe sur le cache uniquement
 * hors-ligne. Bumper CACHE à chaque changement de structure d'assets.
 */
const CACHE = "simu-pac-savelys-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles/main.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/logo-savelys.svg",
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
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Network-first : réseau prioritaire, cache en secours (hors-ligne).
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
