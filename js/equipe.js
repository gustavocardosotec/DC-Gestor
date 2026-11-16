// Empresa compartilhada: criar, entrar com código, membros (usa funções seguras do banco)
import { obterSupabase } from './supabase.js';

const MENSAGENS = {
  codigo_invalido: 'Código não encontrado. Confira e tente de novo.',
  ja_em_empresa: 'Você já faz parte de uma empresa. Saia dela antes de entrar em outra.',
  so_dono: 'Só o dono da empresa pode fazer isso.',
  dono_nao_sai: 'O dono não pode sair. Se quiser, exclua a empresa.',
  sem_login: 'Entre com uma conta para usar a empresa compartilhada.',
  nome_vazio: 'Dê um nome para a empresa.'
};

function cliente() {
  const sb = obterSupabase();
  if (!sb || !navigator.onLine) throw new Error('Conecte-se à internet para fazer isso.');
  return sb;
}
function traduzir(erro) {
  const texto = (erro && erro.message) || '';
  const achado = Object.keys(MENSAGENS).find((k) => texto.includes(k));
  return new Error(achado ? MENSAGENS[achado] : 'Não foi possível concluir. ' + texto);
}
async function chamar(nome, args) {
  const { data, error } = await cliente().rpc(nome, args);
  if (error) throw traduzir(error);
  return data;
}

export const criarEmpresa = (nome) => chamar('criar_empresa', { p_nome: String(nome || '').trim() });
export const entrarEmpresa = (codigo) => chamar('entrar_empresa', { p_codigo: String(codigo || '').trim() });
export const sairEmpresa = () => chamar('sair_empresa', {});
export const excluirEmpresa = (id) => chamar('excluir_empresa', { eid: id });
export const removerMembro = (eid, uid) => chamar('remover_membro', { eid, uid });

export async function listarMembros(eid) {
  const { data, error } = await cliente().from('empresa_membros')
    .select('user_id, papel, email, entrou_em').eq('empresa_id', eid).order('entrou_em');
  if (error) throw traduzir(error);
  return data || [];
}

/** Empresa do usuário (ou null). Usada pela sincronização. */
export async function buscarMinhaEmpresa(sb, user) {
  const { data, error } = await sb.from('empresa_membros')
    .select('papel, empresas(id, nome, codigo, dono_id)').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data && data.empresas ? { ...data.empresas, papel: data.papel } : null;
}
