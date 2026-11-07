/**
 * FINANÇAS PESSOAIS — Formulário + Planilha + API do painel
 * ---------------------------------------------------------
 * 1. Cole este arquivo inteiro em script.google.com (Novo projeto).
 * 2. (Opcional) Ajuste as categorias em CONFIG abaixo.
 * 3. Selecione a função "setup" e clique em Executar. Autorize o acesso.
 * 4. Veja os links e o TOKEN em "Registro de execução".
 * 5. Implantar > Nova implantação > App da Web
 *      Executar como: Eu | Quem pode acessar: Qualquer pessoa
 *    Copie a URL do app da Web (termina em /exec) — ela vai no painel.
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

const ABA = {
  respostas: 'Respostas',
  lanc: 'Lançamentos',
  tetos: 'Tetos',
  resumo: 'Resumo',
  links: 'Links'
};

const TITULO = {
  valor: 'Valor (R$)',
  categoria: 'Categoria',
  forma: 'Forma de pagamento',
  descricao: 'Descrição (opcional)',
  data: 'Data (só se não foi hoje)'
};

/* ============================ SETUP ============================ */

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    mostrarLinks();
    throw new Error('O setup já foi executado. Os links estão no registro acima.');
  }

  // ---------- 1. Formulário ----------
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
    .setTitle(TITULO.categoria)
    .setChoiceValues(CONFIG.categorias)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle(TITULO.forma)
    .setChoiceValues(CONFIG.formasPagamento)
    .setRequired(true);

  form.addTextItem().setTitle(TITULO.descricao);
  form.addDateItem().setTitle(TITULO.data);

  // ---------- 2. Planilha ligada ao formulário ----------
  let ss = SpreadsheetApp.create(CONFIG.nomePlanilha);
  ss.setSpreadsheetTimeZone(CONFIG.fuso);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // A aba de respostas pode demorar alguns segundos para aparecer
  let abaRespostas = null;
  for (let i = 0; i < 10 && !abaRespostas; i++) {
    Utilities.sleep(1000);
    ss = SpreadsheetApp.openById(ss.getId());
    abaRespostas = ss.getSheets().find(s => s.getFormUrl());
  }
  if (abaRespostas) abaRespostas.setName(ABA.respostas);

  const n = CONFIG.categorias.length;
  const moeda = '"R$" #,##0.00';

  // ---------- Aba Lançamentos (base limpa que o painel lê) ----------
  const lanc = ss.insertSheet(ABA.lanc, 0);
  lanc.getRange('A1:F1')
    .setValues([['Data', 'Valor', 'Categoria', 'Forma de pagamento', 'Descrição', 'Origem']])
    .setFontWeight('bold').setBackground('#E8EAF6');
  lanc.setFrozenRows(1);
  lanc.getRange('A2:A').setNumberFormat('dd/MM/yyyy');
  lanc.getRange('B2:B').setNumberFormat(moeda);
  lanc.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.categorias, true).setAllowInvalid(false).build()
  );
  lanc.getRange('D2:D').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.formasPagamento, true).setAllowInvalid(false).build()
  );
  lanc.setColumnWidths(1, 6, 140);

  // ---------- Aba Tetos ----------
  const tetos = ss.insertSheet(ABA.tetos, 1);
  tetos.getRange('A1:B1').setValues([['Categoria', 'Teto mensal (R$)']])
    .setFontWeight('bold').setBackground('#E8EAF6');
  tetos.getRange(2, 1, n, 2).setValues(CONFIG.categorias.map(c => [c, 0]));
  tetos.getRange(2, 2, n, 1).setNumberFormat(moeda).setBackground('#FFF8E1');
  tetos.getRange(n + 3, 1).setValue('👉 Preencha os tetos na coluna amarela.').setFontStyle('italic');
  tetos.setColumnWidths(1, 2, 170);

  // ---------- Aba Resumo (mês atual) ----------
  const res = ss.insertSheet(ABA.resumo, 2);
  res.getRange('A1:A2').setValues([['Início do mês'], ['Fim do mês']]).setFontWeight('bold');
  res.getRange('B1').setFormula('=DATE(YEAR(TODAY()),MONTH(TODAY()),1)');
  res.getRange('B2').setFormula('=EOMONTH(B1,0)');
  res.getRange('B1:B2').setNumberFormat('dd/MM/yyyy');

  res.getRange('A4:E4')
    .setValues([['Categoria', 'Gasto no mês', 'Teto', '% usado', 'Saldo']])
    .setFontWeight('bold').setBackground('#E8EAF6');

  const L = "'" + ABA.lanc + "'";
  const linhas = CONFIG.categorias.map((c, i) => {
    const r = 5 + i;
    return [
      c,
      `=SUMIFS(${L}!$B:$B,${L}!$C:$C,$A${r},${L}!$A:$A,">="&$B$1,${L}!$A:$A,"<"&($B$2+1))`,
      `=IFERROR(VLOOKUP($A${r},Tetos!$A:$B,2,FALSE),0)`,
      `=IF(C${r}>0,B${r}/C${r},"")`,
      `=C${r}-B${r}`
    ];
  });
  res.getRange(5, 1, n, 5).setValues(linhas);

  const ult = 4 + n;
  const tot = ult + 1;
  res.getRange(tot, 1, 1, 5).setValues([[
    'TOTAL', `=SUM(B5:B${ult})`, `=SUM(C5:C${ult})`, `=IF(C${tot}>0,B${tot}/C${tot},"")`, `=C${tot}-B${tot}`
  ]]).setFontWeight('bold').setBackground('#F5F5F5');

  res.getRange(tot + 2, 1, 1, 2).setValues([[
    'Projeção fim do mês', `=B${tot}/DAY(TODAY())*DAY(B2)`
  ]]).setFontWeight('bold');

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

  // ---------- Aba Links (atalhos pré-preenchidos) ----------
  const links = ss.insertSheet(ABA.links, 3);
  links.getRange('A1:B1').setValues([['Atalho', 'Link']]).setFontWeight('bold').setBackground('#E8EAF6');
  const linhasLinks = [['Formulário (geral)', form.getPublishedUrl()]];
  CONFIG.categorias.forEach(c => {
    const url = form.createResponse()
      .withItemResponse(itemCategoria.createResponse(c))
      .toPrefilledUrl();
    linhasLinks.push([c, url]);
  });
  links.getRange(2, 1, linhasLinks.length, 2).setValues(linhasLinks);
  links.setColumnWidth(1, 170);
  links.setColumnWidth(2, 600);

  // Remove abas padrão que sobraram
  const nossas = Object.values(ABA);
  ss.getSheets().forEach(s => {
    if (!nossas.includes(s.getName()) && !s.getFormUrl() && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });
  if (abaRespostas) ss.setActiveSheet(ss.getSheetByName(ABA.resumo));

  // ---------- 3. Gatilho + credenciais ----------
  ScriptApp.newTrigger('aoEnviarFormulario').forForm(form).onFormSubmit().create();

  props.setProperties({
    SHEET_ID: ss.getId(),
    FORM_ID: form.getId(),
    TOKEN: Utilities.getUuid().replace(/-/g, '')
  });

  mostrarLinks();
}

/* ===================== GATILHO DO FORMULÁRIO ===================== */

function aoEnviarFormulario(e) {
  const r = e.response;
  const resp = {};
  r.getItemResponses().forEach(ir => { resp[ir.getItem().getTitle()] = ir.getResponse(); });

  const valor = parseFloat(String(resp[TITULO.valor] || '0').trim().replace(',', '.'));

  // Data: a informada no formulário ou a do envio. Meio-dia evita erro de fuso.
  const ymd = resp[TITULO.data]
    ? String(resp[TITULO.data])
    : Utilities.formatDate(r.getTimestamp(), CONFIG.fuso, 'yyyy-MM-dd');
  const [y, m, d] = ymd.split('-').map(Number);
  const data = new Date(y, m - 1, d, 12);

  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  ss.getSheetByName(ABA.lanc).appendRow([
    data,
    valor,
    resp[TITULO.categoria] || 'Outros',
    resp[TITULO.forma] || '',
    resp[TITULO.descricao] || '',
    'Formulário'
  ]);
}

/* ========================= API DO PAINEL ========================= */

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const token = e && e.parameter ? e.parameter.token : '';
  if (!token || token !== props.getProperty('TOKEN')) {
    return json_({ erro: 'nao_autorizado' });
  }

  const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));

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

  return json_({ atualizado: new Date().toISOString(), lancamentos, tetos });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ UTIL ============================ */

function mostrarLinks() {
  const p = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
  const form = FormApp.openById(p.getProperty('FORM_ID'));
  Logger.log('📋 Formulário (para lançar): ' + form.getPublishedUrl());
  Logger.log('✏️  Editar formulário: ' + form.getEditUrl());
  Logger.log('📊 Planilha: ' + ss.getUrl());
  Logger.log('🔑 TOKEN do painel: ' + p.getProperty('TOKEN'));
  Logger.log('➡️  Agora: Implantar > Nova implantação > App da Web (Qualquer pessoa) e copie a URL /exec.');
}

/** Gera um token novo (use se o link do painel vazar). */
function trocarToken() {
  const novo = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', novo);
  Logger.log('🔑 Novo TOKEN: ' + novo);
}
