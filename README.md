# DC Gestor

Aplicativo web mobile-first para **gestão de orçamentos elétricos residenciais**: do levantamento na obra ao orçamento em PDF com Pix, direto no WhatsApp.

**Versão:** 2.0

## Funcionalidades
- **Levantamento em campo:** cadastro do cliente, da obra e dos materiais, com salvamento automático
- **Cotação comparativa:** quantas lojas quiser, com escolha automática do menor preço por item e margem de lucro
- **PDF do orçamento:** layout fiel ao modelo profissional (cliente, itens, totais, Pix e assinaturas)
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

## Créditos
- **Idealização, desenvolvimento e design:** Gustavo Cardoso — DC Elétrica Residencial
- **GitHub:** [@gustavocardosotec](https://github.com/gustavocardosotec)
- Logos de bancos e do WhatsApp pertencem às respectivas marcas e são usados apenas para identificação.

---

*Desenvolvido por Gustavo Cardoso — DC Elétrica Residencial*
