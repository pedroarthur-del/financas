# Minhas finanças

Painel pessoal de gastos: Google Forms → Planilha → Apps Script (API com login) → este site no GitHub Pages.

## Arquivos

| Arquivo | Função |
|---|---|
| `setup.gs` | Backend no Apps Script: cria formulário e planilha, contas, sessões, bloqueio e API |
| `config.js` | Único arquivo a editar: URL `/exec` do Apps Script |
| `index.html`, `assets/` | Telas de acesso e painel |

## Renda e previsões

- Aba **Renda** no painel: salário fixo (vale a partir do mês escolhido até mudar) e variáveis por mês (projetos, bônus). Fica na aba Receitas da planilha.
- O painel mostra renda x gasto, sobra prevista, % da renda por categoria, previsão de fim de mês por categoria e o que ajustar para caber no orçamento.
- Previsão: nos primeiros 10 dias do mês mistura o ritmo atual com a média dos 3 meses anteriores. Moradia, Contas fixas, Assinaturas e Educação são previstas pelo teto.

## Fluxo de caixa

- Aba **Fluxo**: saldo no fim de cada dia do mês (entradas, saídas, saldo acumulado), com o menor saldo e os dias negativos.
- Aba **Cadastros**: saldo da conta numa data (ponto de partida), salário fixo com dia, variáveis com dia, contas fixas (valor, dia, categoria, forma) e cartão (fechamento e vencimento).
- Contas fixas entram sozinhas em Lançamentos no dia delas (rotina diária instalada por `autorizar`). Não lance essas contas pelo formulário.
- Compras no crédito saem do saldo no vencimento da fatura. Dias futuros usam uma estimativa do gasto do dia a dia.

## Lançar no app

- Botão **Lançar** fixo na tela: valor, categoria (as mais usadas primeiro), forma de pagamento, descrição e data.
- Toque num lançamento (no Painel ou no Fluxo) para editar ou apagar.
- O formulário do Google continua funcionando como plano B (link em Cadastros).

## Segurança

- **Lembrar de mim:** o aparelho recebe um token próprio (guardado no servidor só como hash) que vale 60 dias desde o último uso e é trocado a cada uso. Sair, redefinir a senha ou rodar `encerrarTodasSessoes()` faz o aparelho ser esquecido.

- A senha não sai do aparelho: o navegador deriva uma chave com PBKDF2-SHA256 (600 mil iterações); o servidor guarda só um hash dessa chave com sal aleatório.
- A primeira conta criada é a dona dos dados. Depois, só cria conta quem tiver código de `gerarConvite()` (uso único, 48 h).
- Bloqueio progressivo: 3 erros pausam 1 min, 6 erros pausam 5 min, 9 erros bloqueiam (libera com `desbloquear()`).
- Sessão expira depois de 30 min parado ou 12 h no total, verificado no servidor e no navegador. O servidor guarda só o hash do token.
- Redefinição de senha por código de 6 números enviado por e-mail (15 min, 5 tentativas). A resposta é igual exista ou não a conta.
- CSP restrita, sem referrer, tudo escapado antes de entrar na tela, dados e sessão só no `sessionStorage`.
- O `GET` da API não devolve dados.
