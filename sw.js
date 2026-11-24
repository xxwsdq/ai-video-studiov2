// AI Video Studio — безопасное обновление кэша
const CACHE_NAME = "ai-video-studio-v05";
const CACHE_PREFIX = "ai-video-studio-";

self.addEventListener("install", (event) => {
  // Не блокируем установку из-за отсутствующего необязательного файла.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Для HTML и файлов приложения сначала берём свежую версию с GitHub Pages.
  const isAppFile =
    request.mode === "navigate" ||
    /\/(index\.html|app\.js|styles\.css|manifest\.json|sw\.js)$/.test(url.pathname);

  if (isAppFile) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Для остальных файлов используем кэш, затем сеть.
  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
    )
  );
});
