// Motor offline-first: tudo grava no localStorage e sincroniza com o Supabase quando há sinal.
import { hojeISO } from './utils.js';
import { buscarMinhaEmpresa, salvarPerfilEmpresaRemoto } from './equipe.js';

const K = { orcamentos: 'dcg:orcamentos', perfil: 'dcg:perfil', notas: 'dcg:notas', empresa: 'dcg:empresa' };

export const CAMPOS_ORC = [
  'id', 'numero', 'status', 'cliente_nome', 'cliente_telefone', 'cliente_email', 'cliente_documento',
  'cliente_endereco', 'cliente_cep', 'cliente_bairro', 'cliente_cidade', 'cliente_estado',
  'obra_nome', 'observacoes', 'itens', 'lojas_nomes', 'margem_lucro', 'mao_de_obra', 'desconto',
  'acrescimo', 'tensao', 'empresa', 'acrescimos', 'mostrar_pix', 'forma_pagamento', 'pix_id', 'valor_total', 'validade_dias', 'emitido_em', 'created_at', 'updated_at',
  'empresa_id', 'origem_id'
];
export const CAMPOS_NOTA = [
  'id', 'empresa_id', 'origem_id', 'orcamento_id', 'numero', 'cliente_nome', 'cliente_telefone', 'cliente_email',
  'cliente_documento', 'cliente_endereco', 'cliente_cep', 'cliente_bairro', 'cliente_cidade', 'cliente_estado',
  'obra_nome', 'itens', 'desconto', 'valor_total', 'forma_pagamento', 'observacoes', 'empresa', 'doc_tipo',
  'emitido_em', 'created_at', 'updated_at'
];
export const CAMPOS_PERFIL = [
  'nome_comercial', 'cpf_cnpj', 'telefone', 'email', 'endereco', 'logo', 'tensao', 'concessionaria',
  'margem_padrao', 'mao_de_obra_padrao', 'validade_dias', 'pix_padrao_id', 'pix_contas', 'whatsapps',
  'whatsapp_mensagem', 'updated_at'
];

export const PERFIL_PADRAO = {
  nome_comercial: '',
  cpf_cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  logo: '',
  tensao: '127',
  concessionaria: '',
  margem_padrao: 0,
  mao_de_obra_padrao: 0,
  validade_dias: 7,
  pix_padrao_id: '',
  pix_contas: [],
  whatsapps: [],
  whatsapp_mensagem:
    'Olá, {cliente}! Segue o orçamento nº {numero} ({obra}) no valor de {total}, válido até {validade}. Qualquer dúvida é só chamar!'
};

const ler = (chave, padrao) => {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return v ?? padrao;
  } catch {
    return padrao;
  }
};
const gravar = (chave, valor) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (e) {
    console.error('Falha ao gravar no aparelho (armazenamento cheio?)', e);
    return false;
  }
};
const escolher = (obj, campos) => Object.fromEntries(campos.filter((c) => c in obj).map((c) => [c, obj[c]]));
const agora = () => new Date().toISOString();

let usuario = null;
export const definirUsuario = (u) => { usuario = u; };

// ---------- Orçamentos ----------
const todos = () => ler(K.orcamentos, []);
const porEscopo = (escopo) => (o) => !escopo || (escopo === 'empresa' ? !!o.empresa_id : !o.empresa_id);
export const listarOrcamentos = (escopo) =>
  todos().filter((o) => !o._del && porEscopo(escopo)(o)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
export const obterOrcamento = (id) => todos().find((o) => o.id === id && !o._del) || null;
export const proximoNumero = (escopo) =>
  todos().filter((o) => !o._del && porEscopo(escopo)(o)).reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0) + 1;
export const contarPendentes = () => {
  const emp = obterEmpresa();
  return todos().filter((o) => o._sync === 'pendente' || o._del).length
    + todasNotas().filter((o) => o._sync === 'pendente' || o._del).length
    + (obterPerfilBruto()._sync === 'pendente' ? 1 : 0)
    + (emp && emp._perfilSync === 'pendente' ? 1 : 0);
};

export function salvarOrcamento(orc) {
  const lista = todos();
  const registro = { ...escolher(orc, CAMPOS_ORC), updated_at: agora(), _sync: 'pendente' };
  if (!registro.created_at) registro.created_at = registro.updated_at;
  if (!registro.emitido_em) registro.emitido_em = hojeISO();
  const i = lista.findIndex((o) => o.id === registro.id);
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  gravar(K.orcamentos, lista);
  return registro;
}

export function excluirOrcamento(id) {
  let lista = todos();
  if (!usuario) {
    lista = lista.filter((o) => o.id !== id); // modo local: apaga de vez
  } else {
    lista = lista.map((o) => (o.id === id ? { ...o, _del: true, _sync: 'pendente' } : o));
  }
  gravar(K.orcamentos, lista);
}

// ---------- Notas de serviço ----------
const todasNotas = () => ler(K.notas, []);
export const listarNotas = (escopo) =>
  todasNotas().filter((o) => !o._del && porEscopo(escopo)(o)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
export const obterNota = (id) => todasNotas().find((o) => o.id === id && !o._del) || null;
export const proximoNumeroNota = (escopo) =>
  todasNotas().filter((o) => !o._del && porEscopo(escopo)(o)).reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0) + 1;
export function salvarNota(nota) {
  const lista = todasNotas();
  const registro = { ...escolher(nota, CAMPOS_NOTA), updated_at: agora(), _sync: 'pendente' };
  if (!registro.created_at) registro.created_at = registro.updated_at;
  if (!registro.emitido_em) registro.emitido_em = hojeISO();
  const i = lista.findIndex((o) => o.id === registro.id);
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  gravar(K.notas, lista);
  return registro;
}
export function excluirNota(id) {
  let lista = todasNotas();
  lista = usuario ? lista.map((o) => (o.id === id ? { ...o, _del: true, _sync: 'pendente' } : o)) : lista.filter((o) => o.id !== id);
  gravar(K.notas, lista);
}

// ---------- Empresa compartilhada e perfil próprio da empresa ----------
export const obterEmpresa = () => ler(K.empresa, null);
export function definirEmpresa(e) {
  if (e) gravar(K.empresa, e); else localStorage.removeItem(K.empresa);
}

export function obterPerfilEmpresa() {
  const emp = obterEmpresa();
  if (!emp) return obterPerfil();
  const bruto = (emp.perfil && typeof emp.perfil === 'object') ? emp.perfil : {};
  const p = JSON.parse(JSON.stringify({ ...PERFIL_PADRAO, ...escolher(bruto, CAMPOS_PERFIL) }));
  if (!p.nome_comercial) p.nome_comercial = emp.nome || '';
  if (!Array.isArray(p.pix_contas)) p.pix_contas = [];
  if (!Array.isArray(p.whatsapps)) p.whatsapps = [];
  return p;
}

export function salvarPerfilEmpresa(perfil) {
  const emp = obterEmpresa();
  if (!emp) return;
  const limpo = { ...escolher(perfil, CAMPOS_PERFIL), updated_at: agora() };
  const novoNome = (limpo.nome_comercial || '').trim() || emp.nome;
  gravar(K.empresa, {
    ...emp,
    nome: novoNome,
    perfil: limpo,
    updated_at: limpo.updated_at,
    _perfilSync: 'pendente'
  });
}

// ---------- Perfil da empresa (pessoal) ----------
function obterPerfilBruto() {
  return ler(K.perfil, { ...PERFIL_PADRAO, _sync: 'padrao' });
}
export function obterPerfil() {
  const bruto = obterPerfilBruto();
  const p = JSON.parse(JSON.stringify({ ...PERFIL_PADRAO, ...escolher(bruto, CAMPOS_PERFIL) })); // cópia: nunca altera o padrão
  // Migração de perfis antigos (um único Pix solto no perfil)
  if (!Array.isArray(bruto.pix_contas) && bruto.pix_chave) {
    p.pix_contas = [{ id: 'pix-padrao', banco: bruto.pix_banco || 'outro', apelido: 'Pix', titular: bruto.pix_titular || '', tipo: bruto.pix_tipo || 'celular', chave: bruto.pix_chave, cidade: bruto.pix_cidade || '', mostrar_chave: bruto.pix_mostrar_chave !== false, copia_cola: '' }];
    p.pix_padrao_id = 'pix-padrao';
  }
  if (!Array.isArray(p.pix_contas)) p.pix_contas = [];
  if (!Array.isArray(p.whatsapps)) p.whatsapps = [];
  return p;
}
export function salvarPerfil(perfil) {
  gravar(K.perfil, { ...escolher(perfil, CAMPOS_PERFIL), updated_at: agora(), _sync: 'pendente' });
}

/** Retorna o perfil ativo conforme o escopo ('empresa' ou 'pessoal'). */
export const obterPerfilAtivo = (escopo) => (escopo === 'empresa' && obterEmpresa() ? obterPerfilEmpresa() : obterPerfil());

/** Limpa os dados do aparelho (usado ao sair da conta, depois de sincronizar). */
export function limparTudo() {
  localStorage.removeItem(K.orcamentos);
  localStorage.removeItem(K.perfil);
  localStorage.removeItem(K.notas);
  localStorage.removeItem(K.empresa);
}

// ---------- Sincronização com o Supabase ----------
export async function sincronizar(sb, user) {
  if (!sb || !user) return { ok: false, motivo: 'sem-conta' };
  if (!navigator.onLine) return { ok: false, motivo: 'offline' };
  try {
    // 1) Perfil pessoal: envia se houver alteração local, senão baixa a versão da nuvem
    let perfil = obterPerfilBruto();
    if (perfil._sync === 'pendente') {
      const { error } = await sb.from('perfis_empresa').upsert({ ...escolher(perfil, CAMPOS_PERFIL), user_id: user.id });
      if (error) throw error;
      gravar(K.perfil, { ...perfil, _sync: 'ok' });
    } else {
      const { data, error } = await sb.from('perfis_empresa').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (data) gravar(K.perfil, { ...escolher(data, CAMPOS_PERFIL), _sync: 'ok' });
    }

    // 2) Empresa compartilhada (e sincronização do perfil próprio da empresa)
    const empLocal = obterEmpresa();
    let empresa = await buscarMinhaEmpresa(sb, user);
    if (empresa && empLocal && empLocal.id === empresa.id && empLocal._perfilSync === 'pendente') {
      const atualizada = await salvarPerfilEmpresaRemoto(sb, empresa.id, empLocal.perfil || {});
      empresa = { ...empresa, ...atualizada, _perfilSync: 'ok' };
    } else if (empresa) {
      empresa = { ...empresa, _perfilSync: 'ok' };
    }
    definirEmpresa(empresa);

    // 3) Orçamentos e notas: exclusões, envio dos pendentes e download do que mudou
    await sincTabela(sb, user, 'orcamentos', K.orcamentos, CAMPOS_ORC, empresa);
    await sincTabela(sb, user, 'notas', K.notas, CAMPOS_NOTA, empresa);
    return { ok: true };
  } catch (e) {
    console.error('Falha na sincronização', e);
    return { ok: false, motivo: 'erro', erro: e };
  }
}

async function sincTabela(sb, user, tabela, chave, campos, empresa) {
  let lista = ler(chave, []);
  for (const o of lista.filter((x) => x._del)) {
    const { error } = await sb.from(tabela).delete().eq('id', o.id);
    if (error) throw error;
  }
  lista = lista.filter((o) => !o._del);
  // Quem saiu da empresa: o que estava pendente volta a ser pessoal
  const idEmp = empresa ? empresa.id : null;
  lista = lista.map((o) => (o._sync === 'pendente' && o.empresa_id && o.empresa_id !== idEmp ? { ...o, empresa_id: null } : o));

  const pendentes = lista.filter((o) => o._sync === 'pendente');
  if (pendentes.length) {
    const linhas = pendentes.map((o) => ({ ...escolher(o, campos), user_id: user.id }));
    const { error } = await sb.from(tabela).upsert(linhas);
    if (error) throw error;
    lista = lista.map((o) => (o._sync === 'pendente' ? { ...o, _sync: 'ok' } : o));
  }

  const { data: remotos, error } = await sb.from(tabela).select('*');
  if (error) throw error;
  const idsRemotos = new Set(remotos.map((r) => r.id));
  lista = lista.filter((o) => o._sync !== 'ok' || idsRemotos.has(o.id)); // apagado em outro aparelho
  for (const r of remotos) {
    const i = lista.findIndex((o) => o.id === r.id);
    const novo = { ...escolher(r, campos), _sync: 'ok' };
    if (i < 0) lista.push(novo);
    else if (lista[i]._sync === 'ok') {
      if (Date.parse(r.updated_at) > Date.parse(lista[i].updated_at)) lista[i] = novo;
      else if ((lista[i].empresa_id || null) !== (r.empresa_id || null)) lista[i] = { ...lista[i], empresa_id: r.empresa_id || null }; // empresa excluída
    }
  }
  gravar(chave, lista);
}
