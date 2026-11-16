// Service Worker do DC Gestor - cache do app para funcionar sem internet
const VERSAO = 'dc-gestor-v3.0.0';
const CASCA = [
  './', './index.html', './manifest.json',
  './js/app.js', './js/auth.js', './js/equipe.js', './js/pdf.js',
  './js/storage.js', './js/supabase.js', './js/utils.js'
];

// Imagens: cada uma entra separada, para um arquivo faltando não travar a instalação
const BANCOS = ['banco-do-brasil', 'bradesco', 'c6', 'caixa', 'inter', 'itau', 'mercado-pago', 'neon', 'nubank', 'original', 'pagbank', 'picpay', 'santander', 'sicoob', 'sicredi'];
const IMAGENS = [
  './assets/img/logo.png', './assets/img/favicon.png', './assets/img/apple-touch-icon.png', './assets/img/whatsapp.png',
  './assets/img/icon-192.png', './assets/img/icon-512.png', './assets/img/icon-maskable-512.png',
  ...BANCOS.map((n) => './assets/logos-bancos/' + n + '.png')
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSAO)
      .then(async (c) => {
        await c.addAll(CASCA);
        await Promise.allSettled(IMAGENS.map((u) => c.add(u)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca intercepta o Supabase (API, auth e realtime)
  if (url.hostname.endsWith('supabase.co')) return;

  // Navegação: tenta a rede e cai para o index em cache quando offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSAO).then((c) => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Demais arquivos: usa o cache e atualiza em segundo plano
  e.respondWith(
    caches.match(req).then((emCache) => {
      const rede = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copia = res.clone();
            caches.open(VERSAO).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => emCache);
      return emCache || rede;
    })
  );
});