/* =====================================================================
   Minhas finanças · front-end
   Camadas: util → api → seguranca (chave, sessão, ociosidade) → telas
   ===================================================================== */
(() => {
  'use strict';

  const CFG = Object.assign({ api: '', nome: 'Minhas finanças', sessaoMin: 30 }, window.FINANCAS || {});
  const PBKDF2_ITER = 600000; // OWASP 2023 para PBKDF2-HMAC-SHA256
  const K = { sessao: 'fin.sessao', cache: 'fin.cache', email: 'fin.email', privado: 'fin.privado', aparelho: 'fin.aparelho', forma: 'fin.forma' };

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

  /* ----------------------------- movimento -----------------------------
     Uma entrada orquestrada por tela; depois disso só se anima o que mudou.
     Só transform/opacity/stroke; nada roda com prefers-reduced-motion. */
  const reduzMov = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const movOk = () => !reduzMov.matches;
  const suave = t => 1 - Math.pow(1 - t, 4); // ease-out quart: chega rápido, assenta devagar
  function tween(de, para, dur, cada, fim) {
    if (!movOk() || de === para) { cada(para); if (fim) fim(); return; }
    const t0 = performance.now();
    const passo = agora => {
      const t = Math.min(1, (agora - t0) / dur);
      cada(de + (para - de) * suave(t));
      if (t < 1) requestAnimationFrame(passo); else if (fim) fim();
    };
    requestAnimationFrame(passo);
  }
  function partesFace(x) {
    const [i, c] = Math.abs(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
    return `<span class="rs" aria-hidden="true">R$</span><span aria-hidden="true">${x < 0 ? '−' : ''}${i}</span><span class="cent" aria-hidden="true">,${c}</span>`;
  }
  /** Contadores: primeira vez sobem do zero; depois rolam do valor anterior (troca de mês, atualização ao vivo). */
  function animarValores(entrada) {
    $$('[data-contar]').forEach(el => {
      const k = el.dataset.contar, alvo = Number(el.dataset.valor) || 0, ant = E.vistos.get(k);
      E.vistos.set(k, alvo);
      const de = ant !== undefined ? ant : entrada ? 0 : alvo;
      if (Math.abs(de - alvo) < 0.005) return;
      const face = el.classList.contains('face');
      if (ant !== undefined) { el.classList.remove('mudou'); void el.offsetWidth; el.classList.add('mudou'); }
      tween(de, alvo, ant !== undefined ? 650 : 1100, x => { if (face) el.innerHTML = partesFace(x); else el.textContent = brl(x); });
    });
  }
  /** Indicador deslizante das abas: lembra a posição anterior para deslizar até a nova. */
  function posicionarIndicador(abas) {
    if (!abas) return;
    let ind = abas.querySelector('.indicador');
    if (!ind) { ind = document.createElement('span'); ind.className = 'indicador'; ind.setAttribute('aria-hidden', 'true'); abas.prepend(ind); }
    const sel = abas.querySelector('[aria-selected="true"]'); if (!sel) return;
    const id = abas.dataset.grupo || 'abas', ant = E.indicador[id];
    const alvo = { x: sel.offsetLeft, w: sel.offsetWidth };
    const aplicar = r => { ind.style.width = r.w + 'px'; ind.style.transform = `translateX(${r.x}px)`; };
    if (ant && movOk() && (ant.x !== alvo.x || ant.w !== alvo.w)) {
      ind.classList.add('sem-transicao'); aplicar(ant); void ind.offsetWidth; ind.classList.remove('sem-transicao');
      requestAnimationFrame(() => aplicar(alvo));
    } else { ind.classList.add('sem-transicao'); aplicar(alvo); requestAnimationFrame(() => ind.classList.remove('sem-transicao')); }
    E.indicador[id] = alvo;
    abas.classList.add('com-indicador');
  }

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
  function faixa(alt = 26) {
    // ondas periódicas em 1000 unidades: desenhadas em 2000 e deslocadas -1000 em loop sem emenda
    const linhas = sentido => {
      let out = '';
      for (let k = 0; k < 3; k++) {
        const j = sentido > 0 ? k * 2 : k * 2 + 1;
        let p = '';
        for (let x = 0; x <= 2000; x += 5) {
          const y = alt / 2 + Math.sin(2 * Math.PI * (x * 9 / 1000) + j * .55) * (alt * .28) + Math.sin(2 * Math.PI * (x * 3 / 1000) - j * .9) * (alt * .14);
          p += (p ? 'L' : 'M') + x + ' ' + y.toFixed(2);
        }
        out += `<path d="${p}"/>`;
      }
      return `<g class="deriva${sentido < 0 ? ' contra' : ''}">${out}</g>`;
    };
    return `<svg class="faixa" viewBox="0 0 1000 ${alt}" preserveAspectRatio="none" aria-hidden="true">${linhas(1)}${linhas(-1)}</svg>`;
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
      if (ls.get(K.aparelho)) return; // aparelho lembrado: a sessão é renovada sozinha na próxima chamada
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
    clearInterval(timerVivo);
    E.dados = null;
    E.vistos.clear(); E.vistas.clear(); E.lancVistos = null;
    const aparelho = ls.get(K.aparelho);
    ls.set(K.aparelho, null);
    if (s?.token || aparelho) api('sair', { token: s?.token, aparelho }).catch(() => { });
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
    vistos: new Map(),      // último valor mostrado por contador
    vistas: new Set(),      // telas que já tiveram a entrada animada
    indicador: {},          // posição anterior das abas
    lancVistos: null,       // lançamentos já mostrados (para destacar os novos)
    dir: 0,
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
        <label class="lembrar"><input id="f-lembrar" type="checkbox" checked><span>Lembrar de mim neste aparelho</span></label>
        <div class="msg" id="f-msg" role="alert"></div>
        <button class="btn largo" id="f-enviar" type="submit">Entrar</button>
        <button class="link" type="button" data-modo="esqueci">Esqueci minha senha</button>`,
      criar: `
        <label class="campo"><span>Seu nome</span><input id="f-nome" type="text" autocomplete="given-name" required maxlength="60"></label>
        <label class="campo"><span>E-mail</span><input id="f-email" type="email" autocomplete="username" inputmode="email" required maxlength="120"></label>
        ${camposSenhaNova('Senha')}
        ${temConta ? '<label class="campo"><span>Código de convite</span><input id="f-convite" type="text" autocomplete="off" autocapitalize="characters" required maxlength="20"><span class="dica">Gerado pela função gerarConvite no Apps Script. Vale 48 horas.</span></label>' : ''}
        <label class="lembrar"><input id="f-lembrar" type="checkbox" checked><span>Lembrar de mim neste aparelho</span></label>
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
        <label class="lembrar"><input id="f-lembrar" type="checkbox" checked><span>Lembrar de mim neste aparelho</span></label>
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
          ${mostrarAbas ? `<div class="abas" data-grupo="acesso" role="tablist" aria-label="Acesso">
            <button type="button" role="tab" data-modo="entrar" aria-selected="${modo === 'entrar'}">Entrar</button>
            <button type="button" role="tab" data-modo="criar" aria-selected="${modo === 'criar'}">Criar conta</button>
          </div>` : '<div class="espaco"></div>'}
          <form id="f" novalidate>${formularios[modo]}</form>
          <p class="nota-seguranca">${ICONE.cadeado}<span>Sua senha não sai deste aparelho. Sem "Lembrar de mim", o acesso sai sozinho depois de ${CFG.sessaoMin} minutos parado. Três senhas erradas pausam novas tentativas.</span></p>
        </section>
      </main>`;

    if (msg) mostrarMsg(msg.texto, msg.tipo);
    posicionarIndicador($('[data-grupo="acesso"]'));

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
        entrarNoPainel(await api('entrar', Object.assign({ email, chave }, lembrarOpts())));
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
          ? await api('cadastrar', Object.assign({ nome, email, chave, convite }, lembrarOpts()))
          : await api('redefinir', Object.assign({ email: alvo, codigo, chave }, lembrarOpts()));
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

  function nomeAparelho() {
    const ua = navigator.userAgent;
    return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Navegador';
  }
  const lembrarOpts = () => ($('#f-lembrar')?.checked ? { lembrar: true, nomeAparelho: nomeAparelho() } : {});

  function entrarNoPainel(s) {
    ls.set(K.aparelho, s.aparelho || null);
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
  const somaMes = (chave, cat, semFixas) => (E.dados?.lancamentos || [])
    .filter(l => String(l.data).startsWith(chave) && (!cat || l.categoria === cat) && (!semFixas || l.origem !== 'Conta fixa'))
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
  function mediaHistorica(ref, cat, semFixas) {
    const meses = mesesAntes(ref, 6).map(chaveMes).filter(temLancamento).slice(0, 3);
    if (!meses.length) return null;
    return meses.reduce((s, k) => s + somaMes(k, cat, semFixas), 0) / meses.length;
  }

  /** Previsão de fim de mês por categoria: o que já saiu + contas fixas a vencer + ritmo do dia a dia. */
  function prever(cat, gasto, teto, ctx) {
    if (!ctx.atual) return gasto;
    const contasCat = (E.dados.contas || []).filter(c => c.ativa && c.categoria === cat);
    const futuras = contasCat.filter(c => Math.min(c.dia, ctx.diasMes) > ctx.dia && !(c.criada && c.criada > `${chaveMes(E.ref)}-${pad(Math.min(c.dia, ctx.diasMes))}`)).reduce((s, c) => s + c.valor, 0);
    if (FIXAS.includes(cat)) {
      if (contasCat.length) return gasto + futuras;
      return Math.max(gasto, teto || mediaHistorica(E.ref, cat) || 0);
    }
    const gVar = somaMes(chaveMes(E.ref), cat, true);
    const hist = mediaHistorica(E.ref, cat, true);
    const ritmo = gVar / ctx.dia;
    const ritmoHist = hist !== null ? hist / ctx.diasMes : ritmo;
    const peso = Math.min(1, ctx.dia / 10); // nos 10 primeiros dias o histórico pesa mais
    return gasto + futuras + (ritmo * peso + ritmoHist * (1 - peso)) * (ctx.diasMes - ctx.dia);
  }

  /** Retoma a sessão com o aparelho lembrado (troca o token do aparelho a cada uso). */
  async function retomar() {
    const aparelho = ls.get(K.aparelho);
    if (!aparelho) return false;
    try {
      const s = await api('retomar', { aparelho });
      ls.set(K.aparelho, s.aparelho);
      Sessao.salvar(s);
      return true;
    } catch (e) {
      if (e.codigo === 'aparelho_invalido') ls.set(K.aparelho, null);
      throw e;
    }
  }
  let retomando = null;
  /** Chamada autenticada: se a sessão venceu e o aparelho é lembrado, renova e tenta de novo. */
  async function chamar(acao, dados = {}) {
    const s = Sessao.atual();
    try {
      if (!s) throw new ErroApp('sessao_expirada', 'Sua sessão terminou. Entre de novo.');
      return await api(acao, Object.assign({ token: s.token }, dados));
    } catch (e) {
      if (e.codigo !== 'sessao_expirada' || !ls.get(K.aparelho)) throw e;
      retomando = retomando || retomar().finally(() => { retomando = null; });
      await retomando;
      return api(acao, Object.assign({ token: Sessao.atual().token }, dados));
    }
  }

  async function carregarDados() {
    if (!Sessao.atual() && !ls.get(K.aparelho)) return sair();
    const rot = $('#atualizado'); if (rot) rot.textContent = 'Atualizando…';
    try {
      E.dados = await chamar('dados');
      ss.set(K.cache, E.dados);
      renderConteudo();
    } catch (e) {
      if (e.codigo === 'sessao_expirada' || e.codigo === 'aparelho_invalido') return sair(e.message);
      if (E.dados) { renderConteudo(); if ($('#atualizado')) $('#atualizado').textContent = e.message; }
      else if ($('#conteudo')) $('#conteudo').innerHTML = `<div class="faixa-aviso">${esc(e.message)}</div>`;
    }
  }

  /** Escrita autenticada: o servidor devolve os dados já atualizados. */
  async function gravar(acao, dados) {
    try {
      E.dados = await chamar(acao, dados);
      ss.set(K.cache, E.dados);
      return true;
    } catch (e) {
      if (e.codigo === 'sessao_expirada' || e.codigo === 'aparelho_invalido') { sair(e.message); return false; }
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
          <div class="abas abas-painel" data-grupo="painel" role="tablist" aria-label="Seções">
            <button type="button" role="tab" data-aba="painel" aria-selected="${E.aba === 'painel'}">Painel</button>
            <button type="button" role="tab" data-aba="fluxo" aria-selected="${E.aba === 'fluxo'}">Fluxo</button>
            <button type="button" role="tab" data-aba="cadastros" aria-selected="${E.aba === 'cadastros'}">Cadastros</button>
          </div>
        </div>
        <div id="conteudo"><p class="carregando">Buscando seus lançamentos, ${esc(s?.nome || '')}…</p></div>
        <button class="fab" id="b-lancar" type="button" aria-label="Lançar gasto"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Lançar</span></button>
        <dialog class="folha" id="folha" aria-labelledby="folha-titulo"></dialog>
        <div class="aviso-rapido" id="aviso" role="status" aria-live="polite"></div>
        <footer class="rodape">
          <span class="ao-vivo"><i aria-hidden="true"></i><span id="atualizado"></span></span>
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
    $('#b-lancar').onclick = () => abrirFolha();
    // um só ouvinte para editar: linhas de lançamento no painel e no fluxo
    $('#conteudo').addEventListener('click', ev => {
      const alvo = ev.target.closest('[data-editar]');
      if (alvo) { ev.preventDefault(); abrirFolha(alvo.dataset.editar); }
    });
    $('#conteudo').addEventListener('keydown', ev => {
      const alvo = ev.target.closest('[data-editar]');
      if (alvo && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrirFolha(alvo.dataset.editar); }
    });
    posicionarIndicador($('.abas-painel'));
    if (E.dados) renderConteudo();
    vivo();
  }

  function irPara(aba) {
    if (aba === E.aba) return;
    E.aba = aba; E.troca = 'aba';
    $$('[data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    posicionarIndicador($('.abas-painel'));
    renderConteudo();
    scrollTo({ top: 0, behavior: movOk() ? 'smooth' : 'auto' });
  }

  function mudarMes(delta) {
    E.ref = new Date(E.ref.getFullYear(), E.ref.getMonth() + delta, 1);
    E.troca = delta > 0 ? 'frente' : 'tras'; E.trocouMes = true;
    const h = $('#mes-nome');
    h.textContent = nomeMes(E.ref);
    if (movOk()) { h.classList.remove('vira-frente', 'vira-tras'); void h.offsetWidth; h.classList.add(delta > 0 ? 'vira-frente' : 'vira-tras'); }
    if (E.dados) renderConteudo();
  }

  /** Destaca lançamentos que chegaram desde a última vez que a tela foi desenhada. */
  function marcarNovos() {
    const chaveL = l => `${l.data}|${l.valor}|${l.categoria}|${l.descricao}`;
    const atuais = new Set((E.dados.lancamentos || []).map(chaveL));
    if (E.lancVistos) $$('[data-lanc]').forEach(el => { if (!E.lancVistos.has(el.dataset.lanc)) el.classList.add('novo'); });
    E.lancVistos = atuais;
  }

  function renderConteudo() {
    if (!E.dados || !$('#conteudo')) return;
    const box = $('#conteudo');
    const chaveTela = `${E.aba}|${chaveMes(E.ref)}`;
    const entrada = movOk() && !E.vistas.has(chaveTela);
    E.vistas.add(chaveTela);
    if (E.aba === 'cadastros') renderCadastros(); else if (E.aba === 'fluxo') renderFluxo(); else renderPainel();
    $$('[data-largura]').forEach(el => { el.style.width = el.dataset.largura + '%'; });  // CSSOM: a CSP bloqueia style=""
    $$('[data-inicio]').forEach(el => { el.style.left = el.dataset.inicio + '%'; });

    // coreografia: troca de aba/mês desliza no sentido do tempo; a primeira visita cresce barras e desenha linhas
    box.classList.remove('entrada', 'troca-aba', 'troca-frente', 'troca-tras');
    void box.offsetWidth;
    if (movOk() && E.troca) box.classList.add('troca-' + E.troca);
    if (entrada) {
      box.classList.add('entrada');
      $$('.trilho, .medidor, .h-barras', box).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 14)));
      revelarAoRolar(box);
    }
    E.troca = null;
    if (E.grafico) E.grafico(entrada || !!E.trocouMes);
    E.trocouMes = false;
    animarValores(entrada);
    marcarNovos();
    const at = E.dados.atualizado ? new Date(E.dados.atualizado) : null;
    if ($('#atualizado')) $('#atualizado').textContent = at ? `Atualizado às ${pad(at.getHours())}:${pad(at.getMinutes())} de ${pad(at.getDate())}/${pad(at.getMonth() + 1)}` : '';
  }

  function valorDeFace(v, excesso) {
    return `<p class="face num${excesso ? ' excesso' : ''}" aria-label="${brl(v)}" data-contar="face-${E.aba}" data-valor="${(+v || 0).toFixed(2)}">${partesFace(+v || 0)}</p>`;
  }
  const vc = (x, k) => `<b class="valor num" data-contar="${k}" data-valor="${(+x || 0).toFixed(2)}">${brl(x)}</b>`;
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
        <button class="btn" type="button" data-aba-ir="cadastros">Lançar renda</button>`;
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
          <div><dt>Renda</dt><dd>${vc(R.total, 'bal-renda')}</dd><small>Fixo <span class="valor">${brl(R.fixo)}</span>${R.variavel ? `, variável <span class="valor">${brl(R.variavel)}</span>` : ''}</small></div>
          <div><dt>Gasto ${atual ? 'até agora' : 'no mês'}</dt><dd>${vc(total, 'bal-gasto')}</dd><small>${pct(total / R.total)} da renda</small></div>
          ${atual ? `<div><dt>Gasto previsto</dt><dd>${vc(proj, 'bal-prev')}</dd><small>${pct(proj / R.total)} da renda</small></div>` : ''}
          <div><dt>${atual ? 'Sobra prevista' : 'Sobrou'}</dt><dd class="${sobra < 0 ? 'excesso' : 'folga'}">${vc(sobra, 'bal-sobra')}</dd><small>${sobra < 0 ? 'faltou dinheiro' : pct(sobra / R.total) + ' da renda'}</small></div>
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
      if (atual && FIXAS.includes(x.c)) partes.push((E.dados.contas || []).some(c => c.ativa && c.categoria === x.c) ? 'Inclui as contas fixas a vencer' : 'Conta do mês: a previsão usa o teto');
      return `<div class="cat"><div class="linha1"><span>${esc(x.c)}</span><span class="v">${topo}</span></div>
        <div class="trilho">
          <i class="t-gasto ${x.t ? classe(x.g / x.t) : 'sem-teto'}" data-largura="${w(x.g, escala)}"></i>
          ${atual && x.p > x.g ? `<i class="t-prev ${x.t ? classe(rP) : 'sem-teto'}" data-inicio="${w(x.g, escala)}" data-largura="${w(x.p - x.g, escala)}"></i>` : ''}
          ${x.t ? `<b class="t-marco" data-inicio="${w(x.t, escala)}" title="Teto ${brl(x.t)}"></b>` : ''}
        </div>
        <p class="linha2">${partes.join('. ')}.</p></div>`;
    }).join('') : '<p class="vazio">Nenhum gasto neste mês. Toque em Lançar para registrar o primeiro.</p>';

    // ---------- formas e últimos ----------
    const porForma = {};
    lanc.forEach(l => { const f = l.forma || 'Sem forma'; porForma[f] = (porForma[f] || 0) + l.valor; });
    const htmlFormas = Object.keys(porForma).length ? Object.entries(porForma).sort((a, b) => b[1] - a[1]).map(([f, val]) =>
      `<div class="linha"><div class="esq">${esc(f)}</div><div class="dir"><span class="valor num">${brl(val)}</span><small>${pct(val / total)}</small></div></div>`
    ).join('') : '<p class="vazio">Sem lançamentos.</p>';
    const ordenados = [...lanc].sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criado).localeCompare(String(a.criado)));
    const ult = E.verTodos ? ordenados : ordenados.slice(0, 10);
    const htmlUlt = ult.length ? ult.map(l => {
      const [, mm, dd] = String(l.data).split('-');
      const editar = l.id ? ` data-editar="${esc(l.id)}" role="button" tabindex="0" aria-label="Editar ${esc(l.descricao || l.categoria)}, ${brl(l.valor)}"` : '';
      return `<div class="linha${l.id ? ' editavel' : ''}" data-lanc="${esc(`${l.data}|${l.valor}|${l.categoria}|${l.descricao}`)}"${editar}><div class="esq"><div>${esc(l.descricao || l.categoria)}</div>
        <small>${dd}/${mm}, ${esc(l.categoria)}, ${esc(l.forma)}${l.origem === 'Conta fixa' ? ', conta fixa' : ''}</small></div><div class="dir"><span class="valor num">${brl(l.valor)}</span></div></div>`;
    }).join('') + (ordenados.length > 10 ? `<button class="link" type="button" id="b-ver-todos">${E.verTodos ? 'Mostrar só os últimos 10' : `Ver todos os ${ordenados.length} lançamentos`}</button>` : '')
      : '<p class="vazio">Sem lançamentos neste mês. Toque em Lançar para registrar um gasto.</p>';

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
          <section class="secao"><h3>Lançamentos <small>toque para editar</small></h3>${htmlUlt}</section>
        </div>
      </div>
      <section class="secao"><h3>Mês a mês</h3>
        ${htmlHist ? `<div class="hist cab"><span></span><span></span><span>Renda</span><span>Gasto</span><span>Sobra</span></div>${htmlHist}
          <p class="legenda-medidor"><span class="lg-renda">Renda</span><span class="lg-gasto">Gasto</span></p>` : '<p class="vazio">Ainda não há meses com renda ou gasto.</p>'}
        ${previsao}
      </section>`;

    $$('[data-aba-ir]').forEach(b => b.onclick = () => irPara(b.dataset.abaIr));
    const vt = $('#b-ver-todos'); if (vt) vt.onclick = () => { E.verTodos = !E.verTodos; renderConteudo(); };
    E.grafico = futuro ? null : anim => { const box = $('#ritmo-svg'); if (box) { box.innerHTML = graficoRitmo(lanc, diasMes, dia, teto, box.clientWidth); if (anim && movOk()) box.firstElementChild.classList.add('desenhar'); } };
  }

  /* ---------------------- fluxo de caixa (cálculo) ---------------------- */
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deYmd = k => { const [a, mm, dd] = k.split('-').map(Number); return new Date(a, mm - 1, dd); };
  const diaNoMes = (a, m0, dia) => new Date(a, m0, Math.min(dia, new Date(a, m0 + 1, 0).getDate()));
  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  /** Data em que uma compra no crédito sai da conta (vencimento da fatura). */
  function pagamentoCredito(k) {
    const c = E.dados?.ajustes?.cartao; if (!c) return k;
    const p = deYmd(k);
    let fech = diaNoMes(p.getFullYear(), p.getMonth(), c.fecha);
    if (p > fech) fech = diaNoMes(p.getFullYear(), p.getMonth() + 1, c.fecha);
    const venc = c.vence > c.fecha
      ? diaNoMes(fech.getFullYear(), fech.getMonth(), c.vence)
      : diaNoMes(fech.getFullYear(), fech.getMonth() + 1, c.vence);
    return ymd(venc);
  }
  const usaCartao = forma => forma === 'Crédito' && !!E.dados?.ajustes?.cartao;

  /** Gasto variável diário estimado (sem contas fixas), misturando o mês atual com o histórico. */
  function ritmoVariavel() {
    const k = chaveMes(hoje), dia = hoje.getDate();
    const atualVar = somaMes(k, null, true);
    const meses = mesesAntes(hoje, 6).map(chaveMes).filter(temLancamento).slice(0, 3);
    const hist = meses.length ? meses.reduce((s, x) => s + somaMes(x, null, true), 0) / meses.length / 30 : null;
    const ritmo = atualVar / dia;
    if (hist === null) return ritmo;
    const peso = Math.min(1, dia / 10);
    return ritmo * peso + hist * (1 - peso);
  }

  /** Entradas e saídas por dia entre duas datas (inclusive). */
  function movimentos(ini, fim) {
    const kIni = ymd(ini), kFim = ymd(fim), kHoje = ymd(hoje);
    const M = new Map();
    const slot = k => { if (!M.has(k)) M.set(k, { ent: [], sai: [] }); return M.get(k); };
    const dentro = k => k >= kIni && k <= kFim;
    const faturas = new Map(); // vencimento -> { valor, qtd, prev }
    const addFatura = (k, valor, prev) => { const f = faturas.get(k) || { valor: 0, qtd: 0, prev: 0 }; f.valor += valor; f.qtd++; if (prev) f.prev += valor; faturas.set(k, f); };

    const meses = [];
    for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);
    // lança também faturas de compras do mês anterior ao início do intervalo
    const desde = ymd(new Date(ini.getFullYear(), ini.getMonth() - 2, 1));

    // 1. entradas
    const R = E.dados.receitas || [];
    const diaVar = (R.filter(r => r.tipo === 'variavel').sort((a, b) => b.mes.localeCompare(a.mes))[0] || {}).dia || 30;
    meses.forEach(d => {
      const ch = chaveMes(d), r = renda(ch);
      if (r.fixoReg) { const k = ymd(diaNoMes(d.getFullYear(), d.getMonth(), r.fixoReg.dia || 15)); if (dentro(k)) slot(k).ent.push({ desc: r.fixoReg.descricao || 'Salário fixo', valor: r.fixo, prev: k > kHoje }); }
      r.variaveis.forEach(x => { const k = ymd(diaNoMes(d.getFullYear(), d.getMonth(), x.dia || 30)); if (dentro(k)) slot(k).ent.push({ desc: x.descricao, valor: x.valor, prev: k > kHoje }); });
      if (!r.variaveis.length && ch >= chaveMes(hoje)) {
        const media = [d, ...mesesAntes(d, 3)].slice(1).map(chaveMes).reduce((s, x) => s + renda(x).variavel, 0) / 3;
        const k = ymd(diaNoMes(d.getFullYear(), d.getMonth(), diaVar));
        if (media > 0 && dentro(k) && k > kHoje) slot(k).ent.push({ desc: 'Variável (média dos últimos 3 meses)', valor: media, prev: true });
      }
    });

    // 2. saídas lançadas (crédito entra no vencimento da fatura)
    (E.dados.lancamentos || []).forEach(l => {
      if (String(l.data) < desde) return;
      if (usaCartao(l.forma)) { addFatura(pagamentoCredito(l.data), l.valor, false); return; }
      // lançado depois de informar o saldo no mesmo dia: ainda não está no saldo informado
      const anc = E.dados.ajustes?.saldo;
      const depois = !!(anc && anc.em && l.criado && l.data === anc.data && l.criado > anc.em);
      if (dentro(l.data)) slot(l.data).sai.push({ desc: l.descricao || l.categoria, valor: l.valor, cat: l.categoria, depois, id: l.id });
    });

    // 3. contas fixas que ainda vão vencer (as vencidas já foram lançadas pela rotina diária)
    const contas = (E.dados.contas || []).filter(c => c.ativa);
    const mesesContas = [new Date(ini.getFullYear(), ini.getMonth() - 1, 1), ...meses];
    mesesContas.forEach(d => contas.forEach(c => {
      const k = ymd(diaNoMes(d.getFullYear(), d.getMonth(), c.dia));
      if (k <= kHoje || (c.criada && c.criada > k)) return;
      if (usaCartao(c.forma)) addFatura(pagamentoCredito(k), c.valor, true);
      else if (dentro(k)) slot(k).sai.push({ desc: c.nome, valor: c.valor, prev: true, fixa: true });
    }));

    // 4. gasto do dia a dia estimado nos dias que ainda não chegaram
    const taxa = ritmoVariavel();
    if (taxa > 0) for (let d = new Date(Math.max(+ini, +hoje + 86400000)); ymd(d) <= kFim; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      slot(ymd(d)).sai.push({ desc: 'Gastos do dia a dia (estimativa)', valor: taxa, prev: true, estimativa: true });
    }

    faturas.forEach((f, k) => { if (dentro(k)) slot(k).sai.push({ desc: `Fatura do cartão (${f.qtd} ${f.qtd === 1 ? 'item' : 'itens'}${f.prev ? ', inclui contas a lançar' : ''})`, valor: f.valor, prev: k > kHoje, fatura: true }); });
    return M;
  }

  /** Saldo no fim de cada dia do mês de referência. */
  function fluxoDoMes(ref) {
    const ini = new Date(ref.getFullYear(), ref.getMonth(), 1), fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const ancora = E.dados.ajustes?.saldo || null;
    const dA = ancora ? deYmd(ancora.data) : null;
    const de = dA && dA < ini ? dA : ini;
    const ate = dA && dA > fim ? dA : fim;
    const M = movimentos(de, ate);
    const net = (k, so) => { const m = M.get(k); if (!m) return 0; const f = x => !so || (so === 'depois' ? x.depois : !x.depois); return m.ent.filter(f).reduce((s, x) => s + x.valor, 0) - m.sai.filter(f).reduce((s, x) => s + x.valor, 0); };

    // saldo no início do mês
    let inicial = 0;
    if (ancora) {
      inicial = ancora.valor;
      const kA = ancora.data, kIni = ymd(ini);
      // o saldo informado já inclui o que saiu antes dele no mesmo dia; o lançado depois ainda vai sair
      if (kA < kIni) {
        inicial += net(kA, 'depois');
        for (let d = new Date(dA.getFullYear(), dA.getMonth(), dA.getDate() + 1); d < ini; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) inicial += net(ymd(d));
      } else {
        for (let d = new Date(+ini); ymd(d) <= kA; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) inicial -= ymd(d) === kA ? net(ymd(d), 'antes') : net(ymd(d));
      }
    }
    const dias = [];
    let saldo = inicial;
    for (let d = new Date(+ini); d <= fim; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const k = ymd(d), m = M.get(k) || { ent: [], sai: [] };
      const ent = m.ent.reduce((s, x) => s + x.valor, 0), sai = m.sai.reduce((s, x) => s + x.valor, 0);
      saldo += ent - sai;
      dias.push({ d, k, ent, sai, saldo, itens: m, futuro: k > ymd(hoje), hoje: k === ymd(hoje) });
    }
    return { inicial, dias, ancora };
  }

  /* ---------------------- folha de lançamento ---------------------- */
  // Abre de baixo para cima: valor primeiro (teclado numérico), depois categoria e forma em um toque.
  function categoriasPorUso() {
    const base = E.dados.categorias || [];
    const limite = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 60));
    const uso = {};
    (E.dados.lancamentos || []).forEach(l => { if (l.data >= limite && l.origem !== 'Conta fixa') uso[l.categoria] = (uso[l.categoria] || 0) + 1; });
    return [...base].sort((a, b) => (uso[b] || 0) - (uso[a] || 0));
  }

  function avisoRapido(txt) {
    const a = $('#aviso'); if (!a) return;
    a.textContent = txt; a.classList.remove('visivel'); void a.offsetWidth; a.classList.add('visivel');
    clearTimeout(avisoRapido.t); avisoRapido.t = setTimeout(() => a.classList.remove('visivel'), 2800);
  }

  function fecharFolha() {
    const d = $('#folha'); if (!d || !d.open) return;
    if (!movOk()) { d.close(); return; }
    d.classList.remove('aberta');
    d.addEventListener('transitionend', () => d.close(), { once: true });
    setTimeout(() => { if (d.open) d.close(); }, 400);
  }

  function abrirFolha(id) {
    const d = $('#folha'); if (!d || !E.dados) return;
    const atual = id ? (E.dados.lancamentos || []).find(l => l.id === id) : null;
    if (id && !atual) return avisoRapido('Esse gasto não está mais na lista. Toque em Atualizar.');
    const cats = categoriasPorUso(), formas = E.dados.formas || ['Pix', 'Crédito', 'Débito', 'Dinheiro'];
    const cat = atual?.categoria || '', forma = atual?.forma || ls.get(K.forma) || 'Pix';
    const valorIni = atual ? atual.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
    const chip = (nome, grupo, sel) => `<button type="button" class="chip" role="radio" aria-checked="${sel}" data-grupo="${grupo}" data-v="${esc(nome)}">${esc(nome)}</button>`;

    d.innerHTML = `
      <form class="folha-corpo" id="g-form" method="dialog" novalidate>
        <div class="folha-topo">
          <span class="alca" aria-hidden="true"></span>
          <h2 id="folha-titulo">${atual ? 'Editar gasto' : 'Novo gasto'}</h2>
          <button class="ico" type="button" id="g-fechar" aria-label="Fechar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
        <label class="valor-grande"><span class="rs">R$</span><input id="g-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="12" value="${valorIni}" aria-label="Valor do gasto"></label>
        <fieldset class="chips" role="radiogroup" aria-label="Categoria"><legend>Categoria</legend>${cats.map(c => chip(c, 'cat', c === cat)).join('')}</fieldset>
        <fieldset class="chips" role="radiogroup" aria-label="Forma de pagamento"><legend>Pagou com</legend>${formas.map(f => chip(f, 'forma', f === forma)).join('')}</fieldset>
        <div class="folha-linha">
          <label class="campo"><span>Descrição (opcional)</span><input id="g-desc" type="text" autocomplete="off" maxlength="200" placeholder="Ex.: Almoço com o time" value="${esc(atual?.descricao || '')}"></label>
          <label class="campo"><span>Data</span><input id="g-data" type="date" value="${atual?.data || ymd(hoje)}" max="${ymd(new Date(hoje.getFullYear() + 1, 11, 31))}"></label>
        </div>
        ${atual?.origem === 'Conta fixa' ? '<p class="apoio-secao">Este gasto veio de uma conta fixa. Mudar aqui altera só este mês.</p>' : ''}
        <div class="msg" id="g-msg" role="alert"></div>
        <button class="btn largo" id="g-salvar" type="submit">${atual ? 'Salvar alterações' : 'Salvar gasto'}</button>
        ${atual ? '<button class="link perigo largo" type="button" id="g-apagar">Apagar gasto</button>' : ''}
      </form>`;

    d.showModal();
    requestAnimationFrame(() => d.classList.add('aberta'));
    setTimeout(() => $('#g-valor').focus(), movOk() ? 260 : 0);

    // chips: um toque escolhe; setas navegam como num grupo de rádio
    $$('.chip', d).forEach(b => b.onclick = () => {
      $$(`.chip[data-grupo="${b.dataset.grupo}"]`, d).forEach(x => x.setAttribute('aria-checked', String(x === b)));
      if (b.dataset.grupo === 'cat') $('#g-msg').textContent = '';
    });
    $('#g-fechar').onclick = fecharFolha;
    d.oncancel = ev => { ev.preventDefault(); fecharFolha(); };
    d.onclick = ev => { if (ev.target === d) fecharFolha(); }; // toque fora da folha
    $('#g-valor').addEventListener('input', ev => { ev.target.value = ev.target.value.replace(/[^\d.,]/g, ''); });

    $('#g-form').onsubmit = async ev => {
      ev.preventDefault();
      const msg = $('#g-msg'), btn = $('#g-salvar');
      const valor = lerValor($('#g-valor').value);
      const categoria = $('.chip[data-grupo="cat"][aria-checked="true"]', d)?.dataset.v;
      const fp = $('.chip[data-grupo="forma"][aria-checked="true"]', d)?.dataset.v;
      const data = $('#g-data').value;
      msg.className = 'msg erro';
      if (!(valor > 0)) { msg.textContent = 'Digite o valor do gasto.'; $('#g-valor').focus(); return; }
      if (!categoria) { msg.textContent = 'Escolha a categoria.'; return; }
      if (!fp) { msg.textContent = 'Escolha como pagou.'; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { msg.textContent = 'Escolha a data.'; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      const corpo = { valor, categoria, forma: fp, data, descricao: $('#g-desc').value.trim() };
      try {
        if (await gravar(atual ? 'editarLancamento' : 'lancar', atual ? Object.assign({ id: atual.id }, corpo) : corpo)) {
          ls.set(K.forma, fp);
          fecharFolha();
          renderConteudo();
          avisoRapido(atual ? 'Gasto atualizado.' : `Gasto salvo: ${brl(valor)} em ${categoria}.`);
        }
      } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = atual ? 'Salvar alterações' : 'Salvar gasto'; }
    };

    const apagar = $('#g-apagar');
    if (apagar) apagar.onclick = async () => {
      if (apagar.dataset.confirmar !== '1') { apagar.dataset.confirmar = '1'; apagar.textContent = 'Toque de novo para apagar'; return; }
      apagar.disabled = true; apagar.textContent = 'Apagando…';
      try { if (await gravar('removerLancamento', { id: atual.id })) { fecharFolha(); renderConteudo(); avisoRapido('Gasto apagado.'); } }
      catch (e) { $('#g-msg').textContent = e.message; apagar.disabled = false; apagar.textContent = 'Apagar gasto'; }
    };
  }

  /* -------------------------- aba FLUXO -------------------------- */
  function renderFluxo() {
    const mesTxt = MESES[E.ref.getMonth()];
    const F = fluxoDoMes(E.ref);
    const ult = F.dias[F.dias.length - 1];
    const min = F.dias.reduce((a, b) => b.saldo < a.saldo ? b : a, F.dias[0]);
    const negativos = F.dias.filter(x => x.saldo < 0);
    const temFuturo = F.dias.some(x => x.futuro);
    const totEnt = F.dias.reduce((s, x) => s + x.ent, 0), totSai = F.dias.reduce((s, x) => s + x.sai, 0);
    const proxEnt = F.dias.find(x => x.futuro && x.ent > 0);

    const avisos = [];
    if (!F.ancora) avisos.push(`<div class="faixa-aviso">Cadastre quanto tem na conta hoje (em Cadastros) para ver o saldo real. Por enquanto, o fluxo começa do zero no dia 1.
      <button class="link" type="button" data-aba-ir="cadastros">Cadastrar saldo</button></div>`);
    if (negativos.length) {
      const a = negativos[0], b = negativos[negativos.length - 1];
      avisos.push(`<p class="alerta">Seu saldo ${temFuturo ? 'fica' : 'ficou'} negativo ${a.k === b.k ? `no dia ${a.d.getDate()}` : `entre os dias ${a.d.getDate()} e ${b.d.getDate()}`}. O pior momento é o dia ${min.d.getDate()}, com ${v(min.saldo)}.${proxEnt && proxEnt.k > a.k ? ` A próxima entrada é no dia ${proxEnt.d.getDate()}: antecipe a entrada ou adie contas desse período.` : ''}</p>`);
    }

    const htmlDias = F.dias.map(x => {
      const vazio = !x.itens.ent.length && !x.itens.sai.length;
      const itens = [...x.itens.ent.map(i => ({ ...i, e: true })), ...x.itens.sai]
        .map(i => `<li class="${i.e ? 'ent' : 'sai'}${i.prev ? ' prev' : ''}${i.id ? ' editavel' : ''}"${i.id ? ` data-editar="${esc(i.id)}" role="button" tabindex="0"` : ''}><span>${esc(i.desc)}${i.prev ? ' <small>previsto</small>' : ''}</span><span class="valor num">${i.e ? '+' : '−'} ${brl(i.valor)}</span></li>`).join('');
      const resumo = `<span class="fd-dia">${pad(x.d.getDate())} <small>${x.hoje ? 'hoje' : SEMANA[x.d.getDay()]}</small></span>
        <span class="fd-ent valor num">${x.ent ? '+ ' + brl(x.ent) : ''}</span>
        <span class="fd-sai valor num">${x.sai ? '− ' + brl(x.sai) : ''}</span>
        <span class="fd-saldo valor num${x.saldo < 0 ? ' excesso' : ''}">${brl(x.saldo)}</span>`;
      const cls = `fd${x.futuro ? ' futuro' : ''}${x.hoje ? ' hoje' : ''}${vazio ? ' vazio' : ''}`;
      return vazio ? `<div class="${cls}"><div class="fd-linha">${resumo}</div></div>`
        : `<details class="${cls}"><summary class="fd-linha">${resumo}</summary><ul class="fd-itens">${itens}</ul></details>`;
    }).join('');

    $('#conteudo').innerHTML = `
      <div class="abertura">
        <section class="heroi" aria-label="Saldo do mês">
          <p class="frase">${temFuturo ? `Saldo previsto em ${ult.d.getDate()} de ${mesTxt}` : `Saldo em ${ult.d.getDate()} de ${mesTxt}`}</p>
          ${valorDeFace(ult.saldo, ult.saldo < 0)}
          <p class="depois">Menor saldo do mês: ${v(min.saldo)} no dia ${min.d.getDate()}.</p>
          <p class="meta">Começou o mês com ${v(F.inicial)}. Entradas ${v(totEnt)}, saídas ${v(totSai)}.${proxEnt ? ` Próxima entrada: dia ${proxEnt.d.getDate()}, ${v(proxEnt.ent)}.` : ''}</p>
        </section>
        <section class="ritmo" aria-label="Saldo dia a dia"><div id="ritmo-svg"></div>
          <div class="legenda"><span>Saldo realizado</span>${temFuturo ? '<span class="l-ideal">Saldo previsto</span>' : ''}</div></section>
      </div>
      ${faixa()}
      ${avisos.join('')}
      <section class="secao">
        <h3>Dia a dia <small>toque no dia para ver o que entrou e saiu</small></h3>
        <div class="fd cab"><div class="fd-linha"><span class="fd-dia">Dia</span><span class="fd-ent">Entrou</span><span class="fd-sai">Saiu</span><span class="fd-saldo">Saldo</span></div></div>
        ${htmlDias}
        <p class="previsao">${E.dados.ajustes?.cartao ? `Compras no crédito entram no dia ${E.dados.ajustes.cartao.vence}, quando a fatura vence.` : 'Compras no crédito entram no dia da compra. Cadastre o fechamento e o vencimento do cartão para elas caírem no dia da fatura.'} Os dias que ainda não chegaram usam uma estimativa do seu gasto do dia a dia.</p>
      </section>`;

    $$('[data-aba-ir]').forEach(b => b.onclick = () => irPara(b.dataset.abaIr));
    E.grafico = anim => { const box = $('#ritmo-svg'); if (box) { box.innerHTML = graficoSaldo(F.dias, box.clientWidth); if (anim && movOk()) box.firstElementChild.classList.add('desenhar'); } };
    const hj = $('.fd.hoje'); if (hj && hj.tagName === 'DETAILS') hj.open = true;
  }

  function graficoSaldo(dias, largura) {
    const W = Math.max(280, Math.round(largura || 640)), H = Math.round(Math.min(220, Math.max(160, W * .36)));
    const P = { e: 52, d: 8, t: 10, b: 24 };
    const vals = dias.map(x => x.saldo);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    if (hi - lo < 1) hi = lo + 1;
    const folga = (hi - lo) * .08; lo -= lo < 0 ? folga : 0; hi += folga;
    const n = dias.length;
    const x = i => P.e + i / Math.max(1, n - 1) * (W - P.e - P.d);
    const yv = val => P.t + (hi - val) / (hi - lo) * (H - P.t - P.b);
    const curto = val => Math.abs(val) >= 1000 ? (val / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil' : String(Math.round(val));
    let g = '';
    [lo, (lo + hi) / 2, hi].forEach(val => { const yy = yv(val).toFixed(1); g += `<line class="grade" x1="${P.e}" x2="${W - P.d}" y1="${yy}" y2="${yy}"/><text class="eixo" x="${P.e - 8}" y="${+yy + 4}" text-anchor="end">${curto(val)}</text>`; });
    if (lo < 0) g += `<line class="zero" x1="${P.e}" x2="${W - P.d}" y1="${yv(0)}" y2="${yv(0)}"/>`;
    [0, 9, 19, n - 1].forEach(i => { g += `<text class="eixo" x="${x(i)}" y="${H - 5}" text-anchor="middle">${i + 1}</text>`; });
    const iHoje = dias.findIndex(d => d.futuro);
    const corte = iHoje === -1 ? n - 1 : Math.max(0, iHoje - 1);
    const pts = (a, b) => dias.slice(a, b + 1).map((d, j) => `${j ? 'L' : 'M'}${x(a + j).toFixed(1)} ${yv(d.saldo).toFixed(1)}`).join('');
    if (dias[0].futuro) g += `<path class="ideal" d="${pts(0, n - 1)}"/>`;
    else {
      g += `<path class="real" pathLength="1" d="${pts(0, corte)}"/>`;
      if (corte < n - 1) g += `<path class="ideal tarde" d="${pts(corte, n - 1)}"/>`;
      const neg = dias[corte].saldo < 0 ? ' excesso' : '';
      g += `<circle class="pulso${neg}" cx="${x(corte)}" cy="${yv(dias[corte].saldo)}" r="4.5"/><circle class="ponto${neg}" cx="${x(corte)}" cy="${yv(dias[corte].saldo)}" r="4.5"/>`;
    }
    dias.forEach((d, i) => { if (d.ent > 0) g += `<circle class="marco-ent" cx="${x(i)}" cy="${yv(d.saldo)}" r="3"/>`; });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Saldo da conta dia a dia">${g}</svg>`;
  }

  /* ------------------------ aba CADASTROS ------------------------ */
  const lerValor = s => { const t = String(s || '').replace(/[R$\s]/g, ''); const neg = /^-/.test(t); const n = Number(t.replace(/^-/, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(n) ? (neg ? -n : n) : NaN; };
  const opcoes = (lista, sel) => lista.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');

  function renderCadastros() {
    const D = E.dados, chave = chaveMes(E.ref), mesTxt = MESES[E.ref.getMonth()];
    const R = renda(chave);
    const fixos = (D.receitas || []).filter(r => r.tipo === 'fixo').sort((a, b) => b.mes.localeCompare(a.mes));
    const base3 = [E.ref, ...mesesAntes(E.ref, 2)].map(chaveMes);
    const media3 = base3.reduce((s, k) => s + renda(k).variavel, 0) / 3;
    const nomeMesChave = k => { const [a, mm] = k.split('-').map(Number); return MESES[mm - 1] + ' de ' + a; };
    const dataBR = k => k.split('-').reverse().join('/');
    const btnRemover = (id, acao) => `<button class="link perigo" type="button" data-remover="${esc(id)}" data-acao-remover="${acao}">Remover</button>`;
    const contas = (D.contas || []).slice().sort((a, b) => a.dia - b.dia);
    const totalContas = contas.filter(c => c.ativa).reduce((s, c) => s + c.valor, 0);
    const aj = D.ajustes || {};
    const cats = D.categorias || [], formas = D.formas || ['Pix', 'Crédito', 'Débito', 'Dinheiro'];

    $('#conteudo').innerHTML = `
      <section class="heroi" aria-label="Renda do mês">
        <p class="frase">Sua renda em ${mesTxt}</p>
        ${valorDeFace(R.total)}
        <p class="depois">${R.total ? `Fixo <span class="valor">${brl(R.fixo)}</span>${R.variavel ? ` e variável <span class="valor">${brl(R.variavel)}</span>` : ', sem variável lançado'}. Contas fixas: <span class="valor">${brl(totalContas)}</span> por mês.` : 'Nenhuma renda cadastrada para este mês.'}</p>
      </section>
      ${faixa()}
      <div class="grade-secoes">
        <div>
          <section class="secao">
            <h3>Saldo em conta</h3>
            <p class="apoio-secao">${aj.saldo ? `Último informado: ${v(aj.saldo.valor)} em ${dataBR(aj.saldo.data)}.` : 'Informe quanto tem na conta para o fluxo mostrar o saldo real.'} Atualize sempre que quiser acertar o saldo com o banco.</p>
            <form class="form-linha" id="f-saldo" novalidate>
              <label class="campo"><span>Saldo na conta</span><input id="sd-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 2.350,00" maxlength="16"></label>
              <label class="campo"><span>Em que dia</span><input id="sd-data" type="date" value="${ymd(hoje)}"></label>
              <button class="btn" type="submit">Salvar saldo</button>
            </form>
            <div class="msg" id="sd-msg" role="status"></div>
          </section>

          <section class="secao">
            <h3>Salário fixo</h3>
            <p class="apoio-secao">${R.fixoReg ? `Em vigor: ${v(R.fixoReg.valor)} no dia ${R.fixoReg.dia || 15}, desde ${nomeMesChave(R.fixoReg.mes)}.` : 'Nenhum fixo em vigor neste mês.'} Ele se repete todo mês até você cadastrar um valor novo.</p>
            <form class="form-linha tres" id="f-fixo" novalidate>
              <label class="campo"><span>Valor por mês</span><input id="fx-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 3.700,00" maxlength="14"></label>
              <label class="campo"><span>Dia que cai</span><input id="fx-dia" type="number" inputmode="numeric" min="1" max="31" value="${R.fixoReg?.dia || 15}"></label>
              <label class="campo"><span>A partir de</span><input id="fx-mes" type="month" value="${chave}"></label>
              <button class="btn" type="submit">Salvar fixo</button>
            </form>
            <div class="msg" id="fx-msg" role="status"></div>
            ${fixos.length ? `<h4>Histórico do fixo</h4>${fixos.map(f => `<div class="linha"><div class="esq"><div>Desde ${nomeMesChave(f.mes)}</div><small>Cai no dia ${f.dia || 15}</small></div><div class="dir"><span class="valor num">${brl(f.valor)}</span> ${btnRemover(f.id, 'removerReceita')}</div></div>`).join('')}` : ''}
          </section>

          <section class="secao">
            <h3>Variável de ${mesTxt}</h3>
            <p class="apoio-secao">Projetos, comissões e bônus. Média dos últimos 3 meses: ${v(media3)}. Nos meses sem variável lançado, o fluxo usa essa média.</p>
            <form class="form-linha tres" id="f-var" novalidate>
              <label class="campo"><span>De onde veio</span><input id="vr-desc" type="text" autocomplete="off" placeholder="Ex.: Projeto NSF" maxlength="80"></label>
              <label class="campo"><span>Valor</span><input id="vr-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.200,00" maxlength="14"></label>
              <label class="campo"><span>Dia que cai</span><input id="vr-dia" type="number" inputmode="numeric" min="1" max="31" value="30"></label>
              <button class="btn" type="submit">Adicionar</button>
            </form>
            <div class="msg" id="vr-msg" role="status"></div>
            ${R.variaveis.length ? R.variaveis.map(r => `<div class="linha"><div class="esq"><div>${esc(r.descricao)}</div><small>Dia ${r.dia || 30}</small></div><div class="dir"><span class="valor num">${brl(r.valor)}</span> ${btnRemover(r.id, 'removerReceita')}</div></div>`).join('')
              : `<p class="vazio">Nenhum variável lançado em ${mesTxt}.</p>`}
          </section>
        </div>

        <div>
          <section class="secao">
            <h3>Contas fixas <small>${brl(totalContas)} por mês</small></h3>
            <p class="apoio-secao">Elas entram sozinhas em Lançamentos no dia de cada uma. Não lance essas contas pelo formulário, senão contam duas vezes.</p>
            <form class="form-conta" id="f-conta" novalidate>
              <label class="campo c-nome"><span>Conta</span><input id="ct-nome" type="text" autocomplete="off" placeholder="Ex.: Aluguel" maxlength="60"></label>
              <label class="campo"><span>Valor</span><input id="ct-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.500,00" maxlength="14"></label>
              <label class="campo"><span>Dia</span><input id="ct-dia" type="number" inputmode="numeric" min="1" max="31" placeholder="10"></label>
              <label class="campo"><span>Categoria</span><select id="ct-cat">${opcoes(cats, 'Contas fixas')}</select></label>
              <label class="campo"><span>Paga com</span><select id="ct-forma">${opcoes(formas, 'Pix')}</select></label>
              <button class="btn" type="submit">Adicionar conta</button>
            </form>
            <div class="msg" id="ct-msg" role="status"></div>
            ${contas.length ? contas.map(c => `<div class="linha"><div class="esq"><div>${esc(c.nome)}</div><small>Dia ${c.dia}, ${esc(c.categoria)}, ${esc(c.forma)}</small></div><div class="dir"><span class="valor num">${brl(c.valor)}</span> ${btnRemover(c.id, 'removerConta')}</div></div>`).join('')
              : '<p class="vazio">Nenhuma conta fixa cadastrada.</p>'}
          </section>

          <section class="secao">
            <h3>Cartão de crédito</h3>
            <p class="apoio-secao">${aj.cartao ? `A fatura fecha no dia ${aj.cartao.fecha} e vence no dia ${aj.cartao.vence}.` : 'Sem cartão cadastrado: compras no crédito saem do saldo no dia da compra.'} Com o cartão cadastrado, elas saem do saldo no vencimento da fatura.</p>
            <form class="form-linha" id="f-cartao" novalidate>
              <label class="campo"><span>Fecha no dia</span><input id="cc-fecha" type="number" inputmode="numeric" min="1" max="31" value="${aj.cartao?.fecha || ''}" placeholder="3"></label>
              <label class="campo"><span>Vence no dia</span><input id="cc-vence" type="number" inputmode="numeric" min="1" max="31" value="${aj.cartao?.vence || ''}" placeholder="10"></label>
              <button class="btn" type="submit">Salvar cartão</button>
            </form>
            ${aj.cartao ? '<button class="link perigo" type="button" id="cc-remover">Não uso cartão de crédito</button>' : ''}
            <div class="msg" id="cc-msg" role="status"></div>
          </section>

          <section class="secao">
            <h3>Acesso neste aparelho</h3>
            <p class="apoio-secao">${ls.get(K.aparelho) ? 'Este aparelho está lembrado: você entra sem digitar a senha por até 60 dias desde o último uso. Tocar em Sair também faz o aparelho ser esquecido.' : 'Este aparelho não está lembrado. Para não precisar da senha toda vez, saia e entre de novo marcando "Lembrar de mim".'}</p>
            ${ls.get(K.aparelho) ? '<button class="btn secundario" type="button" id="b-esquecer">Esquecer este aparelho</button>' : ''}
            ${D.formulario ? `<h4>Plano B</h4><p class="apoio-secao">Se o app não abrir, lance pelo formulário do Google. O gasto entra do mesmo jeito.</p><a class="link" href="${esc(D.formulario)}" target="_blank" rel="noopener noreferrer">Abrir formulário</a>` : ''}
          </section>
        </div>
      </div>`;

    const enviarForm = async (form, msgSel, montar, okTxt) => {
      const msg = $(msgSel), btn = form.querySelector('button[type="submit"]');
      msg.className = 'msg erro'; msg.textContent = '';
      const dados = montar(msg); if (!dados) return;
      btn.disabled = true; const rot = btn.textContent; btn.textContent = 'Salvando…';
      try {
        if (await gravar(dados.acao, dados.corpo)) { renderConteudo(); const m2 = $(msgSel); if (m2) { m2.className = 'msg info'; m2.textContent = okTxt; } }
      } catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; btn.disabled = false; btn.textContent = rot; }
    };
    const dia = id => { const n = Number($(id).value); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; };
    const erro = (msg, txt, foco) => { msg.textContent = txt; if (foco) $(foco).focus(); return null; };

    $('#f-saldo').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#sd-msg', msg => {
      const valor = lerValor($('#sd-valor').value), data = $('#sd-data').value;
      if (!isFinite(valor) || $('#sd-valor').value.trim() === '') return erro(msg, 'Digite o saldo. Se estiver negativo, use o sinal de menos.', '#sd-valor');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro(msg, 'Escolha o dia desse saldo.', '#sd-data');
      return { acao: 'salvarAjustes', corpo: { saldo: { valor, data } } };
    }, 'Saldo salvo.'); };

    $('#f-fixo').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#fx-msg', msg => {
      const valor = lerValor($('#fx-valor').value), mes = $('#fx-mes').value, d = dia('#fx-dia');
      if (!(valor > 0)) return erro(msg, 'Digite o valor do fixo. Ex.: 3.700,00', '#fx-valor');
      if (!d) return erro(msg, 'O dia precisa ser de 1 a 31.', '#fx-dia');
      if (!/^\d{4}-\d{2}$/.test(mes)) return erro(msg, 'Escolha o mês em que esse valor começa.');
      return { acao: 'salvarFixo', corpo: { valor, mes, dia: d } };
    }, 'Fixo salvo.'); };

    $('#f-var').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#vr-msg', msg => {
      const valor = lerValor($('#vr-valor').value), descricao = $('#vr-desc').value.trim(), d = dia('#vr-dia');
      if (descricao.length < 2) return erro(msg, 'Diga de onde veio o valor. Ex.: Projeto NSF', '#vr-desc');
      if (!(valor > 0)) return erro(msg, 'Digite o valor. Ex.: 1.200,00', '#vr-valor');
      if (!d) return erro(msg, 'O dia precisa ser de 1 a 31.', '#vr-dia');
      return { acao: 'adicionarVariavel', corpo: { valor, descricao, mes: chave, dia: d } };
    }, 'Variável adicionado.'); };

    $('#f-conta').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#ct-msg', msg => {
      const nome = $('#ct-nome').value.trim(), valor = lerValor($('#ct-valor').value), d = dia('#ct-dia');
      if (nome.length < 2) return erro(msg, 'Dê um nome à conta. Ex.: Aluguel', '#ct-nome');
      if (!(valor > 0)) return erro(msg, 'Digite o valor da conta.', '#ct-valor');
      if (!d) return erro(msg, 'Diga o dia do mês em que ela vence (1 a 31).', '#ct-dia');
      return { acao: 'salvarConta', corpo: { nome, valor, dia: d, categoria: $('#ct-cat').value, forma: $('#ct-forma').value } };
    }, 'Conta adicionada.'); };

    $('#f-cartao').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#cc-msg', msg => {
      const fecha = dia('#cc-fecha'), vence = dia('#cc-vence');
      if (!fecha) return erro(msg, 'Diga o dia em que a fatura fecha.', '#cc-fecha');
      if (!vence) return erro(msg, 'Diga o dia em que a fatura vence.', '#cc-vence');
      return { acao: 'salvarAjustes', corpo: { cartao: { fecha, vence } } };
    }, 'Cartão salvo.'); };

    const esq = $('#b-esquecer');
    if (esq) esq.onclick = async () => {
      esq.disabled = true;
      const aparelho = ls.get(K.aparelho);
      ls.set(K.aparelho, null);
      api('sair', { aparelho }).catch(() => { });
      renderConteudo();
      avisoRapido('Este aparelho foi esquecido. Na próxima vez, entre com a senha.');
    };
    const ccRem = $('#cc-remover');
    if (ccRem) ccRem.onclick = async () => { ccRem.disabled = true; try { if (await gravar('salvarAjustes', { cartao: null })) renderConteudo(); } catch (e) { ccRem.textContent = e.message; } };

    // remover em dois toques, sem diálogo
    $$('[data-remover]').forEach(b => b.onclick = async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = 'Confirmar remoção'; setTimeout(() => { if (b.isConnected) { b.dataset.confirmar = ''; b.textContent = 'Remover'; } }, 4000); return; }
      b.disabled = true; b.textContent = 'Removendo…';
      try { if (await gravar(b.dataset.acaoRemover, { id: b.dataset.remover })) renderConteudo(); }
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
    if (teto) g += `<path class="ideal guia" d="M${x(1)} ${yv(teto / diasMes)}L${x(diasMes)} ${yv(teto)}"/>`;
    if (ate.length) {
      const acima = teto && ate[ate.length - 1] > teto / diasMes * ate.length ? ' excesso' : '';
      g += `<path class="real${acima}" pathLength="1" d="${ate.map((val, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${yv(val).toFixed(1)}`).join('')}"/>`;
      g += `<circle class="pulso${acima}" cx="${x(ate.length)}" cy="${yv(ate[ate.length - 1])}" r="4.5"/><circle class="ponto${acima}" cx="${x(ate.length)}" cy="${yv(ate[ate.length - 1])}" r="4.5"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gasto acumulado dia a dia comparado ao ritmo do teto">${g}</svg>`;
  }

  /* ============================== INÍCIO ============================ */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !Sessao.atual()) return;
    Ociosidade.verificar();
    if (Sessao.atual()) carregarDados();
  });

  /** Seções abaixo da dobra só começam a animar quando entram na tela. */
  function revelarAoRolar(box) {
    const alvos = $$('.secao', box);
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('em-cena'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    alvos.forEach(el => { el.classList.add('aguarda'); io.observe(el); });
  }

  /** Atualização ao vivo: a cada 2 min com a tela aberta; os números que mudaram rolam até o novo valor. */
  let timerVivo;
  function vivo() {
    clearInterval(timerVivo);
    timerVivo = setInterval(() => { if (!document.hidden && Sessao.atual() && E.aba !== 'cadastros') carregarDados(); }, 120000);
  }

  let redim;
  addEventListener('resize', () => { clearTimeout(redim); redim = setTimeout(() => { if (E.grafico) E.grafico(false); posicionarIndicador($('.abas-painel')); }, 150); });

  async function iniciar() {
    if (Sessao.atual()) { Ociosidade.iniciar(); telaPainel(); carregarDados(); return; }
    if (ls.get(K.aparelho) && CFG.api) {
      raiz().innerHTML = '<p class="carregando">Entrando…</p>';
      try {
        await retomar();
        Ociosidade.iniciar(); E.aba = 'painel'; telaPainel(); carregarDados();
        return;
      } catch (e) {
        if (e.codigo !== 'aparelho_invalido') { telaAcesso('entrar', { tipo: 'erro', texto: e.message }); return; }
        E.msgInicio = { tipo: 'info', texto: e.message };
      }
    }
    try { E.status = await api('status'); } catch (e) {
      telaAcesso('entrar', CFG.api ? { tipo: 'erro', texto: e.message } : null);
      return;
    }
    telaAcesso(E.status.temConta ? 'entrar' : 'criar', E.msgInicio || null);
  }

  iniciar();
})();
