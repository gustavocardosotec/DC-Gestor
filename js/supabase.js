// Cliente Supabase do DC Gestor.
// Importação dinâmica: se a biblioteca não carregar (offline na 1ª vez), o app segue funcionando em modo local.
export const SUPABASE_URL = 'https://rdhzwaspxdgtdfzzxrke.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_PZCpFohy1s3iaMkspo4Qng_tHthv1RM';

let cliente = null;

export async function iniciarSupabase() {
  if (cliente) return cliente;
  try {
    const modulo = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    cliente = modulo.createClient(SUPABASE_URL, SUPABASE_CHAVE, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (erro) {
    console.warn('Supabase indisponível, seguindo em modo local.', erro);
    cliente = null;
  }
  return cliente;
}

export const obterSupabase = () => cliente;
