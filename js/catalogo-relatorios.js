var extracaoCancelada = false;
var resultadoRelatorioCatalogo = {};
if (typeof atualizarStatus === "undefined") var atualizarStatus = function(){};
if (typeof esconderErro === "undefined") var esconderErro = function(){};
if (typeof mostrarErro === "undefined") var mostrarErro = function(){};

if(typeof globalThis!=="undefined"){
  if(typeof globalThis.atualizarStatus!=="function") globalThis.atualizarStatus=()=>{};
  if(typeof globalThis.esconderErro!=="function") globalThis.esconderErro=()=>{};
  if(typeof globalThis.mostrarErro!=="function") globalThis.mostrarErro=(msg)=>{console.error(msg);};
  if(typeof globalThis.extracaoCancelada==="undefined") globalThis.extracaoCancelada=false;
}

async function mapaOrigensRelatorio(webhook){
  const a=await carregarListaPaginada(webhook,"crm.status.list",{"filter[ENTITY_ID]":"SOURCE","order[SORT]":"ASC"});
  const m={};a.forEach((x)=>m[String(x.STATUS_ID)]=x.NAME||x.STATUS_ID);return m;
}

async function baseDealsCatalogo(webhook,somenteComercial=false){
  const [meta]=await Promise.all([buscarMetadadosFunisEEstagios(webhook),buscarUsuariosJornada(webhook)]);
  let cats=[];
  if(somenteComercial){cats=encontrarCategoriasPorPalavras(meta,["comercial"],true);if(!cats.length&&meta.categorias?.["0"])cats=["0"];}
  const filtro={};if(somenteComercial&&cats.length===1)filtro.CATEGORY_ID=cats[0];else if(somenteComercial&&cats.length>1)filtro["@CATEGORY_ID"]=cats;
  const busca=await listarCompletoRelatorio(webhook,"crm.deal.list",[
    "ID","TITLE","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID","PROBABILITY","OPPORTUNITY","CURRENCY_ID",
    "ASSIGNED_BY_ID","CREATED_BY_ID","MODIFY_BY_ID","MOVED_BY_ID","COMPANY_ID","CONTACT_ID","LEAD_ID",
    "SOURCE_ID","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM","DATE_CREATE","DATE_MODIFY",
    "MOVED_TIME","CLOSEDATE","BEGINDATE","UF_CRM_1770928318695","CLOSED","LAST_ACTIVITY_TIME","LAST_ACTIVITY_BY"
  ],filtro,{ID:"ASC"},"Relatório: buscando negócios...");
  const ids=[...new Set(busca.dados.map((d)=>d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  const empresas=await buscarEntidadesPorIds(webhook,"crm.company.list",ids,["ID","TITLE","PHONE","EMAIL","DATE_CREATE","ASSIGNED_BY_ID"]);
  return{meta,deals:busca.dados,empresas,busca};
}

function enriquecerDealCatalogo(d,b){
  const cat=String(d.CATEGORY_ID??""),sm=b.meta.estagios?.[cat]?.[String(d.STAGE_ID)]||{},sem=semanticaDeal(d,sm);
  const emp=idBitrixValido(d.COMPANY_ID)?b.empresas[idBitrixString(d.COMPANY_ID)]:null;
  return{...d,_FUNIL:nomeFunilSemCodigo(b.meta.categorias?.[cat]||`Categoria ${cat}`),_ESTAGIO:sm.label||d.STAGE_ID||"",
    _SEMANTICA:sem,_CLIENTE:emp?.TITLE||d.TITLE||"",_RESPONSAVEL:nomeUsuario(d.ASSIGNED_BY_ID)||(d.ASSIGNED_BY_ID?`ID ${d.ASSIGNED_BY_ID}`:"Sem responsável"),
    _VALOR:valorDeal(d),_FECHAMENTO:fecharDataDeal(d),_CICLO:cicloDealDias(d)};
}

async function baseLeadsCatalogo(webhook){
  const [st]=await Promise.all([carregarListaPaginada(webhook,"crm.status.list",{"filter[ENTITY_ID]":"STATUS","order[SORT]":"ASC"}),buscarUsuariosJornada(webhook)]);
  const sm={};st.forEach((x)=>sm[String(x.STATUS_ID)]=x);
  const busca=await listarCompletoRelatorio(webhook,"crm.lead.list",[
    "ID","TITLE","NAME","LAST_NAME","COMPANY_ID","COMPANY_TITLE","CONTACT_ID","STATUS_ID","STATUS_SEMANTIC_ID",
    "SOURCE_ID","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM","OPPORTUNITY","ASSIGNED_BY_ID",
    "CREATED_BY_ID","DATE_CREATE","DATE_MODIFY","MOVED_TIME","DATE_CLOSED","LAST_ACTIVITY_TIME","LAST_ACTIVITY_BY","PHONE","EMAIL"
  ],{},{ID:"ASC"},"Relatório: buscando Leads...");
  return{leads:busca.dados,statusMap:sm,statusLeads:st,busca};
}
function semanticaLead(l){
  const s=String(l.STATUS_SEMANTIC_ID||"").toLowerCase();
  if(s==="s"||s==="success"||String(l.STATUS_ID)==="CONVERTED")return"success";
  if(s==="f"||s==="failure"||String(l.STATUS_ID)==="JUNK")return"failure";
  return"process";
}
async function atividadesCatalogo(webhook,completed,inicio="",fim=""){
  const f={};if(completed!==null)f.COMPLETED=completed?"Y":"N";
  if(inicio)f[">=END_TIME"]=`${inicio}T00:00:00-03:00`;if(fim)f["<=END_TIME"]=`${fim}T23:59:59-03:00`;
  await buscarUsuariosJornada(webhook);
  return listarCompletoRelatorio(webhook,"crm.activity.list",[
    "ID","OWNER_ID","OWNER_TYPE_ID","TYPE_ID","PROVIDER_ID","PROVIDER_TYPE_ID","SUBJECT","COMPLETED",
    "RESPONSIBLE_ID","AUTHOR_ID","CREATED","LAST_UPDATED","START_TIME","END_TIME","DEADLINE","DIRECTION","BINDINGS"
  ],f,{ID:"ASC"},"Relatório: buscando atividades...");
}

// ---------------------------------------------------------------------------
// Reuniões — agendadas x realizadas, de DUAS fontes complementares:
//
// 1) Atividade de Reunião (crm.activity.list, TYPE_ID=1) vinculada a um
//    negócio (CRM Deal) — "Agendada" = COMPLETED≠Y, "Realizada" = COMPLETED=Y.
//    Cobre times que registram a reunião como atividade de calendário.
//
// 2) Etapa do funil de Leads (crm.stagehistory.list, entityTypeId=1) — em
//    times cujo processo de SDR marca "Reunião Agendada"/"Reunião Realizada"
//    como STATUS_ID do próprio Lead (não como atividade), isso é o sinal
//    real; sem essa fonte o relatório subconta ou zera esses times (caso
//    real: BDR com 31 Leads passando por "Reunião Agendada" em 2 meses e
//    zero atividade TYPE_ID=1 no nome dele). Os nomes dos estágios são
//    lidos dinamicamente por palavra-chave (encontrarEstagiosReuniaoLead) —
//    não hardcoda o STATUS_ID porque ele é específico de cada portal
//    (AtlasGR ≠ Total Trac).
//
// As duas fontes viram linhas no mesmo formato (ver resumoReunioesFunilRelatorio)
// e se somam nas mesmas tabelas — reaproveitado pelo relatório do Catálogo
// ("reunioes_sdr") e pelo bloco de Reuniões do Cockpit, mesma fonte nos dois
// lugares, sem redefinir nada. Período aplicado sobre END_TIME (atividades)
// ou CREATED_TIME do evento de estágio (Leads).
// ---------------------------------------------------------------------------
async function encontrarEstagiosReuniaoLead(webhook){
  const statusList=await carregarListaPaginada(webhook,"crm.status.list",{"filter[ENTITY_ID]":"STATUS","order[SORT]":"ASC"});
  const acha=(palavras)=>{
    const s=statusList.find((x)=>textoContemAlgumaPalavra(x.NAME||"",palavras));
    return s?String(s.STATUS_ID):null;
  };
  return{
    agendada:acha(["reuniao agendada"]),
    realizada:acha(["reuniao realizada"]),
    noShow:acha(["no show"]),
  };
}

async function buscarReunioesFunilRelatorio(webhook,inicio="",fim=""){
  const meta=await buscarMetadadosFunisEEstagios(webhook);
  const a=await atividadesCatalogo(webhook,null,inicio,fim);
  const reunioes=a.dados.filter((x)=>String(x.TYPE_ID)==="1");
  const idsDeals=[...new Set(reunioes.flatMap((r)=>bindingsDaAtividade(r).filter((b)=>b.OWNER_TYPE_ID==="2").map((b)=>b.OWNER_ID)))];
  const mapaDeals={};
  if(idsDeals.length){
    const encontrados=await buscarEntidadesPorIds(webhook,"crm.deal.list",idsDeals,["ID","CATEGORY_ID","STAGE_ID"]);
    Object.entries(encontrados).forEach(([id,d])=>{mapaDeals[id]={categoria:String(d.CATEGORY_ID??""),estagio:String(d.STAGE_ID??"")}});
  }

  // Fonte 2: eventos de entrada nas etapas "Reunião Agendada"/"Reunião
  // Realizada"/"No-Show" do funil de Leads, dentro do período. Resiliente:
  // se falhar (ex: webhook sem permissão de crm.lead/stagehistory, comum em
  // portais com escopo restrito), cai de volta a só a Fonte 1 em vez de
  // derrubar o relatório inteiro.
  let eventosEstagioLead=[],mapaLeadsResponsavel={};
  try{
    const estagios=await encontrarEstagiosReuniaoLead(webhook);
    const idsEstagio=Object.values(estagios).filter(Boolean);
    if(idsEstagio.length && inicio && fim){
      const url=new URL(`${webhook.replace(/\/$/,"")}/crm.stagehistory.list.json`);
      url.searchParams.append("entityTypeId","1");
      url.searchParams.append("filter[>=CREATED_TIME]",`${inicio}T00:00:00-03:00`);
      url.searchParams.append("filter[<=CREATED_TIME]",`${fim}T23:59:59-03:00`);
      idsEstagio.forEach((id)=>url.searchParams.append("filter[@STATUS_ID][]",id));
      const body=await bitrixFetchComRetentativa(url.toString());
      const itens=body?.result?.items||(Array.isArray(body?.result)?body.result:[]);
      const nomeEstagio={};
      Object.entries(estagios).forEach(([chave,id])=>{if(id)nomeEstagio[id]=chave==="agendada"?"Reunião Agendada":chave==="realizada"?"Reunião Realizada":"No-Show";});
      eventosEstagioLead=itens.map((e)=>({ID:e.ID,LEAD_ID:String(e.OWNER_ID),STATUS_ID:String(e.STATUS_ID),ETAPA:nomeEstagio[String(e.STATUS_ID)]||e.STATUS_ID,CRIADO:e.CREATED_TIME}));
      const idsLead=[...new Set(eventosEstagioLead.map((e)=>e.LEAD_ID))];
      if(idsLead.length){
        const leadsEncontrados=await buscarEntidadesPorIds(webhook,"crm.lead.list",idsLead,["ID","TITLE","NAME","LAST_NAME","COMPANY_TITLE","ASSIGNED_BY_ID"]);
        Object.entries(leadsEncontrados).forEach(([id,l])=>{mapaLeadsResponsavel[id]={responsavelId:idBitrixString(l.ASSIGNED_BY_ID),titulo:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||`Lead ${id}`};});
      }
    }
  }catch(e){
    eventosEstagioLead=[];mapaLeadsResponsavel={};
  }

  return{reunioes,meta,mapaDeals,eventosEstagioLead,mapaLeadsResponsavel};
}

// Pipeline/etapa do PRIMEIRO negócio (CRM Deal) vinculado à atividade que já
// foi encontrado em mapaDeals. Sem Deal vinculado, a atividade ainda entra
// no relatório (fica "Sem negócio vinculado") — o sinal de Leads não vem
// mais daqui, vem da Fonte 2 (eventosEstagioLead) em resumoReunioesFunilRelatorio.
function reuniaoVinculoFunilEtapa(r,base){
  const vinculo=bindingsDaAtividade(r).find((b)=>b.OWNER_TYPE_ID==="2"&&base.mapaDeals[String(b.OWNER_ID)]);
  if(!vinculo)return{pipeline:"Sem negócio vinculado (Lead/Contato/Empresa)",pipelineId:"",etapa:"—"};
  const d=base.mapaDeals[String(vinculo.OWNER_ID)];
  const pipeline=nomeFunilSemCodigo(base.meta.categorias?.[d.categoria]||`Categoria ${d.categoria}`);
  const etapa=base.meta.estagios?.[d.categoria]?.[d.estagio]?.label||d.estagio||"—";
  return{pipeline,pipelineId:d.categoria,etapa};
}

function resumoReunioesFunilRelatorio(base){
  const linhasAtividade=base.reunioes.map((r)=>{
    const{pipeline,pipelineId,etapa}=reuniaoVinculoFunilEtapa(r,base);
    const respId=idBitrixString(r.RESPONSIBLE_ID);
    const subjNorm=normalizarTextoChave(r.SUBJECT||"");
    let situacao=String(r.COMPLETED)==="Y"?"Realizada":"Agendada";
    if(String(r.COMPLETED)!=="Y"&&(subjNorm.includes("no show")||subjNorm.includes("noshow")||subjNorm.includes("faltou")||subjNorm.includes("nao compareceu"))){
      situacao="No-Show";
    }
    return{
      ID:`ativ_${r.ID}`,ASSUNTO:r.SUBJECT||"",
      RESPONSAVEL:nomeUsuario(respId)||(respId?`ID ${respId}`:"Sem responsável"),
      SITUACAO:situacao,
      INICIO:r.START_TIME||"",FIM:r.END_TIME||"",
      PIPELINE:pipeline,ETAPA:etapa,ORIGEM:"Atividade (TYPE_ID=1)",
      _RESPONSAVEL_ID:respId,_PIPELINE_ID:pipelineId,
    };
  });
  const linhasLead=(base.eventosEstagioLead||[]).map((e)=>{
    const l=base.mapaLeadsResponsavel?.[e.LEAD_ID];
    const respId=l?.responsavelId||"";
    const situacao=e.ETAPA==="Reunião Realizada"?"Realizada":e.ETAPA==="No-Show"?"No-Show":"Agendada";
    return{
      ID:`lead_${e.ID}`,ASSUNTO:l?.titulo||`Lead ${e.LEAD_ID}`,
      RESPONSAVEL:nomeUsuario(respId)||(respId?`ID ${respId}`:"Sem responsável"),
      SITUACAO:situacao,
      INICIO:e.CRIADO,FIM:e.CRIADO,
      PIPELINE:"Leads",ETAPA:e.ETAPA,ORIGEM:"Etapa do Lead",
      _RESPONSAVEL_ID:respId,_PIPELINE_ID:"leads",
    };
  });
  const linhas=[...linhasAtividade,...linhasLead];
  return{
    linhas,
    agendadas:linhas.filter((x)=>x.SITUACAO==="Agendada"),
    realizadas:linhas.filter((x)=>x.SITUACAO==="Realizada"),
    noShow:linhas.filter((x)=>x.SITUACAO==="No-Show"),
  };
}

// Agrupa as reuniões (já resumidas por resumoReunioesFunilRelatorio) por um
// campo qualquer (RESPONSAVEL/PIPELINE/ETAPA) — é o que permite "puxar
// qualquer etapa de qualquer pipeline e de qualquer usuário": as três tabelas
// do relatório e do Cockpit reaproveitam esta mesma função, só trocando o campo.
function agruparReunioesPor(linhas,campo){
  const m={};
  linhas.forEach((x)=>{
    const k=x[campo]||"—";
    if(!m[k])m[k]={[campo]:k,AGENDADAS:0,REALIZADAS:0,NOSHOW:0,TOTAL:0};
    m[k].TOTAL++;
    if(x.SITUACAO==="Agendada")m[k].AGENDADAS++;
    else if(x.SITUACAO==="No-Show")m[k].NOSHOW++;
    else m[k].REALIZADAS++;
  });
  return Object.values(m).sort((a,b)=>b.TOTAL-a.TOTAL);
}

function criarResultadoCatalogo(chave,titulo,subtitulo,kpis,tabelas,nota=""){
  resultadoRelatorioCatalogo={chave,titulo,subtitulo,kpis,tabelas,nota};
  const t=tabelas?.find((x)=>x.dados?.length);dadosExtraidos=t?.dados||[];camposExtraidos=camposDeDados(dadosExtraidos);
  renderizarRelatorioCatalogo();
}
function renderizarRelatorioCatalogo(){
  const r=resultadoRelatorioCatalogo;if(!r?.titulo)return;
  document.getElementById("bloco-relatorio-catalogo").classList.remove("oculto");
  document.getElementById("relatorioResultadoTitulo").textContent=r.titulo;
  document.getElementById("relatorioResultadoSubtitulo").innerHTML=r.subtitulo||"";
  document.getElementById("relatorioResultadoKpis").innerHTML=(r.kpis||[]).map((x)=>kpiCardHtml(x.rotulo,x.valor,r.tabelas?.length?"relatorioResultadoTabelas":undefined)).join("");
  const metaBarrasEl=document.getElementById("relatorioResultadoMetaBarras");if(metaBarrasEl)metaBarrasEl.innerHTML=r.barra_meta||"";
  const iaEl=document.getElementById("relatorioResultadoIA");
  if(iaEl && typeof iaDiagnosticarRelatorioCatalogo==="function"){
    const diag=iaDiagnosticarRelatorioCatalogo(r);
    iaEl.innerHTML=diag?iaRenderizarCardInsightsHTML(diag):"";
  }
  document.getElementById("relatorioResultadoTabelas").innerHTML=(r.tabelas||[]).map((t)=>`<div class="relatorio-subtitulo">${escapeHtmlRelatorio(t.titulo)}</div><div class="relatorio-scroll">${tabelaRelatorio(t.colunas,t.dados||[],t.limite||300)}</div>`).join("");
  document.getElementById("relatorioResultadoNota").textContent=r.nota||"";
  const temVisual=!!(r.titulo&&(r.kpis?.length||r.tabelas?.length));
  document.getElementById("btnAbrirVisualCatalogo")?.classList.toggle("oculto",!temVisual);
  document.getElementById("btnBaixarVisualCatalogo")?.classList.toggle("oculto",!temVisual);
}
// v11 — modelo visual genérico: mesmo letterhead/hero/kpis do modelo do Forecast,
// aplicado a QUALQUER relatório do catálogo (chave/titulo/subtitulo/kpis/tabelas),
// não só ao Forecast mensal. Cada tabela vira uma seção retrátil com model-table.
// v25 — varre os KPIs à procura de padrões que sempre indicam algo que
// merece atenção (vencido, atrasado, sem atividade/dados, fora do SLA,
// crítico...) e monta alertas automáticos — funciona em QUALQUER relatório
// do catálogo/Diário SDR/Jornada sem precisar de lógica dedicada por
// relatório, já que só olha rótulo + valor numérico dos KPIs que o próprio
// relatório já calculou.
function pontosDeAtencaoGenerico(kpis){
  const PADROES=/vencid|atrasad|sem atividade|sem closedate|sem clientedate|fora do sla|fora sla|cr[ií]tico|sem contato|pendente|não localizado/i;
  const achados=(kpis||[]).filter((x)=>{
    const n=Number(String(x.valor).replace(/[^\d,.-]/g,"").replace(",","."));
    return PADROES.test(x.rotulo||"")&&Number.isFinite(n)&&n>0;
  });
  if(!achados.length)return "";
  const itens=achados.map((x)=>`<li><strong>${escapeHtmlRelatorio(x.valor)}</strong> — ${escapeHtmlRelatorio(x.rotulo)}</li>`).join("");
  return `<div class="alert-banner warn" style="align-items:flex-start;"><span class="icon">⚠️</span><div><strong>Pontos de atenção encontrados neste relatório:</strong><ul style="margin:6px 0 0;padding-left:18px;">${itens}</ul></div></div>`;
}
function gerarHTMLRelatorioVisualGenerico(r){
  if(!r?.titulo)return "";
  const marca=marcaAtiva();
  const kpisHtml=(r.kpis||[]).map((x)=>`<div class="kpi"><div class="label">${escapeHtmlRelatorio(x.rotulo)}</div><div class="value valor-pisca">${escapeHtmlRelatorio(x.valor)}</div></div>`).join("");
  const atencaoHtml=pontosDeAtencaoGenerico(r.kpis);
  const tabelasHtml=(r.tabelas||[]).map((t,i)=>{
    const tabela=tabelaModelo((t.colunas||[]).map((c)=>({label:c.label,valor:typeof c.valor==="function"?c.valor:(row)=>row[c.valor],html:!!c.html})),(t.dados||[]).slice(0,t.limite||300));
    return `<details class="vcard section-card"${i===0?" open":""}><summary><span class="vcard-name">${escapeHtmlRelatorio(t.titulo||`Tabela ${i+1}`)}</span><span class="vcard-stats">${(t.dados||[]).length} registro(s)</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${tabela}</div></details>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlRelatorio(r.titulo)} · ${escapeHtmlRelatorio(marca.nome)}</title><style>${modeloExecutivoCssParaMarca(marca)}</style></head><body>`+
  `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${marca.logoSvg}<div class="letterhead-divider"></div><div class="letterhead-tagline">${escapeHtmlRelatorio(marca.tagline)}</div></div><div class="letterhead-ref"><strong>Relatório Comercial</strong><br>Extraído do Bitrix24 em ${formatarDataBR(formatarDataISO(new Date()))}</div></div></div>`+
  `<header class="hero"><div class="hero-inner"><p class="eyebrow">Relatório Comercial · Bitrix24</p><h1>${escapeHtmlRelatorio(r.titulo)}</h1><p class="subtitle">${(r.subtitulo||"").replace(/<[^>]+>/g,"")||`Extraído automaticamente pelo extrator ${escapeHtmlRelatorio(marca.nome)}.`}</p></div></header>`+
  `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">Visão geral</h2>${atencaoHtml}<div class="kpis">${kpisHtml||'<p class="small-note">Sem indicadores.</p>'}</div></div>`+
  `<h2 class="section">Detalhamento</h2><div class="top3grid">${tabelasHtml||'<p class="small-note">Sem tabelas neste relatório.</p>'}</div>`+
  (r.nota?`<div class="note">${escapeHtmlRelatorio(r.nota)}</div>`:"")+
  `<a class="back-to-overview" href="#visao-geral">↑ Voltar à Visão geral</a></div><footer><div class="footer-brand">${marca.logoSvg}<span>${escapeHtmlRelatorio(marca.nome)}</span></div>${escapeHtmlRelatorio(marca.nome)} · ${escapeHtmlRelatorio(r.titulo)}</footer></body></html>`;
}
function abrirRelatorioVisualCatalogo(){
  const r=resultadoRelatorioCatalogo;if(!r?.titulo)return;
  const h=(r.chave==="forecast_mensal"&&r.modelo_visual)?gerarHTMLForecastModelo(r,"mensal"):gerarHTMLRelatorioVisualGenerico(r);
  if(h)mostrarRelatorioVisualInline(h,r.titulo);
}
function baixarHTMLRelatorioVisualCatalogo(){
  const r=resultadoRelatorioCatalogo;if(!r?.titulo)return;
  const h=(r.chave==="forecast_mensal"&&r.modelo_visual)?gerarHTMLForecastModelo(r,"mensal"):gerarHTMLRelatorioVisualGenerico(r);
  if(h)baixarArquivo(h,`bitrix_${r.chave}_modelo_atlas_${dataHoje()}.html`,"text/html;charset=utf-8;");
}
function baixarCSVRelatorioCatalogo(){
  const t=resultadoRelatorioCatalogo?.tabelas?.find((x)=>x.dados?.length);if(t)baixarCsvDatasetEspecial(t.dados,`bitrix_${resultadoRelatorioCatalogo.chave}_${dataHoje()}.csv`);
}
function baixarJSONRelatorioCatalogo(){
  if(resultadoRelatorioCatalogo?.titulo)baixarArquivo(JSON.stringify(resultadoRelatorioCatalogo,null,2),`bitrix_${resultadoRelatorioCatalogo.chave}_${dataHoje()}.json`,"application/json;charset=utf-8;");
}

async function extrairRelatorioCatalogo(webhook,chave){
  const elSpinner=document.getElementById("spinner");if(elSpinner?.style)elSpinner.style.display="inline-block";
  const elBtnExt=document.getElementById("btnExtrair");if(elBtnExt)elBtnExt.disabled=true;
  const elBtnPar=document.getElementById("btnParar");if(elBtnPar)elBtnPar.disabled=false;
  extracaoCancelada = false;
  if(typeof esconderErro==="function")esconderErro();
  resultadoRelatorioCatalogo={};
  try{
    const p=periodoCatalogo();

    if(chave==="forecast_mensal"){
      const b=await baseDealsCatalogo(webhook,true),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b));
      const campoMetaCatalogo=document.getElementById("metaRelatorioComercial");
      let meta=Number(campoMetaCatalogo?.value)||0;
      if(!meta){meta=metaMensalPadrao(p.fim||p.referencia);if(campoMetaCatalogo&&meta)campoMetaCatalogo.value=meta;}
      // v12 — deixa explícita a divisão da meta mensal pelas semanas do mês, igual ao Forecast semanal.
      const refMesCatalogo=p.fim||p.referencia;
      const [anoMesCatalogo,mesMesCatalogo]=refMesCatalogo.split("-").map(Number);
      const semanasNoMesCatalogo=Math.ceil(new Date(anoMesCatalogo,mesMesCatalogo,0).getDate()/7);
      const metaSemanalImplicita=meta>0?Math.round((meta/semanasNoMesCatalogo)*100)/100:0;
      let fechado=0,commit=0,best=0,pipe=0,pond=0,semData=0,vencidas=0;const rows=[];
      ds.forEach((d)=>{const pr=Number(d.PROBABILITY),usa=Number.isFinite(pr)&&pr>0&&pr<=100,prob=usa?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA),bucket=classificarBucketForecast(prob,d._SEMANTICA);let sit="Fora",fp=0;
        if(d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)){fechado+=d._VALOR;sit="Ganho no mês"}
        else if(d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)){const cd=parteDataISO(d.CLOSEDATE);if(!cd){semData++;sit="Sem CLOSEDATE"}else if(p.inicio&&cd<p.inicio){vencidas++;sit="CLOSEDATE vencida"}else if(dentroPeriodoCatalogo(cd,p)){sit="Previsto no mês";fp=d._VALOR*prob/100;pond+=fp;if(bucket==="Commit")commit+=d._VALOR;else if(bucket==="Best Case")best+=d._VALOR;else pipe+=d._VALOR}}
        if(sit!=="Fora")rows.push({DEAL_ID:d.ID,CLIENTE:d._CLIENTE,ESTAGIO:d._ESTAGIO,FUNIL:d._FUNIL,MES:p.fim||p.referencia,RESPONSAVEL:d._RESPONSAVEL,CLOSEDATE:parteDataISO(d.CLOSEDATE),VALOR:d._VALOR,PROBABILIDADE:prob,FONTE_PROBABILIDADE:usa?"Bitrix":"Fallback",BUCKET:bucket,SITUACAO:sit,FORECAST_PONDERADO:fp});
      });
      const modeloVisualMensal=await construirDadosModeloForecast(webhook,b.meta,p.inicio,p.fim,b.deals);
      // v24 — "Fechado" (e tudo que deriva dele: Forecast total, Gap, barra de
      // atingimento) usa a MESMA base de modelo_visual.resumo.FECHADOS_VALOR
      // (negócios no Financeiro em "Contrato assinado") em vez do `fechado`
      // local (só negócios do funil Comercial marcados como ganho) — mesma
      // correção já aplicada em gerarHTMLForecastModelo(), pra este preview
      // (mostrado antes de abrir o modelo visual) não voltar a divergir do
      // valor que a seção "✅ Fechados" do relatório mostra. `pond` (pipeline
      // aberto ponderado) já é independente dessa base.
      const fechadoConsistente=modeloVisualMensal.resumo.FECHADOS_VALOR;
      const forecast=fechadoConsistente+pond;
      criarResultadoCatalogo(chave,"Forecast mensal • Comercial",`<strong>${escapeHtmlRelatorio(formatarDataBR(p.inicio))} a ${escapeHtmlRelatorio(formatarDataBR(p.fim))}</strong>`,
        [kpi("Fechado",moedaRelatorio(fechadoConsistente)),kpi("Forecast total",moedaRelatorio(forecast)),kpi("Commit",moedaRelatorio(commit)),kpi("Best Case",moedaRelatorio(best)),kpi("Pipeline",moedaRelatorio(pipe)),kpi("Sem CLOSEDATE",semData),kpi("CLOSEDATE vencida",vencidas),kpi(meta?"Gap para meta":"Meta",meta?moedaRelatorio(Math.max(0,meta-fechadoConsistente)):"não informada"),kpi(`Meta semanal (÷${semanasNoMesCatalogo} semanas)`,metaSemanalImplicita?moedaRelatorio(metaSemanalImplicita):"—")],
        [{titulo:"Negócios do forecast",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Estágio",valor:"ESTAGIO"},{label:"Funil",valor:"FUNIL"},{label:"Mês",valor:"MES"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"CLOSEDATE",valor:"CLOSEDATE"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Prob.",valor:(x)=>`${x.PROBABILIDADE}%`},{label:"Bucket",valor:"BUCKET"},{label:"Situação",valor:"SITUACAO"},{label:"Ponderado",valor:(x)=>moedaRelatorio(x.FORECAST_PONDERADO),html:true}]}],
        "PROBABILITY do Bitrix tem prioridade; quando zerada, usa fallback por estágio. Filtro por produto e pipeline dependem da visualização detalhada, limitados por chamadas N+1 ao Bitrix.");
      resultadoRelatorioCatalogo.modelo_visual=modeloVisualMensal;
      resultadoRelatorioCatalogo.meta_visual=meta;
      resultadoRelatorioCatalogo.meta_semanal_implicita=metaSemanalImplicita;
      resultadoRelatorioCatalogo.resumo={FECHADO:fechadoConsistente,FORECAST_TOTAL:forecast};
      resultadoRelatorioCatalogo.barra_meta=barraAtingimentoMeta(`Atingimento da meta mensal (${mesAnoBR(p.fim||p.referencia)})`,fechadoConsistente,meta);
      // v20 — mesma "foto" do dia salva pelo Forecast semanal (js/jornada.js), para
      // que a tendência do relatório visual funcione também vindo do catálogo.
      if(meta>0)salvarHistoricoForecastLocal({data:formatarDataISO(new Date()),metaMensal:meta,fechadoMes:fechadoConsistente,projecaoMes:forecast});
      renderizarRelatorioCatalogo();
    }

    else if(chave==="pipeline_coverage"){
      const b=await baseDealsCatalogo(webhook,true),ref=new Date(`${p.referencia}T12:00:00`);
      const campoMetaCoverage=document.getElementById("metaRelatorioComercial");
      let meta=Number(campoMetaCoverage?.value)||0;
      if(!meta){meta=metaMensalPadrao(p.fim||p.referencia);if(campoMetaCoverage&&meta)campoMetaCoverage.value=meta;}
      const ab=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));let total=0,pond=0,d30=0,d60=0,d90=0,sem=0;const g={};
      ab.forEach((d)=>{total+=d._VALOR;const pr=Number(d.PROBABILITY),prob=(Number.isFinite(pr)&&pr>0&&pr<=100)?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA);pond+=d._VALOR*prob/100;const cd=parteDataISO(d.CLOSEDATE);if(!cd)sem++;else{const dias=Math.floor((new Date(`${cd}T12:00:00`)-ref)/86400000);if(dias<=30)d30+=d._VALOR;else if(dias<=60)d60+=d._VALOR;else if(dias<=90)d90+=d._VALOR}
        const k=`${d._RESPONSAVEL}|||${d._ESTAGIO}`;(g[k]||=( {RESPONSAVEL:d._RESPONSAVEL,ESTAGIO:d._ESTAGIO,NEGOCIOS:0,PIPELINE:0,PONDERADO:0}));g[k].NEGOCIOS++;g[k].PIPELINE+=d._VALOR;g[k].PONDERADO+=d._VALOR*prob/100;});
      criarResultadoCatalogo(chave,"Pipeline & Coverage • 30/60/90 dias",`Referência: <strong>${escapeHtmlRelatorio(p.referencia)}</strong>`,
        [kpi("Pipeline aberto",moedaRelatorio(total)),kpi("Ponderado",moedaRelatorio(pond)),kpi("0–30 dias",moedaRelatorio(d30)),kpi("31–60 dias",moedaRelatorio(d60)),kpi("61–90 dias",moedaRelatorio(d90)),kpi("Sem CLOSEDATE",sem),kpi("Coverage (Elegível/Meta)",meta?`${((d30+d60+d90)/meta).toFixed(2)}x`:"meta não configurada"),kpi("Oportunidades",ab.length)],
        [{titulo:"Pipeline por responsável e estágio",dados:Object.values(g).sort((a,b)=>b.PIPELINE-a.PIPELINE),colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Estágio",valor:"ESTAGIO"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Pipeline",valor:(x)=>moedaRelatorio(x.PIPELINE),html:true},{label:"Ponderado",valor:(x)=>moedaRelatorio(x.PONDERADO),html:true}]}],
        "Coverage 90d = pipeline com fechamento em até 90 dias ÷ meta informada.");
    }

    else if(chave==="conversao_comercial"){
      const b=await baseDealsCatalogo(webhook,true),co=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>dentroPeriodoCatalogo(d.DATE_CREATE,p)),won=co.filter((d)=>d._SEMANTICA==="success"),lost=co.filter((d)=>d._SEMANTICA==="failure"),closed=won.length+lost.length;
      const hist=await buscarHistoricoEntidade(webhook,2,co.map((d)=>d.ID)),vis={};hist.forEach((h)=>{const d=co.find((x)=>String(x.ID)===String(h.OWNER_ID));if(!d)return;const cat=String(h.CATEGORY_ID??d.CATEGORY_ID),sid=String(h.STAGE_ID||""),lab=b.meta.estagios?.[cat]?.[sid]?.label||sid;(vis[lab]||=new Set()).add(String(h.OWNER_ID));});
      const wids=new Set(won.map((d)=>String(d.ID))),rows=Object.entries(vis).map(([stage,set])=>({ESTAGIO:stage,VISITARAM:set.size,GANHOS:[...set].filter((id)=>wids.has(id)).length})).map((x)=>({...x,CONVERSAO_PCT:taxaPct(x.GANHOS,x.VISITARAM)})).sort((a,b)=>b.VISITARAM-a.VISITARAM);
      criarResultadoCatalogo(chave,"Conversão Comercial • funil e Win Rate",`Coorte criada entre <strong>${escapeHtmlRelatorio(p.inicio||"início")}</strong> e <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>.`,
        [kpi("Oportunidades",co.length),kpi("Ganhos",won.length),kpi("Perdas",lost.length),kpi("Em aberto",co.filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)).length),kpi("Win Rate (coorte por criação)",`${taxaPct(won.length,closed)}%`),kpi("Taxa fechamento",`${taxaPct(closed,co.length)}%`),kpi("Receita ganha",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Ticket médio (coorte por criação)",moedaRelatorio(won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0))],
        [{titulo:"Conversão histórica por estágio",dados:rows,colunas:[{label:"Estágio",valor:"ESTAGIO"},{label:"Deals que passaram",valor:"VISITARAM"},{label:"Ganhos",valor:"GANHOS"},{label:"Conversão para ganho",valor:(x)=>`${x.CONVERSAO_PCT}%`}]}],
        "Conversão por estágio considera negócios da coorte que historicamente passaram pela etapa.");
    }

    else if(chave==="aging_sla"){
      const b=await baseDealsCatalogo(webhook,true),sla=Math.max(1,Number(document.getElementById("slaAgingRelatorio").value)||30),ref=new Date(`${p.referencia}T12:00:00`);
      const rows=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)).map((d)=>{const mt=parteDataISO(d.MOVED_TIME),dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):"";return{DEAL_ID:d.ID,OPORTUNIDADE:d.TITLE||"",CLIENTE:d._CLIENTE,FUNIL:d._FUNIL,ESTAGIO:d._ESTAGIO,RESPONSAVEL:d._RESPONSAVEL,VALOR:d._VALOR,DIAS_NO_ESTAGIO:dias,FORA_SLA:dias!==""&&dias>sla?"S":"N"}}).sort((a,b)=>Number(b.DIAS_NO_ESTAGIO||-1)-Number(a.DIAS_NO_ESTAGIO||-1));
      const crit=rows.filter((x)=>x.FORA_SLA==="S");
      criarResultadoCatalogo(chave,"Aging & SLA Comercial",`SLA: <strong>${sla} dias</strong>.`,
        [kpi("Abertas",rows.length),kpi("Fora SLA",crit.length),kpi("% fora SLA",`${taxaPct(crit.length,rows.length)}%`),kpi("Pipeline fora SLA",moedaRelatorio(crit.reduce((a,x)=>a+x.VALOR,0))),kpi(`0–${sla}d`,rows.filter((x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO<=sla).length),kpi(`${sla+1}–${sla*2}d`,rows.filter((x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO>sla&&x.DIAS_NO_ESTAGIO<=sla*2).length),kpi(`>${sla*2}d`,rows.filter((x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO>sla*2).length),kpi("Sem MOVED_TIME",rows.filter((x)=>x.DIAS_NO_ESTAGIO==="").length)],
        [{titulo:"Aging por oportunidade",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Oportunidade",valor:"OPORTUNIDADE"},{label:"Cliente",valor:"CLIENTE"},{label:"Funil",valor:"FUNIL"},{label:"Estágio",valor:"ESTAGIO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias",valor:"DIAS_NO_ESTAGIO"},{label:"Fora SLA",valor:"FORA_SLA"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}]}],
        "Aging usa MOVED_TIME do estágio atual.");
    }

    else if(chave==="performance_vendedores"){
      const b=await baseDealsCatalogo(webhook,true),om=await mapaOrigensRelatorio(webhook),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)),m={};
      const get=(d)=>{const k=String(d.ASSIGNED_BY_ID||"0");return m[k]||(m[k]={RESPONSAVEL:d._RESPONSAVEL,CRIADAS:0,PIPELINE:0,FORECAST:0,GANHOS:0,RECEITA:0,PERDAS:0,PERDIDO:0,CICLO_SOMA:0,CICLO_N:0,TICKETS:[],UTMS:{}})};
      ds.forEach((d)=>{
        const r=get(d);
        if(dentroPeriodoCatalogo(d.DATE_CREATE,p))r.CRIADAS++;
        if(d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)){
          r.PIPELINE+=d._VALOR;
          const pr=Number(d.PROBABILITY);
          const prob=(Number.isFinite(pr)&&pr>0&&pr<=100)?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA);
          r.FORECAST+=d._VALOR*prob/100;
        }
        if(dentroPeriodoCatalogo(d._FECHAMENTO,p)){
          if(d._SEMANTICA==="success"){
            r.GANHOS++;
            r.RECEITA+=d._VALOR;
            r.TICKETS.push(d._VALOR);
          }else if(d._SEMANTICA==="failure"){
            r.PERDAS++;
            r.PERDIDO+=d._VALOR;
          }
          if(d._CICLO!==""){r.CICLO_SOMA+=Number(d._CICLO);r.CICLO_N++;}
        }
        const utmSrc=String(d.UTM_SOURCE||"").trim();
        const src=utmSrc?`UTM: ${utmSrc}`:(om[String(d.SOURCE_ID)]||d.SOURCE_ID||"");
        if(src)r.UTMS[src]=(r.UTMS[src]||0)+1;
      });

      const todosTicketsGanhos=[];
      const rows=Object.values(m).map((r)=>{
        r.TICKETS.forEach(v=>todosTicketsGanhos.push(v));
        const tSort=[...r.TICKETS].sort((a,b)=>a-b);
        const medT=tSort.length?(tSort.length%2===0?(tSort[tSort.length/2-1]+tSort[tSort.length/2])/2:tSort[Math.floor(tSort.length/2)]):0;
        const topUtm=Object.entries(r.UTMS).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";
        return {
          ...r,
          WIN_RATE:taxaPct(r.GANHOS,r.GANHOS+r.PERDAS),
          TICKET:r.GANHOS?r.RECEITA/r.GANHOS:0,
          MEDIANA_TICKET:medT,
          TOP_UTM:topUtm,
          CICLO:r.CICLO_N?Math.round(r.CICLO_SOMA/r.CICLO_N*10)/10:0
        };
      }).sort((a,b)=>b.RECEITA-a.RECEITA);

      const totalReceita=rows.reduce((a,r)=>a+r.RECEITA,0);
      const top1=rows.slice(0,1).reduce((a,r)=>a+r.RECEITA,0);
      const top5=rows.slice(0,5).reduce((a,r)=>a+r.RECEITA,0);
      const top10=rows.slice(0,10).reduce((a,r)=>a+r.RECEITA,0);

      const tGeralSort=[...todosTicketsGanhos].sort((a,b)=>a-b);
      const medianaTicketGeral=tGeralSort.length?(tGeralSort.length%2===0?(tGeralSort[tGeralSort.length/2-1]+tGeralSort[tGeralSort.length/2])/2:tGeralSort[Math.floor(tGeralSort.length/2)]):0;

      criarResultadoCatalogo(chave,"Performance por vendedor",`Período: <strong>${escapeHtmlRelatorio(p.inicio||"todas")}</strong> a <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>.`,
        [
          kpi("Vendedores",rows.length),
          kpi("Receita",moedaRelatorio(totalReceita)),
          kpi("Ganhos",rows.reduce((a,r)=>a+r.GANHOS,0)),
          kpi("Perdas",rows.reduce((a,r)=>a+r.PERDAS,0)),
          kpi("Pipeline aberto",moedaRelatorio(rows.reduce((a,r)=>a+r.PIPELINE,0))),
          kpi("Criadas",rows.reduce((a,r)=>a+r.CRIADAS,0)),
          kpi("Win Rate geral (coorte por fechamento)",`${taxaPct(rows.reduce((a,r)=>a+r.GANHOS,0),rows.reduce((a,r)=>a+r.GANHOS+r.PERDAS,0))}%`),
          kpi("Mediana Ticket",moedaRelatorio(medianaTicketGeral)),
          kpi("Top 1 Conc.",`${taxaPct(top1,totalReceita)}%`),
          kpi("Top 5 Conc.",`${taxaPct(top5,totalReceita)}%`),
          kpi("Top 10 Conc.",`${taxaPct(top10,totalReceita)}%`),
          kpi("Atribuição","responsável atual")
        ],
        [{titulo:"Performance por responsável",dados:rows,colunas:[
          {label:"Responsável",valor:"RESPONSAVEL"},
          {label:"Criadas",valor:"CRIADAS"},
          {label:"Ganhos",valor:"GANHOS"},
          {label:"Perdas",valor:"PERDAS"},
          {label:"Win Rate",valor:(x)=>`${x.WIN_RATE}%`},
          {label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},
          {label:"Ticket Médio",valor:(x)=>moedaRelatorio(x.TICKET),html:true},
          {label:"Mediana Ticket",valor:(x)=>moedaRelatorio(x.MEDIANA_TICKET),html:true},
          {label:"Origem/UTM Principal",valor:"TOP_UTM"},
          {label:"Ciclo médio",valor:(x)=>`${x.CICLO}d`},
          {label:"Pipeline",valor:(x)=>moedaRelatorio(x.PIPELINE),html:true},
          {label:"Forecast Ponderado",valor:(x)=>moedaRelatorio(x.FORECAST),html:true}
        ]}],
        "ASSIGNED_BY_ID representa o responsável atual, não todo o histórico de ownership.");
    }

    else if(chave==="vendas_realizadas"){
      const b=await baseDealsCatalogo(webhook,true),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p));
      const porDia={},porMes={},porAno={};
      const acomodar=(mapa,chaveGrupo,rotulo,d)=>{
        const k=`${chaveGrupo}|||${d._RESPONSAVEL}`;
        if(!mapa[k])mapa[k]={CHAVE:chaveGrupo,PERIODO:rotulo,VENDEDOR:d._RESPONSAVEL,VENDAS:0,RECEITA:0};
        mapa[k].VENDAS++;mapa[k].RECEITA+=d._VALOR;
      };
      ds.forEach((d)=>{
        const dia=d._FECHAMENTO||"";
        if(!dia)return;
        acomodar(porDia,dia,formatarDataBR(dia),d);
        acomodar(porMes,dia.slice(0,7),mesAnoBR(dia),d);
        acomodar(porAno,dia.slice(0,4),dia.slice(0,4),d);
      });
      const montarLinhas=(mapa)=>Object.values(mapa).map((r)=>({...r,TICKET:r.VENDAS?r.RECEITA/r.VENDAS:0})).sort((a,b)=>b.CHAVE.localeCompare(a.CHAVE)||b.RECEITA-a.RECEITA);
      const linhasDia=montarLinhas(porDia),linhasMes=montarLinhas(porMes),linhasAno=montarLinhas(porAno);
      const receitaTotal=ds.reduce((a,d)=>a+d._VALOR,0),porVendedorReceita={};
      ds.forEach((d)=>{porVendedorReceita[d._RESPONSAVEL]=(porVendedorReceita[d._RESPONSAVEL]||0)+d._VALOR});
      const melhorVendedor=Object.entries(porVendedorReceita).sort((a,b)=>b[1]-a[1])[0];
      const colunasVendas=[{label:"Vendedor",valor:"VENDEDOR"},{label:"Vendas",valor:"VENDAS"},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket médio",valor:(x)=>moedaRelatorio(x.TICKET),html:true}];
      criarResultadoCatalogo(chave,"Vendas realizadas — diário, mensal e anual",`Negócios ganhos (fechados) entre <strong>${escapeHtmlRelatorio(p.inicio||"início")}</strong> e <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>, por vendedor.`,
        [kpi("Vendas fechadas",ds.length),kpi("Receita total",moedaRelatorio(receitaTotal)),kpi("Ticket médio",moedaRelatorio(ds.length?receitaTotal/ds.length:0)),kpi("Vendedores com venda",new Set(ds.map((d)=>d._RESPONSAVEL)).size),kpi("Dias com venda",new Set(ds.map((d)=>d._FECHAMENTO)).size),kpi("Meses com venda",new Set(ds.map((d)=>d._FECHAMENTO.slice(0,7))).size),kpi("Anos com venda",new Set(ds.map((d)=>d._FECHAMENTO.slice(0,4))).size),kpi("Melhor vendedor",melhorVendedor?`${melhorVendedor[0]} (${moedaRelatorio(melhorVendedor[1])})`:"—")],
        [
          {titulo:"Vendas por dia e vendedor",dados:linhasDia,colunas:[{label:"Data",valor:"PERIODO"},...colunasVendas]},
          {titulo:"Vendas por mês e vendedor",dados:linhasMes,colunas:[{label:"Mês",valor:"PERIODO"},...colunasVendas]},
          {titulo:"Vendas por ano e vendedor",dados:linhasAno,colunas:[{label:"Ano",valor:"PERIODO"},...colunasVendas]}
        ],
        "Venda = negócio em estágio de sucesso (ganho); data considerada é a mesma usada no Forecast (contrato assinado com fallback para CLOSEDATE).");
    }

    else if(chave==="ganhos_perdas_ciclo"){
      const b=await baseDealsCatalogo(webhook,true),fs=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA!=="process"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)),won=fs.filter((d)=>d._SEMANTICA==="success"),lost=fs.filter((d)=>d._SEMANTICA==="failure");
      const rows=fs.map((d)=>({DEAL_ID:d.ID,CLIENTE:d._CLIENTE,RESULTADO:d._SEMANTICA==="success"?"Ganho":"Perdido",RESPONSAVEL:d._RESPONSAVEL,FECHAMENTO:d._FECHAMENTO,VALOR:d._VALOR,CICLO_DIAS:d._CICLO})).sort((a,b)=>b.FECHAMENTO.localeCompare(a.FECHAMENTO)||b.VALOR-a.VALOR);
      const cs=rows.map((x)=>Number(x.CICLO_DIAS)).filter(Number.isFinite);
      const cSort=[...cs].sort((a,b)=>a-b);
      const mediana=cSort.length?(cSort.length%2===0?(cSort[cSort.length/2-1]+cSort[cSort.length/2])/2:cSort[Math.floor(cSort.length/2)]):null;

      const csWon=won.map((d)=>Number(d._CICLO)).filter(Number.isFinite);
      const cWonSort=[...csWon].sort((a,b)=>a-b);
      const medianaWon=cWonSort.length?(cWonSort.length%2===0?(cWonSort[cWonSort.length/2-1]+cWonSort[cWonSort.length/2])/2:cWonSort[Math.floor(cWonSort.length/2)]):null;

      const csLost=lost.map((d)=>Number(d._CICLO)).filter(Number.isFinite);
      const cLostSort=[...csLost].sort((a,b)=>a-b);
      const medianaLost=cLostSort.length?(cLostSort.length%2===0?(cLostSort[cLostSort.length/2-1]+cLostSort[cLostSort.length/2])/2:cLostSort[Math.floor(cLostSort.length/2)]):null;

      criarResultadoCatalogo(chave,"Ganhos, perdas e ciclo de vendas","Fechamentos no período selecionado.",
        [
          kpi("Fechados",rows.length),
          kpi("Ganhos",won.length),
          kpi("Perdas",lost.length),
          kpi("Win Rate (coorte por fechamento)",`${taxaPct(won.length,rows.length)}%`),
          kpi("Receita ganha",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),
          kpi("Valor perdido",moedaRelatorio(lost.reduce((a,d)=>a+d._VALOR,0))),
          kpi("Ticket ganho (coorte por fechamento)",moedaRelatorio(won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0)),
          kpi("Ciclo médio",cs.length?`${Math.round(cs.reduce((a,b)=>a+b,0)/cs.length*10)/10}d`:"—"),
          kpi("Mediana ciclo",mediana!==null?Math.round(mediana*10)/10+"d":"—"),
          kpi("Ciclo médio (Ganhos)",csWon.length?`${Math.round(csWon.reduce((a,b)=>a+b,0)/csWon.length*10)/10}d`:"—"),
          kpi("Mediana ciclo (Ganhos)",medianaWon!==null?Math.round(medianaWon*10)/10+"d":"—"),
          kpi("Ciclo médio (Perdas)",csLost.length?`${Math.round(csLost.reduce((a,b)=>a+b,0)/csLost.length*10)/10}d`:"—")
        ],
        [{titulo:"Negócios fechados",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Resultado",valor:"RESULTADO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Fechamento",valor:"FECHAMENTO"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Ciclo",valor:(x)=>x.CICLO_DIAS===""?"":`${x.CICLO_DIAS}d`}]}]);
    }

    else if(chave==="origens_canais"){
      const [lb,db,om]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,true),mapaOrigensRelatorio(webhook)]),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p)),by={};
      db.deals.forEach((d)=>{if(idBitrixValido(d.LEAD_ID))(by[String(d.LEAD_ID)]||=[]).push(enriquecerDealCatalogo(d,db))});
      const m={};
      ls.forEach((l)=>{
        const utmMed=String(l.UTM_MEDIUM||"").trim();
        const utmCam=String(l.UTM_CAMPAIGN||"").trim();
        const utmSrc=String(l.UTM_SOURCE||"").trim();
        const srcNome=om[String(l.SOURCE_ID)]||l.SOURCE_ID||"";
        let src="";
        if(utmSrc){
          src=`UTM: ${utmSrc}${utmMed?" / "+utmMed:""}${utmCam?" / "+utmCam:""}`;
          if(srcNome)src+=` (${srcNome})`;
        }else{
          src=srcNome||"Sem origem";
        }
        if(!m[src])m[src]={ORIGEM:src,LEADS:0,LEADS_COM_OPP:0,OPORTUNIDADES:0,GANHOS:0,RECEITA:0};
        const r=m[src];
        r.LEADS++;
        const ds=by[String(l.ID)]||[];
        if(ds.length)r.LEADS_COM_OPP++;
        r.OPORTUNIDADES+=ds.length;
        const w=ds.filter((d)=>d._SEMANTICA==="success");
        r.GANHOS+=w.length;
        r.RECEITA+=w.reduce((a,d)=>a+d._VALOR,0);
      });

      const leadIdsNaCoorte=new Set(ls.map(l=>String(l.ID)));
      db.deals.forEach((dRaw)=>{
        const d=enriquecerDealCatalogo(dRaw,db);
        if(!dentroPeriodoCatalogo(d.DATE_CREATE,p)&&!dentroPeriodoCatalogo(d._FECHAMENTO,p))return;
        if(idBitrixValido(d.LEAD_ID)&&leadIdsNaCoorte.has(String(d.LEAD_ID)))return;
        const utmMed=String(d.UTM_MEDIUM||"").trim();
        const utmCam=String(d.UTM_CAMPAIGN||"").trim();
        const utmSrc=String(d.UTM_SOURCE||"").trim();
        const srcNome=om[String(d.SOURCE_ID)]||d.SOURCE_ID||"";
        let src="";
        if(utmSrc){
          src=`UTM: ${utmSrc}${utmMed?" / "+utmMed:""}${utmCam?" / "+utmCam:""}`;
          if(srcNome)src+=` (${srcNome})`;
        }else{
          src=srcNome||"Sem origem";
        }
        if(!m[src])m[src]={ORIGEM:src,LEADS:0,LEADS_COM_OPP:0,OPORTUNIDADES:0,GANHOS:0,RECEITA:0};
        const r=m[src];
        r.OPORTUNIDADES++;
        if(d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)){
          r.GANHOS++;
          r.RECEITA+=d._VALOR;
        }
      });

      const rows=Object.values(m).map((r)=>({...r,LEAD_OPP:taxaPct(r.LEADS_COM_OPP,r.LEADS),OPP_GANHO:taxaPct(r.GANHOS,r.OPORTUNIDADES)})).sort((a,b)=>b.LEADS-a.LEADS||b.RECEITA-a.RECEITA);
      criarResultadoCatalogo(chave,"Origens, canais e conversão","UTM_SOURCE tem prioridade com detalhamento do SOURCE_ID.",
        [kpi("Leads",ls.length),kpi("Origens",rows.length),kpi("Leads com Opp",rows.reduce((a,r)=>a+r.LEADS_COM_OPP,0)),kpi("Oportunidades",rows.reduce((a,r)=>a+r.OPORTUNIDADES,0)),kpi("Ganhos",rows.reduce((a,r)=>a+r.GANHOS,0)),kpi("Receita",moedaRelatorio(rows.reduce((a,r)=>a+r.RECEITA,0))),kpi("Lead → Opp",`${taxaPct(rows.reduce((a,r)=>a+r.LEADS_COM_OPP,0),ls.length)}%`),kpi("Sem origem",rows.find((r)=>r.ORIGEM==="Sem origem")?.LEADS||0)],
        [{titulo:"Conversão por origem",dados:rows,colunas:[{label:"Origem",valor:"ORIGEM"},{label:"Leads",valor:"LEADS"},{label:"Leads c/ Opp",valor:"LEADS_COM_OPP"},{label:"Lead → Opp",valor:(x)=>`${x.LEAD_OPP}%`},{label:"Oportunidades",valor:"OPORTUNIDADES"},{label:"Ganhos",valor:"GANHOS"},{label:"Opp → Ganho",valor:(x)=>`${x.OPP_GANHO}%`},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true}]}]);
    }

    else if(chave==="produtos_receita"){
      const b=await baseDealsCatalogo(webhook,true),won=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)),m={};let linhas=0,com=0;
      for(let i=0;i<won.length;i++){if(extracaoCancelada)break;const d=won[i];atualizarStatus(`Produtos: negócio ${i+1}/${won.length}`);const body=await bitrixFetchComRetentativa(`${webhook.replace(/\/$/,"")}/crm.deal.productrows.get.json?id=${encodeURIComponent(d.ID)}`),it=body.result||[];if(it.length)com++;it.forEach((x)=>{linhas++;const n=x.PRODUCT_NAME||`Produto ${x.PRODUCT_ID||""}`;if(!m[n])m[n]={PRODUTO:n,NEGOCIOS:new Set(),QUANTIDADE:0,RECEITA:0};m[n].NEGOCIOS.add(String(d.ID));const qty=Number(x.QUANTITY)||0;m[n].QUANTIDADE+=qty;const pa=Number(x.PRICE_ACCOUNT);const priceUnit=(Number.isFinite(pa)&&pa!==0)?pa:(Number(x.PRICE)||0);m[n].RECEITA+=priceUnit*qty;});await aguardar(100)}
      const rows=Object.values(m).map((r)=>({PRODUTO:r.PRODUTO,NEGOCIOS:r.NEGOCIOS.size,QUANTIDADE:Math.round(r.QUANTIDADE*100)/100,RECEITA:r.RECEITA,TICKET:r.NEGOCIOS.size?r.RECEITA/r.NEGOCIOS.size:0})).sort((a,b)=>b.RECEITA-a.RECEITA);
      const totalR=rows.reduce((a,r)=>a+r.RECEITA,0);
      let acumR=0;
      rows.forEach(r=>{
        r.PARTICIPACAO=totalR?(r.RECEITA/totalR*100).toFixed(1):0;
        acumR+=r.RECEITA;
        const pctAcum=totalR?(acumR/totalR*100):0;
        r.CUMULATIVO_PCT=Math.round(pctAcum*10)/10;
        r.CURVA_ABC=pctAcum<=80?"A":(pctAcum<=95?"B":"C");
      });
      criarResultadoCatalogo(chave,"Produtos e receita","Produtos dos negócios ganhos no período com classificação Curva ABC.",
        [kpi("Deals ganhos",won.length),kpi("Deals com produto",com),kpi("Linhas produto",linhas),kpi("Produtos",rows.length),kpi("Receita linhas",moedaRelatorio(totalR)),kpi("Receita deals",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Deals sem produto",won.length-com),kpi("Cobertura",`${taxaPct(com,won.length)}%`)],
        [{titulo:"Produtos vendidos",dados:rows,colunas:[{label:"Produto",valor:"PRODUTO"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Quantidade",valor:"QUANTIDADE"},{label:"Receita linhas",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket médio",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Participação",valor:(x)=>x.PARTICIPACAO+"%"},{label:"Curva ABC",valor:"CURVA_ABC"}]}],
        "PRICE_ACCOUNT é usado como preço unitário em moeda da conta quando disponível; fallback PRICE × QUANTITY.");
    }

    else if(chave==="clientes_receita"){
      const b=await baseDealsCatalogo(webhook,true),won=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)),m={};
      won.forEach((d)=>{const k=idBitrixValido(d.COMPANY_ID)?`C:${idBitrixString(d.COMPANY_ID)}`:`N:${normalizarTextoChave(d._CLIENTE)}`;if(!m[k])m[k]={CLIENTE:d._CLIENTE,NEGOCIOS:0,RECEITA:0,PRIMEIRO:d._FECHAMENTO,ULTIMO:d._FECHAMENTO};const r=m[k];r.NEGOCIOS++;r.RECEITA+=d._VALOR;if(d._FECHAMENTO<r.PRIMEIRO)r.PRIMEIRO=d._FECHAMENTO;if(d._FECHAMENTO>r.ULTIMO)r.ULTIMO=d._FECHAMENTO});
      const rows=Object.values(m).map((r)=>({...r,TICKET:r.NEGOCIOS?r.RECEITA/r.NEGOCIOS:0})).sort((a,b)=>b.RECEITA-a.RECEITA),total=rows.reduce((a,r)=>a+r.RECEITA,0),top10=rows.slice(0,10).reduce((a,r)=>a+r.RECEITA,0),top5=rows.slice(0,5).reduce((a,r)=>a+r.RECEITA,0),top1=rows.slice(0,1).reduce((a,r)=>a+r.RECEITA,0);
      let acumC=0;
      rows.forEach(r=>{
        acumC+=r.RECEITA;
        const pctAcum=total?(acumC/total*100):0;
        r.PARTICIPACAO=total?(r.RECEITA/total*100).toFixed(1):0;
        r.ACUMULADO_PCT=Math.round(pctAcum*10)/10;
        r.CURVA_ABC=pctAcum<=80?"A":(pctAcum<=95?"B":"C");
      });
      criarResultadoCatalogo(chave,"Clientes, receita e concentração","Receita pelos negócios ganhos no período com Curva ABC e concentração Top 1/5/10.",
        [kpi("Clientes",rows.length),kpi("Negócios ganhos",won.length),kpi("Receita",moedaRelatorio(total)),kpi("Ticket médio (coorte por fechamento)",moedaRelatorio(won.length?total/won.length:0)),kpi("Clientes recorrentes",rows.filter((r)=>r.NEGOCIOS>1).length),kpi("Top 1",`${taxaPct(top1,total)}%`),kpi("Top 5",`${taxaPct(top5,total)}%`),kpi("Top 10",`${taxaPct(top10,total)}%`),kpi("Maior cliente",rows[0]?.CLIENTE||"—")],
        [{titulo:"Receita por cliente",dados:rows,colunas:[{label:"Cliente",valor:"CLIENTE"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Participação",valor:(x)=>x.PARTICIPACAO+"%"},{label:"Acumulado",valor:(x)=>x.ACUMULADO_PCT+"%"},{label:"Curva ABC",valor:"CURVA_ABC"},{label:"Primeiro",valor:"PRIMEIRO"},{label:"Último",valor:"ULTIMO"}]}]);
    }

    else if(chave==="funil_leads"){
      const [lb,db]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,false)]),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p)),by={};db.deals.forEach((d)=>{if(idBitrixValido(d.LEAD_ID))(by[String(d.LEAD_ID)]||=[]).push(d)});
      const m={};let conv=0,junk=0,opp=0,wins=0;ls.forEach((l)=>{const lab=labelStatusLead(lb.statusMap,l.STATUS_ID);if(!m[lab])m[lab]={STATUS:lab,LEADS:0,COM_OPP:0,GANHOS:0};m[lab].LEADS++;const ds=by[String(l.ID)]||[];if(ds.length){opp++;m[lab].COM_OPP++}const w=ds.filter((d)=>["s","success"].includes(String(d.STAGE_SEMANTIC_ID||"").toLowerCase()));if(w.length){wins++;m[lab].GANHOS+=w.length}const s=semanticaLead(l);if(s==="success")conv++;if(s==="failure")junk++});
      const rows=Object.values(m).sort((a,b)=>b.LEADS-a.LEADS);
      criarResultadoCatalogo(chave,"Funil de Leads & conversão SDR","Coorte de Leads criada no período.",
        [kpi("Leads",ls.length),kpi("Convertidos",conv),kpi("Desqualificados",junk),kpi("Leads com Opp",opp),kpi("Lead → Opp",`${taxaPct(opp,ls.length)}%`),kpi("Leads com ganho",wins),kpi("Lead → Ganho",`${taxaPct(wins,ls.length)}%`),kpi("Em processamento",ls.filter((l)=>semanticaLead(l)==="process").length)],
        [{titulo:"Status atual dos Leads",dados:rows,colunas:[{label:"Status",valor:"STATUS"},{label:"Leads",valor:"LEADS"},{label:"Com oportunidade",valor:"COM_OPP"},{label:"Ganhos",valor:"GANHOS"}]}]);
    }

    else if(chave==="produtividade_atividades"){
      const a=await atividadesCatalogo(webhook,true,p.inicio,p.fim),m={};a.dados.forEach((x)=>{const id=idBitrixString(x.RESPONSIBLE_ID),nome=nomeUsuario(id)||(id?`ID ${id}`:"Sem responsável");if(!m[id||"0"])m[id||"0"]={RESPONSAVEL:nome,ATIVIDADES:0,LIGACOES:0,REUNIOES:0,TAREFAS:0,EMAILS:0,WHATSAPP:0,LEADS:new Set(),NEGOCIOS:new Set(),DIAS:new Set()};const r=m[id||"0"];r.ATIVIDADES++;const c=canalAtividadeSDR(x);if(c==="Ligação")r.LIGACOES++;else if(c==="Reunião")r.REUNIOES++;else if(c==="Tarefa")r.TAREFAS++;else if(c==="E-mail")r.EMAILS++;else if(c==="WhatsApp")r.WHATSAPP++;bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")r.LEADS.add(b.OWNER_ID);if(b.OWNER_TYPE_ID==="2")r.NEGOCIOS.add(b.OWNER_ID)});const d=parteDataISO(x.END_TIME);if(d)r.DIAS.add(d)});
      const rows=Object.values(m).map((r)=>({RESPONSAVEL:r.RESPONSAVEL,ATIVIDADES:r.ATIVIDADES,LIGACOES:r.LIGACOES,REUNIOES:r.REUNIOES,TAREFAS:r.TAREFAS,EMAILS:r.EMAILS,WHATSAPP:r.WHATSAPP,LEADS_UNICOS:r.LEADS.size,NEGOCIOS_UNICOS:r.NEGOCIOS.size,MEDIA_DIA:r.DIAS.size?Math.round(r.ATIVIDADES/r.DIAS.size*100)/100:0})).sort((a,b)=>b.ATIVIDADES-a.ATIVIDADES);
      criarResultadoCatalogo(chave,"Produtividade de atividades por responsável","Atividades concluídas no período.",
        [kpi("Atividades",a.dados.length),kpi("Responsáveis",rows.length),kpi("Ligações",rows.reduce((s,r)=>s+r.LIGACOES,0)),kpi("Reuniões",rows.reduce((s,r)=>s+r.REUNIOES,0)),kpi("WhatsApp",rows.reduce((s,r)=>s+r.WHATSAPP,0)),kpi("E-mails",rows.reduce((s,r)=>s+r.EMAILS,0)),kpi("Leads únicos",new Set(a.dados.flatMap((x)=>bindingsDaAtividade(x).filter((b)=>b.OWNER_TYPE_ID==="1").map((b)=>b.OWNER_ID))).size),kpi("Negócios únicos",new Set(a.dados.flatMap((x)=>bindingsDaAtividade(x).filter((b)=>b.OWNER_TYPE_ID==="2").map((b)=>b.OWNER_ID))).size)],
        [{titulo:"Produtividade por responsável",dados:rows,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Atividades",valor:"ATIVIDADES"},{label:"Média/dia",valor:"MEDIA_DIA"},{label:"Ligações",valor:"LIGACOES"},{label:"Reuniões",valor:"REUNIOES"},{label:"WhatsApp",valor:"WHATSAPP"},{label:"E-mails",valor:"EMAILS"},{label:"Leads",valor:"LEADS_UNICOS"},{label:"Negócios",valor:"NEGOCIOS_UNICOS"}]}]);
    }

    else if(chave==="sla_primeiro_contato"){
      const lb=await baseLeadsCatalogo(webhook),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p)),a=await atividadesCatalogo(webhook,true,p.inicio,p.fim),by={};a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(by[b.OWNER_ID]||=[]).push(x)}));const sla=Math.max(1,Number(document.getElementById("slaPrimeiroContatoHoras").value)||4);
      const rows=ls.map((l)=>{const created=new Date(l.DATE_CREATE),arr=(by[String(l.ID)]||[]).filter((x)=>new Date(x.END_TIME)>=created).sort((a,b)=>new Date(a.END_TIME)-new Date(b.END_TIME)),f=arr[0];let h="";if(f)h=Math.round(((new Date(f.END_TIME)-created)/3600000)*100)/100;return{LEAD_ID:l.ID,CLIENTE:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"",STATUS:labelStatusLead(lb.statusMap,l.STATUS_ID),RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID),CRIADO:l.DATE_CREATE||"",PRIMEIRO_CONTATO:f?.END_TIME||"",HORAS:h,SLA:h!==""&&h<=sla?"S":(h===""?"SEM ATIVIDADE":"N")}});const ct=rows.filter((x)=>x.HORAS!==""),ok=rows.filter((x)=>x.SLA==="S"),hs=ct.map((x)=>Number(x.HORAS)).sort((a,b)=>a-b),med=hs.length?hs[Math.floor((hs.length-1)/2)]:0;
      criarResultadoCatalogo(chave,"SLA de primeiro contato",`SLA configurado: <strong>${sla} hora(s)</strong>.`,
        [kpi("Leads",rows.length),kpi("Com contato",ct.length),kpi("Sem atividade",rows.length-ct.length),kpi("Dentro SLA",ok.length),kpi("% dentro SLA",`${taxaPct(ok.length,rows.length)}%`),kpi("Mediana",`${med}h`),kpi("≤1h",rows.filter((x)=>x.HORAS!==""&&x.HORAS<=1).length),kpi("≤24h",rows.filter((x)=>x.HORAS!==""&&x.HORAS<=24).length)],
        [{titulo:"SLA por Lead",dados:rows,colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criado",valor:"CRIADO"},{label:"Primeiro contato",valor:"PRIMEIRO_CONTATO"},{label:"Horas",valor:"HORAS"},{label:"SLA",valor:"SLA"}]}],
        "Primeiro contato = primeira atividade concluída vinculada ao Lead dentro da janela analisada.");
    }

    else if(chave==="handoffs"){
      const b=await baseDealsCatalogo(webhook,false),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>classificarFunilJornada(d.CATEGORY_ID)!=="INTERNO"),lids=[...new Set(ds.map((d)=>d.LEAD_ID).filter(idBitrixValido).map(idBitrixString))],lm=await buscarEntidadesPorIds(webhook,"crm.lead.list",lids,["ID","ASSIGNED_BY_ID","TITLE"]),g={},rows=[];
      ds.forEach((d)=>{let k=idBitrixValido(d.COMPANY_ID)?`C:${idBitrixString(d.COMPANY_ID)}`:idBitrixValido(d.CONTACT_ID)?`T:${idBitrixString(d.CONTACT_ID)}`:idBitrixValido(d.LEAD_ID)?`L:${idBitrixString(d.LEAD_ID)}`:`D:${d.ID}`;(g[k]||=[]).push(d)});
      Object.values(g).forEach((a)=>{a.sort((x,y)=>String(x.DATE_CREATE).localeCompare(String(y.DATE_CREATE)));let prev=null;a.forEach((d)=>{if(prev&&idBitrixValido(prev.ASSIGNED_BY_ID)&&idBitrixValido(d.ASSIGNED_BY_ID)&&idBitrixString(prev.ASSIGNED_BY_ID)!==idBitrixString(d.ASSIGNED_BY_ID))rows.push({CLIENTE:d._CLIENTE,DEAL_ID:d.ID,DE:nomeUsuario(prev.ASSIGNED_BY_ID),PARA:d._RESPONSAVEL,FUNIL_DE:prev._FUNIL,FUNIL_PARA:d._FUNIL,TIPO:prev._FUNIL===d._FUNIL?"TROCA_MESMO_FUNIL":"HANDOFF_ENTRE_FUNIS"});const l=idBitrixValido(d.LEAD_ID)?lm[idBitrixString(d.LEAD_ID)]:null;if(l&&idBitrixValido(l.ASSIGNED_BY_ID)&&idBitrixValido(d.ASSIGNED_BY_ID)&&idBitrixString(l.ASSIGNED_BY_ID)!==idBitrixString(d.ASSIGNED_BY_ID))rows.push({CLIENTE:d._CLIENTE,DEAL_ID:d.ID,DE:nomeUsuario(l.ASSIGNED_BY_ID),PARA:d._RESPONSAVEL,FUNIL_DE:"Lead",FUNIL_PARA:d._FUNIL,TIPO:"LEAD_PARA_NEGOCIO"});prev=d})});
      criarResultadoCatalogo(chave,"Handoffs e trocas de responsável","Diferenças observáveis entre os registros extraídos.",
        [kpi("Eventos",rows.length),kpi("Mesmo funil",rows.filter((x)=>x.TIPO==="TROCA_MESMO_FUNIL").length),kpi("Entre funis",rows.filter((x)=>x.TIPO==="HANDOFF_ENTRE_FUNIS").length),kpi("Lead → Negócio",rows.filter((x)=>x.TIPO==="LEAD_PARA_NEGOCIO").length),kpi("Clientes",new Set(rows.map((x)=>x.CLIENTE)).size),kpi("Origens",new Set(rows.map((x)=>x.DE).filter(Boolean)).size),kpi("Destinos",new Set(rows.map((x)=>x.PARA).filter(Boolean)).size),kpi("Owner histórico","limitado")],
        [{titulo:"Handoffs e trocas",dados:rows,colunas:[{label:"Cliente",valor:"CLIENTE"},{label:"Deal",valor:"DEAL_ID"},{label:"De",valor:"DE"},{label:"Para",valor:"PARA"},{label:"Funil origem",valor:"FUNIL_DE"},{label:"Funil destino",valor:"FUNIL_PARA"},{label:"Tipo",valor:"TIPO"}]}],
        "Não reconstrói todas as alterações históricas de ASSIGNED_BY_ID dentro do mesmo card.");
    }

    else if(chave==="reentradas"){
      const b=await baseDealsCatalogo(webhook,false),ids=b.deals.map((d)=>d.ID),hist=await buscarHistoricoEntidade(webhook,2,ids),by={};hist.forEach((h)=>(by[String(h.OWNER_ID)]||=[]).push(h));const rows=[];let re=0,mud=0;const dealsRe=new Set();
      Object.entries(by).forEach(([id,a])=>{a.sort((x,y)=>String(x.CREATED_TIME).localeCompare(String(y.CREATED_TIME)));const seen=new Set();let ps="",pc="";a.forEach((h)=>{const c=String(h.CATEGORY_ID??""),s=String(h.STAGE_ID||""),key=`${c}|${s}`,f=nomeFunilSemCodigo(b.meta.categorias?.[c]||`Categoria ${c}`),lab=b.meta.estagios?.[c]?.[s]?.label||s;if(seen.has(key)&&key!==ps){re++;dealsRe.add(id);rows.push({DEAL_ID:id,TIPO:"REENTRADA_ESTAGIO",FUNIL:f,ETAPA:lab,DATA:h.CREATED_TIME||""})}if(pc&&c!==pc){mud++;rows.push({DEAL_ID:id,TIPO:"MUDANCA_PIPELINE",FUNIL:`${nomeFunilSemCodigo(b.meta.categorias?.[pc]||pc)} → ${f}`,ETAPA:lab,DATA:h.CREATED_TIME||""})}seen.add(key);ps=key;pc=c})});
      criarResultadoCatalogo(chave,"Reentradas, retrabalho e mudanças de pipeline","Histórico de estágios dos negócios.",
        [kpi("Eventos históricos",hist.length),kpi("Reentradas",re),kpi("Deals c/ reentrada",dealsRe.size),kpi("Mudanças pipeline",mud),kpi("Deals analisados",ids.length),kpi("Fonte","stagehistory"),kpi("Reabertura legítima","possível"),kpi("Diagnóstico","investigar")],
        [{titulo:"Eventos históricos relevantes",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Tipo",valor:"TIPO"},{label:"Funil / rota",valor:"FUNIL"},{label:"Etapa",valor:"ETAPA"},{label:"Data",valor:"DATA"}]}],
        "Reentrada é sinal para auditoria, não prova automática de retrabalho.");
    }

    else if(chave==="duplicidades"){
      await buscarUsuariosJornada(webhook);const cb=await listarCompletoRelatorio(webhook,"crm.company.list",["ID","TITLE","PHONE","EMAIL","DATE_CREATE","ASSIGNED_BY_ID"],{},{ID:"ASC"},"Duplicidade: empresas..."),cm={};cb.dados.forEach((x)=>cm[String(x.ID)]=x);const sig=construirSinaisDuplicidadeEmpresas(cm),dup=Object.entries(sig).filter(([id,s])=>s.duplicado).map(([id,s])=>({COMPANY_ID:id,EMPRESA:cm[id]?.TITLE||"",MOTIVOS:s.motivos.join(" | "),RELACIONADOS:s.ids.join(" | ")}));
      const b=await baseDealsCatalogo(webhook,false),m={};b.deals.forEach((d)=>{if(classificarFunilJornada(d.CATEGORY_ID)==="INTERNO")return;const n=idBitrixValido(d.COMPANY_ID)?`C:${idBitrixString(d.COMPANY_ID)}`:`N:${normalizarTextoChave(d.TITLE||"")}`,k=`${n}|||${d.CATEGORY_ID}`;(m[k]||=[]).push(d)});const rep=Object.values(m).filter((a)=>a.length>1).map((a)=>({CLIENTE:enriquecerDealCatalogo(a[0],b)._CLIENTE,FUNIL:enriquecerDealCatalogo(a[0],b)._FUNIL,NEGOCIOS:a.length,IDS:a.map((d)=>d.ID).join(" | ")})).sort((a,b)=>b.NEGOCIOS-a.NEGOCIOS);
      criarResultadoCatalogo(chave,"Duplicidades e identidade do cliente","Sinais cadastrais e repetição no pipeline.",
        [kpi("Empresas",cb.dados.length),kpi("Cadastros sinalizados",dup.length),kpi("Grupos repetidos",rep.length),kpi("Cards nesses grupos",rep.reduce((a,r)=>a+r.NEGOCIOS,0)),kpi("COMPANY_ID 0","ignorado"),kpi("Fusão automática","não"),kpi("IDs","preservados"),kpi("Critério","nome/e-mail/telefone")],
        [{titulo:"Cliente repetido no mesmo pipeline",dados:rep,colunas:[{label:"Cliente",valor:"CLIENTE"},{label:"Funil",valor:"FUNIL"},{label:"Negócios",valor:"NEGOCIOS"},{label:"IDs",valor:"IDS"}]},{titulo:"Possíveis cadastros duplicados",dados:dup,colunas:[{label:"Company ID",valor:"COMPANY_ID"},{label:"Empresa",valor:"EMPRESA"},{label:"Motivos",valor:"MOTIVOS"},{label:"Relacionados",valor:"RELACIONADOS"}]}],
        "Sinal de duplicidade não implica mesclagem automática.");
    }

    else if(chave==="implantacao_posvenda"){
      const b=await baseDealsCatalogo(webhook,false),cats=encontrarCategoriasPorPalavras(b.meta,["financeiro","implantacao","implantação","sucesso do cliente","pos vendas","pós vendas","perfil securitario","perfil securitário"],false),ref=new Date(`${p.referencia}T12:00:00`);
      const rows=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>cats.includes(String(d.CATEGORY_ID))).map((d)=>{const mt=parteDataISO(d.MOVED_TIME),dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):"";return{DEAL_ID:d.ID,CLIENTE:d._CLIENTE,PIPELINE:d._FUNIL,ETAPA:d._ESTAGIO,STATUS:d._SEMANTICA,RESPONSAVEL:d._RESPONSAVEL,DIAS_NO_ESTAGIO:dias,VALOR:d._VALOR,PILOTO:ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)}});
      // Piloto continua contado em Negócios/Concluídos/Pipelines (é uma etapa real de onboarding),
      // mas sai de Abertos/Pipeline aberto/Backlog operacional — mesma regra usada no resto do pedido.
      const g={};rows.forEach((x)=>{if(!g[x.PIPELINE])g[x.PIPELINE]={PIPELINE:x.PIPELINE,NEGOCIOS:0,ABERTOS:0,CONCLUIDOS:0,FORA_30D:0};const r=g[x.PIPELINE];r.NEGOCIOS++;if(x.STATUS==="process"){if(!x.PILOTO)r.ABERTOS++;}else r.CONCLUIDOS++;if(Number(x.DIAS_NO_ESTAGIO)>30)r.FORA_30D++});
      criarResultadoCatalogo(chave,"Implantação, Onboarding e Pós-Venda","Pipelines posteriores ao Comercial.",
        [kpi("Negócios",rows.length),kpi("Abertos",rows.filter((x)=>x.STATUS==="process"&&!x.PILOTO).length),kpi("Concluídos",rows.filter((x)=>x.STATUS!=="process").length),kpi(">30d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>30).length),kpi("Pipelines",Object.keys(g).length),kpi("Clientes",new Set(rows.map((x)=>x.CLIENTE)).size),kpi("Pipeline aberto",moedaRelatorio(rows.filter((x)=>x.STATUS==="process"&&!x.PILOTO).reduce((a,x)=>a+x.VALOR,0))),kpi("Responsáveis",new Set(rows.map((x)=>x.RESPONSAVEL)).size)],
        [{titulo:"Resumo por pipeline",dados:Object.values(g),colunas:[{label:"Pipeline",valor:"PIPELINE"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Abertos",valor:"ABERTOS"},{label:"Concluídos",valor:"CONCLUIDOS"},{label:">30d",valor:"FORA_30D"}]},{titulo:"Backlog operacional",dados:rows.filter((x)=>x.STATUS==="process"&&!x.PILOTO),colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Pipeline",valor:"PIPELINE"},{label:"Etapa",valor:"ETAPA"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias",valor:"DIAS_NO_ESTAGIO"}]}]);
    }

    else if(chave==="atividades_pendentes"){
      const a=await atividadesCatalogo(webhook,false,"",""),ref=p.referencia,m={};const rows=a.dados.map((x)=>{const id=idBitrixString(x.RESPONSIBLE_ID),resp=nomeUsuario(id)||(id?`ID ${id}`:"Sem responsável"),prazo=parteDataISO(x.DEADLINE);let sit="Sem prazo";if(prazo)sit=prazo<ref?"Atrasada":prazo===ref?"Vence hoje":"Futura";return{ATIVIDADE_ID:x.ID,RESPONSAVEL:resp,CANAL:canalAtividadeSDR(x),ASSUNTO:x.SUBJECT||"",DEADLINE:x.DEADLINE||"",SITUACAO:sit,VINCULOS:bindingsDaAtividade(x).map((b)=>`${nomeTipoEntidadeCRM(b.OWNER_TYPE_ID)}:${b.OWNER_ID}`).join(" | ")}});rows.forEach((x)=>{if(!m[x.RESPONSAVEL])m[x.RESPONSAVEL]={RESPONSAVEL:x.RESPONSAVEL,PENDENTES:0,ATRASADAS:0,HOJE:0,SEM_PRAZO:0};const r=m[x.RESPONSAVEL];r.PENDENTES++;if(x.SITUACAO==="Atrasada")r.ATRASADAS++;if(x.SITUACAO==="Vence hoje")r.HOJE++;if(x.SITUACAO==="Sem prazo")r.SEM_PRAZO++});
      criarResultadoCatalogo(chave,"Atividades pendentes e atrasadas",`Referência: <strong>${escapeHtmlRelatorio(ref)}</strong>.`,
        [kpi("Pendentes",rows.length),kpi("Atrasadas",rows.filter((x)=>x.SITUACAO==="Atrasada").length),kpi("Vencem hoje",rows.filter((x)=>x.SITUACAO==="Vence hoje").length),kpi("Sem prazo",rows.filter((x)=>x.SITUACAO==="Sem prazo").length),kpi("Responsáveis",Object.keys(m).length),kpi("Ligações",rows.filter((x)=>x.CANAL==="Ligação").length),kpi("Reuniões",rows.filter((x)=>x.CANAL==="Reunião").length),kpi("Tarefas",rows.filter((x)=>x.CANAL==="Tarefa").length)],
        [{titulo:"Resumo por responsável",dados:Object.values(m).sort((a,b)=>b.ATRASADAS-a.ATRASADAS),colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Pendentes",valor:"PENDENTES"},{label:"Atrasadas",valor:"ATRASADAS"},{label:"Hoje",valor:"HOJE"},{label:"Sem prazo",valor:"SEM_PRAZO"}]},{titulo:"Atividades abertas",dados:rows,colunas:[{label:"ID",valor:"ATIVIDADE_ID"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Canal",valor:"CANAL"},{label:"Assunto",valor:"ASSUNTO"},{label:"Deadline",valor:"DEADLINE"},{label:"Situação",valor:"SITUACAO"},{label:"Vínculos",valor:"VINCULOS"}]}]);
    }

    else if(chave==="pipeline_novo_gerado"){
      const b=await baseDealsCatalogo(webhook,true);
      const hj=p.referencia ? new Date(`${p.referencia}T12:00:00`) : new Date();
      const isoHj=formatarDataISO(hj);
      const tempSem=new Date(hj);
      const dia=tempSem.getDay();
      tempSem.setDate(tempSem.getDate() + (dia===0 ? -6 : 1 - dia));
      const isoSem=formatarDataISO(tempSem);
      const isoMes=isoHj.slice(0,7)+"-01";

      let hjV=0, semV=0, mesV=0;
      let hjQ=0, semQ=0, mesQ=0;
      const m={};

      b.deals.map(d=>enriquecerDealCatalogo(d,b)).forEach(d=>{
        const dc=parteDataISO(d.DATE_CREATE); if(!dc)return;
        if(dc===isoHj){ hjV+=d._VALOR; hjQ++; }
        if(dc>=isoSem && dc<=isoHj){ semV+=d._VALOR; semQ++; }
        if(dc>=isoMes && dc<=isoHj){ mesV+=d._VALOR; mesQ++; }
        if(dc>=isoMes && dc<=isoHj){
          const k=d._RESPONSAVEL || "Sem responsável";
          (m[k]||={RESPONSAVEL:k,QTD:0,VALOR:0});
          m[k].QTD++;
          m[k].VALOR+=d._VALOR;
        }
      });
      const rows=Object.values(m).sort((a,b)=>b.VALOR-a.VALOR);
      criarResultadoCatalogo(chave,"Pipeline Novo Gerado",`Criado hoje, na semana e no mês (Referência: <strong>${escapeHtmlRelatorio(isoHj)}</strong>).`,
        [kpi("Criado Hoje",moedaRelatorio(hjV)),kpi("Qtd Hoje",hjQ),kpi("Criado Semana",moedaRelatorio(semV)),kpi("Qtd Semana",semQ),kpi("Criado Mês",moedaRelatorio(mesV)),kpi("Qtd Mês",mesQ)],
        [{titulo:"Criado no mês por vendedor",dados:rows,colunas:[{label:"Vendedor",valor:"RESPONSAVEL"},{label:"Qtd",valor:"QTD"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="pipeline_carryover"){
      const b=await baseDealsCatalogo(webhook,true);
      const hj=p.referencia ? p.referencia : formatarDataISO(new Date());
      const isoMes=hj.slice(0,7)+"-01";
      const ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      
      const rows=[];
      ds.forEach(d=>{
        const cd=parteDataISO(d.CLOSEDATE);
        const md=parteDataISO(d.DATE_MODIFY);
        const dc=parteDataISO(d.DATE_CREATE);
        let ehCarryover = false;
        let motivo = "";
        if(cd && md && md > cd){ ehCarryover = true; motivo = "Modificado pós CLOSEDATE"; }
        else if(cd && cd < hj){ ehCarryover = true; motivo = "CLOSEDATE vencida"; }
        else if(dc && dc < isoMes){ ehCarryover = true; motivo = "Carryover de mês anterior"; }
        
        if(ehCarryover){
          rows.push({
            DEAL: d.ID,
            CLIENTE: d._CLIENTE,
            RESPONSAVEL: d._RESPONSAVEL,
            MOTIVO: motivo,
            CLOSEDATE: cd || "Sem data",
            MODIFICADO: md || "—",
            VALOR: d._VALOR
          });
        }
      });
      rows.sort((a,b)=>b.VALOR-a.VALOR);

      let prevHist = 0, realHist = 0, temHist = false, msgHist = "Histórico prévio de snapshots não localizado.";
      try {
        let histData = [];
        if (typeof carregarHistoricoCompartilhadoForecast === "function") {
          const comp = await carregarHistoricoCompartilhadoForecast();
          const loc = (typeof carregarHistoricoForecastLocal === "function") ? carregarHistoricoForecastLocal() : [];
          histData = mesclarHistoricosForecast(comp, loc);
        } else {
          const r = await fetch("relatorios/forecast-semanal/historico.json");
          if (r.ok) histData = await r.json();
        }
        if (Array.isArray(histData) && histData.length > 0) {
          temHist = true;
          const ult = histData[histData.length - 1];
          prevHist = Number(ult.projecaoMes ?? ult.FORECAST_TOTAL ?? 0);
          realHist = Number(ult.fechadoMes ?? ult.FECHADO ?? 0);
          msgHist = `Snapshot de histórico mais recente de ${formatarDataBR(ult.data)}.`;
        }
      } catch(e) {}

      const totalValor = rows.reduce((a,r)=>a+r.VALOR, 0);
      criarResultadoCatalogo(chave,"Pipeline Carryover","Negócios com fechamento postergado.",
        [
          kpi("Negócios Postergados", rows.length),
          kpi("Valor Postergado", moedaRelatorio(totalValor)),
          kpi("Histórico Projeção", temHist ? moedaRelatorio(prevHist) : "Dados históricos insuficientes"),
          kpi("Histórico Fechado", temHist ? moedaRelatorio(realHist) : "Dados históricos insuficientes")
        ],
        [{titulo:"Negócios postergados (Carryover)",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Motivo",valor:"MOTIVO"},{label:"CloseDate",valor:"CLOSEDATE"},{label:"Modificado",valor:"MODIFICADO"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}],
        msgHist);
    }
    else if(chave==="closedate_intelligence"){
      const b=await baseDealsCatalogo(webhook,true);
      const hj=p.referencia ? p.referencia : formatarDataISO(new Date());
      const isoMes=hj.slice(0,7);
      const ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      
      let venc=0, vencV=0, sem=0, semV=0, noMes=0, noMesV=0;
      const rows=[];
      ds.forEach(d=>{
        const cd=parteDataISO(d.CLOSEDATE);
        if(!cd){
          sem++; semV+=d._VALOR;
          rows.push({DEAL:d.ID, CLIENTE:d._CLIENTE, RESPONSAVEL:d._RESPONSAVEL, SIT:"Sem CLOSEDATE", CLOSEDATE:"—", VALOR:d._VALOR});
        } else if(cd < hj){
          venc++; vencV+=d._VALOR;
          rows.push({DEAL:d.ID, CLIENTE:d._CLIENTE, RESPONSAVEL:d._RESPONSAVEL, SIT:"Vencida", CLOSEDATE:cd, VALOR:d._VALOR});
        } else if(cd.slice(0,7) === isoMes){
          noMes++; noMesV+=d._VALOR;
        }
      });
      rows.sort((a,b)=>b.VALOR-a.VALOR);

      criarResultadoCatalogo(chave,"CLOSEDATE Intelligence","Higiene de datas no pipeline aberto (vencidas, sem data, no mês).",
        [
          kpi("Vencidas", venc),
          kpi("Valor Vencido", moedaRelatorio(vencV)),
          kpi("Sem Data", sem),
          kpi("Valor Sem Data", moedaRelatorio(semV)),
          kpi("Vence no Mês", noMes),
          kpi("Valor no Mês", moedaRelatorio(noMesV))
        ],
        [{titulo:"Oportunidades com problema de data (Vencidas / Sem Data)",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Situação",valor:"SIT"},{label:"CLOSEDATE",valor:"CLOSEDATE"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="forecast_accuracy"){
      let prev=0, real=0, meta=0, acc=0, temDados=false, msg="Dados históricos insuficientes.";
      let rows=[];
      try{
        let data = [];
        if (typeof carregarHistoricoCompartilhadoForecast === "function") {
          const comp = await carregarHistoricoCompartilhadoForecast();
          const loc = (typeof carregarHistoricoForecastLocal === "function") ? carregarHistoricoForecastLocal() : [];
          data = mesclarHistoricosForecast(comp, loc);
        } else {
          const r = await fetch("relatorios/forecast-semanal/historico.json");
          if (r.ok) data = await r.json();
        }
        if (Array.isArray(data) && data.length > 0) {
          temDados = true;
          rows = data.map(item => {
            const pVal = Number(item.projecaoMes ?? item.FORECAST_TOTAL ?? 0);
            const fVal = Number(item.fechadoMes ?? item.FECHADO ?? 0);
            const mVal = Number(item.metaMensal ?? 0);
            const acVal = pVal > 0 ? (typeof taxaPct === "function" ? taxaPct(fVal, pVal) : Math.round((fVal / pVal) * 10000) / 100) : 0;
            return {
              DATA: item.data || "—",
              FONTE: item.fonte === "local" ? "💻 Local" : "🤖 Automático",
              META: mVal,
              PROJECAO: pVal,
              FECHADO: fVal,
              ACCURACY: pVal > 0 ? `${acVal}%` : "—"
            };
          }).reverse();
          const ult = data[data.length - 1];
          prev = Number(ult.projecaoMes ?? ult.FORECAST_TOTAL ?? 0);
          real = Number(ult.fechadoMes ?? ult.FECHADO ?? 0);
          meta = Number(ult.metaMensal ?? 0);
          acc = prev > 0 ? (typeof taxaPct === "function" ? taxaPct(real, prev) : Math.round((real / prev) * 10000) / 100) : 0;
          msg = `Acurácia do forecast comparando histórico oficial (projecaoMes vs fechadoMes). Coletados ${data.length} registro(s).`;
        }
      } catch(e) {
        msg = "Dados históricos insuficientes.";
      }
      criarResultadoCatalogo(chave,"Forecast Accuracy","Comparação contra histórico oficial (projecaoMes vs fechadoMes).",
        [
          kpi("Última Previsão", temDados && prev ? moedaRelatorio(prev) : "Dados históricos insuficientes"),
          kpi("Realizado", temDados && real ? moedaRelatorio(real) : "Dados históricos insuficientes"),
          kpi("Accuracy", temDados && prev ? `${acc}%` : "Dados históricos insuficientes")
        ],
        temDados ? [{titulo:"Histórico de acurácia oficial",dados:rows,colunas:[{label:"Data",valor:"DATA"},{label:"Fonte",valor:"FONTE"},{label:"Meta",valor:x=>moedaRelatorio(x.META),html:true},{label:"Projeção",valor:x=>moedaRelatorio(x.PROJECAO),html:true},{label:"Fechado",valor:x=>moedaRelatorio(x.FECHADO),html:true},{label:"Accuracy",valor:"ACCURACY"}]}] : [],
        msg);
    }
    else if(chave==="opportunity_health_score"){
      const b=await baseDealsCatalogo(webhook,true);
      const ab=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      const ref=new Date(`${p.referencia}T12:00:00`);
      let somaScore=0, exc=0, sau=0, ate=0, cri=0;
      const rows=ab.map(d=>{
        let sAct=0;
        if(d.LAST_ACTIVITY_TIME){
          const diasAct=Math.max(0,Math.floor((ref-new Date(d.LAST_ACTIVITY_TIME))/86400000));
          sAct=diasAct<=7?100:diasAct<=14?70:diasAct<=30?40:0;
        }
        let sDate=0;
        const cd=parteDataISO(d.CLOSEDATE);
        if(!cd) sDate=70;
        else if(cd>=p.referencia) sDate=100;
        else sDate=0;
        let sAge=100;
        if(d._CICLO!==""){
          const c=Number(d._CICLO);
          sAge=c<=30?100:c<=60?70:c<=90?40:0;
        }
        const pr=Number(d.PROBABILITY);
        const sProb=(Number.isFinite(pr)&&pr>0&&pr<=100)?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA);
        const score=Math.round(sAct*0.3 + sDate*0.25 + sAge*0.25 + sProb*0.2);
        somaScore+=score;
        let faixa="Saudável";
        if(score>=80){exc++;faixa="Excelente"}
        else if(score>=60){sau++;faixa="Saudável"}
        else if(score>=40){ate++;faixa="Atenção"}
        else{cri++;faixa="Crítico"}
        return {
          DEAL: String(d.ID),
          CLIENTE: d._CLIENTE,
          RESPONSAVEL: d._RESPONSAVEL,
          ESTAGIO: d._ESTAGIO,
          VALOR: d._VALOR,
          SCORE: score,
          S_ACT: sAct,
          S_DATE: sDate,
          S_AGE: sAge,
          S_PROB: sProb,
          FAIXA: faixa
        };
      }).sort((a,b)=>b.SCORE-a.SCORE);

      const med=ab.length?Math.round(somaScore/ab.length):0;
      criarResultadoCatalogo(chave,"Opportunity Health Score","Score de saúde das oportunidades abertas (0 a 100).",
        [
          kpi("Abertas",ab.length),
          kpi("Score Médio",`${med}/100`),
          kpi("Excelente (>=80)",exc),
          kpi("Saudável (60-79)",sau),
          kpi("Atenção (40-59)",ate),
          kpi("Crítico (<40)",cri)
        ],
        [{titulo:"Score de saúde por oportunidade",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Estágio",valor:"ESTAGIO"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true},{label:"Score",valor:x=>`${x.SCORE}/100`},{label:"Faixa",valor:"FAIXA"}]}],
        "Score considera Atividade Recente (30%), CLOSEDATE (25%), Aging (25%) e Probabilidade (20%).");
    }
    else if(chave==="pipeline_velocity"){
      const b=await baseDealsCatalogo(webhook,true);
      const ds=b.deals.map(d=>enriquecerDealCatalogo(d,b));
      const m={};
      ds.forEach(d=>{
        const k=String(d.ASSIGNED_BY_ID||"0");
        const r=m[k]||=( {RESPONSAVEL:d._RESPONSAVEL,OPORTUNIDADES:0,GANHOS:0,PERDAS:0,RECEITA:0,CICLO_SOMA:0,CICLO_N:0});
        if(dentroPeriodoCatalogo(d.DATE_CREATE,p)) r.OPORTUNIDADES++;
        if(dentroPeriodoCatalogo(d._FECHAMENTO,p)){
          if(d._SEMANTICA==="success"){r.GANHOS++;r.RECEITA+=d._VALOR}
          else if(d._SEMANTICA==="failure"){r.PERDAS++}
          if(d._CICLO!==""){r.CICLO_SOMA+=Number(d._CICLO);r.CICLO_N++}
        }
      });
      let velGeral=0, projGeral=0, totOpp=0, totGan=0, totRec=0, totCicloSoma=0, totCicloN=0;
      const rows=Object.values(m).map(r=>{
        const closed=r.GANHOS+r.PERDAS;
        const winRate=closed?r.GANHOS/closed:0;
        const ticket=r.GANHOS?r.RECEITA/r.GANHOS:0;
        const ciclo=r.CICLO_N?r.CICLO_SOMA/r.CICLO_N:30;
        const velDia=ciclo>0?(r.OPORTUNIDADES * winRate * ticket)/ciclo:0;
        const proj30d=velDia*30;
        velGeral+=velDia;
        projGeral+=proj30d;
        totOpp+=r.OPORTUNIDADES;
        totGan+=r.GANHOS;
        totRec+=r.RECEITA;
        totCicloSoma+=r.CICLO_SOMA;
        totCicloN+=r.CICLO_N;
        return {
          RESPONSAVEL: r.RESPONSAVEL,
          OPORTUNIDADES: r.OPORTUNIDADES,
          GANHOS: r.GANHOS,
          WIN_RATE: `${taxaPct(r.GANHOS,closed)}%`,
          TICKET: ticket,
          CICLO: Math.round(ciclo*10)/10,
          VELOCITY_DIA: velDia,
          PROJECAO_30D: proj30d
        };
      }).sort((a,b)=>b.VELOCITY_DIA-a.VELOCITY_DIA);
      const cicloMedGeral=totCicloN?Math.round(totCicloSoma/totCicloN*10)/10:30;
      const ticketMedGeral=totGan?totRec/totGan:0;
      criarResultadoCatalogo(chave,"Pipeline Velocity","Velocidade de conversão do pipeline em receita por dia.",
        [
          kpi("Velocity Geral",`${moedaRelatorio(velGeral)}/dia`),
          kpi("Projeção Mensal (30d)",moedaRelatorio(projGeral)),
          kpi("Oportunidades Criadas",totOpp),
          kpi("Ganhos",totGan),
          kpi("Ticket Médio",moedaRelatorio(ticketMedGeral)),
          kpi("Ciclo Médio",`${cicloMedGeral}d`)
        ],
        [{titulo:"Pipeline Velocity por responsável",dados:rows,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Oportunidades",valor:"OPORTUNIDADES"},{label:"Ganhos",valor:"GANHOS"},{label:"Win Rate",valor:"WIN_RATE"},{label:"Ticket",valor:x=>moedaRelatorio(x.TICKET),html:true},{label:"Ciclo Médio",valor:x=>`${x.CICLO}d`},{label:"Velocity/dia",valor:x=>`${moedaRelatorio(x.VELOCITY_DIA)}/d`,html:true},{label:"Projeção 30d",valor:x=>moedaRelatorio(x.PROJECAO_30D),html:true}]}],
        "Fórmula oficial: Velocity = (Oportunidades × Win Rate × Ticket Médio) ÷ Ciclo Médio (dias).");
    }
    else if(chave==="receita_em_risco"){
      const b=await baseDealsCatalogo(webhook,true);
      const ref=new Date(`${p.referencia}T12:00:00`);
      const ab=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      let valRisco=0, semCD=0, cdVenc=0, estagnado=0;
      const rows=[];
      ab.forEach(d=>{
        const cd=parteDataISO(d.CLOSEDATE);
        const mt=parteDataISO(d.MOVED_TIME||d.DATE_CREATE);
        const diasMov=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):0;
        const motivos=[];
        if(!cd){semCD++;motivos.push("Sem CLOSEDATE")}
        else if(cd<p.referencia){cdVenc++;motivos.push("CLOSEDATE vencida")}
        if(diasMov>30){estagnado++;motivos.push(`Estagnado (${diasMov}d)`)}
        if(motivos.length>0){
          valRisco+=d._VALOR;
          rows.push({
            DEAL: String(d.ID),
            CLIENTE: d._CLIENTE,
            RESPONSAVEL: d._RESPONSAVEL,
            ESTAGIO: d._ESTAGIO,
            VALOR: d._VALOR,
            SIT: motivos.join(" | ")
          });
        }
      });
      rows.sort((a,b)=>b.VALOR-a.VALOR);
      criarResultadoCatalogo(chave,"Receita em Risco","Oportunidades abertas com risco de fechamento ou estagnação.",
        [
          kpi("Oportunidades em Risco",rows.length),
          kpi("Valor em Risco",moedaRelatorio(valRisco)),
          kpi("Sem CLOSEDATE",semCD),
          kpi("CLOSEDATE Vencida",cdVenc),
          kpi("Estagnados > 30d",estagnado)
        ],
        [{titulo:"Detalhamento de receita em risco",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Estágio",valor:"ESTAGIO"},{label:"Valor em Risco",valor:x=>moedaRelatorio(x.VALOR),html:true},{label:"Motivo de Risco",valor:"SIT"}]}],
        "Considera negócios abertos sem CLOSEDATE, com CLOSEDATE vencida ou estagnados há mais de 30 dias.");
    }
    else if(chave==="motivos_ganho_perda"){
      const b=await baseDealsCatalogo(webhook,true);
      const ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>dentroPeriodoCatalogo(d._FECHAMENTO,p)&&(d._SEMANTICA==="success"||d._SEMANTICA==="failure"));
      let won=0, lost=0, recGanha=0, valPerdido=0;
      const mapaMotivos={};
      const rowsDet=[];
      ds.forEach(d=>{
        const res=d._SEMANTICA==="success"?"Ganho":"Perdido";
        if(d._SEMANTICA==="success"){won++;recGanha+=d._VALOR}
        else{lost++;valPerdido+=d._VALOR}
        const motivo=d.ADDITIONAL_INFO||d.UF_CRM_1770928318695||d._ESTAGIO||"Não especificado";
        const k=`${res}|||${motivo}`;
        const item=mapaMotivos[k]||=( {RESULTADO:res,MOTIVO_ESTAGIO:motivo,DEALS:0,VALOR:0});
        item.DEALS++;
        item.VALOR+=d._VALOR;
        rowsDet.push({
          DEAL: String(d.ID),
          CLIENTE: d._CLIENTE,
          RESPONSAVEL: d._RESPONSAVEL,
          RESULTADO: res,
          ESTAGIO: d._ESTAGIO,
          VALOR: d._VALOR,
          MOTIVO: motivo
        });
      });
      const totFechados=won+lost;
      const rowsAgrup=Object.values(mapaMotivos).map(r=>({...r,PERCENTUAL:`${taxaPct(r.DEALS,totFechados)}%`})).sort((a,b)=>b.DEALS-a.DEALS);
      criarResultadoCatalogo(chave,"Motivos de Ganho e Perda","Análise de motivos e estágios de fechamento em dados reais Bitrix.",
        [
          kpi("Fechados",totFechados),
          kpi("Deals Ganhos",won),
          kpi("Receita Ganha",moedaRelatorio(recGanha)),
          kpi("Deals Perdidos",lost),
          kpi("Valor Perdido",moedaRelatorio(valPerdido)),
          kpi("Win Rate",`${taxaPct(won,totFechados)}%`)
        ],
        [
          {titulo:"Agrupamento por resultado e motivo",dados:rowsAgrup,colunas:[{label:"Resultado",valor:"RESULTADO"},{label:"Motivo / Estágio",valor:"MOTIVO_ESTAGIO"},{label:"Deals",valor:"DEALS"},{label:"Valor Total",valor:x=>moedaRelatorio(x.VALOR),html:true},{label:"% Fechados",valor:"PERCENTUAL"}]},
          {titulo:"Detalhamento individual de fechamentos",dados:rowsDet,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Resultado",valor:"RESULTADO"},{label:"Estágio",valor:"ESTAGIO"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true},{label:"Motivo Registrado",valor:"MOTIVO"}]}
        ],
        "Motivos extraídos de campos reais do Bitrix (ADDITIONAL_INFO / estágio de perda).");
    }

    else if(chave==="vendido_faturado"){
      // 49. Vendido × Faturado
      const b=await baseDealsCatalogo(webhook,true);
      const fs=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success");
      const faturamentos=getFaturamentos();
      const agrupado=agruparFaturamentosPorNegocio();

      // "Mês" para o gráfico: Mês do Fechamento (Vendido) vs Mês da NF (Faturado) não batem 1:1.
      // O requisito diz "Mês da venda no Bitrix vs Mês em que a NF ocorreu".
      // Vamos agrupar os KPIs pela data de Fechamento (Vendido).
      const mesFiltrado=p.mes||"";
      const rows=[];
      let totalVendido=0, totalFaturado=0, totalPendente=0;
      let faturamentosMesAtual=0;

      fs.forEach((d)=>{
        const faturadoInfo = agrupado[String(d.ID)] || { faturado: 0, nfs: 0 };
        const vendido = d._VALOR || 0;
        const faturado = faturadoInfo.faturado;
        const pendente = Math.max(0, vendido - faturado);

        let status = "AGUARDANDO FINANCEIRO";
        if(faturado === 0 && faturadoInfo.nfs === 0) status = "AGUARDANDO FINANCEIRO";
        // "NÃO FATURADO" necessitaria flag explícita do Financeiro. Usaremos as flags simples por hora
        else if(faturado > 0 && faturado < vendido) status = "PARCIALMENTE FATURADO";
        else if(faturado === vendido) status = "FATURADO";
        else if(faturado > vendido) status = "DIVERGÊNCIA";

        // Filtro de mês pelo Deal
        const noMes = mesFiltrado ? d._FECHAMENTO.startsWith(mesFiltrado) : true;
        if(noMes) {
          totalVendido += vendido;
          totalFaturado += faturado; // Quanto do que foi VENDIDO neste mês já foi faturado
          totalPendente += pendente;
          rows.push({
            DEAL_ID: d.ID,
            CLIENTE: d._CLIENTE,
            VENDEDOR: d._RESPONSAVEL,
            DATA_VENDA: d._FECHAMENTO,
            VENDIDO: vendido,
            FATURADO: faturado,
            PENDENTE: pendente,
            STATUS: status,
            NFS: faturadoInfo.nfs,
            ACOES: `<button class="btn btn-secundario btn-sm" onclick="abrirModalFaturamento('${d.ID}', '${escapeHtmlRelatorio(d._CLIENTE)}', ${vendido}, ${faturado})">+ NF</button>`
          });
        }
      });

      faturamentos.forEach((f)=>{
        if(mesFiltrado && f.data_faturamento && f.data_faturamento.startsWith(mesFiltrado)){
          faturamentosMesAtual += Number(f.valor_faturado) || 0;
        } else if (!mesFiltrado) {
          faturamentosMesAtual += Number(f.valor_faturado) || 0;
        }
      });

      const pct = totalVendido > 0 ? (totalFaturado / totalVendido) * 100 : 0;
      rows.sort((a,b)=>b.VENDIDO - a.VENDIDO);

      criarResultadoCatalogo(chave,"Vendido × Faturado","Comparação entre as vendas ganhas no Comercial e as NFs emitidas pelo Financeiro.",
        [
          kpi("Vendido (Competência Comercial)",moedaRelatorio(totalVendido)),
          kpi("Faturado (Deste vendido)",moedaRelatorio(totalFaturado)),
          kpi("Pendente",moedaRelatorio(totalPendente)),
          kpi("% Faturado (Coorte Venda)",`${pct.toFixed(1)}%`),
          kpi("Faturado Realizado (Competência Financeira)",moedaRelatorio(faturamentosMesAtual)),
          kpi("Negócios",rows.length),
          kpi("Divergências",rows.filter(r=>r.STATUS==="DIVERGÊNCIA").length)
        ],
        [
          {titulo:"Listagem de Vendas",dados:rows,colunas:[
            {label:"Deal",valor:"DEAL_ID"},
            {label:"Cliente",valor:"CLIENTE"},
            {label:"Vendedor",valor:"VENDEDOR"},
            {label:"Vendido em",valor:"DATA_VENDA"},
            {label:"Vendido",valor:(x)=>moedaRelatorio(x.VENDIDO),html:true},
            {label:"Faturado",valor:(x)=>moedaRelatorio(x.FATURADO),html:true},
            {label:"Pendente",valor:(x)=>moedaRelatorio(x.PENDENTE),html:true},
            {label:"Status",valor:"STATUS"},
            {label:"NFs",valor:"NFS"},
            {label:"Ações",valor:"ACOES",html:true}
          ]}
        ],
        "Fonte primária dos registros de faturamento baseada em localStorage local do navegador (namespace atlas-extrator-faturamentos). Classificação mantida no máximo como Classe B/C (nunca Classe A) até haver persistência corporativa centralizada (PostgreSQL / camada Bronze).");
    }

    else if(chave==="backlog_financeiro"){
      // 50. Backlog Financeiro de Vendas
      const b=await baseDealsCatalogo(webhook,true);
      const fs=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success");
      const agrupado=agruparFaturamentosPorNegocio();

      const hoje = new Date();
      let totalPendente = 0;
      let count0_3=0, count4_7=0, count8_15=0, count16_30=0, count30mais=0;

      const rows=[];
      fs.forEach((d)=>{
        const faturadoInfo = agrupado[String(d.ID)] || { faturado: 0, nfs: 0 };
        const vendido = d._VALOR || 0;
        const pendente = Math.max(0, vendido - faturadoInfo.faturado);

        if (pendente > 0) {
          const dtVenda = d._FECHAMENTO ? new Date(`${d._FECHAMENTO}T12:00:00`) : new Date(d.MOVED_TIME||d.DATE_CREATE);
          const dias = Math.max(0, Math.floor((hoje - dtVenda) / 86400000));

          let faixa = "0-3 dias";
          if(dias>30) { faixa="Acima de 30"; count30mais++; }
          else if(dias>=16) { faixa="16-30"; count16_30++; }
          else if(dias>=8) { faixa="8-15"; count8_15++; }
          else if(dias>=4) { faixa="4-7"; count4_7++; }
          else { count0_3++; }

          totalPendente += pendente;

          rows.push({
            DEAL_ID: d.ID,
            CLIENTE: d._CLIENTE,
            VENDEDOR: d._RESPONSAVEL,
            DATA_VENDA: d._FECHAMENTO,
            VENDIDO: vendido,
            FATURADO: faturadoInfo.faturado,
            PENDENTE: pendente,
            DIAS: dias,
            FAIXA: faixa,
            NFS: faturadoInfo.nfs,
            ACOES: `<button class="btn btn-secundario btn-sm" onclick="abrirModalFaturamento('${d.ID}', '${escapeHtmlRelatorio(d._CLIENTE)}', ${vendido}, ${faturadoInfo.faturado})">+ NF</button>`
          });
        }
      });

      // Classificar por valor pendente (maior primeiro)
      rows.sort((a,b)=>b.PENDENTE - a.PENDENTE);

      criarResultadoCatalogo(chave,"Backlog Financeiro de Vendas","O que foi vendido e ainda precisa ser faturado.",
        [
          kpi("Negócios pendentes",rows.length),
          kpi("Valor pendente",moedaRelatorio(totalPendente)),
          kpi("0-3 dias",count0_3),
          kpi("4-7 dias",count4_7),
          kpi("8-15 dias",count8_15),
          kpi("16-30 dias",count16_30),
          kpi(">30 dias",count30mais)
        ],
        [
          {titulo:"Prioridade de Faturamento",dados:rows,colunas:[
            {label:"Deal",valor:"DEAL_ID"},
            {label:"Cliente",valor:"CLIENTE"},
            {label:"Vendedor",valor:"VENDEDOR"},
            {label:"Data",valor:"DATA_VENDA"},
            {label:"Dias Pendente",valor:"DIAS"},
            {label:"Faixa",valor:"FAIXA"},
            {label:"Pendente",valor:(x)=>moedaRelatorio(x.PENDENTE),html:true},
            {label:"NFs parciais",valor:"NFS"},
            {label:"Ações",valor:"ACOES",html:true}
          ]}
        ],
        "Cálculo de backlog e saldo pendente baseado na reconciliação de vendas Bitrix com faturamentos armazenados no localStorage local do navegador (namespace atlas-extrator-faturamentos). Classificação mantida no máximo como Classe B/C (nunca Classe A) até haver persistência corporativa centralizada (PostgreSQL / camada Bronze).");
    }

    else if(chave==="crm_health_score"){
      const [db,lb,a]=await Promise.all([
        baseDealsCatalogo(webhook,false),
        baseLeadsCatalogo(webhook),
        atividadesCatalogo(webhook,false,"","")
      ]);
      const ds=db.deals, ls=lb.leads, ats=a.dados, ref=p.referencia;
      const openDeals=ds.filter((d)=>semanticaDeal(d,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]||{})==="process"&&!ehEstagioPiloto(d.STAGE_ID,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]?.label));

      // 1. Completude de Dados (peso: 40%)
      const checksData=[
        {total:ds.length, faltantes:ds.filter((d)=>!idBitrixValido(d.COMPANY_ID)&&!idBitrixValido(d.CONTACT_ID)&&!idBitrixValido(d.LEAD_ID)).length},
        {total:ds.length, faltantes:ds.filter((d)=>!String(d.SOURCE_ID||"").trim()).length},
        {total:ds.length, faltantes:ds.filter((d)=>!idBitrixValido(d.ASSIGNED_BY_ID)).length},
        {total:ds.length, faltantes:ds.filter((d)=>!(Number(d.OPPORTUNITY)>0)).length},
        {total:ls.length, faltantes:ls.filter((l)=>!String(l.SOURCE_ID||"").trim()).length},
        {total:ls.length, faltantes:ls.filter((l)=>!idBitrixValido(l.ASSIGNED_BY_ID)).length},
        {total:ls.length, faltantes:ls.filter((l)=>!String(l.COMPANY_TITLE||l.NAME||l.TITLE||"").trim()).length},
        {total:ls.length, faltantes:ls.filter((l)=>!(valoresMulticampo(l,"PHONE").length||valoresMulticampo(l,"EMAIL").length)).length}
      ];
      const totalChecksSum=checksData.reduce((s,c)=>s+c.total,0);
      const totalFaltantesSum=checksData.reduce((s,c)=>s+c.faltantes,0);
      const completudePct=totalChecksSum?Math.round((1-totalFaltantesSum/totalChecksSum)*10000)/100:100;
      const pilarCompletudeScore=Math.round(completudePct*0.40);

      // 2. Higiene de Atividades Pendentes (peso: 30%)
      const atrasadas=ats.filter((x)=>{
        const prazo=parteDataISO(x.DEADLINE||x.END_TIME||x.START_TIME);
        return prazo && prazo < ref;
      }).length;
      const atividadesSaudaveisPct=ats.length?Math.round(((ats.length-atrasadas)/ats.length)*10000)/100:100;
      const pilarAtividadesScore=Math.round(atividadesSaudaveisPct*0.30);

      // 3. CLOSEDATE Válidas em Negócios Abertos (peso: 30%)
      const closedateInvalidas=openDeals.filter((d)=>{
        const cd=parteDataISO(d.CLOSEDATE);
        return !cd || cd < ref;
      }).length;
      const closedateValidaPct=openDeals.length?Math.round(((openDeals.length-closedateInvalidas)/openDeals.length)*10000)/100:100;
      const pilarCloseDateScore=Math.round(closedateValidaPct*0.30);

      // Score Total (0 a 100)
      const scoreTotal=Math.min(100, Math.max(0, Math.round(pilarCompletudeScore + pilarAtividadesScore + pilarCloseDateScore)));
      const faixaStatus=scoreTotal>=85?"Excelente (Saudável)":scoreTotal>=70?"Bom (Atenção moderada)":scoreTotal>=50?"Regular (Requer saneamento)":"Crítico (Ação imediata)";

      const pilares=[
        {PILAR:"Completude de Dados",PESO:"40%",METRICA:`${completudePct}%`,PONTOS:`${pilarCompletudeScore} / 40`},
        {PILAR:"Higiene de Atividades (Backlog)",PESO:"30%",METRICA:`${atividadesSaudaveisPct}% sem atraso`,PONTOS:`${pilarAtividadesScore} / 30`},
        {PILAR:"CLOSEDATE Válida em Abertos",PESO:"30%",METRICA:`${closedateValidaPct}% válidas`,PONTOS:`${pilarCloseDateScore} / 30`}
      ];

      const ocorrencias=[
        {REGRA:"Campos faltantes (Deals + Leads)",ENTIDADE:"Deals/Leads",TOTAL:totalChecksSum,INCONSISTENTES:totalFaltantesSum,IMPACTO:`- ${Math.round((100-completudePct)*0.40)} pts`},
        {REGRA:"Atividades atrasadas",ENTIDADE:"Atividades",TOTAL:ats.length,INCONSISTENTES:atrasadas,IMPACTO:`- ${Math.round((100-atividadesSaudaveisPct)*0.30)} pts`},
        {REGRA:"CLOSEDATE ausente ou no passado",ENTIDADE:"Negócios Abertos",TOTAL:openDeals.length,INCONSISTENTES:closedateInvalidas,IMPACTO:`- ${Math.round((100-closedateValidaPct)*0.30)} pts`}
      ];

      criarResultadoCatalogo(chave,"CRM Health Score — Saúde Operacional",`Pontuação global de saúde operacional: <strong>${scoreTotal}/100</strong> (${faixaStatus}).`,
        [
          kpi("CRM Health Score",`${scoreTotal}/100`),
          kpi("Status",faixaStatus),
          kpi("Completude Dados",`${completudePct}%`),
          kpi("Atividades Ok",`${atividadesSaudaveisPct}%`),
          kpi("CLOSEDATE Ok",`${closedateValidaPct}%`),
          kpi("Atividades Atrasadas",atrasadas),
          kpi("Deals CLOSEDATE Invalida",closedateInvalidas)
        ],
        [
          {titulo:"Resumo dos Pilares de Saúde",dados:pilares,colunas:[{label:"Pilar de Qualidade",valor:"PILAR"},{label:"Peso",valor:"PESO"},{label:"Métrica Atual",valor:"METRICA"},{label:"Contribuição",valor:"PONTOS"}]},
          {titulo:"Impacto por Regra de Inconsistência",dados:ocorrencias,colunas:[{label:"Regra de Auditoria",valor:"REGRA"},{label:"Entidade Auditada",valor:"ENTIDADE"},{label:"Total Auditado",valor:"TOTAL"},{label:"Ocorrências",valor:"INCONSISTENTES"},{label:"Impacto no Score",valor:"IMPACTO"}]}
        ],
        "Cálculo ponderado do CRM Health Score: 40% completude de campos operacionais, 30% ausência de atividades atrasadas, 30% higiene de CLOSEDATE em negócios abertos.");
    }

    else if(chave==="qualidade_crm"){
      const [db,lb]=await Promise.all([baseDealsCatalogo(webhook,false),baseLeadsCatalogo(webhook)]),ds=db.deals,ls=lb.leads,ref=p.referencia;
      const open=ds.filter((d)=>semanticaDeal(d,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]||{})==="process"&&!ehEstagioPiloto(d.STAGE_ID,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]?.label));
      
      const checks=[
        {ENTIDADE:"Negócios",CAMPO:"Vínculo cliente",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!idBitrixValido(d.COMPANY_ID)&&!idBitrixValido(d.CONTACT_ID)&&!idBitrixValido(d.LEAD_ID)).length},
        {ENTIDADE:"Negócios",CAMPO:"SOURCE_ID (Origem)",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!String(d.SOURCE_ID||"").trim()).length},
        {ENTIDADE:"Negócios",CAMPO:"ASSIGNED_BY_ID (Responsável)",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!idBitrixValido(d.ASSIGNED_BY_ID)).length},
        {ENTIDADE:"Negócios",CAMPO:"OPPORTUNITY > 0 (Valor)",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!(Number(d.OPPORTUNITY)>0)).length},
        {ENTIDADE:"Negócios abertos",CAMPO:"CLOSEDATE preenchida",TOTAL:open.length,FALTANTES:open.filter((d)=>!parteDataISO(d.CLOSEDATE)).length},
        {ENTIDADE:"Negócios abertos",CAMPO:"CLOSEDATE válida (não vencida)",TOTAL:open.length,FALTANTES:open.filter((d)=>{const cd=parteDataISO(d.CLOSEDATE); return !cd || cd < ref;}).length},
        {ENTIDADE:"Leads",CAMPO:"SOURCE_ID (Origem)",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!String(l.SOURCE_ID||"").trim()).length},
        {ENTIDADE:"Leads",CAMPO:"ASSIGNED_BY_ID (Responsável)",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!idBitrixValido(l.ASSIGNED_BY_ID)).length},
        {ENTIDADE:"Leads",CAMPO:"Empresa / nome preenchido",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!String(l.COMPANY_TITLE||l.NAME||l.TITLE||"").trim()).length},
        {ENTIDADE:"Leads",CAMPO:"Telefone ou e-mail",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!(valoresMulticampo(l,"PHONE").length||valoresMulticampo(l,"EMAIL").length)).length}
      ].map((x)=>({...x,COMPLETUDE_PCT:x.TOTAL?Math.round((1-x.FALTANTES/x.TOTAL)*10000)/100:100}));

      // Detalhamento de Negócios com campos pendentes/faltantes
      const dealsPendentes=ds.map((d)=>{
        const sem=semanticaDeal(d,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]||{});
        const dOpen=sem==="process"&&!ehEstagioPiloto(d.STAGE_ID,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]?.label);
        const pend=[];
        if(!idBitrixValido(d.COMPANY_ID)&&!idBitrixValido(d.CONTACT_ID)&&!idBitrixValido(d.LEAD_ID)) pend.push("Sem cliente");
        if(!String(d.SOURCE_ID||"").trim()) pend.push("Sem origem");
        if(!idBitrixValido(d.ASSIGNED_BY_ID)) pend.push("Sem responsável");
        if(!(Number(d.OPPORTUNITY)>0)) pend.push("Valor zerado/nulo");
        if(dOpen){
          const cd=parteDataISO(d.CLOSEDATE);
          if(!cd) pend.push("Sem CLOSEDATE");
          else if(cd<ref) pend.push("CLOSEDATE vencida");
        }
        return pend.length?{
          DEAL_ID:d.ID,
          CLIENTE:enriquecerDealCatalogo(d,db)._CLIENTE,
          RESPONSAVEL:enriquecerDealCatalogo(d,db)._RESPONSAVEL,
          VALOR:Number(d.OPPORTUNITY)||0,
          PENDENCIAS:pend.join(" | ")
        }:null;
      }).filter(Boolean);

      // Detalhamento de Leads com campos pendentes/faltantes
      const leadsPendentes=ls.map((l)=>{
        const pend=[];
        if(!String(l.SOURCE_ID||"").trim()) pend.push("Sem origem");
        if(!idBitrixValido(l.ASSIGNED_BY_ID)) pend.push("Sem responsável");
        if(!String(l.COMPANY_TITLE||l.NAME||l.TITLE||"").trim()) pend.push("Sem nome/empresa");
        if(!(valoresMulticampo(l,"PHONE").length||valoresMulticampo(l,"EMAIL").length)) pend.push("Sem telefone/e-mail");
        return pend.length?{
          LEAD_ID:l.ID,
          NOME:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"Sem nome",
          RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID)||(l.ASSIGNED_BY_ID?`ID ${l.ASSIGNED_BY_ID}`:"Sem responsável"),
          PENDENCIAS:pend.join(" | ")
        }:null;
      }).filter(Boolean);

      criarResultadoCatalogo(chave,"Qualidade do CRM & campos faltantes","Completude e integridade dos campos operacionais de Negócios e Leads.",
        [
          kpi("Negócios",ds.length),
          kpi("Leads",ls.length),
          kpi("Checks",checks.length),
          kpi("Total Ocorrências",checks.reduce((a,x)=>a+x.FALTANTES,0)),
          kpi("Deals com Pendência",dealsPendentes.length),
          kpi("Leads com Pendência",leadsPendentes.length),
          kpi("Deals sem cliente",checks[0].FALTANTES),
          kpi("Leads sem contato",checks[9].FALTANTES)
        ],
        [
          {titulo:"Completude por regra",dados:checks,colunas:[{label:"Entidade",valor:"ENTIDADE"},{label:"Campo/regra",valor:"CAMPO"},{label:"Total",valor:"TOTAL"},{label:"Faltantes",valor:"FALTANTES"},{label:"Completude",valor:(x)=>`${x.COMPLETUDE_PCT}%`}]},
          {titulo:"Negócios com campos pendentes",dados:dealsPendentes,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Pendências",valor:"PENDENCIAS"}]},
          {titulo:"Leads com campos pendentes",dados:leadsPendentes,colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Nome / Empresa",valor:"NOME"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Pendências",valor:"PENDENCIAS"}]}
        ],
        "Completude mede disponibilidade para operação e análise; inclui detalhamento por registro para saneamento operacional.");
    }

    else if(chave==="negocios_sem_proxima_atividade"){
      const [db,a]=await Promise.all([
        baseDealsCatalogo(webhook,false),
        atividadesCatalogo(webhook,false,"","")
      ]);
      const ref=p.referencia;
      const openDeals=db.deals.map((d)=>enriquecerDealCatalogo(d,db)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));

      // Mapeia atividades pendentes por Deal ID
      const atividadesPorDeal={};
      a.dados.forEach((act)=>{
        bindingsDaAtividade(act).forEach((b)=>{
          if(b.OWNER_TYPE_ID==="2"){
            const dealId=String(b.OWNER_ID);
            (atividadesPorDeal[dealId]||=[]).push(act);
          }
        });
      });

      const semProximaAtividade=[];
      const resPorVendedor={};

      openDeals.forEach((d)=>{
        const dealId=String(d.ID);
        const acts=atividadesPorDeal[dealId]||[];
        // Verifica se possui ao menos uma atividade pendente futura/hoje
        const temFutura=acts.some((act)=>{
          const prazo=parteDataISO(act.DEADLINE||act.END_TIME||act.START_TIME);
          return !prazo || prazo >= ref;
        });

        const resp=d._RESPONSAVEL;
        if(!resPorVendedor[resp]){
          resPorVendedor[resp]={VENDEDOR:resp,ABERTOS:0,SEM_PROXIMA:0,VALOR_RISCO:0};
        }
        resPorVendedor[resp].ABERTOS++;

        if(!temFutura){
          resPorVendedor[resp].SEM_PROXIMA++;
          resPorVendedor[resp].VALOR_RISCO+=d._VALOR;

          const ultAct=acts.map((act)=>parteDataISO(act.LAST_UPDATED||act.CREATED)).filter(Boolean).sort().pop() || parteDataISO(d.DATE_MODIFY||d.DATE_CREATE)||"";
          const diasSemAtividade=ultAct?Math.max(0, Math.floor((new Date(`${ref}T12:00:00`)-new Date(`${ultAct}T12:00:00`))/86400000)):0;

          semProximaAtividade.push({
            DEAL_ID:d.ID,
            CLIENTE:d._CLIENTE,
            FUNIL:d._FUNIL,
            ETAPA:d._ESTAGIO,
            VENDEDOR:d._RESPONSAVEL,
            VALOR:d._VALOR,
            ULTIMA_ATIVIDADE:ultAct||"Nenhuma",
            DIAS_SEM_ATIVIDADE:diasSemAtividade
          });
        }
      });

      semProximaAtividade.sort((a,b)=>b.VALOR-a.VALOR);

      const resumoVendedores=Object.values(resPorVendedor).map((v)=>({
        ...v,
        PCT_SEM_PROXIMA:v.ABERTOS?Math.round((v.SEM_PROXIMA/v.ABERTOS)*10000)/100:0
      })).sort((a,b)=>b.VALOR_RISCO-a.VALOR_RISCO);

      const totalValorRisco=semProximaAtividade.reduce((s,x)=>s+x.VALOR,0);
      const pctTotalSemProxima=openDeals.length?Math.round((semProximaAtividade.length/openDeals.length)*10000)/100:0;

      criarResultadoCatalogo(chave,"Negócios Abertos Sem Próxima Atividade","Listagem e risco de negócios abertos no pipeline sem atividade futura agendada.",
        [
          kpi("Negócios Abertos",openDeals.length),
          kpi("Sem Próxima Atividade",semProximaAtividade.length),
          kpi("% Sem Atividade",`${pctTotalSemProxima}%`),
          kpi("Valor em Risco",moedaRelatorio(totalValorRisco)),
          kpi("Vendedores Afetados",resumoVendedores.filter((v)=>v.SEM_PROXIMA>0).length)
        ],
        [
          {titulo:"Resumo por vendedor",dados:resumoVendedores,colunas:[{label:"Vendedor",valor:"VENDEDOR"},{label:"Negócios Abertos",valor:"ABERTOS"},{label:"Sem Próxima",valor:"SEM_PROXIMA"},{label:"% Sem Próxima",valor:(x)=>`${x.PCT_SEM_PROXIMA}%`},{label:"Valor em Risco",valor:(x)=>moedaRelatorio(x.VALOR_RISCO),html:true}]},
          {titulo:"Negócios abertos sem próxima atividade agendada",dados:semProximaAtividade,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Funil",valor:"FUNIL"},{label:"Etapa",valor:"ETAPA"},{label:"Vendedor",valor:"VENDEDOR"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Último Movimento",valor:"ULTIMA_ATIVIDADE"},{label:"Dias Sem Ação",valor:"DIAS_SEM_ATIVIDADE"}]}
        ],
        "Considera como sem próxima atividade os negócios abertos sem nenhuma atividade pendente com deadline para hoje ou datas futuras.");
    }

    else if(chave==="auditoria_pipeline"){
      const b=await baseDealsCatalogo(webhook,false),ref=p.referencia;
      const openDeals=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));

      let semProb=0, semProbValor=0;
      let closeDatePassado=0, closeDatePassadoValor=0;
      let closeDateAusente=0, closeDateAusenteValor=0;
      let valorZerado=0;
      let estagnados30d=0, estagnados30dValor=0;

      const negociosInconsistentes=[];

      openDeals.forEach((d)=>{
        const problemas=[];
        
        // 1. Estágios sem probabilidade
        const pr=Number(d.PROBABILITY);
        const temProb=Number.isFinite(pr)&&pr>0&&pr<=100;
        if(!temProb){
          semProb++;
          semProbValor+=d._VALOR;
          problemas.push("Sem probabilidade no Bitrix");
        }

        // 2 & 3. CLOSEDATE no passado ou ausente
        const cd=parteDataISO(d.CLOSEDATE);
        if(!cd){
          closeDateAusente++;
          closeDateAusenteValor+=d._VALOR;
          problemas.push("CLOSEDATE ausente");
        } else if(cd<ref){
          closeDatePassado++;
          closeDatePassadoValor+=d._VALOR;
          problemas.push("CLOSEDATE no passado (vencida)");
        }

        // 4. Valores zerados
        if(d._VALOR<=0){
          valorZerado++;
          problemas.push("Valor zerado / sem OPPORTUNITY");
        }

        // 5. Estagnação no estágio (> 30 dias)
        const mt=parteDataISO(d.MOVED_TIME||d.DATE_MODIFY||d.DATE_CREATE);
        const diasParado=mt?Math.max(0, Math.floor((new Date(`${ref}T12:00:00`)-new Date(`${mt}T12:00:00`))/86400000)):0;
        if(diasParado>30){
          estagnados30d++;
          estagnados30dValor+=d._VALOR;
          problemas.push(`Estagnado (${diasParado}d sem mover)`);
        }

        if(problemas.length){
          negociosInconsistentes.push({
            DEAL_ID:d.ID,
            CLIENTE:d._CLIENTE,
            FUNIL:d._FUNIL,
            ETAPA:d._ESTAGIO,
            VENDEDOR:d._RESPONSAVEL,
            VALOR:d._VALOR,
            CLOSEDATE:cd||"Ausente",
            INCONSISTENCIAS:problemas.join(" | ")
          });
        }
      });

      negociosInconsistentes.sort((a,b)=>b.VALOR-a.VALOR);

      const regrasSummary=[
        {REGRA:"Estágios sem probabilidade",OCORRENCIAS:semProb,PCT:openDeals.length?Math.round((semProb/openDeals.length)*10000)/100:0,VALOR_IMPACTADO:semProbValor},
        {REGRA:"CLOSEDATE no passado (vencida)",OCORRENCIAS:closeDatePassado,PCT:openDeals.length?Math.round((closeDatePassado/openDeals.length)*10000)/100:0,VALOR_IMPACTADO:closeDatePassadoValor},
        {REGRA:"CLOSEDATE ausente",OCORRENCIAS:closeDateAusente,PCT:openDeals.length?Math.round((closeDateAusente/openDeals.length)*10000)/100:0,VALOR_IMPACTADO:closeDateAusenteValor},
        {REGRA:"Valores zerados / sem OPPORTUNITY",OCORRENCIAS:valorZerado,PCT:openDeals.length?Math.round((valorZerado/openDeals.length)*10000)/100:0,VALOR_IMPACTADO:0},
        {REGRA:"Estagnação no estágio (>30d)",OCORRENCIAS:estagnados30d,PCT:openDeals.length?Math.round((estagnados30d/openDeals.length)*10000)/100:0,VALOR_IMPACTADO:estagnados30dValor}
      ];

      const valorTotalImpactado=negociosInconsistentes.reduce((s,d)=>s+d.VALOR,0);

      criarResultadoCatalogo(chave,"Auditoria de Pipeline & Higiene","Identificação de inconsistências operacionais e falhas de higiene no pipeline aberto.",
        [
          kpi("Negócios Abertos",openDeals.length),
          kpi("Com Inconsistência",negociosInconsistentes.length),
          kpi("Sem Probabilidade",semProb),
          kpi("CLOSEDATE Vencida",closeDatePassado),
          kpi("CLOSEDATE Ausente",closeDateAusente),
          kpi("Valor Zerado",valorZerado),
          kpi("Estagnados >30d",estagnados30d),
          kpi("Valor Impactado",moedaRelatorio(valorTotalImpactado))
        ],
        [
          {titulo:"Resumo de inconsistências por regra",dados:regrasSummary,colunas:[{label:"Regra de Higiene",valor:"REGRA"},{label:"Ocorrências",valor:"OCORRENCIAS"},{label:"% Afetado",valor:(x)=>`${x.PCT}%`},{label:"Valor Impactado",valor:(x)=>moedaRelatorio(x.VALOR_IMPACTADO),html:true}]},
          {titulo:"Listagem de negócios inconsistentes",dados:negociosInconsistentes,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Funil",valor:"FUNIL"},{label:"Etapa",valor:"ETAPA"},{label:"Vendedor",valor:"VENDEDOR"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"CLOSEDATE",valor:"CLOSEDATE"},{label:"Inconsistências",valor:"INCONSISTENCIAS"}]}
        ],
        "Audit de higiene operacional aplicado exclusivamente aos negócios abertos do pipeline comercial.");
    }

    else if(chave==="auditoria_sdr"){
      const lb=await baseLeadsCatalogo(webhook),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p));
      const a=await atividadesCatalogo(webhook,null,p.inicio,p.fim),by={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(by[b.OWNER_ID]||=[]).push(x)}));
      const semAtividade=ls.filter((l)=>!(by[String(l.ID)]||[]).length);
      const concluidasSemAssunto=a.dados.filter((x)=>x.COMPLETED==="Y"&&!String(x.SUBJECT||"").trim());
      const abertos=ls.filter((l)=>semanticaLead(l)==="process");
      const semContatoRecente=abertos.filter((l)=>{
        const ultimas=(by[String(l.ID)]||[]).map((x)=>new Date(x.END_TIME)).filter((d)=>!isNaN(d.getTime())).sort((x,y)=>y-x);
        const ref=ultimas[0]||(l.LAST_ACTIVITY_TIME?new Date(l.LAST_ACTIVITY_TIME):new Date(l.DATE_CREATE));
        const dtRef=ref instanceof Date ? ref : new Date(ref);
        return !isNaN(dtRef.getTime())&&(new Date()-dtRef)/86400000>7;
      });
      const checks=[
        {ENTIDADE:"Leads",CAMPO:"Ao menos 1 atividade vinculada",TOTAL:ls.length,FALTANTES:semAtividade.length},
        {ENTIDADE:"Atividades concluídas",CAMPO:"Assunto/resultado preenchido",TOTAL:a.dados.filter((x)=>x.COMPLETED==="Y").length,FALTANTES:concluidasSemAssunto.length},
        {ENTIDADE:"Leads em aberto",CAMPO:"Contato nos últimos 7 dias",TOTAL:abertos.length,FALTANTES:semContatoRecente.length},
        {ENTIDADE:"Leads",CAMPO:"Telefone ou e-mail",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!(valoresMulticampo(l,"PHONE").length||valoresMulticampo(l,"EMAIL").length)).length},
        {ENTIDADE:"Leads",CAMPO:"Origem (SOURCE_ID)",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!String(l.SOURCE_ID||"").trim()).length},
        {ENTIDADE:"Leads",CAMPO:"Responsável atribuído",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!idBitrixValido(l.ASSIGNED_BY_ID)).length}
      ].map((x)=>({...x,COMPLETUDE_PCT:x.TOTAL?Math.round((1-x.FALTANTES/x.TOTAL)*10000)/100:100}));
      const linhaLead=(l)=>({LEAD_ID:l.ID,CLIENTE:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"",STATUS:labelStatusLead(lb.statusMap,l.STATUS_ID),RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID),CRIADO:l.DATE_CREATE||""});
      criarResultadoCatalogo(chave,"Auditoria SDR • validar dados e plano",`Leads criados entre <strong>${escapeHtmlRelatorio(p.inicio||"início")}</strong> e <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>.`,
        [kpi("Leads no período",ls.length),kpi("Sem nenhuma atividade",semAtividade.length),kpi("Atividades sem resultado",concluidasSemAssunto.length),kpi("Abertos sem contato 7d+",semContatoRecente.length),kpi("Checks",checks.length),kpi("Ocorrências faltantes",checks.reduce((a,x)=>a+x.FALTANTES,0))],
        [{titulo:"Completude e aderência ao plano de contato",dados:checks,colunas:[{label:"Entidade",valor:"ENTIDADE"},{label:"Campo/regra",valor:"CAMPO"},{label:"Total",valor:"TOTAL"},{label:"Faltantes",valor:"FALTANTES"},{label:"Completude",valor:(x)=>`${x.COMPLETUDE_PCT}%`}]},
         {titulo:"Leads sem nenhuma atividade",dados:semAtividade.map(linhaLead),colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criado",valor:"CRIADO"}]},
         {titulo:"Leads em aberto sem contato recente (7d+)",dados:semContatoRecente.map(linhaLead),colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criado",valor:"CRIADO"}]}],
        "Auditoria usa apenas atividades e campos já mapeados pelo extrator; valida existência e completude, não a qualidade do conteúdo registrado em cada atividade.");
    }

    else if(chave==="contact_rate"){
      const a=await atividadesCatalogo(webhook,null,p.inicio,p.fim),atividadesLead={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(atividadesLead[b.OWNER_ID]||=[]).push(x)}));
      const leadsTrabalhados=Object.keys(atividadesLead).length;
      let contatosEfetivos=0;
      Object.values(atividadesLead).forEach(ats=>{
        const temContato = ats.some(x=>(x.COMPLETED==="Y"||String(x.COMPLETED)==="true")&&(String(x.TYPE_ID)==="1"||String(x.TYPE_ID)==="2"||canalAtividadeSDR(x)==="Ligação"||canalAtividadeSDR(x)==="Reunião"||canalAtividadeSDR(x)==="WhatsApp"||canalAtividadeSDR(x)==="E-mail"));
        if(temContato) contatosEfetivos++;
      });
      criarResultadoCatalogo(chave,"Contact Rate","Proporção de Leads com contato efetivo vs Leads trabalhados.",
        [kpi("Leads Trabalhados",leadsTrabalhados),kpi("Contatos Efetivos",contatosEfetivos),kpi("Contact Rate",`${leadsTrabalhados?taxaPct(contatosEfetivos,leadsTrabalhados):0}%`)],
        [{titulo:"Resumo Contact Rate",dados:[{TRABALHADOS:leadsTrabalhados,EFETIVOS:contatosEfetivos,TAXA:`${leadsTrabalhados?taxaPct(contatosEfetivos,leadsTrabalhados):0}%`}],colunas:[{label:"Leads Trabalhados",valor:"TRABALHADOS"},{label:"Contatos Efetivos",valor:"EFETIVOS"},{label:"Contact Rate",valor:"TAXA"}]}]);
    }

    else if(chave==="meeting_rate"){
      const base=await buscarReunioesFunilRelatorio(webhook,p.inicio,p.fim);
      const r=resumoReunioesFunilRelatorio(base);
      const a=await atividadesCatalogo(webhook,null,p.inicio,p.fim);
      const atividadesLead={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(atividadesLead[b.OWNER_ID]||=[]).push(x)}));
      (base.eventosEstagioLead||[]).forEach((e)=>{if(e.LEAD_ID)(atividadesLead[e.LEAD_ID]||=[]).push(e)});
      const leadsTrabalhados=Object.keys(atividadesLead).length;

      const reunioesAgendadas=r.linhas.length;
      const reunioesRealizadas=r.realizadas.length;
      const reunioesNoShow=r.noShow.length;

      const meetingRatePct=leadsTrabalhados?taxaPct(reunioesAgendadas,leadsTrabalhados):0;
      const showRatePct=reunioesAgendadas?taxaPct(reunioesRealizadas,reunioesAgendadas):0;
      const porResp=agruparReunioesPor(r.linhas,"RESPONSAVEL");

      criarResultadoCatalogo(chave,"Meeting Rate & Show Rate","Taxa de agendamento de reuniões e de comparecimento integrando Atividades e Etapas do Funil.",
        [kpi("Leads Trabalhados",leadsTrabalhados),kpi("Reuniões Agendadas",reunioesAgendadas),kpi("Meeting Rate",`${meetingRatePct}%`),kpi("Reuniões Realizadas",reunioesRealizadas),kpi("Show Rate",`${showRatePct}%`),kpi("No-Shows",reunioesNoShow)],
        [{titulo:"Resumo Meeting & Show Rate",dados:[{TRABALHADOS:leadsTrabalhados,AGENDADAS:reunioesAgendadas,REALIZADAS:reunioesRealizadas,NOSHOW:reunioesNoShow,MEETING_RATE:`${meetingRatePct}%`,SHOW_RATE:`${showRatePct}%`}],colunas:[{label:"Leads Trabalhados",valor:"TRABALHADOS"},{label:"Reuniões Agendadas",valor:"AGENDADAS"},{label:"Reuniões Realizadas",valor:"REALIZADAS"},{label:"No-Shows",valor:"NOSHOW"},{label:"Meeting Rate",valor:"MEETING_RATE"},{label:"Show Rate",valor:"SHOW_RATE"}]},
         {titulo:"Performance de Agendamento por Responsável",dados:porResp,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Agendadas",valor:"AGENDADAS"},{label:"Realizadas",valor:"REALIZADAS"},{label:"No-Show",valor:"NOSHOW"},{label:"Total",valor:"TOTAL"}]}],
        "Métricas consolidadas a partir do motor buscarReunioesFunilRelatorio (Atividades TYPE_ID=1 e Etapas de Reunião no Funil de Leads).");
    }

    else if(chave==="no_show_sdr"){
      const base=await buscarReunioesFunilRelatorio(webhook,p.inicio,p.fim);
      const r=resumoReunioesFunilRelatorio(base);

      const agendadas=r.linhas.length;
      const noShowLinhas=r.noShow;
      const noShowCount=noShowLinhas.length;
      const realizadasCount=r.realizadas.length;

      const porEntidade={};
      r.linhas.forEach(item=>{
        const key = item._RESPONSAVEL_ID ? `${item.RESPONSAVEL}_${item.ASSUNTO}` : item.ASSUNTO;
        (porEntidade[key] ||= []).push(item);
      });

      let recuperadas=0;
      noShowLinhas.forEach(ns => {
        const key = ns._RESPONSAVEL_ID ? `${ns.RESPONSAVEL}_${ns.ASSUNTO}` : ns.ASSUNTO;
        const grupo = porEntidade[key] || [];
        const tevePosteriorRealizada = grupo.some(x => x.SITUACAO === "Realizada" && new Date(x.INICIO || 0) >= new Date(ns.INICIO || 0));
        if (tevePosteriorRealizada) recuperadas++;
      });

      const taxaNoShow = agendadas ? taxaPct(noShowCount, agendadas) : 0;

      criarResultadoCatalogo(chave,"No-show & Recuperação","Reuniões agendadas, no-shows reais (via estágio do lead ou registro de falta) e recuperação posterior.",
        [kpi("Agendadas (Total)",agendadas),kpi("No-show",noShowCount),kpi("Taxa No-show",`${taxaNoShow}%`),kpi("Realizadas",realizadasCount),kpi("Recuperadas",recuperadas)],
        [{titulo:"Resumo No-show",dados:[{AGENDADAS:agendadas,NOSHOW:noShowCount,TAXA:`${taxaNoShow}%`,REALIZADAS:realizadasCount,RECUPERADAS:recuperadas}],colunas:[{label:"Agendadas",valor:"AGENDADAS"},{label:"No-show",valor:"NOSHOW"},{label:"Taxa No-show",valor:"TAXA"},{label:"Realizadas",valor:"REALIZADAS"},{label:"Recuperadas",valor:"RECUPERADAS"}]},
         {titulo:"Detalhamento de Reuniões em No-show",dados:noShowLinhas,colunas:[{label:"ID",valor:"ID"},{label:"Assunto / Lead",valor:"ASSUNTO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Quando",valor:"INICIO"},{label:"Pipeline",valor:"PIPELINE"},{label:"Origem",valor:"ORIGEM"}]}],
        "Integração oficial com buscarReunioesFunilRelatorio. Reuniões pendentes (COMPLETED=N) não são tratadas como No-show.");
    }

    else if(chave==="tentativas_conversao"){
      const [lb,db]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,false)]);
      const ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p));
      const a=await atividadesCatalogo(webhook,null,p.inicio,p.fim),atividadesLead={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(atividadesLead[b.OWNER_ID]||=[]).push(x)}));
      let arrContato=[], arrReuniao=[], arrOpp=[];
      ls.forEach(l=>{
        const ats=atividadesLead[String(l.ID)]||[];
        ats.sort((a,b)=>{
          const tA = a.CREATED ? new Date(a.CREATED).getTime() : 0;
          const tB = b.CREATED ? new Date(b.CREATED).getTime() : 0;
          return tA - tB;
        });
        const idxContato=ats.findIndex(x=>(x.COMPLETED==="Y"||String(x.COMPLETED)==="true")&&(String(x.TYPE_ID)==="1"||String(x.TYPE_ID)==="2"||canalAtividadeSDR(x)==="Ligação"||canalAtividadeSDR(x)==="Reunião"||canalAtividadeSDR(x)==="WhatsApp"||canalAtividadeSDR(x)==="E-mail"));
        if(idxContato!==-1) arrContato.push(idxContato+1);
        const idxReuniao=ats.findIndex(x=>String(x.TYPE_ID)==="1"||canalAtividadeSDR(x)==="Reunião");
        if(idxReuniao!==-1) arrReuniao.push(idxReuniao+1);
        const opps=db.deals.filter(d=>String(d.LEAD_ID)===String(l.ID)).sort((a,b)=>{
          const tA = a.DATE_CREATE ? new Date(a.DATE_CREATE).getTime() : 0;
          const tB = b.DATE_CREATE ? new Date(b.DATE_CREATE).getTime() : 0;
          return tA - tB;
        });
        if(opps.length>0){
          const dOpp=new Date(opps[0].DATE_CREATE);
          const atsAteOpp=ats.filter(x=>{
            const tEnd = x.END_TIME || x.CREATED;
            return tEnd ? new Date(tEnd) <= dOpp : true;
          });
          arrOpp.push(Math.max(1,atsAteOpp.length));
        }
      });
      const getMetrics = (arr) => {
        if(!arr.length) return {qtd:0, media:0, med:0, p75:0, p90:0};
        const s = [...arr].sort((a,b)=>a-b);
        return {
          qtd: s.length,
          media: Math.round((s.reduce((sum,v)=>sum+v,0)/s.length)*10)/10,
          med: s[Math.floor(s.length/2)],
          p75: s[Math.floor(s.length*0.75)],
          p90: s[Math.floor(s.length*0.90)]
        };
      };
      const mContato = getMetrics(arrContato), mReuniao = getMetrics(arrReuniao), mOpp = getMetrics(arrOpp);
      const dealsApurados=db.deals.filter(d=>idBitrixValido(d.LEAD_ID) && dentroPeriodoCatalogo(d.DATE_CREATE,p)).length;
      const dealsTotais=db.deals.filter(d=>dentroPeriodoCatalogo(d.DATE_CREATE,p)).length;
      criarResultadoCatalogo(chave,"Tentativas até Conversão","Média e distribuição de tentativas até contato, reunião e oportunidade.",
        [kpi("Contatos",mContato.qtd),kpi("Média (Contato)",mContato.media),kpi("Reuniões",mReuniao.qtd),kpi("Média (Reunião)",mReuniao.media),kpi("Oportunidades",mOpp.qtd),kpi("Média (Oportunidade)",mOpp.media),kpi("Cobertura Vínculo (Opps)",`${dealsTotais?taxaPct(dealsApurados,dealsTotais):0}%`)],
        [{titulo:"Resumo Tentativas (Distribuição)",dados:[
          {TIPO:"Contato",QTD:mContato.qtd,MEDIA:mContato.media,MEDIANA:mContato.med,P75:mContato.p75,P90:mContato.p90},
          {TIPO:"Reunião",QTD:mReuniao.qtd,MEDIA:mReuniao.media,MEDIANA:mReuniao.med,P75:mReuniao.p75,P90:mReuniao.p90},
          {TIPO:"Oportunidade",QTD:mOpp.qtd,MEDIA:mOpp.media,MEDIANA:mOpp.med,P75:mOpp.p75,P90:mOpp.p90}
        ],colunas:[{label:"Objetivo",valor:"TIPO"},{label:"Leads (Amostra)",valor:"QTD"},{label:"Média",valor:"MEDIA"},{label:"Mediana",valor:"MEDIANA"},{label:"P75",valor:"P75"},{label:"P90",valor:"P90"}]}]);
    }

    else if(chave==="receita_sdr"){
      const [lb,db]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,false)]),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p));
      const a=await atividadesCatalogo(webhook,null,p.inicio,p.fim),atividadesLead=new Set();
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")atividadesLead.add(String(b.OWNER_ID));}));
      const leadsTrabalhados=ls.filter(l=>atividadesLead.has(String(l.ID)));
      const leadsIds=new Set(leadsTrabalhados.map(l=>String(l.ID)));
      const oppsGanhos=db.deals.filter(d=>leadsIds.has(String(d.LEAD_ID)) && (semanticaDeal(d)==="success"||["s","success"].includes(String(d.STAGE_SEMANTIC_ID||"").toLowerCase())));
      const receita=oppsGanhos.reduce((s,d)=>s+(Number(d.OPPORTUNITY)||0),0);
      criarResultadoCatalogo(chave,"Receita Originada pelo SDR","Receita comprovada gerada a partir de Leads trabalhados pelo SDR.",
        [kpi("Leads Trabalhados",leadsTrabalhados.length),kpi("Oportunidades Ganhas",oppsGanhos.length),kpi("Receita Originada",moedaRelatorio(receita))],
        [{titulo:"Oportunidades Ganhas Originadas pelo SDR",dados:oppsGanhos.map(d=>({ID:d.ID,TITULO:d.TITLE,RECEITA:d.OPPORTUNITY})),colunas:[{label:"Deal ID",valor:"ID"},{label:"Título",valor:"TITULO"},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true}]}]);
    }

    else if(chave==="performance_sdr"){
      const [lb,db]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,false)]);
      // Obter limites máximos considerando o mês anterior para garantir todos os dados das comparações
      const dataMinimaReq = p.inicio ? new Date(p.inicio) : new Date();
      dataMinimaReq.setMonth(dataMinimaReq.getMonth() - 1);
      dataMinimaReq.setDate(1);
      const a=await atividadesCatalogo(webhook,true,dataMinimaReq.toISOString().split("T")[0],p.fim||"");

      const calcPerf = (inicio, fim) => {
        const pL={inicio: inicio, fim: fim};
        const ls=lb.leads.filter(l=>dentroPeriodoCatalogo(l.DATE_CREATE,pL));
        const ats=a.dados.filter(x=>dentroPeriodoCatalogo(x.END_TIME,pL)||dentroPeriodoCatalogo(x.CREATED,pL));
        const atividadesLead={};
        ats.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(atividadesLead[b.OWNER_ID]||=[]).push(x)}));

        const resPorSDR = {};
        const getSDR = (id) => {
          const nome = nomeUsuario(id) || (id ? `ID ${id}` : "Sem responsável");
          if(!resPorSDR[id]) resPorSDR[id]={
            id, nome, leadsNovos:0, leadsTrabalhados:0, atividadesConcluidas:0,
            contatosEfetivos:0, reunioesAgendadas:0, reunioesRealizadas:0, noShows:0,
            oportunidadesGeradas:0, receitaOriginada:0, oppsGanhosInfo:[]
          };
          return resPorSDR[id];
        };

        ls.forEach(l=>{ getSDR(l.ASSIGNED_BY_ID).leadsNovos++; });

        Object.entries(atividadesLead).forEach(([lId, aL]) => {
          const l=ls.find(x=>String(x.ID)===lId);
          const rResp = l ? getSDR(l.ASSIGNED_BY_ID) : getSDR("0");
          rResp.leadsTrabalhados++;

          if(aL.some(x=>String(x.TYPE_ID)==="1"||String(x.TYPE_ID)==="2"||canalAtividadeSDR(x)==="Ligação"||canalAtividadeSDR(x)==="Reunião"||canalAtividadeSDR(x)==="WhatsApp"||canalAtividadeSDR(x)==="E-mail")) rResp.contatosEfetivos++;
          const reunioes=aL.filter(x=>String(x.TYPE_ID)==="1"||canalAtividadeSDR(x)==="Reunião");
          rResp.reunioesAgendadas += reunioes.length;
          rResp.reunioesRealizadas += reunioes.filter(x=>x.COMPLETED==="Y").length;
          rResp.noShows += reunioes.filter(x=>x.COMPLETED!=="Y").length;
        });

        ats.forEach(x => { if(x.COMPLETED==="Y") getSDR(x.RESPONSIBLE_ID).atividadesConcluidas++; });

        const oppsNoPeriodo = db.deals.filter(d=>dentroPeriodoCatalogo(d.DATE_CREATE,pL) && idBitrixValido(d.LEAD_ID));
        oppsNoPeriodo.forEach(d => {
          const rResp = getSDR(d.ASSIGNED_BY_ID);
          rResp.oportunidadesGeradas++;
          if(["s","success"].includes(String(d.STAGE_SEMANTIC_ID||"").toLowerCase())){
            rResp.receitaOriginada += (Number(d.OPPORTUNITY)||0);
            rResp.oppsGanhosInfo.push(d);
          }
        });

        const somaObj = Object.values(resPorSDR).reduce((acc, v)=>{
          acc.leadsNovos+=v.leadsNovos; acc.leadsTrabalhados+=v.leadsTrabalhados;
          acc.atividadesConcluidas+=v.atividadesConcluidas; acc.contatosEfetivos+=v.contatosEfetivos;
          acc.reunioesAgendadas+=v.reunioesAgendadas; acc.reunioesRealizadas+=v.reunioesRealizadas;
          acc.noShows+=v.noShows; acc.oportunidadesGeradas+=v.oportunidadesGeradas;
          acc.receitaOriginada+=v.receitaOriginada;
          return acc;
        },{leadsNovos:0, leadsTrabalhados:0, atividadesConcluidas:0, contatosEfetivos:0, reunioesAgendadas:0, reunioesRealizadas:0, noShows:0, oportunidadesGeradas:0, receitaOriginada:0});

        const calcTaxas = (v) => ({
          ...v,
          contactRate: v.leadsTrabalhados ? v.contatosEfetivos/v.leadsTrabalhados : 0,
          meetingRate: v.leadsTrabalhados ? v.reunioesAgendadas/v.leadsTrabalhados : 0,
          showRate: v.reunioesAgendadas ? v.reunioesRealizadas/v.reunioesAgendadas : 0,
          convLeadOpp: v.leadsTrabalhados ? v.oportunidadesGeradas/v.leadsTrabalhados : 0
        });

        return {
          total: calcTaxas(somaObj),
          porSdr: Object.values(resPorSDR).map(calcTaxas).sort((a,b)=>b.leadsTrabalhados-a.leadsTrabalhados)
        };
      };

      const refFim = new Date(p.fim||p.inicio||new Date());
      const sInicio=new Date(refFim); sInicio.setDate(refFim.getDate() - refFim.getDay() + (refFim.getDay()===0?-6:1));
      const sFim=new Date(sInicio); sFim.setDate(sInicio.getDate()+6);
      const prevSInicio=new Date(sInicio); prevSInicio.setDate(sInicio.getDate()-7);
      const prevSFim=new Date(prevSInicio); prevSFim.setDate(prevSInicio.getDate()+6);

      const resSemanaAtual = calcPerf(sInicio.toISOString().split("T")[0], sFim.toISOString().split("T")[0]);
      const resSemanaAnterior = calcPerf(prevSInicio.toISOString().split("T")[0], prevSFim.toISOString().split("T")[0]);

      const mInicio=new Date(refFim.getFullYear(), refFim.getMonth(), 1);
      const mFim=new Date(refFim.getFullYear(), refFim.getMonth()+1, 0);
      const prevMInicio=new Date(refFim.getFullYear(), refFim.getMonth()-1, 1);
      const prevMFim=new Date(refFim.getFullYear(), refFim.getMonth(), 0);

      const resMesAtual = calcPerf(mInicio.toISOString().split("T")[0], mFim.toISOString().split("T")[0]);
      const resMesAnterior = calcPerf(prevMInicio.toISOString().split("T")[0], prevMFim.toISOString().split("T")[0]);

      const dif = (atual, ant, pct=false, moeda=false) => {
        const d = atual - ant;
        const v = ant ? d/ant : (atual?1:0);
        const txtA = moeda?moedaRelatorio(atual):atual;
        const txtAn = moeda?moedaRelatorio(ant):ant;
        const s=d>0?"+":"";
        return `<div>Atual: ${pct?taxaPct(atual,1)+'%':txtA}<br>Anterior: ${pct?taxaPct(ant,1)+'%':txtAn}<br>Dif: ${s}${pct?taxaPct(d,1)+'%':(moeda?moedaRelatorio(d):d)}<br>Var: ${s}${(v*100).toFixed(1)}%</div>`;
      };

      const metricas = [
        {l:"Leads Novos",k:"leadsNovos",pct:false,moeda:false},
        {l:"Leads Trabalhados",k:"leadsTrabalhados",pct:false,moeda:false},
        {l:"Atividades Concluídas",k:"atividadesConcluidas",pct:false,moeda:false},
        {l:"Contatos Efetivos",k:"contatosEfetivos",pct:false,moeda:false},
        {l:"Reuniões Agendadas",k:"reunioesAgendadas",pct:false,moeda:false},
        {l:"Reuniões Realizadas",k:"reunioesRealizadas",pct:false,moeda:false},
        {l:"No-Shows",k:"noShows",pct:false,moeda:false},
        {l:"Oportunidades Geradas",k:"oportunidadesGeradas",pct:false,moeda:false},
        {l:"Receita Originada",k:"receitaOriginada",pct:false,moeda:true},
        {l:"Contact Rate",k:"contactRate",pct:true,moeda:false},
        {l:"Meeting Rate",k:"meetingRate",pct:true,moeda:false},
        {l:"Show Rate",k:"showRate",pct:true,moeda:false},
        {l:"Lead → Opp",k:"convLeadOpp",pct:true,moeda:false}
      ];

      const kpisResult = metricas.slice(0,5).map(m=>kpi(m.l, resMesAtual.total[m.k]));

      const rowsSemana = metricas.map(m=>({METRICA:m.l, RES:dif(resSemanaAtual.total[m.k], resSemanaAnterior.total[m.k], m.pct, m.moeda)}));
      const rowsMes = metricas.map(m=>({METRICA:m.l, RES:dif(resMesAtual.total[m.k], resMesAnterior.total[m.k], m.pct, m.moeda)}));

      const renderPorSDR = (arr) => arr.map(v=>({
        SDR: v.nome, LEADS_NOVOS: v.leadsNovos, LEADS_TRABALHADOS: v.leadsTrabalhados,
        ATIVIDADES: v.atividadesConcluidas, CONTATOS: v.contatosEfetivos, REUNIOES: v.reunioesRealizadas,
        OPPS: v.oportunidadesGeradas, RECEITA: moedaRelatorio(v.receitaOriginada)
      }));

      const ev=a.dados.filter(x=>dentroPeriodoCatalogo(x.END_TIME,{inicio:mInicio.toISOString().split("T")[0],fim:mFim.toISOString().split("T")[0]}));
      const series={};
      ev.forEach(x=>{
        const d=parteDataISO(x.END_TIME);
        if(!d) return;
        if(!series[d]) series[d]={DATA:d,ATIVIDADES:0,REUNIOES:0,REALIZADAS:0,OPPORTUNIDADES:0,RECEITA:0};
        series[d].ATIVIDADES++;
        if(String(x.TYPE_ID)==="1"||canalAtividadeSDR(x)==="Reunião") {
          series[d].REUNIOES++;
          if(x.COMPLETED==="Y") series[d].REALIZADAS++;
        }
      });
      db.deals.filter(d=>idBitrixValido(d.LEAD_ID) && dentroPeriodoCatalogo(d.DATE_CREATE,{inicio:mInicio.toISOString().split("T")[0],fim:mFim.toISOString().split("T")[0]})).forEach(d=>{
        const dt=parteDataISO(d.DATE_CREATE);
        if(!series[dt]) series[dt]={DATA:dt,ATIVIDADES:0,REUNIOES:0,REALIZADAS:0,OPPORTUNIDADES:0,RECEITA:0};
        series[dt].OPPORTUNIDADES++;
        if(["s","success"].includes(String(d.STAGE_SEMANTIC_ID||"").toLowerCase())) series[dt].RECEITA+=(Number(d.OPPORTUNITY)||0);
      });
      const evolucaoDados=Object.values(series).sort((a,b)=>a.DATA.localeCompare(b.DATA));

      criarResultadoCatalogo(chave,"Performance SDR Semanal e Mensal","Evolução da performance SDR consolidada e por responsável.",
        kpisResult,
        [{titulo:`Semana Atual (${sInicio.toLocaleDateString()} a ${sFim.toLocaleDateString()}) vs Anterior (${prevSInicio.toLocaleDateString()} a ${prevSFim.toLocaleDateString()})`,dados:rowsSemana,colunas:[{label:"Métrica",valor:"METRICA"},{label:"Comparação",valor:"RES",html:true}]},
         {titulo:`Mês Atual (${mInicio.toLocaleDateString()} a ${mFim.toLocaleDateString()}) vs Anterior (${prevMInicio.toLocaleDateString()} a ${prevMFim.toLocaleDateString()})`,dados:rowsMes,colunas:[{label:"Métrica",valor:"METRICA"},{label:"Comparação",valor:"RES",html:true}]},
         {titulo:"Evolução Diária (Mês Atual)",dados:evolucaoDados,colunas:[{label:"Data",valor:(x)=>formatarDataBR(x.DATA)},{label:"Atividades",valor:"ATIVIDADES"},{label:"Reuniões",valor:"REUNIOES"},{label:"Realizadas",valor:"REALIZADAS"},{label:"Opps",valor:"OPPORTUNIDADES"},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA)}]},
         {titulo:"Performance por SDR (Mês Atual)",dados:renderPorSDR(resMesAtual.porSdr),colunas:[{label:"SDR",valor:"SDR"},{label:"L. Novos",valor:"LEADS_NOVOS"},{label:"L. Trab.",valor:"LEADS_TRABALHADOS"},{label:"Atividades",valor:"ATIVIDADES"},{label:"Contatos",valor:"CONTATOS"},{label:"Reuniões",valor:"REUNIOES"},{label:"Opps",valor:"OPPS"},{label:"Receita",valor:"RECEITA"}]}]);
    }

    else if(chave==="decisao_final_sdr"){
      const lb=await baseLeadsCatalogo(webhook),diasLimite=Math.max(1,Number(document.getElementById("diasEstagnacaoSDR").value)||15);
      const a=await atividadesCatalogo(webhook,null,"",""),by={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(by[b.OWNER_ID]||=[]).push(x)}));
      const agora=new Date();
      const candidatos=lb.leads.filter((l)=>semanticaLead(l)==="process").map((l)=>{
        const atividadesLead=by[String(l.ID)]||[],tentativas=atividadesLead.length;
        const refParado=parteDataISO(l.MOVED_TIME)||parteDataISO(l.DATE_CREATE);
        // v29 — antes, um MOVED_TIME/DATE_CREATE no futuro (dado suspeito)
        // virava diasParado=0 pelo Math.max(0,...), o que SEMPRE é <diasLimite
        // e faz o lead ser descartado em silêncio pelo filter() abaixo — o
        // problema não aparecia nem como "manter em nutrição", simplesmente
        // sumia do relatório. Agora o valor bruto (sem clamp) é preservado
        // pra detectar isso e sinalizar como ação própria, em vez de mascarar.
        const diasParadoBruto=refParado?Math.floor((agora-new Date(`${refParado}T12:00:00`))/86400000):null;
        const diasParadoAnomalo=diasParadoBruto!==null&&diasParadoBruto<0;
        const diasParado=diasParadoBruto===null?"":Math.max(0,diasParadoBruto);
        let acao="Manter em nutrição";
        if(diasParadoAnomalo)acao="⚠️ Revisar dado (MOVED_TIME/DATE_CREATE no futuro)";
        else if(diasParado===""||diasParado<diasLimite)acao=null;
        else if(tentativas===0)acao="Recontatar";
        else if(diasParado>diasLimite*3)acao="Desqualificar";
        else if(tentativas>=3||Number(l.OPPORTUNITY)>0)acao="Escalar para Comercial";
        return{LEAD_ID:l.ID,CLIENTE:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"",STATUS:labelStatusLead(lb.statusMap,l.STATUS_ID),RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID),DIAS_PARADO:diasParado,TENTATIVAS:tentativas,ACAO_RECOMENDADA:acao};
      }).filter((x)=>x.ACAO_RECOMENDADA).sort((x,y)=>Number(y.DIAS_PARADO)-Number(x.DIAS_PARADO));
      const porAcao={};candidatos.forEach((x)=>{porAcao[x.ACAO_RECOMENDADA]=(porAcao[x.ACAO_RECOMENDADA]||0)+1});
      criarResultadoCatalogo(chave,"Decisão Final SDR • saneamento seguro",`Leads em aberto estagnados há <strong>${diasLimite}+ dias</strong> sem mudança de etapa.`,
        [kpi("Leads estagnados",candidatos.length),kpi("Recontatar",porAcao["Recontatar"]||0),kpi("Desqualificar",porAcao["Desqualificar"]||0),kpi("Escalar para Comercial",porAcao["Escalar para Comercial"]||0),kpi("Manter em nutrição",porAcao["Manter em nutrição"]||0),kpi("Limiar de estagnação",`${diasLimite} dias`)],
        [{titulo:"Leads estagnados e ação recomendada",dados:candidatos,colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias parado",valor:"DIAS_PARADO"},{label:"Tentativas de contato",valor:"TENTATIVAS"},{label:"Ação recomendada",valor:"ACAO_RECOMENDADA"}]}],
        "Apoio a decisão apenas — nenhuma alteração é enviada ao Bitrix automaticamente. Para aplicar uma ação, use a seção de Sincronização com o registro e o novo status.");
    }

    else if(chave==="reunioes_sdr"){
      const base=await buscarReunioesFunilRelatorio(webhook,p.inicio,p.fim);
      const r=resumoReunioesFunilRelatorio(base);
      const porResp=agruparReunioesPor(r.linhas,"RESPONSAVEL");
      const porPipeline=agruparReunioesPor(r.linhas,"PIPELINE");
      const porEtapa=agruparReunioesPor(r.linhas,"ETAPA");
      const semNegocio=r.linhas.filter((x)=>x.PIPELINE.startsWith("Sem negócio")).length;
      const colGrupo=[{label:"Agendadas",valor:"AGENDADAS"},{label:"Realizadas",valor:"REALIZADAS"},{label:"No-Show",valor:"NOSHOW"},{label:"Total",valor:"TOTAL"}];
      criarResultadoCatalogo(chave,"Reuniões — agendadas x realizadas",`Reuniões (atividade e etapa do funil de Leads) entre <strong>${escapeHtmlRelatorio(p.inicio||"início")}</strong> e <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong> — qualquer pipeline, etapa e responsável.`,
        [kpi("Total de reuniões",r.linhas.length),kpi("Agendadas",r.agendadas.length),kpi("Realizadas",r.realizadas.length),kpi("No-Show",r.noShow.length),kpi("% Realizadas",`${taxaPct(r.realizadas.length,r.linhas.length)}%`),kpi("Responsáveis",porResp.length),kpi("Via etapa do Lead",r.linhas.filter((x)=>x.ORIGEM==="Etapa do Lead").length),kpi("Sem negócio vinculado",semNegocio)],
        [
          {titulo:"Por responsável (qualquer usuário)",dados:porResp,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},...colGrupo]},
          {titulo:"Por pipeline (funil)",dados:porPipeline,colunas:[{label:"Pipeline",valor:"PIPELINE"},...colGrupo]},
          {titulo:"Por etapa",dados:porEtapa,colunas:[{label:"Etapa",valor:"ETAPA"},...colGrupo]},
          {titulo:"Reuniões (detalhe)",dados:r.linhas,colunas:[{label:"ID",valor:"ID"},{label:"Assunto/Lead",valor:"ASSUNTO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Situação",valor:"SITUACAO"},{label:"Quando",valor:"INICIO"},{label:"Pipeline",valor:"PIPELINE"},{label:"Etapa",valor:"ETAPA"},{label:"Origem",valor:"ORIGEM"}]}
        ],
        "Duas fontes somadas: (1) atividade de Reunião (TYPE_ID=1) vinculada a negócio — Agendada=COMPLETED≠Y, Realizada=COMPLETED=Y, pipeline/etapa vêm do negócio (CRM Deal); (2) etapa do próprio Lead no funil (crm.stagehistory.list) — \"Reunião Agendada\"/\"Reunião Realizada\"/\"No-Show\" como STATUS_ID do Lead, aparece com pipeline \"Leads\". Coluna Origem no detalhe distingue as duas.");
    }

    else if(chave==="tempo_por_etapa"){
      const b=await baseDealsCatalogo(webhook,true);
      const ref=new Date(`${p.referencia||formatarDataISO(new Date())}T12:00:00`);
      const ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));

      const calcMetricasDias=(arr)=>{
        if(!arr.length)return{qtd:0,media:0,mediana:0,p75:0,p90:0,max:0};
        const s=[...arr].sort((a,b)=>a-b);
        const len=s.length;
        const sum=s.reduce((a,v)=>a+v,0);
        const med=len%2===1?s[Math.floor(len/2)]:(s[len/2-1]+s[len/2])/2;
        return{
          qtd:len,
          media:Math.round((sum/len)*10)/10,
          mediana:Math.round(med*10)/10,
          p75:s[Math.min(len-1,Math.floor(len*0.75))],
          p90:s[Math.min(len-1,Math.floor(len*0.90))],
          max:s[len-1]
        };
      };

      const todosDias=[];
      const porEstagio={};

      ds.forEach((d)=>{
        const mt=parteDataISO(d.MOVED_TIME)||parteDataISO(d.DATE_CREATE);
        const dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):0;
        todosDias.push(dias);

        const k=`${d._FUNIL}|||${d._ESTAGIO}`;
        if(!porEstagio[k])porEstagio[k]={FUNIL:d._FUNIL,ESTAGIO:d._ESTAGIO,DIAS:[]};
        porEstagio[k].DIAS.push(dias);
      });

      const metGeral=calcMetricasDias(todosDias);

      const rows=Object.values(porEstagio).map((g)=>{
        const m=calcMetricasDias(g.DIAS);
        return{
          FUNIL:g.FUNIL,
          ESTAGIO:g.ESTAGIO,
          QTD:m.qtd,
          MEDIA:m.media,
          MEDIANA:m.mediana,
          P75:m.p75,
          P90:m.p90,
          MAX:m.max
        };
      }).sort((a,b)=>b.MEDIA-a.MEDIA);

      const rowsDetalhes=ds.map((d)=>{
        const mt=parteDataISO(d.MOVED_TIME)||parteDataISO(d.DATE_CREATE);
        const dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):0;
        return{
          DEAL_ID:d.ID,
          CLIENTE:d._CLIENTE,
          FUNIL:d._FUNIL,
          ESTAGIO:d._ESTAGIO,
          RESPONSAVEL:d._RESPONSAVEL,
          DIAS_NO_ESTAGIO:dias,
          VALOR:d._VALOR
        };
      }).sort((a,b)=>b.DIAS_NO_ESTAGIO-a.DIAS_NO_ESTAGIO);

      criarResultadoCatalogo(chave,"Tempo de Permanência por Etapa",`Permanência das oportunidades no estágio atual (Referência: <strong>${escapeHtmlRelatorio(p.referencia||"hoje")}</strong>).`,
        [
          kpi("Oportunidades",metGeral.qtd),
          kpi("Média Geral",`${metGeral.media}d`),
          kpi("Mediana Geral",`${metGeral.mediana}d`),
          kpi("P75 Geral",`${metGeral.p75}d`),
          kpi("P90 Geral",`${metGeral.p90}d`),
          kpi("Maior Permanência",`${metGeral.max}d`),
          kpi("Estágios Analisados",rows.length)
        ],
        [
          {titulo:"Permanência por Estágio",dados:rows,colunas:[
            {label:"Funil",valor:"FUNIL"},
            {label:"Estágio",valor:"ESTAGIO"},
            {label:"Oportunidades",valor:"QTD"},
            {label:"Média",valor:(x)=>`${x.MEDIA}d`},
            {label:"Mediana",valor:(x)=>`${x.MEDIANA}d`},
            {label:"P75",valor:(x)=>`${x.P75}d`},
            {label:"P90",valor:(x)=>`${x.P90}d`},
            {label:"Máximo",valor:(x)=>`${x.MAX}d`}
          ]},
          {titulo:"Detalhamento por Oportunidade",dados:rowsDetalhes,colunas:[
            {label:"Deal",valor:"DEAL_ID"},
            {label:"Cliente",valor:"CLIENTE"},
            {label:"Funil",valor:"FUNIL"},
            {label:"Estágio",valor:"ESTAGIO"},
            {label:"Responsável",valor:"RESPONSAVEL"},
            {label:"Dias no Estágio",valor:(x)=>`${x.DIAS_NO_ESTAGIO}d`},
            {label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}
          ]}
        ],
        "Cálculo estatístico de permanência no estágio atual a partir do MOVED_TIME (ou DATE_CREATE).");
    }

    else if(chave==="gargalos"){
      const b=await baseDealsCatalogo(webhook,true);
      const ref=new Date(`${p.referencia||formatarDataISO(new Date())}T12:00:00`);
      const ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));

      const g={};
      ds.forEach((d)=>{
        const mt=parteDataISO(d.MOVED_TIME)||parteDataISO(d.DATE_CREATE);
        const dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):0;
        const k=`${d._FUNIL}|||${d._ESTAGIO}`;
        if(!g[k])g[k]={FUNIL:d._FUNIL,ESTAGIO:d._ESTAGIO,NEGOCIOS:0,VALOR_TOTAL:0,DIAS:[]};
        g[k].NEGOCIOS++;
        g[k].VALOR_TOTAL+=d._VALOR;
        g[k].DIAS.push(dias);
      });

      const totalDeals=ds.length;
      const totalValor=ds.reduce((a,d)=>a+d._VALOR,0);
      const mediaAcumuloEstagio=Object.keys(g).length?(totalDeals/Object.keys(g).length):0;

      const estagiosComMetrica=Object.values(g).map((item)=>{
        const s=[...item.DIAS].sort((a,b)=>a-b);
        const len=s.length;
        const sum=s.reduce((a,v)=>a+v,0);
        const mediaDias=len?Math.round((sum/len)*10)/10:0;
        const medianaDias=len?(len%2===1?s[Math.floor(len/2)]:(s[len/2-1]+s[len/2])/2):0;
        return{
          FUNIL:item.FUNIL,
          ESTAGIO:item.ESTAGIO,
          NEGOCIOS:item.NEGOCIOS,
          VALOR_TOTAL:item.VALOR_TOTAL,
          MEDIA_DIAS:mediaDias,
          MEDIANA_DIAS:Math.round(medianaDias*10)/10,
          SCORE_GARGALO:Math.round((item.NEGOCIOS * mediaDias)*10)/10
        };
      });

      const mediaTempoRetencao=estagiosComMetrica.length?(estagiosComMetrica.reduce((a,x)=>a+x.MEDIA_DIAS,0)/estagiosComMetrica.length):0;

      const rows=estagiosComMetrica.map((x)=>{
        const altoAcumulo=x.NEGOCIOS>=mediaAcumuloEstagio;
        const altaRetencao=x.MEDIA_DIAS>=mediaTempoRetencao;
        let status="🟢 Fluindo";
        if(altoAcumulo&&altaRetencao)status="🔴 Gargalo Crítico";
        else if(altaRetencao)status="🟡 Alta Retenção";
        else if(altoAcumulo)status="🟠 Alto Acúmulo";
        return{...x,STATUS_GARGALO:status};
      }).sort((a,b)=>b.SCORE_GARGALO-a.SCORE_GARGALO);

      const maiorAcumulo=[...rows].sort((a,b)=>b.NEGOCIOS-a.NEGOCIOS)[0];
      const maiorTempo=[...rows].sort((a,b)=>b.MEDIA_DIAS-a.MEDIA_DIAS)[0];
      const gargalosCriticos=rows.filter((x)=>x.STATUS_GARGALO==="🔴 Gargalo Crítico").length;

      criarResultadoCatalogo(chave,"Gargalos do Funil",`Identificação de gargalos por acúmulo de oportunidades e tempo de retenção (Referência: <strong>${escapeHtmlRelatorio(p.referencia||"hoje")}</strong>).`,
        [
          kpi("Oportunidades Abertas",totalDeals),
          kpi("Pipeline Aberto",moedaRelatorio(totalValor)),
          kpi("Gargalos Críticos",gargalosCriticos),
          kpi("Maior Acúmulo",maiorAcumulo?`${maiorAcumulo.ESTAGIO} (${maiorAcumulo.NEGOCIOS})`:"—"),
          kpi("Maior Retenção",maiorTempo?`${maiorTempo.ESTAGIO} (${maiorTempo.MEDIA_DIAS}d)`:"—"),
          kpi("Média Retenção Geral",`${Math.round(mediaTempoRetencao*10)/10}d`),
          kpi("Estágios Analisados",rows.length)
        ],
        [
          {titulo:"Análise de Gargalos por Estágio",dados:rows,colunas:[
            {label:"Funil",valor:"FUNIL"},
            {label:"Estágio",valor:"ESTAGIO"},
            {label:"Oportunidades",valor:"NEGOCIOS"},
            {label:"Valor Acumulado",valor:(x)=>moedaRelatorio(x.VALOR_TOTAL),html:true},
            {label:"Tempo Médio",valor:(x)=>`${x.MEDIA_DIAS}d`},
            {label:"Mediana",valor:(x)=>`${x.MEDIANA_DIAS}d`},
            {label:"Índice Gargalo",valor:"SCORE_GARGALO"},
            {label:"Status",valor:"STATUS_GARGALO"}
          ]}
        ],
        "Gargalo Crítico = Estágio com volume acima da média E tempo de retenção acima da média.");
    }

    else if(chave==="mapa_transicoes"){
      const b=await baseDealsCatalogo(webhook,true);
      const ids=b.deals.map((d)=>d.ID);
      const hist=await buscarHistoricoEntidade(webhook,2,ids);

      const histPorDeal={};
      hist.forEach((h)=>{
        (histPorDeal[String(h.OWNER_ID)]||=[]).push(h);
      });

      const transicoesMap={};
      const origens=new Set();
      const destinos=new Set();
      let totalTransicoes=0;
      const dealsComMovimentacao=new Set();

      Object.entries(histPorDeal).forEach(([dealId,items])=>{
        items.sort((x,y)=>String(x.CREATED_TIME||x.ID).localeCompare(String(y.CREATED_TIME||y.ID)));
        for(let i=0;i<items.length-1;i++){
          const hDe=items[i];
          const hPara=items[i+1];
          const catDe=String(hDe.CATEGORY_ID??b.deals.find(d=>String(d.ID)===dealId)?.CATEGORY_ID??"");
          const catPara=String(hPara.CATEGORY_ID??catDe);
          const sDe=String(hDe.STAGE_ID||"");
          const sPara=String(hPara.STAGE_ID||"");
          if(!sDe||!sPara)continue;

          const nomeDe=b.meta.estagios?.[catDe]?.[sDe]?.label||sDe;
          const nomePara=b.meta.estagios?.[catPara]?.[sPara]?.label||sPara;
          if(nomeDe===nomePara)continue;

          const funilDe=nomeFunilSemCodigo(b.meta.categorias?.[catDe]||`Categoria ${catDe}`);
          const k=`${nomeDe}|||${nomePara}|||${funilDe}`;

          if(!transicoesMap[k])transicoesMap[k]={DE:nomeDe,PARA:nomePara,FUNIL:funilDe,QTD:0};
          transicoesMap[k].QTD++;
          totalTransicoes++;
          dealsComMovimentacao.add(dealId);
          origens.add(nomeDe);
          destinos.add(nomePara);
        }
      });

      const totalSaidasPorOrigem={};
      Object.values(transicoesMap).forEach((t)=>{
        totalSaidasPorOrigem[t.DE]=(totalSaidasPorOrigem[t.DE]||0)+t.QTD;
      });

      const rows=Object.values(transicoesMap).map((t)=>({
        ...t,
        PCT_ORIGEM:taxaPct(t.QTD,totalSaidasPorOrigem[t.DE]||0)
      })).sort((a,b)=>b.QTD-a.QTD);

      const topTransicao=rows[0];

      const resumoOrigem={};
      rows.forEach((t)=>{
        if(!resumoOrigem[t.DE]||t.QTD>resumoOrigem[t.DE].QTD_PRINCIPAL){
          resumoOrigem[t.DE]={
            ESTAGIO:t.DE,
            TOTAL_SAIDAS:totalSaidasPorOrigem[t.DE]||0,
            PRINCIPAL_DESTINO:t.PARA,
            QTD_PRINCIPAL:t.QTD,
            PCT_PRINCIPAL:`${taxaPct(t.QTD,totalSaidasPorOrigem[t.DE]||0)}%`
          };
        }
      });
      const rowsOrigem=Object.values(resumoOrigem).sort((a,b)=>b.TOTAL_SAIDAS-a.TOTAL_SAIDAS);

      criarResultadoCatalogo(chave,"Mapa de Transições de Estágios","Matriz de movimentação e transição de estágios a partir do histórico real de eventos.",
        [
          kpi("Transições Registradas",totalTransicoes),
          kpi("Deals com Movimentação",dealsComMovimentacao.size),
          kpi("Maior Fluxo",topTransicao?`${topTransicao.DE} ➔ ${topTransicao.PARA} (${topTransicao.QTD})`:"—"),
          kpi("Estágios Origem",origens.size),
          kpi("Estágios Destino",destinos.size),
          kpi("Deals Analisados",ids.length)
        ],
        [
          {titulo:"Matriz de Transição entre Estágios (Origem ➔ Destino)",dados:rows,colunas:[
            {label:"Estágio Origem",valor:"DE"},
            {label:"Estágio Destino",valor:"PARA"},
            {label:"Funil",valor:"FUNIL"},
            {label:"Transições",valor:"QTD"},
            {label:"% Saídas da Origem",valor:(x)=>`${x.PCT_ORIGEM}%`}
          ]},
          {titulo:"Resumo por Estágio de Origem",dados:rowsOrigem,colunas:[
            {label:"Estágio Origem",valor:"ESTAGIO"},
            {label:"Total Saídas",valor:"TOTAL_SAIDAS"},
            {label:"Principal Destino",valor:"PRINCIPAL_DESTINO"},
            {label:"Qtd Principal",valor:"QTD_PRINCIPAL"},
            {label:"% Principal",valor:"PCT_PRINCIPAL"}
          ]}
        ],
        "Mapeamento obtido exclusivamente do histórico oficial crm.stagehistory.list, sem inferências retroativas.");
    }

    else if(chave==="clientes_parados"){
      const b=await baseDealsCatalogo(webhook,true);
      const ref=new Date(`${p.referencia||formatarDataISO(new Date())}T12:00:00`);
      const abertos=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));

      let parados15=0,parados30=0,parados60=0;
      let valor15=0,valor30=0,valor60=0;

      const rowsAll=abertos.map((d)=>{
        const dtAlt=parteDataISO(d.DATE_MODIFY)||parteDataISO(d.MOVED_TIME)||parteDataISO(d.LAST_ACTIVITY_TIME)||parteDataISO(d.DATE_CREATE);
        const dias=dtAlt?Math.max(0,Math.floor((ref-new Date(`${dtAlt}T12:00:00`))/86400000)):0;

        let faixa="0–15 dias";
        if(dias>60){faixa="> 60 dias";parados60++;parados30++;parados15++;valor60+=d._VALOR;valor30+=d._VALOR;valor15+=d._VALOR;}
        else if(dias>30){faixa="31–60 dias";parados30++;parados15++;valor30+=d._VALOR;valor15+=d._VALOR;}
        else if(dias>15){faixa="16–30 dias";parados15++;valor15+=d._VALOR;}

        return{
          DEAL_ID:d.ID,
          CLIENTE:d._CLIENTE,
          FUNIL:d._FUNIL,
          ESTAGIO:d._ESTAGIO,
          RESPONSAVEL:d._RESPONSAVEL,
          ULTIMA_ALTERACAO:dtAlt?formatarDataBR(dtAlt):"—",
          DIAS_PARADO:dias,
          FAIXA:faixa,
          VALOR:d._VALOR,
          ESTAGNADO:dias>15?"S":"N"
        };
      }).sort((a,b)=>b.DIAS_PARADO-a.DIAS_PARADO);

      const estagnados=rowsAll.filter((x)=>x.ESTAGNADO==="S");
      const totalValorAberto=abertos.reduce((a,d)=>a+d._VALOR,0);
      const maxDias=rowsAll.length?rowsAll[0].DIAS_PARADO:0;

      const resumoFaixas=[
        {FAIXA:"> 60 dias (Crítico)",QTD:rowsAll.filter(x=>x.FAIXA==="> 60 dias").length,VALOR:rowsAll.filter(x=>x.FAIXA==="> 60 dias").reduce((a,x)=>a+x.VALOR,0)},
        {FAIXA:"31–60 dias (Atenção)",QTD:rowsAll.filter(x=>x.FAIXA==="31–60 dias").length,VALOR:rowsAll.filter(x=>x.FAIXA==="31–60 dias").reduce((a,x)=>a+x.VALOR,0)},
        {FAIXA:"16–30 dias (Alerta)",QTD:rowsAll.filter(x=>x.FAIXA==="16–30 dias").length,VALOR:rowsAll.filter(x=>x.FAIXA==="16–30 dias").reduce((a,x)=>a+x.VALOR,0)},
        {FAIXA:"0–15 dias (Ativos)",QTD:rowsAll.filter(x=>x.FAIXA==="0–15 dias").length,VALOR:rowsAll.filter(x=>x.FAIXA==="0–15 dias").reduce((a,x)=>a+x.VALOR,0)}
      ].map((f)=>({...f,PCT_PIPELINE:taxaPct(f.VALOR,totalValorAberto)}));

      criarResultadoCatalogo(chave,"Clientes Parados (Estagnados)",`Negócios abertos sem alteração há mais de 15, 30 ou 60 dias (Referência: <strong>${escapeHtmlRelatorio(p.referencia||"hoje")}</strong>).`,
        [
          kpi("Oportunidades Abertas",abertos.length),
          kpi("Estagnados (>15d)",estagnados.length),
          kpi("% Estagnados",`${taxaPct(estagnados.length,abertos.length)}%`),
          kpi("Valor Estagnado (>15d)",moedaRelatorio(valor15)),
          kpi("Parados >15d",parados15),
          kpi("Parados >30d",parados30),
          kpi("Parados >60d",parados60),
          kpi("Maior Tempo sem Alt.",`${maxDias}d`)
        ],
        [
          {titulo:"Resumo por Faixa de Estagnação",dados:resumoFaixas,colunas:[
            {label:"Faixa de Estagnação",valor:"FAIXA"},
            {label:"Oportunidades",valor:"QTD"},
            {label:"Valor Acumulado",valor:(x)=>moedaRelatorio(x.VALOR),html:true},
            {label:"% do Pipeline Aberto",valor:(x)=>`${x.PCT_PIPELINE}%`}
          ]},
          {titulo:"Listagem de Negócios Estagnados (> 15 dias sem alteração)",dados:estagnados,colunas:[
            {label:"Deal",valor:"DEAL_ID"},
            {label:"Cliente",valor:"CLIENTE"},
            {label:"Funil",valor:"FUNIL"},
            {label:"Estágio",valor:"ESTAGIO"},
            {label:"Responsável",valor:"RESPONSAVEL"},
            {label:"Última Alteração",valor:"ULTIMA_ALTERACAO"},
            {label:"Dias Parado",valor:(x)=>`${x.DIAS_PARADO}d`},
            {label:"Faixa",valor:"FAIXA"},
            {label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}
          ]}
        ],
        "Estagnação calculada com base na última alteração registrada (DATE_MODIFY, MOVED_TIME ou LAST_ACTIVITY_TIME).");
    }

    else if(chave==="clientes_recuperados"){
      const b=await baseDealsCatalogo(webhook,true);
      const ids=b.deals.map((d)=>d.ID);
      const hist=await buscarHistoricoEntidade(webhook,2,ids);

      const histPorDeal={};
      hist.forEach((h)=>{
        (histPorDeal[String(h.OWNER_ID)]||=[]).push(h);
      });

      const recuperados=[];
      let totalGanhosRecuperados=0;
      let receitaRecuperados=0;

      b.deals.map((d)=>enriquecerDealCatalogo(d,b)).forEach((d)=>{
        const hItems=histPorDeal[String(d.ID)]||[];
        hItems.sort((x,y)=>String(x.CREATED_TIME||x.ID).localeCompare(String(y.CREATED_TIME||y.ID)));

        let tevePerda=false;
        let dataPerda="";
        let dataReativacao="";
        let tipoRecuperacao="";

        for(let i=0;i<hItems.length;i++){
          const sem=String(hItems[i].STAGE_SEMANTIC_ID||"").toLowerCase();
          const isPerda=sem==="f"||sem==="failure";
          if(isPerda){
            tevePerda=true;
            dataPerda=parteDataISO(hItems[i].CREATED_TIME)||"";
          }else if(tevePerda&&(sem==="p"||sem==="process"||sem==="s"||sem==="success")){
            dataReativacao=parteDataISO(hItems[i].CREATED_TIME)||"";
            tipoRecuperacao=sem==="s"||sem==="success"?"Reativado e Ganho":"Reativado para Em Aberto";
            break;
          }
        }

        if(!tipoRecuperacao && d._SEMANTICA==="success" && (tevePerda || String(d.CLOSED)==="Y")){
          tipoRecuperacao="Recuperado e Ganho";
          dataReativacao=parteDataISO(d.MOVED_TIME)||parteDataISO(d.DATE_MODIFY)||parteDataISO(d.DATE_CREATE);
        }

        if(tipoRecuperacao){
          if(d._SEMANTICA==="success"){
            totalGanhosRecuperados++;
            receitaRecuperados+=d._VALOR;
          }
          recuperados.push({
            DEAL_ID:d.ID,
            CLIENTE:d._CLIENTE,
            FUNIL:d._FUNIL,
            ESTAGIO_ATUAL:d._ESTAGIO,
            STATUS_ATUAL:d._SEMANTICA==="success"?"Ganho":d._SEMANTICA==="failure"?"Perdido":"Em Aberto",
            RESPONSAVEL:d._RESPONSAVEL,
            TIPO_RECUPERACAO:tipoRecuperacao,
            DATA_PERDA:dataPerda?formatarDataBR(dataPerda):"—",
            DATA_REATIVACAO:dataReativacao?formatarDataBR(dataReativacao):"—",
            VALOR:d._VALOR
          });
        }
      });

      recuperados.sort((a,b)=>b.VALOR-a.VALOR);
      const totalDeals=b.deals.length;
      const pipelineReativado=recuperados.reduce((a,r)=>a+r.VALOR,0);

      criarResultadoCatalogo(chave,"Clientes Recuperados","Oportunidades reativadas após período de perda ou desqualificação segundo o histórico.",
        [
          kpi("Negócios Analisados",totalDeals),
          kpi("Negócios Reativados",recuperados.length),
          kpi("Taxa de Recuperação",`${taxaPct(recuperados.length,totalDeals)}%`),
          kpi("Recuperados & Ganhos",totalGanhosRecuperados),
          kpi("Receita de Recuperados",moedaRelatorio(receitaRecuperados)),
          kpi("Pipeline Reativado",moedaRelatorio(pipelineReativado)),
          kpi("Maior Recuperação",recuperados.length?moedaRelatorio(recuperados[0].VALOR):"—")
        ],
        [
          {titulo:"Listagem de Negócios Reativados",dados:recuperados,colunas:[
            {label:"Deal",valor:"DEAL_ID"},
            {label:"Cliente",valor:"CLIENTE"},
            {label:"Funil",valor:"FUNIL"},
            {label:"Estágio Atual",valor:"ESTAGIO_ATUAL"},
            {label:"Status Atual",valor:"STATUS_ATUAL"},
            {label:"Responsável",valor:"RESPONSAVEL"},
            {label:"Tipo Recuperação",valor:"TIPO_RECUPERACAO"},
            {label:"Data Perda",valor:"DATA_PERDA"},
            {label:"Data Reativação",valor:"DATA_REATIVACAO"},
            {label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}
          ]}
        ],
        "Identificação baseada exclusivamente no histórico crm.stagehistory.list de transição por estágios com semântica de perda seguida de reativação.");
    }

    else throw new Error(`Relatório "${chave}" ainda não possui implementação.`);

    const labelRel = (typeof RELATORIOS !== "undefined" && RELATORIOS?.[chave]?.label) || chave;
    if (typeof atualizarStatus === "function") atualizarStatus(`Relatório concluído: ${labelRel}.`);
  }catch(e){if(typeof mostrarErro==="function")mostrarErro("Não foi possível montar o relatório selecionado.\n\nDetalhe técnico: "+e.message);else console.error(e);}
  finally{
    const elSp=document.getElementById("spinner");if(elSp?.style)elSp.style.display="none";
    const elExt=document.getElementById("btnExtrair");if(elExt)elExt.disabled=false;
    const elPar=document.getElementById("btnParar");if(elPar)elPar.disabled=true;
  }
}


const MODELO_EXECUTIVO_CSS = String.raw`
  :root {
    /* ---- brand tokens, same palette/names as o Case Prático SDR/BDR ---- */
    --orange:   #FF5618;
    --orange-2: #FF8008;
    --orange-3: #FF6B10;
    --gold:     #FFC500;
    --dark:     #333333;
    --white:    #FFFFFF;
    --cream:    #FBF3EC;
    --line:     #EAE1D8;
    --muted:    #8A8078;
    --maxw:     1240px;

    /* aliases used throughout this file's selectors */
    --atlas-primary:   var(--orange);
    --atlas-yellow:    var(--gold);
    --atlas-orange-2:  var(--orange-3);
    --atlas-orange-3:  var(--orange-2);
    --atlas-dark:      var(--dark);
    --atlas-white:     var(--white);

    --surface-1:      var(--white);
    --page-plane:      #FAF9F7;
    --text-primary:   var(--dark);
    --text-secondary: #5C564F;
    --text-muted:     var(--muted);
    --grid:           var(--line);
    --border:         rgba(51,51,51,0.10);
    --shadow-card:    0 18px 40px -22px rgba(51,51,51,.28);
    --shadow-soft:    0 6px 16px -12px rgba(51,51,51,.24);

    --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif;
    font-size: 14px; color: var(--text-primary);
    background: linear-gradient(180deg, #FAF9F7 0%, #F4F1EC 100%) fixed; margin: 0; padding: 0 0 48px;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--atlas-primary); }

  /* ---------- letterhead masthead ---------- */
  .letterhead { background: var(--white); border-bottom: 3px solid var(--orange); }
  .letterhead-inner {
    max-width: var(--maxw); margin: 0 auto; padding: 20px 24px;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
  }
  .letterhead-brand { display: flex; align-items: center; gap: 16px; }
  .letterhead-brand svg { height: 32px; width: auto; display: block; }
  .letterhead-divider { width: 1.5px; align-self: stretch; background: var(--line); }
  .letterhead-tagline { font-size: 11.5px; font-weight: 700; letter-spacing: .05em; color: var(--muted); text-transform: uppercase; max-width: 200px; line-height: 1.5; }
  .letterhead-ref { font-size: 12px; font-weight: 600; color: var(--muted); text-align: right; line-height: 1.6; }
  .letterhead-ref strong { color: var(--dark); font-weight: 800; }

  /* ---------- hero ---------- */
  .hero {
    position: relative; overflow: hidden;
    background: linear-gradient(115deg, var(--orange) 0%, var(--orange-3) 55%, var(--orange-2) 100%);
    color: var(--white); padding: 40px 24px 76px;
    clip-path: polygon(0 0, 100% 0, 100% 90%, 0 100%);
  }
  .hero::after {
    content: ""; position: absolute; right: -8%; top: -30%; width: 480px; height: 480px;
    background: radial-gradient(circle, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 70%);
  }
  .hero-inner { max-width: var(--maxw); margin: 0 auto; position: relative; z-index: 1; }
  .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 700; color: rgba(255,255,255,.85); margin: 0 0 12px; }
  .hero h1 { font-size: 34px; font-weight: 800; line-height: 1.12; margin: 0 0 10px; letter-spacing: -.01em; }
  .hero .subtitle { font-size: 14.5px; font-weight: 400; color: rgba(255,255,255,.92); max-width: 560px; margin: 0; }

  .topbar { display: none; }

  .wrap { max-width: var(--maxw); margin: -40px auto 0; padding: 0 24px 0; position: relative; z-index: 2; }

  h2.section {
    font-size: 15px; font-weight: 800; color: var(--atlas-dark);
    margin: 40px 0 4px; padding-left: 14px; position: relative;
    text-transform: uppercase; letter-spacing: 0.02em;
    display: flex; align-items: baseline; gap: 10px;
  }
  h2.section::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; border-radius: 3px;
    background: linear-gradient(180deg, var(--orange), var(--gold));
  }
  h2.section .count { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: none; letter-spacing: 0; }
  p.section-sub { margin: 4px 0 16px 19px; font-size: 12.5px; color: var(--text-secondary); }

  .card {
    background: var(--surface-1); border-radius: 14px;
    box-shadow: var(--shadow-card); overflow: hidden;
  }
  .card-pad { padding: 20px 22px; }
  .card-head {
    padding: 12px 20px; font-weight: 700; font-size: 13px; color: var(--atlas-dark);
    background: var(--cream); border-bottom: 1px solid var(--line);
  }

  .explainer {
    background: var(--white); border-left: 4px solid var(--atlas-primary);
    border-radius: 14px; padding: 22px 26px; margin-bottom: 8px; line-height: 1.65; font-size: 14px;
    box-shadow: var(--shadow-card);
  }
  .explainer h2 { margin: 0 0 10px; font-size: 17px; color: var(--atlas-dark); border: none; padding: 0; }
  .explainer dl { display: grid; grid-template-columns: 210px 1fr; gap: 7px 16px; margin: 10px 0 0; }
  .explainer dt { font-weight: 700; color: var(--atlas-primary); }
  .explainer dd { margin: 0; color: var(--text-secondary); }

  .note {
    background: var(--cream); border-left: 4px solid var(--gold);
    border-radius: 0 14px 14px 0; padding: 16px 22px; font-size: 13px; margin: 18px 0 24px; line-height: 1.6;
  }
  .note b { display: block; margin-bottom: 6px; color: var(--atlas-dark); }
  .meta-missing { color: var(--critical); font-weight: 700; }

  .overview-panel {
    background: var(--white); border-radius: 16px; padding: 26px 28px 22px;
    box-shadow: var(--shadow-card); margin-bottom: 32px;
  }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 14px 0 0; }
  .kpi { background: var(--white); border: 1px solid var(--line); border-radius: 12px; padding: 18px; text-align: center; }
  .kpi .label { font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
  .kpi .value { font-size: 22px; font-weight: 800; margin-top: 6px; color: var(--text-primary); }
  .kpi .small { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
  .kpi.good { border-top: 3px solid var(--good); }
  .kpi.good .value { color: var(--good); }
  .kpi.warn { border-top: 3px solid var(--warning); }
  .kpi.warn .value { color: #bf8a00; }
  .kpi.accent {
    background: linear-gradient(135deg, var(--orange) 0%, var(--orange-3) 55%, var(--orange-2) 100%);
    border: none; box-shadow: var(--shadow-soft);
  }
  .kpi.accent .label { color: rgba(255,255,255,.85); }
  .kpi.accent .value { color: var(--white); }
  .kpi.accent .small { color: rgba(255,255,255,.85); }

  .kpi-clickable { cursor: pointer; transition: box-shadow .15s ease, transform .15s ease; }
  .kpi-clickable:hover { box-shadow: var(--shadow-card); transform: translateY(-2px); }
  .kpi-clickable:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,86,24,.35); }
  .kpi-arrow { display: inline-block; color: var(--atlas-primary); font-weight: 900; transition: transform .15s ease; }
  .kpi-clickable:hover .kpi-arrow, .kpi-clickable:focus-visible .kpi-arrow { transform: translateX(3px); }

  @keyframes detailPulse {
    0%   { box-shadow: 0 0 0 0 rgba(255,86,24,.55); }
    70%  { box-shadow: 0 0 0 14px rgba(255,86,24,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,86,24,0); }
  }
  .detail-highlight { animation: detailPulse 1.4s ease; border-radius: 14px; }
  .back-to-overview { display: block; text-align: center; font-size: 12.5px; font-weight: 700; color: var(--atlas-primary); text-decoration: none; margin: 6px 0 32px; }
  .back-to-overview:hover { text-decoration: underline; }

  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 28px; }
  .barrow { display: grid; grid-template-columns: minmax(0,190px) 1fr minmax(0,110px); align-items: center; gap: 10px; margin-bottom: 9px; }
  .barlabel { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bartrack { background: var(--grid); border-radius: 12px; height: 16px; position: relative; overflow: hidden; }
  .barfill { height: 100%; border-radius: 8px; min-width: 6px; }
  .barvalue { font-size: 11.5px; color: var(--text-primary); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

  .full { grid-column: 1 / -1; }

  /* ---------- company cards ---------- */
  .cgrid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
    margin-bottom: 14px;
  }
  .ccard {
    background: var(--surface-1); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px 18px; box-shadow: var(--shadow-soft);
    display: flex; flex-direction: column; gap: 8px;
    transition: box-shadow .15s, transform .15s;
  }
  .ccard:hover { box-shadow: var(--shadow-card); transform: translateY(-1px); }
  .ccard-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 8px; }
  .ccard-value { font-weight: 800; font-size: 15px; color: var(--atlas-dark); white-space: nowrap; margin-left: auto; }
  .ccard-name { font-weight: 700; font-size: 15px; color: var(--text-primary); line-height: 1.35;
                 overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .ccard-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-secondary); }
  .ccard-meta .dim { color: var(--text-muted); font-style: italic; }
  .ccard-date { font-size: 11.5px; color: var(--text-muted); border-top: 1px dashed var(--grid); padding-top: 8px; margin-top: 4px; }

  .stage-badge {
    font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em;
    padding: 4px 10px; border-radius: 20px; white-space: nowrap; color: #fff;
  }
  .stage-badge.s-1 { background: #86b6ef; color: #0b3a6b; }
  .stage-badge.s-2 { background: #3987e5; }
  .stage-badge.s-3 { background: #1c5cab; }
  .stage-badge.s-4 { background: #4a3aa7; }
  .stage-badge.s-pend { background: var(--warning); color: #5c3d00; }
  .stage-badge.s-won { background: var(--good); }

  /* ---------- vendor accordion ---------- */
  .vgrid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    align-items: start; gap: 10px; margin-bottom: 12px;
  }
  .vcard[open] { grid-column: 1 / -1; }
  .vcard {
    background: var(--surface-1); border-radius: 14px;
    box-shadow: var(--shadow-soft); overflow: hidden;
  }
  .vcard > summary {
    list-style: none; cursor: pointer; padding: 14px 18px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-weight: 700; color: var(--atlas-dark);
    border-left: 5px solid var(--atlas-primary);
  }
  .vcard > summary::-webkit-details-marker { display: none; }
  .vcard > summary:hover { background: var(--cream); }
  .vcard-name { font-size: 13.5px; }
  .vcard-stats { font-size: 11.5px; color: var(--text-secondary); font-weight: 600; margin-left: auto; margin-right: 14px; }
  .vcard-chevron { font-size: 13px; color: var(--atlas-primary); transition: transform .15s; }
  .vcard[open] > summary .vcard-chevron { transform: rotate(180deg); }
  .vcard-body { padding: 16px 18px 18px; border-top: 1px solid var(--line); background: var(--page-plane); }

  .mini-chart {
    background: var(--surface-1); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px 14px 8px; margin-bottom: 14px;
  }
  .mini-chart-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--text-muted); margin-bottom: 8px; }
  .mbarrow { display: grid; grid-template-columns: minmax(0,150px) 1fr minmax(0,90px); align-items: center; gap: 8px; margin-bottom: 6px; }
  .mbarlabel { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mbartrack { background: var(--grid); border-radius: 10px; height: 11px; overflow: hidden; }
  .mbarfill { height: 100%; border-radius: 6px; min-width: 4px; }
  .mbarvalue { font-size: 10.5px; font-weight: 700; text-align: right; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .mbar-more { font-size: 10.5px; color: var(--text-muted); font-style: italic; margin-top: 2px; }

  /* ---------- 3 top-level cards side by side ---------- */
  .top3grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    align-items: start; gap: 14px; margin-bottom: 28px;
  }
  .top3grid .vcard[open] { grid-column: 1 / -1; }
  .top3grid > .vcard { box-shadow: var(--shadow-card); }
  .top3grid > .vcard > summary { padding: 18px; }
  .top3grid > .vcard .vcard-name { font-size: 14.5px; font-weight: 800; }
  @media (max-width: 900px) {
    .top3grid { grid-template-columns: 1fr; }
  }

  /* ---------- month sub-cards (nested inside a top card) ---------- */
  .month-list { display: flex; flex-direction: column; gap: 10px; }
  .month-card > summary { border-left-color: var(--atlas-orange-2); padding: 11px 16px; }
  .month-card .vcard-name { font-size: 12.5px; }
  .month-card .vcard-body { padding: 14px 16px 16px; }

  /* ---------- stage sub-cards (nested inside a month card) ---------- */
  .stage-list { display: flex; flex-direction: column; gap: 8px; }
  .stage-card > summary { border-left-color: var(--atlas-yellow); padding: 9px 14px; gap: 8px; }
  .stage-card .vcard-body { padding: 12px 14px 14px; }

  /* ---------- wide verification cards ---------- */
  .wgrid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
  .wcard {
    background: var(--surface-1); border-left: 6px solid var(--text-muted);
    border-radius: 0 12px 12px 0; padding: 16px 20px; box-shadow: var(--shadow-soft);
  }
  .wcard.w-ok { border-left-color: var(--good); }
  .wcard.w-warn { border-left-color: var(--warning); }
  .wcard.w-alert { border-left-color: var(--critical); }
  .wcard-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
  .wcard-name { font-weight: 700; font-size: 14.5px; }
  .wcard-status { font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; color: #fff; white-space: nowrap; }
  .wcard-status-ok { background: var(--good); }
  .wcard-status-warn { background: var(--warning); color: #5c3d00; }
  .wcard-status-alert { background: var(--critical); }
  .wcard-body { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
  .wcard-foot { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 10px; font-weight: 600; }

  .small-note { font-size: 11.5px; color: var(--text-muted); margin: 4px 0 20px; padding: 0 4px; line-height: 1.5; }
  .lead-note {
    background: var(--cream); border-left: 4px solid var(--gold); border-radius: 0 10px 10px 0;
    padding: 12px 16px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6; margin: 0 0 16px;
  }

  footer {
    text-align: center; font-size: 12px; color: var(--text-muted); font-weight: 600; letter-spacing: .02em;
    margin-top: 48px; padding: 32px 24px 26px; border-top: 1px solid var(--line);
  }
  .footer-brand { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; }
  .footer-brand svg { height: 15px; width: auto; }
  .footer-brand span { font-weight: 800; color: var(--dark); letter-spacing: .04em; }

  @media (max-width: 860px) {
    .letterhead-inner { padding: 16px 18px; }
    .letterhead-ref { display: none; }
    .hero { padding: 32px 18px 64px; }
    .hero h1 { font-size: 27px; }
    .wrap { padding: 0 18px 0; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .charts-grid { grid-template-columns: 1fr; }
    .explainer dl { grid-template-columns: 1fr; }
    .cgrid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  }
  @media print {
    .hero { clip-path: none; }
    body { background: var(--white); }
    .valor-pisca { animation: none !important; opacity: 1 !important; }
    .kpi, .analise-card, .stat-item, .barrow, .mbarrow, .model-table-wrap { break-inside: avoid; page-break-inside: avoid; }
    .info-tip::after, .info-tip::before { display: none !important; }
  }

.model-table-wrap{overflow:auto;background:#fff;border-radius:14px;box-shadow:var(--shadow-soft);margin-bottom:22px}
.model-table{width:100%;border-collapse:collapse;font-size:12px}
.model-table th,.model-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.model-table th{background:var(--cream);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.activity-insight{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0 22px}
.activity-insight .mini-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center}
.activity-insight .mini-kpi b{display:block;font-size:22px;color:var(--orange);margin-bottom:4px}
.activity-insight .mini-kpi span{font-size:10.5px;color:var(--muted);text-transform:uppercase;font-weight:700}
@media(max-width:860px){.activity-insight{grid-template-columns:repeat(2,1fr)}}
.meta-progress-wrap{display:flex;flex-direction:column;gap:12px;margin:16px 0 0}
.meta-progress-row{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff}
.meta-progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:12.5px;font-weight:700;color:var(--text-primary);flex-wrap:wrap}
.meta-progress-valores{font-weight:600;color:var(--text-secondary);font-size:12px}
.meta-progress-track{margin-top:8px;height:10px;border-radius:999px;background:var(--cream);overflow:hidden}
.meta-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--orange),#ffb703)}
.meta-progress-fill.bateu{background:linear-gradient(90deg,var(--good),#37c98a)}
.meta-progress-status{margin-top:6px;font-size:11.5px;font-weight:700}
.meta-progress-status.ok{color:var(--good)}
.meta-progress-status.pendente{color:var(--text-secondary)}
.meta-seta{font-size:13px;margin-right:3px;font-weight:900}
.meta-seta-up{color:var(--good)}
.meta-seta-down{color:#d03b3b}
.meta-cards-destaque{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:18px 0 0}
.meta-card-destaque{border-radius:16px;padding:20px 22px;background:#fff;border:2px solid var(--line);box-shadow:var(--shadow-card)}
.meta-card-destaque.no-caminho{border-color:var(--good);background:rgba(12,163,12,.05)}
.meta-card-destaque.abaixo{border-color:#d03b3b;background:rgba(208,59,59,.05)}
.meta-card-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;color:var(--muted)}
.meta-card-valor{font-size:28px;font-weight:800;color:var(--text-primary);margin:4px 0 12px;letter-spacing:-.02em}
.meta-card-linha{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text-secondary);padding:6px 0;border-top:1px dashed var(--line)}
.meta-card-linha strong{color:var(--text-primary);font-weight:700}
.meta-card-pct{margin-top:8px;font-size:11.5px;font-weight:700;color:var(--muted)}
@media(max-width:640px){.meta-cards-destaque{grid-template-columns:1fr}}

/* ---------- v19: mais vida nos cards — animações de entrada, badge de */
/* notificação, balão de dica, alertas e popup informativo ---------- */
@keyframes fadeSlideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pingPulse{0%{box-shadow:0 0 0 0 rgba(208,59,59,.55)}70%{box-shadow:0 0 0 9px rgba(208,59,59,0)}100%{box-shadow:0 0 0 0 rgba(208,59,59,0)}}
@keyframes popIn{from{opacity:0;transform:scale(.94) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.kpis>*,.top3grid>*,.cgrid>*,.month-list>*,.stage-list>*{animation:fadeSlideIn .5s ease both}
.kpis>*:nth-child(1){animation-delay:.04s}
.kpis>*:nth-child(2){animation-delay:.1s}
.kpis>*:nth-child(3){animation-delay:.16s}
.kpis>*:nth-child(4){animation-delay:.22s}
.top3grid>*:nth-child(1){animation-delay:.08s}
.top3grid>*:nth-child(2){animation-delay:.16s}
.top3grid>*:nth-child(3){animation-delay:.24s}
.cgrid>*,.month-list>*,.stage-list>*{animation-delay:.2s}
.cgrid>*:nth-child(1),.month-list>*:nth-child(1),.stage-list>*:nth-child(1){animation-delay:.03s}
.cgrid>*:nth-child(2),.month-list>*:nth-child(2),.stage-list>*:nth-child(2){animation-delay:.07s}
.cgrid>*:nth-child(3),.month-list>*:nth-child(3),.stage-list>*:nth-child(3){animation-delay:.11s}
.cgrid>*:nth-child(4),.month-list>*:nth-child(4),.stage-list>*:nth-child(4){animation-delay:.15s}
.kpi,.meta-card-destaque{position:relative;transition:transform .18s ease,box-shadow .18s ease}
.kpi-clickable:hover{transform:translateY(-3px);box-shadow:var(--shadow-card)}
.badge-ping{position:absolute;top:-8px;right:-8px;min-width:22px;height:22px;padding:0 5px;border-radius:999px;background:var(--critical);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;animation:pingPulse 1.8s ease-out infinite}
.info-tip{position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:rgba(51,51,51,.1);color:var(--text-secondary);font-size:9.5px;font-style:normal;font-weight:800;margin-left:5px;cursor:help;vertical-align:middle}
.info-tip::after{content:attr(data-tip);position:absolute;left:50%;bottom:135%;transform:translateX(-50%) scale(.94);transform-origin:bottom center;background:#262b36;color:#fff;padding:8px 10px;border-radius:8px;font-size:11.5px;font-weight:500;text-transform:none;letter-spacing:normal;line-height:1.35;text-align:left;white-space:normal;width:min(200px,52vw);box-shadow:0 10px 24px rgba(0,0,0,.28);z-index:30;opacity:0;pointer-events:none;transition:opacity .15s ease,transform .15s ease}
.info-tip::before{content:"";position:absolute;left:50%;bottom:123%;transform:translateX(-50%);border:6px solid transparent;border-top-color:#262b36;z-index:30;opacity:0;transition:opacity .15s ease}
.info-tip:hover::after,.info-tip:focus-visible::after,.info-tip:hover::before,.info-tip:focus-visible::before{opacity:1;transform:translateX(-50%) scale(1)}
@media(max-width:480px){.info-tip::after,.info-tip::before{display:none}}
.alert-banner{display:flex;align-items:flex-start;gap:10px;padding:13px 16px;border-radius:12px;margin:14px 0 0;font-size:13px;font-weight:600;line-height:1.45;animation:slideDown .4s ease both}
.alert-banner .icon{font-size:17px;line-height:1.2}
.alert-banner.good{background:rgba(12,163,12,.08);color:#0ca30c;border:1px solid rgba(12,163,12,.25)}
.alert-banner.bad{background:rgba(208,59,59,.08);color:#d03b3b;border:1px solid rgba(208,59,59,.25);animation:slideDown .4s ease both,pingPulse 2.4s ease-out 1}
.alert-banner.warn{background:rgba(250,178,25,.14);color:#8a5a00;border:1px solid rgba(250,178,25,.4)}
.btn-info-flutuante{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--atlas-primary);color:#fff;font-weight:800;font-size:12px;font-style:italic;cursor:pointer;border:none;margin-left:4px;transition:transform .15s ease;flex-shrink:0}
.btn-info-flutuante:hover{transform:scale(1.15) rotate(8deg)}
.popup-overlay{position:fixed;inset:0;background:rgba(15,18,25,.5);display:none;align-items:center;justify-content:center;z-index:200;padding:20px}
.popup-overlay.aberto{display:flex;animation:fadeSlideIn .18s ease both}
.popup-box{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:24px 26px;box-shadow:0 26px 60px rgba(0,0,0,.32);animation:popIn .22s ease both;position:relative}
.popup-box h3{margin:0 0 12px;font-size:15px;color:var(--atlas-dark)}
.popup-box p{margin:0 0 10px;font-size:13px;color:var(--text-secondary);line-height:1.55}
.popup-box p b{color:var(--text-primary)}
.popup-close{position:absolute;top:12px;right:14px;background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:var(--text-secondary)}
.popup-close:hover{color:var(--critical)}
@media(prefers-reduced-motion:reduce){.kpis>*,.top3grid>*,.cgrid>*,.month-list>*,.stage-list>*,.alert-banner,.popup-box,.popup-overlay.aberto{animation:none!important}.badge-ping{animation:none!important}}

/* ---------- v20: mini gráfico de tendência, drill-down e filtro por vendedor(a) ---------- */
.trend-box{margin:14px 0 0;padding:14px 16px 8px;border:1px solid var(--line);border-radius:12px;background:var(--white)}
.trend-box.trend-vazio{padding:14px 16px;font-size:12px;color:var(--text-muted);text-align:center}
.trend-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;font-size:12.5px;font-weight:800;color:var(--atlas-dark)}
.trend-sub{font-size:11px;font-weight:600;color:var(--text-muted)}
.trend-svg{width:100%;height:64px;margin-top:8px;display:block}
.trend-line{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.trend-line-fechado{stroke:var(--orange)}
.trend-line-projecao{stroke:var(--gold);stroke-dasharray:5 3}
.trend-line-meta{stroke:var(--muted);stroke-dasharray:2 3}
.trend-legend{display:flex;gap:14px;margin-top:6px;font-size:10.5px;font-weight:700;color:var(--text-secondary)}
.trend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.trend-dot-fechado{background:var(--orange)}
.trend-dot-projecao{background:var(--gold)}
.trend-dot-meta{background:var(--muted)}
.ccard-abrir{align-self:flex-start;margin-top:2px;font-size:11.5px;font-weight:800;color:var(--atlas-primary);text-decoration:none;border:1px solid rgba(255,86,24,.35);border-radius:999px;padding:4px 10px;transition:background .15s ease,color .15s ease}
.ccard-abrir:hover{background:var(--atlas-primary);color:#fff}
.filtro-vendedor-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px 19px;font-size:12.5px;font-weight:700;color:var(--text-secondary)}
.filtro-vendedor-row select{font:inherit;font-weight:700;padding:6px 10px;border-radius:8px;border:1.5px solid var(--orange);background:#fff;color:var(--text-primary)}
.filtro-vendedor-aviso{font-size:11.5px;font-weight:700;color:var(--atlas-primary)}

/* ---------- v20: fontes maiores, mais negrito e contorno laranja nos cards ---------- */
body{font-size:15px}
h2.section{font-size:17px;font-weight:900}
.hero h1{font-size:36px}
.kpi{border:2px solid var(--orange)}
.kpi .label{font-size:11.5px;font-weight:800}
.kpi .value{font-size:26px;font-weight:800}
.kpi .small{font-size:12px;font-weight:700}
.meta-card-destaque{border-width:2px;border-color:var(--orange)}
.meta-card-label{font-size:12px;font-weight:800}
.meta-card-valor{font-size:32px;font-weight:800}
.meta-card-linha{font-size:14px;font-weight:600}
.meta-card-linha strong{font-weight:800}
.meta-card-pct{font-size:12.5px;font-weight:800}
.ccard{border:2px solid var(--orange)}
.ccard-name{font-size:16px;font-weight:800}
.ccard-value{font-size:17px;font-weight:800}
.ccard-meta{font-size:13px;font-weight:700}
.vcard{border:2px solid var(--orange)}
.vcard-name{font-size:15px;font-weight:800}
.vcard-stats{font-size:12.5px;font-weight:800}

/* ---------- v24: cards mais arredondados, fontes maiores, efeito "pisca" ---------- */
/* nos valores, melhor distribuição dos cards e a seção "Análise" (composição, */
/* comparativo ano a ano, pipeline por estágio, estatísticas) ---------- */
.kpi{border-radius:20px}
.meta-card-destaque{border-radius:22px}
.ccard{border-radius:18px}
.vcard{border-radius:18px}
.alert-banner{border-radius:16px}
.popup-box{border-radius:20px}
.trend-box{border-radius:16px}
.mini-chart{border-radius:14px}
h2.section{font-size:18px}
.kpi .value{font-size:27px}
.meta-card-valor{font-size:30px}
.ccard-name{font-size:16.5px}
.hero h1{font-size:37px}
.kpis{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.top3grid{gap:18px}
.cgrid{gap:16px}
@keyframes valorPisca{0%,100%{opacity:1;filter:drop-shadow(0 0 0 rgba(255,86,24,0))}50%{opacity:.72;filter:drop-shadow(0 0 6px rgba(255,86,24,.55))}}
.valor-pisca{animation:valorPisca 1.7s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.valor-pisca{animation:none!important}}

.meta-card-topo{display:flex;align-items:center;justify-content:space-between;gap:12px}
.meta-gauge{width:64px;height:64px;flex-shrink:0}
.meta-gauge-trilha{fill:none;stroke:rgba(0,0,0,.08);stroke-width:8}
.meta-gauge-progresso{fill:none;stroke-width:8;stroke-linecap:round;transform:rotate(-90deg);transform-origin:36px 36px;transition:stroke-dasharray .3s ease}
.meta-gauge-texto{font-size:15px;font-weight:800;fill:var(--text-primary)}

.donut-box{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.donut-svg{width:120px;height:120px;flex-shrink:0}
.donut-fatia{fill:none;stroke-width:20;transition:stroke-dasharray .3s ease}
.donut-total{font-size:13px;font-weight:800;fill:var(--text-primary)}
.donut-legend{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--text-secondary)}

.analise-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin:16px 0 28px}
.analise-card{padding:18px 20px;background:var(--white)}
.analise-card-wide{grid-column:1 / -1}
.analise-card-titulo{font-size:13px;font-weight:800;color:var(--atlas-dark);margin-bottom:10px;text-transform:uppercase;letter-spacing:.02em}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.stat-item{display:flex;flex-direction:column;gap:2px;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--page-plane)}
.stat-label{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted)}
.stat-valor{font-size:18px;font-weight:800;color:var(--atlas-dark)}
.stat-sub{font-size:11px;color:var(--text-secondary);font-weight:600}
@media(max-width:640px){.donut-box{flex-direction:column;align-items:flex-start}}
`;
const MODELO_EXECUTIVO_LOGO = String.raw`<svg viewBox="0 0 800 174.78" xmlns="http://www.w3.org/2000/svg" fill="#FF5618"><path d="M403.66,171.69l-10-28.49h-57l-9.78,28.49H294.09L350.17,21.5h29.14L437.2,171.69ZM365,61.19l-18.66,53.73H383.9Z"/>
        <path d="M494.61,145.14h13.58v26.55H487q-18.16,0-28.69-10.53t-10.53-28.89v-47h-21.4V78.88L472.8,32.47h4.35V61.31h31v24H477.65v43q0,8.08,4.39,12.47t12.57,4.39"/>
        <rect x="529.49" y="21.5" width="29.84" height="150.2"/>
        <path d="M670.83,61.12h22.36V171.49H669.73l-2.59-9.88q-15.07,13.17-35.73,13.17a58.64,58.64,0,0,1-29.64-7.58,54.09,54.09,0,0,1-20.76-21,60.29,60.29,0,0,1-7.48-29.89A59.58,59.58,0,0,1,581,86.61a53.89,53.89,0,0,1,20.76-20.85,58.92,58.92,0,0,1,29.64-7.54q21.06,0,36.23,13.47ZM612.3,137.91q8.54,8.63,21.51,8.63t21.5-8.58q8.54-8.58,8.54-21.66t-8.54-21.65q-8.52-8.58-21.5-8.59T612.3,94.7q-8.53,8.63-8.53,21.6t8.53,21.61"/>
        <path d="M753.69,174.78q-20.75,0-33.48-10.82t-12.82-28.6h29q.11,7.09,5.14,10.88T754.89,150A20.3,20.3,0,0,0,766,147.14a9.17,9.17,0,0,0,4.54-8.18,7.43,7.43,0,0,0-1.55-4.69,11.43,11.43,0,0,0-4.84-3.35,43.86,43.86,0,0,0-6.48-2.09q-3.2-.75-8.39-1.65-4.68-.8-7.88-1.45t-7.73-1.94a44.3,44.3,0,0,1-7.64-2.85,43.08,43.08,0,0,1-6.54-4.14,23,23,0,0,1-5.49-5.74,29.62,29.62,0,0,1-3.39-7.63,34.21,34.21,0,0,1-1.35-9.88,31.18,31.18,0,0,1,12.28-25.5q12.27-9.82,32.13-9.83t32,10.13q12.07,10.13,12.17,26.7H769.56q-.09-6.49-4.44-9.78T752.9,82q-6.9,0-10.83,2.9a9.07,9.07,0,0,0-3.94,7.68,7.92,7.92,0,0,0,.64,3.25,5.9,5.9,0,0,0,2.3,2.49q1.65,1,3.09,1.8a22.06,22.06,0,0,0,4.39,1.49c2,.5,3.56.87,4.79,1.1l5.64,1q16.07,2.89,23.16,6,17.86,8,17.86,27.94,0,16.86-12.67,27t-33.64,10.12"/>
        <polygon points="153.4 87.56 167.65 62.87 167.68 62.85 178.13 44.72 178.11 44.68 178.15 44.68 203.95 0 182.97 0 152.31 0 110.4 0 99.17 0 73.37 44.68 73.35 44.72 62.87 62.87 48.62 87.56 48.41 87.94 0 171.76 83.81 171.76 104.78 171.76 125.74 135.49 125.76 135.44 153.19 87.94 153.4 87.56"/>
        <polygon points="203.07 87.94 175.75 87.94 153.9 125.79 153.9 125.83 137.02 155.01 146.7 171.76 209.57 171.76 251.48 171.76 203.07 87.94"/></svg>`;

// v27 — logo da Total Trac para os relatórios exportáveis (segundo tenant do
// portal), reproduzindo o símbolo (pin de localização + ondas de wi-fi) e o
// wordmark de duas cores do manual de identidade visual deles (TOTAL em
// navy #374898, TRAC em azul #008FCE) — mesmo padrão String.raw do logo
// acima, usado por gerarHTMLRelatorioVisualGenerico/cockpitGerarHTMLExport/
// gerarHTMLForecastModelo/gerarHTMLRelatorioAnaliseSdr via marcaAtiva().logoSvg.
const MODELO_EXECUTIVO_LOGO_TOTALTRAC = String.raw`<svg viewBox="0 0 620 120" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(2,4)">
    <path d="M52 0C27 0 7 19 7 43c0 30 45 71 45 71s45-41 45-71C97 19 77 0 52 0z" fill="#93DBF2"/>
    <circle cx="52" cy="43" r="15" fill="#ffffff"/>
    <circle cx="52" cy="43" r="6.5" fill="#374898"/>
    <path d="M52 20a24 24 0 0 1 24 20" stroke="#ffffff" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path d="M52 31a13 13 0 0 1 13 11" stroke="#ffffff" stroke-width="5.5" fill="none" stroke-linecap="round"/>
  </g>
  <text x="122" y="76" font-family="Poppins, Arial, sans-serif" font-weight="800" font-size="54"><tspan fill="#374898">TOTAL</tspan><tspan fill="#008FCE">TRAC</tspan></text>
</svg>`;

// Constrói o CSS do modelo executivo (letterhead/kpis/etc.) trocando a cor de
// marca (--orange/--orange-2/--orange-3) pelas cores da empresa ativa — os
// três hexes abaixo aparecem uma única vez cada, na definição de :root do
// MODELO_EXECUTIVO_CSS (ver `--orange`/`--orange-2`/`--orange-3`), então essa
// substituição simples reskinha todo o relatório exportado sem duplicar o
// CSS inteiro por marca.
function modeloExecutivoCssParaMarca(marca) {
  return MODELO_EXECUTIVO_CSS
    .replace("#FF5618", marca.corPrimaria)
    .replace("#FF8008", marca.corSecundaria1)
    .replace("#FF6B10", marca.corSecundaria2);
}


// ---------------------------------------------------------------------------
// v29 — Modal de Faturamento (Vendido × Faturado)
// ---------------------------------------------------------------------------
let faturamentoDealAtual = null;

window.abrirModalFaturamento = function(dealId, cliente, vendido, faturadoAtual) {
  faturamentoDealAtual = dealId;
  const pendente = Math.max(0, vendido - faturadoAtual);

  let modal = document.getElementById("modalFaturamento");
  if (!modal) {
    document.body.insertAdjacentHTML("beforeend", `
      <div id="modalFaturamento" class="modal-backdrop oculto">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Registrar Faturamento (NF)</h3>
            <button class="modal-close" onclick="fecharModalFaturamento()">×</button>
          </div>
          <div class="modal-body">
            <p><strong>Cliente:</strong> <span id="faturamentoCliente"></span></p>
            <p><strong>Total Vendido:</strong> <span id="faturamentoVendido"></span></p>
            <p><strong>Já Faturado:</strong> <span id="faturamentoAtual"></span></p>
            <p><strong>Pendente:</strong> <span id="faturamentoPendente"></span></p>

            <form id="formFaturamento" onsubmit="salvarFaturamento(event)">
              <div class="form-group" style="margin-top: 15px;">
                <label for="faturamentoValor">Valor da NF (R$):</label>
                <input type="number" id="faturamentoValor" step="0.01" min="0.01" required class="input-form">
              </div>
              <div class="form-group">
                <label for="faturamentoData">Data da NF:</label>
                <input type="date" id="faturamentoData" required class="input-form">
              </div>
              <div class="form-group">
                <label for="faturamentoNF">Número da NF (opcional):</label>
                <input type="text" id="faturamentoNF" class="input-form">
              </div>
              <div class="form-group">
                <label for="faturamentoObs">Observação (opcional):</label>
                <textarea id="faturamentoObs" rows="2" class="input-form"></textarea>
              </div>
              <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secundario" onclick="fecharModalFaturamento()">Cancelar</button>
                <button type="submit" class="btn btn-primario">Salvar Faturamento</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById("modalFaturamento");
  }

  document.getElementById("faturamentoCliente").textContent = cliente;
  document.getElementById("faturamentoVendido").textContent = moedaRelatorio(vendido);
  document.getElementById("faturamentoAtual").textContent = moedaRelatorio(faturadoAtual);
  document.getElementById("faturamentoPendente").textContent = moedaRelatorio(pendente);

  // Preencher valor pendente como default
  document.getElementById("faturamentoValor").value = pendente > 0 ? pendente.toFixed(2) : "";
  document.getElementById("faturamentoData").value = new Date().toISOString().split("T")[0];
  document.getElementById("faturamentoNF").value = "";
  document.getElementById("faturamentoObs").value = "";

  modal.classList.remove("oculto");
};

window.fecharModalFaturamento = function() {
  const modal = document.getElementById("modalFaturamento");
  if (modal) modal.classList.add("oculto");
  faturamentoDealAtual = null;
};

window.salvarFaturamento = function(ev) {
  ev.preventDefault();
  if (!faturamentoDealAtual) return;

  const valor = Number(document.getElementById("faturamentoValor").value) || 0;
  const data = document.getElementById("faturamentoData").value;
  const nf = document.getElementById("faturamentoNF").value;
  const obs = document.getElementById("faturamentoObs").value;

  if (valor <= 0 || !data) {
    alert("Preencha o valor e a data corretamente.");
    return;
  }

  const faturamento = {
    bitrix_id: faturamentoDealAtual,
    valor_faturado: valor,
    data_faturamento: data,
    numero_nf: nf,
    observacao: obs,
    usuario: "Usuário Local" // Sem login real, apenas guardamos genérico
  };

  saveFaturamento(faturamento);
  fecharModalFaturamento();

  // Re-extrair o relatório para atualizar os valores
  const webhook = document.getElementById("webhook")?.value;
  const relatorioAtual = document.getElementById("relatorio")?.value;
  if (webhook && relatorioAtual && ["vendido_faturado", "backlog_financeiro"].includes(relatorioAtual)) {
    // Precisamos recarregar chamando o mesmo hook que o botão extrair chamaria
    // Como estamos num modal, um alert é mais seguro, mas vamos tentar clicar no botão extrair silenciosamente
    const btnExt = document.getElementById("iniciarExtracao");
    if(btnExt) btnExt.click();
    else alert("Faturamento salvo com sucesso! Por favor, extraia o relatório novamente para atualizar.");
  } else {
    alert("Faturamento salvo com sucesso!");
  }
};
