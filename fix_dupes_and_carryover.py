import re

with open('js/config.js', 'r') as f:
    text = f.read()

# The block to remove is the second occurrence of the new configurations.
block_to_remove = '''  pipeline_novo_gerado: { grupo:"Comercial & Receita", label:"🌱 Pipeline Novo Gerado", descricao:"Novo pipeline criado hoje, na semana e no mês.", handler:"catalogo", periodo:"todas" },
  pipeline_carryover: { grupo:"Comercial & Receita", label:"📅 Pipeline Carryover", descricao:"Negócios cujo fechamento foi postergado.", handler:"catalogo", periodo:"todas" },
  closedate_intelligence: { grupo:"Comercial & Receita", label:"📆 CLOSEDATE Intelligence", descricao:"Higiene de datas no pipeline aberto.", handler:"catalogo", periodo:"todas" },
  forecast_accuracy: { grupo:"Comercial & Receita", label:"🎯 Forecast Accuracy", descricao:"Comparação contra histórico oficial.", handler:"catalogo", periodo:"mensal" },
  opportunity_health_score: { grupo:"Comercial & Receita", label:"❤️ Opportunity Health Score", descricao:"Score de saúde das oportunidades abertas.", handler:"catalogo", periodo:"todas" },
  pipeline_velocity: { grupo:"Comercial & Receita", label:"🚀 Pipeline Velocity", descricao:"Velocidade de conversão do pipeline.", handler:"catalogo", periodo:"mensal" },
  receita_em_risco: { grupo:"Comercial & Receita", label:"⚠️ Receita em Risco", descricao:"Oportunidades abertas com risco.", handler:"catalogo", periodo:"todas" },
  motivos_ganho_perda: { grupo:"Comercial & Receita", label:"📉 Motivos de Ganho e Perda", descricao:"Análise de motivos.", handler:"catalogo", periodo:"todas" },
  vendido_faturado: { grupo:"Financeiro × Comercial", label:"💸 Vendido × Faturado", descricao:"Compara o valor das vendas ganhas no Comercial com os registros financeiros de faturamento e NFs.", handler:"catalogo", periodo:"mensal" },
'''

if text.count(block_to_remove) > 1:
    text = text.replace(block_to_remove, "", 1)

with open('js/config.js', 'w') as f:
    f.write(text)

with open('js/catalogo-relatorios.js', 'r') as f:
    text2 = f.read()

block2_to_remove = '''    else if(chave==="pipeline_novo_gerado"){
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
'''

if text2.count(block2_to_remove) > 1:
    text2 = text2.replace(block2_to_remove, "", 1)


# Fix Pipeline Carryover logic to just say insufficient history
carryover_fix_before = '''    else if(chave==="pipeline_carryover"){
      const b=await baseDealsCatalogo(webhook,true), ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)&&d.CLOSEDATE&&d.DATE_MODIFY);
      const rows=ds.filter(d=>parteDataISO(d.DATE_MODIFY)>parteDataISO(d.CLOSEDATE)).map(d=>({DEAL:d.ID,CLIENTE:d._CLIENTE,RESPONSAVEL:d._RESPONSAVEL,CLOSEDATE:parteDataISO(d.CLOSEDATE),MODIFICADO:parteDataISO(d.DATE_MODIFY),VALOR:d._VALOR}));
      criarResultadoCatalogo(chave,"Pipeline Carryover","Negócios abertos modificados após a CLOSEDATE atual. (Limitação: falta snapshots passados de CLOSEDATE)",
        [kpi("Postergados",rows.length),kpi("Valor",moedaRelatorio(rows.reduce((a,r)=>a+r.VALOR,0)))],
        [{titulo:"Negócios postergados (Data modificada > CloseDate)",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"CloseDate",valor:"CLOSEDATE"},{label:"Modificado",valor:"MODIFICADO"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }'''

carryover_fix_after = '''    else if(chave==="pipeline_carryover"){
      criarResultadoCatalogo(chave,"Pipeline Carryover","Histórico insuficiente para identificar carryover com segurança.",
        [kpi("Postergados","Dados históricos insuficientes"),kpi("Valor","Dados históricos insuficientes")],
        [], "A arquitetura atual não armazena snapshots do CLOSEDATE de cada negócio (somente agregados no historico.json).");
    }'''

text2 = text2.replace(carryover_fix_before, carryover_fix_after)

# Fix Health Score Configuration Weight logic to be centralized/documented
health_score_fix_before = '''    else if(chave==="opportunity_health_score"){
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
    }'''

health_score_fix_after = '''    else if(chave==="opportunity_health_score"){
      const b=await baseDealsCatalogo(webhook,true),hj=new Date(),hjI=formatarDataISO(hj),ds=b.deals.map(d=>enriquecerDealCatalogo(d,b)).filter(d=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));
      const PESOS_HEALTH = {
        PUNICAO_SEM_DATA: Number(document.getElementById("healthPesoSemData")?.value) || 30,
        PUNICAO_DATA_VENCIDA: Number(document.getElementById("healthPesoDataVencida")?.value) || 40,
        LIMIAR_AGING: Number(document.getElementById("healthLimiarAging")?.value) || 30,
        MAX_PUNICAO_AGING: Number(document.getElementById("healthMaxPunicaoAging")?.value) || 50
      };
      const rows=ds.map(d=>{
        let s=100; const cd=parteDataISO(d.CLOSEDATE);
        let cV=100; if(!cd){cV-=PESOS_HEALTH.PUNICAO_SEM_DATA;s-=PESOS_HEALTH.PUNICAO_SEM_DATA}else if(cd<hjI){cV-=PESOS_HEALTH.PUNICAO_DATA_VENCIDA;s-=PESOS_HEALTH.PUNICAO_DATA_VENCIDA}
        let aV=100; const mt=parteDataISO(d.MOVED_TIME);if(mt){const ag=Math.floor((hj-new Date(mt+"T12:00:00"))/86400000);if(ag>PESOS_HEALTH.LIMIAR_AGING){aV-=Math.min(ag,PESOS_HEALTH.MAX_PUNICAO_AGING);s-=Math.min(ag,PESOS_HEALTH.MAX_PUNICAO_AGING);}}
        return{DEAL:d.ID,CLIENTE:d._CLIENTE,SCORE:Math.max(0,s),S_DATE:cV,S_AGING:aV,VALOR:d._VALOR};
      }).sort((a,b)=>b.SCORE-a.SCORE);
      criarResultadoCatalogo(chave,"Opportunity Health Score","Score de 0 a 100 baseado em pesos centralizados e parametrizáveis.",
        [kpi("Oportunidades",rows.length),kpi("Score Médio",rows.length?Math.round(rows.reduce((a,r)=>a+r.SCORE,0)/rows.length):0)],
        [{titulo:"Health Score e decomposição",dados:rows,colunas:[{label:"Deal",valor:"DEAL"},{label:"Cliente",valor:"CLIENTE"},{label:"Score Total",valor:"SCORE"},{label:"Score Data",valor:"S_DATE"},{label:"Score Aging",valor:"S_AGING"},{label:"Valor",valor:x=>moedaRelatorio(x.VALOR),html:true}]}]);
    }'''

text2 = text2.replace(health_score_fix_before, health_score_fix_after)


with open('js/catalogo-relatorios.js', 'w') as f:
    f.write(text2)
