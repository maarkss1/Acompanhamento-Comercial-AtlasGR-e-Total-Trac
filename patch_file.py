with open('js/catalogo-relatorios.js', 'r') as f:
    text = f.read()

# 2. Forecast Mensal
rep2_before = 'if(sit!=="Fora")rows.push({DEAL_ID:d.ID,CLIENTE:d._CLIENTE,ESTAGIO:d._ESTAGIO,RESPONSAVEL:d._RESPONSAVEL,CLOSEDATE:parteDataISO(d.CLOSEDATE),VALOR:d._VALOR,PROBABILIDADE:prob,FONTE_PROBABILIDADE:usa?"Bitrix":"Fallback",BUCKET:bucket,SITUACAO:sit,FORECAST_PONDERADO:fp});'
rep2_after = 'if(sit!=="Fora")rows.push({DEAL_ID:d.ID,CLIENTE:d._CLIENTE,ESTAGIO:d._ESTAGIO,FUNIL:d._FUNIL,MES:p.fim||p.referencia,RESPONSAVEL:d._RESPONSAVEL,CLOSEDATE:parteDataISO(d.CLOSEDATE),VALOR:d._VALOR,PROBABILIDADE:prob,FONTE_PROBABILIDADE:usa?"Bitrix":"Fallback",BUCKET:bucket,SITUACAO:sit,FORECAST_PONDERADO:fp});'
text = text.replace(rep2_before, rep2_after)

rep2b_before = '[{titulo:"Negócios do forecast",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Estágio",valor:"ESTAGIO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"CLOSEDATE",valor:"CLOSEDATE"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Prob.",valor:(x)=>`${x.PROBABILIDADE}%`},{label:"Bucket",valor:"BUCKET"},{label:"Situação",valor:"SITUACAO"},{label:"Ponderado",valor:(x)=>moedaRelatorio(x.FORECAST_PONDERADO),html:true}]}],\n        "PROBABILITY do Bitrix tem prioridade; quando zerada, usa fallback por estágio.");'
rep2b_after = '[{titulo:"Negócios do forecast",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Estágio",valor:"ESTAGIO"},{label:"Funil",valor:"FUNIL"},{label:"Mês",valor:"MES"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"CLOSEDATE",valor:"CLOSEDATE"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Prob.",valor:(x)=>`${x.PROBABILIDADE}%`},{label:"Bucket",valor:"BUCKET"},{label:"Situação",valor:"SITUACAO"},{label:"Ponderado",valor:(x)=>moedaRelatorio(x.FORECAST_PONDERADO),html:true}]}],\n        "PROBABILITY do Bitrix tem prioridade; quando zerada, usa fallback por estágio. Filtro por produto e pipeline dependem da visualização detalhada, limitados por chamadas N+1 ao Bitrix.");'
text = text.replace(rep2b_before, rep2b_after)

# 3. Pipeline Coverage
rep3_before = '[kpi("Pipeline aberto",moedaRelatorio(total)),kpi("Ponderado",moedaRelatorio(pond)),kpi("0–30 dias",moedaRelatorio(d30)),kpi("31–60 dias",moedaRelatorio(d60)),kpi("61–90 dias",moedaRelatorio(d90)),kpi("Sem CLOSEDATE",sem),kpi("Coverage 90d",meta?`${((d30+d60+d90)/meta).toFixed(2)}x`:"meta não informada"),kpi("Oportunidades",ab.length)],'
rep3_after = '[kpi("Pipeline aberto",moedaRelatorio(total)),kpi("Ponderado",moedaRelatorio(pond)),kpi("0–30 dias",moedaRelatorio(d30)),kpi("31–60 dias",moedaRelatorio(d60)),kpi("61–90 dias",moedaRelatorio(d90)),kpi("Sem CLOSEDATE",sem),kpi("Coverage (Elegível/Meta)",meta?`${((d30+d60+d90)/meta).toFixed(2)}x`:"meta não configurada"),kpi("Oportunidades",ab.length)],'
text = text.replace(rep3_before, rep3_after)

# 5. Aging
rep5_before = 'const rows=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)).map((d)=>{const mt=parteDataISO(d.MOVED_TIME),dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):"";return{DEAL_ID:d.ID,CLIENTE:d._CLIENTE,ESTAGIO:d._ESTAGIO,RESPONSAVEL:d._RESPONSAVEL,VALOR:d._VALOR,DIAS_NO_ESTAGIO:dias,FORA_SLA:dias!==""&&dias>sla?"S":"N"}}).sort((a,b)=>Number(b.DIAS_NO_ESTAGIO||-1)-Number(a.DIAS_NO_ESTAGIO||-1));'
rep5_after = 'const rows=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)).map((d)=>{const mt=parteDataISO(d.MOVED_TIME),dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):"";return{DEAL_ID:d.ID,OPORTUNIDADE:d.TITLE||"",CLIENTE:d._CLIENTE,FUNIL:d._FUNIL,ESTAGIO:d._ESTAGIO,RESPONSAVEL:d._RESPONSAVEL,VALOR:d._VALOR,DIAS_NO_ESTAGIO:dias,FORA_SLA:dias!==""&&dias>sla?"S":"N"}}).sort((a,b)=>Number(b.DIAS_NO_ESTAGIO||-1)-Number(a.DIAS_NO_ESTAGIO||-1));'
text = text.replace(rep5_before, rep5_after)

rep5b_before = '[kpi("Abertas",rows.length),kpi("Fora SLA",crit.length),kpi("% fora SLA",`${taxaPct(crit.length,rows.length)}%`),kpi("Pipeline fora SLA",moedaRelatorio(crit.reduce((a,x)=>a+x.VALOR,0))),kpi(">30d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>30).length),kpi(">60d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>60).length),kpi(">90d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>90).length),kpi("Sem MOVED_TIME",rows.filter((x)=>x.DIAS_NO_ESTAGIO==="").length)],\n        [{titulo:"Aging por oportunidade",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Estágio",valor:"ESTAGIO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias",valor:"DIAS_NO_ESTAGIO"},{label:"Fora SLA",valor:"FORA_SLA"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}]}],\n'
rep5b_after = '[kpi("Abertas",rows.length),kpi("Fora SLA",crit.length),kpi("% fora SLA",`${taxaPct(crit.length,rows.length)}%`),kpi("Pipeline fora SLA",moedaRelatorio(crit.reduce((a,x)=>a+x.VALOR,0))),kpi(`0–${sla}d`,rows.filter((x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO<=sla).length),kpi(`${sla+1}–${sla*2}d`,rows.filter((x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO>sla&&x.DIAS_NO_ESTAGIO<=sla*2).length),kpi(`>${sla*2}d`,rows.filter((x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO>sla*2).length),kpi("Sem MOVED_TIME",rows.filter((x)=>x.DIAS_NO_ESTAGIO==="").length)],\n        [{titulo:"Aging por oportunidade",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Oportunidade",valor:"OPORTUNIDADE"},{label:"Cliente",valor:"CLIENTE"},{label:"Funil",valor:"FUNIL"},{label:"Estágio",valor:"ESTAGIO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias",valor:"DIAS_NO_ESTAGIO"},{label:"Fora SLA",valor:"FORA_SLA"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}]}],\n'
text = text.replace(rep5b_before, rep5b_after)

# 6. Performance
rep6_before = 'const get=(d)=>{const k=String(d.ASSIGNED_BY_ID||"0");return m[k]||(m[k]={RESPONSAVEL:d._RESPONSAVEL,CRIADAS:0,PIPELINE:0,GANHOS:0,RECEITA:0,PERDAS:0,PERDIDO:0,CICLO_SOMA:0,CICLO_N:0})};\n      ds.forEach((d)=>{const r=get(d);if(dentroPeriodoCatalogo(d.DATE_CREATE,p))r.CRIADAS++;if(d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO))r.PIPELINE+=d._VALOR;if(dentroPeriodoCatalogo(d._FECHAMENTO,p)){if(d._SEMANTICA==="success"){r.GANHOS++;r.RECEITA+=d._VALOR}else if(d._SEMANTICA==="failure"){r.PERDAS++;r.PERDIDO+=d._VALOR}if(d._CICLO!==""){r.CICLO_SOMA+=Number(d._CICLO);r.CICLO_N++}}});'
rep6_after = 'const get=(d)=>{const k=String(d.ASSIGNED_BY_ID||"0");return m[k]||(m[k]={RESPONSAVEL:d._RESPONSAVEL,CRIADAS:0,PIPELINE:0,FORECAST:0,GANHOS:0,RECEITA:0,PERDAS:0,PERDIDO:0,CICLO_SOMA:0,CICLO_N:0})};\n      ds.forEach((d)=>{const r=get(d);if(dentroPeriodoCatalogo(d.DATE_CREATE,p))r.CRIADAS++;if(d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)){r.PIPELINE+=d._VALOR;const pr=Number(d.PROBABILITY);const prob=(Number.isFinite(pr)&&pr>0&&pr<=100)?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA);r.FORECAST+=d._VALOR*prob/100;}if(dentroPeriodoCatalogo(d._FECHAMENTO,p)){if(d._SEMANTICA==="success"){r.GANHOS++;r.RECEITA+=d._VALOR}else if(d._SEMANTICA==="failure"){r.PERDAS++;r.PERDIDO+=d._VALOR}if(d._CICLO!==""){r.CICLO_SOMA+=Number(d._CICLO);r.CICLO_N++}}});'
text = text.replace(rep6_before, rep6_after)

rep6b_before = '[{titulo:"Performance por responsável",dados:rows,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criadas",valor:"CRIADAS"},{label:"Ganhos",valor:"GANHOS"},{label:"Perdas",valor:"PERDAS"},{label:"Win Rate",valor:(x)=>`${x.WIN_RATE}%`},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Ciclo médio",valor:(x)=>`${x.CICLO}d`},{label:"Pipeline",valor:(x)=>moedaRelatorio(x.PIPELINE),html:true}]}],\n'
rep6b_after = '[{titulo:"Performance por responsável",dados:rows,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criadas",valor:"CRIADAS"},{label:"Ganhos",valor:"GANHOS"},{label:"Perdas",valor:"PERDAS"},{label:"Win Rate",valor:(x)=>`${x.WIN_RATE}%`},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Ciclo médio",valor:(x)=>`${x.CICLO}d`},{label:"Pipeline",valor:(x)=>moedaRelatorio(x.PIPELINE),html:true},{label:"Forecast Ponderado",valor:(x)=>moedaRelatorio(x.FORECAST),html:true}]}],\n'
text = text.replace(rep6b_before, rep6b_after)

# 7. Ciclo
rep7_before = 'criarResultadoCatalogo(chave,"Ganhos, perdas e ciclo de vendas","Fechamentos no período selecionado.",\n        [kpi("Fechados",rows.length),kpi("Ganhos",won.length),kpi("Perdas",lost.length),kpi("Win Rate (coorte por fechamento)",`${taxaPct(won.length,rows.length)}%`),kpi("Receita ganha",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Valor perdido",moedaRelatorio(lost.reduce((a,d)=>a+d._VALOR,0))),kpi("Ticket ganho (coorte por fechamento)",moedaRelatorio(won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0)),kpi("Ciclo médio",cs.length?`${Math.round(cs.reduce((a,b)=>a+b,0)/cs.length*10)/10}d`:"—")],\n'
rep7_after = 'const cSort=[...cs].sort((a,b)=>a-b); const mediana=cSort.length?(cSort.length%2===0?(cSort[Math.floor(cSort.length/2)-1]+cSort[Math.floor(cSort.length/2)])/2:cSort[Math.floor(cSort.length/2)]):null;\n      criarResultadoCatalogo(chave,"Ganhos, perdas e ciclo de vendas","Fechamentos no período selecionado.",\n        [kpi("Fechados",rows.length),kpi("Ganhos",won.length),kpi("Perdas",lost.length),kpi("Win Rate (coorte por fechamento)",`${taxaPct(won.length,rows.length)}%`),kpi("Receita ganha",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Valor perdido",moedaRelatorio(lost.reduce((a,d)=>a+d._VALOR,0))),kpi("Ticket ganho (coorte por fechamento)",moedaRelatorio(won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0)),kpi("Ciclo médio",cs.length?`${Math.round(cs.reduce((a,b)=>a+b,0)/cs.length*10)/10}d`:"—"),kpi("Mediana ciclo",mediana!==null?Math.round(mediana*10)/10+"d":"—")],\n'
text = text.replace(rep7_before, rep7_after)

# 8. Origem
rep8_before = 'const m={};ls.forEach((l)=>{const src=String(l.UTM_SOURCE||"").trim()?`UTM: ${l.UTM_SOURCE}`:(om[String(l.SOURCE_ID)]||l.SOURCE_ID||"Sem origem");if(!m[src])m[src]={ORIGEM:src,LEADS:0,LEADS_COM_OPP:0,OPORTUNIDADES:0,GANHOS:0,RECEITA:0};const r=m[src];r.LEADS++;const ds=by[String(l.ID)]||[];if(ds.length)r.LEADS_COM_OPP++;r.OPORTUNIDADES+=ds.length;const w=ds.filter((d)=>d._SEMANTICA==="success");r.GANHOS+=w.length;r.RECEITA+=w.reduce((a,d)=>a+d._VALOR,0)});'
rep8_after = 'const m={};ls.forEach((l)=>{const utmMed=String(l.UTM_MEDIUM||"").trim();const utmCam=String(l.UTM_CAMPAIGN||"").trim();const utmSrc=String(l.UTM_SOURCE||"").trim();const src=utmSrc?`UTM: ${utmSrc}${utmMed?" / "+utmMed:""}${utmCam?" / "+utmCam:""}`:(om[String(l.SOURCE_ID)]||l.SOURCE_ID||"Sem origem");if(!m[src])m[src]={ORIGEM:src,LEADS:0,LEADS_COM_OPP:0,OPORTUNIDADES:0,GANHOS:0,RECEITA:0};const r=m[src];r.LEADS++;const ds=by[String(l.ID)]||[];if(ds.length)r.LEADS_COM_OPP++;r.OPORTUNIDADES+=ds.length;const w=ds.filter((d)=>d._SEMANTICA==="success");r.GANHOS+=w.length;r.RECEITA+=w.reduce((a,d)=>a+d._VALOR,0)});'
text = text.replace(rep8_before, rep8_after)

# 9. Produtos
rep9_before = 'const rows=Object.values(m).map((r)=>({PRODUTO:r.PRODUTO,NEGOCIOS:r.NEGOCIOS.size,QUANTIDADE:Math.round(r.QUANTIDADE*100)/100,RECEITA:r.RECEITA})).sort((a,b)=>b.RECEITA-a.RECEITA);\n      criarResultadoCatalogo(chave,"Produtos e receita","Produtos dos negócios ganhos no período.",\n        [kpi("Deals ganhos",won.length),kpi("Deals com produto",com),kpi("Linhas produto",linhas),kpi("Produtos",rows.length),kpi("Receita linhas",moedaRelatorio(rows.reduce((a,r)=>a+r.RECEITA,0))),kpi("Receita deals",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Deals sem produto",won.length-com),kpi("Cobertura",`${taxaPct(com,won.length)}%`)],\n        [{titulo:"Produtos vendidos",dados:rows,colunas:[{label:"Produto",valor:"PRODUTO"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Quantidade",valor:"QUANTIDADE"},{label:"Receita linhas",valor:(x)=>moedaRelatorio(x.RECEITA),html:true}]}],\n'
rep9_after = 'const rows=Object.values(m).map((r)=>({PRODUTO:r.PRODUTO,NEGOCIOS:r.NEGOCIOS.size,QUANTIDADE:Math.round(r.QUANTIDADE*100)/100,RECEITA:r.RECEITA,TICKET:r.NEGOCIOS.size?r.RECEITA/r.NEGOCIOS.size:0})).sort((a,b)=>b.RECEITA-a.RECEITA);\n      const totalR=rows.reduce((a,r)=>a+r.RECEITA,0); rows.forEach(r=>{r.PARTICIPACAO=totalR?(r.RECEITA/totalR*100).toFixed(1):0});\n      criarResultadoCatalogo(chave,"Produtos e receita","Produtos dos negócios ganhos no período.",\n        [kpi("Deals ganhos",won.length),kpi("Deals com produto",com),kpi("Linhas produto",linhas),kpi("Produtos",rows.length),kpi("Receita linhas",moedaRelatorio(totalR)),kpi("Receita deals",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Deals sem produto",won.length-com),kpi("Cobertura",`${taxaPct(com,won.length)}%`)],\n        [{titulo:"Produtos vendidos",dados:rows,colunas:[{label:"Produto",valor:"PRODUTO"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Quantidade",valor:"QUANTIDADE"},{label:"Receita linhas",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket médio",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Participação",valor:(x)=>x.PARTICIPACAO+"%"}]}],\n'
text = text.replace(rep9_before, rep9_after)

# 10. Clientes
rep10_before = 'const rows=Object.values(m).map((r)=>({...r,TICKET:r.NEGOCIOS?r.RECEITA/r.NEGOCIOS:0})).sort((a,b)=>b.RECEITA-a.RECEITA),total=rows.reduce((a,r)=>a+r.RECEITA,0),top10=rows.slice(0,10).reduce((a,r)=>a+r.RECEITA,0);\n      criarResultadoCatalogo(chave,"Clientes, receita e concentração","Receita pelos negócios ganhos no período.",\n        [kpi("Clientes",rows.length),kpi("Negócios ganhos",won.length),kpi("Receita",moedaRelatorio(total)),kpi("Ticket médio (coorte por fechamento)",moedaRelatorio(won.length?total/won.length:0)),kpi("Clientes recorrentes",rows.filter((r)=>r.NEGOCIOS>1).length),kpi("Receita Top 10",moedaRelatorio(top10)),kpi("Top 10",`${taxaPct(top10,total)}%`),kpi("Maior cliente",rows[0]?.CLIENTE||"—")],\n'
rep10_after = 'const rows=Object.values(m).map((r)=>({...r,TICKET:r.NEGOCIOS?r.RECEITA/r.NEGOCIOS:0})).sort((a,b)=>b.RECEITA-a.RECEITA),total=rows.reduce((a,r)=>a+r.RECEITA,0),top10=rows.slice(0,10).reduce((a,r)=>a+r.RECEITA,0),top5=rows.slice(0,5).reduce((a,r)=>a+r.RECEITA,0),top1=rows.slice(0,1).reduce((a,r)=>a+r.RECEITA,0);\n      criarResultadoCatalogo(chave,"Clientes, receita e concentração","Receita pelos negócios ganhos no período.",\n        [kpi("Clientes",rows.length),kpi("Negócios ganhos",won.length),kpi("Receita",moedaRelatorio(total)),kpi("Ticket médio (coorte por fechamento)",moedaRelatorio(won.length?total/won.length:0)),kpi("Clientes recorrentes",rows.filter((r)=>r.NEGOCIOS>1).length),kpi("Top 1",`${taxaPct(top1,total)}%`),kpi("Top 5",`${taxaPct(top5,total)}%`),kpi("Top 10",`${taxaPct(top10,total)}%`),kpi("Maior cliente",rows[0]?.CLIENTE||"—")],\n'
text = text.replace(rep10_before, rep10_after)

# NEW REPORTS (Cards 21-28)
rep12_before = '    else if(chave==="vendido_faturado"){\n'
rep12_after = '''    else if(chave==="pipeline_novo_gerado"){
      const b=await baseDealsCatalogo(webhook,true),hj=new Date(),isoHj=formatarDataISO(hj),isoSem=formatarDataISO(new Date(hj.setDate(hj.getDate()-hj.getDay()))),isoMes=isoHj.slice(0,7)+"-01";
      let hjV=0,semV=0,mesV=0; const m={};
      b.deals.map(d=>enriquecerDealCatalogo(d,b)).forEach(d=>{
        const dc=parteDataISO(d.DATE_CREATE); if(!dc)return;
        if(dc===isoHj)hjV+=d._VALOR; if(dc>=isoSem)semV+=d._VALOR; if(dc>=isoMes)mesV+=d._VALOR;
        if(dc>=isoMes){const k=d._RESPONSAVEL;(m[k]||={RESPONSAVEL:k,VALOR:0}).VALOR+=d._VALOR;}
      });
      const rows=Object.values(m).sort((a,b)=>b.VALOR-a.VALOR);
      criarResultadoCatalogo(chave,"Pipeline Novo Gerado","Criado no mês atual por vendedor.",
        [kpi("Criado Hoje",moedaRelatorio(hjV)),kpi("Criado Semana",moedaRelatorio(semV)),kpi("Criado Mês",moedaRelatorio(mesV))],
        [{titulo:"Criado no mês por vendedor",dados:rows,colunas:[{label:"Vendedor",valor:"RESPONSAVEL"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="pipeline_carryover"){
      const b=await baseDealsCatalogo(webhook,true), ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)&&d.CLOSEDATE&&d.DATE_MODIFY);
      const rows=ds.filter(d=>parteDataISO(d.DATE_MODIFY)>parteDataISO(d.CLOSEDATE)).map(d=>({DEAL:d.ID,CLIENTE:d._CLIENTE,RESPONSAVEL:d._RESPONSAVEL,CLOSEDATE:parteDataISO(d.CLOSEDATE),MODIFICADO:parteDataISO(d.DATE_MODIFY),VALOR:d._VALOR}));
      criarResultadoCatalogo(chave,"Pipeline Carryover","Negócios abertos modificados após a CLOSEDATE atual. (Limitação: falta snapshots passados de CLOSEDATE)",
        [kpi("Postergados",rows.length),kpi("Valor",moedaRelatorio(rows.reduce((a,r)=>a+r.VALOR,0)))],
        [{titulo:"Negócios postergados (Data modificada > CloseDate)",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"CloseDate",valor:"CLOSEDATE"},{label:"Modificado",valor:"MODIFICADO"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="closedate_intelligence"){
      const b=await baseDealsCatalogo(webhook,true),hj=formatarDataISO(new Date()),ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      let venc=0,vencV=0,sem=0,semV=0; const rows=[];
      ds.forEach(d=>{const cd=parteDataISO(d.CLOSEDATE);if(!cd){sem++;semV+=d._VALOR;rows.push({DEAL:d.ID,CLIENTE:d._CLIENTE,SIT:"Sem CLOSEDATE",VALOR:d._VALOR});}else if(cd<hj){venc++;vencV+=d._VALOR;rows.push({DEAL:d.ID,CLIENTE:d._CLIENTE,SIT:"Vencida",VALOR:d._VALOR});}});
      criarResultadoCatalogo(chave,"CLOSEDATE Intelligence","Higiene de datas no pipeline aberto.",
        [kpi("Vencidas",venc),kpi("Valor Vencido",moedaRelatorio(vencV)),kpi("Sem Data",sem),kpi("Valor Sem Data",moedaRelatorio(semV))],
        [{titulo:"Oportunidades com problema de data",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Situação",valor:"SIT"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="forecast_accuracy"){
      let prev=0,real=0,msg="Dados históricos insuficientes.";
      try{const r=await fetch("relatorios/forecast-semanal/historico.json");if(r.ok){const data=await r.json();if(data.length>0){const ult=data[data.length-1];prev=ult.FORECAST_TOTAL||0;real=ult.FECHADO||0;msg="Snapshot mais recente coletado.";}}}catch(e){}
      criarResultadoCatalogo(chave,"Forecast Accuracy","Comparação contra histórico oficial.",
        [kpi("Última Previsão",prev?moedaRelatorio(prev):"Dados históricos insuficientes"),kpi("Realizado",real?moedaRelatorio(real):"Dados históricos insuficientes"),kpi("Accuracy",prev?`${taxaPct(real,prev)}%`:"Dados históricos insuficientes")],[],msg);
    }
    else if(chave==="opportunity_health_score"){
      const b=await baseDealsCatalogo(webhook,true),hj=new Date(),hjI=formatarDataISO(hj),ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      const rows=ds.map(d=>{
        let s=100; const cd=parteDataISO(d.CLOSEDATE);
        let cV=100; if(!cd){cV-=30;s-=30}else if(cd<hjI){cV-=40;s-=40}
        let aV=100; const mt=parteDataISO(d.MOVED_TIME);if(mt){const ag=Math.floor((hj-new Date(mt+"T12:00:00"))/86400000);if(ag>30){aV-=Math.min(ag,50);s-=Math.min(ag,50);}}
        return{DEAL:d.ID,CLIENTE:d._CLIENTE,SCORE:Math.max(0,s),S_DATE:cV,S_AGING:aV,VALOR:d._VALOR};
      }).sort((a,b)=>b.SCORE-a.SCORE);
      criarResultadoCatalogo(chave,"Opportunity Health Score","Score de 0 a 100 (100 = Base, -Aging, -Atraso Data).",
        [kpi("Oportunidades",rows.length),kpi("Score Médio",rows.length?Math.round(rows.reduce((a,r)=>a+r.SCORE,0)/rows.length):0)],
        [{titulo:"Health Score e decomposição",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Score Total",valor:"SCORE"},{label:"Score Data",valor:"S_DATE"},{label:"Score Aging",valor:"S_AGING"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="pipeline_velocity"){
      const b=await baseDealsCatalogo(webhook,true),co=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>dentroPeriodoCatalogo(d.DATE_CREATE,p)),won=co.filter(d=>d._SEMANTICA==="success"),ab=b.deals.filter(d=>semanticaDeal(d)==="process"),wr=won.length/(won.length+co.filter(d=>d._SEMANTICA==="failure").length)||0,tkm=won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0,cs=won.map(d=>Number(d._CICLO)).filter(Number.isFinite),ciclo=cs.length?cs.reduce((a,c)=>a+c,0)/cs.length:1;
      const vel=ciclo>0?(ab.length*tkm*wr)/ciclo:0;
      criarResultadoCatalogo(chave,"Pipeline Velocity","Velocidade = (Oportunidades × Ticket × Win Rate / Ciclo).",
        [kpi("Velocity",vel?moedaRelatorio(vel):"Não foi possível calcular"),kpi("Oportunidades",ab.length),kpi("Win Rate Histórico",`${Math.round(wr*100)}%`),kpi("Ticket Médio",moedaRelatorio(tkm)),kpi("Ciclo Médio",`${Math.round(ciclo)}d`)],[]);
    }
    else if(chave==="receita_em_risco"){
      const b=await baseDealsCatalogo(webhook,true),hj=new Date(),hjI=formatarDataISO(hj),ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      const rows=ds.map(d=>{const cd=parteDataISO(d.CLOSEDATE),mt=parteDataISO(d.MOVED_TIME),ag=mt?Math.floor((hj-new Date(mt+"T12:00:00"))/86400000):0;const risco=(!cd||cd<hjI||ag>30);return risco?{DEAL:d.ID,CLIENTE:d._CLIENTE,VENDEDOR:d._RESPONSAVEL,ESTAGIO:d._ESTAGIO,SIT:!cd?"Sem data":(cd<hjI?"Vencida":"Aging Alto"),VALOR:d._VALOR}:null;}).filter(Boolean);
      criarResultadoCatalogo(chave,"Receita em Risco","Oportunidades com aging alto ou datas vencidas.",
        [kpi("Oportunidades em Risco",rows.length),kpi("Valor em Risco",moedaRelatorio(rows.reduce((a,r)=>a+r.VALOR,0)))],
        [{titulo:"Receita em risco",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Vendedor",valor:"VENDEDOR"},{label:"Estágio",valor:"ESTAGIO"},{label:"Motivo",valor:"SIT"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }
    else if(chave==="motivos_ganho_perda"){
      criarResultadoCatalogo(chave,"Motivos de Ganho e Perda","Campo de motivo de ganho não disponível no CRM atual.",[],[],"Nenhum campo estruturado de motivo de perda/ganho foi localizado (ausência de UF_CRM mapeado no Bitrix).");
    }
    else if(chave==="vendido_faturado"){
'''
text = text.replace(rep12_before, rep12_after)

with open('js/catalogo-relatorios.js', 'w') as f:
    f.write(text)


with open('js/config.js', 'r') as f:
    text2 = f.read()

rep13_before = '  vendido_faturado: { grupo:"Financeiro × Comercial", label:"💸 Vendido × Faturado", descricao:"Compara o valor das vendas ganhas no Comercial com os registros financeiros de faturamento e NFs.", handler:"catalogo", periodo:"mensal" },\n'
rep13_after = '''  pipeline_novo_gerado: { grupo:"Comercial & Receita", label:"🌱 Pipeline Novo Gerado", descricao:"Novo pipeline criado hoje, na semana e no mês.", handler:"catalogo", periodo:"todas" },
  pipeline_carryover: { grupo:"Comercial & Receita", label:"📅 Pipeline Carryover", descricao:"Negócios cujo fechamento foi postergado.", handler:"catalogo", periodo:"todas" },
  closedate_intelligence: { grupo:"Comercial & Receita", label:"📆 CLOSEDATE Intelligence", descricao:"Higiene de datas no pipeline aberto.", handler:"catalogo", periodo:"todas" },
  forecast_accuracy: { grupo:"Comercial & Receita", label:"🎯 Forecast Accuracy", descricao:"Comparação contra histórico oficial.", handler:"catalogo", periodo:"mensal" },
  opportunity_health_score: { grupo:"Comercial & Receita", label:"❤️ Opportunity Health Score", descricao:"Score de saúde das oportunidades abertas.", handler:"catalogo", periodo:"todas" },
  pipeline_velocity: { grupo:"Comercial & Receita", label:"🚀 Pipeline Velocity", descricao:"Velocidade de conversão do pipeline.", handler:"catalogo", periodo:"mensal" },
  receita_em_risco: { grupo:"Comercial & Receita", label:"⚠️ Receita em Risco", descricao:"Oportunidades abertas com risco.", handler:"catalogo", periodo:"todas" },
  motivos_ganho_perda: { grupo:"Comercial & Receita", label:"📉 Motivos de Ganho e Perda", descricao:"Análise de motivos.", handler:"catalogo", periodo:"todas" },
  vendido_faturado: { grupo:"Financeiro × Comercial", label:"💸 Vendido × Faturado", descricao:"Compara o valor das vendas ganhas no Comercial com os registros financeiros de faturamento e NFs.", handler:"catalogo", periodo:"mensal" },
'''
text2 = text2.replace(rep13_before, rep13_after)

with open('js/config.js', 'w') as f:
    f.write(text2)
