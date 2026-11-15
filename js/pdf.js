// Geração do PDF do orçamento (layout fiel ao "Orçamento Modelo.pdf") e do QR Code Pix
import {
  esc, brl, fmt2, fmtQtd, fmtData, addDias, hojeISO, parseNum, semAcentos,
  calcularTotais, vendaUnitaria, totalDoItem, montarPayloadPix, chaveParaExibir,
  obterBanco, TIPOS_CHAVE, urlLogoBanco, LOGO_EMPRESA
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
  const { logo = '', cor = '#475569', textoCor = '#FFFFFF', sigla = '' } = opcoes;
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
  return gerarQR(payload, { logo: urlLogoBanco(idBanco), cor: b.cor, textoCor: b.texto, sigla: b.sigla });
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

const campo = (rotulo, valor, flex = 1) =>
  `<div style="flex:${flex};min-width:0;">
     <div style="font-size:7.5px;font-weight:700;letter-spacing:.8px;color:#64748b;text-transform:uppercase;">${rotulo}</div>
     <div style="font-size:11px;color:${MARINHO};border-bottom:1px solid #cbd5e1;min-height:17px;padding:1px 0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(valor) || '&nbsp;'}</div>
   </div>`;
const linhaCampos = (...c) => `<div style="display:flex;gap:12px;margin-bottom:7px;">${c.join('')}</div>`;

/** Monta o HTML (estilos inline) do orçamento em A4. */
export function montarHTMLOrcamento(orc, perfil, qrDataUrl, conta) {
  const t = calcularTotais(orc);
  const margem = orc.margem_lucro;
  const emitido = orc.emitido_em || hojeISO();
  const validade = addDias(emitido, orc.validade_dias || 7);

  const linhas = (orc.itens || [])
    .filter((i) => (i.descricao || '').trim() || (parseNum(i.qtd) > 0 && vendaUnitaria(i, margem) > 0))
    .map((i) => ({ desc: i.descricao, qtd: fmtQtd(parseNum(i.qtd)), un: fmt2(vendaUnitaria(i, margem)), tot: fmt2(totalDoItem(i, margem)) }));
  if (t.maoDeObra > 0) linhas.push({ desc: 'Mão de obra', qtd: '1', un: fmt2(t.maoDeObra), tot: fmt2(t.maoDeObra) });
  const total = Math.max(LINHAS_MINIMAS, linhas.length);

  const cel = 'padding:3px 6px;border-bottom:1px solid #e2e8f0;height:15px;';
  let corpo = '';
  for (let n = 0; n < total; n++) {
    const l = linhas[n];
    const fundo = n % 2 ? '#f8fafc' : '#fff';
    corpo += `<tr style="background:${fundo};">
      <td style="${cel}width:34px;text-align:center;color:#64748b;">${n + 1}</td>
      <td style="${cel}text-align:left;">${l ? esc(l.desc) : '&nbsp;'}</td>
      <td style="${cel}width:58px;text-align:center;">${l ? l.qtd : ''}</td>
      <td style="${cel}width:86px;text-align:right;">${l ? l.un : ''}</td>
      <td style="${cel}width:92px;text-align:right;font-weight:600;">${l ? l.tot : ''}</td></tr>`;
  }

  const valorOuTraco = (v) => (v > 0 ? brl(v) : 'R$ -');
  const rotuloChave = (conta && (TIPOS_CHAVE.find((x) => x.id === conta.tipo) || {}).rotulo) || 'Chave';
  const temPix = !!(conta && qrDataUrl);

  const contato = [perfil.cpf_cnpj, perfil.telefone, perfil.email, perfil.endereco].filter(Boolean).map(esc).join('  •  ');
  const logo = `<img src="${perfil.logo || LOGO_EMPRESA}" onerror="this.remove()" style="height:46px;max-width:120px;object-fit:contain;margin-right:12px;">`;

  return `
  <div style="width:794px;box-sizing:border-box;padding:30px 38px 26px;background:#fff;color:${MARINHO};font-family:Inter,Arial,Helvetica,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${LARANJA};padding-bottom:10px;">
      <div style="display:flex;align-items:center;min-width:0;">
        ${logo}
        <div style="min-width:0;">
          <div style="font-size:22px;font-weight:800;line-height:1.1;">${esc(perfil.nome_comercial) || 'Sua empresa'}</div>
          <div style="font-size:8.5px;color:#64748b;margin-top:3px;">${contato}</div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:22px;margin:9px 0 12px;font-size:10.5px;">
      <div><b>Orçamento nº:</b> ${esc(orc.numero)}</div>
      <div><b>Emitido em:</b> ${fmtData(emitido)}</div>
      <div><b>Válido até:</b> ${fmtData(validade)}</div>
    </div>

    <div style="font-size:11px;font-weight:800;color:${LARANJA};letter-spacing:1.2px;margin-bottom:6px;">CLIENTE</div>
    ${linhaCampos(campo('Nome', orc.cliente_nome))}
    ${linhaCampos(campo('Telefone', orc.cliente_telefone, 1), campo('E-mail', orc.cliente_email, 1.4))}
    ${linhaCampos(campo('CPF/CNPJ', orc.cliente_documento))}
    ${linhaCampos(campo('Endereço', orc.cliente_endereco, 2.4), campo('CEP', orc.cliente_cep, 1))}
    ${linhaCampos(campo('Bairro', orc.cliente_bairro, 1.4), campo('Cidade', orc.cliente_cidade, 1.4), campo('Estado', orc.cliente_estado, .6))}
    ${orc.obra_nome ? linhaCampos(campo('Obra', orc.obra_nome)) : ''}

    <div style="font-size:11px;font-weight:800;color:${LARANJA};letter-spacing:1.2px;margin:12px 0 5px;">ORÇAMENTO</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead><tr style="background:${MARINHO};color:#fff;">
        <th style="padding:5px 4px;font-weight:700;">ITEM</th><th style="padding:5px 6px;text-align:left;font-weight:700;">DESCRIÇÃO</th>
        <th style="padding:5px 4px;font-weight:700;">QUANT.</th><th style="padding:5px 6px;text-align:right;font-weight:700;">VALOR</th>
        <th style="padding:5px 6px;text-align:right;font-weight:700;">TOTAL</th></tr></thead>
      <tbody style="line-height:1.15;">${corpo}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-top:8px;">
      <table style="font-size:10.5px;border-collapse:collapse;min-width:300px;">
        <tr><td style="padding:3px 10px;font-weight:700;color:#64748b;">SUBTOTAL</td><td style="padding:3px 10px;text-align:right;">${brl(t.subtotal)}</td>
            <td style="padding:3px 10px;font-weight:700;color:#64748b;">DESCONTO</td><td style="padding:3px 10px;text-align:right;">${valorOuTraco(t.desconto)}</td></tr>
        <tr><td style="padding:3px 10px;font-weight:700;color:#64748b;">ACRÉSCIMO</td><td style="padding:3px 10px;text-align:right;">${valorOuTraco(t.acrescimo)}</td>
            <td style="padding:5px 10px;font-weight:800;background:${LARANJA};color:#fff;">TOTAL</td><td style="padding:5px 10px;text-align:right;font-weight:800;font-size:13px;background:${LARANJA};color:#fff;">${brl(t.total)}</td></tr>
      </table>
    </div>

    ${orc.observacoes ? `<div style="font-size:9.5px;color:#475569;margin-top:8px;"><b>Observações:</b> ${esc(orc.observacoes)}</div>` : ''}

    <div style="page-break-inside:avoid;break-inside:avoid;margin-top:12px;border:1.5px solid ${LARANJA};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:16px;">
      ${temPix ? `<img src="${qrDataUrl}" style="width:112px;height:112px;">` : ''}
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:800;color:${LARANJA};letter-spacing:1px;">PAGUE COM PIX</div>
        ${temPix ? `
        <div style="font-size:12px;margin-top:6px;"><b>Valor:</b> ${brl(t.total)}</div>
        <div style="font-size:11px;margin-top:3px;"><b>Titular:</b> ${esc(conta.titular)}</div>
        ${conta.mostrar_chave && conta.chave ? `<div style="font-size:11px;margin-top:3px;"><b>${rotuloChave}:</b> ${esc(chaveParaExibir(conta.tipo, conta.chave))}</div>` : ''}
        <div style="font-size:9px;color:#64748b;margin-top:6px;">Escaneie o QR Code com o app do seu banco.</div>`
        : `<div style="font-size:10px;color:#64748b;margin-top:6px;">Configure sua chave Pix em Configurações para exibir o QR Code aqui.</div>`}
      </div>
    </div>

    <div style="display:flex;justify-content:space-around;margin-top:26px;font-size:10px;color:#475569;">
      <div style="width:220px;text-align:center;border-top:1px solid #94a3b8;padding-top:4px;">Profissional</div>
      <div style="width:220px;text-align:center;border-top:1px solid #94a3b8;padding-top:4px;">Cliente</div>
    </div>
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
