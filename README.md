# DC Gestor

Aplicativo web mobile-first para **gestão de orçamentos elétricos residenciais**: do levantamento na obra ao orçamento e nota de serviço em PDF com Pix, direto no WhatsApp.

**Versão:** 3.0

## Funcionalidades
- **Levantamento em campo:** cadastro do cliente, da obra e dos materiais, com salvamento automático
- **Cotação comparativa:** quantas lojas quiser, com escolha automática do menor preço por item e margem de lucro
- **PDF do orçamento:** layout fiel ao modelo profissional (cliente, itens, totais, Pix e assinaturas)
- **Nota de serviço em PDF:** recibo interno limpo e numerado em sequência (Nº 1, 2, 3...), com CNPJ/CPF, dados da empresa e forma de pagamento
- **Orçamento 3.0:** tensão 127/220, dados da empresa editáveis por orçamento, acréscimos em lista com nome, opção de ocultar o Pix no PDF, novos status (Rascunho, Enviado, Aceito, Em andamento, Pago, Recusado, Concluído), forma de pagamento e botão "Mesma casa / cliente já atendido"; layout em duas colunas no PC
- **Empresa compartilhada:** código de convite para trabalhar em equipe, mantendo o espaço **Pessoal** (backup privado) separado do espaço **Da Empresa** (orçamentos, clientes e notas compartilhados com opção de sincronizar cópias)
- **Clientes salvos:** acesso rápido para reaproveitar dados de clientes e obras anteriores
- **Pix e WhatsApp:** várias contas, QR Code Pix com valor e logo do banco, cartão de apresentação para mostrar ao cliente
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