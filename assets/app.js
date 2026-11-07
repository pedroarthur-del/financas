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
    E.ref = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    telaPainel();
    carregarDados();
  }

  /* ============================== PAINEL ============================ */
  async function carregarDados() {
    const s = Sessao.atual(); if (!s) return sair();
    const rot = $('#atualizado'); if (rot) rot.textContent = 'Atualizando…';
    try {
      E.dados = await api('dados', { token: s.token });
      ss.set(K.cache, E.dados);
      renderPainel();
    } catch (e) {
      if (e.codigo === 'sessao_expirada') return sair(e.message);
      if (E.dados) { renderPainel(); if ($('#atualizado')) $('#atualizado').textContent = e.message; }
      else if ($('#conteudo')) $('#conteudo').innerHTML = `<div class="faixa-aviso">${esc(e.message)}</div>`;
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
        <nav class="mes" aria-label="Escolher mês">
          <button class="ico" id="b-ant" type="button" aria-label="Mês anterior">${ICONE.ant}</button>
          <h2 id="mes-nome"></h2>
          <button class="ico" id="b-prox" type="button" aria-label="Próximo mês">${ICONE.prox}</button>
        </nav>
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
    if (E.dados) renderPainel();
  }

  const nomeMes = d => { const n = MESES[d.getMonth()]; return n[0].toUpperCase() + n.slice(1) + ' de ' + d.getFullYear(); };
  function mudarMes(delta) {
    E.ref = new Date(E.ref.getFullYear(), E.ref.getMonth() + delta, 1);
    $('#mes-nome').textContent = nomeMes(E.ref);
    if (E.dados) renderPainel();
  }

  function valorDeFace(v, excesso) {
    const [i, c] = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
    return `<p class="face num${excesso ? ' excesso' : ''}" aria-label="${brl(v)}"><span class="rs" aria-hidden="true">R$</span><span aria-hidden="true">${i}</span><span class="cent" aria-hidden="true">,${c}</span></p>`;
  }

  function renderPainel() {
    const D = E.dados; if (!D || !$('#conteudo')) return;
    const y = E.ref.getFullYear(), m = E.ref.getMonth(), chave = `${y}-${pad(m + 1)}`;
    const mesTxt = MESES[m];
    const lanc = (D.lancamentos || []).filter(l => String(l.data).startsWith(chave));
    const tetos = D.tetos || [];
    const tetoDe = Object.fromEntries(tetos.map(t => [t.categoria, t.teto]));

    const diasMes = new Date(y, m + 1, 0).getDate();
    const atual = y === hoje.getFullYear() && m === hoje.getMonth();
    const futuro = E.ref > hoje;
    const dia = atual ? hoje.getDate() : futuro ? 0 : diasMes;
    const restam = atual ? diasMes - dia + 1 : 0;

    const total = lanc.reduce((s, l) => s + l.valor, 0);
    const teto = tetos.reduce((s, t) => s + (t.teto || 0), 0);
    const proj = atual && dia > 0 ? total / dia * diasMes : total;

    // ---------- herói: a resposta do mês em uma frase ----------
    let heroi;
    const v = x => `<b class="valor num">${brl(x)}</b>`;
    if (futuro) {
      heroi = `<p class="frase">${nomeMes(E.ref)} ainda não começou.</p>${valorDeFace(0)}<p class="depois">Nenhum gasto lançado.</p>`;
    } else if (atual && teto > 0 && total <= teto) {
      heroi = `<p class="frase">Para fechar ${mesTxt} dentro do teto, você pode gastar</p>
        ${valorDeFace((teto - total) / restam)}
        <p class="depois">por dia${restam > 1 ? `, nos próximos ${restam} dias` : ', hoje'}.</p>
        <p class="meta">Você gastou ${v(total)} de ${v(teto)} (${pct(total / teto)}). No ritmo atual, o mês fecha em ${v(proj)}${proj > teto ? ', acima do teto' : ''}.</p>`;
    } else if (atual && teto > 0) {
      heroi = `<p class="frase">Você passou do teto de ${mesTxt} em</p>
        ${valorDeFace(total - teto, true)}
        <p class="depois">Cada novo gasto até o dia ${diasMes} aumenta essa diferença.</p>
        <p class="meta">Gasto: ${v(total)}. Teto: ${v(teto)}. No ritmo atual, o mês fecha em ${v(proj)}.</p>`;
    } else if (teto > 0) {
      const dif = total - teto;
      heroi = `<p class="frase">Em ${mesTxt} você gastou</p>${valorDeFace(total, dif > 0)}
        <p class="depois">${dif > 0 ? `<span class="valor">${brl(dif)}</span> acima do teto de <span class="valor">${brl(teto)}</span>.` : `${pct(total / teto)} do teto de <span class="valor">${brl(teto)}</span>.`}</p>`;
    } else {
      heroi = `<p class="frase">Em ${mesTxt} você gastou</p>${valorDeFace(total)}
        <p class="depois">Defina os tetos na aba Tetos da planilha para ver quanto ainda pode gastar por dia.</p>`;
    }

    // ---------- categorias ----------
    const porCat = {};
    lanc.forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
    const cats = [...new Set([...tetos.map(t => t.categoria), ...Object.keys(porCat)])]
      .map(c => ({ c, g: porCat[c] || 0, t: tetoDe[c] || 0 }))
      .filter(x => x.g > 0 || x.t > 0)
      .sort((a, b) => (b.t ? b.g / b.t : -1) - (a.t ? a.g / a.t : -1) || b.g - a.g);
    const maior = Math.max(1, ...cats.map(x => x.g));
    const classe = r => r > 1 ? 'excesso' : r >= .8 ? 'atencao' : '';

    const passou = cats.filter(x => x.t && x.g > x.t).map(x => esc(x.c));
    const perto = cats.filter(x => x.t && x.g <= x.t && x.g / x.t >= .8).map(x => esc(x.c));
    const alertas = (passou.length ? `<p class="alerta">Passou do teto: ${passou.join(', ')}.</p>` : '')
      + (perto.length ? `<p class="alerta atencao">Acima de 80% do teto: ${perto.join(', ')}.</p>` : '');

    const htmlCats = cats.length ? cats.map(x => {
      const r = x.t ? x.g / x.t : null;
      const larg = r !== null ? Math.min(r, 1) * 100 : x.g / maior * 100;
      const dir = r !== null
        ? `<b class="valor num">${brl(x.g)}</b> de <span class="valor num">${brl(x.t)}</span> <span class="pct ${classe(r)}">${pct(r)}</span>`
        : `<b class="valor num">${brl(x.g)}</b> sem teto`;
      return `<div class="cat"><div class="linha1"><span>${esc(x.c)}</span><span class="v">${dir}</span></div>
        <div class="trilho"><i class="${r === null ? 'sem-teto' : classe(r)}" data-largura="${larg.toFixed(1)}"></i></div></div>`;
    }).join('') : '<p class="vazio">Nenhum gasto neste mês. Lance pelo formulário e toque em Atualizar.</p>';

    // ---------- formas de pagamento ----------
    const porForma = {};
    lanc.forEach(l => { const f = l.forma || 'Sem forma'; porForma[f] = (porForma[f] || 0) + l.valor; });
    const formas = Object.entries(porForma).sort((a, b) => b[1] - a[1]);
    const htmlFormas = formas.length ? formas.map(([f, val]) =>
      `<div class="linha"><div class="esq">${esc(f)}</div><div class="dir"><span class="valor num">${brl(val)}</span><small>${pct(val / total)}</small></div></div>`
    ).join('') : '<p class="vazio">Sem lançamentos.</p>';

    // ---------- últimos ----------
    const ult = [...lanc].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 12);
    const htmlUlt = ult.length ? ult.map(l => {
      const [, mm, dd] = String(l.data).split('-');
      return `<div class="linha"><div class="esq"><div>${esc(l.descricao || l.categoria)}</div>
        <small>${dd}/${mm}, ${esc(l.categoria)}, ${esc(l.forma)}</small></div><div class="dir"><span class="valor num">${brl(l.valor)}</span></div></div>`;
    }).join('') : '<p class="vazio">Sem lançamentos.</p>';

    $('#conteudo').innerHTML = `
      <div class="abertura">
        <section class="heroi" aria-label="Resumo do mês">${heroi}</section>
        ${!futuro ? `<section class="ritmo" id="ritmo" aria-label="Gasto acumulado no mês"><div id="ritmo-svg"></div>
          <div class="legenda"><span>Gasto acumulado</span>${teto ? '<span class="l-ideal">Ritmo para fechar no teto</span>' : ''}</div></section>` : ''}
      </div>
      ${faixa()}
      <div class="grade-secoes">
        <section class="secao"><h3>Onde o dinheiro foi <small>gasto e teto</small></h3>${alertas}${htmlCats}</section>
        <div>
          <section class="secao"><h3>Como você pagou</h3>${htmlFormas}</section>
          <section class="secao"><h3>Últimos lançamentos ${lanc.length > 12 ? `<small>12 de ${lanc.length}</small>` : ''}</h3>${htmlUlt}</section>
        </div>
      </div>`;

    E.grafico = futuro ? null : () => { const box = $('#ritmo-svg'); if (box) box.innerHTML = graficoRitmo(lanc, diasMes, dia, teto, box.clientWidth); };
    if (E.grafico) E.grafico();

    // larguras via CSSOM (a CSP bloqueia style="" em HTML)
    $$('[data-largura]').forEach(el => { el.style.width = el.dataset.largura + '%'; });

    const at = D.atualizado ? new Date(D.atualizado) : null;
    if ($('#atualizado')) $('#atualizado').textContent = at ? `Atualizado às ${pad(at.getHours())}:${pad(at.getMinutes())} de ${pad(at.getDate())}/${pad(at.getMonth() + 1)}` : '';
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
