// ---------------------------------------------------------------------------
// Faturamento Médio (3 meses) — cruza os arquivos de "Vendido x Faturado" (um
// export HTML por vendedor, planilha do Google Sheets) com os negócios do
// funil Comercial no Bitrix, calcula a média de faturamento dos primeiros
// meses de cada cliente e permite gravar essa média num campo personalizado
// do negócio no Bitrix — pra usar como referência ao ajustar o valor do
// negócio no orçamento/forecast.
//
// Regra da média (definida pelo usuário): as colunas de mês nos arquivos são
// relativas ao início da cobrança de cada cliente (mês 1 = primeiro mês
// faturado), não mês calendário. Se o mês 1 já veio próximo do valor fechado
// (>= limiar configurável, padrão 85%), a média usa os meses 1-2-3. Senão,
// o mês 1 é tratado como pro rata (parcial) e a média usa os meses 2-3-4.
//
// Escrita real no Bitrix (cria campo + atualiza negócios): só executa com
// "Habilitar escrita no Bitrix" marcado — mesmo padrão de opt-in explícito já
// usado em js/temperatura-lead.js e js/pipeline-financeiro-acompanhamento.js.
// ---------------------------------------------------------------------------

const FM_CATEGORIA_COMERCIAL = "0";
const FM_FIELD_NAME = "UF_CRM_FATURAMENTO_MEDIO_3M";
const FM_FIELD_XML_ID = "FATURAMENTO_MEDIO_3M_ATLAS";

const fmState = {
  arquivos: [],       // [{ vendedor, clientes: [...] }] — um item por arquivo carregado
  negociosPorEmpresa: {}, // chave normalizada do nome da empresa -> [deal,...]
  campo: null,         // { fieldName, id } depois de confirmado no Bitrix
  limiarPct: 85,
  pendentes: {},        // { dealId: mediaCalculada } — ainda não salvo no Bitrix
  carregando: false,
};

// ---------------------------------------------------------------------------
// Parser dos arquivos HTML (planilha exportada) — encontra a coluna
// FATURAMENTO pelo texto do cabeçalho (não por índice fixo), porque o layout
// varia um pouco entre vendedores (alguns têm colunas extras de detalhe por
// produto a partir do mês 9). Só precisamos dos meses 1-4, que ficam sempre
// logo em seguida de FATURAMENTO em todos os arquivos conferidos.
// ---------------------------------------------------------------------------

function fmParseValorBR(txt) {
  const t = String(txt || "").trim();
  if (!t || t === "-") return null;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmParseArquivoFaturamento(nomeArquivo, htmlTexto) {
  const doc = new DOMParser().parseFromString(htmlTexto, "text/html");
  const linhas = [...doc.querySelectorAll("table tr")];
  let indiceCabecalho = -1, colVendas = -1, colFaturamento = -1;
  const colNome = 1;
  linhas.forEach((tr, i) => {
    const celulas = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
    const iFaturamento = celulas.indexOf("FATURAMENTO");
    if (iFaturamento !== -1) {
      indiceCabecalho = i;
      colFaturamento = iFaturamento;
      colVendas = celulas.indexOf("VENDAS");
    }
  });
  if (indiceCabecalho === -1) {
    throw new Error(`"${nomeArquivo}": não encontrei a coluna "FATURAMENTO" — confira se é um export de Vendido x Faturado por vendedor (planilha do Google Sheets, "Baixar > Página da Web").`);
  }
  const vendedor = nomeArquivo.replace(/\.html?$/i, "").trim();
  const clientes = [];
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const celulas = [...linhas[i].querySelectorAll("td")].map((td) => td.textContent.trim());
    const nome = celulas[colNome];
    if (!nome) continue; // linha vazia/separadora
    const vendas = colVendas !== -1 ? fmParseValorBR(celulas[colVendas]) : null;
    const meses = [1, 2, 3, 4].map((n) => fmParseValorBR(celulas[colFaturamento + n]));
    if (vendas == null && meses.every((m) => m == null)) continue; // linha em branco
    clientes.push({ vendedor, cliente: nome, vendas, meses });
  }
  return clientes;
}

async function fmLerArquivos(fileList) {
  const arquivos = [];
  const erros = [];
  for (const file of fileList) {
    try {
      const texto = await file.text();
      const clientes = fmParseArquivoFaturamento(file.name, texto);
      if (clientes.length) arquivos.push({ vendedor: clientes[0].vendedor, clientes });
    } catch (e) {
      erros.push(e.message);
    }
  }
  return { arquivos, erros };
}

// ---------------------------------------------------------------------------
// Regra da média
// ---------------------------------------------------------------------------

function fmCalcularMedia(cliente, limiarPct) {
  const { vendas, meses } = cliente; // meses = [mes1, mes2, mes3, mes4] (relativos ao início da cobrança)
  const mes1 = meses[0];
  const pertoDoContrato = vendas > 0 && mes1 != null && (mes1 / vendas) * 100 >= limiarPct;
  const janela = pertoDoContrato ? meses.slice(0, 3) : meses.slice(1, 4);
  const rotuloJanela = pertoDoContrato ? "Meses 1-2-3" : "Meses 2-3-4 (mês 1 pro rata, ignorado)";
  const valores = janela.filter((v) => v != null);
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
  return { media, pertoDoContrato, rotuloJanela, amostraMeses: valores.length };
}

// ---------------------------------------------------------------------------
// Campo personalizado no Bitrix (detectar / criar) — numérico (currency),
// sem opções de lista (diferente do campo de Temperatura do Lead).
// ---------------------------------------------------------------------------

async function fmBuscarCampoExistente(webhook) {
  const body = await bitrixPostJsonComRetentativa(webhook, "crm.userfield.list", {
    filter: { "=ENTITY_ID": "CRM_DEAL", "=FIELD_NAME": FM_FIELD_NAME },
  });
  const campos = body?.result || [];
  return campos.find((f) => String(f.FIELD_NAME) === FM_FIELD_NAME) || null;
}

async function fmCriarCampoNoBitrix(webhook) {
  const fields = {
    ENTITY_ID: "CRM_DEAL",
    FIELD_NAME: FM_FIELD_NAME.replace(/^UF_CRM_/, ""),
    USER_TYPE_ID: "double",
    XML_ID: FM_FIELD_XML_ID,
    MULTIPLE: "N",
    MANDATORY: "N",
    SHOW_FILTER: "Y",
    SHOW_IN_LIST: "Y",
    EDIT_IN_LIST: "Y",
    IS_SEARCHABLE: "N",
    EDIT_FORM_LABEL: { en: "Avg. Monthly Revenue (3m)", br: "Faturamento Médio (3 meses)", pt: "Faturamento Médio (3 meses)" },
    LIST_COLUMN_LABEL: { en: "Avg. Revenue (3m)", br: "Faturamento Médio (3m)", pt: "Faturamento Médio (3m)" },
    LIST_FILTER_LABEL: { en: "Avg. Revenue (3m)", br: "Faturamento Médio (3m)", pt: "Faturamento Médio (3m)" },
    SETTINGS: { PRECISION: 2 },
  };
  const body = await bitrixPostJsonComRetentativa(webhook, "crm.userfield.add", { fields });
  if (!body?.result) throw new Error('O Bitrix não retornou o ID do campo criado (crm.userfield.add). Confira se o webhook tem permissão de escrita em "CRM" (campos personalizados).');
  return body.result;
}

async function fmGarantirCampo(webhook, { criar }) {
  let campoBitrix = await fmBuscarCampoExistente(webhook);
  if (!campoBitrix) {
    if (!criar) return null;
    await fmCriarCampoNoBitrix(webhook);
    campoBitrix = await fmBuscarCampoExistente(webhook);
    if (!campoBitrix) throw new Error('Campo criado, mas não foi possível confirmá-lo logo em seguida (crm.userfield.list). Clique em "↻ Cruzar com o Bitrix" novamente em alguns segundos.');
  }
  return { fieldName: FM_FIELD_NAME, id: campoBitrix.ID };
}

// ---------------------------------------------------------------------------
// Negócios do Bitrix (funil Comercial, qualquer estágio) — pra cruzar por
// empresa. Nome da empresa casado por texto normalizado; quando não bate
// exato, tenta um "contém" nos dois sentidos (nomes de planilha e Bitrix
// raramente são idênticos) — sempre mostrado ao usuário pra conferência
// visual antes de qualquer gravação, nunca aplicado às cegas.
// ---------------------------------------------------------------------------

async function fmBuscarNegociosComercial(webhook) {
  const campos = ["ID", "TITLE", "STAGE_ID", "CATEGORY_ID", "OPPORTUNITY", "CURRENCY_ID", "ASSIGNED_BY_ID", "COMPANY_ID", "STAGE_SEMANTIC_ID"];
  const filtro = { CATEGORY_ID: FM_CATEGORIA_COMERCIAL };
  const [meta, busca] = await Promise.all([
    buscarMetadadosFunisEEstagios(webhook),
    listarCompletoRelatorio(webhook, "crm.deal.list", campos, filtro, { ID: "ASC" }, "Faturamento Médio: buscando negócios do Comercial..."),
  ]);
  const idsEmpresa = [...new Set(busca.dados.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  const empresas = await buscarEntidadesPorIds(webhook, "crm.company.list", idsEmpresa, ["ID", "TITLE"]);
  const base = { meta, empresas };
  const negociosPorEmpresa = {};
  busca.dados.forEach((d) => {
    if (!idBitrixValido(d.COMPANY_ID)) return;
    const enriquecido = enriquecerDealCatalogo(d, base);
    const chave = normalizarTextoChave(enriquecido._CLIENTE || "");
    if (!chave) return;
    (negociosPorEmpresa[chave] ||= []).push(enriquecido);
  });
  return negociosPorEmpresa;
}

function fmEncontrarNegocios(nomeCliente) {
  const chave = normalizarTextoChave(nomeCliente);
  if (fmState.negociosPorEmpresa[chave]) return { deals: fmState.negociosPorEmpresa[chave], tipo: "exato" };
  // fallback "contém" nos dois sentidos — nomes de planilha/Bitrix raramente batem 100%
  const candidatos = Object.entries(fmState.negociosPorEmpresa).filter(([k]) => k.includes(chave) || chave.includes(k));
  if (candidatos.length) return { deals: candidatos.flatMap(([, v]) => v), tipo: "aproximado" };
  return { deals: [], tipo: "nenhum" };
}

// ---------------------------------------------------------------------------
// Fluxo da página
// ---------------------------------------------------------------------------

function fmWebhookAtual() {
  return document.getElementById("webhook")?.value.trim() || "";
}

async function fmProcessarArquivos() {
  const input = document.getElementById("fmArquivos");
  const files = input?.files;
  if (!files || !files.length) { alert("Selecione um ou mais arquivos .html (um por vendedor) antes."); return; }
  const status = document.getElementById("fmUploadStatus");
  if (status) status.textContent = `Lendo ${files.length} arquivo(s)...`;
  const { arquivos, erros } = await fmLerArquivos(files);
  fmState.arquivos = arquivos;
  fmState.pendentes = {};
  const totalClientes = arquivos.reduce((a, f) => a + f.clientes.length, 0);
  if (status) {
    status.textContent = `${arquivos.length} arquivo(s) lido(s), ${totalClientes} cliente(s) encontrado(s) no total.` + (erros.length ? ` ${erros.length} arquivo(s) com problema (veja abaixo).` : "");
  }
  const errosEl = document.getElementById("fmUploadErros");
  if (errosEl) errosEl.innerHTML = erros.length ? erros.map((e) => `<p class="rodape-nota cockpit-aviso-forte">⚠️ ${escapeHtmlRelatorio(e)}</p>`).join("") : "";
  fmRenderTudo();
}

async function fmCruzarComBitrix() {
  const webhook = fmWebhookAtual();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  if (!fmState.arquivos.length) { alert('Carregue os arquivos de faturamento (seção acima) antes de cruzar com o Bitrix.'); return; }
  esconderErro();
  const btn = document.getElementById("fmBtnCruzar");
  if (btn) btn.disabled = true;
  fmState.carregando = true;
  atualizarStatus("Faturamento Médio: verificando campo no Bitrix...");
  try {
    const campo = await fmGarantirCampo(webhook, { criar: false });
    fmState.campo = campo;
    atualizarStatus("Faturamento Médio: buscando negócios do funil Comercial...");
    fmState.negociosPorEmpresa = await fmBuscarNegociosComercial(webhook);
    fmState.pendentes = {};
    atualizarStatus("Faturamento Médio: cruzamento concluído.");
    fmRenderTudo();
  } catch (e) {
    mostrarErro("Não foi possível cruzar com o Bitrix.\n\nDetalhe técnico: " + e.message);
  } finally {
    fmState.carregando = false;
    if (btn) btn.disabled = false;
  }
}

async function fmCriarCampoEAtualizar() {
  if (!document.getElementById("fmHabilitarEscrita")?.checked) {
    alert('Marque "Habilitar escrita no Bitrix" (card acima) antes de criar o campo.');
    return;
  }
  const webhook = fmWebhookAtual();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  esconderErro();
  const btn = document.getElementById("fmBtnCriarCampo");
  if (btn) btn.disabled = true;
  atualizarStatus('Criando campo "Faturamento Médio (3 meses)" no Bitrix...');
  try {
    fmState.campo = await fmGarantirCampo(webhook, { criar: true });
    fmRenderStatusCampo();
    atualizarStatus('Campo criado no Bitrix. Clique em "↻ Cruzar com o Bitrix" para carregar os negócios.');
  } catch (e) {
    mostrarErro('Não foi possível criar o campo no Bitrix.\n\nDetalhe técnico: ' + e.message + '\n\nConfira se o webhook de entrada tem permissão de escrita em "CRM" (inclui criação de campos personalizados).');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function fmAoMudarLimiar(valor) {
  const n = Number(valor);
  fmState.limiarPct = Number.isFinite(n) && n >= 0 && n <= 100 ? n : 85;
  fmRenderLista();
}

function fmMarcarPendente(dealId, media) {
  if (media == null) return;
  fmState.pendentes[dealId] = media;
  fmRenderBarraSalvar();
  fmRenderLista();
}

function fmDesmarcarPendente(dealId) {
  delete fmState.pendentes[dealId];
  fmRenderBarraSalvar();
  fmRenderLista();
}

function fmMarcarTodosSugeridos() {
  fmState.arquivos.forEach((arq) => arq.clientes.forEach((cli) => {
    const { media } = fmCalcularMedia(cli, fmState.limiarPct);
    if (media == null) return;
    const { deals } = fmEncontrarNegocios(cli.cliente);
    deals.forEach((d) => { fmState.pendentes[d.ID] = media; });
  }));
  fmRenderBarraSalvar();
  fmRenderLista();
}

async function fmSalvarAlteracoes() {
  if (!document.getElementById("fmHabilitarEscrita")?.checked) {
    alert('Marque "Habilitar escrita no Bitrix" (card acima) antes de salvar.');
    return;
  }
  const idsAlterados = Object.keys(fmState.pendentes);
  if (!idsAlterados.length) { alert("Nenhuma alteração pendente para salvar."); return; }
  if (!fmState.campo) { mostrarErro('Campo "Faturamento Médio (3 meses)" ainda não confirmado no Bitrix — clique em "↻ Cruzar com o Bitrix" primeiro.'); return; }
  const webhook = fmWebhookAtual();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  esconderErro();

  const tambemAtualizarValor = !!document.getElementById("fmAtualizarValorNegocio")?.checked;
  const btn = document.getElementById("fmBtnSalvar");
  if (btn) btn.disabled = true;
  let ok = 0, falha = 0;
  const falhas = [];
  for (const dealId of idsAlterados) {
    const media = fmState.pendentes[dealId];
    atualizarStatus(`Salvando faturamento médio no Bitrix... (${ok + falha + 1}/${idsAlterados.length})`);
    try {
      const fields = { [fmState.campo.fieldName]: Math.round(media * 100) / 100 };
      if (tambemAtualizarValor) fields.OPPORTUNITY = Math.round(media * 100) / 100;
      await bitrixPostJsonComRetentativa(webhook, "crm.deal.update", { id: dealId, fields });
      delete fmState.pendentes[dealId];
      ok++;
    } catch (e) {
      falha++;
      falhas.push(`#${dealId}: ${e.message}`);
    }
  }
  fmRenderTudo();
  if (btn) btn.disabled = false;
  atualizarStatus(`Faturamento médio salvo no Bitrix: ${ok} negócio(s) atualizado(s)${falha ? `, ${falha} falharam` : ""}.`);
  if (falha) {
    mostrarErro(`${falha} negócio(s) não foram atualizados no Bitrix. Confira se o webhook tem permissão de escrita em CRM (Negócios) e tente salvar de novo.\n\n` + falhas.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function fmRenderStatusCampo() {
  const el = document.getElementById("fmStatusCampo");
  if (!el) return;
  if (fmState.campo) {
    el.innerHTML = `<p class="rodape-nota" style="color:var(--ok);">✅ Campo <strong>"Faturamento Médio (3 meses)"</strong> (${escapeHtmlRelatorio(fmState.campo.fieldName)}) confirmado no Bitrix.</p>`;
    document.getElementById("fmBtnCriarCampo")?.classList.add("oculto");
  } else {
    el.innerHTML = `<p class="rodape-nota cockpit-aviso-forte">⚠️ O campo "Faturamento Médio (3 meses)" ainda não existe neste Bitrix. Marque "Habilitar escrita no Bitrix" e clique em "💰 Criar campo no Bitrix" para criá-lo.</p>`;
    document.getElementById("fmBtnCriarCampo")?.classList.remove("oculto");
  }
}

function fmLinhaClienteHTML(cliente) {
  const { media, pertoDoContrato, rotuloJanela, amostraMeses } = fmCalcularMedia(cliente, fmState.limiarPct);
  const { deals, tipo } = fmEncontrarNegocios(cliente.cliente);
  const badgeTipo = tipo === "exato" ? "" : tipo === "aproximado" ? ` <span class="badge-relatorio alerta" title="Nome não bateu exato — confira antes de aplicar">nome aproximado</span>` : ` <span class="badge-relatorio alerta">sem negócio no Bitrix</span>`;
  const negociosHTML = deals.length
    ? deals.map((d) => {
        const pendente = fmState.pendentes[d.ID];
        return `<div class="fm-negocio-linha">
          <div><strong>${escapeHtmlRelatorio(d._CLIENTE)}</strong> <span class="rodape-nota" style="margin:0;">#${escapeHtmlRelatorio(d.ID)} · ${escapeHtmlRelatorio(d._ESTAGIO)} · valor atual ${moedaRelatorio(d._VALOR)}</span></div>
          ${media != null ? (pendente != null
            ? `<button type="button" class="secundario" onclick="fmDesmarcarPendente('${d.ID}')">✓ Marcado (${moedaRelatorio(pendente)}) — desmarcar</button>`
            : `<button type="button" class="secundario" onclick="fmMarcarPendente('${d.ID}', ${media})">Aplicar média (${moedaRelatorio(media)})</button>`)
            : `<span class="rodape-nota" style="margin:0;">Sem meses suficientes pra calcular</span>`}
        </div>`;
      }).join("")
    : "";
  return `<div class="fm-cliente-card">
    <div class="fm-cliente-topo">
      <strong>${escapeHtmlRelatorio(cliente.cliente)}</strong>${badgeTipo}
      <span class="rodape-nota" style="margin:0;">Vendedor: ${escapeHtmlRelatorio(cliente.vendedor)}</span>
    </div>
    <div class="fm-item-stats">
      <div class="tl-mini-stat"><span class="tl-mini-label">Valor fechado</span><span class="tl-mini-valor">${cliente.vendas != null ? moedaRelatorio(cliente.vendas) : "—"}</span></div>
      <div class="tl-mini-stat"><span class="tl-mini-label">Mês 1 faturado</span><span class="tl-mini-valor">${cliente.meses[0] != null ? moedaRelatorio(cliente.meses[0]) : "—"}</span></div>
      <div class="tl-mini-stat"><span class="tl-mini-label">Janela usada</span><span class="tl-mini-valor" style="font-size:11.5px;">${escapeHtmlRelatorio(rotuloJanela)} (${amostraMeses}/3)</span></div>
      <div class="tl-mini-stat"><span class="tl-mini-label">Média calculada</span><span class="tl-mini-valor">${media != null ? moedaRelatorio(media) : "—"}</span></div>
    </div>
    ${negociosHTML}
  </div>`;
}

function fmRenderLista() {
  const cont = document.getElementById("fmLista");
  if (!cont) return;
  if (!fmState.arquivos.length) {
    cont.innerHTML = `<p class="rodape-nota">Carregue os arquivos de faturamento acima pra ver a lista de clientes.</p>`;
    return;
  }
  const cards = fmState.arquivos.flatMap((arq) => arq.clientes).map(fmLinhaClienteHTML).join("");
  cont.innerHTML = cards;
}

function fmRenderBarraSalvar() {
  const el = document.getElementById("fmBarraSalvar");
  if (!el) return;
  const n = Object.keys(fmState.pendentes).length;
  const contagem = el.querySelector("#fmContagemPendente");
  const btn = el.querySelector("#fmBtnSalvar");
  if (contagem) contagem.textContent = n ? `${n} negócio(s) pendente(s) de salvar` : "Nenhuma alteração pendente";
  if (btn) btn.disabled = !n;
}

function fmRenderTudo() {
  fmRenderStatusCampo();
  fmRenderLista();
  fmRenderBarraSalvar();
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

function fmIniciarPagina() {
  if (!document.getElementById("fmLista")) return; // só roda na página dedicada
  const campoWebhook = document.getElementById("webhook");
  if (campoWebhook && typeof obterWebhookSalvo === "function") {
    const salvo = obterWebhookSalvo();
    if (salvo) campoWebhook.value = salvo;
  }
  fmRenderTudo();
}
