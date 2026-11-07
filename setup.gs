/**
 * FINANÇAS PESSOAIS — Formulário + Planilha + API com login
 * ---------------------------------------------------------
 * PRIMEIRA INSTALAÇÃO
 *   1. Cole este arquivo inteiro em script.google.com (Novo projeto).
 *   2. Execute "setup" (cria formulário e planilha) e autorize.
 *   3. Execute "autorizar" (libera o envio de e-mail do código de senha).
 *   4. Implantar > Nova implantação > App da Web
 *        Executar como: Eu | Quem pode acessar: Qualquer pessoa
 *      Copie a URL /exec e cole em config.js no GitHub.
 *
 * ATUALIZANDO UMA VERSÃO ANTERIOR (que usava TOKEN)
 *   1. Substitua todo o código por este e salve.
 *   2. Execute "autorizar".
 *   3. Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar.
 *      A URL /exec continua a mesma.
 *
 * FUNÇÕES DE ADMINISTRAÇÃO (rode pelo editor)
 *   gerarConvite()        código para outra pessoa criar conta (vale 48 h)
 *   desbloquear()         libera e-mails pausados ou bloqueados por senha errada
 *   listarUsuarios()      mostra quem tem conta
 *   encerrarTodasSessoes() derruba todos os acessos abertos
 *   removerUsuario()      apaga a conta de EMAIL_PARA_REMOVER
 */

const CONFIG = {
  nomePlanilha: 'Finanças Pessoais',
  nomeFormulario: 'Lançar gasto',
  categorias: [
    'Alimentação', 'Mercado', 'Combustível', 'Transporte', 'Moradia',
    'Contas fixas', 'Saúde', 'Educação', 'Lazer', 'Compras pessoais',
    'Assinaturas', 'Outros'
  ],
  formasPagamento: ['Pix', 'Crédito', 'Débito', 'Dinheiro'],
  fuso: 'America/Fortaleza'
};

/** Regras de segurança. sessaoInativaMin precisa ser igual ao de config.js. */
const SEG = {
  sessaoInativaMin: 30,   // sem uso por esse tempo → sai
  sessaoMaxHoras: 12,     // mesmo usando, pede login de novo depois disso
  bloqueio: { pausa1: 3, pausa2: 6, bloqueia: 9, seg1: 60, seg2: 300 },
  codigoMin: 15,          // validade do código de redefinição
  codigoTentativas: 5,
  conviteHoras: 48
};

const VERSAO = '2.1.0';

const ABA = { respostas: 'Respostas', lanc: 'Lançamentos', tetos: 'Tetos', resumo: 'Resumo', links: 'Links', receitas: 'Receitas' };

const TITULO = {
  valor: 'Valor (R$)',
  categoria: 'Categoria',
  forma: 'Forma de pagamento',
  descricao: 'Descrição (opcional)',
  data: 'Data (só se não foi hoje)'
};

/* =====================================================================
   API  (POST com corpo JSON em text/plain para evitar preflight de CORS)
   ===================================================================== */

class ApiErro extends Error {
  constructor(codigo, mensagem, extra) {
    super(mensagem);
    this.codigo = codigo;
    this.extra = extra || {};
  }
}

const ROTAS = {
  status: () => Auth.status(),
  cadastrar: c => Auth.cadastrar(c),
  entrar: c => Auth.entrar(c),
  sair: c => Auth.sair(c),
  pedirCodigo: c => Auth.pedirCodigo(c),
  redefinir: c => Auth.redefinir(c),
  dados: c => { const s = Sessao.validar(c.token); return Dados.painel(s); },
  salvarFixo: c => { const s = Sessao.validar(c.token); Receitas.salvarFixo(c, s); return Dados.painel(s); },
  adicionarVariavel: c => { const s = Sessao.validar(c.token); Receitas.adicionarVariavel(c, s); return Dados.painel(s); },
  removerReceita: c => { const s = Sessao.validar(c.token); Receitas.remover(c); return Dados.painel(s); }
};

function doPost(e) {
  let corpo;
  try {
    corpo = JSON.parse(e && e.postData ? e.postData.contents : '{}') || {};
  } catch (_) {
    return resposta_({ ok: false, erro: { codigo: 'requisicao_invalida', mensagem: 'Requisição inválida.' } });
  }

  const rota = ROTAS[String(corpo.acao || '')];
  if (!rota) return resposta_({ ok: false, erro: { codigo: 'acao_invalida', mensagem: 'Ação desconhecida.' } });

  try {
    return resposta_({ ok: true, dados: rota(corpo) });
  } catch (err) {
    if (err instanceof ApiErro) {
      return resposta_({ ok: false, erro: Object.assign({ codigo: err.codigo, mensagem: err.message }, err.extra) });
    }
    console.error(JSON.stringify({ acao: corpo.acao, erro: String(err && err.stack || err) }));
    return resposta_({ ok: false, erro: { codigo: 'interno', mensagem: 'Erro no servidor. Tente de novo em instantes.' } });
  }
}

/** GET não expõe dados: só confirma que a API está no ar. */
function doGet() {
  return resposta_({ ok: true, servico: 'financas', versao: VERSAO });
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =====================================================================
   VALIDAÇÃO
   ===================================================================== */

const V = {
  email(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ApiErro('email_invalido', 'Digite um e-mail válido.');
    return s;
  },
  // A senha nunca chega aqui: o navegador envia uma chave PBKDF2 (64 hex)
  chave(v) {
    const s = String(v || '');
    if (!/^[a-f0-9]{64}$/.test(s)) throw new ApiErro('senha_invalida', 'Senha inválida.');
    return s;
  },
  nome(v) {
    const s = String(v || '').replace(/[<>]/g, '').trim().slice(0, 60);
    if (s.length < 2) throw new ApiErro('nome_invalido', 'Digite seu nome.');
    return s;
  },
  token(v) {
    const s = String(v || '');
    if (!/^[a-f0-9]{64}$/.test(s)) throw new ApiErro('sessao_expirada', 'Sua sessão terminou. Entre de novo.');
    return s;
  },
  mes(v) {
    const s = String(v || '');
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s)) throw new ApiErro('mes_invalido', 'Escolha um mês válido.');
    return s;
  },
  valor(v) {
    const n = typeof v === 'number' ? v : Number(String(v || '').replace(/\./g, '').replace(',', '.'));
    if (!isFinite(n) || n <= 0 || n > 10000000) throw new ApiErro('valor_invalido', 'Digite um valor maior que zero.');
    return Math.round(n * 100) / 100;
  },
  texto(v, max) {
    return String(v || '').replace(/[<>]/g, '').trim().slice(0, max);
  },
  codigo(v) {
    const s = String(v || '').replace(/\D/g, '');
    if (s.length !== 6) throw new ApiErro('codigo_invalido', 'O código tem 6 números.');
    return s;
  }
};

/* =====================================================================
   ARMAZENAMENTO PRIVADO (Propriedades do script: não aparecem na planilha)
   u:<email> usuário | s:<hash> sessão | t:<email> tentativas
   r:<email> código de senha | CONVITE
   ===================================================================== */

const Store = {
  p: () => PropertiesService.getScriptProperties(),
  get(k) { const v = this.p().getProperty(k); return v ? JSON.parse(v) : null; },
  set(k, o) { this.p().setProperty(k, JSON.stringify(o)); },
  del(k) { this.p().deleteProperty(k); },
  chaves(prefixo) { return this.p().getKeys().filter(k => k.indexOf(prefixo) === 0); }
};

function sha_(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

/** 64 hex aleatórios (2 UUID v4, gerados com SecureRandom). */
function aleatorio_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** Comparação em tempo constante. */
function igual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function comTrava_(fn) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(10000)) throw new ApiErro('ocupado', 'Servidor ocupado. Tente de novo.');
  try { return fn(); } finally { trava.releaseLock(); }
}

/* =====================================================================
   BLOQUEIO PROGRESSIVO
   3 erros → pausa 1 min | 6 erros → pausa 5 min | 9 erros → bloqueado
   ===================================================================== */

const Bloqueio = {
  ler(email) {
    const t = Store.get('t:' + email) || { n: 0, ate: 0, ult: 0 };
    // Erros antigos (24 h) caducam, exceto bloqueio total
    if (t.n < SEG.bloqueio.bloqueia && t.ult && Date.now() - t.ult > 86400000) return { n: 0, ate: 0, ult: 0 };
    return t;
  },
  situacao(t) {
    const B = SEG.bloqueio;
    if (t.n >= B.bloqueia) return { bloqueado: true, espera: 0, restantes: 0 };
    const espera = t.ate > Date.now() ? Math.ceil((t.ate - Date.now()) / 1000) : 0;
    const restantes = t.n < B.pausa1 ? B.pausa1 - t.n : t.n < B.pausa2 ? B.pausa2 - t.n : B.bloqueia - t.n;
    return { bloqueado: false, espera, restantes };
  },
  verificar(email) {
    const s = this.situacao(this.ler(email));
    if (s.bloqueado) throw new ApiErro('bloqueado', 'Acesso bloqueado depois de 9 senhas erradas. Para liberar, rode a função desbloquear no Apps Script.');
    if (s.espera > 0) throw new ApiErro('aguarde', 'Muitas tentativas erradas. Aguarde para tentar de novo.', { espera: s.espera });
  },
  falhar(email) {
    const B = SEG.bloqueio;
    const t = this.ler(email);
    t.n += 1;
    t.ult = Date.now();
    t.ate = t.n === B.pausa1 ? Date.now() + B.seg1 * 1000 : t.n === B.pausa2 ? Date.now() + B.seg2 * 1000 : 0;
    Store.set('t:' + email, t);
    return this.situacao(t);
  },
  limpar(email) { Store.del('t:' + email); }
};

/* =====================================================================
   SESSÕES  (o servidor guarda só o hash do token)
   ===================================================================== */

const Sessao = {
  abrir(usuario) {
    const token = aleatorio_();
    const agora = Date.now();
    Store.set('s:' + sha_(token), { email: usuario.email, nome: usuario.nome, criada: agora, ultimo: agora });
    return { token, nome: usuario.nome, email: usuario.email, sessaoMin: SEG.sessaoInativaMin };
  },
  validar(token) {
    const k = 's:' + sha_(V.token(token));
    const s = Store.get(k);
    const agora = Date.now();
    const expirou = !s
      || agora - s.ultimo > SEG.sessaoInativaMin * 60000
      || agora - s.criada > SEG.sessaoMaxHoras * 3600000;
    const u = s ? Store.get('u:' + s.email) : null;
    if (expirou || !u || u.ativo === false) {
      if (s) Store.del(k);
      throw new ApiErro('sessao_expirada', 'Sua sessão terminou. Entre de novo.');
    }
    if (agora - s.ultimo > 60000) { s.ultimo = agora; Store.set(k, s); }
    return s;
  },
  encerrar(token) {
    if (/^[a-f0-9]{64}$/.test(String(token || ''))) Store.del('s:' + sha_(token));
  },
  encerrarDe(email) {
    Store.chaves('s:').forEach(k => { const s = Store.get(k); if (!s || s.email === email) Store.del(k); });
  },
  limparVencidas() {
    const agora = Date.now();
    Store.chaves('s:').forEach(k => {
      const s = Store.get(k);
      if (!s || agora - s.ultimo > SEG.sessaoInativaMin * 60000 || agora - s.criada > SEG.sessaoMaxHoras * 3600000) Store.del(k);
    });
  }
};

/* =====================================================================
   CONTAS
   ===================================================================== */

const Auth = {
  totalUsuarios() { return Store.chaves('u:').length; },

  status() {
    const total = this.totalUsuarios();
    return { temConta: total > 0, sessaoMin: SEG.sessaoInativaMin, versao: VERSAO };
  },

  cadastrar(c) {
    const nome = V.nome(c.nome), email = V.email(c.email), chave = V.chave(c.chave);
    return comTrava_(() => {
      const total = this.totalUsuarios();
      if (total > 0) {
        const conv = Store.get('CONVITE');
        const cod = String(c.convite || '').trim().toUpperCase();
        if (!conv || conv.exp < Date.now() || !cod || !igual_(sha_(cod), conv.hash)) {
          throw new ApiErro('convite_invalido', 'Código de convite inválido ou vencido. Gere um novo com a função gerarConvite.');
        }
      }
      if (Store.get('u:' + email)) throw new ApiErro('email_em_uso', 'Este e-mail já tem conta. Use Entrar.');
      const sal = aleatorio_();
      const usuario = {
        nome, email, sal, hash: sha_(sal + chave),
        papel: total === 0 ? 'dono' : 'membro', ativo: true, criado: new Date().toISOString()
      };
      Store.set('u:' + email, usuario);
      if (total > 0) Store.del('CONVITE');
      return Sessao.abrir(usuario);
    });
  },

  entrar(c) {
    const email = V.email(c.email), chave = V.chave(c.chave);
    return comTrava_(() => {
      Bloqueio.verificar(email);
      const u = Store.get('u:' + email);
      const confere = sha_((u ? u.sal : 'x') + chave); // calcula sempre: mesmo tempo com ou sem conta
      if (!u || u.ativo === false || !igual_(confere, u.hash)) {
        const s = Bloqueio.falhar(email);
        if (s.bloqueado) throw new ApiErro('bloqueado', 'Acesso bloqueado depois de 9 senhas erradas. Para liberar, rode a função desbloquear no Apps Script.');
        if (s.espera > 0) throw new ApiErro('aguarde', 'E-mail ou senha incorretos. O acesso foi pausado por segurança.', { espera: s.espera });
        throw new ApiErro('credenciais', 'E-mail ou senha incorretos.', { restantes: s.restantes });
      }
      Bloqueio.limpar(email);
      Sessao.limparVencidas();
      return Sessao.abrir(u);
    });
  },

  sair(c) { Sessao.encerrar(c.token); return { saiu: true }; },

  /** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
  pedirCodigo(c) {
    const email = V.email(c.email);
    comTrava_(() => {
      const u = Store.get('u:' + email);
      const atual = Store.get('r:' + email);
      if (!u || u.ativo === false) return;
      if (atual && Date.now() - atual.criado < 60000) return; // 1 e-mail por minuto
      const codigo = ('00000' + (parseInt(aleatorio_().slice(0, 10), 16) % 1000000)).slice(-6);
      Store.set('r:' + email, { hash: sha_(codigo + '|' + email), exp: Date.now() + SEG.codigoMin * 60000, tent: 0, criado: Date.now() });
      MailApp.sendEmail({
        to: email,
        subject: 'Seu código para criar uma nova senha',
        body: `Olá, ${u.nome}.\n\nSeu código é: ${codigo}\n\nEle vale por ${SEG.codigoMin} minutos. ` +
          'Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.\n\nMinhas Finanças'
      });
    });
    return { enviado: true };
  },

  redefinir(c) {
    const email = V.email(c.email), codigo = V.codigo(c.codigo), chave = V.chave(c.chave);
    return comTrava_(() => {
      const r = Store.get('r:' + email);
      const u = Store.get('u:' + email);
      if (!r || !u || r.exp < Date.now()) { Store.del('r:' + email); throw new ApiErro('codigo_invalido', 'Código vencido. Peça um novo.'); }
      r.tent += 1;
      if (!igual_(sha_(codigo + '|' + email), r.hash)) {
        if (r.tent >= SEG.codigoTentativas) { Store.del('r:' + email); throw new ApiErro('codigo_invalido', 'Código errado muitas vezes. Peça um novo.'); }
        Store.set('r:' + email, r);
        throw new ApiErro('codigo_invalido', 'Código incorreto. Confira o e-mail e tente de novo.');
      }
      u.sal = aleatorio_();
      u.hash = sha_(u.sal + chave);
      Store.set('u:' + email, u);
      Store.del('r:' + email);
      Bloqueio.limpar(email);
      Sessao.encerrarDe(email); // derruba acessos antigos
      return Sessao.abrir(u);
    });
  }
};

/* =====================================================================
   RECEITAS  (aba Receitas: ID | Mês | Tipo | Descrição | Valor | Lançado por | Criado em)
   Fixo vale a partir do mês informado até o próximo registro de fixo.
   ===================================================================== */

const Receitas = {
  CAB: ['ID', 'Mês', 'Tipo', 'Descrição', 'Valor', 'Lançado por', 'Criado em'],
  aba() {
    const ss = Dados.planilha();
    let a = ss.getSheetByName(ABA.receitas);
    if (!a) {
      a = ss.insertSheet(ABA.receitas);
      a.getRange(1, 1, 1, this.CAB.length).setValues([this.CAB]).setFontWeight('bold').setBackground('#E8EAF6');
      a.setFrozenRows(1);
      a.getRange('A:B').setNumberFormat('@');
      a.getRange('E2:E').setNumberFormat('"R$" #,##0.00');
      a.setColumnWidths(1, 7, 130);
    }
    return a;
  },
  listar() {
    const a = Dados.planilha().getSheetByName(ABA.receitas);
    if (!a) return [];
    return a.getDataRange().getValues().slice(1)
      .filter(l => l[0] && l[1])
      .map(l => ({
        id: String(l[0]),
        mes: l[1] instanceof Date ? Utilities.formatDate(l[1], CONFIG.fuso, 'yyyy-MM') : String(l[1]),
        tipo: String(l[2]) === 'Fixo' ? 'fixo' : 'variavel',
        descricao: String(l[3] || ''),
        valor: Number(l[4]) || 0
      }));
  },
  inserir(mes, tipo, descricao, valor, sessao) {
    const a = this.aba();
    const id = aleatorio_().slice(0, 12);
    const linha = a.getLastRow() + 1;
    a.getRange(linha, 1, 1, 2).setNumberFormat('@');
    a.getRange(linha, 1, 1, 7).setValues([[id, mes, tipo, descricao, valor, sessao.nome, new Date()]]);
    return id;
  },
  salvarFixo(c, sessao) {
    const mes = V.mes(c.mes), valor = V.valor(c.valor);
    comTrava_(() => {
      // um fixo por mês: substitui se já houver registro naquele mês
      const a = this.aba(), vals = a.getDataRange().getValues();
      for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][1]) === mes && String(vals[i][2]) === 'Fixo') a.deleteRow(i + 1);
      this.inserir(mes, 'Fixo', V.texto(c.descricao, 80) || 'Salário fixo', valor, sessao);
    });
  },
  adicionarVariavel(c, sessao) {
    const mes = V.mes(c.mes), valor = V.valor(c.valor);
    const descricao = V.texto(c.descricao, 80);
    if (descricao.length < 2) throw new ApiErro('descricao_invalida', 'Diga de onde veio o valor (ex.: nome do projeto).');
    comTrava_(() => this.inserir(mes, 'Variável', descricao, valor, sessao));
  },
  remover(c) {
    const id = String(c.id || '');
    if (!/^[a-f0-9]{12}$/.test(id)) throw new ApiErro('id_invalido', 'Registro não encontrado.');
    comTrava_(() => {
      const a = this.aba(), vals = a.getDataRange().getValues();
      for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][0]) === id) { a.deleteRow(i + 1); return; }
      throw new ApiErro('nao_encontrado', 'Esse registro já foi removido.');
    });
  }
};

/* =====================================================================
   DADOS DO PAINEL
   ===================================================================== */

const Dados = {
  planilha() {
    const id = Store.p().getProperty('SHEET_ID');
    if (!id) throw new ApiErro('sem_planilha', 'A planilha ainda não foi criada. Rode a função setup no Apps Script.');
    return SpreadsheetApp.openById(id);
  },
  painel(sessao) {
    const ss = this.planilha();
    const lancamentos = ss.getSheetByName(ABA.lanc).getDataRange().getValues().slice(1)
      .filter(l => l[0] !== '' && l[1] !== '')
      .map(l => ({
        data: l[0] instanceof Date ? Utilities.formatDate(l[0], CONFIG.fuso, 'yyyy-MM-dd') : String(l[0]),
        valor: Number(String(l[1]).replace(',', '.')) || 0,
        categoria: String(l[2] || 'Outros'),
        forma: String(l[3] || ''),
        descricao: String(l[4] || ''),
        origem: String(l[5] || '')
      }));
    const tetos = ss.getSheetByName(ABA.tetos).getDataRange().getValues().slice(1)
      .filter(l => l[0] && CONFIG.categorias.includes(String(l[0])))
      .map(l => ({ categoria: String(l[0]), teto: Number(l[1]) || 0 }));
    return { atualizado: new Date().toISOString(), usuario: { nome: sessao.nome }, lancamentos, tetos, receitas: Receitas.listar() };
  }
};

/* =====================================================================
   SETUP (cria formulário + planilha)
   ===================================================================== */

function setup() {
  const props = Store.p();
  if (props.getProperty('SHEET_ID')) {
    mostrarLinks();
    throw new Error('O setup já foi executado. Os links estão no registro acima.');
  }

  const form = FormApp.create(CONFIG.nomeFormulario);
  form.setDescription('10 segundos: valor, categoria e forma de pagamento.')
    .setConfirmationMessage('✅ Gasto lançado!')
    .setShowLinkToRespondAgain(true)
    .setProgressBar(false)
    .setAllowResponseEdits(false)
    .setCollectEmail(false);

  form.addTextItem()
    .setTitle(TITULO.valor)
    .setHelpText('Só o número, sem ponto de milhar. Ex.: 45,90')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Digite só o número. Ex.: 45,90')
        .requireTextMatchesPattern('^\\s*\\d{1,7}([.,]\\d{1,2})?\\s*$')
        .build()
    );

  const itemCategoria = form.addMultipleChoiceItem()
    .setTitle(TITULO.categoria).setChoiceValues(CONFIG.categorias).setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle(TITULO.forma).setChoiceValues(CONFIG.formasPagamento).setRequired(true);
  form.addTextItem().setTitle(TITULO.descricao);
  form.addDateItem().setTitle(TITULO.data);

  let ss = SpreadsheetApp.create(CONFIG.nomePlanilha);
  ss.setSpreadsheetTimeZone(CONFIG.fuso);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  let abaRespostas = null;
  for (let i = 0; i < 10 && !abaRespostas; i++) {
    Utilities.sleep(1000);
    ss = SpreadsheetApp.openById(ss.getId());
    abaRespostas = ss.getSheets().find(s => s.getFormUrl());
  }
  if (abaRespostas) abaRespostas.setName(ABA.respostas);

  const n = CONFIG.categorias.length;
  const moeda = '"R$" #,##0.00';

  const lanc = ss.insertSheet(ABA.lanc, 0);
  lanc.getRange('A1:F1')
    .setValues([['Data', 'Valor', 'Categoria', 'Forma de pagamento', 'Descrição', 'Origem']])
    .setFontWeight('bold').setBackground('#E8EAF6');
  lanc.setFrozenRows(1);
  lanc.getRange('A2:A').setNumberFormat('dd/MM/yyyy');
  lanc.getRange('B2:B').setNumberFormat(moeda);
  lanc.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.categorias, true).setAllowInvalid(false).build());
  lanc.getRange('D2:D').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.formasPagamento, true).setAllowInvalid(false).build());
  lanc.setColumnWidths(1, 6, 140);

  const tetos = ss.insertSheet(ABA.tetos, 1);
  tetos.getRange('A1:B1').setValues([['Categoria', 'Teto mensal (R$)']]).setFontWeight('bold').setBackground('#E8EAF6');
  tetos.getRange(2, 1, n, 2).setValues(CONFIG.categorias.map(c => [c, 0]));
  tetos.getRange(2, 2, n, 1).setNumberFormat(moeda).setBackground('#FFF8E1');
  tetos.getRange(n + 3, 1).setValue('👉 Preencha os tetos na coluna amarela.').setFontStyle('italic');
  tetos.setColumnWidths(1, 2, 170);

  const res = ss.insertSheet(ABA.resumo, 2);
  res.getRange('A1:A2').setValues([['Início do mês'], ['Fim do mês']]).setFontWeight('bold');
  res.getRange('B1').setFormula('=DATE(YEAR(TODAY()),MONTH(TODAY()),1)');
  res.getRange('B2').setFormula('=EOMONTH(B1,0)');
  res.getRange('B1:B2').setNumberFormat('dd/MM/yyyy');
  res.getRange('A4:E4').setValues([['Categoria', 'Gasto no mês', 'Teto', '% usado', 'Saldo']])
    .setFontWeight('bold').setBackground('#E8EAF6');

  const L = "'" + ABA.lanc + "'";
  res.getRange(5, 1, n, 5).setValues(CONFIG.categorias.map((c, i) => {
    const r = 5 + i;
    return [
      c,
      `=SUMIFS(${L}!$B:$B,${L}!$C:$C,$A${r},${L}!$A:$A,">="&$B$1,${L}!$A:$A,"<"&($B$2+1))`,
      `=IFERROR(VLOOKUP($A${r},Tetos!$A:$B,2,FALSE),0)`,
      `=IF(C${r}>0,B${r}/C${r},"")`,
      `=C${r}-B${r}`
    ];
  }));
  const ult = 4 + n, tot = ult + 1;
  res.getRange(tot, 1, 1, 5).setValues([[
    'TOTAL', `=SUM(B5:B${ult})`, `=SUM(C5:C${ult})`, `=IF(C${tot}>0,B${tot}/C${tot},"")`, `=C${tot}-B${tot}`
  ]]).setFontWeight('bold').setBackground('#F5F5F5');
  res.getRange(tot + 2, 1, 1, 2).setValues([['Projeção fim do mês', `=B${tot}/DAY(TODAY())*DAY(B2)`]]).setFontWeight('bold');
  res.getRange(`B5:C${tot}`).setNumberFormat(moeda);
  res.getRange(`E5:E${tot}`).setNumberFormat(moeda);
  res.getRange(`B${tot + 2}`).setNumberFormat(moeda);
  res.getRange(`D5:D${tot}`).setNumberFormat('0%');
  const faixa = res.getRange(`D5:D${tot}`);
  res.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(1)
      .setBackground('#FFCDD2').setFontColor('#B71C1C').setRanges([faixa]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(0.8)
      .setBackground('#FFE0B2').setFontColor('#E65100').setRanges([faixa]).build()
  ]);
  res.setColumnWidths(1, 5, 150);

  const links = ss.insertSheet(ABA.links, 3);
  links.getRange('A1:B1').setValues([['Atalho', 'Link']]).setFontWeight('bold').setBackground('#E8EAF6');
  const linhasLinks = [['Formulário (geral)', form.getPublishedUrl()]];
  CONFIG.categorias.forEach(c => {
    linhasLinks.push([c, form.createResponse().withItemResponse(itemCategoria.createResponse(c)).toPrefilledUrl()]);
  });
  links.getRange(2, 1, linhasLinks.length, 2).setValues(linhasLinks);
  links.setColumnWidth(1, 170);
  links.setColumnWidth(2, 600);

  const nossas = Object.values(ABA);
  ss.getSheets().forEach(s => {
    if (!nossas.includes(s.getName()) && !s.getFormUrl() && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  ss.setActiveSheet(ss.getSheetByName(ABA.resumo));

  ScriptApp.newTrigger('aoEnviarFormulario').forForm(form).onFormSubmit().create();
  props.setProperties({ SHEET_ID: ss.getId(), FORM_ID: form.getId() });

  mostrarLinks();
}

/* ===================== GATILHO DO FORMULÁRIO ===================== */

function aoEnviarFormulario(e) {
  const r = e.response;
  const resp = {};
  r.getItemResponses().forEach(ir => { resp[ir.getItem().getTitle()] = ir.getResponse(); });

  const valor = parseFloat(String(resp[TITULO.valor] || '0').trim().replace(',', '.'));
  const ymd = resp[TITULO.data]
    ? String(resp[TITULO.data])
    : Utilities.formatDate(r.getTimestamp(), CONFIG.fuso, 'yyyy-MM-dd');
  const [y, m, d] = ymd.split('-').map(Number);

  Dados.planilha().getSheetByName(ABA.lanc).appendRow([
    new Date(y, m - 1, d, 12),
    valor,
    resp[TITULO.categoria] || 'Outros',
    resp[TITULO.forma] || '',
    String(resp[TITULO.descricao] || '').slice(0, 200),
    'Formulário'
  ]);
}

/* ======================= ADMINISTRAÇÃO ======================= */

/** Rode uma vez para liberar o envio de e-mail e o acesso às propriedades. */
function autorizar() {
  Logger.log('E-mails disponíveis hoje: ' + MailApp.getRemainingDailyQuota());
  Store.del('TOKEN'); // remove o token da versão anterior
  Logger.log('✅ Autorizado. Agora atualize a implantação (Gerenciar implantações > Nova versão).');
}

function mostrarLinks() {
  const p = Store.p();
  const ss = SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
  const form = FormApp.openById(p.getProperty('FORM_ID'));
  Logger.log('📋 Formulário (para lançar): ' + form.getPublishedUrl());
  Logger.log('✏️  Editar formulário: ' + form.getEditUrl());
  Logger.log('📊 Planilha: ' + ss.getUrl());
  Logger.log('👤 Contas criadas: ' + Auth.totalUsuarios());
}

function gerarConvite() {
  const codigo = aleatorio_().slice(0, 10).toUpperCase();
  Store.set('CONVITE', { hash: sha_(codigo), exp: Date.now() + SEG.conviteHoras * 3600000 });
  Logger.log('🎟️  Código de convite (vale ' + SEG.conviteHoras + ' h, uso único): ' + codigo);
}

/** Libera todos os e-mails pausados ou bloqueados por senha errada. */
function desbloquear() {
  const k = Store.chaves('t:');
  k.forEach(x => Store.del(x));
  Logger.log('🔓 Desbloqueados: ' + (k.map(x => x.slice(2)).join(', ') || 'nenhum bloqueio ativo'));
}

/** Para remover uma conta, escreva o e-mail aqui e rode removerUsuario. */
const EMAIL_PARA_REMOVER = '';

function listarUsuarios() {
  Store.chaves('u:').forEach(k => {
    const u = Store.get(k);
    const t = Bloqueio.situacao(Bloqueio.ler(u.email));
    Logger.log(`${u.nome} <${u.email}> · ${u.papel} · ${u.ativo === false ? 'desativado' : 'ativo'}${t.bloqueado ? ' · BLOQUEADO' : ''}`);
  });
}

function encerrarTodasSessoes() {
  Store.chaves('s:').forEach(k => Store.del(k));
  Logger.log('🚪 Todas as sessões foram encerradas.');
}

function removerUsuario() {
  const email = String(EMAIL_PARA_REMOVER).trim().toLowerCase();
  if (!email) throw new Error('Preencha EMAIL_PARA_REMOVER antes de rodar.');
  Store.del('u:' + email);
  Sessao.encerrarDe(email);
  Logger.log('🗑️  Conta removida: ' + email);
}
