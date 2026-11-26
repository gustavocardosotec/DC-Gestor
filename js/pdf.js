// Geração do PDF do orçamento (layout idêntico ao "Orçamento Modelo") e do QR Code Pix
import {
  esc, brl, round2, fmt2, fmtQtd, fmtData, addDias, hojeISO, parseNum, semAcentos,
  calcularTotais, vendaUnitaria, totalDoItem, montarPayloadPix, chaveParaExibir,
  obterBanco, TIPOS_CHAVE, urlLogoBanco, fundoLogo
} from './utils.js';

const LARANJA = '#F26B1D';
const MARINHO = '#0F2742';
const LINHAS_MINIMAS = 18; // o modelo tem 18 linhas de itens

function carregarImagem(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Gera um QR Code (nível H) com um logo no centro. Devolve um data URL PNG.
 * opcoes.logo = caminho da imagem; se ela não carregar, usa a sigla colorida.
 */
export async function gerarQR(texto, opcoes = {}) {
  if (typeof QRCode === 'undefined') throw new Error('Biblioteca de QR Code não carregada.');
  const { logo = '', cor = '#475569', textoCor = '#FFFFFF', sigla = '', fundo = '#FFFFFF' } = opcoes;
  const imagem = await carregarImagem(logo);
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(caixa);
  try {
    new QRCode(caixa, { text: texto, width: 360, height: 360, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    await new Promise((r) => setTimeout(r, 40));
    const origem = caixa.querySelector('canvas');
    const tam = 360;
    const cv = document.createElement('canvas');
    cv.width = cv.height = tam;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tam, tam);
    ctx.drawImage(origem, 0, 0, tam, tam);
    if (imagem || sigla) {
      const moldura = 84, miolo = 72, x = (tam - moldura) / 2, xm = (tam - miolo) / 2;
      const arredondado = (px, py, l, r) => {
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.arcTo(px + l, py, px + l, py + l, r);
        ctx.arcTo(px + l, py + l, px, py + l, r);
        ctx.arcTo(px, py + l, px, py, r);
        ctx.arcTo(px, py, px + l, py, r);
        ctx.closePath();
      };
      ctx.fillStyle = '#fff';
      arredondado(x, x, moldura, 18);
      ctx.fill();
      if (imagem) {
        ctx.save();
        arredondado(xm, xm, miolo, 14);
        ctx.clip();
        ctx.fillStyle = fundo;
        ctx.fillRect(xm, xm, miolo, miolo);
        ctx.drawImage(imagem, xm, xm, miolo, miolo);
        ctx.restore();
      } else {
        ctx.fillStyle = cor;
        arredondado(xm, xm, miolo, 14);
        ctx.fill();
        ctx.fillStyle = textoCor;
        ctx.font = `800 ${sigla.length > 2 ? 24 : 32}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sigla, tam / 2, tam / 2 + 2);
      }
    }
    return cv.toDataURL('image/png');
  } finally {
    caixa.remove();
  }
}

/** QR do Pix com o logo real do banco da conta. */
export function gerarQRPix(payload, idBanco) {
  const b = obterBanco(idBanco);
  return gerarQR(payload, { logo: urlLogoBanco(idBanco), cor: b.cor, textoCor: b.texto, sigla: b.sigla, fundo: fundoLogo(idBanco) });
}

/** Conta Pix do orçamento: a escolhida nele, senão a padrão, senão a primeira cadastrada. */
export function contaPixDoOrcamento(orc, perfil) {
  const lista = perfil.pix_contas || [];
  return lista.find((c) => c.id === orc.pix_id) || lista.find((c) => c.id === perfil.pix_padrao_id) || lista[0] || null;
}

/** Payload Pix (copia e cola). Com valor > 0 sempre gera pela chave; sem valor, prefere o código colado pelo usuário. */
export function payloadPix(conta, valor = 0) {
  if (!conta) return '';
  if (!conta.chave) return conta.copia_cola || '';
  if (!(valor > 0) && conta.copia_cola) return conta.copia_cola;
  return montarPayloadPix({ chave: conta.chave, tipo: conta.tipo, valor, nome: conta.titular, cidade: conta.cidade });
}

// ---------- Layout idêntico ao "Orçamento Modelo" (planilha: caixas pretas finas, rótulos em azul claro) ----------
const AZUL = '#DCE6F1';
const AZUL_ESC = '#8EA9DB';
const BORDA = '1px solid #000';

const cel = (conteudo, o = {}) => {
  const { bg = '', al = 'left', b = false, fs = 11, span = 1, h = 20, it = false } = o;
  return `<td colspan="${span}" style="${bg ? `background:${bg};` : ''}border:${BORDA};padding:0 6px;height:${h}px;text-align:${al};font-size:${fs}px;${b ? 'font-weight:700;' : ''}${it ? 'font-style:italic;' : ''}overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.1;color:#000;">${conteudo}</td>`;
};
const rot = (t, o = {}) => cel(t, { bg: AZUL, b: true, al: 'center', fs: 9.5, ...o });
const val = (t, o = {}) => cel(esc(t) || '&nbsp;', o);
const tabela = (cols, linhas, margem = 8) =>
  `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:${margem}px;"><colgroup>${cols.map((w) => `<col style="width:${w}">`).join('')}</colgroup>${linhas}</table>`;

/** Monta o HTML (estilos inline) do orçamento em A4. */
export function montarHTMLOrcamento(orc, perfil, qrDataUrl, conta) {
  const t = calcularTotais(orc);
  const margem = orc.margem_lucro;
  const emitido = orc.emitido_em || hojeISO();
  const validade = addDias(emitido, orc.validade_dias || 7);

  const linhas = (orc.itens || [])
    .filter((i) => (i.descricao || '').trim() || (parseNum(i.qtd) > 0 && vendaUnitaria(i, margem) > 0))
    .map((i) => ({ desc: i.descricao, qtd: fmtQtd(parseNum(i.qtd)), un: brl(vendaUnitaria(i, margem)), tot: brl(totalDoItem(i, margem)) }));
  if (t.maoDeObra > 0) linhas.push({ desc: 'Mão de obra', qtd: '1', un: brl(t.maoDeObra), tot: brl(t.maoDeObra) });
  const total = Math.max(LINHAS_MINIMAS, linhas.length);

  const valorOuTraco = (v) => (v > 0 ? brl(v) : 'R$ -');
  const rotuloChave = (conta && (TIPOS_CHAVE.find((x) => x.id === conta.tipo) || {}).rotulo) || 'Chave';
  const temPix = !!(conta && qrDataUrl && orc.mostrar_pix !== false);
  const emp = { ...perfil };
  Object.entries(orc.empresa || {}).forEach(([k, v]) => { if (String(v || '').trim()) emp[k] = v; });
  const contato = [emp.cpf_cnpj, emp.telefone, emp.email, emp.endereco].filter(Boolean).map(esc).join('  •  ');

  // Caixa do topo
  const cabecalho = `<div style="border:${BORDA};height:118px;position:relative;text-align:center;">
    ${emp.logo ? `<img src="${emp.logo}" onerror="this.remove()" style="position:absolute;left:14px;top:14px;height:84px;max-width:130px;object-fit:contain;">` : ''}
    <div style="padding-top:22px;font-size:19px;font-weight:700;font-style:italic;">${esc(emp.nome_comercial) || 'Sua empresa'}</div>
    <div style="font-size:9.5px;margin:8px 150px 0;line-height:1.3;">${contato}</div>
  </div>`;

  const info = tabela(['12.4%', '10.3%', '12.6%', '22.7%', '13.8%', '28.2%'],
    `<tr>${rot('Orçamento nº:', { fs: 9 })}${val(orc.numero, { al: 'center' })}${rot('Emitido em:', { fs: 9 })}${val(fmtData(emitido), { al: 'center' })}${rot('Válido até:', { fs: 9 })}${val(fmtData(validade), { al: 'center' })}</tr>`, 8);

  const cliente = tabela(['12%', '26%', '10%', '24%', '10%', '18%'], `
    <tr>${rot('CLIENTE', { span: 6, fs: 11, h: 22 })}</tr>
    <tr>${rot('NOME')}${val(orc.cliente_nome, { span: 5 })}</tr>
    <tr>${rot('TELEFONE')}${val(orc.cliente_telefone)}${rot('E-MAIL')}${val(orc.cliente_email, { span: 3 })}</tr>
    <tr>${rot('CPF/CNPJ')}${val(orc.cliente_documento, { span: 5 })}</tr>
    <tr>${rot('ENDEREÇO')}${val(orc.cliente_endereco, { span: 3 })}${rot('CEP')}${val(orc.cliente_cep)}</tr>
    <tr>${rot('BAIRRO')}${val(orc.cliente_bairro)}${rot('CIDADE')}${val(orc.cliente_cidade)}${rot('ESTADO')}${val(orc.cliente_estado)}</tr>
    ${orc.obra_nome ? `<tr>${rot('OBRA')}${val(orc.obra_nome, { span: 5 })}</tr>` : ''}
    <tr>${rot('TENSÃO')}${val(`${orc.tensao || '127'} V`, { span: 5 })}</tr>`, 10);

  let corpo = '';
  for (let n = 0; n < total; n++) {
    const l = linhas[n];
    corpo += `<tr>${cel(n + 1, { al: 'center', fs: 9 })}${cel(l ? esc(l.desc) : '&nbsp;', { fs: 10.5 })}${cel(l ? l.qtd : '&nbsp;', { al: 'center', fs: 10.5 })}${cel(l ? l.un : '&nbsp;', { al: 'right', fs: 10.5 })}${cel(l ? l.tot : '&nbsp;', { al: 'right', fs: 10.5 })}</tr>`;
  }
  const orcamento = tabela(['6.6%', '54.8%', '11%', '13.8%', '13.8%'], `
    <tr>${rot('ORÇAMENTO', { span: 5, fs: 11, h: 22 })}</tr>
    <tr>${rot('ITEM', { fs: 9 })}${rot('DESCRIÇÃO', { fs: 9 })}${rot('QUANT.', { fs: 9 })}${rot('VALOR', { fs: 9 })}${rot('TOTAL', { fs: 9 })}</tr>
    ${corpo}`, 10);

  const totais = tabela(['19.8%', '30%', '20%', '30.2%'], `
    <tr>${rot('SUBTOTAL', { h: 24 })}${cel(brl(t.subtotal), { al: 'right', h: 24 })}${rot('DESCONTO', { h: 24 })}${cel(valorOuTraco(t.desconto), { al: 'right', h: 24 })}</tr>
    <tr>${rot('ACRÉSCIMO', { h: 24 })}${cel(valorOuTraco(t.acrescimo), { al: 'right', h: 24 })}${cel('TOTAL', { bg: AZUL, b: true, al: 'center', fs: 13, h: 24 })}${cel(brl(t.total), { bg: AZUL_ESC, b: true, al: 'right', fs: 13, h: 24 })}</tr>`, 10);

  const acrLista = (orc.acrescimos || []).filter((a) => parseNum(a.valor) > 0);
  const extras = [
    acrLista.length ? `<b>Acréscimos:</b> ${acrLista.map((a) => `${esc(a.nome || 'Acréscimo')} ${brl(parseNum(a.valor))}`).join('  •  ')}` : '',
    orc.forma_pagamento ? `<b>Forma de pagamento:</b> ${esc(orc.forma_pagamento)}` : ''
  ].filter(Boolean).map((x) => `<div>${x}</div>`).join('');
  const blocoExtras = extras ? `<div style="margin-top:8px;border:${BORDA};padding:5px 8px;font-size:10px;line-height:1.4;">${extras}</div>` : '';

  const observacoes = orc.observacoes
    ? `<div style="margin-top:8px;border:${BORDA};padding:5px 8px;font-size:10px;line-height:1.3;"><b>Observações:</b> ${esc(orc.observacoes)}</div>` : '';

  const pix = temPix ? `
    <div style="page-break-inside:avoid;break-inside:avoid;margin-top:10px;border:${BORDA};padding:9px 12px;display:flex;align-items:center;gap:14px;">
      <img src="${qrDataUrl}" style="width:98px;height:98px;flex:none;">
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:700;">PAGUE COM PIX</div>
        <div style="font-size:12px;font-weight:700;margin-top:6px;">Valor: ${brl(t.total)}</div>
        <div style="font-size:11px;margin-top:3px;">Titular: ${esc(conta.titular)}</div>
        ${conta.mostrar_chave && conta.chave ? `<div style="font-size:11px;margin-top:3px;">${rotuloChave}: ${esc(chaveParaExibir(conta.tipo, conta.chave))}</div>` : ''}
        <div style="font-size:10px;font-style:italic;margin-top:6px;">Escaneie o QR Code com o app do seu banco.</div>
      </div>
    </div>` : '';

  const assinaturas = `<div style="display:flex;justify-content:space-between;margin-top:46px;font-size:10px;text-align:center;">
      <div style="width:44%;border-top:1px solid #000;padding-top:3px;">Profissional</div>
      <div style="width:44%;border-top:1px solid #000;padding-top:3px;">Cliente</div></div>`;

  return `<div style="width:794px;box-sizing:border-box;padding:26px 67px 24px;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;">
    ${cabecalho}${info}${cliente}${orcamento}${totais}${blocoExtras}${observacoes}${pix}${assinaturas}
  </div>`;
}

const nomeArquivo = (orc) =>
  `Orcamento_${orc.numero}_${semAcentos(orc.cliente_nome || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}.pdf`;

async function prepararElemento(orc, perfil) {
  const t = calcularTotais(orc);
  const conta = contaPixDoOrcamento(orc, perfil);
  let qr = '';
  const payload = payloadPix(conta, t.total);
  if (payload && orc.mostrar_pix !== false) {
    try {
      qr = await gerarQRPix(payload, conta.banco);
    } catch (e) {
      console.warn('QR Code não gerado', e);
    }
  }
  const el = document.createElement('div'); // fica fora da tela; o html2pdf clona para renderizar
  el.innerHTML = montarHTMLOrcamento(orc, perfil, qr, conta);
  return el;
}

const opcoes = (orc, nome) => ({
  margin: 0,
  filename: nome || nomeArquivo(orc),
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] }
});

function exigirBiblioteca() {
  if (typeof html2pdf === 'undefined') throw new Error('Biblioteca de PDF não carregada. Conecte-se à internet uma vez para habilitar.');
}

export async function baixarPDF(orc, perfil) {
  exigirBiblioteca();
  const el = await prepararElemento(orc, perfil);
  await html2pdf().set(opcoes(orc)).from(el).save();
}

async function entregarBlob(blob, nome, titulo, texto) {
  const arquivo = new File([blob], nome, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo, text: texto });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true; // a pessoa cancelou
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return false;
}

/** Tenta compartilhar o arquivo (WhatsApp etc.). Devolve true se compartilhou; false se só baixou. */
export async function compartilharPDF(orc, perfil, texto) {
  exigirBiblioteca();
  const el = await prepararElemento(orc, perfil);
  const blob = await html2pdf().set(opcoes(orc)).from(el).outputPdf('blob');
  return entregarBlob(blob, nomeArquivo(orc), `Orçamento nº ${orc.numero}`, texto);
}

// ---------- Nota de serviço (recibo interno, sem validade fiscal) ----------
export function calcularTotaisNota(nota) {
  const itens = (nota.itens || []).map((i) => ({ ...i, total: round2(parseNum(i.qtd) * parseNum(i.valor)) }));
  const subtotal = round2(itens.reduce((s, i) => s + i.total, 0));
  const desconto = round2(parseNum(nota.desconto));
  return { itens, subtotal, desconto, total: Math.max(0, round2(subtotal - desconto)) };
}

const LINHAS_NOTA = 14;
const nomeArquivoNota = (n) =>
  `Nota_${n.numero}_${semAcentos(n.cliente_nome || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}.pdf`;

export function montarHTMLNota(nota, perfil) {
  const t = calcularTotaisNota(nota);
  const emp = { ...perfil };
  Object.entries(nota.empresa || {}).forEach(([k, v]) => { if (String(v || '').trim()) emp[k] = v; });
  const doc = nota.doc_tipo === 'CPF' ? 'CPF' : 'CNPJ';
  const emitido = nota.emitido_em || hojeISO();
  const linhasValidas = t.itens.filter((i) => (i.descricao || '').trim() || i.total > 0);
  const total = Math.max(LINHAS_NOTA, linhasValidas.length);
  let corpo = '';
  for (let n = 0; n < total; n++) {
    const l = linhasValidas[n];
    corpo += `<tr>${cel(n + 1, { al: 'center', fs: 9 })}${cel(l ? fmtQtd(parseNum(l.qtd)) : '&nbsp;', { al: 'center', fs: 10.5 })}${cel(l ? esc(l.descricao) : '&nbsp;', { fs: 10.5 })}${cel(l ? brl(parseNum(l.valor)) : '&nbsp;', { al: 'right', fs: 10.5 })}${cel(l ? brl(l.total) : '&nbsp;', { al: 'right', fs: 10.5 })}</tr>`;
  }
  const contato = [emp.endereco, emp.telefone ? 'Fone: ' + emp.telefone : '', emp.email].filter(Boolean).map(esc).join('<br>');
  const topo = `<div style="display:flex;gap:8px;">
    <div style="flex:1;border:${BORDA};height:112px;position:relative;text-align:center;">
      ${emp.logo ? `<img src="${emp.logo}" onerror="this.remove()" style="position:absolute;left:10px;top:12px;height:80px;max-width:110px;object-fit:contain;">` : ''}
      <div style="padding:14px 8px 0 ${emp.logo ? 130 : 8}px;font-size:17px;font-weight:700;">${esc(emp.nome_comercial) || 'Sua empresa'}</div>
      <div style="padding:6px 8px 0 ${emp.logo ? 130 : 8}px;font-size:9.5px;line-height:1.35;">${contato}</div>
    </div>
    <div style="width:200px;border:${BORDA};text-align:center;padding-top:14px;">
      <div style="font-size:16px;font-weight:700;">NOTA DE SERVIÇO</div>
      <div style="font-size:22px;font-weight:800;margin-top:10px;">Nº ${esc(nota.numero)}</div>
      <div style="font-size:10px;margin-top:8px;">Emitida em ${fmtData(emitido)}</div>
    </div></div>`;
  const docBarra = emp.cpf_cnpj ? `<div style="border:${BORDA};margin-top:8px;padding:3px 8px;font-size:11px;font-weight:700;">${doc}: ${esc(emp.cpf_cnpj)}</div>` : '';
  const cliente = tabela(['14%', '36%', '12%', '16%', '10%', '12%'], `
    <tr>${rot('TOMADOR DO SERVIÇO', { span: 6, fs: 10.5, h: 22 })}</tr>
    <tr>${rot('NOME')}${val(nota.cliente_nome, { span: 5 })}</tr>
    <tr>${rot('ENDEREÇO')}${val(nota.cliente_endereco, { span: 3 })}${rot('BAIRRO')}${val(nota.cliente_bairro)}</tr>
    <tr>${rot('CIDADE')}${val(nota.cliente_cidade)}${rot('ESTADO')}${val(nota.cliente_estado)}${rot('CEP')}${val(nota.cliente_cep)}</tr>
    <tr>${rot('CPF/CNPJ')}${val(nota.cliente_documento, { span: 2 })}${rot('TELEFONE')}${val(nota.cliente_telefone, { span: 2 })}</tr>
    ${nota.obra_nome ? `<tr>${rot('OBRA')}${val(nota.obra_nome, { span: 5 })}</tr>` : ''}`, 8);
  const itens = tabela(['8%', '10%', '52%', '15%', '15%'], `
    <tr>${rot('ITEM', { fs: 9 })}${rot('QUANT.', { fs: 9 })}${rot('DESCRIÇÃO', { fs: 9 })}${rot('PREÇO UNIT.', { fs: 9 })}${rot('PREÇO TOTAL', { fs: 9 })}</tr>${corpo}`, 8);
  const totais = tabela(['30%', '30%', '15%', '25%'], `
    <tr>${rot('SUBTOTAL', { h: 24 })}${cel(brl(t.subtotal), { al: 'right', h: 24 })}${rot('DESCONTO', { h: 24 })}${cel(t.desconto > 0 ? brl(t.desconto) : 'R$ -', { al: 'right', h: 24 })}</tr>
    <tr>${rot('FORMA DE PAGAMENTO', { h: 26 })}${cel(esc(nota.forma_pagamento) || '&nbsp;', { h: 26 })}${cel('TOTAL', { bg: AZUL, b: true, al: 'center', fs: 13, h: 26 })}${cel(brl(t.total), { bg: AZUL_ESC, b: true, al: 'right', fs: 13, h: 26 })}</tr>`, 8);
  const obs = nota.observacoes ? `<div style="margin-top:8px;border:${BORDA};padding:5px 8px;font-size:10px;line-height:1.3;"><b>Observações:</b> ${esc(nota.observacoes)}</div>` : '';
  const recebi = `<div style="margin-top:26px;border:${BORDA};display:flex;font-size:10px;">
      <div style="flex:1;padding:6px 8px;height:62px;">Recebi(emos) de <b>${esc(emp.nome_comercial) || 'Sua empresa'}</b> os serviços descritos nesta nota.<br><br>Data do recebimento: ____/____/______</div>
      <div style="flex:1;padding:6px 8px;border-left:${BORDA};text-align:center;padding-top:36px;">Identificação e assinatura do recebedor</div></div>`;
  const aviso = `<div style="margin-top:8px;text-align:center;font-size:9px;font-style:italic;">Recibo / nota de serviço interna. Sem validade fiscal.</div>`;
  return `<div style="width:794px;box-sizing:border-box;padding:26px 67px 24px;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;">
    ${topo}${docBarra}${cliente}${itens}${totais}${obs}${recebi}${aviso}</div>`;
}

function elementoNota(nota, perfil) {
  const el = document.createElement('div');
  el.innerHTML = montarHTMLNota(nota, perfil);
  return el;
}
export async function baixarNotaPDF(nota, perfil) {
  exigirBiblioteca();
  await html2pdf().set(opcoes(nota, nomeArquivoNota(nota))).from(elementoNota(nota, perfil)).save();
}
export async function compartilharNotaPDF(nota, perfil, texto) {
  exigirBiblioteca();
  const blob = await html2pdf().set(opcoes(nota, nomeArquivoNota(nota))).from(elementoNota(nota, perfil)).outputPdf('blob');
  return entregarBlob(blob, nomeArquivoNota(nota), `Nota de serviço nº ${nota.numero}`, texto);
}
// =============================== PDF complementar da versão 4.0 ===============================
export async function baixarPDFComplemento(orc, perfil) {
  exigirBiblioteca();
  const el = await prepararElemento(orc, perfil);
  const root = el.firstElementChild || el;
  const total = calcularTotais(orc).total;
  const entrada = Math.max(0, Math.min(total, parseNum(orc.entrada)));
  const parcelas = Math.max(1, Math.floor(parseNum(orc.parcelas) || 1));
  const saldo = Math.max(0, round2(total - entrada));
  const valorParcela = parcelas ? round2(saldo / parcelas) : saldo;
  const valorUltimaParcela = parcelas > 1 ? round2(saldo - valorParcela * (parcelas - 1)) : valorParcela;
  const condicoes = '<section style="margin-top:12px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font:12px Arial,Helvetica,sans-serif;page-break-inside:avoid;">' +
    '<b style="font-size:13px;color:' + MARINHO + '">Condições de pagamento</b>' +
    '<div style="margin-top:6px">Entrada: <b>' + brl(entrada) + '</b></div>' +
    '<div>Saldo: <b>' + brl(saldo) + '</b> em <b>' + (parcelas > 1 ? (parcelas - 1) + 'x de ' + brl(valorParcela) + ' e 1x de ' + brl(valorUltimaParcela) : '1x de ' + brl(valorUltimaParcela)) + '</b>.</div>' +
    (orc.forma_pagamento ? '<div>Forma de pagamento: <b>' + esc(orc.forma_pagamento) + '</b></div>' : '') +
    '</section>';
  let assinatura = '';
  if (orc.assinatura_cliente) {
    assinatura = '<section style="margin-top:10px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;page-break-inside:avoid;font:11px Arial,Helvetica,sans-serif;">' +
      '<b style="color:' + MARINHO + '">Aceite do cliente</b><div style="margin-top:4px">Assinante: ' + esc(orc.assinante_nome || 'Cliente') + (orc.assinado_em ? ' • ' + esc(fmtData(orc.assinado_em)) : '') + '</div>' +
      '<img src="' + esc(orc.assinatura_cliente) + '" alt="Assinatura do cliente" style="display:block;max-width:250px;max-height:75px;object-fit:contain;margin-top:4px;border-bottom:1px solid #94a3b8">' +
      '</section>';
  }
  root.insertAdjacentHTML('beforeend', condicoes + assinatura);
  const nome = nomeArquivo(orc).replace(/\.pdf$/i, '_condicoes.pdf');
  await html2pdf().set(opcoes(orc, nome)).from(el).save();
}

export async function baixarReciboPDF(orc, perfil) {
  exigirBiblioteca();
  const empresa = { ...(perfil || {}) };
  Object.entries(orc.empresa || {}).forEach(([k, v]) => { if (String(v || '').trim()) empresa[k] = v; });
  const numero = Number(orc.recibo_numero) || 1;
  const valor = Math.max(0, parseNum(orc.valor_recebido));
  const data = orc.pago_em || hojeISO();
  const descricao = orc.obra_nome || 'serviços descritos no orçamento nº ' + (orc.numero || '—');
  const origem = orc.numero ? 'Orçamento / OS nº ' + orc.numero : 'Serviço contratado';
  const nomeArquivoRecibo = 'Recibo_' + numero + '_' + semAcentos(orc.cliente_nome || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.pdf';
  const html = '<div style="width:794px;box-sizing:border-box;padding:44px 58px;background:#fff;color:#172033;font-family:Arial,Helvetica,sans-serif;">' +
    '<div style="border-bottom:4px solid ' + LARANJA + ';padding-bottom:16px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start">' +
      '<div><div style="font-size:22px;font-weight:800;color:' + MARINHO + '">' + esc(empresa.nome_comercial || 'Prestador de serviços') + '</div>' +
      '<div style="font-size:11px;color:#475569;margin-top:5px">' + esc(empresa.cpf_cnpj || '') + (empresa.telefone ? ' • ' + esc(empresa.telefone) : '') + '</div>' +
      '<div style="font-size:11px;color:#475569">' + esc(empresa.endereco || '') + '</div></div>' +
      '<div style="text-align:right"><div style="font-size:11px;color:#64748b;font-weight:bold">RECIBO Nº</div><div style="font-size:22px;font-weight:800;color:' + LARANJA + '">' + numero + '</div></div></div>' +
    '<div style="text-align:center;margin:26px 0 20px"><div style="font-size:24px;font-weight:800;color:' + MARINHO + '">RECIBO DE PAGAMENTO</div><div style="font-size:12px;color:#64748b;margin-top:5px">Comprovante de quitação do serviço</div></div>' +
    '<div style="border:1px solid #cbd5e1;border-radius:10px;padding:18px;font-size:13px;line-height:1.7">Recebemos de <b>' + esc(orc.cliente_nome || 'Cliente') + '</b> o valor de <b style="font-size:17px;color:' + MARINHO + '">' + brl(valor) + '</b>, referente a <b>' + esc(descricao) + '</b> (' + esc(origem) + ').</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;font-size:12px">' +
      '<div style="border:1px solid #e2e8f0;padding:10px;border-radius:8px"><b>Data do pagamento</b><br>' + esc(fmtData(data)) + '</div>' +
      '<div style="border:1px solid #e2e8f0;padding:10px;border-radius:8px"><b>Forma de recebimento</b><br>' + esc(orc.forma_recebimento || 'Não informada') + '</div>' +
      '<div style="border:1px solid #e2e8f0;padding:10px;border-radius:8px"><b>Cliente</b><br>' + esc(orc.cliente_nome || '') + '</div>' +
      '<div style="border:1px solid #e2e8f0;padding:10px;border-radius:8px"><b>Documento</b><br>' + esc(orc.cliente_documento || '—') + '</div></div>' +
    (orc.assinatura_cliente ? '<div style="margin-top:20px;text-align:center"><img src="' + esc(orc.assinatura_cliente) + '" alt="Assinatura do cliente" style="max-width:220px;max-height:65px;object-fit:contain"><div style="width:260px;border-top:1px solid #94a3b8;margin:2px auto 0;padding-top:5px;font-size:10px">' + esc(orc.assinante_nome || 'Assinatura do cliente') + '</div></div>' : '<div style="margin-top:42px;width:280px;border-top:1px solid #94a3b8;text-align:center;padding-top:6px;margin-left:auto;margin-right:auto;font-size:10px">Assinatura do recebedor</div>') +
    '<div style="margin-top:26px;border-top:1px solid #e2e8f0;padding-top:9px;text-align:center;font-size:9px;color:#64748b">Recibo interno de pagamento. Não substitui documento fiscal.</div></div>';
  const el = document.createElement('div');
  el.innerHTML = html;
  const settings = {...opcoes(orc, nomeArquivoRecibo), margin:0};
  await html2pdf().set(settings).from(el).save();
}

export async function compartilharReciboPDF(orc, perfil, texto) {
  exigirBiblioteca();
  const empresa = { ...(perfil || {}) };
  Object.entries(orc.empresa || {}).forEach(([k, v]) => { if (String(v || '').trim()) empresa[k] = v; });
  const numero = Number(orc.recibo_numero) || 1;
  const valor = Math.max(0, parseNum(orc.valor_recebido));
  const data = orc.pago_em || hojeISO();
  const html = '<div style="width:794px;box-sizing:border-box;padding:44px 58px;background:#fff;color:#172033;font-family:Arial,Helvetica,sans-serif"><h1 style="color:' + MARINHO + '">' + esc(empresa.nome_comercial || 'Prestador de serviços') + '</h1><h2>RECIBO DE PAGAMENTO Nº ' + numero + '</h2><p>Recebemos de <b>' + esc(orc.cliente_nome || 'Cliente') + '</b> o valor de <b>' + brl(valor) + '</b>, referente a ' + esc(orc.obra_nome || 'serviço') + '.</p><p>Data: ' + esc(fmtData(data)) + ' • Forma: ' + esc(orc.forma_recebimento || 'Não informada') + '</p><p style="margin-top:70px;border-top:1px solid #64748b;width:280px;text-align:center;padding-top:6px">' + esc(empresa.nome_comercial || 'Recebedor') + '</p><p style="margin-top:24px;text-align:center;font-size:9px;color:#64748b">Recibo interno de pagamento. Não substitui documento fiscal.</p></div>';
  const el = document.createElement('div'); el.innerHTML = html;
  const nome = 'Recibo_' + numero + '_' + semAcentos(orc.cliente_nome || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.pdf';
  const blob = await html2pdf().set({...opcoes(orc,nome),margin:0}).from(el).outputPdf('blob');
  return entregarBlob(blob,nome,'Recibo de pagamento nº ' + numero,texto || 'Segue o recibo de pagamento.');
}
