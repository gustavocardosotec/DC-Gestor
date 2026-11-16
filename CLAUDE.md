# CLAUDE.md — DC Gestor

Guia técnico e operacional para trabalhar neste projeto. Leia antes de alterar qualquer arquivo.

## O que é
App web mobile-first (PWA) para eletricistas residenciais: levantamento de materiais na obra, cotação comparativa em várias lojas, orçamento e nota de serviço em PDF com QR Code Pix, envio por WhatsApp e gestão em equipe via empresa compartilhada.
- **Dono:** Gustavo Cardoso (DC Elétrica Residencial)
- **Versão atual:** **3.0** (Etapa 1: orçamento e PDF; Etapa 2: nota de serviço, clientes salvos e empresa compartilhada)

## Stack
- HTML5 + JavaScript puro (ES modules), **sem build e sem framework**
- Tailwind CSS via CDN (`cdn.tailwindcss.com/3.4.17`), fonte Inter
- Supabase (PostgreSQL + Auth: e-mail/senha e Google), carregado por `import()` do esm.sh
- Bibliotecas por CDN: `qrcodejs` (QR Code Pix) e `html2pdf.js` (geração de PDF)
- Deploy: Vercel (arquivos estáticos). Repositório: `github.com/gustavocardosotec/DC-Gestor`

## Estrutura de Arquivos
index.html           Casca: login, navegação, modais e estilos globais
manifest.json        Configuração do PWA
sw.js                Service Worker (cache offline)
vercel.json          Headers e regras do deploy
js/app.js            Interface, telas, clientes salvos e eventos
js/utils.js          Formatação, máscaras, cálculos, bancos e Pix (EMV + CRC16)
js/storage.js        localStorage + sincronização bidirecional com o Supabase
js/auth.js           Login, cadastro, Google OAuth e gestão de sessão
js/equipe.js         Empresa compartilhada, código de convite e cópia pessoal/empresa
js/supabase.js       Cliente Supabase (URL e chave pública publishable)
js/pdf.js            Geração de PDF do orçamento, Nota de Serviço em PDF e QR Code
assets/img/          Logo, favicon, ícones do PWA e ícone do WhatsApp
assets/logos-bancos/ Logos dos bancos (um PNG por banco, em minúsculas)
tools/               Scripts de apoio (preparação de assets)
sql/                 Scripts SQL do banco (01 a 04); sql/temp/ é ignorado pelo Git
Referencias/         Documentos de referência (orçamento e nota de serviço)

## Como rodar localmente
Módulos ES não funcionam via `file://`. Suba um servidor HTTP local na raiz do projeto:
`python -m http.server 5500` (ou `npx serve`) e acesse `http://localhost:5500`.
Deploy: cada `push` na branch principal publica automaticamente na Vercel.

## Arquitetura e Funcionamento
- **Offline-first:** tudo é salvo primeiro no `localStorage` (`dcg:orcamentos`, `dcg:perfil`, `dcg:rascunho`, etc.) e sincronizado com o Supabase quando há conexão e conta autenticada. Sem conta = "modo local".
- **Salvamento automático:** o levantamento salva localmente (~0,7 s após digitar) e dispara a sincronização em seguida.
- **Sincronização e conflitos:** cada registro possui `_sync` (`pendente`/`ok`). Exclusões marcam `_del` até confirmarem no banco. Em conflitos, prevalece o `updated_at` mais recente.
- **Banco de Dados (Supabase):**
  - `sql/01_init_v1_alfa.sql` e `sql/02_schema_v2_alfa.sql`: estrutura base (`orcamentos`, `perfis_empresa` e RLS).
  - `sql/03_orcamento_v3.sql`: novos campos em `orcamentos` (`tensao`, `empresa` em `jsonb` para sobrescrever o perfil só naquele orçamento, `acrescimos` em `jsonb` com `{nome, valor}` enquanto `acrescimo` guarda a soma, `mostrar_pix` booleano, `forma_pagamento`).
  - `sql/04_empresa_v3.sql`: estrutura de empresa compartilhada, membros, códigos de convite e numeração sequencial de notas.
  - *Atenção:* ao criar qualquer campo novo, atualizar também as listas de mapeamento (`CAMPOS_ORC`, `CAMPOS_PERFIL`, etc.) em `js/storage.js`.
- **Status do Orçamento:** `rascunho`, `enviado`, `aceito` (substitui o antigo "aprovado"), `em_andamento`, `pago`, `recusado`, `concluido`.
- **Cotação:** número ilimitado de lojas (`lojas_nomes` + `item.lojas[]` com o mesmo tamanho). Preço de venda = custo (menor preço ou loja selecionada) × `(1 + margem)`.
- **Clientes Salvos / Mesma Casa:** permite reaproveitar rapidamente dados de endereço e cliente já atendidos em orçamentos anteriores.
- **Nota de Serviço em PDF (`js/pdf.js`):** recibo/nota de serviço interna (sem validade fiscal/prefeitura), inspirada no modelo aprovado em `Referencias/` — sem "Modelo 3", sem ISS e sem CF/DF, exibindo CNPJ ou CPF selecionável, numeração sequencial (`Nº 1, 2, 3...`), dados do prestador/cliente, tabela de serviços/itens e forma de pagamento.
- **Empresa Compartilhada (`js/equipe.js`):**
  - Criação de empresa com geração de código de convite para entrada de membros (ex.: pai e filho).
  - Separação estrita entre espaço **Pessoal** (backup privado do criador) e espaço **Da Empresa** (compartilhado entre os membros: orçamentos, clientes e notas).
  - Permite enviar uma cópia do Pessoal para a Empresa sem vincular automaticamente; editar na Empresa não altera o Pessoal, salvo quando o usuário aciona explicitamente a opção de atualizar o original.
- **Pix e Contato:** payload EMV + CRC16 gerado em `js/utils.js` (`montarPayloadPix`). Suporta múltiplas chaves Pix (com opção de ocultar no PDF) e múltiplos números de WhatsApp.
- **Primeiro Uso:** abre assistente de configuração caso falte nome, Pix ou WhatsApp; exibe atalhos rápidos na tela inicial.

## Regras Inegociáveis
1. **Fidelidade visual nos PDFs.** Os layouts do orçamento e da nota de serviço em `js/pdf.js` seguem os modelos aprovados em `Referencias/`. Não altere o design por conta própria sem pedido explícito do Gustavo.
2. **Padrão de imagens:** nomes sempre em minúsculas, sem espaços e sem acentos (`itau.png`, `banco-do-brasil.png`, `whatsapp.png`). O servidor da Vercel é case-sensitive. Rode `preparar-assets.bat` ao adicionar imagens e mantenha `git config core.ignorecase false`.
3. **Versionamento de cache obrigatório:** ao modificar **qualquer** arquivo do app (HTML ou JS), incremente `VERSAO` em `sw.js` (ex.: `dc-gestor-v3.0.1`), senão os celulares instalados continuarão servindo o cache antigo.
4. **Segurança contra XSS:** nunca insira texto vindo do usuário ou do banco via `innerHTML` sem sanitizar com `esc()`.
5. **Mobile-first real:** inputs com `font-size: 16px` (evita zoom automático no iOS), botões/alvos de toque com altura/largura ≥ 44px e respeito às áreas seguras (`safe-area-inset`).
6. **Zero build e zero dependências extras:** não introduza bundlers, frameworks ou bibliotecas externas sem autorização do Gustavo.
7. **Segredos e RLS:** a chave em `js/supabase.js` é a chave pública (`publishable`). Toda a segurança de dados depende das políticas **RLS** no Supabase (isolamento por usuário e por empresa vinculada). Nunca coloque `service_role` ou senhas no código.
8. **Idioma:** toda a interface, mensagens ao usuário, commits e comentários devem estar em **português do Brasil**.
9. **Documentação sempre sincronizada:** sempre que alterar funcionalidades, estrutura de pastas, regras, versão ou schema do banco, atualize na mesma entrega o `README.md` (mantendo exatamente a estrutura e o estilo do `README.md` atual, salvo mudanças estruturais grandes ou pedido do Gustavo) e este `CLAUDE.md`.
10. **`.gitignore` sempre atualizado:** sempre que surgir arquivo ou pasta local que não deva ir para o GitHub (`.env`, rascunhos, backups, referências locais, scripts temporários), adicione ao `.gitignore` na mesma entrega e avise o Gustavo. Se algum arquivo já tiver sido rastreado antes, instrua rodar `git rm --cached <arquivo>`.

## Fluxo de Trabalho
- Priorizar alterações cirúrgicas e validar no celular (ou emulação mobile no DevTools).
- Ao entregar atualizações, listar objetivamente apenas os arquivos alterados e o caminho onde cada um deve ser salvo.
- Backups locais das versões ficam organizados em `DC Gestor/Backups/` na máquina do Gustavo.