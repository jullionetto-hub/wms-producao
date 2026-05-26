/* ══ WMS Miess — Service Worker ══ */
const CACHE_NAME = 'wms-v13';
// Só cacheia o CSS — JS e HTML sempre vão buscar da rede
const STATIC_ASSETS = [
  '/css/app.css',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) return;

  // HTML — sempre network-first para nunca cachear versão antiga
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Arquivos JS — sempre network-first
  if (url.pathname.startsWith('/js/') || url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // API — network-first
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/pedidos') ||
      url.pathname.startsWith('/repositor') || url.pathname.startsWith('/checkout') ||
      url.pathname.startsWith('/kpis') || url.pathname.startsWith('/estatisticas') ||
      url.pathname.startsWith('/usuarios') || url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/produtividade') || url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/embalagem') || url.pathname.startsWith('/auditoria') ||
      url.pathname.startsWith('/stats')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ erro: 'Sem conexão' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Apenas CSS — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});
