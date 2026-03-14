// O nome da nossa "caixa" de memória no celular
const CACHE_NAME = "toco-memoria-v1";

// Assim que o jogo abre, o trabalhador entra em ação
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Força a atualização sempre que você mexer no código
});

// A inteligência que intercepta tudo
self.addEventListener("fetch", (event) => {
  // Ignora o Firebase (para não bugar o modo online)
  if (
    event.request.url.includes("firebaseio.com") ||
    event.request.url.includes("googleapis.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // 1. Se o arquivo já está na memória do celular, usa ele (Carregamento instantâneo!)
      if (response) {
        return response;
      }

      // 2. Se não tem, baixa da internet e já salva na memória para a próxima vez
      return fetch(event.request).then(function (networkResponse) {
        // Só salva arquivos normais do jogo
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== "basic"
        ) {
          return networkResponse;
        }
        var responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
