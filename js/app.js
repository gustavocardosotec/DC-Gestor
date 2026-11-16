// DC Gestor 2.0 - interface e eventos
import {
  $, $$, esc, uuid, brl, fmtData, fmtQtd, hojeISO, addDias, parseNum, numParaInput, apenasDigitos, semAcentos,
  MASCARAS, BANCOS, TIPOS_CHAVE, STATUS, itemVazio, calcularTotais, custoUnitario, vendaUnitaria, totalDoItem,
  precosDoItem, obterBanco, urlLogoBanco, fundoLogo, LOGO_EMPRESA, LOGO_ZAP, mascTel, mascDoc, normalizarChavePix
} from './utils.js';
import * as Auth from './auth.js';
import * as Store from './storage.js';
import * as PDF from './pdf.js';
import { obterSupabase } from './supabase.js';

const CHAVE_RASCUNHO = 'dcg:rascunho';
const CHAVE_ULTIMO_USUARIO = 'dcg:ultimoUsuario';
const CHAVE_ONB_PULADO = 'dcg:onbPulado';
const NUMERICOS_ORC = new Set(['margem_lucro', 'mao_de_obra', 'desconto', 'acrescimo', 'validade_dias']);
const NUMERICOS_PERFIL = new Set(['margem_padrao', 'mao_de_obra_padrao', 'validade_dias']);
const TITULOS = { obras: 'Obras & Orçamentos', levantamento: 'Novo Levantamento / Cotação', config: 'Configurações' };

const estado = { aba: 'obras', sub: null, formPix: null, formZap: null, apres: null, user: null, busca: '', filtro: 'todos', rascunho: null, novo: true, onb: null, timerAuto: null, timerSync: null, perfil: null, sincronizando: false, ultimoPayload: '' };
const conteudo = $('#conteudo');

// =============================== Avisos e modal ===============================
function aviso(mensagem, erro = false, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast' + (erro ? ' erro' : '');
  el.textContent = mensagem;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function abrirModal(html) {
  const m = $('#modal');
  m.className = 'fundo-modal';
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
}
function fecharModal() {
  const m = $('#modal');
  m.className = 'hidden';
  m.innerHTML = '';
}
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const t = document.createElement('textarea');
    t.value = texto;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

// =============================== Sessão e sincronização ===============================
function atualizarStatus() {
  const pend = Store.contarPendentes();
  let texto;
  if (estado.sincronizando) texto = '🔄 Sincronizando…';
  else if (!estado.user) texto = '📱 Só neste aparelho';
  else if (!navigator.onLine) texto = `📴 Offline${pend ? ` • ${pend} pendente(s)` : ''}`;
  else if (pend) texto = `⏳ ${pend} a sincronizar`;
  else texto = '☁️ Sincronizado';
  $('#chip-status').textContent = texto;
}

async function sincronizarAgora(manual = false) {
  if (estado.sincronizando) return;
  if (!estado.user) {
    if (manual) aviso('Entre com uma conta para sincronizar.', true);
    return;
  }
  if (!navigator.onLine || !obterSupabase()) {
    if (manual) aviso('Sem internet. Seus dados estão salvos no aparelho.', true);
    return;
  }
  estado.sincronizando = true;
  atualizarStatus();
  const r = await Store.sincronizar(obterSupabase(), estado.user);
  estado.sincronizando = false;
  atualizarStatus();
  if (r.ok) {
    if (manual) aviso('Tudo sincronizado ✔');
    if (estado.aba === 'obras') { desenharLista(); desenharAtalhos(); }
  } else if (manual) {
    aviso('Não foi possível sincronizar agora. Tente de novo.', true);
  }
}

function mostrarLogin() {
  estado.user = null;
  Store.definirUsuario(null);
  $('#app').classList.add('hidden');
  $('#tela-login').classList.remove('hidden');
  $('#login-msg').textContent = '';
}

function entrarNoApp(user) {
  if (user && estado.user && estado.user.id === user.id && !$('#app').classList.contains('hidden')) return;
  estado.user = user;
  Store.definirUsuario(user);
  if (user) {
    Auth.definirModoLocal(false);
    localStorage.setItem(CHAVE_ULTIMO_USUARIO, JSON.stringify({ id: user.id, email: user.email }));
  } else {
    Auth.definirModoLocal(true);
  }
  $('#tela-login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  estado.aba = 'obras';
  render();
  if (user) sincronizarAgora().then(verificarOnboarding);
  else verificarOnboarding();
}

async function sair() {
  if (!estado.user) {
    Auth.definirModoLocal(false);
    mostrarLogin(); // os dados locais continuam no aparelho e sobem quando você entrar numa conta
    return;
  }
  if (Store.contarPendentes() > 0) {
    await sincronizarAgora();
    if (Store.contarPendentes() > 0 && !confirm('Há dados que ainda não foram sincronizados e serão perdidos ao sair. Sair mesmo assim?')) return;
  }
  await Auth.sair();
  Store.limparTudo();
  localStorage.removeItem(CHAVE_ULTIMO_USUARIO);
  localStorage.removeItem(CHAVE_RASCUNHO);
  estado.rascunho = null;
  mostrarLogin();
}

// =============================== Login ===============================
function msgLogin(texto, ok = false) {
  const el = $('#login-msg');
  el.textContent = texto;
  el.className = 'text-sm min-h-[20px] ' + (ok ? 'text-green-700' : 'text-red-600');
}
const dadosLogin = () => ({ email: $('#login-email').value.trim(), senha: $('#login-senha').value });
function ocupado(ativo) {
  ['btn-entrar', 'btn-google', 'btn-criar', 'btn-local'].forEach((id) => { $('#' + id).disabled = ativo; });
}

function ligarLogin() {
  $('#form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { email, senha } = dadosLogin();
    if (!email || !senha) return msgLogin('Digite seu e-mail e sua senha.');
    ocupado(true);
    msgLogin('Entrando…', true);
    const r = await Auth.entrar(email, senha);
    ocupado(false);
    if (!r.ok) return msgLogin(r.erro);
    msgLogin('');
    entrarNoApp(r.usuario);
  });
  $('#btn-criar').addEventListener('click', async () => {
    const { email, senha } = dadosLogin();
    if (!email || !senha) return msgLogin('Digite um e-mail e uma senha para criar sua conta.');
    ocupado(true);
    msgLogin('Criando conta…', true);
    const r = await Auth.cadastrar(email, senha);
    ocupado(false);
    if (!r.ok) return msgLogin(r.erro);
    if (r.precisaConfirmar) return msgLogin('Conta criada! Confirme pelo link enviado ao seu e-mail e depois toque em Entrar.', true);
    entrarNoApp(r.usuario);
  });
  $('#btn-google').addEventListener('click', async () => {
    msgLogin('Abrindo o Google…', true);
    const r = await Auth.entrarComGoogle();
    if (!r.ok) msgLogin(r.erro);
  });
  $('#btn-local').addEventListener('click', () => entrarNoApp(null));
  $('#link-esqueci').addEventListener('click', async () => {
    const { email } = dadosLogin();
    if (!email) return msgLogin('Digite seu e-mail acima para receber o link de redefinição.');
    const r = await Auth.recuperarSenha(email);
    msgLogin(r.ok ? 'Enviamos um link para redefinir sua senha. Confira seu e-mail.' : r.erro, r.ok);
  });
}

// =============================== Navegação ===============================
function irPara(aba) {
  if (aba !== 'levantamento') salvarSeTemConteudo();
  estado.aba = aba;
  estado.sub = null;
  render();
  window.scrollTo(0, 0);
}
function render() {
  $('#titulo-tela').textContent = estado.aba === 'config' && estado.sub ? SUBTITULOS[estado.sub] : TITULOS[estado.aba];
  $$('.nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === estado.aba));
  if (estado.aba === 'obras') renderObras();
  else if (estado.aba === 'levantamento') renderLevantamento();
  else renderConfig();
  atualizarStatus();
}

// =============================== Aba 1: Obras & Orçamentos ===============================
function renderObras() {
  const chips = [['todos', 'Todos'], ...Object.entries(STATUS).map(([k, v]) => [k, v.nome])]
    .map(([k, nome]) => `<button class="chip ${estado.filtro === k ? 'ativo' : ''}" data-acao="filtro" data-filtro="${k}">${nome}</button>`)
    .join('');
  conteudo.innerHTML = `
 <div id="atalhos"></div>
    <div class="flex gap-2 mb-3">
      <input id="busca" class="campo" type="search" placeholder="🔍 Buscar cliente, obra ou nº" value="${esc(estado.busca)}" autocomplete="off">
      <button class="btn btn-prim shrink-0" data-acao="novo">＋ Novo</button>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-2 mb-2">${chips}</div>
    <div id="lista-obras" class="space-y-3"></div>`;
  desenharLista();
  desenharAtalhos();
}

function desenharLista() {
  const alvo = $('#lista-obras');
  if (!alvo) return;
  const termo = semAcentos(estado.busca).toLowerCase().trim();
  const lista = Store.listarOrcamentos().filter((o) => {
    if (estado.filtro !== 'todos' && o.status !== estado.filtro) return false;
    if (!termo) return true;
    return semAcentos(`${o.cliente_nome} ${o.obra_nome} ${o.numero}`).toLowerCase().includes(termo);
  });
  if (!lista.length) {
    const vazio = Store.listarOrcamentos().length === 0;
    alvo.innerHTML = `<div class="cartao text-center py-10">
      <div class="text-4xl mb-2">🏗️</div>
      <p class="font-bold">${vazio ? 'Nenhum orçamento ainda' : 'Nada encontrado'}</p>
      <p class="text-sm text-slate-500 mt-1 mb-4">${vazio ? 'Toque em Novo para fazer seu primeiro levantamento na obra.' : 'Mude a busca ou o filtro de status.'}</p>
      ${vazio ? '<button class="btn btn-prim" data-acao="novo">＋ Novo levantamento</button>' : ''}</div>`;
    return;
  }
  alvo.innerHTML = lista.map((o) => {
    const st = STATUS[o.status] || STATUS.rascunho;
    return `<article class="cartao">
      <div class="flex justify-between gap-3">
        <div class="min-w-0">
          <div class="font-extrabold truncate">${esc(o.obra_nome || o.cliente_nome || 'Sem nome')}</div>
          <div class="text-sm text-slate-500 truncate">${esc(o.cliente_nome)}</div>
          <div class="text-xs text-slate-400 mt-1">Nº ${esc(o.numero)} • ${fmtData(o.emitido_em)}${o._sync === 'pendente' ? ' • ⏳ não sincronizado' : ''}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-extrabold text-brand">${brl(o.valor_total)}</div>
          <span class="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full mt-1 ${st.cls}">${st.nome}</span>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-2 mt-3">
        <button class="btn btn-ghost px-1 text-[13px]" data-acao="editar" data-id="${o.id}">✏️ Editar</button>
        <button class="btn btn-ghost px-1 text-[13px]" data-acao="pdf" data-id="${o.id}">📄 PDF</button>
        <button class="btn btn-ghost px-1 text-[13px]" data-acao="enviar" data-id="${o.id}">💬 Enviar</button>
        <button class="btn btn-perigo px-1" data-acao="excluir" data-id="${o.id}" aria-label="Excluir orçamento">🗑️</button>
      </div></article>`;
  }).join('');
}

function mensagemWhats(o, perfil) {
  const t = calcularTotais(o);
  const emitido = o.emitido_em || hojeISO();
  const modelo = perfil.whatsapp_mensagem || Store.PERFIL_PADRAO.whatsapp_mensagem;
  return modelo
    .replace(/\{cliente\}/g, o.cliente_nome || 'cliente')
    .replace(/\{obra\}/g, o.obra_nome || 'sua obra')
    .replace(/\{numero\}/g, o.numero)
    .replace(/\{total\}/g, brl(t.total))
    .replace(/\{validade\}/g, fmtData(addDias(emitido, o.validade_dias || 7)));
}

async function baixarDaLista(id) {
  const o = Store.obterOrcamento(id);
  if (!o) return;
  aviso('Gerando PDF…');
  try {
    await PDF.baixarPDF(o, Store.obterPerfil());
  } catch (e) {
    aviso(e.message || 'Não foi possível gerar o PDF.', true);
  }
}

async function enviarOrcamento(id) {
  const o = Store.obterOrcamento(id);
  if (!o) return;
  const perfil = Store.obterPerfil();
  const texto = mensagemWhats(o, perfil);
  aviso('Preparando o PDF…');
  try {
    const compartilhou = await PDF.compartilharPDF(o, perfil, texto);
    if (!compartilhou) {
      const tel = apenasDigitos(o.cliente_telefone);
      const numero = tel ? (tel.startsWith('55') && tel.length > 11 ? tel : '55' + tel) : '';
      abrirModal(`
        <h2 class="titulo-sec">💬 PDF baixado</h2>
        <p class="text-sm text-slate-600 mb-4">O PDF foi salvo no aparelho. Abra a conversa no WhatsApp e anexe o arquivo.</p>
        <a class="btn btn-prim w-full mb-2" target="_blank" rel="noopener" href="https://wa.me/${numero}?text=${encodeURIComponent(texto)}">Abrir WhatsApp</a>
        <button class="btn btn-sec w-full" data-acao="fechar-modal">Fechar</button>`);
    }
    if (o.status === 'rascunho') {
      Store.salvarOrcamento({ ...o, status: 'enviado' });
      desenharLista();
      atualizarStatus();
      sincronizarAgora();
    }
  } catch (e) {
    aviso(e.message || 'Não foi possível preparar o PDF.', true);
  }
}

// =============================== Aba 2: Levantamento / Cotação ===============================
const entrada = (atributo, campo, rotulo, valor, o = {}) => `
  <label class="block ${o.cls || ''}"><span class="rot">${rotulo}</span>
    <input class="campo" data-${atributo}="${campo}" ${o.mask ? `data-mask="${o.mask}"` : ''} type="${o.tipo || 'text'}"
      ${o.modo ? `inputmode="${o.modo}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} value="${esc(valor)}" autocomplete="${o.auto || 'off'}"></label>`;

function normalizarOrcamento(o) {
  const n = { ...o };
  const nomes = Array.isArray(n.lojas_nomes) && n.lojas_nomes.length ? n.lojas_nomes : ['Loja 1', 'Loja 2', 'Loja 3'];
  n.lojas_nomes = nomes.map((x, k) => x || `Loja ${k + 1}`);
  const q = n.lojas_nomes.length;
  n.itens = (n.itens || []).map((i) => ({ ...itemVazio(q), ...i, lojas: Array.from({ length: q }, (_, k) => parseNum((i.lojas || [])[k])) }));
  if (!n.itens.length) n.itens = [itemVazio(q)];
  return n;
}

function novoOrcamento() {
  const p = Store.obterPerfil();
  return normalizarOrcamento({
    id: uuid(), numero: Store.proximoNumero(), status: 'rascunho',
    cliente_nome: '', cliente_telefone: '', cliente_email: '', cliente_documento: '', cliente_endereco: '',
    cliente_cep: '', cliente_bairro: '', cliente_cidade: '', cliente_estado: '', obra_nome: '', observacoes: '',
    itens: [itemVazio()], lojas_nomes: ['Loja 1', 'Loja 2', 'Loja 3'],
    pix_id: p.pix_padrao_id || '', margem_lucro: parseNum(p.margem_padrao), mao_de_obra: parseNum(p.mao_de_obra_padrao), desconto: 0, acrescimo: 0,
    valor_total: 0, validade_dias: parseNum(p.validade_dias) || 7, emitido_em: hojeISO()
  });
}

let temporizadorRascunho = null;
function guardarRascunhoTemp() {
  clearTimeout(temporizadorRascunho);
  temporizadorRascunho = setTimeout(() => {
    if (!estado.rascunho) return;
    try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ orc: estado.rascunho, novo: estado.novo })); } catch { /* sem espaço */ }
  }, 400);
}
function restaurarRascunhoTemp() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO));
    if (salvo && salvo.orc) {
      estado.rascunho = normalizarOrcamento(salvo.orc);
      estado.novo = !!salvo.novo;
      return true;
    }
  } catch { /* ignora */ }
  return false;
}
function limparRascunhoTemp() {
  clearTimeout(temporizadorRascunho);
  localStorage.removeItem(CHAVE_RASCUNHO);
}

function abrirParaEditar(id) {
  const o = Store.obterOrcamento(id);
  if (!o) return;
  estado.rascunho = normalizarOrcamento(Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(o))).filter(([k]) => !k.startsWith('_'))));
  estado.novo = false;
  guardarRascunhoTemp();
  irPara('levantamento');
}

function renderLevantamento() {
  if (!estado.rascunho && !restaurarRascunhoTemp()) {
    estado.rascunho = novoOrcamento();
    estado.novo = true;
  }
  const o = estado.rascunho;
  const perfilAtual = Store.obterPerfil();
  const pixSelecionado = o.pix_id || perfilAtual.pix_padrao_id;
  const pixOpcoes = perfilAtual.pix_contas.length
    ? perfilAtual.pix_contas.map((c) => `<option value="${c.id}" ${pixSelecionado === c.id ? 'selected' : ''}>${esc(c.apelido)} • ${esc(obterBanco(c.banco).nome)}</option>`).join('')
    : '<option value="">Nenhum Pix cadastrado</option>';
  const num = (campo, rotulo) => entrada('campo', campo, rotulo, numParaInput(o[campo]), { modo: 'decimal', ph: '0' });
  const statusOpcoes = Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v.nome}</option>`).join('');

  conteudo.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div><div class="text-xs font-semibold text-slate-500">Orçamento nº ${esc(o.numero)}</div>
        <div id="sub-edicao" class="text-sm font-bold">${estado.novo ? 'Novo levantamento' : 'Editando orçamento'}</div></div>
      <button class="btn btn-sec" data-acao="descartar">✕ Fechar</button>
    </div>
    <div class="space-y-4">
      <section class="cartao">
        <h2 class="titulo-sec">👤 Cliente</h2>
        <div class="grid grid-cols-2 gap-3">
          ${entrada('campo', 'cliente_nome', 'Nome', o.cliente_nome, { cls: 'col-span-2', auto: 'name' })}
          ${entrada('campo', 'cliente_telefone', 'Telefone / WhatsApp', o.cliente_telefone, { mask: 'tel', tipo: 'tel', modo: 'tel', ph: '(14) 99999-9999' })}
          ${entrada('campo', 'cliente_email', 'E-mail', o.cliente_email, { tipo: 'email', modo: 'email' })}
          ${entrada('campo', 'cliente_documento', 'CPF / CNPJ', o.cliente_documento, { mask: 'doc', modo: 'numeric' })}
          ${entrada('campo', 'cliente_cep', 'CEP', o.cliente_cep, { mask: 'cep', modo: 'numeric', ph: '00000-000' })}
          ${entrada('campo', 'cliente_endereco', 'Endereço', o.cliente_endereco, { cls: 'col-span-2' })}
          ${entrada('campo', 'cliente_bairro', 'Bairro', o.cliente_bairro, { cls: 'col-span-2' })}
          ${entrada('campo', 'cliente_cidade', 'Cidade', o.cliente_cidade)}
          ${entrada('campo', 'cliente_estado', 'Estado (UF)', o.cliente_estado, { ph: 'SP' })}
        </div>
      </section>

      <section class="cartao">
        <h2 class="titulo-sec">🏠 Obra</h2>
        <div class="space-y-3">
          ${entrada('campo', 'obra_nome', 'Nome da obra', o.obra_nome, { ph: 'Ex.: Reforma elétrica da sala' })}
          <label class="block"><span class="rot">Observações (aparecem no PDF)</span>
            <textarea class="campo" data-campo="observacoes" placeholder="Prazo, condições, materiais não inclusos…">${esc(o.observacoes)}</textarea></label>
        </div>
      </section>

      <section class="cartao">
        <h2 class="titulo-sec">🏪 Lojas da cotação</h2>
        <div class="space-y-2">
          ${o.lojas_nomes.map((nome, j) => `<div class="flex gap-2 items-end">${entrada('loja', j, `Loja ${j + 1}`, nome, { cls: 'flex-1' })}${o.lojas_nomes.length > 1 ? `<button class="btn btn-perigo" data-acao="rem-loja" data-j="${j}" aria-label="Remover loja ${j + 1}">🗑️</button>` : ''}</div>`).join('')}
        </div>
        <button class="btn btn-sec w-full mt-3" data-acao="add-loja">＋ Adicionar loja</button>
      </section>

      <section class="cartao">
        <h2 class="titulo-sec">🧰 Materiais</h2>
        <div id="lista-itens" class="space-y-3"></div>
        <button class="btn btn-sec w-full mt-3" data-acao="add-item">＋ Adicionar item</button>
        <div id="comparativo" class="mt-3"></div>
      </section>

      <section class="cartao">
        <h2 class="titulo-sec">💰 Valores</h2>
        <div class="grid grid-cols-2 gap-3">
          ${num('margem_lucro', 'Margem de lucro (%)')}
          ${num('mao_de_obra', 'Mão de obra (R$)')}
          ${num('desconto', 'Desconto (R$)')}
          ${num('acrescimo', 'Acréscimo (R$)')}
          ${num('validade_dias', 'Validade (dias)')}
          <label class="block"><span class="rot">Status</span><select class="campo" data-campo="status">${statusOpcoes}</select></label>
          <label class="block col-span-2"><span class="rot">Pix do orçamento (QR Code do PDF)</span><select class="campo" data-campo="pix_id">${pixOpcoes}</select></label>
        </div>
      </section>

      <div class="barra-total">
        <div class="flex justify-between items-end mb-2">
          <div><div class="text-xs text-slate-300">Total do orçamento</div><div id="bt-total" class="text-2xl font-extrabold">R$ 0,00</div></div>
          <div class="text-right text-xs text-slate-300">Lucro estimado<br><b id="bt-lucro" class="text-sm text-white">R$ 0,00</b></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-prim" data-acao="salvar">💾 Salvar</button>
          <button class="btn btn-sec" data-acao="gerar-pdf">📄 Gerar PDF</button>
        </div>
      </div>
    </div>`;
  desenharItens();
  atualizarCalculos(false);
}

function desenharItens() {
  const o = estado.rascunho;
  const alvo = $('#lista-itens');
  if (!alvo) return;
  alvo.innerHTML = o.itens.map((it, i) => {
    const preco = (j) => `<label class="block"><span class="rot lbl-loja" data-j="${j}">${esc(o.lojas_nomes[j])}</span>
      <input class="campo" data-item="${i}" data-k="loja${j}" type="text" inputmode="decimal" placeholder="R$ 0,00" value="${numParaInput(it.lojas[j])}"></label>`;
    const escolhas = `<option value="menor" ${it.escolha === 'menor' ? 'selected' : ''}>Menor preço (automático)</option>` +
      o.lojas_nomes.map((_, j) => `<option value="${j}" data-opt="${j}" ${it.escolha === j ? 'selected' : ''}>${esc(o.lojas_nomes[j])}</option>`).join('');
    return `<div class="rounded-xl border border-slate-200 p-3 bg-slate-50/60">
      <div class="flex items-center justify-between mb-2">
        <b class="text-sm">Item ${i + 1}</b>
        <button class="btn btn-perigo" data-acao="rem-item" data-i="${i}" aria-label="Remover item ${i + 1}">🗑️</button>
      </div>
      <label class="block"><span class="rot">Material</span>
        <input class="campo" data-item="${i}" data-k="descricao" type="text" placeholder="Ex.: Cabo flexível 2,5 mm² azul" value="${esc(it.descricao)}" autocomplete="off"></label>
      <div class="grid grid-cols-2 gap-3 mt-2">
        <label class="block"><span class="rot">Quantidade</span>
          <input class="campo" data-item="${i}" data-k="qtd" type="text" inputmode="decimal" value="${numParaInput(it.qtd)}"></label>
        <label class="block"><span class="rot">Usar preço de</span>
          <select class="campo" data-item="${i}" data-k="escolha">${escolhas}</select></label>
      </div>
      <div class="grid ${o.lojas_nomes.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-2">${o.lojas_nomes.map((_, j) => preco(j)).join('')}</div>
      <p id="res-${i}" class="text-sm mt-2 text-slate-600"></p></div>`;
  }).join('');
}

function atualizarCalculos(auto = true) {
  const o = estado.rascunho;
  if (!o || estado.aba !== 'levantamento') return;
  const t = calcularTotais(o);
  o.valor_total = t.total;

  o.itens.forEach((it, i) => {
    const res = $(`#res-${i}`);
    if (res) {
      const custo = custoUnitario(it);
      res.innerHTML = custo > 0
        ? `Custo <b>${brl(custo)}</b> → venda <b>${brl(vendaUnitaria(it, o.margem_lucro))}</b> × ${fmtQtd(parseNum(it.qtd))} = <b class="text-brand">${brl(totalDoItem(it, o.margem_lucro))}</b>`
        : 'Informe o preço em pelo menos uma loja.';
    }
    const precos = precosDoItem(it);
    const validos = precos.filter((p) => p > 0);
    const menor = validos.length > 1 ? Math.min(...validos) : null;
    precos.forEach((p, j) => {
      const campo = $(`[data-item="${i}"][data-k="loja${j}"]`);
      if (campo) campo.classList.toggle('melhor', menor !== null && p === menor);
    });
  });

  const completas = t.porLoja.filter((v) => v != null);
  const economia = completas.length ? Math.max(...completas) - t.custo : 0;
  $('#comparativo').innerHTML = `
    <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-sm">
      <div class="text-xs font-bold text-slate-500">Comparativo de custo dos materiais</div>
      ${t.porLoja.map((v, j) => `<div class="flex justify-between"><span>${esc(o.lojas_nomes[j])}</span><b>${v == null ? '—' : brl(v)}</b></div>`).join('')}
      <div class="flex justify-between border-t border-slate-200 pt-1 mt-1 text-green-700"><span>Melhor combinação (menor por item)</span><b>${brl(t.custo)}</b></div>
      ${economia > 0.005 ? `<div class="text-xs text-green-700">Você economiza ${brl(economia)} frente à loja mais cara.</div>` : ''}
      <div class="text-[11px] text-slate-400">— = a loja não tem preço em algum item.</div>
    </div>`;
  $('#bt-total').textContent = brl(t.total);
  $('#bt-lucro').textContent = brl(t.lucro + t.maoDeObra);
  guardarRascunhoTemp();
  if (auto) agendarAutoSalvar();
}

function aoEditarCampo(el) {
  const o = estado.rascunho;
  const campo = el.dataset.campo;
  if (campo === 'cliente_estado') el.value = el.value.toUpperCase().slice(0, 2);
  o[campo] = NUMERICOS_ORC.has(campo) ? parseNum(el.value) : el.value;
  atualizarCalculos();
}

function aoEditarItem(el) {
  const o = estado.rascunho;
  const it = o.itens[Number(el.dataset.item)];
  const k = el.dataset.k;
  if (!it) return;
  if (k === 'descricao') it.descricao = el.value;
  else if (k === 'qtd') it.qtd = parseNum(el.value);
  else if (k === 'escolha') it.escolha = el.value === 'menor' ? 'menor' : Number(el.value);
  else if (k.startsWith('loja')) it.lojas[Number(k.slice(4))] = parseNum(el.value);
  atualizarCalculos();
}

function aoEditarLoja(el) {
  const j = Number(el.dataset.loja);
  const nome = el.value.trim() || `Loja ${j + 1}`;
  estado.rascunho.lojas_nomes[j] = nome;
  $$(`.lbl-loja[data-j="${j}"]`).forEach((s) => { s.textContent = nome; });
  $$(`option[data-opt="${j}"]`).forEach((s) => { s.textContent = nome; });
  atualizarCalculos();
}

function itemEstaVazio(it) {
  return !(it.descricao || '').trim() && !precosDoItem(it).some((p) => p > 0);
}

function salvarRascunho() {
  const o = estado.rascunho;
  if (!(o.cliente_nome || '').trim() && !(o.obra_nome || '').trim()) {
    aviso('Informe o nome do cliente ou da obra para salvar.', true);
    const campo = $('[data-campo="cliente_nome"]');
    if (campo) campo.focus();
    return false;
  }
  const preenchidos = o.itens.filter((it) => !itemEstaVazio(it));
  if (preenchidos.length !== o.itens.length) {
    o.itens = preenchidos.length ? preenchidos : [itemVazio(o.lojas_nomes.length)];
    desenharItens();
  }
  atualizarCalculos();
  Store.salvarOrcamento(o);
  estado.novo = false;
  const sub = $('#sub-edicao');
  if (sub) sub.textContent = 'Editando orçamento';
  guardarRascunhoTemp();
  atualizarStatus();
  sincronizarAgora();
  return true;
}

// ---------- Salvamento automático ----------
const temConteudo = (o) => !!((o.cliente_nome || '').trim() || (o.obra_nome || '').trim() || o.itens.some((i) => !itemEstaVazio(i)));
function marcarSalvo() {
  const sub = $('#sub-edicao');
  if (sub) sub.innerHTML = '<span class="text-green-700">✔ Salvo automaticamente</span>';
}
function agendarSync() {
  clearTimeout(estado.timerSync);
  estado.timerSync = setTimeout(() => sincronizarAgora(), 4000);
}
function agendarAutoSalvar() {
  clearTimeout(estado.timerAuto);
  estado.timerAuto = setTimeout(() => {
    const o = estado.rascunho;
    if (!o || !temConteudo(o)) return;
    Store.salvarOrcamento(o);
    estado.novo = false;
    marcarSalvo();
    atualizarStatus();
    agendarSync();
  }, 700);
}
function salvarSeTemConteudo() {
  clearTimeout(estado.timerAuto);
  const o = estado.rascunho;
  if (!o || !temConteudo(o)) return;
  Store.salvarOrcamento(o);
  estado.novo = false;
  atualizarStatus();
  agendarSync();
}

function adicionarLoja() {
  const o = estado.rascunho;
  o.lojas_nomes.push(`Loja ${o.lojas_nomes.length + 1}`);
  o.itens.forEach((i) => i.lojas.push(0));
  renderLevantamento();
  agendarAutoSalvar();
}
function removerLoja(j) {
  const o = estado.rascunho;
  if (o.lojas_nomes.length <= 1) return;
  const tem = o.itens.some((i) => parseNum(i.lojas[j]) > 0);
  if (tem && !confirm(`Remover "${o.lojas_nomes[j]}" e os preços dela?`)) return;
  o.lojas_nomes.splice(j, 1);
  o.itens.forEach((i) => {
    i.lojas.splice(j, 1);
    if (typeof i.escolha === 'number') i.escolha = i.escolha === j ? 'menor' : i.escolha > j ? i.escolha - 1 : i.escolha;
  });
  renderLevantamento();
  agendarAutoSalvar();
}

// =============================== Aba 3: Configurações ===============================
const SUBTITULOS = { empresa: 'Empresa', pixzap: 'Pix e WhatsApp', conta: 'Conta e sincronização' };

/** Logo do banco (PNG da pasta assets). Se o arquivo não existir, mostra a sigla colorida. */
function logoBancoHTML(idBanco, tam = 44) {
  const b = obterBanco(idBanco);
  const url = urlLogoBanco(idBanco);
  const reserva = `this.parentNode.style.background='${b.cor}';this.parentNode.style.color='${b.texto}';this.remove()`;
  return `<span style="position:relative;display:inline-grid;place-items:center;flex:none;width:${tam}px;height:${tam}px;border-radius:${Math.round(tam / 4)}px;overflow:hidden;background:${url ? fundoLogo(idBanco) : b.cor};color:${url ? 'transparent' : b.texto};font-weight:800;font-size:${Math.round(tam / 3.2)}px;border:1px solid #e5ebf2">${esc(b.sigla)}${url ? `<img src="${url}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain" onerror="${reserva}">` : ''}</span>`;
}
const ZAP_SVG = '<svg viewBox="0 0 24 24" width="62%" height="62%" aria-hidden="true"><path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-5.6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.1-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.6-1.200.1-.1 0-.3 0-.4l-.7-1.600c-.2-.4-.3-.3-.5-.3h-.4a.8.8 0 0 0-.6.3 2.500 2.500 0 0 0-.8 1.900c0 1.100.8 2.200.9 2.300.1.100 1.600 2.500 3.900 3.400 1.400.6 2 .6 2.700.5.4-.1 1.400-.6 1.600-1.100.2-.5.2-1 .1-1.100l-.5-.3z"/></svg>';
const logoZapHTML = (tam = 44) => `<span style="position:relative;display:inline-grid;place-items:center;flex:none;width:${tam}px;height:${tam}px;border-radius:${Math.round(tam / 4)}px;overflow:hidden;background:#fff;border:1px solid #e5ebf2">${ZAP_SVG}<img src="${LOGO_ZAP}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;padding:${Math.round(tam / 12)}px;box-sizing:border-box" onerror="this.remove()"></span>`;

function chaveBonita(c) {
  const d = apenasDigitos(c.chave);
  if (c.tipo === 'celular') return '+55 ' + mascTel(d.startsWith('55') && d.length > 11 ? d.slice(2) : d);
  if (c.tipo === 'cpf' || c.tipo === 'cnpj') return mascDoc(d);
  return c.chave;
}
const numeroZapBonito = (n) => { const d = apenasDigitos(n); return '+55 ' + mascTel(d.startsWith('55') && d.length > 11 ? d.slice(2) : d); };
const numeroZapCompleto = (n) => { const d = apenasDigitos(n); return d.startsWith('55') && d.length > 11 ? d : '55' + d; };

function itemMenu(sub, icone, titulo, descricao) {
  return `<button class="cartao w-full flex items-center gap-3 text-left min-h-[64px]" data-acao="sub" data-sub="${sub}">
    <span class="text-2xl">${icone}</span>
    <span class="flex-1 min-w-0"><b class="block">${titulo}</b><span class="block text-sm text-slate-500 truncate">${descricao}</span></span>
    <span class="text-slate-400 text-xl">›</span></button>`;
}
const botaoVoltar = '<button class="btn btn-sec mb-3" data-acao="sub" data-sub="">← Voltar</button>';

function renderConfig() {
  estado.perfil = Store.obterPerfil();
  if (estado.sub === 'empresa') return renderEmpresa();
  if (estado.sub === 'pixzap') return renderPixZap();
  if (estado.sub === 'conta') return renderConta();
  const p = estado.perfil;
  conteudo.innerHTML = `<div class="space-y-3">
    ${itemMenu('empresa', '🏢', 'Empresa', esc(p.nome_comercial) + (p.cpf_cnpj ? ' • ' + esc(p.cpf_cnpj) : ' • preencha o CNPJ/CPF'))}
    ${itemMenu('pixzap', '💳', 'Pix e WhatsApp', `${p.pix_contas.length} Pix • ${p.whatsapps.length} WhatsApp`)}
    ${itemMenu('conta', '☁️', 'Conta e sincronização', estado.user ? esc(estado.user.email || 'Conectado') : 'Sem conta (só neste aparelho)')}
    <p class="text-center text-xs text-slate-400 pt-3">DC Gestor 2.0</p></div>`;
}

// ---------- Empresa ----------
function renderEmpresa() {
  const p = estado.perfil;
  const pixOpcoes = p.pix_contas.length
    ? p.pix_contas.map((c) => `<option value="${c.id}" ${p.pix_padrao_id === c.id ? 'selected' : ''}>${esc(c.apelido)} • ${esc(obterBanco(c.banco).nome)}</option>`).join('')
    : '<option value="">Cadastre um Pix primeiro</option>';
  const tensoes = ['127', '220', '380'].map((v) => `<option value="${v}" ${String(p.tensao) === v ? 'selected' : ''}>${v} V</option>`).join('');
  conteudo.innerHTML = `${botaoVoltar}
    <div class="space-y-4">
      <section class="cartao">
        <h2 class="titulo-sec">🖼️ Identidade visual</h2>
        <div class="flex items-center gap-3">
          <div id="prev-logo" class="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white grid place-items-center overflow-hidden shrink-0"></div>
          <div class="min-w-0">
            <input id="arq-logo" type="file" accept="image/*" class="text-sm w-full">
            <p class="text-xs text-slate-500 mt-1">Aparece no cabeçalho dos PDFs. Sem logo próprio, usa o logo padrão do DC Gestor.</p>
            <button class="btn btn-sec mt-1 text-[13px]" data-acao="remover-logo">Usar logo padrão</button>
          </div>
        </div>
      </section>
      <section class="cartao">
        <h2 class="titulo-sec">👷 Profissional / empresa</h2>
        <div class="grid grid-cols-2 gap-3">
          ${entrada('perfil', 'nome_comercial', 'Nome comercial', p.nome_comercial, { cls: 'col-span-2' })}
          ${entrada('perfil', 'cpf_cnpj', 'CNPJ / CPF', p.cpf_cnpj, { mask: 'doc', modo: 'numeric' })}
          ${entrada('perfil', 'telefone', 'Tel / WhatsApp', p.telefone, { mask: 'tel', tipo: 'tel', modo: 'tel', ph: '(14) 99999-9999' })}
          ${entrada('perfil', 'email', 'E-mail comercial', p.email, { cls: 'col-span-2', tipo: 'email', modo: 'email' })}
          ${entrada('perfil', 'endereco', 'Endereço', p.endereco, { cls: 'col-span-2' })}
        </div>
      </section>
      <section class="cartao">
        <h2 class="titulo-sec">📐 Parâmetros padrão</h2>
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="rot">Tensão</span><select class="campo" data-perfil="tensao">${tensoes}</select></label>
          ${entrada('perfil', 'concessionaria', 'Concessionária', p.concessionaria, { ph: 'Ex.: CPFL' })}
          <label class="block col-span-2"><span class="rot">Pix padrão dos orçamentos</span><select class="campo" data-perfil="pix_padrao_id">${pixOpcoes}</select></label>
          ${entrada('perfil', 'margem_padrao', 'Margem de lucro (%)', numParaInput(p.margem_padrao), { modo: 'decimal', ph: '0' })}
          ${entrada('perfil', 'mao_de_obra_padrao', 'Mão de obra (R$)', numParaInput(p.mao_de_obra_padrao), { modo: 'decimal', ph: '0' })}
          ${entrada('perfil', 'validade_dias', 'Validade do orçamento (dias)', numParaInput(p.validade_dias), { modo: 'numeric', ph: '7' })}
        </div>
      </section>
      <section class="cartao">
        <h2 class="titulo-sec">💬 Mensagem ao enviar orçamento</h2>
        <textarea class="campo" data-perfil="whatsapp_mensagem" rows="4">${esc(p.whatsapp_mensagem)}</textarea>
        <p class="text-xs text-slate-500 mt-1">Use {cliente}, {obra}, {numero}, {total} e {validade}.</p>
      </section>
      <button class="btn btn-prim w-full" data-acao="salvar-empresa">💾 Salvar empresa</button>
    </div>`;
  desenharLogo();
}

function desenharLogo() {
  const alvo = $('#prev-logo');
  if (!alvo) return;
  alvo.innerHTML = `<img src="${estado.perfil.logo || LOGO_EMPRESA}" alt="Logo" class="w-full h-full object-contain" onerror="this.replaceWith(document.createTextNode('Sem logo'))">`;
}

function aoEditarPerfil(el) {
  const campo = el.dataset.perfil;
  if (el.type === 'checkbox') estado.perfil[campo] = el.checked;
  else estado.perfil[campo] = NUMERICOS_PERFIL.has(campo) ? parseNum(el.value) : el.value;
}

function lerLogo(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const fator = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * fator);
      c.height = Math.round(img.height * fator);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Não foi possível ler essa imagem.'));
    img.src = url;
  });
}

// ---------- Conta ----------
function renderConta() {
  conteudo.innerHTML = `${botaoVoltar}
    <section class="cartao">
      <h2 class="titulo-sec">☁️ Conta</h2>
      <p class="text-sm text-slate-600 mb-3">${estado.user ? `Conectado como <b>${esc(estado.user.email || 'usuário')}</b>. Seus dados ficam na nuvem e neste aparelho.` : 'Você está usando o app <b>sem conta</b>: os dados ficam só neste aparelho.'}</p>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn btn-sec" data-acao="sincronizar">🔄 Sincronizar</button>
        <button class="btn btn-sec" data-acao="sair">${estado.user ? 'Sair da conta' : 'Entrar com conta'}</button>
      </div>
    </section>`;
}

// ---------- Pix e WhatsApp ----------
function renderPixZap() {
  const p = estado.perfil;
  const linhasPix = p.pix_contas.map((c) => `
    <div class="cartao flex items-center gap-2 !p-3">
      <button class="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[48px]" data-acao="apresentar" data-tipo="pix" data-id="${c.id}">
        ${logoBancoHTML(c.banco)}
        <span class="min-w-0"><b class="block truncate">${esc(c.apelido)}${c.id === p.pix_padrao_id ? ' <span class="text-[10px] font-bold text-brand bg-brand-50 px-1.5 py-0.5 rounded-full align-middle">padrão</span>' : ''}</b>
          <span class="block text-xs text-slate-500 truncate">${esc(obterBanco(c.banco).nome)} • ${esc(c.titular)} • ${esc(chaveBonita(c))}</span></span></button>
      <button class="btn btn-sec" data-acao="edit-pix" data-id="${c.id}" aria-label="Editar Pix">✏️</button>
      <button class="btn btn-perigo" data-acao="del-pix" data-id="${c.id}" aria-label="Excluir Pix">🗑️</button></div>`).join('');
  const linhasZap = p.whatsapps.map((w) => `
    <div class="cartao flex items-center gap-2 !p-3">
      <button class="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[48px]" data-acao="apresentar" data-tipo="zap" data-id="${w.id}">
        ${logoZapHTML()}
        <span class="min-w-0"><b class="block truncate">${esc(w.apelido)}</b>
          <span class="block text-xs text-slate-500 truncate">${esc(w.nome)} • ${esc(mascTel(apenasDigitos(w.numero).replace(/^55(?=\d{10,11}$)/, '')))}</span></span></button>
      <button class="btn btn-sec" data-acao="edit-zap" data-id="${w.id}" aria-label="Editar WhatsApp">✏️</button>
      <button class="btn btn-perigo" data-acao="del-zap" data-id="${w.id}" aria-label="Excluir WhatsApp">🗑️</button></div>`).join('');
  conteudo.innerHTML = `${botaoVoltar}
    <p class="text-sm text-slate-500 mb-4">Fica salvo na sua conta (aparece em qualquer aparelho) e também neste aparelho, para abrir sem internet. A apresentação pega as cores e o logo do banco.</p>
    <h2 class="titulo-sec">Pix (${p.pix_contas.length})</h2>
    <div class="space-y-2 mb-2">${linhasPix}</div>
    <button class="btn btn-sec w-full mb-5" data-acao="add-pix">＋ Adicionar Pix</button>
    <h2 class="titulo-sec">WhatsApp (${p.whatsapps.length})</h2>
    <div class="space-y-2 mb-2">${linhasZap}</div>
    <button class="btn btn-sec w-full mb-5" data-acao="add-zap">＋ Adicionar WhatsApp</button>
    <button class="btn btn-prim w-full" data-acao="apresentar" data-tipo="" data-id="">👁️ Ver apresentação</button>`;
}

/** Grava o perfil já com as contas atualizadas e sincroniza. */
function gravarPerfil(p) {
  Store.salvarPerfil(p);
  estado.perfil = Store.obterPerfil();
  atualizarStatus();
  sincronizarAgora();
}

// ----- Formulário: Novo Pix -----
function validarChave(tipo, chave) {
  const d = apenasDigitos(chave);
  if (tipo === 'cpf') return d.length === 11;
  if (tipo === 'cnpj') return d.length === 14;
  if (tipo === 'celular') return d.length >= 10 && d.length <= 13;
  if (tipo === 'email') return /^\S+@\S+\.\S+$/.test(chave.trim());
  return chave.trim().length >= 8;
}
const aplicarMascaraChave = (tipo, v) => (tipo === 'cpf' || tipo === 'cnpj' ? mascDoc(v) : tipo === 'celular' ? mascTel(v) : v);

function abrirFormPix(id) {
  const p = Store.obterPerfil();
  const conta = p.pix_contas.find((c) => c.id === id);
  estado.formPix = conta ? { ...conta } : { id: '', banco: 'nubank', apelido: '', titular: '', tipo: 'cpf', chave: '', cidade: p.pix_contas[0]?.cidade || '', mostrar_chave: true, copia_cola: '' };
  const f = estado.formPix;
  const tipos = TIPOS_CHAVE.map((t) => `<option value="${t.id}" ${f.tipo === t.id ? 'selected' : ''}>${t.nome}</option>`).join('');
  abrirModal(`
    <div class="flex items-center justify-between mb-3"><h2 class="titulo-sec !m-0">${conta ? '✏️ Editar Pix' : '＋ Novo Pix'}</h2>
      <button class="btn btn-sec" data-acao="fechar-modal" aria-label="Fechar">✕</button></div>
    <span class="rot">Banco</span>
    <div id="fp-bancos" class="grid grid-cols-4 gap-2 mb-3"></div>
    <div class="space-y-3">
      ${entrada('fp', 'apelido', 'Como aparece (ex.: Pix da loja, Pix pessoal)', f.apelido)}
      ${entrada('fp', 'titular', 'Nome do titular (como aparece no banco)', f.titular)}
      <div class="grid grid-cols-2 gap-3">
        <label class="block"><span class="rot">Tipo de chave</span><select class="campo" data-fp="tipo">${tipos}</select></label>
        ${entrada('fp', 'chave', 'Chave Pix', f.chave)}
      </div>
      ${entrada('fp', 'cidade', 'Cidade (para o QR)', f.cidade, { ph: 'Ex.: Bauru' })}
      <label class="flex items-center gap-3 min-h-[44px] text-sm"><input type="checkbox" class="w-6 h-6 accent-orange-500" data-fp="mostrar_chave" ${f.mostrar_chave ? 'checked' : ''}>
        Mostrar a chave no cartão (se desmarcar, só o QR Code aparece)</label>
      <label class="block"><span class="rot">Pix copia e cola (opcional)</span>
        <textarea class="campo" data-fp="copia_cola" placeholder="Se você já tem o código do seu banco, cole aqui. Senão o QR é gerado pela chave.">${esc(f.copia_cola)}</textarea></label>
      <button class="btn btn-prim w-full" data-acao="fp-salvar">Salvar</button>
    </div>`);
  desenharBancosForm();
}
function desenharBancosForm() {
  const alvo = $('#fp-bancos');
  if (!alvo) return;
  alvo.innerHTML = BANCOS.map((b) => `<button class="banco ${estado.formPix.banco === b.id ? 'ativo' : ''}" data-acao="fp-banco" data-banco="${b.id}" aria-label="${b.nome}">${logoBancoHTML(b.id, 36)}${b.nome}</button>`).join('');
}
function salvarFormPix() {
  const f = estado.formPix;
  f.apelido = f.apelido.trim() || 'Pix';
  f.titular = f.titular.trim();
  f.copia_cola = f.copia_cola.trim();
  if (!f.titular) return aviso('Informe o nome do titular.', true);
  if (!f.chave.trim() && !f.copia_cola) return aviso('Informe a chave Pix.', true);
  if (f.chave.trim() && !validarChave(f.tipo, f.chave)) return aviso('A chave não confere com o tipo escolhido.', true);
  const p = Store.obterPerfil();
  if (f.id) p.pix_contas = p.pix_contas.map((c) => (c.id === f.id ? { ...f } : c));
  else { f.id = uuid(); p.pix_contas.push({ ...f }); }
  if (!p.pix_contas.some((c) => c.id === p.pix_padrao_id)) p.pix_padrao_id = p.pix_contas[0].id;
  gravarPerfil(p);
  fecharModal();
  renderConfig();
  aviso('Pix salvo.');
}

// ----- Formulário: Novo WhatsApp -----
function abrirFormZap(id) {
  const p = Store.obterPerfil();
  const w = p.whatsapps.find((x) => x.id === id);
  estado.formZap = w ? { ...w, numero: mascTel(apenasDigitos(w.numero).replace(/^55(?=\d{10,11}$)/, '')) } : { id: '', apelido: 'WhatsApp', nome: p.nome_comercial || '', numero: '', mensagem: '' };
  const f = estado.formZap;
  abrirModal(`
    <div class="flex items-center justify-between mb-3"><h2 class="titulo-sec !m-0">${w ? '✏️ Editar WhatsApp' : '＋ Novo WhatsApp'}</h2>
      <button class="btn btn-sec" data-acao="fechar-modal" aria-label="Fechar">✕</button></div>
    <div class="space-y-3">
      ${entrada('zp', 'apelido', 'Como aparece (ex.: Orçamentos, Suporte)', f.apelido)}
      ${entrada('zp', 'nome', 'Seu nome / empresa', f.nome)}
      ${entrada('zp', 'numero', 'Número com DDD', f.numero, { mask: 'tel', tipo: 'tel', modo: 'tel', ph: '14 99999-9999' })}
      ${entrada('zp', 'mensagem', 'Mensagem inicial (opcional)', f.mensagem, { ph: 'Olá! Vim pelo cartão de visita.' })}
      <button class="btn btn-prim w-full" data-acao="zp-salvar">Salvar</button>
    </div>`);
}
function salvarFormZap() {
  const f = estado.formZap;
  const d = apenasDigitos(f.numero);
  if (d.length < 10 || d.length > 11) return aviso('Informe o número com DDD (10 ou 11 dígitos).', true);
  f.apelido = f.apelido.trim() || 'WhatsApp';
  f.nome = f.nome.trim();
  f.numero = d;
  if (!f.nome) return aviso('Informe seu nome ou o da empresa.', true);
  const p = Store.obterPerfil();
  if (f.id) p.whatsapps = p.whatsapps.map((w) => (w.id === f.id ? { ...f } : w));
  else { f.id = uuid(); p.whatsapps.push({ ...f }); }
  gravarPerfil(p);
  fecharModal();
  renderConfig();
  aviso('WhatsApp salvo.');
}

function excluirConta(tipo, id) {
  if (!confirm(tipo === 'pix' ? 'Excluir este Pix?' : 'Excluir este WhatsApp?')) return;
  const p = Store.obterPerfil();
  if (tipo === 'pix') {
    p.pix_contas = p.pix_contas.filter((c) => c.id !== id);
    if (p.pix_padrao_id === id) p.pix_padrao_id = p.pix_contas[0]?.id || '';
  } else {
    p.whatsapps = p.whatsapps.filter((w) => w.id !== id);
  }
  gravarPerfil(p);
  renderConfig();
}

// ---------- Apresentação (cartão com QR para mostrar ao cliente) ----------
function abrirApresentacao(tipo, id) {
  const p = Store.obterPerfil();
  const itens = [...p.pix_contas.map((c) => ({ tipo: 'pix', id: c.id })), ...p.whatsapps.map((w) => ({ tipo: 'zap', id: w.id }))];
  if (!itens.length) return aviso('Cadastre um Pix ou WhatsApp primeiro.', true);
  if (!id) ({ tipo, id } = itens[0]);
  estado.apres = { tipo, id, valor: 0, ocultar: false, perfil: p, tk: 0, payload: '' };
  abrirModal(`
    <div class="flex items-center justify-between mb-3"><h2 class="titulo-sec !m-0">📲 Apresentação</h2>
      <button class="btn btn-sec" data-acao="fechar-modal" aria-label="Fechar">✕</button></div>
    <div id="ap-chips" class="flex gap-2 overflow-x-auto pb-2 mb-2"></div>
    <div id="ap-card" class="flex justify-center min-h-[120px]"></div>
    <div id="ap-controles" class="mt-3 space-y-2"></div>`);
  desenharControlesApresentacao();
  desenharCartao();
}

function desenharControlesApresentacao() {
  const a = estado.apres;
  const p = a.perfil;
  const chips = [
    ...p.pix_contas.map((c) => ({ tipo: 'pix', id: c.id, nome: '💳 ' + c.apelido })),
    ...p.whatsapps.map((w) => ({ tipo: 'zap', id: w.id, nome: '💬 ' + w.apelido }))
  ].map((i) => `<button class="chip ${a.tipo === i.tipo && a.id === i.id ? 'ativo' : ''}" data-acao="ap-ir" data-tipo="${i.tipo}" data-id="${i.id}">${esc(i.nome)}</button>`).join('');
  $('#ap-chips').innerHTML = chips;
  $('#ap-controles').innerHTML = a.tipo === 'pix' ? `
    <input id="ap-valor" class="campo" data-ap="valor" inputmode="decimal" placeholder="Valor (opcional): com valor, o QR já vem com o valor" value="${numParaInput(a.valor)}">
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-sec" data-acao="ap-copiar-chave">📋 Copiar chave</button>
      <button class="btn btn-prim" data-acao="ap-copiacola">🫙 Pix copia e cola</button>
      <button class="btn btn-sec" data-acao="ap-ocultar">${a.ocultar ? '👁️ Mostrar chave' : '🙈 Ocultar chave'}</button>
      <button class="btn btn-sec" data-acao="ap-salvar">🖼️ Salvar imagem</button>
      <button class="btn btn-sec col-span-2" data-acao="ap-compartilhar">📤 Compartilhar</button>
    </div>` : `
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-sec" data-acao="ap-copiar-chave">📋 Copiar número</button>
      <a class="btn btn-prim" id="ap-abrir" target="_blank" rel="noopener" href="#">💬 Abrir conversa</a>
      <button class="btn btn-sec" data-acao="ap-salvar">🖼️ Salvar imagem</button>
      <button class="btn btn-sec" data-acao="ap-compartilhar">📤 Compartilhar</button>
    </div>`;
}

const cantoQR = (pos, cor) => {
  const base = `position:absolute;width:26px;height:26px;border:5px solid ${cor};`;
  const lados = { tl: 'top:0;left:0;border-right:0;border-bottom:0;border-top-left-radius:8px;', tr: 'top:0;right:0;border-left:0;border-bottom:0;border-top-right-radius:8px;', bl: 'bottom:0;left:0;border-right:0;border-top:0;border-bottom-left-radius:8px;', br: 'bottom:0;right:0;border-left:0;border-top:0;border-bottom-right-radius:8px;' };
  return `<span style="${base}${lados[pos]}"></span>`;
};

function moldeCartao(grad, cabecalho, qr, corCanto, corpo) {
  return `<div id="cartao-img" style="width:100%;max-width:340px;box-sizing:border-box;padding:18px;border-radius:28px;color:#fff;font-family:Inter,Arial,sans-serif;background:linear-gradient(160deg,${grad[0]},${grad[1]});box-shadow:0 12px 32px rgba(15,39,66,.28)">
    <div style="display:flex;align-items:center;gap:14px">${cabecalho}</div>
    <div style="background:#fff;border-radius:22px;margin-top:16px;padding:16px 14px 18px;text-align:center;color:#0F2742">
      <div style="position:relative;padding:12px;margin:0 auto;width:72%;aspect-ratio:1/1;box-sizing:content-box">
        <img src="${qr}" alt="QR Code" style="width:100%;height:100%;display:block">
        ${['tl', 'tr', 'bl', 'br'].map((c) => cantoQR(c, corCanto)).join('')}
      </div>
      ${corpo}
    </div>
    <div style="text-align:center;font-size:11px;opacity:.75;margin-top:12px">DC Gestor</div></div>`;
}

async function desenharCartao() {
  const a = estado.apres;
  const alvo = $('#ap-card');
  if (!a || !alvo) return;
  const token = ++a.tk;
  try {
    if (a.tipo === 'pix') {
      const c = a.perfil.pix_contas.find((x) => x.id === a.id);
      if (!c) return;
      const b = obterBanco(c.banco);
      const payload = PDF.payloadPix(c, a.valor);
      const qr = await PDF.gerarQRPix(payload, c.banco);
      if (token !== a.tk) return;
      a.payload = payload;
      const tipo = (TIPOS_CHAVE.find((t) => t.id === c.tipo) || {}).rotulo || 'Chave';
      alvo.innerHTML = moldeCartao(b.grad,
        `${logoBancoHTML(c.banco, 60)}<div style="min-width:0"><div style="font-size:20px;font-weight:800;line-height:1.1">${esc(c.apelido)}</div><div style="font-size:13px;opacity:.85">${esc(b.nome)}</div></div>`,
        qr, b.grad[0],
        `<div style="display:inline-block;margin-top:10px;background:${b.grad[0]};color:#fff;font-size:11px;font-weight:700;padding:3px 12px;border-radius:999px">Pix • ${esc(tipo)}</div>
         ${a.valor > 0 ? `<div style="font-size:24px;font-weight:800;margin-top:6px">${brl(a.valor)}</div>` : ''}
         ${!a.ocultar && c.mostrar_chave && c.chave ? `<div style="font-size:20px;font-weight:800;margin-top:6px;word-break:break-all">${esc(chaveBonita(c))}</div>` : ''}
         <div style="border-top:1px solid #e5ebf2;margin-top:10px;padding-top:8px">
           <div style="font-size:9px;letter-spacing:2px;color:#64748b">TITULAR</div>
           <div style="font-size:18px;font-weight:800">${esc(c.titular)}</div>
           <div style="font-size:13px;color:#475569">${esc(b.nome)}</div>
           <div style="font-size:10px;color:#94a3b8;margin-top:8px">Confira o nome e o banco antes de pagar</div></div>`);
    } else {
      const w = a.perfil.whatsapps.find((x) => x.id === a.id);
      if (!w) return;
      const link = `https://wa.me/${numeroZapCompleto(w.numero)}${w.mensagem ? '?text=' + encodeURIComponent(w.mensagem) : ''}`;
      const qr = await PDF.gerarQR(link, { logo: LOGO_ZAP, cor: '#25D366', sigla: 'WA' });
      if (token !== a.tk) return;
      a.payload = link;
      const abrir = $('#ap-abrir');
      if (abrir) abrir.href = link;
      alvo.innerHTML = moldeCartao(['#2fd36e', '#0b7a47'],
        `${logoZapHTML(60)}
         <div style="min-width:0"><div style="font-size:20px;font-weight:800;line-height:1.1">${esc(w.nome)}</div><div style="font-size:13px;opacity:.85">WhatsApp</div></div>`,
        qr, '#25D366',
        `<div style="display:inline-block;margin-top:10px;background:#25D366;color:#fff;font-size:11px;font-weight:700;padding:3px 12px;border-radius:999px">WhatsApp</div>
         <div style="font-size:20px;font-weight:800;margin-top:6px">${esc(numeroZapBonito(w.numero))}</div>
         <div style="border-top:1px solid #e5ebf2;margin-top:10px;padding-top:8px">
           <div style="font-size:9px;letter-spacing:2px;color:#64748b">NOME</div>
           <div style="font-size:18px;font-weight:800">${esc(w.nome)}</div>
           <div style="font-size:13px;color:#475569">${esc(w.apelido)}</div>
           <div style="font-size:10px;color:#94a3b8;margin-top:8px">Escaneie para abrir a conversa</div></div>`);
    }
  } catch (e) {
    if (token === a.tk) alvo.innerHTML = `<p class="text-sm text-red-600">${esc(e.message || 'Não foi possível gerar o cartão.')}</p>`;
  }
}

async function capturarCartao() {
  const el = $('#cartao-img');
  if (!el) throw new Error('Cartão ainda não está pronto.');
  if (typeof html2pdf === 'undefined') throw new Error('Biblioteca de imagem não carregada. Conecte-se uma vez à internet.');
  const canvas = await html2pdf().set({ html2canvas: { scale: 2, useCORS: true, backgroundColor: null } }).from(el).toCanvas().get('canvas');
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
const nomeCartao = () => {
  const a = estado.apres;
  const item = a.tipo === 'pix' ? a.perfil.pix_contas.find((c) => c.id === a.id) : a.perfil.whatsapps.find((w) => w.id === a.id);
  return semAcentos((item && item.apelido) || 'cartao').replace(/[^A-Za-z0-9]+/g, '_');
};

async function acaoApresentacao(acao) {
  const a = estado.apres;
  const p = a.perfil;
  try {
    if (acao === 'ap-copiar-chave') {
      if (a.tipo === 'pix') {
        const c = p.pix_contas.find((x) => x.id === a.id);
        await copiarTexto(c.chave ? normalizarChavePix(c.tipo, c.chave) : a.payload);
        aviso('Chave Pix copiada ✔');
      } else {
        await copiarTexto('+' + numeroZapCompleto(p.whatsapps.find((x) => x.id === a.id).numero));
        aviso('Número copiado ✔');
      }
    } else if (acao === 'ap-copiacola') {
      await copiarTexto(a.payload);
      aviso('Pix copia e cola copiado ✔');
    } else if (acao === 'ap-ocultar') {
      a.ocultar = !a.ocultar;
      desenharControlesApresentacao();
      desenharCartao();
    } else if (acao === 'ap-salvar') {
      baixarBlob(await capturarCartao(), `${a.tipo === 'pix' ? 'Pix' : 'WhatsApp'}_${nomeCartao()}.png`);
    } else if (acao === 'ap-compartilhar') {
      const blob = await capturarCartao();
      const arquivo = new File([blob], `${a.tipo === 'pix' ? 'Pix' : 'WhatsApp'}_${nomeCartao()}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], text: a.tipo === 'pix' ? 'Pix para pagamento' : 'Fale comigo no WhatsApp' }); } catch { /* cancelado */ }
      } else {
        baixarBlob(blob, arquivo.name);
        aviso('Imagem salva. Compartilhe pelo seu app preferido.');
      }
    }
  } catch (e) {
    aviso(e.message || 'Não foi possível concluir.', true);
  }
}

// =============================== Primeiro uso e atalhos da tela inicial ===============================
const configIncompleta = (p) => !p.nome_comercial || !p.pix_contas.length || !p.whatsapps.length;

function verificarOnboarding() {
  if (localStorage.getItem(CHAVE_ONB_PULADO)) return;
  if (!$('#modal').classList.contains('hidden')) return;
  if (configIncompleta(Store.obterPerfil())) abrirOnboarding();
}

function desenharAtalhos() {
  const alvo = $('#atalhos');
  if (!alvo) return;
  const p = Store.obterPerfil();
  const botoes = [
    ...p.pix_contas.map((c) => `<button class="atalho" data-acao="apresentar" data-tipo="pix" data-id="${c.id}">${logoBancoHTML(c.banco, 46)}<b>${esc(c.apelido)}</b><small>Mostrar Pix</small></button>`),
    ...p.whatsapps.map((w) => `<button class="atalho" data-acao="apresentar" data-tipo="zap" data-id="${w.id}">${logoZapHTML(46)}<b>${esc(w.apelido)}</b><small>Mostrar WhatsApp</small></button>`)
  ].join('');
  const falta = !p.nome_comercial ? 'Nome, WhatsApp e Pix em 1 minuto' : !p.pix_contas.length ? 'Falta cadastrar seu Pix' : 'Falta cadastrar seu WhatsApp';
  alvo.innerHTML =
    (configIncompleta(p)
      ? `<button class="cartao w-full flex items-center gap-3 text-left mb-3 !border-orange-300 !bg-brand-50" data-acao="abrir-onb"><span class="text-2xl">🚀</span><span class="flex-1 min-w-0"><b class="block">Configure sua empresa</b><span class="block text-sm text-slate-600">${falta}</span></span><span class="text-xl text-slate-400">›</span></button>`
      : '') +
    (botoes ? `<div class="mb-3"><div class="text-xs font-bold text-slate-500 mb-2">PIX E WHATSAPP · toque para mostrar ao cliente</div><div class="flex gap-2 overflow-x-auto pb-1">${botoes}</div></div>` : '');
}

function abrirOnboarding() {
  const p = Store.obterPerfil();
  const precisaPix = p.pix_contas.length === 0;
  estado.onb = { nome: p.nome_comercial || '', cpf_cnpj: p.cpf_cnpj || '', telefone: p.telefone || '' };
  estado.formPix = { id: '', banco: 'nubank', apelido: 'Pix', titular: '', tipo: 'cpf', chave: '', cidade: '', mostrar_chave: true, copia_cola: '' };
  const f = estado.formPix;
  const tipos = TIPOS_CHAVE.map((t) => `<option value="${t.id}" ${f.tipo === t.id ? 'selected' : ''}>${t.nome}</option>`).join('');
  abrirModal(`
    <h2 class="titulo-sec">👋 Vamos configurar seu app</h2>
    <p class="text-sm text-slate-500 mb-3">Leva 1 minuto. Esses dados vão no cabeçalho dos orçamentos e nos atalhos de Pix e WhatsApp da tela inicial.</p>
    <div class="space-y-3">
      ${entrada('onb', 'nome', 'Nome da empresa ou seu nome *', estado.onb.nome, { auto: 'organization' })}
      <div class="grid grid-cols-2 gap-3">
        ${entrada('onb', 'telefone', 'WhatsApp com DDD *', estado.onb.telefone, { mask: 'tel', tipo: 'tel', modo: 'tel', ph: '(14) 99999-9999' })}
        ${entrada('onb', 'cpf_cnpj', 'CNPJ / CPF', estado.onb.cpf_cnpj, { mask: 'doc', modo: 'numeric' })}
      </div>
      ${precisaPix ? `
      <div class="pt-3 border-t border-slate-200">
        <b class="text-sm">💳 Seu Pix <span class="font-normal text-slate-500">(opcional)</span></b>
        <span class="rot mt-2">Banco</span>
        <div id="fp-bancos" class="grid grid-cols-4 gap-2 mb-3"></div>
        <div class="space-y-3">
          ${entrada('fp', 'titular', 'Nome do titular (como aparece no banco)', f.titular)}
          <div class="grid grid-cols-2 gap-3">
            <label class="block"><span class="rot">Tipo de chave</span><select class="campo" data-fp="tipo">${tipos}</select></label>
            ${entrada('fp', 'chave', 'Chave Pix', f.chave)}
          </div>
          ${entrada('fp', 'cidade', 'Cidade (para o QR)', f.cidade, { ph: 'Ex.: Bauru' })}
        </div>
      </div>` : ''}
      <button class="btn btn-prim w-full" data-acao="onb-salvar">Salvar e começar</button>
      <button class="btn btn-sec w-full" data-acao="onb-depois">Configurar depois</button>
    </div>`);
  if (precisaPix) desenharBancosForm();
}

function salvarOnboarding() {
  const o = estado.onb;
  const f = estado.formPix;
  const nome = (o.nome || '').trim();
  const tel = apenasDigitos(o.telefone);
  if (!nome) return aviso('Informe o nome da empresa ou o seu.', true);
  if (tel.length < 10 || tel.length > 11) return aviso('Informe o WhatsApp com DDD.', true);
  const p = Store.obterPerfil();
  const querPix = p.pix_contas.length === 0 && ((f.chave || '').trim() || (f.titular || '').trim());
  if (querPix) {
    if (!f.titular.trim()) return aviso('Informe o nome do titular do Pix.', true);
    if (!validarChave(f.tipo, f.chave)) return aviso('A chave Pix não confere com o tipo escolhido.', true);
  }
  p.nome_comercial = nome;
  p.cpf_cnpj = o.cpf_cnpj || '';
  p.telefone = o.telefone;
  if (!p.whatsapps.length) p.whatsapps.push({ id: uuid(), apelido: 'WhatsApp', nome, numero: tel, mensagem: '' });
  if (querPix) {
    const c = { ...f, id: uuid(), apelido: `Pix ${obterBanco(f.banco).nome}`, titular: f.titular.trim(), cidade: (f.cidade || '').trim() };
    p.pix_contas.push(c);
    p.pix_padrao_id = c.id;
  }
  gravarPerfil(p);
  estado.onb = null;
  fecharModal();
  render();
  aviso('Tudo pronto! ✔');
}

// =============================== Eventos globais ===============================
async function aoClicar(ev) {
  if (ev.target.id === 'modal') return fecharModal();
  const alvo = ev.target.closest('[data-acao]');
  if (!alvo) return;
  const d = alvo.dataset;
  switch (d.acao) {
    case 'aba': return irPara(d.aba);
    case 'novo':
      salvarSeTemConteudo();
      estado.rascunho = null;
      limparRascunhoTemp();
      return irPara('levantamento');
    case 'filtro': estado.filtro = d.filtro; return renderObras();
    case 'editar': return abrirParaEditar(d.id);
    case 'pdf': return baixarDaLista(d.id);
    case 'enviar': return enviarOrcamento(d.id);
    case 'excluir':
      if (confirm('Excluir este orçamento? Essa ação não pode ser desfeita.')) {
        Store.excluirOrcamento(d.id);
        desenharLista();
        atualizarStatus();
        sincronizarAgora();
        aviso('Orçamento excluído.');
      }
      return;
    case 'add-item': {
      estado.rascunho.itens.push(itemVazio(estado.rascunho.lojas_nomes.length));
      desenharItens();
      atualizarCalculos();
      const campos = $$('[data-k="descricao"]');
      if (campos.length) campos[campos.length - 1].focus();
      return;
    }
    case 'rem-item': {
      const itens = estado.rascunho.itens;
      if (itens.length === 1) itens[0] = itemVazio(estado.rascunho.lojas_nomes.length);
      else itens.splice(Number(d.i), 1);
      desenharItens();
      return atualizarCalculos();
    }
    case 'salvar':
      if (salvarRascunho()) aviso('Orçamento salvo.');
      return;
    case 'gerar-pdf': {
      if (!salvarRascunho()) return;
      aviso('Gerando PDF…');
      alvo.disabled = true;
      try {
        await PDF.baixarPDF(estado.rascunho, Store.obterPerfil());
      } catch (e) {
        aviso(e.message || 'Não foi possível gerar o PDF.', true);
      }
      alvo.disabled = false;
      return;
    }
    case 'descartar':
      salvarSeTemConteudo();
      estado.rascunho = null;
      limparRascunhoTemp();
      return irPara('obras');
    case 'add-loja': return adicionarLoja();
    case 'rem-loja': return removerLoja(Number(d.j));
    case 'abrir-onb': return abrirOnboarding();
    case 'onb-salvar': return salvarOnboarding();
    case 'onb-depois':
      localStorage.setItem(CHAVE_ONB_PULADO, '1');
      return fecharModal();
    case 'sub': estado.sub = d.sub || null; render(); return window.scrollTo(0, 0);
    case 'remover-logo': estado.perfil.logo = ''; return desenharLogo();
    case 'salvar-empresa':
      if (!(estado.perfil.nome_comercial || '').trim()) return aviso('Informe o nome comercial.', true);
      gravarPerfil(estado.perfil);
      return aviso('Dados da empresa salvos.');
    case 'add-pix': return abrirFormPix('');
    case 'edit-pix': return abrirFormPix(d.id);
    case 'del-pix': return excluirConta('pix', d.id);
    case 'fp-banco': estado.formPix.banco = d.banco; return desenharBancosForm();
    case 'fp-salvar': return salvarFormPix();
    case 'add-zap': return abrirFormZap('');
    case 'edit-zap': return abrirFormZap(d.id);
    case 'del-zap': return excluirConta('zap', d.id);
    case 'zp-salvar': return salvarFormZap();
    case 'apresentar': return abrirApresentacao(d.tipo, d.id);
    case 'ap-ir':
      Object.assign(estado.apres, { tipo: d.tipo, id: d.id, valor: 0, ocultar: false });
      desenharControlesApresentacao();
      return desenharCartao();
    case 'ap-copiar-chave': case 'ap-copiacola': case 'ap-ocultar': case 'ap-salvar': case 'ap-compartilhar':
      return acaoApresentacao(d.acao);
    case 'sincronizar': return sincronizarAgora(true);
    case 'sair': return sair();
    case 'fechar-modal': return fecharModal();
    default:
  }
}

function aoDigitar(ev) {
  const el = ev.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.mask && MASCARAS[el.dataset.mask]) el.value = MASCARAS[el.dataset.mask](el.value);
  if (el.dataset.campo !== undefined && estado.rascunho) aoEditarCampo(el);
  else if (el.dataset.item !== undefined && estado.rascunho) aoEditarItem(el);
  else if (el.dataset.loja !== undefined && estado.rascunho) aoEditarLoja(el);
  else if (el.dataset.perfil !== undefined && estado.perfil) aoEditarPerfil(el);
  else if (el.dataset.fp !== undefined && estado.formPix) {
    const f = estado.formPix;
    const campo = el.dataset.fp;
    f[campo] = el.type === 'checkbox' ? el.checked : el.value;
    if (campo === 'chave' || campo === 'tipo') {
      f.chave = aplicarMascaraChave(f.tipo, f.chave);
      const inChave = $('[data-fp="chave"]');
      if (inChave) inChave.value = f.chave;
    }
  } else if (el.dataset.onb !== undefined && estado.onb) {
    estado.onb[el.dataset.onb] = el.value;
  } else if (el.dataset.zp !== undefined && estado.formZap) estado.formZap[el.dataset.zp] = el.value;
  else if (el.dataset.ap !== undefined && estado.apres) {
    clearTimeout(estado.apres.temporizador);
    estado.apres.valor = parseNum(el.value);
    estado.apres.temporizador = setTimeout(desenharCartao, 300);
  }
  else if (el.id === 'busca') {
    estado.busca = el.value;
    desenharLista();
  }
}

async function aoEscolherLogo(ev) {
  if (ev.target.id !== 'arq-logo' || !ev.target.files[0]) return;
  try {
    estado.perfil.logo = await lerLogo(ev.target.files[0]);
    desenharLogo();
  } catch (e) {
    aviso(e.message, true);
  }
}

function ligarEventos() {
  document.addEventListener('click', aoClicar);
  document.addEventListener('input', aoDigitar);
  document.addEventListener('change', (ev) => { aoDigitar(ev); aoEscolherLogo(ev); });
  window.addEventListener('online', () => { atualizarStatus(); sincronizarAgora(); });
  window.addEventListener('offline', atualizarStatus);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizarAgora(); });
  ligarLogin();
}

// =============================== Inicialização ===============================
async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker', e));
  ligarEventos();
  const user = await Auth.iniciar((evento, usuario) => {
    if (evento === 'SIGNED_IN' && usuario) entrarNoApp(usuario);
    if (evento === 'SIGNED_OUT' && estado.user) mostrarLogin();
  });
  if (user) return entrarNoApp(user);
  if (Auth.modoLocal()) return entrarNoApp(null);
  // Sem internet (ou sem a biblioteca carregada): reabre com o último usuário conhecido
  const ultimo = JSON.parse(localStorage.getItem(CHAVE_ULTIMO_USUARIO) || 'null');
  if (ultimo && (!navigator.onLine || !obterSupabase())) return entrarNoApp(ultimo);
  mostrarLogin();
}

iniciar();
