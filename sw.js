// Cache offline do DC Gestor 5.0. O Supabase nunca é interceptado.
const VERSAO = 'dc-gestor-v5.0.0';
const CASCA = [
  './', './index.html', './manifest.json',
  './js/app.js', './js/auth.js', './js/equipe.js', './js/pdf.js',
  './js/storage.js', './js/supabase.js', './js/utils.js'
];
const ARQUIVOS_EXTERNOS = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];
const ORIGENS_EXTERNAS = new Set([
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://esm.sh'
]);

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    await cache.addAll(CASCA);
    await Promise.allSettled(ARQUIVOS_EXTERNOS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((nome) => nome.startsWith('dc-gestor-') && nome !== VERSAO).map((nome) => caches.delete(nome)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.hostname.endsWith('supabase.co')) return;
  const mesmaOrigem = url.origin === self.location.origin;
  if (!mesmaOrigem && !ORIGENS_EXTERNAS.has(url.origin)) return;

  evento.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const guardado = await cache.match(requisicao);

    if (requisicao.mode === 'navigate') {
      try {
        const resposta = await fetch(requisicao);
        if (resposta && resposta.ok) await cache.put('./index.html', resposta.clone());
        return resposta;
      } catch {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    }

    const atualizar = fetch(requisicao).then(async (resposta) => {
      if (resposta && (resposta.ok || resposta.type === 'opaque')) await cache.put(requisicao, resposta.clone());
      return resposta;
    }).catch(() => guardado);

    return guardado || atualizar;
  })());
});
