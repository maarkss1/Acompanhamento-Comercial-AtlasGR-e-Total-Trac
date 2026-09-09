function abrirHtmlEmNovaAba(html) {
  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    baixarArquivo(html, `relatorio_visual_${dataHoje()}.html`, "text/html;charset=utf-8;");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// v22 — "Abrir modelo visual" renderiza o relatório num modal (iframe com
// srcdoc, isolado do CSS/JS do site) que sobe por cima da página atual, em
// vez de abrir uma aba/arquivo separado. Fica escondido até o usuário
// clicar em "Abrir modelo visual" — nunca aparece sozinho. Toda página com
// um botão desses tem o container #relatorioVisualInlineCard; se por algum
// motivo não existir, cai de volta no comportamento antigo (nova aba).
// v25 — vira modal de verdade (overlay fixo, "uma página por cima da
// outra") com 3 ações no cabeçalho: Salvar (guarda o HTML deste navegador,
// numa lista revisitável), Baixar (arquivo .html) e Abrir em nova aba.
let relatorioVisualAtualHtml = "";
let relatorioVisualAtualNome = "";
function mostrarRelatorioVisualInline(html, nome) {
  const card = document.getElementById("relatorioVisualInlineCard");
  const frame = document.getElementById("relatorioVisualInlineFrame");
  if (!card || !frame) { abrirHtmlEmNovaAba(html); return; }
  relatorioVisualAtualHtml = html;
  relatorioVisualAtualNome = nome || "Relatório";
  const titulo = document.getElementById("relatorioModalTitulo");
  if (titulo) titulo.textContent = "📊 " + relatorioVisualAtualNome;
  frame.srcdoc = html;
  card.classList.remove("oculto");
}
function fecharRelatorioVisualInline() {
  document.getElementById("relatorioVisualInlineCard")?.classList.add("oculto");
  document.getElementById("relatorioSalvosPainel")?.classList.add("oculto");
  const frame = document.getElementById("relatorioVisualInlineFrame");
  if (frame) frame.srcdoc = "";
}
function baixarRelatorioVisualAtual() {
  if (!relatorioVisualAtualHtml) return;
  const nomeArquivo = normalizarTextoChave(relatorioVisualAtualNome || "relatorio").replace(/ /g, "_") || "relatorio";
  baixarArquivo(relatorioVisualAtualHtml, `${nomeArquivo}_${dataHoje()}.html`, "text/html;charset=utf-8;");
}
function abrirRelatorioVisualEmNovaAba() {
  if (relatorioVisualAtualHtml) abrirHtmlEmNovaAba(relatorioVisualAtualHtml);
}
// v26 — "Baixar PDF": aciona a impressão do próprio iframe do relatório (o
// relatório já tem regras @media print dedicadas — sem "pisca", sem cortar
// cards no meio). O navegador abre o diálogo de impressão nativo, onde
// "Salvar como PDF" é uma das impressoras disponíveis — sem depender de
// nenhuma biblioteca externa (o portal é 100% estático, sem etapa de build).
function baixarRelatorioVisualPDF() {
  const frame = document.getElementById("relatorioVisualInlineFrame");
  if (!frame || !relatorioVisualAtualHtml) return;
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (e) {
    mostrarErro('Não foi possível abrir a impressão automaticamente. Use "Baixar" e abra o arquivo .html para imprimir/salvar como PDF.');
  }
}

// v25 — "Salvar": guarda o HTML gerado numa lista local (até 15, mais
// recente primeiro), pra poder reabrir depois sem precisar reextrair do
// Bitrix. É por navegador (localStorage) — mesma limitação já documentada
// no histórico do Forecast (js/jornada.js).
const CHAVE_RELATORIOS_SALVOS_LOCAL = "atlas-extrator-relatorios-salvos";
function carregarRelatoriosSalvos() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RELATORIOS_SALVOS_LOCAL) || "[]"); }
  catch (e) { return []; }
}
function salvarRelatorioVisualAtual() {
  if (!relatorioVisualAtualHtml) return;
  try {
    const lista = carregarRelatoriosSalvos();
    lista.unshift({ id: String(Date.now()), nome: relatorioVisualAtualNome, quando: new Date().toLocaleString("pt-BR"), html: relatorioVisualAtualHtml });
    localStorage.setItem(CHAVE_RELATORIOS_SALVOS_LOCAL, JSON.stringify(lista.slice(0, 15)));
  } catch (e) {
    mostrarErro("Não foi possível salvar — armazenamento local cheio ou indisponível neste navegador.");
    return;
  }
  renderizarRelatoriosSalvos();
  document.getElementById("relatorioSalvosPainel")?.classList.remove("oculto");
}
function excluirRelatorioSalvo(id) {
  const lista = carregarRelatoriosSalvos().filter((x) => x.id !== id);
  try { localStorage.setItem(CHAVE_RELATORIOS_SALVOS_LOCAL, JSON.stringify(lista)); } catch (e) {}
  renderizarRelatoriosSalvos();
}
function abrirRelatorioSalvo(id) {
  const item = carregarRelatoriosSalvos().find((x) => x.id === id);
  if (item) mostrarRelatorioVisualInline(item.html, item.nome);
}
function alternarPainelRelatoriosSalvos() {
  const painel = document.getElementById("relatorioSalvosPainel");
  if (!painel) return;
  painel.classList.toggle("oculto");
  if (!painel.classList.contains("oculto")) renderizarRelatoriosSalvos();
}
function renderizarRelatoriosSalvos() {
  const el = document.getElementById("relatorioSalvosLista");
  if (!el) return;
  const lista = carregarRelatoriosSalvos();
  if (!lista.length) { el.innerHTML = '<p class="small-note">Nenhum relatório salvo neste navegador ainda.</p>'; return; }
  el.innerHTML = lista.map((x) =>
    `<div class="relatorio-salvo-item"><button type="button" class="relatorio-salvo-abrir" onclick="abrirRelatorioSalvo('${x.id}')"><strong>${escapeHtmlRelatorio(x.nome)}</strong><span>${escapeHtmlRelatorio(x.quando)}</span></button><button type="button" class="relatorio-salvo-excluir" onclick="excluirRelatorioSalvo('${x.id}')" title="Excluir">✕</button></div>`
  ).join("");
}

// -------------------------- Forecast semanal -------------------------------


function chaveClienteDealModelo(d) {
  if (idBitrixValido(d.COMPANY_ID)) return `COMPANY:${idBitrixString(d.COMPANY_ID)}`;
  if (idBitrixValido(d.LEAD_ID)) return `LEAD:${idBitrixString(d.LEAD_ID)}`;
  if (idBitrixValido(d.CONTACT_ID)) return `CONTACT:${idBitrixString(d.CONTACT_ID)}`;
  const n = normalizarTextoChave(d.TITLE || "");
  return n ? `NOME:${n}` : `DEAL:${d.ID}`;
}
function contarClientesUnicosModelo(rows) {
  return new Set((rows || []).map((x)=>x.CLIENTE_KEY).filter(Boolean)).size;
}
function somarModelo(rows,campo="VALOR"){return (rows||[]).reduce((a,x)=>a+(Number(x[campo])||0),0);}
function origemLabelModelo(id,mapa){const s=String(id||"").trim();return s?(mapa?.[s]||s):"origem não informada";}

async function construirDadosModeloForecast(webhook, meta, inicio, fim, dealsComercial) {
  const catsFin = encontrarCategoriasPorPalavras(meta, ["financeiro"], false);
  const campos = ["ID","TITLE","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID","OPPORTUNITY","ASSIGNED_BY_ID","COMPANY_ID","CONTACT_ID","LEAD_ID","SOURCE_ID","DATE_CREATE","MOVED_TIME","CLOSEDATE"];
  let fin = [];
  if (catsFin.length) {
    const filtro = catsFin.length===1 ? {"CATEGORY_ID":catsFin[0]} : {"@CATEGORY_ID":catsFin};
    fin = (await listarCompletoRelatorio(webhook,"crm.deal.list",campos,filtro,{ID:"ASC"},"Forecast visual: Financeiro...")).dados;
  }
  const todos=[...(dealsComercial||[]),...fin];
  const ids=[...new Set(todos.map((d)=>d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  const [empresas,origens]=await Promise.all([
    buscarEntidadesPorIds(webhook,"crm.company.list",ids,["ID","TITLE"]),
    mapaOrigensRelatorio(webhook)
  ]);
  const ref=fim||formatarDataISO(new Date());
  const mapRow=(d)=>{
    const cat=String(d.CATEGORY_ID??""), sm=meta.estagios?.[cat]?.[String(d.STAGE_ID)]||{};
    const data=parteDataISO(d.MOVED_TIME)||parteDataISO(d.DATE_CREATE);
    const criacao=parteDataISO(d.DATE_CREATE);
    return {
      DEAL_ID:d.ID,CLIENTE_KEY:chaveClienteDealModelo(d),
      CLIENTE:idBitrixValido(d.COMPANY_ID)?(empresas[idBitrixString(d.COMPANY_ID)]?.TITLE||d.TITLE||""):(d.TITLE||""),
      ESTAGIO:sm.label||d.STAGE_ID||"",SEMANTICA:semanticaDeal(d,sm),
      RESPONSAVEL:nomeUsuario(d.ASSIGNED_BY_ID)||(d.ASSIGNED_BY_ID?`ID ${d.ASSIGNED_BY_ID}`:"Sem responsável"),
      ORIGEM:origemLabelModelo(d.SOURCE_ID,origens),VALOR:Number(d.OPPORTUNITY)||0,
      DATA_MOVIMENTO:data,DATA_MOVIMENTO_BR:formatarDataBR(data),MES_CHAVE:chaveMesISO(data),MES_LABEL:mesAnoBR(data),
      DIAS_NO_ESTAGIO:diferencaDiasAteReferencia(data,ref),
      // v24 — data de entrada do negócio (DATE_CREATE do próprio negócio — o
      // Bitrix não guarda a data de criação do Lead de origem separadamente
      // sem uma busca por negócio, então usamos a criação do negócio como o
      // "entrou como negócio") e o ciclo (criação → estágio atual/fechamento).
      DATA_CRIACAO:criacao,DATA_CRIACAO_BR:formatarDataBR(criacao),
      CICLO_DIAS:(criacao&&data)?diferencaDiasAteReferencia(criacao,data):""
    };
  };
  const comercial=(dealsComercial||[]).map(mapRow), financeiro=fin.map(mapRow);
  const ehFechado=(x)=>{
    const n=normalizarTextoChave(x.ESTAGIO);
    return n.includes("contrato assinado")||(x.SEMANTICA==="success"&&n.includes("assin"));
  };
  const fechados=financeiro.filter((x)=>ehFechado(x)&&dataDentroFaixa(x.DATA_MOVIMENTO,inicio,fim));
  // v12 — "Pendentes Assinatura" e "Pipeline Aberto" no modelo visual mostram só
  // negócios parados na etapa atual há no máximo 60 dias, e nunca estágios "Piloto".
  const dentroJanela60d=(x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO<=60;
  const pendentes=financeiro.filter((x)=>{
    const n=normalizarTextoChave(x.ESTAGIO);
    return x.SEMANTICA==="process" && (n.includes("aguardando assinatura")||n.includes("analise de documentos")||n.includes("assinatura de contrato")) && !n.includes("contrato assinado")
      && !ehEstagioPiloto(null,x.ESTAGIO) && dentroJanela60d(x);
  });
  const pipeline=comercial.filter((x)=>x.SEMANTICA==="process"&&!ehEstagioPiloto(null,x.ESTAGIO)&&dentroJanela60d(x));
  const porVend=(rows)=>{
    const m={};rows.forEach((x)=>{const k=x.RESPONSAVEL;if(!m[k])m[k]={RESPONSAVEL:k,VALOR:0,NEGOCIOS:0,CLIENTES:new Set()};m[k].VALOR+=x.VALOR;m[k].NEGOCIOS++;m[k].CLIENTES.add(x.CLIENTE_KEY)});
    return Object.values(m).map((x)=>({RESPONSAVEL:x.RESPONSAVEL,VALOR:x.VALOR,NEGOCIOS:x.NEGOCIOS,CLIENTES:x.CLIENTES.size})).sort((a,b)=>b.VALOR-a.VALOR);
  };
  const media=(rows,campo)=>{const v=rows.map((x)=>Number(x[campo])).filter((n)=>Number.isFinite(n));return v.length?Math.round((v.reduce((a,b)=>a+b,0)/v.length)*10)/10:0;};
  const porOrigem=(rows)=>{
    const m={};rows.forEach((x)=>{m[x.ORIGEM]=(m[x.ORIGEM]||0)+x.VALOR;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  };
  const porEstagio=(rows)=>{
    const m={};rows.forEach((x)=>{if(!m[x.ESTAGIO])m[x.ESTAGIO]={ESTAGIO:x.ESTAGIO,VALOR:0,NEGOCIOS:0};m[x.ESTAGIO].VALOR+=x.VALOR;m[x.ESTAGIO].NEGOCIOS++;});
    return Object.values(m).sort((a,b)=>b.VALOR-a.VALOR);
  };
  const maiorFechado=fechados.reduce((max,x)=>(!max||x.VALOR>max.VALOR)?x:max,null);
  const topOrigem=porOrigem(fechados)[0];
  // v24 — comparativo ano a ano: reaproveita o array `financeiro` (que já
  // veio SEM filtro de data do Bitrix — tem o histórico inteiro da categoria)
  // filtrando pela mesma janela de datas só que um ano antes, sem nenhuma
  // chamada nova à API.
  const anoAtras=(iso)=>{if(!iso)return "";const [y,m,d]=iso.split("-").map(Number);return `${y-1}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;};
  const inicioAnoPassado=anoAtras(inicio), fimAnoPassado=anoAtras(fim);
  const fechadosAnoPassado=financeiro.filter((x)=>ehFechado(x)&&dataDentroFaixa(x.DATA_MOVIMENTO,inicioAnoPassado,fimAnoPassado));
  const valorAnoPassado=somarModelo(fechadosAnoPassado), valorAtual=somarModelo(fechados);
  const comparativoAno={
    anoAtualLabel:inicio?inicio.slice(0,4):"",anoPassadoLabel:inicioAnoPassado?inicioAnoPassado.slice(0,4):"",
    valorAtual,valorAnoPassado,negociosAtual:fechados.length,negociosAnoPassado:fechadosAnoPassado.length,
    deltaPct:valorAnoPassado>0?Math.round(((valorAtual-valorAnoPassado)/valorAnoPassado)*1000)/10:null
  };
  return {
    periodo_inicio:inicio,periodo_fim:fim,referencia:ref,fechados,pendentes,pipeline,
    dominio:extrairDominioWebhook(webhook),
    vendedores_fechados:porVend(fechados),vendedores_pipeline:porVend(pipeline),
    pipeline_por_estagio:porEstagio(pipeline),
    comparativo_ano:comparativoAno,
    resumo:{
      FECHADOS_VALOR:somarModelo(fechados),FECHADOS_NEGOCIOS:fechados.length,FECHADOS_CLIENTES:contarClientesUnicosModelo(fechados),
      PENDENTES_VALOR:somarModelo(pendentes),PENDENTES_NEGOCIOS:pendentes.length,PENDENTES_CLIENTES:contarClientesUnicosModelo(pendentes),
      PIPELINE_VALOR:somarModelo(pipeline),PIPELINE_NEGOCIOS:pipeline.length,PIPELINE_CLIENTES:contarClientesUnicosModelo(pipeline),
      TICKET_MEDIO_FECHADOS:fechados.length?somarModelo(fechados)/fechados.length:0,
      MAIOR_FECHADO_VALOR:maiorFechado?maiorFechado.VALOR:0,MAIOR_FECHADO_CLIENTE:maiorFechado?maiorFechado.CLIENTE:"",
      CICLO_MEDIO_FECHADOS_DIAS:media(fechados,"CICLO_DIAS"),
      DIAS_MEDIO_PENDENTES:media(pendentes,"DIAS_NO_ESTAGIO"),DIAS_MEDIO_PIPELINE:media(pipeline,"DIAS_NO_ESTAGIO"),
      TOP_ORIGEM_LABEL:topOrigem?topOrigem[0]:"",TOP_ORIGEM_VALOR:topOrigem?topOrigem[1]:0
    }
  };
}

// v43 — usa o mesmo motor visual do Catálogo (js/relatorio-visual-generico.js):
// traduz resultado.modelo_visual para {kpis, tabelas} em vez de montar HTML na
// mão. O cálculo de negócio (rebase v21 de Meta/Entregue/Gap/Projeção no
// Financeiro) continua aqui, só a apresentação mudou — ver histórico da
// correção original logo abaixo.
function montarResultadoVisualForecast(resultado, tipo = "semanal") {
  const r = resultado?.modelo_visual;
  if (!r) return null;
  const periodo = tipo === "mensal" ? mesAnoBR(r.periodo_fim) : `${formatarDataBR(r.periodo_inicio)} a ${formatarDataBR(r.periodo_fim)}`;
  const metaMensal = tipo === "semanal" ? (Number(resultado?.meta?.meta_mensal) || 0) : (Number(resultado?.meta_visual) || 0);
  // v21 — "Entregue" usa a MESMA base da seção "Fechados" (r.resumo.FECHADOS_VALOR:
  // negócios no Financeiro em "Contrato assinado"), não resumo.FECHADO(_MES)
  // (só o funil Comercial marcado como ganho) — um cálculo mais simples que
  // produzia um valor divergente do que a própria seção "Fechados" já mostrava.
  // O pipeline ponderado (independente dessa base) segue somado por cima
  // para formar a projeção final.
  const realizadoMesBase = tipo === "semanal" ? (Number(resultado?.resumo?.FECHADO_MES) || 0) : (Number(resultado?.resumo?.FECHADO) || 0);
  const projecaoMesBase = tipo === "semanal" ? (Number(resultado?.resumo?.FORECAST_MES_TOTAL) || 0) : (Number(resultado?.resumo?.FORECAST_TOTAL) || 0);
  const pipelinePonderadoMesDelta = Math.max(0, projecaoMesBase - realizadoMesBase);
  const realizadoMes = Number(r.resumo.FECHADOS_VALOR) || 0;
  const projecaoMes = realizadoMes + pipelinePonderadoMesDelta;
  const metaBatida = metaMensal > 0 && realizadoMes >= metaMensal;
  const metaNoCaminho = metaBatida || (metaMensal > 0 && projecaoMes >= metaMensal);
  const gapMeta = Math.max(0, metaMensal - realizadoMes);

  const kpis = [
    kpi("Fechados", moedaRelatorio(r.resumo.FECHADOS_VALOR), `Contrato assinado no Financeiro dentro do período — ${r.resumo.FECHADOS_NEGOCIOS} negócio(s), ${r.resumo.FECHADOS_CLIENTES} cliente(s).`),
    kpi("Pendentes Assinatura", moedaRelatorio(r.resumo.PENDENTES_VALOR), `Aguardando assinatura, parado há no máximo 60 dias — ${r.resumo.PENDENTES_NEGOCIOS} negócio(s), ${r.resumo.PENDENTES_CLIENTES} cliente(s).`),
    kpi("Pipeline Aberto", moedaRelatorio(r.resumo.PIPELINE_VALOR), `Em aberto no funil Comercial, sem estágios Piloto, parado há no máximo 60 dias — ${r.resumo.PIPELINE_NEGOCIOS} negócio(s), ${r.resumo.PIPELINE_CLIENTES} cliente(s).`),
  ];
  if (metaMensal) {
    kpis.push(
      kpi("Meta Mensal", moedaRelatorio(metaMensal), `Projeção do mês: ${moedaRelatorio(projecaoMes)} (fechado + pipeline aberto ponderado).`),
      kpi("Entregue", moedaRelatorio(realizadoMes), metaNoCaminho ? "No caminho da meta mensal." : "Abaixo da meta mensal."),
      kpi("Gap para a meta", metaBatida ? "Meta batida" : moedaRelatorio(gapMeta), metaBatida ? "Meta mensal já foi batida." : "Falta para bater a meta mensal."),
    );
  } else {
    kpis.push(kpi("Meta Mensal", "A definir", "Meta comercial do mês ainda não informada."));
  }
  kpis.push(
    kpi("Ticket médio (fechados)", moedaRelatorio(r.resumo.TICKET_MEDIO_FECHADOS), "Receita ganha ÷ número de negócios fechados no Financeiro."),
    kpi("Maior negócio fechado", moedaRelatorio(r.resumo.MAIOR_FECHADO_VALOR), r.resumo.MAIOR_FECHADO_CLIENTE || "—"),
    kpi("Ciclo médio até fechar", `${r.resumo.CICLO_MEDIO_FECHADOS_DIAS || 0} dias`, "Média de dias entre a criação do negócio e o fechamento."),
    kpi("Dias médios parado — Pendentes", `${r.resumo.DIAS_MEDIO_PENDENTES || 0} dias`, "Média de dias parado na etapa atual, entre os Pendentes Assinatura."),
    kpi("Dias médios parado — Pipeline", `${r.resumo.DIAS_MEDIO_PIPELINE || 0} dias`, "Média de dias parado na etapa atual, entre o Pipeline Aberto."),
    kpi("Melhor origem (fechados)", moedaRelatorio(r.resumo.TOP_ORIGEM_VALOR), r.resumo.TOP_ORIGEM_LABEL || "—"),
  );
  const semCloseDate = Number(resultado?.resumo?.SEM_CLOSEDATE_QTD) || 0;
  const closeDateVencida = Number(resultado?.resumo?.CLOSEDATE_VENCIDA_QTD) || 0;
  if (semCloseDate) kpis.push(kpi("Sem CLOSEDATE", semCloseDate, "Negócio(s) sem data de fechamento prevista — vale revisar antes de fechar o mês."));
  if (closeDateVencida) kpis.push(kpi("CLOSEDATE vencida", closeDateVencida, "Negócio(s) com data de fechamento prevista já vencida."));

  // v24 — comparativo ano a ano, reaproveitando r.comparativo_ano (sem chamada nova à API).
  const comp = r.comparativo_ano || {};
  if (comp.valorAtual || comp.valorAnoPassado) {
    kpis.push(
      kpi(`Fechados em ${comp.anoAtualLabel || "este ano"}`, moedaRelatorio(comp.valorAtual || 0), `${comp.negociosAtual || 0} negócio(s) fechados nesta mesma faixa de datas.`),
      kpi(`Fechados em ${comp.anoPassadoLabel || "ano passado"}`, moedaRelatorio(comp.valorAnoPassado || 0), comp.deltaPct == null ? "Sem negócios fechados no mesmo período do ano passado para comparar." : `${comp.deltaPct >= 0 ? "+" : ""}${comp.deltaPct}% em relação a este ano.`),
    );
  }

  // v20 — link direto pro negócio no Bitrix (drill-down): usa só o domínio do
  // webhook (sem token) + ID do negócio, nunca a credencial.
  const linkBitrix = (dealId) => (r.dominio && dealId) ? `<a href="https://${r.dominio}/crm/deal/details/${encodeURIComponent(dealId)}/" target="_blank" rel="noopener noreferrer">Abrir ↗</a>` : "—";
  // Linha "limpa" com só os campos usados nas tabelas abaixo — a linha-deal
  // completa (mapRow, em construirDadosModeloForecast) carrega MES_CHAVE
  // ("2026-09") e DATA_MOVIMENTO (ISO), que o motor genérico usa para
  // detectar tendência mensal; deixados nos dados, uma coorte de negócios
  // fechados no mesmo mês virava (por engano) um gráfico de tendência em vez
  // do ranking por cliente.
  const linhaDeal = (x) => ({ CLIENTE: x.CLIENTE, RESPONSAVEL: x.RESPONSAVEL, ORIGEM: x.ORIGEM, ESTAGIO: x.ESTAGIO, MES_LABEL: x.MES_LABEL, VALOR: x.VALOR, DATA_MOVIMENTO_BR: x.DATA_MOVIMENTO_BR, DIAS_NO_ESTAGIO: x.DIAS_NO_ESTAGIO, CICLO_DIAS: x.CICLO_DIAS, DEAL_ID: x.DEAL_ID });
  const colunasDeal = (extra) => [
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Origem", valor: "ORIGEM" },
    ...extra,
    { label: "Valor", valor: (x) => moedaRelatorio(x.VALOR), html: true },
    { label: "Bitrix", valor: (x) => linkBitrix(x.DEAL_ID), html: true },
  ];
  const colunasVendedor = [
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Valor", valor: (x) => moedaRelatorio(x.VALOR), html: true },
    { label: "Negócios", valor: "NEGOCIOS" },
    { label: "Clientes", valor: "CLIENTES" },
  ];

  const tabelas = [];
  if (r.fechados.length) tabelas.push({
    titulo: "Fechados",
    descricao: "Negócios com contrato assinado no Financeiro dentro do período. O gráfico mostra os maiores fechamentos por cliente.",
    dados: r.fechados.map(linhaDeal),
    colunas: colunasDeal([{ label: "Fechado em", valor: "DATA_MOVIMENTO_BR" }, { label: "Ciclo (dias)", valor: "CICLO_DIAS" }]),
  });
  if (r.vendedores_fechados.length) tabelas.push({
    titulo: "Fechados por vendedor(a)",
    descricao: "Receita fechada por responsável, do maior para o menor.",
    dados: r.vendedores_fechados,
    colunas: colunasVendedor,
  });
  if (r.pendentes.length) tabelas.push({
    titulo: "Pendentes Assinatura",
    descricao: 'Negócios aguardando assinatura no Financeiro, parados na etapa atual há no máximo 60 dias, sem estágios "Piloto".',
    dados: r.pendentes.map(linhaDeal),
    colunas: colunasDeal([{ label: "Nesta etapa desde", valor: "DATA_MOVIMENTO_BR" }, { label: "Dias parado", valor: "DIAS_NO_ESTAGIO" }]),
  });
  if (r.pipeline.length) tabelas.push({
    titulo: "Pipeline Aberto",
    descricao: 'Negócios em aberto no funil Comercial, sem estágios "Piloto", parados na etapa atual há no máximo 60 dias.',
    dados: r.pipeline.map(linhaDeal),
    colunas: colunasDeal([{ label: "Etapa", valor: "ESTAGIO" }, { label: "Mês", valor: "MES_LABEL" }, { label: "Dias parado", valor: "DIAS_NO_ESTAGIO" }]),
  });
  if (r.vendedores_pipeline.length) tabelas.push({
    titulo: "Pipeline Aberto por vendedor(a)",
    descricao: "Pipeline aberto por responsável, do maior para o menor.",
    dados: r.vendedores_pipeline,
    colunas: colunasVendedor,
  });
  if ((r.pipeline_por_estagio || []).length) tabelas.push({
    titulo: "Pipeline por estágio",
    descricao: "Valor do pipeline aberto por estágio do funil Comercial.",
    dados: r.pipeline_por_estagio,
    colunas: [{ label: "Estágio", valor: "ESTAGIO" }, { label: "Valor", valor: (x) => moedaRelatorio(x.VALOR), html: true }, { label: "Negócios", valor: "NEGOCIOS" }],
  });
  // v20 — histórico local (só deste navegador, gravado a cada extração feita aqui).
  const historico = (typeof carregarHistoricoForecastLocal === "function" ? carregarHistoricoForecastLocal() : []).slice(-24);
  if (historico.length >= 2) tabelas.push({
    titulo: "Histórico local (neste navegador)",
    descricao: "Uma foto por extração do Forecast feita neste navegador — não sincroniza entre pessoas ou dispositivos.",
    dados: historico.map((p) => ({ DATA: p.data, VALOR_FECHADO: Number(p.fechadoMes) || 0, VALOR_META: Number(p.metaMensal) || 0, VALOR_PROJECAO: Number(p.projecaoMes) || 0 })),
    colunas: [
      { label: "Data", valor: (x) => formatarDataBR(x.DATA) },
      { label: "Fechado", valor: (x) => moedaRelatorio(x.VALOR_FECHADO), html: true },
      { label: "Meta", valor: (x) => moedaRelatorio(x.VALOR_META), html: true },
      { label: "Projeção", valor: (x) => moedaRelatorio(x.VALOR_PROJECAO), html: true },
    ],
  });

  const idx = (t) => tabelas.findIndex((x) => x.titulo === t);
  const capitulos = [];
  if (idx("Pendentes Assinatura") > -1) capitulos.push({ antes: idx("Pendentes Assinatura"), titulo: "Onde o forecast ainda depende de assinatura.", descricao: "Pendentes de assinatura e pipeline aberto — só negócios ativos, sem estágios de teste." });
  if (idx("Histórico local (neste navegador)") > -1) capitulos.push({ antes: idx("Histórico local (neste navegador)"), titulo: "Evolução deste navegador.", descricao: "Comparação entre extrações feitas aqui — útil para acompanhar a tendência dia a dia." });

  const nota = 'Negócios ≠ clientes: as duas contagens são mostradas separadamente — 31 negócios podem ser de 20 clientes diferentes. ' +
    'Pendentes Assinatura e Pipeline Aberto trazem só negócios parados na etapa atual há no máximo 60 dias, sem estágios "Piloto". ' +
    'A projeção final do mês soma o fechado no mês (Financeiro) ao pipeline aberto ponderado pela probabilidade de cada estágio, recalculada a cada extração. ' +
    'O Gap é quanto falta do fechado até a meta mensal informada.';

  return {
    chave: tipo === "mensal" ? "forecast_mensal" : "forecast_semanal",
    titulo: "Forecast Comercial",
    subtitulo: `${periodo} — fechados, pendentes de assinatura e pipeline aberto, preenchidos automaticamente pelo extrator.`,
    kpis, tabelas, nota, capitulos,
  };
}
function gerarHTMLForecastModelo(resultado, tipo = "semanal") {
  const r = montarResultadoVisualForecast(resultado, tipo);
  return r ? gerarHTMLRelatorioVisualGenerico(r) : "";
}
function abrirRelatorioVisualForecast(){const h=gerarHTMLForecastModelo(resultadoForecastSemanal,"semanal");if(h)mostrarRelatorioVisualInline(h,"Forecast Semanal — Comercial");}
function baixarHTMLForecastModelo(){const h=gerarHTMLForecastModelo(resultadoForecastSemanal,"semanal");if(h)baixarArquivo(h,`forecast_modelo_atlas_${dataHoje()}.html`,"text/html;charset=utf-8;");}

async function extrairForecastSemanal(webhook) {
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;
  esconderErro();
  resultadoForecastSemanal = {};

  try {
    const inicio = document.getElementById("dataInicio").value;
    const fim = document.getElementById("dataFim").value;
    if (!inicio || !fim) throw new Error("Informe a semana em De/Até.");

    atualizarStatus("Forecast: descobrindo pipeline, estágios e responsáveis...");
    const [meta] = await Promise.all([
      buscarMetadadosFunisEEstagios(webhook),
      buscarUsuariosJornada(webhook)
    ]);

    const palavraForecast = normalizarTextoChave(document.getElementById("palavraFunilForecast").value || "Comercial");
    let categorias = encontrarCategoriasPorPalavras(meta, [palavraForecast], true);
    if (!categorias.length && meta.categorias?.["0"]) categorias = ["0"];
    if (!categorias.length) throw new Error("Não encontrei o pipeline Comercial. Ajuste o nome no campo de configuração do Forecast.");

    const categoria = categorias[0];
    const nomeCategoria = nomeFunilSemCodigo(meta.categorias[categoria] || `Categoria ${categoria}`);

    const campos = [
      "ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "STAGE_SEMANTIC_ID", "PROBABILITY",
      "OPPORTUNITY", "CURRENCY_ID", "ASSIGNED_BY_ID", "COMPANY_ID", "CONTACT_ID", "LEAD_ID",
      "DATE_CREATE", "DATE_MODIFY", "MOVED_TIME", "CLOSEDATE", "CLOSED",
      "SOURCE_ID", "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY"
    ];

    const lista = await listarCompletoRelatorio(
      webhook,
      "crm.deal.list",
      campos,
      { "CATEGORY_ID": categoria },
      { ID: "ASC" },
      "Forecast: buscando negócios do Comercial..."
    );
    const deals = lista.dados;

    const idsEmpresa = [...new Set(deals.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
    const empresas = await buscarEntidadesPorIds(
      webhook,
      "crm.company.list",
      idsEmpresa,
      ["ID", "TITLE"]
    );

    const linhas = [];
    const vendedores = {};
    let fechado = 0;
    let perdido = 0;
    let commit = 0;
    let bestCase = 0;
    let pipeline = 0;
    let ponderadoAberto = 0;
    let pipelineAbertoSemana = 0;
    let semDataQtd = 0;
    let semDataValor = 0;
    let atrasadoQtd = 0;
    let atrasadoValor = 0;
    let abertosSemanaQtd = 0;

    for (const d of deals) {
      const stageMeta = meta.estagios?.[String(categoria)]?.[String(d.STAGE_ID)] || {};
      const stageLabel = stageMeta.label || d.STAGE_ID || "";
      const semantica = semanticaDeal(d, stageMeta);
      const probInformada = Number(d.PROBABILITY);
      const usaProbBitrix = Number.isFinite(probInformada) && probInformada > 0 && probInformada <= 100;
      const prob = usaProbBitrix ? probInformada : probabilidadeFallbackForecast(stageLabel, semantica);
      const bucket = classificarBucketForecast(prob, semantica);
      const valor = Number(d.OPPORTUNITY) || 0;
      const closeDate = parteDataISO(d.CLOSEDATE);
      const dentroSemana = dataDentroFaixa(d.CLOSEDATE, inicio, fim);
      const nomeEmpresa = idBitrixValido(d.COMPANY_ID)
        ? (empresas[idBitrixString(d.COMPANY_ID)]?.TITLE || "")
        : "";
      const vendedorId = idBitrixString(d.ASSIGNED_BY_ID);
      const vendedorNome = nomeUsuario(vendedorId) || (vendedorId ? `ID ${vendedorId}` : "Sem responsável");

      let situacaoSemana = "Fora da semana";
      let incluiForecast = "N";
      let ponderado = 0;

      if (semantica === "success" && dentroSemana) {
        situacaoSemana = "Ganho na semana";
        fechado += valor;
      } else if (semantica === "failure" && dentroSemana) {
        situacaoSemana = "Perdido na semana";
        perdido += valor;
      } else if (semantica === "process" && !ehEstagioPiloto(d.STAGE_ID, stageLabel)) {
        if (!closeDate) {
          situacaoSemana = "Sem CLOSEDATE";
          semDataQtd++;
          semDataValor += valor;
        } else if (closeDate < inicio) {
          situacaoSemana = "CLOSEDATE vencida";
          atrasadoQtd++;
          atrasadoValor += valor;
        } else if (dentroSemana) {
          situacaoSemana = "Aberto previsto na semana";
          incluiForecast = "S";
          abertosSemanaQtd++;
          pipelineAbertoSemana += valor;
          ponderado = valor * prob / 100;
          ponderadoAberto += ponderado;
          if (bucket === "Commit") commit += valor;
          else if (bucket === "Best Case") bestCase += valor;
          else pipeline += valor;
        }
      }

      const linha = {
        DEAL_ID: d.ID,
        CLIENTE: nomeEmpresa || d.TITLE || "",
        TITULO_NEGOCIO: d.TITLE || "",
        PIPELINE: nomeCategoria,
        ESTAGIO: stageLabel,
        SEMANTICA: semantica,
        RESPONSAVEL_ID: vendedorId,
        RESPONSAVEL: vendedorNome,
        CLOSEDATE: closeDate,
        OPPORTUNITY: valor,
        PROBABILIDADE_PCT: prob,
        FONTE_PROBABILIDADE: usaProbBitrix ? "PROBABILITY Bitrix" : "Fallback por estágio",
        BUCKET_FORECAST: bucket,
        SITUACAO_SEMANA: situacaoSemana,
        INCLUI_FORECAST_SEMANA: incluiForecast,
        FORECAST_PONDERADO: ponderado,
        LAST_ACTIVITY_TIME: d.LAST_ACTIVITY_TIME || "",
        MOVED_TIME: d.MOVED_TIME || ""
      };
      linhas.push(linha);

      if (!vendedores[vendedorId || "0"]) {
        vendedores[vendedorId || "0"] = {
          RESPONSAVEL_ID: vendedorId,
          RESPONSAVEL: vendedorNome,
          NEGOCIOS_PREVISTOS: 0,
          PIPELINE_ABERTO_SEMANA: 0,
          COMMIT: 0,
          BEST_CASE: 0,
          PIPELINE: 0,
          FORECAST_PONDERADO_ABERTO: 0,
          FECHADO_SEMANA: 0,
          FORECAST_TOTAL: 0
        };
      }
      const v = vendedores[vendedorId || "0"];
      if (situacaoSemana === "Aberto previsto na semana") {
        v.NEGOCIOS_PREVISTOS++;
        v.PIPELINE_ABERTO_SEMANA += valor;
        v.FORECAST_PONDERADO_ABERTO += ponderado;
        if (bucket === "Commit") v.COMMIT += valor;
        else if (bucket === "Best Case") v.BEST_CASE += valor;
        else v.PIPELINE += valor;
      }
      if (situacaoSemana === "Ganho na semana") v.FECHADO_SEMANA += valor;
    }

    const forecastTotal = fechado + ponderadoAberto;

    // v16 — meta mensal sempre olha o mês-calendário ATUAL (hoje), não o mês do
    // período selecionado no passo 3: o card de meta mensal deve refletir "como
    // estamos indo este mês", mesmo que o usuário esteja olhando o forecast de
    // outra semana. "Fechado no mês" soma até hoje (nunca no futuro).
    const hojeISO = formatarDataISO(new Date());
    const campoMetaMensal = document.getElementById("metaForecastMensal");
    let metaMensal = Number(campoMetaMensal?.value) || 0;
    if (!metaMensal) {
      metaMensal = metaMensalPadrao(hojeISO);
      if (campoMetaMensal && metaMensal) campoMetaMensal.value = metaMensal;
    }
    const [anoMes, mesMes] = hojeISO.split("-").map(Number);
    const mesInicio = `${anoMes}-${String(mesMes).padStart(2, "0")}-01`;
    const ultimoDiaMesCalendario = formatarDataISO(new Date(anoMes, mesMes, 0));
    const mesFim = hojeISO < ultimoDiaMesCalendario ? hojeISO : ultimoDiaMesCalendario;

    // v12 — meta semanal explícita = meta mensal ÷ nº de semanas do mês (7 em 7 dias,
    // arredondado para cima). Só é usada quando o campo "Meta semanal" está vazio —
    // se o usuário informar um valor manual, esse valor manda.
    const diasNoMes = new Date(anoMes, mesMes, 0).getDate();
    const semanasNoMes = Math.ceil(diasNoMes / 7);
    const metaSemanalDerivada = metaMensal > 0 ? Math.round((metaMensal / semanasNoMes) * 100) / 100 : 0;
    const campoMetaSemanal = document.getElementById("metaForecastSemanal");
    let metaSemanal = Number(campoMetaSemanal?.value) || 0;
    let metaSemanalOrigem = "manual";
    if (!metaSemanal && metaSemanalDerivada) {
      metaSemanal = metaSemanalDerivada;
      metaSemanalOrigem = "derivada";
      if (campoMetaSemanal) campoMetaSemanal.value = metaSemanal;
    }
    const gap = metaSemanal > 0 ? Math.max(0, metaSemanal - forecastTotal) : 0;

    // v13 — além do fechado no mês, soma o pipeline aberto ponderado do mês
    // inteiro (mesmo critério do semanal: sem estágios "Piloto") para dar uma
    // projeção mensal de verdade, não só o que já foi entregue.
    let fechadoMes = 0;
    let pipelinePonderadoMes = 0;
    for (const d of deals) {
      const stageMeta = meta.estagios?.[String(categoria)]?.[String(d.STAGE_ID)] || {};
      const stageLabelMes = stageMeta.label || d.STAGE_ID || "";
      const semanticaMes = semanticaDeal(d, stageMeta);
      if (semanticaMes === "success" && dataDentroFaixa(d.CLOSEDATE, mesInicio, mesFim)) {
        fechadoMes += Number(d.OPPORTUNITY) || 0;
      } else if (semanticaMes === "process" && !ehEstagioPiloto(d.STAGE_ID, stageLabelMes) && dataDentroFaixa(d.CLOSEDATE, mesInicio, mesFim)) {
        const probInformadaMes = Number(d.PROBABILITY);
        const probMes = Number.isFinite(probInformadaMes) && probInformadaMes > 0 && probInformadaMes <= 100
          ? probInformadaMes
          : probabilidadeFallbackForecast(stageLabelMes, semanticaMes);
        pipelinePonderadoMes += (Number(d.OPPORTUNITY) || 0) * probMes / 100;
      }
    }
    const forecastMesTotal = fechadoMes + pipelinePonderadoMes;
    const gapMensal = metaMensal > 0 ? Math.max(0, metaMensal - fechadoMes) : 0;

    atualizarStatus(`Forecast: montando modelo executivo ${marcaAtiva().nome}...`);
    const modeloVisualForecast = await construirDadosModeloForecast(webhook, meta, inicio, fim, deals);

    // v21 — grava a "foto" de hoje no histórico local (ver js/jornada.js) já com
    // o "fechado" recalculado a partir de modeloVisualForecast.resumo.FECHADOS_VALOR
    // (mesma base da seção "✅ Fechados" do relatório visual: negócios no
    // Financeiro em "Contrato assinado"), em vez de fechadoMes (só o funil
    // Comercial marcado como ganho) — pra a tendência não repetir a mesma
    // divergência corrigida em gerarHTMLForecastModelo().
    if (metaMensal > 0) {
      const fechadoConsistente = Number(modeloVisualForecast?.resumo?.FECHADOS_VALOR) || 0;
      const pipelinePonderadoDelta = Math.max(0, forecastMesTotal - fechadoMes);
      salvarHistoricoForecastLocal({ data: hojeISO, metaMensal, fechadoMes: fechadoConsistente, projecaoMes: fechadoConsistente + pipelinePonderadoDelta });
    }

    const vendedoresLista = Object.values(vendedores)
      .map((v) => ({ ...v, FORECAST_TOTAL: v.FECHADO_SEMANA + v.FORECAST_PONDERADO_ABERTO }))
      .filter((v) => v.NEGOCIOS_PREVISTOS || v.FECHADO_SEMANA)
      .sort((a, b) => b.FORECAST_TOTAL - a.FORECAST_TOTAL);

    resultadoForecastSemanal = {
      meta: {
        inicio, fim, pipeline_id: categoria, pipeline: nomeCategoria,
        meta_semanal: metaSemanal, meta_mensal: metaMensal, mes_inicio: mesInicio, mes_fim: mesFim,
        semanas_no_mes: semanasNoMes, meta_semanal_derivada: metaSemanalDerivada, meta_semanal_origem: metaSemanalOrigem,
        total_bitrix_pipeline: lista.total,
        registros_extraidos: deals.length,
        duplicados_api_ignorados: lista.duplicados
      },
      resumo: {
        FECHADO_SEMANA: fechado,
        PERDIDO_SEMANA: perdido,
        COMMIT: commit,
        BEST_CASE: bestCase,
        PIPELINE: pipeline,
        PIPELINE_ABERTO_SEMANA: pipelineAbertoSemana,
        FORECAST_PONDERADO_ABERTO: ponderadoAberto,
        FORECAST_TOTAL: forecastTotal,
        META_SEMANAL: metaSemanal,
        GAP_META: gap,
        ATINGIMENTO_SEMANAL_PCT: metaSemanal > 0 ? Math.round((fechado / metaSemanal) * 1000) / 10 : null,
        FECHADO_MES: fechadoMes,
        PIPELINE_PONDERADO_MES: pipelinePonderadoMes,
        FORECAST_MES_TOTAL: forecastMesTotal,
        META_MENSAL: metaMensal,
        GAP_MENSAL: gapMensal,
        ATINGIMENTO_MENSAL_PCT: metaMensal > 0 ? Math.round((fechadoMes / metaMensal) * 1000) / 10 : null,
        ABERTOS_PREVISTOS_SEMANA: abertosSemanaQtd,
        SEM_CLOSEDATE_QTD: semDataQtd,
        SEM_CLOSEDATE_VALOR: semDataValor,
        CLOSEDATE_VENCIDA_QTD: atrasadoQtd,
        CLOSEDATE_VENCIDA_VALOR: atrasadoValor
      },
      vendedores: vendedoresLista,
      negocios: linhas.filter((r) => r.SITUACAO_SEMANA !== "Fora da semana"),
      higiene: linhas.filter((r) => r.SITUACAO_SEMANA === "Sem CLOSEDATE" || r.SITUACAO_SEMANA === "CLOSEDATE vencida"),
      modelo_visual: modeloVisualForecast
    };

    renderizarForecastSemanal();
    dadosExtraidos = resultadoForecastSemanal.negocios;
    camposExtraidos = camposDeDados(dadosExtraidos);
    atualizarStatus(`Forecast concluído: ${abertosSemanaQtd} negócio(s) aberto(s) previstos para a semana; forecast total ${moedaRelatorio(forecastTotal)}.`);
  } catch (e) {
    mostrarErro("Não foi possível montar o Forecast semanal.\n\nDetalhe técnico: " + e.message);
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

function renderizarForecastSemanal() {
  const r = resultadoForecastSemanal;
  if (!r?.resumo) return;
  document.getElementById("bloco-forecast-semanal").classList.remove("oculto");
  document.getElementById("forecastPeriodoTexto").innerHTML =
    `<strong>${escapeHtmlRelatorio(r.meta.pipeline)}</strong> • ${escapeHtmlRelatorio(formatarDataBR(r.meta.inicio))} até ${escapeHtmlRelatorio(formatarDataBR(r.meta.fim))}.` +
    (r.meta.meta_mensal ? ` Meta mensal (${escapeHtmlRelatorio(mesAnoBR(r.meta.mes_inicio))}): <strong>${moedaRelatorio(r.meta.meta_mensal)}</strong>.` : " Meta mensal não informada.");

  // v29 — "Fechado no mês" aqui usa a mesma base já alinhada em
  // gerarHTMLForecastModelo() (r.modelo_visual.resumo.FECHADOS_VALOR:
  // negócios no Financeiro em "Contrato assinado"), em vez de
  // r.resumo.FECHADO_MES (só o funil Comercial marcado como ganho). Sem essa
  // troca, este card e o card "Entregue" do relatório visual mostravam dois
  // valores diferentes para o mesmo rótulo na mesma sessão de extração.
  // Fallback pro valor antigo só se modelo_visual não tiver sido calculado.
  const fechadoMesConsistente = Number(r.modelo_visual?.resumo?.FECHADOS_VALOR ?? r.resumo.FECHADO_MES) || 0;
  const kpis = [
    ["Fechado na semana", moedaRelatorio(r.resumo.FECHADO_SEMANA), "forecastNegociosTabela"],
    ["Fechado no mês", moedaRelatorio(fechadoMesConsistente), "forecastNegociosTabela"],
    ["Forecast total (semana)", moedaRelatorio(r.resumo.FORECAST_TOTAL), "forecastNegociosTabela"],
    ["Forecast total (mês)", moedaRelatorio(r.resumo.FORECAST_MES_TOTAL), "forecastNegociosTabela"],
    ["Commit", moedaRelatorio(r.resumo.COMMIT), "forecastNegociosTabela"],
    ["Best Case", moedaRelatorio(r.resumo.BEST_CASE), "forecastNegociosTabela"],
    ["Pipeline", moedaRelatorio(r.resumo.PIPELINE), "forecastNegociosTabela"],
    // v17 — meta mensal ao lado do Pipeline, só o número da meta.
    ["Meta mensal", r.meta.meta_mensal ? moedaRelatorio(r.meta.meta_mensal) : "não informada"],
    ["Abertos previstos", r.resumo.ABERTOS_PREVISTOS_SEMANA, "forecastNegociosTabela"],
    ["Sem CLOSEDATE", r.resumo.SEM_CLOSEDATE_QTD, "forecastHigieneTabela"]
  ];
  document.getElementById("forecastKpis").innerHTML = kpis.map(([rotulo, valor, alvo]) => kpiCardHtml(rotulo, valor, alvo)).join("");

  const metaBarrasEl = document.getElementById("forecastMetasBarras");
  if (metaBarrasEl) metaBarrasEl.innerHTML = "";

  document.getElementById("forecastVendedoresTabela").innerHTML = tabelaRelatorio([
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Negócios", valor: "NEGOCIOS_PREVISTOS" },
    { label: "Fechado", valor: (x) => moedaRelatorio(x.FECHADO_SEMANA), html: true },
    { label: "Commit", valor: (x) => moedaRelatorio(x.COMMIT), html: true },
    { label: "Best Case", valor: (x) => moedaRelatorio(x.BEST_CASE), html: true },
    { label: "Pipeline", valor: (x) => moedaRelatorio(x.PIPELINE), html: true },
    { label: "Ponderado", valor: (x) => moedaRelatorio(x.FORECAST_PONDERADO_ABERTO), html: true },
    { label: "Forecast total", valor: (x) => `<strong>${moedaRelatorio(x.FORECAST_TOTAL)}</strong>`, html: true }
  ], r.vendedores);

  document.getElementById("forecastNegociosTabela").innerHTML = tabelaRelatorio([
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Negócio", valor: "DEAL_ID" },
    { label: "Estágio", valor: "ESTAGIO" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "CLOSEDATE", valor: (x) => formatarDataBR(x.CLOSEDATE) },
    { label: "Valor", valor: (x) => moedaRelatorio(x.OPPORTUNITY), html: true },
    { label: "Prob.", valor: (x) => `${x.PROBABILIDADE_PCT}%` },
    { label: "Bucket", valor: (x) => `<span class="badge-relatorio">${escapeHtmlRelatorio(x.BUCKET_FORECAST)}</span>`, html: true },
    { label: "Situação", valor: "SITUACAO_SEMANA" },
    { label: "Ponderado", valor: (x) => moedaRelatorio(x.FORECAST_PONDERADO), html: true }
  ], r.negocios);

  document.getElementById("forecastHigieneTabela").innerHTML = tabelaRelatorio([
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Negócio", valor: "DEAL_ID" },
    { label: "Estágio", valor: "ESTAGIO" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "CLOSEDATE", valor: (x) => formatarDataBR(x.CLOSEDATE) },
    { label: "Valor", valor: (x) => moedaRelatorio(x.OPPORTUNITY), html: true },
    { label: "Problema", valor: (x) => `<span class="badge-relatorio alerta">${escapeHtmlRelatorio(x.SITUACAO_SEMANA)}</span>`, html: true }
  ], r.higiene);
}

// ---------------------------- Diário SDR -----------------------------------

var TIPOS_ATIVIDADE_BITRIX = {
  "1": "Reunião",
  "2": "Ligação",
  "3": "Tarefa",
  "4": "E-mail",
  "5": "Ação",
  "6": "Ação do usuário"
};

