// Motor offline-first: tudo grava no localStorage e sincroniza com o Supabase quando há sinal.
import { hojeISO } from './utils.js';

const K = { orcamentos: 'dcg:orcamentos', perfil: 'dcg:perfil' };

export const CAMPOS_ORC = [
  'id', 'numero', 'status', 'cliente_nome', 'cliente_telefone', 'cliente_email', 'cliente_documento',
  'cliente_endereco', 'cliente_cep', 'cliente_bairro', 'cliente_cidade', 'cliente_estado',
  'obra_nome', 'observacoes', 'itens', 'lojas_nomes', 'margem_lucro', 'mao_de_obra', 'desconto',
  'acrescimo', 'pix_id', 'valor_total', 'validade_dias', 'emitido_em', 'created_at', 'updated_at'
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
export const listarOrcamentos = () =>
  todos().filter((o) => !o._del).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
export const obterOrcamento = (id) => todos().find((o) => o.id === id && !o._del) || null;
export const proximoNumero = () => todos().reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0) + 1;
export const contarPendentes = () =>
  todos().filter((o) => o._sync === 'pendente' || o._del).length + (obterPerfilBruto()._sync === 'pendente' ? 1 : 0);

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

// ---------- Perfil da empresa ----------
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

/** Limpa os dados do aparelho (usado ao sair da conta, depois de sincronizar). */
export function limparTudo() {
  localStorage.removeItem(K.orcamentos);
  localStorage.removeItem(K.perfil);
}

// ---------- Sincronização com o Supabase ----------
export async function sincronizar(sb, user) {
  if (!sb || !user) return { ok: false, motivo: 'sem-conta' };
  if (!navigator.onLine) return { ok: false, motivo: 'offline' };
  try {
    // 1) Perfil: envia se houver alteração local, senão baixa a versão da nuvem
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

    // 2) Exclusões pendentes
    let lista = todos();
    for (const o of lista.filter((x) => x._del)) {
      const { error } = await sb.from('orcamentos').delete().eq('id', o.id);
      if (error) throw error;
    }
    lista = lista.filter((o) => !o._del);

    // 3) Envia os orçamentos pendentes (em lote)
    const pendentes = lista.filter((o) => o._sync === 'pendente');
    if (pendentes.length) {
      const linhas = pendentes.map((o) => ({ ...escolher(o, CAMPOS_ORC), user_id: user.id }));
      const { error } = await sb.from('orcamentos').upsert(linhas);
      if (error) throw error;
      lista = lista.map((o) => (o._sync === 'pendente' ? { ...o, _sync: 'ok' } : o));
    }

    // 4) Baixa o que mudou em outros aparelhos
    const { data: remotos, error } = await sb.from('orcamentos').select('*');
    if (error) throw error;
    const idsRemotos = new Set(remotos.map((r) => r.id));
    lista = lista.filter((o) => o._sync !== 'ok' || idsRemotos.has(o.id)); // apagado em outro aparelho
    for (const r of remotos) {
      const i = lista.findIndex((o) => o.id === r.id);
      const novo = { ...escolher(r, CAMPOS_ORC), _sync: 'ok' };
      if (i < 0) lista.push(novo);
      else if (lista[i]._sync === 'ok' && Date.parse(r.updated_at) > Date.parse(lista[i].updated_at)) lista[i] = novo;
    }
    gravar(K.orcamentos, lista);
    return { ok: true };
  } catch (e) {
    console.error('Falha na sincronização', e);
    return { ok: false, motivo: 'erro', erro: e };
  }
}
