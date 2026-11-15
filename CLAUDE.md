# CLAUDE.md — DC Gestor

## 👤 Perfil do Desenvolvedor & Empresa

* **Desenvolvedor:** Gustavo Cardoso (14 anos) — Pederneiras (SP)
* **Perfil:** Programador autodidata, apaixonado por matemática e elétrica.
* **Empresa:** DC Elétrica Residencial (Empresa familiar — atua como ajudante de eletricista com seu pai, Danilo).
* **Ecossistema:** DC Gestor & DC CAD Pro.

---

## 🎯 Objetivo do Projeto (DC Gestor)

O **DC Gestor** é um aplicativo web *mobile-first* projetado para resolver a rotina de campo da **DC Elétrica Residencial**. Suas principais funcionalidades incluem:

1. **Levantamento Técnico em Campo:** Cadastro e levantamento de materiais diretamente na residência/obra do cliente.
2. **Cotações Comparativas:** Registro e comparação de preços de materiais em múltiplas lojas físicas de elétrica e construção.
3. **Orçamento Profissional (PDF):** Geração de orçamentos em PDF com fidelidade visual absoluta ao modelo de referência (`Orçamento Modelo.pdf`), incluindo:
   * Cálculo automático e preciso de subtotais e totais.
   * Dados completos e estilizados da empresa.
   * QR Code Pix dinâmico com logo do banco configurado.
   * Atalhos diretos de comunicação via WhatsApp.

---

## 🛠️ Stack Tecnológica & Infraestrutura

* **Frontend:** HTML5 semântico, Tailwind CSS (via CDN) para estilização utilitária e ágil, JavaScript Vanilla (ES6+ limpo, modular, sem frameworks pesados).
* **Backend & Banco de Dados:** Supabase (PostgreSQL, Supabase Auth com provedor Google OAuth).
* **Hospedagem & Deploy:** Vercel (hospedagem web para deploy contínuo até a futura transição para mobile/PWA).
* **Repositório & Versionamento:** GitHub (controle de versão e integração contínua).
* **Design System & UX:** Mobile-first (otimizado prioritariamente para smartphones em ambiente de campo, com layout responsivo para desktop).

---

## 📁 Estrutura de Diretórios do Projeto

```text
/DC Gestor (Raiz do Repositório)/
│
├── .claude/                         # Configurações locais do Claude, Skills e Plugins
│   ├── plugins/                     # Pasta OBRIGATÓRIA para TODOS os plugins (NÃO usar o caminho padrão)
│   └── skills/                      # Skills instaladas/personalizadas do projeto
│
├── CLAUDE.md                        # Este guia de diretrizes e arquitetura
│
├── DC Gestor/                       # Código-fonte principal da aplicação
│   ├── index.html                   # Ponto de entrada da aplicação
│   ├── css/                         # Estilos personalizados e Tailwind CDN
│   ├── js/                          # Módulos JS Vanilla (auth, supabase, pdf, etc.)
│   └── assets/                      # Recursos visuais da aplicação
│       ├── img/                     # Logotipo oficial, favicon, ícones (apple-touch-icon, Whatsapp.png)
│       └── logos-bancos/            # Logos dos bancos brasileiros em PNG (Nubank, Itaú, Bradesco, etc.)
│
├── Backups/                         # Pacotes de backup das versões estáveis (iniciando pela v1.0 Alfa)
│
├── Claude/                          # Anotações técnicas, documentações de arquitetura e arquivos .md auxiliares
│
├── Referencias/                     # Arquivos reais de referência do sistema
│   ├── Apresentação Pix.png
│   ├── Apresentação Zap.png
│   ├── Configurações Empresa.png
│   ├── Configurações Pix.png
│   ├── Configurações Zap.png
│   ├── Pix e Zap.png
│   └── Orçamento Modelo.pdf        # Modelo oficial em PDF do orçamento final
│
└── sql/                             # Scripts SQL, migrações do Supabase e definições de tabelas

*Nota: O controle de versão Git foi removido da pasta principal e deve ser inicializado separadamente na pasta `Repositório github` (em `C:\Users\Gustavo\Desktop\DC Gestor\Repositório github`) para upload automático ao GitHub.
```

---

## 📐 Diretrizes de Código e Desenvolvimento

### 1. Filosofia & Parceria
* Agir como um parceiro de desenvolvimento proativo, técnico e direto.
* Sempre priorizar a clareza, manutenibilidade e simplicidade (KISS - Keep It Simple, Stupid).
* Escrever código limpo e bem comentado em português.

### 2. Padrões de Código Frontend
* **HTML:** Estruturação semântica, acessível e otimizada para navegadores móveis.
* **CSS / Tailwind:** Uso prioritário das classes utilitárias do Tailwind CSS via CDN. Garantir touch targets adequados (mínimo 44x44px para botões e inputs no mobile).
* **JavaScript:** 
  * JS Vanilla moderno (ES Modules).
  * Separação clara de responsabilidades (serviço Supabase, manipulação de DOM, gerador de PDF, utilitários de cálculo).
  * Evitar dependências desnecessárias para manter a aplicação leve e ultra-rápida no celular.

### 3. Integração Supabase & Autenticação
* **Centralização:** Chamar API e cliente Supabase em módulos específicos (`js/supabase.js` ou `js/services/`).
* **Autenticação Flexível:** 
  * Suporte nativo ao Google OAuth via Google Cloud Console.
  * Autenticação via Email/Senha com suporte a linkagem posterior de conta Google.
  * Possibilidade de criar senha para usuários que entraram inicialmente via Google.

### 4. Modo Offline, Sincronização & PWA
* **Suporte Offline Total:** Operação completa em campo, mesmo sem sinal.
* **Armazenamento:** Uso de tecnologias de navegador (IndexedDB ou LocalStorage) para salvar cadastros, levantamentos e cotações localmente enquanto offline.
* **Sincronização:** Detecção automática de restabelecimento de conexão para sincronizar os dados locais com o Supabase em segundo plano, garantindo integridade e evitando perda de dados.
* **PWA:** Aplicação estruturada para funcionamento como PWA (Progressive Web App).

### 5. Design, UX & Responsividade
* **Mobile-First com Desktop:** Interface otimizada prioritariamente para smartphones (campo), mas com interface completa, funcional e adaptada para uso em telas de desktop (PC).
* **Fidelidade às Referências:**
  * **Orçamento PDF:** O PDF gerado deve ser idêntico ao arquivo `Referencias/Orçamento Modelo.pdf`.
  * **Configurações e Modais:** Seguir visualmente e estruturalmente os prints da pasta `Referencias/` (Configurações de Empresa, Pix, WhatsApp).

### 6. Banco de Dados & Scripts SQL
* Todos os scripts de criação/alteração de tabelas, políticas RLS (Row Level Security), views e triggers do Supabase devem ser salvos na pasta `sql/`.
* Manter os arquivos `.sql` organizados e bem documentados para fácil replicação ou manutenção do banco de dados.

### 7. Controle de Versão (Git/GitHub), Deploy (Vercel) & Organização
* **GitHub & Vercel:**
  * O código-fonte é hospedado no **GitHub**, integrado à **Vercel** para deploy automático a cada atualização.
  * A hospedagem na Vercel serve como solução principal até a transição/migração final para o aplicativo mobile nativo/PWA.
* **Gerenciamento da pasta `.claude/` (Plugins & Skills):**
  * **Plugins:** TODOS os plugins devem ser mantidos e armazenados OBRIGATORIAMENTE dentro da pasta `.claude/plugins/` do projeto, e JAMAIS na pasta/caminho padrão global do sistema.
  * **Skills:** Quaisquer skills instaladas ou customizadas para o projeto devem ser salvas em `.claude/skills/`.
* Salvar documentações de raciocínio técnico na pasta `Claude/`.
* Manter a pasta `Backups/` atualizada ao finalizar versões estáveis (1.0 Alfa, 1.0 Beta, 1.0 Final, etc.).
