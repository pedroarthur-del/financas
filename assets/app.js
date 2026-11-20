/* =====================================================================
   Minhas finanças · front-end
   Camadas: util → api → seguranca (chave, sessão, ociosidade) → telas
   ===================================================================== */
(() => {
  'use strict';

  const CFG = Object.assign({ api: '', nome: 'Minhas finanças', sessaoMin: 30 }, window.FINANCAS || {});
  const PBKDF2_ITER = 600000; // OWASP 2023 para PBKDF2-HMAC-SHA256
  const K = { sessao: 'fin.sessao', cache: 'fin.cache', email: 'fin.email', privado: 'fin.privado', aparelho: 'fin.aparelho', forma: 'fin.forma', cartao: 'fin.cartao', sim: 'fin.sim', ia: 'fin.ia' };

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

  const ico = d => `<svg class="ico-aba" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ABAS = [
    ['painel', 'Painel', ico('<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>')],
    ['fluxo', 'Fluxo', ico('<path d="M3 17c3 0 3-6 6-6s3 4 6 4 3-8 6-8"/><path d="M3 21h18"/>')],
    ['orcamento', 'Orçamento', ico('<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>')],
    ['simular', 'Simular', ico('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 12h1M12 12h1M15.5 12h0M8.5 16h1M12 16h1M15.5 16h0"/>')],
    ['cadastros', 'Cadastros', ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')]
  ];
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

  /* ============================== MOTOR ============================= */
  // Categorias pagas uma vez no mês: a previsão usa o teto (ou a média), não o ritmo diário
  const FIXAS = ['Moradia', 'Contas fixas', 'Assinaturas', 'Educação'];
  const INVEST = 'Investimentos'; // dinheiro guardado: sai da conta, mas não é consumo
  const ehGasto = l => l.categoria !== INVEST;

  /** Soma meses a uma data 'yyyy-MM-dd' mantendo o dia (ou o último dia do mês). */
  function addMeses(k, n) {
    const [y, m, d] = String(k).split('-').map(Number);
    const ult = new Date(y, m - 1 + n + 1, 0).getDate();
    const dt = new Date(y, m - 1 + n, Math.min(d, ult));
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  /** Lançamentos como o dinheiro realmente se move: compras parceladas viram uma parcela por mês,
      e compras simuladas (aba Simular) entram só quando pedidas. */
  function lancs() {
    const D = E.dados; if (!D) return [];
    const chave = D.atualizado + '|' + (E.simAtiva ? JSON.stringify(E.simAtiva) : '');
    if (lancs.cache && lancs.cache.ref === D && lancs.cache.chave === chave) return lancs.cache.v;
    const out = [];
    const expandir = l => {
      const n = l.forma === 'Crédito' ? Math.max(1, l.parcelas || 1) : 1;
      if (n === 1) { out.push(l); return; }
      const base = Math.floor(l.valor / n * 100) / 100;
      for (let i = 0; i < n; i++) {
        const valor = i === n - 1 ? Math.round((l.valor - base * (n - 1)) * 100) / 100 : base;
        out.push(Object.assign({}, l, { data: addMeses(l.data, i), valor, parcela: i + 1, deParcelas: n, total: l.valor, descricao: `${l.descricao || l.categoria} (${i + 1}/${n})` }));
      }
    };
    (D.lancamentos || []).forEach(expandir);
    (E.simAtiva || []).forEach(expandir);
    lancs.cache = { ref: D, chave, v: out };
    return out;
  }

  /* ---------- dia útil: fins de semana e feriados nacionais (bancos) ---------- */
  function pascoa(a) { // algoritmo de Meeus/Jones/Butcher
    const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
    const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, mm = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * mm) / 451);
    const mes = Math.floor((i + mm - 7 * n + 114) / 31), dia = ((i + mm - 7 * n + 114) % 31) + 1;
    return new Date(a, mes - 1, dia);
  }
  const feriadosCache = {};
  function feriados(ano) {
    if (feriadosCache[ano]) return feriadosCache[ano];
    const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(x => `${ano}-${x}`);
    const p = pascoa(ano), rel = n => { const d = new Date(p.getFullYear(), p.getMonth(), p.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const moveis = [rel(-48), rel(-47), rel(-2), rel(60)]; // carnaval (seg e ter), sexta-feira santa, Corpus Christi
    return (feriadosCache[ano] = new Set([...fixos, ...moveis]));
  }
  const ehDiaUtil = d => d.getDay() !== 0 && d.getDay() !== 6 && !feriados(d.getFullYear()).has(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  /** Move a data para um dia útil: 'antes' (antecipa), 'depois' (adia) ou 'mesmo' (não mexe). */
  function diaUtil(d, regra) {
    if (!regra || regra === 'mesmo') return d;
    let x = new Date(d.getFullYear(), d.getMonth(), d.getDate()), voltas = 0;
    while (!ehDiaUtil(x) && voltas++ < 10) x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + (regra === 'antes' ? -1 : 1));
    return x;
  }
  const prefs = () => Object.assign({ renda: 'antes', fatura: 'depois', contas: 'mesmo' }, E.dados?.ajustes?.preferencias || {});

  /* ---------- orçamento: limite por categoria em R$ ou % da renda ---------- */
  function versaoOrcamento(chave) {
    const vs = E.dados?.orcamento?.versoes || [];
    return vs.filter(v => v.desde <= chave).pop() || null;
  }
  /** Limite da categoria no mês, em R$. Sem orçamento cadastrado, usa a aba Tetos antiga. */
  function tetoDoMes(cat, chave) {
    const ver = versaoOrcamento(chave);
    if (!ver) { if ((E.dados?.orcamento?.versoes || []).length) return 0; const t = (E.dados?.tetos || []).find(x => x.categoria === cat); return t ? t.teto : 0; }
    const x = ver.cats[cat]; if (!x) return 0;
    if (x.tipo === 'valor') return x.valor;
    const R = renda(chave);
    return Math.round((x.tipo === 'pctFixo' ? R.fixo : R.total) * x.valor) / 100;
  }
  const categoriasGasto = () => (E.dados?.categorias || []).filter(c => c !== INVEST);
  const chaveMes = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  /** Limite para um gasto ser "pontual" automaticamente: 4x a mediana dos gastos comuns (mínimo R$ 250). */
  function limitePontual() {
    const D = E.dados; if (!D) return Infinity;
    if (limitePontual.cache && limitePontual.cache.ref === D) return limitePontual.cache.v;
    const vals = lancs().filter(l => l.origem !== 'Conta fixa' && !FIXAS.includes(l.categoria) && ehGasto(l) && !l.pontual).map(l => l.valor).sort((a, b) => a - b);
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    const v = Math.max(250, med * 4);
    limitePontual.cache = { ref: D, v };
    return v;
  }
  /** Gasto do dia a dia: sem contas fixas, sem gastos pontuais (marcados ou muito acima do comum) e sem datas futuras. */
  const diaADia = l => l.origem !== 'Conta fixa' && !FIXAS.includes(l.categoria) && ehGasto(l) && !l.deParcelas && !l.simulada && !l.pontual && l.valor <= limitePontual() && String(l.data) <= ymdHoje();
  const ymdHoje = () => `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
  const somaMes = (chave, cat, soDiaADia) => lancs()
    .filter(l => String(l.data).startsWith(chave) && (cat ? l.categoria === cat : ehGasto(l)) && (!soDiaADia || diaADia(l)))
    .reduce((s, l) => s + l.valor, 0);
  const mesesAntes = (d, n) => Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth() - 1 - i, 1));
  const temLancamento = chave => (E.dados?.lancamentos || []).some(l => String(l.data).startsWith(chave));
  /* ============================== PAINEL ============================ */
  const mesCurto = d => MESES[d.getMonth()].slice(0, 3) + '/' + String(d.getFullYear()).slice(2);
  const nomeMes = d => { const n = MESES[d.getMonth()]; return n[0].toUpperCase() + n.slice(1) + ' de ' + d.getFullYear(); };

  function renda(chave) {
    const R = E.dados?.receitas || [];
    const fixoReg = R.filter(r => r.tipo === 'fixo' && r.mes <= chave).sort((a, b) => b.mes.localeCompare(a.mes))[0] || null;
    const variaveis = R.filter(r => r.tipo === 'variavel' && r.mes === chave);
    const fixo = fixoReg ? fixoReg.valor : 0;
    const variavel = variaveis.reduce((s, r) => s + r.valor, 0);
    // recorrentes ainda não recebidos neste mês (só para o mês atual e os seguintes)
    const pendentes = chave >= chaveMes(hoje) ? recorrentesNoMes(chave).filter(x => !variaveis.some(r => r.recorrente === x.id)) : [];
    const previsto = pendentes.reduce((s, x) => s + x.valor, 0);
    return { fixo, fixoReg, variaveis, variavel, pendentes, previsto, total: fixo + variavel + previsto };
  }
  const recorrentes = () => E.dados?.ajustes?.recorrentes || [];
  function recorrentesNoMes(chave) {
    return recorrentes().filter(x => (!x.inicio || chave >= x.inicio) && (!x.fim || chave <= x.fim));
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
    const contasCat = (E.dados.contas || []).filter(c => c.categoria === cat && contaNoMes(c, chaveMes(E.ref)));
    const futuras = contasCat.filter(c => Math.min(c.dia, ctx.diasMes) > ctx.dia && !(c.criada && c.criada > `${chaveMes(E.ref)}-${pad(Math.min(c.dia, ctx.diasMes))}`)).reduce((s, c) => s + c.valor, 0);
    if (FIXAS.includes(cat)) {
      if (contasCat.length) return gasto + futuras;
      return Math.max(gasto, teto || mediaHistorica(E.ref, cat) || 0);
    }
    const gVar = somaMes(chaveMes(E.ref), cat, true);
    if (E.dados.ajustes?.diaADia) { // valor fixo informado: reparte entre as categorias pelo peso de cada uma no dia a dia
      const tot = somaMes(chaveMes(E.ref), null, true) || 0;
      const fatia = tot > 0 ? gVar / tot : 0;
      return gasto + futuras + E.dados.ajustes.diaADia.valor * fatia * (ctx.diasMes - ctx.dia);
    }
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
            ${ABAS.map(([id, nome, ico]) => `<button type="button" role="tab" data-aba="${id}" aria-selected="${E.aba === id}">${ico}<span>${nome}</span></button>`).join('')}
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
      if (alvo) { ev.preventDefault(); abrirFolha(alvo.dataset.editar); return; }
      const ent = ev.target.closest('[data-editar-entrada]');
      if (ent) { ev.preventDefault(); abrirFolha(ent.dataset.editarEntrada, 'entrada'); }
    });
    $('#conteudo').addEventListener('keydown', ev => {
      const alvo = ev.target.closest('[data-editar], [data-editar-entrada]');
      if (alvo && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); alvo.click(); }
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
    ({ cadastros: renderCadastros, fluxo: renderFluxo, orcamento: renderOrcamento, simular: renderSimular }[E.aba] || renderPainel)();
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
    const doMes = lancs().filter(l => String(l.data).startsWith(chave));
    const lanc = doMes.filter(ehGasto);
    const guardado = doMes.filter(l => !ehGasto(l)).reduce((s2, l) => s2 + l.valor, 0);
    const metaGuardar = tetoDoMes(INVEST, chave);
    const tetos = categoriasGasto().map(c => ({ categoria: c, teto: tetoDoMes(c, chave) })).filter(t => t.teto > 0);
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
      const sobra = R.total - gastoRef - guardado;
      const escala = Math.max(R.total, gastoRef, 1);
      balanco = `
        <div class="medidor" role="img" aria-label="Gasto comparado à renda do mês">
          <i class="m-gasto${total > R.total ? ' excesso' : ''}" data-largura="${w(total, escala)}"></i>
          ${atual && proj > total ? `<i class="m-prev${proj > R.total ? ' excesso' : ''}" data-inicio="${w(total, escala)}" data-largura="${w(proj - total, escala)}"></i>` : ''}
          ${gastoRef > R.total ? `<b class="m-marco" data-inicio="${w(R.total, escala)}" title="Renda do mês"></b>` : ''}
        </div>
        <dl class="numeros">
          <div><dt>Renda</dt><dd>${vc(R.total, 'bal-renda')}</dd><small>Fixo <span class="valor">${brl(R.fixo)}</span>${R.variavel ? `, entradas <span class="valor">${brl(R.variavel)}</span>` : ''}${R.previsto ? `, a receber <span class="valor">${brl(R.previsto)}</span>` : ''}</small></div>
          <div><dt>Gasto ${atual ? 'até agora' : 'no mês'}</dt><dd>${vc(total, 'bal-gasto')}</dd><small>${pct(total / R.total)} da renda</small></div>
          ${atual ? `<div><dt>Gasto previsto</dt><dd>${vc(proj, 'bal-prev')}</dd><small>${pct(proj / R.total)} da renda</small></div>` : ''}
          <div><dt>Guardado</dt><dd>${vc(guardado, 'bal-guardado')}</dd><small>${metaGuardar ? `${pct(guardado / metaGuardar)} da meta de <span class="valor">${brl(metaGuardar)}</span>` : 'Sem meta definida'}</small></div>
          <div><dt>${atual ? 'Sobra prevista' : 'Sobrou'}</dt><dd class="${sobra < 0 ? 'excesso' : 'folga'}">${vc(sobra, 'bal-sobra')}</dd><small>${sobra < 0 ? 'faltou dinheiro' : pct(sobra / R.total) + ' da renda'}${guardado ? ', depois de guardar' : ''}</small></div>
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
      if (R.fixo) partes.push(`${pct((atual ? x.p : x.g) / R.fixo)} do salário fixo`);
      else if (R.total) partes.push(`${pct((atual ? x.p : x.g) / R.total)} da renda`);
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
    lanc.forEach(l => { const f = (l.forma === 'Crédito' && cartoes().length ? `Crédito ${cartaoDe(l.cartao)?.nome || ''}`.trim() : l.forma) || 'Sem forma'; porForma[f] = (porForma[f] || 0) + l.valor; });
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

    // ---------- compromissos no crédito: parcelas e contas que já estão contratadas ----------
    const comp = [];
    if (cartoes().length) {
      for (let i = 1; i <= 6; i++) {
        const dm = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1), km = chaveMes(dm);
        const parc = lancs().filter(l => l.deParcelas && l.forma === 'Crédito' && String(pagamentoCredito(l.data, l.cartao)).startsWith(km)).reduce((s2, l) => s2 + l.valor, 0);
        const ctas = (E.dados.contas || []).filter(c => c.forma === 'Crédito' && contaNoMes(c, km)).reduce((s2, c) => s2 + c.valor, 0);
        if (parc + ctas > 0) comp.push({ dm, parc, ctas, tot: parc + ctas, renda: renda(km).fixo });
      }
    }
    const maxComp = Math.max(1, ...comp.map(x => x.tot));
    const htmlComp = comp.length ? comp.map(x => `<div class="hist comp"><span class="h-mes">${mesCurto(x.dm)}</span>
        <div class="h-barras"><i class="h-gasto" data-largura="${w(x.tot, maxComp)}"></i></div>
        <span class="h-num valor num">${brl(x.tot)}</span><span class="h-num">${x.renda ? pct(x.tot / x.renda) + ' do fixo' : ''}</span></div>`).join('')
      + `<p class="previsao">Já está contratado nas próximas faturas: parcelas de compras ${comp.some(x => x.ctas) ? 'e contas fixas no crédito' : ''}. É o mínimo que vai sair, antes de qualquer compra nova.</p>`
      : '';

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
    const rendaProx = recorrentes().length ? renda(chaveMes(prox)).total : fixoProx + varMedia;
    const comoRenda = recorrentes().length ? ' (fixo mais as entradas recorrentes previstas)' : varMedia ? ' (fixo mais a média do variável dos últimos 3 meses)' : '';
    const previsao = (rendaProx || gastoMedio) ? `<p class="previsao">Previsão para ${MESES[prox.getMonth()]}: renda de ${v(rendaProx)}${comoRenda} e gasto de ${v(gastoMedio)}, sobrando ${v(rendaProx - gastoMedio)}.</p>` : '';

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
      ${htmlComp ? `<section class="secao"><h3>Já comprometido no cartão <small>próximos meses</small></h3>${htmlComp}</section>` : ''}
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

  const cartoes = () => E.dados?.ajustes?.cartoes || [];
  /** Cartão de um lançamento: o escolhido; sem escolha (formulário, versões antigas), o primeiro cadastrado. */
  const cartaoDe = id => cartoes().find(c => c.id === id) || cartoes()[0] || null;
  /** Conta fixa vale no mês 'yyyy-MM'? (entre o início e o fim, quando houver) */
  const contaNoMes = (c, mes) => c.ativa && (!c.inicio || mes >= c.inicio) && (!c.fim || mes <= c.fim);
  const mesCurtoTxt = k => { if (!k) return ''; const [a, mm] = k.split('-').map(Number); return MESES[mm - 1].slice(0, 3) + '/' + String(a).slice(2); };
  const mesesEntre = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

  /** Data em que uma compra no crédito sai da conta (vencimento da fatura do cartão). */
  function pagamentoCredito(k, idCartao) {
    const c = cartaoDe(idCartao); if (!c) return k;
    const p = deYmd(k);
    let fech = diaNoMes(p.getFullYear(), p.getMonth(), c.fecha);
    if (p > fech) fech = diaNoMes(p.getFullYear(), p.getMonth() + 1, c.fecha);
    const venc = c.vence > c.fecha
      ? diaNoMes(fech.getFullYear(), fech.getMonth(), c.vence)
      : diaNoMes(fech.getFullYear(), fech.getMonth() + 1, c.vence);
    return ymd(diaUtil(venc, prefs().fatura));
  }
  const usaCartao = forma => forma === 'Crédito' && cartoes().length > 0;

  /** Gasto variável diário estimado (sem contas fixas), misturando o mês atual com o histórico. */
  function explicarEstimativa() {
    const fixo = E.dados?.ajustes?.diaADia;
    const k = chaveMes(hoje), dia = hoje.getDate();
    const doMes = lancs().filter(l => String(l.data).startsWith(k) && ehGasto(l));
    const base = doMes.filter(diaADia).reduce((s, l) => s + l.valor, 0);
    const foraPontual = doMes.filter(l => l.origem !== 'Conta fixa' && !FIXAS.includes(l.categoria) && !diaADia(l) && String(l.data) <= ymdHoje());
    const meses = mesesAntes(hoje, 6).map(chaveMes).filter(temLancamento).slice(0, 3);
    const hist = meses.length ? meses.reduce((s, x) => s + somaMes(x, null, true), 0) / meses.length / 30 : null;
    const ritmo = base / dia, peso = Math.min(1, dia / 10);
    const auto = hist === null ? ritmo : ritmo * peso + hist * (1 - peso);
    return { valor: fixo ? fixo.valor : auto, auto, fixo: !!fixo, base, dia, hist, peso, foraPontual };
  }
  const ritmoVariavel = () => explicarEstimativa().valor;

  /** Entradas e saídas por dia entre duas datas (inclusive). */
  function movimentos(ini, fim) {
    const kIni = ymd(ini), kFim = ymd(fim), kHoje = ymd(hoje);
    const M = new Map();
    const slot = k => { if (!M.has(k)) M.set(k, { ent: [], sai: [] }); return M.get(k); };
    const dentro = k => k >= kIni && k <= kFim;
    const faturas = new Map(); // "vencimento|cartão" -> { k, nome, valor, qtd, prev }
    const addFatura = (k, valor, prev, idCartao) => {
      const c = cartaoDe(idCartao), ch = k + '|' + (c ? c.id : '');
      const f = faturas.get(ch) || { k, nome: c ? c.nome : 'cartão', valor: 0, qtd: 0, prev: 0 };
      f.valor += valor; f.qtd++; if (prev) f.prev += valor; faturas.set(ch, f);
    };

    const meses = [];
    for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);
    // lança também faturas de compras do mês anterior ao início do intervalo
    const desde = ymd(new Date(ini.getFullYear(), ini.getMonth() - 2, 1));

    // 1. entradas
    const R = E.dados.receitas || [];
    const diaVar = (R.filter(r => r.tipo === 'variavel').sort((a, b) => b.mes.localeCompare(a.mes))[0] || {}).dia || 30;
    meses.forEach(d => {
      const ch = chaveMes(d), r = renda(ch);
      const pr = prefs();
      const quandoRenda = dia => ymd(diaUtil(diaNoMes(d.getFullYear(), d.getMonth(), dia), pr.renda));
      if (r.fixoReg) { const k = quandoRenda(r.fixoReg.dia || 15); if (dentro(k)) slot(k).ent.push({ desc: r.fixoReg.descricao || 'Salário fixo', valor: r.fixo, prev: k > kHoje }); }
      r.variaveis.forEach(x => { const k = ymd(diaNoMes(d.getFullYear(), d.getMonth(), x.dia || 30)); if (dentro(k)) slot(k).ent.push({ desc: x.descricao, valor: x.valor, prev: k > kHoje, entrada: x.id }); });
      if (recorrentes().length) {
        // previsão pelas entradas recorrentes cadastradas que ainda não chegaram neste mês
        r.pendentes.forEach(x => { const k = quandoRenda(x.dia || 30); if (dentro(k) && k > kHoje) slot(k).ent.push({ desc: `${x.nome} (previsto)`, valor: x.valor, prev: true }); });
      } else if (!r.variaveis.length && ch >= chaveMes(hoje)) {
        const media = [d, ...mesesAntes(d, 3)].slice(1).map(chaveMes).reduce((s, x) => s + renda(x).variavel, 0) / 3;
        const k = quandoRenda(diaVar);
        if (media > 0 && dentro(k) && k > kHoje) slot(k).ent.push({ desc: 'Variável (média dos últimos 3 meses)', valor: media, prev: true });
      }
    });

    // 2. saídas lançadas (crédito entra no vencimento da fatura)
    lancs().forEach(l => {
      if (String(l.data) < desde) return;
      if (usaCartao(l.forma)) { addFatura(pagamentoCredito(l.data, l.cartao), l.valor, false, l.cartao); return; }
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
      if (k <= kHoje || (c.criada && c.criada > k) || !contaNoMes(c, k.slice(0, 7))) return;
      if (usaCartao(c.forma)) addFatura(pagamentoCredito(k, c.cartao), c.valor, true, c.cartao);
      else if (dentro(k)) slot(k).sai.push({ desc: c.nome, valor: c.valor, prev: true, fixa: true });
    }));

    // 4. gasto do dia a dia estimado nos dias que ainda não chegaram
    const taxa = ritmoVariavel();
    if (taxa > 0) for (let d = new Date(Math.max(+ini, +hoje + 86400000)); ymd(d) <= kFim; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      slot(ymd(d)).sai.push({ desc: 'Gastos do dia a dia (estimativa)', valor: taxa, prev: true, estimativa: true });
    }

    faturas.forEach(f => { if (dentro(f.k)) slot(f.k).sai.push({ desc: `Fatura ${f.nome} (${f.qtd} ${f.qtd === 1 ? 'item' : 'itens'}${f.prev ? ', inclui contas a lançar' : ''})`, valor: f.valor, prev: f.k > kHoje, fatura: true }); });
    return M;
  }

  /** Saldo no fim de cada dia do mês de referência. */
  const fluxoDoMes = ref => serieSaldo(new Date(ref.getFullYear(), ref.getMonth(), 1), new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
  /** Saldo no fim de cada dia entre duas datas, partindo do saldo informado em Cadastros. */
  function serieSaldo(ini, fim) {
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
    delete d.dataset.aberta;
    if (!movOk()) { d.close(); return; }
    d.classList.remove('aberta');
    d.addEventListener('transitionend', () => d.close(), { once: true });
    setTimeout(() => { if (d.open) d.close(); }, 400);
  }

  const alternarFolha = modo => `<div class="abas abas-folha" data-grupo="folha" role="tablist" aria-label="Tipo de lançamento">
      <button type="button" role="tab" data-modo-folha="saida" aria-selected="${modo === 'saida'}">Saída</button>
      <button type="button" role="tab" data-modo-folha="entrada" aria-selected="${modo === 'entrada'}">Entrada</button>
    </div>`;
  function mostrarFolha(d) {
    if (!d.open) { d.showModal(); requestAnimationFrame(() => d.classList.add('aberta')); }
    posicionarIndicador($('[data-grupo="folha"]', d));
    $$('[data-modo-folha]', d).forEach(b => b.onclick = () => { if (b.getAttribute('aria-selected') !== 'true') abrirFolha(null, b.dataset.modoFolha, $('#g-valor').value); });
    setTimeout(() => $('#g-valor').focus(), movOk() && !d.dataset.aberta ? 260 : 0);
    d.dataset.aberta = '1';
    ligarBotaoFoto(d);
    $('#g-fechar').onclick = fecharFolha;
    d.oncancel = ev => { ev.preventDefault(); fecharFolha(); };
    d.onclick = ev => { if (ev.target === d) fecharFolha(); };
    $('#g-valor').addEventListener('input', ev => { ev.target.value = ev.target.value.replace(/[^\d.,]/g, ''); });
    $$('.chip', d).forEach(b => b.onclick = () => {
      $$(`.chip[data-grupo="${b.dataset.grupo}"]`, d).forEach(x => x.setAttribute('aria-checked', String(x === b)));
      if (b.dataset.grupo === 'forma') $('#g-cartoes').classList.toggle('escondido', b.dataset.v !== 'Crédito');
      if (b.dataset.grupo === 'rec' && b.dataset.id && !$('#g-desc').value) $('#g-desc').placeholder = b.dataset.v;
      const m = $('#g-msg'); if (m) m.textContent = '';
    });
  }
  const topoFolha = titulo => `<div class="folha-topo">
          <span class="alca" aria-hidden="true"></span>
          <h2 id="folha-titulo">${titulo}</h2>
          <button class="ico" type="button" id="g-fechar" aria-label="Fechar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>`;

  /** Entrada: projeto, venda, reembolso... Entra na renda do mês e no fluxo no dia informado. */
  function abrirFolhaEntrada(id, valorMantido) {
    const d = $('#folha');
    const atual = id ? (E.dados.receitas || []).find(r => r.id === id && r.tipo === 'variavel') : null;
    if (id && !atual) return avisoRapido('Essa entrada não está mais na lista. Toque em Atualizar.');
    const tipos = E.dados.tiposEntrada || ['Variável', 'Venda', 'Reembolso', 'Presente', 'Rendimento', 'Outros'];
    const dataIni = atual ? `${atual.mes}-${pad(Math.min(atual.dia, new Date(+atual.mes.slice(0, 4), +atual.mes.slice(5, 7), 0).getDate()))}` : ymd(hoje);
    const recs = recorrentesNoMes((atual?.mes) || chaveMes(hoje));
    const chip = (nome, grupo, sel, idx) => `<button type="button" class="chip" role="radio" aria-checked="${sel}" data-grupo="${grupo}" data-v="${esc(nome)}"${idx !== undefined ? ` data-id="${esc(idx)}"` : ''}>${esc(nome)}</button>`;
    const valorIni = atual ? atual.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : (valorMantido || '');
    d.innerHTML = `
      <form class="folha-corpo entrada" id="g-form" method="dialog" novalidate>
        ${topoFolha(atual ? 'Editar entrada' : 'Nova entrada')}
        ${atual ? '' : alternarFolha('entrada') + botaoFoto()}
        <label class="valor-grande"><span class="rs">+ R$</span><input id="g-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="12" value="${valorIni}" aria-label="Valor da entrada"></label>
        <fieldset class="chips" role="radiogroup" aria-label="Tipo de entrada"><legend>O que é</legend>${tipos.map(t => chip(t, 'tipo', t === (atual?.categoria || 'Variável'))).join('')}</fieldset>
        ${recs.length ? `<fieldset class="chips" role="radiogroup" aria-label="Referente a"><legend>É o recebimento de</legend>${chip('Nenhuma', 'rec', !atual?.recorrente, '')}${recs.map(r => chip(r.nome, 'rec', r.id === atual?.recorrente, r.id)).join('')}</fieldset>` : ''}
        <div class="folha-linha">
          <label class="campo"><span>De onde veio</span><input id="g-desc" type="text" autocomplete="off" maxlength="80" placeholder="Ex.: Projeto NSF, venda da bicicleta" value="${esc(atual?.descricao || '')}"></label>
          <label class="campo"><span>Dia que entrou</span><input id="g-data" type="date" value="${dataIni}"></label>
        </div>
        <div class="msg" id="g-msg" role="alert"></div>
        <button class="btn largo" id="g-salvar" type="submit">${atual ? 'Salvar alterações' : 'Salvar entrada'}</button>
        ${atual ? '<button class="link perigo largo" type="button" id="g-apagar">Apagar entrada</button>' : ''}
      </form>`;
    mostrarFolha(d);

    $('#g-form').onsubmit = async ev => {
      ev.preventDefault();
      const msg = $('#g-msg'), btn = $('#g-salvar');
      const valor = lerValor($('#g-valor').value), data = $('#g-data').value;
      const categoria = $('.chip[data-grupo="tipo"][aria-checked="true"]', d)?.dataset.v || 'Variável';
      const recorrente = $('.chip[data-grupo="rec"][aria-checked="true"]', d)?.dataset.id || '';
      const descricao = $('#g-desc').value.trim();
      msg.className = 'msg erro';
      if (!(valor > 0)) { msg.textContent = 'Digite quanto entrou.'; $('#g-valor').focus(); return; }
      if (descricao.length < 2 && !recorrente) { msg.textContent = 'Diga de onde veio o dinheiro.'; $('#g-desc').focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { msg.textContent = 'Escolha o dia em que entrou.'; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      const corpo = { valor, data, categoria, recorrente, descricao };
      try {
        if (await gravar(atual ? 'editarReceita' : 'adicionarVariavel', atual ? Object.assign({ id: atual.id }, corpo) : corpo)) {
          fecharFolha(); renderConteudo();
          avisoRapido(atual ? 'Entrada atualizada.' : `Entrada salva: + ${brl(valor)}.`);
        }
      } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = atual ? 'Salvar alterações' : 'Salvar entrada'; }
    };
    const apagar = $('#g-apagar');
    if (apagar) apagar.onclick = async () => {
      if (apagar.dataset.confirmar !== '1') { apagar.dataset.confirmar = '1'; apagar.textContent = 'Toque de novo para apagar'; return; }
      apagar.disabled = true; apagar.textContent = 'Apagando…';
      try { if (await gravar('removerReceita', { id: atual.id })) { fecharFolha(); renderConteudo(); avisoRapido('Entrada apagada.'); } }
      catch (e) { $('#g-msg').textContent = e.message; apagar.disabled = false; apagar.textContent = 'Apagar entrada'; }
    };
  }

  function abrirFolha(id, modo = 'saida', valorMantido) {
    const d = $('#folha'); if (!d || !E.dados) return;
    if (modo === 'entrada') return abrirFolhaEntrada(id, valorMantido);
    const atual = id ? (E.dados.lancamentos || []).find(l => l.id === id) : null;
    if (id && !atual) return avisoRapido('Esse gasto não está mais na lista. Toque em Atualizar.');
    const cats = categoriasPorUso(), formas = E.dados.formas || ['Pix', 'Crédito', 'Débito', 'Dinheiro'];
    const cat = atual?.categoria || '', forma = atual?.forma || ls.get(K.forma) || 'Pix';
    const valorIni = atual ? atual.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : (valorMantido || '');
    const chip = (nome, grupo, sel) => `<button type="button" class="chip" role="radio" aria-checked="${sel}" data-grupo="${grupo}" data-v="${esc(nome)}">${esc(nome)}</button>`;

    d.innerHTML = `
      <form class="folha-corpo" id="g-form" method="dialog" novalidate>
        ${topoFolha(atual ? 'Editar gasto' : 'Novo lançamento')}
        ${atual ? '' : alternarFolha('saida') + botaoFoto()}
        <label class="valor-grande"><span class="rs">R$</span><input id="g-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="12" value="${valorIni}" aria-label="Valor do gasto"></label>
        <fieldset class="chips" role="radiogroup" aria-label="Categoria"><legend>Categoria</legend>${cats.map(c => chip(c, 'cat', c === cat)).join('')}</fieldset>
        <fieldset class="chips" role="radiogroup" aria-label="Forma de pagamento"><legend>Pagou com</legend>${formas.map(f => chip(f, 'forma', f === forma)).join('')}</fieldset>
        <fieldset class="chips chips-cartao${forma === 'Crédito' ? '' : ' escondido'}" id="g-cartoes" role="radiogroup" aria-label="Cartão">
          <legend>Qual cartão</legend>
          ${cartoes().length ? cartoes().map(c => chip(c.nome, 'cartao', c.id === (atual?.cartao || ls.get(K.cartao) || cartoes()[0].id)).replace('data-v=', `data-id="${esc(c.id)}" data-v=`)).join('')
            : '<p class="apoio-secao">Cadastre seus cartões em Cadastros para separar as faturas.</p>'}
          <div class="parcelas">
            <span class="parcelas-rot">Parcelas</span>
            <div class="parcelas-op" role="radiogroup" aria-label="Parcelas">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => `<button type="button" class="chip mini" role="radio" data-grupo="parc" data-v="${n}" aria-checked="${n === (atual?.parcelas || 1)}">${n === 1 ? 'À vista' : n + 'x'}</button>`).join('')}</div>
            <p class="dica" id="g-parc-dica"></p>
          </div>
        </fieldset>
        <div class="folha-linha">
          <label class="campo"><span>Descrição (opcional)</span><input id="g-desc" type="text" autocomplete="off" maxlength="200" placeholder="Ex.: Almoço com o time" value="${esc(atual?.descricao || '')}"></label>
          <label class="campo"><span>Data</span><input id="g-data" type="date" value="${atual?.data || ymd(hoje)}" max="${ymd(new Date(hoje.getFullYear() + 1, 11, 31))}"></label>
        </div>
        <label class="lembrar"><input id="g-pontual" type="checkbox"${atual?.pontual ? ' checked' : ''}><span>Gasto pontual: não conta na estimativa do dia a dia</span></label>
        ${atual?.origem === 'Conta fixa' ? '<p class="apoio-secao">Este gasto veio de uma conta fixa. Mudar aqui altera só este mês.</p>' : ''}
        <div class="msg" id="g-msg" role="alert"></div>
        <button class="btn largo" id="g-salvar" type="submit">${atual ? 'Salvar alterações' : 'Salvar gasto'}</button>
        ${atual ? '<button class="link perigo largo" type="button" id="g-apagar">Apagar gasto</button>' : ''}
      </form>`;

    mostrarFolha(d);
    const dicaParc = () => {
      const n = Number($('.chip[data-grupo="parc"][aria-checked="true"]', d)?.dataset.v || 1), v0 = lerValor($('#g-valor').value);
      const el = $('#g-parc-dica'); if (!el) return;
      el.textContent = n > 1 && v0 > 0 ? `${n} parcelas de ${brl(v0 / n)}, uma em cada fatura a partir da próxima que fechar.` : '';
    };
    $$('.chip[data-grupo="parc"]', d).forEach(b => b.addEventListener('click', dicaParc));
    $('#g-valor').addEventListener('input', dicaParc); dicaParc();

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
      const idCartao = fp === 'Crédito' ? $('.chip[data-grupo="cartao"][aria-checked="true"]', d)?.dataset.id || '' : '';
      if (fp === 'Crédito' && cartoes().length && !idCartao) { msg.textContent = 'Escolha em qual cartão foi a compra.'; return; }
      const parcelas = fp === 'Crédito' ? Number($('.chip[data-grupo="parc"][aria-checked="true"]', d)?.dataset.v || 1) : 1;
      const corpo = { valor, categoria, forma: fp, data, descricao: $('#g-desc').value.trim(), cartao: idCartao, pontual: $('#g-pontual').checked, parcelas };
      try {
        if (await gravar(atual ? 'editarLancamento' : 'lancar', atual ? Object.assign({ id: atual.id }, corpo) : corpo)) {
          ls.set(K.forma, fp);
          if (idCartao) ls.set(K.cartao, idCartao);
          fecharFolha();
          renderConteudo();
          avisoRapido(atual ? 'Gasto atualizado.' : parcelas > 1 ? `Compra salva: ${parcelas}x de ${brl(valor / parcelas)} em ${categoria}.` : `Gasto salvo: ${brl(valor)} em ${categoria}.`);
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

  /* ---------------------- leitura de comprovante (IA) ---------------------- */
  // A foto é reduzida no aparelho e enviada direto do navegador para a API da Anthropic,
  // com a chave que você cadastrou neste aparelho. Ela não passa pela planilha nem pelo Apps Script.
  const IA_MODELO = 'claude-haiku-5-5';

  function reduzirImagem(arquivo, lado = 1600) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = () => {
        const f = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new ErroApp('imagem', 'Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.')); };
      img.src = url;
    });
  }

  async function lerComprovante(arquivo) {
    const chave = ls.get(K.ia);
    if (!chave) throw new ErroApp('sem_chave', 'Para ler fotos, cadastre a chave da IA em Cadastros → Leitura de comprovantes.');
    const data = await reduzirImagem(arquivo);
    const cats = E.dados.categorias || [], tipos = E.dados.tiposEntrada || [];
    const nomesCartoes = cartoes().map(c => c.nome);
    const prompt = `Você lê comprovantes brasileiros (cupom fiscal, nota, comprovante de Pix, TED, maquininha, fatura) para um app de finanças pessoais.
Hoje é ${ymd(hoje)}. Responda SOMENTE com um JSON, sem texto antes ou depois, neste formato:
{"tipo":"saida|entrada","valor":0.00,"data":"AAAA-MM-DD","descricao":"texto curto, ex.: nome do estabelecimento","forma":"Pix|Crédito|Débito|Dinheiro|null","cartao":"nome do cartão da lista ou null","parcelas":1,"categoria":"uma da lista","tipoEntrada":"uma da lista ou null","confianca":"alta|media|baixa","observacao":"curta, só se algo estiver incerto"}
Regras: valor é o total pago (com desconto), em reais. Se for um Pix recebido, tipo é "entrada". Se a data não aparecer, use hoje.
Categorias de gasto possíveis: ${cats.join(', ')}.
Tipos de entrada possíveis: ${tipos.join(', ')}.
Cartões do usuário: ${nomesCartoes.length ? nomesCartoes.join(', ') : 'nenhum cadastrado'} (escolha pelo banco ou bandeira que aparecer; se não der para saber, null).`;
    const ctrl = new AbortController(), limite = setTimeout(() => ctrl.abort(), 45000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: IA_MODELO, max_tokens: 600, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }, { type: 'text', text: prompt }] }] })
      });
    } catch (e) {
      throw new ErroApp('rede', e.name === 'AbortError' ? 'A leitura demorou demais. Tente de novo com uma foto mais nítida.' : 'Sem conexão com o serviço de leitura.');
    } finally { clearTimeout(limite); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j?.error?.message || '';
      if (r.status === 401) throw new ErroApp('chave', 'A chave da IA foi recusada. Confira em Cadastros → Leitura de comprovantes.');
      if (r.status === 429) throw new ErroApp('limite', 'Muitas leituras seguidas. Espere um minuto e tente de novo.');
      throw new ErroApp('ia', 'Não consegui ler o comprovante agora' + (m ? `: ${m}` : '.'));
    }
    const texto = (j.content || []).map(c => c.text || '').join('');
    const bloco = texto.match(/\{[\s\S]*\}/);
    if (!bloco) throw new ErroApp('ia', 'Não encontrei os dados nesse comprovante. Tente uma foto mais de perto.');
    let res; try { res = JSON.parse(bloco[0]); } catch (_) { throw new ErroApp('ia', 'A leitura veio incompleta. Tente de novo.'); }
    const valor = Number(String(res.valor).replace(',', '.'));
    if (!(valor > 0)) throw new ErroApp('ia', 'Não consegui identificar o valor. Confira a foto ou digite o valor.');
    return {
      tipo: res.tipo === 'entrada' ? 'entrada' : 'saida', valor,
      data: /^\d{4}-\d{2}-\d{2}$/.test(res.data || '') ? res.data : ymd(hoje),
      descricao: String(res.descricao || '').slice(0, 80),
      forma: ['Pix', 'Crédito', 'Débito', 'Dinheiro'].includes(res.forma) ? res.forma : null,
      cartao: cartoes().find(c => res.cartao && c.nome.toLowerCase().includes(String(res.cartao).toLowerCase().split(' ')[0]))?.id || null,
      parcelas: Math.max(1, Math.min(48, parseInt(res.parcelas, 10) || 1)),
      categoria: cats.includes(res.categoria) ? res.categoria : null,
      tipoEntrada: tipos.includes(res.tipoEntrada) ? res.tipoEntrada : null,
      confianca: res.confianca || 'media', observacao: String(res.observacao || '').slice(0, 140)
    };
  }

  /** Preenche a folha aberta com o que a IA leu; a pessoa revisa e salva. */
  function aplicarLeitura(x) {
    const preencher = () => {
      const d = $('#folha');
      const tocar = sel => { const b = $(sel, d); if (b && b.getAttribute('aria-checked') !== 'true') b.click(); };
      $('#g-valor').value = x.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      $('#g-valor').dispatchEvent(new Event('input'));
      if (x.descricao) $('#g-desc').value = x.descricao;
      $('#g-data').value = x.data;
      if (x.tipo === 'saida') {
        if (x.categoria) tocar(`.chip[data-grupo="cat"][data-v="${x.categoria}"]`);
        if (x.forma) tocar(`.chip[data-grupo="forma"][data-v="${x.forma}"]`);
        if (x.forma === 'Crédito') { if (x.cartao) tocar(`.chip[data-grupo="cartao"][data-id="${x.cartao}"]`); tocar(`.chip[data-grupo="parc"][data-v="${[1, 2, 3, 4, 5, 6, 8, 10, 12].includes(x.parcelas) ? x.parcelas : 1}"]`); }
      } else if (x.tipoEntrada) tocar(`.chip[data-grupo="tipo"][data-v="${x.tipoEntrada}"]`);
      const m = $('#g-msg');
      m.className = 'msg info';
      m.textContent = `Lido da foto${x.confianca === 'baixa' ? ' com pouca certeza' : ''}. Confira e toque em salvar.${x.observacao ? ' ' + x.observacao : ''}`;
    };
    const modoAtual = $('#g-form')?.classList.contains('entrada') ? 'entrada' : 'saida';
    if (modoAtual !== x.tipo) { abrirFolha(null, x.tipo); setTimeout(preencher, 30); } else preencher();
  }

  /** Botão de foto na folha: só aparece se a chave estiver cadastrada neste aparelho. */
  const botaoFoto = () => `<div class="foto-ler">
      <input type="file" id="g-foto" accept="image/*" class="oculto-acessivel" tabindex="-1">
      <button type="button" class="btn secundario largo" id="g-foto-btn">${ls.get(K.ia) ? 'Ler foto ou comprovante' : 'Ler foto ou comprovante (configurar)'}</button>
    </div>`;
  function ligarBotaoFoto(d) {
    const btn = $('#g-foto-btn', d), inp = $('#g-foto', d); if (!btn) return;
    btn.onclick = () => {
      if (!ls.get(K.ia)) { fecharFolha(); irPara('cadastros'); setTimeout(() => $('#sec-ia')?.scrollIntoView({ block: 'start' }), 80); return; }
      inp.click();
    };
    inp.onchange = async () => {
      const arq = inp.files && inp.files[0]; if (!arq) return;
      const m = $('#g-msg');
      btn.disabled = true; btn.textContent = 'Lendo o comprovante…'; btn.classList.add('lendo');
      try { aplicarLeitura(await lerComprovante(arq)); }
      catch (e) { m.className = 'msg erro'; m.textContent = e.message; }
      finally { const b2 = $('#g-foto-btn'); if (b2) { b2.disabled = false; b2.textContent = 'Ler foto ou comprovante'; b2.classList.remove('lendo'); } inp.value = ''; }
    };
  }

  /* ------------------------- aba ORÇAMENTO ------------------------- */
  // Orçamento = limite por categoria (R$ ou % da renda) com versões que valem a partir de um mês.
  // A tela responde três perguntas: quanto já consumi do mês, quanto já consumi do ano e o que planejar.
  const TIPOS_ORC = { valor: 'R$ por mês', pctFixo: '% do salário fixo', pctRenda: '% da renda total' };
  const regraTxt = x => !x ? 'sem limite' : x.tipo === 'valor' ? `${brl(x.valor)} por mês` : `${String(x.valor).replace('.', ',')}% ${x.tipo === 'pctFixo' ? 'do fixo' : 'da renda'}`;
  const arredonda10 = n => Math.ceil(n / 10) * 10;

  function mediaCategoria(cat) {
    const meses = mesesAntes(new Date(hoje.getFullYear(), hoje.getMonth(), 1), 6).map(chaveMes).filter(temLancamento).slice(0, 3);
    if (!meses.length) return null;
    return { media: meses.reduce((s2, k) => s2 + somaMes(k, cat), 0) / meses.length, meses: meses.length };
  }

  function renderOrcamento() {
    const D = E.dados, chave = chaveMes(E.ref), ano = E.ref.getFullYear(), mesTxt = MESES[E.ref.getMonth()];
    const cats = categoriasGasto();
    const R = renda(chave);
    const ver = versaoOrcamento(chave);
    const versoes = D.orcamento?.versoes || [];
    const kHoje = chaveMes(hoje);

    // ---------- mês ----------
    const linhasMes = cats.map(c => ({ c, orc: tetoDoMes(c, chave), gasto: somaMes(chave, c), regra: ver?.cats[c] }))
      .filter(x => x.orc > 0 || x.gasto > 0)
      .sort((a, b) => (b.orc ? b.gasto / b.orc : 9) - (a.orc ? a.gasto / a.orc : 9));
    const totOrc = linhasMes.reduce((s2, x) => s2 + x.orc, 0), totGasto = linhasMes.reduce((s2, x) => s2 + x.gasto, 0);
    const meta = tetoDoMes(INVEST, chave), guardado = somaMes(chave, INVEST);
    const classe = r => r > 1 ? 'excesso' : r >= .8 ? 'atencao' : '';
    const htmlMes = linhasMes.length ? linhasMes.map(x => {
      const r = x.orc ? x.gasto / x.orc : null;
      return `<div class="orc-linha">
        <div class="orc-cab"><span class="orc-nome">${esc(x.c)}</span><span class="orc-num"><b class="valor num">${brl(x.gasto)}</b> de <span class="valor num">${x.orc ? brl(x.orc) : '—'}</span></span></div>
        <div class="trilho"><i class="t-gasto ${r === null ? 'sem-teto' : classe(r)}" data-largura="${r === null ? 100 : Math.min(100, r * 100).toFixed(1)}"></i></div>
        <p class="linha2">${r === null ? 'Sem limite no orçamento.' : `${r > 1 ? `<span class="pct excesso">Passou ${brl(x.gasto - x.orc)}</span>` : `Restam <span class="valor">${brl(x.orc - x.gasto)}</span> (${pct(1 - r)})`}. Limite: ${esc(regraTxt(x.regra))}${R.fixo && x.regra?.tipo === 'valor' ? `, ${pct(x.orc / R.fixo)} do fixo` : ''}.`}</p>
      </div>`;
    }).join('') : '<p class="vazio">Nenhum limite definido para este mês. Monte o orçamento logo abaixo.</p>';

    // ---------- ano: grade categoria x mês ----------
    const meses = Array.from({ length: 12 }, (_, i) => new Date(ano, i, 1));
    const ateMes = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 0 : hoje.getMonth() + 1;
    const linhasAno = cats.map(c => {
      const porMes = meses.map(d => { const k = chaveMes(d); return { k, orc: tetoDoMes(c, k), gasto: k <= kHoje ? somaMes(k, c) : 0 }; });
      const orcAno = porMes.reduce((s2, x) => s2 + x.orc, 0);
      const orcAte = porMes.slice(0, ateMes).reduce((s2, x) => s2 + x.orc, 0);
      const gastoAno = porMes.reduce((s2, x) => s2 + x.gasto, 0);
      const comGasto = porMes.slice(0, ateMes).filter(x => x.gasto > 0).length;
      const gastoComOrc = porMes.slice(0, ateMes).filter(x => x.orc > 0).reduce((s2, x) => s2 + x.gasto, 0);
      return { c, porMes, orcAno, orcAte, gastoAno, gastoComOrc, media: comGasto ? gastoAno / comGasto : 0 };
    }).filter(x => x.orcAno > 0 || x.gastoAno > 0);
    const totAno = linhasAno.reduce((a, x) => ({ orc: a.orc + x.orcAno, ate: a.ate + x.orcAte, gasto: a.gasto + x.gastoAno }), { orc: 0, ate: 0, gasto: 0 });
    const celula = x => {
      if (!x.orc && !x.gasto) return '<td class="vz">·</td>';
      const r = x.orc ? x.gasto / x.orc : null;
      const tom = x.k > kHoje ? 'fut' : r === null ? 'semorc' : r > 1 ? 'r3' : r >= .8 ? 'r2' : r > 0 ? 'r1' : 'r0';
      const curto = v0 => v0 >= 1000 ? (v0 / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(v0);
      return `<td class="${tom}" title="${esc(`${mesCurtoTxt(x.k)}: ${brl(x.gasto)} de ${brl(x.orc)}`)}"><span class="valor">${x.k > kHoje ? curto(x.orc) : curto(x.gasto)}</span></td>`;
    };
    const htmlAno = linhasAno.length ? `
      <div class="grade-ano-rolagem"><table class="grade-ano">
        <thead><tr><th scope="col">Categoria</th>${meses.map(d => `<th scope="col"${chaveMes(d) === chave ? ' class="sel"' : ''}>${MESES[d.getMonth()].slice(0, 3)}</th>`).join('')}<th scope="col">Ano</th></tr></thead>
        <tbody>${linhasAno.map(x => `<tr><th scope="row">${esc(x.c)}</th>${x.porMes.map(celula).join('')}<td class="tot"><span class="valor">${brl(x.gastoAno)}</span><small>de <span class="valor">${brl(x.orcAno)}</span></small></td></tr>`).join('')}</tbody>
      </table></div>
      <p class="legenda-medidor"><span class="lg-r1">Dentro</span><span class="lg-r2">Acima de 80%</span><span class="lg-r3">Passou</span><span class="lg-fut">Meses futuros mostram o orçado</span></p>
      <div class="orc-resumo-ano">
        ${linhasAno.slice().sort((a, b) => b.gastoAno - a.gastoAno).map(x => {
          const r = x.orcAte ? x.gastoComOrc / x.orcAte : null;
          return `<div class="linha"><div class="esq"><div>${esc(x.c)}</div><small>Média de <span class="valor">${brl(x.media)}</span> por mês${x.orcAno ? `. Orçamento do ano: <span class="valor">${brl(x.orcAno)}</span>` : ''}</small></div>
            <div class="dir">${r === null ? `<span class="valor num">${brl(x.gastoAno)}</span>` : `<span class="pct ${classe(r)}">${pct(r)}</span><small>do orçado nos meses com limite</small>`}</div></div>`;
        }).join('')}
      </div>` : `<p class="vazio">Sem orçamento nem gastos em ${ano}.</p>`;

    // ---------- renda planejada do ano ----------
    const rendaAno = meses.map(d => { const k = chaveMes(d), r = renda(k); const orc = cats.reduce((s2, c) => s2 + tetoDoMes(c, k), 0) + tetoDoMes(INVEST, k); return { k, d, fixo: r.fixo, outras: r.variavel + r.previsto, total: r.total, orc, real: k <= kHoje }; });
    const somaRenda = rendaAno.reduce((s2, x) => s2 + x.total, 0), somaOrcAno = rendaAno.reduce((s2, x) => s2 + x.orc, 0);
    const htmlRenda = `
      <div class="hist cab"><span></span><span></span><span>Renda</span><span>Orçado</span><span>Sobra</span></div>
      ${rendaAno.filter(x => x.total > 0 || x.orc > 0 || x.k === chave).map(x => `<div class="hist${x.k === chave ? ' sel' : ''}"><span class="h-mes">${mesCurto(x.d)}${x.real ? '' : '<small>previsto</small>'}</span>
        <div class="h-barras"><i class="h-renda" data-largura="${w(x.total, Math.max(1, ...rendaAno.map(y => Math.max(y.total, y.orc))))}"></i><i class="h-gasto${x.orc > x.total ? ' excesso' : ''}" data-largura="${w(x.orc, Math.max(1, ...rendaAno.map(y => Math.max(y.total, y.orc))))}"></i></div>
        <span class="h-num valor num">${brl(x.total)}</span><span class="h-num valor num">${brl(x.orc)}</span><span class="h-num valor num ${x.total - x.orc < 0 ? 'excesso' : 'folga'}">${brl(x.total - x.orc)}</span></div>`).join('')}
      <p class="previsao">Em ${ano}: renda prevista de ${v(somaRenda)}, orçamento de ${v(somaOrcAno)} (incluindo o que vai guardar), sobra de ${v(somaRenda - somaOrcAno)}. Os meses futuros usam o fixo cadastrado (com aumentos programados) e as entradas recorrentes.</p>`;

    // ---------- editor ----------
    if (!E.orcEdit) {
      const desde = E.orcEdit?.desde || (ver ? ver.desde : kHoje);
      const v0 = versoes.filter(x => x.desde <= desde).pop();
      E.orcEdit = { base: D.atualizado || '', desde, cats: JSON.parse(JSON.stringify(v0 ? v0.cats : {})) };
      if (!v0 && !versoes.length) (D.tetos || []).forEach(t => { if (t.teto > 0) E.orcEdit.cats[t.categoria] = { tipo: 'valor', valor: t.teto }; });
    }
    const ed = E.orcEdit;
    const rEd = renda(ed.desde);
    const linhaEditor = (c, rotulo) => {
      const x = ed.cats[c] || { tipo: c === INVEST ? 'pctFixo' : 'valor', valor: '' };
      const md = mediaCategoria(c);
      return `<div class="orc-ed" data-cat="${esc(c)}">
        <span class="orc-ed-nome">${esc(rotulo || c)}</span>
        <select class="orc-ed-tipo" aria-label="Tipo de limite de ${esc(c)}">${Object.entries(TIPOS_ORC).map(([k, t]) => `<option value="${k}"${x.tipo === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <input class="orc-ed-valor" type="text" inputmode="decimal" autocomplete="off" aria-label="Valor de ${esc(c)}" placeholder="0" value="${x.valor === '' || x.valor === undefined ? '' : String(x.valor).replace('.', ',')}">
        <span class="orc-ed-equiv" aria-live="polite"></span>
        ${md && md.media > 0 && c !== INVEST ? `<button type="button" class="link orc-ed-media" data-media="${arredonda10(md.media)}">Usar média ${brl(md.media)}</button>` : '<span></span>'}
      </div>`;
    };
    const opcoesDesde = (() => { const s2 = new Set([kHoje, `${hoje.getFullYear() + 1}-01`, ed.desde, ...versoes.map(x => x.desde)]); return [...s2].sort(); })();

    $('#conteudo').innerHTML = `
      <section class="heroi" aria-label="Orçamento do mês">
        <p class="frase">Orçamento de ${mesTxt}</p>
        ${valorDeFace(Math.max(0, totOrc - totGasto), totGasto > totOrc && totOrc > 0)}
        <p class="depois">${totOrc ? (totGasto > totOrc ? `acima do orçamento. Você gastou ${v(totGasto)} de ${v(totOrc)}.` : `ainda livres para gastar. Já foram ${v(totGasto)} de ${v(totOrc)} (${pct(totGasto / totOrc)}).`) : 'Nenhum limite definido. Monte o orçamento abaixo.'}</p>
        <p class="meta">${meta ? `Meta de guardar: ${v(meta)}, guardado até agora ${v(guardado)} (${pct(guardado / meta)}).` : 'Defina quanto quer guardar por mês na linha Guardar / investir.'}${R.fixo && totOrc ? ` O orçamento de gastos usa ${pct(totOrc / R.fixo)} do salário fixo.` : ''}</p>
      </section>
      ${faixa()}
      <div class="grade-secoes">
        <section class="secao"><h3>Consumo de ${mesTxt} <small>gasto e limite</small></h3>${htmlMes}</section>
        <section class="secao"><h3>Renda e orçamento de ${ano}</h3>${htmlRenda}</section>
      </div>
      <section class="secao"><h3>Ano de ${ano} <small>gasto por mês em cada categoria</small></h3>${htmlAno}</section>

      <section class="secao" id="sec-orc-editar">
        <h3>Montar orçamento</h3>
        <p class="apoio-secao">Cada categoria pode ter um limite fixo em reais ou um percentual do salário. O orçamento vale a partir do mês escolhido até você salvar outro. Para planejar 2027, escolha janeiro de 2027.</p>
        <div class="orc-desde">
          <label class="campo"><span>Vale a partir de</span><select id="orc-desde">${opcoesDesde.map(k => `<option value="${k}"${k === ed.desde ? ' selected' : ''}>${nomeMes(new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1))}${versoes.some(x => x.desde === k) ? ' (salvo)' : ''}</option>`).join('')}<option value="outro">Outro mês…</option></select></label>
          <label class="campo escondido" id="orc-outro"><span>Mês</span><input id="orc-outro-mes" type="month" value="${ed.desde}"></label>
        </div>
        <p class="apoio-secao">Base de cálculo dos percentuais em ${nomeMes(new Date(+ed.desde.slice(0, 4), +ed.desde.slice(5, 7) - 1, 1))}: fixo de ${v(rEd.fixo)}, renda total prevista de ${v(rEd.total)}.</p>
        <div class="orc-editor">
          ${linhaEditor(INVEST, 'Guardar / investir')}
          ${cats.map(c => linhaEditor(c)).join('')}
        </div>
        <div class="orc-total" id="orc-total" aria-live="polite"></div>
        <div class="orc-acoes">
          <button class="btn" type="button" id="orc-salvar">Salvar orçamento</button>
          <button class="btn secundario" type="button" id="orc-medias">Preencher com minhas médias</button>
        </div>
        <div class="msg" id="orc-msg" role="status"></div>
        ${versoes.length ? `<h4>Orçamentos salvos</h4>${versoes.slice().reverse().map(x => {
          const n = Object.keys(x.cats).length;
          return `<div class="linha"><div class="esq"><div>A partir de ${nomeMes(new Date(+x.desde.slice(0, 4), +x.desde.slice(5, 7) - 1, 1))}</div><small>${n} ${n === 1 ? 'categoria' : 'categorias'}${x.cats[INVEST] ? `, guardar ${regraTxt(x.cats[INVEST])}` : ''}</small></div><div class="dir"><button class="link" type="button" data-orc-abrir="${x.desde}">Editar</button> <button class="link perigo" type="button" data-orc-remover="${x.desde}">Remover</button></div></div>`;
        }).join('')}` : ''}
      </section>

      <section class="secao">
        <h3>Aumento de salário</h3>
        <p class="apoio-secao">Se você espera uma promoção, cadastre o novo fixo e o mês em que começa. O orçamento em % e as previsões passam a usar esse valor a partir daquele mês.</p>
        <form class="form-linha" id="f-aumento" novalidate>
          <label class="campo"><span>Novo salário fixo</span><input id="au-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 4.500,00" maxlength="14"></label>
          <label class="campo"><span>A partir de</span><input id="au-mes" type="month" value="${hoje.getFullYear() + 1}-01"></label>
          <button class="btn" type="submit">Programar aumento</button>
        </form>
        <div class="msg" id="au-msg" role="status"></div>
      </section>`;

    // ---------- editor: interação ----------
    const ler = el => { const t = el.value.trim(); if (!t) return ''; const n = lerValor(t); return isFinite(n) ? n : NaN; };
    const atualizarEditor = () => {
      let totGastos = 0, guardar = 0, invalido = false;
      $$('.orc-ed').forEach(row => {
        const c = row.dataset.cat, tipo = $('.orc-ed-tipo', row).value, val = ler($('.orc-ed-valor', row));
        if (Number.isNaN(val)) invalido = true;
        if (val === '' || Number.isNaN(val) || val <= 0) delete ed.cats[c]; else ed.cats[c] = { tipo, valor: val };
        const reais = val > 0 ? (tipo === 'valor' ? val : (tipo === 'pctFixo' ? rEd.fixo : rEd.total) * val / 100) : 0;
        $('.orc-ed-equiv', row).textContent = val > 0 ? (tipo === 'valor' ? (rEd.fixo ? `${pct(reais / rEd.fixo)} do fixo` : '') : `= ${brl(reais)}`) : '';
        if (c === INVEST) guardar = reais; else totGastos += reais;
      });
      const base = rEd.total || rEd.fixo;
      const sobra = base - totGastos - guardar;
      $('#orc-total').innerHTML = invalido ? '<p class="msg erro">Algum valor está inválido. Use só números (ex.: 450 ou 15).</p>'
        : `<div><span>Gastos</span><b class="valor">${brl(totGastos)}</b></div><div><span>Guardar</span><b class="valor">${brl(guardar)}</b></div><div><span>Sobra da renda</span><b class="valor ${sobra < 0 ? 'excesso' : 'folga'}">${brl(sobra)}</b></div>
           <p class="${sobra < 0 ? 'excesso' : ''}">${base ? (sobra < 0 ? `O orçamento passa a renda prevista em ${brl(-sobra)}. Corte em alguma categoria ou reduza a meta de guardar.` : `Usa ${pct((totGastos + guardar) / base)} da renda prevista. ${sobra > 0 ? 'O que sobrar fica como folga.' : ''}`) : 'Cadastre o salário fixo para ver quanto da renda o orçamento usa.'}</p>`;
      return !invalido;
    };
    $$('.orc-ed-tipo, .orc-ed-valor').forEach(el => el.addEventListener('input', atualizarEditor));
    $$('.orc-ed-media').forEach(b => b.onclick = () => { const row = b.closest('.orc-ed'); $('.orc-ed-tipo', row).value = 'valor'; $('.orc-ed-valor', row).value = b.dataset.media; atualizarEditor(); });
    $('#orc-medias').onclick = () => { $$('.orc-ed-media').forEach(b => b.click()); avisoRapido('Preenchido com a média dos últimos meses, arredondada para cima. Revise antes de salvar.'); };
    atualizarEditor();

    const trocarDesde = k => {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      const v0 = versoes.filter(x => x.desde <= k).pop();
      E.orcEdit = { base: D.atualizado || '', desde: k, cats: JSON.parse(JSON.stringify(v0 ? v0.cats : ed.cats)) };
      renderConteudo(); $('#sec-orc-editar').scrollIntoView({ block: 'start' });
    };
    $('#orc-desde').onchange = ev => { if (ev.target.value === 'outro') { $('#orc-outro').classList.remove('escondido'); $('#orc-outro-mes').focus(); } else trocarDesde(ev.target.value); };
    $('#orc-outro-mes').onchange = ev => trocarDesde(ev.target.value);
    $$('[data-orc-abrir]').forEach(b => b.onclick = () => trocarDesde(b.dataset.orcAbrir));
    $$('[data-orc-remover]').forEach(b => b.onclick = async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = 'Confirmar'; return; }
      b.disabled = true;
      try { if (await gravar('removerOrcamento', { desde: b.dataset.orcRemover })) { E.orcEdit = null; renderConteudo(); avisoRapido('Orçamento removido.'); } } catch (e) { b.textContent = e.message; }
    });
    $('#orc-salvar').onclick = async () => {
      const msg = $('#orc-msg'), btn = $('#orc-salvar');
      if (!atualizarEditor()) { msg.className = 'msg erro'; msg.textContent = 'Corrija os valores marcados antes de salvar.'; return; }
      if (!Object.keys(ed.cats).length) { msg.className = 'msg erro'; msg.textContent = 'Preencha pelo menos uma categoria.'; return; }
      const fora = Object.entries(ed.cats).find(([, x]) => x.tipo !== 'valor' && x.valor > 100);
      if (fora) { msg.className = 'msg erro'; msg.textContent = `Percentual acima de 100% em ${fora[0]}.`; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        const desde = ed.desde;
        if (await gravar('salvarOrcamento', { desde, cats: ed.cats })) { E.orcEdit = null; renderConteudo(); avisoRapido(`Orçamento salvo a partir de ${nomeMes(new Date(+desde.slice(0, 4), +desde.slice(5, 7) - 1, 1))}.`); }
      } catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Salvar orçamento'; }
    };
    $('#f-aumento').onsubmit = async ev => {
      ev.preventDefault();
      const msg = $('#au-msg'), btn = ev.target.querySelector('button');
      const valor = lerValor($('#au-valor').value), mes = $('#au-mes').value;
      msg.className = 'msg erro';
      if (!(valor > 0)) { msg.textContent = 'Digite o novo salário fixo.'; return; }
      if (!/^\d{4}-\d{2}$/.test(mes)) { msg.textContent = 'Escolha o mês em que começa.'; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      const diaAtual = renda(kHoje).fixoReg?.dia || 15;
      try { if (await gravar('salvarFixo', { valor, mes, dia: diaAtual })) { renderConteudo(); avisoRapido(`Fixo de ${brl(valor)} programado a partir de ${mesCurtoTxt(mes)}.`); } }
      catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Programar aumento'; }
    };
  }

  /* --------------------------- aba SIMULAR --------------------------- */
  // Simula uma compra em vários formatos e roda o fluxo de caixa dos próximos 12 meses para cada um.
  // A compra entra como lançamento virtual (não é salva) e passa pelo mesmo motor do Fluxo:
  // parcelas caem nas faturas do cartão escolhido, Pix sai no dia, "juntar" compra mais tarde.
  const SIM_PADRAO = () => ({ nome: '', valor: '', desconto: '', juros: '', reserva: '', categoria: 'Compras pessoais', cartao: ls.get(K.cartao) || '', data: ymd(hoje) });

  function cenariosDe(sim) {
    const preco = sim.valor, desc = Math.max(0, Math.min(90, sim.desconto || 0)) / 100, j = Math.max(0, sim.juros || 0) / 100;
    const aVista = preco * (1 - desc);
    const parcela = n => j > 0 ? preco * j / (1 - Math.pow(1 + j, -n)) : preco / n; // tabela Price quando há juros
    const temCartao = cartoes().length > 0;
    const base = { categoria: sim.categoria, descricao: sim.nome || 'Compra simulada', simulada: true, pontual: true, origem: 'Simulação', id: 'simulacao' };
    const lista = [{ id: 'nao', nome: 'Não comprar', itens: [], total: 0 }];
    lista.push({ id: 'pix', nome: desc ? `À vista no Pix (${Math.round(desc * 100)}% off)` : 'À vista no Pix', itens: [Object.assign({}, base, { data: sim.data, valor: aVista, forma: 'Pix' })], total: aVista });
    if (temCartao) {
      [1, 3, 6, 10, 12].forEach(n => {
        const vp = n === 1 ? aVista : parcela(n);
        const total = n === 1 ? aVista : vp * n;
        lista.push({ id: 'c' + n, nome: n === 1 ? 'À vista no crédito' : `${n}x de ${brl(vp)}`, parcelas: n, parcela: vp, itens: [Object.assign({}, base, { data: sim.data, valor: total, forma: 'Crédito', cartao: sim.cartao || cartoes()[0].id, parcelas: n })], total });
      });
    }
    [3, 6].forEach(n => lista.push({ id: 'j' + n, nome: `Juntar e comprar em ${n} meses`, espera: n, itens: [Object.assign({}, base, { data: addMeses(ymd(hoje), n), valor: aVista, forma: 'Pix' })], total: aVista }));
    return lista;
  }

  function projetar(itens, meses = 12) {
    E.simAtiva = itens.length ? itens : null;
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 0);
    const serie = serieSaldo(ini, fim).dias;
    E.simAtiva = null;
    const futuro = serie.filter(x => x.k >= ymd(hoje));
    const min = futuro.reduce((a, b) => b.saldo < a.saldo ? b : a, futuro[0]);
    const fimMes = [];
    for (let i = 0; i < meses; i++) {
      const ult = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, 0);
      const x = serie.find(d => d.k === ymd(ult)); if (x) fimMes.push({ d: ult, saldo: x.saldo });
    }
    const diasNeg = futuro.filter(x => x.saldo < 0).length;
    return { serie, min, fimMes, diasNeg, final: fimMes.length ? fimMes[fimMes.length - 1].saldo : 0 };
  }

  function renderSimular() {
    if (!E.sim) { try { E.sim = Object.assign(SIM_PADRAO(), JSON.parse(ls.get(K.sim) || '{}')); } catch (_) { E.sim = SIM_PADRAO(); } }
    const sim = E.sim;
    const valido = sim.valor > 0;
    let cen = [], resultados = [], recomendado = null, explicacao = '';
    if (valido) {
      cen = cenariosDe(sim);
      resultados = cen.map(c => Object.assign({}, c, { proj: projetar(c.itens) }));
      const base = resultados[0].proj;
      const reserva = sim.reserva > 0 ? sim.reserva : 0;
      const ok = r => r.proj.min.saldo >= reserva;
      const opcoes = resultados.slice(1);
      const viaveisAgora = opcoes.filter(r => !r.espera && ok(r));
      const menorTotal = arr => arr.slice().sort((a, b) => a.total - b.total || b.proj.min.saldo - a.proj.min.saldo)[0];
      if (viaveisAgora.length) {
        const barata = menorTotal(viaveisAgora);
        const empate = viaveisAgora.filter(r => Math.abs(r.total - barata.total) < 0.5);
        recomendado = empate.slice().sort((a, b) => b.proj.min.saldo - a.proj.min.saldo)[0];
        const parcelado = recomendado.parcelas > 1;
        explicacao = parcelado
          ? `Parcelar sem juros custa o mesmo e mantém mais dinheiro na conta: o menor saldo fica em ${brl(recomendado.proj.min.saldo)} (dia ${recomendado.proj.min.d.getDate()}/${recomendado.proj.min.d.getMonth() + 1}). Cada parcela pesa ${pct(recomendado.parcela / Math.max(1, renda(chaveMes(hoje)).fixo))} do salário fixo.`
          : `Pagar à vista é a opção mais barata (${brl(recomendado.total)}) e seu saldo continua acima de ${brl(reserva)} o tempo todo: o menor ponto é ${brl(recomendado.proj.min.saldo)} em ${recomendado.proj.min.d.getDate()}/${recomendado.proj.min.d.getMonth() + 1}.`;
      } else {
        const esperar = opcoes.filter(r => r.espera && ok(r)).sort((a, b) => a.espera - b.espera)[0];
        const melhorParc = opcoes.filter(r => !r.espera).sort((a, b) => b.proj.min.saldo - a.proj.min.saldo)[0];
        recomendado = esperar || melhorParc;
        explicacao = esperar
          ? `Comprar agora deixa seu saldo abaixo de ${brl(reserva)} em algum momento. Juntando por ${esperar.espera} meses, a compra cabe: o menor saldo fica em ${brl(esperar.proj.min.saldo)}.`
          : `Nenhum formato mantém o saldo acima de ${brl(reserva)} nos próximos 12 meses. O menos apertado é ${melhorParc.nome[0].toLowerCase() + melhorParc.nome.slice(1)}, com o menor saldo em ${brl(melhorParc.proj.min.saldo)}. Vale rever o valor ou esperar mais.`;
      }
      if (base.min.saldo < reserva) explicacao += ` Atenção: mesmo sem comprar, seu fluxo já fica abaixo de ${brl(reserva)} em ${base.min.d.getDate()}/${base.min.d.getMonth() + 1}.`;
    }

    const cartoesL = cartoes();
    const linhaRes = r => {
      const dif = r.proj.final - resultados[0].proj.final;
      return `<tr class="${r === recomendado ? 'rec' : ''}${r.id === 'nao' ? ' base' : ''}" data-cen="${r.id}">
        <th scope="row">${esc(r.nome)}${r === recomendado ? ' <span class="selo-rec">recomendado</span>' : ''}</th>
        <td class="valor num">${r.total ? brl(r.total) : '—'}</td>
        <td class="valor num ${r.proj.min.saldo < 0 ? 'excesso' : ''}">${brl(r.proj.min.saldo)}<small>${r.proj.min.d.getDate()}/${r.proj.min.d.getMonth() + 1}</small></td>
        <td class="valor num">${r.proj.diasNeg ? `<span class="excesso">${r.proj.diasNeg} dias</span>` : '0'}</td>
        <td class="valor num">${brl(r.proj.final)}${r.id === 'nao' ? '' : `<small>${brl(dif)}</small>`}</td>
      </tr>`;
    };

    $('#conteudo').innerHTML = `
      <section class="heroi" aria-label="Simulação de compra">
        <p class="frase">${valido ? `Se você comprar ${esc(sim.nome || 'isso')} por ${brl(sim.valor)}` : 'Simule uma compra antes de fazer'}</p>
        ${valido && recomendado ? `<p class="face-texto">${esc(recomendado.nome)}</p>` : valorDeFace(0)}
        <p class="depois">${valido ? esc(explicacao) : 'Digite o valor e veja, mês a mês, o que acontece com seu saldo à vista, parcelado ou esperando alguns meses.'}</p>
        ${E.dados.ajustes?.saldo ? '' : '<p class="meta">Sem o saldo da conta cadastrado, a simulação parte do zero. Cadastre em Cadastros para um resultado real.</p>'}
      </section>
      ${faixa()}
      <div class="grade-secoes">
        <section class="secao">
          <h3>A compra</h3>
          <form class="form-conta" id="f-sim" novalidate>
            <label class="campo c-nome"><span>O que é</span><input id="sm-nome" type="text" autocomplete="off" maxlength="40" placeholder="Ex.: PlayStation 5" value="${esc(sim.nome)}"></label>
            <label class="campo"><span>Preço</span><input id="sm-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 3.800,00" value="${sim.valor ? String(sim.valor).replace('.', ',') : ''}"></label>
            <label class="campo"><span>Desconto à vista (%)</span><input id="sm-desc" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 10" value="${sim.desconto || ''}"></label>
            <label class="campo"><span>Juros do parcelado (% ao mês)</span><input id="sm-juros" type="text" inputmode="decimal" autocomplete="off" placeholder="0 se for sem juros" value="${sim.juros || ''}"></label>
            <label class="campo"><span>Não quero ficar com menos de</span><input id="sm-reserva" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 500,00" value="${sim.reserva ? String(sim.reserva).replace('.', ',') : ''}"></label>
            <label class="campo"><span>Data da compra</span><input id="sm-data" type="date" value="${sim.data}" min="${ymd(hoje)}"></label>
            <label class="campo"><span>Categoria</span><select id="sm-cat">${opcoes(categoriasGasto(), sim.categoria)}</select></label>
            ${cartoesL.length ? `<label class="campo"><span>Cartão para parcelar</span><select id="sm-cartao">${cartoesL.map(c => `<option value="${esc(c.id)}"${c.id === sim.cartao ? ' selected' : ''}>${esc(c.nome)} (vence dia ${c.vence})</option>`).join('')}</select></label>` : '<p class="dica c-dica">Cadastre seus cartões em Cadastros para comparar opções parceladas.</p>'}
            <button class="btn" type="submit">Simular</button>
          </form>
          <div class="msg" id="sm-msg" role="status"></div>
        </section>
        <section class="secao">
          <h3>Saldo no fim de cada mês</h3>
          ${valido ? '<div id="sim-grafico" class="ritmo"></div><div class="legenda" id="sim-legenda"></div>' : '<p class="vazio">O gráfico aparece quando você simular.</p>'}
        </section>
      </div>
      ${valido ? `<section class="secao">
        <h3>Comparando os formatos <small>próximos 12 meses</small></h3>
        <div class="grade-ano-rolagem"><table class="tab-sim">
          <thead><tr><th scope="col">Formato</th><th scope="col">Você paga</th><th scope="col">Menor saldo</th><th scope="col">Dias no negativo</th><th scope="col">Saldo em ${mesCurto(new Date(hoje.getFullYear(), hoje.getMonth() + 11, 1))}</th></tr></thead>
          <tbody>${resultados.map(linhaRes).join('')}</tbody>
        </table></div>
        <p class="previsao">Toque num formato para ver a linha dele no gráfico. A simulação usa seu saldo, salário, entradas recorrentes, contas fixas, faturas e a estimativa do dia a dia, igual ao Fluxo. Nada é salvo até você lançar.</p>
        ${recomendado && recomendado.id !== 'nao' ? `<button class="btn" type="button" id="sim-lancar">Lançar: ${esc(recomendado.nome)}</button>` : ''}
      </section>` : ''}`;

    // gráfico com 3 linhas: não comprar, recomendado e o formato tocado
    const desenhar = () => {
      const box = $('#sim-grafico'); if (!box || !resultados.length) return;
      const foco = resultados.find(r => r.id === E.simFoco) || null;
      const linhas = [resultados[0], recomendado, foco].filter((r, i, a) => r && a.indexOf(r) === i);
      box.innerHTML = graficoSim(linhas, box.clientWidth, recomendado);
      $('#sim-legenda').innerHTML = linhas.map(r => `<span class="${r.id === 'nao' ? 'l-base' : r === recomendado ? 'l-rec' : 'l-foco'}">${esc(r.nome)}</span>`).join('');
      $$('.tab-sim tbody tr').forEach(tr => tr.classList.toggle('foco', tr.dataset.cen === E.simFoco));
    };
    E.grafico = desenhar; desenhar();
    $$('.tab-sim tbody tr').forEach(tr => tr.onclick = () => { E.simFoco = tr.dataset.cen; desenhar(); });

    $('#f-sim').onsubmit = ev => {
      ev.preventDefault();
      const msg = $('#sm-msg'); msg.className = 'msg erro';
      const valor = lerValor($('#sm-valor').value);
      if (!(valor > 0)) { msg.textContent = 'Digite o preço da compra.'; $('#sm-valor').focus(); return; }
      const num = id => { const t = $(id).value.trim(); return t ? lerValor(t) : ''; };
      E.sim = { nome: $('#sm-nome').value.trim(), valor, desconto: num('#sm-desc'), juros: num('#sm-juros'), reserva: num('#sm-reserva'),
        data: $('#sm-data').value || ymd(hoje), categoria: $('#sm-cat').value, cartao: $('#sm-cartao')?.value || '' };
      ls.set(K.sim, JSON.stringify(E.sim));
      E.simFoco = null;
      renderConteudo();
    };
    const lancar = $('#sim-lancar');
    if (lancar) lancar.onclick = () => {
      const r = recomendado, it = r.itens[0];
      abrirFolha(null, 'saida', it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
      setTimeout(() => {
        const d = $('#folha');
        const tocar = sel => { const b = $(sel, d); if (b) b.click(); };
        tocar(`.chip[data-grupo="cat"][data-v="${it.categoria}"]`);
        tocar(`.chip[data-grupo="forma"][data-v="${it.forma}"]`);
        if (it.forma === 'Crédito') { tocar(`.chip[data-grupo="cartao"][data-id="${it.cartao}"]`); tocar(`.chip[data-grupo="parc"][data-v="${it.parcelas}"]`); }
        $('#g-desc').value = sim.nome || '';
        $('#g-data').value = it.data;
      }, 60);
    };
  }

  function graficoSim(linhas, largura, recomendado) {
    const W = Math.max(280, Math.round(largura || 640)), H = Math.round(Math.min(240, Math.max(170, W * .4)));
    const P = { e: 52, d: 10, t: 12, b: 24 };
    const todos = linhas.flatMap(r => r.proj.fimMes.map(x => x.saldo).concat([r.proj.min.saldo]));
    let lo = Math.min(0, ...todos), hi = Math.max(0, ...todos); if (hi - lo < 1) hi = lo + 1;
    const f = (hi - lo) * .08; lo -= lo < 0 ? f : 0; hi += f;
    const n = linhas[0].proj.fimMes.length;
    const x = i => P.e + i / Math.max(1, n - 1) * (W - P.e - P.d);
    const yv = v0 => P.t + (hi - v0) / (hi - lo) * (H - P.t - P.b);
    const curto = v0 => Math.abs(v0) >= 1000 ? (v0 / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil' : String(Math.round(v0));
    let g = '';
    [lo, (lo + hi) / 2, hi].forEach(v0 => { const yy = yv(v0).toFixed(1); g += `<line class="grade" x1="${P.e}" x2="${W - P.d}" y1="${yy}" y2="${yy}"/><text class="eixo" x="${P.e - 8}" y="${+yy + 4}" text-anchor="end">${curto(v0)}</text>`; });
    if (lo < 0) g += `<line class="zero" x1="${P.e}" x2="${W - P.d}" y1="${yv(0)}" y2="${yv(0)}"/>`;
    linhas[0].proj.fimMes.forEach((m, i) => { if (i % 2 === 0 || i === n - 1) g += `<text class="eixo" x="${x(i)}" y="${H - 5}" text-anchor="middle">${MESES[m.d.getMonth()].slice(0, 3)}</text>`; });
    linhas.forEach(r => {
      const cls = r.id === 'nao' ? 'sim-base' : r === recomendado ? 'sim-rec' : 'sim-foco';
      g += `<path class="${cls}" pathLength="1" d="${r.proj.fimMes.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yv(m.saldo).toFixed(1)}`).join('')}"/>`;
      r.proj.fimMes.forEach((m, i) => { g += `<circle class="${cls}-p" cx="${x(i).toFixed(1)}" cy="${yv(m.saldo).toFixed(1)}" r="2.6"/>`; });
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="desenhar" role="img" aria-label="Saldo no fim de cada mês em cada formato de compra">${g}</svg>`;
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
        .map(i => `<li class="${i.e ? 'ent' : 'sai'}${i.prev ? ' prev' : ''}${i.id || i.entrada ? ' editavel' : ''}"${i.id ? ` data-editar="${esc(i.id)}" role="button" tabindex="0"` : i.entrada ? ` data-editar-entrada="${esc(i.entrada)}" role="button" tabindex="0"` : ''}><span>${esc(i.desc)}${i.prev ? ' <small>previsto</small>' : ''}</span><span class="valor num">${i.e ? '+' : '−'} ${brl(i.valor)}</span></li>`).join('');
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
        ${(() => { const x = explicarEstimativa(); return x.valor > 0 && temFuturo ? `<p class="previsao">Estimativa do dia a dia: ${v(x.valor)} por dia. ${x.fixo ? 'É o valor que você definiu em Cadastros.' : `Vem de ${v(x.base)} em gastos comuns nos ${x.dia} dias deste mês${x.hist !== null && x.peso < 1 ? ', misturado com a média dos meses anteriores' : ''}. Contas fixas, datas futuras e gastos pontuais ficam de fora${x.foraPontual.length ? ` (${x.foraPontual.length} ${x.foraPontual.length === 1 ? 'gasto' : 'gastos'} este mês)` : ''}.`} <button class="link" type="button" data-aba-ir="cadastros">Ajustar</button></p>` : ''; })()}
        <p class="previsao">${cartoes().length ? `Compras no crédito entram no vencimento da fatura de cada cartão (${cartoes().map(c => `${esc(c.nome)} dia ${c.vence}`).join(', ')}).` : 'Compras no crédito entram no dia da compra. Cadastre seus cartões para elas caírem no dia da fatura.'} Os dias que ainda não chegaram usam uma estimativa do seu gasto do dia a dia.</p>
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
  function dicaPeriodo(ini, fim) {
    if (!/^\d{4}-\d{2}$/.test(ini || '')) return '';
    if (!fim) return `Todo mês a partir de ${mesCurtoTxt(ini)}, sem data para acabar.`;
    if (fim < ini) return 'O mês final está antes do início.';
    const n = mesesEntre(ini, fim) + 1;
    return `${n} ${n === 1 ? 'mês' : 'meses'}: de ${mesCurtoTxt(ini)} a ${mesCurtoTxt(fim)}.`;
  }
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
    const contas = (D.contas || []).slice().sort((a, b) => (contaNoMes(b, chave) - contaNoMes(a, chave)) || a.dia - b.dia);
    const totalContas = contas.filter(c => contaNoMes(c, chave)).reduce((s, c) => s + c.valor, 0);
    const cartoesL = cartoes();
    const recs = recorrentes();
    const edR = E.editRec ? recs.find(x => x.id === E.editRec) : null;
    const ed = E.editConta ? contas.find(c => c.id === E.editConta) : null;
    const edC = E.editCartao ? cartoesL.find(c => c.id === E.editCartao) : null;
    const aj = D.ajustes || {};
    const cats = D.categorias || [], formas = D.formas || ['Pix', 'Crédito', 'Débito', 'Dinheiro'];

    $('#conteudo').innerHTML = `
      <section class="heroi" aria-label="Renda do mês">
        <p class="frase">Sua renda em ${mesTxt}</p>
        ${valorDeFace(R.total)}
        <p class="depois">${R.total ? `Fixo <span class="valor">${brl(R.fixo)}</span>${R.variavel ? `, entradas <span class="valor">${brl(R.variavel)}</span>` : ''}${R.previsto ? `, a receber <span class="valor">${brl(R.previsto)}</span>` : ''}. Contas fixas: <span class="valor">${brl(totalContas)}</span> em ${mesTxt}.` : 'Nenhuma renda cadastrada para este mês.'}</p>
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
            <h3>Entradas de ${mesTxt} <small>${brl(R.variavel)}</small></h3>
            <p class="apoio-secao">Tudo que entrou além do fixo: projetos, vendas, reembolsos. Toque numa entrada para editar.</p>
            <button class="btn" type="button" id="b-nova-entrada">Lançar entrada</button>
            ${R.variaveis.length ? R.variaveis.slice().sort((x, y) => x.dia - y.dia).map(r => `<div class="linha editavel" data-editar-entrada="${esc(r.id)}" role="button" tabindex="0"><div class="esq"><div>${esc(r.descricao)}</div><small>Dia ${r.dia || 30}, ${esc(r.categoria || 'Variável')}${r.recorrente ? `, ${esc(recorrentes().find(x => x.id === r.recorrente)?.nome || 'recorrente')}` : ''}</small></div><div class="dir"><span class="valor num">+ ${brl(r.valor)}</span></div></div>`).join('')
              : `<p class="vazio">Nenhuma entrada lançada em ${mesTxt}.</p>`}
            ${R.pendentes.length ? `<h4>A receber em ${mesTxt}</h4>${R.pendentes.map(x => `<div class="linha"><div class="esq"><div>${esc(x.nome)}</div><small>Previsto para o dia ${x.dia}</small></div><div class="dir"><span class="valor num">${brl(x.valor)}</span></div></div>`).join('')}` : ''}
          </section>

          <section class="secao" id="sec-recorrentes">
            <h3>Entradas recorrentes</h3>
            <p class="apoio-secao">Variáveis que se repetem, cada um com o seu dia (ex.: um projeto no dia 25 e outro no dia 30). Coloque até quando cada um vai entrar: depois disso ele sai do fluxo e da previsão. O fluxo usa o valor previsto até você lançar quanto entrou de verdade${recs.length ? '' : '. Sem recorrentes, o fluxo usa a média dos últimos 3 meses'}.</p>
            <form class="form-conta" id="f-rec" novalidate>
              <label class="campo c-nome"><span>Nome</span><input id="rc-nome" type="text" autocomplete="off" placeholder="Ex.: Variável projeto A" maxlength="40" value="${esc(edR?.nome || '')}"></label>
              <label class="campo"><span>Valor previsto</span><input id="rc-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.200,00" maxlength="14" value="${edR ? edR.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"></label>
              <label class="campo"><span>Dia que cai</span><input id="rc-dia" type="number" inputmode="numeric" min="1" max="31" placeholder="30" value="${edR?.dia || ''}"></label>
              <label class="campo"><span>Começa em</span><input id="rc-inicio" type="month" value="${edR?.inicio || chaveMes(hoje)}"></label>
              <label class="campo"><span>Recebe até</span><input id="rc-fim" type="month" value="${edR?.fim || ''}"></label>
              <label class="campo"><span>ou por quantos meses</span><input id="rc-meses" type="number" inputmode="numeric" min="1" max="120" placeholder="Ex.: 10"></label>
              <p class="dica c-dica" id="rc-dica">${dicaPeriodo(edR?.inicio || chaveMes(hoje), edR?.fim || '').replace('sem data para acabar', 'sem data para acabar. Se o projeto tem prazo, preencha até quando recebe')}</p>
              <button class="btn" type="submit">${edR ? 'Salvar alterações' : 'Adicionar recorrente'}</button>
              ${edR ? '<button class="btn secundario" type="button" id="rc-cancelar">Cancelar edição</button>' : ''}
            </form>
            <div class="msg" id="rc-msg" role="status"></div>
            ${recs.length ? recs.map(x => {
              const recebido = R.variaveis.filter(r => r.recorrente === x.id).reduce((s2, r) => s2 + r.valor, 0);
              const noMes = recorrentesNoMes(chave).some(y => y.id === x.id);
              const mHoje = chaveMes(hoje), acabou = x.fim && x.fim < mHoje, futura = x.inicio && x.inicio > mHoje;
              const restam = x.fim && !acabou ? mesesEntre(futura ? x.inicio : mHoje, x.fim) + 1 : 0;
              const periodo = x.fim
                ? `${mesCurtoTxt(x.inicio)} a ${mesCurtoTxt(x.fim)}${acabou ? ', já terminou' : `, ${restam === 1 ? 'último mês' : `faltam ${restam} meses`}`}`
                : `desde ${mesCurtoTxt(x.inicio)}, sem data para acabar`;
              const status = !noMes ? 'fora do período neste mês' : recebido ? `recebido ${brl(recebido)} em ${mesTxt}` : `a receber em ${mesTxt}`;
              const totalRestante = x.fim && !acabou ? restam * x.valor : 0;
              return `<div class="linha${noMes ? '' : ' inativa'}"><div class="esq"><div>${esc(x.nome)}</div><small>Dia ${x.dia}, ${periodo}. ${status[0].toUpperCase() + status.slice(1)}.${totalRestante ? ` Ainda devem entrar ${brl(totalRestante)}.` : ''}</small></div><div class="dir"><span class="valor num">${brl(x.valor)}</span> <button class="link" type="button" data-editar-rec="${esc(x.id)}">Editar</button> ${btnRemover(x.id, 'removerRecorrente')}</div></div>`;
            }).join('') : '<p class="vazio">Nenhuma entrada recorrente cadastrada.</p>'}
          </section>
        </div>

        <div>
          <section class="secao" id="sec-contas">
            <h3>Contas fixas <small>${brl(totalContas)} em ${mesTxt}</small></h3>
            <p class="apoio-secao">Elas entram sozinhas em Lançamentos no dia de cada uma, só entre o mês de início e o de fim. Não lance essas contas pelo formulário, senão contam duas vezes.</p>
            <form class="form-conta" id="f-conta" novalidate>
              <label class="campo c-nome"><span>Conta</span><input id="ct-nome" type="text" autocomplete="off" placeholder="Ex.: Aluguel" maxlength="60" value="${esc(ed?.nome || '')}"></label>
              <label class="campo"><span>Valor</span><input id="ct-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.500,00" maxlength="14" value="${ed ? ed.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"></label>
              <label class="campo"><span>Dia</span><input id="ct-dia" type="number" inputmode="numeric" min="1" max="31" placeholder="10" value="${ed?.dia || ''}"></label>
              <label class="campo"><span>Categoria</span><select id="ct-cat">${opcoes(cats, ed?.categoria || 'Contas fixas')}</select></label>
              <label class="campo"><span>Paga com</span><select id="ct-forma">${opcoes(formas, ed?.forma || 'Pix')}</select></label>
              <label class="campo c-cartao${(ed?.forma === 'Crédito') && cartoesL.length ? '' : ' escondido'}"><span>Cartão</span><select id="ct-cartao">${cartoesL.map(c => `<option value="${esc(c.id)}"${c.id === ed?.cartao ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
              <label class="campo"><span>Começa em</span><input id="ct-inicio" type="month" value="${ed?.inicio || chaveMes(hoje)}"></label>
              <label class="campo"><span>Termina em <small>(opcional)</small></span><input id="ct-fim" type="month" value="${ed?.fim || ''}"></label>
              <label class="campo"><span>ou nº de meses</span><input id="ct-meses" type="number" inputmode="numeric" min="1" max="120" placeholder="Ex.: 6"></label>
              <p class="dica c-dica" id="ct-dica">${dicaPeriodo(ed?.inicio || chaveMes(hoje), ed?.fim || '')}</p>
              <button class="btn" type="submit">${ed ? 'Salvar alterações' : 'Adicionar conta'}</button>
              ${ed ? '<button class="btn secundario" type="button" id="ct-cancelar">Cancelar edição</button>' : ''}
            </form>
            <div class="msg" id="ct-msg" role="status"></div>
            ${contas.length ? contas.map(c => {
              const ativa = contaNoMes(c, chave), acabou = c.fim && c.fim < chaveMes(hoje), futura = c.inicio && c.inicio > chaveMes(hoje);
              const periodo = c.fim ? `${mesCurtoTxt(c.inicio)} a ${mesCurtoTxt(c.fim)}${acabou ? ', terminou' : futura ? '' : `, faltam ${mesesEntre(chaveMes(hoje), c.fim) + 1} ${mesesEntre(chaveMes(hoje), c.fim) === 0 ? 'mês' : 'meses'}`}` : `desde ${mesCurtoTxt(c.inicio)}, sem fim`;
              const pag = c.forma === 'Crédito' && cartoesL.length ? `Crédito ${esc(cartaoDe(c.cartao)?.nome || '')}` : esc(c.forma);
              return `<div class="linha${ativa ? '' : ' inativa'}"><div class="esq"><div>${esc(c.nome)}</div><small>Dia ${c.dia}, ${esc(c.categoria)}, ${pag}. ${periodo}${futura ? ', ainda não começou' : ''}.</small></div><div class="dir"><span class="valor num">${brl(c.valor)}</span> <button class="link" type="button" data-editar-conta="${esc(c.id)}">Editar</button> ${btnRemover(c.id, 'removerConta')}</div></div>`;
            }).join('') : '<p class="vazio">Nenhuma conta fixa cadastrada.</p>'}
          </section>

          <section class="secao">
            <h3>Cartões de crédito</h3>
            <p class="apoio-secao">Com os cartões cadastrados, você escolhe o cartão ao lançar no crédito, e cada compra sai do saldo no vencimento da fatura daquele cartão.</p>
            <form class="form-conta" id="f-cartao" novalidate>
              <label class="campo c-nome"><span>Nome do cartão</span><input id="cc-nome" type="text" autocomplete="off" placeholder="Ex.: Nubank" maxlength="30" value="${esc(edC?.nome || '')}"></label>
              <label class="campo"><span>Fecha no dia</span><input id="cc-fecha" type="number" inputmode="numeric" min="1" max="31" placeholder="3" value="${edC?.fecha || ''}"></label>
              <label class="campo"><span>Vence no dia</span><input id="cc-vence" type="number" inputmode="numeric" min="1" max="31" placeholder="10" value="${edC?.vence || ''}"></label>
              <button class="btn" type="submit">${edC ? 'Salvar cartão' : 'Adicionar cartão'}</button>
              ${edC ? '<button class="btn secundario" type="button" id="cc-cancelar">Cancelar edição</button>' : ''}
            </form>
            <div class="msg" id="cc-msg" role="status"></div>
            ${cartoesL.length ? cartoesL.map(c => {
              const gasto = lancs().filter(l => l.forma === 'Crédito' && cartaoDe(l.cartao)?.id === c.id && String(l.data).startsWith(chave)).reduce((s2, l) => s2 + l.valor, 0);
              return `<div class="linha"><div class="esq"><div>${esc(c.nome)}</div><small>Fecha dia ${c.fecha}, vence dia ${c.vence}</small></div><div class="dir"><span class="valor num">${brl(gasto)}</span><small>em ${mesTxt}</small> <button class="link" type="button" data-editar-cartao="${esc(c.id)}">Editar</button> ${btnRemover(c.id, 'removerCartao')}</div></div>`;
            }).join('') : '<p class="vazio">Nenhum cartão cadastrado: compras no crédito saem do saldo no dia da compra.</p>'}
          </section>

          <section class="secao" id="sec-diaadia">
            <h3>Gasto do dia a dia</h3>
            ${(() => { const x = explicarEstimativa(); return `<p class="apoio-secao">É o que o Fluxo usa para prever os dias que ainda não chegaram. ${x.fixo ? `Você definiu ${v(x.valor)} por dia. A estimativa automática daria ${v(x.auto)}.` : `Hoje a estimativa automática é ${v(x.auto)} por dia, com base em ${v(x.base)} de gastos comuns nos ${x.dia} dias deste mês.`} Ficam de fora: contas fixas, moradia, assinaturas e educação, datas futuras, gastos acima de ${v(limitePontual())} e os marcados como pontuais.</p>`; })()}
            <form class="form-linha" id="f-diaadia" novalidate>
              <label class="campo"><span>Valor fixo por dia</span><input id="dd-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 60,00" maxlength="10" value="${aj.diaADia ? aj.diaADia.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"></label>
              <button class="btn" type="submit">Usar este valor</button>
            </form>
            ${aj.diaADia ? '<button class="link" type="button" id="dd-auto">Voltar para a estimativa automática</button>' : ''}
            <div class="msg" id="dd-msg" role="status"></div>
          </section>

          <section class="secao" id="sec-diautil">
            <h3>Fins de semana e feriados</h3>
            <p class="apoio-secao">Quando o dia do salário ou de um variável cai num sábado, domingo ou feriado nacional, o banco costuma pagar no dia útil anterior. Faturas que vencem nesses dias costumam ir para o próximo dia útil.</p>
            <form class="form-linha" id="f-diautil" novalidate>
              <label class="campo"><span>Salário e variáveis</span><select id="du-renda">${[['antes', 'Antecipa para o dia útil anterior'], ['depois', 'Adia para o próximo dia útil'], ['mesmo', 'Mantém o dia']].map(([k, t]) => `<option value="${k}"${prefs().renda === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="campo"><span>Vencimento das faturas</span><select id="du-fatura">${[['depois', 'Adia para o próximo dia útil'], ['antes', 'Antecipa para o dia útil anterior'], ['mesmo', 'Mantém o dia']].map(([k, t]) => `<option value="${k}"${prefs().fatura === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
              <button class="btn" type="submit">Salvar</button>
            </form>
            <div class="msg" id="du-msg" role="status"></div>
          </section>

          <section class="secao" id="sec-ia">
            <h3>Leitura de comprovantes</h3>
            <p class="apoio-secao">Tire uma foto da notinha ou mande o print do comprovante do Pix: a IA lê o valor, a data, o local, a forma de pagamento e sugere a categoria. Você confere e salva. Usa a API da Anthropic, com uma chave sua (cada leitura custa centavos). A chave fica guardada só neste aparelho e a foto vai direto para a API, sem passar pela planilha.</p>
            ${ls.get(K.ia) ? `<p class="apoio-secao">Chave cadastrada neste aparelho (termina em ${esc(String(ls.get(K.ia)).slice(-4))}).</p><button class="btn secundario" type="button" id="ia-remover">Remover chave deste aparelho</button>`
              : `<form class="form-linha" id="f-ia" novalidate>
                  <label class="campo"><span>Chave da API (console.anthropic.com)</span><input id="ia-chave" type="password" autocomplete="off" placeholder="sk-ant-…" maxlength="200"></label>
                  <button class="btn" type="submit">Salvar chave</button>
                </form>`}
            <div class="msg" id="ia-msg" role="status"></div>
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
        if (await gravar(dados.acao, dados.corpo)) { E.editConta = null; E.editCartao = null; E.editRec = null; renderConteudo(); const m2 = $(msgSel); if (m2) { m2.className = 'msg info'; m2.textContent = okTxt; } }
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

    $('#b-nova-entrada').onclick = () => abrirFolha(null, 'entrada');
    $('#f-rec').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#rc-msg', msg => {
      const nome = $('#rc-nome').value.trim(), valor = lerValor($('#rc-valor').value), d2 = dia('#rc-dia');
      const inicio = $('#rc-inicio').value, fim = $('#rc-fim').value;
      if (nome.length < 2) return erro(msg, 'Dê um nome. Ex.: Variável projeto A', '#rc-nome');
      if (!(valor > 0)) return erro(msg, 'Digite o valor previsto.', '#rc-valor');
      if (!d2) return erro(msg, 'Diga o dia em que costuma cair (1 a 31).', '#rc-dia');
      if (!/^\d{4}-\d{2}$/.test(inicio)) return erro(msg, 'Escolha o mês de início.', '#rc-inicio');
      if (fim && fim < inicio) return erro(msg, 'O mês final precisa ser depois do início.', '#rc-fim');
      const corpo = { nome, valor, dia: d2, inicio, fim };
      if (E.editRec) corpo.id = E.editRec;
      return { acao: 'salvarRecorrente', corpo };
    }, edR ? 'Recorrente atualizada.' : 'Recorrente adicionada.'); };
    const dicaRec = () => { $('#rc-dica').textContent = dicaPeriodo($('#rc-inicio').value, $('#rc-fim').value); };
    $('#rc-meses').addEventListener('input', () => {
      const n = Number($('#rc-meses').value), ini = $('#rc-inicio').value;
      if (n >= 1 && /^\d{4}-\d{2}$/.test(ini)) { const [a2, m2] = ini.split('-').map(Number); $('#rc-fim').value = chaveMes(new Date(a2, m2 - 1 + n - 1, 1)); }
      dicaRec();
    });
    ['#rc-inicio', '#rc-fim'].forEach(id => $(id).addEventListener('input', () => { if (id === '#rc-fim') $('#rc-meses').value = ''; dicaRec(); }));
    const rcCanc = $('#rc-cancelar'); if (rcCanc) rcCanc.onclick = () => { E.editRec = null; renderConteudo(); };
    $$('[data-editar-rec]').forEach(b => b.onclick = () => { E.editRec = b.dataset.editarRec; renderConteudo(); $('#sec-recorrentes').scrollIntoView({ behavior: movOk() ? 'smooth' : 'auto', block: 'start' }); $('#rc-nome').focus({ preventScroll: true }); });

    // período da conta: fim direto ou nº de meses
    const atualizarDica = () => { $('#ct-dica').textContent = dicaPeriodo($('#ct-inicio').value, $('#ct-fim').value); };
    $('#ct-meses').addEventListener('input', () => {
      const n = Number($('#ct-meses').value), ini = $('#ct-inicio').value;
      if (n >= 1 && /^\d{4}-\d{2}$/.test(ini)) { const [a2, m2] = ini.split('-').map(Number); const f = new Date(a2, m2 - 1 + n - 1, 1); $('#ct-fim').value = chaveMes(f); }
      atualizarDica();
    });
    ['#ct-inicio', '#ct-fim'].forEach(id => $(id).addEventListener('input', () => { if (id === '#ct-fim') $('#ct-meses').value = ''; atualizarDica(); }));
    $('#ct-forma').addEventListener('change', () => $('.c-cartao').classList.toggle('escondido', !($('#ct-forma').value === 'Crédito' && cartoesL.length)));

    $('#f-conta').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#ct-msg', msg => {
      const nome = $('#ct-nome').value.trim(), valor = lerValor($('#ct-valor').value), d = dia('#ct-dia');
      const inicio = $('#ct-inicio').value, fim = $('#ct-fim').value, forma = $('#ct-forma').value;
      if (nome.length < 2) return erro(msg, 'Dê um nome à conta. Ex.: Aluguel', '#ct-nome');
      if (!(valor > 0)) return erro(msg, 'Digite o valor da conta.', '#ct-valor');
      if (!d) return erro(msg, 'Diga o dia do mês em que ela vence (1 a 31).', '#ct-dia');
      if (!/^\d{4}-\d{2}$/.test(inicio)) return erro(msg, 'Escolha o mês em que a conta começa.', '#ct-inicio');
      if (fim && fim < inicio) return erro(msg, 'O mês final precisa ser depois do mês de início.', '#ct-fim');
      const corpo = { nome, valor, dia: d, categoria: $('#ct-cat').value, forma, inicio, fim, cartao: forma === 'Crédito' ? $('#ct-cartao').value : '' };
      if (E.editConta) corpo.id = E.editConta;
      return { acao: 'salvarConta', corpo };
    }, ed ? 'Conta atualizada.' : 'Conta adicionada.'); };
    const ctCanc = $('#ct-cancelar'); if (ctCanc) ctCanc.onclick = () => { E.editConta = null; renderConteudo(); };
    $$('[data-editar-conta]').forEach(b => b.onclick = () => { E.editConta = b.dataset.editarConta; renderConteudo(); $('#sec-contas').scrollIntoView({ behavior: movOk() ? 'smooth' : 'auto', block: 'start' }); $('#ct-nome').focus({ preventScroll: true }); });

    $('#f-cartao').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#cc-msg', msg => {
      const nome = $('#cc-nome').value.trim(), fecha = dia('#cc-fecha'), vence = dia('#cc-vence');
      if (nome.length < 2) return erro(msg, 'Dê um nome ao cartão. Ex.: Nubank', '#cc-nome');
      if (!fecha) return erro(msg, 'Diga o dia em que a fatura fecha.', '#cc-fecha');
      if (!vence) return erro(msg, 'Diga o dia em que a fatura vence.', '#cc-vence');
      const corpo = { nome, fecha, vence };
      if (E.editCartao) corpo.id = E.editCartao;
      return { acao: 'salvarCartao', corpo };
    }, edC ? 'Cartão atualizado.' : 'Cartão adicionado.'); };
    const ccCanc = $('#cc-cancelar'); if (ccCanc) ccCanc.onclick = () => { E.editCartao = null; renderConteudo(); };
    $$('[data-editar-cartao]').forEach(b => b.onclick = () => { E.editCartao = b.dataset.editarCartao; renderConteudo(); $('#cc-nome').focus(); });

    $('#f-diaadia').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#dd-msg', msg => {
      const valor = lerValor($('#dd-valor').value);
      if (!(valor > 0)) return erro(msg, 'Digite quanto você costuma gastar por dia. Ex.: 60,00', '#dd-valor');
      return { acao: 'salvarAjustes', corpo: { diaADia: { valor } } };
    }, 'Valor salvo. O Fluxo já usa esse valor.'); };
    const ddAuto = $('#dd-auto');
    if (ddAuto) ddAuto.onclick = async () => { ddAuto.disabled = true; try { if (await gravar('salvarAjustes', { diaADia: null })) { renderConteudo(); avisoRapido('Voltou para a estimativa automática.'); } } catch (e) { ddAuto.textContent = e.message; } };

    $('#f-diautil').onsubmit = ev => { ev.preventDefault(); enviarForm(ev.target, '#du-msg', () => ({ acao: 'salvarAjustes', corpo: { preferencias: { renda: $('#du-renda').value, fatura: $('#du-fatura').value, contas: prefs().contas } } }), 'Salvo. O Fluxo já usa as novas datas.'); };
    const fIa = $('#f-ia');
    if (fIa) fIa.onsubmit = ev => {
      ev.preventDefault();
      const k = $('#ia-chave').value.trim(), msg = $('#ia-msg');
      if (!/^sk-ant-[\w-]{20,}$/.test(k)) { msg.className = 'msg erro'; msg.textContent = 'Essa chave não parece uma chave da Anthropic (começa com sk-ant-).'; return; }
      ls.set(K.ia, k); renderConteudo(); avisoRapido('Chave salva neste aparelho. O botão de foto já aparece ao lançar.');
    };
    const iaRem = $('#ia-remover'); if (iaRem) iaRem.onclick = () => { ls.set(K.ia, null); renderConteudo(); avisoRapido('Chave removida deste aparelho.'); };
    const esq = $('#b-esquecer');
    if (esq) esq.onclick = async () => {
      esq.disabled = true;
      const aparelho = ls.get(K.aparelho);
      ls.set(K.aparelho, null);
      api('sair', { aparelho }).catch(() => { });
      renderConteudo();
      avisoRapido('Este aparelho foi esquecido. Na próxima vez, entre com a senha.');
    };

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
    timerVivo = setInterval(() => { if (!document.hidden && Sessao.atual() && ['painel', 'fluxo'].includes(E.aba) && !$('#folha')?.open) carregarDados(); }, 120000);
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
