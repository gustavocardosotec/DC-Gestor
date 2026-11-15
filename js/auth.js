/**
 * Módulo de Autenticação do DC Gestor
 *
 * Gerencia o estado de login, login via Google OAuth e Email/Senha.
 * Sincroniza o estado da tela com o Supabase Auth.
 * Inclui UI de login completa com abas (E-mail/Senha e Google).
 *
 * @author Gustavo Cardoso
 * @version 1.0.0 (v1.0 Alfa)
 */

import { createClient } from './supabase.js';

// Exporta o cliente Supabase já inicializado para uso em outros módulos
export const supabase = createClient();

// ============================================================================
// ELEMENTOS DO DOM (serão inicializados após o carregamento da tela)
// ============================================================================

let authElements = {};

/**
 * Inicializa os elementos da interface de autenticação.
 * Deve ser chamado após o DOM estar pronto.
 */
export function initAuthUI() {
    // Elementos do overlay de login
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');

    // Formulário E-mail/Senha
    const loginEmail = document.getElementById('login-email');
    const loginSenha = document.getElementById('login-senha');
    const btnToggleSenha = document.getElementById('btn-toggle-senha');
    const iconOlho = document.getElementById('icon-olho');
    const btnEntrar = document.getElementById('btn-entrar');
    const btnEsqueciSenha = document.getElementById('btn-esqueci-senha');
    const loginLembrar = document.getElementById('login-lembrar');

    // Botão Google
    const btnLoginGoogle = document.getElementById('btn-login-google');

    // Criar conta (abre modal)
    const btnCriarConta = document.getElementById('btn-criar-conta');

    // Modal Criar Conta
    const modalCriarConta = document.getElementById('modal-criar-conta');
    const modalCriarContaFechar = document.getElementById('modal-criar-conta-fechar');
    const formCriarConta = document.getElementById('form-criar-conta');
    const criarNome = document.getElementById('criar-nome');
    const criarEmail = document.getElementById('criar-email');
    const criarSenha = document.getElementById('criar-senha');
    const criarConfirmarSenha = document.getElementById('criar-confirmar-senha');
    const btnToggleCriarSenha = document.getElementById('btn-toggle-criar-senha');
    const iconOlhoCriar = document.getElementById('icon-olho-criar');
    const btnToggleConfirmarSenha = document.getElementById('btn-toggle-confirmar-senha');
    const iconOlhoConfirmar = document.getElementById('icon-olho-confirmar');
    const btnConfirmarCriarConta = document.getElementById('btn-confirmar-criar-conta');
    const btnVoltarLogin = document.getElementById('btn-voltar-login');

    // Header/App
    const btnLogout = document.getElementById('btn-logout');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const navButtons = document.querySelectorAll('[data-tab]');

    // Validação de elementos obrigatórios
    if (!loginOverlay || !appContainer) {
        console.warn('⚠️ Elementos de login overlay não encontrados. Verifique index.html.');
        return;
    }

    // Cacheia elementos
    authElements = {
        loginOverlay,
        appContainer,
        loginEmail,
        loginSenha,
        btnToggleSenha,
        iconOlho,
        btnEntrar,
        btnEsqueciSenha,
        loginLembrar,
        btnLoginGoogle,
        btnCriarConta,
        modalCriarConta,
        modalCriarContaFechar,
        formCriarConta,
        criarNome,
        criarEmail,
        criarSenha,
        criarConfirmarSenha,
        btnToggleCriarSenha,
        iconOlhoCriar,
        btnToggleConfirmarSenha,
        iconOlhoConfirmar,
        btnConfirmarCriarConta,
        btnVoltarLogin,
        btnLogout,
        userAvatar,
        userName,
        navButtons
    };

    // Configura event listeners
    configurarEventosAuth();

    // Atualiza a UI ao mudar o estado de auth
    supabase.auth.onAuthStateChange((event, session) => {
        updateAuthUI(event, session);
    });

    // Initial state
    supabase.auth.getSession().then(({ data: { session } }) => {
        updateAuthUI('initial', session);
    });
}

/**
 * Configura todos os event listeners da tela de login.
 */
function configurarEventosAuth() {
    const {
        btnToggleSenha, iconOlho, loginSenha,
        btnEntrar, btnEsqueciSenha, btnLoginGoogle, btnCriarConta,
        modalCriarConta, modalCriarContaFechar, formCriarConta,
        criarSenha, criarConfirmarSenha,
        btnToggleCriarSenha, iconOlhoCriar,
        btnToggleConfirmarSenha, iconOlhoConfirmar,
        btnConfirmarCriarConta, btnVoltarLogin,
        btnLogout
    } = authElements;

    // ======================
    // Mostrar/ocultar senha (Login)
    // ======================
    if (btnToggleSenha && loginSenha && iconOlho) {
        btnToggleSenha.addEventListener('click', () => {
            const isPassword = loginSenha.type === 'password';
            loginSenha.type = isPassword ? 'text' : 'password';
            iconOlho.innerHTML = isPassword
                ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        });
    }

    // ======================
    // Login E-mail/Senha
    // ======================
    if (btnEntrar) {
        btnEntrar.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleLoginEmail();
        });
    }

    // Enter no formulário
    if (authElements.loginEmail) {
        authElements.loginEmail.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') authElements.loginSenha?.focus();
        });
    }
    if (authElements.loginSenha) {
        authElements.loginSenha.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLoginEmail();
        });
    }

    // ======================
    // Esqueci a senha
    // ======================
    if (btnEsqueciSenha) {
        btnEsqueciSenha.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleRecuperarSenha();
        });
    }

    // ======================
    // Login Google
    // ======================
    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener('click', async (e) => {
            e.preventDefault();
            await loginWithGoogle();
        });
    }

    // ======================
    // Abrir modal Criar Conta
    // ======================
    if (btnCriarConta) {
        btnCriarConta.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalCriarConta();
        });
    }

    // ======================
    // Modal Criar Conta - Fechar
    // ======================
    if (modalCriarContaFechar) {
        modalCriarContaFechar.addEventListener('click', fecharModalCriarConta);
    }
    if (btnVoltarLogin) {
        btnVoltarLogin.addEventListener('click', fecharModalCriarConta);
    }
    if (modalCriarConta) {
        modalCriarConta.addEventListener('click', (e) => {
            if (e.target === modalCriarConta) fecharModalCriarConta();
        });
    }

    // ======================
    // Mostrar/ocultar senha (Criar Conta)
    // ======================
    if (btnToggleCriarSenha && criarSenha && iconOlhoCriar) {
        btnToggleCriarSenha.addEventListener('click', () => {
            const isPassword = criarSenha.type === 'password';
            criarSenha.type = isPassword ? 'text' : 'password';
            iconOlhoCriar.innerHTML = isPassword
                ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        });
    }
    if (btnToggleConfirmarSenha && criarConfirmarSenha && iconOlhoConfirmar) {
        btnToggleConfirmarSenha.addEventListener('click', () => {
            const isPassword = criarConfirmarSenha.type === 'password';
            criarConfirmarSenha.type = isPassword ? 'text' : 'password';
            iconOlhoConfirmar.innerHTML = isPassword
                ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        });
    }

    // ======================
    // Submit Criar Conta
    // ======================
    if (formCriarConta) {
        formCriarConta.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleCriarConta();
        });
    }

    // ======================
    // Login Google
    // ======================
    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener('click', async (e) => {
            e.preventDefault();
            await loginWithGoogle();
        });
    }

    // ======================
    // Esqueci a senha
    // ======================
    if (btnEsqueciSenha) {
        btnEsqueciSenha.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleRecuperarSenha();
        });
    }

    // ======================
    // Logout
    // ======================
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }
}

// ======================
// Modal Criar Conta - Helpers
// ======================
function abrirModalCriarConta() {
    const { modalCriarConta, formCriarConta, criarNome } = authElements;
    if (!modalCriarConta) return;

    formCriarConta?.reset();
    modalCriarConta.classList.remove('hidden');
    modalCriarConta.classList.add('flex');
    document.body.style.overflow = 'hidden';

    setTimeout(() => criarNome?.focus(), 100);
}

function fecharModalCriarConta() {
    const { modalCriarConta } = authElements;
    if (!modalCriarConta) return;

    modalCriarConta.classList.add('hidden');
    modalCriarConta.classList.remove('flex');
    document.body.style.overflow = '';
}

// Remove a função trocarAbaLogin (não é mais necessária)

/**
 * Atualiza a visibilidade dos elementos da interface baseada no estado de login.
 *
 * @param {string} event - Tipo de evento ('SIGNED_IN', 'SIGNED_OUT', 'initial').
 * @param {import('@supabase/supabase-js').AuthSession} session - Sessão atual do Supabase.
 */
function updateAuthUI(event, session) {
    const { loginOverlay, appContainer, btnLogout, userAvatar, userName, navButtons } = authElements;
    const isLoggedIn = !!session;

    if (isLoggedIn) {
        // Usuário logado - esconde overlay de login, mostra app
        loginOverlay.classList.add('hidden');
        loginOverlay.classList.remove('flex');
        appContainer.classList.remove('hidden');

        btnLogout.classList.remove('hidden');

        const user = session.user;
        userAvatar.classList.remove('hidden');
        userName.textContent = user.email ? user.email.split('@')[0] : 'Usuário';

        // Mostra abas de navegação
        navButtons.forEach(btn => btn.classList.remove('hidden'));

        // Dispara evento customizado para outros módulos saberem que logou
        window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
    } else {
        // Usuário desconectado - mostra overlay de login, esconde app
        loginOverlay.classList.remove('hidden');
        loginOverlay.classList.add('flex');
        appContainer.classList.add('hidden');

        btnLogout.classList.add('hidden');
        userAvatar.classList.add('hidden');
        userName.textContent = '';

        // Esconde abas de navegação
        navButtons.forEach(btn => btn.classList.add('hidden'));

        // Reset das abas de login para e-mail
        trocarAbaLogin('email');

        // Dispara evento customizado
        window.dispatchEvent(new CustomEvent('auth:logout'));
    }
}

/**
 * Realiza login via Google OAuth.
 *
 * @returns {Promise<import('@supabase/supabase-js').AuthError | null>} Erro se houver, null caso contrário.
 */
export async function loginWithGoogle() {
    const { btnLoginGoogle } = authElements;

    try {
        // Loading state
        if (btnLoginGoogle) {
            btnLoginGoogle.disabled = true;
            btnLoginGoogle.innerHTML = `
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>Redirecionando...</span>
            `;
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });

        if (error) {
            console.error('❌ Erro no login Google:', error.message);
            mostrarErroLogin('Não foi possível fazer login com Google: ' + error.message);
            return error;
        }

        console.log('✅ Login Google iniciado - aguardando redirecionamento');
        return null;

    } catch (err) {
        console.error('❌ Exceção no login Google:', err);
        mostrarErroLogin('Ocorreu um erro inesperado durante o login com Google.');
        return err;
    } finally {
        // Reset button state (se não redirecionar)
        setTimeout(() => {
            if (btnLoginGoogle) {
                btnLoginGoogle.disabled = false;
                btnLoginGoogle.innerHTML = `
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" height="20">
                    <span>Continuar com Google</span>
                `;
            }
        }, 3000);
    }
}

/**
 * Realiza login com email e senha.
 *
 * @returns {Promise<{ error: import('@supabase/supabase-js').AuthError | null, user: import('@supabase/supabase-js').User | null }>}
 */
async function handleLoginEmail() {
    const { loginEmail, loginSenha, btnEntrar, loginLembrar } = authElements;

    const email = loginEmail?.value?.trim();
    const senha = loginSenha?.value;

    // Validação
    if (!email || !senha) {
        mostrarErroLogin('Preencha e-mail e senha.');
        return { error: { message: 'Campos vazios' }, user: null };
    }

    if (!validarEmail(email)) {
        mostrarErroLogin('E-mail inválido.');
        loginEmail?.focus();
        return { error: { message: 'E-mail inválido' }, user: null };
    }

    try {
        // Loading state
        if (btnEntrar) {
            btnEntrar.disabled = true;
            btnEntrar.innerHTML = `
                <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>Entrando...</span>
            `;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: senha,
        });

        if (error) {
            console.error('❌ Erro no login por e-mail/senha:', error.message);
            // Mensagens amigáveis
            let msg = 'Login falhou. ';
            if (error.message.includes('Invalid login credentials')) {
                msg += 'E-mail ou senha incorretos.';
            } else if (error.message.includes('Email not confirmed')) {
                msg += 'Confirme seu e-mail antes de entrar.';
            } else if (error.message.includes('Too many requests')) {
                msg += 'Muitas tentativas. Tente novamente em alguns minutos.';
            } else {
                msg += error.message;
            }
            mostrarErroLogin(msg);
            return { error, user: null };
        }

        console.log('✅ Login por e-mail/senha realizado com sucesso');
        limparErroLogin();
        return { error: null, user: data.user };

    } catch (err) {
        console.error('❌ Exceção no login por e-mail/senha:', err);
        mostrarErroLogin('Ocorreu um erro inesperado durante o login.');
        return { error: err, user: null };
    } finally {
        if (btnEntrar) {
            btnEntrar.disabled = false;
            btnEntrar.innerHTML = `
                <span>Entrar</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 5"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
            `;
        }
    }
}

/**
 * Recupera senha (envia e-mail de reset).
 */
async function handleRecuperarSenha() {
    const { loginEmail, btnEsqueciSenha } = authElements;
    const email = loginEmail?.value?.trim();

    if (!email) {
        mostrarErroLogin('Digite seu e-mail primeiro para recuperar a senha.');
        loginEmail?.focus();
        return;
    }

    if (!validarEmail(email)) {
        mostrarErroLogin('E-mail inválido.');
        loginEmail?.focus();
        return;
    }

    try {
        if (btnEsqueciSenha) {
            btnEsqueciSenha.textContent = 'Enviando...';
            btnEsqueciSenha.classList.add('pointer-events-none', 'opacity-50');
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname + '#reset-password'
        });

        if (error) {
            console.error('❌ Erro ao enviar reset de senha:', error.message);
            mostrarErroLogin('Erro ao enviar e-mail: ' + error.message);
        } else {
            console.log('✅ E-mail de recuperação enviado');
            mostrarSucessoLogin('E-mail de recuperação enviado! Verifique sua caixa de entrada (e spam).');
        }
    } catch (err) {
        console.error('❌ Exceção ao recuperar senha:', err);
        mostrarErroLogin('Erro inesperado. Tente novamente.');
    } finally {
        if (btnEsqueciSenha) {
            btnEsqueciSenha.textContent = 'Esqueci a senha';
            btnEsqueciSenha.classList.remove('pointer-events-none', 'opacity-50');
        }
    }
}

/**
 * Cria nova conta (signup com e-mail/senha) - usa o modal.
 */
async function handleCriarConta() {
    const { criarNome, criarEmail, criarSenha, criarConfirmarSenha, btnConfirmarCriarConta, formCriarConta } = authElements;

    const nome = criarNome?.value?.trim();
    const email = criarEmail?.value?.trim();
    const senha = criarSenha?.value;
    const confirmarSenha = criarConfirmarSenha?.value;

    // Validações
    if (!nome) {
        mostrarErroLogin('Digite seu nome completo.');
        criarNome?.focus();
        return;
    }

    if (!email) {
        mostrarErroLogin('Digite seu e-mail.');
        criarEmail?.focus();
        return;
    }

    if (!validarEmail(email)) {
        mostrarErroLogin('E-mail inválido.');
        criarEmail?.focus();
        return;
    }

    if (!senha) {
        mostrarErroLogin('Digite uma senha.');
        criarSenha?.focus();
        return;
    }

    if (senha.length < 6) {
        mostrarErroLogin('A senha deve ter pelo menos 6 caracteres.');
        criarSenha?.focus();
        return;
    }

    if (senha !== confirmarSenha) {
        mostrarErroLogin('As senhas não conferem. Digite novamente.');
        criarConfirmarSenha?.focus();
        return;
    }

    // Verifica se aceitou termos
    const termos = authElements.criarTermos?.checked;
    if (!termos) {
        mostrarErroLogin('Você deve aceitar os Termos de Uso e Política de Privacidade.');
        return;
    }

    try {
        if (btnConfirmarCriarConta) {
            btnConfirmarCriarConta.disabled = true;
            btnConfirmarCriarConta.innerHTML = `
                <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>Criando...</span>
            `;
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password: senha,
            options: {
                data: {
                    full_name: nome
                },
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });

        if (error) {
            console.error('❌ Erro ao criar conta:', error.message);
            let msg = 'Erro ao criar conta. ';
            if (error.message.includes('User already registered')) {
                msg += 'Este e-mail já está cadastrado. Tente entrar.';
            } else {
                msg += error.message;
            }
            mostrarErroLogin(msg);
        } else {
            console.log('✅ Conta criada:', data.user?.id);
            fecharModalCriarConta();
            if (data.user?.identities?.length === 0) {
                mostrarSucessoLogin('Conta já existe. Enviamos um link de confirmação para seu e-mail.');
            } else {
                mostrarSucessoLogin('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
            }
        }
    } catch (err) {
        console.error('❌ Exceção ao criar conta:', err);
        mostrarErroLogin('Erro inesperado. Tente novamente.');
    } finally {
        if (btnConfirmarCriarConta) {
            btnConfirmarCriarConta.disabled = false;
            btnConfirmarCriarConta.innerHTML = `
                <span>Criar minha conta</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
            `;
        }
    }
}

/**
 * Realiza o logout do usuário.
 *
 * @returns {Promise<import('@supabase/supabase-js').AuthError | null>} Erro se houver, null caso contrário.
 */
export async function logout() {
    const { btnLogout } = authElements;

    try {
        if (btnLogout) {
            btnLogout.disabled = true;
        }

        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('❌ Erro ao fazer logout:', error.message);
            return error;
        }

        console.log('✅ Logout realizado com sucesso');
        return null;
    } catch (err) {
        console.error('❌ Exceção no logout:', err);
        return err;
    } finally {
        if (btnLogout) {
            btnLogout.disabled = false;
        }
    }
}

/**
 * Mostra erro na tela de login.
 */
function mostrarErroLogin(mensagem) {
    // Remove mensagem anterior
    limparErroLogin();

    const { loginFormEmail } = authElements;
    if (!loginFormEmail) return;

    const erroDiv = document.createElement('div');
    erroDiv.id = 'login-erro';
    erroDiv.className = 'p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2 animation-fade-in';
    erroDiv.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${mensagem}</span>
    `;

    // Insere antes do primeiro input
    loginFormEmail.insertBefore(erroDiv, loginFormEmail.firstChild);

    // Auto-hide após 5s
    setTimeout(limparErroLogin, 5000);
}

/**
 * Mostra mensagem de sucesso na tela de login.
 */
function mostrarSucessoLogin(mensagem) {
    limparErroLogin();

    const { loginFormEmail } = authElements;
    if (!loginFormEmail) return;

    const sucessoDiv = document.createElement('div');
    sucessoDiv.id = 'login-erro';
    sucessoDiv.className = 'p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-start gap-2 animation-fade-in';
    sucessoDiv.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0 mt-0.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>${mensagem}</span>
    `;

    loginFormEmail.insertBefore(sucessoDiv, loginFormEmail.firstChild);
    setTimeout(limparErroLogin, 5000);
}

/**
 * Limpa mensagens de erro/sucesso.
 */
function limparErroLogin() {
    const erro = document.getElementById('login-erro');
    if (erro) erro.remove();
}

/**
 * Valida formato de e-mail.
 */
function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Verifica se o usuário está autenticado.
 *
 * @returns {Promise<boolean>} True se o usuário estiver logado.
 */
export async function isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
}

/**
 * Obtém o ID do usuário autenticado.
 *
 * @returns {Promise<string|null>} ID do usuário ou null se não houver sessão.
 */
export async function getUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
}

// Exporta tipos úteis para uso externo se necessário
export type { AuthError } from '@supabase/supabase-js';