/**
 * Módulo de Armazenamento Offline-First (LocalStorage)
 *
 * Fornece uma camada de persistência local usando LocalStorage para salvar
 * rascunhos, cadastros e configurações temporariamente quando o usuário estiver
 * sem sinal na obra. Implementa pattern de fallback para IndexedDB se necessário.
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

// ============================================================================
// CHAVES DE LOCALSTORAGE
// ============================================================================

// Chaves usadas no LocalStorage
const STORAGE_KEYS = {
    DRAFTS: 'dc-gestor-drafts',         // Rascunhos de orçamentos em andamento
    CACHE_SYNC: 'dc-gestor-cache-sync', // Marca de tempo para sincronização
    USER_PREFS: 'dc-gestor-user-prefs'  // Preferências do usuário (temas, etc.)
};

/**
 * Estrutura de um rascunho de orçamento no LocalStorage.
 *
 * @typedef {Object} DraftOrcamento
 * @property {string} id - ID único do rascunho (UUID ou timestamp).
 * @property {string} tituloObra - Título da obra informado pelo cliente.
 * @property {string} clienteNome - Nome do cliente.
 * @property {string} clienteTelefone - Telefone do cliente.
 * @property {string} clienteEndereco - Endereço da obra.
 * @property {Array} itens - Array de itens do orçamento.
 * @property {number} valorTotal - Valor total calculado.
 * @property {string} status - Status ('rascunho', 'enviado', etc.).
 * @property {string} createdAt - Data de criação (ISO string).
 * @property {string} updatedAt - Data da última atualização (ISO string).
 */

/**
 * Salva um rascunho de orçamento no LocalStorage.
 *
 * Se já existir um rascunho com o mesmo ID, ele será substituído.
 * Se o storage estiver cheio ou indisponível, o erro será capturado e logged.
 *
 * @param {DraftOrcamento} rascunho - Objeto contendo os dados do rascunho.
 * @returns {boolean} True se o salvamento foi bem-sucedido, false caso contrário.
 */
export function salvarRascunho(rascunho) {
    try {
        if (!window.localStorage) {
            console.warn('⚠️ LocalStorage não disponível neste navegador.');
            return false;
        }

        const rascunhos = listarRascunhos();

        // Remove qualquer rascunho existente com o mesmo ID (atualização)
        const rascunhosAtualizados = rascunhos.filter(r => r.id !== rascunho.id);

        // Adiciona o novo/atualizado rascunho
        rascunhosAtualizados.push({
            ...rascunho,
            createdAt: rascunho.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(rascunhosAtualizados));

        // Atualiza a marca de sincronização
        localStorage.setItem(STORAGE_KEYS.CACHE_SYNC, new Date().toISOString());

        console.log('✅ Rascunho salvo no LocalStorage:', rascunho.id);
        return true;
    } catch (err) {
        console.error('❌ Erro ao salvar rascunho no LocalStorage:', err);
        return false;
    }
}

/**
 * Lista todos os rascunhos salvos no LocalStorage.
 *
 * @returns {Array} Array de objetos de rascunho. Retorna array vazio se não houver dados.
 */
export function listarRascunhos() {
    try {
        const dados = localStorage.getItem(STORAGE_KEYS.DRAFTS);
        if (!dados) return [];

        const rascunhos = JSON.parse(dados);

        // Filtra apenas registros válidos (com ID e dados mínimos)
        return rascunhos.filter(r => r && r.id && r.tituloObra).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (err) {
        console.error('❌ Erro ao listar rascunhos:', err);
        return [];
    }
}

/**
 * Remove um rascunho específico do LocalStorage pelo ID.
 *
 * @param {string} rascunhoId - ID do rascunho a ser removido.
 * @returns {boolean} True se o remoção foi bem-sucedida.
 */
export function removerRascunho(rascunhoId) {
    try {
        const rascunhos = listarRascunhos();
        const rascunhosFiltrados = rascunhos.filter(r => r.id !== rascunhoId);

        localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(rascunhosFiltrados));

        console.log('✅ Rascunho removido do LocalStorage:', rascunhoId);
        return true;
    } catch (err) {
        console.error('❌ Erro ao remover rascunho:', err);
        return false;
    }
}

/**
 * Remove todos os rascunhos do LocalStorage (útil em reset ou logout).
 *
 * @returns {boolean} True se a remoção foi bem-sucedida.
 */
export function limparTodosRascunhos() {
    try {
        localStorage.removeItem(STORAGE_KEYS.DRAFTS);
        localStorage.removeItem(STORAGE_KEYS.CACHE_SYNC);
        console.log('✅ Todos os rascunhos removidos do LocalStorage');
        return true;
    } catch (err) {
        console.error('❌ Erro ao limpar rascunhos:', err);
        return false;
    }
}

/**
 * Verifica se há dados offline salvos e retorna a marca de sincronização.
 *
 * @returns {Object} Objeto com `temDadosOffline` e `ultimaSincronizacao`.
 */
export function verificarEstadoOffline() {
    try {
        const ultimoSync = localStorage.getItem(STORAGE_KEYS.CACHE_SYNC);
        const temDados = listarRascunhos().length > 0;

        return {
            temDadosOffline: temDados,
            ultimaSincronizacao: ultimoSync ? new Date(ultimoSync) : null,
            tempoDesdeSync: ultimoSync
                ? Math.round((new Date().getTime() - new Date(ultimoSync).getTime()) / 60000) + ' minutos'
                : 'Nunca'
        };
    } catch (err) {
        console.error('❌ Erro ao verificar estado offline:', err);
        return {
            temDadosOffline: false,
            ultimaSincronizacao: null,
            tempoDesdeSync: 'Erro'
        };
    }
}

/**
 * Salva preferências do usuário (tema, configurações de interface, etc.).
 *
 * @param {Object} prefs - Objeto contendo as preferências a salvar.
 * @param {string} [prefs.tema='system'] - Tema ('light', 'dark', 'system').
 * @param {boolean} [prefs.notificacoes=true] - Se deve receber notificações.
 * @returns {boolean} True se salvo com sucesso.
 */
export function salvarPreferenciasUsuario(prefs) {
    try {
        const dadosAtuais = listarPreferencias();
        const prefsAtualizadas = {
            ...dadosAtuais,
            ...prefs,
            atualizadaEm: new Date().toISOString()
        };

        localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify(prefsAtualizadas));
        return true;
    } catch (err) {
        console.error('❌ Erro ao salvar preferências:', err);
        return false;
    }
}

/**
 * Lista preferências do usuário do LocalStorage.
 *
 * @returns {Object} Objeto com as preferências atuais.
 */
export function listarPreferencias() {
    try {
        const dados = localStorage.getItem(STORAGE_KEYS.USER_PREFS);
        if (!dados) {
            // Retorna padrões caso não tenham sido salvas ainda
            return { tema: 'system', notificacoes: true, ultimaVersao: '1.0.0' };
        }
        return JSON.parse(dados);
    } catch (err) {
        console.error('❌ Erro ao listar preferências:', err);
        return { tema: 'system', notificacoes: true, ultimaVersao: '1.0.0' };
    }
}

// ============================================================================
// EXTENSÃO OPCIONAL: IndexedDB (comentada para manter simplicidade)
// ============================================================================
// Caso a aplicação precise armazenar grandes volumes de dados (centenas de MB),
// este módulo pode ser estendido para usar IndexedDB em vez de LocalStorage.
// A troca é transparente para o resto da aplicação desde que se mantenha a mesma
// estrutura de chaves e tipos de dados.
// ============================================================================