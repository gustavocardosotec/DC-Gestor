# DC Gestor

Aplicativo web mobile-first para **gestão de orçamentos elétricos residenciais**: do levantamento na obra ao orçamento e nota de serviço em PDF com Pix, direto no WhatsApp.

**Versão:** 4.0.0 (em construção)

## Funcionalidades
- **Levantamento em campo:** cadastro do cliente, da obra e dos materiais, com salvamento automático
- **Cotação comparativa:** quantas lojas quiser, com escolha automática do menor preço por item e margem de lucro
- **PDF do orçamento:** layout fiel ao modelo profissional (cliente, itens, totais, Pix e assinaturas)
- **Nota de serviço em PDF:** recibo interno limpo e numerado em sequência (Nº 1, 2, 3...), com CNPJ/CPF, dados da empresa e forma de pagamento
- **Orçamento 3.0 / 3.1.2:** tensão 127/220, dados da empresa editáveis por orçamento, acréscimos em lista com nome, seleção opcional de Pix padrão ou escolha livre por orçamento (tanto no perfil pessoal quanto na empresa compartilhada), opção de ocultar o Pix no PDF, novos status (Rascunho, Enviado, Aceito, Em andamento, Pago, Recusado, Concluído), forma de pagamento e botão "Mesma casa / cliente já atendido"; layout em duas colunas no PC
- **Empresa compartilhada com perfil próprio:** código de convite para trabalhar em equipe, mantendo o perfil, Pix, WhatsApps e espaço **Pessoal** (backup privado) totalmente separados do perfil, Pix, WhatsApps e espaço **Da Empresa** (logo, CNPJ/CPF, endereço, parâmetros padrão, mensagem de WhatsApp, orçamentos, clientes e notas compartilhados)
- **Orçamento em OS com 1 toque:** botão "Iniciar OS" no orçamento aceito muda o status para Em andamento sem redigitar nada
- **Filtros rápidos por status:** atalhos com contador (Todos, Pendentes, Aguardando, Em andamento, Concluídos, Recusados) para ver só o que exige atenção
- **Status de material:** marque "Já comprei" em cada item e veja 🟡 Falta comprar ou 🟢 Materiais OK no orçamento e na lista
- **Modo Balcão:** botão 👁️ que oculta custos, preços por loja, margem e lucro para mostrar a tela ao cliente ou ao balconista
- **Reajuste rápido de preço:** +5%, +10%, +15%, percentual livre ou arredondamento do total, ajustando a mão de obra
- **Copiar lista para o balconista:** texto só com quantidade e material, sem preços e sem dados do cliente
- **Clientes salvos:** acesso rápido para reaproveitar dados de clientes e obras anteriores
- **Lojas / Fornecedores com GPS:** cadastro de lojas (pessoal ou da empresa) e botões "Google Maps" e "Waze" para traçar a rota até a loja ou até a casa do cliente
- **Pix e WhatsApp:** várias contas gerenciadas separadamente no perfil pessoal e na empresa compartilhada, QR Code Pix com valor e logo do banco, cartão de apresentação para mostrar ao cliente
- **Tela inicial com atalhos** de Pix e WhatsApp e assistente de configuração no primeiro uso
- **Offline-first (PWA):** funciona sem internet e sincroniza quando o sinal volta
- **Login:** Google ou e-mail e senha (ou uso local, sem conta)

## Tecnologias
| Área | Tecnologia |
|---|---|
| Interface | HTML5, Tailwind CSS (CDN), JavaScript puro (ES modules) |
| Dados e login | Supabase (PostgreSQL + Auth) |
| PDF e QR | html2pdf.js e qrcodejs |
| Hospedagem | Vercel |

## Deploy
Cada push na branch principal publica automaticamente na Vercel. Ao alterar o código, aumente a versão em `sw.js` para o celular atualizar o cache.


## Créditos
- **Idealização, desenvolvimento e design:** Gustavo Cardoso — DC Elétrica Residencial
- **GitHub:** [@gustavocardosotec](https://github.com/gustavocardosotec)
- Logos de bancos e do WhatsApp pertencem às respectivas marcas e são usados apenas para identificação.

---

*Desenvolvido por Gustavo Cardoso — DC Elétrica Residencial*
## Versão 4.0.7 — melhorias concluídas

Este pacote conclui as nove melhorias restantes do plano 4.0, mantendo a edição Alfa original e acrescentando as funções pelo botão **＋ 4.0**:

- Parcelamento com entrada e valor de cada parcela, com PDF complementar.
- Acompanhamento dos orçamentos enviados, prazo ajustável e atalho de retorno pelo WhatsApp.
- Assinatura desenhada na tela, registro do aceite como “Aceito” e PDF complementar com assinatura.
- Lista de compras consolidada para várias obras, somando descrições iguais e deixando de fora materiais marcados como comprados.
- Taxa padrão de deslocamento/visita, aplicada como acréscimo ao orçamento.
- Histórico por endereço, reunindo orçamentos/OS e notas de serviço.
- Agenda da obra, aviso local um dia antes e no dia, e atalho para Google Agenda.
- Estimativa de lucro por pessoa/dia e pessoa/hora comparada às metas do perfil.
- Recibo numerado em PDF ao marcar o orçamento como pago.

Não é necessário instalar bibliotecas ou fazer build. Os recursos de sincronização usam as colunas já previstas no SQL 07; o SQL 08 aditivo também está incluído para bancos que precisem completar os campos sem substituir os scripts anteriores.
