/* =====================================================================
   Minhas finanças · front-end
   Camadas: util → api → seguranca (chave, sessão, ociosidade) → telas
   ===================================================================== */
(() => {
  'use strict';

  const CFG = Object.assign({ api: '', nome: 'Minhas finanças', sessaoMin: 30 }, window.FINANCAS || {});
  const PBKDF2_ITER = 600000; // OWASP 2023 para PBKDF2-HMAC-SHA256
  const K = { sessao: 'fin.sessao', cache: 'fin.cache', email: 'fin.email', privado: 'fin.privado' };

  /* ------------------------------ util ------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = v => Math.round(v * 100) + '%';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const guardar = (area, k, v) => { try { v == null ? area.removeItem(k) : area.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (_) { } };
  const ler = (area, k, json = true) => { try { const v = area.getItem(k); return v == null ? null : json ? JSON.parse(v) : v; } catch (_) { return null; } };
  const ss = { get: k => ler(sessionStorage, k), set: (k, v) => guardar(sessionStorage, k, v) };
  const ls = { get: k => ler(localStorage, k, false), set: (k, v) => guardar(localStorage, k, v) };
  const raiz = () => $('#raiz');

  const ICONE = {
    olho: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    sair: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/></svg>',
    ant: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    prox: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    cadeado: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>'
  };

  /* ----------------------- guilhoché (cédula) ----------------------- */
  // Roseta de guilhoché: anéis de senoides entrelaçadas, como no papel-moeda
  function anel(R0, A, k, n, passos = 360) {
    let out = '';
    for (let j = 0; j < n; j++) {
      const fase = j * Math.PI * 2 / n / k;
      let p = '';
      for (let i = 0; i <= passos; i++) {
        const t = i / passos * Math.PI * 2;
        const r = R0 + A * Math.sin(k * (t + fase));
        p += (p ? 'L' : 'M') + (r * Math.cos(t)).toFixed(2) + ' ' + (r * Math.sin(t)).toFixed(2);
      }
      out += `<path pathLength="1" d="${p}Z"/>`;
    }
    return out;
  }
  const roseta = (compacta) => compacta
    ? anel(118, 26, 10, 6, 240) + anel(70, 18, 7, 4, 200)
    : anel(122, 22, 14, 9) + anel(84, 16, 10, 7) + anel(56, 7, 18, 4);
  function faixa(larg = 1000, alt = 26) {
    let out = '';
    for (let k = 0; k < 6; k++) {
      let p = '';
      for (let x = 0; x <= larg; x += 4) {
        const y = alt / 2 + Math.sin(x / 22 + k * .55) * (alt * .28) + Math.sin(x / 61 - k * .9) * (alt * .14);
        p += (p ? 'L' : 'M') + x + ' ' + y.toFixed(2);
      }
      out += `<path d="${p}"/>`;
    }
    return `<svg class="faixa" viewBox="0 0 ${larg} ${alt}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
  }

  /* ------------------------------- api ------------------------------ */
  class ErroApp extends Error {
    constructor(codigo, msg, extra) { super(msg); this.codigo = codigo; this.extra = extra || {}; }
  }

  async function api(acao, dados = {}) {
    if (!CFG.api) throw new ErroApp('sem_api', 'Falta conectar a planilha: cole a URL /exec do Apps Script em config.js.');
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), 25000);
    let r;
    try {
      r = await fetch(CFG.api, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // sem preflight
        body: JSON.stringify(Object.assign({ acao }, dados)),
        signal: ctrl.signal, redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'
      });
    } catch (e) {
      throw new ErroApp('rede', e.name === 'AbortError' ? 'O servidor demorou para responder. Tente de novo.' : 'Sem conexão com o servidor. Confira sua internet.');
    } finally { clearTimeout(limite); }

    let j;
    try { j = await r.json(); } catch (_) {
      throw new ErroApp('resposta', 'O servidor respondeu algo inesperado. Confira se a implantação do Apps Script está como "Qualquer pessoa".');
    }
    if (!j.ok) { const e = j.erro || {}; throw new ErroApp(e.codigo || 'erro', e.mensagem || 'Algo deu errado.', e); }
    return j.dados;
  }

  /* ---------------------------- seguranca --------------------------- */
  // A senha nunca sai do aparelho: envia-se uma chave derivada (PBKDF2)
  async function derivarChave(email, senha) {
    if (!window.crypto?.subtle) throw new ErroApp('cripto', 'Este navegador não tem os recursos de segurança necessários. Atualize-o.');
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(senha.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('minhas-financas|' + email.trim().toLowerCase()), iterations: PBKDF2_ITER },
      base, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const REGRAS = [
    { id: 'tam', txt: 'Pelo menos 8 caracteres', ok: s => s.length >= 8 },
    { id: 'let', txt: 'Uma letra', ok: s => /[A-Za-zÀ-ú]/.test(s) },
    { id: 'num', txt: 'Um número', ok: s => /\d/.test(s) },
    { id: 'esp', txt: 'Um símbolo (ex.: ! # @)', ok: s => /[^A-Za-zÀ-ú0-9\s]/.test(s) }
  ];
  const senhaValida = s => REGRAS.slice(0, 3).every(r => r.ok(s));
  function forcaSenha(s) {
    let p = REGRAS.filter(r => r.ok(s)).length;
    if (s.length >= 12) p++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++;
    if (/^(.)\1+$/.test(s) || /^(1234|senha|password|qwer)/i.test(s)) p = 1;
    return Math.min(p, 6) / 6;
  }

  const Sessao = {
    atual: () => ss.get(K.sessao),
    salvar: s => ss.set(K.sessao, { token: s.token, nome: s.nome, email: s.email }),
    limpar: () => { ss.set(K.sessao, null); ss.set(K.cache, null); }
  };

  const Ociosidade = {
    ultimo: Date.now(), timer: null,
    marcar() { Ociosidade.ultimo = Date.now(); },
    verificar() {
      if (!Sessao.atual()) return;
      if (Date.now() - Ociosidade.ultimo > CFG.sessaoMin * 60000) sair('Você ficou um tempo sem usar. Por segurança, entre de novo.');
    },
    iniciar() {
      this.ultimo = Date.now();
      ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, this.marcar, { passive: true }));
      clearInterval(this.timer);
      this.timer = setInterval(() => this.verificar(), 15000);
    },
    parar() {
      ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => removeEventListener(ev, this.marcar));
      clearInterval(this.timer);
    }
  };

  async function sair(msg) {
    const s = Sessao.atual();
    Sessao.limpar();
    Ociosidade.parar();
    E.dados = null;
    if (s?.token) api('sair', { token: s.token }).catch(() => { });
    telaAcesso('entrar', msg ? { tipo: 'info', texto: msg } : null);
  }

  /* ----------------------------- estado ----------------------------- */
  const hoje = new Date();
  const E = {
    status: null,
    dados: ss.get(K.cache),
    ref: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    privado: ls.get(K.privado) === '1',
    aba: 'painel',
    redefinirEmail: ''
  };

  /* ========================= TELA DE ACESSO ========================= */
  function telaAcesso(modo, msg) {
    document.title = CFG.nome;
    document.body.classList.remove('privado');
    const temConta = E.status?.temConta;
    const semApi = !CFG.api;

    const titulos = {
      entrar: ['Entre para ver seus gastos', 'Use o e-mail e a senha da sua conta.'],
      criar: temConta ? ['Criar outra conta', 'Para entrar nos mesmos dados, peça um código de convite ao dono da conta.']
        : ['Crie sua conta', 'A primeira conta criada é a dona destes dados. Depois disso, só entra quem tiver convite.'],
      esqueci: ['Criar uma nova senha', 'Vamos enviar um código de 6 números para o seu e-mail.'],
      redefinir: ['Digite o código', `Enviamos um código para ${esc(E.redefinirEmail)}, se houver conta com esse e-mail.`]
    };
    const [titulo, apoio] = titulos[modo];
    const email = esc(modo === 'redefinir' ? E.redefinirEmail : ls.get(K.email) || '');

    const camposSenhaNova = (rot) => `
      <label class="campo"><span>${rot}</span>
        <div class="senha"><input id="f-senha" type="password" autocomplete="new-password" required minlength="8" maxlength="128" aria-describedby="f-regras">
        <button type="button" data-acao="ver" aria-pressed="false">Mostrar</button></div></label>
      <div class="forca" aria-hidden="true"><i id="f-forca"></i></div>
      <ul class="regras" id="f-regras">${REGRAS.map(r => `<li data-regra="${r.id}">${r.txt}</li>`).join('')}</ul>
      <label class="campo"><span>Repita a senha</span><input id="f-senha2" type="password" autocomplete="new-password" required maxlength="128"></label>`;

    const formularios = {
      entrar: `
        <label class="campo"><span>E-mail</span><input id="f-email" type="email" autocomplete="username" inputmode="email" required maxlength="120" value="${email}"></label>
        <label class="campo"><span>Senha</span>
          <div class="senha"><input id="f-senha" type="password" autocomplete="current-password" required maxlength="128">
          <button type="button" data-acao="ver" aria-pressed="false">Mostrar</button></div></label>
        <div class="msg" id="f-msg" role="alert"></div>
        <button class="btn largo" id="f-enviar" type="submit">Entrar</button>
        <button class="link" type="button" data-modo="esqueci">Esqueci minha senha</button>`,
      criar: `
        <label class="campo"><span>Seu nome</span><input id="f-nome" type="text" autocomplete="given-name" required maxlength="60"></label>
        <label class="campo"><span>E-mail</span><input id="f-email" type="email" autocomplete="username" inputmode="email" required maxlength="120"></label>
        ${camposSenhaNova('Senha')}
        ${temConta ? '<label class="campo"><span>Código de convite</span><input id="f-convite" type="text" autocomplete="off" autocapitalize="characters" required maxlength="20"><span class="dica">Gerado pela função gerarConvite no Apps Script. Vale 48 horas.</span></label>' : ''}
        <div class="msg" id="f-msg" role="alert"></div>
        <button class="btn largo" id="f-enviar" type="submit">Criar conta</button>`,
      esqueci: `
        <label class="campo"><span>E-mail da conta</span><input id="f-email" type="email" autocomplete="username" inputmode="email" required maxlength="120" value="${email}"></label>
        <div class="msg" id="f-msg" role="alert"></div>
        <button class="btn largo" id="f-enviar" type="submit">Enviar código</button>
        <button class="link" type="button" data-modo="entrar">Voltar para entrar</button>`,
      redefinir: `
        <label class="campo"><span>Código do e-mail</span><input id="f-codigo" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
        ${camposSenhaNova('Nova senha')}
        <div class="msg" id="f-msg" role="alert"></div>
        <button class="btn largo" id="f-enviar" type="submit">Salvar nova senha</button>
        <button class="link" type="button" data-modo="esqueci">Enviar outro código</button>`
    };

    const mostrarAbas = modo === 'entrar' || modo === 'criar';
    raiz().innerHTML = `
      <main class="acesso">
        <div class="selo" aria-hidden="true">
          <svg viewBox="-160 -160 320 320">${roseta()}<circle class="anel" r="152" pathLength="1" fill="none"/><circle class="anel" r="146" pathLength="1" fill="none"/></svg>
          <div class="selo-nome">R$</div>
        </div>
        <section class="acesso-form">
          ${semApi ? '<div class="aviso-config">Falta conectar a planilha. Cole a URL do App da Web (termina em <code>/exec</code>) no arquivo <code>config.js</code> do repositório.</div>' : ''}
          <h1>${titulo}</h1>
          <p class="apoio">${apoio}</p>
          ${mostrarAbas ? `<div class="abas" role="tablist" aria-label="Acesso">
            <button type="button" role="tab" data-modo="entrar" aria-selected="${modo === 'entrar'}">Entrar</button>
            <button type="button" role="tab" data-modo="criar" aria-selected="${modo === 'criar'}">Criar conta</button>
          </div>` : '<div class="espaco"></div>'}
          <form id="f" novalidate>${formularios[modo]}</form>
          <p class="nota-seguranca">${ICONE.cadeado}<span>Sua senha não sai deste aparelho. O acesso sai sozinho depois de ${CFG.sessaoMin} minutos parado, e 3 senhas erradas pausam novas tentativas.</span></p>
        </section>
      </main>`;

    if (msg) mostrarMsg(msg.texto, msg.tipo);

    $$('[data-modo]').forEach(b => b.onclick = () => telaAcesso(b.dataset.modo));
    $$('[data-acao="ver"]').forEach(b => b.onclick = () => {
      const inp = b.parentElement.querySelector('input'), ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password';
      b.textContent = ver ? 'Ocultar' : 'Mostrar';
      b.setAttribute('aria-pressed', String(ver));
    });

    const senha = $('#f-senha');
    if (senha && $('#f-regras')) senha.addEventListener('input', () => {
      const v = senha.value;
      REGRAS.forEach(r => $(`[data-regra="${r.id}"]`).classList.toggle('ok', r.ok(v)));
      const f = forcaSenha(v), barra = $('#f-forca');
      barra.style.width = (v ? Math.max(f, .08) : 0) * 100 + '%';
      barra.style.background = f < .5 ? 'var(--excesso)' : f < .8 ? 'var(--atencao)' : 'var(--folga)';
    });

    $('#f').onsubmit = ev => { ev.preventDefault(); enviar(modo); };
    if (semApi) $('#f-enviar').disabled = true;

    const primeiro = $('#f input:not([value]), #f input[value=""]') || $('#f-senha');
    setTimeout(() => primeiro?.focus({ preventScroll: true }), 50);
  }

  function mostrarMsg(texto, tipo = 'erro') {
    const m = $('#f-msg'); if (!m) return;
    m.className = 'msg ' + tipo; m.textContent = texto;
    if (tipo === 'erro') { const f = $('#f'); f.classList.remove('tremer'); void f.offsetWidth; f.classList.add('tremer'); }
  }

  function marcarInvalido(id) {
    const el = $(id); if (!el) return;
    el.setAttribute('aria-invalid', 'true'); el.focus();
    el.addEventListener('input', () => el.removeAttribute('aria-invalid'), { once: true });
  }

  let contagem;
  function aguardar(seg) {
    const btn = $('#f-enviar'); clearInterval(contagem); btn.disabled = true;
    const tick = () => {
      if (!$('#f-enviar')) return clearInterval(contagem);
      mostrarMsg(`Muitas tentativas erradas. Aguarde ${Math.floor(seg / 60)}:${pad(seg % 60)} para tentar de novo.`, 'info');
      if (--seg < 0) { clearInterval(contagem); btn.disabled = false; mostrarMsg('Pode tentar de novo.', 'info'); }
    };
    tick(); contagem = setInterval(tick, 1000);
  }

  async function enviar(modo) {
    const btn = $('#f-enviar'); if (btn.disabled) return;
    const val = id => ($(id)?.value || '').trim();
    const email = val('#f-email').toLowerCase();
    const senha = $('#f-senha')?.value || '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    const rotuloOriginal = btn.textContent;
    const ocupado = txt => { btn.disabled = true; btn.textContent = txt; };
    const livre = () => { btn.disabled = false; btn.textContent = rotuloOriginal; };

    try {
      if (modo === 'entrar') {
        if (!emailOk) { marcarInvalido('#f-email'); return mostrarMsg('Digite um e-mail válido.'); }
        if (!senha) { marcarInvalido('#f-senha'); return mostrarMsg('Digite sua senha.'); }
        ocupado('Entrando…');
        const chave = await derivarChave(email, senha);
        ls.set(K.email, email);
        entrarNoPainel(await api('entrar', { email, chave }));
        return;
      }

      if (modo === 'criar' || modo === 'redefinir') {
        const nome = val('#f-nome'), codigo = val('#f-codigo'), convite = val('#f-convite');
        if (modo === 'criar' && nome.length < 2) { marcarInvalido('#f-nome'); return mostrarMsg('Digite seu nome.'); }
        if (modo === 'criar' && !emailOk) { marcarInvalido('#f-email'); return mostrarMsg('Digite um e-mail válido.'); }
        if (modo === 'redefinir' && !/^\d{6}$/.test(codigo)) { marcarInvalido('#f-codigo'); return mostrarMsg('O código tem 6 números.'); }
        if (!senhaValida(senha)) { marcarInvalido('#f-senha'); return mostrarMsg('A senha precisa de 8 caracteres, com letra e número.'); }
        if (senha !== $('#f-senha2').value) { marcarInvalido('#f-senha2'); return mostrarMsg('As duas senhas não são iguais.'); }
        if (modo === 'criar' && E.status?.temConta && !convite) { marcarInvalido('#f-convite'); return mostrarMsg('Digite o código de convite.'); }

        ocupado(modo === 'criar' ? 'Criando conta…' : 'Salvando…');
        const alvo = modo === 'criar' ? email : E.redefinirEmail;
        const chave = await derivarChave(alvo, senha);
        ls.set(K.email, alvo);
        const s = modo === 'criar'
          ? await api('cadastrar', { nome, email, chave, convite })
          : await api('redefinir', { email: alvo, codigo, chave });
        entrarNoPainel(s);
        return;
      }

      if (modo === 'esqueci') {
        if (!emailOk) { marcarInvalido('#f-email'); return mostrarMsg('Digite um e-mail válido.'); }
        ocupado('Enviando…');
        await api('pedirCodigo', { email });
        E.redefinirEmail = email;
        telaAcesso('redefinir');
      }
    } catch (e) {
      livre();
      if (e.codigo === 'aguarde' && e.extra.espera) return aguardar(e.extra.espera);
      if (e.codigo === 'bloqueado') { btn.disabled = true; return mostrarMsg(e.message); }
      let texto = e.message;
      if (e.codigo === 'credenciais' && e.extra.restantes) {
        texto += e.extra.restantes === 1 ? ' Mais um erro e o acesso será pausado.' : ` Restam ${e.extra.restantes} tentativas antes da pausa.`;
        if ($('#f-senha')) $('#f-senha').value = '';
      }
      mostrarMsg(texto);
    }
  }

  function entrarNoPainel(s) {
    Sessao.salvar(s);
    Ociosidade.iniciar();
    E.dados = null;
    E.aba = 'painel';
    E.ref = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    telaPainel();
    carregarDados();
  }

  /* ============================== PAINEL ============================ */
  // Categorias pagas uma vez no mês: a previsão usa o teto (ou a média), não o ritmo diário
  const FIXAS = ['Moradia', 'Contas fixas', 'Assinaturas', 'Educação'];
  const chaveMes = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const somaMes = (chave, cat) => (E.dados?.lancamentos || [])
    .filter(l => String(l.data).startsWith(chave) && (!cat || l.categoria === cat))
    .reduce((s, l) => s + l.valor, 0);
  const mesesAntes = (d, n) => Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth() - 1 - i, 1));
  const temLancamento = chave => (E.dados?.lancamentos || []).some(l => String(l.data).startsWith(chave));
  const mesCurto = d => MESES[d.getMonth()].slice(0, 3) + '/' + String(d.getFullYear()).slice(2);
  const nomeMes = d => { const n = MESES[d.getMonth()]; return n[0].toUpperCase() + n.slice(1) + ' de ' + d.getFullYear(); };

  function renda(chave) {
    const R = E.dados?.receitas || [];
    const fixoReg = R.filter(r => r.tipo === 'fixo' && r.mes <= chave).sort((a, b) => b.mes.localeCompare(a.mes))[0] || null;
    const variaveis = R.filter(r => r.tipo === 'variavel' && r.mes === chave);
    const fixo = fixoReg ? fixoReg.valor : 0;
    const variavel = variaveis.reduce((s, r) => s + r.valor, 0);
    return { fixo, fixoReg, variaveis, variavel, total: fixo + variavel };
  }

  /** Média de gasto da categoria nos meses anteriores que têm lançamentos (até 3). */
  function mediaHistorica(ref, cat) {
    const meses = mesesAntes(ref, 6).map(chaveMes).filter(temLancamento).slice(0, 3);
    if (!meses.length) return null;
    return meses.reduce((s, k) => s + somaMes(k, cat), 0) / meses.length;
  }

  /** Previsão de fim de mês por categoria. Mistura o ritmo atual com o histórico no começo do mês. */
  function prever(cat, gasto, teto, ctx) {
    if (!ctx.atual) return gasto;
    const hist = mediaHistorica(E.ref, cat);
    if (FIXAS.includes(cat)) return Math.max(gasto, teto || hist || 0);
    const ritmo = gasto / ctx.dia;
    const ritmoHist = hist !== null ? hist / ctx.diasMes : ritmo;
    const peso = Math.min(1, ctx.dia / 10); // nos 10 primeiros dias o histórico pesa mais
    const taxa = ritmo * peso + ritmoHist * (1 - peso);
    return gasto + taxa * (ctx.diasMes - ctx.dia);
  }

  async function carregarDados() {
    const s = Sessao.atual(); if (!s) return sair();
    const rot = $('#atualizado'); if (rot) rot.textContent = 'Atualizando…';
    try {
      E.dados = await api('dados', { token: s.token });
      ss.set(K.cache, E.dados);
      renderConteudo();
    } catch (e) {
      if (e.codigo === 'sessao_expirada') return sair(e.message);
      if (E.dados) { renderConteudo(); if ($('#atualizado')) $('#atualizado').textContent = e.message; }
      else if ($('#conteudo')) $('#conteudo').innerHTML = `<div class="faixa-aviso">${esc(e.message)}</div>`;
    }
  }

  /** Escrita autenticada: o servidor devolve os dados já atualizados. */
  async function gravar(acao, dados) {
    const s = Sessao.atual(); if (!s) return sair();
    try {
      E.dados = await api(acao, Object.assign({ token: s.token }, dados));
      ss.set(K.cache, E.dados);
      return true;
    } catch (e) {
      if (e.codigo === 'sessao_expirada') { sair(e.message); return false; }
      throw e;
    }
  }

  function telaPainel() {
    const s = Sessao.atual();
    document.title = CFG.nome;
    document.body.classList.toggle('privado', E.privado);
    raiz().innerHTML = `
      <div class="painel">
        <header class="topo">
          <div class="marca"><svg viewBox="-150 -150 300 300" aria-hidden="true">${roseta(true)}</svg><span>${esc(CFG.nome)}</span></div>
          <div class="acoes">
            <button class="ico" id="b-privado" type="button" aria-pressed="${E.privado}" aria-label="Ocultar valores" title="Ocultar valores">${ICONE.olho}</button>
            <button class="ico" id="b-sair" type="button" aria-label="Sair" title="Sair">${ICONE.sair}</button>
          </div>
        </header>
        <div class="barra-nav">
          <nav class="mes" aria-label="Escolher mês">
            <button class="ico" id="b-ant" type="button" aria-label="Mês anterior">${ICONE.ant}</button>
            <h2 id="mes-nome"></h2>
            <button class="ico" id="b-prox" type="button" aria-label="Próximo mês">${ICONE.prox}</button>
          </nav>
          <div class="abas abas-painel" role="tablist" aria-label="Seções">
            <button type="button" role="tab" data-aba="painel" aria-selected="${E.aba === 'painel'}">Painel</button>
            <button type="button" role="tab" data-aba="renda" aria-selected="${E.aba === 'renda'}">Renda</button>
          </div>
        </div>
        <div id="conteudo"><p class="carregando">Buscando seus lançamentos, ${esc(s?.nome || '')}…</p></div>
        <footer class="rodape">
          <span id="atualizado"></span>
          <button class="btn secundario" id="b-atualizar" type="button">Atualizar</button>
        </footer>
      </div>`;
    $('#mes-nome').textContent = nomeMes(E.ref);
    $('#b-sair').onclick = () => sair('Você saiu da sua conta.');
    $('#b-privado').onclick = () => {
      E.privado = !E.privado; ls.set(K.privado, E.privado ? '1' : '0');
      document.body.classList.toggle('privado', E.privado);
      $('#b-privado').setAttribute('aria-pressed', String(E.privado));
    };
    $('#b-ant').onclick = () => mudarMes(-1);
    $('#b-prox').onclick = () => mudarMes(1);
    $('#b-atualizar').onclick = carregarDados;
    $$('[data-aba]').forEach(b => b.onclick = () => irPara(b.dataset.aba));
    if (E.dados) renderConteudo();
  }

  function irPara(aba) {
    E.aba = aba;
    $$('[data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    renderConteudo();
    scrollTo({ top: 0 });
  }

  function mudarMes(delta) {
    E.ref = new Date(E.ref.getFullYear(), E.ref.getMonth() + delta, 1);
    $('#mes-nome').textContent = nomeMes(E.ref);
    if (E.dados) renderConteudo();
  }

  function renderConteudo() {
    if (!E.dados || !$('#conteudo')) return;
    if (E.aba === 'renda') renderRenda(); else renderPainel();
    $$('[data-largura]').forEach(el => { el.style.width = el.dataset.largura + '%'; });  // CSSOM: a CSP bloqueia style=""
    $$('[data-inicio]').forEach(el => { el.style.left = el.dataset.inicio + '%'; });
    const at = E.dados.atualizado ? new Date(E.dados.atualizado) : null;
    if ($('#atualizado')) $('#atualizado').textContent = at ? `Atualizado às ${pad(at.getHours())}:${pad(at.getMinutes())} de ${pad(at.getDate())}/${pad(at.getMonth() + 1)}` : '';
  }

  function valorDeFace(v, excesso) {
    const [i, c] = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
    return `<p class="face num${excesso ? ' excesso' : ''}" aria-label="${brl(v)}"><span class="rs" aria-hidden="true">R$</span><span aria-hidden="true">${i}</span><span class="cent" aria-hidden="true">,${c}</span></p>`;
  }
  const v = x => `<b class="valor num">${brl(x)}</b>`;
  const w = (x, escala) => (escala > 0 ? Math.max(0, Math.min(100, x / escala * 100)) : 0).toFixed(1);

  /* ------------------------- aba PAINEL ------------------------- */
  function renderPainel() {
    const D = E.dados;
    const y = E.ref.getFullYear(), m = E.ref.getMonth(), chave = chaveMes(E.ref);
    const mesTxt = MESES[m];
    const lanc = (D.lancamentos || []).filter(l => String(l.data).startsWith(chave));
    const tetos = D.tetos || [];
    const tetoDe = Object.fromEntries(tetos.map(t => [t.categoria, t.teto]));

    const diasMes = new Date(y, m + 1, 0).getDate();
    const atual = y === hoje.getFullYear() && m === hoje.getMonth();
    const futuro = E.ref > hoje;
    const dia = atual ? hoje.getDate() : futuro ? 0 : diasMes;
    const restam = atual ? diasMes - dia + 1 : 0;
    const ctx = { atual, dia, diasMes };

    const total = lanc.reduce((s, l) => s + l.valor, 0);
    const teto = tetos.reduce((s, t) => s + (t.teto || 0), 0);
    const R = renda(chave);

    // ---------- categorias, com previsão de fim de mês ----------
    const porCat = {};
    lanc.forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
    const cats = [...new Set([...tetos.map(t => t.categoria), ...Object.keys(porCat)])]
      .map(c => { const g = porCat[c] || 0, t = tetoDe[c] || 0; return { c, g, t, p: prever(c, g, t, ctx) }; })
      .filter(x => x.g > 0 || x.t > 0);
    const proj = futuro ? 0 : cats.reduce((s, x) => s + x.p, 0);
    cats.sort((a, b) => (b.t ? b.p / b.t : -1) - (a.t ? a.p / a.t : -1) || b.p - a.p);

    // ---------- herói ----------
    let heroi;
    if (futuro) {
      heroi = `<p class="frase">${nomeMes(E.ref)} ainda não começou.</p>${valorDeFace(0)}<p class="depois">Nenhum gasto lançado.</p>`;
    } else if (atual && teto > 0 && total <= teto) {
      heroi = `<p class="frase">Para fechar ${mesTxt} dentro do orçamento, você pode gastar</p>
        ${valorDeFace((teto - total) / restam)}
        <p class="depois">por dia${restam > 1 ? `, nos próximos ${restam} dias` : ', hoje'}.</p>
        <p class="meta">Você gastou ${v(total)} de ${v(teto)} (${pct(total / teto)}). A previsão para o mês é ${v(proj)}${proj > teto ? ', acima do orçamento' : ''}.</p>`;
    } else if (atual && teto > 0) {
      heroi = `<p class="frase">Você passou do orçamento de ${mesTxt} em</p>
        ${valorDeFace(total - teto, true)}
        <p class="depois">Cada novo gasto até o dia ${diasMes} aumenta essa diferença.</p>
        <p class="meta">Gasto: ${v(total)}. Orçamento: ${v(teto)}. Previsão para o mês: ${v(proj)}.</p>`;
    } else if (teto > 0) {
      const dif = total - teto;
      heroi = `<p class="frase">Em ${mesTxt} você gastou</p>${valorDeFace(total, dif > 0)}
        <p class="depois">${dif > 0 ? `<span class="valor">${brl(dif)}</span> acima do orçamento de <span class="valor">${brl(teto)}</span>.` : `${pct(total / teto)} do orçamento de <span class="valor">${brl(teto)}</span>.`}</p>`;
    } else {
      heroi = `<p class="frase">Em ${mesTxt} você gastou</p>${valorDeFace(total)}
        <p class="depois">Defina os tetos na aba Tetos da planilha para ver quanto ainda pode gastar por dia.</p>`;
    }

    // ---------- balanço: renda x gasto ----------
    let balanco;
    if (!R.total) {
      balanco = `<p class="vazio">Cadastre sua renda de ${mesTxt} para ver quanto sobra e quanto cada gasto pesa no que você ganha.</p>
        <button class="btn" type="button" data-aba-ir="renda">Lançar renda</button>`;
    } else {
      const gastoRef = atual ? proj : total;
      const sobra = R.total - gastoRef;
      const escala = Math.max(R.total, gastoRef, 1);
      balanco = `
        <div class="medidor" role="img" aria-label="Gasto comparado à renda do mês">
          <i class="m-gasto${total > R.total ? ' excesso' : ''}" data-largura="${w(total, escala)}"></i>
          ${atual && proj > total ? `<i class="m-prev${proj > R.total ? ' excesso' : ''}" data-inicio="${w(total, escala)}" data-largura="${w(proj - total, escala)}"></i>` : ''}
          ${gastoRef > R.total ? `<b class="m-marco" data-inicio="${w(R.total, escala)}" title="Renda do mês"></b>` : ''}
        </div>
        <dl class="numeros">
          <div><dt>Renda</dt><dd>${v(R.total)}</dd><small>Fixo <span class="valor">${brl(R.fixo)}</span>${R.variavel ? `, variável <span class="valor">${brl(R.variavel)}</span>` : ''}</small></div>
          <div><dt>Gasto ${atual ? 'até agora' : 'no mês'}</dt><dd>${v(total)}</dd><small>${pct(total / R.total)} da renda</small></div>
          ${atual ? `<div><dt>Gasto previsto</dt><dd>${v(proj)}</dd><small>${pct(proj / R.total)} da renda</small></div>` : ''}
          <div><dt>${atual ? 'Sobra prevista' : 'Sobrou'}</dt><dd class="${sobra < 0 ? 'excesso' : 'folga'}">${v(sobra)}</dd><small>${sobra < 0 ? 'faltou dinheiro' : pct(sobra / R.total) + ' da renda'}</small></div>
        </dl>
        <p class="legenda-medidor"><span class="lg-gasto">Gasto</span>${atual ? '<span class="lg-prev">Previsto até o fim do mês</span>' : ''}</p>`;
    }

    // ---------- o que ajustar (só no mês atual) ----------
    let ajustes = '';
    if (atual) {
      const itens = [];
      const estouro = cats.filter(x => x.t && x.p > x.t + 0.5);
      const folgas = cats.filter(x => x.t && x.t - x.p > 0.5).map(x => ({ c: x.c, f: x.t - x.p })).sort((a, b) => b.f - a.f);
      const folgaTotal = folgas.reduce((s, x) => s + x.f, 0);
      const excessoTotal = estouro.reduce((s, x) => s + (x.p - x.t), 0);

      if (R.total && proj > R.total) itens.push(`<li class="excesso">No ritmo atual, você vai gastar ${v(proj - R.total)} a mais do que ganha em ${mesTxt}.</li>`);
      else if (R.total && (R.total - proj) / R.total < .1) itens.push(`<li class="atencao">A sobra prevista é de só ${pct(Math.max(0, R.total - proj) / R.total)} da renda.</li>`);
      if (R.total && teto > R.total) itens.push(`<li class="atencao">Seus tetos somam ${v(teto)}, mais do que a renda de ${mesTxt} (${v(R.total)}). Mesmo cumprindo todos, falta dinheiro.</li>`);

      estouro.forEach(x => {
        const ritmo = x.g / dia;
        if (x.g <= x.t) {
          const limite = (x.t - x.g) / restam;
          itens.push(`<li><b>${esc(x.c)}</b> deve fechar em ${v(x.p)}, ${v(x.p - x.t)} acima do teto. Para caber, o limite daqui em diante é ${v(limite)} por dia${ritmo > 0 ? ` (sua média está em ${v(ritmo)} por dia)` : ''}.</li>`);
        } else {
          itens.push(`<li><b>${esc(x.c)}</b> já passou do teto em ${v(x.g - x.t)}. Para não aumentar a diferença, segure essa categoria até o fim do mês.</li>`);
        }
      });
      if (estouro.length) {
        if (folgas.length) {
          const lista = folgas.slice(0, 3).map(x => `${esc(x.c)} (${v(x.f)})`).join(', ');
          itens.push(`<li>Folga prevista em outras categorias: ${lista}. ${folgaTotal >= excessoTotal
            ? 'Ela cobre o excesso: para manter o gasto onde estourou, você precisa abrir mão desse valor nelas.'
            : `Ela não cobre tudo: mesmo remanejando, faltam ${v(excessoTotal - folgaTotal)}.`}</li>`);
        } else {
          itens.push('<li>Nenhuma outra categoria tem folga prevista para compensar. O ajuste precisa vir das próprias categorias que estouraram.</li>');
        }
      }
      ajustes = `<section class="secao"><h3>O que ajustar</h3>${itens.length
        ? `<ul class="ajustes">${itens.join('')}</ul>`
        : '<p class="vazio">Tudo dentro do previsto para este mês.</p>'}</section>`;
    }

    // ---------- categorias ----------
    const classe = r => r > 1 ? 'excesso' : r >= .8 ? 'atencao' : '';
    const htmlCats = cats.length ? cats.map(x => {
      const escala = Math.max(x.t, x.p, x.g, 1);
      const rP = x.t ? x.p / x.t : null;
      const topo = v(x.g);
      const partes = [];
      if (atual && x.p > x.g + 0.5) partes.push(`Previsto <span class="valor num">${brl(x.p)}</span>${x.t ? `, <span class="pct ${classe(rP)}">${pct(rP)} do teto</span>` : ''}`);
      else if (x.t) partes.push(`<span class="pct ${classe(x.g / x.t)}">${pct(x.g / x.t)} do teto</span>`);
      if (!x.t) partes.push('Sem teto');
      if (R.total) partes.push(`${pct((atual ? x.p : x.g) / R.total)} da renda`);
      if (atual && FIXAS.includes(x.c)) partes.push('Conta do mês: a previsão usa o teto');
      return `<div class="cat"><div class="linha1"><span>${esc(x.c)}</span><span class="v">${topo}</span></div>
        <div class="trilho">
          <i class="t-gasto ${x.t ? classe(x.g / x.t) : 'sem-teto'}" data-largura="${w(x.g, escala)}"></i>
          ${atual && x.p > x.g ? `<i class="t-prev ${x.t ? classe(rP) : 'sem-teto'}" data-inicio="${w(x.g, escala)}" data-largura="${w(x.p - x.g, escala)}"></i>` : ''}
          ${x.t ? `<b class="t-marco" data-inicio="${w(x.t, escala)}" title="Teto ${brl(x.t)}"></b>` : ''}
        </div>
        <p class="linha2">${partes.join('. ')}.</p></div>`;
    }).join('') : '<p class="vazio">Nenhum gasto neste mês. Lance pelo formulário e toque em Atualizar.</p>';

    // ---------- formas e últimos ----------
    const porForma = {};
    lanc.forEach(l => { const f = l.forma || 'Sem forma'; porForma[f] = (porForma[f] || 0) + l.valor; });
    const htmlFormas = Object.keys(porForma).length ? Object.entries(porForma).sort((a, b) => b[1] - a[1]).map(([f, val]) =>
      `<div class="linha"><div class="esq">${esc(f)}</div><div class="dir"><span class="valor num">${brl(val)}</span><small>${pct(val / total)}</small></div></div>`
    ).join('') : '<p class="vazio">Sem lançamentos.</p>';
    const ult = [...lanc].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 10);
    const htmlUlt = ult.length ? ult.map(l => {
      const [, mm, dd] = String(l.data).split('-');
      return `<div class="linha"><div class="esq"><div>${esc(l.descricao || l.categoria)}</div>
        <small>${dd}/${mm}, ${esc(l.categoria)}, ${esc(l.forma)}</small></div><div class="dir"><span class="valor num">${brl(l.valor)}</span></div></div>`;
    }).join('') : '<p class="vazio">Sem lançamentos.</p>';

    // ---------- mês a mês ----------
    const meses = [E.ref, ...mesesAntes(E.ref, 5)].reverse();
    const linhasHist = meses.map(d => {
      const k = chaveMes(d), r = renda(k).total;
      const ehAtual = k === chaveMes(hoje);
      const g = ehAtual ? proj || somaMes(k) : somaMes(k);
      const sb = r - g;
      return { d, k, r, g, sb, ehAtual, vazio: !r && !g };
    });
    const maxHist = Math.max(1, ...linhasHist.map(x => Math.max(x.r, x.g)));
    const htmlHist = linhasHist.filter(x => !x.vazio).map(x => `
      <div class="hist${x.k === chave ? ' sel' : ''}">
        <span class="h-mes">${mesCurto(x.d)}${x.ehAtual ? '<small>previsão</small>' : ''}</span>
        <div class="h-barras">
          <i class="h-renda" data-largura="${w(x.r, maxHist)}"></i>
          <i class="h-gasto${x.g > x.r && x.r ? ' excesso' : ''}" data-largura="${w(x.g, maxHist)}"></i>
        </div>
        <span class="h-num valor num">${brl(x.r)}</span>
        <span class="h-num valor num">${brl(x.g)}</span>
        <span class="h-num valor num ${x.r ? (x.sb < 0 ? 'excesso' : 'folga') : ''}">${x.r ? brl(x.sb) : '—'}</span>
      </div>`).join('');

    // previsão do próximo mês: fixo vigente + média do variável e do gasto nos últimos 3 meses
    const prox = new Date(y, m + 1, 1);
    const base3 = [E.ref, ...mesesAntes(E.ref, 2)].map(chaveMes);
    const varMedia = base3.reduce((s, k) => s + renda(k).variavel, 0) / 3;
    const fixoProx = renda(chaveMes(prox)).fixo;
    const gastos3 = base3.map(k => k === chaveMes(hoje) ? proj : somaMes(k)).filter(g => g > 0);
    const gastoMedio = gastos3.length ? gastos3.reduce((s, g) => s + g, 0) / gastos3.length : 0;
    const previsao = (fixoProx || varMedia || gastoMedio) ? `<p class="previsao">Previsão para ${MESES[prox.getMonth()]}: renda de ${v(fixoProx + varMedia)}${varMedia ? ` (fixo mais a média do variável dos últimos 3 meses)` : ''} e gasto de ${v(gastoMedio)}, sobrando ${v(fixoProx + varMedia - gastoMedio)}.</p>` : '';

    $('#conteudo').innerHTML = `
      <div class="abertura">
        <section class="heroi" aria-label="Resumo do mês">${heroi}</section>
        ${!futuro ? `<section class="ritmo" id="ritmo" aria-label="Gasto acumulado no mês"><div id="ritmo-svg"></div>
          <div class="legenda"><span>Gasto acumulado</span>${teto ? '<span class="l-ideal">Ritmo para fechar no orçamento</span>' : ''}</div></section>` : ''}
      </div>
      ${faixa()}
      <section class="secao"><h3>Quanto entra e quanto sai</h3>${balanco}</section>
      ${ajustes}
      <div class="grade-secoes">
        <section class="secao"><h3>Onde o dinheiro foi <small>${atual ? 'gasto até agora' : 'gasto no mês'}</small></h3>${htmlCats}
          ${cats.length ? `<p class="legenda-medidor"><span class="lg-gasto">Gasto</span>${atual ? '<span class="lg-prev">Previsto</span>' : ''}<span class="lg-teto">Teto</span></p>` : ''}</section>
        <div>
          <section class="secao"><h3>Como você pagou</h3>${htmlFormas}</section>
          <section class="secao"><h3>Últimos lançamentos ${lanc.length > 10 ? `<small>10 de ${lanc.length}</small>` : ''}</h3>${htmlUlt}</section>
        </div>
      </div>
      <section class="secao"><h3>Mês a mês</h3>
        ${htmlHist ? `<div class="hist cab"><span></span><span></span><span>Renda</span><span>Gasto</span><span>Sobra</span></div>${htmlHist}
          <p class="legenda-medidor"><span class="lg-renda">Renda</span><span class="lg-gasto">Gasto</span></p>` : '<p class="vazio">Ainda não há meses com renda ou gasto.</p>'}
        ${previsao}
      </section>`;

    $$('[data-aba-ir]').forEach(b => b.onclick = () => irPara(b.dataset.abaIr));
    E.grafico = futuro ? null : () => { const box = $('#ritmo-svg'); if (box) box.innerHTML = graficoRitmo(lanc, diasMes, dia, teto, box.clientWidth); };
    if (E.grafico) E.grafico();
  }

  /* -------------------------- aba RENDA -------------------------- */
  const lerValor = s => { const n = Number(String(s || '').replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };

  function renderRenda() {
    const chave = chaveMes(E.ref), mesTxt = MESES[E.ref.getMonth()];
    const R = renda(chave);
    const fixos = (E.dados.receitas || []).filter(r => r.tipo === 'fixo').sort((a, b) => b.mes.localeCompare(a.mes));
    const base3 = [E.ref, ...mesesAntes(E.ref, 2)].map(chaveMes);
    const media3 = base3.reduce((s, k) => s + renda(k).variavel, 0) / 3;
    const nomeMesChave = k => { const [a, mm] = k.split('-').map(Number); return MESES[mm - 1] + ' de ' + a; };
    const btnRemover = id => `<button class="link perigo" type="button" data-remover="${esc(id)}">Remover</button>`;

    $('#conteudo').innerHTML = `
      <section class="heroi" aria-label="Renda do mês">
        <p class="frase">Sua renda em ${mesTxt}</p>
        ${valorDeFace(R.total)}
        <p class="depois">${R.total ? `Fixo <span class="valor">${brl(R.fixo)}</span>${R.variavel ? ` e variável <span class="valor">${brl(R.variavel)}</span>` : ', sem variável lançado'}.` : 'Nenhuma renda cadastrada para este mês.'}</p>
      </section>
      ${faixa()}
      <div class="grade-secoes">
        <section class="secao">
          <h3>Salário fixo</h3>
          <p class="apoio-secao">${R.fixoReg ? `Em vigor: ${v(R.fixoReg.valor)} desde ${nomeMesChave(R.fixoReg.mes)}.` : 'Nenhum fixo em vigor neste mês.'} O fixo se repete todo mês até você cadastrar um valor novo.</p>
          <form class="form-linha" id="f-fixo" novalidate>
            <label class="campo"><span>Valor por mês</span><input id="fx-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 4.500,00" maxlength="14"></label>
            <label class="campo"><span>A partir de</span><input id="fx-mes" type="month" value="${chave}" required></label>
            <button class="btn" type="submit">Salvar fixo</button>
          </form>
          <div class="msg" id="fx-msg" role="status"></div>
          ${fixos.length ? `<h4>Histórico do fixo</h4>${fixos.map(f => `<div class="linha"><div class="esq"><div>Desde ${nomeMesChave(f.mes)}</div></div><div class="dir"><span class="valor num">${brl(f.valor)}</span> ${btnRemover(f.id)}</div></div>`).join('')}` : ''}
        </section>
        <section class="secao">
          <h3>Variável de ${mesTxt}</h3>
          <p class="apoio-secao">Lance o que entrou por projeto, comissão ou bônus. Média dos últimos 3 meses: ${v(media3)}.</p>
          <form class="form-linha" id="f-var" novalidate>
            <label class="campo"><span>De onde veio</span><input id="vr-desc" type="text" autocomplete="off" placeholder="Ex.: Projeto NSF" maxlength="80"></label>
            <label class="campo"><span>Valor</span><input id="vr-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.200,00" maxlength="14"></label>
            <button class="btn" type="submit">Adicionar</button>
          </form>
          <div class="msg" id="vr-msg" role="status"></div>
          ${R.variaveis.length ? R.variaveis.map(r => `<div class="linha"><div class="esq"><div>${esc(r.descricao)}</div></div><div class="dir"><span class="valor num">${brl(r.valor)}</span> ${btnRemover(r.id)}</div></div>`).join('')
            : `<p class="vazio">Nenhum variável lançado em ${mesTxt}.</p>`}
        </section>
      </div>`;

    const enviarForm = async (form, msgSel, montar, okTxt) => {
      const msg = $(msgSel), btn = form.querySelector('button[type="submit"]');
      const dados = montar(); if (!dados) return;
      btn.disabled = true; const rot = btn.textContent; btn.textContent = 'Salvando…';
      try {
        if (await gravar(dados.acao, dados.corpo)) { renderConteudo(); const m2 = $(msgSel); if (m2) { m2.className = 'msg info'; m2.textContent = okTxt; } }
      } catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; btn.disabled = false; btn.textContent = rot; }
    };

    $('#f-fixo').onsubmit = ev => {
      ev.preventDefault();
      enviarForm(ev.target, '#fx-msg', () => {
        const valor = lerValor($('#fx-valor').value), mes = $('#fx-mes').value;
        const msg = $('#fx-msg'); msg.className = 'msg erro';
        if (!(valor > 0)) { msg.textContent = 'Digite o valor do fixo. Ex.: 4.500,00'; $('#fx-valor').focus(); return null; }
        if (!/^\d{4}-\d{2}$/.test(mes)) { msg.textContent = 'Escolha o mês em que esse valor começa.'; return null; }
        return { acao: 'salvarFixo', corpo: { valor, mes } };
      }, 'Fixo salvo.');
    };
    $('#f-var').onsubmit = ev => {
      ev.preventDefault();
      enviarForm(ev.target, '#vr-msg', () => {
        const valor = lerValor($('#vr-valor').value), descricao = $('#vr-desc').value.trim();
        const msg = $('#vr-msg'); msg.className = 'msg erro';
        if (descricao.length < 2) { msg.textContent = 'Diga de onde veio o valor. Ex.: Projeto NSF'; $('#vr-desc').focus(); return null; }
        if (!(valor > 0)) { msg.textContent = 'Digite o valor. Ex.: 1.200,00'; $('#vr-valor').focus(); return null; }
        return { acao: 'adicionarVariavel', corpo: { valor, descricao, mes: chave } };
      }, 'Variável adicionado.');
    };
    // remover em dois toques, sem diálogo
    $$('[data-remover]').forEach(b => b.onclick = async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = 'Confirmar remoção'; setTimeout(() => { if (b.isConnected) { b.dataset.confirmar = ''; b.textContent = 'Remover'; } }, 4000); return; }
      b.disabled = true; b.textContent = 'Removendo…';
      try { if (await gravar('removerReceita', { id: b.dataset.remover })) renderConteudo(); }
      catch (e) { b.disabled = false; b.textContent = e.message; }
    });
  }

  function graficoRitmo(lanc, diasMes, dia, teto, largura) {
    const W = Math.max(280, Math.round(largura || 640)), H = Math.round(Math.min(220, Math.max(160, W * .36))), P = { e: 46, d: 8, t: 10, b: 24 };
    const porDia = Array(diasMes + 1).fill(0);
    lanc.forEach(l => { const d = +String(l.data).slice(8, 10); if (d >= 1 && d <= diasMes) porDia[d] += l.valor; });
    const acum = []; let soma = 0;
    for (let d = 1; d <= diasMes; d++) { soma += porDia[d]; acum.push(soma); }
    const ate = acum.slice(0, Math.max(dia, 0));
    const max = Math.max(teto, ...ate, 1) * 1.08;
    const x = d => P.e + (d - 1) / Math.max(1, diasMes - 1) * (W - P.e - P.d);
    const yv = val => H - P.b - val / max * (H - P.t - P.b);
    const curto = val => val >= 1000 ? (val / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil' : String(Math.round(val));

    let g = '';
    [0, .5, 1].forEach(f => {
      const val = max / 1.08 * f, yy = yv(val).toFixed(1);
      g += `<line class="grade" x1="${P.e}" x2="${W - P.d}" y1="${yy}" y2="${yy}"/><text class="eixo" x="${P.e - 8}" y="${+yy + 4}" text-anchor="end">${curto(val)}</text>`;
    });
    [1, 10, 20, diasMes].forEach(d => { g += `<text class="eixo" x="${x(d)}" y="${H - 5}" text-anchor="middle">${d}</text>`; });
    if (teto) g += `<line class="ideal" x1="${x(1)}" y1="${yv(teto / diasMes)}" x2="${x(diasMes)}" y2="${yv(teto)}"/>`;
    if (ate.length) {
      const acima = teto && ate[ate.length - 1] > teto / diasMes * ate.length;
      g += `<polyline class="real${acima ? ' excesso' : ''}" points="${ate.map((val, i) => `${x(i + 1).toFixed(1)},${yv(val).toFixed(1)}`).join(' ')}"/>`;
      g += `<circle class="ponto${acima ? ' excesso' : ''}" cx="${x(ate.length)}" cy="${yv(ate[ate.length - 1])}" r="4.5"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gasto acumulado dia a dia comparado ao ritmo do teto">${g}</svg>`;
  }

  /* ============================== INÍCIO ============================ */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !Sessao.atual()) return;
    Ociosidade.verificar();
    if (Sessao.atual()) carregarDados();
  });

  let redim;
  addEventListener('resize', () => { clearTimeout(redim); redim = setTimeout(() => E.grafico && E.grafico(), 150); });

  async function iniciar() {
    if (Sessao.atual()) { Ociosidade.iniciar(); telaPainel(); carregarDados(); return; }
    try { E.status = await api('status'); } catch (e) {
      telaAcesso('entrar', CFG.api ? { tipo: 'erro', texto: e.message } : null);
      return;
    }
    telaAcesso(E.status.temConta ? 'entrar' : 'criar');
  }

  iniciar();
})();
