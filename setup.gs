/**
 * FINANÇAS PESSOAIS — Formulário + Planilha + API com login
 * ---------------------------------------------------------
 * PRIMEIRA INSTALAÇÃO
 *   1. Cole este arquivo inteiro em script.google.com (Novo projeto).
 *   2. Execute "setup" (cria formulário e planilha) e autorize.
 *   3. Execute "autorizar" (libera o e-mail do código de senha e instala a rotina das contas fixas).
 *   4. Implantar > Nova implantação > App da Web
 *        Executar como: Eu | Quem pode acessar: Qualquer pessoa
 *      Copie a URL /exec e cole em config.js no GitHub.
 *
 * ATUALIZANDO UMA VERSÃO ANTERIOR (que usava TOKEN)
 *   1. Substitua todo o código por este e salve.
 *   2. Execute "autorizar" (de novo a cada versão nova: reinstala a rotina diária).
 *   3. Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar.
 *      A URL /exec continua a mesma.
 *
 * FUNÇÕES DE ADMINISTRAÇÃO (rode pelo editor)
 *   gerarConvite()        código para outra pessoa criar conta (vale 48 h)
 *   desbloquear()         libera e-mails pausados ou bloqueados por senha errada
 *   listarUsuarios()      mostra quem tem conta
 *   encerrarTodasSessoes() derruba todos os acessos e esquece os aparelhos lembrados
 *   removerUsuario()      apaga a conta de EMAIL_PARA_REMOVER
 */

const CONFIG = {
  nomePlanilha: 'Finanças Pessoais',
  nomeFormulario: 'Lançar gasto',
  categorias: [
    'Alimentação', 'Mercado', 'Combustível', 'Transporte', 'Moradia',
    'Contas fixas', 'Saúde', 'Educação', 'Lazer', 'Compras pessoais',
    'Assinaturas', 'Outros', 'Investimentos'
  ],
  formasPagamento: ['Pix', 'Crédito', 'Débito', 'Dinheiro'],
  tiposEntrada: ['Variável', 'Venda', 'Reembolso', 'Presente', 'Rendimento', 'Outros'],
  fuso: 'America/Fortaleza'
};

/** Regras de segurança. sessaoInativaMin precisa ser igual ao de config.js. */
const SEG = {
  sessaoInativaMin: 30,   // sem uso por esse tempo → sai
  sessaoMaxHoras: 12,     // mesmo usando, pede login de novo depois disso
  bloqueio: { pausa1: 3, pausa2: 6, bloqueia: 9, seg1: 60, seg2: 300 },
  codigoMin: 15,          // validade do código de redefinição
  codigoTentativas: 5,
  conviteHoras: 48,
  aparelhoDias: 60       // "lembrar de mim": dias sem precisar da senha (renova a cada uso)
};

const VERSAO = '3.2.0';

const ABA = { respostas: 'Respostas', lanc: 'Lançamentos', tetos: 'Tetos', resumo: 'Resumo', links: 'Links', receitas: 'Receitas', contas: 'Contas fixas', banco: 'Banco' };

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
  editarReceita: c => { const s = Sessao.validar(c.token); Receitas.editarVariavel(c); return Dados.painel(s); },
  salvarRecorrente: c => { const s = Sessao.validar(c.token); Ajustes.salvarRecorrente(c); return Dados.painel(s); },
  removerRecorrente: c => { const s = Sessao.validar(c.token); Ajustes.removerRecorrente(c); return Dados.painel(s); },
  removerReceita: c => { const s = Sessao.validar(c.token); Receitas.remover(c); return Dados.painel(s); },
  salvarConta: c => { const s = Sessao.validar(c.token); Contas.salvar(c, s); return Dados.painel(s); },
  removerConta: c => { const s = Sessao.validar(c.token); Contas.remover(c); return Dados.painel(s); },
  retomar: c => Aparelho.retomar(c),
  lancar: c => { const s = Sessao.validar(c.token); Lancamentos.criar(c, s); return Dados.painel(s); },
  editarLancamento: c => { const s = Sessao.validar(c.token); Lancamentos.editar(c); return Dados.painel(s); },
  removerLancamento: c => { const s = Sessao.validar(c.token); Lancamentos.remover(c); return Dados.painel(s); },
  salvarCartao: c => { const s = Sessao.validar(c.token); Ajustes.salvarCartao(c); return Dados.painel(s); },
  removerCartao: c => { const s = Sessao.validar(c.token); Ajustes.removerCartao(c); return Dados.painel(s); },
  salvarOrcamento: c => { const s = Sessao.validar(c.token); Orcamento.salvar(c); return Dados.painel(s); },
  removerOrcamento: c => { const s = Sessao.validar(c.token); Orcamento.remover(c); return Dados.painel(s); },
  salvarAjustes: c => { const s = Sessao.validar(c.token); Ajustes.salvar(c); return Dados.painel(s); },
  salvarBanco: c => { const s = Sessao.validar(c.token); Banco.configurar(c); return Dados.painel(s); },
  sincronizarBanco: c => { const s = Sessao.validar(c.token); Banco.sincronizar(); return Dados.painel(s); },
  importarBanco: c => { const s = Sessao.validar(c.token); Banco.importar(c, s); return Dados.painel(s); },
  ignorarBanco: c => { const s = Sessao.validar(c.token); Banco.ignorar(c); return Dados.painel(s); }
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
  dia(v, padrao) {
    if (v === undefined || v === null || v === '') return padrao;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new ApiErro('dia_invalido', 'O dia precisa ser de 1 a 31.');
    return n;
  },
  saldo(v) {
    const n = typeof v === 'number' ? v : Number(String(v || '').replace(/\./g, '').replace(',', '.'));
    if (!isFinite(n) || Math.abs(n) > 100000000) throw new ApiErro('valor_invalido', 'Digite o saldo da conta.');
    return Math.round(n * 100) / 100;
  },
  data(v) {
    const s = String(v || '');
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(s)) throw new ApiErro('data_invalida', 'Data inválida.');
    return s;
  },
  forma(v) {
    const s = String(v || '');
    if (!CONFIG.formasPagamento.includes(s)) throw new ApiErro('forma_invalida', 'Escolha a forma de pagamento.');
    return s;
  },
  categoria(v) {
    const s = String(v || '');
    if (!CONFIG.categorias.includes(s)) throw new ApiErro('categoria_invalida', 'Escolha uma categoria.');
    return s;
  },
  parcelas(v) {
    const n = v === undefined || v === null || v === '' ? 1 : Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 48) throw new ApiErro('parcelas_invalidas', 'As parcelas vão de 1 a 48.');
    return n;
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
      const s = Sessao.abrir(usuario);
      if (c.lembrar === true) s.aparelho = Aparelho.emitir(usuario, String(c.nomeAparelho || ''));
      return s;
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
      const s = Sessao.abrir(u);
      if (c.lembrar === true) s.aparelho = Aparelho.emitir(u, String(c.nomeAparelho || ''));
      return s;
    });
  },

  sair(c) { Sessao.encerrar(c.token); Aparelho.esquecer(c.aparelho); return { saiu: true }; },

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
      Aparelho.esquecerDe(email);
      const s = Sessao.abrir(u);
      if (c.lembrar === true) s.aparelho = Aparelho.emitir(u, String(c.nomeAparelho || ''));
      return s;
    });
  }
};

/* =====================================================================
   RECEITAS  (aba Receitas: ID | Mês | Tipo | Descrição | Valor | Lançado por | Criado em | Dia)
   Fixo vale a partir do mês informado até o próximo registro de fixo.
   ===================================================================== */

const Receitas = {
  CAB: ['ID', 'Mês', 'Tipo', 'Descrição', 'Valor', 'Lançado por', 'Criado em', 'Dia', 'Tipo de entrada', 'Recorrente'],
  aba() {
    const ss = Dados.planilha();
    let a = ss.getSheetByName(ABA.receitas);
    if (!a) {
      a = ss.insertSheet(ABA.receitas);
      a.getRange(1, 1, 1, this.CAB.length).setValues([this.CAB]).setFontWeight('bold').setBackground('#E8EAF6');
      a.setFrozenRows(1);
      a.getRange('A:B').setNumberFormat('@');
      a.getRange('E2:E').setNumberFormat('"R$" #,##0.00');
      a.setColumnWidths(1, 8, 130);
    }
    if (a.getRange(1, 10).getValue() !== 'Recorrente') {
      a.getRange(1, 8, 1, 3).setValues([['Dia', 'Tipo de entrada', 'Recorrente']]).setFontWeight('bold').setBackground('#E8EAF6');
      a.getRange('J:J').setNumberFormat('@');
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
        valor: Number(l[4]) || 0,
        dia: Number(l[7]) || (String(l[2]) === 'Fixo' ? 15 : 30),
        categoria: String(l[8] || (String(l[2]) === 'Fixo' ? 'Salário' : 'Variável')),
        recorrente: String(l[9] || '')
      }));
  },
  inserir(mes, tipo, descricao, valor, sessao, dia, categoria, recorrente) {
    const a = this.aba();
    const id = aleatorio_().slice(0, 12);
    const linha = a.getLastRow() + 1;
    a.getRange(linha, 1, 1, 2).setNumberFormat('@');
    a.getRange(linha, 10).setNumberFormat('@');
    a.getRange(linha, 1, 1, 10).setValues([[id, mes, tipo, descricao, valor, sessao.nome, new Date(), dia, categoria || '', recorrente || '']]);
    return id;
  },
  /** Mês e dia de uma entrada: pela data (yyyy-MM-dd) ou pelo par mês + dia. */
  quando(c) {
    if (c.data) { const d = V.data(c.data); return { mes: d.slice(0, 7), dia: Number(d.slice(8, 10)) }; }
    return { mes: V.mes(c.mes), dia: V.dia(c.dia, 30) };
  },
  validarEntrada(c) {
    const valor = V.valor(c.valor), q = this.quando(c);
    const categoria = CONFIG.tiposEntrada.includes(String(c.categoria)) ? String(c.categoria) : 'Variável';
    const recorrente = c.recorrente ? String(c.recorrente) : '';
    if (recorrente && !Ajustes.ler().recorrentes.some(r => r.id === recorrente)) throw new ApiErro('recorrente_invalido', 'Essa entrada recorrente não existe mais.');
    const descricao = V.texto(c.descricao, 80) || (recorrente ? Ajustes.ler().recorrentes.find(r => r.id === recorrente).nome : '');
    if (descricao.length < 2) throw new ApiErro('descricao_invalida', 'Diga de onde veio o dinheiro (ex.: Projeto NSF, venda da bicicleta).');
    return { valor, mes: q.mes, dia: q.dia, categoria, recorrente, descricao };
  },
  salvarFixo(c, sessao) {
    const mes = V.mes(c.mes), valor = V.valor(c.valor), dia = V.dia(c.dia, 15);
    comTrava_(() => {
      // um fixo por mês: substitui se já houver registro naquele mês
      const a = this.aba(), vals = a.getDataRange().getValues();
      for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][1]) === mes && String(vals[i][2]) === 'Fixo') a.deleteRow(i + 1);
      this.inserir(mes, 'Fixo', V.texto(c.descricao, 80) || 'Salário fixo', valor, sessao, dia);
    });
  },
  adicionarVariavel(c, sessao) {
    const e = this.validarEntrada(c);
    comTrava_(() => this.inserir(e.mes, 'Variável', e.descricao, e.valor, sessao, e.dia, e.categoria, e.recorrente));
  },
  editarVariavel(c) {
    const e = this.validarEntrada(c), id = String(c.id || '');
    if (!/^[a-f0-9]{12}$/.test(id)) throw new ApiErro('id_invalido', 'Entrada não encontrada.');
    comTrava_(() => {
      const a = this.aba(), vals = a.getDataRange().getValues();
      for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][0]) === id) {
        if (String(vals[i][2]) === 'Fixo') throw new ApiErro('somente_variavel', 'O salário fixo se edita em Cadastros.');
        a.getRange(i + 1, 2).setNumberFormat('@').setValue(e.mes);
        a.getRange(i + 1, 4, 1, 2).setValues([[e.descricao, e.valor]]);
        a.getRange(i + 1, 8, 1, 3).setValues([[e.dia, e.categoria, e.recorrente]]);
        return;
      }
      throw new ApiErro('nao_encontrado', 'Essa entrada não existe mais.');
    });
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
   LEMBRAR DE MIM  (token de aparelho, guardado só como hash)
   A cada retomada o token é trocado por um novo: um token copiado
   deixa de valer assim que o aparelho verdadeiro usa o dele.
   ===================================================================== */

const Aparelho = {
  emitir(u, nome) {
    const token = aleatorio_(), agora = Date.now();
    Store.set('a:' + sha_(token), { email: u.email, nome: V.texto(nome, 40), criado: agora, ultimo: agora });
    return token;
  },
  retomar(c) {
    const token = String(c.aparelho || '');
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiErro('aparelho_invalido', 'Entre com sua senha.');
    return comTrava_(() => {
      const k = 'a:' + sha_(token), a = Store.get(k);
      const u = a ? Store.get('u:' + a.email) : null;
      if (!a || !u || u.ativo === false || Date.now() - a.ultimo > SEG.aparelhoDias * 86400000) {
        if (a) Store.del(k);
        throw new ApiErro('aparelho_invalido', 'Faz tempo que você não entra por aqui. Digite sua senha.');
      }
      Store.del(k);
      const novo = aleatorio_();
      Store.set('a:' + sha_(novo), { email: a.email, nome: a.nome, criado: a.criado, ultimo: Date.now() });
      const s = Sessao.abrir(u);
      s.aparelho = novo;
      return s;
    });
  },
  esquecer(token) { if (/^[a-f0-9]{64}$/.test(String(token || ''))) Store.del('a:' + sha_(token)); },
  esquecerDe(email) { Store.chaves('a:').forEach(k => { const a = Store.get(k); if (!a || !email || a.email === email) Store.del(k); }); }
};

/* =====================================================================
   LANÇAMENTOS PELO APP  (colunas G = Lançado em, H = ID)
   ===================================================================== */

const Lancamentos = {
  aba() {
    const a = Dados.planilha().getSheetByName(ABA.lanc);
    if (a.getRange(1, 11).getValue() !== 'Parcelas') {
      a.getRange(1, 7, 1, 5).setValues([['Lançado em', 'ID', 'Cartão', 'Pontual', 'Parcelas']]).setFontWeight('bold').setBackground('#E8EAF6');
      a.getRange('H:I').setNumberFormat('@');
    }
    return a;
  },
  validar(c) {
    const data = V.data(c.data), valor = V.valor(c.valor), categoria = V.categoria(c.categoria), forma = V.forma(c.forma);
    const [y, m, d] = data.split('-').map(Number);
    return { data: new Date(y, m - 1, d, 12), valor, categoria, forma, descricao: V.texto(c.descricao, 200), cartao: Ajustes.cartaoValido(forma, c.cartao), pontual: c.pontual === true ? 'Sim' : '', parcelas: forma === 'Crédito' ? V.parcelas(c.parcelas) : 1 };
  },
  linhaDe(a, id) {
    if (!/^[a-f0-9]{12}$/.test(String(id || ''))) throw new ApiErro('id_invalido', 'Gasto não encontrado.');
    const ids = a.getRange(1, 8, a.getLastRow(), 1).getValues();
    for (let i = ids.length - 1; i >= 1; i--) if (String(ids[i][0]) === id) return i + 1;
    throw new ApiErro('nao_encontrado', 'Esse gasto não existe mais. Toque em Atualizar.');
  },
  criar(c) {
    const l = this.validar(c);
    comTrava_(() => this.aba().appendRow([l.data, l.valor, l.categoria, l.forma, l.descricao, 'App', new Date(), aleatorio_().slice(0, 12), l.cartao, l.pontual, l.parcelas]));
  },
  editar(c) {
    const l = this.validar(c);
    comTrava_(() => {
      const a = this.aba(), linha = this.linhaDe(a, c.id);
      a.getRange(linha, 1, 1, 5).setValues([[l.data, l.valor, l.categoria, l.forma, l.descricao]]);
      a.getRange(linha, 9, 1, 2).setNumberFormat('@').setValues([[l.cartao, l.pontual]]);
      a.getRange(linha, 11).setValue(l.parcelas);
    });
  },
  remover(c) {
    comTrava_(() => { const a = this.aba(); a.deleteRow(this.linhaDe(a, c.id)); });
  },
  /** Dá ID às linhas antigas (formulário, digitadas na planilha). */
  garantirIds(a, vals) {
    let mudou = false;
    const col = vals.map((l, i) => {
      if (i === 0) return ['ID'];
      if (l[0] !== '' && !l[7]) { mudou = true; return [aleatorio_().slice(0, 12)]; }
      return [l[7] || ''];
    });
    if (mudou) { a.getRange(1, 8, col.length, 1).setNumberFormat('@').setValues(col); col.forEach((x, i) => { vals[i][7] = x[0]; }); }
  }
};

/* =====================================================================
   CONTAS FIXAS  (aba Contas fixas: ID | Conta | Valor | Dia | Categoria | Forma | Ativa | Criada em)
   A rotina diária lança cada conta em Lançamentos no dia dela (Origem: Conta fixa).
   ===================================================================== */

const Contas = {
  CAB: ['ID', 'Conta', 'Valor', 'Dia', 'Categoria', 'Forma de pagamento', 'Ativa', 'Criada em', 'Início', 'Fim', 'Cartão'],
  aba() {
    const ss = Dados.planilha();
    let a = ss.getSheetByName(ABA.contas);
    if (!a) {
      a = ss.insertSheet(ABA.contas);
      a.getRange(1, 1, 1, this.CAB.length).setValues([this.CAB]).setFontWeight('bold').setBackground('#E8EAF6');
      a.setFrozenRows(1);
      a.getRange('A:A').setNumberFormat('@');
      a.getRange('C2:C').setNumberFormat('"R$" #,##0.00');
      a.setColumnWidths(1, 11, 130);
    }
    if (a.getRange(1, 11).getValue() !== 'Cartão') {
      a.getRange(1, 9, 1, 3).setValues([['Início', 'Fim', 'Cartão']]).setFontWeight('bold').setBackground('#E8EAF6');
      a.getRange('I:K').setNumberFormat('@');
    }
    return a;
  },
  listar() {
    const a = Dados.planilha().getSheetByName(ABA.contas);
    if (!a) return [];
    return a.getDataRange().getValues().slice(1).filter(l => l[0] && l[1]).map(l => ({
      id: String(l[0]), nome: String(l[1]), valor: Number(l[2]) || 0, dia: Number(l[3]) || 1,
      categoria: String(l[4] || 'Contas fixas'), forma: String(l[5] || 'Pix'),
      ativa: l[6] !== false && String(l[6]).toLowerCase() !== 'não',
      criada: l[7] instanceof Date ? Utilities.formatDate(l[7], CONFIG.fuso, 'yyyy-MM-dd') : String(l[7] || ''),
      inicio: mesTxt_(l[8]) || (l[7] instanceof Date ? Utilities.formatDate(l[7], CONFIG.fuso, 'yyyy-MM') : ''),
      fim: mesTxt_(l[9]),
      cartao: String(l[10] || '')
    }));
  },
  salvar(c) {
    const nome = V.texto(c.nome, 60);
    if (nome.length < 2) throw new ApiErro('nome_invalido', 'Dê um nome à conta. Ex.: Aluguel');
    const valor = V.valor(c.valor), dia = V.dia(c.dia, 1), categoria = V.categoria(c.categoria), forma = V.forma(c.forma);
    const inicio = V.mes(c.inicio), fim = c.fim ? V.mes(c.fim) : '';
    if (fim && fim < inicio) throw new ApiErro('periodo_invalido', 'O mês final precisa ser depois do mês de início.');
    const cartao = Ajustes.cartaoValido(forma, c.cartao);
    comTrava_(() => {
      const a = this.aba();
      if (c.id) { // editar
        const id = String(c.id);
        if (!/^[a-f0-9]{12}$/.test(id)) throw new ApiErro('id_invalido', 'Conta não encontrada.');
        const vals = a.getDataRange().getValues();
        for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][0]) === id) {
          a.getRange(i + 1, 2, 1, 5).setValues([[nome, valor, dia, categoria, forma]]);
          a.getRange(i + 1, 9, 1, 3).setNumberFormat('@').setValues([[inicio, fim, cartao]]);
          return;
        }
        throw new ApiErro('nao_encontrado', 'Essa conta não existe mais.');
      }
      const id = aleatorio_().slice(0, 12), linha = a.getLastRow() + 1;
      a.getRange(linha, 1).setNumberFormat('@');
      a.getRange(linha, 9, 1, 3).setNumberFormat('@');
      a.getRange(linha, 1, 1, 11).setValues([[id, nome, valor, dia, categoria, forma, true, new Date(), inicio, fim, cartao]]);
    });
  },
  remover(c) {
    const id = String(c.id || '');
    if (!/^[a-f0-9]{12}$/.test(id)) throw new ApiErro('id_invalido', 'Conta não encontrada.');
    comTrava_(() => {
      const a = this.aba(), vals = a.getDataRange().getValues();
      for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][0]) === id) { a.deleteRow(i + 1); return; }
      throw new ApiErro('nao_encontrado', 'Essa conta já foi removida.');
    });
  }
};

/** Rotina diária: lança as contas fixas que vencem até hoje e ainda não foram lançadas neste mês. */
/** Mês 'yyyy-MM' a partir de texto ou data da planilha. */
function mesTxt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.fuso, 'yyyy-MM');
  const s = String(v || '');
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

function lancarContasDoDia() {
  const agora = new Date();
  const ymd = Utilities.formatDate(agora, CONFIG.fuso, 'yyyy-MM-dd');
  const [y, m, d] = ymd.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const mes = ymd.slice(0, 7);
  const props = Store.p();
  const lanc = Lancamentos.aba();
  Contas.listar().forEach(ct => {
    if (!ct.ativa) return;
    const diaConta = Math.min(ct.dia, ultimo);
    const venc = `${mes}-${('0' + diaConta).slice(-2)}`;
    const marca = `CF:${ct.id}:${mes}`;
    if (diaConta > d || props.getProperty(marca)) return;
    if (ct.criada && ct.criada > venc) return; // conta criada depois do vencimento deste mês
    if ((ct.inicio && mes < ct.inicio) || (ct.fim && mes > ct.fim)) return; // fora do período da conta
    lanc.appendRow([new Date(y, m - 1, diaConta, 12), ct.valor, ct.categoria, ct.forma, ct.nome, 'Conta fixa', new Date(), aleatorio_().slice(0, 12), ct.cartao || '']);
    props.setProperty(marca, '1');
  });
}

/* =====================================================================
   AJUSTES  (saldo da conta numa data e ciclo do cartão de crédito)
   ===================================================================== */

const Ajustes = {
  ler() {
    const a = Store.get('AJUSTES') || { saldo: null };
    if (!Array.isArray(a.cartoes)) { // versão anterior: um cartão só
      a.cartoes = a.cartao ? [{ id: '000000000001', nome: 'Cartão principal', fecha: a.cartao.fecha, vence: a.cartao.vence }] : [];
    }
    delete a.cartao;
    if (!Array.isArray(a.recorrentes)) a.recorrentes = [];
    if (!a.preferencias) a.preferencias = { renda: 'antes', fatura: 'depois', contas: 'mesmo' };
    return a;
  },
  /** Crédito precisa de um cartão cadastrado (se houver cartões); outras formas não levam cartão. */
  cartaoValido(forma, id) {
    if (forma !== 'Crédito') return '';
    const cartoes = this.ler().cartoes;
    if (!cartoes.length) return '';
    const s = String(id || '');
    if (!cartoes.some(c => c.id === s)) throw new ApiErro('cartao_invalido', 'Escolha em qual cartão foi a compra.');
    return s;
  },
  salvarCartao(c) {
    const nome = V.texto(c.nome, 30);
    if (nome.length < 2) throw new ApiErro('nome_invalido', 'Dê um nome ao cartão. Ex.: Nubank');
    const fecha = V.dia(c.fecha), vence = V.dia(c.vence);
    if (!fecha || !vence) throw new ApiErro('dia_invalido', 'Informe o dia de fechamento e o de vencimento.');
    comTrava_(() => {
      const a = this.ler();
      if (c.id) {
        const x = a.cartoes.find(k => k.id === String(c.id));
        if (!x) throw new ApiErro('nao_encontrado', 'Esse cartão não existe mais.');
        Object.assign(x, { nome, fecha, vence });
      } else {
        if (a.cartoes.length >= 12) throw new ApiErro('limite', 'Limite de 12 cartões.');
        a.cartoes.push({ id: aleatorio_().slice(0, 12), nome, fecha, vence });
      }
      Store.set('AJUSTES', a);
    });
  },
  salvarRecorrente(c) {
    const nome = V.texto(c.nome, 40);
    if (nome.length < 2) throw new ApiErro('nome_invalido', 'Dê um nome. Ex.: Variável projeto A');
    const valor = V.valor(c.valor), dia = V.dia(c.dia, 30), inicio = V.mes(c.inicio), fim = c.fim ? V.mes(c.fim) : '';
    if (fim && fim < inicio) throw new ApiErro('periodo_invalido', 'O mês final precisa ser depois do início.');
    comTrava_(() => {
      const a = this.ler();
      if (c.id) {
        const x = a.recorrentes.find(k => k.id === String(c.id));
        if (!x) throw new ApiErro('nao_encontrado', 'Essa entrada recorrente não existe mais.');
        Object.assign(x, { nome, valor, dia, inicio, fim });
      } else {
        if (a.recorrentes.length >= 20) throw new ApiErro('limite', 'Limite de 20 entradas recorrentes.');
        a.recorrentes.push({ id: aleatorio_().slice(0, 12), nome, valor, dia, inicio, fim });
      }
      Store.set('AJUSTES', a);
    });
  },
  removerRecorrente(c) {
    comTrava_(() => {
      const a = this.ler(), antes = a.recorrentes.length;
      a.recorrentes = a.recorrentes.filter(k => k.id !== String(c.id || ''));
      if (a.recorrentes.length === antes) throw new ApiErro('nao_encontrado', 'Já foi removida.');
      Store.set('AJUSTES', a);
    });
  },
  removerCartao(c) {
    comTrava_(() => {
      const a = this.ler(), antes = a.cartoes.length;
      a.cartoes = a.cartoes.filter(k => k.id !== String(c.id || ''));
      if (a.cartoes.length === antes) throw new ApiErro('nao_encontrado', 'Esse cartão já foi removido.');
      Store.set('AJUSTES', a);
    });
  },
  salvar(c) {
    const a = this.ler();
    if (c.saldo !== undefined) {
      a.saldo = c.saldo === null ? null : { valor: V.saldo(c.saldo.valor), data: V.data(c.saldo.data), em: new Date().toISOString() };
    }
    if (c.preferencias !== undefined) { // quando renda/fatura cai em fim de semana ou feriado
      const ok = ['antes', 'depois', 'mesmo'];
      const p = c.preferencias || {};
      a.preferencias = {
        renda: ok.includes(p.renda) ? p.renda : 'antes',
        fatura: ok.includes(p.fatura) ? p.fatura : 'depois',
        contas: ok.includes(p.contas) ? p.contas : 'mesmo'
      };
    }
    if (c.diaADia !== undefined) { // gasto do dia a dia: null = automático; valor = fixo por dia
      a.diaADia = c.diaADia === null ? null : { valor: V.valor(c.diaADia.valor) };
    }
    Store.set('AJUSTES', a);
  }
};

/* =====================================================================
   ORÇAMENTO  (versões: cada uma vale a partir de um mês até a próxima)
   Cada categoria tem um limite em R$ ou em % da renda (fixo ou total).
   A categoria Investimentos funciona como meta de quanto guardar.
   ===================================================================== */

const Orcamento = {
  ler() {
    const o = Store.get('ORCAMENTO');
    if (o && Array.isArray(o.versoes)) return o;
    // primeira vez: parte dos tetos da aba Tetos da planilha
    const cats = {};
    try {
      Dados.planilha().getSheetByName(ABA.tetos).getDataRange().getValues().slice(1).forEach(l => {
        const c = String(l[0]), v = Number(l[1]) || 0;
        if (CONFIG.categorias.includes(c) && v > 0) cats[c] = { tipo: 'valor', valor: v };
      });
    } catch (_) { }
    const mes = Utilities.formatDate(new Date(), CONFIG.fuso, 'yyyy-MM');
    return { versoes: Object.keys(cats).length ? [{ desde: mes, cats }] : [] };
  },
  validarCats(cats) {
    const out = {};
    Object.keys(cats || {}).forEach(c => {
      if (!CONFIG.categorias.includes(c)) return;
      const x = cats[c] || {};
      const tipo = ['valor', 'pctFixo', 'pctRenda'].includes(x.tipo) ? x.tipo : 'valor';
      const n = Number(String(x.valor || '0').replace(',', '.'));
      if (!isFinite(n) || n < 0 || (tipo !== 'valor' && n > 100) || n > 10000000) throw new ApiErro('valor_invalido', `Valor inválido em ${c}.`);
      if (n > 0) out[c] = { tipo, valor: Math.round(n * 100) / 100 };
    });
    return out;
  },
  salvar(c) {
    const desde = V.mes(c.desde), cats = this.validarCats(c.cats);
    comTrava_(() => {
      const o = this.ler();
      o.versoes = o.versoes.filter(v => v.desde !== desde);
      o.versoes.push({ desde, cats, salvo: new Date().toISOString() });
      o.versoes.sort((a, b) => a.desde.localeCompare(b.desde));
      Store.set('ORCAMENTO', o);
      this.espelharNaPlanilha(o);
    });
  },
  remover(c) {
    const desde = V.mes(c.desde);
    comTrava_(() => {
      const o = this.ler(), antes = o.versoes.length;
      o.versoes = o.versoes.filter(v => v.desde !== desde);
      if (o.versoes.length === antes) throw new ApiErro('nao_encontrado', 'Esse orçamento já foi removido.');
      Store.set('ORCAMENTO', o);
      this.espelharNaPlanilha(o);
    });
  },
  /** Mantém a aba Tetos da planilha com os valores em R$ do mês atual (para quem olha a planilha). */
  espelharNaPlanilha(o) {
    try {
      const mes = Utilities.formatDate(new Date(), CONFIG.fuso, 'yyyy-MM');
      const v = o.versoes.filter(x => x.desde <= mes).pop();
      const fixo = Receitas.listar().filter(r => r.tipo === 'fixo' && r.mes <= mes).sort((a, b) => b.mes.localeCompare(a.mes))[0];
      const base = fixo ? fixo.valor : 0;
      const aba = Dados.planilha().getSheetByName(ABA.tetos);
      const linhas = CONFIG.categorias.map(c => {
        const x = v && v.cats[c];
        const r = !x ? 0 : x.tipo === 'valor' ? x.valor : Math.round(base * x.valor) / 100;
        return [c, r];
      });
      aba.getRange(2, 1, linhas.length, 2).setValues(linhas);
    } catch (_) { }
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
    const abaL = Lancamentos.aba();
    const valsL = abaL.getDataRange().getValues();
    while (valsL[0].length < 11) valsL.forEach(l => l.push(''));
    comTrava_(() => Lancamentos.garantirIds(abaL, valsL));
    const lancamentos = valsL.slice(1)
      .filter(l => l[0] !== '' && l[1] !== '')
      .map(l => ({
        id: String(l[7] || ''),
        data: l[0] instanceof Date ? Utilities.formatDate(l[0], CONFIG.fuso, 'yyyy-MM-dd') : String(l[0]),
        valor: Number(String(l[1]).replace(',', '.')) || 0,
        categoria: String(l[2] || 'Outros'),
        forma: String(l[3] || ''),
        descricao: String(l[4] || ''),
        origem: String(l[5] || ''),
        cartao: String(l[8] || ''),
        pontual: String(l[9] || '').toLowerCase() === 'sim',
        parcelas: Math.max(1, Math.min(48, parseInt(l[10], 10) || 1)),
        criado: l[6] instanceof Date ? l[6].toISOString() : ''
      }));
    const tetos = ss.getSheetByName(ABA.tetos).getDataRange().getValues().slice(1)
      .filter(l => l[0] && CONFIG.categorias.includes(String(l[0])))
      .map(l => ({ categoria: String(l[0]), teto: Number(l[1]) || 0 }));
    return { atualizado: new Date().toISOString(), usuario: { nome: sessao.nome }, lancamentos, tetos, receitas: Receitas.listar(), contas: Contas.listar(), ajustes: Ajustes.ler(), categorias: CONFIG.categorias, formas: CONFIG.formasPagamento, tiposEntrada: CONFIG.tiposEntrada, orcamento: Orcamento.ler(), formulario: this.linkFormulario(), banco: Banco.resumo() };
  },
  linkFormulario() {
    const p = Store.p();
    let url = p.getProperty('FORM_URL');
    if (!url && p.getProperty('FORM_ID')) {
      try { url = FormApp.openById(p.getProperty('FORM_ID')).getPublishedUrl(); p.setProperty('FORM_URL', url); } catch (_) { url = ''; }
    }
    return url || '';
  }
};

/* =====================================================================
   BANCO (Pluggy / Meu Pluggy)  — aba Banco
   O servidor busca as movimentações dos bancos conectados no Meu Pluggy e guarda
   na aba Banco. Nada entra nos gastos sozinho: o app mostra uma fila para conferir.
   O que já foi lançado à mão, as parcelas futuras e o pagamento da fatura são
   reconhecidos e saem da fila. O Client Secret fica só nas Propriedades do script.
   ===================================================================== */

const Banco = {
  API: 'https://api.pluggy.ai',
  CAB: ['ID Pluggy', 'Data', 'Valor', 'Sentido', 'Descrição', 'Categoria do banco', 'Categoria sugerida', 'Conta', 'Tipo de conta', 'Banco', 'Parcela', 'Status', 'Lançamento', 'Atualizado em', 'Forma sugerida'],
  STATUS_FILA: 'novo',

  cfg() { return Store.get('PLUGGY') || { clientId: '', itens: [], desde: '' }; },
  temSecret() { return !!Store.p().getProperty('PLUGGY_SECRET'); },

  aba() {
    const ss = Dados.planilha();
    let a = ss.getSheetByName(ABA.banco);
    if (!a) {
      a = ss.insertSheet(ABA.banco);
      a.getRange(1, 1, 1, this.CAB.length).setValues([this.CAB]).setFontWeight('bold').setBackground('#E8EAF6');
      a.setFrozenRows(1);
      a.getRange('A:A').setNumberFormat('@');
      a.getRange('K:M').setNumberFormat('@');
      a.getRange('C2:C').setNumberFormat('"R$" #,##0.00');
      a.setColumnWidths(1, this.CAB.length, 130);
    }
    return a;
  },

  configurar(c) {
    const atual = this.cfg();
    const clientId = String(c.clientId || atual.clientId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new ApiErro('banco_id', 'O Client ID tem o formato 9127929e-86be-45ef-…. Copie em dashboard.pluggy.ai → Aplicações.');
    const itens = (Array.isArray(c.itens) ? c.itens : String(c.itens || '').split(/[\s,;]+/))
      .map(x => String(x).trim()).filter(Boolean);
    if (itens.some(x => !/^[0-9a-f-]{36}$/i.test(x))) throw new ApiErro('banco_item', 'Algum Item ID está errado. Cada um tem o formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.');
    if (itens.length > 10) throw new ApiErro('banco_item', 'Cadastre no máximo 10 itens.');
    const desde = c.desde ? V.data(c.desde) : (atual.desde || this.inicioPadrao_());
    const secret = String(c.clientSecret || '').trim();
    if (secret && !/^[0-9a-f-]{36}$/i.test(secret)) throw new ApiErro('banco_secret', 'O Client Secret tem o mesmo formato do Client ID (36 caracteres com traços).');
    if (!secret && !this.temSecret()) throw new ApiErro('banco_secret', 'Cole o Client Secret da aplicação.');
    // testa as credenciais antes de salvar
    this.autenticar_(clientId, secret || Store.p().getProperty('PLUGGY_SECRET'));
    if (secret) Store.p().setProperty('PLUGGY_SECRET', secret);
    Store.set('PLUGGY', { clientId, itens, desde });
    Store.del('PLUGGY_KEY');
    this.instalarRotina_();
  },

  inicioPadrao_() {
    const h = new Date(); return Utilities.formatDate(new Date(h.getFullYear(), h.getMonth() - 1, 1, 12), CONFIG.fuso, 'yyyy-MM-dd');
  },

  instalarRotina_() {
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sincronizarBancoDiario')) return;
    ScriptApp.newTrigger('sincronizarBancoDiario').timeBased().everyDays(1).atHour(8).inTimezone(CONFIG.fuso).create();
  },

  autenticar_(clientId, secret) {
    const r = UrlFetchApp.fetch(this.API + '/auth', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ clientId, clientSecret: secret }), muteHttpExceptions: true });
    if (r.getResponseCode() === 401 || r.getResponseCode() === 403) throw new ApiErro('banco_auth', 'A Pluggy recusou o Client ID ou o Client Secret. Confira em dashboard.pluggy.ai → Aplicações.');
    if (r.getResponseCode() >= 300) throw new ApiErro('banco_auth', 'A Pluggy não respondeu agora (código ' + r.getResponseCode() + '). Tente de novo em instantes.');
    const key = JSON.parse(r.getContentText()).apiKey;
    Store.set('PLUGGY_KEY', { key, ate: Date.now() + 100 * 60 * 1000 }); // a chave vale 2 h; renova antes
    return key;
  },
  chave_() {
    const k = Store.get('PLUGGY_KEY');
    if (k && k.ate > Date.now()) return k.key;
    const cfg = this.cfg(), secret = Store.p().getProperty('PLUGGY_SECRET');
    if (!cfg.clientId || !secret) throw new ApiErro('banco_config', 'Conecte o banco em Cadastros → Bancos conectados.');
    return this.autenticar_(cfg.clientId, secret);
  },
  get_(caminho) {
    const ir = () => UrlFetchApp.fetch(this.API + caminho, { headers: { 'X-API-KEY': this.chave_() }, muteHttpExceptions: true });
    let r = ir();
    if (r.getResponseCode() === 401 || r.getResponseCode() === 403) { Store.del('PLUGGY_KEY'); r = ir(); }
    if (r.getResponseCode() === 404) throw new ApiErro('banco_item', 'A Pluggy não encontrou ' + caminho.split('?')[0] + '. Confira os Item IDs.');
    if (r.getResponseCode() >= 300) throw new ApiErro('banco_api', 'Erro da Pluggy (' + r.getResponseCode() + ') em ' + caminho.split('?')[0] + '.');
    return JSON.parse(r.getContentText());
  },

  /** Data do banco (UTC) no dia de Fortaleza, como a documentação da Pluggy orienta. */
  dia_(iso) { return Utilities.formatDate(new Date(iso), CONFIG.fuso, 'yyyy-MM-dd'); },

  sugerirCategoria_(t) {
    const txt = [(t.category || ''), (t.merchant && (t.merchant.category || t.merchant.name) || ''), (t.description || '')].join(' ').toLowerCase();
    const regras = [
      [/invest|aplica[cç]|cdb|tesouro|corretora|resgate/, 'Investimentos'],
      [/supermerc|grocer|mercado|atacad|assa[ií]|carrefour|p[aã]o de a[cç]|hortifr/, 'Mercado'],
      [/restaur|eating|food|lanch|ifood|aliment|padaria|bakery|caf[eé]|bar |burger|pizza/, 'Alimentação'],
      [/gas station|posto|combust|shell|ipiranga|petrobr|\bbr mania/, 'Combustível'],
      [/uber|99 ?app|99pop|taxi|ride|transport|ônibus|onibus|metr[oô]|estaciona|parking|ped[aá]gio|toll/, 'Transporte'],
      [/pharm|farm[aá]c|drogar|health|sa[uú]de|m[eé]dic|hospital|cl[ií]nica|laborat|dentist|unimed|hapvida/, 'Saúde'],
      [/educa|school|escola|faculd|universi|curso|course|livrar/, 'Educação'],
      [/netflix|spotify|disney|prime video|hbo|youtube|apple\.com|google one|icloud|assinatura|subscription|streaming|digital service|chatgpt|openai|anthropic/, 'Assinaturas'],
      [/rent|aluguel|condom|housing|moradia|energia|enel|coelce|[aá]gua|cagece|g[aá]s |internet|telecom|claro|vivo|tim |oi /, 'Moradia'],
      [/cinema|show|ingresso|entertain|leisure|lazer|viage|travel|hotel|airbnb|game|playstation|steam/, 'Lazer'],
      [/shopping|loja|store|magalu|amazon|mercadolivre|mercado livre|shopee|renner|riachuelo|cloth|vestu/, 'Compras pessoais']
    ];
    for (const [re, cat] of regras) if (re.test(txt)) return cat;
    return '';
  },

  formaSugerida_(t, tipoConta) {
    if (tipoConta === 'CREDIT') return 'Crédito';
    const m = String(t.paymentData && t.paymentData.paymentMethod || '').toUpperCase();
    if (m === 'PIX' || /\bpix\b/i.test(t.description || '')) return 'Pix';
    return 'Débito';
  },

  /** Busca as movimentações novas de todos os itens e guarda na aba Banco. */
  sincronizar() {
    const cfg = this.cfg();
    if (!cfg.clientId || !cfg.itens.length) throw new ApiErro('banco_config', 'Cadastre o Client ID, o Secret e pelo menos um Item ID em Cadastros → Bancos conectados.');
    const estado = Store.get('BANCO_SYNC') || {};
    const hoje = Utilities.formatDate(new Date(), CONFIG.fuso, 'yyyy-MM-dd');
    // reabre 10 dias antes da última busca: compras pendentes do cartão mudam de status
    let de = cfg.desde || this.inicioPadrao_();
    if (estado.ultima && estado.desdeUsado === de) {
      const u = new Date(estado.ultima); u.setDate(u.getDate() - 10);
      const uTxt = Utilities.formatDate(u, CONFIG.fuso, 'yyyy-MM-dd');
      if (uTxt > de) de = uTxt;
    }
    const contas = [], novos = [], erros = [];
    cfg.itens.forEach(itemId => {
      try {
        const item = this.get_('/items/' + itemId);
        const banco = (item.connector && item.connector.name) || 'Banco';
        const contasItem = this.get_('/accounts?itemId=' + itemId).results || [];
        contasItem.forEach(ct => {
          contas.push({ id: ct.id, nome: ct.marketingName || ct.name || banco, banco, tipo: ct.type, saldo: Number(ct.balance) || 0, item: itemId, consentimento: item.consentExpiresAt || '' });
          let pagina = 1, total = 1;
          do {
            const r = this.get_(`/transactions?accountId=${ct.id}&from=${de}&to=${hoje}&pageSize=500&page=${pagina}`);
            total = r.totalPages || 1;
            (r.results || []).forEach(t => novos.push({ t, ct, banco }));
            pagina++;
          } while (pagina <= total && pagina <= 20);
        });
        if (item.status && item.status !== 'UPDATED' && item.status !== 'UPDATING') erros.push(`${banco}: ${item.status}${item.executionStatus ? ' (' + item.executionStatus + ')' : ''}`);
      } catch (e) {
        erros.push((e && e.message) || String(e));
      }
    });
    const qtd = comTrava_(() => this.gravar_(novos));
    Store.set('BANCO_SYNC', { ultima: new Date().toISOString(), desdeUsado: cfg.desde || de, contas, novos: qtd, erro: erros.join(' | ').slice(0, 400) });
    if (erros.length && !contas.length) throw new ApiErro('banco_sync', erros[0]);
    return qtd;
  },

  gravar_(lista) {
    const a = this.aba(), vals = a.getDataRange().getValues();
    const existentes = new Set(vals.slice(1).map(l => String(l[0])));
    const usados = new Set(vals.slice(1).map(l => String(l[12] || '')).filter(Boolean));
    // lançamentos e entradas que já existem, para não contar duas vezes
    const lanc = Lancamentos.aba().getDataRange().getValues().slice(1).filter(l => l[0] !== '' && l[1] !== '')
      .map(l => ({ id: String(l[7] || ''), data: l[0] instanceof Date ? Utilities.formatDate(l[0], CONFIG.fuso, 'yyyy-MM-dd') : String(l[0]).slice(0, 10), valor: Number(String(l[1]).replace(',', '.')) || 0, origem: String(l[5] || '') }));
    const receitas = Receitas.listar();
    const fixos = receitas.filter(r => r.tipo === 'fixo').sort((x, y) => x.mes < y.mes ? -1 : 1);
    const pendentesFila = vals.slice(1).filter(l => String(l[11]) === 'novo').map(l => ({ data: this.txt_(l[1]), valor: Number(l[2]) || 0, conta: String(l[7]), sentido: String(l[3]) }));
    const dist = (a1, b1) => Math.abs((new Date(a1 + 'T12:00:00') - new Date(b1 + 'T12:00:00')) / 864e5);
    const linhas = [];
    lista.forEach(({ t, ct, banco }) => {
      if (!t || !t.id || existentes.has(String(t.id))) return;
      const cartao = ct.type === 'CREDIT';
      if (!cartao && t.status === 'PENDING') return; // agendado/bloqueado na conta: espera liquidar
      const bruto = Number(t.amount) || 0;
      const saida = cartao ? bruto > 0 : (t.type ? t.type === 'DEBIT' : bruto < 0);
      const valor = Math.round(Math.abs(bruto) * 100) / 100;
      if (!valor) return;
      const data = this.dia_(t.date);
      const desc = String(t.description || t.descriptionRaw || '').slice(0, 200);
      const cc = t.creditCardMetadata || {};
      const parcela = cc.totalInstallments > 1 ? `${cc.installmentNumber || 1}/${cc.totalInstallments}` : '';
      let status = 'novo', vinc = '';
      const txt = (desc + ' ' + (t.category || '')).toLowerCase();
      if (cartao && cc.totalInstallments > 1 && (cc.installmentNumber || 1) > 1) status = 'parcela';
      else if (!saida && cartao) status = /pagamento|pgto|payment/.test(txt) ? 'fatura' : 'novo';
      else if (saida && !cartao && /credit card payment|pagamento de fatura|pagto fatura|pgto fatura|fatura do cart|pag fatura|pagamento cart/.test(txt)) status = 'fatura';
      if (status === 'novo' && saida) {
        const m = lanc.find(l => !usados.has(l.id) && Math.abs(l.valor - valor) < 0.011 && dist(l.data, data) <= 3);
        if (m) { status = 'duplicado'; vinc = m.id; usados.add(m.id); }
      }
      if (status === 'novo' && !saida) {
        const fixo = fixos.filter(f => f.mes <= data.slice(0, 7)).pop();
        if (fixo && Math.abs(fixo.valor - valor) <= fixo.valor * 0.03) status = 'salario';
        const v = receitas.find(r => r.tipo === 'variavel' && r.mes === data.slice(0, 7) && Math.abs(r.valor - valor) < 0.011 && !usados.has(r.id));
        if (status === 'novo' && v) { status = 'duplicado'; vinc = v.id; usados.add(v.id); }
      }
      if (status === 'novo') { // mesma compra que mudou de pendente para lançada (id novo)
        const p = pendentesFila.findIndex(x => x.conta === ct.id && x.sentido === (saida ? 'saida' : 'entrada') && Math.abs(x.valor - valor) < 0.011 && dist(x.data, data) <= 3);
        if (p >= 0 && t.status === 'POSTED') { status = 'duplicado'; pendentesFila.splice(p, 1); }
      }
      existentes.add(String(t.id));
      linhas.push([String(t.id), new Date(data + 'T12:00:00'), valor, saida ? 'saida' : 'entrada', desc, String(t.category || ''), saida ? this.sugerirCategoria_(t) : '', ct.id, ct.type || '', banco, parcela, status, vinc, new Date(), saida ? this.formaSugerida_(t, ct.type) : '']);
      if (status === 'novo') pendentesFila.push({ data, valor, conta: ct.id, sentido: saida ? 'saida' : 'entrada' });
    });
    if (linhas.length) {
      const ini = a.getLastRow() + 1;
      a.getRange(ini, 1, linhas.length, 1).setNumberFormat('@');
      a.getRange(ini, 11, linhas.length, 3).setNumberFormat('@');
      a.getRange(ini, 1, linhas.length, this.CAB.length).setValues(linhas);
    }
    return linhas.filter(l => l[11] === 'novo').length;
  },

  txt_(v) { return v instanceof Date ? Utilities.formatDate(v, CONFIG.fuso, 'yyyy-MM-dd') : String(v || '').slice(0, 10); },

  /** O que o app precisa: configuração (sem o secret), contas e a fila para conferir. */
  resumo() {
    const cfg = this.cfg(), estado = Store.get('BANCO_SYNC') || {};
    const base = { configurado: !!(cfg.clientId && this.temSecret() && cfg.itens.length), clientId: cfg.clientId ? cfg.clientId.slice(0, 8) + '…' : '', temSecret: this.temSecret(), itens: cfg.itens, desde: cfg.desde || '', ultima: estado.ultima || '', erro: estado.erro || '', contas: estado.contas || [], fila: [], contagem: {} };
    const a = Dados.planilha().getSheetByName(ABA.banco);
    if (!a || a.getLastRow() < 2) return base;
    const vals = a.getRange(2, 1, a.getLastRow() - 1, this.CAB.length).getValues();
    vals.forEach(l => { const st = String(l[11]); base.contagem[st] = (base.contagem[st] || 0) + 1; });
    base.fila = vals.filter(l => String(l[11]) === 'novo').map(l => ({
      id: String(l[0]), data: this.txt_(l[1]), valor: Number(l[2]) || 0, sentido: String(l[3]), descricao: String(l[4] || ''),
      categoriaBanco: String(l[5] || ''), sugestao: String(l[6] || ''), conta: String(l[7]), tipoConta: String(l[8]), banco: String(l[9]),
      parcela: String(l[10] || ''), forma: String(l[14] || '')
    })).sort((x, y) => x.data < y.data ? 1 : -1).slice(0, 300);
    return base;
  },

  linhasPorId_(a) {
    const ids = a.getRange(1, 1, a.getLastRow(), 1).getValues();
    const m = {}; ids.forEach((x, i) => { if (i) m[String(x[0])] = i + 1; }); return m;
  },

  /** Confirma itens da fila: viram gasto (Origem: Banco) ou entrada variável. Valida tudo antes de gravar. */
  importar(c, sessao) {
    const itens = Array.isArray(c.itens) ? c.itens.slice(0, 100) : [];
    if (!itens.length) throw new ApiErro('banco_vazio', 'Nenhuma movimentação escolhida.');
    comTrava_(() => {
      const a = this.aba(), mapa = this.linhasPorId_(a), lanc = Lancamentos.aba();
      const ops = [];
      itens.forEach(x => {
        const linha = mapa[String(x.id)];
        if (!linha) return;
        const l = a.getRange(linha, 1, 1, this.CAB.length).getValues()[0];
        if (String(l[11]) !== 'novo') return;
        const data = this.txt_(l[1]), valor = Number(l[2]) || 0, desc = V.texto(x.descricao || l[4], 200);
        if (String(l[3]) === 'saida') {
          const categoria = V.categoria(x.categoria), forma = V.forma(x.forma || l[14] || 'Débito');
          const cartao = Ajustes.cartaoValido(forma, x.cartao);
          const p = String(l[10] || '').split('/'), parcelas = forma === 'Crédito' && p.length === 2 && p[0] === '1' ? V.parcelas(Number(p[1])) : 1;
          const [y, m, d] = data.split('-').map(Number);
          ops.push({ linha, saida: true, row: [new Date(y, m - 1, d, 12), parcelas > 1 ? Math.round(valor * parcelas * 100) / 100 : valor, categoria, forma, desc, 'Banco', new Date(), aleatorio_().slice(0, 12), cartao, '', parcelas] });
        } else {
          ops.push({ linha, saida: false, e: Receitas.validarEntrada({ valor, data, categoria: x.tipoEntrada || 'Variável', descricao: desc || 'Entrada do banco', recorrente: '' }) });
        }
      });
      ops.forEach(o => {
        let vinculo;
        if (o.saida) { lanc.appendRow(o.row); vinculo = o.row[7]; }
        else vinculo = Receitas.inserir(o.e.mes, 'Variável', o.e.descricao, o.e.valor, sessao, o.e.dia, o.e.categoria, o.e.recorrente);
        a.getRange(o.linha, 12, 1, 2).setNumberFormat('@').setValues([['importado', vinculo]]);
        a.getRange(o.linha, 14).setValue(new Date());
      });
    });
  },

  ignorar(c) {
    const ids = Array.isArray(c.ids) ? c.ids.slice(0, 300).map(String) : [];
    if (!ids.length) throw new ApiErro('banco_vazio', 'Nenhuma movimentação escolhida.');
    comTrava_(() => {
      const a = this.aba(), mapa = this.linhasPorId_(a);
      ids.forEach(id => { const ln = mapa[id]; if (ln && String(a.getRange(ln, 12).getValue()) === 'novo') { a.getRange(ln, 12).setValue('ignorado'); a.getRange(ln, 14).setValue(new Date()); } });
    });
  }
};

/** Rotina diária (8h): o Meu Pluggy atualiza os bancos a cada 24 h. */
function sincronizarBancoDiario() {
  try { Banco.sincronizar(); } catch (e) { console.error('Banco: ' + (e && e.message || e)); }
}

/** Rode pelo editor para testar a conexão com a Pluggy e ver as contas encontradas. */
function testarBanco() {
  const n = Banco.sincronizar();
  const st = Store.get('BANCO_SYNC') || {};
  Logger.log('Contas: ' + (st.contas || []).map(c => `${c.banco} · ${c.nome} (${c.tipo}) saldo ${c.saldo}`).join(' | '));
  Logger.log('Novas para conferir: ' + n + (st.erro ? ' | Avisos: ' + st.erro : ''));
}

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

  Lancamentos.aba().appendRow([
    new Date(y, m - 1, d, 12),
    valor,
    resp[TITULO.categoria] || 'Outros',
    resp[TITULO.forma] || '',
    String(resp[TITULO.descricao] || '').slice(0, 200),
    'Formulário',
    new Date(), // Lançado em: separa o que entrou antes e depois do saldo informado
    aleatorio_().slice(0, 12)
  ]);
}

/* ======================= ADMINISTRAÇÃO ======================= */

/** Rode uma vez para liberar o envio de e-mail e o acesso às propriedades. */
function autorizar() {
  Logger.log('E-mails disponíveis hoje: ' + MailApp.getRemainingDailyQuota());
  Store.del('TOKEN'); // remove o token da versão anterior
  // rotina diária das contas fixas (6h da manhã)
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'lancarContasDoDia').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lancarContasDoDia').timeBased().everyDays(1).atHour(6).inTimezone(CONFIG.fuso).create();
  Logger.log('⏰ Rotina diária das contas fixas instalada.');
  UrlFetchApp.getRequest('https://api.pluggy.ai/'); // pede a permissão de conexão externa (Pluggy)
  if (Banco.cfg().clientId) { Banco.instalarRotina_(); Logger.log('🏦 Rotina diária do banco (8h) instalada.'); }
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
  Aparelho.esquecerDe(null); // aparelhos lembrados também precisam da senha de novo
  Logger.log('🚪 Todas as sessões foram encerradas.');
}

function removerUsuario() {
  const email = String(EMAIL_PARA_REMOVER).trim().toLowerCase();
  if (!email) throw new Error('Preencha EMAIL_PARA_REMOVER antes de rodar.');
  Store.del('u:' + email);
  Sessao.encerrarDe(email);
  Aparelho.esquecerDe(email);
  Logger.log('🗑️  Conta removida: ' + email);
}
