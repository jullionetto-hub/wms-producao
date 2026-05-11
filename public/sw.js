/* ══ WMS Miess — Service Worker ══ */
const CACHE_NAME = 'wms-v1';
const STATIC_ASSETS = [
  '/',
  '/css/app.css',
  '/js/auth.js',
  '/js/separador.js',
  '/js/repositor.js',
  '/js/checkout.js',
  '/js/pedidos.js',
  '/js/dashboard.js',
];

// Instala e faz cache dos assets estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Ativa e remove caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estratégia: network-first para API, cache-first para estáticos
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ignora extensões do Chrome, requisições de terceiros e não-GET
  if (e.request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) return;

  // API — network-first: tenta rede, fallback silencioso se offline
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/pedidos') ||
      url.pathname.startsWith('/repositor') || url.pathname.startsWith('/checkout') ||
      url.pathname.startsWith('/kpis') || url.pathname.startsWith('/estatisticas') ||
      url.pathname.startsWith('/usuarios') || url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/produtividade') || url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/embalagem') || url.pathname.startsWith('/auditoria')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ erro: 'Sem conexão' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Assets estáticos — cache-first
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
