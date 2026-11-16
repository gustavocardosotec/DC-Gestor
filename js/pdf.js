// Geração do PDF do orçamento (layout idêntico ao "Orçamento Modelo") e do QR Code Pix
import {
  esc, brl, fmt2, fmtQtd, fmtData, addDias, hojeISO, parseNum, semAcentos,
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
  const temPix = !!(conta && qrDataUrl);
  const contato = [perfil.cpf_cnpj, perfil.telefone, perfil.email, perfil.endereco].filter(Boolean).map(esc).join('  •  ');

  // Caixa do topo
  const cabecalho = `<div style="border:${BORDA};height:118px;position:relative;text-align:center;">
    ${perfil.logo ? `<img src="${perfil.logo}" onerror="this.remove()" style="position:absolute;left:14px;top:14px;height:84px;max-width:130px;object-fit:contain;">` : ''}
    <div style="padding-top:22px;font-size:19px;font-weight:700;font-style:italic;">${esc(perfil.nome_comercial) || 'Sua empresa'}</div>
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
    ${orc.obra_nome ? `<tr>${rot('OBRA')}${val(orc.obra_nome, { span: 5 })}</tr>` : ''}`, 10);

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
    ${cabecalho}${info}${cliente}${orcamento}${totais}${observacoes}${pix}${assinaturas}
  </div>`;
}

const nomeArquivo = (orc) =>
  `Orcamento_${orc.numero}_${semAcentos(orc.cliente_nome || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}.pdf`;

async function prepararElemento(orc, perfil) {
  const t = calcularTotais(orc);
  const conta = contaPixDoOrcamento(orc, perfil);
  let qr = '';
  const payload = payloadPix(conta, t.total);
  if (payload) {
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

const opcoes = (orc) => ({
  margin: 0,
  filename: nomeArquivo(orc),
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

/** Tenta compartilhar o arquivo (WhatsApp etc.). Devolve true se compartilhou; false se só baixou. */
export async function compartilharPDF(orc, perfil, texto) {
  exigirBiblioteca();
  const el = await prepararElemento(orc, perfil);
  const blob = await html2pdf().set(opcoes(orc)).from(el).outputPdf('blob');
  const arquivo = new File([blob], nomeArquivo(orc), { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: `Orçamento nº ${orc.numero}`, text: texto });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true; // a pessoa cancelou
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return false;
}
