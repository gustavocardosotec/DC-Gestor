/**
 * Módulo de Geração de PDF do DC Gestor
 *
 * Gera orçamentos em PDF com fidelidade absoluta ao modelo de referência
 * (Referencias/Orçamento Modelo.pdf). Usa jsPDF via CDN.
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

import { formatarMoeda, formatarData, formatarDataHora, formatarQuantidade, gerarCodigoOrcamento, gerarPayloadPix, getLogoBanco, processarTemplateWhatsApp, gerarLinkWhatsApp, encontrarMelhorCotacao, calcularEconomiaTotal, validarOrcamento } from './utils.js';

// ============================================================================
// CONFIGURAÇÕES DO PDF
// ============================================================================

// Dimensões A4 em mm (jsPDF usa mm por padrão)
const PDF_CONFIG = {
    pageWidth: 210,
    pageHeight: 297,
    margin: 15,
    contentWidth: 180, // 210 - 2*15
    fontFamily: 'helvetica',
    colors: {
        primary: [249, 115, 22],      // Laranja DC #F97316
        dark: [30, 41, 59],           // #1e293b
        gray: [100, 116, 139],        // #64748b
        lightGray: [226, 232, 240],   // #e2e8f0
        white: [255, 255, 255],
        black: [0, 0, 0],
        green: [16, 185, 129],        // #10b981
        blue: [59, 130, 246],         // #3b82f6
    }
};

// ============================================================================
// CARREGAMENTO DO JSPDF VIA CDN
// ============================================================================

let jsPDF = null;
let autoTable = null;

/**
 * Carrega jsPDF e plugin autoTable via CDN dinamicamente.
 * Retorna Promise que resolve quando ambos estiverem disponíveis.
 */
async function carregarJsPDF() {
    if (jsPDF && autoTable) return { jsPDF, autoTable };

    return new Promise((resolve, reject) => {
        // Verifica se já está carregado globalmente
        if (window.jspdf && window.jspdf.jsPDF) {
            jsPDF = window.jspdf.jsPDF;
            autoTable = window.jspdf.autoTable || (window.jspdf.default?.autoTable);
            if (autoTable) {
                resolve({ jsPDF, autoTable });
                return;
            }
        }

        // Carrega jsPDF via CDN
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            jsPDF = window.jspdf.jsPDF;

            // Carrega autoTable plugin
            const scriptTable = document.createElement('script');
            scriptTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.1/jspdf.plugin.autotable.min.js';
            scriptTable.onload = () => {
                autoTable = jsPDF.API.autoTable;
                resolve({ jsPDF, autoTable });
            };
            scriptTable.onerror = () => reject(new Error('Falha ao carregar autoTable'));
            document.head.appendChild(scriptTable);
        };
        script.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
        document.head.appendChild(script);
    });
}

/**
 * Converte imagem para base64 (para logos no PDF).
 *
 * @param {string} url - URL da imagem.
 * @returns {Promise<string>} Base64 da imagem.
 */
async function imagemParaBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('⚠️ Falha ao carregar imagem:', url, err);
        return null;
    }
}

// ============================================================================
// GERAÇÃO DO PDF PRINCIPAL
// ============================================================================

/**
 * Gera o PDF do orçamento com fidelidade ao modelo.
 *
 * @param {Object} orcamento - Dados completos do orçamento.
 * @param {Object} empresa - Dados da empresa (configurações).
 * @returns {Promise<Blob>} Blob do PDF gerado.
 */
export async function gerarOrcamentoPDF(orcamento, empresa) {
    console.log('📄 Gerando PDF do orçamento...', orcamento);

    // Carrega bibliotecas
    await carregarJsPDF();

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const { pageWidth, margin, contentWidth, colors } = PDF_CONFIG;
    let y = margin;

    // --- HEADER: Logo + Dados da Empresa ---
    y = await desenharCabecalho(doc, orcamento, empresa, y);

    // --- DADOS DO CLIENTE E OBRA ---
    y = desenharDadosClienteObra(doc, orcamento, empresa, y);

    // --- TABELA DE ITENS ---
    y = await desenharTabelaItens(doc, orcamento, y);

    // --- TOTAIS ---
    y = desenharTotais(doc, orcamento, y);

    // --- QR CODE PIX + WHATSAPP ---
    y = await desenharPixEWhatsApp(doc, orcamento, empresa, y);

    // --- RODAPÉ ---
    desenharRodape(doc, orcamento, empresa);

    // Retorna blob
    const pdfBlob = doc.output('blob');
    console.log('✅ PDF gerado com sucesso');
    return pdfBlob;
}

/**
 * Desenha cabeçalho com logo da empresa e informações.
 */
async function desenharCabecalho(doc, orcamento, empresa, y) {
    const { pageWidth, margin, contentWidth, colors } = PDF_CONFIG;
    const leftX = margin;
    const rightX = pageWidth - margin;

    // Logo da empresa (se houver)
    let logoBase64 = null;
    if (empresa.logo_url) {
        logoBase64 = await imagemParaBase64(empresa.logo_url);
    }

    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', leftX, y, 30, 30);
        } catch (e) {
            console.warn('Falha ao adicionar logo:', e);
        }
    }

    // Nome da empresa (lado esquerdo, ao lado da logo)
    const empresaX = logoBase64 ? leftX + 35 : leftX;
    doc.setFontSize(18);
    doc.setFont(PDF_CONFIG.fontFamily, 'bold');
    doc.setTextColor(...colors.dark);
    doc.text(empresa.nome_empresa || 'DC Elétrica Residencial', empresaX, y + 8);

    doc.setFontSize(9);
    doc.setFont(PDF_CONFIG.fontFamily, 'normal');
    doc.setTextColor(...colors.gray);

    let lineY = y + 14;
    if (empresa.cpf_cnpj) {
        doc.text(`CNPJ/CPF: ${empresa.cpf_cnpj}`, empresaX, lineY);
        lineY += 5;
    }
    if (empresa.endereco) {
        doc.text(empresa.endereco, empresaX, lineY);
        lineY += 5;
    }
    if (empresa.telefone) {
        doc.text(`Tel: ${empresa.telefone}`, empresaX, lineY);
        lineY += 5;
    }
    if (empresa.email) {
        doc.text(empresa.email, empresaX, lineY);
    }

    // Lado direito: Código do orçamento + Data
    const codigo = orcamento.codigo || gerarCodigoOrcamento();
    const dataEmissao = formatarData(orcamento.createdAt || new Date());

    doc.setFontSize(10);
    doc.setFont(PDF_CONFIG.fontFamily, 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('ORÇAMENTO', rightX, y + 8, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont(PDF_CONFIG.fontFamily, 'normal');
    doc.setTextColor(...colors.dark);
    doc.text(`Código: ${codigo}`, rightX, y + 16, { align: 'right' });
    doc.text(`Data: ${dataEmissao}`, rightX, y + 22, { align: 'right' });
    doc.text(`Status: ${orcamento.status?.toUpperCase() || 'RASCUNHO'}`, rightX, y + 28, { align: 'right' });

    // Linha separadora
    y = Math.max(lineY, y + 35);
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    return y;
}

/**
 * Desenha seção de dados do cliente e obra.
 */
function desenharDadosClienteObra(doc, orcamento, empresa, y) {
    const { margin, contentWidth, colors } = PDF_CONFIG;
    const leftX = margin;
    const colWidth = contentWidth / 2 - 2;

    // Título da seção
    doc.setFontSize(11);
    doc.setFont(PDF_CONFIG.fontFamily, 'bold');
    doc.setTextColor(...colors.dark);
    doc.text('DADOS DO CLIENTE E DA OBRA', leftX, y);
    y += 8;

    // Label/Value helper
    const drawField = (label, value, x, yPos, width) => {
        doc.setFontSize(8);
        doc.setFont(PDF_CONFIG.fontFamily, 'bold');
        doc.setTextColor(...colors.gray);
        doc.text(label.toUpperCase(), x, yPos);
        doc.setFont(PDF_CONFIG.fontFamily, 'normal');
        doc.setTextColor(...colors.dark);
        doc.setFontSize(9);
        // Quebra linha se texto longo
        const lines = doc.splitTextToSize(value || '-', width);
        doc.text(lines, x, yPos + 4);
        return yPos + 4 + (lines.length - 1) * 4;
    };

    // Coluna esquerda: Cliente
    let yLeft = y;
    yLeft = drawField('Cliente', orcamento.cliente_nome, leftX, yLeft, colWidth);
    yLeft = drawField('Telefone', orcamento.cliente_telefone, leftX, yLeft, colWidth);
    yLeft = drawField('Endereço', orcamento.cliente_endereco, leftX, yLeft, colWidth);

    // Coluna direita: Obra
    let yRight = y;
    yRight = drawField('Obra', orcamento.titulo_obra, leftX + colWidth + 4, yRight, colWidth);
    yRight = drawField('Data Prevista', orcamento.data_prevista ? formatarData(orcamento.data_prevista) : '-', leftX + colWidth + 4, yRight, colWidth);

    y = Math.max(yLeft, yRight) + 5;

    // Linha separadora
    doc.setDrawColor(...colors.lightGray);
    doc.line(margin, y, 210 - margin, y);
    y += 5;

    return y;
}

/**
 * Desenha tabela de itens/materiais com cotações.
 */
async function desenharTabelaItens(doc, orcamento, y) {
    const { margin, contentWidth, colors } = PDF_CONFIG;

    if (!orcamento.itens || orcamento.itens.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(...colors.gray);
        doc.text('Nenhum item cadastrado.', margin, y);
        return y + 10;
    }

    // Preparar dados para autoTable
    const head = [['Item', 'Descrição', 'Qtd', 'Und', 'Vl. Unit.', 'Vl. Total', 'Melhor Cotação']];
    const body = [];

    orcamento.itens.forEach((item, index) => {
        const melhor = encontrarMelhorCotacao(item.cotacoes);
        const melhorTexto = melhor ? `${melhor.loja}: ${formatarMoeda(melhor.valorUnitario)}` : '-';

        body.push([
            (index + 1).toString(),
            item.descricao || '-',
            formatarQuantidade(item.quantidade),
            item.unidade || 'un',
            formatarMoeda(item.valorUnitario),
            formatarMoeda(item.valorTotal || (item.quantidade * item.valorUnitario)),
            melhorTexto
        ]);
    });

    // Configuração da tabela
    await doc.autoTable({
        startY: y,
        head: head,
        body: body,
        theme: 'striped',
        headStyles: {
            fillColor: colors.primary,
            textColor: colors.white,
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 8,
            textColor: colors.dark,
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 12, halign: 'center' },      // Item
            1: { cellWidth: 55, halign: 'left' },        // Descrição
            2: { cellWidth: 15, halign: 'center' },      // Qtd
            3: { cellWidth: 15, halign: 'center' },      // Und
            4: { cellWidth: 25, halign: 'right' },       // Vl. Unit.
            5: { cellWidth: 25, halign: 'right' },       // Vl. Total
            6: { cellWidth: 33, halign: 'left', fontSize: 7 } // Melhor Cotação
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        didDrawPage: (data) => {
            // Header personalizado se precisar
        }
    });

    return doc.lastAutoTable.finalY + 5;
}

/**
 * Desenha seção de totais.
 */
function desenharTotais(doc, orcamento, y) {
    const { margin, contentWidth, colors } = PDF_CONFIG;
    const rightX = 210 - margin;

    const valorTotal = orcamento.valor_total || 0;
    const economia = calcularEconomiaTotal(orcamento.itens);

    // Subtotal (mesmo que total se não houver descontos)
    doc.setFontSize(9);
    doc.setFont(PDF_CONFIG.fontFamily, 'normal');
    doc.setTextColor(...colors.gray);
    doc.text('Subtotal:', rightX - 40, y);
    doc.setFont(PDF_CONFIG.fontFamily, 'bold');
    doc.setTextColor(...colors.dark);
    doc.text(formatarMoeda(valorTotal), rightX, y, { align: 'right' });
    y += 6;

    // Desconto (se houver)
    if (orcamento.desconto && orcamento.desconto > 0) {
        doc.setFont(PDF_CONFIG.fontFamily, 'normal');
        doc.setTextColor(...colors.gray);
        doc.text('Desconto:', rightX - 40, y);
        doc.setFont(PDF_CONFIG.fontFamily, 'bold');
        doc.setTextColor(...colors.green);
        doc.text(`-${formatarMoeda(orcamento.desconto)}`, rightX, y, { align: 'right' });
        y += 6;
    }

    // Economia com cotações
    if (economia > 0) {
        doc.setFont(PDF_CONFIG.fontFamily, 'normal');
        doc.setTextColor(...colors.gray);
        doc.text('Economia nas cotações:', rightX - 40, y);
        doc.setFont(PDF_CONFIG.fontFamily, 'bold');
        doc.setTextColor(...colors.green);
        doc.text(`-${formatarMoeda(economia)}`, rightX, y, { align: 'right' });
        y += 6;
    }

    // Linha separadora
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.3);
    doc.line(rightX - 60, y, rightX, y);
    y += 4;

    // TOTAL
    doc.setFontSize(12);
    doc.setFont(PDF_CONFIG.fontFamily, 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('TOTAL:', rightX - 40, y);
    doc.text(formatarMoeda(valorTotal), rightX, y, { align: 'right' });
    y += 10;

    return y;
}

/**
 * Gera o QR Code (PNG em base64) localmente com a biblioteca qrcode-generator.
 *
 * @param {string} texto - Conteúdo do QR Code (payload Pix).
 * @returns {Promise<string>} Data URL PNG.
 */
async function gerarQrBase64(texto) {
    if (!window.qrcode) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Falha ao carregar biblioteca de QR Code'));
            document.head.appendChild(s);
        });
    }
    const qr = window.qrcode(0, 'H'); // correção alta: aguenta o logo no centro
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const cell = 8, borda = 2 * cell, tam = n * cell + borda * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = tam;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tam, tam);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) ctx.fillRect(borda + c * cell, borda + r * cell, cell, cell);
        }
    }
    return canvas.toDataURL('image/png');
}

/**
 * Desenha QR Code Pix + botão WhatsApp.
 */
async function desenharPixEWhatsApp(doc, orcamento, empresa, y) {
    const { margin, pageWidth, contentWidth, colors } = PDF_CONFIG;
    const leftX = margin;
    const rightX = pageWidth - margin;
    const centerX = pageWidth / 2;

    // Verifica se tem configuração Pix
    const temPix = empresa.pix_chave && empresa.pix_recebedor && empresa.pix_cidade;

    if (!temPix) {
        doc.setFontSize(9);
        doc.setTextColor(...colors.gray);
        doc.setFont(PDF_CONFIG.fontFamily, 'italic');
        doc.text('Configurações de Pix não preenchidas nas Configurações da Empresa.', centerX, y, { align: 'center' });
        return y + 10;
    }

    // Gera payload Pix
    const valorTotal = orcamento.valor_total || 0;
    const txid = orcamento.codigo || gerarCodigoOrcamento().replace(/[^A-Za-z0-9]/g, '').substring(0, 25);
    const bancoKey = (empresa.pix_banco || 'nubank').toLowerCase().replace(/\s+/g, '-');

    const payload = gerarPayloadPix({
        tipoChave: empresa.pix_tipo_chave || 'aleatoria',
        chave: empresa.pix_chave,
        recebedor: empresa.pix_recebedor,
        cidade: empresa.pix_cidade,
        valor: valorTotal,
        txid: txid,
        banco: bancoKey
    });

    try {
        // QR Code gerado localmente (a API antiga do Google Charts foi desativada)
        const qrBase64 = await gerarQrBase64(payload);

        // Logo do banco no centro do QR Code
        const logoBancoPath = getLogoBanco(bancoKey);
        const logoBase64 = await imagemParaBase64(logoBancoPath);

        // Desenha QR Code
        const qrSize = 45; // mm
        const qrX = centerX - qrSize / 2;
        doc.addImage(qrBase64, 'PNG', qrX, y, qrSize, qrSize);

        // Overlay logo do banco no centro
        if (logoBase64) {
            const logoSize = 12;
            doc.addImage(logoBase64, 'PNG', centerX - logoSize / 2, y + (qrSize - logoSize) / 2, logoSize, logoSize);
        }

        y += qrSize + 3;

        // Texto "Pix Copia e Cola"
        doc.setFontSize(7);
        doc.setFont(PDF_CONFIG.fontFamily, 'bold');
        doc.setTextColor(...colors.dark);
        doc.text('PIX COPIA E COLA', centerX, y, { align: 'center' });
        y += 4;

        // Payload em texto pequeno (quebrado em linhas)
        doc.setFontSize(6);
        doc.setFont(PDF_CONFIG.fontFamily, 'normal');
        doc.setTextColor(...colors.gray);
        const payloadLines = doc.splitTextToSize(payload, contentWidth - 10);
        // Mostra só as primeiras 3 linhas para não ocupar muito espaço
        payloadLines.slice(0, 3).forEach((line, i) => {
            doc.text(line, centerX, y + i * 3, { align: 'center' });
        });
        y += 12;

        // Link WhatsApp (mostra como texto clicável visual)
        const mensagem = processarTemplateWhatsApp(
            empresa.whatsapp_mensagem_padrao || 'Olá {{cliente}}, segue o orçamento {{codigo}} no valor de {{total}}.',
            {
                clienteNome: orcamento.cliente_nome,
                codigo: orcamento.codigo,
                tituloObra: orcamento.titulo_obra,
                valorTotal: valorTotal,
                nomeEmpresa: empresa.nome_empresa
            }
        );

        const whatsappLink = gerarLinkWhatsApp({
            telefone: orcamento.cliente_telefone,
            mensagem: mensagem
        });

        doc.setFontSize(8);
        doc.setFont(PDF_CONFIG.fontFamily, 'bold');
        doc.setTextColor(...colors.green);
        doc.text('Enviar por WhatsApp →', centerX, y, { align: 'center' });
        y += 5;

        doc.setFontSize(7);
        doc.setFont(PDF_CONFIG.fontFamily, 'normal');
        doc.setTextColor(...colors.gray);
        const linkLines = doc.splitTextToSize(whatsappLink, contentWidth - 10);
        linkLines.slice(0, 2).forEach((line, i) => {
            doc.text(line, centerX, y + i * 3, { align: 'center' });
        });

    } catch (err) {
        console.warn('⚠️ Falha ao gerar QR Code Pix:', err);
        doc.setFontSize(9);
        doc.setTextColor(...colors.gray);
        doc.text('Erro ao gerar QR Code Pix', centerX, y, { align: 'center' });
        y += 10;
    }

    return y;
}

/**
 * Desenha rodapé do PDF.
 */
function desenharRodape(doc, orcamento, empresa) {
    const { margin, pageWidth, pageHeight, colors } = PDF_CONFIG;
    const y = pageHeight - 15;

    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 3, pageWidth - margin, y - 3);

    doc.setFontSize(7);
    doc.setFont(PDF_CONFIG.fontFamily, 'normal');
    doc.setTextColor(...colors.gray);

    // Esquerda: Info da empresa
    doc.text(`${empresa.nome_empresa || 'DC Elétrica Residencial'} - Orçamento gerado em ${formatarDataHora(new Date())}`, margin, y);

    // Direita: Página
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, y, { align: 'right' });
    }
    doc.setPage(1);
}

/**
 * Salva o PDF no dispositivo do usuário.
 *
 * @param {Blob} pdfBlob - Blob do PDF.
 * @param {string} nomeArquivo - Nome do arquivo.
 */
export function salvarPDF(pdfBlob, nomeArquivo = 'orcamento.pdf') {
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Abre o PDF em nova aba para visualização.
 *
 * @param {Blob} pdfBlob - Blob do PDF.
 */
export function visualizarPDF(pdfBlob) {
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    // Não revogar imediatamente para dar tempo de abrir
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================================
// FUNÇÃO PRINCIPAL DE INTEGRAÇÃO (chamada pelo app.js)
// ============================================================================

/**
 * Função principal para gerar e baixar/visualizar o orçamento PDF.
 * Coleta dados do estado atual da aplicação.
 *
 * @param {Object} elements - Elementos DOM cacheados do app.js.
 * @param {Object} estadoApp - Estado atual (itens, cliente, empresa, etc.).
 */
export async function gerarEExportarOrcamento(elements, estadoApp) {
    try {
        // Coleta dados do formulário
        const orcamento = {
            codigo: gerarCodigoOrcamento(),
            cliente_nome: elements.inputClienteNome?.value?.trim() || estadoApp.clienteNome,
            cliente_telefone: elements.inputClienteTelefone?.value?.trim() || estadoApp.clienteTelefone,
            cliente_endereco: elements.inputObraEndereco?.value?.trim() || estadoApp.clienteEndereco,
            titulo_obra: elements.inputTituloObra?.value?.trim() || estadoApp.tituloObra,
            itens: estadoApp.itens || [],
            valor_total: estadoApp.valorTotal || 0,
            status: 'enviado',
            createdAt: new Date().toISOString(),
            data_prevista: estadoApp.dataPrevista
        };

        // Dados da empresa (do LocalStorage/Configurações)
        const { listarPreferencias } = await import('./storage.js');
        const prefs = await listarPreferencias();
        const empresa = {
            nome_empresa: prefs.nomeEmpresa || elements.inputNomeEmpresa?.value || 'DC Elétrica Residencial',
            cpf_cnpj: prefs.cnpj || elements.inputCnpj?.value,
            telefone: prefs.telefoneEmpresa || elements.inputTelefoneEmpresa?.value,
            email: prefs.emailEmpresa || elements.inputEmailEmpresa?.value,
            endereco: prefs.enderecoEmpresa || elements.inputCidadeEmpresa?.value,
            logo_url: prefs.logoUrl,
            pix_tipo_chave: prefs.pixTipoChave || elements.selectPixTipo?.value,
            pix_chave: prefs.pixChave || elements.inputPixChave?.value,
            pix_recebedor: prefs.pixRecebedor || elements.inputPixRecebedor?.value,
            pix_cidade: prefs.pixCidade || elements.inputPixCidade?.value,
            pix_banco: prefs.pixBanco || 'nubank',
            whatsapp_mensagem_padrao: prefs.whatsappMensagem || elements.textareaWhatsappMensagem?.value
        };

        // Validação
        const validacao = validarOrcamento({
            tituloObra: orcamento.titulo_obra,
            clienteNome: orcamento.cliente_nome,
            clienteTelefone: orcamento.cliente_telefone,
            itens: orcamento.itens
        });
        if (!validacao.valido) {
            alert('Erro na validação:\n' + validacao.erros.join('\n'));
            return false;
        }

        // Gera PDF
        const pdfBlob = await gerarOrcamentoPDF(orcamento, empresa);

        // Salva/baixa
        const nomeArquivo = `Orcamento_${orcamento.codigo}_${orcamento.cliente_nome.replace(/\s+/g, '_')}.pdf`;
        salvarPDF(pdfBlob, nomeArquivo);

        // Atualiza status no estado local
        orcamento.status = 'enviado';
        orcamento.updatedAt = new Date().toISOString();

        alert('✅ Orçamento PDF gerado e salvo com sucesso!');
        return true;

    } catch (err) {
        console.error('❌ Erro ao gerar PDF:', err);
        alert('Erro ao gerar PDF: ' + err.message);
        return false;
    }
}