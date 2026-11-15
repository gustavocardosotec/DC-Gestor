/**
 * Módulo de Utilitários do DC Gestor
 *
 * Funções auxiliares para formatação, cálculos, validações e helpers gerais.
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

// ============================================================================
// FORMATAÇÃO DE MOEDA E NÚMEROS
// ============================================================================

/**
 * Formata um número para moeda brasileira (R$ X.XXX,XX).
 *
 * @param {number} valor - Valor numérico.
 * @returns {string} Valor formatado.
 */
export function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

/**
 * Formata um número para exibição simples (1.234,56).
 *
 * @param {number} valor - Valor numérico.
 * @param {number} decimais - Casas decimais (padrão 2).
 * @returns {string} Valor formatado.
 */
export function formatarNumero(valor, decimais = 2) {
    if (typeof valor !== 'number' || isNaN(valor)) return '0'.padStart(decimais + 1, '0');
    return valor.toLocaleString('pt-BR', {
        minimumFractionDigits: decimais,
        maximumFractionDigits: decimais
    });
}

/**
 * Converte string de moeda brasileira para número.
 * Ex: "R$ 1.234,56" -> 1234.56
 *
 * @param {string} str - String com valor monetário.
 * @returns {number} Valor numérico.
 */
export function parseMoeda(str) {
    if (!str) return 0;
    // Remove R$, espaços, pontos de milhar, troca vírgula por ponto
    const limpo = str.replace(/[R$\s.]/g, '').replace(',', '.');
    const num = parseFloat(limpo);
    return isNaN(num) ? 0 : num;
}

/**
 * Formata quantidade removendo .00 desnecessário.
 *
 * @param {number} qtd - Quantidade.
 * @returns {string} Quantidade formatada.
 */
export function formatarQuantidade(qtd) {
    if (typeof qtd !== 'number' || isNaN(qtd)) return '0';
    return qtd % 1 === 0 ? qtd.toString() : qtd.toFixed(2).replace('.', ',');
}

// ============================================================================
// CÁLCULOS DE ORÇAMENTO
// ============================================================================

/**
 * Calcula o valor total de um item (quantidade × valor unitário).
 *
 * @param {number} quantidade - Quantidade do item.
 * @param {number} valorUnitario - Valor unitário.
 * @returns {number} Valor total do item.
 */
export function calcularValorTotalItem(quantidade, valorUnitario) {
    return Math.round((quantidade * valorUnitario) * 100) / 100;
}

/**
 * Calcula o valor total de um orçamento somando todos os itens.
 *
 * @param {Array} itens - Array de itens do orçamento.
 * @returns {number} Valor total do orçamento.
 */
export function calcularValorTotalOrcamento(itens) {
    if (!Array.isArray(itens)) return 0;
    return itens.reduce((total, item) => {
        const qtd = parseFloat(item.quantidade) || 0;
        const vu = parseFloat(item.valorUnitario) || 0;
        return total + (qtd * vu);
    }, 0);
}

/**
 * Encontra a melhor cotação (menor preço) para um item.
 *
 * @param {Array} cotacoes - Array de cotações [{loja, valorUnitario}].
 * @returns {Object|null} Melhor cotação ou null se não houver.
 */
export function encontrarMelhorCotacao(cotacoes) {
    if (!Array.isArray(cotacoes) || cotacoes.length === 0) return null;
    return cotacoes.reduce((melhor, atual) => {
        const vAtual = parseFloat(atual.valorUnitario) || Infinity;
        const vMelhor = parseFloat(melhor.valorUnitario) || Infinity;
        return vAtual < vMelhor ? atual : melhor;
    });
}

/**
 * Calcula economia total comparando com a pior cotação.
 *
 * @param {Array} itens - Itens com cotações.
 * @returns {number} Valor economizado.
 */
export function calcularEconomiaTotal(itens) {
    if (!Array.isArray(itens)) return 0;
    return itens.reduce((economia, item) => {
        if (!item.cotacoes || item.cotacoes.length < 2) return economia;
        const valores = item.cotacoes.map(c => parseFloat(c.valorUnitario) || 0).filter(v => v > 0);
        if (valores.length < 2) return economia;
        const menor = Math.min(...valores);
        const maior = Math.max(...valores);
        const qtd = parseFloat(item.quantidade) || 1;
        return economia + ((maior - menor) * qtd);
    }, 0);
}

// ============================================================================
// VALIDAÇÕES
// ============================================================================

/**
 * Valida CPF/CNPJ básico (apenas formato).
 *
 * @param {string} doc - CPF ou CNPJ.
 * @returns {boolean} True se formato válido.
 */
export function validarCpfCnpj(doc) {
    if (!doc) return false;
    const limpo = doc.replace(/\D/g, '');
    return limpo.length === 11 || limpo.length === 14;
}

/**
 * Valida telefone brasileiro.
 *
 * @param {string} tel - Telefone.
 * @returns {boolean} True se formato válido.
 */
export function validarTelefone(tel) {
    if (!tel) return false;
    const limpo = tel.replace(/\D/g, '');
    return limpo.length >= 10 && limpo.length <= 11;
}

/**
 * Valida e-mail.
 *
 * @param {string} email - E-mail.
 * @returns {boolean} True se formato válido.
 */
export function validarEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valida campos obrigatórios do orçamento.
 *
 * @param {Object} dados - Dados do orçamento.
 * @returns {Object} {valido: boolean, erros: string[]}.
 */
export function validarOrcamento(dados) {
    const erros = [];

    if (!dados.tituloObra?.trim()) erros.push('Título da obra é obrigatório');
    if (!dados.clienteNome?.trim()) erros.push('Nome do cliente é obrigatório');
    if (!dados.clienteTelefone?.trim()) erros.push('Telefone do cliente é obrigatório');
    else if (!validarTelefone(dados.clienteTelefone)) erros.push('Telefone inválido');
    if (!dados.itens || dados.itens.length === 0) erros.push('Adicione pelo menos um item/material');

    return {
        valido: erros.length === 0,
        erros
    };
}

// ============================================================================
// HELPERS DE DATA E ID
// ============================================================================

/**
 * Gera ID único curto (timestamp + random).
 *
 * @returns {string} ID único.
 */
export function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Formata data para padrão brasileiro (DD/MM/AAAA).
 *
 * @param {Date|string} data - Data.
 * @returns {string} Data formatada.
 */
export function formatarData(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
}

/**
 * Formata data e hora para padrão brasileiro.
 *
 * @param {Date|string} data - Data.
 * @returns {string} Data e hora formatada.
 */
export function formatarDataHora(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR');
}

/**
 * Gera código do orçamento (ex: ORC-20241115-ABC123).
 *
 * @returns {string} Código do orçamento.
 */
export function gerarCodigoOrcamento() {
    const agora = new Date();
    const dataStr = agora.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substr(2, 5).toUpperCase();
    return `ORC-${dataStr}-${rand}`;
}

// ============================================================================
// QR CODE PIX (EMV)
// ============================================================================

/**
 * Mapeamento de bancos para códigos ISPB/participantes do Pix.
 */
export const BANCOS_PIX = {
    'nubank': { nome: 'Nubank', ispb: '18236120', arquivo: 'Nubank.png' },
    'itau': { nome: 'Itaú', ispb: '60701190', arquivo: 'Itaú.png' },
    'bradesco': { nome: 'Bradesco', ispb: '60746948', arquivo: 'Bradesco.png' },
    'caixa': { nome: 'Caixa', ispb: '00360305', arquivo: 'Caixa.png' },
    'santander': { nome: 'Santander', ispb: '90400888', arquivo: 'Santander.png' },
    'banco-do-brasil': { nome: 'Banco do Brasil', ispb: '00000000', arquivo: 'Banco do Brasil.png' },
    'inter': { nome: 'Inter', ispb: '07416731', arquivo: 'Inter.png' },
    'c6': { nome: 'C6 Bank', ispb: '36030526', arquivo: 'C6.png' },
    'original': { nome: 'Original', ispb: '12440788', arquivo: 'Original.png' },
    'mercado-pago': { nome: 'Mercado Pago', ispb: '10573521', arquivo: 'Mercado Pago.png' },
    'picpay': { nome: 'PicPay', ispb: '17352188', arquivo: 'PicPay.png' },
    'pagbank': { nome: 'PagBank', ispb: '29093580', arquivo: 'PagBank.png' },
    'neon': { nome: 'Neon', ispb: '20115437', arquivo: 'Neon.png' },
    'sicredi': { nome: 'Sicredi', ispb: '02529725', arquivo: 'Sicredi.png' },
    'sicoob': { nome: 'Sicoob', ispb: '02018587', arquivo: 'Sicoob.png' },
};

/**
 * Gera o payload EMV para QR Code Pix (Copia e Cola).
 * Baseado na especificação do Banco Central do Brasil.
 *
 * @param {Object} config - Configurações Pix.
 * @param {string} config.tipoChave - Tipo da chave (cpf, cnpj, email, telefone, aleatoria).
 * @param {string} config.chave - Chave Pix.
 * @param {string} config.recebedor - Nome do recebedor.
 * @param {string} config.cidade - Cidade do recebedor.
 * @param {number} config.valor - Valor da transação.
 * @param {string} [config.txid] - Identificador da transação.
 * @param {string} [config.banco] - Chave do banco (ex: 'nubank').
 * @returns {string} Payload EMV para QR Code.
 */
export function gerarPayloadPix(config) {
    const {
        tipoChave,
        chave,
        recebedor,
        cidade,
        valor,
        txid,
        banco
    } = config;

    // Função para criar campo EMV (ID + tamanho + valor)
    const emv = (id, value) => {
        const str = String(value);
        const len = str.length.toString().padStart(2, '0');
        return `${id}${len}${str}`;
    };

    // Payload Format Indicator (00) - sempre "01"
    let payload = emv('00', '01');

    // Point of Initiation Method (01) - 11 = estático, 12 = dinâmico
    const temValor = valor && valor > 0;
    payload += emv('01', temValor ? '12' : '11');

    // Merchant Account Information (26) - GUI + Chave
    // GUI do BR Code: br.gov.bcb.pix
    let merchantInfo = emv('00', 'br.gov.bcb.pix');
    // Chave Pix (01)
    merchantInfo += emv('01', chave);
    // Informações adicionais (02) - opcional, pode incluir txid
    if (txid) {
        merchantInfo += emv('02', txid);
    }
    payload += emv('26', merchantInfo);

    // Merchant Category Code (52) - 0000 = não especificado
    payload += emv('52', '0000');

    // Transaction Currency (53) - 986 = BRL
    payload += emv('53', '986');

    // Transaction Amount (54) - apenas se valor informado
    if (temValor) {
        payload += emv('54', valor.toFixed(2));
    }

    // Country Code (58) - BR
    payload += emv('58', 'BR');

    // Merchant Name (59) - nome do recebedor (máx 25 chars)
    const nomeRecebedor = recebedor.substring(0, 25);
    payload += emv('59', nomeRecebedor);

    // Merchant City (60) - cidade (máx 15 chars)
    const cidadeRecebedor = cidade.substring(0, 15);
    payload += emv('60', cidadeRecebedor);

    // Postal Code (61) - opcional, CEP
    // payload += emv('61', '01310100');

    // Additional Data Field Template (62)
    let additionalData = '';
    // Reference Label (05) - identificador da transação
    if (txid) {
        additionalData += emv('05', txid);
    }
    if (additionalData) {
        payload += emv('62', additionalData);
    }

    // CRC16 (63) - calculado no final
    const payloadParaCrc = payload + '6304';
    const crc = calcularCRC16(payloadParaCrc).toString(16).toUpperCase().padStart(4, '0');
    payload += emv('63', crc);

    return payload;
}

/**
 * Calcula CRC16 (CCITT-FALSE / ISO 13239) para validação do Pix.
 *
 * @param {string} str - String para calcular CRC.
 * @returns {number} CRC16.
 */
function calcularCRC16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc & 0xFFFF;
}

/**
 * Retorna o caminho do logo do banco para o QR Code.
 *
 * @param {string} bancoKey - Chave do banco (ex: 'nubank').
 * @returns {string} Caminho relativo do logo.
 */
export function getLogoBanco(bancoKey) {
    const banco = BANCOS_PIX[bancoKey?.toLowerCase()];
    if (banco) {
        return `assets/logos-bancos/${banco.arquivo}`;
    }
    // Fallback genérico
    return 'assets/logos-bancos/Nubank.png';
}

/**
 * Retorna lista de bancos disponíveis para select.
 *
 * @returns {Array} Array de {value, label, arquivo}.
 */
export function listarBancosDisponiveis() {
    return Object.entries(BANCOS_PIX).map(([key, banco]) => ({
        value: key,
        label: banco.nome,
        arquivo: banco.arquivo
    }));
}

// ============================================================================
// WHATSAPP
// ============================================================================

/**
 * Gera link do WhatsApp com mensagem pré-preenchida.
 *
 * @param {Object} params - Parâmetros da mensagem.
 * @param {string} params.telefone - Telefone do destinatário (com DDD, só números).
 * @param {string} params.mensagem - Mensagem codificada.
 * @returns {string} URL do WhatsApp.
 */
export function gerarLinkWhatsApp({ telefone, mensagem }) {
    const tel = telefone.replace(/\D/g, '');
    const msg = encodeURIComponent(mensagem);
    return `https://wa.me/55${tel}?text=${msg}`;
}

/**
 * Substitui placeholders na mensagem padrão.
 *
 * @param {string} template - Template com placeholders.
 * @param {Object} dados - Dados para substituição.
 * @returns {string} Mensagem processada.
 */
export function processarTemplateWhatsApp(template, dados) {
    return template
        .replace(/{{cliente}}/g, dados.clienteNome || '')
        .replace(/{{codigo}}/g, dados.codigo || '')
        .replace(/{{obra}}/g, dados.tituloObra || '')
        .replace(/{{total}}/g, formatarMoeda(dados.valorTotal || 0))
        .replace(/{{empresa}}/g, dados.nomeEmpresa || 'DC Elétrica Residencial');
}

// ============================================================================
// STORAGE HELPERS (ponte para storage.js)
// ============================================================================

/**
 * Salva rascunho completo no LocalStorage.
 * Wrapper para manter compatibilidade.
 */
export async function salvarOrcamentoLocal(orcamento) {
    const { salvarRascunho } = await import('./storage.js');
    return salvarRascunho(orcamento);
}

/**
 * Lista orçamentos do LocalStorage.
 */
export async function listarOrcamentosLocal() {
    const { listarRascunhos } = await import('./storage.js');
    return listarRascunhos();
}

/**
 * Remove orçamento do LocalStorage.
 */
export async function removerOrcamentoLocal(id) {
    const { removerRascunho } = await import('./storage.js');
    return removerRascunho(id);
}