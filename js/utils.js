// Utilitários do DC Gestor: formatação, máscaras, cálculos e Pix EMV/CRC16
export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const apenasDigitos = (s) => String(s ?? '').replace(/\D/g, '');
export const semAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Converte "1.234,56", "12,5" ou "12.5" em número. */
export function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
export const numParaInput = (n) => (parseNum(n) > 0 ? String(parseNum(n)).replace('.', ',') : '');

export const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmt2 = (n) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtQtd = (n) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

// ---------- Datas (sempre no fuso local, sem surpresas de UTC) ----------
const doisDig = (n) => String(n).padStart(2, '0');
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
};
export const fmtData = (iso) => {
  const [a, m, d] = String(iso || hojeISO()).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
export const addDias = (iso, dias) => {
  const [a, m, d] = String(iso || hojeISO()).slice(0, 10).split('-').map(Number);
  const nova = new Date(a, m - 1, d + (parseInt(dias, 10) || 0));
  return `${nova.getFullYear()}-${doisDig(nova.getMonth() + 1)}-${doisDig(nova.getDate())}`;
};

// ---------- Máscaras ----------
export const mascTel = (v) => {
  const d = apenasDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
export const mascDoc = (v) => {
  const d = apenasDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
export const mascCep = (v) => apenasDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
export const MASCARAS = { tel: mascTel, doc: mascDoc, cep: mascCep };

// ---------- Bancos (logos reais em assets/logos-bancos; sigla/cor servem de reserva) ----------
export const PASTA_LOGOS_BANCOS = 'assets/logos-bancos/';
export const LOGO_EMPRESA = 'assets/img/logo.png';
export const LOGO_ZAP = 'assets/img/whatsapp.png';
export const BANCOS = [
  { id: 'nubank', nome: 'Nubank', arquivo: 'nubank.png', cor: '#8A05BE', texto: '#FFFFFF', sigla: 'nu', grad: ['#8A05BE', '#4f0577'] },
  { id: 'itau', nome: 'Itaú', arquivo: 'itau.png', cor: '#EC7000', texto: '#FFFFFF', sigla: 'Itaú', grad: ['#EC7000', '#a84f00'] },
  { id: 'bradesco', nome: 'Bradesco', arquivo: 'bradesco.png', cor: '#CC092F', texto: '#FFFFFF', sigla: 'B', grad: ['#CC092F', '#85061f'] },
  { id: 'bb', nome: 'Banco do Brasil', arquivo: 'banco-do-brasil.png', cor: '#FCFC30', texto: '#0038A8', sigla: 'BB', grad: ['#0A4FD0', '#052a75'] },
  { id: 'caixa', nome: 'Caixa', arquivo: 'caixa.png', cor: '#0070AF', texto: '#FFFFFF', sigla: 'CX', grad: ['#0070AF', '#00456d'] },
  { id: 'santander', nome: 'Santander', arquivo: 'santander.png', cor: '#EC0000', texto: '#FFFFFF', sigla: 'S', grad: ['#EC0000', '#8f0000'] },
  { id: 'inter', nome: 'Inter', arquivo: 'inter.png', cor: '#FF7A00', texto: '#FFFFFF', sigla: 'in', grad: ['#FF7A00', '#b85600'] },
  { id: 'c6', nome: 'C6 Bank', arquivo: 'c6.png', cor: '#242424', texto: '#FFFFFF', sigla: 'C6', grad: ['#3a3a3a', '#0d0d0d'] },
  { id: 'picpay', nome: 'PicPay', arquivo: 'picpay.png', cor: '#21C25E', texto: '#FFFFFF', sigla: 'PP', grad: ['#21C25E', '#12803c'] },
  { id: 'mercadopago', nome: 'Mercado Pago', arquivo: 'mercado-pago.png', cor: '#FFE600', texto: '#2D3277', sigla: 'MP', grad: ['#00A1E4', '#00669f'] },
  { id: 'pagbank', nome: 'PagBank', arquivo: 'pagbank.png', cor: '#41B544', texto: '#FFFFFF', sigla: 'PB', grad: ['#41B544', '#267a29'] },
  { id: 'sicredi', nome: 'Sicredi', arquivo: 'sicredi.png', cor: '#3FA110', texto: '#FFFFFF', sigla: 'Si', grad: ['#3FA110', '#296b0a'] },
  { id: 'sicoob', nome: 'Sicoob', arquivo: 'sicoob.png', cor: '#003641', texto: '#FFFFFF', sigla: 'Sc', grad: ['#00525f', '#001c22'] },
  { id: 'neon', nome: 'Neon', arquivo: 'neon.png', cor: '#00E1FF', texto: '#0F2742', sigla: 'ne', grad: ['#00B8D4', '#00717f'] },
  { id: 'original', nome: 'Banco Original', arquivo: 'original.png', cor: '#00A65A', texto: '#FFFFFF', sigla: 'Or', grad: ['#00A65A', '#006b3a'] },
  { id: 'btg', nome: 'BTG Pactual', arquivo: '', cor: '#001E3C', texto: '#FFFFFF', sigla: 'BTG', grad: ['#0b3a6b', '#000e1c'] },
  { id: 'outro', nome: 'Outro banco', arquivo: '', cor: '#475569', texto: '#FFFFFF', sigla: '🏛', grad: ['#52627a', '#1e293b'] }
];
const FUNDO_ESCURO = new Set(['c6', 'neon', 'original', 'sicredi']);
/** Cor de fundo atrás do logo do banco (logos claros precisam de fundo escuro). */
export const fundoLogo = (id) => (FUNDO_ESCURO.has(id) ? '#111827' : '#ffffff');
export const obterBanco = (id) => BANCOS.find((b) => b.id === id) || BANCOS[BANCOS.length - 1];
export const urlLogoBanco = (id) => {
  const b = obterBanco(id);
  return b.arquivo ? PASTA_LOGOS_BANCOS + encodeURIComponent(b.arquivo) : '';
};

export const TIPOS_CHAVE = [
  { id: 'cpf', nome: 'CPF', rotulo: 'CPF' },
  { id: 'cnpj', nome: 'CNPJ', rotulo: 'CNPJ' },
  { id: 'celular', nome: 'Celular', rotulo: 'Celular' },
  { id: 'email', nome: 'E-mail', rotulo: 'E-mail' },
  { id: 'aleatoria', nome: 'Chave aleatória', rotulo: 'Chave' }
];

// ---------- Pix EMV (BR Code) com CRC16-CCITT ----------
export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Normaliza a chave conforme o tipo (formato exigido no BR Code). */
export function normalizarChavePix(tipo, chave) {
  const bruta = String(chave ?? '').trim();
  if (tipo === 'cpf' || tipo === 'cnpj') return apenasDigitos(bruta);
  if (tipo === 'celular') {
    const d = apenasDigitos(bruta);
    if (bruta.startsWith('+')) return '+' + d;
    return d.startsWith('55') && d.length > 11 ? '+' + d : '+55' + d;
  }
  if (tipo === 'email') return bruta.toLowerCase();
  return bruta;
}

export function montarPayloadPix({ chave, tipo, valor = 0, nome = '', cidade = '', txid = '***' }) {
  const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const chaveFinal = normalizarChavePix(tipo, chave);
  const nomeFinal = semAcentos(nome).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25) || 'NAO INFORMADO';
  const cidadeFinal = semAcentos(cidade).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 15) || 'BRASIL';
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chaveFinal);
  let corpo =
    campo('00', '01') +
    campo('01', '11') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986');
  if (valor > 0) corpo += campo('54', Number(valor).toFixed(2));
  corpo +=
    campo('58', 'BR') +
    campo('59', nomeFinal) +
    campo('60', cidadeFinal) +
    campo('62', campo('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) +
    '6304';
  return corpo + crc16(corpo);
}

/** Texto amigável da chave (ex.: "14 98838-4386") para exibir no PDF. */
export function chaveParaExibir(tipo, chave) {
  const d = apenasDigitos(chave);
  if (tipo === 'celular') return mascTel(d.startsWith('55') && d.length > 11 ? d.slice(2) : d).replace(/^\((\d{2})\)\s/, '$1 ');
  if (tipo === 'cpf' || tipo === 'cnpj') return mascDoc(d);
  return String(chave ?? '');
}

// ---------- Cálculos do orçamento ----------
export const precosDoItem = (item) => (item.lojas || [0, 0, 0]).map(parseNum);

/** Custo unitário: menor preço informado ou o da loja escolhida. */
export function custoUnitario(item) {
  const precos = precosDoItem(item);
  const validos = precos.filter((p) => p > 0);
  if (!validos.length) return 0;
  const escolha = item.escolha;
  if (typeof escolha === 'number' && precos[escolha] > 0) return precos[escolha];
  return Math.min(...validos);
}
export const vendaUnitaria = (item, margem) => round2(custoUnitario(item) * (1 + parseNum(margem) / 100));
export const totalDoItem = (item, margem) => round2(vendaUnitaria(item, margem) * parseNum(item.qtd));

export function calcularTotais(orc) {
  const itens = orc.itens || [];
  const subtotal = round2(itens.reduce((s, i) => s + totalDoItem(i, orc.margem_lucro), 0));
  const custo = round2(itens.reduce((s, i) => s + custoUnitario(i) * parseNum(i.qtd), 0));
  const maoDeObra = round2(parseNum(orc.mao_de_obra));
  const desconto = round2(parseNum(orc.desconto));
  const acrescimo = Array.isArray(orc.acrescimos)
    ? round2(orc.acrescimos.reduce((s, a) => s + parseNum(a && a.valor), 0))
    : round2(parseNum(orc.acrescimo));
  const total = Math.max(0, round2(subtotal + maoDeObra + acrescimo - desconto));

  // Comparativo: total de cada loja, só quando ela tem preço em todos os itens cotados
  const cotados = itens.filter((i) => parseNum(i.qtd) > 0 && precosDoItem(i).some((p) => p > 0));
  const porLoja = Array.from({ length: (orc.lojas_nomes || []).length || 3 }, (_, j) =>
    cotados.length && cotados.every((i) => precosDoItem(i)[j] > 0)
      ? round2(cotados.reduce((s, i) => s + precosDoItem(i)[j] * parseNum(i.qtd), 0))
      : null
  );
  return { subtotal, custo, maoDeObra, desconto, acrescimo, total, lucro: round2(subtotal - custo), porLoja };
}

export const itemVazio = (n = 3) => ({ descricao: '', qtd: 1, lojas: Array(n).fill(0), escolha: 'menor', comprado: false });

export const STATUS = {
  rascunho: { nome: 'Rascunho', cls: 'bg-slate-100 text-slate-600' },
  enviado: { nome: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
  aceito: { nome: 'Aceito', cls: 'bg-green-100 text-green-700' },
  em_andamento: { nome: 'Em andamento', cls: 'bg-amber-100 text-amber-700' },
  pago: { nome: 'Pago', cls: 'bg-emerald-100 text-emerald-700' },
  recusado: { nome: 'Recusado', cls: 'bg-red-100 text-red-700' },
  concluido: { nome: 'Concluído', cls: 'bg-orange-100 text-orange-700' }
};
/** Chave de status válida (orçamentos antigos "aprovado" viram "aceito"). */
export const statusDe = (o) => {
  const k = o && o.status === 'aprovado' ? 'aceito' : o && o.status;
  return STATUS[k] ? k : 'rascunho';
};
export const FORMAS_PGTO = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto'];