# Minhas finanças

Painel pessoal de gastos: Google Forms → Planilha → Apps Script (API com login) → este site no GitHub Pages.

## Arquivos

| Arquivo | Função |
|---|---|
| `setup.gs` | Backend no Apps Script: cria formulário e planilha, contas, sessões, bloqueio e API |
| `config.js` | Único arquivo a editar: URL `/exec` do Apps Script |
| `index.html`, `assets/` | Telas de acesso e painel |

## Segurança

- A senha não sai do aparelho: o navegador deriva uma chave com PBKDF2-SHA256 (600 mil iterações); o servidor guarda só um hash dessa chave com sal aleatório.
- A primeira conta criada é a dona dos dados. Depois, só cria conta quem tiver código de `gerarConvite()` (uso único, 48 h).
- Bloqueio progressivo: 3 erros pausam 1 min, 6 erros pausam 5 min, 9 erros bloqueiam (libera com `desbloquear()`).
- Sessão expira depois de 30 min parado ou 12 h no total, verificado no servidor e no navegador. O servidor guarda só o hash do token.
- Redefinição de senha por código de 6 números enviado por e-mail (15 min, 5 tentativas). A resposta é igual exista ou não a conta.
- CSP restrita, sem referrer, tudo escapado antes de entrar na tela, dados e sessão só no `sessionStorage`.
- O `GET` da API não devolve dados.
