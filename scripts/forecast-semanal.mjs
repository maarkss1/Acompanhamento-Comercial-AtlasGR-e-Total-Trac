#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Gera o relatorio de Forecast semanal - Comercial chamando o Bitrix direto
// (fora do navegador), espelhando a logica do extrator (Relatorios AtlasGR.html):
// mesma tabela de metas mensais padrao, mesma exclusao de estagios "Piloto" do
// pipeline aberto, mesmo fallback de probabilidade por estagio quando o Bitrix
// nao tem PROBABILITY preenchida.
//
// Salva o relatorio em relatorios/forecast-semanal/AAAA-MM-DD.md (+ latest.md)
// e, se as variaveis de SMTP estiverem configuradas, envia por e-mail.
//
// Variaveis de ambiente esperadas (configuradas como Secrets no GitHub):
//   BITRIX_WEBHOOK_URL   - obrigatoria
//   SMTP_HOST            - opcional (sem ela, o e-mail nao e enviado)
//   SMTP_PORT            - opcional, padrao 465
//   SMTP_USER            - obrigatoria se SMTP_HOST estiver definida
//   SMTP_PASS            - obrigatoria se SMTP_HOST estiver definida (senha de app)
//   SMTP_FROM            - opcional, padrao = SMTP_USER
//   FORECAST_DESTINATARIOS - opcional, sobrescreve a lista padrao de e-mails
//   ALERTA_WEBHOOK_URL   - opcional, URL de incoming webhook (Slack/Teams/
//                          compativel com {"text": "..."}) para avisar de
//                          forma proativa quando a projecao do mes NAO esta
//                          batendo a meta, sem depender de alguem abrir o
//                          e-mail. Sem essa variavel, o alerta e so pulado.
// -----------------------------------------------------------------------------

import { mkdir, writeFile, readFile } from "node:fs/promises";

const WEBHOOK = process.env.BITRIX_WEBHOOK_URL || "https://atlasgr.bitrix24.com.br/rest/450/gr94fas79p1nizci/";
if (!WEBHOOK) {
  console.error("BITRIX_WEBHOOK_URL nao definido.");
  process.exit(1);
}

const DESTINATARIOS_PADRAO = [
  "marcelo.nascimento@atlasgr.com",
  "murilo.marques@atlasgr.com.br",
  "comercial@atlasgr.com.br",
];

// Categoria Comercial no Bitrix da AtlasGR (ver PIPELINE_MAPPING.md /
// ENTIDADES.negocios.categorias em Relatorios AtlasGR.html).
const CATEGORIA_COMERCIAL = "0";

// ⚠️ Estagios "Piloto": nunca entram no pipeline aberto. FONTE DA VERDADE =
// STAGE_IDS_PILOTO em js/jornada.js (Relatorios AtlasGR.html) — este script
// Node roda fora do navegador (GitHub Actions) e nao compartilha modulo com o
// HTML (sem bundler neste projeto), entao a lista precisa ser copiada
// manualmente sempre que mudar no navegador.
const STAGE_IDS_PILOTO = new Set(["UC_R1YAOS", "UC_JWY0OY", "UC_AM8GK1", "UC_I37148", "UC_EU6LUO", "UC_WBYFT4", "UC_QT3CO8"]);

// Normaliza texto (remove acentos, minusculas, colapsa espacos) - identico a
// normalizarTextoChave() em js/jornada.js.
function normalizarTextoChave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ⚠️ Réplica manual de ehEstagioPiloto() em js/jornada.js.
function ehEstagioPiloto(stageId, stageLabel) {
  if (stageId != null && STAGE_IDS_PILOTO.has(String(stageId))) return true;
  return normalizarTextoChave(stageLabel || "").includes("piloto");
}

// ⚠️ Réplica manual de probabilidadeFallbackForecast() em js/jornada.js —
// mesma regra baseada em texto do label do estagio (nao mais por STAGE_ID
// fixo, para nao divergir quando o Bitrix ganhar/renomear estagios). Os
// labels sao buscados em tempo de execucao via crm.status.list (ver
// buscarLabelsEstagiosComercial()).
function probabilidadeFallbackForecast(label, semantica) {
  if (semantica === "success") return 100;
  if (semantica === "failure") return 0;
  const n = normalizarTextoChave(label);
  if (/assinatura|contrato assinado|piloto|termo aceito/.test(n)) return 80;
  if (/proposta|negociacao|negociação/.test(n)) return 60;
  if (/call|visita|reuniao|reunião|diagnostico|diagnóstico/.test(n)) return 40;
  if (/nova oportunidade|novo|entrada/.test(n)) return 20;
  return 30;
}

// ⚠️ Estes valores devem ser mantidos idênticos a METAS_FORECAST_MENSAL_PADRAO
// em js/config.js — não há compartilhamento de módulo entre o navegador
// (Relatorios AtlasGR.html, scripts classicos) e este script Node (roda fora
// do navegador via GitHub Actions). Ao mudar uma meta aqui, replique
// manualmente no outro arquivo.
const METAS_FORECAST_MENSAL_PADRAO = {
  1: 13650.0, 2: 27300.0, 3: 38500.0, 4: 27300.0, 5: 27300.0, 6: 27300.0,
  7: 27300.0, 8: 34845.7, 9: 40470.7, 10: 40520.7, 11: 34845.7, 12: 21195.7,
};

function baseUrl() {
  return WEBHOOK.replace(/\/$/, "");
}

async function chamarBitrix(metodo, params = {}) {
  const resposta = await fetch(`${baseUrl()}/${metodo}.json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const corpo = await resposta.json();
  if (corpo.error) {
    throw new Error(`Bitrix ${metodo}: ${corpo.error} - ${corpo.error_description || ""}`);
  }
  return corpo;
}

async function listarCompleto(metodo, params) {
  let start = 0;
  let acumulado = [];
  for (;;) {
    const corpo = await chamarBitrix(metodo, { ...params, start });
    acumulado = acumulado.concat(corpo.result || []);
    if (corpo.next === undefined || corpo.next === null) break;
    start = corpo.next;
  }
  return acumulado;
}

function dataISOemSaoPaulo(data = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(data); // AAAA-MM-DD
}
function segundaDaSemana(isoData) {
  const [ano, mes, dia] = isoData.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const diaSemana = d.getUTCDay(); // 0 = domingo
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return d.toISOString().slice(0, 10);
}
function somarDias(isoData, dias) {
  const [ano, mes, dia] = isoData.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}
function parteDataISO(valor) {
  const s = String(valor || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
function dentroFaixa(valor, inicio, fim) {
  const d = parteDataISO(valor);
  return !!d && (!inicio || d >= inicio) && (!fim || d <= fim);
}
function moeda(valor) {
  return "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatarDataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function metaMensalPadrao(isoData) {
  const mes = Number((isoData || "").slice(5, 7));
  return METAS_FORECAST_MENSAL_PADRAO[mes] || 0;
}
function setaAtingimento(realizado, meta, projetado) {
  if (!meta) return "—";
  const noCaminho = realizado >= meta || projetado >= meta;
  return noCaminho ? "🟢⬆️ no caminho da meta" : "🔴⬇️ abaixo da meta";
}
function pctAtingimento(realizado, meta) {
  if (!meta) return null;
  return Math.round((realizado / meta) * 1000) / 10;
}

// Busca os labels dos estagios da categoria Comercial (CATEGORY_ID=0) via
// crm.status.list (ENTITY_ID="DEAL_STAGE"), para alimentar
// probabilidadeFallbackForecast() com o mesmo texto que o navegador usa —
// mesmo padrao de buscarMetadadosFunisEEstagios() em js/jornada.js.
// v20 — historico persistido no proprio repo (uma "foto" por execucao), para
// alimentar uma secao de tendencia no relatorio semanal. Como esta automacao
// nao tem banco de dados, o historico e so este arquivo JSON versionado.
const HISTORICO_PATH = "relatorios/forecast-semanal/historico.json";
async function carregarHistorico() {
  try {
    return JSON.parse(await readFile(HISTORICO_PATH, "utf8"));
  } catch (e) {
    return [];
  }
}
async function salvarHistorico(lista) {
  await mkdir("relatorios/forecast-semanal", { recursive: true });
  await writeFile(HISTORICO_PATH, JSON.stringify(lista, null, 2) + "\n", "utf8");
}
function linhasTendenciaMarkdown(historico) {
  const pts = historico.slice(-8);
  if (pts.length < 2) {
    return "_Tendência aparece a partir da 2ª execução automática (ainda não há histórico suficiente)._";
  }
  const linhas = ["| Data | Meta mensal | Fechado no mês | Projeção | Atingimento |", "|---|---|---|---|---|"];
  pts.forEach((p) => {
    linhas.push(`| ${formatarDataBR(p.data)} | ${moeda(p.metaMensal)} | ${moeda(p.fechadoMes)} | ${moeda(p.projecaoMes)} | ${p.atingimentoMensalPct == null ? "—" : `${p.atingimentoMensalPct}%`} |`);
  });
  return linhas.join("\n");
}

// v20 — alerta proativo opcional (Slack/Teams via incoming webhook): so envia
// quando ha algo que exige atencao (projecao do mes fora do caminho da meta,
// ou a propria geracao falhou), para nao virar ruido de notificacao toda
// semana. Falha ao enviar o alerta nunca deve derrubar o resto do script.
async function enviarAlertaSeConfigurado(texto) {
  const url = process.env.ALERTA_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: texto }),
    });
    console.log("Alerta proativo enviado (ALERTA_WEBHOOK_URL).");
  } catch (e) {
    console.warn(`Falha ao enviar alerta proativo, seguindo sem interromper (${e.message}).`);
  }
}

async function buscarLabelsEstagiosComercial() {
  try {
    const corpo = await chamarBitrix("crm.status.list", { filter: { ENTITY_ID: "DEAL_STAGE" }, order: { SORT: "ASC" } });
    const labels = {};
    (corpo.result || []).forEach((st) => { labels[String(st.STATUS_ID)] = st.NAME || st.STATUS_ID; });
    return labels;
  } catch (e) {
    console.warn(`Nao foi possivel buscar os labels dos estagios (crm.status.list): ${e.message}. Fallback de probabilidade usara "" como label (equivale ao default de 30%).`);
    return {};
  }
}

async function main() {
  const hojeISO = dataISOemSaoPaulo();
  const inicioSemana = segundaDaSemana(hojeISO);
  const fimSemana = somarDias(inicioSemana, 6);
  const [ano, mes] = fimSemana.split("-").map(Number);
  const mesInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const mesFim = ultimoDiaDoMes(ano, mes);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const semanasNoMes = Math.ceil(diasNoMes / 7);
  const metaMensal = metaMensalPadrao(fimSemana);
  const metaSemanal = metaMensal > 0 ? Math.round((metaMensal / semanasNoMes) * 100) / 100 : 0;

  console.log(`Semana: ${inicioSemana} a ${fimSemana} | Mes: ${mesInicio} a ${mesFim} (${semanasNoMes} semana(s))`);

  const campos = ["ID", "TITLE", "STAGE_ID", "STAGE_SEMANTIC_ID", "PROBABILITY", "OPPORTUNITY", "ASSIGNED_BY_ID", "CLOSEDATE", "MOVED_TIME"];
  const deals = await listarCompleto("crm.deal.list", {
    filter: { CATEGORY_ID: CATEGORIA_COMERCIAL },
    select: campos,
    order: { ID: "ASC" },
  });
  console.log(`Negocios no pipeline Comercial: ${deals.length}`);

  const usuarios = await listarCompleto("user.get", { FILTER: { ACTIVE: true } });
  const nomeUsuario = {};
  usuarios.forEach((u) => {
    nomeUsuario[String(u.ID)] = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `ID ${u.ID}`;
  });

  const labelsEstagio = await buscarLabelsEstagiosComercial();

  let fechadoSemana = 0, fechadoMes = 0;
  let pipelineAbertoSemana = 0, pipelinePonderadoSemana = 0;
  let pipelinePonderadoMes = 0;
  const negociosPrevistosSemana = [];

  for (const d of deals) {
    const semantic = String(d.STAGE_SEMANTIC_ID || "").toLowerCase();
    const semantica = semantic === "s" || semantic === "success" ? "success"
      : semantic === "f" || semantic === "failure" || semantic === "apology" ? "failure"
      : "process";
    const valor = Number(d.OPPORTUNITY) || 0;

    if (semantica === "success") {
      if (dentroFaixa(d.CLOSEDATE, inicioSemana, fimSemana)) fechadoSemana += valor;
      if (dentroFaixa(d.CLOSEDATE, mesInicio, mesFim)) fechadoMes += valor;
      continue;
    }
    if (semantica !== "process") continue;
    const stageLabel = labelsEstagio[String(d.STAGE_ID)] || "";
    if (ehEstagioPiloto(d.STAGE_ID, stageLabel)) continue; // sem pilotos no pipeline aberto

    const closeDate = parteDataISO(d.CLOSEDATE);
    if (!closeDate) continue;

    const probInformada = Number(d.PROBABILITY);
    const prob = Number.isFinite(probInformada) && probInformada > 0 && probInformada <= 100
      ? probInformada
      : probabilidadeFallbackForecast(stageLabel, semantica);
    const ponderado = valor * prob / 100;

    if (dentroFaixa(closeDate, mesInicio, mesFim)) {
      pipelinePonderadoMes += ponderado;
    }
    if (dentroFaixa(closeDate, inicioSemana, fimSemana)) {
      pipelineAbertoSemana += valor;
      pipelinePonderadoSemana += ponderado;
      negociosPrevistosSemana.push({
        id: d.ID,
        titulo: d.TITLE || "",
        responsavel: nomeUsuario[String(d.ASSIGNED_BY_ID)] || "Sem responsável",
        valor, prob, ponderado, closeDate,
      });
    }
  }
  negociosPrevistosSemana.sort((a, b) => b.valor - a.valor);

  const projecaoSemana = fechadoSemana + pipelinePonderadoSemana;
  const projecaoMes = fechadoMes + pipelinePonderadoMes;
  const atingimentoSemanalPct = pctAtingimento(fechadoSemana, metaSemanal);
  const atingimentoMensalPct = pctAtingimento(fechadoMes, metaMensal);
  const noCaminhoMensal = metaMensal > 0 && (fechadoMes >= metaMensal || projecaoMes >= metaMensal);

  // v20 — grava a "foto" de hoje no historico versionado e monta a secao de
  // tendencia das ultimas execucoes para o relatorio.
  const historico = await carregarHistorico();
  if (metaMensal > 0) {
    const idx = historico.findIndex((x) => x.data === hojeISO);
    const snapshot = { data: hojeISO, metaMensal, fechadoMes, projecaoMes, atingimentoMensalPct };
    if (idx >= 0) historico[idx] = snapshot; else historico.push(snapshot);
    historico.sort((a, b) => a.data.localeCompare(b.data));
    await salvarHistorico(historico);
  }

  const geradoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date());

  const linhas = [];
  linhas.push("# Forecast semanal — Comercial");
  linhas.push("");
  linhas.push(`**Semana:** ${formatarDataBR(inicioSemana)} a ${formatarDataBR(fimSemana)}  `);
  linhas.push(`**Gerado em:** ${geradoEm} (America/Sao_Paulo)`);
  linhas.push("");
  linhas.push("## Metas (semanal e mensal)");
  linhas.push("");
  linhas.push("| | Meta | Entregue | Projeção | Atingimento | Tendência |");
  linhas.push("|---|---|---|---|---|---|");
  linhas.push(
    `| **Semanal** | ${moeda(metaSemanal)} | ${moeda(fechadoSemana)} | ${moeda(projecaoSemana)} | ` +
    `${atingimentoSemanalPct === null ? "—" : `${atingimentoSemanalPct}%`} | ${setaAtingimento(fechadoSemana, metaSemanal, projecaoSemana)} |`
  );
  linhas.push(
    `| **Mensal (${String(mes).padStart(2, "0")}/${ano})** | ${moeda(metaMensal)} | ${moeda(fechadoMes)} | ${moeda(projecaoMes)} | ` +
    `${atingimentoMensalPct === null ? "—" : `${atingimentoMensalPct}%`} | ${setaAtingimento(fechadoMes, metaMensal, projecaoMes)} |`
  );
  linhas.push("");
  linhas.push(`_Meta semanal = meta mensal ÷ ${semanasNoMes} semana(s) do mês. Projeção = fechado + pipeline aberto ponderado (sem estágios "Piloto"). Tendência considera o entregue OU a projeção — qualquer um dos dois batendo a meta já marca 🟢._`);
  linhas.push("");
  linhas.push("## Tendência (últimas execuções automáticas)");
  linhas.push("");
  linhas.push(linhasTendenciaMarkdown(historico));
  linhas.push("");
  linhas.push("## Pipeline aberto da semana");
  linhas.push("");
  linhas.push(`- Pipeline aberto bruto (sem pilotos): ${moeda(pipelineAbertoSemana)}`);
  linhas.push(`- Pipeline aberto ponderado por probabilidade: ${moeda(pipelinePonderadoSemana)}`);
  linhas.push("");
  if (negociosPrevistosSemana.length) {
    linhas.push(`## Negócios previstos para a semana (${negociosPrevistosSemana.length})`);
    linhas.push("");
    linhas.push("| Deal | Título | Responsável | CLOSEDATE | Valor | Prob. | Ponderado |");
    linhas.push("|---|---|---|---|---|---|---|");
    negociosPrevistosSemana.forEach((n) => {
      const tituloSeguro = n.titulo.replace(/\|/g, "/");
      linhas.push(`| ${n.id} | ${tituloSeguro} | ${n.responsavel} | ${formatarDataBR(n.closeDate)} | ${moeda(n.valor)} | ${n.prob}% | ${moeda(n.ponderado)} |`);
    });
  } else {
    linhas.push("_Nenhum negócio aberto com CLOSEDATE previsto para esta semana (fora os estágios Piloto, que ficam de fora)._");
  }
  linhas.push("");

  const conteudo = linhas.join("\n");

  await mkdir("relatorios/forecast-semanal", { recursive: true });
  await writeFile(`relatorios/forecast-semanal/${fimSemana}.md`, conteudo, "utf8");
  await writeFile("relatorios/forecast-semanal/latest.md", conteudo, "utf8");
  console.log(`Relatorio salvo em relatorios/forecast-semanal/${fimSemana}.md`);

  await enviarPorEmailSeConfigurado(conteudo, inicioSemana, fimSemana);

  // v20 — alerta proativo: só dispara quando a projeção do mês NÃO está no
  // caminho da meta, pra virar notificação (Slack/Teams) sem precisar abrir
  // o e-mail semanal para descobrir que algo está fora do previsto.
  if (metaMensal > 0 && !noCaminhoMensal) {
    await enviarAlertaSeConfigurado(
      `⚠️ *Forecast Comercial* — projeção do mês (${moeda(projecaoMes)}) está abaixo da meta de ${moeda(metaMensal)} ` +
      `(faltam ${moeda(Math.max(0, metaMensal - projecaoMes))} na projeção). ` +
      `Fechado até agora: ${moeda(fechadoMes)}${atingimentoMensalPct === null ? "" : ` (${atingimentoMensalPct}%)`}.`
    );
  }
}

async function enviarPorEmailSeConfigurado(conteudoMarkdown, inicioSemana, fimSemana) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log("SMTP_HOST nao configurado — pulando envio de e-mail (relatorio so foi salvo no repositorio).");
    return;
  }
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.error("SMTP_HOST definido, mas SMTP_USER/SMTP_PASS estao faltando. E-mail nao enviado.");
    return;
  }
  const destinatarios = (process.env.FORECAST_DESTINATARIOS
    ? process.env.FORECAST_DESTINATARIOS.split(",").map((s) => s.trim()).filter(Boolean)
    : DESTINATARIOS_PADRAO);

  const { default: nodemailer } = await import("nodemailer");
  const transportador = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user, pass },
  });

  const htmlSimples = "<pre style=\"font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;\">"
    + conteudoMarkdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    + "</pre>";

  await transportador.sendMail({
    from: process.env.SMTP_FROM || user,
    to: destinatarios.join(", "),
    subject: `Forecast semanal — Comercial (${formatarDataBR(inicioSemana)} a ${formatarDataBR(fimSemana)})`,
    text: conteudoMarkdown,
    html: htmlSimples,
  });
  console.log(`E-mail enviado para: ${destinatarios.join(", ")}`);
}

main().catch(async (e) => {
  console.error(e);
  await enviarAlertaSeConfigurado(`🔴 *Forecast Comercial* — a geração automática falhou: ${e.message}`);
  process.exit(1);
});
