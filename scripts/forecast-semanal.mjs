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
// -----------------------------------------------------------------------------

import { mkdir, writeFile } from "node:fs/promises";

const WEBHOOK = process.env.BITRIX_WEBHOOK_URL;
if (!WEBHOOK) {
  console.error("BITRIX_WEBHOOK_URL nao definido. Configure como Secret do repositorio.");
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

// Estagios "Piloto" da categoria Comercial: nunca entram no pipeline aberto.
const STAGE_IDS_PILOTO = new Set(["UC_R1YAOS"]);

// Fallback de probabilidade por estagio da categoria Comercial (mesma regra de
// probabilidadeFallbackForecast() do extrator, aplicada por STAGE_ID em vez de
// por texto do label, ja que os STAGE_ID desta categoria sao fixos e conhecidos).
const FALLBACK_PROBABILIDADE_POR_ESTAGIO = {
  UC_A0VPC5: 20, // Nova Oportunidade
  NEW: 60,       // Proposta Enviada
  UC_5X3WZN: 40, // Call/Visita Agendada
  UC_R1YAOS: 80, // Piloto (excluido do pipeline aberto; mantido so por completude)
};

// Metas mensais padrao do forecast Comercial (R$) - mesma tabela do extrator.
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
    if (STAGE_IDS_PILOTO.has(String(d.STAGE_ID))) continue; // sem pilotos no pipeline aberto

    const closeDate = parteDataISO(d.CLOSEDATE);
    if (!closeDate) continue;

    const probInformada = Number(d.PROBABILITY);
    const prob = Number.isFinite(probInformada) && probInformada > 0 && probInformada <= 100
      ? probInformada
      : (FALLBACK_PROBABILIDADE_POR_ESTAGIO[String(d.STAGE_ID)] ?? 30);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
