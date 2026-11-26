// Service Worker aditivo da versão 4.0.7 do DC Gestor.
// Mantém o cache offline existente e inclui os módulos com as novas melhorias.
const VERSAO = 'dc-gestor-v4.0.7';
const CASCA = [
  './', './index.html', './manifest.json',
  './js/app.js', './js/auth.js', './js/equipe.js', './js/pdf.js',
  './js/storage.js', './js/supabase.js', './js/utils.js'
];
const BANCOS = ['banco-do-brasil', 'bradesco', 'c6', 'caixa', 'inter', 'itau', 'mercado-pago', 'neon', 'nubank', 'original', 'pagbank', 'picpay', 'santander', 'sicoob', 'sicredi'];
const IMAGENS = [
  './assets/img/logo.png', './assets/img/favicon.png', './assets/img/apple-touch-icon.png', './assets/img/whatsapp.png',
  './assets/img/icon-192.png', './assets/img/icon-512.png', './assets/img/icon-maskable-512.png',
  ...BANCOS.map((name) => './assets/logos-bancos/' + name + '.png')
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSAO)
      .then(async (cache) => {
        await cache.addAll(CASCA);
        await Promise.allSettled(IMAGENS.map((url) => cache.add(url)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('dc-gestor-') && key !== VERSAO).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.hostname.endsWith('supabase.co')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) caches.open(VERSAO).then((cache) => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('./index.html').then((response) => response || caches.match('./')))
    );
    return;
  }
  event.respondWith(
    caches.open(VERSAO).then((cache) => cache.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    }))
  );
});
