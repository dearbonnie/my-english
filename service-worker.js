const CACHE = "my-english-v2-minimal-6";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js?v=2-minimal-7",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./src/adapters/storage/local-storage-adapter.js",
  "./src/adapters/sync/google-drive-sync-provider.js?v=oauth-1",
  "./src/config/public-google-config.js?v=oauth-1",
  "./src/core/contract-constants.js", "./src/core/data-contract.js",
  "./src/core/data-validator.js", "./src/core/errors.js",
  "./src/core/migration-registry.js", "./src/core/namespace-registry.js",
  "./src/core/repository.js", "./src/core/storage-adapter.js",
  "./src/integration/my-english-integration.js?v=2-minimal",
  "./src/shared/checksum.js", "./src/shared/dates.js", "./src/shared/ids.js",
  "./src/system/system-namespace-definitions.js",
  "./src/tools/my-english/my-english-migrations.js",
  "./src/tools/my-english/my-english-repository.js",
  "./src/tools/my-english/my-english-speech.js?v=voice-1",
  "./src/tools/my-english/my-english-sync.js?v=sync-1"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("my-english-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
