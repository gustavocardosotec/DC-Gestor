// DC Gestor 3.1 - interface e eventos
import {
  $, $$, esc, uuid, brl, fmtData, fmtQtd, hojeISO, addDias, parseNum, numParaInput, apenasDigitos, semAcentos,
  MASCARAS, BANCOS, TIPOS_CHAVE, STATUS, statusDe, FORMAS_PGTO, itemVazio, calcularTotais, custoUnitario, vendaUnitaria, totalDoItem,
  precosDoItem, obterBanco, urlLogoBanco, fundoLogo, LOGO_EMPRESA, LOGO_ZAP, mascTel, mascDoc, normalizarChavePix
} from './utils.js';
import * as Auth from './auth.js';
import * as Store from './storage.js';
import * as PDF from './pdf.js';
import * as Equipe from './equipe.js';
import { obterSupabase } from './supabase.js';

const CHAVE_RASCUNHO = 'dcg:rascunho';
const CHAVE_ULTIMO_USUARIO = 'dcg:ultimoUsuario';
const CHAVE_ONB_PULADO = 'dcg:onbPulado';
const NUMERICOS_ORC = new Set(['margem_lucro', 'mao_de_obra', 'desconto', 'acrescimo', 'validade_dias']);
const NUMERICOS_PERFIL = new Set(['margem_padrao', 'mao_de_obra_padrao', 'validade_dias']);
const TITULOS = { obras: 'Obras & Orçamentos', levantamento: 'Novo Levantamento / Cotação', config: 'Configurações' };

const estado = { escopo: 'pessoal', lista: 'orc', nota: null, eq: { nome: '', codigo: '' }, aba: 'obras', sub: null, formPix: null, formZap: null, apres: null, user: null, busca: '', filtro: 'todos', rascunho: null, novo: true, onb: null, timerAuto: null, timerSync: null, perfil: null, perfilEmpresa: null, sincronizando: false, ultimoPayload: '' };
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
  const tinhaEmpresa = !!Store.obterEmpresa();
  const r = await Store.sincronizar(obterSupabase(), estado.user);
  estado.sincronizando = false;
  atualizarStatus();
  if (r.ok) {
    if (manual) aviso('Tudo sincronizado ✔');
    if (estado.aba === 'obras') { if (tinhaEmpresa !== !!Store.obterEmpresa()) renderObras(); else { desenharLista(); desenharAtalhos(); } }
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
function segmento(atual, opcoes, acao) {
  return `<div class="grid grid-cols-2 gap-1 p-1 bg-slate-200 rounded-xl mb-2">${opcoes.map(([k, nome]) => `<button class="min-h-[40px] rounded-lg text-sm font-bold ${atual === k ? 'bg-white shadow text-marinho' : 'text-slate-500'}" data-acao="${acao}" data-v="${k}">${nome}</button>`).join('')}</div>`;
}
function renderObras() {
  if (!empresaAtiva()) estado.escopo = 'pessoal';
  const notas = estado.lista === 'notas';
  const chips = notas ? '' : `<div class="flex gap-2 overflow-x-auto pb-2 mb-2">${[['todos', 'Todos'], ...Object.entries(STATUS).map(([k, v]) => [k, v.nome])]
    .map(([k, nome]) => `<button class="chip ${estado.filtro === k ? 'ativo' : ''}" data-acao="filtro" data-filtro="${k}">${nome}</button>`).join('')}</div>`;
  conteudo.innerHTML = `
    <div id="atalhos"></div>
    ${segmento(estado.lista, [['orc', '📝 Orçamentos'], ['notas', '🧾 Notas de serviço']], 'modo-lista')}
    ${empresaAtiva() ? segmento(estado.escopo, [['pessoal', '👤 Pessoal'], ['empresa', '🏢 ' + esc(empresaAtiva().nome)]], 'escopo') : ''}
    <div class="flex gap-2 mb-3">
      <input id="busca" class="campo" type="search" placeholder="🔍 Buscar cliente, obra ou nº" value="${esc(estado.busca)}" autocomplete="off">
      <button class="btn btn-sec shrink-0" data-acao="clientes" aria-label="Clientes salvos">👥</button>
      <button class="btn btn-prim shrink-0" data-acao="${notas ? 'nota-nova' : 'novo'}">＋ Novo</button>
    </div>
    ${chips}
    <div id="lista-obras" class="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3"></div>`;
  desenharLista();
  desenharAtalhos();
}

function desenharLista() {
  if (estado.lista === 'notas') return desenharNotas();
  const alvo = $('#lista-obras');
  if (!alvo) return;
  const termo = semAcentos(estado.busca).toLowerCase().trim();
  const lista = Store.listarOrcamentos(estado.escopo).filter((o) => {
    if (estado.filtro !== 'todos' && statusDe(o) !== estado.filtro) return false;
    if (!termo) return true;
    return semAcentos(`${o.cliente_nome} ${o.obra_nome} ${o.numero}`).toLowerCase().includes(termo);
  });
  if (!lista.length) {
    const vazio = Store.listarOrcamentos(estado.escopo).length === 0;
    alvo.innerHTML = `<div class="cartao text-center py-10">
      <div class="text-4xl mb-2">🏗️</div>
      <p class="font-bold">${vazio ? 'Nenhum orçamento ainda' : 'Nada encontrado'}</p>
      <p class="text-sm text-slate-500 mt-1 mb-4">${vazio ? 'Toque em Novo para fazer seu primeiro levantamento na obra.' : 'Mude a busca ou o filtro de status.'}</p>
      ${vazio ? '<button class="btn btn-prim" data-acao="novo">＋ Novo levantamento</button>' : ''}</div>`;
    return;
  }
  alvo.innerHTML = lista.map((o) => {
    const st = STATUS[statusDe(o)];
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
      </div>${linhaExtra('orc', o)}</article>`;
  }).join('');
}

const perfilDoRegistro = (reg) => (reg && reg.empresa_id ? Store.obterPerfilEmpresa() : Store.obterPerfil());

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
    await PDF.baixarPDF(o, perfilDoRegistro(o));
  } catch (e) {
    aviso(e.message || 'Não foi possível gerar o PDF.', true);
  }
}

async function enviarOrcamento(id) {
  const o = Store.obterOrcamento(id);
  if (!o) return;
  const perfil = perfilDoRegistro(o);
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
  n.status = statusDe(n);
  n.tensao = n.tensao === '220' ? '220' : '127';
  n.empresa = n.empresa && typeof n.empresa === 'object' ? { ...n.empresa } : {};
  n.mostrar_pix = n.mostrar_pix !== false;
  n.forma_pagamento = n.forma_pagamento || '';
  if (!Array.isArray(n.acrescimos)) n.acrescimos = parseNum(n.acrescimo) > 0 ? [{ nome: 'Acréscimo', valor: parseNum(n.acrescimo) }] : [];
  n.acrescimos = n.acrescimos.map((a) => ({ nome: (a && a.nome) || '', valor: parseNum(a && a.valor) }));
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
    tensao: p.tensao === '220' ? '220' : '127', empresa: {}, acrescimos: [], mostrar_pix: true, forma_pagamento: '',
    empresa_id: estado.escopo === 'empresa' && empresaAtiva() ? empresaAtiva().id : null, origem_id: null,
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
  const perfilAtual = perfilDoRegistro(o);
  const pixSelecionado = o.pix_id !== undefined ? o.pix_id : (perfilAtual.pix_padrao_id || '');
  const pixOpcoes = perfilAtual.pix_contas.length
    ? '<option value="" ' + (!pixSelecionado ? 'selected' : '') + '>Selecione um Pix</option>' +
      perfilAtual.pix_contas.map((c) => `<option value="${c.id}" ${pixSelecionado === c.id ? 'selected' : ''}>${esc(c.apelido)} • ${esc(obterBanco(c.banco).nome)}</option>`).join('')
    : '<option value="">Nenhum Pix cadastrado</option>';
  const num = (campo, rotulo) => entrada('campo', campo, rotulo, numParaInput(o[campo]), { modo: 'decimal', ph: '0' });
  const statusOpcoes = Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v.nome}</option>`).join('');

  conteudo.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div><div class="text-xs font-semibold text-slate-500">Orçamento nº ${esc(o.numero)}</div>
        <div id="sub-edicao" class="text-sm font-bold">${estado.novo ? 'Novo levantamento' : 'Editando orçamento'}</div></div>
      <button class="btn btn-sec" data-acao="descartar">✕ Fechar</button>
    </div>
    <div class="grade-lev space-y-4">
      <section class="cartao">
        <h2 class="titulo-sec">👤 Cliente</h2>
        <button class="btn btn-ghost w-full mb-3" data-acao="mesma-casa">🏠 Mesma casa / cliente já atendido</button>
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

      <details class="cartao span-todas" ${Object.values(o.empresa).some((v) => String(v || '').trim()) ? 'open' : ''}>
        <summary class="titulo-sec cursor-pointer" style="margin:0">🏢 Dados da empresa neste orçamento <span class="text-xs font-semibold text-slate-400">(opcional)</span></summary>
        <p class="text-xs text-slate-500 my-2">Preencha só o que quiser trocar neste orçamento. O que ficar vazio usa o perfil da empresa.</p>
        <div class="grid grid-cols-2 gap-3">
          ${entrada('emp', 'nome_comercial', 'Nome', o.empresa.nome_comercial || '', { cls: 'col-span-2', ph: perfilAtual.nome_comercial })}
          ${entrada('emp', 'cpf_cnpj', 'CPF / CNPJ', o.empresa.cpf_cnpj || '', { mask: 'doc', modo: 'numeric', ph: perfilAtual.cpf_cnpj })}
          ${entrada('emp', 'telefone', 'Telefone', o.empresa.telefone || '', { mask: 'tel', tipo: 'tel', modo: 'tel', ph: perfilAtual.telefone })}
          ${entrada('emp', 'email', 'E-mail', o.empresa.email || '', { tipo: 'email', modo: 'email', ph: perfilAtual.email })}
          ${entrada('emp', 'endereco', 'Endereço', o.empresa.endereco || '', { ph: perfilAtual.endereco })}
        </div>
        <div class="flex items-center gap-3 mt-3">
          ${(o.empresa.logo || perfilAtual.logo) ? `<img src="${o.empresa.logo || perfilAtual.logo}" alt="" class="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white">` : ''}
          <label class="btn btn-sec cursor-pointer">🖼️ Trocar logo<input id="arq-logo-orc" type="file" accept="image/*" class="hidden"></label>
          ${o.empresa.logo ? '<button class="btn btn-perigo" data-acao="limpar-logo-orc">Usar logo do perfil</button>' : ''}
        </div>
      </details>

      <section class="cartao">
        <h2 class="titulo-sec">🏪 Lojas da cotação</h2>
        <div class="space-y-2">
          ${o.lojas_nomes.map((nome, j) => `<div class="flex gap-2 items-end">${entrada('loja', j, `Loja ${j + 1}`, nome, { cls: 'flex-1' })}${o.lojas_nomes.length > 1 ? `<button class="btn btn-perigo" data-acao="rem-loja" data-j="${j}" aria-label="Remover loja ${j + 1}">🗑️</button>` : ''}</div>`).join('')}
        </div>
        <button class="btn btn-sec w-full mt-3" data-acao="add-loja">＋ Adicionar loja</button>
      </section>

      <section class="cartao span-todas">
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
          ${num('validade_dias', 'Validade (dias)')}
          <label class="block"><span class="rot">Status</span><select class="campo" data-campo="status">${statusOpcoes}</select></label>
          <label class="block"><span class="rot">Tensão da instalação</span><select class="campo" data-campo="tensao"><option value="127" ${o.tensao === '127' ? 'selected' : ''}>127 V</option><option value="220" ${o.tensao === '220' ? 'selected' : ''}>220 V</option></select></label>
          <label class="block"><span class="rot">Forma de pagamento</span><select class="campo" data-campo="forma_pagamento"><option value="">Não informar</option>${FORMAS_PGTO.map((f) => `<option ${o.forma_pagamento === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
          <label class="block col-span-2"><span class="rot">Pix do orçamento (QR Code do PDF)</span><select class="campo" data-campo="pix_id">${pixOpcoes}</select></label>
          <label class="col-span-2 flex items-center gap-3 min-h-[44px] text-sm font-semibold"><input type="checkbox" data-campo="mostrar_pix" ${o.mostrar_pix ? 'checked' : ''} style="width:22px;height:22px;accent-color:#F26B1D"> Mostrar o Pix (QR Code) no PDF</label>
        </div>
      </section>

      <section class="cartao">
        <h2 class="titulo-sec">➕ Acréscimos</h2>
        <div id="lista-acr" class="space-y-2">${htmlAcrescimos(o)}</div>
        <button class="btn btn-sec w-full mt-3" data-acao="add-acr">＋ Adicionar acréscimo</button>
        <p class="text-xs text-slate-500 mt-2">Ex.: gasolina, pedágio. Cada um com seu nome; a soma entra no total.</p>
      </section>

      <div class="barra-total span-todas">
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

function htmlAcrescimos(o) {
  if (!o.acrescimos.length) return '<p class="text-sm text-slate-400">Nenhum acréscimo.</p>';
  return o.acrescimos.map((a, i) => `<div class="flex gap-2 items-end">
    <label class="block flex-1"><span class="rot">Nome</span><input class="campo" data-acr="${i}" data-k="nome" type="text" placeholder="Ex.: Gasolina" value="${esc(a.nome)}" autocomplete="off"></label>
    <label class="block w-28"><span class="rot">Valor (R$)</span><input class="campo" data-acr="${i}" data-k="valor" type="text" inputmode="decimal" placeholder="0" value="${numParaInput(a.valor)}"></label>
    <button class="btn btn-perigo" data-acao="rem-acr" data-i="${i}" aria-label="Remover acréscimo ${i + 1}">🗑️</button></div>`).join('');
}

function abrirMesmaCasa() {
  const vistos = new Map();
  Store.listarOrcamentos().forEach((o) => {
    if (!(o.cliente_nome || '').trim()) return;
    const k = semAcentos(`${o.cliente_nome}|${o.cliente_endereco}|${o.cliente_cep}`).toLowerCase();
    if (!vistos.has(k)) vistos.set(k, o);
  });
  estado.clientesRef = [...vistos.values()];
  if (!estado.clientesRef.length) return aviso('Ainda não há clientes salvos.', true);
  abrirModal(`<h2 class="titulo-sec">🏠 Mesma casa / cliente já atendido</h2>
    ${estado.clientesRef.map((o, i) => `<button class="btn btn-sec w-full mb-2 py-2 h-auto" style="justify-content:flex-start;text-align:left" data-acao="usar-cliente" data-i="${i}">
      <span class="min-w-0"><b class="block truncate">${esc(o.cliente_nome)}</b><small class="block truncate text-slate-500 font-normal">${esc([o.cliente_endereco, o.cliente_bairro, o.cliente_cidade].filter(Boolean).join(' • ') || 'Sem endereço')}</small></span></button>`).join('')}
    <button class="btn btn-ghost w-full" data-acao="fechar-modal">Fechar</button>`);
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
  o.acrescimo = t.acrescimo;

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
  o[campo] = el.type === 'checkbox' ? el.checked : NUMERICOS_ORC.has(campo) ? parseNum(el.value) : el.value;
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
const SUBTITULOS = { equipe: 'Empresa compartilhada', empresa: 'Empresa (pessoal)', pixzap: 'Pix e WhatsApp (pessoal)', pixzap_emp: 'Pix e WhatsApp (empresa)', conta: 'Conta e sincronização' };

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
  if (estado.sub === 'equipe') return renderEquipe();
  if (estado.sub === 'empresa') return renderEmpresa();
  if (estado.sub === 'pixzap') return renderPixZap('pessoal');
  if (estado.sub === 'pixzap_emp') return renderPixZap('empresa');
  if (estado.sub === 'conta') return renderConta();
  const p = estado.perfil;
  conteudo.innerHTML = `<div class="space-y-3">
    ${itemMenu('empresa', '👤', 'Empresa (pessoal)', esc(p.nome_comercial) + (p.cpf_cnpj ? ' • ' + esc(p.cpf_cnpj) : ' • preencha o CNPJ/CPF'))}
    ${itemMenu('equipe', '👥', 'Empresa compartilhada', empresaAtiva() ? esc(empresaAtiva().nome) + ' • código ' + esc(empresaAtiva().codigo) : 'Criar ou entrar com código')}
    ${itemMenu('pixzap', '💳', 'Pix e WhatsApp (pessoal)', `${p.pix_contas.length} Pix • ${p.whatsapps.length} WhatsApp`)}
    ${itemMenu('conta', '☁️', 'Conta e sincronização', estado.user ? esc(estado.user.email || 'Conectado') : 'Sem conta (só neste aparelho)')}
    <p class="text-center text-xs text-slate-400 pt-3">DC Gestor 3.1</p></div>`;
}

// ---------- Formulário reutilizável de perfil (pessoal e empresa compartilhada) ----------
function htmlFormularioPerfil(attr, p, opts) {
  const pixOpcoes = p.pix_contas.length
    ? '<option value="" ' + (!p.pix_padrao_id ? 'selected' : '') + '>Nenhum (selecionar no orçamento)</option>' +
      p.pix_contas.map((c) => `<option value="${c.id}" ${p.pix_padrao_id === c.id ? 'selected' : ''}>${esc(c.apelido)} • ${esc(obterBanco(c.banco).nome)}</option>`).join('')
    : '<option value="">Cadastre um Pix primeiro</option>';
  const tensoes = ['127', '220', '380'].map((v) => `<option value="${v}" ${String(p.tensao) === v ? 'selected' : ''}>${v} V</option>`).join('');
  return `
      <section class="cartao">
        <h2 class="titulo-sec">🖼️ Identidade visual</h2>
        <div class="flex items-center gap-3">
          <div id="${opts.prevLogo}" class="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white grid place-items-center overflow-hidden shrink-0"></div>
          <div class="min-w-0">
            <input id="${opts.arqLogo}" type="file" accept="image/*" class="text-sm w-full">
            <p class="text-xs text-slate-500 mt-1">Aparece no cabeçalho dos PDFs. Sem logo próprio, usa o logo padrão do DC Gestor.</p>
            <button class="btn btn-sec mt-1 text-[13px]" data-acao="${opts.acaoRemoverLogo}">Usar logo padrão</button>
          </div>
        </div>
      </section>
      <section class="cartao">
        <h2 class="titulo-sec">👷 Profissional / empresa</h2>
        <div class="grid grid-cols-2 gap-3">
          ${entrada(attr, 'nome_comercial', 'Nome comercial', p.nome_comercial, { cls: 'col-span-2' })}
          ${entrada(attr, 'cpf_cnpj', 'CNPJ / CPF', p.cpf_cnpj, { mask: 'doc', modo: 'numeric' })}
          ${entrada(attr, 'telefone', 'Tel / WhatsApp', p.telefone, { mask: 'tel', tipo: 'tel', modo: 'tel', ph: '(14) 99999-9999' })}
          ${entrada(attr, 'email', 'E-mail comercial', p.email, { cls: 'col-span-2', tipo: 'email', modo: 'email' })}
          ${entrada(attr, 'endereco', 'Endereço', p.endereco, { cls: 'col-span-2' })}
        </div>
      </section>
      <section class="cartao">
        <h2 class="titulo-sec">📐 Parâmetros padrão</h2>
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="rot">Tensão</span><select class="campo" data-${attr}="tensao">${tensoes}</select></label>
          ${entrada(attr, 'concessionaria', 'Concessionária', p.concessionaria, { ph: 'Ex.: CPFL' })}
          <label class="block col-span-2"><span class="rot">Pix padrão dos orçamentos</span><select class="campo" data-${attr}="pix_padrao_id">${pixOpcoes}</select></label>
          ${entrada(attr, 'margem_padrao', 'Margem de lucro (%)', numParaInput(p.margem_padrao), { modo: 'decimal', ph: '0' })}
          ${entrada(attr, 'mao_de_obra_padrao', 'Mão de obra (R$)', numParaInput(p.mao_de_obra_padrao), { modo: 'decimal', ph: '0' })}
          ${entrada(attr, 'validade_dias', 'Validade do orçamento (dias)', numParaInput(p.validade_dias), { modo: 'numeric', ph: '7' })}
        </div>
      </section>
      <section class="cartao">
        <h2 class="titulo-sec">💬 Mensagem ao enviar orçamento</h2>
        <textarea class="campo" data-${attr}="whatsapp_mensagem" rows="4">${esc(p.whatsapp_mensagem)}</textarea>
        <p class="text-xs text-slate-500 mt-1">Use {cliente}, {obra}, {numero}, {total} e {validade}.</p>
      </section>
      <button class="btn btn-prim w-full" data-acao="${opts.acaoSalvar}">${opts.textoSalvar}</button>`;
}

// ---------- Empresa (pessoal) ----------
function renderEmpresa() {
  conteudo.innerHTML = `${botaoVoltar}
    <div class="space-y-4">
      ${htmlFormularioPerfil('perfil', estado.perfil, {
        prevLogo: 'prev-logo',
        arqLogo: 'arq-logo',
        acaoRemoverLogo: 'remover-logo',
        acaoSalvar: 'salvar-empresa',
        textoSalvar: '💾 Salvar empresa pessoal'
      })}
    </div>`;
  desenharLogo();
}

function desenharLogo() {
  const alvo = $('#prev-logo');
  if (!alvo) return;
  alvo.innerHTML = `<img src="${estado.perfil.logo || LOGO_EMPRESA}" alt="Logo" class="w-full h-full object-contain" onerror="this.replaceWith(document.createTextNode('Sem logo'))">`;
}

function desenharLogoEquipe() {
  const alvo = $('#prev-logo-eq');
  if (!alvo || !estado.perfilEmpresa) return;
  alvo.innerHTML = `<img src="${estado.perfilEmpresa.logo || LOGO_EMPRESA}" alt="Logo" class="w-full h-full object-contain" onerror="this.replaceWith(document.createTextNode('Sem logo'))">`;
}

function aoEditarPerfilAlvo(alvo, campo, el) {
  if (el.type === 'checkbox') alvo[campo] = el.checked;
  else alvo[campo] = NUMERICOS_PERFIL.has(campo) ? parseNum(el.value) : el.value;
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
function renderPixZap(escopoCfg = 'pessoal') {
  estado.pixZapEscopo = escopoCfg;
  const ehEmpresa = escopoCfg === 'empresa';
  const p = ehEmpresa ? Store.obterPerfilEmpresa() : estado.perfil;
  const voltarBtn = ehEmpresa ? '<button class="btn btn-sec mb-3" data-acao="sub" data-sub="equipe">← Voltar para Empresa</button>' : botaoVoltar;
  const linhasPix = p.pix_contas.map((c) => `
    <div class="cartao flex items-center gap-2 !p-3">
      <button class="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[48px]" data-acao="apresentar-cfg" data-tipo="pix" data-id="${c.id}">
        ${logoBancoHTML(c.banco)}
        <span class="min-w-0"><b class="block truncate">${esc(c.apelido)}${c.id === p.pix_padrao_id ? ' <span class="text-[10px] font-bold text-brand bg-brand-50 px-1.5 py-0.5 rounded-full align-middle">padrão</span>' : ''}</b>
          <span class="block text-xs text-slate-500 truncate">${esc(obterBanco(c.banco).nome)} • ${esc(c.titular)} • ${esc(chaveBonita(c))}</span></span></button>
      <button class="btn btn-sec" data-acao="edit-pix" data-id="${c.id}" aria-label="Editar Pix">✏️</button>
      <button class="btn btn-perigo" data-acao="del-pix" data-id="${c.id}" aria-label="Excluir Pix">🗑️</button></div>`).join('');
  const linhasZap = p.whatsapps.map((w) => `
    <div class="cartao flex items-center gap-2 !p-3">
      <button class="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[48px]" data-acao="apresentar-cfg" data-tipo="zap" data-id="${w.id}">
        ${logoZapHTML()}
        <span class="min-w-0"><b class="block truncate">${esc(w.apelido)}</b>
          <span class="block text-xs text-slate-500 truncate">${esc(w.nome)} • ${esc(mascTel(apenasDigitos(w.numero).replace(/^55(?=\d{10,11}$)/, '')))}</span></span></button>
      <button class="btn btn-sec" data-acao="edit-zap" data-id="${w.id}" aria-label="Editar WhatsApp">✏️</button>
      <button class="btn btn-perigo" data-acao="del-zap" data-id="${w.id}" aria-label="Excluir WhatsApp">🗑️</button></div>`).join('');
  conteudo.innerHTML = `${voltarBtn}
    <p class="text-sm text-slate-500 mb-4">${ehEmpresa ? 'Contas Pix e WhatsApp exclusivas da <b>empresa compartilhada</b>. Todos os membros da empresa veem e usam apenas estas contas.' : 'Contas Pix e WhatsApp exclusivas do seu <b>perfil pessoal</b> (privadas, não aparecem na empresa compartilhada).'}</p>
    <h2 class="titulo-sec">Pix (${p.pix_contas.length})</h2>
    <div class="space-y-2 mb-2">${linhasPix || '<p class="text-sm text-slate-400">Nenhum Pix cadastrado.</p>'}</div>
    <button class="btn btn-sec w-full mb-5" data-acao="add-pix">＋ Adicionar Pix</button>
    <h2 class="titulo-sec">WhatsApp (${p.whatsapps.length})</h2>
    <div class="space-y-2 mb-2">${linhasZap || '<p class="text-sm text-slate-400">Nenhum WhatsApp cadastrado.</p>'}</div>
    <button class="btn btn-sec w-full mb-5" data-acao="add-zap">＋ Adicionar WhatsApp</button>
    <button class="btn btn-prim w-full" data-acao="apresentar-cfg" data-tipo="" data-id="">👁️ Ver apresentação</button>`;
}

/** Grava o perfil já com as contas atualizadas e sincroniza (pessoal ou empresa compartilhada). */
function gravarPerfilPorEscopo(p, escopoCfg = 'pessoal') {
  if (escopoCfg === 'empresa') {
    Store.salvarPerfilEmpresa(p);
    estado.perfilEmpresa = Store.obterPerfilEmpresa();
  } else {
    Store.salvarPerfil(p);
    estado.perfil = Store.obterPerfil();
  }
  atualizarStatus();
  sincronizarAgora();
}

function gravarPerfil(p) {
  gravarPerfilPorEscopo(p, 'pessoal');
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
  const escopoCfg = estado.pixZapEscopo || 'pessoal';
  const p = Store.obterPerfilAtivo(escopoCfg);
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
  const escopoCfg = estado.pixZapEscopo || 'pessoal';
  const p = Store.obterPerfilAtivo(escopoCfg);
  if (f.id) p.pix_contas = p.pix_contas.map((c) => (c.id === f.id ? { ...f } : c));
  else { f.id = uuid(); p.pix_contas.push({ ...f }); }
  if (p.pix_padrao_id && !p.pix_contas.some((c) => c.id === p.pix_padrao_id)) p.pix_padrao_id = '';
  gravarPerfilPorEscopo(p, escopoCfg);
  fecharModal();
  renderConfig();
  aviso('Pix salvo.');
}

// ----- Formulário: Novo WhatsApp -----
function abrirFormZap(id) {
  const escopoCfg = estado.pixZapEscopo || 'pessoal';
  const p = Store.obterPerfilAtivo(escopoCfg);
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
  const escopoCfg = estado.pixZapEscopo || 'pessoal';
  const p = Store.obterPerfilAtivo(escopoCfg);
  if (f.id) p.whatsapps = p.whatsapps.map((w) => (w.id === f.id ? { ...f } : w));
  else { f.id = uuid(); p.whatsapps.push({ ...f }); }
  gravarPerfilPorEscopo(p, escopoCfg);
  fecharModal();
  renderConfig();
  aviso('WhatsApp salvo.');
}

function excluirConta(tipo, id) {
  if (!confirm(tipo === 'pix' ? 'Excluir este Pix?' : 'Excluir este WhatsApp?')) return;
  const escopoCfg = estado.pixZapEscopo || 'pessoal';
  const p = Store.obterPerfilAtivo(escopoCfg);
  if (tipo === 'pix') {
    p.pix_contas = p.pix_contas.filter((c) => c.id !== id);
    if (p.pix_padrao_id === id) p.pix_padrao_id = '';
  } else {
    p.whatsapps = p.whatsapps.filter((w) => w.id !== id);
  }
  gravarPerfilPorEscopo(p, escopoCfg);
  renderConfig();
}

// ---------- Apresentação (cartão com QR para mostrar ao cliente) ----------
function abrirApresentacao(tipo, id, escopoForcado = null) {
  const p = Store.obterPerfilAtivo(escopoForcado || estado.escopo);
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
  }
  gravarPerfil(p);
  estado.onb = null;
  fecharModal();
  render();
  aviso('Tudo pronto! ✔');
}

// =============================== Eventos globais ===============================
// =============================== 3.0 (Etapa 2): empresa compartilhada, notas e clientes ===============================
const CAMPOS_CLIENTE = ['cliente_nome', 'cliente_telefone', 'cliente_email', 'cliente_documento', 'cliente_endereco', 'cliente_cep', 'cliente_bairro', 'cliente_cidade', 'cliente_estado'];
const semMarcas = (o) => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(o))).filter(([k]) => !k.startsWith('_')));
const armazem = (tipo) => (tipo === 'nota'
  ? { obter: Store.obterNota, listar: Store.listarNotas, salvar: Store.salvarNota, proximo: Store.proximoNumeroNota }
  : { obter: Store.obterOrcamento, listar: Store.listarOrcamentos, salvar: Store.salvarOrcamento, proximo: Store.proximoNumero });
const empresaAtiva = () => (estado.user ? Store.obterEmpresa() : null);

// ---------- Clientes salvos ----------
function listaClientes() {
  const vistos = new Map();
  [...Store.listarOrcamentos(), ...Store.listarNotas()].forEach((o) => {
    if (!(o.cliente_nome || '').trim()) return;
    const k = semAcentos(`${o.cliente_nome}|${o.cliente_endereco}|${o.cliente_cep}`).toLowerCase();
    if (!vistos.has(k)) vistos.set(k, o);
  });
  return [...vistos.values()].sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR'));
}
const resumoCliente = (o) => esc([o.cliente_endereco, o.cliente_bairro, o.cliente_cidade].filter(Boolean).join(' • ') || 'Sem endereço');

function abrirClientes() {
  estado.clientesRef = listaClientes();
  if (!estado.clientesRef.length) return aviso('Ainda não há clientes salvos.', true);
  abrirModal(`<h2 class="titulo-sec">👥 Clientes salvos</h2>
    ${estado.clientesRef.map((o, i) => `<div class="cartao mb-2"><b class="block truncate">${esc(o.cliente_nome)}</b><small class="block truncate text-slate-500">${resumoCliente(o)}</small>
      <div class="grid grid-cols-2 gap-2 mt-2"><button class="btn btn-ghost" data-acao="cli-orc" data-i="${i}">📝 Orçamento</button><button class="btn btn-ghost" data-acao="cli-nota" data-i="${i}">🧾 Nota</button></div></div>`).join('')}
    <button class="btn btn-ghost w-full" data-acao="fechar-modal">Fechar</button>`);
}

// ---------- Cópia entre pessoal e empresa ----------
function copiarParaEmpresa(tipo, id) {
  const emp = empresaAtiva();
  const a = armazem(tipo);
  const o = a.obter(id);
  if (!emp || !o) return aviso('Entre em uma empresa para compartilhar (Configurações > Empresa compartilhada).', true);
  const existente = a.listar('empresa').find((x) => x.origem_id === o.id);
  if (existente && !confirm('Já existe uma cópia na empresa. Atualizar a cópia da empresa com o que está aqui?')) return;
  a.salvar({ ...semMarcas(o), id: existente ? existente.id : uuid(), numero: existente ? existente.numero : a.proximo(), created_at: existente ? existente.created_at : undefined, empresa_id: emp.id, origem_id: o.id });
  aviso(existente ? 'Cópia da empresa atualizada ✔' : 'Cópia enviada para a empresa ✔');
  desenharLista();
  atualizarStatus();
  sincronizarAgora();
}
function atualizarOriginal(tipo, id) {
  const a = armazem(tipo);
  const o = a.obter(id);
  const orig = o && o.origem_id ? a.obter(o.origem_id) : null;
  if (!orig) return aviso('O seu original não está mais neste aparelho.', true);
  if (!confirm('Atualizar o seu original (pessoal) com o que está nesta cópia da empresa?')) return;
  a.salvar({ ...semMarcas(o), id: orig.id, numero: orig.numero, created_at: orig.created_at, empresa_id: orig.empresa_id || null, origem_id: orig.origem_id || null });
  aviso('Seu original foi atualizado ✔');
  desenharLista();
  atualizarStatus();
  sincronizarAgora();
}
function linhaExtra(tipo, o) {
  const a = armazem(tipo);
  const bt = [];
  if (tipo === 'orc') bt.push(`<button class="btn btn-sec px-1 text-[13px]" data-acao="gerar-nota" data-id="${o.id}">🧾 Gerar nota</button>`);
  if (empresaAtiva() && !o.empresa_id) bt.push(`<button class="btn btn-sec px-1 text-[13px]" data-acao="copiar-empresa" data-tipo="${tipo}" data-id="${o.id}">🏢 Enviar p/ empresa</button>`);
  if (o.empresa_id && o.origem_id && a.obter(o.origem_id)) bt.push(`<button class="btn btn-sec px-1 text-[13px]" data-acao="atualizar-original" data-tipo="${tipo}" data-id="${o.id}">⬆️ Atualizar meu original</button>`);
  return bt.length ? `<div class="grid ${bt.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mt-2">${bt.join('')}</div>` : '';
}

// ---------- Nota de serviço ----------
function novaNota() {
  const p = Store.obterPerfil();
  const emp = estado.escopo === 'empresa' ? empresaAtiva() : null;
  return {
    id: uuid(), numero: Store.proximoNumeroNota(), empresa_id: emp ? emp.id : null, origem_id: null, orcamento_id: null,
    ...Object.fromEntries(CAMPOS_CLIENTE.map((c) => [c, ''])),
    obra_nome: '', itens: [{ descricao: '', qtd: 1, valor: 0 }], desconto: 0, valor_total: 0, forma_pagamento: '', observacoes: '',
    empresa: {}, doc_tipo: apenasDigitos(p.cpf_cnpj).length === 11 ? 'CPF' : 'CNPJ', emitido_em: hojeISO()
  };
}
function notaDeOrcamento(o) {
  const t = calcularTotais(o);
  const itens = (o.itens || []).filter((i) => (i.descricao || '').trim() && parseNum(i.qtd) > 0)
    .map((i) => ({ descricao: i.descricao, qtd: parseNum(i.qtd), valor: vendaUnitaria(i, o.margem_lucro) }));
  if (t.maoDeObra > 0) itens.push({ descricao: 'Mão de obra', qtd: 1, valor: t.maoDeObra });
  (o.acrescimos || []).filter((x) => parseNum(x.valor) > 0).forEach((x) => itens.push({ descricao: x.nome || 'Acréscimo', qtd: 1, valor: parseNum(x.valor) }));
  return {
    ...novaNota(), empresa_id: o.empresa_id || null, orcamento_id: o.id,
    ...Object.fromEntries(CAMPOS_CLIENTE.map((c) => [c, o[c] || ''])),
    obra_nome: o.obra_nome || '', itens: itens.length ? itens : [{ descricao: '', qtd: 1, valor: 0 }], desconto: t.desconto,
    forma_pagamento: o.forma_pagamento || '', observacoes: o.observacoes || '', empresa: { ...(o.empresa || {}) }
  };
}
function totalNota() {
  const el = $('#nt-total');
  if (el && estado.nota) el.textContent = brl(PDF.calcularTotaisNota(estado.nota).total);
}
function renderModalNota() {
  const n = estado.nota;
  const rolagem = ($('#modal .modal') || {}).scrollTop || 0;
  const campo = (c, rot, o = {}) => entrada('nt', c, rot, n[c] || '', o);
  const formas = ['', ...FORMAS_PGTO];
  if (n.forma_pagamento && !formas.includes(n.forma_pagamento)) formas.push(n.forma_pagamento);
  abrirModal(`<h2 class="titulo-sec">🧾 Nota de serviço nº ${esc(n.numero)}${n.empresa_id ? ' <span class="text-xs font-semibold text-slate-400">(empresa)</span>' : ''}</h2>
    <p class="text-xs text-slate-500 mb-3">Recibo / nota de serviço interna, sem validade fiscal. Os dados da sua empresa vêm do perfil.</p>
    <div class="grid grid-cols-2 gap-2">
      <label class="block"><span class="rot">Documento da empresa</span><select class="campo" data-nt="doc_tipo"><option value="CNPJ" ${n.doc_tipo !== 'CPF' ? 'selected' : ''}>CNPJ</option><option value="CPF" ${n.doc_tipo === 'CPF' ? 'selected' : ''}>CPF</option></select></label>
      <label class="block"><span class="rot">Data de emissão</span><input class="campo" type="date" data-nt="emitido_em" value="${esc(n.emitido_em)}"></label>
      <button class="btn btn-ghost col-span-2" data-acao="nt-cliente">🏠 Usar cliente salvo</button>
      ${campo('cliente_nome', 'Cliente *', { cls: 'col-span-2', auto: 'name' })}
      ${campo('cliente_telefone', 'Telefone', { mask: 'tel', tipo: 'tel', modo: 'tel' })}
      ${campo('cliente_documento', 'CPF / CNPJ', { mask: 'doc', modo: 'numeric' })}
      ${campo('cliente_endereco', 'Endereço', { cls: 'col-span-2' })}
      ${campo('cliente_bairro', 'Bairro')}
      ${campo('cliente_cep', 'CEP', { mask: 'cep', modo: 'numeric' })}
      ${campo('cliente_cidade', 'Cidade')}
      ${campo('cliente_estado', 'Estado')}
      ${campo('obra_nome', 'Obra / serviço', { cls: 'col-span-2' })}
    </div>
    <h3 class="titulo-sec mt-4">Serviços e materiais</h3>
    ${n.itens.map((it, i) => `<div class="cartao mb-2 !p-2"><div class="flex gap-2 items-end">
        <label class="block flex-1 min-w-0"><span class="rot">Descrição</span><input class="campo" data-nti="${i}" data-ntk="descricao" value="${esc(it.descricao)}"></label>
        <button class="btn btn-perigo shrink-0" data-acao="nt-rem-item" data-i="${i}" aria-label="Remover item">✕</button></div>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <label class="block"><span class="rot">Quantidade</span><input class="campo" inputmode="decimal" data-nti="${i}" data-ntk="qtd" value="${esc(numParaInput(it.qtd))}"></label>
        <label class="block"><span class="rot">Valor unitário (R$)</span><input class="campo" inputmode="decimal" data-nti="${i}" data-ntk="valor" value="${esc(numParaInput(it.valor))}"></label></div></div>`).join('')}
    <button class="btn btn-sec w-full mb-3" data-acao="nt-add-item">＋ Adicionar item</button>
    <div class="grid grid-cols-2 gap-2">
      ${campo('desconto', 'Desconto (R$)', { modo: 'decimal' }).replace(`value="${esc(n.desconto || '')}"`, `value="${esc(numParaInput(n.desconto))}"`)}
      <label class="block"><span class="rot">Forma de pagamento</span><select class="campo" data-nt="forma_pagamento">${formas.map((f) => `<option value="${esc(f)}" ${f === n.forma_pagamento ? 'selected' : ''}>${f || 'Não informar'}</option>`).join('')}</select></label>
      <label class="block col-span-2"><span class="rot">Observações</span><textarea class="campo" data-nt="observacoes">${esc(n.observacoes)}</textarea></label>
    </div>
    <div class="flex justify-between items-center my-3 p-3 rounded-xl bg-marinho text-white"><span class="font-semibold">TOTAL</span><b id="nt-total" class="text-lg">${brl(PDF.calcularTotaisNota(n).total)}</b></div>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-prim" data-acao="nota-salvar">💾 Salvar</button>
      <button class="btn btn-sec" data-acao="nota-salvar-pdf">📄 Salvar e baixar PDF</button>
      <button class="btn btn-ghost col-span-2" data-acao="fechar-modal">Cancelar</button>
    </div>`);
  const m = $('#modal .modal');
  if (m) m.scrollTop = rolagem;
}
function abrirNota(n) {
  estado.nota = n;
  renderModalNota();
}
function salvarNotaAtual() {
  const n = estado.nota;
  if (!n) return false;
  if (!(n.cliente_nome || '').trim()) { aviso('Informe o nome do cliente.', true); return false; }
  const itens = n.itens.filter((i) => (i.descricao || '').trim() || parseNum(i.valor) > 0);
  if (!itens.length) { aviso('Adicione ao menos um item.', true); return false; }
  n.itens = itens;
  n.valor_total = PDF.calcularTotaisNota(n).total;
  Store.salvarNota(n);
  atualizarStatus();
  sincronizarAgora();
  return true;
}
function desenharNotas() {
  const alvo = $('#lista-obras');
  if (!alvo) return;
  const termo = semAcentos(estado.busca).toLowerCase().trim();
  const lista = Store.listarNotas(estado.escopo).filter((n) => !termo || semAcentos(`${n.cliente_nome} ${n.obra_nome} ${n.numero}`).toLowerCase().includes(termo));
  if (!lista.length) {
    alvo.innerHTML = `<div class="cartao text-center py-10"><div class="text-4xl mb-2">🧾</div><p class="font-bold">Nenhuma nota de serviço</p>
      <p class="text-sm text-slate-500 mt-1 mb-4">Crie uma nota do zero ou use o botão "Gerar nota" em um orçamento.</p>
      <button class="btn btn-prim" data-acao="nota-nova">＋ Nova nota</button></div>`;
    return;
  }
  alvo.innerHTML = lista.map((n) => `<article class="cartao">
      <div class="flex justify-between gap-3"><div class="min-w-0">
        <div class="font-extrabold truncate">${esc(n.cliente_nome || 'Sem nome')}</div>
        <div class="text-sm text-slate-500 truncate">${esc(n.obra_nome)}</div>
        <div class="text-xs text-slate-400 mt-1">Nota nº ${esc(n.numero)} • ${fmtData(n.emitido_em)}${n._sync === 'pendente' ? ' • ⏳ não sincronizado' : ''}</div></div>
        <div class="font-extrabold text-brand shrink-0">${brl(n.valor_total)}</div></div>
      <div class="grid grid-cols-4 gap-2 mt-3">
        <button class="btn btn-ghost px-1 text-[13px]" data-acao="nota-editar" data-id="${n.id}">✏️ Editar</button>
        <button class="btn btn-ghost px-1 text-[13px]" data-acao="nota-baixar" data-id="${n.id}">📄 PDF</button>
        <button class="btn btn-ghost px-1 text-[13px]" data-acao="nota-enviar" data-id="${n.id}">💬 Enviar</button>
        <button class="btn btn-perigo px-1" data-acao="nota-excluir" data-id="${n.id}" aria-label="Excluir nota">🗑️</button></div>
      ${linhaExtra('nota', n)}</article>`).join('');
}
async function enviarNota(id) {
  const n = Store.obterNota(id);
  if (!n) return;
  const texto = `Olá, ${n.cliente_nome || 'cliente'}! Segue a nota de serviço nº ${n.numero} no valor de ${brl(PDF.calcularTotaisNota(n).total)}.`;
  aviso('Preparando o PDF…');
  const compartilhou = await PDF.compartilharNotaPDF(n, perfilDoRegistro(n), texto);
  if (!compartilhou) {
    const tel = apenasDigitos(n.cliente_telefone);
    const numero = tel ? (tel.startsWith('55') && tel.length > 11 ? tel : '55' + tel) : '';
    abrirModal(`<h2 class="titulo-sec">💬 PDF baixado</h2>
      <p class="text-sm text-slate-600 mb-4">O PDF foi salvo no aparelho. Abra a conversa no WhatsApp e anexe o arquivo.</p>
      <a class="btn btn-prim w-full mb-2" target="_blank" rel="noopener" href="https://wa.me/${numero}?text=${encodeURIComponent(texto)}">Abrir WhatsApp</a>
      <button class="btn btn-sec w-full" data-acao="fechar-modal">Fechar</button>`);
  }
}

// ---------- Empresa compartilhada (tela em Configurações) ----------
function renderEquipe() {
  const emp = empresaAtiva();
  if (!estado.user) {
    conteudo.innerHTML = `${botaoVoltar}<section class="cartao"><h2 class="titulo-sec">👥 Empresa compartilhada</h2>
      <p class="text-sm text-slate-600">Entre com uma conta (Configurações > Conta) para criar ou entrar em uma empresa.</p></section>`;
    return;
  }
  if (!emp) {
    conteudo.innerHTML = `${botaoVoltar}<div class="space-y-3">
      <section class="cartao"><h2 class="titulo-sec">🏢 Criar empresa</h2>
        <p class="text-sm text-slate-600 mb-3">Você vira o dono e recebe um código para convidar outras pessoas. Orçamentos, notas e clientes ficam compartilhados.</p>
        ${entrada('eq', 'nome', 'Nome da empresa', estado.eq.nome)}
        <button class="btn btn-prim w-full mt-3" data-acao="eq-criar">Criar empresa</button></section>
      <section class="cartao"><h2 class="titulo-sec">🔑 Entrar com código</h2>
        ${entrada('eq', 'codigo', 'Código de convite', estado.eq.codigo)}
        <button class="btn btn-sec w-full mt-3" data-acao="eq-entrar">Entrar na empresa</button></section></div>`;
    return;
  }
  const dono = emp.papel === 'dono';
  estado.perfilEmpresa = Store.obterPerfilEmpresa();
  conteudo.innerHTML = `${botaoVoltar}<div class="space-y-4">
    <section class="cartao"><h2 class="titulo-sec">🏢 ${esc(emp.nome)}</h2>
      <p class="text-sm text-slate-600 mb-3">Você é <b>${dono ? 'o dono' : 'membro'}</b>. Os dados abaixo são exclusivos desta empresa compartilhada e não alteram seu perfil pessoal.</p>
      <span class="rot">Código de convite</span>
      <div class="flex gap-2 items-center"><b class="text-2xl tracking-widest flex-1">${esc(emp.codigo)}</b><button class="btn btn-sec" data-acao="eq-copiar">Copiar</button></div></section>
    ${itemMenu('pixzap_emp', '💳', 'Pix e WhatsApp da empresa', `${estado.perfilEmpresa.pix_contas.length} Pix • ${estado.perfilEmpresa.whatsapps.length} WhatsApp`)}
    ${htmlFormularioPerfil('eqperfil', estado.perfilEmpresa, {
      prevLogo: 'prev-logo-eq',
      arqLogo: 'arq-logo-eq',
      acaoRemoverLogo: 'eq-remover-logo',
      acaoSalvar: 'eq-salvar-perfil',
      textoSalvar: '💾 Salvar dados da empresa compartilhada'
    })}
    <section class="cartao"><h2 class="titulo-sec">👥 Membros</h2><div id="lista-membros" class="text-sm text-slate-500">Carregando…</div></section>
    <button class="btn btn-perigo w-full" data-acao="${dono ? 'eq-excluir' : 'eq-sair'}">${dono ? 'Excluir empresa' : 'Sair da empresa'}</button></div>`;
  desenharLogoEquipe();
  Equipe.listarMembros(emp.id).then((lista) => {
    const el = $('#lista-membros');
    if (!el) return;
    el.innerHTML = lista.map((m) => `<div class="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
      <span class="flex-1 min-w-0 truncate text-slate-700">${esc(m.email || 'Sem e-mail')} <small class="text-slate-400">${m.papel === 'dono' ? '• dono' : ''}</small></span>
      ${dono && m.papel !== 'dono' ? `<button class="btn btn-perigo" data-acao="eq-remover" data-uid="${m.user_id}">Remover</button>` : ''}</div>`).join('') || 'Sem membros.';
  }).catch(() => { const el = $('#lista-membros'); if (el) el.textContent = 'Conecte-se à internet para ver os membros.'; });
}
async function mudarEmpresa(fazer, msg) {
  try {
    await fazer();
    if (msg) aviso(msg);
    await sincronizarAgora();
  } catch (e) {
    aviso((e && e.message) || 'Não foi possível concluir.', true);
  }
  estado.escopo = empresaAtiva() ? estado.escopo : 'pessoal';
  render();
}

function acoesNovas(d) {
  switch (d.acao) {
    case 'escopo': estado.escopo = d.v; renderObras(); return true;
    case 'modo-lista': estado.lista = d.v; renderObras(); return true;
    case 'clientes': abrirClientes(); return true;
    case 'cli-orc': {
      const ref = (estado.clientesRef || [])[Number(d.i)];
      if (!ref) return true;
      clearTimeout(estado.timerAuto);
      salvarSeTemConteudo();
      const o = novoOrcamento();
      CAMPOS_CLIENTE.forEach((c) => { o[c] = ref[c] || ''; });
      estado.rascunho = o;
      estado.novo = true;
      fecharModal();
      estado.aba = 'levantamento';
      estado.sub = null;
      render();
      window.scrollTo(0, 0);
      agendarAutoSalvar();
      return true;
    }
    case 'cli-nota': {
      const ref = (estado.clientesRef || [])[Number(d.i)];
      if (!ref) return true;
      const n = novaNota();
      CAMPOS_CLIENTE.forEach((c) => { n[c] = ref[c] || ''; });
      abrirNota(n);
      return true;
    }
    case 'nt-cliente': {
      estado.clientesRef = listaClientes();
      if (!estado.clientesRef.length) { aviso('Ainda não há clientes salvos.', true); return true; }
      abrirModal(`<h2 class="titulo-sec">🏠 Escolha o cliente</h2>
        ${estado.clientesRef.map((o, i) => `<button class="btn btn-sec w-full mb-2 py-2 h-auto" style="justify-content:flex-start;text-align:left" data-acao="nt-usar-cliente" data-i="${i}"><span class="min-w-0"><b class="block truncate">${esc(o.cliente_nome)}</b><small class="block truncate text-slate-500 font-normal">${resumoCliente(o)}</small></span></button>`).join('')}
        <button class="btn btn-ghost w-full" data-acao="nt-voltar">Voltar para a nota</button>`);
      return true;
    }
    case 'nt-usar-cliente': {
      const ref = (estado.clientesRef || [])[Number(d.i)];
      if (ref && estado.nota) CAMPOS_CLIENTE.forEach((c) => { estado.nota[c] = ref[c] || ''; });
      renderModalNota();
      return true;
    }
    case 'nt-voltar': renderModalNota(); return true;
    case 'nt-add-item': estado.nota.itens.push({ descricao: '', qtd: 1, valor: 0 }); renderModalNota(); return true;
    case 'nt-rem-item':
      estado.nota.itens.splice(Number(d.i), 1);
      if (!estado.nota.itens.length) estado.nota.itens.push({ descricao: '', qtd: 1, valor: 0 });
      renderModalNota();
      return true;
    case 'gerar-nota': {
      const o = Store.obterOrcamento(d.id);
      if (!o) return true;
      const ja = Store.listarNotas().find((n) => n.orcamento_id === o.id);
      abrirNota(ja ? { ...semMarcas(ja) } : notaDeOrcamento(o));
      if (ja) aviso('Já existe uma nota deste orçamento. Abrindo para editar.');
      return true;
    }
    case 'nota-nova': abrirNota(novaNota()); return true;
    case 'nota-editar': { const n = Store.obterNota(d.id); if (n) abrirNota(semMarcas(n)); return true; }
    case 'nota-salvar':
      if (salvarNotaAtual()) { fecharModal(); estado.nota = null; if (estado.aba === 'obras') desenharLista(); aviso('Nota salva ✔'); }
      return true;
    case 'nota-salvar-pdf':
      if (salvarNotaAtual()) {
        const n = estado.nota;
        fecharModal();
        estado.nota = null;
        if (estado.aba === 'obras') desenharLista();
        aviso('Gerando PDF…');
        PDF.baixarNotaPDF(n, perfilDoRegistro(n)).catch((e) => aviso(e.message || 'Não foi possível gerar o PDF.', true));
      }
      return true;
    case 'nota-baixar': {
      const n = Store.obterNota(d.id);
      if (n) { aviso('Gerando PDF…'); PDF.baixarNotaPDF(n, perfilDoRegistro(n)).catch((e) => aviso(e.message || 'Não foi possível gerar o PDF.', true)); }
      return true;
    }
    case 'nota-enviar': enviarNota(d.id).catch((e) => aviso(e.message || 'Não foi possível preparar o PDF.', true)); return true;
    case 'nota-excluir':
      if (confirm('Excluir esta nota de serviço?')) { Store.excluirNota(d.id); desenharLista(); atualizarStatus(); sincronizarAgora(); }
      return true;
    case 'copiar-empresa': copiarParaEmpresa(d.tipo, d.id); return true;
    case 'atualizar-original': atualizarOriginal(d.tipo, d.id); return true;
    case 'eq-criar': mudarEmpresa(async () => Store.definirEmpresa(await Equipe.criarEmpresa(estado.eq.nome)), 'Empresa criada ✔'); return true;
    case 'eq-entrar': mudarEmpresa(async () => Store.definirEmpresa(await Equipe.entrarEmpresa(estado.eq.codigo)), 'Você entrou na empresa ✔'); return true;
    case 'eq-copiar': copiarTexto(empresaAtiva().codigo); aviso('Código copiado'); return true;
    case 'eq-sair':
      if (confirm('Sair da empresa? Você deixa de ver os orçamentos e notas dela (os seus pessoais continuam).')) {
        mudarEmpresa(async () => { await sincronizarAgora(); await Equipe.sairEmpresa(); Store.definirEmpresa(null); }, 'Você saiu da empresa.');
      }
      return true;
    case 'eq-excluir':
      if (confirm('Excluir a empresa para todos? Os orçamentos e notas continuam com quem os criou, mas deixam de ser compartilhados.')) {
        mudarEmpresa(async () => { await sincronizarAgora(); await Equipe.excluirEmpresa(empresaAtiva().id); Store.definirEmpresa(null); }, 'Empresa excluída.');
      }
      return true;
    case 'eq-remover':
      if (confirm('Remover esta pessoa da empresa?')) mudarEmpresa(() => Equipe.removerMembro(empresaAtiva().id, d.uid), 'Membro removido.');
      return true;
    case 'eq-remover-logo':
      if (estado.perfilEmpresa) { estado.perfilEmpresa.logo = ''; desenharLogoEquipe(); }
      return true;
    case 'eq-salvar-perfil': {
      if (!estado.perfilEmpresa) return true;
      if (!(estado.perfilEmpresa.nome_comercial || '').trim()) { aviso('Informe o nome comercial da empresa.', true); return true; }
      const atualEmp = Store.obterPerfilEmpresa();
      estado.perfilEmpresa.pix_contas = atualEmp.pix_contas;
      estado.perfilEmpresa.whatsapps = atualEmp.whatsapps;
      Store.salvarPerfilEmpresa(estado.perfilEmpresa);
      atualizarStatus();
      sincronizarAgora();
      aviso('Dados da empresa compartilhada salvos ✔');
      renderConfig();
      return true;
    }
    default: return false;
  }
}

async function aoClicar(ev) {
  if (ev.target.id === 'modal') return fecharModal();
  const alvo = ev.target.closest('[data-acao]');
  if (!alvo) return;
  const d = alvo.dataset;
  if (acoesNovas(d)) return;
  switch (d.acao) {
    case 'aba': return irPara(d.aba);
    case 'novo':
      salvarSeTemConteudo();
      estado.rascunho = null;
      limparRascunhoTemp();
      return irPara('levantamento');
    case 'filtro': estado.filtro = d.filtro; return renderObras();
    case 'editar': return abrirParaEditar(d.id);
    case 'mesma-casa': return abrirMesmaCasa();
    case 'usar-cliente': {
      const ref = (estado.clientesRef || [])[Number(d.i)];
      if (ref && estado.rascunho) {
        ['cliente_nome', 'cliente_telefone', 'cliente_email', 'cliente_documento', 'cliente_endereco', 'cliente_cep', 'cliente_bairro', 'cliente_cidade', 'cliente_estado']
          .forEach((c) => { estado.rascunho[c] = ref[c] || ''; });
        fecharModal();
        renderLevantamento();
        agendarAutoSalvar();
      }
      return;
    }
    case 'add-acr':
      estado.rascunho.acrescimos.push({ nome: '', valor: 0 });
      $('#lista-acr').innerHTML = htmlAcrescimos(estado.rascunho);
      return;
    case 'rem-acr':
      estado.rascunho.acrescimos.splice(Number(d.i), 1);
      $('#lista-acr').innerHTML = htmlAcrescimos(estado.rascunho);
      return atualizarCalculos();
    case 'limpar-logo-orc':
      estado.rascunho.empresa.logo = '';
      renderLevantamento();
      return agendarAutoSalvar();
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
        await PDF.baixarPDF(estado.rascunho, perfilDoRegistro(estado.rascunho));
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
    case 'apresentar-cfg': return abrirApresentacao(d.tipo, d.id, estado.pixZapEscopo || 'pessoal');
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
  if (el.dataset.nti !== undefined && estado.nota) {
    const it = estado.nota.itens[Number(el.dataset.nti)];
    if (it) { it[el.dataset.ntk] = el.dataset.ntk === 'descricao' ? el.value : parseNum(el.value); totalNota(); }
  } else if (el.dataset.nt !== undefined && estado.nota) {
    const c = el.dataset.nt;
    estado.nota[c] = c === 'desconto' ? parseNum(el.value) : el.value;
    totalNota();
  } else if (el.dataset.eq !== undefined) {
    estado.eq[el.dataset.eq] = el.dataset.eq === 'codigo' ? el.value.toUpperCase() : el.value;
  }
  else if (el.dataset.campo !== undefined && estado.rascunho) aoEditarCampo(el);
  else if (el.dataset.item !== undefined && estado.rascunho) aoEditarItem(el);
  else if (el.dataset.loja !== undefined && estado.rascunho) aoEditarLoja(el);
  else if (el.dataset.emp !== undefined && estado.rascunho) { estado.rascunho.empresa[el.dataset.emp] = el.value; atualizarCalculos(); }
  else if (el.dataset.acr !== undefined && estado.rascunho) {
    const a = estado.rascunho.acrescimos[Number(el.dataset.acr)];
    if (a) { a[el.dataset.k] = el.dataset.k === 'valor' ? parseNum(el.value) : el.value; atualizarCalculos(); }
  }
  else if (el.dataset.perfil !== undefined && estado.perfil) aoEditarPerfilAlvo(estado.perfil, el.dataset.perfil, el);
  else if (el.dataset.eqperfil !== undefined && estado.perfilEmpresa) aoEditarPerfilAlvo(estado.perfilEmpresa, el.dataset.eqperfil, el);
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
  if (!ev.target.files || !ev.target.files[0]) return;
  if (ev.target.id === 'arq-logo-orc' && estado.rascunho) {
    try {
      estado.rascunho.empresa.logo = await lerLogo(ev.target.files[0]);
      renderLevantamento();
      agendarAutoSalvar();
    } catch (e) {
      aviso(e.message, true);
    }
    return;
  }
  if (ev.target.id === 'arq-logo-eq' && estado.perfilEmpresa) {
    try {
      estado.perfilEmpresa.logo = await lerLogo(ev.target.files[0]);
      desenharLogoEquipe();
    } catch (e) {
      aviso(e.message, true);
    }
    return;
  }
  if (ev.target.id !== 'arq-logo') return;
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