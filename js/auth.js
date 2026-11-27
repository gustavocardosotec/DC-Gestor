// Autenticação e sessão do DC Gestor
import { iniciarSupabase, obterSupabase } from './supabase.js';

const CHAVE_MODO_LOCAL = 'dcg:modoLocal';

const MENSAGENS = [
  ['Invalid login credentials', 'E-mail ou senha incorretos.'],
  ['Email not confirmed', 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'],
  ['User already registered', 'Este e-mail já está cadastrado. Toque em Entrar.'],
  ['at least 6 characters', 'A senha precisa ter ao menos 6 caracteres.'],
  ['Unable to validate email', 'Digite um e-mail válido.'],
  ['rate limit', 'Muitas tentativas. Aguarde um minuto e tente de novo.'],
  ['Failed to fetch', 'Sem conexão com a internet. Tente de novo quando houver sinal.'],
  ['NetworkError', 'Sem conexão com a internet. Tente de novo quando houver sinal.']
];

function traduzir(erro) {
  const texto = (erro && (erro.message || String(erro))) || '';
  const achado = MENSAGENS.find(([chave]) => texto.includes(chave));
  return achado ? achado[1] : 'Não foi possível concluir. ' + texto;
}

function exigirCliente() {
  const sb = obterSupabase();
  if (!sb) throw new Error('Failed to fetch');
  return sb;
}

/** Inicia o Supabase, devolve o usuário logado (ou null) e avisa mudanças de sessão. */
export async function iniciar(aoMudarSessao) {
  const sb = await iniciarSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    sb.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') aoMudarSessao(evento, sessao?.user || null);
    });
    return data?.session?.user || null;
  } catch {
    return null;
  }
}

export const modoLocal = () => localStorage.getItem(CHAVE_MODO_LOCAL) === '1';
export const definirModoLocal = (ativo) =>
  ativo ? localStorage.setItem(CHAVE_MODO_LOCAL, '1') : localStorage.removeItem(CHAVE_MODO_LOCAL);

export async function entrar(email, senha) {
  try {
    const { data, error } = await exigirCliente().auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    definirModoLocal(false);
    return { ok: true, usuario: data.user };
  } catch (e) {
    return { ok: false, erro: traduzir(e) };
  }
}

export async function cadastrar(email, senha) {
  try {
    const { data, error } = await exigirCliente().auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    definirModoLocal(false);
    // Sem sessão = o projeto exige confirmação por e-mail
    return { ok: true, usuario: data.user, precisaConfirmar: !data.session };
  } catch (e) {
    return { ok: false, erro: traduzir(e) };
  }
}

export async function entrarComGoogle() {
  try {
    const { error } = await exigirCliente().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: traduzir(e) };
  }
}

export async function recuperarSenha(email) {
  try {
    const { error } = await exigirCliente().auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: traduzir(e) };
  }
}

export async function sair() {
  try {
    const sb = obterSupabase();
    if (sb) await sb.auth.signOut();
  } catch (e) {
    console.warn(e);
  }
  definirModoLocal(false);
}
