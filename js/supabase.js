/**
 * Módulo Centralizado de Inicialização do Supabase
 *
 * Este módulo configura e exporta o cliente Supabase para uso em toda a aplicação.
 * As credenciais devem ser preenchidas no painel do Supabase ou via variáveis de ambiente.
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

// ============================================================================
// CONFIGURAÇÕES DO SUPABASE
// ============================================================================

// TODO: Substitua estas credenciais pelas do seu projeto Supabase
// Acesse: https://supabase.com/dashboard -> Settings -> API
const SUPABASE_URL = 'https://rdhzwaspxdgtdfzzxrke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PZCpFohy1s3iaMkspo4Qng_tHthv1RM';

// ============================================================================
// CRIAÇÃO DO CLIENTE SUPABASE
// ============================================================================

/**
 * Retorna o cliente Supabase configurado.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Cliente Supabase configurado.
 */
// Cliente único (evita várias instâncias do GoTrueClient)
let clienteUnico = null;

export function createClient() {
    if (!SUPABASE_URL || SUPABASE_URL.includes('SUPABASE-PROJECT-ref')) {
        console.warn('⚠️ Aviso: URL do Supabase não configurada. Verifique o arquivo js/supabase.js.');
    }

    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('SUPABASE-ANON-PUBLIC-KEY')) {
        console.warn('⚠️ Aviso: Chave anonima do Supabase não configurada. Verifique o arquivo js/supabase.js.');
    }

    // Biblioteca carregada via CDN no index.html (global window.supabase)
    if (!window.supabase?.createClient) {
        throw new Error('supabase-js não carregou. Verifique o <script> do CDN no index.html.');
    }
    if (!clienteUnico) {
        clienteUnico = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return clienteUnico;
}

// Exporta o cliente para importação direta se necessário
export const supabase = createClient();

// ============================================================================
// UTILITÁRIOS DO SUPABASE
// ============================================================================

/**
 * Formata um erro do Supabase para mensagem amigável.
 *
 * @param {Error} error - Erro do Supabase.
 * @returns {string} Mensagem de erro formatada.
 */
export function formatError(error) {
    if (!error) return 'Erro desconhecido';

    const errorCode = error.code || error.statusCode || '';
    const errorMessage = error.message || error.error || 'Erro ao processar solicitação';

    // Mapeamento de códigos de erro comuns
    const errorMap = {
        '23505': 'Este registro já existe no sistema.',           // Unique violation
        '23503': 'Não é possível excluir: há dependências neste registro.', // Foreign key violation
        'PGRST301': 'Não foi possível conectar ao banco de dados.', // Connection error
    };

    if (errorMap[errorCode]) {
        return errorMap[errorCode];
    }

    return errorMessage;
}

/**
 * Verifica se o usuário está autenticado.
 *
 * @returns {Promise<boolean>} True se o usuário estiver logado.
 */
export async function isAuthenticated() {
    const { data: { session} } = await supabase.auth.getSession();
    return !!session;
}

/**
 * Obtém o ID do usuário autenticado.
 *
 * @returns {Promise<string|null>} ID do usuário ou null se não houver sessão.
 */
export async function getUserId() {
    const { data: { user} } = await supabase.auth.getUser();
    return user?.id ?? null;
}

