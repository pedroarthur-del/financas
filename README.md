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

## Planejar (v3)

- **Orçamento**: limite por categoria em R$, % do salário fixo ou % da renda; meta de guardar (Investimentos); versões que valem a partir de um mês (ex.: orçamento de 2027 a partir de janeiro); consumo do mês, grade do ano por categoria e renda planejada com aumento de salário programado.
- **Simular**: compra à vista, no crédito, em 3/6/10/12x (com juros e desconto opcionais) ou juntando por 3/6 meses; roda o fluxo de 12 meses para cada formato e recomenda.
- **Parcelas**: compras no crédito podem ser parceladas; cada parcela cai na fatura do mês.
- **Dia útil**: salário e variáveis que caem em fim de semana ou feriado nacional são antecipados (configurável); faturas são adiadas.
- **Foto do comprovante**: com uma chave da API da Anthropic cadastrada no aparelho, a foto da nota ou do Pix preenche o lançamento.

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

## v3.1 — lançar falando

No Lançar, toque em **Falar o gasto** e diga, por exemplo: "gastei 42 e 90 no almoço no Coco Bambu, no crédito do Nubank".
- Sem data, entra como hoje; entende "ontem", "sexta passada", "dia 15".
- Sem forma de pagamento, usa a última que você usou. "Em 3x" vira crédito parcelado.
- Vários gastos numa fala só viram uma lista para conferir e salvar de uma vez.
- Nada é salvo sem confirmação. O áudio vira texto no próprio aparelho; só o texto vai para a IA (mesma chave da leitura de comprovantes).
- No app instalado na tela inicial do iPhone, use o microfone do teclado no campo de texto.

## v3.2 — bancos conectados (Meu Pluggy)

Uso pessoal e gratuito: o Meu Pluggy permite até 5 conexões, sem uso comercial.

1. Em meu.pluggy.ai, conecte seus bancos.
2. Em dashboard.pluggy.ai: Personalização → Conectores → adicione **MeuPluggy**. Depois Aplicações → Demo → Connect Account → escolha **MeuPluggy** e entre com a conta do Meu Pluggy. Copie o id de cada item em *Connected Items*.
3. No Apps Script: cole o setup.gs novo, rode `autorizar` (aceite a permissão de "conectar a serviço externo") e publique uma nova versão.
4. No app: Cadastros → Bancos conectados → Client ID, Client Secret, Item IDs → Salvar e testar.

O servidor busca as movimentações todo dia às 8h (o Meu Pluggy atualiza a cada 24 h) e guarda na aba **Banco**.
Nada entra nos gastos sozinho: o Painel mostra a fila para conferir. Saem da fila automaticamente:
o que você já tinha lançado (mesmo valor, até 3 dias de diferença), o salário fixo, o pagamento da fatura
e as parcelas seguintes de compras parceladas (o app já projeta essas parcelas).
O Client Secret fica nas Propriedades do script e nunca volta para o navegador.
