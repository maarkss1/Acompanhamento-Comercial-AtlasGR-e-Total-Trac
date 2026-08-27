// ============================================================================
// Data Trust Score — Wave 2.1 (Agente 03, fechamento do Sprint 01)
//
// Especificação completa e justificativa da fórmula, granularidade, pesos e
// limitações: docs/intelligence-hub-cpi/execucao/wave-02/03_DATA_TRUST_SCORE_FORMALIZADO.md
//
// STATUS: implementado, mas NÃO registrado em nenhum menu/relatório do
// catálogo (js/config.js) e NÃO incluído em nenhum <script src> de página
// HTML ainda — decisão de UX/exposição fica para uma wave futura. Este
// arquivo é aditivo: não modifica nenhuma função existente, não altera
// comportamento de nenhum relatório já publicado (qualidade_crm,
// auditoria_sdr, decisao_final_sdr etc. continuam exatamente como estavam).
//
// Reaproveita a MESMA base de dados que "qualidade_crm" já usa
// (baseDealsCatalogo + baseLeadsCatalogo, ambos em js/catalogo-relatorios.js)
// e a mesma semântica de estágio/lead já validada em js/jornada.js
// (semanticaDeal, ehEstagioPiloto) e js/catalogo-relatorios.js (semanticaLead).
//
// Combina 3 dimensões por entidade (Negócios, Leads):
//   - Completude   (mesmo padrão de "checks" TOTAL/FALTANTES de qualidade_crm)
//   - Consistência (reaproveita os sinais de data futura/inconsistente já
//                    introduzidos na correção de produção da Wave 1 —
//                    ver WAVE_01_CORRECOES_PRODUCAO.md item 4 — mais 2 regras
//                    novas de mesma natureza: ordem cronológica invertida e
//                    lead "convertido" sem negócio correspondente no extrato)
//   - Atualidade   (freshness do último toque no registro, escopada a
//                    registros ABERTOS; para Leads reaproveita literalmente
//                    o limiar de 7 dias já usado em auditoria_sdr)
//
// Todos os pesos e limiares numéricos aqui são DEFAULTS PROPOSTOS, não
// ratificados pela diretoria/negócio — mesma ressalva que o código já faz
// para outros limiares não validados (coverage 2x/3x, aging 45 dias etc.).
// Ver seção "Riscos e limitações" no documento acima.
// ============================================================================

// ---- pesos e limiares (ajustáveis; ver justificativa no documento) --------
const DTS_PESOS_PADRAO = { completude: 0.45, consistencia: 0.30, atualidade: 0.25 };
const DTS_LIMIAR_DIAS_SEM_TOQUE_NEGOCIO = 30; // não validado com a diretoria
const DTS_LIMIAR_DIAS_SEM_TOQUE_LEAD = 7;     // igual ao já usado em auditoria_sdr

// ---- utilitários pequenos e isolados (não reaproveitam nomes existentes) --
function dtsDiasDesde(dataBruta, agora) {
  const iso = (typeof parteDataISO === "function") ? parteDataISO(dataBruta) : "";
  if (!iso) return null;
  return Math.floor((agora - new Date(`${iso}T12:00:00`)) / 86400000);
}

// Data "de hoje" no calendário local do navegador (mesma lógica implícita de
// `new Date()` já usada em decisao_final_sdr/cockpit.js) — não normaliza
// fuso horário, mesma limitação de "-03:00 hardcoded" já registrada na Wave 1.
function dtsHojeISO(agora) {
  const y = agora.getFullYear(), m = String(agora.getMonth() + 1).padStart(2, "0"), d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dtsCheck(entidade, campo, dimensao, total, ocorrencias) {
  const scorePct = total ? Math.round((1 - ocorrencias / total) * 10000) / 100 : 100;
  return { ENTIDADE: entidade, CAMPO: campo, DIMENSAO: dimensao, TOTAL: total, OCORRENCIAS: ocorrencias, SCORE_PCT: scorePct };
}

function dtsMediaChecks(checks) {
  if (!checks.length) return null;
  return Math.round((checks.reduce((a, c) => a + c.SCORE_PCT, 0) / checks.length) * 100) / 100;
}

// Combina as 3 dimensões com renormalização de peso quando uma dimensão não
// é aplicável (ex.: atualidade sem nenhum registro aberto) — segue o mesmo
// princípio já declarado em js/cockpit.js:16-18 ("nunca 0 silencioso");
// uma dimensão inaplicável é omitida do cálculo, não tratada como 0.
function dtsComporScore(dimensoes, pesos) {
  let somaPeso = 0, somaScore = 0;
  for (const chave of Object.keys(pesos)) {
    const v = dimensoes[chave];
    if (v === null || v === undefined) continue;
    somaPeso += pesos[chave];
    somaScore += v * pesos[chave];
  }
  if (somaPeso === 0) return null;
  return Math.round((somaScore / somaPeso) * 100) / 100;
}

function dtsGrade(scorePct) {
  if (scorePct === null || scorePct === undefined) return "N/A";
  if (scorePct >= 90) return "A";
  if (scorePct >= 75) return "B";
  if (scorePct >= 60) return "C";
  return "D";
}

// ---- análise por registro (Negócios) ---------------------------------------
// Espelha exatamente os campos/regras já usados em qualidade_crm
// (js/catalogo-relatorios.js:329-347) para completude, e no clamp de datas
// já corrigido em decisao_final_sdr/extrator.js (Wave 1) para consistência.
function dtsAnalisarNegocio(d, meta, agora, hojeISO) {
  const cat = String(d.CATEGORY_ID ?? "");
  const stageMeta = meta?.estagios?.[cat]?.[String(d.STAGE_ID)] || {};
  const semantica = semanticaDeal(d, stageMeta);
  const piloto = ehEstagioPiloto(d.STAGE_ID, stageMeta.label);
  const aberto = semantica === "process" && !piloto;

  const semVinculo = !idBitrixValido(d.COMPANY_ID) && !idBitrixValido(d.CONTACT_ID) && !idBitrixValido(d.LEAD_ID);
  const semOrigem = !String(d.SOURCE_ID || "").trim();
  const semResponsavel = !idBitrixValido(d.ASSIGNED_BY_ID);
  const semValor = !(Number(d.OPPORTUNITY) > 0);
  const semFechamentoEsperado = aberto && !parteDataISO(d.CLOSEDATE);

  const diasMovidoBruto = dtsDiasDesde(d.MOVED_TIME, agora);
  const movidoNoFuturo = diasMovidoBruto !== null && diasMovidoBruto < 0;

  const dCriado = parteDataISO(d.DATE_CREATE), dModificado = parteDataISO(d.DATE_MODIFY);
  const modificadoAntesDeCriado = !!dCriado && !!dModificado && dModificado < dCriado;

  const closedateISO = parteDataISO(d.CLOSEDATE);
  const fechamentoEsperadoVencido = aberto && !!closedateISO && closedateISO < hojeISO;

  const toques = [d.DATE_MODIFY, d.MOVED_TIME, d.LAST_ACTIVITY_TIME].map((v) => parteDataISO(v)).filter(Boolean).sort();
  const ultimoToqueISO = toques.length ? toques[toques.length - 1] : "";
  const diasSemToque = ultimoToqueISO ? dtsDiasDesde(ultimoToqueISO, agora) : null;

  return {
    id: d.ID, aberto,
    responsavel: idBitrixValido(d.ASSIGNED_BY_ID) ? (typeof nomeUsuario === "function" ? (nomeUsuario(d.ASSIGNED_BY_ID) || `ID ${d.ASSIGNED_BY_ID}`) : `ID ${d.ASSIGNED_BY_ID}`) : "Sem responsável",
    semVinculo, semOrigem, semResponsavel, semValor, semFechamentoEsperado,
    movidoNoFuturo, modificadoAntesDeCriado, fechamentoEsperadoVencido,
    diasSemToque, semDataToque: diasSemToque === null,
    algumProblemaCompletude: semVinculo || semOrigem || semResponsavel || semValor || semFechamentoEsperado
  };
}

// ---- análise por registro (Leads) ------------------------------------------
// Espelha os campos já usados em qualidade_crm/auditoria_sdr para Leads.
// NOTA IMPORTANTE (achado verificado nesta tarefa, não corrigido aqui por
// estar fora de escopo — ver documento): o código já existente em
// qualidade_crm/auditoria_sdr chama `valoresMulticampo(l.PHONE)` e
// `valoresMulticampo(l.EMAIL)` com 1 argumento, mas a função é declarada
// como `valoresMulticampo(registro, campo)` (js/jornada.js:59) — chamada com
// 1 argumento, `campo` fica `undefined` e a função SEMPRE retorna `[]`,
// fazendo o check "Telefone ou e-mail" reportar 100% de faltantes
// independentemente do dado real. Aqui a função é chamada corretamente com
// os 2 argumentos, então este check de completude de Leads É confiável
// nesta implementação (diferente do check homônimo em qualidade_crm hoje).
function dtsAnalisarLead(l, agora, leadIdsComNegocio) {
  const semantica = (typeof semanticaLead === "function") ? semanticaLead(l) : "process";
  const aberto = semantica === "process";

  const semOrigem = !String(l.SOURCE_ID || "").trim();
  const semResponsavel = !idBitrixValido(l.ASSIGNED_BY_ID);
  const semNome = !String(l.COMPANY_TITLE || l.NAME || l.TITLE || "").trim();
  const semContato = !(valoresMulticampo(l, "PHONE").length || valoresMulticampo(l, "EMAIL").length);

  const diasMovidoBruto = dtsDiasDesde(l.MOVED_TIME || l.DATE_CREATE, agora);
  const movidoNoFuturo = diasMovidoBruto !== null && diasMovidoBruto < 0;

  const dCriado = parteDataISO(l.DATE_CREATE), dModificado = parteDataISO(l.DATE_MODIFY);
  const modificadoAntesDeCriado = !!dCriado && !!dModificado && dModificado < dCriado;

  const convertido = semantica === "success";
  const convertidoSemNegocio = convertido && idBitrixValido(l.ID) && !leadIdsComNegocio.has(idBitrixString(l.ID));

  const toques = [l.DATE_MODIFY, l.LAST_ACTIVITY_TIME, l.MOVED_TIME].map((v) => parteDataISO(v)).filter(Boolean).sort();
  const ultimoToqueISO = toques.length ? toques[toques.length - 1] : "";
  const diasSemToque = ultimoToqueISO ? dtsDiasDesde(ultimoToqueISO, agora) : null;

  return {
    id: l.ID, aberto, convertido,
    responsavel: idBitrixValido(l.ASSIGNED_BY_ID) ? (typeof nomeUsuario === "function" ? (nomeUsuario(l.ASSIGNED_BY_ID) || `ID ${l.ASSIGNED_BY_ID}`) : `ID ${l.ASSIGNED_BY_ID}`) : "Sem responsável",
    semOrigem, semResponsavel, semNome, semContato,
    movidoNoFuturo, modificadoAntesDeCriado, convertidoSemNegocio,
    diasSemToque, semDataToque: diasSemToque === null,
    algumProblemaCompletude: semOrigem || semResponsavel || semNome || semContato
  };
}

// ---- agregação por entidade -------------------------------------------------
function dtsAgregarNegocios(deals, analises) {
  const total = deals.length;
  const abertos = analises.filter((a) => a.aberto);

  const checksCompletude = [
    dtsCheck("Negócios", "Vínculo cliente", "completude", total, analises.filter((a) => a.semVinculo).length),
    dtsCheck("Negócios", "SOURCE_ID", "completude", total, analises.filter((a) => a.semOrigem).length),
    dtsCheck("Negócios", "ASSIGNED_BY_ID", "completude", total, analises.filter((a) => a.semResponsavel).length),
    dtsCheck("Negócios", "OPPORTUNITY > 0", "completude", total, analises.filter((a) => a.semValor).length),
    dtsCheck("Negócios abertos", "CLOSEDATE", "completude", abertos.length, abertos.filter((a) => a.semFechamentoEsperado).length)
  ];

  const checksConsistencia = [
    dtsCheck("Negócios", "MOVED_TIME não pode estar no futuro", "consistencia", total, analises.filter((a) => a.movidoNoFuturo).length),
    dtsCheck("Negócios", "DATE_MODIFY não pode ser anterior a DATE_CREATE", "consistencia", total, analises.filter((a) => a.modificadoAntesDeCriado).length),
    dtsCheck("Negócios abertos", "CLOSEDATE não deveria estar vencido", "consistencia", abertos.length, abertos.filter((a) => a.fechamentoEsperadoVencido).length)
  ];

  const checksAtualidade = [
    dtsCheck("Negócios abertos", `Toque em até ${DTS_LIMIAR_DIAS_SEM_TOQUE_NEGOCIO} dias`, "atualidade", abertos.length,
      abertos.filter((a) => a.semDataToque || a.diasSemToque > DTS_LIMIAR_DIAS_SEM_TOQUE_NEGOCIO).length)
  ];

  return {
    total,
    totalAbertos: abertos.length,
    completude: { checks: checksCompletude, scorePct: dtsMediaChecks(checksCompletude) },
    consistencia: { checks: checksConsistencia, scorePct: dtsMediaChecks(checksConsistencia) },
    atualidade: { checks: abertos.length ? checksAtualidade : [], scorePct: abertos.length ? dtsMediaChecks(checksAtualidade) : null }
  };
}

function dtsAgregarLeads(leads, analises) {
  const total = leads.length;
  const abertos = analises.filter((a) => a.aberto);
  const convertidos = analises.filter((a) => a.convertido);

  const checksCompletude = [
    dtsCheck("Leads", "SOURCE_ID", "completude", total, analises.filter((a) => a.semOrigem).length),
    dtsCheck("Leads", "ASSIGNED_BY_ID", "completude", total, analises.filter((a) => a.semResponsavel).length),
    dtsCheck("Leads", "Empresa / nome", "completude", total, analises.filter((a) => a.semNome).length),
    dtsCheck("Leads", "Telefone ou e-mail", "completude", total, analises.filter((a) => a.semContato).length)
  ];

  const checksConsistencia = [
    dtsCheck("Leads", "MOVED_TIME/DATE_CREATE não pode estar no futuro", "consistencia", total, analises.filter((a) => a.movidoNoFuturo).length),
    dtsCheck("Leads", "DATE_MODIFY não pode ser anterior a DATE_CREATE", "consistencia", total, analises.filter((a) => a.modificadoAntesDeCriado).length),
    dtsCheck("Leads convertidos", "Negócio correspondente no extrato (LEAD_ID)", "consistencia", convertidos.length, convertidos.filter((a) => a.convertidoSemNegocio).length)
  ];

  const checksAtualidade = [
    dtsCheck("Leads abertos", `Toque em até ${DTS_LIMIAR_DIAS_SEM_TOQUE_LEAD} dias`, "atualidade", abertos.length,
      abertos.filter((a) => a.semDataToque || a.diasSemToque > DTS_LIMIAR_DIAS_SEM_TOQUE_LEAD).length)
  ];

  return {
    total,
    totalAbertos: abertos.length,
    completude: { checks: checksCompletude, scorePct: dtsMediaChecks(checksCompletude) },
    consistencia: { checks: checksConsistencia, scorePct: dtsMediaChecks(checksConsistencia) },
    atualidade: { checks: abertos.length ? checksAtualidade : [], scorePct: abertos.length ? dtsMediaChecks(checksAtualidade) : null }
  };
}

// ---- quebra por responsável (apenas completude — ver limitações no doc) ---
function dtsPorResponsavel(analises) {
  const g = {};
  analises.forEach((a) => {
    const nome = a.responsavel || "Sem responsável";
    if (!g[nome]) g[nome] = { RESPONSAVEL: nome, TOTAL: 0, OCORRENCIAS: 0 };
    g[nome].TOTAL++;
    if (a.algumProblemaCompletude) g[nome].OCORRENCIAS++;
  });
  return Object.values(g)
    .map((x) => ({ ...x, SCORE_PCT: x.TOTAL ? Math.round((1 - x.OCORRENCIAS / x.TOTAL) * 10000) / 100 : 100 }))
    .sort((a, b) => a.SCORE_PCT - b.SCORE_PCT);
}

// ---- função pura principal (testável sem rede) -----------------------------
// db = retorno de baseDealsCatalogo(webhook, false)  -> {meta, deals, empresas, busca}
// lb = retorno de baseLeadsCatalogo(webhook)          -> {leads, statusMap, statusLeads, busca}
function montarDataTrustScore(db, lb, opcoes = {}) {
  const pesos = opcoes.pesos || DTS_PESOS_PADRAO;
  const agora = opcoes.agora instanceof Date ? opcoes.agora : new Date();
  const deals = db?.deals || [];
  const leads = lb?.leads || [];

  const hojeISO = dtsHojeISO(agora);
  const analisesNegocios = deals.map((d) => dtsAnalisarNegocio(d, db.meta, agora, hojeISO));
  const leadIdsComNegocio = new Set(deals.filter((d) => idBitrixValido(d.LEAD_ID)).map((d) => idBitrixString(d.LEAD_ID)));
  const analisesLeads = leads.map((l) => dtsAnalisarLead(l, agora, leadIdsComNegocio));

  const negocios = dtsAgregarNegocios(deals, analisesNegocios);
  const leadsAgr = dtsAgregarLeads(leads, analisesLeads);

  negocios.score = dtsComporScore({ completude: negocios.completude.scorePct, consistencia: negocios.consistencia.scorePct, atualidade: negocios.atualidade.scorePct }, pesos);
  negocios.grade = dtsGrade(negocios.score);
  leadsAgr.score = dtsComporScore({ completude: leadsAgr.completude.scorePct, consistencia: leadsAgr.consistencia.scorePct, atualidade: leadsAgr.atualidade.scorePct }, pesos);
  leadsAgr.grade = dtsGrade(leadsAgr.score);

  const pesoNeg = deals.length, pesoLead = leads.length;
  const globalScore = (pesoNeg + pesoLead)
    ? Math.round(((negocios.score || 0) * pesoNeg + (leadsAgr.score || 0) * pesoLead) / (pesoNeg + pesoLead) * 100) / 100
    : null;

  const camposCriticos = [
    ...negocios.completude.checks, ...negocios.consistencia.checks, ...negocios.atualidade.checks,
    ...leadsAgr.completude.checks, ...leadsAgr.consistencia.checks, ...leadsAgr.atualidade.checks
  ].sort((a, b) => a.SCORE_PCT - b.SCORE_PCT);

  return {
    geradoEm: agora.toISOString(),
    pesos,
    limiares: { diasSemToqueNegocio: DTS_LIMIAR_DIAS_SEM_TOQUE_NEGOCIO, diasSemToqueLead: DTS_LIMIAR_DIAS_SEM_TOQUE_LEAD },
    entidades: {
      negocios: { entidade: "Negócios", ...negocios },
      leads: { entidade: "Leads", ...leadsAgr }
    },
    global: { score: globalScore, grade: dtsGrade(globalScore) },
    porResponsavel: {
      negocios: dtsPorResponsavel(analisesNegocios),
      leads: dtsPorResponsavel(analisesLeads)
    },
    camposCriticos,
    limitacoes: [
      "Tendência ao longo do tempo e 'principais causas de queda' (variação vs. período anterior) não são calculáveis: não existe camada de staging/histórico persistente de negócios/leads brutos (só o forecast semanal da AtlasGR é persistido). 'camposCriticos' é um ranking do estado atual (snapshot), não uma comparação temporal.",
      "'Score por fonte' (AtlasGR vs. Total Trac) não é uma dimensão computada internamente: cada chamada desta função já opera sobre o webhook de uma única empresa/portal (mesmo padrão de segregação usado no resto do catálogo) — rodar a função uma vez por empresa já produz o score por fonte.",
      "Score por responsável considera apenas a dimensão de completude (não consistência/atualidade) — ver justificativa no documento.",
      "Score por negócio/lead individual não é produzido como saída agregada nesta função (ver granularidade no documento) — os sinais por registro (dtsAnalisarNegocio/dtsAnalisarLead) já existem internamente e poderiam alimentar uma extensão futura.",
      "Pesos (completude 45% / consistência 30% / atualidade 25%) e limiares de dias sem toque (30 para Negócios, 7 para Leads, este último herdado de auditoria_sdr) são defaults propostos, não ratificados pela diretoria/negócio.",
      "'Consistência' cobre apenas as 3 (Negócios) + 3 (Leads) regras de contradição lógica já identificadas em código (datas futuras, ordem cronológica invertida, lead convertido sem negócio); não inclui duplicidade de Empresas/Negócios (relatório 'duplicidades', que exige buscar crm.company.list — fora da base de qualidade_crm) nem duplicidade de Leads (gap já registrado na Wave 1, ainda não implementado em nenhum relatório)."
    ]
  };
}

// ---- wrapper assíncrono: busca a MESMA base que qualidade_crm usa ---------
async function calcularDataTrustScore(webhook, opcoes = {}) {
  const [db, lb] = await Promise.all([baseDealsCatalogo(webhook, false), baseLeadsCatalogo(webhook)]);
  return montarDataTrustScore(db, lb, opcoes);
}
