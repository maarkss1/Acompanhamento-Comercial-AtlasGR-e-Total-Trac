// ---------------------------------------------------------------------------
// Acompanhamento do Pipeline Financeiro — "Análise de Documentos" e
// "Aguardando Assinatura de Contrato" (funil Financeiro, ver config.js).
//
// Objetivo: extrair os negócios parados nesses dois estágios, deixá-los
// salvos localmente (localStorage, por empresa — mesmo padrão de
// js/financeiro.js) para acompanhamento contínuo (mesmo depois de fechar o
// navegador), permitir registrar o motivo apurado com o vendedor responsável
// (comentário) e criar, direto daqui, uma tarefa no Bitrix cobrando resposta
// do vendedor — sem precisar abrir o Bitrix. Também gera um relatório
// agrupado por vendedor para repassar ao CEO.
//
// Os estágios são localizados por NOME (normalizado), não por STAGE_ID fixo
// — mesmo padrão já usado por encontrarCategoriasPorPalavras/enriquecerDealCatalogo
// (js/jornada.js, js/catalogo-relatorios.js): mais robusto a mudanças no
// Bitrix do que hardcodar o código do estágio.
// ---------------------------------------------------------------------------

const PFA_ESTAGIOS_ALVO = [
  { chave: "documentos", label: "Análise de Documentos", icone: "📄", chaveNormalizada: "analise de documentos" },
  { chave: "assinatura", label: "Aguardando Assinatura de Contrato", icone: "✍️", chaveNormalizada: "aguardando assinatura de contrato" },
];

const pfaState = {
  itens: [],
  carregando: false,
  ultimaAtualizacao: null,
  webhookDominio: "",
  filtroEstagio: null, // null = todos | "documentos" | "assinatura"
  filtroStatus: "aberto", // "aberto" | "resolvido" | "todos"
  resumoFechados: { assinados: { qtd: 0, valor: 0 }, cancelados: { qtd: 0, valor: 0 } },
};

function pfaChaveStorage() {
  return "atlas-extrator-acompanhamento-pipeline-financeiro" + (typeof getSufixoEmpresaFinanceiro === "function" ? getSufixoEmpresaFinanceiro() : "");
}

function pfaCarregarSalvos() {
  try {
    const dados = localStorage.getItem(pfaChaveStorage());
    return dados ? JSON.parse(dados) : [];
  } catch (e) {
    console.error("Erro ao ler acompanhamento do Pipeline Financeiro:", e);
    return [];
  }
}

function pfaSalvarTudo(lista) {
  try {
    localStorage.setItem(pfaChaveStorage(), JSON.stringify(lista));
  } catch (e) {
    console.error("Erro ao salvar acompanhamento do Pipeline Financeiro:", e);
    alert("Não foi possível salvar a lista de acompanhamento. O armazenamento local pode estar cheio.");
  }
}

// ---------------------------------------------------------------------------
// Busca no Bitrix
// ---------------------------------------------------------------------------

async function pfaBuscarNegociosAlvo(webhook) {
  const [meta] = await Promise.all([buscarMetadadosFunisEEstagios(webhook), buscarUsuariosJornada(webhook)]);
  // "financeiro" também casa com "Financeiro - Reembolsos" (categoria com maior
  // volume de negócios da conta, ~1200) — sem excluir isso aqui, cada
  // "Atualizar do Bitrix" baixava esses ~1200 negócios à toa (nenhum deles tem
  // estágio "Análise de Documentos"/"Aguardando Assinatura de Contrato", então
  // eram todos descartados no final), deixando a atualização lenta a ponto de
  // parecer travada/quebrada.
  const cats = encontrarCategoriasPorPalavras(meta, ["financeiro"], false)
    .filter((id) => !normalizarTextoChave(meta.categorias?.[id]).includes("reembolso"));
  if (!cats.length) {
    throw new Error('Não encontrei nenhum funil "Financeiro" neste Bitrix (crm.category.list). Confira se o pipeline existe e se o webhook tem permissão de leitura em CRM.');
  }
  const filtro = cats.length === 1 ? { CATEGORY_ID: cats[0] } : { "@CATEGORY_ID": cats };
  const campos = [
    "ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "STAGE_SEMANTIC_ID", "OPPORTUNITY", "CURRENCY_ID",
    "ASSIGNED_BY_ID", "COMPANY_ID", "CONTACT_ID", "DATE_CREATE", "DATE_MODIFY", "MOVED_TIME",
  ];
  const busca = await listarCompletoRelatorio(webhook, "crm.deal.list", campos, filtro, { ID: "ASC" }, "Acompanhamento Financeiro: buscando negócios...");
  const idsEmpresa = [...new Set(busca.dados.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  const empresas = await buscarEntidadesPorIds(webhook, "crm.company.list", idsEmpresa, ["ID", "TITLE"]);
  const base = { meta, empresas };

  const encontrados = [];
  // "Contrato Assinado"/"Contrato Cancelado" (WON/LOSE do funil Financeiro) só
  // viram contagem informativa (sem virar item da lista acionável de
  // comentário/tarefa — negócio já fechado não tem "motivo de estar parado"
  // pra apurar) — vêm do mesmo lote já buscado acima, sem chamada extra ao Bitrix.
  const resumoFechados = { assinados: { qtd: 0, valor: 0 }, cancelados: { qtd: 0, valor: 0 } };
  busca.dados.forEach((d) => {
    const enriquecido = enriquecerDealCatalogo(d, base);
    const cfg = PFA_ESTAGIOS_ALVO.find((e) => normalizarTextoChave(enriquecido._ESTAGIO) === e.chaveNormalizada);
    if (cfg) { encontrados.push({ deal: enriquecido, estagioChave: cfg.chave, estagioLabel: cfg.label }); return; }
    if (enriquecido._SEMANTICA === "success") { resumoFechados.assinados.qtd++; resumoFechados.assinados.valor += enriquecido._VALOR; }
    else if (enriquecido._SEMANTICA === "failure") { resumoFechados.cancelados.qtd++; resumoFechados.cancelados.valor += enriquecido._VALOR; }
  });
  return { encontrados, resumoFechados };
}

function pfaDiasParado(d) {
  const dataRef = parteDataISO(d.MOVED_TIME) || parteDataISO(d.DATE_MODIFY) || parteDataISO(d.DATE_CREATE);
  if (!dataRef) return null;
  const dias = diferencaDiasBrutaAteReferencia(dataRef, formatarDataISO(new Date()));
  return typeof dias === "number" ? Math.max(0, dias) : null;
}

async function pfaAtualizarDoBitrix() {
  const campoWebhook = document.getElementById("webhook");
  const webhook = (campoWebhook?.value || "").trim();
  const erroWebhook = validarWebhook(webhook);
  if (erroWebhook) {
    mostrarErro(erroWebhook);
    return;
  }
  esconderErro();
  const btn = document.getElementById("pfaBtnAtualizar");
  if (btn) btn.disabled = true;
  pfaState.carregando = true;
  atualizarStatus("Acompanhamento Financeiro: conectando ao Bitrix...");
  try {
    const { encontrados, resumoFechados } = await pfaBuscarNegociosAlvo(webhook);
    pfaState.resumoFechados = resumoFechados;
    const salvos = pfaCarregarSalvos();
    const porId = new Map(salvos.map((it) => [String(it.negocioId), it]));
    const encontradosIds = new Set();
    const agoraISO = new Date().toISOString();

    encontrados.forEach(({ deal: d, estagioChave, estagioLabel }) => {
      const id = String(d.ID);
      encontradosIds.add(id);
      const diasParado = pfaDiasParado(d);
      const existente = porId.get(id);
      if (existente) {
        existente.cliente = d._CLIENTE || existente.cliente;
        existente.vendedorId = idBitrixString(d.ASSIGNED_BY_ID);
        existente.vendedorNome = d._RESPONSAVEL || existente.vendedorNome;
        existente.estagioChave = estagioChave;
        existente.estagioLabel = estagioLabel;
        existente.categoriaId = String(d.CATEGORY_ID || "");
        existente.valor = d._VALOR;
        existente.moeda = d.CURRENCY_ID || "BRL";
        existente.diasParado = diasParado;
        existente.aindaNoEstagio = true;
        existente.dataAtualizacao = agoraISO;
      } else {
        porId.set(id, {
          idInterno: crypto.randomUUID(),
          negocioId: id,
          cliente: d._CLIENTE || d.TITLE || `Negócio ${id}`,
          vendedorId: idBitrixString(d.ASSIGNED_BY_ID),
          vendedorNome: d._RESPONSAVEL || "Sem responsável",
          estagioChave,
          estagioLabel,
          categoriaId: String(d.CATEGORY_ID || ""),
          valor: d._VALOR,
          moeda: d.CURRENCY_ID || "BRL",
          diasParado,
          aindaNoEstagio: true,
          status: "aberto",
          comentario: "",
          tarefa: null,
          dataExtracao: agoraISO,
          dataAtualizacao: agoraISO,
        });
      }
    });

    // Não remove quem saiu do estágio (o negócio avançou/voltou) — mantém o
    // registro para o histórico/relatório, só sinaliza que não está mais lá.
    salvos.forEach((it) => {
      if (!encontradosIds.has(String(it.negocioId))) it.aindaNoEstagio = false;
    });

    const listaFinal = [...porId.values()];
    pfaSalvarTudo(listaFinal);
    pfaState.itens = listaFinal;
    pfaState.ultimaAtualizacao = new Date();
    pfaState.webhookDominio = extrairDominioWebhook(webhook);
    pfaRender();
    atualizarStatus(`Acompanhamento Financeiro atualizado: ${encontrados.length} negócio(s) encontrados agora em "Análise de Documentos" ou "Aguardando Assinatura de Contrato".`);
  } catch (e) {
    mostrarErro("Não foi possível atualizar a lista de acompanhamento.\n\nDetalhe técnico: " + e.message);
  } finally {
    pfaState.carregando = false;
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function pfaLinkNegocio(it) {
  const webhook = document.getElementById("webhook")?.value?.trim() || "";
  const dominio = pfaState.webhookDominio || extrairDominioWebhook(webhook);
  return dominio ? `https://${dominio}/crm/deal/details/${encodeURIComponent(it.negocioId)}/` : "";
}

function pfaContarPorEstagio() {
  const contagem = {};
  PFA_ESTAGIOS_ALVO.forEach((e) => (contagem[e.chave] = { qtd: 0, valor: 0 }));
  pfaState.itens.filter((it) => it.status === "aberto" && it.aindaNoEstagio).forEach((it) => {
    if (!contagem[it.estagioChave]) contagem[it.estagioChave] = { qtd: 0, valor: 0 };
    contagem[it.estagioChave].qtd++;
    contagem[it.estagioChave].valor += Number(it.valor) || 0;
  });
  return contagem;
}

function pfaRenderCards() {
  const cont = document.getElementById("pfaCards");
  if (!cont) return;
  const contagem = pfaContarPorEstagio();
  const acionaveis = PFA_ESTAGIOS_ALVO.map((e) => {
    const c = contagem[e.chave] || { qtd: 0, valor: 0 };
    const ativo = pfaState.filtroEstagio === e.chave ? " pfa-kpi-ativo" : "";
    return `<div class="cockpit-kpi pfa-kpi cockpit-kpi-clicavel${ativo}" onclick="pfaFiltrarEstagio('${e.chave}')">
      <span class="valor">${c.qtd}</span>
      <span class="rotulo">${e.icone} ${escapeHtmlRelatorio(e.label)}</span>
      <div class="pfa-kpi-sub">${moedaRelatorio(c.valor)} em aberto</div>
    </div>`;
  }).join("");
  // Assinado/Cancelado são só informativos (negócio já fechado, sem
  // comentário/tarefa) — por isso não são clicáveis nem entram no filtro.
  const rf = pfaState.resumoFechados;
  const fechados = `<div class="cockpit-kpi pfa-kpi">
      <span class="valor">${rf.assinados.qtd}</span>
      <span class="rotulo">✅ Contrato Assinado</span>
      <div class="pfa-kpi-sub">${moedaRelatorio(rf.assinados.valor)}</div>
    </div><div class="cockpit-kpi pfa-kpi">
      <span class="valor">${rf.cancelados.qtd}</span>
      <span class="rotulo">🚫 Contrato Cancelado</span>
      <div class="pfa-kpi-sub">${moedaRelatorio(rf.cancelados.valor)}</div>
    </div>`;
  cont.innerHTML = acionaveis + fechados;
}

function pfaItensFiltrados() {
  let itens = pfaState.itens;
  if (pfaState.filtroEstagio) itens = itens.filter((it) => it.estagioChave === pfaState.filtroEstagio);
  if (pfaState.filtroStatus === "aberto") itens = itens.filter((it) => it.status === "aberto");
  else if (pfaState.filtroStatus === "resolvido") itens = itens.filter((it) => it.status === "resolvido");
  return itens;
}

function pfaSituacaoBadgeHTML(it) {
  if (!it.aindaNoEstagio) return `<span class="badge-relatorio ok">Saiu do estágio</span>`;
  if (it.status === "resolvido") return `<span class="badge-relatorio ok">Resolvido</span>`;
  return `<span class="badge-relatorio alerta">Em aberto</span>`;
}

function pfaLinhaHTML(it) {
  const linkNegocio = pfaLinkNegocio(it);
  const tarefaHTML = it.tarefa
    ? `<div class="pfa-tarefa-ok">✅ Tarefa ${it.tarefa.url ? `<a href="${it.tarefa.url}" target="_blank" rel="noopener noreferrer">#${escapeHtmlRelatorio(it.tarefa.id)}</a>` : `#${escapeHtmlRelatorio(it.tarefa.id)}`} criada em ${formatarDataHoraBR(it.tarefa.criadaEm)} para ${escapeHtmlRelatorio(it.vendedorNome || "")}.</div>`
    : `<button type="button" class="secundario" onclick="pfaAbrirFormTarefa('${it.idInterno}')"${it.vendedorId ? "" : ' disabled title="Este negócio não tem responsável válido no Bitrix"'}>📌 Criar tarefa no Bitrix</button>
       <div class="oculto pfa-form-tarefa" id="pfaFormTarefa_${it.idInterno}"></div>`;

  return `<div class="pfa-linha" id="pfaLinha_${it.idInterno}">
    <div class="pfa-linha-topo">
      <div>
        <strong>${escapeHtmlRelatorio(it.cliente)}</strong>
        ${linkNegocio ? `<a href="${linkNegocio}" target="_blank" rel="noopener noreferrer" class="pfa-link-negocio">Abrir negócio no Bitrix ↗</a>` : ""}
        <div class="rodape-nota" style="margin-top:2px;">${escapeHtmlRelatorio(it.estagioLabel)} · ${it.diasParado != null ? `${it.diasParado} dia(s) parado` : "sem data de referência"} · ${moedaRelatorio(it.valor)}</div>
      </div>
      <div>${pfaSituacaoBadgeHTML(it)}</div>
    </div>
    <label for="pfaComentario_${it.idInterno}" style="margin-top:8px;">Comentário (motivo apurado com o vendedor)</label>
    <textarea id="pfaComentario_${it.idInterno}" rows="2" placeholder="Ex: cliente pediu prazo até dia 10 para enviar os documentos societários." onchange="pfaSalvarComentario('${it.idInterno}', this.value)">${escapeHtmlRelatorio(it.comentario)}</textarea>
    <div class="pfa-linha-acoes">
      <button type="button" class="secundario" onclick="pfaAlternarStatus('${it.idInterno}')">${it.status === "resolvido" ? "↺ Reabrir" : "✔️ Marcar resolvido"}</button>
      ${tarefaHTML}
    </div>
  </div>`;
}

function pfaRenderTabela() {
  const cont = document.getElementById("pfaListaPorVendedor");
  if (!cont) return;
  const itens = pfaItensFiltrados();
  if (!itens.length) {
    cont.innerHTML = pfaState.itens.length
      ? `<p class="rodape-nota">Nenhum negócio para este filtro.</p>`
      : `<p class="rodape-nota">Nenhum dado ainda — clique em "↻ Atualizar do Bitrix" acima.</p>`;
    return;
  }
  const porVendedor = {};
  itens.forEach((it) => {
    const chave = it.vendedorNome || "Sem responsável";
    (porVendedor[chave] ||= []).push(it);
  });
  const nomes = Object.keys(porVendedor).sort((a, b) => a.localeCompare(b, "pt-BR"));
  cont.innerHTML = nomes.map((nome) => {
    const lista = porVendedor[nome].slice().sort((a, b) => (b.diasParado || 0) - (a.diasParado || 0));
    const valorTotal = lista.reduce((s, it) => s + (Number(it.valor) || 0), 0);
    const linhas = lista.map(pfaLinhaHTML).join("");
    return `<details class="vcard section-card" open>
      <summary><span class="vcard-name">👤 ${escapeHtmlRelatorio(nome)}</span><span class="vcard-stats">${lista.length} negócio(s) · ${moedaRelatorio(valorTotal)}</span><span class="vcard-chevron">▾</span></summary>
      <div class="vcard-body">${linhas}</div>
    </details>`;
  }).join("");
}

function pfaRenderStatus() {
  const el = document.getElementById("pfaUltimaAtualizacao");
  if (!el) return;
  el.textContent = pfaState.ultimaAtualizacao
    ? `Última atualização do Bitrix: ${pfaState.ultimaAtualizacao.toLocaleString("pt-BR")}.`
    : "Ainda não atualizado nesta sessão — a lista abaixo (se houver) é a última salva neste navegador.";
}

function pfaRender() {
  pfaRenderCards();
  pfaRenderTabela();
  pfaRenderStatus();
}

function pfaFiltrarEstagio(chave) {
  pfaState.filtroEstagio = pfaState.filtroEstagio === chave ? null : chave;
  pfaRender();
  document.getElementById("pfa-bloco-lista")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pfaAoTrocarFiltroStatus() {
  pfaState.filtroStatus = document.getElementById("pfaFiltroStatus")?.value || "aberto";
  pfaRender();
}

function pfaSalvarComentario(idInterno, valor) {
  const it = pfaState.itens.find((x) => x.idInterno === idInterno);
  if (!it) return;
  it.comentario = valor;
  it.dataAlteracao = new Date().toISOString();
  pfaSalvarTudo(pfaState.itens);
}

function pfaAlternarStatus(idInterno) {
  const it = pfaState.itens.find((x) => x.idInterno === idInterno);
  if (!it) return;
  it.status = it.status === "resolvido" ? "aberto" : "resolvido";
  it.dataAlteracao = new Date().toISOString();
  pfaSalvarTudo(pfaState.itens);
  pfaRender();
}

// ---------------------------------------------------------------------------
// Criação de tarefa no Bitrix (tasks.task.add) — escrita real no CRM.
// Só executa se a "Habilitar criação de tarefas no Bitrix" estiver marcada
// (mesmo princípio de opt-in explícito já usado pelo Sync — ver
// js/ui.js:executarSyncBitrix — mas aqui como um único toggle de página, já
// que a ação em si é sempre a mesma: criar 1 tarefa para 1 negócio).
// ---------------------------------------------------------------------------

function pfaDescricaoTarefaPadrao(it) {
  const linkNegocio = pfaLinkNegocio(it);
  const linhas = [
    `Negócio "${it.cliente}" está parado em "${it.estagioLabel}" há ${it.diasParado != null ? it.diasParado + " dia(s)" : "um período não determinado"}.`,
    linkNegocio ? `Link do negócio: ${linkNegocio}` : "",
    it.comentario ? `Contexto já levantado: ${it.comentario}` : "",
    "",
    "Por favor, responda nesta tarefa: qual o motivo do negócio estar parado e qual a previsão de resolução?",
  ];
  return linhas.filter((l) => l !== "").join("\n");
}

function pfaAbrirFormTarefa(idInterno) {
  const it = pfaState.itens.find((x) => x.idInterno === idInterno);
  if (!it) return;
  const box = document.getElementById(`pfaFormTarefa_${idInterno}`);
  if (!box) return;
  if (!box.classList.contains("oculto")) {
    box.classList.add("oculto");
    box.innerHTML = "";
    return;
  }
  const tituloPadrao = `Pipeline Financeiro parado — ${it.cliente} (${it.estagioLabel})`;
  box.innerHTML = `
    <label for="pfaTarefaTitulo_${idInterno}">Título da tarefa</label>
    <input type="text" id="pfaTarefaTitulo_${idInterno}" value="${escapeHtmlRelatorio(tituloPadrao)}">
    <label for="pfaTarefaDescricao_${idInterno}">Descrição</label>
    <textarea id="pfaTarefaDescricao_${idInterno}" rows="5">${escapeHtmlRelatorio(pfaDescricaoTarefaPadrao(it))}</textarea>
    <label for="pfaTarefaPrazo_${idInterno}">Prazo (opcional)</label>
    <input type="date" id="pfaTarefaPrazo_${idInterno}">
    <div class="row" style="margin-top:8px;">
      <button type="button" class="primario" onclick="pfaCriarTarefa('${idInterno}')">Criar tarefa no Bitrix</button>
      <button type="button" class="secundario" onclick="pfaAbrirFormTarefa('${idInterno}')">Cancelar</button>
    </div>
    <p class="rodape-nota" id="pfaTarefaStatus_${idInterno}"></p>
  `;
  box.classList.remove("oculto");
}

async function pfaCriarTarefa(idInterno) {
  const it = pfaState.itens.find((x) => x.idInterno === idInterno);
  if (!it) return;
  const statusEl = document.getElementById(`pfaTarefaStatus_${idInterno}`);

  if (!document.getElementById("pfaHabilitarEscrita")?.checked) {
    if (statusEl) statusEl.textContent = 'Marque "Habilitar criação de tarefas no Bitrix" no topo da página antes de criar tarefas.';
    return;
  }
  if (!it.vendedorId) {
    if (statusEl) statusEl.textContent = "Este negócio não tem um responsável válido no Bitrix — não é possível atribuir a tarefa.";
    return;
  }
  const webhook = document.getElementById("webhook")?.value?.trim() || "";
  const erro = validarWebhook(webhook);
  if (erro) {
    mostrarErro(erro);
    return;
  }
  const titulo = document.getElementById(`pfaTarefaTitulo_${idInterno}`)?.value.trim();
  const descricao = document.getElementById(`pfaTarefaDescricao_${idInterno}`)?.value.trim();
  const prazo = document.getElementById(`pfaTarefaPrazo_${idInterno}`)?.value;
  if (!titulo) {
    if (statusEl) statusEl.textContent = "Preencha o título da tarefa.";
    return;
  }

  if (statusEl) statusEl.textContent = "Criando tarefa no Bitrix...";
  try {
    const fields = {
      TITLE: titulo,
      DESCRIPTION: descricao || "",
      RESPONSIBLE_ID: Number(it.vendedorId),
      UF_CRM_TASK: [`D_${it.negocioId}`],
    };
    if (prazo) fields.DEADLINE = `${prazo}T18:00:00`;
    const body = await bitrixPostJsonComRetentativa(webhook, "tasks.task.add", { fields });
    const taskId = body?.result?.task?.id || body?.result?.id;
    if (!taskId) throw new Error("O Bitrix não retornou o ID da tarefa criada. Confira se o webhook tem permissão de escrita no módulo Tarefas.");
    const dominio = pfaState.webhookDominio || extrairDominioWebhook(webhook);
    it.tarefa = {
      id: String(taskId),
      criadaEm: new Date().toISOString(),
      url: dominio ? `https://${dominio}/company/personal/user/${it.vendedorId}/tasks/task/view/${taskId}/` : "",
      titulo,
      descricao,
    };
    it.dataAlteracao = new Date().toISOString();
    pfaSalvarTudo(pfaState.itens);
    pfaRender();
    atualizarStatus(`Tarefa #${taskId} criada no Bitrix para ${it.vendedorNome}.`);
  } catch (e) {
    if (statusEl) statusEl.textContent = "Falha ao criar a tarefa: " + e.message;
    mostrarErro('Não foi possível criar a tarefa no Bitrix.\n\nDetalhe técnico: ' + e.message + '\n\nConfira se o webhook de entrada tem permissão de escrita no módulo "Tarefas" (Task) no Bitrix24.');
  }
}

// ---------------------------------------------------------------------------
// Relatório para o CEO — HTML autônomo, agrupado por vendedor (mesmo modelo
// visual do Cockpit — ver cockpitGerarHTMLExport em js/cockpit.js).
// ---------------------------------------------------------------------------

function pfaGerarRelatorioHTML() {
  const marca = marcaAtiva();
  const agora = new Date();
  const carimbo = formatarDataBR(formatarDataISO(agora)) + " " + String(agora.getHours()).padStart(2, "0") + ":" + String(agora.getMinutes()).padStart(2, "0");
  const abertos = pfaState.itens.filter((it) => it.status === "aberto" && it.aindaNoEstagio);
  const contagem = pfaContarPorEstagio();
  const comComentario = abertos.filter((it) => it.comentario && it.comentario.trim()).length;
  const comTarefa = abertos.filter((it) => it.tarefa).length;
  const valorTotal = abertos.reduce((s, it) => s + (Number(it.valor) || 0), 0);

  const kpis = PFA_ESTAGIOS_ALVO.map((e) => kpiCardHtml(`${e.icone} ${e.label}`, contagem[e.chave]?.qtd || 0, null)).join("")
    + kpiCardHtml("Valor total parado", moedaRelatorio(valorTotal), null)
    + kpiCardHtml("Com motivo já apurado", `${comComentario} / ${abertos.length}`, null)
    + kpiCardHtml("Com tarefa criada no Bitrix", `${comTarefa} / ${abertos.length}`, null);

  const porVendedor = {};
  abertos.forEach((it) => (porVendedor[it.vendedorNome || "Sem responsável"] ||= []).push(it));
  const nomes = Object.keys(porVendedor).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const secoesVendedor = nomes.map((nome) => {
    const lista = porVendedor[nome].slice().sort((a, b) => (b.diasParado || 0) - (a.diasParado || 0));
    const valorVendedor = lista.reduce((s, it) => s + (Number(it.valor) || 0), 0);
    const linhas = lista.map((it) => `<tr>
      <td>${escapeHtmlRelatorio(it.cliente)}</td>
      <td>${escapeHtmlRelatorio(it.estagioLabel)}</td>
      <td>${it.diasParado != null ? it.diasParado : "—"}</td>
      <td>${moedaRelatorio(it.valor)}</td>
      <td>${escapeHtmlRelatorio(it.comentario || "— sem motivo registrado ainda —")}</td>
      <td>${it.tarefa ? `Sim (#${escapeHtmlRelatorio(it.tarefa.id)})` : "Não"}</td>
    </tr>`).join("");
    return `<h2 class="section">${escapeHtmlRelatorio(nome)} <span style="font-weight:400;font-size:.6em;">— ${lista.length} negócio(s) · ${moedaRelatorio(valorVendedor)}</span></h2>
      <table><thead><tr><th>Cliente</th><th>Estágio</th><th>Dias parado</th><th>Valor</th><th>Comentário</th><th>Tarefa criada</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }).join("");

  const titulo = "Pipeline Financeiro Parado — Documentos & Assinatura de Contrato";
  const corpo = `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">${escapeHtmlRelatorio(titulo)}</h2>` +
    `<p class="section-sub">Negócios do funil Financeiro parados em "Análise de Documentos" ou "Aguardando Assinatura de Contrato", agrupados por vendedor responsável, com o motivo apurado (quando já levantado) e o status da tarefa cobrando retorno no Bitrix.</p></div>` +
    `<div class="kpis">${kpis}</div>` +
    (secoesVendedor || `<p class="small-note">Nenhum negócio em aberto nestes estágios no momento.</p>`) +
    `</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlRelatorio(titulo)} — ${escapeHtmlRelatorio(marca.nome)}</title><style>${modeloExecutivoCssParaMarca(marca)}</style></head><body>` +
    `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${marca.logoSvg}<div class="letterhead-divider"></div><div class="letterhead-tagline">${escapeHtmlRelatorio(marca.tagline)}</div></div><div class="letterhead-ref"><strong>${escapeHtmlRelatorio(titulo)}</strong><br>Gerado em ${carimbo}</div></div></div>` +
    `<header class="hero"><div class="hero-inner"><p class="eyebrow">Acompanhamento Comercial · Bitrix24</p><h1>${escapeHtmlRelatorio(titulo)}</h1></div></header>` +
    corpo +
    `<footer><div class="footer-brand">${marca.logoSvg}<span>${escapeHtmlRelatorio(marca.nome)}</span></div>${escapeHtmlRelatorio(marca.nome)} · gerado em ${carimbo} · nenhum webhook/credencial incluído neste arquivo.</footer>` +
    `</body></html>`;
}

function pfaAbrirRelatorio() {
  if (!pfaState.itens.length) {
    alert('Clique em "↻ Atualizar do Bitrix" antes de gerar o relatório.');
    return;
  }
  mostrarRelatorioVisualInline(pfaGerarRelatorioHTML(), "Pipeline Financeiro Parado");
}

function pfaBaixarRelatorio() {
  if (!pfaState.itens.length) {
    alert('Clique em "↻ Atualizar do Bitrix" antes de gerar o relatório.');
    return;
  }
  baixarArquivo(pfaGerarRelatorioHTML(), `pipeline_financeiro_parado_${dataHoje()}.html`, "text/html;charset=utf-8;");
}

// ---------------------------------------------------------------------------
// Inicialização da página
// ---------------------------------------------------------------------------

function pfaIniciarPagina() {
  if (!document.getElementById("pfaCards")) return; // só roda na página dedicada
  const campoWebhook = document.getElementById("webhook");
  if (campoWebhook && typeof obterWebhookSalvo === "function") {
    const salvo = obterWebhookSalvo();
    if (salvo) campoWebhook.value = salvo;
  }
  pfaState.itens = pfaCarregarSalvos();
  pfaState.webhookDominio = extrairDominioWebhook(campoWebhook?.value || "");
  pfaRender();
}
