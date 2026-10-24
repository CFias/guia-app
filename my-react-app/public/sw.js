/* global self */
/* Service worker do app do motorista / painel do fornecedor (Luck).
   - deixa o site "instalável" (tela inicial, abre como app)
   - recebe a notificação push "Passageiros recepcionados" com o app fechado
   - ao tocar na notificação, abre (ou traz para a frente) o link do motorista
   Não guarda páginas em cache: o sistema sempre carrega a versão nova. */

const CACHE_CONFIG = "luck-motorista-config";
const CHAVE_LINK = "/__ultimo-link";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

// passa direto para a rede (o Chrome exige um fetch handler para instalar)
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { corpo: event.data ? event.data.text() : "" };
  }
  const titulo = dados.titulo || "Luck Receptivo";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      tag: dados.tag || "luck",
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400],
      icon: "/icon-192.png",
      badge: "/favicon-32x32.png",
      data: { url: dados.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      let url = event.notification.data?.url || "/";
      try {
        const cache = await self.caches.open(CACHE_CONFIG);
        const salvo = await cache.match(CHAVE_LINK);
        if (salvo) url = (await salvo.text()) || url;
      } catch {
        /* sem cache: abre o endereço da notificação */
      }
      const abertas = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const doMotorista = abertas.find(
        (c) => c.url.includes("/m/") || c.url.includes("/fornecedor"),
      );
      if (doMotorista) return doMotorista.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
