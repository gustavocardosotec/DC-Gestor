/**
 * Service Worker para o DC Gestor (v1.0 Alfa)
 *
 * Este Service Worker implementa estratégias de cache para tornar a aplicação
 * funcional offline após a primeira carga. As estratégias utilizadas:
 *
 * - Cache First: Para ativos estáticos (HTML, CSS, JS, imagens) - garante carregamento rápido
 * - Stale While Revalidate: Para dados da API (quando houver integração futura)
 * - Network Only: Para requisições que devem sempre ir à rede
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

const CACHE_NAME = 'dc-gestor-v1-alpha';
const ASSETS_CRITICOS = [
    // Assets essenciais que devem sempre estar disponíveis offline
    '/',
    '/index.html',
    '/js/app.js',
    '/js/supabase.js',
    '/js/auth.js',
    '/js/storage.js',
    '/manifest.json',
    '/sw.js',
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Instalando...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Service Worker: Cache aberto, adicionando assets críticos...');
                return cache.addAll(ASSETS_CRITICOS)
                    .then(() => {
                        console.log('✅ Service Worker: Assets críticos cacheados');
                        // Força o ativação imediata após instalação
                        return self.skipWaiting();
                    })
                    .catch((err) => {
                        console.error('❌ Service Worker: Erro ao cachear assets:', err);
                    });
            })
            .catch((err) => {
                console.error('❌ Service Worker: Erro ao abrir cache:', err);
            })
    );
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker: Ativando...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('🗑️ Service Worker: Removendo cache antigo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
            // Remove qualquer claim antigo e assume o controle imediatamente
            .then(() => {
                console.log('✅ Service Worker: Ativo e assumindo controle');
                return self.clients.claim();
            })
    );
});

// Estratégia de busca (Fetch Events)
self.addEventListener('fetch', (event) => {
    // Pular requisições para terceiros ou API endpoints que não devemos cachear
    const url = new URL(event.request.url);

    // Apenas cachear requests na mesma origem
    if (url.origin !== self.location.origin && !url.origin.includes('supabase')) {
        // Permitir requisições para API do Supabase sem interferir
        if (url.pathname.startsWith('/auth/) || url.pathname.includes('functions')) {
            // Não interceptar chamadas de função ou auth do Supabase
            return;
        }
    }

    // Estratégia: Cache First para navegador/same-origin requests
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Se encontrado em cache, retorna do cache
                if (cachedResponse) {
                    // Para navegações e requests GET, também busca atualização em background
                    if (event.request.method === 'GET') {
                        const fetchPromise = fetch(event.request)
                            .then((networkResponse) => {
                                // Atualiza cache em segundo plano (não bloqueia a resposta)
                                if (networkResponse.ok) {
                                    const cloned = networkResponse.clone();
                                    caches.open(CACHE_NAME)
                                        .then((cache) => {
                                            cache.put(event.request, cloned).catch(
                                                (err) => console.log('Cache update failed:', err)
                                        ));
                                }
                                return networkResponse;
                            })
                            .catch((err) => {
                                console.log('Fetch error, serving from cache:', err);
                                return null;
                            });

                        // Retorna cache imediatamente, atualiza background
                        return cachedResponse || fetchPromise;
                    }

                    return cachedResponse;
                }

                // Se não está em cache, busca na rede
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Não cachear respostas de erro ou não-GET
                        if (event.request.method === 'GET' && networkResponse.ok) {
                            const cloned = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, cloned).catch(
                                        (err) => console.log('Cache put failed:', err)
                                    );
                                });
                        }
                        return networkResponse;
                    })
                    .catch((err) => {
                        console.error('❌ Service Worker: Erro na rede:', err);

                        // Se falhou na rede e estamos offline, tenta do cache
                        if (event.request.method === 'GET') {
                            return cachedResponse || (
                                caches.match(event.request)
                                    .then((r) => r || offlineFallback(event.request))
                            );
                        }

                        throw err;
                    });
            })
    );
});

/**
 * Fallback offline para requisições que não podem ser atendidas do cache.
 *
 * Retorna uma resposta genérica indicando que o recurso não está disponível offline.
 *
 * @param {Request} request - A requisição que falhou.
 * @returns {Promise<Response>} Response indicando recurso indisponível offline.
 */
function offlineFallback(request) {
    // Para navegações (HTML), retorna a página offline básica
    if (request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept') includes('text/html'))) {
        return caches.match('/index.html')
            .then((response) => {
                if (response) return response;
                // Fallback HTML genérico
                return new Response(
                    '<html><body><h1>DC Gestor Offline</h1>' +
                    '<p>A aplicação está funcionando em modo offline.</p>' +
                    '<p>Alguns dados podem não estar disponíveis até o retorno da conexão.</p>' +
                    '</body></html>',
                    {
                        headers: { 'Content-Type': 'text/html' }
                    }
                );
            });
    }

    // Para outros tipos de requisição, retorna JSON de erro
    return new Response(
        JSON.stringify({ error: 'Recurso não disponível em modo offline', requestUrl: request.url }),
        {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}

// ============================================================================
// BACKGROUND SYNC (Comentado para simplicidade - pode ser ativado posteriormente)
// ============================================================================
//
// // Registra um background sync para sincronizar rascunhos quando voltar online
// if ('serviceWorker' in navigator && 'sync' in Registration.prototype) {
//     async function registrarSync() {
//         try {
//             const registration = await navigator.serviceWorker.ready;
//             await registration.sync.register('dc-gestor-sync-drafts');
//             console.log('✅ Background sync registrado para rascunhos');
//         } catch (err) {
//             console.warn('⚠️ Não foi possível registrar background sync:', err);
//         }
//     }
//
// // Escuta mensagens do cliente para trigger sync
// self.addEventListener('message', (event) => {
//     if (event.data && event.data.type === 'trigger-sync') {
//         event.source.postMessage({ type: 'sync-now' });
//     }
// });
// ============================================================================