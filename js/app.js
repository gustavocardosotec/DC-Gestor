/**
 * Aplicação DC Gestor - Ponto de Entrada Principal
 *
 * Módulo responsável por inicializar todos os subsistemas da aplicação,
 * gerenciar o estado global e coordenar a navegação entre as abas/seções.
 *
 * Funcionalidades v1.0 Alfa:
 * - Levantamento de materiais em campo (offline-first)
 * - Cotações comparativas entre lojas
 * - Cálculo automático de subtotais e totais
 * - Geração de PDF fiel ao modelo
 * - QR Code Pix dinâmico com logo do banco
 * - Integração WhatsApp
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

import { supabase } from './supabase.js';
import { initAuthUI, loginWithGoogle, loginWithEmail, logout } from './auth.js';
import { salvarRascunho, listarRascunhos, removerRascunho, limparTodosRascunhos, verificarEstadoOffline, salvarPreferenciasUsuario, listarPreferencias } from './storage.js';
import { formatarMoeda, formatarNumero, formatarQuantidade, parseMoeda, calcularValorTotalItem, calcularValorTotalOrcamento, encontrarMelhorCotacao, calcularEconomiaTotal, validarOrcamento, gerarId, gerarCodigoOrcamento } from './utils.js';
import { gerarEExportarOrcamento } from './pdf.js';

// ============================================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ============================================================================

/**
 * Estado centralizado do orçamento em edição
 * @type {Object}
 */
const estadoOrcamento = {
    // Dados do cliente/obra
    clienteNome: '',
    clienteTelefone: '',
    clienteEndereco: '',
    tituloObra: '',
    dataPrevista: '',

    // Itens do orçamento
    itens: [],

    // Totais calculados
    valorTotal: 0,
    economiaCotacoes: 0,

    // Metadados
    id: null,
    status: 'rascunho',
    createdAt: null,
    updatedAt: null
};

// ============================================================================
// ELEMENTOS DO DOM (cacheados para performance)
// ============================================================================

/**
 * Inicializa a referência aos elementos do DOM usados frequentemente.
 * Deve ser chamado após o DOM estar carregado.
 */
function cachearElementosDOM() {
    // Abas de navegação
    const tabButtons = document.querySelectorAll('[data-tab]');

    // Seções de conteúdo por aba
    const tabSections = {
        orcamentos: document.getElementById('tab-orcamentos'),
        novo: document.getElementById('tab-novo'),
        configs: document.getElementById('tab-configs')
    };

    // Botões de ação principais
    const btnNovoOrcamento = document.getElementById('btn-novo-orcamento');
    const btnAdicionarItem = document.getElementById('btn-adicionar-item');
    const btnGerarPDF = document.getElementById('btn-gerar-pdf');

    // Formulário cliente/obra
    const inputClienteNome = document.getElementById('input-cliente-nome');
    const inputClienteTelefone = document.getElementById('input-cliente-telefone');
    const inputObraEndereco = document.getElementById('input-obra-endereco');
    const inputTituloObra = document.getElementById('input-titulo-obra');
    const inputValorTotal = document.getElementById('input-valor-total');

    // Lista de itens
    const listaItens = document.getElementById('lista-itens');
    const listaVazia = document.getElementById('lista-vazia');
    const contadorItens = document.getElementById('contador-itens');

    // Resumo do orçamento
    const resumoSubtotal = document.getElementById('resumo-subtotal');
    const resumoQtdItens = document.getElementById('resumo-qtd-itens');
    const resumoEconomia = document.getElementById('resumo-economia');
    const resumoTotal = document.getElementById('resumo-total');

    // Configurações de empresa
    const inputNomeEmpresa = document.getElementById('input-nome-empresa');
    const inputCnpj = document.getElementById('input-cnpj');
    const inputTelefoneEmpresa = document.getElementById('input-telefone-empresa');
    const inputEmailEmpresa = document.getElementById('input-email-empresa');
    const inputCidadeEmpresa = document.getElementById('input-cidade-empresa');

    // Configurações Pix
    const selectPixTipo = document.getElementById('select-pix-tipo');
    const inputPixChave = document.getElementById('input-pix-chave');
    const inputPixRecebedor = document.getElementById('input-pix-recebedor');
    const inputPixCidade = document.getElementById('input-pix-cidade');

    // Configurações WhatsApp
    const textareaWhatsappMensagem = document.getElementById('textarea-whatsapp-mensagem');

    // Avatar e nome de usuário
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    // Botão logout
    const btnLogout = document.getElementById('btn-logout');

    // Modal Item
    const modalItem = document.getElementById('modal-item');
    const modalItemTitulo = document.getElementById('modal-item-titulo');
    const modalItemFechar = document.getElementById('modal-item-fechar');
    const formItem = document.getElementById('form-item');
    const itemId = document.getElementById('item-id');
    const itemIndex = document.getElementById('item-index');
    const itemDescricao = document.getElementById('item-descricao');
    const itemQuantidade = document.getElementById('item-quantidade');
    const itemUnidade = document.getElementById('item-unidade');
    const itemValorUnitario = document.getElementById('item-valor-unitario');
    const itemValorTotal = document.getElementById('item-valor-total');
    const cotacoesLista = document.getElementById('cotacoes-lista');
    const btnAddCotacao = document.getElementById('btn-add-cotacao');
    const btnCancelarItem = document.getElementById('btn-cancelar-item');

    // Templates
    const cotacaoTemplate = document.getElementById('cotacao-template');
    const itemListaTemplate = document.getElementById('item-lista-template');

    return {
        // Navegação
        tabButtons,
        tabSections,

        // Ações principais
        btnNovoOrcamento,
        btnAdicionarItem,
        btnGerarPDF,

        // Formulário cliente/obra
        inputClienteNome,
        inputClienteTelefone,
        inputObraEndereco,
        inputTituloObra,
        inputValorTotal,

        // Lista itens
        listaItens,
        listaVazia,
        contadorItens,

        // Resumo
        resumoSubtotal,
        resumoQtdItens,
        resumoEconomia,
        resumoTotal,

        // Configurações empresa
        inputNomeEmpresa,
        inputCnpj,
        inputTelefoneEmpresa,
        inputEmailEmpresa,
        inputCidadeEmpresa,

        // Configurações Pix
        selectPixTipo,
        inputPixChave,
        inputPixRecebedor,
        inputPixCidade,

        // Configurações WhatsApp
        textareaWhatsappMensagem,

        // Auth
        userAvatar,
        userName,
        btnLogout,

        // Modal
        modalItem,
        modalItemTitulo,
        modalItemFechar,
        formItem,
        itemId,
        itemIndex,
        itemDescricao,
        itemQuantidade,
        itemUnidade,
        itemValorUnitario,
        itemValorTotal,
        cotacoesLista,
        btnAddCotacao,
        btnCancelarItem,

        // Templates
        cotacaoTemplate,
        itemListaTemplate
    };
}

// ============================================================================
// GERENCIADOR DE ABAS
// ============================================================================

/**
 * Mostra a aba especificada e oculta as outras.
 *
 * @param {string} tabAtiva - ID da aba a ser exibida ('orcamentos', 'novo', 'configs').
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function mostrarTab(tabAtiva, elements) {
    // Ocultar todas as abas
    Object.values(elements.tabSections).forEach(section => {
        section.classList.add('hidden');
    });

    // Remover classe ativa de todos os botões
    elements.tabButtons.forEach(btn => {
        btn.classList.remove('text-primary', 'border-primary');
        btn.classList.add('text-text-secondary');
        btn.classList.remove('border-b-primary');
        btn.classList.add('border-transparent');
    });

    // Exibir a aba selecionada
    if (elements.tabSections[tabAtiva]) {
        elements.tabSections[tabAtiva].classList.remove('hidden');
    }

    // Encontrar e marcar o botão correspondente como ativo
    const btnAtivo = Array.from(elements.tabButtons).find(
        btn => btn.getAttribute('data-tab') === tabAtiva
    );
    if (btnAtivo) {
        btnAtivo.classList.add('text-primary', 'border-b-primary');
        btnAtivo.classList.remove('text-text-secondary', 'border-transparent');
    }
}

// ============================================================================
// CÁLCULOS E ATUALIZAÇÃO DE UI
// ============================================================================

/**
 * Recalcula todos os totais do orçamento e atualiza a UI do resumo.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function recalcularTotais(elements) {
    const { itens } = estadoOrcamento;

    // Valor total
    estadoOrcamento.valorTotal = calcularValorTotalOrcamento(itens);

    // Economia nas cotações
    estadoOrcamento.economiaCotacoes = calcularEconomiaTotal(itens);

    // Quantidade de itens
    const qtdItens = itens.length;

    // Atualiza contador na lista
    if (elements.contadorItens) {
        elements.contadorItens.textContent = `${qtdItens} item${qtdItens !== 1 ? 's' : ''}`;
    }

    // Mostra/esconde mensagem de lista vazia
    if (elements.listaVazia) {
        elements.listaVazia.classList.toggle('hidden', qtdItens > 0);
    }

    // Atualiza resumo (desktop)
    if (elements.resumoSubtotal) elements.resumoSubtotal.textContent = formatarMoeda(estadoOrcamento.valorTotal);
    if (elements.resumoQtdItens) elements.resumoQtdItens.textContent = qtdItens.toString();
    if (elements.resumoEconomia) elements.resumoEconomia.textContent = formatarMoeda(estadoOrcamento.economiaCotacoes);
    if (elements.resumoTotal) elements.resumoTotal.textContent = formatarMoeda(estadoOrcamento.valorTotal);

    // Habilita/desabilita botão gerar PDF
    if (elements.btnGerarPDF) {
        elements.btnGerarPDF.disabled = qtdItens === 0;
        elements.btnGerarPDF.classList.toggle('opacity-50', qtdItens === 0);
        elements.btnGerarPDF.classList.toggle('cursor-not-allowed', qtdItens === 0);
    }
}

/**
 * Atualiza o valor total do item no modal (quantidade × valor unitário).
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function atualizarValorTotalItemModal(elements) {
    const qtd = parseFloat(elements.itemQuantidade?.value) || 0;
    const vu = parseFloat(elements.itemValorUnitario?.value) || 0;
    const total = calcularValorTotalItem(qtd, vu);
    if (elements.itemValorTotal) {
        elements.itemValorTotal.textContent = formatarMoeda(total);
    }
}

// ============================================================================
// GERENCIAMENTO DE ITENS (CRUD)
// ============================================================================

/**
 * Renderiza a lista completa de itens na UI.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function renderizarListaItens(elements) {
    const { listaItens, itemListaTemplate, listaVazia } = elements;
    const { itens } = estadoOrcamento;

    if (!listaItens || !itemListaTemplate) return;

    // Limpa lista (mantém o template)
    const children = Array.from(listaItens.children).filter(el => el.id !== 'lista-vazia');
    children.forEach(el => el.remove());

    if (itens.length === 0) {
        if (listaVazia) listaVazia.classList.remove('hidden');
        return;
    }

    if (listaVazia) listaVazia.classList.add('hidden');

    // Renderiza cada item
    itens.forEach((item, index) => {
        const clone = itemListaTemplate.content.cloneNode(true);
        const itemEl = clone.querySelector('.item-lista');

        if (!itemEl) return;

        // Preenche dados
        itemEl.querySelector('h4').textContent = item.descricao || '-';

        // Qtd e Und
        const qtdUnd = itemEl.querySelector('.item-qtd-und');
        if (qtdUnd) {
            qtdUnd.textContent = `${formatarQuantidade(item.quantidade)} ${item.unidade || 'un'}`;
        }

        // Vl. Unit.
        const vlUnit = itemEl.querySelector('.item-vl-unit');
        if (vlUnit) {
            vlUnit.textContent = formatarMoeda(item.valorUnitario);
        }

        // Vl. Total
        const vlTotal = itemEl.querySelector('.item-vl-total');
        const totalItem = calcularValorTotalItem(item.quantidade, item.valorUnitario);
        if (vlTotal) {
            vlTotal.textContent = formatarMoeda(totalItem);
        }

        // Melhor cotação
        const melhor = encontrarMelhorCotacao(item.cotacoes);
        const melhorEl = itemEl.querySelector('.item-melhor-cotacao');
        if (melhorEl && melhor) {
            melhorEl.textContent = `Melhor: ${melhor.loja} (${formatarMoeda(melhor.valorUnitario)})`;
            melhorEl.classList.remove('hidden');
        } else if (melhorEl) {
            melhorEl.classList.add('hidden');
        }

        // Cotações (expandíveis)
        const cotacoesContainer = itemEl.querySelector('.item-cotacoes');
        const cotacoesLista = itemEl.querySelector('.item-cotacoes-lista');
        if (cotacoesContainer && cotacoesLista && item.cotacoes && item.cotacoes.length > 0) {
            cotacoesContainer.classList.remove('hidden');
            cotacoesLista.innerHTML = '';
            item.cotacoes.forEach(cot => {
                const div = document.createElement('div');
                div.className = 'flex justify-between text-slate-600';
                div.innerHTML = `<span>${cot.loja || 'Loja'}</span><span class="font-medium">${formatarMoeda(cot.valorUnitario)}/${item.unidade || 'un'}</span>`;
                cotacoesLista.appendChild(div);
            });
        } else if (cotacoesContainer) {
            cotacoesContainer.classList.add('hidden');
        }

        // Eventos dos botões
        const btnEditar = itemEl.querySelector('.btn-editar-item');
        const btnExcluir = itemEl.querySelector('.btn-excluir-item');

        if (btnEditar) {
            btnEditar.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirModalEditarItem(index, elements);
            });
        }

        if (btnExcluir) {
            btnExcluir.addEventListener('click', (e) => {
                e.stopPropagation();
                excluirItem(index, elements);
            });
        }

        // Toggle cotações ao clicar no item
        itemEl.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (cotacoesContainer) {
                const isHidden = cotacoesContainer.classList.toggle('hidden');
                // Opcional: animação suave
            }
        });

        // Insere no final da lista (antes do lista-vazia)
        listaItens.insertBefore(itemEl, listaVazia);
    });

    recalcularTotais(elements);
}

/**
 * Abre o modal para adicionar novo item.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function abrirModalNovoItem(elements) {
    const { modalItem, modalItemTitulo, formItem, itemId, itemIndex,
            itemDescricao, itemQuantidade, itemUnidade, itemValorUnitario,
            cotacoesLista, cotacaoTemplate } = elements;

    // Reset form
    formItem.reset();
    itemId.value = '';
    itemIndex.value = '';
    modalItemTitulo.textContent = 'Adicionar Material';

    // Limpa cotações
    if (cotacoesLista) cotacoesLista.innerHTML = '';

    // Valores padrão
    itemQuantidade.value = '1';
    itemUnidade.value = 'un';
    itemValorUnitario.value = '0';
    atualizarValorTotalItemModal(elements);

    // Foco no primeiro campo
    setTimeout(() => itemDescricao?.focus(), 100);

    // Mostra modal
    modalItem.classList.remove('hidden');
    modalItem.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

/**
 * Abre o modal para editar item existente.
 *
 * @param {number} index - Índice do item no array.
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function abrirModalEditarItem(index, elements) {
    const { modalItem, modalItemTitulo, formItem, itemId, itemIndex,
            itemDescricao, itemQuantidade, itemUnidade, itemValorUnitario,
            cotacoesLista, cotacaoTemplate } = elements;

    const item = estadoOrcamento.itens[index];
    if (!item) return;

    // Preenche form
    itemId.value = item.id || '';
    itemIndex.value = index.toString();
    modalItemTitulo.textContent = 'Editar Material';
    itemDescricao.value = item.descricao || '';
    itemQuantidade.value = item.quantidade || 1;
    itemUnidade.value = item.unidade || 'un';
    itemValorUnitario.value = item.valorUnitario || 0;
    atualizarValorTotalItemModal(elements);

    // Preenche cotações
    if (cotacoesLista) {
        cotacoesLista.innerHTML = '';
        if (item.cotacoes && item.cotacoes.length > 0) {
            item.cotacoes.forEach(cot => {
                const clone = cotacaoTemplate.content.cloneNode(true);
                const cotEl = clone.querySelector('.cotacao-item');
                if (cotEl) {
                    cotEl.querySelector('[name="cotacao-loja"]').value = cot.loja || '';
                    cotEl.querySelector('[name="cotacao-valor"]').value = cot.valorUnitario || '';
                    cotacoesLista.appendChild(cotEl);
                }
            });
        }
    }

    // Foco
    setTimeout(() => itemDescricao?.focus(), 100);

    // Mostra modal
    modalItem.classList.remove('hidden');
    modalItem.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

/**
 * Fecha o modal de item.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function fecharModalItem(elements) {
    const { modalItem } = elements;
    modalItem.classList.add('hidden');
    modalItem.classList.remove('flex');
    document.body.style.overflow = '';
}

/**
 * Salva item (novo ou editado) do modal.
 *
 * @param {Event} e - Evento de submit.
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function salvarItemModal(e, elements) {
    e.preventDefault();

    const { formItem, itemId, itemIndex,
            itemDescricao, itemQuantidade, itemUnidade, itemValorUnitario,
            cotacoesLista } = elements;

    // Validação básica
    if (!itemDescricao.value.trim()) {
        alert('Descrição é obrigatória');
        itemDescricao.focus();
        return;
    }

    const qtd = parseFloat(itemQuantidade.value) || 0;
    const vu = parseFloat(itemValorUnitario.value) || 0;

    if (qtd <= 0) {
        alert('Quantidade deve ser maior que zero');
        itemQuantidade.focus();
        return;
    }

    // Coleta cotações
    const cotacoes = [];
    if (cotacoesLista) {
        const cotacaoEls = cotacoesLista.querySelectorAll('.cotacao-item');
        cotacaoEls.forEach(cotEl => {
            const loja = cotEl.querySelector('[name="cotacao-loja"]').value.trim();
            const valor = parseFloat(cotEl.querySelector('[name="cotacao-valor"]').value) || 0;
            if (loja && valor > 0) {
                cotacoes.push({ loja, valorUnitario: valor });
            }
        });
    }

    const itemData = {
        id: itemId.value || gerarId(),
        descricao: itemDescricao.value.trim(),
        quantidade: qtd,
        unidade: itemUnidade.value,
        valorUnitario: vu,
        cotacoes
    };

    const index = parseInt(itemIndex.value);

    if (isNaN(index)) {
        // Novo item
        estadoOrcamento.itens.push(itemData);
    } else {
        // Edita item existente
        estadoOrcamento.itens[index] = itemData;
    }

    // Atualiza UI
    renderizarListaItens(elements);
    fecharModalItem(elements);

    // Salva rascunho automaticamente
    salvarRascunhoAtual(elements);
}

/**
 * Exclui item da lista.
 *
 * @param {number} index - Índice do item.
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function excluirItem(index, elements) {
    if (confirm('Excluir este material do orçamento?')) {
        estadoOrcamento.itens.splice(index, 1);
        renderizarListaItens(elements);
        salvarRascunhoAtual(elements);
    }
}

/**
 * Adiciona nova linha de cotação no modal.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function adicionarCotacaoModal(elements) {
    const { cotacoesLista, cotacaoTemplate } = elements;
    if (!cotacoesLista || !cotacaoTemplate) return;

    const clone = cotacaoTemplate.content.cloneNode(true);
    const cotEl = clone.querySelector('.cotacao-item');
    if (cotEl) {
        cotacoesLista.appendChild(cotEl);
        // Foco no primeiro input da nova linha
        const inputLoja = cotEl.querySelector('[name="cotacao-loja"]');
        setTimeout(() => inputLoja?.focus(), 50);
    }
}

// ============================================================================
// FORMULÁRIO CLIENTE/OBRA
// ============================================================================

/**
 * Sincroniza campos do formulário cliente/obra com o estado.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function sincronizarFormularioClienteObra(elements) {
    const { inputClienteNome, inputClienteTelefone, inputObraEndereco, inputTituloObra } = elements;

    if (inputClienteNome) {
        inputClienteNome.value = estadoOrcamento.clienteNome;
        inputClienteNome.addEventListener('input', () => {
            estadoOrcamento.clienteNome = inputClienteNome.value.trim();
            salvarRascunhoAtual(elements);
        });
    }

    if (inputClienteTelefone) {
        inputClienteTelefone.value = estadoOrcamento.clienteTelefone;
        inputClienteTelefone.addEventListener('input', () => {
            estadoOrcamento.clienteTelefone = inputClienteTelefone.value.trim();
            salvarRascunhoAtual(elements);
        });
    }

    if (inputObraEndereco) {
        inputObraEndereco.value = estadoOrcamento.clienteEndereco;
        inputObraEndereco.addEventListener('input', () => {
            estadoOrcamento.clienteEndereco = inputObraEndereco.value.trim();
            salvarRascunhoAtual(elements);
        });
    }

    if (inputTituloObra) {
        inputTituloObra.value = estadoOrcamento.tituloObra;
        inputTituloObra.addEventListener('input', () => {
            estadoOrcamento.tituloObra = inputTituloObra.value.trim();
            salvarRascunhoAtual(elements);
        });
    }
}

/**
 * Limpa formulário cliente/obra para novo orçamento.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function limparFormularioClienteObra(elements) {
    const { inputClienteNome, inputClienteTelefone, inputObraEndereco, inputTituloObra, inputValorTotal } = elements;

    estadoOrcamento.clienteNome = '';
    estadoOrcamento.clienteTelefone = '';
    estadoOrcamento.clienteEndereco = '';
    estadoOrcamento.tituloObra = '';
    estadoOrcamento.dataPrevista = '';

    if (inputClienteNome) inputClienteNome.value = '';
    if (inputClienteTelefone) inputClienteTelefone.value = '';
    if (inputObraEndereco) inputObraEndereco.value = '';
    if (inputTituloObra) inputTituloObra.value = '';
    if (inputValorTotal) inputValorTotal.value = '0,00';
}

// ============================================================================
// PERSISTÊNCIA (RASCUNHOS)
// ============================================================================

/**
 * Monta objeto completo do orçamento atual para salvamento.
 *
 * @returns {Object} Objeto do orçamento.
 */
function montarOrcamentoParaSalvar() {
    return {
        id: estadoOrcamento.id || gerarId(),
        cliente_nome: estadoOrcamento.clienteNome,
        cliente_telefone: estadoOrcamento.clienteTelefone,
        cliente_endereco: estadoOrcamento.clienteEndereco,
        titulo_obra: estadoOrcamento.tituloObra,
        data_prevista: estadoOrcamento.dataPrevista,
        itens: estadoOrcamento.itens.map(item => ({
            ...item,
            valorTotal: calcularValorTotalItem(item.quantidade, item.valorUnitario)
        })),
        valor_total: estadoOrcamento.valorTotal,
        status: estadoOrcamento.status,
        createdAt: estadoOrcamento.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

/**
 * Salva o orçamento atual como rascunho no LocalStorage.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function salvarRascunhoAtual(elements) {
    const orcamento = montarOrcamentoParaSalvar();
    estadoOrcamento.id = orcamento.id;
    estadoOrcamento.updatedAt = orcamento.updatedAt;
    salvarRascunho(orcamento);
    console.log('💾 Rascunho salvo automaticamente:', orcamento.id);
}

/**
 * Carrega um rascunho do LocalStorage para o estado da aplicação.
 *
 * @param {Object} rascunho - Objeto do rascunho.
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function carregarRascunho(rascunho, elements) {
    estadoOrcamento.id = rascunho.id;
    estadoOrcamento.clienteNome = rascunho.cliente_nome || '';
    estadoOrcamento.clienteTelefone = rascunho.cliente_telefone || '';
    estadoOrcamento.clienteEndereco = rascunho.cliente_endereco || '';
    estadoOrcamento.tituloObra = rascunho.titulo_obra || '';
    estadoOrcamento.dataPrevista = rascunho.data_prevista || '';
    estadoOrcamento.itens = rascunho.itens || [];
    estadoOrcamento.valorTotal = rascunho.valor_total || 0;
    estadoOrcamento.status = rascunho.status || 'rascunho';
    estadoOrcamento.createdAt = rascunho.createdAt;
    estadoOrcamento.updatedAt = rascunho.updatedAt;

    // Atualiza UI
    sincronizarFormularioClienteObra(elements);
    renderizarListaItens(elements);

    console.log('📂 Rascunho carregado:', rascunho.id);
}

/**
 * Inicia um novo orçamento (limpa estado).
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function novoOrcamento(elements) {
    // Confirma se tem dados não salvos
    if (estadoOrcamento.itens.length > 0 || estadoOrcamento.clienteNome) {
        if (!confirm('Iniciar novo orçamento? Os dados atuais serão salvos como rascunho automaticamente.')) {
            return;
        }
        salvarRascunhoAtual(elements);
    }

    // Reset estado
    estadoOrcamento.id = null;
    estadoOrcamento.clienteNome = '';
    estadoOrcamento.clienteTelefone = '';
    estadoOrcamento.clienteEndereco = '';
    estadoOrcamento.tituloObra = '';
    estadoOrcamento.dataPrevista = '';
    estadoOrcamento.itens = [];
    estadoOrcamento.valorTotal = 0;
    estadoOrcamento.economiaCotacoes = 0;
    estadoOrcamento.status = 'rascunho';
    estadoOrcamento.createdAt = null;
    estadoOrcamento.updatedAt = null;

    // Limpa UI
    limparFormularioClienteObra(elements);
    renderizarListaItens(elements);

    // Vai para aba novo
    mostrarTab('novo', { tabButtons: elements.tabButtons, tabSections: elements.tabSections });
    elements.inputTituloObra?.focus();
}

// ============================================================================
// ABA ORÇAMENTOS (LISTA DE RASICUNHOS)
// ============================================================================

/**
 * Renderiza a lista de orçamentos/rascunhos salvos na aba "Orçamentos".
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
async function renderizarListaOrcamentos(elements) {
    const { tabSections } = elements;
    const listaContainer = tabSections?.orcamentos?.querySelector('#list-orcamentos');
    const template = tabSections?.orcamentos?.querySelector('#orcamento-item-template');

    if (!listaContainer || !template) return;

    const rascunhos = listarRascunhos();

    // Limpa lista
    listaContainer.innerHTML = '';

    if (rascunhos.length === 0) {
        listaContainer.innerHTML = `
            <div class="text-center py-12 text-text-secondary">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto mb-2 opacity-50">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <p class="text-sm">Nenhum orçamento salvo</p>
                <p class="text-xs mt-1">Clique em "Novo Orçamento" para começar</p>
            </div>
        `;
        return;
    }

    // Renderiza cada rascunho
    rascunhos.forEach(rascunho => {
        const clone = template.content.cloneNode(true);
        const itemEl = clone.querySelector('.border.rounded-lg.p-4');

        if (!itemEl) return;

        // Título da obra
        const tituloEl = itemEl.querySelector('h3');
        if (tituloEl) {
            tituloEl.textContent = rascunho.titulo_obra || 'Obra sem título';
        }

        // Cliente
        const clienteEl = itemEl.querySelector('p');
        if (clienteEl) {
            clienteEl.textContent = `${rascunho.cliente_nome || 'Cliente não informado'} • ${formatarMoeda(rascunho.valor_total || 0)}`;
        }

        // Status
        const statusEl = itemEl.querySelector('span');
        if (statusEl) {
            statusEl.textContent = rascunho.status || 'rascunho';
            const statusColors = {
                'rascunho': 'text-yellow-600',
                'enviado': 'text-blue-600',
                'aprovado': 'text-green-600',
                'recusado': 'text-red-600',
                'cancelado': 'text-slate-500'
            };
            statusEl.className = `text-xs font-medium capitalize ${statusColors[rascunho.status] || 'text-green-600'}`;
        }

        // Descrição adicional (data)
        const descEl = itemEl.querySelector('p:last-of-type');
        if (descEl && rascunho.updatedAt) {
            descEl.textContent = `Atualizado em ${formatarDataHora(rascunho.updatedAt)}`;
        }

        // Clique no item para carregar
        itemEl.style.cursor = 'pointer';
        itemEl.addEventListener('click', () => {
            carregarRascunho(rascunho, elements);
            mostrarTab('novo', { tabButtons: elements.tabButtons, tabSections: elements.tabSections });
        });

        listaContainer.appendChild(itemEl);
    });
}

// ============================================================================
// GERAR PDF
// ============================================================================

/**
 * Handler para gerar PDF do orçamento atual.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
async function handleGerarPDF(elements) {
    if (estadoOrcamento.itens.length === 0) {
        alert('Adicione pelo menos um material antes de gerar o PDF.');
        return;
    }

    if (!estadoOrcamento.clienteNome || !estadoOrcamento.tituloObra) {
        alert('Preencha o nome do cliente e o título da obra.');
        elements.inputClienteNome?.focus();
        return;
    }

    // Salva rascunho antes de gerar
    salvarRascunhoAtual(elements);

    // Chama geração de PDF
    const sucesso = await gerarEExportarOrcamento(elements, estadoOrcamento);

    if (sucesso) {
        // Atualiza status para "enviado"
        estadoOrcamento.status = 'enviado';
        salvarRascunhoAtual(elements);
        renderizarListaOrcamentos(elements);
    }
}

// ============================================================================
// CONFIGURAÇÕES (EMPRESA, PIX, WHATSAPP)
// ============================================================================

/**
 * Carrega preferências salvas para os campos de configuração.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function carregarPreferenciasConfig(elements) {
    const prefs = listarPreferencias();

    // Empresa
    if (elements.inputNomeEmpresa) elements.inputNomeEmpresa.value = prefs.nomeEmpresa || '';
    if (elements.inputCnpj) elements.inputCnpj.value = prefs.cnpj || '';
    if (elements.inputTelefoneEmpresa) elements.inputTelefoneEmpresa.value = prefs.telefoneEmpresa || '';
    if (elements.inputEmailEmpresa) elements.inputEmailEmpresa.value = prefs.emailEmpresa || '';
    if (elements.inputCidadeEmpresa) elements.inputCidadeEmpresa.value = prefs.cidadeEmpresa || '';

    // Pix
    if (elements.selectPixTipo) elements.selectPixTipo.value = prefs.pixTipoChave || 'aleatoria';
    if (elements.inputPixChave) elements.inputPixChave.value = prefs.pixChave || '';
    if (elements.inputPixRecebedor) elements.inputPixRecebedor.value = prefs.pixRecebedor || '';
    if (elements.inputPixCidade) elements.inputPixCidade.value = prefs.pixCidade || '';

    // WhatsApp
    if (elements.textareaWhatsappMensagem) {
        elements.textareaWhatsappMensagem.value = prefs.whatsappMensagem || 'Olá {{cliente}}, segue o orçamento de código {{codigo}} referente à obra {{obra}} no valor total de R$ {{total}}.';
    }

    // Event listeners para salvar automaticamente
    const camposEmpresa = [
        { el: elements.inputNomeEmpresa, key: 'nomeEmpresa' },
        { el: elements.inputCnpj, key: 'cnpj' },
        { el: elements.inputTelefoneEmpresa, key: 'telefoneEmpresa' },
        { el: elements.inputEmailEmpresa, key: 'emailEmpresa' },
        { el: elements.inputCidadeEmpresa, key: 'cidadeEmpresa' }
    ];

    camposEmpresa.forEach(({ el, key }) => {
        if (el) {
            el.addEventListener('change', () => {
                salvarPreferenciasUsuario({ [key]: el.value });
            });
        }
    });

    if (elements.selectPixTipo) {
        elements.selectPixTipo.addEventListener('change', () => {
            salvarPreferenciasUsuario({ pixTipoChave: elements.selectPixTipo.value });
        });
    }
    if (elements.inputPixChave) {
        elements.inputPixChave.addEventListener('change', () => {
            salvarPreferenciasUsuario({ pixChave: elements.inputPixChave.value });
        });
    }
    if (elements.inputPixRecebedor) {
        elements.inputPixRecebedor.addEventListener('change', () => {
            salvarPreferenciasUsuario({ pixRecebedor: elements.inputPixRecebedor.value });
        });
    }
    if (elements.inputPixCidade) {
        elements.inputPixCidade.addEventListener('change', () => {
            salvarPreferenciasUsuario({ pixCidade: elements.inputPixCidade.value });
        });
    }
    if (elements.textareaWhatsappMensagem) {
        elements.textareaWhatsappMensagem.addEventListener('change', () => {
            salvarPreferenciasUsuario({ whatsappMensagem: elements.textareaWhatsappMensagem.value });
        });
    }
}

// ============================================================================
// GERENCIADOR DE EVENTOS PRINCIPAL
// ============================================================================

/**
 * Configura todos os listeners de evento da aplicação.
 *
 * @param {Object} elements - Elementos do DOM cacheados.
 */
function configurarEventos(elements) {
    const {
        tabButtons, tabSections,
        btnNovoOrcamento, btnAdicionarItem, btnGerarPDF,
        inputClienteNome, inputClienteTelefone, inputObraEndereco,
        inputTituloObra, inputValorTotal,
        listaItens, listaVazia, contadorItens,
        modalItem, modalItemFechar, formItem, btnCancelarItem,
        itemQuantidade, itemValorUnitario,
        cotacoesLista, btnAddCotacao,
        userAvatar, userName, btnLogout
    } = elements;

    // ======================
    // Navegação por abas
    // ======================
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            mostrarTab(tabId, { tabButtons, tabSections });
        });
    });

    // ======================
    // Autenticação (gerenciada pelo auth.js via eventos customizados)
    // ======================
    // Escuta eventos de login/logout do auth.js
    window.addEventListener('auth:login', (e) => {
        const { user } = e.detail;
        console.log('🔐 App: Login detectado', user?.email);
        // App já está visível via auth.js, apenas garante estado
        tabButtons.forEach(btn => btn.classList.remove('hidden'));
        if (elements.btnGerarPDF) elements.btnGerarPDF.disabled = false;
    });

    window.addEventListener('auth:logout', () => {
        console.log('🔓 App: Logout detectado');
        // Limpa estado do orçamento atual
        novoOrcamento(elements);
    });

    // Logout button (header) - delega para auth.js
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }

    // ======================
    // Ações principais
    // ======================
    if (btnNovoOrcamento) {
        btnNovoOrcamento.addEventListener('click', () => novoOrcamento(elements));
    }

    if (btnAdicionarItem) {
        btnAdicionarItem.addEventListener('click', () => abrirModalNovoItem(elements));
    }

    if (btnGerarPDF) {
        btnGerarPDF.addEventListener('click', () => handleGerarPDF(elements));
    }

    // ======================
    // Modal Item
    // ======================
    if (modalItemFechar) {
        modalItemFechar.addEventListener('click', () => fecharModalItem(elements));
    }

    if (btnCancelarItem) {
        btnCancelarItem.addEventListener('click', () => fecharModalItem(elements));
    }

    // Fechar modal clicando no backdrop
    if (modalItem) {
        modalItem.addEventListener('click', (e) => {
            if (e.target === modalItem) fecharModalItem(elements);
        });
    }

    // Fechar modal com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalItem && !modalItem.classList.contains('hidden')) {
            fecharModalItem(elements);
        }
    });

    // Formulário do item
    if (formItem) {
        formItem.addEventListener('submit', (e) => salvarItemModal(e, elements));
    }

    // Atualiza valor total em tempo real
    if (itemQuantidade) {
        itemQuantidade.addEventListener('input', () => atualizarValorTotalItemModal(elements));
    }
    if (itemValorUnitario) {
        itemValorUnitario.addEventListener('input', () => atualizarValorTotalItemModal(elements));
    }

    // Adicionar cotação
    if (btnAddCotacao) {
        btnAddCotacao.addEventListener('click', () => adicionarCotacaoModal(elements));
    }

    // Delegação para remover cotação (botão X dentro da lista)
    if (cotacoesLista) {
        cotacoesLista.addEventListener('click', (e) => {
            const btnRemover = e.target.closest('button[aria-label="Remover cotação"]');
            if (btnRemover) {
                btnRemover.closest('.cotacao-item')?.remove();
            }
        });
    }

    // ======================
    // Formulário Cliente/Obra (sync automático)
    // ======================
    sincronizarFormularioClienteObra(elements);

    // ======================
    // Carregar preferências de configuração
    // ======================
    carregarPreferenciasConfig(elements);
}

// ============================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ============================================================================

/**
 * Inicializa a aplicação DC Gestor.
 * 1. Cacheia elementos DOM
 * 2. Configura eventos
 * 3. Inicializa auth UI
 * 4. Define estado inicial da navegação
 * 5. Renderiza lista de orçamentos salvos
 */
export function inicializarAplicacao() {
    console.log('🚀 DC Gestor: Inicializando aplicação v1.0 Alfa...');

    // 1. Cachear elementos do DOM
    const elements = cachearElementosDOM();

    // 2. Configurar eventos
    configurarEventos(elements);

    // 3. Inicializar autenticação (auth.js gerencia overlay de login)
    initAuthUI();

    // 4. Definir estado inicial da navegação (ocultar todas as abas)
    Object.values(elements.tabSections).forEach(section => {
        section.classList.add('hidden');
    });

    // 5. Avatar escondido inicialmente (auth.js mostra quando logado)
    if (elements.userAvatar) elements.userAvatar.classList.add('hidden');

    // 6. Renderiza lista de orçamentos salvos na aba "Orçamentos"
    renderizarListaOrcamentos(elements);

    // 7. Renderiza lista de itens (vazia inicialmente)
    renderizarListaItens(elements);

    console.log('✅ DC Gestor: Aplicação inicializada com sucesso');
    console.log('📦 Estado offline:', verificarEstadoOffline());
}

// Executar inicialização quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAplicacao);
} else {
    inicializarAplicacao();
}

// Helper para formatar data/hora (exportado para uso no pdf.js)
function formatarDataHora(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR');
}

// Disponibiliza globalmente para o pdf.js (import dinâmico)
window.formatarDataHora = formatarDataHora;