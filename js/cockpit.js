// ---------------------------------------------------------------------------
// Cockpit Comercial Executivo
// ---------------------------------------------------------------------------
// Nova visão (landing) da mesma ferramenta. Não duplica fórmulas de negócio:
// reaproveita os mesmos helpers já usados pelo Forecast semanal e pelo
// Catálogo de relatórios (js/jornada.js, js/catalogo-relatorios.js, js/config.js):
// semanticaDeal, ehEstagioPiloto, probabilidadeFallbackForecast,
// classificarBucketForecast, baseDealsCatalogo, enriquecerDealCatalogo,
// dentroPeriodoCatalogo, metaMensalPadrao, tabelaRelatorio, moedaRelatorio etc.
//
// Regras seguidas (ver AUDITORIA_ESTADO_ATUAL.md / prompt mestre):
// - Pipeline != Forecast: nunca mostramos "Pipeline Total" como número de
//   previsão de fechamento — ficam em blocos e cores separados.
// - Nenhum valor de exemplo hardcoded: tudo vem de cálculo sobre os negócios
//   extraídos do Bitrix nesta sessão.
// - Quando um número não pode ser calculado com confiança (ex: sem meta
//   informada, sem CLOSEDATE, amostra vazia), mostramos "não disponível" —
//   nunca 0 silencioso.
// - Fonte de meta: campos editáveis, pré-preenchidos com
//   METAS_FORECAST_MENSAL_PADRAO (js/config.js) só como ponto de partida.

let cockpitState = {
  carregando: false,
  ultimaAtualizacao: null,
  deals: [],           // negócios Comercial (CATEGORY_ID=0) já enriquecidos (_SEMANTICA, _ESTAGIO, ...)
  dealsFiltrados: [],  // após filtro de vendedor/origem
  meta: null,           // metadados de funil/estágio (buscarMetadadosFunisEEstagios)
  periodo: { inicio: "", fim: "" },
};

// Guarda, por card clicável, a lista de negócios que compõe aquele número —
// é a base do drill-down (requisito 9 do Cockpit).
let cockpitDrill = {};

function cockpitEl(id) { return document.getElementById(id); }

// ---------------------------------------------------------------------------
// Inicialização (chamada por js/app.js)
// ---------------------------------------------------------------------------
function iniciarCockpitExecutivo() {
  const hojeISO = formatarDataISO(new Date());
  const metaInput = cockpitEl("cockpitMetaMensal");
  if (metaInput && !metaInput.value) {
    const padrao = metaMensalPadrao(hojeISO);
    if (padrao) metaInput.value = padrao;
  }
  // Metas M/M+1/M+2/M+3 pré-preenchidas com METAS_FORECAST_MENSAL_PADRAO —
  // fonte local e editável, não depende de outra plataforma (requisito do escopo).
  for (let i = 0; i < 4; i++) {
    const d = new Date(hojeISO + "T12:00:00");
    d.setMonth(d.getMonth() + i);
    const mesISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const input = cockpitEl(`cockpitMetaM${i}`);
    if (input && !input.value) {
      const padrao = metaMensalPadrao(mesISO);
      if (padrao) input.value = padrao;
    }
  }
  atualizarRelogioCockpit();
}

function atualizarRelogioCockpit() {
  const el = cockpitEl("cockpitUltimaAtualizacao");
  if (!el) return;
  if (!cockpitState.ultimaAtualizacao) {
    el.textContent = "Última atualização: ainda não carregado nesta sessão.";
    return;
  }
  const d = cockpitState.ultimaAtualizacao;
  const dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
  el.textContent = `Última atualização: ${dd}/${mm}/${d.getFullYear()} ${hh}:${mi} · Fonte: Bitrix24`;
}

// ---------------------------------------------------------------------------
// Filtros (período / vendedor / origem / produto)
// ---------------------------------------------------------------------------
function cockpitPeriodoFiltro() {
  const preset = cockpitEl("cockpitPeriodoPreset")?.value || "mensal";
  if (preset === "personalizado") {
    return {
      inicio: cockpitEl("cockpitDataInicio")?.value || "",
      fim: cockpitEl("cockpitDataFim")?.value || "",
    };
  }
  const intervalo = calcularIntervaloPreset(preset) || { inicio: "", fim: "" };
  return intervalo;
}

function aoTrocarPeriodoCockpit() {
  const preset = cockpitEl("cockpitPeriodoPreset")?.value;
  document.querySelectorAll(".cockpit-periodo-custom").forEach((el) => el.classList.toggle("oculto", preset !== "personalizado"));
}

async function carregarVendedoresCockpit() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  try {
    const usuarios = await carregarListaPaginada(webhook, "user.get", {});
    const sel = cockpitEl("cockpitVendedor");
    if (!sel) return;
    const anterior = sel.value;
    sel.innerHTML = '<option value="">Todos os vendedores</option>';
    usuarios.slice().sort((a, b) => `${a.NAME || ""} ${a.LAST_NAME || ""}`.localeCompare(`${b.NAME || ""} ${b.LAST_NAME || ""}`))
      .forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.ID;
        opt.textContent = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() + ` (ID ${u.ID})`;
        sel.appendChild(opt);
      });
    if ([...sel.options].some((o) => o.value === anterior)) sel.value = anterior;
  } catch (e) {
    mostrarErro("Não consegui carregar a lista de vendedores para o Cockpit.\n\nDetalhe técnico: " + e.message);
  }
}

async function carregarOrigensCockpit() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  try {
    const origens = await mapaOrigensRelatorio(webhook);
    const sel = cockpitEl("cockpitOrigem");
    if (!sel) return;
    const anterior = sel.value;
    sel.innerHTML = '<option value="">Todas as origens</option>';
    Object.entries(origens).forEach(([id, nome]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = nome;
      sel.appendChild(opt);
    });
    if ([...sel.options].some((o) => o.value === anterior)) sel.value = anterior;
  } catch (e) {
    mostrarErro("Não consegui carregar a lista de origens para o Cockpit.\n\nDetalhe técnico: " + e.message);
  }
}

// Filtro de produto: não existe infraestrutura de filtro por produto nos
// relatórios do catálogo (ver AUDITORIA_ESTADO_ATUAL.md, seção 7) porque
// crm.deal.productrows.get é uma chamada por negócio (N+1, caro). Para não
// pagar esse custo em todo carregamento do Cockpit, o filtro de produto aqui
// é opcional/sob demanda: só busca produtos quando o usuário efetivamente
// filtra por um texto, e só para o conjunto de negócios já carregado.
async function aplicarFiltroProdutoCockpit() {
  const termo = (cockpitEl("cockpitProduto")?.value || "").trim();
  const status = cockpitEl("cockpitProdutoStatus");
  if (!termo) {
    cockpitState.dealsFiltrados = cockpitFiltrarPorVendedorOrigem(cockpitState.deals);
    if (status) status.textContent = "";
    renderizarCockpit();
    return;
  }
  const webhook = document.getElementById("webhook").value.trim();
  if (!cockpitState.deals.length) { mostrarErro("Clique em \"Atualizar agora\" antes de filtrar por produto."); return; }
  if (status) status.textContent = "Buscando produtos dos negócios carregados (pode levar alguns segundos)...";
  const base = cockpitFiltrarPorVendedorOrigem(cockpitState.deals);
  const normTermo = normalizarTextoChave(termo);
  const comProduto = [];
  for (let i = 0; i < base.length; i++) {
    if (extracaoCancelada) break;
    const d = base[i];
    try {
      const body = await bitrixFetchComRetentativa(`${webhook.replace(/\/$/, "")}/crm.deal.productrows.get.json?id=${encodeURIComponent(d.ID)}`);
      const linhas = body.result || [];
      if (linhas.some((x) => normalizarTextoChave(x.PRODUCT_NAME || "").includes(normTermo))) comProduto.push(d);
    } catch (e) { /* ignora negócio com erro pontual, não interrompe o filtro */ }
    await aguardar(60);
  }
  cockpitState.dealsFiltrados = comProduto;
  if (status) status.textContent = `${comProduto.length} negócio(s) com produto correspondente a "${escapeHtmlRelatorio(termo)}" entre os ${base.length} carregados.`;
  renderizarCockpit();
}

// Vendedor/Origem já vieram na extração (só o Comercial é buscado); trocar o
// filtro não precisa de nova ida ao Bitrix, só reaplica sobre o cache local.
function cockpitReaplicarFiltros() {
  if (!cockpitState.deals.length) return;
  const termo = (cockpitEl("cockpitProduto")?.value || "").trim();
  if (termo) { aplicarFiltroProdutoCockpit(); return; }
  cockpitState.dealsFiltrados = cockpitFiltrarPorVendedorOrigem(cockpitState.deals);
  renderizarCockpit();
}

function cockpitFiltrarPorVendedorOrigem(deals) {
  const vendedor = cockpitEl("cockpitVendedor")?.value || "";
  const origem = cockpitEl("cockpitOrigem")?.value || "";
  return deals.filter((d) => {
    if (vendedor && idBitrixString(d.ASSIGNED_BY_ID) !== String(vendedor)) return false;
    if (origem && String(d.SOURCE_ID || "") !== String(origem)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Carregamento principal
// ---------------------------------------------------------------------------
async function atualizarCockpit() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  if (cockpitState.carregando) return;
  cockpitState.carregando = true;
  esconderErro();
  extracaoCancelada = false;
  const btn = cockpitEl("cockpitBtnAtualizar");
  if (btn) btn.disabled = true;
  atualizarStatus("Cockpit: buscando negócios do funil Comercial...");
  try {
    const base = await baseDealsCatalogo(webhook, true); // somenteComercial=true → CATEGORY_ID 0
    const enriquecidos = base.deals.map((d) => enriquecerDealCatalogo(d, base));
    cockpitState.deals = enriquecidos;
    cockpitState.dealsFiltrados = cockpitFiltrarPorVendedorOrigem(enriquecidos);
    cockpitState.meta = base.meta;
    cockpitState.periodo = cockpitPeriodoFiltro();
    cockpitState.ultimaAtualizacao = new Date();
    const filtroProduto = cockpitEl("cockpitProduto")?.value?.trim();
    if (filtroProduto) {
      await aplicarFiltroProdutoCockpit();
    } else {
      renderizarCockpit();
    }
    atualizarRelogioCockpit();
    atualizarStatus(`Cockpit atualizado: ${enriquecidos.length} negócio(s) do Comercial carregado(s).`);
  } catch (e) {
    mostrarErro("Não foi possível atualizar o Cockpit Executivo.\n\nDetalhe técnico: " + e.message);
  } finally {
    cockpitState.carregando = false;
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Cálculos (reaproveitando fórmulas já existentes — não redefine forecast)
// ---------------------------------------------------------------------------

function cockpitMesAtual() {
  const hojeISO = formatarDataISO(new Date());
  const [ano, mes] = hojeISO.split("-").map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = formatarDataISO(new Date(ano, mes, 0));
  return { inicio, fim, referencia: hojeISO, hojeISO };
}

// Classifica um negócio aberto (não-piloto) usando exatamente a mesma lógica
// do Forecast semanal/mensal: probabilidade do Bitrix quando existir, senão
// probabilidadeFallbackForecast; bucket via classificarBucketForecast.
function cockpitClassificarAberto(d) {
  const pr = Number(d.PROBABILITY);
  const usaBitrix = Number.isFinite(pr) && pr > 0 && pr <= 100;
  const prob = usaBitrix ? pr : probabilidadeFallbackForecast(d._ESTAGIO, d._SEMANTICA);
  const bucket = classificarBucketForecast(prob, d._SEMANTICA);
  return { prob, bucket, ponderado: d._VALOR * prob / 100 };
}

function cockpitCalcular() {
  const deals = cockpitState.dealsFiltrados || [];
  const mes = cockpitMesAtual();
  const drill = {};

  // -------------------- A) Resultado do Mês (sempre mês-calendário atual) --
  const ganhosMes = deals.filter((d) => d._SEMANTICA === "success" && dentroPeriodoCatalogo(d._FECHAMENTO, mes));
  const fechadoMes = ganhosMes.reduce((a, d) => a + d._VALOR, 0);
  const metaMensal = Number(cockpitEl("cockpitMetaMensal")?.value) || 0;
  const pctMeta = metaMensal > 0 ? Math.round((fechadoMes / metaMensal) * 1000) / 10 : null;
  const gapMeta = metaMensal > 0 ? Math.max(0, metaMensal - fechadoMes) : null;
  const ticketMedioMes = ganhosMes.length ? fechadoMes / ganhosMes.length : null;
  drill.resultadoMesFechado = ganhosMes;
  drill.resultadoMesGap = ganhosMes; // mesmo conjunto: o que falta é sobre o que já foi fechado

  // -------------------- B) Forecast (Commit / Best Case / Pipeline / Gap) --
  const abertosMes = deals.filter((d) => d._SEMANTICA === "process" && !ehEstagioPiloto(d.STAGE_ID, d._ESTAGIO) && dentroPeriodoCatalogo(d.CLOSEDATE, mes));
  let commit = 0, bestCase = 0, pipelineForecast = 0, ponderado = 0;
  const linhasCommit = [], linhasBest = [], linhasPipe = [];
  abertosMes.forEach((d) => {
    const { bucket, ponderado: pond } = cockpitClassificarAberto(d);
    ponderado += pond;
    if (bucket === "Commit") { commit += d._VALOR; linhasCommit.push(d); }
    else if (bucket === "Best Case") { bestCase += d._VALOR; linhasBest.push(d); }
    else { pipelineForecast += d._VALOR; linhasPipe.push(d); }
  });
  const forecastTotal = fechadoMes + ponderado;
  const gapForecast = metaMensal > 0 ? Math.max(0, metaMensal - forecastTotal) : null;
  drill.forecastCommit = linhasCommit;
  drill.forecastBestCase = linhasBest;
  drill.forecastPipeline = linhasPipe;
  drill.forecastTotal = abertosMes;

  // -------------------- C) Saúde do Pipeline --------------------------------
  const abertosTodos = deals.filter((d) => d._SEMANTICA === "process");
  const pipelineTotal = abertosTodos.reduce((a, d) => a + d._VALOR, 0);
  const periodoSelecionado = cockpitPeriodoFiltro();
  const periodoFiltro = (periodoSelecionado.inicio || periodoSelecionado.fim) ? periodoSelecionado : mes;
  const abertosElegiveis = abertosTodos.filter((d) => !ehEstagioPiloto(d.STAGE_ID, d._ESTAGIO) && dentroPeriodoCatalogo(d.CLOSEDATE, periodoFiltro));
  const pipelineElegivel = abertosElegiveis.reduce((a, d) => a + d._VALOR, 0);
  // Coverage = Pipeline Elegível ÷ Gap da Meta (não ÷ meta cheia) — mostra se o
  // que falta para bater a meta do mês está coberto pelo pipeline compatível
  // com o horizonte do filtro escolhido.
  let coverage = null;
  if (gapMeta === 0) coverage = "meta batida";
  else if (gapMeta != null && gapMeta > 0) coverage = pipelineElegivel / gapMeta;
  const criadosPeriodo = deals.filter((d) => dentroPeriodoCatalogo(d.DATE_CREATE, periodoFiltro));
  const pipelineCriadoPeriodo = criadosPeriodo.reduce((a, d) => a + d._VALOR, 0);
  const ticketMedioPipeline = abertosTodos.length ? pipelineTotal / abertosTodos.length : null;
  drill.pipelineTotal = abertosTodos;
  drill.pipelineElegivel = abertosElegiveis;
  drill.pipelineCriado = criadosPeriodo;

  // -------------------- D) Proteção de Receita M / M+1 / M+2 / M+3 ---------
  const protecao = [];
  for (let i = 0; i < 4; i++) {
    const d0 = new Date(mes.hojeISO + "T12:00:00");
    d0.setMonth(d0.getMonth() + i);
    const ano = d0.getFullYear(), mesNum = d0.getMonth() + 1;
    const inicioM = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
    const fimM = formatarDataISO(new Date(ano, mesNum, 0));
    const metaM = Number(cockpitEl(`cockpitMetaM${i}`)?.value) || 0;
    const elegiveisM = abertosTodos.filter((d) => !ehEstagioPiloto(d.STAGE_ID, d._ESTAGIO) && dentroPeriodoCatalogo(d.CLOSEDATE, { inicio: inicioM, fim: fimM }));
    const pipelineM = elegiveisM.reduce((a, d) => a + d._VALOR, 0);
    const coverageM = metaM > 0 ? pipelineM / metaM : null;
    // Threshold inicial (configurável, não é regra fixa da AtlasGR): <2x
    // crítico, 2x–3x atenção, ≥3x saudável — ver comentário na função
    // cockpitStatusProtecao().
    const statusM = cockpitStatusProtecao(coverageM);
    protecao.push({ label: `${i === 0 ? "M" : `M+${i}`} (${mesAnoBR(inicioM)})`, meta: metaM, pipeline: pipelineM, coverage: coverageM, status: statusM, deals: elegiveisM });
    drill[`protecao_${i}`] = elegiveisM;
  }

  // -------------------- F) Eficiência da Máquina ----------------------------
  const fechadosPeriodo = deals.filter((d) => d._SEMANTICA !== "process" && dentroPeriodoCatalogo(d._FECHAMENTO, periodoFiltro));
  const ganhosPeriodo = fechadosPeriodo.filter((d) => d._SEMANTICA === "success");
  const perdidosPeriodo = fechadosPeriodo.filter((d) => d._SEMANTICA === "failure");
  const winRate = (ganhosPeriodo.length + perdidosPeriodo.length) > 0
    ? Math.round((ganhosPeriodo.length / (ganhosPeriodo.length + perdidosPeriodo.length)) * 1000) / 10
    : null;
  const receitaGanhaPeriodo = ganhosPeriodo.reduce((a, d) => a + d._VALOR, 0);
  const ticketMedioVendido = ganhosPeriodo.length ? receitaGanhaPeriodo / ganhosPeriodo.length : null;
  const ciclos = ganhosPeriodo.map((d) => Number(d._CICLO)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const cicloMedia = ciclos.length ? Math.round((ciclos.reduce((a, b) => a + b, 0) / ciclos.length) * 10) / 10 : null;
  const cicloMediana = ciclos.length ? (ciclos.length % 2 ? ciclos[(ciclos.length - 1) / 2] : Math.round(((ciclos[ciclos.length / 2 - 1] + ciclos[ciclos.length / 2]) / 2) * 10) / 10) : null;
  drill.winRateGanhos = ganhosPeriodo;
  drill.winRatePerdidos = perdidosPeriodo;
  drill.cicloVenda = ganhosPeriodo;

  // -------------------- G) Pipeline por Estágio -----------------------------
  const refAging = new Date(`${mes.referencia}T12:00:00`);
  const porEstagio = {};
  abertosTodos.forEach((d) => {
    const k = d._ESTAGIO || "Sem estágio";
    if (!porEstagio[k]) porEstagio[k] = { estagio: k, qtd: 0, valor: 0, agingSoma: 0, agingN: 0, deals: [] };
    const g = porEstagio[k];
    g.qtd++; g.valor += d._VALOR; g.deals.push(d);
    const mt = parteDataISO(d.MOVED_TIME);
    if (mt) { g.agingSoma += Math.max(0, Math.floor((refAging - new Date(`${mt}T12:00:00`)) / 86400000)); g.agingN++; }
  });
  const totalEstagios = Object.values(porEstagio).reduce((a, g) => a + g.valor, 0);
  const estagiosLista = Object.values(porEstagio).map((g) => ({
    ...g,
    pctTotal: totalEstagios > 0 ? Math.round((g.valor / totalEstagios) * 1000) / 10 : 0,
    agingMedio: g.agingN ? Math.round((g.agingSoma / g.agingN) * 10) / 10 : null,
  })).sort((a, b) => b.valor - a.valor);
  estagiosLista.forEach((g, i) => { drill[`estagio_${i}`] = g.deals; });

  cockpitDrill = drill;

  return {
    mes, deals,
    resultadoMes: { fechadoMes, metaMensal, pctMeta, gapMeta, qtd: ganhosMes.length, ticketMedioMes },
    forecast: { commit, bestCase, pipelineForecast, ponderado, forecastTotal, metaMensal, gapForecast },
    saude: { pipelineTotal, pipelineElegivel, coverage, pipelineCriadoPeriodo, ticketMedioPipeline, qtdAberto: abertosTodos.length, periodoFiltro },
    protecao,
    eficiencia: { winRate, ganhos: ganhosPeriodo.length, perdidos: perdidosPeriodo.length, ticketMedioVendido, cicloMedia, cicloMediana, amostraCiclo: ciclos.length, periodoFiltro },
    estagios: estagiosLista, totalEstagios,
  };
}

// ---------------------------------------------------------------------------
// Geração de Pipeline (seções 17-19 do prompt mestre)
// ---------------------------------------------------------------------------
// Calcula pipeline criado no período, pipeline necessário (hipótese: Meta
// futura ÷ Win Rate), gap, coverage de criação e ritmo (pace) de criação
// considerando dias úteis decorridos vs total do mês.
//
// FÓRMULA (hipótese matemática, documentada e visível, não escondida):
//   Pipeline necessário = Meta do mês seguinte (M+1, já editável no bloco
//   "Proteção de Receita") ÷ (Win Rate / 100)
//   Ex.: Meta M+1 = R$100.000, Win Rate = 25% → é preciso criar R$400.000 em
//   pipeline novo para, estatisticamente, converter a meta do mês seguinte.
//   Usamos a Meta M+1 (não a meta do mês atual) porque pipeline criado hoje
//   tipicamente fecha em meses futuros (mesmo raciocínio do bloco Proteção
//   de Receita). Win Rate vem do bloco Eficiência da Máquina (mesmo cálculo,
//   não uma nova fórmula) — se Win Rate ou Meta M+1 não estiverem
//   disponíveis, o Pipeline necessário fica "não disponível" (nunca 0).
function cockpitCalcularGeracaoPipeline(c) {
  const deals = cockpitState.dealsFiltrados || [];
  const mes = c.mes;
  const drill = {};

  // Pipeline criado no período = negócios abertos ou fechados cujo
  // DATE_CREATE cai no período filtrado (mesmo recorte de "Pipeline criado
  // no período" já usado no bloco Saúde do Pipeline) — não exclui "Piloto"
  // porque o objetivo aqui é medir geração bruta de pipeline, não o pipeline
  // elegível para fechamento.
  const periodoFiltro = c.saude.periodoFiltro;
  const criados = deals.filter((d) => dentroPeriodoCatalogo(d.DATE_CREATE, periodoFiltro));
  const pipelineCriado = criados.reduce((a, d) => a + d._VALOR, 0);
  drill.geracaoCriado = criados;

  const winRate = c.eficiencia.winRate; // % — reaproveitado do bloco Eficiência da Máquina
  const metaFutura = Number(cockpitEl("cockpitMetaM1")?.value) || 0;
  let pipelineNecessario = null;
  if (metaFutura > 0 && winRate != null && winRate > 0) {
    pipelineNecessario = metaFutura / (winRate / 100);
  }
  const gapGeracao = pipelineNecessario != null ? Math.max(0, pipelineNecessario - pipelineCriado) : null;
  const creationCoverage = pipelineNecessario != null && pipelineNecessario > 0 ? pipelineCriado / pipelineNecessario : null;

  // Pace de criação: dias úteis decorridos no mês atual vs total de dias
  // úteis do mês (ehDiaUtilISO, já usado em js/sdr.js). Compara o que seria
  // esperado até hoje (proporcional) com o que foi criado até agora.
  const diasDoMes = [];
  const [anoM, mesM] = mes.inicio.split("-").map(Number);
  const ultimoDiaMes = new Date(anoM, mesM, 0).getDate();
  for (let dia = 1; dia <= ultimoDiaMes; dia++) {
    diasDoMes.push(`${anoM}-${String(mesM).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }
  const diasUteisTotal = diasDoMes.filter((iso) => ehDiaUtilISO(iso)).length;
  const hojeISO = mes.hojeISO;
  const diasUteisDecorridos = diasDoMes.filter((iso) => iso <= hojeISO && ehDiaUtilISO(iso)).length;
  let paceEsperadoAteHoje = null, paceGap = null, paceRitmoPct = null;
  if (pipelineNecessario != null && diasUteisTotal > 0) {
    paceEsperadoAteHoje = pipelineNecessario * (diasUteisDecorridos / diasUteisTotal);
    paceGap = pipelineCriado - paceEsperadoAteHoje; // negativo = atrasado
    paceRitmoPct = paceEsperadoAteHoje > 0 ? Math.round((pipelineCriado / paceEsperadoAteHoje) * 1000) / 10 : null;
  }

  cockpitDrill = { ...cockpitDrill, ...drill };
  return {
    pipelineCriado, pipelineNecessario, gapGeracao, creationCoverage, winRate, metaFutura,
    diasUteisDecorridos, diasUteisTotal, paceEsperadoAteHoje, paceGap, paceRitmoPct,
  };
}

// ---------------------------------------------------------------------------
// SDR — resumo executivo (seções 21-22, versão compacta)
// ---------------------------------------------------------------------------
// LIMITAÇÃO CONHECIDA: o Cockpit extrai apenas negócios do funil Comercial
// (baseDealsCatalogo, CATEGORY_ID=0) — não extrai Leads nem atividades, que
// são a fonte real de "leads trabalhados", "reuniões agendadas/realizadas" e
// conversão Lead→Oportunidade completa (essas métricas existem em
// js/sdr.js: extrairDiarioSDR / extrairAnaliseSDR, que fazem chamadas
// específicas a crm.lead.list e crm.activity.list por usuário SDR). Refazer
// essa extração aqui duplicaria a lógica e o custo de chamadas — em vez
// disso, este bloco mostra só o que é derivável dos negócios já carregados
// no Cockpit (campo LEAD_ID, presente em baseDealsCatalogo) e aponta para os
// relatórios completos de SDR para o resto.
function cockpitCalcularResumoSdr(c) {
  const deals = cockpitState.dealsFiltrados || [];
  const periodoFiltro = c.saude.periodoFiltro;
  const criadosPeriodo = deals.filter((d) => dentroPeriodoCatalogo(d.DATE_CREATE, periodoFiltro));
  // Negócios originados de um Lead (LEAD_ID válido) = proxy de "pipeline
  // qualificado" que passou pela etapa de qualificação SDR antes de virar
  // oportunidade. Não identifica QUAL SDR qualificou (isso exigiria buscar
  // o Lead original e seu ASSIGNED_BY_ID, um custo N+1 fora de escopo aqui).
  const viaLead = criadosPeriodo.filter((d) => idBitrixValido(d.LEAD_ID));
  const semLead = criadosPeriodo.filter((d) => !idBitrixValido(d.LEAD_ID));
  const valorViaLead = viaLead.reduce((a, d) => a + d._VALOR, 0);
  const pctViaLead = criadosPeriodo.length ? Math.round((viaLead.length / criadosPeriodo.length) * 1000) / 10 : null;
  cockpitDrill.sdrViaLead = viaLead;
  cockpitDrill.sdrSemLead = semLead;
  return {
    totalCriados: criadosPeriodo.length, viaLeadQtd: viaLead.length, viaLeadValor: valorViaLead, pctViaLead,
    leadsTrabalhados: null, reunioes: null, conversaoLeadOportunidade: null, // não disponível nesta extração — ver Análise SDR completa
  };
}

// ---------------------------------------------------------------------------
// Qualidade dos Dados (CRM) — Data Quality Score (seções 26-27)
// ---------------------------------------------------------------------------
// IMPORTANTE: "Data Quality Score" mede só COMPLETUDE de campos no CRM — é a
// média simples das % de preenchimento dos campos abaixo. NUNCA deve ser
// interpretado como "Forecast Confidence" ou probabilidade de venda; não tem
// nenhuma relação com PROBABILITY/bucket de forecast.
//
// LIMITAÇÃO: não existe, em nenhum lugar do projeto (config.js,
// catalogo-relatorios.js, forecast.js), um campo mapeado para "motivo de
// perda" (UF_CRM_* ou nativo) — não há relatório nem extração que use esse
// dado hoje. Por isso o campo "Motivo de perda" abaixo é sempre contado como
// "não informado" para 100% dos negócios perdidos, e isso é documentado
// explicitamente na UI (não inventamos um campo que não existe no Bitrix
// configurado para este cliente).
function cockpitCalcularQualidadeDados(c) {
  const deals = cockpitState.dealsFiltrados || [];
  const abertos = deals.filter((d) => d._SEMANTICA === "process");
  const perdidos = deals.filter((d) => d._SEMANTICA === "failure");
  const baseCompletude = abertos.length ? abertos : deals; // preferimos negócios abertos (é o que a operação trabalha agora)

  const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : null);

  const comValor = baseCompletude.filter((d) => Number(d.OPPORTUNITY) > 0);
  const comResponsavel = baseCompletude.filter((d) => idBitrixValido(d.ASSIGNED_BY_ID));
  const comEstagio = baseCompletude.filter((d) => !!d.STAGE_ID);
  const comCloseDate = baseCompletude.filter((d) => !!parteDataISO(d.CLOSEDATE));
  const comOrigem = baseCompletude.filter((d) => !!d.SOURCE_ID);

  const camposCompletude = [
    { label: "Valor (OPPORTUNITY)", pct: pct(comValor.length, baseCompletude.length), lista: comValor },
    { label: "Responsável", pct: pct(comResponsavel.length, baseCompletude.length), lista: comResponsavel },
    { label: "Estágio", pct: pct(comEstagio.length, baseCompletude.length), lista: comEstagio },
    { label: "CLOSEDATE", pct: pct(comCloseDate.length, baseCompletude.length), lista: comCloseDate },
    { label: "Origem", pct: pct(comOrigem.length, baseCompletude.length), lista: comOrigem },
  ];
  camposCompletude.forEach((f, i) => { cockpitDrill[`qualidade_${i}`] = f.lista; });

  // Motivo de perda: campo inexistente no projeto hoje (ver comentário
  // acima) — sempre 0% de completude para negócios perdidos, não é um bug.
  const motivoPerdaPct = perdidos.length ? 0 : null;
  cockpitDrill.qualidadeMotivoPerda = perdidos;

  const valoresValidos = camposCompletude.map((f) => f.pct).filter((v) => v != null);
  const dataQualityScore = valoresValidos.length ? Math.round((valoresValidos.reduce((a, b) => a + b, 0) / valoresValidos.length) * 10) / 10 : null;

  return { baseTotal: baseCompletude.length, campos: camposCompletude, motivoPerdaPct, perdidosQtd: perdidos.length, dataQualityScore };
}

// Threshold de proteção de receita — critério inicial e configurável (não é
// regra fixa acordada com a diretoria): <2x cobertura = crítico, 2x a <3x =
// atenção, ≥3x = saudável. Ajuste aqui se o critério mudar.
function cockpitStatusProtecao(coverage) {
  if (coverage === null || coverage === undefined || !Number.isFinite(coverage)) return { rotulo: "não disponível", classe: "" };
  if (coverage < 2) return { rotulo: "crítico", classe: "cockpit-status-critico" };
  if (coverage < 3) return { rotulo: "atenção", classe: "cockpit-status-atencao" };
  return { rotulo: "saudável", classe: "cockpit-status-saudavel" };
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------
function cockpitND(valor, formato) {
  if (valor === null || valor === undefined || (typeof valor === "number" && !Number.isFinite(valor))) return "não disponível";
  return formato ? formato(valor) : valor;
}

function cockpitKpiCard(rotulo, valor, chaveDrill, extraClasse = "") {
  const clique = chaveDrill ? ` onclick="cockpitAbrirDrill('${chaveDrill}','${escapeHtmlRelatorio(rotulo).replace(/'/g, "\\'")}')"` : "";
  const cls = chaveDrill ? "cockpit-kpi cockpit-kpi-clicavel" : "cockpit-kpi";
  return `<div class="${cls} ${extraClasse}"${clique}><span class="valor">${valor}</span><span class="rotulo">${escapeHtmlRelatorio(rotulo)}</span></div>`;
}

function renderizarCockpit() {
  if (!cockpitState.deals.length) return;
  const c = cockpitCalcular();

  // A) Resultado do Mês
  cockpitEl("cockpitResultadoMes").innerHTML = [
    cockpitKpiCard("Meta New MRR (mês)", c.resultadoMes.metaMensal ? moedaRelatorio(c.resultadoMes.metaMensal) : "não informada", null),
    cockpitKpiCard("Fechado no mês", moedaRelatorio(c.resultadoMes.fechadoMes), "resultadoMesFechado"),
    cockpitKpiCard("% da Meta", cockpitND(c.resultadoMes.pctMeta, (v) => `${v}%`), "resultadoMesFechado"),
    cockpitKpiCard("Gap para a meta", cockpitND(c.resultadoMes.gapMeta, moedaRelatorio), "resultadoMesGap"),
    cockpitKpiCard("Negócios ganhos", c.resultadoMes.qtd, "resultadoMesFechado"),
    cockpitKpiCard("Ticket médio (mês)", cockpitND(c.resultadoMes.ticketMedioMes, moedaRelatorio), "resultadoMesFechado"),
  ].join("");

  // B) Forecast — visualmente separado do Pipeline (cor/bloco diferentes)
  cockpitEl("cockpitForecast").innerHTML = [
    cockpitKpiCard("Commit", moedaRelatorio(c.forecast.commit), "forecastCommit"),
    cockpitKpiCard("Best Case", moedaRelatorio(c.forecast.bestCase), "forecastBestCase"),
    cockpitKpiCard("Pipeline (forecast)", moedaRelatorio(c.forecast.pipelineForecast), "forecastPipeline"),
    cockpitKpiCard("Forecast ponderado", moedaRelatorio(c.forecast.ponderado), "forecastTotal"),
    cockpitKpiCard("Forecast total do mês", moedaRelatorio(c.forecast.forecastTotal), "forecastTotal", "cockpit-kpi-destaque"),
    cockpitKpiCard("Gap do Forecast", cockpitND(c.forecast.gapForecast, moedaRelatorio), "forecastTotal"),
  ].join("");

  // C) Saúde do Pipeline
  const covTxt = c.saude.coverage === "meta batida" ? "meta já batida" : cockpitND(c.saude.coverage, (v) => `${v.toFixed(2)}x`);
  cockpitEl("cockpitSaudePipeline").innerHTML = [
    cockpitKpiCard("Pipeline Total", moedaRelatorio(c.saude.pipelineTotal), "pipelineTotal"),
    cockpitKpiCard("Pipeline Elegível (filtro)", moedaRelatorio(c.saude.pipelineElegivel), "pipelineElegivel"),
    cockpitKpiCard("Coverage (elegível ÷ gap)", covTxt, "pipelineElegivel"),
    cockpitKpiCard("Pipeline criado no período", moedaRelatorio(c.saude.pipelineCriadoPeriodo), "pipelineCriado"),
    cockpitKpiCard("Ticket médio do pipeline", cockpitND(c.saude.ticketMedioPipeline, moedaRelatorio), "pipelineTotal"),
  ].join("");
  cockpitEl("cockpitAvisoPipelineForecast").textContent =
    `Pipeline Total (${moedaRelatorio(c.saude.pipelineTotal)}) é o valor bruto de tudo que está aberto no Comercial — não é previsão de fechamento. A previsão fica nos cards de Forecast acima (Commit/Best Case/Pipeline ponderado).`;

  // D) Proteção de Receita
  cockpitEl("cockpitProtecaoTabela").innerHTML = `<table><thead><tr><th>Mês</th><th>Meta</th><th>Pipeline Elegível</th><th>Coverage</th><th>Status</th></tr></thead><tbody>` +
    c.protecao.map((p, i) => `<tr class="cockpit-linha-clicavel" onclick="cockpitAbrirDrill('protecao_${i}','Pipeline elegível — ${escapeHtmlRelatorio(p.label)}')">` +
      `<td>${escapeHtmlRelatorio(p.label)}</td>` +
      `<td>${p.meta ? moedaRelatorio(p.meta) : "não informada"}</td>` +
      `<td>${moedaRelatorio(p.pipeline)}</td>` +
      `<td>${p.coverage != null ? `${p.coverage.toFixed(2)}x` : "não disponível"}</td>` +
      `<td><span class="cockpit-status-badge ${p.status.classe}">${p.status.rotulo}</span></td>` +
      `</tr>`).join("") + `</tbody></table>`;

  // E) Pipeline por Estágio
  const maxValor = Math.max(1, ...c.estagios.map((g) => g.valor));
  cockpitEl("cockpitEstagios").innerHTML = c.estagios.map((g, i) => `
    <div class="cockpit-estagio-linha" onclick="cockpitAbrirDrill('estagio_${i}','Negócios em ${escapeHtmlRelatorio(g.estagio)}')">
      <div class="cockpit-estagio-nome">${escapeHtmlRelatorio(g.estagio)}</div>
      <div class="cockpit-estagio-barra"><div class="cockpit-estagio-barra-fill" style="width:${Math.max(2, (g.valor / maxValor) * 100).toFixed(1)}%"></div></div>
      <div class="cockpit-estagio-stats">${g.qtd} negócio(s) · ${moedaRelatorio(g.valor)} · ${g.pctTotal}% · aging médio ${g.agingMedio != null ? `${g.agingMedio}d` : "não disponível"}</div>
    </div>`).join("") || `<p class="rodape-nota">Nenhum negócio em aberto no Comercial.</p>`;

  // F) Eficiência da Máquina
  cockpitEl("cockpitEficiencia").innerHTML = [
    cockpitKpiCard("Win Rate", cockpitND(c.eficiencia.winRate, (v) => `${v}%`), "winRateGanhos"),
    cockpitKpiCard("Ganhos no período", c.eficiencia.ganhos, "winRateGanhos"),
    cockpitKpiCard("Perdidos no período", c.eficiencia.perdidos, "winRatePerdidos"),
    cockpitKpiCard("Ticket médio vendido", cockpitND(c.eficiencia.ticketMedioVendido, moedaRelatorio), "winRateGanhos"),
    cockpitKpiCard("Sales Cycle (média)", cockpitND(c.eficiencia.cicloMedia, (v) => `${v}d`), "cicloVenda"),
    cockpitKpiCard("Sales Cycle (mediana)", cockpitND(c.eficiencia.cicloMediana, (v) => `${v}d`), "cicloVenda"),
  ].join("") + `<p class="rodape-nota" style="grid-column:1/-1;">Amostra do ciclo de vendas: ${c.eficiencia.amostraCiclo} negócio(s) ganho(s) com data de criação e de fechamento preenchidas, dentro do período do filtro.</p>`;

  // H) Geração de Pipeline
  const g = cockpitCalcularGeracaoPipeline(c);
  cockpitEl("cockpitGeracaoPipeline").innerHTML = [
    cockpitKpiCard("Pipeline criado no período", moedaRelatorio(g.pipelineCriado), "geracaoCriado"),
    cockpitKpiCard("Pipeline necessário (Meta M+1 ÷ Win Rate)", cockpitND(g.pipelineNecessario, moedaRelatorio), null),
    cockpitKpiCard("Gap de geração", cockpitND(g.gapGeracao, moedaRelatorio), null),
    cockpitKpiCard("Creation Coverage", cockpitND(g.creationCoverage, (v) => `${(v * 100).toFixed(1)}%`), null),
    cockpitKpiCard("Dias úteis decorridos / total do mês", `${g.diasUteisDecorridos} / ${g.diasUteisTotal}`, null),
    cockpitKpiCard("Esperado até hoje (pace)", cockpitND(g.paceEsperadoAteHoje, moedaRelatorio), null),
    cockpitKpiCard("Gap de ritmo", g.paceGap != null ? moedaRelatorio(g.paceGap) : "não disponível", null),
    cockpitKpiCard("Ritmo de criação", cockpitND(g.paceRitmoPct, (v) => `${v}%`), null, g.paceRitmoPct != null && g.paceRitmoPct < 100 ? "cockpit-status-atencao" : ""),
  ].join("");

  // I) SDR — resumo executivo
  const s = cockpitCalcularResumoSdr(c);
  cockpitEl("cockpitSdrAviso").textContent =
    "Este resumo usa só os negócios do Comercial já carregados (não busca Leads/atividades). Leads trabalhados, reuniões e conversão Lead→Oportunidade completa: ver Análise SDR / Diário SDR (links abaixo).";
  cockpitEl("cockpitSdrResumo").innerHTML = [
    cockpitKpiCard("Negócios criados no período", s.totalCriados, null),
    cockpitKpiCard("Originados de Lead (proxy SDR)", s.viaLeadQtd, "sdrViaLead"),
    cockpitKpiCard("Valor originado de Lead", moedaRelatorio(s.viaLeadValor), "sdrViaLead"),
    cockpitKpiCard("% originado de Lead", cockpitND(s.pctViaLead, (v) => `${v}%`), "sdrViaLead"),
    cockpitKpiCard("Leads trabalhados", "não disponível", null),
    cockpitKpiCard("Reuniões agendadas/realizadas", "não disponível", null),
  ].join("");

  // J) Qualidade dos Dados (CRM) — Data Quality Score
  const q = cockpitCalcularQualidadeDados(c);
  cockpitEl("cockpitQualidadeDados").innerHTML = [
    ...q.campos.map((f, i) => cockpitKpiCard(`Completude — ${f.label}`, cockpitND(f.pct, (v) => `${v}%`), `qualidade_${i}`)),
    cockpitKpiCard("Motivo de perda informado", q.perdidosQtd ? "0% (campo não existe no projeto)" : "sem negócios perdidos no período", "qualidadeMotivoPerda"),
    cockpitKpiCard("Data Quality Score", cockpitND(q.dataQualityScore, (v) => `${v}%`), null, "cockpit-kpi-destaque"),
  ].join("") + `<p class="rodape-nota" style="grid-column:1/-1;">Base: ${q.baseTotal} negócio(s) (aberto(s), quando houver; senão todos os filtrados). Data Quality Score = completude de cadastro no CRM, não é confiança de forecast.</p>`;
}

// ---------------------------------------------------------------------------
// Drill-down (requisito 9): clique em qualquer KPI mostra os negócios por trás
// ---------------------------------------------------------------------------
function cockpitAbrirDrill(chave, titulo) {
  const linhas = cockpitDrill[chave] || [];
  const modal = cockpitEl("cockpitDrillModal");
  if (!modal) return;
  cockpitEl("cockpitDrillTitulo").textContent = titulo || "Detalhamento";
  cockpitEl("cockpitDrillContagem").textContent = `${linhas.length} negócio(s)`;
  cockpitEl("cockpitDrillConteudo").innerHTML = tabelaRelatorio([
    { label: "Empresa / Cliente", valor: "_CLIENTE" },
    { label: "Valor", valor: (x) => moedaRelatorio(x._VALOR), html: true },
    { label: "Etapa", valor: "_ESTAGIO" },
    { label: "Vendedor", valor: "_RESPONSAVEL" },
    { label: "CLOSEDATE", valor: (x) => formatarDataBR(parteDataISO(x.CLOSEDATE)) },
  ], linhas, 300);
  modal.classList.add("aberto");
}
function fecharDrillCockpit() {
  cockpitEl("cockpitDrillModal")?.classList.remove("aberto");
}
function fecharDrillCockpitPorFundo(ev) {
  if (ev.target && ev.target.id === "cockpitDrillModal") fecharDrillCockpit();
}
